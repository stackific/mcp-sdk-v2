# The _meta Envelope

**Part I · Foundations** · Book Ch 4 · Stories S05 · sidebar `/meta`

`_meta` is the open, string-keyed extension envelope that may ride on any request params,
notification params, or result. The SDK stamps three required `io.modelcontextprotocol/*` keys
on every request; callers may add their own namespaced keys. This pattern sends a custom `_meta`
to the `echo_trace` tool, which echoes back exactly what the server received.

## Round-trip

```
demo (MetaPage)  ──POST /api/tools/call-traced──▶  client host (Hono)
      ▲                                               │ api.callToolWithMeta('echo_trace', {}, meta)
      │                                               ▼
  JsonBlock (echoed)                       @stackific/mcp-sdk  Client (stamps _meta)
      │                                               │ tools/call (JSON-RPC)
      └──────── result._meta.echoed ◀── Streamable HTTP ─┴──▶ MCP server (echo_trace → ctx.meta)
```

## 1 · Frontend — `demo/src/routes/meta.tsx` + `demo/src/lib/api.ts`

The page sends one protocol-reserved-prefix key and one custom namespaced key, then renders the
`_meta` the server echoes back:

```tsx
// demo/src/routes/meta.tsx
backend.callToolTraced(
  'echo_trace',
  {},
  {
    'io.modelcontextprotocol/example': 'reserved-namespace',
    'companion/note': 'custom key',
  },
)
// ...
const echoed = call.data?.ok ? (call.data.result as any)?._meta?.echoed ?? null : null;
```

```ts
// demo/src/lib/api.ts
callToolTraced: (name, args, meta) =>
  postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

The host forwards the caller's `_meta` verbatim; the SDK then merges in the three required keys.
The capabilities it stamps are this client's single source of truth:

```ts
// ts-mcp-client/src/mcp-client.ts
const CLIENT_CAPABILITIES = {
  elicitation: { form: {}, url: {} },
  sampling: {},
  roots: {},
  tasks: {},
} as const;
// ...
callToolWithMeta: (name, args, meta) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({ method: 'tools/call', params: { name, arguments: args, _meta: meta } }),
  ),
```

The SDK's `sendOnce` is where the envelope is assembled — caller keys first, then the three
reserved keys (protocol version, client identity, client capabilities):

```ts
// ts-sdk/src/client/client.ts
const envelope: Record<string, unknown> = {
  ...(isObject(callerMeta) ? callerMeta : {}),
  [PROTOCOL_VERSION_META_KEY]: this.protocolVersion(),
  [CLIENT_INFO_META_KEY]: this.clientInfo,
  [CLIENT_CAPABILITIES_META_KEY]: this.capabilities,
};
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`echo_trace` simply returns the `_meta` the tool context received — including the reserved keys
and any custom ones — proving arbitrary metadata travelled alongside the message:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'echo_trace',
  {
    title: 'Echo Trace Context',
    description: 'Echoes back the _meta the server received (incl. traceparent/tracestate).',
  },
  async (_args, ctx) => ({
    content: [{ type: 'text', text: `Server received _meta:\n${JSON.stringify(ctx.meta ?? {}, null, 2)}` }],
    _meta: { echoed: ctx.meta ?? {} },
  }),
);
```

## On the wire

1. `tools/call` (params `_meta`) → `{ "companion/note": "custom key", "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {…}, "io.modelcontextprotocol/clientCapabilities": {…} }`
2. result → `{ content: [...], _meta: { echoed: { …the received _meta… } } }`

Each key is either a reverse-DNS prefix ending in `/` plus a name, or one of four reserved bare
keys (`progressToken`, `traceparent`, `tracestate`, `baggage`). The `io.modelcontextprotocol/`
prefix is protocol-reserved; third parties use their own. Receivers never reject a message for
unrecognized keys — see [JSON Value Model](./json-model.md). The required keys also drive
[Capabilities](./capabilities.md) negotiation.
