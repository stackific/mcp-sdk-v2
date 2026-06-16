using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// A prompt or prompt template offered by the server (spec §18.3): a named, optionally
/// argument-accepting template that renders into conversation messages via <c>prompts/get</c>.
/// </summary>
public sealed record Prompt
{
  /// <summary>REQUIRED. The programmatic prompt identifier supplied in <c>prompts/get</c>.</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. A human display name (preferred over <see cref="Name"/> for display).</summary>
  public string? Title { get; init; }

  /// <summary>OPTIONAL. A human-readable description of what the prompt provides.</summary>
  public string? Description { get; init; }

  /// <summary>OPTIONAL. The arguments the prompt accepts for templating (absent/empty ⇒ none).</summary>
  public IReadOnlyList<PromptArgument>? Arguments { get; init; }

  /// <summary>OPTIONAL. Icons for display (§14.2).</summary>
  public IReadOnlyList<Icon>? Icons { get; init; }

  /// <summary>OPTIONAL. Implementation-specific metadata (§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>A single argument a prompt accepts (spec §18.3).</summary>
public sealed record PromptArgument
{
  /// <summary>REQUIRED. The argument's programmatic name (the key in the <c>prompts/get</c> arguments map).</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. A human display name.</summary>
  public string? Title { get; init; }

  /// <summary>OPTIONAL. A human-readable description.</summary>
  public string? Description { get; init; }

  /// <summary>OPTIONAL (default <c>false</c>). When <c>true</c>, the argument MUST be supplied (else <c>-32602</c>).</summary>
  public bool? Required { get; init; }
}

/// <summary>One message within a resolved prompt (spec §18.5): a role paired with a single content block.</summary>
public sealed record PromptMessage
{
  /// <summary>REQUIRED. The speaker of the message.</summary>
  public required Role Role { get; init; }

  /// <summary>REQUIRED. Exactly one content block (a single object, not an array).</summary>
  public required ContentBlock Content { get; init; }
}

/// <summary>The paginated, cacheable result of <c>prompts/list</c> (spec §18.2).</summary>
public sealed record ListPromptsResult
{
  /// <summary>REQUIRED. The page of prompts (may be empty).</summary>
  public required IReadOnlyList<Prompt> Prompts { get; init; }

  /// <summary>OPTIONAL. Opaque cursor for the next page; absent on the last page (§12).</summary>
  public string? NextCursor { get; init; }

  /// <summary>The cache time-to-live hint in milliseconds (§13).</summary>
  public long? TtlMs { get; init; }

  /// <summary>The cache sharing scope (§13).</summary>
  public CacheScope? CacheScope { get; init; }
}

/// <summary>The result of a completed <c>prompts/get</c> (spec §18.4).</summary>
public sealed record GetPromptResult
{
  /// <summary>OPTIONAL. A human-readable description of the rendered prompt.</summary>
  public string? Description { get; init; }

  /// <summary>REQUIRED. The ordered messages constituting the prompt.</summary>
  public required IReadOnlyList<PromptMessage> Messages { get; init; }

  /// <summary>OPTIONAL. Implementation-specific metadata (§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// The discriminated outcome of inspecting a <c>prompts/get</c> reply (spec §18.4): a completed
/// <see cref="GetPromptResult"/>, an <c>input_required</c> continuation, or a malformed/unrecognized
/// body.
/// </summary>
public enum GetPromptResponseKind
{
  /// <summary>A completed prompt carrying <c>messages</c> (the absent-⇒-complete default applies, R-18.4-p).</summary>
  Complete,

  /// <summary>The server needs additional client input before the prompt can render (§11, R-18.4-q).</summary>
  InputRequired,

  /// <summary>The reply did not match either expected shape.</summary>
  Error,
}

/// <summary>
/// The result of <see cref="Prompts.DiscriminateGetPromptResponse"/>: which branch a
/// <c>prompts/get</c> reply fell into, plus the parsed payload for the matched branch (spec §18.4).
/// </summary>
/// <param name="Kind">Which branch the reply matched.</param>
/// <param name="Result">The completed prompt when <see cref="Kind"/> is <see cref="GetPromptResponseKind.Complete"/>.</param>
/// <param name="InputRequired">The continuation when <see cref="Kind"/> is <see cref="GetPromptResponseKind.InputRequired"/>.</param>
/// <param name="Reason">A human-readable reason when <see cref="Kind"/> is <see cref="GetPromptResponseKind.Error"/>.</param>
public sealed record GetPromptResponseDiscrimination(
  GetPromptResponseKind Kind,
  GetPromptResult? Result,
  InputRequiredResult? InputRequired,
  string? Reason);

/// <summary>
/// The §18.4 normative prompt-response helpers ported from the TypeScript SDK's <c>prompts.ts</c>: the
/// <c>resultType</c> discrimination that tolerates an ABSENT discriminator (absent ⇒ complete) and
/// recognises the <c>input_required</c> continuation, plus the required-argument extractor.
/// </summary>
public static class Prompts
{
  /// <summary>
  /// Returns the names of every argument the prompt declares with <c>required: true</c> — the set a
  /// <c>prompts/get</c> request MUST supply a value for. A prompt with no arguments requires none.
  /// (R-18.3-l, R-18.4-e)
  /// </summary>
  /// <param name="prompt">The prompt whose required arguments to enumerate.</param>
  /// <returns>The required argument names.</returns>
  public static IReadOnlyList<string> RequiredArgumentNames(Prompt prompt)
  {
    ArgumentNullException.ThrowIfNull(prompt);
    return (prompt.Arguments ?? [])
      .Where(arg => arg.Required == true)
      .Select(arg => arg.Name)
      .ToList();
  }

  /// <summary>
  /// Resolves the <c>resultType</c> of a received <c>prompts/get</c> result, treating an absent (or
  /// non-string) value as <c>"complete"</c>. (R-18.4-p)
  /// </summary>
  /// <param name="result">The raw result object received on the wire.</param>
  /// <returns>The resolved result type.</returns>
  public static string ResolveResultType(JsonObject result)
  {
    ArgumentNullException.ThrowIfNull(result);
    return result["resultType"] is JsonValue v && v.GetValueKind() == JsonValueKind.String
      ? v.GetValue<string>()
      : ResultTypes.Complete;
  }

  /// <summary>
  /// Branches a <c>prompts/get</c> response on its <c>resultType</c> discriminator (§18.4):
  /// <c>"input_required"</c> ⇒ a continuation (R-18.4-q); <c>"complete"</c> or an ABSENT
  /// <c>resultType</c> ⇒ a completed <see cref="GetPromptResult"/> (the absent-⇒-complete default,
  /// R-18.4-p); any other value or a body that fails its shape ⇒ an error branch (R-18.4-r). A client
  /// MUST inspect <c>resultType</c> before parsing the body.
  /// </summary>
  /// <param name="response">The raw <c>result</c> object received on the wire.</param>
  /// <returns>The discriminated outcome.</returns>
  public static GetPromptResponseDiscrimination DiscriminateGetPromptResponse(JsonNode? response)
  {
    if (response is not JsonObject obj)
    {
      return new GetPromptResponseDiscrimination(
        GetPromptResponseKind.Error, null, null, "prompts/get result is not a JSON object");
    }

    var resultType = ResolveResultType(obj);

    if (resultType == ResultTypes.InputRequired)
    {
      var inputRequired = obj.Deserialize<InputRequiredResult>(McpJson.Options);
      return inputRequired is null
        ? new GetPromptResponseDiscrimination(
            GetPromptResponseKind.Error, null, null, "malformed input_required prompt result")
        : new GetPromptResponseDiscrimination(
            GetPromptResponseKind.InputRequired, null, inputRequired, null);
    }

    if (resultType != ResultTypes.Complete)
    {
      return new GetPromptResponseDiscrimination(
        GetPromptResponseKind.Error, null, null, $"unrecognized resultType \"{resultType}\"");
    }

    try
    {
      var result = obj.Deserialize<GetPromptResult>(McpJson.Options);
      return result is null || result.Messages is null
        ? new GetPromptResponseDiscrimination(
            GetPromptResponseKind.Error, null, null, "malformed GetPromptResult (missing messages)")
        : new GetPromptResponseDiscrimination(GetPromptResponseKind.Complete, result, null, null);
    }
    catch (JsonException ex)
    {
      return new GetPromptResponseDiscrimination(
        GetPromptResponseKind.Error, null, null, $"malformed GetPromptResult: {ex.Message}");
    }
  }
}
