# Capabilities

**Part I · Foundations** · Book Ch 10 · Stories S10 · sidebar `/capabilities`

Capabilities are the two declaration objects — `ClientCapabilities` and `ServerCapabilities` —
that tell each peer which method families and behaviors the other supports. A feature is usable
only when both sides declare its governing capability. This pattern reads the live status and
shows both objects side by side.

## Round-trip

```
demo (CapabilitiesPage)  ──GET /api/status──▶  client host (Minimal API)
      ▲                                            │ host.Status()
      │                                            ▼
  JsonBlock × 2                        Stackific.Mcp.Client  McpClient
      │                                            │ client caps stamped per request; server caps from discover
      └── { clientCapabilities, serverCapabilities } ◀──┴──▶ MCP server (McpServer ctor caps)
```

## 1 · Frontend — `demo/src/routes/capabilities.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host.
The page fetches status and renders what each side declared:

```tsx
// demo/src/routes/capabilities.tsx
<Button onClick={() => status.run(() => backend.status())}>Load capabilities</Button>
// ...
<p>clientCapabilities</p>
<JsonBlock value={s.clientCapabilities ?? {}} />
<p>serverCapabilities</p>
<JsonBlock value={s.serverCapabilities ?? {}} />
```

```ts
// demo/src/lib/api.ts
status: () => getJson<BackendStatus>('/api/status'),
```

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs`

The client declares `Capabilities` once and stamps them into every request's `_meta`;
`ServerCapabilities` returns what the latest `server/discover` advertised:

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
// csharp-mcp-client/ClientHost.cs
public object Status() => new
{
  // ...
  serverCapabilities = _client?.ServerCapabilities,
  clientCapabilities = Capabilities,
  // ...
};
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The constructor's second argument *is* `ServerCapabilities` — the exact object discovery
returns. Sub-flags like `Tools.ListChanged` refine a capability without replacing it:

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

1. `server/discover` result → `{ capabilities: { logging: {}, completions: {}, tools: { listChanged: true }, … } }`
2. every client request `_meta` → `{ io.modelcontextprotocol/clientCapabilities: { elicitation: {…}, sampling: {}, roots: {}, extensions: {…} } }`

The mere presence of a field declares support; empty `{}` (the C# `new JsonObject()`) is valid
and declares no optional behaviors. The client caches server capabilities from the latest
[discover](./overview.md); the server re-reads client capabilities from each request's
[`_meta`](./meta.md). If a request needs an undeclared client capability the server rejects it
with `-32003`. The C# server advertises its extensions through the `Extensions` map — see
[Extensions Map](./extensions.md).
