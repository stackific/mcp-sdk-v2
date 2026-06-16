using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// A tool definition (spec §16.3): a programmatic <see cref="Name"/>, a REQUIRED JSON Schema for
/// its arguments, and optional output schema, annotations, and display metadata.
/// </summary>
public sealed record Tool
{
  /// <summary>REQUIRED. The unique programmatic identifier used to invoke the tool.</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. A human display name (precedence: <c>title</c> → <c>annotations.title</c> → <c>name</c>).</summary>
  public string? Title { get; init; }

  /// <summary>OPTIONAL. A human-readable description used as a model hint.</summary>
  public string? Description { get; init; }

  /// <summary>REQUIRED. JSON Schema (2020-12) for the arguments object; its root <c>type</c> MUST be <c>object</c> (§16.4).</summary>
  public required JsonObject InputSchema { get; init; }

  /// <summary>OPTIONAL. JSON Schema (2020-12) describing the result's <c>structuredContent</c> (§16.4).</summary>
  public JsonObject? OutputSchema { get; init; }

  /// <summary>OPTIONAL. Untrusted behavior hints (§16.7).</summary>
  public ToolAnnotations? Annotations { get; init; }

  /// <summary>OPTIONAL. Icons for display (§14.2).</summary>
  public IReadOnlyList<Icon>? Icons { get; init; }

  /// <summary>OPTIONAL. Implementation- and extension-specific metadata (§4); carries the UI declaration when present (§26).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>The paginated, cacheable result of <c>tools/list</c> (spec §16.2).</summary>
public sealed record ListToolsResult
{
  /// <summary>REQUIRED. The page of tool definitions (may be empty).</summary>
  public required IReadOnlyList<Tool> Tools { get; init; }

  /// <summary>OPTIONAL. Opaque cursor for the next page; absent on the last page (§12).</summary>
  public string? NextCursor { get; init; }

  /// <summary>The cache time-to-live hint in milliseconds (§13).</summary>
  public long? TtlMs { get; init; }

  /// <summary>The cache sharing scope (§13).</summary>
  public CacheScope? CacheScope { get; init; }
}

/// <summary>
/// Untrusted, human- and model-oriented hints about a tool's behavior (spec §16.7). A client
/// MUST NOT make safety decisions based on annotations from an untrusted server.
/// </summary>
public sealed record ToolAnnotations
{
  /// <summary>OPTIONAL. A human-readable title (ranks after the tool's <c>title</c>, before <c>name</c>).</summary>
  public string? Title { get; init; }

  /// <summary>OPTIONAL (default <c>false</c>). If <c>true</c>, the tool does not modify its environment.</summary>
  public bool? ReadOnlyHint { get; init; }

  /// <summary>OPTIONAL (default <c>true</c>). If <c>true</c>, the tool may perform destructive updates. Meaningful only when not read-only.</summary>
  public bool? DestructiveHint { get; init; }

  /// <summary>OPTIONAL (default <c>false</c>). If <c>true</c>, repeated calls with the same arguments have no extra effect. Meaningful only when not read-only.</summary>
  public bool? IdempotentHint { get; init; }

  /// <summary>OPTIONAL (default <c>true</c>). If <c>true</c>, the tool may interact with an open world of external entities.</summary>
  public bool? OpenWorldHint { get; init; }
}

/// <summary>
/// The result of a completed <c>tools/call</c> (spec §16.5): unstructured <see cref="Content"/>
/// blocks, optional <see cref="StructuredContent"/> (any JSON value), and an
/// <see cref="IsError"/> flag for <em>tool-execution</em> failures (§16.6 — distinct from a
/// JSON-RPC protocol error). The base <c>resultType</c> is supplied by the runtime.
/// </summary>
public sealed record CallToolResult
{
  /// <summary>REQUIRED. The unstructured result blocks (may be empty, may mix kinds).</summary>
  public required IReadOnlyList<ContentBlock> Content { get; init; }

  /// <summary>OPTIONAL. A structured result of any JSON type; populated when the tool declares an <c>outputSchema</c>.</summary>
  public JsonNode? StructuredContent { get; init; }

  /// <summary>OPTIONAL (absent ⇒ <c>false</c>). <c>true</c> when the tool ran but failed (§16.6).</summary>
  public bool? IsError { get; init; }

  /// <summary>OPTIONAL. Implementation-specific metadata (§4); may carry cache hints (§13).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }

  /// <summary>Builds a success result carrying a single text block.</summary>
  /// <param name="text">The text.</param>
  /// <returns>The result.</returns>
  public static CallToolResult FromText(string text) => new() { Content = [ContentBlocks.Text(text)] };

  /// <summary>Builds a tool-execution error result (<c>isError: true</c>) carrying a single text block (§16.6).</summary>
  /// <param name="text">The human- and model-readable explanation.</param>
  /// <returns>The result.</returns>
  public static CallToolResult FromError(string text) =>
    new() { Content = [ContentBlocks.Text(text)], IsError = true };

  /// <summary>
  /// Builds a result for a tool that declares an <c>outputSchema</c> (spec §16.5, R-16.5-p): it sets the
  /// REQUIRED <see cref="StructuredContent"/> and ALSO provides the SHOULD-level unstructured text
  /// fallback — a single text block holding the structured value's JSON serialization — so a client that
  /// does not consume <c>structuredContent</c> still has a renderable representation.
  /// </summary>
  /// <param name="structuredContent">The structured result value (any JSON type, including <c>null</c>).</param>
  /// <returns>The result carrying both the structured value and its serialized text fallback.</returns>
  public static CallToolResult FromStructured(JsonNode? structuredContent) =>
    new()
    {
      Content = [ContentBlocks.Text(structuredContent?.ToJsonString(McpJson.Options) ?? "null")],
      StructuredContent = structuredContent?.DeepClone(),
    };
}

/// <summary>The schema slot being validated: governs the root-<c>type</c> rule (spec §16.4).</summary>
public enum ToolSchemaRole
{
  /// <summary>A tool <c>inputSchema</c>: the root <c>type</c> MUST be <c>"object"</c> (R-16.4-d).</summary>
  Input,

  /// <summary>A tool <c>outputSchema</c>: the root <c>type</c> is unrestricted (R-16.4-e).</summary>
  Output,
}

/// <summary>The resource bounds an implementation imposes on schema processing (spec §16.4(6), R-16.4-m).</summary>
/// <param name="MaxDepth">The maximum nesting depth of a schema document.</param>
/// <param name="MaxNodes">The maximum number of object/array nodes in a schema document.</param>
public readonly record struct SchemaLimits(int MaxDepth, int MaxNodes)
{
  /// <summary>The default resource bounds: depth ≤ 64, nodes ≤ 10000 (§16.4(6), R-16.4-l, R-16.4-m).</summary>
  public static SchemaLimits Default { get; } = new(64, 10_000);
}

/// <summary>
/// The discriminated outcome of <see cref="ToolSchemas.ValidateToolSchema"/> (spec §16.4): either the
/// schema is safe to validate against / register (with its resolved dialect), or it is rejected with a
/// human-readable reason.
/// </summary>
/// <param name="Ok">Whether the schema passed every §16.4 hardening check.</param>
/// <param name="Dialect">The resolved schema dialect when <see cref="Ok"/> is <c>true</c>.</param>
/// <param name="Reason">The rejection reason when <see cref="Ok"/> is <c>false</c>.</param>
public readonly record struct ToolSchemaValidation(bool Ok, string? Dialect, string? Reason)
{
  /// <summary>Builds a successful validation carrying the resolved <paramref name="dialect"/>.</summary>
  /// <param name="dialect">The governing schema dialect.</param>
  /// <returns>A successful validation result.</returns>
  public static ToolSchemaValidation Valid(string dialect) => new(true, dialect, null);

  /// <summary>Builds a failed validation carrying the rejection <paramref name="reason"/>.</summary>
  /// <param name="reason">Why the schema was rejected.</param>
  /// <returns>A failed validation result.</returns>
  public static ToolSchemaValidation Invalid(string reason) => new(false, null, reason);
}

/// <summary>
/// Raised when a tool schema declares a JSON Schema dialect this implementation cannot validate
/// against (spec §16.4(9), R-16.4-t). The implementation MUST handle an unsupported dialect by
/// signalling an error rather than silently ignoring the declaration or treating the schema as
/// permissive.
/// </summary>
public sealed class UnsupportedDialectException : Exception
{
  /// <summary>Creates the exception, recording the unsupported <paramref name="dialect"/>.</summary>
  /// <param name="dialect">The unsupported dialect URI.</param>
  public UnsupportedDialectException(string dialect)
    : base($"Unsupported JSON Schema dialect: {dialect}")
  {
    Dialect = dialect;
  }

  /// <summary>The unsupported dialect URI that triggered the rejection.</summary>
  public string Dialect { get; }
}

/// <summary>The outcome of validating a JSON value against a JSON Schema document (spec §16.4, R-16.4-o/p).</summary>
/// <param name="Valid">Whether the value conforms to the schema.</param>
/// <param name="Errors">Human-readable validation errors (empty when <see cref="Valid"/>).</param>
public sealed record SchemaValueValidation(bool Valid, IReadOnlyList<string> Errors)
{
  /// <summary>A successful (conforming) validation result with no errors.</summary>
  public static SchemaValueValidation Success { get; } = new(true, []);

  /// <summary>Builds a failed validation result carrying the given <paramref name="errors"/>.</summary>
  /// <param name="errors">The validation errors.</param>
  /// <returns>A failed validation result.</returns>
  public static SchemaValueValidation Failure(IReadOnlyList<string> errors) => new(false, errors);
}

/// <summary>
/// The §16.4 JSON-Schema hardening gate and the §16.7 tool-annotation resolution for the Tools
/// feature, ported from the TypeScript SDK's <c>tools.ts</c> / <c>tools-call.ts</c>. These are the
/// normative pure helpers that protect schema registration against resource exhaustion and SSRF and
/// that apply the spec defaults to untrusted annotation hints.
/// </summary>
/// <remarks>
/// The actual <em>value</em> validation (an <c>arguments</c> object against an <c>inputSchema</c>, or
/// a <c>structuredContent</c> value against an <c>outputSchema</c>) is delegated to
/// <c>Stackific.Mcp.Server.SchemaValidation</c> via the <see cref="ValueValidator"/> hook, because it
/// requires a full JSON Schema 2020-12 engine. The hardening checks here are pure and perform no I/O,
/// so inspecting a schema for an external <c>$ref</c> never itself triggers a network/file fetch — it
/// only reports its presence so the caller can reject it.
/// </remarks>
public static class ToolSchemas
{
  /// <summary>The default JSON Schema dialect assumed when no explicit <c>$schema</c> is present (§16.4(1), R-16.4-a).</summary>
  public const string DefaultSchemaDialect = "https://json-schema.org/draft/2020-12/schema";

  /// <summary>
  /// The complete set of JSON Schema dialects this implementation can validate against (§16.4(9),
  /// R-16.4-s, R-16.4-u): ONLY JSON Schema 2020-12 — both the canonical
  /// <c>https://json-schema.org/draft/2020-12/schema</c> and its <c>#</c>-suffixed spelling. No dialect
  /// beyond 2020-12 is supported; a tool schema declaring any other <c>$schema</c> (for example
  /// Draft-07) is rejected by <see cref="IsSupportedSchemaDialect"/> / <see cref="ValidateToolSchema"/>
  /// rather than silently treated as permissive (R-16.4-t).
  /// </summary>
  public static IReadOnlySet<string> SupportedSchemaDialects { get; } =
    new HashSet<string>(StringComparer.Ordinal)
    {
      DefaultSchemaDialect,
      "https://json-schema.org/draft/2020-12/schema#",
    };

  /// <summary>
  /// The value validator hook: validates a JSON value against a 2020-12 schema. Defaults to a stub
  /// that refuses (so a mis-wired build never silently passes), and is wired by the server layer to
  /// the real JsonSchema.Net-backed validator. (R-16.4-o, R-16.4-p)
  /// </summary>
  /// <remarks>
  /// Installed once at startup via <see cref="ConfigureValueValidator"/> from
  /// <c>Server/SchemaValidation.cs</c>. Kept as an injectable hook so the protocol layer carries no
  /// hard dependency on the validation engine while still exposing
  /// <see cref="ValidateValueAgainstSchema"/> / <see cref="ValidateToolStructuredContent"/> as the
  /// canonical entry points the spec places in this module.
  /// </remarks>
  private static Func<JsonObject, JsonNode?, SchemaValueValidation> ValueValidator { get; set; } =
    static (_, _) => SchemaValueValidation.Failure(["no JSON Schema value validator is configured"]);

  /// <summary>
  /// Installs the JSON Schema 2020-12 value validator used by <see cref="ValidateValueAgainstSchema"/>.
  /// Called once by the server's schema-validation module so the protocol layer can validate without a
  /// compile-time dependency on the engine. (R-16.4-o, R-16.4-p)
  /// </summary>
  /// <param name="validator">The validator: returns conformance of a value against a schema object.</param>
  public static void ConfigureValueValidator(Func<JsonObject, JsonNode?, SchemaValueValidation> validator)
  {
    ArgumentNullException.ThrowIfNull(validator);
    ValueValidator = validator;
  }

  /// <summary>
  /// Returns the dialect governing a schema document: the explicit <c>$schema</c> keyword when present
  /// (and a string), otherwise the default 2020-12 dialect. (§16.4(1), R-16.4-a, R-16.4-b)
  /// </summary>
  /// <param name="schema">The schema document.</param>
  /// <returns>The governing dialect URI.</returns>
  public static string SchemaDialect(JsonObject schema)
  {
    ArgumentNullException.ThrowIfNull(schema);
    return schema["$schema"] is JsonValue v && v.GetValueKind() == JsonValueKind.String
      ? v.GetValue<string>()
      : DefaultSchemaDialect;
  }

  /// <summary>Returns <c>true</c> when <paramref name="dialect"/> is one this implementation supports (R-16.4-s, R-16.4-t).</summary>
  /// <param name="dialect">The dialect URI.</param>
  /// <returns><c>true</c> when the dialect is supported.</returns>
  public static bool IsSupportedSchemaDialect(string dialect) => SupportedSchemaDialects.Contains(dialect);

  /// <summary>
  /// Returns <c>true</c> when a <c>$ref</c> / <c>$dynamicRef</c> value resolves WITHIN the same schema
  /// document — a document-local JSON Pointer (<c>#</c>, <c>#/…</c>) or a plain-name fragment anchor
  /// (<c>#anchor</c>). An absolute or relative URI naming another document is NOT in-document.
  /// (§16.4(5), R-16.4-f)
  /// </summary>
  /// <param name="reference">The reference value.</param>
  /// <returns><c>true</c> when the reference stays inside the document.</returns>
  public static bool IsInDocumentRef(string reference)
  {
    ArgumentNullException.ThrowIfNull(reference);
    return reference == "#"
      || reference.StartsWith("#/", StringComparison.Ordinal)
      || (reference.StartsWith('#') && !reference.Contains('/'));
  }

  /// <summary>
  /// Walks a schema document and returns <c>true</c> when any <c>$ref</c> / <c>$dynamicRef</c> targets
  /// a location OUTSIDE the document. Such a reference MUST NOT be dereferenced or fetched over network
  /// or file system; this pure inspection never performs I/O (so it cannot itself trigger an SSRF
  /// fetch) — it only reports the presence of an external reference so callers can reject it.
  /// (§16.4(5), R-16.4-f, R-16.4-g, R-16.4-k, R-16.4-r)
  /// </summary>
  /// <param name="node">The schema (or sub-schema) to inspect.</param>
  /// <param name="maxDepth">A recursion bound so a pathological schema cannot exhaust the stack.</param>
  /// <returns><c>true</c> when an external reference is present.</returns>
  public static bool HasExternalRef(JsonNode? node, int maxDepth = 64) => HasExternalRefWalk(node, 0, maxDepth);

  private static bool HasExternalRefWalk(JsonNode? value, int depth, int maxDepth)
  {
    if (depth > maxDepth) return false;
    switch (value)
    {
      case JsonArray array:
        foreach (var element in array)
        {
          if (HasExternalRefWalk(element, depth + 1, maxDepth)) return true;
        }

        return false;
      case JsonObject obj:
        foreach (var key in new[] { "$ref", "$dynamicRef" })
        {
          if (obj[key] is JsonValue refValue && refValue.GetValueKind() == JsonValueKind.String
              && !IsInDocumentRef(refValue.GetValue<string>()))
          {
            return true;
          }
        }

        foreach (var (_, child) in obj)
        {
          if (HasExternalRefWalk(child, depth + 1, maxDepth)) return true;
        }

        return false;
      default:
        return false;
    }
  }

  /// <summary>
  /// Returns the maximum nesting depth of a schema document (objects + arrays). Counting stops at
  /// <paramref name="cap"/> so a pathologically deep value cannot exhaust the stack. A leaf object such
  /// as <c>{"type":"object"}</c> has depth 1. (§16.4(6), R-16.4-l)
  /// </summary>
  /// <param name="node">The schema value.</param>
  /// <param name="cap">A hard recursion cap; the returned depth never exceeds it.</param>
  /// <returns>The schema's nesting depth, bounded by <paramref name="cap"/>.</returns>
  public static int SchemaNestingDepth(JsonNode? node, int cap = 65) => DepthOf(node, 0, cap);

  private static int DepthOf(JsonNode? value, int depth, int cap)
  {
    if (depth >= cap) return cap;
    switch (value)
    {
      case JsonArray array:
        {
          var max = depth;
          foreach (var element in array) max = Math.Max(max, DepthOf(element, depth + 1, cap));
          return max;
        }

      case JsonObject obj:
        {
          var max = depth;
          foreach (var (_, child) in obj) max = Math.Max(max, DepthOf(child, depth + 1, cap));
          return max;
        }

      default:
        return depth;
    }
  }

  /// <summary>Counts object/array nodes in a schema, stopping once <paramref name="cap"/> is exceeded (R-16.4-m).</summary>
  private static int CountNodes(JsonNode? node, int cap)
  {
    var count = 0;
    void Walk(JsonNode? value, int depth)
    {
      if (count > cap || depth > cap) return;
      switch (value)
      {
        case JsonArray array:
          count += 1;
          foreach (var element in array) Walk(element, depth + 1);
          break;
        case JsonObject obj:
          count += 1;
          foreach (var (_, child) in obj) Walk(child, depth + 1);
          break;
      }
    }

    Walk(node, 0);
    return count;
  }

  /// <summary>
  /// Validates a tool's <c>inputSchema</c> or <c>outputSchema</c> against the §16.4 hardening rules,
  /// WITHOUT any network or file-system retrieval. Returns a structured result rather than throwing so
  /// a caller can reject-or-refuse-registration. (§16.4, R-16.4-d/e/f/g/k/l/n/s/t)
  /// </summary>
  /// <remarks>
  /// Checks, in order: (1) the schema is a JSON object — not <c>null</c>, not an array, not a scalar
  /// (R-16.4-n); (2) its declared/default dialect is supported (R-16.4-t/s); (3) nesting depth and node
  /// count are within <paramref name="limits"/> (R-16.4-l/m/n); (4) unless
  /// <paramref name="allowExternalRefs"/> is <c>true</c> (default <c>false</c>, R-16.4-i), no external
  /// <c>$ref</c>/<c>$dynamicRef</c> is present (R-16.4-f/g/k); (5) for an input schema, the root
  /// <c>type</c> MUST be <c>"object"</c> (R-16.4-d); an output schema's root type is unrestricted
  /// (R-16.4-e).
  /// </remarks>
  /// <param name="schema">The raw schema node.</param>
  /// <param name="role">Whether the schema is an input (root must be <c>object</c>) or output schema.</param>
  /// <param name="limits">Resource bounds; defaults to <see cref="SchemaLimits.Default"/>.</param>
  /// <param name="allowExternalRefs">Opt-in non-local <c>$ref</c> fetching; defaults to <c>false</c>.</param>
  /// <returns>A <see cref="ToolSchemaValidation"/> describing acceptance or rejection.</returns>
  public static ToolSchemaValidation ValidateToolSchema(
    JsonNode? schema,
    ToolSchemaRole role,
    SchemaLimits? limits = null,
    bool allowExternalRefs = false)
  {
    var bounds = limits ?? SchemaLimits.Default;

    if (schema is not JsonObject obj)
    {
      return ToolSchemaValidation.Invalid("schema is not a valid JSON Schema object (R-16.4-n)");
    }

    var dialect = SchemaDialect(obj);
    if (!IsSupportedSchemaDialect(dialect))
    {
      return ToolSchemaValidation.Invalid($"unsupported dialect '{dialect}' (R-16.4-t)");
    }

    if (SchemaNestingDepth(obj, bounds.MaxDepth + 1) > bounds.MaxDepth)
    {
      return ToolSchemaValidation.Invalid(
        $"schema nesting depth exceeds limit {bounds.MaxDepth} (R-16.4-l, R-16.4-n)");
    }

    if (CountNodes(obj, bounds.MaxNodes + 1) > bounds.MaxNodes)
    {
      return ToolSchemaValidation.Invalid(
        $"schema node count exceeds limit {bounds.MaxNodes} (R-16.4-m, R-16.4-n)");
    }

    if (!allowExternalRefs && HasExternalRef(obj, bounds.MaxDepth))
    {
      return ToolSchemaValidation.Invalid(
        "schema contains an external $ref that is not permitted (R-16.4-f, R-16.4-k)");
    }

    if (role == ToolSchemaRole.Input
        && !(obj["type"] is JsonValue t && t.GetValueKind() == JsonValueKind.String && t.GetValue<string>() == "object"))
    {
      return ToolSchemaValidation.Invalid("inputSchema root type MUST be \"object\" (R-16.4-d)");
    }

    return ToolSchemaValidation.Valid(dialect);
  }

  /// <summary>
  /// Asserts a tool schema is safe to register, throwing when it is not. A server MUST reject — or
  /// refuse to register — any schema it cannot safely validate. Throws
  /// <see cref="UnsupportedDialectException"/> for an unsupported dialect and
  /// <see cref="ArgumentException"/> for every other rejection. (§16.4(7)(9), R-16.4-n, R-16.4-t)
  /// </summary>
  /// <param name="schema">The raw schema node.</param>
  /// <param name="role">Whether the schema is an input or output schema.</param>
  /// <param name="limits">Resource bounds; defaults to <see cref="SchemaLimits.Default"/>.</param>
  /// <param name="allowExternalRefs">Opt-in non-local <c>$ref</c> fetching; defaults to <c>false</c>.</param>
  /// <exception cref="UnsupportedDialectException">When the schema declares an unsupported dialect.</exception>
  /// <exception cref="ArgumentException">When the schema is otherwise unsafe to register.</exception>
  public static void AssertRegistrableToolSchema(
    JsonNode? schema,
    ToolSchemaRole role,
    SchemaLimits? limits = null,
    bool allowExternalRefs = false)
  {
    // An unsupported dialect gets a dedicated exception type even though it only applies to objects.
    if (schema is JsonObject obj)
    {
      var dialect = SchemaDialect(obj);
      if (!IsSupportedSchemaDialect(dialect))
      {
        throw new UnsupportedDialectException(dialect);
      }
    }

    var result = ValidateToolSchema(schema, role, limits, allowExternalRefs);
    if (!result.Ok)
    {
      throw new ArgumentException($"Refusing to register tool schema: {result.Reason}", nameof(schema));
    }
  }

  /// <summary>
  /// Validates a JSON value against a JSON Schema document (the 2020-12 dialect). This is the
  /// value-validation capability §16.4 places in this module: the machinery used to validate a
  /// <c>tools/call</c> <c>arguments</c> object against an <c>inputSchema</c>, and a
  /// <c>structuredContent</c> value against an <c>outputSchema</c>. Never throws; returns
  /// <c>valid: false</c> when the schema is not a supported 2020-12 object schema or cannot be
  /// compiled. (§16.4, R-16.4-o, R-16.4-p)
  /// </summary>
  /// <param name="schema">The JSON Schema document.</param>
  /// <param name="value">The JSON value to validate against it.</param>
  /// <returns>A <see cref="SchemaValueValidation"/> describing conformance.</returns>
  public static SchemaValueValidation ValidateValueAgainstSchema(JsonNode? schema, JsonNode? value)
  {
    if (schema is not JsonObject obj)
    {
      return SchemaValueValidation.Failure(["schema is not a valid JSON Schema object (R-16.4-n)"]);
    }

    var dialect = SchemaDialect(obj);
    if (!IsSupportedSchemaDialect(dialect))
    {
      return SchemaValueValidation.Failure([$"unsupported dialect '{dialect}' (R-16.4-t)"]);
    }

    return ValueValidator(obj, value);
  }

  /// <summary>
  /// Validates a <c>tools/call</c> <c>arguments</c> object against a tool's <c>inputSchema</c>. A
  /// receiver MUST validate arguments against the input schema. (R-16.4-o)
  /// </summary>
  /// <param name="inputSchema">The tool's input schema.</param>
  /// <param name="arguments">The supplied arguments object.</param>
  /// <returns>A <see cref="SchemaValueValidation"/> describing conformance.</returns>
  public static SchemaValueValidation ValidateToolArguments(JsonObject inputSchema, JsonNode? arguments) =>
    ValidateValueAgainstSchema(inputSchema, arguments);

  /// <summary>
  /// Validates a tool result's <c>structuredContent</c> against the tool's <c>outputSchema</c>. When
  /// the tool declares no output schema there is nothing to validate and the result is valid;
  /// otherwise the value MUST conform. (R-16.4-p, R-16.5-o)
  /// </summary>
  /// <param name="outputSchema">The tool's output schema, or <c>null</c> when none is declared.</param>
  /// <param name="structuredContent">The result's structured content (any JSON value, including <c>null</c>).</param>
  /// <returns>A <see cref="SchemaValueValidation"/> describing conformance.</returns>
  public static SchemaValueValidation ValidateToolStructuredContent(JsonObject? outputSchema, JsonNode? structuredContent)
  {
    if (outputSchema is null)
    {
      return SchemaValueValidation.Success;
    }

    return ValidateValueAgainstSchema(outputSchema, structuredContent);
  }
}

/// <summary>Tool name-convention and display-name helpers (spec §16.3).</summary>
public static class ToolNames
{
  /// <summary>The inclusive lower bound recommended for a tool <c>name</c> length (R-16.3-b).</summary>
  public const int MinLength = 1;

  /// <summary>The inclusive upper bound recommended for a tool <c>name</c> length (R-16.3-b).</summary>
  public const int MaxLength = 128;

  private static readonly System.Text.RegularExpressions.Regex NamePattern =
    new("^[A-Za-z0-9_.-]+$",
      System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

  /// <summary>
  /// Returns <c>true</c> when a tool <c>name</c> follows the recommended conventions: 1–128 characters,
  /// only <c>A–Z a–z 0–9 _ - .</c> (so no spaces/commas/other special characters). Names SHOULD be
  /// treated case-sensitively. (§16.3, R-16.3-b, R-16.3-c, R-16.3-d, R-16.3-e)
  /// </summary>
  /// <param name="name">The candidate tool name.</param>
  /// <returns><c>true</c> when the name follows the conventions.</returns>
  public static bool IsConventional(string name)
  {
    ArgumentNullException.ThrowIfNull(name);
    return name.Length is >= MinLength and <= MaxLength && NamePattern.IsMatch(name);
  }

  /// <summary>
  /// Resolves the display name to show for a tool, applying the §16.3 precedence:
  /// <c>title</c> → <c>annotations.title</c> → <c>name</c>. (R-16.3-i)
  /// </summary>
  /// <param name="tool">The tool whose display name to resolve.</param>
  /// <returns>The resolved display name.</returns>
  public static string DisplayName(Tool tool)
  {
    ArgumentNullException.ThrowIfNull(tool);
    return Protocol.DisplayName.Resolve(tool.Name, tool.Title, tool.Annotations?.Title);
  }

  /// <summary>
  /// Returns the names that occur more than once across <paramref name="tools"/>. Tool names SHOULD be
  /// unique within a single server; an aggregating client/proxy MAY encounter collisions. (R-16.3-f, R-16.3-g)
  /// </summary>
  /// <param name="tools">The tools to inspect.</param>
  /// <returns>The duplicated names, in first-collision order.</returns>
  public static IReadOnlyList<string> FindDuplicates(IEnumerable<Tool> tools)
  {
    ArgumentNullException.ThrowIfNull(tools);
    var seen = new HashSet<string>(StringComparer.Ordinal);
    var dupes = new List<string>();
    var dupeSet = new HashSet<string>(StringComparer.Ordinal);
    foreach (var tool in tools)
    {
      if (!seen.Add(tool.Name) && dupeSet.Add(tool.Name)) dupes.Add(tool.Name);
    }

    return dupes;
  }

  /// <summary>
  /// Applies a disambiguation strategy for an aggregated tool name by prefixing the server identifier
  /// (for example <c>server.tool</c>). A client/proxy that hits a name collision SHOULD apply such a
  /// strategy. (R-16.3-h)
  /// </summary>
  /// <param name="serverId">The server identifier to prefix with.</param>
  /// <param name="name">The tool's original name.</param>
  /// <param name="separator">The prefix separator (default <c>.</c>, a permitted name char).</param>
  /// <returns>The disambiguated name.</returns>
  public static string Disambiguate(string serverId, string name, string separator = ".") =>
    $"{serverId}{separator}{name}";
}

/// <summary>The four boolean <see cref="ToolAnnotations"/> hints resolved to concrete values (spec §16.7).</summary>
/// <param name="ReadOnlyHint">Whether the tool does not modify its environment (default <c>false</c>, R-16.7-b).</param>
/// <param name="DestructiveHint">Whether destructive updates are possible (default <c>true</c>; meaningful only when not read-only, R-16.7-c).</param>
/// <param name="IdempotentHint">Whether repeated same-arg calls have no extra effect (default <c>false</c>; meaningful only when not read-only, R-16.7-d).</param>
/// <param name="OpenWorldHint">Whether the tool may interact with an open world (default <c>true</c>, R-16.7-e).</param>
public readonly record struct ResolvedToolAnnotationHints(
  bool ReadOnlyHint,
  bool DestructiveHint,
  bool IdempotentHint,
  bool OpenWorldHint);

/// <summary>
/// The §16.7 untrusted-annotation surface: applies the spec defaults to absent hint fields and exposes
/// the fail-closed trust gate that guards safety decisions made on annotations from an untrusted
/// server.
/// </summary>
public static class ToolAnnotationRules
{
  /// <summary>The §16.7 default values for the four boolean annotation hints (R-16.7-b – R-16.7-e).</summary>
  public static ResolvedToolAnnotationHints Defaults { get; } =
    new(ReadOnlyHint: false, DestructiveHint: true, IdempotentHint: false, OpenWorldHint: true);

  /// <summary>
  /// Resolves the four boolean <see cref="ToolAnnotations"/> hints to concrete values, applying the
  /// §16.7 defaults for any absent field: <c>readOnlyHint ⇒ false</c>, <c>destructiveHint ⇒ true</c>,
  /// <c>idempotentHint ⇒ false</c>, <c>openWorldHint ⇒ true</c>. Note <c>destructiveHint</c> and
  /// <c>idempotentHint</c> are meaningful only when <c>readOnlyHint</c> is <c>false</c>.
  /// (R-16.7-b, R-16.7-c, R-16.7-d, R-16.7-e)
  /// </summary>
  /// <param name="annotations">The (possibly partial / absent) annotations object.</param>
  /// <returns>The resolved hints with defaults applied.</returns>
  public static ResolvedToolAnnotationHints Resolve(ToolAnnotations? annotations) => new(
    ReadOnlyHint: annotations?.ReadOnlyHint ?? Defaults.ReadOnlyHint,
    DestructiveHint: annotations?.DestructiveHint ?? Defaults.DestructiveHint,
    IdempotentHint: annotations?.IdempotentHint ?? Defaults.IdempotentHint,
    OpenWorldHint: annotations?.OpenWorldHint ?? Defaults.OpenWorldHint);

  /// <summary>
  /// The untrusted-annotations rule: a client MUST treat tool annotations as untrusted and MUST NOT
  /// make tool-use or safety decisions based on annotations received from a server it does not trust.
  /// Returns <c>true</c> ONLY when the server is explicitly trusted, so a caller gating a safety
  /// decision on annotations fails closed for any untrusted server. (§16.7, R-16.7-f, R-16.7-g)
  /// </summary>
  /// <param name="serverIsTrusted">Whether the application trusts the server that sent the annotations (default <c>false</c>, fail closed).</param>
  /// <returns><c>true</c> only when the server is explicitly trusted.</returns>
  public static bool MayTrustToolAnnotations(bool serverIsTrusted = false) => serverIsTrusted;
}
