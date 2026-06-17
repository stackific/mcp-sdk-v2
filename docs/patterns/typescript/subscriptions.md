# Subscriptions

**Part III · Interaction & utilities** · Book Ch 25–26 · Stories S16 · sidebar `/subscriptions`

V2 RC is stateless, so there is no permanently-open channel. Instead the client sends **one**
`subscriptions/listen` request carrying a filter that declares exactly which notification types it
wants; the server acknowledges the honored subset and then only those notifications flow on the
subscription stream. This replaces the legacy `resources/subscribe`. This pattern opens a
subscription from the demo, mutates the catalog, and watches the honored notifications fan out.

## Round-trip

```
demo (SubscriptionsPage)  ──POST /api/subscribe──▶  client host (Hono)
      │                                                │ api.subscribe(filter) → doSubscribe
      │                                                ▼ client.subscribe(filter, cb)
      │                                       @stackific/mcp-sdk  Client
      │                                                │ subscriptions/listen (acked promptly)
      ▼  then POST /api/tools/call('mutate_catalog')   │
  ack + change frames ◀── Streamable HTTP ─────────────┴──▶ MCP server (mutate_catalog)
                                                            ctx.notifySubscribers({ method, params })
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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The route forwards the filter to `api.subscribe`, which returns the server's honored-filter
acknowledgement promptly:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/subscribe', async (c) => {
  const { notifications } = await c.req.json<{ notifications: Record<string, unknown> }>();
  return run(c, () => api.subscribe(notifications));
});
```

`api.subscribe` delegates to `doSubscribe`, which drives the SDK client's `subscribe()`. That is the
crucial detail: `subscribe()` resolves as soon as the *honored filter is acked*, whereas a raw
`client.request('subscriptions/listen')` would hang forever (its final response never arrives). The
callback is empty because change notifications are already surfaced by the transport tap:

```ts
// ts-mcp-client/src/mcp-client.ts
subscribe: (filter: Parameters<Client['subscribe']>[0]) =>
  withTrace('subscriptions/listen', () => doSubscribe(filter)),
```

```ts
// ts-mcp-client/src/mcp-client.ts
async function doSubscribe(
  filter: Parameters<Client['subscribe']>[0],
): Promise<{ subscriptionId: string; acknowledgedFilter: Record<string, unknown> }> {
  await ensureConnected();
  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch {
      // ignore teardown errors from a stale subscription
    }
    subscription = null;
  }
  const handle = await client!.subscribe(filter, () => {
    // Change notifications are already surfaced on the wire panel by the transport
    // tap (onMessage); there is nothing extra to do per delivery here.
  });
  subscription = handle;
  void handle.closed.then(() => {
    if (subscription === handle) subscription = null;
  });
  return { subscriptionId: handle.subscriptionId, acknowledgedFilter: handle.acknowledgedFilter };
}
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The same `mutate_catalog` tool calls `ctx.notifySubscribers({ method, params })` to fan each
list-changed / resources-updated notification out to *active subscription streams* — each subscriber
receives only the kinds it honored:

```ts
// ts-mcp-server/src/features.ts
async (_args, ctx) => {
  // Fan the change notifications out to active subscription streams (§10.5/§10.6)
  // so the Subscriptions page receives exactly its honored kinds.
  ctx.notifySubscribers({ method: 'notifications/tools/list_changed' });
  ctx.notifySubscribers({ method: 'notifications/prompts/list_changed' });
  ctx.notifySubscribers({ method: 'notifications/resources/list_changed' });
  ctx.notifySubscribers({
    method: 'notifications/resources/updated',
    params: { uri: 'docs://readme' },
  });
  // Also emit on this request's own stream so the Notifications page (no subscription) sees them.
  ctx.sendToolListChanged();
  // ...
},
```

## On the wire

1. `subscriptions/listen` (params: the filter) → ack `{ subscriptionId, acknowledgedFilter }`.
2. After `mutate_catalog`: `notifications/tools/list_changed`,
   `notifications/prompts/list_changed`, `notifications/resources/list_changed`, and
   `notifications/resources/updated` `{ uri: 'docs://readme' }` — delivered on the subscription
   stream, restricted to the honored kinds.

`notifySubscribers` fans out to *subscription* streams; the same tool's `ctx.send*` helpers also emit
on the triggering request's own stream — that in-band path is [Notifications](./notifications.md).
