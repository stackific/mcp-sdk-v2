using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Tests.JsonRpc;

/// <summary>
/// The JSON-RPC request dispatcher <see cref="Dispatch.DispatchRequest"/> (spec §3.3): method
/// not found (−32601), per-method params-required (−32602), schema invalid-params (−32602), and id
/// echo with type fidelity. Mirrors the TypeScript <c>dispatch.test.ts</c> coverage (AC-03.11,
/// AC-03.12).
/// </summary>
public sealed class DispatchTests
{
  /// <summary>Classifies <paramref name="rawJson"/> and extracts the request it must represent.</summary>
  /// <param name="rawJson">The raw JSON-RPC request text.</param>
  /// <returns>The classified <see cref="JsonRpcRequest"/>.</returns>
  private static JsonRpcRequest MakeRequest(string rawJson)
  {
    var message = JsonRpcMessageSerializer.Parse(rawJson);
    return Assert.IsType<JsonRpcRequest>(message);
  }

  /// <summary>A validator that accepts a params object only when it has a string <c>name</c> member.</summary>
  private static bool RequireStringName(JsonObject prms) =>
    prms["name"] is JsonValue v && v.GetValueKind() == System.Text.Json.JsonValueKind.String;

  // ─── method-not-found (AC-03.12 — R-3.3-j) ──────────────────────────────────

  private static MethodRegistry KnownMethodsRegistry() => new(new[]
  {
    new KeyValuePair<string, MethodDescriptor>("tools/call", new MethodDescriptor()),
    new KeyValuePair<string, MethodDescriptor>("ping", new MethodDescriptor()),
  });

  [Fact]
  public void Returns_failure_when_method_is_absent_from_registry()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":1,"method":"unknown/method"}""");
    var outcome = Dispatch.DispatchRequest(req, KnownMethodsRegistry());
    Assert.False(outcome.Ok);
  }

  [Fact]
  public void Method_not_found_carries_code_minus_32601()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":1,"method":"noSuchMethod"}""");
    var outcome = Dispatch.DispatchRequest(req, KnownMethodsRegistry());
    Assert.False(outcome.Ok);
    Assert.Equal(ErrorCodes.MethodNotFound, outcome.Response!.Error.Code);
  }

  [Fact]
  public void Error_response_echoes_a_numeric_id_with_the_same_value_and_type()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":42,"method":"nope"}""");
    var outcome = Dispatch.DispatchRequest(req, KnownMethodsRegistry());
    Assert.False(outcome.Ok);
    Assert.Equal(new RequestId(42), outcome.Response!.Id);
    Assert.True(outcome.Response.Id!.Value.IsNumber);
  }

  [Fact]
  public void Error_response_echoes_a_string_id_with_the_same_value_and_type()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":"req-99","method":"nope"}""");
    var outcome = Dispatch.DispatchRequest(req, KnownMethodsRegistry());
    Assert.False(outcome.Ok);
    Assert.Equal(new RequestId("req-99"), outcome.Response!.Id);
    Assert.True(outcome.Response.Id!.Value.IsString);
  }

  [Fact]
  public void Method_names_are_case_sensitive()
  {
    // "Ping" is not "ping".
    var req = MakeRequest("""{"jsonrpc":"2.0","id":2,"method":"Ping"}""");
    var outcome = Dispatch.DispatchRequest(req, KnownMethodsRegistry());
    Assert.False(outcome.Ok);
    Assert.Equal(ErrorCodes.MethodNotFound, outcome.Response!.Error.Code);
  }

  [Theory]
  [InlineData("""{"jsonrpc":"2.0","id":3,"method":"ping"}""")]
  [InlineData("""{"jsonrpc":"2.0","id":4,"method":"tools/call"}""")]
  public void Returns_success_for_a_known_method(string rawJson)
  {
    var outcome = Dispatch.DispatchRequest(MakeRequest(rawJson), KnownMethodsRegistry());
    Assert.True(outcome.Ok);
    Assert.Null(outcome.Response);
  }

  // ─── invalid-params from schema (AC-03.12 — R-3.3-k) ─────────────────────────

  private static MethodRegistry SchemaRegistry() => new(new[]
  {
    new KeyValuePair<string, MethodDescriptor>(
      "tools/call", new MethodDescriptor { ParamsValidator = RequireStringName }),
    new KeyValuePair<string, MethodDescriptor>("ping", new MethodDescriptor()),
  });

  [Fact]
  public void Returns_invalid_params_when_params_fail_the_validator()
  {
    var req = MakeRequest(
      """{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":99}}""");
    var outcome = Dispatch.DispatchRequest(req, SchemaRegistry());
    Assert.False(outcome.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, outcome.Response!.Error.Code);
    Assert.Equal(new RequestId(10), outcome.Response.Id);
  }

  [Fact]
  public void Returns_success_when_params_satisfy_the_validator()
  {
    var req = MakeRequest(
      """{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"search","arguments":{"query":"mcp"}}}""");
    var outcome = Dispatch.DispatchRequest(req, SchemaRegistry());
    Assert.True(outcome.Ok);
  }

  [Fact]
  public void Skips_validation_when_method_has_no_validator()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":12,"method":"ping"}""");
    var outcome = Dispatch.DispatchRequest(req, SchemaRegistry());
    Assert.True(outcome.Ok);
  }

  [Fact]
  public void Skips_validation_when_params_is_absent_and_not_required()
  {
    // params absent — no validator check runs because RequiresParams is not set.
    var req = MakeRequest("""{"jsonrpc":"2.0","id":13,"method":"tools/call"}""");
    var outcome = Dispatch.DispatchRequest(req, SchemaRegistry());
    Assert.True(outcome.Ok);
  }

  // ─── requiresParams / per-request _meta REQUIRED (AC-03.11 — R-3.3-i) ───────

  private static MethodRegistry RequiresParamsRegistry() => new(new[]
  {
    new KeyValuePair<string, MethodDescriptor>(
      "meta/required", new MethodDescriptor { RequiresParams = true }),
    new KeyValuePair<string, MethodDescriptor>("meta/optional", new MethodDescriptor()),
    new KeyValuePair<string, MethodDescriptor>(
      "meta/both",
      new MethodDescriptor { RequiresParams = true, ParamsValidator = RequireKeyString }),
  });

  /// <summary>Validator requiring a string <c>key</c> member.</summary>
  private static bool RequireKeyString(JsonObject prms) =>
    prms["key"] is JsonValue v && v.GetValueKind() == System.Text.Json.JsonValueKind.String;

  [Fact]
  public void Returns_invalid_params_when_requiresParams_and_params_absent()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":20,"method":"meta/required"}""");
    var outcome = Dispatch.DispatchRequest(req, RequiresParamsRegistry());
    Assert.False(outcome.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, outcome.Response!.Error.Code);
  }

  [Fact]
  public void Returns_success_when_requiresParams_and_params_present()
  {
    var req = MakeRequest(
      """{"jsonrpc":"2.0","id":21,"method":"meta/required","params":{"_meta":{"key":"value"}}}""");
    var outcome = Dispatch.DispatchRequest(req, RequiresParamsRegistry());
    Assert.True(outcome.Ok);
  }

  [Fact]
  public void Returns_success_when_requiresParams_unset_and_params_absent()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":22,"method":"meta/optional"}""");
    var outcome = Dispatch.DispatchRequest(req, RequiresParamsRegistry());
    Assert.True(outcome.Ok);
  }

  [Fact]
  public void Validates_schema_even_when_requiresParams_is_true()
  {
    // Both checks active: params present (passes requiresParams) but fails the validator.
    var req = MakeRequest(
      """{"jsonrpc":"2.0","id":23,"method":"meta/both","params":{"key":42}}""");
    var outcome = Dispatch.DispatchRequest(req, RequiresParamsRegistry());
    Assert.False(outcome.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, outcome.Response!.Error.Code);
  }

  // ─── empty registry edge case ─────────────────────────────────────────────────

  [Fact]
  public void Empty_registry_rejects_any_method_with_method_not_found()
  {
    var req = MakeRequest("""{"jsonrpc":"2.0","id":30,"method":"anything"}""");
    var outcome = Dispatch.DispatchRequest(req, MethodRegistry.Empty);
    Assert.False(outcome.Ok);
    Assert.Equal(ErrorCodes.MethodNotFound, outcome.Response!.Error.Code);
  }
}
