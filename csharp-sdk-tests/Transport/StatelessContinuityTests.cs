using System.Collections.Concurrent;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// §4.4 stateless-model continuity (S06): a server retains NO per-connection state, so a server-minted
/// continuation id — a pagination cursor (§12) or a task id (§25) — that is issued on ONE connection
/// resolves on a SEPARATE, freshly-created connection to the same server. Each "connection" is its own
/// <see cref="InMemoryByteChannelTransport"/> pair served by its own <see cref="StdioServerHost"/> over
/// the shared <see cref="McpServer"/>; nothing but the opaque id crosses between them.
/// </summary>
public sealed class StatelessContinuityTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static readonly JsonObject TasksExtensionDecl = new() { [MetaKeys.TasksExtension] = new JsonObject() };

  private static JsonObject Meta() => new()
  {
    [MetaKeys.ProtocolVersion] = ProtocolRevision.Current,
    [MetaKeys.ClientInfo] = new JsonObject { ["name"] = "c", ["version"] = "1" },
    [MetaKeys.ClientCapabilities] = new JsonObject { ["extensions"] = TasksExtensionDecl.DeepClone() },
  };

  /// <summary>Issues one request over a FRESH byte-channel connection to <paramref name="server"/> and returns the response.</summary>
  private static JsonRpcMessage RoundTripOnFreshConnection(McpServer server, JsonObject request)
  {
    var (serverChannel, clientChannel) = InMemoryByteChannelTransport.CreatePair();
    var inbound = new BlockingCollection<JsonRpcMessage>();
    using var subscription = clientChannel.OnMessage(inbound.Add);
    using var host = StdioServerHost.Serve(server, serverChannel);

    clientChannel.Send(JsonRpcMessageSerializer.Parse(request.ToJsonString()));
    if (!inbound.TryTake(out var response, TimeSpan.FromSeconds(5)))
    {
      throw new TimeoutException("No response arrived on the byte channel.");
    }
    return response;
  }

  private static JsonObject Request(long id, string method, JsonObject prms)
  {
    prms["_meta"] = Meta();
    return new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = prms };
  }

  [Fact]
  public void A_pagination_cursor_minted_on_one_connection_resolves_on_a_fresh_connection()
  {
    var server = new McpServer(new Implementation { Name = "s", Version = "1.0.0" }, new ServerCapabilities { Tools = new ToolsCapability() }) { PageSize = 1 };
    server.RegisterTool(new Tool { Name = "alpha", InputSchema = Obj("""{"type":"object"}""") }, _ => Task.FromResult(CallToolResult.FromText("a")));
    server.RegisterTool(new Tool { Name = "beta", InputSchema = Obj("""{"type":"object"}""") }, _ => Task.FromResult(CallToolResult.FromText("b")));

    // Page 1 over connection A → one tool + a continuation cursor.
    var page1 = Assert.IsType<JsonRpcSuccessResponse>(RoundTripOnFreshConnection(server, Request(1, McpMethods.ToolsList, new JsonObject())));
    var cursor = page1.Result["nextCursor"]!.GetValue<string>();
    var firstName = page1.Result["tools"]![0]!["name"]!.GetValue<string>();

    // Page 2 over a SEPARATE connection B carrying that cursor → the next page (server kept no state).
    var page2 = Assert.IsType<JsonRpcSuccessResponse>(
      RoundTripOnFreshConnection(server, Request(2, McpMethods.ToolsList, new JsonObject { ["cursor"] = cursor })));
    var secondName = page2.Result["tools"]![0]!["name"]!.GetValue<string>();

    Assert.NotEqual(firstName, secondName); // the continuation advanced across the two connections.
  }

  [Fact]
  public void A_task_id_minted_on_one_connection_resolves_on_a_fresh_connection()
  {
    var server = new McpServer(
      new Implementation { Name = "s", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability(), Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject() } });
    server.SetTaskStore(new InMemoryTaskStore());
    server.RegisterTaskTool(
      new Tool { Name = "job", InputSchema = Obj("""{"type":"object"}""") },
      ctx => Task.FromResult(ctx.Tasks!.Create(ctx.TaskTtlMs)));

    // Create the task over connection A.
    var created = Assert.IsType<JsonRpcSuccessResponse>(RoundTripOnFreshConnection(
      server, Request(1, McpMethods.ToolsCall, new JsonObject { ["name"] = "job", ["arguments"] = new JsonObject(), ["task"] = new JsonObject() })));
    var taskId = created.Result["taskId"]!.GetValue<string>();

    // Resolve the SAME opaque task id over a SEPARATE connection B (no connection affinity, §25.6).
    var got = Assert.IsType<JsonRpcSuccessResponse>(RoundTripOnFreshConnection(
      server, Request(2, McpMethods.TasksGet, new JsonObject { ["taskId"] = taskId })));
    Assert.Equal(taskId, got.Result["taskId"]!.GetValue<string>());
    Assert.False(string.IsNullOrEmpty(got.Result["status"]!.GetValue<string>()));
  }
}
