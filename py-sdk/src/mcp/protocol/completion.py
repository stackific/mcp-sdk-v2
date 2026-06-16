"""Completion (§19).

Argument autocompletion: a best-effort, advisory facility a server offers so a client can
suggest ranked candidate values for a prompt argument or a resource-template variable. A
single ``completion/complete`` request carries the closed ``ref`` union + the partial
``argument`` (+ optional sibling ``context``); the server returns a ranked, ≤100-item list.
Gated by the ``completions`` capability.

The client-side keystroke debouncer (a UI convenience, §19.5 R-19.5-n) is provided by
:func:`create_completion_debouncer`, a thread-timer analogue of the JS ``setTimeout`` version.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future
from dataclasses import dataclass
from typing import Annotated, Any, Callable, Literal, Protocol, TypeVar

from pydantic import Field, StrictBool

from mcp._model import JsonNumber, McpModel, validates
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

class CompletionsCapability(McpModel):
  """The ``completions`` capability value (§19.1) — an open object; ``{}`` is the RECOMMENDED
  baseline. Extra members pass through.
  """


def is_valid_completions_capability(value: object) -> bool:
  """Return ``True`` for a valid ``completions`` capability — an (open) object; ``{}`` is the
  RECOMMENDED baseline. (§19.1)
  """
  return validates(CompletionsCapability, value)


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

class PromptReference(McpModel):
  """A reference to a prompt for completion (§19.3): ``type == "ref/prompt"`` + string
  ``name`` + OPTIONAL ``title``. (R-19.3-a/-b)
  """

  type: Literal["ref/prompt"]
  name: str
  title: str | None = None


class ResourceTemplateReference(McpModel):
  """A reference to a resource template for completion (§19.3): ``type == "ref/resource"`` +
  string ``uri``. (R-19.3-c/-d)
  """

  type: Literal["ref/resource"]
  uri: str


#: The closed ``ref`` union — discriminated by ``type``; any other ``type`` is rejected.
CompletionReference = Annotated[
  PromptReference | ResourceTemplateReference, Field(discriminator="type")
]


def is_valid_prompt_reference(value: object) -> bool:
  """Return ``True`` for a ``PromptReference``: ``type == "ref/prompt"`` + string ``name``. (R-19.3-a/-b)"""
  return validates(PromptReference, value)


def is_valid_resource_template_reference(value: object) -> bool:
  """Return ``True`` for a ``ResourceTemplateReference``: ``type == "ref/resource"`` + string
  ``uri``. (R-19.3-c/-d)
  """
  return validates(ResourceTemplateReference, value)


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

class CompletionArgument(McpModel):
  """The argument being completed (§19.2): string ``name`` + string ``value`` (MAY be ``""``).
  (R-19.2-g/-h/-i)
  """

  name: str
  value: str


class CompletionContext(McpModel):
  """Already-resolved sibling arguments (§19.2): OPTIONAL ``arguments`` map string→string. (R-19.2-j)"""

  arguments: dict[str, str] | None = None


class CompleteRequestParams(McpModel):
  """The ``params`` of a ``completion/complete`` request (§19.2) — the Python analogue of the
  TS ``CompleteRequestParamsSchema``: a closed ``ref`` union + ``argument`` + OPTIONAL
  ``context`` / ``_meta``.
  """

  ref: CompletionReference
  argument: CompletionArgument
  context: CompletionContext | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_completion_argument(value: object) -> bool:
  """Return ``True`` for a valid ``argument``: string ``name`` + string ``value`` (MAY be ``""``).
  (R-19.2-g/-h/-i)
  """
  return validates(CompletionArgument, value)


def is_valid_completion_context(value: object) -> bool:
  """Return ``True`` for a valid ``context``: OPTIONAL ``arguments`` map of string→string. (R-19.2-j)"""
  return validates(CompletionContext, value)


def is_valid_complete_request_params(value: object) -> bool:
  """Return ``True`` for valid ``completion/complete`` params: closed ``ref`` + ``argument`` +
  optional ``context``/``_meta``. (§19.2)
  """
  return validates(CompleteRequestParams, value)


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

class Completion(McpModel):
  """The ``completion`` object inside a ``CompleteResult`` (§19.4): a ``values`` list of ≤100
  strings; OPTIONAL ``total`` (number) and ``hasMore`` (bool).
  """

  values: Annotated[list[str], Field(max_length=MAX_COMPLETION_VALUES)]
  total: JsonNumber | None = None
  has_more: StrictBool | None = None


class CompleteResult(McpModel):
  """A ``completion/complete`` result (§19.4) — the Python analogue of the TS
  ``CompleteResultSchema``: a REQUIRED ``completion`` object + OPTIONAL ``_meta``.
  ``resultType`` is OPTIONAL and, when present, MUST be ``"complete"`` (absent ⇒ complete).
  """

  result_type: Literal["complete"] | None = None
  completion: Completion
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_completion_object(value: object) -> bool:
  """Return ``True`` for a valid ``completion`` object: ``values`` list of ≤100 strings;
  OPTIONAL ``total`` (number), ``hasMore`` (bool). (§19.4)
  """
  return validates(Completion, value)


def is_valid_complete_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``CompleteResult``: ``resultType`` + ``completion``
  object; OPTIONAL ``_meta``. (§19.4)
  """
  return validates(CompleteResult, value)


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


# ─── Client-side request debouncing (§19.5, R-19.5-n — SHOULD) ─────────────────

_T = TypeVar("_T")


def create_completion_debouncer(run: Callable[[str], _T], wait_ms: int = 150) -> Callable[[str], "Future[_T]"]:
  """Wrap a completion runner so rapid successive calls (one per keystroke) are coalesced into a
  single in-flight ``completion/complete``: each call resets a ``wait_ms`` timer, and only the
  final value after a quiet period is sent. All callers awaiting during a burst resolve with that
  single result. (§19.5, R-19.5-n)

  The thread-timer analogue of the TS ``setTimeout`` debouncer: each returned :class:`~concurrent.
  futures.Future` is fulfilled when the coalesced ``run`` completes (or fails). ``run`` is invoked
  off the calling thread on a :class:`threading.Timer`; a burst of calls within ``wait_ms`` fires
  ``run`` exactly once, with the LAST supplied value.

  :param run: Issues the actual ``completion/complete`` for an argument value.
  :param wait_ms: Quiet period (milliseconds) before the coalesced call fires. Default 150.
  """
  lock = threading.Lock()
  state: dict = {"timer": None, "waiters": []}

  def debounced(value: str) -> "Future[_T]":
    future: Future = Future()
    with lock:
      waiters: list = state["waiters"]
      waiters.append(future)
      timer = state["timer"]
      if timer is not None:
        timer.cancel()

      def fire(value: str = value) -> None:
        with lock:
          batch = state["waiters"]
          state["waiters"] = []
          state["timer"] = None
        try:
          result = run(value)
        except Exception as exc:  # noqa: BLE001 — propagate to every awaiting caller
          for w in batch:
            w.set_exception(exc)
          return
        for w in batch:
          w.set_result(result)

      new_timer = threading.Timer(wait_ms / 1000.0, fire)
      new_timer.daemon = True
      state["timer"] = new_timer
      new_timer.start()
    return future

  return debounced
