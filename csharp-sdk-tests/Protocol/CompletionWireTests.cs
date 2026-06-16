using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape coverage for the Completion feature (spec §19) and the shared caching
/// primitives (spec §13): the polymorphic <see cref="CompletionReference"/> discriminator, the
/// <see cref="CompleteRequestParams"/> request shape (ref/argument/context), the
/// <see cref="CompleteResult"/> values/total/hasMore, the <see cref="CacheScope"/> enum wire
/// values, and the <see cref="CacheHints"/> record.
/// </summary>
public sealed class CompletionWireTests
{
  // ---- CompletionReference: polymorphic discriminator ---------------------------------------

  [Fact]
  public void Prompt_reference_serializes_ref_prompt_discriminator_and_name()
  {
    CompletionReference reference = new PromptReference { Name = "greeting" };
    var json = McpJson.Serialize(reference);

    Assert.Contains("\"type\":\"ref/prompt\"", json);
    Assert.Contains("\"name\":\"greeting\"", json);
  }

  [Theory]
  [InlineData("greeting")]
  [InlineData("code_review")]
  public void Prompt_reference_name_round_trips(string name)
  {
    CompletionReference reference = new PromptReference { Name = name };
    var back = McpJson.Deserialize<CompletionReference>(McpJson.Serialize(reference))!;

    var prompt = Assert.IsType<PromptReference>(back);
    Assert.Equal(name, prompt.Name);
  }

  [Fact]
  public void Prompt_reference_title_serializes_when_set()
  {
    CompletionReference reference = new PromptReference { Name = "greeting", Title = "Greeting" };
    var json = McpJson.Serialize(reference);
    Assert.Contains("\"title\":\"Greeting\"", json);
  }

  [Fact]
  public void Prompt_reference_title_omitted_when_null()
  {
    CompletionReference reference = new PromptReference { Name = "greeting" };
    var json = McpJson.Serialize(reference);
    Assert.DoesNotContain("\"title\"", json);
  }

  [Fact]
  public void Resource_template_reference_serializes_ref_resource_discriminator_and_uri()
  {
    CompletionReference reference = new ResourceTemplateReference { Uri = "weather://{city}/current" };
    var json = McpJson.Serialize(reference);

    Assert.Contains("\"type\":\"ref/resource\"", json);
    Assert.Contains("\"uri\":\"weather://{city}/current\"", json);
  }

  [Theory]
  [InlineData("weather://{city}/current")]
  [InlineData("file:///{path}")]
  [InlineData("db://{table}/{id}")]
  public void Resource_template_reference_uri_round_trips(string uri)
  {
    CompletionReference reference = new ResourceTemplateReference { Uri = uri };
    var back = McpJson.Deserialize<CompletionReference>(McpJson.Serialize(reference))!;

    var resource = Assert.IsType<ResourceTemplateReference>(back);
    Assert.Equal(uri, resource.Uri);
  }

  [Fact]
  public void Completion_reference_deserializes_to_correct_subtype_by_discriminator()
  {
    var prompt = McpJson.Deserialize<CompletionReference>("""{"type":"ref/prompt","name":"g"}""");
    Assert.IsType<PromptReference>(prompt);

    var resource = McpJson.Deserialize<CompletionReference>("""{"type":"ref/resource","uri":"u://{x}"}""");
    Assert.IsType<ResourceTemplateReference>(resource);
  }

  // ---- CompletionArgument -------------------------------------------------------------------

  [Fact]
  public void Completion_argument_serializes_name_and_value()
  {
    var json = McpJson.Serialize(new CompletionArgument { Name = "city", Value = "os" });
    Assert.Equal("{\"name\":\"city\",\"value\":\"os\"}", json);
  }

  [Theory]
  [InlineData("city", "os")]
  [InlineData("language", "eng")]
  [InlineData("name", "")]
  public void Completion_argument_round_trips_including_empty_value(string name, string value)
  {
    var back = McpJson.Deserialize<CompletionArgument>(
      McpJson.Serialize(new CompletionArgument { Name = name, Value = value }))!;

    Assert.Equal(name, back.Name);
    Assert.Equal(value, back.Value);
  }

  [Fact]
  public void Completion_argument_empty_value_is_still_emitted()
  {
    // Value is REQUIRED and MAY be empty; an empty string is written (it is not null).
    var json = McpJson.Serialize(new CompletionArgument { Name = "n", Value = "" });
    Assert.Contains("\"value\":\"\"", json);
  }

  // ---- CompleteRequestParams ----------------------------------------------------------------

  [Fact]
  public void Complete_request_params_carry_ref_and_argument()
  {
    var request = new CompleteRequestParams
    {
      Ref = new PromptReference { Name = "greeting" },
      Argument = new CompletionArgument { Name = "language", Value = "en" },
    };
    var json = McpJson.Serialize(request);

    Assert.Contains("\"ref\":{", json);
    Assert.Contains("\"type\":\"ref/prompt\"", json);
    Assert.Contains("\"argument\":{", json);
    Assert.Contains("\"name\":\"language\"", json);
  }

  [Fact]
  public void Complete_request_params_omit_context_when_null()
  {
    var request = new CompleteRequestParams
    {
      Ref = new PromptReference { Name = "g" },
      Argument = new CompletionArgument { Name = "a", Value = "" },
    };
    var json = McpJson.Serialize(request);
    Assert.DoesNotContain("\"context\"", json);
  }

  [Fact]
  public void Complete_request_params_context_serializes_arguments_map()
  {
    var request = new CompleteRequestParams
    {
      Ref = new ResourceTemplateReference { Uri = "x://{a}/{b}" },
      Argument = new CompletionArgument { Name = "b", Value = "" },
      Context = new CompletionContext { Arguments = new Dictionary<string, string> { ["a"] = "alpha" } },
    };
    var json = McpJson.Serialize(request);

    Assert.Contains("\"context\":{", json);
    Assert.Contains("\"arguments\":{\"a\":\"alpha\"}", json);
  }

  [Fact]
  public void Complete_request_params_round_trip_with_context()
  {
    var request = new CompleteRequestParams
    {
      Ref = new PromptReference { Name = "greeting", Title = "Greeting" },
      Argument = new CompletionArgument { Name = "name", Value = "Ad" },
      Context = new CompletionContext { Arguments = new Dictionary<string, string> { ["language"] = "english" } },
    };
    var back = McpJson.Deserialize<CompleteRequestParams>(McpJson.Serialize(request))!;

    var promptRef = Assert.IsType<PromptReference>(back.Ref);
    Assert.Equal("greeting", promptRef.Name);
    Assert.Equal("Greeting", promptRef.Title);
    Assert.Equal("name", back.Argument.Name);
    Assert.Equal("Ad", back.Argument.Value);
    Assert.Equal("english", back.Context!.Arguments!["language"]);
  }

  [Fact]
  public void Completion_context_with_null_arguments_serializes_empty_object()
  {
    var json = McpJson.Serialize(new CompletionContext());
    Assert.Equal("{}", json);
  }

  // ---- CompleteResult / CompletionValues ----------------------------------------------------

  [Fact]
  public void Complete_result_wraps_completion_values()
  {
    var result = new CompleteResult { Completion = new CompletionValues { Values = ["oslo", "tokyo"] } };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"completion\":{", json);
    Assert.Contains("\"values\":[\"oslo\",\"tokyo\"]", json);
  }

  [Fact]
  public void Completion_values_allow_empty_list()
  {
    var json = McpJson.Serialize(new CompletionValues { Values = [] });
    Assert.Contains("\"values\":[]", json);
  }

  [Fact]
  public void Completion_values_omit_total_and_has_more_when_null()
  {
    var json = McpJson.Serialize(new CompletionValues { Values = ["a"] });
    Assert.DoesNotContain("\"total\"", json);
    Assert.DoesNotContain("\"hasMore\"", json);
  }

  [Theory]
  [InlineData(0)]
  [InlineData(5)]
  [InlineData(100)]
  public void Completion_values_total_serializes(int total)
  {
    var json = McpJson.Serialize(new CompletionValues { Values = ["a"], Total = total });
    Assert.Contains($"\"total\":{total}", json);
  }

  [Theory]
  [InlineData(true, "\"hasMore\":true")]
  [InlineData(false, "\"hasMore\":false")]
  public void Completion_values_has_more_serializes_both_values(bool hasMore, string expected)
  {
    var json = McpJson.Serialize(new CompletionValues { Values = ["a"], HasMore = hasMore });
    Assert.Contains(expected, json);
  }

  [Fact]
  public void Complete_result_round_trips_with_total_and_has_more()
  {
    var result = new CompleteResult
    {
      Completion = new CompletionValues { Values = ["x", "y", "z"], Total = 42, HasMore = true },
    };
    var back = McpJson.Deserialize<CompleteResult>(McpJson.Serialize(result))!;

    Assert.Equal(["x", "y", "z"], back.Completion.Values);
    Assert.Equal(42, back.Completion.Total);
    Assert.True(back.Completion.HasMore);
  }

  // ---- CacheScope enum (spec §13) -----------------------------------------------------------

  [Theory]
  [InlineData(CacheScope.Public, "\"public\"")]
  [InlineData(CacheScope.Private, "\"private\"")]
  public void Cache_scope_uses_lowercase_wire_values(CacheScope scope, string expected)
  {
    var json = McpJson.Serialize(scope);
    Assert.Equal(expected, json);
  }

  [Theory]
  [InlineData("\"public\"", CacheScope.Public)]
  [InlineData("\"private\"", CacheScope.Private)]
  public void Cache_scope_deserializes_from_wire_values(string json, CacheScope expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<CacheScope>(json));
  }

  // ---- CacheHints record (spec §13.1) -------------------------------------------------------

  [Theory]
  [InlineData(0L, CacheScope.Public)]
  [InlineData(5000L, CacheScope.Private)]
  [InlineData(86400000L, CacheScope.Public)]
  public void Cache_hints_serialize_ttl_and_scope(long ttl, CacheScope scope)
  {
    var json = McpJson.Serialize(new CacheHints(ttl, scope));
    Assert.Contains($"\"ttlMs\":{ttl}", json);
    Assert.Contains(scope == CacheScope.Public ? "\"public\"" : "\"private\"", json);
  }

  [Theory]
  [InlineData(1000L, CacheScope.Private)]
  [InlineData(0L, CacheScope.Public)]
  public void Cache_hints_round_trip(long ttl, CacheScope scope)
  {
    var back = McpJson.Deserialize<CacheHints>(McpJson.Serialize(new CacheHints(ttl, scope)))!;
    Assert.Equal(ttl, back.TtlMs);
    Assert.Equal(scope, back.CacheScope);
  }

  [Fact]
  public void Cache_hints_none_is_zero_ttl_private()
  {
    // The conservative no-cache default MUST be private, not public: an unknown/absent scope falls
    // back to "private" per the TS privacy-default (R-13.1-e, R-13.3-h). The previous assertion of
    // CacheScope.Public encoded the inverted, privacy-violating behavior this port fixes.
    Assert.Equal(0L, CacheHints.None.TtlMs);
    Assert.Equal(CacheScope.Private, CacheHints.None.CacheScope);
  }

  // ---- CompleteRequestParams._meta (§19.2) --------------------------------------------------

  [Fact]
  public void Complete_request_params_meta_serializes_under_underscore_meta()
  {
    var request = new CompleteRequestParams
    {
      Ref = new PromptReference { Name = "g" },
      Argument = new CompletionArgument { Name = "a", Value = "" },
      Meta = new JsonObject { ["k"] = "v" },
    };
    var json = McpJson.Serialize(request);
    Assert.Contains("\"_meta\":{\"k\":\"v\"}", json);
  }

  [Fact]
  public void Complete_request_params_meta_omitted_when_null()
  {
    var request = new CompleteRequestParams
    {
      Ref = new PromptReference { Name = "g" },
      Argument = new CompletionArgument { Name = "a", Value = "" },
    };
    Assert.DoesNotContain("\"_meta\"", McpJson.Serialize(request));
  }

  // ---- computeCompletion: cap + truncation only-when-dropped (§19.4, R-19.4-c–h) -------------

  [Fact]
  public void Compute_completion_caps_values_at_100_and_signals_truncation()
  {
    var many = Enumerable.Range(0, 250).Select(i => $"item-{i}").ToList();
    var completion = Completion.ComputeCompletion(many);

    Assert.Equal(Completion.MaxCompletionValues, completion.Values.Count);
    Assert.Equal(100, Completion.MaxCompletionValues);
    Assert.Equal(250, completion.Total);
    Assert.True(completion.HasMore);
  }

  [Fact]
  public void Compute_completion_under_cap_omits_total_and_has_more()
  {
    // TS computeCompletion sets total/hasMore ONLY when matches were dropped; an under-cap result
    // leaves both absent (unknown), rather than always emitting an exact total.
    var completion = Completion.ComputeCompletion(["english"]);
    Assert.Single(completion.Values);
    Assert.Null(completion.Total);
    Assert.Null(completion.HasMore);
  }

  [Fact]
  public void Compute_completion_over_no_matches_is_empty_and_untruncated()
  {
    var completion = Completion.ComputeCompletion([]);
    Assert.Empty(completion.Values);
    Assert.Null(completion.Total);
    Assert.Null(completion.HasMore);
  }

  [Fact]
  public void Compute_completion_explicit_total_override_marks_truncation()
  {
    var completion = Completion.ComputeCompletion(["python", "pytorch", "pyside"], totalOverride: 10);
    Assert.Equal(10, completion.Total);
    Assert.True(completion.HasMore);
    Assert.Equal(3, completion.Values.Count);
  }

  [Fact]
  public void Compute_completion_preserves_caller_order()
  {
    var completion = Completion.ComputeCompletion(["z-best", "a-worse"]);
    Assert.Equal(["z-best", "a-worse"], completion.Values);
  }

  // ---- prefixMatch (§19.5, R-19.5-d, R-19.2-i) -----------------------------------------------

  [Fact]
  public void Prefix_match_empty_seed_returns_all()
  {
    Assert.Equal(["python", "pytorch", "rails"], Completion.PrefixMatch("", ["python", "pytorch", "rails"]));
  }

  [Fact]
  public void Prefix_match_filters_by_seed()
  {
    Assert.Equal(["python", "pytorch"], Completion.PrefixMatch("py", ["python", "pytorch", "rails"]));
  }

  [Fact]
  public void Prefix_match_supports_case_insensitive()
  {
    Assert.Equal(["python", "Pytorch"], Completion.PrefixMatch("PY", ["python", "Pytorch"], caseInsensitive: true));
  }

  // ---- resolvers (§19.4) ---------------------------------------------------------------------

  [Fact]
  public void Resolve_result_type_defaults_absent_to_complete()
  {
    Assert.Equal("complete", Completion.ResolveResultType(new JsonObject()));
    Assert.Equal("complete", Completion.ResolveResultType(new JsonObject { ["resultType"] = "complete" }));
  }

  [Theory]
  [InlineData(null, false)]
  [InlineData(false, false)]
  [InlineData(true, true)]
  public void Resolve_has_more_defaults_absent_to_false(bool? hasMore, bool expected)
  {
    Assert.Equal(expected, Completion.ResolveHasMore(hasMore));
  }

  // ---- context key-exclusion guard (§19.2, R-19.2-k) -----------------------------------------

  [Fact]
  public void Guard_context_rejects_key_equal_to_completed_argument()
  {
    var argument = new CompletionArgument { Name = "framework", Value = "fla" };
    var context = new CompletionContext { Arguments = new Dictionary<string, string> { ["framework"] = "x" } };
    var error = Assert.Throws<McpError>(() => Completion.GuardContextExcludesArgument(argument, context));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Guard_context_accepts_sibling_only_context()
  {
    var argument = new CompletionArgument { Name = "framework", Value = "fla" };
    var context = new CompletionContext { Arguments = new Dictionary<string, string> { ["language"] = "python" } };
    Completion.GuardContextExcludesArgument(argument, context); // does not throw
  }

  [Fact]
  public void Guard_context_accepts_absent_context()
  {
    Completion.GuardContextExcludesArgument(new CompletionArgument { Name = "x", Value = "" }, null);
  }

  // ---- resolveCompletionTarget against a catalog (§19.5, R-19.5-r) ----------------------------

  private sealed class TestCatalog : ICompletionCatalog
  {
    public IReadOnlyList<string>? PromptArgumentNames(string name) =>
      name == "code_review" ? ["framework", "language"] : null;

    public IReadOnlyList<string>? ResourceTemplateVariableNames(string uri) =>
      uri == "file:///{path}" ? ["path"] : null;
  }

  [Fact]
  public void Resolve_target_unknown_prompt_is_invalid_params()
  {
    var resolution = Completion.ResolveCompletionTarget(
      new PromptReference { Name = "code_reviw" }, "framework", new TestCatalog());
    Assert.False(resolution.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, resolution.Error!.Code);
  }

  [Fact]
  public void Resolve_target_known_prompt_unknown_argument_is_invalid_params()
  {
    var resolution = Completion.ResolveCompletionTarget(
      new PromptReference { Name = "code_review" }, "nope", new TestCatalog());
    Assert.False(resolution.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, resolution.Error!.Code);
  }

  [Fact]
  public void Resolve_target_known_prompt_and_argument_is_ok()
  {
    var resolution = Completion.ResolveCompletionTarget(
      new PromptReference { Name = "code_review" }, "framework", new TestCatalog());
    Assert.True(resolution.Ok);
  }

  [Fact]
  public void Resolve_target_unknown_template_is_invalid_params()
  {
    var resolution = Completion.ResolveCompletionTarget(
      new ResourceTemplateReference { Uri = "file:///{nope}" }, "path", new TestCatalog());
    Assert.False(resolution.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, resolution.Error!.Code);
  }

  [Fact]
  public void Resolve_target_known_template_unknown_variable_is_invalid_params()
  {
    var resolution = Completion.ResolveCompletionTarget(
      new ResourceTemplateReference { Uri = "file:///{path}" }, "other", new TestCatalog());
    Assert.False(resolution.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, resolution.Error!.Code);
  }

  [Fact]
  public void Resolve_target_known_template_and_variable_is_ok()
  {
    var resolution = Completion.ResolveCompletionTarget(
      new ResourceTemplateReference { Uri = "file:///{path}" }, "path", new TestCatalog());
    Assert.True(resolution.Ok);
  }
}
