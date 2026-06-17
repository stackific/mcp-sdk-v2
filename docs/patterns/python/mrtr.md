# Multi-Round-Trip

**Part III · Lifecycle** · Book Ch 11 · Stories S17 · sidebar `/mrtr`

A multi-round-trip request (MRTR) is the single protocol-wide mechanism by which a server
gathers client-only input *while processing a request*. Instead of opening an independent
server-to-client request, the server completes the in-flight response with an
`input_required` result naming what it needs; the client fulfils it locally and **retries the
same method** with the same arguments plus the gathered responses and the verbatim
`requestState`. This pattern drives that loop with the `summarize` tool, whose handler asks
the client to run a model mid-call.

## Round-trip

```
demo (MrtrPage) ──REST POST /api/tools/call──▶  client host (FastAPI)
      ▲                                               │ api.call_tool('summarize')
      │                                               ▼
  ApiResultView                          client.call_tool(...) (SDK MRTR driver)
      │                                               │ tools/call ──▶ MCP server
      │                                               │ ◀── input_required (sampling/createMessage)
      │                          run model, re-call   │ tools/call + inputResponses + requestState ──▶
      └──────── final result ◀──── complete ◀─────────┘                              (handler resumes)
```

## 1 · Frontend — `demo/src/routes/mrtr.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA; selecting **Python** on the home page repoints
`backend.*` at the Python client host, so this layer is byte-for-byte identical to the
TypeScript pattern.

The page calls `backend.callTool('summarize', …)` — an ordinary tool call. The MRTR loop is
invisible from here; the SPA only sees the final result:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/mrtr.tsx
onClick={() =>
  call.run(() =>
    backend.callTool('summarize', {
      text: 'The Model Context Protocol connects AI apps to tools and data over one wire protocol.',
    }),
  )
}
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI route delegates to `api.call_tool`. It is a plain `def`, so FastAPI runs it in a
worker thread — essential here, because the MRTR fulfilment handlers (elicitation especially)
BLOCK while waiting on the user, and blocking the event loop would freeze the whole host:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
```

`call_tool` routes through `client.call_tool` — the SDK's MRTR **driver** — wrapped in
`_with_trace` so every frame of the loop is grouped under one wire trace. When the tool emits
an `input_required` result, the driver fulfils it using the request handlers registered on the
`Client` and retries until the tool completes:

```python
# py-mcp-client/mcp_client.py
def call_tool(self, name: str, args: dict) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool(name, args))
```

```python
# py-mcp-client/mcp_client.py
def _with_trace(trace: str, fn):
  ensure_connected()
  with _trace_scope(trace):
    return fn()
```

The fulfilment handlers are the three MRTR triggers, registered once when the client is built:

```python
# py-mcp-client/mcp_client.py
def _build_client() -> Client:
  transport = StreamableHttpClientTransport(MCP_SERVER_URL)
  client = Client(transport, CLIENT_INFO, capabilities=CLIENT_CAPABILITIES)
  client.set_frame_listener(_tap)
  client.set_request_handler("sampling/createMessage", _handle_sampling)
  client.set_request_handler("roots/list", _handle_roots)
  client.set_request_handler("elicitation/create", _handle_elicitation)
  # ...
  return client
```

```python
# py-mcp-client/mcp_client.py
def _handle_sampling(params: dict) -> dict:
  # ...
  return sample(
    {"messages": params.get("messages"), "maxTokens": params.get("maxTokens"), "systemPrompt": params.get("systemPrompt")}
  )


def _handle_roots(_params: dict) -> dict:
  # ...
  return {"roots": _state["roots"]}


def _handle_elicitation(params: dict) -> dict:
  # ...bridge to the human in the browser, then block until they answer...
  pending = create_pending(pending_id, mode)
  result = wait_for(pending)
  return result
```

## 3 · MCP server — `py-mcp-server/features.py`

A tool triggers a round trip by calling a `ctx` method. `summarize` calls `ctx.create_message`
(sampling); the SDK pauses the response, emits the `input_required` result, and resumes the
handler with the model's reply when the retry arrives:

```python
# py-mcp-server/features.py
def summarize(args: dict, ctx: ToolContext) -> dict:
  import json

  message = ctx.create_message(
    {
      "messages": [{"role": "user", "content": {"type": "text", "text": f"Summarize in one sentence:\n{args['text']}"}}],
      "maxTokens": 200,
    }
  )
  # ...resumes here once the client has run the model
  content = message.get("content") if isinstance(message, dict) else None
  out = content.get("text") if isinstance(content, dict) and content.get("type") == "text" else json.dumps(content)
  return {"content": [{"type": "text", "text": f'Model "{message.get("model")}" replied:\n{out}'}]}

server.register_tool(
  "summarize",
  summarize,
  title="Summarize (sampling)",
  description="Server asks the CLIENT to run its model (sampling/createMessage).",
  input_schema={"type": "object", "properties": {"text": {"type": "string", "description": "Text to summarize"}}, "required": ["text"]},
)
```

The other two triggers follow the same shape: `register_user` calls `ctx.elicit_input`, and
`show_roots` calls `ctx.list_roots`:

```python
# py-mcp-server/features.py
def register_user(args: dict, ctx: ToolContext) -> dict:
  result = ctx.elicit_input(
    {
      "mode": "form",
      "message": "Please provide your registration details:",
      # ...requestedSchema
    }
  )
  # ...
```

```python
# py-mcp-server/features.py
def show_roots(args: dict, ctx: ToolContext) -> dict:
  import json

  result = ctx.list_roots()
  return {"content": [{"type": "text", "text": f"Client roots:\n{json.dumps(result.get('roots'), indent=2)}"}]}
```

## On the wire

1. `tools/call` (summarize) → `{ result: { ..., requestState, input_required: [sampling/createMessage] } }`
2. client runs the model, then re-sends `tools/call` with `inputResponses` + the verbatim `requestState` (a **new** request id)
3. `tools/call` → `{ result: { content: [...], _meta: { ... } } }` — the `complete` result

`requestState` is an opaque continuation token the client echoes back byte-for-byte; the loop
repeats until a `complete` result or an error. A server may only request input kinds the
client declared — otherwise it returns the missing-capability error `-32003`.

See [Elicitation](./elicitation.md), [Sampling](./sampling.md), and [Roots](./roots.md) for
each trigger in depth.
