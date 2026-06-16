"""Client transport contract (the request/response side of §7/§9).

A :class:`ClientTransport` carries one JSON-RPC *request* to the server and returns the
correlated *response*. On the stateless Streamable HTTP transport this is a single
POST → response, so the request/response shape is the natural client-side surface (no
long-lived correlator is required for the basic exchange).

Channel failures raise :class:`ClientTransportError`, kept distinct from a delivered
JSON-RPC error response (which the :class:`~mcp.client.client.Client` surfaces as a
``RequestError``). (§7.5)
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class ClientTransportError(Exception):
  """A client-side transport channel failure (not a delivered JSON-RPC error)."""

  #: Stable machine-readable code for programmatic handling.
  code = "CLIENT_TRANSPORT_ERROR"


class ClientTransport(ABC):
  """Carries a JSON-RPC request and returns its response envelope."""

  @abstractmethod
  def request(self, message: dict) -> dict:
    """Send ``message`` (a JSON-RPC request) and return the response envelope.

    :raises ClientTransportError: on a channel failure (network error, non-JSON body).
    """

  def close(self) -> None:
    """Release any resources held by the transport. Optional; defaults to a no-op."""
    return None
