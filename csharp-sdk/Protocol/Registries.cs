using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// S46 — Consolidated Registries: Methods, Errors, <c>_meta</c> Keys, Capabilities, and Types
/// (spec Appendices A–E).
/// </summary>
/// <remarks>
/// <para>
/// The capstone reference artifact: five authoritative, document-wide tables that enumerate the wire
/// surface defined across the whole specification, each row pointing to the section that normatively
/// specifies the entry. These appendices define no new wire types — they are a consolidation, and the
/// cited section remains normative.
/// </para>
/// <para>
/// The error-code registry (Appendix B) is reproduced here as queryable data
/// (<see cref="Registries.ErrorCodeRegistry"/>, <see cref="Registries.ReservedErrorCodes"/>,
/// <see cref="Registries.ServerErrorRange"/>) together with the custom-code collision validators,
/// because the C# SDK exposes the codes only as constants in
/// <see cref="Stackific.Mcp.JsonRpc.ErrorCodes"/> and has no registry-as-data equivalent.
/// </para>
/// </remarks>
public static class Registries
{
  // ─── Appendix B — Error Code Registry (reproduced as data) ──────────────────────

  /// <summary>The legacy <c>-32002</c> resource-not-found code, listed in the registry for collision checks (spec §17.6 / Appendix B).</summary>
  public const int ResourceNotFoundCode = -32002;

  /// <summary>
  /// Appendix B / §22 Error Code Registry as data: every code this document defines, mapped to a
  /// one-line description. A custom code MUST NOT equal any key here (R-AppB-a).
  /// </summary>
  public static IReadOnlyDictionary<int, string> ErrorCodeRegistry { get; } =
    new Dictionary<int, string>
    {
      [ErrorCodes.ParseError] = "Parse error: invalid JSON was received.",
      [ErrorCodes.InvalidRequest] = "Invalid Request: not a valid JSON-RPC request object.",
      [ErrorCodes.MethodNotFound] = "Method not found, or gated behind an unadvertised capability.",
      [ErrorCodes.InvalidParams] = "Invalid params: the method's parameters are invalid or malformed.",
      [ErrorCodes.InternalError] = "Internal error: an unexpected error prevented fulfilment.",
      [ErrorCodes.HeaderMismatch] = "HeaderMismatch: a routing-header value does not match the body.",
      [ResourceNotFoundCode] = "ResourceNotFound: a requested resource URI was not found.",
      [ErrorCodes.MissingRequiredClientCapability] = "MissingRequiredClientCapability: a required client capability was not declared.",
      [ErrorCodes.UnsupportedProtocolVersion] = "UnsupportedProtocolVersion: no mutually supported protocol revision.",
    };

  /// <summary>
  /// The eight codes a custom code MUST NOT collide with: the five standard JSON-RPC codes, the two
  /// protocol codes, and <c>-32001</c> HeaderMismatch (spec R-AppB-a). <c>-32001</c> is the member that
  /// lies inside the <c>-32000..-32099</c> server-error range.
  /// </summary>
  public static IReadOnlyList<int> ReservedErrorCodes { get; } =
  [
    ErrorCodes.ParseError,
    ErrorCodes.InvalidRequest,
    ErrorCodes.MethodNotFound,
    ErrorCodes.InvalidParams,
    ErrorCodes.InternalError,
    ErrorCodes.HeaderMismatch,
    ErrorCodes.MissingRequiredClientCapability,
    ErrorCodes.UnsupportedProtocolVersion,
  ];

  /// <summary>
  /// The bounds of the reserved server-error range <c>-32000..-32099</c> within which implementations
  /// MAY define additional codes, avoiding collision with the <c>-32001</c> HeaderMismatch code already
  /// placed there (spec R-AppB-b, AC-46.2).
  /// </summary>
  /// <param name="Min">The inclusive minimum (<c>-32099</c>).</param>
  /// <param name="Max">The inclusive maximum (<c>-32000</c>).</param>
  public readonly record struct ServerErrorRangeBounds(int Min, int Max);

  /// <summary>The reserved server-error range bounds: <c>{ Min = -32099, Max = -32000 }</c> (spec R-AppB-b).</summary>
  public static ServerErrorRangeBounds ServerErrorRange { get; } = new(-32099, -32000);

  /// <summary>The reserved-code set surfaced as a convenience set (spec R-AppB-a, R-AppB-b).</summary>
  public static IReadOnlySet<int> AppendixBReservedCodeSet { get; } = new HashSet<int>(ReservedErrorCodes);

  /// <summary>The reason a custom error code is rejected (spec R-AppB-a, R-AppB-b).</summary>
  public enum CustomErrorCodeRejection
  {
    /// <summary>No failure (success).</summary>
    None,

    /// <summary>The code is not an integer.</summary>
    NotAnInteger,

    /// <summary>The code collides with a code this document defines.</summary>
    CollidesWithReserved,
  }

  /// <summary>Outcome of <see cref="ValidateExtensionErrorCode"/> / <see cref="ValidateCustomErrorCode"/>.</summary>
  /// <param name="Ok"><c>true</c> when the code is usable.</param>
  /// <param name="Reason">The rejection reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="InReservedRange"><c>true</c> when the (usable) code lies in <c>-32000..-32099</c>.</param>
  public readonly record struct CustomErrorCodeValidation(bool Ok, CustomErrorCodeRejection Reason, bool InReservedRange);

  /// <summary>
  /// Validates an extension/custom error <paramref name="code"/> against the §22 collision rule: it must
  /// be an integer and MUST NOT equal any reserved code (spec R-AppB-a). The double-typed parameter lets
  /// a caller pass a fractional value to exercise the integer check, mirroring the TS helper.
  /// </summary>
  /// <param name="code">The candidate code.</param>
  /// <returns>The validation outcome (without the in-range flag).</returns>
  public static CustomErrorCodeValidation ValidateExtensionErrorCode(double code)
  {
    if (code != Math.Floor(code) || double.IsInfinity(code) || double.IsNaN(code))
    {
      return new CustomErrorCodeValidation(false, CustomErrorCodeRejection.NotAnInteger, false);
    }
    var intCode = (int)code;
    if (AppendixBReservedCodeSet.Contains(intCode))
    {
      return new CustomErrorCodeValidation(false, CustomErrorCodeRejection.CollidesWithReserved, false);
    }
    return new CustomErrorCodeValidation(true, CustomErrorCodeRejection.None, false);
  }

  /// <summary>
  /// Validates a custom error <paramref name="code"/> against Appendix B's collision rule and flags
  /// whether a usable code lies inside the reserved <c>-32000..-32099</c> range (spec R-AppB-a, R-AppB-b,
  /// AC-46.1, AC-46.2). Delegates the integer/collision check to <see cref="ValidateExtensionErrorCode"/>
  /// so the two stay in lockstep.
  /// </summary>
  /// <param name="code">The candidate code.</param>
  /// <returns>The validation outcome.</returns>
  public static CustomErrorCodeValidation ValidateCustomErrorCode(double code)
  {
    var result = ValidateExtensionErrorCode(code);
    if (!result.Ok) return result;
    var intCode = (int)code;
    var inRange = intCode >= ServerErrorRange.Min && intCode <= ServerErrorRange.Max;
    return new CustomErrorCodeValidation(true, CustomErrorCodeRejection.None, inRange);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="code"/> is a code the document already defines in Appendix
  /// B — a code a custom definition MUST avoid (spec R-AppB-a, AC-46.1). Consults the full
  /// <see cref="ErrorCodeRegistry"/> so every listed code is caught, including the legacy
  /// resource-not-found literal and <c>-32001</c>.
  /// </summary>
  /// <param name="code">The candidate code.</param>
  /// <returns><c>true</c> when defined by the document.</returns>
  public static bool IsErrorCodeDefinedByDocument(int code) =>
    AppendixBReservedCodeSet.Contains(code) || code == ErrorCodes.HeaderMismatch || ErrorCodeRegistry.ContainsKey(code);

  // ─── Appendix A — Method and Notification Index ─────────────────────────────────

  /// <summary>Whether a name is a request, a notification, or an input-request kind delivered via §11 (spec Appendix A).</summary>
  public enum RegistryMethodKind
  {
    /// <summary>A request that expects a response.</summary>
    Request,

    /// <summary>A notification — no response is sent.</summary>
    Notification,

    /// <summary>An input-request kind delivered inside an input-required result and resolved by client retry (§11); NOT a standalone request.</summary>
    InputRequest,
  }

  /// <summary>The wire string for a <see cref="RegistryMethodKind"/> (matching the TS table values).</summary>
  /// <param name="kind">The method kind.</param>
  /// <returns>The wire string.</returns>
  public static string MethodKindName(RegistryMethodKind kind) => kind switch
  {
    RegistryMethodKind.Request => "request",
    RegistryMethodKind.Notification => "notification",
    RegistryMethodKind.InputRequest => "input-request kind",
    _ => throw new ArgumentOutOfRangeException(nameof(kind)),
  };

  /// <summary>One row of Appendix A — a single method or notification name.</summary>
  /// <param name="Name">The JSON-RPC method or notification name.</param>
  /// <param name="Kind">Whether the name is a request, a notification, or an input-request kind.</param>
  /// <param name="Direction">The normal sender→receiver pairing.</param>
  /// <param name="DefinedIn">The section that normatively defines the message.</param>
  /// <param name="ExtensionScoped">When <c>true</c>, the name is only in scope while the named extension is active.</param>
  public sealed record MethodNotificationIndexEntry(
    string Name, RegistryMethodKind Kind, string Direction, string DefinedIn, bool ExtensionScoped = false);

  /// <summary>
  /// Appendix A — the Method and Notification Index: every JSON-RPC method and notification defined by
  /// the document and its extensions, with its kind, direction, and defining section (spec Appendix A).
  /// 28 entries.
  /// </summary>
  public static IReadOnlyList<MethodNotificationIndexEntry> MethodRegistry { get; } =
  [
    // ── Core requests (client→server) ──
    new("server/discover", RegistryMethodKind.Request, "client→server", "§5 Protocol Revision, Version Negotiation, and Discovery"),
    new("tools/list", RegistryMethodKind.Request, "client→server", "§16 Tools"),
    new("tools/call", RegistryMethodKind.Request, "client→server", "§16 Tools"),
    new("resources/list", RegistryMethodKind.Request, "client→server", "§17 Resources"),
    new("resources/read", RegistryMethodKind.Request, "client→server", "§17 Resources"),
    new("resources/templates/list", RegistryMethodKind.Request, "client→server", "§17 Resources"),
    new("prompts/list", RegistryMethodKind.Request, "client→server", "§18 Prompts"),
    new("prompts/get", RegistryMethodKind.Request, "client→server", "§18 Prompts"),
    new("completion/complete", RegistryMethodKind.Request, "client→server", "§19 Completion"),
    new("subscriptions/listen", RegistryMethodKind.Request, "client→server", "§10 Server-to-Client Streaming and Subscriptions"),
    // ── Input-request kinds (server→client via input-required result, §11) ──
    new("elicitation/create", RegistryMethodKind.InputRequest, "server→client (via input-required result, §11)", "§20 Elicitation"),
    new("sampling/createMessage", RegistryMethodKind.InputRequest, "server→client (via input-required result, §11)", "§21 Deprecated Client-Provided Capabilities"),
    new("roots/list", RegistryMethodKind.InputRequest, "server→client (via input-required result, §11)", "§21 Deprecated Client-Provided Capabilities"),
    // ── Tasks extension requests (client→server) ──
    new("tasks/get", RegistryMethodKind.Request, "client→server", "§25 The Tasks Extension"),
    new("tasks/update", RegistryMethodKind.Request, "client→server", "§25 The Tasks Extension"),
    new("tasks/cancel", RegistryMethodKind.Request, "client→server", "§25 The Tasks Extension"),
    // ── UI extension handshake (UI↔host) ──
    new("ui/initialize", RegistryMethodKind.Request, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/initialized", RegistryMethodKind.Notification, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    // ── Notifications ──
    new("notifications/progress", RegistryMethodKind.Notification, "client→server or server→client", "§15 Utilities: Progress, Cancellation, Logging, and Trace Context"),
    new("notifications/cancelled", RegistryMethodKind.Notification, "client→server or server→client", "§15 Utilities: Progress, Cancellation, Logging, and Trace Context"),
    new("notifications/message", RegistryMethodKind.Notification, "server→client", "§15 Utilities: Progress, Cancellation, Logging, and Trace Context"),
    new("notifications/tools/list_changed", RegistryMethodKind.Notification, "server→client", "§16 Tools"),
    new("notifications/prompts/list_changed", RegistryMethodKind.Notification, "server→client", "§18 Prompts"),
    new("notifications/resources/list_changed", RegistryMethodKind.Notification, "server→client", "§17 Resources"),
    new("notifications/resources/updated", RegistryMethodKind.Notification, "server→client", "§17 Resources"),
    new("notifications/subscriptions/acknowledged", RegistryMethodKind.Notification, "server→client", "§10 Server-to-Client Streaming and Subscriptions"),
    new("notifications/elicitation/complete", RegistryMethodKind.Notification, "server→client", "§20 Elicitation"),
    new("notifications/tasks", RegistryMethodKind.Notification, "server→client", "§25 The Tasks Extension"),
  ];

  /// <summary>
  /// The additional UI-dialect message names (§26) exchanged on the UI message channel, in scope ONLY
  /// when the user-interface extension is active — beyond the two handshake names already in
  /// <see cref="MethodRegistry"/> (spec Appendix A).
  /// </summary>
  public static IReadOnlyList<MethodNotificationIndexEntry> UiDialectMethodIndex { get; } =
  [
    new("ui/notifications/tool-input", RegistryMethodKind.Notification, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/tool-input-partial", RegistryMethodKind.Notification, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/tool-result", RegistryMethodKind.Notification, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/tool-cancelled", RegistryMethodKind.Notification, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("tools/call", RegistryMethodKind.Request, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("resources/read", RegistryMethodKind.Request, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/open-link", RegistryMethodKind.Request, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/message", RegistryMethodKind.Request, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/request-display-mode", RegistryMethodKind.Request, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/update-model-context", RegistryMethodKind.Request, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("notifications/message", RegistryMethodKind.Notification, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ping", RegistryMethodKind.Request, "UI↔host (bidirectional)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/size-changed", RegistryMethodKind.Notification, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/host-context-changed", RegistryMethodKind.Notification, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/resource-teardown", RegistryMethodKind.Request, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/sandbox-proxy-ready", RegistryMethodKind.Notification, "UI↔host (sandbox→host)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
    new("ui/notifications/sandbox-resource-ready", RegistryMethodKind.Notification, "UI↔host (host→sandbox)", "§26 The Interactive User-Interface Extension", ExtensionScoped: true),
  ];

  /// <summary>
  /// Looks up the Appendix A entry for a method or notification <paramref name="name"/>, searching the
  /// core index first and (when <paramref name="includeUiDialect"/> is <c>true</c>) the UI-dialect names
  /// (spec Appendix A). Because a handful of UI-dialect names shadow core names, the core index is
  /// preferred unless a core hit is absent.
  /// </summary>
  /// <param name="name">The method or notification name.</param>
  /// <param name="includeUiDialect">Whether to also search the UI-dialect index.</param>
  /// <returns>The entry, or <c>null</c>.</returns>
  public static MethodNotificationIndexEntry? LookupMethod(string name, bool includeUiDialect = false)
  {
    var core = MethodRegistry.FirstOrDefault(e => string.Equals(e.Name, name, StringComparison.Ordinal));
    if (core is not null) return core;
    return includeUiDialect
      ? UiDialectMethodIndex.FirstOrDefault(e => string.Equals(e.Name, name, StringComparison.Ordinal))
      : null;
  }

  /// <summary>Returns <c>true</c> when <paramref name="name"/> appears in the core Appendix A index.</summary>
  /// <param name="name">The method or notification name.</param>
  /// <returns><c>true</c> when registered in the core index.</returns>
  public static bool IsRegisteredMethod(string name) =>
    MethodRegistry.Any(e => string.Equals(e.Name, name, StringComparison.Ordinal));

  // ─── Appendix C — Reserved _meta Key Registry ───────────────────────────────────

  /// <summary>One row of Appendix C — a reserved key that MAY appear in <c>_meta</c>.</summary>
  /// <param name="Key">The reserved <c>_meta</c> key (prefixed or bare-by-exception).</param>
  /// <param name="UsedOn">Where the key normally appears.</param>
  /// <param name="Meaning">Purpose, requirement level, and deprecation status where applicable.</param>
  /// <param name="DefinedIn">The section that normatively specifies the key.</param>
  /// <param name="Required">When <c>true</c>, the key is REQUIRED on the location named in <paramref name="UsedOn"/>.</param>
  /// <param name="Deprecated">When <c>true</c>, the key carries Deprecated status.</param>
  public sealed record MetaKeyRegistryEntry(
    string Key, string UsedOn, string Meaning, string DefinedIn, bool Required, bool Deprecated = false);

  /// <summary>
  /// Appendix C — the Reserved <c>_meta</c> Key Registry: every key reserved by this document that MAY
  /// appear in <c>_meta</c> (the <c>io.modelcontextprotocol/</c> prefixed keys plus the four
  /// bare-by-exception keys), each with where it is used, its meaning/requirement level, and its
  /// defining section (spec Appendix C; R-AppC-a … j).
  /// </summary>
  public static IReadOnlyList<MetaKeyRegistryEntry> MetaKeyRegistry { get; } =
  [
    new("io.modelcontextprotocol/protocolVersion", "every client request (_meta)",
      "The protocol revision the request uses (the wire value, e.g. \"2026-07-28\"). REQUIRED on client requests.",
      "§4 Request Metadata and the Stateless Model", Required: true),
    new("io.modelcontextprotocol/clientInfo", "every client request (_meta)",
      "An Implementation object identifying the client software issuing the request. REQUIRED on client requests.",
      "§4 Request Metadata and the Stateless Model", Required: true),
    new("io.modelcontextprotocol/clientCapabilities", "every client request (_meta)",
      "A ClientCapabilities object declaring, for this request, the optional capabilities the client supports. REQUIRED on client requests.",
      "§4 Request Metadata and the Stateless Model", Required: true),
    new("io.modelcontextprotocol/logLevel", "client request _meta (OPTIONAL)",
      "The minimum log severity the server may emit while processing this request, as a LoggingLevel string. Status: Deprecated.",
      "§4 Request Metadata and the Stateless Model", Required: false, Deprecated: true),
    new("progressToken", "request _meta (OPTIONAL)",
      "Out-of-band progress correlation token; the value (a string or number) is echoed in notifications/progress to correlate updates with the originating request.",
      "§15 Utilities: Progress, Cancellation, Logging, and Trace Context", Required: false),
    new("io.modelcontextprotocol/subscriptionId", "notification _meta on a subscription stream",
      "Correlates a notification delivered on a subscriptions/listen stream with the subscription it belongs to; value is the subscription identifier as a string.",
      "§10 Server-to-Client Streaming and Subscriptions", Required: false),
    new("traceparent", "request and notification _meta (OPTIONAL)",
      "W3C Trace Context traceparent value, carried unchanged for distributed-trace propagation.",
      "§15 Utilities: Progress, Cancellation, Logging, and Trace Context", Required: false),
    new("tracestate", "request and notification _meta (OPTIONAL)",
      "W3C Trace Context tracestate value, carried unchanged for distributed-trace propagation.",
      "§15 Utilities: Progress, Cancellation, Logging, and Trace Context", Required: false),
    new("baggage", "request and notification _meta (OPTIONAL)",
      "W3C Baggage value, carried unchanged for distributed-trace propagation.",
      "§15 Utilities: Progress, Cancellation, Logging, and Trace Context", Required: false),
    new("io.modelcontextprotocol/tasks", "extensions map within client clientCapabilities and within server capabilities",
      "Extension identifier declaring support for the Tasks extension; its value is an OPTIONAL settings object (empty {} defined).",
      "§25 The Tasks Extension", Required: false),
    new("io.modelcontextprotocol/ui", "extensions map within host/server capabilities",
      "Extension identifier declaring support for the Interactive User-Interface extension; the host's value carries the REQUIRED mimeTypes array.",
      "§26 The Interactive User-Interface Extension", Required: false),
    new("ui", "a Tool object's _meta (§16 Tools)",
      "Declares the user interface associated with a tool: an object with REQUIRED resourceUri (a ui:// URI) and OPTIONAL visibility. In scope only when the user-interface extension is active.",
      "§26 The Interactive User-Interface Extension", Required: true),
  ];

  /// <summary>
  /// Looks up the Appendix C entry for an exact reserved <paramref name="key"/>, or <c>null</c> (spec
  /// Appendix C). Matches the literal rows only; use <see cref="IsReservedMetaKey"/> for the broader
  /// prefix-based reservation test.
  /// </summary>
  /// <param name="key">The reserved key.</param>
  /// <returns>The entry, or <c>null</c>.</returns>
  public static MetaKeyRegistryEntry? LookupMetaKey(string key) =>
    MetaKeyRegistry.FirstOrDefault(e => string.Equals(e.Key, key, StringComparison.Ordinal));

  /// <summary>
  /// Returns <c>true</c> when <paramref name="key"/> is reserved by this document and so MAY appear in
  /// <c>_meta</c> without being treated as an unknown/custom key: any key under the reserved
  /// <c>io.modelcontextprotocol/</c>/<c>mcp</c> prefix, or one of the four bare-by-exception keys (spec
  /// R-AppC-a, AC-46.3). Extension-defined keys outside the reserved prefix are NOT reserved by this
  /// predicate (use <see cref="IsMetaKeyPermitted"/> to confirm a key MAY appear at all).
  /// </summary>
  /// <param name="key">The candidate key.</param>
  /// <returns><c>true</c> when reserved by the document.</returns>
  public static bool IsReservedMetaKey(string key)
  {
    ArgumentNullException.ThrowIfNull(key);
    if (key is MetaKeys.ProgressToken or MetaKeys.TraceParent or MetaKeys.TraceState or MetaKeys.Baggage)
    {
      return true;
    }
    var slash = key.IndexOf('/');
    if (slash < 0) return false;
    return MetaKeys.IsReservedPrefix(key);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="key"/> MAY appear in <c>_meta</c> — either because it is a
  /// registry-reserved key (see <see cref="IsReservedMetaKey"/>) or because it is an extension-defined
  /// key carried under a valid non-reserved prefix (spec R-AppC-a, R-AppC-j, AC-46.3, AC-46.12). A bare
  /// key that is neither reserved-by-exception nor prefixed is NOT permitted.
  /// </summary>
  /// <param name="key">The candidate key.</param>
  /// <returns><c>true</c> when permitted.</returns>
  public static bool IsMetaKeyPermitted(string key)
  {
    ArgumentNullException.ThrowIfNull(key);
    if (IsReservedMetaKey(key)) return true;
    // An extension-defined key must carry a (non-reserved) prefix to be permitted.
    var slash = key.IndexOf('/');
    if (slash < 0) return false;
    return !MetaKeys.IsReservedPrefix(key);
  }

  /// <summary>Returns the reserved keys (Appendix C rows) that are REQUIRED on a client request (spec R-AppC-b … d).</summary>
  /// <returns>The required client-request keys, in registry order.</returns>
  public static IReadOnlyList<string> RequiredClientRequestMetaKeys() =>
    MetaKeyRegistry
      .Where(e => e.Required && e.UsedOn.StartsWith("every client request", StringComparison.Ordinal))
      .Select(e => e.Key)
      .ToList();

  // ─── Appendix D — Capability Registry ────────────────────────────────────────────

  /// <summary>A single nested sub-flag of a capability, with its optionality and notes (spec Appendix D).</summary>
  /// <param name="Name">The sub-flag member name.</param>
  /// <param name="Required">When <c>true</c>, the sub-flag is REQUIRED.</param>
  /// <param name="Gates">A one-line statement of what the sub-flag gates or carries.</param>
  /// <param name="Boolean">When <c>true</c>, the sub-flag is a boolean toggle.</param>
  /// <param name="Deprecated">When <c>true</c>, the sub-flag carries Deprecated status.</param>
  public sealed record CapabilitySubFlag(
    string Name, bool Required, string Gates, bool Boolean = false, bool Deprecated = false);

  /// <summary>One row of Appendix D — a capability defined by this document (spec Appendix D).</summary>
  /// <param name="Capability">The capability name.</param>
  /// <param name="Side">Which side(s) advertise the capability (<c>client</c>/<c>server</c>/<c>host</c>/<c>host/server</c>/<c>client and server</c>).</param>
  /// <param name="SubFlags">Nested members defined for the capability (empty when the value is <c>{}</c>).</param>
  /// <param name="DefinedIn">The section that normatively specifies the capability.</param>
  /// <param name="Deprecated">When <c>true</c>, the capability carries Deprecated status.</param>
  /// <param name="Extension">When <c>true</c>, the capability is negotiated through the <c>extensions</c> map.</param>
  public sealed record CapabilityRegistryEntry(
    string Capability,
    string Side,
    IReadOnlyList<CapabilitySubFlag> SubFlags,
    string DefinedIn,
    bool Deprecated = false,
    bool Extension = false);

  /// <summary>
  /// Appendix D — the Capability Registry: every client/server/extension capability defined by this
  /// document, with its side, its sub-flags (and their optionality, boolean-ness, and deprecation), and
  /// its defining section (spec Appendix D; R-AppD-a … f).
  /// </summary>
  public static IReadOnlyList<CapabilityRegistryEntry> CapabilityRegistry { get; } =
  [
    // ── Client capabilities ──
    new("elicitation", "client",
      [new("form", Required: false, "enables the form elicitation mode; the url mode is the other defined mode (§20)")],
      "§6 Capabilities and Extensions"),
    new("roots", "client", [], "§6 Capabilities and Extensions", Deprecated: true),
    new("sampling", "client",
      [
        new("tools", Required: false, "enables the sampling tools/toolChoice parameters"),
        new("context", Required: false, "enables non-none includeContext values", Deprecated: true),
      ],
      "§6 Capabilities and Extensions", Deprecated: true),
    new("extensions", "client", [], "§6 Capabilities and Extensions"),
    // ── Server capabilities ──
    new("tools", "server",
      [new("listChanged", Required: false, "enables notifications/tools/list_changed", Boolean: true)],
      "§6 Capabilities and Extensions"),
    new("resources", "server",
      [
        new("listChanged", Required: false, "enables notifications/resources/list_changed", Boolean: true),
        new("subscribe", Required: false, "enables resource subscriptions (subscriptions/listen)", Boolean: true),
      ],
      "§6 Capabilities and Extensions"),
    new("prompts", "server",
      [new("listChanged", Required: false, "enables notifications/prompts/list_changed", Boolean: true)],
      "§6 Capabilities and Extensions"),
    new("completions", "server", [], "§6 Capabilities and Extensions"),
    new("logging", "server", [], "§6 Capabilities and Extensions", Deprecated: true),
    new("extensions", "server", [], "§6 Capabilities and Extensions"),
    // ── Extension capabilities (negotiated via the extensions map) ──
    new("io.modelcontextprotocol/tasks", "client and server", [], "§25 The Tasks Extension", Extension: true),
    new("io.modelcontextprotocol/ui", "host/server",
      [new("mimeTypes", Required: true, "host value: string array that MUST include \"text/html;profile=mcp-app\"; server acknowledgement value MAY be empty")],
      "§26 The Interactive User-Interface Extension", Extension: true),
  ];

  /// <summary>
  /// Looks up the Appendix D entry for <paramref name="capability"/>. When the same name is defined on
  /// more than one side (<c>extensions</c> is both a client and a server capability), pass
  /// <paramref name="side"/> to disambiguate; otherwise the first match is returned (spec Appendix D).
  /// </summary>
  /// <param name="capability">The capability name.</param>
  /// <param name="side">The side to disambiguate by, or <c>null</c>.</param>
  /// <returns>The entry, or <c>null</c>.</returns>
  public static CapabilityRegistryEntry? LookupCapability(string capability, string? side = null) =>
    CapabilityRegistry.FirstOrDefault(e =>
      string.Equals(e.Capability, capability, StringComparison.Ordinal) &&
      (side is null || string.Equals(e.Side, side, StringComparison.Ordinal)));

  /// <summary>
  /// Returns the named sub-flag of a capability, or <c>null</c> when the capability or the sub-flag is
  /// not defined (spec Appendix D).
  /// </summary>
  /// <param name="capability">The capability name.</param>
  /// <param name="subFlag">The sub-flag member name.</param>
  /// <param name="side">The side to disambiguate by, or <c>null</c>.</param>
  /// <returns>The sub-flag, or <c>null</c>.</returns>
  public static CapabilitySubFlag? LookupCapabilitySubFlag(string capability, string subFlag, string? side = null) =>
    LookupCapability(capability, side)?.SubFlags
      .FirstOrDefault(f => string.Equals(f.Name, subFlag, StringComparison.Ordinal));

  /// <summary>The MIME type the <c>io.modelcontextprotocol/ui</c> host value's <c>mimeTypes</c> array MUST include (spec R-AppD-f, AC-46.18).</summary>
  public const string UiHostRequiredMimeType = "text/html;profile=mcp-app";

  /// <summary>The reason a UI host value fails validation (spec R-AppC-h, R-AppD-f).</summary>
  public enum UiHostValueFailure
  {
    /// <summary>No failure (success).</summary>
    None,

    /// <summary>The value is not an object.</summary>
    NotAnObject,

    /// <summary>The <c>mimeTypes</c> field is absent.</summary>
    MissingMimeTypes,

    /// <summary>The <c>mimeTypes</c> field is not an array.</summary>
    MimeTypesNotArray,

    /// <summary>The <c>mimeTypes</c> array does not include the required MIME type.</summary>
    MissingRequiredMimeType,
  }

  /// <summary>Outcome of <see cref="ValidateUiHostValue"/>.</summary>
  /// <param name="Ok"><c>true</c> when the host value is conformant.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct UiHostValueValidation(bool Ok, UiHostValueFailure Reason);

  /// <summary>
  /// Validates the <c>io.modelcontextprotocol/ui</c> host value against Appendix C/D: it MUST carry a
  /// <c>mimeTypes</c> array that includes <see cref="UiHostRequiredMimeType"/> (spec R-AppC-h, R-AppD-f,
  /// AC-46.10, AC-46.18). A server <em>acknowledgement</em> value MAY be empty — that case is the
  /// caller's to distinguish; this checks the host value.
  /// </summary>
  /// <param name="value">The host value (raw).</param>
  /// <returns>The validation outcome.</returns>
  public static UiHostValueValidation ValidateUiHostValue(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return new UiHostValueValidation(false, UiHostValueFailure.NotAnObject);
    }
    if (!obj.TryGetPropertyValue("mimeTypes", out var mimeTypes) || mimeTypes is null)
    {
      return new UiHostValueValidation(false, UiHostValueFailure.MissingMimeTypes);
    }
    if (mimeTypes is not JsonArray array)
    {
      return new UiHostValueValidation(false, UiHostValueFailure.MimeTypesNotArray);
    }
    var includesRequired = array.Any(n =>
      n is JsonValue v && v.TryGetValue<string>(out var s) &&
      string.Equals(s, UiHostRequiredMimeType, StringComparison.Ordinal));
    return includesRequired
      ? new UiHostValueValidation(true, UiHostValueFailure.None)
      : new UiHostValueValidation(false, UiHostValueFailure.MissingRequiredMimeType);
  }

  /// <summary>The reason a tool <c>_meta.ui</c> value fails validation (spec R-AppC-i).</summary>
  public enum ToolUiMetaFailure
  {
    /// <summary>No failure (success).</summary>
    None,

    /// <summary>The value is not an object.</summary>
    NotAnObject,

    /// <summary>The <c>resourceUri</c> field is absent or not a string.</summary>
    MissingResourceUri,

    /// <summary>The <c>resourceUri</c> is not a <c>ui://</c> URI.</summary>
    ResourceUriNotUiUri,
  }

  /// <summary>Outcome of <see cref="ValidateToolUiMetaValue"/>.</summary>
  /// <param name="Ok"><c>true</c> when the value is conformant.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct ToolUiMetaValidation(bool Ok, ToolUiMetaFailure Reason);

  /// <summary>
  /// Validates a <c>Tool</c> object's <c>_meta.ui</c> value against Appendix C: it MUST be an object
  /// with a REQUIRED <c>resourceUri</c> that is a <c>ui://</c> URI and an OPTIONAL <c>visibility</c>
  /// (spec R-AppC-i, AC-46.11). Meaningful only when the UI extension is active.
  /// </summary>
  /// <param name="value">The <c>_meta.ui</c> value (raw).</param>
  /// <returns>The validation outcome.</returns>
  public static ToolUiMetaValidation ValidateToolUiMetaValue(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return new ToolUiMetaValidation(false, ToolUiMetaFailure.NotAnObject);
    }
    if (!obj.TryGetPropertyValue("resourceUri", out var uriNode) ||
        uriNode is not JsonValue uriValue || !uriValue.TryGetValue<string>(out var resourceUri))
    {
      return new ToolUiMetaValidation(false, ToolUiMetaFailure.MissingResourceUri);
    }
    return resourceUri.StartsWith("ui://", StringComparison.Ordinal)
      ? new ToolUiMetaValidation(true, ToolUiMetaFailure.None)
      : new ToolUiMetaValidation(false, ToolUiMetaFailure.ResourceUriNotUiUri);
  }

  // ─── Appendix E — Consolidated Type Index ────────────────────────────────────────

  /// <summary>One row of Appendix E — a named wire type declared by this document (spec Appendix E).</summary>
  /// <param name="Type">The wire type (interface or type alias) name.</param>
  /// <param name="DefinedIn">The section containing the type's full canonical declaration.</param>
  /// <param name="Purpose">A one-line statement of the type's purpose.</param>
  public sealed record TypeIndexEntry(string Type, string DefinedIn, string Purpose);

  /// <summary>
  /// Appendix E — the Consolidated Type Index: every wire type (interface or type alias) declared by
  /// this document, in the published Appendix E order, each with its canonical defining section and a
  /// one-line purpose (spec Appendix E). 176 entries.
  /// </summary>
  public static IReadOnlyList<TypeIndexEntry> TypeRegistry { get; } =
  [
    new("Annotations", "§14.6 Annotations", "Optional client-facing hints (audience, priority, timestamps) attachable to content and resources."),
    new("AudioContent", "§14.4.3 AudioContent", "Content block carrying base64-encoded audio data with a MIME type."),
    new("AuthorizationServerMetadata", "§23.3 Authorization Server Metadata Discovery", "OAuth authorization-server metadata document advertising endpoints and supported capabilities."),
    new("BaseMetadata", "§14.1 BaseMetadata: name and title", "Common base carrying the programmatic name and human-facing title."),
    new("BlobResourceContents", "§14.5 ResourceContents and variants", "Resource contents variant carrying base64-encoded binary data."),
    new("BooleanSchema", "§20.4 The restricted form schema", "Primitive form-field schema describing a boolean input."),
    new("CacheableResult", "§13.1 The CacheableResult Structure", "Result mixin carrying caching hints (ttlMs, cacheScope)."),
    new("CallToolRequest", "§16.5 Calling tools: tools/call", "Request to invoke a tool by name with arguments."),
    new("CallToolResult", "§16.5 Calling tools: tools/call", "Successful tool-invocation result carrying content blocks and optional structured output."),
    new("CancelledNotification", "§15.2.1 The notifications/cancelled notification", "Notification that the sender is cancelling a request the sender issued earlier."),
    new("CancelledNotificationParams", "§15.2.1 The notifications/cancelled notification", "Parameters of the cancellation notification (target request id and optional reason)."),
    new("CancelledTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the cancelled terminal state."),
    new("CancelTaskRequest", "§25.9 Cancelling a Task: tasks/cancel", "Request to cancel an in-progress task by taskId."),
    new("CancelTaskResult", "§25.9 Cancelling a Task: tasks/cancel", "Empty acknowledgement returned for a task cancellation."),
    new("ClientCapabilities", "§6.2 ClientCapabilities", "Capability set a client advertises to the server."),
    new("ClientIdMetadataDocument", "§23.12 Client ID Metadata Documents", "Client-published metadata document identified by a client-id URL."),
    new("ClientRegistrationRequest", "§23.14 Dynamic Client Registration", "Dynamic client registration request body."),
    new("ClientRegistrationResponse", "§23.14 Dynamic Client Registration", "Dynamic client registration response carrying issued client credentials."),
    new("ClientSamplingCapability", "§21.2.3 Client Capability", "Client capability declaring support for the deprecated sampling input-request kind."),
    new("CompletedTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the completed terminal state."),
    new("CompleteRequest", "§19.2 completion/complete request", "Request for completion suggestions for a prompt or resource-template argument."),
    new("CompleteRequestParams", "§19.2 completion/complete request", "Parameters of a completion request (reference, argument, context)."),
    new("CompleteResult", "§19.4 CompleteResult", "Completion result carrying candidate values and totals."),
    new("CompletionsCapability", "§19.1 The completions capability", "Server capability declaring support for argument completion."),
    new("ContentBlock", "§14.4 ContentBlock", "Discriminated union of content block kinds exchanged in messages and results."),
    new("CreateMessageRequest", "§21.2.4 Request Parameters", "Deprecated sampling request asking the client to produce a model message."),
    new("CreateMessageRequestParams", "§21.2.4 Request Parameters", "Parameters of the deprecated sampling request (messages, model preferences, tools)."),
    new("CreateMessageResult", "§21.2.8 Result", "Result of the deprecated sampling request carrying the generated message."),
    new("CreateTaskResult", "§25.3 Task Augmentation of Existing Requests", "Task-handle result (resultType: \"task\") returned in place of an ordinary result."),
    new("Cursor", "§3.7 Base Request and Notification Params", "Opaque pagination cursor string."),
    new("DetailedTask", "§25.4 Task and DetailedTask Object Types", "Discriminated union of task objects with status-specific fields."),
    new("DiscoverRequest", "§5.3.1 Request", "Request for server discovery and protocol-revision negotiation."),
    new("DiscoverResult", "§5.3.2 Result", "Result of server/discover carrying the negotiated revision and capabilities."),
    new("DiscoverResultResponse", "§5.3.2 Result", "Success-response envelope wrapping a DiscoverResult."),
    new("ElicitRequest", "§20.2 Delivery via input-required result", "Input-request asking the client to collect user input via form or URL."),
    new("ElicitRequestFormParams", "§20.3 Elicitation modes and parameter shapes", "Form-mode elicitation parameters carrying the requested schema."),
    new("ElicitRequestParams", "§20.2 Delivery via input-required result", "Union of form-mode and URL-mode elicitation parameter shapes."),
    new("ElicitRequestURLParams", "§20.3 Elicitation modes and parameter shapes", "URL-mode elicitation parameters carrying the out-of-band URL and id."),
    new("ElicitResult", "§20.5 ElicitResult and response actions", "Elicitation response carrying the user action and any collected content."),
    new("EmbeddedResource", "§14.4.5 EmbeddedResource", "Content block embedding resource contents inline."),
    new("EmptyResult", "§3.9 Empty Result", "Result type with no fields beyond the base, used for bare acknowledgements."),
    new("EnumSchema", "§20.4 The restricted form schema", "Union of enumerated (single/multi-select) primitive form-field schemas."),
    new("Error", "§3.8 Error Object", "JSON-RPC error object (code, message, optional data)."),
    new("ExtensionSettings", "§24.3 Negotiation", "Per-extension settings map carried during extension negotiation."),
    new("FailedTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the failed terminal state."),
    new("GetPromptRequest", "§18.4 Getting a prompt: prompts/get", "Request to resolve a prompt by name with arguments."),
    new("GetPromptResult", "§18.4 Getting a prompt: prompts/get", "Resolved prompt result carrying the message list."),
    new("GetTaskRequest", "§25.7 Retrieving a Task: tasks/get", "Request to retrieve a task's current detailed state by taskId."),
    new("GetTaskResult", "§25.7 Retrieving a Task: tasks/get", "Result carrying a DetailedTask for the requested task."),
    new("Icon", "§14.2 Icon and Icons", "Single icon descriptor (source, optional MIME type and size)."),
    new("Icons", "§14.2 Icon and Icons", "Collection of icon descriptors."),
    new("ImageContent", "§14.4.2 ImageContent", "Content block carrying base64-encoded image data with a MIME type."),
    new("Implementation", "§14.3 Implementation", "Descriptor identifying an implementation (name, title, version)."),
    new("InputRequest", "§11.2 InputRequiredResult and the Input Requests", "Discriminated union of input-request kinds a server may ask a client to fulfill."),
    new("InputRequests", "§11.2 InputRequiredResult and the Input Requests", "Map from server-chosen key to a single InputRequest."),
    new("InputRequiredResult", "§11.2 InputRequiredResult and the Input Requests", "Result (resultType: \"input_required\") requesting further client input."),
    new("InputRequiredTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task awaiting client input."),
    new("InputResponse", "§11.4 The Retry Request: InputResponseRequestParams", "Discriminated union of input-response kinds answering an InputRequest."),
    new("InputResponseRequestParams", "§11.4 The Retry Request: InputResponseRequestParams", "Retry parameters carrying inputResponses and the echoed requestState."),
    new("InputResponses", "§11.4 The Retry Request: InputResponseRequestParams", "Map from key to InputResponse, answering the corresponding inputRequests."),
    new("JSONArray", "§2.3 JSON Value Model", "Ordered list of JSON values."),
    new("JSONObject", "§2.3 JSON Value Model", "Unordered, string-keyed map of JSON values."),
    new("JSONRPCErrorResponse", "§3.5.2 Error Response", "JSON-RPC error response envelope."),
    new("JSONRPCMessage", "§3.1 JSON-RPC Framing", "Union of all framed JSON-RPC message kinds."),
    new("JSONRPCNotification", "§3.4 Notifications", "JSON-RPC notification envelope (no id)."),
    new("JSONRPCRequest", "§3.3 Requests", "JSON-RPC request envelope (with id)."),
    new("JSONRPCResponse", "§3.5 Responses", "Union of success and error response envelopes."),
    new("JSONRPCResultResponse", "§3.5.1 Success Response", "JSON-RPC success response envelope carrying a result."),
    new("JSONValue", "§2.3 JSON Value Model", "Any JSON value (null, boolean, number, string, array, object)."),
    new("LegacyTitledEnumSchema", "§20.4 The restricted form schema", "Deprecated enum form-field schema using a parallel enumNames array."),
    new("ListPromptsRequest", "§18.2 Listing prompts: prompts/list", "Paginated request to list available prompts."),
    new("ListPromptsResult", "§18.2 Listing prompts: prompts/list", "Paginated result listing prompts."),
    new("ListResourcesRequest", "§17.2 Listing resources: resources/list", "Paginated request to list available resources."),
    new("ListResourcesResult", "§17.2 Listing resources: resources/list", "Paginated, cacheable result listing resources."),
    new("ListResourceTemplatesRequest", "§17.3 Listing resource templates: resources/templates/list", "Paginated request to list resource templates."),
    new("ListResourceTemplatesResult", "§17.3 Listing resource templates: resources/templates/list", "Paginated, cacheable result listing resource templates."),
    new("ListRootsRequest", "§21.1.4 The roots/list Input Request", "Deprecated input-request asking the client for its root list."),
    new("ListRootsResult", "§21.1.5 The ListRootsResult and the Root Type", "Result of the deprecated roots listing."),
    new("ListToolsRequest", "§16.2 Listing tools: tools/list", "Paginated request to list available tools."),
    new("ListToolsResult", "§16.2 Listing tools: tools/list", "Paginated result listing tools."),
    new("LoggingLevel", "§15.3.1 The LoggingLevel enumeration", "Enumeration of syslog-style log severity levels."),
    new("LoggingMessageNotification", "§15.3.2 The notifications/message notification", "Notification carrying a log message from server to client."),
    new("LoggingMessageNotificationParams", "§15.3.2 The notifications/message notification", "Parameters of a logging notification (level, logger, data)."),
    new("MetaObject", "§4.1 The _meta Object", "Open string-keyed metadata map carried in _meta."),
    new("MissingRequiredClientCapabilityError", "§22.3.1 -32003 MissingRequiredClientCapability", "Error payload reporting a required client capability that was not declared."),
    new("ModelHint", "§21.2.9 Model Preferences", "Hint guiding model selection during deprecated sampling."),
    new("ModelPreferences", "§21.2.9 Model Preferences", "Model-selection preferences for deprecated sampling."),
    new("Notification", "§3.4 Notifications", "Base shape of a notification (method and optional params)."),
    new("NotificationParams", "§3.7 Base Request and Notification Params", "Base parameters shape common to notifications."),
    new("NumberSchema", "§20.4 The restricted form schema", "Primitive form-field schema describing a numeric input."),
    new("OpenLinkParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host request parameters to open an external link."),
    new("PaginatedRequestParams", "§12.2 Request and Result Shapes", "Base request parameters carrying an optional cursor."),
    new("PaginatedResult", "§12.2 Request and Result Shapes", "Base result carrying an optional nextCursor."),
    new("PrimitiveSchemaDefinition", "§20.4 The restricted form schema", "Union of primitive form-field schema kinds (string, number, boolean, enum)."),
    new("ProgressNotification", "§15.1.3 The notifications/progress notification", "Notification reporting progress on a long-running request."),
    new("ProgressNotificationParams", "§15.1.3 The notifications/progress notification", "Parameters of a progress notification (token, progress, total, message)."),
    new("ProgressToken", "§3.7 Base Request and Notification Params", "Token correlating progress notifications with a request."),
    new("Prompt", "§18.3 The Prompt and PromptArgument types", "Descriptor of an available prompt and its arguments."),
    new("PromptArgument", "§18.3 The Prompt and PromptArgument types", "Descriptor of a single prompt argument."),
    new("PromptListChangedNotification", "§18.6 The prompts-list-changed notification", "Notification that the prompt list has changed."),
    new("PromptMessage", "§18.5 The PromptMessage type and valid content", "Single message within a resolved prompt."),
    new("PromptReference", "§19.3 Reference types: PromptReference and ResourceTemplateReference", "Completion reference identifying a prompt."),
    new("PromptsCapability", "§18.1 The prompts capability", "Server capability declaring support for prompts."),
    new("ProtectedResourceMetadata", "§23.2 Protected Resource Metadata Discovery", "Metadata document advertising the resource server's authorization servers."),
    new("ReadResourceRequest", "§17.5 Reading a resource: resources/read", "Request to read a resource by URI."),
    new("ReadResourceRequestParams", "§17.5 Reading a resource: resources/read", "Parameters of a resource-read request (URI plus input responses)."),
    new("ReadResourceResult", "§17.5 Reading a resource: resources/read", "Cacheable result carrying the read resource's contents."),
    new("Request", "§3.3 Requests", "Base shape of a request (method and optional params)."),
    new("RequestId", "§3.2 Request Identifier", "Request-correlation identifier (string or number)."),
    new("RequestMetaObject", "§4.3 Protocol-Defined Per-Request _meta Keys", "_meta shape for protocol-defined per-request metadata keys."),
    new("RequestParams", "§3.7 Base Request and Notification Params", "Base parameters shape common to requests, carrying _meta."),
    new("RequestProtocolVersionMeta", "§5.2 Carrying the Protocol Revision on a Request", "_meta shape carrying the protocol revision on a request."),
    new("Resource", "§17.4 The Resource and ResourceTemplate types", "Descriptor of a concrete resource."),
    new("ResourceContents", "§14.5 ResourceContents and variants", "Base of the resource-contents variants (text/blob)."),
    new("ResourceLink", "§14.4.4 ResourceLink", "Content block referencing a resource by URI."),
    new("ResourceListChangedNotification", "§17.7 Change notifications and subscriptions", "Notification that the resource list has changed."),
    new("ResourceNotFoundError", "§17.6 Resource-not-found error", "Error payload reporting that a requested resource URI was not found."),
    new("ResourcesServerCapability", "§17.1 The resources capability", "Server capability declaring support for resources (and subscription flags)."),
    new("ResourceTeardownParams", "§26.5.4 Lifecycle and context-change messages (Host → UI)", "Host-to-UI parameters signalling that the UI resource is being torn down."),
    new("ResourceTemplate", "§17.4 The Resource and ResourceTemplate types", "Descriptor of a parameterized resource URI template."),
    new("ResourceTemplateReference", "§19.3 Reference types: PromptReference and ResourceTemplateReference", "Completion reference identifying a resource template."),
    new("ResourceUiMeta", "§26.4 The UI Resource", "UI metadata (CSP, permissions) attached to a UI resource."),
    new("ResourceUpdatedNotification", "§17.7 Change notifications and subscriptions", "Notification that a subscribed resource has been updated."),
    new("ResourceUpdatedNotificationParams", "§17.7 Change notifications and subscriptions", "Parameters of a resource-updated notification (URI)."),
    new("Result", "§3.6 Result Base Type", "Base of all result types, carrying resultType and _meta."),
    new("ResultType", "§3.6 Result Base Type", "Open discriminator selecting the concrete result shape."),
    new("Role", "§14.7 Role", "Message-author role (user or assistant)."),
    new("Root", "§21.1.5 The ListRootsResult and the Root Type", "Deprecated descriptor of a client-exposed filesystem root."),
    new("SamplingMessage", "§21.2.6 Messages and Content Blocks", "Single message in a deprecated sampling conversation."),
    new("SamplingMessageContentBlock", "§21.2.6 Messages and Content Blocks", "Content-block union for sampling messages (text/image/audio plus tool_use/tool_result; excludes resource_link and resource)."),
    new("SandboxResourceReadyParams", "§26.5.5 Host-internal sandbox-proxy messages", "Host-internal sandbox-proxy parameters signalling the UI resource is ready."),
    new("ServerCapabilities", "§6.3 ServerCapabilities", "Capability set a server advertises to the client."),
    new("SingleSelectEnumSchema", "§20.4 The restricted form schema", "Union of single-select enum form-field schema variants."),
    new("SizeChangedParams", "§26.5.4 Lifecycle and context-change messages (Host → UI)", "Host-to-UI parameters reporting a UI size change."),
    new("StringSchema", "§20.4 The restricted form schema", "Primitive form-field schema describing a string input."),
    new("SubscriptionFilter", "§10.2 The subscriptions/listen Request and the Notification Filter", "Filter selecting which notification kinds a subscription delivers."),
    new("SubscriptionsAcknowledgedNotification", "§10.3 Acknowledgement", "Notification acknowledging an established subscription."),
    new("SubscriptionsAcknowledgedNotificationParams", "§10.3 Acknowledgement", "Parameters of the subscription-acknowledgement notification."),
    new("SubscriptionsListenRequest", "§10.2 The subscriptions/listen Request and the Notification Filter", "Request to open a server-to-client notification stream."),
    new("SubscriptionsListenRequestParams", "§10.2 The subscriptions/listen Request and the Notification Filter", "Parameters of the subscription-listen request (filter)."),
    new("Task", "§25.4 Task and DetailedTask Object Types", "Core task object (id, status, timestamps) shared by all task variants."),
    new("TaskStatus", "§25.5 Task Status Lifecycle", "Enumeration of task lifecycle states."),
    new("TaskStatusNotification", "§25.10 Task Status Notifications: notifications/tasks", "Notification reporting a task's status change."),
    new("TaskStatusNotificationParams", "§25.10 Task Status Notifications: notifications/tasks", "Parameters of a task-status notification (a DetailedTask)."),
    new("TasksExtensionCapability", "§25.2 Capability Declaration and Negotiation", "Capability declaring support for the Tasks extension."),
    new("TextContent", "§14.4.1 TextContent", "Content block carrying plain text."),
    new("TextResourceContents", "§14.5 ResourceContents and variants", "Resource contents variant carrying text."),
    new("TitledMultiSelectEnumSchema", "§20.4 The restricted form schema", "Multi-select enum form-field schema with per-option titles."),
    new("TitledSingleSelectEnumSchema", "§20.4 The restricted form schema", "Single-select enum form-field schema with per-option titles."),
    new("Tool", "§16.3 The Tool type", "Descriptor of an available tool (name, schemas, annotations)."),
    new("ToolAnnotations", "§16.7 Tool annotations", "Behavioral hints about a tool (read-only, destructive, idempotent, etc.)."),
    new("ToolCancelledParams", "§26.5.2 Tool input and result delivery (Host → UI)", "Host-to-UI parameters signalling a tool invocation was cancelled."),
    new("ToolChoice", "§21.2.5 Tool Choice", "Deprecated sampling control selecting how tools may be used."),
    new("ToolInputParams", "§26.5.2 Tool input and result delivery (Host → UI)", "Host-to-UI parameters delivering tool input arguments."),
    new("ToolListChangedNotification", "§16.8 The notifications/tools/list_changed notification", "Notification that the tool list has changed."),
    new("ToolResultContent", "§21.2.6 Messages and Content Blocks", "Sampling content block carrying a tool result."),
    new("ToolResultParams", "§26.5.2 Tool input and result delivery (Host → UI)", "Host-to-UI parameters delivering a tool result."),
    new("ToolsCallParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host parameters requesting a tool invocation."),
    new("ToolsCapability", "§16.1 The tools server capability", "Server capability declaring support for tools."),
    new("ToolUiMeta", "§26.3 Declaring a UI on a Tool", "UI metadata declaring an interactive UI on a tool."),
    new("ToolUseContent", "§21.2.6 Messages and Content Blocks", "Sampling content block carrying a tool-use request."),
    new("TraceContextMeta", "§15.4.1 Reserved trace-context metadata keys", "_meta shape carrying W3C trace-context fields."),
    new("UiContentSecurityPolicy", "§26.4 The UI Resource", "Content-security-policy descriptor for a UI resource."),
    new("UiHostContext", "§26.5.1 Initialization handshake", "Host rendering context (theme, display mode, styles) supplied to a UI."),
    new("UiHostExtensionCapability", "§26.2 Extension Identifier and Capability Negotiation", "Capability declaring support for the interactive user-interface extension."),
    new("UiInitializeParams", "§26.5.1 Initialization handshake", "UI-to-host initialization request parameters."),
    new("UiInitializeResult", "§26.5.1 Initialization handshake", "Host-to-UI initialization result (granted permissions, CSP, host context)."),
    new("UiMessageParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host parameters carrying a user-facing message."),
    new("UiPermissions", "§26.4 The UI Resource", "Sandbox permission set requested or granted for a UI resource."),
    new("UnsupportedProtocolVersionError", "§22.3.2 -32004 UnsupportedProtocolVersion", "Error payload reporting that no mutually supported protocol revision exists."),
    new("UntitledMultiSelectEnumSchema", "§20.4 The restricted form schema", "Multi-select enum form-field schema without per-option titles."),
    new("UntitledSingleSelectEnumSchema", "§20.4 The restricted form schema", "Single-select enum form-field schema without per-option titles."),
    new("UpdateModelContextParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host parameters updating the model-visible context."),
    new("UpdateTaskRequest", "§25.8 Supplying Input to a Task: tasks/update", "Request supplying input responses to an in-progress task."),
    new("UpdateTaskResult", "§25.8 Supplying Input to a Task: tasks/update", "Empty acknowledgement returned for a task update."),
    new("WorkingTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the working state."),
  ];

  /// <summary>Looks up the Appendix E entry for a wire <paramref name="type"/> name, or <c>null</c> (spec Appendix E).</summary>
  /// <param name="type">The wire type name.</param>
  /// <returns>The entry, or <c>null</c>.</returns>
  public static TypeIndexEntry? LookupType(string type) =>
    TypeRegistry.FirstOrDefault(e => string.Equals(e.Type, type, StringComparison.Ordinal));
}
