# Resources

**Part IV · Server features** · Book Ch 14 · Stories S26–S27 · sidebar `/resources`

Resources are the app-controlled primitive: data identified by an opaque URI that the client
reads. The server advertises them via `resources/list`, and the client fetches one with
`resources/read`. This pattern traces a list-then-read round-trip from the demo SPA through
the client host to the server and back.

## Round-trip

```
demo (ResourcesPage) ──REST GET /api/resources─────▶  client host (Hono)
      ▲              ──REST POST /api/resources/read─▶        │ api.listResources() / api.readResource(uri)
      │                                                       ▼
  ApiResultView                              @stackific/mcp-sdk  Client
      │                                                       │ resources/list · resources/read (JSON-RPC)
      └──────── { resources } / { contents } ◀── Streamable HTTP ──┴──▶ MCP server (registerResource)
```

## 1 · Frontend — `demo/src/routes/resources.tsx` + `demo/src/lib/api.ts`

The page lists resources on mount, then reads the URI in the input box:

```ts
// demo/src/lib/api.ts
listResources: () => getJson<ApiResult<Any>>('/api/resources'),
readResource: (uri: string) => postJson<ApiResult<Any>>('/api/resources/read', { uri }),
```

```tsx
// demo/src/routes/resources.tsx
useEffect(() => {
  void list.run(() => backend.listResources());
}, []);
// ...
const resources = list.data?.ok ? (list.data.result.resources as any[]) : [];
// ...
<Button onClick={() => read.run(() => backend.readResource(uri))} data-testid="run-read">
  Read
</Button>
<ApiResultView result={read.data} />
```

An unresolvable URI surfaces as a `-32602` (Invalid params) protocol error — see
[Errors](./errors.md).

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono routes unwrap the REST body and delegate to the SDK `Client`:

```ts
// ts-mcp-client/src/index.ts
app.get('/api/resources', (c) => run(c, () => api.listResources()));
app.post('/api/resources/read', async (c) => {
  const { uri } = await c.req.json<{ uri: string }>();
  return run(c, () => api.readResource(uri));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
listResources: () => withTrace('resources/list', () => client!.listResources()),
// ...
readResource: (uri: string) => withTrace('resources/read', () => client!.readResource(uri)),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The server registers a static resource against a fixed URI; the read handler returns its
`contents`:

```ts
// ts-mcp-server/src/features.ts
server.registerResource(
  'readme',
  'docs://readme',
  { title: 'Readme', description: 'A static text resource.', mimeType: 'text/markdown' },
  async (uri) => ({
    contents: [
      {
        uri,
        mimeType: 'text/markdown',
        text: '# Companion Server\n\nThis is a static MCP resource served over Streamable HTTP.',
      },
    ],
  }),
);
```

## On the wire

1. `resources/list` → `{ resources: [{ uri, name, mimeType, ... }] }`
2. `resources/read` → `{ contents: [{ uri, mimeType, text }] }`

A URI pattern (with a `{variable}`) rather than a fixed URI is a
[Resource Template](./templates.md); the suggestions that fill the variable come from
[Completion](./completion.md).
