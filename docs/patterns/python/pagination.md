# Pagination

**Part VI · Utilities** · Book Ch 30 · Stories S18 · sidebar `/pagination`

Large lists are returned one page at a time. Each result carries an **opaque** `nextCursor`;
the caller passes it back to fetch the next page, and its absence signals the end. This
pattern walks a 23-item catalog five at a time, tracing the cursor on the wire.

## Round-trip

```
demo (PaginationPage) ──REST POST /api/tools/call──▶  client host (FastAPI)
      ▲   { cursor }                                       │ api.call_tool('list_catalog', { cursor })
      │                                                    ▼
  append page,                                  client.call_tool(...) (SDK MRTR driver)
  keep nextCursor                                          │ tools/call ──▶ MCP server (list_catalog)
      │                                                    │ ◀── { items, nextCursor, total }
      └──────── structuredContent ◀──── Streamable HTTP ───┘
```

## 1 · Frontend — `demo/src/routes/pagination.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA; selecting **Python** on the home page repoints
`backend.*` at the Python client host, so this layer is byte-for-byte identical to the
TypeScript pattern.

The page calls `backend.callTool('list_catalog', …)`, passing the saved cursor (or `{}` for
the first page). It reads `structuredContent`, appends the items, and stores `nextCursor`:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/pagination.tsx
async function loadPage(reset: boolean) {
  const useCursor = reset ? undefined : cursor;
  const res = await call.run(() =>
    backend.callTool('list_catalog', useCursor ? { cursor: useCursor } : {}),
  );
  if (!res || !res.ok) return;
  const sc = (res.result as any)?.structuredContent ?? {};
  const page: Item[] = sc.items ?? [];
  setItems(reset ? page : [...items, ...page]);
  setCursor(sc.nextCursor);
  setDone(!sc.nextCursor);
}
```

The cursor is treated as a black box — the page never parses or constructs it.

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI route unwraps the REST body and forwards it straight through; the cursor rides in
`arguments`:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
```

`call_tool` routes through `client.call_tool` — the SDK's MRTR driver — wrapped in
`_with_trace` so the page exchange is grouped under one wire trace. For a plain list call it
behaves like a single `tools/call`:

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

## 3 · MCP server — `py-mcp-server/features.py`

The `list_catalog` tool encodes the offset as a base64 cursor. It slices `page_size` items,
and only adds `nextCursor` when more remain — omitting it ends the sequence:

```python
# py-mcp-server/features.py
catalog = [{"id": i + 1, "name": f"item-{str(i + 1).zfill(2)}"} for i in range(23)]
page_size = 5

def list_catalog(args: dict, ctx: ToolContext) -> dict:
  import json

  cursor = args.get("cursor")
  offset = 0
  if isinstance(cursor, str) and cursor:
    try:
      offset = int(base64.b64decode(cursor.encode("ascii")).decode("ascii"))
    except (ValueError, TypeError):
      offset = 0
  items = catalog[offset : offset + page_size]
  next_offset = offset + page_size
  structured: dict = {"items": items, "total": len(catalog)}
  if next_offset < len(catalog):
    structured["nextCursor"] = base64.b64encode(str(next_offset).encode("ascii")).decode("ascii")
  return {"content": [{"type": "text", "text": json.dumps(structured, indent=2)}], "structuredContent": structured}

server.register_tool(
  "list_catalog",
  list_catalog,
  title="List Catalog (paginated)",
  description="Returns one opaque-cursor page at a time; pass nextCursor to continue.",
  input_schema={"type": "object", "properties": {"cursor": {"type": "string", "description": "Opaque cursor from a previous page"}}},
  # ...output_schema { items, nextCursor, total }
)
```

## On the wire

1. `tools/call` `list_catalog` `{}` → `{ structuredContent: { items: [1..5], nextCursor: "NQ==", total: 23 } }`
2. `tools/call` `list_catalog` `{ cursor: "NQ==" }` → `{ ..., nextCursor: "MTA=", ... }`
3. … last page → `{ items: [21..23], total: 23 }` — **no** `nextCursor`, signalling the end

The cursor is opaque by contract: only the server may interpret it (here, a base64-encoded
offset). Clients persist and replay it verbatim and never derive page numbers from it.

See [Tools](./tools.md) for the underlying `tools/call`, and [Caching](./caching.md) and
[Content Blocks](./content.md) for siblings that ride the same route.
