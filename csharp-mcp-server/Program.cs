// Placeholder C# MCP server (.NET 10 Minimal API).
//
// This is intentionally NOT a real MCP implementation. It exists to demonstrate that
// selecting "C#" in the companion frontend wires up a *different stack of servers* —
// this reference server plus its client host (csharp-mcp-client) — on its own ports.
//
// A real implementation would speak MCP's stateless Streamable HTTP (protocol
// 2026-07-28) on /mcp, mirroring the TypeScript reference server (ts-mcp-server).

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Liveness probe — also how csharp-mcp-client proves this server is reachable.
app.MapGet("/health", () => Results.Json(new
{
  status = "ok",
  name = "csharp-mcp-server (placeholder)",
  language = "csharp",
  framework = "minimal-api",
  protocol = "2026-07-28",
  transport = "streamable-http",
}));

// Placeholder MCP endpoint (all HTTP methods). A real server would handle JSON-RPC here.
app.Map("/mcp", () => Results.Json(new
{
  placeholder = true,
  language = "csharp",
  message = "csharp-mcp-server is a placeholder. A real implementation would speak MCP "
    + "stateless Streamable HTTP (2026-07-28) here, like ts-mcp-server.",
}));

// Port is owned by the root Taskfile; this default matches it for standalone runs.
var port = Environment.GetEnvironmentVariable("CSHARP_MCP_SERVER_PORT") ?? "8201";
app.Run($"http://localhost:{port}");
