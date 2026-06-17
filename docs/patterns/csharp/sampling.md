# Sampling

**Part V · Client features (MRTR)** · Book Ch 21 · Stories S33 · sidebar `/sampling`

Sampling reverses direction: *inside* a tool call the server borrows the client's model. The
server's `ctx.CreateMessageAsync` surfaces at the client host as a `sampling/createMessage`
request; the host runs the model (here DeepSeek via its Anthropic-compatible endpoint) and the
completion flows back so the tool resumes. This pattern calls the `summarize` tool, which asks
the client to summarize text. See [MRTR](./mrtr.md) for the retry loop.

## Round-trip (reversed inside the call)

```
demo (SamplingPage) ──REST POST /api/tools/call──▶  client host (ASP.NET Core)
      ▲  callTool('summarize', { text })                 │ CallToolWithInputAsync(...)
      │                                                   ▼
      │                                client.CallToolWithInputAsync(...) ──tools/call──▶ MCP server
      │                                                   │                              ctx.CreateMessageAsync({ messages })
      │                                                   │ ◀── sampling/createMessage ◀──┘ (over the response stream)
      │                          RegisterInputHandler(SamplingCreateMessage) ──▶ SampleAsync() ──▶ DeepSeek
      └──────── { content } ◀── retried tools/call ◀── model reply flows back, tool resumes
```

## 1 · Frontend — `demo/src/routes/sampling.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page calls the tool; the sampling request is
handled transparently inside the host:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/sampling.tsx
<Button onClick={() => call.run(() => backend.callTool('summarize', { text }))} data-testid="run-sampling">
  Summarize
</Button>
<ApiResultView result={call.data} />
```

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs` + `csharp-mcp-client/Sampling.cs`

The host registers a handler for the server→client `sampling/createMessage` request when it
builds the client, then routes the request to the model:

```csharp
// csharp-mcp-client/ClientHost.cs
client.RegisterInputHandler(McpMethods.SamplingCreateMessage, HandleSamplingAsync);
// ...
private async Task<JsonNode> HandleSamplingAsync(JsonObject? parameters)
{
  Bus.Emit(new Frame(0, 0, "local", "note", McpMethods.SamplingCreateMessage,
    Summary: $"client handling sampling → {(_sampling.HasKey ? "DeepSeek" : "mock model")}",
    Payload: parameters, Trace: _trace.Value));
  var result = await _sampling.SampleAsync(parameters).ConfigureAwait(false);
  return Serialize(result);
}
```

`SampleAsync` talks to DeepSeek through its Anthropic-compatible `/v1/messages` endpoint,
falling back to a deterministic mock when no key is configured:

```csharp
// csharp-mcp-client/Sampling.cs
public Task<CreateMessageResult> SampleAsync(JsonObject? parameters) =>
  HasKey ? SampleWithDeepSeekAsync(parameters) : Task.FromResult(SampleMock(parameters));

private async Task<CreateMessageResult> SampleWithDeepSeekAsync(JsonObject? parameters)
{
  // ... flatten messages, build the request body ...
  using var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/v1/messages")
  {
    Content = JsonContent.Create(body),
  };
  request.Headers.TryAddWithoutValidation("x-api-key", _apiKey);
  request.Headers.TryAddWithoutValidation("anthropic-version", AnthropicVersion);
  // ...
  return new CreateMessageResult
  {
    Role = Role.Assistant,
    Content = [SamplingContentBlocks.Text(text)],
    Model = payload["model"]?.GetValue<string>() ?? _model,
    StopReason = payload["stop_reason"]?.GetValue<string>() ?? "endTurn",
  };
}
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

Inside the tool, `ctx.CreateMessageAsync` issues the request back to the client and awaits until
the completion returns:

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

## On the wire

1. `tools/call` (`summarize`) → the server completes the response with an `input_required`
   result naming `sampling/createMessage`.
2. The client runs the model and **retries** `tools/call` with the same arguments plus the
   sampled `{ role, content, model, stopReason }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Model "..." replied: ...' }] }`.

Sampling is a *deprecated* client capability — prefer [Elicitation](./elicitation.md) for
structured user input. [Roots](./roots.md) is the third client feature riding this reversed
loop.
