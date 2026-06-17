# Registries

**Part VIII · Governance** · Book Ch 29 / App. A–E · Stories S46 · sidebar `/registries`

The capstone appendices (A–E) consolidate the entire wire surface into five authoritative tables:
the Method & Notification Index, the Error Code Registry, the Reserved `_meta` Key Registry, the
Capability Registry, and the Consolidated Type Index. They define **no new types** — each row points
to the section that normatively owns it. This pattern shows how the server registers and advertises
its live catalog, how the client lists it, and where the SDK's static registry data lives.

## Round-trip

```
demo (RegistriesPage)  ──GET /api/tools──▶  client host (FastAPI)
      ▲                                          │ api.list_tools()
      │                                          ▼
  Badge per tool name                    stackific.mcp  Client
      │                                          │ tools/list (JSON-RPC)
      └──── live method surface ◀──── _tools dict ──┴──▶ MCP server (register_tool → _list_tools)
```

## 1 · Frontend — `demo/src/routes/registries.tsx`

The frontend is the shared SPA (TypeScript); selecting **Python** only repoints `backend.*`
at the Python client host, so this layer is identical to the TypeScript pattern.

The page enumerates the standard registry contents statically, then queries the live server's
`tools/list` so the *actual* method surface can be compared against the Method & Notification Index
(Appendix A). The live half is one call:

```tsx
// demo/src/routes/registries.tsx
const tools = call.data?.ok ? ((call.data.result.tools as any[]) ?? []) : [];
// ...
<Button data-testid="run-registries" disabled={call.loading}
  onClick={() => call.run(() => backend.listTools())}>
  Load live registry
</Button>
<div data-testid="registry-methods" className="flex flex-wrap gap-1.5">
  {tools.map((t) => (
    <Badge key={t.name} variant="blue">{t.name}</Badge>
  ))}
</div>
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The REST route delegates to the SDK `Client`'s typed `list_tools()` (run in a worker thread, since
the blocking SDK call must stay off the event loop):

```python
# py-mcp-client/main.py
@app.get("/api/tools")
def api_tools() -> dict:
  return run(api.list_tools)
```

```python
# py-mcp-client/mcp_client.py
def list_tools(self) -> dict:
  return _with_trace("tools/list", lambda: _state["client"].list_tools())
```

## 3 · MCP server — `py-sdk/src/stackific/mcp/server/server.py` + `py-sdk/src/stackific/mcp/protocol/registries.py`

The server *is* a registry: `register_tool` populates a `dict`, and `_list_tools` projects that dict
onto the `tools/list` result — the live catalog the demo renders:

```python
# py-sdk/src/stackific/mcp/server/server.py
self._tools: dict[str, _Tool] = {}
# ...
def register_tool(self, name: str, handler, *, input_schema=None, title=None,
                  description=None, annotations=None, execution=None, output_schema=None) -> None:
  self._tools[name] = _Tool(name, handler, input_schema, output_schema, title, description, annotations, execution)
```

```python
# py-sdk/src/stackific/mcp/server/server.py
def _list_tools(self, params: dict) -> dict:
  tools = []
  for t in self._tools.values():
    entry: dict = {"name": t.name, "inputSchema": t.input_schema or {"type": "object"}}
    if t.title:
      entry["title"] = t.title
    if t.annotations:
      entry["annotations"] = t.annotations
    # ...
    tools.append(entry)
  return self._with_cacheable_hints(self._paginate(tools, "tools", params))
```

The companion server seeds that dict at build time — each `register_tool` is one row in the live
registry the demo enumerates:

```python
# py-mcp-server/features.py
server.register_tool(
  "echo",
  lambda args, ctx: {"content": [{"type": "text", "text": str(args.get("text", ""))}]},
  title="Echo",
  description="The simplest possible tool: echoes text back.",
  input_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
  annotations={"readOnlyHint": True, "idempotentHint": True, "openWorldHint": False},
)
```

The five **static** appendix tables (A–E) are SDK data — App. A's Method & Notification Index and
App. D's Capability Registry are the ones the demo mirrors:

```python
# py-sdk/src/stackific/mcp/protocol/registries.py
METHOD_REGISTRY: tuple[MethodNotificationIndexEntry, ...] = (
  MethodNotificationIndexEntry("tools/list", RegistryMethodKind.REQUEST, "client→server", "§16 Tools"),
  MethodNotificationIndexEntry("tools/call", RegistryMethodKind.REQUEST, "client→server", "§16 Tools"),
  MethodNotificationIndexEntry("roots/list", RegistryMethodKind.INPUT_REQUEST,
    "server→client (via input-required result, §11)", "§21 Deprecated Client-Provided Capabilities"),
  # ... every method and notification, each citing its owning section
)
```

```python
# py-sdk/src/stackific/mcp/protocol/registries.py
CAPABILITY_REGISTRY: tuple[CapabilityRegistryEntry, ...] = (
  CapabilityRegistryEntry(capability="tools", side="server", sub_flags=(
      CapabilitySubFlag("listChanged", "optional", "enables notifications/tools/list_changed", boolean=True),
    ), defined_in="§6 Capabilities and Extensions"),
  CapabilityRegistryEntry(capability="roots", side="client", sub_flags=(),
    defined_in="§6 Capabilities and Extensions", deprecated=True),
  # ... elicitation, sampling, extensions; tasks/ui are extension-scoped
)
```

Appendix B (Error Codes) is **never rebuilt** — `registries.py` re-exports the authoritative §22
table so the whole error surface is reachable through one module (the Python analogue of TS
`export { … } from './errors.js'`):

```python
# py-sdk/src/stackific/mcp/protocol/registries.py
from stackific.mcp.protocol.errors import (
  ERROR_CODE_REGISTRY,
  RESERVED_ERROR_CODES,
  validate_extension_error_code,
  SERVER_ERROR_RANGE,
)
```

## On the wire

1. `tools/list` → `{ tools: [{ name, inputSchema, annotations, ... }] }` — the live method surface,
   one badge per name in the demo.
2. Every name returned is a row in Appendix A; every advertised capability is a row in Appendix D —
   the appendices restate, never redefine, what the wire already carries.

The registries are governance artifacts: a consolidation that points back to its defining section,
plus a few cross-cutting rules (custom error codes must avoid the reserved table; the three client
`_meta` keys are required on every request). See [Capabilities](./capabilities.md),
[Errors](./errors.md), and [The \_meta Envelope](./meta.md) for the sections each appendix indexes,
and [Conformance](./conformance.md) for the rule that a profile MUST use these exact codes, keys, and
identifiers.
