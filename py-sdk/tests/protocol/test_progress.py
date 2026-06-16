"""Tests for Progress & Cancellation utilities (§15.1–§15.2).

Mirrors the TypeScript ``progress.test.ts`` AC coverage and adds builder-path tests:

* AC-22.1  (R-15-a)        — optional mechanism; correct without it
* AC-22.2  (R-15.1.1-a)    — progress token must be string or number
* AC-22.3  (R-15.1.1-b,c)  — uniqueness across active requests
* AC-22.4  (R-15.1.1-d,e)  — receiver treats token as opaque
* AC-22.5  (R-15.1.2-a)    — no progressToken → no progress notifications
* AC-22.6  (R-15.1.3-a,d)  — progressToken and progress are REQUIRED
* AC-22.7  (R-15.1.3-b,c)  — token must match an active opted-in request
* AC-22.8  (R-15.1.3-e)    — progress must strictly increase
* AC-22.9  (R-15.1.3-f,h)  — progress and total accept int or float
* AC-22.10 (R-15.1.3-g,i)  — total is optional
* AC-22.11 (R-15.1.3-j,k)  — message is optional human-readable string
* AC-22.15 (R-15.1.4-e)    — maintains active token set
* AC-22.16 (R-15.1.4-f)    — rate limiting (implementation guidance)
* AC-22.17 (R-15.1.4-g)    — no progress after terminal state
* AC-22.18 (R-15.2.1-a,b)  — requestId must be own in-flight request
* AC-22.19 (R-15.2.1-c,d)  — reason is optional human-readable string
* AC-22.21 (R-15.2.2-b)    — client must not cancel server/discover
* AC-22.23 (R-15.2.2-d)    — receiver should stop processing on cancellation
* AC-22.24 (R-15.2.2-e,f)  — receiver may ignore unknown/malformed cancellations
* AC-22.25/26 (R-15.2.3-*) — late response after cancellation tolerated
"""

import pytest

from mcp.protocol.progress import (
  CANCELLED_NOTIFICATION_METHOD,
  PROGRESS_NOTIFICATION_METHOD,
  SERVER_DISCOVER_METHOD,
  CancellationHandler,
  CancellationValidationResult,
  CancelledRequestSet,
  ProgressRateLimiter,
  ProgressTracker,
  build_cancelled_notification,
  build_cancelled_notification_params,
  build_progress_notification,
  build_progress_notification_params,
  is_discover_method,
  is_valid_cancelled_notification,
  is_valid_cancelled_notification_params,
  is_valid_progress_notification,
  is_valid_progress_notification_params,
  is_valid_progress_token,
  validate_cancellation_target,
)


# ─── AC-22.1 — optional mechanism (R-15-a) ───────────────────────────────────

class TestOptionalMechanism:
  def test_progress_params_with_token_and_progress_is_valid(self):
    assert is_valid_progress_notification_params({"progressToken": "abc123", "progress": 50})

  def test_cancelled_params_with_request_id_is_valid(self):
    assert is_valid_cancelled_notification_params({"requestId": 1})


# ─── AC-22.2 — token must be string or number (R-15.1.1-a) ──────────────────

class TestProgressTokenValidation:
  def test_accepts_string_token(self):
    assert is_valid_progress_token("abc123")

  def test_accepts_int_token(self):
    assert is_valid_progress_token(42)

  def test_accepts_float_token(self):
    assert is_valid_progress_token(3.14)

  def test_accepts_zero(self):
    assert is_valid_progress_token(0)

  def test_accepts_empty_string(self):
    assert is_valid_progress_token("")

  def test_rejects_object_token(self):
    assert not is_valid_progress_token({"id": 1})

  def test_rejects_array_token(self):
    assert not is_valid_progress_token([1])

  def test_rejects_boolean_token(self):
    assert not is_valid_progress_token(True)
    assert not is_valid_progress_token(False)

  def test_rejects_none(self):
    assert not is_valid_progress_token(None)


# ─── AC-22.3 — uniqueness across active requests (R-15.1.1-b,c) ──────────────

class TestProgressTrackerUniqueness:
  def test_two_distinct_tokens_register_simultaneously(self):
    tracker = ProgressTracker()
    tracker.register("tok-A")
    tracker.register("tok-B")
    assert tracker.has("tok-A")
    assert tracker.has("tok-B")
    assert tracker.size == 2

  def test_duplicate_string_token_raises(self):
    tracker = ProgressTracker()
    tracker.register("dup")
    with pytest.raises(ValueError):
      tracker.register("dup")

  def test_duplicate_number_token_raises(self):
    tracker = ProgressTracker()
    tracker.register(99)
    with pytest.raises(ValueError):
      tracker.register(99)

  def test_string_1_distinct_from_number_1(self):
    tracker = ProgressTracker()
    tracker.register("1")
    tracker.register(1)  # must not raise — different JSON types
    assert tracker.size == 2

  def test_reuse_after_complete_allowed(self):
    tracker = ProgressTracker()
    tracker.register("reuse")
    tracker.complete("reuse")
    tracker.register("reuse")  # must not raise
    assert tracker.has("reuse")


# ─── AC-22.4 — receiver treats token as opaque (R-15.1.1-d,e) ───────────────

class TestTokenOpaqueness:
  def test_has_identifies_token_by_value_only(self):
    tracker = ProgressTracker()
    tracker.register("some-opaque-base64-value")
    assert tracker.has("some-opaque-base64-value")
    assert not tracker.has("different-value")

  def test_uuid_token_accepted_like_any_string(self):
    tracker = ProgressTracker()
    uuid = "550e8400-e29b-41d4-a716-446655440000"
    tracker.register(uuid)
    assert tracker.has(uuid)


# ─── AC-22.5 — absent progressToken → no progress (R-15.1.2-a) ──────────────

class TestOptInAbsence:
  def test_has_false_for_unregistered_token(self):
    assert not ProgressTracker().has("unregistered")

  def test_is_monotonic_false_for_unregistered_token(self):
    assert not ProgressTracker().is_monotonic("unregistered", 10)


# ─── AC-22.6 — progressToken and progress are REQUIRED (R-15.1.3-a,d) ─────────

class TestProgressParamsRequiredFields:
  def test_accepts_token_and_progress(self):
    assert is_valid_progress_notification_params({"progressToken": "tok", "progress": 50})

  def test_rejects_when_token_absent(self):
    assert not is_valid_progress_notification_params({"progress": 50})

  def test_rejects_when_progress_absent(self):
    assert not is_valid_progress_notification_params({"progressToken": "tok"})

  def test_rejects_invalid_token_type(self):
    assert not is_valid_progress_notification_params({"progressToken": {"x": 1}, "progress": 1})

  def test_rejects_boolean_progress(self):
    assert not is_valid_progress_notification_params({"progressToken": "tok", "progress": True})

  def test_rejects_non_dict(self):
    assert not is_valid_progress_notification_params("not-a-dict")
    assert not is_valid_progress_notification_params(None)

  def test_rejects_bad_meta(self):
    assert not is_valid_progress_notification_params(
      {"progressToken": "tok", "progress": 1, "_meta": "nope"}
    )

  def test_passthrough_unknown_keys(self):
    assert is_valid_progress_notification_params(
      {"progressToken": "tok", "progress": 1, "extra": "kept"}
    )


# ─── AC-22.7 / AC-22.8 — monotonic increase (R-15.1.3-b,c,e) ─────────────────

class TestMonotonicIncrease:
  def test_is_monotonic_false_for_unknown_token(self):
    assert not ProgressTracker().is_monotonic("unknown-token", 10)

  def test_first_progress_on_active_token_is_monotonic(self):
    tracker = ProgressTracker()
    tracker.register("active-tok")
    assert tracker.is_monotonic("active-tok", 0.1)

  def test_first_value_accepted_anything_above_neg_inf(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    assert tracker.is_monotonic("tok", 0)

  def test_first_value_can_be_negative(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    assert tracker.is_monotonic("tok", -1000)

  def test_higher_subsequent_value_is_monotonic(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    tracker.record_progress("tok", 10)
    assert tracker.is_monotonic("tok", 11)

  def test_equal_value_is_not_monotonic(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    tracker.record_progress("tok", 50)
    assert not tracker.is_monotonic("tok", 50)

  def test_lower_value_is_not_monotonic(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    tracker.record_progress("tok", 50)
    assert not tracker.is_monotonic("tok", 49)

  def test_record_progress_updates_last_value(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    tracker.record_progress("tok", 25)
    tracker.record_progress("tok", 75)
    assert tracker.is_monotonic("tok", 76)
    assert not tracker.is_monotonic("tok", 75)

  def test_record_progress_on_unknown_token_raises(self):
    with pytest.raises(ValueError):
      ProgressTracker().record_progress("ghost", 1)


# ─── AC-22.9 — int or float accepted for progress/total (R-15.1.3-f,h) ──────

class TestNumericFields:
  def test_accepts_integer_progress(self):
    assert is_valid_progress_notification_params({"progressToken": "tok", "progress": 50, "total": 100})

  def test_accepts_float_progress(self):
    assert is_valid_progress_notification_params({"progressToken": "tok", "progress": 87.5})

  def test_accepts_float_total(self):
    assert is_valid_progress_notification_params({"progressToken": "tok", "progress": 0.5, "total": 1.0})

  def test_rejects_string_progress(self):
    assert not is_valid_progress_notification_params({"progressToken": "tok", "progress": "50"})

  def test_rejects_string_total(self):
    assert not is_valid_progress_notification_params({"progressToken": "tok", "progress": 1, "total": "100"})

  def test_rejects_boolean_total(self):
    assert not is_valid_progress_notification_params({"progressToken": "tok", "progress": 1, "total": True})


# ─── AC-22.10 — total is optional (R-15.1.3-g,i) ────────────────────────────

class TestTotalOptional:
  def test_valid_without_total(self):
    params = {"progressToken": "tok", "progress": 10}
    assert is_valid_progress_notification_params(params)
    assert "total" not in params

  def test_valid_with_total(self):
    params = {"progressToken": "tok", "progress": 10, "total": 100}
    assert is_valid_progress_notification_params(params)
    assert params["total"] == 100


# ─── AC-22.11 — message is optional (R-15.1.3-j,k) ──────────────────────────

class TestMessageOptional:
  def test_valid_without_message(self):
    assert is_valid_progress_notification_params({"progressToken": "tok", "progress": 10})

  def test_valid_with_message_string(self):
    assert is_valid_progress_notification_params(
      {"progressToken": "tok", "progress": 10, "message": "Reticulating splines..."}
    )

  def test_rejects_non_string_message(self):
    assert not is_valid_progress_notification_params(
      {"progressToken": "tok", "progress": 10, "message": 42}
    )


# ─── Builders: progress params + envelope ────────────────────────────────────

class TestBuildProgressNotification:
  def test_build_params_minimal(self):
    params = build_progress_notification_params("tok", 10)
    assert params == {"progressToken": "tok", "progress": 10}

  def test_build_params_full(self):
    params = build_progress_notification_params("tok", 10, total=100, message="hi", meta={"k": "v"})
    assert params == {
      "progressToken": "tok",
      "progress": 10,
      "total": 100,
      "message": "hi",
      "_meta": {"k": "v"},
    }
    assert is_valid_progress_notification_params(params)

  def test_build_params_rejects_bad_token(self):
    with pytest.raises(ValueError):
      build_progress_notification_params({"bad": 1}, 10)

  def test_build_params_rejects_bad_progress(self):
    with pytest.raises(ValueError):
      build_progress_notification_params("tok", "10")

  def test_build_params_rejects_bad_total(self):
    with pytest.raises(ValueError):
      build_progress_notification_params("tok", 10, total="100")

  def test_build_full_envelope_round_trips(self):
    notif = build_progress_notification("tok", 10, total=100, message="Working...")
    assert notif["jsonrpc"] == "2.0"
    assert notif["method"] == PROGRESS_NOTIFICATION_METHOD
    assert is_valid_progress_notification(notif)


# ─── Full progress envelope validation ───────────────────────────────────────

class TestProgressNotificationEnvelope:
  def test_method_constant(self):
    assert PROGRESS_NOTIFICATION_METHOD == "notifications/progress"

  def test_accepts_valid_full_notification(self):
    assert is_valid_progress_notification(
      {
        "jsonrpc": "2.0",
        "method": "notifications/progress",
        "params": {"progressToken": "tok", "progress": 10, "total": 100, "message": "Working..."},
      }
    )

  def test_rejects_wrong_method(self):
    assert not is_valid_progress_notification(
      {"jsonrpc": "2.0", "method": "notifications/other", "params": {"progressToken": "tok", "progress": 10}}
    )

  def test_rejects_wrong_jsonrpc(self):
    assert not is_valid_progress_notification(
      {"jsonrpc": "1.0", "method": "notifications/progress", "params": {"progressToken": "tok", "progress": 1}}
    )

  def test_rejects_bad_params(self):
    assert not is_valid_progress_notification(
      {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progress": 1}}
    )

  def test_rejects_non_dict(self):
    assert not is_valid_progress_notification(None)


# ─── AC-22.15 — maintains active token set (R-15.1.4-e) ─────────────────────

class TestActiveTokenSet:
  def test_size_tracks_register_and_complete(self):
    tracker = ProgressTracker()
    assert tracker.size == 0
    tracker.register("a")
    tracker.register("b")
    assert tracker.size == 2
    tracker.complete("a")
    assert tracker.size == 1
    tracker.complete("b")
    assert tracker.size == 0

  def test_active_tokens_returns_all_registered(self):
    tracker = ProgressTracker()
    tracker.register("x")
    tracker.register(42)
    tokens = tracker.active_tokens
    assert "x" in tokens
    assert 42 in tokens


# ─── AC-22.17 — no progress after terminal state (R-15.1.4-g) ────────────────

class TestTerminalState:
  def test_has_false_after_complete(self):
    tracker = ProgressTracker()
    tracker.register("finished")
    tracker.complete("finished")
    assert not tracker.has("finished")

  def test_is_monotonic_false_for_completed_token(self):
    tracker = ProgressTracker()
    tracker.register("done")
    tracker.complete("done")
    assert not tracker.is_monotonic("done", 999)


# ─── CancelledNotification params + envelope ─────────────────────────────────

class TestCancelledNotification:
  def test_method_constant(self):
    assert CANCELLED_NOTIFICATION_METHOD == "notifications/cancelled"

  def test_accepts_request_id_and_reason(self):
    assert is_valid_cancelled_notification(
      {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1, "reason": "User cancelled"}}
    )

  def test_accepts_without_request_id_malformed_tolerance(self):
    assert is_valid_cancelled_notification_params({"reason": "gone"})

  def test_accepts_without_reason(self):
    assert is_valid_cancelled_notification_params({"requestId": "42"})

  def test_accepts_empty_params(self):
    assert is_valid_cancelled_notification_params({})

  def test_rejects_bad_request_id_type(self):
    assert not is_valid_cancelled_notification_params({"requestId": {"x": 1}})

  def test_rejects_boolean_request_id(self):
    assert not is_valid_cancelled_notification_params({"requestId": True})

  def test_rejects_non_string_reason(self):
    assert not is_valid_cancelled_notification_params({"requestId": 1, "reason": 5})

  def test_rejects_bad_meta(self):
    assert not is_valid_cancelled_notification_params({"requestId": 1, "_meta": "x"})

  def test_envelope_rejects_wrong_method(self):
    assert not is_valid_cancelled_notification(
      {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"requestId": 1}}
    )

  def test_passthrough_unknown_keys(self):
    assert is_valid_cancelled_notification_params({"requestId": 1, "extra": True})


class TestBuildCancelledNotification:
  def test_build_params_empty(self):
    assert build_cancelled_notification_params() == {}

  def test_build_params_full(self):
    params = build_cancelled_notification_params(7, reason="stop", meta={"k": 1})
    assert params == {"requestId": 7, "reason": "stop", "_meta": {"k": 1}}

  def test_build_params_rejects_bad_request_id(self):
    with pytest.raises(ValueError):
      build_cancelled_notification_params({"bad": 1})

  def test_build_params_rejects_bad_reason(self):
    with pytest.raises(ValueError):
      build_cancelled_notification_params(1, reason=5)

  def test_build_envelope_round_trips(self):
    notif = build_cancelled_notification("req-1", reason="cancel")
    assert notif["method"] == CANCELLED_NOTIFICATION_METHOD
    assert is_valid_cancelled_notification(notif)


# ─── AC-22.18 — validateCancellationTarget (R-15.2.1-a,b) ───────────────────

class TestValidateCancellationTarget:
  def test_ok_when_in_flight(self):
    result = validate_cancellation_target(1, {1, "2"})
    assert isinstance(result, CancellationValidationResult)
    assert result.ok

  def test_not_ok_when_not_in_flight(self):
    result = validate_cancellation_target(99, {1})
    assert not result.ok
    assert result.reason is not None

  def test_not_ok_when_request_id_none(self):
    result = validate_cancellation_target(None, {1})
    assert not result.ok
    assert "required" in result.reason

  def test_not_ok_for_discover_id(self):
    result = validate_cancellation_target(0, {0}, 0)
    assert not result.ok
    assert "server/discover" in result.reason

  def test_late_cancel_after_response_is_ignored(self):
    # in-flight already cleared after a response arrived; late cancel simply not ok
    result = validate_cancellation_target(5, set())
    assert not result.ok

  def test_string_id_in_flight(self):
    assert validate_cancellation_target("abc", {"abc"}).ok


# ─── AC-22.21 — isDiscoverMethod (R-15.2.2-b) ────────────────────────────────

class TestIsDiscoverMethod:
  def test_true_for_server_discover(self):
    assert is_discover_method("server/discover")
    assert SERVER_DISCOVER_METHOD == "server/discover"

  def test_false_for_other_methods(self):
    assert not is_discover_method("tools/call")
    assert not is_discover_method("notifications/cancelled")


# ─── AC-22.25/26 — race condition tolerance (R-15.2.3-a–e) ──────────────────

class TestRaceConditionTolerance:
  def test_complete_already_completed_does_not_raise(self):
    tracker = ProgressTracker()
    tracker.register("race")
    tracker.complete("race")
    tracker.complete("race")  # must not raise

  def test_complete_never_registered_does_not_raise(self):
    ProgressTracker().complete("unknown")  # must not raise


# ─── AC-22.16 — ProgressRateLimiter (RC-3 / SHOULD) ─────────────────────────

class TestProgressRateLimiter:
  def test_permits_first_emission(self):
    assert ProgressRateLimiter(100).should_emit("tok", 1000)

  def test_suppresses_second_within_interval(self):
    limiter = ProgressRateLimiter(100)
    limiter.should_emit("tok", 1000)
    assert not limiter.should_emit("tok", 1050)

  def test_permits_second_at_boundary(self):
    limiter = ProgressRateLimiter(100)
    limiter.should_emit("tok", 1000)
    assert limiter.should_emit("tok", 1100)

  def test_permits_second_well_after(self):
    limiter = ProgressRateLimiter(100)
    limiter.should_emit("tok", 1000)
    assert limiter.should_emit("tok", 1500)

  def test_tokens_tracked_independently(self):
    limiter = ProgressRateLimiter(100)
    limiter.should_emit("tok-A", 1000)
    assert limiter.should_emit("tok-B", 1050)

  def test_string_and_number_tokens_independent(self):
    limiter = ProgressRateLimiter(100)
    limiter.should_emit("1", 1000)
    assert limiter.should_emit(1, 1050)

  def test_complete_clears_state(self):
    limiter = ProgressRateLimiter(100)
    limiter.should_emit("tok", 1000)
    limiter.complete("tok")
    assert limiter.should_emit("tok", 1050)

  def test_complete_unknown_does_not_raise(self):
    ProgressRateLimiter(100).complete("never-seen")

  def test_default_interval_is_100ms(self):
    limiter = ProgressRateLimiter()
    limiter.should_emit("tok", 1000)
    assert not limiter.should_emit("tok", 1099)
    assert limiter.should_emit("tok", 1100)

  def test_custom_interval_respected(self):
    limiter = ProgressRateLimiter(200)
    limiter.should_emit("tok", 1000)
    assert not limiter.should_emit("tok", 1199)
    assert limiter.should_emit("tok", 1200)


# ─── AC-22.23 — CancellationHandler (RC-4 · R-15.2.2-d) ─────────────────────

class TestCancellationHandler:
  def test_trigger_calls_callback_and_returns_true(self):
    called = []
    handler = CancellationHandler()
    handler.register(1, lambda: called.append(True))
    assert handler.trigger(1) is True
    assert called == [True]

  def test_trigger_removes_handler_second_returns_false(self):
    count = []
    handler = CancellationHandler()
    handler.register(1, lambda: count.append(1))
    handler.trigger(1)
    assert handler.trigger(1) is False
    assert len(count) == 1

  def test_trigger_false_when_no_handler(self):
    assert CancellationHandler().trigger(99) is False

  def test_has_true_after_register_false_after_trigger(self):
    handler = CancellationHandler()
    handler.register("req-A", lambda: None)
    assert handler.has("req-A")
    handler.trigger("req-A")
    assert not handler.has("req-A")

  def test_deregister_removes_without_calling(self):
    called = []
    handler = CancellationHandler()
    handler.register("req-B", lambda: called.append(True))
    handler.deregister("req-B")
    assert not handler.has("req-B")
    assert called == []

  def test_deregister_unknown_does_not_raise(self):
    CancellationHandler().deregister("unknown")

  def test_size_reflects_registered_handlers(self):
    handler = CancellationHandler()
    assert handler.size == 0
    handler.register(1, lambda: None)
    handler.register(2, lambda: None)
    assert handler.size == 2
    handler.trigger(1)
    assert handler.size == 1
    handler.deregister(2)
    assert handler.size == 0

  def test_string_and_number_ids_independent(self):
    string_called = []
    number_called = []
    handler = CancellationHandler()
    handler.register("1", lambda: string_called.append(True))
    handler.register(1, lambda: number_called.append(True))
    handler.trigger("1")
    assert string_called == [True]
    assert number_called == []

  def test_re_register_replaces_handler(self):
    first = []
    second = []
    handler = CancellationHandler()
    handler.register(1, lambda: first.append(True))
    handler.register(1, lambda: second.append(True))
    handler.trigger(1)
    assert first == []
    assert second == [True]


# ─── AC-22.26 — CancelledRequestSet (RC-6 · R-15.2.3-e) ─────────────────────

class TestCancelledRequestSet:
  def test_is_ignorable_true_after_add(self):
    s = CancelledRequestSet()
    s.add(42)
    assert s.is_ignorable(42)

  def test_is_ignorable_false_for_never_cancelled(self):
    assert not CancelledRequestSet().is_ignorable(99)

  def test_acknowledge_removes_id(self):
    s = CancelledRequestSet()
    s.add("req-1")
    s.acknowledge("req-1")
    assert not s.is_ignorable("req-1")

  def test_acknowledge_unknown_does_not_raise(self):
    CancelledRequestSet().acknowledge("never-added")

  def test_size_reflects_outstanding_ids(self):
    s = CancelledRequestSet()
    assert s.size == 0
    s.add(1)
    s.add(2)
    assert s.size == 2
    s.acknowledge(1)
    assert s.size == 1

  def test_string_and_number_ids_independent(self):
    s = CancelledRequestSet()
    s.add("5")
    assert s.is_ignorable("5")
    assert not s.is_ignorable(5)

  def test_full_cancel_then_ignore_lifecycle(self):
    s = CancelledRequestSet()
    s.add(7)
    assert s.is_ignorable(7)
    s.acknowledge(7)
    assert s.size == 0
    assert not s.is_ignorable(7)

  def test_add_is_idempotent(self):
    s = CancelledRequestSet()
    s.add(7)
    s.add(7)
    assert s.size == 1


# ─── Additional edge cases beyond the TS suite ───────────────────────────────

class TestProgressTokenEdgeCases:
  def test_accepts_negative_token(self):
    assert is_valid_progress_token(-7)

  def test_rejects_progress_token_in_params_when_boolean(self):
    assert not is_valid_progress_notification_params({"progressToken": True, "progress": 1})

  def test_rejects_none_progress_in_params(self):
    assert not is_valid_progress_notification_params({"progressToken": "tok", "progress": None})

  def test_accepts_dict_meta_in_params(self):
    assert is_valid_progress_notification_params(
      {"progressToken": "tok", "progress": 1, "_meta": {"k": "v"}}
    )

  def test_rejects_list_params(self):
    assert not is_valid_progress_notification_params([])


class TestProgressTrackerActiveTokenTypes:
  def test_active_tokens_preserve_original_types(self):
    tracker = ProgressTracker()
    tracker.register("1")
    tracker.register(1)
    tokens = tracker.active_tokens
    assert "1" in tokens
    assert 1 in tokens
    assert sum(1 for t in tokens if isinstance(t, str)) == 1
    assert sum(1 for t in tokens if isinstance(t, int) and not isinstance(t, bool)) == 1

  def test_active_tokens_empty_initially(self):
    assert ProgressTracker().active_tokens == []

  def test_record_progress_raises_after_complete(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    tracker.complete("tok")
    with pytest.raises(ValueError):
      tracker.record_progress("tok", 1)

  def test_float_monotonic_progression(self):
    tracker = ProgressTracker()
    tracker.register("tok")
    tracker.record_progress("tok", 0.1)
    assert tracker.is_monotonic("tok", 0.2)
    assert not tracker.is_monotonic("tok", 0.1)


class TestProgressNotificationEnvelopeEdge:
  def test_rejects_missing_jsonrpc(self):
    assert not is_valid_progress_notification(
      {"method": "notifications/progress", "params": {"progressToken": "tok", "progress": 1}}
    )

  def test_build_progress_notification_minimal(self):
    notif = build_progress_notification("tok", 1)
    assert notif == {
      "jsonrpc": "2.0",
      "method": "notifications/progress",
      "params": {"progressToken": "tok", "progress": 1},
    }

  def test_build_progress_notification_propagates_validation_error(self):
    with pytest.raises(ValueError):
      build_progress_notification("tok", "not a number")

  def test_build_params_accepts_numeric_token(self):
    assert build_progress_notification_params(7, 5) == {"progressToken": 7, "progress": 5}

  def test_build_params_omits_optionals_when_none(self):
    assert build_progress_notification_params("tok", 5, total=None, message=None, meta=None) == {
      "progressToken": "tok",
      "progress": 5,
    }

  def test_build_params_rejects_boolean_token(self):
    with pytest.raises(ValueError):
      build_progress_notification_params(True, 5)

  def test_build_params_rejects_boolean_progress(self):
    with pytest.raises(ValueError):
      build_progress_notification_params("tok", True)


class TestCancelledNotificationEnvelopeEdge:
  def test_envelope_rejects_wrong_jsonrpc(self):
    assert not is_valid_cancelled_notification(
      {"jsonrpc": "3", "method": "notifications/cancelled", "params": {"requestId": 1}}
    )

  def test_envelope_rejects_invalid_params(self):
    assert not is_valid_cancelled_notification(
      {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": {"x": 1}}}
    )

  def test_envelope_accepts_empty_params(self):
    assert is_valid_cancelled_notification(
      {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {}}
    )

  def test_envelope_rejects_non_dict(self):
    assert not is_valid_cancelled_notification(None)

  def test_params_reject_non_dict(self):
    assert not is_valid_cancelled_notification_params("nope")
    assert not is_valid_cancelled_notification_params(None)

  def test_build_envelope_minimal_has_empty_params(self):
    notif = build_cancelled_notification()
    assert notif == {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {}}
    assert is_valid_cancelled_notification(notif)

  def test_build_params_rejects_boolean_request_id(self):
    with pytest.raises(ValueError):
      build_cancelled_notification_params(True)


class TestValidateCancellationTargetEdge:
  def test_discover_guard_precedence_over_in_flight(self):
    # Even if the discover id were in-flight, it must remain non-cancellable.
    result = validate_cancellation_target("d", {"d"}, "d")
    assert not result.ok
    assert "server/discover" in result.reason

  def test_string_and_number_ids_distinct(self):
    # An in-flight set of {1} must not match the string "1".
    result = validate_cancellation_target("1", {1})
    assert not result.ok

  def test_other_request_id_not_blocked_by_discover_guard(self):
    result = validate_cancellation_target(5, {5}, 0)
    assert result.ok

  def test_ok_result_has_no_reason(self):
    assert validate_cancellation_target(1, {1}).reason is None


class TestIsDiscoverMethodEdge:
  def test_false_for_empty_string(self):
    assert not is_discover_method("")

  def test_false_for_prefix_only(self):
    assert not is_discover_method("server/")


class TestProgressRateLimiterWindow:
  def test_each_permitted_emit_resets_window(self):
    limiter = ProgressRateLimiter(100)
    assert limiter.should_emit("tok", 1000)
    assert limiter.should_emit("tok", 1100)  # permitted, last-emit moves to 1100
    assert not limiter.should_emit("tok", 1150)  # 50 ms after 1100
    assert limiter.should_emit("tok", 1200)

  def test_suppressed_emit_does_not_advance_window(self):
    limiter = ProgressRateLimiter(100)
    limiter.should_emit("tok", 1000)
    assert not limiter.should_emit("tok", 1050)  # suppressed; window stays anchored at 1000
    assert limiter.should_emit("tok", 1100)  # 100 ms after the original 1000 emit


class TestCancellationHandlerAbort:
  def test_can_stop_async_work_via_abort_flag(self):
    aborted = {"value": False}
    handler = CancellationHandler()
    handler.register("async-req", lambda: aborted.__setitem__("value", True))
    assert aborted["value"] is False
    handler.trigger("async-req")
    assert aborted["value"] is True
