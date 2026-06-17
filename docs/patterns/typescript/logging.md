# Logging

**Part III · Interaction & utilities** · Book Ch 29 · Stories S23 · sidebar `/logging`

A tool emits diagnostics through `ctx.log(level, message)`, which the SDK turns into out-of-band
`notifications/message` frames on the request's response stream — `level`, `logger`, and `data`
arrive in real time, before the final result. (Logging is deprecated in the RC; a client opts in
per-request via the `io.modelcontextprotocol/logLevel` `_meta` key — there is no `logging/setLevel`
RPC.) This pattern traces a `count_with_logs` call from the demo to the server and back.

## Round-trip

```
demo (LoggingPage)  ──POST /api/tools/call──▶  client host (Hono)
      ▲                                              │ api.callTool('count_with_logs', args)
      │                                              ▼
  ApiResultView                            @stackific/mcp-sdk  Client
      │                                              │ tools/call (JSON-RPC)
      └── notifications/message ◀── Streamable HTTP ─┴──▶ MCP server (count_with_logs)
                                                          ctx.log('info', …) per tick
```

## 1 · Frontend — `demo/src/routes/logging.tsx` + `demo/src/lib/api.ts`

The page calls the tool with a plain `backend.callTool` — the log frames arrive separately on the
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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The route delegates to the SDK `Client`; nothing logging-specific happens here — the host simply
taps every inbound frame (including `notifications/message`) and relays it to the SPA's wire panel:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json<{
    name: string;
    arguments?: Record<string, unknown>;
  }>();
  return run(c, () => api.callTool(name, args ?? {}));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
callTool: (name: string, args: Record<string, unknown>) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({ method: 'tools/call', params: { name, arguments: args } }),
  ),
```

```ts
// ts-mcp-client/src/mcp-client.ts
// Tap INCOMING frames (interim notifications, server→client requests, responses).
t.onMessage((m) => tap('recv', m));
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`count_with_logs` calls `ctx.log('info', ...)` once per tick. The SDK serializes each into a
`notifications/message` frame on the response stream, then resolves with the final text:

```ts
// ts-mcp-server/src/features.ts
async (args, ctx) => {
  const count = Number(args.count ?? 5);
  const intervalMs = Number(args.intervalMs ?? 500);
  for (let i = 1; i <= count; i++) {
    ctx.log('info', `tick ${i}/${count} at ${new Date().toISOString()}`);
    await delay(intervalMs);
  }
  return { content: [{ type: 'text', text: `Done. Sent ${count} log notifications.` }] };
},
```

## On the wire

1. `tools/call` → starts the tool.
2. `notifications/message` × N → `{ level: 'info', logger?, data: 'tick i/count at …' }`, one per
   tick, interleaved with the still-pending response.
3. result → `{ content: [{ type: 'text', text: 'Done. Sent N log notifications.' }] }`.

These are the same out-of-band [Notifications](./notifications.md) primitive, just carrying log
data. The same tool drives [Progress & Cancel](./progress.md) where `slow_count` pairs `ctx.log`
with `ctx.notify({ method: 'notifications/progress', … })`.
