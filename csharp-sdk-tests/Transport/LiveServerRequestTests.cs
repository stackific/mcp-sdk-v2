using System.Net;
using System.Text;
using System.Text.Json.Nodes;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Verifies how a server reaches back to a client over Streamable HTTP (spec §9.6.2, §11): it MUST NOT
/// stream a server→client JSON-RPC <em>request</em> frame (R-9.6.2-d). Instead a handler that needs client
/// input returns an <c>input_required</c> result; the client gathers the input and RETRIES the original
/// request carrying <c>inputResponses</c> and the opaque <c>requestState</c>, and the operation completes.
/// These tests assert that the elicitation round trip never produces a frame carrying both a <c>method</c>
/// and an <c>id</c> (the forbidden server-request shape), and that an unsolicited client response is rejected.
/// </summary>
public sealed class LiveServerRequestTests : IAsyncLifetime
{
  private WebApplication _app = null!;
  private string _endpoint = null!;
  private HttpClient _client = null!;

  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  public async Task InitializeAsync()
  {
    var server = new McpServer(
      new Implementation { Name = "live-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });

    // ask_name: solicits elicitation via the §11 input_required loop and folds the answer into its result.
    server.RegisterTool(
      new Tool { Name = "ask_name", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var elicited = await ctx.ElicitInputAsync(new ElicitRequestFormParams
        {
          Message = "Your name?",
          RequestedSchema = Obj("""{"type":"object","properties":{"name":{"type":"string"}}}"""),
        });
        var name = elicited.Content?["name"]?.GetValue<string>() ?? "anonymous";
        return CallToolResult.FromText($"hello {name}");
      });

    var builder = WebApplication.CreateSlimBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    _app = builder.Build();
    _app.MapMcp("/mcp", server);
    await _app.StartAsync();
    _endpoint = $"{_app.Urls.First()}/mcp";
    _client = new HttpClient();
  }

  public async Task DisposeAsync()
  {
    _client.Dispose();
    await _app.StopAsync();
    await _app.DisposeAsync();
  }

  private static JsonObject Meta() => new()
  {
    [MetaKeys.ClientInfo] = new JsonObject { ["name"] = "raw", ["version"] = "1.0.0" },
    // The client declares elicitation so the server may request it.
    [MetaKeys.ClientCapabilities] = new JsonObject { ["elicitation"] = new JsonObject() },
    [MetaKeys.ProtocolVersion] = ProtocolRevision.Current,
  };

  private HttpRequestMessage NewPost(JsonObject body, string? mcpMethod, string? mcpName = null)
  {
    var request = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
    };
    request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
    if (mcpMethod is not null) request.Headers.TryAddWithoutValidation("Mcp-Method", mcpMethod);
    if (mcpName is not null) request.Headers.TryAddWithoutValidation("Mcp-Name", mcpName);
    return request;
  }

  private static JsonObject AskNameCall(JsonObject? inputResponses = null, string? requestState = null)
  {
    var prms = new JsonObject { ["name"] = "ask_name", ["arguments"] = new JsonObject(), ["_meta"] = Meta() };
    if (inputResponses is not null) prms["inputResponses"] = inputResponses;
    if (requestState is not null) prms["requestState"] = requestState;
    return new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 1, ["method"] = McpMethods.ToolsCall, ["params"] = prms };
  }

  [Fact]
  public async Task A_handler_needing_input_returns_an_input_required_result_not_a_streamed_request()
  {
    // 1) The first tools/call returns a SINGLE JSON input_required result — NOT an event stream carrying a
    //    server→client request frame (§9.6.2 R-9.6.2-d).
    using var first = await _client.SendAsync(NewPost(AskNameCall(), McpMethods.ToolsCall, "ask_name"));
    Assert.Equal(HttpStatusCode.OK, first.StatusCode);
    Assert.Equal("application/json", first.Content.Headers.ContentType?.MediaType);

    // The response is a JSON-RPC envelope; the input_required result lives under "result". The envelope is
    // a RESPONSE (it carries "result", not "method"), never a streamed server→client request.
    var envelope = JsonNode.Parse(await first.Content.ReadAsStringAsync())!.AsObject();
    Assert.False(envelope.ContainsKey("method"));
    var result = envelope["result"]!.AsObject();
    Assert.Equal(ResultTypes.InputRequired, result["resultType"]!.GetValue<string>());

    var inputRequests = result["inputRequests"]!.AsObject();
    var (key, request) = (inputRequests.First().Key, inputRequests.First().Value!.AsObject());
    Assert.Equal(McpMethods.ElicitationCreate, request["method"]!.GetValue<string>());
    var requestState = result["requestState"]!.GetValue<string>();

    // 2) The client RETRIES the original request, carrying the collected response and the opaque
    //    requestState. The operation completes with a "complete" result on a single JSON response.
    var inputResponses = new JsonObject { [key] = new JsonObject { ["action"] = "accept", ["content"] = new JsonObject { ["name"] = "Ada" } } };
    using var second = await _client.SendAsync(NewPost(AskNameCall(inputResponses, requestState), McpMethods.ToolsCall, "ask_name"));
    Assert.Equal(HttpStatusCode.OK, second.StatusCode);

    var done = JsonNode.Parse(await second.Content.ReadAsStringAsync())!.AsObject()["result"]!.AsObject();
    Assert.Equal(ResultTypes.Complete, done["resultType"]!.GetValue<string>());
    Assert.Equal("hello Ada", done["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task An_unsolicited_client_response_is_rejected_with_invalid_request()
  {
    // §9.6.2 (R-9.6.2-d) / §7.2: the server never issues server→client requests, so a client MUST NOT POST
    // a JSON-RPC response. Any inbound response is unsolicited and rejected (never acknowledged with 202).
    var stray = new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = "srv-does-not-exist",
      ["result"] = new JsonObject { ["action"] = "accept" },
    };
    using var response = await _client.SendAsync(NewPost(stray, mcpMethod: null));
    Assert.NotEqual(HttpStatusCode.Accepted, response.StatusCode);
    var parsed = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    Assert.Equal(ErrorCodes.InvalidRequest, parsed["error"]!["code"]!.GetValue<int>());
  }
}
