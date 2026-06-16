"""An in-memory Tasks runtime for the server (§25).

Implements the task-store surface the :class:`~mcp.server.server.McpServer`
dispatcher consumes (``get`` / ``get_detailed`` / ``get_result`` / ``list`` /
``cancel`` / ``apply_input``) plus the lifecycle helpers a task-augmented tool
drives (``create_task`` / ``update_status`` / ``store_result`` / ``store_error``).

Conformance: it mints spec-shaped task objects (incl. ``createdAt``,
``lastUpdatedAt``, ``ttlMs``), enforces the legal status transitions (§25.5),
discards tasks whose non-null ``ttlMs`` has elapsed and answers queries for them
with the §22.4 not-found condition (``-32602``, §25.6/§25.7), and pushes each
status change to an optional listener for ``notifications/tasks`` (§25.10).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from mcp.protocol.errors import INTERNAL_ERROR_CODE, INVALID_PARAMS_CODE
from mcp.protocol.tasks import is_legal_task_transition, is_terminal_task_status
from mcp.server.server import ServerError


def _iso(epoch_s: float) -> str:
  """Format an epoch-seconds timestamp as an RFC 3339 UTC date-time string."""
  return datetime.fromtimestamp(epoch_s, tz=timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class _Entry:
  task: dict
  created_at_s: float
  result: dict | None = None
  error: dict | None = None
  input_requests: dict | None = None
  input_responses: dict | None = None


class InMemoryTaskStore:
  """A conformant, in-memory store for the Tasks extension (§25).

  ``now`` is injectable (defaults to :func:`time.time`) so tests drive ``ttlMs``
  expiry deterministically.
  """

  def __init__(
    self,
    *,
    now: Callable[[], float] | None = None,
    default_poll_interval_ms: int | None = None,
  ) -> None:
    self._tasks: dict[str, _Entry] = {}
    self._seq = 0
    self._now = now or time.time
    self._poll_interval_ms = default_poll_interval_ms
    self._update_listener: Callable[[dict], None] | None = None

  # ── lifecycle (driven by a task-augmented tool) ──
  def create_task(self, *, ttl_ms: int | None = None, task_id: str | None = None) -> dict:
    """Create a task in the initial ``working`` state and return the handle. (§25.3, §25.4)"""
    now_s = self._now()
    iso = _iso(now_s)
    self._seq += 1
    tid = task_id or f"task-{self._seq}-{int(now_s * 1000):x}"
    task: dict = {
      "taskId": tid,
      "status": "working",
      "createdAt": iso,
      "lastUpdatedAt": iso,
      "ttlMs": ttl_ms,
    }
    if self._poll_interval_ms is not None:
      task["pollIntervalMs"] = self._poll_interval_ms
    self._tasks[tid] = _Entry(task=task, created_at_s=now_s)
    return task

  def update_status(self, task_id: str, status: str, status_message: str | None = None) -> dict:
    """Transition a task to ``status``, enforcing the legal transition graph. (§25.5)"""
    entry = self._require(task_id)
    if entry.task["status"] != status and not is_legal_task_transition(entry.task["status"], status):
      raise ServerError(
        INTERNAL_ERROR_CODE,
        f'Illegal task transition: {entry.task["status"]} → {status} (§25.5)',
      )
    entry.task = {
      **entry.task,
      "status": status,
      "lastUpdatedAt": _iso(self._now()),
    }
    if status_message is not None:
      entry.task["statusMessage"] = status_message
    if self._update_listener is not None:
      self._update_listener(self.get_detailed(task_id))
    return entry.task

  def set_update_listener(self, listener: Callable[[dict], None]) -> None:
    """Register a listener invoked with the new DetailedTask on every status change. (§25.10)"""
    self._update_listener = listener

  def store_result(self, task_id: str, result: dict, status: str = "completed") -> dict:
    """Store a terminal payload and move the task to a terminal status (default ``completed``)."""
    entry = self._require(task_id)
    if not is_terminal_task_status(status):
      raise ServerError(INTERNAL_ERROR_CODE, f'store_result requires a terminal status, got "{status}"')
    entry.result = result
    return self.update_status(task_id, status)

  def store_error(self, task_id: str, error: dict) -> dict:
    """Record an inline error and move the task to ``failed``. (§25.5)"""
    self._require(task_id).error = error
    return self.update_status(task_id, "failed")

  def set_input_requests(self, task_id: str, input_requests: dict) -> dict:
    """Record outstanding input solicitations and move the task to ``input_required``. (§25.5)"""
    self._require(task_id).input_requests = input_requests
    return self.update_status(task_id, "input_required")

  # ── store surface (consumed by McpServer.dispatch) ──
  def get(self, task_id: str) -> dict:
    """``tasks/get`` — the current task handle, or ``-32602`` if unknown/expired. (§25.7)"""
    return self._live(task_id).task

  def get_detailed(self, task_id: str) -> dict:
    """The status-appropriate DetailedTask the ``tasks/get`` result wraps. (§25.7, R-25.5-d)"""
    entry = self._live(task_id)
    t = entry.task
    base: dict = {
      "taskId": t["taskId"],
      "status": t["status"],
      "createdAt": t["createdAt"],
      "lastUpdatedAt": t["lastUpdatedAt"],
      "ttlMs": t["ttlMs"],
    }
    if "statusMessage" in t:
      base["statusMessage"] = t["statusMessage"]
    if "pollIntervalMs" in t:
      base["pollIntervalMs"] = t["pollIntervalMs"]
    status = t["status"]
    if status == "completed":
      return {**base, "result": entry.result or {}}
    if status == "failed":
      return {
        **base,
        "error": entry.error or {"code": INTERNAL_ERROR_CODE, "message": t.get("statusMessage", "task failed")},
      }
    if status == "input_required":
      return {**base, "inputRequests": entry.input_requests or {}}
    return base

  def apply_input(self, task_id: str, input_responses: dict) -> dict:
    """``tasks/update`` — supply input to an ``input_required`` task → ``working``. (§25.8)"""
    entry = self._require(task_id)
    if entry.task["status"] != "input_required":
      raise ServerError(
        INVALID_PARAMS_CODE,
        f'Task "{task_id}" is not awaiting input (status: {entry.task["status"]})',
      )
    entry.input_responses = input_responses
    entry.input_requests = None
    return self.update_status(task_id, "working")

  def get_result(self, task_id: str) -> dict:
    """``tasks/result`` — terminal payload; ``-32602`` if unknown/expired or not finished. (§25.7)

    Returns the stored terminal ``result`` (an empty object when none was stored)
    augmented with the task's ``taskId`` and final ``status``.

    :raises ServerError: ``-32602`` (``INVALID_PARAMS_CODE``) when the task is unknown,
      has expired, or has not yet reached a terminal status.
    """
    entry = self._live(task_id)
    if not is_terminal_task_status(entry.task["status"]):
      raise ServerError(
        INVALID_PARAMS_CODE,
        f'Task "{task_id}" is not finished (status: {entry.task["status"]})',
      )
    return {**(entry.result or {}), "taskId": entry.task["taskId"], "status": entry.task["status"]}

  def cancel(self, task_id: str) -> dict:
    """``tasks/cancel`` — move a non-terminal task to ``cancelled``; terminal unchanged. (§25.9)"""
    entry = self._require(task_id)
    if is_terminal_task_status(entry.task["status"]):
      return entry.task
    return self.update_status(task_id, "cancelled", "cancelled by client")

  def list(self) -> list[dict]:
    """``tasks/list`` — all live tasks (expired ones swept first)."""
    self._sweep_expired()
    return [e.task for e in self._tasks.values()]

  # ── ttl expiry (§25.6) ──
  def _sweep_expired(self) -> None:
    now_s = self._now()
    for tid in list(self._tasks):
      entry = self._tasks[tid]
      ttl = entry.task["ttlMs"]
      if ttl is not None and (now_s - entry.created_at_s) * 1000 > ttl:
        del self._tasks[tid]

  def _live(self, task_id: str) -> _Entry:
    self._sweep_expired()
    return self._require(task_id)

  def _require(self, task_id: str) -> _Entry:
    entry = self._tasks.get(task_id)
    if entry is None:
      raise ServerError(INVALID_PARAMS_CODE, f'Task not found: "{task_id}"', {"taskId": task_id})
    return entry
