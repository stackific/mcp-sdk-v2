"""Tests for the Streamable HTTP server handler (§9, §22.6).

Two transports are covered:

* the **sync** :func:`mcp.server.http.create_mcp_request_handler` (single-JSON only),
* the **async** :func:`mcp.server.asgi.create_asgi_mcp_handler` — the full §9 Streamable
  HTTP transport (lazy-commit single-JSON ↔ SSE, subscriptions, Origin/auth gating).
  The async suite mirrors the TS SDK ``createMcpRequestHandler`` web-fetch tests
  (``__tests__/server/server-runtime.test.ts``) driven through Starlette's ``TestClient``.
"""

import asyncio
import json

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route
from starlette.testclient import TestClient

from mcp.protocol.discovery import build_discover_request, is_discover_result
from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INVALID_PARAMS_CODE,
  METHOD_NOT_FOUND_CODE,
  PARSE_ERROR_CODE,
)
from mcp.server.asgi import create_asgi_mcp_handler
from mcp.server.http import create_mcp_request_handler
from mcp.server.server import McpServer

INFO = {"name": "srv", "version": "1.0"}
CLIENT = {"name": "cli", "version": "0.1"}


def handler():
  return create_mcp_request_handler(McpServer(INFO, {"tools": {}}))


def post(h, body, headers=None, path="/mcp"):
  return h("POST", path, headers or {}, json.dumps(body) if not isinstance(body, str) else body)


class TestPost:
  def test_request_returns_200_json(self):
    h = handler()
    resp = post(h, build_discover_request(1, "2026-07-28", CLIENT, {}))
    assert resp.status == 200
    assert resp.headers["Content-Type"] == "application/json"
    payload = json.loads(resp.body)
    assert payload["id"] == 1 and is_discover_result(payload["result"])

  def test_cors_headers_present(self):
    resp = post(handler(), build_discover_request(1, "2026-07-28", CLIENT, {}))
    assert resp.headers["Access-Control-Allow-Origin"] == "*"

  def test_notification_returns_202(self):
    resp = post(handler(), {"jsonrpc": "2.0", "method": "notifications/foo"})
    assert resp.status == 202 and resp.body == ""

  def test_malformed_json_returns_400_parse_error(self):
    resp = post(handler(), "{not json")
    assert resp.status == 400
    assert json.loads(resp.body)["error"]["code"] == PARSE_ERROR_CODE

  def test_bytes_body_supported(self):
    h = handler()
    raw = json.dumps(build_discover_request(1, "2026-07-28", CLIENT, {})).encode("utf-8")
    resp = h("POST", "/mcp", {}, raw)
    assert resp.status == 200

  def test_invalid_utf8_body_returns_400_parse_error(self):
    # AC-14.1 (R-9.1-a): a POST body that is not well-formed UTF-8 MUST be rejected by the
    # production server with a 400 parse error (-32700), not decoded leniently.
    resp = handler()("POST", "/mcp", {}, b"\xff\xfe")
    assert resp.status == 400
    assert json.loads(resp.body)["error"]["code"] == PARSE_ERROR_CODE

  def test_method_not_found_rides_on_200(self):
    h = handler()
    req = {"jsonrpc": "2.0", "id": 5, "method": "bogus"}
    resp = post(h, req)
    assert resp.status == 200
    assert json.loads(resp.body)["error"]["code"] == METHOD_NOT_FOUND_CODE


class TestHeaderMismatch:
  def test_matching_header_ok(self):
    h = handler()
    req = build_discover_request(1, "2026-07-28", CLIENT, {})
    resp = post(h, req, headers={"MCP-Protocol-Version": "2026-07-28"})
    assert resp.status == 200

  def test_mismatched_header_is_400(self):
    h = handler()
    req = build_discover_request(1, "2026-07-28", CLIENT, {})
    resp = post(h, req, headers={"MCP-Protocol-Version": "2025-01-01"})
    assert resp.status == 400
    assert json.loads(resp.body)["error"]["code"] == HEADER_MISMATCH_CODE

  def test_absent_header_not_enforced(self):
    h = handler()
    req = build_discover_request(1, "2026-07-28", CLIENT, {})
    resp = post(h, req)  # no MCP-Protocol-Version header
    assert resp.status == 200


class TestRouting:
  def test_wrong_path_404(self):
    assert handler()("POST", "/other", {}, "{}").status == 404

  def test_options_preflight_204(self):
    resp = handler()("OPTIONS", "/mcp", {}, "")
    assert resp.status == 204
    assert resp.headers["Access-Control-Allow-Origin"] == "*"

  def test_delete_is_noop_200(self):
    assert handler()("DELETE", "/mcp", {}, "").status == 200

  def test_get_405(self):
    assert handler()("GET", "/mcp", {}, "").status == 405

  def test_cors_can_be_disabled(self):
    h = create_mcp_request_handler(McpServer(INFO, {"tools": {}}), cors=None)
    resp = h("OPTIONS", "/mcp", {}, "")
    assert "Access-Control-Allow-Origin" not in resp.headers


# ─── Async Streamable HTTP handler (asgi.py) — full §9 transport ────────────────
#
# Mirrors the TS ``createMcpRequestHandler`` web-fetch tests, driven through Starlette's
# synchronous ``TestClient`` (which runs the ASGI handler on its own loop, so SSE
# streaming is exercised end to end exactly as the TS Web-fetch handler is).

#: The three REQUIRED reserved per-request ``_meta`` keys (§4.3), pre-built for brevity.
ENVELOPE_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": {"name": "c", "version": "1"},
  "io.modelcontextprotocol/clientCapabilities": {},
}


def _make_async_server() -> McpServer:
  """An McpServer mirroring the TS ``makeServer`` (add + register_user/elicit)."""
  server = McpServer(INFO, {"tools": {}, "elicitation": {}})
  server.register_tool(
    "add",
    lambda args, ctx: {"content": [{"type": "text", "text": str(args["a"] + args["b"])}]},
    description="adds",
    input_schema={
      "type": "object",
      "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
      "required": ["a", "b"],
    },
  )

  def register_user(_args: dict, ctx) -> dict:
    elicited = ctx.elicit_input({"mode": "form"})
    return {"content": [{"type": "text", "text": "done"}], "structuredContent": elicited}

  server.register_tool("register_user", register_user)
  return server


def _client(server: McpServer, **kwargs) -> TestClient:
  """Mount ``create_asgi_mcp_handler(server)`` behind a Starlette route and wrap it in a
  ``TestClient``. All HTTP verbs route to the handler so its own method gating runs.
  """
  asgi_handler = create_asgi_mcp_handler(server, **kwargs)

  async def endpoint(request: Request) -> Response:
    return await asgi_handler(request)

  app = Starlette(
    routes=[
      Route("/mcp", endpoint, methods=["GET", "POST", "DELETE", "OPTIONS"]),
      Route("/health", endpoint, methods=["GET", "POST"]),
      Route("/nope", endpoint, methods=["GET", "POST"]),
    ]
  )
  # ``raise_server_exceptions=False`` keeps a handler crash visible as a 500 instead of
  # re-raising, matching how a real ASGI server surfaces it.
  return TestClient(app, raise_server_exceptions=False)


def _headers(method: str, params: dict | None) -> dict:
  """Build the §9.3–§9.4 required + routing headers for ``method`` (mirrors the TS ``post``)."""
  headers = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
  }
  params = params or {}
  if method in ("tools/call", "prompts/get"):
    if params.get("name") is not None:
      headers["mcp-name"] = params["name"]
  elif method == "resources/read":
    if params.get("uri") is not None:
      headers["mcp-name"] = params["uri"]
  return headers


def _post(tc: TestClient, body: dict, header_overrides: dict | None = None, origin: str | None = None):
  """POST ``body`` to ``/mcp`` with the appropriate headers, applying any overrides.

  An override value of ``None`` deletes that header (mirrors the TS helper).
  """
  headers = _headers(body.get("method", ""), body.get("params"))
  for key, value in (header_overrides or {}).items():
    if value is None:
      headers.pop(key, None)
    else:
      headers[key] = value
  if origin is not None:
    headers["origin"] = origin
  return tc.post("/mcp", content=json.dumps(body), headers=headers)


def _call_add(a: int, b: int, request_id: int = 1) -> dict:
  return {
    "jsonrpc": "2.0",
    "id": request_id,
    "method": "tools/call",
    "params": {"name": "add", "arguments": {"a": a, "b": b}, "_meta": ENVELOPE_META},
  }


def _drive_sse_until_first_event(server: McpServer, body: dict, headers: dict) -> tuple[int, dict, str]:
  """POST ``body`` to a long-lived SSE endpoint and return ``(status, headers, sse_text)``
  captured up to the FIRST emitted ``data:`` event, then disconnect.

  A ``subscriptions/listen`` stream stays open until torn down (§10.7) — it never emits a
  terminal frame on its own — so it cannot be read to EOF (Starlette's ``TestClient``
  buffers the whole response and would block forever on the open stream). Mirroring the TS
  web-fetch reader (read the acknowledgement, then close), this drives the ASGI app
  directly with a controlled ``receive``: once the acknowledgement frame has been written,
  it delivers ``http.disconnect`` so Starlette cancels the stream (transport-close
  teardown), exactly as a real client dropping the connection would. The real SSE
  subscription handshake is exercised end to end.
  """
  asgi_handler = create_asgi_mcp_handler(server)

  async def endpoint(request: Request) -> Response:
    return await asgi_handler(request)

  app = Starlette(routes=[Route("/mcp", endpoint, methods=["GET", "POST", "DELETE", "OPTIONS"])])
  raw = json.dumps(body).encode("utf-8")
  scope = {
    "type": "http",
    "http_version": "1.1",
    "method": "POST",
    "path": "/mcp",
    "raw_path": b"/mcp",
    "root_path": "",
    "scheme": "http",
    "query_string": b"",
    "headers": [(k.encode(), v.encode()) for k, v in headers.items()],
    "client": ["testclient", 50000],
    "server": ["testserver", 80],
  }

  async def main() -> tuple[int, dict, str]:
    sent: list = []
    first_event = asyncio.Event()
    body_delivered = False

    async def receive() -> dict:
      nonlocal body_delivered
      if not body_delivered:
        body_delivered = True
        return {"type": "http.request", "body": raw, "more_body": False}
      # Once the first SSE frame is captured, drop the connection so the stream is torn down.
      await first_event.wait()
      return {"type": "http.disconnect"}

    async def send(message: dict) -> None:
      sent.append(message)
      if message["type"] == "http.response.body" and message.get("body"):
        first_event.set()

    await app(scope, receive, send)
    start = next(m for m in sent if m["type"] == "http.response.start")
    resp_headers = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    text = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body").decode("utf-8")
    return start["status"], resp_headers, text

  return asyncio.run(main())


class TestAsgiHandler:
  """The async Web-standard handler — mirrors TS ``createMcpRequestHandler`` tests."""

  def test_non_streaming_tools_call_single_json_200(self):
    tc = _client(_make_async_server())
    resp = _post(tc, _call_add(4, 5))
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]
    body = resp.json()
    assert body["id"] == 1
    assert body["result"]["content"][0]["text"] == "9"
    assert body["result"]["resultType"] == "complete"

  def test_dispatch_error_maps_to_9_7_status(self):
    tc = _client(_make_async_server())
    # Unknown method → -32601 → 404.
    nf = _post(
      tc,
      {"jsonrpc": "2.0", "id": 1, "method": "does/not/exist", "params": {"_meta": ENVELOPE_META}},
    )
    assert nf.status_code == 404
    assert nf.json()["error"]["code"] == METHOD_NOT_FOUND_CODE
    # Unknown tool → -32602 → 400.
    bad = _post(
      tc,
      {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": "nope", "arguments": {}, "_meta": ENVELOPE_META},
      },
      header_overrides={"mcp-name": "nope"},
    )
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == INVALID_PARAMS_CODE

  def test_client_notification_returns_202(self):
    tc = _client(_make_async_server())
    resp = tc.post(
      "/mcp",
      content=json.dumps({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}}),
      headers={"content-type": "application/json", "accept": "application/json, text/event-stream"},
    )
    assert resp.status_code == 202
    assert resp.content == b""

  def test_client_response_returns_202(self):
    # A client reply to a server→client request is acknowledged (correlation by id).
    tc = _client(_make_async_server())
    resp = tc.post(
      "/mcp",
      content=json.dumps({"jsonrpc": "2.0", "id": "srv-1", "result": {}}),
      headers={"content-type": "application/json", "accept": "application/json, text/event-stream"},
    )
    assert resp.status_code == 202

  def test_non_mcp_path_404(self):
    tc = _client(_make_async_server())
    resp = tc.post("/nope", content="{}", headers={"content-type": "application/json"})
    assert resp.status_code == 404

  def test_health_endpoint(self):
    # GET /health is served regardless of the MCP path/method (parity with TS).
    tc = _client(_make_async_server())
    resp = tc.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"status": "ok", "name": "srv"}

  def test_get_and_delete_rejected_405(self):
    tc = _client(_make_async_server())
    assert tc.get("/mcp").status_code == 405
    assert tc.request("DELETE", "/mcp").status_code == 405

  def test_options_omits_session_id_header(self):
    tc = _client(_make_async_server())
    resp = tc.options("/mcp")
    assert resp.status_code == 204
    assert "mcp-session-id" not in resp.headers.get("access-control-allow-headers", "").lower()

  def test_missing_routing_header_or_meta_rejected(self):
    tc = _client(_make_async_server())
    # Missing Mcp-Name on tools/call → -32001 / 400.
    no_name = _post(tc, _call_add(1, 2), header_overrides={"mcp-name": None})
    assert no_name.status_code == 400
    assert no_name.json()["error"]["code"] == HEADER_MISMATCH_CODE
    # Wrong Content-Type → 400. Wrong Accept → 400.
    assert _post(tc, _call_add(1, 2), header_overrides={"content-type": "text/plain"}).status_code == 400
    assert _post(tc, _call_add(1, 2), header_overrides={"accept": "application/json"}).status_code == 400
    # Missing the per-request _meta envelope → -32602 / 400.
    no_meta = _post(
      tc,
      {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "add", "arguments": {"a": 1, "b": 2}}},
    )
    assert no_meta.status_code == 400
    assert no_meta.json()["error"]["code"] == INVALID_PARAMS_CODE

  def test_initialize_is_exempt_from_meta_gate(self):
    # initialize is the one legacy method exempt from the _meta envelope gate (§9.12).
    tc = _client(_make_async_server())
    resp = tc.post(
      "/mcp",
      content=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2026-07-28"}}),
      headers={
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "initialize",
      },
    )
    assert resp.status_code == 200
    assert resp.json()["result"]["protocolVersion"] == "2026-07-28"


class TestAsgiOrigin:
  """DNS-rebinding Origin validation (§9.11) — mirrors the TS Origin test."""

  def test_no_origin_and_same_origin_pass(self):
    tc = _client(_make_async_server())
    # No Origin (non-browser) → allowed.
    assert _post(tc, _call_add(1, 2)).status_code == 200
    # Same-origin → allowed. The TestClient base URL is http://testserver.
    assert _post(tc, _call_add(1, 2), origin="http://testserver").status_code == 200

  def test_cross_origin_rejected_without_allowlist(self):
    tc = _client(_make_async_server())
    resp = _post(tc, _call_add(1, 2), origin="https://evil.test")
    assert resp.status_code == 403
    assert resp.json()["error"]["message"].startswith("Origin not permitted")

  def test_allowlist_admits_listed_origin(self):
    tc = _client(_make_async_server(), allowed_origins={"https://ok.test"})
    assert _post(tc, _call_add(1, 2), origin="https://ok.test").status_code == 200
    assert _post(tc, _call_add(1, 2), origin="https://evil.test").status_code == 403

  def test_wildcard_allows_any_origin(self):
    tc = _client(_make_async_server(), allowed_origins={"*"})
    assert _post(tc, _call_add(1, 2), origin="https://anywhere.test").status_code == 200


class TestAsgiStreaming:
  """Lazy-commit single-JSON ↔ SSE (§9.6) and subscriptions (§10)."""

  def _streaming_server(self) -> McpServer:
    server = McpServer(INFO, {"tools": {}, "resources": {}})

    def chatty(_args: dict, ctx) -> dict:
      # Emit a request-scoped notification → commit to SSE.
      ctx.notify({"method": "notifications/progress", "params": {"progressToken": "p", "progress": 1}})
      return {"content": [{"type": "text", "text": "ok"}]}

    server.register_tool("chatty", chatty)
    return server

  @staticmethod
  def _sse_messages(text: str) -> list:
    """Parse the SSE body into the list of JSON-decoded ``data:`` payloads."""
    out = []
    for chunk in text.split("\n\n"):
      line = chunk.strip()
      if line.startswith("data:"):
        out.append(json.loads(line[len("data:") :].strip()))
    return out

  def test_lazy_commit_streams_notifications_then_final_response(self):
    tc = _client(self._streaming_server())
    resp = tc.post(
      "/mcp",
      content=json.dumps(
        {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "chatty", "_meta": ENVELOPE_META}}
      ),
      headers=_headers("tools/call", {"name": "chatty"}),
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    messages = self._sse_messages(resp.text)
    # First the progress notification, then the final JSON-RPC response.
    assert messages[0]["method"] == "notifications/progress"
    final = messages[-1]
    assert final["id"] == 7
    assert final["result"]["content"][0]["text"] == "ok"
    assert final["result"]["resultType"] == "complete"

  def test_non_emitting_handler_stays_single_json(self):
    # The same transport answers a silent handler with a single JSON response, not SSE.
    server = self._streaming_server()
    server.register_tool("quiet", lambda a, c: {"content": [{"type": "text", "text": "q"}]})
    tc = _client(server)
    resp = tc.post(
      "/mcp",
      content=json.dumps(
        {"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "quiet", "_meta": ENVELOPE_META}}
      ),
      headers=_headers("tools/call", {"name": "quiet"}),
    )
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]
    assert resp.json()["result"]["content"][0]["text"] == "q"

  def test_subscription_stream_acknowledges_then_stays_open(self):
    # toolsListChanged is gated on the tools.listChanged sub-flag (§10.3, R-10.3-d).
    server = McpServer(INFO, {"tools": {"listChanged": True}})
    listen = {
      "jsonrpc": "2.0",
      "id": "sub-1",
      "method": "subscriptions/listen",
      "params": {"notifications": {"toolsListChanged": True}, "_meta": ENVELOPE_META},
    }
    # The listen stream stays open until teardown (§10.7); read just the acknowledgement,
    # then disconnect — never to EOF, or the open stream blocks forever.
    status, resp_headers, text = _drive_sse_until_first_event(
      server, listen, _headers("subscriptions/listen", None)
    )
    assert status == 200
    assert "text/event-stream" in resp_headers["content-type"]
    ack = self._sse_messages(text)[0]
    assert ack["method"] == "notifications/subscriptions/acknowledged"
    assert ack["params"]["_meta"]["io.modelcontextprotocol/subscriptionId"] == "sub-1"
    # The acknowledged filter honored the requested + supported kind.
    assert ack["params"]["notifications"].get("toolsListChanged") is True

  def test_subscription_taskids_without_capability_rejected(self):
    # §25.10: a taskIds opt-in without the negotiated Tasks extension → -32003.
    from mcp.protocol.tasks import TASK_MISSING_CAPABILITY_CODE

    server = McpServer(INFO, {"tools": {}})
    tc = _client(server)
    listen = {
      "jsonrpc": "2.0",
      "id": "sub-2",
      "method": "subscriptions/listen",
      "params": {"notifications": {"taskIds": ["t1"]}, "_meta": ENVELOPE_META},
    }
    resp = tc.post("/mcp", content=json.dumps(listen), headers=_headers("subscriptions/listen", None))
    assert resp.json()["error"]["code"] == TASK_MISSING_CAPABILITY_CODE


class TestAsgiAuth:
  """The optional bearer auth gate (§23) integration on the async handler."""

  def test_auth_gate_rejection_short_circuits(self):
    def gate(_request):
      return {"ok": False, "status": 401, "wwwAuthenticate": 'Bearer error="invalid_token"', "body": {"error": "invalid_token"}}

    tc = _client(_make_async_server(), auth_gate=gate)
    resp = _post(tc, _call_add(1, 2))
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    assert resp.json()["error"] == "invalid_token"

  def test_auth_gate_passes_authinfo_through(self):
    captured = {}

    def gate(_request):
      return {"ok": True, "authInfo": {"sub": "u1"}}

    server = McpServer(INFO, {"tools": {}})
    server.register_tool(
      "whoami",
      lambda a, ctx: captured.update(auth=ctx.auth_info) or {"content": [{"type": "text", "text": "ok"}]},
    )
    tc = _client(server, auth_gate=gate)
    resp = _post(
      tc,
      {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "whoami", "_meta": ENVELOPE_META}},
      header_overrides={"mcp-name": "whoami"},
    )
    assert resp.status_code == 200
    assert captured["auth"] == {"sub": "u1"}


class TestAsgiWireGating:
  """Header / parse / version edge cases on the async handler (§9.3, §5.2)."""

  def test_malformed_json_400_parse_error(self):
    tc = _client(_make_async_server())
    resp = tc.post(
      "/mcp",
      content="{not json",
      headers={"content-type": "application/json", "accept": "application/json, text/event-stream"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == PARSE_ERROR_CODE

  def test_unsupported_protocol_version_rejected(self):
    from mcp.protocol.errors import UNSUPPORTED_PROTOCOL_VERSION_CODE

    tc = _client(_make_async_server())
    # The header MUST match the body _meta version (else it is a -32001 header mismatch,
    # checked first per R-9.3.3-d); a matching-but-unimplemented revision is the -32004
    # path (R-9.3.3-e). So drive both the header and the body envelope to the bad version.
    body = _call_add(1, 2)
    body["params"]["_meta"] = {**ENVELOPE_META, "io.modelcontextprotocol/protocolVersion": "1999-01-01"}
    resp = _post(tc, body, header_overrides={"mcp-protocol-version": "1999-01-01"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == UNSUPPORTED_PROTOCOL_VERSION_CODE

  def test_missing_protocol_version_header_rejected(self):
    tc = _client(_make_async_server())
    resp = _post(tc, _call_add(1, 2), header_overrides={"mcp-protocol-version": None})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == HEADER_MISMATCH_CODE

  def test_mcp_method_header_mismatch_rejected(self):
    tc = _client(_make_async_server())
    resp = _post(tc, _call_add(1, 2), header_overrides={"mcp-method": "tools/list"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == HEADER_MISMATCH_CODE

  def test_response_body_rejected_as_invalid(self):
    # A JSON-RPC response sent to the server is acknowledged 202 (never dispatched).
    tc = _client(_make_async_server())
    resp = tc.post(
      "/mcp",
      content=json.dumps({"jsonrpc": "2.0", "id": 1, "error": {"code": -1, "message": "x"}}),
      headers={"content-type": "application/json", "accept": "application/json, text/event-stream"},
    )
    assert resp.status_code == 202
