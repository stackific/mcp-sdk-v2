"""Transport-agnostic request processing for an :class:`~mcp.server.server.McpServer`.

:func:`process_message` is the heart of every server adapter: given one inbound,
already-parsed JSON-RPC message, it classifies it, dispatches a request to the server
and returns the JSON-RPC response, or returns ``None`` for messages that take no reply
(notifications, and responses a server never processes). HTTP/stdio adapters wrap this
with their own framing.
"""

from __future__ import annotations

from collections.abc import Callable

from mcp.jsonrpc.framing import MalformedMessageError, classify_message
from mcp.protocol.errors import INTERNAL_ERROR_CODE, INVALID_REQUEST_CODE, build_error_object
from mcp.protocol.meta import CURRENT_PROTOCOL_VERSION, PROTOCOL_VERSION_META_KEY
from mcp.server.server import McpServer, ServerError, ServerRequestContext


def process_message(
  server: McpServer,
  raw: object,
  *,
  notify: Callable[[dict], None] | None = None,
) -> dict | None:
  """Process one inbound message and return the JSON-RPC response, or ``None``.

  * A **request** is dispatched; the result is wrapped in a success envelope, a
    :class:`ServerError` becomes the matching error envelope, and any other exception
    becomes a ``-32603`` Internal error envelope. The response ``id`` echoes the
    request id with the same JSON type and value.
  * A **notification** (or a stray response) returns ``None`` — a server sends no reply.
  * A **malformed** message returns an Invalid Request (``-32600``) envelope with a
    ``null`` id, since the originating id cannot be trusted.

  :param notify: optional sink for server→client notifications a tool emits during the
    request (e.g. ``notifications/message``); defaults to a no-op.
  """
  try:
    classified = classify_message(raw)
  except MalformedMessageError as exc:
    return {"jsonrpc": "2.0", "id": None, "error": build_error_object(INVALID_REQUEST_CODE, str(exc))}

  if classified.kind != "request":
    return None  # notifications take no reply; responses are not processed by a server

  request = classified.message
  request_id = request["id"]
  params = request.get("params") or {}
  meta = params.get("_meta") if isinstance(params.get("_meta"), dict) else {}

  ctx = ServerRequestContext(
    protocol_version=meta.get(PROTOCOL_VERSION_META_KEY, CURRENT_PROTOCOL_VERSION),
    request_id=request_id,
    meta=meta,
    notify=notify or (lambda _n: None),
  )

  try:
    result = server.dispatch(request["method"], params, ctx)
    return {"jsonrpc": "2.0", "id": request_id, "result": result}
  except ServerError as exc:
    error = {"code": exc.code, "message": str(exc)}
    if exc.data is not None:
      error["data"] = exc.data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}
  except Exception as exc:  # noqa: BLE001 — any handler failure becomes a protocol error
    return {
      "jsonrpc": "2.0",
      "id": request_id,
      "error": build_error_object(INTERNAL_ERROR_CODE, f"Internal error: {exc}"),
    }
