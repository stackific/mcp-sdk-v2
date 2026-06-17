# Completion

**Part IV · Server features** · Book Ch 17 · Stories S29 · sidebar `/completion`

`completion/complete` is server-driven autocomplete for [prompt](./prompts.md) arguments and
[resource-template](./templates.md) variables. The client sends a `ref` (which prompt or
template), the `argument` being typed, and optional `context`; the server returns matching
`values`. This pattern types into the `language` argument of the `greeting` prompt and shows
the suggestions.

## Round-trip

```
demo (CompletionPage) ──REST POST /api/complete──▶  client host (FastAPI)
      ▲     { ref, argument: { name:'language', value }, context }   │ api.complete(ref, argument, context)
      │                                                              ▼
  Badge values[]                                stackific.mcp  Client
      │                                                              │ completion/complete (JSON-RPC)
      └──────── { completion: { values } } ◀──── Streamable HTTP ────┴──▶ MCP server (complete callback)
```

## 1 · Frontend — `demo/src/routes/completion.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

Each keystroke calls `backend.complete` with a `ref/prompt` reference and the partial value:

```ts
// demo/src/lib/api.ts
complete: (ref: unknown, argument: unknown, context?: unknown) =>
  postJson<ApiResult<Any>>('/api/complete', { ref, argument, context }),
```

```tsx
// demo/src/routes/completion.tsx
async function suggest(v: string) {
  setValue(v);
  await complete.run(() =>
    backend.complete(
      { type: 'ref/prompt', name: 'greeting' },
      { name: 'language', value: v },
      { arguments: {} },
    ),
  );
}
// ...
const values: string[] = complete.data?.ok ? (complete.data.result.completion?.values ?? []) : [];
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI route forwards `ref`/`argument`/`context` straight to the SDK `Client`:

```python
# py-mcp-client/main.py
@app.post("/api/complete")
def api_complete(body: dict = Body(default={})) -> dict:
  return run(lambda: api.complete(body.get("ref"), body.get("argument"), body.get("context")))
```

```python
# py-mcp-client/mcp_client.py
def complete(self, ref: object, argument: object, context: object | None = None) -> dict:
  return _with_trace("completion/complete", lambda: _state["client"].complete(ref, argument, context))
```

## 3 · MCP server — `py-mcp-server/features.py`

There is no separate `register_completion`: a completer is just a `complete` callback declared
*inline* on the thing being completed. For the `city-weather` template it lives on the `city`
variable:

```python
# py-mcp-server/features.py
cities = ["oslo", "tokyo", "cairo", "lima", "quito", "osaka"]
server.register_resource_template(
  "city-weather",
  "weather://{city}/current",
  # ...
  complete={"city": lambda v: [c for c in cities if c.startswith(v.lower())]},
)
```

For the `greeting` prompt it lives on the `language` argument (the one the page above drives):

```python
# py-mcp-server/features.py
{"name": "language", "description": "Language", "complete": lambda v: [lng for lng in ("english", "spanish", "norwegian", "japanese") if lng.startswith(v.lower())]},
```

## On the wire

`completion/complete` with `{ ref: { type: 'ref/prompt', name }, argument: { name, value } }`
→ `{ completion: { values: ['english', ...], total, hasMore } }`. The server's `completions`
capability (declared at construction) is what advertises that the method exists.
