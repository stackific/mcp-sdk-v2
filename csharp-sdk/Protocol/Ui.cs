using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Stackific.Mcp.Json;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// Constants for the Interactive User-Interface extension (spec §26): the UI resource MIME type
/// (§26.4) and the extension identifier used to negotiate the extension (§26.2).
/// </summary>
public static class UiResource
{
  /// <summary>
  /// The MIME type a UI resource MUST be served with (§26.4). Reproduced verbatim and matched
  /// case-sensitively, including the <c>;profile=mcp-app</c> profile parameter and the absence of
  /// surrounding whitespace; a host advertises this exact string in its <c>mimeTypes</c> (§26.2).
  /// </summary>
  public const string MimeType = "text/html;profile=mcp-app";

  /// <summary>
  /// The extension identifier <c>io.modelcontextprotocol/ui</c> (§26.2), used as the key under the
  /// <c>extensions</c> capability map; treated as an opaque, case-sensitive string.
  /// </summary>
  public const string ExtensionId = MetaKeys.UiExtension;
}

/// <summary>
/// The audiences a tool with a declared UI is exposed to (spec §26.3 <c>visibility</c>). When the
/// <c>visibility</c> array is omitted it is treated as both <see cref="Model"/> and <see cref="App"/>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<UiVisibility>))]
public enum UiVisibility
{
  /// <summary>The tool is visible to, and callable by, the model/agent through the ordinary tool-calling flow (§26.3, §16).</summary>
  [JsonStringEnumMemberName("model")]
  Model,

  /// <summary>The tool is callable by the rendered UI through the message-channel dialect, subject to host mediation and consent (§26.3, §26.5, §26.7).</summary>
  [JsonStringEnumMemberName("app")]
  App,
}

/// <summary>
/// The object placed under a tool's <c>_meta.ui</c> key to declare its associated interactive user
/// interface (spec §26.3). A receiver that has not negotiated the extension MUST ignore this key (§24).
/// </summary>
public sealed record ToolUiMeta
{
  /// <summary>
  /// REQUIRED. A URI in the <c>ui://</c> scheme identifying the UI resource to render for this tool;
  /// the host obtains it by issuing <c>resources/read</c> for this exact URI (§26.3, §26.4, §17).
  /// </summary>
  public required string ResourceUri { get; init; }

  /// <summary>
  /// OPTIONAL. The audiences the tool is exposed to; elements are drawn from <see cref="UiVisibility"/>.
  /// When omitted the value is treated as <c>["model", "app"]</c> (§26.3).
  /// </summary>
  public IReadOnlyList<UiVisibility>? Visibility { get; init; }
}

/// <summary>
/// A content-security-policy descriptor for a UI resource (spec §26.4). Each member lists origin
/// strings; an origin not present in the applicable member MUST be blocked by the host. When the
/// whole <see cref="ResourceUiMeta.Csp"/> is omitted the host applies a deny-by-default policy (§26.7).
/// </summary>
public sealed record UiContentSecurityPolicy
{
  /// <summary>OPTIONAL. Origins the UI MAY open network connections to (§26.4).</summary>
  public IReadOnlyList<string>? ConnectDomains { get; init; }

  /// <summary>OPTIONAL. Origins the UI MAY load resources (scripts, stylesheets, images, media) from (§26.4).</summary>
  public IReadOnlyList<string>? ResourceDomains { get; init; }

  /// <summary>OPTIONAL. Origins the UI MAY embed in nested frames (§26.4).</summary>
  public IReadOnlyList<string>? FrameDomains { get; init; }

  /// <summary>OPTIONAL. Origins permitted as the document base URI (§26.4).</summary>
  public IReadOnlyList<string>? BaseUriDomains { get; init; }
}

/// <summary>
/// The sandbox permissions a UI resource requests (spec §26.4). Each member's <em>presence</em>
/// requests that capability and its value is an empty object; the host MUST NOT grant a capability
/// that is not requested and MAY decline a requested one (§26.7). Absent members are <c>null</c>.
/// </summary>
public sealed record UiPermissions
{
  /// <summary>OPTIONAL. Present (an empty object) to request camera access (§26.4).</summary>
  public JsonObject? Camera { get; init; }

  /// <summary>OPTIONAL. Present (an empty object) to request microphone access (§26.4).</summary>
  public JsonObject? Microphone { get; init; }

  /// <summary>OPTIONAL. Present (an empty object) to request geolocation access (§26.4).</summary>
  public JsonObject? Geolocation { get; init; }

  /// <summary>OPTIONAL. Present (an empty object) to request clipboard-write access (§26.4).</summary>
  public JsonObject? ClipboardWrite { get; init; }
}

/// <summary>
/// Presentation and security hints carried under a UI resource <c>contents</c> entry's own
/// <c>_meta.ui</c> object (spec §26.4). When present on the resource these hints take effect for
/// rendering; all fields are OPTIONAL.
/// </summary>
public sealed record ResourceUiMeta
{
  /// <summary>OPTIONAL. The origins the UI may contact, load resources from, frame, or use as a base URI (§26.4).</summary>
  public UiContentSecurityPolicy? Csp { get; init; }

  /// <summary>OPTIONAL. The sandbox permissions the UI requests (§26.4).</summary>
  public UiPermissions? Permissions { get; init; }

  /// <summary>OPTIONAL. A dedicated origin under which the host SHOULD render the UI, isolating it from other UI resources (§26.4).</summary>
  public string? Domain { get; init; }

  /// <summary>OPTIONAL. The server's preference that the host render a visible border around the UI; the host MAY ignore it (§26.4).</summary>
  public bool? PrefersBorder { get; init; }
}

/// <summary>
/// The value a host advertises under the <c>io.modelcontextprotocol/ui</c> key of its
/// <c>extensions</c> capability map (spec §26.2). A server MUST NOT declare UI associations unless a
/// host has advertised this with a <see cref="MimeTypes"/> array that includes <see cref="UiResource.MimeType"/>.
/// </summary>
public sealed record UiHostExtensionCapability
{
  /// <summary>
  /// REQUIRED. The UI resource MIME types the host can render as interactive user interfaces. A host
  /// supporting this extension MUST include the exact string <see cref="UiResource.MimeType"/>,
  /// matched verbatim and case-sensitively (§26.2).
  /// </summary>
  public required IReadOnlyList<string> MimeTypes { get; init; }
}

/// <summary>
/// S41 — Interactive UI Extension I: the server-facing, static behavior of the apps extension (spec
/// §26.1–§26.4). The C# counterpart of the TypeScript <c>protocol/ui.ts</c> module: MIME/scheme
/// predicates, host-advertisement reading, server gating (R-26.2-f/g), the visibility model
/// (R-26.3-e/f), CSP/permission logic, and the UI-resource builders.
/// </summary>
/// <remarks>
/// <para>
/// The extension is an instance of the general Extension Mechanism (§24): the identifier
/// <see cref="UiResource.ExtensionId"/> is an ordinary key in the <c>extensions</c> capability map,
/// negotiated by intersection (reusing <see cref="Extensions"/>), and <c>_meta.ui</c> is the
/// extension's reserved tool-metadata key. Rendering, sandbox/CSP enforcement, the message channel, and
/// consent mediation are HOST responsibilities and are NOT implemented here — this models the host
/// obligations declaratively (as constants and predicates a host consults) but renders nothing.
/// </para>
/// </remarks>
public static class Ui
{
  /// <summary>The <c>ui://</c> URI scheme prefix designating an MCP UI resource (spec §26.4, R-26.4-b).</summary>
  public const string UriScheme = "ui://";

  /// <summary>The reserved nested key under a tool's <c>_meta</c> that carries the UI declaration: <c>ui</c> (spec §26.3).</summary>
  public const string ToolUiMetaKey = "ui";

  // ─── §26.2 — MIME type & ui:// scheme predicates ───────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="mimeType"/> is exactly the UI MIME type
  /// <see cref="UiResource.MimeType"/> — matched verbatim and case-sensitively, with NO whitespace
  /// tolerance (spec §26.2/§26.4, R-26.2-e, R-26.4-d). <c>"text/html; profile=mcp-app"</c> (extra space)
  /// and <c>"TEXT/HTML;PROFILE=MCP-APP"</c> (wrong case) do NOT satisfy the requirement.
  /// </summary>
  /// <param name="mimeType">The candidate MIME type.</param>
  /// <returns><c>true</c> when byte-exactly the UI MIME type.</returns>
  public static bool IsUiMimeType(string? mimeType) =>
    string.Equals(mimeType, UiResource.MimeType, StringComparison.Ordinal);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="uri"/> is a <c>ui://</c>-scheme URI string. The authority
  /// and path after <c>ui://</c> are server-defined and opaque; this only checks the scheme — the host
  /// MUST treat the whole URI as an opaque identifier and derive no network origin from it (spec §26.4,
  /// R-26.3-b, R-26.4-b, R-26.4-c).
  /// </summary>
  /// <param name="uri">The candidate URI.</param>
  /// <returns><c>true</c> when it begins with the <c>ui://</c> scheme.</returns>
  public static bool IsUiResourceUri(string? uri) =>
    uri is not null && uri.StartsWith(UriScheme, StringComparison.Ordinal);

  // ─── §26.2 — Host capability shape & advertisement ─────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a well-formed <c>UiHostExtensionCapability</c>
  /// — a JSON object carrying a <c>mimeTypes</c> string array (spec §26.2, R-26.2-d). This does NOT
  /// require the UI MIME type to be present — use <see cref="CapabilityRendersUi"/> for that.
  /// </summary>
  /// <param name="value">The candidate host capability value (raw).</param>
  /// <returns><c>true</c> when well-formed.</returns>
  public static bool IsUiHostExtensionCapability(JsonNode? value)
  {
    if (value is not JsonObject obj) return false;
    if (obj["mimeTypes"] is not JsonArray array) return false;
    return array.All(n => n is JsonValue v && v.GetValueKind() == JsonValueKind.String);
  }

  /// <summary>
  /// Returns <c>true</c> when an advertised host capability value enables UI rendering: it is a
  /// well-formed <see cref="IsUiHostExtensionCapability"/> AND its <c>mimeTypes</c> array contains the
  /// verbatim <see cref="UiResource.MimeType"/> (spec §26.2, R-26.2-d, R-26.2-e).
  /// </summary>
  /// <param name="value">The advertised host capability value (raw).</param>
  /// <returns><c>true</c> when the capability conformingly advertises UI rendering.</returns>
  public static bool CapabilityRendersUi(JsonNode? value)
  {
    if (!IsUiHostExtensionCapability(value)) return false;
    var array = (JsonArray)((JsonObject)value!)["mimeTypes"]!;
    return array.Any(n => n is JsonValue v && v.GetValueKind() == JsonValueKind.String && IsUiMimeType(v.GetValue<string>()));
  }

  /// <summary>
  /// Builds a conformant <see cref="UiHostExtensionCapability"/> for a host that supports UI rendering.
  /// <see cref="UiResource.MimeType"/> is always included (deduplicated) so the result satisfies
  /// R-26.2-e; additional renderable MIME types are appended in order (spec §26.2, R-26.2-d, R-26.2-e).
  /// </summary>
  /// <param name="additionalMimeTypes">Extra renderable MIME types beyond the mandatory UI type.</param>
  /// <returns>The host capability.</returns>
  public static UiHostExtensionCapability BuildUiHostExtensionCapability(
    IReadOnlyList<string>? additionalMimeTypes = null)
  {
    var mimeTypes = new List<string> { UiResource.MimeType };
    foreach (var mime in additionalMimeTypes ?? [])
    {
      if (!string.Equals(mime, UiResource.MimeType, StringComparison.Ordinal)) mimeTypes.Add(mime);
    }
    return new UiHostExtensionCapability { MimeTypes = mimeTypes };
  }

  /// <summary>
  /// Reads the <c>UiHostExtensionCapability</c> a host advertised under
  /// <see cref="UiResource.ExtensionId"/> from an <c>extensions</c> map (raw), or <c>null</c> when the
  /// extension is not validly advertised or its value is not a well-formed capability (spec §26.2,
  /// R-26.2-c, R-26.2-d).
  /// </summary>
  /// <param name="extensionsMap">A host's advertised <c>extensions</c> map (raw).</param>
  /// <returns>The advertised capability node, or <c>null</c>.</returns>
  public static JsonObject? GetUiHostCapability(JsonObject? extensionsMap)
  {
    var settings = Extensions.GetSettings(extensionsMap, UiResource.ExtensionId);
    if (settings is null) return null;
    return IsUiHostExtensionCapability(settings) ? settings : null;
  }

  /// <summary>
  /// Returns <c>true</c> when a host's <c>extensions</c> map advertises the apps extension in a way that
  /// enables UI rendering: the <see cref="UiResource.ExtensionId"/> key is present with a capability
  /// whose <c>mimeTypes</c> includes the verbatim <see cref="UiResource.MimeType"/> (spec §26.2,
  /// R-26.2-c, R-26.2-d, R-26.2-e). This is the predicate behind the server's two prohibitions —
  /// <see cref="MayServerDeclareUi"/> / <see cref="MayServerExpectRendering"/>.
  /// </summary>
  /// <param name="extensionsMap">A host's advertised <c>extensions</c> map (raw).</param>
  /// <returns><c>true</c> when UI rendering is conformingly advertised.</returns>
  public static bool HostAdvertisesUiRendering(JsonObject? extensionsMap) =>
    CapabilityRendersUi(GetUiHostCapability(extensionsMap));

  /// <summary>
  /// Reads the host's advertised <c>extensions</c> map from a single request's <c>_meta</c> (the map
  /// nested under <c>io.modelcontextprotocol/clientCapabilities.extensions</c>) and reports whether it
  /// advertises UI rendering with the required MIME type (spec §26.2, R-26.2-c). A host that supports
  /// rendering MUST advertise the extension in the <c>_meta</c> of EVERY request; a request whose
  /// <c>_meta</c> omits the advertisement — or omits <c>clientCapabilities</c> entirely — yields
  /// <c>false</c>, and the server treats that request as if the extension were inactive (R-26.2-i).
  /// </summary>
  /// <param name="requestMeta">The request's <c>_meta</c> object (raw).</param>
  /// <returns><c>true</c> when the request advertises UI rendering.</returns>
  public static bool RequestAdvertisesUiRendering(JsonNode? requestMeta)
  {
    if (requestMeta is not JsonObject meta) return false;
    if (meta[Stackific.Mcp.Json.MetaKeys.ClientCapabilities] is not JsonObject clientCaps) return false;
    if (clientCaps["extensions"] is not JsonObject extensions) return false;
    return HostAdvertisesUiRendering(extensions);
  }

  // ─── §26.2 — Server gating: may declare UI / expect rendering ──────────────────

  /// <summary>
  /// Returns <c>true</c> when a server MAY declare UI associations on its tools — only when the host has
  /// advertised the extension with a <c>mimeTypes</c> array that includes the verbatim
  /// <see cref="UiResource.MimeType"/>. A server MUST NOT declare UI associations otherwise (spec §26.2,
  /// R-26.2-f).
  /// </summary>
  /// <param name="hostExtensionsMap">The host's advertised <c>extensions</c> map (raw).</param>
  /// <returns><c>true</c> when the server may declare UI.</returns>
  public static bool MayServerDeclareUi(JsonObject? hostExtensionsMap) =>
    HostAdvertisesUiRendering(hostExtensionsMap);

  /// <summary>
  /// Returns <c>true</c> when a server MAY expect a UI resource to be rendered — only when the host
  /// advertised the extension with the required <see cref="UiResource.MimeType"/>. A server MUST NOT
  /// expect rendering otherwise (spec §26.2, R-26.2-g). Same gate as <see cref="MayServerDeclareUi"/>,
  /// named separately so each prohibition reads clearly at the call site.
  /// </summary>
  /// <param name="hostExtensionsMap">The host's advertised <c>extensions</c> map (raw).</param>
  /// <returns><c>true</c> when the server may expect rendering.</returns>
  public static bool MayServerExpectRendering(JsonObject? hostExtensionsMap) =>
    HostAdvertisesUiRendering(hostExtensionsMap);

  /// <summary>
  /// Returns <c>true</c> when, for an interaction, the apps extension is ACTIVE between client and
  /// server — both validly advertise <see cref="UiResource.ExtensionId"/> in their <c>extensions</c>
  /// maps (spec §26.2, R-26.2-a). When inactive, the host treats a tool carrying <c>_meta.ui</c> as a
  /// normal tool and ignores the UI key (R-26.2-i).
  /// </summary>
  /// <param name="clientExtensions">The client/host's advertised <c>extensions</c> map (raw).</param>
  /// <param name="serverExtensions">The server's advertised <c>extensions</c> map (raw).</param>
  /// <returns><c>true</c> when active on both sides.</returns>
  public static bool IsUiExtensionActive(JsonObject? clientExtensions, JsonObject? serverExtensions) =>
    Extensions.IsActive(UiResource.ExtensionId, clientExtensions, serverExtensions);

  /// <summary>
  /// Returns <c>true</c> when the apps extension is in <paramref name="activeSet"/> and the server MAY
  /// therefore emit its surface (the <c>_meta.ui</c> key, the <c>ui://</c> resource) for this
  /// interaction (spec §26.2, R-26.2-a).
  /// </summary>
  /// <param name="activeSet">The identifiers active for this interaction.</param>
  /// <returns><c>true</c> when the UI surface may be emitted.</returns>
  public static bool MayEmitUiSurface(IEnumerable<string> activeSet) =>
    Extensions.MayEmitSurface(UiResource.ExtensionId, activeSet);

  /// <summary>
  /// Builds the <c>capabilities.extensions</c> fragment a server includes in its <c>server/discover</c>
  /// result to acknowledge the apps extension: a single <see cref="UiResource.ExtensionId"/> key mapped
  /// to an empty object (spec §26.2, R-26.2-j). Acknowledgement is OPTIONAL; a server merges this
  /// fragment into the <c>extensions</c> map of its result capabilities when it chooses to acknowledge.
  /// </summary>
  /// <returns>The acknowledgement fragment.</returns>
  public static JsonObject BuildServerUiAcknowledgement() =>
    new() { [UiResource.ExtensionId] = new JsonObject() };

  /// <summary>
  /// Returns <c>true</c> when a server's <c>server/discover</c> result <c>capabilities.extensions</c>
  /// map acknowledges the apps extension — the <see cref="UiResource.ExtensionId"/> key is present with
  /// a (possibly empty) object value (spec §26.2, R-26.2-j).
  /// </summary>
  /// <param name="serverExtensionsMap">The <c>capabilities.extensions</c> map from a discovery result (raw).</param>
  /// <returns><c>true</c> when acknowledged.</returns>
  public static bool ServerAcknowledgesUi(JsonObject? serverExtensionsMap) =>
    Extensions.IsAdvertised(serverExtensionsMap, UiResource.ExtensionId);

  // ─── §26.3 — ToolUiMeta extraction, visibility ─────────────────────────────────

  /// <summary>
  /// The effective visibility when <c>_meta.ui.visibility</c> is omitted: both actors may invoke the
  /// tool (spec §26.3, R-26.3-d).
  /// </summary>
  public static IReadOnlyList<UiVisibility> DefaultVisibility { get; } =
    [UiVisibility.Model, UiVisibility.App];

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a well-formed <c>ToolUiMeta</c> — a JSON
  /// object carrying a REQUIRED <c>resourceUri</c> that uses the <c>ui://</c> scheme and an OPTIONAL
  /// <c>visibility</c> array drawn from <c>"model"</c>/<c>"app"</c> (spec §26.3, R-26.3-a, R-26.3-b,
  /// R-26.3-d). A non-<c>ui://</c> <c>resourceUri</c> is rejected.
  /// </summary>
  /// <param name="value">The candidate <c>_meta.ui</c> value (raw).</param>
  /// <returns><c>true</c> when well-formed.</returns>
  public static bool IsToolUiMeta(JsonNode? value)
  {
    if (value is not JsonObject obj) return false;
    if (obj["resourceUri"] is not JsonValue uriValue ||
        uriValue.GetValueKind() != JsonValueKind.String ||
        !IsUiResourceUri(uriValue.GetValue<string>()))
    {
      return false;
    }
    if (obj.TryGetPropertyValue("visibility", out var visNode) && visNode is not null)
    {
      if (visNode is not JsonArray arr) return false;
      foreach (var element in arr)
      {
        var s = element is JsonValue ev && ev.GetValueKind() == JsonValueKind.String ? ev.GetValue<string>() : null;
        if (s is not ("model" or "app")) return false;
      }
    }
    return true;
  }

  /// <summary>
  /// Extracts the <see cref="ToolUiMeta"/> from a tool — i.e. parses <c>tool._meta.ui</c> — returning
  /// <c>null</c> when there is no <c>_meta</c>, no <c>ui</c> key, or the value is not a well-formed
  /// declaration (spec §26.3). This does NOT gate on negotiation: a receiver that has not negotiated the
  /// extension MUST ignore the key (R-26.3-g) — use <see cref="ReadToolUiMeta"/> for that.
  /// </summary>
  /// <param name="tool">A tool object (or anything with an optional <c>_meta.ui</c>) (raw).</param>
  /// <returns>The parsed declaration, or <c>null</c>.</returns>
  public static ToolUiMeta? GetToolUiMeta(JsonNode? tool)
  {
    if (tool is not JsonObject obj) return null;
    if (obj["_meta"] is not JsonObject meta) return null;
    if (meta[ToolUiMetaKey] is not { } uiNode || !IsToolUiMeta(uiNode)) return null;
    return uiNode.Deserialize<ToolUiMeta>(Stackific.Mcp.McpJson.Options);
  }

  /// <summary>
  /// Reads a tool's UI declaration ONLY when the extension is active for the interaction; returns
  /// <c>null</c> when the extension is not active, modeling "a receiver that does not negotiate this
  /// extension MUST ignore the <c>_meta.ui</c> key" (spec §26.3, R-26.3-g, R-26.2-i). When inactive the
  /// tool is treated as a normal tool and the key is ignored — its presence MUST NOT change the behavior
  /// of an ordinary <c>tools/call</c> (R-26.3-h).
  /// </summary>
  /// <param name="tool">The tool object (raw).</param>
  /// <param name="activeSet">Identifiers active for this interaction.</param>
  /// <returns>The declaration when active, or <c>null</c>.</returns>
  public static ToolUiMeta? ReadToolUiMeta(JsonNode? tool, IEnumerable<string> activeSet)
  {
    if (!MayEmitUiSurface(activeSet)) return null;
    return GetToolUiMeta(tool);
  }

  /// <summary>
  /// Returns the EFFECTIVE visibility of a UI declaration: the declared <c>visibility</c> array when
  /// present, otherwise the default <c>["model","app"]</c> (spec §26.3, R-26.3-d).
  /// </summary>
  /// <param name="meta">A <c>ToolUiMeta</c> whose <c>visibility</c> may be omitted.</param>
  /// <returns>The effective visibility list.</returns>
  public static IReadOnlyList<UiVisibility> EffectiveVisibility(ToolUiMeta meta)
  {
    ArgumentNullException.ThrowIfNull(meta);
    return meta.Visibility ?? DefaultVisibility;
  }

  /// <summary>
  /// Returns <c>true</c> when a tool's effective visibility includes <c>"app"</c> — i.e. the rendered UI
  /// MAY invoke it over the channel (spec §26.3, R-26.3-e).
  /// </summary>
  /// <param name="meta">The tool's <c>ToolUiMeta</c>.</param>
  /// <returns><c>true</c> when app-invokable.</returns>
  public static bool IsAppInvokable(ToolUiMeta meta) =>
    EffectiveVisibility(meta).Contains(UiVisibility.App);

  /// <summary>
  /// Returns <c>true</c> when a host SHOULD REJECT a <c>tools/call</c> that originates from a rendered
  /// UI, given the tool's UI declaration: it is rejected exactly when the tool's effective visibility
  /// excludes <c>"app"</c>, OR when the tool has no UI declaration at all (it was not exposed to the UI)
  /// (spec §26.3, R-26.3-e).
  /// </summary>
  /// <param name="meta">The tool's <c>ToolUiMeta</c>, or <c>null</c> when it has none.</param>
  /// <returns><c>true</c> when the host should reject the UI-originated call.</returns>
  public static bool HostShouldRejectUiOriginatedCall(ToolUiMeta? meta)
  {
    if (meta is null) return true;
    return !IsAppInvokable(meta);
  }

  /// <summary>
  /// Returns <c>true</c> when a tool's effective visibility includes <c>"model"</c> — i.e. it appears in
  /// the model's tool list and is callable via ordinary tool-calling. A tool with <c>visibility</c>
  /// <c>["app"]</c> is callable ONLY by the UI and is HIDDEN from the model's list, so this returns
  /// <c>false</c> (spec §26.3, R-26.3-f).
  /// </summary>
  /// <param name="meta">The tool's <c>ToolUiMeta</c>.</param>
  /// <returns><c>true</c> when visible to the model.</returns>
  public static bool IsVisibleToModel(ToolUiMeta meta) =>
    EffectiveVisibility(meta).Contains(UiVisibility.Model);

  /// <summary>
  /// Filters tools to those visible to the model, applying the §26.3 hide rule: a tool whose effective
  /// UI visibility is <c>["app"]</c>-only is omitted from the model's tool list (spec §26.3, R-26.3-f).
  /// The extension must be active for the rule to apply (R-26.3-g): when inactive, <c>_meta.ui</c> is
  /// ignored and every tool is treated as an ordinary, model-visible tool. A tool with no UI declaration
  /// is always model-visible.
  /// </summary>
  /// <param name="tools">The raw tool objects to filter.</param>
  /// <param name="activeSet">Identifiers active for this interaction.</param>
  /// <returns>The tools visible to the model.</returns>
  public static IReadOnlyList<JsonNode?> ToolsVisibleToModel(IReadOnlyList<JsonNode?> tools, IEnumerable<string> activeSet)
  {
    ArgumentNullException.ThrowIfNull(tools);
    if (!MayEmitUiSurface(activeSet)) return [.. tools];
    return tools.Where(tool =>
    {
      var meta = GetToolUiMeta(tool);
      return meta is null || IsVisibleToModel(meta);
    }).ToList();
  }

  /// <summary>
  /// Returns the <c>ui://</c> URI to use in a <c>resources/read</c> request for a tool's UI resource:
  /// the EXACT <c>resourceUri</c> from the tool's <c>_meta.ui</c>, treated as an opaque identifier (spec
  /// §26.4, R-26.3-c, R-26.4-b, R-26.4-c). Returns <c>null</c> when the meta is absent.
  /// </summary>
  /// <param name="meta">The tool's <c>ToolUiMeta</c>, or <c>null</c>.</param>
  /// <returns>The exact resource URI, or <c>null</c>.</returns>
  public static string? UiResourceReadUri(ToolUiMeta? meta) => meta?.ResourceUri;

  // ─── §26.4 — CSP descriptor & deny-by-default ──────────────────────────────────

  /// <summary>The four CSP descriptor members, in spec order (spec §26.4, R-26.4-f).</summary>
  public enum UiCspDirective
  {
    /// <summary>Origins the UI MAY open network connections to.</summary>
    ConnectDomains,

    /// <summary>Origins the UI MAY load scripts/styles/images/media from.</summary>
    ResourceDomains,

    /// <summary>Origins the UI MAY embed in nested frames.</summary>
    FrameDomains,

    /// <summary>Origins permitted as the document base URI.</summary>
    BaseUriDomains,
  }

  /// <summary>The deny-by-default CSP a host MUST apply when a UI resource omits <c>csp</c>: every directive an empty list (spec §26.4, R-26.4-h).</summary>
  public static UiContentSecurityPolicy DenyByDefaultCsp { get; } = new()
  {
    ConnectDomains = [],
    ResourceDomains = [],
    FrameDomains = [],
    BaseUriDomains = [],
  };

  /// <summary>Reads the origin list of a CSP directive from a descriptor, or <c>null</c> when the member is absent.</summary>
  private static IReadOnlyList<string>? DirectiveList(UiContentSecurityPolicy csp, UiCspDirective directive) => directive switch
  {
    UiCspDirective.ConnectDomains => csp.ConnectDomains,
    UiCspDirective.ResourceDomains => csp.ResourceDomains,
    UiCspDirective.FrameDomains => csp.FrameDomains,
    UiCspDirective.BaseUriDomains => csp.BaseUriDomains,
    _ => null,
  };

  /// <summary>
  /// Returns <c>true</c> when <paramref name="origin"/> is ALLOWED for the given CSP
  /// <paramref name="directive"/> of a <paramref name="csp"/> descriptor — it is explicitly listed in
  /// that member. An origin not listed (including when the member is absent, or when <c>csp</c> is
  /// <c>null</c>) MUST be blocked — deny-by-default applies (spec §26.4, R-26.4-g, R-26.4-h).
  /// </summary>
  /// <param name="csp">The resolved CSP descriptor, or <c>null</c> when <c>csp</c> was omitted.</param>
  /// <param name="directive">Which CSP member to consult.</param>
  /// <param name="origin">The origin string to test.</param>
  /// <returns><c>true</c> when explicitly allowed.</returns>
  public static bool CspAllowsOrigin(UiContentSecurityPolicy? csp, UiCspDirective directive, string origin)
  {
    if (csp is null) return false; // deny-by-default (R-26.4-h)
    var allowed = DirectiveList(csp, directive);
    return allowed is not null && allowed.Contains(origin, StringComparer.Ordinal);
  }

  /// <summary>
  /// Resolves the CSP a host applies for a UI resource: the declared <c>csp</c> when present, otherwise
  /// the restrictive <see cref="DenyByDefaultCsp"/> (deny-by-default) (spec §26.4, R-26.4-h). A present
  /// <c>csp</c> is returned as-is for the host to constrain its policy by (R-26.4-o); an absent <c>csp</c>
  /// yields the all-empty deny-by-default policy.
  /// </summary>
  /// <param name="csp">The UI resource's declared <c>csp</c>, or <c>null</c>.</param>
  /// <returns>The effective CSP.</returns>
  public static UiContentSecurityPolicy ResolveCsp(UiContentSecurityPolicy? csp) => csp ?? DenyByDefaultCsp;

  // ─── §26.4 — Sandbox permissions ───────────────────────────────────────────────

  /// <summary>The four sandbox capability names a UI MAY request, in spec order (spec §26.4, R-26.4-i).</summary>
  public enum UiPermissionName
  {
    /// <summary>Camera access.</summary>
    Camera,

    /// <summary>Microphone access.</summary>
    Microphone,

    /// <summary>Geolocation access.</summary>
    Geolocation,

    /// <summary>Clipboard-write access.</summary>
    ClipboardWrite,
  }

  /// <summary>Reads whether a named permission member is present (an empty object) on a permissions record.</summary>
  private static bool MemberPresent(UiPermissions permissions, UiPermissionName name) => name switch
  {
    UiPermissionName.Camera => permissions.Camera is not null,
    UiPermissionName.Microphone => permissions.Microphone is not null,
    UiPermissionName.Geolocation => permissions.Geolocation is not null,
    UiPermissionName.ClipboardWrite => permissions.ClipboardWrite is not null,
    _ => false,
  };

  /// <summary>
  /// Returns <c>true</c> when a UI resource's <c>permissions</c> REQUESTS the named sandbox capability —
  /// i.e. the member is present. Absence means the capability is not requested, and the host MUST NOT
  /// grant it (spec §26.4, R-26.4-i, R-26.4-j).
  /// </summary>
  /// <param name="permissions">The UI resource's declared <c>permissions</c>, or <c>null</c>.</param>
  /// <param name="name">The capability to test.</param>
  /// <returns><c>true</c> when requested.</returns>
  public static bool PermissionRequested(UiPermissions? permissions, UiPermissionName name) =>
    permissions is not null && MemberPresent(permissions, name);

  /// <summary>
  /// Returns the set of sandbox capabilities a UI resource requests, as the subset of the four
  /// permission names present in <paramref name="permissions"/> (spec §26.4, R-26.4-i). The host MUST
  /// NOT grant any capability outside this set (R-26.4-j) and MAY decline any within it (R-26.4-k).
  /// </summary>
  /// <param name="permissions">The UI resource's declared <c>permissions</c>, or <c>null</c>.</param>
  /// <returns>The requested permission names, in spec order.</returns>
  public static IReadOnlyList<UiPermissionName> RequestedPermissions(UiPermissions? permissions)
  {
    if (permissions is null) return [];
    var all = new[] { UiPermissionName.Camera, UiPermissionName.Microphone, UiPermissionName.Geolocation, UiPermissionName.ClipboardWrite };
    return all.Where(name => MemberPresent(permissions, name)).ToList();
  }

  /// <summary>
  /// Returns <c>true</c> when a host MAY grant the named sandbox capability for a UI resource: ONLY when
  /// it was requested (the host MUST NOT grant an unrequested capability) AND the host did not decline
  /// it (the host MAY decline a requested one) (spec §26.4, R-26.4-j, R-26.4-k).
  /// </summary>
  /// <param name="permissions">The UI resource's declared <c>permissions</c>.</param>
  /// <param name="name">The capability under consideration.</param>
  /// <param name="hostDeclines">Whether the host chooses to decline this requested capability; defaults to <c>false</c>.</param>
  /// <returns><c>true</c> when the host may grant it.</returns>
  public static bool MayGrantPermission(UiPermissions? permissions, UiPermissionName name, bool hostDeclines = false)
  {
    if (!PermissionRequested(permissions, name)) return false; // never grant the unrequested (R-26.4-j)
    return !hostDeclines; // MAY decline the requested (R-26.4-k)
  }

  // ─── §26.4 — Resource _meta.ui hints & UI resource contents ────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a well-formed <c>ResourceUiMeta</c> — a JSON
  /// object whose OPTIONAL members (<c>csp</c>, <c>permissions</c>, <c>domain</c>, <c>prefersBorder</c>)
  /// are each of the correct shape when present (spec §26.4). Round-trips through the typed record.
  /// </summary>
  /// <param name="value">The candidate hints object (raw).</param>
  /// <returns><c>true</c> when well-formed.</returns>
  public static bool IsResourceUiMeta(JsonNode? value)
  {
    if (value is not JsonObject) return false;
    try
    {
      value.Deserialize<ResourceUiMeta>(Stackific.Mcp.McpJson.Options);
      return true;
    }
    catch (JsonException)
    {
      return false;
    }
  }

  /// <summary>
  /// Extracts the <see cref="ResourceUiMeta"/> hints from a UI resource <c>contents</c> entry — i.e.
  /// parses <c>contents._meta.ui</c> — returning <c>null</c> when there are no hints or they are
  /// malformed (spec §26.4, R-26.4-e). When present, these hints take effect for rendering.
  /// </summary>
  /// <param name="contents">A UI resource <c>contents</c> entry (raw).</param>
  /// <returns>The parsed hints, or <c>null</c>.</returns>
  public static ResourceUiMeta? GetResourceUiMeta(JsonNode? contents)
  {
    if (contents is not JsonObject obj) return null;
    if (obj["_meta"] is not JsonObject meta) return null;
    if (meta[ToolUiMetaKey] is not { } uiNode || !IsResourceUiMeta(uiNode)) return null;
    return uiNode.Deserialize<ResourceUiMeta>(Stackific.Mcp.McpJson.Options);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a well-formed UI resource <c>contents</c>
  /// entry: a <c>ui://</c> <c>uri</c>, the verbatim <see cref="UiResource.MimeType"/>, exactly one of
  /// <c>text</c>/<c>blob</c>, and — when present — well-formed <c>_meta.ui</c> hints (spec §26.4,
  /// R-26.4-d, R-26.4-e).
  /// </summary>
  /// <param name="value">The candidate contents entry (raw).</param>
  /// <returns><c>true</c> when well-formed.</returns>
  public static bool IsUiResourceContents(JsonNode? value)
  {
    if (value is not JsonObject obj) return false;
    if (obj["uri"] is not JsonValue uriValue || uriValue.GetValueKind() != JsonValueKind.String ||
        !IsUiResourceUri(uriValue.GetValue<string>()))
    {
      return false;
    }
    if (!IsUiMimeType(obj["mimeType"] is JsonValue mimeValue && mimeValue.GetValueKind() == JsonValueKind.String ? mimeValue.GetValue<string>() : null))
    {
      return false;
    }
    var hasText = obj["text"] is JsonValue tv && tv.GetValueKind() == JsonValueKind.String;
    var hasBlob = obj["blob"] is JsonValue bv && bv.GetValueKind() == JsonValueKind.String;
    if (hasText == hasBlob) return false; // exactly one of text/blob (S21 exclusivity)
    if (obj["_meta"] is JsonObject m && m[ToolUiMetaKey] is { } hints && !IsResourceUiMeta(hints))
    {
      return false;
    }
    return true;
  }

  /// <summary>
  /// Builds a UI resource <c>contents</c> entry: the <c>ui://</c> <paramref name="uri"/>, the verbatim
  /// <see cref="UiResource.MimeType"/>, the <c>text</c> OR <c>blob</c> payload, and — when supplied — the
  /// <see cref="ResourceUiMeta"/> hints nested under <c>_meta.ui</c> (spec §26.4, R-26.4-d, R-26.4-e).
  /// Exactly one of <paramref name="text"/>/<paramref name="blob"/> MUST be supplied (S21 exclusivity).
  /// </summary>
  /// <param name="uri">The <c>ui://</c> URI of the resource.</param>
  /// <param name="text">The HTML document as text, or <c>null</c>.</param>
  /// <param name="blob">The document as Base64, or <c>null</c>.</param>
  /// <param name="ui">OPTIONAL presentation/security hints nested under <c>_meta.ui</c>.</param>
  /// <returns>The contents entry as a JSON object.</returns>
  /// <exception cref="ArgumentException">When <paramref name="uri"/> is not a <c>ui://</c> URI, or when neither/both of <paramref name="text"/>/<paramref name="blob"/> are supplied.</exception>
  public static JsonObject BuildUiResourceContents(string uri, string? text = null, string? blob = null, ResourceUiMeta? ui = null)
  {
    if (!IsUiResourceUri(uri))
    {
      throw new ArgumentException($"UI resource uri MUST use the {UriScheme} scheme (R-26.4-b)", nameof(uri));
    }
    var hasText = text is not null;
    var hasBlob = blob is not null;
    if (hasText == hasBlob)
    {
      throw new ArgumentException("A UI resource content MUST carry exactly one of `text` or `blob` (R-14.5-h)", nameof(text));
    }
    var entry = new JsonObject
    {
      ["uri"] = uri,
      ["mimeType"] = UiResource.MimeType,
    };
    if (hasText) entry["text"] = text;
    else entry["blob"] = blob;
    if (ui is not null)
    {
      var hints = JsonSerializer.SerializeToNode(ui, Stackific.Mcp.McpJson.Options) as JsonObject ?? new JsonObject();
      entry["_meta"] = new JsonObject { [ToolUiMetaKey] = hints };
    }
    return entry;
  }

  /// <summary>
  /// Builds the result object a server returns from <c>resources/read</c> for a UI resource: a complete,
  /// cacheable result carrying the single UI <c>contents</c> entry, with the REQUIRED <c>ttlMs</c> /
  /// <c>cacheScope</c> cache fields (spec §26.4). Mirrors the S27 <c>ReadResourceResult</c> shape used in
  /// the §26.4 wire example.
  /// </summary>
  /// <param name="contents">The UI resource <c>contents</c> entry (e.g. from <see cref="BuildUiResourceContents"/>).</param>
  /// <param name="ttlMs">The cache TTL; MUST be a non-negative integer.</param>
  /// <param name="cacheScope">The cache scope (<c>"public"</c> or <c>"private"</c>).</param>
  /// <returns>The read result as a JSON object.</returns>
  /// <exception cref="ArgumentOutOfRangeException">When <paramref name="ttlMs"/> is negative.</exception>
  public static JsonObject BuildUiResourceReadResult(JsonObject contents, long ttlMs, string cacheScope)
  {
    ArgumentNullException.ThrowIfNull(contents);
    if (ttlMs < 0)
    {
      throw new ArgumentOutOfRangeException(nameof(ttlMs), "UI resource read result ttlMs MUST be a non-negative integer (R-13)");
    }
    return new JsonObject
    {
      ["resultType"] = "complete",
      ["contents"] = new JsonArray(contents.DeepClone()),
      ["ttlMs"] = ttlMs,
      ["cacheScope"] = cacheScope,
    };
  }
}
