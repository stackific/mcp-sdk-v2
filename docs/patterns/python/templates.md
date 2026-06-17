# Resource Templates

**Part IV · Server features** · Book Ch 15 · Stories S26 · sidebar `/templates`

A resource template is a URI *pattern* (RFC 6570) rather than a fixed URI. The server
advertises it via `resources/templates/list`; the client fills the template's variables and
reads the resulting concrete URI with the ordinary `resources/read`. This pattern lists the
`weather://{city}/current` template and reads `weather://oslo/current`.

## Round-trip

```
demo (TemplatesPage) ──REST GET /api/resource-templates─▶  client host (FastAPI)
      ▲              ──REST POST /api/resources/read──────▶        │ api.list_resource_templates()
      │                expand {city} → weather://oslo/current       │ api.read_resource(uri)
      │                                                            ▼
  ApiResultView                                  stackific.mcp  Client
      │                                                            │ resources/templates/list · resources/read
      └──── { resourceTemplates } / { contents } ◀── Streamable HTTP ──┴──▶ MCP server (register_resource_template)
```

## 1 · Frontend — `demo/src/routes/templates.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

The page lists templates on mount, then expands `{city}` client-side and reads the concrete
URI — note there is no special "read template" call; it is the same `readResource` as a plain
[Resource](./resources.md):

```ts
// demo/src/lib/api.ts
listResourceTemplates: () => getJson<ApiResult<Any>>('/api/resource-templates'),
readResource: (uri: string) => postJson<ApiResult<Any>>('/api/resources/read', { uri }),
```

```tsx
// demo/src/routes/templates.tsx
const templates = list.data?.ok ? (list.data.result.resourceTemplates as any[]) : [];
const uri = `weather://${city}/current`;
// ...
<Button onClick={() => read.run(() => backend.readResource(uri))} data-testid="run-template-read">
  Read templated resource
</Button>
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The list route has its own endpoint; the read route is shared with plain resources:

```python
# py-mcp-client/main.py
@app.get("/api/resource-templates")
def api_resource_templates() -> dict:
  return run(api.list_resource_templates)
```

```python
# py-mcp-client/mcp_client.py
def list_resource_templates(self) -> dict:
  return _with_trace("resources/templates/list", lambda: _state["client"].list_resource_templates())
# ...
def read_resource(self, uri: str) -> dict:
  return _with_trace("resources/read", lambda: _state["client"].read_resource(uri))
```

## 3 · MCP server — `py-mcp-server/features.py`

`register_resource_template` takes the `uri_template` plus a per-variable `complete` callback;
the handler receives the resolved `variables`:

```python
# py-mcp-server/features.py
cities = ["oslo", "tokyo", "cairo", "lima", "quito", "osaka"]
server.register_resource_template(
  "city-weather",
  "weather://{city}/current",
  lambda uri, variables: {"contents": [{"uri": uri, "mimeType": "application/json", "text": _json.dumps({"city": variables["city"], "tempC": 21, "conditions": "sunny"}, indent=2)}]},
  title="City Weather (template)",
  description="A templated resource with argument completion.",
  mime_type="application/json",
  complete={"city": lambda v: [c for c in cities if c.startswith(v.lower())]},
)
```

## On the wire

1. `resources/templates/list` → `{ resourceTemplates: [{ uriTemplate, name, mimeType, ... }] }`
2. `resources/read` (with the expanded URI) → `{ contents: [{ uri, mimeType, text }] }`

The `complete={"city": ...}` callback above is what powers [Completion](./completion.md) for
the template's variable — type into the variable and the server suggests matching city names.
