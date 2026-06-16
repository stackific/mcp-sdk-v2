"""Tasks Extension II — get/update/cancel, notifications & cleanup (§25.7–§25.12).

The client-facing **wire surface** that drives a task through its lifecycle once it
exists. S39 (:mod:`mcp.protocol.tasks`) owns the *model* — the ``Task`` /
``DetailedTask`` fields, the ``TaskStatus`` lifecycle, the
``io.modelcontextprotocol/tasks`` capability, and durability. This module adds the
operations performed against an existing task:

* ``tasks/get`` — the polling primitive: request params (``taskId``) and the
  ``GetTaskResult`` (``resultType: "complete"`` merged with a ``DetailedTask``),
  plus the status → variant selection rule. (§25.7)
* polling semantics — honoring / adopting the latest ``pollIntervalMs``, deciding
  when to stop polling, server-side rate-limiting. (§25.7)
* ``tasks/update`` — supplying ``inputResponses`` to an ``input_required`` task; the
  currently-outstanding-key binding rule, partial / stale-key handling, and the empty
  ``"complete"`` acknowledgement. (§25.8)
* ``tasks/cancel`` — cooperative cancellation; the empty acknowledgement and the
  terminal-status immutability guarantee (reusing S39's lifecycle). (§25.9)
* ``notifications/tasks`` — the optional server push carrying a full ``DetailedTask``,
  opted into via the §10 ``subscriptions/listen`` ``taskIds`` filter (S16); plus the
  rule that progress / logging / ``notifications/cancelled`` MUST NOT be used for
  tasks. (§25.10)
* lifecycle & cleanup — ``ttlMs`` mutability / backstop, expired-task ``-32602``
  behavior, and the protocol-error (``failed``) vs application-error (``completed``)
  separation. (§25.11)

REUSE (imported, never redefined here):

* ``TASK_STATUSES`` / ``TERMINAL_TASK_STATUSES`` / :func:`is_terminal_task_status` /
  :func:`subscribed_task_ids` / :func:`task_subscription_requires_capability` /
  ``TASK_MISSING_CAPABILITY_CODE`` / :func:`build_tasks_missing_capability_error` and
  the three method-name constants — :mod:`mcp.protocol.tasks` (S39), re-exported here
  where the TS SDK re-exports them.
* ``INVALID_PARAMS_CODE`` — :mod:`mcp.protocol.errors` (§22).
* ``RESULT_TYPE_COMPLETE`` and :func:`is_valid_mcp_error` /
  :func:`is_valid_notification_params` — :mod:`mcp.jsonrpc.payload` (§3).

The TypeScript SDK validates ``DetailedTask`` via a Zod discriminated union
(``DetailedTaskSchema``). The Python port mirrors that with dict-shape predicates
(:func:`is_valid_detailed_task` and friends) so no schema runtime is required.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import AfterValidator, Field, TypeAdapter

from mcp._model import McpModel, validates
from mcp.jsonrpc.payload import (
  RESULT_TYPE_COMPLETE,
  is_valid_mcp_error,
  is_valid_notification_params,
)
from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.tasks import (
  TASK_MISSING_CAPABILITY_CODE,
  TASK_STATUSES,
  TASKS_CANCEL_METHOD,
  TASKS_GET_METHOD,
  TASKS_NOTIFICATION_METHOD,
  TASKS_UPDATE_METHOD,
  Task,
  build_tasks_missing_capability_error,
  is_terminal_task_status,
  subscribed_task_ids,
  task_subscription_requires_capability,
)


def _require_mcp_error(value: Any) -> Any:
  """Field validator: a ``failed`` task's ``error`` MUST be a valid JSON-RPC error object."""
  if not is_valid_mcp_error(value):
    raise ValueError("failed-task error MUST be a valid JSON-RPC error object (§22)")
  return value


#: A JSON-RPC error object field for a ``failed`` task. (§22)
_McpError = Annotated[dict, AfterValidator(_require_mcp_error)]

# Re-export the S39-owned bindings the TS module re-exports, so an S40 caller has the
# full surface (method names, capability-gating error, subscription helpers) without
# importing S39 directly. These are imported above and never redefined here.
__all__ = [
  "TASKS_GET_METHOD",
  "TASKS_UPDATE_METHOD",
  "TASKS_CANCEL_METHOD",
  "TASKS_NOTIFICATION_METHOD",
  "TASK_LIFECYCLE_METHODS",
  "is_task_lifecycle_method",
  "TASK_INVALID_PARAMS_CODE",
  "build_task_unknown_error",
  "TASK_MISSING_CAPABILITY_CODE",
  "build_tasks_missing_capability_error",
  "is_valid_detailed_task",
  "is_valid_get_task_request_params",
  "is_valid_get_task_request",
  "is_valid_get_task_result",
  "build_get_task_result",
  "is_valid_task_input_responses",
  "is_valid_update_task_request_params",
  "is_valid_update_task_request",
  "validate_update_input_response_keys",
  "filter_outstanding_input_responses",
  "is_partial_input_response",
  "is_valid_cancel_task_request_params",
  "is_valid_cancel_task_request",
  "build_task_acknowledgement_result",
  "is_task_acknowledgement_result",
  "classify_cancel_effect",
  "is_valid_task_status_notification",
  "build_task_status_notification",
  "subscribed_task_ids",
  "may_push_task_notification",
  "task_subscription_requires_capability",
  "PROGRESS_NOTIFICATION_METHOD",
  "LOGGING_MESSAGE_METHOD",
  "CANCELLED_NOTIFICATION_METHOD",
  "TASK_FORBIDDEN_NOTIFICATION_METHODS",
  "is_forbidden_task_notification",
  "resolve_poll_interval_ms",
  "adopt_latest_poll_interval_ms",
  "may_rate_limit_poll",
  "should_continue_polling",
  "is_polling_terminal_response",
  "is_task_backstop_elapsed",
  "classify_task_execution_outcome",
  "build_failed_task_update",
  "build_completed_task_update",
]


# ─── §25.7 / §25.8 / §25.9 — Method & lifecycle names ──────────────────────────

#: The three client→server Tasks request methods introduced by S40. (§25.7–§25.9)
#: Each MUST be issued only over the negotiated ``io.modelcontextprotocol/tasks``
#: capability; a server receiving one from a client that did not declare it answers
#: with ``-32003`` (:func:`build_tasks_missing_capability_error`).
TASK_LIFECYCLE_METHODS = (TASKS_GET_METHOD, TASKS_UPDATE_METHOD, TASKS_CANCEL_METHOD)


def is_task_lifecycle_method(method: str) -> bool:
  """Return ``True`` when ``method`` is one of the three S40 Tasks request methods.

  (§25.7–§25.9) ``notifications/tasks`` is a push, not a request, so it is excluded.
  """
  return method in TASK_LIFECYCLE_METHODS


# ─── §25.7 / §25.8 / §25.9 — The unknown / expired ``taskId`` error (-32602) ────

#: The §22 code a server uses to answer ``tasks/get`` / ``tasks/update`` /
#: ``tasks/cancel`` for a ``taskId`` that is unknown — never existed, or expired and
#: removed: ``-32602`` (Invalid params). (§25.7, §25.11, R-25.7-r, R-25.8-m, R-25.9-g,
#: R-25.11-d) Distinct from S39's not-found literal (``-32002``); the S40 wire
#: operations specify ``-32602`` precisely, so this reuses :data:`INVALID_PARAMS_CODE`.
TASK_INVALID_PARAMS_CODE = INVALID_PARAMS_CODE


def build_task_unknown_error(task_id: str, operation: str = "retrieve") -> dict:
  """Build the ``-32602`` error for an unknown / expired ``taskId``. (§25.7, §25.11)

  Returned by a server to ``tasks/get`` / ``tasks/update`` / ``tasks/cancel`` when
  ``task_id`` does not correspond to a known task (never existed, or expired and
  removed). The ``message`` is informative and non-normative; a client SHOULD treat
  the response as evidence the task is terminal and unavailable and stop polling.
  (R-25.7-r, R-25.8-m, R-25.9-g, R-25.11-d, R-25.11-e, AC-40.12, AC-40.21, AC-40.27)

  :param task_id: The opaque task identifier that was not found.
  :param operation: The Tasks operation that was attempted (default ``"retrieve"``),
    used only to phrase the human-readable message.
  """
  return {
    "code": TASK_INVALID_PARAMS_CODE,
    "message": f"Failed to {operation} task: Task not found",
    "data": {"taskId": task_id},
  }


# ─── §25.4 — DetailedTask dict-shape validation (mirrors DetailedTaskSchema) ────


def _is_object(value: object) -> bool:
  """Return ``True`` for a non-null mapping (a ``dict``)."""
  return isinstance(value, dict)


def _is_number(value: object) -> bool:
  """Return ``True`` for an ``int`` / ``float`` that is not a ``bool``."""
  return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_non_negative_number(value: object) -> bool:
  """Return ``True`` for a non-negative ``int`` / ``float`` (excluding ``bool``)."""
  return _is_number(value) and value >= 0


def _is_valid_ttl_ms(value: object) -> bool:
  """Return ``True`` for a valid ``ttlMs``: a non-negative number, or ``None``. (R-25.4-b/-c)"""
  return value is None or _is_non_negative_number(value)


def _has_valid_base_task_fields(value: dict) -> bool:
  """Validate the REQUIRED + OPTIONAL base ``Task`` fields shared by every variant. (§25.4)

  REQUIRED: ``taskId`` (string), ``status`` (one of the five), ``createdAt`` (string),
  ``lastUpdatedAt`` (string), ``ttlMs`` (non-negative number or ``None``). OPTIONAL:
  ``statusMessage`` (string), ``pollIntervalMs`` (non-negative number). Additional
  members are allowed (the schema uses ``.passthrough()``). (R-25.4-a, R-25.4-b)
  """
  if not isinstance(value.get("taskId"), str):
    return False
  if value.get("status") not in TASK_STATUSES:
    return False
  if not isinstance(value.get("createdAt"), str):
    return False
  if not isinstance(value.get("lastUpdatedAt"), str):
    return False
  if not _is_valid_ttl_ms(value.get("ttlMs")):
    return False
  if "statusMessage" in value and not isinstance(value["statusMessage"], str):
    return False
  if "pollIntervalMs" in value and not _is_non_negative_number(value["pollIntervalMs"]):
    return False
  return True


class _WorkingTask(Task):
  """``status: "working"`` — a base ``Task`` with no additional payload. (§25.4)"""

  status: Literal["working"]


class _CancelledTask(Task):
  """``status: "cancelled"`` — a base ``Task`` with no additional payload. (§25.4)"""

  status: Literal["cancelled"]


class _InputRequiredTask(Task):
  """``status: "input_required"`` — carries the outstanding ``inputRequests`` map. (§25.4)"""

  status: Literal["input_required"]
  input_requests: dict[str, Any]


class _CompletedTask(Task):
  """``status: "completed"`` — carries the verbatim ordinary ``result``. (§25.4, R-25.5-d)"""

  status: Literal["completed"]
  result: dict[str, Any]


class _FailedTask(Task):
  """``status: "failed"`` — carries the inline JSON-RPC ``error``. (§25.4, R-25.5-d)"""

  status: Literal["failed"]
  error: _McpError


#: A ``DetailedTask`` — a base ``Task`` plus the status-specific payload, discriminated by
#: ``status`` (the Python analogue of the TS ``DetailedTaskSchema`` union). (§25.4, R-25.5-d)
DetailedTask = Annotated[
  _WorkingTask | _InputRequiredTask | _CompletedTask | _FailedTask | _CancelledTask,
  Field(discriminator="status"),
]

_DETAILED_TASK_ADAPTER: TypeAdapter[Any] = TypeAdapter(DetailedTask)


def is_valid_detailed_task(value: object) -> bool:
  """Return ``True`` for a well-formed ``DetailedTask`` (the discriminated union). (§25.4)

  A base ``Task`` plus the status-specific payload required by its ``status`` discriminator
  (R-25.5-d): ``working``/``cancelled`` — none; ``input_required`` — ``inputRequests``;
  ``completed`` — ``result``; ``failed`` — a JSON-RPC ``error``.
  """
  try:
    _DETAILED_TASK_ADAPTER.validate_python(value)
    return True
  except Exception:  # noqa: BLE001 — any validation failure means "not a valid DetailedTask"
    return False


# ─── §25.7 — tasks/get request ──────────────────────────────────────────────────


class GetTaskRequestParams(McpModel):
  """``tasks/get`` params (§25.7): a REQUIRED string ``taskId`` (verbatim from the
  originating ``CreateTaskResult``); additional members tolerated. (R-25.7-a/-b)
  """

  task_id: str


def is_valid_get_task_request_params(value: object) -> bool:
  """Return ``True`` for valid ``tasks/get`` params: a REQUIRED string ``taskId``. (§25.7)"""
  return validates(GetTaskRequestParams, value)


def _is_valid_request_envelope(value: object, method: str) -> bool:
  """Return ``True`` for a JSON-RPC request envelope with ``jsonrpc``/``id``/``method``.

  ``id`` is a string or a (non-bool) number; ``method`` matches ``method``.
  """
  if not _is_object(value):
    return False
  if value.get("jsonrpc") != "2.0":
    return False
  request_id = value.get("id")
  if not (isinstance(request_id, str) or _is_number(request_id)):
    return False
  return value.get("method") == method


def is_valid_get_task_request(value: object) -> bool:
  """Return ``True`` for a well-formed ``tasks/get`` request envelope. (§25.7, R-25.7-a/-b)"""
  return _is_valid_request_envelope(value, TASKS_GET_METHOD) and is_valid_get_task_request_params(
    value.get("params")
  )


# ─── §25.7 — GetTaskResult (Result & DetailedTask) ─────────────────────────────


def is_valid_get_task_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``GetTaskResult``. (§25.7, R-25.7-e/-f)

  A ``GetTaskResult`` is a ``DetailedTask`` whose ``resultType`` is the literal
  ``"complete"`` plus an OPTIONAL ``_meta``. The per-variant status → payload
  requirement is enforced by :func:`is_valid_detailed_task`.
  """
  if not _is_object(value):
    return False
  if value.get("resultType") != RESULT_TYPE_COMPLETE:
    return False
  if "_meta" in value and not _is_object(value["_meta"]):
    return False
  return is_valid_detailed_task(value)


def build_get_task_result(task: dict) -> dict:
  """Build the ``tasks/get`` result for a task's current ``DetailedTask`` state. (§25.7)

  Carries the caller-supplied ``DetailedTask`` (status + its status-specific payload)
  verbatim and stamps the ``resultType: "complete"`` discriminator. The server MUST
  inspect the current status and return the matching variant; this helper does so by
  trusting the already-correct ``DetailedTask``.
  (R-25.7-e, R-25.7-f … R-25.7-l, AC-40.1, AC-40.3 … AC-40.7)

  :param task: The task's current ``DetailedTask`` (already in the correct variant for
    its status).
  :raises ValueError: when ``task`` is not a well-formed ``DetailedTask``.
  """
  if not is_valid_detailed_task(task):
    raise ValueError("build_get_task_result requires a well-formed DetailedTask")
  return {**task, "resultType": RESULT_TYPE_COMPLETE}


# ─── §25.8 — tasks/update request ──────────────────────────────────────────────


def is_valid_task_input_responses(value: object) -> bool:
  """Return ``True`` for a valid ``inputResponses`` map: any JSON object. (§25.8)

  Each value is shaped as the response to the corresponding server-to-client request
  would be when surfaced inline (the ``InputResponse`` model is owned by S17 / §11).
  This story does not redefine the per-kind shapes — values are accepted as arbitrary
  JSON and the key-binding rule is enforced separately by
  :func:`validate_update_input_response_keys`. (R-25.8-b)
  """
  return _is_object(value)


class UpdateTaskRequestParams(McpModel):
  """``tasks/update`` params (§25.8): REQUIRED string ``taskId`` + ``inputResponses`` map;
  additional members tolerated. (R-25.8-a/-b)
  """

  task_id: str
  input_responses: dict[str, Any]


def is_valid_update_task_request_params(value: object) -> bool:
  """Return ``True`` for valid ``tasks/update`` params: REQUIRED ``taskId`` + ``inputResponses``.
  (§25.8, R-25.8-a, R-25.8-b)
  """
  return validates(UpdateTaskRequestParams, value)


def is_valid_update_task_request(value: object) -> bool:
  """Return ``True`` for a well-formed ``tasks/update`` request — both ``taskId`` and
  ``inputResponses`` present. (§25.8, R-25.8-a, AC-40.13)
  """
  return _is_valid_request_envelope(
    value, TASKS_UPDATE_METHOD
  ) and is_valid_update_task_request_params(value.get("params"))


def validate_update_input_response_keys(
  outstanding_input_requests: dict, input_responses: dict
) -> dict:
  """Validate the ``tasks/update`` key-binding rule. (§25.8, R-25.8-b, AC-40.13)

  Every key in ``input_responses`` MUST match a key currently outstanding in the
  task's ``inputRequests`` snapshot. Returns ``{"valid": bool, "unknownKeys": [...]}``
  listing the offending keys when any response key is not currently outstanding.

  Mirrors S17's ``validateInputResponseKeys`` so the key-matching logic is shared with
  the inline multi-round-trip flow. This is a *client-side* well-formedness check; a
  server SHOULD instead simply IGNORE stale keys
  (:func:`filter_outstanding_input_responses`, R-25.8-g).

  :param outstanding_input_requests: The task's currently-outstanding ``inputRequests``
    (the snapshot from the latest ``input_required`` ``tasks/get``).
  :param input_responses: The client's ``tasks/update`` ``inputResponses``.
  """
  allowed = set(outstanding_input_requests.keys())
  unknown_keys = [k for k in input_responses.keys() if k not in allowed]
  return {"valid": len(unknown_keys) == 0, "unknownKeys": unknown_keys}


def filter_outstanding_input_responses(
  outstanding_input_requests: dict, input_responses: dict
) -> dict:
  """Keep only the ``inputResponses`` whose key is CURRENTLY OUTSTANDING. (§25.8, R-25.8-g)

  The server-side handling of ``tasks/update`` ``inputResponses``: drop any entry whose
  key was never issued, already answered, or superseded. A server SHOULD ignore stale
  entries rather than error, and MAY accept a strict subset of the outstanding keys
  (the task then remains ``input_required`` until the rest arrive — see
  :func:`is_partial_input_response`). (R-25.8-g, R-25.8-h, AC-40.16, AC-40.17)

  :param outstanding_input_requests: The task's currently-outstanding ``inputRequests``.
  :param input_responses: The client's ``tasks/update`` ``inputResponses``.
  :returns: ``{"accepted": {...}, "ignoredKeys": [...]}`` — the subset the server acts
    on, plus the keys it ignored (input order preserved).
  """
  outstanding = set(outstanding_input_requests.keys())
  accepted: dict = {}
  ignored_keys: list[str] = []
  for key, value in input_responses.items():
    if key in outstanding:
      accepted[key] = value
    else:
      ignored_keys.append(key)
  return {"accepted": accepted, "ignoredKeys": ignored_keys}


def is_partial_input_response(
  outstanding_input_requests: dict, input_responses: dict
) -> bool:
  """Return ``True`` when ``input_responses`` answers a STRICT SUBSET of the outstanding
  ``inputRequests`` — at least one outstanding key is unanswered. (§25.8, R-25.8-h)

  A server MAY accept such a partial set; the task then remains ``input_required``
  until the remaining responses arrive. Only currently-outstanding answered keys count
  as "answered" (stale keys are ignored per
  :func:`filter_outstanding_input_responses`). With no outstanding requests this
  returns ``False`` (nothing to partially answer). (AC-40.17)

  :param outstanding_input_requests: The task's currently-outstanding ``inputRequests``.
  :param input_responses: The client's ``tasks/update`` ``inputResponses``.
  """
  outstanding_keys = list(outstanding_input_requests.keys())
  if len(outstanding_keys) == 0:
    return False
  accepted = filter_outstanding_input_responses(outstanding_input_requests, input_responses)[
    "accepted"
  ]
  answered = len(accepted)
  return 0 < answered < len(outstanding_keys)


# ─── §25.9 — tasks/cancel request ──────────────────────────────────────────────


class CancelTaskRequestParams(McpModel):
  """``tasks/cancel`` params (§25.9): a REQUIRED string ``taskId``; additional members
  tolerated. (R-25.9-b)
  """

  task_id: str


def is_valid_cancel_task_request_params(value: object) -> bool:
  """Return ``True`` for valid ``tasks/cancel`` params: a REQUIRED string ``taskId``. (§25.9)"""
  return validates(CancelTaskRequestParams, value)


def is_valid_cancel_task_request(value: object) -> bool:
  """Return ``True`` for a well-formed ``tasks/cancel`` request. (§25.9, R-25.9-b, AC-40.24)"""
  return _is_valid_request_envelope(
    value, TASKS_CANCEL_METHOD
  ) and is_valid_cancel_task_request_params(value.get("params"))


# ─── §25.8 / §25.9 — Empty acknowledgement results ─────────────────────────────


def build_task_acknowledgement_result() -> dict:
  """Build the empty ``"complete"`` acknowledgement shared by ``tasks/update`` and
  ``tasks/cancel``. (§25.8, §25.9, R-25.8-j, R-25.9-e)

  A ``Result`` whose ``resultType`` is the literal ``"complete"`` and whose body is
  otherwise empty. The acknowledgement is eventually consistent: for ``tasks/update``
  the observable status may not yet reflect the responses, and for ``tasks/cancel`` the
  task MAY remain non-terminal (or reach a terminal status other than ``cancelled``).
  (R-25.8-k, R-25.8-l, R-25.9-f, R-25.9-h, R-25.9-i, AC-40.19, AC-40.26)
  """
  return {"resultType": RESULT_TYPE_COMPLETE}


def is_task_acknowledgement_result(value: object) -> bool:
  """Return ``True`` for a well-formed task acknowledgement result. (R-25.8-j, R-25.9-e)

  ``resultType: "complete"`` with an OPTIONAL object ``_meta``; additional members are
  tolerated (passthrough). This is the shared ``tasks/update`` / ``tasks/cancel`` ack.
  """
  if not _is_object(value):
    return False
  if value.get("resultType") != RESULT_TYPE_COMPLETE:
    return False
  return "_meta" not in value or _is_object(value["_meta"])


# ─── §25.9 — Cancellation semantics (cooperative, terminal-final) ──────────────


def classify_cancel_effect(current_status: str) -> str:
  """Decide what a server's stored task does on ``tasks/cancel``. (§25.9, R-25.9-h/-i/-j)

  Cancellation is cooperative: the server is obligated only to acknowledge, never to
  force a transition. A task already in a TERMINAL status MUST NOT change as a result
  of ``tasks/cancel`` — terminal status is final.

  * ``"acknowledged-terminal"`` — the task is already terminal; the server acknowledges
    but MUST NOT change its status (no-op on state). (R-25.9-j)
  * ``"acknowledged-pending"`` — the task is non-terminal; the server acknowledges and
    MAY (but need not) move it toward ``cancelled`` when feasible. The eventual
    terminal status MAY be something other than ``cancelled`` if the work finished
    first. (R-25.9-h, R-25.9-i)

  Either way the wire response is the same empty acknowledgement
  (:func:`build_task_acknowledgement_result`); this only reports the state effect.
  (AC-40.28, AC-40.29)

  :param current_status: The task's current ``TaskStatus``.
  """
  return "acknowledged-terminal" if is_terminal_task_status(current_status) else "acknowledged-pending"


# ─── §25.10 — notifications/tasks ──────────────────────────────────────────────


def is_valid_task_status_notification(value: object) -> bool:
  """Return ``True`` for a well-formed ``notifications/tasks`` notification. (§25.10, R-25.10-a)

  The envelope is ``jsonrpc: "2.0"`` + ``method: "notifications/tasks"`` + ``params``
  that are a full ``DetailedTask`` (identical to what ``tasks/get`` would return at
  that moment) optionally carrying the §3 notification ``_meta``. ``params`` therefore
  always include ``taskId`` and ``status``, plus the status-specific payload.
  """
  if not _is_object(value):
    return False
  if value.get("jsonrpc") != "2.0":
    return False
  if value.get("method") != TASKS_NOTIFICATION_METHOD:
    return False
  params = value.get("params")
  return is_valid_detailed_task(params) and is_valid_notification_params(params)


def build_task_status_notification(task: dict) -> dict:
  """Build a ``notifications/tasks`` notification carrying a complete ``DetailedTask``. (§25.10)

  The body is identical to what ``tasks/get`` would return at that moment, so a
  subscribed client need not issue an extra ``tasks/get``. A server MUST NOT push this
  for a task the client did not subscribe to via a ``taskIds`` filter
  (:func:`may_push_task_notification`, R-25.10-d). (R-25.10-a, AC-40.31)

  :param task: The task's current ``DetailedTask``.
  :raises ValueError: when ``task`` is not a well-formed ``DetailedTask``.
  """
  if not is_valid_detailed_task(task):
    raise ValueError("build_task_status_notification requires a well-formed DetailedTask")
  return {
    "jsonrpc": "2.0",
    "method": TASKS_NOTIFICATION_METHOD,
    "params": dict(task),
  }


# ─── §25.10 — taskIds subscription filter (extends S16's filter) ───────────────
#
# ``subscribed_task_ids`` and ``task_subscription_requires_capability`` are owned by
# S39 (:mod:`mcp.protocol.tasks`); they are imported above and re-exported via
# ``__all__`` rather than redefined here (the TS module re-exports the equivalents).


def may_push_task_notification(task_id: str, subscribed_task_ids: list[str]) -> bool:
  """Return ``True`` when a server MAY push ``notifications/tasks`` for ``task_id``. (§25.10)

  True iff the client subscribed to it via a ``taskIds`` filter on
  ``subscriptions/listen``. A server MUST NOT push for any task NOT in the subscribed
  set. (R-25.10-d, AC-40.33)

  :param task_id: The task a notification would be about.
  :param subscribed_task_ids: The ``taskIds`` the server accepted for this client.
  """
  return task_id in subscribed_task_ids


# ─── §25.10 — Notifications that MUST NOT be sent for a task ────────────────────

#: ``notifications/progress`` — task state is conveyed ONLY via ``tasks/get`` and
#: ``notifications/tasks``. (§22 / S22)
PROGRESS_NOTIFICATION_METHOD = "notifications/progress"
#: ``notifications/message`` — the logging channel; never task state. (§23 / S23)
LOGGING_MESSAGE_METHOD = "notifications/message"
#: ``notifications/cancelled`` — the general cancel notification; ``tasks/cancel`` is the
#: ONLY task-cancellation mechanism. (§22 / S22)
CANCELLED_NOTIFICATION_METHOD = "notifications/cancelled"

#: The notification methods that MUST NOT be used to convey task state. (§25.9, §25.10,
#: R-25.9-a, R-25.10-g) Order mirrors the TS constant (progress, message, cancelled).
TASK_FORBIDDEN_NOTIFICATION_METHODS = (
  PROGRESS_NOTIFICATION_METHOD,
  LOGGING_MESSAGE_METHOD,
  CANCELLED_NOTIFICATION_METHOD,
)


def is_forbidden_task_notification(method: str) -> bool:
  """Return ``True`` when ``method`` MUST NOT be sent for a task. (§25.9, §25.10)

  ``notifications/progress``, ``notifications/message``, or ``notifications/cancelled``;
  sending any of them for a task is a protocol violation. (R-25.9-a, R-25.10-g,
  AC-40.23, AC-40.36)
  """
  return method in TASK_FORBIDDEN_NOTIFICATION_METHODS


# ─── §25.7 — Polling semantics ─────────────────────────────────────────────────


def resolve_poll_interval_ms(
  poll_interval_ms: float | None, fallback_ms: float = 1000
) -> float:
  """Resolve the interval a client SHOULD wait before its next ``tasks/get`` poll. (§25.7)

  When ``poll_interval_ms`` is a number it is the recommended MINIMUM and is returned;
  when it is ``None`` the client's ``fallback_ms`` is used. Mirrors S39's
  ``resolvePollIntervalMs`` (kept local to avoid a redundant import; the value is
  numeric and identical). (R-25.4-d, R-25.4-e)

  :param poll_interval_ms: The task's ``pollIntervalMs``, or ``None`` when absent.
  :param fallback_ms: The interval used when no value is recommended (default 1000 ms).
  """
  return poll_interval_ms if poll_interval_ms is not None else fallback_ms


def adopt_latest_poll_interval_ms(
  latest_observed: float | None,
  previous_observed: float | None,
  fallback_ms: float = 1000,
) -> float:
  """Resolve the ``pollIntervalMs`` to honor, ADOPTING THE LATEST observed value. (§25.7)

  Because ``pollIntervalMs`` MAY change over the task's lifetime, a client SHOULD use
  the value from the most recent ``tasks/get`` result. When the latest observation
  carries no value, the previously observed value (if any) is retained; failing that,
  ``fallback_ms``. (R-25.7-m, R-25.7-n, AC-40.8)

  :param latest_observed: ``pollIntervalMs`` from the most recent ``tasks/get``, or
    ``None`` when absent.
  :param previous_observed: The previously adopted ``pollIntervalMs``, or ``None``.
  :param fallback_ms: The interval used when neither has supplied a value.
  """
  chosen = latest_observed if latest_observed is not None else previous_observed
  return resolve_poll_interval_ms(chosen, fallback_ms)


def may_rate_limit_poll(
  last_polled_at_ms: float | None, now_ms: float, poll_interval_ms: float | None
) -> bool:
  """Return ``True`` when a server MAY rate-limit a poll that arrived too soon. (§25.7)

  A server is PERMITTED (not required) to rate-limit a ``tasks/get`` poll that arrived
  sooner than the most recently advertised ``pollIntervalMs``. This reports
  eligibility: ``True`` when the gap since the last poll is below the advertised
  minimum. A first poll (no prior poll) is never rate-limitable, and a poll with no
  advertised interval is never rate-limitable. (R-25.7-o, AC-40.9)

  :param last_polled_at_ms: Epoch ms of the previous poll, or ``None`` for the first poll.
  :param now_ms: The current time in epoch ms.
  :param poll_interval_ms: The most recently advertised ``pollIntervalMs``, or ``None``.
  """
  if last_polled_at_ms is None or poll_interval_ms is None:
    return False
  return now_ms - last_polled_at_ms < poll_interval_ms


def should_continue_polling(status: str, cancel_requested: bool = False) -> bool:
  """Return ``True`` when a client SHOULD continue polling a task. (§25.7, §25.8)

  True iff the task is non-terminal AND the client has not issued ``tasks/cancel``. A
  client SHOULD poll until the task reaches a terminal status or it cancels. After
  ``tasks/cancel`` the client MAY stop immediately and need not wait for ``cancelled``
  (R-25.9-k, AC-40.30) — pass ``cancel_requested=True``. (R-25.7-p, R-25.8-n, AC-40.10,
  AC-40.22)

  :param status: The task's last observed ``TaskStatus``.
  :param cancel_requested: Whether the client has already issued ``tasks/cancel``.
  """
  if cancel_requested:
    return False
  return not is_terminal_task_status(status)


def is_polling_terminal_response(response: object) -> bool:
  """Return ``True`` when a client should STOP polling after a ``tasks/get`` response. (§25.7)

  Stops on either a ``-32602`` error (the task is unknown / expired — terminal and
  unavailable) or a terminal ``DetailedTask``. (R-25.7-s, R-25.11-e, AC-40.12)

  :param response: A raw ``tasks/get`` response — either an error object
    (``{"code": ...}``) or a ``DetailedTask``-shaped result (``{"status": ...}``).
  """
  if not _is_object(response):
    return False
  # A -32602 error response → task is terminal and unavailable. (R-25.7-s, R-25.11-e)
  if response.get("code") == TASK_INVALID_PARAMS_CODE:
    return True
  # A terminal DetailedTask result → stop polling. (R-25.7-p)
  status = response.get("status")
  return status in TASK_STATUSES and is_terminal_task_status(status)


# ─── §25.11 — Lifecycle, cleanup & error classification ────────────────────────


def is_task_backstop_elapsed(
  created_at_ms: float, ttl_ms: float | None, now_ms: float, status: str
) -> bool:
  """Return ``True`` when a task's non-null ``ttlMs`` backstop has elapsed. (§25.11, R-25.11-c)

  A client MAY treat a task as not usable once ``created_at_ms + ttl_ms`` has passed and
  the task is still non-terminal. A ``None`` ``ttlMs`` (unbounded) is never a backstop
  and returns ``False``; an already-terminal task is not a backstop candidate. Time
  inputs are epoch milliseconds. (AC-40.41)

  :param created_at_ms: The task's creation time in epoch ms.
  :param ttl_ms: The task's ``ttlMs`` (non-negative number, or ``None``).
  :param now_ms: The current time in epoch ms.
  :param status: The task's last observed ``TaskStatus``.
  """
  if ttl_ms is None:
    return False  # unbounded lifetime is never a backstop (R-25.11-c)
  if is_terminal_task_status(status):
    return False  # already advanced to terminal
  return now_ms - created_at_ms >= ttl_ms


def classify_task_execution_outcome(finished: dict) -> str:
  """Classify how a finished augmented request maps onto a terminal task status. (§25.11)

  Enforces the strict §25.11 separation between protocol-level faults and
  application-level outcomes (R-25.11-f/-h/-i):

  * ``{"kind": "protocol-error", "error": ...}`` — a JSON-RPC error occurred →
    ``"failed"`` (the task carries that error inline).
  * ``{"kind": "result", "result": ...}`` — the request completed at the protocol
    level (even if ``result`` conveys an application error such as ``isError: true``)
    → ``"completed"`` (the error stays inside ``result``).

  ``failed`` is used ONLY for JSON-RPC protocol-level errors. (AC-40.42, AC-40.43)

  :param finished: The execution outcome (a mapping with a ``"kind"`` discriminator).
  """
  return "failed" if finished.get("kind") == "protocol-error" else "completed"


def build_failed_task_update(
  base: dict, error: object, status_message: str | None = None
) -> dict:
  """Build the terminal ``DetailedTask`` for a JSON-RPC PROTOCOL error. (§25.11, R-25.11-f/-g)

  ``status: "failed"`` carrying the inline ``error``, and SHOULD include a diagnostic
  ``statusMessage``. The ``failed`` status MUST NOT be used for non-protocol faults —
  for an application-level error use :func:`build_completed_task_update` with the error
  carried inside ``result`` (R-25.11-h). (AC-40.42)

  :param base: The task's base fields (``taskId``, ``createdAt``, ``lastUpdatedAt``,
    ``ttlMs``, and any other ``Task`` members).
  :param error: The JSON-RPC error that occurred.
  :param status_message: OPTIONAL diagnostic message (SHOULD be supplied, R-25.11-g).
  :raises ValueError: when ``error`` is not a valid JSON-RPC error object, or the
    assembled task is not a well-formed ``DetailedTask``.
  """
  if not is_valid_mcp_error(error):
    raise ValueError("build_failed_task_update requires a valid JSON-RPC error object")
  detailed: dict = {**base, "status": "failed", "error": error}
  if status_message is not None:
    detailed["statusMessage"] = status_message
  if not is_valid_detailed_task(detailed):
    raise ValueError("build_failed_task_update produced an invalid DetailedTask")
  return detailed


def build_completed_task_update(base: dict, result: dict) -> dict:
  """Build the terminal ``DetailedTask`` for a request that COMPLETED at the protocol
  level. (§25.11, R-25.11-i)

  ``status: "completed"`` carrying the verbatim ``result`` — the value the original
  request would have returned synchronously. An application-level error (e.g. a tool
  result with ``isError: true``) is carried INSIDE ``result``, NOT as a ``failed``
  task. (AC-40.5, AC-40.43)

  :param base: The task's base fields (``taskId``, ``createdAt``, ``lastUpdatedAt``,
    ``ttlMs``, etc.).
  :param result: The verbatim ordinary result of the underlying request.
  :raises ValueError: when the assembled task is not a well-formed ``DetailedTask``.
  """
  detailed: dict = {**base, "status": "completed", "result": result}
  if not is_valid_detailed_task(detailed):
    raise ValueError("build_completed_task_update produced an invalid DetailedTask")
  return detailed
