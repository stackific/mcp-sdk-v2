# JSON Value Model

**Part I · Foundations** · Book Ch 2 · Stories S02 · sidebar `/json-model`

Everything on the wire is one of six JSON value forms (string, number, boolean, null, object,
array). A core invariant is forward compatibility: receivers ignore object members and `_meta`
keys they do not recognize. This pattern calls `echo` with an extra argument and an unknown
`_meta` key and shows the server accept and ignore both.

## Round-trip

```
demo (JsonModelPage)  ──POST /api/tools/call-traced──▶  client host (FastAPI)
      ▲                                                     │ api.call_tool_with_meta('echo', …)
      │                                                     ▼
  ApiResultView                                  stackific-mcp  Client
      │                                                     │ tools/call (JSON-RPC, _meta stamped)
      └──────── echoed text ◀──── Streamable HTTP ──────────┴──▶ MCP server (echo tool)
```

## 1 · Frontend — `demo/src/routes/json-model.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared across every language; selecting **Python** only repoints the REST base
URL to the FastAPI client host (`http://localhost:8102`) — the page code is unchanged.

The page sends a *recognized* argument plus an *unrecognized* one, and a custom `_meta` key:

```tsx
// demo/src/routes/json-model.tsx
call.run(() =>
  backend.callToolTraced(
    'echo',
    { text: 'hello', unknownExtra: 123 },
    { 'companion/unknown-meta': true },
  ),
)
```

```ts
// demo/src/lib/api.ts
callToolTraced: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The `/api/tools/call-traced` route forwards the caller's `arguments` and `_meta` verbatim to
`api.call_tool_with_meta`:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call-traced")
def api_tools_call_traced(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool_with_meta(body.get("name"), body.get("arguments") or {}, body.get("_meta") or {}))
```

The caller's `_meta` rides through to the SDK `Client`, which (de)serializes the whole frame as
a single JSON object:

```python
# py-mcp-client/mcp_client.py
def call_tool_with_meta(self, name: str, args: dict, meta: dict) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool_with_meta(name, args, meta))
```

## 3 · MCP server — `py-mcp-server/features.py`

The SDK validates `input_schema` but never rejects unknown members; `echo` reads only `text`
and ignores `unknownExtra` entirely:

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

The six wire forms are the SDK's single value model; `bool` is treated as distinct from a
number even though Python makes it an `int` subclass, so a JSON boolean never satisfies a JSON
number slot:

```python
# py-sdk/src/stackific/mcp/json/value.py
# The universal wire value — exactly one of the six JSON primitive forms (§2.3).
JSONValue = Union[str, int, float, bool, None, "JSONObject", "JSONArray"]
# ...
def _is_number(value: object) -> bool:
  return isinstance(value, (int, float)) and not isinstance(value, bool)
```

The forward-compatibility rule is enforced at the `_meta` gate: only the three required keys
are checked; unknown extra keys pass through untouched, never rejected:

```python
# py-sdk/src/stackific/mcp/protocol/meta.py
def validate_request_meta(meta: dict) -> RequestMetaValidationResult:
  protocol_version = meta.get(PROTOCOL_VERSION_META_KEY)
  # ...checks the three required keys only...
  # Unknown extra keys are ignored (R-4.1-e, R-4.1-f).
  return RequestMetaValidationResult(True)
```

## On the wire

A representative `tools/call` frame the SDK emits (note the dotted, slash-prefixed `_meta` key
names and the unrecognized members that survive):

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "echo",
    "arguments": { "text": "hello", "unknownExtra": 123 },
    "_meta": {
      "companion/unknown-meta": true,
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "companion-mcp-client", "version": "0.1.0" },
      "io.modelcontextprotocol/clientCapabilities": { "elicitation": {}, "sampling": {} }
    }
  }
}
```

See [JSON-RPC Framing](./jsonrpc.md) for the envelope and [The _meta Envelope](./meta.md) for
the key-naming grammar.
