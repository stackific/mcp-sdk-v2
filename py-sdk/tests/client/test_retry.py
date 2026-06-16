"""Conformance tests for the retrying client transport (C9, §7.5).

Covers every export of :mod:`mcp.client.retry`:

* :func:`is_retryable_error` — only transport-level failures are retryable.
* :func:`compute_backoff_ms` / :class:`RetryPolicy` — the exponential-with-jitter
  schedule, the cap, and the attempt budget.
* :class:`RetryTransport` — retryable vs non-retryable errors, success after N retries,
  max-attempts exhaustion, that a delivered protocol error is NOT retried, and the
  injected deterministic clock.
"""

import pytest

from mcp.client.retry import (
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_MAX_RETRIES,
  RetryPolicy,
  RetryTransport,
  compute_backoff_ms,
  is_retryable_error,
)
from mcp.client.transport import ClientTransport, ClientTransportError

REQUEST = {"jsonrpc": "2.0", "id": 1, "method": "ping"}
OK_RESPONSE = {"jsonrpc": "2.0", "id": 1, "result": {}}
ERROR_RESPONSE = {"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "nope"}}


class ScriptedTransport(ClientTransport):
  """A fake inner transport driven by a script of outcomes (responses or raised errors).

  Each :meth:`request` call pops the next scripted outcome: a ``dict`` is returned, a
  ``BaseException`` instance is raised. Records how many times it was called and whether
  it was closed.
  """

  def __init__(self, *outcomes):
    self._outcomes = list(outcomes)
    self.calls = 0
    self.closed = False

  def request(self, message: dict) -> dict:
    self.calls += 1
    if not self._outcomes:
      raise AssertionError("ScriptedTransport ran out of scripted outcomes")
    outcome = self._outcomes.pop(0)
    if isinstance(outcome, BaseException):
      raise outcome
    return outcome

  def close(self) -> None:
    self.closed = True


class _Clock:
  """A deterministic sleep recorder — records the seconds it was asked to sleep."""

  def __init__(self):
    self.slept = []

  def __call__(self, seconds: float) -> None:
    self.slept.append(seconds)


def _no_jitter_policy(**overrides) -> RetryPolicy:
  """A policy with jitter disabled for a deterministic backoff schedule."""
  defaults = dict(base_delay_ms=100.0, max_delay_ms=10_000.0, jitter_ratio=0.0)
  defaults.update(overrides)
  return RetryPolicy(**defaults)


class TestIsRetryableError:
  def test_transport_error_is_retryable(self):
    assert is_retryable_error(ClientTransportError("net down")) is True

  def test_other_exceptions_are_not_retryable(self):
    assert is_retryable_error(ValueError("bug")) is False
    assert is_retryable_error(RuntimeError("x")) is False
    assert is_retryable_error(KeyError("k")) is False


class TestComputeBackoffMs:
  def test_exponential_schedule_without_jitter(self):
    # attempt n waits base * 2**n.
    assert compute_backoff_ms(0, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0) == 100
    assert compute_backoff_ms(1, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0) == 200
    assert compute_backoff_ms(2, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0) == 400
    assert compute_backoff_ms(3, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0) == 800

  def test_delay_is_capped_at_max(self):
    # 100 * 2**10 = 102_400, capped to 1_000.
    assert compute_backoff_ms(10, base_delay_ms=100, max_delay_ms=1_000, jitter_ratio=0) == 1_000

  def test_jitter_adds_bounded_amount(self):
    # With rand() == 1.0 and ratio 0.5: capped + capped*0.5*1.0 == 1.5 * capped.
    got = compute_backoff_ms(0, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0.5, rand=lambda: 1.0)
    assert got == pytest.approx(150.0)
    # With rand() == 0.0 jitter contributes nothing.
    got0 = compute_backoff_ms(0, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0.5, rand=lambda: 0.0)
    assert got0 == pytest.approx(100.0)

  def test_jitter_stays_within_ratio_bound(self):
    # For any rand draw in [0,1), the delay lies in [capped, capped*(1+ratio)).
    for draw in (0.0, 0.25, 0.5, 0.99):
      got = compute_backoff_ms(0, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0.3, rand=lambda d=draw: d)
      assert 100.0 <= got < 100.0 * 1.3 + 1e-9

  def test_negative_attempt_raises(self):
    with pytest.raises(ValueError):
      compute_backoff_ms(-1)


class TestRetryPolicy:
  def test_defaults_match_constants(self):
    p = RetryPolicy()
    assert p.max_retries == DEFAULT_MAX_RETRIES
    assert p.base_delay_ms == DEFAULT_BASE_DELAY_MS
    assert p.max_delay_ms == DEFAULT_MAX_DELAY_MS
    assert p.should_retry is is_retryable_error

  def test_backoff_ms_delegates_to_compute(self):
    p = _no_jitter_policy(base_delay_ms=50)
    assert p.backoff_ms(0) == 50
    assert p.backoff_ms(2) == 200


class TestRetryTransportSuccess:
  def test_success_on_first_attempt_no_sleep(self):
    inner = ScriptedTransport(OK_RESPONSE)
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(), sleep=clock)
    assert rt.request(REQUEST) == OK_RESPONSE
    assert inner.calls == 1
    assert clock.slept == []  # no retry → no backoff

  def test_success_after_n_retries(self):
    # Two transient failures, then success — three attempts total, two backoffs.
    inner = ScriptedTransport(
      ClientTransportError("drop1"),
      ClientTransportError("drop2"),
      OK_RESPONSE,
    )
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(base_delay_ms=100), sleep=clock)
    assert rt.request(REQUEST) == OK_RESPONSE
    assert inner.calls == 3
    # Backoff schedule: after attempt 0 → 100ms → 0.1s; after attempt 1 → 200ms → 0.2s.
    assert clock.slept == [0.1, 0.2]


class TestRetryTransportRetryability:
  def test_non_retryable_error_propagates_immediately(self):
    inner = ScriptedTransport(ValueError("programming bug"))
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(), sleep=clock)
    with pytest.raises(ValueError):
      rt.request(REQUEST)
    assert inner.calls == 1  # not retried
    assert clock.slept == []

  def test_delivered_protocol_error_is_not_retried(self):
    # A delivered JSON-RPC error response is returned as-is, NOT retried (§7.5).
    inner = ScriptedTransport(ERROR_RESPONSE)
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(), sleep=clock)
    assert rt.request(REQUEST) == ERROR_RESPONSE
    assert inner.calls == 1
    assert clock.slept == []

  def test_delivered_protocol_error_after_transient_failure(self):
    # A transient failure is retried; the delivered error that follows is returned.
    inner = ScriptedTransport(ClientTransportError("drop"), ERROR_RESPONSE)
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(), sleep=clock)
    assert rt.request(REQUEST) == ERROR_RESPONSE
    assert inner.calls == 2
    assert clock.slept == [0.1]


class TestRetryTransportExhaustion:
  def test_max_attempts_exhaustion_raises_last_error(self):
    # max_retries=2 → 3 total attempts; all fail → the last error is re-raised.
    last = ClientTransportError("final")
    inner = ScriptedTransport(
      ClientTransportError("first"),
      ClientTransportError("second"),
      last,
    )
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(max_retries=2, base_delay_ms=100), sleep=clock)
    with pytest.raises(ClientTransportError) as exc:
      rt.request(REQUEST)
    assert exc.value is last  # the *last* failure surfaces
    assert inner.calls == 3
    # Two backoffs between the three attempts (none after the last).
    assert clock.slept == [0.1, 0.2]

  def test_zero_retries_means_single_attempt(self):
    inner = ScriptedTransport(ClientTransportError("once"))
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(max_retries=0), sleep=clock)
    with pytest.raises(ClientTransportError):
      rt.request(REQUEST)
    assert inner.calls == 1
    assert clock.slept == []


class TestRetryTransportObservability:
  def test_on_retry_callback_fires_per_retry(self):
    events = []
    inner = ScriptedTransport(ClientTransportError("a"), ClientTransportError("b"), OK_RESPONSE)
    rt = RetryTransport(
      inner,
      _no_jitter_policy(base_delay_ms=100),
      sleep=lambda _s: None,
      on_retry=lambda attempt, err, delay: events.append((attempt, str(err), delay)),
    )
    assert rt.request(REQUEST) == OK_RESPONSE
    assert events == [(0, "a", 100.0), (1, "b", 200.0)]

  def test_custom_should_retry_policy(self):
    # A policy that retries ValueError but not ClientTransportError.
    policy = RetryPolicy(
      max_retries=3,
      base_delay_ms=10,
      jitter_ratio=0.0,
      should_retry=lambda e: isinstance(e, ValueError),
    )
    inner = ScriptedTransport(ValueError("retry me"), OK_RESPONSE)
    rt = RetryTransport(inner, policy, sleep=lambda _s: None)
    assert rt.request(REQUEST) == OK_RESPONSE
    assert inner.calls == 2

  def test_injected_rand_drives_jitter_deterministically(self):
    # jitter_ratio 0.5 with rand()==1.0 → 1.5x the base delay → sleep 0.15s.
    inner = ScriptedTransport(ClientTransportError("drop"), OK_RESPONSE)
    clock = _Clock()
    policy = RetryPolicy(max_retries=3, base_delay_ms=100, max_delay_ms=10_000, jitter_ratio=0.5)
    rt = RetryTransport(inner, policy, sleep=clock, rand=lambda: 1.0)
    assert rt.request(REQUEST) == OK_RESPONSE
    assert clock.slept == [pytest.approx(0.15)]


class TestRetryTransportPlumbing:
  def test_properties_expose_inner_and_policy(self):
    inner = ScriptedTransport(OK_RESPONSE)
    policy = _no_jitter_policy()
    rt = RetryTransport(inner, policy)
    assert rt.inner is inner
    assert rt.policy is policy

  def test_default_policy_when_none(self):
    rt = RetryTransport(ScriptedTransport(OK_RESPONSE))
    assert isinstance(rt.policy, RetryPolicy)
    assert rt.policy.max_retries == DEFAULT_MAX_RETRIES

  def test_close_delegates_to_inner(self):
    inner = ScriptedTransport(OK_RESPONSE)
    rt = RetryTransport(inner)
    rt.close()
    assert inner.closed is True

  def test_is_a_client_transport(self):
    assert isinstance(RetryTransport(ScriptedTransport(OK_RESPONSE)), ClientTransport)


class _EventInner(ClientTransport):
  """A fake inner exposing the *optional* event surface the Client probes for.

  Mirrors the methods :class:`~mcp.client.client.Client` looks up by name on a transport:
  ``set_on_message`` (inbound interim + server→client routing), ``send`` (server→client
  reply / one-way notification), ``on_error`` (receiver-side fault registration), and
  ``open_subscription`` (§10). Records what it was asked to do so a wrapper can be checked
  for faithful forwarding. This is the Python analog of the TS ``FakeInner``, whose
  ``onMessage``/``send``/``onClose`` the retry wrapper must keep live across the inner.
  """

  def __init__(self):
    self.on_message = None
    self.sent = []
    self.error_handlers = []
    self.subscriptions = []
    self.closed = False

  def request(self, message: dict) -> dict:  # pragma: no cover — not exercised here
    return OK_RESPONSE

  def set_on_message(self, callback) -> None:
    self.on_message = callback

  def send(self, message: dict) -> None:
    self.sent.append(message)

  def on_error(self, handler):
    self.error_handlers.append(handler)
    return lambda: self.error_handlers.remove(handler)

  def open_subscription(self, message: dict, on_ready):
    self.subscriptions.append((message, on_ready))
    return ("sub", message)

  def close(self) -> None:
    self.closed = True


class TestRetryTransportEventSurfacePassthrough:
  """The wrapper forwards the optional event surface to its inner (TS stable surface).

  The TS ``createRetryingTransport`` keeps ``onMessage``/``send``/``onError`` live across
  reconnects so the ``Client`` never re-registers. The Python ``Client`` instead probes
  the transport for these methods, so :class:`RetryTransport` must forward each to the
  inner — otherwise wrapping a transport for retry would silently break inbound routing,
  server→client replies, notifications, and subscriptions.
  """

  def test_set_on_message_is_forwarded_to_inner(self):
    inner = _EventInner()
    rt = RetryTransport(inner)

    def tap(_frame):  # the Client's _on_inbound, in spirit
      pass

    rt.set_on_message(tap)
    assert inner.on_message is tap  # the inbound tap reached the live inner

  def test_send_is_forwarded_to_inner(self):
    # Mirrors the TS "routes future sends to the inner": a server→client reply / one-way
    # notification the Client emits via send() must reach the inner transport.
    inner = _EventInner()
    rt = RetryTransport(inner)
    reply = {"jsonrpc": "2.0", "id": 7, "result": {}}
    rt.send(reply)
    assert inner.sent == [reply]

  def test_on_error_registration_is_forwarded_and_unsubscribable(self):
    inner = _EventInner()
    rt = RetryTransport(inner)

    def handler(_e):
      pass

    unsubscribe = rt.on_error(handler)
    assert inner.error_handlers == [handler]  # registration reached the inner
    unsubscribe()
    assert inner.error_handlers == []  # the inner's unsubscribe was returned and works

  def test_open_subscription_is_forwarded_to_inner(self):
    inner = _EventInner()
    rt = RetryTransport(inner)
    msg = {"jsonrpc": "2.0", "id": 1, "method": "subscriptions/listen", "params": {}}
    ready = lambda: None
    handle = rt.open_subscription(msg, ready)
    assert inner.subscriptions == [(msg, ready)]
    assert handle == ("sub", msg)  # the inner's handle is returned verbatim

  def test_set_on_message_is_noop_when_inner_lacks_it(self):
    # A request/response-only inner delivers no interim frames; forwarding is a safe no-op.
    rt = RetryTransport(ScriptedTransport(OK_RESPONSE))
    rt.set_on_message(lambda _f: None)  # must not raise

  def test_on_error_returns_noop_unsubscribe_when_inner_lacks_it(self):
    # Without an inner on_error, callers still get a callable unsubscribe (no special-casing).
    rt = RetryTransport(ScriptedTransport(OK_RESPONSE))
    unsubscribe = rt.on_error(lambda _e: None)
    assert callable(unsubscribe)
    unsubscribe()  # must not raise

  def test_send_raises_when_inner_lacks_send(self):
    # The wrapper hides nothing: a missing send() surfaces the same failure as the bare inner.
    rt = RetryTransport(ScriptedTransport(OK_RESPONSE))
    with pytest.raises(AttributeError):
      rt.send({"jsonrpc": "2.0", "method": "notifications/cancelled"})

  def test_open_subscription_raises_when_inner_lacks_it(self):
    rt = RetryTransport(ScriptedTransport(OK_RESPONSE))
    with pytest.raises(AttributeError):
      rt.open_subscription({"jsonrpc": "2.0", "id": 1, "method": "subscriptions/listen"}, lambda: None)

  def test_request_passthrough_still_retries_over_event_inner(self):
    # The retry semantics are unaffected by the event surface: a transient failure on an
    # event-capable inner is still retried (the inner exposes both request() and send()).
    class FlakyEventInner(_EventInner):
      def __init__(self, *outcomes):
        super().__init__()
        self._outcomes = list(outcomes)
        self.calls = 0

      def request(self, message: dict) -> dict:
        self.calls += 1
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, BaseException):
          raise outcome
        return outcome

    inner = FlakyEventInner(ClientTransportError("drop"), OK_RESPONSE)
    clock = _Clock()
    rt = RetryTransport(inner, _no_jitter_policy(base_delay_ms=100), sleep=clock)
    assert rt.request(REQUEST) == OK_RESPONSE
    assert inner.calls == 2
    assert clock.slept == [0.1]
    # …and the event surface on the same wrapper still forwards.
    rt.set_on_message(lambda _f: None)
    assert inner.on_message is not None
