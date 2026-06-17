# Transport & HTTP

**Part II · Base protocol** · Book Ch 7–9 · Stories S12–S15 · sidebar `/transport`

The transport is the byte-carrying substrate: it frames, delivers, and tears down JSON-RPC
messages without interpreting them. This pattern probes the **Streamable HTTP** transport —
a single MCP endpoint reached over HTTP — and surfaces the request headers the client sent,
the HTTP status the server returned, and the response headers (content type, negotiated
protocol version, and the session id, which under the stateless model must be absent).

## Round-trip

```
demo (TransportPage) ──REST GET /api/transport/probe──▶  client host (FastAPI)
      ▲                                                        │ transport_probe()
      │                                                        ▼
  status + headers                                    raw POST initialize
      │                                                        │ (one JSON-RPC message)
      └──── { status, requestHeaders, responseHeaders } ◀──── Streamable HTTP ──▶ MCP server
                                                                                  (create_asgi_mcp_handler)
```

## 1 · Frontend — `demo/src/routes/transport.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA; selecting **Python** on the home page repoints
`backend.*` at the Python client host, so this layer is byte-for-byte identical to the
TypeScript pattern.

The page calls `backend.transportProbe()`, which GETs the probe endpoint on the client host:

```ts
// demo/src/lib/api.ts
transportProbe: () => getJson<ApiResult<Any>>('/api/transport/probe'),
```

The result reports the HTTP status, and renders the negotiated protocol version plus a badge
that confirms there is **no** `Mcp-Session-Id` — the conforming stateless behavior:

```tsx
// demo/src/routes/transport.tsx
<Button onClick={() => call.run(() => backend.transportProbe())}>Probe transport</Button>
// ...
<Badge variant={statusOk ? 'green' : 'red'}>
  {probe.status} {probe.statusText}
</Badge>
{probe.negotiatedVersion ? (
  <Badge variant="slate">MCP-Protocol-Version: {probe.negotiatedVersion}</Badge>
) : null}
<Badge variant={probe.sessionId ? 'amber' : 'slate'}>
  {probe.sessionId ? `Mcp-Session-Id: ${probe.sessionId}` : 'no Mcp-Session-Id (stateless)'}
</Badge>
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/transport.py`

The FastAPI route delegates to `transport_probe`, a *raw* Streamable HTTP exchange kept out
of the SDK `Client` so it can expose the verbatim wire headers and status:

```python
# py-mcp-client/main.py
@app.get("/api/transport/probe")
def api_transport_probe() -> dict:
  return run(transport_probe)
```

`transport_probe` POSTs a single `initialize` message (via `httpx`) with the three required
headers, then reports the status and both header sets. Note there is no session header on the
way out and none expected back:

```python
# py-mcp-client/transport.py
def transport_probe() -> dict:
  """POST a minimal ``initialize`` and report the request/response headers + status."""
  request_headers = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28",
  }
  body = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {"protocolVersion": "2026-07-28", "capabilities": {}, "clientInfo": {"name": "transport-probe", "version": "0"}},
  }
  resp = httpx.post(MCP_SERVER_URL, headers=request_headers, json=body, timeout=10.0)
  # ...
  return {
    "url": MCP_SERVER_URL,
    "method": "POST",
    "requestHeaders": request_headers,
    "status": resp.status_code,
    "statusText": resp.reason_phrase,
    "contentType": resp.headers.get("content-type"),
    "sessionId": resp.headers.get("mcp-session-id"),
    "negotiatedVersion": resp.headers.get("mcp-protocol-version"),
    "responseHeaders": response_headers,
  }
```

`accept` lists **both** `application/json` and `text/event-stream`: the server may answer a
request either as a single JSON object or as an SSE stream, and the client must accept either.

## 3 · MCP server — `py-mcp-server/main.py`

The whole transport is one handler: the SDK's `create_asgi_mcp_handler` wraps the companion
server, and a single FastAPI route binds it to `/mcp` for every verb. It frames each POST,
dispatches the JSON-RPC message, and answers GET/OPTIONS through the same handler — there is
no session lifecycle and no separate GET stream:

```python
# py-mcp-server/main.py
server = build_companion_server()
mcp_handler = create_asgi_mcp_handler(server)

app = FastAPI(title="py-mcp-server")


@app.api_route("/mcp", methods=["GET", "POST", "OPTIONS"])
async def mcp(request: Request) -> Response:
  """Hand the HTTP request to the SDK's Streamable HTTP handler and relay its response."""
  return await mcp_handler(request)
```

The server is **stateless Streamable HTTP, protocol 2026-07-28**: it mints no session id,
requires none, and echoes none.

## On the wire

```
POST /mcp
content-type: application/json
accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28

→ 200  content-type: application/json   (single JSON object — no Mcp-Session-Id)
```

Status maps protocol conditions: **200** for a request answer (single JSON object *or* an SSE
stream), **202** for an accepted notification or client response, **404** for an unknown path,
and **405** for GET/DELETE or any non-POST verb. A missing/invalid required header or `_meta`
violation is rejected with **400** (`-32001` / `-32602`); an unknown JSON-RPC *method* yields
`-32601`. The absence of `Mcp-Session-Id` is the expected, conforming result of the stateless
model.
