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
demo (ConformancePage)  ──GET /api/status──▶  client host (Hono)
      ▲                                            │ getStatus(): negotiatedVersion, serverCapabilities
      │                                            ▼
  negotiatedVersion + caps                @stackific/mcp-sdk  Client (baseline _meta envelope)
      │                                            │ initialize / server/discover
      └──── conformance profile ◀──── advertise ⇔ implement ─┴──▶ MCP server (requireCapability gate)
```

## 1 · Frontend — `demo/src/routes/conformance.tsx`

The page loads the live status and renders the two values that fix this implementation's conformance
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

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

Baseline **client** conformance (§29.3) is that every request carries the protocol revision, client
identity, and client capabilities in its `_meta` envelope. The SDK `Client` stamps that envelope on
every request; the host reports the negotiated outcome:

```ts
// ts-mcp-client/src/mcp-client.ts
export function getStatus() {
  const caps = client?.getServerCapabilities() ?? null;
  return {
    connected: !!client,
    negotiatedVersion: client?.getNegotiatedVersion() ?? null,
    serverInfo: client?.getServerVersion() ?? null,
    serverCapabilities: caps,
    serverExtensions: (caps?.['extensions'] as unknown) ?? null,
    clientCapabilities: CLIENT_CAPABILITIES,
    // ...
  };
}
```

The negotiated revision comes from the `server/discover` round-trip the host drives on connect:

```ts
// ts-mcp-client/src/mcp-client.ts
// Discovery (server/discover) populates the negotiated revision + server identity ...
await c.discover();
```

## 3 · MCP server — `ts-sdk/src/server/server.ts` + `ts-sdk/src/protocol/conformance-requirements.ts`

The runtime enforces the **advertise ⇔ implement** rule directly: every feature is gated behind its
advertised capability, and a method whose capability was not advertised is rejected — a server MUST
NOT expose behavior it has not advertised (`R-29.2-m`/`R-29.2-n`):

```ts
// ts-sdk/src/server/server.ts
private requireCapability(capability: string, method: string): void {
  if (this.capabilities[capability] === undefined) {
    throw new ServerError(
      METHOD_NOT_FOUND_CODE,
      `Method not found: ${method} (the "${capability}" capability is not advertised)`,
    );
  }
}
```

```ts
// ts-sdk/src/server/server.ts
case 'tools/list':
  this.requireCapability('tools', method);
  return this.listTools(params);
```

The whole contract is modeled as a machine-checkable **requirement registry** plus a baseline
request-disposition classifier that runs the ordered §29.2 checks (revision → envelope → capability
→ gating) on a single self-contained request:

```ts
// ts-sdk/src/protocol/conformance-requirements.ts
export const CONFORMANCE_REQUIREMENTS: readonly ConformanceRequirement[] = [
  req('R-29.2-a', '29.2', 'MUST', 'role', SERVER, 'A server implements server/discover; its obligation to answer is unconditional.'),
  req('R-29.2-h', '29.2', 'MUST', 'role', SERVER, 'An unsupported declared revision is rejected with -32004 whose data lists supported revisions and the requested one.'),
  req('R-29.2-i', '29.2', 'MUST', 'role', SERVER, 'A request needing an undeclared client capability is rejected with -32003 whose data.requiredCapabilities carries the ClientCapabilities.'),
  // ... every §29.1–§29.9 atom, in spec order
];
```

```ts
// ts-sdk/src/protocol/conformance-requirements.ts
export function isFeatureFullyConformant(
  advertised: boolean,
  fullyImplemented: boolean,
): { ok: true } | { ok: false; reason: 'advertised-not-implemented' } {
  if (advertised && !fullyImplemented) {
    return { ok: false, reason: 'advertised-not-implemented' }; // §29.9: no partial conformance
  }
  return { ok: true };
}
```

## On the wire

1. `initialize` / `server/discover` → the negotiated revision and the advertised `serverCapabilities`
   — the only inputs that fix the profile.
2. A request for an unadvertised capability → `-32601 Method not found`.
3. An unsupported declared revision → `-32004`; a malformed `_meta` envelope → `-32602`; a missing
   required client capability → `-32003`.

Conformance is bidirectional: advertising a capability binds you to all its MUST-level behavior, and
you MUST NOT exercise anything unadvertised — there is no partial conformance. Robustness
(§29.6) requires tolerating inputs richer than understood: unknown fields/capabilities/extensions are
ignored, not rejected. See [Capabilities](./capabilities.md) for negotiation, [Errors](./errors.md)
for the exact codes, and [Registries](./registries.md) for the App. B/C/D tables a profile must use.
