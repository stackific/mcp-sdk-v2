"""In-memory reference transport (§7.1–§7.6).

A minimal, fully in-process :class:`Transport` used to demonstrate and test that the
§7.2 guarantees can be met by a conforming transport. It is itself a *custom* transport
in the §7.3 sense: it preserves the JSON-RPC message format, the exchange patterns, and
the per-request metadata model, and upholds every §7.2 guarantee — but it is NOT one of
the two transports the specification defines (stdio; Streamable HTTP).

To make the framing, UTF-8, and integrity guarantees real rather than assumed, the pair
carries **bytes**: each ``send`` frames the message with :class:`NewlineFramer` and the
peer recovers it with the same framing plus :func:`decode_message_unit` (UTF-8 +
single-JSON-value validation). Delivery is synchronous for test determinism.
"""

from __future__ import annotations

from typing import Callable

from mcp.transport.contract import (
  Transport,
  TransportCloseInfo,
  TransportError,
  Unsubscribe,
)
from mcp.transport.framing import NewlineFramer, try_decode_message_unit


class InMemoryTransport(Transport):
  """One endpoint of an in-memory transport pair.

  Construct pairs via :func:`create_in_memory_transport_pair` rather than directly.
  """

  def __init__(self) -> None:
    self._peer: InMemoryTransport | None = None
    self._framer = NewlineFramer()
    self._decoder = self._framer.create_decoder()
    self._message_handlers: list[Callable[[dict], None]] = []
    self._error_handlers: list[Callable[[TransportError], None]] = []
    self._close_handlers: list[Callable[[TransportCloseInfo], None]] = []
    # Buffered until a handler attaches — never dropped.
    self._inbox: list[dict] = []
    self._error_inbox: list[TransportError] = []
    self._closed = False
    self._close_info: TransportCloseInfo | None = None

  def link(self, peer: "InMemoryTransport") -> None:
    """Link this endpoint to its peer. Internal — used by the factory."""
    self._peer = peer

  def send(self, message: dict) -> None:
    if self._closed:
      # Never silently drop: a send on a closed channel is an observable failure.
      raise TransportError("cannot send on a closed transport")
    if self._peer is None:
      raise TransportError("transport endpoint is not linked to a peer")
    # Frame + UTF-8 encode, then hand the raw bytes to the peer. The peer finds
    # message boundaries from framing alone and re-parses each as one JSON value.
    self._peer._accept_bytes(self._framer.encode(message))

  def _accept_bytes(self, data: bytes) -> None:
    """Receive raw bytes from the peer's ``send``."""
    if self._closed:
      # The receiver is closed; surface the failure to the sending peer rather than
      # discarding the bytes. (R-7.2-r, R-7.5-j)
      raise TransportError("peer transport is closed; message not delivered")
    for unit in self._decoder.push(data):
      # A malformed inbound unit is the *receiver's* error: route it to this
      # endpoint's error channel, never back into the sender and never dropped.
      decoded = try_decode_message_unit(unit)
      if decoded.ok:
        assert decoded.message is not None
        self._dispatch(decoded.message)
      else:
        assert decoded.error is not None
        self._dispatch_error(decoded.error)

  def inject_raw_bytes(self, data: bytes) -> None:
    """Feed arbitrary raw bytes into this endpoint's receive path, as if they arrived
    on the wire. Used to exercise receiver-side decode-error handling. Not part of the
    :class:`Transport` contract — a test/simulation affordance.
    """
    self._accept_bytes(data)

  def _dispatch(self, message: dict) -> None:
    if not self._message_handlers:
      self._inbox.append(message)
      return
    for handler in list(self._message_handlers):
      handler(message)

  def _dispatch_error(self, error: TransportError) -> None:
    if not self._error_handlers:
      self._error_inbox.append(error)  # buffered until a handler attaches
      return
    for handler in list(self._error_handlers):
      handler(error)

  def on_message(self, handler: Callable[[dict], None]) -> Unsubscribe:
    self._message_handlers.append(handler)
    # Flush anything that arrived before a handler existed — no silent loss.
    if self._inbox:
      buffered, self._inbox = self._inbox, []
      for message in buffered:
        handler(message)
    return lambda: self._message_handlers.remove(handler)

  def on_error(self, handler: Callable[[TransportError], None]) -> Unsubscribe:
    self._error_handlers.append(handler)
    if self._error_inbox:
      buffered, self._error_inbox = self._error_inbox, []
      for error in buffered:
        handler(error)
    return lambda: self._error_handlers.remove(handler)

  def on_close(self, handler: Callable[[TransportCloseInfo], None]) -> Unsubscribe:
    # A late subscriber to an already-closed channel still observes the close.
    if self._closed and self._close_info is not None:
      handler(self._close_info)
      return lambda: None
    self._close_handlers.append(handler)

    def _unsub() -> None:
      if handler in self._close_handlers:
        self._close_handlers.remove(handler)

    return _unsub

  def close(self, reason: str | None = None) -> None:
    """Initiate an orderly close observable by both endpoints. (R-7.2-t)"""
    self._shutdown(True, reason)

  def disconnect(self, reason: str | None = None) -> None:
    """Simulate an abrupt disconnection (channel dropped without an orderly close).

    Both endpoints observe it via ``on_close`` with ``clean=False``, so neither side
    blocks as though the channel were still live. Not part of the :class:`Transport`
    contract — a test/simulation affordance. (R-7.5-a, R-7.5-b)
    """
    self._shutdown(False, reason)

  @property
  def closed(self) -> bool:
    return self._closed

  def _shutdown(self, clean: bool, reason: str | None) -> None:
    info = TransportCloseInfo(clean=clean, reason=reason)
    # Close both ends so each side can observe the channel is unusable.
    self._mark_closed(info)
    if self._peer is not None:
      self._peer._mark_closed(info)

  def _mark_closed(self, info: TransportCloseInfo) -> None:
    if self._closed:
      return
    self._closed = True
    self._close_info = info
    for handler in list(self._close_handlers):
      handler(info)
    self._close_handlers.clear()


def create_in_memory_transport_pair() -> tuple[InMemoryTransport, InMemoryTransport]:
  """Create a linked pair of in-memory transports.

  Anything one endpoint sends is delivered to the other; closing or disconnecting
  either endpoint makes both observe the close. (§7.1, §7.4, §7.2 clean close, §7.5)
  """
  a = InMemoryTransport()
  b = InMemoryTransport()
  a.link(b)
  b.link(a)
  return a, b
