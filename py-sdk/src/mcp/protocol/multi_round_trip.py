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

import json
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import Field, TypeAdapter, model_validator

from mcp._model import McpModel, validates
from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED
from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE


def _is_plain_object(value: object) -> bool:
  """Return ``True`` when ``value`` is a non-null, non-list dict (a JSON object)."""
  return isinstance(value, dict)

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


# ─── InputRequest / InputRequiredResult schemas (§11.2) ────────────────────────
#
# The S17-owned typed schemas as Pydantic models (analogues of the TS Zod schemas).
# The ``params`` payloads of each input-request kind, and the full ``InputResponse``
# counterparts, are owned by §20/§21 (S30–S33) — here ``params`` is any JSON object.


class _ElicitationInputRequest(McpModel):
  """An ``elicitation/create`` input request — REQUIRED object ``params``. (§11.2, §20)"""

  method: Literal["elicitation/create"]
  params: dict[str, Any]


class _RootsListInputRequest(McpModel):
  """A ``roots/list`` input request — OPTIONAL ``params`` (may carry only ``_meta``). (§11.2, §21)"""

  method: Literal["roots/list"]
  params: dict[str, Any] | None = None


class _SamplingInputRequest(McpModel):
  """A ``sampling/createMessage`` input request — REQUIRED object ``params``. (§11.2, §21)"""

  method: Literal["sampling/createMessage"]
  params: dict[str, Any]


#: A single input request — a discriminated union over ``method`` (§11.2). An unrecognized
#: ``method`` fails validation, so the enclosing result is malformed. (R-11.2-k, R-11.2-l)
InputRequest = Annotated[
  _ElicitationInputRequest | _RootsListInputRequest | _SamplingInputRequest,
  Field(discriminator="method"),
]

_INPUT_REQUEST_ADAPTER: TypeAdapter[Any] = TypeAdapter(InputRequest)


class InputRequiredResult(McpModel):
  """The result a server sends when it needs client input to finish a request (§11.2) —
  the Python analogue of the TS ``InputRequiredResultSchema``.

  ``resultType`` MUST equal ``"input_required"`` (R-11.2-a); at least one of
  ``inputRequests`` / ``requestState`` MUST be present (R-11.2-b/-c).
  """

  result_type: Literal["input_required"]
  input_requests: dict[str, InputRequest] | None = None
  request_state: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")

  @model_validator(mode="after")
  def _require_one(self) -> "InputRequiredResult":
    if self.input_requests is None and self.request_state is None:
      raise ValueError("At least one of inputRequests or requestState MUST be present (R-11.2-b)")
    return self


def is_valid_input_request(value: object) -> bool:
  """Return ``True`` for a single well-formed ``InputRequest`` (§11.2, R-11.2-k).

  The discriminated union over ``method`` (``elicitation/create`` / ``roots/list`` /
  ``sampling/createMessage``); an unrecognized ``method`` is invalid (R-11.2-k, R-11.2-l).
  """
  if not isinstance(value, dict):
    return False
  try:
    _INPUT_REQUEST_ADAPTER.validate_python(value)
    return True
  except Exception:  # noqa: BLE001 — any validation failure means "not a valid InputRequest"
    return False


def is_valid_input_required_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``InputRequiredResult``. (§11.2)

  ``resultType`` MUST equal ``"input_required"`` (R-11.2-a); at least one of
  ``inputRequests`` / ``requestState`` MUST be present (R-11.2-b, R-11.2-c); every entry
  of ``inputRequests`` MUST be a recognized, well-formed ``InputRequest`` (R-11.2-k,
  R-11.2-l); ``requestState`` when present MUST be a string (R-11.3-c).
  """
  return validates(InputRequiredResult, value)


def is_input_required_result(result: object) -> bool:
  """Return ``True`` when ``result`` is a well-formed ``InputRequiredResult``. (§11.2)

  Type-guard alias of :func:`is_valid_input_required_result` (parity with the TS
  ``isInputRequiredResult``).
  """
  return is_valid_input_required_result(result)


# ─── InputResponseRequestParams validation (§11.4) ────────────────────────────

class InputResponseRequestParams(McpModel):
  """The extra params a client-initiated retry MAY carry to fulfill an ``InputRequiredResult``
  (§11.4) — the Python analogue of the TS ``InputResponseRequestParamsSchema``.

  ``_meta`` is REQUIRED per-request metadata; ``inputResponses`` (keyed identically to the
  server's ``inputRequests``) and the verbatim opaque ``requestState`` are OPTIONAL.
  """

  meta: dict[str, Any] = Field(alias="_meta")
  input_responses: dict[str, Any] | None = None
  request_state: str | None = None


def is_valid_input_response_request_params(value: object) -> bool:
  """Return ``True`` for valid client-retry params fulfilling an ``input_required``. (§11.4)

  ``_meta`` is REQUIRED and MUST be an object; ``inputResponses`` OPTIONAL object;
  ``requestState`` OPTIONAL string. Method-specific params are tolerated. (R-11.4-a, R-11.4-b)
  """
  return validates(InputResponseRequestParams, value)


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
    # Mirror the TS `discriminateResultType`, which runs `InputRequiredResultSchema.safeParse`
    # FIRST. Validating the whole envelope here means a malformed `input_required` result is
    # classified as `error` even when called capability-blind (no `client_capabilities`):
    # both fields absent, a non-object `inputRequests`, a non-string `requestState`, or — the
    # case that previously slipped through — an inner request carrying an unrecognized
    # `method`. Without this gate the helper returned `input_required` for an undeclared kind
    # when no capabilities were supplied, diverging from TS. (R-11.5-d, R-11.5-e; R-11.2-b/-k/-l)
    if not is_valid_input_required_result(result):
      return ResultDiscrimination(
        "error",
        reason="Malformed InputRequiredResult: shape did not validate (R-11.2-b/-k/-l)",
      )
    # R-11.5-a / R-11.5-k: when the caller supplies its declared capabilities, gate every
    # requested kind against them — an undeclared kind is an error, not something to fulfill.
    # The shape is already validated above, so each request is a recognized, well-formed kind.
    if client_capabilities is not None:
      for key, request in (result.get("inputRequests") or {}).items():
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


# ─── inputResponses key validation (§11.2, §11.4) ─────────────────────────────

@dataclass(frozen=True)
class InputResponseKeyValidation:
  """Outcome of :func:`validate_input_response_keys`.

  ``valid`` is ``False`` when ``unknown_keys`` is non-empty — i.e. the client answered
  a key the server never asked for. (R-11.2-h, R-11.4-c, R-11.4-d)
  """

  valid: bool
  unknown_keys: list[str]


def validate_input_response_keys(
  input_requests: dict, input_responses: dict
) -> InputResponseKeyValidation:
  """Validate that every ``input_responses`` key was present in ``input_requests``.

  Answering a subset is permitted (the client MAY answer fewer than asked); answering
  an unknown key is a mismatch. (R-11.2-h, R-11.4-c, R-11.4-d)
  """
  allowed = set(input_requests.keys()) if isinstance(input_requests, dict) else set()
  responses = input_responses if isinstance(input_responses, dict) else {}
  unknown = [k for k in responses.keys() if k not in allowed]
  return InputResponseKeyValidation(valid=len(unknown) == 0, unknown_keys=unknown)


# ─── Forward-declared InputResponse validators (§11.4, R-11.4-e) ──────────────

class ElicitResult(McpModel):
  """``ElicitResult`` — client response to ``elicitation/create`` (§20). The S17-owned
  constraint is the ``action`` discriminator; full shape is owned by S30/S31. (R-11.4-e)
  """

  action: Literal["accept", "decline", "cancel"]
  content: dict[str, Any] | None = None


class _Root(McpModel):
  """One workspace root inside :class:`ListRootsResult` — REQUIRED string ``uri``."""

  uri: str
  name: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


class ListRootsResult(McpModel):
  """``ListRootsResult`` — client response to ``roots/list`` (§21, deprecated). The S17-owned
  constraint is the ``roots`` array; full shape is owned by S32. (R-11.4-e)
  """

  roots: list[_Root]


class CreateMessageResult(McpModel):
  """``CreateMessageResult`` — client response to ``sampling/createMessage`` (§21, deprecated).
  The S17-owned required fields are ``role``, ``content``, ``model``; full shape is owned by
  S33. (R-11.4-e)
  """

  role: str
  content: Any
  model: str


def is_valid_elicit_result(value: object) -> bool:
  """Return ``True`` for an ``ElicitResult`` — response to ``elicitation/create``. (§20)

  The S17-owned constraint is the ``action`` discriminator (``accept`` / ``decline`` /
  ``cancel``); OPTIONAL object ``content``. (R-11.4-e)
  """
  return validates(ElicitResult, value)


def is_valid_list_roots_result(value: object) -> bool:
  """Return ``True`` for a ``ListRootsResult`` — response to ``roots/list``. (§21, deprecated)

  The S17-owned constraint is the ``roots`` array; each entry MUST carry a string ``uri``.
  (R-11.4-e)
  """
  return validates(ListRootsResult, value)


def is_valid_create_message_result(value: object) -> bool:
  """Return ``True`` for a ``CreateMessageResult`` — response to ``sampling/createMessage``.
  (§21, deprecated)

  The S17-owned required fields are ``role`` (string), ``content`` (present), and ``model``
  (string). (R-11.4-e)
  """
  return validates(CreateMessageResult, value)


#: Maps an input-request ``method`` to the validator for the ``InputResponse`` kind the
#: client MUST answer with. Used by :func:`validate_input_response_kinds` to enforce
#: kind-correlation. (R-11.4-e, R-11.4-f)
INPUT_RESPONSE_SCHEMA_BY_METHOD = {
  "elicitation/create": is_valid_elicit_result,
  "roots/list": is_valid_list_roots_result,
  "sampling/createMessage": is_valid_create_message_result,
}


@dataclass(frozen=True)
class InputResponseKindError:
  """One kind-correlation failure reported by :func:`validate_input_response_kinds`."""

  key: str
  expected_method: str
  detail: str


@dataclass(frozen=True)
class InputResponseKindValidation:
  """Outcome of :func:`validate_input_response_kinds`.

  ``valid`` is ``False`` when ``errors`` is non-empty.
  """

  valid: bool
  errors: list[InputResponseKindError]


def validate_input_response_kinds(
  input_requests: dict, input_responses: dict
) -> InputResponseKindValidation:
  """Validate each ``input_responses`` value against the kind requested under its key.

  Kind-correlation table (R-11.4-e):

  * ``elicitation/create``     → ``ElicitResult``        (``action`` required)
  * ``roots/list``             → ``ListRootsResult``     (``roots`` array required)
  * ``sampling/createMessage`` → ``CreateMessageResult`` (``role``/``content``/``model``)

  A client MUST NOT answer with a mismatched kind (R-11.4-f); servers reject such
  responses with a JSON-RPC error (R-11.5-s). Precondition-hardened: a non-object
  ``input_responses`` carries no checkable correlations, so it is treated as valid here
  (structural malformity is caught by the schema / key-presence checks) — never raises.
  """
  if not _is_plain_object(input_responses):
    return InputResponseKindValidation(valid=True, errors=[])
  requests = input_requests if _is_plain_object(input_requests) else {}

  errors: list[InputResponseKindError] = []
  for key, response in input_responses.items():
    request = requests.get(key)
    if not isinstance(request, dict):
      continue  # key mismatch — caught by validate_input_response_keys
    method = request.get("method")
    validator = INPUT_RESPONSE_SCHEMA_BY_METHOD.get(method) if isinstance(method, str) else None
    if validator is None:
      continue  # unrecognized method — caught by is_recognized_input_request_method
    if not validator(response):
      errors.append(
        InputResponseKindError(
          key=key,
          expected_method=method,
          detail=f"response under key {key!r} does not match the expected {method} shape",
        )
      )

  return InputResponseKindValidation(valid=len(errors) == 0, errors=errors)


# ─── Malformed-retry error builder (§11.5, R-11.5-s) ──────────────────────────

def build_malformed_retry_error(detail: str) -> dict:
  """Build the JSON-RPC error for a protocol-malformed retry request. (R-11.5-s)

  A server MUST return a JSON-RPC error (NOT another ``input_required`` result) when
  the retry's ``inputResponses`` is malformed at the protocol level. Code is ``-32602``.
  """
  return {"code": INVALID_PARAMS_CODE, "message": f"Malformed retry params: {detail}"}


@dataclass(frozen=True)
class RetryParamsValidation:
  """Outcome of :func:`validate_retry_params`.

  ``ok`` is ``True`` when every response passes kind-correlation; otherwise ``error``
  carries the JSON-RPC error the server MUST return.
  """

  ok: bool
  error: dict | None = None


def validate_retry_params(input_requests: dict, input_responses: dict) -> RetryParamsValidation:
  """Validate server-side retry params, returning a JSON-RPC error when malformed. (R-11.5-s)

  Returns ``ok=True`` when all response shapes pass kind-correlation; otherwise
  ``ok=False`` with a ``-32602`` error payload the server MUST return (never another
  ``input_required`` result).
  """
  result = validate_input_response_kinds(input_requests, input_responses)
  if not result.valid:
    detail = "; ".join(
      f"key {e.key!r} (expected {e.expected_method} response): {e.detail}" for e in result.errors
    )
    return RetryParamsValidation(ok=False, error=build_malformed_retry_error(detail))
  return RetryParamsValidation(ok=True)


# ─── Duplicate-key detection for inputRequests (§11.2, R-11.2-e/f/g) ──────────

#: The JSON-RPC error for an ``input_required`` whose JSON repeats a member name. (R-11.2-f)
DUPLICATE_INPUT_REQUESTS_KEY_ERROR = {
  "code": INVALID_PARAMS_CODE,
  "message": "Malformed InputRequiredResult: duplicate member name in object (R-11.2-f)",
}


def _json_has_duplicate_keys(text: str) -> bool:
  """Return ``True`` when ``text`` contains an object with a repeated member name.

  ``json.loads`` silently collapses duplicate keys (last-wins), so duplicate detection
  MUST work on the raw token stream — this tokenizer tracks the member names seen within
  each object scope and reports the first repeat. (§11.2, R-11.2-f)
  """
  i = 0
  n = len(text)
  stack: list[tuple[bool, set[str]]] = []  # (is_object, keys_seen)
  expect_key = False

  def read_string(idx: int) -> tuple[str, int]:
    idx += 1  # consume opening quote
    out: list[str] = []
    while idx < n:
      c = text[idx]
      idx += 1
      if c == "\\":
        if idx >= n:
          break
        esc = text[idx]
        idx += 1
        if esc == "u":
          out.append(text[idx : idx + 4])
          idx += 4
        else:
          out.append("\\" + esc)
      elif c == '"':
        break
      else:
        out.append(c)
    return "".join(out), idx

  while i < n:
    c = text[i]
    if c in " \t\n\r":
      i += 1
    elif c == "{":
      stack.append((True, set()))
      expect_key = True
      i += 1
    elif c == "[":
      stack.append((False, set()))
      expect_key = False
      i += 1
    elif c in "}]":
      if stack:
        stack.pop()
      expect_key = False
      i += 1
    elif c == ",":
      expect_key = bool(stack) and stack[-1][0] is True
      i += 1
    elif c == ":":
      expect_key = False
      i += 1
    elif c == '"':
      string, i = read_string(i)
      if stack and stack[-1][0] and expect_key:
        keys = stack[-1][1]
        if string in keys:
          return True
        keys.add(string)
        expect_key = False
    else:
      i += 1  # primitive token char; advance
  return False


@dataclass(frozen=True)
class ParsedInputRequiredResult:
  """Outcome of :func:`parse_input_required_result`.

  ``ok`` is ``True`` with ``result`` on success; otherwise ``error`` is the JSON-RPC
  error payload.
  """

  ok: bool
  result: dict | None = None
  error: dict | None = None


def parse_input_required_result(raw_json: str) -> ParsedInputRequiredResult:
  """Parse an ``input_required`` result from raw JSON text, rejecting duplicate keys.

  §11.2 requires a receiver encountering duplicate ``inputRequests`` keys to treat the
  result as malformed (R-11.2-f) — stricter than the base §2.3.1 last-wins tolerance.
  Duplicate detection runs on the raw text because ``json.loads`` would already have
  collapsed repeats. Use this instead of ``json.loads`` + :func:`is_input_required_result`
  when the raw wire text is available and duplicate-key strictness is required (TV-17.10).
  """
  if _json_has_duplicate_keys(raw_json):
    return ParsedInputRequiredResult(ok=False, error=dict(DUPLICATE_INPUT_REQUESTS_KEY_ERROR))
  try:
    parsed = json.loads(raw_json)
  except (ValueError, TypeError) as exc:
    return ParsedInputRequiredResult(
      ok=False,
      error={"code": INVALID_PARAMS_CODE, "message": f"Malformed InputRequiredResult: {exc}"},
    )
  if not is_valid_input_required_result(parsed):
    return ParsedInputRequiredResult(
      ok=False,
      error={
        "code": INVALID_PARAMS_CODE,
        "message": "Malformed InputRequiredResult: shape did not validate",
      },
    )
  return ParsedInputRequiredResult(ok=True, result=parsed)


# ─── Deprecated-kind preference (§11.2, R-11.2-i — SHOULD) ─────────────────────

def is_deprecated_input_request_kind(method: str) -> bool:
  """Return ``True`` when ``method`` is a Deprecated input-request kind. (§11.2, R-11.2-i)

  Servers SHOULD prefer non-deprecated alternatives (e.g. ``elicitation/create``) over
  soliciting via ``roots/list`` / ``sampling/createMessage``.
  """
  return method in DEPRECATED_INPUT_REQUEST_METHODS


# ─── Server-side emit gate for input-request kinds (§11.2, §11.5) ─────────────

def may_emit_input_request_kind(method: str, client_capabilities: dict) -> bool:
  """Return ``True`` when the server MAY emit an input-request of ``method``. (R-11.2-j, R-11.5-g)

  A server MUST NOT emit a kind the client has not declared — withhold it and return
  :func:`build_missing_capability_for_mrtr_error` instead. Equivalent to
  :func:`client_supports_input_request_kind` (the same presence-means-supported check is
  applied on both sides).
  """
  return client_supports_input_request_kind(method, client_capabilities)


# ─── Backoff & still-missing re-request (§11.5, R-11.5-n/-q — SHOULD) ──────────

def compute_retry_backoff_ms(
  attempt: int, *, base_ms: int = 250, max_ms: int = 30_000
) -> int:
  """Compute an exponential-backoff delay (ms) for the Nth retry on non-progress. (R-11.5-n)

  ``attempt`` is the 1-based retry number (``attempt <= 0`` ⇒ ``0`` ms). The delay is
  ``base_ms * 2 ** (attempt - 1)`` clamped to ``max_ms``. A client retrying without
  progress SHOULD apply a reasonable backoff (and offer the user a way to cancel).
  """
  if attempt <= 0:
    return 0
  return min(max_ms, base_ms * 2 ** (attempt - 1))


def compute_missing_input_response_keys(input_requests: dict, input_responses: dict) -> list[str]:
  """Return the ``input_requests`` keys the retry's ``input_responses`` left unanswered.
  (§11.5, R-11.5-q)
  """
  if not _is_plain_object(input_requests):
    return []
  provided = input_responses if _is_plain_object(input_responses) else {}
  return [key for key in input_requests.keys() if provided.get(key) is None]


def build_re_request_input_required_result(
  input_requests: dict, input_responses: dict, request_state: str | None = None
) -> dict | None:
  """Build a NEW ``input_required`` re-requesting only the still-missing input, or ``None``.
  (§11.5, R-11.5-q)

  A server whose retry ``inputResponses`` is well-formed but incomplete SHOULD re-request
  the missing information rather than failing the request. Returns ``None`` when the retry
  supplied everything (the server completes instead).
  """
  missing = compute_missing_input_response_keys(input_requests, input_responses)
  if not missing:
    return None
  re_requested = {key: input_requests[key] for key in missing if key in input_requests}
  result: dict = {"resultType": RESULT_TYPE_INPUT_REQUIRED, "inputRequests": re_requested}
  if request_state is not None:
    result["requestState"] = request_state
  return result


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
