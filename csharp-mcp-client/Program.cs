// The C# MCP client host: the backend the shared companion frontend talks to when "C#" is selected.
// It hosts an MCP client (Stackific.Mcp SDK) connected to csharp-mcp-server over Streamable HTTP, taps
// every JSON-RPC frame to /debug/stream, and exposes the REST surface the SPA drives. The C#
// counterpart of ts-mcp-client. Connection + discovery + the multi-round-trip client features all live
// in the SDK; this entry point wires HTTP routes to the client host (ClientHost.cs).

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

using CSharpMcpClient;

var builder = WebApplication.CreateBuilder(args);

// The frontend (port 8000) is a different origin, so allow cross-origin requests.
builder.Services.AddCors(options =>
  options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

// Pooled HttpClient instances for the outbound DeepSeek sampling calls and the transport probe.
builder.Services.AddHttpClient();

// Match the SDK's wire conventions: camelCase, omit nulls (so capability presence is preserved).
builder.Services.ConfigureHttpJsonOptions(options =>
{
  options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
  options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// Endpoints: prefer the C#-specific overrides, then fall back to the shared TS-app env names (so a
// single .env drives both stacks), then the built-in defaults.
var serverUrl = (Env("CSHARP_MCP_SERVER_URL", "MCP_SERVER_URL") ?? "http://localhost:8201").TrimEnd('/');
if (!serverUrl.EndsWith("/mcp", StringComparison.Ordinal)) serverUrl += "/mcp";

var authServerUrl = (Env("CSHARP_AUTH_SERVER_URL", "AUTH_SERVER_URL") ?? "http://localhost:8203").TrimEnd('/');
var frontendUrl = Environment.GetEnvironmentVariable("FRONTEND_URL") ?? "http://localhost:8000";

// Sampling (DeepSeek via its Anthropic-compatible endpoint) — same env contract as ts-mcp-client.
var deepSeekKey = Environment.GetEnvironmentVariable("DEEPSEEK_API_KEY") ?? "";
var deepSeekBaseUrl = Environment.GetEnvironmentVariable("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com/anthropic";
var deepSeekModel = Environment.GetEnvironmentVariable("DEEPSEEK_MODEL") ?? "deepseek-chat";

// Register the client host (and its sampling provider) as singletons so the minimal-API handlers and
// the SSE relay all share one connected client and one wire-debug bus.
builder.Services.AddSingleton(provider => new SamplingProvider(
  provider.GetRequiredService<IHttpClientFactory>(), deepSeekKey, deepSeekBaseUrl, deepSeekModel));
builder.Services.AddSingleton(provider => new ClientHost(serverUrl, provider.GetRequiredService<SamplingProvider>()));

var app = builder.Build();
app.UseCors();

var host = app.Services.GetRequiredService<ClientHost>();

// ── Diagnostics ──
app.MapGet("/health", () => Results.Json(new { status = "ok", language = "csharp", sampling = host.SamplingProvider }));
app.MapGet("/info", () => Results.Json(new
{
  name = "companion-mcp-client (C#)",
  language = "csharp",
  sampling = host.SamplingInfo,
  serverUrl = host.ServerUrl,
  status = host.Status(),
}));

// ── Status / connection ──
app.MapGet("/api/status", () => Results.Json(host.Status()));
app.MapPost("/api/connect", () => Run(async () => { await host.ReconnectAsync(); return host.Status(); }));
app.MapGet("/api/discover", () => Run(() => host.WithTraceAsync("discover", async client =>
{
  var discover = await client.DiscoverAsync();
  return (object?)new { discoverResult = ToNode(discover), status = host.Status() };
})));

// ── Tools ──
app.MapGet("/api/tools", () => Run(() => host.WithTraceAsync<object?>("tools/list", c => Box(c.ListToolsAsync()))));
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
app.MapPost("/api/tools/call-cancellable", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  var cancelId = body["cancelId"]!.GetValue<string>();
  var cts = host.RegisterCancellable(cancelId);
  try
  {
    return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args, new RequestOptions
    {
      ProgressToken = cancelId,
      CancellationToken = cts.Token,
    })));
  }
  finally { host.ReleaseCancellable(cancelId); }
}));
app.MapPost("/api/cancel", (JsonObject body) => Results.Json(new { ok = host.Cancel(body["cancelId"]!.GetValue<string>()) }));
app.MapPost("/api/tools/call-traced", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  var meta = body["_meta"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args, new RequestOptions { Meta = meta })));
}));

// ── Subscriptions (open a subscriptions/listen stream; returns the honored filter) ──
app.MapPost("/api/subscribe", (JsonObject body) => Run(async () => (object?)await host.SubscribeAsync(body)));

// ── Authorization: run the full OAuth 2.1 + PKCE handshake against the protected MCP resource ──
app.MapPost("/api/authorize/run", () => Run(async () => (object?)await AuthFlow.RunAsync(host, authServerUrl, frontendUrl)));

// ── Generic JSON-RPC passthrough (ping, tasks/cancel, …) ──
app.MapPost("/api/raw", (JsonObject body) => Run(async () =>
{
  var method = body["method"]!.GetValue<string>();
  var prms = body["params"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>(method, c => Box(c.RequestAsync(method, prms)));
}));

// ── Tasks extension (augmented tools/call → poll status → fetch result) ──
app.MapPost("/api/tasks/create", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tasks/create:{name}", c => Box(c.CreateTaskAsync(name, args)));
}));
app.MapPost("/api/tasks/get", (JsonObject body) => Run(async () =>
  await host.WithTraceAsync<object?>("tasks/get", c => Box(c.GetTaskAsync(body["taskId"]!.GetValue<string>())))));

// ── Completion ──
app.MapPost("/api/complete", (JsonObject body) => Run(async () =>
{
  var prms = new JsonObject { ["ref"] = body["ref"]?.DeepClone(), ["argument"] = body["argument"]?.DeepClone() };
  if (body["context"] is { } context) prms["context"] = context.DeepClone();
  return await host.WithTraceAsync<object?>("completion/complete", c => Box(c.RequestAsync(McpMethods.CompletionComplete, prms)));
}));

// ── Resources / prompts ──
app.MapGet("/api/resources", () => Run(() => host.WithTraceAsync<object?>("resources/list", c => Box(c.ListResourcesAsync()))));
app.MapGet("/api/resource-templates", () => Run(() => host.WithTraceAsync<object?>("resources/templates/list", c => Box(c.ListResourceTemplatesAsync()))));
app.MapPost("/api/resources/read", (JsonObject body) => Run(async () =>
  await host.WithTraceAsync<object?>("resources/read", c => Box(c.ReadResourceAsync(body["uri"]!.GetValue<string>())))));
app.MapGet("/api/prompts", () => Run(() => host.WithTraceAsync<object?>("prompts/list", c => Box(c.ListPromptsAsync()))));
app.MapPost("/api/prompts/get", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = new Dictionary<string, string>();
  if (body["arguments"] is JsonObject a)
  {
    foreach (var (k, v) in a) if (v is not null) args[k] = v.GetValue<string>();
  }
  return await host.WithTraceAsync<object?>($"prompts/get:{name}", c => Box(c.GetPromptAsync(name, args)));
}));

// ── Roots ──
app.MapGet("/api/roots", () => Results.Json(new { roots = host.GetRoots() }));
app.MapPost("/api/roots", (JsonObject body) =>
{
  var roots = (body["roots"] as JsonArray ?? [])
    .OfType<JsonObject>()
    .Select(r => new RootEntry(r["uri"]!.GetValue<string>(), r["name"]?.GetValue<string>()))
    .ToList();
  host.SetRoots(roots);
  return Results.Json(new { roots = host.GetRoots() });
});

// ── Elicitation bridge ──
app.MapGet("/api/elicitation/pending", () => Results.Json(new { pending = host.ListPending() }));
app.MapPost("/api/elicitation/{id}/resolve", (string id, JsonObject body) =>
{
  var action = Enum.Parse<ElicitationAction>(body["action"]!.GetValue<string>(), ignoreCase: true);
  var result = new ElicitResult { Action = action, Content = body["content"] as JsonObject };
  return Results.Json(new { ok = host.ResolveElicitation(id, result) });
});

// ── Transport probe: a raw Streamable HTTP handshake POST exposing the actual request/response
// headers + status mapping (the C# counterpart of ts-mcp-client's transport.ts). The TS reference
// POSTs `initialize`; the Stackific.Mcp server's modern entry point is `server/discover` carrying the
// required `_meta` envelope (§4.3) and the `Mcp-Method` routing header (§9.4.1), so a faithful,
// *successful* handshake round-trip against this server uses those conventions. ──
app.MapGet("/api/transport/probe", (IHttpClientFactory httpClientFactory) => Run(async () =>
{
  var requestHeaders = new JsonObject
  {
    ["content-type"] = "application/json",
    ["accept"] = "application/json, text/event-stream",
    ["MCP-Protocol-Version"] = ProtocolRevision.Current,
  };
  var probeBody = new JsonObject
  {
    ["jsonrpc"] = "2.0",
    ["id"] = 1,
    ["method"] = McpMethods.Discover,
    ["params"] = new JsonObject
    {
      ["_meta"] = new JsonObject
      {
        ["io.modelcontextprotocol/protocolVersion"] = ProtocolRevision.Current,
        ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "transport-probe", ["version"] = "0" },
        ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
      },
    },
  };
  var probe = new HttpRequestMessage(HttpMethod.Post, host.ServerUrl)
  {
    Content = new StringContent(probeBody.ToJsonString(), Encoding.UTF8, "application/json"),
  };
  probe.Headers.Accept.ParseAdd("application/json");
  probe.Headers.Accept.ParseAdd("text/event-stream");
  probe.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
  probe.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.Discover);

  var http = httpClientFactory.CreateClient();
  using var response = await http.SendAsync(probe);
  var responseHeaders = new JsonObject();
  foreach (var header in response.Headers) responseHeaders[header.Key] = string.Join(", ", header.Value);
  foreach (var header in response.Content.Headers) responseHeaders[header.Key] = string.Join(", ", header.Value);
  // Drain the body so the socket frees; we only need headers/status here.
  await response.Content.ReadAsStringAsync();

  return (object?)new
  {
    url = host.ServerUrl,
    method = "POST",
    requestHeaders,
    status = (int)response.StatusCode,
    statusText = response.ReasonPhrase,
    contentType = response.Content.Headers.ContentType?.MediaType,
    // Stateless server: no Mcp-Session-Id is minted (§9.9); surface it if a server ever does.
    sessionId = response.Headers.TryGetValues("Mcp-Session-Id", out var sid) ? string.Join(", ", sid) : null,
    negotiatedVersion = response.Headers.TryGetValues("Mcp-Protocol-Version", out var ver) ? string.Join(", ", ver) : ProtocolRevision.Current,
    responseHeaders,
  };
}));

// ── Live wire-debug stream ──
app.MapGet("/debug/stream", async (HttpContext ctx) =>
{
  ctx.Response.Headers.CacheControl = "no-cache";
  ctx.Response.ContentType = "text/event-stream";
  ctx.Response.Headers["X-Accel-Buffering"] = "no";

  await SendEventAsync(ctx, "status", host.Status());
  var reader = host.Bus.Subscribe(out var unsubscribe);
  try
  {
    while (!ctx.RequestAborted.IsCancellationRequested)
    {
      var read = reader.ReadAsync(ctx.RequestAborted).AsTask();
      var done = await Task.WhenAny(read, Task.Delay(15000, ctx.RequestAborted));
      if (done == read) await SendEventAsync(ctx, "frame", await read);
      else await SendEventAsync(ctx, "ping", new { });
    }
  }
  catch (OperationCanceledException) { /* client disconnected */ }
  finally { unsubscribe.Dispose(); }
});

// ── Catch-all for capabilities still being wired onto the C# SDK (tasks, subscriptions, authorization). ──
// Literal routes above always win over this; it degrades gracefully like the frontend expects.
app.MapMethods("/api/{**path}", ["GET", "POST"], (string path) => Results.Json(new
{
  ok = false,
  error = new { message = $"'/api/{path}' is being implemented on the C# SDK — available now in the TypeScript stack." },
}));

var port = Environment.GetEnvironmentVariable("CSHARP_MCP_CLIENT_PORT") ?? "8202";
app.Run($"http://localhost:{port}");

// ───────────────────────── REST plumbing ─────────────────────────

// Shapes an MCP action's outcome as { ok, result } / { ok, error } so the SPA can tell a protocol
// error (a thrown JSON-RPC error) from a tool error (a result with isError).
static async Task<IResult> Run(Func<Task<object?>> action)
{
  try
  {
    return Results.Json(new { ok = true, result = await action() });
  }
  catch (McpError error)
  {
    return Results.Json(new { ok = false, error = new { message = error.Message, code = (object?)error.Code, data = error.ErrorData } });
  }
  catch (Exception error)
  {
    return Results.Json(new { ok = false, error = new { message = error.Message } });
  }
}

// Boxes a typed Task<T> result as Task<object?> for the uniform Run pipeline.
static async Task<object?> Box<T>(Task<T> task) => await task;

// Reads the first non-empty environment variable among the given names (C# override first, then the
// shared TS-app name), or null when none is set — so one .env can drive both the C# and TS stacks.
static string? Env(params string[] names)
{
  foreach (var name in names)
  {
    var value = Environment.GetEnvironmentVariable(name);
    if (!string.IsNullOrEmpty(value)) return value;
  }
  return null;
}

static JsonNode? ToNode<T>(T value) => JsonSerializer.SerializeToNode(value, McpJson.Options);

static async Task SendEventAsync(HttpContext ctx, string eventName, object data)
{
  await ctx.Response.WriteAsync($"event: {eventName}\ndata: {JsonSerializer.Serialize(data, McpJson.Options)}\n\n");
  await ctx.Response.Body.FlushAsync();
}
