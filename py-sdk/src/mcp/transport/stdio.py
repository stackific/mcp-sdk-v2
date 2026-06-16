"""S13 — The stdio transport (§8).

A concrete :class:`~mcp.transport.contract.Transport` binding that carries the MCP
JSON-RPC message union over the standard streams of a client-launched subprocess:
client→server on the child's ``stdin``, server→client on the child's ``stdout``, with
free-form diagnostics on ``stderr`` that are NEVER parsed as protocol (R-8.1-a,
R-8.4-*).

The binding adds only framing and process-lifecycle rules; the protocol semantics are
unchanged and ride on the reused mechanisms:

* :class:`~mcp.transport.framing.NewlineFramer` / its :class:`FrameDecoder` —
  newline-delimited JSON, one message per UTF-8 line, no embedded newlines
  (R-8.2-a – R-8.2-h).
* :func:`~mcp.transport.framing.try_decode_message_unit` — UTF-8 + single-JSON-value
  + JSON-RPC validation; a malformed line is discarded, never fatal, and reading
  resynchronizes at the next newline (R-8.5-d – R-8.5-h).
* :class:`~mcp.transport.correlation.RequestCorrelator` — id-correlation/multiplexing
  and the fail-in-flight-on-disconnect behavior reused for restart/retry (R-8.6.4-b).
* :func:`~mcp.transport.contract.is_direction_permitted` — enforces that the client
  writes only requests/notifications to ``stdin`` and the server writes only
  responses/notifications to ``stdout`` (R-8.3-a, R-8.3-b, R-8.5-a, R-8.5-c).
* :func:`~mcp.protocol.negotiation.interpret_probe_response` /
  :class:`~mcp.protocol.negotiation.ProtocolSupportCache` — the §5.7 backward-compat
  probe, applied here because stdio has no header layer (R-8.7-d – R-8.7-h).

Adaptation to Python: the TypeScript original drives I/O with ``node:stream`` objects
whose ``'data'`` events *push* bytes into the decoder. Python byte streams
(:class:`io.BytesIO`, OS pipes) are *pull*-based, so the inbound side is modelled as an
explicit :meth:`StdioEndpoint.feed_bytes` sink that a reader pump calls when bytes
arrive; the outbound side is any object exposing ``write(bytes)``. Tests drive both ends
with :class:`io.BytesIO` rather than spawning a real OS process — exactly as the TS tests
use in-memory ``PassThrough`` streams.
"""

from __future__ import annotations

from typing import Callable, Protocol, runtime_checkable

from mcp.jsonrpc.framing import RequestId, classify_message
from mcp.protocol.discovery import SERVER_DISCOVER_METHOD
from mcp.protocol.negotiation import (
  ProbeOutcome,
  ProtocolSupportCache,
  ProtocolSupportDetermination,
  interpret_probe_response,
)
from mcp.transport.contract import (
  DirectionalKind,
  MessageDirection,
  Transport,
  TransportCloseInfo,
  TransportError,
  Unsubscribe,
  is_direction_permitted,
)
from mcp.transport.correlation import RequestCorrelator
from mcp.transport.framing import FrameDecoder, NewlineFramer, try_decode_message_unit

#: The carriage-return byte (``\r``, U+000D).
CARRIAGE_RETURN_BYTE = 0x0D

#: Whitespace bytes that make a framed line "blank" (and so ignorable, not malformed):
#: space, tab, CR, vertical tab, form-feed. (R-8.2-h)
_BLANK_BYTES = frozenset({0x20, 0x09, 0x0D, 0x0B, 0x0C})


# ─── Injectable subprocess surface ─────────────────────────────────────────────


@runtime_checkable
class ByteSink(Protocol):
  """The minimal write side the transport needs: any object accepting ``bytes``.

  :class:`io.BytesIO`, an OS pipe's write end, and ``sys.stdout.buffer`` all satisfy
  this. ``close`` is optional — closing the sink signals EOF to the peer (graceful
  shutdown). The :class:`Protocol` keeps the transport from depending on
  ``subprocess`` or any concrete stream type.
  """

  def write(self, data: bytes) -> object:
    """Write ``data`` to the sink."""

  def close(self) -> object:  # pragma: no cover — optional on a Protocol
    """Close the sink (signals EOF). Optional."""


@runtime_checkable
class ChildProcessLike(Protocol):
  """The minimal view of a child process the stdio client transport needs. (§8 topology)

  Modeled so the three streams can be in-memory :class:`io.BytesIO`-like objects in
  tests (no real OS process), while a real :class:`subprocess.Popen` structurally
  satisfies the same shape. ``stdin`` is the client→server byte sink, ``stdout`` the
  server→client byte source, and ``stderr`` an optional free-form diagnostic source that
  is never parsed as protocol (R-8.1-a, R-8.4-b).

  Because Python streams are pull-based, inbound ``stdout``/``stderr`` bytes are
  delivered into the transport by a pump that calls :meth:`StdioClientTransport.feed_bytes`
  / :meth:`StdioClientTransport.feed_stderr`; the structural shape below only needs the
  ``stdin`` sink, the ``exit_code`` snapshot, and a way to ``kill`` and observe ``exit``.
  """

  #: Client→server byte sink. Closing it signals graceful shutdown (EOF).
  stdin: ByteSink | None
  #: The process exit code once exited, else ``None``.
  exit_code: int | None

  def kill(self, signal: object | None = None) -> bool:
    """Forcibly signal the process. (R-8.6.3-a)"""

  def on_exit(self, listener: Callable[[int | None, object | None], None]) -> Unsubscribe:
    """Subscribe to the one-shot process-exit event (exit or signal)."""


#: A factory that (re)launches a fresh child process — used for restart. (R-8.6.4-a)
ChildProcessLauncher = Callable[[], ChildProcessLike]


# ─── Line helpers (§8.2) ────────────────────────────────────────────────────────


def is_blank_line(line: bytes) -> bool:
  """Return ``True`` when a framed line is empty or only whitespace bytes.

  Such a line is not a JSON-RPC message and is ignored, never treated as malformed.
  (R-8.2-h)
  """
  return all(byte in _BLANK_BYTES for byte in line)


def strip_trailing_carriage_return(line: bytes) -> bytes:
  """Strip a single trailing ``\\r`` so a ``\\r\\n`` terminator decodes like ``\\n``.

  The CR is not part of the message and MUST be removed before parsing. (R-8.2-f,
  R-8.2-g)
  """
  if line and line[-1] == CARRIAGE_RETURN_BYTE:
    return line[:-1]
  return line


# ─── Stream role enforcement (§8.3, §8.5) ───────────────────────────────────────


def directional_kind_of(message: dict) -> DirectionalKind:
  """Map a classified JSON-RPC ``message`` to its directionality kind (§7.4).

  Both response forms (``result-response``/``error-response``) collapse to
  ``"response"`` for the purposes of :func:`is_direction_permitted`.
  """
  kind = classify_message(message).kind
  if kind == "request":
    return "request"
  if kind == "notification":
    return "notification"
  return "response"


def assert_writable_direction(message: dict, direction: MessageDirection) -> None:
  """Assert ``message`` may be written in ``direction`` on this header-less wire.

  Raises :class:`TransportError` otherwise. (R-8.3-a, R-8.3-b, R-8.5-a, R-8.5-c)

  The client side passes ``"client-to-server"`` (only requests/notifications may go to
  ``stdin``; a response is rejected); the server side ``"server-to-client"`` (only
  responses/notifications may go to ``stdout``; a request is rejected). Because
  ``message`` is already a classified JSON-RPC message, non-MCP content can never reach
  this point — it is rejected at decode time instead.
  """
  kind = directional_kind_of(message)
  if not is_direction_permitted(kind, direction):
    channel = "stdin" if direction == "client-to-server" else "stdout"
    raise TransportError(
      f"a {kind} may not be written to {channel} ({direction}); only valid MCP "
      "messages of a permitted kind may be sent on this channel"
    )


# ─── Shared stdio endpoint ──────────────────────────────────────────────────────


class StdioEndpoint(Transport):
  """Common stdio plumbing for both endpoints (§8 framing + observable surface).

  Provides newline framing over a byte sink, a stateful decoder fed by
  :meth:`feed_bytes`, malformed-line tolerance, and the observable
  message/error/close surface of :class:`Transport`. Subclasses supply the concrete
  subprocess lifecycle (the client owns the child; the server observes its own
  ``stdin`` EOF).

  :param send_direction: the direction messages this endpoint *sends* may travel.
  :param outbound: the byte sink this endpoint writes framed messages to.
  """

  def __init__(self, *, send_direction: MessageDirection, outbound: ByteSink | None) -> None:
    self._framer = NewlineFramer()
    self.decoder: FrameDecoder = self._framer.create_decoder()
    self._send_direction = send_direction
    self.outbound = outbound
    self._message_handlers: list[Callable[[dict], None]] = []
    self._error_handlers: list[Callable[[TransportError], None]] = []
    self._close_handlers: list[Callable[[TransportCloseInfo], None]] = []
    # Buffered until a handler attaches — never dropped (no silent loss).
    self._inbox: list[dict] = []
    self._error_inbox: list[TransportError] = []
    self._closed = False
    self._close_info: TransportCloseInfo | None = None

  # ── sending ──
  def send(self, message: dict) -> None:
    if self._closed:
      # Never silently drop: a send on a closed channel is an observable failure.
      # (R-7.2-q, R-7.2-s)
      raise TransportError("cannot send on a closed stdio transport")
    # Enforce the stream-role direction before anything touches the wire
    # (R-8.3-a, R-8.3-b, R-8.5-a, R-8.5-c).
    assert_writable_direction(message, self._send_direction)
    if self.outbound is None:
      raise TransportError("stdio transport has no writable channel")
    # One compact UTF-8 JSON line terminated by a single ``\n``, no embedded newlines
    # (``json.dumps`` escapes any in-string ``\n``). (R-8.2-a – R-8.2-d)
    self.outbound.write(self._framer.encode(message))

  # ── receiving ──
  def feed_bytes(self, chunk: bytes) -> None:
    """Feed received ``stdout``/inbound bytes into the framing decoder.

    Each recovered line is dispatched; a malformed line is discarded as a
    transport-level error (surfaced via :meth:`on_error`) and reading continues at the
    next newline — the connection is never torn down. (R-8.5-d, R-8.5-e, R-8.5-h)
    """
    for unit in self.decoder.push(chunk):
      # An empty or whitespace-only line is not a message: ignore it rather than
      # treating it as malformed. (R-8.2-h)
      if is_blank_line(unit):
        continue
      # A receiver SHOULD tolerate a preceding ``\r`` (a ``\r\n`` terminator) and strip
      # it before parsing. (R-8.2-f, R-8.2-g)
      decoded = try_decode_message_unit(strip_trailing_carriage_return(unit))
      if decoded.ok:
        assert decoded.message is not None
        self._dispatch(decoded.message)
      else:
        # Malformed line: discard, surface a diagnostic, keep reading.
        # (R-8.5-d, R-8.5-e, R-8.5-f, R-8.5-h)
        assert decoded.error is not None
        self._dispatch_error(decoded.error)

  def _dispatch(self, message: dict) -> None:
    if not self._message_handlers:
      self._inbox.append(message)
      return
    for handler in list(self._message_handlers):
      handler(message)

  def _dispatch_error(self, error: TransportError) -> None:
    if not self._error_handlers:
      self._error_inbox.append(error)
      return
    for handler in list(self._error_handlers):
      handler(error)

  # ── observable surface ──
  def on_message(self, handler: Callable[[dict], None]) -> Unsubscribe:
    self._message_handlers.append(handler)
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

  @property
  def closed(self) -> bool:
    return self._closed

  def _mark_closed(self, info: TransportCloseInfo) -> None:
    """Mark the endpoint closed and notify ``on_close`` subscribers exactly once."""
    if self._closed:
      return
    self._closed = True
    self._close_info = info
    for handler in list(self._close_handlers):
      handler(info)
    self._close_handlers.clear()

  def close(self, reason: str | None = None) -> None:  # pragma: no cover — overridden
    raise NotImplementedError


# ─── StdioServerTransport ───────────────────────────────────────────────────────


class StdioServerTransport(StdioEndpoint):
  """The server side of a stdio connection (§8 server role).

  Reads client requests/notifications from ``stdin`` (pumped in via :meth:`feed_bytes`)
  and writes responses/notifications to ``stdout``. Enforces the server stream-role
  rule — it MUST NOT write a JSON-RPC request to ``stdout`` and MUST NOT write non-MCP
  content there; diagnostics belong on ``stderr`` (R-8.3-b, R-8.5-a, R-8.5-b).

  Graceful shutdown is observed when ``stdin`` reaches EOF (signalled by the host
  calling :meth:`notify_stdin_eof`), at which point the server SHOULD exit promptly
  (R-8.6.2-b); the server MAY also initiate shutdown by closing ``stdout`` (R-8.6.2-c)
  via :meth:`close`.

  :param stdout: byte sink for server→client messages (e.g. ``sys.stdout.buffer``).
  """

  def __init__(self, *, stdout: ByteSink | None = None) -> None:
    super().__init__(send_direction="server-to-client", outbound=stdout)

  def notify_stdin_eof(self, *, reason: str = "stdin EOF") -> None:
    """Signal that ``stdin`` reached EOF / closed — a clean close the host can observe.

    The server SHOULD exit promptly once its input ends. (R-8.6.2-b)
    """
    self._mark_closed(TransportCloseInfo(clean=True, reason=reason))

  def close(self, reason: str | None = None) -> None:
    """Server-initiated shutdown: close ``stdout`` and mark the endpoint closed.

    After this the host process exits. (R-8.6.2-c)
    """
    if self.closed:
      return
    closer = getattr(self.outbound, "close", None)
    if callable(closer):
      closer()
    self._mark_closed(TransportCloseInfo(clean=True, reason=reason or "server closed stdout"))


# ─── StdioClientTransport ───────────────────────────────────────────────────────


class StdioClientTransport(StdioEndpoint):
  """The client side of a stdio connection (§8 client role).

  Launches/holds a server subprocess, writes requests/notifications to its ``stdin``,
  and reads responses/notifications from its ``stdout`` (delivered via
  :meth:`feed_bytes`). Responsibilities beyond framing:

  * Stream-role enforcement: only requests/notifications, and only valid MCP messages,
    may go to ``stdin`` (R-8.3-a, R-8.5-c).
  * ``stderr`` handling: captured/forwarded/ignored, never parsed as protocol, never
    assumed to mean an error (R-8.4-c, R-8.4-d, R-8.4-e, R-8.1-a).
  * Graceful shutdown: close ``stdin`` (EOF), await exit, force-terminate on overstay
    (R-8.6.2-a, R-8.6.3-a).
  * Unexpected-exit restart (SHOULD) and lost in-flight retry (MAY) (R-8.6.4-a,
    R-8.6.4-b).
  * The §5.7 probe via :meth:`probe_protocol` (R-8.7-d – R-8.7-h).

  :param child: an already-launched child process, OR
  :param launcher: a factory that launches a fresh child (REQUIRED to enable
    restart-on-unexpected-exit, R-8.6.4-a); when supplied without ``child`` the first
    child is launched immediately.
  :param restart_on_unexpected_exit: when ``True`` an unexpected child exit triggers an
    automatic restart via ``launcher`` (R-8.6.4-a SHOULD). Defaults to ``True`` when a
    ``launcher`` is supplied, ``False`` otherwise.
  :param on_inflight_lost: invoked with the ids of in-flight requests lost on an
    unexpected exit, so the caller MAY retry them against the fresh process (R-8.6.4-b).
  """

  #: The method a ``server/discover`` probe carries (for building the probe request).
  probe_method = SERVER_DISCOVER_METHOD

  def __init__(
    self,
    *,
    child: ChildProcessLike | None = None,
    launcher: ChildProcessLauncher | None = None,
    restart_on_unexpected_exit: bool | None = None,
    on_inflight_lost: Callable[[list[RequestId]], None] | None = None,
  ) -> None:
    resolved = child if child is not None else (launcher() if launcher is not None else None)
    if resolved is None:
      raise TransportError("StdioClientTransport requires a `child` or a `launcher`")
    super().__init__(send_direction="client-to-server", outbound=resolved.stdin)
    self.child = resolved
    self._launcher = launcher
    self._restart_on_unexpected_exit = (
      restart_on_unexpected_exit if restart_on_unexpected_exit is not None else launcher is not None
    )
    self._on_inflight_lost = on_inflight_lost

    #: Sender-side correlator; reused across a restart so ids may be retried.
    self.correlator = RequestCorrelator()
    #: Per-endpoint protocol-support cache for the §5.7 probe. (R-5.7-e)
    self.support_cache = ProtocolSupportCache()

    self._stderr_chunks: list[bytes] = []
    self._restart_handlers: list[Callable[[ChildProcessLike], None]] = []
    #: ``True`` while a client-initiated graceful close is in progress.
    self._closing = False
    self._exit_unsub: Unsubscribe | None = None
    self._wire_child(resolved)

  # ── child wiring ──
  def _wire_child(self, child: ChildProcessLike) -> None:
    """Subscribe to the child's ``exit`` event."""
    self._exit_unsub = child.on_exit(lambda code, signal: self._handle_exit(code, signal))

  def feed_stderr(self, chunk: bytes) -> None:
    """Capture a chunk of the child's ``stderr``.

    ``stderr`` is free-form diagnostics — captured but NEVER decoded as protocol and
    never treated as an error. (R-8.1-a, R-8.4-b, R-8.4-c, R-8.4-d)
    """
    self._stderr_chunks.append(bytes(chunk))

  @property
  def captured_stderr(self) -> bytes:
    """A copy of the captured ``stderr`` bytes (the client MAY forward/ignore)."""
    return b"".join(self._stderr_chunks)

  def on_restart(self, handler: Callable[[ChildProcessLike], None]) -> Unsubscribe:
    """Register a handler invoked with the fresh child after a restart."""
    self._restart_handlers.append(handler)

    def _unsub() -> None:
      if handler in self._restart_handlers:
        self._restart_handlers.remove(handler)

    return _unsub

  # ── §5.7 probe ──
  def probe_protocol(self, endpoint_key: str, response: object) -> ProbeOutcome:
    """Classify a ``server/discover`` probe response per §5.7 and cache the result.

    (R-8.7-d, R-8.7-h)

    The three outcomes are interpreted by the reused
    :func:`~mcp.protocol.negotiation.interpret_probe_response`:

    * ``supported`` / ``unsupported-version`` → the server speaks this family; the
      client selects a revision and continues, and MUST NOT fall back to a
      session-establishing handshake on the ``-32004`` outcome (R-8.7-e).
    * ``not-this-protocol`` (other error / no response) → a client with a
      handshake-based counterpart MAY fall back; that fallback MUST NOT be keyed to one
      specific error code (R-8.7-f, R-8.7-g).

    :param endpoint_key: opaque per-endpoint key for the support cache.
    :param response: the probe response, or ``None`` for a timeout.
    """
    outcome = interpret_probe_response(response)
    if outcome.kind == "not-this-protocol":
      determination = ProtocolSupportDetermination(False)
    else:
      versions = outcome.supported_versions if outcome.kind == "supported" else outcome.supported
      determination = ProtocolSupportDetermination(True, supported_versions=versions)
    self.support_cache.set(endpoint_key, determination)
    return outcome

  def deliver_response(self, response: dict) -> bool:
    """Deliver an inbound response to the correlator; ``True`` if it matched a request.

    A convenience for callers wiring :meth:`on_message` to the reused
    :class:`~mcp.transport.correlation.RequestCorrelator`.
    """
    return self.correlator.deliver(response)

  # ── shutdown ──
  def close(self, reason: str | None = None) -> None:
    """Graceful shutdown (R-8.6.2-a): close the child's ``stdin`` (EOF) then await exit.

    Step 1 closes ``stdin`` → the only portable graceful signal. If the child has
    already exited the close is finished immediately; otherwise the pending in-flight
    requests are left to the child's exit event, which finalises the close. A host that
    needs the force-terminate-on-overstay escalation (R-8.6.3-a) drives it by calling
    :meth:`force_terminate` after its grace period elapses; this keeps the transport
    free of a timer/event-loop dependency.

    The close is observable via :meth:`on_close` with ``clean=True``.
    """
    if self._closing or self.closed:
      return
    self._closing = True
    self._reason = reason
    # Step 1: close stdin → EOF. (R-8.6.2-a step 1)
    closer = getattr(self.child.stdin, "close", None)
    if callable(closer):
      closer()
    # Step 2: if the process already exited, finish now; else the exit event will.
    if self._already_exited():
      self._finish_close(reason)

  def force_terminate(self) -> None:
    """Forcibly terminate the child when it overstays the grace period. (R-8.6.3-a)

    Escalates ``SIGTERM`` then ``SIGKILL`` (POSIX example); on a fake child the kill is
    observed and may drive a synthetic exit.
    """
    self.child.kill("SIGTERM")
    if not self._already_exited():
      self.child.kill("SIGKILL")

  def _already_exited(self) -> bool:
    return self.child.exit_code is not None

  def _finish_close(self, reason: str | None) -> None:
    self._mark_closed(TransportCloseInfo(clean=True, reason=reason or "client closed stdin (EOF)"))

  def _handle_exit(self, code: int | None, _signal: object | None) -> None:
    """Handle a child ``exit`` event.

    A planned exit (during :meth:`close`) is a clean close. An *unexpected* exit fails
    every in-flight request (so no caller hangs) and, when a launcher is configured and
    restart is enabled, launches a fresh process and re-wires the streams. (R-8.6.4-a,
    R-8.6.4-b)
    """
    if self._closing or self.closed:
      # Expected exit as part of a graceful close — finalise if not already.
      if not self.closed and self._already_exited():
        self._finish_close(getattr(self, "_reason", None))
      return
    # Unexpected exit: fail in-flight so callers observe the loss, then capture the lost
    # ids for an optional retry against the fresh process.
    lost = self.correlator.fail_all(
      TransportError(f"stdio server exited unexpectedly (code {code})")
    )
    if self._on_inflight_lost is not None:
      self._on_inflight_lost(lost)

    if self._restart_on_unexpected_exit and self._launcher is not None:
      self._restart(self._launcher)
      return
    # No restart configured: surface an abrupt disconnection. (R-7.5-a)
    self._mark_closed(
      TransportCloseInfo(clean=False, reason=f"process exited unexpectedly (code {code})")
    )

  def _restart(self, launcher: ChildProcessLauncher) -> None:
    """Restart the subprocess: detach the old wiring, launch a fresh child, re-wire.

    The protocol is stateless, so the fresh process needs no replay — each subsequent
    request carries its full ``_meta``. A fresh decoder is created so no partial bytes
    carry over. (R-8.6.4-a)
    """
    if self._exit_unsub is not None:
      self._exit_unsub()
    next_child = launcher()
    self.child = next_child
    self.outbound = next_child.stdin
    self.decoder = NewlineFramer().create_decoder()
    self._wire_child(next_child)
    for handler in list(self._restart_handlers):
      handler(next_child)
