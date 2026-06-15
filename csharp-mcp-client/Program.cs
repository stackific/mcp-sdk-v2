// Placeholder C# MCP client host (.NET 10 Minimal API).
//
// This mirrors the *shape* of the TypeScript client host (ts-mcp-client): it is the
// backend the shared companion frontend talks to when "C#" is selected. It serves the
// same REST + Server-Sent-Events surface the SPA expects, but it does NOT host a real
// MCP client — every capability call returns a friendly "not implemented in the
// placeholder" response. Its only job is to demonstrate that the language switch
// repoints the frontend at a different backend + server configuration.
//
// A real implementation would host an MCP client connected to csharp-mcp-server over
// Streamable HTTP and stream live JSON-RPC frames on /debug/stream.

using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// The frontend is served from a different origin (port 8000), so allow cross-origin
// requests + the JSON content-type preflight.
builder.Services.AddCors(options =>
  options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
app.UseCors();

// Ports + the server URL are owned by the root Taskfile; these defaults match it so
// the app also runs standalone.
var serverBase = (Environment.GetEnvironmentVariable("CSHARP_MCP_SERVER_URL")
  ?? "http://localhost:8201").TrimEnd('/');
var mcpEndpoint = $"{serverBase}/mcp";

// BackendStatus shape the frontend renders (see frontend/src/lib/api.ts).
object StatusPayload() => new
{
  connected = true,
  negotiatedVersion = "2026-07-28",
  serverInfo = new { name = "csharp-mcp-server (placeholder)", version = "0.1.0" },
  serverCapabilities = new { },
  roots = Array.Empty<object>(),
  serverUrl = mcpEndpoint,
};

app.MapGet("/health", () => Results.Json(new { status = "ok", language = "csharp", framework = "minimal-api" }));

app.MapGet("/info", () => Results.Json(new
{
  name = "csharp-mcp-client (placeholder)",
  language = "csharp",
  serverUrl = mcpEndpoint,
  status = StatusPayload(),
}));

app.MapGet("/api/status", () => Results.Json(StatusPayload()));

app.MapPost("/api/connect", () => Results.Json(new { ok = true, result = StatusPayload() }));

// Best-effort GET of csharp-mcp-server's /health — shows the client→server wiring.
app.MapGet("/api/discover", async () =>
{
  object server;
  try
  {
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(1.5) };
    var body = await http.GetStringAsync($"{serverBase}/health");
    server = new { reachable = true, health = JsonSerializer.Deserialize<JsonElement>(body) };
  }
  catch (Exception ex)
  {
    server = new { reachable = false, error = ex.Message, url = $"{serverBase}/health" };
  }

  return Results.Json(new
  {
    ok = true,
    result = new
    {
      placeholder = true,
      language = "csharp",
      stack = new { client = "csharp-mcp-client (Minimal API)", server = "csharp-mcp-server (Minimal API)" },
      serverUrl = mcpEndpoint,
      server,
      note = "Placeholder discover. A real csharp-mcp-client would run server/discover "
        + "against csharp-mcp-server and return its identity + capabilities.",
    },
  });
});

// SSE relay matching the TS backend, so the frontend's wire panel stays happy.
app.MapGet("/debug/stream", async (HttpContext ctx) =>
{
  ctx.Response.Headers.CacheControl = "no-cache";
  ctx.Response.ContentType = "text/event-stream";

  async Task Send(string ev, object data)
  {
    await ctx.Response.WriteAsync($"event: {ev}\ndata: {JsonSerializer.Serialize(data)}\n\n");
    await ctx.Response.Body.FlushAsync();
  }

  await Send("status", StatusPayload());
  await Send("frame", new
  {
    seq = 1,
    ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
    dir = "local",
    kind = "note",
    summary = "C# placeholder stack — no live MCP wire. Switch to TypeScript for the full "
      + "under-the-hood experience.",
  });

  try
  {
    while (!ctx.RequestAborted.IsCancellationRequested)
    {
      await Task.Delay(15000, ctx.RequestAborted);
      await Send("ping", new { });
    }
  }
  catch (TaskCanceledException)
  {
    // client disconnected — end the stream
  }
});

// Catch-all for every capability the placeholder doesn't implement. ASP.NET Core route
// precedence means the literal routes above always win over this {**path} catch-all.
app.MapMethods("/api/{**path}", new[] { "GET", "POST" }, (string path) => Results.Json(new
{
  ok = false,
  error = new
  {
    message = $"'/api/{path}' isn't implemented in the C# placeholder stack — "
      + "switch to TypeScript for the full experience.",
  },
}));

var port = Environment.GetEnvironmentVariable("CSHARP_MCP_CLIENT_PORT") ?? "8202";
app.Run($"http://localhost:{port}");
