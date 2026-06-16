using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// A concrete, directly readable resource identified by a URI (spec §17.4). Composes the
/// <c>BaseMetadata</c> name/title pair and the optional icons array.
/// </summary>
public sealed record Resource
{
  /// <summary>REQUIRED. The URI uniquely identifying this resource (any scheme).</summary>
  public required string Uri { get; init; }

  /// <summary>REQUIRED. The programmatic resource name.</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. A human display name (preferred over <see cref="Name"/> for display).</summary>
  public string? Title { get; init; }

  /// <summary>OPTIONAL. Prose describing what the resource represents.</summary>
  public string? Description { get; init; }

  /// <summary>OPTIONAL. The MIME type of the resource content, if known.</summary>
  public string? MimeType { get; init; }

  /// <summary>OPTIONAL. The raw content size in bytes (before encoding/tokenization), if known.</summary>
  public long? Size { get; init; }

  /// <summary>OPTIONAL. Untrusted presentation hints (§14.6).</summary>
  public Annotations? Annotations { get; init; }

  /// <summary>OPTIONAL. Icons for display (§14.2).</summary>
  public IReadOnlyList<Icon>? Icons { get; init; }

  /// <summary>OPTIONAL. Implementation-specific metadata (§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// A family of resources whose concrete URIs are produced by expanding an RFC 6570 URI Template
/// (spec §17.4). Has no <c>size</c> (size is a property of a concrete resource).
/// </summary>
public sealed record ResourceTemplate
{
  /// <summary>REQUIRED. An RFC 6570 URI Template (for example <c>weather://{city}/current</c>).</summary>
  public required string UriTemplate { get; init; }

  /// <summary>REQUIRED. The programmatic template name.</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. A human display name.</summary>
  public string? Title { get; init; }

  /// <summary>OPTIONAL. Prose describing the template's purpose.</summary>
  public string? Description { get; init; }

  /// <summary>OPTIONAL. A MIME type shared by every resource matching this template, if uniform.</summary>
  public string? MimeType { get; init; }

  /// <summary>OPTIONAL. Untrusted presentation hints (§14.6).</summary>
  public Annotations? Annotations { get; init; }

  /// <summary>OPTIONAL. Icons for display (§14.2).</summary>
  public IReadOnlyList<Icon>? Icons { get; init; }

  /// <summary>OPTIONAL. Implementation-specific metadata (§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>The paginated, cacheable result of <c>resources/list</c> (spec §17.2).</summary>
public sealed record ListResourcesResult
{
  /// <summary>REQUIRED. The page of resources (may be empty).</summary>
  public required IReadOnlyList<Resource> Resources { get; init; }

  /// <summary>OPTIONAL. Opaque cursor for the next page; absent on the last page (§12).</summary>
  public string? NextCursor { get; init; }

  /// <summary>
  /// REQUIRED on emit (§3.6, §17.2): the base result-type discriminator, <c>"complete"</c> for a
  /// list page. Defaults to <c>"complete"</c> so a constructed result is well-formed, and — because
  /// it is plain <c>init</c>-settable — an inbound result that OMITS <c>resultType</c> deserializes to
  /// this default, which is exactly the §3.6 receiver rule ("treat an absent <c>resultType</c> as if
  /// it were <c>complete</c>").
  /// </summary>
  public string ResultType { get; init; } = ResultTypes.Complete;

  /// <summary>The cache time-to-live hint in milliseconds (§13); REQUIRED on emit, tolerated absent on receipt.</summary>
  public long? TtlMs { get; init; }

  /// <summary>The cache sharing scope (§13); REQUIRED on emit, tolerated absent on receipt.</summary>
  public CacheScope? CacheScope { get; init; }

  /// <summary>
  /// Asserts the §17.2/§13 emit invariant — <see cref="ResultType"/> is <c>"complete"</c> and both
  /// caching hints are present and well-formed — returning this same instance for fluent use. Apply
  /// before sending; never on receipt (a receiver degrades per §3.6/§13.1 instead of throwing).
  /// </summary>
  /// <returns>This instance.</returns>
  /// <exception cref="ArgumentException">When the discriminator or a caching hint is malformed.</exception>
  public ListResourcesResult Validated()
  {
    Caching.ValidateCacheableComplete(ResultType, TtlMs, CacheScope, nameof(ListResourcesResult));
    return this;
  }
}

/// <summary>The paginated, cacheable result of <c>resources/templates/list</c> (spec §17.3).</summary>
public sealed record ListResourceTemplatesResult
{
  /// <summary>REQUIRED. The page of resource templates (may be empty).</summary>
  public required IReadOnlyList<ResourceTemplate> ResourceTemplates { get; init; }

  /// <summary>OPTIONAL. Opaque cursor for the next page; absent on the last page (§12).</summary>
  public string? NextCursor { get; init; }

  /// <summary>
  /// REQUIRED on emit (§3.6, §17.3): the base result-type discriminator, <c>"complete"</c> for a
  /// list page. Defaults to <c>"complete"</c>, which also makes an inbound result that omits
  /// <c>resultType</c> degrade to <c>complete</c> per the §3.6 receiver rule.
  /// </summary>
  public string ResultType { get; init; } = ResultTypes.Complete;

  /// <summary>The cache time-to-live hint in milliseconds (§13); REQUIRED on emit, tolerated absent on receipt.</summary>
  public long? TtlMs { get; init; }

  /// <summary>The cache sharing scope (§13); REQUIRED on emit, tolerated absent on receipt.</summary>
  public CacheScope? CacheScope { get; init; }

  /// <summary>
  /// Asserts the §17.3/§13 emit invariant — <see cref="ResultType"/> is <c>"complete"</c> and both
  /// caching hints are present and well-formed — returning this same instance. Apply before sending.
  /// </summary>
  /// <returns>This instance.</returns>
  /// <exception cref="ArgumentException">When the discriminator or a caching hint is malformed.</exception>
  public ListResourceTemplatesResult Validated()
  {
    Caching.ValidateCacheableComplete(ResultType, TtlMs, CacheScope, nameof(ListResourceTemplatesResult));
    return this;
  }
}

/// <summary>The cacheable result of <c>resources/read</c> (spec §17.5).</summary>
public sealed record ReadResourceResult
{
  /// <summary>REQUIRED. One or more content entries (text or blob variant); never empty for an existing resource.</summary>
  public required IReadOnlyList<ResourceContents> Contents { get; init; }

  /// <summary>
  /// REQUIRED on emit (§3.6, §17.5): the base result-type discriminator, <c>"complete"</c> for a
  /// completed read. Defaults to <c>"complete"</c>, which also makes an inbound result that omits
  /// <c>resultType</c> degrade to <c>complete</c> per the §3.6 receiver rule (R-17.5-q). A read reply
  /// MAY instead carry <c>"input_required"</c> (§11); discriminate with
  /// <see cref="Resources.DiscriminateReadResourceResponse"/> before binding to this record.
  /// </summary>
  public string ResultType { get; init; } = ResultTypes.Complete;

  /// <summary>The cache time-to-live hint in milliseconds (§13); REQUIRED on emit, tolerated absent on receipt.</summary>
  public long? TtlMs { get; init; }

  /// <summary>The cache sharing scope (§13); REQUIRED on emit, tolerated absent on receipt.</summary>
  public CacheScope? CacheScope { get; init; }

  /// <summary>
  /// Asserts the §17.5/§13 emit invariant — <see cref="ResultType"/> is <c>"complete"</c> and both
  /// caching hints are present and well-formed — returning this same instance. Apply before sending.
  /// </summary>
  /// <returns>This instance.</returns>
  /// <exception cref="ArgumentException">When the discriminator or a caching hint is malformed.</exception>
  public ReadResourceResult Validated()
  {
    Caching.ValidateCacheableComplete(ResultType, TtlMs, CacheScope, nameof(ReadResourceResult));
    return this;
  }
}

/// <summary>Parameters of the <c>notifications/resources/updated</c> notification (spec §17.7).</summary>
public sealed record ResourceUpdatedNotificationParams
{
  /// <summary>REQUIRED. The URI of the resource that changed (MAY be a sub-resource of the subscribed URI).</summary>
  public required string Uri { get; init; }
}

/// <summary>
/// The discriminated outcome of inspecting a <c>resources/read</c> reply (spec §17.5): a completed
/// <see cref="ReadResourceResult"/>, an <c>input_required</c> continuation, or a malformed body.
/// </summary>
public enum ReadResourceResponseKind
{
  /// <summary>A completed read carrying <c>contents</c> (the absent-⇒-complete default applies, R-17.5-q).</summary>
  Complete,

  /// <summary>The server needs additional client input before the read can complete (R-17.5-w).</summary>
  InputRequired,

  /// <summary>The reply did not match either expected shape.</summary>
  Error,
}

/// <summary>
/// The result of <see cref="Resources.DiscriminateReadResourceResponse"/>: which branch a
/// <c>resources/read</c> reply fell into, plus the parsed payload for the matched branch (spec §17.5).
/// </summary>
/// <param name="Kind">Which branch the reply matched.</param>
/// <param name="Result">The completed read result when <see cref="Kind"/> is <see cref="ReadResourceResponseKind.Complete"/>.</param>
/// <param name="InputRequired">The continuation when <see cref="Kind"/> is <see cref="ReadResourceResponseKind.InputRequired"/>.</param>
/// <param name="Reason">A human-readable reason when <see cref="Kind"/> is <see cref="ReadResourceResponseKind.Error"/>.</param>
public sealed record ReadResourceResponseDiscrimination(
  ReadResourceResponseKind Kind,
  ReadResourceResult? Result,
  InputRequiredResult? InputRequired,
  string? Reason);

/// <summary>
/// The §17.4–§17.6 normative resource helpers ported from the TypeScript SDK's <c>resources.ts</c> /
/// <c>resources-read.ts</c>: RFC 3986 / RFC 6570 validation (delegating the grammar to
/// <see cref="UriTemplate"/>), the not-found error model (modern <c>-32602</c> plus legacy
/// <c>-32002</c> client acceptance), the empty-<c>contents</c> guard, and the read-reply
/// discrimination that tolerates an absent <c>resultType</c> and recognises the <c>input_required</c>
/// continuation.
/// </summary>
public static class Resources
{
  /// <summary>The modern resource-not-found code: <c>-32602</c> (Invalid params), carrying <c>data.uri</c> (§17.6, R-17.6-a/b).</summary>
  public const int ResourceNotFoundCode = ErrorCodes.InvalidParams;

  /// <summary>
  /// The LEGACY resource-not-found code, <c>-32002</c>. An earlier protocol revision used this for the
  /// not-found condition; for interoperability a client SHOULD treat it as resource-not-found in
  /// ADDITION to <c>-32602</c>. A modern server MUST NOT mint it. (§17.6, R-17.6-c)
  /// </summary>
  public const int LegacyResourceNotFoundCode = ErrorRegistry.ResourceNotFoundLegacyCode;

  /// <summary>
  /// The code a server SHOULD return for an internal failure UNRELATED to the validity of the
  /// requested <c>uri</c> (e.g. a backing store is unreachable): <c>-32603</c> (Internal error).
  /// (§17.6, R-17.6-d)
  /// </summary>
  public const int ResourceReadInternalErrorCode = ErrorCodes.InternalError;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a string in URI format [RFC 3986] usable as a
  /// concrete <c>Resource.uri</c>. Delegates to <see cref="UriTemplate.IsResourceUri"/>. (§17.4, R-17.4-a, R-17.4-b)
  /// </summary>
  /// <param name="value">The candidate URI string.</param>
  /// <returns><c>true</c> when the value is an absolute RFC 3986 URI with a scheme.</returns>
  public static bool IsResourceUri(string? value) => UriTemplate.IsResourceUri(value);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> conforms to the URI Template grammar of
  /// [RFC 6570]. Delegates to <see cref="UriTemplate.IsUriTemplate"/>. (§17.4, R-17.4-m)
  /// </summary>
  /// <param name="value">The candidate URI-template string.</param>
  /// <returns><c>true</c> when the value is a well-formed RFC 6570 template.</returns>
  public static bool IsUriTemplate(string? value) => UriTemplate.IsUriTemplate(value);

  /// <summary>
  /// Returns the variable names referenced by a URI template, in first-seen order. Delegates to
  /// <see cref="UriTemplate.Variables"/>. (§17.4, R-17.4-n)
  /// </summary>
  /// <param name="template">The URI template to inspect.</param>
  /// <returns>The distinct variable names.</returns>
  public static IReadOnlyList<string> UriTemplateVariables(string template) => UriTemplate.Variables(template);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="code"/> denotes resource-not-found from a CLIENT's
  /// perspective — the modern <c>-32602</c> or the legacy <c>-32002</c>. A client SHOULD accept both.
  /// (§17.6, R-17.6-a, R-17.6-c)
  /// </summary>
  /// <param name="code">The error code to test.</param>
  /// <returns><c>true</c> when the code means resource-not-found.</returns>
  public static bool IsResourceNotFoundCode(int code) =>
    code == ResourceNotFoundCode || code == LegacyResourceNotFoundCode;

  /// <summary>
  /// Builds the modern resource-not-found error: <c>-32602</c> (Invalid params) carrying the offending
  /// <c>uri</c> in <c>data.uri</c>. A server MUST signal non-existence with this error — NOT an empty
  /// <c>contents</c> result. (§17.5, §17.6, R-17.5-z, R-17.6-a, R-17.6-b)
  /// </summary>
  /// <param name="uri">The offending resource URI.</param>
  /// <param name="message">An optional override; defaults to <c>"Resource not found"</c>.</param>
  /// <returns>The constructed error.</returns>
  public static McpError BuildResourceNotFoundError(string uri, string message = "Resource not found") =>
    McpError.InvalidParams(message, new JsonObject { ["uri"] = uri });

  /// <summary>
  /// Builds the <c>-32603</c> (Internal error) a server SHOULD return for a failure UNRELATED to the
  /// validity of the requested <c>uri</c> — distinct from <see cref="BuildResourceNotFoundError"/>,
  /// which is for a <c>uri</c> that simply does not exist. (§17.6, R-17.6-d)
  /// </summary>
  /// <param name="message">An optional override; defaults to <c>"Internal error reading resource"</c>.</param>
  /// <returns>The constructed error.</returns>
  public static McpError BuildResourceReadInternalError(string message = "Internal error reading resource") =>
    McpError.InternalError(message);

  /// <summary>
  /// Asserts a <c>resources/read</c> result's <c>contents</c> array is non-empty, throwing
  /// <c>-32603</c> (Internal error) otherwise. A server MUST NOT use an empty <c>contents</c> array to
  /// signal non-existence — that case is the <c>-32602</c> not-found error
  /// (<see cref="BuildResourceNotFoundError"/>). When a handler returns empty contents for a URI it
  /// claims to serve, that is a server-side fault, hence the internal-error code. (§17.5, R-17.5-z,
  /// R-17.5-aa)
  /// </summary>
  /// <param name="result">The read result to guard.</param>
  /// <param name="uri">The requested URI, used in the error message.</param>
  /// <exception cref="McpError">A <c>-32603</c> error when <c>contents</c> is empty.</exception>
  public static void GuardNonEmptyContents(ReadResourceResult result, string uri)
  {
    ArgumentNullException.ThrowIfNull(result);
    if (result.Contents.Count == 0)
    {
      throw BuildResourceReadInternalError(
        $"resources/read for \"{uri}\" returned empty contents; signal non-existence with a -32602 error, not an empty array (R-17.5-z)");
    }
  }

  /// <summary>
  /// Branches a <c>resources/read</c> reply on its <c>resultType</c> discriminator (§17.5):
  /// <c>"input_required"</c> ⇒ a continuation (R-17.5-w); <c>"complete"</c> or an ABSENT
  /// <c>resultType</c> ⇒ a completed <see cref="ReadResourceResult"/> (the absent-⇒-complete default,
  /// R-17.5-q); any other value or a body that fails its shape ⇒ an error branch.
  /// </summary>
  /// <param name="response">The raw <c>result</c> object received on the wire.</param>
  /// <returns>The discriminated outcome.</returns>
  public static ReadResourceResponseDiscrimination DiscriminateReadResourceResponse(JsonNode? response)
  {
    if (response is not JsonObject obj)
    {
      return new ReadResourceResponseDiscrimination(
        ReadResourceResponseKind.Error, null, null, "read result is not a JSON object");
    }

    var resultType = obj["resultType"] is JsonValue rt && rt.GetValueKind() == JsonValueKind.String
      ? rt.GetValue<string>()
      : ResultTypes.Complete; // absent ⇒ complete (R-17.5-q)

    if (resultType == ResultTypes.InputRequired)
    {
      var inputRequired = obj.Deserialize<InputRequiredResult>(McpJson.Options);
      return inputRequired is null
        ? new ReadResourceResponseDiscrimination(
            ReadResourceResponseKind.Error, null, null, "malformed input_required read result")
        : new ReadResourceResponseDiscrimination(
            ReadResourceResponseKind.InputRequired, null, inputRequired, null);
    }

    if (resultType != ResultTypes.Complete)
    {
      return new ReadResourceResponseDiscrimination(
        ReadResourceResponseKind.Error, null, null, $"unrecognized resultType \"{resultType}\"");
    }

    try
    {
      var result = obj.Deserialize<ReadResourceResult>(McpJson.Options);
      return result is null || result.Contents is null
        ? new ReadResourceResponseDiscrimination(
            ReadResourceResponseKind.Error, null, null, "malformed ReadResourceResult (missing contents)")
        : new ReadResourceResponseDiscrimination(ReadResourceResponseKind.Complete, result, null, null);
    }
    catch (JsonException ex)
    {
      return new ReadResourceResponseDiscrimination(
        ReadResourceResponseKind.Error, null, null, $"malformed ReadResourceResult: {ex.Message}");
    }
  }
}
