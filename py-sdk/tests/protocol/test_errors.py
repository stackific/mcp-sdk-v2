"""Tests for the §22 error-handling model + error-code registry."""

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  PARSE_ERROR_CODE,
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


class TestClassify:
  def test_registry_codes(self):
    assert classify_error_code(PARSE_ERROR_CODE) is ErrorCodeClass.JSON_RPC_STANDARD
    assert classify_error_code(UNSUPPORTED_PROTOCOL_VERSION_CODE) is ErrorCodeClass.MCP_PROTOCOL
    assert classify_error_code(HEADER_MISMATCH_CODE) is ErrorCodeClass.SERVER_DEFINED

  def test_unknown_server_range(self):
    assert classify_error_code(-32050) is ErrorCodeClass.SERVER_DEFINED

  def test_unknown_reserved_range(self):
    # Inside JSON-RPC reserved range but not server-error sub-range, not registered.
    assert classify_error_code(-32500) is ErrorCodeClass.JSON_RPC_STANDARD

  def test_extension_defined(self):
    assert classify_error_code(1000) is ErrorCodeClass.EXTENSION_DEFINED
    assert classify_error_code(-40000) is ErrorCodeClass.EXTENSION_DEFINED


class TestReservedAndExtension:
  def test_is_reserved(self):
    assert is_reserved_error_code(PARSE_ERROR_CODE)
    assert not is_reserved_error_code(1000)

  def test_validate_extension_code(self):
    assert validate_extension_error_code(1000).ok
    bad_int = validate_extension_error_code(1.5)
    assert not bad_int.ok and bad_int.reason == "not-an-integer"
    bad_res = validate_extension_error_code(PARSE_ERROR_CODE)
    assert not bad_res.ok and bad_res.reason == "collides-with-reserved"

  def test_is_error_code_in_class(self):
    assert is_error_code_in_class(-32050, ErrorCodeClass.SERVER_DEFINED)
    assert not is_error_code_in_class(-32700, ErrorCodeClass.SERVER_DEFINED)
    assert is_error_code_in_class(1000, ErrorCodeClass.EXTENSION_DEFINED)
    assert is_error_code_in_class(PARSE_ERROR_CODE, ErrorCodeClass.JSON_RPC_STANDARD)
    assert not is_error_code_in_class(1.5, ErrorCodeClass.EXTENSION_DEFINED)


class TestErrorObject:
  def test_is_valid_error_object(self):
    assert is_valid_error_object({"code": -32600, "message": "x"})
    assert not is_valid_error_object({"code": "x", "message": "x"})
    assert not is_valid_error_object({"code": True, "message": "x"})  # bool is not an int code
    assert not is_valid_error_object({"code": -1})

  def test_has_exactly_result_or_error(self):
    assert has_exactly_result_or_error({"result": {}})
    assert has_exactly_result_or_error({"error": {}})
    assert not has_exactly_result_or_error({"result": {}, "error": {}})
    assert not has_exactly_result_or_error({})

  def test_is_valid_error_response(self):
    assert is_valid_error_response({"jsonrpc": "2.0", "id": 1, "error": {"code": -1, "message": "x"}})
    assert is_valid_error_response({"jsonrpc": "2.0", "id": None, "error": {"code": -1, "message": "x"}})
    assert not is_valid_error_response({"jsonrpc": "1.0", "error": {"code": -1, "message": "x"}})
    assert not is_valid_error_response({"jsonrpc": "2.0", "result": {}, "error": {"code": -1, "message": "x"}})
    assert not is_valid_error_response({"jsonrpc": "2.0", "id": 1.5, "error": {"code": -1, "message": "x"}})


class TestSuppression:
  def test_notification_suppresses(self):
    assert suppresses_error_response({"jsonrpc": "2.0", "method": "note"})

  def test_request_and_response_do_not(self):
    assert not suppresses_error_response({"jsonrpc": "2.0", "id": 1, "method": "m"})
    assert not suppresses_error_response({"jsonrpc": "2.0", "id": 1, "result": {}})


class TestBuilders:
  def test_build_error_object_default_message_from_registry(self):
    e = build_error_object(METHOD_NOT_FOUND_CODE)
    assert e == {"code": METHOD_NOT_FOUND_CODE, "message": "Method not found"}

  def test_build_error_object_with_message_and_data(self):
    e = build_error_object(-32000, "boom", {"x": 1})
    assert e == {"code": -32000, "message": "boom", "data": {"x": 1}}

  def test_build_error_object_unknown_code_default_message(self):
    assert build_error_object(99999)["message"] == "Error"

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


class TestToolFailureAndTransport:
  def test_classify_tool_call_failure(self):
    assert classify_tool_call_failure("unknown-tool") is ToolFailureMechanism.PROTOCOL_ERROR
    assert classify_tool_call_failure("invalid-arguments") is ToolFailureMechanism.PROTOCOL_ERROR
    assert classify_tool_call_failure("execution-failure") is ToolFailureMechanism.ERROR_RESULT

  def test_http_status_for_registry_code(self):
    assert http_status_for_registry_code(UNSUPPORTED_PROTOCOL_VERSION_CODE) == 400
    assert http_status_for_registry_code(PARSE_ERROR_CODE) is None

  def test_error_code_for_inbound_failure(self):
    assert error_code_for_inbound_failure("unparseable-json") == PARSE_ERROR_CODE
    assert error_code_for_inbound_failure("invalid-request-object") == INVALID_REQUEST_CODE
    assert error_code_for_inbound_failure("routing-header") == HEADER_MISMATCH_CODE
    assert error_code_for_inbound_failure("invalid-metadata") == INVALID_PARAMS_CODE

  def test_lookup(self):
    assert lookup_error_code(PARSE_ERROR_CODE).name == "Parse error"
    assert lookup_error_code(99999) is None
