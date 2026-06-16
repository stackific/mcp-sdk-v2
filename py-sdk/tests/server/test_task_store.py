"""Tests for the in-memory Tasks runtime — lifecycle, transitions, ttl, listener (§25)."""

import pytest

from mcp.protocol.errors import INTERNAL_ERROR_CODE, INVALID_PARAMS_CODE
from mcp.server.server import ServerError
from mcp.server.tasks import InMemoryTaskStore


def test_create_task_returns_working_handle():
  store = InMemoryTaskStore()
  task = store.create_task(ttl_ms=1000)
  assert task["status"] == "working"
  assert "taskId" in task
  assert "createdAt" in task
  assert "lastUpdatedAt" in task
  assert task["ttlMs"] == 1000


def test_update_status_enforces_legal_transitions():
  store = InMemoryTaskStore()
  task = store.create_task()
  updated = store.update_status(task["taskId"], "completed")
  assert updated["status"] == "completed"


def test_update_status_illegal_transition_raises_internal_error():
  store = InMemoryTaskStore()
  task = store.create_task()
  store.update_status(task["taskId"], "completed")
  with pytest.raises(ServerError) as excinfo:
    store.update_status(task["taskId"], "working")
  assert excinfo.value.code == INTERNAL_ERROR_CODE


def test_store_result_completes_and_get_detailed_returns_result():
  store = InMemoryTaskStore()
  task = store.create_task()
  store.store_result(task["taskId"], {"answer": 42})
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "completed"
  assert detailed["result"] == {"answer": 42}


def test_store_error_fails_and_get_detailed_returns_error():
  store = InMemoryTaskStore()
  task = store.create_task()
  err = {"code": INTERNAL_ERROR_CODE, "message": "boom"}
  store.store_error(task["taskId"], err)
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "failed"
  assert detailed["error"] == err


def test_set_input_requests_and_get_detailed_returns_input_requests():
  store = InMemoryTaskStore()
  task = store.create_task()
  requests = {"k": {"method": "elicitation/create"}}
  store.set_input_requests(task["taskId"], requests)
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "input_required"
  assert detailed["inputRequests"] == requests


def test_apply_input_on_input_required_returns_to_working():
  store = InMemoryTaskStore()
  task = store.create_task()
  store.set_input_requests(task["taskId"], {"k": {"method": "elicitation/create"}})
  updated = store.apply_input(task["taskId"], {"k": {"value": "x"}})
  assert updated["status"] == "working"


def test_apply_input_when_not_input_required_raises_invalid_params():
  store = InMemoryTaskStore()
  task = store.create_task()
  with pytest.raises(ServerError) as excinfo:
    store.apply_input(task["taskId"], {"k": {"value": "x"}})
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_cancel_non_terminal_moves_to_cancelled():
  store = InMemoryTaskStore()
  task = store.create_task()
  cancelled = store.cancel(task["taskId"])
  assert cancelled["status"] == "cancelled"


def test_cancel_terminal_leaves_unchanged():
  store = InMemoryTaskStore()
  task = store.create_task()
  store.store_result(task["taskId"], {"ok": True})
  unchanged = store.cancel(task["taskId"])
  assert unchanged["status"] == "completed"


def test_get_unknown_task_raises_invalid_params():
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.get("ghost")
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_get_detailed_unknown_task_raises_invalid_params():
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.get_detailed("ghost")
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_ttl_expiry_sweeps_task():
  clock = {"now": 1000.0}
  store = InMemoryTaskStore(now=lambda: clock["now"])
  task = store.create_task(ttl_ms=500)
  # Within ttl: still live.
  clock["now"] = 1000.4
  assert store.get(task["taskId"])["taskId"] == task["taskId"]
  # Past ttl (0.6s elapsed > 500ms): swept and not found.
  clock["now"] = 1000.6
  with pytest.raises(ServerError) as excinfo:
    store.get(task["taskId"])
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_set_update_listener_invoked_with_detailed_task_on_status_change():
  store = InMemoryTaskStore()
  seen = []
  store.set_update_listener(lambda detailed: seen.append(detailed))
  task = store.create_task()
  store.store_result(task["taskId"], {"ok": True})
  assert len(seen) == 1
  assert seen[0]["status"] == "completed"
  assert seen[0]["result"] == {"ok": True}
