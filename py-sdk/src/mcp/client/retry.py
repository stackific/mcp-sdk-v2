"""C9 — a retrying :class:`~mcp.client.transport.ClientTransport` wrapper.

The TypeScript original (``ts-sdk/src/client/retry.ts``) wraps an *event-based*,
reconnecting ``Transport`` and rebuilds the inner transport with exponential backoff
when it drops uncleanly. The Python client transport is **synchronous** — a single
``request(message) -> response`` call (:class:`mcp.client.transport.ClientTransport`) —
so the Python port models the same backoff/attempt policy synchronously: it wraps an
inner :class:`~mcp.client.transport.ClientTransport` and *retries the request itself*
with exponential backoff and jitter when the channel fails transiently.

What is and is not retried (§7.5):

* A :class:`~mcp.client.transport.ClientTransportError` is a *transport-level* channel
  failure (network error, non-JSON body, dropped connection). It is retryable up to
  ``max_retries`` additional attempts.
* A *delivered* JSON-RPC error response is a normal, fully delivered protocol message —
  it is returned to the caller as-is and is **never** retried. (A protocol error means
  the request reached the server and was answered; replaying it would be wrong.)

Backoff: attempt ``n`` (0-based) waits ``min(max_delay_ms, base_delay_ms * 2**n)``
milliseconds, optionally perturbed by jitter in ``[0, jitter_ratio]`` of that delay.
A ``sleep`` and an RNG are injectable so tests are fully deterministic (no real time,
no real randomness).

Stable surface across the inner: the TS wrapper presents the same ``onMessage`` /
``onError`` / ``onClose`` / ``send`` registration to the ``Client`` regardless of which
inner is live (ts-sdk/src/client/retry.ts L126–L152). The Python ``Client`` has no
message pump and instead *probes* the transport for the optional methods it uses —
``set_on_message`` (inbound interim + server→client routing), ``send`` (server→client
reply / one-way notification), and ``open_subscription`` (§10). So :class:`RetryTransport`
**forwards** each of those to its inner transport (and only when the inner provides it),
keeping the server→client path live through the wrapper exactly as the TS wrapper does.
"""

from __future__ import annotations

import time as _time
from collections.abc import Callable
from dataclasses import dataclass

from mcp.client.transport import ClientTransport, ClientTransportError

__all__ = [
  "DEFAULT_BASE_DELAY_MS",
  "DEFAULT_JITTER_RATIO",
  "DEFAULT_MAX_DELAY_MS",
  "DEFAULT_MAX_RETRIES",
  "RetryPolicy",
  "RetryTransport",
  "compute_backoff_ms",
  "is_retryable_error",
]

#: Maximum number of *additional* attempts after the first (default 5). Total attempts
#: is therefore ``max_retries + 1``. The TS wrapper defaults to ``Infinity`` reconnects;
#: a synchronous request wrapper must bound the loop, so a finite default is used.
DEFAULT_MAX_RETRIES = 5
#: Base backoff delay in ms (matches the TS ``baseDelayMs`` default of 250).
DEFAULT_BASE_DELAY_MS = 250.0
#: Maximum backoff delay in ms (matches the TS ``maxDelayMs`` default of 10 000).
DEFAULT_MAX_DELAY_MS = 10_000.0
#: Fraction of the computed delay added as random jitter, in ``[0, jitter_ratio]``.
#: ``0`` disables jitter (giving the exact ``base * 2**n`` schedule, capped).
DEFAULT_JITTER_RATIO = 0.0


def is_retryable_error(error: BaseException) -> bool:
  """Return ``True`` when ``error`` is a transport-level failure worth retrying.

  Only a :class:`~mcp.client.transport.ClientTransportError` (the channel-failure type)
  is retryable. Every other exception — including programming errors and, crucially, a
  *delivered* JSON-RPC error response surfaced by a higher layer — is propagated
  unchanged. (§7.5)
  """
  return isinstance(error, ClientTransportError)


def compute_backoff_ms(
  attempt: int,
  *,
  base_delay_ms: float = DEFAULT_BASE_DELAY_MS,
  max_delay_ms: float = DEFAULT_MAX_DELAY_MS,
  jitter_ratio: float = DEFAULT_JITTER_RATIO,
  rand: Callable[[], float] | None = None,
) -> float:
  """Compute the backoff delay (ms) before the retry following a failed ``attempt``.

  ``attempt`` is 0-based: the wait *after* the first failure (attempt 0) is
  ``base_delay_ms``; after the second (attempt 1) ``base_delay_ms * 2``; and so on,
  each capped at ``max_delay_ms`` (matching the TS ``min(maxDelayMs, baseDelayMs *
  2 ** attempts)``).

  When ``jitter_ratio > 0`` a random amount in ``[0, jitter_ratio * capped]`` is added,
  drawn from ``rand`` (a 0-arg callable returning a float in ``[0, 1)``; defaults to
  :func:`random.random`). Jitter is applied *after* the cap, so a perturbed delay can
  exceed ``max_delay_ms`` by at most ``jitter_ratio``.

  :raises ValueError: when ``attempt`` is negative.
  """
  if attempt < 0:
    raise ValueError(f"attempt must be non-negative, got {attempt}")
  capped = min(max_delay_ms, base_delay_ms * (2 ** attempt))
  if jitter_ratio <= 0:
    return capped
  draw = rand if rand is not None else _default_rand
  return capped + capped * jitter_ratio * draw()


def _default_rand() -> float:
  """Lazily import :func:`random.random` so the module has no import-time RNG cost."""
  import random

  return random.random()


@dataclass(frozen=True)
class RetryPolicy:
  """The retry/backoff policy: how many attempts, the backoff schedule, and what retries.

  All timing is in milliseconds. ``should_retry`` decides retryability per exception
  (defaults to :func:`is_retryable_error`); override it to broaden or narrow the set of
  retryable failures without subclassing :class:`RetryTransport`.
  """

  #: Maximum *additional* attempts after the first; total attempts is ``max_retries + 1``.
  max_retries: int = DEFAULT_MAX_RETRIES
  #: Base backoff delay in ms.
  base_delay_ms: float = DEFAULT_BASE_DELAY_MS
  #: Maximum backoff delay in ms (the per-attempt cap).
  max_delay_ms: float = DEFAULT_MAX_DELAY_MS
  #: Jitter fraction in ``[0, jitter_ratio]`` added to each capped delay; ``0`` disables.
  jitter_ratio: float = DEFAULT_JITTER_RATIO
  #: Predicate deciding whether a raised exception is retryable.
  should_retry: Callable[[BaseException], bool] = is_retryable_error

  def backoff_ms(self, attempt: int, *, rand: Callable[[], float] | None = None) -> float:
    """Delay (ms) before the retry following 0-based failed ``attempt`` (see
    :func:`compute_backoff_ms`)."""
    return compute_backoff_ms(
      attempt,
      base_delay_ms=self.base_delay_ms,
      max_delay_ms=self.max_delay_ms,
      jitter_ratio=self.jitter_ratio,
      rand=rand,
    )


class RetryTransport(ClientTransport):
  """Wrap a :class:`~mcp.client.transport.ClientTransport`, retrying transient failures.

  Each :meth:`request` call is attempted up to ``max_retries + 1`` times. A
  :class:`~mcp.client.transport.ClientTransportError` (or any exception the policy deems
  retryable) triggers an exponential backoff sleep, then a retry; the policy decides the
  schedule. A *delivered* response — whether a success or a JSON-RPC error envelope — is
  returned to the caller immediately and is never retried (§7.5). Exhausting the
  attempts re-raises the last transport error so the caller never silently loses it.

  ``sleep`` (a ``Callable[[float], None]`` taking seconds) and ``rand`` (a 0-arg jitter
  source) are injectable for deterministic tests; they default to :func:`time.sleep` and
  :func:`random.random`.
  """

  #: Stable machine-readable code for programmatic handling, mirroring the inner type.
  code = "CLIENT_TRANSPORT_ERROR"

  def __init__(
    self,
    inner: ClientTransport,
    policy: RetryPolicy | None = None,
    *,
    sleep: Callable[[float], None] | None = None,
    rand: Callable[[], float] | None = None,
    on_retry: Callable[[int, BaseException, float], None] | None = None,
  ) -> None:
    """Wrap ``inner`` with the given ``policy`` (defaults to :class:`RetryPolicy`).

    :param sleep: invoked with the backoff in **seconds** between attempts; defaults to
      :func:`time.sleep`. Inject a no-op (or a recorder) to make tests deterministic.
    :param rand: 0-arg jitter source returning a float in ``[0, 1)``; defaults to
      :func:`random.random`.
    :param on_retry: optional observer invoked as ``on_retry(attempt, error, delay_ms)``
      *before* each backoff sleep (``attempt`` is the 0-based index of the failed try).
    """
    self._inner = inner
    self._policy = policy if policy is not None else RetryPolicy()
    self._sleep = sleep if sleep is not None else _time.sleep
    self._rand = rand
    self._on_retry = on_retry

  @property
  def policy(self) -> RetryPolicy:
    """The active retry policy."""
    return self._policy

  @property
  def inner(self) -> ClientTransport:
    """The wrapped inner transport."""
    return self._inner

  def request(self, message: dict) -> dict:
    """Send ``message`` through the inner transport, retrying transient failures.

    :returns: the response envelope (a success or a delivered JSON-RPC error) — never
      retried once delivered.
    :raises ClientTransportError: the last transport failure, after all retries are
      exhausted.
    :raises BaseException: immediately, for any non-retryable error the inner raises.
    """
    last_error: BaseException | None = None
    # ``max_retries`` additional attempts means ``max_retries + 1`` total tries.
    total_attempts = self._policy.max_retries + 1
    for attempt in range(total_attempts):
      try:
        return self._inner.request(message)
      except BaseException as error:  # noqa: BLE001 — we re-raise non-retryable below
        last_error = error
        is_last = attempt >= total_attempts - 1
        if is_last or not self._policy.should_retry(error):
          raise
        delay_ms = self._policy.backoff_ms(attempt, rand=self._rand)
        if self._on_retry is not None:
          self._on_retry(attempt, error, delay_ms)
        self._sleep(delay_ms / 1000.0)
    # Unreachable: the loop either returns, re-raises, or exhausts and re-raises on the
    # final attempt. This guards against a zero-attempt misconfiguration.
    raise last_error if last_error is not None else ClientTransportError("retry transport made no attempts")

  def close(self) -> None:
    """Release the inner transport's resources."""
    self._inner.close()

  # ─── optional event surface passthrough ───────────────────────────────────────
  # The TS ``createRetryingTransport`` presents a *stable* handler surface
  # (``onMessage``/``onError``/``onClose``/``send``) to the :class:`~mcp.client.client.Client`
  # across inner reconnects (ts-sdk/src/client/retry.ts L130–L152). The Python ``Client``
  # has no message pump; instead it *probes* the transport for the optional methods it
  # needs and uses them when present: ``set_on_message`` (inbound interim/server→client
  # routing), ``send`` (replying to a server→client request, one-way notifications), and
  # ``open_subscription`` (§10). A wrapper that swallowed those would silently break the
  # server→client path the moment a transport were wrapped for retry. So this wrapper
  # forwards each optional method to the inner transport — and *only* when the inner
  # actually provides it, so wrapping a request/response-only transport adds nothing the
  # inner does not already do. This is the faithful Python analog of TS's stable surface
  # over the (here, single) inner. (§7.5, R-7.5-h)

  def set_on_message(self, callback: Callable[[dict], None] | None) -> None:
    """Forward the inbound-frame tap to the inner transport, when it supports one.

    Mirrors the TS wrapper presenting a stable ``onMessage`` registration over the inner.
    A no-op when the inner has no ``set_on_message`` (a pure request/response transport
    delivers no interim/server→client frames, so there is nothing to tap).
    """
    setter = getattr(self._inner, "set_on_message", None)
    if callable(setter):
      setter(callback)

  def send(self, message: dict) -> None:
    """Forward a one-way ``send`` (server→client reply, notification) to the inner.

    Used by the :class:`~mcp.client.client.Client` to answer a server→client request and
    to emit best-effort notifications (e.g. ``notifications/cancelled``). Forwarded only
    when the inner exposes ``send``; a transport without it never carries such frames.

    :raises AttributeError: if the inner transport exposes no ``send`` — the same failure
      a caller would see talking to that inner directly (the wrapper hides nothing).
    """
    sender = getattr(self._inner, "send", None)
    if not callable(sender):
      raise AttributeError("inner transport does not support send()")
    sender(message)

  def on_error(self, handler: Callable[[BaseException], object]) -> Callable[[], None]:
    """Forward receiver-side error registration to the inner, when it supports it.

    Mirrors the TS wrapper's stable ``onError`` registration. Returns the inner's
    unsubscribe callable; when the inner has no ``on_error`` (a request/response-only
    transport surfaces channel failures synchronously from :meth:`request` instead),
    returns a no-op unsubscribe so callers need not special-case the wrapper.
    """
    register = getattr(self._inner, "on_error", None)
    if callable(register):
      return register(handler)
    return lambda: None

  def open_subscription(self, message: dict, on_ready: Callable[[], None]) -> object:
    """Forward a ``subscriptions/listen`` open (§10) to the inner transport.

    :raises AttributeError: if the inner transport does not support subscriptions — the
      same failure the :class:`~mcp.client.client.Client` surfaces when a transport lacks
      ``open_subscription`` (the wrapper adds nothing a bare transport would not).
    """
    opener = getattr(self._inner, "open_subscription", None)
    if not callable(opener):
      raise AttributeError("inner transport does not support open_subscription()")
    return opener(message, on_ready)
