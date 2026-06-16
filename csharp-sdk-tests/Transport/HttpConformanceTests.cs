using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
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

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// An exhaustive conformance sweep over the Streamable HTTP transport (spec §9), driven against a real
/// Kestrel host. The cases fall into two families:
/// <list type="bullet">
///   <item>raw <see cref="HttpClient"/> POSTs that assert the exact HTTP status, headers, and JSON-RPC
///   error codes the adapter produces — the header gate (§9.3/§9.4), the response-shape selection
///   (§9.6.1/§9.6.2), the status mapping (§9.7), notification acceptance (§9.2), and statelessness
///   (§9.9); and</item>
///   <item>round-trips through <see cref="StreamableHttpClientTransport"/> via an <see cref="McpClient"/>
///   that assert the client-observable behavior — discovery, tool calls, live progress, and the
///   <see cref="McpError"/> surfaced for each protocol error.</item>
/// </list>
/// The server is booted once for the whole class and exposes four tools: <c>echo</c>, <c>add</c>, a
/// <c>slow</c> tool that reports progress, and a <c>logger</c> tool that emits a log notification.
/// </summary>
public sealed class HttpConformanceTests : IAsyncLifetime
{
  private WebApplication _app = null!;
  private string _endpoint = null!;
  private HttpClient _raw = null!;

  /// <summary>The protocol revision this SDK speaks; used to stamp valid request bodies and headers.</summary>
  private static readonly string Version = ProtocolRevision.Current;

  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  // ───────────────────────── Host lifecycle ─────────────────────────

  public async Task InitializeAsync()
  {
    var server = new McpServer(
      new Implementation { Name = "conformance-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability(), Logging = new JsonObject() });

    // echo: returns its single string argument verbatim — the minimal no-notification tool (§9.6.1).
    server.RegisterTool(
      new Tool { Name = "echo", InputSchema = Obj("""{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("text"))));

    // add: numeric reducer, used to assert id correlation and value round-tripping.
    server.RegisterTool(
      new Tool { Name = "add", InputSchema = Obj("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText((ctx.GetDouble("a") + ctx.GetDouble("b")).ToString(CultureInfo.InvariantCulture))));

    // slow: reports N cumulative progress updates, then a final result — drives the event-stream shape (§9.6.2).
    server.RegisterTool(
      new Tool { Name = "slow", InputSchema = Obj("""{"type":"object","properties":{"steps":{"type":"integer"}}}""") },
      async ctx =>
      {
        var steps = ctx.GetInt("steps", 3);
        for (var i = 1; i <= steps; i++) await ctx.ReportProgressAsync(i, steps, $"step {i}");
        return CallToolResult.FromText($"done {steps}");
      });

    // logger: emits one notifications/message — forces the buffered-event-stream shape even with no token.
    server.RegisterTool(
      new Tool { Name = "logger", InputSchema = Obj("""{"type":"object","properties":{}}""") },
      async ctx =>
      {
        await ctx.LogAsync(LoggingLevel.Info, "hello from logger", "test");
        return CallToolResult.FromText("logged");
      });

    // cancel_me: commits to a stream with one progress update, then blocks until cancelled — exercises the
    // §15.2.2 notifications/cancelled path (the response MUST be suppressed once cancelled).
    server.RegisterTool(
      new Tool { Name = "cancel_me", InputSchema = Obj("""{"type":"object","properties":{}}""") },
      async ctx =>
      {
        await ctx.ReportProgressAsync(1, 1, "started");
        await Task.Delay(TimeSpan.FromSeconds(30), ctx.Signal);
        return CallToolResult.FromText("should never be delivered");
      });

    var builder = WebApplication.CreateSlimBuilder();
    builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Logging.ClearProviders();
    _app = builder.Build();
    _app.MapMcp("/mcp", server);
    await _app.StartAsync();

    _endpoint = $"{_app.Urls.First()}/mcp";
    _raw = new HttpClient();
  }

  public async Task DisposeAsync()
  {
    _raw.Dispose();
    await _app.StopAsync();
    await _app.DisposeAsync();
  }

  // ───────────────────────── Raw-POST helpers ─────────────────────────

  private McpClient Connect() =>
    new(new StreamableHttpClientTransport(new Uri(_endpoint)), new Implementation { Name = "conformance-client", Version = "1.0.0" });

  /// <summary>Builds the canonical <c>_meta</c> envelope a request body must carry (§4.3), at <paramref name="version"/>.</summary>
  private static JsonObject Meta(string? version = null)
  {
    var meta = new JsonObject
    {
      ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "raw", ["version"] = "1.0.0" },
      ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
    };
    if (version is not null) meta["io.modelcontextprotocol/protocolVersion"] = version;
    return meta;
  }

  /// <summary>Builds a well-formed JSON-RPC request body for <paramref name="method"/>, optionally a tools/call for <paramref name="toolName"/>.</summary>
  private static JsonObject Body(string method, string? toolName = null, JsonObject? extraMeta = null, long id = 1)
  {
    var meta = Meta(Version);
    if (extraMeta is not null)
    {
      foreach (var (k, v) in extraMeta) meta[k] = v?.DeepClone();
    }

    var prms = new JsonObject { ["_meta"] = meta };
    if (toolName is not null)
    {
      prms["name"] = toolName;
      prms["arguments"] = new JsonObject();
    }

    return new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = prms };
  }

  /// <summary>
  /// Issues a raw POST of <paramref name="bodyText"/> with the supplied routing headers applied verbatim.
  /// The required <c>Accept</c> header (§9.3.2) defaults to both media types so the request is spec-valid;
  /// pass <paramref name="accept"/> to override it (or the sentinel <c>"<none>"</c> to omit it) when
  /// exercising the §9.3.2 rejection path.
  /// </summary>
  private async Task<HttpResponseMessage> PostAsync(
    string bodyText,
    string? protocolVersion,
    string? mcpMethod,
    string? mcpName,
    string? accept = "application/json, text/event-stream")
  {
    using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(bodyText, Encoding.UTF8, "application/json"),
    };
    if (accept is not null && accept != "<none>") request.Headers.TryAddWithoutValidation("Accept", accept);
    if (protocolVersion is not null) request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", protocolVersion);
    if (mcpMethod is not null) request.Headers.TryAddWithoutValidation("Mcp-Method", mcpMethod);
    if (mcpName is not null) request.Headers.TryAddWithoutValidation("Mcp-Name", mcpName);
    return await _raw.SendAsync(request, HttpCompletionOption.ResponseContentRead);
  }

  /// <summary>Posts a fully-valid body with the canonical headers for <paramref name="method"/>/<paramref name="toolName"/>.</summary>
  private Task<HttpResponseMessage> PostValidAsync(string method, string? toolName = null, JsonObject? extraMeta = null) =>
    PostAsync(Body(method, toolName, extraMeta).ToJsonString(), Version, method, toolName);

  /// <summary>
  /// The per-request <c>_meta</c> opt-in (§4.3, §15.3.3) a request must carry to receive any
  /// <c>notifications/message</c> log entries; without it the server emits no logs for the request.
  /// </summary>
  private static JsonObject LogOptIn() => new() { ["io.modelcontextprotocol/logLevel"] = "debug" };

  private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response) =>
    JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();

  /// <summary>Reads the <c>error.code</c> from a JSON-RPC error response body.</summary>
  private static async Task<int> ErrorCodeAsync(HttpResponseMessage response)
  {
    var obj = await ReadJsonAsync(response);
    return obj["error"]!["code"]!.GetValue<int>();
  }

  // ═════════════════════════ §9.3/§9.4 — required header gate ═════════════════════════

  /// <summary>A fully-correct POST — every required header present and matching the body — is dispatched (200).</summary>
  [Fact]
  public async Task Valid_headers_and_body_are_dispatched_with_200()
  {
    using var response = await PostValidAsync(McpMethods.ToolsCall, "logger");
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
  }

  /// <summary>The fully-correct call's body carries the answered result with the matching content.</summary>
  [Fact]
  public async Task Valid_tools_call_returns_the_tool_result()
  {
    var body = Body(McpMethods.ToolsCall, "echo");
    body["params"]!["arguments"] = new JsonObject { ["text"] = "ping" };
    using var response = await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, "echo");

    var obj = await ReadJsonAsync(response);
    Assert.Equal("ping", obj["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  /// <summary>§9.3.3: a missing <c>MCP-Protocol-Version</c> header is rejected with 400 and code -32001.</summary>
  [Fact]
  public async Task Missing_protocol_version_header_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.ToolsCall, "echo").ToJsonString(), protocolVersion: null, McpMethods.ToolsCall, "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>§9.3.3: the header revision must match the body <c>_meta</c> revision; a mismatch is 400/-32001.</summary>
  [Fact]
  public async Task Protocol_version_header_not_matching_body_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.ToolsCall, "echo").ToJsonString(), protocolVersion: "1999-01-01", McpMethods.ToolsCall, "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>§9.4.1: a missing <c>Mcp-Method</c> header is rejected with 400 and code -32001.</summary>
  [Fact]
  public async Task Missing_mcp_method_header_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.ToolsCall, "echo").ToJsonString(), Version, mcpMethod: null, "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>§9.4.1: the <c>Mcp-Method</c> header must equal the body method; a mismatch is 400/-32001.</summary>
  [Fact]
  public async Task Mcp_method_header_not_matching_body_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.ToolsCall, "echo").ToJsonString(), Version, mcpMethod: "tools/list", "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>§9.4.2: <c>tools/call</c> requires an <c>Mcp-Name</c> header; omitting it is 400/-32001.</summary>
  [Fact]
  public async Task Missing_mcp_name_header_on_tools_call_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.ToolsCall, "echo").ToJsonString(), Version, McpMethods.ToolsCall, mcpName: null);
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>§9.4.2: the <c>Mcp-Name</c> header must equal <c>params.name</c>; a mismatch is 400/-32001.</summary>
  [Fact]
  public async Task Mcp_name_header_not_matching_params_name_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.ToolsCall, "echo").ToJsonString(), Version, McpMethods.ToolsCall, mcpName: "add");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>
  /// A theory over single-header mutations of an otherwise-valid <c>tools/call</c>: every malformed or
  /// mismatched required routing header collapses to the same 400 + -32001 outcome (§9.3/§9.4). The
  /// final row is the all-correct control, which must instead reach 200.
  /// </summary>
  [Theory]
  [InlineData("missing-version", null, McpMethods.ToolsCall, "echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("empty-version", "", McpMethods.ToolsCall, "echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("wrong-version", "2000-01-01", McpMethods.ToolsCall, "echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("missing-method", "$VER", null, "echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("empty-method", "$VER", "", "echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("wrong-method", "$VER", "tools/list", "echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("case-shifted-method", "$VER", "Tools/Call", "echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("missing-name", "$VER", McpMethods.ToolsCall, null, 400, ErrorCodes.HeaderMismatch)]
  [InlineData("empty-name", "$VER", McpMethods.ToolsCall, "", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("wrong-name", "$VER", McpMethods.ToolsCall, "add", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("case-shifted-name", "$VER", McpMethods.ToolsCall, "Echo", 400, ErrorCodes.HeaderMismatch)]
  [InlineData("all-correct", "$VER", McpMethods.ToolsCall, "logger", 200, 0)]
  public async Task Header_mutations_collapse_to_400_header_mismatch(
    string _, string? version, string? method, string? name, int expectedStatus, int expectedCode)
  {
    // "$VER" is a placeholder so the current revision (not a literal) flows through the InlineData rows.
    var resolvedVersion = version == "$VER" ? Version : version;
    // The body targets the no-required-args "logger" tool so the all-correct row actually dispatches
    // (200) rather than tripping argument validation; the mismatch rows still fail at the header gate.
    using var response = await PostAsync(Body(McpMethods.ToolsCall, "logger").ToJsonString(), resolvedVersion, method, name);

    Assert.Equal((HttpStatusCode)expectedStatus, response.StatusCode);
    if (expectedCode != 0)
    {
      Assert.Equal(expectedCode, await ErrorCodeAsync(response));
    }
  }

  /// <summary>The header gate also guards non-tool methods: <c>tools/list</c> needs only version + method, and accepts.</summary>
  [Fact]
  public async Task Tools_list_with_version_and_method_headers_is_dispatched()
  {
    using var response = await PostValidAsync(McpMethods.ToolsList);
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
  }

  /// <summary>A method that defines no <c>Mcp-Name</c> (here <c>ping</c>) is accepted without that header (§9.4.2).</summary>
  [Fact]
  public async Task Method_without_name_does_not_require_mcp_name_header()
  {
    using var response = await PostAsync(Body(McpMethods.Ping).ToJsonString(), Version, McpMethods.Ping, mcpName: null);
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
  }

  // ═════════════════════════ §9.6.1 — single JSON response ═════════════════════════

  /// <summary>§9.6.1: a call that emits no notifications answers with <c>Content-Type: application/json</c>.</summary>
  [Fact]
  public async Task Call_without_notifications_uses_application_json_content_type()
  {
    using var response = await PostValidAsync(McpMethods.ToolsCall, "echo");
    Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
  }

  /// <summary>§9.6.1: the single JSON body is one response object whose <c>id</c> matches the request's.</summary>
  [Fact]
  public async Task Single_json_response_echoes_the_request_id()
  {
    var body = Body(McpMethods.ToolsCall, "echo", id: 4242);
    body["params"]!["arguments"] = new JsonObject { ["text"] = "x" };
    using var response = await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, "echo");

    var obj = await ReadJsonAsync(response);
    Assert.Equal(4242, obj["id"]!.GetValue<long>());
    Assert.Equal("2.0", obj["jsonrpc"]!.GetValue<string>());
  }

  /// <summary>§9.6.1: the single JSON response is not an event stream (no <c>X-Accel-Buffering</c> header).</summary>
  [Fact]
  public async Task Single_json_response_is_not_an_event_stream()
  {
    using var response = await PostValidAsync(McpMethods.ToolsCall, "echo");
    Assert.NotEqual("text/event-stream", response.Content.Headers.ContentType?.MediaType);
    Assert.False(response.Headers.Contains("X-Accel-Buffering"));
  }

  /// <summary>The successful single-JSON body carries <c>result.resultType == "complete"</c> (§3.6).</summary>
  [Fact]
  public async Task Single_json_result_is_marked_complete()
  {
    var body = Body(McpMethods.ToolsCall, "add");
    body["params"]!["arguments"] = new JsonObject { ["a"] = 2, ["b"] = 3 };
    using var response = await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, "add");

    var obj = await ReadJsonAsync(response);
    Assert.Equal("complete", obj["result"]!["resultType"]!.GetValue<string>());
    Assert.Equal("5", obj["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  // ═════════════════════════ §9.6.2 — event stream ═════════════════════════

  /// <summary>Reads the raw SSE body and returns each <c>data:</c> payload as a parsed JSON object.</summary>
  private static async Task<List<JsonObject>> ReadSseEventsAsync(HttpResponseMessage response)
  {
    var events = new List<JsonObject>();
    var text = await response.Content.ReadAsStringAsync();
    foreach (var line in text.Split('\n'))
    {
      if (!line.StartsWith("data:", StringComparison.Ordinal)) continue;
      var payload = line.Length > 5 && line[5] == ' ' ? line[6..] : line[5..];
      if (payload.Length == 0) continue;
      events.Add(JsonNode.Parse(payload)!.AsObject());
    }
    return events;
  }

  private async Task<HttpResponseMessage> PostWithProgressTokenAsync(string toolName, JsonObject arguments, string token)
  {
    var body = Body(McpMethods.ToolsCall, toolName, extraMeta: new JsonObject { ["progressToken"] = token });
    body["params"]!["arguments"] = arguments;
    return await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, toolName);
  }

  /// <summary>§9.6.2: a call carrying a <c>progressToken</c> in <c>_meta</c> answers with <c>text/event-stream</c>.</summary>
  [Fact]
  public async Task Progress_token_selects_the_event_stream_content_type()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 3 }, "p-1");
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
  }

  /// <summary>§9.6.2: the event stream sets <c>X-Accel-Buffering: no</c> so proxies do not buffer it.</summary>
  [Fact]
  public async Task Event_stream_disables_proxy_buffering()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 2 }, "p-2");
    Assert.True(response.Headers.TryGetValues("X-Accel-Buffering", out var values));
    Assert.Equal("no", values!.Single());
  }

  /// <summary>§9.6.2: the stream is not cached (<c>Cache-Control: no-cache</c>).</summary>
  [Fact]
  public async Task Event_stream_is_marked_no_cache()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 2 }, "p-3");
    Assert.Contains("no-cache", response.Headers.CacheControl?.ToString() ?? string.Empty);
  }

  /// <summary>§9.6.2: the stream carries one <c>notifications/progress</c> per reported step plus the final response.</summary>
  [Fact]
  public async Task Event_stream_carries_one_progress_event_per_step()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 5 }, "p-4");
    var events = await ReadSseEventsAsync(response);

    var progress = events.Count(e => e["method"]?.GetValue<string>() == McpMethods.NotificationsProgress);
    Assert.Equal(5, progress);
    Assert.Equal(6, events.Count); // five progress notifications + one final response
  }

  /// <summary>§9.6.2: every progress notification precedes the single terminal response on the stream.</summary>
  [Fact]
  public async Task Final_response_terminates_the_event_stream()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 3 }, "p-5");
    var events = await ReadSseEventsAsync(response);

    var lastIsResponse = events[^1].ContainsKey("result") || events[^1].ContainsKey("error");
    Assert.True(lastIsResponse);
    Assert.All(events[..^1], e => Assert.Equal(McpMethods.NotificationsProgress, e["method"]!.GetValue<string>()));
    Assert.Single(events, e => e.ContainsKey("result"));
  }

  /// <summary>§15.1: each progress notification echoes the caller's token and carries a strictly increasing value.</summary>
  [Fact]
  public async Task Progress_notifications_echo_the_token_and_increase()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 4 }, "tok-xyz");
    var events = await ReadSseEventsAsync(response);

    var progressEvents = events.Where(e => e["method"]?.GetValue<string>() == McpMethods.NotificationsProgress).ToList();
    Assert.All(progressEvents, e => Assert.Equal("tok-xyz", e["params"]!["progressToken"]!.GetValue<string>()));

    var values = progressEvents.Select(e => e["params"]!["progress"]!.GetValue<double>()).ToList();
    Assert.Equal(new[] { 1d, 2d, 3d, 4d }, values);
  }

  /// <summary>The terminal response on the progress stream still answers the request id with a complete result.</summary>
  [Fact]
  public async Task Event_stream_final_response_matches_id_and_completes()
  {
    var body = Body(McpMethods.ToolsCall, "slow", extraMeta: new JsonObject { ["progressToken"] = "id-check" }, id: 77);
    body["params"]!["arguments"] = new JsonObject { ["steps"] = 2 };
    using var response = await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, "slow");

    var events = await ReadSseEventsAsync(response);
    var final = events.Single(e => e.ContainsKey("result"));
    Assert.Equal(77, final["id"]!.GetValue<long>());
    Assert.Equal("done 2", final["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  /// <summary>
  /// §9.6.1 fallthrough: a tool that emits a notification but receives no progress token still upgrades
  /// to a (buffered) event stream, because the adapter picks the shape from whether anything was emitted.
  /// </summary>
  [Fact]
  public async Task Logging_tool_without_token_buffers_into_an_event_stream()
  {
    // §15.3.3: the request opts in to logs via _meta (it carries no PROGRESS token, hence the name).
    using var response = await PostValidAsync(McpMethods.ToolsCall, "logger", LogOptIn());
    Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

    var events = await ReadSseEventsAsync(response);
    Assert.Contains(events, e => e["method"]?.GetValue<string>() == McpMethods.NotificationsMessage);
    Assert.Single(events, e => e.ContainsKey("result"));
  }

  /// <summary>The buffered log stream delivers the log notification before the terminal response.</summary>
  [Fact]
  public async Task Buffered_log_stream_orders_notification_before_response()
  {
    using var response = await PostValidAsync(McpMethods.ToolsCall, "logger", LogOptIn());
    var events = await ReadSseEventsAsync(response);

    Assert.Equal(McpMethods.NotificationsMessage, events[0]["method"]!.GetValue<string>());
    Assert.True(events[^1].ContainsKey("result"));
  }

  /// <summary>A progress token of zero steps yields a stream with only the terminal response (no progress events).</summary>
  [Fact]
  public async Task Zero_step_progress_stream_carries_only_the_final_response()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 0 }, "p-0");
    var events = await ReadSseEventsAsync(response);

    Assert.Single(events);
    Assert.True(events[0].ContainsKey("result"));
  }

  // ═════════════════════════ §7.6 — strict UTF-8 on the POST body ═════════════════════════

  /// <summary>§7.6: a body that is not well-formed UTF-8 MUST be rejected (never silently substituted) — 400 / -32700.</summary>
  [Fact]
  public async Task An_ill_formed_utf8_body_is_rejected_with_parse_error()
  {
    // A structurally valid JSON envelope whose string value carries a lone 0xFF byte — never valid UTF-8.
    // Corrupt the single uppercase 'A' (the only one in the body) so the JSON shape stays intact.
    var bytes = Encoding.UTF8.GetBytes("""{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":"A"}}""");
    bytes[Array.IndexOf(bytes, (byte)'A')] = 0xFF;

    using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint) { Content = new ByteArrayContent(bytes) };
    request.Content.Headers.TryAddWithoutValidation("Content-Type", "application/json");
    request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", Version);
    request.Headers.TryAddWithoutValidation("Mcp-Method", "ping");

    using var response = await _raw.SendAsync(request);
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.ParseError, await ErrorCodeAsync(response));
  }

  // ═════════════════════════ §15.2.2 — notifications/cancelled suppresses the response ═════════════════════════

  /// <summary>§15.2.2 (MUST NOT): after a notifications/cancelled the cancelled request emits no terminal response.</summary>
  [Fact]
  public async Task A_cancelled_streaming_request_emits_no_terminal_response()
  {
    var body = Body(McpMethods.ToolsCall, "cancel_me", extraMeta: new JsonObject { ["progressToken"] = "c-1" });
    using var post = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
    };
    post.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    post.Headers.TryAddWithoutValidation("MCP-Protocol-Version", Version);
    post.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.ToolsCall);
    post.Headers.TryAddWithoutValidation("Mcp-Name", "cancel_me");

    using var response = await _raw.SendAsync(post, HttpCompletionOption.ResponseHeadersRead);
    Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

    await using var stream = await response.Content.ReadAsStreamAsync();
    using var reader = new StreamReader(stream, Encoding.UTF8);

    // The handler commits with a progress frame — proving it is in-flight (its CTS is registered).
    var progress = await ReadSseFrameAsync(reader, f => f["method"]?.GetValue<string>() == McpMethods.NotificationsProgress, TimeSpan.FromSeconds(10));
    Assert.NotNull(progress);

    // POST notifications/cancelled for the same request id (the body's id is 1) on a separate request.
    var cancel = new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["method"] = McpMethods.NotificationsCancelled,
      ["params"] = new JsonObject { ["requestId"] = 1 },
    };
    using var cancelPost = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(cancel.ToJsonString(), Encoding.UTF8, "application/json"),
    };
    cancelPost.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    cancelPost.Headers.TryAddWithoutValidation("MCP-Protocol-Version", Version);
    cancelPost.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.NotificationsCancelled);
    using var cancelResponse = await _raw.SendAsync(cancelPost);
    Assert.Equal(HttpStatusCode.Accepted, cancelResponse.StatusCode);

    // The stream ends WITHOUT any terminal response (a frame carrying result/error) for the cancelled id.
    var terminal = await ReadSseFrameAsync(reader, f => f.ContainsKey("result") || f.ContainsKey("error"), TimeSpan.FromSeconds(10));
    Assert.Null(terminal);
  }

  /// <summary>Reads SSE <c>data:</c> frames until one matches <paramref name="predicate"/>; returns <c>null</c> when the stream ends first.</summary>
  private static async Task<JsonObject?> ReadSseFrameAsync(StreamReader reader, Func<JsonObject, bool> predicate, TimeSpan timeout)
  {
    using var cts = new CancellationTokenSource(timeout);
    try
    {
      while (true)
      {
        var line = await reader.ReadLineAsync(cts.Token);
        if (line is null) return null; // stream closed
        if (!line.StartsWith("data:", StringComparison.Ordinal)) continue;
        var payload = line.Length > 5 && line[5] == ' ' ? line[6..] : line[5..];
        if (payload.Length == 0) continue;
        var frame = JsonNode.Parse(payload)!.AsObject();
        if (predicate(frame)) return frame;
      }
    }
    catch (OperationCanceledException)
    {
      return null; // no matching frame within the timeout (the stream stayed open but silent)
    }
  }

  // ═════════════════════════ §9.7 — HTTP status mapping for protocol errors ═════════════════════════

  /// <summary>§9.7: an unknown method maps to HTTP 404 and JSON-RPC -32601 (method not found).</summary>
  [Fact]
  public async Task Unknown_method_maps_to_404_method_not_found()
  {
    using var response = await PostValidAsync("does/not/exist");
    Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    Assert.Equal(ErrorCodes.MethodNotFound, await ErrorCodeAsync(response));
  }

  /// <summary>§9.7: an unknown tool maps to HTTP 400 and JSON-RPC -32602 (invalid params).</summary>
  [Fact]
  public async Task Unknown_tool_maps_to_400_invalid_params()
  {
    using var response = await PostValidAsync(McpMethods.ToolsCall, "no-such-tool");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.InvalidParams, await ErrorCodeAsync(response));
  }

  /// <summary>§9.7: malformed JSON in the body maps to HTTP 400 and JSON-RPC -32700 (parse error).</summary>
  [Fact]
  public async Task Malformed_json_body_maps_to_400_parse_error()
  {
    using var response = await PostAsync("{ this is : not json", Version, McpMethods.ToolsCall, "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.ParseError, await ErrorCodeAsync(response));
  }

  /// <summary>§9.7: a truncated JSON document is likewise a parse error (400 / -32700).</summary>
  [Fact]
  public async Task Truncated_json_body_maps_to_400_parse_error()
  {
    using var response = await PostAsync("{\"jsonrpc\":\"2.0\",", Version, McpMethods.ToolsCall, "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.ParseError, await ErrorCodeAsync(response));
  }

  /// <summary>§9.7/§3.1: a top-level JSON array (a batch) is not a single message — 400 / -32600 (invalid request).</summary>
  [Fact]
  public async Task Batch_array_body_maps_to_400_invalid_request()
  {
    using var response = await PostAsync("[]", Version, McpMethods.ToolsCall, "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.InvalidRequest, await ErrorCodeAsync(response));
  }

  /// <summary>§9.7/§3.1: a non-object scalar body is malformed — 400 / -32600 (invalid request).</summary>
  [Fact]
  public async Task Scalar_body_maps_to_400_invalid_request()
  {
    using var response = await PostAsync("42", Version, McpMethods.ToolsCall, "echo");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.InvalidRequest, await ErrorCodeAsync(response));
  }

  /// <summary>§3.1: an object whose <c>jsonrpc</c> is not exactly <c>"2.0"</c> is an invalid request — 400 / -32600.</summary>
  [Fact]
  public async Task Wrong_jsonrpc_version_maps_to_400_invalid_request()
  {
    using var response = await PostAsync("{\"jsonrpc\":\"1.0\",\"id\":1,\"method\":\"ping\"}", Version, McpMethods.Ping, null);
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.InvalidRequest, await ErrorCodeAsync(response));
  }

  /// <summary>§4.3: a request whose body omits the required <c>_meta</c> envelope is invalid params — 400 / -32602.</summary>
  [Fact]
  public async Task Missing_request_meta_maps_to_400_invalid_params()
  {
    var noMeta = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":{}}";
    using var response = await PostAsync(noMeta, Version, McpMethods.Ping, null);
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.InvalidParams, await ErrorCodeAsync(response));
  }

  /// <summary>§16.5: a <c>tools/call</c> with arguments that violate the input schema is invalid params — 400 / -32602.</summary>
  [Fact]
  public async Task Schema_violating_arguments_map_to_400_invalid_params()
  {
    var body = Body(McpMethods.ToolsCall, "add");
    body["params"]!["arguments"] = new JsonObject { ["a"] = "not-a-number", ["b"] = 1 };
    using var response = await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, "add");

    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.InvalidParams, await ErrorCodeAsync(response));
  }

  /// <summary>
  /// A theory over malformed bodies, asserting the §9.7 status/code pairs in one place. Each row posts a
  /// raw payload (with valid headers) and asserts the resulting HTTP status and JSON-RPC error code.
  /// </summary>
  [Theory]
  [InlineData("{ broken", 400, ErrorCodes.ParseError)]
  [InlineData("", 400, ErrorCodes.ParseError)]
  [InlineData("[]", 400, ErrorCodes.InvalidRequest)]
  [InlineData("[1,2,3]", 400, ErrorCodes.InvalidRequest)]
  [InlineData("\"hello\"", 400, ErrorCodes.InvalidRequest)]
  [InlineData("true", 400, ErrorCodes.InvalidRequest)]
  [InlineData("null", 400, ErrorCodes.InvalidRequest)]
  public async Task Malformed_bodies_map_to_the_expected_status_and_code(string raw, int expectedStatus, int expectedCode)
  {
    using var response = await PostAsync(raw, Version, McpMethods.Ping, null);
    Assert.Equal((HttpStatusCode)expectedStatus, response.StatusCode);
    Assert.Equal(expectedCode, await ErrorCodeAsync(response));
  }

  // ═════════════════════════ §9.2 — notification acceptance ═════════════════════════

  /// <summary>§9.2: a notification POST (no id) is accepted with 202.</summary>
  [Fact]
  public async Task Notification_post_is_accepted_with_202()
  {
    var note = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":1}}";
    using var response = await PostAsync(note, Version, "notifications/cancelled", null);
    Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
  }

  /// <summary>§9.2: the 202 acknowledgement carries an empty body.</summary>
  [Fact]
  public async Task Notification_acknowledgement_has_an_empty_body()
  {
    var note = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{\"progressToken\":\"x\",\"progress\":1}}";
    using var response = await PostAsync(note, Version, "notifications/progress", null);
    var body = await response.Content.ReadAsStringAsync();
    Assert.Equal(string.Empty, body);
  }

  /// <summary>§9.2: notifications are not subject to the routing-header gate — a bare notification POST is still 202.</summary>
  [Fact]
  public async Task Notification_post_ignores_the_routing_header_gate()
  {
    var note = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":7}}";
    using var response = await PostAsync(note, protocolVersion: null, mcpMethod: null, mcpName: null);
    Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
  }

  /// <summary>An unknown notification kind is still accepted (and ignored) with 202 (§3.4).</summary>
  [Fact]
  public async Task Unknown_notification_kind_is_still_accepted_with_202()
  {
    var note = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/something/unknown\",\"params\":{}}";
    using var response = await PostAsync(note, Version, "notifications/something/unknown", null);
    Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
  }

  // ═════════════════════════ §9.9 — stateless endpoint ═════════════════════════

  /// <summary>§9.9: a GET on the MCP endpoint is rejected with 405 (the server is Streamable-HTTP only).</summary>
  [Fact]
  public async Task Get_is_rejected_with_405()
  {
    using var response = await _raw.GetAsync(_endpoint);
    Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
  }

  /// <summary>§9.9: a DELETE on the endpoint is rejected with 405 (no session to terminate).</summary>
  [Fact]
  public async Task Delete_is_rejected_with_405()
  {
    using var request = new HttpRequestMessage(HttpMethod.Delete, _endpoint);
    using var response = await _raw.SendAsync(request);
    Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
  }

  /// <summary>§9.9: PUT and PATCH are likewise rejected with 405 — only POST is meaningful.</summary>
  [Theory]
  [InlineData("PUT")]
  [InlineData("PATCH")]
  public async Task Non_post_methods_are_rejected_with_405(string method)
  {
    using var request = new HttpRequestMessage(new HttpMethod(method), _endpoint);
    using var response = await _raw.SendAsync(request);
    Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
  }

  /// <summary>§9.9: a successful response carries no <c>Mcp-Session-Id</c> header — the server never mints a session.</summary>
  [Fact]
  public async Task Successful_response_carries_no_session_id_header()
  {
    using var response = await PostValidAsync(McpMethods.ToolsCall, "echo");
    Assert.False(response.Headers.Contains("Mcp-Session-Id"));
  }

  /// <summary>§9.9: a GET rejection likewise carries no session header.</summary>
  [Fact]
  public async Task Rejected_get_carries_no_session_id_header()
  {
    using var response = await _raw.GetAsync(_endpoint);
    Assert.False(response.Headers.Contains("Mcp-Session-Id"));
  }

  /// <summary>§9.9: an event-stream response carries no session header either.</summary>
  [Fact]
  public async Task Event_stream_carries_no_session_id_header()
  {
    using var response = await PostWithProgressTokenAsync("slow", new JsonObject { ["steps"] = 1 }, "p-sess");
    Assert.False(response.Headers.Contains("Mcp-Session-Id"));
  }

  // ═════════════════════════ §9.3.1/§9.3.2 — Content-Type & Accept gate (hardening) ═════════════════════════

  /// <summary>Posts an otherwise-valid <c>echo</c> call but overrides the body's <c>Content-Type</c> media type.</summary>
  private async Task<HttpResponseMessage> PostWithContentTypeAsync(string contentType)
  {
    var body = Body(McpMethods.ToolsCall, "echo");
    body["params"]!["arguments"] = new JsonObject { ["text"] = "x" };
    using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(body.ToJsonString(), Encoding.UTF8),
    };
    request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
    request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", Version);
    request.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.ToolsCall);
    request.Headers.TryAddWithoutValidation("Mcp-Name", "echo");
    return await _raw.SendAsync(request, HttpCompletionOption.ResponseContentRead);
  }

  /// <summary>§9.3.1: a POST whose <c>Content-Type</c> is not <c>application/json</c> is rejected 400/-32001.</summary>
  [Fact]
  public async Task Wrong_content_type_is_400_header_mismatch()
  {
    using var response = await PostWithContentTypeAsync("text/plain");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>§9.3.1: a <c>application/json; charset=utf-8</c> Content-Type is tolerated (the charset parameter is ignored).</summary>
  [Fact]
  public async Task Content_type_with_charset_is_accepted()
  {
    using var response = await PostWithContentTypeAsync("application/json; charset=utf-8");
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
  }

  /// <summary>§9.3.2: an <c>Accept</c> missing <c>text/event-stream</c> is rejected 400/-32001.</summary>
  [Fact]
  public async Task Accept_missing_event_stream_is_400_header_mismatch()
  {
    var body = Body(McpMethods.ToolsCall, "echo");
    body["params"]!["arguments"] = new JsonObject { ["text"] = "x" };
    using var response = await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, "echo", accept: "application/json");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>§9.3.2: an entirely absent <c>Accept</c> header is rejected 400/-32001.</summary>
  [Fact]
  public async Task Missing_accept_header_is_400_header_mismatch()
  {
    var body = Body(McpMethods.ToolsCall, "echo");
    body["params"]!["arguments"] = new JsonObject { ["text"] = "x" };
    using var response = await PostAsync(body.ToJsonString(), Version, McpMethods.ToolsCall, "echo", accept: "<none>");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  // ═════════════════════════ §9.3.3 — unsupported protocol version → -32004 ═════════════════════════

  /// <summary>
  /// §9.3.3 (R-9.3.3-e): a header naming a revision the server does not implement is rejected 400/-32004
  /// (UnsupportedProtocolVersion), distinct from the -32001 used for an absent/mismatched header. The
  /// body declares the same unsupported revision so the header/body match check passes first.
  /// </summary>
  [Fact]
  public async Task Unsupported_protocol_version_header_is_400_unsupported_version()
  {
    var unsupported = "1999-01-01";
    var body = Body(McpMethods.Ping);
    body["params"]!["_meta"]!["io.modelcontextprotocol/protocolVersion"] = unsupported;
    using var response = await PostAsync(body.ToJsonString(), unsupported, McpMethods.Ping, null);

    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.UnsupportedProtocolVersion, await ErrorCodeAsync(response));
    var obj = await ReadJsonAsync(response);
    Assert.Equal(unsupported, obj["error"]!["data"]!["requested"]!.GetValue<string>());
    Assert.Contains(ProtocolRevision.Current, obj["error"]!["data"]!["supported"]!.AsArray().Select(n => n!.GetValue<string>()));
  }

  // ═════════════════════════ §9.4.2 — Mcp-Name MUST NOT appear for non-targeted methods ═════════════════════════

  /// <summary>R-9.4.2-e: sending <c>Mcp-Name</c> on a method that defines none (here <c>ping</c>) is rejected 400/-32001.</summary>
  [Fact]
  public async Task Mcp_name_on_method_without_name_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.Ping).ToJsonString(), Version, McpMethods.Ping, mcpName: "unexpected");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  /// <summary>R-9.4.2-e: <c>tools/list</c> with a stray <c>Mcp-Name</c> is likewise rejected 400/-32001.</summary>
  [Fact]
  public async Task Mcp_name_on_tools_list_is_400_header_mismatch()
  {
    using var response = await PostAsync(Body(McpMethods.ToolsList).ToJsonString(), Version, McpMethods.ToolsList, mcpName: "x");
    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    Assert.Equal(ErrorCodes.HeaderMismatch, await ErrorCodeAsync(response));
  }

  // ═════════════════════════ §9.11 — Origin / DNS-rebind defense ═════════════════════════

  /// <summary>Posts an otherwise-valid <c>ping</c> with an explicit <c>Origin</c> header.</summary>
  private async Task<HttpResponseMessage> PostWithOriginAsync(string origin)
  {
    using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(Body(McpMethods.Ping).ToJsonString(), Encoding.UTF8, "application/json"),
    };
    request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", Version);
    request.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.Ping);
    request.Headers.TryAddWithoutValidation("Origin", origin);
    return await _raw.SendAsync(request, HttpCompletionOption.ResponseContentRead);
  }

  /// <summary>
  /// §9.11 (R-9.11-a/b/c): a non-loopback <c>Origin</c> is rejected with 403, and the body carries an
  /// id-less JSON-RPC error — the request id is never echoed for a rebinding-defended rejection.
  /// </summary>
  [Fact]
  public async Task Disallowed_origin_is_403_with_idless_body()
  {
    using var response = await PostWithOriginAsync("https://evil.example");
    Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

    var obj = await ReadJsonAsync(response);
    Assert.False(obj.ContainsKey("id"));
    Assert.Equal("2.0", obj["jsonrpc"]!.GetValue<string>());
    Assert.Equal(ErrorCodes.InvalidRequest, obj["error"]!["code"]!.GetValue<int>());
  }

  /// <summary>§9.11: a loopback <c>Origin</c> is accepted (the loopback-safe default).</summary>
  [Theory]
  [InlineData("http://localhost")]
  [InlineData("http://localhost:3000")]
  [InlineData("http://127.0.0.1:8080")]
  [InlineData("https://localhost")]
  public async Task Loopback_origin_is_accepted(string origin)
  {
    using var response = await PostWithOriginAsync(origin);
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
  }

  // ═════════════════════════ §9.9 — Last-Event-ID is ignored ═════════════════════════

  /// <summary>§9.9/§9.6.2 (R-9.9-g, R-9.6.2-h): a client-supplied <c>Last-Event-ID</c> is ignored; the request still succeeds normally.</summary>
  [Fact]
  public async Task Last_event_id_header_is_ignored()
  {
    var body = Body(McpMethods.ToolsCall, "echo");
    body["params"]!["arguments"] = new JsonObject { ["text"] = "still-works" };
    using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
    };
    request.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", Version);
    request.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.ToolsCall);
    request.Headers.TryAddWithoutValidation("Mcp-Name", "echo");
    request.Headers.TryAddWithoutValidation("Last-Event-ID", "42");

    using var response = await _raw.SendAsync(request, HttpCompletionOption.ResponseContentRead);
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var obj = await ReadJsonAsync(response);
    Assert.Equal("still-works", obj["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  // ═════════════════════════ Round-trip via StreamableHttpClientTransport ═════════════════════════

  /// <summary>Discovery over the transport negotiates the current revision and caches server identity (§5).</summary>
  [Fact]
  public async Task Client_discovers_and_negotiates_the_current_revision()
  {
    await using var client = Connect();
    var discovered = await client.DiscoverAsync();
    Assert.Equal(ProtocolRevision.Current, client.NegotiatedVersion);
    Assert.Equal("conformance-server", discovered.ServerInfo.Name);
  }

  /// <summary>A client lists the registered tools (§16.2).</summary>
  [Fact]
  public async Task Client_lists_the_registered_tools()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var tools = await client.ListToolsAsync();
    var names = tools.Tools.Select(t => t.Name).ToHashSet();
    Assert.Equal(new HashSet<string> { "echo", "add", "slow", "logger", "cancel_me" }, names);
  }

  /// <summary>A client round-trips the <c>echo</c> tool over the single-JSON shape (§9.6.1).</summary>
  [Fact]
  public async Task Client_round_trips_echo_over_single_json()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var result = await client.CallToolAsync("echo", Obj("""{"text":"round-trip"}"""));
    Assert.Equal("round-trip", result["content"]![0]!["text"]!.GetValue<string>());
  }

  /// <summary>A client round-trips the numeric <c>add</c> tool and reads the computed value.</summary>
  [Fact]
  public async Task Client_round_trips_add()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var result = await client.CallToolAsync("add", Obj("""{"a":40,"b":2}"""));
    Assert.Equal("42", result["content"]![0]!["text"]!.GetValue<string>());
  }

  /// <summary>§9.6.2/§15.1: progress streamed by the slow tool is delivered to <c>OnNotification</c> in order.</summary>
  [Fact]
  public async Task Client_receives_streamed_progress_on_notification_callback()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var progress = new List<JsonRpcNotification>();
    var result = await client.CallToolAsync("slow", Obj("""{"steps":6}"""), new RequestOptions
    {
      ProgressToken = "stream-1",
      OnNotification = n => { lock (progress) progress.Add(n); },
    });

    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal(6, progress.Count(n => n.Method == McpMethods.NotificationsProgress));
  }

  /// <summary>The progress callback sees strictly increasing cumulative values that reach the total (§15.1.3).</summary>
  [Fact]
  public async Task Client_progress_values_increase_to_total()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var values = new List<double>();
    await client.CallToolAsync("slow", Obj("""{"steps":4}"""), new RequestOptions
    {
      ProgressToken = "stream-2",
      OnNotification = n =>
      {
        if (n.Method == McpMethods.NotificationsProgress)
        {
          lock (values) values.Add(n.Params!["progress"]!.GetValue<double>());
        }
      },
    });

    Assert.Equal(new[] { 1d, 2d, 3d, 4d }, values);
  }

  /// <summary>A logging tool's buffered notification is also delivered to the client's callback (§15.3).</summary>
  [Fact]
  public async Task Client_receives_buffered_log_notification()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var seen = new List<JsonRpcNotification>();
    // §15.3.3: opt in to logs for this request via _meta, else the server emits no notifications/message.
    await client.CallToolAsync("logger", null, new RequestOptions { OnNotification = n => seen.Add(n), Meta = LogOptIn() });

    Assert.Contains(seen, n => n.Method == McpMethods.NotificationsMessage);
  }

  /// <summary>§9.7: a call to an unknown tool surfaces as <see cref="McpError"/> with code -32602.</summary>
  [Fact]
  public async Task Client_unknown_tool_throws_invalid_params()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("nope"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  /// <summary>§9.7: a request for an unknown method surfaces as <see cref="McpError"/> with code -32601.</summary>
  [Fact]
  public async Task Client_unknown_method_throws_method_not_found()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.RequestAsync("does/not/exist"));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  /// <summary>§16.5: schema-violating arguments surface as <see cref="McpError"/> with code -32602.</summary>
  [Fact]
  public async Task Client_schema_violation_throws_invalid_params()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("add", Obj("""{"a":"x"}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  /// <summary>A client ping completes without error over HTTP.</summary>
  [Fact]
  public async Task Client_ping_completes()
  {
    await using var client = Connect();
    await client.DiscoverAsync();
    await client.PingAsync(); // throws on failure
  }

  /// <summary>The transport taps every inbound frame, so a discovery + call yields multiple received frames.</summary>
  [Fact]
  public async Task Transport_receive_tap_observes_frames()
  {
    var transport = new StreamableHttpClientTransport(new Uri(_endpoint));
    var received = 0;
    transport.OnReceive = _ => Interlocked.Increment(ref received);

    await using var client = new McpClient(transport, new Implementation { Name = "tap-client", Version = "1.0.0" });
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", Obj("""{"text":"tap"}"""));

    Assert.True(received >= 2);
  }

  /// <summary>Two sequential calls on the same transport keep their ids correlated (§4.4 statelessness).</summary>
  [Fact]
  public async Task Sequential_calls_remain_correlated()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var first = await client.CallToolAsync("echo", Obj("""{"text":"one"}"""));
    var second = await client.CallToolAsync("echo", Obj("""{"text":"two"}"""));

    Assert.Equal("one", first["content"]![0]!["text"]!.GetValue<string>());
    Assert.Equal("two", second["content"]![0]!["text"]!.GetValue<string>());
  }

  /// <summary>Concurrent calls on a shared transport each receive their own correct answer (§4.4).</summary>
  [Fact]
  public async Task Concurrent_calls_each_get_their_own_answer()
  {
    await using var client = Connect();
    await client.DiscoverAsync();

    var tasks = Enumerable.Range(0, 8)
      .Select(i => client.CallToolAsync("add", new JsonObject { ["a"] = i, ["b"] = 100 }))
      .ToArray();
    var results = await Task.WhenAll(tasks);

    for (var i = 0; i < results.Length; i++)
    {
      Assert.Equal((i + 100).ToString(CultureInfo.InvariantCulture), results[i]["content"]![0]!["text"]!.GetValue<string>());
    }
  }
}
