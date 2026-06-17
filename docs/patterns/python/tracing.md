# Tracing

**Part III · Interaction & utilities** · Book Ch 44 · Stories S23 · sidebar `/tracing`

Distributed tracing rides the same `_meta` envelope every message already carries. The caller
injects a W3C `traceparent` (and `tracestate`) into `_meta`; the SDK propagates it verbatim on the
wire, and the server reads it from `ctx.meta` — stitching one trace across the whole call. This
pattern injects a `traceparent` into `echo_trace` and verifies the server saw the same value. The
frontend is the same shared SPA; here the calls land on the **Python** client host and the
**Python** MCP server.

## Round-trip

```
demo (TracingPage)  ──POST /api/tools/call-traced──▶  client host (FastAPI)
      ▲                                                  │ api.call_tool_with_meta('echo_trace', {}, meta)
      │                                                  ▼
  JsonBlock (echoed)                         stackific-mcp  Client (merges reserved keys)
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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The route unwraps the `_meta` body and forwards it to `call_tool_with_meta`:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call-traced")
def api_tools_call_traced(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool_with_meta(body.get("name"), body.get("arguments") or {}, body.get("_meta") or {}))
```

`call_tool_with_meta` propagates the caller's `_meta` (the `traceparent`/`tracestate`) on the wire,
grouped under its own trace; the SDK then merges in its required reserved keys without clobbering the
caller's:

```python
# py-mcp-client/mcp_client.py
def call_tool_with_meta(self, name: str, args: dict, meta: dict) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool_with_meta(name, args, meta))
```

## 3 · MCP server — `py-mcp-server/features.py`

`echo_trace` reads `ctx.meta` — the full received `_meta`, including the `traceparent` — and returns
it under `_meta.echoed`, proving the trace context travelled alongside the message:

```python
# py-mcp-server/features.py
def echo_trace(args: dict, ctx: ToolContext) -> dict:
  import json
  return {"content": [{"type": "text", "text": f"Server received _meta:\n{json.dumps(ctx.meta or {}, indent=2)}"}], "_meta": {"echoed": ctx.meta or {}}}
```

## On the wire

1. `tools/call` (params `_meta`) → `{ traceparent: '00-…-…-01', tracestate: 'companion=demo',
   io.modelcontextprotocol/protocolVersion: …, io.modelcontextprotocol/clientInfo: {…},
   io.modelcontextprotocol/clientCapabilities: {…} }`.
2. result → `{ content: [...], _meta: { echoed: { …the received _meta, traceparent intact… } } }`.

`traceparent`, `tracestate`, and `baggage` are reserved *bare* `_meta` keys — tracing reuses the
exact same envelope and code path as any other metadata. See [The \_meta Envelope](./meta.md) for how
the SDK assembles caller keys and reserved keys together.
