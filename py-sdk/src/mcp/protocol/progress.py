"""Utilities: Progress & Cancellation (§15.1–§15.2).

Two cross-cutting utility mechanisms layered on any request:

* Out-of-band progress reporting via ``notifications/progress`` (§15.1).
* Request cancellation via ``notifications/cancelled`` (§15.2).

Both are optional, opt-in, fire-and-forget mechanisms. A peer that does not implement
either continues to operate correctly. (R-15-a)

Progress is request-scoped: notifications travel on the response stream of the request
whose ``_meta.progressToken`` opted in, before the final response. Cancellation is
same-direction-only: a party may cancel only requests it issued, never requests it
received.

The TypeScript SDK expresses the wire shapes as Zod schemas; this port translates each
schema into a ``is_valid_*`` predicate plus a matching ``build_*`` constructor (dicts in,
``bool`` / ``dict`` out), and ports the stateful helper classes faithfully.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import BeforeValidator, Field

from mcp._model import JsonNumber, McpModel, validates
from mcp.jsonrpc.payload import is_progress_token

#: Re-export so callers can validate a ``ProgressToken`` from this module directly. A
#: progress token is an opaque string or number; ``bool`` is rejected. (R-15.1.1-a)
is_valid_progress_token = is_progress_token


def _reject_bool(value: Any) -> Any:
  """Reject ``bool`` so ``True``/``False`` are not accepted as a string-or-number token/id."""
  if isinstance(value, bool):
    raise ValueError("expected a string or number, not a boolean")
  return value


#: An opaque ``string | number`` progress token / request id — booleans rejected, like the
#: TS ``ProgressTokenSchema`` / ``RequestIdSchema``. (R-15.1.1-a)
StringOrNumber = Annotated[str | int | float, BeforeValidator(_reject_bool)]


# ─── Method names ─────────────────────────────────────────────────────────────

#: Method name for the progress notification. (§15.1)
PROGRESS_NOTIFICATION_METHOD = "notifications/progress"

#: Method name for the cancellation notification. (§15.2)
CANCELLED_NOTIFICATION_METHOD = "notifications/cancelled"

#: The JSON-RPC version marker every notification envelope MUST carry. (§3)
JSONRPC_VERSION = "2.0"


def _is_number(value: object) -> bool:
  """Return ``True`` for an ``int`` or ``float`` that is not a ``bool``.

  ``progress`` / ``total`` accept either an integer or a floating-point value.
  (R-15.1.3-f, R-15.1.3-h)
  """
  return isinstance(value, (int, float)) and not isinstance(value, bool)


# ─── ProgressNotification (§15.1.3) ───────────────────────────────────────────

class ProgressNotificationParams(McpModel):
  """``notifications/progress`` params (§15.1.3) — the Python analogue of the TS
  ``ProgressNotificationParamsSchema``.

  ``progressToken`` (REQUIRED) correlates to the opted-in request; ``progress`` (REQUIRED)
  is a number that MUST strictly increase across successive notifications (monotonicity is
  enforced at runtime by :class:`ProgressTracker`); ``total`` / ``message`` are OPTIONAL.
  """

  progress_token: StringOrNumber
  progress: JsonNumber
  total: JsonNumber | None = None
  message: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_progress_notification_params(value: object) -> bool:
  """Return ``True`` for valid ``notifications/progress`` params. (§15.1.3)

  ``progressToken`` + ``progress`` REQUIRED; ``total`` (number) / ``message`` (string)
  OPTIONAL. (R-15.1.3-a/-d/-g/-j) See :class:`ProgressNotificationParams`.
  """
  return validates(ProgressNotificationParams, value)


def build_progress_notification_params(
  progress_token: str | int | float,
  progress: int | float,
  *,
  total: int | float | None = None,
  message: str | None = None,
  meta: dict | None = None,
) -> dict:
  """Build ``notifications/progress`` params; optional fields only when supplied. (§15.1.3)

  :raises ValueError: when ``progress_token`` is not a valid progress token, or when
    ``progress`` / ``total`` are not numbers.
  """
  if not is_progress_token(progress_token):
    raise ValueError("progressToken must be an opaque string or number (R-15.1.1-a)")
  if not _is_number(progress):
    raise ValueError("progress must be a number (R-15.1.3-d)")
  if total is not None and not _is_number(total):
    raise ValueError("total must be a number when present (R-15.1.3-g)")
  params: dict = {"progressToken": progress_token, "progress": progress}
  if total is not None:
    params["total"] = total
  if message is not None:
    params["message"] = message
  if meta is not None:
    params["_meta"] = meta
  return params


def is_valid_progress_notification(value: object) -> bool:
  """Return ``True`` for a full ``notifications/progress`` notification envelope. (§15.1)

  ``jsonrpc`` is exactly ``"2.0"``, ``method`` is :data:`PROGRESS_NOTIFICATION_METHOD`,
  and ``params`` is a valid progress-notification params object.
  """
  if not isinstance(value, dict):
    return False
  if value.get("jsonrpc") != JSONRPC_VERSION:
    return False
  if value.get("method") != PROGRESS_NOTIFICATION_METHOD:
    return False
  return is_valid_progress_notification_params(value.get("params"))


def build_progress_notification(
  progress_token: str | int | float,
  progress: int | float,
  *,
  total: int | float | None = None,
  message: str | None = None,
  meta: dict | None = None,
) -> dict:
  """Build a complete ``notifications/progress`` notification envelope. (§15.1)

  :raises ValueError: when the params are invalid (see
    :func:`build_progress_notification_params`).
  """
  return {
    "jsonrpc": JSONRPC_VERSION,
    "method": PROGRESS_NOTIFICATION_METHOD,
    "params": build_progress_notification_params(
      progress_token, progress, total=total, message=message, meta=meta
    ),
  }


# ─── CancelledNotification (§15.2.1) ──────────────────────────────────────────

def _is_request_id(value: object) -> bool:
  """Return ``True`` for a JSON-RPC request id — a string or a number (not ``bool``)."""
  if isinstance(value, str):
    return True
  return isinstance(value, (int, float)) and not isinstance(value, bool)


class CancelledNotificationParams(McpModel):
  """``notifications/cancelled`` params (§15.2.1) — the Python analogue of the TS
  ``CancelledNotificationParamsSchema``.

  ``requestId`` is OPTIONAL in the schema *shape* so a receiver tolerates malformed
  cancellations gracefully (R-15.2.2-f); when present it MUST be a string or number
  referencing an in-flight request the sender issued (R-15.2.1-a/-b). ``reason`` (OPTIONAL)
  is a human-readable string (R-15.2.1-c).
  """

  request_id: StringOrNumber | None = None
  reason: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_cancelled_notification_params(value: object) -> bool:
  """Return ``True`` for valid ``notifications/cancelled`` params. (§15.2.1)

  ``requestId`` OPTIONAL (string or number when present); ``reason`` OPTIONAL string. See
  :class:`CancelledNotificationParams`. (R-15.2.1-a/-b/-c, R-15.2.2-f)
  """
  return validates(CancelledNotificationParams, value)


def build_cancelled_notification_params(
  request_id: str | int | float | None = None,
  *,
  reason: str | None = None,
  meta: dict | None = None,
) -> dict:
  """Build ``notifications/cancelled`` params; optional fields only when supplied. (§15.2.1)

  :raises ValueError: when ``request_id`` is supplied but is not a string or number, or
    when ``reason`` is supplied but is not a string.
  """
  if request_id is not None and not _is_request_id(request_id):
    raise ValueError("requestId must be a string or number when present (R-15.2.1-a)")
  if reason is not None and not isinstance(reason, str):
    raise ValueError("reason must be a string when present (R-15.2.1-c)")
  params: dict = {}
  if request_id is not None:
    params["requestId"] = request_id
  if reason is not None:
    params["reason"] = reason
  if meta is not None:
    params["_meta"] = meta
  return params


def is_valid_cancelled_notification(value: object) -> bool:
  """Return ``True`` for a full ``notifications/cancelled`` notification envelope. (§15.2)

  ``jsonrpc`` is exactly ``"2.0"``, ``method`` is :data:`CANCELLED_NOTIFICATION_METHOD`,
  and ``params`` is a valid cancelled-notification params object.
  """
  if not isinstance(value, dict):
    return False
  if value.get("jsonrpc") != JSONRPC_VERSION:
    return False
  if value.get("method") != CANCELLED_NOTIFICATION_METHOD:
    return False
  return is_valid_cancelled_notification_params(value.get("params"))


def build_cancelled_notification(
  request_id: str | int | float | None = None,
  *,
  reason: str | None = None,
  meta: dict | None = None,
) -> dict:
  """Build a complete ``notifications/cancelled`` notification envelope. (§15.2)

  :raises ValueError: when the params are invalid (see
    :func:`build_cancelled_notification_params`).
  """
  return {
    "jsonrpc": JSONRPC_VERSION,
    "method": CANCELLED_NOTIFICATION_METHOD,
    "params": build_cancelled_notification_params(request_id, reason=reason, meta=meta),
  }


# ─── ProgressToken uniqueness key ─────────────────────────────────────────────

def _token_key(token: str | int | float) -> str:
  """Derive a typed string key distinguishing ``string`` from ``number`` tokens with the
  same textual representation — mirroring the in-flight tracker for request ids.
  (R-15.1.1-c)
  """
  return f"s:{token}" if isinstance(token, str) else f"n:{token}"


# ─── ProgressTracker ──────────────────────────────────────────────────────────

class ProgressTracker:
  """Tracks active progress tokens for a single sender, enforcing the uniqueness and
  monotonicity rules of §15.1.

  Rules enforced:

  * R-15.1.1-c — tokens MUST be unique across the sender's currently active requests.
  * R-15.1.1-d — receivers MUST treat the token as opaque (no content inspection).
  * R-15.1.3-e — ``progress`` MUST strictly increase across successive notifications.
  * R-15.1.4-g — MUST stop emitting progress once the operation reaches a terminal state.
  """

  def __init__(self) -> None:
    #: token-key → ``{"token": original, "last_progress": float}``.
    self._active: dict[str, dict] = {}

  def register(self, token: str | int | float) -> None:
    """Register ``token`` as active when a request carrying it is about to be sent.

    :raises ValueError: when ``token`` is already active — enforces R-15.1.1-c.
    """
    key = _token_key(token)
    if key in self._active:
      raise ValueError(
        f"Progress token {token!r} is already active; tokens must be unique across "
        "the sender's active requests (R-15.1.1-c)"
      )
    self._active[key] = {"token": token, "last_progress": float("-inf")}

  def complete(self, token: str | int | float) -> None:
    """Remove ``token`` from the active set once the operation reached a terminal state
    (final response sent or received). (R-15.1.4-g)

    Safe to call for a token that is not currently tracked.
    """
    self._active.pop(_token_key(token), None)

  def has(self, token: str | int | float) -> bool:
    """Return ``True`` when ``token`` is currently registered as active."""
    return _token_key(token) in self._active

  def is_monotonic(self, token: str | int | float, progress: int | float) -> bool:
    """Return ``True`` when ``progress`` is strictly greater than the last recorded value
    for ``token``, satisfying the monotonic-increase invariant. (R-15.1.3-e)

    Returns ``False`` for an unknown (not-yet-registered or already-completed) token.
    """
    entry = self._active.get(_token_key(token))
    if entry is None:
      return False
    return progress > entry["last_progress"]

  def record_progress(self, token: str | int | float, progress: int | float) -> None:
    """Record ``progress`` as the latest value for ``token`` after a monotonicity check
    has passed.

    :raises ValueError: when ``token`` is not currently active.
    """
    entry = self._active.get(_token_key(token))
    if entry is None:
      raise ValueError(f"Progress token {token!r} is not active; cannot record progress")
    entry["last_progress"] = progress

  @property
  def size(self) -> int:
    """Number of currently active progress tokens."""
    return len(self._active)

  @property
  def active_tokens(self) -> list:
    """Snapshot of all currently active tokens (original string/number values)."""
    return [entry["token"] for entry in self._active.values()]


# ─── ProgressRateLimiter ──────────────────────────────────────────────────────

class ProgressRateLimiter:
  """Per-token rate-limiter for ``notifications/progress`` emissions. (RC-3 / SHOULD)

  Implementations SHOULD throttle progress notifications to avoid flooding the transport.
  A sender may call :meth:`should_emit` before dispatching each notification; the limiter
  suppresses emissions that arrive within the quiet window for that token. Each token has
  an independent time-of-last-emission so a slow-moving token is not penalized by a
  fast-moving one.

  Example::

    limiter = ProgressRateLimiter(100)  # 100 ms minimum interval
    if limiter.should_emit(token, now_ms):
      send_progress_notification(token, progress)
  """

  def __init__(self, interval_ms: int | float = 100) -> None:
    """:param interval_ms: minimum milliseconds between successive progress notifications
    for the same token. Defaults to 100 ms. (RC-3)
    """
    self._interval_ms = interval_ms
    self._last_emit: dict[str, int | float] = {}

  def should_emit(self, token: str | int | float, now_ms: int | float) -> bool:
    """Return ``True`` when a notification for ``token`` may be emitted at ``now_ms``.

    Calling this records ``now_ms`` as the last-emit time for the token when emission is
    permitted, so the next call is automatically constrained.
    """
    key = _token_key(token)
    last = self._last_emit.get(key)
    if last is not None and now_ms - last < self._interval_ms:
      return False
    self._last_emit[key] = now_ms
    return True

  def complete(self, token: str | int | float) -> None:
    """Clear the rate-limit state for ``token`` when the operation is terminal.

    Safe to call for an unknown token.
    """
    self._last_emit.pop(_token_key(token), None)


# ─── CancellationHandler ──────────────────────────────────────────────────────

class CancellationHandler:
  """Receiver-side registry mapping in-flight request ids to abort callbacks.
  (R-15.2.2-d / RC-4)

  When a valid ``notifications/cancelled`` arrives, the receiver SHOULD stop processing
  the matching request, free associated resources, and suppress sending the response.
  This wires that behaviour:

  1. **Register** — before dispatching a long-running request, register an abort callback.
  2. **Trigger** — when a valid cancellation arrives (after
     :func:`validate_cancellation_target` confirms eligibility), call :meth:`trigger` to
     fire the callback and deregister the entry.
  3. **Deregister** — on normal completion, call :meth:`deregister` to remove the entry
     without firing the callback.
  """

  def __init__(self) -> None:
    self._handlers: dict[str | int | float, callable] = {}

  def register(self, request_id: str | int | float, on_cancel) -> None:
    """Register ``on_cancel`` as the abort callback for ``request_id``.

    A previously registered handler for the same id is silently replaced — callers should
    :meth:`deregister` before re-using an id.
    """
    self._handlers[request_id] = on_cancel

  def trigger(self, request_id: str | int | float) -> bool:
    """Fire the abort callback for ``request_id`` and remove it from the registry.

    Returns ``True`` when a handler was found and called (the request was stopped);
    ``False`` when no handler is registered — the cancellation may have arrived after the
    work already completed.
    """
    fn = self._handlers.pop(request_id, None)
    if fn is None:
      return False
    fn()
    return True

  def deregister(self, request_id: str | int | float) -> None:
    """Remove the handler for ``request_id`` without calling it.

    Call this on normal completion so the registry does not hold stale entries. Safe to
    call for an unknown ``request_id``.
    """
    self._handlers.pop(request_id, None)

  def has(self, request_id: str | int | float) -> bool:
    """Return ``True`` when an abort callback is registered for ``request_id``."""
    return request_id in self._handlers

  @property
  def size(self) -> int:
    """Number of currently registered abort callbacks."""
    return len(self._handlers)


# ─── CancelledRequestSet ──────────────────────────────────────────────────────

class CancelledRequestSet:
  """Sender-side set of request ids for which a ``notifications/cancelled`` has been sent
  but whose response has not yet arrived. (R-15.2.3-e / RC-6)

  A sender SHOULD distinctly ignore (not merely tolerate) late responses to cancelled
  requests, so callers can detect the race rather than silently process a stale result.

  Usage:

  1. :meth:`add` — call immediately after sending the cancellation notification.
  2. :meth:`is_ignorable` — call when a response arrives; if ``True``, discard it.
  3. :meth:`acknowledge` — call after discarding the late response to bound set growth.
  """

  def __init__(self) -> None:
    self._ids: set[str | int | float] = set()

  def add(self, request_id: str | int | float) -> None:
    """Mark ``request_id`` as cancelled.

    Call this after sending ``notifications/cancelled`` for the request.
    """
    self._ids.add(request_id)

  def is_ignorable(self, request_id: str | int | float) -> bool:
    """Return ``True`` when a response for ``request_id`` SHOULD be ignored because a
    cancellation notification was previously sent for it. (R-15.2.3-e)
    """
    return request_id in self._ids

  def acknowledge(self, request_id: str | int | float) -> None:
    """Remove ``request_id`` from the set after the late response was received and
    discarded. Safe to call for an unknown ``request_id``.
    """
    self._ids.discard(request_id)

  @property
  def size(self) -> int:
    """Number of ids awaiting a late response to discard."""
    return len(self._ids)


# ─── Cancellation utilities ───────────────────────────────────────────────────

#: The method name for the ``server/discover`` handshake exchange. Clients MUST NOT
#: cancel this exchange. (R-15.2.2-b)
SERVER_DISCOVER_METHOD = "server/discover"


def is_discover_method(method: str) -> bool:
  """Return ``True`` when ``method`` names the ``server/discover`` handshake, which MUST
  NOT be cancelled by a client. (R-15.2.2-b)
  """
  return method == SERVER_DISCOVER_METHOD


@dataclass(frozen=True)
class CancellationValidationResult:
  """Outcome of :func:`validate_cancellation_target`.

  ``ok=True`` means the target is eligible for cancellation; otherwise ``reason`` explains
  why it is not.
  """

  ok: bool
  reason: str | None = None


def validate_cancellation_target(
  request_id: str | int | float | None,
  in_flight_ids,
  discover_request_id: str | int | float | None = None,
) -> CancellationValidationResult:
  """Validate that a cancellation target (``requestId`` from a ``notifications/cancelled``)
  is eligible given the sender's in-flight set. (R-15.2.1-a, R-15.2.1-b, R-15.2.2-b)

  A valid target must:

  * be present (``request_id`` is not ``None``),
  * appear in ``in_flight_ids`` (in-flight from the sender's perspective),
  * not be the ``server/discover`` id (when ``discover_request_id`` is provided).

  :param request_id: the target id from the cancellation notification.
  :param in_flight_ids: a set/container of ids the sender has issued and not yet received
    a response to.
  :param discover_request_id: if provided, the id of the ``server/discover`` request that
    must not be cancelled.
  """
  if request_id is None:
    return CancellationValidationResult(False, "requestId is required")
  if discover_request_id is not None and request_id == discover_request_id:
    return CancellationValidationResult(
      False,
      f"Cannot cancel the server/discover handshake (id {request_id!r}) (R-15.2.2-b)",
    )
  if request_id not in in_flight_ids:
    return CancellationValidationResult(
      False,
      f"requestId {request_id!r} is not in-flight from the sender; may only cancel own "
      "in-flight requests (R-15.2.1-a)",
    )
  return CancellationValidationResult(True)
