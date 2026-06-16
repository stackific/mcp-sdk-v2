"""Tests for the Tasks extension — model, status lifecycle, gating, error shapes (§25.1–§25.6).

Mirrors ts-sdk/src/__tests__/protocol/tasks.test.ts (AC-39.1 … AC-39.22) and adds
Python-specific edge cases. Existing coverage (terminal status, transitions, gating,
error builders, subscription helpers) is preserved.
"""

import pytest

from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED
from mcp.protocol.errors import MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.tasks import (
  NON_TERMINAL_TASK_STATUSES,
  TASK_LIFECYCLE_METHODS,
  TASK_MISSING_CAPABILITY_CODE,
  TASK_NOT_FOUND_CODE,
  TASK_RESULT_TYPE,
  TASK_STATUSES,
  TASKS_CANCEL_METHOD,
  TASKS_EXTENSION_ID,
  TASKS_GET_METHOD,
  TASKS_NOTIFICATION_METHOD,
  TASKS_UPDATE_METHOD,
  TERMINAL_TASK_STATUSES,
  assert_legal_task_transition,
  build_task_not_found_error,
  build_tasks_missing_capability_error,
  client_declares_tasks_for_request,
  dispatch_eligible_result,
  has_consistent_inline_outcome,
  is_cancelled_task,
  is_completed_task,
  is_create_task_result,
  is_detailed_task,
  is_failed_task,
  is_input_required_task,
  is_legal_task_transition,
  is_task,
  is_task_expired,
  is_task_lifecycle_method,
  is_task_result_type,
  is_task_status,
  is_tasks_active_for_request,
  is_tasks_extension_capability,
  is_tasks_extension_id,
  is_terminal_task_status,
  is_valid_task_input_requests,
  is_valid_task_ttl_ms,
  is_working_task,
  may_poll_now,
  may_return_task_handle,
  resolve_poll_interval_ms,
  server_advertises_tasks,
  subscribed_task_ids,
  task_subscription_requires_capability,
)

EXT = {TASKS_EXTENSION_ID: {}}

BASE_TASK = {
  "taskId": "task_3f2a9c10",
  "status": "working",
  "createdAt": "2026-06-13T10:15:00Z",
  "lastUpdatedAt": "2026-06-13T10:15:00Z",
  "ttlMs": 3600000,
}


def task(**overrides):
  """Return a fresh BASE_TASK with overrides applied."""
  return {**BASE_TASK, **overrides}


# ─── AC-39.1 — identifier exact, case-sensitive (R-25.1-a) ──────────────────────


class TestIsTasksExtensionId:
  def test_matches_exact_identifier(self):
    assert TASKS_EXTENSION_ID == "io.modelcontextprotocol/tasks"
    assert is_tasks_extension_id("io.modelcontextprotocol/tasks")

  def test_rejects_case_differing_identifier(self):
    assert not is_tasks_extension_id("IO.MODELCONTEXTPROTOCOL/TASKS")
    assert not is_tasks_extension_id("io.modelcontextprotocol/Tasks")

  def test_rejects_prefix_or_suffix_extended_identifier(self):
    assert not is_tasks_extension_id("io.modelcontextprotocol/tasks-foo")
    assert not is_tasks_extension_id("io.modelcontextprotocol/task")
    assert not is_tasks_extension_id("xio.modelcontextprotocol/tasks")


# ─── AC-39.2 — empty settings; ignore unrecognized members (R-25.2-a,b) ─────────


class TestIsTasksExtensionCapability:
  def test_accepts_canonical_empty_settings(self):
    assert is_tasks_extension_capability({})

  def test_accepts_unrecognized_member(self):
    assert is_tasks_extension_capability({"somethingUnknown": 42})

  def test_rejects_non_object_values(self):
    assert not is_tasks_extension_capability([])
    assert not is_tasks_extension_capability("x")
    assert not is_tasks_extension_capability(None)
    assert not is_tasks_extension_capability(True)


# ─── AC-39.3 — per-request opt-in (R-25.2-c) ────────────────────────────────────


class TestClientDeclaresTasksForRequest:
  def test_declaring_request_eligible(self):
    assert client_declares_tasks_for_request(EXT)

  def test_request_lacking_declaration_not_eligible(self):
    assert not client_declares_tasks_for_request({})
    assert not client_declares_tasks_for_request(None)
    assert not client_declares_tasks_for_request({"io.modelcontextprotocol/ui": {}})


# ─── AC-39.4 — no task handle without declared capability (R-25.2-d) ────────────


class TestMayReturnTaskHandle:
  def test_request_without_declaration_not_eligible(self):
    assert not may_return_task_handle({}, EXT)
    assert not may_return_task_handle(None, EXT)

  def test_both_declare_may_get_handle(self):
    assert may_return_task_handle(EXT, EXT)

  def test_server_not_advertising_not_active(self):
    assert not may_return_task_handle(EXT, {})


# ─── AC-39.5 — client dispatches on resultType (R-25.2-e, R-25.3-c) ─────────────


class TestDispatchEligibleResult:
  def test_dispatches_task_handle_to_task_branch(self):
    handle = task(resultType="task")
    kind, result = dispatch_eligible_result(handle)
    assert kind == "task"
    assert result["taskId"] == "task_3f2a9c10"

  def test_dispatches_ordinary_result_to_ordinary_branch(self):
    ordinary = {"resultType": RESULT_TYPE_COMPLETE, "content": [{"type": "text", "text": "Done."}]}
    kind, result = dispatch_eligible_result(ordinary)
    assert kind == "ordinary"
    assert result is ordinary

  def test_malformed_task_payload_treated_as_ordinary(self):
    malformed = {"resultType": "task"}  # missing all Task fields
    kind, _ = dispatch_eligible_result(malformed)
    assert kind == "ordinary"

  def test_non_dict_treated_as_ordinary(self):
    assert dispatch_eligible_result(None) == ("ordinary", None)
    assert dispatch_eligible_result("x") == ("ordinary", "x")


# ─── AC-39.6 — missing-capability error for Tasks methods (R-25.2-f) ────────────


class TestErrorBuilders:
  def test_reuses_missing_capability_code(self):
    assert TASK_MISSING_CAPABILITY_CODE == MISSING_CLIENT_CAPABILITY_CODE
    assert TASK_MISSING_CAPABILITY_CODE == -32003

  def test_missing_capability_error(self):
    err = build_tasks_missing_capability_error("tasks/get")
    assert err["code"] == -32003
    assert err["data"]["method"] == "tasks/get"
    assert err["data"]["requiredExtension"] == TASKS_EXTENSION_ID

  def test_not_found_error(self):
    err = build_task_not_found_error("task-1")
    assert err["code"] == -32602
    assert err["data"]["taskId"] == "task-1"


# ─── AC-39.7 — task creation is server-directed (R-25.2-g, R-25.3-a,b) ──────────


class TestServerDirected:
  def test_eligibility_is_purely_the_declaration(self):
    assert may_return_task_handle(EXT, EXT)

  def test_server_may_substitute_for_some_eligible_requests(self):
    assert may_return_task_handle(EXT, EXT)
    ordinary = {"resultType": RESULT_TYPE_COMPLETE}
    assert dispatch_eligible_result(ordinary)[0] == "ordinary"
    handle = task(resultType="task")
    assert dispatch_eligible_result(handle)[0] == "task"


# ─── AC-39.8 — CreateTaskResult shape (R-25.3-c) ────────────────────────────────


class TestCreateTaskResult:
  def test_parses_complete_task_handle(self):
    handle = {
      "resultType": "task",
      "taskId": "task_3f2a9c10",
      "status": "working",
      "statusMessage": "Processing item 42 of 100",
      "createdAt": "2026-06-13T10:15:00Z",
      "lastUpdatedAt": "2026-06-13T10:15:00Z",
      "ttlMs": 3600000,
      "pollIntervalMs": 2000,
    }
    assert is_create_task_result(handle)

  def test_task_result_type_constant_and_predicate(self):
    assert TASK_RESULT_TYPE == "task"
    assert is_task_result_type("task")
    assert not is_task_result_type("complete")
    assert not is_task_result_type(RESULT_TYPE_INPUT_REQUIRED)
    assert not is_task_result_type(None)

  def test_rejects_handle_whose_result_type_is_not_task(self):
    assert not is_create_task_result(task(resultType="complete"))

  def test_rejects_handle_missing_result_type(self):
    assert not is_create_task_result(task())

  def test_permits_optional_meta(self):
    assert is_create_task_result(task(resultType="task", _meta={"x.y/z": 1}))

  def test_rejects_non_object_meta(self):
    assert not is_create_task_result(task(resultType="task", _meta="bad"))

  def test_rejects_non_dict(self):
    assert not is_create_task_result(None)
    assert not is_create_task_result("task")


# ─── AC-39.9 — taskId opaque (R-25.4-a) ─────────────────────────────────────────


class TestTaskIdOpaque:
  def test_accepts_any_non_empty_string_verbatim(self):
    for task_id in ("task_3f2a9c10", "opaque/with/slashes", "12345", "a b c"):
      t = task(taskId=task_id)
      assert is_task(t)
      assert t["taskId"] == task_id

  def test_rejects_non_string_task_id(self):
    assert not is_task(task(taskId=42))
    assert not is_task(task(taskId=None))


# ─── AC-39.10 — required Task fields; ttlMs union (R-25.4-b) ─────────────────────


class TestTaskFields:
  def test_accepts_task_with_all_required_fields(self):
    assert is_task(BASE_TASK)

  def test_rejects_task_missing_any_required_field(self):
    for key in ("taskId", "status", "createdAt", "lastUpdatedAt", "ttlMs"):
      incomplete = dict(BASE_TASK)
      del incomplete[key]
      assert not is_task(incomplete), key

  def test_ttl_ms_accepts_non_negative_number_or_null(self):
    assert is_valid_task_ttl_ms(0)
    assert is_valid_task_ttl_ms(3600000)
    assert is_valid_task_ttl_ms(1.5)
    assert is_valid_task_ttl_ms(None)

  def test_ttl_ms_rejects_negative_and_non_number(self):
    assert not is_valid_task_ttl_ms(-1)
    assert not is_valid_task_ttl_ms(True)
    assert not is_valid_task_ttl_ms("100")
    assert not is_task(task(ttlMs=-5))

  def test_status_message_and_poll_interval_optional(self):
    assert is_task(task(statusMessage="hi", pollIntervalMs=2000))
    # Omitting them entirely is valid.
    assert is_task(BASE_TASK)

  def test_rejects_non_string_status_message(self):
    assert not is_task(task(statusMessage=5))

  def test_rejects_negative_or_non_number_poll_interval(self):
    assert not is_task(task(pollIntervalMs=-1))
    assert not is_task(task(pollIntervalMs=True))
    assert not is_task(task(pollIntervalMs="2000"))

  def test_rejects_invalid_status(self):
    assert not is_task(task(status="Working"))
    assert not is_task(task(status="done"))

  def test_tolerates_additional_members(self):
    assert is_task(task(extra="passthrough", requestState="opaque-token"))


# ─── AC-39.11 — ttlMs expiry and the not-found error (R-25.4-c, R-25.6-f,g) ─────


class TestTaskExpiry:
  CREATED_AT = 1_000_000

  def test_expired_once_non_null_ttl_elapsed(self):
    assert not is_task_expired(self.CREATED_AT, 1000, self.CREATED_AT + 999)
    assert is_task_expired(self.CREATED_AT, 1000, self.CREATED_AT + 1000)
    assert is_task_expired(self.CREATED_AT, 1000, self.CREATED_AT + 5000)

  def test_null_ttl_never_expires(self):
    assert not is_task_expired(self.CREATED_AT, None, self.CREATED_AT + 10_000_000)

  def test_not_found_code_and_error(self):
    assert TASK_NOT_FOUND_CODE == -32602
    err = build_task_not_found_error("task_gone")
    assert err["code"] == -32602
    assert err["data"]["taskId"] == "task_gone"


# ─── AC-39.12 — polling interval (R-25.4-d, R-25.4-e) ───────────────────────────


class TestPollingInterval:
  def test_uses_recommended_poll_interval_when_present(self):
    assert resolve_poll_interval_ms(2000) == 2000
    assert resolve_poll_interval_ms(0) == 0

  def test_chooses_fallback_when_absent(self):
    assert resolve_poll_interval_ms(None) == 1000
    assert resolve_poll_interval_ms(None, 500) == 500

  def test_disallows_polling_before_interval_elapses(self):
    assert may_poll_now(None, 0, 2000)  # first poll always allowed
    assert not may_poll_now(1000, 1000 + 1999, 2000)
    assert may_poll_now(1000, 1000 + 2000, 2000)

  def test_applies_fallback_cadence_when_absent(self):
    assert not may_poll_now(1000, 1000 + 999, None, 1000)
    assert may_poll_now(1000, 1000 + 1000, None, 1000)


# ─── AC-39.13 — TaskStatus is one of five case-sensitive values (R-25.5-a) ──────


class TestTaskStatus:
  def test_enumerates_five_values_in_spec_order(self):
    assert TASK_STATUSES == ("working", "input_required", "completed", "failed", "cancelled")

  def test_accepts_each_valid_status_rejects_miscased(self):
    for s in TASK_STATUSES:
      assert is_task_status(s)
    assert not is_task_status("Working")
    assert not is_task_status("done")
    assert not is_task_status("inputRequired")
    assert not is_task_status(None)

  def test_terminal_and_non_terminal_sets(self):
    assert sorted(TERMINAL_TASK_STATUSES) == ["cancelled", "completed", "failed"]
    assert sorted(NON_TERMINAL_TASK_STATUSES) == ["input_required", "working"]
    assert is_terminal_task_status("completed")
    assert not is_terminal_task_status("working")

  def test_terminal(self):
    assert is_terminal_task_status("completed")
    assert is_terminal_task_status("failed")
    assert is_terminal_task_status("cancelled")

  def test_non_terminal(self):
    assert not is_terminal_task_status("working")
    assert not is_terminal_task_status("input_required")


# ─── AC-39.14 — terminal states are immutable (R-25.5-b) ────────────────────────


class TestTerminalImmutable:
  def test_forbids_any_transition_out_of_terminal(self):
    for from_ in ("completed", "failed", "cancelled"):
      for to in TASK_STATUSES:
        assert not is_legal_task_transition(from_, to)

  def test_assert_throws_for_terminal_transition(self):
    with pytest.raises(ValueError, match="immutable"):
      assert_legal_task_transition("completed", "working")
    with pytest.raises(ValueError, match="immutable"):
      assert_legal_task_transition("cancelled", "failed")

  def test_terminal_to_anything_false(self):
    for terminal in ("completed", "failed", "cancelled"):
      assert not is_legal_task_transition(terminal, "working")
      assert not is_legal_task_transition(terminal, "completed")

  def test_completed_variant_requires_result(self):
    assert is_detailed_task(task(status="completed", result={"resultType": "complete"}))
    assert not is_completed_task(task(status="completed"))


# ─── AC-39.15 — non-terminal transitions (R-25.5-c) ─────────────────────────────


class TestNonTerminalTransitions:
  def test_working_to_input_required_or_terminal(self):
    assert is_legal_task_transition("working", "input_required")
    assert is_legal_task_transition("working", "completed")
    assert is_legal_task_transition("working", "failed")
    assert is_legal_task_transition("working", "cancelled")

  def test_input_required_to_working_or_terminal(self):
    assert is_legal_task_transition("input_required", "working")
    assert is_legal_task_transition("input_required", "completed")
    assert is_legal_task_transition("input_required", "failed")
    assert is_legal_task_transition("input_required", "cancelled")

  def test_self_transition_between_non_terminal_not_a_change(self):
    assert not is_legal_task_transition("working", "working")
    assert not is_legal_task_transition("input_required", "input_required")

  def test_assert_passes_for_legal_non_terminal_move(self):
    assert_legal_task_transition("working", "input_required")
    assert_legal_task_transition("input_required", "working")

  def test_assert_throws_for_illegal_non_terminal_move(self):
    # working cannot stay working — not a transition (R-25.5-c).
    with pytest.raises(ValueError, match="Illegal task transition"):
      assert_legal_task_transition("working", "working")


# ─── AC-39.16 — inline outcome conveyed only when terminal (R-25.5-d) ───────────


class TestInlineOutcome:
  def test_completed_carries_result_and_no_error(self):
    t = task(status="completed", result={"resultType": "complete"})
    assert is_completed_task(t)
    assert has_consistent_inline_outcome(t)

  def test_failed_carries_error_and_no_result(self):
    t = task(
      status="failed",
      error={"code": -32603, "message": "Internal error while processing item 57"},
    )
    assert is_failed_task(t)
    assert has_consistent_inline_outcome(t)

  def test_input_required_carries_input_requests_only(self):
    t = task(
      status="input_required",
      inputRequests={"req-1": {"method": "elicitation/create", "params": {}}},
    )
    assert is_input_required_task(t)
    assert has_consistent_inline_outcome(t)
    assert is_valid_task_input_requests(t["inputRequests"])

  def test_input_requests_empty_map_valid(self):
    assert is_valid_task_input_requests({})
    assert is_input_required_task(task(status="input_required", inputRequests={}))

  def test_input_requests_rejects_unrecognized_method(self):
    assert not is_valid_task_input_requests({"r": {"method": "bogus/method", "params": {}}})
    assert not is_input_required_task(
      task(status="input_required", inputRequests={"r": {"method": "bogus", "params": {}}})
    )

  def test_input_required_missing_input_requests_invalid(self):
    assert not is_input_required_task(task(status="input_required"))

  def test_working_and_cancelled_carry_neither(self):
    assert is_working_task(task(status="working"))
    assert is_cancelled_task(task(status="cancelled"))
    assert has_consistent_inline_outcome(task(status="working"))
    assert has_consistent_inline_outcome(task(status="cancelled"))

  def test_flags_non_terminal_smuggling_result_or_error(self):
    assert not has_consistent_inline_outcome(task(status="working", result={"x": 1}))
    assert not has_consistent_inline_outcome(
      task(status="cancelled", error={"code": -1, "message": "x"})
    )

  def test_failed_requires_well_formed_error(self):
    # An error object missing a code/message is not a valid McpError.
    assert not is_failed_task(task(status="failed", error={"message": "no code"}))

  def test_detailed_task_discriminates_each_variant(self):
    assert is_detailed_task(task(status="working"))
    assert is_detailed_task(task(status="completed", result={}))
    assert is_detailed_task(task(status="failed", error={"code": -1, "message": "x"}))
    # completed without result is invalid
    assert not is_detailed_task(task(status="completed"))
    # failed without error is invalid
    assert not is_detailed_task(task(status="failed"))

  def test_detailed_task_rejects_non_dict_and_unknown_status(self):
    assert not is_detailed_task(None)
    assert not is_detailed_task("x")
    assert not is_detailed_task(task(status="bogus"))

  def test_has_consistent_inline_outcome_unknown_status(self):
    assert not has_consistent_inline_outcome({"status": "bogus"})


# ─── AC-39.17 — client polls until a terminal state (R-25.5-e) ──────────────────


class TestPollUntilTerminal:
  def test_poll_loop_stops_only_at_terminal_status(self):
    sequence = [
      task(status="working"),
      task(status="input_required", inputRequests={}),
      task(status="working"),
      task(status="completed", result={"resultType": "complete"}),
    ]
    i = 0
    last = "working"
    while i < len(sequence) and not is_terminal_task_status(sequence[i]["status"]):
      last = sequence[i]["status"]
      i += 1
    assert is_terminal_task_status(sequence[i]["status"])
    assert sequence[i]["status"] == "completed"
    assert last in NON_TERMINAL_TASK_STATUSES


# ─── AC-39.18 — tasks behave correctly under the stateless model (R-25.6-a) ─────


class TestStatelessModel:
  def test_eligibility_from_this_request_only(self):
    assert is_tasks_active_for_request(EXT, EXT)
    # A later request that omits the declaration is NOT eligible.
    assert not is_tasks_active_for_request({}, EXT)
    assert not is_tasks_active_for_request(None, EXT)

  def test_requires_server_advertisement_intersection(self):
    assert server_advertises_tasks(EXT)
    assert not server_advertises_tasks({})
    assert not is_tasks_active_for_request(EXT, {})

  def test_both_declare_is_active(self):
    assert is_tasks_active_for_request(EXT, EXT)


# ─── AC-39.19/20 — durability and instance-agnostic resolution (R-25.6-b,c,d) ───


class DurableTaskStore:
  """A minimal durable store the spec mandates a server keep (no session affinity)."""

  def __init__(self):
    self._records = {}

  def persist(self, t):
    self._records[t["taskId"]] = t

  def resolve(self, task_id):
    return self._records.get(task_id)


class TestDurability:
  def test_persists_before_returning_handle_and_survives(self):
    store = DurableTaskStore()
    handle = task(resultType="task")
    store.persist(task(status="working"))  # persist BEFORE returning the handle
    assert is_create_task_result(handle)
    resolved = store.resolve(handle["taskId"])
    assert resolved is not None
    assert resolved["taskId"] == handle["taskId"]

  def test_any_instance_answers_from_durable_record(self):
    store = DurableTaskStore()
    store.persist(task(status="completed", result={"resultType": "complete"}))

    def instance_b(task_id):
      return store.resolve(task_id) or build_task_not_found_error(task_id)

    resolved = instance_b(BASE_TASK["taskId"])
    assert resolved["status"] == "completed"

    missing = instance_b("task_unknown")
    assert missing["code"] == TASK_NOT_FOUND_CODE


# ─── AC-39.21 — resumable state may reuse the §11 continuation token (R-25.6-e) ─


class TestResumableState:
  def test_task_may_carry_opaque_request_state_in_passthrough(self):
    t = task(requestState="opaque-continuation-token")
    assert is_task(t)
    assert t["requestState"] == "opaque-continuation-token"


# ─── AC-39.22 — client persists taskId to resume after restart (R-25.6-h) ───────


class TestClientPersistsTaskId:
  def test_stores_opaque_task_id_verbatim_and_resumes(self):
    handle = task(resultType="task")
    persisted_id = handle["taskId"]
    assert persisted_id == "task_3f2a9c10"
    resumed_get_params = {"taskId": persisted_id}
    assert resumed_get_params["taskId"] == handle["taskId"]


# ─── Method-name constants (cross-module surface used by S40) ────────────────────


class TestMethodNames:
  def test_method_constants(self):
    assert TASKS_GET_METHOD == "tasks/get"
    assert TASKS_UPDATE_METHOD == "tasks/update"
    assert TASKS_CANCEL_METHOD == "tasks/cancel"
    assert TASKS_NOTIFICATION_METHOD == "notifications/tasks"
    assert TASK_LIFECYCLE_METHODS == ("tasks/get", "tasks/update", "tasks/cancel")

  def test_is_task_lifecycle_method(self):
    assert is_task_lifecycle_method("tasks/get")
    assert is_task_lifecycle_method("tasks/update")
    assert is_task_lifecycle_method("tasks/cancel")
    assert not is_task_lifecycle_method("notifications/tasks")
    assert not is_task_lifecycle_method("tools/call")


# ─── Subscription helpers (reused by S40) ───────────────────────────────────────


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
