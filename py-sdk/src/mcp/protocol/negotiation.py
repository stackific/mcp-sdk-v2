"""Revision selection & negotiation errors (§5.4–§5.7).

Turns discovery's raw materials (advertised revisions + capabilities) into a chosen
protocol revision and defines the recovery paths:

* the client revision-selection rule (§5.4): highest mutually supported revision, never
  fabricated; an empty intersection surfaces an actionable incompatibility.
* the two negotiation errors (§5.5/§5.6): ``UnsupportedProtocolVersion`` (-32004) and
  ``MissingRequiredClientCapability`` (-32003), both HTTP 400, plus client retries.
* the §5.7 backward-compatibility probe + a per-endpoint support-determination cache.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from mcp.protocol.discovery import (
  SERVER_DISCOVER_METHOD,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  build_unsupported_protocol_version_error,
  is_discover_result,
  select_revision,
)
from mcp.protocol.errors import MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.meta import build_missing_capability_error

__all__ = [
  "SERVER_DISCOVER_METHOD",
  "UNSUPPORTED_PROTOCOL_VERSION_CODE",
  "MISSING_CLIENT_CAPABILITY_CODE",
  "build_unsupported_protocol_version_error",
  "build_missing_capability_error",
  "NEGOTIATION_ERROR_HTTP_STATUS",
  "http_status_for_negotiation_error",
  "SERVER_DISCOVER_IS_OPTIONAL",
  "RevisionNegotiationResult",
  "negotiate_revision",
  "IncompatibleProtocolError",
  "reselect_after_unsupported_version",
  "can_satisfy_required_capabilities",
  "augment_client_capabilities",
  "ProbeOutcome",
  "interpret_probe_response",
  "name_supported_revisions_in_error",
  "ProtocolSupportDetermination",
  "ProtocolSupportCache",
  "determination_from_probe",
]

#: Both negotiation errors ride HTTP 400 Bad Request. (R-5.5-b, R-5.6-d)
NEGOTIATION_ERROR_HTTP_STATUS = 400

#: server/discover is OPTIONAL before a first substantive request. (R-5.4-a)
SERVER_DISCOVER_IS_OPTIONAL = True


def http_status_for_negotiation_error(code: int) -> int | None:
  """Return ``400`` for the two negotiation error codes (-32004, -32003), else ``None``."""
  if code in (UNSUPPORTED_PROTOCOL_VERSION_CODE, MISSING_CLIENT_CAPABILITY_CODE):
    return NEGOTIATION_ERROR_HTTP_STATUS
  return None


@dataclass(frozen=True)
class RevisionNegotiationResult:
  """Outcome of the revision-selection rule.

  ``ok`` with ``selected`` on success; otherwise ``reason="no-mutual-revision"`` with
  both sides' revision lists.
  """

  ok: bool
  selected: str | None = None
  reason: str | None = None
  client_preference: list[str] = field(default_factory=list)
  server_supported: list[str] = field(default_factory=list)


def negotiate_revision(client_preference: list[str], server_supported: list[str]) -> RevisionNegotiationResult:
  """Select the highest mutually supported revision — the first in the client's order
  that the server also supports (exact match). Empty intersection → failure; the client
  MUST NOT fabricate a revision. (§5.4, R-5.4-b/-c/-d)
  """
  selected = select_revision(server_supported, client_preference)
  if selected is None:
    return RevisionNegotiationResult(
      False,
      reason="no-mutual-revision",
      client_preference=list(client_preference),
      server_supported=list(server_supported),
    )
  return RevisionNegotiationResult(True, selected=selected)


class IncompatibleProtocolError(Exception):
  """An actionable error a client surfaces when no protocol revision is mutually
  supported (never goes on the wire). (R-5.4-d, R-5.5-j)
  """

  code = "INCOMPATIBLE_PROTOCOL"

  def __init__(self, client_preference: list[str], server_supported: list[str]) -> None:
    super().__init__(
      f"No mutually supported protocol revision: client prefers [{', '.join(client_preference)}], "
      f"server supports [{', '.join(server_supported)}]"
    )
    self.client_preference = list(client_preference)
    self.server_supported = list(server_supported)


def reselect_after_unsupported_version(error: dict, client_preference: list[str]) -> RevisionNegotiationResult:
  """React to a ``-32004`` error by re-selecting from its authoritative ``data.supported``
  set. An empty result is terminal — the client MUST NOT retry indefinitely.
  (R-5.5-h/-i/-j)
  """
  supported = (error.get("data") or {}).get("supported") or []
  return negotiate_revision(client_preference, supported)


def can_satisfy_required_capabilities(required_capabilities: dict, client_supported: dict) -> bool:
  """Return ``True`` when the client can declare every required capability key. (R-5.6-i)"""
  return all(key in client_supported for key in required_capabilities)


def augment_client_capabilities(declared: dict, required_capabilities: dict) -> dict:
  """Produce the ``clientCapabilities`` for a retry after ``-32003``: the declared
  capabilities merged with the required ones (shallow, non-mutating). (R-5.6-i)
  """
  return {**declared, **required_capabilities}


@dataclass(frozen=True)
class ProbeOutcome:
  """Outcome of interpreting a ``server/discover`` probe response (§5.7).

  ``kind`` is ``"supported"``, ``"unsupported-version"``, or ``"not-this-protocol"``.
  """

  kind: str
  supported_versions: list[str] | None = None
  result: dict | None = None
  supported: list[str] | None = None
  requested: str | None = None
  reason: str | None = None


def interpret_probe_response(response: object) -> ProbeOutcome:
  """Interpret a probe ``server/discover`` response (§5.7).

  A valid ``DiscoverResult`` → ``supported``; a recognized ``-32004`` carrying
  ``data.supported``/``data.requested`` → ``unsupported-version``; anything else
  (different error, malformed, or ``None`` for a timeout) → ``not-this-protocol``.
  (R-5.7-c)
  """
  if not isinstance(response, dict):
    return ProbeOutcome("not-this-protocol", reason="no response (timeout) or non-object response")

  if "result" in response and "error" not in response:
    result = response["result"]
    if is_discover_result(result):
      return ProbeOutcome("supported", supported_versions=list(result["supportedVersions"]), result=result)
    return ProbeOutcome("not-this-protocol", reason="result is not a valid DiscoverResult")

  if "error" in response and isinstance(response["error"], dict):
    error = response["error"]
    data = error.get("data")
    if (
      error.get("code") == UNSUPPORTED_PROTOCOL_VERSION_CODE
      and isinstance(data, dict)
      and isinstance(data.get("supported"), list)
      and isinstance(data.get("requested"), str)
    ):
      return ProbeOutcome("unsupported-version", supported=list(data["supported"]), requested=data["requested"])
    return ProbeOutcome("not-this-protocol", reason=f"unrecognized error code {error.get('code')}")

  return ProbeOutcome("not-this-protocol", reason="response is neither a result nor an error")


def name_supported_revisions_in_error(base_error: dict, supported: list[str]) -> dict:
  """Annotate an error's ``data.supported`` with the server's revisions so a peer with no
  fall-forward mechanism still gets a useful diagnostic (non-mutating). (R-5.7-g)
  """
  existing = base_error.get("data") if isinstance(base_error.get("data"), dict) else {}
  return {**base_error, "data": {**existing, "supported": list(supported)}}


@dataclass(frozen=True)
class ProtocolSupportDetermination:
  """A per-endpoint conclusion about whether a server speaks this protocol family."""

  speaks_protocol: bool
  supported_versions: list[str] | None = None


class ProtocolSupportCache:
  """Caches the protocol-support determination per server endpoint (R-5.7-e/-f).

  The determination is a property of the endpoint, not a request; persist via
  :meth:`entries` / :meth:`from_entries` and re-probe via :meth:`invalidate`.
  """

  def __init__(self) -> None:
    self._determinations: dict[str, ProtocolSupportDetermination] = {}

  def set(self, endpoint: str, determination: ProtocolSupportDetermination) -> None:
    self._determinations[endpoint] = determination

  def get(self, endpoint: str) -> ProtocolSupportDetermination | None:
    return self._determinations.get(endpoint)

  def has(self, endpoint: str) -> bool:
    return endpoint in self._determinations

  def invalidate(self, endpoint: str) -> None:
    self._determinations.pop(endpoint, None)

  def entries(self) -> list[tuple[str, ProtocolSupportDetermination]]:
    return list(self._determinations.items())

  @staticmethod
  def from_entries(entries) -> "ProtocolSupportCache":
    cache = ProtocolSupportCache()
    for endpoint, determination in entries:
      cache.set(endpoint, determination)
    return cache


def determination_from_probe(outcome: ProbeOutcome) -> ProtocolSupportDetermination:
  """Derive a cacheable :class:`ProtocolSupportDetermination` from a probe outcome.
  ``supported`` and ``unsupported-version`` both mean the server speaks the family. (R-5.7-c)
  """
  if outcome.kind == "supported":
    return ProtocolSupportDetermination(True, supported_versions=outcome.supported_versions)
  if outcome.kind == "unsupported-version":
    return ProtocolSupportDetermination(True, supported_versions=outcome.supported)
  return ProtocolSupportDetermination(False)
