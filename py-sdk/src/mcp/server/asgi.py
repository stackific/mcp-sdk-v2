"""Async (ASGI) Streamable HTTP server handler with full §9 streaming (MCP 2026-07-28).

:func:`create_asgi_mcp_handler` returns an ``async (Request) -> Response`` callable
(Starlette ``Request``/``Response``) that serves an
:class:`~mcp.server.server.McpServer` over **stateless** Streamable HTTP with every
response shape the spec allows:

* ``POST`` initialize / read-only request → single ``application/json`` response.
* ``POST`` ``tools/call`` (or any streaming request) → *lazy-commit*: a single JSON
  response when the handler emits nothing, otherwise a ``text/event-stream`` of
  request-scoped notifications (progress / logging) followed by the final response.
* ``POST`` ``subscriptions/listen`` → a long-lived ``text/event-stream`` carrying the
  acknowledgement and the honored change notifications (§10).
* ``POST`` notification → ``202 Accepted`` (``notifications/cancelled`` aborts an
  in-flight request and tears down a matching subscription).
* ``POST`` a client response → ``202 Accepted`` (routed to an awaiting server→client
  request, when used).

Statelessness (§9.9): no ``Mcp-Session-Id``. A server→client request is correlated by
JSON-RPC id alone. The required request headers (§9.3), routing headers (§9.4), and the
per-request ``_meta`` envelope (§4.3) are validated before dispatch; ``initialize`` is
exempt from the ``_meta`` gate (the legacy handshake), and an optional bearer
``auth_gate`` and DNS-rebinding ``Origin`` check guard a protected resource (§9.11/§23).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import ClientDisconnect, Request
from starlette.responses import Response, StreamingResponse

from mcp.jsonrpc.framing import MalformedMessageError, classify_message
from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  PARSE_ERROR_CODE,
  build_error_object,
)
from mcp.protocol.meta import (
  CURRENT_PROTOCOL_VERSION,
  validate_request_meta,
)
from mcp.protocol.security import DEFAULT_INPUT_BOUNDS
from mcp.protocol.revision import MCP_PROTOCOL_VERSION_HEADER
from mcp.protocol.streaming import (
  SUBSCRIPTION_ID_META_KEY,
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  SUBSCRIPTIONS_LISTEN_METHOD,
  Subscription,
)
from mcp.protocol.tasks import is_tasks_active_for_request, task_subscription_requires_capability
from mcp.protocol.tasks import build_tasks_missing_capability_error
from mcp.server.server import CancelSignal, McpServer, ServerError, ServerRequestContext
from mcp.transport.http.headers import (
  ProtocolVersionValidationOptions,
  validate_accept,
  validate_content_type,
  validate_protocol_version_header,
  validate_routing_headers,
)
from mcp.transport.http.param_headers import validate_param_headers

#: A bearer/auth gate: given the request, returns a verdict dict — either
#: ``{"ok": True, "authInfo": ...}`` or
#: ``{"ok": False, "status": int, "wwwAuthenticate"?: str, "body": dict}``.
AuthGate = Callable[[Request], dict]

#: Sentinel placed on a stream's queue to signal "no more messages".
_SENTINEL = object()


def _sse(message: Any) -> str:
  """Serialize one JSON-RPC message as a single SSE event (``data:`` + blank line).

  ``allow_nan=False`` keeps a non-finite number (``NaN``/``Infinity``) off the wire — JSON
  has no such value, so this raises rather than emitting an invalid bare token. (R-7.1-b)
  """
  return f"data: {json.dumps(message, allow_nan=False)}\n\n"


def _http_status_for_error_code(code: int) -> int:
  """Map a single-response JSON-RPC error code to its HTTP status (§9.7)."""
  return 404 if code == METHOD_NOT_FOUND_CODE else 400


def create_asgi_mcp_handler(
  server: McpServer,
  *,
  path: str = "/mcp",
  cors: str | None = "*",
  auth_gate: AuthGate | None = None,
  allowed_origins: set[str] | None = None,
  max_request_bytes: int = DEFAULT_INPUT_BOUNDS.max_payload_bytes,
) -> Callable[[Request], Awaitable[Response]]:
  """Build an async Streamable HTTP handler for ``server`` (see module docstring)."""
  # Cross-request state held in the handler closure (no session — keyed by JSON-RPC id).
  inflight: dict[str, CancelSignal] = {}
  subscriptions: dict[str, dict] = {}
  state: dict[str, Any] = {"loop": None}

  def cors_headers() -> dict[str, str]:
    if cors is None:
      return {}
    return {
      "Access-Control-Allow-Origin": cors,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      # No Mcp-Session-Id: the stateless transport MUST NOT use a session header (§9.9).
      "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version, Authorization, Mcp-Method, Mcp-Name",
      "Access-Control-Expose-Headers": "MCP-Protocol-Version, WWW-Authenticate",
    }

  def json_response(status: int, payload: Any, extra: dict[str, str] | None = None) -> Response:
    headers = {"Content-Type": "application/json", **cors_headers(), **(extra or {})}
    # allow_nan=False: a non-finite number is not valid JSON and must never reach the wire.
    return Response(content=json.dumps(payload, allow_nan=False), status_code=status, headers=headers)

  def reject(request_id: Any, code: int, message: str, data: Any = None) -> Response:
    envelope = {"jsonrpc": "2.0", "id": request_id, "error": build_error_object(code, message, data)}
    return json_response(_http_status_for_error_code(code), envelope)

  def fan_out_subscribers(notification: dict) -> None:
    """Broadcast a change notification to every matching subscription stream (§10.5)."""
    loop = state["loop"]
    if loop is None:
      return
    params = notification.get("params") or {}
    method = notification["method"]
    key = params.get("taskId") if method == "notifications/tasks" else params.get("uri")
    for entry in list(subscriptions.values()):
      sub: Subscription = entry["sub"]
      if not sub.may_emit(method, key):
        continue
      existing_meta = params.get("_meta") or {}
      message = {
        "jsonrpc": "2.0",
        "method": method,
        "params": {**params, "_meta": {**existing_meta, SUBSCRIPTION_ID_META_KEY: sub.subscription_id}},
      }
      loop.call_soon_threadsafe(entry["queue"].put_nowait, message)

  # §25.10: deliver task status pushes through the same subscriber fan-out.
  server.set_task_notifier(fan_out_subscribers)

  def teardown_subscription(target_id: Any) -> None:
    loop = state["loop"]
    for sub_id, entry in list(subscriptions.items()):
      if str(entry["sub"].request_id) == str(target_id):
        subscriptions.pop(sub_id, None)
        entry["sub"].close("client-cancel")
        if loop is not None:
          loop.call_soon_threadsafe(entry["queue"].put_nowait, _SENTINEL)

  def handle_notification(message: dict) -> None:
    if message.get("method") == "notifications/cancelled":
      target = (message.get("params") or {}).get("requestId")
      signal = inflight.get(str(target))
      if signal is not None:
        signal.abort()
      teardown_subscription(target)

  # ── request-header validation (§9.3–§9.4) ──
  def reject_for(request_id: Any, rejection: Any) -> Response:
    """Surface an :class:`HttpRejection` from the tested header validators as the
    JSON-RPC error response, echoing the originating request id."""
    error = rejection.error
    return reject(request_id, error["code"], error["message"], error.get("data"))

  def validate_headers(headers: dict, body: dict, meta: dict) -> Any:
    """Run the §9.3–§9.4 header + routing + protocol-version validators (the same tested
    helpers the conformance suite exercises). Returns an :class:`HttpRejection` on the
    first failure, else ``None``."""
    for outcome in (validate_content_type(headers), validate_accept(headers)):
      if not outcome.ok:
        return outcome.rejection
    routing = validate_routing_headers(headers, body)
    if not routing.ok:
      return routing.rejection
    version = validate_protocol_version_header(
      headers,
      body,
      ProtocolVersionValidationOptions(supported_versions=[CURRENT_PROTOCOL_VERSION]),
    )
    if not version.ok:
      return version.rejection
    return None

  def validate_param_headers_for(method: str, params: dict, headers: dict) -> Any:
    """Validate ``Mcp-Param-*`` headers against the request body for a known ``tools/call``
    (§9.5.4). Returns an :class:`HttpRejection` on a mismatch / impermissible value, else
    ``None``. Unknown tools fall through (the dispatcher reports the -32602)."""
    if method != "tools/call":
      return None
    name = params.get("name")
    if not isinstance(name, str):
      return None
    schema = server.tool_input_schema(name)
    if schema is None:
      return None
    outcome = validate_param_headers(schema, params.get("arguments") or {}, headers)
    return None if outcome.ok else outcome.rejection

  async def handler(request: Request) -> Response:
    state["loop"] = asyncio.get_running_loop()

    if request.method == "OPTIONS":
      return Response(status_code=204, headers=cors_headers())
    # A liveness probe, served on every runtime regardless of the MCP path or HTTP
    # method (parity with the TS handler's `/health`). Checked BEFORE the path-mismatch
    # 404 and the Origin/auth gates so a bare health check always succeeds.
    if request.url.path == "/health":
      return json_response(200, {"status": "ok", "name": server.info.get("name")})
    if request.url.path != path:
      return json_response(404, {"error": "not found"})

    # DNS-rebinding defense (§9.11): reject a cross-origin browser Origin not allow-listed.
    origin = request.headers.get("origin")
    if origin is not None:
      same_origin = origin == f"{request.url.scheme}://{request.url.netloc}"
      if not same_origin and not (allowed_origins and ("*" in allowed_origins or origin in allowed_origins)):
        return json_response(
          403, {"jsonrpc": "2.0", "id": None, "error": build_error_object(INVALID_REQUEST_CODE, f"Origin not permitted: {origin}")}
        )

    # Optional bearer gate (protected resource) — runs before routing validation (§23).
    auth_info = None
    if auth_gate is not None:
      verdict = auth_gate(request)
      if not verdict.get("ok"):
        extra = {"WWW-Authenticate": verdict["wwwAuthenticate"]} if verdict.get("wwwAuthenticate") else {}
        return json_response(verdict.get("status", 401), verdict.get("body", {}), extra)
      auth_info = verdict.get("authInfo")

    if request.method != "POST":
      return json_response(405, {"jsonrpc": "2.0", "id": None, "error": build_error_object(INVALID_REQUEST_CODE, "Method not allowed")})

    try:
      raw = await request.body()
    except ClientDisconnect:
      # The client aborted before its request body fully arrived (e.g. a reconnect race or a
      # navigation away). No peer remains to answer, so reject quietly instead of letting the
      # ClientDisconnect surface as an unhandled ASGI exception in the server log.
      return json_response(400, {"jsonrpc": "2.0", "id": None, "error": build_error_object(PARSE_ERROR_CODE, "Client disconnected before the request body was received")})
    # §28.10 (R-28.10-l): bound the inbound payload before parsing — ``raw`` is the UTF-8 wire
    # bytes, so its length is exactly the serialized-payload size :func:`enforce_input_bounds`
    # would measure. Reject an oversized body (HTTP 413) rather than parsing it.
    if len(raw) > max_request_bytes:
      return json_response(
        413,
        {"jsonrpc": "2.0", "id": None, "error": build_error_object(INVALID_REQUEST_CODE, f"Request body exceeds the {max_request_bytes}-byte limit")},
      )
    try:
      parsed = json.loads(raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw)
    except (ValueError, UnicodeDecodeError):
      return json_response(400, {"jsonrpc": "2.0", "id": None, "error": build_error_object(PARSE_ERROR_CODE, "Parse error")})

    try:
      classified = classify_message(parsed)
    except MalformedMessageError as exc:
      return json_response(400, {"jsonrpc": "2.0", "id": None, "error": build_error_object(INVALID_REQUEST_CODE, str(exc))})

    if classified.kind in ("result-response", "error-response"):
      # A client reply to a server→client request — acknowledged (correlation by id).
      return Response(status_code=202, headers=cors_headers())
    if classified.kind == "notification":
      handle_notification(classified.message)
      return Response(status_code=202, headers=cors_headers())

    request_msg = classified.message
    request_id = request_msg["id"]
    method = request_msg["method"]
    params = request_msg.get("params") or {}
    meta = params.get("_meta") if isinstance(params.get("_meta"), dict) else {}

    # §9.3–§9.4 + §9.5.4 + §4.3: required headers, routing headers, the param headers,
    # then the _meta envelope. A plain dict is built once for the tested header validators.
    headers = dict(request.headers)
    header_rejection = validate_headers(headers, request_msg, meta)
    if header_rejection is not None:
      return reject_for(request_id, header_rejection)
    param_rejection = validate_param_headers_for(method, params, headers)
    if param_rejection is not None:
      return reject_for(request_id, param_rejection)
    if method != "initialize":
      meta_error = validate_request_meta(meta)
      if not meta_error.ok:
        return reject(request_id, INVALID_PARAMS_CODE, meta_error.message)

    protocol_version = request.headers.get(MCP_PROTOCOL_VERSION_HEADER) or CURRENT_PROTOCOL_VERSION

    if method == "initialize":
      try:
        result = server.dispatch("initialize", params, ServerRequestContext(protocol_version, request_id, meta))
        return json_response(200, {"jsonrpc": "2.0", "id": request_id, "result": result})
      except ServerError as exc:
        return json_response(200, {"jsonrpc": "2.0", "id": request_id, "error": exc_to_error(exc)})

    if method == SUBSCRIPTIONS_LISTEN_METHOD:
      return _subscription_response(request_id, params, meta)

    return await _request_response(request_id, method, params, meta, protocol_version, auth_info)

  # ── subscription stream (§10) ──
  def _subscription_response(request_id: Any, params: dict, meta: dict) -> Response:
    requested = params.get("notifications") or {}
    client_caps = meta.get("io.modelcontextprotocol/clientCapabilities") or {}
    tasks_active = is_tasks_active_for_request(client_caps.get("extensions"), server.capabilities.get("extensions"))
    # §25.10: a taskIds opt-in without the negotiated tasks capability MUST be -32003.
    if task_subscription_requires_capability(requested, tasks_active):
      err = build_tasks_missing_capability_error(SUBSCRIPTIONS_LISTEN_METHOD)
      return reject(request_id, err["code"], err["message"], err["data"])

    sub = Subscription(request_id, requested, server.capabilities, tasks_active=tasks_active)
    queue: asyncio.Queue = asyncio.Queue()
    subscriptions[sub.subscription_id] = {"sub": sub, "queue": queue}

    async def gen():
      try:
        yield _sse({"jsonrpc": "2.0", "method": SUBSCRIPTIONS_ACKNOWLEDGED_METHOD, "params": sub.acknowledge()})
        while True:
          message = await queue.get()
          if message is _SENTINEL:
            break
          yield _sse(message)
      finally:
        subscriptions.pop(sub.subscription_id, None)
        sub.close("transport-close")

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_stream_headers(cors_headers()))

  # ── generic request: lazy-commit single-JSON or SSE (§9.6) ──
  async def _request_response(
    request_id: Any, method: str, params: dict, meta: dict, protocol_version: str, auth_info: Any
  ) -> Response:
    loop = asyncio.get_running_loop()
    signal = CancelSignal()
    inflight[str(request_id)] = signal
    queue: asyncio.Queue = asyncio.Queue()
    result_holder: dict[str, Any] = {}

    def notify(notification: dict) -> None:
      loop.call_soon_threadsafe(queue.put_nowait, {"jsonrpc": "2.0", **notification})

    ctx = ServerRequestContext(
      protocol_version=protocol_version,
      request_id=request_id,
      meta=meta,
      notify=notify,
      signal=signal,
      auth_info=auth_info,
      notify_subscribers=fan_out_subscribers,
    )

    def run() -> tuple[str, Any]:
      try:
        return ("ok", server.dispatch(method, params, ctx))
      except ServerError as exc:
        return ("err", exc_to_error(exc))
      except Exception as exc:  # noqa: BLE001 — any handler failure becomes a protocol error
        return ("err", build_error_object(INTERNAL_ERROR_CODE, f"Internal error: {exc}"))

    dispatch_task = asyncio.create_task(asyncio.to_thread(run))

    def on_done(task: asyncio.Task) -> None:
      # Runs on the loop after all notify() puts are queued → the sentinel trails them.
      try:
        result_holder["outcome"] = task.result()
      except asyncio.CancelledError:
        result_holder["outcome"] = ("err", build_error_object(INTERNAL_ERROR_CODE, "request cancelled"))
      except Exception as exc:  # noqa: BLE001 — surface any dispatch crash as a protocol error
        result_holder["outcome"] = ("err", build_error_object(INTERNAL_ERROR_CODE, f"Internal error: {exc}"))
      queue.put_nowait(_SENTINEL)

    dispatch_task.add_done_callback(on_done)

    first = await queue.get()
    if first is _SENTINEL:
      # The handler emitted nothing before finishing → single JSON response (§9.6.1).
      inflight.pop(str(request_id), None)
      return _final_single(request_id, result_holder["outcome"])

    async def gen():
      try:
        item = first
        while item is not _SENTINEL:
          yield _sse(item)
          item = await queue.get()
        kind, value = result_holder["outcome"]
        yield _sse(_final_envelope(request_id, kind, value))
      finally:
        inflight.pop(str(request_id), None)

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_stream_headers(cors_headers()))

  def _final_single(request_id: Any, outcome: tuple[str, Any]) -> Response:
    kind, value = outcome
    if kind == "ok":
      return json_response(200, {"jsonrpc": "2.0", "id": request_id, "result": value})
    status = _http_status_for_error_code(value["code"])
    return json_response(status, {"jsonrpc": "2.0", "id": request_id, "error": value})

  return handler


def _stream_headers(cors: dict[str, str]) -> dict[str, str]:
  return {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", **cors}


def exc_to_error(exc: ServerError) -> dict:
  """Serialize a :class:`ServerError` to a JSON-RPC error object."""
  error = {"code": exc.code, "message": str(exc)}
  if exc.data is not None:
    error["data"] = exc.data
  return error


def _final_envelope(request_id: Any, kind: str, value: Any) -> dict:
  if kind == "ok":
    return {"jsonrpc": "2.0", "id": request_id, "result": value}
  return {"jsonrpc": "2.0", "id": request_id, "error": value}
