using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

// Deliberately reads the Deprecated io.modelcontextprotocol/logLevel _meta opt-in (§4.3, §15.3)
// for backward compatibility, so it references the [Obsolete] MetaKeys.LogLevel constant.
#pragma warning disable CS0618

/// <summary>
/// The protocol-defined per-request <c>_meta</c> envelope (spec §4.3) that makes every client
/// request self-describing: the protocol revision, the client identity, and the client's
/// per-request capabilities, plus optional passthrough keys (progress token, trace context,
/// third-party metadata). This is what enables the stateless model of §4.4.
/// </summary>
public sealed partial record RequestMeta
{
  /// <summary>REQUIRED. The protocol revision this request declares (§5.2).</summary>
  public required string ProtocolVersion { get; init; }

  /// <summary>REQUIRED. The client software identity (§4.3).</summary>
  public required Implementation ClientInfo { get; init; }

  /// <summary>REQUIRED. The client's capabilities for this request (§4.3); empty means none.</summary>
  public required ClientCapabilities ClientCapabilities { get; init; }

  /// <summary>OPTIONAL, Deprecated. The minimum log severity the server may emit for this request (§4.3/§15.3).</summary>
  public string? LogLevel { get; init; }

  /// <summary>
  /// Any additional <c>_meta</c> keys beyond the protocol-defined ones — for example
  /// <c>progressToken</c>, <c>traceparent</c>/<c>tracestate</c>/<c>baggage</c>, or third-party
  /// keys. Carried through unchanged so receivers can echo or act on them (§4.2).
  /// </summary>
  public JsonObject? Additional { get; init; }

  /// <summary>Builds the wire <c>_meta</c> object carrying the protocol-defined keys plus any <see cref="Additional"/>.</summary>
  /// <returns>A fresh <see cref="JsonObject"/> suitable for placing on request <c>params._meta</c>.</returns>
  public JsonObject ToJsonObject()
  {
    var meta = new JsonObject();
    if (Additional is not null)
    {
      foreach (var (key, value) in Additional)
      {
        meta[key] = value?.DeepClone();
      }
    }
    meta[MetaKeys.ProtocolVersion] = ProtocolVersion;
    meta[MetaKeys.ClientInfo] = JsonSerializer.SerializeToNode(ClientInfo, McpJson.Options);
    meta[MetaKeys.ClientCapabilities] = JsonSerializer.SerializeToNode(ClientCapabilities, McpJson.Options);
    if (LogLevel is not null) meta[MetaKeys.LogLevel] = LogLevel;
    return meta;
  }

  /// <summary>
  /// Parses and validates the per-request <c>_meta</c> envelope from request <c>params</c>
  /// (server side). A request that omits any REQUIRED key is malformed and is rejected with
  /// <c>-32602</c> (Invalid params) per §4.3.
  /// </summary>
  /// <param name="paramsObject">The request's <c>params</c> object (may be <c>null</c>).</param>
  /// <returns>The parsed envelope.</returns>
  /// <exception cref="McpError">-32602 when <c>_meta</c> or any required key is missing or malformed.</exception>
  public static RequestMeta Parse(JsonObject? paramsObject)
  {
    if (paramsObject is null || paramsObject["_meta"] is not JsonObject meta)
    {
      throw McpError.InvalidParams("Request params must carry a \"_meta\" object with the required per-request keys (§4.3).");
    }

    var protocolVersion = RequireString(meta, MetaKeys.ProtocolVersion);
    // The value MUST be a revision identifier, i.e. a well-formed YYYY-MM-DD string (§5.1, R-5.2-b).
    // A malformed-but-string version (for example "latest" or "2026/07/28") is rejected here at the
    // request gate with -32602 (Invalid params) — distinct from a well-formed-but-unsupported revision,
    // which the discovery/negotiation layer answers with -32004 (UnsupportedProtocolVersion).
    if (!IsValidRevisionFormat(protocolVersion))
    {
      throw McpError.InvalidParams(
        $"Required request metadata key \"{MetaKeys.ProtocolVersion}\" value \"{protocolVersion}\" " +
        "is not a valid YYYY-MM-DD revision identifier (§5.1, R-5.2-b).");
    }

    var clientInfo = RequireObject<Implementation>(meta, MetaKeys.ClientInfo);
    var clientCapabilities = RequireObject<ClientCapabilities>(meta, MetaKeys.ClientCapabilities);

    string? logLevel = null;
    if (meta[MetaKeys.LogLevel] is JsonValue logValue && logValue.GetValueKind() == JsonValueKind.String)
    {
      logLevel = logValue.GetValue<string>();
    }

    // Preserve every other key (progressToken, trace context, third-party) verbatim.
    var additional = new JsonObject();
    foreach (var (key, value) in meta)
    {
      if (key is MetaKeys.ProtocolVersion or MetaKeys.ClientInfo or MetaKeys.ClientCapabilities or MetaKeys.LogLevel)
      {
        continue;
      }
      additional[key] = value?.DeepClone();
    }

    return new RequestMeta
    {
      ProtocolVersion = protocolVersion,
      ClientInfo = clientInfo,
      ClientCapabilities = clientCapabilities,
      LogLevel = logLevel,
      Additional = additional.Count > 0 ? additional : null,
    };
  }

  private static string RequireString(JsonObject meta, string key)
  {
    if (meta[key] is JsonValue value && value.GetValueKind() == JsonValueKind.String)
    {
      return value.GetValue<string>();
    }
    throw McpError.InvalidParams($"Required request metadata key \"{key}\" is missing or not a string (§4.3).");
  }

  private static T RequireObject<T>(JsonObject meta, string key)
  {
    if (meta[key] is not JsonObject node)
    {
      throw McpError.InvalidParams($"Required request metadata key \"{key}\" is missing or not an object (§4.3).");
    }
    try
    {
      return node.Deserialize<T>(McpJson.Options)
        ?? throw McpError.InvalidParams($"Request metadata key \"{key}\" could not be read (§4.3).");
    }
    catch (JsonException error)
    {
      throw McpError.InvalidParams($"Request metadata key \"{key}\" is malformed: {error.Message}");
    }
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="revision"/> matches the <c>YYYY-MM-DD</c> revision-format
  /// (§5.1, R-5.2-b). Mirrors the TypeScript <c>isValidRevisionFormat</c> / <c>PROTOCOL_REVISION_FORMAT_RE</c>.
  /// </summary>
  /// <remarks>
  /// A <c>true</c> result is a shape check only — it does NOT mean the revision is supported (use
  /// <see cref="ProtocolRevision.IsSupported"/> for that). The regex validates only the digit/separator
  /// layout, not calendar correctness, honoring the rule that revision identifiers are opaque,
  /// exactly-matched strings never compared lexically, chronologically, or by range (R-5.1-a, R-5.1-b).
  /// </remarks>
  /// <param name="revision">The candidate revision identifier.</param>
  /// <returns><c>true</c> when the value is a well-formed <c>YYYY-MM-DD</c> string.</returns>
  public static bool IsValidRevisionFormat(string revision)
  {
    ArgumentNullException.ThrowIfNull(revision);
    return RevisionFormatRegex().IsMatch(revision);
  }

  /// <summary>The anchored <c>YYYY-MM-DD</c> revision-format regex (§5.1), equivalent to TS <c>/^\d{4}-\d{2}-\d{2}$/</c>.</summary>
  [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
  private static partial Regex RevisionFormatRegex();
}

/// <summary>
/// Severity-ordering helpers for the (existing) <see cref="LoggingLevel"/> enum (spec §4.3, R-4.3-m).
/// The C# counterpart of the TypeScript <c>loggingLevelIndex</c> / <c>isAtOrAboveLogLevel</c> functions
/// and the <c>LOGGING_LEVELS</c> ascending-severity ordering.
/// </summary>
/// <remarks>
/// <see cref="LoggingLevel"/> is defined alongside the deprecated logging-message feature; its members
/// are declared least-severe-first, so the enum's underlying integer value is its ascending-severity
/// index. The deprecated <c>io.modelcontextprotocol/logLevel</c> <c>_meta</c> key opts a request in at a
/// minimum severity: when present, a server SHOULD emit only log notifications at or above it; when
/// absent, it MUST NOT emit log notifications for the request (R-4.3-l, R-4.3-m).
/// </remarks>
public static class LoggingLevelExtensions
{
  /// <summary>
  /// Returns the numeric severity index of a <see cref="LoggingLevel"/> (lower = less severe), where
  /// <see cref="LoggingLevel.Debug"/> is <c>0</c> and <see cref="LoggingLevel.Emergency"/> is <c>7</c>.
  /// Mirrors the TypeScript <c>loggingLevelIndex</c>.
  /// </summary>
  /// <param name="level">The level to index.</param>
  /// <returns>The zero-based ascending-severity index.</returns>
  public static int Index(this LoggingLevel level) => (int)level;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="candidate"/>'s severity is at or above
  /// <paramref name="minimum"/> — implementing the server-side log-filtering rule R-4.3-m. Mirrors the
  /// TypeScript <c>isAtOrAboveLogLevel</c>.
  /// </summary>
  /// <param name="candidate">The severity of the message being considered.</param>
  /// <param name="minimum">The minimum severity requested for the originating request.</param>
  /// <returns><c>true</c> when <paramref name="candidate"/> is at least as severe as <paramref name="minimum"/>.</returns>
  public static bool IsAtOrAbove(this LoggingLevel candidate, LoggingLevel minimum) =>
    candidate.Index() >= minimum.Index();
}
