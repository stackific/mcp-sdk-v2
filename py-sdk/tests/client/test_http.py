"""Tests for the Streamable HTTP client transport (§9, client half).

Two layers, both over a real socket (a threaded ``http.server``):

* ``TestOverHttp`` — end-to-end against the SDK's own server HTTP handler, validating
  both transport halves together (discovery, list/call, error propagation).
* the parity classes — a *programmable* server that returns exactly the status code,
  ``Content-Type``, and body (single JSON or ``text/event-stream``) each case needs, and
  records the inbound request headers + body. These mirror, case for case, the TS client
  transport tests (``ts-sdk/src/__tests__/client/streamable-http.test.ts``):

  - POST framing: required headers (Content-Type, Accept ×2, MCP-Protocol-Version),
    routing headers (Mcp-Method, Mcp-Name), body protocol-version mirroring, Mcp-Param-*.
  - Response shapes (§9.6): single ``application/json`` and ``text/event-stream``,
    delivering every SSE frame in order via the ``on_message`` tap.
  - Failure surfacing (R-7.2-q): HTTP error → delivered error response for the id;
    stream ending before the final response → synthesized error response; non-JSON /
    non-object body → synthesized error; non-2xx for a notification → raised error.
  - Bearer auth header from an ``auth_provider`` (§23.8); extra static headers.
  - Malformed-send guard; clean close is observable and blocks further sends.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from mcp.client.client import Client, RequestError
from mcp.client.http import StreamableHttpClientTransport
from mcp.client.transport import ClientTransportError
from mcp.protocol.discovery import is_discover_result
from mcp.protocol.meta import PROTOCOL_VERSION_META_KEY
from mcp.server.http import create_mcp_request_handler
from mcp.server.server import McpServer

INFO = {"name": "srv", "version": "1.0"}
CLIENT = {"name": "cli", "version": "0.1"}


# ─── End-to-end against the SDK server handler ─────────────────────────────────

def _make_server():
  server = McpServer(INFO, {"tools": {}})
  server.register_tool("echo", lambda args, c: {"content": [{"type": "text", "text": args.get("msg", "")}]})
  mcp_handler = create_mcp_request_handler(server)

  class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silence test server logging
      pass

    def do_POST(self):
      length = int(self.headers.get("Content-Length", 0))
      body = self.rfile.read(length)
      resp = mcp_handler("POST", self.path, dict(self.headers), body)
      payload = resp.body.encode("utf-8")
      self.send_response(resp.status)
      for key, value in resp.headers.items():
        self.send_header(key, value)
      self.send_header("Content-Length", str(len(payload)))
      self.end_headers()
      if payload:
        self.wfile.write(payload)

  httpd = HTTPServer(("127.0.0.1", 0), Handler)
  thread = threading.Thread(target=httpd.serve_forever, daemon=True)
  thread.start()
  return httpd


@pytest.fixture
def base_url():
  httpd = _make_server()
  host, port = httpd.server_address
  try:
    yield f"http://{host}:{port}/mcp"
  finally:
    httpd.shutdown()


def _client(base_url: str) -> Client:
  return Client(StreamableHttpClientTransport(base_url), CLIENT, capabilities={"tools": {}})


class TestOverHttp:
  def test_discover(self, base_url):
    c = _client(base_url)
    result = c.discover()
    assert is_discover_result(result)
    assert c.negotiated_version == "2026-07-28"
    assert c.server_info == INFO

  def test_list_and_call_tool(self, base_url):
    c = _client(base_url)
    c.discover()
    assert c.list_tools()["tools"][0]["name"] == "echo"
    assert c.call_tool("echo", {"msg": "over-http"})["content"][0]["text"] == "over-http"

  def test_request_error_propagates_over_http(self, base_url):
    c = _client(base_url)
    with pytest.raises(RequestError) as exc:
      c.raw("bogus/method")
    assert exc.value.code == -32601


# ─── A programmable server for the unit-style parity tests ─────────────────────

class _ProgrammableServer:
  """A threaded HTTP server whose response (status, content-type, body) is set per test,
  recording every inbound request's headers and parsed body. Mirrors the TS mock-``fetch``
  harness: one POST in, one fully-controlled response out.
  """

  def __init__(self) -> None:
    self.calls: list[dict] = []
    self._status = 200
    self._content_type = "application/json"
    self._body = b""

    server = self

    class Handler(BaseHTTPRequestHandler):
      def log_message(self, *args):  # silence test server logging
        pass

      def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
          parsed = json.loads(raw.decode("utf-8")) if raw else None
        except ValueError:
          parsed = None
        server.calls.append({"headers": dict(self.headers), "body": parsed, "path": self.path})
        self.send_response(server._status)
        self.send_header("Content-Type", server._content_type)
        self.send_header("Content-Length", str(len(server._body)))
        self.end_headers()
        if server._body:
          self.wfile.write(server._body)

    self._httpd = HTTPServer(("127.0.0.1", 0), Handler)
    self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
    self._thread.start()

  @property
  def url(self) -> str:
    host, port = self._httpd.server_address
    return f"http://{host}:{port}/mcp"

  def reply_json(self, value, status: int = 200) -> None:
    """Arm the next response as a single ``application/json`` body."""
    self._status = status
    self._content_type = "application/json"
    self._body = json.dumps(value).encode("utf-8")

  def reply_sse(self, frames, status: int = 200) -> None:
    """Arm the next response as a ``text/event-stream`` carrying ``frames`` in order."""
    self._status = status
    self._content_type = "text/event-stream"
    body = "".join(f"data: {json.dumps(f)}\n\n" for f in frames)
    self._body = body.encode("utf-8")

  def reply_raw(self, text: str, status: int, content_type: str = "text/plain") -> None:
    """Arm the next response with an arbitrary status/content-type/body."""
    self._status = status
    self._content_type = content_type
    self._body = text.encode("utf-8")

  def shutdown(self) -> None:
    self._httpd.shutdown()


@pytest.fixture
def server():
  s = _ProgrammableServer()
  try:
    yield s
  finally:
    s.shutdown()


def _request(id_: int, method: str, params: dict | None = None) -> dict:
  """A request message carrying a valid ``_meta`` envelope (the transport reads the version)."""
  body = dict(params or {})
  body["_meta"] = {PROTOCOL_VERSION_META_KEY: "2026-07-28"}
  return {"jsonrpc": "2.0", "id": id_, "method": method, "params": body}


def _harness(server: _ProgrammableServer, **kwargs):
  """Build a transport against ``server`` with an ``on_message`` tap collecting frames."""
  transport = StreamableHttpClientTransport(server.url, **kwargs)
  frames: list[dict] = []
  transport.set_on_message(frames.append)
  return transport, frames


# ─── POST headers (§9.3–§9.4) ──────────────────────────────────────────────────

class TestPostHeaders:
  def test_required_and_routing_headers_for_tools_call(self, server):
    server.reply_sse([{"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}}])
    transport, _ = _harness(server)
    transport.request(_request(1, "tools/call", {"name": "add", "arguments": {"a": 1}}))

    h = server.calls[0]["headers"]
    assert h["Content-Type"] == "application/json"
    assert "application/json" in h["Accept"]
    assert "text/event-stream" in h["Accept"]
    assert h["MCP-Protocol-Version"] == "2026-07-28"
    assert h["Mcp-Method"] == "tools/call"
    # tools/call carries an Mcp-Name routing header equal to params.name. (R-9.4.2-b)
    assert h["Mcp-Name"] == "add"

  def test_omits_mcp_name_for_untargeted_method(self, server):
    server.reply_sse([{"jsonrpc": "2.0", "id": 2, "result": {"resultType": "complete"}}])
    transport, _ = _harness(server)
    transport.request(_request(2, "tools/list"))

    h = server.calls[0]["headers"]
    assert "Mcp-Name" not in h
    assert h["Mcp-Method"] == "tools/list"

  def test_body_protocol_version_mirrors_into_header(self, server):
    server.reply_sse([{"jsonrpc": "2.0", "id": 3, "result": {"resultType": "complete"}}])
    transport, _ = _harness(server, protocol_version="2099-01-01")
    msg = _request(3, "tools/list")  # body _meta carries 2026-07-28, overriding the default
    transport.request(msg)
    assert server.calls[0]["headers"]["MCP-Protocol-Version"] == "2026-07-28"

  def test_transport_default_version_when_body_has_no_meta(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 4, "result": {}})
    transport, _ = _harness(server, protocol_version="2099-01-01")
    # A response message carries no method/_meta version → the transport default is used.
    transport.send({"jsonrpc": "2.0", "id": "srv-1", "result": {"ok": True}})
    assert server.calls[0]["headers"]["MCP-Protocol-Version"] == "2099-01-01"

  def test_mcp_name_for_resources_read_uses_uri(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 5, "result": {}})
    transport, _ = _harness(server)
    transport.request(_request(5, "resources/read", {"uri": "file:///x"}))
    assert server.calls[0]["headers"]["Mcp-Name"] == "file:///x"

  def test_attaches_bearer_token_from_auth_provider(self, server):
    server.reply_sse([{"jsonrpc": "2.0", "id": 6, "result": {"resultType": "complete"}}])
    transport, _ = _harness(server, auth_provider=lambda: "secret-token")
    transport.request(_request(6, "tools/list"))
    assert server.calls[0]["headers"]["Authorization"] == "Bearer secret-token"

  def test_no_authorization_when_token_is_empty(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 7, "result": {}})
    transport, _ = _harness(server, auth_provider=lambda: None)
    transport.request(_request(7, "ping"))
    assert "Authorization" not in server.calls[0]["headers"]

  def test_merges_extra_static_headers(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 8, "result": {}})
    transport, _ = _harness(server, headers={"X-Trace": "abc123"})
    transport.request(_request(8, "ping"))
    assert server.calls[0]["headers"]["X-Trace"] == "abc123"

  def test_param_header_resolver_emits_mcp_param_headers(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 9, "result": {}})
    transport, _ = _harness(server)
    transport.set_param_header_resolver(lambda method, params: {"Mcp-Param-Region": "us-west1"})
    transport.request(_request(9, "tools/call", {"name": "execute_sql", "arguments": {}}))
    assert server.calls[0]["headers"]["Mcp-Param-Region"] == "us-west1"

  def test_param_header_resolver_not_called_for_notifications(self, server):
    server.reply_json({}, status=202)
    transport, _ = _harness(server)
    seen: list[str] = []
    transport.set_param_header_resolver(lambda method, params: seen.append(method) or {})
    transport.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})
    assert seen == []  # the resolver is consulted only for requests (with an id)

  def test_param_header_resolver_fault_does_not_block_post(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 10, "result": {}})
    transport, _ = _harness(server)

    def boom(method, params):
      raise RuntimeError("resolver failed")

    transport.set_param_header_resolver(boom)
    result = transport.request(_request(10, "tools/call", {"name": "x", "arguments": {}}))
    assert result["result"] == {}  # POST still went out despite the resolver fault


# ─── Response shapes (§9.6) ────────────────────────────────────────────────────

class TestResponseShapes:
  def test_delivers_every_sse_frame_in_order(self, server):
    server.reply_sse([
      {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": 1, "progress": 0.5}},
      {"jsonrpc": "2.0", "id": "srv-1", "method": "elicitation/create", "params": {"mode": "form"}},
      {"jsonrpc": "2.0", "id": 7, "result": {"resultType": "complete", "content": []}},
    ])
    transport, frames = _harness(server)
    final = transport.request(_request(7, "tools/call", {"name": "x"}))

    assert len(frames) == 3
    assert frames[0]["method"] == "notifications/progress"
    assert frames[1]["method"] == "elicitation/create"
    assert frames[2]["result"]["resultType"] == "complete"
    # The final frame (matching id 7) is returned, not an interim one.
    assert final["id"] == 7
    assert final["result"]["resultType"] == "complete"

  def test_handles_single_json_response(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 9, "result": {"resultType": "complete", "ok": True}})
    transport, frames = _harness(server)
    final = transport.request(_request(9, "ping"))
    assert len(frames) == 1
    assert frames[0]["result"]["ok"] is True
    assert final["result"]["ok"] is True

  def test_single_json_missing_id_is_coerced(self, server):
    # The server omits the id on the final response; the transport stamps the request id.
    server.reply_json({"jsonrpc": "2.0", "result": {"ok": True}})
    transport, _ = _harness(server)
    final = transport.request(_request(11, "ping"))
    assert final["id"] == 11

  def test_final_sse_frame_only_matches_same_id_type(self, server):
    # A frame with a string "7" must NOT be treated as the final response for numeric 7.
    server.reply_sse([
      {"jsonrpc": "2.0", "id": "7", "result": {"wrong": True}},
      {"jsonrpc": "2.0", "id": 7, "result": {"right": True}},
    ])
    transport, _ = _harness(server)
    final = transport.request(_request(7, "ping"))
    assert final["result"] == {"right": True}


# ─── Failure surfacing (R-7.2-q, §7.5, §9.7) ───────────────────────────────────

class TestFailureSurfacing:
  def test_http_error_with_jsonrpc_body_is_delivered_for_the_id(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 5, "error": {"code": -32601, "message": "Method not found"}}, status=404)
    transport, frames = _harness(server)
    final = transport.request(_request(5, "does/not/exist"))
    assert final["error"]["code"] == -32601
    assert final["id"] == 5
    assert frames[-1]["error"]["code"] == -32601

  def test_http_error_stamps_missing_id_for_correlation(self, server):
    server.reply_json({"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid request"}}, status=400)
    transport, _ = _harness(server)
    final = transport.request(_request(12, "x"))
    assert final["id"] == 12
    assert final["error"]["code"] == -32600

  def test_http_error_without_jsonrpc_body_synthesizes_internal_error(self, server):
    server.reply_raw("Internal Server Error", status=500)
    transport, _ = _harness(server)
    final = transport.request(_request(13, "x"))
    assert final["id"] == 13
    assert final["error"]["code"] == -32603
    assert "HTTP 500" in final["error"]["message"]

  def test_stream_ending_before_final_response_synthesizes_error(self, server):
    server.reply_sse([
      {"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info", "data": "hi"}},
      # no final response for id 6 — the stream just ends
    ])
    transport, frames = _harness(server)
    final = transport.request(_request(6, "tools/call", {"name": "y"}))
    assert final["id"] == 6
    assert final["error"]["code"] == -32603
    assert "before the final response" in final["error"]["message"]
    # the interim notification was still surfaced, then the synthesized error
    assert frames[0]["method"] == "notifications/message"
    assert frames[-1]["error"]["code"] == -32603

  def test_non_object_single_json_body_synthesizes_error(self, server):
    server.reply_json([1, 2, 3])  # a JSON array, not a JSON-RPC object
    transport, _ = _harness(server)
    final = transport.request(_request(14, "x"))
    assert final["id"] == 14
    assert final["error"]["code"] == -32603

  def test_non_json_single_response_synthesizes_error(self, server):
    server.reply_raw("<html>not json</html>", status=200, content_type="application/json")
    transport, _ = _harness(server)
    final = transport.request(_request(15, "x"))
    assert final["id"] == 15
    assert final["error"]["code"] == -32603

  def test_malformed_interim_sse_frame_reported_and_skipped(self, server):
    # A malformed interim data frame is reported to on_error and skipped; the stream continues.
    body = (
      "data: {not json}\n\n"
      'data: {"jsonrpc": "2.0", "id": 16, "result": {"ok": true}}\n\n'
    )
    server.reply_raw(body, status=200, content_type="text/event-stream")
    transport, frames = _harness(server)
    errors: list[ClientTransportError] = []
    transport.on_error(errors.append)
    final = transport.request(_request(16, "x"))
    assert final["result"]["ok"] is True
    assert len(errors) == 1
    assert "malformed SSE data frame" in str(errors[0])
    # only the well-formed frame reached on_message
    assert len(frames) == 1 and frames[0]["id"] == 16

  def test_notification_non_2xx_raises_transport_error(self, server):
    server.reply_raw("nope", status=500)
    transport, _ = _harness(server)
    with pytest.raises(ClientTransportError):
      transport.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})

  def test_notification_2xx_succeeds(self, server):
    server.reply_raw("", status=202)
    transport, _ = _harness(server)
    transport.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})
    assert server.calls[0]["body"]["method"] == "notifications/cancelled"

  def test_request_surfaces_as_request_error_through_client(self, server):
    # End-to-end: a delivered error frame makes Client.request raise RequestError.
    server.reply_json({"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "nope"}}, status=404)
    c = Client(StreamableHttpClientTransport(server.url), CLIENT, capabilities={"tools": {}})
    with pytest.raises(RequestError) as exc:
      c.raw("does/not/exist")
    assert exc.value.code == -32601


# ─── Malformed-send guard ──────────────────────────────────────────────────────

class TestMalformedSendGuard:
  def test_request_refuses_malformed_message(self, server):
    transport, _ = _harness(server)
    with pytest.raises(ClientTransportError) as exc:
      transport.request({"jsonrpc": "2.0", "id": 1, "method": "x", "result": {}})  # method + result
    assert "refusing to send a malformed message" in str(exc.value)
    assert server.calls == []  # nothing went on the wire

  def test_send_refuses_batch_array(self, server):
    transport, _ = _harness(server)
    with pytest.raises(ClientTransportError):
      transport.send([{"jsonrpc": "2.0", "method": "x"}])  # batches are forbidden
    assert server.calls == []


# ─── Lifecycle ─────────────────────────────────────────────────────────────────

class TestLifecycle:
  def test_clean_close_is_observable_and_blocks_sends(self, server):
    server.reply_json({"jsonrpc": "2.0", "id": 1, "result": {}})
    transport, _ = _harness(server)
    closed_info: list[dict] = []
    transport.on_close(closed_info.append)

    transport.close("done")
    assert closed_info == [{"clean": True, "reason": "done"}]
    assert transport.closed is True

    with pytest.raises(ClientTransportError):
      transport.request(_request(1, "ping"))
    with pytest.raises(ClientTransportError):
      transport.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})

  def test_close_is_idempotent_and_notifies_once(self, server):
    transport, _ = _harness(server)
    count = []
    transport.on_close(lambda info: count.append(info))
    transport.close()
    transport.close()  # second call is a no-op
    assert len(count) == 1
    assert count[0] == {"clean": True}  # no reason → no reason key

  def test_close_observer_fault_does_not_break_close(self, server):
    transport, _ = _harness(server)

    def boom(info):
      raise RuntimeError("observer failed")

    transport.on_close(boom)
    transport.close()  # must not raise
    assert transport.closed is True

  def test_on_error_unsubscribe(self, server):
    body = 'data: {not json}\n\ndata: {"jsonrpc": "2.0", "id": 1, "result": {}}\n\n'
    server.reply_raw(body, status=200, content_type="text/event-stream")
    transport, _ = _harness(server)
    errors: list[ClientTransportError] = []
    unsubscribe = transport.on_error(errors.append)
    unsubscribe()
    transport.request(_request(1, "x"))
    assert errors == []  # the observer was removed before the malformed frame arrived
