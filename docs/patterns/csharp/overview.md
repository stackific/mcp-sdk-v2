# Overview & Discovery

**Part I · Foundations** · Book Ch 9–11 · Stories S07–S09 · sidebar `/`

Discovery is the single round-trip that replaces the old `initialize` handshake. The client
sends `server/discover`; the server answers with its identity, capabilities, and supported
revisions — and the client caches the negotiated version for the status panel. This pattern
traces that round-trip from the landing page through the C# MCP client host to the server.

## Round-trip

```
demo (OverviewPage)  ──REST GET /api/discover──▶  client host (Minimal API)
      ▲                                                 │ host.WithTraceAsync("discover", …)
      │                                                 ▼
  ApiResultView                              Stackific.Mcp.Client  McpClient
      │                                                 │ server/discover (JSON-RPC)
      └──────── { discoverResult, status } ◀─ Streamable HTTP ─┴──▶ MCP server (McpServer ctor)
```

## 1 · Frontend — `demo/src/routes/overview.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared across all languages; selecting "C#" only repoints the REST base URL at
the C# client host. On mount the page (re)connects, then a button drives a visible
`server/discover`:

```tsx
// demo/src/routes/overview.tsx
useEffect(() => {
  void connect.run(() => backend.connect());
}, []);
// ...
<Button onClick={() => discover.run(() => backend.discover())}>Call server/discover</Button>
<ApiResultView result={discover.data} />
```

Both calls are thin REST wrappers onto the client host:

```ts
// demo/src/lib/api.ts
connect: () => postJson<ApiResult<BackendStatus>>('/api/connect', {}),
discover: () => getJson<ApiResult<Any>>('/api/discover'),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The Minimal API routes delegate to `ReconnectAsync()` (always a fresh discover) and a traced
`DiscoverAsync()`:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/connect", () => Run(async () => { await host.ReconnectAsync(); return host.Status(); }));
app.MapGet("/api/discover", () => Run(() => host.WithTraceAsync("discover", async client =>
{
  var discover = await client.DiscoverAsync();
  return (object?)new { discoverResult = ToNode(discover), status = host.Status() };
})));
```

`EnsureConnectedAsync` builds the transport and `McpClient`, then runs the first
`server/discover`; `Status()` exposes the negotiated version and server identity it cached:

```csharp
// csharp-mcp-client/ClientHost.cs
var transport = new StreamableHttpClientTransport(new Uri(_serverUrl)) { /* ...taps... */ };
var client = new McpClient(transport, ClientInfo, Capabilities);
// ...register input handlers...
_client = client;
await client.DiscoverAsync(); // populates negotiated revision + server identity
```

```csharp
// csharp-mcp-client/ClientHost.cs
public object Status() => new
{
  connected = _client is { IsConnected: true },
  negotiatedVersion = _client?.NegotiatedVersion,
  serverInfo = _client?.ServerInfo,
  serverCapabilities = _client?.ServerCapabilities,
  // ...
};
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The constructor is the whole story: its first argument is the server identity and its second
is the capabilities object — exactly the two things `server/discover` returns:

```csharp
// csharp-mcp-server/Features.cs
var server = new McpServer(
  new Implementation { Name = "companion-mcp-server", Title = "Companion MCP Server (C#)", Version = "0.1.0" },
  new ServerCapabilities
  {
    Logging = new JsonObject(),
    Completions = new JsonObject(),
    Tools = new ToolsCapability { ListChanged = true },
    Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
    Prompts = new PromptsCapability { ListChanged = true },
    Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject(), [MetaKeys.UiExtension] = new JsonObject() },
  },
  instructions: "A reference MCP server demonstrating every server and client capability over Streamable HTTP.");
```

## On the wire

1. `server/discover` → `{ resultType: "complete", protocolVersion, capabilities, serverInfo, instructions? }`

`serverInfo` is the `Implementation` from the constructor's first argument; `capabilities` is
the second; `instructions` is the constructor's named argument. The client caches all three so
[Capabilities](./capabilities.md) and [Foundations](./foundations.md) can read them back without
another round-trip. See [Stateless Model](./stateless.md) for why `server/discover` — not a
session — carries this.
