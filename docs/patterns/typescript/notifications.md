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
demo (NotificationsPage)  ──POST /api/tools/call──▶  client host (Hono)
      ▲                                                  │ api.callTool('count_with_logs', args)
      │                                                  ▼
  ApiResultView                            @stackific/mcp-sdk  Client
      │                                                  │ tools/call (JSON-RPC)
      └── notifications/message ◀── Streamable HTTP ─────┴──▶ MCP server (count_with_logs)
          (in-band, before the result)                       ctx.log(…) per tick; or, in
                                                              mutate_catalog, ctx.sendToolListChanged()…
```

## 1 · Frontend — `demo/src/routes/notifications.tsx` + `demo/src/lib/api.ts`

The page calls the tool with a plain `backend.callTool`; the wire panel is filtered to every
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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The route hands off to the SDK `Client`; the host's transport tap relays each inbound notification
frame to the SPA's wire stream as it arrives:

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
// Tap INCOMING frames (interim notifications, server→client requests, responses).
t.onMessage((m) => tap('recv', m));
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`count_with_logs` emits one notification per tick via `ctx.log`, then resolves — proving the frames
ride the response stream ahead of the result:

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

The catalog-change notifications use the same in-band stream, emitted by the `mutate_catalog` tool
through the `ctx.send*` helpers — so a caller without a subscription still receives them:

```ts
// ts-mcp-server/src/features.ts
// Also emit on this request's own stream so the Notifications page (no subscription) sees them.
ctx.sendToolListChanged();
ctx.sendPromptListChanged();
ctx.sendResourceListChanged();
ctx.sendResourceUpdated({ uri: 'docs://readme' });
```

## On the wire

1. `tools/call` → starts the tool.
2. `notifications/message` × N → `{ level: 'info', data: 'tick i/count …' }`, one per tick (or, for
   `mutate_catalog`: `notifications/tools/list_changed`, `…/prompts/list_changed`,
   `…/resources/list_changed`, and `notifications/resources/updated` `{ uri }`).
3. result → `{ content: [{ type: 'text', text: 'Done. Sent N log notifications.' }] }`.

The `ctx.send*` helpers target *this request's* stream only. The same `mutate_catalog` tool also
calls `ctx.notifySubscribers(...)`, which fans the identical notifications out to separately-opened
subscription streams — see [Subscriptions](./subscriptions.md) for that fan-out and how the demo
opts in by filter. For the log-carrying variant, see [Logging](./logging.md).
