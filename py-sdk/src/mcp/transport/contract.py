"""Transport contract, directionality, and statelessness (§7.1–§7.6).

The core protocol rides unchanged on whichever transport carries it: a transport
frames, delivers, and tears down bytes but never interprets a method, ``params``, or
``result``. This module defines:

* :class:`Transport` — the abstract bidirectional-channel contract (§7.1) plus the
  observable clean-close / disconnection surface (§7.2 clean close, §7.5).
* :class:`TransportError` — a channel-level failure, kept distinct from a JSON-RPC
  error response (a normal, fully delivered protocol message; §7.5).
* Directionality helpers (§7.4): which JSON-RPC kinds may travel which way.
* Documentation constants enumerating the §7.2 guarantees, the §7.3 custom-transport
  obligations, the stdio disconnection policy, and the §7.6 statelessness rules.

The §7.6 *per-request context* helpers (``derive_request_context`` etc.) are derived
from a request's ``_meta`` envelope; they land alongside the :mod:`mcp.protocol.meta`
module (§4) in a later commit, since they depend on its envelope validation.

No new wire types are introduced; the message union is :mod:`mcp.jsonrpc.framing`'s.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable, Literal

#: Cancels a previously registered handler.
Unsubscribe = Callable[[], None]


class TransportError(Exception):
  """A failure of the transport channel itself — distinct from a JSON-RPC error
  response (§7.5).

  A JSON-RPC error response (an ``error`` object inside a delivered message) is a
  normal, fully delivered protocol message reporting that a request failed at the
  protocol/application layer. A :class:`TransportError` instead signals that the
  channel could not carry a message, that a received unit was malformed at the
  encoding/framing level, or that the connection was lost. (R-7.2-q, R-7.2-r,
  R-7.5-i, R-7.5-j, R-7.6-b)
  """

  #: Stable machine-readable code for programmatic handling.
  code = "TRANSPORT_ERROR"


@dataclass(frozen=True)
class TransportCloseInfo:
  """Why a transport channel became unusable, surfaced to ``on_close`` handlers.

  ``clean=True`` is an orderly shutdown each side had the opportunity to observe
  (R-7.2-t). ``clean=False`` is an abrupt disconnection — the channel dropped without
  an orderly close — which a transport MUST still make observable. (R-7.5-a, R-7.5-b)
  """

  clean: bool
  reason: str | None = None


class Transport(ABC):
  """The abstract transport contract every defined or custom transport satisfies
  (§7.1, §7.2).

  A :class:`Transport` is a bidirectional channel that carries JSON-RPC messages as
  complete UTF-8 JSON values, preserves integrity, delivers in both directions, never
  silently drops a message, and defines an observable clean close and an observable
  abrupt disconnection. A transport does NOT interpret method/params/result or perform
  capability/version negotiation; those are core-protocol concerns carried unchanged.
  """

  @abstractmethod
  def send(self, message: dict) -> None:
    """Send one message over the channel.

    MUST NOT silently drop it: on a closed or failed channel this MUST surface an
    observable failure (raise a :class:`TransportError`) rather than discarding the
    message. (R-7.2-q, R-7.2-s, R-7.5-i, R-7.5-j)
    """

  @abstractmethod
  def on_message(self, handler: Callable[[dict], None]) -> Unsubscribe:
    """Register a handler for each inbound message. Returns an unsubscribe callable."""

  @abstractmethod
  def on_error(self, handler: Callable[[TransportError], None]) -> Unsubscribe:
    """Register a handler for **receiver-side** transport/parse-level errors.

    E.g. an inbound unit that is not well-formed UTF-8 or not a single JSON value.
    These surface on the side that *received* the bad unit, never thrown back into the
    unrelated sender's ``send`` and never silently dropped. (R-7.5-j, R-7.6-b, R-7.6-c)
    """

  @abstractmethod
  def on_close(self, handler: Callable[[TransportCloseInfo], None]) -> Unsubscribe:
    """Register a handler invoked once when the channel becomes unusable — by a clean
    close or an abrupt disconnection. (R-7.2-t, R-7.5-a)
    """

  @abstractmethod
  def close(self, reason: str | None = None) -> None:
    """Initiate an orderly (clean) close that each side can observe. (R-7.2-t)"""

  @property
  @abstractmethod
  def closed(self) -> bool:
    """``True`` once the channel has been closed or disconnected."""


# ─── Directionality (§7.4) ────────────────────────────────────────────────────

#: The two directions a message may travel at the JSON-RPC layer. (§7.4)
MessageDirection = Literal["client-to-server", "server-to-client"]
#: The structural kind of a message; both response forms share one directionality.
DirectionalKind = Literal["request", "notification", "response"]


def is_direction_permitted(kind: DirectionalKind, direction: MessageDirection) -> bool:
  """Return ``True`` when a message of ``kind`` may travel in ``direction`` (§7.4).

  * ``request``      → client→server only
  * ``response``     → server→client only
  * ``notification`` → either direction

  (R-7.4-b, R-7.4-c, plus the informative rule that servers never initiate requests
  and clients never send responses.)
  """
  if kind == "request":
    return direction == "client-to-server"
  if kind == "response":
    return direction == "server-to-client"
  return True  # notification — either direction


# ─── Documentation constants ──────────────────────────────────────────────────

#: The transport-agnostic guarantees every transport MUST uphold. (§7.2)
TRANSPORT_GUARANTEES: dict[str, tuple[str, ...]] = {
  "FRAMING": ("R-7.2-b", "R-7.2-c", "R-7.2-d"),
  "ASSOCIATION_BY_ID": ("R-7.2-e", "R-7.2-f", "R-7.2-g", "R-7.2-o"),
  "MULTIPLEXING": ("R-7.2-i", "R-7.2-j", "R-7.2-k", "R-7.2-l"),
  "ORDERING": ("R-7.2-m", "R-7.2-n", "R-7.2-p"),
  "NO_SILENT_LOSS": ("R-7.2-q", "R-7.2-r", "R-7.2-s"),
  "CLEAN_CLOSE": ("R-7.2-t",),
}

#: The obligations on a custom transport. (§7.3)
CUSTOM_TRANSPORT_OBLIGATIONS: dict[str, str] = {
  "MAY_IMPLEMENT": "R-7.3-a",
  "PRESERVE_FORMAT_PATTERNS_METADATA": "R-7.3-b",
  "UPHOLD_ALL_GUARANTEES": "R-7.3-c",
  "SHOULD_DOCUMENT": "R-7.3-d",
  "SHOULD_REUSE_STDIO_FRAMING": "R-7.3-e",
}

#: Stdio-specific disconnection policy, owned by the stdio transport (§8), per §7.5.
STDIO_DISCONNECT_POLICY: dict[str, str] = {
  "SHOULD_RESTART_ON_UNEXPECTED_EXIT": "R-7.5-g",
  "MAY_RETRY_INFLIGHT_ON_FRESH_PROCESS": "R-7.5-h",
}

#: The statelessness rules a transport and the server above it MUST honour. (§7.6)
STATELESS_TRANSPORT_RULES: dict[str, str] = {
  "NO_CONNECTION_SCOPED_STATE": "R-7.6-d",
  "NO_PRIOR_REQUEST_INFERENCE": "R-7.6-e",
  "CONTEXT_FROM_META_ONLY": "R-7.6-f",
  "SHOULD_NOT_REQUIRE_CONNECTION_REUSE": "R-7.6-g",
  "MAY_INTERLEAVE_UNRELATED": "R-7.6-h",
  "CONNECTION_NOT_CONVERSATION": "R-7.6-i",
  "EXPLICIT_CONTINUATION_IDENTIFIER": "R-7.6-j",
}
