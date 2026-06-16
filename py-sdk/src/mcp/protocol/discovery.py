"""Discovery via ``server/discover`` (§5.3).

Discovery is the one well-known entry point a client uses to learn what a server is and
can do before issuing feature requests: a single round trip in which the client sends
``server/discover`` and the server returns a ``DiscoverResult`` advertising its supported
protocol revisions, capabilities, and identity — or, when it does not support the
requested revision, an ``UnsupportedProtocolVersion`` (-32004) error whose
``data.supported`` still tells the client which revisions the server accepts.

This module provides the request/result validators, the reference handler every server
MUST implement (R-5.3-a), request/response builders, and order-independent client-side
revision selection (R-5.3.2-d). Wire shapes are represented as plain dicts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import Field

from mcp._model import McpModel, validates
from mcp.jsonrpc.framing import RequestId
from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE
from mcp.protocol.errors import INVALID_PARAMS_CODE, UNSUPPORTED_PROTOCOL_VERSION_CODE
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
  is_supported_protocol_version,
  validate_request_meta,
)
from mcp.types.implementation import Implementation

#: The discovery method name. (Owned by the progress module in the TS SDK; pinned here
#: as the literal to avoid a forward dependency.)
SERVER_DISCOVER_METHOD = "server/discover"

__all__ = [
  "SERVER_DISCOVER_METHOD",
  "UNSUPPORTED_PROTOCOL_VERSION_CODE",
  "DiscoverConfig",
  "DiscoverResult",
  "DiscoverRequestValidation",
  "ProcessDiscoverOutcome",
  "is_version_supported",
  "is_discover_result",
  "build_discover_result",
  "build_unsupported_protocol_version_error",
  "validate_discover_request",
  "process_discover_request",
  "build_discover_request",
  "build_discover_response",
  "select_revision",
  "resolve_instructions",
  "CURRENT_PROTOCOL_VERSION",
  "is_supported_protocol_version",
]


@dataclass(frozen=True)
class DiscoverConfig:
  """The server-supplied inputs to a ``DiscoverResult``.

  Constructed once and reused across discovery requests (the model is stateless — the
  result does not depend on the connection or any prior request).
  """

  #: Non-empty list of revisions the server will accept. (R-5.3.2-b, R-5.3.2-c)
  supported_versions: list[str]
  #: The server's advertised capabilities; ``{}`` means "no optional capabilities".
  capabilities: dict
  #: Server identity; MUST carry string ``name`` and ``version``. (R-5.3.2-f)
  server_info: dict
  #: OPTIONAL guidance for using the server effectively. (R-5.3.2-g)
  instructions: str | None = None
  #: OPTIONAL result-level metadata. (R-5.3.2-k)
  meta: dict | None = None


def is_version_supported(supported_versions: list[str], requested: str) -> bool:
  """Return ``True`` when ``requested`` is one of ``supported_versions``.

  Exact string membership (no lexical/chronological ordering, §5.1) and independent of
  element order — reordering ``supported_versions`` never changes the outcome.
  """
  return requested in supported_versions


class DiscoverResult(McpModel):
  """A successful ``server/discover`` result (§5.3.2) — the Python analogue of the TS
  ``DiscoverResultSchema``.

  Advertises the server's supported protocol revisions, capabilities, and identity.
  Unknown members pass through (forward-compatible).
  """

  #: REQUIRED base discriminator (a tools/discover result is ``"complete"``). (R-5.3.2-a)
  result_type: str
  #: REQUIRED non-empty list of revisions the server accepts. (R-5.3.2-b, R-5.3.2-c)
  supported_versions: list[str] = Field(min_length=1)
  #: REQUIRED advertised capabilities; ``{}`` ⇒ no optional capabilities.
  capabilities: dict[str, Any]
  #: REQUIRED server identity. (R-5.3.2-f)
  server_info: Implementation
  #: OPTIONAL guidance for using the server effectively. (R-5.3.2-g)
  instructions: str | None = None
  #: OPTIONAL result-level metadata. (R-5.3.2-k)
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_discover_result(value: object) -> bool:
  """Return ``True`` when ``value`` is a well-formed ``DiscoverResult`` (§5.3.2)."""
  return validates(DiscoverResult, value)


def build_discover_result(config: DiscoverConfig) -> dict:
  """Build a successful ``DiscoverResult`` from a server's :class:`DiscoverConfig`.

  ``resultType`` is ``"complete"`` (R-5.3.2-a); optional ``instructions`` / ``_meta`` are
  included only when supplied — never defaulted.

  :raises ValueError: when ``supported_versions`` is empty — a server MUST advertise at
    least one accepted revision (R-5.3.2-b). (Python analogue of JS ``RangeError``.)
  """
  if len(config.supported_versions) == 0:
    raise ValueError("DiscoverResult.supportedVersions MUST be non-empty (R-5.3.2-b)")
  result: dict = {
    "resultType": RESULT_TYPE_COMPLETE,
    "supportedVersions": list(config.supported_versions),
    "capabilities": config.capabilities,
    "serverInfo": config.server_info,
  }
  if config.instructions is not None:
    result["instructions"] = config.instructions
  if config.meta is not None:
    result["_meta"] = config.meta
  return result


def build_unsupported_protocol_version_error(requested: str, supported: list[str]) -> dict:
  """Build the ``UnsupportedProtocolVersion`` (-32004) error.

  Both ``data.supported`` and ``data.requested`` are REQUIRED (§5.5): the former still
  advertises the server's revisions so the client can recover; the latter echoes the
  rejected revision. (R-5.3.1-g)
  """
  return {
    "code": UNSUPPORTED_PROTOCOL_VERSION_CODE,
    "message": "Unsupported protocol version",
    "data": {"supported": list(supported), "requested": requested},
  }


@dataclass(frozen=True)
class DiscoverRequestValidation:
  """Outcome of :func:`validate_discover_request`."""

  ok: bool
  requested_version: str | None = None
  code: int | None = None
  message: str | None = None


def validate_discover_request(request: object) -> DiscoverRequestValidation:
  """Validate a raw ``server/discover`` request payload (§5.3.1).

  Checks, in order: the object is present with ``method == "server/discover"``; ``params``
  is an object carrying ``_meta``; ``_meta`` carries the three REQUIRED reserved keys with
  correct types (delegated to :func:`validate_request_meta`). Extra ``_meta`` keys are
  accepted (R-5.3.1-e). On success returns the declared revision.
  """
  if not isinstance(request, dict):
    return DiscoverRequestValidation(False, code=INVALID_PARAMS_CODE, message="Invalid params: request must be an object")

  if request.get("method") != SERVER_DISCOVER_METHOD:
    return DiscoverRequestValidation(
      False, code=INVALID_PARAMS_CODE, message=f'Invalid params: method must be "{SERVER_DISCOVER_METHOD}"'
    )

  params = request.get("params")
  if not isinstance(params, dict):
    return DiscoverRequestValidation(False, code=INVALID_PARAMS_CODE, message="Invalid params: params must be an object")

  meta = params.get("_meta")
  if not isinstance(meta, dict):
    return DiscoverRequestValidation(
      False, code=INVALID_PARAMS_CODE, message="Invalid params: params._meta must be an object"
    )

  meta_result = validate_request_meta(meta)
  if not meta_result.ok:
    return DiscoverRequestValidation(False, code=meta_result.code, message=meta_result.message)

  return DiscoverRequestValidation(True, requested_version=meta[PROTOCOL_VERSION_META_KEY])


@dataclass(frozen=True)
class ProcessDiscoverOutcome:
  """Outcome of :func:`process_discover_request`.

  ``ok=True`` carries ``result`` (a ``DiscoverResult`` dict); otherwise ``error`` carries
  either an invalid-params (-32602) or an UnsupportedProtocolVersion (-32004) error dict.
  """

  ok: bool
  result: dict | None = None
  error: dict | None = None


def process_discover_request(config: DiscoverConfig, request: object) -> ProcessDiscoverOutcome:
  """The reference ``server/discover`` handler every server MUST implement (R-5.3-a).

  * A malformed request → invalid-params (-32602).
  * A well-formed request whose declared revision the server does NOT support → an
    ``UnsupportedProtocolVersion`` (-32004) error (never a crash/hang); ``data.supported``
    lists the server's revisions, ``data.requested`` echoes the rejected one. (R-5.3.1-f/-g)
  * Otherwise → a ``DiscoverResult``.

  Stateless: the requested revision is derived solely from the request's ``_meta``.
  """
  validation = validate_discover_request(request)
  if not validation.ok:
    return ProcessDiscoverOutcome(False, error={"code": validation.code, "message": validation.message})

  if not is_version_supported(config.supported_versions, validation.requested_version):
    return ProcessDiscoverOutcome(
      False,
      error=build_unsupported_protocol_version_error(validation.requested_version, config.supported_versions),
    )

  return ProcessDiscoverOutcome(True, result=build_discover_result(config))


def build_discover_request(
  id_: RequestId,
  protocol_version: str,
  client_info: dict,
  client_capabilities: dict,
  extra_meta: dict | None = None,
) -> dict:
  """Build a complete ``server/discover`` JSON-RPC request carrying the three REQUIRED
  reserved ``_meta`` keys, plus any additional ``_meta`` keys (§5.3.1, R-5.3.1-e).

  Reserved keys always win over ``extra_meta``.
  """
  meta: dict = {
    **(extra_meta or {}),
    PROTOCOL_VERSION_META_KEY: protocol_version,
    CLIENT_INFO_META_KEY: client_info,
    CLIENT_CAPABILITIES_META_KEY: client_capabilities,
  }
  return {"jsonrpc": "2.0", "id": id_, "method": SERVER_DISCOVER_METHOD, "params": {"_meta": meta}}


def build_discover_response(id_: RequestId, config: DiscoverConfig) -> dict:
  """Wrap a ``DiscoverResult`` in its JSON-RPC success envelope (§5.3.2)."""
  return {"jsonrpc": "2.0", "id": id_, "result": build_discover_result(config)}


def select_revision(
  supported_versions: list[str],
  client_acceptable: list[str] | None = None,
) -> str | None:
  """Select a revision from the server's ``supported_versions`` using the client's own
  preference order — never the order of the server's list (R-5.3.2-d, AC-08.7).

  ``client_acceptable`` is the client's revisions in descending preference (defaults to
  ``[CURRENT_PROTOCOL_VERSION]``). Returns the first client-preferred revision the server
  also supports, or ``None`` when they share none. Reordering ``supported_versions``
  cannot change the result.
  """
  if client_acceptable is None:
    client_acceptable = [CURRENT_PROTOCOL_VERSION]
  offered = set(supported_versions)
  for candidate in client_acceptable:
    if candidate in offered:
      return candidate
  return None


def resolve_instructions(result: dict) -> str | None:
  """Return the server's ``instructions`` string, or ``None`` when absent.

  When ``instructions`` is missing the client MUST NOT assume or fabricate guidance —
  this returns ``None`` rather than an empty/default string. (R-5.3.2-j, AC-08.11)
  """
  instructions = result.get("instructions")
  return instructions if isinstance(instructions, str) else None
