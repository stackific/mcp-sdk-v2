# Protocol Foundations

**Part I · Foundations** · Book Ch 1 · Stories S01 · sidebar `/foundations`

MCP is a JSON-RPC 2.0 protocol with a single current revision — `2026-07-28` — defined around
three roles: host, client, and server. This pattern shows how the revision is negotiated and
how the server's `Implementation` descriptor reaches the page, with no `initialize` handshake.

## Round-trip

```
demo (FoundationsPage)  ──GET /api/discover, /api/status──▶  client host (Minimal API)
      ▲                                                          │ host.WithTraceAsync("discover", …)
      │                                                          ▼
  { negotiatedVersion, serverInfo }                  Stackific.Mcp.Client  McpClient
      │                                                          │ server/discover (JSON-RPC)
      └────────── revision + serverInfo ◀── Streamable HTTP ─────┴──▶ MCP server (McpServer ctor)
```

## 1 · Frontend — `demo/src/routes/foundations.tsx`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host.
Pressing Run issues `server/discover`, then reads back the negotiated revision and server
identity exactly as cached from the wire:

```tsx
// demo/src/routes/foundations.tsx
onClick={() =>
  status.run(async () => {
    await backend.discover();
    return backend.status();
  })
}
// ...
<Badge variant="blue">revision: {s.negotiatedVersion ?? 'none'}</Badge>
<JsonBlock value={{ negotiatedVersion: s.negotiatedVersion, serverInfo: s.serverInfo }} />
```

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs`

The client is constructed with a fixed `ClientInfo` — its on-the-wire `Implementation` — and
exposes the negotiated revision after discovery:

```csharp
// csharp-mcp-client/ClientHost.cs
private static readonly Implementation ClientInfo = new() { Name = "companion-mcp-client", Title = "Companion MCP Client (C#)", Version = "0.1.0" };
// ...
var client = new McpClient(transport, ClientInfo, Capabilities);
// ...
Bus.Emit(new Frame(0, 0, "local", "lifecycle", Summary: $"connected — protocol {_client.NegotiatedVersion ?? "unknown"}"));
```

`Status()` surfaces the negotiated version and the server's identity that `DiscoverAsync()`
cached:

```csharp
// csharp-mcp-client/ClientHost.cs
public object Status() => new
{
  connected = _client is { IsConnected: true },
  negotiatedVersion = _client?.NegotiatedVersion,
  serverInfo = _client?.ServerInfo,
  // ...
};
```

## 3 · MCP server — `csharp-mcp-server/Features.cs` + `csharp-mcp-server/Program.cs`

The server identity comes straight from the constructor's first argument; the entry point
fixes the revision and the stateless Streamable HTTP transport:

```csharp
// csharp-mcp-server/Features.cs
var server = new McpServer(
  new Implementation { Name = "companion-mcp-server", Title = "Companion MCP Server (C#)", Version = "0.1.0" },
  new ServerCapabilities { /* ...capabilities... */ },
  instructions: "A reference MCP server demonstrating every server and client capability over Streamable HTTP.");
```

```csharp
// csharp-mcp-server/Program.cs
// The MCP endpoint: the SDK adapter parses, validates headers, dispatches, and streams (§9).
app.MapMcp("/mcp", Features.Build());
```

The SDK pins the revision as a single constant; identifiers are opaque, exact-matched strings:

```csharp
// csharp-sdk/Protocol/ProtocolRevision.cs
/// <summary>The wire value of the revision this SDK speaks: <c>2026-07-28</c>.</summary>
public const string Current = "2026-07-28";
```

## On the wire

1. `server/discover` → `{ resultType: "complete", protocolVersion: "2026-07-28", serverInfo, capabilities }`

The negotiated revision is established by [discovery](./overview.md), not a handshake. Every
client request also restates the revision in its [`_meta`](./meta.md) envelope, which is what
makes the server [stateless](./stateless.md).
