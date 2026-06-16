"""Capability Negotiation: client & server capabilities (§6.1–§6.4).

The capability layer: the declaration shapes and the per-request, stateless negotiation
rules that gate every optional feature. Because MCP is stateless, a feature is usable
only when BOTH peers declare the governing capability/sub-flag.

Provides presence-means-supported predicates (with the ``elicitation.form`` implicit
baseline and the boolean ``listChanged``/``subscribe`` sub-flags), the method/
notification gating maps, the ``-32003`` missing-capability gate + HTTP status mapping,
the sub-flag usage rules, and the graceful-degradation decision.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import StrictBool

from mcp._model import McpModel, validates
from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.meta import build_missing_capability_error, validate_request_meta

__all__ = [
  "MISSING_CLIENT_CAPABILITY_CODE",
  "INVALID_PARAMS_CODE",
  "build_missing_capability_error",
  "validate_request_meta",
  "DEPRECATED_CLIENT_CAPABILITIES",
  "DEPRECATED_SERVER_CAPABILITIES",
  "is_deprecated_client_capability",
  "is_deprecated_server_capability",
  "ClientCapabilities",
  "ServerCapabilities",
  "is_valid_client_capabilities",
  "is_valid_server_capabilities",
  "client_declares",
  "server_declares",
  "SERVER_METHOD_CAPABILITY",
  "server_method_required_capability",
  "may_client_invoke",
  "NOTIFICATION_REQUIRED_CAPABILITY",
  "notification_required_capability",
  "client_should_expect_notification",
  "compute_missing_client_capabilities",
  "CapabilityGateResult",
  "gate_required_client_capabilities",
  "CAPABILITY_ERROR_HTTP_STATUS",
  "http_status_for_capability_error",
  "may_use_url_elicitation",
  "may_use_sampling_tools",
  "may_invoke_roots_list",
  "may_invoke_sampling",
  "may_use_include_context",
  "decide_degradation",
]


def _is_object(value: object) -> bool:
  """Return ``True`` for a non-``None`` mapping (the Python analogue of TS ``isObject``).

  JSON objects map to ``dict``; arrays map to ``list`` and are intentionally excluded so a
  list never masquerades as a capability object. Mirrors the Zod ``z.record``/``z.object``
  ``typeof === 'object' && !Array.isArray`` discipline of the TS schemas.
  """
  return isinstance(value, dict)


def _nested(obj: dict, key: str) -> dict | None:
  v = obj.get(key)
  return v if isinstance(v, dict) else None


# ─── Declaration schemas (§6.1, §6.2, §6.3) ───────────────────────────────────
#
# The Python analogues of the TS ``ClientCapabilitiesSchema`` / ``ServerCapabilitiesSchema``
# (Zod ``.passthrough()`` objects). ``extra="allow"`` (from :class:`McpModel`) tolerates
# unknown top-level keys (forward-compatible §2.6); each declared field validates its shape.
# The ``experimental`` / ``extensions`` maps are records whose values MUST be objects (§6.2,
# §6.3: "map of string → object"); the boolean sub-flags use ``StrictBool`` so ``1`` /
# ``"true"`` are rejected, matching Zod's strict ``z.boolean()``.


class _ElicitationCapability(McpModel):
  """Client ``elicitation`` capability with optional object ``form`` / ``url`` sub-flags."""

  form: dict[str, Any] | None = None
  url: dict[str, Any] | None = None


class _SamplingCapability(McpModel):
  """Client ``sampling`` capability (Deprecated) with optional ``context`` / ``tools`` sub-flags."""

  context: dict[str, Any] | None = None
  tools: dict[str, Any] | None = None


class ClientCapabilities(McpModel):
  """The optional client behaviors, supplied on every request (§6.2). An empty ``{}`` is
  valid; all fields are OPTIONAL; ``roots`` / ``sampling`` are Deprecated.
  """

  experimental: dict[str, dict[str, Any]] | None = None
  elicitation: _ElicitationCapability | None = None
  roots: dict[str, Any] | None = None
  sampling: _SamplingCapability | None = None
  extensions: dict[str, dict[str, Any]] | None = None


class _PromptsCapability(McpModel):
  """Server ``prompts`` capability; optional boolean ``listChanged`` sub-flag."""

  list_changed: StrictBool | None = None


class _ResourcesCapability(McpModel):
  """Server ``resources`` capability; optional boolean ``subscribe`` / ``listChanged`` sub-flags."""

  subscribe: StrictBool | None = None
  list_changed: StrictBool | None = None


class _ToolsCapability(McpModel):
  """Server ``tools`` capability; optional boolean ``listChanged`` sub-flag."""

  list_changed: StrictBool | None = None


class ServerCapabilities(McpModel):
  """The optional server behaviors, learned from ``server/discover`` (§6.3). An empty ``{}``
  is valid; all fields are OPTIONAL; ``logging`` is Deprecated.
  """

  experimental: dict[str, dict[str, Any]] | None = None
  completions: dict[str, Any] | None = None
  prompts: _PromptsCapability | None = None
  resources: _ResourcesCapability | None = None
  tools: _ToolsCapability | None = None
  logging: dict[str, Any] | None = None
  extensions: dict[str, dict[str, Any]] | None = None


def is_valid_client_capabilities(value: object) -> bool:
  """Return ``True`` for a structurally valid ``ClientCapabilities`` object (§6.2, R-6.2-s).

  An empty ``{}`` is valid (declares no optional behaviors), all fields are OPTIONAL, and
  unknown top-level keys are tolerated (forward-compatible §2.6). When present, each known
  field MUST have the right shape (see :class:`ClientCapabilities`).
  """
  return validates(ClientCapabilities, value)


def is_valid_server_capabilities(value: object) -> bool:
  """Return ``True`` for a structurally valid ``ServerCapabilities`` object (§6.3, R-6.3-s).

  An empty ``{}`` is valid, all fields are OPTIONAL, and unknown top-level keys are
  tolerated. When present, each known field MUST have the right shape (see
  :class:`ServerCapabilities`).
  """
  return validates(ServerCapabilities, value)


# ─── Deprecated capabilities (§6.1, §6.2) ─────────────────────────────────────

DEPRECATED_CLIENT_CAPABILITIES = frozenset({"roots", "sampling"})
DEPRECATED_SERVER_CAPABILITIES = frozenset({"logging"})


def is_deprecated_client_capability(name: str) -> bool:
  return name in DEPRECATED_CLIENT_CAPABILITIES


def is_deprecated_server_capability(name: str) -> bool:
  return name in DEPRECATED_SERVER_CAPABILITIES


# ─── Capability predicates (§6.1, §6.4) ───────────────────────────────────────

def client_declares(caps: dict, capability: str) -> bool:
  """Return ``True`` when the client's capabilities declare ``capability`` (§6.1).

  Presence of an object means supported. ``elicitation.form`` is the implicit baseline
  (supported whenever ``elicitation`` is present); ``elicitation.url`` /
  ``sampling.context`` / ``sampling.tools`` require their own sub-flag object.
  (R-6.2-e/-f/-g/-n/-p)
  """
  if capability in ("experimental", "elicitation", "roots", "sampling", "extensions"):
    return _is_object(caps.get(capability))
  if capability == "elicitation.form":
    return _is_object(caps.get("elicitation"))  # implicit baseline
  if capability == "elicitation.url":
    e = _nested(caps, "elicitation")
    return e is not None and _is_object(e.get("url"))
  if capability == "sampling.context":
    s = _nested(caps, "sampling")
    return s is not None and _is_object(s.get("context"))
  if capability == "sampling.tools":
    s = _nested(caps, "sampling")
    return s is not None and _is_object(s.get("tools"))
  return False


def server_declares(caps: dict, capability: str) -> bool:
  """Return ``True`` when the server's capabilities declare ``capability`` (§6.2).

  Object capabilities are declared by presence; boolean sub-flags
  (``listChanged``/``subscribe``) only when explicitly ``True``. (R-6.3-h/-l/-o)
  """
  if capability in ("experimental", "completions", "prompts", "resources", "tools", "logging", "extensions"):
    return _is_object(caps.get(capability))
  if capability == "prompts.listChanged":
    p = _nested(caps, "prompts")
    return p is not None and p.get("listChanged") is True
  if capability == "resources.subscribe":
    r = _nested(caps, "resources")
    return r is not None and r.get("subscribe") is True
  if capability == "resources.listChanged":
    r = _nested(caps, "resources")
    return r is not None and r.get("listChanged") is True
  if capability == "tools.listChanged":
    t = _nested(caps, "tools")
    return t is not None and t.get("listChanged") is True
  return False


# ─── Method & notification gating (§6.3, §6.4) ────────────────────────────────

SERVER_METHOD_CAPABILITY = {
  "completion/complete": "completions",
  "prompts/list": "prompts",
  "prompts/get": "prompts",
  "resources/list": "resources",
  "resources/read": "resources",
  "tools/list": "tools",
  "tools/call": "tools",
}


def server_method_required_capability(method: str) -> str | None:
  """The capability that gates ``method``, or ``None`` for an ungated (core) method."""
  return SERVER_METHOD_CAPABILITY.get(method)


def may_client_invoke(method: str, server_caps: dict) -> bool:
  """Return ``True`` when a client MAY invoke ``method`` given the server's capabilities.

  Core (ungated) methods are always invocable; a gated method needs the governing
  capability declared. (R-6.3-e, R-6.4-f/-g)
  """
  required = server_method_required_capability(method)
  return required is None or server_declares(server_caps, required)


NOTIFICATION_REQUIRED_CAPABILITY = {
  "notifications/prompts/list_changed": "prompts.listChanged",
  "notifications/resources/list_changed": "resources.listChanged",
  "notifications/resources/updated": "resources.subscribe",
  "notifications/tools/list_changed": "tools.listChanged",
  "notifications/message": "logging",
}


def notification_required_capability(notification: str) -> str | None:
  """The capability/sub-flag that gates ``notification``, or ``None`` if ungated."""
  return NOTIFICATION_REQUIRED_CAPABILITY.get(notification)


def client_should_expect_notification(notification: str, server_caps: dict) -> bool:
  """Return ``True`` when a client should expect ``notification`` given the server's
  capabilities. (R-6.3-h/-l/-o)
  """
  required = notification_required_capability(notification)
  return required is None or server_declares(server_caps, required)


# ─── Missing-required-client-capability gate (§6.4) ───────────────────────────

def compute_missing_client_capabilities(declared: dict, required: dict) -> dict:
  """Return the subset of ``required`` not present (by top-level key) in ``declared``.
  Capabilities are never inferred from a prior request. (R-6.4-c/-d/-h)
  """
  return {k: v for k, v in required.items() if k not in declared}


@dataclass(frozen=True)
class CapabilityGateResult:
  """Outcome of :func:`gate_required_client_capabilities`."""

  ok: bool
  error: dict | None = None


def gate_required_client_capabilities(declared: dict, required: dict) -> CapabilityGateResult:
  """Gate a request against the capabilities it requires (§6.4, R-6.4-h).

  Returns ``ok=True`` when all required capabilities are declared, else ``ok=False`` with
  the ``-32003`` error whose ``data.requiredCapabilities`` lists the missing ones.
  """
  missing = compute_missing_client_capabilities(declared, required)
  if not missing:
    return CapabilityGateResult(True)
  return CapabilityGateResult(False, error=build_missing_capability_error(missing))


# ─── HTTP status mapping (§6.4) ───────────────────────────────────────────────

CAPABILITY_ERROR_HTTP_STATUS = 400


def http_status_for_capability_error(code: int) -> int | None:
  """Return ``400`` for the capability-negotiation error codes (``-32003`` / ``-32602``),
  else ``None``. (R-6.4-i/-k)
  """
  if code in (MISSING_CLIENT_CAPABILITY_CODE, INVALID_PARAMS_CODE):
    return CAPABILITY_ERROR_HTTP_STATUS
  return None


# ─── Sub-flag usage rules (§6.2) ──────────────────────────────────────────────

def may_use_url_elicitation(client_caps: dict) -> bool:
  """A server MUST NOT use URL-mode elicitation unless ``elicitation.url`` is present. (R-6.2-g)"""
  return client_declares(client_caps, "elicitation.url")


def may_use_sampling_tools(client_caps: dict) -> bool:
  """A server MUST NOT supply sampling tools unless ``sampling.tools`` is present. (R-6.2-q)"""
  return client_declares(client_caps, "sampling.tools")


def may_invoke_roots_list(client_caps: dict) -> bool:
  """A server MUST NOT invoke ``roots/list`` unless ``roots`` is present. (R-6.2-i)"""
  return client_declares(client_caps, "roots")


def may_invoke_sampling(client_caps: dict) -> bool:
  """A server MUST NOT invoke ``sampling/createMessage`` unless ``sampling`` is present. (R-6.2-l)"""
  return client_declares(client_caps, "sampling")


def may_use_include_context(client_caps: dict, value: str | None) -> bool:
  """Whether a server MAY use a given ``includeContext`` value during sampling (R-6.2-o).

  ``None``/``"none"`` is always allowed; any other value needs ``sampling.context``.
  """
  if value is None or value == "none":
    return True
  return client_declares(client_caps, "sampling.context")


# ─── Graceful degradation (§6.4) ──────────────────────────────────────────────

def decide_degradation(*, peer_declares_behavior: bool, behavior_mandatory: bool) -> str:
  """Decide how to handle an operation when the peer may lack the optional behavior.

  ``proceed`` when the peer declares it; otherwise ``reject`` if mandatory else
  ``fallback``. A peer MUST NOT reject merely because the other declared fewer
  capabilities. (R-6.4-l/-m)
  """
  if peer_declares_behavior:
    return "proceed"
  return "reject" if behavior_mandatory else "fallback"
