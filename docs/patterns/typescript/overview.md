# Overview & Discovery

**Part I · Foundations** · Book Ch 9–11 · Stories S07–S09 · sidebar `/`

Discovery is the single round-trip that replaces the old `initialize` handshake. The client
sends `server/discover`; the server answers with its identity, capabilities, and supported
revisions — and the client caches the negotiated version for the status panel. This pattern
traces that round-trip from the landing page through the MCP client host to the server.

## Round-trip

```
demo (OverviewPage)  ──REST GET /api/discover──▶  client host (Hono)
      ▲                                                 │ api.discover()
      │                                                 ▼
  ApiResultView                              @stackific/mcp-sdk  Client
      │                                                 │ server/discover (JSON-RPC)
      └──────── { discoverResult, status } ◀─ Streamable HTTP ─┴──▶ MCP server (McpServer ctor)
```

## 1 · Frontend — `demo/src/routes/overview.tsx` + `demo/src/lib/api.ts`

On mount the page (re)connects, then a button drives a visible `server/discover`:

```tsx
// demo/src/routes/overview.tsx
useEffect(() => {
  void connect.run(() => backend.connect());
}, []);
// ...
<Button onClick={() => discover.run(() => backend.discover())}>Call server/discover</Button>
<ApiResultView result={discover.data} />
```

Both calls are thin REST wrappers onto the client host:

```ts
// demo/src/lib/api.ts
connect: () => postJson<ApiResult<BackendStatus>>('/api/connect', {}),
discover: () => getJson<ApiResult<Any>>('/api/discover'),
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono routes delegate to `reconnect()` (always a fresh discover) and `api.discover()`:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/connect', (c) =>
  run(c, async () => {
    await reconnect();
    return getStatus();
  }),
);
app.get('/api/discover', (c) => run(c, () => api.discover()));
```

`ensureConnected` builds the transport and `Client`, connects, then runs the first
`server/discover`; `getStatus` exposes the negotiated version and server identity it cached:

```ts
// ts-mcp-client/src/mcp-client.ts
const c = new Client(CLIENT_INFO, { capabilities: CLIENT_CAPABILITIES });
// ...
c.connect(t);
client = c;
await c.discover(); // populates negotiated revision + server identity
```

```ts
// ts-mcp-client/src/mcp-client.ts
discover: () =>
  withTrace('discover', async () => {
    // server/discover is the 2026-07-28 entry point.
    const discoverResult = await client!.discover();
    return { discoverResult, discoverError, status: getStatus() };
  }),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The constructor is the whole story: its first argument is the server identity and its second
is the capabilities object — exactly the two things `server/discover` returns:

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

1. `server/discover` → `{ resultType: "complete", protocolVersion, capabilities, serverInfo, instructions? }`

`serverInfo` is the `Implementation` from the constructor's first argument; `capabilities` is
the second. The client caches all three so [Capabilities](./capabilities.md) and
[Foundations](./foundations.md) can read them back without another round-trip. See
[Stateless Model](./stateless.md) for why `server/discover` — not a session — carries this.
