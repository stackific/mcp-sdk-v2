# Elicitation

**Part V · Client features (MRTR)** · Book Ch 19–20 · Stories S30–S31 · sidebar `/elicitation`

Elicitation reverses the usual direction: *inside* a tool call the server asks the client for
user input. The server's `ctx.elicit_input` surfaces at the client host as an
`elicitation/create` request; the host parks it, the human answers in the browser, and the
answer flows back so the tool resumes. Two modes: `form` (a structured schema rendered as a
modal) and `url` (an out-of-band confirmation page). See [MRTR](./mrtr.md) for the retry loop
that carries this.

## Round-trip (reversed inside the call)

```
demo (ElicitationPage) ──REST POST /api/tools/call──▶  client host (FastAPI)
      ▲  callTool('register_user')                          │ api.call_tool(...)
      │                                                     ▼
      │                                        client.call_tool(...) ──tools/call──▶ MCP server
      │                                                     │                        ctx.elicit_input({ mode })
      │   modal / popup ◀── create_pending(id) ◀── set_request_handler('elicitation/create') ◀── elicitation/create
      │        │ user answers                                                                     (over the response stream)
      └────────┴── POST /api/elicitation/:id/resolve ──▶ resolve_pending(id) ──▶ retried tools/call ──▶ tool resumes
```

## 1 · Frontend — `demo/src/routes/elicitation.tsx` + `demo/src/routes/elicit.tsx`

The frontend is the shared TypeScript SPA — identical across stacks; selecting **Python**
on the home page simply repoints `backend.*` at the Python client host.

The page just calls the tools; the elicitation modal/popup is driven by the wire stream. The
URL flavour confirms on a standalone landing page that posts the answer back:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
resolveElicitation: (id: string, body: { action: string; content?: Record<string, unknown> }) =>
  postJson<{ ok: boolean }>(`/api/elicitation/${id}/resolve`, body),
```

```tsx
// demo/src/routes/elicitation.tsx
<Button onClick={() => form.run(() => backend.callTool('register_user', {}))} data-testid="run-elicit-form">
  Call register_user
</Button>
// ...
<Button onClick={() => url.run(() => backend.callTool('confirm_purchase', {}))} data-testid="run-elicit-url">
  Call confirm_purchase
</Button>
```

```tsx
// demo/src/routes/elicit.tsx — the URL-elicitation landing page
function respond(action: 'accept' | 'decline') {
  if (window.opener) {
    window.opener.postMessage({ source: 'mcp-url-elicitation', elicitationId: id, action }, '*');
  }
  window.close();
}
```

## 2 · MCP client host — `py-mcp-client/mcp_client.py` + `py-mcp-client/elicitation.py` + `py-mcp-client/main.py`

The host registers a handler for the server→client `elicitation/create` request. It parks a
pending entry keyed by id and *blocks the request thread* until the human resolves it:

```python
# py-mcp-client/mcp_client.py
def _handle_elicitation(params: dict) -> dict:
  pending_id = str(uuid.uuid4())
  mode = params.get("mode", "form")
  # ... emit a frame so the SPA renders the form / opens the URL ...
  pending = create_pending(pending_id, mode)
  result = wait_for(pending)
  # ...
  return result
# ...
client.set_request_handler("elicitation/create", _handle_elicitation)
```

```python
# py-mcp-client/elicitation.py
def create_pending(pending_id: str, mode: str) -> _Pending:
  """Register a pending elicitation and return it (the caller blocks on ``.event``)."""
  pending = _Pending(mode)
  with _lock:
    _pending[pending_id] = pending
  return pending

def wait_for(pending: _Pending, timeout: float = 300.0) -> dict:
  """Block until the user resolves the elicitation (or ``timeout``); return ``{action, content?}``."""
  if not pending.event.wait(timeout):
    return {"action": "cancel"}
  return pending.result

def resolve_pending(pending_id: str, result: dict) -> bool:
  """Fulfill a pending elicitation with the user's answer. Returns ``False`` if unknown."""
  with _lock:
    pending = _pending.pop(pending_id, None)
  if pending is None:
    return False
  pending.result = result
  pending.event.set()
  return True
```

The human's answer arrives over a separate REST call, which fulfils the parked entry (the
handler blocks on one worker thread while the resolve lands on another — see [tools](./tools.md)
on why these routes are plain `def`):

```python
# py-mcp-client/main.py
@app.post("/api/elicitation/{pending_id}/resolve")
def api_elicitation_resolve(pending_id: str, body: dict = Body(default={})) -> JSONResponse:
  return JSONResponse({"ok": resolve_pending(pending_id, body)})
```

## 3 · MCP server — `py-mcp-server/features.py`

Inside the tool, `ctx.elicit_input` issues the request back to the client and *blocks* until
the answer returns. `form` mode carries a `requestedSchema`:

```python
# py-mcp-server/features.py
def register_user(args: dict, ctx: ToolContext) -> dict:
  import json
  result = ctx.elicit_input(
    {
      "mode": "form",
      "message": "Please provide your registration details:",
      "requestedSchema": {
        "type": "object",
        "properties": {
          "username": {"type": "string", "title": "Username", "minLength": 3, "maxLength": 20},
          "email": {"type": "string", "title": "Email", "format": "email"},
          "newsletter": {"type": "boolean", "title": "Subscribe to newsletter?", "default": False},
        },
        "required": ["username", "email"],
      },
    }
  )
  if result.get("action") == "accept" and result.get("content"):
    return {"content": [{"type": "text", "text": f"Registered:\n{json.dumps(result['content'], indent=2)}"}]}
  return {"content": [{"type": "text", "text": f"User chose to {result.get('action')} the form."}]}
```

`url` mode carries an `elicitationId` and a `url` instead — the client opens it out-of-band:

```python
# py-mcp-server/features.py
elicitation_id = f"purchase-{int(time.time() * 1000)}"
result = ctx.elicit_input(
  {
    "mode": "url",
    "message": "Please confirm your purchase in the opened page.",
    "elicitationId": elicitation_id,
    "url": f"{frontend}/elicit/{elicitation_id}",
  }
)
```

## On the wire

1. `tools/call` (`register_user`) → the server completes the response with an
   `input_required` result naming `elicitation/create`.
2. The client fulfils it locally (no separate server→client request — the answer rides the
   retry) and **retries** `tools/call` with the same arguments plus the gathered
   `{ action, content }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Registered: ...' }] }`.

`action` is one of `accept` / `decline` / `cancel`; only `accept` carries `content`. Compare
with [Sampling](./sampling.md) and [Roots](./roots.md), the other two client features that
ride this same reversed loop.
