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


def test_create_task_created_at_equals_last_updated_at_at_birth():
  # Mirrors the TS `lastUpdatedAt === createdAt` assertion: at creation both stamps match.
  store = InMemoryTaskStore(now=lambda: 1.0)
  task = store.create_task(ttl_ms=60000)
  assert task["createdAt"] == task["lastUpdatedAt"]


def test_create_task_with_explicit_task_id_is_used_verbatim():
  store = InMemoryTaskStore()
  task = store.create_task(task_id="my-id")
  assert task["taskId"] == "my-id"
  assert store.get("my-id")["taskId"] == "my-id"


def test_create_task_default_ttl_ms_is_none_unbounded():
  # No ttl supplied ⇒ ttlMs is null (unbounded lifetime), never swept.
  store = InMemoryTaskStore()
  task = store.create_task()
  assert task["ttlMs"] is None


def test_create_task_stamps_default_poll_interval_ms_when_configured():
  store = InMemoryTaskStore(default_poll_interval_ms=250)
  task = store.create_task()
  assert task["pollIntervalMs"] == 250


def test_create_task_omits_poll_interval_ms_when_not_configured():
  store = InMemoryTaskStore()
  task = store.create_task()
  assert "pollIntervalMs" not in task


def test_update_status_enforces_legal_transitions():
  store = InMemoryTaskStore()
  task = store.create_task()
  updated = store.update_status(task["taskId"], "completed")
  assert updated["status"] == "completed"


def test_update_status_carries_status_message_and_bumps_last_updated_at():
  # Mirrors the TS lifecycle: a working→working bump records the statusMessage and a
  # fresh lastUpdatedAt (advancing the clock proves the stamp is re-derived).
  clock = {"now": 1.0}
  store = InMemoryTaskStore(now=lambda: clock["now"])
  task = store.create_task(ttl_ms=60000)
  created_at = task["createdAt"]
  clock["now"] = 2.0
  updated = store.update_status(task["taskId"], "working", "step 1/2")
  assert updated["statusMessage"] == "step 1/2"
  assert updated["status"] == "working"
  assert updated["lastUpdatedAt"] != created_at
  # And the message is observable on a subsequent get.
  assert store.get(task["taskId"])["statusMessage"] == "step 1/2"


def test_update_status_self_transition_to_same_non_terminal_is_allowed():
  # `status === status` short-circuits the legality check (TS line 80), so a no-op
  # working→working transition succeeds even though it is not a "legal transition".
  store = InMemoryTaskStore()
  task = store.create_task()
  updated = store.update_status(task["taskId"], "working", "still working")
  assert updated["status"] == "working"
  assert updated["statusMessage"] == "still working"


def test_update_status_unknown_task_raises_invalid_params():
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.update_status("ghost", "completed")
  assert excinfo.value.code == INVALID_PARAMS_CODE


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


def test_store_result_with_explicit_terminal_status():
  # The optional status argument lets a tool finish into failed/cancelled too.
  store = InMemoryTaskStore()
  task = store.create_task()
  updated = store.store_result(task["taskId"], {"why": "nope"}, "failed")
  assert updated["status"] == "failed"


def test_store_result_non_terminal_status_raises_internal_error():
  store = InMemoryTaskStore()
  task = store.create_task()
  with pytest.raises(ServerError) as excinfo:
    store.store_result(task["taskId"], {"x": 1}, "working")
  assert excinfo.value.code == INTERNAL_ERROR_CODE


def test_store_result_unknown_task_raises_invalid_params():
  # TS requires the task FIRST (not-found, -32602) before the terminal-status check,
  # so an unknown id is reported as not-found rather than a bad-status error.
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.store_result("ghost", {"x": 1})
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_legal_lifecycle_runs_to_a_result_via_get_result():
  # The full TS lifecycle: create → working bump → storeResult → getResult sees content.
  clock = {"now": 1.0}
  store = InMemoryTaskStore(now=lambda: clock["now"])
  task = store.create_task(ttl_ms=60000)
  clock["now"] = 2.0
  store.update_status(task["taskId"], "working", "step 1/2")
  assert store.get(task["taskId"])["statusMessage"] == "step 1/2"
  store.store_result(task["taskId"], {"content": [{"type": "text", "text": "done"}]})
  assert store.get(task["taskId"])["status"] == "completed"
  result = store.get_result(task["taskId"])
  assert result["content"][0]["text"] == "done"
  assert result["taskId"] == task["taskId"]
  assert result["status"] == "completed"


def test_get_result_on_unfinished_task_raises_invalid_params():
  store = InMemoryTaskStore()
  task = store.create_task()
  with pytest.raises(ServerError) as excinfo:
    store.get_result(task["taskId"])
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_get_result_unknown_task_raises_invalid_params():
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.get_result("ghost")
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_get_result_with_no_stored_result_returns_taskid_and_status_only():
  # A task moved to a terminal state without a stored payload yields just the
  # identity/status envelope (the spread of an empty result).
  store = InMemoryTaskStore()
  task = store.create_task()
  store.cancel(task["taskId"])
  result = store.get_result(task["taskId"])
  assert result == {"taskId": task["taskId"], "status": "cancelled"}


def test_get_result_on_expired_task_raises_invalid_params():
  clock = {"now": 0.0}
  store = InMemoryTaskStore(now=lambda: clock["now"])
  task = store.create_task(ttl_ms=100)
  store.store_result(task["taskId"], {"ok": True})
  clock["now"] = 1.0  # beyond ttl → swept before get_result reads
  with pytest.raises(ServerError) as excinfo:
    store.get_result(task["taskId"])
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_store_error_fails_and_get_detailed_returns_error():
  store = InMemoryTaskStore()
  task = store.create_task()
  err = {"code": INTERNAL_ERROR_CODE, "message": "boom"}
  store.store_error(task["taskId"], err)
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "failed"
  assert detailed["error"] == err


def test_get_detailed_failed_without_stored_error_synthesizes_default():
  # A task moved to failed via update_status (no inline error stored) falls back to the
  # INTERNAL_ERROR default, using the statusMessage as the message (TS line 141).
  store = InMemoryTaskStore()
  task = store.create_task()
  store.update_status(task["taskId"], "failed", "kaboom")
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "failed"
  assert detailed["error"]["code"] == INTERNAL_ERROR_CODE
  assert detailed["error"]["message"] == "kaboom"


def test_get_detailed_working_has_no_outcome_fields():
  store = InMemoryTaskStore()
  task = store.create_task()
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "working"
  assert "result" not in detailed
  assert "error" not in detailed
  assert "inputRequests" not in detailed


def test_set_input_requests_and_get_detailed_returns_input_requests():
  store = InMemoryTaskStore()
  task = store.create_task()
  requests = {"k": {"method": "elicitation/create"}}
  store.set_input_requests(task["taskId"], requests)
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "input_required"
  assert detailed["inputRequests"] == requests


def test_terminal_task_is_immutable_store_result_then_reopen_raises():
  # TS test #2: a completed (terminal) task MUST NOT transition back to working.
  store = InMemoryTaskStore()
  task = store.create_task(ttl_ms=None)
  store.store_result(task["taskId"], {})
  with pytest.raises(ServerError) as excinfo:
    store.update_status(task["taskId"], "working")
  assert excinfo.value.code == INTERNAL_ERROR_CODE


def test_apply_input_on_input_required_returns_to_working():
  store = InMemoryTaskStore()
  task = store.create_task()
  store.set_input_requests(task["taskId"], {"k": {"method": "elicitation/create"}})
  updated = store.apply_input(task["taskId"], {"k": {"value": "x"}})
  assert updated["status"] == "working"


def test_apply_input_clears_outstanding_input_requests():
  # Once input is supplied the task is no longer input_required: its detailed view is
  # the plain working shape (no leftover inputRequests).
  store = InMemoryTaskStore()
  task = store.create_task()
  store.set_input_requests(task["taskId"], {"k": {"method": "elicitation/create"}})
  store.apply_input(task["taskId"], {"k": {"value": "x"}})
  detailed = store.get_detailed(task["taskId"])
  assert detailed["status"] == "working"
  assert "inputRequests" not in detailed


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


def test_cancel_unknown_task_raises_invalid_params():
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.cancel("ghost")
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_list_returns_all_live_tasks():
  store = InMemoryTaskStore()
  a = store.create_task()
  b = store.create_task()
  ids = {t["taskId"] for t in store.list()}
  assert ids == {a["taskId"], b["taskId"]}


def test_list_sweeps_expired_tasks_first():
  clock = {"now": 0.0}
  store = InMemoryTaskStore(now=lambda: clock["now"])
  short = store.create_task(ttl_ms=100)
  forever = store.create_task(ttl_ms=None)
  clock["now"] = 1.0  # past the short ttl, unbounded survives
  ids = {t["taskId"] for t in store.list()}
  assert ids == {forever["taskId"]}
  assert short["taskId"] not in ids


def test_get_unknown_task_raises_invalid_params():
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.get("ghost")
  assert excinfo.value.code == INVALID_PARAMS_CODE


def test_get_unknown_task_error_carries_task_id_in_data():
  # The require() path attaches the taskId as structured error data (TS line 206).
  store = InMemoryTaskStore()
  with pytest.raises(ServerError) as excinfo:
    store.get("ghost")
  assert excinfo.value.data == {"taskId": "ghost"}


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
