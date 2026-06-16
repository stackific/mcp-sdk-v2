using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

// This file IS the Deprecated-but-supported Sampling feature (§21.2); referencing the [Obsolete]
// CreateMessageRequestParams / IncludeContext types throughout is deliberate.
#pragma warning disable CS0618

/// <summary>
/// The discriminated union of content blocks carried by a <see cref="SamplingMessage"/>
/// (spec §21.2.6). The wire discriminator is the <c>type</c> field.
/// </summary>
/// <remarks>
/// This union is <b>separate</b> from <see cref="ContentBlock"/> (§14.4): it adds the
/// sampling-only <c>tool_use</c> (<see cref="ToolUseContent"/>) and <c>tool_result</c>
/// (<see cref="ToolResultContent"/>) blocks and EXCLUDES <c>resource_link</c>/<c>resource</c>.
/// It belongs to the <b>Deprecated</b> Sampling capability (spec §21.2); implementations SHOULD
/// NOT adopt it for new functionality and SHOULD instead integrate directly with a model provider.
/// It remains defined for interoperability.
/// </remarks>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(SamplingTextContent), "text")]
[JsonDerivedType(typeof(SamplingImageContent), "image")]
[JsonDerivedType(typeof(SamplingAudioContent), "audio")]
[JsonDerivedType(typeof(ToolUseContent), "tool_use")]
[JsonDerivedType(typeof(ToolResultContent), "tool_result")]
public abstract record SamplingMessageContentBlock
{
  private protected SamplingMessageContentBlock() { }

  /// <summary>OPTIONAL. Implementation- and extension-specific metadata (spec §4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// Ergonomic factory helpers for building <see cref="SamplingMessageContentBlock"/> values
/// (spec §21.2.6) for the <b>Deprecated</b> Sampling capability (§21.2).
/// </summary>
public static class SamplingContentBlocks
{
  /// <summary>Creates a <see cref="SamplingTextContent"/> block.</summary>
  /// <param name="text">The text.</param>
  /// <returns>The block.</returns>
  public static SamplingTextContent Text(string text) => new() { Text = text };

  /// <summary>Creates a <see cref="SamplingImageContent"/> block from Base64 data.</summary>
  /// <param name="base64Data">Base64-encoded image bytes.</param>
  /// <param name="mimeType">The image MIME type (for example <c>image/png</c>).</param>
  /// <returns>The block.</returns>
  public static SamplingImageContent Image(string base64Data, string mimeType) =>
    new() { Data = base64Data, MimeType = mimeType };

  /// <summary>Creates a <see cref="SamplingAudioContent"/> block from Base64 data.</summary>
  /// <param name="base64Data">Base64-encoded audio bytes.</param>
  /// <param name="mimeType">The audio MIME type (for example <c>audio/wav</c>).</param>
  /// <returns>The block.</returns>
  public static SamplingAudioContent Audio(string base64Data, string mimeType) =>
    new() { Data = base64Data, MimeType = mimeType };
}

/// <summary>
/// Plain text content within a sampling message (spec §21.2.6; field definition §14.4.1).
/// </summary>
public sealed record SamplingTextContent : SamplingMessageContentBlock
{
  /// <summary>REQUIRED. The text content.</summary>
  public required string Text { get; init; }
}

/// <summary>
/// Base64-encoded image content with a MIME type within a sampling message
/// (spec §21.2.6; field definition §14.4.2).
/// </summary>
public sealed record SamplingImageContent : SamplingMessageContentBlock
{
  /// <summary>REQUIRED. Base64-encoded image bytes.</summary>
  public required string Data { get; init; }

  /// <summary>REQUIRED. The image MIME type.</summary>
  public required string MimeType { get; init; }
}

/// <summary>
/// Base64-encoded audio content with a MIME type within a sampling message
/// (spec §21.2.6; field definition §14.4.3).
/// </summary>
public sealed record SamplingAudioContent : SamplingMessageContentBlock
{
  /// <summary>REQUIRED. Base64-encoded audio bytes.</summary>
  public required string Data { get; init; }

  /// <summary>REQUIRED. The audio MIME type.</summary>
  public required string MimeType { get; init; }
}

/// <summary>
/// A request from the assistant to call a tool, carried as a sampling content block
/// (spec §21.2.6, <c>type: "tool_use"</c>).
/// </summary>
public sealed record ToolUseContent : SamplingMessageContentBlock
{
  /// <summary>
  /// REQUIRED. A unique identifier for this tool use, used to match tool results to their
  /// corresponding tool uses (spec §21.2.6).
  /// </summary>
  public required string Id { get; init; }

  /// <summary>REQUIRED. The name of the tool to call (spec §21.2.6).</summary>
  public required string Name { get; init; }

  /// <summary>
  /// REQUIRED. The arguments to pass to the tool, conforming to the tool's input schema
  /// (spec §21.2.6).
  /// </summary>
  public required JsonObject Input { get; init; }
}

/// <summary>
/// The result of a tool use, provided by the user back to the assistant, carried as a sampling
/// content block (spec §21.2.6, <c>type: "tool_result"</c>).
/// </summary>
public sealed record ToolResultContent : SamplingMessageContentBlock
{
  /// <summary>
  /// REQUIRED. The <see cref="ToolUseContent.Id"/> of the tool use this result corresponds to; it
  /// MUST match the <c>id</c> from a previous <see cref="ToolUseContent"/> (spec §21.2.6).
  /// </summary>
  public required string ToolUseId { get; init; }

  /// <summary>
  /// REQUIRED. The unstructured result content, using the content-block array form defined for tool
  /// results in §16; it MAY include text, images, audio, resource links, and embedded resources
  /// (spec §21.2.6).
  /// </summary>
  public required IReadOnlyList<ContentBlock> Content { get; init; }

  /// <summary>
  /// OPTIONAL. A structured result value of any JSON type (object, array, string, number, boolean,
  /// or null). If the tool defined an output schema (§16), this SHOULD conform to it (spec §21.2.6).
  /// </summary>
  public JsonNode? StructuredContent { get; init; }

  /// <summary>
  /// OPTIONAL (absent ⇒ <c>false</c>). Whether the tool use resulted in an error; when <c>true</c>,
  /// <see cref="Content"/> typically describes the error (spec §21.2.6).
  /// </summary>
  public bool? IsError { get; init; }
}

/// <summary>
/// A single message in a sampling conversation (spec §21.2.6) for the <b>Deprecated</b> Sampling
/// capability (§21.2).
/// </summary>
public sealed record SamplingMessage
{
  /// <summary>REQUIRED. The message role, either <c>user</c> or <c>assistant</c> (spec §21.2.6).</summary>
  public required Role Role { get; init; }

  /// <summary>
  /// REQUIRED. The message content (spec §21.2.6). On the wire this is either a single content block
  /// or an array of content blocks; this SDK models it as an array (a single-block message is the
  /// one-element case). Per §21.2.7, a <c>user</c> message containing tool results MUST contain
  /// ONLY <see cref="ToolResultContent"/> blocks.
  /// </summary>
  public required IReadOnlyList<SamplingMessageContentBlock> Content { get; init; }

  /// <summary>OPTIONAL. Reserved metadata (spec §21.2.6/§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// A hint guiding model selection within <see cref="ModelPreferences"/> (spec §21.2.9). All hints
/// are advisory; the client MAY ignore them. If multiple hints are specified, the client MUST
/// evaluate them in order, taking the first match.
/// </summary>
public sealed record ModelHint
{
  /// <summary>
  /// OPTIONAL. A hint for a model name (spec §21.2.9). The client SHOULD treat this as a substring of
  /// a model name (for example <c>sonnet</c> matches <c>claude-3-5-sonnet-20241022</c>) and MAY map
  /// it to a different provider's model that fills a similar niche.
  /// </summary>
  public string? Name { get; init; }
}

/// <summary>
/// A server's advisory preferences for which model the client should select for a sampling request
/// (spec §21.2.9). All preferences are advisory: the client (or host) makes the final selection and
/// MAY ignore them.
/// </summary>
public sealed record ModelPreferences
{
  /// <summary>
  /// OPTIONAL. Hints to guide model selection, evaluated in order with the first match taken
  /// (spec §21.2.9). The client SHOULD prioritize hints over the numeric priorities.
  /// </summary>
  public IReadOnlyList<ModelHint>? Hints { get; init; }

  /// <summary>
  /// OPTIONAL (range 0 to 1 inclusive). How much to prioritize minimizing cost: <c>0</c> means cost
  /// is not important, <c>1</c> means cost is the most important factor (spec §21.2.9).
  /// </summary>
  public double? CostPriority { get; init; }

  /// <summary>
  /// OPTIONAL (range 0 to 1 inclusive). How much to prioritize sampling speed (low latency):
  /// <c>0</c> means speed is not important, <c>1</c> means speed is the most important factor
  /// (spec §21.2.9).
  /// </summary>
  public double? SpeedPriority { get; init; }

  /// <summary>
  /// OPTIONAL (range 0 to 1 inclusive). How much to prioritize intelligence and capability:
  /// <c>0</c> means intelligence is not important, <c>1</c> means it is the most important factor
  /// (spec §21.2.9).
  /// </summary>
  public double? IntelligencePriority { get; init; }
}

/// <summary>
/// Controls how the model uses tools during sampling (spec §21.2.5). The default behavior when the
/// request omits <c>toolChoice</c> is <c>{ "mode": "auto" }</c>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<ToolChoiceMode>))]
public enum ToolChoiceMode
{
  /// <summary>The model decides whether to use tools. This is the default (spec §21.2.5).</summary>
  [JsonStringEnumMemberName("auto")]
  Auto,

  /// <summary>The model MUST use at least one tool before completing (spec §21.2.5).</summary>
  [JsonStringEnumMemberName("required")]
  Required,

  /// <summary>The model MUST NOT use any tools (spec §21.2.5).</summary>
  [JsonStringEnumMemberName("none")]
  None,
}

/// <summary>
/// Controls the model's tool-use behavior for a sampling request (spec §21.2.5). A client MUST
/// return an error if this is provided but the client did not declare the <c>sampling.tools</c>
/// capability (§21.2.4).
/// </summary>
public sealed record ToolChoice
{
  /// <summary>
  /// OPTIONAL. The tool-use mode (spec §21.2.5). When omitted, the default is
  /// <see cref="ToolChoiceMode.Auto"/>.
  /// </summary>
  public ToolChoiceMode? Mode { get; init; }
}

/// <summary>
/// A request to include context from one or more connected servers, attached to a sampling prompt
/// (spec §21.2.4, <c>includeContext</c>).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<IncludeContext>))]
[Obsolete("includeContext is Deprecated (spec §21.2.4): servers SHOULD omit it or use IncludeContext.None. Still accepted for backward compatibility.")]
public enum IncludeContext
{
  /// <summary>No additional context. This is the default when the field is omitted (spec §21.2.4).</summary>
  [JsonStringEnumMemberName("none")]
  None,

  /// <summary>
  /// Include context from the requesting server (spec §21.2.4). This value is <b>Deprecated</b>;
  /// a server SHOULD use it only if the client declared the <c>sampling.context</c> sub-capability.
  /// </summary>
  [JsonStringEnumMemberName("thisServer")]
  ThisServer,

  /// <summary>
  /// Include context from all connected servers (spec §21.2.4). This value is <b>Deprecated</b>;
  /// a server SHOULD use it only if the client declared the <c>sampling.context</c> sub-capability.
  /// </summary>
  [JsonStringEnumMemberName("allServers")]
  AllServers,
}

/// <summary>
/// The parameters of a <c>sampling/createMessage</c> input request (spec §21.2.4) for the
/// <b>Deprecated</b> Sampling capability (§21.2). Sampling lets a server obtain a language-model
/// completion by delegating the model call to the client; it is delivered as an input-required
/// result and answered by retrying the originating request (§11).
/// </summary>
[Obsolete("Sampling (sampling/createMessage) is Deprecated (spec §21.2). Still accepted and round-tripped for backward compatibility.")]
public sealed record CreateMessageRequestParams
{
  /// <summary>The JSON-RPC method name of this input request (spec §21.2.4).</summary>
  public const string Method = "sampling/createMessage";

  /// <summary>
  /// REQUIRED. The conversation to sample from, ordered oldest to newest (spec §21.2.4). The list
  /// SHOULD NOT be retained between separate requests.
  /// </summary>
  public required IReadOnlyList<SamplingMessage> Messages { get; init; }

  /// <summary>
  /// OPTIONAL. The server's advisory preferences for which model to select; the client MAY ignore
  /// them (spec §21.2.4).
  /// </summary>
  public ModelPreferences? ModelPreferences { get; init; }

  /// <summary>
  /// OPTIONAL. A system prompt the server wants to use; the client MAY modify or ignore it without
  /// communicating the change to the server (spec §21.2.4).
  /// </summary>
  public string? SystemPrompt { get; init; }

  /// <summary>
  /// OPTIONAL. A request to include context from one or more connected servers (spec §21.2.4).
  /// The default when omitted is <see cref="IncludeContext.None"/>. Servers SHOULD omit this or use
  /// <see cref="IncludeContext.None"/>; the other values are Deprecated.
  /// </summary>
  public IncludeContext? IncludeContext { get; init; }

  /// <summary>
  /// OPTIONAL. Controls randomness; the valid range depends on the model provider. The client MAY
  /// modify or ignore it (spec §21.2.4).
  /// </summary>
  public double? Temperature { get; init; }

  /// <summary>
  /// REQUIRED. The requested maximum number of tokens to sample (spec §21.2.4). The client MAY
  /// sample fewer, but MUST respect this as an upper bound.
  /// </summary>
  public required long MaxTokens { get; init; }

  /// <summary>
  /// OPTIONAL. Sequences that, when generated, stop generation. The client MAY modify or ignore them
  /// (spec §21.2.4).
  /// </summary>
  public IReadOnlyList<string>? StopSequences { get; init; }

  /// <summary>
  /// OPTIONAL. Provider-specific parameters passed through to the model provider; the format is
  /// provider-specific and the client MAY modify or ignore it (spec §21.2.4).
  /// </summary>
  public JsonObject? Metadata { get; init; }

  /// <summary>
  /// OPTIONAL. Tools the model MAY use during generation, each using the <see cref="Tool"/> shape of
  /// §16; scoped to this request (spec §21.2.4). A client MUST return an error if this is provided
  /// but the client did not declare the <c>sampling.tools</c> capability.
  /// </summary>
  public IReadOnlyList<Tool>? Tools { get; init; }

  /// <summary>
  /// OPTIONAL. Controls how the model uses tools; the default when omitted is
  /// <c>{ "mode": "auto" }</c> (spec §21.2.4). A client MUST return an error if this is provided but
  /// the client did not declare the <c>sampling.tools</c> capability.
  /// </summary>
  public ToolChoice? ToolChoice { get; init; }
}

/// <summary>
/// The completion delivered back to the server, on retry, in response to a
/// <c>sampling/createMessage</c> input request (spec §21.2.8) for the <b>Deprecated</b> Sampling
/// capability (§21.2). The base <c>resultType</c> discriminator (§3) is supplied by the runtime.
/// </summary>
public sealed record CreateMessageResult
{
  /// <summary>
  /// REQUIRED. The role of the produced message, <c>user</c> or <c>assistant</c>; a completion is
  /// normally <c>assistant</c> (spec §21.2.8).
  /// </summary>
  public required Role Role { get; init; }

  /// <summary>
  /// REQUIRED. The produced content (spec §21.2.8). On the wire this is a single content block or an
  /// array of blocks; this SDK models it as an array (a single-block response is the one-element
  /// case). Tool-use requests are returned in the <c>assistant</c> role as <see cref="ToolUseContent"/>.
  /// </summary>
  public required IReadOnlyList<SamplingMessageContentBlock> Content { get; init; }

  /// <summary>REQUIRED. The name of the model that generated the message (spec §21.2.8).</summary>
  public required string Model { get; init; }

  /// <summary>
  /// OPTIONAL. The reason sampling stopped, if known (spec §21.2.8). This is an open string to allow
  /// provider-specific values; the standard values are <c>endTurn</c>, <c>stopSequence</c>,
  /// <c>maxTokens</c>, and <c>toolUse</c>.
  /// </summary>
  public string? StopReason { get; init; }

  /// <summary>
  /// REQUIRED on emit (spec §21.2.8, R-21.2.8-e; §3.6): the base result-type discriminator. A sampling
  /// completion is always <c>"complete"</c>. Defaults to <c>"complete"</c> so a constructed result is
  /// well-formed, and so an inbound result that OMITS <c>resultType</c> degrades to <c>complete</c> per
  /// the §3.6 receiver rule rather than failing to bind.
  /// </summary>
  public string ResultType { get; init; } = ResultTypes.Complete;

  /// <summary>OPTIONAL. Reserved metadata (spec §21.2.8/§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }

  /// <summary>
  /// Asserts the §21.2.8 emit invariant before this result is sent back to the server: the required
  /// <see cref="Model"/> is non-empty (R-21.2.8-c) and <see cref="ResultType"/> is the completion
  /// discriminator <c>"complete"</c> (R-21.2.8-e). <see cref="Role"/> and <see cref="Content"/> are
  /// <c>required</c> members, so their presence is already enforced when binding from the wire. Returns
  /// this same instance for fluent use; never apply on receipt (a receiver degrades per §3.6).
  /// </summary>
  /// <returns>This instance.</returns>
  /// <exception cref="ArgumentException">When <see cref="Model"/> is empty or <see cref="ResultType"/> is not <c>"complete"</c>.</exception>
  public CreateMessageResult Validated()
  {
    if (string.IsNullOrEmpty(Model))
    {
      throw new ArgumentException("CreateMessageResult.model is REQUIRED and MUST be non-empty (§21.2.8, R-21.2.8-c).", nameof(Model));
    }
    if (ResultType != ResultTypes.Complete)
    {
      throw new ArgumentException(
        $"CreateMessageResult.resultType MUST be \"{ResultTypes.Complete}\" (§21.2.8, R-21.2.8-e); got \"{ResultType}\".", nameof(ResultType));
    }
    return this;
  }
}

/// <summary>
/// The §21.2 sampling behavioral layer — the C# counterpart of the TypeScript
/// <c>protocol/sampling.ts</c> helpers — for the <b>Deprecated</b> Sampling capability. The wire
/// records above carry the data shapes; this static class adds the rules the spec layers on top:
/// the capability gate (<see cref="GateSamplingToolUse"/> / <see cref="MayServerSendSamplingRequest"/>,
/// rejecting tool use without <c>sampling.tools</c> with <c>-32602</c>; gating the Deprecated
/// <c>includeContext</c> values via <c>sampling.context</c>), the §21.2.7/§21.2.6 message-content
/// constraints (ordering, user tool_result exclusivity, tool_result back-references), the
/// <c>ModelPreferences</c> priority 0..1 validation (R-21.2.9-e), and the various resolvers/defaults.
/// </summary>
public static class SamplingValidation
{
  /// <summary>The four standard <c>stopReason</c> values; the field itself is an open string (§21.2.8, R-21.2.8-d).</summary>
  public static IReadOnlyList<string> StandardStopReasons { get; } = ["endTurn", "stopSequence", "maxTokens", "toolUse"];

  /// <summary>The Deprecated <c>includeContext</c> values gated by <c>sampling.context</c> (§21.2.4). Mirrors TS <c>DEPRECATED_INCLUDE_CONTEXT_VALUES</c>.</summary>
  public static IReadOnlySet<IncludeContext> DeprecatedIncludeContextValues { get; } =
    new HashSet<IncludeContext> { IncludeContext.ThisServer, IncludeContext.AllServers };

  /// <summary>
  /// The fields a client/host MAY modify or omit as part of its human-in-the-loop control over a
  /// sampling request, without communicating the change to the server (§21.2.10-e). Mirrors TS
  /// <c>CLIENT_MODIFIABLE_REQUEST_FIELDS</c>.
  /// </summary>
  public static IReadOnlyList<string> ClientModifiableRequestFields { get; } =
    ["systemPrompt", "includeContext", "temperature", "stopSequences", "metadata"];

  /// <summary>Returns <c>true</c> when <paramref name="reason"/> is one of the four standard stop reasons. Mirrors TS <c>isStandardStopReason</c>.</summary>
  /// <param name="reason">The stop-reason value.</param>
  /// <returns><c>true</c> when standard.</returns>
  public static bool IsStandardStopReason(string reason) => StandardStopReasons.Contains(reason);

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a Deprecated <c>includeContext</c> value. Mirrors TS <c>isDeprecatedIncludeContext</c>. (§21.2.4)</summary>
  /// <param name="value">The <c>includeContext</c> value.</param>
  /// <returns><c>true</c> when Deprecated.</returns>
  public static bool IsDeprecatedIncludeContext(IncludeContext value) => DeprecatedIncludeContextValues.Contains(value);

  /// <summary>Returns <c>true</c> when <paramref name="field"/> is one the client MAY modify/omit (§21.2.10-e). Mirrors TS <c>isClientModifiableRequestField</c>.</summary>
  /// <param name="field">The field name.</param>
  /// <returns><c>true</c> when modifiable.</returns>
  public static bool IsClientModifiableRequestField(string field) => ClientModifiableRequestFields.Contains(field);

  /// <summary>Maps an <see cref="IncludeContext"/> enum value to its lowercase/camelCase wire string (§21.2.4).</summary>
  /// <param name="value">The enum value.</param>
  /// <returns>The wire string (for example <c>thisServer</c>).</returns>
  public static string IncludeContextWireValue(IncludeContext value) => value switch
  {
    IncludeContext.None => "none",
    IncludeContext.ThisServer => "thisServer",
    IncludeContext.AllServers => "allServers",
    _ => "none",
  };

  /// <summary>
  /// Resolves the effective <c>includeContext</c>, defaulting to <see cref="IncludeContext.None"/>
  /// when omitted (§21.2.4). Mirrors TS <c>resolveIncludeContext</c>.
  /// </summary>
  /// <param name="includeContext">The request's <c>includeContext</c>, or <c>null</c> when omitted.</param>
  /// <returns>The effective value.</returns>
  public static IncludeContext ResolveIncludeContext(IncludeContext? includeContext) => includeContext ?? IncludeContext.None;

  /// <summary>
  /// Resolves the effective <see cref="ToolChoice"/>, applying the <c>{ mode: "auto" }</c> default for
  /// an omitted <c>toolChoice</c> or an omitted <c>mode</c> (R-21.2.4-p). Mirrors TS <c>resolveToolChoice</c>.
  /// </summary>
  /// <param name="toolChoice">The request's <c>toolChoice</c>, or <c>null</c> when omitted.</param>
  /// <returns>A <see cref="ToolChoice"/> with a concrete <see cref="ToolChoiceMode"/>.</returns>
  public static ToolChoice ResolveToolChoice(ToolChoice? toolChoice) =>
    toolChoice?.Mode is { } mode ? new ToolChoice { Mode = mode } : new ToolChoice { Mode = ToolChoiceMode.Auto };

  /// <summary>
  /// Clamps a produced token count to the request's <c>maxTokens</c> upper bound. The client MAY
  /// sample fewer (R-21.2.4-i) but MUST NOT exceed <c>maxTokens</c> (R-21.2.4-j). Mirrors TS
  /// <c>clampToMaxTokens</c>.
  /// </summary>
  /// <param name="produced">The number of tokens produced.</param>
  /// <param name="maxTokens">The request's hard upper bound.</param>
  /// <returns>The clamped count.</returns>
  public static long ClampToMaxTokens(long produced, long maxTokens) => produced > maxTokens ? maxTokens : produced;

  /// <summary>
  /// Returns <c>true</c> when the request is tool-enabled — it carries <c>tools</c> or <c>toolChoice</c>.
  /// Such a request requires <c>sampling.tools</c> on both sides (R-21.2.3-a/b). Mirrors TS
  /// <c>isToolEnabledRequest</c>.
  /// </summary>
  /// <param name="parameters">The request params.</param>
  /// <returns><c>true</c> when tool-enabled.</returns>
  public static bool IsToolEnabledRequest(CreateMessageRequestParams parameters)
  {
    ArgumentNullException.ThrowIfNull(parameters);
    return parameters.Tools is not null || parameters.ToolChoice is not null;
  }

  /// <summary>
  /// Selects the first <see cref="ModelHint"/> whose <c>name</c> is a substring of a candidate model
  /// name, honoring the order-sensitive first-match rule (R-21.2.9-b/f). Hints are advisory; the
  /// caller makes the final selection. Mirrors TS <c>selectFirstHintMatch</c>.
  /// </summary>
  /// <param name="hints">The ordered hints from <see cref="ModelPreferences"/>, or <c>null</c>.</param>
  /// <param name="availableModels">The candidate model names the client can run.</param>
  /// <returns>The first matching hint/model pair, or <c>null</c> when none matches.</returns>
  public static ModelHintMatch? SelectFirstHintMatch(IReadOnlyList<ModelHint>? hints, IReadOnlyList<string> availableModels)
  {
    ArgumentNullException.ThrowIfNull(availableModels);
    if (hints is null) return null;
    foreach (var hint in hints)
    {
      if (hint.Name is not { } needle) continue;
      foreach (var model in availableModels)
      {
        if (model.Contains(needle, StringComparison.Ordinal)) return new ModelHintMatch(hint, model);
      }
    }
    return null;
  }

  /// <summary>
  /// Builds the <c>-32602</c> error a client MUST return when a sampling request includes <c>tools</c>
  /// or <c>toolChoice</c> but the client did not declare <c>sampling.tools</c> (R-21.2.3-b, R-21.2.4-n/o).
  /// Mirrors TS <c>buildSamplingToolsNotDeclaredError</c>.
  /// </summary>
  /// <param name="field">The offending member: <c>tools</c> or <c>toolChoice</c>.</param>
  /// <returns>The constructed invalid-params error.</returns>
  public static McpError BuildSamplingToolsNotDeclaredError(SamplingToolField field)
  {
    var name = field == SamplingToolField.Tools ? "tools" : "toolChoice";
    var rule = field == SamplingToolField.Tools ? "n" : "o";
    return McpError.InvalidParams(
      $"Sampling request includes `{name}` but the client did not declare `sampling.tools` (R-21.2.3-b, R-21.2.4-{rule})");
  }

  /// <summary>
  /// Client-side gate: returns a failed result when a tool-enabled sampling request arrives but the
  /// client did not declare <c>sampling.tools</c> (R-21.2.3-b, R-21.2.4-n/o). <c>tools</c> is checked
  /// before <c>toolChoice</c> so the error names the first offending field deterministically. When
  /// <c>sampling.tools</c> is declared, or the request is not tool-enabled, the gate passes. Mirrors
  /// TS <c>gateSamplingToolUse</c>.
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <param name="parameters">The incoming sampling params.</param>
  /// <returns>The gate result; on failure carrying the <c>-32602</c> error.</returns>
  public static SamplingGateResult GateSamplingToolUse(JsonObject clientCaps, CreateMessageRequestParams parameters)
  {
    ArgumentNullException.ThrowIfNull(clientCaps);
    ArgumentNullException.ThrowIfNull(parameters);
    if (!IsToolEnabledRequest(parameters)) return SamplingGateResult.Allowed;
    if (CapabilityNegotiation.MayUseSamplingTools(clientCaps)) return SamplingGateResult.Allowed;
    var field = parameters.Tools is not null ? SamplingToolField.Tools : SamplingToolField.ToolChoice;
    return SamplingGateResult.Rejected(BuildSamplingToolsNotDeclaredError(field));
  }

  /// <summary>
  /// Server-side gate: returns <c>true</c> only when the server MAY send the given sampling params to
  /// a client with <paramref name="clientCaps"/> (R-21.2.3-a). A server MUST NOT invoke sampling at
  /// all unless the client declared <c>sampling</c>, MUST NOT send a tool-enabled request to a client
  /// lacking <c>sampling.tools</c>, and MUST NOT use a Deprecated <c>includeContext</c> value without
  /// <c>sampling.context</c> (R-21.2.3-c, R-21.2.4-e — via <see cref="CapabilityNegotiation.MayUseIncludeContext"/>).
  /// Mirrors TS <c>mayServerSendSamplingRequest</c>.
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <param name="parameters">The sampling params the server wants to send.</param>
  /// <returns><c>true</c> when the request may be sent.</returns>
  public static bool MayServerSendSamplingRequest(JsonObject clientCaps, CreateMessageRequestParams parameters)
  {
    ArgumentNullException.ThrowIfNull(clientCaps);
    ArgumentNullException.ThrowIfNull(parameters);
    if (!CapabilityNegotiation.MayInvokeSampling(clientCaps)) return false;
    if (IsToolEnabledRequest(parameters) && !CapabilityNegotiation.MayUseSamplingTools(clientCaps)) return false;
    var includeContext = parameters.IncludeContext is { } ic ? IncludeContextWireValue(ic) : null;
    return CapabilityNegotiation.MayUseIncludeContext(clientCaps, includeContext);
  }

  /// <summary>
  /// Validates the <c>ModelPreferences</c> numeric priorities: each, when present, MUST be a number
  /// in the inclusive range 0..1 (R-21.2.9-e). Returns the first out-of-range field, or <c>null</c>
  /// when all priorities are in range (or absent). Mirrors the TS <c>PrioritySchema</c> bound.
  /// </summary>
  /// <param name="preferences">The preferences to validate, or <c>null</c>.</param>
  /// <returns>The first invalid priority field name, or <c>null</c> when valid.</returns>
  public static string? ValidateModelPreferences(ModelPreferences? preferences)
  {
    if (preferences is null) return null;
    if (!IsValidPriority(preferences.CostPriority)) return "costPriority";
    if (!IsValidPriority(preferences.SpeedPriority)) return "speedPriority";
    if (!IsValidPriority(preferences.IntelligencePriority)) return "intelligencePriority";
    return null;
  }

  /// <summary>Returns <c>true</c> when <paramref name="priority"/> is absent or a finite number in 0..1 inclusive (R-21.2.9-e).</summary>
  /// <param name="priority">The priority weight, or <c>null</c>.</param>
  /// <returns><c>true</c> when in range (or absent).</returns>
  public static bool IsValidPriority(double? priority)
  {
    if (priority is not { } p) return true;
    return !double.IsNaN(p) && p >= 0 && p <= 1;
  }

  /// <summary>
  /// Full client-side validation of an inbound sampling request: structural minimum (non-empty
  /// <c>messages</c>, present <c>maxTokens</c>) plus the <c>ModelPreferences</c> priority bounds and
  /// the tool-use capability gate (R-21.2.4-a/h, R-21.2.9-e, R-21.2.3-b, R-21.2.4-n/o). Returns
  /// <see cref="SamplingGateResult.Allowed"/> on success, or a rejection carrying the <c>-32602</c>
  /// error. Mirrors TS <c>validateSamplingRequest</c> (deserialization already enforces the
  /// required-field shape; this re-checks the same constraints plus the gate).
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <param name="parameters">The parsed sampling params.</param>
  /// <returns>The validation result.</returns>
  public static SamplingGateResult ValidateSamplingRequest(JsonObject clientCaps, CreateMessageRequestParams parameters)
  {
    ArgumentNullException.ThrowIfNull(clientCaps);
    ArgumentNullException.ThrowIfNull(parameters);
    if (parameters.Messages.Count == 0)
    {
      return SamplingGateResult.Rejected(
        McpError.InvalidParams("Malformed sampling/createMessage params: `messages` must be a non-empty array (R-21.2.4-a)"));
    }
    if (ValidateModelPreferences(parameters.ModelPreferences) is { } badField)
    {
      return SamplingGateResult.Rejected(
        McpError.InvalidParams($"Malformed sampling/createMessage params: `modelPreferences.{badField}` must be a number in [0, 1] (R-21.2.9-e)"));
    }
    return GateSamplingToolUse(clientCaps, parameters);
  }

  // ─── Message-content constraints (§21.2.7 / §21.2.6) ───────────────────────────────────────────

  private static bool ContainsType(IReadOnlyList<SamplingMessageContentBlock> blocks, string type) =>
    blocks.Any(b => BlockType(b) == type);

  private static string? BlockType(SamplingMessageContentBlock block) => block switch
  {
    ToolUseContent => "tool_use",
    ToolResultContent => "tool_result",
    SamplingTextContent => "text",
    SamplingImageContent => "image",
    SamplingAudioContent => "audio",
    _ => null,
  };

  /// <summary>
  /// Validates the §21.2.7 content constraint on a single <c>user</c> message: when a <c>user</c>
  /// message contains any <c>tool_result</c> block, it MUST contain ONLY <c>tool_result</c> blocks —
  /// mixing with text/image/audio (or any other type) is NOT allowed (R-21.2.7-a). Non-<c>user</c>
  /// messages, and <c>user</c> messages without tool results, are unconstrained. Mirrors TS
  /// <c>validateUserToolResultExclusivity</c>.
  /// </summary>
  /// <param name="message">The message to validate.</param>
  /// <returns>The validation result; on failure carrying a reason.</returns>
  public static MessageValidationResult ValidateUserToolResultExclusivity(SamplingMessage message)
  {
    ArgumentNullException.ThrowIfNull(message);
    if (message.Role != Role.User) return MessageValidationResult.Pass;
    var blocks = message.Content;
    if (!ContainsType(blocks, "tool_result")) return MessageValidationResult.Pass;
    var onlyToolResults = blocks.All(b => BlockType(b) == "tool_result");
    return onlyToolResults
      ? MessageValidationResult.Pass
      : MessageValidationResult.Fail(
          "A user message containing tool_result blocks MUST contain ONLY tool_result blocks (R-21.2.7-a)");
  }

  /// <summary>
  /// Validates the §21.2.7 ordering/matching constraint across a <c>messages</c> sequence: every
  /// <c>assistant</c> message containing one or more <see cref="ToolUseContent"/> blocks MUST be
  /// followed IMMEDIATELY by a <c>user</c> message consisting ENTIRELY of <see cref="ToolResultContent"/>
  /// blocks, with each tool use matched by a corresponding result (by id), before any other message;
  /// multiple parallel tool uses are permitted (R-21.2.7-b). Also enforces the per-message exclusivity
  /// rule (R-21.2.7-a) on each <c>user</c> message. Mirrors TS <c>validateSamplingMessageOrdering</c>.
  /// </summary>
  /// <param name="messages">The conversation, oldest to newest.</param>
  /// <returns>The validation result; on failure carrying a reason and the offending index.</returns>
  public static MessageValidationResult ValidateSamplingMessageOrdering(IReadOnlyList<SamplingMessage> messages)
  {
    ArgumentNullException.ThrowIfNull(messages);
    for (var i = 0; i < messages.Count; i++)
    {
      var message = messages[i];

      // Per-message exclusivity for user tool-result messages. (R-21.2.7-a)
      var exclusivity = ValidateUserToolResultExclusivity(message);
      if (!exclusivity.Ok) return MessageValidationResult.Fail(exclusivity.Reason!, i);

      if (message.Role != Role.Assistant) continue;
      var blocks = message.Content;
      if (!ContainsType(blocks, "tool_use")) continue;

      // Collect the ids of this assistant message's tool uses. (R-21.2.7-b)
      var useIds = blocks.OfType<ToolUseContent>().Select(b => b.Id).ToList();

      if (i + 1 >= messages.Count)
      {
        return MessageValidationResult.Fail(
          "An assistant message with tool_use MUST be followed immediately by a user tool_result message (R-21.2.7-b)", i);
      }
      var next = messages[i + 1];
      if (next.Role != Role.User)
      {
        return MessageValidationResult.Fail(
          "The message after an assistant tool_use MUST be a user message of tool_result blocks (R-21.2.7-b)", i + 1);
      }
      var nextBlocks = next.Content;
      var allToolResults = nextBlocks.Count > 0 && nextBlocks.All(b => BlockType(b) == "tool_result");
      if (!allToolResults)
      {
        return MessageValidationResult.Fail(
          "The user message following an assistant tool_use MUST consist entirely of tool_result blocks (R-21.2.7-b)", i + 1);
      }
      var resultIds = new HashSet<string>(nextBlocks.OfType<ToolResultContent>().Select(b => b.ToolUseId), StringComparer.Ordinal);
      // Each tool use must be matched by a corresponding tool result. (R-21.2.7-b, R-21.2.6-d)
      foreach (var id in useIds)
      {
        if (!resultIds.Contains(id))
        {
          return MessageValidationResult.Fail(
            $"tool_use id \"{id}\" has no matching tool_result toolUseId (R-21.2.7-b, R-21.2.6-d)", i + 1);
        }
      }
    }
    return MessageValidationResult.Pass;
  }

  /// <summary>
  /// Validates that every <c>tool_result</c> block's <c>toolUseId</c> refers to the <c>id</c> of a
  /// <c>tool_use</c> that appeared EARLIER in the message sequence (R-21.2.6-d). Returns the first
  /// dangling reference, or success. Mirrors TS <c>validateToolResultReferences</c>.
  /// </summary>
  /// <param name="messages">The conversation, oldest to newest.</param>
  /// <returns>The validation result; on failure carrying the offending <c>toolUseId</c>.</returns>
  public static ToolReferenceValidationResult ValidateToolResultReferences(IReadOnlyList<SamplingMessage> messages)
  {
    ArgumentNullException.ThrowIfNull(messages);
    var seenUseIds = new HashSet<string>(StringComparer.Ordinal);
    foreach (var message in messages)
    {
      foreach (var block in message.Content)
      {
        switch (block)
        {
          case ToolUseContent use:
            seenUseIds.Add(use.Id);
            break;
          case ToolResultContent result:
            if (!seenUseIds.Contains(result.ToolUseId))
            {
              return ToolReferenceValidationResult.Fail(
                "ToolResultContent.toolUseId MUST match the id of a previous ToolUseContent (R-21.2.6-d)",
                result.ToolUseId);
            }
            break;
        }
      }
    }
    return ToolReferenceValidationResult.Pass;
  }

  // ─── Consent & safety obligations (§21.2.10) ───────────────────────────────────────────────────

  /// <summary>The MUST-level consent obligations a conforming client/host MUST satisfy (R-21.2.10-a/b/h).</summary>
  public static IReadOnlyList<string> RequiredConsentObligations { get; } =
    ["humanInTheLoop", "userMayDeny", "handleSensitiveData"];

  /// <summary>
  /// Returns the MUST-level §21.2.10 obligations that <paramref name="obligations"/> does NOT meet;
  /// an empty list means the hard requirements are satisfied. SHOULD-level obligations are advisory
  /// and never reported here. Mirrors TS <c>unmetRequiredConsentObligations</c>. (R-21.2.10-a/b/h)
  /// </summary>
  /// <param name="obligations">The host's claimed obligations.</param>
  /// <returns>The unmet MUST obligations.</returns>
  public static IReadOnlyList<string> UnmetRequiredConsentObligations(SamplingConsentObligations obligations)
  {
    ArgumentNullException.ThrowIfNull(obligations);
    var unmet = new List<string>();
    if (!obligations.HumanInTheLoop) unmet.Add("humanInTheLoop");
    if (!obligations.UserMayDeny) unmet.Add("userMayDeny");
    if (!obligations.HandleSensitiveData) unmet.Add("handleSensitiveData");
    return unmet;
  }

  /// <summary>
  /// Enforces a tool-loop iteration limit during sampling tool use; both parties SHOULD apply such a
  /// limit (R-21.2.10-i). Returns <c>true</c> when another iteration is permitted (the current
  /// zero-based count is below the limit). Mirrors TS <c>withinToolLoopLimit</c>.
  /// </summary>
  /// <param name="iteration">The zero-based count of tool-loop iterations already run.</param>
  /// <param name="limit">The maximum number of iterations allowed.</param>
  /// <returns><c>true</c> when another iteration is allowed.</returns>
  public static bool WithinToolLoopLimit(int iteration, int limit) => iteration < limit;
}

/// <summary>Which sampling member triggered a tool-use gate rejection (§21.2.3).</summary>
public enum SamplingToolField
{
  /// <summary>The request carried a <c>tools</c> array (R-21.2.4-n).</summary>
  Tools,

  /// <summary>The request carried a <c>toolChoice</c> (R-21.2.4-o).</summary>
  ToolChoice,
}

/// <summary>The outcome of a sampling capability gate (§21.2.3). Mirrors TS <c>SamplingGateResult</c>.</summary>
public sealed record SamplingGateResult
{
  private SamplingGateResult() { }

  /// <summary><c>true</c> when the request is permitted.</summary>
  public bool Ok { get; private init; }

  /// <summary>The <c>-32602</c> error when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public McpError? Error { get; private init; }

  /// <summary>A shared "allowed" result.</summary>
  public static SamplingGateResult Allowed { get; } = new() { Ok = true };

  /// <summary>Builds a rejection carrying the gate <paramref name="error"/>.</summary>
  /// <param name="error">The invalid-params error.</param>
  /// <returns>A rejection result.</returns>
  public static SamplingGateResult Rejected(McpError error) => new() { Ok = false, Error = error };
}

/// <summary>The outcome of a §21.2.7 message-content validation. Mirrors the TS <c>{ ok, reason?, index? }</c> shape.</summary>
public sealed record MessageValidationResult
{
  private MessageValidationResult() { }

  /// <summary><c>true</c> when the message(s) are well-formed.</summary>
  public bool Ok { get; private init; }

  /// <summary>The failure reason when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public string? Reason { get; private init; }

  /// <summary>The index of the offending message when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public int? Index { get; private init; }

  /// <summary>A shared success result.</summary>
  public static MessageValidationResult Pass { get; } = new() { Ok = true };

  /// <summary>Builds a failure carrying a reason and optional offending index.</summary>
  /// <param name="reason">The failure reason.</param>
  /// <param name="index">The offending message index, if known.</param>
  /// <returns>A failure result.</returns>
  public static MessageValidationResult Fail(string reason, int? index = null) =>
    new() { Ok = false, Reason = reason, Index = index };
}

/// <summary>The outcome of a tool_result back-reference validation (§21.2.6-d). Mirrors the TS <c>{ ok, reason?, toolUseId? }</c> shape.</summary>
public sealed record ToolReferenceValidationResult
{
  private ToolReferenceValidationResult() { }

  /// <summary><c>true</c> when every tool_result references a prior tool_use.</summary>
  public bool Ok { get; private init; }

  /// <summary>The failure reason when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public string? Reason { get; private init; }

  /// <summary>The dangling <c>toolUseId</c> when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public string? ToolUseId { get; private init; }

  /// <summary>A shared success result.</summary>
  public static ToolReferenceValidationResult Pass { get; } = new() { Ok = true };

  /// <summary>Builds a failure carrying a reason and the dangling <c>toolUseId</c>.</summary>
  /// <param name="reason">The failure reason.</param>
  /// <param name="toolUseId">The dangling id.</param>
  /// <returns>A failure result.</returns>
  public static ToolReferenceValidationResult Fail(string reason, string toolUseId) =>
    new() { Ok = false, Reason = reason, ToolUseId = toolUseId };
}

/// <summary>The first <see cref="ModelHint"/> matched against a candidate model name (§21.2.9).</summary>
/// <param name="Hint">The matching hint.</param>
/// <param name="Model">The candidate model name it matched.</param>
public sealed record ModelHintMatch(ModelHint Hint, string Model);

/// <summary>
/// The §21.2.10 consent &amp; safety obligations a conforming client/host claims to honor around
/// sampling, surfaced as a structured checklist. Mirrors TS <c>SamplingConsentObligations</c>.
/// </summary>
public sealed record SamplingConsentObligations
{
  /// <summary>MUST keep a human in the loop (R-21.2.10-a).</summary>
  public required bool HumanInTheLoop { get; init; }

  /// <summary>MUST let the user deny a sampling request (R-21.2.10-b).</summary>
  public required bool UserMayDeny { get; init; }

  /// <summary>SHOULD present the prompt for review/edit/reject before sampling (R-21.2.10-c).</summary>
  public required bool ReviewPromptBeforeSampling { get; init; }

  /// <summary>SHOULD present the result for review/edit/reject before the server sees it (R-21.2.10-d).</summary>
  public required bool ReviewResultBeforeServer { get; init; }

  /// <summary>MAY modify/omit the control fields (R-21.2.10-e).</summary>
  public required bool MayModifyControlFields { get; init; }

  /// <summary>SHOULD implement rate limiting (R-21.2.10-f).</summary>
  public required bool RateLimiting { get; init; }

  /// <summary>SHOULD validate message content (R-21.2.10-g).</summary>
  public required bool ValidateContent { get; init; }

  /// <summary>MUST handle sensitive data appropriately (R-21.2.10-h).</summary>
  public required bool HandleSensitiveData { get; init; }

  /// <summary>SHOULD implement iteration limits for tool loops when tools are used (R-21.2.10-i).</summary>
  public required bool ToolLoopIterationLimits { get; init; }
}
