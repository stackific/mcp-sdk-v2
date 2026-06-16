"""Prompts (§18).

Server-offered templates that produce structured conversation messages. A server exposes
named prompts (optionally accepting arguments) discovered via ``prompts/list`` and
retrieved via ``prompts/get``. This module fixes the capability + gating, the ``Prompt`` /
``PromptArgument`` / ``PromptMessage`` shapes, the paginated/cacheable list result, the
argument-rendered get result + its ``input_required`` discrimination, the ``-32602`` /
``-32603`` error model, and the list-changed notification.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, StrictBool, StrictInt

from mcp._model import McpModel, validates
from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED
from mcp.protocol.caching import CacheScope
from mcp.protocol.capability_negotiation import (
  client_should_expect_notification,
  may_client_invoke,
  server_declares,
)
from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.multi_round_trip import (
  discriminate_result_type,
  is_valid_input_required_result,
)
from mcp.protocol.pagination import is_valid_paginated_request_params
from mcp.types.base_metadata import BaseMetadata
from mcp.types.content import parse_content_block
from mcp.types.icon import Icon
from mcp.types.role import Role

#: A single ``ContentBlock`` field — validated (and forbidden types rejected) via
#: :func:`parse_content_block`. (§14.4)
_ContentBlockField = Annotated[Any, BeforeValidator(parse_content_block)]

# Re-export the canonical multi-round-trip "input_required" discriminator value and
# input-required validator (the SAME S17 bindings) so prompt callers handling a
# ``prompts/get`` retry need not reach into multi_round_trip directly. Mirrors the TS
# ``MRTR_RESULT_TYPE`` / ``InputRequiredResultSchema`` re-exports from prompts.ts.
#: The multi-round-trip ``input_required`` discriminator value. (§11, S17)
MRTR_RESULT_TYPE_INPUT_REQUIRED = RESULT_TYPE_INPUT_REQUIRED
#: Validator for a well-formed ``InputRequiredResult`` — the S17 binding a ``prompts/get``
#: retry handler checks an ``input_required`` body against. (§11, S17)
is_valid_prompts_input_required_result = is_valid_input_required_result

PROMPTS_LIST_METHOD = "prompts/list"
PROMPTS_GET_METHOD = "prompts/get"
# Owned by the streaming module in the TS SDK; pinned here as the literal.
PROMPTS_LIST_CHANGED_METHOD = "notifications/prompts/list_changed"

#: Unknown prompt name / missing required argument → -32602. (§18.4, R-18.4-s)
PROMPTS_INVALID_PARAMS_CODE = INVALID_PARAMS_CODE
#: An internal failure resolving prompts/get → -32603. (§18.4, R-18.4-s)
PROMPTS_INTERNAL_ERROR_CODE = -32603


# ─── Capability + gating (§18.1) ──────────────────────────────────────────────

class PromptsCapability(McpModel):
  """The ``prompts`` capability value (§18.1) — OPTIONAL strict-boolean ``listChanged``;
  empty ``{}`` valid; extra members pass through.
  """

  list_changed: StrictBool | None = None


def is_valid_prompts_capability(value: object) -> bool:
  """Return ``True`` for a valid ``prompts`` capability: OPTIONAL boolean ``listChanged``;
  empty ``{}`` valid. (§18.1)
  """
  return validates(PromptsCapability, value)


def server_declares_prompts(server_caps: dict) -> bool:
  """Return ``True`` when the server declares the ``prompts`` capability. (§18.1, R-18.1-a)"""
  return server_declares(server_caps, "prompts")


def may_call_prompt_method(method: str, server_caps: dict) -> bool:
  """Return ``True`` when a client MAY send ``method`` (``prompts/list``/``prompts/get``)
  given the server's capabilities. (§18.1, R-18.1-b)
  """
  return may_client_invoke(method, server_caps)


def may_expect_prompts_list_changed(server_caps: dict) -> bool:
  """Return ``True`` when a client may expect ``notifications/prompts/list_changed`` (needs
  ``prompts.listChanged``). (§18.1, R-18.1-e/-f)
  """
  return client_should_expect_notification(PROMPTS_LIST_CHANGED_METHOD, server_caps)


# ─── Prompt / PromptArgument / PromptMessage (§18.3, §18.5) ────────────────────

class PromptArgument(BaseMetadata):
  """An argument a prompt accepts (§18.3) — ``BaseMetadata`` + OPTIONAL ``description`` and
  strict-boolean ``required``.
  """

  description: str | None = None
  required: StrictBool | None = None


class Prompt(BaseMetadata):
  """A prompt template descriptor (§18.3) — the Python analogue of the TS ``PromptSchema``.

  ``BaseMetadata`` + OPTIONAL ``description``, ``arguments`` (``PromptArgument`` list),
  ``icons``, and ``_meta``.
  """

  description: str | None = None
  arguments: list[PromptArgument] | None = None
  icons: list[Icon] | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_prompt_argument(value: object) -> bool:
  """Return ``True`` for a valid ``PromptArgument`` (§18.3): ``BaseMetadata`` + OPTIONAL
  ``description`` (str) and ``required`` (bool).
  """
  return validates(PromptArgument, value)


def is_valid_prompt(value: object) -> bool:
  """Return ``True`` for a valid ``Prompt`` (§18.3): ``BaseMetadata`` + OPTIONAL
  ``description`` (str), ``arguments`` (list of PromptArgument), ``icons`` (list), ``_meta``.
  """
  return validates(Prompt, value)


def required_argument_names(prompt: dict) -> list[str]:
  """Return the names of arguments declared ``required: true``. (R-18.3-l, R-18.4-e)"""
  return [a["name"] for a in (prompt.get("arguments") or []) if a.get("required") is True]


class PromptMessage(McpModel):
  """One conversation message in a prompt (§18.5) — a ``role`` plus exactly one ``content``
  block (a single object, not an array).
  """

  role: Role
  content: _ContentBlockField


def is_valid_prompt_message(value: object) -> bool:
  """Return ``True`` for a valid ``PromptMessage`` (§18.5): a ``role`` + exactly one
  ``content`` block (a single object, not an array).
  """
  return validates(PromptMessage, value)


# ─── prompts/list (§18.2) ─────────────────────────────────────────────────────

def is_valid_list_prompts_request_params(value: object) -> bool:
  """Return ``True`` for valid ``prompts/list`` request ``params`` (§18.2).

  This is the paginated request shape (S18): an OPTIONAL opaque ``cursor`` (``""`` is a
  valid PRESENT cursor; a client MUST NOT construct/parse/modify it — it is echoed back
  verbatim from a prior ``nextCursor``) and an OPTIONAL ``_meta`` object. The cursor MAY
  be omitted entirely (a first-page request is ``{}``). Reuses
  :func:`is_valid_paginated_request_params` rather than redefining the cursor field.
  (R-18.2-a, R-18.2-b, R-18.2-c)
  """
  return is_valid_paginated_request_params(value)


def resolve_list_prompts_result_type(result: dict) -> str:
  """Resolve a ``prompts/list`` result's ``resultType``, treating absent as ``"complete"``.
  (R-18.2-p)
  """
  raw = result.get("resultType")
  return RESULT_TYPE_COMPLETE if raw is None else str(raw)


class ListPromptsResult(McpModel):
  """The result of ``prompts/list`` (§18.2) — a paginated + cacheable result wrapping the
  REQUIRED ``prompts`` page. The Python analogue of the TS ``ListPromptsResultSchema``.
  """

  result_type: Literal["complete"]
  prompts: list[Prompt]
  next_cursor: str | None = None
  ttl_ms: Annotated[StrictInt, Field(ge=0)]
  cache_scope: CacheScope
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_list_prompts_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``ListPromptsResult`` (§18.2): ``resultType``
  ``"complete"``, ``prompts`` list of valid Prompts, OPTIONAL ``nextCursor``, REQUIRED
  non-negative ``ttlMs`` + ``cacheScope``.
  """
  return validates(ListPromptsResult, value)


@dataclass(frozen=True)
class ListPromptsResultConfig:
  """Server-supplied inputs to a ``ListPromptsResult``."""

  prompts: list
  ttl_ms: int
  cache_scope: str
  next_cursor: str | None = None
  meta: dict | None = None


def build_list_prompts_result(config: ListPromptsResultConfig) -> dict:
  """Build a completed ``ListPromptsResult``; optional fields only when supplied. (§18.2)

  :raises ValueError: when ``ttl_ms`` is negative or not an integer. (R-18.2-h)
  """
  if not isinstance(config.ttl_ms, int) or isinstance(config.ttl_ms, bool) or config.ttl_ms < 0:
    raise ValueError("ListPromptsResult.ttlMs MUST be a non-negative integer (R-18.2-h)")
  result: dict = {
    "resultType": RESULT_TYPE_COMPLETE,
    "prompts": list(config.prompts),
    "ttlMs": config.ttl_ms,
    "cacheScope": config.cache_scope,
  }
  if config.next_cursor is not None:
    result["nextCursor"] = config.next_cursor
  if config.meta is not None:
    result["_meta"] = config.meta
  return result


# ─── prompts/get (§18.4) ──────────────────────────────────────────────────────

def is_valid_get_prompt_request_params(value: object) -> bool:
  """Return ``True`` for valid ``prompts/get`` request ``params`` (§18.4).

  Field constraints (R-18.4-a – R-18.4-k):

  * ``name`` REQUIRED string — the prompt to retrieve; matches a ``Prompt.name``.
  * ``arguments`` OPTIONAL map<string,string> — values keyed by ``PromptArgument.name``;
    each value MUST be a string.
  * ``inputResponses`` OPTIONAL object — multi-round-trip retry responses (§11); omitted
    on a first attempt.
  * ``requestState`` OPTIONAL opaque string — echoed verbatim on retry; omitted on a
    first attempt.
  * ``_meta`` REQUIRED object — every client request carries per-request metadata (S04),
    so it is modeled as required here (matching ``is_valid_request_params``).

  Additional members are tolerated (the model uses ``extra="allow"``).
  """
  return validates(GetPromptRequestParams, value)


class GetPromptRequestParams(McpModel):
  """The ``params`` of a ``prompts/get`` request (§18.4) — the Python analogue of the TS
  ``GetPromptRequestParamsSchema``.

  ``name`` REQUIRED; ``arguments`` OPTIONAL ``map<string,string>``; OPTIONAL multi-round-trip
  retry fields (``inputResponses`` / ``requestState``); ``_meta`` REQUIRED per-request
  metadata. (R-18.4-a – R-18.4-k)
  """

  name: str
  arguments: dict[str, str] | None = None
  input_responses: dict[str, Any] | None = None
  request_state: str | None = None
  meta: dict[str, Any] = Field(alias="_meta")


def resolve_get_prompt_result_type(result: dict) -> str:
  """Resolve a ``prompts/get`` result's ``resultType``, treating absent as ``"complete"``.
  (R-18.4-p)
  """
  raw = result.get("resultType")
  return RESULT_TYPE_COMPLETE if raw is None else str(raw)


class GetPromptResult(McpModel):
  """A completed ``prompts/get`` result (§18.4) — the Python analogue of the TS
  ``GetPromptResultSchema``.

  ``messages`` (REQUIRED ``PromptMessage`` list); OPTIONAL ``description`` and ``_meta``.
  ``resultType`` is OPTIONAL and, when present, MUST be ``"complete"`` (an absent value is
  treated as ``"complete"`` per §3.6; the ``"input_required"`` variant is the S17 result).

  Intentional divergence from the TS ``GetPromptResultSchema`` (an accepted, documented
  decision rather than an oversight): TS types ``resultType`` as the broad, REQUIRED
  ``ResultTypeSchema`` (``z.string()``). Here it is pinned to the single value a *completed*
  prompt result may carry, ``"complete"``, and made optional so an absent discriminator is
  tolerated per R-18.4-p — a stricter, more precise contract than the open string while
  remaining behaviourally equivalent on every test vector. The non-``complete``
  ``"input_required"`` case is the separate S17 ``InputRequiredResult`` and is discriminated
  upstream, never validated as a ``GetPromptResult``. (R-18.4-n, R-18.4-o, R-18.4-p)
  """

  result_type: Literal["complete"] | None = None
  messages: list[PromptMessage]
  description: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_get_prompt_result(value: object) -> bool:
  """Return ``True`` for a well-formed (completed) ``GetPromptResult`` (§18.4): a
  ``messages`` list of valid PromptMessages; OPTIONAL ``description`` (str), ``_meta``.
  """
  return validates(GetPromptResult, value)


@dataclass(frozen=True)
class GetPromptResultConfig:
  """Server-supplied inputs to a completed ``GetPromptResult``."""

  messages: list
  description: str | None = None
  meta: dict | None = None


def build_get_prompt_result(config: GetPromptResultConfig) -> dict:
  """Build a completed ``GetPromptResult`` (``resultType: "complete"``); optional fields
  only when supplied. (§18.4)
  """
  result: dict = {"resultType": RESULT_TYPE_COMPLETE, "messages": list(config.messages)}
  if config.description is not None:
    result["description"] = config.description
  if config.meta is not None:
    result["_meta"] = config.meta
  return result


@dataclass(frozen=True)
class GetPromptResponseDiscrimination:
  """What a client should do after a ``prompts/get`` response (branch on ``resultType``
  before parsing the body, R-18.4-r).
  """

  kind: str  # "complete" | "input_required" | "error"
  result: dict | None = None
  reason: str | None = None
  result_type: str | None = None


def discriminate_get_prompt_response(response: object) -> GetPromptResponseDiscrimination:
  """Branch a ``prompts/get`` response on its ``resultType`` (§18.4/§11): ``"complete"``
  (or absent) + a well-formed body → complete; ``"input_required"`` + a well-formed
  ``InputRequiredResult`` → input_required; any unrecognized ``resultType`` or a body that
  fails its schema → error. (R-18.4-q/-r)

  Reuses :func:`discriminate_result_type` (S17) for the result-type branching so the
  §3.6/§11.5 receiver rules (absent ⇒ complete; unrecognized ⇒ error; malformed
  ``input_required`` ⇒ error) apply uniformly, then validates the completed body against
  :func:`is_valid_get_prompt_result`.
  """
  if not isinstance(response, dict):
    return GetPromptResponseDiscrimination("error", reason="response is not an object", result_type=None)

  branch = discriminate_result_type(response)
  if branch.action == "input_required":
    return GetPromptResponseDiscrimination("input_required", result=branch.result)
  if branch.action == "error":
    raw = response.get("resultType")
    result_type = None if raw is None else str(raw)
    return GetPromptResponseDiscrimination("error", reason=branch.reason, result_type=result_type)

  # action == "complete" — default an absent resultType, then validate the body.
  normalized = (
    {**response, "resultType": RESULT_TYPE_COMPLETE}
    if response.get("resultType") is None
    else response
  )
  if is_valid_get_prompt_result(normalized):
    return GetPromptResponseDiscrimination("complete", result=normalized)
  return GetPromptResponseDiscrimination(
    "error", reason="Malformed GetPromptResult", result_type=RESULT_TYPE_COMPLETE
  )


# ─── prompts/get error model + validation (§18.4) ─────────────────────────────

def build_unknown_prompt_error(name: str) -> dict:
  """Build the -32602 error for an unknown prompt name. (§18.4, R-18.4-d/-s)"""
  return {"code": PROMPTS_INVALID_PARAMS_CODE, "message": f'Invalid params: unknown prompt "{name}"'}


def build_missing_argument_error(missing: list[str]) -> dict:
  """Build the -32602 error for omitted required arguments. (§18.3/§18.4, R-18.4-g/-s)"""
  return {"code": PROMPTS_INVALID_PARAMS_CODE, "message": f"Invalid params: missing required argument(s): {', '.join(missing)}"}


def build_prompt_internal_error(detail: str | None = None) -> dict:
  """Build the -32603 internal error for a prompts/get resolution failure. (§18.4, R-18.4-s)"""
  return {"code": PROMPTS_INTERNAL_ERROR_CODE, "message": f"Internal error: {detail}" if detail else "Internal error"}


@dataclass(frozen=True)
class GetPromptRequestValidation:
  """Outcome of :func:`validate_get_prompt_request`."""

  ok: bool
  name: str | None = None
  arguments: dict | None = None
  error: dict | None = None


def _lookup_prompt(name: str, offered) -> dict | None:
  if isinstance(offered, dict):
    return offered.get(name)
  for prompt in offered:
    if prompt.get("name") == name:
      return prompt
  return None


def validate_get_prompt_request(params: dict, offered) -> GetPromptRequestValidation:
  """Validate a ``prompts/get`` request: it MUST name an offered prompt and supply every
  ``required: true`` argument (unknown-name check first). On failure returns the mapped
  -32602 error. (§18.4, R-18.4-c–R-18.4-g)
  """
  prompt = _lookup_prompt(params.get("name"), offered)
  if prompt is None:
    return GetPromptRequestValidation(False, error=build_unknown_prompt_error(params.get("name")))
  supplied = params.get("arguments") or {}
  missing = [n for n in required_argument_names(prompt) if n not in supplied]
  if missing:
    return GetPromptRequestValidation(False, error=build_missing_argument_error(missing))
  return GetPromptRequestValidation(True, name=params.get("name"), arguments={**supplied})


# ─── notifications/prompts/list_changed (§18.6) ───────────────────────────────

def is_valid_prompt_list_changed_notification_params(value: object) -> bool:
  """Return ``True`` for valid ``notifications/prompts/list_changed`` ``params`` (§18.6).

  When present, the params object MAY carry ONLY a reserved ``_meta`` map (an object) and
  no prompt data; the notification itself carries no prompt payload. Additional
  forward-compatible members are tolerated (the TS schema uses ``.passthrough()``).
  (R-18.6-c, AC-28.40)
  """
  if not isinstance(value, dict):
    return False
  return "_meta" not in value or isinstance(value["_meta"], dict)


def is_valid_prompt_list_changed_notification(value: object) -> bool:
  """Return ``True`` for a well-formed ``notifications/prompts/list_changed`` (no ``id``;
  optional ``_meta``-only params). (§18.6)
  """
  if not isinstance(value, dict) or value.get("jsonrpc") != "2.0":
    return False
  if value.get("method") != PROMPTS_LIST_CHANGED_METHOD or "id" in value:
    return False
  return "params" not in value or is_valid_prompt_list_changed_notification_params(value["params"])


def build_prompt_list_changed_notification(meta: dict | None = None) -> dict:
  """Build a ``notifications/prompts/list_changed``; ``params`` only when ``meta`` supplied.
  A server SHOULD emit it only when it declared ``prompts.listChanged: true``. (§18.6)
  """
  notification: dict = {"jsonrpc": "2.0", "method": PROMPTS_LIST_CHANGED_METHOD}
  if meta is not None:
    notification["params"] = {"_meta": meta}
  return notification


def may_complete_prompt_argument() -> bool:
  """Whether a client MAY request completion for a prompt argument value — always ``True``;
  prompt argument values are always completable. (§18.7, R-18.7-a)
  """
  return True
