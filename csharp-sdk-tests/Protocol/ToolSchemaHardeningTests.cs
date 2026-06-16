using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for the §16.4 JSON-Schema hardening gate, the §16.4 value validation (a real 2020-12
/// validator, not a 3-rule subset), and the §16.7 tool-annotation defaults / fail-closed trust gate.
/// Mirrors the TypeScript SDK's <c>tools.test.ts</c> (AC-24.30 – AC-24.38) and
/// <c>tools-value-validation.test.ts</c> scenarios.
/// </summary>
public sealed class ToolSchemaHardeningTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  // ─── In-document vs external $ref (R-16.4-f, R-16.4-g) ───────────────────────────────────────

  [Theory]
  [InlineData("#", true)]
  [InlineData("#/$defs/Foo", true)]
  [InlineData("#anchor", true)]
  [InlineData("https://evil.example/schema.json", false)]
  [InlineData("./other.json#/Foo", false)]
  [InlineData("other.json", false)]
  public void IsInDocumentRef_distinguishes_local_from_external(string reference, bool expected)
  {
    Assert.Equal(expected, ToolSchemas.IsInDocumentRef(reference));
  }

  [Fact]
  public void HasExternalRef_true_only_for_non_local_refs()
  {
    Assert.False(ToolSchemas.HasExternalRef(Obj("""{"type":"object","properties":{"a":{"$ref":"#/$defs/A"}}}""")));
    Assert.True(ToolSchemas.HasExternalRef(Obj("""{"type":"object","properties":{"a":{"$ref":"https://evil/x"}}}""")));
    Assert.True(ToolSchemas.HasExternalRef(Obj("""{"type":"object","$dynamicRef":"https://evil/x"}""")));
  }

  [Fact]
  public void ValidateToolSchema_rejects_external_ref_by_default()
  {
    var schema = Obj("""{"type":"object","properties":{"a":{"$ref":"https://evil/x"}}}""");
    var result = ToolSchemas.ValidateToolSchema(schema, ToolSchemaRole.Input);
    Assert.False(result.Ok);
    Assert.Contains("$ref", result.Reason);
  }

  [Fact]
  public void ValidateToolSchema_allows_external_ref_when_opted_in()
  {
    var schema = Obj("""{"type":"object","properties":{"a":{"$ref":"https://evil/x"}}}""");
    Assert.True(ToolSchemas.ValidateToolSchema(schema, ToolSchemaRole.Input, allowExternalRefs: true).Ok);
  }

  [Fact]
  public void ValidateToolSchema_allows_in_document_ref()
  {
    var schema = Obj("""{"type":"object","$defs":{"A":{"type":"string"}},"properties":{"a":{"$ref":"#/$defs/A"}}}""");
    Assert.True(ToolSchemas.ValidateToolSchema(schema, ToolSchemaRole.Input).Ok);
  }

  [Fact]
  public void AssertRegistrableToolSchema_throws_on_external_ref()
  {
    var schema = Obj("""{"type":"object","properties":{"a":{"$ref":"https://evil/x"}}}""");
    Assert.Throws<ArgumentException>(() => ToolSchemas.AssertRegistrableToolSchema(schema, ToolSchemaRole.Input));
  }

  // ─── Depth / node bounds (R-16.4-l, R-16.4-m) ────────────────────────────────────────────────

  [Fact]
  public void Default_limits_are_positive()
  {
    Assert.True(SchemaLimits.Default.MaxDepth > 0);
    Assert.True(SchemaLimits.Default.MaxNodes > 0);
  }

  [Fact]
  public void SchemaNestingDepth_counts_object_array_nesting()
  {
    Assert.Equal(1, ToolSchemas.SchemaNestingDepth(Obj("""{"type":"object"}""")));
    Assert.True(ToolSchemas.SchemaNestingDepth(Obj("""{"type":"object","properties":{"x":{"type":"object"}}}""")) > 1);
  }

  [Fact]
  public void ValidateToolSchema_rejects_a_schema_deeper_than_the_limit()
  {
    JsonObject deep = Obj("""{"type":"object"}""");
    for (var i = 0; i < SchemaLimits.Default.MaxDepth + 10; i++)
    {
      deep = new JsonObject { ["type"] = "object", ["properties"] = new JsonObject { ["x"] = deep } };
    }

    Assert.False(ToolSchemas.ValidateToolSchema(deep, ToolSchemaRole.Input).Ok);
  }

  [Fact]
  public void ValidateToolSchema_rejects_a_schema_with_too_many_nodes()
  {
    var props = new JsonObject();
    for (var i = 0; i < 10; i++) props[$"p{i}"] = new JsonObject { ["type"] = "string" };
    var schema = new JsonObject { ["type"] = "object", ["properties"] = props };
    Assert.False(ToolSchemas.ValidateToolSchema(schema, ToolSchemaRole.Input, new SchemaLimits(64, 2)).Ok);
  }

  // ─── Unsafe schemas (R-16.4-n) ───────────────────────────────────────────────────────────────

  [Fact]
  public void ValidateToolSchema_rejects_null_array_and_scalar()
  {
    Assert.False(ToolSchemas.ValidateToolSchema(null, ToolSchemaRole.Input).Ok);
    Assert.False(ToolSchemas.ValidateToolSchema(new JsonArray(), ToolSchemaRole.Input).Ok);
    Assert.False(ToolSchemas.ValidateToolSchema(JsonValue.Create(42), ToolSchemaRole.Input).Ok);
  }

  [Fact]
  public void AssertRegistrableToolSchema_throws_on_null_schema()
  {
    Assert.Throws<ArgumentException>(() => ToolSchemas.AssertRegistrableToolSchema(null, ToolSchemaRole.Input));
  }

  // ─── Root-type rule (R-16.4-d, R-16.4-e) ─────────────────────────────────────────────────────

  [Fact]
  public void Input_schema_root_must_be_object()
  {
    Assert.True(ToolSchemas.ValidateToolSchema(Obj("""{"type":"object"}"""), ToolSchemaRole.Input).Ok);
    Assert.False(ToolSchemas.ValidateToolSchema(Obj("""{"type":"array"}"""), ToolSchemaRole.Input).Ok);
    Assert.Throws<ArgumentException>(() =>
      ToolSchemas.AssertRegistrableToolSchema(Obj("""{"type":"array"}"""), ToolSchemaRole.Input));
  }

  [Theory]
  [InlineData("""{"type":"array"}""")]
  [InlineData("""{"type":"string"}""")]
  [InlineData("""{"type":"number"}""")]
  public void Output_schema_root_type_is_unrestricted(string json)
  {
    Assert.True(ToolSchemas.ValidateToolSchema(Obj(json), ToolSchemaRole.Output).Ok);
  }

  // ─── Dialect support (R-16.4-a, R-16.4-s, R-16.4-t) ──────────────────────────────────────────

  [Fact]
  public void Default_dialect_is_2020_12_when_no_schema_keyword()
  {
    Assert.Equal(ToolSchemas.DefaultSchemaDialect, ToolSchemas.SchemaDialect(Obj("""{"type":"object"}""")));
    Assert.True(ToolSchemas.IsSupportedSchemaDialect(ToolSchemas.DefaultSchemaDialect));
  }

  [Fact]
  public void Unsupported_dialect_is_rejected_not_treated_as_permissive()
  {
    var unsupported = Obj("""{"$schema":"https://json-schema.org/draft-04/schema#","type":"object"}""");
    var result = ToolSchemas.ValidateToolSchema(unsupported, ToolSchemaRole.Input);
    Assert.False(result.Ok);
    Assert.Contains("dialect", result.Reason);
    Assert.Throws<UnsupportedDialectException>(() =>
      ToolSchemas.AssertRegistrableToolSchema(unsupported, ToolSchemaRole.Input));
  }

  [Fact]
  public void Supported_dialect_set_includes_2020_12()
  {
    Assert.Contains(ToolSchemas.DefaultSchemaDialect, ToolSchemas.SupportedSchemaDialects);
  }

  [Fact]
  public void Only_2020_12_dialect_is_supported_and_documented()
  {
    // §16.4(9) / R-16.4-u: the supported set is EXACTLY the two 2020-12 spellings — nothing beyond it.
    Assert.Equal(
      new HashSet<string>(StringComparer.Ordinal)
      {
        "https://json-schema.org/draft/2020-12/schema",
        "https://json-schema.org/draft/2020-12/schema#",
      },
      ToolSchemas.SupportedSchemaDialects);
    Assert.False(ToolSchemas.IsSupportedSchemaDialect("http://json-schema.org/draft-07/schema#"));
    Assert.False(ToolSchemas.IsSupportedSchemaDialect("https://json-schema.org/draft/2019-09/schema"));
  }

  // ─── Value validation against inputSchema (R-16.4-o) ─────────────────────────────────────────

  private static readonly JsonObject StringLocationSchema = JsonNode.Parse(
    """{"type":"object","properties":{"location":{"type":"string"}},"required":["location"],"additionalProperties":false}""")!.AsObject();

  [Fact]
  public void ValidateToolArguments_rejects_wrong_type()
  {
    var result = ToolSchemas.ValidateToolArguments(StringLocationSchema, Obj("""{"location":42}"""));
    Assert.False(result.Valid);
  }

  [Fact]
  public void ValidateToolArguments_accepts_conforming()
  {
    Assert.True(ToolSchemas.ValidateToolArguments(StringLocationSchema, Obj("""{"location":"New York"}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_rejects_missing_required()
  {
    Assert.False(ToolSchemas.ValidateToolArguments(StringLocationSchema, Obj("""{}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_rejects_unexpected_property_under_additional_properties_false()
  {
    Assert.False(ToolSchemas.ValidateToolArguments(StringLocationSchema, Obj("""{"location":"NYC","extra":1}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_validates_nested_object_and_array_item_schemas()
  {
    var schema = Obj("""{"type":"object","properties":{"items":{"type":"array","items":{"type":"integer"}}}}""");
    Assert.True(ToolSchemas.ValidateToolArguments(schema, Obj("""{"items":[1,2,3]}""")).Valid);
    Assert.False(ToolSchemas.ValidateToolArguments(schema, Obj("""{"items":[1,"two"]}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_enforces_numeric_bounds()
  {
    var schema = Obj("""{"type":"object","properties":{"n":{"type":"number","minimum":0,"maximum":10}}}""");
    Assert.True(ToolSchemas.ValidateToolArguments(schema, Obj("""{"n":5}""")).Valid);
    Assert.False(ToolSchemas.ValidateToolArguments(schema, Obj("""{"n":42}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_enforces_string_length_and_pattern()
  {
    var schema = Obj("""{"type":"object","properties":{"s":{"type":"string","minLength":2,"pattern":"^a"}}}""");
    Assert.True(ToolSchemas.ValidateToolArguments(schema, Obj("""{"s":"abc"}""")).Valid);
    Assert.False(ToolSchemas.ValidateToolArguments(schema, Obj("""{"s":"x"}""")).Valid);
    Assert.False(ToolSchemas.ValidateToolArguments(schema, Obj("""{"s":"bcd"}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_enforces_composition_one_of()
  {
    var schema = Obj("""{"type":"object","properties":{"x":{"oneOf":[{"type":"string"},{"type":"integer"}]}}}""");
    Assert.True(ToolSchemas.ValidateToolArguments(schema, Obj("""{"x":"s"}""")).Valid);
    Assert.True(ToolSchemas.ValidateToolArguments(schema, Obj("""{"x":1}""")).Valid);
    Assert.False(ToolSchemas.ValidateToolArguments(schema, Obj("""{"x":true}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_rejects_null_for_typed_property()
  {
    // A real 2020-12 validator rejects null for a type:string property — unlike the previous 3-rule
    // hand-roll, which silently skipped null values. This is the corrected, TS-conformant behavior.
    var schema = Obj("""{"type":"object","properties":{"x":{"type":"string"}}}""");
    Assert.False(ToolSchemas.ValidateToolArguments(schema, Obj("""{"x":null}""")).Valid);
  }

  [Fact]
  public void ValidateToolArguments_tolerates_unknown_mcp_annotation_keywords()
  {
    var schema = Obj("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}},"required":["region"]}""");
    Assert.True(ToolSchemas.ValidateToolArguments(schema, Obj("""{"region":"us-west1"}""")).Valid);
    Assert.False(ToolSchemas.ValidateToolArguments(schema, Obj("""{"region":9}""")).Valid);
  }

  // ─── Value validation against outputSchema (R-16.4-p) ────────────────────────────────────────

  [Fact]
  public void ValidateToolStructuredContent_is_valid_when_no_output_schema()
  {
    Assert.True(ToolSchemas.ValidateToolStructuredContent(null, Obj("""{"anything":true}""")).Valid);
  }

  [Fact]
  public void ValidateToolStructuredContent_accepts_conforming_and_rejects_non_conforming()
  {
    var outputSchema = Obj("""{"type":"object","properties":{"rows":{"type":"integer"}},"required":["rows"]}""");
    Assert.True(ToolSchemas.ValidateToolStructuredContent(outputSchema, Obj("""{"rows":3}""")).Valid);
    Assert.False(ToolSchemas.ValidateToolStructuredContent(outputSchema, Obj("""{"rows":"three"}""")).Valid);
  }

  // ─── ValidateValueAgainstSchema refusals (never throws) ──────────────────────────────────────

  [Fact]
  public void ValidateValueAgainstSchema_refuses_non_object_schema()
  {
    Assert.False(ToolSchemas.ValidateValueAgainstSchema(null, Obj("""{}""")).Valid);
    Assert.False(ToolSchemas.ValidateValueAgainstSchema(JsonValue.Create("nope"), Obj("""{}""")).Valid);
  }

  [Fact]
  public void ValidateValueAgainstSchema_refuses_unsupported_dialect()
  {
    var schema = Obj("""{"$schema":"https://json-schema.org/draft-04/schema#","type":"string"}""");
    var result = ToolSchemas.ValidateValueAgainstSchema(schema, JsonValue.Create(42));
    Assert.False(result.Valid);
    Assert.Contains("dialect", string.Join(" ", result.Errors));
  }

  // ─── Tool name conventions (R-16.3-b – R-16.3-e) ─────────────────────────────────────────────

  [Theory]
  [InlineData("add", true)]
  [InlineData("get_weather", true)]
  [InlineData("namespace.tool", true)]
  [InlineData("UPPER", true)]
  [InlineData("with space", false)]
  [InlineData("with,comma", false)]
  [InlineData("", false)]
  public void IsConventional_validates_name(string name, bool expected)
  {
    Assert.Equal(expected, ToolNames.IsConventional(name));
  }

  [Fact]
  public void DisplayName_applies_title_precedence()
  {
    Assert.Equal("Pretty", ToolNames.DisplayName(new Tool
    {
      Name = "t",
      Title = "Pretty",
      InputSchema = Obj("""{"type":"object"}"""),
      Annotations = new ToolAnnotations { Title = "Ann" },
    }));
    Assert.Equal("Ann", ToolNames.DisplayName(new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      Annotations = new ToolAnnotations { Title = "Ann" },
    }));
    Assert.Equal("t", ToolNames.DisplayName(new Tool { Name = "t", InputSchema = Obj("""{"type":"object"}""") }));
  }

  [Fact]
  public void FindDuplicates_reports_collisions()
  {
    var tools = new[]
    {
      new Tool { Name = "a", InputSchema = Obj("""{"type":"object"}""") },
      new Tool { Name = "b", InputSchema = Obj("""{"type":"object"}""") },
      new Tool { Name = "a", InputSchema = Obj("""{"type":"object"}""") },
    };
    Assert.Equal(new[] { "a" }, ToolNames.FindDuplicates(tools));
  }

  [Fact]
  public void Disambiguate_prefixes_server_id()
  {
    Assert.Equal("srv.tool", ToolNames.Disambiguate("srv", "tool"));
  }

  // ─── Annotation defaults & trust gate (§16.7) ────────────────────────────────────────────────

  [Fact]
  public void ResolveToolAnnotationHints_applies_spec_defaults()
  {
    var resolved = ToolAnnotationRules.Resolve(null);
    Assert.False(resolved.ReadOnlyHint);
    Assert.True(resolved.DestructiveHint);
    Assert.False(resolved.IdempotentHint);
    Assert.True(resolved.OpenWorldHint);
  }

  [Fact]
  public void ResolveToolAnnotationHints_keeps_supplied_values()
  {
    var resolved = ToolAnnotationRules.Resolve(new ToolAnnotations
    {
      ReadOnlyHint = true,
      DestructiveHint = false,
      IdempotentHint = true,
      OpenWorldHint = false,
    });
    Assert.True(resolved.ReadOnlyHint);
    Assert.False(resolved.DestructiveHint);
    Assert.True(resolved.IdempotentHint);
    Assert.False(resolved.OpenWorldHint);
  }

  [Fact]
  public void MayTrustToolAnnotations_fails_closed_for_untrusted()
  {
    Assert.False(ToolAnnotationRules.MayTrustToolAnnotations());
    Assert.False(ToolAnnotationRules.MayTrustToolAnnotations(false));
    Assert.True(ToolAnnotationRules.MayTrustToolAnnotations(true));
  }
}
