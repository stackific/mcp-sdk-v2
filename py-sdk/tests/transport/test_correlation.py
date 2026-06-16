"""Conformance tests for the request↔response correlator (§7.2, §7.5).

Covers every export of :mod:`mcp.transport.correlation`:

* :class:`RequestCorrelator` — issue/deliver/fail/fail_all, id-only matching, ordering
  independence, multiplexing, reuse rejection, bookkeeping (``has``/``size``/
  ``outstanding``), and the disconnection rule.
* :data:`PARSE_ERROR_CODE`, :func:`build_parse_error_response`,
  :func:`is_acceptable_malformed_id_error_response`, :func:`id_echo_matches`.
"""

from concurrent.futures import Future

import pytest

from mcp.client.transport import ClientTransportError
from mcp.transport.correlation import (
  PARSE_ERROR_CODE,
  RequestCorrelator,
  build_parse_error_response,
  id_echo_matches,
  is_acceptable_malformed_id_error_response,
)


def _result(id_, value=None):
  return {"jsonrpc": "2.0", "id": id_, "result": value or {}}


def _error(id_, code=-32601, message="nope"):
  return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


class TestIssue:
  def test_issue_returns_a_pending_future(self):
    c = RequestCorrelator()
    fut = c.issue(1)
    assert isinstance(fut, Future)
    assert not fut.done()  # does not block / resolve eagerly
    assert c.has(1)
    assert c.size == 1
    assert c.outstanding == [1]

  def test_issue_multiplexes_without_waiting(self):
    # Many concurrent outstanding requests are permitted (R-7.2-i, R-7.2-k, R-7.2-l).
    c = RequestCorrelator()
    f1, f2, f3 = c.issue(1), c.issue("two"), c.issue(3)
    assert c.size == 3
    assert not any(f.done() for f in (f1, f2, f3))
    assert set(c.outstanding) == {1, "two", 3}

  def test_reuse_of_outstanding_id_raises(self):
    # A sender MUST NOT reuse the id of an unanswered request (R-7.2-j).
    c = RequestCorrelator()
    c.issue(7)
    with pytest.raises(ValueError):
      c.issue(7)
    # The failed reuse left no second pending entry behind.
    assert c.size == 1

  def test_string_and_number_ids_are_distinct(self):
    # "1" and 1 are different JSON types, so both may be outstanding at once (R-3.2-f/g).
    c = RequestCorrelator()
    f_num = c.issue(1)
    f_str = c.issue("1")
    assert c.size == 2
    c.deliver(_result("1", {"which": "string"}))
    assert f_str.result()["result"] == {"which": "string"}
    assert not f_num.done()  # the numeric id is untouched


class TestDeliver:
  def test_deliver_resolves_matching_future(self):
    c = RequestCorrelator()
    fut = c.issue(42)
    assert c.deliver(_result(42, {"ok": True})) is True
    assert fut.result()["result"] == {"ok": True}
    # Completing a request clears the bookkeeping so the id may be reissued.
    assert not c.has(42)
    assert c.size == 0

  def test_deliver_resolves_the_right_id_only(self):
    c = RequestCorrelator()
    fa, fb = c.issue("a"), c.issue("b")
    c.deliver(_result("b", {"for": "b"}))
    assert fb.done() and fb.result()["result"] == {"for": "b"}
    assert not fa.done()  # only b was resolved
    assert c.outstanding == ["a"]

  def test_delivery_order_is_irrelevant(self):
    # Responses may arrive in any order; matching is purely by id (R-7.2-m..p).
    c = RequestCorrelator()
    f1, f2, f3 = c.issue(1), c.issue(2), c.issue(3)
    c.deliver(_result(3, {"n": 3}))  # last issued resolves first
    c.deliver(_result(1, {"n": 1}))
    c.deliver(_result(2, {"n": 2}))
    assert f1.result()["result"] == {"n": 1}
    assert f2.result()["result"] == {"n": 2}
    assert f3.result()["result"] == {"n": 3}

  def test_delivered_error_response_resolves_not_raises(self):
    # A delivered JSON-RPC error is a fully delivered message — it RESOLVES the future
    # (the caller inspects result vs error). Only transport failure raises (§7.5).
    c = RequestCorrelator()
    fut = c.issue(5)
    assert c.deliver(_error(5, code=-32601, message="method not found")) is True
    resolved = fut.result()
    assert resolved["error"]["code"] == -32601
    assert "result" not in resolved

  def test_unknown_id_is_ignored(self):
    c = RequestCorrelator()
    fut = c.issue(1)
    assert c.deliver(_result(999)) is False  # no such outstanding id
    assert not fut.done()
    assert c.size == 1

  def test_double_deliver_is_ignored(self):
    # The first delivery resolves and clears the entry; a second is a late/unknown id.
    c = RequestCorrelator()
    fut = c.issue(1)
    assert c.deliver(_result(1, {"first": True})) is True
    assert c.deliver(_result(1, {"second": True})) is False
    assert fut.result()["result"] == {"first": True}  # not overwritten

  def test_response_without_id_is_ignored(self):
    c = RequestCorrelator()
    c.issue(1)
    assert c.deliver({"jsonrpc": "2.0", "result": {}}) is False  # no id member
    assert c.deliver({"jsonrpc": "2.0", "id": None, "result": {}}) is False  # null id
    assert c.size == 1

  def test_mismatched_id_type_does_not_resolve(self):
    # Issuing number 1 must not be resolved by string "1" (no coercion, R-3.2-f/g).
    c = RequestCorrelator()
    fut = c.issue(1)
    assert c.deliver(_result("1")) is False
    assert not fut.done()

  def test_non_dict_delivery_is_ignored(self):
    c = RequestCorrelator()
    c.issue(1)
    assert c.deliver("not a dict") is False  # type: ignore[arg-type]
    assert c.size == 1

  def test_boolean_id_is_not_treated_as_int(self):
    # bool is a subclass of int — True must not correlate to a numeric id.
    c = RequestCorrelator()
    c.issue(1)
    assert c.deliver({"jsonrpc": "2.0", "id": True, "result": {}}) is False
    assert c.size == 1


class TestFail:
  def test_fail_sets_exception_on_future(self):
    c = RequestCorrelator()
    fut = c.issue(1)
    err = ClientTransportError("boom")
    assert c.fail(1, err) is True
    with pytest.raises(ClientTransportError):
      fut.result()
    assert c.size == 0  # bookkeeping cleared so the id may be reissued

  def test_fail_only_targets_the_named_id(self):
    c = RequestCorrelator()
    fa, fb = c.issue("a"), c.issue("b")
    c.fail("a", ClientTransportError("only a"))
    assert fa.done() and fa.exception() is not None
    assert not fb.done()
    assert c.outstanding == ["b"]

  def test_fail_unknown_id_returns_false(self):
    c = RequestCorrelator()
    assert c.fail(123, ClientTransportError("x")) is False

  def test_fail_after_deliver_returns_false(self):
    c = RequestCorrelator()
    fut = c.issue(1)
    c.deliver(_result(1))
    assert c.fail(1, ClientTransportError("late")) is False
    assert fut.exception() is None  # remained resolved, not failed


class TestFailAll:
  def test_fail_all_fails_every_pending(self):
    # Disconnection fails every unanswered request so none hangs (R-7.5-c..e).
    c = RequestCorrelator()
    futures = [c.issue(i) for i in range(4)]
    err = ClientTransportError("disconnected")
    failed = c.fail_all(err)
    assert failed == [0, 1, 2, 3]  # issue order
    assert all(f.done() and isinstance(f.exception(), ClientTransportError) for f in futures)
    assert c.size == 0

  def test_fail_all_on_empty_is_noop(self):
    c = RequestCorrelator()
    assert c.fail_all(ClientTransportError("x")) == []

  def test_ids_may_be_reissued_after_fail_all(self):
    # No state is bound to the lost connection; ids may be reissued (R-7.5-f, R-7.7-b).
    c = RequestCorrelator()
    c.issue(1)
    c.fail_all(ClientTransportError("drop"))
    fut = c.issue(1)  # must not raise the reuse error
    assert c.has(1)
    c.deliver(_result(1, {"reconnected": True}))
    assert fut.result()["result"] == {"reconnected": True}


class TestParseErrorResponse:
  def test_parse_error_code_value(self):
    assert PARSE_ERROR_CODE == -32700

  def test_build_omits_id_by_default(self):
    resp = build_parse_error_response()
    assert "id" not in resp  # the omitted-id form (R-7.2-h)
    assert resp["jsonrpc"] == "2.0"
    assert resp["error"] == {"code": PARSE_ERROR_CODE, "message": "Parse error"}

  def test_build_with_null_id(self):
    resp = build_parse_error_response(null_id=True)
    assert resp["id"] is None  # the null-id form (R-7.2-h)
    assert resp["error"]["code"] == PARSE_ERROR_CODE

  def test_built_responses_are_acceptable(self):
    assert is_acceptable_malformed_id_error_response(build_parse_error_response())
    assert is_acceptable_malformed_id_error_response(build_parse_error_response(null_id=True))


class TestIsAcceptableMalformedIdErrorResponse:
  def test_accepts_null_string_int_and_omitted_id(self):
    base_err = {"code": -32700, "message": "Parse error"}
    assert is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "error": base_err})
    assert is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "id": None, "error": base_err})
    assert is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "id": "abc", "error": base_err})
    assert is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "id": 9, "error": base_err})

  def test_rejects_wrong_jsonrpc_version(self):
    assert not is_acceptable_malformed_id_error_response(
      {"jsonrpc": "1.0", "error": {"code": -32700, "message": "x"}}
    )

  def test_rejects_missing_or_malformed_error(self):
    assert not is_acceptable_malformed_id_error_response({"jsonrpc": "2.0"})
    assert not is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "error": {"message": "no code"}})
    assert not is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "error": {"code": 1}})
    assert not is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "error": "not-an-object"})

  def test_rejects_bad_id_types(self):
    err = {"code": -32700, "message": "Parse error"}
    assert not is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "id": True, "error": err})
    assert not is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "id": 1.5, "error": err})
    assert not is_acceptable_malformed_id_error_response({"jsonrpc": "2.0", "id": [1], "error": err})

  def test_rejects_non_dict(self):
    assert not is_acceptable_malformed_id_error_response(None)
    assert not is_acceptable_malformed_id_error_response("string")
    assert not is_acceptable_malformed_id_error_response(["jsonrpc", "2.0"])

  def test_bool_code_rejected(self):
    # True is an int subclass but is not a valid error code.
    assert not is_acceptable_malformed_id_error_response(
      {"jsonrpc": "2.0", "error": {"code": True, "message": "x"}}
    )


class TestIdEchoMatches:
  def test_same_type_same_value_matches(self):
    assert id_echo_matches(1, 1)
    assert id_echo_matches("x", "x")

  def test_no_type_coercion(self):
    assert not id_echo_matches(1, "1")
    assert not id_echo_matches("1", 1)

  def test_different_values_do_not_match(self):
    assert not id_echo_matches(1, 2)
    assert not id_echo_matches("a", "b")
