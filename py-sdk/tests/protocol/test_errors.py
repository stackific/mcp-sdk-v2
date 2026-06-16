"""Tests for the §22 error-handling model + error-code registry (S34).

Mirrors the TS suite ``src/__tests__/protocol/errors.test.ts``, AC-mapped:

  AC-34.1  (R-22.1-a)            — exactly one of result/error.
  AC-34.2  (R-22.1-d)            — jsonrpc is exactly "2.0".
  AC-34.3/.4 (R-22.1-b/e/f)      — error id echoes request id; undeterminable → null.
  AC-34.5  (R-22.1-g, R-22.6-i)  — notification → no response.
  AC-34.6  (R-22.1-c/h/i)        — code integer + message string.
  AC-34.7  (R-22.1-j)            — code authoritative, not message text.
  AC-34.8  (R-22.1-k, R-22.3-a)  — data optional / normative shapes.
  AC-34.9  (R-22.2-a..f)         — standard condition → code.
  AC-34.10/.11 (R-22.2-g/h)      — capability gating codes.
  AC-34.12/.13/.14 (R-22.3)      — normative -32003/-32004 data + client retry.
  AC-34.15/.16/.17 (R-22.4)      — -32602 conditions; resource-not-found; -32603 fallback.
  AC-34.18 (R-22.5)              — protocol error vs error result.
  AC-34.19..22 (R-22.6)          — transport / HTTP-status mapping.
  AC-34.23 (R-22.7-a..d)         — extension code rules.
  AC-34.24 (R-22.7-e)            — unknown code surfaced, not rejected.
  AC-34.25 (R-22-a)              — registry exactness & classification.
"""

from mcp.protocol.errors import (
  ERROR_CODE_REGISTRY,
  HEADER_MISMATCH_CODE,
  INTERNAL_ERROR_CODE,
  INVALID_CURSOR_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  JSON_RPC_RESERVED_RANGE,
  JSONRPC_VERSION,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  PARSE_ERROR_CODE,
  RESERVED_ERROR_CODES,
  RESOURCE_NOT_FOUND_LEGACY_CODE,
  SERVER_ERROR_RANGE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  ErrorCodeClass,
  ToolFailureMechanism,
  build_error_object,
  build_null_id_parse_error_response,
  build_resource_not_found_params_error,
  classify_error_code,
  classify_tool_call_failure,
  describe_unknown_error_code,
  error_code_for_inbound_failure,
  has_exactly_result_or_error,
  http_status_for_registry_code,
  is_error_code_in_class,
  is_reserved_error_code,
  is_valid_error_object,
  is_valid_error_response,
  lookup_error_code,
  suppresses_error_response,
  validate_extension_error_code,
)
from mcp.protocol.negotiation import reselect_after_unsupported_version


class TestConstants:
  def test_values(self):
    assert PARSE_ERROR_CODE == -32700
    assert INVALID_REQUEST_CODE == -32600
    assert METHOD_NOT_FOUND_CODE == -32601
    assert INVALID_PARAMS_CODE == -32602
    assert INTERNAL_ERROR_CODE == -32603
    assert MISSING_CLIENT_CAPABILITY_CODE == -32003
    assert UNSUPPORTED_PROTOCOL_VERSION_CODE == -32004
    assert HEADER_MISMATCH_CODE == -32001

  def test_invalid_cursor_is_invalid_params(self):
    # -32602 invalid-cursor is the same params code (no duplicate value). (AC-34.15)
    assert INVALID_CURSOR_CODE == INVALID_PARAMS_CODE


# ─── AC-34.1 — exactly one of result/error (R-22.1-a) ─────────────────────────


class TestExactlyResultOrError:
  def test_accepts_error_only_and_result_only(self):
    assert has_exactly_result_or_error(
      {"jsonrpc": "2.0", "id": 1, "error": {"code": -32603, "message": "x"}}
    )
    assert has_exactly_result_or_error({"jsonrpc": "2.0", "id": 1, "result": {}})

  def test_rejects_both_or_neither(self):
    assert not has_exactly_result_or_error(
      {"jsonrpc": "2.0", "id": 1, "result": {}, "error": {"code": -1, "message": "x"}}
    )
    assert not has_exactly_result_or_error({"jsonrpc": "2.0", "id": 1})

  def test_compat_minimal_shapes(self):
    assert has_exactly_result_or_error({"result": {}})
    assert has_exactly_result_or_error({"error": {}})
    assert not has_exactly_result_or_error({"result": {}, "error": {}})
    assert not has_exactly_result_or_error({})

  def test_non_object_rejected(self):
    assert not has_exactly_result_or_error(None)
    assert not has_exactly_result_or_error([1])


# ─── AC-34.2 / AC-34.3 / AC-34.4 — jsonrpc + id rules ─────────────────────────


class TestErrorResponseEnvelope:
  def test_jsonrpc_literal_and_marker_rejection(self):
    assert JSONRPC_VERSION == "2.0"
    assert is_valid_error_response({"jsonrpc": "2.0", "id": 1, "error": {"code": -32603, "message": "x"}})
    assert not is_valid_error_response({"jsonrpc": "1.0", "id": 1, "error": {"code": -32603, "message": "x"}})
    assert not is_valid_error_response({"jsonrpc": 2.0, "id": 1, "error": {"code": -32603, "message": "x"}})

  def test_accepts_string_or_integer_id(self):
    assert is_valid_error_response({"jsonrpc": "2.0", "id": "X", "error": {"code": -32602, "message": "x"}})
    assert is_valid_error_response({"jsonrpc": "2.0", "id": 7, "error": {"code": -32602, "message": "x"}})

  def test_allows_null_id_via_builder(self):
    # AC-34.4: a null id is the only exception (undeterminable request id).
    res = build_null_id_parse_error_response()
    assert res["id"] is None
    assert res["error"]["code"] == PARSE_ERROR_CODE
    assert is_valid_error_response(res)

  def test_rejects_non_string_non_integer_non_null_id(self):
    assert not is_valid_error_response({"jsonrpc": "2.0", "id": 1.5, "error": {"code": -32602, "message": "x"}})
    assert not is_valid_error_response({"jsonrpc": "2.0", "id": {}, "error": {"code": -32602, "message": "x"}})

  def test_compat_shapes(self):
    assert is_valid_error_response({"jsonrpc": "2.0", "id": 1, "error": {"code": -1, "message": "x"}})
    assert is_valid_error_response({"jsonrpc": "2.0", "id": None, "error": {"code": -1, "message": "x"}})
    assert not is_valid_error_response({"jsonrpc": "1.0", "error": {"code": -1, "message": "x"}})
    assert not is_valid_error_response(
      {"jsonrpc": "2.0", "result": {}, "error": {"code": -1, "message": "x"}}
    )
    assert not is_valid_error_response({"jsonrpc": "2.0", "id": 1.5, "error": {"code": -1, "message": "x"}})

  def test_bool_id_rejected(self):
    # A bool is not an integer id.
    assert not is_valid_error_response({"jsonrpc": "2.0", "id": True, "error": {"code": -1, "message": "x"}})


# ─── AC-34.5 — notifications get no response (R-22.1-g, R-22.6-i) ──────────────


class TestSuppression:
  def test_notification_suppresses(self):
    assert suppresses_error_response({"jsonrpc": "2.0", "method": "note"})
    assert suppresses_error_response({"jsonrpc": "2.0", "method": "notifications/progress"})

  def test_request_and_response_do_not(self):
    assert not suppresses_error_response({"jsonrpc": "2.0", "id": 1, "method": "m"})
    assert not suppresses_error_response({"jsonrpc": "2.0", "id": 1, "result": {}})

  def test_non_object_does_not_suppress(self):
    assert not suppresses_error_response(None)
    assert not suppresses_error_response(42)


# ─── AC-34.6 / AC-34.8 — error object shape ───────────────────────────────────


class TestErrorObject:
  def test_is_valid_error_object(self):
    assert is_valid_error_object({"code": -32600, "message": "x"})
    assert not is_valid_error_object({"code": "x", "message": "x"})
    assert not is_valid_error_object({"code": True, "message": "x"})  # bool is not an int code
    assert not is_valid_error_object({"code": -1})

  def test_requires_integer_code_and_string_message(self):
    assert is_valid_error_object({"code": -32602, "message": "Invalid params"})
    assert is_valid_error_object({"code": 12345, "message": "ext"})  # extension positive code
    assert not is_valid_error_object({"code": -32602})  # missing message
    assert not is_valid_error_object({"message": "x"})  # missing code
    assert not is_valid_error_object({"code": -32.5, "message": "x"})  # non-integer code
    assert not is_valid_error_object({"code": -32602, "message": 7})  # non-string message

  def test_non_object_rejected(self):
    assert not is_valid_error_object(None)
    assert not is_valid_error_object([{"code": -1, "message": "x"}])

  def test_sender_defined_data_tolerated_absent(self):
    assert ERROR_CODE_REGISTRY[PARSE_ERROR_CODE].data_policy == "sender-defined"
    assert is_valid_error_object({"code": -32700, "message": "Parse error"})

  def test_normative_data_pins_keys(self):
    assert ERROR_CODE_REGISTRY[MISSING_CLIENT_CAPABILITY_CODE].data_policy == "normative"
    assert ERROR_CODE_REGISTRY[MISSING_CLIENT_CAPABILITY_CODE].data_keys == ("requiredCapabilities",)
    assert ERROR_CODE_REGISTRY[UNSUPPORTED_PROTOCOL_VERSION_CODE].data_policy == "normative"
    assert ERROR_CODE_REGISTRY[UNSUPPORTED_PROTOCOL_VERSION_CODE].data_keys == ("supported", "requested")


# ─── AC-34.7 — code authoritative, not message (R-22.1-j) ─────────────────────


class TestCodeAuthoritative:
  def test_classification_varies_with_code_not_message(self):
    a = describe_unknown_error_code({"code": 70001, "message": "one"})
    b = describe_unknown_error_code({"code": 70001, "message": "a totally different message"})
    assert a["error_class"] == b["error_class"]
    assert a["code"] == b["code"]
    assert classify_error_code(INVALID_PARAMS_CODE) is ErrorCodeClass.JSON_RPC_STANDARD


# ─── AC-34.9 / AC-34.10 / AC-34.11 — standard conditions + gating ─────────────


class TestStandardConditions:
  def test_maps_each_standard_condition_to_code(self):
    assert error_code_for_inbound_failure("unparseable-json") == -32700
    assert error_code_for_inbound_failure("invalid-request-object") == -32600
    assert METHOD_NOT_FOUND_CODE == -32601
    assert error_code_for_inbound_failure("invalid-metadata") == -32602
    assert INTERNAL_ERROR_CODE == -32603

  def test_all_five_standard_codes_are_json_rpc_standard(self):
    for code in (-32700, -32600, -32601, -32602, -32603):
      assert lookup_error_code(code).error_class is ErrorCodeClass.JSON_RPC_STANDARD

  def test_unadvertised_server_capability_is_method_not_found(self):
    assert METHOD_NOT_FOUND_CODE == -32601
    assert METHOD_NOT_FOUND_CODE != MISSING_CLIENT_CAPABILITY_CODE

  def test_required_client_capability_uses_32003_not_32601(self):
    assert MISSING_CLIENT_CAPABILITY_CODE == -32003
    assert MISSING_CLIENT_CAPABILITY_CODE != METHOD_NOT_FOUND_CODE


# ─── AC-34.12 / AC-34.13 / AC-34.14 — normative data + client retry ───────────


class TestNormativeData:
  def test_32003_pins_required_capabilities(self):
    entry = ERROR_CODE_REGISTRY[MISSING_CLIENT_CAPABILITY_CODE]
    assert entry.name == "MissingRequiredClientCapability"
    assert "requiredCapabilities" in entry.data_keys

  def test_32004_pins_supported_and_requested(self):
    entry = ERROR_CODE_REGISTRY[UNSUPPORTED_PROTOCOL_VERSION_CODE]
    assert entry.name == "UnsupportedProtocolVersion"
    assert entry.data_keys == ("supported", "requested")

  def test_client_reselects_mutually_supported_revision(self):
    error = {
      "code": UNSUPPORTED_PROTOCOL_VERSION_CODE,
      "message": "Unsupported protocol version",
      "data": {"supported": ["2026-07-28", "2025-01-01"], "requested": "1999-01-01"},
    }
    result = reselect_after_unsupported_version(error, ["2026-07-28"])
    assert result.ok and result.selected == "2026-07-28"


# ─── AC-34.15 / AC-34.16 / AC-34.17 — -32602 conditions + -32603 fallback ─────


class TestParamsConditions:
  def test_validation_failures_collapse_to_32602(self):
    assert INVALID_PARAMS_CODE == -32602
    assert INVALID_CURSOR_CODE == -32602
    assert build_resource_not_found_params_error("file:///x.txt")["code"] == -32602

  def test_resource_not_found_carries_uri_not_empty_contents(self):
    err = build_resource_not_found_params_error("file:///nonexistent.txt")
    assert err == {"code": -32602, "message": "Resource not found", "data": {"uri": "file:///nonexistent.txt"}}
    assert "contents" not in err

  def test_unexpected_server_side_is_32603(self):
    assert INTERNAL_ERROR_CODE == -32603
    assert INTERNAL_ERROR_CODE != INVALID_PARAMS_CODE


# ─── AC-34.18 — protocol error vs feature-level error result (R-22.5) ─────────


class TestToolFailureAndTransport:
  def test_classify_tool_call_failure(self):
    assert classify_tool_call_failure("unknown-tool") is ToolFailureMechanism.PROTOCOL_ERROR
    assert classify_tool_call_failure("invalid-arguments") is ToolFailureMechanism.PROTOCOL_ERROR
    assert classify_tool_call_failure("execution-failure") is ToolFailureMechanism.ERROR_RESULT

  def test_mapping_is_never_the_reverse(self):
    assert classify_tool_call_failure("execution-failure") is not ToolFailureMechanism.PROTOCOL_ERROR
    assert classify_tool_call_failure("unknown-tool") is not ToolFailureMechanism.ERROR_RESULT

  def test_http_status_for_registry_code(self):
    assert http_status_for_registry_code(UNSUPPORTED_PROTOCOL_VERSION_CODE) == 400
    assert http_status_for_registry_code(PARSE_ERROR_CODE) is None

  # AC-34.19 / AC-34.20 / AC-34.21 / AC-34.22 — transport mapping
  def test_32003_and_32004_map_to_http_400(self):
    assert http_status_for_registry_code(MISSING_CLIENT_CAPABILITY_CODE) == 400
    assert http_status_for_registry_code(UNSUPPORTED_PROTOCOL_VERSION_CODE) == 400

  def test_routing_header_is_32001_and_http_400(self):
    assert error_code_for_inbound_failure("routing-header") == HEADER_MISMATCH_CODE
    assert http_status_for_registry_code(HEADER_MISMATCH_CODE) == 400

  def test_invalid_request_and_bad_metadata(self):
    assert error_code_for_inbound_failure("invalid-request-object") == -32600
    assert error_code_for_inbound_failure("invalid-metadata") == -32602

  def test_unparseable_and_non_request(self):
    assert error_code_for_inbound_failure("unparseable-json") == -32700
    assert error_code_for_inbound_failure("invalid-request-object") == -32600

  def test_codes_without_http_overlay_return_none(self):
    assert http_status_for_registry_code(PARSE_ERROR_CODE) is None
    assert http_status_for_registry_code(INVALID_PARAMS_CODE) is None

  def test_error_code_for_inbound_failure(self):
    assert error_code_for_inbound_failure("unparseable-json") == PARSE_ERROR_CODE
    assert error_code_for_inbound_failure("invalid-request-object") == INVALID_REQUEST_CODE
    assert error_code_for_inbound_failure("routing-header") == HEADER_MISMATCH_CODE
    assert error_code_for_inbound_failure("invalid-metadata") == INVALID_PARAMS_CODE


# ─── AC-34.23 — extension code rules (R-22.7-a..d) ────────────────────────────


class TestReservedAndExtension:
  def test_is_reserved(self):
    assert is_reserved_error_code(PARSE_ERROR_CODE)
    assert not is_reserved_error_code(1000)

  def test_reserved_set_is_exactly_eight(self):
    assert sorted(RESERVED_ERROR_CODES) == sorted(
      [-32700, -32603, -32602, -32601, -32600, -32004, -32003, -32001]
    )

  def test_accepts_non_reserved_integer_outside_range(self):
    assert validate_extension_error_code(1000).ok
    assert validate_extension_error_code(-31999).ok

  def test_rejects_non_integers_and_reserved_collisions(self):
    bad_int = validate_extension_error_code(1.5)
    assert not bad_int.ok and bad_int.reason == "not-an-integer"
    for code in RESERVED_ERROR_CODES:
      r = validate_extension_error_code(code)
      assert not r.ok and r.reason == "collides-with-reserved"
    assert is_reserved_error_code(-32700)
    assert not is_reserved_error_code(1000)

  def test_validate_extension_code_compat(self):
    assert validate_extension_error_code(1000).ok
    bad_int = validate_extension_error_code(1.5)
    assert not bad_int.ok and bad_int.reason == "not-an-integer"
    bad_res = validate_extension_error_code(PARSE_ERROR_CODE)
    assert not bad_res.ok and bad_res.reason == "collides-with-reserved"


# ─── AC-34.24 — unknown codes tolerated, not rejected (R-22.7-e) ──────────────


class TestUnknownCodes:
  def test_surfaces_unknown_code_with_message_and_data(self):
    d = describe_unknown_error_code({"code": 424242, "message": "custom", "data": {"detail": 1}})
    assert d == {
      "failed": True,
      "code": 424242,
      "error_class": ErrorCodeClass.EXTENSION_DEFINED,
      "message": "custom",
      "data": {"detail": 1},
    }

  def test_omits_data_when_none_and_never_marks_malformed(self):
    d = describe_unknown_error_code({"code": 424242, "message": "custom"})
    assert d["failed"] is True
    assert "data" not in d

  def test_describe_unknown_error_code_compat(self):
    d = describe_unknown_error_code({"code": 4242, "message": "weird", "data": {"k": 1}})
    assert d["failed"] is True
    assert d["code"] == 4242
    assert d["error_class"] is ErrorCodeClass.EXTENSION_DEFINED
    assert d["message"] == "weird"
    assert d["data"] == {"k": 1}


# ─── AC-34.25 — registry exactness & classification (R-22-a) ──────────────────


class TestClassify:
  def test_registry_codes(self):
    assert classify_error_code(PARSE_ERROR_CODE) is ErrorCodeClass.JSON_RPC_STANDARD
    assert classify_error_code(UNSUPPORTED_PROTOCOL_VERSION_CODE) is ErrorCodeClass.MCP_PROTOCOL
    assert classify_error_code(HEADER_MISMATCH_CODE) is ErrorCodeClass.SERVER_DEFINED

  def test_unknown_server_range(self):
    assert classify_error_code(-32050) is ErrorCodeClass.SERVER_DEFINED

  def test_unknown_reserved_range(self):
    assert classify_error_code(-32500) is ErrorCodeClass.JSON_RPC_STANDARD

  def test_extension_defined(self):
    assert classify_error_code(1000) is ErrorCodeClass.EXTENSION_DEFINED
    assert classify_error_code(-40000) is ErrorCodeClass.EXTENSION_DEFINED

  def test_classifies_every_range(self):
    assert classify_error_code(HEADER_MISMATCH_CODE) is ErrorCodeClass.SERVER_DEFINED
    assert classify_error_code(-32050) is ErrorCodeClass.SERVER_DEFINED
    assert classify_error_code(MISSING_CLIENT_CAPABILITY_CODE) is ErrorCodeClass.MCP_PROTOCOL
    assert classify_error_code(-32700) is ErrorCodeClass.JSON_RPC_STANDARD
    assert classify_error_code(-32500) is ErrorCodeClass.JSON_RPC_STANDARD
    assert classify_error_code(5000) is ErrorCodeClass.EXTENSION_DEFINED

  def test_every_registry_row_reports_its_own_code(self):
    for key, entry in ERROR_CODE_REGISTRY.items():
      assert entry.code == key
      assert entry.name == entry.name.strip()
      assert len(entry.name) > 0

  def test_ranges_have_correct_bounds(self):
    assert (JSON_RPC_RESERVED_RANGE.min, JSON_RPC_RESERVED_RANGE.max) == (-32768, -32000)
    assert (SERVER_ERROR_RANGE.min, SERVER_ERROR_RANGE.max) == (-32099, -32000)

  def test_legacy_resource_not_found_literal(self):
    assert RESOURCE_NOT_FOUND_LEGACY_CODE == -32002
    assert ERROR_CODE_REGISTRY[RESOURCE_NOT_FOUND_LEGACY_CODE].name == "Resource not found"
    assert lookup_error_code(-32002).error_class is ErrorCodeClass.MCP_PROTOCOL


class TestIsErrorCodeInClass:
  def test_is_error_code_in_class(self):
    assert is_error_code_in_class(-32050, ErrorCodeClass.SERVER_DEFINED)
    assert not is_error_code_in_class(-32700, ErrorCodeClass.SERVER_DEFINED)
    assert is_error_code_in_class(1000, ErrorCodeClass.EXTENSION_DEFINED)
    assert is_error_code_in_class(PARSE_ERROR_CODE, ErrorCodeClass.JSON_RPC_STANDARD)
    assert not is_error_code_in_class(1.5, ErrorCodeClass.EXTENSION_DEFINED)

  def test_membership_full(self):
    assert is_error_code_in_class(-32001, ErrorCodeClass.SERVER_DEFINED)
    assert not is_error_code_in_class(-32700, ErrorCodeClass.SERVER_DEFINED)
    assert is_error_code_in_class(9000, ErrorCodeClass.EXTENSION_DEFINED)
    assert not is_error_code_in_class(-32602, ErrorCodeClass.EXTENSION_DEFINED)
    assert is_error_code_in_class(-32602, ErrorCodeClass.JSON_RPC_STANDARD)
    assert is_error_code_in_class(-32003, ErrorCodeClass.MCP_PROTOCOL)


class TestBuilders:
  def test_build_error_object_default_message_from_registry(self):
    e = build_error_object(METHOD_NOT_FOUND_CODE)
    assert e == {"code": METHOD_NOT_FOUND_CODE, "message": "Method not found"}

  def test_build_error_object_parse_error_default_message(self):
    assert build_error_object(PARSE_ERROR_CODE)["message"] == "Parse error"

  def test_build_error_object_with_message_and_data(self):
    e = build_error_object(-32000, "boom", {"x": 1})
    assert e == {"code": -32000, "message": "boom", "data": {"x": 1}}

  def test_build_error_object_unknown_code_default_message(self):
    assert build_error_object(99999)["message"] == "Error"
    assert build_error_object(-99999)["message"] == "Error"

  def test_build_error_object_omits_data_when_absent(self):
    assert "data" not in build_error_object(INVALID_PARAMS_CODE, "bad")
    assert build_error_object(INVALID_PARAMS_CODE, "bad", {"k": 1}) == {
      "code": -32602,
      "message": "bad",
      "data": {"k": 1},
    }

  def test_resource_not_found(self):
    e = build_resource_not_found_params_error("file:///x")
    assert e == {"code": INVALID_PARAMS_CODE, "message": "Resource not found", "data": {"uri": "file:///x"}}

  def test_null_id_parse_error(self):
    r = build_null_id_parse_error_response()
    assert r == {"jsonrpc": "2.0", "id": None, "error": {"code": PARSE_ERROR_CODE, "message": "Parse error"}}

  def test_describe_unknown_error_code(self):
    d = describe_unknown_error_code({"code": 4242, "message": "weird", "data": {"k": 1}})
    assert d["failed"] is True
    assert d["code"] == 4242
    assert d["error_class"] is ErrorCodeClass.EXTENSION_DEFINED
    assert d["message"] == "weird"
    assert d["data"] == {"k": 1}


class TestLookup:
  def test_lookup(self):
    assert lookup_error_code(PARSE_ERROR_CODE).name == "Parse error"
    assert lookup_error_code(99999) is None

  def test_lookup_returns_none_for_unregistered(self):
    assert lookup_error_code(123456) is None
