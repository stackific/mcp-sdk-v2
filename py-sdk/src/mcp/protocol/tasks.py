"""The Tasks extension: model, status lifecycle, capability gating (§25).

An opt-in (``io.modelcontextprotocol/tasks``) mechanism that turns a long-running,
server-handled operation into a durable, pollable **task** rather than a blocking
request/response. The server returns an opaque task handle immediately (a
``CreateTaskResult`` whose ``resultType`` is ``"task"``) and the client polls
``tasks/get`` for the eventual outcome — all over single ``application/json``
responses (no streaming required).
"""

from __future__ import annotations

from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE

#: The exact, case-sensitive identifier of the Tasks extension. (§25.1, R-25.1-a)
TASKS_EXTENSION_ID = "io.modelcontextprotocol/tasks"

#: The ``resultType`` discriminator marking a result as a task handle. (§25.3, R-25.3-c)
TASK_RESULT_TYPE = "task"

# ─── Method names (§25.7–§25.9) ─────────────────────────────────────────────────

TASKS_GET_METHOD = "tasks/get"
TASKS_UPDATE_METHOD = "tasks/update"
TASKS_CANCEL_METHOD = "tasks/cancel"
TASKS_NOTIFICATION_METHOD = "notifications/tasks"

#: The three client→server Tasks request methods. (§25.7–§25.9)
TASK_LIFECYCLE_METHODS = (TASKS_GET_METHOD, TASKS_UPDATE_METHOD, TASKS_CANCEL_METHOD)

# ─── TaskStatus lifecycle (§25.5) ───────────────────────────────────────────────

#: The five case-sensitive lifecycle states. (§25.5, R-25.5-a)
TASK_STATUSES = ("working", "input_required", "completed", "failed", "cancelled")

#: The three terminal states; their status + inline outcome are immutable. (§25.5)
TERMINAL_TASK_STATUSES = frozenset({"completed", "failed", "cancelled"})

# ─── Error codes (§25.2 / §25.7, reusing §22) ───────────────────────────────────

#: Reused §22 missing-capability code for unavailable Tasks methods. (R-25.2-f)
TASK_MISSING_CAPABILITY_CODE = MISSING_CLIENT_CAPABILITY_CODE

#: The §22.4 not-found code for an unknown/expired ``taskId``. (§25.7, R-25.7-r)
TASK_NOT_FOUND_CODE = INVALID_PARAMS_CODE


def is_task_lifecycle_method(method: str) -> bool:
  """Return ``True`` when ``method`` is one of the three Tasks request methods."""
  return method in TASK_LIFECYCLE_METHODS


def is_terminal_task_status(status: str) -> bool:
  """Return ``True`` for a terminal state (``completed`` / ``failed`` / ``cancelled``)."""
  return status in TERMINAL_TASK_STATUSES


def is_legal_task_transition(from_status: str, to_status: str) -> bool:
  """Return ``True`` when ``from_status`` → ``to_status`` is legal. (§25.5, R-25.5-b/c)

  Terminal states are immutable; ``working`` may go to ``input_required`` or any
  terminal state; ``input_required`` may go back to ``working`` or any terminal
  state. A self-transition between identical non-terminal states is not a change.
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


def _is_extension_advertised(extensions: object, extension_id: str) -> bool:
  """Return ``True`` when an ``extensions`` map declares ``extension_id`` (exact key)."""
  return isinstance(extensions, dict) and extension_id in extensions


def client_declares_tasks_for_request(request_client_extensions: object) -> bool:
  """Return ``True`` when this request's client ``extensions`` declare Tasks. (§25.2, R-25.2-c)"""
  return _is_extension_advertised(request_client_extensions, TASKS_EXTENSION_ID)


def server_advertises_tasks(server_extensions: object) -> bool:
  """Return ``True`` when the server's advertised ``extensions`` declare Tasks. (§25.2)"""
  return _is_extension_advertised(server_extensions, TASKS_EXTENSION_ID)


def is_tasks_active_for_request(request_client_extensions: object, server_extensions: object) -> bool:
  """Return ``True`` when the Tasks extension is ACTIVE for one request. (§25.2, R-25.2-c/d)

  Active iff this request's client capabilities declare the extension AND the
  server advertises it. Computed per request under the stateless model.
  """
  return client_declares_tasks_for_request(request_client_extensions) and server_advertises_tasks(
    server_extensions
  )


def build_tasks_missing_capability_error(method: str) -> dict:
  """Build the ``-32003`` error a server returns for an unavailable Tasks method. (R-25.2-f)"""
  return {
    "code": TASK_MISSING_CAPABILITY_CODE,
    "message": f'Tasks extension not available for method "{method}"',
    "data": {"requiredExtension": TASKS_EXTENSION_ID, "method": method},
  }


def build_task_not_found_error(task_id: str) -> dict:
  """Build the ``-32602`` not-found error for an unknown/expired ``taskId``. (§25.7, R-25.7-r)"""
  return {
    "code": TASK_NOT_FOUND_CODE,
    "message": f'Task not found: "{task_id}"',
    "data": {"taskId": task_id},
  }


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
