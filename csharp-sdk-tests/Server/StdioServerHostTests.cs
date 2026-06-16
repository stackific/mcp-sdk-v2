using System.Collections.Concurrent;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Tests <see cref="StdioServerHost"/>: the run-loop that serves an <see cref="McpServer"/> over a
/// byte-channel transport (spec §8 / the TS <c>serveStdio</c>). It dispatches inbound client requests,
/// writes responses and request-scoped notifications back, and correlates a client's reply to a live
/// server→client request by JSON-RPC id. A linked in-memory byte-channel pair stands in for stdio so a
/// bidirectional channel can carry the live-request round trip; the strict <see cref="StdioServerTransport"/>
/// role enforcement is covered separately.
/// </summary>
public sealed class StdioServerHostTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static McpServer MakeServer()
  {
    var server = new McpServer(
      new Implementation { Name = "stdio-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });

    server.RegisterTool(
      new Tool { Name = "echo", InputSchema = Obj("""{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("text"))));

    server.RegisterTool(
      new Tool { Name = "ask_name", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        // §11: solicit elicitation via the input_required retry loop (no server→client request frame).
        var elicited = await ctx.ElicitInputAsync(new ElicitRequestFormParams
        {
          Message = "name?",
          RequestedSchema = Obj("""{"type":"object","properties":{"name":{"type":"string"}}}"""),
        });
        var name = elicited.Content?["name"]?.GetValue<string>() ?? "anon";
        return CallToolResult.FromText($"hi {name}");
      });

    return server;
  }

  private static JsonObject Meta(bool elicitation = false) => new()
  {
    [MetaKeys.ProtocolVersion] = ProtocolRevision.Current,
    [MetaKeys.ClientInfo] = new JsonObject { ["name"] = "c", ["version"] = "1" },
    [MetaKeys.ClientCapabilities] = elicitation ? new JsonObject { ["elicitation"] = new JsonObject() } : new JsonObject(),
  };

  private static JsonObject ToolCall(long id, string name, JsonObject meta) => new()
  {
    ["jsonrpc"] = "2.0",
    ["id"] = id,
    ["method"] = McpMethods.ToolsCall,
    ["params"] = new JsonObject { ["name"] = name, ["arguments"] = name == "echo" ? new JsonObject { ["text"] = "ping" } : new JsonObject(), ["_meta"] = meta },
  };

  /// <summary>A simple client side over an in-memory byte channel: collects inbound messages and lets a test await them.</summary>
  private sealed class ClientSide
  {
    private readonly InMemoryByteChannelTransport _transport;
    private readonly BlockingCollection<JsonRpcMessage> _inbound = new();

    public ClientSide(InMemoryByteChannelTransport transport)
    {
      _transport = transport;
      transport.OnMessage(_inbound.Add);
    }

    public void Send(JsonObject message) => _transport.Send(JsonRpcMessageSerializer.Parse(message.ToJsonString()));

    public JsonRpcMessage Next(TimeSpan timeout) =>
      _inbound.TryTake(out var message, timeout) ? message : throw new TimeoutException("No inbound message arrived in time.");
  }

  [Fact]
  public void Serves_a_tools_call_request_and_writes_the_response()
  {
    var (serverChannel, clientChannel) = InMemoryByteChannelTransport.CreatePair();
    var client = new ClientSide(clientChannel);
    using var host = StdioServerHost.Serve(MakeServer(), serverChannel);

    client.Send(ToolCall(1, "echo", Meta()));

    var response = Assert.IsType<JsonRpcSuccessResponse>(client.Next(TimeSpan.FromSeconds(5)));
    Assert.Equal(new RequestId(1L), response.Id);
    Assert.Equal("ping", response.Result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public void Unknown_method_is_answered_with_a_method_not_found_error()
  {
    var (serverChannel, clientChannel) = InMemoryByteChannelTransport.CreatePair();
    var client = new ClientSide(clientChannel);
    using var host = StdioServerHost.Serve(MakeServer(), serverChannel);

    client.Send(new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = 9,
      ["method"] = "does/not/exist",
      ["params"] = new JsonObject { ["_meta"] = Meta() },
    });

    var error = Assert.IsType<JsonRpcErrorResponse>(client.Next(TimeSpan.FromSeconds(5)));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Error.Code);
  }

  [Fact]
  public void Input_required_round_trips_over_the_byte_channel()
  {
    var (serverChannel, clientChannel) = InMemoryByteChannelTransport.CreatePair();
    var client = new ClientSide(clientChannel);
    using var host = StdioServerHost.Serve(MakeServer(), serverChannel);

    // §9.6.2 (R-9.6.2-d) / §11: ask_name returns an input_required result — the server NEVER writes a
    // server→client request frame to its output stream.
    client.Send(ToolCall(1, "ask_name", Meta(elicitation: true)));
    var first = Assert.IsType<JsonRpcSuccessResponse>(client.Next(TimeSpan.FromSeconds(5)));
    Assert.Equal(ResultTypes.InputRequired, first.Result["resultType"]!.GetValue<string>());
    var inputRequests = first.Result["inputRequests"]!.AsObject();
    var key = inputRequests.First().Key;
    Assert.Equal(McpMethods.ElicitationCreate, inputRequests[key]!["method"]!.GetValue<string>());
    var requestState = first.Result["requestState"]!.GetValue<string>();

    // The client RETRIES the original request with the collected response and the opaque requestState; the
    // call then completes.
    client.Send(new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = 2,
      ["method"] = McpMethods.ToolsCall,
      ["params"] = new JsonObject
      {
        ["name"] = "ask_name",
        ["arguments"] = new JsonObject(),
        ["_meta"] = Meta(elicitation: true),
        ["inputResponses"] = new JsonObject { [key] = new JsonObject { ["action"] = "accept", ["content"] = new JsonObject { ["name"] = "Grace" } } },
        ["requestState"] = requestState,
      },
    });

    var final = Assert.IsType<JsonRpcSuccessResponse>(client.Next(TimeSpan.FromSeconds(5)));
    Assert.Equal(new RequestId(2L), final.Id);
    Assert.Equal("hi Grace", final.Result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public void Disposing_the_host_stops_dispatching_further_requests()
  {
    var (serverChannel, clientChannel) = InMemoryByteChannelTransport.CreatePair();
    var client = new ClientSide(clientChannel);
    var host = StdioServerHost.Serve(MakeServer(), serverChannel);
    host.Dispose();

    client.Send(ToolCall(1, "echo", Meta()));

    // No response is produced after disposal (the inbound subscription was torn down).
    Assert.Throws<TimeoutException>(() => client.Next(TimeSpan.FromMilliseconds(300)));
  }

  [Fact]
  public async Task A_cancelled_request_produces_no_further_frame_for_its_id()
  {
    // §8.3 (R-8.3-g, MUST NOT): after notifications/cancelled the server emits nothing more for that id.
    var started = new TaskCompletionSource();
    var observedCancel = new TaskCompletionSource();
    var server = new McpServer(
      new Implementation { Name = "stdio-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });
    server.RegisterTool(
      new Tool { Name = "slow", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        started.TrySetResult();
        try { await Task.Delay(TimeSpan.FromSeconds(30), ctx.Signal); }
        catch (OperationCanceledException) { observedCancel.TrySetResult(); throw; }
        return CallToolResult.FromText("done");
      });

    var (serverChannel, clientChannel) = InMemoryByteChannelTransport.CreatePair();
    var client = new ClientSide(clientChannel);
    using var host = StdioServerHost.Serve(server, serverChannel);

    client.Send(ToolCall(1, "slow", Meta()));
    await started.Task.WaitAsync(TimeSpan.FromSeconds(5)); // the handler is in-flight and its CTS registered.

    client.Send(new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["method"] = McpMethods.NotificationsCancelled,
      ["params"] = new JsonObject { ["requestId"] = 1 },
    });

    await observedCancel.Task.WaitAsync(TimeSpan.FromSeconds(5)); // the handler observed cancellation.
    // No response (neither result nor error) is written for the cancelled id.
    Assert.Throws<TimeoutException>(() => client.Next(TimeSpan.FromMilliseconds(400)));
  }

  [Fact]
  public void A_cancel_for_an_unknown_id_is_ignored_and_a_normal_request_still_responds()
  {
    var (serverChannel, clientChannel) = InMemoryByteChannelTransport.CreatePair();
    var client = new ClientSide(clientChannel);
    using var host = StdioServerHost.Serve(MakeServer(), serverChannel);

    // A cancel that targets no in-flight request is a harmless no-op (R-15.2.2-f)...
    client.Send(new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["method"] = McpMethods.NotificationsCancelled,
      ["params"] = new JsonObject { ["requestId"] = 99 },
    });
    // ...and an ordinary request that follows still receives its response.
    client.Send(ToolCall(1, "echo", Meta()));

    var response = Assert.IsType<JsonRpcSuccessResponse>(client.Next(TimeSpan.FromSeconds(5)));
    Assert.Equal(new RequestId(1L), response.Id);
    Assert.Equal("ping", response.Result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public void Over_a_strict_stdio_server_transport_a_live_request_frame_is_rejected_role_seam()
  {
    // The strict StdioServerTransport enforces §8.3 (a server MUST NOT write a request to stdout). Sending
    // a server→client REQUEST frame through it throws a TransportError — documenting the seam that, over
    // stdio, the §11 input_required loop is the supported solicitation path (the live request is rejected).
    var transport = new StdioServerTransport(new StdioServerTransportOptions
    {
      Stdin = new PushByteSource(),
      Stdout = new PushByteSource(),
    });
    Assert.Throws<TransportError>(() => transport.Send(new JsonRpcRequest(new RequestId("srv-1"), McpMethods.ElicitationCreate, new JsonObject())));
  }
}
