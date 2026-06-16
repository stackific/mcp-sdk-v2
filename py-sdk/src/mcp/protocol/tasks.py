"""The Tasks extension: model, status lifecycle, capability gating (§25.1–§25.6).

An opt-in (``io.modelcontextprotocol/tasks``) mechanism that turns a long-running,
server-handled operation into a durable, pollable **task** rather than a blocking
request/response. The server returns an opaque task handle immediately (a
``CreateTaskResult`` whose ``resultType`` is ``"task"``) and the client polls
``tasks/get`` for the eventual outcome — all over single ``application/json``
responses (no streaming required).

This module owns the model only:
  - the extension identifier and its exact, case-sensitive matching (§25.1);
  - the ``TasksExtensionCapability`` (empty) settings value and the per-request
    opt-in / server-advertisement negotiation and gating rules (§25.2);
  - task augmentation: ``resultType: "task"`` substitution and ``CreateTaskResult``
    (§25.3);
  - the ``Task`` / ``DetailedTask`` object types and the ``TaskStatus`` enum (§25.4);
  - the five-state status lifecycle and its transition/immutability rules (§25.5);
  - the durability / statelessness guarantees and ``ttlMs`` expiry → not-found
    behavior (§25.6).

The ``tasks/get`` / ``tasks/update`` / ``tasks/cancel`` operational shapes,
notifications and cleanup are owned by :mod:`mcp.protocol.tasks_lifecycle` (S40);
the method-name constants and the subscription helpers it reuses are defined here
(the canonical home) and imported from there.

Where the TypeScript SDK uses zod schemas (``TaskSchema`` etc.) backed by
``.passthrough()`` discriminated unions, the Python port mirrors the existing
py-sdk convention: ``is_valid_*`` predicates over plain wire ``dict`` objects that
tolerate (preserve) additional members, exactly as ``mcp.protocol.tools`` does.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field

from mcp._model import JsonNumber, McpModel, validates
from mcp.jsonrpc.payload import is_valid_mcp_error
from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.extension_mechanism import (
  active_set_for_request,
  extension_ids_match,
  may_emit_extension_surface,
)
from mcp.protocol.extensions import is_extension_advertised
from mcp.protocol.multi_round_trip import is_valid_input_request

# ─── §25.1 — Extension identifier ───────────────────────────────────────────────

#: The exact, case-sensitive identifier of the Tasks extension. (§25.1, R-25.1-a)
#:
#: The key used in the extensions capability map. A conforming implementation MUST
#: treat it as an opaque, exact string and MUST NOT match it case-insensitively or by
#: prefix — use :func:`is_tasks_extension_id`, never an ad-hoc comparison.
TASKS_EXTENSION_ID = "io.modelcontextprotocol/tasks"


def is_tasks_extension_id(identifier: str) -> bool:
  """Return ``True`` only when ``identifier`` is byte-identical to the Tasks id. (§25.1, R-25.1-a)

  Comparison is exact and case-sensitive: identifiers differing only in case
  (``IO.MODELCONTEXTPROTOCOL/TASKS``) or by a prefix/suffix
  (``io.modelcontextprotocol/tasks-foo``) are NON-matching. Delegates to the S38
  octet-for-octet :func:`extension_ids_match` so the no-case-folding rule is shared.
  """
  return extension_ids_match(identifier, TASKS_EXTENSION_ID)


# ─── §25.3 — The "task" result discriminator ────────────────────────────────────

#: The literal ``resultType`` discriminator marking a result as a task handle. (§25.3, R-25.3-c)
#:
#: An extension-contributed ``resultType`` value (NOT one of the core values); it is
#: only valid when the Tasks extension is active for the interaction (§24.5 / S38). A
#: client that declared the capability MUST dispatch on this via
#: :func:`is_task_result_type` / :func:`is_create_task_result`.
TASK_RESULT_TYPE = "task"


def is_task_result_type(result_type: object) -> bool:
  """Return ``True`` when ``result_type`` is the ``"task"`` discriminator. (R-25.3-c)"""
  return result_type == TASK_RESULT_TYPE


# ─── Method names (§25.7–§25.10) ────────────────────────────────────────────────
#
# The Tasks request/notification method names. Owned here (the model module) so the
# operational S40 module (:mod:`mcp.protocol.tasks_lifecycle`) imports them from a
# single canonical home, matching how the TS SDK re-exports them.

TASKS_GET_METHOD = "tasks/get"
TASKS_UPDATE_METHOD = "tasks/update"
TASKS_CANCEL_METHOD = "tasks/cancel"
TASKS_NOTIFICATION_METHOD = "notifications/tasks"

#: The three client→server Tasks request methods. (§25.7–§25.9)
TASK_LIFECYCLE_METHODS = (TASKS_GET_METHOD, TASKS_UPDATE_METHOD, TASKS_CANCEL_METHOD)


def is_task_lifecycle_method(method: str) -> bool:
  """Return ``True`` when ``method`` is one of the three Tasks request methods."""
  return method in TASK_LIFECYCLE_METHODS


# ─── §25.2 — Capability declaration & settings ──────────────────────────────────


class TasksExtensionCapability(McpModel):
  """The Tasks extension settings value (§25.2) — any JSON object (canonically ``{}``);
  unrecognized members pass through. (R-25.2-a, R-25.2-b)
  """


def is_tasks_extension_capability(value: object) -> bool:
  """Return ``True`` for a valid Tasks extension settings value — any JSON object.
  (§25.2, R-25.2-a, R-25.2-b)
  """
  return validates(TasksExtensionCapability, value)


def _is_extension_advertised(extensions: object, extension_id: str) -> bool:
  """Return ``True`` when an ``extensions`` map declares ``extension_id`` (exact key,
  non-``None`` object settings value). Delegates to S11 :func:`is_extension_advertised`.
  """
  return is_extension_advertised(extensions, extension_id)


def client_declares_tasks_for_request(request_client_extensions: object) -> bool:
  """Return ``True`` when this request's client ``extensions`` declare Tasks. (§25.2, R-25.2-c)

  Because the protocol is stateless and per-request, a request is eligible for
  augmentation ONLY when this declaration is present in THAT request's capabilities; a
  request lacking it is not eligible.
  """
  return _is_extension_advertised(request_client_extensions, TASKS_EXTENSION_ID)


def server_advertises_tasks(server_extensions: object) -> bool:
  """Return ``True`` when the server's advertised ``extensions`` declare Tasks. (§25.2)"""
  return _is_extension_advertised(server_extensions, TASKS_EXTENSION_ID)


def is_tasks_active_for_request(request_client_extensions: object, server_extensions: object) -> bool:
  """Return ``True`` when the Tasks extension is ACTIVE for one request. (§25.2, R-25.2-c/d)

  Active iff this request's client capabilities declare the extension AND the server
  advertises it. Computed per request under the stateless model via the S38
  :func:`active_set_for_request` / :func:`may_emit_extension_surface` — nothing from a
  prior request is consulted (§24.4).
  """
  active = active_set_for_request(request_client_extensions, server_extensions)
  return may_emit_extension_surface(TASKS_EXTENSION_ID, active)


def may_return_task_handle(request_client_extensions: object, server_extensions: object) -> bool:
  """Decide whether a server MAY return a task handle for a request. (R-25.2-d/-g, R-25.3-a/-b)

  Returns ``True`` only when the extension is active for THIS request
  (:func:`is_tasks_active_for_request`). When ``True``, the substitution is entirely
  server-directed: the server MAY (but need not) turn any individual eligible request
  into a task, with no per-call flag or warmup beyond the per-request capability. When
  ``False``, the server MUST NOT return a result with ``resultType`` equal to ``"task"``.
  """
  return is_tasks_active_for_request(request_client_extensions, server_extensions)


# ─── §25.5 — TaskStatus ─────────────────────────────────────────────────────────

#: The five case-sensitive lifecycle states a task may be in, in spec order. (§25.5, R-25.5-a)
#:
#:   - ``working``        — operation in progress (non-terminal);
#:   - ``input_required`` — server requires client input before continuing
#:                          (non-terminal; outstanding requests in ``inputRequests``);
#:   - ``completed``      — finished successfully (terminal; result inline);
#:   - ``failed``         — a JSON-RPC error occurred (terminal; error inline);
#:   - ``cancelled``      — ended via cancellation (terminal).
TASK_STATUSES = ("working", "input_required", "completed", "failed", "cancelled")

#: The three terminal states; their status + inline outcome are immutable. (§25.5, R-25.5-b)
TERMINAL_TASK_STATUSES = frozenset({"completed", "failed", "cancelled"})

#: The two non-terminal states, in which a task may still transition. (§25.5)
NON_TERMINAL_TASK_STATUSES = frozenset({"working", "input_required"})


def is_task_status(value: object) -> bool:
  """Return ``True`` when ``value`` is exactly one of the five ``TaskStatus`` values. (R-25.5-a)"""
  return value in TASK_STATUSES


def is_terminal_task_status(status: str) -> bool:
  """Return ``True`` for a terminal state (``completed`` / ``failed`` / ``cancelled``). (R-25.5-b)"""
  return status in TERMINAL_TASK_STATUSES


# ─── §25.5 — Legal status transitions ───────────────────────────────────────────


def is_legal_task_transition(from_status: str, to_status: str) -> bool:
  """Return ``True`` when ``from_status`` → ``to_status`` is legal. (§25.5, R-25.5-b/-c)

  - From a terminal state: no transition is ever legal — the state is immutable
    (R-25.5-b). (A "transition" to the SAME terminal state is likewise rejected.)
  - From ``working``: MAY go to ``input_required`` or any terminal state (R-25.5-c).
  - From ``input_required``: MAY go back to ``working`` or to any terminal state.

  A self-transition between identical NON-terminal states (``working`` → ``working``,
  ``input_required`` → ``input_required``) is not a state change and returns ``False``.
  """
  if is_terminal_task_status(from_status):
    return False
  if from_status == to_status:
    return False
  if from_status == "working":
    return to_status == "input_required" or is_terminal_task_status(to_status)
  if from_status == "input_required":
    return to_status == "working" or is_terminal_task_status(to_status)
  return False


def assert_legal_task_transition(from_status: str, to_status: str) -> None:
  """Assert a proposed status transition is legal, raising when it is not. (R-25.5-b/-c)

  Useful for server-side state machines that mutate a stored task: it refuses any
  transition out of a terminal state (the immutability guarantee) and any illegal
  non-terminal move.

  :raises ValueError: when ``from_status`` → ``to_status`` is not a legal transition.
  """
  if not is_legal_task_transition(from_status, to_status):
    if is_terminal_task_status(from_status):
      raise ValueError(
        f'Task in terminal state "{from_status}" is immutable and MUST NOT transition '
        f'to "{to_status}" (R-25.5-b)'
      )
    raise ValueError(f'Illegal task transition "{from_status}" → "{to_status}" (R-25.5-c)')


# ─── §25.4 — Task ───────────────────────────────────────────────────────────────


def is_valid_task_ttl_ms(value: object) -> bool:
  """Return ``True`` for a valid ``ttlMs``: a non-negative number, or ``None`` (unbounded).
  (§25.4, R-25.4-b/-c)

  ``None`` means unbounded lifetime. A non-negative ``int`` or ``float`` is accepted;
  ``bool`` is not a number here, and a negative value is rejected.
  """
  if value is None:
    return True
  if isinstance(value, bool):
    return False
  return isinstance(value, (int, float)) and value >= 0


#: The five case-sensitive task lifecycle states as a field type. (§25.5)
TaskStatus = Literal["working", "input_required", "completed", "failed", "cancelled"]


class Task(McpModel):
  """A durable task handle (§25.4) — the Python analogue of the TS ``TaskSchema``.

  REQUIRED: ``taskId`` (opaque string), ``status``, ``createdAt`` / ``lastUpdatedAt``
  (RFC 3339 strings), ``ttlMs`` (non-negative number or ``null`` = unbounded — the key MUST
  be present). OPTIONAL: ``statusMessage``, ``pollIntervalMs`` (non-negative). Additional
  members pass through. (R-25.4-a/-b/-c)
  """

  task_id: str
  status: TaskStatus
  created_at: str
  last_updated_at: str
  ttl_ms: Annotated[JsonNumber, Field(ge=0)] | None
  status_message: str | None = None
  poll_interval_ms: Annotated[JsonNumber, Field(ge=0)] | None = None


def is_task(value: object) -> bool:
  """Return ``True`` for a well-formed ``Task``. (§25.4)

  REQUIRED (R-25.4-b): ``taskId`` (opaque string, R-25.4-a), ``status`` (one of the
  five values), ``createdAt`` / ``lastUpdatedAt`` (RFC 3339 strings), ``ttlMs``
  (non-negative number or ``null``). OPTIONAL: ``statusMessage`` (string),
  ``pollIntervalMs`` (non-negative number). Additional members are tolerated.
  """
  return validates(Task, value)


# ─── §25.3 — CreateTaskResult (the task handle) ─────────────────────────────────


class CreateTaskResult(Task):
  """A ``CreateTaskResult`` task handle (§25.3) — a ``Result`` with ``resultType: "task"``
  carrying all ``Task`` fields plus the OPTIONAL result-level ``_meta``. (R-25.3-c)
  """

  result_type: Literal["task"]
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_create_task_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``CreateTaskResult``: a ``Result`` with
  ``resultType: "task"`` carrying all ``Task`` fields. (§25.3, R-25.3-c, AC-39.8)
  """
  return validates(CreateTaskResult, value)


#: The two dispositions of a result received for an eligible (task-capable) request.
#:
#:   - ``"task"``     — the payload is a ``CreateTaskResult`` task handle;
#:   - ``"ordinary"`` — the payload is the request's ordinary result shape.
ELIGIBLE_RESULT_DISPOSITIONS = ("task", "ordinary")


def dispatch_eligible_result(result: object) -> tuple[str, object]:
  """Dispatch a result received for an eligible request on its ``resultType``.
  (R-25.2-e, R-25.3-c, AC-39.5)

  A client that declared the Tasks capability MUST be prepared for EITHER the
  request's ordinary result OR a task handle in its place; this realizes that
  obligation. Returns ``("task", result)`` when ``resultType`` is ``"task"`` AND the
  payload is a well-formed ``CreateTaskResult``; otherwise ``("ordinary", result)``
  and the result is returned verbatim for the caller's own ``resultType`` interpretation.

  Note: a payload whose ``resultType`` is ``"task"`` but which is NOT a well-formed
  ``CreateTaskResult`` is returned as ``("ordinary", result)`` here; structural
  validation of a malformed task handle is the caller's concern (re-check with
  :func:`is_create_task_result`).
  """
  if (
    isinstance(result, dict)
    and is_task_result_type(result.get("resultType"))
    and is_create_task_result(result)
  ):
    return ("task", result)
  return ("ordinary", result)


# ─── §25.4 — DetailedTask (discriminated by status) ─────────────────────────────


def is_valid_task_input_requests(value: object) -> bool:
  """Return ``True`` for a valid ``inputRequests`` map: outstanding server requests
  keyed by opaque string, each a well-formed ``InputRequest``. (§25.4, §11.2)

  Keys are opaque strings chosen by the server; each value is an ``InputRequest`` (S17 /
  §11.2 — e.g. an elicitation), validated by the S17 :func:`is_valid_input_request`.
  An empty map ``{}`` is valid (no outstanding requests).
  """
  if not isinstance(value, dict):
    return False
  return all(is_valid_input_request(req) for req in value.values())


def is_working_task(value: object) -> bool:
  """Return ``True`` for the ``status: "working"`` variant — a ``Task`` with no extra
  payload field. (§25.4)
  """
  return is_task(value) and isinstance(value, dict) and value.get("status") == "working"


def is_input_required_task(value: object) -> bool:
  """Return ``True`` for the ``status: "input_required"`` variant — a ``Task`` carrying the
  outstanding ``inputRequests`` the client must fulfill before continuing. (§25.4)
  """
  if not (is_task(value) and isinstance(value, dict)):
    return False
  if value.get("status") != "input_required":
    return False
  return is_valid_task_input_requests(value.get("inputRequests"))


def is_completed_task(value: object) -> bool:
  """Return ``True`` for the ``status: "completed"`` variant — a ``Task`` carrying the
  verbatim ordinary ``result`` the augmented request would have produced. (§25.4, R-25.5-d)
  """
  if not (is_task(value) and isinstance(value, dict)):
    return False
  if value.get("status") != "completed":
    return False
  return isinstance(value.get("result"), dict)


def is_failed_task(value: object) -> bool:
  """Return ``True`` for the ``status: "failed"`` variant — a ``Task`` carrying the inline
  JSON-RPC ``error`` object that occurred during execution. (§25.4, R-25.5-d)
  """
  if not (is_task(value) and isinstance(value, dict)):
    return False
  if value.get("status") != "failed":
    return False
  return is_valid_mcp_error(value.get("error"))


def is_cancelled_task(value: object) -> bool:
  """Return ``True`` for the ``status: "cancelled"`` variant — a ``Task`` with no extra
  payload field. (§25.4)
  """
  return is_task(value) and isinstance(value, dict) and value.get("status") == "cancelled"


def is_detailed_task(value: object) -> bool:
  """Return ``True`` for a well-formed ``DetailedTask``: the ``tasks/get`` shape, a union
  discriminated by ``status``. (§25.4)

    - ``working``        → no additional fields;
    - ``input_required`` → ``inputRequests`` (R-25.5-d: no ``result``/``error``);
    - ``completed``      → ``result`` (the verbatim ordinary result, R-25.5-d);
    - ``failed``         → ``error`` (the inline JSON-RPC error, R-25.5-d);
    - ``cancelled``      → no additional fields.
  """
  if not isinstance(value, dict):
    return False
  status = value.get("status")
  if status == "working":
    return is_working_task(value)
  if status == "input_required":
    return is_input_required_task(value)
  if status == "completed":
    return is_completed_task(value)
  if status == "failed":
    return is_failed_task(value)
  if status == "cancelled":
    return is_cancelled_task(value)
  return False


def has_consistent_inline_outcome(task: dict) -> bool:
  """Return ``True`` when a ``DetailedTask`` observes the §25.5 inline-outcome rule.
  (R-25.5-d, AC-39.16)

  A non-terminal task carries neither ``result`` nor ``error``; a ``completed`` task
  carries ``result`` (and no ``error``); a ``failed`` task carries ``error`` (and no
  ``result``); a ``cancelled`` task carries neither. This rejects a non-terminal (or
  ``cancelled``) variant that smuggles a ``result``/``error`` it must not carry.

  :param task: A parsed ``DetailedTask`` (or any object shaped like one).
  """
  has_result = task.get("result") is not None
  has_error = task.get("error") is not None
  status = task.get("status")
  if status == "completed":
    return has_result and not has_error
  if status == "failed":
    return has_error and not has_result
  if status in ("working", "input_required", "cancelled"):
    # Non-terminal (and cancelled) variants carry neither result nor error. (R-25.5-d)
    return not has_result and not has_error
  return False


# ─── §25.4 / §25.6 — ttlMs expiry ───────────────────────────────────────────────


def is_task_expired(created_at_ms: float, ttl_ms: float | None, now_ms: float) -> bool:
  """Return ``True`` when a task with a non-null ``ttlMs`` has expired by ``now_ms`` —
  the lifetime has elapsed since ``created_at_ms``, so a server MAY discard it.
  (§25.4, §25.6, R-25.4-c, R-25.6-f)

  A ``None`` ``ttl_ms`` means an unbounded lifetime: such a task never expires and this
  returns ``False``. The actual discard is at the server's discretion (MAY); this
  predicate only reports eligibility for discard.

  :param created_at_ms: The task's creation time in epoch milliseconds.
  :param ttl_ms:        The task's ``ttlMs`` (non-negative number, or ``None``).
  :param now_ms:        The current time in epoch milliseconds.
  """
  if ttl_ms is None:
    return False
  return now_ms - created_at_ms >= ttl_ms


# ─── §25.4(d/e) — Polling interval ──────────────────────────────────────────────


def resolve_poll_interval_ms(poll_interval_ms: float | None, fallback_ms: float = 1000) -> float:
  """Return the interval, in ms, a client SHOULD wait before its next poll.
  (§25.4, R-25.4-d/-e)

  When ``poll_interval_ms`` is a number, that value is the recommended MINIMUM and is
  returned (the client SHOULD NOT poll faster). When it is absent (``None``), the
  client chooses a reasonable interval, supplied as ``fallback_ms`` (default 1000 ms).
  """
  return fallback_ms if poll_interval_ms is None else poll_interval_ms


def may_poll_now(
  last_polled_at_ms: float | None,
  now_ms: float,
  poll_interval_ms: float | None,
  fallback_ms: float = 1000,
) -> bool:
  """Return ``True`` when polling at ``now_ms`` respects the recommended minimum interval.
  (§25.4, R-25.4-d, AC-39.12)

  A client SHOULD wait at least ``poll_interval_ms`` (or its ``fallback_ms`` substitute)
  between successive polls and SHOULD NOT poll more frequently. Returns ``False`` when
  not enough time has elapsed; the first poll (``last_polled_at_ms`` is ``None``) is
  always allowed.
  """
  if last_polled_at_ms is None:
    return True
  return now_ms - last_polled_at_ms >= resolve_poll_interval_ms(poll_interval_ms, fallback_ms)


# ─── §25.2 / §25.6 — Error conditions (reuse §22 codes) ─────────────────────────

#: The §22 missing-capability code (``-32003``) a server uses when a Tasks method is
#: invoked against a server that has not advertised the extension, or invokes a method
#: it cannot service. Reuses the core code rather than minting a Tasks-specific one.
#: (§25.2, R-25.2-f)
TASK_MISSING_CAPABILITY_CODE = MISSING_CLIENT_CAPABILITY_CODE

#: The §22.4 not-found code (``-32602``) a server uses to answer a Tasks query for a
#: ``taskId`` that is unknown — including one whose non-null ``ttlMs`` elapsed and was
#: discarded. Per §25.7 (line 7430) a ``tasks/get`` for an unknown ``taskId`` MUST carry
#: ``code: -32602`` (Invalid params). (§25.4, §25.6/§25.7, R-25.4-c, R-25.6-g, R-25.7-r)
TASK_NOT_FOUND_CODE = INVALID_PARAMS_CODE


def build_tasks_missing_capability_error(method: str) -> dict:
  """Build the ``-32003`` error a server returns for an unavailable Tasks method.
  (§25.2, R-25.2-f, AC-39.6)

  :param method: The Tasks method that was invoked (e.g. ``"tasks/get"``).
  """
  return {
    "code": TASK_MISSING_CAPABILITY_CODE,
    "message": f'Tasks extension not available for method "{method}"',
    "data": {"requiredExtension": TASKS_EXTENSION_ID, "method": method},
  }


def build_task_not_found_error(task_id: str) -> dict:
  """Build the ``-32602`` not-found error for an unknown/expired ``taskId``.
  (§25.4, §25.6/§25.7, R-25.4-c, R-25.6-g, R-25.7-r, AC-39.11)

  :param task_id: The opaque task identifier that was not found.
  """
  return {
    "code": TASK_NOT_FOUND_CODE,
    "message": f'Task not found: "{task_id}"',
    "data": {"taskId": task_id},
  }


# ─── §25.10 — Task-status subscriptions (helpers reused by S40) ──────────────────


def subscribed_task_ids(filter_: object) -> list[str]:
  """Return the ``taskIds`` a ``subscriptions/listen`` filter opts in to, or ``[]``. (§25.10)"""
  if not isinstance(filter_, dict):
    return []
  ids = filter_.get("taskIds")
  if isinstance(ids, list) and all(isinstance(i, str) for i in ids):
    return list(ids)
  return []


def task_subscription_requires_capability(filter_: object, client_negotiated: bool) -> bool:
  """Return ``True`` when a ``taskIds`` filter is supplied without the tasks capability. (R-25.10-e)

  When ``True`` the server MUST reject ``subscriptions/listen`` with ``-32003``.
  """
  return len(subscribed_task_ids(filter_)) > 0 and not client_negotiated
