# Prompts

**Part IV · Server features** · Book Ch 16 · Stories S28 · sidebar `/prompts`

Prompts are the user-controlled primitive: reusable, server-authored message templates a user
invokes by name with arguments. The server advertises them via `prompts/list`, and the client
expands one with `prompts/get` into messages ready to feed to a model. This pattern lists the
prompts and expands `greeting` with `name` and `language`.

## Round-trip

```
demo (PromptsPage) ──REST GET /api/prompts──────▶  client host (ASP.NET Core)
      ▲            ──REST POST /api/prompts/get──▶        │ ListPromptsAsync()
      │              { name: 'greeting', arguments }       │ GetPromptAsync('greeting', args)
      │                                                    ▼
  ApiResultView                            Stackific.Mcp  McpClient
      │                                                    │ prompts/list · prompts/get (JSON-RPC)
      └──────── { prompts } / { messages } ◀── Streamable HTTP ──┴──▶ MCP server (RegisterPrompt)
```

## 1 · Frontend — `demo/src/routes/prompts.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page lists prompts on mount, then gets
`greeting` with the two argument inputs:

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

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The minimal-API routes delegate to the SDK `McpClient`; the `prompts/get` route coerces the
arguments object into a `Dictionary<string, string>`:

```csharp
// csharp-mcp-client/Program.cs
app.MapGet("/api/prompts", () => Run(() => host.WithTraceAsync<object?>("prompts/list", c => Box(c.ListPromptsAsync()))));
app.MapPost("/api/prompts/get", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = new Dictionary<string, string>();
  if (body["arguments"] is JsonObject a)
  {
    foreach (var (k, v) in a) if (v is not null) args[k] = v.GetValue<string>();
  }
  return await host.WithTraceAsync<object?>($"prompts/get:{name}", c => Box(c.GetPromptAsync(name, args)));
}));
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`RegisterPrompt` declares the `Arguments` (each optionally `Required`); the handler renders the
`Messages`; an `ArgumentCompleter` dictionary makes individual arguments completable:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterPrompt(
  new Prompt
  {
    Name = "greeting",
    Title = "Greeting",
    Description = "A reusable, user-invoked prompt with a completable argument.",
    Arguments = [new PromptArgument { Name = "name", Required = true, Description = "Who to greet" }, new PromptArgument { Name = "language", Description = "Language" }],
  },
  args => Task.FromResult(new GetPromptResult
  {
    Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text($"Greet {args.GetValueOrDefault("name", "friend")} warmly in {args.GetValueOrDefault("language", "english")}.") }],
  }),
  new Dictionary<string, ArgumentCompleter> { ["language"] = value => new[] { "english", "spanish", "norwegian", "japanese" }.Where(l => l.StartsWith(value, StringComparison.OrdinalIgnoreCase)).ToList() });
```

## On the wire

1. `prompts/list` → `{ prompts: [{ name, description, arguments: [...] }] }`
2. `prompts/get` → `{ messages: [{ role, content: { type: 'text', text } }] }`

The `["language"]` `ArgumentCompleter` drives [Completion](./completion.md) — typing into that
argument asks the server for matching language names.
