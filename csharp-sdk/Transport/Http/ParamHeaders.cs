using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Transport.Http;

/// <summary>
/// S14 — Tool parameters surfaced as <c>Mcp-Param-*</c> headers (spec §9.5).
/// </summary>
/// <remarks>
/// <para>
/// A server MAY annotate <c>inputSchema</c> parameters with <c>x-mcp-header</c> to mirror them into
/// request headers; clients on this transport MUST support it. This module ports the TypeScript SDK's
/// <c>transport/http/param-headers.ts</c> and covers:
/// </para>
/// <list type="bullet">
///   <item><c>x-mcp-header</c> annotation validity (§9.5.1) and client rejection of invalid tools,
///   keeping other tools usable.</item>
///   <item>client emission of <c>Mcp-Param-{name}</c> headers from a tool's schema and the call
///   arguments (§9.5.2), with value encoding (<see cref="ParamEncoding"/>).</item>
///   <item>receiver validation of those headers against the body (§9.5.4), including numeric comparison
///   of integers, with any mismatch yielding <c>-32001</c> (HeaderMismatch).</item>
/// </list>
/// </remarks>
public static class ParamHeaders
{
  /// <summary>Prefix for one-per-annotated-parameter headers, for example <c>Mcp-Param-Region</c>. (§9.5.2)</summary>
  public const string McpParamHeaderPrefix = "Mcp-Param-";

  /// <summary>
  /// HTTP field-name token grammar: <c>1*tchar</c> (RFC 7230). Excludes control characters and CR/LF.
  /// (R-9.5.1-b, R-9.5.1-c)
  /// </summary>
  private static readonly Regex TcharPattern =
    new(@"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

  /// <summary>The JSON primitive types an <c>x-mcp-header</c> annotation may decorate. (R-9.5.1-e)</summary>
  private static readonly IReadOnlySet<string> AnnotatableTypes =
    new HashSet<string>(StringComparer.Ordinal) { "integer", "string", "boolean" };

  // ─── Annotation collection ─────────────────────────────────────────────────────

  /// <summary>One <c>x-mcp-header</c>-annotated parameter discovered in an <c>inputSchema</c>.</summary>
  /// <param name="RawName">The raw <c>x-mcp-header</c> value (the name portion); <c>null</c>/non-string when invalid.</param>
  /// <param name="Type">The annotated property's declared JSON <c>type</c>, if any.</param>
  /// <param name="Path">The property path from the schema root (object nesting only).</param>
  /// <param name="UnderArray"><c>true</c> when the annotation sits under an array <c>items</c> subschema.</param>
  public sealed record AnnotatedParam(string? RawName, string? Type, IReadOnlyList<string> Path, bool UnderArray);

  /// <summary>Collects all <c>x-mcp-header</c> annotations from an <c>inputSchema</c>. (R-9.5.1-h)</summary>
  /// <param name="inputSchema">The tool's input schema, or <c>null</c>.</param>
  /// <returns>Every annotated subschema, in document order.</returns>
  public static IReadOnlyList<AnnotatedParam> CollectXMcpHeaders(JsonNode? inputSchema)
  {
    var output = new List<AnnotatedParam>();
    CollectAnnotations(inputSchema, [], underArray: false, output);
    return output;
  }

  /// <summary>Recursively collects every <c>x-mcp-header</c>-annotated subschema. (R-9.5.1-h)</summary>
  private static void CollectAnnotations(JsonNode? schema, List<string> path, bool underArray, List<AnnotatedParam> output)
  {
    if (schema is not JsonObject obj)
    {
      return;
    }

    if (obj.TryGetPropertyValue("x-mcp-header", out var annotation))
    {
      // The raw name is the annotation when it is a string; otherwise it is recorded as null/invalid so
      // validation can reject it. The path is snapshotted because the caller mutates it in place.
      var rawName = annotation is JsonValue v && v.GetValueKind() == JsonValueKind.String
        ? v.GetValue<string>()
        : null;
      var type = obj["type"] is JsonValue t && t.GetValueKind() == JsonValueKind.String
        ? t.GetValue<string>()
        : null;
      output.Add(new AnnotatedParam(rawName, type, path.ToArray(), underArray));
    }

    if (obj["properties"] is JsonObject props)
    {
      foreach (var (key, sub) in props)
      {
        path.Add(key);
        CollectAnnotations(sub, path, underArray, output);
        path.RemoveAt(path.Count - 1);
      }
    }

    if (obj["items"] is JsonObject items)
    {
      CollectAnnotations(items, path, underArray: true, output);
    }
  }

  // ─── Annotation-name validity (§9.5.1) ─────────────────────────────────────────

  /// <summary>The outcome of validating a single <c>x-mcp-header</c> name or a tool's annotations.</summary>
  /// <param name="Valid">Whether validation passed.</param>
  /// <param name="Reason">The rejection reason when <see cref="Valid"/> is <c>false</c>; otherwise <c>null</c>.</param>
  public readonly record struct ValidationResult(bool Valid, string? Reason)
  {
    /// <summary>A passing result.</summary>
    public static ValidationResult Pass { get; } = new(true, null);

    /// <summary>Builds a failing result carrying <paramref name="reason"/>.</summary>
    /// <param name="reason">Why validation failed.</param>
    /// <returns>The failing result.</returns>
    public static ValidationResult Fail(string reason) => new(false, reason);
  }

  /// <summary>
  /// Validates one <c>x-mcp-header</c> name against §9.5.1: non-empty (R-9.5.1-a), <c>1*tchar</c>
  /// (R-9.5.1-b), and free of control characters including CR/LF (R-9.5.1-c, subsumed by the token
  /// grammar).
  /// </summary>
  /// <param name="name">The candidate name (a non-string value is invalid).</param>
  /// <returns>The validation outcome.</returns>
  public static ValidationResult ValidateXMcpHeaderName(string? name)
  {
    if (string.IsNullOrEmpty(name))
    {
      return ValidationResult.Fail("x-mcp-header MUST be a non-empty string");
    }
    if (!TcharPattern.IsMatch(name))
    {
      return ValidationResult.Fail($"x-mcp-header \"{name}\" is not a valid 1*tchar token");
    }
    return ValidationResult.Pass;
  }

  // ─── Tool validity (§9.5.1) ────────────────────────────────────────────────────

  /// <summary>
  /// Validates every <c>x-mcp-header</c> annotation in a tool's <c>inputSchema</c>. (§9.5.1)
  /// </summary>
  /// <remarks>
  /// Checks each annotation's name (R-9.5.1-a/b/c), that the annotated parameter's type is a primitive
  /// <c>integer</c>/<c>string</c>/<c>boolean</c> (R-9.5.1-e) and not <c>number</c> (R-9.5.1-f), and that
  /// all names are case-insensitively unique within the schema (R-9.5.1-d). Annotations at any nesting
  /// depth are accepted (R-9.5.1-h).
  /// </remarks>
  /// <param name="inputSchema">The tool's input schema, or <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static ValidationResult ValidateToolXMcpHeaders(JsonNode? inputSchema)
  {
    var annotations = CollectXMcpHeaders(inputSchema);
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    foreach (var annotation in annotations)
    {
      var nameResult = ValidateXMcpHeaderName(annotation.RawName);
      if (!nameResult.Valid)
      {
        return nameResult;
      }
      // RawName is guaranteed non-null here because ValidateXMcpHeaderName rejected null/empty.
      var name = annotation.RawName!;
      if (!seen.Add(name))
      {
        return ValidationResult.Fail($"duplicate x-mcp-header \"{name}\" (case-insensitive)");
      }

      if (annotation.Type is null || !AnnotatableTypes.Contains(annotation.Type))
      {
        return ValidationResult.Fail(
          $"x-mcp-header \"{name}\" must annotate an integer/string/boolean parameter, not \"{annotation.Type ?? "unknown"}\"");
      }
    }
    return ValidationResult.Pass;
  }

  /// <summary>A tool rejected by <see cref="FilterValidTools"/>, with the reason for logging.</summary>
  /// <param name="Tool">The rejected tool's name.</param>
  /// <param name="Reason">Why it was rejected.</param>
  public sealed record RejectedTool(string Tool, string Reason);

  /// <summary>The result of filtering tools: the usable ones plus warnings about rejected ones.</summary>
  /// <typeparam name="TTool">The tool type.</typeparam>
  /// <param name="Tools">The valid (kept) tools.</param>
  /// <param name="Warnings">Rejected tools — the caller SHOULD log each as a warning. (R-9.5.1-k)</param>
  public sealed record FilterToolsResult<TTool>(IReadOnlyList<TTool> Tools, IReadOnlyList<RejectedTool> Warnings);

  /// <summary>
  /// Filters a <c>tools/list</c> result, excluding only tools whose <c>x-mcp-header</c> annotations are
  /// invalid and keeping all valid tools usable. (R-9.5.1-i, R-9.5.1-j) The returned warnings name each
  /// rejected tool and the reason so the caller can log them. (R-9.5.1-k)
  /// </summary>
  /// <remarks>
  /// Clients on non-HTTP transports MAY skip this entirely (R-9.5.1-l) — it is only invoked by the
  /// Streamable HTTP client. The tool type is generic so this works against any tool representation; the
  /// caller supplies accessors for the name and input schema.
  /// </remarks>
  /// <typeparam name="TTool">The tool type.</typeparam>
  /// <param name="tools">The tools to filter.</param>
  /// <param name="nameOf">Extracts a tool's name (for the warning).</param>
  /// <param name="inputSchemaOf">Extracts a tool's input schema (may be <c>null</c>).</param>
  /// <returns>The valid tools and the rejection warnings.</returns>
  public static FilterToolsResult<TTool> FilterValidTools<TTool>(
    IReadOnlyList<TTool> tools,
    Func<TTool, string> nameOf,
    Func<TTool, JsonNode?> inputSchemaOf)
  {
    ArgumentNullException.ThrowIfNull(tools);
    ArgumentNullException.ThrowIfNull(nameOf);
    ArgumentNullException.ThrowIfNull(inputSchemaOf);

    var valid = new List<TTool>();
    var warnings = new List<RejectedTool>();
    foreach (var tool in tools)
    {
      var result = ValidateToolXMcpHeaders(inputSchemaOf(tool));
      if (result.Valid)
      {
        valid.Add(tool);
      }
      else
      {
        warnings.Add(new RejectedTool(nameOf(tool), result.Reason!));
      }
    }
    return new FilterToolsResult<TTool>(valid, warnings);
  }

  // ─── Client emission (§9.5.2) ──────────────────────────────────────────────────

  /// <summary>Returns the header name for an annotated parameter.</summary>
  /// <param name="rawName">The annotation's name portion.</param>
  /// <returns><c>Mcp-Param-{rawName}</c>.</returns>
  public static string ParamHeaderName(string rawName) => $"{McpParamHeaderPrefix}{rawName}";

  /// <summary>Returns <c>true</c> when <paramref name="name"/> is an <c>Mcp-Param-*</c> header (case-insensitive).</summary>
  /// <param name="name">The header name.</param>
  /// <returns><c>true</c> when it begins with <c>Mcp-Param-</c>.</returns>
  public static bool IsParamHeader(string name)
  {
    ArgumentNullException.ThrowIfNull(name);
    return name.StartsWith(McpParamHeaderPrefix, StringComparison.OrdinalIgnoreCase);
  }

  /// <summary>
  /// Builds the <c>Mcp-Param-*</c> headers for a <c>tools/call</c> POST from the tool's
  /// <c>inputSchema</c> and the call <c>arguments</c>. (§9.5.2)
  /// </summary>
  /// <remarks>
  /// One header per annotated parameter present in <paramref name="args"/>; a parameter whose value is
  /// <c>null</c> or absent is omitted (R-9.5.2-g, R-9.5.2-i); each present value is encoded per §9.5.3
  /// (R-9.5.2-c). Annotations under array <c>items</c> (no single resolvable value) are skipped. With no
  /// schema the result is empty (R-9.5.2-l).
  /// </remarks>
  /// <param name="inputSchema">The tool's input schema, or <c>null</c>.</param>
  /// <param name="args">The call <c>arguments</c> object, or <c>null</c>.</param>
  /// <returns>The header name/value pairs to attach to the request.</returns>
  /// <exception cref="ArgumentOutOfRangeException">When an annotated integer value is out of the safe range.</exception>
  public static IReadOnlyDictionary<string, string> BuildParamHeaders(JsonNode? inputSchema, JsonObject? args)
  {
    var headers = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (var annotation in CollectXMcpHeaders(inputSchema))
    {
      if (annotation.UnderArray)
      {
        continue;
      }
      if (annotation.RawName is null || !ValidateXMcpHeaderName(annotation.RawName).Valid)
      {
        continue;
      }

      var value = ReadPath(args, annotation.Path);
      if (value is null || value.GetValueKind() == JsonValueKind.Null)
      {
        continue; // omit absent/null (R-9.5.2-g, R-9.5.2-i)
      }
      if (value is not JsonValue scalar)
      {
        continue; // only primitives are annotatable
      }

      if (TryEncodePrimitive(scalar, out var encoded))
      {
        headers[ParamHeaderName(annotation.RawName)] = encoded;
      }
    }
    return headers;
  }

  // ─── Receiver validation (§9.5.4) ──────────────────────────────────────────────

  /// <summary>
  /// Validates the <c>Mcp-Param-*</c> headers of a request against its body. (§9.5.4)
  /// </summary>
  /// <remarks>
  /// <list type="bullet">
  ///   <item>A recognized header with impermissible characters → <c>-32001</c>. (R-9.5.4-b)</item>
  ///   <item>A header whose decoded value does not match the body value → <c>-32001</c>; integers are
  ///   compared numerically. (R-9.5.4-c, R-9.5.4-d)</item>
  ///   <item>A body value present while its header is omitted → <c>-32001</c>. (R-9.5.2-k)</item>
  ///   <item>A header present while the body value is absent/null → <c>-32001</c>.</item>
  /// </list>
  /// Returns <c>null</c> when valid; otherwise an <see cref="McpError"/> with code <c>-32001</c> for the
  /// caller to surface as a <c>400</c> error response.
  /// </remarks>
  /// <param name="inputSchema">The tool's <c>inputSchema</c> (source of annotations).</param>
  /// <param name="args">The body <c>params.arguments</c>, or <c>null</c>.</param>
  /// <param name="getHeader">A case-insensitive header accessor returning <c>null</c> when absent.</param>
  /// <returns><c>null</c> on success, or the <c>-32001</c> error on a mismatch.</returns>
  public static McpError? ValidateParamHeaders(JsonNode? inputSchema, JsonObject? args, Func<string, string?> getHeader)
  {
    ArgumentNullException.ThrowIfNull(getHeader);

    foreach (var annotation in CollectXMcpHeaders(inputSchema))
    {
      if (annotation.UnderArray)
      {
        continue;
      }
      if (annotation.RawName is null || !ValidateXMcpHeaderName(annotation.RawName).Valid)
      {
        continue;
      }

      var headerName = ParamHeaderName(annotation.RawName);
      var headerValue = getHeader(headerName);
      var bodyValue = ReadPath(args, annotation.Path);
      var bodyPresent = bodyValue is not null && bodyValue.GetValueKind() != JsonValueKind.Null;

      if (!bodyPresent)
      {
        // The client MUST omit the header for null/absent values; an extra header is a mismatch the
        // body-processing receiver rejects.
        if (headerValue is not null)
        {
          return McpError.HeaderMismatch($"{headerName} present but no matching body value");
        }
        continue;
      }

      // Body value present → the header is REQUIRED. (R-9.5.2-k)
      if (headerValue is null)
      {
        return McpError.HeaderMismatch($"{headerName} omitted while body value is present");
      }
      if (!HeaderCharsPermissible(headerValue))
      {
        return McpError.HeaderMismatch($"{headerName} contains impermissible characters");
      }
      if (bodyValue is not JsonValue scalar)
      {
        continue; // non-primitive body value — outside the annotation contract
      }

      string decoded;
      try
      {
        decoded = ParamEncoding.DecodeHeaderValue(headerValue);
      }
      catch (FormatException)
      {
        // A sentinel wrapper around a malformed Base64 payload cannot match any body value.
        return McpError.HeaderMismatch($"{headerName} value does not match the request body");
      }

      if (!ValuesMatch(decoded, scalar, annotation.Type))
      {
        return McpError.HeaderMismatch($"{headerName} value does not match the request body");
      }
    }
    return null;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────────

  /// <summary>Reads the value at a property <paramref name="path"/> from <paramref name="args"/>, or <c>null</c>.</summary>
  private static JsonNode? ReadPath(JsonObject? args, IReadOnlyList<string> path)
  {
    JsonNode? current = args;
    foreach (var key in path)
    {
      if (current is not JsonObject obj || !obj.TryGetPropertyValue(key, out var next))
      {
        return null;
      }
      current = next;
    }
    return current;
  }

  /// <summary>Encodes a primitive JSON scalar (string/number/boolean) into its header-value form.</summary>
  /// <returns><c>true</c> when the scalar is an annotatable primitive; otherwise <c>false</c>.</returns>
  private static bool TryEncodePrimitive(JsonValue scalar, out string encoded)
  {
    switch (scalar.GetValueKind())
    {
      case JsonValueKind.String:
        encoded = ParamEncoding.EncodeHeaderValue(scalar.GetValue<string>());
        return true;
      case JsonValueKind.True:
      case JsonValueKind.False:
        encoded = ParamEncoding.EncodeHeaderValue(scalar.GetValue<bool>());
        return true;
      case JsonValueKind.Number:
        if (!TryGetDouble(scalar, out var number))
        {
          encoded = string.Empty;
          return false;
        }
        encoded = ParamEncoding.EncodeHeaderValue(number);
        return true;
      default:
        encoded = string.Empty;
        return false;
    }
  }

  /// <summary>Returns <c>true</c> when a header value contains only permissible header characters.</summary>
  private static bool HeaderCharsPermissible(string value)
  {
    if (ParamEncoding.IsSentinelEncoded(value))
    {
      return true; // pure-ASCII sentinel form is always safe
    }
    foreach (var rune in value.EnumerateRunes())
    {
      var c = rune.Value;
      var safe = c == 0x09 || (c >= 0x20 && c <= 0x7e);
      if (!safe)
      {
        return false;
      }
    }
    return true;
  }

  /// <summary>Compares a decoded header value to a body value, numerically for integers. (R-9.5.4-c/d)</summary>
  private static bool ValuesMatch(string decoded, JsonValue bodyValue, string? type)
  {
    var bodyIsNumber = bodyValue.GetValueKind() == JsonValueKind.Number;
    if (type == "integer" || bodyIsNumber)
    {
      // Numeric comparison: "42.0" matches 42, "1e2" matches 100. (R-9.5.4-d)
      if (!double.TryParse(decoded, NumberStyles.Float, CultureInfo.InvariantCulture, out var h)
        || !double.IsFinite(h))
      {
        return false;
      }
      if (!TryGetDouble(bodyValue, out var b) || !double.IsFinite(b))
      {
        return false;
      }
      return h == b;
    }

    return decoded == PlainStringFormOf(bodyValue);
  }

  /// <summary>
  /// Reads a JSON number node as a <see cref="double"/>, tolerating every CLR backing type a
  /// <see cref="JsonValue"/> may use (an int-, long-, double-, or decimal-backed value). A
  /// <see cref="JsonValue"/> built in-process from a CLR <c>int</c> does not convert via
  /// <c>TryGetValue&lt;double&gt;</c> alone, so each numeric backing is attempted in turn.
  /// </summary>
  private static bool TryGetDouble(JsonValue value, out double result)
  {
    result = 0;
    if (value.GetValueKind() != JsonValueKind.Number)
    {
      return false;
    }
    if (value.TryGetValue<double>(out var d)) { result = d; return true; }
    if (value.TryGetValue<long>(out var l)) { result = l; return true; }
    if (value.TryGetValue<int>(out var i)) { result = i; return true; }
    if (value.TryGetValue<decimal>(out var m)) { result = (double)m; return true; }
    return false;
  }

  /// <summary>Returns the per-type plain string form of a primitive body value (mirrors <c>plainStringForm</c>).</summary>
  private static string PlainStringFormOf(JsonValue value)
  {
    switch (value.GetValueKind())
    {
      case JsonValueKind.String:
        return ParamEncoding.PlainStringForm(value.GetValue<string>());
      case JsonValueKind.True:
      case JsonValueKind.False:
        return ParamEncoding.PlainStringForm(value.GetValue<bool>());
      case JsonValueKind.Number:
        return TryGetDouble(value, out var number)
          ? ParamEncoding.PlainStringForm(number)
          : value.ToString();
      default:
        return value.ToString();
    }
  }
}
