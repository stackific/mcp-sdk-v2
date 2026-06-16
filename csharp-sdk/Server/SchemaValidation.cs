using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;

using Json.Schema;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Server;

/// <summary>
/// Full JSON Schema 2020-12 validation of <c>tools/call</c> arguments against a tool's
/// <c>inputSchema</c> and of a tool result's <c>structuredContent</c> against its <c>outputSchema</c>
/// (spec §16.4, R-16.4-o, R-16.4-p, R-16.5-o). Replaces the earlier three-rule hand-rolled checker
/// with a conformant validator (the json-everything <c>JsonSchema.Net</c> engine) so nested objects,
/// array item schemas, numeric/length/pattern/format bounds, composition (<c>oneOf</c>/<c>anyOf</c>/
/// <c>allOf</c>), <c>const</c>/<c>enum</c>, <c>additionalProperties</c>, and proper <c>null</c>-typed
/// handling are all enforced exactly as the spec's Ajv-backed TypeScript path does.
/// </summary>
/// <remarks>
/// <para>
/// On <see cref="ConfigureValidator"/> (invoked once at module init) the engine is wired into the
/// protocol-layer <see cref="ToolSchemas.ConfigureValueValidator"/> hook, so
/// <see cref="ToolSchemas.ValidateValueAgainstSchema"/> and friends route here without the protocol
/// layer taking a compile-time dependency on the engine.
/// </para>
/// <para>
/// Hardening: a schema is registered only after passing
/// <see cref="ToolSchemas.AssertRegistrableToolSchema"/> (depth/node bounds + external-<c>$ref</c>
/// rejection + dialect check), so the validator never compiles an unbounded or SSRF-prone schema.
/// The validator additionally refuses (never throws) when a schema fails to compile.
/// </para>
/// </remarks>
internal static class SchemaValidation
{
  /// <summary>
  /// The 2020-12 evaluation options: validate against the Draft 2020-12 dialect and collect a flat
  /// list of errors. <c>RequireFormatValidation</c> is left <c>false</c> to mirror the TypeScript
  /// SDK's Ajv configuration (<c>new Ajv2020({ strict: false, allErrors: true })</c>), which treats
  /// <c>format</c> as an annotation rather than an assertion — so the two SDKs accept the same values.
  /// Unknown (e.g. MCP annotation) keywords are tolerated by the engine rather than throwing.
  /// </summary>
  private static readonly EvaluationOptions Options = new()
  {
    EvaluateAs = SpecVersion.Draft202012,
    OutputFormat = OutputFormat.List,
    RequireFormatValidation = false,
  };

  /// <summary>
  /// A compiled-schema cache keyed by the schema's canonical JSON text. Tool schemas are stable for
  /// the lifetime of a server, so caching avoids recompiling the same schema on every call. Bounded
  /// implicitly by the (small, registration-time-validated) set of distinct tool schemas.
  /// </summary>
  private static readonly ConcurrentDictionary<string, JsonSchema?> Cache = new(StringComparer.Ordinal);

  /// <summary>
  /// Installs this engine as the protocol layer's JSON Schema value validator at assembly load, so any
  /// value validation routed through <see cref="ToolSchemas.ValidateValueAgainstSchema"/> uses the real
  /// 2020-12 engine. A module initializer is used (rather than a lazily-triggered static constructor)
  /// so the wiring is deterministic regardless of which type the caller touches first.
  /// </summary>
  // CA2255: a module initializer is the deliberate, idiomatic way to wire this internal SDK validator
  // deterministically at load — there is no public surface or consumer-visible side effect (it only
  // installs the real 2020-12 engine behind the protocol layer's value-validation seam), so the rule's
  // "library code surprises consumers" concern does not apply here.
#pragma warning disable CA2255
  [ModuleInitializer]
  internal static void ConfigureValidator() =>
    ToolSchemas.ConfigureValueValidator(ValidateValue);
#pragma warning restore CA2255

  /// <summary>
  /// Validates a JSON <paramref name="value"/> against a 2020-12 <paramref name="schema"/>. Never
  /// throws: a schema that cannot be compiled yields an invalid result (mirroring the TS refusal to
  /// treat such a schema as permissive). (R-16.4-o, R-16.4-p)
  /// </summary>
  private static SchemaValueValidation ValidateValue(JsonObject schema, JsonNode? value)
  {
    var compiled = Compile(schema);
    if (compiled is null)
    {
      return SchemaValueValidation.Failure(["schema could not be compiled as JSON Schema 2020-12"]);
    }

    EvaluationResults results;
    try
    {
      results = compiled.Evaluate(value, Options);
    }
    catch (Exception ex)
    {
      // A pathological schema (e.g. an unresolvable in-document $ref) can throw during evaluation;
      // treat that as non-conformance rather than crashing the request.
      return SchemaValueValidation.Failure([ex.Message]);
    }

    if (results.IsValid)
    {
      return SchemaValueValidation.Success;
    }

    return SchemaValueValidation.Failure(CollectErrors(results));
  }

  /// <summary>Compiles (and caches) a schema object, returning <c>null</c> when compilation fails.</summary>
  private static JsonSchema? Compile(JsonObject schema)
  {
    var key = schema.ToJsonString();
    return Cache.GetOrAdd(key, static text =>
    {
      try
      {
        return JsonSchema.FromText(text);
      }
      catch
      {
        return null;
      }
    });
  }

  /// <summary>Flattens an evaluation tree into human-readable <c>&lt;instancePath&gt; message</c> strings.</summary>
  private static IReadOnlyList<string> CollectErrors(EvaluationResults results)
  {
    var messages = new List<string>();
    void Visit(EvaluationResults node)
    {
      if (node.HasErrors && node.Errors is not null)
      {
        var location = node.InstanceLocation.ToString();
        if (string.IsNullOrEmpty(location)) location = "<root>";
        foreach (var (_, message) in node.Errors)
        {
          messages.Add($"{location} {message}".Trim());
        }
      }

      if (node.HasDetails)
      {
        foreach (var child in node.Details) Visit(child);
      }
    }

    Visit(results);
    return messages.Count > 0 ? messages : ["value does not conform to schema"];
  }

  // ─── Server-facing entry points ─────────────────────────────────────────────────────────────

  /// <summary>
  /// Validates a <c>tools/call</c> <c>arguments</c> object against a tool's <c>inputSchema</c>,
  /// throwing <c>-32602</c> (Invalid params) when it does not conform — the canonical code for an
  /// argument-validation failure (§16.6, R-16.6-f). The tool MUST NOT be invoked when this throws.
  /// </summary>
  /// <param name="schema">The tool's input schema.</param>
  /// <param name="arguments">The supplied arguments object (defaulted to <c>{}</c> by the caller).</param>
  /// <param name="toolName">The tool name, echoed into <c>error.data</c>.</param>
  /// <exception cref="McpError">A <c>-32602</c> error when the arguments fail validation.</exception>
  public static void ValidateArguments(JsonObject schema, JsonObject arguments, string toolName)
  {
    var result = ToolSchemas.ValidateToolArguments(schema, arguments);
    if (!result.Valid)
    {
      var detail = result.Errors.Count > 0 ? $": {string.Join("; ", result.Errors)}" : string.Empty;
      throw McpError.InvalidParams(
        $"Invalid arguments for tool \"{toolName}\"{detail}",
        new JsonObject { ["toolName"] = toolName });
    }
  }

  /// <summary>
  /// Validates a tool result's <c>structuredContent</c> against the tool's <c>outputSchema</c>,
  /// throwing <c>-32603</c> (Internal error) when it does not conform. A non-conforming structured
  /// result is a server-side fault (the server emitted data that violates its own declared schema),
  /// not a caller error — hence the internal-error code. (§16.6, R-16.5-o, R-16.4-p)
  /// </summary>
  /// <param name="outputSchema">The tool's output schema, or <c>null</c> when none is declared.</param>
  /// <param name="structuredContent">The result's structured content (any JSON value), or <c>null</c> when absent.</param>
  /// <param name="toolName">The tool name, used in the error message.</param>
  /// <exception cref="McpError">A <c>-32603</c> error when the structured content fails validation.</exception>
  public static void ValidateStructuredContent(JsonObject? outputSchema, JsonNode? structuredContent, string toolName)
  {
    if (outputSchema is null) return;

    var result = ToolSchemas.ValidateToolStructuredContent(outputSchema, structuredContent);
    if (!result.Valid)
    {
      var detail = result.Errors.Count > 0 ? $": {string.Join("; ", result.Errors)}" : string.Empty;
      throw McpError.InternalError(
        $"Tool \"{toolName}\" produced structuredContent that does not conform to its outputSchema{detail}");
    }
  }
}
