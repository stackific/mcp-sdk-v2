# Errors

**Part VI · Errors & authorization** · Book Ch 12 · Stories S34 · sidebar `/errors`

MCP has two error channels, and they are not interchangeable. A **tool error** rides
*inside* a successful `tools/call` result as `isError: true` — the model sees it and can
recover. A **protocol error** is a JSON-RPC error response (a thrown failure) the
client/host handles — e.g. `-32601` method-not-found or `-32602` invalid-params. This
pattern traces both from the demo SPA through the host to the server and back.

## Round-trip

```
demo (ErrorsPage)                              client host (FastAPI)
  divide{a:1,b:0} ──POST /api/tools/call──▶  run(fn) ── try ──▶ result.isError:true
      ▲                                              │              (ok:true, model recovers)
      │ ApiResultView                                │
  bogus method   ──POST /api/raw────────────▶  run(fn) ── except ─▶ ok:false { message, code }
      └────────── JSON ◀──── Streamable HTTP ──────┴──▶ MCP server
                                          tool: returns isError:true
                                          unknown method: rejects -32601
```

## 1 · Frontend — `demo/src/routes/errors.tsx` + `demo/src/lib/api.ts`

The frontend is the shared SPA (TypeScript); selecting **Python** only repoints `backend.*`
at the Python client host, so this layer is identical to the TypeScript pattern.

The page exercises both channels from the same `ApiResultView`. A divide-by-zero is a
**tool** error; a bogus JSON-RPC method is a **protocol** error:

```tsx
// demo/src/routes/errors.tsx
// Tool error — divide by zero → successful result with isError:true (NOT a JSON-RPC error).
<Button onClick={() => toolErr.run(() => backend.callTool('divide', { a: 1, b: 0 }))}>
  Divide by zero
</Button>
// ...
// Method not found — an unimplemented JSON-RPC method → -32601 (a protocol error).
<Button onClick={() => method.run(() => backend.raw('does/not/exist', {}))}>
  Call an unimplemented method
</Button>
```

The two `backend.*` wrappers POST to different host routes — `callTool` for a tool, `raw`
for an arbitrary JSON-RPC method:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
// ...
raw: (method: string, params: Record<string, unknown> = {}) =>
  postJson<ApiResult<Any>>('/api/raw', { method, params }),
```

## 2 · MCP client host — `py-mcp-client/main.py`

The `run(fn)` helper is where the two channels converge. A **protocol** error is raised as
a `RequestError` and shaped into `ok:false { message, code, data }` — the server-provided
JSON-RPC fields the SPA renders. Any *other* failure (transport, etc.) is logged
server-side and reported with a generic message, so no internal exception detail leaks. A
**tool** error does not raise: its `isError:true` result rides back inside `ok:true`,
untouched, for the model (or the SPA) to inspect:

```python
# py-mcp-client/main.py
from stackific.mcp.client import RequestError
# ...
def run(fn: Callable[[], object]) -> dict:
  try:
    return {"ok": True, "result": fn()}
  except RequestError as exc:
    return {"ok": False, "error": {"message": exc.message, "code": exc.code, "data": exc.data}}
  except Exception:  # noqa: BLE001 — transport/other failure → generic, non-leaking error
    log.exception("client host request failed")
    return {"ok": False, "error": {"message": "Internal client host error"}}
```

`RequestError` is the SDK's representation of a *delivered* JSON-RPC error response (the
request reached the peer and it answered with an `error`) — distinct from a transport
channel failure — and it carries the `code` / `message` / `data` members verbatim.

`call_tool` goes through the SDK driver; `raw` is the generic passthrough that lets an
unknown method reach the server (and reject). Both routes are plain `def`, so FastAPI runs
them in a worker thread — never on the event loop — because the blocking SDK call would
otherwise freeze the host:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
# ...
@app.post("/api/raw")
def api_raw(body: dict = Body(default={})) -> dict:
  return run(lambda: api.raw(body.get("method"), body.get("params") or {}))
```

```python
# py-mcp-client/mcp_client.py
# Generic JSON-RPC passthrough for methods without a dedicated helper (ping, …).
def raw(self, method: str, params: dict) -> dict:
  return _with_trace(method, lambda: _state["client"].raw(method, params))
```

## 3 · MCP server — `py-mcp-server/features.py`

The `divide` tool **returns** `isError: True` — a normal, successful result the model can
read and recover from. It never raises:

```python
# py-mcp-server/features.py
def divide(args: dict, ctx: ToolContext) -> dict:
  if args["b"] == 0:
    return {
      "content": [{"type": "text", "text": "Cannot divide by zero. Reported as isError:true so the model can recover."}],
      "isError": True,
    }
  return {"content": [{"type": "text", "text": str(args["a"] / args["b"])}]}

server.register_tool(
  "divide",
  divide,
  title="Divide (may error)",
  description="Demonstrates a TOOL error (isError:true) vs a protocol error.",
  input_schema={"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
  annotations={"readOnlyHint": True, "idempotentHint": True},
)
```

The protocol error needs no code: `does/not/exist` is not a registered method, so the SDK
runtime rejects it with JSON-RPC `-32601` (Method not found) before any handler runs.
Calling a real tool with the wrong argument type (`add` with a string) likewise fails
schema validation with `-32602` (Invalid params). Both arrive as a delivered JSON-RPC
error and surface in `run`'s `except RequestError`.

## On the wire

```
// Tool error — a SUCCESSFUL tools/call result:
→ tools/call { name: "divide", arguments: { a: 1, b: 0 } }
← { result: { content: [{ type: "text", text: "Cannot divide by zero..." }], isError: true } }

// Protocol error — a JSON-RPC error response:
→ { method: "does/not/exist", params: {} }
← { error: { code: -32601, message: "Method not found" } }
```

The distinction is the whole point: a tool error stays *in band* (a result, `ok:true`), so
the model can adapt; a protocol error breaks the JSON-RPC contract and is handled by the
host (`ok:false`). See [Tools](./tools.md) for the normal success path, and
[Authorization](./authorization.md) for how a `401` challenge is shaped the same way.
