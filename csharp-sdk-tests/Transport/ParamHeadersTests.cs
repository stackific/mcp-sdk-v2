using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Transport.Http;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Unit tests for <see cref="ParamHeaders"/> — the <c>x-mcp-header</c> annotation system (spec §9.5.1/2/4),
/// mirroring the TypeScript SDK's <c>http.test.ts</c> AC-14.20…AC-14.33: annotation collection and
/// validity (name grammar, <c>number</c> rejection, case-insensitive uniqueness, nesting), tool
/// filtering, client emission (<c>buildParamHeaders</c>), and receiver validation
/// (<c>validateParamHeaders</c>) including the numeric integer comparison — every mismatch yielding the
/// <c>-32001</c> HeaderMismatch error.
/// </summary>
public sealed class ParamHeadersTests
{
  private static JsonNode Schema(string json) => JsonNode.Parse(json)!;

  /// <summary>Builds a case-insensitive header accessor over a literal name/value set.</summary>
  private static Func<string, string?> Headers(params (string Name, string Value)[] entries)
  {
    var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    foreach (var (name, value) in entries) map[name] = value;
    return name => map.TryGetValue(name, out var value) ? value : null;
  }

  // ─── AC-14.20 — client builds Mcp-Param-* from an annotated schema ──────────────

  [Fact]
  public void Builds_a_param_header_from_an_annotated_schema()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    var headers = ParamHeaders.BuildParamHeaders(schema, new JsonObject { ["region"] = "us-west1" });
    Assert.Equal("us-west1", headers["Mcp-Param-Region"]);
  }

  // ─── AC-14.21 — x-mcp-header name validity (R-9.5.1-a/b/c/d) ────────────────────

  [Fact]
  public void Rejects_an_empty_header_name()
  {
    var schema = Schema("""{"type":"object","properties":{"a":{"type":"string","x-mcp-header":""}}}""");
    Assert.False(ParamHeaders.ValidateToolXMcpHeaders(schema).Valid);
  }

  [Fact]
  public void Rejects_a_non_tchar_header_name()
  {
    var schema = Schema("""{"type":"object","properties":{"a":{"type":"string","x-mcp-header":"bad name"}}}""");
    Assert.False(ParamHeaders.ValidateToolXMcpHeaders(schema).Valid);
  }

  [Fact]
  public void Rejects_a_header_name_with_cr_lf()
  {
    var schema = Schema("""{"type":"object","properties":{"a":{"type":"string","x-mcp-header":"a\r\nb"}}}""");
    Assert.False(ParamHeaders.ValidateToolXMcpHeaders(schema).Valid);
  }

  [Fact]
  public void Rejects_case_insensitive_duplicate_header_names()
  {
    var schema = Schema("""
      {"type":"object","properties":{
        "a":{"type":"string","x-mcp-header":"Region"},
        "b":{"type":"string","x-mcp-header":"region"}}}
      """);
    Assert.False(ParamHeaders.ValidateToolXMcpHeaders(schema).Valid);
  }

  [Fact]
  public void Accepts_a_valid_distinct_pair()
  {
    var schema = Schema("""
      {"type":"object","properties":{
        "a":{"type":"string","x-mcp-header":"Region"},
        "b":{"type":"string","x-mcp-header":"Zone"}}}
      """);
    Assert.True(ParamHeaders.ValidateToolXMcpHeaders(schema).Valid);
  }

  // ─── AC-14.22 — annotated type & nesting (R-9.5.1-e/f/h) ────────────────────────

  [Theory]
  [InlineData("integer")]
  [InlineData("string")]
  [InlineData("boolean")]
  public void Honors_integer_string_boolean_annotated_types(string type)
  {
    var schema = Schema("{\"type\":\"object\",\"properties\":{\"a\":{\"type\":\"" + type + "\",\"x-mcp-header\":\"A\"}}}");
    Assert.True(ParamHeaders.ValidateToolXMcpHeaders(schema).Valid);
  }

  /// <summary>R-9.5.1-f: a <c>number</c>-typed parameter MUST NOT carry the annotation.</summary>
  [Fact]
  public void Rejects_a_number_typed_annotation()
  {
    var schema = Schema("""{"type":"object","properties":{"a":{"type":"number","x-mcp-header":"A"}}}""");
    var result = ParamHeaders.ValidateToolXMcpHeaders(schema);
    Assert.False(result.Valid);
    Assert.Contains("number", result.Reason);
  }

  [Fact]
  public void Accepts_an_annotation_on_a_nested_property()
  {
    var schema = Schema("""
      {"type":"object","properties":{
        "outer":{"type":"object","properties":{
          "inner":{"type":"integer","x-mcp-header":"Inner"}}}}}
      """);
    Assert.True(ParamHeaders.ValidateToolXMcpHeaders(schema).Valid);
  }

  // ─── AC-14.23 — invalid-tool filtering (R-9.5.1-i/j/k) ──────────────────────────

  [Fact]
  public void Filters_out_only_the_invalid_tool_and_warns()
  {
    var good = ("good", Schema("""{"type":"object","properties":{"r":{"type":"string","x-mcp-header":"R"}}}"""));
    var bad = ("bad", Schema("""{"type":"object","properties":{"n":{"type":"number","x-mcp-header":"N"}}}"""));
    var tools = new[] { good, bad };

    var result = ParamHeaders.FilterValidTools(tools, t => t.Item1, t => t.Item2);

    Assert.Equal(["good"], result.Tools.Select(t => t.Item1));
    var warning = Assert.Single(result.Warnings);
    Assert.Equal("bad", warning.Tool);
    Assert.Contains("N", warning.Reason);
  }

  // ─── AC-14.24/AC-14.25 — emission + server validation ──────────────────────────

  [Fact]
  public void Appends_one_param_header_per_annotated_parameter_present()
  {
    var schema = Schema("""
      {"type":"object","properties":{
        "region":{"type":"string","x-mcp-header":"Region"},
        "query":{"type":"string"}}}
      """);
    var headers = ParamHeaders.BuildParamHeaders(schema, new JsonObject { ["region"] = "us-west1", ["query"] = "SELECT 1" });
    var pair = Assert.Single(headers);
    Assert.Equal("Mcp-Param-Region", pair.Key);
    Assert.Equal("us-west1", pair.Value);
  }

  [Fact]
  public void Server_validates_a_matching_header()
  {
    var schema = Schema("""
      {"type":"object","properties":{
        "region":{"type":"string","x-mcp-header":"Region"},
        "query":{"type":"string"}}}
      """);
    var error = ParamHeaders.ValidateParamHeaders(
      schema,
      new JsonObject { ["region"] = "us-west1", ["query"] = "SELECT 1" },
      Headers(("Mcp-Param-Region", "us-west1")));
    Assert.Null(error);
  }

  // ─── AC-14.26 — null/absent annotated values omit the header ────────────────────

  [Fact]
  public void A_null_value_omits_the_header_and_the_server_does_not_expect_it()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    Assert.Empty(ParamHeaders.BuildParamHeaders(schema, new JsonObject { ["region"] = null }));
    Assert.Null(ParamHeaders.ValidateParamHeaders(schema, new JsonObject { ["region"] = null }, Headers()));
  }

  [Fact]
  public void An_absent_value_omits_the_header_and_the_server_does_not_expect_it()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    Assert.Empty(ParamHeaders.BuildParamHeaders(schema, new JsonObject()));
    Assert.Null(ParamHeaders.ValidateParamHeaders(schema, new JsonObject(), Headers()));
  }

  // ─── AC-14.27 — body present but header omitted → -32001 (R-9.5.2-k) ────────────

  [Fact]
  public void Omitted_header_for_a_present_body_value_is_rejected_minus_32001()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    var error = ParamHeaders.ValidateParamHeaders(schema, new JsonObject { ["region"] = "us-west1" }, Headers());
    Assert.NotNull(error);
    Assert.Equal(ErrorCodes.HeaderMismatch, error!.Code);
  }

  /// <summary>A header present while the body value is absent is also a -32001 mismatch.</summary>
  [Fact]
  public void Header_present_without_a_body_value_is_rejected_minus_32001()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    var error = ParamHeaders.ValidateParamHeaders(schema, new JsonObject(), Headers(("Mcp-Param-Region", "us-west1")));
    Assert.NotNull(error);
    Assert.Equal(ErrorCodes.HeaderMismatch, error!.Code);
  }

  // ─── AC-14.28 — stale/absent schema strategy (R-9.5.2-l) ────────────────────────

  [Fact]
  public void With_no_schema_no_custom_param_headers_are_emitted()
  {
    Assert.Empty(ParamHeaders.BuildParamHeaders(null, new JsonObject { ["region"] = "us-west1" }));
  }

  // ─── AC-14.31 — Mcp-Param-* family recognition (R-9.5.4-a) ──────────────────────

  [Theory]
  [InlineData("Mcp-Param-Region", true)]
  [InlineData("mcp-param-region", true)]
  [InlineData("Mcp-Method", false)]
  public void Recognizes_the_param_header_family_case_insensitively(string name, bool expected)
  {
    Assert.Equal(expected, ParamHeaders.IsParamHeader(name));
  }

  // ─── AC-14.32 — receiver rejects impermissible/mismatched headers (R-9.5.4-b/c) ─

  /// <summary>R-9.5.4-b: a raw non-ASCII (non-sentinel) header value is impermissible → -32001.</summary>
  [Fact]
  public void Rejects_impermissible_characters_minus_32001()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    var error = ParamHeaders.ValidateParamHeaders(
      schema, new JsonObject { ["region"] = "x" }, Headers(("Mcp-Param-Region", "café")));
    Assert.NotNull(error);
    Assert.Equal(ErrorCodes.HeaderMismatch, error!.Code);
  }

  /// <summary>R-9.5.4-c: a decoded value that disagrees with the body → -32001.</summary>
  [Fact]
  public void Rejects_a_value_that_does_not_match_the_body_minus_32001()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    var error = ParamHeaders.ValidateParamHeaders(
      schema, new JsonObject { ["region"] = "us-west1" }, Headers(("Mcp-Param-Region", "eu-central1")));
    Assert.NotNull(error);
    Assert.Equal(ErrorCodes.HeaderMismatch, error!.Code);
  }

  /// <summary>A sentinel-encoded non-ASCII header that matches the body is accepted.</summary>
  [Fact]
  public void Accepts_a_sentinel_encoded_value_that_matches_the_body()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    var encoded = ParamEncoding.EncodeHeaderValue("Tōkyō");
    var error = ParamHeaders.ValidateParamHeaders(
      schema, new JsonObject { ["region"] = "Tōkyō" }, Headers(("Mcp-Param-Region", encoded)));
    Assert.Null(error);
  }

  // ─── AC-14.33 — integer header compared numerically (R-9.5.4-d) ─────────────────

  [Fact]
  public void Integer_header_42_point_0_matches_body_42()
  {
    var schema = Schema("""{"type":"object","properties":{"limit":{"type":"integer","x-mcp-header":"Limit"}}}""");
    Assert.Null(ParamHeaders.ValidateParamHeaders(
      schema, new JsonObject { ["limit"] = 42 }, Headers(("Mcp-Param-Limit", "42.0"))));
  }

  [Fact]
  public void Integer_header_43_does_not_match_body_42()
  {
    var schema = Schema("""{"type":"object","properties":{"limit":{"type":"integer","x-mcp-header":"Limit"}}}""");
    var error = ParamHeaders.ValidateParamHeaders(
      schema, new JsonObject { ["limit"] = 42 }, Headers(("Mcp-Param-Limit", "43")));
    Assert.NotNull(error);
    Assert.Equal(ErrorCodes.HeaderMismatch, error!.Code);
  }

  // ─── Boolean & nested-path emission/validation ─────────────────────────────────

  [Fact]
  public void Emits_and_validates_a_boolean_param()
  {
    var schema = Schema("""{"type":"object","properties":{"dry":{"type":"boolean","x-mcp-header":"Dry"}}}""");
    var headers = ParamHeaders.BuildParamHeaders(schema, new JsonObject { ["dry"] = true });
    Assert.Equal("true", headers["Mcp-Param-Dry"]);
    Assert.Null(ParamHeaders.ValidateParamHeaders(schema, new JsonObject { ["dry"] = true }, Headers(("Mcp-Param-Dry", "true"))));
  }

  [Fact]
  public void Emits_and_validates_a_nested_param()
  {
    var schema = Schema("""
      {"type":"object","properties":{
        "outer":{"type":"object","properties":{
          "region":{"type":"string","x-mcp-header":"Region"}}}}}
      """);
    var args = new JsonObject { ["outer"] = new JsonObject { ["region"] = "us-west1" } };
    var headers = ParamHeaders.BuildParamHeaders(schema, args);
    Assert.Equal("us-west1", headers["Mcp-Param-Region"]);
    Assert.Null(ParamHeaders.ValidateParamHeaders(schema, args, Headers(("Mcp-Param-Region", "us-west1"))));
  }

  /// <summary>An annotation under an array <c>items</c> subschema has no single resolvable value, so it is skipped.</summary>
  [Fact]
  public void Skips_an_annotation_under_an_array_items_subschema()
  {
    var schema = Schema("""
      {"type":"object","properties":{
        "tags":{"type":"array","items":{"type":"string","x-mcp-header":"Tag"}}}}
      """);
    Assert.Empty(ParamHeaders.BuildParamHeaders(schema, new JsonObject { ["tags"] = new JsonArray("a", "b") }));
    Assert.Null(ParamHeaders.ValidateParamHeaders(schema, new JsonObject { ["tags"] = new JsonArray("a", "b") }, Headers()));
  }

  /// <summary>The self-collision case end-to-end: a literal sentinel-looking arg round-trips through emission + validation.</summary>
  [Fact]
  public void Self_collision_literal_round_trips_through_emission_and_validation()
  {
    var schema = Schema("""{"type":"object","properties":{"region":{"type":"string","x-mcp-header":"Region"}}}""");
    const string literal = "=?base64?abc?=";
    var headers = ParamHeaders.BuildParamHeaders(schema, new JsonObject { ["region"] = literal });
    var encoded = headers["Mcp-Param-Region"];
    Assert.NotEqual(literal, encoded); // re-encoded, not passed through verbatim

    Assert.Null(ParamHeaders.ValidateParamHeaders(
      schema, new JsonObject { ["region"] = literal }, Headers(("Mcp-Param-Region", encoded))));
  }
}
