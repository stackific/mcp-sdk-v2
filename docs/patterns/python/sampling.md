# Sampling

**Part V · Client features (MRTR)** · Book Ch 21 · Stories S33 · sidebar `/sampling`

Sampling reverses direction: *inside* a tool call the server borrows the client's model. The
server's `ctx.create_message` surfaces at the client host as a `sampling/createMessage`
request; the host runs the model (here DeepSeek via its Anthropic-compatible endpoint) and the
completion flows back so the tool resumes. This pattern calls the `summarize` tool, which asks
the client to summarize text. See [MRTR](./mrtr.md) for the retry loop.

## Round-trip (reversed inside the call)

```
demo (SamplingPage) ──REST POST /api/tools/call──▶  client host (FastAPI)
      ▲  callTool('summarize', { text })                 │ api.call_tool(...)
      │                                                   ▼
      │                                        client.call_tool(...) ──tools/call──▶ MCP server
      │                                                   │                          ctx.create_message({ messages })
      │                                                   │ ◀── sampling/createMessage ◀──┘ (over the response stream)
      │                              set_request_handler('sampling/createMessage') ──▶ sample() ──▶ DeepSeek
      └──────── { content } ◀── retried tools/call ◀── model reply flows back, tool resumes
```

## 1 · Frontend — `demo/src/routes/sampling.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

The page calls the tool; the sampling request is handled transparently inside the host:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/sampling.tsx
<Button onClick={() => call.run(() => backend.callTool('summarize', { text }))} data-testid="run-sampling">
  Summarize
</Button>
<ApiResultView result={call.data} />
```

## 2 · MCP client host — `py-mcp-client/mcp_client.py` + `py-mcp-client/sampling.py`

The host registers a handler for the server→client `sampling/createMessage` request and routes
it to the model:

```python
# py-mcp-client/mcp_client.py
def _handle_sampling(params: dict) -> dict:
  # ... emit a 'client handling sampling → DeepSeek' frame ...
  return sample(
    {"messages": params.get("messages"), "maxTokens": params.get("maxTokens"), "systemPrompt": params.get("systemPrompt")}
  )
# ...
client.set_request_handler("sampling/createMessage", _handle_sampling)
```

`sample` talks to DeepSeek through its Anthropic-compatible endpoint, falling back to a
deterministic mock when no key is configured:

```python
# py-mcp-client/sampling.py
def _sample_with_deepseek(params: dict) -> dict:
  """DeepSeek via its Anthropic-compatible endpoint (the real path when a key is set)."""
  messages = [
    {"role": m.get("role", "user"), "content": _content_to_text(m.get("content"))}
    for m in params.get("messages", [])
  ]
  body = {"model": DEEPSEEK_MODEL, "max_tokens": params.get("maxTokens") or 512, "messages": messages}
  if params.get("systemPrompt"):
    body["system"] = params["systemPrompt"]
  resp = httpx.post(
    f"{DEEPSEEK_BASE_URL}/v1/messages",
    headers={"x-api-key": DEEPSEEK_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
    json=body,
    timeout=60.0,
  ).raise_for_status().json()
  text = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
  return {"role": "assistant", "content": {"type": "text", "text": text}, "model": resp.get("model", DEEPSEEK_MODEL), "stopReason": resp.get("stop_reason") or "endTurn"}

def sample(params: dict) -> dict:
  """Run sampling against DeepSeek (when keyed) or the deterministic mock."""
  if HAS_KEY:
    try:
      return _sample_with_deepseek(params)
    except Exception:  # noqa: BLE001 — fall back to the mock on any provider error
      return _sample_mock(params)
  return _sample_mock(params)
```

## 3 · MCP server — `py-mcp-server/features.py`

Inside the tool, `ctx.create_message` issues the request back to the client and blocks until the
completion returns:

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
  content = message.get("content") if isinstance(message, dict) else None
  out = content.get("text") if isinstance(content, dict) and content.get("type") == "text" else json.dumps(content)
  return {"content": [{"type": "text", "text": f'Model "{message.get("model")}" replied:\n{out}'}]}
```

## On the wire

1. `tools/call` (`summarize`) → the server completes the response with an `input_required`
   result naming `sampling/createMessage`.
2. The client runs the model and **retries** `tools/call` with the same arguments plus the
   sampled `{ role, content, model, stopReason }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Model "..." replied: ...' }] }`.

Sampling is a *deprecated* client capability — prefer [Elicitation](./elicitation.md) for
structured user input. [Roots](./roots.md) is the third client feature riding this reversed
loop.
