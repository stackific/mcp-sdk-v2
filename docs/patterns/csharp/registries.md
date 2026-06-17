# Registries

**Part VIII · Governance** · Book Ch 29 / App. A–E · Stories S46 · sidebar `/registries`

The capstone appendices (A–E) consolidate the entire wire surface into five authoritative tables:
the Method & Notification Index, the Error Code Registry, the Reserved `_meta` Key Registry, the
Capability Registry, and the Consolidated Type Index. They define **no new types** — each row points
to the section that normatively owns it. This pattern shows how the server registers and advertises
its live catalog, how the client lists it, and where the SDK's static registry data lives.

## Round-trip

```
demo (RegistriesPage)  ──GET /api/tools──▶  client host (Minimal API)
      ▲                                          │ host.WithTraceAsync("tools/list", c => c.ListToolsAsync())
      │                                          ▼
  Badge per tool name                    Stackific.Mcp.Client  McpClient
      │                                          │ tools/list (JSON-RPC)
      └──── live method surface ◀──── _toolList ──┴──▶ MCP server (RegisterTool → ListTools)
```

## 1 · Frontend — `demo/src/routes/registries.tsx`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page enumerates the standard registry contents statically, then queries the live server's
`tools/list` so the *actual* method surface can be compared against the Method & Notification Index
(Appendix A). The live half is one call:

```tsx
// demo/src/routes/registries.tsx
const tools = call.data?.ok ? ((call.data.result.tools as any[]) ?? []) : [];
// ...
<Button data-testid="run-registries" disabled={call.loading}
  onClick={() => call.run(() => backend.listTools())}>
  Load live registry
</Button>
<div data-testid="registry-methods" className="flex flex-wrap gap-1.5">
  {tools.map((t) => (
    <Badge key={t.name} variant="blue">{t.name}</Badge>
  ))}
</div>
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The REST route delegates to the SDK `McpClient`'s typed `ListToolsAsync()`, threaded through the
host's tracing wrapper so every hop reaches the debug bus:

```csharp
// csharp-mcp-client/Program.cs
app.MapGet("/api/tools", () =>
  Run(() => host.WithTraceAsync<object?>("tools/list", c => Box(c.ListToolsAsync()))));
```

```csharp
// csharp-sdk/Client/McpClient.cs
public async Task<ListToolsResult> ListToolsAsync(string? cursor = null) =>
  // ... tools/list request, deserialized into the typed result
```

## 3 · MCP server — `csharp-sdk/Server/McpServer.cs` + `csharp-sdk/Protocol/Registries.cs`

The server *is* a registry: `RegisterTool` appends to the tool list (and a name→handler map), and
`ListTools` projects that list onto the `tools/list` result — the live catalog the demo renders:

```csharp
// csharp-sdk/Server/McpServer.cs
public void RegisterTool(Tool tool, ToolHandler handler)
{
  AssertRegistrableToolSchemas(tool);
  if (!_toolHandlers.TryAdd(tool.Name, handler))
  {
    throw new InvalidOperationException($"A tool named \"{tool.Name}\" is already registered.");
  }
  _toolList.Add(tool);
}
```

```csharp
// csharp-sdk/Server/McpServer.cs
private JsonObject ListTools(JsonObject? prms)
{
  RequireCapability(_capabilities.Tools is not null, McpMethods.ToolsList);
  var (page, nextCursor) = Paginate(_toolList, prms);
  var result = Serialize(new ListToolsResult { Tools = page, NextCursor = nextCursor, TtlMs = CacheTtlMs, CacheScope = DefaultCacheScope });
  return Complete(result);
}
```

The companion server seeds that list at build time — each `RegisterTool` is one row in the live
registry the demo enumerates:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool
  {
    Name = "echo",
    Title = "Echo",
    Description = "The simplest possible tool: echoes text back.",
    InputSchema = Schema("""{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}"""),
    Annotations = new ToolAnnotations { ReadOnlyHint = true, IdempotentHint = true, OpenWorldHint = false },
  },
  ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("text"))));
```

The five **static** appendix tables (A–E) are SDK data — App. A's Method & Notification Index and
App. D's Capability Registry are the ones the demo mirrors:

```csharp
// csharp-sdk/Protocol/Registries.cs
public static IReadOnlyList<MethodNotificationIndexEntry> MethodRegistry { get; } =
[
  new("tools/list", RegistryMethodKind.Request, "client→server", "§16 Tools"),
  new("tools/call", RegistryMethodKind.Request, "client→server", "§16 Tools"),
  new("roots/list", RegistryMethodKind.InputRequest, "server→client (via input-required result, §11)", "§21 Deprecated Client-Provided Capabilities"),
  // ... every method and notification, each citing its owning section
];
```

```csharp
// csharp-sdk/Protocol/Registries.cs
public static IReadOnlyList<CapabilityRegistryEntry> CapabilityRegistry { get; } =
[
  new("tools", "server",
    [new("listChanged", Required: false, "enables notifications/tools/list_changed", Boolean: true)],
    "§6 Capabilities and Extensions"),
  new("roots", "client", [], "§6 Capabilities and Extensions", Deprecated: true),
  // ... io.modelcontextprotocol/tasks, io.modelcontextprotocol/ui (extension-scoped)
];
```

Unlike the TypeScript module — which re-exports `ERROR_CODE_REGISTRY` from `errors.ts` so the table
is never rebuilt — the C# `Registries` class reproduces Appendix B (Error Codes) *as data* in the
same module, keyed off the authoritative `ErrorCodes.*` constants so the listed codes never drift:

```csharp
// csharp-sdk/Protocol/Registries.cs
public static IReadOnlyDictionary<int, string> ErrorCodeRegistry { get; } =
  new Dictionary<int, string>
  {
    [ErrorCodes.MethodNotFound] = "Method not found, or gated behind an unadvertised capability.",
    [ErrorCodes.MissingRequiredClientCapability] = "MissingRequiredClientCapability: a required client capability was not declared.",
    [ErrorCodes.UnsupportedProtocolVersion] = "UnsupportedProtocolVersion: no mutually supported protocol revision.",
    // ...
  };
```

## On the wire

1. `tools/list` → `{ tools: [{ name, inputSchema, annotations, ... }] }` — the live method surface,
   one badge per name in the demo.
2. Every name returned is a row in Appendix A; every advertised capability is a row in Appendix D —
   the appendices restate, never redefine, what the wire already carries.

The registries are governance artifacts: a consolidation that points back to its defining section,
plus a few cross-cutting rules (a custom error code must avoid the reserved table via
`ValidateExtensionErrorCode`; the three client `_meta` keys are required on every request, per
`RequiredClientRequestMetaKeys()`). See [Capabilities](./capabilities.md),
[Errors](./errors.md), and [The _meta Envelope](./meta.md) for the sections each appendix indexes,
and [Conformance](./conformance.md) for the rule that a profile MUST use these exact codes, keys, and
identifiers.
