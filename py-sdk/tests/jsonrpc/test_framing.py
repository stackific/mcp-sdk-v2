"""Tests for JSON-RPC 2.0 framing + classification (§3.1–§3.5)."""

import pytest

from mcp.jsonrpc.framing import (
  InFlightTracker,
  MalformedMessageError,
  classify_message,
  id_echo_matches,
  is_request_id,
)
from mcp.json.value import SAFE_INTEGER_MAX


class TestIsRequestId:
  def test_string_and_safe_int(self):
    assert is_request_id("abc")
    assert is_request_id(0)
    assert is_request_id(SAFE_INTEGER_MAX)

  def test_rejects_unsafe_int_bool_none_float(self):
    assert not is_request_id(SAFE_INTEGER_MAX + 1)
    assert not is_request_id(True)
    assert not is_request_id(None)
    assert not is_request_id(1.5)


class TestClassifyHappyPaths:
  def test_request(self):
    c = classify_message({"jsonrpc": "2.0", "id": 1, "method": "ping"})
    assert c.kind == "request"

  def test_request_with_params(self):
    c = classify_message({"jsonrpc": "2.0", "id": "x", "method": "m", "params": {"a": 1}})
    assert c.kind == "request"

  def test_notification(self):
    c = classify_message({"jsonrpc": "2.0", "method": "note"})
    assert c.kind == "notification"

  def test_result_response(self):
    c = classify_message({"jsonrpc": "2.0", "id": 1, "result": {"resultType": "complete"}})
    assert c.kind == "result-response"

  def test_error_response_with_id(self):
    c = classify_message({"jsonrpc": "2.0", "id": 1, "error": {"code": -32600, "message": "x"}})
    assert c.kind == "error-response"

  def test_error_response_without_id(self):
    c = classify_message({"jsonrpc": "2.0", "error": {"code": -32700, "message": "x"}})
    assert c.kind == "error-response"


class TestClassifyRejections:
  def test_batch_array(self):
    with pytest.raises(MalformedMessageError):
      classify_message([{"jsonrpc": "2.0", "id": 1, "method": "m"}])

  def test_non_object(self):
    with pytest.raises(MalformedMessageError):
      classify_message("not an object")

  def test_missing_jsonrpc(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"id": 1, "method": "m"})

  def test_wrong_jsonrpc_version(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": 2.0, "id": 1, "method": "m"})

  def test_method_with_result(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0", "id": 1, "method": "m", "result": {}})

  def test_result_and_error(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0", "id": 1, "result": {}, "error": {}})

  def test_notification_with_id_is_rejected(self):
    # method + id classifies as a request; to hit the notification-id rule we must
    # have method, no result/error, but the id rule lives in request validation.
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0", "id": None, "method": "m"})

  def test_request_method_not_string(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0", "id": 1, "method": 5})

  def test_params_must_be_object(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0", "id": 1, "method": "m", "params": [1, 2]})

  def test_error_response_null_id_rejected(self):
    # The framing schema does not accept null id; transport builds that directly.
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0", "id": None, "error": {"code": -1, "message": "x"}})

  def test_result_must_be_object(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0", "id": 1, "result": "nope"})

  def test_unclassifiable(self):
    with pytest.raises(MalformedMessageError):
      classify_message({"jsonrpc": "2.0"})


class TestIdEcho:
  def test_matches_same_type_and_value(self):
    assert id_echo_matches(1, 1)
    assert id_echo_matches("a", "a")

  def test_no_coercion(self):
    assert not id_echo_matches(1, "1")
    assert not id_echo_matches("1", 1)
    assert not id_echo_matches(1, 2)


class TestInFlightTracker:
  def test_register_has_complete(self):
    t = InFlightTracker()
    assert not t.has(1)
    t.register(1)
    assert t.has(1)
    assert t.size == 1
    t.complete(1)
    assert not t.has(1)
    assert t.size == 0

  def test_duplicate_register_raises(self):
    t = InFlightTracker()
    t.register("x")
    with pytest.raises(ValueError):
      t.register("x")

  def test_string_and_number_ids_are_distinct(self):
    t = InFlightTracker()
    t.register(1)
    t.register("1")  # different JSON type — must not collide
    assert t.size == 2
    assert set(map(type, t.outstanding)) == {int, str}

  def test_complete_untracked_is_safe(self):
    t = InFlightTracker()
    t.complete(99)  # no raise
    assert t.size == 0
