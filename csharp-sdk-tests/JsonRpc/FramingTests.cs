using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Tests.JsonRpc;

/// <summary>
/// Structural classification and (de)serialization of JSON-RPC messages (spec §3.1–§3.8),
/// including the malformed-message rejections required by §3.1/§22.
/// </summary>
public sealed class FramingTests
{
  [Fact]
  public void Classifies_request_with_id_and_method()
  {
    var message = JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":42,"method":"tools/list","params":{"_meta":{}}}""");

    var request = Assert.IsType<JsonRpcRequest>(message);
    Assert.Equal(new RequestId(42), request.Id);
    Assert.Equal("tools/list", request.Method);
    Assert.NotNull(request.Params);
  }

  [Fact]
  public void Classifies_notification_with_method_and_no_id()
  {
    var message = JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"abc","progress":0.5}}""");

    var notification = Assert.IsType<JsonRpcNotification>(message);
    Assert.Equal("notifications/progress", notification.Method);
  }

  [Fact]
  public void Classifies_success_response_with_result()
  {
    var message = JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":7,"result":{"resultType":"complete"}}""");

    var response = Assert.IsType<JsonRpcSuccessResponse>(message);
    Assert.Equal(new RequestId(7), response.Id);
    Assert.Equal("complete", response.Result["resultType"]!.GetValue<string>());
  }

  [Fact]
  public void Classifies_error_response_and_keeps_data()
  {
    var message = JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found","data":{"method":"x"}}}""");

    var response = Assert.IsType<JsonRpcErrorResponse>(message);
    Assert.Equal(new RequestId(1), response.Id);
    Assert.Equal(ErrorCodes.MethodNotFound, response.Error.Code);
    Assert.Equal("x", response.Error.Data!["method"]!.GetValue<string>());
  }

  [Fact]
  public void Error_response_may_omit_id()
  {
    var message = JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error"}}""");

    var response = Assert.IsType<JsonRpcErrorResponse>(message);
    Assert.Null(response.Id);
  }

  [Theory]
  [InlineData("[]", ErrorCodes.InvalidRequest)] // a batch array is malformed (§3.1)
  [InlineData("\"scalar\"", ErrorCodes.InvalidRequest)]
  [InlineData("""{"id":1,"method":"x"}""", ErrorCodes.InvalidRequest)] // missing jsonrpc
  [InlineData("""{"jsonrpc":"1.0","id":1,"method":"x"}""", ErrorCodes.InvalidRequest)] // wrong jsonrpc
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":"x","result":{}}""", ErrorCodes.InvalidRequest)] // method+result
  [InlineData("""{"jsonrpc":"2.0","id":1,"result":{},"error":{"code":-1,"message":"m"}}""", ErrorCodes.InvalidRequest)] // both
  public void Rejects_malformed_messages(string json, int expectedCode)
  {
    var error = Assert.Throws<McpError>(() => JsonRpcMessageSerializer.Parse(json));
    Assert.Equal(expectedCode, error.Code);
  }

  [Fact]
  public void Rejects_unparseable_text_with_parse_error()
  {
    var error = Assert.Throws<McpError>(() => JsonRpcMessageSerializer.Parse("{not json"));
    Assert.Equal(ErrorCodes.ParseError, error.Code);
  }

  [Fact]
  public void Rejects_positional_array_params()
  {
    var error = Assert.Throws<McpError>(() => JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":1,"method":"x","params":[1,2,3]}"""));
    Assert.Equal(ErrorCodes.InvalidRequest, error.Code);
  }

  [Fact]
  public void Round_trips_a_request_preserving_numeric_id()
  {
    var request = new JsonRpcRequest(99, "server/discover", new JsonObject { ["_meta"] = new JsonObject() });
    var text = JsonRpcMessageSerializer.Serialize(request);

    Assert.Contains("\"id\":99", text);
    var reparsed = Assert.IsType<JsonRpcRequest>(JsonRpcMessageSerializer.Parse(text));
    Assert.Equal(request.Id, reparsed.Id);
    Assert.True(reparsed.Id.IsNumber);
  }

  [Fact]
  public void Round_trips_a_request_preserving_string_id()
  {
    var request = new JsonRpcRequest("call-1", "tools/call");
    var text = JsonRpcMessageSerializer.Serialize(request);

    Assert.Contains("\"id\":\"call-1\"", text);
    var reparsed = Assert.IsType<JsonRpcRequest>(JsonRpcMessageSerializer.Parse(text));
    Assert.True(reparsed.Id.IsString);
    Assert.Equal(request.Id, reparsed.Id);
  }

  [Fact]
  public void Numeric_and_string_ids_never_compare_equal()
  {
    Assert.NotEqual(new RequestId(1), new RequestId("1"));
  }

  // ─── idEchoMatches — type fidelity (AC-03.7 — R-3.2-e, R-3.2-f, R-3.2-g) ─────

  [Fact]
  public void IdEchoMatches_matches_a_number_id_by_number() =>
    Assert.True(Framing.IdEchoMatches(new RequestId(7), new RequestId(7)));

  [Fact]
  public void IdEchoMatches_matches_a_string_id_by_string() =>
    Assert.True(Framing.IdEchoMatches(new RequestId("req-1"), new RequestId("req-1")));

  [Fact]
  public void IdEchoMatches_does_not_coerce_number_7_to_string_7() =>
    Assert.False(Framing.IdEchoMatches(new RequestId(7), new RequestId("7")));

  [Fact]
  public void IdEchoMatches_does_not_coerce_string_7_to_number_7() =>
    Assert.False(Framing.IdEchoMatches(new RequestId("7"), new RequestId(7)));

  [Fact]
  public void IdEchoMatches_rejects_different_number_values() =>
    Assert.False(Framing.IdEchoMatches(new RequestId(1), new RequestId(2)));

  [Fact]
  public void IdEchoMatches_rejects_different_string_values() =>
    Assert.False(Framing.IdEchoMatches(new RequestId("a"), new RequestId("b")));

  // ─── InFlightTracker (AC-03.6 — R-3.2-c, R-3.2-d) ───────────────────────────

  [Fact]
  public void InFlightTracker_tracks_a_registered_id()
  {
    var tracker = new InFlightTracker();
    tracker.Register(new RequestId(1));
    Assert.True(tracker.Has(new RequestId(1)));
  }

  [Fact]
  public void InFlightTracker_throws_when_the_same_id_is_registered_twice()
  {
    var tracker = new InFlightTracker();
    tracker.Register(new RequestId(1));
    Assert.Throws<InvalidOperationException>(() => tracker.Register(new RequestId(1)));
  }

  [Fact]
  public void InFlightTracker_allows_reuse_after_completion()
  {
    var tracker = new InFlightTracker();
    tracker.Register(new RequestId(1));
    tracker.Complete(new RequestId(1));
    var exception = Record.Exception(() => tracker.Register(new RequestId(1)));
    Assert.Null(exception);
  }

  [Fact]
  public void InFlightTracker_keeps_string_and_number_ids_with_the_same_text_distinct()
  {
    var tracker = new InFlightTracker();
    tracker.Register(new RequestId(1));
    // Registering "1" (string) does not collide with 1 (number).
    var exception = Record.Exception(() => tracker.Register(new RequestId("1")));
    Assert.Null(exception);
    Assert.True(tracker.Has(new RequestId(1)));
    Assert.True(tracker.Has(new RequestId("1")));
  }

  [Fact]
  public void InFlightTracker_size_reflects_the_number_in_flight()
  {
    var tracker = new InFlightTracker();
    tracker.Register(new RequestId(1));
    tracker.Register(new RequestId(2));
    Assert.Equal(2, tracker.Size);
    tracker.Complete(new RequestId(1));
    Assert.Equal(1, tracker.Size);
  }

  [Fact]
  public void InFlightTracker_outstanding_is_empty_when_nothing_in_flight() =>
    Assert.Empty(new InFlightTracker().Outstanding);

  [Fact]
  public void InFlightTracker_outstanding_reflects_current_in_flight_ids()
  {
    var tracker = new InFlightTracker();
    tracker.Register(new RequestId(42));
    tracker.Register(new RequestId("req-2"));
    var outstanding = tracker.Outstanding;
    Assert.Equal(2, outstanding.Count);
    Assert.Contains(new RequestId(42), outstanding);
    Assert.Contains(new RequestId("req-2"), outstanding);
  }

  [Fact]
  public void InFlightTracker_complete_is_safe_for_an_untracked_id()
  {
    var tracker = new InFlightTracker();
    var exception = Record.Exception(() => tracker.Complete(new RequestId(99)));
    Assert.Null(exception);
    Assert.Equal(0, tracker.Size);
  }

  // ─── MalformedMessageError — stable code ─────────────────────────────────────

  [Fact]
  public void MalformedMessageError_carries_the_stable_code()
  {
    var error = new MalformedMessageError("a reason");
    Assert.Equal("MALFORMED_MESSAGE", error.Code);
    Assert.Contains("a reason", error.Message);
  }

  // ─── Numeric id safe-integer enforcement at parse (§2.5 / R-3.2) ─────────────

  [Theory]
  [InlineData("""{"jsonrpc":"2.0","id":1.5,"method":"ping"}""")] // fractional id
  [InlineData("""{"jsonrpc":"2.0","id":9007199254740992,"method":"ping"}""")] // 2^53 (out of safe range)
  public void Parse_rejects_a_numeric_id_that_is_not_a_safe_integer(string json)
  {
    var error = Assert.Throws<McpError>(() => JsonRpcMessageSerializer.Parse(json));
    Assert.Equal(ErrorCodes.InvalidRequest, error.Code);
  }

  [Theory]
  [InlineData("""{"jsonrpc":"2.0","id":9007199254740991,"method":"ping"}""")] // 2^53 − 1 (max safe)
  [InlineData("""{"jsonrpc":"2.0","id":-9007199254740991,"method":"ping"}""")] // min safe
  public void Parse_accepts_a_numeric_id_at_the_safe_integer_boundary(string json)
  {
    var request = Assert.IsType<JsonRpcRequest>(JsonRpcMessageSerializer.Parse(json));
    Assert.True(request.Id.IsNumber);
  }
}
