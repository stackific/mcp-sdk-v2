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
demo (ConformancePage)  ──GET /api/status──▶  client host (FastAPI)
      ▲                                            │ get_status(): negotiatedVersion, serverCapabilities
      │                                            ▼
  negotiatedVersion + caps                stackific.mcp  Client (baseline _meta envelope)
      │                                            │ initialize / server/discover
      └──── conformance profile ◀──── advertise ⇔ implement ─┴──▶ MCP server (_require_capability gate)
```

## 1 · Frontend — `demo/src/routes/conformance.tsx`

The frontend is the shared SPA (TypeScript); selecting **Python** only repoints `backend.*`
at the Python client host, so this layer is identical to the TypeScript pattern.

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

## 2 · MCP client host — `py-mcp-client/mcp_client.py`

Baseline **client** conformance (§29.3) is that every request carries the protocol revision, client
identity, and client capabilities in its `_meta` envelope. The SDK `Client` stamps that envelope on
every request; the host reports the negotiated outcome:

```python
# py-mcp-client/mcp_client.py
def get_status() -> dict:
  client = _state["client"]
  if client is None:
    return {"connected": False, "negotiatedVersion": None, "serverCapabilities": None,
            "clientCapabilities": CLIENT_CAPABILITIES, "roots": _state["roots"], "serverUrl": MCP_SERVER_URL}
  status = client.status()
  return {**status, "clientCapabilities": CLIENT_CAPABILITIES, "roots": _state["roots"], "serverUrl": MCP_SERVER_URL}
```

The negotiated revision and server capabilities come from the `server/discover` round-trip the host
drives on connect, recorded on the SDK `Client`:

```python
# py-sdk/src/stackific/mcp/client/client.py
def discover(self) -> dict:
  # ...
  self.server_info = result.get("serverInfo")
  self.server_capabilities = result.get("capabilities")
  self.negotiated_version = negotiation.selected if negotiation.ok else None
```

## 3 · MCP server — `py-sdk/src/stackific/mcp/server/server.py` + `py-sdk/src/stackific/mcp/protocol/conformance_requirements.py`

The runtime enforces the **advertise ⇔ implement** rule directly: every feature is gated behind its
advertised capability, and a method whose capability was not advertised is rejected — a server MUST
NOT expose behavior it has not advertised (`R-29.2-d`/`R-29.9-b`):

```python
# py-sdk/src/stackific/mcp/server/server.py
def _require_capability(self, capability: str, method: str) -> None:
  if self.capabilities.get(capability) is None:
    raise ServerError(
      METHOD_NOT_FOUND_CODE,
      f'Method not found: {method} (the "{capability}" capability is not advertised)',
    )
```

```python
# py-sdk/src/stackific/mcp/server/server.py
if method == "tools/list":
  self._require_capability("tools", method)
  return self._list_tools(params)
```

The whole contract is modeled as a machine-checkable **requirement registry** plus the
"no partial conformance" rule that runs on a single self-contained classification:

```python
# py-sdk/src/stackific/mcp/protocol/conformance_requirements.py
CONFORMANCE_REQUIREMENTS: Final[tuple[ConformanceRequirement, ...]] = (
  _req("R-29.2-a", "29.2", "MUST", "role", _SERVER, "A server implements server/discover; its obligation to answer is unconditional."),
  _req("R-29.2-d", "29.2", "MUST NOT", "role", _SERVER, "A server must not advertise a revision or capability whose required behavior it does not implement."),
  # ... every §29.1–§29.9 atom, in spec order
)
```

```python
# py-sdk/src/stackific/mcp/protocol/conformance_requirements.py
def is_feature_fully_conformant(advertised: bool, fully_implemented: bool) -> FeatureConformance:
  if advertised and not fully_implemented:
    return FeatureConformance(ok=False, reason="advertised-not-implemented")  # §29.9: no partial conformance
  return FeatureConformance(ok=True)
```

A companion `classify_server_request` runs the ordered §29.2 checks (revision → envelope →
capability → gating) over one request, so the same registry that documents the contract also drives
the runtime disposition.

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
