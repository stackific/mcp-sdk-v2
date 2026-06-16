using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Tests.JsonRpc;

/// <summary>
/// Exhaustive structural classification and round-tripping of single JSON-RPC messages
/// (spec §3.1–§3.8/§22), and the full set of malformed-message rejections required by
/// §3.1: a message MUST be a single object carrying exactly one of request / notification /
/// success-response / error-response shapes, with <c>jsonrpc == "2.0"</c>.
/// </summary>
public sealed class MessageFramingTests
{
  // --- Well-formed classification: each valid shape parses to its message type. ---

  [Fact]
  public void Parses_a_request_with_object_params()
  {
    var message = JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"cursor":"c"}}""");

    var request = Assert.IsType<JsonRpcRequest>(message);
    Assert.Equal(new RequestId(1), request.Id);
    Assert.Equal("tools/list", request.Method);
    Assert.Equal("c", request.Params!["cursor"]!.GetValue<string>());
  }

  [Fact]
  public void Parses_a_request_with_a_string_id()
  {
    var request = Assert.IsType<JsonRpcRequest>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":"abc","method":"ping"}"""));
    Assert.True(request.Id.IsString);
    Assert.Null(request.Params);
  }

  [Fact]
  public void Parses_a_notification_with_no_id()
  {
    var notification = Assert.IsType<JsonRpcNotification>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}"""));
    Assert.Equal("notifications/cancelled", notification.Method);
    Assert.NotNull(notification.Params);
  }

  [Fact]
  public void Parses_a_notification_with_no_params()
  {
    var notification = Assert.IsType<JsonRpcNotification>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","method":"notifications/initialized"}"""));
    Assert.Null(notification.Params);
  }

  [Fact]
  public void Parses_a_success_response()
  {
    var success = Assert.IsType<JsonRpcSuccessResponse>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":3,"result":{"resultType":"ok","value":7}}"""));
    Assert.Equal(new RequestId(3), success.Id);
    Assert.Equal("ok", success.Result["resultType"]!.GetValue<string>());
  }

  [Fact]
  public void Parses_an_error_response_with_id()
  {
    var error = Assert.IsType<JsonRpcErrorResponse>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found","data":{"method":"x"}}}"""));
    Assert.Equal(new RequestId(5), error.Id);
    Assert.Equal(ErrorCodes.MethodNotFound, error.Error.Code);
    Assert.Equal("Method not found", error.Error.Message);
    Assert.Equal("x", error.Error.Data!["method"]!.GetValue<string>());
  }

  [Fact]
  public void Parses_an_error_response_without_data()
  {
    var error = Assert.IsType<JsonRpcErrorResponse>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":5,"error":{"code":-32602,"message":"Invalid params"}}"""));
    Assert.Null(error.Error.Data);
  }

  [Fact]
  public void Parses_an_error_response_omitting_the_id()
  {
    // §22.6: the id MAY be absent when the originating request's id is undeterminable.
    var error = Assert.IsType<JsonRpcErrorResponse>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error"}}"""));
    Assert.Null(error.Id);
    Assert.Equal(ErrorCodes.ParseError, error.Error.Code);
  }

  [Fact]
  public void Parses_an_error_response_with_an_explicit_null_id()
  {
    // An id present-but-null is treated as "no id" (§22.6).
    var error = Assert.IsType<JsonRpcErrorResponse>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}"""));
    Assert.Null(error.Id);
  }

  // --- Classification of many valid shapes by expected runtime type. ---

  public static IEnumerable<object[]> ValidShapes()
  {
    yield return new object[] { """{"jsonrpc":"2.0","id":1,"method":"m"}""", typeof(JsonRpcRequest) };
    yield return new object[] { """{"jsonrpc":"2.0","id":"s","method":"m"}""", typeof(JsonRpcRequest) };
    yield return new object[] { """{"jsonrpc":"2.0","id":1,"method":"m","params":{}}""", typeof(JsonRpcRequest) };
    yield return new object[] { """{"jsonrpc":"2.0","method":"m"}""", typeof(JsonRpcNotification) };
    yield return new object[] { """{"jsonrpc":"2.0","method":"m","params":{}}""", typeof(JsonRpcNotification) };
    yield return new object[] { """{"jsonrpc":"2.0","method":"m","params":null}""", typeof(JsonRpcNotification) };
    yield return new object[] { """{"jsonrpc":"2.0","id":1,"result":{}}""", typeof(JsonRpcSuccessResponse) };
    yield return new object[] { """{"jsonrpc":"2.0","id":"x","result":{"a":1}}""", typeof(JsonRpcSuccessResponse) };
    yield return new object[] { """{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"m"}}""", typeof(JsonRpcErrorResponse) };
    yield return new object[] { """{"jsonrpc":"2.0","error":{"code":-1,"message":"m"}}""", typeof(JsonRpcErrorResponse) };
  }

  [Theory]
  [MemberData(nameof(ValidShapes))]
  public void Classifies_valid_shapes(string json, Type expected)
  {
    Assert.IsType(expected, JsonRpcMessageSerializer.Parse(json));
  }

  // --- Malformed: every structural rejection maps to InvalidRequest (-32600). ---

  [Theory]
  // Top-level must be a single object (no batches, no scalars).
  [InlineData("[]")]
  [InlineData("""[{"jsonrpc":"2.0","id":1,"method":"m"}]""")]
  [InlineData("\"scalar\"")]
  [InlineData("42")]
  [InlineData("true")]
  [InlineData("null")]
  // jsonrpc member missing / wrong / wrong type.
  [InlineData("""{"id":1,"method":"m"}""")]
  [InlineData("""{"jsonrpc":"1.0","id":1,"method":"m"}""")]
  [InlineData("""{"jsonrpc":"2.1","id":1,"method":"m"}""")]
  [InlineData("""{"jsonrpc":2.0,"id":1,"method":"m"}""")]
  [InlineData("""{"jsonrpc":null,"id":1,"method":"m"}""")]
  [InlineData("""{"jsonrpc":true,"id":1,"method":"m"}""")]
  // method together with result or error.
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":"m","result":{}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":"m","error":{"code":-1,"message":"m"}}""")]
  // result and error together.
  [InlineData("""{"jsonrpc":"2.0","id":1,"result":{},"error":{"code":-1,"message":"m"}}""")]
  // method present but not a string.
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":123}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":null}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":["m"]}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":{}}""")]
  // params present but not an object (no positional arrays / scalars).
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":"m","params":[1,2,3]}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":"m","params":7}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":"m","params":"s"}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"method":"m","params":true}""")]
  // success response with non-object result.
  [InlineData("""{"jsonrpc":"2.0","id":1,"result":[1,2,3]}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"result":7}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"result":"s"}""")]
  // success response with no id.
  [InlineData("""{"jsonrpc":"2.0","result":{}}""")]
  // request id of an illegal JSON type.
  [InlineData("""{"jsonrpc":"2.0","id":[1],"method":"m"}""")]
  [InlineData("""{"jsonrpc":"2.0","id":{},"method":"m"}""")]
  [InlineData("""{"jsonrpc":"2.0","id":true,"method":"m"}""")]
  // error object malformed: missing/non-integer code, missing/non-string message.
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":{"message":"m"}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":{"code":"x","message":"m"}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":{"code":1.5,"message":"m"}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":{"code":null,"message":"m"}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":{"code":-1}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":42}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":null}}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1,"error":"oops"}""")]
  // an object that matches no shape at all.
  [InlineData("""{"jsonrpc":"2.0"}""")]
  [InlineData("""{"jsonrpc":"2.0","id":1}""")]
  public void Rejects_structurally_invalid_messages_with_invalid_request(string json)
  {
    var error = Assert.Throws<McpError>(() => JsonRpcMessageSerializer.Parse(json));
    Assert.Equal(ErrorCodes.InvalidRequest, error.Code);
  }

  // --- Unparseable bytes map to ParseError (-32700). ---

  [Theory]
  [InlineData("{not json")]
  [InlineData("")]
  [InlineData("{\"jsonrpc\":")]
  [InlineData("{'jsonrpc':'2.0'}")] // single quotes are not valid JSON
  [InlineData("{\"jsonrpc\":\"2.0\",}")] // trailing comma disallowed
  [InlineData("undefined")]
  public void Rejects_unparseable_text_with_parse_error(string json)
  {
    var error = Assert.Throws<McpError>(() => JsonRpcMessageSerializer.Parse(json));
    Assert.Equal(ErrorCodes.ParseError, error.Code);
  }

  // --- Round-trip: serialize then parse, preserving every field. ---

  [Fact]
  public void Round_trips_a_request_preserving_numeric_id_and_params()
  {
    var original = new JsonRpcRequest(99, "server/discover", new JsonObject { ["cursor"] = "c" });
    var reparsed = Assert.IsType<JsonRpcRequest>(
      JsonRpcMessageSerializer.Parse(JsonRpcMessageSerializer.Serialize(original)));

    Assert.Equal(original.Id, reparsed.Id);
    Assert.True(reparsed.Id.IsNumber);
    Assert.Equal("server/discover", reparsed.Method);
    Assert.Equal("c", reparsed.Params!["cursor"]!.GetValue<string>());
  }

  [Fact]
  public void Round_trips_a_request_preserving_string_id()
  {
    var original = new JsonRpcRequest("call-1", "tools/call");
    var reparsed = Assert.IsType<JsonRpcRequest>(
      JsonRpcMessageSerializer.Parse(JsonRpcMessageSerializer.Serialize(original)));

    Assert.True(reparsed.Id.IsString);
    Assert.Equal(original.Id, reparsed.Id);
  }

  [Fact]
  public void Round_trips_a_notification()
  {
    var original = new JsonRpcNotification("notifications/progress", new JsonObject { ["progress"] = 0.5 });
    var reparsed = Assert.IsType<JsonRpcNotification>(
      JsonRpcMessageSerializer.Parse(JsonRpcMessageSerializer.Serialize(original)));

    Assert.Equal("notifications/progress", reparsed.Method);
    Assert.Equal(0.5, reparsed.Params!["progress"]!.GetValue<double>());
  }

  [Fact]
  public void Round_trips_a_success_response()
  {
    var original = new JsonRpcSuccessResponse(7, new JsonObject { ["resultType"] = "complete", ["n"] = 3 });
    var reparsed = Assert.IsType<JsonRpcSuccessResponse>(
      JsonRpcMessageSerializer.Parse(JsonRpcMessageSerializer.Serialize(original)));

    Assert.Equal(original.Id, reparsed.Id);
    Assert.Equal("complete", reparsed.Result["resultType"]!.GetValue<string>());
    Assert.Equal(3, reparsed.Result["n"]!.GetValue<int>());
  }

  [Fact]
  public void Round_trips_an_error_response_preserving_data()
  {
    var original = new JsonRpcErrorResponse(1, new JsonRpcError(-32602, "Invalid params",
      new JsonObject { ["toolName"] = "search" }));
    var reparsed = Assert.IsType<JsonRpcErrorResponse>(
      JsonRpcMessageSerializer.Parse(JsonRpcMessageSerializer.Serialize(original)));

    Assert.Equal(original.Id, reparsed.Id);
    Assert.Equal(-32602, reparsed.Error.Code);
    Assert.Equal("Invalid params", reparsed.Error.Message);
    Assert.Equal("search", reparsed.Error.Data!["toolName"]!.GetValue<string>());
  }

  [Fact]
  public void Serializes_an_error_response_omitting_an_absent_id()
  {
    var message = new JsonRpcErrorResponse(null, new JsonRpcError(-32700, "Parse error"));
    var text = JsonRpcMessageSerializer.Serialize(message);

    Assert.DoesNotContain("\"id\"", text);
    var reparsed = Assert.IsType<JsonRpcErrorResponse>(JsonRpcMessageSerializer.Parse(text));
    Assert.Null(reparsed.Id);
  }

  [Fact]
  public void Serialized_messages_always_carry_jsonrpc_two_point_zero()
  {
    var text = JsonRpcMessageSerializer.Serialize(new JsonRpcNotification("m"));
    Assert.Contains("\"jsonrpc\":\"2.0\"", text);
  }

  // --- FromNode accepts an already-parsed node and applies the same rules. ---

  [Fact]
  public void FromNode_classifies_a_prebuilt_object()
  {
    var node = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 1, ["method"] = "m" };
    Assert.IsType<JsonRpcRequest>(JsonRpcMessageSerializer.FromNode(node));
  }

  [Fact]
  public void FromNode_rejects_a_null_node_as_invalid_request()
  {
    var error = Assert.Throws<McpError>(() => JsonRpcMessageSerializer.FromNode(null));
    Assert.Equal(ErrorCodes.InvalidRequest, error.Code);
  }

  [Fact]
  public void Parsed_params_are_detached_from_the_source_document()
  {
    // ReadParams deep-clones, so mutating the parsed message never touches the original text.
    var request = Assert.IsType<JsonRpcRequest>(JsonRpcMessageSerializer.Parse(
      """{"jsonrpc":"2.0","id":1,"method":"m","params":{"a":1}}"""));
    request.Params!["a"] = 2;
    Assert.Equal(2, request.Params["a"]!.GetValue<int>());
  }
}
