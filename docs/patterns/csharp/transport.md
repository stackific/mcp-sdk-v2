# Transport & HTTP

**Part II · Base protocol** · Book Ch 7–9 · Stories S12–S15 · sidebar `/transport`

The transport is the byte-carrying substrate: it frames, delivers, and tears down JSON-RPC
messages without interpreting them. This pattern probes the **Streamable HTTP** transport —
a single MCP endpoint reached over HTTP — and surfaces the request headers the client sent,
the HTTP status the server returned, and the response headers (content type, negotiated
protocol version, and the session id, which under the stateless model must be absent).

## Round-trip

```
demo (TransportPage) ──REST GET /api/transport/probe──▶  client host (ASP.NET Core)
      ▲                                                        │ /api/transport/probe handler
      │                                                        ▼
  status + headers                                    raw POST server/discover
      │                                                        │ (one JSON-RPC message)
      └──── { status, requestHeaders, responseHeaders } ◀──── Streamable HTTP ──▶ MCP server
                                                                                  (MapMcp)
```

## 1 · Frontend — `demo/src/routes/transport.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page calls `backend.transportProbe()`, which
GETs the probe endpoint on the client host:

```ts
// demo/src/lib/api.ts
transportProbe: () => getJson<ApiResult<Any>>('/api/transport/probe'),
```

The result reports the HTTP status, and renders the negotiated protocol version plus a badge
that confirms there is **no** `Mcp-Session-Id` — the conforming stateless behavior:

```tsx
// demo/src/routes/transport.tsx
<Button onClick={() => call.run(() => backend.transportProbe())}>Probe transport</Button>
// ...
<Badge variant={statusOk ? 'green' : 'red'}>
  {probe.status} {probe.statusText}
</Badge>
{probe.negotiatedVersion ? (
  <Badge variant="slate">MCP-Protocol-Version: {probe.negotiatedVersion}</Badge>
) : null}
<Badge variant={probe.sessionId ? 'amber' : 'slate'}>
  {probe.sessionId ? `Mcp-Session-Id: ${probe.sessionId}` : 'no Mcp-Session-Id (stateless)'}
</Badge>
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

The minimal-API route delegates to a *raw* Streamable HTTP exchange kept out of the SDK
`McpClient` so it can expose the verbatim wire headers and status. The TS reference POSTs
`initialize`; the Stackific.Mcp server's modern entry point is `server/discover` carrying the
required `_meta` envelope (§4.3) and the `Mcp-Method` routing header (§9.4.1), so a faithful,
*successful* handshake round-trip against this server uses those conventions:

```csharp
// csharp-mcp-client/Program.cs
app.MapGet("/api/transport/probe", (IHttpClientFactory httpClientFactory) => Run(async () =>
{
  var requestHeaders = new JsonObject
  {
    ["content-type"] = "application/json",
    ["accept"] = "application/json, text/event-stream",
    ["MCP-Protocol-Version"] = ProtocolRevision.Current,
  };
  var probeBody = new JsonObject
  {
    ["jsonrpc"] = "2.0",
    ["id"] = 1,
    ["method"] = McpMethods.Discover,
    ["params"] = new JsonObject
    {
      ["_meta"] = new JsonObject
      {
        ["io.modelcontextprotocol/protocolVersion"] = ProtocolRevision.Current,
        ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "transport-probe", ["version"] = "0" },
        ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
      },
    },
  };
  var probe = new HttpRequestMessage(HttpMethod.Post, host.ServerUrl)
  {
    Content = new StringContent(probeBody.ToJsonString(), Encoding.UTF8, "application/json"),
  };
  probe.Headers.Accept.ParseAdd("application/json");
  probe.Headers.Accept.ParseAdd("text/event-stream");
  probe.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
  probe.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.Discover);
  // ...
});
```

`Accept` lists **both** `application/json` and `text/event-stream`: the server may answer a
request either as a single JSON object or as an SSE stream, and the client must accept either.
The handler then reports the status and both header sets — note there is no session header on
the way out and none expected back:

```csharp
// csharp-mcp-client/Program.cs
var http = httpClientFactory.CreateClient();
using var response = await http.SendAsync(probe);
var responseHeaders = new JsonObject();
foreach (var header in response.Headers) responseHeaders[header.Key] = string.Join(", ", header.Value);
foreach (var header in response.Content.Headers) responseHeaders[header.Key] = string.Join(", ", header.Value);
// Drain the body so the socket frees; we only need headers/status here.
await response.Content.ReadAsStringAsync();

return (object?)new
{
  url = host.ServerUrl,
  method = "POST",
  requestHeaders,
  status = (int)response.StatusCode,
  statusText = response.ReasonPhrase,
  contentType = response.Content.Headers.ContentType?.MediaType,
  // Stateless server: no Mcp-Session-Id is minted (§9.9); surface it if a server ever does.
  sessionId = response.Headers.TryGetValues("Mcp-Session-Id", out var sid) ? string.Join(", ", sid) : null,
  negotiatedVersion = response.Headers.TryGetValues("Mcp-Protocol-Version", out var ver) ? string.Join(", ", ver) : ProtocolRevision.Current,
  responseHeaders,
};
```

## 3 · MCP server — `csharp-mcp-server/Program.cs`

The whole transport is one line: the SDK's `MapMcp` is bound to `/mcp` for every verb. The
adapter parses each POST, validates the required headers, dispatches the JSON-RPC message, and
streams the answer — there is no session lifecycle and no separate GET stream:

```csharp
// csharp-mcp-server/Program.cs
// The MCP endpoint: the SDK adapter parses, validates headers, dispatches, and streams (§9).
app.MapMcp("/mcp", Features.Build());
```

The `/health` route advertises the transport shape — **stateless Streamable HTTP, protocol
2026-07-28**: the server mints no session id, requires none, and echoes none:

```csharp
// csharp-mcp-server/Program.cs
app.MapGet("/health", () => Results.Json(new
{
  status = "ok",
  name = "companion-mcp-server (C#)",
  language = "csharp",
  protocol = "2026-07-28",
  transport = "streamable-http",
}));
```

## On the wire

```
POST /mcp
content-type: application/json
accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: server/discover

→ 200  content-type: application/json   (single JSON object — no Mcp-Session-Id)
```

Status maps protocol conditions: **200** for a request answer (single JSON object *or* an SSE
stream), **202** for an accepted notification or client response, **404** for an unknown path,
and **405** for GET/DELETE or any non-POST verb. A missing/invalid required header or `_meta`
violation is rejected with **400** (`-32001` / `-32602`); an unknown JSON-RPC *method* yields
`-32601`. The absence of `Mcp-Session-Id` is the expected, conforming result of the stateless
model.
