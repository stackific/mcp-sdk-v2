# Subscriptions

**Part III · Interaction & utilities** · Book Ch 25–26 · Stories S16 · sidebar `/subscriptions`

V2 RC is stateless, so there is no permanently-open channel. Instead the client sends **one**
`subscriptions/listen` request carrying a filter that declares exactly which notification types it
wants; the server acknowledges the honored subset and then only those notifications flow on the
subscription stream. This replaces the legacy `resources/subscribe`. This pattern opens a
subscription from the demo, mutates the catalog, and watches the honored notifications fan out.

## Round-trip

```
demo (SubscriptionsPage)  ──POST /api/subscribe──▶  client host (Minimal API)
      │                                                │ host.SubscribeAsync(body)
      │                                                ▼ _client.SubscribeAsync(filter)
      │                                       Stackific.Mcp.Client  McpClient
      │                                                │ subscriptions/listen (acked promptly)
      ▼  then POST /api/tools/call('mutate_catalog')   │
  ack + change frames ◀── Streamable HTTP ─────────────┴──▶ MCP server (mutate_catalog)
                                                            ctx.NotifySubscribersAsync(new JsonRpcNotification(...))
```

## 1 · Frontend — `demo/src/routes/subscriptions.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page sends a filter opting into the three `list_changed` kinds plus a resource subscription, then
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

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The route forwards the filter body to `host.SubscribeAsync`, which returns the server's
honored-filter acknowledgement promptly:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/subscribe", (JsonObject body) => Run(async () => (object?)await host.SubscribeAsync(body)));
```

`SubscribeAsync` translates the frontend filter into a typed `SubscriptionFilter`, tears down any
stale subscription, then drives the SDK client's `SubscribeAsync(filter)`. That is the crucial
detail: `SubscribeAsync` resolves as soon as the *honored filter is acked* (returned on the handle as
`HonoredFilter`), whereas a raw `subscriptions/listen` request would hang forever — its final
response never arrives. Subsequent change notifications are already surfaced by the transport tap, so
there is nothing extra to do per delivery:

```csharp
// csharp-mcp-client/ClientHost.cs
public async Task<object> SubscribeAsync(JsonObject filterBody)
{
  await EnsureConnectedAsync();
  if (_subscription is not null)
  {
    await _subscription.Unsubscribe();
    _subscription = null;
  }
  var filter = new SubscriptionFilter
  {
    ToolsListChanged = filterBody["toolsListChanged"]?.GetValue<bool>() == true ? true : null,
    PromptsListChanged = filterBody["promptsListChanged"]?.GetValue<bool>() == true ? true : null,
    ResourcesListChanged = filterBody["resourcesListChanged"]?.GetValue<bool>() == true ? true : null,
    ResourceSubscriptions = (filterBody["resourceSubscriptions"] as JsonArray)?.Select(n => n!.GetValue<string>()).ToList(),
  };
  _trace.Value = "subscriptions/listen";
  try
  {
    var handle = await _client!.SubscribeAsync(filter);
    _subscription = handle;
    return new { acknowledgedFilter = handle.HonoredFilter };
  }
  finally { _trace.Value = null; }
}
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The same `mutate_catalog` tool calls `ctx.NotifySubscribersAsync(new JsonRpcNotification(...))` to fan
each list-changed / resources-updated notification out to *active subscription streams* — each
subscriber receives only the kinds it honored:

```csharp
// csharp-mcp-server/Features.cs
async ctx =>
{
  // Fan out to active subscription streams (no-op until a subscriber is listening)…
  foreach (var method in new[] { McpMethods.NotificationsToolsListChanged, McpMethods.NotificationsPromptsListChanged, McpMethods.NotificationsResourcesListChanged })
  {
    await ctx.NotifySubscribersAsync(new JsonRpcNotification(method));
  }
  await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
  // …and emit the same four on this request's own stream so the Notifications view (no
  // subscription) sees them …
  await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
  // ...
}
```

## On the wire

1. `subscriptions/listen` (params: the filter) → ack `{ subscriptionId, acknowledgedFilter }`.
2. After `mutate_catalog`: `notifications/tools/list_changed`,
   `notifications/prompts/list_changed`, `notifications/resources/list_changed`, and
   `notifications/resources/updated` `{ uri: 'docs://readme' }` — delivered on the subscription
   stream, restricted to the honored kinds.

`NotifySubscribersAsync` fans out to *subscription* streams; the same tool's `ctx.NotifyAsync` calls
also emit on the triggering request's own stream — that in-band path is
[Notifications](./notifications.md).
