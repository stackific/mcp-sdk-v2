using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Exhaustive behaviour tests for the <see cref="McpServer"/> dispatch runtime, driven both through the
/// in-memory client/server harness and — where a malformed envelope must be injected — directly against
/// <see cref="McpServer.HandleRequestAsync"/>. The cases target capability gating (§22.2), protocol-version
/// rejection and missing <c>_meta</c> keys (§5), argument and schema validation (§16.4/§16.6), pagination
/// (§12), resource reads with cache hints (§13/§17), prompts (§18), completion (§19), and ping/unknown-method
/// routing (§22). All assertions are on error CODES (<see cref="ErrorCodes"/>), never message text.
/// </summary>
public sealed class RuntimeDispatchTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  // ───────────────────────── Server fixtures ─────────────────────────

  /// <summary>A fully-featured server advertising every capability the gating tests exercise.</summary>
  private static McpServer FullServer(int pageSize = 50)
  {
    var server = new McpServer(
      new Implementation { Name = "full", Title = "Full Server", Version = "1.0.0" },
      new ServerCapabilities
      {
        Tools = new ToolsCapability { ListChanged = true },
        Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
        Prompts = new PromptsCapability { ListChanged = true },
        Completions = new JsonObject(),
        Logging = new JsonObject(),
      },
      instructions: "Full server for dispatch tests.")
    { PageSize = pageSize };

    server.RegisterTool(
      new Tool { Name = "add", InputSchema = Obj("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText((ctx.GetDouble("a") + ctx.GetDouble("b")).ToString(CultureInfo.InvariantCulture))));

    server.RegisterTool(
      new Tool { Name = "echo", InputSchema = Obj("""{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("text"))));

    // A tool whose schema constrains a "mode" enum and a "level" integer, used by the validation matrix.
    server.RegisterTool(
      new Tool { Name = "configure", InputSchema = Obj("""{"type":"object","properties":{"mode":{"type":"string","enum":["fast","slow"]},"level":{"type":"integer"},"flag":{"type":"boolean"}},"required":["mode"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("mode"))));

    // A tool whose handler signals a soft error → isError=true result, not a protocol error.
    server.RegisterTool(
      new Tool { Name = "soft_fail", InputSchema = Obj("""{"type":"object"}""") },
      _ => Task.FromResult(CallToolResult.FromError("boom")));

    // A tool whose handler throws an McpError → propagates as a JSON-RPC error.
    server.RegisterTool(
      new Tool { Name = "hard_fail", InputSchema = Obj("""{"type":"object"}""") },
      _ => throw McpError.InvalidParams("handler rejected the call"));

    // A tool whose handler throws a NON-McpError exception → an unexpected internal condition the
    // runtime MUST report as -32603 (Internal error), §22.2 R-22.2-f.
    server.RegisterTool(
      new Tool { Name = "boom", InputSchema = Obj("""{"type":"object"}""") },
      _ => throw new InvalidOperationException("unexpected internal condition"));

    // A tool that sets cache hints on its result.
    server.RegisterTool(
      new Tool { Name = "cached", InputSchema = Obj("""{"type":"object"}""") },
      ctx => { ctx.SetCacheHints(1234, CacheScope.Private); return Task.FromResult(CallToolResult.FromText("cached")); });

    server.RegisterResource(
      new Resource { Uri = "docs://readme", Name = "readme", MimeType = "text/markdown" },
      uri => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, "# Readme", "text/markdown")] }));

    server.RegisterResourceTemplate(
      new ResourceTemplate { UriTemplate = "weather://{city}/current", Name = "city-weather", MimeType = "application/json" },
      (uri, vars) => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, $$"""{"city":"{{vars["city"]}}"}""", "application/json")] }),
      new Dictionary<string, ArgumentCompleter> { ["city"] = value => new[] { "oslo", "tokyo", "oxford" }.Where(c => c.StartsWith(value, StringComparison.Ordinal)).ToList() });

    server.RegisterPrompt(
      new Prompt { Name = "greeting", Arguments = [new PromptArgument { Name = "name", Required = true }, new PromptArgument { Name = "language" }] },
      args => Task.FromResult(new GetPromptResult { Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text($"Greet {args.GetValueOrDefault("name", "?")} in {args.GetValueOrDefault("language", "english")}.") }] }),
      new Dictionary<string, ArgumentCompleter> { ["language"] = value => new[] { "english", "spanish", "estonian" }.Where(l => l.StartsWith(value, StringComparison.Ordinal)).ToList() });

    return server;
  }

  /// <summary>A server with no advertised capabilities and nothing registered, for gating tests.</summary>
  private static McpServer BareServer() =>
    new(new Implementation { Name = "bare", Version = "1.0.0" }, new ServerCapabilities());

  // ───────────────────────── Direct-dispatch plumbing ─────────────────────────

  /// <summary>A notifier that swallows request-scoped notifications, for direct HandleRequestAsync calls.</summary>
  private sealed class NullNotifier : IServerNotifier
  {
    public static readonly NullNotifier Instance = new();
    public Task NotifyAsync(JsonRpcNotification notification) => Task.CompletedTask;
  }

  /// <summary>Builds a well-formed per-request <c>_meta</c> object with the given protocol version.</summary>
  private static JsonObject GoodMeta(string? protocolVersion = null) => new()
  {
    [MetaKeys.ProtocolVersion] = protocolVersion ?? ProtocolRevision.Current,
    [MetaKeys.ClientInfo] = JsonSerializer.SerializeToNode(new Implementation { Name = "direct-client", Version = "0.0.0" }, McpJson.Options),
    [MetaKeys.ClientCapabilities] = JsonSerializer.SerializeToNode(ClientCapabilities.None, McpJson.Options),
  };

  /// <summary>Dispatches a hand-built request straight at the server and returns the raw JSON-RPC message.</summary>
  private static Task<JsonRpcMessage> Dispatch(McpServer server, string method, JsonObject prms) =>
    server.HandleRequestAsync(new JsonRpcRequest(new RequestId(1L), method, prms), NullNotifier.Instance, null, CancellationToken.None);

  /// <summary>Asserts the message is a JSON-RPC error response and returns its error object.</summary>
  private static JsonRpcError ExpectError(JsonRpcMessage message)
  {
    var error = Assert.IsType<JsonRpcErrorResponse>(message);
    return error.Error;
  }

  /// <summary>Asserts the message is a JSON-RPC success response and returns its result object.</summary>
  private static JsonObject ExpectSuccess(JsonRpcMessage message)
  {
    var success = Assert.IsType<JsonRpcSuccessResponse>(message);
    return success.Result;
  }

  // ════════════════════════ Capability gating (§22.2) ════════════════════════

  /// <summary>The capability-gated methods and the minimal params each needs to reach the gate.</summary>
  public static TheoryData<string, string> GatedMethods() => new()
  {
    { McpMethods.ToolsList, """{}""" },
    { McpMethods.ToolsCall, """{"name":"whatever"}""" },
    { McpMethods.ResourcesList, """{}""" },
    { McpMethods.ResourceTemplatesList, """{}""" },
    { McpMethods.ResourcesRead, """{"uri":"docs://x"}""" },
    { McpMethods.PromptsList, """{}""" },
    { McpMethods.PromptsGet, """{"name":"whatever"}""" },
    { McpMethods.CompletionComplete, """{"ref":{"type":"ref/prompt","name":"x"},"argument":{"name":"a","value":"v"}}""" },
  };

  [Theory]
  [MemberData(nameof(GatedMethods))]
  public async Task Bare_server_returns_method_not_found_for_every_gated_method(string method, string paramsJson)
  {
    var prms = Obj(paramsJson);
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(BareServer(), method, prms));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Bare_server_tools_list_via_client_is_method_not_found()
  {
    await using var client = InMemory.Connect(BareServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ListToolsAsync());
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Bare_server_resources_read_via_client_is_method_not_found()
  {
    await using var client = InMemory.Connect(BareServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ReadResourceAsync("docs://x"));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Bare_server_prompts_get_via_client_is_method_not_found()
  {
    await using var client = InMemory.Connect(BareServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.GetPromptAsync("x"));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Bare_server_completion_via_client_is_method_not_found()
  {
    await using var client = InMemory.Connect(BareServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.CompleteAsync(new PromptReference { Name = "x" }, new CompletionArgument { Name = "a", Value = "v" }));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  /// <summary>A server declaring only one capability must still gate the others.</summary>
  public static TheoryData<string, string> PartialGatingCases() => new()
  {
    // Only Tools declared → resources/prompts/completion are gated.
    { "tools", McpMethods.ResourcesList },
    { "tools", McpMethods.PromptsList },
    { "tools", McpMethods.CompletionComplete },
    // Only Resources declared → tools/prompts gated.
    { "resources", McpMethods.ToolsList },
    { "resources", McpMethods.PromptsList },
    // Only Prompts declared → tools/resources gated.
    { "prompts", McpMethods.ToolsList },
    { "prompts", McpMethods.ResourcesList },
    { "prompts", McpMethods.ResourceTemplatesList },
  };

  [Theory]
  [MemberData(nameof(PartialGatingCases))]
  public async Task Partial_capabilities_gate_the_undeclared_methods(string declared, string method)
  {
    var caps = declared switch
    {
      "tools" => new ServerCapabilities { Tools = new ToolsCapability() },
      "resources" => new ServerCapabilities { Resources = new ResourcesCapability() },
      "prompts" => new ServerCapabilities { Prompts = new PromptsCapability() },
      _ => new ServerCapabilities(),
    };
    var server = new McpServer(new Implementation { Name = "p", Version = "1.0.0" }, caps);
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(server, method, prms));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Full_server_succeeds_on_every_gated_listing_method()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();

    Assert.NotEmpty((await client.ListToolsAsync()).Tools);
    Assert.NotEmpty((await client.ListResourcesAsync()).Resources);
    Assert.NotEmpty((await client.ListResourceTemplatesAsync()).ResourceTemplates);
    Assert.NotEmpty((await client.ListPromptsAsync()).Prompts);
  }

  [Theory]
  [InlineData(McpMethods.ToolsList)]
  [InlineData(McpMethods.ResourcesList)]
  [InlineData(McpMethods.ResourceTemplatesList)]
  [InlineData(McpMethods.PromptsList)]
  public async Task Full_server_listing_methods_return_complete_results(string method)
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta();
    var result = ExpectSuccess(await Dispatch(FullServer(), method, prms));
    Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
  }

  // ════════════════════════ Protocol version rejection (§5) ════════════════════════

  // A well-formed (YYYY-MM-DD) but unsupported revision is answered by the discovery/negotiation
  // layer with -32004 (§5; meta.ts notes a malformed-but-string version is instead rejected at the
  // request gate with -32602 — see Malformed_protocol_version_is_minus_32602 below).
  [Theory]
  [InlineData("2024-01-01")]
  [InlineData("1999-12-31")]
  [InlineData("2026-07-29")]
  public async Task Unsupported_protocol_version_is_minus_32004(string badVersion)
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta(badVersion);
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsList, prms));
    Assert.Equal(ErrorCodes.UnsupportedProtocolVersion, error.Code);
  }

  // A protocolVersion that is not in YYYY-MM-DD form is malformed and rejected at the request
  // `_meta` gate with -32602 (invalid params), BEFORE revision negotiation runs. Faithful to the
  // TypeScript request gate validateRequestMeta / isValidRevisionFormat (meta.ts).
  [Theory]
  [InlineData("not-a-version")]
  [InlineData("")]
  [InlineData("latest")]
  [InlineData("2026/07/28")]
  [InlineData("2026-7-28")]
  public async Task Malformed_protocol_version_is_minus_32602(string malformed)
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta(malformed);
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsList, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Unsupported_protocol_version_error_data_reports_supported_and_requested()
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta("2024-01-01");
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsList, prms));

    Assert.Equal(ErrorCodes.UnsupportedProtocolVersion, error.Code);
    var data = Assert.IsType<JsonObject>(error.Data);
    Assert.Equal("2024-01-01", data["requested"]!.GetValue<string>());
    var supported = Assert.IsType<JsonArray>(data["supported"]);
    Assert.Contains(supported, n => n!.GetValue<string>() == ProtocolRevision.Current);
  }

  [Fact]
  public async Task Version_check_precedes_capability_gating()
  {
    // A bare server has no tools capability, but a bad version must still win → -32004, not -32601.
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta("2024-01-01");
    var error = ExpectError(await Dispatch(BareServer(), McpMethods.ToolsList, prms));
    Assert.Equal(ErrorCodes.UnsupportedProtocolVersion, error.Code);
  }

  [Fact]
  public async Task Current_protocol_version_is_accepted()
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta(ProtocolRevision.Current);
    var result = ExpectSuccess(await Dispatch(FullServer(), McpMethods.ToolsList, prms));
    Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
  }

  // ════════════════════════ Missing required _meta keys (§5) ════════════════════════

  [Fact]
  public async Task Missing_meta_object_entirely_is_minus_32602()
  {
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsList, Obj("""{}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Theory]
  [InlineData(MetaKeys.ProtocolVersion)]
  [InlineData(MetaKeys.ClientInfo)]
  [InlineData(MetaKeys.ClientCapabilities)]
  public async Task Missing_required_meta_key_is_minus_32602(string keyToRemove)
  {
    var meta = GoodMeta();
    meta.Remove(keyToRemove);
    var prms = new JsonObject { ["_meta"] = meta };
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsList, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Protocol_version_of_wrong_type_is_minus_32602()
  {
    var meta = GoodMeta();
    meta[MetaKeys.ProtocolVersion] = 2026; // number, not string
    var prms = new JsonObject { ["_meta"] = meta };
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsList, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ════════════════════════ tools/call argument validation (§16.4/§16.6) ════════════════════════

  [Fact]
  public async Task Unknown_tool_is_minus_32602_with_tool_name_in_data()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("does_not_exist", Obj("""{}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Equal("does_not_exist", error.ErrorData!["toolName"]!.GetValue<string>());
  }

  [Theory]
  [InlineData("""{}""")]            // both required missing
  [InlineData("""{"a":1}""")]      // b missing
  [InlineData("""{"b":2}""")]      // a missing
  public async Task Missing_required_arg_is_minus_32602(string argsJson)
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("add", Obj(argsJson)));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Missing_required_arg_is_invalid_params_and_names_the_argument()
  {
    // Faithful to the TypeScript server (server.ts:443): a schema violation is a -32602 PROTOCOL
    // error whose message carries the validator's errors (which name the offending argument). TS
    // does NOT attach a structured `data.argument` field — the missing argument is identified in the
    // human-readable message via the JSON-Schema validator output.
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("add", Obj("""{"a":1}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Contains("b", error.Message, StringComparison.Ordinal);
  }

  [Theory]
  [InlineData("""{"a":"x","b":2}""")]   // a is a string where a number is required
  [InlineData("""{"a":1,"b":"y"}""")]   // b is a string where a number is required
  [InlineData("""{"a":true,"b":2}""")]  // a is a boolean
  public async Task Wrong_typed_arg_is_minus_32602(string argsJson)
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("add", Obj(argsJson)));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Theory]
  [InlineData("""{"mode":"warp"}""")]    // not in enum
  [InlineData("""{"mode":"FAST"}""")]    // case-sensitive enum mismatch
  [InlineData("""{"mode":""}""")]        // empty string not in enum
  public async Task Enum_violation_is_minus_32602(string argsJson)
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("configure", Obj(argsJson)));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Theory]
  [InlineData("""{"mode":"fast"}""")]
  [InlineData("""{"mode":"slow","level":3}""")]
  [InlineData("""{"mode":"fast","flag":true}""")]
  public async Task Valid_call_returns_complete_result(string argsJson)
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.CallToolAsync("configure", Obj(argsJson));
    Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
    Assert.Null(result["isError"]);
  }

  [Fact]
  public async Task Valid_add_call_returns_the_computed_text()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.CallToolAsync("add", Obj("""{"a":2,"b":40}"""));
    Assert.Equal("42", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Integer_typed_arg_rejects_a_fractional_number()
  {
    // configure.level is "integer"; 2.5 is a number but not an integer.
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("configure", Obj("""{"mode":"fast","level":2.5}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Tool_that_throws_mcp_error_propagates_as_protocol_error()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("hard_fail", Obj("""{}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Tool_that_throws_an_unexpected_exception_is_minus_32603()
  {
    // R-22.2-f: an unexpected internal condition — a handler throwing something other than McpError —
    // MUST be surfaced to the client as -32603 (Internal error), not leaked as the raw exception.
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("boom", Obj("""{}""")));
    Assert.Equal(ErrorCodes.InternalError, error.Code);
  }

  [Fact]
  public async Task Tool_returning_is_error_is_a_success_result_not_a_protocol_error()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.CallToolAsync("soft_fail", Obj("""{}"""));
    Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
    Assert.True(result["isError"]!.GetValue<bool>());
  }

  [Fact]
  public async Task Tools_call_missing_name_param_is_minus_32602()
  {
    var prms = Obj("""{"arguments":{}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsCall, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Tools_call_with_omitted_arguments_uses_empty_object_and_validates()
  {
    // No "arguments" key at all → treated as empty object → required args still enforced.
    var prms = Obj("""{"name":"add"}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ToolsCall, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Cache_hints_set_by_a_tool_appear_on_the_result()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.CallToolAsync("cached", Obj("""{}"""));
    Assert.Equal(1234, result["ttlMs"]!.GetValue<long>());
    Assert.Equal("private", result["cacheScope"]!.GetValue<string>());
  }

  // ════════════════════════ Schema validation matrix (§16.4 subset) ════════════════════════

  /// <summary>(schema, args, expectPass) over required / type / enum constraints.</summary>
  public static TheoryData<string, string, bool> SchemaMatrix() => new()
  {
    // required
    { """{"type":"object","properties":{"x":{"type":"string"}},"required":["x"]}""", """{"x":"v"}""", true },
    { """{"type":"object","properties":{"x":{"type":"string"}},"required":["x"]}""", """{}""", false },
    { """{"type":"object","properties":{"x":{"type":"string"},"y":{"type":"string"}},"required":["x","y"]}""", """{"x":"v"}""", false },
    { """{"type":"object","properties":{"x":{"type":"string"}}}""", """{}""", true }, // x optional, absent
    // type: string
    { """{"type":"object","properties":{"x":{"type":"string"}}}""", """{"x":"v"}""", true },
    { """{"type":"object","properties":{"x":{"type":"string"}}}""", """{"x":1}""", false },
    // type: number
    { """{"type":"object","properties":{"x":{"type":"number"}}}""", """{"x":1.5}""", true },
    { """{"type":"object","properties":{"x":{"type":"number"}}}""", """{"x":2}""", true },
    { """{"type":"object","properties":{"x":{"type":"number"}}}""", """{"x":"2"}""", false },
    // type: integer
    { """{"type":"object","properties":{"x":{"type":"integer"}}}""", """{"x":7}""", true },
    { """{"type":"object","properties":{"x":{"type":"integer"}}}""", """{"x":7.5}""", false },
    // type: boolean
    { """{"type":"object","properties":{"x":{"type":"boolean"}}}""", """{"x":true}""", true },
    { """{"type":"object","properties":{"x":{"type":"boolean"}}}""", """{"x":false}""", true },
    { """{"type":"object","properties":{"x":{"type":"boolean"}}}""", """{"x":"true"}""", false },
    // type: object / array
    { """{"type":"object","properties":{"x":{"type":"object"}}}""", """{"x":{}}""", true },
    { """{"type":"object","properties":{"x":{"type":"object"}}}""", """{"x":[]}""", false },
    { """{"type":"object","properties":{"x":{"type":"array"}}}""", """{"x":[1,2]}""", true },
    { """{"type":"object","properties":{"x":{"type":"array"}}}""", """{"x":{}}""", false },
    // enum
    { """{"type":"object","properties":{"x":{"type":"string","enum":["a","b"]}}}""", """{"x":"a"}""", true },
    { """{"type":"object","properties":{"x":{"type":"string","enum":["a","b"]}}}""", """{"x":"c"}""", false },
    { """{"type":"object","properties":{"x":{"enum":[1,2,3]}}}""", """{"x":2}""", true },
    { """{"type":"object","properties":{"x":{"enum":[1,2,3]}}}""", """{"x":4}""", false },
    // a present null value IS checked against the property type by a real JSON Schema 2020-12
    // validator: null is not a string → invalid. (The previous expectation of `true` encoded the
    // old 3-rule hand-roll, which silently skipped null; the spec's Ajv-backed TS path rejects it.)
    { """{"type":"object","properties":{"x":{"type":"string"}}}""", """{"x":null}""", false },
    // an ABSENT optional property is fine even alongside a PRESENT, valid sibling — a distinct case from
    // the bare absent-optional row above (line ~517), so this is its own test rather than a duplicate that
    // xUnit would silently drop.
    { """{"type":"object","properties":{"x":{"type":"string"},"y":{"type":"number"}}}""", """{"y":3}""", true },
    // a null value IS accepted when the property explicitly allows the null type.
    { """{"type":"object","properties":{"x":{"type":["string","null"]}}}""", """{"x":null}""", true },
  };

  [Theory]
  [MemberData(nameof(SchemaMatrix))]
  public async Task Schema_validation_matrix(string schemaJson, string argsJson, bool expectPass)
  {
    var server = new McpServer(new Implementation { Name = "v", Version = "1.0.0" }, new ServerCapabilities { Tools = new ToolsCapability() });
    server.RegisterTool(
      new Tool { Name = "t", InputSchema = Obj(schemaJson) },
      _ => Task.FromResult(CallToolResult.FromText("ok")));

    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    if (expectPass)
    {
      var result = await client.CallToolAsync("t", Obj(argsJson));
      Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
    }
    else
    {
      var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("t", Obj(argsJson)));
      Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    }
  }

  // ════════════════════════ completion/complete -32602 (end-to-end dispatch, §19) ════════════════════════

  [Fact]
  public async Task Completion_with_an_unknown_ref_discriminator_dispatches_invalid_params()
  {
    // §19.2 (R-19.2-e): the ref is a CLOSED union over `type`; an unknown discriminator binds-fails and the
    // dispatch handler maps it to -32602 (Invalid params), NOT -32603 (Internal error).
    var prms = Obj("""{"ref":{"type":"ref/bogus","name":"greeting"},"argument":{"name":"language","value":"e"}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_for_an_unknown_prompt_ref_dispatches_invalid_params()
  {
    // §19.5 (R-19.5-r): an unknown ref is -32602 — not an empty result.
    var prms = Obj("""{"ref":{"type":"ref/prompt","name":"does-not-exist"},"argument":{"name":"x","value":"v"}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_for_an_undeclared_argument_dispatches_invalid_params()
  {
    // §19.5 (R-19.5-r): completing an argument the referenced prompt does not declare is -32602.
    var prms = Obj("""{"ref":{"type":"ref/prompt","name":"greeting"},"argument":{"name":"not-an-arg","value":"v"}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_with_context_naming_the_completed_argument_dispatches_invalid_params()
  {
    // §19.2 (R-19.2-k): context.arguments MUST NOT name the argument being completed → -32602.
    var prms = Obj("""{"ref":{"type":"ref/prompt","name":"greeting"},"argument":{"name":"language","value":"e"},"context":{"arguments":{"language":"english"}}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_completer_that_throws_an_unexpected_exception_is_minus_32603()
  {
    // §19.5 (R-19.5-t): a non-McpError thrown by an argument completer is an INTERNAL failure → -32603,
    // NOT -32602 (which is reserved for invalid params / unknown ref / undeclared argument).
    var server = new McpServer(
      new Implementation { Name = "v", Version = "1.0.0" },
      new ServerCapabilities { Prompts = new PromptsCapability(), Completions = new JsonObject() });
    server.RegisterPrompt(
      new Prompt { Name = "p", Arguments = [new PromptArgument { Name = "a" }] },
      _ => Task.FromResult(new GetPromptResult { Messages = [] }),
      new Dictionary<string, ArgumentCompleter> { ["a"] = _ => throw new InvalidOperationException("boom") });

    var prms = Obj("""{"ref":{"type":"ref/prompt","name":"p"},"argument":{"name":"a","value":"x"}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(server, McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InternalError, error.Code);
    Assert.NotEqual(ErrorCodes.InvalidParams, error.Code);
  }

  // ════════════════════════ Pagination (§12) ════════════════════════

  [Theory]
  [InlineData(0, 2)]
  [InlineData(1, 2)]
  [InlineData(5, 2)]
  [InlineData(7, 3)]
  [InlineData(10, 5)]
  [InlineData(4, 4)]
  [InlineData(4, 50)]
  public async Task Pagination_walks_every_tool_exactly_once(int toolCount, int pageSize)
  {
    var server = new McpServer(new Implementation { Name = "p", Version = "1.0.0" }, new ServerCapabilities { Tools = new ToolsCapability() }) { PageSize = pageSize };
    for (var i = 0; i < toolCount; i++)
    {
      server.RegisterTool(new Tool { Name = $"t{i}", InputSchema = Obj("""{"type":"object"}""") }, _ => Task.FromResult(CallToolResult.FromText("ok")));
    }

    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    var seen = new List<string>();
    string? cursor = null;
    var pages = 0;
    do
    {
      var page = await client.ListToolsAsync(cursor);
      Assert.True(page.Tools.Count <= pageSize);
      seen.AddRange(page.Tools.Select(t => t.Name));
      cursor = page.NextCursor;
      pages++;
      Assert.True(pages <= toolCount + 2, "pagination did not terminate");
    }
    while (cursor is not null);

    Assert.Equal(toolCount, seen.Count);
    Assert.Equal(seen.Distinct().Count(), seen.Count); // no duplicates
    for (var i = 0; i < toolCount; i++)
    {
      Assert.Contains($"t{i}", seen);
    }
  }

  [Fact]
  public async Task Last_page_has_null_next_cursor()
  {
    var server = new McpServer(new Implementation { Name = "p", Version = "1.0.0" }, new ServerCapabilities { Tools = new ToolsCapability() }) { PageSize = 10 };
    for (var i = 0; i < 3; i++)
    {
      server.RegisterTool(new Tool { Name = $"t{i}", InputSchema = Obj("""{"type":"object"}""") }, _ => Task.FromResult(CallToolResult.FromText("ok")));
    }
    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    var page = await client.ListToolsAsync();
    Assert.Equal(3, page.Tools.Count);
    Assert.Null(page.NextCursor);
  }

  [Theory]
  [InlineData("not-base64!!!")]
  [InlineData("zzzzz")]
  [InlineData("////")]
  [InlineData("Zm9vYmFy")] // base64 of "foobar" → not an integer
  public async Task Garbage_cursor_is_minus_32602(string cursor)
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ListToolsAsync(cursor));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Negative_offset_cursor_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var cursor = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("-1"));
    var error = await Assert.ThrowsAsync<McpError>(() => client.ListToolsAsync(cursor));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Out_of_range_cursor_is_minus_32602()
  {
    var server = new McpServer(new Implementation { Name = "p", Version = "1.0.0" }, new ServerCapabilities { Tools = new ToolsCapability() }) { PageSize = 2 };
    for (var i = 0; i < 3; i++)
    {
      server.RegisterTool(new Tool { Name = $"t{i}", InputSchema = Obj("""{"type":"object"}""") }, _ => Task.FromResult(CallToolResult.FromText("ok")));
    }
    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    // Offset 99 is well past the 3 registered tools.
    var cursor = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("99"));
    var error = await Assert.ThrowsAsync<McpError>(() => client.ListToolsAsync(cursor));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Cursor_at_exact_count_boundary_is_accepted_and_empty()
  {
    // offset == all.Count is the valid "one past the end" cursor and yields an empty final page.
    var server = new McpServer(new Implementation { Name = "p", Version = "1.0.0" }, new ServerCapabilities { Tools = new ToolsCapability() }) { PageSize = 2 };
    for (var i = 0; i < 3; i++)
    {
      server.RegisterTool(new Tool { Name = $"t{i}", InputSchema = Obj("""{"type":"object"}""") }, _ => Task.FromResult(CallToolResult.FromText("ok")));
    }
    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    var cursor = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("3"));
    var page = await client.ListToolsAsync(cursor);
    Assert.Empty(page.Tools);
    Assert.Null(page.NextCursor);
  }

  // ════════════════════════ resources/read (§17) ════════════════════════

  [Fact]
  public async Task Unknown_resource_uri_is_minus_32602_with_uri_in_data()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ReadResourceAsync("docs://missing"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Equal("docs://missing", error.ErrorData!["uri"]!.GetValue<string>());
  }

  [Fact]
  public async Task Unknown_resource_template_uri_is_minus_32602_with_uri_in_data()
  {
    // R-22.4-e: a URI that matches NO registered resource AND NO registered template (here a scheme the
    // weather:// template does not cover) is -32602 (Invalid params) carrying the offending uri in data.
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ReadResourceAsync("weather2://oslo/current"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Equal("weather2://oslo/current", error.ErrorData!["uri"]!.GetValue<string>());
  }

  [Fact]
  public async Task Direct_resource_read_returns_contents_with_cache_hints()
  {
    var prms = Obj("""{"uri":"docs://readme"}""");
    prms["_meta"] = GoodMeta();
    var result = ExpectSuccess(await Dispatch(FullServer(), McpMethods.ResourcesRead, prms));

    Assert.Equal("# Readme", result["contents"]![0]!["text"]!.GetValue<string>());
    Assert.NotNull(result["ttlMs"]);
    Assert.NotNull(result["cacheScope"]);
  }

  [Fact]
  public async Task Direct_resource_read_via_client_returns_text()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.ReadResourceAsync("docs://readme");
    Assert.Equal("# Readme", result.Contents[0].Text);
  }

  [Theory]
  [InlineData("weather://oslo/current", "oslo")]
  [InlineData("weather://tokyo/current", "tokyo")]
  [InlineData("weather://new-york/current", "new-york")]
  public async Task Template_match_extracts_variables(string uri, string expectedCity)
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.ReadResourceAsync(uri);
    Assert.Contains(expectedCity, result.Contents[0].Text);
  }

  [Fact]
  public async Task Resources_read_missing_uri_param_is_minus_32602()
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.ResourcesRead, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ════════════════════════ prompts/get (§18) ════════════════════════

  [Fact]
  public async Task Unknown_prompt_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.GetPromptAsync("nope"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Prompt_missing_required_argument_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.GetPromptAsync("greeting"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Prompt_with_required_argument_succeeds_and_args_reach_handler()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var prompt = await client.GetPromptAsync("greeting", new Dictionary<string, string> { ["name"] = "Ada", ["language"] = "spanish" });
    var text = Assert.IsType<TextContent>(prompt.Messages[0].Content).Text;
    Assert.Contains("Ada", text);
    Assert.Contains("spanish", text);
  }

  [Fact]
  public async Task Prompt_optional_argument_may_be_omitted()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var prompt = await client.GetPromptAsync("greeting", new Dictionary<string, string> { ["name"] = "Bo" });
    var text = Assert.IsType<TextContent>(prompt.Messages[0].Content).Text;
    Assert.Contains("Bo", text);
    Assert.Contains("english", text); // handler's default for the omitted optional arg
  }

  // ════════════════════════ completion/complete (§19) ════════════════════════

  [Theory]
  [InlineData("eng", "english")]
  [InlineData("sp", "spanish")]
  [InlineData("est", "estonian")]
  public async Task Prompt_argument_completer_returns_ranked_values(string seed, string expected)
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "language", Value = seed });
    Assert.Equal([expected], result.Completion.Values);
  }

  [Fact]
  public async Task Completer_returning_multiple_matches_lists_them_all()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    // "es" matches both "estonian" and ... only "estonian" starts with "es"; use "e" to get english+estonian.
    var result = await client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "language", Value = "e" });
    Assert.Contains("english", result.Completion.Values);
    Assert.Contains("estonian", result.Completion.Values);
  }

  [Fact]
  public async Task Template_argument_completer_returns_matches()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.CompleteAsync(new ResourceTemplateReference { Uri = "weather://{city}/current" }, new CompletionArgument { Name = "city", Value = "o" });
    Assert.Contains("oslo", result.Completion.Values);
    Assert.Contains("oxford", result.Completion.Values);
  }

  [Fact]
  public async Task Completion_for_unknown_prompt_ref_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.CompleteAsync(new PromptReference { Name = "nope" }, new CompletionArgument { Name = "language", Value = "e" }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_for_unknown_template_ref_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.CompleteAsync(new ResourceTemplateReference { Uri = "weather://{country}/forecast" }, new CompletionArgument { Name = "country", Value = "n" }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_for_declared_argument_without_completer_returns_empty_values()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    // "name" IS a declared argument of the greeting prompt but has no registered completer → an
    // empty list, NOT an error. (R-19.5-r distinguishes a declared-but-uncompleted argument from an
    // undeclared one; only the latter is -32602.)
    var result = await client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "name", Value = "A" });
    Assert.Empty(result.Completion.Values);
  }

  [Fact]
  public async Task Completion_for_undeclared_argument_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    // "bogus" is NOT a declared argument of the greeting prompt → -32602 (Invalid params), per
    // R-19.5-r. The previous test asserted an empty list for ANY uncompleted argument, which
    // conflated the declared-but-uncompleted case with the undeclared case; the TS SDK rejects only
    // the latter. This test (and the renamed one above) restore the spec-conformant split.
    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "bogus", Value = "A" }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_for_undeclared_template_variable_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    // The weather template declares only {city}; completing an undeclared variable is -32602.
    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.CompleteAsync(new ResourceTemplateReference { Uri = "weather://{city}/current" }, new CompletionArgument { Name = "country", Value = "n" }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_context_naming_completed_argument_is_minus_32602()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    // R-19.2-k: a context.arguments key MUST NOT name the argument being completed.
    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.CompleteAsync(
        new PromptReference { Name = "greeting" },
        new CompletionArgument { Name = "language", Value = "e" },
        new CompletionContext { Arguments = new Dictionary<string, string> { ["language"] = "english" } }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_with_sibling_context_is_accepted()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    // A sibling-only context (excluding the completed argument) is accepted; the server MAY ignore it.
    var result = await client.CompleteAsync(
      new PromptReference { Name = "greeting" },
      new CompletionArgument { Name = "language", Value = "e" },
      new CompletionContext { Arguments = new Dictionary<string, string> { ["name"] = "Ada" } });
    Assert.Contains("english", result.Completion.Values);
  }

  [Theory]
  [InlineData("ref/unknown")]   // a plausible-looking but undefined discriminator
  [InlineData("ref/tool")]      // a real-method-shaped value that is NOT a completion ref kind
  [InlineData("prompt")]        // missing the "ref/" prefix
  [InlineData("")]              // empty discriminator
  public async Task Completion_with_unknown_ref_type_is_minus_32602_not_internal_error(string refType)
  {
    // S29 / R-19.2-e / R-19.3-f: the completion `ref` is a CLOSED discriminated union over `type`
    // (ref/prompt | ref/resource). An unknown discriminator MUST be rejected as -32602 (Invalid
    // params). Driven directly because the typed client cannot construct an out-of-union reference —
    // System.Text.Json would otherwise surface the unrecognized discriminator as a JsonException that,
    // before the fix, fell through to the generic -32603 (Internal error) catch in HandleRequestAsync.
    var prms = Obj($"{{\"ref\":{{\"type\":\"{refType}\",\"name\":\"x\"}},\"argument\":{{\"name\":\"a\",\"value\":\"v\"}}}}");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.NotEqual(ErrorCodes.InternalError, error.Code);
  }

  [Fact]
  public async Task Completion_with_a_missing_ref_is_minus_32602()
  {
    // R-19.2-e: a params object with no `ref` at all is a closed-union/shape violation → -32602.
    var prms = Obj("""{"argument":{"name":"a","value":"v"}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_with_a_non_object_ref_is_minus_32602()
  {
    // A `ref` that is not an object cannot carry the `type` discriminator → -32602, never -32603.
    var prms = Obj("""{"ref":"ref/prompt","argument":{"name":"a","value":"v"}}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), McpMethods.CompletionComplete, prms));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completion_values_are_capped_at_100_with_has_more_and_full_total()
  {
    var server = new McpServer(
      new Implementation { Name = "c", Version = "1.0.0" },
      new ServerCapabilities { Prompts = new PromptsCapability(), Completions = new JsonObject() });
    server.RegisterPrompt(
      new Prompt { Name = "big", Arguments = [new PromptArgument { Name = "x" }] },
      _ => Task.FromResult(new GetPromptResult { Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text("x") }] }),
      new Dictionary<string, ArgumentCompleter>
      {
        ["x"] = _ => Enumerable.Range(0, 150).Select(i => i.ToString(CultureInfo.InvariantCulture)).ToList(),
      });

    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    var result = await client.CompleteAsync(new PromptReference { Name = "big" }, new CompletionArgument { Name = "x", Value = "" });
    Assert.Equal(100, result.Completion.Values.Count);
    Assert.Equal(150, result.Completion.Total);
    Assert.True(result.Completion.HasMore);
  }

  [Fact]
  public async Task Completion_under_cap_omits_total_and_has_more()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    var result = await client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "language", Value = "eng" });
    Assert.Single(result.Completion.Values);
    // Per TS computeCompletion (R-19.4-e/f/h), total/hasMore are emitted ONLY when matches were
    // dropped; an under-cap result leaves both ABSENT (unknown). The previous assertion of an exact
    // Total == 1 (and HasMore present) encoded the non-TS "always emit total" behavior.
    Assert.Null(result.Completion.Total);
    Assert.Null(result.Completion.HasMore);
    Assert.False(Completion.ResolveHasMore(result.Completion.HasMore));
  }

  // ════════════════════════ ping & unknown methods (§22) ════════════════════════

  [Fact]
  public async Task Ping_returns_an_empty_complete_result()
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta();
    var result = ExpectSuccess(await Dispatch(FullServer(), McpMethods.Ping, prms));
    Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
    // Only the runtime-stamped resultType is present; ping carries no payload.
    Assert.Single(result);
  }

  [Fact]
  public async Task Ping_via_client_completes()
  {
    await using var client = InMemory.Connect(FullServer());
    await client.DiscoverAsync();
    await client.PingAsync(); // should not throw
  }

  [Fact]
  public async Task Ping_is_not_capability_gated_on_bare_server()
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta();
    var result = ExpectSuccess(await Dispatch(BareServer(), McpMethods.Ping, prms));
    Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
  }

  [Theory]
  [InlineData("totally/unknown")]
  [InlineData("tools/delete")]
  [InlineData("")]
  [InlineData("Tools/List")] // case-sensitive: not the registered method
  public async Task Unknown_method_is_minus_32601(string method)
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta();
    var error = ExpectError(await Dispatch(FullServer(), method, prms));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Discover_is_reachable_without_any_capability()
  {
    var prms = Obj("""{}""");
    prms["_meta"] = GoodMeta();
    var result = ExpectSuccess(await Dispatch(BareServer(), McpMethods.Discover, prms));
    Assert.Equal(ResultTypes.Complete, result["resultType"]!.GetValue<string>());
  }
}
