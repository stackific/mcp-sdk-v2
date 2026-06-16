using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Tests.JsonRpc;

/// <summary>
/// S04 payload shapes (spec §3.6–§3.9): <c>resultType</c> interpretation, the <c>Result</c>,
/// <c>EmptyResult</c>, <c>RequestParams</c>, and <c>NotificationParams</c> base shapes,
/// <c>ProgressToken</c>, <c>Cursor</c>, and the <c>error</c> object. Mirrors the TypeScript
/// <c>payload.test.ts</c> coverage (AC-04.1 — AC-04.18).
/// </summary>
public sealed class PayloadTests
{
  /// <summary>Parses a JSON object literal for use as a test input.</summary>
  private static JsonObject Obj(string json) => (JsonObject)JsonNode.Parse(json)!;

  /// <summary>Parses an arbitrary JSON node literal (may be a scalar, array, or object).</summary>
  private static JsonNode? Node(string json) => JsonNode.Parse(json);

  // ─── ResultType constants & isKnownResultType (AC-04.5) ──────────────────────

  [Fact]
  public void Result_type_constants_have_their_wire_values()
  {
    Assert.Equal("complete", ResultTypeNames.Complete);
    Assert.Equal("input_required", ResultTypeNames.InputRequired);
  }

  [Theory]
  [InlineData("complete", true)]
  [InlineData("input_required", true)]
  [InlineData("x-custom-vendor-type", false)]
  [InlineData("", false)]
  [InlineData("task", false)] // the extension value is not part of the core known set
  public void IsKnownResultType_recognizes_only_the_two_defined_values(string value, bool known) =>
    Assert.Equal(known, Payload.IsKnownResultType(value));

  // ─── interpretResultType — unrecognized value (AC-04.6 — R-3.6-f, R-3.6-g) ───

  [Fact]
  public void InterpretResultType_returns_unrecognized_for_an_unknown_value()
  {
    var outcome = Payload.InterpretResultType(Obj("""{"resultType":"x-future-type","extra":"data"}"""));
    Assert.False(outcome.Recognized);
    Assert.Equal("x-future-type", outcome.ResultType);
  }

  [Fact]
  public void InterpretResultType_carries_the_raw_unrecognized_value()
  {
    var outcome = Payload.InterpretResultType(Obj("""{"resultType":"some-unknown"}"""));
    Assert.False(outcome.Recognized);
    Assert.Equal("some-unknown", outcome.ResultType);
  }

  [Theory]
  [InlineData("complete")]
  [InlineData("input_required")]
  public void InterpretResultType_returns_recognized_for_known_values(string value)
  {
    var outcome = Payload.InterpretResultType(Obj("{\"resultType\":\"" + value + "\"}"));
    Assert.True(outcome.Recognized);
    Assert.Equal(value, outcome.ResultType);
  }

  [Fact]
  public void InterpretResultType_treats_a_non_string_resultType_as_unrecognized()
  {
    // A numeric resultType is stringified and will not match a known value (R-3.6-f).
    var outcome = Payload.InterpretResultType(Obj("""{"resultType":42}"""));
    Assert.False(outcome.Recognized);
  }

  // ─── interpretResultType — absent/null fallback (AC-04.7 — R-3.6-i) ──────────

  [Fact]
  public void InterpretResultType_treats_a_missing_resultType_as_complete()
  {
    var outcome = Payload.InterpretResultType(Obj("""{"tools":[]}"""));
    Assert.True(outcome.Recognized);
    Assert.Equal("complete", outcome.ResultType);
  }

  [Fact]
  public void InterpretResultType_treats_an_explicit_null_resultType_as_complete()
  {
    var outcome = Payload.InterpretResultType(Obj("""{"resultType":null}"""));
    Assert.True(outcome.Recognized);
    Assert.Equal("complete", outcome.ResultType);
  }

  // ─── Result base shape (AC-04.1, AC-04.2, AC-04.4) ──────────────────────────

  [Fact]
  public void IsValidResult_accepts_a_result_with_resultType() =>
    Assert.True(Payload.IsValidResult(Obj("""{"resultType":"complete"}""")));

  [Fact]
  public void IsValidResult_rejects_a_result_without_resultType() =>
    Assert.False(Payload.IsValidResult(Obj("{}")));

  [Fact]
  public void IsValidResult_rejects_a_non_string_resultType() =>
    Assert.False(Payload.IsValidResult(Obj("""{"resultType":42}""")));

  [Fact]
  public void IsValidResult_accepts_meta_as_an_object() =>
    Assert.True(Payload.IsValidResult(
      Obj("""{"resultType":"complete","_meta":{"io.modelcontextprotocol/revision":"2026-07-28"}}""")));

  [Fact]
  public void IsValidResult_rejects_meta_as_a_string() =>
    Assert.False(Payload.IsValidResult(Obj("""{"resultType":"complete","_meta":"bad"}""")));

  [Fact]
  public void IsValidResult_rejects_meta_as_an_array() =>
    Assert.False(Payload.IsValidResult(Obj("""{"resultType":"complete","_meta":[]}""")));

  [Fact]
  public void IsValidResult_accepts_extra_method_defined_members() =>
    Assert.True(Payload.IsValidResult(
      Obj("""{"resultType":"complete","tools":[],"nextCursor":"tok-abc"}""")));

  [Fact]
  public void IsValidResult_rejects_a_non_object() =>
    Assert.False(Payload.IsValidResult(Node("\"string\"")));

  // ─── EmptyResult shape (AC-04.17, AC-04.18) ─────────────────────────────────

  [Fact]
  public void IsValidEmptyResult_accepts_a_minimal_result() =>
    Assert.True(Payload.IsValidEmptyResult(Obj("""{"resultType":"complete"}""")));

  [Fact]
  public void IsValidEmptyResult_rejects_a_result_without_resultType() =>
    Assert.False(Payload.IsValidEmptyResult(Obj("{}")));

  [Fact]
  public void ParseEmptyResult_strips_extra_members()
  {
    var parsed = Payload.ParseEmptyResult(Obj("""{"resultType":"complete","unexpectedField":"strip"}"""));
    Assert.NotNull(parsed);
    Assert.False(parsed!.ContainsKey("unexpectedField"));
    Assert.Equal("complete", parsed["resultType"]!.GetValue<string>());
  }

  [Fact]
  public void ParseEmptyResult_keeps_only_resultType_when_meta_is_absent()
  {
    var parsed = Payload.ParseEmptyResult(Obj("""{"resultType":"complete"}"""));
    Assert.NotNull(parsed);
    Assert.Single(parsed!);
    Assert.True(parsed.ContainsKey("resultType"));
  }

  [Fact]
  public void ParseEmptyResult_keeps_resultType_and_meta_when_meta_is_present()
  {
    var parsed = Payload.ParseEmptyResult(Obj("""{"resultType":"complete","_meta":{}}"""));
    Assert.NotNull(parsed);
    Assert.Equal(2, parsed!.Count);
    Assert.True(parsed.ContainsKey("resultType"));
    Assert.True(parsed.ContainsKey("_meta"));
  }

  [Fact]
  public void ParseEmptyResult_returns_null_for_an_invalid_result() =>
    Assert.Null(Payload.ParseEmptyResult(Obj("{}")));

  // ─── RequestParams base shape (AC-04.8 — R-3.7-a) ───────────────────────────

  [Fact]
  public void IsValidRequestParams_accepts_params_with_meta_present() =>
    Assert.True(Payload.IsValidRequestParams(
      Obj("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}""")));

  [Fact]
  public void IsValidRequestParams_rejects_params_with_meta_absent() =>
    Assert.False(Payload.IsValidRequestParams(Obj("{}")));

  [Fact]
  public void IsValidRequestParams_rejects_meta_that_is_not_an_object() =>
    Assert.False(Payload.IsValidRequestParams(Obj("""{"_meta":"bad"}""")));

  [Fact]
  public void IsValidRequestParams_accepts_an_empty_meta_object() =>
    Assert.True(Payload.IsValidRequestParams(Obj("""{"_meta":{}}""")));

  [Fact]
  public void IsValidRequestParams_accepts_extra_method_specific_members() =>
    Assert.True(Payload.IsValidRequestParams(Obj("""{"_meta":{},"cursor":"tok-1"}""")));

  // ─── NotificationParams base shape (AC-04.9 — R-3.7-b) ──────────────────────

  [Fact]
  public void IsValidNotificationParams_accepts_params_without_meta() =>
    Assert.True(Payload.IsValidNotificationParams(Obj("""{"progress":0.5}""")));

  [Fact]
  public void IsValidNotificationParams_accepts_params_with_meta_present() =>
    Assert.True(Payload.IsValidNotificationParams(Obj("""{"_meta":{"traceId":"abc"}}""")));

  [Fact]
  public void IsValidNotificationParams_rejects_meta_that_is_not_an_object() =>
    Assert.False(Payload.IsValidNotificationParams(Obj("""{"_meta":123}""")));

  // ─── ProgressToken (AC-04.10) ────────────────────────────────────────────────

  [Theory]
  [InlineData("\"abc-123\"", true)]
  [InlineData("7", true)]
  [InlineData("0", true)]
  [InlineData("null", false)]
  [InlineData("true", false)]
  [InlineData("{}", false)]
  public void IsValidProgressToken_accepts_only_strings_and_numbers(string json, bool valid) =>
    Assert.Equal(valid, Payload.IsValidProgressToken(Node(json)));

  // ─── Cursor (AC-04.11) ───────────────────────────────────────────────────────

  [Theory]
  [InlineData("\"eyJwYWdlIjozfQ==\"", true)]
  [InlineData("\"\"", true)] // empty string is permitted
  [InlineData("42", false)]
  [InlineData("null", false)]
  public void IsValidCursor_accepts_only_strings_including_empty(string json, bool valid) =>
    Assert.Equal(valid, Payload.IsValidCursor(Node(json)));

  // ─── error object (AC-04.12 — AC-04.16) ─────────────────────────────────────

  [Fact]
  public void IsValidError_accepts_a_well_formed_error() =>
    Assert.True(Payload.IsValidError(Obj("""{"code":-32601,"message":"Method not found"}""")));

  [Fact]
  public void IsValidError_rejects_a_missing_code() =>
    Assert.False(Payload.IsValidError(Obj("""{"message":"oops"}""")));

  [Fact]
  public void IsValidError_rejects_a_fractional_code() =>
    Assert.False(Payload.IsValidError(Obj("""{"code":-32601.5,"message":"err"}""")));

  [Fact]
  public void IsValidError_rejects_a_string_code() =>
    Assert.False(Payload.IsValidError(Obj("""{"code":"-32601","message":"err"}""")));

  [Theory]
  [InlineData("0")]
  [InlineData("-32700")]
  [InlineData("99999")] // any integer parses — code-range conformance is a protocol rule
  public void IsValidError_accepts_any_integer_code(string code) =>
    Assert.True(Payload.IsValidError(Obj("{\"code\":" + code + ",\"message\":\"err\"}")));

  [Fact]
  public void IsValidError_accepts_a_safe_integer_code_above_int_range()
  {
    // A code in (2^31, 2^53−1) is a valid safe integer even though it overflows a 32-bit int.
    Assert.True(Payload.IsValidError(Obj("""{"code":9007199254740991,"message":"err"}""")));
  }

  [Fact]
  public void IsValidError_rejects_a_code_above_the_safe_integer_range() =>
    // 2^53 (9007199254740992) exceeds the safe-integer maximum.
    Assert.False(Payload.IsValidError(Obj("""{"code":9007199254740992,"message":"err"}""")));

  [Fact]
  public void IsValidError_rejects_a_missing_message() =>
    Assert.False(Payload.IsValidError(Obj("""{"code":-32601}""")));

  [Fact]
  public void IsValidError_rejects_a_non_string_message() =>
    Assert.False(Payload.IsValidError(Obj("""{"code":-32601,"message":42}""")));

  [Fact]
  public void IsValidError_accepts_an_absent_data_member() =>
    Assert.True(Payload.IsValidError(Obj("""{"code":-32601,"message":"Method not found"}""")));

  [Theory]
  [InlineData("""{"method":"tools/list"}""")] // object
  [InlineData("\"extra detail\"")] // string
  [InlineData("123")] // number
  [InlineData("""[{"field":"name"}]""")] // array
  [InlineData("null")] // null
  public void IsValidError_accepts_any_data_shape(string dataJson) =>
    Assert.True(Payload.IsValidError(Obj("{\"code\":-32601,\"message\":\"err\",\"data\":" + dataJson + "}")));

  [Fact]
  public void IsValidError_rejects_a_non_object() =>
    Assert.False(Payload.IsValidError(Node("\"string error\"")));
}
