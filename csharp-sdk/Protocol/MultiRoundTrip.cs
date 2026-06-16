using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The values of the base result discriminator <c>resultType</c> (spec §3.6, §11.2). The set is
/// open, but two values are defined by the core protocol; extensions (for example Tasks) mint more.
/// </summary>
public static class ResultTypes
{
  /// <summary>The request completed and the result carries the final content (§3.6).</summary>
  public const string Complete = "complete";

  /// <summary>The request needs further client input before it can complete (§11).</summary>
  public const string InputRequired = "input_required";

  /// <summary>The Tasks-extension augmented result: a task handle was returned in place of a result (§25.3).</summary>
  public const string Task = "task";
}

/// <summary>
/// A single input request a server embeds in an <see cref="InputRequiredResult"/> for the client to
/// fulfill (spec §11.2). The kind is discriminated by <see cref="Method"/>:
/// <c>elicitation/create</c> (§20), <c>sampling/createMessage</c> (§21), or <c>roots/list</c> (§21).
/// The runtime dispatches on the method name, so <see cref="Params"/> is kept as raw JSON.
/// </summary>
public sealed record InputRequest
{
  /// <summary>REQUIRED. The input-request kind: one of the three method names above.</summary>
  public required string Method { get; init; }

  /// <summary>OPTIONAL. The kind-specific parameters (an <c>ElicitRequestParams</c>, etc.).</summary>
  public JsonObject? Params { get; init; }
}

/// <summary>
/// The <c>input_required</c> result a server returns to solicit client input while processing a
/// request (spec §11.2). At least one of <see cref="InputRequests"/> or <see cref="RequestState"/>
/// MUST be present; a result with only <see cref="RequestState"/> is the load-shedding (retry-later)
/// signal (§11.5). The base <c>resultType</c> is supplied by the runtime as <c>input_required</c>.
/// </summary>
public sealed record InputRequiredResult
{
  /// <summary>OPTIONAL. A non-empty map from server-chosen key to the input request to fulfill.</summary>
  public IDictionary<string, InputRequest>? InputRequests { get; init; }

  /// <summary>OPTIONAL (in practice required for continuation). The opaque server continuation token, echoed verbatim on retry (§11.3).</summary>
  public string? RequestState { get; init; }
}

/// <summary>
/// Pure, side-effect-free helpers for the multi-round-trip mechanism (spec §11): the recognized
/// input-request kinds and their required client capabilities (§11.2), duplicate-<c>inputRequests</c>-key
/// detection and strict parsing (§11.2, R-11.2-f), the opaque <c>requestState</c> continuation-token
/// codec (§11.3 — attacker-controlled, validated on decode), input-response key/kind correlation
/// (§11.4), the client-facing result-type discrimination (§11.5), and the load-shedding / loop-guard /
/// backoff / re-request helpers (§11.5). The C# counterpart of the exported functions in the
/// TypeScript <c>protocol/multi-round-trip.ts</c> (S17).
/// </summary>
public static class MultiRoundTrip
{
  // ─── §11.2 — Recognized input-request kinds & capability map ─────────────────

  /// <summary>The three recognized <c>InputRequest.method</c> values (§11.2, R-11.2-k).</summary>
  public static readonly IReadOnlySet<string> RecognizedInputRequestMethods =
    new HashSet<string>(StringComparer.Ordinal)
    {
      McpMethods.ElicitationCreate,
      McpMethods.RootsList,
      McpMethods.SamplingCreateMessage,
    };

  /// <summary>Returns <c>true</c> when <paramref name="method"/> is one of the three recognized input-request kinds (R-11.2-k).</summary>
  /// <param name="method">The input-request method name.</param>
  /// <returns><c>true</c> when recognized.</returns>
  public static bool IsRecognizedInputRequestMethod(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return RecognizedInputRequestMethods.Contains(method);
  }

  /// <summary>The two input-request kinds that are Deprecated client-provided capabilities (§11.2, §27.3).</summary>
  public static readonly IReadOnlySet<string> DeprecatedInputRequestMethods =
    new HashSet<string>(StringComparer.Ordinal) { McpMethods.RootsList, McpMethods.SamplingCreateMessage };

  /// <summary>
  /// Returns <c>true</c> when <paramref name="method"/> is a Deprecated input-request kind (§11.2,
  /// R-11.2-i). Servers SHOULD prefer non-deprecated alternatives (e.g. <c>elicitation/create</c>).
  /// </summary>
  /// <param name="method">The input-request method name.</param>
  /// <returns><c>true</c> when deprecated.</returns>
  public static bool IsDeprecatedInputRequestKind(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return DeprecatedInputRequestMethods.Contains(method);
  }

  /// <summary>Maps each recognized input-request kind to the client capability it requires (§11.2, §6).</summary>
  private static readonly IReadOnlyDictionary<string, string> InputRequestKindCapability =
    new Dictionary<string, string>(StringComparer.Ordinal)
    {
      [McpMethods.ElicitationCreate] = "elicitation",
      [McpMethods.RootsList] = "roots",
      [McpMethods.SamplingCreateMessage] = "sampling",
    };

  /// <summary>
  /// Returns the client-capability name an input-request <paramref name="method"/> requires, or
  /// <c>null</c> for an unrecognized method (§11.2, R-11.2-j).
  /// </summary>
  /// <param name="method">The input-request method name.</param>
  /// <returns>The required capability name, or <c>null</c>.</returns>
  public static string? RequiredClientCapabilityForInputRequest(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return InputRequestKindCapability.TryGetValue(method, out var capability) ? capability : null;
  }

  /// <summary>Presence-means-supported capability check (§6.1): the key is declared with any non-null value.</summary>
  private static bool CapabilityDeclared(JsonObject clientCapabilities, string name) =>
    clientCapabilities.TryGetPropertyValue(name, out var value) && value is not null;

  /// <summary>
  /// Returns <c>true</c> when the client declared support for the capability an input-request
  /// <paramref name="method"/> requires (§11.2, §11.5, R-11.2-j, R-11.5-a). Used both server-side (may a
  /// server emit a kind) and client-side (may a client fulfill it). An unrecognized method is never
  /// supported.
  /// </summary>
  /// <param name="method">The input-request method name.</param>
  /// <param name="clientCapabilities">The client's declared capabilities as a raw object.</param>
  /// <returns><c>true</c> when the required capability is declared.</returns>
  public static bool ClientSupportsInputRequestKind(string method, JsonObject clientCapabilities)
  {
    ArgumentNullException.ThrowIfNull(method);
    ArgumentNullException.ThrowIfNull(clientCapabilities);
    var capability = RequiredClientCapabilityForInputRequest(method);
    return capability is not null && CapabilityDeclared(clientCapabilities, capability);
  }

  /// <summary>
  /// Server-side gate: returns <c>true</c> when the server MAY emit an input-request of
  /// <paramref name="method"/> given the client's declared capabilities (§11.2, §11.5, R-11.2-j,
  /// R-11.5-g). A server MUST NOT emit a kind the client has not declared.
  /// </summary>
  /// <param name="method">The input-request method name.</param>
  /// <param name="clientCapabilities">The client's declared capabilities as a raw object.</param>
  /// <returns><c>true</c> when the server may emit the kind.</returns>
  public static bool MayEmitInputRequestKind(string method, JsonObject clientCapabilities) =>
    ClientSupportsInputRequestKind(method, clientCapabilities);

  // ─── §11.6 — Participating methods ───────────────────────────────────────────

  /// <summary>The three methods that MAY return <c>input_required</c> results (§11.6, R-11.6-a).</summary>
  public static readonly IReadOnlySet<string> ParticipatingMethods =
    new HashSet<string>(StringComparer.Ordinal)
    {
      McpMethods.ToolsCall,
      McpMethods.PromptsGet,
      McpMethods.ResourcesRead,
    };

  /// <summary>Returns <c>true</c> when <paramref name="method"/> is one of the three MRTR-participating methods (R-11.6-a).</summary>
  /// <param name="method">The request method name.</param>
  /// <returns><c>true</c> when participating.</returns>
  public static bool IsMrtrParticipatingMethod(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return ParticipatingMethods.Contains(method);
  }

  // ─── §11.5 — Load-shedding detection ─────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="result"/> is a load-shedding signal: <c>resultType</c> is
  /// <c>input_required</c>, <c>inputRequests</c> is absent or empty, and <c>requestState</c> is present
  /// (§11.5, R-11.5-l). A client MUST NOT treat this as an error; it MAY retry echoing
  /// <c>requestState</c>, applying backoff on repeated non-progress.
  /// </summary>
  /// <param name="result">The raw result object.</param>
  /// <returns><c>true</c> when it is a load-shedding signal.</returns>
  public static bool IsLoadSheddingResult(JsonObject? result)
  {
    if (result is null) return false;
    if (!IsInputRequiredType(result["resultType"])) return false;
    var hasInputRequests = result["inputRequests"] is JsonObject requests && requests.Count > 0;
    return !hasInputRequests && result["requestState"] is JsonValue stateValue
      && stateValue.GetValueKind() == JsonValueKind.String;
  }

  private static bool IsInputRequiredType(JsonNode? node) =>
    node is JsonValue value && value.GetValueKind() == JsonValueKind.String
      && string.Equals(value.GetValue<string>(), ResultTypes.InputRequired, StringComparison.Ordinal);

  // ─── §11.5 — Result-type discrimination ──────────────────────────────────────

  /// <summary>
  /// Branches on the <c>resultType</c> of a received result per the normative client-side rules of §11.5
  /// (R-11.5-c, R-11.5-d, R-11.5-e, R-11.5-f, R-11.5-k):
  /// <list type="bullet">
  /// <item><description><c>"complete"</c> or absent/null <c>resultType</c> → <see cref="ResultDiscriminationAction.Complete"/>.</description></item>
  /// <item><description><c>"input_required"</c> with a valid result → <see cref="ResultDiscriminationAction.InputRequired"/>.</description></item>
  /// <item><description>Any unrecognized <c>resultType</c>, a malformed <c>input_required</c> result, or
  /// (when <paramref name="clientCapabilities"/> is supplied) an UNDECLARED requested input-request kind
  /// → <see cref="ResultDiscriminationAction.Error"/> (R-11.5-d, R-11.5-k).</description></item>
  /// </list>
  /// </summary>
  /// <param name="result">The raw result object received from the wire (<c>null</c> ⇒ error).</param>
  /// <param name="clientCapabilities">
  /// The client's declared capabilities; when supplied, every requested input-request kind is gated
  /// against them and an undeclared kind makes the whole result an error (R-11.5-k). When <c>null</c>,
  /// the discrimination is capability-blind (back-compat).
  /// </param>
  /// <returns>The discrimination outcome.</returns>
  public static ResultDiscrimination DiscriminateResultType(JsonObject? result, JsonObject? clientCapabilities = null)
  {
    if (result is null)
    {
      return ResultDiscrimination.OfError("result is not an object", null);
    }

    var raw = result["resultType"];

    // Absent / null resultType → treat as "complete" (R-11.5-f).
    if (raw is null || raw.GetValueKind() == JsonValueKind.Null)
    {
      return ResultDiscrimination.OfComplete();
    }

    if (raw is not JsonValue rawValue || rawValue.GetValueKind() != JsonValueKind.String)
    {
      return ResultDiscrimination.OfError("`resultType` must be a string", null);
    }

    var resultType = rawValue.GetValue<string>();

    if (string.Equals(resultType, ResultTypes.Complete, StringComparison.Ordinal))
    {
      return ResultDiscrimination.OfComplete();
    }

    if (string.Equals(resultType, ResultTypes.InputRequired, StringComparison.Ordinal))
    {
      // Validate the input_required shape: at least one of inputRequests / requestState (R-11.2-b).
      var inputRequests = result["inputRequests"] as JsonObject;
      var hasRequestState = result["requestState"] is JsonValue rs && rs.GetValueKind() == JsonValueKind.String;
      if (inputRequests is null && !hasRequestState)
      {
        return ResultDiscrimination.OfError(
          "Malformed InputRequiredResult: at least one of `inputRequests` or `requestState` must be present (R-11.2-b)",
          ResultTypes.InputRequired);
      }

      InputRequiredResult parsed;
      try
      {
        parsed = result.Deserialize<InputRequiredResult>(McpJson.Options)
          ?? throw new JsonException("null result");
      }
      catch (JsonException error)
      {
        return ResultDiscrimination.OfError($"Malformed InputRequiredResult: {error.Message}", ResultTypes.InputRequired);
      }

      // R-11.5-a / R-11.5-k: a client MUST verify each input-request kind against its own declared
      // capabilities and MUST treat an undeclared kind as an error rather than fulfilling it.
      if (clientCapabilities is not null && parsed.InputRequests is not null)
      {
        foreach (var (key, request) in parsed.InputRequests)
        {
          if (!ClientSupportsInputRequestKind(request.Method, clientCapabilities))
          {
            return ResultDiscrimination.OfError(
              $"Undeclared input-request kind \"{request.Method}\" under key \"{key}\"; the client did not declare support for it (R-11.5-k)",
              ResultTypes.InputRequired);
          }
        }
      }

      return ResultDiscrimination.OfInputRequired(parsed);
    }

    // Unrecognized resultType — MUST treat as error; MUST NOT read other members (R-11.5-d, R-11.5-e).
    return ResultDiscrimination.OfError(
      $"Unrecognized resultType \"{resultType}\"; MUST NOT read other result members", resultType);
  }

  // ─── §11.4 — inputResponses key validation ───────────────────────────────────

  /// <summary>
  /// Validates that every key in <paramref name="inputResponses"/> was present in
  /// <paramref name="inputRequests"/> (§11.2, §11.4, R-11.2-h, R-11.4-c, R-11.4-d). Reports the offending
  /// keys when any response key is not a known request key.
  /// </summary>
  /// <param name="inputRequests">The keys from the server's <c>InputRequiredResult</c>.</param>
  /// <param name="inputResponses">The keys from the client's retry params.</param>
  /// <returns>Whether all keys are valid, plus the unknown keys.</returns>
  public static (bool Valid, IReadOnlyList<string> UnknownKeys) ValidateInputResponseKeys(
    IReadOnlyDictionary<string, InputRequest> inputRequests,
    IReadOnlyDictionary<string, JsonNode> inputResponses)
  {
    ArgumentNullException.ThrowIfNull(inputRequests);
    ArgumentNullException.ThrowIfNull(inputResponses);
    var unknown = inputResponses.Keys.Where(k => !inputRequests.ContainsKey(k)).ToList();
    return (unknown.Count == 0, unknown);
  }

  // ─── §11.4 — Kind-correlation of inputResponses ──────────────────────────────

  /// <summary>
  /// Validates that each value in <paramref name="inputResponses"/> conforms to the expected response
  /// shape for the <c>InputRequest</c> kind sent under the same key (§11.4, R-11.4-e, R-11.4-f):
  /// <c>elicitation/create</c> → an <c>action</c>; <c>roots/list</c> → a <c>roots</c> array;
  /// <c>sampling/createMessage</c> → <c>role</c>, <c>content</c>, and <c>model</c>. Keys with no matching
  /// request are skipped (caught by <see cref="ValidateInputResponseKeys"/>); unrecognized request kinds
  /// are skipped. A mismatch lets a server reject the retry with a JSON-RPC error (R-11.5-s).
  /// </summary>
  /// <param name="inputRequests">The server's <c>inputRequests</c> map.</param>
  /// <param name="inputResponses">The client's <c>inputResponses</c> map.</param>
  /// <returns>Whether all responses match their kinds, plus per-key errors when not.</returns>
  public static InputResponseKindValidation ValidateInputResponseKinds(
    IReadOnlyDictionary<string, InputRequest> inputRequests,
    IReadOnlyDictionary<string, JsonNode> inputResponses)
  {
    ArgumentNullException.ThrowIfNull(inputRequests);
    ArgumentNullException.ThrowIfNull(inputResponses);

    var errors = new List<InputResponseKindError>();
    foreach (var (key, response) in inputResponses)
    {
      if (!inputRequests.TryGetValue(key, out var request)) continue; // key mismatch — caught elsewhere
      if (!IsRecognizedInputRequestMethod(request.Method)) continue; // unrecognized — caught elsewhere

      var detail = ValidateResponseShape(request.Method, response as JsonObject);
      if (detail is not null)
      {
        errors.Add(new InputResponseKindError(key, request.Method, detail));
      }
    }

    return errors.Count == 0 ? InputResponseKindValidation.Ok : InputResponseKindValidation.Invalid(errors);
  }

  /// <summary>Returns an error detail when <paramref name="response"/> does not match the shape required by <paramref name="method"/>, else <c>null</c>.</summary>
  private static string? ValidateResponseShape(string method, JsonObject? response)
  {
    if (response is null) return "response is not an object";
    return method switch
    {
      McpMethods.ElicitationCreate =>
        response["action"] is JsonValue action && action.GetValueKind() == JsonValueKind.String
          ? null
          : "action: required string is missing",
      McpMethods.RootsList =>
        response["roots"] is JsonArray ? null : "roots: required array is missing",
      McpMethods.SamplingCreateMessage =>
        response["role"] is JsonValue role && role.GetValueKind() == JsonValueKind.String
        && response["content"] is not null
        && response["model"] is JsonValue model && model.GetValueKind() == JsonValueKind.String
          ? null
          : "role/content/model: one or more required fields are missing",
      _ => null,
    };
  }

  /// <summary>
  /// Validates the server-side retry params and returns a <c>-32602</c> error payload when
  /// <paramref name="inputResponses"/> are malformed at the protocol level (§11.5, R-11.5-s). A server
  /// MUST return this error (not another <c>InputRequiredResult</c>) for a kind-mismatched retry.
  /// </summary>
  /// <param name="inputRequests">The server's original <c>inputRequests</c> map.</param>
  /// <param name="inputResponses">The client's retry <c>inputResponses</c>.</param>
  /// <returns><c>null</c> when valid; otherwise the protocol error to return.</returns>
  public static McpError? ValidateRetryParams(
    IReadOnlyDictionary<string, InputRequest> inputRequests,
    IReadOnlyDictionary<string, JsonNode> inputResponses)
  {
    var validation = ValidateInputResponseKinds(inputRequests, inputResponses);
    if (validation.Valid) return null;
    var detail = string.Join("; ", validation.Errors.Select(e => $"key \"{e.Key}\" (expected {e.ExpectedMethod} response): {e.Detail}"));
    return McpError.InvalidParams($"Malformed retry params: {detail}");
  }

  // ─── §11.5 — Re-request still-missing input ──────────────────────────────────

  /// <summary>
  /// Returns the <c>inputRequests</c> keys that the retry's <paramref name="inputResponses"/> did not
  /// answer (§11.5, R-11.5-q).
  /// </summary>
  /// <param name="inputRequests">The server's original <c>inputRequests</c> map.</param>
  /// <param name="inputResponses">The client's retry <c>inputResponses</c>.</param>
  /// <returns>The still-missing keys.</returns>
  public static IReadOnlyList<string> ComputeMissingInputResponseKeys(
    IReadOnlyDictionary<string, InputRequest> inputRequests,
    IReadOnlyDictionary<string, JsonNode> inputResponses)
  {
    ArgumentNullException.ThrowIfNull(inputRequests);
    ArgumentNullException.ThrowIfNull(inputResponses);
    return inputRequests.Keys.Where(k => !inputResponses.ContainsKey(k)).ToList();
  }

  /// <summary>
  /// Builds a NEW <see cref="InputRequiredResult"/> re-requesting only the still-missing input, or
  /// <c>null</c> when the retry supplied everything (§11.5, R-11.5-q). A server whose retry
  /// <c>inputResponses</c> is well-formed but incomplete SHOULD re-request the missing information rather
  /// than failing the request.
  /// </summary>
  /// <param name="inputRequests">The server's original <c>inputRequests</c> map.</param>
  /// <param name="inputResponses">The client's retry <c>inputResponses</c>.</param>
  /// <param name="requestState">An optional continuation token to echo on the new result.</param>
  /// <returns>The re-request result, or <c>null</c> when nothing is missing.</returns>
  public static InputRequiredResult? BuildReRequestInputRequiredResult(
    IReadOnlyDictionary<string, InputRequest> inputRequests,
    IReadOnlyDictionary<string, JsonNode> inputResponses,
    string? requestState = null)
  {
    var missing = ComputeMissingInputResponseKeys(inputRequests, inputResponses);
    if (missing.Count == 0) return null;
    var reRequested = new Dictionary<string, InputRequest>(StringComparer.Ordinal);
    foreach (var key in missing)
    {
      reRequested[key] = inputRequests[key];
    }
    return new InputRequiredResult { InputRequests = reRequested, RequestState = requestState };
  }

  // ─── §11.5 — Loop guard & backoff ────────────────────────────────────────────

  /// <summary>
  /// Computes an exponential-backoff delay (ms) for the <paramref name="attempt"/>-th retry on repeated
  /// non-progress (§11.5, R-11.5-n). A client retrying without progress SHOULD apply a reasonable
  /// backoff.
  /// </summary>
  /// <param name="attempt">The 1-based retry attempt number (≤ 0 ⇒ 0 ms).</param>
  /// <param name="baseMs">The base delay (default 250).</param>
  /// <param name="maxMs">The cap (default 30000).</param>
  /// <returns>The backoff delay in milliseconds.</returns>
  public static long ComputeRetryBackoffMs(int attempt, long baseMs = 250, long maxMs = 30_000)
  {
    if (attempt <= 0) return 0;
    // baseMs * 2^(attempt-1), capped at maxMs. Guard against overflow on large attempts.
    var shift = attempt - 1;
    if (shift >= 62) return maxMs;
    var scaled = baseMs * (1L << shift);
    return scaled < 0 || scaled > maxMs ? maxMs : scaled;
  }

  // ─── §11.3 — requestState opaque continuation-token codec ────────────────────

  /// <summary>
  /// The opaque <c>requestState</c> continuation token (§11.3): the server-minted, base64url-encoded JSON
  /// payload a client echoes verbatim on retry. It is ATTACKER-CONTROLLED — the client never parses or
  /// modifies it (R-11.3-a, R-11.3-b, R-11.3-f), and the server MUST validate it on decode and MUST NOT
  /// trust its contents (R-11.3-h, R-11.3-i). This codec captures the accumulated round count so a
  /// stateless server can resume where it left off; a real server may additionally sign/encrypt the
  /// payload (R-11.3-g), which is out of scope for the reference codec.
  /// </summary>
  public static class RequestStateCodec
  {
    /// <summary>The current version tag of the encoded payload; an unrecognized version fails the decode.</summary>
    private const int Version = 1;

    /// <summary>
    /// Encodes a continuation token capturing <paramref name="round"/> (§11.3). The result is an opaque
    /// base64url string the client echoes verbatim on retry.
    /// </summary>
    /// <param name="round">The number of input rounds completed so far (non-negative).</param>
    /// <returns>The opaque token.</returns>
    public static string Encode(int round)
    {
      var payload = new JsonObject { ["v"] = Version, ["round"] = Math.Max(0, round) };
      var bytes = System.Text.Encoding.UTF8.GetBytes(payload.ToJsonString(McpJson.Options));
      return ToBase64Url(bytes);
    }

    /// <summary>
    /// Decodes a client-supplied <paramref name="token"/> into its continuation state, VALIDATING it as
    /// untrusted input (§11.3, R-11.3-h, R-11.3-i): a malformed, mis-versioned, or out-of-range token is
    /// rejected with <c>false</c> rather than trusted. Never throws on bad input.
    /// </summary>
    /// <param name="token">The opaque token echoed by the client.</param>
    /// <param name="round">The decoded round count when <c>true</c>.</param>
    /// <returns><c>true</c> when the token is well-formed and trustworthy.</returns>
    public static bool TryDecode(string? token, out int round)
    {
      round = 0;
      if (string.IsNullOrEmpty(token)) return false;
      byte[] bytes;
      try
      {
        bytes = FromBase64Url(token);
      }
      catch
      {
        return false; // not valid base64url — attacker-controlled, reject quietly
      }

      JsonObject? payload;
      try
      {
        payload = JsonNode.Parse(System.Text.Encoding.UTF8.GetString(bytes)) as JsonObject;
      }
      catch
      {
        return false; // not valid JSON — reject
      }
      if (payload is null) return false;

      // Validate the version and range; never trust the decoded values blindly (R-11.3-i).
      if (payload["v"] is not JsonValue versionValue || !versionValue.TryGetValue(out int version) || version != Version)
      {
        return false;
      }
      if (payload["round"] is not JsonValue roundValue || !roundValue.TryGetValue(out int decoded) || decoded < 0)
      {
        return false;
      }
      round = decoded;
      return true;
    }

    private static string ToBase64Url(byte[] bytes) =>
      Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
      var padded = value.Replace('-', '+').Replace('_', '/');
      switch (padded.Length % 4)
      {
        case 2: padded += "=="; break;
        case 3: padded += "="; break;
        case 1: throw new FormatException("Invalid base64url length.");
      }
      return Convert.FromBase64String(padded);
    }
  }

  // ─── §11.2 — Duplicate-key detection & strict parsing ────────────────────────

  /// <summary>
  /// Scans raw JSON text for a duplicate object member name. <see cref="JsonNode.Parse(string,System.Text.Json.Nodes.JsonNodeOptions?,System.Text.Json.JsonDocumentOptions)"/>
  /// silently collapses duplicate keys (last-wins), so duplicate detection MUST work on the raw token
  /// stream — this tracks the member names seen within each object scope and reports the first repeat
  /// (§11.2, R-11.2-f).
  /// </summary>
  /// <param name="text">The raw JSON text.</param>
  /// <returns><c>true</c> when any object scope repeats a member name.</returns>
  public static bool JsonHasDuplicateKeys(string text)
  {
    ArgumentNullException.ThrowIfNull(text);
    var i = 0;
    var n = text.Length;
    var stack = new Stack<(bool Object, HashSet<string> Keys)>();
    var expectKey = false;

    string ReadString()
    {
      i++; // consume opening quote
      var sb = new System.Text.StringBuilder();
      while (i < n)
      {
        var c = text[i++];
        if (c == '\\')
        {
          if (i >= n) break;
          var esc = text[i++];
          if (esc == 'u')
          {
            sb.Append(text.AsSpan(i, Math.Min(4, n - i)));
            i += 4;
          }
          else
          {
            sb.Append('\\').Append(esc);
          }
        }
        else if (c == '"')
        {
          break;
        }
        else
        {
          sb.Append(c);
        }
      }
      return sb.ToString();
    }

    while (i < n)
    {
      var c = text[i];
      switch (c)
      {
        case ' ' or '\t' or '\n' or '\r':
          i++;
          break;
        case '{':
          stack.Push((true, new HashSet<string>(StringComparer.Ordinal)));
          expectKey = true;
          i++;
          break;
        case '[':
          stack.Push((false, new HashSet<string>(StringComparer.Ordinal)));
          expectKey = false;
          i++;
          break;
        case '}' or ']':
          if (stack.Count > 0) stack.Pop();
          expectKey = false;
          i++;
          break;
        case ',':
          expectKey = stack.Count > 0 && stack.Peek().Object;
          i++;
          break;
        case ':':
          expectKey = false;
          i++;
          break;
        case '"':
          var str = ReadString();
          if (stack.Count > 0 && stack.Peek().Object && expectKey)
          {
            if (!stack.Peek().Keys.Add(str)) return true;
            expectKey = false;
          }
          break;
        default:
          i++; // primitive token char; advance
          break;
      }
    }

    return false;
  }

  /// <summary>
  /// Parses an <see cref="InputRequiredResult"/> from its raw JSON text, treating a duplicate object
  /// member name as malformed — the §11.2 rule that a receiver encountering duplicate <c>inputRequests</c>
  /// keys MUST treat the result as malformed (R-11.2-f), which is stricter than the base §2.3.1 last-wins
  /// tolerance. Duplicate detection runs on the raw text because the JSON parser would already have
  /// collapsed repeats. Use this instead of a plain parse when the raw wire text is available and
  /// duplicate-key strictness is required (TV-17.10).
  /// </summary>
  /// <param name="rawJson">The raw JSON text of the result object.</param>
  /// <returns>The parsed result, or a <c>-32602</c> error.</returns>
  public static InputRequiredParse ParseInputRequiredResult(string rawJson)
  {
    ArgumentNullException.ThrowIfNull(rawJson);
    if (JsonHasDuplicateKeys(rawJson))
    {
      return InputRequiredParse.OfError(
        McpError.InvalidParams("Malformed InputRequiredResult: duplicate member name in object (R-11.2-f)."));
    }

    JsonObject? parsed;
    try
    {
      parsed = JsonNode.Parse(rawJson) as JsonObject;
    }
    catch (JsonException error)
    {
      return InputRequiredParse.OfError(McpError.InvalidParams($"Malformed InputRequiredResult: {error.Message}"));
    }
    if (parsed is null)
    {
      return InputRequiredParse.OfError(McpError.InvalidParams("Malformed InputRequiredResult: not an object."));
    }

    // At least one of inputRequests / requestState MUST be present (R-11.2-b).
    var hasInputRequests = parsed["inputRequests"] is JsonObject;
    var hasRequestState = parsed["requestState"] is JsonValue rs && rs.GetValueKind() == JsonValueKind.String;
    if (!hasInputRequests && !hasRequestState)
    {
      return InputRequiredParse.OfError(McpError.InvalidParams(
        "Malformed InputRequiredResult: at least one of inputRequests or requestState must be present (R-11.2-b)."));
    }

    InputRequiredResult result;
    try
    {
      result = parsed.Deserialize<InputRequiredResult>(McpJson.Options)
        ?? throw new JsonException("null result");
    }
    catch (JsonException error)
    {
      return InputRequiredParse.OfError(McpError.InvalidParams($"Malformed InputRequiredResult: {error.Message}"));
    }

    return InputRequiredParse.OfOk(result);
  }

  // ─── §11.5 — Capability-gating error builder ─────────────────────────────────

  /// <summary>
  /// Builds the <c>-32003</c> error a server returns when it cannot complete without an input-request
  /// kind the client did not declare (§11.5, R-11.5-i, R-11.5-j). On HTTP the response status MUST be
  /// 400. The <c>data.requiredCapabilities</c> names the unsupported capabilities.
  /// </summary>
  /// <param name="requiredCapabilities">A <c>ClientCapabilities</c>-shaped object naming the unsupported capabilities.</param>
  /// <returns>The protocol error.</returns>
  public static McpError BuildMissingCapabilityError(JsonObject requiredCapabilities)
  {
    ArgumentNullException.ThrowIfNull(requiredCapabilities);
    return McpError.MissingRequiredClientCapability(requiredCapabilities);
  }
}

/// <summary>What a client should do after <see cref="MultiRoundTrip.DiscriminateResultType"/> (spec §11.5).</summary>
public enum ResultDiscriminationAction
{
  /// <summary>The result is final; the client treats it as complete.</summary>
  Complete,

  /// <summary>The result is an <c>input_required</c> result to fulfill.</summary>
  InputRequired,

  /// <summary>The result is an error (unrecognized/non-string <c>resultType</c>, malformed result, or undeclared kind).</summary>
  Error,
}

/// <summary>The outcome of <see cref="MultiRoundTrip.DiscriminateResultType"/> (spec §11.5).</summary>
/// <param name="Action">The action the client should take.</param>
/// <param name="Result">The parsed <c>input_required</c> result, present only when <see cref="Action"/> is <see cref="ResultDiscriminationAction.InputRequired"/>.</param>
/// <param name="Reason">A human-readable reason, present only when <see cref="Action"/> is <see cref="ResultDiscriminationAction.Error"/>.</param>
/// <param name="ResultType">The offending <c>resultType</c> value, when an error.</param>
public sealed record ResultDiscrimination(
  ResultDiscriminationAction Action,
  InputRequiredResult? Result = null,
  string? Reason = null,
  string? ResultType = null)
{
  /// <summary>A "complete" discrimination.</summary>
  /// <returns>The result.</returns>
  public static ResultDiscrimination OfComplete() => new(ResultDiscriminationAction.Complete);

  /// <summary>An "input_required" discrimination carrying the parsed result.</summary>
  /// <param name="result">The parsed input-required result.</param>
  /// <returns>The result.</returns>
  public static ResultDiscrimination OfInputRequired(InputRequiredResult result) =>
    new(ResultDiscriminationAction.InputRequired, Result: result);

  /// <summary>An "error" discrimination carrying the reason and the offending result type.</summary>
  /// <param name="reason">The human-readable reason.</param>
  /// <param name="resultType">The offending <c>resultType</c>, if any.</param>
  /// <returns>The result.</returns>
  public static ResultDiscrimination OfError(string reason, string? resultType) =>
    new(ResultDiscriminationAction.Error, Reason: reason, ResultType: resultType);
}

/// <summary>One kind-correlation failure reported by <see cref="MultiRoundTrip.ValidateInputResponseKinds"/> (spec §11.4).</summary>
/// <param name="Key">The <c>inputResponses</c> key whose value failed validation.</param>
/// <param name="ExpectedMethod">The <c>InputRequest.method</c> the server sent under this key.</param>
/// <param name="Detail">A human-readable error detail.</param>
public sealed record InputResponseKindError(string Key, string ExpectedMethod, string Detail);

/// <summary>The outcome of <see cref="MultiRoundTrip.ValidateInputResponseKinds"/> (spec §11.4).</summary>
/// <param name="Valid">Whether all responses match their request kinds.</param>
/// <param name="Errors">The per-key failures, empty when valid.</param>
public sealed record InputResponseKindValidation(bool Valid, IReadOnlyList<InputResponseKindError> Errors)
{
  /// <summary>A successful validation result.</summary>
  public static InputResponseKindValidation Ok { get; } = new(true, []);

  /// <summary>Builds a failed validation result carrying the per-key <paramref name="errors"/>.</summary>
  /// <param name="errors">The per-key failures.</param>
  /// <returns>The result.</returns>
  public static InputResponseKindValidation Invalid(IReadOnlyList<InputResponseKindError> errors) => new(false, errors);
}

/// <summary>The outcome of <see cref="MultiRoundTrip.ParseInputRequiredResult"/> (spec §11.2).</summary>
/// <param name="Ok">Whether the raw JSON parsed into a well-formed result.</param>
/// <param name="Result">The parsed result, present only when <see cref="Ok"/> is <c>true</c>.</param>
/// <param name="Error">The protocol error, present only when <see cref="Ok"/> is <c>false</c>.</param>
public sealed record InputRequiredParse(bool Ok, InputRequiredResult? Result, McpError? Error)
{
  /// <summary>A successful parse carrying the result.</summary>
  /// <param name="result">The parsed result.</param>
  /// <returns>The outcome.</returns>
  public static InputRequiredParse OfOk(InputRequiredResult result) => new(true, result, null);

  /// <summary>A failed parse carrying the protocol error.</summary>
  /// <param name="error">The protocol error.</param>
  /// <returns>The outcome.</returns>
  public static InputRequiredParse OfError(McpError error) => new(false, null, error);
}
