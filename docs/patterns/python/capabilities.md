# Capabilities

**Part I · Foundations** · Book Ch 10 · Stories S10 · sidebar `/capabilities`

Capabilities are the two declaration objects — `ClientCapabilities` and `ServerCapabilities` —
that tell each peer which method families and behaviors the other supports. A feature is usable
only when both sides declare its governing capability. This pattern reads the live status and
shows both objects side by side.

## Round-trip

```
demo (CapabilitiesPage)  ──GET /api/status──▶  client host (FastAPI)
      ▲                                            │ get_status()
      │                                            ▼
  JsonBlock × 2                        stackific-mcp  Client
      │                                            │ client caps stamped per request; server caps from discover
      └── { clientCapabilities, serverCapabilities } ◀──┴──▶ MCP server (McpServer ctor caps)
```

## 1 · Frontend — `demo/src/routes/capabilities.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared across every language; selecting **Python** only repoints the REST base
URL to the FastAPI client host (`http://localhost:8102`) — the page code is unchanged.

The page fetches status and renders what each side declared:

```tsx
// demo/src/routes/capabilities.tsx
<Button onClick={() => status.run(() => backend.status())}>Load capabilities</Button>
// ...
<p>clientCapabilities</p>
<JsonBlock value={s.clientCapabilities ?? {}} />
<p>serverCapabilities</p>
<JsonBlock value={s.serverCapabilities ?? {}} />
```

```ts
// demo/src/lib/api.ts
status: () => getJson<BackendStatus>('/api/status'),
```

## 2 · MCP client host — `py-mcp-client/mcp_client.py`

The client declares `CLIENT_CAPABILITIES` once and stamps them into every request's `_meta`;
`get_status` returns them alongside what the latest `server/discover` advertised:

```python
# py-mcp-client/mcp_client.py
CLIENT_CAPABILITIES = {"elicitation": {"form": {}, "url": {}}, "sampling": {}, "roots": {}, "tasks": {}}
# ...
def get_status() -> dict:
  client = _state["client"]
  if client is None:
    return {"connected": False, ..., "clientCapabilities": CLIENT_CAPABILITIES, ...}
  status = client.status()
  return {**status, "clientCapabilities": CLIENT_CAPABILITIES, "roots": _state["roots"], "serverUrl": MCP_SERVER_URL}
```

The SDK's `Client.status()` is the source of `serverCapabilities` — what the latest
`server/discover` cached:

```python
# py-sdk/src/stackific/mcp/client/client.py
def status(self) -> dict:
  caps = self.server_capabilities or {}
  return {
    "connected": self.connected,
    "negotiatedVersion": self.negotiated_version,
    "serverInfo": self.server_info,
    "serverCapabilities": self.server_capabilities,
    "serverExtensions": caps.get("extensions"),
    "clientCapabilities": self.capabilities,
    "instructions": self.instructions,
  }
```

## 3 · MCP server — `py-mcp-server/features.py`

The constructor's second argument *is* `ServerCapabilities` — the exact object discovery
returns. Sub-flags like `tools.listChanged` refine a capability without replacing it:

```python
# py-mcp-server/features.py
server = McpServer(
  {"name": "companion-mcp-server", "title": "Companion MCP Server", "version": "0.1.0"},
  {
    "logging": {},
    "completions": {},
    "tools": {"listChanged": True},
    "resources": {"listChanged": True},
    "prompts": {"listChanged": True},
    "tasks": {"list": {}, "cancel": {}, "requests": {"tools": {"call": {}}}},
  },
  value_validator=_validator,
)
```

## On the wire

1. `server/discover` result → `{ capabilities: { logging: {}, completions: {}, tools: { listChanged: true }, … } }`
2. every client request `_meta` → `{ io.modelcontextprotocol/clientCapabilities: { elicitation: {…}, sampling: {}, roots: {}, tasks: {} } }`

The mere presence of a field declares support; empty `{}` is valid and declares no optional
behaviors. The client caches server capabilities from the latest [discover](./overview.md);
the server re-reads client capabilities from each request's [`_meta`](./meta.md). When a request
needs an undeclared client capability the SDK builds a `-32003` error
(`build_missing_capability_error`). The `tasks` entry is an extension capability — see
[Extensions Map](./extensions.md).
