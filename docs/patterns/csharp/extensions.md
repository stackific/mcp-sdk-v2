# Extensions Map

**Part I · Foundations** · Book Ch 11 · Stories S11·S38 · sidebar `/extensions`

Extensions are how MCP grows beyond its core: namespaced, opt-in additions advertised on both
`ClientCapabilities` and `ServerCapabilities`, active only in the intersection of what both
peers advertise. This pattern reads the negotiated capabilities to show the Tasks (and UI)
extension the companion server advertises at discovery.

## Round-trip

```
demo (ExtensionsPage)  ──GET /api/status──▶  client host (Minimal API)
      ▲                                          │ host.Status()
      │                                          ▼
  JsonBlock(extensions)                Stackific.Mcp.Client  McpClient
      │                                          │ server caps cached from server/discover
      └──── { serverExtensions } ◀───────────────┴──▶ MCP server (Extensions map in ctor)
```

## 1 · Frontend — `demo/src/routes/extensions.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host.
The page reads status and shows the server's `extensions` map, or — when none is advertised —
the extension-bearing `tasks` capability it does negotiate:

```tsx
// demo/src/routes/extensions.tsx
const extensions = s?.serverExtensions ?? null;
const tasks = (s?.serverCapabilities as Record<string, unknown> | null | undefined)?.tasks;
// ...
<Button onClick={() => call.run(() => backend.status())}>Read extensions map</Button>
// ...
<JsonBlock value={hasExtensions ? extensions : { tasks: tasks ?? null }} />
```

```ts
// demo/src/lib/api.ts
status: () => getJson<BackendStatus>('/api/status'),
```

Unlike the TypeScript server (which expresses Tasks as a top-level `tasks` capability), the C#
server advertises both Tasks and UI through the standard `extensions` map, so the
`serverExtensions` branch is populated directly.

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs`

`Status()` pulls the `extensions` map straight off the cached server capabilities; the client
also advertises a `tasks` extension of its own, so the extension can be active by intersection:

```csharp
// csharp-mcp-client/ClientHost.cs
public object Status() => new
{
  // ...
  serverCapabilities = _client?.ServerCapabilities,
  serverExtensions = _client?.ServerCapabilities?.Extensions,
  clientCapabilities = Capabilities, // includes Extensions[MetaKeys.TasksExtension]
  // ...
};
```

The client's own capabilities carry the matching extension key:

```csharp
// csharp-mcp-client/ClientHost.cs
Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject() },
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The `Extensions` entry in the constructor's capabilities object *is* the advertised set — a
namespaced map keyed by extension identifier (`io.modelcontextprotocol/tasks`,
`io.modelcontextprotocol/ui`):

```csharp
// csharp-mcp-server/Features.cs
var server = new McpServer(
  new Implementation { Name = "companion-mcp-server", Title = "Companion MCP Server (C#)", Version = "0.1.0" },
  new ServerCapabilities
  {
    // ...core capabilities...
    Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject(), [MetaKeys.UiExtension] = new JsonObject() },
  },
  instructions: "...");
```

The identifiers are pinned as SDK constants:

```csharp
// csharp-sdk/Json/MetaKeys.cs
/// <summary>Extension identifier for the Tasks extension (§25).</summary>
public const string TasksExtension = "io.modelcontextprotocol/tasks";

/// <summary>Extension identifier for the Interactive User-Interface extension (§26).</summary>
public const string UiExtension = "io.modelcontextprotocol/ui";
```

## On the wire

1. `server/discover` result → `{ capabilities: { …, extensions: { "io.modelcontextprotocol/tasks": {}, "io.modelcontextprotocol/ui": {} } } }`

An extension is active only when both peers advertise the same identifier (Tasks is
`io.modelcontextprotocol/tasks`); a peer never exercises one the other side did not advertise.
Unknown extension keys and unknown settings keys are ignored, never errors. Extensions are a
specialization of [Capabilities](./capabilities.md) negotiation; the Tasks extension itself is
exercised from the `/tasks` page.
