"""Tests for process_message + end-to-end server over the in-memory transport."""

from mcp.protocol.discovery import build_discover_request, is_discover_result
from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
)
from mcp.server.runtime import process_message
from mcp.server.server import McpServer
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
