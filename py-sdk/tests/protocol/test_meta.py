"""Tests for the _meta object + per-request envelope validation (§4.1–§4.3, §5.1).

Mirrors the TS suite ``src/__tests__/protocol/meta.test.ts`` (S05), AC-mapped. The
key-naming grammar ACs (AC-05.8 – AC-05.16) are owned by :mod:`mcp.json.meta_key` and
covered by its own test module; here we cover the semantic layer S05 adds:
``is_valid_meta_object`` (``MetaObjectSchema``), ``is_valid_logging_level`` /
``LOGGING_LEVELS`` (``LoggingLevelSchema``), ``is_valid_request_meta_object``
(``RequestMetaObjectSchema``), ``validate_request_meta``, the protocol-version
predicates, and the error-code constants + builder.

AC coverage:
  AC-05.1/.4/.5/.7   — _meta is an object; unknown keys tolerated; values opaque.
  AC-05.13/.14       — reserved bare keys + trace-context values accepted.
  AC-05.16           — non-tracing receiver ignores trace keys.
  AC-05.17           — three required per-request keys validated.
  AC-05.18           — missing required key → -32602.
  AC-05.19           — logLevel optional/deprecated; ordering predicates.
  AC-05.20           — progressToken optional (string or number).
  AC-05.21           — Implementation requires name+version.
  AC-05.22           — unsupported protocolVersion rejected.
  AC-05.25           — missing capability → -32003.
"""

import pytest

from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.logging import resolved_min_log_level_index
from mcp.transport.http.responses import http_status_for_error_code
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  LOG_LEVEL_META_KEY,
  LOGGING_LEVELS,
  PROTOCOL_VERSION_META_KEY,
  RESERVED_BARE_KEYS,
  build_missing_capability_error,
  is_at_or_above_log_level,
  is_reserved_bare_key,
  is_supported_protocol_version,
  is_valid_logging_level,
  is_valid_meta_object,
  is_valid_request_meta_object,
  is_valid_revision_format,
  logging_level_index,
  validate_request_meta,
)


def valid_meta() -> dict:
  return {
    PROTOCOL_VERSION_META_KEY: "2026-07-28",
    CLIENT_INFO_META_KEY: {"name": "c", "version": "1.0"},
    CLIENT_CAPABILITIES_META_KEY: {},
  }


# ─── AC-05.6 / AC-05.13 — reserved bare keys ──────────────────────────────────


class TestReservedBareKeys:
  def test_membership(self):
    assert is_reserved_bare_key("progressToken")
    assert is_reserved_bare_key("traceparent")
    assert not is_reserved_bare_key("randomKey")

  def test_trace_context_keys_reserved(self):
    for key in ("traceparent", "tracestate", "baggage"):
      assert is_reserved_bare_key(key)

  def test_reserved_bare_keys_is_exactly_four(self):
    assert set(RESERVED_BARE_KEYS) == {"baggage", "progressToken", "traceparent", "tracestate"}


# ─── AC-05.1 / AC-05.4 / AC-05.5 / AC-05.7 — is_valid_meta_object ─────────────


class TestMetaObject:
  def test_accepts_empty_object(self):
    assert is_valid_meta_object({})

  def test_accepts_arbitrary_string_keys(self):
    assert is_valid_meta_object({"someUnknownKey": "value", "io.future/newFeature": True})

  def test_accepts_mixed_json_value_types(self):
    assert is_valid_meta_object(
      {"str": "text", "num": 42, "bool": True, "nul": None, "obj": {"nested": True}, "arr": [1, 2, 3]}
    )

  def test_accepts_any_value_under_reserved_key(self):
    # Receivers MUST NOT assume a particular value type for reserved keys (R-4.1-g).
    assert is_valid_meta_object({"io.modelcontextprotocol/futureKey": {"complex": "structure"}})

  def test_trace_context_value_passed_through(self):
    tp = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    assert is_valid_meta_object({"traceparent": tp})

  def test_rejects_array(self):
    assert not is_valid_meta_object([])
    assert not is_valid_meta_object(["key", "value"])

  def test_rejects_string_scalar(self):
    assert not is_valid_meta_object("bad")

  def test_rejects_number_scalar(self):
    assert not is_valid_meta_object(42)

  def test_rejects_null(self):
    assert not is_valid_meta_object(None)


# ─── AC-05.19 — LoggingLevel ─────────────────────────────────────────────────


class TestLoggingLevels:
  def test_index_and_ordering(self):
    assert logging_level_index("debug") == 0
    assert logging_level_index("emergency") == 7
    assert is_at_or_above_log_level("error", "warning")
    assert not is_at_or_above_log_level("info", "error")

  def test_unknown_level_raises(self):
    with pytest.raises(ValueError):
      logging_level_index("verbose")

  def test_is_valid_logging_level_accepts_all_defined(self):
    for level in LOGGING_LEVELS:
      assert is_valid_logging_level(level)

  def test_is_valid_logging_level_rejects_unknown(self):
    assert not is_valid_logging_level("verbose")
    assert not is_valid_logging_level("")
    assert not is_valid_logging_level(None)
    assert not is_valid_logging_level(3)

  def test_ascending_severity_order(self):
    assert logging_level_index("debug") < logging_level_index("emergency")
    assert logging_level_index("info") < logging_level_index("error")

  def test_is_at_or_above_examples(self):
    assert is_at_or_above_log_level("warning", "info")
    assert not is_at_or_above_log_level("debug", "warning")
    assert is_at_or_above_log_level("error", "error")  # same level → True


# ─── AC-05.22 — protocol version support + format ─────────────────────────────


class TestProtocolVersion:
  def test_supported(self):
    assert is_supported_protocol_version(CURRENT_PROTOCOL_VERSION)
    assert not is_supported_protocol_version("2025-01-01")

  def test_current_is_expected_revision(self):
    assert CURRENT_PROTOCOL_VERSION == "2026-07-28"

  def test_supported_accepts_current_rejects_others(self):
    assert is_supported_protocol_version("2026-07-28")
    assert not is_supported_protocol_version("2025-01-01")
    assert not is_supported_protocol_version("unknown")

  def test_revision_format(self):
    assert is_valid_revision_format("2026-07-28")
    assert not is_valid_revision_format("2026-7-28")
    assert not is_valid_revision_format("draft")


# ─── AC-05.17 / AC-05.19 / AC-05.20 / AC-05.21 — is_valid_request_meta_object ──


class TestRequestMetaObject:
  def test_accepts_valid_per_request_meta(self):
    assert is_valid_request_meta_object(valid_meta())

  def test_requires_protocol_version(self):
    meta = valid_meta()
    del meta[PROTOCOL_VERSION_META_KEY]
    assert not is_valid_request_meta_object(meta)

  def test_requires_client_info(self):
    meta = valid_meta()
    del meta[CLIENT_INFO_META_KEY]
    assert not is_valid_request_meta_object(meta)

  def test_requires_client_capabilities(self):
    meta = valid_meta()
    del meta[CLIENT_CAPABILITIES_META_KEY]
    assert not is_valid_request_meta_object(meta)

  def test_empty_client_capabilities_accepted(self):
    assert is_valid_request_meta_object(valid_meta())

  def test_protocol_version_must_be_string(self):
    meta = valid_meta()
    meta[PROTOCOL_VERSION_META_KEY] = 20260728
    assert not is_valid_request_meta_object(meta)

  def test_client_capabilities_must_be_object(self):
    meta = valid_meta()
    meta[CLIENT_CAPABILITIES_META_KEY] = "nope"
    assert not is_valid_request_meta_object(meta)

  def test_log_level_optional(self):
    assert is_valid_request_meta_object(valid_meta())

  def test_valid_log_level_accepted(self):
    meta = valid_meta()
    meta[LOG_LEVEL_META_KEY] = "warning"
    assert is_valid_request_meta_object(meta)

  def test_invalid_log_level_rejected(self):
    meta = valid_meta()
    meta[LOG_LEVEL_META_KEY] = "verbose"
    assert not is_valid_request_meta_object(meta)

  def test_progress_token_string_accepted(self):
    meta = valid_meta()
    meta["progressToken"] = "req-1-progress"
    assert is_valid_request_meta_object(meta)

  def test_progress_token_number_accepted(self):
    meta = valid_meta()
    meta["progressToken"] = 42
    assert is_valid_request_meta_object(meta)

  def test_progress_token_bool_rejected(self):
    meta = valid_meta()
    meta["progressToken"] = True
    assert not is_valid_request_meta_object(meta)

  def test_reserved_bare_keys_and_trace_values_accepted(self):
    meta = valid_meta()
    meta.update(
      {
        "progressToken": "tok-42",
        "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "tracestate": "rojo=00f067aa0ba902b7",
        "baggage": "userId=alice,serverNode=DF-28",
      }
    )
    assert is_valid_request_meta_object(meta)

  def test_opaque_non_w3c_trace_values_accepted(self):
    # §15.4.2 (R-15.4.2-c, R-15.4.2-g): trace-context values are OPAQUE — an
    # arbitrarily-shaped string is accepted just like a W3C-conformant one.
    meta = valid_meta()
    meta["tracestate"] = "vendorA=t61rcWkgMzE,vendorB=00f067aa0ba902b7"
    assert is_valid_request_meta_object(meta)
    meta2 = valid_meta()
    meta2["baggage"] = "@@@arbitrary-opaque-value@@@"
    assert is_valid_request_meta_object(meta2)

  def test_non_string_trace_value_rejected(self):
    meta = valid_meta()
    meta["traceparent"] = 1234
    assert not is_valid_request_meta_object(meta)

  def test_implementation_requires_name(self):
    meta = valid_meta()
    meta[CLIENT_INFO_META_KEY] = {"version": "1.0.0"}
    assert not is_valid_request_meta_object(meta)

  def test_implementation_requires_version(self):
    meta = valid_meta()
    meta[CLIENT_INFO_META_KEY] = {"name": "client"}
    assert not is_valid_request_meta_object(meta)

  def test_implementation_with_optional_fields_accepted(self):
    meta = valid_meta()
    meta[CLIENT_INFO_META_KEY] = {
      "name": "example-client",
      "version": "1.4.0",
      "title": "Example Client",
      "description": "Test client",
    }
    assert is_valid_request_meta_object(meta)

  def test_extra_keys_pass_through(self):
    meta = valid_meta()
    meta["com.example/requestTag"] = "nightly-sync"
    assert is_valid_request_meta_object(meta)

  def test_non_object_rejected(self):
    assert not is_valid_request_meta_object(None)
    assert not is_valid_request_meta_object([])

  def test_spec_wire_example(self):
    # §4.3 wire example: all required + optional + vendor keys present.
    meta = {
      PROTOCOL_VERSION_META_KEY: "2026-07-28",
      CLIENT_INFO_META_KEY: {"name": "example-client", "version": "1.4.0", "title": "Example Client"},
      CLIENT_CAPABILITIES_META_KEY: {},
      LOG_LEVEL_META_KEY: "warning",
      "progressToken": "req-1-progress",
      "traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      "com.example/requestTag": "nightly-sync",
    }
    assert is_valid_request_meta_object(meta)
    assert validate_request_meta(meta).ok


# ─── AC-05.17 / AC-05.18 — validate_request_meta (the -32602 request gate) ─────


class TestValidateRequestMeta:
  def test_valid(self):
    assert validate_request_meta(valid_meta()).ok

  def test_missing_protocol_version(self):
    meta = valid_meta()
    del meta[PROTOCOL_VERSION_META_KEY]
    result = validate_request_meta(meta)
    assert not result.ok and result.code == INVALID_PARAMS_CODE

  def test_missing_protocol_version_message_mentions_key(self):
    meta = valid_meta()
    del meta[PROTOCOL_VERSION_META_KEY]
    result = validate_request_meta(meta)
    assert "protocolVersion" in result.message

  def test_malformed_protocol_version(self):
    meta = valid_meta()
    meta[PROTOCOL_VERSION_META_KEY] = "not-a-date"
    result = validate_request_meta(meta)
    assert not result.ok and result.code == INVALID_PARAMS_CODE
    assert "revision identifier" in result.message

  def test_invalid_client_info(self):
    meta = valid_meta()
    meta[CLIENT_INFO_META_KEY] = {"name": "c"}  # missing version
    result = validate_request_meta(meta)
    assert not result.ok and result.code == INVALID_PARAMS_CODE

  def test_missing_client_info(self):
    meta = valid_meta()
    del meta[CLIENT_INFO_META_KEY]
    result = validate_request_meta(meta)
    assert not result.ok and result.code == INVALID_PARAMS_CODE

  def test_missing_capabilities(self):
    meta = valid_meta()
    meta[CLIENT_CAPABILITIES_META_KEY] = "nope"
    result = validate_request_meta(meta)
    assert not result.ok and result.code == INVALID_PARAMS_CODE

  def test_missing_capabilities_key_absent(self):
    meta = valid_meta()
    del meta[CLIENT_CAPABILITIES_META_KEY]
    result = validate_request_meta(meta)
    assert not result.ok and result.code == INVALID_PARAMS_CODE

  def test_extra_keys_ignored(self):
    # AC-05.4: unknown extra keys are tolerated after the required ones validate.
    meta = valid_meta()
    meta["com.example/custom"] = {"x": 1}
    assert validate_request_meta(meta).ok

  def test_invalid_params_code_is_32602(self):
    assert INVALID_PARAMS_CODE == -32602

  def test_trace_keys_do_not_cause_rejection(self):
    # AC-05.16: a non-tracing receiver accepts requests carrying trace-context keys.
    meta = valid_meta()
    meta.update(
      {
        "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "tracestate": "rojo=00f067aa0ba902b7",
        "baggage": "userId=alice",
      }
    )
    assert validate_request_meta(meta).ok

  def test_per_request_capabilities_not_accumulated(self):
    # AC-05.24: each request's clientCapabilities is the only source — no inference.
    req1 = valid_meta()
    req1[CLIENT_CAPABILITIES_META_KEY] = {"elicitation": {}}
    req2 = valid_meta()  # declares {} — elicitation is NOT inferred from req1
    assert validate_request_meta(req1).ok
    assert validate_request_meta(req2).ok
    assert "elicitation" not in req2[CLIENT_CAPABILITIES_META_KEY]


# ─── AC-05.25 — missing capability → -32003 ──────────────────────────────────


class TestMissingCapabilityError:
  def test_shape(self):
    err = build_missing_capability_error({"sampling": {}})
    assert err["code"] == MISSING_CLIENT_CAPABILITY_CODE
    assert err["data"]["requiredCapabilities"] == {"sampling": {}}

  def test_code_is_32003(self):
    assert MISSING_CLIENT_CAPABILITY_CODE == -32003

  def test_matches_wire_example(self):
    err = build_missing_capability_error({"elicitation": {}})
    assert err == {
      "code": -32003,
      "message": "Missing required client capability",
      "data": {"requiredCapabilities": {"elicitation": {}}},
    }

  def test_lists_multiple_missing_capabilities(self):
    err = build_missing_capability_error({"sampling": {}, "roots": {}})
    assert err["data"]["requiredCapabilities"] == {"sampling": {}, "roots": {}}

  def test_message_is_string(self):
    err = build_missing_capability_error({"elicitation": {}})
    assert isinstance(err["message"], str)


# ─── S05-RQ-13 / RQ-16 / RQ-18 — _meta gate failures ride HTTP 400 (§9.7) ──────


class TestMetaGateMapsToHttp400:
  """A failed §4.3 ``_meta`` envelope gate is a ``-32602`` (Invalid params) outcome, which
  the §9.7 status map carries as HTTP ``400 Bad Request``. The live request→400 path is
  exercised end to end by ``TestMetaEnvelopeGate`` / ``TestProtocolVersionValidation`` in
  ``tests/server/test_asgi_handler.py``; these assertions pin the protocol-layer outcome ↔
  HTTP-status mapping that underlies it so S05 stands on its own. (S05-RQ-13, RQ-16, RQ-18;
  R-9.7)
  """

  def _status(self, meta: dict) -> int:
    result = validate_request_meta(meta)
    assert not result.ok
    return http_status_for_error_code(result.code)

  def test_each_missing_required_key_maps_to_400(self):
    for key in (PROTOCOL_VERSION_META_KEY, CLIENT_INFO_META_KEY, CLIENT_CAPABILITIES_META_KEY):
      meta = valid_meta()
      del meta[key]
      assert self._status(meta) == 400

  def test_mismatched_protocol_version_maps_to_400(self):
    meta = valid_meta()
    meta[PROTOCOL_VERSION_META_KEY] = "not-a-date"
    assert self._status(meta) == 400

  def test_malformed_client_info_maps_to_400(self):
    meta = valid_meta()
    meta[CLIENT_INFO_META_KEY] = {"name": "c"}  # missing REQUIRED version
    assert self._status(meta) == 400


# ─── S05-RQ-19 — logLevel absent ⇒ no log notifications (R-4.3-l/m) ─────────────


class TestLogLevelAbsentSuppressesEmission:
  """When a request's ``_meta`` carries no ``io.modelcontextprotocol/logLevel`` opt-in, the
  server emits NO log notifications for that request; a present recognized value sets the
  minimum severity. ``resolved_min_log_level_index`` returns ``-1`` (emit nothing) for an
  absent or invalid value, and the level's ascending-severity index otherwise. Live
  emission gating lives in the logging suite; this pins the S05 rule itself. (S05-RQ-19;
  R-4.3-l, R-4.3-m, R-15.3.3-a)
  """

  def test_absent_log_level_emits_nothing(self):
    # An absent key reads as None from _meta → -1 → no notification emitted.
    meta = valid_meta()
    assert LOG_LEVEL_META_KEY not in meta
    assert resolved_min_log_level_index(meta.get(LOG_LEVEL_META_KEY)) == -1
    assert resolved_min_log_level_index(None) == -1

  def test_invalid_log_level_emits_nothing(self):
    assert resolved_min_log_level_index("verbose") == -1

  def test_present_log_level_sets_minimum_severity(self):
    assert resolved_min_log_level_index("warning") == logging_level_index("warning")
    assert resolved_min_log_level_index("debug") == 0
