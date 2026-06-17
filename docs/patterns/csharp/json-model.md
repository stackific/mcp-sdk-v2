# JSON Value Model

**Part I · Foundations** · Book Ch 2 · Stories S02 · sidebar `/json-model`

Everything on the wire is one of six JSON value forms (string, number, boolean, null, object,
array). A core invariant is forward compatibility: receivers ignore object members and `_meta`
keys they do not recognize. This pattern calls `echo` with an extra argument and an unknown
`_meta` key and shows the server accept and ignore both.

## Round-trip

```
demo (JsonModelPage)  ──POST /api/tools/call-traced──▶  client host (Minimal API)
      ▲                                                     │ c.CallToolWithInputAsync('echo', …)
      │                                                     ▼
  ApiResultView                                  Stackific.Mcp.Client  McpClient
      │                                                     │ tools/call (JSON-RPC, _meta stamped)
      └──────── echoed text ◀──── Streamable HTTP ──────────┴──▶ MCP server (echo tool)
```

## 1 · Frontend — `demo/src/routes/json-model.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host.
The page sends a *recognized* argument plus an *unrecognized* one, and a custom `_meta` key:

```tsx
// demo/src/routes/json-model.tsx
call.run(() =>
  backend.callToolTraced(
    'echo',
    { text: 'hello', unknownExtra: 123 },
    { 'companion/unknown-meta': true },
  ),
)
```

```ts
// demo/src/lib/api.ts
callToolTraced: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

The caller's `_meta` is carried as `RequestOptions.Meta`; the SDK (de)serializes the whole frame
as a single JSON object built from `JsonObject`/`JsonNode` values:

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

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The SDK validates `InputSchema` but never rejects unknown members; `echo` reads only `text`
and ignores `unknownExtra` entirely:

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

The forward-compatibility rule is enforced at the `_meta` gate: only the three required keys are
parsed; every other key is preserved verbatim into `Additional`, never rejected:

```csharp
// csharp-sdk/Protocol/RequestMeta.cs
// Preserve every other key (progressToken, trace context, third-party) verbatim.
var additional = new JsonObject();
foreach (var (key, value) in meta)
{
  if (key is MetaKeys.ProtocolVersion or MetaKeys.ClientInfo or MetaKeys.ClientCapabilities or MetaKeys.LogLevel)
  {
    continue;
  }
  additional[key] = value?.DeepClone();
}
```

## On the wire

A representative `tools/call` frame the SDK emits (note the dotted, slash-prefixed `_meta` key
names and the unrecognized members that survive):

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "echo",
    "arguments": { "text": "hello", "unknownExtra": 123 },
    "_meta": {
      "companion/unknown-meta": true,
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "companion-mcp-client", "version": "0.1.0" },
      "io.modelcontextprotocol/clientCapabilities": { "elicitation": {}, "sampling": {} }
    }
  }
}
```

See [JSON-RPC Framing](./jsonrpc.md) for the envelope and [The _meta Envelope](./meta.md) for
the key-naming grammar.
