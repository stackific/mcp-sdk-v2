"""Streamable HTTP client transport (MCP 2026-07-28, §9) — stateless, streaming.

POSTs one JSON-RPC request to the single MCP endpoint and returns the correlated
final response, transparently handling both server response shapes (§9.6):

* a single ``application/json`` body → returned directly (§9.6.1);
* a ``text/event-stream`` → each interim frame (request-scoped notifications, and
  any server→client request) is surfaced via the ``on_message`` tap, and the final
  response (matching the request id) is returned (§9.6.2).

It mirrors the body's ``_meta`` revision into ``MCP-Protocol-Version`` and sets the
required ``Accept`` + routing headers (``Mcp-Method`` / ``Mcp-Name``, §9.4) using the
shared :func:`mcp.transport.http.headers.build_post_headers` framing helper. For a
``tools/call`` an optional :meth:`set_param_header_resolver` derives the per-parameter
``Mcp-Param-*`` routing headers from the tool's ``x-mcp-header`` annotations (§9.5.2).
Extra static ``headers`` (e.g. a tracing header) are merged into every POST, and an
optional ``auth_provider`` supplies a fresh bearer token per POST for a protected
resource (§23.8).

Failures are never silently dropped (R-7.2-q): a network channel failure raises
:class:`~mcp.client.transport.ClientTransportError`, but every *protocol* failure that
can be correlated to the request id — an HTTP error status, a non-JSON or non-object
body, a malformed final frame, or a stream that ends before the final response — is
delivered as a transport-synthesized JSON-RPC error response (``-32603``) so an
awaiting request surfaces a ``RequestError`` instead of hanging. Inbound parsing faults
that cannot be correlated (a malformed interim SSE frame) are reported to the
``on_error`` observers and the stream continues.

Notifications and the client's replies to server→client requests are POSTed and expect
``202`` (§9.2); a non-2xx raises :class:`ClientTransportError`. ``open_subscription``
reads a long-lived ``subscriptions/listen`` stream on a background thread (§10). A clean
:meth:`close` is observable via :meth:`on_close` and blocks every further send.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Callable, Iterator

import httpx

from mcp.client.transport import ClientTransport, ClientTransportError
from mcp.jsonrpc.framing import MalformedMessageError, classify_message
from mcp.protocol.errors import INTERNAL_ERROR_CODE
from mcp.protocol.meta import CURRENT_PROTOCOL_VERSION, PROTOCOL_VERSION_META_KEY
from mcp.transport.http.headers import (
  ACCEPT_HEADER,
  ACCEPT_MEDIA_TYPES,
  CONTENT_TYPE_HEADER,
  CONTENT_TYPE_JSON,
  MCP_PROTOCOL_VERSION_HEADER,
  BuildPostHeadersOptions,
  build_post_headers,
)

#: Resolves the ``Mcp-Param-*`` routing headers for an outgoing request (§9.5.2).
ParamHeaderResolver = Callable[[str, "dict | None"], "dict[str, str]"]


# ─── Inbound frame parsing ─────────────────────────────────────────────────────

def _iter_sse(response: httpx.Response) -> Iterator[dict]:
  """Yield each JSON-RPC frame parsed from an SSE response's ``data:`` events.

  Each ``text/event-stream`` event is a run of lines terminated by a blank line; the
  joined ``data:`` payload of an event carries exactly one JSON-RPC message (§9.6.2). A
  single optional leading space after ``data:`` is stripped per the SSE grammar; comment
  (``:``) and other fields (``event:``/``id:``/``retry:``) are irrelevant to framing. A
  frame whose payload is not valid JSON is yielded as the :class:`ValueError` it raised
  so the caller can report it without aborting the stream.
  """
  data_lines: list[str] = []

  def flush() -> Iterator[dict | ValueError]:
    nonlocal data_lines
    if not data_lines:
      return
    payload = "\n".join(data_lines)
    data_lines = []
    try:
      yield json.loads(payload)
    except ValueError as exc:
      yield exc

  for line in response.iter_lines():
    if line == "":
      yield from flush()
      continue
    if line.startswith(":"):
      continue  # comment / keep-alive
    if line.startswith("data:"):
      rest = line[5:]
      data_lines.append(rest[1:] if rest.startswith(" ") else rest)
    # event:/id:/retry: fields are irrelevant to JSON-RPC framing.
  yield from flush()


def _is_final_response(frame: object, request_id: object) -> bool:
  """Return ``True`` when ``frame`` is the final response (result|error) for ``request_id``.

  The id must match on both JSON type and value — type coercion MUST NOT be applied, so
  ``"1"`` never matches ``1`` (R-3.2-e/-f/-g, mirroring TS ``isFinalResponseFor``).
  """
  if not isinstance(frame, dict):
    return False
  fid = frame.get("id")
  same_id = type(fid) is type(request_id) and fid == request_id
  return same_id and ("result" in frame or "error" in frame)


def _synthetic_error_response(request_id: object, message: str, data: object = None) -> dict:
  """Build a transport-synthesized error response so an awaiting request never hangs.

  Mirrors the TS ``syntheticErrorResponse``: a JSON-RPC error envelope echoing
  ``request_id`` with the standard "Internal error" code (``-32603``). (R-7.2-q)
  """
  error: dict = {"code": INTERNAL_ERROR_CODE, "message": message}
  if data is not None:
    error["data"] = data
  return {"jsonrpc": "2.0", "id": request_id, "error": error}


def _coerce_inbound(body: object, request_id: object) -> dict:
  """Ensure a single-JSON response body carries the request id so it can be correlated.

  Mirrors the TS ``coerceInbound``: an object body missing an ``id`` on a result/error
  is stamped with ``request_id``; a non-object body becomes a synthesized error. (§9.6.1)
  """
  if isinstance(body, dict):
    if body.get("id") is None and ("result" in body or "error" in body):
      body["id"] = request_id
    return body
  return _synthetic_error_response(request_id, "response body was not a JSON object")


# ─── Subscription handle ───────────────────────────────────────────────────────

class SubscriptionStream:
  """A handle to a background ``subscriptions/listen`` stream (§10)."""

  def __init__(self, thread: threading.Thread, closed: threading.Event) -> None:
    self._thread = thread
    self.closed = closed


# ─── The transport ─────────────────────────────────────────────────────────────

class StreamableHttpClientTransport(ClientTransport):
  """A stateless, streaming Streamable HTTP client transport for a single MCP endpoint."""

  def __init__(
    self,
    url: str,
    *,
    protocol_version: str = CURRENT_PROTOCOL_VERSION,
    timeout: float = 120.0,
    auth_provider: Callable[[], str | None] | None = None,
    headers: dict[str, str] | None = None,
  ) -> None:
    self._url = url
    #: Header protocol revision for bodies without their own ``_meta`` version. (§9.3.3)
    self._protocol_version = protocol_version
    self._auth_provider = auth_provider
    #: Extra static headers merged into every POST (e.g. a tracing header).
    self._extra_headers: dict[str, str] = dict(headers or {})
    self._client = httpx.Client(timeout=httpx.Timeout(timeout, read=None))
    self._on_message: Callable[[dict], None] | None = None
    #: Error observers, notified for an inbound fault that cannot be correlated to an id.
    self._error_handlers: list[Callable[[ClientTransportError], None]] = []
    #: Close observers, notified once with ``{"clean": True, "reason"?: str}``.
    self._close_handlers: list[Callable[[dict], None]] = []
    #: Resolves ``Mcp-Param-*`` headers for an outgoing request (set by the Client). (§9.5.2)
    self._param_header_resolver: ParamHeaderResolver | None = None
    self._closed = False

  @property
  def closed(self) -> bool:
    """Return ``True`` once :meth:`close` has run."""
    return self._closed

  # ── Observers ──────────────────────────────────────────────────────────────

  def set_on_message(self, callback: Callable[[dict], None] | None) -> None:
    """Install a tap invoked with every inbound frame (interim + final). Used for the wire view."""
    self._on_message = callback

  def on_error(self, handler: Callable[[ClientTransportError], None]) -> Callable[[], None]:
    """Register an error observer for an inbound fault that cannot be correlated to a request id
    (e.g. a malformed interim SSE frame). Returns an unsubscribe callable. Mirrors TS ``onError``.
    """
    self._error_handlers.append(handler)

    def unsubscribe() -> None:
      try:
        self._error_handlers.remove(handler)
      except ValueError:
        pass

    return unsubscribe

  def on_close(self, handler: Callable[[dict], None]) -> Callable[[], None]:
    """Register a close observer invoked once with the close info on :meth:`close`. Returns an
    unsubscribe callable. Mirrors TS ``onClose``; the info is ``{"clean": True, "reason"?: str}``.
    """
    self._close_handlers.append(handler)

    def unsubscribe() -> None:
      try:
        self._close_handlers.remove(handler)
      except ValueError:
        pass

    return unsubscribe

  def set_param_header_resolver(self, resolver: ParamHeaderResolver | None) -> None:
    """Install a resolver that derives the ``Mcp-Param-*`` routing headers for an outgoing
    request from its method + params (§9.5.2). The :class:`~mcp.client.client.Client` sets this
    using the ``x-mcp-header`` annotations it learns from ``tools/list``. Mirrors TS
    ``setParamHeaderResolver``.
    """
    self._param_header_resolver = resolver

  def _emit(self, frame: dict) -> None:
    if self._on_message is not None:
      try:
        self._on_message(frame)
      except Exception:  # noqa: BLE001 — a tap must never break the transport
        pass

  def _report_error(self, message: str) -> None:
    """Notify every error observer; an observer that raises must not break error fan-out."""
    error = ClientTransportError(message)
    for handler in list(self._error_handlers):
      try:
        handler(error)
      except Exception:  # noqa: BLE001 — an error observer must not break error fan-out
        pass

  # ── Header construction ──────────────────────────────────────────────────────

  def _headers(self, message: dict) -> dict[str, str]:
    """Build the HTTP headers for one POST.

    Requests and notifications carry the method/name routing headers via the shared
    :func:`build_post_headers` helper; for a request the installed param-header resolver
    derives the ``Mcp-Param-*`` headers (§9.5.2). A response (no ``method``) carries only the
    minimal required set. The body ``_meta`` protocol version, when present, takes precedence
    over the transport default so header and body agree (§9.3.3). Extra static headers and a
    bearer token are then merged on top.
    """
    method = message.get("method")
    params = message.get("params")
    params = params if isinstance(params, dict) else None
    meta = (params or {}).get("_meta") or {}
    body_version = meta.get(PROTOCOL_VERSION_META_KEY)
    version = body_version if isinstance(body_version, str) else self._protocol_version

    if isinstance(method, str):
      is_request = "id" in message
      param_headers = None
      if is_request and self._param_header_resolver is not None:
        try:
          param_headers = self._param_header_resolver(method, params)
        except Exception:  # noqa: BLE001 — a resolver fault must not block the POST
          param_headers = None
      headers = build_post_headers(
        BuildPostHeadersOptions(
          protocol_version=version,
          method=method,
          params=params,
          param_headers=param_headers,
        )
      )
    else:
      # A response carries no method/name to route on; send the minimal required set.
      headers = {
        CONTENT_TYPE_HEADER: CONTENT_TYPE_JSON,
        ACCEPT_HEADER: ", ".join(ACCEPT_MEDIA_TYPES),
        MCP_PROTOCOL_VERSION_HEADER: version,
      }

    headers.update(self._extra_headers)
    if self._auth_provider is not None:
      token = self._auth_provider()
      if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

  # ── Outbound: request → final response ───────────────────────────────────────

  def request(self, message: dict) -> dict:
    """POST a request; return its final response (reading an SSE stream when present).

    Both §9.6 response shapes are handled. Every protocol failure that can be correlated
    to the request id is returned as a synthesized ``-32603`` error response rather than
    raised, so an awaiting caller surfaces it as a ``RequestError`` instead of hanging
    (R-7.2-q); only a network channel failure raises :class:`ClientTransportError`.

    :raises ClientTransportError: when the transport is closed, the message is malformed,
      or the network channel fails.
    """
    if self._closed:
      raise ClientTransportError("transport is closed")
    self._reject_malformed(message)

    headers = self._headers(message)
    request_id = message.get("id")
    try:
      with self._client.stream("POST", self._url, headers=headers, content=json.dumps(message, allow_nan=False)) as response:
        content_type = (response.headers.get("content-type") or "").lower()
        is_event_stream = "text/event-stream" in content_type

        # A non-2xx, non-stream response is an HTTP error: deliver a correlated frame. (§9.7)
        if response.status_code // 100 != 2 and not is_event_stream:
          return self._deliver_http_error(response, request_id)

        if is_event_stream:
          return self._pump_event_stream(response, request_id)

        body = response.read()
    except httpx.HTTPError as exc:
      raise ClientTransportError(f"transport failure contacting {self._url}: {exc}") from exc

    # Single JSON response (§9.6.1).
    try:
      parsed = json.loads(body.decode("utf-8"))
    except ValueError:
      result = _synthetic_error_response(request_id, "response body was not valid JSON")
      self._emit(result)
      return result
    result = _coerce_inbound(parsed, request_id)
    self._emit(result)
    return result

  def _deliver_http_error(self, response: httpx.Response, request_id: object) -> dict:
    """Turn an HTTP error status into a delivered JSON-RPC error response for ``request_id``.

    Echoes the server's JSON-RPC error/result body when present (stamping the id if the
    server omitted it for correlation); otherwise synthesizes a ``-32603`` carrying the
    status. Mirrors the TS ``deliverHttpError``. (§9.7)
    """
    try:
      body: object = json.loads(response.read().decode("utf-8"))
    except (ValueError, httpx.HTTPError):
      body = None
    if isinstance(body, dict) and ("error" in body or "result" in body):
      if body.get("id") is None:
        body["id"] = request_id
      self._emit(body)
      return body
    result = _synthetic_error_response(request_id, f"HTTP {response.status_code}", body)
    self._emit(result)
    return result

  def _pump_event_stream(self, response: httpx.Response, request_id: object) -> dict:
    """Read an SSE stream, surfacing each frame; synthesize a failure if it ends early.

    Each interim frame (request-scoped notification, server→client request) is surfaced via
    the ``on_message`` tap; the final response (matching ``request_id``) is returned. A
    malformed *interim* frame is reported to the error observers and skipped (the stream
    continues); a stream that ends before the final response yields a synthesized ``-32603``
    so the caller never hangs (R-7.2-q). Mirrors the TS ``pumpEventStream``. (§9.6.2)
    """
    final: dict | None = None
    try:
      for frame in _iter_sse(response):
        if isinstance(frame, ValueError):
          self._report_error(f"malformed SSE data frame: {frame}")
          continue
        self._emit(frame)
        if _is_final_response(frame, request_id):
          final = frame
    except httpx.HTTPError as exc:
      if final is None:
        result = _synthetic_error_response(request_id, f"event stream interrupted: {exc}")
        self._emit(result)
        return result
      return final
    if final is not None:
      return final
    result = _synthetic_error_response(request_id, "event stream closed before the final response")
    self._emit(result)
    return result

  # ── Outbound: notification / client→server response ──────────────────────────

  def send(self, message: dict) -> None:
    """POST a notification or a client→server response; expect ``202`` (body ignored). (§9.2)

    :raises ClientTransportError: when the transport is closed, the message is malformed, the
      network channel fails, or the server answers with a non-2xx status.
    """
    if self._closed:
      raise ClientTransportError("transport is closed")
    self._reject_malformed(message)

    headers = self._headers(message)
    try:
      response = self._client.post(self._url, headers=headers, content=json.dumps(message, allow_nan=False))
    except httpx.HTTPError as exc:
      raise ClientTransportError(f"transport failure contacting {self._url}: {exc}") from exc
    if response.status_code // 100 != 2:
      raise ClientTransportError(f"POST rejected with HTTP {response.status_code}")

  def _reject_malformed(self, message: dict) -> None:
    """Refuse to send a structurally malformed JSON-RPC message. Mirrors the TS guard that
    classifies the message before the POST so a framing fault surfaces to the caller rather
    than being put on the wire.

    :raises ClientTransportError: when ``message`` is not a well-formed JSON-RPC message.
    """
    try:
      classify_message(message)
    except MalformedMessageError as exc:
      raise ClientTransportError(f"refusing to send a malformed message: {exc.reason}") from exc

  # ── Subscriptions (§10) ──────────────────────────────────────────────────────

  def open_subscription(self, message: dict, on_ready: Callable[[], None]) -> SubscriptionStream:
    """Open a long-lived ``subscriptions/listen`` stream on a background thread (§10).

    Every frame (the acknowledgement and each change notification) is surfaced via the
    ``on_message`` tap; a malformed frame is reported to the error observers and skipped.
    ``on_ready`` is invoked once the stream is established. The returned handle's ``closed``
    event is set when the stream ends (teardown / disconnect).

    :raises ClientTransportError: when the transport is closed or the message is malformed.
    """
    if self._closed:
      raise ClientTransportError("transport is closed")
    self._reject_malformed(message)

    headers = self._headers(message)
    closed = threading.Event()

    def run() -> None:
      try:
        on_ready()
        with self._client.stream("POST", self._url, headers=headers, content=json.dumps(message, allow_nan=False)) as response:
          for frame in _iter_sse(response):
            if isinstance(frame, ValueError):
              self._report_error(f"malformed SSE data frame: {frame}")
              continue
            self._emit(frame)
      except httpx.HTTPError:
        pass
      finally:
        closed.set()

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return SubscriptionStream(thread, closed)

  # ── Lifecycle ────────────────────────────────────────────────────────────────

  def close(self, reason: str | None = None) -> None:
    """Release the underlying HTTP connection pool and notify close observers once.

    Idempotent: a second call is a no-op. Every subsequent :meth:`request`/:meth:`send`/
    :meth:`open_subscription` raises :class:`ClientTransportError`. The close info delivered
    to :meth:`on_close` observers is ``{"clean": True, "reason"?: reason}``. Mirrors the TS
    ``close``.
    """
    if self._closed:
      return
    self._closed = True
    self._client.close()
    info: dict = {"clean": True}
    if reason is not None:
      info["reason"] = reason
    for handler in list(self._close_handlers):
      try:
        handler(info)
      except Exception:  # noqa: BLE001 — a close observer must not break the close path
        pass
