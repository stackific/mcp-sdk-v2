# Stateless Model

**Part I · Foundations** · Book Ch 4 · Stories S06 · sidebar `/stateless`

MCP V2 processes every request independently: everything needed to handle a request lives in
that request's own `_meta`, and nothing is remembered between requests. There is no
`Mcp-Session-Id` and no `initialize` — `server/discover` carries identity and capabilities, and
each request re-states the rest. This pattern shows the stateless transport and repeated discovery.

## Round-trip

```
demo (StatelessPage)  ──GET /api/status──▶  client host (Minimal API)
      ▲                                         │ host.Status()
      │                                         ▼
  JsonBlock(status)                  Stackific.Mcp.Client  McpClient + StreamableHttpClientTransport
      │                                         │ server/discover repeated, no session id
      └──── { serverUrl, negotiatedVersion } ◀──┴──▶ MCP server (stateless McpServer)
```

## 1 · Frontend — `demo/src/routes/stateless.tsx`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host.
The page reads status and surfaces that the server URL and version are derived per request, not
from session history:

```tsx
// demo/src/routes/stateless.tsx
<Button onClick={() => status.run(() => backend.status())}>Read status</Button>
// ...
<div className="text-slate-400">Server URL</div>
<div className="font-mono">{s.serverUrl ?? '—'}</div>
<div className="text-slate-400">Negotiated version</div>
<div className="font-mono">{s.negotiatedVersion ?? '—'}</div>
```

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs`

The transport is a plain `StreamableHttpClientTransport` over a URL — no session handshake. The
`ReconnectAsync` path tears down and re-runs `server/discover` every time, proving each
connection is disposable:

```csharp
// csharp-mcp-client/ClientHost.cs
var transport = new StreamableHttpClientTransport(new Uri(_serverUrl))
{
  OnSend = node => Tap("send", node),
  OnReceive = node => Tap("recv", node),
};
var client = new McpClient(transport, ClientInfo, Capabilities);
// ...
await client.DiscoverAsync(); // re-establishes identity/version with no session state
```

```csharp
// csharp-mcp-client/ClientHost.cs
public async Task ReconnectAsync()
{
  if (_client is not null)
  {
    await _client.DisposeAsync();
    _client = null;
  }
  await WithTraceAsync("reconnect", () => Task.CompletedTask); // drives a fresh server/discover
}
```

The transport probe makes the missing session explicit: it surfaces `Mcp-Session-Id` only *if* a
server ever mints one, and the catch-all confirms statelessness over the raw HTTP handshake:

```csharp
// csharp-mcp-client/Program.cs
// Stateless server: no Mcp-Session-Id is minted (§9.9); surface it if a server ever does.
sessionId = response.Headers.TryGetValues("Mcp-Session-Id", out var sid) ? string.Join(", ", sid) : null,
```

## 3 · MCP server — `csharp-mcp-server/Program.cs` + `csharp-mcp-server/Features.cs`

The server is mounted as a stateless Streamable HTTP handler; the SDK adapter keeps no
per-connection state:

```csharp
// csharp-mcp-server/Program.cs
// The MCP endpoint: the SDK adapter parses, validates headers, dispatches, and streams (§9).
app.MapMcp("/mcp", Features.Build());
```

`Features.Build` constructs a fresh `McpServer` whose only state is its registered features —
the request itself supplies identity, version, and capabilities each time:

```csharp
// csharp-mcp-server/Features.cs
public static McpServer Build()
{
  var server = new McpServer(
    new Implementation { Name = "companion-mcp-server", Title = "Companion MCP Server (C#)", Version = "0.1.0" },
    new ServerCapabilities { /* ...capabilities... */ },
    instructions: "A reference MCP server demonstrating every server and client capability over Streamable HTTP.");

  RegisterTools(server);
  RegisterResourcesAndPrompts(server);
  return server; // ...registers tools/resources/prompts only — no session bookkeeping...
}
```

## On the wire

1. `server/discover` → identity + capabilities + revision (replaces `initialize`; no session created)
2. every later request carries `_meta` → `{ io.modelcontextprotocol/protocolVersion, clientInfo, clientCapabilities }`

No `Mcp-Session-Id` header is required for protocol state — a server may serve any two requests
on the same connection from different instances with identical behavior. Genuine cross-call
continuity is explicit, via server-minted opaque handles (a pagination `nextCursor`, an
`io.modelcontextprotocol/related-task`). The per-request envelope is [The _meta Envelope](./meta.md);
discovery is [Overview & Discovery](./overview.md).
