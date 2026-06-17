# Progress & Cancel

**Part III · Interaction & utilities** · Book Ch 27–28 · Stories S22 · sidebar `/progress`

A long-running tool attaches a `progressToken` and streams `notifications/progress` correlated
to it; the caller can abort mid-flight, which surfaces as `notifications/cancelled` on the wire and
flips `ctx.signal.aborted` inside the tool so it stops cooperatively. This pattern traces both the
progress stream and the cancellation from the demo SPA to the server and back. The frontend is the
same shared SPA; here the calls land on the **Python** client host and the **Python** MCP server.

## Round-trip

```
demo (ProgressPage)  ──POST /api/tools/call-cancellable──▶  client host (FastAPI)
      │  backend.cancel(id) ─▶ POST /api/cancel               │ api.call_tool_cancellable(name, args, id)
      ▼                                                       ▼  (cancel_id registered in the SDK Client)
  progress bar ◀── notifications/progress ──┐    stackific-mcp  Client (attaches progressToken)
                                            │                 │ tools/call (JSON-RPC)
      └──── abort ──▶ notifications/cancelled ┴── Streamable HTTP ─┴──▶ MCP server (slow_count)
                                                              ctx.notify(progress) per tick;
                                                              if ctx.signal.aborted: break
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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

Two routes: one starts the cancellable call, the other aborts it by id. Both are plain `def`
handlers so FastAPI runs each in a worker thread — the cancellable call *blocks* its handler, so
running it on the event loop would freeze the host and `/api/cancel` could never fire:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call-cancellable")
def api_tools_call_cancellable(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool_cancellable(body.get("name"), body.get("arguments") or {}, body.get("cancelId")))


@app.post("/api/cancel")
def api_cancel(body: dict = Body(default={})) -> dict:
  return {"ok": cancel(body.get("cancelId"))}
```

`call_tool_cancellable` forwards the `cancel_id` to the SDK `Client`, grouped under its own wire
trace — passing the id is what lets the SDK register the call for cancellation and attach a
`progressToken`, so the server's progress notifications are correlated and delivered:

```python
# py-mcp-client/mcp_client.py
def call_tool_cancellable(self, name: str, args: dict, cancel_id: str) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool_cancellable(name, args, cancel_id))
```

The module-level `cancel()` looks the call up by id on the live `Client` and aborts it — the SDK
then emits `notifications/cancelled` on the wire:

```python
# py-mcp-client/mcp_client.py
def cancel(cancel_id: str) -> bool:
  client = _state["client"]
  return bool(client and client.cancel(cancel_id))
```

## 3 · MCP server — `py-mcp-server/features.py`

`slow_count` counts to `to`, emitting one `notifications/progress` per tick (correlated to the
caller's `ctx.progress_token`), and checks `ctx.signal.aborted` each iteration to stop
cooperatively. The per-tick wait is `ctx.signal.wait(...)`, an interruptible sleep that returns
early the moment the request is cancelled:

```python
# py-mcp-server/features.py
def slow_count(args: dict, ctx: ToolContext) -> dict:
  to = int(args.get("to", 12))
  interval_ms = int(args.get("intervalMs", 600))
  i = 0
  while i < to:
    if ctx.signal.aborted:
      break
    ctx.log("info", f"count {i + 1}/{to}")
    if ctx.progress_token is not None:
      ctx.notify(
        {"method": "notifications/progress", "params": {"progressToken": ctx.progress_token, "progress": i + 1, "total": to, "message": f"count {i + 1}/{to}"}}
      )
    # Interruptible sleep: returns early if the request is cancelled meanwhile.
    ctx.signal.wait(interval_ms / 1000)
    i += 1
  cancelled = ctx.signal.aborted
  return {"content": [{"type": "text", "text": f"Cancelled at {i}/{to}." if cancelled else f"Counted to {to}."}]}
```

## On the wire

1. `tools/call` (params `_meta.progressToken` set by the SDK) → starts the tool.
2. `notifications/progress` × N → `{ progressToken, progress, total, message }`, one per tick.
3. On cancel: `notifications/cancelled` → the server's `ctx.signal` aborts; the loop breaks and the
   tool returns `Cancelled at i/to.` as a normal (non-error) result.

The `progressToken` rides the `_meta` envelope — see [The \_meta Envelope](./meta.md). The per-tick
`ctx.log(...)` calls are [Logging](./logging.md) notifications on the same stream.
