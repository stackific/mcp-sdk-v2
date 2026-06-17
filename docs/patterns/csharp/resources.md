# Resources

**Part IV · Server features** · Book Ch 14 · Stories S26–S27 · sidebar `/resources`

Resources are the app-controlled primitive: data identified by an opaque URI that the client
reads. The server advertises them via `resources/list`, and the client fetches one with
`resources/read`. This pattern traces a list-then-read round-trip from the demo SPA through
the client host to the server and back.

## Round-trip

```
demo (ResourcesPage) ──REST GET /api/resources─────▶  client host (ASP.NET Core)
      ▲              ──REST POST /api/resources/read─▶        │ ListResourcesAsync() / ReadResourceAsync(uri)
      │                                                       ▼
  ApiResultView                              Stackific.Mcp  McpClient
      │                                                       │ resources/list · resources/read (JSON-RPC)
      └──────── { resources } / { contents } ◀── Streamable HTTP ──┴──▶ MCP server (RegisterResource)
```

## 1 · Frontend — `demo/src/routes/resources.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page lists resources on mount, then reads the
URI in the input box:

```ts
// demo/src/lib/api.ts
listResources: () => getJson<ApiResult<Any>>('/api/resources'),
readResource: (uri: string) => postJson<ApiResult<Any>>('/api/resources/read', { uri }),
```

```tsx
// demo/src/routes/resources.tsx
useEffect(() => {
  void list.run(() => backend.listResources());
}, []);
// ...
const resources = list.data?.ok ? (list.data.result.resources as any[]) : [];
// ...
<Button onClick={() => read.run(() => backend.readResource(uri))} data-testid="run-read">
  Read
</Button>
<ApiResultView result={read.data} />
```

An unresolvable URI surfaces as a `-32602` (Invalid params) protocol error — see
[Errors](./errors.md).

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The minimal-API routes unwrap the REST body and delegate to the SDK `McpClient`:

```csharp
// csharp-mcp-client/Program.cs
app.MapGet("/api/resources", () => Run(() => host.WithTraceAsync<object?>("resources/list", c => Box(c.ListResourcesAsync()))));
app.MapPost("/api/resources/read", (JsonObject body) => Run(async () =>
  await host.WithTraceAsync<object?>("resources/read", c => Box(c.ReadResourceAsync(body["uri"]!.GetValue<string>())))));
```

`WithTraceAsync` connects the client on first use and groups the emitted wire frames under a
trace tag (`ClientHost.cs`); `Box` boxes the typed `Task<T>` for the uniform REST pipeline.

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The server registers a static resource against a fixed URI; the read handler returns its
`Contents`, built with the `ResourceContents.OfText` factory:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterResource(
  new Resource { Uri = "docs://readme", Name = "readme", Title = "Readme", Description = "A static text resource.", MimeType = "text/markdown" },
  uri => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, "# Companion Server\n\nThis is a static MCP resource served over Streamable HTTP.", "text/markdown")] }));
```

## On the wire

1. `resources/list` → `{ resources: [{ uri, name, mimeType, ... }] }`
2. `resources/read` → `{ contents: [{ uri, mimeType, text }] }`

A URI pattern (with a `{variable}`) rather than a fixed URI is a
[Resource Template](./templates.md); the suggestions that fill the variable come from
[Completion](./completion.md).
