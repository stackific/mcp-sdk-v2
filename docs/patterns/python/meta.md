# The _meta Envelope

**Part I · Foundations** · Book Ch 4 · Stories S05 · sidebar `/meta`

`_meta` is the open, string-keyed extension envelope that may ride on any request params,
notification params, or result. The SDK stamps three required `io.modelcontextprotocol/*` keys
on every request; callers may add their own namespaced keys. This pattern sends a custom `_meta`
to the `echo_trace` tool, which echoes back exactly what the server received.

## Round-trip

```
demo (MetaPage)  ──POST /api/tools/call-traced──▶  client host (FastAPI)
      ▲                                               │ api.call_tool_with_meta('echo_trace', {}, meta)
      │                                               ▼
  JsonBlock (echoed)                       stackific-mcp  Client (stamps _meta)
      │                                               │ tools/call (JSON-RPC)
      └──────── result._meta.echoed ◀── Streamable HTTP ─┴──▶ MCP server (echo_trace → ctx.meta)
```

## 1 · Frontend — `demo/src/routes/meta.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared across every language; selecting **Python** only repoints the REST base
URL to the FastAPI client host (`http://localhost:8102`) — the page code is unchanged.

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

## 2 · MCP client host — `py-mcp-client/mcp_client.py`

The host forwards the caller's `_meta` verbatim; the SDK then merges in the three required keys.
The capabilities it stamps are this client's single source of truth:

```python
# py-mcp-client/mcp_client.py
# The capabilities this client declares in every request's _meta. (Single source of truth.)
CLIENT_CAPABILITIES = {"elicitation": {"form": {}, "url": {}}, "sampling": {}, "roots": {}, "tasks": {}}
CLIENT_INFO = {"name": "companion-mcp-client", "title": "Companion MCP Client", "version": "0.1.0"}
# ...
def call_tool_with_meta(self, name: str, args: dict, meta: dict) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool_with_meta(name, args, meta))
```

The SDK's `request` is where the envelope is assembled — caller keys first (plus any
`meta_extra`), then the three reserved keys (protocol version, client identity, client
capabilities) take precedence:

```python
# py-sdk/src/stackific/mcp/client/client.py
def _meta(self) -> dict:
  """Build the REQUIRED per-request ``_meta`` envelope for this request (§4.3)."""
  return {
    PROTOCOL_VERSION_META_KEY: self.protocol_version(),
    CLIENT_INFO_META_KEY: self.client_info,
    CLIENT_CAPABILITIES_META_KEY: self.capabilities,
  }
# ...
caller_meta = (params or {}).get("_meta") or {}
envelope = {**caller_meta, **(meta_extra or {}), **self._meta()}
```

The three reserved request keys are pinned constants:

```python
# py-sdk/src/stackific/mcp/protocol/meta.py
PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion"
CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo"
CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities"
```

## 3 · MCP server — `py-mcp-server/features.py`

`echo_trace` simply returns the `_meta` the tool context received — including the reserved keys
and any custom ones — proving arbitrary metadata travelled alongside the message:

```python
# py-mcp-server/features.py
def echo_trace(args: dict, ctx: ToolContext) -> dict:
  import json

  return {"content": [{"type": "text", "text": f"Server received _meta:\n{json.dumps(ctx.meta or {}, indent=2)}"}], "_meta": {"echoed": ctx.meta or {}}}

server.register_tool(
  "echo_trace",
  echo_trace,
  title="Echo Trace Context",
  description="Echoes back the _meta the server received (incl. traceparent/tracestate).",
)
```

## On the wire

1. `tools/call` (params `_meta`) → `{ "companion/note": "custom key", "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {…}, "io.modelcontextprotocol/clientCapabilities": {…} }`
2. result → `{ content: [...], _meta: { echoed: { …the received _meta… } } }`

Each key is either a reverse-DNS prefix ending in `/` plus a name, or one of four reserved bare
keys (`progressToken`, `traceparent`, `tracestate`, `baggage`). The `io.modelcontextprotocol/`
prefix is protocol-reserved; third parties use their own. Receivers never reject a message for
unrecognized keys — see [JSON Value Model](./json-model.md). The required keys also drive
[Capabilities](./capabilities.md) negotiation.
