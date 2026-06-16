"""Transport framing, UTF-8 decoding, and integrity (§7.1, §7.2, §7.6).

A transport carries each message as a single complete UTF-8 JSON value (R-7.1-b) and
MUST define an unambiguous, body-independent way to find the byte boundaries of one
message (R-7.2-b–R-7.2-d). This module provides:

* :class:`MessageFramer` / :class:`FrameDecoder` — the abstract framing contract:
  encode a message to a delimited byte unit, and split a byte stream back into units
  using the framing alone, without parsing the JSON body (R-7.2-c).
* :class:`NewlineFramer` — newline-delimited JSON over a byte stream; the framing a
  custom transport over a reliable byte stream SHOULD reuse (R-7.3-e).
* :func:`decode_message_unit` — turn one framed unit's bytes back into a message,
  rejecting (never silently substituting/dropping) any unit that is not well-formed
  UTF-8 or does not parse as a single JSON value (R-7.1-b, R-7.6-a–R-7.6-c).
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass

from mcp.jsonrpc.framing import MalformedMessageError, classify_message
from mcp.transport.contract import TransportError

#: The newline byte (``\n``, U+000A) used by :class:`NewlineFramer` as the delimiter.
NEWLINE_BYTE = 0x0A


def _reject_non_finite(token: str) -> float:
  """``json.loads`` ``parse_constant`` hook that rejects the non-finite JSON-extension
  tokens ``NaN`` / ``Infinity`` / ``-Infinity``.

  RFC 8259 (and the §3 JSON value model) admit only finite numbers, so a unit carrying one
  of these literals is not valid JSON and MUST be rejected — never silently substituted
  with a Python ``float('nan')``/``float('inf')``. (R-7.1-b, R-7.6-b)
  """
  raise ValueError(f"non-finite JSON number token {token!r} is not a valid JSON value")


def encode_message_unit(message: dict) -> bytes:
  """Encode a message to its UTF-8 JSON bytes, **without** any framing.

  ``json.dumps`` escapes any embedded newline inside a string as the two characters
  ``\\`` ``n``, so the produced bytes never contain a raw ``0x0A`` — which is what
  makes newline framing unambiguous (R-7.2-d). ``ensure_ascii=False`` emits real
  UTF-8 for non-ASCII characters (R-7.1-b).

  ``allow_nan=False`` makes a non-finite number (``NaN``/``Infinity``/``-Infinity``) an
  observable failure rather than emitting the invalid bare ``NaN``/``Infinity`` tokens
  Python's ``json`` produces by default — JSON has no non-finite numbers (R-7.1-b), and
  this module never puts a malformed value on the wire.

  :raises TransportError: when ``message`` contains a non-finite number.
  """
  try:
    return json.dumps(message, ensure_ascii=False, allow_nan=False).encode("utf-8")
  except ValueError as cause:
    raise TransportError(
      "cannot encode message: it contains a non-finite number (NaN/Infinity), "
      "which is not a valid JSON value (R-7.1-b)"
    ) from cause


def decode_message_unit(data: bytes) -> dict:
  """Decode one framed unit's bytes (framing already removed) into a message.

  Enforces, in order: (1) well-formed UTF-8 (R-7.6-a–R-7.6-c); (2) exactly one JSON
  value — trailing or multiple values are rejected (R-7.1-b, R-7.6-b), and the non-finite
  JSON-extension tokens ``NaN``/``Infinity``/``-Infinity`` are rejected rather than
  silently parsed (R-7.1-b); (3) the value classifies as a valid JSON-RPC message via
  :func:`classify_message`.

  Never returns a substituted/partial message and never returns ``None`` for a
  malformed unit — every failure is an observable raise. (R-7.2-q, R-7.6-c)

  :raises TransportError: when the unit is not well-formed UTF-8, not a single finite-JSON
    value, or not a valid JSON-RPC message.
  """
  try:
    text = data.decode("utf-8")  # strict by default — raises on ill-formed UTF-8
  except UnicodeDecodeError as cause:
    raise TransportError("received unit is not well-formed UTF-8") from cause

  try:
    # ``parse_constant`` turns the non-finite extension tokens into an observable raise;
    # ``json.JSONDecodeError`` is itself a ``ValueError`` subclass, so one except covers
    # both no-value/trailing-data and the non-finite rejection.
    value = json.loads(text, parse_constant=_reject_non_finite)
  except ValueError as cause:
    raise TransportError("received unit does not parse as a single JSON value") from cause

  try:
    return classify_message(value).message
  except MalformedMessageError as cause:
    raise TransportError(
      f"received unit is not a valid JSON-RPC message: {cause}"
    ) from cause


@dataclass(frozen=True)
class DecodeResult:
  """Result of :func:`try_decode_message_unit`."""

  ok: bool
  message: dict | None = None
  error: TransportError | None = None


def try_decode_message_unit(data: bytes) -> DecodeResult:
  """Non-throwing variant of :func:`decode_message_unit`.

  Returns an ``ok=False`` result carrying the :class:`TransportError` instead of
  raising. The failure is still observable (returned, not swallowed), so the
  no-silent-drop rule holds. (R-7.6-c)
  """
  try:
    return DecodeResult(True, message=decode_message_unit(data))
  except TransportError as error:
    return DecodeResult(False, error=error)


class FrameDecoder(ABC):
  """Splits a byte stream back into individual message units using framing alone.

  The decoder MUST NOT parse the JSON body to find where one message ends and the next
  begins (R-7.2-b–R-7.2-d). A decoder is stateful: it buffers bytes that do not yet
  form a complete unit and emits each complete unit as its delimiter arrives.
  """

  @abstractmethod
  def push(self, chunk: bytes) -> list[bytes]:
    """Feed a chunk of received bytes; return every complete message unit now
    available (framing removed). Incomplete trailing bytes are retained.
    """

  @property
  @abstractmethod
  def pending(self) -> int:
    """Number of buffered bytes not yet forming a complete unit (never dropped)."""

  @abstractmethod
  def remainder(self) -> bytes:
    """A copy of the buffered, not-yet-complete bytes."""


class MessageFramer(ABC):
  """Encodes messages to delimited byte units and produces decoders that recover them.

  A :class:`MessageFramer` is the §7.2 framing guarantee made concrete.
  """

  #: A short identifier for the framing (useful when documenting a transport).
  name: str

  @abstractmethod
  def encode(self, message: dict) -> bytes:
    """Encode a message to one self-delimited byte unit."""

  @abstractmethod
  def create_decoder(self) -> FrameDecoder:
    """Create a fresh stateful decoder for one inbound byte stream."""


class _NewlineFrameDecoder(FrameDecoder):
  def __init__(self) -> None:
    self._buffer = bytearray()

  def push(self, chunk: bytes) -> list[bytes]:
    # Boundaries are found by scanning for the delimiter byte only — the JSON body is
    # never parsed to locate them (R-7.2-c). UTF-8 multi-byte sequences never contain
    # a 0x0A byte, so this scan is unambiguous.
    self._buffer += chunk
    units: list[bytes] = []
    while True:
      idx = self._buffer.find(NEWLINE_BYTE)
      if idx == -1:
        break
      units.append(bytes(self._buffer[:idx]))
      del self._buffer[: idx + 1]
    # Any bytes after the last delimiter stay buffered — never dropped (R-7.2-q).
    return units

  @property
  def pending(self) -> int:
    return len(self._buffer)

  def remainder(self) -> bytes:
    return bytes(self._buffer)


class NewlineFramer(MessageFramer):
  """Newline-delimited JSON-RPC framing over a byte stream (§7.2, §7.3, §8 framing).

  Each message is its UTF-8 JSON serialization followed by a single ``\\n``. A receiver
  recovers messages by splitting on ``\\n`` without parsing the body (R-7.2-c, R-7.2-d).
  This is the framing a custom transport over a reliable byte stream SHOULD reuse
  rather than defining a new one (R-7.3-e).
  """

  name = "newline"

  def encode(self, message: dict) -> bytes:
    return encode_message_unit(message) + bytes([NEWLINE_BYTE])

  def create_decoder(self) -> FrameDecoder:
    return _NewlineFrameDecoder()
