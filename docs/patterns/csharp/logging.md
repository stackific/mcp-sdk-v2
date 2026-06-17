# Logging

**Part III · Interaction & utilities** · Book Ch 29 · Stories S23 · sidebar `/logging`

A tool emits diagnostics through `ctx.LogAsync(level, message)`, which the SDK turns into out-of-band
`notifications/message` frames on the request's response stream — `level`, `logger`, and `data`
arrive in real time, before the final result. (Logging is deprecated in the RC; a client opts in
per-request via the `io.modelcontextprotocol/logLevel` `_meta` key — there is no `logging/setLevel`
RPC.) This pattern traces a `count_with_logs` call from the demo to the server and back.

## Round-trip

```
demo (LoggingPage)  ──POST /api/tools/call──▶  client host (Minimal API)
      ▲                                              │ c.CallToolWithInputAsync('count_with_logs', args)
      │                                              ▼
  ApiResultView                            Stackific.Mcp.Client  McpClient
      │                                              │ tools/call (JSON-RPC)
      └── notifications/message ◀── Streamable HTTP ─┴──▶ MCP server (count_with_logs)
                                                          ctx.LogAsync(LoggingLevel.Info, …) per tick
```

## 1 · Frontend — `demo/src/routes/logging.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page calls the tool with a plain `backend.callTool` — the log frames arrive separately on the
debug wire stream, filtered to `notifications/message`:

```tsx
// demo/src/routes/logging.tsx
<Button
  onClick={() =>
    call.run(() => backend.callTool('count_with_logs', { count: 6, intervalMs: 300 }))
  }
  disabled={call.loading}
  data-testid="run-logging"
>
  Emit log notifications
</Button>
```

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The route delegates to the SDK `McpClient`; nothing logging-specific happens here — the host simply
taps every inbound frame (including `notifications/message`) and relays it to the SPA's wire panel:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
```

The tap is wired onto the transport when the client connects; `OnReceive` mirrors every inbound
frame to the debug bus:

```csharp
// csharp-mcp-client/ClientHost.cs
var transport = new StreamableHttpClientTransport(new Uri(_serverUrl))
{
  OnSend = node => Tap("send", node),
  OnReceive = node => Tap("recv", node),
};
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`count_with_logs` calls `ctx.LogAsync(LoggingLevel.Info, ...)` once per tick. The SDK serializes each
into a `notifications/message` frame on the response stream, then resolves with the final text:

```csharp
// csharp-mcp-server/Features.cs
async ctx =>
{
  var count = ctx.GetInt("count", 5);
  var intervalMs = ctx.GetInt("intervalMs", 500);
  for (var i = 1; i <= count; i++)
  {
    await ctx.LogAsync(LoggingLevel.Info, $"tick {i}/{count} at {DateTimeOffset.UtcNow:O}");
    await Task.Delay((int)intervalMs, ctx.Signal);
  }
  return CallToolResult.FromText($"Done. Sent {count} log notifications.");
}
```

`LogAsync` enforces the per-request opt-in itself: when the originating request carried no
`io.modelcontextprotocol/logLevel` key it is a silent no-op, and it also drops messages below either
the opted-in level or the legacy server-wide floor — so a message must clear both to be sent.

## On the wire

1. `tools/call` → starts the tool.
2. `notifications/message` × N → `{ level: 'info', logger?, data: 'tick i/count at …' }`, one per
   tick, interleaved with the still-pending response.
3. result → `{ content: [{ type: 'text', text: 'Done. Sent N log notifications.' }] }`.

These are the same out-of-band [Notifications](./notifications.md) primitive, just carrying log
data. The same tool drives [Progress & Cancel](./progress.md) where `slow_count` pairs `ctx.LogAsync`
with `ctx.ReportProgressAsync(...)`.
