# Progress & Cancel

**Part III · Interaction & utilities** · Book Ch 27–28 · Stories S22 · sidebar `/progress`

A long-running tool attaches a `progressToken` and streams `notifications/progress` correlated
to it; the caller can abort mid-flight, which surfaces as `notifications/cancelled` on the wire and
flips `ctx.signal.aborted` inside the tool so it stops cooperatively. This pattern traces both the
progress stream and the cancellation from the demo SPA to the server and back.

## Round-trip

```
demo (ProgressPage)  ──POST /api/tools/call-cancellable──▶  client host (Hono)
      │  backend.cancel(id) ─▶ POST /api/cancel               │ api.callToolCancellable(name, args, id)
      ▼                                                       ▼  (AbortController in `inflight`)
  progress bar ◀── notifications/progress ──┐    @stackific/mcp-sdk  Client (attaches progressToken)
                                            │                 │ tools/call (JSON-RPC)
      └──── abort ──▶ notifications/cancelled ┴── Streamable HTTP ─┴──▶ MCP server (slow_count)
                                                              ctx.notify(progress) per tick;
                                                              if (ctx.signal.aborted) break
```

## 1 · Frontend — `demo/src/routes/progress.tsx` + `demo/src/lib/api.ts`

The page mints a `cancelId`, starts the call, and renders a progress bar from the latest
`notifications/progress` frame on the wire. The Cancel button POSTs that same id:

```tsx
// demo/src/routes/progress.tsx
function start(to: number, intervalMs: number) {
  cancelId.current = crypto.randomUUID();
  runStartSeq.current = frames.at(-1)?.seq ?? 0;
  setRunning(true);
  void call
    .run(() => backend.callToolCancellable('slow_count', { to, intervalMs }, cancelId.current))
    .finally(() => setRunning(false));
}
// ...
<Button variant="destructive" onClick={() => backend.cancel(cancelId.current)} disabled={!running}>
  Cancel
</Button>
```

The bar reads only progress frames emitted *after* this run started (no stale bar):

```tsx
// demo/src/routes/progress.tsx
const lastProgress = [...frames]
  .reverse()
  .find((f) => f.method === 'notifications/progress' && f.seq > runStartSeq.current);
const p = lastProgress?.payload as any;
const pct = p?.params?.total ? Math.round((p.params.progress / p.params.total) * 100) : null;
```

The two `backend.*` calls are thin REST wrappers — the call (with its `cancelId`) and the abort:

```ts
// demo/src/lib/api.ts
callToolCancellable: (name: string, args: Record<string, unknown>, cancelId: string) =>
  postJson<ApiResult<Any>>('/api/tools/call-cancellable', { name, arguments: args, cancelId }),
cancel: (cancelId: string) => postJson<{ ok: boolean }>('/api/cancel', { cancelId }),
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

Two routes: one starts the cancellable call, the other aborts it by id:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call-cancellable', async (c) => {
  const { name, arguments: args, cancelId } = await c.req.json<{
    name: string; arguments?: Record<string, unknown>; cancelId: string;
  }>();
  return run(c, () => api.callToolCancellable(name, args ?? {}, cancelId));
});
app.post('/api/cancel', async (c) => {
  const { cancelId } = await c.req.json<{ cancelId: string }>();
  return c.json({ ok: cancel(cancelId) });
});
```

`callToolCancellable` registers an `AbortController` in the `inflight` map under `cancelId`, then
passes `signal` and `onProgress` to the SDK — passing `onProgress` is what makes the client attach
a `progressToken`, so the server's progress notifications are correlated and delivered:

```ts
// ts-mcp-client/src/mcp-client.ts
const inflight = new Map<string, AbortController>();
// ...
callToolCancellable: (name, args, cancelId) =>
  withTrace(`tools/call:${name}`, async () => {
    const ctrl = new AbortController();
    inflight.set(cancelId, ctrl);
    try {
      return await client!.requestWithInput(
        { method: 'tools/call', params: { name, arguments: args } },
        { signal: ctrl.signal, onProgress: () => {}, timeoutMs: 120000 },
      );
    } finally {
      inflight.delete(cancelId);
    }
  }),
```

`cancel()` looks the controller up by id and aborts it — the SDK then emits
`notifications/cancelled` on the wire:

```ts
// ts-mcp-client/src/mcp-client.ts
export function cancel(cancelId: string): boolean {
  const ctrl = inflight.get(cancelId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`slow_count` counts to `to`, emitting one `notifications/progress` per tick (correlated to the
caller's `ctx.progressToken`), and checks `ctx.signal.aborted` each iteration to stop cooperatively:

```ts
// ts-mcp-server/src/features.ts
async (args, ctx) => {
  const to = Number(args.to ?? 12);
  const intervalMs = Number(args.intervalMs ?? 600);
  let i = 0;
  for (; i < to; i++) {
    if (ctx.signal.aborted) break;
    ctx.log('info', `count ${i + 1}/${to}`);
    if (ctx.progressToken !== undefined) {
      ctx.notify({
        method: 'notifications/progress',
        params: {
          progressToken: ctx.progressToken,
          progress: i + 1,
          total: to,
          message: `count ${i + 1}/${to}`,
        },
      });
    }
    await delay(intervalMs);
  }
  const cancelled = ctx.signal.aborted;
  return {
    content: [
      { type: 'text', text: cancelled ? `Cancelled at ${i}/${to}.` : `Counted to ${to}.` },
    ],
  };
},
```

## On the wire

1. `tools/call` (params `_meta.progressToken` set by the SDK) → starts the tool.
2. `notifications/progress` × N → `{ progressToken, progress, total, message }`, one per tick.
3. On cancel: `notifications/cancelled` → the server's `ctx.signal` aborts; the loop breaks and the
   tool returns `Cancelled at i/to.` as a normal (non-error) result.

The `progressToken` rides the `_meta` envelope — see [The \_meta Envelope](./meta.md). The per-tick
`ctx.log(...)` calls are [Logging](./logging.md) notifications on the same stream.
