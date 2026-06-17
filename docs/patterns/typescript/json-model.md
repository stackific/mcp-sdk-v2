# JSON Value Model

**Part I · Foundations** · Book Ch 2 · Stories S02 · sidebar `/json-model`

Everything on the wire is one of six JSON value forms (string, number, boolean, null, object,
array). A core invariant is forward compatibility: receivers ignore object members and `_meta`
keys they do not recognize. This pattern calls `echo` with an extra argument and an unknown
`_meta` key and shows the server accept and ignore both.

## Round-trip

```
demo (JsonModelPage)  ──POST /api/tools/call-traced──▶  client host (Hono)
      ▲                                                     │ api.callToolWithMeta('echo', …)
      │                                                     ▼
  ApiResultView                                  @stackific/mcp-sdk  Client
      │                                                     │ tools/call (JSON-RPC, _meta stamped)
      └──────── echoed text ◀──── Streamable HTTP ──────────┴──▶ MCP server (echo tool)
```

## 1 · Frontend — `demo/src/routes/json-model.tsx` + `demo/src/lib/api.ts`

The page sends a *recognized* argument plus an *unrecognized* one, and a custom `_meta` key:

```tsx
// demo/src/routes/json-model.tsx
call.run(() =>
  backend.callToolTraced(
    'echo',
    { text: 'hello', unknownExtra: 123 },
    { 'companion/unknown-meta': true },
  ),
)
```

```ts
// demo/src/lib/api.ts
callToolTraced: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

The caller's `_meta` is merged into the request params; the SDK (de)serializes the whole frame
as a single JSON object:

```ts
// ts-mcp-client/src/mcp-client.ts
callToolWithMeta: (name, args, meta) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({
      method: 'tools/call',
      params: { name, arguments: args, _meta: meta },
    }),
  ),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The SDK validates `inputSchema` but never rejects unknown members; `echo` reads only `text`
and ignores `unknownExtra` entirely:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'echo',
  {
    title: 'Echo',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo back' } },
      required: ['text'],
    },
    // ...
  },
  async (args) => ({ content: [{ type: 'text', text: String(args.text) }] }),
);
```

The forward-compatibility rule is enforced at the `_meta` gate: only the three required keys
are checked; the schema is `.passthrough()`, so extra keys survive:

```ts
// ts-sdk/src/protocol/meta.ts
export const RequestMetaObjectSchema = z
  .object({
    'io.modelcontextprotocol/protocolVersion': z.string(),
    'io.modelcontextprotocol/clientInfo': ImplementationSchema,
    'io.modelcontextprotocol/clientCapabilities': z.record(z.unknown()),
    // ...
  })
  .passthrough(); // unrecognized keys are preserved, never rejected
```

## On the wire

A representative `tools/call` frame the SDK emits (note the dotted, slash-prefixed `_meta` key
names and the unrecognized members that survive):

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "echo",
    "arguments": { "text": "hello", "unknownExtra": 123 },
    "_meta": {
      "companion/unknown-meta": true,
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "companion-mcp-client", "version": "0.1.0" },
      "io.modelcontextprotocol/clientCapabilities": { "elicitation": {}, "sampling": {} }
    }
  }
}
```

See [JSON-RPC Framing](./jsonrpc.md) for the envelope and [The _meta Envelope](./meta.md) for
the key-naming grammar.
