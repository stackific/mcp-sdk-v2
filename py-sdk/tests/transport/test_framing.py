"""Tests for transport framing + UTF-8/integrity decoding (§7.1, §7.2, §7.6)."""

import pytest

from mcp.transport.contract import TransportError
from mcp.transport.framing import (
  NEWLINE_BYTE,
  NewlineFramer,
  decode_message_unit,
  encode_message_unit,
  try_decode_message_unit,
)

REQUEST = {"jsonrpc": "2.0", "id": 1, "method": "ping"}


class TestEncodeUnit:
  def test_roundtrip(self):
    assert decode_message_unit(encode_message_unit(REQUEST)) == REQUEST

  def test_embedded_newline_is_escaped(self):
    # A string containing a newline must not produce a raw 0x0A in the bytes,
    # otherwise newline framing would be ambiguous (R-7.2-d).
    msg = {"jsonrpc": "2.0", "method": "m", "params": {"text": "a\nb"}}
    body = encode_message_unit(msg)
    assert NEWLINE_BYTE not in body

  def test_real_utf8_for_non_ascii(self):
    msg = {"jsonrpc": "2.0", "method": "m", "params": {"s": "héllo"}}
    body = encode_message_unit(msg)
    assert "héllo".encode("utf-8") in body


class TestNewlineFramer:
  def test_encode_appends_single_newline(self):
    framer = NewlineFramer()
    framed = framer.encode(REQUEST)
    assert framed[-1] == NEWLINE_BYTE
    assert framed.count(NEWLINE_BYTE) == 1

  def test_decoder_splits_multiple_units_in_one_chunk(self):
    framer = NewlineFramer()
    decoder = framer.create_decoder()
    chunk = framer.encode(REQUEST) + framer.encode({"jsonrpc": "2.0", "method": "n"})
    units = decoder.push(chunk)
    assert len(units) == 2
    assert decode_message_unit(units[0]) == REQUEST

  def test_decoder_buffers_partial_unit(self):
    framer = NewlineFramer()
    decoder = framer.create_decoder()
    framed = framer.encode(REQUEST)
    # Feed all but the final newline: no complete unit yet, bytes retained.
    assert decoder.push(framed[:-1]) == []
    assert decoder.pending == len(framed) - 1
    # Now the delimiter arrives → one unit, buffer drained.
    units = decoder.push(bytes([NEWLINE_BYTE]))
    assert len(units) == 1
    assert decoder.pending == 0
    assert decoder.remainder() == b""

  def test_decoder_handles_byte_by_byte(self):
    framer = NewlineFramer()
    decoder = framer.create_decoder()
    framed = framer.encode(REQUEST)
    emitted = []
    for b in framed:
      emitted.extend(decoder.push(bytes([b])))
    assert len(emitted) == 1
    assert decode_message_unit(emitted[0]) == REQUEST


class TestDecodeErrors:
  def test_invalid_utf8(self):
    with pytest.raises(TransportError):
      decode_message_unit(b"\xff\xfe")

  def test_not_single_json_value(self):
    # Trailing data after the first value → rejected (R-7.1-b).
    with pytest.raises(TransportError):
      decode_message_unit(b'{"jsonrpc":"2.0","method":"m"} {"x":1}')

  def test_invalid_json(self):
    with pytest.raises(TransportError):
      decode_message_unit(b"{not json}")

  def test_valid_json_but_not_jsonrpc(self):
    with pytest.raises(TransportError):
      decode_message_unit(b'{"foo": 1}')


class TestTryDecode:
  def test_ok(self):
    result = try_decode_message_unit(encode_message_unit(REQUEST))
    assert result.ok and result.message == REQUEST and result.error is None

  def test_error_is_returned_not_raised(self):
    result = try_decode_message_unit(b"\xff")
    assert not result.ok
    assert isinstance(result.error, TransportError)
    assert result.message is None


class TestNonFiniteNumbersRejected:
  """RFC 8259 / §3 JSON has no non-finite numbers, so the wire boundary rejects ``NaN`` /
  ``Infinity`` / ``-Infinity`` in BOTH directions rather than emitting or accepting them.
  Python's ``json`` is permissive about these by default — this is the explicit guard.
  (S02; R-7.1-b, R-7.6-b)
  """

  @pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
  def test_encode_rejects_non_finite(self, value):
    msg = {"jsonrpc": "2.0", "id": 1, "result": {"x": value}}
    with pytest.raises(TransportError):
      encode_message_unit(msg)

  def test_encode_rejects_non_finite_nested_deeply(self):
    msg = {"jsonrpc": "2.0", "id": 1, "result": {"a": [1, {"b": float("inf")}]}}
    with pytest.raises(TransportError):
      encode_message_unit(msg)

  @pytest.mark.parametrize(
    "raw",
    [
      b'{"jsonrpc":"2.0","id":1,"result":{"x":NaN}}',
      b'{"jsonrpc":"2.0","id":1,"result":{"x":Infinity}}',
      b'{"jsonrpc":"2.0","id":1,"result":{"x":-Infinity}}',
    ],
  )
  def test_decode_rejects_non_finite_tokens(self, raw):
    # The peer must not be able to smuggle a float('nan')/float('inf') past the decoder.
    with pytest.raises(TransportError):
      decode_message_unit(raw)

  def test_try_decode_returns_error_for_non_finite(self):
    raw = b'{"jsonrpc":"2.0","id":1,"result":{"x":NaN}}'
    result = try_decode_message_unit(raw)
    assert not result.ok
    assert isinstance(result.error, TransportError)
    assert result.message is None

  def test_finite_floats_still_round_trip(self):
    # The complement: ordinary finite floats are unaffected (no over-rejection).
    msg = {"jsonrpc": "2.0", "id": 1, "result": {"x": 3.14, "y": -2.5, "z": 0.0}}
    assert decode_message_unit(encode_message_unit(msg)) == msg
