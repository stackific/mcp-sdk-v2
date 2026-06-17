# Tracing

**Part III · Interaction & utilities** · Book Ch 44 · Stories S23 · sidebar `/tracing`

Distributed tracing rides the same `_meta` envelope every message already carries. The caller
injects a W3C `traceparent` (and `tracestate`) into `_meta`; the SDK propagates it verbatim on the
wire, and the server reads it from `ctx.meta` — stitching one trace across the whole call. This
pattern injects a `traceparent` into `echo_trace` and verifies the server saw the same value.

## Round-trip

```
demo (TracingPage)  ──POST /api/tools/call-traced──▶  client host (Hono)
      ▲                                                  │ api.callToolWithMeta('echo_trace', {}, meta)
      │                                                  ▼
  JsonBlock (echoed)                         @stackific/mcp-sdk  Client (merges reserved keys)
      │                                                  │ tools/call (params._meta.traceparent)
      └──── result._meta.echoed ◀── Streamable HTTP ─────┴──▶ MCP server (echo_trace → ctx.meta)
```

## 1 · Frontend — `demo/src/routes/tracing.tsx` + `demo/src/lib/api.ts`

The page generates a fresh `traceparent`, sends it via `callToolTraced`, and confirms the round-trip
by comparing the echoed `_meta.traceparent` against what it sent:

```tsx
// demo/src/routes/tracing.tsx
function send() {
  const tp = `00-${hex(16)}-${hex(8)}-01`;
  setTraceparent(tp);
  void call.run(() =>
    backend.callToolTraced('echo_trace', {}, { traceparent: tp, tracestate: 'companion=demo' }),
  );
}

const echoed =
  call.data && call.data.ok ? ((call.data.result as any)?._meta?.echoed ?? null) : null;
const roundTripped = echoed?.traceparent === traceparent && !!traceparent;
```

`callToolTraced` posts the args plus a `_meta` body to the traced route:

```ts
// demo/src/lib/api.ts
callToolTraced: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The route unwraps the `_meta` body and forwards it to `callToolWithMeta`:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call-traced', async (c) => {
  const { name, arguments: args, _meta } = await c.req.json<{
    name: string;
    arguments?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  }>();
  return run(c, () => api.callToolWithMeta(name, args ?? {}, _meta ?? {}));
});
```

`callToolWithMeta` propagates the caller's `_meta` (the `traceparent`/`tracestate`) on the wire; the
SDK then merges in its three required reserved keys without clobbering the caller's:

```ts
// ts-mcp-client/src/mcp-client.ts
// Call a tool with caller-supplied _meta (e.g. W3C traceparent) propagated on the wire.
callToolWithMeta: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({
      method: 'tools/call',
      params: { name, arguments: args, _meta: meta },
    }),
  ),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`echo_trace` reads `ctx.meta` — the full received `_meta`, including the `traceparent` — and returns
it under `_meta.echoed`, proving the trace context travelled alongside the message:

```ts
// ts-mcp-server/src/features.ts
async (_args, ctx) => ({
  content: [
    {
      type: 'text',
      text: `Server received _meta:\n${JSON.stringify(ctx.meta ?? {}, null, 2)}`,
    },
  ],
  _meta: { echoed: ctx.meta ?? {} },
}),
```

## On the wire

1. `tools/call` (params `_meta`) → `{ traceparent: '00-…-…-01', tracestate: 'companion=demo',
   io.modelcontextprotocol/protocolVersion: …, io.modelcontextprotocol/clientInfo: {…},
   io.modelcontextprotocol/clientCapabilities: {…} }`.
2. result → `{ content: [...], _meta: { echoed: { …the received _meta, traceparent intact… } } }`.

`traceparent`, `tracestate`, and `baggage` are reserved *bare* `_meta` keys — tracing reuses the
exact same envelope and code path as any other metadata. See [The \_meta Envelope](./meta.md) for how
the SDK assembles caller keys and reserved keys together.
