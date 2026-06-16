"""Tests for Multi-Round-Trip Requests — the ``input_required`` mechanism (§11).

Mirrors ``ts-sdk/src/__tests__/protocol/multi-round-trip.test.ts`` and
``multi-round-trip-conformance.test.ts`` (AC-17.1 … AC-17.31, RQ/RC helpers) plus
Python-side edge cases.
"""

from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.multi_round_trip import (
  INPUT_RESPONSE_SCHEMA_BY_METHOD,
  MALFORMED_INPUT_REQUIRED_RESULT_ERROR,
  RECOGNIZED_INPUT_REQUEST_METHODS,
  MrtrRoundGuard,
  build_input_required_result,
  build_malformed_retry_error,
  build_missing_capability_for_mrtr_error,
  build_re_request_input_required_result,
  client_supports_input_request_kind,
  compute_missing_input_response_keys,
  compute_retry_backoff_ms,
  discriminate_result_type,
  is_deprecated_input_request_kind,
  is_input_required_result,
  is_load_shedding_result,
  is_mrtr_participating_method,
  is_recognized_input_request_method,
  is_valid_create_message_result,
  is_valid_elicit_result,
  is_valid_input_request,
  is_valid_input_required_result,
  is_valid_input_response_request_params,
  is_valid_list_roots_result,
  may_emit_input_request_kind,
  parse_input_required_result,
  required_client_capability_for_input_request,
  validate_input_response_keys,
  validate_input_response_kinds,
  validate_retry_params,
)

ELICIT = {"method": "elicitation/create"}
ELICIT_FULL = {"method": "elicitation/create", "params": {}}


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
    # ELICIT_FULL is a well-formed request, so the error is isolated to the undeclared
    # capability (not a malformed shape) — that is what this case exercises. (R-11.5-k)
    result = {"resultType": "input_required", "inputRequests": {"k": ELICIT_FULL}}
    d = discriminate_result_type(result, client_capabilities={})
    assert d.action == "error"

  def test_capability_gating_declared_kind_is_input_required(self):
    result = {"resultType": "input_required", "inputRequests": {"k": ELICIT_FULL}}
    d = discriminate_result_type(result, client_capabilities={"elicitation": {}})
    assert d.action == "input_required"

  def test_capability_blind_unrecognized_method_is_error(self):
    # P1-1 parity gate: even with NO client_capabilities supplied, an inner request whose
    # `method` is unrecognized makes the whole InputRequiredResult malformed → error. TS
    # runs `InputRequiredResultSchema.safeParse` first; Python must match. (R-11.5-d/-e)
    result = {
      "resultType": "input_required",
      "inputRequests": {"step": {"method": "made/up", "params": {}}},
    }
    d = discriminate_result_type(result)  # capability-blind
    assert d.action == "error" and d.reason is not None

  def test_capability_blind_malformed_inner_request_is_error(self):
    # An inner request with a recognized method but a malformed payload (elicitation
    # requires `params`) is likewise malformed when capability-blind. (R-11.2-k/-l)
    result = {
      "resultType": "input_required",
      "inputRequests": {"step": {"method": "elicitation/create"}},
    }
    assert discriminate_result_type(result).action == "error"

  def test_capability_blind_well_formed_is_input_required(self):
    # The complement: a well-formed input_required result is still classified
    # input_required when capability-blind (no over-rejection). (R-11.5-c)
    result = {"resultType": "input_required", "inputRequests": {"k": ELICIT_FULL}}
    assert discriminate_result_type(result).action == "input_required"


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
  assert MALFORMED_INPUT_REQUIRED_RESULT_ERROR["code"] == INVALID_PARAMS_CODE
  err = build_missing_capability_for_mrtr_error({"elicitation": {}})
  assert err["code"] == MISSING_CLIENT_CAPABILITY_CODE


# ─── AC-17.3/.4/.5 — InputRequiredResult validation ──────────────────────────


class TestIsValidInputRequiredResult:
  def test_request_state_only(self):
    assert is_valid_input_required_result({"resultType": "input_required", "requestState": "tok"})

  def test_input_requests_only(self):
    assert is_valid_input_required_result(
      {"resultType": "input_required", "inputRequests": {"a": ELICIT_FULL}}
    )

  def test_both(self):
    assert is_valid_input_required_result(
      {"resultType": "input_required", "inputRequests": {"k": ELICIT_FULL}, "requestState": "t"}
    )

  def test_rejects_complete_result_type(self):
    assert not is_valid_input_required_result({"resultType": "complete", "requestState": "t"})

  def test_rejects_absent_result_type(self):
    assert not is_valid_input_required_result({"requestState": "t"})

  def test_rejects_wrong_casing(self):
    assert not is_valid_input_required_result({"resultType": "Input_Required", "requestState": "t"})

  def test_rejects_both_fields_absent(self):
    assert not is_valid_input_required_result({"resultType": "input_required"})

  def test_rejects_unknown_inner_method(self):
    # AC-17.11 — discriminated union over `method` rejects unrecognized methods.
    assert not is_valid_input_required_result(
      {"resultType": "input_required", "inputRequests": {"step": {"method": "unknown/getInput", "params": {}}}}
    )

  def test_rejects_non_string_request_state(self):
    assert not is_valid_input_required_result({"resultType": "input_required", "requestState": 5})

  def test_arbitrary_string_keys_accepted(self):
    # AC-17.6 — server may use any non-empty string key.
    assert is_valid_input_required_result(
      {
        "resultType": "input_required",
        "inputRequests": {"github-username": ELICIT_FULL, "step2": ELICIT_FULL},
        "requestState": "tok",
      }
    )

  def test_opaque_request_state_strings(self):
    # AC-17.12 — requestState is opaque; any string (even JSON-looking, even "") accepted.
    for state in ("simple-token", '{"step":"await"}', ""):
      assert is_valid_input_required_result({"resultType": "input_required", "requestState": state})


class TestIsValidInputRequest:
  def test_elicitation_requires_params(self):
    assert is_valid_input_request({"method": "elicitation/create", "params": {}})
    assert not is_valid_input_request({"method": "elicitation/create"})

  def test_roots_list_params_optional(self):
    assert is_valid_input_request({"method": "roots/list"})
    assert is_valid_input_request({"method": "roots/list", "params": {}})

  def test_sampling_requires_params(self):
    assert is_valid_input_request({"method": "sampling/createMessage", "params": {}})
    assert not is_valid_input_request({"method": "sampling/createMessage"})

  def test_unknown_method_rejected(self):
    assert not is_valid_input_request({"method": "unknown/x", "params": {}})

  def test_non_dict_rejected(self):
    assert not is_valid_input_request("nope")


class TestIsInputRequiredResultGuard:
  def test_well_formed(self):
    assert is_input_required_result({"resultType": "input_required", "requestState": "tok"})

  def test_complete_is_false(self):
    assert not is_input_required_result({"resultType": "complete"})

  def test_missing_both_is_false(self):
    assert not is_input_required_result({"resultType": "input_required"})


class TestInputResponseRequestParams:
  # AC-17.17 — any request MAY carry inputResponses + requestState (or only _meta).
  META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}

  def test_only_meta(self):
    assert is_valid_input_response_request_params({"_meta": self.META})

  def test_with_input_responses_and_request_state(self):
    assert is_valid_input_response_request_params(
      {
        "_meta": self.META,
        "inputResponses": {"step1": {"action": "accept", "content": {"name": "octocat"}}},
        "requestState": "opaque-state-tok",
      }
    )

  def test_only_request_state(self):
    assert is_valid_input_response_request_params({"_meta": self.META, "requestState": "opaque"})

  def test_requires_meta(self):
    assert not is_valid_input_response_request_params({"requestState": "x"})

  def test_rejects_non_object_input_responses(self):
    assert not is_valid_input_response_request_params({"_meta": self.META, "inputResponses": "x"})


# ─── AC-17.8 — validateInputResponseKeys ─────────────────────────────────────


class TestValidateInputResponseKeys:
  def test_all_keys_match(self):
    result = validate_input_response_keys(
      {"ask-name": {}, "ask-repo": {}},
      {"ask-name": {"action": "accept"}, "ask-repo": {"action": "accept"}},
    )
    assert result.valid and result.unknown_keys == []

  def test_subset_answered_is_valid(self):
    result = validate_input_response_keys({"key-a": {}, "key-b": {}}, {"key-a": {"action": "accept"}})
    assert result.valid

  def test_unknown_key_is_invalid(self):
    result = validate_input_response_keys(
      {"key-a": {}}, {"key-a": {"action": "accept"}, "key-z": {"action": "decline"}}
    )
    assert not result.valid and "key-z" in result.unknown_keys

  def test_empty_responses_is_valid(self):
    assert validate_input_response_keys({"key-a": {}}, {}).valid


# ─── AC-17.19 — forward-declared InputResponse validators ────────────────────


class TestElicitResult:
  def test_accept_with_content(self):
    assert is_valid_elicit_result({"action": "accept", "content": {"name": "octocat"}})

  def test_decline_without_content(self):
    assert is_valid_elicit_result({"action": "decline"})

  def test_cancel(self):
    assert is_valid_elicit_result({"action": "cancel"})

  def test_missing_action_rejected(self):
    assert not is_valid_elicit_result({"content": {"name": "x"}})

  def test_unknown_action_rejected(self):
    assert not is_valid_elicit_result({"action": "defer"})


class TestListRootsResult:
  def test_well_formed(self):
    assert is_valid_list_roots_result({"roots": [{"uri": "file:///home/user", "name": "home"}]})

  def test_empty_roots(self):
    assert is_valid_list_roots_result({"roots": []})

  def test_missing_roots_rejected(self):
    assert not is_valid_list_roots_result({"other": "value"})

  def test_root_missing_uri_rejected(self):
    assert not is_valid_list_roots_result({"roots": [{"name": "no-uri"}]})


class TestCreateMessageResult:
  def test_well_formed(self):
    assert is_valid_create_message_result(
      {"role": "assistant", "content": {"type": "text", "text": "Hello"}, "model": "claude-haiku-4-5"}
    )

  def test_missing_role_rejected(self):
    assert not is_valid_create_message_result(
      {"content": {"type": "text", "text": "Hello"}, "model": "claude-haiku-4-5"}
    )

  def test_missing_model_rejected(self):
    assert not is_valid_create_message_result(
      {"role": "assistant", "content": {"type": "text", "text": "Hello"}}
    )


class TestInputResponseSchemaByMethod:
  def test_has_all_three_methods(self):
    assert INPUT_RESPONSE_SCHEMA_BY_METHOD["elicitation/create"] is not None
    assert INPUT_RESPONSE_SCHEMA_BY_METHOD["roots/list"] is not None
    assert INPUT_RESPONSE_SCHEMA_BY_METHOD["sampling/createMessage"] is not None


# ─── AC-17.19 — validateInputResponseKinds (kind-correlation) ────────────────


class TestValidateInputResponseKinds:
  REQUESTS = {
    "ask-user": {"method": "elicitation/create", "params": {}},
    "get-roots": {"method": "roots/list"},
    "sample-llm": {"method": "sampling/createMessage", "params": {}},
  }

  def test_all_match(self):
    result = validate_input_response_kinds(
      self.REQUESTS,
      {
        "ask-user": {"action": "accept", "content": {"name": "octocat"}},
        "get-roots": {"roots": [{"uri": "file:///home"}]},
        "sample-llm": {"role": "assistant", "content": {"type": "text", "text": "hi"}, "model": "x"},
      },
    )
    assert result.valid

  def test_empty_responses_valid(self):
    assert validate_input_response_kinds(self.REQUESTS, {}).valid

  def test_elicit_missing_action(self):
    result = validate_input_response_kinds(
      {"ask-user": {"method": "elicitation/create", "params": {}}},
      {"ask-user": {"content": {"name": "x"}}},
    )
    assert not result.valid
    assert len(result.errors) == 1
    assert result.errors[0].key == "ask-user"
    assert result.errors[0].expected_method == "elicitation/create"

  def test_roots_missing_roots(self):
    result = validate_input_response_kinds(
      {"get-roots": {"method": "roots/list"}}, {"get-roots": {"noRootsKey": True}}
    )
    assert not result.valid and result.errors[0].key == "get-roots"

  def test_create_message_missing_model(self):
    result = validate_input_response_kinds(
      {"sample-llm": {"method": "sampling/createMessage", "params": {}}},
      {"sample-llm": {"role": "assistant", "content": {}}},
    )
    assert not result.valid
    assert result.errors[0].expected_method == "sampling/createMessage"

  def test_multiple_errors(self):
    result = validate_input_response_kinds(
      {
        "ask-user": {"method": "elicitation/create", "params": {}},
        "sample-llm": {"method": "sampling/createMessage", "params": {}},
      },
      {"ask-user": {"wrong": True}, "sample-llm": {"role": "assistant"}},
    )
    assert not result.valid and len(result.errors) >= 2

  def test_skips_unknown_keys(self):
    result = validate_input_response_kinds(
      {"ask-user": {"method": "elicitation/create", "params": {}}},
      {"ask-user": {"action": "decline"}, "unknown-key": {"anything": True}},
    )
    assert result.valid

  def test_non_object_input_does_not_raise(self):
    requests = {"q1": {"method": "elicitation/create", "params": {}}}
    for bad in (None, 42, "x", [], True):
      assert validate_input_response_kinds(requests, bad).valid  # type: ignore[arg-type]
      # non-object inputRequests does not raise either
      validate_input_response_kinds(bad, {"q1": {"action": "accept"}})  # type: ignore[arg-type]


# ─── AC-17.30 — buildMalformedRetryError / validateRetryParams ───────────────


class TestBuildMalformedRetryError:
  def test_code_is_invalid_params(self):
    assert build_malformed_retry_error("wrong action field")["code"] == INVALID_PARAMS_CODE

  def test_includes_detail(self):
    assert 'ask-user' in build_malformed_retry_error('key "ask-user": missing action')["message"]


class TestValidateRetryParams:
  REQUESTS = {"ask-user": {"method": "elicitation/create", "params": {}}}

  def test_valid_responses(self):
    assert validate_retry_params(self.REQUESTS, {"ask-user": {"action": "accept", "content": {}}}).ok

  def test_invalid_response_returns_error(self):
    result = validate_retry_params(self.REQUESTS, {"ask-user": {"notAction": "wrong-shape"}})
    assert not result.ok
    assert result.error["code"] == INVALID_PARAMS_CODE
    assert "ask-user" in result.error["message"]

  def test_error_code_is_exactly_invalid_params(self):
    result = validate_retry_params(
      {"get-roots": {"method": "roots/list"}}, {"get-roots": {"wrongShape": True}}
    )
    assert not result.ok and result.error["code"] == INVALID_PARAMS_CODE

  def test_empty_responses_ok(self):
    assert validate_retry_params(self.REQUESTS, {}).ok

  def test_non_object_input_does_not_raise(self):
    for bad in (None, 42, "x", [], True):
      assert validate_retry_params(self.REQUESTS, bad).ok  # type: ignore[arg-type]


# ─── S17-RQ-4 — duplicate inputRequests keys are malformed (R-11.2-f) ────────


class TestParseInputRequiredResult:
  def test_duplicate_keys_rejected(self):
    raw = (
      '{"resultType":"input_required","inputRequests":{'
      '"k":{"method":"elicitation/create","params":{}},'
      '"k":{"method":"roots/list"}}}'
    )
    result = parse_input_required_result(raw)
    assert not result.ok and result.error["code"] == INVALID_PARAMS_CODE

  def test_well_formed_unique_keys_accepted(self):
    raw = (
      '{"resultType":"input_required","inputRequests":{'
      '"a":{"method":"elicitation/create","params":{}}},"requestState":"s1"}'
    )
    result = parse_input_required_result(raw)
    assert result.ok and result.result["requestState"] == "s1"

  def test_identical_keys_in_sibling_objects_not_a_false_positive(self):
    raw = (
      '{"resultType":"input_required","inputRequests":{'
      '"a":{"method":"elicitation/create","params":{"x":1}},'
      '"b":{"method":"sampling/createMessage","params":{"x":2}}}}'
    )
    assert parse_input_required_result(raw).ok

  def test_invalid_json_rejected(self):
    assert not parse_input_required_result("{not json").ok

  def test_valid_json_invalid_shape_rejected(self):
    assert not parse_input_required_result('{"resultType":"complete"}').ok


# ─── S17-RQ-6 / RQ-15 — capability gating maps kind → capability ─────────────


class TestCapabilityGating:
  def test_required_capability_for_kind(self):
    assert required_client_capability_for_input_request("elicitation/create") == "elicitation"
    assert required_client_capability_for_input_request("roots/list") == "roots"
    assert required_client_capability_for_input_request("sampling/createMessage") == "sampling"
    assert required_client_capability_for_input_request("nope/whatever") is None

  def test_server_may_emit_only_declared_kinds(self):
    caps = {"elicitation": {}}
    assert may_emit_input_request_kind("elicitation/create", caps)
    assert not may_emit_input_request_kind("roots/list", caps)

  def test_client_supports_only_declared_kinds(self):
    caps = {"roots": {}, "sampling": {}}
    assert client_supports_input_request_kind("roots/list", caps)
    assert not client_supports_input_request_kind("elicitation/create", caps)


# ─── S17-RQ-18 — undeclared kind → discriminate result is error (R-11.5-k) ───


class TestDiscriminateUndeclaredKind:
  RESULT = {
    "resultType": "input_required",
    "inputRequests": {"a": {"method": "elicitation/create", "params": {}}},
  }

  def test_errors_when_kind_not_declared(self):
    assert discriminate_result_type(self.RESULT, {"roots": {}}).action == "error"

  def test_fulfills_when_kind_declared(self):
    assert discriminate_result_type(self.RESULT, {"elicitation": {}}).action == "input_required"

  def test_capability_blind_when_none_passed(self):
    assert discriminate_result_type(self.RESULT).action == "input_required"

  def test_null_result_type_is_complete(self):
    assert discriminate_result_type({"resultType": None}).action == "complete"

  def test_non_string_result_type_is_error(self):
    assert discriminate_result_type({"resultType": 42}).action == "error"


# ─── S17 Recommended helpers (RC-2, RC-3, RC-5, RC-6) ────────────────────────


class TestRecommendedHelpers:
  def test_rc2_flags_deprecated_kinds(self):
    assert is_deprecated_input_request_kind("roots/list")
    assert is_deprecated_input_request_kind("sampling/createMessage")
    assert not is_deprecated_input_request_kind("elicitation/create")

  def test_rc3_round_guard_bounds_the_loop(self):
    guard = MrtrRoundGuard(2)
    assert guard.record_round() is True
    assert guard.round == 1
    assert guard.record_round() is True
    assert guard.round == 2
    assert guard.record_round() is False
    assert guard.round == 3

  def test_rc5_backoff_grows_and_is_capped(self):
    assert compute_retry_backoff_ms(0) == 0
    assert compute_retry_backoff_ms(1, base_ms=100) == 100
    assert compute_retry_backoff_ms(3, base_ms=100) == 400
    assert compute_retry_backoff_ms(50, base_ms=100, max_ms=1000) == 1000

  def test_rc6_re_requests_only_missing_input(self):
    requests = {
      "name": {"method": "elicitation/create", "params": {}},
      "age": {"method": "elicitation/create", "params": {}},
    }
    assert compute_missing_input_response_keys(requests, {"name": {"action": "accept"}}) == ["age"]

    re_req = build_re_request_input_required_result(requests, {"name": {"action": "accept"}}, "state-1")
    assert re_req is not None
    assert list(re_req["inputRequests"].keys()) == ["age"]
    assert re_req["requestState"] == "state-1"

    # Nothing missing → None (the server completes instead of re-requesting).
    assert build_re_request_input_required_result(requests, {"name": {}, "age": {}}) is None


class TestRecognizedMethodsRegistry:
  def test_contains_three_known_methods(self):
    assert "elicitation/create" in RECOGNIZED_INPUT_REQUEST_METHODS
    assert "roots/list" in RECOGNIZED_INPUT_REQUEST_METHODS
    assert "sampling/createMessage" in RECOGNIZED_INPUT_REQUEST_METHODS
    assert "tools/call" not in RECOGNIZED_INPUT_REQUEST_METHODS


# ─── InputRequiredResult round-trip with full inputRequests (parity) ─────────


class TestInputRequiredResultAllThreeKinds:
  # Mirrors the TS "InputRequiredResult with all three input-request kinds" block:
  # each recognized kind validates inside a full input_required result.
  def test_accepts_elicitation_create(self):
    assert is_valid_input_required_result(
      {
        "resultType": "input_required",
        "inputRequests": {
          "ask-user": {
            "method": "elicitation/create",
            "params": {
              "mode": "form",
              "message": "Please provide your name",
              "requestedSchema": {"type": "object", "properties": {"name": {"type": "string"}}},
            },
          }
        },
        "requestState": "eyJzdGVwIjoiMSJ9",
      }
    )

  def test_accepts_roots_list_without_params(self):
    assert is_valid_input_required_result(
      {
        "resultType": "input_required",
        "inputRequests": {"get-roots": {"method": "roots/list"}},
        "requestState": "tok",
      }
    )

  def test_accepts_sampling_create_message(self):
    assert is_valid_input_required_result(
      {
        "resultType": "input_required",
        "inputRequests": {
          "llm-step": {
            "method": "sampling/createMessage",
            "params": {"messages": [], "modelPreferences": {}},
          }
        },
        "requestState": "tok",
      }
    )


class TestRequestStateOpaqueness:
  # AC-17.12 (R-11.3-a/b/f) — requestState is opaque; any string accepted, no format.
  def test_accepts_arbitrary_opaque_strings(self):
    for state in (
      "simple-token",
      "eyJzdGVwIjoiYXdhaXQiLCJzaWciOiJhYmMifQ==",  # base64-looking
      '{"step":"await"}',  # JSON-looking — still opaque
      "",  # empty string is a valid opaque token
    ):
      assert is_valid_input_required_result({"resultType": "input_required", "requestState": state})


class TestLoadSheddingParity:
  # AC-17.27 (R-11.5-l) — extra parity assertions for the load-shedding predicate.
  def test_request_state_only_variants(self):
    assert is_load_shedding_result({"resultType": "input_required", "requestState": "tok"})
    assert is_load_shedding_result({"resultType": "input_required", "requestState": "state"})

  def test_empty_input_requests_with_request_state_is_load_shedding(self):
    # inputRequests present but empty + requestState → still load-shedding (no work to do).
    assert is_load_shedding_result(
      {"resultType": "input_required", "inputRequests": {}, "requestState": "tok"}
    )

  def test_absent_request_state_even_with_absent_requests_is_not(self):
    # Both absent is malformed, not load-shedding.
    assert not is_load_shedding_result({"resultType": "input_required"})
