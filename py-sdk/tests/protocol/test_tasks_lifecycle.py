"""Tests for S40 — Tasks Extension II: get/update/cancel, Notifications & Cleanup
(§25.7–§25.12).

Mirrors the TS suite ``ts-sdk/src/__tests__/protocol/tasks-lifecycle.test.ts`` one-for-one
(each AC named in the surrounding class) and adds Python-specific edge cases for the
dict-shape predicates that replace the TS Zod schemas.

AC coverage:
  AC-40.1  (R-25.7-a,b,e)       — tasks/get verbatim taskId → resultType "complete"
  AC-40.2  (R-25.7-c,d)         — un-negotiated tasks/get → -32003
  AC-40.3  (R-25.7-f,g)         — working variant, no payload
  AC-40.4  (R-25.7-h,i)         — input_required variant carries inputRequests
  AC-40.5  (R-25.7-j)           — completed variant carries result
  AC-40.6  (R-25.7-k)           — failed variant carries error
  AC-40.7  (R-25.7-l)           — cancelled variant, no payload
  AC-40.8  (R-25.7-m,n)         — honor / adopt latest pollIntervalMs
  AC-40.9  (R-25.7-o)           — server may rate-limit faster-than-interval polls
  AC-40.10 (R-25.7-p)           — continue polling until terminal / cancel
  AC-40.11 (R-25.7-q)           — taskId persisted to durable storage
  AC-40.12 (R-25.7-r,s; R-25.11-d,e) — unknown/expired taskId → -32602, stop polling
  AC-40.13 (R-25.8-a,b)         — tasks/update needs taskId + inputResponses; keys match
  AC-40.14 (R-25.8-c,d)         — un-negotiated tasks/update → -32003
  AC-40.15 (R-25.8-e,f)         — inputRequests keys unique over lifetime
  AC-40.16 (R-25.8-g)           — server ignores stale inputResponses entries
  AC-40.17 (R-25.8-h)           — partial responses accepted; stays input_required
  AC-40.18 (R-25.8-i)           — client tracks answered keys (no double answer)
  AC-40.19 (R-25.8-j,k)         — tasks/update ack is empty "complete"
  AC-40.20 (R-25.8-l)           — ack is eventually consistent
  AC-40.21 (R-25.8-m)           — tasks/update unknown taskId → -32602
  AC-40.22 (R-25.8-n)           — keep observing after tasks/update
  AC-40.23 (R-25.9-a)           — notifications/cancelled never used for tasks
  AC-40.24 (R-25.9-b)           — tasks/cancel needs taskId
  AC-40.25 (R-25.9-c,d)         — un-negotiated tasks/cancel → -32003
  AC-40.26 (R-25.9-e,f)         — tasks/cancel ack is empty "complete"
  AC-40.27 (R-25.9-g)           — tasks/cancel unknown taskId → -32602
  AC-40.28 (R-25.9-h,i)         — cancel: ack only, may stay non-terminal / other terminal
  AC-40.29 (R-25.9-j)           — terminal task: cancel does not change status
  AC-40.30 (R-25.9-k)           — client may drop state / stop polling after cancel
  AC-40.31 (R-25.10-a)          — notifications/tasks carries full DetailedTask
  AC-40.32 (R-25.10-b,c)        — opt-in via taskIds filter; each a held taskId
  AC-40.33 (R-25.10-d)          — no push for unsubscribed task
  AC-40.34 (R-25.10-e)          — taskIds without capability → -32003
  AC-40.35 (R-25.10-f)          — may rely on notifications, polling, or both
  AC-40.36 (R-25.10-g)          — no progress/message notifications for a task
  AC-40.37 (R-25.10-h)          — pre-task input resolved synchronously
  AC-40.38 (R-25.10-i)          — inputRequests treated as standalone request (trust)
  AC-40.39 (R-25.10-j)          — task input via tasks/update; inline via re-issue; never mixed
  AC-40.40 (R-25.11-a,b)        — ttlMs mutable; may fail+remove after elapse
  AC-40.41 (R-25.11-c)          — non-null ttlMs backstop
  AC-40.42 (R-25.11-f,g)        — protocol error → failed + error + statusMessage
  AC-40.43 (R-25.11-h,i)        — app error → completed with error in result; failed not used
"""

import copy
import json

import pytest

from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE
from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.tasks import is_terminal_task_status
from mcp.protocol.tasks_lifecycle import (
  CANCELLED_NOTIFICATION_METHOD,
  LOGGING_MESSAGE_METHOD,
  PROGRESS_NOTIFICATION_METHOD,
  TASK_FORBIDDEN_NOTIFICATION_METHODS,
  TASK_INVALID_PARAMS_CODE,
  TASK_LIFECYCLE_METHODS,
  TASK_MISSING_CAPABILITY_CODE,
  TASKS_CANCEL_METHOD,
  TASKS_GET_METHOD,
  TASKS_NOTIFICATION_METHOD,
  TASKS_UPDATE_METHOD,
  adopt_latest_poll_interval_ms,
  build_completed_task_update,
  build_failed_task_update,
  build_get_task_result,
  build_task_acknowledgement_result,
  build_task_status_notification,
  build_task_unknown_error,
  build_tasks_missing_capability_error,
  classify_cancel_effect,
  classify_task_execution_outcome,
  filter_outstanding_input_responses,
  is_forbidden_task_notification,
  is_partial_input_response,
  is_polling_terminal_response,
  is_task_acknowledgement_result,
  is_task_backstop_elapsed,
  is_task_lifecycle_method,
  is_valid_cancel_task_request,
  is_valid_cancel_task_request_params,
  is_valid_detailed_task,
  is_valid_get_task_request,
  is_valid_get_task_request_params,
  is_valid_get_task_result,
  is_valid_task_input_responses,
  is_valid_task_status_notification,
  is_valid_update_task_request,
  is_valid_update_task_request_params,
  may_push_task_notification,
  may_rate_limit_poll,
  resolve_poll_interval_ms,
  should_continue_polling,
  subscribed_task_ids,
  task_subscription_requires_capability,
  validate_update_input_response_keys,
)

# ─── Fixtures ──────────────────────────────────────────────────────────────────

TASK_ID = "786512e2-9e0d-44bd-8f29-789f320fe840"


def base(**overrides) -> dict:
  """Base Task fields shared by every DetailedTask variant."""
  task = {
    "taskId": TASK_ID,
    "createdAt": "2026-07-28T10:30:00Z",
    "lastUpdatedAt": "2026-07-28T10:50:00Z",
    "ttlMs": 3_600_000,
    "pollIntervalMs": 5000,
  }
  task.update(overrides)
  return task


def working_task() -> dict:
  return base(status="working")


def input_required_task() -> dict:
  return base(
    status="input_required",
    inputRequests={"name": {"method": "elicitation/create", "params": {"message": "Your name?"}}},
  )


def completed_task() -> dict:
  return base(
    status="completed",
    result={"content": [{"type": "text", "text": "Hello, Luca!"}], "isError": False},
  )


def failed_task() -> dict:
  return base(
    status="failed",
    statusMessage="upstream timed out",
    error={"code": -32000, "message": "Execution error"},
  )


def cancelled_task() -> dict:
  return base(status="cancelled")


def request_meta() -> dict:
  """A valid per-request _meta object (the three required keys)."""
  return {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": {"name": "c", "version": "1"},
    "io.modelcontextprotocol/clientCapabilities": {},
  }


# ─── Method & notification names ────────────────────────────────────────────────


class TestMethodAndNotificationNames:
  def test_exact_literal_method_names(self):
    assert TASKS_GET_METHOD == "tasks/get"
    assert TASKS_UPDATE_METHOD == "tasks/update"
    assert TASKS_CANCEL_METHOD == "tasks/cancel"
    assert TASKS_NOTIFICATION_METHOD == "notifications/tasks"

  def test_is_task_lifecycle_method_recognizes_the_three_only(self):
    assert TASK_LIFECYCLE_METHODS == ("tasks/get", "tasks/update", "tasks/cancel")
    for m in TASK_LIFECYCLE_METHODS:
      assert is_task_lifecycle_method(m)
    assert not is_task_lifecycle_method("notifications/tasks")
    assert not is_task_lifecycle_method("tools/call")
    assert not is_task_lifecycle_method("")


# ─── AC-40.1 ────────────────────────────────────────────────────────────────────


class TestAC401GetTaskRequestComplete:
  def test_accepts_tasks_get_with_verbatim_task_id(self):
    req = {
      "jsonrpc": "2.0",
      "id": 8,
      "method": TASKS_GET_METHOD,
      "params": {"taskId": TASK_ID, "_meta": request_meta()},
    }
    assert is_valid_get_task_request(req)
    # taskId carried verbatim, unchanged. (R-25.7-b)
    assert req["params"]["taskId"] == TASK_ID

  def test_requires_params_task_id(self):
    assert not is_valid_get_task_request_params({})
    assert is_valid_get_task_request_params({"taskId": TASK_ID})

  def test_get_task_result_result_type_must_be_complete(self):
    result = build_get_task_result(working_task())
    assert result["resultType"] == RESULT_TYPE_COMPLETE
    assert result["resultType"] == "complete"
    assert is_valid_get_task_result(result)

  def test_rejects_get_task_result_with_wrong_result_type(self):
    bad = {**working_task(), "resultType": "task"}
    assert not is_valid_get_task_result(bad)

  def test_get_request_envelope_rejects_wrong_method(self):
    req = {"jsonrpc": "2.0", "id": 1, "method": "tasks/update", "params": {"taskId": TASK_ID}}
    assert not is_valid_get_task_request(req)

  def test_get_request_id_variants(self):
    # number id allowed
    assert is_valid_get_task_request(
      {"jsonrpc": "2.0", "id": 1, "method": TASKS_GET_METHOD, "params": {"taskId": TASK_ID}}
    )
    # string id allowed
    assert is_valid_get_task_request(
      {"jsonrpc": "2.0", "id": "abc", "method": TASKS_GET_METHOD, "params": {"taskId": TASK_ID}}
    )
    # bool id rejected (bool is not a valid number id)
    assert not is_valid_get_task_request(
      {"jsonrpc": "2.0", "id": True, "method": TASKS_GET_METHOD, "params": {"taskId": TASK_ID}}
    )
    # missing jsonrpc
    assert not is_valid_get_task_request(
      {"id": 1, "method": TASKS_GET_METHOD, "params": {"taskId": TASK_ID}}
    )

  def test_get_request_params_non_dict_rejected(self):
    assert not is_valid_get_task_request_params(None)
    assert not is_valid_get_task_request_params("taskId")
    assert not is_valid_get_task_request_params(["taskId"])
    assert not is_valid_get_task_request_params({"taskId": 123})

  def test_build_get_task_result_rejects_invalid_detailed_task(self):
    with pytest.raises(ValueError):
      build_get_task_result({"status": "working"})  # missing required base fields


# ─── AC-40.2 ────────────────────────────────────────────────────────────────────


class TestAC402UnnegotiatedGet:
  def test_builds_missing_capability_error_for_get(self):
    err = build_tasks_missing_capability_error(TASKS_GET_METHOD)
    assert err["code"] == TASK_MISSING_CAPABILITY_CODE
    assert err["code"] == MISSING_CLIENT_CAPABILITY_CODE
    assert err["code"] == -32003
    assert err["data"]["method"] == "tasks/get"


# ─── AC-40.3 … AC-40.7 — per-status variant selection ──────────────────────────


class TestAC403WorkingVariant:
  def test_working_has_no_status_specific_payload(self):
    r = build_get_task_result(working_task())
    assert r["status"] == "working"
    assert "result" not in r
    assert "error" not in r
    assert "inputRequests" not in r
    assert is_valid_get_task_result(r)


class TestAC404InputRequiredVariant:
  def test_input_required_carries_input_requests(self):
    r = build_get_task_result(input_required_task())
    assert r["status"] == "input_required"
    assert "name" in r["inputRequests"]
    assert is_valid_get_task_result(r)

  def test_rejects_input_required_missing_input_requests(self):
    bad = {**base(status="input_required"), "resultType": RESULT_TYPE_COMPLETE}
    assert not is_valid_get_task_result(bad)

  def test_build_get_task_result_raises_for_input_required_without_requests(self):
    with pytest.raises(ValueError):
      build_get_task_result(base(status="input_required"))


class TestAC405CompletedVariant:
  def test_completed_carries_verbatim_result(self):
    r = build_get_task_result(completed_task())
    assert r["status"] == "completed"
    assert r["result"] == {"content": [{"type": "text", "text": "Hello, Luca!"}], "isError": False}


class TestAC406FailedVariant:
  def test_failed_carries_json_rpc_error(self):
    r = build_get_task_result(failed_task())
    assert r["status"] == "failed"
    assert r["error"] == {"code": -32000, "message": "Execution error"}

  def test_rejects_failed_with_invalid_error(self):
    # error.code must be a safe integer; a string code is invalid.
    bad = base(status="failed", error={"code": "boom", "message": "x"})
    assert not is_valid_detailed_task(bad)


class TestAC407CancelledVariant:
  def test_cancelled_has_no_status_specific_payload(self):
    r = build_get_task_result(cancelled_task())
    assert r["status"] == "cancelled"
    assert "result" not in r
    assert "error" not in r


# ─── AC-40.8 — pollIntervalMs honoring & adoption ──────────────────────────────


class TestAC408PollIntervalAdoption:
  def test_adopts_latest_over_previous(self):
    assert adopt_latest_poll_interval_ms(3000, 5000) == 3000

  def test_retains_previous_when_latest_omitted(self):
    assert adopt_latest_poll_interval_ms(None, 5000) == 5000

  def test_falls_back_when_neither_present(self):
    assert adopt_latest_poll_interval_ms(None, None, 1000) == 1000

  def test_default_fallback_is_1000(self):
    assert adopt_latest_poll_interval_ms(None, None) == 1000

  def test_resolve_poll_interval_ms_direct(self):
    assert resolve_poll_interval_ms(2000) == 2000
    assert resolve_poll_interval_ms(None) == 1000
    assert resolve_poll_interval_ms(None, 250) == 250
    # zero is a number, honored (not treated as absent)
    assert resolve_poll_interval_ms(0) == 0
    assert adopt_latest_poll_interval_ms(0, 5000) == 0

  def test_client_waits_at_least_poll_interval(self):
    # last poll t=0, interval 5000 → poll allowed only at t>=5000.
    assert may_rate_limit_poll(0, 4999, 5000) is True
    assert may_rate_limit_poll(0, 5000, 5000) is False


# ─── AC-40.9 — server may rate-limit ───────────────────────────────────────────


class TestAC409RateLimit:
  def test_reports_rate_limit_when_polling_too_soon(self):
    assert may_rate_limit_poll(1000, 1500, 5000) is True

  def test_does_not_flag_first_poll_or_past_interval(self):
    assert may_rate_limit_poll(None, 1500, 5000) is False
    assert may_rate_limit_poll(1000, 7000, 5000) is False
    assert may_rate_limit_poll(1000, 1500, None) is False

  def test_exact_boundary_not_rate_limited(self):
    # gap == interval → not below the minimum → not rate-limitable
    assert may_rate_limit_poll(1000, 6000, 5000) is False


# ─── AC-40.10 — continue polling until terminal/cancel ─────────────────────────


class TestAC410ContinuePolling:
  def test_keeps_polling_while_non_terminal(self):
    assert should_continue_polling("working") is True
    assert should_continue_polling("input_required") is True

  def test_stops_at_terminal(self):
    assert should_continue_polling("completed") is False
    assert should_continue_polling("failed") is False
    assert should_continue_polling("cancelled") is False

  def test_stops_once_cancel_issued(self):
    assert should_continue_polling("working", True) is False


# ─── AC-40.11 — durable persistence of taskId ──────────────────────────────────


class TestAC411DurablePersistence:
  def test_task_id_survives_serialization_round_trip(self):
    store = {"pending-task": TASK_ID}
    serialized = json.dumps(store)

    restored = json.loads(serialized)
    resumed_id = restored.get("pending-task")
    assert resumed_id == TASK_ID

    req = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": TASKS_GET_METHOD,
      "params": {"taskId": resumed_id, "_meta": request_meta()},
    }
    assert is_valid_get_task_request(req)


# ─── AC-40.12 — unknown/expired taskId → -32602, stop polling ──────────────────


class TestAC412UnknownTaskStopsPolling:
  def test_builds_invalid_params_error_not_a_result(self):
    err = build_task_unknown_error(TASK_ID)
    assert err["code"] == TASK_INVALID_PARAMS_CODE
    assert err["code"] == INVALID_PARAMS_CODE
    assert err["code"] == -32602
    assert err["data"]["taskId"] == TASK_ID
    # It is an error object, not a DetailedTask result.
    assert "status" not in err
    assert not is_valid_get_task_result(err)

  def test_default_operation_in_message(self):
    assert build_task_unknown_error(TASK_ID)["message"] == "Failed to retrieve task: Task not found"

  def test_client_treats_error_response_as_terminal(self):
    assert is_polling_terminal_response(build_task_unknown_error(TASK_ID)) is True

  def test_non_terminal_detailed_task_does_not_stop_polling(self):
    assert is_polling_terminal_response(working_task()) is False
    assert is_polling_terminal_response(input_required_task()) is False

  def test_terminal_detailed_task_stops_polling(self):
    assert is_polling_terminal_response(completed_task()) is True
    assert is_polling_terminal_response(failed_task()) is True
    assert is_polling_terminal_response(cancelled_task()) is True

  def test_non_object_response_does_not_stop_polling(self):
    assert is_polling_terminal_response(None) is False
    assert is_polling_terminal_response("error") is False
    assert is_polling_terminal_response(42) is False

  def test_unrelated_error_code_does_not_stop_polling(self):
    assert is_polling_terminal_response({"code": -32000, "message": "x"}) is False

  def test_unknown_status_value_does_not_stop_polling(self):
    assert is_polling_terminal_response({"status": "queued"}) is False


# ─── AC-40.13 — tasks/update well-formedness & key binding ─────────────────────


class TestAC413UpdateWellFormednessAndKeys:
  def test_well_formed_only_with_both_fields(self):
    ok = {
      "jsonrpc": "2.0",
      "id": 6,
      "method": TASKS_UPDATE_METHOD,
      "params": {
        "taskId": TASK_ID,
        "inputResponses": {"name": {"action": "accept", "content": {"input": "Luca"}}},
        "_meta": request_meta(),
      },
    }
    assert is_valid_update_task_request(ok)

    missing_responses = {
      "jsonrpc": "2.0",
      "id": 6,
      "method": TASKS_UPDATE_METHOD,
      "params": {"taskId": TASK_ID, "_meta": request_meta()},
    }
    assert not is_valid_update_task_request(missing_responses)

    missing_task_id = {
      "jsonrpc": "2.0",
      "id": 6,
      "method": TASKS_UPDATE_METHOD,
      "params": {"inputResponses": {}, "_meta": request_meta()},
    }
    assert not is_valid_update_task_request(missing_task_id)

  def test_update_request_params_predicate(self):
    assert is_valid_update_task_request_params({"taskId": TASK_ID, "inputResponses": {}})
    assert not is_valid_update_task_request_params({"taskId": TASK_ID})
    assert not is_valid_update_task_request_params({"inputResponses": {}})
    # inputResponses must be an object, not e.g. a list
    assert not is_valid_update_task_request_params({"taskId": TASK_ID, "inputResponses": []})
    assert not is_valid_update_task_request_params(None)

  def test_every_response_key_must_match_outstanding(self):
    outstanding = {"name": {"method": "elicitation/create", "params": {}}}
    good = validate_update_input_response_keys(outstanding, {"name": {"action": "accept"}})
    assert good["valid"] is True
    assert good["unknownKeys"] == []

    bad = validate_update_input_response_keys(
      outstanding, {"name": {"action": "accept"}, "bogus": {"action": "accept"}}
    )
    assert bad["valid"] is False
    assert bad["unknownKeys"] == ["bogus"]

  def test_empty_responses_against_empty_outstanding_is_valid(self):
    assert validate_update_input_response_keys({}, {}) == {"valid": True, "unknownKeys": []}

  def test_task_input_responses_accepts_arbitrary_record(self):
    assert is_valid_task_input_responses({"name": {"action": "accept"}})
    assert is_valid_task_input_responses({})
    assert not is_valid_task_input_responses([])
    assert not is_valid_task_input_responses("x")
    assert not is_valid_task_input_responses(None)


# ─── AC-40.14 — un-negotiated tasks/update → -32003 ────────────────────────────


class TestAC414UnnegotiatedUpdate:
  def test_builds_missing_capability_for_update(self):
    err = build_tasks_missing_capability_error(TASKS_UPDATE_METHOD)
    assert err["code"] == -32003
    assert err["data"]["method"] == "tasks/update"


# ─── AC-40.15 — inputRequests keys unique over lifetime ────────────────────────


class TestAC415KeysUniqueOverLifetime:
  def test_answered_key_no_longer_outstanding_and_reuse_is_stale(self):
    first_outstanding = {"q1": {"method": "elicitation/create", "params": {}}}
    answered = filter_outstanding_input_responses(first_outstanding, {"q1": {"action": "accept"}})
    assert "q1" in answered["accepted"]

    # After q1 is answered the next snapshot uses a DISTINCT new key (q2), never q1.
    second_outstanding = {"q2": {"method": "elicitation/create", "params": {}}}
    # A late response still keyed q1 is now stale and ignored.
    stale = filter_outstanding_input_responses(second_outstanding, {"q1": {"action": "accept"}})
    assert stale["accepted"] == {}
    assert stale["ignoredKeys"] == ["q1"]


# ─── AC-40.16 — server ignores stale entries ───────────────────────────────────


class TestAC416ServerIgnoresStale:
  def test_drops_keys_never_issued_already_answered_or_superseded(self):
    outstanding = {"a": {"method": "elicitation/create", "params": {}}}
    out = filter_outstanding_input_responses(
      outstanding,
      {
        "a": {"action": "accept"},
        "neverIssued": {"action": "accept"},
        "alreadyAnswered": {"action": "decline"},
      },
    )
    assert out["accepted"] == {"a": {"action": "accept"}}
    assert sorted(out["ignoredKeys"]) == ["alreadyAnswered", "neverIssued"]

  def test_preserves_input_order_of_ignored_keys(self):
    out = filter_outstanding_input_responses({}, {"z": 1, "a": 2, "m": 3})
    assert out["ignoredKeys"] == ["z", "a", "m"]
    assert out["accepted"] == {}


# ─── AC-40.17 — partial responses accepted ─────────────────────────────────────


class TestAC417PartialResponses:
  def test_detects_strict_subset(self):
    outstanding = {
      "a": {"method": "elicitation/create", "params": {}},
      "b": {"method": "elicitation/create", "params": {}},
    }
    assert is_partial_input_response(outstanding, {"a": {"action": "accept"}}) is True

  def test_full_set_is_not_partial(self):
    outstanding = {
      "a": {"method": "elicitation/create", "params": {}},
      "b": {"method": "elicitation/create", "params": {}},
    }
    assert (
      is_partial_input_response(outstanding, {"a": {"action": "accept"}, "b": {"action": "accept"}})
      is False
    )

  def test_answering_only_stale_keys_is_not_partial(self):
    outstanding = {"a": {"method": "elicitation/create", "params": {}}}
    assert is_partial_input_response(outstanding, {"stale": {"action": "accept"}}) is False

  def test_no_outstanding_requests_is_not_partial(self):
    assert is_partial_input_response({}, {"a": {"action": "accept"}}) is False
    assert is_partial_input_response({}, {}) is False

  def test_empty_responses_against_outstanding_is_not_partial(self):
    # zero answered → not a (valid) partial answer
    outstanding = {"a": {}, "b": {}}
    assert is_partial_input_response(outstanding, {}) is False


# ─── AC-40.18 — client tracks answered keys ────────────────────────────────────


class TestAC418ClientTracksAnswered:
  def test_key_repeated_across_snapshots_answered_at_most_once(self):
    answered: set = set()
    snapshot = {"name": {"method": "elicitation/create", "params": {}}}

    def answer_once(outstanding: dict) -> dict:
      responses: dict = {}
      for key in outstanding.keys():
        if key not in answered:
          responses[key] = {"action": "accept"}
          answered.add(key)
      return responses

    first = answer_once(snapshot)
    assert list(first.keys()) == ["name"]
    second = answer_once(snapshot)  # key still present, but already answered
    assert list(second.keys()) == []


# ─── AC-40.19 — tasks/update empty "complete" ack ──────────────────────────────


class TestAC419UpdateAck:
  def test_builds_and_validates_empty_ack(self):
    ack = build_task_acknowledgement_result()
    assert ack == {"resultType": "complete"}
    assert is_task_acknowledgement_result(ack)

  def test_ack_carries_no_status_specific_payload(self):
    ack = build_task_acknowledgement_result()
    assert "status" not in ack
    assert "result" not in ack

  def test_ack_predicate_accepts_optional_meta_and_passthrough(self):
    assert is_task_acknowledgement_result({"resultType": "complete", "_meta": {"x": 1}})
    assert is_task_acknowledgement_result({"resultType": "complete", "extra": 5})

  def test_ack_predicate_rejects_wrong_shape(self):
    assert not is_task_acknowledgement_result({"resultType": "task"})
    assert not is_task_acknowledgement_result({"resultType": "complete", "_meta": []})
    assert not is_task_acknowledgement_result(None)
    assert not is_task_acknowledgement_result({})


# ─── AC-40.20 — ack is eventually consistent ───────────────────────────────────


class TestAC420EventuallyConsistent:
  def test_ack_conveys_no_observable_status(self):
    ack = build_task_acknowledgement_result()
    assert "status" not in ack
    # Immediately after the ack the observable status MAY still be input_required.
    after_ack = build_get_task_result(input_required_task())
    assert after_ack["status"] == "input_required"


# ─── AC-40.21 — tasks/update unknown taskId → -32602 ───────────────────────────


class TestAC421UpdateUnknown:
  def test_builds_invalid_params_for_update(self):
    err = build_task_unknown_error(TASK_ID, "update")
    assert err["code"] == -32602
    assert "update" in err["message"]


# ─── AC-40.22 — keep observing after tasks/update ──────────────────────────────


class TestAC422KeepObserving:
  def test_continues_polling_non_terminal_after_update(self):
    assert should_continue_polling("input_required") is True
    assert should_continue_polling("working") is True
    assert should_continue_polling("completed") is False


# ─── AC-40.23 — notifications/cancelled never used for tasks ────────────────────


class TestAC423CancelledNotificationForbidden:
  def test_cancelled_is_forbidden_task_notification(self):
    assert is_forbidden_task_notification(CANCELLED_NOTIFICATION_METHOD) is True
    assert is_forbidden_task_notification("notifications/cancelled") is True

  def test_tasks_cancel_is_a_lifecycle_method(self):
    assert is_task_lifecycle_method(TASKS_CANCEL_METHOD) is True


# ─── AC-40.24 — tasks/cancel needs taskId ──────────────────────────────────────


class TestAC424CancelNeedsTaskId:
  def test_accepts_cancel_with_task_id(self):
    req = {
      "jsonrpc": "2.0",
      "id": 9,
      "method": TASKS_CANCEL_METHOD,
      "params": {"taskId": TASK_ID, "_meta": request_meta()},
    }
    assert is_valid_cancel_task_request(req)
    assert req["params"]["taskId"] == TASK_ID

  def test_rejects_cancel_missing_task_id(self):
    req = {
      "jsonrpc": "2.0",
      "id": 9,
      "method": TASKS_CANCEL_METHOD,
      "params": {"_meta": request_meta()},
    }
    assert not is_valid_cancel_task_request(req)

  def test_cancel_request_params_predicate(self):
    assert is_valid_cancel_task_request_params({"taskId": TASK_ID})
    assert not is_valid_cancel_task_request_params({})
    assert not is_valid_cancel_task_request_params({"taskId": 5})
    assert not is_valid_cancel_task_request_params(None)

  def test_cancel_request_rejects_wrong_method(self):
    req = {"jsonrpc": "2.0", "id": 9, "method": TASKS_GET_METHOD, "params": {"taskId": TASK_ID}}
    assert not is_valid_cancel_task_request(req)


# ─── AC-40.25 — un-negotiated tasks/cancel → -32003 ────────────────────────────


class TestAC425UnnegotiatedCancel:
  def test_builds_missing_capability_for_cancel(self):
    err = build_tasks_missing_capability_error(TASKS_CANCEL_METHOD)
    assert err["code"] == -32003
    assert err["data"]["method"] == "tasks/cancel"


# ─── AC-40.26 — tasks/cancel empty "complete" ack ──────────────────────────────


class TestAC426CancelAck:
  def test_builds_and_validates_empty_ack(self):
    ack = build_task_acknowledgement_result()
    assert ack["resultType"] == "complete"
    assert is_task_acknowledgement_result(ack)


# ─── AC-40.27 — tasks/cancel unknown taskId → -32602 ───────────────────────────


class TestAC427CancelUnknown:
  def test_builds_invalid_params_for_cancel(self):
    err = build_task_unknown_error(TASK_ID, "cancel")
    assert err["code"] == -32602
    assert "cancel" in err["message"]


# ─── AC-40.28 — cooperative, eventually consistent cancel ───────────────────────


class TestAC428CooperativeCancel:
  def test_non_terminal_is_acknowledged_pending(self):
    assert classify_cancel_effect("working") == "acknowledged-pending"
    assert classify_cancel_effect("input_required") == "acknowledged-pending"

  def test_may_reach_terminal_other_than_cancelled(self):
    assert classify_cancel_effect("working") == "acknowledged-pending"
    finished = build_get_task_result(completed_task())
    assert finished["status"] == "completed"  # not "cancelled"


# ─── AC-40.29 — terminal task: cancel is a no-op ───────────────────────────────


class TestAC429TerminalCancelNoOp:
  def test_terminal_is_acknowledged_terminal(self):
    assert classify_cancel_effect("completed") == "acknowledged-terminal"
    assert classify_cancel_effect("failed") == "acknowledged-terminal"
    assert classify_cancel_effect("cancelled") == "acknowledged-terminal"


# ─── AC-40.30 — client may drop state / stop polling after cancel ──────────────


class TestAC430DropStateAfterCancel:
  def test_should_continue_polling_false_after_cancel(self):
    assert should_continue_polling("working", True) is False
    assert should_continue_polling("input_required", True) is False


# ─── AC-40.31 — notifications/tasks carries a full DetailedTask ─────────────────


class TestAC431NotificationCarriesDetailedTask:
  def test_params_equal_what_tasks_get_would_return(self):
    notif = build_task_status_notification(completed_task())
    assert notif["method"] == "notifications/tasks"
    assert notif["jsonrpc"] == "2.0"
    assert is_valid_task_status_notification(notif)
    params = notif["params"]
    assert params["taskId"] == TASK_ID
    assert params["status"] == "completed"
    assert params["result"] == completed_task()["result"]
    # identical to the DetailedTask body of a tasks/get result (sans resultType)
    get_body = dict(build_get_task_result(completed_task()))
    del get_body["resultType"]
    assert params == get_body

  def test_validates_full_envelope(self):
    notif = build_task_status_notification(input_required_task())
    assert is_valid_task_status_notification(notif)

  def test_build_rejects_invalid_detailed_task(self):
    with pytest.raises(ValueError):
      build_task_status_notification({"status": "working"})

  def test_notification_predicate_rejects_wrong_shapes(self):
    assert not is_valid_task_status_notification(
      {"jsonrpc": "2.0", "method": "notifications/tasks", "params": {"status": "working"}}
    )
    assert not is_valid_task_status_notification(
      {"jsonrpc": "2.0", "method": "wrong", "params": working_task()}
    )
    assert not is_valid_task_status_notification(
      {"jsonrpc": "1.0", "method": "notifications/tasks", "params": working_task()}
    )
    assert not is_valid_task_status_notification(None)

  def test_notification_params_allow_optional_meta(self):
    notif = build_task_status_notification(working_task())
    notif["params"] = {**notif["params"], "_meta": {"x": 1}}
    assert is_valid_task_status_notification(notif)
    # bad _meta rejected
    notif["params"]["_meta"] = []
    assert not is_valid_task_status_notification(notif)


# ─── AC-40.32 — opt-in via taskIds filter ──────────────────────────────────────


class TestAC432OptInViaTaskIds:
  def test_extracts_subscribed_task_ids(self):
    assert subscribed_task_ids({"taskIds": [TASK_ID]}) == [TASK_ID]
    assert subscribed_task_ids({}) == []
    assert subscribed_task_ids({"taskIds": []}) == []

  def test_subscribed_task_ids_robust_to_bad_input(self):
    assert subscribed_task_ids(None) == []
    assert subscribed_task_ids("x") == []
    # non-string elements → not a valid taskIds filter
    assert subscribed_task_ids({"taskIds": [TASK_ID, 5]}) == []

  def test_task_ids_filter_coexists_with_other_filter_fields(self):
    # The taskIds filter is supplied alongside §10 SubscriptionFilter fields.
    filter_ = {"toolsListChanged": True, "taskIds": [TASK_ID]}
    assert subscribed_task_ids(filter_) == [TASK_ID]
    assert filter_["toolsListChanged"] is True

  def test_client_receives_only_subscribed(self):
    subscribed = subscribed_task_ids({"taskIds": [TASK_ID]})
    assert may_push_task_notification(TASK_ID, subscribed) is True


# ─── AC-40.33 — no push for unsubscribed task ──────────────────────────────────


class TestAC433NoPushUnsubscribed:
  def test_may_push_false_for_unsubscribed(self):
    assert may_push_task_notification("other-task", [TASK_ID]) is False
    assert may_push_task_notification(TASK_ID, []) is False


# ─── AC-40.34 — taskIds without capability → -32003 ────────────────────────────


class TestAC434TaskIdsRequireCapability:
  def test_requires_capability_when_task_ids_supplied(self):
    assert task_subscription_requires_capability({"taskIds": [TASK_ID]}, False) is True
    err = build_tasks_missing_capability_error("subscriptions/listen")
    assert err["code"] == -32003

  def test_no_requirement_when_absent_or_already_negotiated(self):
    assert task_subscription_requires_capability({"taskIds": [TASK_ID]}, True) is False
    assert task_subscription_requires_capability({}, False) is False
    assert task_subscription_requires_capability({"taskIds": []}, False) is False


# ─── AC-40.35 — notifications, polling, or both ────────────────────────────────


class TestAC435NotificationsPollingOrBoth:
  def test_subscribed_client_need_not_poll(self):
    subscribed = subscribed_task_ids({"taskIds": [TASK_ID]})
    assert may_push_task_notification(TASK_ID, subscribed) is True
    notif = build_task_status_notification(completed_task())
    assert notif["params"]["status"] == "completed"

  def test_non_subscribed_client_still_polls(self):
    assert should_continue_polling("working") is True


# ─── AC-40.36 — no progress/message notifications for a task ────────────────────


class TestAC436NoProgressMessageForTask:
  def test_progress_and_message_forbidden(self):
    assert is_forbidden_task_notification(PROGRESS_NOTIFICATION_METHOD) is True
    assert is_forbidden_task_notification(LOGGING_MESSAGE_METHOD) is True

  def test_only_task_state_channels(self):
    assert is_forbidden_task_notification(TASKS_NOTIFICATION_METHOD) is False
    assert TASK_FORBIDDEN_NOTIFICATION_METHODS == (
      "notifications/progress",
      "notifications/message",
      "notifications/cancelled",
    )

  def test_tasks_get_is_not_forbidden(self):
    assert is_forbidden_task_notification(TASKS_GET_METHOD) is False


# ─── AC-40.37 — pre-task input resolved synchronously ──────────────────────────


class TestAC437PreTaskInputSynchronous:
  def test_inline_input_distinct_from_tasks_update(self):
    assert is_task_lifecycle_method(TASKS_UPDATE_METHOD) is True
    assert is_task_lifecycle_method("tools/call") is False


# ─── AC-40.38 — inputRequests carry the same trust model ────────────────────────


class TestAC438InputRequestsStandalone:
  def test_input_request_entry_is_a_verbatim_request(self):
    r = build_get_task_result(input_required_task())
    reqs = r["inputRequests"]
    assert reqs["name"]["method"] == "elicitation/create"


# ─── AC-40.39 — task input vs inline; never mixed ──────────────────────────────


class TestAC439TaskInputViaUpdate:
  def test_task_surfaced_input_resolved_only_via_update(self):
    r = build_get_task_result(input_required_task())
    assert r["status"] == "input_required"
    update = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": TASKS_UPDATE_METHOD,
      "params": {
        "taskId": TASK_ID,
        "inputResponses": {"name": {"action": "accept"}},
        "_meta": request_meta(),
      },
    }
    assert is_valid_update_task_request(update)


# ─── AC-40.40 — ttlMs mutable; may fail+remove ─────────────────────────────────


class TestAC440TtlMutable:
  def test_ttl_may_change_across_observations(self):
    first = build_get_task_result(base(status="working", ttlMs=60_000))
    later = build_get_task_result(base(status="working", ttlMs=3_600_000))
    assert first["ttlMs"] == 60_000
    assert later["ttlMs"] == 3_600_000

  def test_after_elapse_may_fail_then_remove(self):
    failed = build_failed_task_update(
      base(ttlMs=1000), {"code": -32000, "message": "ttl elapsed"}, "expired"
    )
    assert failed["status"] == "failed"
    # Subsequently removed → a tasks/get is now unknown.
    assert build_task_unknown_error(TASK_ID)["code"] == -32602

  def test_null_ttl_is_valid(self):
    assert is_valid_detailed_task(base(status="working", ttlMs=None))


# ─── AC-40.41 — non-null ttlMs backstop ────────────────────────────────────────


class TestAC441Backstop:
  def test_created_at_plus_ttl_is_a_backstop(self):
    assert is_task_backstop_elapsed(0, 1000, 1000, "working") is True
    assert is_task_backstop_elapsed(0, 1000, 999, "working") is False

  def test_null_ttl_is_never_a_backstop(self):
    assert is_task_backstop_elapsed(0, None, 10_000_000, "working") is False

  def test_terminal_task_is_not_a_backstop_candidate(self):
    assert is_task_backstop_elapsed(0, 1000, 5000, "completed") is False
    assert is_task_backstop_elapsed(0, 1000, 5000, "failed") is False
    assert is_task_backstop_elapsed(0, 1000, 5000, "cancelled") is False

  def test_input_required_can_be_backstopped(self):
    assert is_task_backstop_elapsed(0, 1000, 2000, "input_required") is True


# ─── AC-40.42 — protocol error → failed + error + statusMessage ─────────────────


class TestAC442ProtocolErrorFailed:
  def test_classifies_protocol_error_as_failed(self):
    assert (
      classify_task_execution_outcome(
        {"kind": "protocol-error", "error": {"code": -32000, "message": "x"}}
      )
      == "failed"
    )

  def test_builds_failed_with_error_and_status_message(self):
    failed = build_failed_task_update(
      base(), {"code": -32000, "message": "Execution error"}, "database connection lost"
    )
    assert failed["status"] == "failed"
    assert failed["error"] == {"code": -32000, "message": "Execution error"}
    assert failed["statusMessage"] == "database connection lost"
    # round-trips through a tasks/get result
    assert is_valid_get_task_result(build_get_task_result(failed))

  def test_failed_without_status_message_omits_it(self):
    failed = build_failed_task_update(base(), {"code": -32000, "message": "x"})
    assert "statusMessage" not in failed
    assert failed["status"] == "failed"

  def test_failed_rejects_invalid_error(self):
    with pytest.raises(ValueError):
      build_failed_task_update(base(), {"message": "no code"})
    with pytest.raises(ValueError):
      build_failed_task_update(base(), {"code": "x", "message": "bad code"})
    with pytest.raises(ValueError):
      build_failed_task_update(base(), None)


# ─── AC-40.43 — app error → completed with error in result ──────────────────────


class TestAC443AppErrorCompleted:
  def test_classifies_protocol_complete_as_completed_even_with_app_error(self):
    assert (
      classify_task_execution_outcome({"kind": "result", "result": {"isError": True, "content": []}})
      == "completed"
    )

  def test_builds_completed_with_app_error_in_result(self):
    completed = build_completed_task_update(
      base(), {"content": [{"type": "text", "text": "tool failed"}], "isError": True}
    )
    assert completed["status"] == "completed"
    assert is_terminal_task_status("completed") is True
    # The application error is inside result, not a failed task.
    assert completed["result"]["isError"] is True
    assert "error" not in completed

  def test_classify_unknown_kind_defaults_to_completed(self):
    # any non-"protocol-error" kind maps to completed
    assert classify_task_execution_outcome({"kind": "result", "result": {}}) == "completed"
    assert classify_task_execution_outcome({}) == "completed"


# ─── DetailedTask shape predicate — additional Python edge cases ───────────────


class TestIsValidDetailedTask:
  def test_each_variant_is_valid(self):
    assert is_valid_detailed_task(working_task())
    assert is_valid_detailed_task(input_required_task())
    assert is_valid_detailed_task(completed_task())
    assert is_valid_detailed_task(failed_task())
    assert is_valid_detailed_task(cancelled_task())

  def test_non_object_rejected(self):
    assert not is_valid_detailed_task(None)
    assert not is_valid_detailed_task("working")
    assert not is_valid_detailed_task([working_task()])

  def test_missing_required_base_fields_rejected(self):
    assert not is_valid_detailed_task({"status": "working"})
    assert not is_valid_detailed_task({**working_task(), "taskId": 5})
    assert not is_valid_detailed_task({**working_task(), "createdAt": 1})
    assert not is_valid_detailed_task({**working_task(), "lastUpdatedAt": None})

  def test_unknown_status_rejected(self):
    assert not is_valid_detailed_task(base(status="queued"))
    assert not is_valid_detailed_task(base())  # no status at all

  def test_ttl_ms_validation(self):
    assert is_valid_detailed_task(base(status="working", ttlMs=0))
    assert is_valid_detailed_task(base(status="working", ttlMs=None))
    assert not is_valid_detailed_task(base(status="working", ttlMs=-1))
    assert not is_valid_detailed_task(base(status="working", ttlMs="1000"))
    # bool is not a valid number
    assert not is_valid_detailed_task(base(status="working", ttlMs=True))

  def test_optional_field_type_checks(self):
    assert not is_valid_detailed_task(base(status="working", statusMessage=5))
    assert not is_valid_detailed_task(base(status="working", pollIntervalMs=-1))
    assert not is_valid_detailed_task(base(status="working", pollIntervalMs=True))
    assert is_valid_detailed_task(base(status="working", pollIntervalMs=0))

  def test_input_required_requires_object_input_requests(self):
    assert not is_valid_detailed_task(base(status="input_required"))
    assert not is_valid_detailed_task(base(status="input_required", inputRequests=[]))
    assert is_valid_detailed_task(base(status="input_required", inputRequests={}))

  def test_completed_requires_object_result(self):
    assert not is_valid_detailed_task(base(status="completed"))
    assert not is_valid_detailed_task(base(status="completed", result="done"))
    assert is_valid_detailed_task(base(status="completed", result={}))

  def test_failed_requires_valid_error(self):
    assert not is_valid_detailed_task(base(status="failed"))
    assert not is_valid_detailed_task(base(status="failed", error={"message": "x"}))
    assert is_valid_detailed_task(base(status="failed", error={"code": -1, "message": "x"}))

  def test_passthrough_extra_members_tolerated(self):
    assert is_valid_detailed_task({**working_task(), "extraField": "ok"})


# ─── Builders do not mutate their inputs ───────────────────────────────────────


class TestBuildersDoNotMutateInput:
  def test_build_get_task_result_does_not_mutate(self):
    task = working_task()
    snapshot = copy.deepcopy(task)
    build_get_task_result(task)
    assert task == snapshot

  def test_build_task_status_notification_does_not_mutate(self):
    task = completed_task()
    snapshot = copy.deepcopy(task)
    build_task_status_notification(task)
    assert task == snapshot

  def test_build_failed_task_update_does_not_mutate_base(self):
    b = base()
    snapshot = copy.deepcopy(b)
    build_failed_task_update(b, {"code": -1, "message": "x"}, "msg")
    assert b == snapshot

  def test_build_completed_task_update_does_not_mutate_base(self):
    b = base()
    snapshot = copy.deepcopy(b)
    build_completed_task_update(b, {"isError": False, "content": []})
    assert b == snapshot
