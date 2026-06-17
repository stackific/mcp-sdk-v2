# Logging

**Part III · Interaction & utilities** · Book Ch 29 · Stories S23 · sidebar `/logging`

A tool emits diagnostics through `ctx.log(level, message)`, which the SDK turns into out-of-band
`notifications/message` frames on the request's response stream — `level`, `logger`, and `data`
arrive in real time, before the final result. (Logging is deprecated in the RC; a client opts in
per-request via the `io.modelcontextprotocol/logLevel` `_meta` key — there is no `logging/setLevel`
RPC.) This pattern traces a `count_with_logs` call from the demo to the server and back. The
frontend is the same shared SPA; here the calls land on the **Python** client host and the
**Python** MCP server.

## Round-trip

```
demo (LoggingPage)  ──POST /api/tools/call──▶  client host (FastAPI)
      ▲                                              │ api.call_tool('count_with_logs', args)
      │                                              ▼
  ApiResultView                            stackific-mcp  Client
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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The route delegates to the SDK `Client`; nothing logging-specific happens here — the host simply
taps every inbound frame (including `notifications/message`) and relays it to the SPA's wire panel:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
```

```python
# py-mcp-client/mcp_client.py
def call_tool(self, name: str, args: dict) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool(name, args))
```

The tap is installed once on the `Client` via `set_frame_listener`; `_tap` classifies each frame
(`notifications/message` included) and emits it to the debug bus the SPA reads:

```python
# py-mcp-client/mcp_client.py
client.set_frame_listener(_tap)
# ...
def _tap(direction: str, message: dict) -> None:
  c = _classify(message)
  bus.emit_frame({"dir": direction, "kind": c["kind"], "method": c.get("method"), "id": c.get("id"), "summary": c.get("summary"), "payload": message, "trace": _trace()})
```

## 3 · MCP server — `py-mcp-server/features.py`

`count_with_logs` calls `ctx.log("info", ...)` once per tick. The SDK serializes each into a
`notifications/message` frame on the response stream, then returns the final text:

```python
# py-mcp-server/features.py
def count_with_logs(args: dict, ctx: ToolContext) -> dict:
  count = int(args.get("count", 5))
  interval_ms = int(args.get("intervalMs", 500))
  for i in range(1, count + 1):
    ctx.log("info", f"tick {i}/{count} at {_now_iso()}")
    time.sleep(interval_ms / 1000)
  return {"content": [{"type": "text", "text": f"Done. Sent {count} log notifications."}]}
```

## On the wire

1. `tools/call` → starts the tool.
2. `notifications/message` × N → `{ level: 'info', logger?, data: 'tick i/count at …' }`, one per
   tick, interleaved with the still-pending response.
3. result → `{ content: [{ type: 'text', text: 'Done. Sent N log notifications.' }] }`.

These are the same out-of-band [Notifications](./notifications.md) primitive, just carrying log
data. The same tool drives [Progress & Cancel](./progress.md) where `slow_count` pairs `ctx.log`
with `ctx.notify({"method": "notifications/progress", …})`.
