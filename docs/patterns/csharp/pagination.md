# Pagination

**Part VI · Utilities** · Book Ch 30 · Stories S18 · sidebar `/pagination`

Large lists are returned one page at a time. Each result carries an **opaque** `nextCursor`;
the caller passes it back to fetch the next page, and its absence signals the end. This
pattern walks a 23-item catalog five at a time, tracing the cursor on the wire.

## Round-trip

```
demo (PaginationPage) ──REST POST /api/tools/call──▶  client host (ASP.NET Core)
      ▲   { cursor }                                       │ CallToolWithInputAsync('list_catalog', { cursor })
      │                                                    ▼
  append page,                                  client.CallToolWithInputAsync(...)
  keep nextCursor                                          │ tools/call ──▶ MCP server (list_catalog)
      │                                                    │ ◀── { items, nextCursor, total }
      └──────── structuredContent ◀──── Streamable HTTP ───┘
```

## 1 · Frontend — `demo/src/routes/pagination.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page calls `backend.callTool('list_catalog', …)`,
passing the saved cursor (or `{}` for the first page). It reads `structuredContent`, appends the
items, and stores `nextCursor`:

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

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

The minimal-API route forwards the body straight through; the cursor rides in `arguments`, and
the call routes through the SDK's `CallToolWithInputAsync` driver:

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

The `list_catalog` tool encodes the offset as a base64 cursor. It slices `pageSize` items, and
only emits `nextCursor` when more remain — omitting it ends the sequence:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool
  {
    Name = "list_catalog",
    Title = "List Catalog (paginated)",
    Description = "Returns one opaque-cursor page at a time; pass nextCursor to continue.",
    InputSchema = Schema("""{"type":"object","properties":{"cursor":{"type":"string"}}}"""),
  },
  ctx =>
  {
    const int pageSize = 5;
    var catalog = Enumerable.Range(1, 23).Select(i => new JsonObject { ["id"] = i, ["name"] = $"item-{i:D2}" }).ToList();
    var offset = 0;
    var cursor = ctx.GetString("cursor", "");
    if (cursor.Length > 0)
    {
      try { offset = int.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(cursor))); } catch { offset = 0; }
    }
    var items = new JsonArray(catalog.Skip(offset).Take(pageSize).Cast<JsonNode>().Select(n => n.DeepClone()).ToArray());
    var nextOffset = offset + pageSize;
    var structured = new JsonObject { ["items"] = items, ["total"] = catalog.Count };
    if (nextOffset < catalog.Count) structured["nextCursor"] = Convert.ToBase64String(Encoding.UTF8.GetBytes(nextOffset.ToString()));
    return Task.FromResult(new CallToolResult { Content = [ContentBlocks.Text(structured.ToJsonString())], StructuredContent = structured });
  });
```

## On the wire

1. `tools/call` `list_catalog` `{}` → `{ structuredContent: { items: [1..5], total: 23, nextCursor: "NQ==" } }`
2. `tools/call` `list_catalog` `{ cursor: "NQ==" }` → `{ ..., nextCursor: "MTA=", ... }`
3. … last page → `{ items: [21..23], total: 23 }` — **no** `nextCursor`, signalling the end

The cursor is opaque by contract: only the server may interpret it (here, a base64-encoded
offset). Clients persist and replay it verbatim and never derive page numbers from it.
