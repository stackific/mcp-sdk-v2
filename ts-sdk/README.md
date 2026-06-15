# @stackific/mcp-sdk-ts

A specification-compliant **Model Context Protocol** SDK for TypeScript, targeting
protocol revision **`2026-07-28`** (the stateless, per-request `_meta` model).

It ships both halves of the protocol and is **edge-friendly** — the client and
server runtimes use only Web-platform APIs (`fetch`, `ReadableStream`,
`TextDecoder`, `AbortController`), so the same code runs on **Node**, **Cloudflare
Workers**, **Deno**, and **Bun**:

- **Client** — `Client` host + `StreamableHTTPClientTransport` (`./client`)
- **Server** — `McpServer` dispatcher + a Web-standard request handler, with
  **Node** and **Hono** adapters (`./server`, `./server/node`)
- **Protocol primitives** — JSON-RPC framing, capability negotiation, discovery,
  transports, tasks, authorization, and more (package root)

## Install

```bash
pnpm add @stackific/mcp-sdk-ts
# or: npm i / yarn add
```

## Entry points

| Import | Contents | Runtime |
| --- | --- | --- |
| `@stackific/mcp-sdk-ts` | All protocol primitives + client + server | Node |
| `@stackific/mcp-sdk-ts/client` | `Client`, `StreamableHTTPClientTransport` | **edge-safe** (no `node:*`) |
| `@stackific/mcp-sdk-ts/server` | `McpServer`, `createMcpRequestHandler`, `toHonoMcpHandler` | **edge-safe** (no `node:*`) |
| `@stackific/mcp-sdk-ts/server/node` | `createNodeHttpHandler` | Node only |

> The package **root** re-exports everything (including the stdio transport and the
> authorization helpers, which use `node:*`). For Cloudflare Workers, import from the
> node-free **`/client`** and **`/server`** subpaths.

---

## Client

The `Client` host owns the request lifecycle: it stamps every request with the
required `_meta` envelope (protocol version, client identity, capabilities),
correlates responses by id, routes server→client requests (sampling / elicitation
/ roots) to your handlers, and performs discovery + revision negotiation.

```ts
import { Client, StreamableHTTPClientTransport } from '@stackific/mcp-sdk-ts/client';

const transport = new StreamableHTTPClientTransport('https://my-server.example/mcp');
const client = new Client(
  { name: 'my-app', version: '1.0.0' },
  { capabilities: { elicitation: { form: {} }, sampling: {} } },
);

client.connect(transport);

// Server→client requests (handled while a tool call is in flight):
client.setRequestHandler('elicitation/create', async (params) => {
  // ...ask the user...
  return { action: 'accept', content: { name: 'Ada' } };
});
client.setRequestHandler('sampling/createMessage', async (params) => {
  // ...run your model...
  return { role: 'assistant', content: { type: 'text', text: 'hi' }, model: 'my-model' };
});

// Discover server identity/capabilities and negotiate the revision:
await client.discover();
console.log(client.getServerVersion(), client.getNegotiatedVersion());

// Call a tool (with optional cancellation + progress):
const controller = new AbortController();
const result = await client.callTool(
  { name: 'add', arguments: { a: 2, b: 3 } },
  { signal: controller.signal, onProgress: (p) => console.log(p), timeoutMs: 30_000 },
);

// Any JSON-RPC method:
const tools = await client.request({ method: 'tools/list' });

await client.close();
```

Bearer auth for a protected server:

```ts
const transport = new StreamableHTTPClientTransport(url, {
  authProvider: { token: async () => await getAccessToken() }, // sent as `Authorization: Bearer …`
});
```

---

## Server

Define a server once with `McpServer`, then serve it on any runtime.

```ts
import { McpServer } from '@stackific/mcp-sdk-ts/server';

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'my-server', version: '1.0.0' },
    { tools: {}, resources: {}, prompts: {}, completions: {} },
  );

  server.registerTool(
    'add',
    {
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    },
    async (args) => ({ content: [{ type: 'text', text: String((args.a as number) + (args.b as number)) }] }),
  );

  // A tool that solicits input from the user mid-call (server→client request):
  server.registerTool('register_user', {}, async (_args, ctx) => {
    const answer = await ctx.elicitInput({ mode: 'form' });
    return { content: [{ type: 'text', text: 'registered' }], structuredContent: answer };
  });

  server.registerResource('readme', 'file:///README.md', { mimeType: 'text/markdown' }, async (uri) => ({
    contents: [{ uri, mimeType: 'text/markdown', text: '# Hello' }],
  }));

  return server;
}
```

Tool handlers get a `ctx` with `notify`, `log`, `elicitInput`, `createMessage`,
`listRoots`, progress info, an `AbortSignal`, and `authInfo`.

### Serve on Node (`node:http`)

```ts
import { createServer } from 'node:http';
import { createNodeHttpHandler } from '@stackific/mcp-sdk-ts/server/node';
import { buildServer } from './server.js';

createServer(createNodeHttpHandler(buildServer(), { path: '/mcp' })).listen(7001, () => {
  console.log('MCP server on http://localhost:7001/mcp');
});
```

### Serve with Hono (Node, Workers, Deno, Bun)

```ts
import { Hono } from 'hono';
import { toHonoMcpHandler } from '@stackific/mcp-sdk-ts/server';
import { buildServer } from './server.js';

const app = new Hono();
app.all('/mcp', toHonoMcpHandler(buildServer()));

export default app; // Cloudflare Workers / Deno / Bun
// On Node: import { serve } from '@hono/node-server'; serve({ fetch: app.fetch, port: 7001 });
```

### Serve on Cloudflare Workers (plain `fetch`)

```ts
import { createMcpRequestHandler } from '@stackific/mcp-sdk-ts/server';
import { buildServer } from './server.js';

const handle = createMcpRequestHandler(buildServer(), { path: '/mcp' });
export default { fetch: (request: Request) => handle(request) };
```

Protect the endpoint with an `authGate`:

```ts
const handle = createMcpRequestHandler(server, {
  authGate: (request) => {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const authInfo = verify(token);
    return authInfo
      ? { ok: true, authInfo }
      : { ok: false, status: 401, wwwAuthenticate: 'Bearer', body: { error: 'unauthorized' } };
  },
});
```

---

## Protocol model (2026-07-28)

- **Stateless.** No `Mcp-Session-Id`. Every request is self-contained; its `_meta`
  carries the protocol version, client identity, and capabilities. A server derives
  context from the request, never from the connection.
- **Streamable HTTP.** Each client message is one `POST`. `initialize` returns a
  single JSON response; every other request returns `text/event-stream` carrying
  interim notifications and any server→client requests, then the final response.
- **Discovery.** `server/discover` is the entry point; the client negotiates the
  highest mutually-supported revision.
- **Server→client requests** (elicitation, and the Deprecated sampling/roots) are
  issued on the originating request's stream and correlated by JSON-RPC id.

## API reference

Full API documentation is generated from source (TypeDoc) into [`docs/api/`](./docs/api/README.md)
— browsable as Markdown directly on GitHub. Regenerate after changing the public
surface:

```bash
pnpm docs        # typedoc → docs/api/ (Markdown)
```

## Development

```bash
pnpm install
pnpm build       # tsc → dist/
pnpm test        # vitest
pnpm typecheck
pnpm docs        # regenerate docs/api/
```
