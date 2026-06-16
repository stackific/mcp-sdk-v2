"""Comprehensive async tests for the Streamable HTTP handler (``mcp.server.asgi``).

These tests target :func:`mcp.server.asgi.create_asgi_mcp_handler` — the full §9
Streamable HTTP transport with lazy-commit single-JSON ↔ ``text/event-stream``
streaming, long-lived ``subscriptions/listen`` streams, the ``_meta`` envelope gate,
DNS-rebinding ``Origin`` validation, and the optional bearer ``auth_gate``.

Why the handler is driven directly (not via Starlette's ``TestClient``)
-----------------------------------------------------------------------
The handler returns a Starlette ``Response``/``StreamingResponse`` that the ASGI server
runs through the protocol. Two behaviours make ``TestClient`` unsuitable here:

* **Lazy commit** (§9.6): the handler reads the FIRST queued item before deciding
  between a single ``application/json`` response and an SSE stream. The dispatcher runs
  on a worker thread (``asyncio.to_thread``), so the stream only commits once that
  thread emits something; a buffering client can deadlock waiting on the open stream.
* **Open subscription streams** (§10.7): a ``subscriptions/listen`` response never emits
  a terminal frame on its own — it stays open until torn down. Reading it to EOF blocks
  forever.

So every request is driven through the raw ASGI three-tuple ``(scope, receive, send)``
with a controlled ``receive`` that either lets the stream run to completion (finite
request streams) or delivers ``http.disconnect`` right after the first SSE frame
(open subscription streams), exactly as a real client dropping the connection would.

The ``_meta`` envelope, routing headers, and request body are assembled by small
builders so each test states only the part it exercises.
"""

from __future__ import annotations

import asyncio
import json

from starlette.requests import Request

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INVALID_PARAMS_CODE,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  PARSE_ERROR_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.protocol.tasks import TASKS_EXTENSION_ID
from mcp.server.asgi import _sse, create_asgi_mcp_handler
from mcp.server.server import McpServer
from mcp.server.tasks import InMemoryTaskStore

# ─── Fixtures: identity, protocol version, the _meta envelope ──────────────────

PROTOCOL_VERSION = "2026-07-28"
INFO = {"name": "srv", "version": "1.0"}
CLIENT = {"name": "cli", "version": "0.1"}

#: The three REQUIRED reserved per-request ``_meta`` keys (§4.3).
PV_KEY = "io.modelcontextprotocol/protocolVersion"
CLIENT_INFO_KEY = "io.modelcontextprotocol/clientInfo"
CLIENT_CAPS_KEY = "io.modelcontextprotocol/clientCapabilities"
SUBSCRIPTION_ID_KEY = "io.modelcontextprotocol/subscriptionId"


def envelope(*, version: str = PROTOCOL_VERSION, client_capabilities: dict | None = None) -> dict:
  """Build a valid per-request ``_meta`` envelope (§4.3).

  ``version`` and ``client_capabilities`` are overridable so a test can drive the
  header-vs-body version mismatch and Tasks-capability paths.
  """
  return {
    PV_KEY: version,
    CLIENT_INFO_KEY: dict(CLIENT),
    CLIENT_CAPS_KEY: client_capabilities if client_capabilities is not None else {},
  }


def headers_for(method: str, *, name: str | None = None) -> dict:
  """Build the §9.3–§9.4 required + routing headers for ``method``.

  ``tools/call`` / ``prompts/get`` / ``resources/read`` additionally carry an
  ``Mcp-Name`` routing header; ``name`` supplies it for those.
  """
  hdr = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL_VERSION,
    "mcp-method": method,
  }
  if name is not None:
    hdr["mcp-name"] = name
  return hdr


def request_body(request_id, method: str, params: dict | None = None, *, with_meta: bool = True) -> bytes:
  """Serialize a JSON-RPC request body, stamping the ``_meta`` envelope unless suppressed."""
  params = dict(params or {})
  if with_meta and "_meta" not in params:
    params["_meta"] = envelope()
  body: dict = {"jsonrpc": "2.0", "id": request_id, "method": method}
  if params:
    body["params"] = params
  return json.dumps(body).encode("utf-8")


# ─── The ASGI driving harness ──────────────────────────────────────────────────


async def _drive(
  handler,
  *,
  method: str = "POST",
  path: str = "/mcp",
  headers: dict | None = None,
  body: bytes = b"",
  origin: str | None = None,
  scheme: str = "http",
  netloc: str = "localhost",
  disconnect_after_first: bool = False,
) -> tuple[int, dict, str]:
  """Call ``handler`` with a built ``Request`` and run the response through ASGI.

  Returns ``(status, headers, body_text)`` where ``headers`` keys are lowercased for
  case-insensitive assertions (the single-JSON path emits ``Content-Type`` title-cased,
  the streaming path lowercased).

  ``disconnect_after_first`` delivers ``http.disconnect`` immediately after the first
  SSE frame is written — required for open ``subscriptions/listen`` streams, which never
  end on their own. Otherwise ``http.disconnect`` is withheld until the whole response
  has been sent so finite request streams run to EOF.
  """
  host = netloc.split(":")[0]
  port = int(netloc.split(":")[1]) if ":" in netloc else (443 if scheme == "https" else 80)
  hlist = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
  if origin is not None:
    hlist.append((b"origin", origin.encode()))
  scope = {
    "type": "http",
    "http_version": "1.1",
    "method": method,
    "path": path,
    "raw_path": path.encode(),
    "root_path": "",
    "headers": hlist,
    "query_string": b"",
    "scheme": scheme,
    "server": (host, port),
    "client": ("testclient", 50000),
  }

  fully_sent = asyncio.Event()
  first_frame = asyncio.Event()
  delivered = {"body": False}

  async def receive() -> dict:
    if not delivered["body"]:
      delivered["body"] = True
      return {"type": "http.request", "body": body, "more_body": False}
    # Hold the connection open until the right teardown moment, then disconnect.
    await (first_frame if disconnect_after_first else fully_sent).wait()
    return {"type": "http.disconnect"}

  request = Request(scope, receive)
  response = await asyncio.wait_for(handler(request), timeout=8)

  status: dict = {}
  chunks: list[bytes] = []

  async def send(message: dict) -> None:
    if message["type"] == "http.response.start":
      status["code"] = message["status"]
      status["headers"] = {k.decode().lower(): v.decode() for k, v in message["headers"]}
    elif message["type"] == "http.response.body":
      chunk = message.get("body", b"")
      chunks.append(chunk)
      if chunk:
        first_frame.set()
      if not message.get("more_body", False):
        fully_sent.set()

  try:
    await asyncio.wait_for(response(scope, receive, send), timeout=8)
  except asyncio.CancelledError:
    # An open subscription stream is cancelled by the simulated disconnect — expected.
    pass
  return status["code"], status.get("headers", {}), b"".join(chunks).decode("utf-8")


def call(handler, **kwargs) -> tuple[int, dict, str]:
  """Synchronous wrapper around :func:`_drive` — each test owns its own event loop."""
  return asyncio.run(_drive(handler, **kwargs))


def sse_frames(text: str) -> list[dict]:
  """Parse an SSE body into the ordered list of JSON-decoded ``data:`` payloads."""
  frames: list[dict] = []
  for block in text.split("\n\n"):
    line = block.strip()
    if line.startswith("data:"):
      frames.append(json.loads(line[len("data:") :].strip()))
  return frames


def json_body(text: str) -> dict:
  """Decode a single ``application/json`` response body."""
  return json.loads(text)


# ─── Server builders ───────────────────────────────────────────────────────────


def build_server() -> McpServer:
  """Build the canonical test server with the four required tool shapes and the
  ``{tools:{listChanged}, logging, resources, prompts}`` capability set.
  """
  server = McpServer(
    INFO,
    {"tools": {"listChanged": True}, "logging": {}, "resources": {}, "prompts": {}},
  )

  # A read-only, non-streaming tool (echo): emits nothing, so the lazy-commit path keeps
  # it on a single application/json response.
  server.register_tool(
    "echo",
    lambda args, ctx: {"content": [{"type": "text", "text": str(args.get("msg", ""))}]},
    description="echoes its msg argument",
  )

  # A streaming tool: ctx.log emits a notifications/message frame, committing to SSE.
  def chatty(_args: dict, ctx) -> dict:
    ctx.log("info", "working")
    return {"content": [{"type": "text", "text": "done"}]}

  server.register_tool("chatty", chatty)

  # An MRTR elicitation tool: solicits client input, returning input_required until the
  # client supplies inputResponses (§11), then echoes them as structuredContent.
  def register_user(_args: dict, ctx) -> dict:
    answer = ctx.elicit_input({"mode": "form", "message": "name?"})
    return {"content": [{"type": "text", "text": "registered"}], "structuredContent": answer}

  server.register_tool("register_user", register_user)

  # A tool that broadcasts a tools/list_changed change notification to subscribers (§10.5).
  def announce(_args: dict, ctx) -> dict:
    ctx.notify_subscribers({"method": "notifications/tools/list_changed", "params": {}})
    return {"content": [{"type": "text", "text": "announced"}]}

  server.register_tool("announce", announce)

  # A tool that echoes the auth identity threaded from the gate (ctx.auth_info).
  def whoami(_args: dict, ctx) -> dict:
    return {"content": [{"type": "text", "text": json.dumps(ctx.auth_info)}]}

  server.register_tool("whoami", whoami)

  return server


def build_task_server() -> tuple[McpServer, InMemoryTaskStore]:
  """Build a Tasks-extension server whose ``slow`` tool returns a task handle."""
  store = InMemoryTaskStore()
  server = McpServer(INFO, {"tools": {}, "extensions": {TASKS_EXTENSION_ID: {}}})
  server.set_task_store(store)

  def slow(_args: dict, ctx) -> dict:
    handle = store.create_task(ttl_ms=60000)
    return {"task": handle}

  server.register_tool("slow", slow)
  return server, store


def handler() -> object:
  """A handler over the canonical test server with default settings."""
  return create_asgi_mcp_handler(build_server())


# ─── 0. SSE serializer rejects non-finite numbers (S02 wire boundary) ──────────


class TestSseEncoderRejectsNonFinite:
  """The live ASGI SSE serializer never puts an invalid bare ``NaN``/``Infinity`` token on
  the wire — JSON has no non-finite numbers, so encoding one raises. (S02; R-7.1-b)
  """

  def test_finite_message_serializes(self):
    event = _sse({"jsonrpc": "2.0", "id": 1, "result": {"x": 3.5}})
    assert event.startswith("data: ") and event.endswith("\n\n")

  def test_non_finite_raises(self):
    import pytest

    for value in (float("nan"), float("inf"), float("-inf")):
      with pytest.raises(ValueError):
        _sse({"jsonrpc": "2.0", "id": 1, "result": {"x": value}})


# ─── 1. HTTP method / path / CORS gating ───────────────────────────────────────


class TestMethodAndPathGating:
  def test_options_returns_204_with_cors(self):
    status, hdr, _ = call(handler(), method="OPTIONS")
    assert status == 204
    assert hdr["access-control-allow-origin"] == "*"
    assert "POST" in hdr["access-control-allow-methods"]

  def test_options_does_not_advertise_session_id_header(self):
    # Statelessness (§9.9): no Mcp-Session-Id anywhere in the CORS allow-list.
    _, hdr, _ = call(handler(), method="OPTIONS")
    assert "mcp-session-id" not in hdr.get("access-control-allow-headers", "").lower()

  def test_non_mcp_path_returns_404(self):
    status, _, text = call(handler(), method="POST", path="/elsewhere", body=b"{}")
    assert status == 404
    assert json_body(text) == {"error": "not found"}

  def test_get_returns_405(self):
    status, _, text = call(handler(), method="GET")
    assert status == 405
    assert json_body(text)["error"]["message"] == "Method not allowed"

  def test_delete_returns_405(self):
    status, _, _ = call(handler(), method="DELETE")
    assert status == 405

  def test_cors_disabled_omits_origin_header(self):
    h = create_asgi_mcp_handler(build_server(), cors=None)
    _, hdr, _ = call(h, method="OPTIONS")
    assert "access-control-allow-origin" not in hdr

  def test_health_endpoint_served_on_any_method(self):
    status, _, text = call(handler(), method="GET", path="/health")
    assert status == 200
    assert json_body(text) == {"status": "ok", "name": "srv"}


# ─── 2. Routing-header & _meta validation (§9.3–§9.4, §4.3) ────────────────────


class TestRequestHeaderValidation:
  def _reject_code(self, **overrides) -> tuple[int, int]:
    """Drive a ``tools/call`` echo with header overrides; return ``(status, error_code)``.

    An override value of ``None`` deletes the header (mirrors a missing header).
    """
    hdr = headers_for("tools/call", name="echo")
    for key, value in overrides.items():
      key = key.replace("_", "-")
      if value is None:
        hdr.pop(key, None)
      else:
        hdr[key] = value
    body = request_body(1, "tools/call", {"name": "echo", "arguments": {"msg": "hi"}})
    status, _, text = call(handler(), headers=hdr, body=body)
    return status, json_body(text)["error"]["code"]

  def test_missing_content_type_rejected(self):
    status, code = self._reject_code(content_type=None)
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_wrong_content_type_rejected(self):
    status, code = self._reject_code(content_type="text/plain")
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_content_type_with_charset_parameter_accepted(self):
    # A parameterized Content-Type is normalized to its media type before comparison,
    # so the request dispatches successfully (no header-mismatch rejection).
    hdr = headers_for("tools/call", name="echo")
    hdr["content-type"] = "application/json; charset=utf-8"
    body = request_body(1, "tools/call", {"name": "echo", "arguments": {"msg": "hi"}})
    status, _, text = call(handler(), headers=hdr, body=body)
    assert status == 200
    assert json_body(text)["result"]["content"][0]["text"] == "hi"

  def test_accept_missing_event_stream_rejected(self):
    status, code = self._reject_code(accept="application/json")
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_accept_missing_json_rejected(self):
    status, code = self._reject_code(accept="text/event-stream")
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_missing_mcp_method_rejected(self):
    status, code = self._reject_code(mcp_method=None)
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_mcp_method_mismatch_rejected(self):
    status, code = self._reject_code(mcp_method="tools/list")
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_missing_mcp_name_for_tools_call_rejected(self):
    status, code = self._reject_code(mcp_name=None)
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_mcp_name_mismatch_rejected(self):
    status, code = self._reject_code(mcp_name="not-echo")
    assert status == 400 and code == HEADER_MISMATCH_CODE

  def test_extra_mcp_name_for_method_without_name_rejected(self):
    # tools/list takes no Mcp-Name routing header; sending one is a mismatch.
    hdr = headers_for("tools/list")
    hdr["mcp-name"] = "echo"
    body = request_body(1, "tools/list", {})
    status, _, text = call(handler(), headers=hdr, body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == HEADER_MISMATCH_CODE


class TestParamHeaderValidation:
  """End-to-end §9.5.4 receiver validation: the handler validates ``Mcp-Param-*`` headers
  against the request body using the tool's annotated ``inputSchema`` (R-9.5.4-b/-c)."""

  def _handler(self):
    """A handler whose ``geocode`` tool annotates ``region`` with ``x-mcp-header``."""
    server = McpServer(INFO, {"tools": {}})
    server.register_tool(
      "geocode",
      lambda args, ctx: {"content": [{"type": "text", "text": str(args.get("region", ""))}]},
      input_schema={
        "type": "object",
        "properties": {"region": {"type": "string", "x-mcp-header": "Region"}},
      },
    )
    return create_asgi_mcp_handler(server)

  def _headers(self, **extra) -> dict:
    hdr = headers_for("tools/call", name="geocode")
    hdr.update({k.replace("_", "-"): v for k, v in extra.items()})
    return hdr

  def _body(self, region: str) -> bytes:
    return request_body(1, "tools/call", {"name": "geocode", "arguments": {"region": region}})

  def test_matching_param_header_accepted(self):
    # The Mcp-Param-Region header matches the body argument → dispatch succeeds.
    hdr = self._headers(**{"mcp-param-region": "us-east"})
    status, _, text = call(self._handler(), headers=hdr, body=self._body("us-east"))
    assert status == 200
    assert json_body(text)["result"]["content"][0]["text"] == "us-east"

  def test_value_mismatch_rejected(self):
    # Header value disagrees with the body argument → 400 + -32001 (R-9.5.4-c).
    hdr = self._headers(**{"mcp-param-region": "us-west"})
    status, _, text = call(self._handler(), headers=hdr, body=self._body("us-east"))
    assert status == 400
    assert json_body(text)["error"]["code"] == HEADER_MISMATCH_CODE

  def test_impermissible_characters_rejected(self):
    # A header carrying a non-permissible (control) character → 400 + -32001 (R-9.5.4-b).
    hdr = self._headers(**{"mcp-param-region": "us\x01east"})
    status, _, text = call(self._handler(), headers=hdr, body=self._body("us\x01east"))
    assert status == 400
    assert json_body(text)["error"]["code"] == HEADER_MISMATCH_CODE

  def test_missing_required_param_header_rejected(self):
    # The body carries the annotated value but the header is omitted → 400 + -32001.
    hdr = self._headers()  # no Mcp-Param-Region
    status, _, text = call(self._handler(), headers=hdr, body=self._body("us-east"))
    assert status == 400
    assert json_body(text)["error"]["code"] == HEADER_MISMATCH_CODE


class TestProtocolVersionValidation:
  def test_missing_protocol_version_header_rejected(self):
    hdr = headers_for("tools/list")
    hdr.pop("mcp-protocol-version")
    status, _, text = call(handler(), headers=hdr, body=request_body(1, "tools/list", {}))
    assert status == 400
    assert json_body(text)["error"]["code"] == HEADER_MISMATCH_CODE

  def test_header_vs_body_meta_version_mismatch_rejected(self):
    # Header is the current version but the body _meta declares a different one (§5.2).
    hdr = headers_for("tools/list")
    body = request_body(1, "tools/list", {"_meta": envelope(version="2025-01-01")})
    status, _, text = call(handler(), headers=hdr, body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == HEADER_MISMATCH_CODE

  def test_unsupported_version_in_both_header_and_body_is_minus_32004(self):
    # A matching-but-unimplemented revision is the -32004 path (R-9.3.3-e).
    hdr = headers_for("tools/list")
    hdr["mcp-protocol-version"] = "1999-01-01"
    body = request_body(1, "tools/list", {"_meta": envelope(version="1999-01-01")})
    status, _, text = call(handler(), headers=hdr, body=body)
    assert status == 400
    err = json_body(text)["error"]
    assert err["code"] == UNSUPPORTED_PROTOCOL_VERSION_CODE
    assert err["data"]["requested"] == "1999-01-01"
    assert PROTOCOL_VERSION in err["data"]["supported"]


class TestMetaEnvelopeGate:
  def test_missing_meta_envelope_rejected(self):
    body = request_body(1, "tools/list", {}, with_meta=False)
    status, _, text = call(handler(), headers=headers_for("tools/list"), body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == INVALID_PARAMS_CODE

  def test_meta_missing_client_info_rejected(self):
    meta = envelope()
    del meta[CLIENT_INFO_KEY]
    body = request_body(1, "tools/list", {"_meta": meta})
    status, _, text = call(handler(), headers=headers_for("tools/list"), body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == INVALID_PARAMS_CODE

  def test_meta_malformed_client_info_rejected(self):
    # clientInfo missing its REQUIRED version → invalid Implementation → -32602.
    meta = envelope()
    meta[CLIENT_INFO_KEY] = {"name": "cli"}
    body = request_body(1, "tools/list", {"_meta": meta})
    status, _, text = call(handler(), headers=headers_for("tools/list"), body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == INVALID_PARAMS_CODE

  def test_meta_missing_client_capabilities_rejected(self):
    meta = envelope()
    del meta[CLIENT_CAPS_KEY]
    body = request_body(1, "tools/list", {"_meta": meta})
    status, _, text = call(handler(), headers=headers_for("tools/list"), body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == INVALID_PARAMS_CODE


# ─── 3. Malformed body / classification ────────────────────────────────────────


class TestPayloadSizeBound:
  """B4 (R-28.10-l): an inbound request body larger than the configured bound is rejected
  with HTTP 413 BEFORE it is parsed.
  """

  def test_oversized_body_rejected_with_413(self):
    h = create_asgi_mcp_handler(build_server(), max_request_bytes=200)
    body = request_body(1, "tools/call", {"name": "echo", "arguments": {"msg": "x" * 1000}})
    assert len(body) > 200
    status, _, _ = call(h, headers=headers_for("tools/call", name="echo"), body=body)
    assert status == 413

  def test_within_bound_dispatches_normally(self):
    h = create_asgi_mcp_handler(build_server(), max_request_bytes=10_000)
    body = request_body(2, "tools/call", {"name": "echo", "arguments": {"msg": "hi"}})
    status, _, text = call(h, headers=headers_for("tools/call", name="echo"), body=body)
    assert status == 200
    assert json_body(text)["result"]["content"][0]["text"] == "hi"


class TestBodyParsing:
  def test_malformed_json_is_400_parse_error(self):
    status, _, text = call(
      handler(),
      headers={"content-type": "application/json", "accept": "application/json, text/event-stream"},
      body=b"{not valid json",
    )
    assert status == 400
    err = json_body(text)["error"]
    assert err["code"] == PARSE_ERROR_CODE
    assert json_body(text)["id"] is None

  def test_invalid_utf8_body_is_400_parse_error(self):
    status, _, text = call(
      handler(),
      headers={"content-type": "application/json", "accept": "application/json, text/event-stream"},
      body=b"\xff\xfe\x00bad",
    )
    assert status == 400
    assert json_body(text)["error"]["code"] == PARSE_ERROR_CODE

  def test_batch_array_rejected_as_invalid_request(self):
    # A top-level JSON array (batch) is malformed → -32600 / 400.
    from mcp.protocol.errors import INVALID_REQUEST_CODE

    status, _, text = call(
      handler(),
      headers={"content-type": "application/json", "accept": "application/json, text/event-stream"},
      body=b'[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
    )
    assert status == 400
    assert json_body(text)["error"]["code"] == INVALID_REQUEST_CODE


# ─── 4. Notifications & client responses → 202 ─────────────────────────────────


class TestAcknowledgedMessages:
  def _ack_headers(self) -> dict:
    return {"content-type": "application/json", "accept": "application/json, text/event-stream"}

  def test_client_notification_returns_202(self):
    body = json.dumps(
      {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}}
    ).encode()
    status, _, text = call(handler(), headers=self._ack_headers(), body=body)
    assert status == 202
    assert text == ""

  def test_generic_notification_returns_202(self):
    body = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}).encode()
    status, _, _ = call(handler(), headers=self._ack_headers(), body=body)
    assert status == 202

  def test_client_result_response_returns_202(self):
    body = json.dumps({"jsonrpc": "2.0", "id": "srv-1", "result": {}}).encode()
    status, _, _ = call(handler(), headers=self._ack_headers(), body=body)
    assert status == 202

  def test_client_error_response_returns_202(self):
    body = json.dumps({"jsonrpc": "2.0", "id": "srv-1", "error": {"code": -1, "message": "x"}}).encode()
    status, _, _ = call(handler(), headers=self._ack_headers(), body=body)
    assert status == 202


# ─── 5. initialize, discover, single-JSON results ──────────────────────────────


class TestSingleJsonResponses:
  def test_initialize_is_exempt_from_meta_gate(self):
    # initialize is the one legacy method exempt from the _meta envelope gate (§9.12).
    hdr = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "mcp-method": "initialize",
    }
    body = json.dumps(
      {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": PROTOCOL_VERSION}}
    ).encode()
    status, hdr_out, text = call(handler(), headers=hdr, body=body)
    assert status == 200
    assert "application/json" in hdr_out["content-type"]
    result = json_body(text)["result"]
    assert result["protocolVersion"] == PROTOCOL_VERSION
    assert result["serverInfo"] == INFO

  def test_server_discover_returns_serverinfo_and_capabilities(self):
    body = request_body(1, "server/discover", {})
    status, hdr_out, text = call(handler(), headers=headers_for("server/discover"), body=body)
    assert status == 200
    assert "application/json" in hdr_out["content-type"]
    result = json_body(text)["result"]
    assert result["serverInfo"] == INFO
    assert result["capabilities"]["tools"] == {"listChanged": True}
    assert PROTOCOL_VERSION in result["supportedVersions"]

  def test_non_streaming_tool_returns_single_json(self):
    body = request_body(7, "tools/call", {"name": "echo", "arguments": {"msg": "hello"}})
    status, hdr_out, text = call(handler(), headers=headers_for("tools/call", name="echo"), body=body)
    assert status == 200
    # NOT an event stream — nothing streamed, so it stays single JSON (§9.6.1).
    assert "application/json" in hdr_out["content-type"]
    assert "text/event-stream" not in hdr_out["content-type"]
    result = json_body(text)
    assert result["id"] == 7
    assert result["result"]["content"][0]["text"] == "hello"
    assert result["result"]["resultType"] == "complete"

  def test_tools_list_returns_registered_tools(self):
    body = request_body(2, "tools/list", {})
    status, _, text = call(handler(), headers=headers_for("tools/list"), body=body)
    assert status == 200
    names = {t["name"] for t in json_body(text)["result"]["tools"]}
    assert {"echo", "chatty", "register_user", "announce", "whoami"} <= names


# ─── 6. Error-code → HTTP status mapping (§9.7) ────────────────────────────────


class TestErrorStatusMapping:
  def test_method_not_found_maps_to_404(self):
    body = request_body(1, "does/not/exist", {})
    hdr = headers_for("does/not/exist")
    status, _, text = call(handler(), headers=hdr, body=body)
    assert status == 404
    assert json_body(text)["error"]["code"] == METHOD_NOT_FOUND_CODE

  def test_unknown_tool_maps_to_400(self):
    body = request_body(2, "tools/call", {"name": "nope", "arguments": {}})
    status, _, text = call(handler(), headers=headers_for("tools/call", name="nope"), body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == INVALID_PARAMS_CODE

  def test_unadvertised_capability_method_maps_to_404(self):
    # A server without the completions capability answers completion/complete with -32601.
    server = McpServer(INFO, {"tools": {}})
    h = create_asgi_mcp_handler(server)
    body = request_body(3, "completion/complete", {"ref": {"type": "ref/prompt", "name": "p"}})
    status, _, text = call(h, headers=headers_for("completion/complete"), body=body)
    assert status == 404
    assert json_body(text)["error"]["code"] == METHOD_NOT_FOUND_CODE

  def test_internal_error_from_crashing_tool_maps_to_400(self):
    from mcp.protocol.errors import INTERNAL_ERROR_CODE

    server = McpServer(INFO, {"tools": {}})

    def boom(_args, _ctx):
      raise RuntimeError("kaboom")

    server.register_tool("boom", boom)
    h = create_asgi_mcp_handler(server)
    body = request_body(4, "tools/call", {"name": "boom"})
    status, _, text = call(h, headers=headers_for("tools/call", name="boom"), body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == INTERNAL_ERROR_CODE


# ─── 7. Lazy-commit SSE streaming (§9.6) ───────────────────────────────────────


class TestStreaming:
  def test_streaming_tool_emits_notifications_then_final(self):
    body = request_body(9, "tools/call", {"name": "chatty"})
    status, hdr_out, text = call(handler(), headers=headers_for("tools/call", name="chatty"), body=body)
    assert status == 200
    assert "text/event-stream" in hdr_out["content-type"]
    frames = sse_frames(text)
    # The log notification frame precedes the final response frame.
    assert frames[0]["method"] == "notifications/message"
    assert frames[0]["params"]["level"] == "info"
    final = frames[-1]
    assert final["id"] == 9
    assert final["result"]["content"][0]["text"] == "done"
    assert final["result"]["resultType"] == "complete"

  def test_stream_headers_disable_buffering(self):
    body = request_body(9, "tools/call", {"name": "chatty"})
    _, hdr_out, _ = call(handler(), headers=headers_for("tools/call", name="chatty"), body=body)
    assert "no-cache" in hdr_out.get("cache-control", "")
    assert hdr_out.get("x-accel-buffering") == "no"

  def test_silent_tool_stays_single_json_not_sse(self):
    body = request_body(10, "tools/call", {"name": "echo", "arguments": {"msg": "x"}})
    _, hdr_out, text = call(handler(), headers=headers_for("tools/call", name="echo"), body=body)
    assert "application/json" in hdr_out["content-type"]
    assert "text/event-stream" not in hdr_out["content-type"]
    assert json_body(text)["result"]["content"][0]["text"] == "x"

  def test_log_below_min_level_does_not_stream(self):
    # A debug log is below the default "info" minimum, so nothing commits → single JSON.
    server = McpServer(INFO, {"tools": {}, "logging": {}})

    def quietlog(_args, ctx):
      ctx.log("debug", "suppressed")
      return {"content": [{"type": "text", "text": "ok"}]}

    server.register_tool("quietlog", quietlog)
    h = create_asgi_mcp_handler(server)
    body = request_body(11, "tools/call", {"name": "quietlog"})
    _, hdr_out, text = call(h, headers=headers_for("tools/call", name="quietlog"), body=body)
    assert "application/json" in hdr_out["content-type"]
    assert json_body(text)["result"]["content"][0]["text"] == "ok"


# ─── 8. MRTR elicitation (§11) ─────────────────────────────────────────────────


class TestElicitation:
  def test_first_round_returns_input_required(self):
    body = request_body(12, "tools/call", {"name": "register_user"})
    status, hdr_out, text = call(
      handler(), headers=headers_for("tools/call", name="register_user"), body=body
    )
    assert status == 200
    assert "application/json" in hdr_out["content-type"]
    result = json_body(text)["result"]
    assert result["resultType"] == "input_required"
    assert "in-1" in result["inputRequests"]
    assert result["inputRequests"]["in-1"]["method"] == "elicitation/create"
    assert isinstance(result["requestState"], str)

  def test_second_round_with_input_responses_resolves(self):
    body = request_body(
      13,
      "tools/call",
      {"name": "register_user", "inputResponses": {"in-1": {"answer": "Bob"}}},
    )
    status, _, text = call(handler(), headers=headers_for("tools/call", name="register_user"), body=body)
    assert status == 200
    result = json_body(text)["result"]
    assert result["resultType"] == "complete"
    assert result["structuredContent"] == {"answer": "Bob"}


# ─── 9. subscriptions/listen (§10) ─────────────────────────────────────────────


class TestSubscriptions:
  def _listen(self, server: McpServer, request_id, notifications: dict) -> tuple[int, dict, str]:
    h = create_asgi_mcp_handler(server)
    body = json.dumps(
      {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "subscriptions/listen",
        "params": {"notifications": notifications, "_meta": envelope()},
      }
    ).encode()
    # The stream stays open until torn down (§10.7); disconnect right after the ack frame.
    return call(
      h,
      headers=headers_for("subscriptions/listen"),
      body=body,
      disconnect_after_first=True,
    )

  def test_listen_acknowledges_with_honored_filter_and_subscription_id(self):
    server = McpServer(INFO, {"tools": {"listChanged": True}})
    status, hdr_out, text = self._listen(server, "sub-1", {"toolsListChanged": True})
    assert status == 200
    assert "text/event-stream" in hdr_out["content-type"]
    ack = sse_frames(text)[0]
    assert ack["method"] == "notifications/subscriptions/acknowledged"
    assert ack["params"]["notifications"].get("toolsListChanged") is True
    assert ack["params"]["_meta"][SUBSCRIPTION_ID_KEY] == "sub-1"

  def test_listen_drops_unsupported_kind_from_honored_filter(self):
    # promptsListChanged is requested but the server never advertised prompts → dropped.
    server = McpServer(INFO, {"tools": {"listChanged": True}})
    _, _, text = self._listen(server, "sub-2", {"toolsListChanged": True, "promptsListChanged": True})
    ack = sse_frames(text)[0]
    honored = ack["params"]["notifications"]
    assert honored.get("toolsListChanged") is True
    assert "promptsListChanged" not in honored

  def test_listen_taskids_without_tasks_capability_is_minus_32003(self):
    # §25.10: a taskIds opt-in without the negotiated Tasks extension → -32003.
    server = McpServer(INFO, {"tools": {}})
    h = create_asgi_mcp_handler(server)
    body = json.dumps(
      {
        "jsonrpc": "2.0",
        "id": "sub-3",
        "method": "subscriptions/listen",
        "params": {"notifications": {"taskIds": ["t1"]}, "_meta": envelope()},
      }
    ).encode()
    status, _, text = call(h, headers=headers_for("subscriptions/listen"), body=body)
    assert json_body(text)["error"]["code"] == MISSING_CLIENT_CAPABILITY_CODE


# ─── 9b. subscriptions/listen fan-out, end-to-end (§10.5) ──────────────────────


class TestSubscriptionFanOutEndToEnd:
  """End-to-end multi-frame fan-out: an open ``subscriptions/listen`` stream receives a
  SECOND SSE frame — a change notification broadcast by a *separate*, concurrently-running
  ``tools/call`` via ``ctx.notify_subscribers`` — that is filtered by ``may_emit`` and
  tagged with the stream's subscription id; a client disconnect then tears it down.

  The unit suite covers ``fan_out`` / ``may_emit`` / ``Subscription`` in isolation; this
  drives the live wiring (worker-thread broadcast → ``call_soon_threadsafe`` → the open
  stream's ``asyncio.Queue`` → SSE frame) through a single shared handler instance so both
  requests see the same in-closure subscription registry. (§10.5, R-10.5-l)
  """

  @staticmethod
  def _scope(headers: dict) -> dict:
    hlist = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return {
      "type": "http",
      "http_version": "1.1",
      "method": "POST",
      "path": "/mcp",
      "raw_path": b"/mcp",
      "root_path": "",
      "headers": hlist,
      "query_string": b"",
      "scheme": "http",
      "server": ("localhost", 80),
      "client": ("testclient", 50000),
    }

  def test_open_stream_receives_filtered_broadcast_then_tears_down(self):
    asyncio.run(asyncio.wait_for(self._scenario(), timeout=8))

  async def _scenario(self) -> None:
    server = McpServer(INFO, {"tools": {"listChanged": True}, "resources": {}})

    def announce(_args, ctx) -> dict:
      # A kind sub-1 did NOT subscribe to → dropped by may_emit (the filtering assertion).
      ctx.notify_subscribers(
        {"method": "notifications/resources/updated", "params": {"uri": "file:///not-watched"}}
      )
      # A kind sub-1 DID subscribe to → delivered and tagged with the subscription id.
      ctx.notify_subscribers({"method": "notifications/tools/list_changed", "params": {}})
      return {"content": [{"type": "text", "text": "announced"}]}

    server.register_tool("announce", announce)
    h = create_asgi_mcp_handler(server)

    sub_frames: list[dict] = []
    ack_seen = asyncio.Event()
    broadcast_seen = asyncio.Event()
    disconnect = asyncio.Event()
    body_sent = {"done": False}

    sub_body = json.dumps(
      {
        "jsonrpc": "2.0",
        "id": "sub-1",
        "method": "subscriptions/listen",
        "params": {"notifications": {"toolsListChanged": True}, "_meta": envelope()},
      }
    ).encode()
    sub_scope = self._scope(headers_for("subscriptions/listen"))

    async def sub_receive() -> dict:
      if not body_sent["done"]:
        body_sent["done"] = True
        return {"type": "http.request", "body": sub_body, "more_body": False}
      # Hold the stream open until the test decides to tear it down.
      await disconnect.wait()
      return {"type": "http.disconnect"}

    async def sub_send(message: dict) -> None:
      if message["type"] != "http.response.body":
        return
      chunk = message.get("body", b"")
      if not chunk:
        return
      for frame in sse_frames(chunk.decode("utf-8")):
        sub_frames.append(frame)
        if frame.get("method") == "notifications/subscriptions/acknowledged":
          ack_seen.set()
        elif frame.get("method") == "notifications/tools/list_changed":
          broadcast_seen.set()

    # Build + register the subscription (the registry entry is created synchronously here),
    # then run its open stream as a background task.
    sub_response = await h(Request(sub_scope, sub_receive))

    async def run_sub() -> None:
      try:
        await sub_response(sub_scope, sub_receive, sub_send)
      except asyncio.CancelledError:
        pass  # the simulated disconnect cancels the open stream — expected

    sub_task = asyncio.create_task(run_sub())
    await asyncio.wait_for(ack_seen.wait(), timeout=4)

    # A separate, concurrent request invokes announce; its worker thread fans the
    # broadcast out to the registry shared through this same handler.
    announce_body = request_body(99, "tools/call", {"name": "announce"})
    status, _, _ = await _drive(h, headers=headers_for("tools/call", name="announce"), body=announce_body)
    assert status == 200

    # The honored notification arrives on the open stream as a SECOND frame.
    await asyncio.wait_for(broadcast_seen.wait(), timeout=4)

    # Unsubscribe: a client disconnect tears the stream down and the task completes.
    disconnect.set()
    await asyncio.wait_for(sub_task, timeout=4)

    methods = [f.get("method") for f in sub_frames]
    assert methods[0] == "notifications/subscriptions/acknowledged"
    # Exactly the honored kind got through; the unsubscribed kind was filtered by may_emit.
    assert "notifications/tools/list_changed" in methods
    assert "notifications/resources/updated" not in methods
    broadcast = next(f for f in sub_frames if f.get("method") == "notifications/tools/list_changed")
    assert broadcast["params"]["_meta"][SUBSCRIPTION_ID_KEY] == "sub-1"


# ─── 10. Tasks extension: task-handle results ──────────────────────────────────


class TestTaskResults:
  def test_task_tool_returns_task_result_single_json(self):
    server, _ = build_task_server()
    h = create_asgi_mcp_handler(server)
    client_caps = {"extensions": {TASKS_EXTENSION_ID: {}}}
    body = request_body(
      14,
      "tools/call",
      {"name": "slow", "task": {"ttl": 60000}, "_meta": envelope(client_capabilities=client_caps)},
    )
    status, hdr_out, text = call(h, headers=headers_for("tools/call", name="slow"), body=body)
    assert status == 200
    assert "application/json" in hdr_out["content-type"]
    result = json_body(text)["result"]
    assert result["resultType"] == "task"
    assert result["status"] == "working"
    assert isinstance(result["taskId"], str)

  def test_tasks_get_polls_task_status(self):
    server, store = build_task_server()
    h = create_asgi_mcp_handler(server)
    task = store.create_task(task_id="poll-me", ttl_ms=60000)
    body = request_body(15, "tasks/get", {"taskId": task["taskId"]})
    status, _, text = call(h, headers=headers_for("tasks/get"), body=body)
    assert status == 200
    result = json_body(text)["result"]
    assert result["taskId"] == "poll-me"
    assert result["status"] == "working"

  def test_tasks_get_unknown_id_is_minus_32602(self):
    server, _ = build_task_server()
    h = create_asgi_mcp_handler(server)
    body = request_body(16, "tasks/get", {"taskId": "ghost"})
    status, _, text = call(h, headers=headers_for("tasks/get"), body=body)
    assert status == 400
    assert json_body(text)["error"]["code"] == INVALID_PARAMS_CODE


# ─── 11. notify_subscribers (tools/list_changed broadcast) ─────────────────────


class TestNotifySubscribers:
  def test_announce_tool_broadcasts_and_returns_normally(self):
    # With no active subscription the fan-out is a no-op; the tool result is unaffected.
    body = request_body(17, "tools/call", {"name": "announce"})
    status, hdr_out, text = call(handler(), headers=headers_for("tools/call", name="announce"), body=body)
    assert status == 200
    assert "application/json" in hdr_out["content-type"]
    assert json_body(text)["result"]["content"][0]["text"] == "announced"


# ─── 12. Origin / DNS-rebinding gating (§9.11) ─────────────────────────────────


class TestOriginGating:
  def _echo(self, h, origin: str | None) -> int:
    body = request_body(18, "tools/call", {"name": "echo", "arguments": {"msg": "x"}})
    status, _, _ = call(h, headers=headers_for("tools/call", name="echo"), body=body, origin=origin)
    return status

  def test_no_origin_allowed(self):
    assert self._echo(handler(), None) == 200

  def test_same_origin_allowed(self):
    # The scope server is localhost:80 → same-origin is http://localhost.
    assert self._echo(handler(), "http://localhost") == 200

  def test_cross_origin_rejected_without_allowlist(self):
    body = request_body(18, "tools/call", {"name": "echo", "arguments": {"msg": "x"}})
    status, _, text = call(
      handler(), headers=headers_for("tools/call", name="echo"), body=body, origin="https://evil.test"
    )
    assert status == 403
    assert json_body(text)["error"]["message"].startswith("Origin not permitted")

  def test_cross_origin_admitted_when_allowlisted(self):
    h = create_asgi_mcp_handler(build_server(), allowed_origins={"https://ok.test"})
    assert self._echo(h, "https://ok.test") == 200
    assert self._echo(h, "https://evil.test") == 403

  def test_wildcard_allowlist_admits_any_origin(self):
    h = create_asgi_mcp_handler(build_server(), allowed_origins={"*"})
    assert self._echo(h, "https://anywhere.test") == 200


# ─── 13. Bearer auth gate (§23) ────────────────────────────────────────────────


class TestAuthGate:
  def test_rejecting_gate_short_circuits_with_status_and_www_authenticate(self):
    def gate(_request):
      return {
        "ok": False,
        "status": 401,
        "wwwAuthenticate": 'Bearer error="invalid_token"',
        "body": {"error": "invalid_token"},
      }

    h = create_asgi_mcp_handler(build_server(), auth_gate=gate)
    body = request_body(19, "tools/call", {"name": "echo", "arguments": {"msg": "x"}})
    status, hdr_out, text = call(h, headers=headers_for("tools/call", name="echo"), body=body)
    assert status == 401
    assert hdr_out["www-authenticate"] == 'Bearer error="invalid_token"'
    assert json_body(text) == {"error": "invalid_token"}

  def test_rejecting_gate_defaults_to_401_without_www_authenticate(self):
    def gate(_request):
      return {"ok": False, "body": {"error": "denied"}}

    h = create_asgi_mcp_handler(build_server(), auth_gate=gate)
    body = request_body(20, "tools/call", {"name": "echo", "arguments": {"msg": "x"}})
    status, hdr_out, _ = call(h, headers=headers_for("tools/call", name="echo"), body=body)
    assert status == 401
    assert "www-authenticate" not in hdr_out

  def test_accepting_gate_threads_auth_info_to_tool(self):
    def gate(_request):
      return {"ok": True, "authInfo": {"sub": "u1", "scope": "read"}}

    h = create_asgi_mcp_handler(build_server(), auth_gate=gate)
    body = request_body(21, "tools/call", {"name": "whoami"})
    status, _, text = call(h, headers=headers_for("tools/call", name="whoami"), body=body)
    assert status == 200
    echoed = json.loads(json_body(text)["result"]["content"][0]["text"])
    assert echoed == {"sub": "u1", "scope": "read"}

  def test_accepting_gate_runs_before_origin_independent_of_auth(self):
    # The Origin gate runs before auth; a cross-origin request is rejected even with a
    # gate that would accept it, confirming the §9.11 check precedes §23.
    def gate(_request):
      return {"ok": True, "authInfo": {"sub": "u1"}}

    h = create_asgi_mcp_handler(build_server(), auth_gate=gate)
    body = request_body(22, "tools/call", {"name": "whoami"})
    status, _, _ = call(
      h, headers=headers_for("tools/call", name="whoami"), body=body, origin="https://evil.test"
    )
    assert status == 403
