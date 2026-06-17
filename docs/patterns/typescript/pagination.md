# Pagination

**Part VI · Utilities** · Book Ch 30 · Stories S18 · sidebar `/pagination`

Large lists are returned one page at a time. Each result carries an **opaque** `nextCursor`;
the caller passes it back to fetch the next page, and its absence signals the end. This
pattern walks a 23-item catalog five at a time, tracing the cursor on the wire.

## Round-trip

```
demo (PaginationPage) ──REST POST /api/tools/call──▶  client host (Hono)
      ▲   { cursor }                                       │ api.callTool('list_catalog', { cursor })
      │                                                    ▼
  append page,                                  client!.requestWithInput(...)
  keep nextCursor                                          │ tools/call ──▶ MCP server (list_catalog)
      │                                                    │ ◀── { items, nextCursor, total }
      └──────── structuredContent ◀──── Streamable HTTP ───┘
```

## 1 · Frontend — `demo/src/routes/pagination.tsx` + `demo/src/lib/api.ts`

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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono route forwards the body straight through; the cursor rides in `arguments`:

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

The `list_catalog` tool encodes the offset as a base64 cursor. It slices `PAGE_SIZE` items,
and only emits `nextCursor` when more remain — omitting it ends the sequence:

```ts
// ts-mcp-server/src/features.ts
const CATALOG = Array.from({ length: 23 }, (_, i) => ({
  id: i + 1,
  name: `item-${String(i + 1).padStart(2, '0')}`,
}));
const PAGE_SIZE = 5;
server.registerTool(
  'list_catalog',
  {
    title: 'List Catalog (paginated)',
    description: 'Returns one opaque-cursor page at a time; pass nextCursor to continue.',
    // ...inputSchema { cursor }, outputSchema { items, nextCursor, total }
  },
  async (args) => {
    const cursor = args.cursor as string | undefined;
    const offset = cursor ? Number(Buffer.from(cursor, 'base64').toString('utf8')) || 0 : 0;
    const items = CATALOG.slice(offset, offset + PAGE_SIZE);
    const nextOffset = offset + PAGE_SIZE;
    const nextCursor =
      nextOffset < CATALOG.length
        ? Buffer.from(String(nextOffset)).toString('base64')
        : undefined;
    const structuredContent = { items, nextCursor, total: CATALOG.length };
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  },
);
```

## On the wire

1. `tools/call` `list_catalog` `{}` → `{ structuredContent: { items: [1..5], nextCursor: "NQ==", total: 23 } }`
2. `tools/call` `list_catalog` `{ cursor: "NQ==" }` → `{ ..., nextCursor: "MTA=", ... }`
3. … last page → `{ items: [21..23], total: 23 }` — **no** `nextCursor`, signalling the end

The cursor is opaque by contract: only the server may interpret it (here, a base64-encoded
offset). Clients persist and replay it verbatim and never derive page numbers from it.
