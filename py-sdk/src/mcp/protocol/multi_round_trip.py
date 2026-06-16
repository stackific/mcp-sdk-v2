"""Multi-Round-Trip Requests — the ``input_required`` mechanism (§11).

The single protocol-wide mechanism by which a server solicits additional client
input while processing a participating request (``tools/call`` / ``prompts/get`` /
``resources/read``):

1. The server replies with an ``input_required`` result carrying ``inputRequests``
   (what it needs) and an opaque ``requestState`` continuation token.
2. The client fulfills each request locally (via its registered handlers) and
   retries the SAME method with the original arguments PLUS ``inputResponses`` and
   the verbatim ``requestState``. The retry is a new JSON-RPC request (new id).
3. Steps repeat until a ``complete`` result or an error.

The server MUST NOT open an independent JSON-RPC request to obtain input; all
solicitation rides the response channel — which keeps the model stateless and
works over a single ``application/json`` response. (R-11.1-a, R-11.1-b)

Input-request kinds (discriminated by ``method``):
  ``elicitation/create``     — structured user input (§20)
  ``roots/list``             — workspace roots (§21, deprecated)
  ``sampling/createMessage`` — borrow the client's model (§21, deprecated)
"""

from __future__ import annotations

from dataclasses import dataclass

from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED
from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE

#: The three recognized ``InputRequest.method`` values. (§11.2, R-11.2-k)
RECOGNIZED_INPUT_REQUEST_METHODS = frozenset(
  {"elicitation/create", "roots/list", "sampling/createMessage"}
)

#: Each recognized input-request kind → the client capability it requires. (§11.2, §6)
INPUT_REQUEST_KIND_CAPABILITY = {
  "elicitation/create": "elicitation",
  "roots/list": "roots",
  "sampling/createMessage": "sampling",
}

#: The two Deprecated input-request kinds; servers SHOULD prefer alternatives. (§11.2)
DEPRECATED_INPUT_REQUEST_METHODS = frozenset({"roots/list", "sampling/createMessage"})

#: The three methods that MAY return ``input_required`` results. (§11.6, R-11.6-a)
MRTR_PARTICIPATING_METHODS = frozenset({"tools/call", "prompts/get", "resources/read"})


def is_recognized_input_request_method(method: str) -> bool:
  """Return ``True`` when ``method`` is one of the three recognized input kinds."""
  return method in RECOGNIZED_INPUT_REQUEST_METHODS


def is_mrtr_participating_method(method: str) -> bool:
  """Return ``True`` when ``method`` is one of the three MRTR-participating methods."""
  return method in MRTR_PARTICIPATING_METHODS


def required_client_capability_for_input_request(method: str) -> str | None:
  """Return the client capability an input-request ``method`` requires, or ``None``."""
  return INPUT_REQUEST_KIND_CAPABILITY.get(method)


def client_supports_input_request_kind(method: str, client_capabilities: dict) -> bool:
  """Return ``True`` when the client declared the capability ``method`` requires. (R-11.5-a)

  Used both server-side (may the server emit a kind?) and client-side (may the
  client fulfill a kind?). An unrecognized method is never supported.
  """
  capability = required_client_capability_for_input_request(method)
  return (
    capability is not None
    and isinstance(client_capabilities, dict)
    and client_capabilities.get(capability) is not None
  )


def build_input_required_result(
  input_requests: dict | None = None,
  request_state: str | None = None,
) -> dict:
  """Build an ``input_required`` result a server returns to solicit client input. (§11.2)

  At least one of ``input_requests`` / ``request_state`` MUST be present (R-11.2-b);
  ``request_state`` alone is a load-shedding signal (§11.5).
  """
  result: dict = {"resultType": RESULT_TYPE_INPUT_REQUIRED}
  if input_requests:
    result["inputRequests"] = input_requests
  if request_state is not None:
    result["requestState"] = request_state
  return result


def is_load_shedding_result(result: object) -> bool:
  """Return ``True`` for a load-shedding signal: ``input_required`` with no/empty
  ``inputRequests`` but a present ``requestState``. (§11.5, R-11.5-l)
  """
  if not isinstance(result, dict):
    return False
  if result.get("resultType") != RESULT_TYPE_INPUT_REQUIRED:
    return False
  input_requests = result.get("inputRequests")
  has_requests = isinstance(input_requests, dict) and len(input_requests) > 0
  return not has_requests and isinstance(result.get("requestState"), str)


@dataclass(frozen=True)
class ResultDiscrimination:
  """The outcome of :func:`discriminate_result_type` (§11.5).

  ``action`` is one of ``"complete"`` / ``"input_required"`` / ``"error"``.
  """

  action: str
  result: dict | None = None
  reason: str | None = None


def discriminate_result_type(result: object, client_capabilities: dict | None = None) -> ResultDiscrimination:
  """Branch on a result's ``resultType`` per the client-side rules of §11.5.

  * ``"complete"`` or absent ``resultType`` → ``complete`` (R-11.5-c, R-11.5-f).
  * ``"input_required"`` with a valid shape → ``input_required`` (each requested
    kind gated against declared capabilities when supplied, R-11.5-k).
  * any unrecognized ``resultType`` → ``error`` (R-11.5-d, R-11.5-e).
  """
  if not isinstance(result, dict):
    return ResultDiscrimination("error", reason="result is not an object")
  raw = result.get("resultType")

  if raw is None:
    return ResultDiscrimination("complete")
  if not isinstance(raw, str):
    return ResultDiscrimination("error", reason="`resultType` must be a string")
  if raw == RESULT_TYPE_COMPLETE:
    return ResultDiscrimination("complete")

  if raw == RESULT_TYPE_INPUT_REQUIRED:
    input_requests = result.get("inputRequests")
    request_state = result.get("requestState")
    if input_requests is None and request_state is None:
      return ResultDiscrimination(
        "error",
        reason="At least one of inputRequests or requestState MUST be present (R-11.2-b)",
      )
    if input_requests is not None and not isinstance(input_requests, dict):
      return ResultDiscrimination("error", reason="inputRequests must be an object")
    if client_capabilities is not None:
      for key, request in (input_requests or {}).items():
        method = request.get("method") if isinstance(request, dict) else None
        if not isinstance(method, str) or not client_supports_input_request_kind(method, client_capabilities):
          return ResultDiscrimination(
            "error",
            reason=f'Undeclared input-request kind "{method}" under key "{key}" (R-11.5-k)',
          )
    return ResultDiscrimination("input_required", result=result)

  return ResultDiscrimination(
    "error", reason=f'Unrecognized resultType "{raw}"; MUST NOT read other members'
  )


def build_missing_capability_for_mrtr_error(required_capabilities: dict) -> dict:
  """Build the ``-32003`` error when a server cannot proceed without an undeclared kind. (R-11.5-i)"""
  return {
    "code": MISSING_CLIENT_CAPABILITY_CODE,
    "message": "Missing required client capability for multi-round-trip request",
    "data": {"requiredCapabilities": required_capabilities},
  }


#: The malformed-``input_required`` error payload (missing both fields). (R-11.2-c)
MALFORMED_INPUT_REQUIRED_RESULT_ERROR = {
  "code": INVALID_PARAMS_CODE,
  "message": (
    "Malformed InputRequiredResult: at least one of inputRequests or requestState must be present"
  ),
}


class MrtrRoundGuard:
  """A bounded round counter guarding against an unbounded MRTR loop (no protocol
  limit exists, so implementations SHOULD cap it). (§11.5, R-11.5-b)
  """

  def __init__(self, max_rounds: int = 16) -> None:
    self.max_rounds = max_rounds
    self._round = 0

  @property
  def round(self) -> int:
    return self._round

  def record_round(self) -> bool:
    """Record one round; returns ``False`` once ``max_rounds`` is exceeded."""
    self._round += 1
    return self._round <= self.max_rounds
