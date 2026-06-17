# Resources

**Part IV · Server features** · Book Ch 14 · Stories S26–S27 · sidebar `/resources`

Resources are the app-controlled primitive: data identified by an opaque URI that the client
reads. The server advertises them via `resources/list`, and the client fetches one with
`resources/read`. This pattern traces a list-then-read round-trip from the demo SPA through
the client host to the server and back.

## Round-trip

```
demo (ResourcesPage) ──REST GET /api/resources─────▶  client host (FastAPI)
      ▲              ──REST POST /api/resources/read─▶        │ api.list_resources() / api.read_resource(uri)
      │                                                       ▼
  ApiResultView                              stackific.mcp  Client
      │                                                       │ resources/list · resources/read (JSON-RPC)
      └──────── { resources } / { contents } ◀── Streamable HTTP ──┴──▶ MCP server (register_resource)
```

## 1 · Frontend — `demo/src/routes/resources.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

The page lists resources on mount, then reads the URI in the input box:

```ts
// demo/src/lib/api.ts
listResources: () => getJson<ApiResult<Any>>('/api/resources'),
readResource: (uri: string) => postJson<ApiResult<Any>>('/api/resources/read', { uri }),
```

```tsx
// demo/src/routes/resources.tsx
useEffect(() => {
  void list.run(() => backend.listResources());
}, []);
// ...
const resources = list.data?.ok ? (list.data.result.resources as any[]) : [];
// ...
<Button onClick={() => read.run(() => backend.readResource(uri))} data-testid="run-read">
  Read
</Button>
<ApiResultView result={read.data} />
```

An unresolvable URI surfaces as a `-32602` (Invalid params) protocol error — see
[Errors](./errors.md).

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI routes unwrap the REST body and delegate to the SDK `Client`:

```python
# py-mcp-client/main.py
@app.get("/api/resources")
def api_resources() -> dict:
  return run(api.list_resources)

@app.post("/api/resources/read")
def api_resources_read(body: dict = Body(default={})) -> dict:
  return run(lambda: api.read_resource(body.get("uri")))
```

```python
# py-mcp-client/mcp_client.py
def list_resources(self) -> dict:
  return _with_trace("resources/list", lambda: _state["client"].list_resources())
# ...
def read_resource(self, uri: str) -> dict:
  return _with_trace("resources/read", lambda: _state["client"].read_resource(uri))
```

## 3 · MCP server — `py-mcp-server/features.py`

The server registers a static resource against a fixed URI; the read handler returns its
`contents`:

```python
# py-mcp-server/features.py
server.register_resource(
  "readme",
  "docs://readme",
  lambda uri: {"contents": [{"uri": uri, "mimeType": "text/markdown", "text": "# Companion Server\n\nThis is a static MCP resource served over Streamable HTTP."}]},
  title="Readme",
  description="A static text resource.",
  mime_type="text/markdown",
)
```

## On the wire

1. `resources/list` → `{ resources: [{ uri, name, mimeType, ... }] }`
2. `resources/read` → `{ contents: [{ uri, mimeType, text }] }`

A URI pattern (with a `{variable}`) rather than a fixed URI is a
[Resource Template](./templates.md); the suggestions that fill the variable come from
[Completion](./completion.md).
