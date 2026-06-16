using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for the RFC 3986 resource-URI and RFC 6570 URI-Template engine (spec §17.4): validation,
/// variable extraction, Level 1–4 expansion, and variable recovery via matching. Mirrors the
/// TypeScript SDK's <c>resources.test.ts</c> URI/template scenarios so the two SDKs accept and reject
/// the same strings.
/// </summary>
public sealed class UriTemplateTests
{
  // ─── isResourceUri (RFC 3986) ────────────────────────────────────────────────────────────────

  [Theory]
  [InlineData("file:///a")]
  [InlineData("https://h/p")]
  [InlineData("db://users/42")]
  [InlineData("urn:isbn:0451450523")]
  [InlineData("custom-scheme:thing")]
  [InlineData("docs://readme")]
  [InlineData("weather://oslo/current")]
  public void IsResourceUri_accepts_any_scheme(string uri)
  {
    Assert.True(UriTemplate.IsResourceUri(uri));
    Assert.True(Resources.IsResourceUri(uri));
  }

  [Theory]
  [InlineData("/project/README.md")] // relative, no scheme
  [InlineData("README.md")]           // relative, no scheme
  [InlineData("not a uri")]
  [InlineData("")]
  [InlineData(null)]
  public void IsResourceUri_rejects_scheme_less_or_empty(string? value)
  {
    Assert.False(UriTemplate.IsResourceUri(value));
  }

  [Theory]
  [InlineData("file:///x", "file")]
  [InlineData("HTTPS://h/p", "https")]
  [InlineData("Custom-App.v2://x", "custom-app.v2")]
  [InlineData("not a uri", null)]
  public void Scheme_extracts_lowercased_scheme(string value, string? expected)
  {
    Assert.Equal(expected, UriTemplate.Scheme(value));
  }

  // ─── isUriTemplate (RFC 6570 grammar) ────────────────────────────────────────────────────────

  [Theory]
  [InlineData("file:///{path}")]
  [InlineData("db://{table}/{id}")]
  [InlineData("https://api/{+base}/items{?q,page}")] // Level 2 (+) and Level 3 (?) operators
  [InlineData("x://{var:3}")]                          // prefix modifier
  [InlineData("y://{list*}")]                          // explode modifier
  [InlineData("weather://{city}/current")]
  [InlineData("file:///fixed/path")]                   // literal-only is a valid template
  public void IsUriTemplate_accepts_well_formed_templates(string template)
  {
    Assert.True(UriTemplate.IsUriTemplate(template));
    Assert.True(Resources.IsUriTemplate(template));
  }

  [Theory]
  [InlineData("db://{table")]   // unbalanced opener
  [InlineData("db://table}")]   // closer with no opener
  [InlineData("db://{}/x")]     // empty expression
  [InlineData("db://{ }")]      // illegal varname (space)
  [InlineData("db://{a{b}}")]   // nested opener
  [InlineData("")]               // empty string is not a template
  [InlineData("x://{var:}")]    // prefix modifier with no length
  [InlineData("x://{var:0}")]   // prefix length must be positive
  [InlineData("x://{+}")]       // operator with no variables
  public void IsUriTemplate_rejects_malformed_templates(string template)
  {
    Assert.False(UriTemplate.IsUriTemplate(template));
  }

  // ─── uriTemplateVariables ────────────────────────────────────────────────────────────────────

  [Fact]
  public void Variables_reports_names_in_first_seen_order()
  {
    Assert.Equal(new[] { "table", "id" }, UriTemplate.Variables("db://{table}/{id}"));
  }

  [Fact]
  public void Variables_strips_operators_and_modifiers()
  {
    Assert.Equal(new[] { "base", "q", "page" }, UriTemplate.Variables("https://api/{+base}/items{?q,page}"));
    Assert.Equal(new[] { "var", "list" }, UriTemplate.Variables("x://{var:3}/{list*}"));
  }

  [Fact]
  public void Variables_dedupes_repeated_names()
  {
    Assert.Equal(new[] { "id" }, UriTemplate.Variables("a://{id}/b/{id}"));
  }

  [Fact]
  public void Variables_yields_empty_for_a_literal_template()
  {
    Assert.Empty(UriTemplate.Variables("file:///fixed"));
  }

  // ─── Expansion (RFC 6570 Levels 1–4) ─────────────────────────────────────────────────────────

  [Fact]
  public void Expand_simple_level1_substitutes_and_encodes()
  {
    var values = UriTemplateValues.FromScalars(new Dictionary<string, string> { ["table"] = "users", ["id"] = "42" });
    Assert.Equal("db://users/42", UriTemplate.Expand("db://{table}/{id}", values));
  }

  [Fact]
  public void Expand_simple_percent_encodes_reserved_chars()
  {
    var values = UriTemplateValues.FromScalars(new Dictionary<string, string> { ["q"] = "a b/c" });
    // Simple expansion (no operator) encodes spaces and reserved '/'.
    Assert.Equal("s://a%20b%2Fc", UriTemplate.Expand("s://{q}", values));
  }

  [Fact]
  public void Expand_reserved_operator_preserves_reserved_chars()
  {
    var values = UriTemplateValues.FromScalars(new Dictionary<string, string> { ["path"] = "a/b/c" });
    // The '+' (reserved) operator keeps '/' unescaped.
    Assert.Equal("s://a/b/c", UriTemplate.Expand("s://{+path}", values));
  }

  [Fact]
  public void Expand_query_operator_emits_named_pairs()
  {
    var values = UriTemplateValues.FromScalars(new Dictionary<string, string> { ["q"] = "x", ["page"] = "2" });
    Assert.Equal("h://api?q=x&page=2", UriTemplate.Expand("h://api{?q,page}", values));
  }

  [Fact]
  public void Expand_prefix_modifier_truncates_value()
  {
    var values = UriTemplateValues.FromScalars(new Dictionary<string, string> { ["var"] = "value" });
    Assert.Equal("x://val", UriTemplate.Expand("x://{var:3}", values));
  }

  [Fact]
  public void Expand_undefined_variable_contributes_nothing()
  {
    var values = UriTemplateValues.FromScalars(new Dictionary<string, string> { ["a"] = "x" });
    Assert.Equal("s://x/", UriTemplate.Expand("s://{a}/{b}", values));
  }

  [Fact]
  public void Expand_explode_over_list_path_segments()
  {
    var values = UriTemplateValues.FromLists(new Dictionary<string, IReadOnlyList<string>>
    {
      ["p"] = new[] { "a", "b", "c" },
    });
    Assert.Equal("s:///a/b/c", UriTemplate.Expand("s://{/p*}", values));
  }

  [Fact]
  public void Expand_then_resource_uri_is_valid()
  {
    var values = UriTemplateValues.FromScalars(new Dictionary<string, string> { ["table"] = "users", ["id"] = "42" });
    var expanded = UriTemplate.Expand("db://{table}/{id}", values);
    Assert.True(UriTemplate.IsResourceUri(expanded));
  }

  // ─── Matching (recover variables) ────────────────────────────────────────────────────────────

  [Theory]
  [InlineData("weather://oslo/current", "oslo")]
  [InlineData("weather://tokyo/current", "tokyo")]
  [InlineData("weather://new-york/current", "new-york")]
  public void TryMatch_recovers_single_variable(string uri, string expectedCity)
  {
    Assert.True(UriTemplate.TryMatch("weather://{city}/current", uri, out var vars));
    Assert.Equal(expectedCity, vars["city"]);
  }

  [Fact]
  public void TryMatch_recovers_multiple_variables()
  {
    Assert.True(UriTemplate.TryMatch("db://{table}/{id}", "db://users/42", out var vars));
    Assert.Equal("users", vars["table"]);
    Assert.Equal("42", vars["id"]);
  }

  [Fact]
  public void TryMatch_does_not_cross_path_separators()
  {
    // A single {city} segment is [^/]+, so a two-segment value does not match.
    Assert.False(UriTemplate.TryMatch("weather://{city}/current", "weather://a/b/current", out _));
  }

  [Fact]
  public void TryMatch_rejects_non_matching_uri()
  {
    Assert.False(UriTemplate.TryMatch("weather://{city}/current", "weather://oslo/forecast", out var vars));
    Assert.Empty(vars);
  }

  [Fact]
  public void CompileMatcher_exposes_variable_names()
  {
    var matcher = UriTemplate.CompileMatcher("db://{table}/{id}");
    Assert.Equal(new[] { "table", "id" }, matcher.VariableNames);
  }
}
