"""Tests for Multi-Round-Trip Requests — the ``input_required`` mechanism (§11)."""

from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.multi_round_trip import (
  MrtrRoundGuard,
  build_input_required_result,
  client_supports_input_request_kind,
  discriminate_result_type,
  is_load_shedding_result,
  is_mrtr_participating_method,
  is_recognized_input_request_method,
)

ELICIT = {"method": "elicitation/create"}


class TestBuildInputRequiredResult:
  def test_input_requests_only(self):
    result = build_input_required_result(input_requests={"a": ELICIT})
    assert result == {"resultType": "input_required", "inputRequests": {"a": ELICIT}}

  def test_request_state_only(self):
    result = build_input_required_result(request_state="tok")
    assert result == {"resultType": "input_required", "requestState": "tok"}

  def test_both(self):
    result = build_input_required_result(input_requests={"a": ELICIT}, request_state="tok")
    assert result["inputRequests"] == {"a": ELICIT}
    assert result["requestState"] == "tok"
    assert result["resultType"] == "input_required"


class TestDiscriminateResultType:
  def test_complete(self):
    assert discriminate_result_type({"resultType": "complete"}).action == "complete"

  def test_absent_result_type_is_complete(self):
    assert discriminate_result_type({}).action == "complete"

  def test_input_required_valid(self):
    d = discriminate_result_type({"resultType": "input_required", "requestState": "tok"})
    assert d.action == "input_required" and d.result is not None

  def test_input_required_missing_both_fields_is_error(self):
    d = discriminate_result_type({"resultType": "input_required"})
    assert d.action == "error" and d.reason is not None

  def test_unrecognized_result_type_is_error(self):
    assert discriminate_result_type({"resultType": "weird"}).action == "error"

  def test_not_an_object_is_error(self):
    assert discriminate_result_type("nope").action == "error"

  def test_capability_gating_undeclared_kind_is_error(self):
    result = {"resultType": "input_required", "inputRequests": {"k": ELICIT}}
    d = discriminate_result_type(result, client_capabilities={})
    assert d.action == "error"

  def test_capability_gating_declared_kind_is_input_required(self):
    result = {"resultType": "input_required", "inputRequests": {"k": ELICIT}}
    d = discriminate_result_type(result, client_capabilities={"elicitation": {}})
    assert d.action == "input_required"


class TestIsLoadSheddingResult:
  def test_request_state_only_is_load_shedding(self):
    assert is_load_shedding_result({"resultType": "input_required", "requestState": "tok"})

  def test_with_requests_is_not(self):
    assert not is_load_shedding_result(
      {"resultType": "input_required", "inputRequests": {"a": ELICIT}, "requestState": "tok"}
    )

  def test_complete_is_not(self):
    assert not is_load_shedding_result({"resultType": "complete"})

  def test_non_dict_is_not(self):
    assert not is_load_shedding_result(None)


class TestClientSupportsInputRequestKind:
  def test_elicitation_needs_elicitation_capability(self):
    assert client_supports_input_request_kind("elicitation/create", {"elicitation": {}})
    assert not client_supports_input_request_kind("elicitation/create", {})

  def test_roots(self):
    assert client_supports_input_request_kind("roots/list", {"roots": {}})
    assert not client_supports_input_request_kind("roots/list", {})

  def test_sampling(self):
    assert client_supports_input_request_kind("sampling/createMessage", {"sampling": {}})
    assert not client_supports_input_request_kind("sampling/createMessage", {})

  def test_unrecognized_is_false(self):
    assert not client_supports_input_request_kind("other/method", {"other": {}})


class TestMethodPredicates:
  def test_is_recognized_input_request_method(self):
    assert is_recognized_input_request_method("elicitation/create")
    assert is_recognized_input_request_method("roots/list")
    assert is_recognized_input_request_method("sampling/createMessage")
    assert not is_recognized_input_request_method("tools/call")

  def test_is_mrtr_participating_method(self):
    assert is_mrtr_participating_method("tools/call")
    assert is_mrtr_participating_method("prompts/get")
    assert is_mrtr_participating_method("resources/read")
    assert not is_mrtr_participating_method("elicitation/create")


class TestMrtrRoundGuard:
  def test_record_round_up_to_max_then_false(self):
    guard = MrtrRoundGuard(max_rounds=3)
    assert guard.record_round() is True
    assert guard.record_round() is True
    assert guard.record_round() is True
    assert guard.record_round() is False
    assert guard.round == 4


def test_error_constants():
  # Sanity: the malformed-result error reuses INVALID_PARAMS, the missing-cap
  # error reuses the -32003 code; keeps the test self-documenting.
  from mcp.protocol.multi_round_trip import (
    MALFORMED_INPUT_REQUIRED_RESULT_ERROR,
    build_missing_capability_for_mrtr_error,
  )

  assert MALFORMED_INPUT_REQUIRED_RESULT_ERROR["code"] == INVALID_PARAMS_CODE
  err = build_missing_capability_for_mrtr_error({"elicitation": {}})
  assert err["code"] == MISSING_CLIENT_CAPABILITY_CODE
