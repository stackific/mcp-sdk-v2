"""Streamable HTTP request framing, headers & routing (§9.1–§9.4).

The request half of the Streamable HTTP transport: each client message is one HTTP
``POST`` to the single MCP endpoint, carrying exactly one JSON-RPC request or
notification (UTF-8, never a batch, never a response). Selected body fields are
mirrored into headers so intermediaries route without parsing the body; the body is
the single source of truth and any disagreeing header is rejected with ``-32001``
(``HeaderMismatch``).

This module provides the header constants, case-insensitive header access, POST-header
construction, body-framing validation, and the server-side validators for the required
headers (``Content-Type``, ``Accept``, ``MCP-Protocol-Version``) and routing headers
(``Mcp-Method``, ``Mcp-Name``), plus the notification-acceptance response shape.

The ``-32004`` (``UnsupportedProtocolVersion``) builder is reused from negotiation /
discovery; the full ``-32001`` (``HeaderMismatch``) error object is owned by
:mod:`mcp.transport.http.responses` — this module only emits the code, imported as
:data:`HEADER_MISMATCH_CODE` from :mod:`mcp.protocol.errors` (its canonical home).

Conformance: §9.1–§9.4 (R-9.1-a … R-9.4.3-a). The numeric error codes live in
:mod:`mcp.protocol.errors` (the Python SDK centralises every code there to keep the
dependency graph acyclic); the protocol-version header constant + the meta key come
from :mod:`mcp.protocol.revision` / :mod:`mcp.protocol.meta`.
"""

from __future__ import annotations

from dataclasses import dataclass

from mcp.jsonrpc.framing import MalformedMessageError, classify_message
from mcp.protocol.discovery import build_unsupported_protocol_version_error
from mcp.protocol.errors import HEADER_MISMATCH_CODE
from mcp.protocol.meta import PROTOCOL_VERSION_META_KEY
from mcp.protocol.revision import MCP_PROTOCOL_VERSION_HEADER

__all__ = [
  "MCP_PROTOCOL_VERSION_HEADER",
  "MCP_ENDPOINT_HTTP_METHOD",
  "CONTENT_TYPE_HEADER",
  "ACCEPT_HEADER",
  "MCP_METHOD_HEADER",
  "MCP_NAME_HEADER",
  "MCP_PARAM_HEADER_PREFIX",
  "CONTENT_TYPE_JSON",
  "ACCEPT_MEDIA_TYPES",
  "HEADER_MISMATCH_CODE",
  "NOTIFICATION_ACCEPTED_STATUS",
  "BAD_REQUEST_STATUS",
  "MCP_NAME_METHODS",
  "HttpHeaders",
  "get_header",
  "has_header",
  "is_param_header",
  "HttpRejection",
  "HttpValidation",
  "build_header_mismatch",
  "method_requires_mcp_name",
  "routing_name_for",
  "BuildPostHeadersOptions",
  "build_post_headers",
  "BodyFramingResult",
  "validate_post_body_framing",
  "validate_content_type",
  "validate_http_method",
  "validate_accept",
  "ProtocolVersionValidationOptions",
  "ProtocolVersionResult",
  "validate_protocol_version_header",
  "validate_routing_headers",
  "NotificationHttpResponse",
  "notification_http_response",
]

# ─── Constants ─────────────────────────────────────────────────────────────────

#: HTTP method every client message uses. (R-9.2-b)
MCP_ENDPOINT_HTTP_METHOD = "POST"
CONTENT_TYPE_HEADER = "Content-Type"
ACCEPT_HEADER = "Accept"
MCP_METHOD_HEADER = "Mcp-Method"
MCP_NAME_HEADER = "Mcp-Name"
#: Prefix for one-per-annotated-parameter headers, e.g. ``Mcp-Param-Region``.
MCP_PARAM_HEADER_PREFIX = "Mcp-Param-"

#: Required ``Content-Type`` value. (R-9.3.1-a)
CONTENT_TYPE_JSON = "application/json"
#: The two media types ``Accept`` MUST list. (R-9.3.2-b)
ACCEPT_MEDIA_TYPES: tuple[str, ...] = ("application/json", "text/event-stream")

#: HTTP status for an accepted notification. (R-9.2-g)
NOTIFICATION_ACCEPTED_STATUS = 202
#: HTTP status for every header/version rejection in this story. (§9.3–§9.4)
BAD_REQUEST_STATUS = 400

#: The methods that carry an ``Mcp-Name`` routing header. (R-9.4.2-a)
MCP_NAME_METHODS: frozenset[str] = frozenset({"tools/call", "resources/read", "prompts/get"})


# ─── Header access (case-insensitive names) ────────────────────────────────────

#: A bag of HTTP headers keyed by field name (names compared case-insensitively).
HttpHeaders = dict[str, str]


def get_header(headers: HttpHeaders, name: str) -> str | None:
  """Return the value of header ``name``, matching the field name case-insensitively.

  Returns ``None`` when the header is absent. Field names are compared
  case-insensitively per R-9.3-b; the value is returned verbatim (case-sensitive).
  """
  target = name.lower()
  for key, value in headers.items():
    if key.lower() == target:
      return value
  return None


def has_header(headers: HttpHeaders, name: str) -> bool:
  """Return ``True`` when header ``name`` is present (case-insensitive)."""
  return get_header(headers, name) is not None


def is_param_header(name: str) -> bool:
  """Return ``True`` when ``name`` is an ``Mcp-Param-*`` header (case-insensitive). (R-9.5.4-a)"""
  return name.lower().startswith(MCP_PARAM_HEADER_PREFIX.lower())


# ─── Rejections ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class HttpRejection:
  """A rejected POST: HTTP ``400`` plus a JSON-RPC error to put in the body.

  ``error`` is the canonical error object (``code``/``message``/optional ``data``).
  """

  status: int
  error: dict


@dataclass(frozen=True)
class HttpValidation:
  """Outcome of a header/body validator: ``ok`` with no rejection, or a rejection.

  Mirrors the TS discriminated union ``{ ok: true } | { ok: false; rejection }``: when
  ``ok`` is ``False`` the :attr:`rejection` carries the HTTP status + JSON-RPC error.
  """

  ok: bool
  rejection: HttpRejection | None = None


def build_header_mismatch(message: str = "Header does not match request body") -> HttpRejection:
  """Build a ``HeaderMismatch`` (``-32001``) rejection (HTTP ``400``). (§9.3–§9.4)"""
  return HttpRejection(status=BAD_REQUEST_STATUS, error={"code": HEADER_MISMATCH_CODE, "message": message})


def _reject(rejection: HttpRejection) -> HttpValidation:
  """Wrap a rejection into a failing :class:`HttpValidation`."""
  return HttpValidation(ok=False, rejection=rejection)


#: The singleton "accepted" validation outcome (immutable; safe to share).
_OK = HttpValidation(ok=True)


# ─── Routing-name resolution ───────────────────────────────────────────────────


def method_requires_mcp_name(method: str) -> bool:
  """Return ``True`` when ``method`` carries an ``Mcp-Name`` header. (R-9.4.2-a, R-9.4.2-e)"""
  return method in MCP_NAME_METHODS


def routing_name_for(method: str, params: dict | None) -> str | None:
  """Return the routing-name value for ``method`` from its ``params``.

  Returns ``None`` when the method carries no ``Mcp-Name`` (or the field is absent /
  not a string). (R-9.4.2-b, R-9.4.2-c, R-9.4.2-d)

  * ``tools/call``, ``prompts/get`` → ``params.name``
  * ``resources/read``             → ``params.uri``
  """
  if not method_requires_mcp_name(method) or params is None:
    return None
  field_name = "uri" if method == "resources/read" else "name"
  value = params.get(field_name)
  return value if isinstance(value, str) else None


# ─── POST header construction (client) ─────────────────────────────────────────


@dataclass(frozen=True)
class BuildPostHeadersOptions:
  """Inputs to :func:`build_post_headers`."""

  #: The protocol revision; also present in the body ``_meta``. (R-9.3.3-a)
  protocol_version: str
  #: The JSON-RPC ``method``; mirrored into ``Mcp-Method``. (R-9.4.1-a)
  method: str
  #: The body ``params``, used to derive ``Mcp-Name`` for targeted methods.
  params: dict | None = None
  #: Pre-built ``Mcp-Param-*`` headers (see the param-headers module).
  param_headers: dict[str, str] | None = None


def build_post_headers(options: BuildPostHeadersOptions) -> HttpHeaders:
  """Build the HTTP headers for a client POST.

  Emits the three required request headers (``Content-Type``, ``Accept``,
  ``MCP-Protocol-Version``), the ``Mcp-Method`` routing header, the conditional
  ``Mcp-Name`` (derived from ``params`` for targeted methods), and any pre-built
  ``Mcp-Param-*`` headers. (§9.2-f, §9.3, §9.4)
  """
  headers: HttpHeaders = {
    CONTENT_TYPE_HEADER: CONTENT_TYPE_JSON,
    ACCEPT_HEADER: ", ".join(ACCEPT_MEDIA_TYPES),
    MCP_PROTOCOL_VERSION_HEADER: options.protocol_version,
    MCP_METHOD_HEADER: options.method,
  }
  name = routing_name_for(options.method, options.params)
  if name is not None:
    headers[MCP_NAME_HEADER] = name
  if options.param_headers:
    headers.update(options.param_headers)
  return headers


# ─── Body framing (server) ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class BodyFramingResult:
  """Outcome of :func:`validate_post_body_framing`.

  On success ``ok`` is ``True`` and ``kind`` is ``"request"`` or ``"notification"``;
  on failure ``ok`` is ``False`` and ``reason`` describes the violation.
  """

  ok: bool
  kind: str | None = None
  reason: str | None = None


def validate_post_body_framing(body: object) -> BodyFramingResult:
  """Validate that a POST body is exactly one JSON-RPC request or notification.

  Never a batch (array), never a response, never malformed. (R-9.1-b, R-9.2-c,
  R-9.2-d, R-9.2-e)

  UTF-8 well-formedness (R-9.1-a) is enforced upstream by the transport decode layer;
  this operates on the already-parsed value.
  """
  try:
    classified = classify_message(body)
  except MalformedMessageError as exc:
    return BodyFramingResult(ok=False, reason=exc.reason)
  if classified.kind in ("request", "notification"):
    return BodyFramingResult(ok=True, kind=classified.kind)
  # A client MUST NOT send a JSON-RPC response to the server. (R-9.2-d)
  return BodyFramingResult(
    ok=False,
    reason="body must be a JSON-RPC request or notification, not a response",
  )


# ─── Required request headers (server) ─────────────────────────────────────────


def validate_content_type(headers: HttpHeaders) -> HttpValidation:
  """Validate ``Content-Type: application/json``. (R-9.3.1-a)

  Tolerates parameters like ``application/json; charset=utf-8`` by comparing only the
  media type (the substring before the first ``;``), case-insensitively.
  """
  value = get_header(headers, CONTENT_TYPE_HEADER)
  media_type = value.split(";")[0].strip().lower() if value is not None else None
  if media_type != CONTENT_TYPE_JSON:
    return _reject(build_header_mismatch(f"Content-Type must be {CONTENT_TYPE_JSON}"))
  return _OK


def validate_http_method(method: str) -> HttpValidation:
  """Validate the HTTP method is ``POST`` (case-insensitively). (R-9.2-a, R-9.2-b)"""
  if method.upper() != MCP_ENDPOINT_HTTP_METHOD:
    return _reject(build_header_mismatch(f"HTTP method must be {MCP_ENDPOINT_HTTP_METHOD}"))
  return _OK


def validate_accept(headers: HttpHeaders) -> HttpValidation:
  """Validate ``Accept`` lists both ``application/json`` and ``text/event-stream``.

  Each comma-separated media range is matched on its media type alone (any ``;q=``
  parameters are stripped), case-insensitively. (R-9.3.2-a, R-9.3.2-b)
  """
  raw = get_header(headers, ACCEPT_HEADER)
  value = raw.lower() if raw is not None else ""
  listed = [part.split(";")[0].strip() for part in value.split(",")]
  has_both = all(media in listed for media in ACCEPT_MEDIA_TYPES)
  if not has_both:
    return _reject(build_header_mismatch(f"Accept must list {' and '.join(ACCEPT_MEDIA_TYPES)}"))
  return _OK


# ─── MCP-Protocol-Version header (server) ──────────────────────────────────────


@dataclass(frozen=True)
class ProtocolVersionValidationOptions:
  """Options for :func:`validate_protocol_version_header`."""

  #: The protocol revisions this server implements.
  supported_versions: list[str]
  #: When ``True``, a request that omits the ``MCP-Protocol-Version`` header is treated
  #: as :attr:`earliest_revision` (a pre-header client) rather than rejected. (R-9.3.3-c)
  supports_pre_header_clients: bool = False
  #: The revision assumed for a header-less request when the above is ``True``.
  earliest_revision: str | None = None


@dataclass(frozen=True)
class ProtocolVersionResult:
  """Outcome of :func:`validate_protocol_version_header`.

  On success ``ok`` is ``True`` and ``version`` is the resolved revision; on failure
  ``ok`` is ``False`` and ``rejection`` carries the HTTP status + JSON-RPC error.
  """

  ok: bool
  version: str | None = None
  rejection: HttpRejection | None = None


def _body_protocol_version(body: object) -> str | None:
  """Read the body ``params._meta`` protocol-version field, or ``None``."""
  if not isinstance(body, dict):
    return None
  params = body.get("params")
  if not isinstance(params, dict):
    return None
  meta = params.get("_meta")
  if not isinstance(meta, dict):
    return None
  value = meta.get(PROTOCOL_VERSION_META_KEY)
  return value if isinstance(value, str) else None


def validate_protocol_version_header(
  headers: HttpHeaders,
  body: object,
  options: ProtocolVersionValidationOptions,
) -> ProtocolVersionResult:
  """Validate the ``MCP-Protocol-Version`` header against the body + supported revisions.

  (§9.3.3)

  * Absent header → reject ``400`` + ``-32001``, unless ``supports_pre_header_clients``
    is set, in which case the request is treated as ``earliest_revision``. (R-9.3.3-b,
    R-9.3.3-c)
  * Header ≠ body ``_meta`` protocolVersion → reject ``400`` + ``-32001``. (R-9.3.3-d)
  * Header valid but revision unimplemented → reject ``400`` + ``-32004``
    (``UnsupportedProtocolVersion``) naming ``supported``/``requested``. (R-9.3.3-e)
  """
  header = get_header(headers, MCP_PROTOCOL_VERSION_HEADER)

  if header is None:
    if options.supports_pre_header_clients and options.earliest_revision is not None:
      return ProtocolVersionResult(ok=True, version=options.earliest_revision)
    return ProtocolVersionResult(
      ok=False,
      rejection=build_header_mismatch(f"{MCP_PROTOCOL_VERSION_HEADER} header is required"),
    )

  body_version = _body_protocol_version(body)
  if body_version is not None and header != body_version:
    return ProtocolVersionResult(
      ok=False,
      rejection=build_header_mismatch(
        f'{MCP_PROTOCOL_VERSION_HEADER} "{header}" does not match body _meta '
        f'protocolVersion "{body_version}"'
      ),
    )

  if header not in options.supported_versions:
    error = build_unsupported_protocol_version_error(header, list(options.supported_versions))
    return ProtocolVersionResult(ok=False, rejection=HttpRejection(status=BAD_REQUEST_STATUS, error=error))

  return ProtocolVersionResult(ok=True, version=header)


# ─── Routing headers (server) ──────────────────────────────────────────────────


def validate_routing_headers(headers: HttpHeaders, body: object) -> HttpValidation:
  """Validate the ``Mcp-Method`` and ``Mcp-Name`` routing headers against the body. (§9.4)

  * ``Mcp-Method`` REQUIRED on every POST and MUST equal the body ``method`` verbatim,
    case-sensitively. (R-9.4-a, R-9.4.1-a)
  * ``Mcp-Name`` REQUIRED on ``tools/call``/``prompts/get`` (= ``params.name``) and
    ``resources/read`` (= ``params.uri``), and MUST NOT appear on other methods.
    (R-9.4.2-a … R-9.4.2-e)
  * Any mismatch or missing required routing header → ``400`` + ``-32001``. (R-9.4.3-a)
  """
  if not isinstance(body, dict):
    return _reject(build_header_mismatch("request body is not an object"))
  method = body.get("method")
  if not isinstance(method, str):
    return _reject(build_header_mismatch("request body has no method"))
  params = body.get("params")
  if not isinstance(params, dict):
    params = None

  mcp_method = get_header(headers, MCP_METHOD_HEADER)
  if mcp_method is None:
    return _reject(build_header_mismatch(f"{MCP_METHOD_HEADER} header is required"))
  # Values mirroring body fields are compared exactly (case-sensitively). (R-9.3-c)
  if mcp_method != method:
    return _reject(
      build_header_mismatch(f'{MCP_METHOD_HEADER} "{mcp_method}" does not match body method "{method}"')
    )

  mcp_name = get_header(headers, MCP_NAME_HEADER)
  if method_requires_mcp_name(method):
    expected = routing_name_for(method, params)
    if mcp_name is None:
      return _reject(build_header_mismatch(f"{MCP_NAME_HEADER} header is required for {method}"))
    if expected is None or mcp_name != expected:
      return _reject(build_header_mismatch(f'{MCP_NAME_HEADER} "{mcp_name}" does not match body for {method}'))
  elif mcp_name is not None:
    # Mcp-Name MUST NOT be sent for methods without a targeted name/URI. (R-9.4.2-e)
    return _reject(build_header_mismatch(f"{MCP_NAME_HEADER} MUST NOT be sent for {method}"))

  return _OK


# ─── Notification response shape (server) ──────────────────────────────────────


@dataclass(frozen=True)
class NotificationHttpResponse:
  """The HTTP response a server returns to a posted notification. (§9.2)

  ``body`` is present only on rejection; it is an id-less JSON-RPC error response.
  (R-9.2-i)
  """

  status: int
  body: dict | None = None


def notification_http_response(
  accepted: bool,
  rejection: dict | None = None,
) -> NotificationHttpResponse:
  """Build the HTTP response for a posted notification. (R-9.2-g, R-9.2-h, R-9.2-i)

  * accepted → ``202 Accepted`` with no body.
  * rejected → an HTTP error status (default ``400``); the body, if present, is a
    JSON-RPC error response with the ``id`` omitted.

  ``rejection`` (when given) is a mapping with a REQUIRED ``error`` object and an
  OPTIONAL ``status`` (defaults to ``400``), mirroring the TS rejection shape.
  """
  if accepted:
    return NotificationHttpResponse(status=NOTIFICATION_ACCEPTED_STATUS)
  if rejection is None:
    return NotificationHttpResponse(status=BAD_REQUEST_STATUS)
  status = rejection.get("status", BAD_REQUEST_STATUS)
  return NotificationHttpResponse(
    status=status,
    body={"jsonrpc": "2.0", "error": rejection["error"]},
  )
