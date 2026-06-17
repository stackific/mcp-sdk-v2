# Extensions Map

**Part I · Foundations** · Book Ch 11 · Stories S11·S38 · sidebar `/extensions`

Extensions are how MCP grows beyond its core: namespaced, opt-in additions advertised on both
`ClientCapabilities` and `ServerCapabilities`, active only in the intersection of what both
peers advertise. This pattern reads the negotiated capabilities to show the Tasks extension the
companion server advertises at discovery.

## Round-trip

```
demo (ExtensionsPage)  ──GET /api/status──▶  client host (Hono)
      ▲                                          │ getStatus()
      │                                          ▼
  JsonBlock(extensions / tasks)        @stackific/mcp-sdk  Client
      │                                          │ server caps cached from server/discover
      └──── { serverExtensions, tasks } ◀────────┴──▶ MCP server (tasks capability in ctor)
```

## 1 · Frontend — `demo/src/routes/extensions.tsx` + `demo/src/lib/api.ts`

The page reads status and shows the server's `extensions` map, or — when none is advertised —
the extension-bearing `tasks` capability it does negotiate:

```tsx
// demo/src/routes/extensions.tsx
const extensions = s?.serverExtensions ?? null;
const tasks = (s?.serverCapabilities as Record<string, unknown> | null | undefined)?.tasks;
// ...
<Button onClick={() => call.run(() => backend.status())}>Read extensions map</Button>
// ...
<JsonBlock value={hasExtensions ? extensions : { tasks: tasks ?? null }} />
```

```ts
// demo/src/lib/api.ts
status: () => getJson<BackendStatus>('/api/status'),
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

`getStatus` pulls the `extensions` map out of the cached server capabilities; the client also
advertises a `tasks` capability of its own, so the extension can be active by intersection:

```ts
// ts-mcp-client/src/mcp-client.ts
export function getStatus() {
  const caps = client?.getServerCapabilities() ?? null;
  return {
    serverCapabilities: caps,
    serverExtensions: (caps?.['extensions'] as unknown) ?? null,
    clientCapabilities: CLIENT_CAPABILITIES, // includes `tasks: {}`
    // ...
  };
}
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The `tasks` entry in the constructor's capabilities object *is* the advertised extension — a
namespaced settings object declaring its sub-features (list, cancel, augmented `tools/call`):

```ts
// ts-mcp-server/src/features.ts
const server = new McpServer(
  { name: 'companion-mcp-server', title: 'Companion MCP Server', version: '0.1.0' },
  {
    // ...core capabilities...
    tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
  },
);
```

## On the wire

1. `server/discover` result → `{ capabilities: { …, tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } } } }`

An extension is active only when both peers advertise the same identifier (Tasks is
`io.modelcontextprotocol/tasks`); a peer never exercises one the other side did not advertise.
Unknown extension keys and unknown settings keys are ignored, never errors. Extensions are a
specialization of [Capabilities](./capabilities.md) negotiation; the Tasks extension itself is
exercised from the `/tasks` page.
