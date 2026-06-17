# Roots

**Part V · Client features (MRTR)** · Book Ch 22 · Stories S32 · sidebar `/roots`

Roots reverse direction: *inside* a tool call the server asks the client for its workspace
roots. The server's `ctx.ListRootsAsync` surfaces at the client host as a `roots/list` request;
the host returns its configured roots and the list flows back so the tool resumes. This pattern
edits the roots the client will report, then calls `show_roots`. See [MRTR](./mrtr.md) for the
retry loop.

## Round-trip (reversed inside the call)

```
demo (RootsPage) ──REST POST /api/roots (SetRoots)──▶  client host (ASP.NET Core)  SetRoots()
      ▲          ──REST POST /api/tools/call──────────▶        │ CallToolWithInputAsync('show_roots')
      │                                                         ▼
      │                                  client.CallToolWithInputAsync(...) ──tools/call──▶ MCP server
      │                                                         │                          ctx.ListRootsAsync()
      │                                                         │ ◀── roots/list ◀──────────┘ (over the response stream)
      │                          RegisterInputHandler(RootsList) ──▶ return { roots }
      └──────── { content } ◀── retried tools/call ◀── roots flow back, tool resumes
```

## 1 · Frontend — `demo/src/routes/roots.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page edits the roots JSON, saves it to the
host, then calls the tool:

```ts
// demo/src/lib/api.ts
getRoots: () => getJson<{ roots: { uri: string; name?: string }[] }>('/api/roots'),
setRoots: (roots: { uri: string; name?: string }[]) =>
  postJson<{ roots: Any[] }>('/api/roots', { roots }),
```

```tsx
// demo/src/routes/roots.tsx
function saveRoots() {
  try {
    const parsed = JSON.parse(roots);
    void save.run(() => backend.setRoots(parsed));
  } catch {
    // invalid JSON — ignore
  }
}
// ...
<Button onClick={() => call.run(() => backend.callTool('show_roots', {}))} data-testid="run-roots">
  Call show_roots
</Button>
```

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs` + `csharp-mcp-client/Program.cs`

The host registers a handler for the server→client `roots/list` request that simply returns the
configured roots:

```csharp
// csharp-mcp-client/ClientHost.cs
client.RegisterInputHandler(McpMethods.RootsList, HandleRootsAsync);
// ...
private Task<JsonNode> HandleRootsAsync(JsonObject? _)
{
  Bus.Emit(new Frame(0, 0, "local", "note", McpMethods.RootsList,
    Summary: "client returning configured roots", Payload: new { roots = _roots }, Trace: _trace.Value));
  var result = new ListRootsResult { Roots = [.. _roots.Select(r => new Root { Uri = r.Uri, Name = r.Name })] };
  return Task.FromResult(Serialize(result));
}
```

`_roots` is host state, seeded with defaults and editable over REST via `GetRoots`/`SetRoots`:

```csharp
// csharp-mcp-client/ClientHost.cs
private List<RootEntry> _roots =
[
  new("file:///workspace/companion-project", "companion-project"),
  new("file:///workspace/shared-lib", "shared-lib"),
];
// ...
public IReadOnlyList<RootEntry> GetRoots() => _roots;
public void SetRoots(IReadOnlyList<RootEntry> roots) => _roots = [.. roots];
```

```csharp
// csharp-mcp-client/Program.cs
app.MapGet("/api/roots", () => Results.Json(new { roots = host.GetRoots() }));
app.MapPost("/api/roots", (JsonObject body) =>
{
  var roots = (body["roots"] as JsonArray ?? [])
    .OfType<JsonObject>()
    .Select(r => new RootEntry(r["uri"]!.GetValue<string>(), r["name"]?.GetValue<string>()))
    .ToList();
  host.SetRoots(roots);
  return Results.Json(new { roots = host.GetRoots() });
});
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

Inside the tool, `ctx.ListRootsAsync` issues the request back to the client and awaits until the
list returns:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTool(
  new Tool { Name = "show_roots", Title = "Show Roots", Description = "Server requests the client roots list (roots/list).", InputSchema = Schema("""{"type":"object"}""") },
  async ctx =>
  {
    var roots = await ctx.ListRootsAsync();
    var rendered = new JsonArray();
    foreach (var root in roots) rendered.Add(new JsonObject { ["uri"] = root.Uri, ["name"] = root.Name });
    return CallToolResult.FromText($"Client roots:\n{rendered.ToJsonString()}");
  });
```

## On the wire

1. `tools/call` (`show_roots`) → the server completes the response with an `input_required`
   result naming `roots/list`.
2. The client supplies its roots and **retries** `tools/call` with the same arguments plus the
   gathered `{ roots }`.
3. The retried call completes → `{ content: [{ type: 'text', text: 'Client roots: [...]' }] }`.

Roots is a *deprecated* client capability — convey workspace locations via tool parameters or
resource URIs instead. [Elicitation](./elicitation.md) and [Sampling](./sampling.md) are the
other two client features riding this reversed loop.
