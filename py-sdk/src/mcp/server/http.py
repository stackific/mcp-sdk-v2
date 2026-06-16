"""Streamable HTTP server handler (MCP 2026-07-28, §9) — a framework-agnostic core.

:func:`create_mcp_request_handler` builds a callable that maps an HTTP request
(method, path, headers, body) to an :class:`HttpResponse`, serving an
:class:`~mcp.server.server.McpServer` over **stateless** Streamable HTTP:

* ``POST`` a request      → ``200 application/json`` with the JSON-RPC response.
* ``POST`` a notification → ``202 Accepted`` (no body).
* ``POST`` malformed JSON → ``400`` with a ``-32700`` parse-error body (null id).
* ``OPTIONS``             → ``204`` CORS preflight.
* ``DELETE``             → ``200`` (no-op; nothing to tear down when stateless, §9.9).
* ``GET``                → ``405`` (the standalone SSE keep-alive stream is deferred).

Statelessness (§9.9): there is no ``Mcp-Session-Id``. The ``MCP-Protocol-Version``
header, when present, MUST match the request's ``_meta`` revision or the request is
rejected ``400`` (§5.2). Error→HTTP status mapping follows §22.6.

Deferred (own phases, clearly out of scope here): the ``text/event-stream`` response
path for interim notifications / server→client requests, subscriptions (§10), and the
auth gate / DNS-rebinding origin allowlist (§9.11).
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INVALID_REQUEST_CODE,
  PARSE_ERROR_CODE,
  build_error_object,
  build_null_id_parse_error_response,
  http_status_for_registry_code,
)
from mcp.protocol.meta import PROTOCOL_VERSION_META_KEY
from mcp.protocol.revision import MCP_PROTOCOL_VERSION_HEADER, check_http_revision_header
from mcp.server.runtime import process_message
from mcp.server.server import McpServer


@dataclass
class HttpResponse:
  """A minimal transport-agnostic HTTP response an adapter renders to its framework."""

  status: int
  headers: dict[str, str] = field(default_factory=dict)
  body: str = ""


def _get_header(headers: Mapping[str, str], name: str) -> str | None:
  """Case-insensitive header lookup."""
  lname = name.lower()
  for key, value in headers.items():
    if key.lower() == lname:
      return value
  return None


def _status_for_response(response: dict) -> int:
  """Map a JSON-RPC response envelope to its HTTP status (§22.6).

  A success result → ``200``. An error → the registry-pinned status (e.g. ``400`` for
  missing-capability / unsupported-version / header-mismatch), ``400`` for parse /
  invalid-request, else ``200`` (the error rides in the body of a delivered response).
  """
  if "result" in response:
    return 200
  code = response.get("error", {}).get("code")
  pinned = http_status_for_registry_code(code) if isinstance(code, int) else None
  if pinned is not None:
    return pinned
  if code in (PARSE_ERROR_CODE, INVALID_REQUEST_CODE):
    return 400
  return 200


def create_mcp_request_handler(
  server: McpServer,
  *,
  path: str = "/mcp",
  cors: str | None = "*",
  notify: Callable[[dict], None] | None = None,
) -> Callable[..., HttpResponse]:
  """Build a Streamable HTTP handler for ``server``.

  The returned callable has signature
  ``handler(method, request_path, headers, body) -> HttpResponse``. ``body`` may be a
  ``str`` or ``bytes``. ``cors`` is the ``Access-Control-Allow-Origin`` value (``None``
  omits CORS headers).
  """

  def _cors_headers() -> dict[str, str]:
    if cors is None:
      return {}
    return {
      "Access-Control-Allow-Origin": cors,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      # No Mcp-Session-Id: the stateless transport MUST NOT use a session header (§9.9).
      "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
    }

  def _json(status: int, payload: dict) -> HttpResponse:
    # allow_nan=False: a non-finite number is not valid JSON and must never reach the wire.
    body = json.dumps(payload, allow_nan=False)
    return HttpResponse(status, {"Content-Type": "application/json", **_cors_headers()}, body)

  def handler(method: str, request_path: str, headers: Mapping[str, str] | None = None, body: object = "") -> HttpResponse:
    headers = headers or {}

    if method == "OPTIONS":
      return HttpResponse(204, _cors_headers())
    if request_path != path:
      return _json(404, {"error": f"Not found: {request_path}"})
    if method == "DELETE":
      return HttpResponse(200, _cors_headers())  # stateless: nothing to tear down (§9.9)
    if method == "GET":
      # The standalone SSE keep-alive stream is deferred in this adapter.
      return _json(405, {"error": "GET (SSE) is not supported by this handler"})
    if method != "POST":
      return _json(405, {"error": f"Method not allowed: {method}"})

    # Decode the body to text.
    if isinstance(body, bytes):
      try:
        text = body.decode("utf-8")
      except UnicodeDecodeError:
        return _json(400, build_null_id_parse_error_response("Parse error: body is not valid UTF-8"))
    else:
      text = body or ""

    # Parse exactly one JSON value.
    try:
      parsed = json.loads(text)
    except json.JSONDecodeError:
      return _json(400, build_null_id_parse_error_response())

    # §5.2: when the MCP-Protocol-Version header is present it MUST match the request's
    # _meta revision; a mismatch is rejected 400 (HeaderMismatch, -32001).
    if isinstance(parsed, dict):
      meta = (parsed.get("params") or {}).get("_meta") or {}
      meta_version = meta.get(PROTOCOL_VERSION_META_KEY)
      if isinstance(meta_version, str):
        check = check_http_revision_header(_get_header(headers, MCP_PROTOCOL_VERSION_HEADER), meta_version)
        if not check.ok:
          envelope = {
            "jsonrpc": "2.0",
            "id": parsed.get("id"),
            "error": build_error_object(HEADER_MISMATCH_CODE, check.message),
          }
          return _json(check.status or 400, envelope)

    response = process_message(server, parsed, notify=notify)
    if response is None:
      return HttpResponse(202, _cors_headers())  # accepted; a notification takes no reply
    return _json(_status_for_response(response), response)

  return handler
