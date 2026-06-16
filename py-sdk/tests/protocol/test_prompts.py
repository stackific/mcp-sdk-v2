"""Tests for Prompts — capability, types, list/get, errors, list-changed (§18)."""

import pytest

from mcp.protocol.prompts import (
  MRTR_RESULT_TYPE_INPUT_REQUIRED,
  PROMPTS_GET_METHOD,
  PROMPTS_INTERNAL_ERROR_CODE,
  PROMPTS_INVALID_PARAMS_CODE,
  PROMPTS_LIST_CHANGED_METHOD,
  PROMPTS_LIST_METHOD,
  GetPromptResultConfig,
  ListPromptsResultConfig,
  build_get_prompt_result,
  build_list_prompts_result,
  build_missing_argument_error,
  build_prompt_internal_error,
  build_prompt_list_changed_notification,
  build_unknown_prompt_error,
  discriminate_get_prompt_response,
  is_valid_get_prompt_request_params,
  is_valid_get_prompt_result,
  is_valid_list_prompts_request_params,
  is_valid_list_prompts_result,
  is_valid_prompt,
  is_valid_prompt_argument,
  is_valid_prompt_list_changed_notification,
  is_valid_prompt_list_changed_notification_params,
  is_valid_prompt_message,
  is_valid_prompts_capability,
  is_valid_prompts_input_required_result,
  may_call_prompt_method,
  may_complete_prompt_argument,
  may_expect_prompts_list_changed,
  required_argument_names,
  resolve_get_prompt_result_type,
  resolve_list_prompts_result_type,
  server_declares_prompts,
  validate_get_prompt_request,
)
from mcp.types.base_metadata import resolve_display_name

PROMPT = {"name": "greet", "arguments": [{"name": "who", "required": True}, {"name": "style"}]}
MSG = {"role": "user", "content": {"type": "text", "text": "hi"}}

# A richer fixture mirroring the TS CODE_REVIEW_PROMPT (name/title/description/args/icons).
CODE_REVIEW_PROMPT = {
  "name": "code_review",
  "title": "Request Code Review",
  "description": "Asks the LLM to analyze code quality and suggest improvements",
  "arguments": [{"name": "code", "description": "The code to review", "required": True}],
  "icons": [{"src": "https://example.com/review-icon.svg", "mimeType": "image/svg+xml", "sizes": ["any"]}],
}

META = {"io.modelcontextprotocol/protocolVersion": "2025-11-25"}


class TestCapability:
  def test_declares_and_gating(self):
    assert server_declares_prompts({"prompts": {}})
    assert may_call_prompt_method("prompts/get", {"prompts": {}})
    assert not may_call_prompt_method("prompts/get", {})
    assert may_expect_prompts_list_changed({"prompts": {"listChanged": True}})
    assert not may_expect_prompts_list_changed({"prompts": {}})


class TestTypes:
  def test_prompt_argument(self):
    assert is_valid_prompt_argument({"name": "x", "required": True, "description": "d"})
    assert not is_valid_prompt_argument({"required": True})  # no name
    assert not is_valid_prompt_argument({"name": "x", "required": "yes"})

  def test_prompt(self):
    assert is_valid_prompt(PROMPT)
    assert is_valid_prompt({"name": "p"})
    assert not is_valid_prompt({"name": "p", "arguments": [{"required": True}]})

  def test_required_argument_names(self):
    assert required_argument_names(PROMPT) == ["who"]
    assert required_argument_names({"name": "p"}) == []

  def test_prompt_message(self):
    assert is_valid_prompt_message(MSG)
    assert not is_valid_prompt_message({"role": "system", "content": {"type": "text", "text": "x"}})
    assert not is_valid_prompt_message({"role": "user", "content": [MSG]})  # must be a single block


class TestListResult:
  def test_build_and_validate(self):
    result = build_list_prompts_result(ListPromptsResultConfig(prompts=[PROMPT], ttl_ms=0, cache_scope="private"))
    assert is_valid_list_prompts_result(result)

  def test_negative_ttl_raises(self):
    with pytest.raises(ValueError):
      build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=-1, cache_scope="public"))


class TestGetResult:
  def test_build_and_validate(self):
    result = build_get_prompt_result(GetPromptResultConfig(messages=[MSG], description="d"))
    assert is_valid_get_prompt_result(result) and result["description"] == "d"

  def test_resolve_result_type_absent_is_complete(self):
    assert resolve_get_prompt_result_type({}) == "complete"
    assert resolve_get_prompt_result_type({"resultType": "input_required"}) == "input_required"

  def test_absent_result_type_validates(self):
    assert is_valid_get_prompt_result({"messages": [MSG]})


class TestDiscrimination:
  def test_complete(self):
    d = discriminate_get_prompt_response({"resultType": "complete", "messages": [MSG]})
    assert d.kind == "complete"

  def test_absent_treated_as_complete(self):
    d = discriminate_get_prompt_response({"messages": [MSG]})
    assert d.kind == "complete"

  def test_input_required(self):
    d = discriminate_get_prompt_response({"resultType": "input_required", "inputRequests": {}})
    assert d.kind == "input_required"

  def test_unrecognized_is_error(self):
    d = discriminate_get_prompt_response({"resultType": "frobnicate"})
    assert d.kind == "error" and d.result_type == "frobnicate"

  def test_malformed_complete_is_error(self):
    d = discriminate_get_prompt_response({"resultType": "complete", "messages": "no"})
    assert d.kind == "error"


class TestErrorModel:
  def test_unknown_prompt(self):
    assert build_unknown_prompt_error("ghost")["code"] == PROMPTS_INVALID_PARAMS_CODE

  def test_missing_argument(self):
    err = build_missing_argument_error(["who"])
    assert err["code"] == PROMPTS_INVALID_PARAMS_CODE and "who" in err["message"]

  def test_internal(self):
    assert build_prompt_internal_error("db down")["code"] == PROMPTS_INTERNAL_ERROR_CODE


class TestValidateRequest:
  def test_unknown_name(self):
    v = validate_get_prompt_request({"name": "ghost"}, [PROMPT])
    assert not v.ok and v.error["code"] == PROMPTS_INVALID_PARAMS_CODE

  def test_missing_required(self):
    v = validate_get_prompt_request({"name": "greet", "arguments": {}}, [PROMPT])
    assert not v.ok and "who" in v.error["message"]

  def test_valid(self):
    v = validate_get_prompt_request({"name": "greet", "arguments": {"who": "Ada"}}, [PROMPT])
    assert v.ok and v.arguments == {"who": "Ada"}

  def test_offered_as_map(self):
    v = validate_get_prompt_request({"name": "greet", "arguments": {"who": "Ada"}}, {"greet": PROMPT})
    assert v.ok


class TestListChanged:
  def test_build_and_validate(self):
    note = build_prompt_list_changed_notification()
    assert is_valid_prompt_list_changed_notification(note) and "id" not in note

  def test_with_meta(self):
    note = build_prompt_list_changed_notification({"k": 1})
    assert note["params"]["_meta"] == {"k": 1}

  def test_rejects_request_with_id(self):
    assert not is_valid_prompt_list_changed_notification({"jsonrpc": "2.0", "id": 1, "method": "notifications/prompts/list_changed"})

  def test_may_complete(self):
    assert may_complete_prompt_argument()


# ─── Method-name constants (parity with TS string literals) ───────────────────


class TestMethodConstants:
  def test_method_strings(self):
    assert PROMPTS_LIST_METHOD == "prompts/list"
    assert PROMPTS_GET_METHOD == "prompts/get"
    assert PROMPTS_LIST_CHANGED_METHOD == "notifications/prompts/list_changed"

  def test_error_code_constants(self):
    # AC-28.36: -32602 for invalid params, -32603 for internal.
    assert PROMPTS_INVALID_PARAMS_CODE == -32602
    assert PROMPTS_INTERNAL_ERROR_CODE == -32603

  def test_mrtr_input_required_value(self):
    # AC-28.35: the input_required signal matches the S17 discriminator value.
    assert MRTR_RESULT_TYPE_INPUT_REQUIRED == "input_required"


# ─── AC-28.1: user-controlled, no required UI ─────────────────────────────────


class TestUserControlled:
  def test_no_ui_pattern_field(self):
    # A prompt is fully usable as plain data with no slash-command / ui field.
    assert is_valid_prompt(CODE_REVIEW_PROMPT)
    assert "slashCommand" not in CODE_REVIEW_PROMPT
    assert "ui" not in CODE_REVIEW_PROMPT


# ─── AC-28.2 / AC-28.3 / AC-28.4 / AC-28.5 / AC-28.6: capability + gating ──────


class TestCapabilityExtended:
  def test_declares_with_listchanged_present(self):
    # AC-28.2
    assert server_declares_prompts({"prompts": {}})
    assert server_declares_prompts({"prompts": {"listChanged": True}})

  def test_undeclared_is_false(self):
    # AC-28.3
    assert not server_declares_prompts({})
    assert not server_declares_prompts({"tools": {}})

  def test_gating_both_methods(self):
    # AC-28.3: both prompts/list and prompts/get gated on the capability.
    assert not may_call_prompt_method(PROMPTS_LIST_METHOD, {})
    assert not may_call_prompt_method(PROMPTS_GET_METHOD, {})
    assert may_call_prompt_method(PROMPTS_LIST_METHOD, {"prompts": {}})
    assert may_call_prompt_method(PROMPTS_GET_METHOD, {"prompts": {}})

  def test_capability_listchanged_optional(self):
    # AC-28.4: listChanged present (true/false) accepted; bare {} accepted.
    assert is_valid_prompts_capability({"listChanged": True})
    assert is_valid_prompts_capability({"listChanged": False})
    assert is_valid_prompts_capability({})

  def test_capability_rejects_non_boolean_listchanged(self):
    # AC-28.4
    assert not is_valid_prompts_capability({"listChanged": "yes"})

  def test_capability_rejects_non_object(self):
    assert not is_valid_prompts_capability("nope")
    assert not is_valid_prompts_capability(None)

  def test_may_expect_only_when_true(self):
    # AC-28.5 / AC-28.6
    assert may_expect_prompts_list_changed({"prompts": {"listChanged": True}})
    assert not may_expect_prompts_list_changed({"prompts": {}})
    assert not may_expect_prompts_list_changed({"prompts": {"listChanged": False}})
    assert not may_expect_prompts_list_changed({})


# ─── AC-28.7 – AC-28.10: available-set semantics (modeled via list result) ─────


class TestAvailableSetSemantics:
  def test_list_carries_current_page(self):
    # AC-28.7
    result = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[CODE_REVIEW_PROMPT], ttl_ms=0, cache_scope="public")
    )
    assert len(result["prompts"]) == 1
    assert result["prompts"][0]["name"] == "code_review"

  def test_empty_set_valid_and_may_change(self):
    # AC-28.8
    empty = build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public"))
    assert is_valid_list_prompts_result(empty)
    assert empty["prompts"] == []
    one = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[CODE_REVIEW_PROMPT], ttl_ms=0, cache_scope="public")
    )
    assert len(empty["prompts"]) != len(one["prompts"])

  def test_deterministic_independent_of_intervening_calls(self):
    # AC-28.9
    first = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[CODE_REVIEW_PROMPT], ttl_ms=0, cache_scope="public")
    )
    build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public"))
    second = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[CODE_REVIEW_PROMPT], ttl_ms=0, cache_scope="public")
    )
    assert second == first

  def test_set_may_vary_by_authorization(self):
    # AC-28.10
    for_scope_a = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[CODE_REVIEW_PROMPT], ttl_ms=0, cache_scope="private")
    )
    for_scope_b = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="private")
    )
    assert for_scope_a["prompts"] != for_scope_b["prompts"]


# ─── AC-28.11 / AC-28.13 / AC-28.41: prompts/list request cursor ──────────────


class TestListRequestParams:
  def test_cursor_optional(self):
    # AC-28.11: cursor may be omitted (first-page request is {}).
    assert is_valid_list_prompts_request_params({})

  def test_cursor_carried_verbatim(self):
    # AC-28.11: a held cursor is opaque, carried verbatim.
    assert is_valid_list_prompts_request_params({"cursor": "next-page-cursor"})

  def test_empty_string_is_valid_present_cursor(self):
    # AC-28.11: the empty string is a valid PRESENT cursor.
    assert is_valid_list_prompts_request_params({"cursor": ""})

  def test_non_string_cursor_rejected(self):
    assert not is_valid_list_prompts_request_params({"cursor": 5})

  def test_non_object_rejected(self):
    assert not is_valid_list_prompts_request_params(None)

  def test_meta_must_be_object(self):
    assert is_valid_list_prompts_request_params({"_meta": {"k": 1}})
    assert not is_valid_list_prompts_request_params({"_meta": "x"})

  def test_nextcursor_echoable_as_cursor(self):
    # AC-28.13: a present nextCursor can be echoed back as a follow-up cursor.
    result = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public", next_cursor="next-page-cursor")
    )
    assert result["nextCursor"] == "next-page-cursor"
    assert is_valid_list_prompts_request_params({"cursor": result["nextCursor"]})


# ─── AC-28.12: prompts REQUIRED, MAY be empty ─────────────────────────────────


class TestListResultExtended:
  def test_rejects_missing_prompts(self):
    # AC-28.12
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "ttlMs": 0, "cacheScope": "public"}
    )

  def test_accepts_empty_prompts(self):
    # AC-28.12
    assert is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 0, "cacheScope": "public"}
    )

  def test_rejects_invalid_prompt_in_list(self):
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [{"arguments": []}], "ttlMs": 0, "cacheScope": "public"}
    )

  # AC-28.13: nextCursor opaque follow-up.
  def test_absent_nextcursor_means_last_page(self):
    result = build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public"))
    assert "nextCursor" not in result

  def test_non_string_nextcursor_rejected(self):
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "nextCursor": 7, "ttlMs": 0, "cacheScope": "public"}
    )

  # AC-28.14 / AC-28.15 / AC-28.16: ttlMs.
  def test_ttl_zero_and_positive_accepted(self):
    assert is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 0, "cacheScope": "public"}
    )
    assert is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 600000, "cacheScope": "public"}
    )

  def test_negative_ttl_rejected(self):
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": -1, "cacheScope": "public"}
    )

  def test_missing_ttl_rejected(self):
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "cacheScope": "public"}
    )

  def test_boolean_ttl_rejected(self):
    # bool is a subclass of int; ttlMs must be a real integer.
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": True, "cacheScope": "public"}
    )

  def test_build_carries_ttl_verbatim(self):
    zero = build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public"))
    assert zero["ttlMs"] == 0
    pos = build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=600000, cache_scope="public"))
    assert pos["ttlMs"] == 600000

  def test_build_rejects_float_ttl(self):
    with pytest.raises(ValueError):
      build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=1.5, cache_scope="public"))

  # AC-28.17: cacheScope.
  def test_cachescope_public_and_private(self):
    assert is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 0, "cacheScope": "public"}
    )
    assert is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 0, "cacheScope": "private"}
    )

  def test_cachescope_unknown_or_missing_rejected(self):
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 0, "cacheScope": "shared"}
    )
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 0}
    )

  # AC-28.18: resultType complete; absent ⇒ complete.
  def test_build_sets_complete(self):
    result = build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public"))
    assert result["resultType"] == "complete"

  def test_resolve_absent_result_type_is_complete(self):
    assert resolve_list_prompts_result_type({}) == "complete"
    assert resolve_list_prompts_result_type({"resultType": None}) == "complete"
    assert resolve_list_prompts_result_type({"resultType": "complete"}) == "complete"

  def test_non_complete_result_type_rejected(self):
    # §18.2 fixes a list result to "complete"; any other literal is rejected.
    assert not is_valid_list_prompts_result(
      {"resultType": "input_required", "prompts": [], "ttlMs": 0, "cacheScope": "public"}
    )

  # AC-28.19: _meta optional.
  def test_meta_optional(self):
    with_meta = build_list_prompts_result(
      ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public", meta={"k": 1})
    )
    assert with_meta["_meta"] == {"k": 1}
    without = build_list_prompts_result(ListPromptsResultConfig(prompts=[], ttl_ms=0, cache_scope="public"))
    assert "_meta" not in without
    assert is_valid_list_prompts_result(without)

  def test_meta_must_be_object(self):
    assert not is_valid_list_prompts_result(
      {"resultType": "complete", "prompts": [], "ttlMs": 0, "cacheScope": "public", "_meta": "x"}
    )


# ─── AC-28.21 – AC-28.26: Prompt / PromptArgument fields & display fallback ────


class TestPromptFields:
  def test_name_required(self):
    # AC-28.21: rejects a prompt with no name.
    assert not is_valid_prompt({"title": "x"})

  def test_display_name_fallback(self):
    # AC-28.21 / AC-28.26: name used for display when title absent.
    assert resolve_display_name("code_review", None) == "code_review"
    assert resolve_display_name("code_review", "Request Code Review") == "Request Code Review"

  def test_absent_or_empty_arguments_require_none(self):
    # AC-28.22
    assert is_valid_prompt({"name": "greeting"})
    assert required_argument_names({"name": "greeting"}) == []
    assert required_argument_names({"name": "g", "arguments": []}) == []

  def test_required_argument_names_reports_required(self):
    # AC-28.27
    assert required_argument_names(CODE_REVIEW_PROMPT) == ["code"]

  def test_icons_carried_and_optional(self):
    # AC-28.23 / AC-28.24 / AC-28.25: icons field carried (rules owned by S20).
    assert is_valid_prompt(CODE_REVIEW_PROMPT)
    assert CODE_REVIEW_PROMPT["icons"][0]["mimeType"] == "image/svg+xml"
    assert is_valid_prompt({"name": "x"})  # without icons
    assert is_valid_prompt({"name": "x", "icons": [{"src": "https://example.com/i.png"}]})

  def test_icons_must_be_list(self):
    assert not is_valid_prompt({"name": "x", "icons": "not-a-list"})

  def test_argument_name_required(self):
    # AC-28.26
    assert not is_valid_prompt_argument({"description": "x"})

  def test_argument_named_and_display_fallback(self):
    # AC-28.26
    arg = {"name": "code", "required": True}
    assert is_valid_prompt_argument(arg)
    assert resolve_display_name(arg["name"], arg.get("title")) == "code"

  def test_argument_description_must_be_string(self):
    assert not is_valid_prompt_argument({"name": "x", "description": 7})


# ─── AC-28.27 / AC-28.29 / AC-28.30: get request validation & errors ──────────


class TestValidateRequestExtended:
  def test_omitted_required_argument_is_minus_32602(self):
    # AC-28.27
    out = validate_get_prompt_request({"name": "code_review", "arguments": {}}, [CODE_REVIEW_PROMPT])
    assert not out.ok
    assert out.error["code"] == -32602
    assert "code" in out.error["message"]

  def test_supplied_required_argument_accepted(self):
    # AC-28.27
    out = validate_get_prompt_request({"name": "code_review", "arguments": {"code": "x"}}, [CODE_REVIEW_PROMPT])
    assert out.ok

  def test_unknown_name_is_minus_32602(self):
    # AC-28.29
    out = validate_get_prompt_request({"name": "does_not_exist"}, [CODE_REVIEW_PROMPT])
    assert not out.ok
    assert out.error["code"] == -32602
    assert "does_not_exist" in out.error["message"]
    assert build_unknown_prompt_error("does_not_exist")["code"] == PROMPTS_INVALID_PARAMS_CODE

  def test_matching_name_via_array_or_map(self):
    # AC-28.29
    assert validate_get_prompt_request(
      {"name": "code_review", "arguments": {"code": "x"}}, [CODE_REVIEW_PROMPT]
    ).ok
    as_map = {CODE_REVIEW_PROMPT["name"]: CODE_REVIEW_PROMPT}
    assert validate_get_prompt_request({"name": "code_review", "arguments": {"code": "x"}}, as_map).ok

  def test_reports_every_missing_required(self):
    # AC-28.30
    multi = {
      "name": "p",
      "arguments": [
        {"name": "a", "required": True},
        {"name": "b", "required": True},
        {"name": "c"},
      ],
    }
    out = validate_get_prompt_request({"name": "p", "arguments": {"a": "1"}}, [multi])
    assert not out.ok
    assert out.error["code"] == -32602
    assert "b" in out.error["message"]

  def test_missing_argument_error_lists_names(self):
    # AC-28.30
    err = build_missing_argument_error(["x", "y"])
    assert err["code"] == -32602
    assert "x, y" in err["message"]


# ─── AC-28.28 / AC-28.29 / AC-28.31 / AC-28.32: get request params shape ──────


class TestGetRequestParams:
  def test_accepts_mrtr_retry_fields(self):
    # AC-28.28: request params accept inputResponses and requestState.
    assert is_valid_get_prompt_request_params(
      {
        "name": "code_review",
        "arguments": {"code": "x"},
        "inputResponses": {"confirm": {"action": "accept"}},
        "requestState": "opaque-server-state-blob",
        "_meta": META,
      }
    )

  def test_name_required(self):
    # AC-28.29: rejects request params with no name.
    assert not is_valid_get_prompt_request_params({"arguments": {}, "_meta": META})

  def test_meta_required(self):
    # _meta is REQUIRED on a client request (S04).
    assert not is_valid_get_prompt_request_params({"name": "code_review"})

  def test_arguments_must_be_string_map(self):
    assert is_valid_get_prompt_request_params({"name": "p", "arguments": {"a": "1"}, "_meta": META})
    assert not is_valid_get_prompt_request_params({"name": "p", "arguments": {"a": 1}, "_meta": META})
    assert not is_valid_get_prompt_request_params({"name": "p", "arguments": ["a"], "_meta": META})

  def test_input_responses_must_be_object(self):
    assert not is_valid_get_prompt_request_params(
      {"name": "p", "inputResponses": [], "_meta": META}
    )

  def test_request_state_must_be_string_and_verbatim(self):
    # AC-28.32: requestState echoed verbatim & opaque.
    state = "opaque-server-state-blob"
    params = {"name": "code_review", "requestState": state, "_meta": META}
    assert is_valid_get_prompt_request_params(params)
    assert params["requestState"] == state
    assert not is_valid_get_prompt_request_params(
      {"name": "p", "requestState": 5, "_meta": META}
    )

  def test_input_responses_key_correlation(self):
    # AC-28.31: an inputResponses key matches the server inputRequests key.
    params = {
      "name": "code_review",
      "arguments": {"code": "x"},
      "inputResponses": {"confirm": {"action": "accept", "content": {"approved": True}}},
      "requestState": "opaque-server-state-blob",
      "_meta": META,
    }
    assert is_valid_get_prompt_request_params(params)
    assert list(params["inputResponses"].keys()) == ["confirm"]

  def test_non_object_rejected(self):
    assert not is_valid_get_prompt_request_params(None)


# ─── AC-28.33 / AC-28.34: GetPromptResult messages & resultType ───────────────


class TestGetResultExtended:
  def test_rejects_missing_messages(self):
    # AC-28.33
    assert not is_valid_get_prompt_result({"resultType": "complete"})

  def test_accepts_one_and_several_messages(self):
    # AC-28.33
    one = build_get_prompt_result(GetPromptResultConfig(messages=[MSG]))
    assert len(one["messages"]) == 1
    several = build_get_prompt_result(
      GetPromptResultConfig(
        messages=[
          {"role": "user", "content": {"type": "text", "text": "hi"}},
          {"role": "assistant", "content": {"type": "text", "text": "hello"}},
        ]
      )
    )
    assert len(several["messages"]) == 2
    assert is_valid_get_prompt_result(several)

  def test_build_sets_complete(self):
    # AC-28.34
    result = build_get_prompt_result(GetPromptResultConfig(messages=[MSG]))
    assert result["resultType"] == "complete"

  def test_resolve_absent_result_type_is_complete(self):
    # AC-28.34
    assert resolve_get_prompt_result_type({}) == "complete"
    assert resolve_get_prompt_result_type({"resultType": None}) == "complete"

  def test_description_optional_and_typed(self):
    assert is_valid_get_prompt_result({"messages": [MSG], "description": "d"})
    assert not is_valid_get_prompt_result({"messages": [MSG], "description": 7})

  def test_meta_must_be_object(self):
    assert not is_valid_get_prompt_result({"messages": [MSG], "_meta": "x"})

  def test_invalid_message_rejected(self):
    assert not is_valid_get_prompt_result({"messages": [{"role": "system", "content": {"type": "text", "text": "x"}}]})


# ─── AC-28.35: input_required alternative & resultType inspection ─────────────


class TestDiscriminationExtended:
  def test_complete(self):
    out = discriminate_get_prompt_response(
      {"resultType": "complete", "messages": [{"role": "user", "content": {"type": "text", "text": "x"}}]}
    )
    assert out.kind == "complete"
    assert len(out.result["messages"]) == 1

  def test_absent_result_type_is_complete(self):
    # AC-28.35 / R-18.4-p
    out = discriminate_get_prompt_response(
      {"messages": [{"role": "user", "content": {"type": "text", "text": "x"}}]}
    )
    assert out.kind == "complete"
    assert out.result["resultType"] == "complete"

  def test_input_required_branch_carries_state(self):
    # AC-28.35
    out = discriminate_get_prompt_response(
      {
        "resultType": "input_required",
        "inputRequests": {"confirm": {"method": "elicitation/create", "params": {}}},
        "requestState": "opaque-server-state-blob",
      }
    )
    assert out.kind == "input_required"
    assert out.result["requestState"] == "opaque-server-state-blob"

  def test_unrecognized_result_type_is_error(self):
    # AC-28.35: MUST NOT parse the body on an unrecognized resultType.
    out = discriminate_get_prompt_response({"resultType": "totally_made_up", "messages": []})
    assert out.kind == "error"
    assert out.result_type == "totally_made_up"

  def test_malformed_complete_is_error(self):
    out = discriminate_get_prompt_response({"resultType": "complete", "messages": "no"})
    assert out.kind == "error"

  def test_malformed_input_required_is_error(self):
    # An input_required with neither inputRequests nor requestState is malformed.
    out = discriminate_get_prompt_response({"resultType": "input_required"})
    assert out.kind == "error"

  def test_non_object_is_error(self):
    out = discriminate_get_prompt_response("nope")
    assert out.kind == "error"

  def test_input_required_validator_reexport(self):
    # AC-28.35: the S17 InputRequiredResult validator is re-exported.
    assert is_valid_prompts_input_required_result(
      {"resultType": "input_required", "requestState": "s"}
    )
    assert not is_valid_prompts_input_required_result({"resultType": "complete"})


# ─── AC-28.36: error code mapping ─────────────────────────────────────────────


class TestErrorModelExtended:
  def test_unknown_and_missing_both_minus_32602(self):
    assert build_unknown_prompt_error("x")["code"] == -32602
    assert build_missing_argument_error(["x"])["code"] == -32602
    assert PROMPTS_INVALID_PARAMS_CODE == -32602

  def test_internal_failure_minus_32603(self):
    err = build_prompt_internal_error("db down")
    assert err["code"] == -32603
    assert "db down" in err["message"]
    assert PROMPTS_INTERNAL_ERROR_CODE == -32603

  def test_internal_without_detail(self):
    assert build_prompt_internal_error()["message"] == "Internal error"


# ─── AC-28.37 / AC-28.38: PromptMessage role & single content block ───────────


class TestPromptMessageExtended:
  def test_user_and_assistant_roles(self):
    # AC-28.37
    assert is_valid_prompt_message({"role": "user", "content": {"type": "text", "text": "x"}})
    assert is_valid_prompt_message({"role": "assistant", "content": {"type": "text", "text": "x"}})

  def test_invalid_role_rejected(self):
    # AC-28.37
    assert not is_valid_prompt_message({"role": "system", "content": {"type": "text", "text": "x"}})

  def test_content_array_rejected(self):
    # AC-28.37: content is a single object, not an array.
    assert not is_valid_prompt_message({"role": "user", "content": [{"type": "text", "text": "x"}]})

  def test_all_valid_content_kinds(self):
    # AC-28.37
    kinds = [
      {"type": "text", "text": "x"},
      {"type": "image", "data": "aGk=", "mimeType": "image/png"},
      {"type": "audio", "data": "aGk=", "mimeType": "audio/wav"},
      {"type": "resource_link", "uri": "file:///a", "name": "a"},
      {"type": "resource", "resource": {"uri": "file:///a", "text": "hi"}},
    ]
    for content in kinds:
      assert is_valid_prompt_message({"role": "user", "content": content})

  def test_missing_role_or_content_rejected(self):
    # AC-28.37
    assert not is_valid_prompt_message({"content": {"type": "text", "text": "x"}})
    assert not is_valid_prompt_message({"role": "user"})

  def test_resource_link_content(self):
    # AC-28.38: a resource_link supplies fetchable context.
    msg = {"role": "user", "content": {"type": "resource_link", "uri": "file:///doc.md", "name": "doc"}}
    assert is_valid_prompt_message(msg)
    assert msg["content"]["type"] == "resource_link"


# ─── AC-28.39 / AC-28.40 / AC-28.41: list_changed method, params, gating ──────


class TestListChangedExtended:
  def test_exact_method_and_jsonrpc(self):
    # AC-28.39
    note = build_prompt_list_changed_notification()
    assert note["method"] == "notifications/prompts/list_changed"
    assert note["jsonrpc"] == "2.0"

  def test_one_way_no_id(self):
    # AC-28.39
    note = build_prompt_list_changed_notification()
    assert "id" not in note
    assert is_valid_prompt_list_changed_notification(note)

  def test_gating_emit_expectation(self):
    # AC-28.39
    assert may_expect_prompts_list_changed({"prompts": {"listChanged": True}})
    assert not may_expect_prompts_list_changed({"prompts": {}})

  def test_wire_example_parses(self):
    # AC-28.39
    assert is_valid_prompt_list_changed_notification(
      {"jsonrpc": "2.0", "method": "notifications/prompts/list_changed"}
    )

  def test_params_meta_only(self):
    # AC-28.40
    note = build_prompt_list_changed_notification({"trace": "abc"})
    assert note["params"]["_meta"] == {"trace": "abc"}
    assert is_valid_prompt_list_changed_notification(note)

  def test_absent_params(self):
    # AC-28.40
    note = build_prompt_list_changed_notification()
    assert "params" not in note

  def test_params_schema_accepts_meta(self):
    # AC-28.40
    assert is_valid_prompt_list_changed_notification_params({"_meta": {"k": 1}})
    assert is_valid_prompt_list_changed_notification_params({})

  def test_params_schema_rejects_non_object_meta_and_non_object(self):
    assert not is_valid_prompt_list_changed_notification_params({"_meta": "x"})
    assert not is_valid_prompt_list_changed_notification_params(None)

  def test_notification_rejects_invalid_params(self):
    assert not is_valid_prompt_list_changed_notification(
      {"jsonrpc": "2.0", "method": "notifications/prompts/list_changed", "params": "bad"}
    )

  def test_rejects_wrong_jsonrpc_or_method(self):
    assert not is_valid_prompt_list_changed_notification(
      {"jsonrpc": "1.0", "method": "notifications/prompts/list_changed"}
    )
    assert not is_valid_prompt_list_changed_notification(
      {"jsonrpc": "2.0", "method": "notifications/tools/list_changed"}
    )

  def test_client_reaction_can_relist(self):
    # AC-28.41: after a well-formed notification, a client may re-issue prompts/list.
    note = build_prompt_list_changed_notification()
    assert is_valid_prompt_list_changed_notification(note)
    assert is_valid_list_prompts_request_params({})
