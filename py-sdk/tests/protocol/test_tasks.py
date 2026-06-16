"""Tests for the Tasks extension — status lifecycle, gating, error shapes (§25)."""

from mcp.protocol.tasks import (
  TASKS_EXTENSION_ID,
  build_task_not_found_error,
  build_tasks_missing_capability_error,
  is_legal_task_transition,
  is_tasks_active_for_request,
  is_terminal_task_status,
  subscribed_task_ids,
  task_subscription_requires_capability,
)

EXT = {TASKS_EXTENSION_ID: {}}


class TestIsTerminalTaskStatus:
  def test_terminal(self):
    assert is_terminal_task_status("completed")
    assert is_terminal_task_status("failed")
    assert is_terminal_task_status("cancelled")

  def test_non_terminal(self):
    assert not is_terminal_task_status("working")
    assert not is_terminal_task_status("input_required")


class TestIsLegalTaskTransition:
  def test_working_to_others(self):
    assert is_legal_task_transition("working", "input_required")
    assert is_legal_task_transition("working", "completed")
    assert is_legal_task_transition("working", "failed")
    assert is_legal_task_transition("working", "cancelled")

  def test_working_to_working_false(self):
    assert not is_legal_task_transition("working", "working")

  def test_input_required_to_working(self):
    assert is_legal_task_transition("input_required", "working")

  def test_terminal_to_anything_false(self):
    for terminal in ("completed", "failed", "cancelled"):
      assert not is_legal_task_transition(terminal, "working")
      assert not is_legal_task_transition(terminal, "completed")


class TestIsTasksActiveForRequest:
  def test_both_declare_is_active(self):
    assert is_tasks_active_for_request(EXT, EXT)

  def test_client_missing_is_inactive(self):
    assert not is_tasks_active_for_request({}, EXT)

  def test_server_missing_is_inactive(self):
    assert not is_tasks_active_for_request(EXT, {})


class TestErrorBuilders:
  def test_missing_capability_error(self):
    err = build_tasks_missing_capability_error("tasks/get")
    assert err["code"] == -32003
    assert err["data"]["requiredExtension"] == TASKS_EXTENSION_ID

  def test_not_found_error(self):
    err = build_task_not_found_error("task-1")
    assert err["code"] == -32602
    assert err["data"]["taskId"] == "task-1"


class TestSubscribedTaskIds:
  def test_present(self):
    assert subscribed_task_ids({"taskIds": ["a", "b"]}) == ["a", "b"]

  def test_absent_or_invalid(self):
    assert subscribed_task_ids({}) == []
    assert subscribed_task_ids({"taskIds": [1, 2]}) == []
    assert subscribed_task_ids(None) == []


class TestTaskSubscriptionRequiresCapability:
  def test_task_ids_not_negotiated_requires(self):
    assert task_subscription_requires_capability({"taskIds": ["t1"]}, client_negotiated=False)

  def test_task_ids_negotiated_does_not_require(self):
    assert not task_subscription_requires_capability({"taskIds": ["t1"]}, client_negotiated=True)

  def test_no_task_ids_does_not_require(self):
    assert not task_subscription_requires_capability({}, client_negotiated=False)
