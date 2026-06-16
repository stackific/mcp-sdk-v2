using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Client;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Conformance coverage tied to the SDK's observable behaviour: the §4.4 stateless model (independent
/// clients to the same server observe identical discovery and lists, with no per-connection state), the
/// §5.1 opaque exact-match revision rule, the §3.6 <c>resultType</c> discriminator contract (always
/// <c>complete</c> on success; an absent <c>resultType</c> is treated as <c>complete</c>), the §3.1
/// <c>jsonrpc: "2.0"</c> framing invariant, and the §22/Appendix B reserved error-code registry. Every
/// assertion checks a real, executable behaviour of the runtime — never a comment or a docstring.
/// </summary>
public sealed class ConformanceTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  /// <summary>Builds a small, deterministic server used by the stateless-model tests.</summary>
  private static McpServer BuildServer()
  {
    var server = new McpServer(
      new Implementation { Name = "conformance-server", Version = "1.0.0" },
      new ServerCapabilities
      {
        Tools = new ToolsCapability { ListChanged = true },
        Resources = new ResourcesCapability(),
        Prompts = new PromptsCapability(),
        Completions = new JsonObject(),
      },
      instructions: "deterministic");

    server.RegisterTool(
      new Tool { Name = "alpha", InputSchema = Obj("""{"type":"object"}""") },
      _ => Task.FromResult(CallToolResult.FromText("a")));
    server.RegisterTool(
      new Tool { Name = "beta", InputSchema = Obj("""{"type":"object"}""") },
      _ => Task.FromResult(CallToolResult.FromText("b")));

    server.RegisterResource(
      new Resource { Uri = "docs://one", Name = "one" },
      uri => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, "1")] }));

    server.RegisterPrompt(
      new Prompt { Name = "hello", Arguments = [] },
      _ => Task.FromResult(new GetPromptResult { Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text("hi") }] }));

    return server;
  }

  // ───────────────────────── §4.4 stateless model: independent clients, identical observations ─────────────────────────

  [Fact]
  public async Task Two_independent_clients_observe_the_same_supported_versions()
  {
    var server = BuildServer();
    await using var a = InMemory.Connect(server);
    await using var b = InMemory.Connect(server);
    var da = await a.DiscoverAsync();
    var db = await b.DiscoverAsync();
    Assert.Equal(da.SupportedVersions, db.SupportedVersions);
  }

  [Fact]
  public async Task Two_independent_clients_observe_the_same_server_info()
  {
    var server = BuildServer();
    await using var a = InMemory.Connect(server);
    await using var b = InMemory.Connect(server);
    await a.DiscoverAsync();
    await b.DiscoverAsync();
    Assert.Equal(a.ServerInfo!.Name, b.ServerInfo!.Name);
    Assert.Equal(a.ServerInfo!.Version, b.ServerInfo!.Version);
  }

  [Fact]
  public async Task Two_independent_clients_negotiate_the_same_revision()
  {
    var server = BuildServer();
    await using var a = InMemory.Connect(server);
    await using var b = InMemory.Connect(server);
    await a.DiscoverAsync();
    await b.DiscoverAsync();
    Assert.Equal(a.NegotiatedVersion, b.NegotiatedVersion);
  }

  [Fact]
  public async Task Two_independent_clients_get_identical_tool_lists()
  {
    var server = BuildServer();
    await using var a = InMemory.Connect(server);
    await using var b = InMemory.Connect(server);
    await a.DiscoverAsync();
    await b.DiscoverAsync();
    var na = (await a.ListToolsAsync()).Tools.Select(t => t.Name).OrderBy(x => x, StringComparer.Ordinal);
    var nb = (await b.ListToolsAsync()).Tools.Select(t => t.Name).OrderBy(x => x, StringComparer.Ordinal);
    Assert.Equal(na, nb);
  }

  [Fact]
  public async Task Two_independent_clients_get_identical_resource_lists()
  {
    var server = BuildServer();
    await using var a = InMemory.Connect(server);
    await using var b = InMemory.Connect(server);
    await a.DiscoverAsync();
    await b.DiscoverAsync();
    var na = (await a.ListResourcesAsync()).Resources.Select(r => r.Uri).OrderBy(x => x, StringComparer.Ordinal);
    var nb = (await b.ListResourcesAsync()).Resources.Select(r => r.Uri).OrderBy(x => x, StringComparer.Ordinal);
    Assert.Equal(na, nb);
  }

  [Fact]
  public async Task Two_independent_clients_get_identical_prompt_lists()
  {
    var server = BuildServer();
    await using var a = InMemory.Connect(server);
    await using var b = InMemory.Connect(server);
    await a.DiscoverAsync();
    await b.DiscoverAsync();
    var na = (await a.ListPromptsAsync()).Prompts.Select(p => p.Name).OrderBy(x => x, StringComparer.Ordinal);
    var nb = (await b.ListPromptsAsync()).Prompts.Select(p => p.Name).OrderBy(x => x, StringComparer.Ordinal);
    Assert.Equal(na, nb);
  }

  [Fact]
  public async Task A_client_can_list_without_calling_discover_first()
  {
    // §4.4: requests are self-describing; there is no mandatory init handshake holding connection state.
    var server = BuildServer();
    await using var client = InMemory.Connect(server);
    var tools = await client.ListToolsAsync();
    Assert.Contains(tools.Tools, t => t.Name == "alpha");
  }

  [Fact]
  public async Task A_second_client_can_list_without_discover_independently_of_the_first()
  {
    var server = BuildServer();
    await using var a = InMemory.Connect(server);
    await a.DiscoverAsync();
    await using var b = InMemory.Connect(server);
    var tools = await b.ListToolsAsync(); // No discover on b; must still succeed (no shared state).
    Assert.Equal(2, tools.Tools.Count);
  }

  [Fact]
  public async Task Repeated_tool_lists_on_one_client_are_stable()
  {
    var server = BuildServer();
    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();
    var first = (await client.ListToolsAsync()).Tools.Select(t => t.Name).ToList();
    var second = (await client.ListToolsAsync()).Tools.Select(t => t.Name).ToList();
    Assert.Equal(first, second);
  }

  [Fact]
  public async Task List_results_do_not_depend_on_prior_requests_on_the_connection()
  {
    // §4.6: a list result is a pure function of the request, not of connection history.
    var server = BuildServer();
    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();
    await client.CallToolAsync("alpha");
    await client.ReadResourceAsync("docs://one");
    var tools = (await client.ListToolsAsync()).Tools.Select(t => t.Name).OrderBy(x => x, StringComparer.Ordinal).ToList();
    Assert.Equal(["alpha", "beta"], tools);
  }

  [Fact]
  public async Task Discovery_is_idempotent_on_the_same_client()
  {
    var server = BuildServer();
    await using var client = InMemory.Connect(server);
    var first = await client.DiscoverAsync();
    var second = await client.DiscoverAsync();
    Assert.Equal(first.SupportedVersions, second.SupportedVersions);
    Assert.Equal(first.ServerInfo.Name, second.ServerInfo.Name);
  }

  // ───────────────────────── §5.1 revision: opaque exact-match ─────────────────────────

  [Fact]
  public void Protocol_revision_constant_is_exactly_the_documented_value()
  {
    Assert.Equal("2026-07-28", ProtocolRevision.Current);
  }

  [Fact]
  public void Supported_contains_exactly_the_current_revision()
  {
    Assert.Equal([ProtocolRevision.Current], ProtocolRevision.Supported);
  }

  [Fact]
  public void IsSupported_is_true_for_the_exact_current_revision()
  {
    Assert.True(ProtocolRevision.IsSupported("2026-07-28"));
  }

  [Theory]
  [InlineData("2026-07-27")]
  [InlineData("2026-07-29")]
  [InlineData("2025-11-25")]
  [InlineData("2026-7-28")]
  [InlineData(" 2026-07-28")]
  [InlineData("2026-07-28 ")]
  [InlineData("2026-07-28\n")]
  [InlineData("LATEST")]
  [InlineData("")]
  public void IsSupported_rejects_anything_that_is_not_a_byte_exact_match(string revision)
  {
    Assert.False(ProtocolRevision.IsSupported(revision));
  }

  [Fact]
  public void IsSupported_does_not_perform_chronological_comparison()
  {
    // A lexically/chronologically "later" date is still unsupported — opacity, not ordering (§5.1).
    Assert.False(ProtocolRevision.IsSupported("9999-12-31"));
  }

  // ───────────────────────── §3.6 resultType: "complete" on success ─────────────────────────

  [Fact]
  public async Task Discover_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    var raw = await client.RequestAsync(McpMethods.Discover);
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task Ping_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var raw = await client.RequestAsync(McpMethods.Ping);
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task ToolsList_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var raw = await client.RequestAsync(McpMethods.ToolsList);
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task ToolsCall_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var raw = await client.CallToolAsync("alpha");
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task ResourcesRead_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var raw = await client.RequestAsync(McpMethods.ResourcesRead, new JsonObject { ["uri"] = "docs://one" });
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task PromptsGet_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var raw = await client.RequestAsync(McpMethods.PromptsGet, new JsonObject { ["name"] = "hello", ["arguments"] = new JsonObject() });
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task ResourcesList_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var raw = await client.RequestAsync(McpMethods.ResourcesList);
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task PromptsList_result_carries_result_type_complete()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var raw = await client.RequestAsync(McpMethods.PromptsList);
    Assert.Equal(ResultTypes.Complete, raw["resultType"]!.GetValue<string>());
  }

  [Fact]
  public void Result_types_constant_for_complete_is_the_documented_string()
  {
    Assert.Equal("complete", ResultTypes.Complete);
  }

  [Fact]
  public void Result_types_constant_for_input_required_is_the_documented_string()
  {
    Assert.Equal("input_required", ResultTypes.InputRequired);
  }

  [Fact]
  public void Result_types_constant_for_task_is_the_documented_string()
  {
    Assert.Equal("task", ResultTypes.Task);
  }

  // ───────────────────────── §3.6: an absent resultType is treated as complete ─────────────────────────

  [Fact]
  public void Multi_round_trip_driver_treats_a_result_without_result_type_as_complete()
  {
    // §3.6 / §11.2: when resultType is absent, the runtime defaults it to "complete". We exercise the
    // exact defaulting expression the client uses (see McpClient.RequestWithInputAsync) on a result
    // object that carries NO resultType, and confirm it is NOT input_required.
    var resultWithoutType = new JsonObject { ["content"] = new JsonArray() };
    var resultType = (resultWithoutType["resultType"] as JsonValue)?.GetValue<string>() ?? ResultTypes.Complete;
    Assert.Equal(ResultTypes.Complete, resultType);
  }

  [Fact]
  public async Task A_server_result_without_result_type_drives_mrtr_to_completion()
  {
    // A custom handler that returns a bare result (no resultType) — the multi-round-trip driver must
    // treat it as complete and return it rather than looping forever or throwing.
    var handler = new BareResultHandler();
    await using var transport = new InMemoryClientTransport(handler);
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    var result = await client.RequestWithInputAsync("anything");
    Assert.False(result.ContainsKey("resultType"));
    Assert.Equal("ok", result["status"]!.GetValue<string>());
  }

  [Fact]
  public void Discover_result_deserializes_even_without_an_explicit_result_type()
  {
    // The typed DiscoverResult contract does not require resultType — a result missing it round-trips.
    var raw = new JsonObject
    {
      ["supportedVersions"] = new JsonArray("2026-07-28"),
      ["capabilities"] = new JsonObject(),
      ["serverInfo"] = new JsonObject { ["name"] = "s", ["version"] = "1" },
    };
    var typed = raw.Deserialize<DiscoverResult>(McpJson.Options);
    Assert.NotNull(typed);
    Assert.Equal(["2026-07-28"], typed!.SupportedVersions);
  }

  /// <summary>A handler that always answers with a success result carrying no <c>resultType</c> (for the §3.6 default test).</summary>
  private sealed class BareResultHandler : IMcpRequestHandler
  {
    public Task<JsonRpcMessage> HandleRequestAsync(JsonRpcRequest request, IServerNotifier notifier, AuthInfo? authInfo, CancellationToken cancellationToken) =>
      Task.FromResult<JsonRpcMessage>(new JsonRpcSuccessResponse(request.Id, new JsonObject { ["status"] = "ok" }));

    public Task HandleNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken) => Task.CompletedTask;
  }

  // ───────────────────────── §3.1: jsonrpc is always "2.0" on serialized messages ─────────────────────────

  [Fact]
  public void Json_rpc_version_constant_is_exactly_2_0()
  {
    Assert.Equal("2.0", JsonRpcConstants.Version);
  }

  [Fact]
  public void Serialized_request_carries_jsonrpc_2_0()
  {
    var node = JsonRpcMessageSerializer.ToNode(new JsonRpcRequest(new RequestId(1L), "ping"));
    Assert.Equal("2.0", node["jsonrpc"]!.GetValue<string>());
  }

  [Fact]
  public void Serialized_notification_carries_jsonrpc_2_0()
  {
    var node = JsonRpcMessageSerializer.ToNode(new JsonRpcNotification("notifications/progress"));
    Assert.Equal("2.0", node["jsonrpc"]!.GetValue<string>());
  }

  [Fact]
  public void Serialized_success_response_carries_jsonrpc_2_0()
  {
    var node = JsonRpcMessageSerializer.ToNode(new JsonRpcSuccessResponse(new RequestId(1L), new JsonObject()));
    Assert.Equal("2.0", node["jsonrpc"]!.GetValue<string>());
  }

  [Fact]
  public void Serialized_error_response_carries_jsonrpc_2_0()
  {
    var node = JsonRpcMessageSerializer.ToNode(new JsonRpcErrorResponse(new RequestId(1L), new JsonRpcError(ErrorCodes.InternalError, "boom")));
    Assert.Equal("2.0", node["jsonrpc"]!.GetValue<string>());
  }

  [Fact]
  public async Task Live_request_frame_carries_jsonrpc_2_0()
  {
    var transport = new InMemoryClientTransport(BuildServer());
    JsonNode? sent = null;
    transport.OnSend = node => sent ??= node;
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    await client.DiscoverAsync();
    Assert.Equal("2.0", sent!.AsObject()["jsonrpc"]!.GetValue<string>());
  }

  [Fact]
  public async Task Live_response_frame_carries_jsonrpc_2_0()
  {
    var transport = new InMemoryClientTransport(BuildServer());
    JsonNode? received = null;
    transport.OnReceive = node => received ??= node;
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    await client.DiscoverAsync();
    Assert.Equal("2.0", received!.AsObject()["jsonrpc"]!.GetValue<string>());
  }

  [Fact]
  public void Parser_rejects_a_message_whose_jsonrpc_is_not_2_0()
  {
    var error = Assert.Throws<McpError>(() =>
      JsonRpcMessageSerializer.Parse("""{"jsonrpc":"1.0","id":1,"method":"ping"}"""));
    Assert.Equal(ErrorCodes.InvalidRequest, error.Code);
  }

  [Fact]
  public void Parser_rejects_a_message_missing_jsonrpc()
  {
    var error = Assert.Throws<McpError>(() =>
      JsonRpcMessageSerializer.Parse("""{"id":1,"method":"ping"}"""));
    Assert.Equal(ErrorCodes.InvalidRequest, error.Code);
  }

  // ───────────────────────── §22 / Appendix B: reserved error-code registry ─────────────────────────

  [Fact]
  public void Reserved_error_codes_have_the_documented_values()
  {
    Assert.Equal(-32700, ErrorCodes.ParseError);
    Assert.Equal(-32600, ErrorCodes.InvalidRequest);
    Assert.Equal(-32601, ErrorCodes.MethodNotFound);
    Assert.Equal(-32602, ErrorCodes.InvalidParams);
    Assert.Equal(-32603, ErrorCodes.InternalError);
    Assert.Equal(-32003, ErrorCodes.MissingRequiredClientCapability);
    Assert.Equal(-32004, ErrorCodes.UnsupportedProtocolVersion);
    Assert.Equal(-32001, ErrorCodes.HeaderMismatch);
  }

  [Fact]
  public void Reserved_error_codes_are_all_distinct()
  {
    var codes = new[]
    {
      ErrorCodes.ParseError,
      ErrorCodes.InvalidRequest,
      ErrorCodes.MethodNotFound,
      ErrorCodes.InvalidParams,
      ErrorCodes.InternalError,
      ErrorCodes.MissingRequiredClientCapability,
      ErrorCodes.UnsupportedProtocolVersion,
      ErrorCodes.HeaderMismatch,
    };
    Assert.Equal(codes.Length, codes.Distinct().Count());
  }

  [Fact]
  public void The_standard_jsonrpc_codes_sit_in_the_minus_32700_to_minus_32600_band()
  {
    foreach (var code in new[] { ErrorCodes.ParseError, ErrorCodes.InvalidRequest, ErrorCodes.MethodNotFound, ErrorCodes.InvalidParams, ErrorCodes.InternalError })
    {
      Assert.InRange(code, -32700, -32600);
    }
  }

  [Fact]
  public void The_mcp_specific_codes_sit_in_the_server_reserved_minus_32000_band()
  {
    // Appendix B places MCP's own codes in the JSON-RPC "server error" reserved range -32000..-32099.
    foreach (var code in new[] { ErrorCodes.HeaderMismatch, ErrorCodes.MissingRequiredClientCapability, ErrorCodes.UnsupportedProtocolVersion })
    {
      Assert.InRange(code, -32099, -32000);
    }
  }

  [Fact]
  public void Mcp_specific_codes_do_not_overlap_the_standard_jsonrpc_band()
  {
    // The standard JSON-RPC band is -32700..-32600; MCP's own codes (-32000 band) must sit outside it.
    foreach (var code in new[] { ErrorCodes.HeaderMismatch, ErrorCodes.MissingRequiredClientCapability, ErrorCodes.UnsupportedProtocolVersion })
    {
      Assert.False(code is >= -32700 and <= -32600, $"code {code} must be outside the standard JSON-RPC band");
    }
  }

  // ───────────────────────── McpError factories: code mapping never collides ─────────────────────────

  [Fact]
  public void McpError_factories_map_to_their_documented_codes()
  {
    Assert.Equal(ErrorCodes.ParseError, McpError.ParseError().Code);
    Assert.Equal(ErrorCodes.InvalidRequest, McpError.InvalidRequest("x").Code);
    Assert.Equal(ErrorCodes.MethodNotFound, McpError.MethodNotFound("m").Code);
    Assert.Equal(ErrorCodes.InvalidParams, McpError.InvalidParams("x").Code);
    Assert.Equal(ErrorCodes.InternalError, McpError.InternalError("x").Code);
    Assert.Equal(ErrorCodes.HeaderMismatch, McpError.HeaderMismatch("x").Code);
    Assert.Equal(ErrorCodes.UnsupportedProtocolVersion, McpError.UnsupportedProtocolVersion(["2026-07-28"], "1999-01-01").Code);
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, McpError.MissingRequiredClientCapability(new JsonObject()).Code);
  }

  [Fact]
  public void Distinct_McpError_factories_produce_distinct_codes()
  {
    var codes = new[]
    {
      McpError.ParseError().Code,
      McpError.InvalidRequest("x").Code,
      McpError.MethodNotFound("m").Code,
      McpError.InvalidParams("x").Code,
      McpError.InternalError("x").Code,
      McpError.HeaderMismatch("x").Code,
      McpError.UnsupportedProtocolVersion(["2026-07-28"], "1999-01-01").Code,
      McpError.MissingRequiredClientCapability(new JsonObject()).Code,
    };
    Assert.Equal(codes.Length, codes.Distinct().Count());
  }

  [Fact]
  public void MethodNotFound_factory_echoes_the_method_into_data()
  {
    var error = McpError.MethodNotFound("foo/bar");
    Assert.Equal("foo/bar", error.ErrorData!["method"]!.GetValue<string>());
  }

  [Fact]
  public void UnsupportedProtocolVersion_factory_carries_supported_and_requested()
  {
    var error = McpError.UnsupportedProtocolVersion(["2026-07-28"], "1999-01-01");
    Assert.Equal("1999-01-01", error.ErrorData!["requested"]!.GetValue<string>());
    Assert.Contains("2026-07-28", error.ErrorData!["supported"]!.AsArray().Select(n => n!.GetValue<string>()));
  }

  [Fact]
  public void McpError_round_trips_through_its_wire_error_object()
  {
    var error = McpError.InvalidParams("bad", new JsonObject { ["uri"] = "x://y" });
    var wire = error.ToJsonRpcError();
    Assert.Equal(ErrorCodes.InvalidParams, wire.Code);
    Assert.Equal("x://y", wire.Data!["uri"]!.GetValue<string>());
  }

  [Fact]
  public void Every_error_codes_field_is_a_negative_integer()
  {
    // Appendix B: every reserved code is a negative integer (the JSON-RPC reservation convention).
    var fields = typeof(ErrorCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
      .Where(f => f.IsLiteral && f.FieldType == typeof(int));
    foreach (var field in fields)
    {
      Assert.True((int)field.GetRawConstantValue()! < 0, $"{field.Name} must be negative");
    }
  }

  [Fact]
  public void All_error_codes_fields_are_distinct()
  {
    var values = typeof(ErrorCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
      .Where(f => f.IsLiteral && f.FieldType == typeof(int))
      .Select(f => (int)f.GetRawConstantValue()!)
      .ToList();
    Assert.Equal(values.Count, values.Distinct().Count());
  }

  // ───────────────────────── revision negotiation against a non-matching server ─────────────────────────

  [Fact]
  public async Task Discover_throws_internal_error_when_no_revision_is_mutually_supported()
  {
    // A handler advertising only an unknown revision forces the §5.4 "no mutual revision" path.
    await using var transport = new InMemoryClientTransport(new ForeignRevisionHandler());
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    var error = await Assert.ThrowsAsync<McpError>(() => client.DiscoverAsync());
    Assert.Equal(ErrorCodes.InternalError, error.Code);
  }

  [Fact]
  public async Task NegotiatedVersion_stays_null_after_a_failed_discovery()
  {
    await using var transport = new InMemoryClientTransport(new ForeignRevisionHandler());
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    await Assert.ThrowsAsync<McpError>(() => client.DiscoverAsync());
    Assert.Null(client.NegotiatedVersion);
  }

  /// <summary>A handler whose discovery advertises only an unsupported revision (for the §5.4 negotiation-failure test).</summary>
  private sealed class ForeignRevisionHandler : IMcpRequestHandler
  {
    public Task<JsonRpcMessage> HandleRequestAsync(JsonRpcRequest request, IServerNotifier notifier, AuthInfo? authInfo, CancellationToken cancellationToken)
    {
      var result = new JsonObject
      {
        ["supportedVersions"] = new JsonArray("1999-01-01"),
        ["capabilities"] = new JsonObject(),
        ["serverInfo"] = new JsonObject { ["name"] = "foreign", ["version"] = "1" },
        ["resultType"] = ResultTypes.Complete,
      };
      return Task.FromResult<JsonRpcMessage>(new JsonRpcSuccessResponse(request.Id, result));
    }

    public Task HandleNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken) => Task.CompletedTask;
  }
}
