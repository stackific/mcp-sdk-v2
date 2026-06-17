# Errors

**Part VI · Errors & authorization** · Book Ch 12 · Stories S34 · sidebar `/errors`

MCP has two error channels, and they are not interchangeable. A **tool error** rides
*inside* a successful `tools/call` result as `isError: true` — the model sees it and can
recover. A **protocol error** is a JSON-RPC error response (a thrown failure) the
client/host handles — e.g. `-32601` method-not-found or `-32602` invalid-params. This
pattern traces both from the demo SPA through the host to the server and back.

## Round-trip

```
demo (ErrorsPage)                              client host (ASP.NET Core)
  divide{a:1,b:0} ──POST /api/tools/call──▶  Run(fn) ── try ──▶ result.isError:true
      ▲                                              │              (ok:true, model recovers)
      │ ApiResultView                                │
  bogus method   ──POST /api/raw────────────▶  Run(fn) ── catch (McpError) ─▶ ok:false { message, code }
      └────────── JSON ◀──── Streamable HTTP ──────┴──▶ MCP server
                                          tool: returns isError:true
                                          unknown method: rejects -32601
```

## 1 · Frontend — `demo/src/routes/errors.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected
language switch routes the call to the C# client host. The page exercises both channels from
the same `ApiResultView`. A divide-by-zero is a **tool** error; a bogus JSON-RPC method is a
**protocol** error:

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

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

The `Run(action)` helper is where the two channels converge. A **protocol** error throws an
`McpError` and is caught — shaped into `ok:false { message, code, data }`. A **tool** error
does not throw: its `isError:true` result rides back inside `ok:true`, untouched, for the
model (or the SPA) to inspect. A non-MCP exception falls through to the bare-`message` arm:

```csharp
// csharp-mcp-client/Program.cs
// Shapes an MCP action's outcome as { ok, result } / { ok, error } so the SPA can tell a protocol
// error (a thrown JSON-RPC error) from a tool error (a result with isError).
static async Task<IResult> Run(Func<Task<object?>> action)
{
  try
  {
    return Results.Json(new { ok = true, result = await action() });
  }
  catch (McpError error)
  {
    return Results.Json(new { ok = false, error = new { message = error.Message, code = (object?)error.Code, data = error.ErrorData } });
  }
  catch (Exception error)
  {
    return Results.Json(new { ok = false, error = new { message = error.Message } });
  }
}
```

`callTool` goes through the SDK driver; `raw` is the generic passthrough that lets an
unknown method reach the server (and reject) — both are literal routes that funnel through
`Run`:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
// ...
app.MapPost("/api/raw", (JsonObject body) => Run(async () =>
{
  var method = body["method"]!.GetValue<string>();
  var prms = body["params"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>(method, c => Box(c.RequestAsync(method, prms)));
}));
```

`McpError` is the SDK's typed JSON-RPC error: its `Code` is the numeric error code
(`-32601`, `-32602`, …) and `ErrorData` carries the optional `data` payload — exactly the
three fields `Run`'s `catch (McpError)` arm surfaces:

```csharp
// csharp-sdk/JsonRpc/McpError.cs
public class McpError : Exception
{
  public int Code { get; }
  // ...
  public static McpError MethodNotFound(string method) =>
    new(ErrorCodes.MethodNotFound, $"Method not found: {method}", new JsonObject { ["method"] = method });
}
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The `divide` tool **returns** a tool error via `CallToolResult.FromError` — a normal,
successful result the model can read and recover from. It never throws:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool
  {
    Name = "divide",
    Title = "Divide (may error)",
    Description = "Demonstrates a TOOL error (isError:true) vs a protocol error.",
    InputSchema = Schema("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}"""),
    Annotations = new ToolAnnotations { ReadOnlyHint = true, IdempotentHint = true },
  },
  ctx => Task.FromResult(ctx.GetDouble("b") == 0
    ? CallToolResult.FromError("Cannot divide by zero. Reported as isError:true so the model can recover.")
    : CallToolResult.FromText(Num(ctx.GetDouble("a") / ctx.GetDouble("b")))));
```

`FromError` is the SDK's tool-error constructor — it stamps `IsError = true` on an otherwise
ordinary result (§16.6); it is *not* a thrown exception:

```csharp
// csharp-sdk/Protocol/Tools.cs
// Builds a tool-execution error result (isError: true) carrying a single text block (§16.6).
public static CallToolResult FromError(string text) =>
  new() { Content = [ContentBlocks.Text(text)], IsError = true };
```

The protocol error needs no code: `does/not/exist` is not a registered method, so the SDK
runtime rejects it with JSON-RPC `-32601` (Method not found) before any handler runs.
Calling a real tool with the wrong argument type (`add` with a string) likewise fails schema
validation with `-32602` (Invalid params). Both throw `McpError` and surface in `Run`'s
`catch (McpError)`. The dispatcher is where the unknown method is rejected:

```csharp
// csharp-sdk/JsonRpc/Dispatch.cs
ErrorResponse(request.Id, ErrorCodes.MethodNotFound, "Method not found"));
```

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
host (`ok:false`). The catch-all at the bottom of `Program.cs` is a *different* fallback — it
answers genuinely-unmapped `/api/*` paths with a preview message; the literal `/api/tools/call`
and `/api/raw` routes above always win, so the error channels here are fully wired in C#. See
[Tools](./tools.md) for the normal success path, and [Authorization](./authorization.md) for
how the `401` challenge is shaped by the same `Run`.
