"""Tests for S13 — the stdio transport (§8).

Mirrors ``ts-sdk/src/__tests__/transport/stdio.test.ts``, adapted to the pull-based
Python byte-stream model: instead of ``node:stream`` ``PassThrough`` ``'data'`` events,
inbound bytes are pushed into the transport via :meth:`StdioEndpoint.feed_bytes` /
:meth:`StdioClientTransport.feed_stderr`, and outbound sinks are :class:`io.BytesIO`.

AC coverage (one or more tests each):
  AC-13.1  (R-8.2-a/b/c/d)   — UTF-8, one line, no embedded newline, single ``\\n``
  AC-13.2  (R-8.2-e/f/g)     — ``\\n`` and ``\\r\\n`` both accepted; trailing ``\\r`` stripped
  AC-13.3  (R-8.2-h)         — empty/whitespace-only line ignored (not malformed)
  AC-13.4  (R-8.3-a, R-8.5-c)— client may not write a response to stdin
  AC-13.5  (R-8.3-b, R-8.5-a)— server may not write a request to stdout
  AC-13.8  (R-8.3-e/f/g)     — cancellation via ``notifications/cancelled``, then silence
  AC-13.9/22 (R-8.4, R-8.1-a)— stderr captured, never parsed as protocol, never an error
  AC-13.11 (R-8.5-d/e/f/h)   — malformed line: no crash, discard, diagnostic, resync
  AC-13.14 (R-8.6.2-a/b)     — graceful: close stdin, await exit, clean close
  AC-13.16 (R-8.6.3-a)       — force-terminate on overstay
  AC-13.15 (R-8.6.2-c)       — server MAY close stdout and exit
  AC-13.17 (R-8.6.4-a/b)     — restart on unexpected exit; report lost in-flight
  AC-13.18 (R-8.7-a/b/c)     — request carries _meta; -32004 routed to waiter
  AC-13.19/20 (R-8.7-d/e/f/g)— probe outcomes (supported / -32004 / not-this-protocol)
  AC-13.21 (R-8.1-b)         — framing reusable over a plain byte stream
"""

from __future__ import annotations

import io

import pytest

from mcp.protocol.errors import UNSUPPORTED_PROTOCOL_VERSION_CODE
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
)
from mcp.transport.contract import TransportError, Unsubscribe
from mcp.transport.framing import NewlineFramer, try_decode_message_unit
from mcp.transport.stdio import (
  StdioClientTransport,
  StdioServerTransport,
  is_blank_line,
  strip_trailing_carriage_return,
)

# ─── Test doubles ───────────────────────────────────────────────────────────────


class FakeChild:
  """An in-memory ``ChildProcessLike`` driven by :class:`io.BytesIO` sinks.

  ``stdin`` is what the client writes (the server's input); ``exit`` is simulated via
  :meth:`exit`. No real OS process is ever spawned. ``kill_signals`` records every
  forced-termination signal so escalation can be asserted; a ``SIGKILL`` drives a prompt
  synthetic exit (as a real kill would).
  """

  def __init__(self) -> None:
    self.stdin = io.BytesIO()
    self.exit_code: int | None = None
    self.kill_signals: list[object] = []
    self._exit_listeners: list = []

  def kill(self, signal: object | None = None) -> bool:
    self.kill_signals.append(signal)
    if signal == "SIGKILL":
      self.exit(None, "SIGKILL")
    return True

  def on_exit(self, listener) -> Unsubscribe:
    self._exit_listeners.append(listener)

    def _unsub() -> None:
      if listener in self._exit_listeners:
        self._exit_listeners.remove(listener)

    return _unsub

  def exit(self, code: int | None, signal: object | None = None) -> None:
    """Simulate the process exiting (graceful, unexpected, or forced)."""
    if self.exit_code is not None:
      return
    self.exit_code = code if code is not None else 0
    for listener in list(self._exit_listeners):
      listener(code, signal)


def envelope(version: str = "2026-07-28") -> dict:
  """A full request envelope (the three required ``_meta`` keys). (R-8.7-a)"""
  return {
    PROTOCOL_VERSION_META_KEY: version,
    CLIENT_INFO_META_KEY: {"name": "ExampleClient", "version": "1.0.0"},
    CLIENT_CAPABILITIES_META_KEY: {},
  }


def make_request(id_: int, method: str = "tools/list") -> dict:
  return {"jsonrpc": "2.0", "id": id_, "method": method, "params": {"_meta": envelope()}}


def line_of(message: dict) -> bytes:
  """A single newline-framed unit for the given message."""
  return NewlineFramer().encode(message)


def drain(sink: io.BytesIO) -> list[dict]:
  """Decode every framed message currently in a BytesIO sink (from its start)."""
  decoder = NewlineFramer().create_decoder()
  out: list[dict] = []
  for unit in decoder.push(sink.getvalue()):
    decoded = try_decode_message_unit(unit)
    if decoded.ok:
      assert decoded.message is not None
      out.append(decoded.message)
  return out


def client_with(child: FakeChild, launcher=None) -> StdioClientTransport:
  return StdioClientTransport(child=child, launcher=launcher)


# ─── pure line helpers ──────────────────────────────────────────────────────────


class TestLineHelpers:
  def test_blank_line_detection(self):
    assert is_blank_line(b"")
    assert is_blank_line(b"   \t\r\x0b\x0c")
    assert not is_blank_line(b" x ")

  def test_strip_trailing_carriage_return(self):
    assert strip_trailing_carriage_return(b"abc\r") == b"abc"
    assert strip_trailing_carriage_return(b"abc") == b"abc"
    # Only a *single* trailing CR is stripped, and only at the end.
    assert strip_trailing_carriage_return(b"a\rb") == b"a\rb"
    assert strip_trailing_carriage_return(b"") == b""


# ─── AC-13.1 — framing: UTF-8, one line, no embedded newline, single \n ──────────


class TestAC131Framing:
  def test_request_serialized_as_one_utf8_line_no_embedded_newline(self):
    child = FakeChild()
    client = client_with(child)
    # A payload deliberately containing a literal newline AND a non-ASCII char.
    req = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/call",
      "params": {"text": "line1\nline2", "s": "héllo", "_meta": envelope()},
    }
    client.send(req)
    raw = child.stdin.getvalue()
    # Exactly one trailing \n, and it is the only \n (the in-string one is escaped).
    assert raw[-1] == 0x0A
    body = raw[:-1]
    assert 0x0A not in body
    # Real UTF-8 for the non-ASCII char.
    assert "héllo".encode("utf-8") in body
    # Decodes back to the same message (UTF-8 round-trip).
    decoded = try_decode_message_unit(body)
    assert decoded.ok and decoded.message["method"] == "tools/call"
    assert decoded.message["params"]["text"] == "line1\nline2"

  def test_encode_decode_round_trip_via_drain(self):
    child = FakeChild()
    client = client_with(child)
    client.send(make_request(1))
    client.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})
    messages = drain(child.stdin)
    assert len(messages) == 2
    assert messages[0]["id"] == 1
    assert messages[1]["method"] == "notifications/cancelled"


# ─── AC-13.2 — \n and \r\n both accepted; trailing \r stripped ───────────────────


class TestAC132Terminators:
  def test_accepts_lf_and_crlf_and_strips_trailing_cr(self):
    child = FakeChild()
    client = client_with(child)
    received: list[dict] = []
    client.on_message(received.append)

    # First message ends in \n, the second in \r\n.
    client.feed_bytes(line_of({"jsonrpc": "2.0", "id": 1, "result": {}}))
    body2 = b'{"jsonrpc":"2.0","id":2,"result":{}}'
    client.feed_bytes(body2 + b"\r\n")

    assert [m["id"] for m in received] == [1, 2]


# ─── AC-13.3 — blank / whitespace-only lines ignored ─────────────────────────────


class TestAC133BlankLines:
  def test_blank_lines_ignored_not_malformed(self):
    child = FakeChild()
    client = client_with(child)
    messages: list[dict] = []
    errors: list[TransportError] = []
    client.on_message(messages.append)
    client.on_error(errors.append)

    client.feed_bytes(b"\n   \n\t\n")
    client.feed_bytes(line_of({"jsonrpc": "2.0", "id": 1, "result": {}}))

    assert len(messages) == 1
    assert errors == []  # blank lines are NOT errors


# ─── AC-13.4 — client may not write a response / non-MCP to stdin ────────────────


class TestAC134ClientStdinDirection:
  def test_rejects_writing_a_response_to_stdin(self):
    child = FakeChild()
    client = client_with(child)
    with pytest.raises(TransportError):
      client.send({"jsonrpc": "2.0", "id": 1, "result": {}})
    assert child.stdin.getvalue() == b""  # nothing written

  def test_permits_requests_and_notifications(self):
    child = FakeChild()
    client = client_with(child)
    client.send(make_request(1))
    client.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})
    assert len(drain(child.stdin)) == 2


# ─── AC-13.5 — server may not write a request / non-MCP to stdout ────────────────


class TestAC135ServerStdoutDirection:
  def test_rejects_writing_a_request_to_stdout(self):
    out = io.BytesIO()
    server = StdioServerTransport(stdout=out)
    with pytest.raises(TransportError):
      server.send(make_request(1))
    assert out.getvalue() == b""

  def test_permits_responses_and_notifications(self):
    out = io.BytesIO()
    server = StdioServerTransport(stdout=out)
    server.send({"jsonrpc": "2.0", "id": 1, "result": {}})
    server.send({"jsonrpc": "2.0", "method": "notifications/message", "params": {}})
    assert len(drain(out)) == 2

  def test_send_on_closed_transport_raises(self):
    out = io.BytesIO()
    server = StdioServerTransport(stdout=out)
    server.close()
    with pytest.raises(TransportError):
      server.send({"jsonrpc": "2.0", "id": 1, "result": {}})


# ─── AC-13.8 — cancellation via notifications/cancelled, then silence ────────────


class TestAC138CancellationThenSilence:
  """AC-13.8 — a client cancels an in-flight request with ``notifications/cancelled``
  referencing its id; a well-behaved server then sends no further message for that id.
  The stdio transport carries the cancellation faithfully and never fabricates a frame of
  its own — it is the transport that carries the rule and the server that obeys the
  silence. Mirrors ``stdio.test.ts`` AC-13.8. (R-8.3-e, R-8.3-f, R-8.3-g)
  """

  def test_cancel_notification_written_then_no_inbound_message(self):
    child = FakeChild()
    client = client_with(child)

    # The client issues request id 1, then cancels it referencing that id.
    client.send(make_request(1))
    client.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})

    sent = drain(child.stdin)
    cancel = next((m for m in sent if m.get("method") == "notifications/cancelled"), None)
    assert cancel is not None
    assert cancel["params"]["requestId"] == 1

    # After cancellation the server sends nothing further: with no inbound bytes fed, the
    # transport surfaces zero messages to its handler.
    received: list[dict] = []
    client.on_message(received.append)
    assert received == []

  def test_server_emits_nothing_on_its_own_after_cancellation(self):
    # Server-side complement: a server receives the request and then its cancellation, and a
    # well-behaved server that obeys the silence writes nothing to stdout — the transport
    # delivers both inbound frames but never emits one itself.
    out = io.BytesIO()
    server = StdioServerTransport(stdout=out)
    seen: list[dict] = []
    server.on_message(seen.append)

    server.feed_bytes(line_of(make_request(1)))
    server.feed_bytes(
      line_of({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}})
    )

    assert [m.get("id", m.get("method")) for m in seen] == [1, "notifications/cancelled"]
    assert out.getvalue() == b""


# ─── AC-13.9 / AC-13.22 — stderr is diagnostics, never protocol ──────────────────


class TestAC139StderrNotProtocol:
  def test_stderr_never_parsed_and_never_an_error(self):
    child = FakeChild()
    client = client_with(child)
    messages: list[dict] = []
    errors: list[TransportError] = []
    client.on_message(messages.append)
    client.on_error(errors.append)

    # A line on stderr that is valid JSON-RPC must NOT become a message.
    client.feed_stderr(line_of({"jsonrpc": "2.0", "id": 99, "result": {}}))
    client.feed_stderr(b"[server] handling tools/call\n")

    assert messages == []
    assert errors == []
    # Captured for inspection/forwarding; the transport is NOT closed.
    assert b"handling tools/call" in client.captured_stderr
    assert client.closed is False


# ─── AC-13.11 — malformed line: no crash, discard, diagnostic, resync ────────────


class TestAC1311MalformedLine:
  def test_discards_malformed_surfaces_error_and_resyncs(self):
    child = FakeChild()
    client = client_with(child)
    messages: list[dict] = []
    errors: list[TransportError] = []
    client.on_message(messages.append)
    client.on_error(errors.append)

    # Malformed line followed by a valid one — both in a single chunk.
    malformed = b"{ not json at all \n"
    good = line_of({"jsonrpc": "2.0", "id": 5, "result": {}})
    client.feed_bytes(malformed + good)

    assert client.closed is False  # not torn down (R-8.5-d)
    assert len(errors) == 1  # diagnostic recorded (R-8.5-f)
    assert len(messages) == 1  # resynchronized to the next message (R-8.5-h)
    assert messages[0]["id"] == 5

  def test_partial_line_is_buffered_then_completed(self):
    child = FakeChild()
    client = client_with(child)
    messages: list[dict] = []
    client.on_message(messages.append)

    framed = line_of({"jsonrpc": "2.0", "id": 7, "result": {}})
    # Feed everything but the terminating newline: nothing dispatched yet.
    client.feed_bytes(framed[:-1])
    assert messages == []
    assert client.decoder.pending == len(framed) - 1
    # The delimiter arrives → the buffered message is now delivered.
    client.feed_bytes(framed[-1:])
    assert len(messages) == 1 and messages[0]["id"] == 7
    assert client.decoder.pending == 0

  def test_buffered_messages_flushed_to_late_subscriber(self):
    # An inbound message that arrives before any handler is buffered, not dropped.
    child = FakeChild()
    client = client_with(child)
    client.feed_bytes(line_of({"jsonrpc": "2.0", "id": 9, "result": {}}))
    received: list[dict] = []
    client.on_message(received.append)
    assert [m["id"] for m in received] == [9]


# ─── AC-13.14 / AC-13.16 — graceful shutdown then forced termination ─────────────


class TestAC1314GracefulShutdown:
  def test_closes_stdin_then_clean_close_when_process_exits(self):
    child = FakeChild()
    client = client_with(child)
    closes: list = []
    client.on_close(closes.append)

    client.close()
    # stdin closed (EOF) as step 1.
    assert child.stdin.closed is True
    assert client.closed is False  # waiting for the process to exit

    # The process then exits → close finalises cleanly, no force-terminate needed.
    child.exit(0)
    assert client.closed is True
    assert closes[0].clean is True
    assert child.kill_signals == []

  def test_close_when_already_exited_finishes_immediately(self):
    child = FakeChild()
    client = client_with(child)
    child.exit(0)  # exited before the graceful close begins
    # (no launcher / restart → unexpected exit marked it closed already)
    assert client.closed is True

  def test_force_terminate_escalates_sigterm_then_sigkill(self):
    child = FakeChild()
    client = client_with(child)
    client.close()  # process never exits on its own
    assert client.closed is False
    # Host drives the overstay escalation.
    client.force_terminate()
    # SIGTERM first; since the fake stays alive, SIGKILL escalates and drives the exit.
    assert child.kill_signals[0] == "SIGTERM"
    assert "SIGKILL" in child.kill_signals
    assert client.closed is True


# ─── AC-13.15 — server-initiated shutdown ────────────────────────────────────────


class TestAC1315ServerShutdown:
  def test_server_closes_stdout_and_marks_clean_close(self):
    out = io.BytesIO()
    server = StdioServerTransport(stdout=out)
    closes: list = []
    server.on_close(closes.append)

    server.close("shutting down")
    assert server.closed is True
    assert closes[0].clean is True
    assert closes[0].reason == "shutting down"
    assert out.closed is True

  def test_stdin_eof_is_a_clean_close(self):
    out = io.BytesIO()
    server = StdioServerTransport(stdout=out)
    closes: list = []
    server.on_close(closes.append)
    server.notify_stdin_eof()
    assert server.closed is True
    assert closes[0].clean is True


# ─── AC-13.17 — restart on unexpected exit; report lost in-flight ────────────────


class TestAC1317RestartAndRetry:
  def test_restarts_on_unexpected_exit_and_reports_lost_inflight(self):
    first = FakeChild()
    second = FakeChild()
    replacements = [second]

    def launcher() -> FakeChild:
      return replacements.pop(0) if replacements else FakeChild()

    lost: list[list] = []
    client = StdioClientTransport(
      child=first, launcher=launcher, on_inflight_lost=lambda ids: lost.append(list(ids))
    )

    # An in-flight request, then an UNEXPECTED exit.
    client.correlator.issue(1)
    client.send(make_request(1))

    restarted: list = []
    client.on_restart(restarted.append)

    first.exit(1)  # unexpected

    # In-flight id 1 reported lost (MAY retry) and a fresh process launched.
    assert lost == [[1]]
    assert restarted == [second]
    assert client.closed is False  # restart keeps the transport alive
    assert client.correlator.size == 0  # in-flight cleared

    # The fresh process serves: a request now goes to the second child's stdin.
    client.send(make_request(2))
    assert any(m["id"] == 2 for m in drain(second.stdin))

  def test_abrupt_disconnection_when_no_launcher(self):
    child = FakeChild()
    client = StdioClientTransport(child=child)
    closes: list = []
    client.on_close(closes.append)
    child.exit(1)
    assert len(closes) == 1
    assert closes[0].clean is False

  def test_requires_child_or_launcher(self):
    with pytest.raises(TransportError):
      StdioClientTransport()


# ─── AC-13.18 — request carries _meta; -32004 routed to waiter ───────────────────


class TestAC1318MetaEnvelopeAndUnsupportedVersion:
  def test_every_request_carries_full_meta(self):
    child = FakeChild()
    client = client_with(child)
    client.send(make_request(1))
    [req] = drain(child.stdin)
    meta = req["params"]["_meta"]
    assert meta[PROTOCOL_VERSION_META_KEY] == "2026-07-28"
    assert CLIENT_INFO_META_KEY in meta
    assert CLIENT_CAPABILITIES_META_KEY in meta

  def test_routes_unsupported_version_error_back_to_waiter(self):
    child = FakeChild()
    client = client_with(child)
    pending = client.correlator.issue(1)
    client.on_message(lambda m: client.deliver_response(m) if ("error" in m or "result" in m) else None)
    client.send(make_request(1))
    # Server rejects the requested revision with -32004.
    client.feed_bytes(
      line_of(
        {
          "jsonrpc": "2.0",
          "id": 1,
          "error": {
            "code": UNSUPPORTED_PROTOCOL_VERSION_CODE,
            "message": "Unsupported protocol version",
            "data": {"supported": ["2026-07-28"]},
          },
        }
      )
    )
    resp = pending.result(timeout=1)
    assert resp["error"]["code"] == -32004


# ─── AC-13.19 / AC-13.20 — probe outcomes ────────────────────────────────────────


class TestAC1319ProbeOutcomes:
  def test_supported_discover_probe_is_cached(self):
    child = FakeChild()
    client = client_with(child)
    outcome = client.probe_protocol(
      "cmd:server",
      {
        "jsonrpc": "2.0",
        "id": 0,
        "result": {
          "resultType": "complete",
          "supportedVersions": ["2026-07-28"],
          "capabilities": {},
          "serverInfo": {"name": "ExampleServer", "version": "1.0.0"},
        },
      },
    )
    assert outcome.kind == "supported"
    determination = client.support_cache.get("cmd:server")
    assert determination.speaks_protocol is True
    assert determination.supported_versions == ["2026-07-28"]

  def test_unsupported_version_probe_still_speaks_protocol(self):
    child = FakeChild()
    client = client_with(child)
    outcome = client.probe_protocol(
      "cmd:server",
      {
        "jsonrpc": "2.0",
        "id": 0,
        "error": {
          "code": UNSUPPORTED_PROTOCOL_VERSION_CODE,
          "message": "Unsupported protocol version",
          "data": {"supported": ["2026-07-28"], "requested": "2099-01-01"},
        },
      },
    )
    assert outcome.kind == "unsupported-version"
    assert "2026-07-28" in outcome.supported
    assert client.support_cache.get("cmd:server").speaks_protocol is True

  def test_other_error_or_timeout_is_not_this_protocol(self):
    child = FakeChild()
    client = client_with(child)
    other = client.probe_protocol("a", {"jsonrpc": "2.0", "id": 0, "error": {"code": -32601, "message": "Method not found"}})
    timeout = client.probe_protocol("b", None)
    assert other.kind == "not-this-protocol"
    assert timeout.kind == "not-this-protocol"
    assert client.support_cache.get("a").speaks_protocol is False
    assert client.support_cache.get("b").speaks_protocol is False

  def test_probe_method_constant(self):
    assert StdioClientTransport.probe_method == "server/discover"


# ─── AC-13.21 — framing reusable over a plain (non-subprocess) byte stream ───────


class TestAC1321FramingReuse:
  def test_same_framing_over_a_plain_byte_stream(self):
    # A non-subprocess sink (e.g. a socket's write end) reuses the exact framing.
    out = io.BytesIO()
    endpoint = StdioServerTransport(stdout=out)
    endpoint.send({"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})
    raw = out.getvalue()
    assert raw[-1] == 0x0A
    decoded = try_decode_message_unit(raw[:-1])
    assert decoded.ok
    assert decoded.message["result"] == {"ok": True}
