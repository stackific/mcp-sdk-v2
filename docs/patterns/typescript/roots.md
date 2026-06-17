# Roots

**Part V · Client features (MRTR)** · Book Ch 22 · Stories S32 · sidebar `/roots`

Roots reverse direction: *inside* a tool call the server asks the client for its workspace
roots. The server's `ctx.listRoots` surfaces at the client host as a `roots/list` request; the
host returns its configured roots and the list flows back so the tool resumes. This pattern
edits the roots the client will report, then calls `show_roots`. See [MRTR](./mrtr.md) for the
retry loop.

## Round-trip (reversed inside the call)

```
demo (RootsPage) ──REST POST /api/roots (setRoots)──▶  client host (Hono)  setRoots()
      ▲          ──REST POST /api/tools/call──────────▶        │ api.callTool('show_roots')
      │                                                         ▼
      │                                      client!.requestWithInput(...) ──tools/call──▶ MCP server
      │                                                         │                          ctx.listRoots()
      │                                                         │ ◀── roots/list ◀──────────┘ (over the response stream)
      │                              setRequestHandler('roots/list') ──▶ return { roots }
      └──────── { content } ◀── retried tools/call ◀── roots flow back, tool resumes
```

## 1 · Frontend — `demo/src/routes/roots.tsx` + `demo/src/lib/api.ts`

The page edits the roots JSON, saves it to the host, then calls the tool:

```ts
// demo/src/lib/api.ts
getRoots: () => getJson<{ roots: { uri: string; name?: string }[] }>('/api/roots'),
setRoots: (roots: { uri: string; name?: string }[]) =>
  postJson<{ roots: Any[] }>('/api/roots', { roots }),
```

```tsx
// demo/src/routes/roots.tsx
function saveRoots() {
  try {
    const parsed = JSON.parse(roots);
    void save.run(() => backend.setRoots(parsed));
  } catch {
    // invalid JSON — ignore
  }
}
// ...
<Button onClick={() => call.run(() => backend.callTool('show_roots', {}))} data-testid="run-roots">
  Call show_roots
</Button>
```

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts` + `ts-mcp-client/src/index.ts`

The host registers a handler for the server→client `roots/list` request that simply returns the
configured roots:

```ts
// ts-mcp-client/src/mcp-client.ts
c.setRequestHandler('roots/list', async () => {
  // ... emit a 'client returning configured roots' frame ...
  return { roots };
});
```

`roots` is host state, seeded with defaults and editable over REST via `getRoots`/`setRoots`:

```ts
// ts-mcp-client/src/mcp-client.ts
let roots: { uri: string; name?: string }[] = [
  { uri: 'file:///workspace/companion-project', name: 'companion-project' },
  { uri: 'file:///workspace/shared-lib', name: 'shared-lib' },
];
// ...
export function getRoots() {
  return roots;
}
export function setRoots(r: { uri: string; name?: string }[]) {
  roots = r;
}
```

```ts
// ts-mcp-client/src/index.ts
app.get('/api/roots', (c) => c.json({ roots: getRoots() }));
app.post('/api/roots', async (c) => {
  const { roots } = await c.req.json<{ roots: { uri: string; name?: string }[] }>();
  setRoots(roots ?? []);
  return c.json({ roots: getRoots() });
});
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

Inside the tool, `ctx.listRoots` issues the request back to the client and blocks until the
list returns:

```ts
// ts-mcp-server/src/features.ts
async (_args, ctx) => {
  const result = (await ctx.listRoots()) as { roots?: unknown };
  return {
    content: [{ type: 'text', text: `Client roots:\n${JSON.stringify(result.roots, null, 2)}` }],
  };
}
```

## On the wire

1. `tools/call` (`show_roots`) → the server completes the response with an `input_required`
   result naming `roots/list`.
2. The client supplies its roots and **retries** `tools/call` with the same arguments plus the
   gathered `{ roots }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Client roots: [...]' }] }`.

Roots is a *deprecated* client capability — convey workspace locations via tool parameters or
resource URIs instead. [Elicitation](./elicitation.md) and [Sampling](./sampling.md) are the
other two client features riding this reversed loop.
