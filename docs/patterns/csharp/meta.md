# The _meta Envelope

**Part I · Foundations** · Book Ch 4 · Stories S05 · sidebar `/meta`

`_meta` is the open, string-keyed extension envelope that may ride on any request params,
notification params, or result. The SDK stamps three required `io.modelcontextprotocol/*` keys
on every request; callers may add their own namespaced keys. This pattern sends a custom `_meta`
to the `echo_trace` tool, which echoes back exactly what the server received.

## Round-trip

```
demo (MetaPage)  ──POST /api/tools/call-traced──▶  client host (Minimal API)
      ▲                                               │ c.CallToolWithInputAsync('echo_trace', {}, opts)
      │                                               ▼
  JsonBlock (echoed)                       Stackific.Mcp.Client  McpClient (stamps _meta)
      │                                               │ tools/call (JSON-RPC)
      └──────── result._meta.echoed ◀── Streamable HTTP ─┴──▶ MCP server (echo_trace → ctx.Meta)
```

## 1 · Frontend — `demo/src/routes/meta.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host.
The page sends one protocol-reserved-prefix key and one custom namespaced key, then renders the
`_meta` the server echoes back:

```tsx
// demo/src/routes/meta.tsx
backend.callToolTraced(
  'echo_trace',
  {},
  {
    'io.modelcontextprotocol/example': 'reserved-namespace',
    'companion/note': 'custom key',
  },
)
// ...
const echoed = call.data?.ok ? (call.data.result as any)?._meta?.echoed ?? null : null;
```

```ts
// demo/src/lib/api.ts
callToolTraced: (name, args, meta) =>
  postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The host forwards the caller's `_meta` verbatim via `RequestOptions.Meta`; the SDK then merges
in the three required keys. The capabilities it stamps are this client's single source of truth:

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

```csharp
// csharp-mcp-client/Program.cs
return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args, new RequestOptions { Meta = meta })));
```

The SDK's `RequestMeta.ToJsonObject` is where the envelope is assembled — caller keys first
(from `Additional`), then the three reserved keys (protocol version, client identity, client
capabilities):

```csharp
// csharp-sdk/Protocol/RequestMeta.cs
var meta = new JsonObject();
if (Additional is not null)
{
  foreach (var (key, value) in Additional)
  {
    meta[key] = value?.DeepClone();
  }
}
meta[MetaKeys.ProtocolVersion] = ProtocolVersion;
meta[MetaKeys.ClientInfo] = JsonSerializer.SerializeToNode(ClientInfo, McpJson.Options);
meta[MetaKeys.ClientCapabilities] = JsonSerializer.SerializeToNode(ClientCapabilities, McpJson.Options);
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`echo_trace` simply returns the `_meta` the tool context received — including the reserved keys
and any custom ones — proving arbitrary metadata travelled alongside the message:

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

1. `tools/call` (params `_meta`) → `{ "companion/note": "custom key", "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {…}, "io.modelcontextprotocol/clientCapabilities": {…} }`
2. result → `{ content: [...], _meta: { echoed: { …the received _meta… } } }`

Each key is either a reverse-DNS prefix ending in `/` plus a name, or one of four reserved bare
keys (`progressToken`, `traceparent`, `tracestate`, `baggage`) — the SDK pins these in
`MetaKeys` (`MetaKeys.ProtocolVersion`, `MetaKeys.TraceParent`, …). The
`io.modelcontextprotocol/` prefix is protocol-reserved; third parties use their own. Receivers
never reject a message for unrecognized keys — see [JSON Value Model](./json-model.md). The
required keys also drive [Capabilities](./capabilities.md) negotiation.
