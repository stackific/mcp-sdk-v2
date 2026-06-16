using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;

namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// The two <c>resultType</c> values defined by this specification (§3.6, R-3.6-e).
/// </summary>
/// <remarks>
/// Additional values MAY exist only when introduced via the extension mechanism (§24). The two
/// values here are the complete spec-defined set used by <see cref="Payload.IsKnownResultType"/>
/// and <see cref="Payload.InterpretResultType(JsonObject)"/> to decide whether a received
/// <c>resultType</c> is recognized. The extension <c>"task"</c> value, used by the Tasks
/// extension, is intentionally not part of this core set, mirroring <c>payload.ts</c>.
/// </remarks>
public static class ResultTypeNames
{
  /// <summary>The request completed; the result carries the final content for the method.</summary>
  public const string Complete = "complete";

  /// <summary>The server needs more client input before it can finish the request (§11).</summary>
  public const string InputRequired = "input_required";
}

/// <summary>
/// The outcome of interpreting a received result's <c>resultType</c> field (§3.6).
/// </summary>
/// <param name="Recognized">
/// <c>true</c> when <see cref="ResultType"/> is one of the spec-defined values, or when the field
/// was absent/null and therefore defaulted to <c>"complete"</c>. When <c>false</c>, the receiver
/// MUST treat the whole response as an error and MUST NOT read any other result members (R-3.6-f,
/// R-3.6-g).
/// </param>
/// <param name="ResultType">The resolved <c>resultType</c> string.</param>
public readonly record struct ResultTypeInterpretation(bool Recognized, string ResultType);

/// <summary>
/// S04 payload-shape helpers — <c>resultType</c> interpretation plus reusable validators for the
/// base <c>Result</c>, <c>RequestParams</c>, <c>NotificationParams</c>, <c>ProgressToken</c>,
/// <c>Cursor</c>, <c>EmptyResult</c>, and the <c>error</c> object (§3.6–§3.9).
/// </summary>
/// <remarks>
/// The TypeScript SDK expresses these shapes as Zod schemas whose <c>safeParse(...).success</c>
/// signals validity. The idiomatic C# analogue used here is a family of <c>Is…</c> predicates over
/// <see cref="JsonNode"/>, plus a <see cref="ParseEmptyResult(JsonNode?)"/> that reproduces the
/// non-passthrough stripping behaviour of <c>EmptyResultSchema</c>.
/// </remarks>
public static class Payload
{
  // ─── resultType ──────────────────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is exactly a non-null JSON string — the
  /// open <c>ResultType</c> discriminator (§3.6). Any string is structurally valid; recognition of
  /// a specific value is the job of <see cref="IsKnownResultType"/>.
  /// </summary>
  /// <param name="value">The candidate node.</param>
  /// <returns><c>true</c> when the node is a JSON string.</returns>
  public static bool IsValidResultType(JsonNode? value) =>
    value is JsonValue v && v.GetValueKind() == JsonValueKind.String;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is one of the two spec-defined
  /// <c>resultType</c> values (<c>"complete"</c> or <c>"input_required"</c>).
  /// </summary>
  /// <param name="value">The <c>resultType</c> string to test.</param>
  /// <returns><c>true</c> when the value is recognized.</returns>
  /// <remarks>
  /// A receiver that encounters an unrecognized <c>resultType</c> MUST treat the whole response as
  /// an error (R-3.6-f) and MUST NOT read any other result members (R-3.6-g).
  /// </remarks>
  public static bool IsKnownResultType(string value)
  {
    ArgumentNullException.ThrowIfNull(value);
    return value == ResultTypeNames.Complete || value == ResultTypeNames.InputRequired;
  }

  /// <summary>
  /// Interprets the <c>resultType</c> field of a received result object, applying both normative
  /// receiver rules from §3.6.
  /// </summary>
  /// <param name="result">The raw result object received from the wire.</param>
  /// <returns>
  /// A <see cref="ResultTypeInterpretation"/> whose <see cref="ResultTypeInterpretation.Recognized"/>
  /// flag tells the caller whether to read the rest of the result or treat the response as an error.
  /// </returns>
  /// <remarks>
  /// <list type="bullet">
  ///   <item><description>R-3.6-i: an absent or <c>null</c> <c>resultType</c> is treated as
  ///   <c>"complete"</c> (interop fallback for servers that omit the field).</description></item>
  ///   <item><description>R-3.6-f: an unrecognized value yields
  ///   <see cref="ResultTypeInterpretation.Recognized"/> = <c>false</c>, signalling that the whole
  ///   response must be treated as an error.</description></item>
  ///   <item><description>R-3.6-g: when <see cref="ResultTypeInterpretation.Recognized"/> is
  ///   <c>false</c>, callers MUST NOT read other members.</description></item>
  /// </list>
  /// A non-null, non-string <c>resultType</c> (for example a number) can never be one of the two
  /// spec-defined string values, so it is reported as its JSON text form and treated as unrecognized
  /// — the intended outcome for a malformed discriminator.
  /// </remarks>
  public static ResultTypeInterpretation InterpretResultType(JsonObject result)
  {
    ArgumentNullException.ThrowIfNull(result);

    result.TryGetPropertyValue("resultType", out var raw);
    return raw switch
    {
      // An absent member and an explicit JSON null both fall back to "complete" (R-3.6-i).
      null => new ResultTypeInterpretation(true, ResultTypeNames.Complete),
      JsonValue v when v.GetValueKind() == JsonValueKind.Null => new ResultTypeInterpretation(true, ResultTypeNames.Complete),
      // A genuine string is recognized only when it is one of the two spec-defined values.
      JsonValue v when v.GetValueKind() == JsonValueKind.String =>
        Interpret(v.GetValue<string>()),
      // Any other kind (number, bool, object, array) is structurally not a valid discriminator: report
      // its JSON text and treat the whole response as an error (R-3.6-f).
      _ => new ResultTypeInterpretation(false, raw.ToJsonString()),
    };

    static ResultTypeInterpretation Interpret(string resultType) =>
      new(IsKnownResultType(resultType), resultType);
  }

  // ─── Result base shape (§3.6) ─────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="node"/> is a valid base <c>Result</c> (§3.6): a JSON
  /// object that carries a string <c>resultType</c> and, if it carries <c>_meta</c>, a <c>_meta</c>
  /// that is a JSON object. Additional method-defined members are allowed (passthrough). (R-3.6-a,
  /// R-3.6-c, R-3.6-h)
  /// </summary>
  /// <param name="node">The candidate result node.</param>
  /// <returns><c>true</c> when the node is a structurally valid result.</returns>
  public static bool IsValidResult(JsonNode? node)
  {
    if (node is not JsonObject obj) return false;
    if (!obj.TryGetPropertyValue("resultType", out var resultType) || !IsValidResultType(resultType))
    {
      return false;
    }
    return MetaIsAbsentOrObject(obj);
  }

  // ─── EmptyResult shape (§3.9) ─────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="node"/> is a valid <c>EmptyResult</c> (§3.9): a JSON
  /// object with a string <c>resultType</c> and an optional object <c>_meta</c>. Structurally this
  /// is identical to a base <c>Result</c>; the distinction is semantic (no method-defined members).
  /// </summary>
  /// <param name="node">The candidate node.</param>
  /// <returns><c>true</c> when the node satisfies the empty-result shape.</returns>
  public static bool IsValidEmptyResult(JsonNode? node) => IsValidResult(node);

  /// <summary>
  /// Parses an <c>EmptyResult</c> (§3.9), returning a normalized object that carries ONLY
  /// <c>resultType</c> and (when present) <c>_meta</c> — every other member is stripped, since an
  /// empty result MUST NOT include method-specific members (R-3.9-b).
  /// </summary>
  /// <param name="node">The candidate node.</param>
  /// <returns>The stripped object, or <c>null</c> when <paramref name="node"/> is not a valid empty result.</returns>
  public static JsonObject? ParseEmptyResult(JsonNode? node)
  {
    if (!IsValidEmptyResult(node)) return null;
    var obj = (JsonObject)node!;

    // Order matches the TypeScript schema's declaration (resultType first), keeping output stable.
    var result = new JsonObject
    {
      ["resultType"] = obj["resultType"]!.DeepClone(),
    };
    if (obj.TryGetPropertyValue("_meta", out var meta) && meta is not null)
    {
      result["_meta"] = meta.DeepClone();
    }
    return result;
  }

  // ─── RequestParams base shape (§3.7) ──────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="node"/> is a valid base <c>RequestParams</c> (§3.7):
  /// a JSON object whose <c>_meta</c> member is present AND is a JSON object. Additional
  /// method-specific members are allowed (passthrough). (R-3.7-a)
  /// </summary>
  /// <param name="node">The candidate params node.</param>
  /// <returns><c>true</c> when the node is a valid request-params base.</returns>
  /// <remarks>
  /// <c>_meta</c> is REQUIRED on request params because it conveys per-request protocol state
  /// (protocol revision, client info, capabilities, …). An empty <c>_meta</c> object is accepted;
  /// the protocol-specific reserved keys are validated elsewhere.
  /// </remarks>
  public static bool IsValidRequestParams(JsonNode? node)
  {
    if (node is not JsonObject obj) return false;
    return obj.TryGetPropertyValue("_meta", out var meta) && meta is JsonObject;
  }

  // ─── NotificationParams base shape (§3.7) ─────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="node"/> is a valid base
  /// <c>NotificationParams</c> (§3.7): a JSON object whose <c>_meta</c>, if present, is a JSON
  /// object. <c>_meta</c> is OPTIONAL on notification params. Additional members are allowed. (R-3.7-b)
  /// </summary>
  /// <param name="node">The candidate params node.</param>
  /// <returns><c>true</c> when the node is a valid notification-params base.</returns>
  public static bool IsValidNotificationParams(JsonNode? node)
  {
    if (node is not JsonObject obj) return false;
    return MetaIsAbsentOrObject(obj);
  }

  // ─── ProgressToken (§3.7) ─────────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="node"/> is a valid <c>ProgressToken</c> (§3.7): an
  /// opaque JSON string or number. Unlike request ids and error codes, a progress token need not be
  /// an integer, so the §2.5 safe-integer constraint does not apply.
  /// </summary>
  /// <param name="node">The candidate token node.</param>
  /// <returns><c>true</c> when the node is a string or number.</returns>
  public static bool IsValidProgressToken(JsonNode? node) =>
    node is JsonValue v && v.GetValueKind() is JsonValueKind.String or JsonValueKind.Number;

  // ─── Cursor (§3.7) ────────────────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="node"/> is a valid <c>Cursor</c> (§3.7): an opaque
  /// JSON string. An empty string is permitted — the spec does not prohibit it, and a receiver MUST
  /// NOT parse or infer structure from a cursor regardless of its content. (R-3.7-d)
  /// </summary>
  /// <param name="node">The candidate cursor node.</param>
  /// <returns><c>true</c> when the node is a string.</returns>
  public static bool IsValidCursor(JsonNode? node) =>
    node is JsonValue v && v.GetValueKind() == JsonValueKind.String;

  // ─── error object (§3.8) ──────────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="node"/> is a valid wire <c>error</c> object (§3.8): a
  /// JSON object with a <c>code</c> that is an integer within the IEEE-754 safe-integer range, a
  /// string <c>message</c>, and an OPTIONAL <c>data</c> member of any JSON type. Additional members
  /// are allowed (passthrough). (R-3.8-a, R-3.8-c, R-3.8-e, §2.5)
  /// </summary>
  /// <param name="node">The candidate error node.</param>
  /// <returns><c>true</c> when the node is a structurally valid error object.</returns>
  /// <remarks>
  /// The legal value <em>set</em> for <c>code</c> is defined in §22 and is a conformance rule, not a
  /// parse rule — any safe integer parses here. A fractional code (for example <c>−32601.5</c>) or a
  /// string code is rejected.
  /// </remarks>
  public static bool IsValidError(JsonNode? node)
  {
    if (node is not JsonObject obj) return false;

    if (!obj.TryGetPropertyValue("code", out var codeNode) ||
        codeNode is not JsonValue codeValue ||
        codeValue.GetValueKind() != JsonValueKind.Number)
    {
      return false;
    }

    // A safe-integer code parses as a long within the safe range; a fractional value fails the
    // long parse, and an out-of-range integer is rejected by the bound check (§2.5).
    var codeText = codeValue.ToJsonString();
    if (!long.TryParse(codeText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var code) ||
        code < JsonValues.SafeIntegerMin || code > JsonValues.SafeIntegerMax)
    {
      return false;
    }

    if (!obj.TryGetPropertyValue("message", out var messageNode) ||
        messageNode is not JsonValue messageValue ||
        messageValue.GetValueKind() != JsonValueKind.String)
    {
      return false;
    }

    // `data`, when present, may be any JSON value (including null); its absence is also valid.
    return true;
  }

  // ─── shared helpers ───────────────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="obj"/> has no <c>_meta</c> member, or its <c>_meta</c>
  /// is a JSON object. A <c>_meta</c> that is present but is a scalar, an array, or JSON
  /// <c>null</c> is rejected, matching the TypeScript <c>z.record(...).optional()</c> contract
  /// (optional means the key may be absent — not present-and-null).
  /// </summary>
  /// <param name="obj">The object to inspect.</param>
  /// <returns><c>true</c> when <c>_meta</c> is absent or an object.</returns>
  private static bool MetaIsAbsentOrObject(JsonObject obj)
  {
    // The key being absent is acceptable for an optional _meta.
    if (!obj.ContainsKey("_meta")) return true;
    // The key being present requires an object value (a present null/scalar/array is rejected).
    return obj["_meta"] is JsonObject;
  }
}
