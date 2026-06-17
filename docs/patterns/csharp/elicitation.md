# Elicitation

**Part V · Client features (MRTR)** · Book Ch 19–20 · Stories S30–S31 · sidebar `/elicitation`

Elicitation reverses the usual direction: *inside* a tool call the server asks the client for
user input. The server's `ctx.ElicitInputAsync` surfaces at the client host as an
`elicitation/create` request; the host parks it, the human answers in the browser, and the
answer flows back so the tool resumes. Two modes: `form` (a structured schema rendered as a
modal) and `url` (an out-of-band confirmation page). See [MRTR](./mrtr.md) for the retry loop
that carries this.

## Round-trip (reversed inside the call)

```
demo (ElicitationPage) ──REST POST /api/tools/call──▶  client host (ASP.NET Core)
      ▲  callTool('register_user')                          │ CallToolWithInputAsync(...)
      │                                                     ▼
      │                                  client.CallToolWithInputAsync(...) ──tools/call──▶ MCP server
      │                                                     │                              ctx.ElicitInputAsync({ mode })
      │   modal / popup ◀── _pending[id] (TCS) ◀── RegisterInputHandler(ElicitationCreate) ◀── elicitation/create
      │        │ user answers                                                                   (over the response stream)
      └────────┴── POST /api/elicitation/{id}/resolve ──▶ ResolveElicitation(id) ──▶ retried tools/call ──▶ tool resumes
```

## 1 · Frontend — `demo/src/routes/elicitation.tsx` + `demo/src/routes/elicit.tsx`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page just calls the tools; the elicitation
modal/popup is driven by the wire stream. The URL flavour confirms on a standalone landing page
that posts the answer back:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
resolveElicitation: (id: string, body: { action: string; content?: Record<string, unknown> }) =>
  postJson<{ ok: boolean }>(`/api/elicitation/${id}/resolve`, body),
```

```tsx
// demo/src/routes/elicitation.tsx
<Button onClick={() => form.run(() => backend.callTool('register_user', {}))} data-testid="run-elicit-form">
  Call register_user
</Button>
// ...
<Button onClick={() => url.run(() => backend.callTool('confirm_purchase', {}))} data-testid="run-elicit-url">
  Call confirm_purchase
</Button>
```

```tsx
// demo/src/routes/elicit.tsx — the URL-elicitation landing page
function respond(action: 'accept' | 'decline') {
  if (window.opener) {
    window.opener.postMessage({ source: 'mcp-url-elicitation', elicitationId: id, action }, '*');
  }
  window.close();
}
```

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs` + `csharp-mcp-client/Program.cs`

The host registers a handler for the server→client `elicitation/create` request when it builds
the client. Each capability gets one `RegisterInputHandler`:

```csharp
// csharp-mcp-client/ClientHost.cs
var client = new McpClient(transport, ClientInfo, Capabilities);
client.RegisterInputHandler(McpMethods.ElicitationCreate, HandleElicitationAsync);
client.RegisterInputHandler(McpMethods.SamplingCreateMessage, HandleSamplingAsync);
client.RegisterInputHandler(McpMethods.RootsList, HandleRootsAsync);
```

The handler parks a `TaskCompletionSource` keyed by id, emits a frame so the SPA renders the
form / opens the URL, and returns the *task* — the SDK awaits it, so the whole `tools/call`
blocks until the human answers:

```csharp
// csharp-mcp-client/ClientHost.cs
private Task<JsonNode> HandleElicitationAsync(JsonObject? parameters)
{
  var id = Guid.NewGuid().ToString("N");
  var mode = parameters?["mode"]?.GetValue<string>() ?? "form";
  var completion = new TaskCompletionSource<ElicitResult>(TaskCreationOptions.RunContinuationsAsynchronously);
  _pending[id] = new PendingElicitation(completion, mode);
  Bus.Emit(new Frame(0, 0, "recv", "elicitation", McpMethods.ElicitationCreate,
    Summary: $"server requests {mode} input → asking the user",
    Payload: new { pendingId = id, @params = parameters },
    Trace: _trace.Value));
  return completion.Task.ContinueWith(t => Serialize(t.Result), TaskScheduler.Default);
}
```

The human's answer arrives over a separate REST call, which fulfils the parked
`TaskCompletionSource` via `ResolveElicitation`:

```csharp
// csharp-mcp-client/ClientHost.cs
public bool ResolveElicitation(string id, ElicitResult result)
{
  if (_pending.TryRemove(id, out var pending)) { pending.Completion.TrySetResult(result); return true; }
  return false;
}
```

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/elicitation/{id}/resolve", (string id, JsonObject body) =>
{
  var action = Enum.Parse<ElicitationAction>(body["action"]!.GetValue<string>(), ignoreCase: true);
  var result = new ElicitResult { Action = action, Content = body["content"] as JsonObject };
  return Results.Json(new { ok = host.ResolveElicitation(id, result) });
});
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

Inside the tool, `ctx.ElicitInputAsync` issues the request back to the client and *awaits* until
the answer returns. `form` mode carries an `ElicitRequestFormParams` with a `RequestedSchema`:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool { Name = "register_user", Title = "Register User (form elicitation)", Description = "Server requests user input via FORM elicitation.", InputSchema = Schema("""{"type":"object"}""") },
  async ctx =>
  {
    var result = await ctx.ElicitInputAsync(new ElicitRequestFormParams
    {
      Message = "Please provide your registration details:",
      RequestedSchema = Schema("""{"type":"object","properties":{"username":{"type":"string","title":"Username","minLength":3,"maxLength":20},"email":{"type":"string","title":"Email","format":"email"},"newsletter":{"type":"boolean","title":"Subscribe to newsletter?","default":false}},"required":["username","email"]}"""),
    });
    return result is { Action: ElicitationAction.Accept, Content: { } content }
      ? CallToolResult.FromText($"Registered:\n{content.ToJsonString()}")
      : CallToolResult.FromText($"User chose to {result.Action} the form.");
  });
```

`url` mode carries an `ElicitRequestURLParams` with an `ElicitationId` and a `Url` instead — the
client opens it out-of-band:

```csharp
// csharp-mcp-server/Features.cs
var frontend = Environment.GetEnvironmentVariable("DEMO_URL") ?? "http://localhost:8000";
var elicitationId = $"purchase-{Guid.NewGuid():N}";
var result = await ctx.ElicitInputAsync(new ElicitRequestURLParams
{
  Message = "Please confirm your purchase in the opened page.",
  ElicitationId = elicitationId,
  Url = $"{frontend}/elicit/{elicitationId}",
});
```

## On the wire

1. `tools/call` (`register_user`) → the server completes the response with an
   `input_required` result naming `elicitation/create`.
2. The client fulfils it locally (no separate server→client request — the answer rides the
   retry) and **retries** `tools/call` with the same arguments plus the gathered
   `{ action, content }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Registered: ...' }] }`.

`ElicitationAction` is one of `Accept` / `Decline` / `Cancel`; only `Accept` carries `Content`.
Compare with [Sampling](./sampling.md) and [Roots](./roots.md), the other two client features
that ride this same reversed loop.
