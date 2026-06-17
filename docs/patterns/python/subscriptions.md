# Subscriptions

**Part III · Interaction & utilities** · Book Ch 25–26 · Stories S16 · sidebar `/subscriptions`

V2 RC is stateless, so there is no permanently-open channel. Instead the client sends **one**
`subscriptions/listen` request carrying a filter that declares exactly which notification types it
wants; the server acknowledges the honored subset and then only those notifications flow on the
subscription stream. This replaces the legacy `resources/subscribe`. This pattern opens a
subscription from the demo, mutates the catalog, and watches the honored notifications fan out. The
frontend is the same shared SPA; here the calls land on the **Python** client host and the
**Python** MCP server.

## Round-trip

```
demo (SubscriptionsPage)  ──POST /api/subscribe──▶  client host (FastAPI)
      │                                                │ api.subscribe(filter) → _do
      │                                                ▼ client.subscribe(filter)
      │                                       stackific-mcp  Client
      │                                                │ subscriptions/listen (acked promptly)
      ▼  then POST /api/tools/call('mutate_catalog')   │
  ack + change frames ◀── Streamable HTTP ─────────────┴──▶ MCP server (mutate_catalog)
                                                            ctx.notify_subscribers({ method, params })
```

## 1 · Frontend — `demo/src/routes/subscriptions.tsx` + `demo/src/lib/api.ts`

The page sends a filter opting into the three `list_changed` kinds plus a resource subscription, then
(in a second card) calls `mutate_catalog` to trigger the notifications:

```tsx
// demo/src/routes/subscriptions.tsx
backend.subscribe({
  toolsListChanged: true,
  promptsListChanged: true,
  resourcesListChanged: true,
  resourceSubscriptions: ['docs://readme'],
})
// ...
<Button onClick={() => mutate.run(() => backend.callTool('mutate_catalog', {}))}>
  Mutate catalog (emit notifications)
</Button>
```

```ts
// demo/src/lib/api.ts
subscribe: (notifications: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/subscribe', { notifications }),
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The route forwards the filter to `api.subscribe`, which returns the server's honored-filter
acknowledgement promptly:

```python
# py-mcp-client/main.py
@app.post("/api/subscribe")
def api_subscribe(body: dict = Body(default={})) -> dict:
  return run(lambda: api.subscribe(body.get("notifications") or {}))
```

`api.subscribe` drives the SDK client's `subscribe()`, which is non-blocking and returns a
`SubscriptionHandle`. That is the crucial detail: the handle's `wait_acknowledged(...)` resolves as
soon as the *honored filter is acked*, whereas a raw `client.raw("subscriptions/listen")` would hang
forever (its final response never arrives). The host keeps a single active handle (tearing down any
prior one) and returns the honored filter as a plain dict; change notifications need no per-delivery
callback because they already ride the wire tap to `/debug/stream`:

```python
# py-mcp-client/mcp_client.py
def subscribe(self, notifications: dict) -> dict:
  # The SDK's subscribe() is non-blocking and returns a SubscriptionHandle (not a
  # JSON-serialisable value). Mirror the TS host: keep a single active handle, wait
  # for the server's acknowledgement, then return the honored filter as a plain dict.
  def _do() -> dict:
    prior = _state.get("subscription")
    if prior is not None:
      try:
        prior.unsubscribe()
      except Exception:
        pass
      _state["subscription"] = None
    handle = _state["client"].subscribe(notifications)
    handle.wait_acknowledged(timeout=5.0)
    _state["subscription"] = handle
    return {"subscriptionId": handle.subscription_id, "acknowledgedFilter": handle.acknowledged_filter}

  return _with_trace("subscriptions/listen", _do)
```

## 3 · MCP server — `py-mcp-server/features.py`

The same `mutate_catalog` tool calls `ctx.notify_subscribers({ method, params })` to fan each
list-changed / resources-updated notification out to *active subscription streams* — each subscriber
receives only the kinds it honored:

```python
# py-mcp-server/features.py
def mutate_catalog(args: dict, ctx: ToolContext) -> dict:
  # Fan the change notifications out to active subscription streams (§10.5/§10.6).
  ctx.notify_subscribers({"method": "notifications/tools/list_changed"})
  ctx.notify_subscribers({"method": "notifications/prompts/list_changed"})
  ctx.notify_subscribers({"method": "notifications/resources/list_changed"})
  ctx.notify_subscribers({"method": "notifications/resources/updated", "params": {"uri": "docs://readme"}})
  # Also emit on this request's own stream so the Notifications page (no subscription) sees them.
  ctx.send_tool_list_changed()
  # ...
  return {"content": [{"type": "text", "text": "Emitted list_changed + resources/updated to subscribers and on this stream."}]}
```

## On the wire

1. `subscriptions/listen` (params: the filter) → ack `{ subscriptionId, acknowledgedFilter }`.
2. After `mutate_catalog`: `notifications/tools/list_changed`,
   `notifications/prompts/list_changed`, `notifications/resources/list_changed`, and
   `notifications/resources/updated` `{ uri: 'docs://readme' }` — delivered on the subscription
   stream, restricted to the honored kinds.

`notify_subscribers` fans out to *subscription* streams; the same tool's `ctx.send_*` helpers also
emit on the triggering request's own stream — that in-band path is [Notifications](./notifications.md).
