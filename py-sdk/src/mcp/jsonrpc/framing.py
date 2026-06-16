"""JSON-RPC 2.0 message framing for MCP (§3.1–§3.5).

Defines the three structural message kinds (request, notification, response), the
:data:`RequestId` type, the classification algorithm, in-flight id tracking, and the
malformed-message rejection rules.

Out of scope here: the ``Result`` base shape (§3.6, see :mod:`mcp.jsonrpc.payload`),
the ``Error`` object shape and standard error-code constants (§3.8–§3.10, see
:mod:`mcp.protocol.errors`), and transport framing (§8).

Validation is performed with explicit structural checks (rather than a schema
library) to mirror the spec's classification algorithm step-for-step and to keep the
foundation dependency-free. Every rejection is raised as
:class:`MalformedMessageError`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union

from mcp.json.value import is_safe_integer

#: ``RequestId`` correlates a response with the request that originated it. MUST be a
#: JSON string or JSON number; MUST NOT be ``null`` (stricter than base JSON-RPC 2.0).
#: (R-3.2-a, R-3.2-b)
RequestId = Union[str, int]

#: The structural kind of a classified JSON-RPC message.
MessageKind = Literal["request", "notification", "result-response", "error-response"]


def is_request_id(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid :data:`RequestId`.

  A JSON string, or a JSON number that is an IEEE-754 safe integer (§2.5). ``bool``
  is rejected (it is a JSON boolean, not a number) and ``None`` is rejected (ids MUST
  NOT be ``null``). (R-3.2-a, R-3.2-b)
  """
  if isinstance(value, str):
    return True
  if isinstance(value, bool):
    return False
  return isinstance(value, int) and is_safe_integer(value)


class MalformedMessageError(Exception):
  """Raised when a received message is structurally malformed and must be rejected.

  Per R-3.4-f, malformed *notifications* are silently discarded — callers MUST check
  the classification before surfacing this error toward the sender.
  """

  #: Stable machine-readable code for programmatic handling.
  code = "MALFORMED_MESSAGE"

  def __init__(self, reason: str) -> None:
    super().__init__(f"Malformed JSON-RPC message: {reason}")
    self.reason = reason


@dataclass(frozen=True)
class ClassifiedMessage:
  """A successfully classified message: its structural ``kind`` and the raw object."""

  kind: MessageKind
  message: dict


def _is_object(value: object) -> bool:
  """Return ``True`` for a JSON object (a ``dict``), excluding lists/None."""
  return isinstance(value, dict)


def _validate_params(obj: dict) -> None:
  """When ``params`` is present it MUST be a JSON object (not an array). (R-3.3-f)"""
  if "params" in obj and not _is_object(obj["params"]):
    raise MalformedMessageError("`params`, when present, MUST be a JSON object (R-3.3-f)")


def classify_message(raw: object) -> ClassifiedMessage:
  """Classify ``raw`` as a JSON-RPC message, or raise :class:`MalformedMessageError`.

  Classification algorithm (§3.1, informative):

  * ``id`` + ``method``  → request
  * ``method``, no ``id`` → notification
  * ``id`` + ``result``  → success response
  * ``error`` (±``id``)  → error response

  Rejects (raises):

  * Top-level JSON arrays (batches) — R-3.1-b, R-3.1-c
  * Missing or incorrect ``jsonrpc`` — R-3.1-d, R-3.1-e
  * Contradictory member combinations — R-3.1-f
  * Unclassifiable member combinations
  """
  # Batches (top-level arrays) are forbidden. (R-3.1-b, R-3.1-c)
  if isinstance(raw, list):
    raise MalformedMessageError(
      "JSON-RPC batch arrays are not permitted (R-3.1-c); each message must be a "
      "single JSON object"
    )

  if not _is_object(raw):
    raise MalformedMessageError("message must be a JSON object")

  obj: dict = raw

  # `jsonrpc` MUST be the string "2.0". (R-3.1-d, R-3.1-e)
  if obj.get("jsonrpc") != "2.0":
    raise MalformedMessageError(
      '`jsonrpc` member must be present and equal to the string "2.0" (R-3.1-d)'
    )

  has_id = "id" in obj
  has_method = "method" in obj
  has_result = "result" in obj
  has_error = "error" in obj

  # Contradictory member combinations are malformed. (R-3.1-f)
  if has_method and (has_result or has_error):
    raise MalformedMessageError("`method` cannot coexist with `result` or `error` (R-3.1-f)")
  if has_result and has_error:
    raise MalformedMessageError(
      "a response MUST carry exactly one of `result` or `error`, not both (R-3.1-f)"
    )

  if has_method and has_id:
    return ClassifiedMessage("request", _validate_request(obj))
  if has_method:
    return ClassifiedMessage("notification", _validate_notification(obj))
  if has_id and has_result:
    return ClassifiedMessage("result-response", _validate_result_response(obj))
  if has_error:
    return ClassifiedMessage("error-response", _validate_error_response(obj))

  raise MalformedMessageError(
    "cannot classify message: no valid member combination matched (id/method/result/error)"
  )


def _validate_request(obj: dict) -> dict:
  """A request carries ``jsonrpc``, a valid ``id``, and a string ``method``. (§3.3)"""
  if not is_request_id(obj.get("id")):
    raise MalformedMessageError("request `id` MUST be a string or safe-integer number (R-3.3-b)")
  if not isinstance(obj.get("method"), str):
    raise MalformedMessageError("request `method` MUST be a string (R-3.3-c)")
  _validate_params(obj)
  return obj


def _validate_notification(obj: dict) -> dict:
  """A notification carries ``jsonrpc`` and ``method`` but NO ``id``. (§3.4)"""
  if "id" in obj:
    raise MalformedMessageError("a notification MUST NOT contain an `id` member (R-3.4-e)")
  if not isinstance(obj.get("method"), str):
    raise MalformedMessageError("notification `method` MUST be a string (R-3.4-c)")
  _validate_params(obj)
  return obj


def _validate_result_response(obj: dict) -> dict:
  """A success response carries ``jsonrpc``, a valid ``id``, and an object ``result``. (§3.5.1)"""
  if not is_request_id(obj.get("id")):
    raise MalformedMessageError("response `id` MUST be a string or safe-integer number (R-3.5.1-b)")
  if not _is_object(obj.get("result")):
    raise MalformedMessageError("`result` MUST be a JSON object (§3.6)")
  return obj


def _validate_error_response(obj: dict) -> dict:
  """An error response carries ``jsonrpc``, an object ``error``, and an OPTIONAL ``id``.

  When ``id`` is present it MUST be a valid :data:`RequestId` — the framing schema does
  not accept ``null`` here (the ``null``-id parse-error response is built directly by
  the transport layer). (§3.5.2)
  """
  if not _is_object(obj.get("error")):
    raise MalformedMessageError("`error` MUST be a JSON object (§3.8)")
  if "id" in obj and not is_request_id(obj["id"]):
    raise MalformedMessageError(
      "error response `id`, when present, MUST be a string or safe-integer number (R-3.5.2-b)"
    )
  return obj


def id_echo_matches(request_id: RequestId, response_id: RequestId) -> bool:
  """Return ``True`` when ``response_id`` correctly echoes ``request_id``.

  Same JSON type (string ↔ string, number ↔ number) and same value. Type coercion
  MUST NOT be applied, so ``"1"`` never matches ``1``. (R-3.2-e, R-3.2-f, R-3.2-g)
  """
  return type(request_id) is type(response_id) and request_id == response_id


class InFlightTracker:
  """Tracks in-flight request identifiers for a single sender on one connection (§3.2).

  Per R-3.2-c a sender MUST NOT reuse an identifier while the original request is
  still awaiting a response; per R-3.2-d all outstanding ids from a single sender on a
  single connection MUST be unique. String and number ids with the same textual form
  are kept distinct because they are different JSON types: ``"1"`` and ``1`` differ.
  (R-3.2-f, R-3.2-g)
  """

  def __init__(self) -> None:
    self._inflight: dict[tuple[str, RequestId], RequestId] = {}

  @staticmethod
  def _key(id_: RequestId) -> tuple[str, RequestId]:
    """Tag the id with its JSON type so the string ``"1"`` never collides with the
    number ``1`` — a ``(type-tag, id)`` tuple is hashable and needs no string scheme."""
    return ("s", id_) if isinstance(id_, str) else ("n", id_)

  def register(self, id_: RequestId) -> None:
    """Register ``id_`` as in-flight for an outgoing request.

    :raises ValueError: when ``id_`` is already in-flight (a reuse violation).
      (R-3.2-c, R-3.2-d)
    """
    key = self._key(id_)
    if key in self._inflight:
      raise ValueError(
        f"Request id {id_!r} is already in-flight; ids MUST be unique (R-3.2-c, R-3.2-d)"
      )
    self._inflight[key] = id_

  def complete(self, id_: RequestId) -> None:
    """Remove ``id_`` from the in-flight set. Safe to call for an untracked id."""
    self._inflight.pop(self._key(id_), None)

  def has(self, id_: RequestId) -> bool:
    """Return ``True`` when ``id_`` is currently registered as in-flight."""
    return self._key(id_) in self._inflight

  @property
  def size(self) -> int:
    """The number of currently in-flight requests."""
    return len(self._inflight)

  @property
  def outstanding(self) -> list[RequestId]:
    """A snapshot list of all currently outstanding identifiers."""
    return list(self._inflight.values())
