# JSON-RPC Framing

**Part I · Foundations** · Book Ch 3–4 · Stories S03–S04 · sidebar `/jsonrpc`

Every interaction rides inside a single JSON-RPC 2.0 object: a request carries `jsonrpc`, an
`id`, a `method`, and optional `params`; the matching response echoes that `id`. This pattern
sends a `ping` and traces the exact envelope from the page to the server and back.

## Round-trip

```
demo (JsonRpcPage)  ──POST /api/raw {method:'ping'}──▶  client host (Minimal API)
      ▲                                                    │ c.RequestAsync('ping', …)
      │                                                    ▼
  ApiResultView                                 Stackific.Mcp.Client  McpClient
      │                                                    │ ping (JSON-RPC request, id)
      └──── EmptyResult ◀──── Streamable HTTP ─────────────┴──▶ MCP server (SDK dispatcher)
```

## 1 · Frontend — `demo/src/routes/jsonrpc.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host.
The button fires a plain ping; `backend.ping` is just `raw` with the `ping` method:

```tsx
// demo/src/routes/jsonrpc.tsx
<Button onClick={() => call.run(() => backend.ping())}>Ping</Button>
<ApiResultView result={call.data} />
```

```ts
// demo/src/lib/api.ts
ping: () => postJson<ApiResult<Any>>('/api/raw', { method: 'ping', params: {} }),
raw: (method: string, params: Record<string, unknown> = {}) =>
  postJson<ApiResult<Any>>('/api/raw', { method, params }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The generic passthrough route hands any `{ method, params }` to the SDK's `RequestAsync`:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/raw", (JsonObject body) => Run(async () =>
{
  var method = body["method"]!.GetValue<string>();
  var prms = body["params"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>(method, c => Box(c.RequestAsync(method, prms)));
}));
```

Every frame is *classified* by which members are present, then *tapped* to the debug bus — this
is the framing rule made visible (request = `method` + `id`; notification = `method`, no `id`;
response = `result` or `error`):

```csharp
// csharp-mcp-client/ClientHost.cs
private static (string Kind, string? Method, object? Id, string Summary) Classify(JsonNode? message)
{
  if (message is JsonObject obj)
  {
    var method = obj["method"]?.GetValue<string>();
    var hasId = obj.TryGetPropertyValue("id", out var idNode) && idNode is not null;
    if (method is not null && hasId) return ("request", method, AsId(idNode), $"request → {method}");
    if (method is not null) return ("notification", method, null, $"notification {method}");
    if (obj.ContainsKey("result")) return ("response", null, AsId(obj["id"]), $"result for #{AsId(obj["id"])}");
    if (obj["error"] is JsonObject error) return ("error", null, AsId(obj["id"]), $"error {error["code"]}: {error["message"]}");
  }
  return ("note", null, null, "message");
}
```

## 3 · MCP server — `csharp-mcp-server/Program.cs`

The server owns no framing of its own — the SDK's Streamable HTTP adapter parses each request,
correlates the `id`, dispatches by `method`, and frames the response:

```csharp
// csharp-mcp-server/Program.cs
// The MCP endpoint: the SDK adapter parses, validates headers, dispatches, and streams (§9).
app.MapMcp("/mcp", Features.Build());
```

The SDK builds the outgoing request frame with the mandatory `jsonrpc` marker (carried by
`JsonRpcRequest`) and a correlating `id`, with the `_meta` envelope merged into `params`:

```csharp
// csharp-sdk/Client/McpClient.cs
var attemptParams = (JsonObject)prms.DeepClone();
attemptParams["_meta"] = new RequestMeta
{
  ProtocolVersion = _protocolVersion,
  ClientInfo = _clientInfo,
  ClientCapabilities = _capabilities,
  Additional = additional,
}.ToJsonObject();
var request = new JsonRpcRequest(new RequestId(Interlocked.Increment(ref _nextId)), method, attemptParams);
```

## On the wire

1. `ping` request → `{ jsonrpc: "2.0", id, method: "ping", params: { _meta } }`
2. response → `{ jsonrpc: "2.0", id, result: { resultType: "complete" } }`

A success `result` sets the required `resultType` discriminator (an `EmptyResult` carries only
the base). The response echoes the request `id` with the same JSON type and value. The `_meta`
envelope on the request params is covered in [The _meta Envelope](./meta.md); the JSON value
rules in [JSON Value Model](./json-model.md).
