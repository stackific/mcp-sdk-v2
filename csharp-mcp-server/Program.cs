// The C# reference MCP server, built on the Stackific.Mcp SDK and served over stateless Streamable
// HTTP (protocol 2026-07-28) on /mcp — the C# counterpart of ts-mcp-server. The MCP dispatcher, tool
// context, and Streamable HTTP adapter all live in the SDK; this entry point only registers features
// (Features.cs) and binds them to an endpoint.

using CSharpMcpServer;

using Stackific.Mcp.Transport;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Liveness probe — also how csharp-mcp-client proves this server is reachable.
app.MapGet("/health", () => Results.Json(new
{
  status = "ok",
  name = "companion-mcp-server (C#)",
  language = "csharp",
  protocol = "2026-07-28",
  transport = "streamable-http",
}));

// The MCP endpoint: the SDK adapter parses, validates headers, dispatches, and streams (§9).
app.MapMcp("/mcp", Features.Build());

// OAuth 2.1 Authorization Server + a protected MCP resource (whoami / get_secret), on its own port —
// the C# counterpart of ts-mcp-server's AUTH server. Runs alongside the main MCP server (§23).
var authPort = Environment.GetEnvironmentVariable("CSHARP_AUTH_SERVER_PORT") ?? "8203";
var issuer = Environment.GetEnvironmentVariable("CSHARP_AUTH_ISSUER") ?? $"http://localhost:{authPort}";
_ = Auth.BuildAuthServer(issuer).RunAsync($"http://localhost:{authPort}");

// Port is owned by the root Taskfile; this default matches it for standalone runs.
var port = Environment.GetEnvironmentVariable("CSHARP_MCP_SERVER_PORT") ?? "8201";
app.Run($"http://localhost:{port}");
