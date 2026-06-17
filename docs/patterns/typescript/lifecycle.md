# Feature Lifecycle

**Part VIII · Governance** · Book Ch 27 · Stories S43 · sidebar `/lifecycle`

Every governed feature is **Active**, **Deprecated**, or **Removed**. A Deprecated feature stays
fully functional and behaves exactly as specified — a peer MUST keep interoperating with it and
MUST NOT fault the exchange. This pattern exercises a registered deprecated capability (Roots) and
shows where lifecycle/deprecation surfaces in each layer. Deprecation warnings stay **out of band**:
they never ride the wire and never alter a response.

## Round-trip

```
demo (LifecyclePage)  ──POST /api/tools/call {show_roots}──▶  client host (Hono)
      ▲                                                            │ api.callTool('show_roots')
      │                                                            ▼
  ApiResultView                                          @stackific/mcp-sdk  Client
      │                                                            │ tools/call → roots/list (deprecated)
      └──── identical result (no deprecation on the wire) ◀────────┴──▶ MCP server
                                                                         emitDeprecationWarning → stderr
```

## 1 · Frontend — `demo/src/routes/lifecycle.tsx`

The page calls a tool that, in turn, reads **Roots** — a deprecated client capability that must
remain functional. The button click is an ordinary `tools/call`; the UI's own lifecycle table is
static text. The point the page makes is observable: a deprecated feature returns exactly what a
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

## 2 · MCP client host — `ts-mcp-client/src/mcp-client.ts`

The host advertises the deprecated capabilities it still supports in its per-request `_meta`
envelope. `sampling` and `roots` are present here precisely because they remain **functional** while
Deprecated — the client opts into them so the server may solicit them:

```ts
// ts-mcp-client/src/mcp-client.ts
const CLIENT_CAPABILITIES = {
  elicitation: { form: {}, url: {} },
  sampling: {},
  roots: {},
  tasks: {},
} as const;
```

When the `show_roots` tool runs, the server asks the client for `roots/list`; the host's handler
answers it like any other input request — no special-casing for the deprecated status:

```ts
// ts-mcp-client/src/mcp-client.ts
// Roots: the server asks for the client's workspace roots.
c.setRequestHandler('roots/list', async () => {
  // ...
  return { roots };
});
```

## 3 · MCP server — `ts-sdk/src/lifecycle/registry.ts` + `ts-sdk/src/lifecycle/policy.ts`

The lifecycle discipline lives in the SDK the server is built on. A **consolidated registry** of
deprecated features carries each one's migration note and earliest-removal date:

```ts
// ts-sdk/src/lifecycle/registry.ts
export const DEPRECATED_REGISTRY: ReadonlyArray<DeprecatedRegistryEntry> = [
  {
    feature: 'Roots capability',
    definedIn: '§21',
    migrationNote: 'No direct replacement; roots integration is now host-managed.',
    deprecatedSince: '2026-07-28',
    // §27.2: earliest removal is ≥ deprecatedSince + 12 months.
    earliestRemoval: '2027-07-28',
  },
  // ... Sampling, includeContext values, Logging, logLevel, Dynamic Client Registration
];
```

The state machine forbids a direct **Active → Removed** jump — a feature MUST pass through
Deprecated — and the policy module fixes the minimum windows:

```ts
// ts-sdk/src/lifecycle/policy.ts
export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  if (from === to) return false;
  if (from === LifecycleState.Active && to === LifecycleState.Removed) return false;
  if (from === LifecycleState.Removed) return false;
  return true;
}
```

When the server's runtime is about to solicit a deprecated input-request kind (Sampling or Roots),
it emits an **advisory, out-of-band** warning — never on the wire — then proceeds normally:

```ts
// ts-sdk/src/server/server.ts
// RC-7 (§27.4): soliciting a Deprecated capability (sampling/roots) emits an
// advisory, OUT-OF-BAND deprecation warning — never on the wire ...
if (isDeprecatedInputRequestKind(method)) {
  const entry = findDeprecatedEntry(DEPRECATED_INPUT_KIND_FEATURE[method] ?? '');
  if (entry) emitDeprecationWarning(entry.feature, entry.migrationNote);
}
```

```ts
// ts-sdk/src/lifecycle/registry.ts
export function emitDeprecationWarning(feature: string, migration: string): void {
  // console.warn routes to stderr ... the standard out-of-band warning channel
  console.warn(`[MCP] Deprecated feature used: "${feature}". Migration: ${migration}`);
}
```

## On the wire

1. `tools/call` `{ name: 'show_roots' }` → the server solicits `roots/list` via an
   `input_required` result; the client retries with its roots.
2. The final result is byte-for-byte what a non-deprecated call returns — **no** deprecation field,
   header, or warning crosses the boundary. The only deprecation signal is the server's `stderr`
   `console.warn`, which an embedder sees but a peer never does.

A Deprecated feature is **optional to implement**, but one that *is* implemented must follow its
spec in full — see [Conformance](./conformance.md) (`R-29.5-e`/`R-29.5-f`). The Roots and Sampling
capabilities exercised here are the same ones [Roots](./roots.md) and [Sampling](./sampling.md)
demonstrate; their deprecated status changes nothing about how those round-trips behave.
