# Caching

**Part VI · Utilities** · Book Ch 31 · Stories S19 · sidebar `/caching`

Cacheable results carry top-level cache hints — `ttlMs` (how long the value stays fresh) and
`cacheScope` (how widely it may be shared: `public` or `private`). A spec-aware client may
serve the cached value without a round-trip until the TTL lapses. This pattern returns a quote
plus those hints, with an invocation counter that reveals whether the server actually re-ran.

## Round-trip

```
demo (CachingPage) ──REST POST /api/tools/call──▶  client host (FastAPI)
      ▲                                                 │ api.call_tool('cached_quote')
      │                                                 ▼
  ttlMs / cacheScope                          client.call_tool(...) (SDK MRTR driver)
  invocation badges                                     │ tools/call ──▶ MCP server (cached_quote)
      │                                                 │ ◀── { content, ttlMs, cacheScope, _meta }
      └──────── result + hints ◀──── Streamable HTTP ───┘
```

## 1 · Frontend — `demo/src/routes/caching.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA; selecting **Python** on the home page repoints
`backend.*` at the Python client host, so this layer is byte-for-byte identical to the
TypeScript pattern.

The page calls `backend.callTool('cached_quote', {})` and reads the hints straight off the
top-level result, alongside the `_meta.invocation` counter:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/caching.tsx
const result = call.data && call.data.ok ? (call.data.result as any) : null;
const meta = result?._meta ?? null;
// ...
<Button onClick={() => call.run(() => backend.callTool('cached_quote', {}))}>Fetch quote</Button>
// ...
<Badge variant="green">ttlMs: {String(result.ttlMs)}</Badge>
<Badge variant="blue">cacheScope: {String(result.cacheScope)}</Badge>
<Badge variant="slate">invocation #{String(meta?.invocation)}</Badge>
```

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI route unwraps the REST body and delegates to `api.call_tool`, which carries the
result (hints and all) back unchanged:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
```

`call_tool` routes through `client.call_tool`, wrapped in `_with_trace` so the exchange is
grouped under one wire trace:

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

The `cached_quote` tool builds an ordinary result, then wraps it with `with_cache_hints` to
attach the **top-level** `ttlMs` and `cacheScope` fields. A counter in `_meta.invocation`
proves whether the handler ran:

```python
# py-mcp-server/features.py
quote_counter = {"n": 0}
quotes = ["Make it work, then make it right.", "Cache invalidation is hard.", "Premature optimization is the root of all evil."]

def cached_quote(args: dict, ctx: ToolContext) -> dict:
  quote_counter["n"] += 1
  n = quote_counter["n"]
  return with_cache_hints(
    {
      "content": [{"type": "text", "text": f"#{n}: {quotes[n % len(quotes)]}"}],
      "_meta": {"generatedAt": _now_iso(), "invocation": n},
    },
    ttl_ms=60000,
    cache_scope="private",
  )

server.register_tool(
  "cached_quote",
  cached_quote,
  title="Cached Quote",
  description="Returns a result carrying top-level cache hints (ttlMs + cacheScope).",
)
```

`with_cache_hints` is imported from `stackific.mcp.server`; it merges the hints onto the
result rather than nesting them, so they sit beside `content` and `_meta`.

## On the wire

1. `tools/call` `cached_quote` → `{ content: [...], ttlMs: 60000, cacheScope: "private", _meta: { invocation: 1 } }`
2. within 60 s, a spec-aware client may reuse the cached value — **no** second request, so
   `invocation` would not advance
3. after the TTL lapses, a fresh `tools/call` re-runs the handler and `invocation` increments

`cacheScope: "private"` marks the value as bound to this caller (not shareable across users);
`public` would allow a shared cache. The hints are advisory — a client that ignores them
simply re-calls every time.

See [Tools](./tools.md) for the underlying `tools/call`, and [Pagination](./pagination.md) and
[Content Blocks](./content.md) for siblings that ride the same route.
