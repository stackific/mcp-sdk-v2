# Notifications

**Part III · Interaction & utilities** · Book Ch 24 · Stories S16 · sidebar `/notifications`

Notifications are one-way messages — no `id`, no reply. A tool can emit them **on this request's own
response stream** while it runs, so the caller sees each frame arrive in real time, before the final
result. The demo's notifications page drives `count_with_logs`, which streams one
`notifications/message` per tick; the same in-band mechanism carries `*_changed` and
`resources/updated` frames (see the server section). This pattern traces those frames from the demo
to the server and back. The frontend is the same shared SPA; here the calls land on the **Python**
client host and the **Python** MCP server.

## Round-trip

```
demo (NotificationsPage)  ──POST /api/tools/call──▶  client host (FastAPI)
      ▲                                                  │ api.call_tool('count_with_logs', args)
      │                                                  ▼
  ApiResultView                            stackific-mcp  Client
      │                                                  │ tools/call (JSON-RPC)
      └── notifications/message ◀── Streamable HTTP ─────┴──▶ MCP server (count_with_logs)
          (in-band, before the result)                       ctx.log(…) per tick; or, in
                                                              mutate_catalog, ctx.send_tool_list_changed()…
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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The route hands off to the SDK `Client`; the host's frame tap relays each inbound notification
frame to the SPA's wire stream as it arrives:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
```

```python
# py-mcp-client/mcp_client.py
# Tap every wire frame (interim notifications, server→client requests, responses).
client.set_frame_listener(_tap)
# ...
def _tap(direction: str, message: dict) -> None:
  c = _classify(message)
  bus.emit_frame({"dir": direction, "kind": c["kind"], "method": c.get("method"), "id": c.get("id"), "summary": c.get("summary"), "payload": message, "trace": _trace()})
```

## 3 · MCP server — `py-mcp-server/features.py`

`count_with_logs` emits one notification per tick via `ctx.log`, then returns — proving the frames
ride the response stream ahead of the result:

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

The catalog-change notifications use the same in-band stream, emitted by the `mutate_catalog` tool
through the `ctx.send_*` helpers — so a caller without a subscription still receives them:

```python
# py-mcp-server/features.py
# Also emit on this request's own stream so the Notifications page (no subscription) sees them.
ctx.send_tool_list_changed()
ctx.send_prompt_list_changed()
ctx.send_resource_list_changed()
ctx.send_resource_updated({"uri": "docs://readme"})
```

## On the wire

1. `tools/call` → starts the tool.
2. `notifications/message` × N → `{ level: 'info', data: 'tick i/count …' }`, one per tick (or, for
   `mutate_catalog`: `notifications/tools/list_changed`, `…/prompts/list_changed`,
   `…/resources/list_changed`, and `notifications/resources/updated` `{ uri }`).
3. result → `{ content: [{ type: 'text', text: 'Done. Sent N log notifications.' }] }`.

The `ctx.send_*` helpers target *this request's* stream only. The same `mutate_catalog` tool also
calls `ctx.notify_subscribers(...)`, which fans the identical notifications out to separately-opened
subscription streams — see [Subscriptions](./subscriptions.md) for that fan-out and how the demo
opts in by filter. For the log-carrying variant, see [Logging](./logging.md).
