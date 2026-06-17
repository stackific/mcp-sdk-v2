# Prompts

**Part IV · Server features** · Book Ch 16 · Stories S28 · sidebar `/prompts`

Prompts are the user-controlled primitive: reusable, server-authored message templates a user
invokes by name with arguments. The server advertises them via `prompts/list`, and the client
expands one with `prompts/get` into messages ready to feed to a model. This pattern lists the
prompts and expands `greeting` with `name` and `language`.

## Round-trip

```
demo (PromptsPage) ──REST GET /api/prompts──────▶  client host (FastAPI)
      ▲            ──REST POST /api/prompts/get──▶        │ api.list_prompts()
      │              { name: 'greeting', arguments }       │ api.get_prompt('greeting', args)
      │                                                    ▼
  ApiResultView                            stackific.mcp  Client
      │                                                    │ prompts/list · prompts/get (JSON-RPC)
      └──────── { prompts } / { messages } ◀── Streamable HTTP ──┴──▶ MCP server (register_prompt)
```

## 1 · Frontend — `demo/src/routes/prompts.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

The page lists prompts on mount, then gets `greeting` with the two argument inputs:

```ts
// demo/src/lib/api.ts
listPrompts: () => getJson<ApiResult<Any>>('/api/prompts'),
getPrompt: (name: string, args: Record<string, string>) =>
  postJson<ApiResult<Any>>('/api/prompts/get', { name, arguments: args }),
```

```tsx
// demo/src/routes/prompts.tsx
const prompts = list.data?.ok ? (list.data.result.prompts as any[]) : [];
// ...
<Button
  onClick={() => get.run(() => backend.getPrompt('greeting', { name: pname, language: lang }))}
  data-testid="run-prompt"
>
  Get prompt
</Button>
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI routes delegate to the SDK `Client`:

```python
# py-mcp-client/main.py
@app.get("/api/prompts")
def api_prompts() -> dict:
  return run(api.list_prompts)

@app.post("/api/prompts/get")
def api_prompts_get(body: dict = Body(default={})) -> dict:
  return run(lambda: api.get_prompt(body.get("name"), body.get("arguments") or {}))
```

```python
# py-mcp-client/mcp_client.py
def list_prompts(self) -> dict:
  return _with_trace("prompts/list", lambda: _state["client"].list_prompts())
# ...
def get_prompt(self, name: str, args: dict) -> dict:
  return _with_trace(f"prompts/get:{name}", lambda: _state["client"].get_prompt(name, args))
```

## 3 · MCP server — `py-mcp-server/features.py`

`register_prompt` declares the `arguments` list (each optionally `required` or `complete`-able);
the handler renders the `messages`:

```python
# py-mcp-server/features.py
server.register_prompt(
  "greeting",
  lambda args: {"messages": [{"role": "user", "content": {"type": "text", "text": f"Greet {args.get('name')} warmly in {args.get('language', 'english')}."}}]},
  title="Greeting",
  description="A reusable, user-invoked prompt with a completable argument.",
  arguments=[
    {"name": "name", "required": True, "description": "Who to greet"},
    {"name": "language", "description": "Language", "complete": lambda v: [lng for lng in ("english", "spanish", "norwegian", "japanese") if lng.startswith(v.lower())]},
  ],
)
```

## On the wire

1. `prompts/list` → `{ prompts: [{ name, description, arguments: [...] }] }`
2. `prompts/get` → `{ messages: [{ role, content: { type: 'text', text } }] }`

The `complete` callback on the `language` argument drives [Completion](./completion.md) —
typing into that argument asks the server for matching language names.
