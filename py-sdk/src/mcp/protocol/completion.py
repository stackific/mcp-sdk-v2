"""Completion (§19).

Argument autocompletion: a best-effort, advisory facility a server offers so a client can
suggest ranked candidate values for a prompt argument or a resource-template variable. A
single ``completion/complete`` request carries the closed ``ref`` union + the partial
``argument`` (+ optional sibling ``context``); the server returns a ranked, ≤100-item list.
Gated by the ``completions`` capability.

The client-side keystroke debouncer (a UI convenience) is deferred — Python's timing model
differs from the JS ``setTimeout`` version; the protocol substance is here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE
from mcp.protocol.capability_negotiation import SERVER_METHOD_CAPABILITY, may_client_invoke, server_declares
from mcp.protocol.errors import INVALID_PARAMS_CODE

COMPLETION_COMPLETE_METHOD = "completion/complete"

#: No `completions` capability → -32601. (§19.1, R-19.1-d)
COMPLETION_METHOD_NOT_FOUND_CODE = -32601
#: Invalid params / unknown ref / unknown argument → -32602. (§19.5, R-19.5-r/-s)
COMPLETION_INVALID_PARAMS_CODE = INVALID_PARAMS_CODE
#: Internal failure computing completions → -32603. (§19.5, R-19.5-t)
COMPLETION_INTERNAL_ERROR_CODE = -32603
#: Maximum items the completion.values array may carry. (§19.4, R-19.4-c)
MAX_COMPLETION_VALUES = 100

PROMPT_REFERENCE_TYPE = "ref/prompt"
RESOURCE_TEMPLATE_REFERENCE_TYPE = "ref/resource"


# ─── Capability (§19.1) ───────────────────────────────────────────────────────

def is_valid_completions_capability(value: object) -> bool:
  """Return ``True`` for a valid ``completions`` capability — an (open) object; ``{}`` is the
  RECOMMENDED baseline. (§19.1)
  """
  return isinstance(value, dict)


def build_completions_capability() -> dict:
  """Build the RECOMMENDED baseline ``completions`` capability — ``{}``. (§19.1, R-19.1-b)"""
  return {}


def server_declares_completions(server_caps: dict) -> bool:
  """Return ``True`` when the server declares the ``completions`` capability. (§19.1)"""
  return server_declares(server_caps, "completions")


def may_call_completion(server_caps: dict) -> bool:
  """Return ``True`` when a client MAY send ``completion/complete``. (§19.1, R-19.1-c)"""
  return may_client_invoke(COMPLETION_COMPLETE_METHOD, server_caps)


def completion_gated_by_completions() -> bool:
  """Self-check: the shared gate binds ``completion/complete`` to ``completions``. (§19.1)"""
  return SERVER_METHOD_CAPABILITY.get(COMPLETION_COMPLETE_METHOD) == "completions"


# ─── Reference union (§19.3) ──────────────────────────────────────────────────

def is_valid_prompt_reference(value: object) -> bool:
  """Return ``True`` for a ``PromptReference``: ``type == "ref/prompt"`` + string ``name``. (R-19.3-a/-b)"""
  if not isinstance(value, dict) or value.get("type") != PROMPT_REFERENCE_TYPE:
    return False
  if not isinstance(value.get("name"), str):
    return False
  return "title" not in value or isinstance(value["title"], str)


def is_valid_resource_template_reference(value: object) -> bool:
  """Return ``True`` for a ``ResourceTemplateReference``: ``type == "ref/resource"`` + string
  ``uri``. (R-19.3-c/-d)
  """
  return isinstance(value, dict) and value.get("type") == RESOURCE_TEMPLATE_REFERENCE_TYPE and isinstance(value.get("uri"), str)


def is_valid_completion_reference(value: object) -> bool:
  """Return ``True`` for a member of the closed ``ref`` union; any other ``type`` is rejected.
  (§19.3, R-19.2-c–R-19.2-e, R-19.3-f)
  """
  return is_valid_prompt_reference(value) or is_valid_resource_template_reference(value)


def is_prompt_reference(ref: dict) -> bool:
  """Return ``True`` when ``ref`` is a prompt reference. (R-19.2-d)"""
  return ref.get("type") == PROMPT_REFERENCE_TYPE


def is_resource_template_reference(ref: dict) -> bool:
  """Return ``True`` when ``ref`` is a resource-template reference. (R-19.2-d)"""
  return ref.get("type") == RESOURCE_TEMPLATE_REFERENCE_TYPE


# ─── CompleteRequestParams (§19.2) ────────────────────────────────────────────

def is_valid_completion_argument(value: object) -> bool:
  """Return ``True`` for a valid ``argument``: string ``name`` + string ``value`` (MAY be ``""``).
  (R-19.2-g/-h/-i)
  """
  return isinstance(value, dict) and isinstance(value.get("name"), str) and isinstance(value.get("value"), str)


def is_valid_completion_context(value: object) -> bool:
  """Return ``True`` for a valid ``context``: OPTIONAL ``arguments`` map of string→string. (R-19.2-j)"""
  if not isinstance(value, dict):
    return False
  if "arguments" in value:
    args = value["arguments"]
    if not isinstance(args, dict) or not all(isinstance(v, str) for v in args.values()):
      return False
  return True


def is_valid_complete_request_params(value: object) -> bool:
  """Return ``True`` for valid ``completion/complete`` params: closed ``ref`` + ``argument`` +
  optional ``context``/``_meta``. (§19.2)
  """
  if not isinstance(value, dict):
    return False
  if not is_valid_completion_reference(value.get("ref")):
    return False
  if not is_valid_completion_argument(value.get("argument")):
    return False
  if "context" in value and not is_valid_completion_context(value["context"]):
    return False
  return "_meta" not in value or isinstance(value["_meta"], dict)


def build_complete_request_params(ref: dict, argument: dict, *, context: dict | None = None, meta: dict | None = None) -> dict:
  """Build ``completion/complete`` params; ``context``/``_meta`` only when supplied. (§19.2)

  :raises ValueError: when ``context.arguments`` includes the argument being completed. (R-19.2-k)
  """
  if context is not None and isinstance(context.get("arguments"), dict) and argument["name"] in context["arguments"]:
    raise ValueError(f'context.arguments MUST NOT include the argument being completed ("{argument["name"]}") (R-19.2-k)')
  params: dict = {"ref": ref, "argument": argument}
  if context is not None:
    params["context"] = context
  if meta is not None:
    params["_meta"] = meta
  return params


# ─── CompleteResult (§19.4) ───────────────────────────────────────────────────

def _is_number(value: object) -> bool:
  return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_valid_completion_object(value: object) -> bool:
  """Return ``True`` for a valid ``completion`` object: ``values`` list of ≤100 strings;
  OPTIONAL ``total`` (number), ``hasMore`` (bool). (§19.4)
  """
  if not isinstance(value, dict):
    return False
  values = value.get("values")
  if not isinstance(values, list) or len(values) > MAX_COMPLETION_VALUES or not all(isinstance(v, str) for v in values):
    return False
  if "total" in value and not _is_number(value["total"]):
    return False
  return "hasMore" not in value or isinstance(value["hasMore"], bool)


def is_valid_complete_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``CompleteResult``: ``resultType`` + ``completion``
  object; OPTIONAL ``_meta``. (§19.4)
  """
  if not isinstance(value, dict):
    return False
  if resolve_complete_result_type(value) != "complete":
    return False
  if not is_valid_completion_object(value.get("completion")):
    return False
  return "_meta" not in value or isinstance(value["_meta"], dict)


def resolve_complete_result_type(result: dict) -> str:
  """Resolve a result's ``resultType``, treating absent as ``"complete"``. (R-19.4-l)"""
  raw = result.get("resultType")
  return RESULT_TYPE_COMPLETE if raw is None else str(raw)


def resolve_has_more(completion: dict) -> bool:
  """Resolve the ``hasMore`` truncation hint, treating absent/non-boolean as ``False``. (R-19.4-i)"""
  return completion.get("hasMore") is True


@dataclass(frozen=True)
class CompleteResultConfig:
  """Server-supplied inputs to a ``CompleteResult``."""

  values: list
  total: int | None = None
  has_more: bool | None = None
  meta: dict | None = None


def build_complete_result(config: CompleteResultConfig) -> dict:
  """Build a successful ``CompleteResult`` (``resultType: "complete"``); optional fields only
  when supplied. (§19.4)

  :raises ValueError: when more than 100 ``values`` are supplied. (R-19.4-c/-d)
  """
  if len(config.values) > MAX_COMPLETION_VALUES:
    raise ValueError(f"CompleteResult.completion.values MUST NOT exceed {MAX_COMPLETION_VALUES} items (R-19.4-c)")
  completion: dict = {"values": list(config.values)}
  if config.total is not None:
    completion["total"] = config.total
  if config.has_more is not None:
    completion["hasMore"] = config.has_more
  result: dict = {"resultType": RESULT_TYPE_COMPLETE, "completion": completion}
  if config.meta is not None:
    result["_meta"] = config.meta
  return result


def compute_completion(ranked: list, *, total: int | None = None) -> dict:
  """Reference engine: cap an already-ranked list at 100 and signal truncation. ``total``
  defaults to ``len(ranked)``; ``hasMore`` is set when matches were dropped. (§19.4, R-19.4-c–-h)
  """
  values = list(ranked[:MAX_COMPLETION_VALUES])
  true_total = total if total is not None else len(ranked)
  completion: dict = {"values": values}
  if true_total > len(values):
    completion["total"] = true_total
    completion["hasMore"] = True
  return completion


def prefix_match(seed: str, candidates: list, *, case_insensitive: bool = False) -> list[str]:
  """Return the ``candidates`` starting with ``seed`` (input order). Empty seed matches all.
  The simplest SHOULD-permitted strategy; a server MAY substitute any matcher. (§19.5, R-19.5-d)
  """
  if seed == "":
    return list(candidates)
  needle = seed.lower() if case_insensitive else seed
  return [c for c in candidates if (c.lower() if case_insensitive else c).startswith(needle)]


# ─── Error model + validation (§19.5) ─────────────────────────────────────────

def build_completion_not_supported_error() -> dict:
  """Build the -32601 error for ``completion/complete`` without the ``completions`` capability.
  (§19.1, R-19.1-d)
  """
  return {"code": COMPLETION_METHOD_NOT_FOUND_CODE, "message": f"Method not found: {COMPLETION_COMPLETE_METHOD}"}


def build_completion_invalid_params_error(detail: str) -> dict:
  """Build a -32602 error for malformed ``completion/complete`` params. (§19.5, R-19.5-s)"""
  return {"code": COMPLETION_INVALID_PARAMS_CODE, "message": f"Invalid params: {detail}"}


def build_unknown_reference_error(detail: str) -> dict:
  """Build the -32602 error for an unknown ref / unknown argument (NOT a not-found result).
  (§19.5, R-19.5-r)
  """
  return {"code": COMPLETION_INVALID_PARAMS_CODE, "message": f"Invalid params: {detail}"}


def build_completion_internal_error(detail: str | None = None) -> dict:
  """Build the -32603 error for an internal completion failure. (§19.5, R-19.5-t)"""
  return {"code": COMPLETION_INTERNAL_ERROR_CODE, "message": f"Internal error: {detail}" if detail else "Internal error"}


@dataclass(frozen=True)
class CompleteRequestValidation:
  """Outcome of :func:`validate_complete_request`."""

  ok: bool
  params: dict | None = None
  error: dict | None = None


def validate_complete_request(params: object) -> CompleteRequestValidation:
  """Validate the SHAPE of ``completion/complete`` params (§19.2/§19.3), mapping failures to
  -32602: ``ref`` REQUIRED + closed union, ``argument`` REQUIRED string name/value, and (when
  present) ``context.arguments`` keys MUST NOT include ``argument.name``. The unknown-ref /
  unknown-argument checks need the catalog — see :func:`resolve_completion_target`.
  """
  if not isinstance(params, dict):
    return CompleteRequestValidation(False, error=build_completion_invalid_params_error("params must be an object"))
  if params.get("ref") is None:
    return CompleteRequestValidation(False, error=build_completion_invalid_params_error('"ref" is required'))
  if not is_valid_completion_reference(params.get("ref")):
    return CompleteRequestValidation(False, error=build_completion_invalid_params_error('"ref" is not a valid ref/prompt or ref/resource'))
  if not is_valid_completion_argument(params.get("argument")):
    return CompleteRequestValidation(False, error=build_completion_invalid_params_error('"argument" must have string name and value'))
  if "context" in params and not is_valid_completion_context(params["context"]):
    return CompleteRequestValidation(False, error=build_completion_invalid_params_error('"context.arguments" must be a string map'))
  ctx_args = (params.get("context") or {}).get("arguments")
  if isinstance(ctx_args, dict) and params["argument"]["name"] in ctx_args:
    return CompleteRequestValidation(
      False,
      error=build_completion_invalid_params_error(
        f'context.arguments MUST NOT include the argument being completed ("{params["argument"]["name"]}")'
      ),
    )
  return CompleteRequestValidation(True, params=params)


# ─── Reference resolution against a server catalog (§19.5) ─────────────────────

class CompletionCatalog(Protocol):
  """The server's catalog used to detect an unknown ref / unknown argument. (R-19.5-r)"""

  def prompt_argument_names(self, name: str) -> list[str] | None: ...
  def resource_template_variable_names(self, uri: str) -> list[str] | None: ...


@dataclass(frozen=True)
class CompletionTargetResolution:
  """Outcome of :func:`resolve_completion_target`."""

  ok: bool
  error: dict | None = None


def resolve_completion_target(params: dict, catalog: CompletionCatalog) -> CompletionTargetResolution:
  """Resolve a validated ``ref`` + ``argument.name`` against the server's catalog (R-19.5-r):
  an unknown prompt / template, or an argument not part of the target, is rejected with
  -32602 (NOT a not-found result).
  """
  arg_name = params["argument"]["name"]
  ref = params["ref"]
  if is_prompt_reference(ref):
    names = catalog.prompt_argument_names(ref["name"])
    if names is None:
      return CompletionTargetResolution(False, error=build_unknown_reference_error(f'unknown prompt "{ref["name"]}"'))
    if arg_name not in names:
      return CompletionTargetResolution(False, error=build_unknown_reference_error(f'prompt "{ref["name"]}" has no argument "{arg_name}"'))
    return CompletionTargetResolution(True)
  variables = catalog.resource_template_variable_names(ref["uri"])
  if variables is None:
    return CompletionTargetResolution(False, error=build_unknown_reference_error(f'unknown resource template "{ref["uri"]}"'))
  if arg_name not in variables:
    return CompletionTargetResolution(False, error=build_unknown_reference_error(f'resource template "{ref["uri"]}" has no variable "{arg_name}"'))
  return CompletionTargetResolution(True)


def prompt_argument_names_of(prompt: dict) -> list[str]:
  """Return a prompt's declared argument names, for a :class:`CompletionCatalog`. (R-19.5-r)"""
  return [arg["name"] for arg in (prompt.get("arguments") or [])]


def resource_template_variable_names_of(template: dict, extract_variables) -> list[str]:
  """Return a template's URI-template variable names, using the caller-supplied extractor
  (keep the §17.4 binding as the single source of template-variable parsing). (R-19.5-r)
  """
  return list(extract_variables(template["uriTemplate"]))
