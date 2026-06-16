"""Tests for Logging & Trace Context utilities (§15.3–§15.4).

Mirrors the TypeScript ``logging.test.ts`` AC coverage and adds builder-path tests:

* AC-23.1  (R-15.3-a)        — logging is Deprecated; method constant exists
* AC-23.3  (R-15.3.1-a)      — level ordering; server emits only at-or-above
* AC-23.4  (R-15.3.2-a)      — level required and must be a known LoggingLevel string
* AC-23.5  (R-15.3.2-b)      — logger optional
* AC-23.6  (R-15.3.2-c)      — data required
* AC-23.7  (R-15.3.2-d)      — data can be string or object
* AC-23.9  (R-15.3.3-a)      — absent logLevel → zero notifications
* AC-23.10 (R-15.3.3-b,c,d)  — logLevel honored; only at-or-above emitted
* AC-23.12 (R-15.3.3-g)      — invalid logLevel → -32602
* AC-23.13 (RC-3)            — log rate limiting (guidance)
* AC-23.14 (R-15.4.1-a,b,c)  — trace keys optional, W3C format
* AC-23.16 (R-15.4.2-c)      — receiver treats values as opaque
* AC-23.17 (R-15.4.2-d,e,f)  — absent keys: no assumption, no requirement
* AC-23.18 (R-15.4.2-g)      — non-tracing receiver ignores keys without error
* AC-23.19 (R-15.4.2-h)      — intermediary propagates trace context unchanged
"""

import pytest

from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.logging import (
  LOGGING_LEVELS,
  LOGGING_MESSAGE_METHOD,
  TRACE_CONTEXT_BARE_KEYS,
  LogLevelValidationResult,
  LogRateLimiter,
  build_logging_message_notification,
  build_logging_message_notification_params,
  extract_trace_context,
  has_baggage,
  has_traceparent,
  has_tracestate,
  is_at_or_above_log_level,
  is_valid_logging_level,
  is_valid_logging_message_notification,
  is_valid_logging_message_notification_params,
  logging_level_index,
  relay_trace_context,
  resolved_min_log_level_index,
  validate_log_level_opt_in,
)

ALL_LEVELS = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]


# ─── AC-23.1 — Deprecated status ─────────────────────────────────────────────

class TestDeprecatedStatus:
  def test_method_constant_exists(self):
    assert LOGGING_MESSAGE_METHOD == "notifications/message"

  def test_logging_level_validator_defined(self):
    assert is_valid_logging_level("debug")


# ─── AC-23.3 — level ordering (R-15.3.1-a) ───────────────────────────────────

class TestLoggingLevelOrdering:
  def test_debug_is_lowest(self):
    assert logging_level_index("debug") == 0

  def test_emergency_is_highest(self):
    assert logging_level_index("emergency") == 7

  def test_strict_ascending_order(self):
    for i in range(len(ALL_LEVELS) - 1):
      assert logging_level_index(ALL_LEVELS[i]) < logging_level_index(ALL_LEVELS[i + 1])

  def test_logging_levels_has_eight_in_order(self):
    assert len(LOGGING_LEVELS) == 8
    assert LOGGING_LEVELS[0] == "debug"
    assert LOGGING_LEVELS[7] == "emergency"

  def test_at_or_above_filters_for_warning(self):
    assert not is_at_or_above_log_level("debug", "warning")
    assert not is_at_or_above_log_level("info", "warning")
    assert not is_at_or_above_log_level("notice", "warning")
    assert is_at_or_above_log_level("warning", "warning")
    assert is_at_or_above_log_level("error", "warning")
    assert is_at_or_above_log_level("emergency", "warning")


# ─── is_valid_logging_level edge cases ───────────────────────────────────────

class TestIsValidLoggingLevel:
  def test_accepts_all_eight(self):
    for level in ALL_LEVELS:
      assert is_valid_logging_level(level)

  def test_rejects_unknown_string(self):
    assert not is_valid_logging_level("verbose")
    assert not is_valid_logging_level("trace")

  def test_rejects_non_string(self):
    assert not is_valid_logging_level(3)
    assert not is_valid_logging_level(None)
    assert not is_valid_logging_level(["debug"])

  def test_rejects_case_mismatch(self):
    assert not is_valid_logging_level("Debug")
    assert not is_valid_logging_level("DEBUG")


# ─── AC-23.4 — level required and must be valid (R-15.3.2-a) ────────────────

class TestLogParamsLevel:
  def test_accepts_all_eight_levels(self):
    for level in ALL_LEVELS:
      assert is_valid_logging_message_notification_params({"level": level, "data": "msg"})

  def test_rejects_when_level_absent(self):
    assert not is_valid_logging_message_notification_params({"data": "msg"})

  def test_rejects_unrecognized_level(self):
    assert not is_valid_logging_message_notification_params({"level": "verbose", "data": "msg"})

  def test_rejects_numeric_level(self):
    assert not is_valid_logging_message_notification_params({"level": 3, "data": "msg"})

  def test_rejects_non_dict(self):
    assert not is_valid_logging_message_notification_params(None)
    assert not is_valid_logging_message_notification_params("x")


# ─── AC-23.5 — logger optional (R-15.3.2-b) ─────────────────────────────────

class TestLoggerOptional:
  def test_valid_without_logger(self):
    params = {"level": "info", "data": "hello"}
    assert is_valid_logging_message_notification_params(params)
    assert "logger" not in params

  def test_valid_with_logger(self):
    assert is_valid_logging_message_notification_params(
      {"level": "info", "logger": "database", "data": "hello"}
    )

  def test_rejects_non_string_logger(self):
    assert not is_valid_logging_message_notification_params(
      {"level": "info", "logger": 5, "data": "hello"}
    )


# ─── AC-23.6 — data required (R-15.3.2-c) ───────────────────────────────────

class TestDataRequired:
  def test_rejects_when_data_absent(self):
    assert not is_valid_logging_message_notification_params({"level": "info"})

  def test_data_key_present_with_none_value_is_valid(self):
    # `data` is REQUIRED by key presence; its VALUE may be null/anything.
    assert is_valid_logging_message_notification_params({"level": "info", "data": None})


# ─── AC-23.7 — data can be string or object (R-15.3.2-d) ─────────────────────

class TestDataTypes:
  def test_accepts_string_data(self):
    assert is_valid_logging_message_notification_params({"level": "error", "data": "Connection failed"})

  def test_accepts_object_data(self):
    assert is_valid_logging_message_notification_params(
      {"level": "error", "data": {"error": "Connection failed", "host": "localhost"}}
    )

  def test_accepts_number_data(self):
    assert is_valid_logging_message_notification_params({"level": "debug", "data": 42})

  def test_accepts_null_data(self):
    assert is_valid_logging_message_notification_params({"level": "debug", "data": None})

  def test_accepts_list_data(self):
    assert is_valid_logging_message_notification_params({"level": "debug", "data": [1, 2, 3]})

  def test_rejects_bad_meta(self):
    assert not is_valid_logging_message_notification_params(
      {"level": "debug", "data": "x", "_meta": "nope"}
    )

  def test_passthrough_unknown_keys(self):
    assert is_valid_logging_message_notification_params(
      {"level": "debug", "data": "x", "extra": True}
    )


# ─── Builders ────────────────────────────────────────────────────────────────

class TestBuildLogNotification:
  def test_build_params_minimal(self):
    params = build_logging_message_notification_params("info", "hello")
    assert params == {"level": "info", "data": "hello"}

  def test_build_params_includes_none_data(self):
    params = build_logging_message_notification_params("info", None)
    assert params == {"level": "info", "data": None}
    assert is_valid_logging_message_notification_params(params)

  def test_build_params_full(self):
    params = build_logging_message_notification_params(
      "error", {"x": 1}, logger="db", meta={"k": "v"}
    )
    assert params == {"level": "error", "data": {"x": 1}, "logger": "db", "_meta": {"k": "v"}}

  def test_build_params_rejects_bad_level(self):
    with pytest.raises(ValueError):
      build_logging_message_notification_params("verbose", "x")

  def test_build_params_rejects_bad_logger(self):
    with pytest.raises(ValueError):
      build_logging_message_notification_params("info", "x", logger=5)

  def test_build_envelope_round_trips(self):
    notif = build_logging_message_notification("error", {"e": 1}, logger="db")
    assert notif["jsonrpc"] == "2.0"
    assert notif["method"] == LOGGING_MESSAGE_METHOD
    assert is_valid_logging_message_notification(notif)


# ─── Full notification envelope ──────────────────────────────────────────────

class TestLogNotificationEnvelope:
  def test_accepts_well_formed(self):
    assert is_valid_logging_message_notification(
      {
        "jsonrpc": "2.0",
        "method": "notifications/message",
        "params": {"level": "error", "logger": "database", "data": {"host": "localhost", "port": 5432}},
      }
    )

  def test_rejects_wrong_method(self):
    assert not is_valid_logging_message_notification(
      {"jsonrpc": "2.0", "method": "notifications/log", "params": {"level": "info", "data": "hello"}}
    )

  def test_rejects_wrong_jsonrpc(self):
    assert not is_valid_logging_message_notification(
      {"jsonrpc": "1.0", "method": "notifications/message", "params": {"level": "info", "data": "x"}}
    )

  def test_rejects_bad_params(self):
    assert not is_valid_logging_message_notification(
      {"jsonrpc": "2.0", "method": "notifications/message", "params": {"data": "x"}}
    )

  def test_rejects_non_dict(self):
    assert not is_valid_logging_message_notification(None)


# ─── AC-23.9 — absent logLevel → zero notifications (R-15.3.3-a) ─────────────

class TestResolvedMinLogLevelAbsent:
  def test_returns_minus_one_for_none(self):
    assert resolved_min_log_level_index(None) == -1

  def test_returns_minus_one_for_invalid_string(self):
    assert resolved_min_log_level_index("verbose") == -1

  def test_returns_minus_one_for_numeric(self):
    assert resolved_min_log_level_index(3) == -1


# ─── AC-23.10 — logLevel honored: only at-or-above (R-15.3.3-b,c,d) ─────────

class TestResolvedMinLogLevelHonored:
  def test_index_for_warning(self):
    assert resolved_min_log_level_index("warning") == 3

  def test_index_for_debug(self):
    assert resolved_min_log_level_index("debug") == 0

  def test_index_for_emergency(self):
    assert resolved_min_log_level_index("emergency") == 7

  def test_combined_filtering_with_at_or_above(self):
    min_index = resolved_min_log_level_index("warning")  # 3
    levels = ["debug", "info", "notice", "warning", "error", "emergency"]
    will_emit = [l for l in levels if logging_level_index(l) >= min_index]
    will_drop = [l for l in levels if logging_level_index(l) < min_index]
    assert will_emit == ["warning", "error", "emergency"]
    assert will_drop == ["debug", "info", "notice"]


# ─── AC-23.12 — invalid logLevel → -32602 (R-15.3.3-g) ──────────────────────

class TestValidateLogLevelOptIn:
  def test_ok_for_recognized_level(self):
    result = validate_log_level_opt_in("warning")
    assert isinstance(result, LogLevelValidationResult)
    assert result.ok
    assert result.code is None

  def test_ok_for_every_level(self):
    for level in ALL_LEVELS:
      assert validate_log_level_opt_in(level).ok

  def test_not_ok_with_code_for_unrecognized_string(self):
    result = validate_log_level_opt_in("verbose")
    assert not result.ok
    assert result.code == INVALID_PARAMS_CODE == -32602

  def test_not_ok_for_numeric(self):
    result = validate_log_level_opt_in(3)
    assert not result.ok
    assert result.code == -32602

  def test_not_ok_for_none(self):
    result = validate_log_level_opt_in(None)
    assert not result.ok
    assert result.code == -32602
    assert result.message is not None


# ─── AC-23.13 — LogRateLimiter (RC-3 / SHOULD) ───────────────────────────────

class TestLogRateLimiter:
  def test_permits_first_emission(self):
    assert LogRateLimiter(50).should_emit(1000)

  def test_suppresses_second_within_interval(self):
    limiter = LogRateLimiter(50)
    limiter.should_emit(1000)
    assert not limiter.should_emit(1030)

  def test_permits_second_at_boundary(self):
    limiter = LogRateLimiter(50)
    limiter.should_emit(1000)
    assert limiter.should_emit(1050)

  def test_permits_second_after_interval(self):
    limiter = LogRateLimiter(50)
    limiter.should_emit(1000)
    assert limiter.should_emit(1200)

  def test_default_interval_is_50ms(self):
    limiter = LogRateLimiter()
    limiter.should_emit(1000)
    assert not limiter.should_emit(1049)
    assert limiter.should_emit(1050)

  def test_custom_interval_respected(self):
    limiter = LogRateLimiter(200)
    limiter.should_emit(1000)
    assert not limiter.should_emit(1199)
    assert limiter.should_emit(1200)

  def test_fresh_limiter_allows_emission_regardless_of_now(self):
    assert LogRateLimiter(50).should_emit(0)

  def test_updates_baseline_on_each_permitted_emit(self):
    limiter = LogRateLimiter(50)
    limiter.should_emit(1000)  # baseline 1000
    limiter.should_emit(1050)  # baseline 1050 (permitted)
    assert not limiter.should_emit(1080)  # 30 < 50
    assert limiter.should_emit(1100)  # 50 >= 50

  def test_suppressed_call_does_not_advance_baseline(self):
    limiter = LogRateLimiter(50)
    limiter.should_emit(1000)  # baseline 1000
    assert not limiter.should_emit(1010)  # suppressed; baseline stays 1000
    assert not limiter.should_emit(1040)  # still measured from 1000 → 40 < 50
    assert limiter.should_emit(1050)  # 50 >= 50

  def test_zero_interval_always_permits(self):
    limiter = LogRateLimiter(0)
    assert limiter.should_emit(1000)
    assert limiter.should_emit(1000)  # 0 - 0 = 0 is not < 0


# ─── AC-23.14 — trace presence predicates (R-15.4.1-a,b,c) ──────────────────

VALID_TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
VALID_TRACESTATE = "vendora=t61rcwkgmze,vendorb=00f067aa0ba902b7"
VALID_BAGGAGE = "userTier=gold,region=us-east-1"


class TestTracePresencePredicates:
  def test_has_traceparent_true_for_valid(self):
    assert has_traceparent({"traceparent": VALID_TRACEPARENT})

  def test_has_traceparent_false_when_absent(self):
    assert not has_traceparent({})

  def test_has_traceparent_false_for_garbage(self):
    assert not has_traceparent({"traceparent": "garbage-value"})

  def test_has_traceparent_false_for_non_string(self):
    assert not has_traceparent({"traceparent": 123})

  def test_has_tracestate_true_for_valid(self):
    assert has_tracestate({"tracestate": VALID_TRACESTATE})

  def test_has_tracestate_false_when_absent(self):
    assert not has_tracestate({})

  def test_has_baggage_true_for_valid(self):
    assert has_baggage({"baggage": VALID_BAGGAGE})

  def test_has_baggage_false_when_absent(self):
    assert not has_baggage({})


# ─── AC-23.15 — keys may appear on any message (R-15.4.2-a,b) ───────────────

class TestTraceKeysConstants:
  def test_bare_keys_contains_three(self):
    assert "traceparent" in TRACE_CONTEXT_BARE_KEYS
    assert "tracestate" in TRACE_CONTEXT_BARE_KEYS
    assert "baggage" in TRACE_CONTEXT_BARE_KEYS

  def test_message_without_trace_keys_yields_empty(self):
    assert extract_trace_context({"foo": "bar"}) == {}


# ─── AC-23.16 — receiver treats values as opaque (R-15.4.2-c) ───────────────

class TestExtractTraceContext:
  def test_copies_values_without_parsing(self):
    meta = {
      "traceparent": VALID_TRACEPARENT,
      "tracestate": "vendorX=abc",
      "baggage": "k=v",
      "other-key": "ignored",
    }
    ctx = extract_trace_context(meta)
    assert ctx["traceparent"] == meta["traceparent"]
    assert ctx["tracestate"] == meta["tracestate"]
    assert ctx["baggage"] == meta["baggage"]
    assert "other-key" not in ctx

  def test_copies_even_garbage_values_opaquely(self):
    # extract does not validate; it only requires a string value (opaque copy).
    ctx = extract_trace_context({"traceparent": "garbage-value"})
    assert ctx == {"traceparent": "garbage-value"}

  def test_skips_non_string_values(self):
    ctx = extract_trace_context({"traceparent": 123, "baggage": "k=v"})
    assert "traceparent" not in ctx
    assert ctx["baggage"] == "k=v"


# ─── AC-23.17 — absent keys: no assumption/requirement (R-15.4.2-d,e,f) ─────

class TestAbsentTraceKeys:
  def test_extract_empty_meta_returns_empty(self):
    assert extract_trace_context({}) == {}

  def test_relay_copies_nothing_when_inbound_empty(self):
    out = relay_trace_context({}, {"existing": "value"})
    assert "traceparent" not in out
    assert "tracestate" not in out
    assert "baggage" not in out
    assert out["existing"] == "value"


# ─── AC-23.18 — non-tracing receiver ignores keys (R-15.4.2-g) ───────────────

class TestNonTracingReceiver:
  def test_extract_does_not_raise_on_garbage(self):
    extract_trace_context({"traceparent": "garbage-value"})  # must not raise

  def test_only_non_trace_keys_handled_without_error(self):
    ctx = extract_trace_context({"io.modelcontextprotocol/protocolVersion": "2026-07-28"})
    assert ctx == {}


# ─── AC-23.19 — intermediary propagates unchanged (R-15.4.2-h) ───────────────

class TestRelayTraceContext:
  TP = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
  TS = "vendora=t61rcwkgmze"
  BG = "userTier=gold"

  def test_copies_all_three_unchanged(self):
    inbound = {"traceparent": self.TP, "tracestate": self.TS, "baggage": self.BG}
    out = relay_trace_context(inbound, {})
    assert out["traceparent"] == self.TP
    assert out["tracestate"] == self.TS
    assert out["baggage"] == self.BG

  def test_preserves_existing_outbound_non_trace_keys(self):
    out = relay_trace_context({"traceparent": self.TP}, {"someKey": "preserved"})
    assert out["someKey"] == "preserved"
    assert out["traceparent"] == self.TP

  def test_only_copies_present_keys(self):
    out = relay_trace_context({"traceparent": self.TP}, {})
    assert "traceparent" in out
    assert "tracestate" not in out
    assert "baggage" not in out

  def test_does_not_mutate_original_outbound(self):
    original = {"original": True}
    relay_trace_context({"traceparent": self.TP}, original)
    assert "traceparent" not in original
    assert original == {"original": True}

  def test_does_not_mutate_inbound(self):
    inbound = {"traceparent": self.TP}
    relay_trace_context(inbound, {"x": 1})
    assert inbound == {"traceparent": self.TP}

  def test_overwrites_outbound_value_with_inbound(self):
    out = relay_trace_context({"traceparent": self.TP}, {"traceparent": "old"})
    assert out["traceparent"] == self.TP

  def test_relays_non_string_inbound_values_verbatim(self):
    # relay is by-presence, not by-type — it propagates whatever inbound holds.
    out = relay_trace_context({"baggage": {"opaque": "object"}}, {})
    assert out["baggage"] == {"opaque": "object"}
