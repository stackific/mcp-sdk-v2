# Feature Lifecycle

**Part VIII · Governance** · Book Ch 27 · Stories S43 · sidebar `/lifecycle`

Every governed feature is **Active**, **Deprecated**, or **Removed**. A Deprecated feature stays
fully functional and behaves exactly as specified — a peer MUST keep interoperating with it and
MUST NOT fault the exchange. This pattern exercises a registered deprecated capability (Roots) and
shows where lifecycle/deprecation surfaces in each layer. Deprecation warnings stay **out of band**:
they never ride the wire and never alter a response.

## Round-trip

```
demo (LifecyclePage)  ──POST /api/tools/call {show_roots}──▶  client host (FastAPI)
      ▲                                                            │ api.call_tool('show_roots')
      │                                                            ▼
  ApiResultView                                          stackific.mcp  Client
      │                                                            │ tools/call → roots/list (deprecated)
      └──── identical result (no deprecation on the wire) ◀────────┴──▶ MCP server
                                                                         emit_deprecation_warning → stderr
```

## 1 · Frontend — `demo/src/routes/lifecycle.tsx`

The frontend is the shared SPA (TypeScript); selecting **Python** only repoints `backend.*`
at the Python client host, so this layer is identical to the TypeScript pattern.

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

## 2 · MCP client host — `py-mcp-client/mcp_client.py`

The host advertises the deprecated capabilities it still supports in its per-request `_meta`
envelope. `sampling` and `roots` are present here precisely because they remain **functional** while
Deprecated — the client opts into them so the server may solicit them:

```python
# py-mcp-client/mcp_client.py
# The capabilities this client declares in every request's _meta. (Single source of truth.)
CLIENT_CAPABILITIES = {"elicitation": {"form": {}, "url": {}}, "sampling": {}, "roots": {}, "tasks": {}}
```

When the `show_roots` tool runs, the server asks the client for `roots/list`; the host's handler
answers it like any other input request — no special-casing for the deprecated status:

```python
# py-mcp-client/mcp_client.py
def _handle_roots(_params: dict) -> dict:
  # ... emit a debug-bus note for the SPA's wire view
  return {"roots": _state["roots"]}
# ...
client.set_request_handler("roots/list", _handle_roots)
```

## 3 · MCP server — `py-sdk/src/stackific/mcp/lifecycle/registry.py` + `py-sdk/src/stackific/mcp/lifecycle/policy.py`

The lifecycle discipline lives in the SDK the server is built on. A **consolidated registry** of
deprecated features carries each one's migration note and earliest-removal date:

```python
# py-sdk/src/stackific/mcp/lifecycle/registry.py
DEPRECATED_REGISTRY: tuple[DeprecatedRegistryEntry, ...] = (
  DeprecatedRegistryEntry(
    feature="Roots capability",
    defined_in="§21",
    migration_note="No direct replacement; roots integration is now host-managed.",
    earliest_removal="2026-07-28",
  ),
  # ... Sampling, includeContext values, Logging, logLevel, Dynamic Client Registration
)
```

The state machine forbids a direct **Active → Removed** jump — a feature MUST pass through
Deprecated — and the policy module fixes the minimum windows:

```python
# py-sdk/src/stackific/mcp/lifecycle/policy.py
def can_transition(from_state: str, to_state: str) -> bool:
  if from_state == to_state:
    return False
  if from_state == LifecycleState.Active and to_state == LifecycleState.Removed:
    return False
  if from_state == LifecycleState.Removed:
    return False
  return True
```

When a deprecated input-request kind (Sampling or Roots) is about to be solicited, the SDK exposes
an **advisory, out-of-band** warning helper — written to `stderr`, never to the wire:

```python
# py-sdk/src/stackific/mcp/lifecycle/registry.py
def emit_deprecation_warning(feature: str, migration: str) -> None:
  # stderr is the environment-idiomatic out-of-band channel in Python (the analogue of
  # TS console.warn); it MUST NOT ride the protocol wire. (R-27.4-d/-e, §27.4)
  print(f'[MCP] Deprecated feature used: "{feature}". Migration: {migration}', file=sys.stderr)
```

The two deprecated input kinds are named in the SDK so a runtime can detect them before soliciting:

```python
# py-sdk/src/stackific/mcp/protocol/multi_round_trip.py
DEPRECATED_INPUT_REQUEST_METHODS = frozenset({"roots/list", "sampling/createMessage"})

def is_deprecated_input_request_kind(method: str) -> bool:
  return method in DEPRECATED_INPUT_REQUEST_METHODS
```

Unlike the TS runtime, the Python server does **not** auto-emit the warning from its solicit path
(`Server._call_tool` calls `collect.solicit("roots/list", {})` directly) — `emit_deprecation_warning`
and `is_deprecated_input_request_kind` are the SDK building blocks an embedder wires in. The
deprecated status changes nothing about the result either way.

## On the wire

1. `tools/call` `{ name: 'show_roots' }` → the server solicits `roots/list` via an
   `input_required` result; the client retries with its roots.
2. The final result is byte-for-byte what a non-deprecated call returns — **no** deprecation field,
   header, or warning crosses the boundary. The only deprecation signal is the SDK's `stderr`
   warning, which an embedder sees but a peer never does.

A Deprecated feature is **optional to implement**, but one that *is* implemented must follow its
spec in full — see [Conformance](./conformance.md) (`R-29.5-e`/`R-29.5-f`). The Roots and Sampling
capabilities exercised here are the same ones [Roots](./roots.md) and [Sampling](./sampling.md)
demonstrate; their deprecated status changes nothing about how those round-trips behave.
