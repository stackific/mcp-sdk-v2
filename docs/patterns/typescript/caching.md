# Caching

**Part VI · Utilities** · Book Ch 31 · Stories S19 · sidebar `/caching`

Cacheable results carry top-level cache hints — `ttlMs` (how long the value stays fresh) and
`cacheScope` (how widely it may be shared: `public` or `private`). A spec-aware client may
serve the cached value without a round-trip until the TTL lapses. This pattern returns a quote
plus those hints, with an invocation counter that reveals whether the server actually re-ran.

## Round-trip

```
demo (CachingPage) ──REST POST /api/tools/call──▶  client host (Hono)
      ▲                                                 │ api.callTool('cached_quote')
      │                                                 ▼
  ttlMs / cacheScope                          client!.requestWithInput(...)
  invocation badges                                     │ tools/call ──▶ MCP server (cached_quote)
      │                                                 │ ◀── { content, ttlMs, cacheScope, _meta }
      └──────── result + hints ◀──── Streamable HTTP ───┘
```

## 1 · Frontend — `demo/src/routes/caching.tsx` + `demo/src/lib/api.ts`

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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono route delegates to `api.callTool`, which carries the result (hints and all) back
unchanged:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json<{
    name: string;
    arguments?: Record<string, unknown>;
  }>();
  return run(c, () => api.callTool(name, args ?? {}));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
callTool: (name: string, args: Record<string, unknown>) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({ method: 'tools/call', params: { name, arguments: args } }),
  ),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The `cached_quote` tool builds an ordinary result, then wraps it with `withCacheHints` to
attach the **top-level** `ttlMs` and `cacheScope` fields. A counter in `_meta.invocation`
proves whether the handler ran:

```ts
// ts-mcp-server/src/features.ts
let quoteCounter = 0;
server.registerTool(
  'cached_quote',
  {
    title: 'Cached Quote',
    description: 'Returns a result carrying top-level cache hints (ttlMs + cacheScope).',
  },
  async () => {
    quoteCounter += 1;
    const quotes = [
      'Make it work, then make it right.',
      'Cache invalidation is hard.',
      'Premature optimization is the root of all evil.',
    ];
    return withCacheHints(
      {
        content: [
          { type: 'text', text: `#${quoteCounter}: ${quotes[quoteCounter % quotes.length]}` },
        ],
        _meta: { generatedAt: new Date().toISOString(), invocation: quoteCounter },
      },
      { ttlMs: 60000, cacheScope: 'private' },
    );
  },
);
```

`withCacheHints` is imported from `@stackific/mcp-sdk/server`; it merges the hints onto the
result rather than nesting them, so they sit beside `content` and `_meta`.

## On the wire

1. `tools/call` `cached_quote` → `{ content: [...], ttlMs: 60000, cacheScope: "private", _meta: { invocation: 1 } }`
2. within 60 s, a spec-aware client may reuse the cached value — **no** second request, so
   `invocation` would not advance
3. after the TTL lapses, a fresh `tools/call` re-runs the handler and `invocation` increments

`cacheScope: "private"` marks the value as bound to this caller (not shareable across users);
`public` would allow a shared cache. The hints are advisory — a client that ignores them
simply re-calls every time.
