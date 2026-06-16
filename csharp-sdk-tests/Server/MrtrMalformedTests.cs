using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Malformed-result coverage for the multi-round-trip mechanism (spec §11.2), exercising the helpers
/// the S17 wire path depends on but which the end-to-end suite does not reach (S17): duplicate
/// <c>inputRequests</c> keys are detected on the RAW text and the result is treated as malformed
/// (<see cref="MultiRoundTrip.JsonHasDuplicateKeys"/> / <see cref="MultiRoundTrip.ParseInputRequiredResult"/>,
/// R-11.2-f/g), and an <c>input_required</c> result that carries NEITHER <c>inputRequests</c> NOR
/// <c>requestState</c> is malformed (<see cref="MultiRoundTrip.DiscriminateResultType"/> /
/// <see cref="MultiRoundTrip.ParseInputRequiredResult"/>, R-11.2-c). Error CODES are asserted, never message text.
/// </summary>
public sealed class MrtrMalformedTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  // ════════════════════════ R-11.2-f/g — duplicate inputRequests key → malformed -32602 ════════════════════════

  [Fact]
  public void Json_with_a_duplicate_object_member_name_is_detected_on_raw_text()
  {
    // System.Text.Json silently collapses duplicate keys (last-wins), so detection MUST run on the raw
    // token stream — JsonNode.Parse would never surface the repeat (R-11.2-f).
    const string raw = """{"resultType":"input_required","inputRequests":{"k":{},"k":{}}}""";
    Assert.True(MultiRoundTrip.JsonHasDuplicateKeys(raw));
  }

  [Fact]
  public void Json_without_duplicate_member_names_is_not_flagged()
  {
    const string raw = """{"resultType":"input_required","inputRequests":{"a":{},"b":{}},"requestState":"t"}""";
    Assert.False(MultiRoundTrip.JsonHasDuplicateKeys(raw));
  }

  [Fact]
  public void Repeated_keys_in_sibling_object_scopes_are_not_a_duplicate()
  {
    // The same member name in two DIFFERENT object scopes is legal; only a repeat WITHIN one scope is a
    // duplicate. This guards the scope-tracking in JsonHasDuplicateKeys.
    const string raw = """{"a":{"id":1},"b":{"id":2}}""";
    Assert.False(MultiRoundTrip.JsonHasDuplicateKeys(raw));
  }

  [Fact]
  public void A_string_value_equal_to_a_key_is_not_a_duplicate()
  {
    // A string VALUE that happens to equal a member NAME must not trip the detector (only object keys count).
    const string raw = """{"name":"name","other":"value"}""";
    Assert.False(MultiRoundTrip.JsonHasDuplicateKeys(raw));
  }

  [Fact]
  public void Parse_input_required_with_duplicate_keys_is_malformed_minus_32602()
  {
    // R-11.2-f/g: a receiver encountering duplicate inputRequests keys MUST treat the result as
    // malformed (-32602), stricter than the base §2.3.1 last-wins tolerance.
    const string raw = """{"resultType":"input_required","inputRequests":{"k":{"method":"roots/list"},"k":{"method":"roots/list"}}}""";
    var parse = MultiRoundTrip.ParseInputRequiredResult(raw);

    Assert.False(parse.Ok);
    Assert.Null(parse.Result);
    Assert.NotNull(parse.Error);
    Assert.Equal(ErrorCodes.InvalidParams, parse.Error!.Code);
  }

  [Fact]
  public void Parse_input_required_with_a_top_level_duplicate_key_is_malformed_minus_32602()
  {
    // The duplicate need not be inside inputRequests; any repeated member name in the result object is
    // malformed (R-11.2-f).
    const string raw = """{"resultType":"input_required","requestState":"a","requestState":"b"}""";
    var parse = MultiRoundTrip.ParseInputRequiredResult(raw);

    Assert.False(parse.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, parse.Error!.Code);
  }

  [Fact]
  public void Parse_input_required_without_duplicates_succeeds()
  {
    // The positive control: a well-formed input_required result parses cleanly.
    const string raw = """{"resultType":"input_required","requestState":"token-1"}""";
    var parse = MultiRoundTrip.ParseInputRequiredResult(raw);

    Assert.True(parse.Ok);
    Assert.NotNull(parse.Result);
    Assert.Equal("token-1", parse.Result!.RequestState);
  }

  // ════════════════════════ R-11.2-c — both inputRequests AND requestState absent → malformed ════════════════════════

  [Fact]
  public void Input_required_with_neither_input_requests_nor_request_state_is_an_error()
  {
    // R-11.2-c: an input_required result MUST carry at least one of inputRequests / requestState; one
    // with neither is malformed and DiscriminateResultType returns Error (the whole result is rejected).
    var result = Obj("""{"resultType":"input_required"}""");
    var decision = MultiRoundTrip.DiscriminateResultType(result);

    Assert.Equal(ResultDiscriminationAction.Error, decision.Action);
    Assert.Equal(ResultTypes.InputRequired, decision.ResultType);
  }

  [Fact]
  public void Parse_input_required_with_both_absent_is_malformed_minus_32602()
  {
    var parse = MultiRoundTrip.ParseInputRequiredResult("""{"resultType":"input_required"}""");

    Assert.False(parse.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, parse.Error!.Code);
  }

  [Fact]
  public void Input_required_with_only_request_state_is_a_valid_load_shed_signal()
  {
    // The boundary case: requestState alone (no inputRequests) is the valid "retry later" load-shedding
    // signal, NOT malformed — it discriminates to InputRequired (R-11.5-l).
    var result = Obj("""{"resultType":"input_required","requestState":"retry-1"}""");
    var decision = MultiRoundTrip.DiscriminateResultType(result);

    Assert.Equal(ResultDiscriminationAction.InputRequired, decision.Action);
    Assert.True(MultiRoundTrip.IsLoadSheddingResult(result));
  }

  [Fact]
  public void Input_required_with_only_input_requests_discriminates_to_input_required()
  {
    var result = Obj("""{"resultType":"input_required","inputRequests":{"k":{"method":"roots/list"}}}""");
    var decision = MultiRoundTrip.DiscriminateResultType(result);

    Assert.Equal(ResultDiscriminationAction.InputRequired, decision.Action);
    Assert.NotNull(decision.Result);
  }

  // ════════════════════════ adjacent discrimination guards (§11.5) ════════════════════════

  [Fact]
  public void An_unrecognized_result_type_is_an_error()
  {
    // R-11.5-d/e: an unrecognized resultType is an error and the client MUST NOT read other members.
    var decision = MultiRoundTrip.DiscriminateResultType(Obj("""{"resultType":"surprise"}"""));
    Assert.Equal(ResultDiscriminationAction.Error, decision.Action);
    Assert.Equal("surprise", decision.ResultType);
  }

  [Fact]
  public void A_complete_result_discriminates_to_complete()
  {
    var decision = MultiRoundTrip.DiscriminateResultType(Obj("""{"resultType":"complete","content":[]}"""));
    Assert.Equal(ResultDiscriminationAction.Complete, decision.Action);
  }

  // ── S17-RC-2: deprecated input-request kinds (R-11.2-i) ──

  [Fact]
  public void Deprecated_input_request_kinds_are_exactly_roots_and_sampling()
  {
    Assert.True(MultiRoundTrip.IsDeprecatedInputRequestKind(McpMethods.RootsList));
    Assert.True(MultiRoundTrip.IsDeprecatedInputRequestKind(McpMethods.SamplingCreateMessage));
    Assert.False(MultiRoundTrip.IsDeprecatedInputRequestKind(McpMethods.ElicitationCreate));
    Assert.Equal(
      new HashSet<string>(StringComparer.Ordinal) { McpMethods.RootsList, McpMethods.SamplingCreateMessage },
      MultiRoundTrip.DeprecatedInputRequestMethods);
  }

  // ── S17-RC-5: exponential backoff growth + cap (R-11.5-n) ──

  [Theory]
  [InlineData(-1, 0)]
  [InlineData(0, 0)]
  [InlineData(1, 250)]
  [InlineData(2, 500)]
  [InlineData(3, 1000)]
  [InlineData(100, 30_000)] // capped
  public void Retry_backoff_grows_exponentially_and_caps(int attempt, long expected)
  {
    Assert.Equal(expected, MultiRoundTrip.ComputeRetryBackoffMs(attempt));
  }

  [Fact]
  public void Retry_backoff_is_monotonic_up_to_the_cap()
  {
    long previous = -1;
    for (var attempt = 0; attempt <= 20; attempt++)
    {
      var delay = MultiRoundTrip.ComputeRetryBackoffMs(attempt);
      Assert.True(delay >= previous, $"backoff must not decrease at attempt {attempt}");
      Assert.True(delay <= 30_000, "backoff must never exceed the cap");
      previous = delay;
    }
  }

  // ── S17-RC-6: re-request only the still-missing input keys (R-11.5-q) ──

  [Fact]
  public void Re_request_input_required_re_requests_only_the_missing_keys()
  {
    var inputRequests = new Dictionary<string, InputRequest>(StringComparer.Ordinal)
    {
      ["a"] = new InputRequest { Method = McpMethods.ElicitationCreate, Params = new JsonObject() },
      ["b"] = new InputRequest { Method = McpMethods.ElicitationCreate, Params = new JsonObject() },
    };
    var inputResponses = new Dictionary<string, JsonNode>(StringComparer.Ordinal) { ["a"] = new JsonObject() };

    Assert.Equal(["b"], MultiRoundTrip.ComputeMissingInputResponseKeys(inputRequests, inputResponses));

    var reRequest = MultiRoundTrip.BuildReRequestInputRequiredResult(inputRequests, inputResponses, "state-token");
    Assert.NotNull(reRequest);
    Assert.Equal(["b"], reRequest!.InputRequests!.Keys);
    Assert.Equal("state-token", reRequest.RequestState);
  }

  [Fact]
  public void Re_request_input_required_returns_null_when_everything_is_answered()
  {
    var inputRequests = new Dictionary<string, InputRequest>(StringComparer.Ordinal)
    {
      ["a"] = new InputRequest { Method = McpMethods.ElicitationCreate, Params = new JsonObject() },
    };
    var inputResponses = new Dictionary<string, JsonNode>(StringComparer.Ordinal) { ["a"] = new JsonObject() };

    Assert.Empty(MultiRoundTrip.ComputeMissingInputResponseKeys(inputRequests, inputResponses));
    Assert.Null(MultiRoundTrip.BuildReRequestInputRequiredResult(inputRequests, inputResponses));
  }
}
