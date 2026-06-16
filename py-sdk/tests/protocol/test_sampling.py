"""Tests for Sampling (Deprecated) (§21.2). Mirrors the TS acceptance criteria
AC-33.1 … AC-33.25 plus edge cases.
"""

from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.sampling import (
  CLIENT_MODIFIABLE_REQUEST_FIELDS,
  DEFAULT_TOOL_CHOICE,
  DEPRECATED_INCLUDE_CONTEXT_VALUES,
  INCLUDE_CONTEXT_VALUES,
  REQUIRED_CONSENT_OBLIGATIONS,
  RESULT_TYPE_COMPLETE,
  SAMPLING_DEPRECATED,
  SAMPLING_INPUT_REQUEST_METHOD,
  SAMPLING_METHOD,
  SAMPLING_REPLACEMENT_GUIDANCE,
  STANDARD_STOP_REASONS,
  TOOL_CHOICE_MODES,
  SamplingConsentObligations,
  as_content_array,
  build_sampling_tools_not_declared_error,
  clamp_to_max_tokens,
  gate_sampling_tool_use,
  is_client_modifiable_request_field,
  is_deprecated_include_context,
  is_sampling_deprecated,
  is_standard_stop_reason,
  is_tool_enabled_request,
  is_tool_result_content,
  is_tool_use_content,
  is_valid_create_message_request_params,
  is_valid_model_hint,
  is_valid_model_preferences,
  is_valid_sampling_content,
  is_valid_sampling_content_block,
  is_valid_sampling_create_message_result,
  is_valid_sampling_input_request,
  is_valid_sampling_message,
  is_valid_sampling_tool,
  is_valid_tool_choice,
  may_server_send_sampling_request,
  preserve_content_meta,
  resolve_include_context,
  resolve_tool_choice,
  select_first_hint_match,
  tool_result_is_error,
  unmet_required_consent_obligations,
  validate_sampling_message_ordering,
  validate_sampling_request,
  validate_tool_result_references,
  validate_user_tool_result_exclusivity,
  within_tool_loop_limit,
)

TOOL_USE = {"type": "tool_use", "id": "u1", "name": "calc", "input": {}}
TOOL_RESULT = {"type": "tool_result", "toolUseId": "u1", "content": []}
TEXT = {"type": "text", "text": "hi"}

USER_TEXT_MESSAGE = {"role": "user", "content": {"type": "text", "text": "What is the capital of France?"}}

DECLARED_SAMPLING = {"sampling": {}}
DECLARED_SAMPLING_TOOLS = {"sampling": {"tools": {}}}
DECLARED_SAMPLING_CONTEXT = {"sampling": {"context": {}}}


class TestDeprecation:
  def test_deprecated(self):
    assert is_sampling_deprecated()


class TestContent:
  def test_tool_use(self):
    assert is_tool_use_content(TOOL_USE)
    assert not is_tool_use_content({"type": "tool_use", "id": "x"})

  def test_tool_result(self):
    assert is_tool_result_content(TOOL_RESULT)
    assert not is_tool_result_content({"type": "tool_result"})

  def test_content_block_union(self):
    assert is_valid_sampling_content_block(TEXT)
    assert is_valid_sampling_content_block(TOOL_USE)
    assert not is_valid_sampling_content_block({"type": "resource_link", "uri": "x", "name": "n"})

  def test_as_content_array(self):
    assert as_content_array(TEXT) == [TEXT]
    assert as_content_array([TEXT]) == [TEXT]

  def test_message(self):
    assert is_valid_sampling_message({"role": "user", "content": TEXT})
    assert is_valid_sampling_message({"role": "assistant", "content": [TOOL_USE]})
    assert not is_valid_sampling_message({"role": "system", "content": TEXT})


class TestModelPreferences:
  def test_hint_match_first(self):
    hints = [{"name": "haiku"}, {"name": "opus"}]
    assert select_first_hint_match(hints, ["claude-opus", "claude-haiku"]) == {"hint": {"name": "haiku"}, "model": "claude-haiku"}

  def test_no_match(self):
    assert select_first_hint_match([{"name": "z"}], ["a", "b"]) is None
    assert select_first_hint_match(None, ["a"]) is None


class TestToolChoiceAndContext:
  def test_resolve_tool_choice_default(self):
    assert resolve_tool_choice(None) == DEFAULT_TOOL_CHOICE
    assert resolve_tool_choice({"mode": "required"}) == {"mode": "required"}
    assert resolve_tool_choice({}) == {"mode": "auto"}

  def test_include_context(self):
    assert resolve_include_context({}) == "none"
    assert is_deprecated_include_context("allServers")
    assert not is_deprecated_include_context("none")


class TestRequestParams:
  def test_valid(self):
    assert is_valid_create_message_request_params({"messages": [{"role": "user", "content": TEXT}], "maxTokens": 100})

  def test_missing_required(self):
    assert not is_valid_create_message_request_params({"messages": []})  # no maxTokens
    assert not is_valid_create_message_request_params({"maxTokens": 1})  # no messages

  def test_tool_enabled(self):
    assert is_tool_enabled_request({"tools": []})
    assert is_tool_enabled_request({"toolChoice": {}})
    assert not is_tool_enabled_request({})

  def test_clamp(self):
    assert clamp_to_max_tokens(50, 100) == 50
    assert clamp_to_max_tokens(150, 100) == 100


class TestResult:
  def test_valid(self):
    assert is_valid_sampling_create_message_result({"role": "assistant", "content": TEXT, "model": "m", "resultType": "complete"})

  def test_standard_stop_reasons(self):
    assert is_standard_stop_reason("endTurn")
    assert not is_standard_stop_reason("custom")  # open string, but not "standard"

  def test_invalid(self):
    assert not is_valid_sampling_create_message_result({"role": "assistant", "content": TEXT, "model": "m"})  # no resultType


class TestGating:
  CAPS_TOOLS = {"sampling": {"tools": {}}}

  def test_gate_tool_use(self):
    assert gate_sampling_tool_use({"sampling": {}}, {}).ok  # not tool-enabled
    assert gate_sampling_tool_use(self.CAPS_TOOLS, {"tools": []}).ok
    res = gate_sampling_tool_use({"sampling": {}}, {"tools": []})
    assert not res.ok and res.error["code"] == INVALID_PARAMS_CODE

  def test_server_may_send(self):
    assert may_server_send_sampling_request({"sampling": {}}, {})
    assert not may_server_send_sampling_request({}, {})  # sampling not declared
    assert not may_server_send_sampling_request({"sampling": {}}, {"tools": []})  # tool-enabled, no sampling.tools
    assert not may_server_send_sampling_request({"sampling": {}}, {"includeContext": "allServers"})  # context gate

  def test_validate_request(self):
    ok = validate_sampling_request({"sampling": {}}, {"messages": [{"role": "user", "content": TEXT}], "maxTokens": 10})
    assert ok.ok
    bad = validate_sampling_request({"sampling": {}}, {"messages": []})
    assert not bad.ok


class TestContentConstraints:
  def test_user_exclusivity(self):
    assert validate_user_tool_result_exclusivity({"role": "user", "content": [TOOL_RESULT]})["ok"]
    assert not validate_user_tool_result_exclusivity({"role": "user", "content": [TOOL_RESULT, TEXT]})["ok"]
    assert validate_user_tool_result_exclusivity({"role": "user", "content": [TEXT]})["ok"]

  def test_ordering_valid(self):
    messages = [
      {"role": "assistant", "content": [TOOL_USE]},
      {"role": "user", "content": [TOOL_RESULT]},
    ]
    assert validate_sampling_message_ordering(messages)["ok"]

  def test_ordering_missing_followup(self):
    res = validate_sampling_message_ordering([{"role": "assistant", "content": [TOOL_USE]}])
    assert not res["ok"] and res["index"] == 0

  def test_ordering_unmatched_id(self):
    messages = [
      {"role": "assistant", "content": [TOOL_USE]},
      {"role": "user", "content": [{"type": "tool_result", "toolUseId": "other", "content": []}]},
    ]
    assert not validate_sampling_message_ordering(messages)["ok"]

  def test_tool_result_references(self):
    good = [{"role": "assistant", "content": [TOOL_USE]}, {"role": "user", "content": [TOOL_RESULT]}]
    assert validate_tool_result_references(good)["ok"]
    bad = [{"role": "user", "content": [TOOL_RESULT]}]  # result before any use
    assert not validate_tool_result_references(bad)["ok"]


class TestMetaAndConsent:
  def test_preserve_meta(self):
    block = {"type": "tool_use", "id": "u1", "name": "c", "input": {}, "_meta": {"k": 1}}
    copy = preserve_content_meta(block)
    assert copy == block and copy is not block
    assert preserve_content_meta(TEXT) is TEXT

  def test_client_modifiable_fields(self):
    assert is_client_modifiable_request_field("temperature")
    assert not is_client_modifiable_request_field("messages")

  def test_consent_obligations(self):
    assert "human_in_the_loop" in REQUIRED_CONSENT_OBLIGATIONS
    unmet = unmet_required_consent_obligations(SamplingConsentObligations())
    assert set(unmet) == set(REQUIRED_CONSENT_OBLIGATIONS)
    met = SamplingConsentObligations(human_in_the_loop=True, user_may_deny=True, handle_sensitive_data=True)
    assert unmet_required_consent_obligations(met) == []

  def test_tool_loop_limit(self):
    assert within_tool_loop_limit(2, 5)
    assert not within_tool_loop_limit(5, 5)


# ─── AC-33.1 — capability treated as Deprecated ───────────────────────────────

class TestAC1Deprecated:
  def test_constant_and_predicate(self):
    assert SAMPLING_DEPRECATED is True
    assert is_sampling_deprecated() is True


# ─── AC-33.2 — directs builders to a model provider ───────────────────────────

class TestAC2ReplacementGuidance:
  def test_names_model_provider_and_deprecated(self):
    assert "model provider" in SAMPLING_REPLACEMENT_GUIDANCE.lower()
    assert "deprecated" in SAMPLING_REPLACEMENT_GUIDANCE.lower()


# ─── AC-33.3 — tool-use gating (server & client) ──────────────────────────────

class TestAC3ToolUseGating:
  def test_server_with_only_sampling_must_not_send_tool_enabled(self):
    assert not may_server_send_sampling_request(DECLARED_SAMPLING, {"tools": [{"name": "t"}]})
    assert not may_server_send_sampling_request(DECLARED_SAMPLING, {"toolChoice": {"mode": "auto"}})

  def test_server_may_send_with_sampling_tools(self):
    assert may_server_send_sampling_request(DECLARED_SAMPLING_TOOLS, {"tools": [{"name": "t"}]})

  def test_client_returns_error_when_tools_without_capability(self):
    gate = gate_sampling_tool_use(DECLARED_SAMPLING, {"tools": [{"name": "t"}]})
    assert not gate.ok
    assert gate.error["code"] == INVALID_PARAMS_CODE
    assert "tools" in gate.error["message"]

  def test_client_returns_error_when_tool_choice_without_capability(self):
    gate = gate_sampling_tool_use(DECLARED_SAMPLING, {"toolChoice": {"mode": "required"}})
    assert not gate.ok
    assert gate.error["code"] == INVALID_PARAMS_CODE
    assert "toolChoice" in gate.error["message"]

  def test_client_accepts_tool_enabled_with_capability(self):
    assert gate_sampling_tool_use(DECLARED_SAMPLING_TOOLS, {"tools": [{"name": "t"}]}).ok

  def test_per_field_error_message(self):
    assert "n)" in build_sampling_tools_not_declared_error("tools")["message"]
    assert "o)" in build_sampling_tools_not_declared_error("toolChoice")["message"]

  def test_non_tool_request_always_allowed(self):
    assert gate_sampling_tool_use(DECLARED_SAMPLING, {}).ok


# ─── AC-33.4 — includeContext deprecation gating ──────────────────────────────

class TestAC4IncludeContextGating:
  def test_omitted_or_none_permitted(self):
    assert may_server_send_sampling_request(DECLARED_SAMPLING, {})
    assert may_server_send_sampling_request(DECLARED_SAMPLING, {"includeContext": "none"})

  def test_deprecated_values_rejected_without_context(self):
    assert not may_server_send_sampling_request(DECLARED_SAMPLING, {"includeContext": "thisServer"})
    assert not may_server_send_sampling_request(DECLARED_SAMPLING, {"includeContext": "allServers"})

  def test_deprecated_values_permitted_with_context(self):
    assert may_server_send_sampling_request(DECLARED_SAMPLING_CONTEXT, {"includeContext": "thisServer"})
    assert may_server_send_sampling_request(DECLARED_SAMPLING_CONTEXT, {"includeContext": "allServers"})

  def test_classifies_deprecated_values(self):
    assert is_deprecated_include_context("thisServer")
    assert is_deprecated_include_context("allServers")
    assert not is_deprecated_include_context("none")
    assert list(DEPRECATED_INCLUDE_CONTEXT_VALUES) == ["thisServer", "allServers"] or set(
      DEPRECATED_INCLUDE_CONTEXT_VALUES
    ) == {"thisServer", "allServers"}
    assert INCLUDE_CONTEXT_VALUES == ("none", "thisServer", "allServers")


# ─── AC-33.5 — messages + maxTokens required ──────────────────────────────────

class TestAC5MessagesAndMaxTokensRequired:
  def test_accepts_well_formed(self):
    assert is_valid_create_message_request_params({"messages": [USER_TEXT_MESSAGE], "maxTokens": 100})

  def test_rejects_missing_messages(self):
    assert not is_valid_create_message_request_params({"maxTokens": 100})

  def test_rejects_missing_max_tokens(self):
    assert not is_valid_create_message_request_params({"messages": [USER_TEXT_MESSAGE]})

  def test_validate_request_rejects_malformed_with_code(self):
    result = validate_sampling_request(DECLARED_SAMPLING, {"messages": [USER_TEXT_MESSAGE]})
    assert not result.ok
    assert result.error["code"] == INVALID_PARAMS_CODE

  def test_preserves_oldest_to_newest_order(self):
    m2 = {"role": "assistant", "content": {"type": "text", "text": "b"}}
    params = {"messages": [USER_TEXT_MESSAGE, m2], "maxTokens": 50}
    assert is_valid_create_message_request_params(params)
    assert params["messages"][0]["role"] == "user"
    assert params["messages"][1]["role"] == "assistant"

  def test_max_tokens_bool_is_not_a_number(self):
    # bools must NOT satisfy the numeric maxTokens requirement.
    assert not is_valid_create_message_request_params({"messages": [USER_TEXT_MESSAGE], "maxTokens": True})


# ─── AC-33.6 — messages not retained between requests ─────────────────────────

class TestAC6PerRequestMessages:
  def test_independent_message_lists(self):
    first = {"messages": [{"role": "user", "content": {"type": "text", "text": "first"}}], "maxTokens": 10}
    second = {"messages": [{"role": "user", "content": {"type": "text", "text": "second"}}], "maxTokens": 10}
    assert is_valid_create_message_request_params(first)
    assert is_valid_create_message_request_params(second)
    assert first["messages"] is not second["messages"]
    assert len(second["messages"]) == 1
    assert as_content_array(second["messages"][0]["content"])[0]["text"] == "second"


# ─── AC-33.7 — advisory/ignorable fields ──────────────────────────────────────

class TestAC7AdvisoryFields:
  def test_accepts_all_advisory_fields(self):
    assert is_valid_create_message_request_params(
      {
        "messages": [USER_TEXT_MESSAGE],
        "maxTokens": 100,
        "modelPreferences": {"costPriority": 0.3},
        "systemPrompt": "You are helpful.",
        "temperature": 0.1,
        "stopSequences": ["STOP"],
        "metadata": {"providerKey": "x"},
      }
    )

  def test_exchange_completes_when_advisory_fields_dropped(self):
    assert is_valid_sampling_create_message_result(
      {"role": "assistant", "content": {"type": "text", "text": "Paris."}, "model": "claude-3-sonnet", "resultType": RESULT_TYPE_COMPLETE}
    )

  def test_the_four_modifiable_fields(self):
    assert CLIENT_MODIFIABLE_REQUEST_FIELDS == (
      "systemPrompt",
      "includeContext",
      "temperature",
      "stopSequences",
      "metadata",
    )

  def test_rejects_bad_advisory_field_types(self):
    base = {"messages": [USER_TEXT_MESSAGE], "maxTokens": 100}
    assert not is_valid_create_message_request_params({**base, "systemPrompt": 5})
    assert not is_valid_create_message_request_params({**base, "temperature": "hot"})
    assert not is_valid_create_message_request_params({**base, "stopSequences": [1, 2]})
    assert not is_valid_create_message_request_params({**base, "metadata": "x"})


# ─── AC-33.8 — includeContext may be modified/ignored ─────────────────────────

class TestAC8IncludeContextModifiable:
  def test_include_context_is_modifiable_field(self):
    assert is_client_modifiable_request_field("includeContext")

  def test_resolves_omitted_to_none(self):
    assert resolve_include_context({}) == "none"
    assert resolve_include_context({"includeContext": "thisServer"}) == "thisServer"


# ─── AC-33.9 — maxTokens upper bound ──────────────────────────────────────────

class TestAC9MaxTokensUpperBound:
  def test_clamps_over_budget(self):
    assert clamp_to_max_tokens(150, 100) == 100

  def test_leaves_under_budget_unchanged(self):
    assert clamp_to_max_tokens(40, 100) == 40
    assert clamp_to_max_tokens(100, 100) == 100


# ─── AC-33.10 — request-scoped tools ──────────────────────────────────────────

class TestAC10RequestScopedTools:
  def test_accepts_unregistered_tool(self):
    assert is_valid_sampling_tool(
      {"name": "unregistered_tool", "description": "ad-hoc", "inputSchema": {"type": "object", "properties": {}}}
    )

  def test_tools_array_accepted_with_capability(self):
    params = {"messages": [USER_TEXT_MESSAGE], "maxTokens": 1000, "tools": [{"name": "get_weather", "inputSchema": {"type": "object"}}]}
    assert is_valid_create_message_request_params(params)
    assert validate_sampling_request(DECLARED_SAMPLING_TOOLS, params).ok

  def test_rejects_bad_tool(self):
    assert not is_valid_sampling_tool({"description": "no name"})
    assert not is_valid_sampling_tool({"name": "t", "inputSchema": "x"})


# ─── AC-33.11 — toolChoice default ────────────────────────────────────────────

class TestAC11ToolChoiceDefault:
  def test_resolves_to_auto_when_omitted(self):
    assert resolve_tool_choice(None) == {"mode": "auto"}
    assert DEFAULT_TOOL_CHOICE == {"mode": "auto"}

  def test_resolves_to_auto_when_mode_omitted(self):
    assert resolve_tool_choice({}) == {"mode": "auto"}

  def test_keeps_explicit_mode(self):
    assert resolve_tool_choice({"mode": "required"}) == {"mode": "required"}


# ─── AC-33.12 — tool-choice modes ─────────────────────────────────────────────

class TestAC12ToolChoiceModes:
  def test_three_modes_recognized(self):
    assert TOOL_CHOICE_MODES == ("auto", "required", "none")
    assert is_valid_tool_choice({"mode": "required"})
    assert is_valid_tool_choice({"mode": "none"})

  def test_rejects_unknown_mode(self):
    assert not is_valid_tool_choice({"mode": "maybe"})

  def test_required_and_none_yield_well_formed_results(self):
    required_result = is_valid_sampling_create_message_result(
      {"role": "assistant", "content": [{"type": "tool_use", "id": "1", "name": "t", "input": {}}], "model": "m", "stopReason": "toolUse", "resultType": "complete"}
    )
    none_result = is_valid_sampling_create_message_result(
      {"role": "assistant", "content": {"type": "text", "text": "no tools used"}, "model": "m", "stopReason": "endTurn", "resultType": "complete"}
    )
    assert required_result and none_result


# ─── AC-33.13 — SamplingMessage role + content ────────────────────────────────

class TestAC13SamplingMessage:
  def test_accepts_roles_and_single_or_array_content(self):
    assert is_valid_sampling_message(USER_TEXT_MESSAGE)
    assert is_valid_sampling_message(
      {"role": "assistant", "content": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]}
    )

  def test_rejects_missing_role(self):
    assert not is_valid_sampling_message({"content": {"type": "text", "text": "x"}})

  def test_rejects_out_of_set_role(self):
    assert not is_valid_sampling_message({"role": "system", "content": {"type": "text", "text": "x"}})

  def test_rejects_missing_content(self):
    assert not is_valid_sampling_message({"role": "user"})

  def test_content_union_accepts_text_and_tool_blocks(self):
    assert is_valid_sampling_content_block({"type": "text", "text": "x"})
    assert is_valid_sampling_content_block({"type": "tool_use", "id": "1", "name": "t", "input": {}})
    assert is_valid_sampling_content({"type": "text", "text": "x"})


# ─── AC-33.14 — _meta preservation ────────────────────────────────────────────

class TestAC14MetaPreservation:
  def test_preserves_tool_use_meta(self):
    block = {"type": "tool_use", "id": "1", "name": "t", "input": {}, "_meta": {"cacheKey": "k"}}
    carried = preserve_content_meta(block)
    assert carried["_meta"] == {"cacheKey": "k"}
    assert carried is not block

  def test_preserves_tool_result_meta(self):
    block = {"type": "tool_result", "toolUseId": "1", "content": [{"type": "text", "text": "r"}], "_meta": {"cacheKey": "k2"}}
    carried = preserve_content_meta(block)
    assert carried["_meta"] == {"cacheKey": "k2"}
    assert carried is not block

  def test_leaves_non_tool_blocks_unchanged(self):
    text = {"type": "text", "text": "x"}
    assert preserve_content_meta(text) is text


# ─── AC-33.15 — toolUseId matches a prior tool use ────────────────────────────

class TestAC15ToolUseIdReferences:
  def test_accepts_matching_id(self):
    messages = [
      {"role": "assistant", "content": [{"type": "tool_use", "id": "abc", "name": "t", "input": {}}]},
      {"role": "user", "content": [{"type": "tool_result", "toolUseId": "abc", "content": [{"type": "text", "text": "r"}]}]},
    ]
    assert validate_tool_result_references(messages)["ok"]

  def test_rejects_dangling_id(self):
    messages = [
      {"role": "user", "content": [{"type": "tool_result", "toolUseId": "nope", "content": [{"type": "text", "text": "r"}]}]}
    ]
    result = validate_tool_result_references(messages)
    assert not result["ok"]
    assert result["tool_use_id"] == "nope"


# ─── AC-33.16 — ToolResultContent fields ──────────────────────────────────────

class TestAC16ToolResultContentFields:
  def test_content_may_include_all_block_kinds(self):
    assert is_tool_result_content(
      {
        "type": "tool_result",
        "toolUseId": "1",
        "content": [
          {"type": "text", "text": "t"},
          {"type": "image", "data": "YWJj", "mimeType": "image/png"},
          {"type": "audio", "data": "YWJj", "mimeType": "audio/wav"},
          {"type": "resource_link", "uri": "file:///x", "name": "x"},
          {"type": "resource", "resource": {"uri": "file:///y", "text": "hi"}},
        ],
      }
    )

  def test_structured_content_accepts_any_json(self):
    assert is_tool_result_content({"type": "tool_result", "toolUseId": "1", "content": [], "structuredContent": {"temp": 18, "ok": True}})

  def test_omitted_is_error_treated_false(self):
    block = {"type": "tool_result", "toolUseId": "1", "content": []}
    assert tool_result_is_error(block) is False
    err_block = {"type": "tool_result", "toolUseId": "1", "content": [], "isError": True}
    assert tool_result_is_error(err_block) is True


# ─── AC-33.17 — user tool-result exclusivity ──────────────────────────────────

class TestAC17UserToolResultExclusivity:
  def test_accepts_only_tool_results(self):
    message = {
      "role": "user",
      "content": [
        {"type": "tool_result", "toolUseId": "1", "content": [{"type": "text", "text": "r"}]},
        {"type": "tool_result", "toolUseId": "2", "content": [{"type": "text", "text": "s"}]},
      ],
    }
    assert validate_user_tool_result_exclusivity(message)["ok"]

  def test_rejects_mixed_tool_result_and_text(self):
    message = {
      "role": "user",
      "content": [
        {"type": "tool_result", "toolUseId": "1", "content": [{"type": "text", "text": "r"}]},
        {"type": "text", "text": "extra"},
      ],
    }
    assert not validate_user_tool_result_exclusivity(message)["ok"]

  def test_user_without_tool_result_unconstrained(self):
    assert validate_user_tool_result_exclusivity(USER_TEXT_MESSAGE)["ok"]

  def test_assistant_not_subject_to_constraint(self):
    assert validate_user_tool_result_exclusivity({"role": "assistant", "content": [{"type": "text", "text": "x"}]})["ok"]


# ─── AC-33.18 — assistant tool_use followed by matching user results ──────────

class TestAC18ToolUseOrdering:
  BASE_USER = {"role": "user", "content": {"type": "text", "text": "weather?"}}

  def test_accepts_parallel_uses(self):
    messages = [
      self.BASE_USER,
      {"role": "assistant", "content": [{"type": "tool_use", "id": "a", "name": "t", "input": {}}, {"type": "tool_use", "id": "b", "name": "u", "input": {}}]},
      {"role": "user", "content": [{"type": "tool_result", "toolUseId": "a", "content": [{"type": "text", "text": "ra"}]}, {"type": "tool_result", "toolUseId": "b", "content": [{"type": "text", "text": "rb"}]}]},
    ]
    assert validate_sampling_message_ordering(messages)["ok"]

  def test_rejects_tool_use_last(self):
    messages = [self.BASE_USER, {"role": "assistant", "content": [{"type": "tool_use", "id": "a", "name": "t", "input": {}}]}]
    assert not validate_sampling_message_ordering(messages)["ok"]

  def test_rejects_non_user_followup(self):
    messages = [
      self.BASE_USER,
      {"role": "assistant", "content": [{"type": "tool_use", "id": "a", "name": "t", "input": {}}]},
      {"role": "assistant", "content": {"type": "text", "text": "oops"}},
    ]
    assert not validate_sampling_message_ordering(messages)["ok"]

  def test_rejects_unmatched_tool_use_id(self):
    messages = [
      self.BASE_USER,
      {"role": "assistant", "content": [{"type": "tool_use", "id": "a", "name": "t", "input": {}}]},
      {"role": "user", "content": [{"type": "tool_result", "toolUseId": "WRONG", "content": [{"type": "text", "text": "r"}]}]},
    ]
    assert not validate_sampling_message_ordering(messages)["ok"]

  def test_rejects_mixed_followup(self):
    messages = [
      self.BASE_USER,
      {"role": "assistant", "content": [{"type": "tool_use", "id": "a", "name": "t", "input": {}}]},
      {"role": "user", "content": [{"type": "tool_result", "toolUseId": "a", "content": [{"type": "text", "text": "r"}]}, {"type": "text", "text": "extra"}]},
    ]
    assert not validate_sampling_message_ordering(messages)["ok"]


# ─── AC-33.19 — CreateMessageResult required fields ───────────────────────────

class TestAC19ResultRequiredFields:
  RESULT = {
    "role": "assistant",
    "content": {"type": "text", "text": "The capital of France is Paris."},
    "model": "claude-3-sonnet-20240307",
    "stopReason": "endTurn",
    "resultType": "complete",
  }

  def test_accepts_fully_specified(self):
    assert is_valid_sampling_create_message_result(self.RESULT)

  def test_rejects_missing_required(self):
    for key in ("role", "content", "model", "resultType"):
      broken = {k: v for k, v in self.RESULT.items() if k != key}
      assert not is_valid_sampling_create_message_result(broken)

  def test_accepts_array_content_with_tool_uses(self):
    assert is_valid_sampling_create_message_result(
      {**self.RESULT, "content": [{"type": "tool_use", "id": "call_abc123", "name": "get_weather", "input": {"city": "Paris"}}], "stopReason": "toolUse"}
    )


# ─── AC-33.20 — open stopReason string ────────────────────────────────────────

class TestAC20OpenStopReason:
  def test_accepts_non_standard_value(self):
    assert is_valid_sampling_create_message_result(
      {"role": "assistant", "content": {"type": "text", "text": "x"}, "model": "m", "stopReason": "provider_specific_reason", "resultType": "complete"}
    )

  def test_classifies_standard_values(self):
    assert STANDARD_STOP_REASONS == ("endTurn", "stopSequence", "maxTokens", "toolUse")
    assert is_standard_stop_reason("toolUse")
    assert not is_standard_stop_reason("custom")


# ─── AC-33.21 — model preferences & hint ordering ─────────────────────────────

class TestAC21HintOrdering:
  def test_first_match_in_order(self):
    hints = [{"name": "gpt-9"}, {"name": "sonnet"}, {"name": "claude"}]
    models = ["claude-3-5-sonnet-20241022", "claude-3-opus"]
    match = select_first_hint_match(hints, models)
    assert match["hint"]["name"] == "sonnet"
    assert match["model"] == "claude-3-5-sonnet-20241022"

  def test_none_when_no_match(self):
    assert select_first_hint_match([{"name": "mistral"}], ["claude-3"]) is None
    assert select_first_hint_match(None, ["claude-3"]) is None

  def test_accepts_full_model_preferences(self):
    assert is_valid_model_preferences(
      {"hints": [{"name": "claude-3-sonnet"}, {"name": "claude"}], "costPriority": 0.3, "speedPriority": 0.5, "intelligencePriority": 0.8}
    )


# ─── AC-33.22 — priority range 0–1 ────────────────────────────────────────────

class TestAC22PriorityRange:
  def test_accepts_in_range_and_omitted(self):
    assert is_valid_model_preferences({})
    assert is_valid_model_preferences({"costPriority": 0})
    assert is_valid_model_preferences({"speedPriority": 1})
    assert is_valid_model_preferences({"intelligencePriority": 0.5})

  def test_rejects_out_of_range(self):
    assert not is_valid_model_preferences({"costPriority": 1.5})
    assert not is_valid_model_preferences({"speedPriority": -0.1})


# ─── AC-33.23 — ModelHint substring/mapping ───────────────────────────────────

class TestAC23ModelHintSubstring:
  def test_treats_hint_name_as_substring(self):
    match = select_first_hint_match([{"name": "claude-3-5-sonnet"}], ["claude-3-5-sonnet-20241022"])
    assert match["model"] == "claude-3-5-sonnet-20241022"

  def test_bare_family_hint_matches(self):
    assert select_first_hint_match([{"name": "claude"}], ["anthropic-claude-x"])["model"] == "anthropic-claude-x"

  def test_model_hint_accepts_name_and_passthrough(self):
    assert is_valid_model_hint({"name": "sonnet"})
    assert is_valid_model_hint({})
    assert is_valid_model_hint({"name": "sonnet", "vendor": "x"})
    assert not is_valid_model_hint({"name": 1})


# ─── AC-33.24 — consent / human-in-the-loop ───────────────────────────────────

class TestAC24Consent:
  FULLY_CONSENTING = SamplingConsentObligations(
    human_in_the_loop=True,
    user_may_deny=True,
    review_prompt_before_sampling=True,
    review_result_before_server=True,
    may_modify_control_fields=True,
    rate_limiting=True,
    validate_content=True,
    handle_sensitive_data=True,
    tool_loop_iteration_limits=True,
  )

  def test_all_must_met_none_unmet(self):
    assert unmet_required_consent_obligations(self.FULLY_CONSENTING) == []

  def test_flags_missing_human_in_the_loop(self):
    obligations = SamplingConsentObligations(**{**vars(self.FULLY_CONSENTING), "human_in_the_loop": False})
    assert "human_in_the_loop" in unmet_required_consent_obligations(obligations)

  def test_flags_missing_deny_ability(self):
    obligations = SamplingConsentObligations(**{**vars(self.FULLY_CONSENTING), "user_may_deny": False})
    assert "user_may_deny" in unmet_required_consent_obligations(obligations)

  def test_modifiable_control_fields_cover_set(self):
    for field in ("systemPrompt", "includeContext", "temperature", "stopSequences", "metadata"):
      assert is_client_modifiable_request_field(field)
    assert not is_client_modifiable_request_field("maxTokens")


# ─── AC-33.25 — safety: rate limit, sensitive data, iteration limits ──────────

class TestAC25Safety:
  def test_must_level_includes_sensitive_data(self):
    assert "handle_sensitive_data" in REQUIRED_CONSENT_OBLIGATIONS

  def test_flags_missing_sensitive_data_must(self):
    unmet = unmet_required_consent_obligations(
      SamplingConsentObligations(
        human_in_the_loop=True,
        user_may_deny=True,
        review_prompt_before_sampling=True,
        review_result_before_server=True,
        may_modify_control_fields=True,
        rate_limiting=False,
        validate_content=False,
        handle_sensitive_data=False,
        tool_loop_iteration_limits=False,
      )
    )
    assert "handle_sensitive_data" in unmet
    # SHOULD-level obligations are advisory and NOT reported as unmet MUSTs.
    assert "rate_limiting" not in unmet

  def test_enforces_iteration_limits(self):
    assert within_tool_loop_limit(0, 5)
    assert within_tool_loop_limit(4, 5)
    assert not within_tool_loop_limit(5, 5)
    assert not within_tool_loop_limit(6, 5)


# ─── Reuse / integration sanity ───────────────────────────────────────────────

class TestReuseIntegration:
  def test_method_matches_s17_input_request(self):
    assert SAMPLING_METHOD == "sampling/createMessage"
    assert SAMPLING_INPUT_REQUEST_METHOD == "sampling/createMessage"

  def test_s17_input_request_accepts_sampling_request(self):
    assert is_valid_sampling_input_request(
      {"method": "sampling/createMessage", "params": {"messages": [USER_TEXT_MESSAGE], "maxTokens": 100}}
    )

  def test_input_request_rejects_wrong_method_or_bad_params(self):
    assert not is_valid_sampling_input_request({"method": "roots/list", "params": {"messages": [USER_TEXT_MESSAGE], "maxTokens": 100}})
    assert not is_valid_sampling_input_request({"method": "sampling/createMessage", "params": {"messages": []}})

  def test_result_satisfies_s17_minimum(self):
    result = {"role": "assistant", "content": {"type": "text", "text": "Paris."}, "model": "claude-3-sonnet", "resultType": "complete"}
    assert is_valid_sampling_create_message_result(result)

  def test_tool_content_guards(self):
    assert is_tool_use_content({"type": "tool_use", "id": "1", "name": "t", "input": {}})
    assert not is_tool_use_content({"type": "text", "text": "x"})
    assert is_tool_result_content({"type": "tool_result", "toolUseId": "1", "content": []})
    assert not is_tool_result_content({"type": "tool_use", "id": "1", "name": "t", "input": {}})

  def test_tool_enabled_request_detection(self):
    assert is_tool_enabled_request({"tools": []})
    assert is_tool_enabled_request({"toolChoice": {"mode": "auto"}})
    assert not is_tool_enabled_request({})


# ─── Edge cases beyond the TS acceptance criteria ─────────────────────────────


class TestEdgeContentBlocks:
  def test_tool_use_requires_string_id_name_and_object_input(self):
    # input MUST be an object (dict), not a list/string.
    assert not is_tool_use_content({"type": "tool_use", "id": "1", "name": "t", "input": []})
    assert not is_tool_use_content({"type": "tool_use", "id": 1, "name": "t", "input": {}})
    assert not is_tool_use_content({"type": "tool_use", "id": "1", "name": 2, "input": {}})

  def test_tool_use_non_dict_and_wrong_type(self):
    assert not is_tool_use_content("nope")
    assert not is_tool_use_content({"type": "text", "text": "x"})

  def test_tool_result_rejects_non_list_content(self):
    assert not is_tool_result_content({"type": "tool_result", "toolUseId": "1", "content": "x"})

  def test_tool_result_rejects_invalid_inner_block(self):
    # An inner block that is not a valid S14 ContentBlock fails the whole result:
    # a malformed text block (missing its ``text`` field) is rejected.
    assert not is_tool_result_content(
      {"type": "tool_result", "toolUseId": "1", "content": [{"type": "text"}]}
    )

  def test_tool_result_rejects_nested_tool_use_in_content(self):
    # tool_use/tool_result are FORBIDDEN as base ContentBlocks (R-14.8-a/-b), so they
    # cannot nest inside a tool_result's content array.
    assert not is_tool_result_content(
      {"type": "tool_result", "toolUseId": "1", "content": [{"type": "tool_use", "id": "1", "name": "t", "input": {}}]}
    )

  def test_tool_result_rejects_non_bool_is_error(self):
    assert not is_tool_result_content({"type": "tool_result", "toolUseId": "1", "content": [], "isError": "yes"})

  def test_tool_result_rejects_non_dict_meta(self):
    assert not is_tool_result_content({"type": "tool_result", "toolUseId": "1", "content": [], "_meta": "x"})

  def test_tool_result_allows_embedded_resource_in_content(self):
    # tool_result.content reuses the full S14 ContentBlock vocabulary (embedded resource).
    assert is_tool_result_content(
      {"type": "tool_result", "toolUseId": "1", "content": [{"type": "resource", "resource": {"uri": "file:///y", "text": "hi"}}]}
    )

  def test_sampling_content_block_excludes_resource_and_link(self):
    # §21.2.6 deliberately excludes resource_link and embedded resource from the union.
    assert not is_valid_sampling_content_block({"type": "resource_link", "uri": "file:///x", "name": "x"})
    assert not is_valid_sampling_content_block({"type": "resource", "resource": {"uri": "file:///y", "text": "hi"}})

  def test_sampling_content_array_with_single_tool_block(self):
    assert as_content_array(TOOL_USE) == [TOOL_USE]
    assert is_valid_sampling_content([TOOL_USE, TOOL_RESULT])

  def test_sampling_content_rejects_array_with_bad_block(self):
    assert not is_valid_sampling_content([TEXT, {"type": "resource_link", "uri": "x", "name": "n"}])


class TestEdgeMessage:
  def test_message_rejects_non_dict_and_bad_meta(self):
    assert not is_valid_sampling_message("nope")
    assert not is_valid_sampling_message({"role": "user", "content": TEXT, "_meta": "x"})

  def test_message_accepts_meta_dict(self):
    assert is_valid_sampling_message({"role": "user", "content": TEXT, "_meta": {"k": 1}})

  def test_message_rejects_invalid_content(self):
    assert not is_valid_sampling_message({"role": "user", "content": {"type": "resource_link", "uri": "x", "name": "n"}})


class TestEdgeModelPreferences:
  def test_rejects_non_dict(self):
    assert not is_valid_model_preferences("nope")
    assert not is_valid_model_hint("nope")

  def test_rejects_non_list_hints_and_bad_hint(self):
    assert not is_valid_model_preferences({"hints": "x"})
    assert not is_valid_model_preferences({"hints": [{"name": 1}]})

  def test_priority_boundaries_inclusive(self):
    assert is_valid_model_preferences({"costPriority": 0})
    assert is_valid_model_preferences({"costPriority": 1})
    assert not is_valid_model_preferences({"costPriority": 1.0001})

  def test_priority_bool_is_not_a_number(self):
    # booleans must not satisfy the numeric priority requirement.
    assert not is_valid_model_preferences({"speedPriority": True})

  def test_hint_with_no_name_is_skipped_then_later_matches(self):
    # A nameless hint is skipped; a later named hint can still match. (R-21.2.9-f)
    match = select_first_hint_match([{}, {"name": "opus"}], ["claude-opus"])
    assert match == {"hint": {"name": "opus"}, "model": "claude-opus"}

  def test_empty_hints_list_returns_none(self):
    assert select_first_hint_match([], ["claude-opus"]) is None


class TestEdgeToolChoiceAndTool:
  def test_tool_choice_rejects_non_dict(self):
    assert not is_valid_tool_choice("auto")

  def test_tool_choice_passthrough_keys(self):
    assert is_valid_tool_choice({"mode": "auto", "extra": 1})
    assert is_valid_tool_choice({})

  def test_sampling_tool_rejects_non_dict_and_bad_description(self):
    assert not is_valid_sampling_tool("nope")
    assert not is_valid_sampling_tool({"name": "t", "description": 5})


class TestEdgeRequestParams:
  def test_rejects_non_dict_and_non_list_messages(self):
    assert not is_valid_create_message_request_params("nope")
    assert not is_valid_create_message_request_params({"messages": "x", "maxTokens": 1})

  def test_rejects_invalid_message_in_list(self):
    assert not is_valid_create_message_request_params({"messages": [{"role": "system", "content": TEXT}], "maxTokens": 1})

  def test_rejects_bad_include_context_value(self):
    assert not is_valid_create_message_request_params({"messages": [USER_TEXT_MESSAGE], "maxTokens": 1, "includeContext": "everywhere"})

  def test_rejects_bad_model_preferences_and_tool_choice(self):
    base = {"messages": [USER_TEXT_MESSAGE], "maxTokens": 1}
    assert not is_valid_create_message_request_params({**base, "modelPreferences": {"costPriority": 2}})
    assert not is_valid_create_message_request_params({**base, "toolChoice": {"mode": "maybe"}})

  def test_rejects_bad_tools_array(self):
    base = {"messages": [USER_TEXT_MESSAGE], "maxTokens": 1}
    assert not is_valid_create_message_request_params({**base, "tools": "x"})
    assert not is_valid_create_message_request_params({**base, "tools": [{"description": "no name"}]})


class TestEdgeIncludeContext:
  def test_resolve_explicit_none(self):
    assert resolve_include_context({"includeContext": "none"}) == "none"

  def test_resolve_deprecated_value_preserved(self):
    assert resolve_include_context({"includeContext": "allServers"}) == "allServers"


class TestEdgeGating:
  def test_gate_names_tools_first_when_both_present(self):
    # tools is checked before toolChoice so the error names the first offending field.
    gate = gate_sampling_tool_use(DECLARED_SAMPLING, {"tools": [{"name": "t"}], "toolChoice": {"mode": "auto"}})
    assert not gate.ok
    assert "tools" in gate.error["message"]
    assert "n)" in gate.error["message"]

  def test_server_rejects_when_sampling_not_declared(self):
    assert not may_server_send_sampling_request({}, {})
    assert not may_server_send_sampling_request({"roots": {}}, {})

  def test_server_allows_non_tool_request_with_context_capability(self):
    assert may_server_send_sampling_request(DECLARED_SAMPLING_CONTEXT, {"includeContext": "thisServer"})

  def test_validate_request_returns_params_on_success(self):
    params = {"messages": [USER_TEXT_MESSAGE], "maxTokens": 10}
    result = validate_sampling_request(DECLARED_SAMPLING, params)
    assert result.ok
    assert result.params is params

  def test_validate_request_applies_tool_gate(self):
    # A tool-enabled request without sampling.tools is rejected by the gate, not the parse.
    params = {"messages": [USER_TEXT_MESSAGE], "maxTokens": 10, "tools": [{"name": "t"}]}
    result = validate_sampling_request(DECLARED_SAMPLING, params)
    assert not result.ok
    assert result.error["code"] == INVALID_PARAMS_CODE


class TestEdgeResult:
  def test_rejects_non_dict(self):
    assert not is_valid_sampling_create_message_result("nope")

  def test_rejects_non_string_model_and_result_type(self):
    base = {"role": "assistant", "content": TEXT, "model": "m", "resultType": "complete"}
    assert not is_valid_sampling_create_message_result({**base, "model": 1})
    assert not is_valid_sampling_create_message_result({**base, "resultType": 1})

  def test_rejects_non_string_stop_reason(self):
    assert not is_valid_sampling_create_message_result(
      {"role": "assistant", "content": TEXT, "model": "m", "resultType": "complete", "stopReason": 1}
    )

  def test_accepts_input_required_result_type(self):
    from mcp.protocol.sampling import RESULT_TYPE_INPUT_REQUIRED

    assert is_valid_sampling_create_message_result(
      {"role": "assistant", "content": TEXT, "model": "m", "resultType": RESULT_TYPE_INPUT_REQUIRED}
    )


class TestEdgeOrderingAndReferences:
  def test_ordering_empty_is_ok(self):
    assert validate_sampling_message_ordering([])["ok"]

  def test_ordering_plain_conversation_is_ok(self):
    messages = [
      {"role": "user", "content": TEXT},
      {"role": "assistant", "content": {"type": "text", "text": "Paris."}},
    ]
    assert validate_sampling_message_ordering(messages)["ok"]

  def test_ordering_reports_exclusivity_violation_index(self):
    messages = [{"role": "user", "content": [TOOL_RESULT, TEXT]}]
    res = validate_sampling_message_ordering(messages)
    assert not res["ok"]
    assert res["index"] == 0

  def test_ordering_empty_followup_user_message_rejected(self):
    # A following user message with NO blocks does not consist of tool_result blocks.
    messages = [
      {"role": "assistant", "content": [TOOL_USE]},
      {"role": "user", "content": []},
    ]
    res = validate_sampling_message_ordering(messages)
    assert not res["ok"]
    assert res["index"] == 1

  def test_tool_result_references_non_string_tool_use_id(self):
    messages = [{"role": "user", "content": [{"type": "tool_result", "toolUseId": 5, "content": []}]}]
    res = validate_tool_result_references(messages)
    assert not res["ok"]
    assert res["tool_use_id"] is None

  def test_tool_result_references_later_use_does_not_satisfy_earlier_result(self):
    # The use must appear EARLIER than the result.
    messages = [
      {"role": "user", "content": [{"type": "tool_result", "toolUseId": "x", "content": []}]},
      {"role": "assistant", "content": [{"type": "tool_use", "id": "x", "name": "t", "input": {}}]},
    ]
    assert not validate_tool_result_references(messages)["ok"]


class TestEdgePreserveMeta:
  def test_preserve_tool_result_without_meta_is_a_copy(self):
    copy = preserve_content_meta(dict(TOOL_RESULT))
    assert copy == TOOL_RESULT

  def test_preserve_returns_same_image_block(self):
    img = {"type": "image", "data": "YWJj", "mimeType": "image/png"}
    assert preserve_content_meta(img) is img


class TestEdgeInputRequestEnvelope:
  def test_rejects_non_dict_envelope(self):
    assert not is_valid_sampling_input_request("nope")

  def test_rejects_missing_method(self):
    assert not is_valid_sampling_input_request({"params": {"messages": [USER_TEXT_MESSAGE], "maxTokens": 1}})

  def test_rejects_missing_params(self):
    assert not is_valid_sampling_input_request({"method": "sampling/createMessage"})
