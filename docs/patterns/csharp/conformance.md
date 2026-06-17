# Conformance

**Part VIII · Governance** · Book Ch 29 · Stories S45 · sidebar `/conformance`

Conformance is the testable contract for being an MCP party, judged on **observable wire behavior
alone** across three axes: **role** (client / server / both), **feature surface** (the unconditional
baseline plus whatever is advertised), and **transport** (each transport, independently). An
implementation is conformant iff it satisfies every applicable normative requirement for the roles
it plays and the features it advertises — no more, no less. This pattern reads the live conformance
profile and grounds each layer in the real enforcement.

## Round-trip

```
demo (ConformancePage)  ──GET /api/status──▶  client host (Minimal API)
      ▲                                            │ host.Status(): NegotiatedVersion, ServerCapabilities
      │                                            ▼
  negotiatedVersion + caps                Stackific.Mcp.Client  McpClient (baseline _meta envelope)
      │                                            │ server/discover
      └──── conformance profile ◀──── advertise ⇔ implement ─┴──▶ MCP server (RequireCapability gate)
```

## 1 · Frontend — `demo/src/routes/conformance.tsx`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page loads the live status and renders the two values that fix this implementation's conformance
profile — the negotiated revision and the advertised server capabilities:

```tsx
// demo/src/routes/conformance.tsx
<Button data-testid="run-conformance" disabled={status.loading}
  onClick={() => status.run(() => backend.status())}>
  Load conformance profile
</Button>
{s ? (
  <div className="space-y-3">
    <Badge variant="blue">{s.negotiatedVersion ?? 'none'}</Badge>
    <JsonBlock value={s.serverCapabilities ?? {}} />
  </div>
) : null}
```

The matrix beneath it is static documentation; the load-bearing part is that conformance is judged
on these *observable* values, never on internal architecture.

## 2 · MCP client host — `csharp-mcp-client/ClientHost.cs`

Baseline **client** conformance (§29.3) is that every request carries the protocol revision, client
identity, and client capabilities in its `_meta` envelope. The SDK `McpClient` stamps that envelope
on every request; the host reports the negotiated outcome:

```csharp
// csharp-mcp-client/ClientHost.cs
public object Status() => new
{
  connected = _client is { IsConnected: true },
  negotiatedVersion = _client?.NegotiatedVersion,
  serverInfo = _client?.ServerInfo,
  serverCapabilities = _client?.ServerCapabilities,
  serverExtensions = _client?.ServerCapabilities?.Extensions,
  clientCapabilities = Capabilities,
  // ...
};
```

The negotiated revision comes from the `server/discover` round-trip the host drives on connect:

```csharp
// csharp-mcp-client/ClientHost.cs
// Discovery (server/discover) populates the negotiated revision + server identity.
await client.DiscoverAsync();
```

## 3 · MCP server — `csharp-sdk/Server/McpServer.cs` + `csharp-sdk/Protocol/ConformanceRequirements.cs`

The runtime enforces the **advertise ⇔ implement** rule directly: every feature is gated behind its
advertised capability, and a method whose capability was not advertised is rejected — a server MUST
NOT expose behavior it has not advertised (`R-29.2-m`/`R-29.2-n`):

```csharp
// csharp-sdk/Server/McpServer.cs
private static void RequireCapability(bool declared, string method)
{
  if (!declared) throw McpError.MethodNotFound(method);
}
```

```csharp
// csharp-sdk/Server/McpServer.cs
private JsonObject ListTools(JsonObject? prms)
{
  RequireCapability(_capabilities.Tools is not null, McpMethods.ToolsList);
  // ...
}
```

The whole contract is modeled as a machine-checkable **requirement registry** plus a baseline
request-disposition classifier that runs the ordered §29.2 checks (revision → envelope → capability
→ gating) on a single self-contained request:

```csharp
// csharp-sdk/Protocol/ConformanceRequirements.cs
public static IReadOnlyList<ConformanceRequirement> All { get; } =
[
  Req("R-29.2-a", "29.2", "MUST", Axis.Role, ServerOnly,
    "A server implements server/discover; its obligation to answer is unconditional."),
  Req("R-29.2-h", "29.2", "MUST", Axis.Role, ServerOnly,
    "An unsupported declared revision is rejected with -32004 whose data lists supported revisions and the requested one."),
  Req("R-29.2-i", "29.2", "MUST", Axis.Role, ServerOnly,
    "A request needing an undeclared client capability is rejected with -32003 whose data.requiredCapabilities carries the ClientCapabilities."),
  // ... every §29.1–§29.9 atom, in spec order, plus the §30 reference marker
];
```

```csharp
// csharp-sdk/Protocol/ConformanceRequirements.cs
public static FeatureConformance IsFeatureFullyConformant(bool advertised, bool fullyImplemented) =>
  advertised && !fullyImplemented
    ? new FeatureConformance(false, true)  // §29.9: no partial conformance
    : new FeatureConformance(true, false);
```

The server's `HandleRequestAsync` runs these checks in spec order on every request — protocol-version
support (`-32004`), the Deprecated `logLevel` opt-in (`-32602`), then capability gating in
`DispatchAsync` — so the disposition the classifier models is exactly what the runtime enforces.

## On the wire

1. `server/discover` → the negotiated revision and the advertised `serverCapabilities` — the only
   inputs that fix the profile.
2. A request for an unadvertised capability → `-32601 Method not found`.
3. An unsupported declared revision → `-32004`; a malformed `_meta` envelope → `-32602`; a missing
   required client capability → `-32003`.

Conformance is bidirectional: advertising a capability binds you to all its MUST-level behavior, and
you MUST NOT exercise anything unadvertised — there is no partial conformance. Robustness (§29.6)
requires tolerating inputs richer than understood: unknown fields/capabilities/extensions are
ignored, not rejected (`ConformanceRequirements.RobustnessDisposition`). See
[Capabilities](./capabilities.md) for negotiation, [Errors](./errors.md) for the exact codes, and
[Registries](./registries.md) for the App. B/C/D tables a profile must use.
