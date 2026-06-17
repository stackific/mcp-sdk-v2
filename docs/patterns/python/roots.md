# Roots

**Part V · Client features (MRTR)** · Book Ch 22 · Stories S32 · sidebar `/roots`

Roots reverse direction: *inside* a tool call the server asks the client for its workspace
roots. The server's `ctx.list_roots` surfaces at the client host as a `roots/list` request; the
host returns its configured roots and the list flows back so the tool resumes. This pattern
edits the roots the client will report, then calls `show_roots`. See [MRTR](./mrtr.md) for the
retry loop.

## Round-trip (reversed inside the call)

```
demo (RootsPage) ──REST POST /api/roots (setRoots)──▶  client host (FastAPI)  set_roots()
      ▲          ──REST POST /api/tools/call──────────▶        │ api.call_tool('show_roots')
      │                                                         ▼
      │                                        client.call_tool(...) ──tools/call──▶ MCP server
      │                                                         │                    ctx.list_roots()
      │                                                         │ ◀── roots/list ◀──────┘ (over the response stream)
      │                              set_request_handler('roots/list') ──▶ return { roots }
      └──────── { content } ◀── retried tools/call ◀── roots flow back, tool resumes
```

## 1 · Frontend — `demo/src/routes/roots.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

The page edits the roots JSON, saves it to the host, then calls the tool:

```ts
// demo/src/lib/api.ts
getRoots: () => getJson<{ roots: { uri: string; name?: string }[] }>('/api/roots'),
setRoots: (roots: { uri: string; name?: string }[]) =>
  postJson<{ roots: Any[] }>('/api/roots', { roots }),
```

```tsx
// demo/src/routes/roots.tsx
function saveRoots() {
  try {
    const parsed = JSON.parse(roots);
    void save.run(() => backend.setRoots(parsed));
  } catch {
    // invalid JSON — ignore
  }
}
// ...
<Button onClick={() => call.run(() => backend.callTool('show_roots', {}))} data-testid="run-roots">
  Call show_roots
</Button>
```

## 2 · MCP client host — `py-mcp-client/mcp_client.py` + `py-mcp-client/main.py`

The host registers a handler for the server→client `roots/list` request that simply returns the
configured roots:

```python
# py-mcp-client/mcp_client.py
def _handle_roots(_params: dict) -> dict:
  # ... emit a 'client returning configured roots' frame ...
  return {"roots": _state["roots"]}
# ...
client.set_request_handler("roots/list", _handle_roots)
```

`roots` is host state, seeded with defaults and editable over REST via `get_roots`/`set_roots`:

```python
# py-mcp-client/mcp_client.py
_DEFAULT_ROOTS = [
  {"uri": "file:///workspace/companion-project", "name": "companion-project"},
  {"uri": "file:///workspace/shared-lib", "name": "shared-lib"},
]
_state: dict = {"client": None, "transport": None, "roots": list(_DEFAULT_ROOTS)}
# ...
def get_roots() -> list[dict]:
  return _state["roots"]

def set_roots(roots: list[dict]) -> None:
  _state["roots"] = roots or []
```

```python
# py-mcp-client/main.py
@app.get("/api/roots")
def api_roots() -> dict:
  return {"roots": get_roots()}

@app.post("/api/roots")
def api_set_roots(body: dict = Body(default={})) -> dict:
  set_roots(body.get("roots") or [])
  return {"roots": get_roots()}
```

## 3 · MCP server — `py-mcp-server/features.py`

Inside the tool, `ctx.list_roots` issues the request back to the client and blocks until the
list returns:

```python
# py-mcp-server/features.py
def show_roots(args: dict, ctx: ToolContext) -> dict:
  import json
  result = ctx.list_roots()
  return {"content": [{"type": "text", "text": f"Client roots:\n{json.dumps(result.get('roots'), indent=2)}"}]}
```

## On the wire

1. `tools/call` (`show_roots`) → the server completes the response with an `input_required`
   result naming `roots/list`.
2. The client supplies its roots and **retries** `tools/call` with the same arguments plus the
   gathered `{ roots }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Client roots: [...]' }] }`.

Roots is a *deprecated* client capability — convey workspace locations via tool parameters or
resource URIs instead. [Elicitation](./elicitation.md) and [Sampling](./sampling.md) are the
other two client features riding this reversed loop.
