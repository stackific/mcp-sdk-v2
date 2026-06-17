# Prompts

**Part IV · Server features** · Book Ch 16 · Stories S28 · sidebar `/prompts`

Prompts are the user-controlled primitive: reusable, server-authored message templates a user
invokes by name with arguments. The server advertises them via `prompts/list`, and the client
expands one with `prompts/get` into messages ready to feed to a model. This pattern lists the
prompts and expands `greeting` with `name` and `language`.

## Round-trip

```
demo (PromptsPage) ──REST GET /api/prompts──────▶  client host (Hono)
      ▲            ──REST POST /api/prompts/get──▶        │ api.listPrompts()
      │              { name: 'greeting', arguments }       │ api.getPrompt('greeting', args)
      │                                                    ▼
  ApiResultView                            @stackific/mcp-sdk  Client
      │                                                    │ prompts/list · prompts/get (JSON-RPC)
      └──────── { prompts } / { messages } ◀── Streamable HTTP ──┴──▶ MCP server (registerPrompt)
```

## 1 · Frontend — `demo/src/routes/prompts.tsx` + `demo/src/lib/api.ts`

The page lists prompts on mount, then gets `greeting` with the two argument inputs:

```ts
// demo/src/lib/api.ts
listPrompts: () => getJson<ApiResult<Any>>('/api/prompts'),
getPrompt: (name: string, args: Record<string, string>) =>
  postJson<ApiResult<Any>>('/api/prompts/get', { name, arguments: args }),
```

```tsx
// demo/src/routes/prompts.tsx
const prompts = list.data?.ok ? (list.data.result.prompts as any[]) : [];
// ...
<Button
  onClick={() => get.run(() => backend.getPrompt('greeting', { name: pname, language: lang }))}
  data-testid="run-prompt"
>
  Get prompt
</Button>
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono routes delegate to the SDK `Client`:

```ts
// ts-mcp-client/src/index.ts
app.get('/api/prompts', (c) => run(c, () => api.listPrompts()));
app.post('/api/prompts/get', async (c) => {
  const { name, arguments: args } = await c.req.json<{
    name: string;
    arguments?: Record<string, string>;
  }>();
  return run(c, () => api.getPrompt(name, args ?? {}));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
listPrompts: () => withTrace('prompts/list', () => client!.listPrompts()),
getPrompt: (name: string, args: Record<string, string>) =>
  withTrace(`prompts/get:${name}`, () => client!.getPrompt(name, args)),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`registerPrompt` declares the argument list (each optionally `required` or `complete`-able);
the handler renders the `messages`:

```ts
// ts-mcp-server/src/features.ts
server.registerPrompt(
  'greeting',
  {
    title: 'Greeting',
    description: 'A reusable, user-invoked prompt with a completable argument.',
    arguments: [
      { name: 'name', required: true, description: 'Who to greet' },
      {
        name: 'language',
        description: 'Language',
        complete: (value) =>
          ['english', 'spanish', 'norwegian', 'japanese'].filter((l) =>
            l.startsWith(value.toLowerCase()),
          ),
      },
    ],
  },
  async (args) => ({
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: `Greet ${args.name} warmly in ${args.language ?? 'english'}.` },
      },
    ],
  }),
);
```

## On the wire

1. `prompts/list` → `{ prompts: [{ name, description, arguments: [...] }] }`
2. `prompts/get` → `{ messages: [{ role, content: { type: 'text', text } }] }`

The `complete` callback on the `language` argument drives [Completion](./completion.md) —
typing into that argument asks the server for matching language names.
