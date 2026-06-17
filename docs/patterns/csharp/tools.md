# Tools

**Part IV · Server features** · Book Ch 13 · Stories S24–S25 · sidebar `/tools`

Tools are the model-controlled primitive. The server advertises them via `tools/list`
(each with a JSON Schema 2020-12 `inputSchema`), and the client invokes one with
`tools/call`. This pattern traces a single call from the demo SPA, through the MCP client
host, to the server and back.

## Round-trip

```
demo (ToolsPage)  ──REST POST /api/tools/call──▶  client host (ASP.NET Core)
      ▲                                                  │ CallToolWithInputAsync(name, args)
      │                                                  ▼
  ApiResultView                                Stackific.Mcp  McpClient
      │                                                  │ tools/call (JSON-RPC)
      └──────── JSON result ◀──── Streamable HTTP ───────┴──▶ MCP server (RegisterTool)
```

## 1 · Frontend — `demo/src/routes/tools.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page calls `backend.callTool(name, args)`, a
thin wrapper that POSTs to the client host:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/tools.tsx
function doCall() {
  const parsed = JSON.parse(args || '{}');
  void call.run(() => backend.callTool(name, parsed));
}
// ...
<Button onClick={doCall}>Call tool</Button>
<ApiResultView result={call.data} />
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The minimal-API route unwraps the REST body and delegates to the SDK `McpClient`:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
```

`CallToolWithInputAsync` is the SDK's multi-round-trip driver: if the tool needs client input
(elicitation/sampling/roots), it fulfils the server's request via the registered input handlers
and retries until the tool completes (§11). For a plain tool, it behaves like a single
`tools/call`.

```csharp
// csharp-mcp-client/ClientHost.cs
public async Task<T> WithTraceAsync<T>(string trace, Func<McpClient, Task<T>> action)
{
  await EnsureConnectedAsync();
  _trace.Value = trace;
  try { return await action(_client!); }
  finally { _trace.Value = null; }
}
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The server registers each tool with metadata, a JSON Schema, and an async handler. `echo` is the
simplest; `get_weather` adds an `OutputSchema` plus `StructuredContent`; `divide` shows a tool
error:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool
  {
    Name = "echo",
    Title = "Echo",
    Description = "The simplest possible tool: echoes text back.",
    InputSchema = Schema("""{"type":"object","properties":{"text":{"type":"string","description":"Text to echo back"}},"required":["text"]}"""),
    Annotations = new ToolAnnotations { ReadOnlyHint = true, IdempotentHint = true, OpenWorldHint = false },
  },
  ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("text"))));
```

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool
  {
    Name = "get_weather",
    // ...
    OutputSchema = Schema("""{"type":"object","properties":{"city":{"type":"string"},"tempC":{"type":"number"},"conditions":{"type":"string","enum":["sunny","cloudy","rainy","stormy"]}},"required":["city","tempC","conditions"]}"""),
  },
  ctx =>
  {
    var conditions = new[] { "sunny", "cloudy", "rainy", "stormy" }[Random.Shared.Next(4)];
    var structured = new JsonObject { ["city"] = ctx.GetString("city"), ["tempC"] = Math.Round(Random.Shared.NextDouble() * 30 - 5, 1), ["conditions"] = conditions };
    return Task.FromResult(new CallToolResult { Content = [ContentBlocks.Text(structured.ToJsonString())], StructuredContent = structured });
  });
```

## On the wire

1. `tools/list` → `{ tools: [{ name, inputSchema, annotations, ... }] }`
2. `tools/call` → `{ content: [{ type: 'text', text: '...' }] }`

A divide-by-zero (the `divide` tool) returns `isError: true` inside a **successful**
result — a *tool* error the model can recover from — not a JSON-RPC protocol error.
`CallToolResult.FromError` builds exactly that:

```csharp
// csharp-mcp-server/Features.cs
ctx => Task.FromResult(ctx.GetDouble("b") == 0
  ? CallToolResult.FromError("Cannot divide by zero. Reported as isError:true so the model can recover.")
  : CallToolResult.FromText(Num(ctx.GetDouble("a") / ctx.GetDouble("b"))));
```

See [Errors](./errors.md) for the distinction.
