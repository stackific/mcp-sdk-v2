using System.Net;
using System.Text;
using System.Text.Json.Nodes;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

using Stackific.Mcp.Client;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;
using Stackific.Mcp.Transport.Http;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Transport-hardening tests for <see cref="StreamableHttpServer"/> and the <c>Mcp-Param-*</c> emission /
/// receiver path (spec §9.5, §9.9, §9.11, §9.12). The pure helpers (Origin acceptance, stateless-header
/// ignore, the §9.12 fallback decision) are tested directly; the end-to-end <c>Mcp-Param-*</c> wiring is
/// driven against a real Kestrel host whose <see cref="StreamableHttpServerOptions.ToolInputSchema"/>
/// resolver enables §9.5.4 receiver validation, with a client configured to EMIT the headers.
/// </summary>
public sealed class HttpHardeningTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  // ═════════════════════════ §9.11 — Origin acceptance (pure) ═════════════════════════

  [Fact]
  public void Loopback_origins_are_accepted_by_the_default_policy()
  {
    Assert.True(StreamableHttpServer.OriginAccepted("http://localhost", null));
    Assert.True(StreamableHttpServer.OriginAccepted("http://localhost:3000", null));
    Assert.True(StreamableHttpServer.OriginAccepted("http://127.0.0.1:8080", null));
    Assert.True(StreamableHttpServer.OriginAccepted("https://localhost", null));
  }

  [Fact]
  public void Non_loopback_origins_are_rejected_by_the_default_policy()
  {
    Assert.False(StreamableHttpServer.OriginAccepted("https://evil.example", null));
    Assert.False(StreamableHttpServer.OriginAccepted("http://192.168.1.10", null));
    Assert.False(StreamableHttpServer.OriginAccepted("file://x", null));
    Assert.False(StreamableHttpServer.OriginAccepted("not-a-uri", null));
  }

  [Fact]
  public void An_explicit_allowed_origin_set_matches_exactly()
  {
    var allowed = new HashSet<string> { "https://app.example" };
    Assert.True(StreamableHttpServer.OriginAccepted("https://app.example", allowed));
    Assert.False(StreamableHttpServer.OriginAccepted("https://app.example/", allowed)); // exact, trailing slash differs
    Assert.False(StreamableHttpServer.OriginAccepted("http://localhost", allowed)); // not in the set
  }

  [Fact]
  public void An_empty_allowed_origin_set_rejects_every_present_origin()
  {
    var allowed = new HashSet<string>();
    Assert.False(StreamableHttpServer.OriginAccepted("https://app.example", allowed));
  }

  // ═════════════════════════ §9.9 — stateless headers ignored (pure) ═════════════════════════

  [Theory]
  [InlineData("Mcp-Session-Id", true)]
  [InlineData("mcp-session-id", true)]
  [InlineData("X-Session-Id", true)]
  [InlineData("Session-Id", true)]
  [InlineData("Last-Event-ID", true)]
  [InlineData("last-event-id", true)]
  [InlineData("Content-Type", false)]
  [InlineData("MCP-Protocol-Version", false)]
  public void Recognizes_ignored_stateless_headers_case_insensitively(string name, bool expected)
  {
    Assert.Equal(expected, StreamableHttpServer.IsIgnoredStatelessHeader(name));
  }

  // ═════════════════════════ §9.12 — backward-compat fallback (pure) ═════════════════════════

  [Fact]
  public void A_400_with_a_recognized_revision_error_retries_not_legacy_probe()
  {
    var body = Obj("{\"jsonrpc\":\"2.0\",\"error\":{\"code\":" + ErrorCodes.HeaderMismatch + ",\"message\":\"mismatch\"}}");
    var decision = StreamableHttpServer.InterpretPostForFallback(400, body);
    Assert.Equal(StreamableHttpServer.PostFallbackAction.Retry, decision.Action);
  }

  [Fact]
  public void Retry_carries_error_data_supported_when_present()
  {
    var body = Obj(
      "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":" + ErrorCodes.UnsupportedProtocolVersion + ",\"message\":\"unsupported\","
      + "\"data\":{\"supported\":[\"2026-07-28\",\"2025-11-25\"],\"requested\":\"1999-01-01\"}}}");
    var decision = StreamableHttpServer.InterpretPostForFallback(400, body);
    Assert.Equal(StreamableHttpServer.PostFallbackAction.Retry, decision.Action);
    Assert.Equal(new[] { "2026-07-28", "2025-11-25" }, decision.Supported);
  }

  [Fact]
  public void Retry_without_data_supported_has_no_supported_list()
  {
    var body = Obj("{\"jsonrpc\":\"2.0\",\"error\":{\"code\":" + ErrorCodes.InvalidParams + ",\"message\":\"bad params\"}}");
    var decision = StreamableHttpServer.InterpretPostForFallback(400, body);
    Assert.Equal(StreamableHttpServer.PostFallbackAction.Retry, decision.Action);
    Assert.Null(decision.Supported);
  }

  [Theory]
  [InlineData(400)]
  [InlineData(404)]
  [InlineData(405)]
  public void A_failing_status_with_an_empty_body_triggers_a_legacy_probe(int status)
  {
    var decision = StreamableHttpServer.InterpretPostForFallback(status, null);
    Assert.Equal(StreamableHttpServer.PostFallbackAction.LegacyProbe, decision.Action);
  }

  [Fact]
  public void An_unrecognized_error_code_on_a_400_triggers_a_legacy_probe()
  {
    var body = Obj("""{"jsonrpc":"2.0","error":{"code":-32099,"message":"some other server error"}}""");
    var decision = StreamableHttpServer.InterpretPostForFallback(400, body);
    Assert.Equal(StreamableHttpServer.PostFallbackAction.LegacyProbe, decision.Action);
  }

  [Fact]
  public void A_non_failing_status_with_no_revision_error_proceeds()
  {
    var body = Obj("""{"jsonrpc":"2.0","id":1,"result":{}}""");
    var decision = StreamableHttpServer.InterpretPostForFallback(200, body);
    Assert.Equal(StreamableHttpServer.PostFallbackAction.Proceed, decision.Action);
  }

  [Fact]
  public void The_legacy_endpoint_event_marks_the_deprecated_http_sse_transport()
  {
    Assert.True(StreamableHttpServer.IsLegacyHttpSseServer("endpoint"));
    Assert.False(StreamableHttpServer.IsLegacyHttpSseServer("message"));
    Assert.False(StreamableHttpServer.IsLegacyHttpSseServer(null));
    Assert.Equal("endpoint", StreamableHttpServer.LegacyEndpointEvent);
  }

  // ═════════════════════════ §9.5 — Mcp-Param-* emission ↔ receiver end-to-end ═════════════════════════

  /// <summary>
  /// The annotated tool's input schema: a <c>region</c> string mirrored into <c>Mcp-Param-Region</c> and
  /// a <c>limit</c> integer mirrored into <c>Mcp-Param-Limit</c>.
  /// </summary>
  private static readonly JsonObject AnnotatedSchema = Obj("""
    {"type":"object","properties":{
      "region":{"type":"string","x-mcp-header":"Region"},
      "limit":{"type":"integer","x-mcp-header":"Limit"},
      "query":{"type":"string"}},
     "required":["query"]}
    """);

  /// <summary>Boots a host that registers the annotated <c>run</c> tool and enables §9.5.4 receiver validation.</summary>
  private static async Task<(WebApplication App, string Endpoint)> StartHostAsync()
  {
    var server = new McpServer(
      new Implementation { Name = "hardening-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });

    server.RegisterTool(
      new Tool { Name = "run", InputSchema = (JsonObject)AnnotatedSchema.DeepClone() },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("query"))));

    var options = new StreamableHttpServerOptions
    {
      // The receiver validates Mcp-Param-* against the body for the "run" tool.
      ToolInputSchema = name => name == "run" ? AnnotatedSchema.DeepClone() : null,
    };

    var builder = WebApplication.CreateSlimBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    var app = builder.Build();
    app.MapMcp("/mcp", server, authGate: null, options);
    await app.StartAsync();
    return (app, $"{app.Urls.First()}/mcp");
  }

  /// <summary>A client that EMITS Mcp-Param-* headers by learning the annotated schema for "run".</summary>
  private static McpClient ConnectEmitting(string endpoint) =>
    new(
      new StreamableHttpClientTransport(
        new Uri(endpoint),
        learnedToolSchema: name => name == "run" ? AnnotatedSchema.DeepClone() : null),
      new Implementation { Name = "hardening-client", Version = "1.0.0" });

  /// <summary>
  /// A client EMITTING <c>Mcp-Param-*</c> headers and a server VALIDATING them against the body agree:
  /// the call round-trips successfully (the receiver does not reject the matching headers).
  /// </summary>
  [Fact]
  public async Task Emitted_param_headers_match_the_body_and_round_trip()
  {
    var (app, endpoint) = await StartHostAsync();
    try
    {
      await using var client = ConnectEmitting(endpoint);
      await client.DiscoverAsync();

      var result = await client.CallToolAsync("run", Obj("""{"region":"us-west1","limit":42,"query":"SELECT 1"}"""));
      Assert.Equal("SELECT 1", result["content"]![0]!["text"]!.GetValue<string>());
    }
    finally
    {
      await app.StopAsync();
      await app.DisposeAsync();
    }
  }

  /// <summary>
  /// A raw POST whose <c>Mcp-Param-Region</c> header disagrees with the body value is rejected by the
  /// receiver with 400 / -32001 (R-9.5.4-c).
  /// </summary>
  [Fact]
  public async Task Mismatched_param_header_is_rejected_400_minus_32001()
  {
    var (app, endpoint) = await StartHostAsync();
    try
    {
      using var raw = new HttpClient();
      using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
      {
        Content = new StringContent(RunBody("eu-central1").ToJsonString(), Encoding.UTF8, "application/json"),
      };
      request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
      request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
      request.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.ToolsCall);
      request.Headers.TryAddWithoutValidation("Mcp-Name", "run");
      // The header disagrees with the body's region ("us-west1").
      request.Headers.TryAddWithoutValidation("Mcp-Param-Region", "us-west1");

      using var response = await raw.SendAsync(request, HttpCompletionOption.ResponseContentRead);
      Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
      var obj = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
      Assert.Equal(ErrorCodes.HeaderMismatch, obj["error"]!["code"]!.GetValue<int>());
    }
    finally
    {
      await app.StopAsync();
      await app.DisposeAsync();
    }
  }

  /// <summary>
  /// An integer param header is compared numerically: <c>Mcp-Param-Limit: 42.0</c> matches a body
  /// <c>limit</c> of <c>42</c> and the receiver accepts it (R-9.5.4-d).
  /// </summary>
  [Fact]
  public async Task Integer_param_header_is_compared_numerically_by_the_receiver()
  {
    var (app, endpoint) = await StartHostAsync();
    try
    {
      using var raw = new HttpClient();
      using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
      {
        Content = new StringContent(RunBody("us-west1", limit: 42).ToJsonString(), Encoding.UTF8, "application/json"),
      };
      request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
      request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
      request.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.ToolsCall);
      request.Headers.TryAddWithoutValidation("Mcp-Name", "run");
      request.Headers.TryAddWithoutValidation("Mcp-Param-Region", "us-west1");
      request.Headers.TryAddWithoutValidation("Mcp-Param-Limit", "42.0");

      using var response = await raw.SendAsync(request, HttpCompletionOption.ResponseContentRead);
      Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
    finally
    {
      await app.StopAsync();
      await app.DisposeAsync();
    }
  }

  /// <summary>
  /// AUTO-WIRING (§9.5.4): when <see cref="StreamableHttpServer.MapMcp"/> is given an <see cref="McpServer"/>
  /// and NO explicit <see cref="StreamableHttpServerOptions.ToolInputSchema"/>, the adapter defaults the
  /// resolver to the server's own registry, so a mismatched <c>Mcp-Param-*</c> header is still rejected
  /// with 400 / -32001 — no manual resolver wiring required.
  /// </summary>
  [Fact]
  public async Task Auto_wired_receiver_rejects_a_mismatched_param_header_without_an_explicit_resolver()
  {
    var server = new McpServer(
      new Implementation { Name = "auto-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });
    server.RegisterTool(
      new Tool { Name = "run", InputSchema = (JsonObject)AnnotatedSchema.DeepClone() },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("query"))));

    var builder = WebApplication.CreateSlimBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    var app = builder.Build();
    // No options.ToolInputSchema supplied — the adapter must auto-wire it from the McpServer registry.
    app.MapMcp("/mcp", server);
    await app.StartAsync();
    var endpoint = $"{app.Urls.First()}/mcp";

    try
    {
      using var raw = new HttpClient();
      using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
      {
        Content = new StringContent(RunBody("us-west1").ToJsonString(), Encoding.UTF8, "application/json"),
      };
      request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
      request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
      request.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.ToolsCall);
      request.Headers.TryAddWithoutValidation("Mcp-Name", "run");
      // Header disagrees with the body's region ("us-west1").
      request.Headers.TryAddWithoutValidation("Mcp-Param-Region", "eu-central1");

      using var response = await raw.SendAsync(request, HttpCompletionOption.ResponseContentRead);
      Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
      var obj = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
      Assert.Equal(ErrorCodes.HeaderMismatch, obj["error"]!["code"]!.GetValue<int>());
    }
    finally
    {
      await app.StopAsync();
      await app.DisposeAsync();
    }
  }

  /// <summary>Builds a well-formed tools/call body for the "run" tool with the given region (and optional limit).</summary>
  private static JsonObject RunBody(string region, int? limit = null)
  {
    var arguments = new JsonObject { ["region"] = region, ["query"] = "SELECT 1" };
    if (limit is not null) arguments["limit"] = limit.Value;
    var meta = new JsonObject
    {
      ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "raw", ["version"] = "1.0.0" },
      ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
      ["io.modelcontextprotocol/protocolVersion"] = ProtocolRevision.Current,
    };
    return new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = 1,
      ["method"] = McpMethods.ToolsCall,
      ["params"] = new JsonObject { ["name"] = "run", ["arguments"] = arguments, ["_meta"] = meta },
    };
  }
}
