"""Utilities: Logging & Trace Context (§15.3–§15.4).

Two diagnostic utilities layered on the message envelope:

1. **Logging** (*Deprecated* per SEP-2577, §15.3): a per-request opt-in mechanism via the
   reserved ``_meta`` key ``io.modelcontextprotocol/logLevel``. When set, the server MAY
   emit ``notifications/message`` log notifications at or above that severity, on the
   request's response stream, before the final response. Implementations SHOULD prefer
   stderr or out-of-band tracing. (R-15.3-a)

2. **Trace context** (active, §15.4): three W3C bare keys (``traceparent``, ``tracestate``,
   ``baggage``) may appear in the ``_meta`` of any request or notification. Receivers MUST
   treat them as opaque; intermediaries SHOULD propagate them unchanged. (R-15.4.2-h)

``LOGGING_LEVELS``, :func:`logging_level_index`, and :func:`is_at_or_above_log_level` are
defined in :mod:`mcp.protocol.meta` because ``io.modelcontextprotocol/logLevel`` is a
reserved per-request ``_meta`` key introduced there; this module re-exports them and adds
the notification validators/builders, the level opt-in validator, and the trace-context
utilities.

The TypeScript SDK expresses the wire shapes as Zod schemas; this port translates each
schema into a ``is_valid_*`` predicate plus a matching ``build_*`` constructor.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import Field

from mcp._model import McpModel, validates
from mcp.json.meta_key import is_valid_baggage, is_valid_traceparent, is_valid_tracestate
from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.meta import (
  LOGGING_LEVELS,
  is_at_or_above_log_level,
  logging_level_index,
)

#: The eight ascending-severity log levels as a field type (the analogue of the TS
#: ``LoggingLevelSchema`` zod enum). (§15.3.1)
LoggingLevel = Literal[
  "debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"
]

# Re-exported from :mod:`mcp.protocol.meta` for parity with the TS module's re-exports.
__all__ = [
  "LOGGING_LEVELS",
  "logging_level_index",
  "is_at_or_above_log_level",
  "is_valid_logging_level",
  "LoggingLevel",
  "LoggingMessageNotificationParams",
  "LOGGING_MESSAGE_METHOD",
  "is_valid_logging_message_notification_params",
  "build_logging_message_notification_params",
  "is_valid_logging_message_notification",
  "build_logging_message_notification",
  "LogLevelValidationResult",
  "validate_log_level_opt_in",
  "resolved_min_log_level_index",
  "LogRateLimiter",
  "TRACE_CONTEXT_BARE_KEYS",
  "has_traceparent",
  "has_tracestate",
  "has_baggage",
  "relay_trace_context",
  "extract_trace_context",
]

#: The JSON-RPC version marker every notification envelope MUST carry. (§3)
JSONRPC_VERSION = "2.0"


def is_valid_logging_level(value: object) -> bool:
  """Return ``True`` when ``value`` is one of the eight recognized ``LoggingLevel`` strings.

  Mirrors ``LoggingLevelSchema``: exactly one of the ascending-severity level names; any
  other string, a number, ``None``, etc. is rejected. (§4.3, R-4.3-d)
  """
  return isinstance(value, str) and value in LOGGING_LEVELS


# ─── LoggingMessageNotification (§15.3.2) ─────────────────────────────────────

#: Method name for the (*Deprecated*) per-request log notification. (§15.3.2)
LOGGING_MESSAGE_METHOD = "notifications/message"


class LoggingMessageNotificationParams(McpModel):
  """``notifications/message`` params (§15.3.2) — the Python analogue of the TS
  ``LoggingMessageNotificationParamsSchema``.

  ``level`` (REQUIRED) is one of the eight ``LoggingLevel`` strings (R-15.3.2-a); ``logger``
  (OPTIONAL) identifies the emitting logger (R-15.3.2-b); ``data`` (REQUIRED — the key MUST
  be present, value may be ``None`` or anything JSON-serializable, R-15.3.2-c). The payload
  MUST NOT carry credentials/secrets/PII (R-15.3.2-e) — a content concern beyond this shape.
  """

  level: LoggingLevel
  logger: str | None = None
  data: Any
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_logging_message_notification_params(value: object) -> bool:
  """Return ``True`` for valid ``notifications/message`` params. (§15.3.2)

  See :class:`LoggingMessageNotificationParams`: ``level`` + ``data`` REQUIRED, ``logger``
  OPTIONAL. (R-15.3.2-a/-b/-c)
  """
  return validates(LoggingMessageNotificationParams, value)


def build_logging_message_notification_params(
  level: str,
  data: object,
  *,
  logger: str | None = None,
  meta: dict | None = None,
) -> dict:
  """Build ``notifications/message`` params; optional fields only when supplied. (§15.3.2)

  ``data`` is always written (it is REQUIRED) even when ``None``.

  :raises ValueError: when ``level`` is not a recognized ``LoggingLevel`` string, or when
    ``logger`` is supplied but is not a string.
  """
  if not is_valid_logging_level(level):
    raise ValueError("level must be one of the recognized LoggingLevel strings (R-15.3.2-a)")
  if logger is not None and not isinstance(logger, str):
    raise ValueError("logger must be a string when present (R-15.3.2-b)")
  params: dict = {"level": level, "data": data}
  if logger is not None:
    params["logger"] = logger
  if meta is not None:
    params["_meta"] = meta
  return params


def is_valid_logging_message_notification(value: object) -> bool:
  """Return ``True`` for a full ``notifications/message`` notification envelope. (§15.3)

  ``jsonrpc`` is exactly ``"2.0"``, ``method`` is :data:`LOGGING_MESSAGE_METHOD`, and
  ``params`` is a valid log-notification params object.

  .. deprecated::
    Logging is a Deprecated capability (§27.3). For stdio (§8) write diagnostics to
    stderr; for general observability emit telemetry via an external framework. Earliest
    removal: 2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
  """
  if not isinstance(value, dict):
    return False
  if value.get("jsonrpc") != JSONRPC_VERSION:
    return False
  if value.get("method") != LOGGING_MESSAGE_METHOD:
    return False
  return is_valid_logging_message_notification_params(value.get("params"))


def build_logging_message_notification(
  level: str,
  data: object,
  *,
  logger: str | None = None,
  meta: dict | None = None,
) -> dict:
  """Build a complete ``notifications/message`` notification envelope. (§15.3)

  :raises ValueError: when the params are invalid (see
    :func:`build_logging_message_notification_params`).

  .. deprecated::
    Logging is a Deprecated capability (§27.3); prefer stderr or external observability.
  """
  return {
    "jsonrpc": JSONRPC_VERSION,
    "method": LOGGING_MESSAGE_METHOD,
    "params": build_logging_message_notification_params(level, data, logger=logger, meta=meta),
  }


# ─── Per-request opt-in validation (§15.3.3) ──────────────────────────────────

@dataclass(frozen=True)
class LogLevelValidationResult:
  """Outcome of :func:`validate_log_level_opt_in`.

  ``ok=True`` means the opt-in value is a recognized ``LoggingLevel``; otherwise ``code``
  is ``-32602`` (Invalid params) and ``message`` explains the failure.
  """

  ok: bool
  code: int | None = None
  message: str | None = None


def validate_log_level_opt_in(log_level: object) -> LogLevelValidationResult:
  """Validate the ``io.modelcontextprotocol/logLevel`` opt-in value from a request's
  ``_meta``. (R-15.3.3-g)

  Returns ``ok=True`` when the value is a recognized ``LoggingLevel`` string, and a
  ``-32602`` (Invalid params) error otherwise — a server SHOULD reject a request whose
  ``logLevel`` value is not one of the recognized strings.

  :param log_level: the raw value of ``io.modelcontextprotocol/logLevel`` from ``_meta``.
  """
  if is_valid_logging_level(log_level):
    return LogLevelValidationResult(True)
  return LogLevelValidationResult(
    False,
    INVALID_PARAMS_CODE,
    "Invalid params: io.modelcontextprotocol/logLevel must be one of the recognized "
    "LoggingLevel strings",
  )


def resolved_min_log_level_index(log_level_opt_in: object) -> int:
  """Return the minimum numeric severity index that should be emitted for a request bearing
  ``log_level_opt_in``. Used by servers to filter log notifications.

  Returns ``-1`` when no ``logLevel`` opt-in is present (absent or invalid), indicating
  that NO log notifications must be emitted. (R-15.3.3-a)

  :param log_level_opt_in: the raw value of ``io.modelcontextprotocol/logLevel``, or
    ``None`` when the key is absent from ``_meta``.
  """
  if not is_valid_logging_level(log_level_opt_in):
    return -1  # absent or invalid → emit nothing
  return logging_level_index(log_level_opt_in)


# ─── LogRateLimiter (RC-3 / SHOULD) ───────────────────────────────────────────

class LogRateLimiter:
  """Global rate-limiter for ``notifications/message`` log emissions. (RC-3 / SHOULD)

  Implementations SHOULD throttle log notifications to avoid flooding the transport. A
  sender may call :meth:`should_emit` before dispatching each log notification; the limiter
  suppresses emissions that arrive within the quiet window.

  Unlike :class:`~mcp.protocol.progress.ProgressRateLimiter`, log notifications are NOT
  per-token — a single shared throttle window applies to the whole notification stream,
  because all log messages share the same ``notifications/message`` channel.

  Example::

    limiter = LogRateLimiter(50)  # 50 ms minimum interval
    if limiter.should_emit(now_ms):
      send_log_notification(level, data)
  """

  def __init__(self, interval_ms: int | float = 50) -> None:
    """:param interval_ms: minimum milliseconds between successive log notifications.
    Defaults to 50 ms. (RC-3)
    """
    self._interval_ms = interval_ms
    self._last_emit_ms: int | float | None = None

  def should_emit(self, now_ms: int | float) -> bool:
    """Return ``True`` when a log notification may be emitted at ``now_ms``.

    Calling this records ``now_ms`` as the last-emit time when emission is permitted, so
    the next call is automatically constrained. The first call always returns ``True``.
    """
    if self._last_emit_ms is not None and now_ms - self._last_emit_ms < self._interval_ms:
      return False
    self._last_emit_ms = now_ms
    return True


# ─── Trace context (§15.4) ────────────────────────────────────────────────────

#: The three W3C trace-context bare keys carried in ``_meta``. (§15.4.1)
TRACE_CONTEXT_BARE_KEYS = ("traceparent", "tracestate", "baggage")


def has_traceparent(meta: dict) -> bool:
  """Return ``True`` when ``meta`` carries a ``traceparent`` key conforming to the W3C
  Trace Context format. (R-15.4.1-a)
  """
  value = meta.get("traceparent")
  return isinstance(value, str) and is_valid_traceparent(value)


def has_tracestate(meta: dict) -> bool:
  """Return ``True`` when ``meta`` carries a ``tracestate`` key conforming to the W3C
  Trace Context format. (R-15.4.1-b)
  """
  value = meta.get("tracestate")
  return isinstance(value, str) and is_valid_tracestate(value)


def has_baggage(meta: dict) -> bool:
  """Return ``True`` when ``meta`` carries a ``baggage`` key conforming to the W3C Baggage
  format. (R-15.4.1-c)
  """
  value = meta.get("baggage")
  return isinstance(value, str) and is_valid_baggage(value)


def relay_trace_context(inbound: dict, outbound: dict) -> dict:
  """Copy the three W3C trace-context keys from ``inbound`` onto a copy of ``outbound``
  unchanged, for intermediary relay. (R-15.4.2-h)

  Only keys present in ``inbound`` are copied; absent keys are not added to the result.
  Existing values in ``outbound`` are overwritten so the inbound values propagate
  unchanged. The original ``outbound`` object is NOT mutated.

  :returns: a new dict merging ``outbound`` with the relayed trace-context keys.
  """
  result = dict(outbound)
  for key in TRACE_CONTEXT_BARE_KEYS:
    if key in inbound:
      result[key] = inbound[key]
  return result


def extract_trace_context(meta: dict) -> dict:
  """Extract only the trace-context keys from ``meta``, returning a dict that contains at
  most ``traceparent``, ``tracestate``, and ``baggage`` (only those present as strings).

  Receivers that do not participate in tracing can safely ignore the returned object;
  this never raises and never inspects the value beyond requiring it be a string.
  (R-15.4.2-g)
  """
  ctx: dict = {}
  for key in TRACE_CONTEXT_BARE_KEYS:
    value = meta.get(key)
    if isinstance(value, str):
      ctx[key] = value
  return ctx
