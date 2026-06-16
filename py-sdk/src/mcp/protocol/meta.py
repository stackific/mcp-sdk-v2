"""The ``_meta`` object, metadata naming, and per-request keys (§4.1–§4.3).

Builds on the key-naming grammar in :mod:`mcp.json.meta_key` (§2.6.2) and adds the
semantic layer:

* ``RESERVED_BARE_KEYS`` — the four prefix-less keys the spec allows in ``_meta`` (§4.2).
* ``LOGGING_LEVELS`` — log severity values in ascending order (§4.3, deprecated key).
* the three reserved ``io.modelcontextprotocol/*`` request keys (§4.3).
* :func:`validate_request_meta` — structured validation of the required per-request keys.
* the missing-capability (``-32003``) error builder.

The error-code constants (``-32602`` / ``-32003``) are imported from
:mod:`mcp.protocol.errors`, their canonical home in this port.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.types.implementation import is_valid_implementation

# ─── Reserved bare keys (§4.2) ────────────────────────────────────────────────

#: The four bare keys (no prefix) that are RESERVED and MAY appear in ``_meta`` (§4.2,
#: R-4.2-j). ``progressToken`` correlates progress notifications; the three W3C keys
#: carry distributed-trace context.
RESERVED_BARE_KEYS = frozenset({"progressToken", "traceparent", "tracestate", "baggage"})


def is_reserved_bare_key(key: str) -> bool:
  """Return ``True`` when ``key`` is one of the four reserved bare keys. (R-4.2-j)"""
  return key in RESERVED_BARE_KEYS


# ─── Reserved per-request `_meta` keys (§4.3) ─────────────────────────────────

#: REQUIRED in the ``_meta`` of every client request — the protocol revision. (R-4.3-a)
PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion"
#: REQUIRED — the client ``Implementation`` identity. (R-4.3-b)
CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo"
#: REQUIRED — per-request declared client capabilities. (R-4.3-c)
CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities"

#: The three required reserved request ``_meta`` keys, in declaration order. (§4.3)
RESERVED_REQUEST_META_KEYS = (
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
)


# ─── MetaObject (§4.1) ────────────────────────────────────────────────────────

def is_valid_meta_object(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid ``_meta`` container (§4.1).

  Mirrors the TS ``MetaObjectSchema`` (``z.record(z.unknown())``): the value of
  ``_meta`` is always a JSON object — never an array, scalar, or ``null`` (R-4.1-j).
  An empty object is valid; member values may be any JSON value (R-4.1-b), so they are
  not further inspected here. (R-4.1-i, R-4.1-j, AC-05.7)
  """
  return isinstance(value, dict)


# ─── LoggingLevel (§4.3, deprecated) ──────────────────────────────────────────

#: Log severity values, in ascending order (§4.3, R-4.3-d). The ``logLevel`` ``_meta``
#: key that uses these is **Deprecated** (§27.3).
LOGGING_LEVELS = (
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency",
)


def is_valid_logging_level(value: object) -> bool:
  """Return ``True`` when ``value`` is one of the eight recognised ``LoggingLevel`` strings.

  Mirrors the TS ``LoggingLevelSchema``: exactly one of the ascending-severity level
  names; any other string (e.g. ``"verbose"``), a number, ``None``, etc. is rejected.
  (§4.3, R-4.3-d) The ``io.modelcontextprotocol/logLevel`` key that uses these is
  **Deprecated** (§27.3).

  .. deprecated::
    The ``io.modelcontextprotocol/logLevel`` ``_meta`` key (and the Logging capability it
    drives) is Deprecated (§27.3). See the Logging capability migration note (stderr on
    stdio; external observability otherwise). Earliest removal: 2026-07-28 (§27.2/§27.3,
    R-27.4-a/-b).
  """
  return isinstance(value, str) and value in LOGGING_LEVELS


def logging_level_index(level: str) -> int:
  """Return the numeric severity index of a logging level (lower = less severe).

  :raises ValueError: when ``level`` is not a known logging level.
  """
  return LOGGING_LEVELS.index(level)


def is_at_or_above_log_level(candidate: str, minimum: str) -> bool:
  """Return ``True`` when ``candidate`` severity is at or above ``minimum`` (R-4.3-m)."""
  return logging_level_index(candidate) >= logging_level_index(minimum)


# ─── Protocol version / revision format (§5, §5.1) ────────────────────────────

#: The protocol revision supported by this SDK release. (§5)
CURRENT_PROTOCOL_VERSION = "2026-07-28"

#: ``YYYY-MM-DD`` revision-identifier format (§5.1). Validates layout only — revisions
#: are opaque, exactly-matched strings; implementations MUST NOT order/range-compare.
PROTOCOL_REVISION_FORMAT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_supported_protocol_version(version: str) -> bool:
  """Return ``True`` when the server recognises and supports ``version`` (R-4.3-f)."""
  return version == CURRENT_PROTOCOL_VERSION


def is_valid_revision_format(revision: str) -> bool:
  """Return ``True`` when ``revision`` matches ``YYYY-MM-DD`` (§5.1, R-5.2-b).

  A ``True`` result does NOT mean the revision is supported — use
  :func:`is_supported_protocol_version` for that.
  """
  return bool(PROTOCOL_REVISION_FORMAT_RE.match(revision))


# ─── validate_request_meta (§4.3) ─────────────────────────────────────────────

@dataclass(frozen=True)
class RequestMetaValidationResult:
  """Outcome of :func:`validate_request_meta`.

  ``ok=True`` means all three required keys are present and well-typed. Otherwise
  ``code`` is ``-32602`` and ``message`` explains the failure.
  """

  ok: bool
  code: int | None = None
  message: str | None = None


def validate_request_meta(meta: dict) -> RequestMetaValidationResult:
  """Validate that a request's ``_meta`` carries all three REQUIRED per-request keys
  (§4.3, R-4.3-n).

  Returns a failure with code ``-32602`` when any required key is missing or has the
  wrong type; the server MUST respond with this code (and HTTP ``400`` on HTTP).
  Unknown extra keys are ignored (R-4.1-e, R-4.1-f).
  """
  protocol_version = meta.get(PROTOCOL_VERSION_META_KEY)
  if not isinstance(protocol_version, str):
    return RequestMetaValidationResult(
      False,
      INVALID_PARAMS_CODE,
      f"Invalid params: missing required _meta key {PROTOCOL_VERSION_META_KEY}",
    )
  # A malformed-but-string version is rejected at the request gate as invalid params —
  # distinct from a well-formed-but-unsupported revision (answered with -32004 by the
  # discovery/negotiation layer).
  if not is_valid_revision_format(protocol_version):
    return RequestMetaValidationResult(
      False,
      INVALID_PARAMS_CODE,
      f'Invalid params: {PROTOCOL_VERSION_META_KEY} "{protocol_version}" is not a valid '
      "YYYY-MM-DD revision identifier",
    )

  if not is_valid_implementation(meta.get(CLIENT_INFO_META_KEY)):
    return RequestMetaValidationResult(
      False,
      INVALID_PARAMS_CODE,
      f"Invalid params: missing or invalid required _meta key {CLIENT_INFO_META_KEY}",
    )

  caps = meta.get(CLIENT_CAPABILITIES_META_KEY)
  if not isinstance(caps, dict):
    return RequestMetaValidationResult(
      False,
      INVALID_PARAMS_CODE,
      f"Invalid params: missing required _meta key {CLIENT_CAPABILITIES_META_KEY}",
    )

  return RequestMetaValidationResult(True)


# ─── RequestMetaObject structural validator (§4.3) ────────────────────────────

#: The optional ``io.modelcontextprotocol/logLevel`` per-request key (Deprecated). (R-4.3-d)
#:
#: .. deprecated::
#:   The ``io.modelcontextprotocol/logLevel`` ``_meta`` key (and the Logging capability it
#:   drives) is Deprecated (§27.3). See the Logging capability migration note (stderr on
#:   stdio; external observability otherwise). Earliest removal: 2026-07-28 (§27.2/§27.3,
#:   R-27.4-a/-b).
LOG_LEVEL_META_KEY = "io.modelcontextprotocol/logLevel"


def _is_string_or_number(value: object) -> bool:
  """Return ``True`` for a ``ProgressToken``: a string or a non-bool int/float (§15)."""
  return isinstance(value, str) or (isinstance(value, (int, float)) and not isinstance(value, bool))


def is_valid_request_meta_object(value: object) -> bool:
  """Return ``True`` for a structurally valid per-request ``params._meta`` object (§4.3).

  Mirrors the TS ``RequestMetaObjectSchema``. The three reserved keys are REQUIRED and
  typed (R-4.3-a, R-4.3-b, R-4.3-c):

  * ``io.modelcontextprotocol/protocolVersion`` — a string.
  * ``io.modelcontextprotocol/clientInfo``      — a valid ``Implementation`` (name+version).
  * ``io.modelcontextprotocol/clientCapabilities`` — a JSON object.

  Optional keys, validated only when present (R-4.3-d, R-4.3-e):

  * ``io.modelcontextprotocol/logLevel`` — a recognised, Deprecated ``LoggingLevel``.
  * ``progressToken`` — a string or number progress-correlation token.
  * ``traceparent`` / ``tracestate`` / ``baggage`` — OPAQUE strings; their contents are
    never parsed or branched on by the receiver (§15.4.2, R-15.4.2-c, R-15.4.2-g). W3C
    grammar validation is a SENDER concern (:mod:`mcp.json.meta_key`), never gated here.

  Additional protocol-defined or vendor keys MAY appear and pass through unchanged
  (Zod ``.passthrough()``). Unlike :func:`validate_request_meta` — the request *gate*
  that returns a ``-32602`` outcome and additionally checks the ``YYYY-MM-DD`` format —
  this is a pure structural predicate, the direct analogue of the Zod schema's
  ``safeParse(...).success``. (§4.3, AC-05.17, AC-05.19, AC-05.20, AC-05.21)
  """
  if not isinstance(value, dict):
    return False
  if not isinstance(value.get(PROTOCOL_VERSION_META_KEY), str):
    return False
  if not is_valid_implementation(value.get(CLIENT_INFO_META_KEY)):
    return False
  if not isinstance(value.get(CLIENT_CAPABILITIES_META_KEY), dict):
    return False
  if LOG_LEVEL_META_KEY in value and not is_valid_logging_level(value[LOG_LEVEL_META_KEY]):
    return False
  if "progressToken" in value and not _is_string_or_number(value["progressToken"]):
    return False
  for trace_key in ("traceparent", "tracestate", "baggage"):
    if trace_key in value and not isinstance(value[trace_key], str):
      return False
  return True


# ─── Missing-capability error builder (§5, R-4.3-k) ───────────────────────────

def build_missing_capability_error(required_capabilities: dict) -> dict:
  """Build the ``-32003`` "Missing required client capability" error payload.

  On the HTTP transport the response status MUST also be ``400 Bad Request``. (R-4.3-k)

  :param required_capabilities: map whose keys are the capability names that were
    required but not declared in ``clientCapabilities``.
  """
  return {
    "code": MISSING_CLIENT_CAPABILITY_CODE,
    "message": "Missing required client capability",
    "data": {"requiredCapabilities": required_capabilities},
  }
