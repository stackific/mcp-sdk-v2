"""Tests for payload shapes (§3.6–§3.9)."""

from mcp.jsonrpc.payload import (
  RESULT_TYPE_COMPLETE,
  RESULT_TYPE_INPUT_REQUIRED,
  McpError,
  interpret_result_type,
  is_cursor,
  is_known_result_type,
  is_progress_token,
  is_valid_empty_result,
  is_valid_mcp_error,
  is_valid_notification_params,
  is_valid_request_params,
  is_valid_result,
)


class TestResultType:
  def test_known_values(self):
    assert is_known_result_type(RESULT_TYPE_COMPLETE)
    assert is_known_result_type(RESULT_TYPE_INPUT_REQUIRED)
    assert not is_known_result_type("something-else")

  def test_interpret_explicit(self):
    out = interpret_result_type({"resultType": "input_required"})
    assert out.recognized and out.result_type == "input_required"

  def test_interpret_absent_defaults_to_complete(self):
    out = interpret_result_type({})
    assert out.recognized and out.result_type == RESULT_TYPE_COMPLETE

  def test_interpret_null_defaults_to_complete(self):
    out = interpret_result_type({"resultType": None})
    assert out.recognized and out.result_type == RESULT_TYPE_COMPLETE

  def test_interpret_unknown_not_recognized(self):
    out = interpret_result_type({"resultType": "frobnicate"})
    assert not out.recognized and out.result_type == "frobnicate"


class TestProgressTokenAndCursor:
  def test_progress_token_accepts_string_and_number(self):
    assert is_progress_token("tok")
    assert is_progress_token(7)
    assert is_progress_token(7.5)  # need not be an integer

  def test_progress_token_rejects_bool_and_none(self):
    assert not is_progress_token(True)
    assert not is_progress_token(None)

  def test_cursor_is_string_only(self):
    assert is_cursor("opaque")
    assert not is_cursor(123)


class TestResultValidators:
  def test_valid_result(self):
    assert is_valid_result({"resultType": "complete"})
    assert is_valid_result({"resultType": "complete", "_meta": {}, "extra": 1})

  def test_invalid_result(self):
    assert not is_valid_result({"resultType": 5})
    assert not is_valid_result({"resultType": "complete", "_meta": []})
    assert not is_valid_result("nope")

  def test_empty_result_rejects_extra_members(self):
    assert is_valid_empty_result({"resultType": "complete"})
    assert is_valid_empty_result({"resultType": "complete", "_meta": {}})
    assert not is_valid_empty_result({"resultType": "complete", "extra": 1})


class TestParams:
  def test_request_params_require_meta(self):
    assert is_valid_request_params({"_meta": {"x": 1}})
    assert not is_valid_request_params({})
    assert not is_valid_request_params({"_meta": "no"})

  def test_notification_params_meta_optional(self):
    assert is_valid_notification_params({})
    assert is_valid_notification_params({"_meta": {}})
    assert not is_valid_notification_params({"_meta": 1})


class TestMcpError:
  def test_dataclass(self):
    e = McpError(code=-32600, message="bad")
    assert e.code == -32600 and e.message == "bad" and e.data is None

  def test_validator(self):
    assert is_valid_mcp_error({"code": -32600, "message": "x"})
    assert is_valid_mcp_error({"code": -1, "message": "x", "data": {"k": 1}})
    assert not is_valid_mcp_error({"code": "x", "message": "x"})
    assert not is_valid_mcp_error({"code": -1})
