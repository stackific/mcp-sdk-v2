"""Tests for S7 (stdio binding) — serving an McpServer over stdio (§8).

The loop reads newline-delimited JSON-RPC from an injected input stream and writes
responses to an injected output stream, so the whole exchange is driven with
:class:`io.StringIO` — no real process stdin/stdout. Covers: a request dispatched and
its response framed back; a notification producing no reply; a malformed line producing
the canonical Invalid Request error envelope; ``\\r\\n``/blank-line tolerance; tool-emitted
notifications riding the same channel; UTF-8 round-trip; and EOF ending the loop.
"""

from __future__ import annotations

import io
import json

from mcp.protocol.errors import INVALID_REQUEST_CODE, METHOD_NOT_FOUND_CODE
from mcp.server.server import McpServer
from mcp.server.stdio import process_line, serve_stdio, write_message

INFO = {"name": "srv", "version": "1.0"}
CAPS = {"tools": {}}


def make_server() -> McpServer:
  server = McpServer(INFO, CAPS)
  # A simple echo tool whose result we can assert on, plus a noisy tool that logs.
  server.register_tool("echo", lambda args, ctx: {"content": [{"type": "text", "text": args.get("text", "")}]})

  def noisy(args, ctx):
    ctx.log("error", "working")
    return {"content": []}

  server.register_tool("noisy", noisy)
  return server


def read_responses(out: io.StringIO) -> list[dict]:
  """Parse every newline-framed JSON response written to the output stream."""
  return [json.loads(line) for line in out.getvalue().splitlines() if line.strip()]


# ─── write_message framing ───────────────────────────────────────────────────────


class TestWriteMessage:
  def test_frames_one_utf8_line_with_single_newline_no_embedded(self):
    out = io.StringIO()
    write_message(out, {"jsonrpc": "2.0", "id": 1, "result": {"text": "a\nb", "s": "héllo"}})
    text = out.getvalue()
    # One trailing newline; the in-string newline is escaped, so it is the only one.
    assert text.endswith("\n")
    assert text.count("\n") == 1
    # Real UTF-8, and a clean round-trip.
    decoded = json.loads(text)
    assert decoded["result"]["text"] == "a\nb"
    assert decoded["result"]["s"] == "héllo"


# ─── process_line dispatch ───────────────────────────────────────────────────────


class TestProcessLine:
  def test_request_is_dispatched_and_response_written(self):
    out = io.StringIO()
    line = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"})
    response = process_line(make_server(), line, out)
    assert response == {"jsonrpc": "2.0", "id": 1, "result": {}}
    assert read_responses(out) == [{"jsonrpc": "2.0", "id": 1, "result": {}}]

  def test_tool_call_response_carries_result(self):
    out = io.StringIO()
    line = json.dumps(
      {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "echo", "arguments": {"text": "hi"}}}
    )
    process_line(make_server(), line, out)
    [resp] = read_responses(out)
    assert resp["id"] == 2
    assert resp["result"]["content"] == [{"type": "text", "text": "hi"}]

  def test_notification_produces_no_reply(self):
    out = io.StringIO()
    line = json.dumps({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})
    response = process_line(make_server(), line, out)
    assert response is None
    assert out.getvalue() == ""  # nothing written

  def test_stray_response_produces_no_reply(self):
    out = io.StringIO()
    line = json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert process_line(make_server(), line, out) is None
    assert out.getvalue() == ""

  def test_malformed_json_line_yields_invalid_request_null_id(self):
    out = io.StringIO()
    response = process_line(make_server(), "{ not json at all", out)
    assert response is not None
    assert response["id"] is None
    assert response["error"]["code"] == INVALID_REQUEST_CODE
    # And it was written to the output channel.
    [written] = read_responses(out)
    assert written["error"]["code"] == INVALID_REQUEST_CODE

  def test_batch_array_line_is_invalid_request(self):
    out = io.StringIO()
    response = process_line(make_server(), json.dumps([1, 2, 3]), out)
    assert response["id"] is None
    assert response["error"]["code"] == INVALID_REQUEST_CODE

  def test_unknown_method_is_method_not_found(self):
    out = io.StringIO()
    process_line(make_server(), json.dumps({"jsonrpc": "2.0", "id": 4, "method": "bogus"}), out)
    [resp] = read_responses(out)
    assert resp["error"]["code"] == METHOD_NOT_FOUND_CODE
    assert resp["id"] == 4

  def test_blank_line_is_ignored(self):
    out = io.StringIO()
    assert process_line(make_server(), "   \t", out) is None
    assert out.getvalue() == ""

  def test_crlf_terminator_is_tolerated(self):
    out = io.StringIO()
    # The loop normally strips the trailing newline; a stray \r must not break parsing.
    line = json.dumps({"jsonrpc": "2.0", "id": 5, "method": "ping"}) + "\r"
    process_line(make_server(), line, out)
    [resp] = read_responses(out)
    assert resp["id"] == 5

  def test_id_type_is_echoed(self):
    out = io.StringIO()
    process_line(make_server(), json.dumps({"jsonrpc": "2.0", "id": "abc", "method": "ping"}), out)
    [resp] = read_responses(out)
    assert resp["id"] == "abc" and isinstance(resp["id"], str)

  def test_tool_notifications_ride_the_same_channel(self):
    out = io.StringIO()
    line = json.dumps({"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "noisy"}})
    process_line(make_server(), line, out)
    written = read_responses(out)
    # The log notification is emitted before the final response, both on stdout.
    methods = [m.get("method") for m in written]
    assert "notifications/message" in methods
    # The final result response for id 6 is present.
    assert any(m.get("id") == 6 and "result" in m for m in written)

  def test_tool_notifications_precede_the_final_response_in_order(self):
    out = io.StringIO()
    line = json.dumps({"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "noisy"}})
    process_line(make_server(), line, out)
    written = read_responses(out)
    # The notification line is written strictly before the response line for the call.
    notif_idx = next(i for i, m in enumerate(written) if m.get("method") == "notifications/message")
    resp_idx = next(i for i, m in enumerate(written) if m.get("id") == 7 and "result" in m)
    assert notif_idx < resp_idx

  def test_server_error_for_unknown_tool_is_framed_with_its_code(self):
    out = io.StringIO()
    line = json.dumps({"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "missing"}})
    response = process_line(make_server(), line, out)
    assert response is not None and "error" in response
    [written] = read_responses(out)
    assert written["id"] == 8
    assert "error" in written

  def test_return_value_matches_what_was_written(self):
    # process_line returns the same dict it wrote, so callers can inspect it directly.
    out = io.StringIO()
    line = json.dumps({"jsonrpc": "2.0", "id": 9, "method": "ping"})
    response = process_line(make_server(), line, out)
    [written] = read_responses(out)
    assert response == written


# ─── serve_stdio loop ────────────────────────────────────────────────────────────


class TestServeStdio:
  def test_dispatches_request_from_input_stream_to_output_stream(self):
    src = io.StringIO(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}) + "\n")
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out)
    assert read_responses(out) == [{"jsonrpc": "2.0", "id": 1, "result": {}}]

  def test_processes_multiple_lines_and_skips_notification(self):
    lines = [
      json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
      json.dumps({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}}),
      json.dumps({"jsonrpc": "2.0", "id": 2, "method": "ping"}),
    ]
    src = io.StringIO("\n".join(lines) + "\n")
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out)
    responses = read_responses(out)
    # Two requests answered, the notification produced no reply.
    assert [r["id"] for r in responses] == [1, 2]

  def test_malformed_line_does_not_stop_the_loop(self):
    src = io.StringIO(
      "{ broken\n" + json.dumps({"jsonrpc": "2.0", "id": 9, "method": "ping"}) + "\n"
    )
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out)
    responses = read_responses(out)
    # The malformed line yields an Invalid Request envelope, then the good request is served.
    assert responses[0]["error"]["code"] == INVALID_REQUEST_CODE
    assert any(r.get("id") == 9 and "result" in r for r in responses)

  def test_blank_and_crlf_lines_in_stream(self):
    src = io.StringIO(
      "\n"  # blank
      "   \n"  # whitespace-only
      + json.dumps({"jsonrpc": "2.0", "id": 3, "method": "ping"})
      + "\r\n"  # CRLF terminator
    )
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out)
    [resp] = read_responses(out)
    assert resp["id"] == 3

  def test_eof_ends_the_loop_cleanly(self):
    # An empty input stream → immediate EOF → the loop returns without writing anything.
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=io.StringIO(""), output_stream=out)
    assert out.getvalue() == ""

  def test_should_continue_predicate_stops_loop_early(self):
    # The predicate returns False before the second line is read.
    state = {"calls": 0}

    def should_continue() -> bool:
      state["calls"] += 1
      return state["calls"] <= 1

    src = io.StringIO(
      json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"})
      + "\n"
      + json.dumps({"jsonrpc": "2.0", "id": 2, "method": "ping"})
      + "\n"
    )
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out, should_continue=should_continue)
    responses = read_responses(out)
    assert [r["id"] for r in responses] == [1]  # only the first line processed

  def test_utf8_round_trip_through_the_loop(self):
    src = io.StringIO(
      json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "echo", "arguments": {"text": "héllo ☃"}}})
      + "\n"
    )
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out)
    [resp] = read_responses(out)
    assert resp["result"]["content"][0]["text"] == "héllo ☃"

  def test_should_continue_false_at_start_writes_nothing(self):
    # A predicate that is False before the first read ends the loop with no output.
    src = io.StringIO(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}) + "\n")
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out, should_continue=lambda: False)
    assert out.getvalue() == ""

  def test_interleaves_notifications_and_responses_across_multiple_calls(self):
    lines = [
      json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "noisy"}}),
      json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "noisy"}}),
    ]
    src = io.StringIO("\n".join(lines) + "\n")
    out = io.StringIO()
    serve_stdio(make_server(), input_stream=src, output_stream=out)
    written = read_responses(out)
    # Two log notifications (one per call) and two result responses, all on the channel.
    notifs = [m for m in written if m.get("method") == "notifications/message"]
    results = [m for m in written if "result" in m]
    assert len(notifs) == 2
    assert {m["id"] for m in results} == {1, 2}
