"""Tests for the in-memory reference transport (§7.1–§7.6)."""

import pytest

from mcp.transport.contract import TransportError
from mcp.transport.framing import NewlineFramer
from mcp.transport.in_memory import create_in_memory_transport_pair

REQUEST = {"jsonrpc": "2.0", "id": 1, "method": "ping"}
NOTE = {"jsonrpc": "2.0", "method": "note"}


class TestDelivery:
  def test_send_is_received_by_peer(self):
    a, b = create_in_memory_transport_pair()
    received = []
    b.on_message(received.append)
    a.send(REQUEST)
    assert received == [REQUEST]

  def test_bidirectional(self):
    a, b = create_in_memory_transport_pair()
    at_a, at_b = [], []
    a.on_message(at_a.append)
    b.on_message(at_b.append)
    a.send(REQUEST)
    b.send(NOTE)
    assert at_b == [REQUEST]
    assert at_a == [NOTE]

  def test_buffers_messages_until_handler_attaches(self):
    a, b = create_in_memory_transport_pair()
    a.send(REQUEST)  # no handler on b yet — must not be dropped
    a.send(NOTE)
    received = []
    b.on_message(received.append)  # flush on subscribe
    assert received == [REQUEST, NOTE]

  def test_unsubscribe_stops_delivery(self):
    a, b = create_in_memory_transport_pair()
    received = []
    unsub = b.on_message(received.append)
    a.send(REQUEST)
    unsub()
    a.send(NOTE)
    assert received == [REQUEST]


class TestErrors:
  def test_receiver_side_decode_error_routed_to_error_handler(self):
    a, b = create_in_memory_transport_pair()
    errors = []
    b.on_error(errors.append)
    b.inject_raw_bytes(b"\xff\xfe\n")  # malformed unit on b's receive path
    assert len(errors) == 1
    assert isinstance(errors[0], TransportError)

  def test_error_buffered_until_handler_attaches(self):
    a, b = create_in_memory_transport_pair()
    b.inject_raw_bytes(b"{not json}\n")
    errors = []
    b.on_error(errors.append)  # flush on subscribe — never dropped
    assert len(errors) == 1

  def test_send_on_closed_transport_raises(self):
    a, b = create_in_memory_transport_pair()
    a.close()
    with pytest.raises(TransportError):
      a.send(REQUEST)


class TestClose:
  def test_clean_close_observed_by_both(self):
    a, b = create_in_memory_transport_pair()
    seen_a, seen_b = [], []
    a.on_close(seen_a.append)
    b.on_close(seen_b.append)
    a.close("bye")
    assert a.closed and b.closed
    assert seen_a[0].clean and seen_a[0].reason == "bye"
    assert seen_b[0].clean

  def test_disconnect_is_not_clean(self):
    a, b = create_in_memory_transport_pair()
    seen = []
    b.on_close(seen.append)
    a.disconnect("dropped")
    assert seen[0].clean is False
    assert seen[0].reason == "dropped"

  def test_late_subscriber_still_observes_close(self):
    a, b = create_in_memory_transport_pair()
    a.close()
    seen = []
    a.on_close(seen.append)  # subscribe after close
    assert len(seen) == 1 and seen[0].clean is True

  def test_close_is_idempotent(self):
    a, b = create_in_memory_transport_pair()
    seen = []
    a.on_close(seen.append)
    a.close()
    a.close()  # second close must not re-fire
    assert len(seen) == 1


class TestFramingIntegration:
  def test_messages_carry_real_bytes(self):
    # The in-memory pair carries framed bytes, so a message with non-ASCII content
    # round-trips through encode/decode intact.
    a, b = create_in_memory_transport_pair()
    received = []
    b.on_message(received.append)
    msg = {"jsonrpc": "2.0", "method": "m", "params": {"s": "héllo ✨"}}
    a.send(msg)
    assert received == [msg]

  def test_framer_name(self):
    assert NewlineFramer().name == "newline"
