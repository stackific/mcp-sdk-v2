# Protocol Foundations

**Part I · Foundations** · Book Ch 1 · Stories S01 · sidebar `/foundations`

MCP is a JSON-RPC 2.0 protocol with a single current revision — `2026-07-28` — defined around
three roles: host, client, and server. This pattern shows how the revision is negotiated and
how the server's `Implementation` descriptor reaches the page, with no `initialize` handshake.

## Round-trip

```
demo (FoundationsPage)  ──GET /api/discover, /api/status──▶  client host (FastAPI)
      ▲                                                          │ api.discover()
      │                                                          ▼
  { negotiatedVersion, serverInfo }                  stackific-mcp  Client
      │                                                          │ server/discover (JSON-RPC)
      └────────── revision + serverInfo ◀── Streamable HTTP ─────┴──▶ MCP server (McpServer ctor)
```

## 1 · Frontend — `demo/src/routes/foundations.tsx`

The demo SPA is shared across every language; selecting **Python** only repoints the REST base
URL to the FastAPI client host (`http://localhost:8102`) — the page code is unchanged.

Pressing Run issues `server/discover`, then reads back the negotiated revision and server
identity exactly as cached from the wire:

```tsx
// demo/src/routes/foundations.tsx
onClick={() =>
  status.run(async () => {
    await backend.discover();
    return backend.status();
  })
}
// ...
<Badge variant="blue">revision: {s.negotiatedVersion ?? 'none'}</Badge>
<JsonBlock value={{ negotiatedVersion: s.negotiatedVersion, serverInfo: s.serverInfo }} />
```

## 2 · MCP client host — `py-mcp-client/mcp_client.py`

The client is constructed with a fixed `CLIENT_INFO` — its on-the-wire `Implementation` — and
exposes the negotiated revision after discovery:

```python
# py-mcp-client/mcp_client.py
CLIENT_INFO = {"name": "companion-mcp-client", "title": "Companion MCP Client", "version": "0.1.0"}
# ...
bus.emit_frame({"dir": "local", "kind": "lifecycle", "summary": f"connected — protocol {client.negotiated_version or 'unknown'}"})
```

`get_status` surfaces the negotiated version and the server's identity that `discover()` cached:

```python
# py-mcp-client/mcp_client.py
def get_status() -> dict:
  client = _state["client"]
  if client is None:
    return {"connected": False, "negotiatedVersion": None, "serverInfo": None, ...}
  status = client.status()
  return {**status, "clientCapabilities": CLIENT_CAPABILITIES, "roots": _state["roots"], "serverUrl": MCP_SERVER_URL}
```

The SDK's `Client.status()` is the source of those `negotiatedVersion` / `serverInfo` fields:

```python
# py-sdk/src/stackific/mcp/client/client.py
def status(self) -> dict:
  caps = self.server_capabilities or {}
  return {
    "connected": self.connected,
    "negotiatedVersion": self.negotiated_version,
    "serverInfo": self.server_info,
    # ...
  }
```

## 3 · MCP server — `py-mcp-server/features.py` + `py-mcp-server/main.py`

The server identity comes straight from the constructor's first argument; the entry point
fixes the revision and the stateless Streamable HTTP transport:

```python
# py-mcp-server/features.py
server = McpServer(
  {"name": "companion-mcp-server", "title": "Companion MCP Server", "version": "0.1.0"},
  { ... },  # capabilities
  value_validator=_validator,
)
```

```python
# py-mcp-server/main.py
# Stateless Streamable HTTP, protocol 2026-07-28.
server = build_companion_server()
mcp_handler = create_asgi_mcp_handler(server)

@app.api_route("/mcp", methods=["GET", "POST", "OPTIONS"])
async def mcp(request: Request) -> Response:
  return await mcp_handler(request)
```

The SDK pins the revision as a single constant; identifiers are opaque, exact-matched strings:

```python
# py-sdk/src/stackific/mcp/protocol/meta.py
#: The protocol revision supported by this SDK release. (§5)
CURRENT_PROTOCOL_VERSION = "2026-07-28"
```

## On the wire

1. `server/discover` → `{ resultType: "complete", supportedVersions: ["2026-07-28"], serverInfo, capabilities }`

The negotiated revision is established by [discovery](./overview.md), not a handshake. Every
client request also restates the revision in its [`_meta`](./meta.md) envelope, which is what
makes the server [stateless](./stateless.md).
