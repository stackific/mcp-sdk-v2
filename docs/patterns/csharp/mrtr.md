# Multi-Round-Trip

**Part III · Lifecycle** · Book Ch 11 · Stories S17 · sidebar `/mrtr`

A multi-round-trip request (MRTR) is the single protocol-wide mechanism by which a server
gathers client-only input *while processing a request*. Instead of opening an independent
server-to-client request, the server completes the in-flight response with an
`input_required` result naming what it needs; the client fulfils it locally and **retries the
same method** with the same arguments plus the gathered responses and the verbatim
`requestState`. This pattern drives that loop with the `summarize` tool, whose handler asks
the client to run a model mid-call.

## Round-trip

```
demo (MrtrPage) ──REST POST /api/tools/call──▶  client host (ASP.NET Core)
      ▲                                               │ CallToolWithInputAsync('summarize')
      │                                               ▼
  ApiResultView                          client.CallToolWithInputAsync(...)
      │                                               │ tools/call ──▶ MCP server
      │                                               │ ◀── input_required (sampling/createMessage)
      │                          run model, re-call   │ tools/call + inputResponses + requestState ──▶
      └──────── final result ◀──── complete ◀─────────┘                              (handler resumes)
```

## 1 · Frontend — `demo/src/routes/mrtr.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page calls `backend.callTool('summarize', …)`
— an ordinary tool call. The MRTR loop is invisible from here; the SPA only sees the final
result:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/mrtr.tsx
onClick={() =>
  call.run(() =>
    backend.callTool('summarize', {
      text: 'The Model Context Protocol connects AI apps to tools and data over one wire protocol.',
    }),
  )
}
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The minimal-API route reads the body and routes through `CallToolWithInputAsync` — the SDK's
MRTR **driver**:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
```

When the tool emits an `input_required` result, `CallToolWithInputAsync` fulfils it using the
input handlers registered on the `McpClient` and retries until the tool completes (§11). The
fulfilment handlers are the three MRTR triggers, registered once at connect time:

```csharp
// csharp-mcp-client/ClientHost.cs
var client = new McpClient(transport, ClientInfo, Capabilities);
client.RegisterInputHandler(McpMethods.ElicitationCreate, HandleElicitationAsync);
client.RegisterInputHandler(McpMethods.SamplingCreateMessage, HandleSamplingAsync);
client.RegisterInputHandler(McpMethods.RootsList, HandleRootsAsync);
```

`HandleSamplingAsync` runs the model (DeepSeek or a mock); `HandleElicitationAsync` bridges to
the human in the browser; `HandleRootsAsync` returns the configured roots — each serialised
back as the input response the driver replays:

```csharp
// csharp-mcp-client/ClientHost.cs
private async Task<JsonNode> HandleSamplingAsync(JsonObject? parameters)
{
  // ...
  var result = await _sampling.SampleAsync(parameters).ConfigureAwait(false);
  return Serialize(result);
}

private Task<JsonNode> HandleRootsAsync(JsonObject? _)
{
  // ...
  var result = new ListRootsResult { Roots = [.. _roots.Select(r => new Root { Uri = r.Uri, Name = r.Name })] };
  return Task.FromResult(Serialize(result));
}
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

A tool triggers a round trip by calling a `ctx` method. `summarize` calls `ctx.CreateMessageAsync`
(sampling); the SDK pauses the response, emits the `input_required` result, and resumes the
handler with the model's reply when the retry arrives:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool
  {
    Name = "summarize",
    Title = "Summarize (sampling)",
    Description = "Server asks the CLIENT to run its model (sampling/createMessage).",
    InputSchema = Schema("""{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}"""),
  },
  async ctx =>
  {
    var message = await ctx.CreateMessageAsync(new CreateMessageRequestParams
    {
      Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text($"Summarize in one sentence:\n{ctx.GetString("text")}")] }],
      MaxTokens = 200,
    });
    var text = message.Content.OfType<SamplingTextContent>().FirstOrDefault()?.Text ?? "(no text)";
    return CallToolResult.FromText($"Model \"{message.Model}\" replied:\n{text}");
  });
```

The other two triggers follow the same shape: `register_user` calls `ctx.ElicitInputAsync`, and
`show_roots` calls `ctx.ListRootsAsync`:

```csharp
// csharp-mcp-server/Features.cs
async ctx =>
{
  var result = await ctx.ElicitInputAsync(new ElicitRequestFormParams
  {
    Message = "Please provide your registration details:",
    // ...
  });
  // ...
}
```

```csharp
// csharp-mcp-server/Features.cs
async ctx =>
{
  var roots = await ctx.ListRootsAsync();
  // ...
}
```

## On the wire

1. `tools/call` (summarize) → `{ result: { ..., requestState, input_required: [sampling/createMessage] } }`
2. client runs the model, then re-sends `tools/call` with `inputResponses` + the verbatim `requestState` (a **new** request id)
3. `tools/call` → `{ result: { content: [...], _meta: { ... } } }` — the `complete` result

`requestState` is an opaque continuation token the client echoes back byte-for-byte; the loop
repeats until a `complete` result or an error. A server may only request input kinds the
client declared — otherwise it returns the missing-capability error `-32003`.

See [Elicitation](./elicitation.md), [Sampling](./sampling.md), and [Roots](./roots.md) for
each trigger in depth.
