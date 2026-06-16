"""Payload shapes — Result, RequestParams, NotificationParams, ProgressToken, Cursor,
McpError, and EmptyResult (§3.6–§3.9).

These objects ride inside the JSON-RPC envelopes framed in :mod:`mcp.jsonrpc.framing`:

* ``params``  in requests          → RequestParams      (§3.7)
* ``params``  in notifications     → NotificationParams (§3.7)
* ``result``  in success responses → Result / EmptyResult (§3.6, §3.9)
* ``error``   in error responses   → McpError           (§3.8)
"""

from __future__ import annotations

from dataclasses import dataclass

from mcp.json.value import is_safe_integer

# ─── ResultType (§3.6) ────────────────────────────────────────────────────────

#: The request completed; the result carries the final content for the method.
RESULT_TYPE_COMPLETE = "complete"
#: The server needs more client input before it can finish the request (§11).
RESULT_TYPE_INPUT_REQUIRED = "input_required"

#: The two spec-defined ``ResultType`` values (§3.6, R-3.6-e). Additional values MAY
#: exist only via the extension mechanism (§24); implementations MUST NOT mint others.
KNOWN_RESULT_TYPES = frozenset({RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED})


def is_known_result_type(value: str) -> bool:
  """Return ``True`` when ``value`` is one of the two spec-defined ``ResultType`` values.

  A receiver that encounters an unrecognized ``resultType`` MUST treat the whole
  response as an error and MUST NOT read any other result members. (R-3.6-f, R-3.6-g)
  """
  return value in KNOWN_RESULT_TYPES


@dataclass(frozen=True)
class ResultTypeInterpretation:
  """The outcome of :func:`interpret_result_type`.

  ``recognized`` is ``False`` for an unknown ``resultType``; in that case callers MUST
  NOT read any other result members (R-3.6-g).
  """

  recognized: bool
  result_type: str


def interpret_result_type(result: dict) -> ResultTypeInterpretation:
  """Interpret the ``resultType`` field of a received result, applying §3.6's rules.

  * R-3.6-i: an absent (or ``null``) ``resultType`` MUST be treated as ``"complete"``
    (interop fallback for servers that omit the field).
  * R-3.6-f: an unrecognized value means the receiver MUST treat the whole response as
    an error — ``recognized=False`` signals this.
  * R-3.6-g: when ``recognized`` is ``False``, callers MUST NOT read other members.
  """
  raw = result.get("resultType")
  resolved = RESULT_TYPE_COMPLETE if raw is None else str(raw)
  return ResultTypeInterpretation(is_known_result_type(resolved), resolved)


# ─── Structural validators (§3.6–§3.9) ────────────────────────────────────────

def _is_object(value: object) -> bool:
  return isinstance(value, dict)


def is_valid_result(value: object) -> bool:
  """Return ``True`` for a valid ``Result`` (§3.6).

  REQUIRED string ``resultType``; OPTIONAL object ``_meta``; additional members
  allowed. (R-3.6-a, R-3.6-c, R-3.6-d)
  """
  if not _is_object(value):
    return False
  if not isinstance(value.get("resultType"), str):
    return False
  if "_meta" in value and not _is_object(value["_meta"]):
    return False
  return True


def is_valid_empty_result(value: object) -> bool:
  """Return ``True`` for a valid ``EmptyResult`` (§3.9).

  REQUIRED string ``resultType`` (normally ``"complete"``); OPTIONAL object ``_meta``;
  MUST NOT include any members beyond ``_meta`` and ``resultType``. (R-3.9-a, R-3.9-b)
  """
  if not _is_object(value):
    return False
  if not isinstance(value.get("resultType"), str):
    return False
  if "_meta" in value and not _is_object(value["_meta"]):
    return False
  return set(value.keys()) <= {"resultType", "_meta"}


def is_valid_request_params(value: object) -> bool:
  """Return ``True`` for valid request ``params`` (§3.7).

  ``_meta`` is REQUIRED on request params and MUST be an object; additional members
  allowed. (R-3.7-a)
  """
  return _is_object(value) and _is_object(value.get("_meta"))


def is_valid_notification_params(value: object) -> bool:
  """Return ``True`` for valid notification ``params`` (§3.7).

  ``_meta`` is OPTIONAL; when present it MUST be an object; additional members allowed.
  (R-3.7-b)
  """
  if not _is_object(value):
    return False
  return "_meta" not in value or _is_object(value["_meta"])


# ─── ProgressToken / Cursor (§3.7) ────────────────────────────────────────────

def is_progress_token(value: object) -> bool:
  """Return ``True`` for a valid ``ProgressToken`` — an opaque string or number.

  Unlike request ids and error codes, a progress token need not be an integer, so the
  §2.5 safe-integer constraint does not apply. ``bool`` is rejected. (R-15.1.1-a)
  """
  if isinstance(value, str):
    return True
  return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_cursor(value: object) -> bool:
  """Return ``True`` for a valid ``Cursor`` — an opaque string (§3.7).

  Receivers MUST NOT parse or infer structure from a cursor value. (R-3.7-d)
  """
  return isinstance(value, str)


# ─── McpError (§3.8) ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class McpError:
  """The object carried in the ``error`` member of an error response (§3.8).

  Named ``McpError`` to avoid shadowing Python's built-in ``Exception``/error types.
  ``code`` is a REQUIRED safe integer; ``message`` is a REQUIRED string; ``data`` is
  OPTIONAL sender-defined detail. (R-3.8-a, R-3.8-c, R-3.8-e)
  """

  code: int
  message: str
  data: object | None = None


def is_valid_mcp_error(value: object) -> bool:
  """Return ``True`` for a valid ``McpError`` object (§3.8).

  REQUIRED safe-integer ``code`` and string ``message``; OPTIONAL ``data``.
  (R-3.8-a, R-3.8-c, R-3.8-e, §2.5)
  """
  if not _is_object(value):
    return False
  return is_safe_integer(value.get("code")) and isinstance(value.get("message"), str)
