"""S12 — Response↔request correlation, multiplexing, and disconnection (§7.2, §7.5).

This module realises the §7.2 association/multiplexing/ordering guarantees and the §7.5
in-flight-failure-on-disconnect rule, transport-agnostically:

* :class:`RequestCorrelator` — a sender-side registry that issues a future per
  outstanding request ``id``, resolves it when a response with the matching ``id`` is
  delivered (in ANY order; R-7.2-m – R-7.2-p), forbids reuse of an unanswered ``id``
  (R-7.2-j), permits arbitrarily many concurrent outstanding requests (R-7.2-i,
  R-7.2-k, R-7.2-l), and on disconnection fails every unanswered request so the caller
  never waits forever (R-7.5-c – R-7.5-e).
* :func:`build_parse_error_response` / :func:`is_acceptable_malformed_id_error_response`
  — the single permitted id exception: an error reply to a request whose ``id`` could
  not be read MAY carry a ``null`` id or omit it (R-7.2-h).

A delivered JSON-RPC error response is a normal, fully delivered message and *resolves*
its future (the caller inspects ``result`` vs ``error``); only a transport-level failure
*fails* it (via :meth:`~RequestCorrelator.fail`/:meth:`~RequestCorrelator.fail_all`),
which sets a :class:`~mcp.client.transport.ClientTransportError` on the future. This
keeps the §7.5 distinction between the two error kinds explicit at the API.

The TypeScript original (``ts-sdk/src/transport/correlation.ts``) models an outstanding
request as a ``Promise``; the Python port models it as a
:class:`concurrent.futures.Future`, which is synchronous-friendly:
:meth:`~RequestCorrelator.issue` returns a ``Future`` the caller can ``.result()`` on,
while :meth:`~RequestCorrelator.deliver`/:meth:`~RequestCorrelator.fail` set its result
or exception. This mirrors the synchronous client transport surface
(:class:`mcp.client.transport.ClientTransport`).
"""

from __future__ import annotations

from concurrent.futures import Future

from mcp.jsonrpc.framing import InFlightTracker, RequestId, id_echo_matches
from mcp.protocol.errors import PARSE_ERROR_CODE

# Re-export the id-echo helper so callers of the correlator have it to hand, mirroring
# the TypeScript module's ``export { idEchoMatches }``.
__all__ = [
  "PARSE_ERROR_CODE",
  "RequestCorrelator",
  "build_parse_error_response",
  "id_echo_matches",
  "is_acceptable_malformed_id_error_response",
]


# ─── RequestCorrelator ────────────────────────────────────────────────────────


def _key(id_: RequestId) -> str:
  """Type-tag the natural key so string ``"1"`` and number ``1`` never collide.

  ``"1"`` (string) and ``1`` (number) are kept distinct because they are different JSON
  types — matching S03's id rules (R-3.2-f, R-3.2-g).
  """
  return f"s:{id_}" if isinstance(id_, str) else f"n:{id_}"


class RequestCorrelator:
  """Correlate inbound responses to outstanding requests **by ``id`` only**.

  Never by delivery order, connection, stream, or position. (R-7.2-e – R-7.2-g, R-7.2-o)

  Typical use by a sender::

      correlator = RequestCorrelator()
      f1 = correlator.issue(1)   # does not block
      f2 = correlator.issue(2)   # multiplexed — no wait between them
      # feed inbound responses in as they arrive, in any order:
      correlator.deliver(response_for_2)
      r2 = f2.result()           # resolves whenever id=2 arrives, even first
      # on disconnection:
      correlator.fail_all(ClientTransportError("disconnected"))

  ``"1"`` (string) and ``1`` (number) are kept distinct because they are different JSON
  types — matching S03's id rules (R-3.2-f, R-3.2-g).
  """

  def __init__(self) -> None:
    # Reuse the §3.2 in-flight tracker for reuse-detection bookkeeping (R-7.2-j); it
    # raises on reuse of an unanswered id, exactly as the TS InFlightTracker does.
    self._tracker = InFlightTracker()
    # Pending futures keyed by the type-tagged id. The stored id is the *issued* id so a
    # delivery can be defensively re-checked with ``id_echo_matches``.
    self._pending: dict[str, tuple[RequestId, Future[dict]]] = {}

  def issue(self, id_: RequestId) -> Future[dict]:
    """Register ``id_`` as outstanding and return a future for its response.

    The future settles when a matching response is delivered (:meth:`deliver`) or the
    request is failed (:meth:`fail`/:meth:`fail_all`).

    Concurrency: calling :meth:`issue` again before the first settles is allowed and
    expected — the transport need not wait for one response before issuing another
    (R-7.2-i, R-7.2-k, R-7.2-l).

    :raises ValueError: synchronously when ``id_`` is already outstanding — a sender
      MUST NOT reuse the ``id`` of an unanswered request. (R-7.2-j)
    """
    # Register first: this raises on reuse of an unanswered id (R-7.2-j) *before* any
    # future is created, so a rejected issue leaves no pending entry behind.
    self._tracker.register(id_)
    future: Future[dict] = Future()
    self._pending[_key(id_)] = (id_, future)
    return future

  def deliver(self, response: dict) -> bool:
    """Deliver an inbound response, resolving the matching outstanding request's future.

    Matching is purely by ``id``; the order in which responses are delivered is
    irrelevant (R-7.2-m, R-7.2-n, R-7.2-p).

    A delivered error response (carrying ``error``) still *resolves* the future — it is
    a normal, fully delivered protocol message (§7.5). Only :meth:`fail`/:meth:`fail_all`
    set an exception (transport-level failure).

    :returns: ``True`` if a matching outstanding request was found and resolved;
      ``False`` for an unknown/late ``id`` (e.g. a response to an already-failed
      request), a response with no readable id, or a mismatched id type — the correlator
      does not raise on an unmatched delivery.
    """
    if not isinstance(response, dict):
      return False
    id_ = response.get("id")
    # A response without a readable id (absent or ``null``) cannot be correlated.
    if id_ is None or not isinstance(id_, (str, int)) or isinstance(id_, bool):
      return False
    key = _key(id_)
    entry = self._pending.get(key)
    if entry is None:
      return False
    issued_id, future = entry
    # Defensive: the matched id must echo the issued id with no type coercion.
    if not id_echo_matches(issued_id, id_):
      return False
    del self._pending[key]
    self._tracker.complete(issued_id)
    future.set_result(response)
    return True

  def fail(self, id_: RequestId, error: BaseException) -> bool:
    """Fail a single outstanding request with a transport-level error.

    Sets ``error`` as the future's exception so the caller can observe the failure
    rather than waiting forever. (R-7.5-d, R-7.5-e)

    :returns: ``True`` if the request was outstanding and is now failed.
    """
    key = _key(id_)
    entry = self._pending.pop(key, None)
    if entry is None:
      return False
    issued_id, future = entry
    self._tracker.complete(issued_id)
    future.set_exception(error)
    return True

  def fail_all(self, error: BaseException) -> list[RequestId]:
    """Fail **every** outstanding request — the disconnection action.

    A transport calls this on abrupt or clean disconnection so no in-flight request can
    hang. (R-7.5-c, R-7.5-d, R-7.5-e)

    After this returns the correlator holds no outstanding requests, so the same ids MAY
    be reissued against a fresh connection (R-7.5-f, R-7.7-b) — no state is bound to the
    lost connection.

    :returns: the ids that were failed (in issue order).
    """
    failed: list[RequestId] = []
    # Snapshot before mutating so we iterate a stable view.
    entries = list(self._pending.values())
    self._pending.clear()
    for issued_id, future in entries:
      self._tracker.complete(issued_id)
      failed.append(issued_id)
      future.set_exception(error)
    return failed

  def has(self, id_: RequestId) -> bool:
    """Return ``True`` when ``id_`` is currently outstanding."""
    return _key(id_) in self._pending

  @property
  def size(self) -> int:
    """The number of currently outstanding requests."""
    return len(self._pending)

  @property
  def outstanding(self) -> list[RequestId]:
    """A snapshot list of the currently outstanding ids (in issue order)."""
    return [issued_id for issued_id, _future in self._pending.values()]


# ─── Malformed-id error response (the single id exception) ─────────────────────


def build_parse_error_response(*, null_id: bool = False) -> dict:
  """Build a parse-error response for a request whose ``id`` could not be read. (R-7.2-h)

  Per R-7.2-h this MAY carry a ``null`` id or omit it — the one exception to the strict
  id-echo rule of S03.

  :param null_id: When ``True``, the response carries ``"id": null``; when ``False``
    (the default), the ``id`` member is omitted entirely. Both forms are valid.
  """
  response: dict = {
    "jsonrpc": "2.0",
    "error": {"code": PARSE_ERROR_CODE, "message": "Parse error"},
  }
  if null_id:
    response["id"] = None
  return response


def is_acceptable_malformed_id_error_response(value: object) -> bool:
  """Return ``True`` when ``value`` is an acceptable malformed-id error response. (R-7.2-h)

  Accepts an error response to an unreadable-id request: ``jsonrpc`` is exactly
  ``"2.0"``, it carries a structurally valid ``error`` object, and ``id`` may be a
  string, an integer, ``null``, or omitted entirely. This deliberately relaxes S03's
  strict id-echo rule (string/int/omitted) to also allow the ``null`` form the transport
  layer explicitly sanctions for this case.
  """
  if not isinstance(value, dict):
    return False
  if value.get("jsonrpc") != "2.0":
    return False
  if "id" in value:
    id_ = value["id"]
    # ``bool`` is a subclass of ``int`` — exclude it so ``True``/``False`` are not ids.
    if not (id_ is None or isinstance(id_, str) or (isinstance(id_, int) and not isinstance(id_, bool))):
      return False
  error = value.get("error")
  if not isinstance(error, dict):
    return False
  code = error.get("code")
  if not (isinstance(code, int) and not isinstance(code, bool)):
    return False
  return isinstance(error.get("message"), str)
