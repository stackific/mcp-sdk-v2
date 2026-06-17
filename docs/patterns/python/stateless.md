# Stateless Model

**Part I · Foundations** · Book Ch 4 · Stories S06 · sidebar `/stateless`

MCP V2 processes every request independently: everything needed to handle a request lives in
that request's own `_meta`, and nothing is remembered between requests. There is no
`Mcp-Session-Id` and no `initialize` — `server/discover` carries identity and capabilities, and
each request re-states the rest. This pattern shows the stateless transport and repeated discovery.

## Round-trip

```
demo (StatelessPage)  ──GET /api/status──▶  client host (FastAPI)
      ▲                                         │ get_status()
      │                                         ▼
  JsonBlock(status)                  stackific-mcp  Client + StreamableHttpClientTransport
      │                                         │ server/discover repeated, no session id
      └──── { serverUrl, negotiatedVersion } ◀──┴──▶ MCP server (stateless McpServer)
```

## 1 · Frontend — `demo/src/routes/stateless.tsx`

The demo SPA is shared across every language; selecting **Python** only repoints the REST base
URL to the FastAPI client host (`http://localhost:8102`) — the page code is unchanged.

The page reads status and surfaces that the server URL and version are derived per request, not
from session history:

```tsx
// demo/src/routes/stateless.tsx
<Button onClick={() => status.run(() => backend.status())}>Read status</Button>
// ...
<div className="text-slate-400">Server URL</div>
<div className="font-mono">{s.serverUrl ?? '—'}</div>
<div className="text-slate-400">Negotiated version</div>
<div className="font-mono">{s.negotiatedVersion ?? '—'}</div>
```

## 2 · MCP client host — `py-mcp-client/mcp_client.py`

The transport is a plain `StreamableHttpClientTransport` over a URL — no session handshake. The
`reconnect` path tears down and re-runs `server/discover` every time, proving each connection is
disposable:

```python
# py-mcp-client/mcp_client.py
def _build_client() -> Client:
  transport = StreamableHttpClientTransport(MCP_SERVER_URL)
  client = Client(transport, CLIENT_INFO, capabilities=CLIENT_CAPABILITIES)
  # ...
  return client
# ...
def ensure_connected() -> Client:
  # ...
  client = _build_client()
  client.discover()  # re-establishes identity/version with no session state
```

```python
# py-mcp-client/mcp_client.py
def reconnect() -> None:
  """Tear down any existing connection and connect fresh, driving a visible discover."""
  with _connect_lock:
    old = _state.get("transport")
    if old is not None:
      old.close()
    _state["client"] = None
    _state["transport"] = None
  client = ensure_connected()
  with _trace_scope("reconnect"):
    client.discover()  # drives a fresh server/discover
```

## 3 · MCP server — `py-mcp-server/main.py` + `py-mcp-server/features.py`

The server is mounted as a stateless Streamable HTTP handler; the same FastAPI app keeps no
per-connection state, so any two requests behave identically:

```python
# py-mcp-server/main.py
# Stateless Streamable HTTP, protocol 2026-07-28.
server = build_companion_server()
mcp_handler = create_asgi_mcp_handler(server)

@app.api_route("/mcp", methods=["GET", "POST", "OPTIONS"])
async def mcp(request: Request) -> Response:
  return await mcp_handler(request)
```

`build_companion_server` constructs a fresh `McpServer` whose only state is its registered
features — the request itself supplies identity, version, and capabilities each time:

```python
# py-mcp-server/features.py
def build_companion_server() -> McpServer:
  server = McpServer(
    {"name": "companion-mcp-server", "title": "Companion MCP Server", "version": "0.1.0"},
    { ... },  # capabilities
    value_validator=_validator,
  )
  # ...registers tools/resources/prompts only — no session bookkeeping...
  return server
```

## On the wire

1. `server/discover` → identity + capabilities + revision (replaces `initialize`; no session created)
2. every later request carries `_meta` → `{ io.modelcontextprotocol/protocolVersion, clientInfo, clientCapabilities }`

No `Mcp-Session-Id` header is required for protocol state — a server may serve any two requests
on the same connection from different instances with identical behavior. Genuine cross-call
continuity is explicit, via server-minted opaque handles (a pagination `nextCursor`, an
`io.modelcontextprotocol/related-task`). The per-request envelope is [The _meta Envelope](./meta.md);
discovery is [Overview & Discovery](./overview.md).
