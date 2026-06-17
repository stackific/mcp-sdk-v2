# Caching

**Part VI · Utilities** · Book Ch 31 · Stories S19 · sidebar `/caching`

Cacheable results carry top-level cache hints — `ttlMs` (how long the value stays fresh) and
`cacheScope` (how widely it may be shared: `public` or `private`). A spec-aware client may
serve the cached value without a round-trip until the TTL lapses. This pattern returns a quote
plus those hints, with an invocation counter that reveals whether the server actually re-ran.

## Round-trip

```
demo (CachingPage) ──REST POST /api/tools/call──▶  client host (ASP.NET Core)
      ▲                                                 │ CallToolWithInputAsync('cached_quote')
      │                                                 ▼
  ttlMs / cacheScope                          client.CallToolWithInputAsync(...)
  invocation badges                                     │ tools/call ──▶ MCP server (cached_quote)
      │                                                 │ ◀── { content, ttlMs, cacheScope, _meta }
      └──────── result + hints ◀──── Streamable HTTP ───┘
```

## 1 · Frontend — `demo/src/routes/caching.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page calls `backend.callTool('cached_quote', {})`
and reads the hints straight off the top-level result, alongside the `_meta.invocation` counter:

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

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

The minimal-API route delegates to the SDK's `CallToolWithInputAsync` driver, which carries the
result (hints and all) back unchanged:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The `cached_quote` tool builds an ordinary result, then calls `ctx.SetCacheHints` to attach the
**top-level** `ttlMs` and `cacheScope` fields. A counter in `_meta.invocation` proves whether
the handler ran:

```csharp
// csharp-mcp-server/Features.cs
var quoteCounter = 0;
server.RegisterTool(
  new Tool { Name = "cached_quote", Title = "Cached Quote", Description = "Returns a result carrying top-level cache hints (ttlMs + cacheScope).", InputSchema = Schema("""{"type":"object"}""") },
  ctx =>
  {
    quoteCounter++;
    var quotes = new[] { "Make it work, then make it right.", "Cache invalidation is hard.", "Premature optimization is the root of all evil." };
    ctx.SetCacheHints(60000, CacheScope.Private);
    return Task.FromResult(new CallToolResult
    {
      Content = [ContentBlocks.Text($"#{quoteCounter}: {quotes[quoteCounter % quotes.Length]}")],
      Meta = new JsonObject { ["generatedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["invocation"] = quoteCounter },
    });
  });
```

`ctx.SetCacheHints(ttlMs, cacheScope)` merges the hints onto the result rather than nesting
them, so they sit beside `content` and `_meta` at the top level when the result is serialised.

## On the wire

1. `tools/call` `cached_quote` → `{ content: [...], ttlMs: 60000, cacheScope: "private", _meta: { invocation: 1 } }`
2. within 60 s, a spec-aware client may reuse the cached value — **no** second request, so
   `invocation` would not advance
3. after the TTL lapses, a fresh `tools/call` re-runs the handler and `invocation` increments

`cacheScope: "private"` marks the value as bound to this caller (not shareable across users);
`public` would allow a shared cache. The hints are advisory — a client that ignores them
simply re-calls every time.
