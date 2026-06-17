# Errors

**Part VI · Errors & authorization** · Book Ch 12 · Stories S34 · sidebar `/errors`

MCP has two error channels, and they are not interchangeable. A **tool error** rides
*inside* a successful `tools/call` result as `isError: true` — the model sees it and can
recover. A **protocol error** is a JSON-RPC error response (a thrown failure) the
client/host handles — e.g. `-32601` method-not-found or `-32602` invalid-params. This
pattern traces both from the demo SPA through the host to the server and back.

## Round-trip

```
demo (ErrorsPage)                              client host (Hono)
  divide{a:1,b:0} ──POST /api/tools/call──▶  run(c, fn) ── try ──▶ result.isError:true
      ▲                                              │              (ok:true, model recovers)
      │ ApiResultView                                │
  bogus method   ──POST /api/raw────────────▶  run(c, fn) ── catch ─▶ ok:false { message, code }
      └────────── JSON ◀──── Streamable HTTP ──────┴──▶ MCP server
                                          tool: returns isError:true
                                          unknown method: rejects -32601
```

## 1 · Frontend — `demo/src/routes/errors.tsx` + `demo/src/lib/api.ts`

The page exercises both channels from the same `ApiResultView`. A divide-by-zero is a
**tool** error; a bogus JSON-RPC method is a **protocol** error:

```tsx
// demo/src/routes/errors.tsx
// Tool error — divide by zero → successful result with isError:true (NOT a JSON-RPC error).
<Button onClick={() => toolErr.run(() => backend.callTool('divide', { a: 1, b: 0 }))}>
  Divide by zero
</Button>
// ...
// Method not found — an unimplemented JSON-RPC method → -32601 (a protocol error).
<Button onClick={() => method.run(() => backend.raw('does/not/exist', {}))}>
  Call an unimplemented method
</Button>
```

The two `backend.*` wrappers POST to different host routes — `callTool` for a tool, `raw`
for an arbitrary JSON-RPC method:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
// ...
raw: (method: string, params: Record<string, unknown> = {}) =>
  postJson<ApiResult<Any>>('/api/raw', { method, params }),
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts`

The `run(c, fn)` helper is where the two channels converge. A **protocol** error throws
and is caught — shaped into `ok:false { message, code, data }`. A **tool** error does not
throw: its `isError:true` result rides back inside `ok:true`, untouched, for the model (or
the SPA) to inspect:

```ts
// ts-mcp-client/src/index.ts
// Run an MCP call and shape errors uniformly so the SPA can render protocol errors
// (a thrown JSON-RPC error) distinctly from tool errors (a result with isError).
async function run(c: Context, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return c.json({ ok: true, result });
  } catch (e) {
    const err = e as any;
    return c.json({
      ok: false,
      error: { message: err?.message ?? String(err), code: err?.code, data: err?.data },
    });
  }
}
```

`callTool` goes through the SDK driver; `raw` is the generic passthrough that lets an
unknown method reach the server (and reject):

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json<{ ... }>();
  return run(c, () => api.callTool(name, args ?? {}));
});
// ...
app.post('/api/raw', async (c) => {
  const { method, params } = await c.req.json<{ ... }>();
  return run(c, () => api.raw(method, params ?? {}));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
// Generic JSON-RPC passthrough for methods without a dedicated helper (ping, …).
raw: (method: string, params: Record<string, unknown> = {}) =>
  withTrace(method, () => client!.request({ method, params })),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The `divide` tool **returns** `isError: true` — a normal, successful result the model can
read and recover from. It never throws:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'divide',
  {
    title: 'Divide (may error)',
    description: 'Demonstrates a TOOL error (isError:true) vs a protocol error.',
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
  },
  async (args) => {
    if ((args.b as number) === 0) {
      return {
        content: [{ type: 'text', text: 'Cannot divide by zero. Reported as isError:true so the model can recover.' }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: String((args.a as number) / (args.b as number)) }] };
  },
);
```

The protocol error needs no code: `does/not/exist` is not a registered method, so the SDK
runtime rejects it with JSON-RPC `-32601` (Method not found) before any handler runs.
Calling a real tool with the wrong argument type (`add` with a string) likewise fails
schema validation with `-32602` (Invalid params). Both surface in `run`'s `catch`.

## On the wire

```
// Tool error — a SUCCESSFUL tools/call result:
→ tools/call { name: "divide", arguments: { a: 1, b: 0 } }
← { result: { content: [{ type: "text", text: "Cannot divide by zero..." }], isError: true } }

// Protocol error — a JSON-RPC error response:
→ { method: "does/not/exist", params: {} }
← { error: { code: -32601, message: "Method not found" } }
```

The distinction is the whole point: a tool error stays *in band* (a result, `ok:true`), so
the model can adapt; a protocol error breaks the JSON-RPC contract and is handled by the
host (`ok:false`). See [Tools](./tools.md) for the normal success path.
