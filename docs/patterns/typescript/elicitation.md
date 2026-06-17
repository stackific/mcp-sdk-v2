# Elicitation

**Part V · Client features (MRTR)** · Book Ch 19–20 · Stories S30–S31 · sidebar `/elicitation`

Elicitation reverses the usual direction: *inside* a tool call the server asks the client for
user input. The server's `ctx.elicitInput` surfaces at the client host as an
`elicitation/create` request; the host parks it, the human answers in the browser, and the
answer flows back so the tool resumes. Two modes: `form` (a structured schema rendered as a
modal) and `url` (an out-of-band confirmation page). See [MRTR](./mrtr.md) for the retry loop
that carries this.

## Round-trip (reversed inside the call)

```
demo (ElicitationPage) ──REST POST /api/tools/call──▶  client host (Hono)
      ▲  callTool('register_user')                          │ api.callTool(...)
      │                                                     ▼
      │                                      client!.requestWithInput(...) ──tools/call──▶ MCP server
      │                                                     │                              ctx.elicitInput({ mode })
      │   modal / popup ◀── createPending(id) ◀── setRequestHandler('elicitation/create') ◀── elicitation/create
      │        │ user answers                                                                   (over the response stream)
      └────────┴── POST /api/elicitation/:id/resolve ──▶ resolvePending(id) ──▶ retried tools/call ──▶ tool resumes
```

## 1 · Frontend — `demo/src/routes/elicitation.tsx` + `demo/src/routes/elicit.tsx`

The page just calls the tools; the elicitation modal/popup is driven by the wire stream. The
URL flavour confirms on a standalone landing page that posts the answer back:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
resolveElicitation: (id: string, body: { action: string; content?: Record<string, unknown> }) =>
  postJson<{ ok: boolean }>(`/api/elicitation/${id}/resolve`, body),
```

```tsx
// demo/src/routes/elicitation.tsx
<Button onClick={() => form.run(() => backend.callTool('register_user', {}))} data-testid="run-elicit-form">
  Call register_user
</Button>
// ...
<Button onClick={() => url.run(() => backend.callTool('confirm_purchase', {}))} data-testid="run-elicit-url">
  Call confirm_purchase
</Button>
```

```tsx
// demo/src/routes/elicit.tsx — the URL-elicitation landing page
function respond(action: 'accept' | 'decline') {
  if (window.opener) {
    window.opener.postMessage({ source: 'mcp-url-elicitation', elicitationId: id, action }, '*');
  }
  window.close();
}
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts` + `ts-mcp-client/src/elicitation.ts` + `ts-mcp-client/src/index.ts`

The host registers a handler for the server→client `elicitation/create` request. It parks a
pending promise keyed by id, then waits for the human to resolve it:

```ts
// ts-mcp-client/src/mcp-client.ts
c.setRequestHandler('elicitation/create', async (params) => {
  const id = crypto.randomUUID();
  const mode: string = (params['mode'] as string) ?? 'form';
  // ... emit a frame so the SPA renders the form / opens the URL ...
  const result = await createPending(id, mode);
  return result as unknown as Record<string, unknown>;
});
```

```ts
// ts-mcp-client/src/elicitation.ts
export function createPending(id: string, mode: string): Promise<ElicitResult> {
  return new Promise<ElicitResult>((resolve) => {
    pending.set(id, { resolve, mode });
  });
}

export function resolvePending(id: string, result: ElicitResult): boolean {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);
  p.resolve(result);
  return true;
}
```

The human's answer arrives over a separate REST call, which fulfils the parked promise:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/elicitation/:id/resolve', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<ElicitResult>();
  return c.json({ ok: resolvePending(id, body) });
});
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

Inside the tool, `ctx.elicitInput` issues the request back to the client and *blocks* until
the answer returns. `form` mode carries a `requestedSchema`:

```ts
// ts-mcp-server/src/features.ts
async (_args, ctx) => {
  const result = await ctx.elicitInput({
    mode: 'form',
    message: 'Please provide your registration details:',
    requestedSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', title: 'Username', minLength: 3, maxLength: 20 },
        email: { type: 'string', title: 'Email', format: 'email' },
        newsletter: { type: 'boolean', title: 'Subscribe to newsletter?', default: false },
      },
      required: ['username', 'email'],
    },
  });
  if (result.action === 'accept' && result.content) {
    return { content: [{ type: 'text', text: `Registered:\n${JSON.stringify(result.content, null, 2)}` }] };
  }
  // ...
}
```

`url` mode carries an `elicitationId` and a `url` instead — the client opens it out-of-band:

```ts
// ts-mcp-server/src/features.ts
const elicitationId = `purchase-${Date.now()}`;
const result = await ctx.elicitInput({
  mode: 'url',
  message: 'Please confirm your purchase in the opened page.',
  elicitationId,
  url: `${process.env.DEMO_URL ?? 'http://localhost:8000'}/elicit/${elicitationId}`, // ... typeof-guarded in source
});
```

## On the wire

1. `tools/call` (`register_user`) → the server completes the response with an
   `input_required` result naming `elicitation/create`.
2. The client fulfils it locally (no separate server→client request — the answer rides the
   retry) and **retries** `tools/call` with the same arguments plus the gathered
   `{ action, content }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Registered: ...' }] }`.

`action` is one of `accept` / `decline` / `cancel`; only `accept` carries `content`. Compare
with [Sampling](./sampling.md) and [Roots](./roots.md), the other two client features that
ride this same reversed loop.
