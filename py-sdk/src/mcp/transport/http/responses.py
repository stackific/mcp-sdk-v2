"""Streamable HTTP: responses, status mapping & ``HeaderMismatch`` (§9.6–§9.12).

The response half of the Streamable HTTP transport, completing the request half
(:mod:`mcp.transport.http.headers`). For a well-formed POST whose body is a JSON-RPC
*request*, the server picks exactly one of two response shapes — a single JSON object
(§9.6.1) or a request-scoped Server-Sent Events stream (§9.6.2) — both delivered over
HTTP ``200 OK``. This module also owns:

* the full ``-32001`` ``HeaderMismatch`` error *object* and its HTTP ``400`` mapping,
  built on the ``HEADER_MISMATCH_CODE`` constant (§9.8);
* the JSON-RPC-error-code → HTTP-status mapping (§9.7), spanning the base codes
  (``-32700``/``-32600``/``-32601``/``-32602``/``-32603``) and the MCP server-range
  codes (``-32001``/``-32003``/``-32004``);
* statelessness helpers at the HTTP layer — no handshake, no session id, ``405`` for
  ``GET``/``DELETE``, ignored ``Last-Event-ID`` (§9.9);
* ``Origin``-validation and loopback-binding security helpers (§9.11);
* the backward-compatibility probe that distinguishes a modern server from a legacy
  HTTP+SSE server by inspecting status codes and error bodies (§9.12).

All numeric error codes are imported from :mod:`mcp.protocol.errors` (the Python SDK's
canonical home for the §22 registry); this module reuses — never redefines — them.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  PARSE_ERROR_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.transport.http.headers import (
  BAD_REQUEST_STATUS,
  NOTIFICATION_ACCEPTED_STATUS,
)

__all__ = [
  # re-exported codes / status
  "HEADER_MISMATCH_CODE",
  "BAD_REQUEST_STATUS",
  "NOTIFICATION_ACCEPTED_STATUS",
  "INVALID_REQUEST_CODE",
  "METHOD_NOT_FOUND_CODE",
  "INTERNAL_ERROR_CODE",
  "INVALID_PARAMS_CODE",
  "PARSE_ERROR_CODE",
  "UNSUPPORTED_PROTOCOL_VERSION_CODE",
  "MISSING_CLIENT_CAPABILITY_CODE",
  # status constants
  "OK_STATUS",
  "FORBIDDEN_STATUS",
  "NOT_FOUND_STATUS",
  "METHOD_NOT_ALLOWED_STATUS",
  "EVENT_STREAM_STATUS",
  # content types & stream headers
  "SINGLE_JSON_CONTENT_TYPE",
  "EVENT_STREAM_CONTENT_TYPE",
  "X_ACCEL_BUFFERING_HEADER",
  "X_ACCEL_BUFFERING_VALUE",
  "LAST_EVENT_ID_HEADER",
  "ORIGIN_HEADER",
  # response-shape selection
  "ResponseShape",
  "choose_response_shape",
  # response builders
  "HttpResponse",
  "build_single_json_response",
  "build_event_stream_headers",
  "format_sse_event",
  "validate_stream_message",
  "RequestEventStream",
  # header mismatch
  "build_header_mismatch_error",
  "build_header_mismatch_response",
  "HeaderMismatchCause",
  "header_mismatch_for_cause",
  # generic builders
  "build_error_response",
  "build_method_not_found_response",
  "build_notification_accepted_response",
  # status mapping
  "http_status_for_error_code",
  "REVISION_ERROR_CODES",
  # statelessness
  "is_session_id_header",
  "strip_ignored_stateless_headers",
  "ALLOWED_ENDPOINT_METHODS",
  "method_not_allowed_response",
  # security / binding
  "LOOPBACK_BIND_ADDRESS",
  "ALL_INTERFACES_BIND_ADDRESS",
  "recommended_local_bind_address",
  "validate_origin",
  "OriginValidation",
  "build_forbidden_origin_response",
  # backward compatibility
  "PostFallbackDecision",
  "interpret_post_for_fallback",
  "LEGACY_ENDPOINT_EVENT",
  "is_legacy_http_sse_server",
]

# ─── HTTP status constants (§9.7) ──────────────────────────────────────────────

#: HTTP status for a successfully handled request — both response shapes. (R-9.6-a)
OK_STATUS = 200
#: HTTP status when an ``Origin`` header is present and not accepted. (R-9.11-b)
FORBIDDEN_STATUS = 403
#: HTTP status for a request whose method the server does not implement. (R-9.7-b)
NOT_FOUND_STATUS = 404
#: HTTP status for a ``GET``/``DELETE`` at a this-transport-only endpoint. (R-9.9-f)
METHOD_NOT_ALLOWED_STATUS = 405


# ─── Response content types & stream headers (§9.6) ────────────────────────────

#: ``Content-Type`` of the single-JSON response shape. (R-9.6.1-a)
SINGLE_JSON_CONTENT_TYPE = "application/json"
#: ``Content-Type`` of the event-stream response shape. (R-9.6.2-a)
EVENT_STREAM_CONTENT_TYPE = "text/event-stream"
#: Response header name asking reverse proxies not to buffer SSE events. (R-9.6.2-g)
X_ACCEL_BUFFERING_HEADER = "X-Accel-Buffering"
#: Value paired with :data:`X_ACCEL_BUFFERING_HEADER` to disable buffering. (R-9.6.2-g)
X_ACCEL_BUFFERING_VALUE = "no"
#: The (ignored) resumption header; streams are never resumable. (R-9.6.2-h, R-9.9-g)
LAST_EVENT_ID_HEADER = "Last-Event-ID"
#: The ``Origin`` request header the server MUST validate. (R-9.11-a)
ORIGIN_HEADER = "Origin"


# ─── Response-shape selection (§9.6) ───────────────────────────────────────────


class ResponseShape(StrEnum):
  """The two ways a server MAY answer a JSON-RPC *request* body.

  Exactly one is chosen per request; both succeed with HTTP ``200 OK``. (R-9.6-a) A
  ``StrEnum`` (the SDK-wide idiom for finite string-enums, e.g. ``ErrorCodeClass``):
  each member still compares equal to its bare string for any caller passing it on the
  wire, while gaining iteration/membership/repr for free.
  """

  #: One HTTP ``200 OK`` + ``application/json`` carrying a single JSON-RPC response. (§9.6.1)
  SINGLE_JSON = "single-json"
  #: HTTP ``200 OK`` + ``text/event-stream``, a request-scoped SSE stream. (§9.6.2)
  EVENT_STREAM = "event-stream"


def choose_response_shape(emits_request_scoped_notifications: bool) -> str:
  """Pick the response shape for a JSON-RPC request body. (R-9.6-a, R-9.6.1-a, R-9.6.2-a)

  A server uses the single-JSON shape when it can produce the response without emitting
  any request-scoped notifications, and the event-stream shape when it intends to emit
  request-scoped notifications (progress, logging) before the final response.
  """
  return ResponseShape.EVENT_STREAM if emits_request_scoped_notifications else ResponseShape.SINGLE_JSON


# ─── Single JSON response (§9.6.1) ─────────────────────────────────────────────


@dataclass(frozen=True)
class HttpResponse:
  """A fully-formed HTTP response: status, headers, and an optional JSON body.

  ``body`` is absent (``None``) for empty-body responses (e.g. ``202``, ``405``).
  Header field names are written as-is and compared case-insensitively elsewhere.
  """

  status: int
  headers: dict[str, str] = field(default_factory=dict)
  body: object | None = None


def build_single_json_response(response: dict) -> HttpResponse:
  """Build the single-JSON response. (R-9.6.1-a)

  HTTP ``200 OK``, ``Content-Type: application/json``, and a body of exactly one
  JSON-RPC response whose ``id`` equals the request ``id`` (the caller is responsible
  for the id echo).
  """
  return HttpResponse(
    status=OK_STATUS,
    headers={"Content-Type": SINGLE_JSON_CONTENT_TYPE},
    body=response,
  )


# ─── Event-stream response (§9.6.2) ────────────────────────────────────────────


def build_event_stream_headers(include_accel_buffering: bool = True) -> dict[str, str]:
  """Build the response headers that open an event-stream response.

  HTTP ``200 OK`` with ``Content-Type: text/event-stream``, and — by default — the
  ``X-Accel-Buffering: no`` hint so reverse proxies deliver events immediately.
  (R-9.6.2-a, R-9.6.2-g)
  """
  headers: dict[str, str] = {"Content-Type": EVENT_STREAM_CONTENT_TYPE}
  if include_accel_buffering:
    headers[X_ACCEL_BUFFERING_HEADER] = X_ACCEL_BUFFERING_VALUE
  return headers


#: HTTP status that opens an event-stream response. (R-9.6.2-a)
EVENT_STREAM_STATUS = OK_STATUS


def format_sse_event(message: object) -> str:
  """Serialize one JSON-RPC message as a single SSE event. (R-9.6.2-a)

  A ``data:`` field carrying the message as JSON, terminated by a blank line. The
  result ends with ``\\n\\n`` — the trailing blank line is the event terminator the
  ``text/event-stream`` framing requires. JSON is emitted compactly (no inserted
  whitespace) so the wire form matches the TS ``JSON.stringify`` output. ``allow_nan=False``
  keeps a non-finite number off the wire — JSON has no ``NaN``/``Infinity`` (R-7.1-b).

  :raises ValueError: when ``message`` contains a non-finite number.
  """
  return f"data: {json.dumps(message, separators=(',', ':'), allow_nan=False)}\n\n"


@dataclass(frozen=True)
class StreamMessageValidation:
  """Outcome of :func:`validate_stream_message`: ``ok`` or a ``reason`` for rejection."""

  ok: bool
  reason: str | None = None


def validate_stream_message(message: object) -> StreamMessageValidation:
  """Validate that a message a server intends to write on the event stream is allowed.

  (R-9.6.2-c, R-9.6.2-d)

  Permitted: request-scoped *notifications* (a ``notifications/*`` whose ``params``
  relate to the originating request) and the final *response* (an object with ``id``
  plus ``result`` or ``error``). Forbidden: an independent JSON-RPC *request* (an
  object carrying both ``method`` and ``id``), which the server MUST NOT send here.
  """
  if not isinstance(message, dict):
    return StreamMessageValidation(ok=False, reason="stream message must be a JSON-RPC object")
  has_method = isinstance(message.get("method"), str)
  has_id = "id" in message
  # An independent request carries both `method` and `id`; that is forbidden. (R-9.6.2-d)
  if has_method and has_id:
    return StreamMessageValidation(
      ok=False,
      reason="a JSON-RPC request MUST NOT be sent on the response stream",
    )
  return StreamMessageValidation(ok=True)


# ─── Request-scoped event stream (server) ──────────────────────────────────────


class RequestEventStream:
  """A request-scoped event stream enforcing the §9.6.2 lifecycle.

  Only request-scoped notifications before the final response, the final response
  terminates the stream, and no message is sent after termination — whether the
  terminator is the final response or a client-initiated close (cancellation).
  (R-9.6.2-c, R-9.6.2-d, R-9.6.2-e, R-9.6.2-f, R-9.6.2-i, R-9.6.2-k)

  It is a thin, transport-agnostic state machine: ``sink`` receives each formatted SSE
  event string; how that string reaches the wire is the caller's concern.
  """

  def __init__(self, sink: Callable[[str], None]) -> None:
    """Create a stream whose formatted SSE events are delivered to ``sink``.

    :param sink: A callable receiving each formatted SSE event string to deliver on
      the wire.
    """
    self._sink = sink
    #: Whether the stream has been terminated (by final response or cancellation).
    self._closed = False
    #: True only when the terminator was the final response (not a client close).
    self._completed = False

  @property
  def closed(self) -> bool:
    """Whether the stream is closed (terminated)."""
    return self._closed

  @property
  def completed(self) -> bool:
    """Whether the stream closed by delivering its final response."""
    return self._completed

  def send_notification(self, notification: dict) -> None:
    """Emit a request-scoped notification before the final response. (R-9.6.2-b, R-9.6.2-c)

    :raises RuntimeError: when the message is not stream-legal (e.g. a request, or an
      object carrying an ``id``), or when the stream is already closed (R-9.6.2-f/k
      forbid further messages).
    """
    self._assert_open()
    check = validate_stream_message(notification)
    if not check.ok:
      raise RuntimeError(check.reason)
    if "id" in notification:
      raise RuntimeError("a notification MUST NOT carry an id")
    self._sink(format_sse_event(notification))

  def send_final_response(self, response: dict) -> None:
    """Send the final JSON-RPC response and terminate the stream. (R-9.6.2-e)

    After this, the server MUST NOT send further messages for the request (R-9.6.2-f);
    subsequent ``send_notification``/``send_final_response`` calls raise.
    """
    self._assert_open()
    self._sink(format_sse_event(response))
    self._closed = True
    self._completed = True

  def cancel_by_client_close(self) -> None:
    """Record that the client closed the stream before the final response.

    The server MUST treat this as cancellation of the request and MUST NOT send any
    further messages for it. (R-9.6.2-i, R-9.6.2-k) Idempotent.
    """
    self._closed = True

  def _assert_open(self) -> None:
    """Raise if the stream is closed; no further messages may be sent."""
    if self._closed:
      raise RuntimeError(
        "the response stream is closed; no further messages may be sent for this request"
      )


# ─── The `-32001` `HeaderMismatch` error object (§9.8) ─────────────────────────


def build_header_mismatch_error(
  message: str = "Header mismatch: HTTP headers do not match the request body",
  data: object = None,
) -> dict:
  """Build the full ``-32001`` ``HeaderMismatch`` JSON-RPC error *object*. (R-9.8-a)

  The code sits in the implementation-defined server-error range ``-32000``…``-32099``.
  ``data`` is included only when provided.
  """
  if data is None:
    return {"code": HEADER_MISMATCH_CODE, "message": message}
  return {"code": HEADER_MISMATCH_CODE, "message": message, "data": data}


def build_header_mismatch_response(error: dict, request_id: object = None) -> HttpResponse:
  """Wrap an error object into a ``400 Bad Request`` HTTP response carrying a JSON-RPC
  error body. (R-9.8-a, §9.7)

  ``request_id`` is the originating request id, when known; omitted otherwise.
  """
  return build_error_response(BAD_REQUEST_STATUS, error, request_id)


@dataclass(frozen=True)
class HeaderMismatchCause:
  """A structured description of one of the four conditions that MUST produce ``-32001``.

  (R-9.8-b/c/d) ``kind`` is one of ``"missing-required-header"``, ``"value-mismatch"``,
  or ``"invalid-param-characters"``; the remaining fields carry the offending header
  name and (for a value mismatch) the disagreeing values.
  """

  kind: str
  header: str
  header_value: str | None = None
  body_value: str | None = None


def header_mismatch_for_cause(cause: HeaderMismatchCause) -> dict:
  """Build a ``-32001`` ``HeaderMismatch`` error object from a structured cause.

  Produces a descriptive message for each of the conditions §9.8 enumerates.
  (R-9.8-b, R-9.8-c, R-9.8-d)
  """
  if cause.kind == "missing-required-header":
    return build_header_mismatch_error(f"Header mismatch: required header {cause.header} is missing")
  if cause.kind == "value-mismatch":
    return build_header_mismatch_error(
      f"Header mismatch: {cause.header} header value '{cause.header_value}' does not match "
      f"body value '{cause.body_value}'"
    )
  if cause.kind == "invalid-param-characters":
    return build_header_mismatch_error(
      f"Header mismatch: {cause.header} header value contains invalid characters"
    )
  raise ValueError(f"unknown HeaderMismatchCause kind: {cause.kind!r}")


# ─── Generic error & success response builders (§9.7) ──────────────────────────


def build_error_response(status: int, error: dict, request_id: object = None) -> HttpResponse:
  """Wrap any JSON-RPC error object into an HTTP response carrying a JSON-RPC error body.

  (§9.7) Used for ``400``/``404``/``403`` bodies. ``request_id`` is omitted when it
  cannot be determined (an unparseable body or an ``Origin``-rejected request).
  """
  if request_id is None:
    body: dict = {"jsonrpc": "2.0", "error": error}
  else:
    body = {"jsonrpc": "2.0", "id": request_id, "error": error}
  return HttpResponse(status=status, headers={"Content-Type": SINGLE_JSON_CONTENT_TYPE}, body=body)


def build_method_not_found_response(method: str, request_id: object = None) -> HttpResponse:
  """Build the ``404 Not Found`` for an unimplemented method. (R-9.7-b)

  It ALWAYS carries a JSON-RPC error body with code ``-32601``, which distinguishes an
  MCP endpoint from a host ``404`` that does not serve the endpoint at all.
  """
  return build_error_response(
    NOT_FOUND_STATUS,
    {"code": METHOD_NOT_FOUND_CODE, "message": f"Method not found: {method}"},
    request_id,
  )


def build_notification_accepted_response() -> HttpResponse:
  """Build the ``202 Accepted`` (empty body) acknowledgement of a notification POST. (§9.7)"""
  return HttpResponse(status=NOTIFICATION_ACCEPTED_STATUS, headers={})


# ─── JSON-RPC-error-code → HTTP-status mapping (§9.7) ──────────────────────────


def http_status_for_error_code(code: int) -> int:
  """Map a JSON-RPC error ``code`` to the HTTP status it rides on. (§9.7)

  * ``-32601`` (``Method not found``)          → ``404 Not Found`` (R-9.7-b)
  * every other error code                     → ``400 Bad Request`` (the
    transport-boundary default for a JSON-RPC error body)

  ``200``/``202``/``403``/``405`` are not error-body conditions and are produced by
  their dedicated builders, not by this code-driven map.
  """
  return NOT_FOUND_STATUS if code == METHOD_NOT_FOUND_CODE else BAD_REQUEST_STATUS


#: The JSON-RPC error codes a *modern* server returns with HTTP ``400`` at the transport
#: boundary — the codes a dual-revision client MUST recognize before deciding to fall
#: back. (§9.12) ``HeaderMismatch`` (``-32001``), ``MissingRequiredClientCapability``
#: (``-32003``), ``UnsupportedProtocolVersion`` (``-32004``), and the base validation codes.
REVISION_ERROR_CODES: frozenset[int] = frozenset(
  {
    HEADER_MISMATCH_CODE,
    MISSING_CLIENT_CAPABILITY_CODE,
    UNSUPPORTED_PROTOCOL_VERSION_CODE,
    PARSE_ERROR_CODE,
    INVALID_REQUEST_CODE,
    METHOD_NOT_FOUND_CODE,
    INVALID_PARAMS_CODE,
  }
)


# ─── Statelessness at the HTTP layer (§9.9) ────────────────────────────────────

#: Header names commonly used by *other* bindings to carry a session identifier.
_SESSION_ID_HEADER_NAMES: tuple[str, ...] = ("mcp-session-id", "x-session-id", "session-id")


def is_session_id_header(name: str) -> bool:
  """Return ``True`` when ``name`` is a session-identifier header this transport MUST
  NOT use; the server MUST ignore any such header a client sends. (R-9.9-b, R-9.9-c,
  R-9.9-d) Comparison is case-insensitive.
  """
  return name.lower() in _SESSION_ID_HEADER_NAMES


def strip_ignored_stateless_headers(headers: dict[str, str]) -> dict[str, str]:
  """Strip any session-identifier and ``Last-Event-ID`` headers from a request.

  Realises the rule that the server MUST ignore them — no session affinity, no
  resumption. (R-9.9-d, R-9.9-g, R-9.6.2-h) The input is not mutated; a copy with the
  ignored headers removed is returned.
  """
  out: dict[str, str] = {}
  for key, value in headers.items():
    if is_session_id_header(key) or key.lower() == LAST_EVENT_ID_HEADER.lower():
      continue
    out[key] = value
  return out


#: The HTTP methods this transport handles at the MCP endpoint. (§9.2, §9.9)
ALLOWED_ENDPOINT_METHODS: frozenset[str] = frozenset({"POST"})


def method_not_allowed_response(http_method: str) -> HttpResponse | None:
  """Return a ``405 Method Not Allowed`` response (empty body) for an HTTP ``GET`` or
  ``DELETE`` at the MCP endpoint, or ``None`` for ``POST``. (R-9.9-f)

  ``http_method`` is matched case-insensitively.
  """
  if http_method.upper() in ALLOWED_ENDPOINT_METHODS:
    return None
  return HttpResponse(status=METHOD_NOT_ALLOWED_STATUS, headers={})


# ─── Security & endpoint binding (§9.11) ───────────────────────────────────────

#: The loopback interface a locally-run server SHOULD bind to. (R-9.11-d)
LOOPBACK_BIND_ADDRESS = "127.0.0.1"
#: The all-interfaces address a local server SHOULD avoid binding to. (R-9.11-d)
ALL_INTERFACES_BIND_ADDRESS = "0.0.0.0"


def recommended_local_bind_address() -> str:
  """Return the address a locally-run server SHOULD bind its MCP endpoint to: the
  loopback interface, never all interfaces. (R-9.11-d)
  """
  return LOOPBACK_BIND_ADDRESS


@dataclass(frozen=True)
class OriginValidation:
  """Outcome of :func:`validate_origin`.

  ``accepted`` is ``True`` when the ``Origin`` is absent or in the accepted set; when
  ``False`` the rejected :attr:`origin` is carried for diagnostics.
  """

  accepted: bool
  origin: str | None = None


def validate_origin(origin: str | None, accepted_origins) -> OriginValidation:
  """Validate the ``Origin`` header against the server's accepted-origin set, defending
  against DNS-rebinding. (R-9.11-a, R-9.11-b)

  When the ``Origin`` header is *present and not accepted*, the request MUST be rejected
  (``accepted=False``). When ``Origin`` is absent or in the accepted set, it passes.
  Matching is exact against the configured origins.

  :param origin: The request's ``Origin`` header value, or ``None``.
  :param accepted_origins: The origins the server is configured to accept (any iterable).
  """
  if origin is None:
    return OriginValidation(accepted=True)
  allow = accepted_origins if isinstance(accepted_origins, (set, frozenset)) else set(accepted_origins)
  if origin in allow:
    return OriginValidation(accepted=True)
  return OriginValidation(accepted=False, origin=origin)


def build_forbidden_origin_response(
  message: str = "Origin not permitted",
  include_body: bool = True,
) -> HttpResponse:
  """Build the ``403 Forbidden`` response for a rejected ``Origin``. (R-9.7-a, R-9.11-b, R-9.11-c)

  The body MAY carry a JSON-RPC error response *with no ``id``*; pass
  ``include_body=False`` to omit it entirely.
  """
  if not include_body:
    return HttpResponse(status=FORBIDDEN_STATUS, headers={})
  # The body, when present, MUST carry no `id`. (R-9.11-c)
  body = {"jsonrpc": "2.0", "error": {"code": INVALID_REQUEST_CODE, "message": message}}
  return HttpResponse(
    status=FORBIDDEN_STATUS,
    headers={"Content-Type": SINGLE_JSON_CONTENT_TYPE},
    body=body,
  )


# ─── Backward compatibility (§9.12) ────────────────────────────────────────────


def _is_recognized_revision_error(body: object) -> bool:
  """Return ``True`` when ``body`` is a recognized JSON-RPC error object of this revision."""
  if not isinstance(body, dict):
    return False
  error = body.get("error")
  if not isinstance(error, dict):
    return False
  code = error.get("code")
  return isinstance(code, int) and not isinstance(code, bool) and code in REVISION_ERROR_CODES


@dataclass(frozen=True)
class PostFallbackDecision:
  """The decision a dual-revision client makes after a modern POST. (§9.12)

  ``action`` is one of:

  * ``"retry"``       — the body is a recognized error of this revision; the client
    MUST retry (using ``supported`` if present) and MUST NOT fall back to
    ``initialize``. (R-9.12-c, R-9.12-d)
  * ``"proceed"``     — a non-``400`` success/continuation; nothing to fall back from.
  * ``"legacy-probe"`` — the status is ``400``/``404``/``405`` and the body is not a
    recognized revision error; the client SHOULD issue a ``GET`` to detect the
    deprecated HTTP+SSE transport. (R-9.12-b, R-9.12-e, R-9.12-g)
  """

  action: str
  supported: list[str] | None = None


def interpret_post_for_fallback(status: int, body: object) -> PostFallbackDecision:
  """Interpret the outcome of a modern POST for a client that also supports an earlier
  ``initialize``-handshake revision. (R-9.12-a … R-9.12-e, R-9.12-g)

  On a ``400``, the client SHOULD inspect the body before falling back, because a modern
  server returns ``400`` for ``-32004``/``-32003``/``-32001``. A recognized revision
  error means retry, never fall back. An empty/unrecognized body on a ``400``/``404``/
  ``405`` means the client SHOULD probe for the legacy transport.
  """
  if _is_recognized_revision_error(body):
    # _is_recognized_revision_error already proved body is a dict whose `error` is a dict.
    data = body["error"].get("data")
    supported = None
    if isinstance(data, dict) and isinstance(data.get("supported"), list):
      supported = list(data["supported"])
    return PostFallbackDecision(action="retry", supported=supported)
  if status in (BAD_REQUEST_STATUS, NOT_FOUND_STATUS, METHOD_NOT_ALLOWED_STATUS):
    # Empty or unrecognized body on a failing status → probe for legacy transport. (R-9.12-e, R-9.12-g)
    return PostFallbackDecision(action="legacy-probe")
  return PostFallbackDecision(action="proceed")


#: The SSE event name that, as the first event of a ``GET`` stream, marks the legacy
#: transport. (R-9.12-h)
LEGACY_ENDPOINT_EVENT = "endpoint"


def is_legacy_http_sse_server(first_event_name: str | None) -> bool:
  """Interpret the first event of the SSE stream a fallback ``GET`` opens. (R-9.12-h)

  Returns ``True`` when the first event is an ``endpoint`` event, in which case the
  client SHOULD treat the server as running the deprecated HTTP+SSE transport and use
  that transport for subsequent communication.
  """
  return first_event_name == LEGACY_ENDPOINT_EVENT
