using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Tests.JsonRpc;

/// <summary>
/// The wire-contract error-code registry (spec §22.2/§22.3, Appendix B) and the
/// <see cref="McpError"/> factory methods that produce them, including the normative
/// <c>data</c> shapes attached to capability/version/method errors and the projection of
/// an <see cref="McpError"/> onto a <see cref="JsonRpcError"/>.
/// </summary>
public sealed class ErrorCodesTests
{
  // --- Every constant matches its Appendix B value exactly. ---

  [Theory]
  [InlineData(ErrorCodes.ParseError, -32700)]
  [InlineData(ErrorCodes.InvalidRequest, -32600)]
  [InlineData(ErrorCodes.MethodNotFound, -32601)]
  [InlineData(ErrorCodes.InvalidParams, -32602)]
  [InlineData(ErrorCodes.InternalError, -32603)]
  [InlineData(ErrorCodes.MissingRequiredClientCapability, -32003)]
  [InlineData(ErrorCodes.UnsupportedProtocolVersion, -32004)]
  [InlineData(ErrorCodes.HeaderMismatch, -32001)]
  public void Error_code_constants_have_their_normative_values(int actual, int expected)
  {
    Assert.Equal(expected, actual);
  }

  // --- Factories carry the right code and a non-empty, human-readable message. ---

  public static IEnumerable<object[]> Factories()
  {
    yield return new object[] { McpError.ParseError(), ErrorCodes.ParseError };
    yield return new object[] { McpError.ParseError("custom"), ErrorCodes.ParseError };
    yield return new object[] { McpError.InvalidRequest("bad"), ErrorCodes.InvalidRequest };
    yield return new object[] { McpError.MethodNotFound("tools/x"), ErrorCodes.MethodNotFound };
    yield return new object[] { McpError.InvalidParams("bad params"), ErrorCodes.InvalidParams };
    yield return new object[] { McpError.InternalError("boom"), ErrorCodes.InternalError };
    yield return new object[] { McpError.UnsupportedProtocolVersion(new[] { "2026-07-28" }, "2025-01-01"), ErrorCodes.UnsupportedProtocolVersion };
    yield return new object[] { McpError.MissingRequiredClientCapability(new JsonObject { ["sampling"] = new JsonObject() }), ErrorCodes.MissingRequiredClientCapability };
    yield return new object[] { McpError.HeaderMismatch("mismatch"), ErrorCodes.HeaderMismatch };
  }

  [Theory]
  [MemberData(nameof(Factories))]
  public void Factory_sets_the_expected_code(McpError error, int expectedCode)
  {
    Assert.Equal(expectedCode, error.Code);
  }

  [Theory]
  [MemberData(nameof(Factories))]
  public void Factory_produces_a_non_empty_message(McpError error, int expectedCode)
  {
    _ = expectedCode;
    Assert.False(string.IsNullOrWhiteSpace(error.Message));
  }

  // --- ParseError: default message, and message override. ---

  [Fact]
  public void ParseError_uses_a_default_message_when_none_is_given()
  {
    Assert.Equal("Parse error: invalid JSON.", McpError.ParseError().Message);
  }

  [Fact]
  public void ParseError_honors_a_custom_message()
  {
    Assert.Equal("nope", McpError.ParseError("nope").Message);
  }

  [Fact]
  public void Simple_factories_carry_no_data()
  {
    Assert.Null(McpError.ParseError().ErrorData);
    Assert.Null(McpError.InvalidRequest("x").ErrorData);
    Assert.Null(McpError.InternalError("x").ErrorData);
    Assert.Null(McpError.HeaderMismatch("x").ErrorData);
  }

  [Fact]
  public void InvalidParams_propagates_supplied_data()
  {
    var data = new JsonObject { ["uri"] = "file:///x" };
    var error = McpError.InvalidParams("bad uri", data);
    Assert.Same(data, error.ErrorData);
  }

  [Fact]
  public void InvalidParams_without_data_is_null()
  {
    Assert.Null(McpError.InvalidParams("bad").ErrorData);
  }

  // --- MethodNotFound: data.method echoes the offending method, message names it. ---

  [Theory]
  [InlineData("tools/call")]
  [InlineData("resources/read")]
  [InlineData("completion/complete")]
  public void MethodNotFound_echoes_the_method_in_data(string method)
  {
    var error = McpError.MethodNotFound(method);
    Assert.Equal(method, error.ErrorData!["method"]!.GetValue<string>());
    Assert.Contains(method, error.Message);
  }

  // --- UnsupportedProtocolVersion: data has supported[] and requested. ---

  [Fact]
  public void UnsupportedProtocolVersion_lists_supported_and_requested()
  {
    var error = McpError.UnsupportedProtocolVersion(new[] { "2026-07-28", "2027-01-01" }, "2025-01-01");
    var data = error.ErrorData!;

    var supported = Assert.IsType<JsonArray>(data["supported"]);
    Assert.Equal(2, supported.Count);
    Assert.Equal("2026-07-28", supported[0]!.GetValue<string>());
    Assert.Equal("2027-01-01", supported[1]!.GetValue<string>());
    Assert.Equal("2025-01-01", data["requested"]!.GetValue<string>());
  }

  [Fact]
  public void UnsupportedProtocolVersion_handles_a_single_supported_revision()
  {
    var error = McpError.UnsupportedProtocolVersion(new[] { "2026-07-28" }, "old");
    var supported = Assert.IsType<JsonArray>(error.ErrorData!["supported"]);
    Assert.Single(supported);
  }

  // --- MissingRequiredClientCapability: data.requiredCapabilities holds the shape. ---

  [Fact]
  public void MissingRequiredClientCapability_wraps_the_required_capabilities()
  {
    var required = new JsonObject { ["sampling"] = new JsonObject(), ["elicitation"] = new JsonObject() };
    var error = McpError.MissingRequiredClientCapability(required);
    var wrapped = error.ErrorData!["requiredCapabilities"]!;

    Assert.IsType<JsonObject>(wrapped["sampling"]);
    Assert.IsType<JsonObject>(wrapped["elicitation"]);
  }

  [Fact]
  public void MissingRequiredClientCapability_deep_clones_the_input()
  {
    // The factory clones so later mutation of the caller's node never alters the error.
    var required = new JsonObject { ["sampling"] = new JsonObject() };
    var error = McpError.MissingRequiredClientCapability(required);
    required["sampling"] = null;

    Assert.IsType<JsonObject>(error.ErrorData!["requiredCapabilities"]!["sampling"]);
  }

  // --- ToJsonRpcError projects code, message, and (cloned) data onto the wire object. ---

  [Fact]
  public void ToJsonRpcError_carries_code_and_message()
  {
    var wire = McpError.InvalidRequest("bad").ToJsonRpcError();
    Assert.Equal(ErrorCodes.InvalidRequest, wire.Code);
    Assert.Equal("bad", wire.Message);
    Assert.Null(wire.Data);
  }

  [Fact]
  public void ToJsonRpcError_carries_data_when_present()
  {
    var wire = McpError.MethodNotFound("tools/x").ToJsonRpcError();
    Assert.Equal(ErrorCodes.MethodNotFound, wire.Code);
    Assert.Equal("tools/x", wire.Data!["method"]!.GetValue<string>());
  }

  [Fact]
  public void ToJsonRpcError_clones_data_so_the_wire_object_is_independent()
  {
    var error = McpError.MethodNotFound("tools/x");
    var wire = error.ToJsonRpcError();
    error.ErrorData!["method"] = "mutated";

    Assert.Equal("tools/x", wire.Data!["method"]!.GetValue<string>());
  }

  [Fact]
  public void Custom_constructor_round_trips_through_ToJsonRpcError()
  {
    var error = new McpError(-32099, "server error", new JsonObject { ["detail"] = 1 });
    var wire = error.ToJsonRpcError();

    Assert.Equal(-32099, wire.Code);
    Assert.Equal("server error", wire.Message);
    Assert.Equal(1, wire.Data!["detail"]!.GetValue<int>());
  }

  [Fact]
  public void McpError_is_an_exception()
  {
    Assert.IsAssignableFrom<Exception>(McpError.InternalError("x"));
  }
}
