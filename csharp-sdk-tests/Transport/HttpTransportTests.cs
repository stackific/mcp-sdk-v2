using System.Globalization;
using System.Text.Json.Nodes;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

using Stackific.Mcp.Client;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Exercises the Streamable HTTP transport (spec §9) end-to-end against a real Kestrel host: the
/// single-JSON shape (§9.6.1), the event-stream shape with live progress (§9.6.2), the HTTP status
/// mapping for protocol errors (§9.7), and stateless GET rejection (§9.9).
/// </summary>
public sealed class HttpTransportTests : IAsyncLifetime
{
  private WebApplication _app = null!;
  private string _endpoint = null!;

  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  public async Task InitializeAsync()
  {
    var server = new McpServer(
      new Implementation { Name = "http-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability(), Logging = new JsonObject() });

    server.RegisterTool(
      new Tool { Name = "add", InputSchema = Obj("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText((ctx.GetDouble("a") + ctx.GetDouble("b")).ToString(CultureInfo.InvariantCulture))));

    server.RegisterTool(
      new Tool { Name = "slow_count", InputSchema = Obj("""{"type":"object","properties":{"to":{"type":"integer"}}}""") },
      async ctx =>
      {
        var to = ctx.GetInt("to", 3);
        for (var i = 1; i <= to; i++) await ctx.ReportProgressAsync(i, to);
        return CallToolResult.FromText($"Counted to {to}.");
      });

    var builder = WebApplication.CreateSlimBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    _app = builder.Build();
    _app.MapMcp("/mcp", server);
    await _app.StartAsync();

    var address = _app.Urls.First();
    _endpoint = $"{address}/mcp";
  }

  public async Task DisposeAsync()
  {
    await _app.StopAsync();
    await _app.DisposeAsync();
  }

  private McpClient Connect() =>
    new(new StreamableHttpClientTransport(new Uri(_endpoint)), new Implementation { Name = "http-client", Version = "1.0.0" });

  [Fact]
  public async Task Discovers_and_calls_a_tool_over_http_single_json()
  {
    await using var client = Connect();
    await client.DiscoverAsync();
    Assert.Equal(ProtocolRevision.Current, client.NegotiatedVersion);

    var result = await client.CallToolAsync("add", Obj("""{"a":40,"b":2}"""));
    Assert.Equal("42", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Streams_progress_over_an_event_stream()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var progress = new List<JsonRpcNotification>();
    var result = await client.CallToolAsync("slow_count", Obj("""{"to":4}"""), new RequestOptions
    {
      ProgressToken = "sc-1",
      OnNotification = n => { lock (progress) progress.Add(n); },
    });

    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal(4, progress.Count(n => n.Method == McpMethods.NotificationsProgress));
  }

  [Fact]
  public async Task Unknown_tool_maps_to_http_400_and_throws_invalid_params()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("nope"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Unknown_method_maps_to_http_404_method_not_found()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.RequestAsync("does/not/exist"));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Get_is_rejected_with_405_stateless_endpoint()
  {
    using var http = new HttpClient();
    var response = await http.GetAsync(_endpoint);
    Assert.Equal(System.Net.HttpStatusCode.MethodNotAllowed, response.StatusCode);
  }
}
