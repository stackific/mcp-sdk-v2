# Sampling

**Part V · Client features (MRTR)** · Book Ch 21 · Stories S33 · sidebar `/sampling`

Sampling reverses direction: *inside* a tool call the server borrows the client's model. The
server's `ctx.createMessage` surfaces at the client host as a `sampling/createMessage`
request; the host runs the model (here DeepSeek via its Anthropic-compatible endpoint) and the
completion flows back so the tool resumes. This pattern calls the `summarize` tool, which asks
the client to summarize text. See [MRTR](./mrtr.md) for the retry loop.

## Round-trip (reversed inside the call)

```
demo (SamplingPage) ──REST POST /api/tools/call──▶  client host (Hono)
      ▲  callTool('summarize', { text })                 │ api.callTool(...)
      │                                                   ▼
      │                                    client!.requestWithInput(...) ──tools/call──▶ MCP server
      │                                                   │                              ctx.createMessage({ messages })
      │                                                   │ ◀── sampling/createMessage ◀──┘ (over the response stream)
      │                              setRequestHandler('sampling/createMessage') ──▶ sample() ──▶ DeepSeek
      └──────── { content } ◀── retried tools/call ◀── model reply flows back, tool resumes
```

## 1 · Frontend — `demo/src/routes/sampling.tsx` + `demo/src/lib/api.ts`

The page calls the tool; the sampling request is handled transparently inside the host:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/sampling.tsx
<Button onClick={() => call.run(() => backend.callTool('summarize', { text }))} data-testid="run-sampling">
  Summarize
</Button>
<ApiResultView result={call.data} />
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts` + `ts-mcp-client/src/sampling.ts`

The host registers a handler for the server→client `sampling/createMessage` request and routes
it to the model:

```ts
// ts-mcp-client/src/mcp-client.ts
c.setRequestHandler('sampling/createMessage', async (params) => {
  // ... emit a 'client handling sampling → DeepSeek' frame ...
  return sample({
    messages: params['messages'] as never,
    maxTokens: params['maxTokens'] as never,
    systemPrompt: params['systemPrompt'] as never,
  });
});
```

`sample` talks to DeepSeek through the Anthropic-compatible SDK, falling back to a deterministic
mock when no key is configured:

```ts
// ts-mcp-client/src/sampling.ts
async function sampleWithDeepSeek(params: SampleParams): Promise<SampleResult> {
  const client = new Anthropic({ apiKey: DEEPSEEK_API_KEY, baseURL: DEEPSEEK_BASE_URL });
  const resp = await client.messages.create({
    model: DEEPSEEK_MODEL,
    max_tokens: params.maxTokens ?? 512,
    system: params.systemPrompt,
    messages: params.messages.map((m) => ({ role: m.role, content: contentToText(m.content) })),
  });
  // ...
  return { role: 'assistant', content: { type: 'text', text }, model: resp.model, stopReason: resp.stop_reason ?? 'endTurn' };
}

export async function sample(params: SampleParams): Promise<SampleResult> {
  return HAS_KEY ? sampleWithDeepSeek(params) : sampleMock(params);
}
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

Inside the tool, `ctx.createMessage` issues the request back to the client and blocks until the
completion returns:

```ts
// ts-mcp-server/src/features.ts
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
  const content = (message as { content?: { type?: string; text?: string } }).content;
  const out = content?.type === 'text' ? content.text : JSON.stringify(content);
  return {
    content: [{ type: 'text', text: `Model "${String((message as { model?: string }).model)}" replied:\n${out}` }],
  };
}
```

## On the wire

1. `tools/call` (`summarize`) → the server completes the response with an `input_required`
   result naming `sampling/createMessage`.
2. The client runs the model and **retries** `tools/call` with the same arguments plus the
   sampled `{ role, content, model, stopReason }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Model "..." replied: ...' }] }`.

Sampling is a *deprecated* client capability — prefer [Elicitation](./elicitation.md) for
structured user input. [Roots](./roots.md) is the third client feature riding this reversed
loop.
