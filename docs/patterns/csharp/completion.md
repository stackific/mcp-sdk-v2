# Completion

**Part IV · Server features** · Book Ch 17 · Stories S29 · sidebar `/completion`

`completion/complete` is server-driven autocomplete for [prompt](./prompts.md) arguments and
[resource-template](./templates.md) variables. The client sends a `ref` (which prompt or
template), the `argument` being typed, and optional `context`; the server returns matching
`values`. This pattern types into the `language` argument of the `greeting` prompt and shows
the suggestions.

## Round-trip

```
demo (CompletionPage) ──REST POST /api/complete──▶  client host (ASP.NET Core)
      ▲     { ref, argument: { name:'language', value }, context }   │ RequestAsync(completion/complete, prms)
      │                                                              ▼
  Badge values[]                                Stackific.Mcp  McpClient
      │                                                              │ completion/complete (JSON-RPC)
      └──────── { completion: { values } } ◀──── Streamable HTTP ────┴──▶ MCP server (ArgumentCompleter)
```

## 1 · Frontend — `demo/src/routes/completion.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. Each keystroke calls `backend.complete` with a
`ref/prompt` reference and the partial value:

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

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

The minimal-API route reassembles `ref`/`argument`/`context` into the JSON-RPC params and sends
them with the generic `RequestAsync` passthrough — there is no separate typed `complete` helper:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/complete", (JsonObject body) => Run(async () =>
{
  var prms = new JsonObject { ["ref"] = body["ref"]?.DeepClone(), ["argument"] = body["argument"]?.DeepClone() };
  if (body["context"] is { } context) prms["context"] = context.DeepClone();
  return await host.WithTraceAsync<object?>("completion/complete", c => Box(c.RequestAsync(McpMethods.CompletionComplete, prms)));
}));
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

There is no separate `RegisterCompletion`: a completer is just an `ArgumentCompleter` passed
*alongside* the thing being completed. For the `city-weather` template it lives in the
dictionary keyed by the `city` variable:

```csharp
// csharp-mcp-server/Features.cs
var cities = new[] { "oslo", "tokyo", "cairo", "lima", "quito", "osaka" };
server.RegisterResourceTemplate(
  new ResourceTemplate { UriTemplate = "weather://{city}/current", /* ... */ },
  // ...
  new Dictionary<string, ArgumentCompleter> { ["city"] = value => cities.Where(c => c.StartsWith(value, StringComparison.OrdinalIgnoreCase)).ToList() });
```

For the `greeting` prompt it lives in the prompt's completer dictionary, keyed by the `language`
argument (the one the page above drives):

```csharp
// csharp-mcp-server/Features.cs
new Dictionary<string, ArgumentCompleter> { ["language"] = value => new[] { "english", "spanish", "norwegian", "japanese" }.Where(l => l.StartsWith(value, StringComparison.OrdinalIgnoreCase)).ToList() }
```

## On the wire

`completion/complete` with `{ ref: { type: 'ref/prompt', name }, argument: { name, value } }`
→ `{ completion: { values: ['english', ...], total, hasMore } }`. The server's `Completions`
capability (declared at construction, `Completions = new JsonObject()`) is what advertises that
the method exists.
