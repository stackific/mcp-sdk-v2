# Multi-Round-Trip

**Part III · Lifecycle** · Book Ch 11 · Stories S17 · sidebar `/mrtr`

A multi-round-trip request (MRTR) is the single protocol-wide mechanism by which a server
gathers client-only input *while processing a request*. Instead of opening an independent
server-to-client request, the server completes the in-flight response with an
`input_required` result naming what it needs; the client fulfils it locally and **retries the
same method** with the same arguments plus the gathered responses and the verbatim
`requestState`. This pattern drives that loop with the `summarize` tool, whose handler asks
the client to run a model mid-call.

## Round-trip

```
demo (MrtrPage) ──REST POST /api/tools/call──▶  client host (Hono)
      ▲                                               │ api.callTool('summarize')
      │                                               ▼
  ApiResultView                          client!.requestWithInput(...)
      │                                               │ tools/call ──▶ MCP server
      │                                               │ ◀── input_required (sampling/createMessage)
      │                          run model, re-call   │ tools/call + inputResponses + requestState ──▶
      └──────── final result ◀──── complete ◀─────────┘                              (handler resumes)
```

## 1 · Frontend — `demo/src/routes/mrtr.tsx` + `demo/src/lib/api.ts`

The page calls `backend.callTool('summarize', …)` — an ordinary tool call. The MRTR loop is
invisible from here; the SPA only sees the final result:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/mrtr.tsx
onClick={() =>
  call.run(() =>
    backend.callTool('summarize', {
      text: 'The Model Context Protocol connects AI apps to tools and data over one wire protocol.',
    }),
  )
}
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono route delegates to `api.callTool`:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json<{
    name: string;
    arguments?: Record<string, unknown>;
  }>();
  return run(c, () => api.callTool(name, args ?? {}));
});
```

`callTool` routes through `requestWithInput` — the SDK's MRTR **driver**. When the tool emits
an `input_required` result, the driver fulfils it using the request handlers registered on the
`Client` and retries until the tool completes:

```ts
// ts-mcp-client/src/mcp-client.ts
// tools/call via the SDK's multi-round-trip driver: when the tool needs client input
// (elicitation/sampling/roots → an input_required result), requestWithInput fulfills it
// using the handlers registered above and RETRIES until the tool completes (§11).
callTool: (name: string, args: Record<string, unknown>) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({ method: 'tools/call', params: { name, arguments: args } }),
  ),
```

The fulfilment handlers are the three MRTR triggers, registered once at connect time:

```ts
// ts-mcp-client/src/mcp-client.ts
c.setRequestHandler('sampling/createMessage', async (params) => {
  // ...
  return sample({
    messages: params['messages'] as never,
    maxTokens: params['maxTokens'] as never,
    systemPrompt: params['systemPrompt'] as never,
  });
});
c.setRequestHandler('roots/list', async () => {
  // ...
  return { roots };
});
c.setRequestHandler('elicitation/create', async (params) => {
  // ...bridge to the human in the browser...
});
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

A tool triggers a round trip by calling a `ctx` method. `summarize` calls `ctx.createMessage`
(sampling); the SDK pauses the response, emits the `input_required` result, and resumes the
handler with the model's reply when the retry arrives:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'summarize',
  {
    title: 'Summarize (sampling)',
    description: 'Server asks the CLIENT to run its model (sampling/createMessage).',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to summarize' } },
      required: ['text'],
    },
  },
  async (args, ctx) => {
    const message = await ctx.createMessage({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: `Summarize in one sentence:\n${args.text as string}` },
        },
      ],
      maxTokens: 200,
    });
    // ...resumes here once the client has run the model
  },
);
```

The other two triggers follow the same shape: `register_user` calls `ctx.elicitInput`, and
`show_roots` calls `ctx.listRoots`:

```ts
// ts-mcp-server/src/features.ts
async (_args, ctx) => {
  const result = await ctx.elicitInput({
    mode: 'form',
    message: 'Please provide your registration details:',
    // ...
  });
  // ...
}
```

```ts
// ts-mcp-server/src/features.ts
async (_args, ctx) => {
  const result = (await ctx.listRoots()) as { roots?: unknown };
  // ...
}
```

## On the wire

1. `tools/call` (summarize) → `{ result: { ..., requestState, input_required: [sampling/createMessage] } }`
2. client runs the model, then re-sends `tools/call` with `inputResponses` + the verbatim `requestState` (a **new** request id)
3. `tools/call` → `{ result: { content: [...], _meta: { ... } } }` — the `complete` result

`requestState` is an opaque continuation token the client echoes back byte-for-byte; the loop
repeats until a `complete` result or an error. A server may only request input kinds the
client declared — otherwise it returns the missing-capability error `-32003`.

See [Elicitation](./elicitation.md), [Sampling](./sampling.md), and [Roots](./roots.md) for
each trigger in depth.
