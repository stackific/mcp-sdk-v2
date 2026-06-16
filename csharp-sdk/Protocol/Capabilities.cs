using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The capabilities a client advertises, per request, in the
/// <c>io.modelcontextprotocol/clientCapabilities</c> metadata key (spec §6.2). A capability
/// is declared by the <em>presence</em> of its field — an empty object <c>{}</c> still means
/// "supported"; absence (here, <c>null</c>) means "not supported". Unknown fields are ignored
/// on receipt (§6.6).
/// </summary>
public sealed record ClientCapabilities
{
  /// <summary>A shared, empty capability set declaring no optional client behaviors.</summary>
  public static ClientCapabilities None { get; } = new();

  /// <summary>Non-standard, experimental capabilities keyed by identifier (§6.2).</summary>
  [JsonConverter(typeof(ExtensionsMapJsonConverter))]
  public IDictionary<string, JsonObject>? Experimental { get; init; }

  /// <summary>Present if the client supports server-initiated elicitation (§20).</summary>
  public ElicitationCapability? Elicitation { get; init; }

  /// <summary>Present if the client exposes filesystem roots. Status: <b>Deprecated</b> (§21).</summary>
  public JsonObject? Roots { get; init; }

  /// <summary>Present if the client supports server-initiated sampling. Status: <b>Deprecated</b> (§21).</summary>
  public SamplingCapability? Sampling { get; init; }

  /// <summary>The MCP extensions the client supports, keyed by extension identifier (§6.5).</summary>
  [JsonConverter(typeof(ExtensionsMapJsonConverter))]
  public IDictionary<string, JsonObject>? Extensions { get; init; }

  /// <summary><c>true</c> if the client declared elicitation support (form mode is the implicit baseline, §6.2).</summary>
  [JsonIgnore]
  public bool SupportsElicitation => Elicitation is not null;

  /// <summary><c>true</c> if the client supports URL-mode elicitation (§6.2).</summary>
  [JsonIgnore]
  public bool SupportsElicitationUrl => Elicitation?.Url is not null;

  /// <summary><c>true</c> if the client declared the deprecated sampling capability (§21).</summary>
  [JsonIgnore]
  public bool SupportsSampling => Sampling is not null;

  /// <summary><c>true</c> if the client declared the deprecated roots capability (§21).</summary>
  [JsonIgnore]
  public bool SupportsRoots => Roots is not null;

  /// <summary><c>true</c> if the client declared an <c>experimental</c> map (presence means supported, §6.2).</summary>
  [JsonIgnore]
  public bool SupportsExperimental => Experimental is not null;

  /// <summary><c>true</c> if the client declared an <c>extensions</c> map (presence means supported, §6.5).</summary>
  [JsonIgnore]
  public bool SupportsExtensions => Extensions is not null;

  /// <summary>
  /// <c>true</c> if the client declared the deprecated <c>sampling.context</c> sub-flag (§6.2, R-6.2-n).
  /// This gates non-<c>none</c> <c>includeContext</c> during sampling (see
  /// <c>CapabilityNegotiation.MayUseIncludeContext</c>).
  /// </summary>
  [JsonIgnore]
  public bool SupportsSamplingContext => Sampling?.Context is not null;

  /// <summary>
  /// <c>true</c> if the client declared the deprecated <c>sampling.tools</c> sub-flag (§6.2, R-6.2-p).
  /// This gates supplying <c>tools</c>/<c>toolChoice</c> during sampling (see
  /// <c>CapabilityNegotiation.MayUseSamplingTools</c>).
  /// </summary>
  [JsonIgnore]
  public bool SupportsSamplingTools => Sampling?.Tools is not null;

  /// <summary>
  /// Returns <c>true</c> if the client VALIDLY advertised the extension <paramref name="identifier"/>
  /// (§6.5). Routed through <see cref="Protocol.Extensions.IsAdvertised"/> so an entry that is present
  /// but malformed — a <c>null</c> or non-object settings value — is NOT treated as advertised
  /// (R-6.5-j). A bare <see cref="System.Collections.Generic.IDictionary{TKey,TValue}.ContainsKey"/>
  /// check would wrongly count a <c>null</c>-valued key.
  /// </summary>
  /// <param name="identifier">The extension identifier, for example <c>io.modelcontextprotocol/tasks</c>.</param>
  /// <returns><c>true</c> when validly advertised.</returns>
  public bool HasExtension(string identifier) =>
    Protocol.Extensions.IsAdvertised(CapabilityExtensions.ToRawMap(Extensions), identifier);
}

/// <summary>Client elicitation capability with its mode sub-flags (spec §6.2/§20).</summary>
public sealed record ElicitationCapability
{
  /// <summary>Present if the client supports form-mode elicitation (the baseline mode).</summary>
  public JsonObject? Form { get; init; }

  /// <summary>Present if the client supports URL-mode elicitation.</summary>
  public JsonObject? Url { get; init; }
}

/// <summary>Deprecated client sampling capability with its sub-flags (spec §6.2/§21).</summary>
public sealed record SamplingCapability
{
  /// <summary>Present if the client supports sampling context inclusion (deprecated).</summary>
  public JsonObject? Context { get; init; }

  /// <summary>Present if the client supports tool use within sampling.</summary>
  public JsonObject? Tools { get; init; }
}

/// <summary>
/// The capabilities a server advertises in its <c>server/discover</c> result (spec §6.3).
/// As with client capabilities, presence declares support and unknown fields are ignored (§6.6).
/// </summary>
public sealed record ServerCapabilities
{
  /// <summary>Non-standard, experimental capabilities keyed by identifier (§6.3).</summary>
  [JsonConverter(typeof(ExtensionsMapJsonConverter))]
  public IDictionary<string, JsonObject>? Experimental { get; init; }

  /// <summary>Present if the server emits log messages. Status: <b>Deprecated</b> (§15.3).</summary>
  public JsonObject? Logging { get; init; }

  /// <summary>Present if the server supports argument completion via <c>completion/complete</c> (§19).</summary>
  public JsonObject? Completions { get; init; }

  /// <summary>Present if the server offers prompts (§18).</summary>
  public PromptsCapability? Prompts { get; init; }

  /// <summary>Present if the server offers resources (§17).</summary>
  public ResourcesCapability? Resources { get; init; }

  /// <summary>Present if the server offers tools (§16).</summary>
  public ToolsCapability? Tools { get; init; }

  /// <summary>The MCP extensions the server supports, keyed by extension identifier (§6.5).</summary>
  [JsonConverter(typeof(ExtensionsMapJsonConverter))]
  public IDictionary<string, JsonObject>? Extensions { get; init; }

  /// <summary><c>true</c> if the server declared a <c>prompts</c> capability (presence means supported, §6.3).</summary>
  [JsonIgnore]
  public bool DeclaresPrompts => Prompts is not null;

  /// <summary><c>true</c> if the server declared a <c>resources</c> capability (presence means supported, §6.3).</summary>
  [JsonIgnore]
  public bool DeclaresResources => Resources is not null;

  /// <summary><c>true</c> if the server declared a <c>tools</c> capability (presence means supported, §6.3).</summary>
  [JsonIgnore]
  public bool DeclaresTools => Tools is not null;

  /// <summary><c>true</c> if the server declared a <c>completions</c> capability (presence means supported, §6.3).</summary>
  [JsonIgnore]
  public bool DeclaresCompletions => Completions is not null;

  /// <summary><c>true</c> if the server declared the deprecated <c>logging</c> capability (§6.3, §15.3).</summary>
  [JsonIgnore]
  public bool DeclaresLogging => Logging is not null;

  /// <summary>
  /// <c>true</c> only when <c>prompts.listChanged</c> is explicitly <c>true</c> — absent or <c>false</c>
  /// means not declared (§6.3, R-6.3-h). The boolean sub-flags follow "true means declared".
  /// </summary>
  [JsonIgnore]
  public bool DeclaresPromptsListChanged => Prompts?.ListChanged == true;

  /// <summary><c>true</c> only when <c>resources.subscribe</c> is explicitly <c>true</c> (§6.3, R-6.3-l).</summary>
  [JsonIgnore]
  public bool DeclaresResourcesSubscribe => Resources?.Subscribe == true;

  /// <summary><c>true</c> only when <c>resources.listChanged</c> is explicitly <c>true</c> (§6.3, R-6.3-l).</summary>
  [JsonIgnore]
  public bool DeclaresResourcesListChanged => Resources?.ListChanged == true;

  /// <summary><c>true</c> only when <c>tools.listChanged</c> is explicitly <c>true</c> (§6.3, R-6.3-o).</summary>
  [JsonIgnore]
  public bool DeclaresToolsListChanged => Tools?.ListChanged == true;

  /// <summary>
  /// Returns <c>true</c> if the server VALIDLY advertised the extension <paramref name="identifier"/>
  /// (§6.5). Routed through <see cref="Protocol.Extensions.IsAdvertised"/> so an entry that is present
  /// but malformed — a <c>null</c> or non-object settings value — is NOT treated as advertised
  /// (R-6.5-j). A bare <see cref="System.Collections.Generic.IDictionary{TKey,TValue}.ContainsKey"/>
  /// check would wrongly count a <c>null</c>-valued key.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns><c>true</c> when validly advertised.</returns>
  public bool HasExtension(string identifier) =>
    Protocol.Extensions.IsAdvertised(CapabilityExtensions.ToRawMap(Extensions), identifier);
}

/// <summary>
/// Helpers shared by <see cref="ClientCapabilities"/> and <see cref="ServerCapabilities"/> for
/// routing the typed <c>extensions</c> dictionary through the raw-map advertisement checks in
/// <see cref="Extensions"/> (R-6.5-j).
/// </summary>
internal static class CapabilityExtensions
{
  /// <summary>
  /// Projects a typed <c>extensions</c> dictionary into the raw <see cref="JsonObject"/> map shape
  /// <see cref="Extensions.IsAdvertised"/> consumes. A <c>null</c>-valued entry (a JSON <c>null</c>
  /// that deserialized into the dictionary) is preserved AS a JSON <c>null</c> so the advertisement
  /// check correctly rejects it (R-6.5-j); a non-null settings object is carried through.
  /// </summary>
  /// <param name="extensions">The typed extensions dictionary, or <c>null</c> when none.</param>
  /// <returns>The raw map, or <c>null</c> when <paramref name="extensions"/> is <c>null</c>.</returns>
  public static JsonObject? ToRawMap(IDictionary<string, JsonObject>? extensions)
  {
    if (extensions is null) return null;
    var raw = new JsonObject();
    foreach (var (key, value) in extensions)
    {
      raw[key] = value?.DeepClone();
    }
    return raw;
  }
}

/// <summary>
/// Binds a capability <c>extensions</c>/<c>experimental</c> map (§6.5) while honoring the
/// forward-compatibility rule that a malformed entry MUST NOT cause the whole capability object — or
/// the message carrying it — to be rejected (§6.6, R-6.6-b; §6.5, R-6.5-i/j). On receipt, an entry
/// whose value is not a JSON object — the literal <c>null</c>, an array, or a scalar — is DROPPED
/// (the extension is simply treated as not advertised by that peer), rather than throwing a
/// <see cref="JsonException"/> that would surface to the caller as a <c>-32602</c> rejection of the
/// entire request. This is the per-entry counterpart of <see cref="Extensions.NormalizeMap"/>, applied
/// at the deserialization boundary so the typed <c>IDictionary&lt;string, JsonObject&gt;</c> never has
/// to represent a malformed value. The map itself MUST still be a JSON object; a non-object map is a
/// genuine structural error and is rejected.
/// </summary>
internal sealed class ExtensionsMapJsonConverter : JsonConverter<IDictionary<string, JsonObject>>
{
  /// <inheritdoc />
  public override IDictionary<string, JsonObject>? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
  {
    var node = JsonNode.Parse(ref reader);
    if (node is null) return null;
    if (node is not JsonObject map)
    {
      throw new JsonException("A capability extensions/experimental map MUST be a JSON object (§6.5).");
    }

    var result = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
    foreach (var (key, value) in map)
    {
      // R-6.5-i/j: only an object settings value is a valid advertisement. A null/array/scalar entry
      // is malformed and dropped (treated as not advertised), never propagated and never thrown.
      if (value is JsonObject settings)
      {
        result[key] = (JsonObject)settings.DeepClone();
      }
    }
    return result;
  }

  /// <inheritdoc />
  public override void Write(Utf8JsonWriter writer, IDictionary<string, JsonObject> value, JsonSerializerOptions options)
  {
    ArgumentNullException.ThrowIfNull(value);
    writer.WriteStartObject();
    foreach (var (key, settings) in value)
    {
      if (settings is null) continue; // never emit a null-valued entry (R-6.5-i)
      writer.WritePropertyName(key);
      settings.WriteTo(writer, options);
    }
    writer.WriteEndObject();
  }
}

/// <summary>Server prompts capability (spec §6.3/§18).</summary>
public sealed record PromptsCapability
{
  /// <summary>When <c>true</c>, the server emits <c>notifications/prompts/list_changed</c> (§18.6).</summary>
  public bool? ListChanged { get; init; }
}

/// <summary>Server resources capability with its sub-flags (spec §6.3/§17).</summary>
public sealed record ResourcesCapability
{
  /// <summary>When <c>true</c>, the server supports per-resource update subscriptions (§10/§17.7).</summary>
  public bool? Subscribe { get; init; }

  /// <summary>When <c>true</c>, the server emits <c>notifications/resources/list_changed</c> (§17.7).</summary>
  public bool? ListChanged { get; init; }
}

/// <summary>Server tools capability (spec §6.3/§16).</summary>
public sealed record ToolsCapability
{
  /// <summary>When <c>true</c>, the server emits <c>notifications/tools/list_changed</c> (§16.8).</summary>
  public bool? ListChanged { get; init; }
}
