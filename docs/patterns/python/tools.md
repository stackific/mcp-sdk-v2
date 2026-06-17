# Tools

**Part IV · Server features** · Book Ch 13 · Stories S24–S25 · sidebar `/tools`

Tools are the model-controlled primitive. The server advertises them via `tools/list`
(each with a JSON Schema 2020-12 `inputSchema`), and the client invokes one with
`tools/call`. This pattern traces a single call from the demo SPA, through the Python MCP
client host, to the server and back.

## Round-trip

```
demo (ToolsPage)  ──REST POST /api/tools/call──▶  client host (FastAPI)
      ▲                                                  │ api.call_tool()
      │                                                  ▼
  ApiResultView                                stackific.mcp  Client
      │                                                  │ tools/call (JSON-RPC)
      └──────── JSON result ◀──── Streamable HTTP ───────┴──▶ MCP server (register_tool)
```

## 1 · Frontend — `demo/src/routes/tools.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

The page calls `backend.callTool(name, args)`, a thin wrapper that POSTs to the client host:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/tools.tsx
function doCall() {
  const parsed = JSON.parse(args || '{}');
  void call.run(() => backend.callTool(name, parsed));
}
// ...
<Button onClick={doCall}>Call tool</Button>
<ApiResultView result={call.data} />
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI route unwraps the REST body and delegates to the SDK `Client`:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
```

```python
# py-mcp-client/mcp_client.py
def call_tool(self, name: str, args: dict) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool(name, args))
```

The SDK's `call_tool` is the multi-round-trip driver: internally it calls
`request_with_input("tools/call", ...)`, so if the tool needs client input
(elicitation/sampling/roots), it fulfils the server's request and retries until the tool
completes (§11). For a plain tool, it behaves like a single `tools/call`.

## 3 · MCP server — `py-mcp-server/features.py`

The server registers each tool with a handler, metadata, a JSON Schema, and annotations:

```python
# py-mcp-server/features.py
server.register_tool(
  "echo",
  lambda args, ctx: {"content": [{"type": "text", "text": str(args.get("text", ""))}]},
  title="Echo",
  description="The simplest possible tool: echoes text back.",
  input_schema={"type": "object", "properties": {"text": {"type": "string", "description": "Text to echo back"}}, "required": ["text"]},
  annotations={"readOnlyHint": True, "idempotentHint": True, "openWorldHint": False},
)
```

## On the wire

1. `tools/list` → `{ tools: [{ name, inputSchema, annotations, ... }] }`
2. `tools/call` → `{ content: [{ type: 'text', text: '...' }] }`

A divide-by-zero (the `divide` tool) returns `isError: True` inside a **successful**
result — a *tool* error the model can recover from — not a JSON-RPC protocol error:

```python
# py-mcp-server/features.py
def divide(args: dict, ctx: ToolContext) -> dict:
  if args["b"] == 0:
    return {
      "content": [{"type": "text", "text": "Cannot divide by zero. Reported as isError:true so the model can recover."}],
      "isError": True,
    }
  return {"content": [{"type": "text", "text": str(args["a"] / args["b"])}]}
```

See [Errors](./errors.md) for the distinction.
