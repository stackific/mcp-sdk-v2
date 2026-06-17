# JSON-RPC Framing

**Part I · Foundations** · Book Ch 3–4 · Stories S03–S04 · sidebar `/jsonrpc`

Every interaction rides inside a single JSON-RPC 2.0 object: a request carries `jsonrpc`, an
`id`, a `method`, and optional `params`; the matching response echoes that `id`. This pattern
sends a `ping` and traces the exact envelope from the page to the server and back.

## Round-trip

```
demo (JsonRpcPage)  ──POST /api/raw {method:'ping'}──▶  client host (Hono)
      ▲                                                    │ api.raw('ping')
      │                                                    ▼
  ApiResultView                                 @stackific/mcp-sdk  Client
      │                                                    │ ping (JSON-RPC request, id)
      └──── EmptyResult ◀──── Streamable HTTP ─────────────┴──▶ MCP server (SDK dispatcher)
```

## 1 · Frontend — `demo/src/routes/jsonrpc.tsx` + `demo/src/lib/api.ts`

The button fires a plain ping; `backend.ping` is just `raw` with the `ping` method:

```tsx
// demo/src/routes/jsonrpc.tsx
<Button onClick={() => call.run(() => backend.ping())}>Ping</Button>
<ApiResultView result={call.data} />
```

```ts
// demo/src/lib/api.ts
ping: () => postJson<ApiResult<Any>>('/api/raw', { method: 'ping', params: {} }),
raw: (method: string, params: Record<string, unknown> = {}) =>
  postJson<ApiResult<Any>>('/api/raw', { method, params }),
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The generic passthrough route hands any `{ method, params }` to the SDK's `request`:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/raw', async (c) => {
  const { method, params } = await c.req.json();
  return run(c, () => api.raw(method, params ?? {}));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
raw: (method: string, params: Record<string, unknown> = {}) =>
  withTrace(method, () => client!.request({ method, params })),
```

Every frame is *classified* by which members are present, then *tapped* to the debug bus — this
is the framing rule made visible (request = `method` + `id`; notification = `method`, no `id`;
response = `result` or `error`):

```ts
// ts-mcp-client/src/mcp-client.ts
function classify(message: any) {
  if ('method' in message && 'id' in message)
    return { kind: 'request', method: message.method, id: message.id, /* ... */ };
  if ('method' in message)
    return { kind: 'notification', method: message.method, /* ... */ };
  if ('result' in message)
    return { kind: 'response', id: message.id ?? null, /* ... */ };
  if ('error' in message)
    return { kind: 'error', id: message.id ?? null, /* ... */ };
  // ...
}
```

## 3 · MCP server — `ts-mcp-server/src/index.ts`

The server owns no framing of its own — the SDK's Streamable HTTP handler parses each request,
correlates the `id`, dispatches by `method`, and frames the response:

```ts
// ts-mcp-server/src/index.ts
app.all('/mcp', toHonoMcpHandler(buildCompanionServer(), { path: '/mcp' }));
```

The SDK builds the outgoing request frame with the mandatory `jsonrpc` marker and a correlating
`id`:

```ts
// ts-sdk/src/client/client.ts
const message = {
  jsonrpc: '2.0' as const,
  id,
  method: req.method,
  params: { ...rest, _meta: envelope },
};
```

## On the wire

1. `ping` request → `{ jsonrpc: "2.0", id, method: "ping", params: { _meta } }`
2. response → `{ jsonrpc: "2.0", id, result: { resultType: "complete" } }`

A success `result` sets the required `resultType` discriminator (an `EmptyResult` carries only
the base). The response echoes the request `id` with the same JSON type and value. The `_meta`
envelope on the request params is covered in [The _meta Envelope](./meta.md); the JSON value
rules in [JSON Value Model](./json-model.md).
