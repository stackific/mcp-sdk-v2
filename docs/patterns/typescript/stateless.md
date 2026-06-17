# Stateless Model

**Part I · Foundations** · Book Ch 4 · Stories S06 · sidebar `/stateless`

MCP V2 processes every request independently: everything needed to handle a request lives in
that request's own `_meta`, and nothing is remembered between requests. There is no
`Mcp-Session-Id` and no `initialize` — `server/discover` carries identity and capabilities, and
each request re-states the rest. This pattern shows the stateless transport and repeated discovery.

## Round-trip

```
demo (StatelessPage)  ──GET /api/status──▶  client host (Hono)
      ▲                                         │ getStatus()
      │                                         ▼
  JsonBlock(status)                  @stackific/mcp-sdk  Client + StreamableHTTPClientTransport
      │                                         │ server/discover repeated, no session id
      └──── { serverUrl, negotiatedVersion } ◀──┴──▶ MCP server (stateless McpServer)
```

## 1 · Frontend — `demo/src/routes/stateless.tsx`

The page reads status and surfaces that the server URL and version are derived per request, not
from session history:

```tsx
// demo/src/routes/stateless.tsx
<Button onClick={() => status.run(() => backend.status())}>Read status</Button>
// ...
<div className="text-slate-400">Server URL</div>
<div className="font-mono">{s.serverUrl ?? '—'}</div>
<div className="text-slate-400">Negotiated version</div>
<div className="font-mono">{s.negotiatedVersion ?? '—'}</div>
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

The transport is a plain `StreamableHTTPClientTransport` over a URL — no session handshake. The
`reconnect` path tears down and re-runs `server/discover` every time, proving each connection is
disposable:

```ts
// ts-mcp-client/src/mcp-client.ts
const t = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
// ...
const c = new Client(CLIENT_INFO, { capabilities: CLIENT_CAPABILITIES });
c.connect(t);
await c.discover(); // re-establishes identity/version with no session state
```

```ts
// ts-mcp-client/src/mcp-client.ts
export async function reconnect(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    transport = null;
  }
  await withTrace('reconnect', async () => {}); // drives a fresh server/discover
}
```

## 3 · MCP server — `ts-mcp-server/src/index.ts` + `ts-mcp-server/src/features.ts`

The server is mounted as a stateless Streamable HTTP handler; the same Hono app would run
unchanged on Workers/Deno/Bun precisely because it keeps no per-connection state:

```ts
// ts-mcp-server/src/index.ts
// Stateless Streamable HTTP, protocol 2026-07-28.
app.all('/mcp', toHonoMcpHandler(buildCompanionServer(), { path: '/mcp' }));
```

`buildCompanionServer` constructs a fresh `McpServer` whose only state is its registered
features — the request itself supplies identity, version, and capabilities each time:

```ts
// ts-mcp-server/src/features.ts
export function buildCompanionServer(): McpServer {
  const server = new McpServer(
    { name: 'companion-mcp-server', title: 'Companion MCP Server', version: '0.1.0' },
    { /* ...capabilities... */ },
  );
  // ...registers tools/resources/prompts only — no session bookkeeping...
  return server;
}
```

## On the wire

1. `server/discover` → identity + capabilities + revision (replaces `initialize`; no session created)
2. every later request carries `_meta` → `{ io.modelcontextprotocol/protocolVersion, clientInfo, clientCapabilities }`

No `Mcp-Session-Id` header is required for protocol state — a server may serve any two requests
on the same connection from different instances with identical behavior. Genuine cross-call
continuity is explicit, via server-minted opaque handles (a pagination `nextCursor`, an
`io.modelcontextprotocol/related-task`). The per-request envelope is [The _meta Envelope](./meta.md);
discovery is [Overview & Discovery](./overview.md).
