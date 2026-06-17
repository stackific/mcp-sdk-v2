# Tracing

**Part III · Interaction & utilities** · Book Ch 44 · Stories S23 · sidebar `/tracing`

Distributed tracing rides the same `_meta` envelope every message already carries. The caller
injects a W3C `traceparent` (and `tracestate`) into `_meta`; the SDK propagates it verbatim on the
wire, and the server reads it from `ctx.Meta` — stitching one trace across the whole call. This
pattern injects a `traceparent` into `echo_trace` and verifies the server saw the same value.

## Round-trip

```
demo (TracingPage)  ──POST /api/tools/call-traced──▶  client host (Minimal API)
      ▲                                                  │ c.CallToolWithInputAsync('echo_trace', {}, opts)
      │                                                  ▼
  JsonBlock (echoed)                         Stackific.Mcp.Client  McpClient (merges reserved keys)
      │                                                  │ tools/call (params._meta.traceparent)
      └──── result._meta.echoed ◀── Streamable HTTP ─────┴──▶ MCP server (echo_trace → ctx.Meta)
```

## 1 · Frontend — `demo/src/routes/tracing.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page generates a fresh `traceparent`, sends it via `callToolTraced`, and confirms the round-trip
by comparing the echoed `_meta.traceparent` against what it sent:

```tsx
// demo/src/routes/tracing.tsx
function send() {
  const tp = `00-${hex(16)}-${hex(8)}-01`;
  setTraceparent(tp);
  void call.run(() =>
    backend.callToolTraced('echo_trace', {}, { traceparent: tp, tracestate: 'companion=demo' }),
  );
}

const echoed =
  call.data && call.data.ok ? ((call.data.result as any)?._meta?.echoed ?? null) : null;
const roundTripped = echoed?.traceparent === traceparent && !!traceparent;
```

`callToolTraced` posts the args plus a `_meta` body to the traced route:

```ts
// demo/src/lib/api.ts
callToolTraced: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The route unwraps the `_meta` body and forwards it via `RequestOptions.Meta`; the SDK then merges in
its three required reserved keys without clobbering the caller's:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call-traced", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  var meta = body["_meta"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args, new RequestOptions { Meta = meta })));
}));
```

The capabilities the SDK stamps alongside the caller's keys are this client's single source of
truth, declared once on `ClientHost`:

```csharp
// csharp-mcp-client/ClientHost.cs
private static readonly ClientCapabilities Capabilities = new()
{
  Elicitation = new ElicitationCapability { Form = new JsonObject(), Url = new JsonObject() },
  Sampling = new SamplingCapability(),
  Roots = new JsonObject(),
  Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject() },
};
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`echo_trace` reads `ctx.Meta` — the full received `_meta` beyond the protocol keys, including the
`traceparent` — and returns it under `_meta.echoed`, proving the trace context travelled alongside
the message:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool { Name = "echo_trace", Title = "Echo Trace Context", Description = "Echoes back the _meta the server received (incl. traceparent/tracestate).", InputSchema = Schema("""{"type":"object"}""") },
  ctx => Task.FromResult(new CallToolResult
  {
    Content = [ContentBlocks.Text($"Server received _meta:\n{(ctx.Meta ?? new JsonObject()).ToJsonString()}")],
    Meta = new JsonObject { ["echoed"] = (ctx.Meta ?? new JsonObject()).DeepClone() },
  }));
```

## On the wire

1. `tools/call` (params `_meta`) → `{ traceparent: '00-…-…-01', tracestate: 'companion=demo',
   io.modelcontextprotocol/protocolVersion: …, io.modelcontextprotocol/clientInfo: {…},
   io.modelcontextprotocol/clientCapabilities: {…} }`.
2. result → `{ content: [...], _meta: { echoed: { …the received _meta, traceparent intact… } } }`.

`traceparent`, `tracestate`, and `baggage` are reserved *bare* `_meta` keys — tracing reuses the
exact same envelope and code path as any other metadata. See [The _meta Envelope](./meta.md) for how
the SDK assembles caller keys and reserved keys together.
