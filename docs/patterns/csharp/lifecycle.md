# Feature Lifecycle

**Part VIII · Governance** · Book Ch 27 · Stories S43 · sidebar `/lifecycle`

Every governed feature is **Active**, **Deprecated**, or **Removed**. A Deprecated feature stays
fully functional and behaves exactly as specified — a peer MUST keep interoperating with it and
MUST NOT fault the exchange. This pattern exercises a registered deprecated capability (Roots) and
shows where lifecycle/deprecation surfaces in each layer. Deprecation warnings stay **out of band**:
they never ride the wire and never alter a response.

## Round-trip

```
demo (LifecyclePage)  ──POST /api/tools/call {show_roots}──▶  client host (Minimal API)
      ▲                                                            │ host.CallToolWithInputAsync('show_roots')
      │                                                            ▼
  ApiResultView                                          Stackific.Mcp.Client  McpClient
      │                                                            │ tools/call → roots/list (deprecated)
      └──── identical result (no deprecation on the wire) ◀────────┴──▶ MCP server
                                                                         DeprecatedRegistry.EmitWarning → stderr
```

## 1 · Frontend — `demo/src/routes/lifecycle.tsx`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page calls a tool that, in turn, reads **Roots** — a deprecated client capability that must remain
functional. The button click is an ordinary `tools/call`; the UI's own lifecycle table is static
text. The point the page makes is observable: a deprecated feature returns exactly what a
non-deprecated one would.

```tsx
// demo/src/routes/lifecycle.tsx
<Button
  data-testid="run-lifecycle"
  disabled={call.loading}
  onClick={() => call.run(() => backend.callTool('show_roots', {}))}
>
  Run
</Button>
<ApiResultView result={call.data} />
```

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs`

The host advertises the deprecated capabilities it still supports in its per-request `_meta`
envelope. `Sampling` and `Roots` are present here precisely because they remain **functional** while
Deprecated — the client opts into them so the server may solicit them:

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

When the `show_roots` tool runs, the server asks the client for `roots/list`; the host's registered
input handler answers it like any other input request — no special-casing for the deprecated status:

```csharp
// csharp-mcp-client/ClientHost.cs
client.RegisterInputHandler(McpMethods.RootsList, HandleRootsAsync);
// ...
private Task<JsonNode> HandleRootsAsync(JsonObject? _)
{
  // ...
  var result = new ListRootsResult { Roots = [.. _roots.Select(r => new Root { Uri = r.Uri, Name = r.Name })] };
  return Task.FromResult(Serialize(result));
}
```

## 3 · MCP server — `csharp-sdk/Lifecycle/Registry.cs` + `csharp-sdk/Lifecycle/Policy.cs`

The lifecycle discipline lives in the SDK the server is built on. A **consolidated registry** of
deprecated features carries each one's migration note and earliest-removal date:

```csharp
// csharp-sdk/Lifecycle/Registry.cs
public static IReadOnlyList<DeprecatedRegistryEntry> Entries { get; } =
[
  new()
  {
    Feature = "Roots capability",
    DefinedIn = "§21",
    MigrationNote = "No direct replacement; roots integration is now host-managed.",
    EarliestRemoval = "2026-07-28",
  },
  // ... Sampling, includeContext values, Logging, logLevel, Dynamic Client Registration
];
```

The state machine forbids a direct **Active → Removed** jump — a feature MUST pass through
Deprecated — and the policy module fixes the minimum windows (12 months standard, 90 days
security-expedited):

```csharp
// csharp-sdk/Lifecycle/Policy.cs
public static bool CanTransition(LifecycleState from, LifecycleState to)
{
  if (from == to) return false;
  if (from == LifecycleState.Active && to == LifecycleState.Removed) return false;
  if (from == LifecycleState.Removed) return false;
  return true;
}
```

The advisory, **out-of-band** warning emitter routes to stderr — never to the wire — and explicitly
does not alter message semantics (R-27.4-e):

```csharp
// csharp-sdk/Lifecycle/Registry.cs
public static void EmitWarning(string feature, string migration, TextWriter? writer = null)
{
  // ... advisory only; MUST NOT inject the warning into the protocol wire format (R-27.4-e)
  var sink = writer ?? Console.Error;
  sink.WriteLine($"[MCP] Deprecated feature used: \"{feature}\". Migration: {migration}");
}
```

Unlike the TypeScript runtime — which calls `emitDeprecationWarning` inline whenever the server is
about to solicit a Deprecated input-request kind (sampling/roots) — the C# `McpServer` does **not**
wire `EmitWarning` into its dispatch path; the emitter is available for an embedder to call, and the
closest *wired* deprecation mechanism is the server's continued emission of the Deprecated
`notifications/message` log channel (§15.3), retained purely for interoperability — see
`csharp-sdk/Server/ServerContext.cs`. Either way the Roots round-trip below is unaffected.

## On the wire

1. `tools/call` `{ name: "show_roots" }` → the server solicits `roots/list` via an
   `input_required` result; the client retries with its roots.
2. The final result is byte-for-byte what a non-deprecated call returns — **no** deprecation field,
   header, or warning crosses the boundary. Any deprecation signal (the SDK's `EmitWarning`, the
   `[Obsolete]` attributes on the Roots/Sampling types) is a build- or process-local concern an
   embedder sees but a peer never does.

A Deprecated feature is **optional to implement**, but one that *is* implemented must follow its
spec in full — see [Conformance](./conformance.md) (`R-29.5-e`/`R-29.5-f`). The Roots and Sampling
capabilities exercised here are the same ones [Roots](./roots.md) and [Sampling](./sampling.md)
demonstrate; their deprecated status changes nothing about how those round-trips behave.
