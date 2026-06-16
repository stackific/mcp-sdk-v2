"""Comprehensive runtime tests for the client host + Streamable HTTP transport.

This module exercises the *runtime* behaviour of :class:`mcp.client.client.Client`
(``client.py``) and the inbound-parsing/header surface of
:class:`mcp.client.http.StreamableHttpClientTransport` (``http.py``). It is deliberately
independent of the existing ``test_client.py`` / ``test_http.py`` suites: those use a
``StubTransport`` and a *threaded socket* server respectively, whereas this suite leans on

* a hand-rolled :class:`RecordingTransport` — a tiny :class:`ClientTransport` subclass that
  *records* every outbound ``request``/``send`` and returns *scripted* responses (a queue, a
  callable, or a default ``complete`` result), and lets a test push inbound interim frames
  through the ``set_on_message`` tap the :class:`Client` installs; and
* the real in-memory harness :func:`mcp.testing.connect_in_memory` driving a real
  :class:`mcp.server.server.McpServer` for the end-to-end paths.

For ``http.py`` the SSE parser, the final-response matcher, and the header builder are
driven directly with *constructed fakes* (a fake ``iter_lines`` response, a fake
``auth_provider``) — never a real network call.

The numbered references (§N, §11, …) are to the MCP V2 specification revision 2026-07-28.
"""

from __future__ import annotations

import threading

import pytest

from mcp.client.client import (
  INTERNAL_ERROR_CODE,
  METHOD_NOT_FOUND_CODE,
  Client,
  RequestError,
)
from mcp.client.http import (
  StreamableHttpClientTransport,
  _is_final_response,
  _iter_sse,
)
from mcp.client.transport import ClientTransport
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
)
from mcp.testing import connect_in_memory
from mcp.server.server import McpServer

INFO = {"name": "srv", "version": "1.0"}
CLIENT = {"name": "cli", "version": "0.1"}


# ─── A recording / scripted ClientTransport ────────────────────────────────────


class RecordingTransport(ClientTransport):
  """A :class:`ClientTransport` that records sends and returns scripted responses.

  The whole point of this fixture is *observability*: every outbound frame (whether a
  ``request`` carrying an id or a one-way ``send``) is appended to :attr:`sent`, so a test
  can inspect the exact wire shape the :class:`Client` produced — the stamped ``_meta``
  envelope, the merged caller meta, the ``progressToken``, an increasing id, etc.

  Responses to a ``request`` are scripted in priority order:

  1. ``script`` — a list of response envelopes (or callables) consumed FIFO, one per call;
  2. ``responder`` — a callable ``responder(message) -> response | None`` consulted when the
     script is empty (returning ``None`` falls through to the default);
  3. the default — a JSON-RPC success whose ``result`` is ``{"resultType": "complete"}``.

  Inbound interim frames (server→client requests, notifications, subscription acks) are
  delivered through :meth:`inbound`, which invokes the ``set_on_message`` tap the
  :class:`Client` installs in its constructor.
  """

  def __init__(self) -> None:
    #: Every outbound frame in order — requests and notifications/replies alike.
    self.sent: list[dict] = []
    #: Just the one-way frames pushed through :meth:`send` (cancellations, replies).
    self.sent_via_send: list[dict] = []
    #: Just the request frames pushed through :meth:`request`.
    self.sent_via_request: list[dict] = []
    #: Per-call response queue (consumed FIFO); entries may be dicts or callables.
    self.script: list = []
    #: Fallback responder consulted when the script is exhausted.
    self.responder = None
    #: Subscription open messages recorded by :meth:`open_subscription`.
    self.subscriptions: list[dict] = []
    self.closed = False
    self._on_message = None
    self._param_resolver = None

  # — hooks the Client wires —
  def set_on_message(self, callback) -> None:
    self._on_message = callback

  def set_param_header_resolver(self, resolver) -> None:
    self._param_resolver = resolver

  # — the request/response channel —
  def request(self, message: dict, *, timeout_ms: int | None = None) -> dict:
    self.sent.append(message)
    self.sent_via_request.append(message)
    if self.script:
      scripted = self.script.pop(0)
      return scripted(message) if callable(scripted) else scripted
    if self.responder is not None:
      response = self.responder(message)
      if response is not None:
        return response
    return {"jsonrpc": "2.0", "id": message["id"], "result": {"resultType": "complete"}}

  def send(self, message: dict) -> None:
    self.sent.append(message)
    self.sent_via_send.append(message)

  def open_subscription(self, message: dict, on_ready):
    self.sent.append(message)
    self.subscriptions.append(message)
    on_ready()
    return _ScriptedStream()

  def close(self) -> None:
    self.closed = True

  # — test driver: push an inbound frame into the Client —
  def inbound(self, frame: dict) -> None:
    assert self._on_message is not None, "Client did not install set_on_message"
    self._on_message(frame)

  # — convenience: invoke the resolver the Client installed —
  def resolve_param_headers(self, method: str, params: dict | None) -> dict:
    return self._param_resolver(method, params) if self._param_resolver else {}


class _ScriptedStream:
  """A minimal stream handle exposing a ``closed`` :class:`threading.Event`."""

  def __init__(self) -> None:
    self.closed = threading.Event()


def make_client(capabilities: dict | None = None, **kwargs) -> tuple[Client, RecordingTransport]:
  """Build a :class:`Client` over a fresh :class:`RecordingTransport`."""
  transport = RecordingTransport()
  client = Client(transport, CLIENT, capabilities=capabilities, **kwargs)
  return client, transport


def _discover_response(message: dict, **overrides) -> dict:
  """Build a ``server/discover`` success response for the recording transport."""
  result = {
    "resultType": "complete",
    "supportedVersions": [CURRENT_PROTOCOL_VERSION],
    "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
    "serverInfo": {"name": "fake-server", "version": "2.0.0"},
  }
  result.update(overrides)
  return {"jsonrpc": "2.0", "id": message["id"], "result": result}


def _ok(message: dict, result: dict | None = None) -> dict:
  """A JSON-RPC success envelope echoing the request id."""
  return {"jsonrpc": "2.0", "id": message["id"], "result": result if result is not None else {}}


def _err(message: dict, code: int, msg: str, data: object = None) -> dict:
  """A JSON-RPC error envelope echoing the request id."""
  error: dict = {"code": code, "message": msg}
  if data is not None:
    error["data"] = data
  return {"jsonrpc": "2.0", "id": message["id"], "error": error}


# ─── request(): the _meta envelope (§4.3) ──────────────────────────────────────


class TestRequestEnvelope:
  def test_stamps_three_required_reserved_keys(self):
    client, transport = make_client(capabilities={"tools": {}})
    client.request("ping")
    meta = transport.sent[0]["params"]["_meta"]
    assert meta[PROTOCOL_VERSION_META_KEY] == CURRENT_PROTOCOL_VERSION
    assert meta[CLIENT_INFO_META_KEY] == CLIENT
    assert meta[CLIENT_CAPABILITIES_META_KEY] == {"tools": {}}

  def test_protocol_version_in_meta_is_negotiated_after_discover(self):
    client, transport = make_client()
    transport.script.append(lambda m: _discover_response(m, supportedVersions=[CURRENT_PROTOCOL_VERSION]))
    client.discover()
    client.request("ping")
    meta = transport.sent[1]["params"]["_meta"]
    assert meta[PROTOCOL_VERSION_META_KEY] == CURRENT_PROTOCOL_VERSION

  def test_client_capabilities_default_to_empty_object(self):
    client, transport = make_client()  # no capabilities
    client.request("ping")
    assert transport.sent[0]["params"]["_meta"][CLIENT_CAPABILITIES_META_KEY] == {}

  def test_capabilities_object_is_stamped_verbatim(self):
    caps = {"elicitation": {}, "sampling": {}, "roots": {"listChanged": True}}
    client, transport = make_client(capabilities=caps)
    client.request("ping")
    assert transport.sent[0]["params"]["_meta"][CLIENT_CAPABILITIES_META_KEY] == caps

  def test_message_shape_is_a_jsonrpc_request(self):
    client, transport = make_client()
    client.request("tools/list", {"cursor": "c1"})
    msg = transport.sent[0]
    assert msg["jsonrpc"] == "2.0"
    assert msg["method"] == "tools/list"
    assert isinstance(msg["id"], int)

  def test_non_meta_params_are_preserved_alongside_envelope(self):
    client, transport = make_client()
    client.request("tools/call", {"name": "echo", "arguments": {"msg": "hi"}})
    params = transport.sent[0]["params"]
    assert params["name"] == "echo"
    assert params["arguments"] == {"msg": "hi"}
    assert "_meta" in params

  def test_empty_params_still_carry_meta(self):
    client, transport = make_client()
    client.request("ping")
    assert list(transport.sent[0]["params"].keys()) == ["_meta"]


class TestRequestMetaExtra:
  def test_meta_extra_merges_caller_keys(self):
    client, transport = make_client()
    client.request("ping", meta_extra={"traceparent": "00-abc-def-01"})
    meta = transport.sent[0]["params"]["_meta"]
    assert meta["traceparent"] == "00-abc-def-01"
    # …without dropping the reserved keys.
    assert meta[CLIENT_INFO_META_KEY] == CLIENT

  def test_caller_supplied_params_meta_is_merged(self):
    client, transport = make_client()
    client.request("ping", {"_meta": {"baggage": "k=v"}})
    meta = transport.sent[0]["params"]["_meta"]
    assert meta["baggage"] == "k=v"
    assert meta[PROTOCOL_VERSION_META_KEY] == CURRENT_PROTOCOL_VERSION

  def test_reserved_keys_win_over_caller_meta(self):
    # A caller cannot override the reserved protocolVersion key — the envelope wins.
    client, transport = make_client()
    client.request("ping", {"_meta": {PROTOCOL_VERSION_META_KEY: "1999-01-01"}})
    meta = transport.sent[0]["params"]["_meta"]
    assert meta[PROTOCOL_VERSION_META_KEY] == CURRENT_PROTOCOL_VERSION

  def test_reserved_keys_win_over_meta_extra(self):
    client, transport = make_client()
    client.request("ping", meta_extra={CLIENT_INFO_META_KEY: {"name": "evil", "version": "0"}})
    assert transport.sent[0]["params"]["_meta"][CLIENT_INFO_META_KEY] == CLIENT

  def test_meta_extra_wins_over_caller_params_meta(self):
    client, transport = make_client()
    client.request("ping", {"_meta": {"traceparent": "caller"}}, meta_extra={"traceparent": "extra"})
    assert transport.sent[0]["params"]["_meta"]["traceparent"] == "extra"


class TestRequestProgress:
  def test_progress_true_adds_progress_token_equal_to_id(self):
    client, transport = make_client()
    client.request("tools/call", {"name": "x"}, progress=True)
    msg = transport.sent[0]
    assert msg["params"]["_meta"]["progressToken"] == msg["id"]

  def test_explicit_progress_token_overrides_request_id(self):
    client, transport = make_client()
    client.request("tools/call", {"name": "x"}, progress_token="tok-1")
    assert transport.sent[0]["params"]["_meta"]["progressToken"] == "tok-1"

  def test_no_progress_token_when_progress_is_false(self):
    client, transport = make_client()
    client.request("ping")
    assert "progressToken" not in transport.sent[0]["params"]["_meta"]

  def test_on_progress_callback_receives_correlated_notification(self):
    client, transport = make_client()
    seen: list[dict] = []

    def respond(message: dict) -> dict:
      # The transport delivers a progress notification on this request's stream, then
      # the final response. Inbound frames ride the on_message tap.
      token = message["params"]["_meta"]["progressToken"]
      transport.inbound(
        {"jsonrpc": "2.0", "method": "notifications/progress",
         "params": {"progressToken": token, "progress": 0.5}}
      )
      return _ok(message, {"done": True})

    transport.responder = respond
    client.request("tools/call", {"name": "x"}, on_progress=seen.append)
    assert seen and seen[0]["progress"] == 0.5

  def test_progress_handler_unregistered_after_request(self):
    client, transport = make_client()
    client.request("tools/call", {"name": "x"}, progress_token="tok", on_progress=lambda p: None)
    # A late progress notification for the same token now has nowhere to go (no raise).
    transport.inbound(
      {"jsonrpc": "2.0", "method": "notifications/progress",
       "params": {"progressToken": "tok", "progress": 0.9}}
    )  # must not raise


class TestRequestIdIncrement:
  def test_id_increments_each_call(self):
    client, transport = make_client()
    client.request("ping")
    client.request("ping")
    client.request("ping")
    assert [m["id"] for m in transport.sent] == [1, 2, 3]

  def test_first_id_is_one(self):
    client, transport = make_client()
    client.request("ping")
    assert transport.sent[0]["id"] == 1


# ─── request(): error / non-dict surfacing (§7.5) ──────────────────────────────


class TestRequestErrors:
  def test_delivered_error_raises_request_error_with_code_message_data(self):
    client, transport = make_client()
    transport.responder = lambda m: _err(m, -32602, "bad params", {"field": "name"})
    with pytest.raises(RequestError) as exc:
      client.request("tools/call", {"name": "x"})
    assert exc.value.code == -32602
    assert exc.value.message == "bad params"
    assert exc.value.data == {"field": "name"}

  def test_request_error_name_is_stable(self):
    client, transport = make_client()
    transport.responder = lambda m: _err(m, -1, "boom")
    with pytest.raises(RequestError) as exc:
      client.request("ping")
    assert exc.value.name == "RequestError"

  def test_error_without_data_yields_none_data(self):
    client, transport = make_client()
    transport.responder = lambda m: _err(m, -32601, "method gone")
    with pytest.raises(RequestError) as exc:
      client.request("nope")
    assert exc.value.data is None

  def test_error_missing_code_surfaces_none_code(self):
    client, transport = make_client()
    transport.responder = lambda m: {"jsonrpc": "2.0", "id": m["id"], "error": {"message": "no code"}}
    with pytest.raises(RequestError) as exc:
      client.request("ping")
    assert exc.value.code is None
    assert exc.value.message == "no code"

  def test_non_dict_response_raises_request_error(self):
    client, transport = make_client()
    transport.script.append([1, 2, 3])  # the transport returned a non-object
    with pytest.raises(RequestError) as exc:
      client.request("ping")
    assert "non-object response" in exc.value.message

  def test_none_response_raises_request_error(self):
    client, transport = make_client()
    transport.script.append(None)
    with pytest.raises(RequestError):
      client.request("ping")

  def test_result_is_returned_unwrapped(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"value": 42})
    assert client.request("ping") == {"value": 42}

  def test_missing_result_defaults_to_empty_dict(self):
    client, transport = make_client()
    transport.responder = lambda m: {"jsonrpc": "2.0", "id": m["id"]}
    assert client.request("ping") == {}


# ─── discovery (§5.3–§5.4) ─────────────────────────────────────────────────────


class TestDiscovery:
  def test_caches_server_info_capabilities_instructions(self):
    client, transport = make_client()
    transport.script.append(lambda m: _discover_response(m, instructions="use carefully"))
    client.discover()
    assert client.server_info == {"name": "fake-server", "version": "2.0.0"}
    assert client.server_capabilities == {"tools": {}, "resources": {}, "prompts": {}}
    assert client.instructions == "use carefully"

  def test_instructions_absent_resolves_to_none(self):
    client, transport = make_client()
    transport.script = [lambda m: _discover_response(m)]  # no instructions key
    client.discover()
    assert client.instructions is None

  def test_negotiates_version_via_client_preference_order(self):
    # The server offers both; the client prefers the second — select_revision honors the
    # client's order, not the server's. (R-5.3.2-d)
    client, transport = make_client()
    client.preferred_versions = ["2030-01-01", CURRENT_PROTOCOL_VERSION]
    transport.script.append(
      lambda m: _discover_response(m, supportedVersions=[CURRENT_PROTOCOL_VERSION, "2030-01-01"])
    )
    client.discover()
    assert client.negotiated_version == "2030-01-01"

  def test_no_shared_revision_leaves_negotiated_none(self):
    client, transport = make_client()
    client.preferred_versions = ["1900-01-01"]
    transport.script.append(lambda m: _discover_response(m, supportedVersions=[CURRENT_PROTOCOL_VERSION]))
    client.discover()
    assert client.negotiated_version is None
    assert client.connected is False

  def test_connected_property_flips_after_discover(self):
    client, transport = make_client()
    assert client.connected is False
    transport.script.append(lambda m: _discover_response(m))
    client.discover()
    assert client.connected is True

  def test_discover_request_carries_envelope(self):
    client, transport = make_client(capabilities={"tools": {}})
    transport.script.append(lambda m: _discover_response(m))
    client.discover()
    meta = transport.sent[0]["params"]["_meta"]
    assert transport.sent[0]["method"] == "server/discover"
    assert meta[CLIENT_INFO_META_KEY] == CLIENT
    assert meta[CLIENT_CAPABILITIES_META_KEY] == {"tools": {}}

  def test_accessor_methods_match_cached_state(self):
    client, transport = make_client()
    transport.script.append(lambda m: _discover_response(m, instructions="hi"))
    client.discover()
    assert client.get_server_version() == client.server_info
    assert client.get_server_capabilities() == client.server_capabilities
    assert client.get_negotiated_version() == client.negotiated_version
    assert client.get_instructions() == "hi"


class TestStatus:
  def _connect(self) -> tuple[Client, RecordingTransport]:
    client, transport = make_client(capabilities={"elicitation": {}})
    transport.script.append(
      lambda m: _discover_response(
        m,
        capabilities={"tools": {}, "extensions": {"io.modelcontextprotocol/tasks": {}}},
        instructions="be brief",
      )
    )
    client.discover()
    return client, transport

  def test_status_shape_before_discover(self):
    client, _ = make_client(capabilities={"roots": {}})
    status = client.status()
    assert status == {
      "connected": False,
      "negotiatedVersion": None,
      "serverInfo": None,
      "serverCapabilities": None,
      "serverExtensions": None,
      "clientCapabilities": {"roots": {}},
      "instructions": None,
    }

  def test_status_shape_after_discover(self):
    client, _ = self._connect()
    status = client.status()
    assert status["connected"] is True
    assert status["negotiatedVersion"] == CURRENT_PROTOCOL_VERSION
    assert status["serverInfo"] == {"name": "fake-server", "version": "2.0.0"}
    assert status["serverCapabilities"]["tools"] == {}
    assert status["serverExtensions"] == {"io.modelcontextprotocol/tasks": {}}
    assert status["clientCapabilities"] == {"elicitation": {}}
    assert status["instructions"] == "be brief"

  def test_status_has_exactly_the_expected_keys(self):
    client, _ = self._connect()
    assert set(client.status().keys()) == {
      "connected", "negotiatedVersion", "serverInfo", "serverCapabilities",
      "serverExtensions", "clientCapabilities", "instructions",
    }


class TestServerSupports:
  def _connect(self, caps: dict) -> Client:
    client, transport = make_client()
    transport.script.append(lambda m: _discover_response(m, capabilities=caps))
    client.discover()
    return client

  def test_server_supports_declared_capability(self):
    client = self._connect({"tools": {}, "resources": {}})
    assert client.server_supports("tools") is True
    assert client.server_supports("resources") is True

  def test_server_supports_undeclared_is_false(self):
    client = self._connect({"tools": {}})
    assert client.server_supports("prompts") is False

  def test_server_supports_before_discover_is_false(self):
    client, _ = make_client()
    assert client.server_supports("tools") is False

  def test_assert_server_capability_raises_for_missing(self):
    client = self._connect({"tools": {}})
    with pytest.raises(RequestError) as exc:
      client.assert_server_capability("prompts")
    assert exc.value.code == -32003

  def test_assert_server_capability_passes_for_present(self):
    client = self._connect({"prompts": {}})
    client.assert_server_capability("prompts")  # must not raise


# ─── typed convenience methods ─────────────────────────────────────────────────


class TestConvenienceMethods:
  def _capture(self) -> tuple[Client, RecordingTransport]:
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {})
    return client, transport

  def test_ping(self):
    client, transport = self._capture()
    client.ping()
    assert transport.sent[-1]["method"] == "ping"

  def test_list_tools_no_cursor(self):
    client, transport = self._capture()
    client.list_tools()
    assert transport.sent[-1]["method"] == "tools/list"
    assert transport.sent[-1]["params"] == {"_meta": transport.sent[-1]["params"]["_meta"]}

  def test_list_tools_with_cursor(self):
    client, transport = self._capture()
    client.list_tools("cur-2")
    assert transport.sent[-1]["params"]["cursor"] == "cur-2"

  def test_call_tool_sends_name_and_arguments(self):
    client, transport = self._capture()
    client.call_tool("echo", {"msg": "hi"})
    msg = transport.sent[-1]
    assert msg["method"] == "tools/call"
    assert msg["params"]["name"] == "echo"
    assert msg["params"]["arguments"] == {"msg": "hi"}

  def test_call_tool_defaults_empty_arguments(self):
    client, transport = self._capture()
    client.call_tool("noop")
    assert transport.sent[-1]["params"]["arguments"] == {}

  def test_list_resources(self):
    client, transport = self._capture()
    client.list_resources()
    assert transport.sent[-1]["method"] == "resources/list"

  def test_list_resources_with_cursor(self):
    client, transport = self._capture()
    client.list_resources("c")
    assert transport.sent[-1]["params"]["cursor"] == "c"

  def test_list_resource_templates(self):
    client, transport = self._capture()
    client.list_resource_templates()
    assert transport.sent[-1]["method"] == "resources/templates/list"

  def test_read_resource(self):
    client, transport = self._capture()
    client.read_resource("file:///doc.txt")
    msg = transport.sent[-1]
    assert msg["method"] == "resources/read"
    assert msg["params"]["uri"] == "file:///doc.txt"

  def test_list_prompts(self):
    client, transport = self._capture()
    client.list_prompts()
    assert transport.sent[-1]["method"] == "prompts/list"

  def test_get_prompt(self):
    client, transport = self._capture()
    client.get_prompt("greet", {"name": "Sam"})
    msg = transport.sent[-1]
    assert msg["method"] == "prompts/get"
    assert msg["params"]["name"] == "greet"
    assert msg["params"]["arguments"] == {"name": "Sam"}

  def test_get_prompt_defaults_empty_arguments(self):
    client, transport = self._capture()
    client.get_prompt("greet")
    assert transport.sent[-1]["params"]["arguments"] == {}

  def test_complete_without_context(self):
    client, transport = self._capture()
    client.complete({"type": "ref/prompt", "name": "p"}, {"name": "arg", "value": "v"})
    msg = transport.sent[-1]
    assert msg["method"] == "completion/complete"
    assert msg["params"]["ref"] == {"type": "ref/prompt", "name": "p"}
    assert msg["params"]["argument"] == {"name": "arg", "value": "v"}
    assert "context" not in msg["params"]

  def test_complete_with_context(self):
    client, transport = self._capture()
    client.complete({"type": "ref/prompt", "name": "p"}, {"name": "a"}, {"arguments": {"x": "y"}})
    assert transport.sent[-1]["params"]["context"] == {"arguments": {"x": "y"}}

  def test_set_logging_level(self):
    client, transport = self._capture()
    client.set_logging_level("warning")
    msg = transport.sent[-1]
    assert msg["method"] == "logging/setLevel"
    assert msg["params"]["level"] == "warning"

  def test_raw_passes_through_method_and_params(self):
    client, transport = self._capture()
    client.raw("vendor/custom", {"k": "v"})
    msg = transport.sent[-1]
    assert msg["method"] == "vendor/custom"
    assert msg["params"]["k"] == "v"
    assert PROTOCOL_VERSION_META_KEY in msg["params"]["_meta"]


# ─── §11 multi-round-trip request_with_input ───────────────────────────────────


class TestRequestWithInput:
  def test_loops_through_input_required_then_completes(self):
    client, transport = make_client(capabilities={"elicitation": {}})
    handler_calls: list[dict] = []

    def elicit(params: dict) -> dict:
      handler_calls.append(params)
      return {"action": "accept", "content": {"answer": "yes"}}

    client.set_request_handler("elicitation/create", elicit)

    transport.script = [
      # round 1: server asks for input
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-1": {"method": "elicitation/create", "params": {"q": "ok?"}}},
        "requestState": "state-token",
      }),
      # round 2: server completes
      lambda m: _ok(m, {"resultType": "complete", "content": [{"type": "text", "text": "done"}]}),
    ]

    result = client.request_with_input("tools/call", {"name": "form", "arguments": {}})
    assert result["resultType"] == "complete"
    # The handler was invoked with the server-supplied params.
    assert handler_calls == [{"q": "ok?"}]
    # The retry carried inputResponses + the echoed requestState.
    retry = transport.sent_via_request[1]
    assert retry["params"]["inputResponses"] == {"in-1": {"action": "accept", "content": {"answer": "yes"}}}
    assert retry["params"]["requestState"] == "state-token"
    # …and the original base params are preserved on the retry.
    assert retry["params"]["name"] == "form"

  def test_request_state_omitted_when_server_omits_it(self):
    client, transport = make_client(capabilities={"elicitation": {}})
    client.set_request_handler("elicitation/create", lambda p: {"action": "accept"})
    transport.script = [
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-1": {"method": "elicitation/create", "params": {}}},
      }),
      lambda m: _ok(m, {"resultType": "complete"}),
    ]
    client.request_with_input("tools/call", {"name": "x", "arguments": {}})
    assert "requestState" not in transport.sent_via_request[1]["params"]

  def test_two_rounds_of_input(self):
    client, transport = make_client(capabilities={"elicitation": {}})
    client.set_request_handler("elicitation/create", lambda p: {"action": "accept"})
    transport.script = [
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-1": {"method": "elicitation/create", "params": {}}},
        "requestState": "s1",
      }),
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-2": {"method": "elicitation/create", "params": {}}},
        "requestState": "s2",
      }),
      lambda m: _ok(m, {"resultType": "complete", "ok": True}),
    ]
    result = client.request_with_input("tools/call", {"name": "x", "arguments": {}})
    assert result["ok"] is True
    assert len(transport.sent_via_request) == 3
    assert transport.sent_via_request[2]["params"]["requestState"] == "s2"

  def test_complete_immediately_without_input(self):
    client, transport = make_client()
    transport.script = [lambda m: _ok(m, {"resultType": "complete", "v": 1})]
    result = client.request_with_input("tools/call", {"name": "x"})
    assert result == {"resultType": "complete", "v": 1}
    assert len(transport.sent_via_request) == 1

  def test_unregistered_kind_raises_method_not_found(self):
    # The kind IS declared as a capability (so discriminate passes) but no handler is
    # registered → -32601.
    client, transport = make_client(capabilities={"elicitation": {}})
    transport.script = [
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-1": {"method": "elicitation/create", "params": {}}},
        "requestState": "s",
      }),
    ]
    with pytest.raises(RequestError) as exc:
      client.request_with_input("tools/call", {"name": "x", "arguments": {}})
    assert exc.value.code == METHOD_NOT_FOUND_CODE
    assert exc.value.code == -32601

  def test_undeclared_capability_kind_raises_via_discriminate(self):
    # The client capabilities lack "elicitation", so discriminate_result_type flags the
    # requested kind as undeclared → an MRTR error (-32603).
    client, transport = make_client(capabilities={})  # no elicitation
    client.set_request_handler("elicitation/create", lambda p: {"action": "accept"})
    transport.script = [
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-1": {"method": "elicitation/create", "params": {}}},
        "requestState": "s",
      }),
    ]
    with pytest.raises(RequestError) as exc:
      client.request_with_input("tools/call", {"name": "x", "arguments": {}})
    assert exc.value.code == INTERNAL_ERROR_CODE
    assert "Multi-round-trip error" in exc.value.message

  def test_unrecognized_result_type_raises(self):
    client, transport = make_client()
    transport.script = [lambda m: _ok(m, {"resultType": "bogus"})]
    with pytest.raises(RequestError) as exc:
      client.request_with_input("tools/call", {"name": "x"})
    assert exc.value.code == INTERNAL_ERROR_CODE

  def test_exceeding_max_rounds_raises_internal_error(self):
    client, transport = make_client(capabilities={"elicitation": {}})
    client.set_request_handler("elicitation/create", lambda p: {"action": "accept"})
    # An always-input_required server: each round re-asks, never completes.
    transport.responder = lambda m: _ok(m, {
      "resultType": "input_required",
      "inputRequests": {"in-1": {"method": "elicitation/create", "params": {}}},
      "requestState": "loop",
    })
    with pytest.raises(RequestError) as exc:
      client.request_with_input("tools/call", {"name": "x", "arguments": {}}, max_rounds=3)
    assert exc.value.code == INTERNAL_ERROR_CODE
    assert "exceeded 3 rounds" in exc.value.message

  def test_meta_extra_is_carried_on_each_round(self):
    client, transport = make_client(capabilities={"elicitation": {}})
    client.set_request_handler("elicitation/create", lambda p: {"action": "accept"})
    transport.script = [
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-1": {"method": "elicitation/create", "params": {}}},
        "requestState": "s",
      }),
      lambda m: _ok(m, {"resultType": "complete"}),
    ]
    client.request_with_input("tools/call", {"name": "x", "arguments": {}}, meta_extra={"traceparent": "tp"})
    for msg in transport.sent_via_request:
      assert msg["params"]["_meta"]["traceparent"] == "tp"


# ─── call_tool routing + cancellation ──────────────────────────────────────────


class TestCallToolRouting:
  def test_call_tool_routes_through_request_with_input(self):
    # call_tool drives the MRTR loop: an input_required is fulfilled, then completed.
    client, transport = make_client(capabilities={"elicitation": {}})
    client.set_request_handler("elicitation/create", lambda p: {"action": "decline"})
    transport.script = [
      lambda m: _ok(m, {
        "resultType": "input_required",
        "inputRequests": {"in-1": {"method": "elicitation/create", "params": {}}},
        "requestState": "s",
      }),
      lambda m: _ok(m, {"resultType": "complete", "content": []}),
    ]
    result = client.call_tool("askbot", {"q": 1})
    assert result["resultType"] == "complete"
    assert len(transport.sent_via_request) == 2

  def test_call_tool_with_meta_passes_trace_context(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"resultType": "complete"})
    client.call_tool_with_meta("echo", {"m": "x"}, {"traceparent": "00-trace"})
    assert transport.sent_via_request[-1]["params"]["_meta"]["traceparent"] == "00-trace"

  def test_call_tool_meta_keyword_passes_trace_context(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"resultType": "complete"})
    client.call_tool("echo", {"m": "x"}, meta={"traceparent": "tp2"})
    assert transport.sent_via_request[-1]["params"]["_meta"]["traceparent"] == "tp2"

  def test_call_tool_cancellable_sets_progress_and_registers_cancel(self):
    client, transport = make_client()
    captured: dict = {}

    def respond(message: dict) -> dict:
      captured["progressToken"] = message["params"]["_meta"].get("progressToken")
      # While in flight the cancel id is registered → cancel() can fire.
      captured["cancelled"] = client.cancel("op-1")
      return _ok(message, {"resultType": "complete"})

    transport.responder = respond
    client.call_tool_cancellable("longtool", {"a": 1}, "op-1")
    # progress was enabled (a token was stamped equal to the request id)…
    assert captured["progressToken"] == transport.sent_via_request[-1]["id"]
    # …and the call was cancellable while in flight.
    assert captured["cancelled"] is True

  def test_cancel_sends_cancelled_notification_with_request_id(self):
    client, transport = make_client()
    request_ids: list[int] = []

    def respond(message: dict) -> dict:
      request_ids.append(message["id"])
      client.cancel("c1")  # fire while the call is in flight
      return _ok(message, {"resultType": "complete"})

    transport.responder = respond
    client.call_tool_cancellable("t", {}, "c1")

    cancellations = [m for m in transport.sent_via_send if m["method"] == "notifications/cancelled"]
    assert len(cancellations) == 1
    assert cancellations[0]["params"]["requestId"] == request_ids[0]
    assert cancellations[0]["params"]["reason"] == "client cancelled"

  def test_cancel_unknown_id_returns_false_and_sends_nothing(self):
    client, transport = make_client()
    assert client.cancel("never-registered") is False
    assert transport.sent_via_send == []

  def test_cancel_after_completion_returns_false(self):
    # Once the call returns the in-flight entry is popped → a later cancel is a no-op.
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"resultType": "complete"})
    client.call_tool_cancellable("t", {}, "c2")
    assert client.cancel("c2") is False


# ─── §25 Tasks helpers ─────────────────────────────────────────────────────────


class TestTaskHelpers:
  def test_create_task_sends_tools_call_with_task_ttl(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"resultType": "task", "taskId": "t-1"})
    client.create_task("longjob", {"n": 1}, ttl_ms=60000)
    msg = transport.sent_via_request[-1]
    assert msg["method"] == "tools/call"
    assert msg["params"]["name"] == "longjob"
    assert msg["params"]["arguments"] == {"n": 1}
    assert msg["params"]["task"] == {"ttl": 60000}

  def test_create_task_default_ttl(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {})
    client.create_task("job")
    assert transport.sent_via_request[-1]["params"]["task"] == {"ttl": 300000}

  def test_get_task_sends_tasks_get(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"status": "working"})
    client.get_task("task-42")
    msg = transport.sent_via_request[-1]
    assert msg["method"] == "tasks/get"
    assert msg["params"]["taskId"] == "task-42"

  def test_cancel_task_sends_tasks_cancel(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"status": "cancelled"})
    client.cancel_task("task-7")
    msg = transport.sent_via_request[-1]
    assert msg["method"] == "tasks/cancel"
    assert msg["params"]["taskId"] == "task-7"

  def test_update_task_sends_tasks_update(self):
    client, transport = make_client()
    transport.responder = lambda m: _ok(m, {"status": "working"})
    client.update_task("task-9", {"in-1": {"action": "accept"}})
    msg = transport.sent_via_request[-1]
    assert msg["method"] == "tasks/update"
    assert msg["params"]["taskId"] == "task-9"
    assert msg["params"]["inputResponses"] == {"in-1": {"action": "accept"}}


# ─── frame tap (set_frame_listener) ────────────────────────────────────────────


class TestFrameTap:
  def test_captures_outgoing_send_frames(self):
    client, transport = make_client()
    tap: list[tuple] = []
    client.set_frame_listener(lambda direction, frame: tap.append((direction, frame)))
    transport.responder = lambda m: _ok(m, {})
    client.request("ping")
    sends = [(d, f) for d, f in tap if d == "send"]
    assert sends and sends[0][1]["method"] == "ping"

  def test_captures_inbound_recv_frames(self):
    client, transport = make_client()
    tap: list[tuple] = []
    client.set_frame_listener(lambda direction, frame: tap.append((direction, frame)))
    transport.inbound({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info"}})
    recvs = [(d, f) for d, f in tap if d == "recv"]
    assert recvs and recvs[0][1]["method"] == "notifications/message"

  def test_listener_fault_does_not_break_request(self):
    client, transport = make_client()

    def boom(direction, frame):
      raise RuntimeError("tap exploded")

    client.set_frame_listener(boom)
    transport.responder = lambda m: _ok(m, {"ok": True})
    assert client.request("ping") == {"ok": True}  # the tap fault is swallowed

  def test_listener_can_be_cleared(self):
    client, transport = make_client()
    tap: list = []
    client.set_frame_listener(lambda d, f: tap.append((d, f)))
    client.set_frame_listener(None)
    transport.responder = lambda m: _ok(m, {})
    client.request("ping")
    assert tap == []


class TestInboundServerRequests:
  def test_routes_server_request_to_handler_and_replies(self):
    client, transport = make_client()
    client.set_request_handler("sampling/createMessage", lambda p: {"role": "assistant", "content": {}, "model": "m"})
    transport.inbound({"jsonrpc": "2.0", "id": "srv-1", "method": "sampling/createMessage", "params": {"x": 1}})
    reply = transport.sent_via_send[-1]
    assert reply["id"] == "srv-1"
    assert reply["result"] == {"role": "assistant", "content": {}, "model": "m"}

  def test_unregistered_server_request_replies_method_not_found(self):
    client, transport = make_client()
    transport.inbound({"jsonrpc": "2.0", "id": "srv-2", "method": "roots/list", "params": {}})
    reply = transport.sent_via_send[-1]
    assert reply["id"] == "srv-2"
    assert reply["error"]["code"] == METHOD_NOT_FOUND_CODE

  def test_handler_request_error_maps_to_error_reply(self):
    client, transport = make_client()

    def handler(params):
      raise RequestError(-32000, "handler said no", {"why": "test"})

    client.set_request_handler("elicitation/create", handler)
    transport.inbound({"jsonrpc": "2.0", "id": "srv-3", "method": "elicitation/create", "params": {}})
    reply = transport.sent_via_send[-1]
    assert reply["error"]["code"] == -32000
    assert reply["error"]["message"] == "handler said no"
    assert reply["error"]["data"] == {"why": "test"}

  def test_handler_other_exception_maps_to_internal_error(self):
    client, transport = make_client()
    client.set_request_handler("elicitation/create", lambda p: (_ for _ in ()).throw(RuntimeError("boom")))
    transport.inbound({"jsonrpc": "2.0", "id": "srv-4", "method": "elicitation/create", "params": {}})
    reply = transport.sent_via_send[-1]
    assert reply["error"]["code"] == INTERNAL_ERROR_CODE
    assert "boom" in reply["error"]["message"]

  def test_non_dict_handler_result_becomes_empty_object(self):
    client, transport = make_client()
    client.set_request_handler("roots/list", lambda p: "not a dict")
    transport.inbound({"jsonrpc": "2.0", "id": "srv-5", "method": "roots/list", "params": {}})
    assert transport.sent_via_send[-1]["result"] == {}

  def test_remove_request_handler_reverts_to_method_not_found(self):
    client, transport = make_client()
    client.set_request_handler("roots/list", lambda p: {"roots": []})
    client.remove_request_handler("roots/list")
    transport.inbound({"jsonrpc": "2.0", "id": "srv-6", "method": "roots/list", "params": {}})
    assert transport.sent_via_send[-1]["error"]["code"] == METHOD_NOT_FOUND_CODE


class TestInboundNotifications:
  def test_routes_notification_to_handler(self):
    client, transport = make_client()
    seen: list[dict] = []
    client.set_notification_handler("notifications/message", seen.append)
    transport.inbound({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "warning"}})
    assert seen == [{"level": "warning"}]

  def test_remove_notification_handler(self):
    client, transport = make_client()
    seen: list[dict] = []
    client.set_notification_handler("notifications/message", seen.append)
    client.remove_notification_handler("notifications/message")
    transport.inbound({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info"}})
    assert seen == []

  def test_notification_handler_fault_is_swallowed(self):
    client, transport = make_client()
    client.set_notification_handler("notifications/message", lambda p: (_ for _ in ()).throw(ValueError("x")))
    # The faulty handler must not propagate out of the inbound tap.
    transport.inbound({"jsonrpc": "2.0", "method": "notifications/message", "params": {}})

  def test_response_frame_is_not_routed_as_request_or_notification(self):
    # A result frame matches neither the server-request nor notification shapes.
    client, transport = make_client()
    transport.inbound({"jsonrpc": "2.0", "id": 5, "result": {"ok": True}})
    assert transport.sent_via_send == []


class TestSubscriptionFrameTap:
  def test_acknowledged_frame_resolves_pending_subscribe(self):
    client, transport = make_client()
    handle = client.subscribe({"toolsListChanged": True})
    sub_id = handle.subscription_id
    # The acknowledgement rides the inbound tap and populates the handle.
    transport.inbound({
      "jsonrpc": "2.0",
      "method": "notifications/subscriptions/acknowledged",
      "params": {
        "notifications": {"toolsListChanged": True},
        "_meta": {"io.modelcontextprotocol/subscriptionId": sub_id},
      },
    })
    assert handle.acknowledged.is_set()
    assert handle.acknowledged_filter == {"toolsListChanged": True}

  def test_change_notification_routed_to_subscription_callback(self):
    client, transport = make_client()
    received: list[tuple] = []
    handle = client.subscribe({"toolsListChanged": True}, on_notification=lambda m, p: received.append((m, p)))
    sub_id = handle.subscription_id
    transport.inbound({
      "jsonrpc": "2.0",
      "method": "notifications/tools/list_changed",
      "params": {"_meta": {"io.modelcontextprotocol/subscriptionId": sub_id}},
    })
    assert received and received[0][0] == "notifications/tools/list_changed"

  def test_subscribe_sends_listen_request_immediately(self):
    client, transport = make_client()
    client.subscribe({"toolsListChanged": True})
    assert transport.subscriptions[-1]["method"] == "subscriptions/listen"
    assert transport.subscriptions[-1]["params"]["notifications"] == {"toolsListChanged": True}

  def test_unsubscribe_sends_cancelled_and_sets_closed(self):
    client, transport = make_client()
    handle = client.subscribe({"toolsListChanged": True})
    handle.unsubscribe()
    cancellations = [m for m in transport.sent_via_send if m["method"] == "notifications/cancelled"]
    assert cancellations and cancellations[-1]["params"]["reason"] == "unsubscribe"
    assert handle.closed.is_set()

  def test_subscribe_without_transport_support_raises(self):
    class NoSubTransport(ClientTransport):
      def request(self, message: dict) -> dict:
        return {"jsonrpc": "2.0", "id": message["id"], "result": {}}

    client = Client(NoSubTransport(), CLIENT)
    with pytest.raises(RequestError):
      client.subscribe({"toolsListChanged": True})


# ─── close() lifecycle ─────────────────────────────────────────────────────────


class TestClose:
  def test_close_clears_handlers_and_closes_transport(self):
    client, transport = make_client()
    client.set_request_handler("roots/list", lambda p: {})
    client.set_notification_handler("notifications/message", lambda p: None)
    client.close()
    assert transport.closed is True
    # Handlers were cleared: an inbound server request now gets method-not-found.
    transport.inbound({"jsonrpc": "2.0", "id": "x", "method": "roots/list", "params": {}})
    assert transport.sent_via_send[-1]["error"]["code"] == METHOD_NOT_FOUND_CODE

  def test_close_is_idempotent(self):
    client, transport = make_client()
    client.close()
    client.close()  # second call must not raise
    assert transport.closed is True


# ─── notify() ──────────────────────────────────────────────────────────────────


class TestNotify:
  def test_notify_builds_one_way_frame(self):
    client, transport = make_client()
    client.notify("notifications/cancelled", {"requestId": 5})
    msg = transport.sent_via_send[-1]
    assert msg == {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 5}}
    assert "id" not in msg

  def test_notify_without_params_omits_params_key(self):
    client, transport = make_client()
    client.notify("notifications/initialized")
    assert transport.sent_via_send[-1] == {"jsonrpc": "2.0", "method": "notifications/initialized"}


# ─── http.py: _headers builder ─────────────────────────────────────────────────


class TestHttpHeaders:
  def _meta_request(self, method: str, params: dict | None = None) -> dict:
    body = dict(params or {})
    body["_meta"] = {PROTOCOL_VERSION_META_KEY: CURRENT_PROTOCOL_VERSION}
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": body}

  def test_required_headers_for_tools_call(self):
    transport = StreamableHttpClientTransport("http://example/mcp")
    headers = transport._headers(self._meta_request("tools/call", {"name": "add", "arguments": {}}))
    assert headers["Content-Type"] == "application/json"
    assert "application/json" in headers["Accept"]
    assert "text/event-stream" in headers["Accept"]
    assert headers["MCP-Protocol-Version"] == CURRENT_PROTOCOL_VERSION
    assert headers["Mcp-Method"] == "tools/call"
    assert headers["Mcp-Name"] == "add"

  def test_mcp_name_for_prompts_get_uses_name(self):
    transport = StreamableHttpClientTransport("http://example/mcp")
    headers = transport._headers(self._meta_request("prompts/get", {"name": "greet"}))
    assert headers["Mcp-Name"] == "greet"

  def test_mcp_name_for_resources_read_uses_uri(self):
    transport = StreamableHttpClientTransport("http://example/mcp")
    headers = transport._headers(self._meta_request("resources/read", {"uri": "file:///x"}))
    assert headers["Mcp-Name"] == "file:///x"

  def test_no_mcp_name_for_untargeted_method(self):
    transport = StreamableHttpClientTransport("http://example/mcp")
    headers = transport._headers(self._meta_request("tools/list"))
    assert "Mcp-Name" not in headers
    assert headers["Mcp-Method"] == "tools/list"

  def test_body_meta_version_overrides_transport_default(self):
    transport = StreamableHttpClientTransport("http://example/mcp", protocol_version="2099-01-01")
    headers = transport._headers(self._meta_request("ping"))
    assert headers["MCP-Protocol-Version"] == CURRENT_PROTOCOL_VERSION

  def test_transport_default_used_when_no_body_meta(self):
    transport = StreamableHttpClientTransport("http://example/mcp", protocol_version="2099-01-01")
    # A response frame (no method, no _meta) → the transport default version is used.
    headers = transport._headers({"jsonrpc": "2.0", "id": "srv-1", "result": {}})
    assert headers["MCP-Protocol-Version"] == "2099-01-01"
    # …and a response carries no routing headers.
    assert "Mcp-Method" not in headers

  def test_auth_provider_adds_bearer(self):
    transport = StreamableHttpClientTransport("http://example/mcp", auth_provider=lambda: "tok-xyz")
    headers = transport._headers(self._meta_request("ping"))
    assert headers["Authorization"] == "Bearer tok-xyz"

  def test_no_authorization_when_token_empty(self):
    transport = StreamableHttpClientTransport("http://example/mcp", auth_provider=lambda: None)
    headers = transport._headers(self._meta_request("ping"))
    assert "Authorization" not in headers

  def test_extra_static_headers_merged(self):
    transport = StreamableHttpClientTransport("http://example/mcp", headers={"X-Trace": "abc"})
    headers = transport._headers(self._meta_request("ping"))
    assert headers["X-Trace"] == "abc"

  def test_param_header_resolver_emits_mcp_param_headers_for_request(self):
    transport = StreamableHttpClientTransport("http://example/mcp")
    transport.set_param_header_resolver(lambda method, params: {"Mcp-Param-Region": "us-west1"})
    headers = transport._headers(self._meta_request("tools/call", {"name": "sql", "arguments": {}}))
    assert headers["Mcp-Param-Region"] == "us-west1"

  def test_param_header_resolver_not_consulted_for_notification(self):
    transport = StreamableHttpClientTransport("http://example/mcp")
    seen: list[str] = []
    transport.set_param_header_resolver(lambda method, params: seen.append(method) or {})
    transport._headers({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})
    assert seen == []  # a notification has no id → not a request

  def test_param_header_resolver_fault_does_not_block_headers(self):
    transport = StreamableHttpClientTransport("http://example/mcp")

    def boom(method, params):
      raise RuntimeError("resolver failed")

    transport.set_param_header_resolver(boom)
    headers = transport._headers(self._meta_request("tools/call", {"name": "x", "arguments": {}}))
    assert headers["Mcp-Method"] == "tools/call"  # headers still built


# ─── http.py: _iter_sse parser ─────────────────────────────────────────────────


class _FakeResponse:
  """A minimal stand-in for an ``httpx.Response`` exposing ``iter_lines``."""

  def __init__(self, text: str) -> None:
    # httpx.Response.iter_lines yields lines WITHOUT trailing newlines.
    self._lines = text.split("\n")

  def iter_lines(self):
    yield from self._lines


class TestIterSse:
  def test_yields_one_frame_per_event(self):
    body = (
      'data: {"jsonrpc": "2.0", "id": 1, "result": {"a": 1}}\n'
      "\n"
      'data: {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": 1, "progress": 0.5}}\n'
      "\n"
    )
    frames = list(_iter_sse(_FakeResponse(body)))
    assert len(frames) == 2
    assert frames[0]["id"] == 1
    assert frames[1]["method"] == "notifications/progress"

  def test_strips_single_leading_space_after_data(self):
    body = 'data: {"x": 1}\n\n'
    frames = list(_iter_sse(_FakeResponse(body)))
    assert frames[0] == {"x": 1}

  def test_keeps_data_without_leading_space(self):
    body = 'data:{"x": 2}\n\n'
    frames = list(_iter_sse(_FakeResponse(body)))
    assert frames[0] == {"x": 2}

  def test_multiline_data_is_joined_with_newline(self):
    body = 'data: {"x":\ndata: 3}\n\n'
    frames = list(_iter_sse(_FakeResponse(body)))
    assert frames[0] == {"x": 3}

  def test_comment_and_other_fields_are_ignored(self):
    body = (
      ": keep-alive comment\n"
      "event: message\n"
      "id: 42\n"
      'data: {"ok": true}\n'
      "\n"
    )
    frames = list(_iter_sse(_FakeResponse(body)))
    assert frames == [{"ok": True}]

  def test_final_event_without_trailing_blank_line_is_flushed(self):
    body = 'data: {"last": true}'  # stream ends without a blank line
    frames = list(_iter_sse(_FakeResponse(body)))
    assert frames == [{"last": True}]

  def test_malformed_json_is_yielded_as_value_error(self):
    body = "data: {not valid json}\n\n"
    frames = list(_iter_sse(_FakeResponse(body)))
    assert len(frames) == 1
    assert isinstance(frames[0], ValueError)

  def test_empty_data_blocks_yield_nothing(self):
    body = "\n\n\n"
    assert list(_iter_sse(_FakeResponse(body))) == []


# ─── http.py: _is_final_response matcher ───────────────────────────────────────


class TestIsFinalResponse:
  def test_matches_result_frame_with_same_id(self):
    assert _is_final_response({"id": 7, "result": {}}, 7) is True

  def test_matches_error_frame_with_same_id(self):
    assert _is_final_response({"id": 7, "error": {"code": -1, "message": "x"}}, 7) is True

  def test_does_not_match_interim_notification(self):
    assert _is_final_response({"method": "notifications/progress", "params": {}}, 7) is False

  def test_string_id_does_not_match_numeric_id(self):
    # No type coercion: "7" must not match 7. (R-3.2-e/-f/-g)
    assert _is_final_response({"id": "7", "result": {}}, 7) is False

  def test_numeric_id_does_not_match_string_id(self):
    assert _is_final_response({"id": 7, "result": {}}, "7") is False

  def test_string_id_matches_string_id(self):
    assert _is_final_response({"id": "srv-1", "result": {}}, "srv-1") is True

  def test_different_numeric_id_does_not_match(self):
    assert _is_final_response({"id": 8, "result": {}}, 7) is False

  def test_non_dict_frame_does_not_match(self):
    assert _is_final_response([1, 2, 3], 7) is False

  def test_frame_without_result_or_error_does_not_match(self):
    assert _is_final_response({"id": 7}, 7) is False


# ─── end-to-end via connect_in_memory ──────────────────────────────────────────


def _e2e_server() -> McpServer:
  server = McpServer(INFO, {"tools": {}, "resources": {}, "prompts": {}})
  server.register_tool("echo", lambda args, c: {"content": [{"type": "text", "text": args.get("msg", "")}]})
  server.register_resource(
    "doc", "file:///doc.txt",
    lambda uri: {"contents": [{"uri": uri, "text": "hello world"}]},
  )
  server.register_prompt(
    "greet",
    lambda args: {"messages": [{"role": "user", "content": {"type": "text", "text": f"Hi {args.get('name', '')}"}}]},
    arguments=[{"name": "name", "required": True}],
  )
  return server


class TestEndToEndInMemory:
  def test_discover_caches_info_and_negotiates(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"tools": {}})
    assert client.connected
    assert client.negotiated_version == CURRENT_PROTOCOL_VERSION
    assert client.server_info == INFO
    assert client.server_supports("tools")

  def test_discover_false_leaves_client_unconnected(self):
    client = connect_in_memory(_e2e_server(), CLIENT, discover=False)
    assert client.connected is False
    client.discover()
    assert client.connected is True

  def test_list_tools(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"tools": {}})
    names = [t["name"] for t in client.list_tools()["tools"]]
    assert "echo" in names

  def test_call_tool(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"tools": {}})
    result = client.call_tool("echo", {"msg": "round-trip"})
    assert result["content"][0]["text"] == "round-trip"

  def test_read_resource(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"resources": {}})
    result = client.read_resource("file:///doc.txt")
    assert result["contents"][0]["text"] == "hello world"

  def test_get_prompt(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"prompts": {}})
    result = client.get_prompt("greet", {"name": "Ada"})
    assert result["messages"][0]["content"]["text"] == "Hi Ada"

  def test_unknown_tool_raises_invalid_params(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"tools": {}})
    with pytest.raises(RequestError) as exc:
      client.call_tool("does-not-exist")
    assert exc.value.code == -32602

  def test_missing_required_prompt_argument_raises(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"prompts": {}})
    with pytest.raises(RequestError) as exc:
      client.get_prompt("greet")  # 'name' is required
    assert exc.value.code == -32602

  def test_read_unknown_resource_raises(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"resources": {}})
    with pytest.raises(RequestError) as exc:
      client.read_resource("file:///missing")
    assert exc.value.code == -32602

  def test_unknown_method_raises_method_not_found(self):
    client = connect_in_memory(_e2e_server(), CLIENT, capabilities={"tools": {}})
    with pytest.raises(RequestError) as exc:
      client.raw("vendor/bogus")
    assert exc.value.code == -32601

  def test_envelope_reaches_server_unchanged(self):
    # A tool that echoes the per-request _meta lets us assert the envelope propagated.
    server = McpServer(INFO, {"tools": {}})
    server.register_tool("meta", lambda args, c: {"structuredContent": dict(c.meta)})
    client = connect_in_memory(server, CLIENT, capabilities={"tools": {}})
    echoed = client.call_tool("meta")["structuredContent"]
    assert echoed[CLIENT_INFO_META_KEY] == CLIENT
    assert echoed[PROTOCOL_VERSION_META_KEY] == CURRENT_PROTOCOL_VERSION
    assert echoed[CLIENT_CAPABILITIES_META_KEY] == {"tools": {}}
