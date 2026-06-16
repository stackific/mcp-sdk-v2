"""Tests for process_message + end-to-end server over the in-memory transport."""

from mcp.protocol.discovery import build_discover_request, is_discover_result
from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
)
from mcp.server.runtime import process_message
from mcp.server.server import McpServer, ServerRequestContext
from mcp.transport.in_memory import create_in_memory_transport_pair

INFO = {"name": "srv", "version": "1.0"}
CAPS = {"tools": {}}
CLIENT = {"name": "cli", "version": "0.1"}


def server() -> McpServer:
  return McpServer(INFO, CAPS)


class TestProcessMessage:
  def test_request_success_envelope(self):
    resp = process_message(server(), {"jsonrpc": "2.0", "id": 1, "method": "ping"})
    assert resp == {"jsonrpc": "2.0", "id": 1, "result": {}}

  def test_id_echo_type_preserved(self):
    resp = process_message(server(), {"jsonrpc": "2.0", "id": "abc", "method": "ping"})
    assert resp["id"] == "abc" and isinstance(resp["id"], str)

  def test_server_error_envelope(self):
    resp = process_message(server(), {"jsonrpc": "2.0", "id": 2, "method": "bogus"})
    assert resp["error"]["code"] == METHOD_NOT_FOUND_CODE
    assert resp["id"] == 2

  def test_handler_exception_becomes_internal_error(self):
    s = server()

    def boom(args, c):
      raise RuntimeError("kaboom")

    s.register_tool("boom", boom)
    resp = process_message(s, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "boom"}})
    assert resp["error"]["code"] == INTERNAL_ERROR_CODE

  def test_notification_returns_none(self):
    assert process_message(server(), {"jsonrpc": "2.0", "method": "notifications/foo"}) is None

  def test_response_message_returns_none(self):
    assert process_message(server(), {"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}}) is None

  def test_malformed_returns_invalid_request_null_id(self):
    resp = process_message(server(), [1, 2, 3])  # batch arrays are malformed
    assert resp["id"] is None
    assert resp["error"]["code"] == INVALID_REQUEST_CODE

  def test_malformed_notification_is_silently_discarded(self):
    # A message that is notification-shaped (method present, no id) but malformed —
    # here a notification whose `params` is an array, which classify_message rejects —
    # MUST be silently discarded with NO sender-facing error envelope. (R-3.4-f)
    resp = process_message(
      server(), {"jsonrpc": "2.0", "method": "notifications/foo", "params": [1, 2]}
    )
    assert resp is None

  def test_malformed_notification_missing_jsonrpc_is_discarded(self):
    # Even an entirely unclassifiable notification-shaped message (missing `jsonrpc`)
    # warrants no reply, because it carries `method` and no `id`. (R-3.4-f)
    resp = process_message(server(), {"method": "notifications/foo"})
    assert resp is None

  def test_malformed_request_shaped_still_replies_invalid_request(self):
    # A malformed message that is request-shaped (carries an `id`) is NOT a notification,
    # so it still earns a -32600 envelope with a null id (the original id is untrusted).
    resp = process_message(server(), {"id": 7, "method": "m"})  # missing `jsonrpc`
    assert resp["id"] is None
    assert resp["error"]["code"] == INVALID_REQUEST_CODE

  def test_notify_sink_receives_tool_notifications(self):
    s = server()
    s.dispatch  # ensure server constructed
    sent = []
    s.register_tool("noisy", lambda a, c: (c.log("error", "hi"), {"content": []})[1])
    process_message(s, {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "noisy"}}, notify=sent.append)
    assert sent and sent[0]["method"] == "notifications/message"


class TestEndToEndOverTransport:
  def test_discover_round_trip(self):
    client_ep, server_ep = create_in_memory_transport_pair()
    s = server()

    def on_server_message(msg: dict) -> None:
      response = process_message(s, msg, notify=server_ep.send)
      if response is not None:
        server_ep.send(response)

    server_ep.on_message(on_server_message)
    responses: list[dict] = []
    client_ep.on_message(responses.append)

    client_ep.send(build_discover_request(1, "2026-07-28", CLIENT, {}))

    assert len(responses) == 1
    assert responses[0]["id"] == 1
    assert is_discover_result(responses[0]["result"])


class TestSubscriberFanOut:
  """ctx.notify_subscribers + set_task_notifier — the shared subscription plumbing both
  transports build on (mirrors the TS ``notifySubscribers`` / ``setTaskNotifier`` wiring).
  """

  def test_tool_notify_subscribers_reaches_the_sink(self):
    s = server()
    fanned: list[dict] = []

    def emitter(_a: dict, c) -> dict:
      c.notify_subscribers({"method": "notifications/resources/updated", "params": {"uri": "file:///x"}})
      return {"content": []}

    s.register_tool("t", emitter)
    ctx = ServerRequestContext(
      protocol_version="2026-07-28", request_id=1, meta={}, notify_subscribers=fanned.append
    )
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx)
    assert fanned == [{"method": "notifications/resources/updated", "params": {"uri": "file:///x"}}]

  def test_set_task_notifier_relays_task_updates(self):
    s = server()
    pushed: list[dict] = []
    s.set_task_notifier(pushed.append)

    class _Store:
      def __init__(self) -> None:
        self.listener = None

      def set_update_listener(self, listener) -> None:
        self.listener = listener

    store = _Store()
    s.set_task_store(store)
    # A status change drives the listener → a notifications/tasks push on the notifier.
    store.listener({"taskId": "t1", "status": "completed"})
    assert pushed == [{"method": "notifications/tasks", "params": {"taskId": "t1", "status": "completed"}}]

  def test_task_notifier_is_noop_without_wiring(self):
    # A server with a store but no notifier silently drops the push (no crash).
    s = server()

    class _Store:
      def set_update_listener(self, listener) -> None:
        self.listener = listener

    store = _Store()
    s.set_task_store(store)
    store.listener({"taskId": "t1", "status": "working"})  # must not raise
