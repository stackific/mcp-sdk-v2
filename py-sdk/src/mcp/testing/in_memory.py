"""In-memory Client↔McpServer harness — the Python port of the TS ``connectInMemory``.

This wires a :class:`~mcp.client.client.Client` directly to an
:class:`~mcp.server.server.McpServer` with no real transport. Where the TS harness links
a ``Client`` and a server through a linked in-memory *transport pair* (because that SDK's
client/server are message-pump driven), the Python ``Client`` is **synchronous** and
talks to a :class:`~mcp.client.transport.ClientTransport` via a single
``request(message) -> response`` call. So the faithful Python shape is a transport whose
:meth:`InMemoryClientTransport.request` dispatches the request straight through
:func:`~mcp.server.runtime.process_message` and returns the resulting dict — the whole
exchange happens in one call stack, no framing, no I/O, no threads.

What is preserved from the TS test-kit:

* the *names* (mirrored in snake_case): :func:`connect_in_memory` (the
  ``connectInMemory`` factory) and :class:`InMemoryClientTransport` (the in-memory
  transport the client connects over);
* the *behaviour*: a real :class:`~mcp.client.client.Client` driving a real
  :class:`~mcp.server.server.McpServer` end-to-end — discovery, list/call/read/get, and
  delivered JSON-RPC errors surfaced as :class:`~mcp.client.client.RequestError` — with
  nothing stubbed on either side.
"""

from __future__ import annotations

from mcp.client.client import Client
from mcp.client.transport import ClientTransport, ClientTransportError
from mcp.server.runtime import process_message
from mcp.server.server import McpServer


class InMemoryClientTransport(ClientTransport):
  """A :class:`~mcp.client.transport.ClientTransport` backed by a live ``McpServer``.

  Each :meth:`request` is dispatched in-process through
  :func:`~mcp.server.runtime.process_message`, so a :class:`~mcp.client.client.Client`
  drives ``server`` directly with no framing, no transport pair, and no I/O. Delivery is
  synchronous: ``request`` returns only after the server has fully produced the response,
  giving tests deterministic ordering.

  The classification, dispatch, capability-gating, and error-enveloping all run inside
  the server's own runtime — this transport adds no behaviour of its own beyond carrying
  one request and returning one response.
  """

  def __init__(self, server: McpServer) -> None:
    """Bind the transport to the ``server`` it will dispatch every request to.

    :param server: the :class:`~mcp.server.server.McpServer` that answers requests; held
      by reference, so tools/resources/prompts registered after construction are visible.
    """
    self._server = server

  def request(self, message: dict) -> dict:
    """Dispatch one JSON-RPC request to the bound server and return its response.

    The already-parsed ``message`` is handed to
    :func:`~mcp.server.runtime.process_message`, which classifies it, routes the request
    to the server, and returns the JSON-RPC success or error envelope. A delivered error
    envelope is a normal return value here (the :class:`~mcp.client.client.Client` raises
    :class:`~mcp.client.client.RequestError` from it) — this method only raises for a
    *channel* failure.

    :param message: a JSON-RPC **request** object (must carry ``method`` and ``id``).
    :returns: the JSON-RPC response envelope (a ``result`` or ``error`` object).
    :raises ClientTransportError: if ``process_message`` produced no response, which can
      only happen when ``message`` is not a request (a notification or a response). That
      is a misuse of the request/response channel, not a delivered server error, so it is
      surfaced as a transport-channel failure rather than returned as a (missing) reply.
    """
    response = process_message(self._server, message)
    if response is None:
      # process_message returns None only for non-request frames (notifications / stray
      # responses). The Client only ever calls request() with a request, so reaching here
      # means the channel was misused; fail loudly rather than return a bogus reply.
      raise ClientTransportError(
        "in-memory transport received a non-request message (no response was produced)"
      )
    return response


def connect_in_memory(
  server: McpServer,
  client_info: dict,
  *,
  capabilities: dict | None = None,
  protocol_versions: list[str] | None = None,
  discover: bool = True,
) -> Client:
  """Build a :class:`~mcp.client.client.Client` connected to ``server`` in-process.

  The Python equivalent of the TS ``connectInMemory``: it constructs an
  :class:`InMemoryClientTransport` over ``server`` and a :class:`~mcp.client.client.Client`
  on top of it, then (by default) runs discovery so the returned client is already
  connected — i.e. it has negotiated a protocol revision and cached the server's info and
  capabilities, exactly as the TS harness leaves its client after ``client.connect``.

  Because everything is synchronous and in-process, the returned client is ready to use
  immediately; there is nothing to await and no teardown is required (hence no separate
  harness/``close`` object — the TS ``close`` only stopped a server loop and closed a
  socket-style transport, neither of which exists here).

  :param server: the :class:`~mcp.server.server.McpServer` to drive.
  :param client_info: the client's ``Implementation`` identity, stamped into every
    request's ``_meta`` envelope (§4.3).
  :param capabilities: the client capabilities advertised in every request's ``_meta``
    (§6.2); defaults to none.
  :param protocol_versions: acceptable protocol revisions, most-preferred first; defaults
    to the SDK's current revision.
  :param discover: when ``True`` (the default), run :meth:`~mcp.client.client.Client.discover`
    before returning so the client is already connected; pass ``False`` to get an
    un-discovered client (e.g. to assert pre-discovery state or to drive discovery yourself).
  :returns: a :class:`~mcp.client.client.Client` wired to ``server`` and, unless
    ``discover=False``, already connected.
  """
  transport = InMemoryClientTransport(server)
  client = Client(
    transport,
    client_info,
    capabilities=capabilities,
    protocol_versions=protocol_versions,
  )
  if discover:
    client.discover()
  return client
