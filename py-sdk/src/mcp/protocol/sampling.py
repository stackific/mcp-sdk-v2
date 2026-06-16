"""Sampling (DEPRECATED) (§21.2).

⚠️ DEPRECATED capability — defined only for interoperability; new model-calling
functionality SHOULD integrate directly with a model provider. Sampling lets a server
obtain a model completion by delegating the call to the client (human-in-the-loop),
delivered via the §11 multi-round-trip ``sampling/createMessage`` input request.

This port owns the §21.2 data shapes + behavioural rules: the tool_use/tool_result
content, the sampling message/content union, model preferences + hint matching, tool
choice + includeContext, the request params + result, the capability gating, and the
§21.2.7 ordering/exclusivity + §21.2.10 consent obligations.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, StrictBool, TypeAdapter

from mcp._model import JsonNumber, McpModel, validates
from mcp.protocol.capability_negotiation import (
  is_deprecated_client_capability,
  may_invoke_sampling,
  may_use_include_context,
  may_use_sampling_tools,
)
from mcp.protocol.errors import INVALID_PARAMS_CODE
# Re-exported as part of this module's surface: a sampling result carries a ``resultType``
# discriminator (``"complete"``, or ``"input_required"`` for the §11 MRTR variant), so the
# two values are available from ``mcp.protocol.sampling`` for callers building result vectors.
# The redundant ``as`` aliases mark these as intentional re-exports (PEP 484), so they read as
# public surface rather than dead imports.
from mcp.jsonrpc.payload import (
  RESULT_TYPE_COMPLETE as RESULT_TYPE_COMPLETE,
  RESULT_TYPE_INPUT_REQUIRED as RESULT_TYPE_INPUT_REQUIRED,
)
from mcp.types.content import (
  AudioContent,
  ImageContent,
  TextContent,
  parse_content_block,
)


def _validate_content_blocks(items: Any) -> list:
  """Validate a standard ``ContentBlock`` array (each via :func:`parse_content_block`)."""
  if not isinstance(items, list):
    raise ValueError("content MUST be an array of ContentBlock")
  return [parse_content_block(block) for block in items]

# Re-export the reused bindings so the sampling surface is discoverable in one place
# WITHOUT redefining them (same objects, not duplicates). ``INVALID_PARAMS_CODE`` is the
# ``-32602`` code used for capability-gating rejections (S05); the ``RESULT_TYPE_*`` are
# the S04 §3.6 result discriminators the §21.2.8 result carries.

SAMPLING_DEPRECATED = True
SAMPLING_METHOD = "sampling/createMessage"
SAMPLING_INPUT_REQUEST_METHOD = SAMPLING_METHOD
SAMPLING_REPLACEMENT_GUIDANCE = (
  "Sampling is Deprecated. For new model-calling functionality, integrate directly with a "
  "model provider instead of delegating through sampling/createMessage."
)


def is_sampling_deprecated() -> bool:
  """Return ``True`` — the ``sampling`` capability is Deprecated. (R-21.2-a/§21.2.1)"""
  return is_deprecated_client_capability("sampling")


# ─── content blocks (§21.2.6) ─────────────────────────────────────────────────

def _is_number(value: object) -> bool:
  return isinstance(value, (int, float)) and not isinstance(value, bool)


class ToolUseContent(McpModel):
  """A sampling ``tool_use`` content block (§21.2.6): ``id``, ``name`` + ``input`` object."""

  type: Literal["tool_use"]
  id: str
  name: str
  input: dict[str, Any]


class ToolResultContent(McpModel):
  """A sampling ``tool_result`` content block (§21.2.6): ``toolUseId`` + an S14 ``ContentBlock``
  array; OPTIONAL boolean ``isError``, any-JSON ``structuredContent``, ``_meta``.
  (R-21.2.6-d/-e/-f/-g/-h)
  """

  type: Literal["tool_result"]
  tool_use_id: str
  content: Annotated[list[Any], BeforeValidator(_validate_content_blocks)]
  is_error: StrictBool | None = None
  structured_content: Any = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


#: A sampling content block — tool_use/tool_result plus text/image/audio (resource_link /
#: embedded resource are excluded from sampling). Discriminated by ``type``. (§21.2.6, R-21.2.6-d)
SamplingContentBlock = Annotated[
  ToolUseContent | ToolResultContent | TextContent | ImageContent | AudioContent,
  Field(discriminator="type"),
]

_SAMPLING_CONTENT_BLOCK_ADAPTER: TypeAdapter[Any] = TypeAdapter(SamplingContentBlock)


class SamplingMessage(McpModel):
  """A ``SamplingMessage`` (§21.2.6): ``role`` (user/assistant) + ``content`` (a single block
  or an array of blocks); OPTIONAL ``_meta``.

  .. deprecated::
    Sampling is a Deprecated client capability (§27.3). No direct replacement; use
    Elicitation (§20) for structured user input. Earliest removal: 2026-07-28
    (§27.2/§27.3, R-27.4-a/-b).
  """

  role: Literal["user", "assistant"]
  content: SamplingContentBlock | list[SamplingContentBlock]
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_tool_use_content(block: object) -> bool:
  """Return ``True`` for a ``tool_use`` block: ``id``, ``name`` (str) + ``input`` (object). (§21.2.6)"""
  return validates(ToolUseContent, block)


def is_tool_result_content(block: object) -> bool:
  """Return ``True`` for a ``tool_result`` block: ``toolUseId`` (str) + ``content`` (an S14
  ``ContentBlock`` array); OPTIONAL ``isError``/``structuredContent``/``_meta``. (§21.2.6)
  """
  return validates(ToolResultContent, block)


def tool_result_is_error(block: dict) -> bool:
  """Return the ``tool_result`` block's ``isError``, defaulting to ``False``. (R-21.2.6-g)"""
  return block.get("isError", False) is True


def is_valid_sampling_content_block(block: object) -> bool:
  """Return ``True`` for a sampling content block: text/image/audio or tool_use/tool_result
  (resource_link/embedded resource are excluded from sampling). (§21.2.6, R-21.2.6-d)
  """
  try:
    _SAMPLING_CONTENT_BLOCK_ADAPTER.validate_python(block)
    return True
  except Exception:  # noqa: BLE001 — any validation failure means "not a sampling content block"
    return False


def is_valid_sampling_content(content: object) -> bool:
  """Return ``True`` for sampling content: a single block or an array of blocks. (§21.2.6)"""
  if isinstance(content, list):
    return all(is_valid_sampling_content_block(b) for b in content)
  return is_valid_sampling_content_block(content)


def as_content_array(content: object) -> list:
  """Normalise single-or-array sampling content to a list, for uniform iteration."""
  return list(content) if isinstance(content, list) else [content]


def is_valid_sampling_message(value: object) -> bool:
  """Return ``True`` for a ``SamplingMessage``: ``role`` (user/assistant) + ``content``
  (single block or array); OPTIONAL ``_meta``. (§21.2.6)

  .. deprecated::
    Sampling is a Deprecated client capability (§27.3). No direct replacement; use
    Elicitation (§20) for structured user input. Earliest removal: 2026-07-28
    (§27.2/§27.3, R-27.4-a/-b).
  """
  return validates(SamplingMessage, value)


# ─── ModelHint / ModelPreferences (§21.2.9) ───────────────────────────────────

class ModelHint(McpModel):
  """A ``ModelHint`` (§21.2.9): an object with an OPTIONAL string ``name``; other keys are
  unspecified and pass through. (R-21.2.9-f/-g)
  """

  name: str | None = None


class ModelPreferences(McpModel):
  """``ModelPreferences`` (§21.2.9): OPTIONAL ``hints`` (``ModelHint`` list) and three OPTIONAL
  ``0..1`` priorities.
  """

  hints: list[ModelHint] | None = None
  cost_priority: Annotated[JsonNumber, Field(ge=0, le=1)] | None = None
  speed_priority: Annotated[JsonNumber, Field(ge=0, le=1)] | None = None
  intelligence_priority: Annotated[JsonNumber, Field(ge=0, le=1)] | None = None


def is_valid_model_hint(value: object) -> bool:
  """Return ``True`` for a ``ModelHint``: an object with an OPTIONAL string ``name``;
  keys other than ``name`` are unspecified and pass through. (§21.2.9, R-21.2.9-f/-g)
  """
  return validates(ModelHint, value)


def is_valid_model_preferences(value: object) -> bool:
  """Return ``True`` for ``ModelPreferences``: OPTIONAL ``hints`` (list of {name?}) and the
  three OPTIONAL 0–1 priorities. (§21.2.9)
  """
  return validates(ModelPreferences, value)


def select_first_hint_match(hints: list | None, available_models: list[str]) -> dict | None:
  """Select the first hint whose ``name`` substring matches a candidate model (order-sensitive,
  first match). Returns ``{"hint", "model"}`` or ``None``. (R-21.2.9-b/-f)
  """
  if not hints:
    return None
  for hint in hints:
    needle = hint.get("name")
    if needle is None:
      continue
    model = next((m for m in available_models if needle in m), None)
    if model is not None:
      return {"hint": hint, "model": model}
  return None


# ─── ToolChoice (§21.2.5) / includeContext (§21.2.4) ──────────────────────────

TOOL_CHOICE_MODES = ("auto", "required", "none")
DEFAULT_TOOL_CHOICE = {"mode": "auto"}


class ToolChoice(McpModel):
  """A ``ToolChoice`` (§21.2.5): an object with an OPTIONAL ``mode`` of ``auto``/``required``/
  ``none``; extra members pass through. (R-21.2.4-p, R-21.2.5-a/-b)
  """

  mode: Literal["auto", "required", "none"] | None = None


def is_valid_tool_choice(value: object) -> bool:
  """Return ``True`` for a ``ToolChoice``: an object with an OPTIONAL ``mode`` that, when
  present, MUST be one of ``auto``/``required``/``none``. Extra members pass through.
  (§21.2.5, R-21.2.4-p, R-21.2.5-a/-b)
  """
  return validates(ToolChoice, value)


def resolve_tool_choice(tool_choice: dict | None) -> dict:
  """Resolve the effective ``ToolChoice``, defaulting to ``{"mode": "auto"}``. (R-21.2.4-p)"""
  if tool_choice is not None and tool_choice.get("mode") is not None:
    return {"mode": tool_choice["mode"]}
  return dict(DEFAULT_TOOL_CHOICE)


INCLUDE_CONTEXT_VALUES = ("none", "thisServer", "allServers")

#: The ``includeContext`` values that are Deprecated and gated by ``sampling.context``.
#:
#: .. deprecated::
#:   The ``includeContext`` values ``"thisServer"`` and ``"allServers"`` are Deprecated
#:   (§27.3). No replacement; context management is now host-managed. Earliest removal:
#:   2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
DEPRECATED_INCLUDE_CONTEXT_VALUES = frozenset({"thisServer", "allServers"})


def is_deprecated_include_context(value: str) -> bool:
  """Return ``True`` for a Deprecated ``includeContext`` value. (§21.2.4)

  .. deprecated::
    The ``includeContext`` values ``"thisServer"`` and ``"allServers"`` are Deprecated
    (§27.3). No replacement; context management is now host-managed. Earliest removal:
    2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
  """
  return value in DEPRECATED_INCLUDE_CONTEXT_VALUES


# ─── CreateMessageRequestParams (§21.2.4) ─────────────────────────────────────

class SamplingTool(McpModel):
  """A request-scoped sampling ``Tool`` (§21.2.4): ``name`` + OPTIONAL ``description`` /
  ``inputSchema``. (R-21.2.4-m)
  """

  name: str
  description: str | None = None
  input_schema: dict[str, Any] | None = None


class CreateMessageRequestParams(McpModel):
  """``sampling/createMessage`` params (§21.2.4) — the Python analogue of the TS
  ``CreateMessageRequestParamsSchema``: REQUIRED ``messages`` + numeric ``maxTokens``, plus
  OPTIONAL advisory fields.
  """

  messages: list[SamplingMessage]
  max_tokens: JsonNumber
  include_context: Literal["none", "thisServer", "allServers"] | None = None
  system_prompt: str | None = None
  temperature: JsonNumber | None = None
  stop_sequences: list[str] | None = None
  metadata: dict[str, Any] | None = None
  model_preferences: ModelPreferences | None = None
  tools: list[SamplingTool] | None = None
  tool_choice: ToolChoice | None = None


def is_valid_sampling_tool(value: object) -> bool:
  """Return ``True`` for a request-scoped sampling ``Tool``: ``name`` (str) + optional
  ``description``/``inputSchema``. (§21.2.4, R-21.2.4-m)
  """
  return validates(SamplingTool, value)


def is_valid_create_message_request_params(value: object) -> bool:
  """Return ``True`` for ``sampling/createMessage`` params: REQUIRED ``messages`` array +
  numeric ``maxTokens``; OPTIONAL advisory fields. (§21.2.4)
  """
  return validates(CreateMessageRequestParams, value)


def resolve_include_context(params: dict) -> str:
  """Return the effective ``includeContext``, defaulting to ``"none"``. (§21.2.4)"""
  return params.get("includeContext") or "none"


def is_tool_enabled_request(params: dict) -> bool:
  """Return ``True`` when the request carries ``tools`` or ``toolChoice`` (needs
  ``sampling.tools``). (R-21.2.3-a/-b)
  """
  return params.get("tools") is not None or params.get("toolChoice") is not None


def clamp_to_max_tokens(produced: int, max_tokens: int) -> int:
  """Clamp a produced token count to ``maxTokens`` (a hard upper bound). (R-21.2.4-i/-j)"""
  return max_tokens if produced > max_tokens else produced


# ─── CreateMessageResult (§21.2.8) ────────────────────────────────────────────

STANDARD_STOP_REASONS = ("endTurn", "stopSequence", "maxTokens", "toolUse")


def is_standard_stop_reason(reason: str) -> bool:
  """Return ``True`` for one of the four standard ``stopReason`` values (the field is open).
  (§21.2.8)
  """
  return reason in STANDARD_STOP_REASONS


class CreateMessageResult(McpModel):
  """A ``sampling/createMessage`` result (§21.2.8) — the Python analogue of the TS
  ``CreateMessageResultSchema``: ``role`` + ``content`` + string ``model`` + ``resultType``
  (open string); OPTIONAL open-string ``stopReason`` and ``_meta``.
  """

  role: Literal["user", "assistant"]
  content: SamplingContentBlock | list[SamplingContentBlock]
  model: str
  result_type: str
  stop_reason: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_sampling_create_message_result(value: object) -> bool:
  """Return ``True`` for a ``CreateMessageResult``: ``role`` + ``content`` + string ``model`` +
  ``resultType``; OPTIONAL open-string ``stopReason``, ``_meta``. (§21.2.8)
  """
  return validates(CreateMessageResult, value)


# ─── capability gating (§21.2.3) ──────────────────────────────────────────────

def build_sampling_tools_not_declared_error(field: str) -> dict:
  """Build the -32602 error a client returns when a sampling request includes ``tools``/
  ``toolChoice`` without ``sampling.tools``. (R-21.2.3-b)
  """
  suffix = "n" if field == "tools" else "o"
  return {
    "code": INVALID_PARAMS_CODE,
    "message": f"Sampling request includes `{field}` but the client did not declare `sampling.tools` (R-21.2.3-b, R-21.2.4-{suffix})",
  }


@dataclass(frozen=True)
class SamplingGateResult:
  """Outcome of :func:`gate_sampling_tool_use`."""

  ok: bool
  error: dict | None = None


def gate_sampling_tool_use(client_caps: dict, params: dict) -> SamplingGateResult:
  """Client-side gate: a tool-enabled request without ``sampling.tools`` is rejected
  (``tools`` checked before ``toolChoice``). (R-21.2.3-b)
  """
  if not is_tool_enabled_request(params):
    return SamplingGateResult(True)
  if may_use_sampling_tools(client_caps):
    return SamplingGateResult(True)
  field = "tools" if params.get("tools") is not None else "toolChoice"
  return SamplingGateResult(False, error=build_sampling_tools_not_declared_error(field))


def may_server_send_sampling_request(client_caps: dict, params: dict) -> bool:
  """Server-side gate: a server MAY send only when ``sampling`` is declared, a tool-enabled
  request has ``sampling.tools``, and the ``includeContext`` value is permitted. (R-21.2.3)
  """
  if not may_invoke_sampling(client_caps):
    return False
  if is_tool_enabled_request(params) and not may_use_sampling_tools(client_caps):
    return False
  return may_use_include_context(client_caps, params.get("includeContext"))


@dataclass(frozen=True)
class SamplingRequestValidation:
  """Outcome of :func:`validate_sampling_request`."""

  ok: bool
  params: dict | None = None
  error: dict | None = None


def validate_sampling_request(client_caps: dict, raw_params: object) -> SamplingRequestValidation:
  """Full client-side validation: structural parse (REQUIRED messages + maxTokens) plus the
  tool-use capability gate. (R-21.2.4-a/-h, R-21.2.3-b)
  """
  if not is_valid_create_message_request_params(raw_params):
    return SamplingRequestValidation(
      False, error={"code": INVALID_PARAMS_CODE, "message": "Malformed sampling/createMessage params (messages + maxTokens required)"}
    )
  gate = gate_sampling_tool_use(client_caps, raw_params)
  if not gate.ok:
    return SamplingRequestValidation(False, error=gate.error)
  return SamplingRequestValidation(True, params=raw_params)


# ─── message-content constraints (§21.2.7) ────────────────────────────────────

def validate_user_tool_result_exclusivity(message: dict) -> dict:
  """Validate §21.2.7-a: a ``user`` message with any ``tool_result`` block MUST contain ONLY
  ``tool_result`` blocks. Returns ``{"ok", "reason"?}``.
  """
  if message.get("role") != "user":
    return {"ok": True}
  blocks = as_content_array(message.get("content"))
  if not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in blocks):
    return {"ok": True}
  if all(isinstance(b, dict) and b.get("type") == "tool_result" for b in blocks):
    return {"ok": True}
  return {"ok": False, "reason": "A user message containing tool_result blocks MUST contain ONLY tool_result blocks (R-21.2.7-a)"}


def validate_sampling_message_ordering(messages: list) -> dict:
  """Validate §21.2.7-b: every assistant message with ``tool_use`` blocks MUST be followed
  immediately by a user message of only matching ``tool_result`` blocks (also enforces the
  per-user exclusivity rule). Returns ``{"ok", "reason"?, "index"?}``.
  """
  for i, message in enumerate(messages):
    exclusivity = validate_user_tool_result_exclusivity(message)
    if not exclusivity["ok"]:
      return {"ok": False, "reason": exclusivity["reason"], "index": i}
    if message.get("role") != "assistant":
      continue
    blocks = as_content_array(message.get("content"))
    use_ids = [b["id"] for b in blocks if isinstance(b, dict) and b.get("type") == "tool_use" and isinstance(b.get("id"), str)]
    if not use_ids:
      continue
    nxt = messages[i + 1] if i + 1 < len(messages) else None
    if nxt is None:
      return {"ok": False, "reason": "An assistant message with tool_use MUST be followed immediately by a user tool_result message (R-21.2.7-b)", "index": i}
    if nxt.get("role") != "user":
      return {"ok": False, "reason": "The message after an assistant tool_use MUST be a user message of tool_result blocks (R-21.2.7-b)", "index": i + 1}
    next_blocks = as_content_array(nxt.get("content"))
    if not next_blocks or not all(isinstance(b, dict) and b.get("type") == "tool_result" for b in next_blocks):
      return {"ok": False, "reason": "The user message following an assistant tool_use MUST consist entirely of tool_result blocks (R-21.2.7-b)", "index": i + 1}
    result_ids = {b.get("toolUseId") for b in next_blocks if isinstance(b, dict)}
    for use_id in use_ids:
      if use_id not in result_ids:
        return {"ok": False, "reason": f'tool_use id "{use_id}" has no matching tool_result toolUseId (R-21.2.7-b, R-21.2.6-d)', "index": i + 1}
  return {"ok": True}


def validate_tool_result_references(messages: list) -> dict:
  """Validate §21.2.6-d: every ``tool_result.toolUseId`` refers to an EARLIER ``tool_use.id``.
  Returns ``{"ok", "reason"?, "tool_use_id"?}``.
  """
  seen: set[str] = set()
  for message in messages:
    for block in as_content_array(message.get("content")):
      if not isinstance(block, dict):
        continue
      if block.get("type") == "tool_use":
        if isinstance(block.get("id"), str):
          seen.add(block["id"])
      elif block.get("type") == "tool_result":
        tool_use_id = block.get("toolUseId")
        if not isinstance(tool_use_id, str) or tool_use_id not in seen:
          return {
            "ok": False,
            "reason": "ToolResultContent.toolUseId MUST match the id of a previous ToolUseContent (R-21.2.6-d)",
            "tool_use_id": tool_use_id if isinstance(tool_use_id, str) else None,
          }
  return {"ok": True}


def preserve_content_meta(block: dict) -> dict:
  """Preserve a tool_use/tool_result block's ``_meta`` when carrying it into a later request
  (a shallow copy); other blocks are returned unchanged. (R-21.2.6-c/-h)
  """
  if block.get("type") not in ("tool_use", "tool_result"):
    return block
  return dict(block)


# ─── consent & safety obligations (§21.2.10) ──────────────────────────────────

CLIENT_MODIFIABLE_REQUEST_FIELDS = ("systemPrompt", "includeContext", "temperature", "stopSequences", "metadata")


def is_client_modifiable_request_field(field: str) -> bool:
  """Return ``True`` when ``field`` is one the client MAY modify/omit. (R-21.2.10-e)"""
  return field in CLIENT_MODIFIABLE_REQUEST_FIELDS


@dataclass
class SamplingConsentObligations:
  """The §21.2.10 consent & safety obligations a host claims to meet."""

  human_in_the_loop: bool = False
  user_may_deny: bool = False
  review_prompt_before_sampling: bool = False
  review_result_before_server: bool = False
  may_modify_control_fields: bool = False
  rate_limiting: bool = False
  validate_content: bool = False
  handle_sensitive_data: bool = False
  tool_loop_iteration_limits: bool = False


#: The MUST-level obligations. (R-21.2.10-a/-b/-h)
REQUIRED_CONSENT_OBLIGATIONS = ("human_in_the_loop", "user_may_deny", "handle_sensitive_data")


def unmet_required_consent_obligations(obligations: SamplingConsentObligations) -> list[str]:
  """Return the unmet MUST-level §21.2.10 obligations (empty = satisfied). (R-21.2.10-a/-b/-h)"""
  return [key for key in REQUIRED_CONSENT_OBLIGATIONS if getattr(obligations, key) is not True]


def within_tool_loop_limit(iteration: int, limit: int) -> bool:
  """Return ``True`` when another tool-loop iteration is permitted. (R-21.2.10-i)"""
  return iteration < limit


# ─── S17 envelope reuse (§21.2.2, §21.2.4) ────────────────────────────────────

def is_valid_sampling_input_request(value: object) -> bool:
  """Return ``True`` for the S17 ``sampling/createMessage`` input request carried inside an
  input-required result: ``method`` equals ``sampling/createMessage`` and ``params`` are a
  valid :func:`is_valid_create_message_request_params`. (§21.2.2, §21.2.4)

  This BUILDS ON the §11 multi-round-trip input-request envelope WITHOUT redefining it; the
  ``CreateMessageResult`` is the §21.2.8 :func:`is_valid_sampling_create_message_result`,
  which also satisfies the S17 result minimum (``role``/``content``/``model``). Both accept
  the same wire objects.
  """
  if not isinstance(value, dict) or value.get("method") != SAMPLING_METHOD:
    return False
  return is_valid_create_message_request_params(value.get("params"))
