# Completion

**Part IV · Server features** · Book Ch 17 · Stories S29 · sidebar `/completion`

`completion/complete` is server-driven autocomplete for [prompt](./prompts.md) arguments and
[resource-template](./templates.md) variables. The client sends a `ref` (which prompt or
template), the `argument` being typed, and optional `context`; the server returns matching
`values`. This pattern types into the `language` argument of the `greeting` prompt and shows
the suggestions.

## Round-trip

```
demo (CompletionPage) ──REST POST /api/complete──▶  client host (Hono)
      ▲     { ref, argument: { name:'language', value }, context }   │ api.complete(ref, argument, context)
      │                                                              ▼
  Badge values[]                                @stackific/mcp-sdk  Client
      │                                                              │ completion/complete (JSON-RPC)
      └──────── { completion: { values } } ◀──── Streamable HTTP ────┴──▶ MCP server (complete callback)
```

## 1 · Frontend — `demo/src/routes/completion.tsx` + `demo/src/lib/api.ts`

Each keystroke calls `backend.complete` with a `ref/prompt` reference and the partial value:

```ts
// demo/src/lib/api.ts
complete: (ref: unknown, argument: unknown, context?: unknown) =>
  postJson<ApiResult<Any>>('/api/complete', { ref, argument, context }),
```

```tsx
// demo/src/routes/completion.tsx
async function suggest(v: string) {
  setValue(v);
  await complete.run(() =>
    backend.complete(
      { type: 'ref/prompt', name: 'greeting' },
      { name: 'language', value: v },
      { arguments: {} },
    ),
  );
}
// ...
const values: string[] = complete.data?.ok ? (complete.data.result.completion?.values ?? []) : [];
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono route forwards `ref`/`argument`/`context` straight to the SDK `Client`:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/complete', async (c) => {
  const { ref, argument, context } = await c.req.json<{
    ref: unknown;
    argument: unknown;
    context?: unknown;
  }>();
  return run(c, () => api.complete(ref, argument, context));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
complete: (ref: unknown, argument: unknown, context?: unknown) =>
  withTrace('completion/complete', () => client!.complete(ref, argument, context)),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

There is no separate `registerCompletion`: a completer is just a `complete` callback declared
*inline* on the thing being completed. For the `city-weather` template it lives on the `city`
variable:

```ts
// ts-mcp-server/src/features.ts
const cities = ['oslo', 'tokyo', 'cairo', 'lima', 'quito', 'osaka'];
server.registerResourceTemplate(
  'city-weather',
  {
    uriTemplate: 'weather://{city}/current',
    // ...
    complete: { city: (value) => cities.filter((c) => c.startsWith(value.toLowerCase())) },
  },
  // ...
);
```

For the `greeting` prompt it lives on the `language` argument (the one the page above drives):

```ts
// ts-mcp-server/src/features.ts
{
  name: 'language',
  description: 'Language',
  complete: (value) =>
    ['english', 'spanish', 'norwegian', 'japanese'].filter((l) =>
      l.startsWith(value.toLowerCase()),
    ),
},
```

## On the wire

`completion/complete` with `{ ref: { type: 'ref/prompt', name }, argument: { name, value } }`
→ `{ completion: { values: ['english', ...], total, hasMore } }`. The server's `completions`
capability (declared at construction) is what advertises that the method exists.
