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

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Tests for the legacy <c>initialize</c> handshake (spec §9.2): the dispatch case that echoes the
/// client's requested protocol version plus the server's capabilities and identity, and the
/// special-cased non-streaming <c>initialize</c> path on the Streamable HTTP adapter. A spec client that
/// issues <c>initialize</c> (rather than <c>server/discover</c>) MUST succeed, not receive <c>-32601</c>.
/// </summary>
public sealed class ServerInitializeTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static McpServer MakeServer() => new(
    new Implementation { Name = "init-server", Version = "2.3.4" },
    new ServerCapabilities { Tools = new ToolsCapability(), Completions = new JsonObject() });

  private sealed class NullNotifier : IServerNotifier
  {
    public static readonly NullNotifier Instance = new();
    public Task NotifyAsync(JsonRpcNotification notification) => Task.CompletedTask;
  }

  private static JsonObject GoodMeta() => new()
  {
    [MetaKeys.ProtocolVersion] = ProtocolRevision.Current,
    [MetaKeys.ClientInfo] = new JsonObject { ["name"] = "c", ["version"] = "1" },
    [MetaKeys.ClientCapabilities] = new JsonObject(),
  };

  private static async Task<JsonObject> DispatchInitialize(McpServer server, JsonObject prms)
  {
    var response = await server.HandleRequestAsync(
      new JsonRpcRequest(new RequestId(1L), McpMethods.Initialize, prms), NullNotifier.Instance, null, CancellationToken.None);
    return Assert.IsType<JsonRpcSuccessResponse>(response).Result;
  }

  // ───────────────────────── Dispatch-level (§9.2) ─────────────────────────

  [Fact]
  public async Task Initialize_echoes_requested_protocol_version_capabilities_and_server_info()
  {
    var prms = new JsonObject { ["protocolVersion"] = ProtocolRevision.Current, ["_meta"] = GoodMeta() };
    var result = await DispatchInitialize(MakeServer(), prms);

    Assert.Equal(ProtocolRevision.Current, result["protocolVersion"]!.GetValue<string>());
    Assert.Equal("init-server", result["serverInfo"]!["name"]!.GetValue<string>());
    Assert.Equal("2.3.4", result["serverInfo"]!["version"]!.GetValue<string>());
    // The advertised capabilities are echoed back (tools + completions declared above).
    Assert.NotNull(result["capabilities"]!["tools"]);
    Assert.NotNull(result["capabilities"]!["completions"]);
  }

  [Fact]
  public async Task Initialize_echoes_a_client_requested_version_verbatim()
  {
    // A client requesting some other (string) version still gets the handshake accepted, echoing it back.
    var prms = new JsonObject { ["protocolVersion"] = "2025-01-01", ["_meta"] = GoodMeta() };
    var result = await DispatchInitialize(MakeServer(), prms);
    Assert.Equal("2025-01-01", result["protocolVersion"]!.GetValue<string>());
  }

  [Fact]
  public async Task Initialize_without_a_version_falls_back_to_current()
  {
    var prms = new JsonObject { ["_meta"] = GoodMeta() };
    var result = await DispatchInitialize(MakeServer(), prms);
    Assert.Equal(ProtocolRevision.Current, result["protocolVersion"]!.GetValue<string>());
  }

  [Fact]
  public async Task Initialize_carries_the_complete_result_type_discriminator()
  {
    var result = await DispatchInitialize(MakeServer(), new JsonObject { ["_meta"] = GoodMeta() });
    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task Initialize_is_distinct_from_discover_method()
  {
    // server/discover returns supportedVersions; initialize returns protocolVersion — different shapes.
    var server = MakeServer();
    var init = await DispatchInitialize(server, new JsonObject { ["_meta"] = GoodMeta() });
    Assert.Null(init["supportedVersions"]);
    Assert.NotNull(init["protocolVersion"]);
  }

  // ───────────────────────── Streamable HTTP §9.2 path ─────────────────────────

  [Fact]
  public async Task Initialize_over_http_is_a_single_non_streaming_json_response()
  {
    var server = MakeServer();
    var builder = WebApplication.CreateSlimBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    await using var app = builder.Build();
    app.MapMcp("/mcp", server);
    await app.StartAsync();
    var endpoint = $"{app.Urls.First()}/mcp";

    using var http = new HttpClient();
    var body = new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = 7,
      ["method"] = McpMethods.Initialize,
      ["params"] = new JsonObject { ["protocolVersion"] = ProtocolRevision.Current, ["_meta"] = GoodMeta() },
    };

    using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
    {
      Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
    };
    request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
    request.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.Initialize);

    using var response = await http.SendAsync(request);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    // §9.2: the handshake never streams — it is a single application/json response, NOT text/event-stream.
    Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

    var parsed = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    Assert.Equal(7, parsed["id"]!.GetValue<int>());
    Assert.Equal(ProtocolRevision.Current, parsed["result"]!["protocolVersion"]!.GetValue<string>());
    Assert.Equal("init-server", parsed["result"]!["serverInfo"]!["name"]!.GetValue<string>());

    await app.StopAsync();
  }
}
