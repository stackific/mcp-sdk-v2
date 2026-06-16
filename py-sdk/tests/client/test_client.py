"""Tests for the Client host (2026-07-28).

Two harnesses are used, mirroring the TS client tests:

* a real in-process bridge to an :class:`McpServer` via ``process_message`` — covers
  discovery, the ``_meta`` envelope, and the feature methods end-to-end;
* a controllable :class:`StubTransport` that records sends and lets a test inject inbound
  frames — covers inbound server→client request routing, notifications + progress
  correlation, cancellation, the §11 MRTR driver, §10 subscriptions, and the
  ``Mcp-Param-*`` param-header resolver — the synchronous analogue of the TS
  ``StubTransport`` that drives the message-pump client.
"""

import pytest

from mcp.client.client import Client, RequestError, SubscriptionHandle
from mcp.client.transport import ClientTransport
from mcp.protocol.negotiation import (
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  IncompatibleProtocolError,
)
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
)
from mcp.server.runtime import process_message
from mcp.server.server import McpServer

INFO = {"name": "srv", "version": "1.0"}
CLIENT = {"name": "cli", "version": "0.1"}
CAPS = {"tools": {}, "resources": {}, "prompts": {}}


# ─── In-process server bridge harness ─────────────────────────────────────────


class DirectClientTransport(ClientTransport):
  """In-process bridge: hand each request straight to a server via process_message."""

  def __init__(self, server: McpServer) -> None:
    self._server = server

  def request(self, message: dict) -> dict:
    response = process_message(self._server, message)
    assert response is not None  # a request always yields a response
    return response


def build_server() -> McpServer:
  s = McpServer(INFO, CAPS)
  s.register_tool("echo", lambda args, c: {"content": [{"type": "text", "text": args.get("msg", "")}]})
  # A tool that echoes the per-request _meta so we can assert the envelope propagated.
  s.register_tool("meta", lambda args, c: {"structuredContent": dict(c.meta)})
  return s


def build_client() -> Client:
  return Client(DirectClientTransport(build_server()), CLIENT, capabilities={"tools": {}})


# ─── Controllable stub transport harness ──────────────────────────────────────


class StubTransport(ClientTransport):
  """A controllable in-process transport mirroring the TS ``StubTransport``.

  Records every outbound ``request``/``send`` in :attr:`sent`. A test supplies ``on_request``
  to answer a request synchronously (returning the response envelope) and ``on_send`` to
  observe notifications / replies. Inbound interim frames are injected via :meth:`inject`,
  which calls the ``set_on_message`` tap the :class:`Client` installs.
  """

  def __init__(self) -> None:
    self.sent: list[dict] = []
    self.closed = False
    self._on_message = None
    self._param_resolver = None
    #: Set by a test to answer a request: ``on_request(message) -> response dict | None``.
    self.on_request = None
    #: Set by a test to observe a notification / reply: ``on_send(message)``.
    self.on_send = None
    #: Set by a test to drive a subscription: ``on_subscribe(message)``.
    self.on_subscribe = None

  # Hooks the Client wires.
  def set_on_message(self, callback) -> None:
    self._on_message = callback

  def set_param_header_resolver(self, resolver) -> None:
    self._param_resolver = resolver

  def resolve_param_headers(self, method: str, params: dict | None) -> dict:
    """Test helper: invoke the resolver the Client installed (for §9.5.2 assertions)."""
    return self._param_resolver(method, params) if self._param_resolver else {}

  # The request/response channel.
  def request(self, message: dict, *, timeout_ms: int | None = None) -> dict:
    self.sent.append(message)
    if self.on_request is not None:
      response = self.on_request(message)
      if response is not None:
        return response
    return {"jsonrpc": "2.0", "id": message["id"], "result": {"resultType": "complete"}}

  def send(self, message: dict) -> None:
    self.sent.append(message)
    if self.on_send is not None:
      self.on_send(message)

  def open_subscription(self, message: dict, on_ready):
    self.sent.append(message)
    on_ready()
    if self.on_subscribe is not None:
      self.on_subscribe(message)
    return _FakeStream()

  def close(self) -> None:
    self.closed = True

  # Test driver: deliver an inbound frame to the Client.
  def inject(self, frame: dict) -> None:
    assert self._on_message is not None, "Client did not install set_on_message"
    self._on_message(frame)


class _FakeStream:
  def __init__(self) -> None:
    import threading

    self.closed = threading.Event()


def stub_client(capabilities: dict | None = None) -> tuple[Client, StubTransport]:
  transport = StubTransport()
  client = Client(transport, CLIENT, capabilities=capabilities)
  return client, transport


# ─── Discovery (§5.3–§5.4) ────────────────────────────────────────────────────


class TestDiscovery:
  def test_discover_negotiates_and_caches(self):
    c = build_client()
    result = c.discover()
    assert result["serverInfo"] == INFO
    assert c.negotiated_version == "2026-07-28"
    assert c.connected
    assert c.server_capabilities == CAPS

  def test_status_snapshot(self):
    c = build_client()
    assert c.status()["connected"] is False  # before discover
    c.discover()
    status = c.status()
    assert status["connected"] and status["negotiatedVersion"] == "2026-07-28"

  def test_discover_caches_instructions_and_accessors(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {"tools": {}, "resources": {}},
        "serverInfo": {"name": "fake-server", "version": "2.0.0"},
        "instructions": "be nice",
      },
    }
    result = client.discover()
    assert result["serverInfo"]["name"] == "fake-server"
    assert client.get_negotiated_version() == "2026-07-28"
    assert client.get_server_capabilities() == {"tools": {}, "resources": {}}
    assert client.get_server_version() == {"name": "fake-server", "version": "2.0.0"}
    assert client.get_instructions() == "be nice"
    # The discover request itself carried the envelope.
    assert transport.sent[0]["params"]["_meta"][CLIENT_INFO_META_KEY] == CLIENT

  def test_protocol_version_before_and_after_discover(self):
    client, transport = stub_client()
    assert client.protocol_version() == "2026-07-28"  # most-preferred default
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {},
        "serverInfo": INFO,
      },
    }
    client.discover()
    assert client.protocol_version() == "2026-07-28"  # negotiated


# ─── -32004 reselect-and-retry (§5.5 / §29.3, S45-1) ──────────────────────────


def _unsupported(message_id, supported, requested="x"):
  return {
    "jsonrpc": "2.0",
    "id": message_id,
    "error": {
      "code": UNSUPPORTED_PROTOCOL_VERSION_CODE,
      "message": "Unsupported protocol version",
      "data": {"requested": requested, "supported": supported},
    },
  }


class TestUnsupportedVersionReselect:
  """S45-1 (R-29.3-c, R-5.5-h/-i/-j): a ``-32004`` triggers ONE automatic reselect-and-retry
  at a mutually supported revision; disjoint sets surface :class:`IncompatibleProtocolError`
  rather than looping; unrelated errors and a re-failing retry stay bounded.
  """

  def test_reselects_and_retries_once_on_overlap(self):
    transport = StubTransport()
    client = Client(transport, CLIENT, protocol_versions=["2027-09-09", "2026-07-28"])
    calls = {"n": 0}

    def on_request(m):
      calls["n"] += 1
      if calls["n"] == 1:
        # First attempt is stamped with the most-preferred (unsupported) revision.
        assert m["params"]["_meta"][PROTOCOL_VERSION_META_KEY] == "2027-09-09"
        return _unsupported(m["id"], ["2026-07-28"], requested="2027-09-09")
      return {"jsonrpc": "2.0", "id": m["id"], "result": {"resultType": "complete", "ok": True}}

    transport.on_request = on_request
    result = client.request("tools/list", {})

    assert result == {"resultType": "complete", "ok": True}
    assert calls["n"] == 2  # exactly one retry
    assert client.negotiated_version == "2026-07-28"  # adopted the server's revision
    # The retry carried the reselected revision and a fresh request id.
    assert transport.sent[1]["params"]["_meta"][PROTOCOL_VERSION_META_KEY] == "2026-07-28"
    assert transport.sent[1]["id"] != transport.sent[0]["id"]

  def test_disjoint_surfaces_incompatible_and_does_not_retry(self):
    transport = StubTransport()
    client = Client(transport, CLIENT, protocol_versions=["2027-09-09"])
    transport.on_request = lambda m: _unsupported(m["id"], ["2025-01-01"], requested="2027-09-09")

    with pytest.raises(IncompatibleProtocolError) as exc:
      client.request("tools/list", {})

    assert exc.value.client_preference == ["2027-09-09"]
    assert exc.value.server_supported == ["2025-01-01"]
    assert len(transport.sent) == 1  # no retry when there is no overlap

  def test_non_version_error_is_not_retried(self):
    transport = StubTransport()
    client = Client(transport, CLIENT)
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "error": {"code": -32601, "message": "Method not found"},
    }

    with pytest.raises(RequestError) as exc:
      client.request("tools/list", {})

    assert exc.value.code == -32601
    assert len(transport.sent) == 1

  def test_retry_failing_again_is_bounded_no_loop(self):
    # If the retried request ALSO returns -32004, the client surfaces the error rather than
    # looping (the retry runs with version-retry disabled).
    transport = StubTransport()
    client = Client(transport, CLIENT, protocol_versions=["2027-09-09", "2026-07-28"])
    transport.on_request = lambda m: _unsupported(m["id"], ["2026-07-28"])

    with pytest.raises(RequestError) as exc:
      client.request("tools/list", {})

    assert exc.value.code == UNSUPPORTED_PROTOCOL_VERSION_CODE
    assert len(transport.sent) == 2  # original + exactly one retry, then surfaced


# ─── §28 receive-path / boundary guards (S44-B) ───────────────────────────────


class TestRedactedFrameTap:
  """B1 (RC-8/15/16): the debug/telemetry frame tap never surfaces a credential — sensitive
  keys are redacted before the frame leaves the SDK, while the real wire frame is unchanged.
  """

  def test_tap_redacts_sensitive_keys_but_wire_is_unchanged(self):
    client, transport = stub_client()
    seen: list = []
    client.set_frame_listener(lambda direction, frame: seen.append((direction, frame)))
    transport.on_request = lambda m: {"jsonrpc": "2.0", "id": m["id"], "result": {"resultType": "complete"}}

    client.request("tools/list", {"token": "super-secret", "keep": "visible"})

    tapped = next(f for d, f in seen if d == "send")
    assert tapped["params"]["token"] == "[REDACTED]"
    assert tapped["params"]["keep"] == "visible"
    # The actual frame on the wire keeps the real value (redaction is only for the observer).
    assert transport.sent[0]["params"]["token"] == "super-secret"


class TestStructuredContentValidation:
  """B2 (RC-17): a tool result's ``structuredContent`` is validated against the tool's
  learned ``outputSchema`` on the receive path; a violation is refused with ``-32602``.
  """

  _SCHEMA = {"type": "object", "properties": {"count": {"type": "integer"}}, "required": ["count"]}

  def _client(self, structured):
    transport = StubTransport()
    client = Client(transport, CLIENT)

    def on_request(m):
      if m["method"] == "tools/list":
        return {
          "jsonrpc": "2.0", "id": m["id"],
          "result": {"resultType": "complete", "tools": [{"name": "counter", "outputSchema": self._SCHEMA}]},
        }
      return {
        "jsonrpc": "2.0", "id": m["id"],
        "result": {"resultType": "complete", "content": [], "structuredContent": structured},
      }

    transport.on_request = on_request
    return client

  def test_violating_structured_content_is_rejected(self):
    client = self._client({"count": "not-an-int"})
    client.list_tools()  # learn the outputSchema
    with pytest.raises(RequestError) as exc:
      client.call_tool("counter")
    assert exc.value.code == -32602

  def test_conforming_structured_content_passes(self):
    client = self._client({"count": 7})
    client.list_tools()
    result = client.call_tool("counter")
    assert result["structuredContent"] == {"count": 7}

  def test_unknown_schema_is_not_validated(self):
    # Without a learned outputSchema the receive-path validation is skipped (best-effort).
    client = self._client({"count": "anything"})
    # NOTE: no list_tools() → schema unknown
    result = client.call_tool("counter")
    assert result["structuredContent"] == {"count": "anything"}


class TestReceiveTextSanitization:
  """B7 (RC-5): when enabled, control sequences are stripped from received tool/resource text;
  by default results pass through verbatim.
  """

  def _tool_client(self, text, *, sanitize):
    transport = StubTransport()
    client = Client(transport, CLIENT, sanitize_tool_text=sanitize)
    transport.on_request = lambda m: {
      "jsonrpc": "2.0", "id": m["id"],
      "result": {"resultType": "complete", "content": [{"type": "text", "text": text}]},
    }
    return client

  def test_strips_control_sequences_when_enabled(self):
    client = self._tool_client("ok\x07\x1b[31mred\ttab\nnl", sanitize=True)
    out = client.call_tool("t")["content"][0]["text"]
    assert out == "ok[31mred\ttab\nnl"  # bell + ESC stripped, tab/newline preserved

  def test_passthrough_by_default(self):
    client = self._tool_client("raw\x07esc", sanitize=False)
    assert client.call_tool("t")["content"][0]["text"] == "raw\x07esc"

  def test_read_resource_sanitizes_when_enabled(self):
    transport = StubTransport()
    client = Client(transport, CLIENT, sanitize_tool_text=True)
    transport.on_request = lambda m: {
      "jsonrpc": "2.0", "id": m["id"],
      "result": {"resultType": "complete", "contents": [{"uri": "file:///x", "text": "a\x1bb"}]},
    }
    assert client.read_resource("file:///x")["contents"][0]["text"] == "ab"


class TestPreDispatchHook:
  """B8 (RC-6): a pre-dispatch hook sees the exact arguments before a tools/call is sent and
  may veto the call by raising.
  """

  def test_hook_receives_arguments_before_send(self):
    client, transport = stub_client()
    seen: list = []
    client.set_pre_dispatch_hook(lambda name, args: seen.append((name, dict(args))))
    transport.on_request = lambda m: {"jsonrpc": "2.0", "id": m["id"], "result": {"resultType": "complete"}}
    client.call_tool("do", {"x": 1})
    assert seen == [("do", {"x": 1})]

  def test_hook_can_veto_before_anything_is_sent(self):
    client, transport = stub_client()

    def veto(_name, _args):
      raise RuntimeError("blocked by review")

    client.set_pre_dispatch_hook(veto)
    with pytest.raises(RuntimeError, match="blocked by review"):
      client.call_tool("do", {"x": 1})
    assert transport.sent == []  # vetoed before any transport send


# ─── Outgoing request envelope (§4.3) ─────────────────────────────────────────


class TestEnvelope:
  def test_meta_envelope_reaches_server(self):
    c = build_client()
    result = c.call_tool("meta")
    meta = result["structuredContent"]
    assert meta[PROTOCOL_VERSION_META_KEY] == "2026-07-28"
    assert "io.modelcontextprotocol/clientInfo" in meta
    assert "io.modelcontextprotocol/clientCapabilities" in meta

  def test_stamps_three_required_meta_keys(self):
    client, transport = stub_client(capabilities={"sampling": {}, "elicitation": {}})
    client.request("tools/list")
    meta = transport.sent[0]["params"]["_meta"]
    assert meta[PROTOCOL_VERSION_META_KEY] == "2026-07-28"
    assert meta[CLIENT_INFO_META_KEY] == CLIENT
    assert meta[CLIENT_CAPABILITIES_META_KEY] == {"sampling": {}, "elicitation": {}}

  def test_preserves_caller_meta_alongside_reserved_keys(self):
    client, transport = stub_client()
    client.request("ping", {"_meta": {"traceparent": "00-abc-def-01"}})
    meta = transport.sent[0]["params"]["_meta"]
    assert meta["traceparent"] == "00-abc-def-01"
    assert meta[PROTOCOL_VERSION_META_KEY] == "2026-07-28"


# ─── Correlation and errors (§7.5) ────────────────────────────────────────────


class TestCorrelationAndErrors:
  def test_resolves_with_result_on_success(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {"jsonrpc": "2.0", "id": m["id"], "result": {"value": 42}}
    assert client.request("tools/list")["value"] == 42

  def test_raises_request_error_on_delivered_error(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "error": {"code": -32602, "message": "Invalid params", "data": {"field": "x"}},
    }
    with pytest.raises(RequestError) as exc:
      client.request("tools/call", {"name": "add"})
    assert exc.value.name == "RequestError"
    assert exc.value.code == -32602
    assert exc.value.data == {"field": "x"}

  def test_non_object_response_raises(self):
    client, transport = stub_client()
    transport.on_request = lambda m: "not-a-dict"  # type: ignore[return-value]
    with pytest.raises(RequestError):
      client.request("ping")


# ─── Inbound server→client requests (§20–§21) ─────────────────────────────────


class TestInboundServerRequests:
  def test_routes_to_handler_and_posts_result_back(self):
    client, transport = stub_client(capabilities={"elicitation": {}})
    seen = []

    def handler(params):
      seen.append(params)
      return {"action": "accept", "content": {"name": "Ada"}}

    client.set_request_handler("elicitation/create", handler)
    transport.inject({"jsonrpc": "2.0", "id": "srv-1", "method": "elicitation/create", "params": {"mode": "form"}})

    assert seen == [{"mode": "form"}]
    reply = transport.sent[-1]
    assert reply["id"] == "srv-1"
    assert reply["result"] == {"action": "accept", "content": {"name": "Ada"}}

  def test_replies_method_not_found_without_handler(self):
    client, transport = stub_client()
    transport.inject({"jsonrpc": "2.0", "id": "srv-2", "method": "sampling/createMessage", "params": {}})
    assert transport.sent[-1]["error"]["code"] == -32601

  def test_handler_raising_request_error_maps_to_error_response(self):
    client, transport = stub_client()

    def handler(params):
      raise RequestError(-32000, "denied", {"why": "policy"})

    client.set_request_handler("roots/list", handler)
    transport.inject({"jsonrpc": "2.0", "id": "srv-3", "method": "roots/list", "params": {}})
    error = transport.sent[-1]["error"]
    assert error["code"] == -32000
    assert error["data"] == {"why": "policy"}

  def test_handler_raising_other_error_maps_to_internal_error(self):
    client, transport = stub_client()
    client.set_request_handler("roots/list", lambda p: (_ for _ in ()).throw(RuntimeError("boom")))
    transport.inject({"jsonrpc": "2.0", "id": "srv-4", "method": "roots/list", "params": {}})
    assert transport.sent[-1]["error"]["code"] == -32603

  def test_remove_request_handler(self):
    client, transport = stub_client()
    client.set_request_handler("roots/list", lambda p: {"roots": []})
    client.remove_request_handler("roots/list")
    transport.inject({"jsonrpc": "2.0", "id": "srv-5", "method": "roots/list", "params": {}})
    assert transport.sent[-1]["error"]["code"] == -32601


# ─── Notifications and progress (§15.1) ───────────────────────────────────────


class TestNotificationsAndProgress:
  def test_routes_notifications_to_handler(self):
    client, transport = stub_client()
    logged = []
    client.set_notification_handler("notifications/message", logged.append)
    transport.inject({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info", "data": "hi"}})
    assert logged == [{"level": "info", "data": "hi"}]

  def test_remove_notification_handler(self):
    client, transport = stub_client()
    logged = []
    client.set_notification_handler("notifications/message", logged.append)
    client.remove_notification_handler("notifications/message")
    transport.inject({"jsonrpc": "2.0", "method": "notifications/message", "params": {}})
    assert logged == []

  def test_correlates_progress_by_token(self):
    client, transport = stub_client()
    progress_seen = []

    def on_request(message):
      token = message["params"]["_meta"]["progressToken"]
      # Emit a correlated progress notification before the final result.
      transport.inject({
        "jsonrpc": "2.0",
        "method": "notifications/progress",
        "params": {"progressToken": token, "progress": 0.5},
      })
      return {"jsonrpc": "2.0", "id": message["id"], "result": {"resultType": "complete"}}

    transport.on_request = on_request
    client.request("tools/call", {"name": "slow"}, on_progress=progress_seen.append)
    assert len(progress_seen) == 1
    assert progress_seen[0]["progress"] == 0.5

  def test_progress_handler_removed_after_request(self):
    client, transport = stub_client()
    seen = []
    transport.on_request = lambda m: {"jsonrpc": "2.0", "id": m["id"], "result": {}}
    client.request("ping", on_progress=seen.append)
    # After the request settles, a stray progress notification with the same token is ignored.
    transport.inject({"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": 1, "progress": 1}})
    assert seen == []

  def test_progress_token_string_and_number_do_not_collide(self):
    client, transport = stub_client()
    seen = []
    transport.on_request = lambda m: {"jsonrpc": "2.0", "id": m["id"], "result": {}}
    client.request("ping", progress_token="1", on_progress=seen.append)
    # A numeric-token progress notification must NOT reach the string-token handler.
    transport.inject({"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": 1, "progress": 1}})
    assert seen == []


# ─── Cancellation (§15.2) ─────────────────────────────────────────────────────


class TestCancellation:
  def test_cancel_sends_cancelled_notification(self):
    client, transport = stub_client()
    cancelled = []
    transport.on_send = cancelled.append

    # Drive a cancellable request whose handler cancels mid-flight by cancel_id.
    def on_request(message):
      client.cancel("op-1")  # sends notifications/cancelled referencing this request id
      return {"jsonrpc": "2.0", "id": message["id"], "result": {}}

    transport.on_request = on_request
    client.request("tools/call", {"name": "forever"}, cancel_id="op-1")
    note = next(m for m in cancelled if m.get("method") == "notifications/cancelled")
    assert note["params"]["requestId"] == transport.sent[0]["id"]

  def test_cancel_unknown_id_returns_false(self):
    client, _ = stub_client()
    assert client.cancel("nope") is False


# ─── Capability guards (§6) ───────────────────────────────────────────────────


class TestCapabilityGuards:
  def test_server_supports_and_assert(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {
        "resultType": "complete",
        "supportedVersions": ["2026-07-28"],
        "capabilities": {"tools": {}, "resources": {}},
        "serverInfo": {"name": "s", "version": "1"},
      },
    }
    client.discover()
    assert client.server_supports("tools") is True
    assert client.server_supports("prompts") is False
    client.assert_server_capability("tools")  # does not raise
    with pytest.raises(RequestError) as exc:
      client.assert_server_capability("prompts")
    assert exc.value.code == -32003


# ─── Feature methods + pagination ─────────────────────────────────────────────


class TestFeatureMethods:
  def test_ping(self):
    assert build_client().ping() == {}

  def test_list_and_call_tool(self):
    c = build_client()
    tools = c.list_tools()
    names = {t["name"] for t in tools["tools"]}
    assert {"echo", "meta"} <= names
    assert c.call_tool("echo", {"msg": "hi"})["content"][0]["text"] == "hi"

  def test_request_error_on_unknown_method(self):
    c = build_client()
    with pytest.raises(RequestError) as exc:
      c.raw("does/not/exist")
    assert exc.value.code == -32601

  def test_request_error_on_unknown_tool(self):
    c = build_client()
    with pytest.raises(RequestError) as exc:
      c.call_tool("nope")
    assert exc.value.code == -32602

  def test_convenience_methods_send_correct_methods(self):
    client, transport = stub_client(capabilities={"elicitation": {}})

    def on_request(message):
      if message["method"] == "tools/list":
        return {"jsonrpc": "2.0", "id": message["id"], "result": {"resultType": "complete", "tools": [{"name": "add"}]}}
      return {"jsonrpc": "2.0", "id": message["id"], "result": {"resultType": "complete"}}

    transport.on_request = on_request

    tools = client.list_tools()
    assert tools["tools"] == [{"name": "add"}]
    client.read_resource("docs://x")
    client.get_prompt("greeting", {"name": "Ada"})
    client.complete({"type": "ref/prompt", "name": "greeting"}, {"name": "language", "value": "en"})
    client.set_logging_level("debug")
    client.ping()

    methods = [m["method"] for m in transport.sent]
    assert methods == [
      "tools/list",
      "resources/read",
      "prompts/get",
      "completion/complete",
      "logging/setLevel",
      "ping",
    ]
    assert transport.sent[2]["params"]["name"] == "greeting"
    assert transport.sent[2]["params"]["arguments"] == {"name": "Ada"}

  def test_complete_with_context(self):
    client, transport = stub_client()
    client.complete({"type": "ref/prompt"}, {"name": "x"}, {"arguments": {"y": "1"}})
    assert transport.sent[0]["params"]["context"] == {"arguments": {"y": "1"}}


class TestPagination:
  def test_list_all_tools_follows_next_cursor(self):
    client, transport = stub_client()

    def on_request(message):
      cursor = message["params"].get("cursor")
      if not cursor:
        result = {"resultType": "complete", "tools": [{"name": "a"}, {"name": "b"}], "nextCursor": "p2"}
      else:
        result = {"resultType": "complete", "tools": [{"name": "c"}]}
      return {"jsonrpc": "2.0", "id": message["id"], "result": result}

    transport.on_request = on_request
    names = [t["name"] for t in client.list_all_tools()]
    assert names == ["a", "b", "c"]

  def test_paginate_stops_when_no_next_cursor(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {"resultType": "complete", "resources": [{"uri": "a"}]},
    }
    items = list(client.list_all_resources())
    assert items == [{"uri": "a"}]

  def test_empty_string_next_cursor_is_echoed_not_end_of_results(self):
    # An empty-string nextCursor is a PRESENT cursor: the client MUST NOT treat it as
    # end-of-results, and MUST echo cursor:'' on the follow-up request — it must NOT drop
    # the field (which would re-request the first page). (R-12.3-d, R-12.3-e / AC-18.8)
    client, transport = stub_client()
    seen_cursors = []

    def on_request(message):
      cursor = message["params"].get("cursor")
      seen_cursors.append(cursor)
      if "cursor" not in message["params"]:
        # First page — hand back an empty-string nextCursor to continue.
        result = {"resultType": "complete", "tools": [{"name": "a"}], "nextCursor": ""}
      elif cursor == "":
        # The client correctly echoed '' — return the final page (no nextCursor).
        result = {"resultType": "complete", "tools": [{"name": "b"}]}
      else:  # pragma: no cover — only reached if the client mishandles ''
        result = {"resultType": "complete", "tools": [{"name": "WRONG"}]}
      return {"jsonrpc": "2.0", "id": message["id"], "result": result}

    transport.on_request = on_request
    names = [t["name"] for t in client.list_all_tools()]
    assert names == ["a", "b"]
    # First request omits cursor (None), the second echoes the empty string verbatim.
    assert seen_cursors == [None, ""]

  def test_list_tools_sends_empty_string_cursor_verbatim(self):
    # An explicit empty-string cursor argument is a present cursor and MUST be sent on the
    # wire, not dropped. (R-12.1-a)
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {"resultType": "complete", "tools": []},
    }
    client.list_tools(cursor="")
    params = transport.sent[-1]["params"]
    assert "cursor" in params and params["cursor"] == ""


# ─── M1 — invalid x-mcp-header tool filtering (§9.5.1) + Mcp-Param-* (§9.5.2) ──


class TestParamHeaderRouting:
  def test_drops_tool_with_invalid_x_mcp_header_keeps_valid(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {
        "resultType": "complete",
        "tools": [
          {"name": "good", "inputSchema": {"type": "object"}},
          {
            "name": "bad",
            "inputSchema": {"type": "object", "properties": {"x": {"type": "object", "x-mcp-header": "X"}}},
          },
        ],
      },
    }
    result = client.list_tools()
    assert [t["name"] for t in result["tools"]] == ["good"]

  def test_learns_schema_and_resolves_param_headers(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {
        "resultType": "complete",
        "tools": [
          {
            "name": "search",
            "inputSchema": {"type": "object", "properties": {"region": {"type": "string", "x-mcp-header": "Region"}}},
          }
        ],
      },
    }
    client.list_tools()  # learns the x-mcp-header annotation
    headers = transport.resolve_param_headers("tools/call", {"name": "search", "arguments": {"region": "us-east"}})
    assert headers.get("Mcp-Param-Region") == "us-east"

  def test_resolver_returns_empty_for_unknown_tool_or_method(self):
    client, transport = stub_client()
    assert transport.resolve_param_headers("tools/call", {"name": "unknown", "arguments": {}}) == {}
    assert transport.resolve_param_headers("tools/list", {}) == {}


# ─── §11 multi-round-trip (input-required) driver ─────────────────────────────


class TestMultiRoundTrip:
  def test_fulfills_input_required_then_completes(self):
    client, transport = stub_client(capabilities={"elicitation": {}})
    client.set_request_handler("elicitation/create", lambda p: {"action": "accept", "content": {"name": "Ada"}})

    def on_request(message):
      params = message["params"]
      if message["method"] == "tools/call" and "inputResponses" not in params:
        result = {
          "resultType": "input_required",
          "inputRequests": {"who": {"method": "elicitation/create", "params": {"mode": "form"}}},
          "requestState": "state-1",
        }
      else:
        result = {"resultType": "complete", "content": [{"type": "text", "text": "ok"}]}
      return {"jsonrpc": "2.0", "id": message["id"], "result": result}

    transport.on_request = on_request
    result = client.request_with_input("tools/call", {"name": "register_user"})
    assert result["content"][0]["text"] == "ok"

    retry = next(m for m in transport.sent if "inputResponses" in m["params"])
    assert retry["params"]["requestState"] == "state-1"
    assert retry["params"]["inputResponses"]["who"] == {"action": "accept", "content": {"name": "Ada"}}

  def test_no_handler_for_input_kind_raises(self):
    client, transport = stub_client(capabilities={"elicitation": {}})
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {
        "resultType": "input_required",
        "inputRequests": {"who": {"method": "elicitation/create", "params": {}}},
      },
    }
    with pytest.raises(RequestError) as exc:
      client.request_with_input("tools/call", {"name": "x"})
    assert exc.value.code == -32601

  def test_unrecognized_result_type_raises(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {"jsonrpc": "2.0", "id": m["id"], "result": {"resultType": "weird"}}
    with pytest.raises(RequestError):
      client.request_with_input("tools/call", {"name": "x"})

  def test_exceeding_max_rounds_raises(self):
    client, transport = stub_client(capabilities={"elicitation": {}})
    client.set_request_handler("elicitation/create", lambda p: {"action": "accept"})
    # Always re-request input → the round guard must trip.
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {
        "resultType": "input_required",
        "inputRequests": {"who": {"method": "elicitation/create", "params": {}}},
        "requestState": "s",
      },
    }
    with pytest.raises(RequestError) as exc:
      client.request_with_input("tools/call", {"name": "x"}, max_rounds=2)
    assert "exceeded" in exc.value.message


# ─── §25 Tasks extension helpers ──────────────────────────────────────────────


class TestTasks:
  def test_create_task_carries_ttl_and_returns_handle(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {"resultType": "task", "taskId": "t1", "status": "working"},
    }
    handle = client.create_task("long_job", {"steps": 2}, ttl_ms=1000)
    assert handle["taskId"] == "t1"
    assert handle["resultType"] == "task"
    assert transport.sent[0]["params"]["task"] == {"ttl": 1000}

  def test_poll_until_terminal_returns_completed_task(self):
    client, transport = stub_client()
    polls = {"n": 0}

    def on_request(message):
      polls["n"] += 1
      if polls["n"] >= 2:
        result = {
          "resultType": "complete",
          "taskId": "t1",
          "status": "completed",
          "result": {"content": [{"type": "text", "text": "done"}]},
        }
      else:
        result = {"resultType": "complete", "taskId": "t1", "status": "working"}
      return {"jsonrpc": "2.0", "id": message["id"], "result": result}

    transport.on_request = on_request
    final = client.poll_task_until_terminal("t1", interval_ms=1)
    assert final["status"] == "completed"
    assert final["result"]["content"][0]["text"] == "done"

  def test_poll_until_terminal_times_out(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {
      "jsonrpc": "2.0",
      "id": m["id"],
      "result": {"resultType": "complete", "taskId": "t1", "status": "working"},
    }
    with pytest.raises(RequestError) as exc:
      client.poll_task_until_terminal("t1", interval_ms=1, timeout_ms=5)
    assert "did not finish" in exc.value.message

  def test_update_and_cancel_task_send_correct_params(self):
    client, transport = stub_client()
    transport.on_request = lambda m: {"jsonrpc": "2.0", "id": m["id"], "result": {}}
    client.update_task("t1", {"who": {"action": "accept"}})
    client.cancel_task("t1")
    # The on-wire params carry the per-request _meta envelope alongside the method params,
    # so assert the feature params (everything but _meta) match the §25.8/§25.9 shapes.
    update_params = {k: v for k, v in transport.sent[0]["params"].items() if k != "_meta"}
    cancel_params = {k: v for k, v in transport.sent[1]["params"].items() if k != "_meta"}
    assert transport.sent[0]["method"] == "tasks/update"
    assert update_params == {"taskId": "t1", "inputResponses": {"who": {"action": "accept"}}}
    assert "_meta" in transport.sent[0]["params"]  # the required envelope is still stamped
    assert transport.sent[1]["method"] == "tasks/cancel"
    assert cancel_params == {"taskId": "t1"}


# ─── §10 subscriptions ────────────────────────────────────────────────────────


class TestSubscriptions:
  def test_acks_delivers_filtered_notifications_and_tears_down(self):
    client, transport = stub_client()
    sub_id_holder = {}

    def on_subscribe(message):
      # Record the subscription id the listen request opened; the ack arrives out-of-band
      # below, exactly as a real synchronous transport feeds it through the on_message tap.
      sub_id_holder["id"] = str(message["id"])

    transport.on_subscribe = on_subscribe
    received = []

    # subscribe() returns immediately, WITHOUT blocking on the acknowledgement — a
    # single-threaded driver could not inject the ack otherwise (it would deadlock).
    handle = client.subscribe({"resourcesListChanged": True}, lambda method, params: received.append(method))
    assert isinstance(handle, SubscriptionHandle)
    assert handle.acknowledged.is_set() is False
    assert handle.acknowledged_filter == {}

    sub_id = sub_id_holder["id"]
    # The acknowledgement arrives later through the inbound tap, honoring only resourcesListChanged.
    transport.inject({
      "jsonrpc": "2.0",
      "method": "notifications/subscriptions/acknowledged",
      "params": {
        "notifications": {"resourcesListChanged": True},
        "_meta": {"io.modelcontextprotocol/subscriptionId": sub_id},
      },
    })
    assert handle.acknowledged.is_set()
    assert handle.acknowledged_filter == {"resourcesListChanged": True}

    # A change notification carrying the subscription id is delivered to the callback.
    transport.inject({
      "jsonrpc": "2.0",
      "method": "notifications/resources/list_changed",
      "params": {"_meta": {"io.modelcontextprotocol/subscriptionId": sub_id}},
    })
    assert received == ["notifications/resources/list_changed"]

    # Teardown sends notifications/cancelled and sets the closed event.
    notes = []
    transport.on_send = notes.append
    handle.unsubscribe()
    cancelled = next(m for m in notes if m.get("method") == "notifications/cancelled")
    assert cancelled["params"]["requestId"] == int(sub_id)
    assert handle.closed.is_set()

    # After unsubscribe, further notifications are no longer routed.
    transport.inject({
      "jsonrpc": "2.0",
      "method": "notifications/resources/list_changed",
      "params": {"_meta": {"io.modelcontextprotocol/subscriptionId": sub_id}},
    })
    assert received == ["notifications/resources/list_changed"]

  def test_unacknowledged_subscription_stays_pending_without_blocking(self):
    client, transport = stub_client()
    # No ack is ever injected. subscribe() must still return a handle promptly (no block),
    # leaving the handle unacknowledged rather than deadlocking the caller.
    transport.on_subscribe = lambda message: None
    handle = client.subscribe({"resourcesListChanged": True}, lambda *a: None)
    assert isinstance(handle, SubscriptionHandle)
    assert handle.acknowledged.is_set() is False
    assert handle.acknowledged_filter == {}
    # A bounded wait for the (never-arriving) ack returns False instead of hanging forever.
    assert handle.wait_acknowledged(timeout=0.05) is False

  def test_subscribe_without_transport_support_raises(self):
    class NoSubTransport(ClientTransport):
      def request(self, message):
        return {"jsonrpc": "2.0", "id": message["id"], "result": {}}

    client = Client(NoSubTransport(), CLIENT)
    with pytest.raises(RequestError) as exc:
      client.subscribe({"resourcesListChanged": True})
    assert "does not support subscriptions" in exc.value.message


# ─── Lifecycle ────────────────────────────────────────────────────────────────


class TestLifecycle:
  def test_close_clears_handlers_and_closes_transport(self):
    client, transport = stub_client()
    client.set_request_handler("roots/list", lambda p: {})
    client.set_notification_handler("notifications/message", lambda p: None)
    client.close()
    assert transport.closed is True
    # Handlers are gone: an inbound server request now yields method-not-found.
    transport.inject({"jsonrpc": "2.0", "id": "x", "method": "roots/list", "params": {}})
    assert transport.sent[-1]["error"]["code"] == -32601
