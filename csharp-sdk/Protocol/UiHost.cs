using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// S42 — Interactive UI Extension II: the UI-to-host message dialect, its verbatim method/notification
/// registry, the handshake ordering, message validation, the §26.8 error contract, the host
/// mediation/consent gates, sandbox reporting, and the data-exposure guard (spec §26.5–§26.9). The C#
/// counterpart of the TypeScript <c>protocol/ui-host.ts</c> module.
/// </summary>
/// <remarks>
/// <para>
/// The runtime, dynamic half of the apps extension: the JSON-RPC 2.0 dialect a rendered UI (running in
/// its sandbox) speaks with its host over a host-provided channel. The dialect is framed identically to
/// core MCP (§3): every message is a request, response, or notification. It reuses a small subset of
/// core method names verbatim (<c>tools/call</c>, <c>resources/read</c>, <c>ping</c>,
/// <c>notifications/message</c>) and adds the <c>ui/</c>-prefixed names. Its handshake carries its OWN
/// protocol-version revision (<see cref="DialectProtocolVersion"/>, <c>"2026-01-26"</c>) — independent
/// of the core revision negotiated at <c>server/discover</c>.
/// </para>
/// <para>
/// As with S41, rendering, sandboxing, CSP/permission enforcement, running the channel runtime, and
/// obtaining user consent are HOST responsibilities and are NOT obligations of a server SDK (R-26.9-d).
/// This module models the dialect declaratively — the registry, the message-shape predicates, and a set
/// of host predicates/builders a host implementation consults — but renders nothing and takes no
/// browser/UI-toolkit dependency. The §26.8 error responses reuse the foundation's
/// <see cref="JsonRpcError"/> / <see cref="JsonRpcErrorResponse"/>, and message validation reuses the
/// S03 classifier <see cref="JsonRpcMessageSerializer.FromNode"/>.
/// </para>
/// </remarks>
public static class UiHost
{
  // ─── §26.5 — Dialect protocol version ──────────────────────────────────────────

  /// <summary>
  /// The exact, case-sensitive protocol-version string carried in this dialect's initialization
  /// handshake (spec §26.5, R-26.5-b). It identifies the MESSAGE-DIALECT revision and is INDEPENDENT of
  /// the core protocol revision negotiated at <c>server/discover</c>; conflating them is a conformance
  /// error.
  /// </summary>
  public const string DialectProtocolVersion = "2026-01-26";

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is exactly <see cref="DialectProtocolVersion"/>, matched byte-for-byte (spec R-26.5-b).</summary>
  /// <param name="value">The candidate version string.</param>
  /// <returns><c>true</c> when it matches.</returns>
  public static bool IsUiDialectProtocolVersion(string? value) =>
    string.Equals(value, DialectProtocolVersion, StringComparison.Ordinal);

  // ─── §26.5.1 — Display modes ────────────────────────────────────────────────────

  /// <summary>The three display modes a UI may run in / request, in spec order (spec §26.5.1, §26.5.3).</summary>
  public static IReadOnlyList<string> DisplayModes { get; } = ["inline", "fullscreen", "pip"];

  private static readonly HashSet<string> DisplayModeSet = new(DisplayModes, StringComparer.Ordinal);

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is one of the three defined display modes (spec §26.5.1).</summary>
  /// <param name="value">The candidate display-mode string.</param>
  /// <returns><c>true</c> when defined.</returns>
  public static bool IsUiDisplayMode(string? value) => value is not null && DisplayModeSet.Contains(value);

  // ─── §26.6 — Dialect method / notification registry (verbatim) ─────────────────

  /// <summary>The verbatim dialect method/notification names, reproduced case-sensitively (spec §26.6, R-26.5-a).</summary>
  public static class Methods
  {
    /// <summary>request, UI → Host. Opens the channel (§26.5.1).</summary>
    public const string Initialize = "ui/initialize";

    /// <summary>notification, UI → Host. Handshake completion (§26.5.1).</summary>
    public const string Initialized = "ui/notifications/initialized";

    /// <summary>notification, Host → UI. Complete tool arguments (§26.5.2).</summary>
    public const string ToolInput = "ui/notifications/tool-input";

    /// <summary>notification, Host → UI. Streaming snapshot of tool arguments (§26.5.2).</summary>
    public const string ToolInputPartial = "ui/notifications/tool-input-partial";

    /// <summary>notification, Host → UI. The tool result (§26.5.2).</summary>
    public const string ToolResult = "ui/notifications/tool-result";

    /// <summary>notification, Host → UI. The tool call was cancelled (§26.5.2).</summary>
    public const string ToolCancelled = "ui/notifications/tool-cancelled";

    /// <summary>request, UI → Host. Invoke a server tool (mediated) (§26.5.3).</summary>
    public const string ToolsCall = "tools/call";

    /// <summary>request, UI → Host. Read a server resource (mediated) (§26.5.3).</summary>
    public const string ResourcesRead = "resources/read";

    /// <summary>request, UI → Host. Open an external link (§26.5.3).</summary>
    public const string OpenLink = "ui/open-link";

    /// <summary>request, UI → Host. Insert a conversation message (§26.5.3).</summary>
    public const string Message = "ui/message";

    /// <summary>request, UI → Host. Request a display-mode change (§26.5.3).</summary>
    public const string RequestDisplayMode = "ui/request-display-mode";

    /// <summary>request, UI → Host. Supply content into the model context (§26.5.3).</summary>
    public const string UpdateModelContext = "ui/update-model-context";

    /// <summary>notification, UI → Host. A logging message (core §15.3 shape reused) (§26.5.3).</summary>
    public const string LogMessage = "notifications/message";

    /// <summary>request, UI ↔ Host (either direction). Liveness probe (§26.5.3).</summary>
    public const string Ping = "ping";

    /// <summary>notification, Host → UI. Container size changed (§26.5.4).</summary>
    public const string SizeChanged = "ui/notifications/size-changed";

    /// <summary>notification, Host → UI. Host-context fields changed (partial) (§26.5.4).</summary>
    public const string HostContextChanged = "ui/notifications/host-context-changed";

    /// <summary>request, Host → UI. Tear down before removal (§26.5.4).</summary>
    public const string ResourceTeardown = "ui/resource-teardown";

    /// <summary>notification, Sandbox → Host. Sandbox proxy is ready (host-internal) (§26.5.5).</summary>
    public const string SandboxProxyReady = "ui/notifications/sandbox-proxy-ready";

    /// <summary>notification, Host → Sandbox. Deliver resource HTML + policy (host-internal) (§26.5.5).</summary>
    public const string SandboxResourceReady = "ui/notifications/sandbox-resource-ready";
  }

  /// <summary>Whether a registry entry is a JSON-RPC <c>request</c> or a <c>notification</c> (spec §26.6).</summary>
  public enum DialectKind
  {
    /// <summary>A request that expects a response.</summary>
    Request,

    /// <summary>A notification — no response is sent.</summary>
    Notification,
  }

  /// <summary>The originator/direction of a dialect message, per the §26.6 "Sender" column.</summary>
  public enum DialectSender
  {
    /// <summary>UI → Host.</summary>
    UiToHost,

    /// <summary>Host → UI.</summary>
    HostToUi,

    /// <summary>Either direction (UI ↔ Host).</summary>
    UiOrHost,

    /// <summary>Sandbox → Host (host-internal).</summary>
    SandboxToHost,

    /// <summary>Host → Sandbox (host-internal).</summary>
    HostToSandbox,
  }

  /// <summary>One row of the §26.6 registry: the verbatim name, its kind, and its direction.</summary>
  /// <param name="Name">The verbatim, case-sensitive method/notification name (R-26.5-a).</param>
  /// <param name="Kind">Whether the message is a request or a notification.</param>
  /// <param name="Sender">Which side originates the message.</param>
  public sealed record DialectRegistryEntry(string Name, DialectKind Kind, DialectSender Sender);

  /// <summary>
  /// The complete §26.6 registry, in spec order: all 19 distinct names with their kind and direction.
  /// The host validates a dialect message's <c>method</c> against this table byte-for-byte (spec §26.6,
  /// R-26.5-a).
  /// </summary>
  public static IReadOnlyList<DialectRegistryEntry> DialectRegistry { get; } =
  [
    new(Methods.Initialize, DialectKind.Request, DialectSender.UiToHost),
    new(Methods.Initialized, DialectKind.Notification, DialectSender.UiToHost),
    new(Methods.ToolInput, DialectKind.Notification, DialectSender.HostToUi),
    new(Methods.ToolInputPartial, DialectKind.Notification, DialectSender.HostToUi),
    new(Methods.ToolResult, DialectKind.Notification, DialectSender.HostToUi),
    new(Methods.ToolCancelled, DialectKind.Notification, DialectSender.HostToUi),
    new(Methods.ToolsCall, DialectKind.Request, DialectSender.UiToHost),
    new(Methods.ResourcesRead, DialectKind.Request, DialectSender.UiToHost),
    new(Methods.OpenLink, DialectKind.Request, DialectSender.UiToHost),
    new(Methods.Message, DialectKind.Request, DialectSender.UiToHost),
    new(Methods.RequestDisplayMode, DialectKind.Request, DialectSender.UiToHost),
    new(Methods.UpdateModelContext, DialectKind.Request, DialectSender.UiToHost),
    new(Methods.LogMessage, DialectKind.Notification, DialectSender.UiToHost),
    new(Methods.Ping, DialectKind.Request, DialectSender.UiOrHost),
    new(Methods.SizeChanged, DialectKind.Notification, DialectSender.HostToUi),
    new(Methods.HostContextChanged, DialectKind.Notification, DialectSender.HostToUi),
    new(Methods.ResourceTeardown, DialectKind.Request, DialectSender.HostToUi),
    new(Methods.SandboxProxyReady, DialectKind.Notification, DialectSender.SandboxToHost),
    new(Methods.SandboxResourceReady, DialectKind.Notification, DialectSender.HostToSandbox),
  ];

  private static readonly IReadOnlyDictionary<string, DialectRegistryEntry> DialectByName =
    DialectRegistry.ToDictionary(e => e.Name, StringComparer.Ordinal);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="name"/> is one of the verbatim dialect method/notification
  /// names — matched byte-for-byte and case-sensitively, so <c>"UI/Initialize"</c> or
  /// <c>"ui/Initialize"</c> do NOT match (spec §26.6, R-26.5-a).
  /// </summary>
  /// <param name="name">The candidate name.</param>
  /// <returns><c>true</c> when a dialect name.</returns>
  public static bool IsUiDialectMethodName(string? name) => name is not null && DialectByName.ContainsKey(name);

  /// <summary>Returns the §26.6 registry entry for <paramref name="name"/>, or <c>null</c> when not a dialect name.</summary>
  /// <param name="name">The method/notification name.</param>
  /// <returns>The registry entry, or <c>null</c>.</returns>
  public static DialectRegistryEntry? DialectRegistryEntryFor(string name) =>
    DialectByName.TryGetValue(name, out var entry) ? entry : null;

  // ─── §26.5.1 — Handshake ordering (R-26.5.1-a) ─────────────────────────────────

  /// <summary>The phases of the dialect channel's lifecycle, from the UI's perspective.</summary>
  public enum ChannelPhase
  {
    /// <summary>The UI has sent (or is about to send) <c>ui/initialize</c> and is waiting for the host's response.</summary>
    AwaitingInitResponse,

    /// <summary>The init response has arrived; the UI may now send any subsequent dialect message.</summary>
    Initialized,
  }

  /// <summary>
  /// Returns <c>true</c> when a conforming UI MAY emit a dialect message with <paramref name="method"/>
  /// BEFORE it has received the <c>ui/initialize</c> response. Only <c>ui/initialize</c> itself qualifies;
  /// every other dialect message — including <c>ui/notifications/initialized</c> — MUST wait for the
  /// response (spec §26.5.1, R-26.5.1-a).
  /// </summary>
  /// <param name="method">The method/notification name the UI intends to send.</param>
  /// <returns><c>true</c> when permitted before the init response.</returns>
  public static bool UiMayEmitBeforeInitResponse(string method) =>
    string.Equals(method, Methods.Initialize, StringComparison.Ordinal);

  /// <summary>Outcome of <see cref="CheckHandshakeOrder"/>.</summary>
  /// <param name="Ok"><c>true</c> when the message is allowed in the current phase.</param>
  /// <param name="PrematureMethod">The offending method on a premature-message violation; otherwise <c>null</c>.</param>
  public readonly record struct HandshakeOrderResult(bool Ok, string? PrematureMethod);

  /// <summary>
  /// Conformance check for the handshake-ordering rule (spec §26.5.1, R-26.5.1-a): given the channel
  /// <paramref name="phase"/> and the <paramref name="method"/> the UI is attempting to send, returns
  /// <c>Ok</c> when the message is allowed, or a premature-message violation when the UI emits anything
  /// other than <c>ui/initialize</c> before the init response.
  /// </summary>
  /// <param name="phase">The current channel phase from the UI's perspective.</param>
  /// <param name="method">The method/notification name the UI is attempting to send.</param>
  /// <returns>The ordering outcome.</returns>
  public static HandshakeOrderResult CheckHandshakeOrder(ChannelPhase phase, string method)
  {
    if (phase == ChannelPhase.Initialized) return new HandshakeOrderResult(true, null);
    if (UiMayEmitBeforeInitResponse(method)) return new HandshakeOrderResult(true, null);
    return new HandshakeOrderResult(false, method);
  }

  // ─── §26.5.1 — UiInitializeResult conformance (protocolVersion required) ───────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a well-formed <c>UiInitializeResult</c> — in
  /// particular it carries a string <c>protocolVersion</c>. The absence of that field is a conformance
  /// failure (spec §26.5.1, R-26.5.1-b).
  /// </summary>
  /// <param name="value">The candidate initialize result (raw).</param>
  /// <returns><c>true</c> when conformant.</returns>
  public static bool IsUiInitializeResult(JsonNode? value)
  {
    if (value is not JsonObject obj) return false;
    return obj["protocolVersion"] is JsonValue v && v.GetValueKind() == JsonValueKind.String;
  }

  // ─── §26.7 — Message validation (R-26.7-n, R-26.7-o) ────────────────────────────

  /// <summary>The class an incoming dialect message validates into.</summary>
  public enum DialectMessageClass
  {
    /// <summary>A JSON-RPC request naming a known dialect method.</summary>
    Request,

    /// <summary>A JSON-RPC notification naming a known dialect method.</summary>
    Notification,

    /// <summary>A JSON-RPC response (success or error); responses carry no method.</summary>
    Response,
  }

  /// <summary>Why a dialect message failed validation.</summary>
  public enum DialectValidationFailure
  {
    /// <summary>No failure (the message is valid).</summary>
    None,

    /// <summary>The message failed §3 JSON-RPC framing; the host MUST NOT act on it.</summary>
    MalformedFraming,

    /// <summary>The message names a method that is not a verbatim dialect name.</summary>
    UnknownMethod,
  }

  /// <summary>Outcome of <see cref="ValidateDialectMessage"/>.</summary>
  /// <param name="Ok"><c>true</c> when the message passed framing and (for requests/notifications) names a dialect method.</param>
  /// <param name="Class">The message class on success; meaningless on failure.</param>
  /// <param name="Entry">The dialect registry entry when the message names a known dialect method; otherwise <c>null</c>.</param>
  /// <param name="Failure">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="Detail">A human-readable detail on failure, or <c>null</c>.</param>
  public readonly record struct DialectMessageValidation(
    bool Ok, DialectMessageClass Class, DialectRegistryEntry? Entry, DialectValidationFailure Failure, string? Detail);

  /// <summary>
  /// Validates an incoming dialect message against the §3 JSON-RPC framing BEFORE a host acts on it,
  /// treating the rendered content as untrusted (spec §26.7, R-26.7-n, R-26.7-o).
  /// </summary>
  /// <remarks>
  /// Steps:
  /// <list type="number">
  ///   <item>Classify the raw value with the S03 classifier (rejects batches, bad <c>jsonrpc</c>,
  ///     contradictory members, …). A framing failure is reported as
  ///     <see cref="DialectValidationFailure.MalformedFraming"/> — the host MUST NOT act on it.</item>
  ///   <item>For requests and notifications, require the <c>method</c> to be a verbatim dialect name
  ///     (responses carry no method and pass framing-only). An unrecognized method is reported as
  ///     <see cref="DialectValidationFailure.UnknownMethod"/>; a receiver MUST then answer a REQUEST with
  ///     method-not-found (R-26.8-c) — see <see cref="MethodNotFoundResponse"/>.</item>
  /// </list>
  /// This never throws: a malformed message yields <c>Ok == false</c> rather than propagating the
  /// classifier's exception, so a host can branch on the result.
  /// </remarks>
  /// <param name="raw">The raw incoming message value (untrusted).</param>
  /// <returns>The validation outcome.</returns>
  public static DialectMessageValidation ValidateDialectMessage(JsonNode? raw)
  {
    JsonRpcMessage classified;
    try
    {
      classified = JsonRpcMessageSerializer.FromNode(raw?.DeepClone());
    }
    catch (McpError e)
    {
      return new DialectMessageValidation(false, default, null, DialectValidationFailure.MalformedFraming, e.Message);
    }

    switch (classified)
    {
      case JsonRpcSuccessResponse:
      case JsonRpcErrorResponse:
        return new DialectMessageValidation(true, DialectMessageClass.Response, null, DialectValidationFailure.None, null);

      case JsonRpcRequest request:
        return ClassifyByMethod(request.Method, DialectMessageClass.Request);

      case JsonRpcNotification notification:
        return ClassifyByMethod(notification.Method, DialectMessageClass.Notification);

      default:
        return new DialectMessageValidation(false, default, null, DialectValidationFailure.MalformedFraming, "unknown message kind");
    }
  }

  private static DialectMessageValidation ClassifyByMethod(string method, DialectMessageClass fallbackClass)
  {
    var entry = DialectRegistryEntryFor(method);
    if (entry is null)
    {
      return new DialectMessageValidation(false, default, null, DialectValidationFailure.UnknownMethod, $"unknown dialect method \"{method}\"");
    }
    var cls = entry.Kind == DialectKind.Request ? DialectMessageClass.Request : DialectMessageClass.Notification;
    return new DialectMessageValidation(true, cls, entry, DialectValidationFailure.None, null);
  }

  // ─── §26.8 — Error responses ────────────────────────────────────────────────────

  /// <summary>
  /// Builds a JSON-RPC error response for a failed dialect request, per §3 and §22 (spec §26.8,
  /// R-26.8-a). Reuses the foundation's <see cref="JsonRpcError"/> / <see cref="JsonRpcErrorResponse"/>
  /// so the <c>error</c> shape is the single authoritative one.
  /// </summary>
  /// <param name="id">The request id being answered (echoed verbatim).</param>
  /// <param name="code">The §22 error code.</param>
  /// <param name="message">The human-readable message.</param>
  /// <param name="data">OPTIONAL sender-defined additional detail.</param>
  /// <returns>The error response.</returns>
  public static JsonRpcErrorResponse BuildDialectErrorResponse(RequestId id, int code, string message, JsonNode? data = null) =>
    new(id, new JsonRpcError(code, message, data));

  /// <summary>
  /// Builds the §22 method-not-found (<c>-32601</c>) error response a receiver MUST send when it receives
  /// a dialect REQUEST naming a method it does not implement (spec §26.8, R-26.8-c).
  /// </summary>
  /// <param name="id">The request id being answered.</param>
  /// <param name="message">An optional override; defaults to <c>"Method not found"</c>.</param>
  /// <returns>The method-not-found error response.</returns>
  public static JsonRpcErrorResponse MethodNotFoundResponse(RequestId id, string message = "Method not found") =>
    BuildDialectErrorResponse(id, ErrorCodes.MethodNotFound, message);

  /// <summary>
  /// The set of UI-initiated requests that a host, when it declines them (for lack of consent, policy,
  /// or an unknown method), MUST answer with a §22 error rather than silently dropping (spec §26.8,
  /// R-26.8-b).
  /// </summary>
  public static IReadOnlyList<string> DeclinableUiRequests { get; } =
  [
    Methods.ToolsCall,
    Methods.ResourcesRead,
    Methods.OpenLink,
    Methods.Message,
    Methods.UpdateModelContext,
  ];

  /// <summary>Why a host declined a UI-initiated request, used to pick the §22 error code (spec §26.8).</summary>
  public enum DeclineReason
  {
    /// <summary>The user did not consent to the action.</summary>
    NoConsent,

    /// <summary>The host's policy forbids the action (incl. an effective-visibility rejection).</summary>
    Policy,

    /// <summary>The named method is not implemented.</summary>
    UnknownMethod,

    /// <summary>The request's params were invalid.</summary>
    InvalidParams,
  }

  /// <summary>
  /// Maps a <see cref="DeclineReason"/> to the §22 error code a host returns when it declines a
  /// UI-initiated request (spec §26.8, R-26.8-b): <c>unknown-method</c> → <c>-32601</c>,
  /// <c>invalid-params</c> → <c>-32602</c>, <c>no-consent</c>/<c>policy</c> → <c>-32603</c>. Whichever
  /// reason applies, the host MUST return an error — never a silent drop.
  /// </summary>
  /// <param name="reason">The decline reason.</param>
  /// <returns>The §22 error code.</returns>
  public static int DeclineErrorCode(DeclineReason reason) => reason switch
  {
    DeclineReason.UnknownMethod => ErrorCodes.MethodNotFound,
    DeclineReason.InvalidParams => ErrorCodes.InvalidParams,
    DeclineReason.NoConsent => ErrorCodes.InternalError,
    DeclineReason.Policy => ErrorCodes.InternalError,
    _ => throw new ArgumentOutOfRangeException(nameof(reason)),
  };

  /// <summary>
  /// Builds the §22 error response a host returns when it DECLINES a UI-initiated request, instead of
  /// silently dropping it (spec §26.8, R-26.8-b). The code is selected from <paramref name="reason"/> by
  /// <see cref="DeclineErrorCode"/>.
  /// </summary>
  /// <param name="id">The request id being declined.</param>
  /// <param name="reason">Why the host declined.</param>
  /// <param name="message">An optional human-readable message; defaults to a reason-derived message.</param>
  /// <returns>The decline error response.</returns>
  public static JsonRpcErrorResponse BuildDeclineErrorResponse(RequestId id, DeclineReason reason, string? message = null) =>
    BuildDialectErrorResponse(id, DeclineErrorCode(reason), message ?? DefaultDeclineMessage(reason));

  private static string DefaultDeclineMessage(DeclineReason reason) => reason switch
  {
    DeclineReason.UnknownMethod => "Method not found",
    DeclineReason.InvalidParams => "Invalid params",
    DeclineReason.NoConsent => "Declined: user consent not obtained",
    DeclineReason.Policy => "Declined: host policy",
    _ => "Declined",
  };

  // ─── §26.5.3 / §26.7 — Host mediation & consent gating ──────────────────────────

  /// <summary>The host's per-request mediation policy inputs for a UI-initiated <c>tools/call</c> (spec §26.5.3, §26.7).</summary>
  /// <param name="UiMeta">The tool's UI declaration (S41 <c>_meta.ui</c>), or <c>null</c> if it has none.</param>
  /// <param name="UserConsented">Whether the user has granted consent for this invocation (R-26.7-j).</param>
  /// <param name="PolicyAllows">Whether the host's tool-execution policy permits this invocation (R-26.7-j).</param>
  public readonly record struct ToolsCallMediationInput(ToolUiMeta? UiMeta, bool UserConsented, bool PolicyAllows);

  /// <summary>Outcome of a host mediation decision.</summary>
  /// <param name="Route"><c>true</c> when the host may route the request onward to the server.</param>
  /// <param name="Reason">
  /// The decline reason when <paramref name="Route"/> is <c>false</c>; <c>null</c> on the routed
  /// (success) path, where no reason applies.
  /// </param>
  public readonly record struct MediationDecision(bool Route, DeclineReason? Reason);

  /// <summary>A routed (success) mediation decision: the host may forward the request and no decline reason applies.</summary>
  private static readonly MediationDecision Routed = new(true, null);

  /// <summary>
  /// Decides whether a host may route a UI-initiated <c>tools/call</c> to the server (spec §26.5.3,
  /// §26.7, R-26.5.3-a, R-26.5.3-b, R-26.7-i, R-26.7-j, R-26.7-k).
  /// </summary>
  /// <remarks>
  /// The host routes the call ONLY when ALL hold, in this precedence:
  /// <list type="number">
  ///   <item>the tool's effective <c>visibility</c> includes <c>"app"</c> (SHOULD reject otherwise —
  ///     reuses <see cref="Ui.HostShouldRejectUiOriginatedCall"/>); a rejection here is a
  ///     <see cref="DeclineReason.Policy"/> decline;</item>
  ///   <item>the host's tool-execution policy permits the call (<see cref="DeclineReason.Policy"/>);</item>
  ///   <item>the user has consented (<see cref="DeclineReason.NoConsent"/>).</item>
  /// </list>
  /// A path that reaches the server WITHOUT prior consent and policy is a failure: this function returns
  /// <c>Route == false</c> in every such case, and the caller MUST answer with the corresponding §22
  /// error (never a silent drop).
  /// </remarks>
  /// <param name="input">The host's mediation inputs.</param>
  /// <returns>The mediation decision.</returns>
  public static MediationDecision MediateUiToolsCall(ToolsCallMediationInput input)
  {
    // R-26.7-k / R-26.5.3-b: reject when effective visibility excludes "app".
    if (Ui.HostShouldRejectUiOriginatedCall(input.UiMeta))
    {
      return new MediationDecision(false, DeclineReason.Policy);
    }
    // R-26.7-j: the host's tool-execution policy MUST permit the call.
    if (!input.PolicyAllows)
    {
      return new MediationDecision(false, DeclineReason.Policy);
    }
    // R-26.7-j: user consent MUST be obtained before routing.
    if (!input.UserConsented)
    {
      return new MediationDecision(false, DeclineReason.NoConsent);
    }
    return Routed;
  }

  /// <summary>
  /// Decides whether a host may honor a <c>ui/open-link</c> request. The host MAY decline and SHOULD
  /// confirm with the user before honoring it; a non-confirming auto-open is a conformance failure (spec
  /// §26.5.3, §26.7, R-26.5.3-d, R-26.7-l). Returns <c>Route == true</c> only when the host both chose to
  /// honor the request AND obtained the user's confirmation; otherwise a <see cref="DeclineReason.Policy"/>
  /// (host declined) or <see cref="DeclineReason.NoConsent"/> (no confirmation) decline.
  /// </summary>
  /// <param name="hostHonors">Whether the host chooses to honor the request (MAY decline).</param>
  /// <param name="userConfirmed">Whether the user confirmed opening the link (SHOULD confirm).</param>
  /// <returns>The mediation decision.</returns>
  public static MediationDecision MediateOpenLink(bool hostHonors, bool userConfirmed)
  {
    if (!hostHonors) return new MediationDecision(false, DeclineReason.Policy);
    if (!userConfirmed) return new MediationDecision(false, DeclineReason.NoConsent);
    return Routed;
  }

  /// <summary>
  /// Decides whether a host may honor a <c>ui/message</c> insertion. The host SHOULD confirm with the
  /// user before inserting the message into the conversation (spec §26.7, R-26.7-l). Same gate shape as
  /// <see cref="MediateOpenLink"/>.
  /// </summary>
  /// <param name="hostHonors">Whether the host chooses to honor the request.</param>
  /// <param name="userConfirmed">Whether the user confirmed inserting the message.</param>
  /// <returns>The mediation decision.</returns>
  public static MediationDecision MediateUiMessage(bool hostHonors, bool userConfirmed) =>
    MediateOpenLink(hostHonors, userConfirmed);

  /// <summary>
  /// Applies a <c>ui/request-display-mode</c> request: the host MAY grant a mode different from the one
  /// requested, and the result reports the mode actually applied (spec §26.5.3, R-26.5.3-e). Returns the
  /// result params object carrying the applied mode.
  /// </summary>
  /// <param name="applied">The mode the host actually applies (MAY differ from the request).</param>
  /// <returns>The result params object <c>{ "mode": applied }</c>.</returns>
  public static JsonObject BuildDisplayModeResult(string applied) => new() { ["mode"] = applied };

  /// <summary>
  /// Builds the prompt success response to a <c>ping</c>: an empty result <c>{}</c> (spec §26.5.3,
  /// R-26.5.3-f, R-26.5.3-g). The receiver MUST respond promptly so the sender can confirm the peer is
  /// live.
  /// </summary>
  /// <param name="id">The <c>ping</c> request id being answered.</param>
  /// <returns>The empty success response.</returns>
  public static JsonRpcSuccessResponse BuildPingResponse(RequestId id) => new(id, new JsonObject());

  /// <summary>
  /// Builds the empty <c>{}</c> success response a UI returns to a <c>ui/resource-teardown</c> request
  /// after releasing its resources (spec §26.5.4, R-26.5.4-a).
  /// </summary>
  /// <param name="id">The teardown request id being answered.</param>
  /// <returns>The empty success response.</returns>
  public static JsonRpcSuccessResponse BuildTeardownResponse(RequestId id) => new(id, new JsonObject());

  // ─── §26.7 — Sandbox CSP / permission enforcement ───────────────────────────────

  /// <summary>
  /// Computes the GRANTED permission set for a UI resource, enforcing R-26.7-h: the host MUST NOT grant
  /// any permission the resource did not request, and MAY decline a requested one (spec §26.7, R-26.7-h).
  /// The result is exactly what <c>hostCapabilities.sandbox.permissions</c> reports. Starts from the
  /// resource's requested set, keeps only members the resource requested, and drops any the host chose
  /// to decline.
  /// </summary>
  /// <param name="requested">The resource's declared <c>permissions</c> (S41), or <c>null</c>.</param>
  /// <param name="declined">The permission names the host declines (the host's own R-26.7-h choice); members not requested are ignored.</param>
  /// <returns>The granted permissions.</returns>
  public static UiPermissions GrantedPermissions(UiPermissions? requested, IEnumerable<Ui.UiPermissionName>? declined = null)
  {
    var declineSet = declined is null ? new HashSet<Ui.UiPermissionName>() : new HashSet<Ui.UiPermissionName>(declined);
    if (requested is null) return new UiPermissions();
    return new UiPermissions
    {
      Camera = Keep(requested.Camera, Ui.UiPermissionName.Camera),
      Microphone = Keep(requested.Microphone, Ui.UiPermissionName.Microphone),
      Geolocation = Keep(requested.Geolocation, Ui.UiPermissionName.Geolocation),
      ClipboardWrite = Keep(requested.ClipboardWrite, Ui.UiPermissionName.ClipboardWrite),
    };

    JsonObject? Keep(JsonObject? value, Ui.UiPermissionName name) =>
      value is not null && !declineSet.Contains(name) ? value : null;
  }

  /// <summary>
  /// Builds the <c>hostCapabilities.sandbox</c> report for the initialize result as a JSON object: the
  /// EFFECTIVE CSP the host applied and the GRANTED permission set (spec §26.7, R-26.7-g, R-26.7-h). The
  /// CSP is resolved via <see cref="Ui.ResolveCsp"/> (declared <c>csp</c>, else deny-by-default), and the
  /// permissions via <see cref="GrantedPermissions"/>.
  /// </summary>
  /// <param name="effectiveCsp">The effective CSP the host applied; reported verbatim under <c>sandbox.csp</c>.</param>
  /// <param name="granted">The granted permission set; reported verbatim under <c>sandbox.permissions</c>.</param>
  /// <returns>The sandbox report object.</returns>
  public static JsonObject BuildSandboxReport(UiContentSecurityPolicy effectiveCsp, UiPermissions granted)
  {
    ArgumentNullException.ThrowIfNull(effectiveCsp);
    ArgumentNullException.ThrowIfNull(granted);
    return new JsonObject
    {
      ["csp"] = JsonSerializer.SerializeToNode(effectiveCsp, Stackific.Mcp.McpJson.Options),
      ["permissions"] = JsonSerializer.SerializeToNode(granted, Stackific.Mcp.McpJson.Options),
    };
  }

  // ─── §26.4 — Dedicated render origin (R-26.4-l) ─────────────────────────────────

  /// <summary>
  /// Returns the dedicated render origin a UI resource declared via its <c>domain</c> UI-metadata field
  /// (spec §26.4, R-26.4-l), or <c>null</c> when none was declared. A host SHOULD render such a resource
  /// under its own isolated origin so it cannot reach the cookies/storage of other UI surfaces.
  /// </summary>
  /// <param name="meta">The resource's UI metadata, or <c>null</c>.</param>
  /// <returns>The declared dedicated origin, or <c>null</c>.</returns>
  public static string? DedicatedRenderOrigin(ResourceUiMeta? meta) => meta?.Domain;

  /// <summary>
  /// Returns <c>true</c> when a UI is isolated under its declared dedicated origin (spec §26.4, R-26.4-l):
  /// either no <paramref name="declaredDomain"/> was declared (no isolation constraint applies), or the
  /// <paramref name="renderOrigin"/> equals the declared domain AND is not shared with any other UI surface
  /// in <paramref name="otherUiOrigins"/>. Origins are compared byte-for-byte (never case-folded).
  /// </summary>
  /// <param name="declaredDomain">The resource's declared dedicated origin, or <c>null</c> when none.</param>
  /// <param name="renderOrigin">The origin the host actually rendered the UI under.</param>
  /// <param name="otherUiOrigins">The render origins of the host's other UI surfaces.</param>
  /// <returns><c>true</c> when the isolation requirement is satisfied (or not applicable).</returns>
  public static bool IsIsolatedUnderDedicatedOrigin(string? declaredDomain, string renderOrigin, IEnumerable<string> otherUiOrigins)
  {
    ArgumentNullException.ThrowIfNull(renderOrigin);
    ArgumentNullException.ThrowIfNull(otherUiOrigins);
    return declaredDomain is null
      || (string.Equals(renderOrigin, declaredDomain, StringComparison.Ordinal)
          && !otherUiOrigins.Contains(renderOrigin, StringComparer.Ordinal));
  }

  // ─── §26.7 — Data-exposure guard (R-26.7-m) ─────────────────────────────────────

  /// <summary>
  /// The keys a host MUST NOT expose to the UI: credentials, authorization tokens (§23), and unrelated
  /// conversation/context data (spec §26.7, R-26.7-m). This list is illustrative of the categories a host
  /// must withhold; the authoritative rule is the inclusion test <see cref="UiExposureIsClean"/>, which
  /// keys off the allow-list rather than this deny-list.
  /// </summary>
  public static IReadOnlyList<string> ForbiddenUiExposureKeys { get; } =
  [
    "credentials",
    "authorization",
    "authorizationToken",
    "accessToken",
    "token",
    "apiKey",
    "cookies",
    "conversation",
    "conversationHistory",
  ];

  /// <summary>
  /// The ONLY data categories a host MAY make available to the rendered UI: the tool input and result it
  /// was rendered for, and host context explicitly delivered through the dialect (spec §26.7, R-26.7-m).
  /// </summary>
  public static IReadOnlyList<string> AllowedUiExposureKeys { get; } = ["toolInput", "toolResult", "hostContext"];

  private static readonly HashSet<string> AllowedUiExposureSet = new(AllowedUiExposureKeys, StringComparer.Ordinal);

  /// <summary>
  /// Returns <c>true</c> when the data a host is about to expose to the UI contains ONLY permitted
  /// categories — every top-level key is in <see cref="AllowedUiExposureKeys"/>. Any other key (a
  /// credential, token, cookie, or unrelated conversation/context datum) makes the exposure dirty (spec
  /// §26.7, R-26.7-m). The check is allow-list based (not merely "no forbidden key present"), so an
  /// unforeseen leaking key is caught too.
  /// </summary>
  /// <param name="exposed">The object a host intends to hand to the UI.</param>
  /// <returns><c>true</c> when the exposure is clean.</returns>
  public static bool UiExposureIsClean(JsonObject exposed)
  {
    ArgumentNullException.ThrowIfNull(exposed);
    return exposed.All(kv => AllowedUiExposureSet.Contains(kv.Key));
  }

  // ─── §26.7 — Sandbox isolation model (declarative; R-26.7-a/b/c) ────────────────

  /// <summary>The single permitted path between UI and host: the §26.5 dialect channel (spec R-26.7-c).</summary>
  public const string DialectChannelPath = "ui-dialect-channel";

  /// <summary>
  /// The access categories a sandboxed UI MUST be denied: the embedding document's DOM, cookies,
  /// storage, and navigation (spec §26.7, R-26.7-a, R-26.7-b). A host renders the UI in an isolated
  /// browsing context that blocks every one of these.
  /// </summary>
  public static IReadOnlyList<string> SandboxDeniedAccess { get; } = ["dom", "cookies", "storage", "navigation"];

  /// <summary>
  /// Returns <c>true</c> when a proposed sandbox configuration is conforming: it denies EVERY category in
  /// <see cref="SandboxDeniedAccess"/>, leaving the §26.5 dialect channel as the only path between the UI
  /// and the host (spec §26.7, R-26.7-a, R-26.7-b, R-26.7-c).
  /// </summary>
  /// <param name="deniedAccess">The access categories the sandbox denies.</param>
  /// <returns><c>true</c> when conforming.</returns>
  public static bool SandboxIsolationIsConforming(IEnumerable<string> deniedAccess)
  {
    ArgumentNullException.ThrowIfNull(deniedAccess);
    var denied = new HashSet<string>(deniedAccess, StringComparer.Ordinal);
    return SandboxDeniedAccess.All(denied.Contains);
  }

  /// <summary>
  /// Returns <c>true</c> when the §26.5 dialect channel is the ONLY path granted between the rendered UI
  /// and the host — i.e. no other ambient path to host or user data exists (spec §26.7, R-26.7-c).
  /// </summary>
  /// <param name="grantedPaths">The set of paths the host grants the UI to reach host/user data.</param>
  /// <returns><c>true</c> when only the dialect channel is granted.</returns>
  public static bool DialectIsOnlyChannel(IEnumerable<string> grantedPaths)
  {
    ArgumentNullException.ThrowIfNull(grantedPaths);
    var paths = grantedPaths.ToList();
    return paths.Count == 1 && string.Equals(paths[0], DialectChannelPath, StringComparison.Ordinal);
  }

  // ─── §26.9 — SDK scope summary ──────────────────────────────────────────────────

  /// <summary>The server-side obligations of this extension; a server-side implementation MUST support all three (spec §26.9, R-26.9-a..c).</summary>
  public static IReadOnlyList<string> ServerSdkObligations { get; } =
    ["acknowledge-extension", "declare-ui-meta", "serve-ui-resource"];

  private static readonly HashSet<string> ServerSdkObligationSet = new(ServerSdkObligations, StringComparer.Ordinal);

  /// <summary>The host/client-only concerns that are NOT obligations of a server SDK (spec §26.9, R-26.9-d).</summary>
  public static IReadOnlyList<string> HostOnlyConcerns { get; } =
    ["render-sandboxed", "enforce-csp-permissions", "run-dialect-runtime", "obtain-consent"];

  /// <summary>
  /// Returns <c>true</c> when <paramref name="concern"/> is a SERVER-SDK obligation under this extension
  /// (one of <see cref="ServerSdkObligations"/>); returns <c>false</c> for any host-only concern (spec
  /// §26.9, R-26.9-d).
  /// </summary>
  /// <param name="concern">A server obligation or host-only concern name.</param>
  /// <returns><c>true</c> when a server-SDK obligation.</returns>
  public static bool IsServerSdkObligation(string concern) =>
    concern is not null && ServerSdkObligationSet.Contains(concern);
}
