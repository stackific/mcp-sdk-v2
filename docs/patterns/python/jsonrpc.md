# JSON-RPC Framing

**Part I · Foundations** · Book Ch 3–4 · Stories S03–S04 · sidebar `/jsonrpc`

Every interaction rides inside a single JSON-RPC 2.0 object: a request carries `jsonrpc`, an
`id`, a `method`, and optional `params`; the matching response echoes that `id`. This pattern
sends a `ping` and traces the exact envelope from the page to the server and back.

## Round-trip

```
demo (JsonRpcPage)  ──POST /api/raw {method:'ping'}──▶  client host (FastAPI)
      ▲                                                    │ api.raw('ping')
      │                                                    ▼
  ApiResultView                                 stackific-mcp  Client
      │                                                    │ ping (JSON-RPC request, id)
      └──── EmptyResult ◀──── Streamable HTTP ─────────────┴──▶ MCP server (SDK dispatcher)
```

## 1 · Frontend — `demo/src/routes/jsonrpc.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared across every language; selecting **Python** only repoints the REST base
URL to the FastAPI client host (`http://localhost:8102`) — the page code is unchanged.

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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The generic passthrough route hands any `{method, params}` to the SDK via `api.raw`:

```python
# py-mcp-client/main.py
@app.post("/api/raw")
def api_raw(body: dict = Body(default={})) -> dict:
  return run(lambda: api.raw(body.get("method"), body.get("params") or {}))
```

```python
# py-mcp-client/mcp_client.py
def raw(self, method: str, params: dict) -> dict:
  return _with_trace(method, lambda: _state["client"].raw(method, params))
```

Every frame is *classified* by which members are present, then *tapped* to the debug bus — this
is the framing rule made visible (request = `method` + `id`; notification = `method`, no `id`;
response = `result` or `error`):

```python
# py-mcp-client/mcp_client.py
def _classify(message: dict) -> dict:
  """Map a JSON-RPC frame to its kind + a human summary (mirrors the TS wire view)."""
  if isinstance(message, dict):
    if "method" in message and "id" in message:
      return {"kind": "request", "method": message["method"], "id": message.get("id"), ...}
    if "method" in message:
      return {"kind": "notification", "method": message["method"], ...}
    if "result" in message:
      return {"kind": "response", "id": message.get("id"), ...}
    if "error" in message:
      err = message.get("error") or {}
      return {"kind": "error", "id": message.get("id"), ...}
  return {"kind": "note", "summary": "message"}
```

## 3 · MCP server — `py-mcp-server/main.py`

The server owns no framing of its own — the SDK's Streamable HTTP handler parses each request,
correlates the `id`, dispatches by `method`, and frames the response:

```python
# py-mcp-server/main.py
mcp_handler = create_asgi_mcp_handler(server)

@app.api_route("/mcp", methods=["GET", "POST", "OPTIONS"])
async def mcp(request: Request) -> Response:
  return await mcp_handler(request)
```

The SDK builds the outgoing request frame with the mandatory `jsonrpc` marker and a correlating
`id`, then merges the `_meta` envelope into `params`:

```python
# py-sdk/src/stackific/mcp/client/client.py
self._id += 1
request_id = self._id
# ...
message = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": {**rest, "_meta": envelope}}
```

## On the wire

1. `ping` request → `{ jsonrpc: "2.0", id, method: "ping", params: { _meta } }`
2. response → `{ jsonrpc: "2.0", id, result: { resultType: "complete" } }`

A success `result` sets the required `resultType` discriminator (an `EmptyResult` carries only
the base). The response echoes the request `id` with the same JSON type and value. The `_meta`
envelope on the request params is covered in [The _meta Envelope](./meta.md); the JSON value
rules in [JSON Value Model](./json-model.md).
