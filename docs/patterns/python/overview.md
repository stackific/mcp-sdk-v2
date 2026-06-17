# Overview & Discovery

**Part I · Foundations** · Book Ch 9–11 · Stories S07–S09 · sidebar `/`

Discovery is the single round-trip that replaces the old `initialize` handshake. The client
sends `server/discover`; the server answers with its identity, capabilities, and supported
revisions — and the client caches the negotiated version for the status panel. This pattern
traces that round-trip from the landing page through the Python MCP client host to the server.

## Round-trip

```
demo (OverviewPage)  ──REST GET /api/discover──▶  client host (FastAPI)
      ▲                                                 │ api.discover()
      │                                                 ▼
  ApiResultView                              stackific-mcp  Client
      │                                                 │ server/discover (JSON-RPC)
      └──────── { discoverResult, status } ◀─ Streamable HTTP ─┴──▶ MCP server (McpServer ctor)
```

## 1 · Frontend — `demo/src/routes/overview.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared across every language; selecting **Python** only repoints the REST base
URL to the FastAPI client host (`http://localhost:8102`) — the page code is unchanged.

On mount the page (re)connects, then a button drives a visible `server/discover`:

```tsx
// demo/src/routes/overview.tsx
useEffect(() => {
  void connect.run(() => backend.connect());
}, []);
// ...
<Button onClick={() => discover.run(() => backend.discover())}>Call server/discover</Button>
<ApiResultView result={discover.data} />
```

Both calls are thin REST wrappers onto the client host:

```ts
// demo/src/lib/api.ts
connect: () => postJson<ApiResult<BackendStatus>>('/api/connect', {}),
discover: () => getJson<ApiResult<Any>>('/api/discover'),
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI routes delegate to `reconnect()` (always a fresh discover) and `api.discover()`:

```python
# py-mcp-client/main.py
@app.post("/api/connect")
def api_connect() -> dict:
  return run(lambda: (reconnect(), get_status())[1])
# ...
@app.get("/api/discover")
def api_discover() -> dict:
  return run(api.discover)
```

`ensure_connected` builds the transport and `Client`, connects, then runs the first
`server/discover`; `get_status` exposes the negotiated version and server identity it cached:

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
  client.discover()  # populates negotiated revision + server identity
```

```python
# py-mcp-client/mcp_client.py
def discover(self) -> dict:
  def run() -> dict:
    client = _state["client"]
    discover_result = None
    discover_error = None
    try:
      discover_result = client.discover()  # server/discover is the 2026-07-28 entry point
    except Exception as exc:  # noqa: BLE001
      discover_error = {"message": getattr(exc, "message", "discovery failed"), "code": getattr(exc, "code", None)}
    return {"discoverResult": discover_result, "discoverError": discover_error, "status": get_status()}

  return _with_trace("discover", run)
```

## 3 · MCP server — `py-mcp-server/features.py`

The constructor is the whole story: its first argument is the server identity and its second
is the capabilities object — exactly the two things `server/discover` returns:

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

1. `server/discover` → `{ resultType: "complete", supportedVersions, capabilities, serverInfo, instructions? }`

`serverInfo` is the `Implementation` from the constructor's first argument; `capabilities` is
the second. The SDK caches the negotiated revision + identity in `Client.discover()` so
[Capabilities](./capabilities.md) and [Foundations](./foundations.md) can read them back
without another round-trip. See [Stateless Model](./stateless.md) for why `server/discover` —
not a session — carries this.
