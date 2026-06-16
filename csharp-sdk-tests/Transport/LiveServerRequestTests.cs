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
/// Tests the LIVE server→client request path over Streamable HTTP (spec §9.6.2, §9.9): a tool issues a
/// live <c>elicitation/create</c> request mid-handler; the adapter streams the request frame on the
/// response SSE; the client POSTs its JSON-RPC reply on a SEPARATE request; and the adapter correlates
/// that reply (by id) back to the awaiting handler, which then completes — with the final response
/// arriving on the original stream. This is distinct from the §11 input_required retry loop.
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

    // ask_name: issues a LIVE elicitation/create request mid-handler and folds the answer into its result.
    server.RegisterTool(
      new Tool { Name = "ask_name", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var elicited = await ctx.ElicitInputLiveAsync(new ElicitRequestFormParams
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
    // The client declares elicitation so the live request is permitted.
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

  /// <summary>Reads SSE <c>data:</c> frames one at a time off a live stream until <paramref name="predicate"/> matches.</summary>
  private static async Task<JsonObject> ReadUntilAsync(StreamReader reader, Func<JsonObject, bool> predicate, TimeSpan timeout)
  {
    using var cts = new CancellationTokenSource(timeout);
    while (true)
    {
      var line = await reader.ReadLineAsync(cts.Token);
      if (line is null) throw new InvalidOperationException("The SSE stream ended before the expected frame arrived.");
      if (!line.StartsWith("data:", StringComparison.Ordinal)) continue;
      var payload = line.Length > 5 && line[5] == ' ' ? line[6..] : line[5..];
      if (payload.Length == 0) continue;
      var frame = JsonNode.Parse(payload)!.AsObject();
      if (predicate(frame)) return frame;
    }
  }

  [Fact]
  public async Task Live_elicitation_request_is_streamed_and_correlated_to_a_separate_reply_post()
  {
    // 1) Start the tools/call — it opens an SSE stream and blocks inside the handler on the live request.
    var callBody = new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = 1,
      ["method"] = McpMethods.ToolsCall,
      ["params"] = new JsonObject { ["name"] = "ask_name", ["arguments"] = new JsonObject(), ["_meta"] = Meta() },
    };
    using var callResponse = await _client.SendAsync(NewPost(callBody, McpMethods.ToolsCall, "ask_name"), HttpCompletionOption.ResponseHeadersRead);
    Assert.Equal(HttpStatusCode.OK, callResponse.StatusCode);
    Assert.Equal("text/event-stream", callResponse.Content.Headers.ContentType?.MediaType);

    await using var stream = await callResponse.Content.ReadAsStreamAsync();
    using var reader = new StreamReader(stream, Encoding.UTF8);

    // 2) The first streamed frame is the server→client elicitation/create REQUEST (it carries an id + method).
    var serverRequest = await ReadUntilAsync(
      reader,
      f => f["method"]?.GetValue<string>() == McpMethods.ElicitationCreate && f.ContainsKey("id"),
      TimeSpan.FromSeconds(10));
    var serverRequestId = serverRequest["id"]!.GetValue<string>();
    Assert.StartsWith("srv-", serverRequestId);

    // 3) Reply to it on a SEPARATE POST carrying a JSON-RPC result with the SAME id (§9.9). Acknowledged 202.
    var replyBody = new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = serverRequestId,
      ["result"] = new JsonObject { ["action"] = "accept", ["content"] = new JsonObject { ["name"] = "Ada" } },
    };
    using var replyResponse = await _client.SendAsync(NewPost(replyBody, mcpMethod: null));
    Assert.Equal(HttpStatusCode.Accepted, replyResponse.StatusCode);

    // 4) The handler resumes with the answer; the final response arrives on the ORIGINAL stream.
    var final = await ReadUntilAsync(reader, f => f.ContainsKey("result") && f["id"]?.GetValue<int>() == 1, TimeSpan.FromSeconds(10));
    Assert.Equal("hello Ada", final["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task An_uncorrelated_client_response_is_rejected_with_invalid_request()
  {
    // A client MUST NOT POST a JSON-RPC response that does not correlate to an outstanding server request.
    var stray = new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = "srv-does-not-exist",
      ["result"] = new JsonObject { ["action"] = "accept" },
    };
    using var response = await _client.SendAsync(NewPost(stray, mcpMethod: null));
    // Not a 202: the adapter rejects an unsolicited response.
    Assert.NotEqual(HttpStatusCode.Accepted, response.StatusCode);
    var parsed = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    Assert.Equal(ErrorCodes.InvalidRequest, parsed["error"]!["code"]!.GetValue<int>());
  }
}
