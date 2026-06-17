# Tools

**Part IV · Server features** · Book Ch 13 · Stories S24–S25 · sidebar `/tools`

Tools are the model-controlled primitive. The server advertises them via `tools/list`
(each with a JSON Schema 2020-12 `inputSchema`), and the client invokes one with
`tools/call`. This pattern traces a single call from the demo SPA, through the MCP client
host, to the server and back.

## Round-trip

```
demo (ToolsPage)  ──REST POST /api/tools/call──▶  client host (Hono)
      ▲                                                  │ api.callTool()
      │                                                  ▼
  ApiResultView                                @stackific/mcp-sdk  Client
      │                                                  │ tools/call (JSON-RPC)
      └──────── JSON result ◀──── Streamable HTTP ───────┴──▶ MCP server (registerTool)
```

## 1 · Frontend — `demo/src/routes/tools.tsx` + `demo/src/lib/api.ts`

The page calls `backend.callTool(name, args)`, a thin wrapper that POSTs to the client host:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/tools.tsx
function doCall() {
  const parsed = JSON.parse(args || '{}');
  void call.run(() => backend.callTool(name, parsed));
}
// ...
<Button onClick={doCall}>Call tool</Button>
<ApiResultView result={call.data} />
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono route unwraps the REST body and delegates to the SDK `Client`:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json();
  return run(c, () => api.callTool(name, args ?? {}));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
callTool: (name, args) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({ method: 'tools/call', params: { name, arguments: args } }),
  ),
```

`requestWithInput` is the SDK's multi-round-trip driver: if the tool needs client input
(elicitation/sampling/roots), it fulfils the server's request and retries until the tool
completes (§11). For a plain tool, it behaves like a single `tools/call`.

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The server registers each tool with metadata, a JSON Schema, and an async handler:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'echo',
  {
    title: 'Echo',
    description: 'The simplest possible tool: echoes text back.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  async (args) => ({ content: [{ type: 'text', text: String(args.text) }] }),
);
```

## On the wire

1. `tools/list` → `{ tools: [{ name, inputSchema, annotations, ... }] }`
2. `tools/call` → `{ content: [{ type: 'text', text: '...' }] }`

A divide-by-zero (the `divide` tool) returns `isError: true` inside a **successful**
result — a *tool* error the model can recover from — not a JSON-RPC protocol error.
See [Errors](./errors.md) for the distinction.
