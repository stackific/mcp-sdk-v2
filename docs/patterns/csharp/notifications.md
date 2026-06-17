# Notifications

**Part III · Interaction & utilities** · Book Ch 24 · Stories S16 · sidebar `/notifications`

Notifications are one-way messages — no `id`, no reply. A tool can emit them **on this request's own
response stream** while it runs, so the caller sees each frame arrive in real time, before the final
result. The demo's notifications page drives `count_with_logs`, which streams one
`notifications/message` per tick; the same in-band mechanism carries `*_changed` and
`resources/updated` frames (see the server section). This pattern traces those frames from the demo
to the server and back.

## Round-trip

```
demo (NotificationsPage)  ──POST /api/tools/call──▶  client host (Minimal API)
      ▲                                                  │ c.CallToolWithInputAsync('count_with_logs', args)
      │                                                  ▼
  ApiResultView                            Stackific.Mcp.Client  McpClient
      │                                                  │ tools/call (JSON-RPC)
      └── notifications/message ◀── Streamable HTTP ─────┴──▶ MCP server (count_with_logs)
          (in-band, before the result)                       ctx.LogAsync(…) per tick; or, in
                                                              mutate_catalog, ctx.NotifyAsync(listChanged)…
```

## 1 · Frontend — `demo/src/routes/notifications.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page calls the tool with a plain `backend.callTool`; the wire panel is filtered to every
`notifications/*` frame, which stream in ahead of the result:

```tsx
// demo/src/routes/notifications.tsx
<Button
  onClick={() =>
    call.run(() => backend.callTool('count_with_logs', { count: 5, intervalMs: 400 }))
  }
  disabled={call.loading}
  data-testid="run-notifications"
>
  Start (5 ticks)
</Button>
```

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The route hands off to the SDK `McpClient`; the host's transport tap relays each inbound notification
frame to the SPA's wire stream as it arrives:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
```

```csharp
// csharp-mcp-client/ClientHost.cs
// Tap INCOMING frames (interim notifications, server→client requests, responses).
OnReceive = node => Tap("recv", node),
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`count_with_logs` emits one notification per tick via `ctx.LogAsync`, then resolves — proving the
frames ride the response stream ahead of the result:

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

The catalog-change notifications use the same in-band stream, emitted by the `mutate_catalog` tool
through `ctx.NotifyAsync(...)` — so a caller without a subscription still receives them. Where the
TypeScript server has dedicated `ctx.sendToolListChanged()` / `ctx.sendResourceUpdated(...)` helpers,
the C# SDK exposes the single `ctx.NotifyAsync(JsonRpcNotification)` sink, with the method names
taken from `McpMethods`:

```csharp
// csharp-mcp-server/Features.cs
// …and emit the same four on this request's own stream so the Notifications view (no
// subscription) sees them, mirroring ts-mcp-server's send{Tool,Prompt,Resource}ListChanged +
// sendResourceUpdated.
await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsPromptsListChanged));
await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesListChanged));
await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
```

## On the wire

1. `tools/call` → starts the tool.
2. `notifications/message` × N → `{ level: 'info', data: 'tick i/count …' }`, one per tick (or, for
   `mutate_catalog`: `notifications/tools/list_changed`, `…/prompts/list_changed`,
   `…/resources/list_changed`, and `notifications/resources/updated` `{ uri }`).
3. result → `{ content: [{ type: 'text', text: 'Done. Sent N log notifications.' }] }`.

`ctx.NotifyAsync` targets *this request's* stream only. The same `mutate_catalog` tool also calls
`ctx.NotifySubscribersAsync(...)`, which fans the identical notifications out to separately-opened
subscription streams — see [Subscriptions](./subscriptions.md) for that fan-out and how the demo
opts in by filter. For the log-carrying variant, see [Logging](./logging.md).
