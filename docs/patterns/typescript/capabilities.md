# Capabilities

**Part I · Foundations** · Book Ch 10 · Stories S10 · sidebar `/capabilities`

Capabilities are the two declaration objects — `ClientCapabilities` and `ServerCapabilities` —
that tell each peer which method families and behaviors the other supports. A feature is usable
only when both sides declare its governing capability. This pattern reads the live status and
shows both objects side by side.

## Round-trip

```
demo (CapabilitiesPage)  ──GET /api/status──▶  client host (Hono)
      ▲                                            │ getStatus()
      │                                            ▼
  JsonBlock × 2                        @stackific/mcp-sdk  Client
      │                                            │ client caps stamped per request; server caps from discover
      └── { clientCapabilities, serverCapabilities } ◀──┴──▶ MCP server (McpServer ctor caps)
```

## 1 · Frontend — `demo/src/routes/capabilities.tsx` + `demo/src/lib/api.ts`

The page fetches status and renders what each side declared:

```tsx
// demo/src/routes/capabilities.tsx
<Button onClick={() => status.run(() => backend.status())}>Load capabilities</Button>
// ...
<p>clientCapabilities</p>
<JsonBlock value={s.clientCapabilities ?? {}} />
<p>serverCapabilities</p>
<JsonBlock value={s.serverCapabilities ?? {}} />
```

```ts
// demo/src/lib/api.ts
status: () => getJson<BackendStatus>('/api/status'),
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

The client declares `CLIENT_CAPABILITIES` once and stamps them into every request's `_meta`;
`getServerCapabilities()` returns what the latest `server/discover` advertised:

```ts
// ts-mcp-client/src/mcp-client.ts
const CLIENT_CAPABILITIES = {
  elicitation: { form: {}, url: {} },
  sampling: {},
  roots: {},
  tasks: {},
} as const;
```

```ts
// ts-mcp-client/src/mcp-client.ts
export function getStatus() {
  const caps = client?.getServerCapabilities() ?? null;
  return {
    serverCapabilities: caps,
    clientCapabilities: CLIENT_CAPABILITIES,
    // ...
  };
}
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The constructor's second argument *is* `ServerCapabilities` — the exact object discovery
returns. Sub-flags like `tools.listChanged` refine a capability without replacing it:

```ts
// ts-mcp-server/src/features.ts
const server = new McpServer(
  { name: 'companion-mcp-server', title: 'Companion MCP Server', version: '0.1.0' },
  {
    logging: {},
    completions: {},
    tools: { listChanged: true },
    resources: { listChanged: true },
    prompts: { listChanged: true },
    tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
  },
);
```

## On the wire

1. `server/discover` result → `{ capabilities: { logging: {}, completions: {}, tools: { listChanged: true }, … } }`
2. every client request `_meta` → `{ io.modelcontextprotocol/clientCapabilities: { elicitation: {…}, sampling: {}, roots: {}, tasks: {} } }`

The mere presence of a field declares support; empty `{}` is valid and declares no optional
behaviors. The client caches server capabilities from the latest [discover](./overview.md);
the server re-reads client capabilities from each request's [`_meta`](./meta.md). If a request
needs an undeclared client capability the server rejects it with `-32003`. The `tasks` entry is
an extension capability — see [Extensions Map](./extensions.md).
