# Protocol Foundations

**Part I · Foundations** · Book Ch 1 · Stories S01 · sidebar `/foundations`

MCP is a JSON-RPC 2.0 protocol with a single current revision — `2026-07-28` — defined around
three roles: host, client, and server. This pattern shows how the revision is negotiated and
how the server's `Implementation` descriptor reaches the page, with no `initialize` handshake.

## Round-trip

```
demo (FoundationsPage)  ──GET /api/discover, /api/status──▶  client host (Hono)
      ▲                                                          │ api.discover()
      │                                                          ▼
  { negotiatedVersion, serverInfo }                  @stackific/mcp-sdk  Client
      │                                                          │ server/discover (JSON-RPC)
      └────────── revision + serverInfo ◀── Streamable HTTP ─────┴──▶ MCP server (McpServer ctor)
```

## 1 · Frontend — `demo/src/routes/foundations.tsx`

Pressing Run issues `server/discover`, then reads back the negotiated revision and server
identity exactly as cached from the wire:

```tsx
// demo/src/routes/foundations.tsx
onClick={() =>
  status.run(async () => {
    await backend.discover();
    return backend.status();
  })
}
// ...
<Badge variant="blue">revision: {s.negotiatedVersion ?? 'none'}</Badge>
<JsonBlock value={{ negotiatedVersion: s.negotiatedVersion, serverInfo: s.serverInfo }} />
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

The client is constructed with a fixed `CLIENT_INFO` — its on-the-wire `Implementation` — and
exposes the negotiated revision after discovery:

```ts
// ts-mcp-client/src/mcp-client.ts
const CLIENT_INFO = {
  name: 'companion-mcp-client',
  title: 'Companion MCP Client',
  version: '0.1.0',
} as const;
// ...
bus.emitFrame({
  dir: 'local',
  kind: 'lifecycle',
  summary: `connected — protocol ${c.getNegotiatedVersion() ?? 'unknown'}`,
});
```

`getStatus` surfaces the negotiated version and the server's identity that `discover()` cached:

```ts
// ts-mcp-client/src/mcp-client.ts
return {
  connected: !!client,
  negotiatedVersion: client?.getNegotiatedVersion() ?? null,
  serverInfo: client?.getServerVersion() ?? null,
  // ...
};
```

## 3 · MCP server — `ts-mcp-server/src/features.ts` + `ts-mcp-server/src/index.ts`

The server identity comes straight from the constructor's first argument; the entry point
fixes the revision and the stateless Streamable HTTP transport:

```ts
// ts-mcp-server/src/features.ts
const server = new McpServer(
  { name: 'companion-mcp-server', title: 'Companion MCP Server', version: '0.1.0' },
  { /* ...capabilities... */ },
);
```

```ts
// ts-mcp-server/src/index.ts
// Stateless Streamable HTTP, protocol 2026-07-28.
app.all('/mcp', toHonoMcpHandler(buildCompanionServer(), { path: '/mcp' }));
```

The SDK pins the revision as a single constant; identifiers are opaque, exact-matched strings:

```ts
// ts-sdk/src/protocol/meta.ts
/** The protocol revision supported by this SDK release. (§5 / S07) */
export const CURRENT_PROTOCOL_VERSION = '2026-07-28' as const;
```

## On the wire

1. `server/discover` → `{ resultType: "complete", protocolVersion: "2026-07-28", serverInfo, capabilities }`

The negotiated revision is established by [discovery](./overview.md), not a handshake. Every
client request also restates the revision in its [`_meta`](./meta.md) envelope, which is what
makes the server [stateless](./stateless.md).
