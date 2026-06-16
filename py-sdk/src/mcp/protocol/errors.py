"""Error Handling & Error Code Registry (§22).

The authoritative model for how a receiver reports that a request could not be
processed: the JSON-RPC ``error`` object shape, the full registry of error codes (the
five standard JSON-RPC codes plus MCP's protocol-specific and transport codes), the
normative ``data`` payloads, the HTTP status mappings, the canonical mapping of
validation failures to ``-32602``, the firm boundary between a protocol-level
JSON-RPC ``error`` and a feature-level error *result* (a tool that ran and failed),
and the rules for extension-defined and unknown error codes.

Unlike the TypeScript SDK — where these numeric codes are first defined in their
owning feature modules and re-exported here — the Python port centralises every code
constant in this module (its canonical home). Later feature modules import the codes
they need from here, which keeps the dependency graph acyclic.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal, NamedTuple

# ─── Error code constants (§22.2, §22.3) ──────────────────────────────────────

#: Invalid JSON was received; the byte stream could not be parsed. (§22.2)
PARSE_ERROR_CODE = -32700
#: Valid JSON, but not a valid JSON-RPC request object. (§22.2)
INVALID_REQUEST_CODE = -32600
#: The method does not exist / is not available. (§22.2)
METHOD_NOT_FOUND_CODE = -32601
#: Invalid or malformed method parameters. (§22.2)
INVALID_PARAMS_CODE = -32602
#: An unexpected condition prevented fulfilling a well-formed request. (§22.2)
INTERNAL_ERROR_CODE = -32603
#: The request requires a client capability the client did not declare. (§22.3)
MISSING_CLIENT_CAPABILITY_CODE = -32003
#: The request's protocol revision is unknown to/unsupported by the server. (§22.3)
UNSUPPORTED_PROTOCOL_VERSION_CODE = -32004
#: A routing header is missing/malformed/mismatched (Streamable HTTP). (§22.7, §9.8)
HEADER_MISMATCH_CODE = -32001
#: Invalid/expired cursor — an alias of invalid-params for bad cursors. (§12, §22.4)
INVALID_CURSOR_CODE = -32602
#: Legacy "Resource not found" literal; §22.4 also maps this to -32602. (§22.4)
RESOURCE_NOT_FOUND_LEGACY_CODE = -32002

#: The JSON-RPC version marker every error response MUST carry. (R-22.1-d)
JSONRPC_VERSION = "2.0"


# ─── Error code classification (§22.2, §22.7) ─────────────────────────────────

class ErrorCodeClass(StrEnum):
  """The class a JSON-RPC error code falls into (§22). The numeric ``code`` is
  authoritative; this taxonomy lets a receiver reason about a code it has never seen.
  (R-22.1-h, R-22.7-a, R-22.7-e)
  """

  #: The five reserved JSON-RPC pre-defined codes (``-32700``, ``-32600..-32603``).
  JSON_RPC_STANDARD = "json-rpc-standard"
  #: MCP protocol-specific codes (``-32003``, ``-32004``) — normative ``data``. (§22.3)
  MCP_PROTOCOL = "mcp-protocol"
  #: The implementation-defined server-error range ``-32000..-32099``. (§22.7)
  SERVER_DEFINED = "server-defined"
  #: Any integer outside every reserved/server range — extension-defined. (§22.7)
  EXTENSION_DEFINED = "extension-defined"


class _Range(NamedTuple):
  min: int
  max: int


#: JSON-RPC 2.0 reserved range for pre-defined errors, inclusive. (§22.2, §22.7)
JSON_RPC_RESERVED_RANGE = _Range(-32768, -32000)
#: Implementation-defined server-error sub-range, inclusive. (§22.7) ``-32001`` lives here.
SERVER_ERROR_RANGE = _Range(-32099, -32000)


def _in_range(code: int, rng: _Range) -> bool:
  """Return ``True`` when ``code`` lies within ``[rng.min, rng.max]`` inclusive."""
  return rng.min <= code <= rng.max


def _is_int(value: object) -> bool:
  """Return ``True`` for a Python ``int`` that is not a ``bool``."""
  return isinstance(value, int) and not isinstance(value, bool)


# ─── Registry rows (§22.2, §22.3, §6.5) ───────────────────────────────────────

#: Whether a code's ``data`` shape is normative (fixed by spec) or sender-defined.
ErrorDataPolicy = Literal["normative", "sender-defined"]


@dataclass(frozen=True)
class ErrorCodeRegistryEntry:
  """One row of the §22 error-code registry. (§6.5)"""

  #: The authoritative numeric code. (R-22.1-h)
  code: int
  #: The canonical condition name (case-sensitive, exactly as in §22). (R-22-a)
  name: str
  #: Which classification range this code belongs to.
  error_class: ErrorCodeClass
  #: One-line meaning of the condition the code signals.
  meaning: str
  #: Whether ``error.data`` is spec-normative or sender-defined. (R-22.1-k, R-22.3-a)
  data_policy: ErrorDataPolicy
  #: The keys a normative ``data`` payload MUST carry, if any. (R-22.3-a)
  data_keys: tuple[str, ...] | None = None
  #: The HTTP status this code maps to on Streamable HTTP. (§22.6)
  http_status: int | None = None


#: The complete §22 error-code registry, keyed by numeric code (§6.5, §22.2, §22.3).
#: The same ``code`` applies on every transport; ``http_status`` is the Streamable
#: HTTP overlay (§22.6). ``-32602`` has a single entry even though several distinct
#: conditions collapse onto it (the specific condition is conveyed by message/data).
ERROR_CODE_REGISTRY: dict[int, ErrorCodeRegistryEntry] = {
  PARSE_ERROR_CODE: ErrorCodeRegistryEntry(
    code=PARSE_ERROR_CODE,
    name="Parse error",
    error_class=ErrorCodeClass.JSON_RPC_STANDARD,
    meaning="Invalid JSON was received; the byte stream could not be parsed as JSON text.",
    data_policy="sender-defined",
  ),
  INVALID_REQUEST_CODE: ErrorCodeRegistryEntry(
    code=INVALID_REQUEST_CODE,
    name="Invalid Request",
    error_class=ErrorCodeClass.JSON_RPC_STANDARD,
    meaning="Valid JSON, but not a valid JSON-RPC request object.",
    data_policy="sender-defined",
  ),
  METHOD_NOT_FOUND_CODE: ErrorCodeRegistryEntry(
    code=METHOD_NOT_FOUND_CODE,
    name="Method not found",
    error_class=ErrorCodeClass.JSON_RPC_STANDARD,
    meaning=(
      "The method does not exist / is not available, including a method gated behind "
      "an unadvertised server capability."
    ),
    data_policy="sender-defined",
  ),
  INVALID_PARAMS_CODE: ErrorCodeRegistryEntry(
    code=INVALID_PARAMS_CODE,
    name="Invalid params",
    error_class=ErrorCodeClass.JSON_RPC_STANDARD,
    meaning=(
      "Invalid or malformed method parameters: unknown tool/prompt/template, invalid "
      "tool arguments, missing required prompt argument, invalid/expired cursor, or "
      "resource-not-found."
    ),
    data_policy="sender-defined",
  ),
  INTERNAL_ERROR_CODE: ErrorCodeRegistryEntry(
    code=INTERNAL_ERROR_CODE,
    name="Internal error",
    error_class=ErrorCodeClass.JSON_RPC_STANDARD,
    meaning="An unexpected condition prevented fulfilling an otherwise well-formed request.",
    data_policy="sender-defined",
  ),
  MISSING_CLIENT_CAPABILITY_CODE: ErrorCodeRegistryEntry(
    code=MISSING_CLIENT_CAPABILITY_CODE,
    name="MissingRequiredClientCapability",
    error_class=ErrorCodeClass.MCP_PROTOCOL,
    meaning="The request requires a client capability the client did not declare.",
    data_policy="normative",
    data_keys=("requiredCapabilities",),
    http_status=400,
  ),
  UNSUPPORTED_PROTOCOL_VERSION_CODE: ErrorCodeRegistryEntry(
    code=UNSUPPORTED_PROTOCOL_VERSION_CODE,
    name="UnsupportedProtocolVersion",
    error_class=ErrorCodeClass.MCP_PROTOCOL,
    meaning="The request's protocol revision is unknown to or unsupported by the server.",
    data_policy="normative",
    data_keys=("supported", "requested"),
    http_status=400,
  ),
  RESOURCE_NOT_FOUND_LEGACY_CODE: ErrorCodeRegistryEntry(
    code=RESOURCE_NOT_FOUND_LEGACY_CODE,
    name="Resource not found",
    error_class=ErrorCodeClass.MCP_PROTOCOL,
    meaning="A requested resource URI does not exist (carries data.uri; §22.4 also maps to -32602).",
    data_policy="sender-defined",
    data_keys=("uri",),
  ),
  HEADER_MISMATCH_CODE: ErrorCodeRegistryEntry(
    code=HEADER_MISMATCH_CODE,
    name="HeaderMismatch",
    error_class=ErrorCodeClass.SERVER_DEFINED,
    meaning=(
      "A routing header (MCP-Protocol-Version, Mcp-Method, Mcp-Name, or a parameter "
      "header) is missing, malformed, or mismatched (Streamable HTTP transport)."
    ),
    data_policy="sender-defined",
    http_status=400,
  ),
}

#: The reserved codes an extension-defined code MUST NOT collide with: the five
#: standard JSON-RPC codes, the two protocol-specific codes, and ``-32001``. (R-22.7-c)
RESERVED_ERROR_CODES: tuple[int, ...] = (
  PARSE_ERROR_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  INVALID_PARAMS_CODE,
  INTERNAL_ERROR_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  HEADER_MISMATCH_CODE,
)


# ─── Registry lookups & classification (§6.5 helpers) ─────────────────────────

def lookup_error_code(code: int) -> ErrorCodeRegistryEntry | None:
  """Look up the registry entry for ``code``, or ``None`` if not in the §22 registry.

  An absent entry is not an error — receivers MUST tolerate unknown codes (see
  :func:`describe_unknown_error_code`). (R-22.7-e)
  """
  return ERROR_CODE_REGISTRY.get(code)


def classify_error_code(code: int) -> ErrorCodeClass:
  """Classify any integer ``code`` into an :class:`ErrorCodeClass`, even unknown codes.

  A registry entry's own class always wins; otherwise the code is placed by range: the
  server-error sub-range (``-32000..-32099``) → ``SERVER_DEFINED``, any other
  reserved-range code → ``JSON_RPC_STANDARD``, everything else → ``EXTENSION_DEFINED``.
  (§22.2, §22.7, R-22.7-a)
  """
  entry = lookup_error_code(code)
  if entry is not None:
    return entry.error_class
  if _in_range(code, SERVER_ERROR_RANGE):
    return ErrorCodeClass.SERVER_DEFINED
  if _in_range(code, JSON_RPC_RESERVED_RANGE):
    return ErrorCodeClass.JSON_RPC_STANDARD
  return ErrorCodeClass.EXTENSION_DEFINED


def is_reserved_error_code(code: int) -> bool:
  """Return ``True`` when ``code`` is one of the eight reserved codes. (R-22.7-c)"""
  return code in RESERVED_ERROR_CODES


@dataclass(frozen=True)
class ExtensionCodeValidation:
  """Outcome of :func:`validate_extension_error_code`."""

  ok: bool
  reason: Literal["not-an-integer", "collides-with-reserved"] | None = None


def validate_extension_error_code(code: object) -> ExtensionCodeValidation:
  """Validate that ``code`` is a legal extension-defined error code.

  An integer that does not collide with any reserved code. Extensions SHOULD also
  carry structured ``data`` (R-22.7-d) — a payload concern, not enforced here.
  (R-22.7-a, R-22.7-b, R-22.7-c)
  """
  if not _is_int(code):
    return ExtensionCodeValidation(False, "not-an-integer")
  if is_reserved_error_code(code):
    return ExtensionCodeValidation(False, "collides-with-reserved")
  return ExtensionCodeValidation(True)


def is_error_code_in_class(code: object, cls: ErrorCodeClass) -> bool:
  """Return ``True`` when ``code`` is allowed for the given classification.

  For ``SERVER_DEFINED`` the code MUST lie in ``-32000..-32099``; for
  ``EXTENSION_DEFINED`` it MUST be a non-reserved integer outside the reserved range;
  for the standard/protocol classes it MUST be the corresponding registered code.
  (§22.2, §22.7)
  """
  if not _is_int(code):
    return False
  if cls is ErrorCodeClass.SERVER_DEFINED:
    return _in_range(code, SERVER_ERROR_RANGE)
  if cls is ErrorCodeClass.EXTENSION_DEFINED:
    return not is_reserved_error_code(code) and not _in_range(code, JSON_RPC_RESERVED_RANGE)
  # JSON_RPC_STANDARD / MCP_PROTOCOL
  return classify_error_code(code) is cls


# ─── Error object shape (§22.1, canonical Error from §3.8) ────────────────────

def _is_plain_object(value: object) -> bool:
  """Return ``True`` for a non-null, non-list object (a ``dict``)."""
  return isinstance(value, dict)


def is_valid_error_object(value: object) -> bool:
  """Validate the canonical error-object shape (§22.1).

  ``code`` present and an integer (possibly negative), ``message`` present and a
  string, ``data`` optional. (R-22.1-c, R-22.1-h, R-22.1-i, R-22.1-k, AC-34.6)
  """
  if not _is_plain_object(value):
    return False
  return _is_int(value.get("code")) and isinstance(value.get("message"), str)


def has_exactly_result_or_error(response: object) -> bool:
  """Validate the mutual-exclusion invariant: exactly one of ``result`` or ``error``.

  Never both, never neither. (R-22.1-a, AC-34.1)
  """
  if not _is_plain_object(response):
    return False
  return ("result" in response) != ("error" in response)


def _is_notification(message: dict) -> bool:
  """Return ``True`` for a JSON-RPC notification: a ``method`` and no ``id``."""
  return "method" in message and "id" not in message


def is_valid_error_response(value: object) -> bool:
  """Validate an error response envelope per §22.1/§22.6.

  ``jsonrpc`` is exactly ``"2.0"``, it carries a valid ``error`` object and no
  ``result``, and ``id`` — when present — is a string, an integer, or ``null``.
  (R-22.1-a, R-22.1-d, R-22.6-g, R-22.6-h, AC-34.1–AC-34.4)

  Structure only; whether the ``id`` *matches* a request is a correlation concern.
  """
  if not _is_plain_object(value):
    return False
  if value.get("jsonrpc") != JSONRPC_VERSION:
    return False
  if "error" not in value or "result" in value:
    return False
  if not is_valid_error_object(value["error"]):
    return False
  if "id" in value:
    id_ = value["id"]
    if not (id_ is None or isinstance(id_, str) or _is_int(id_)):
      return False
  return True


def suppresses_error_response(message: object) -> bool:
  """Return ``True`` when a message MUST NOT receive any response — a notification.

  An object carrying ``method`` and no ``id`` never receives a response, error or
  otherwise. (R-22.1-g, R-22.6-i, AC-34.5)
  """
  return _is_plain_object(message) and _is_notification(message)


# ─── Error object builders (§22) ──────────────────────────────────────────────

def build_error_object(code: int, message: str | None = None, data: object = None) -> dict:
  """Build a canonical error object with ``code``, ``message``, and optional ``data``.

  When ``message`` is omitted, the registry's condition name is used so the result
  always has a non-empty message. (R-22.1-c, R-22.1-i, R-22.1-k)
  """
  entry = lookup_error_code(code)
  resolved_message = message if message is not None else (entry.name if entry else "Error")
  error: dict = {"code": code, "message": resolved_message}
  if data is not None:
    error["data"] = data
  return error


def build_resource_not_found_params_error(uri: str, message: str = "Resource not found") -> dict:
  """Build a ``-32602`` resource-not-found error whose ``data`` includes the ``uri``.

  Per the §22.4 canonical mapping a non-existent resource MUST be signalled this way
  and MUST NOT be signalled by an empty ``contents`` array. (R-22.4-g, R-22.4-h, R-22.4-i)
  """
  return {"code": INVALID_PARAMS_CODE, "message": message, "data": {"uri": uri}}


def describe_unknown_error_code(error: dict) -> dict:
  """Describe an error response carrying a code the receiver does not recognise.

  Per R-22.7-e a receiver MUST treat an unknown code as a failed request and surface
  it using ``error.message``/``error.data``, NOT reject it as malformed. (AC-34.24)
  """
  descriptor: dict = {
    "failed": True,
    "code": error["code"],
    "error_class": classify_error_code(error["code"]),
    "message": error["message"],
  }
  if error.get("data") is not None:
    descriptor["data"] = error["data"]
  return descriptor


# ─── Protocol error vs. feature-level error result (§22.5) ────────────────────

class ToolFailureMechanism(StrEnum):
  """The two distinct mechanisms for reporting a ``tools/call`` failure (§22.5)."""

  #: A JSON-RPC ``error`` (``-32602``): the request could not be dispatched. (R-22.5-c)
  PROTOCOL_ERROR = "protocol-error"
  #: A successful ``result`` with ``isError: true``: the tool ran but failed. (R-22.5-b)
  ERROR_RESULT = "error-result"


#: The situations a ``tools/call`` failure can arise from. (§22.5)
ToolCallFailureSituation = Literal["unknown-tool", "invalid-arguments", "execution-failure"]


def classify_tool_call_failure(situation: ToolCallFailureSituation) -> ToolFailureMechanism:
  """Decide whether a ``tools/call`` failure is a protocol error or an error result.

  Undispatchable/schema-invalid requests (``unknown-tool``, ``invalid-arguments``) are
  PROTOCOL errors and MUST never produce ``isError: true`` (R-22.5-f); a tool that ran
  and failed (``execution-failure``) is an ERROR RESULT and MUST never produce a
  JSON-RPC error (R-22.5-e). The mapping is total and never the reverse. (R-22.5-a)
  """
  if situation in ("unknown-tool", "invalid-arguments"):
    return ToolFailureMechanism.PROTOCOL_ERROR
  return ToolFailureMechanism.ERROR_RESULT


# ─── Transport error / HTTP status mapping (§22.6) ────────────────────────────

def http_status_for_registry_code(code: int) -> int | None:
  """Map an error ``code`` to the Streamable HTTP status it MUST ride on (§22.6).

  Codes the registry does not pin to a status return ``None``. The numeric ``code`` is
  the same on every transport — this only supplies the HTTP overlay. (R-22-a, R-22.6-a)
  """
  entry = lookup_error_code(code)
  return entry.http_status if entry else None


#: The stage at which an inbound message failed validation (§22.6 classification pipeline).
InboundFailureStage = Literal[
  "unparseable-json",
  "invalid-request-object",
  "routing-header",
  "invalid-metadata",
]


def error_code_for_inbound_failure(stage: InboundFailureStage) -> int:
  """Select the authoritative ``error.code`` for a failed-inbound-message stage (§22.6).

  ``unparseable-json`` → ``-32700``; ``invalid-request-object`` → ``-32600``;
  ``routing-header`` → ``-32001``; ``invalid-metadata`` → ``-32602``.
  (R-22.6-b–R-22.6-f, AC-34.21, AC-34.22)
  """
  mapping: dict[str, int] = {
    "unparseable-json": PARSE_ERROR_CODE,
    "invalid-request-object": INVALID_REQUEST_CODE,
    "routing-header": HEADER_MISMATCH_CODE,
    "invalid-metadata": INVALID_PARAMS_CODE,
  }
  return mapping[stage]


def build_null_id_parse_error_response(message: str = "Parse error") -> dict:
  """Build the ``null``-id parse-error response for unparseable input.

  The one circumstance in which an error response's ``id`` need not match a request id;
  the transport structurally requires a value, so ``id`` is sent as ``null``.
  (R-22.1-f, R-22.6-h, AC-34.4)
  """
  return {
    "jsonrpc": JSONRPC_VERSION,
    "id": None,
    "error": {"code": PARSE_ERROR_CODE, "message": message},
  }
