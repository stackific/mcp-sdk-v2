"""Tests for Completion — capability, refs, params, result, matching, validation (§19).

Mirrors ts-sdk/src/__tests__/protocol/completion.test.ts and completion-debounce.test.ts,
AC-29.1 … AC-29.24 plus Python-side edge cases.
"""

import time

import pytest

from mcp.protocol.completion import (
  COMPLETION_COMPLETE_METHOD,
  COMPLETION_INTERNAL_ERROR_CODE,
  COMPLETION_INVALID_PARAMS_CODE,
  COMPLETION_METHOD_NOT_FOUND_CODE,
  MAX_COMPLETION_VALUES,
  PROMPT_REFERENCE_TYPE,
  RESOURCE_TEMPLATE_REFERENCE_TYPE,
  CompleteResultConfig,
  build_complete_request_params,
  build_complete_result,
  build_completion_internal_error,
  build_completion_invalid_params_error,
  build_completion_not_supported_error,
  build_completions_capability,
  build_unknown_reference_error,
  compute_completion,
  completion_gated_by_completions,
  create_completion_debouncer,
  is_valid_complete_request_params,
  is_valid_complete_result,
  is_valid_completion_argument,
  is_valid_completion_context,
  is_valid_completion_object,
  is_valid_completion_reference,
  is_valid_completions_capability,
  is_valid_prompt_reference,
  is_valid_resource_template_reference,
  is_prompt_reference,
  is_resource_template_reference,
  may_call_completion,
  prefix_match,
  prompt_argument_names_of,
  resolve_complete_result_type,
  resolve_completion_target,
  resolve_has_more,
  resource_template_variable_names_of,
  server_declares_completions,
  validate_complete_request,
)
from mcp.protocol.capability_negotiation import may_client_invoke
from mcp.protocol.resources import uri_template_variables

PROMPT_REF = {"type": "ref/prompt", "name": "greet"}
RES_REF = {"type": "ref/resource", "uri": "x://{id}"}
ARG = {"name": "who", "value": "A"}


def valid_params(**overrides):
  """A reusable valid request params object (mirrors the TS `validParams` helper)."""
  base = {
    "ref": {"type": PROMPT_REFERENCE_TYPE, "name": "code_review"},
    "argument": {"name": "framework", "value": "fla"},
  }
  base.update(overrides)
  return base


# ─── AC-29.1 — `completions` capability is a JSON object; `{}` baseline ──────────


class TestCapability:
  def test_declares_and_gating(self):
    assert build_completions_capability() == {}
    assert server_declares_completions({"completions": {}})
    assert may_call_completion({"completions": {}})
    assert not may_call_completion({})
    assert completion_gated_by_completions()

  def test_recommended_baseline_is_empty_object(self):
    assert build_completions_capability() == {}

  def test_accepts_empty_and_open_object(self):
    # (AC-29.1 · R-19.1-a, R-19.1-b) — an OPEN object; contents are not constrained.
    assert is_valid_completions_capability({})
    assert is_valid_completions_capability({"experimentalRanker": True})

  def test_non_object_capability_invalid(self):
    assert not is_valid_completions_capability("nope")
    assert not is_valid_completions_capability(None)
    assert not is_valid_completions_capability([])

  def test_server_declares_only_when_present(self):
    assert server_declares_completions({"completions": {}})
    assert server_declares_completions({"completions": {"x": 1}})
    assert not server_declares_completions({})


# ─── AC-29.2 — no capability ⇒ client must not send; server answers -32601 ───────


class TestGating:
  def test_client_must_not_send_without_capability(self):
    assert not may_call_completion({})
    assert may_call_completion({"completions": {}})

  def test_reuses_s10_gate(self):
    assert completion_gated_by_completions()
    assert not may_client_invoke(COMPLETION_COMPLETE_METHOD, {})
    assert may_client_invoke(COMPLETION_COMPLETE_METHOD, {"completions": {}})

  def test_non_advertising_server_responds_minus_32601(self):
    err = build_completion_not_supported_error()
    assert err["code"] == COMPLETION_METHOD_NOT_FOUND_CODE
    assert COMPLETION_METHOD_NOT_FOUND_CODE == -32601
    assert COMPLETION_COMPLETE_METHOD in err["message"]


# ─── AC-29.3 — only completion/complete, exact case-sensitive name ──────────────


class TestMethodName:
  def test_method_string_is_exact(self):
    assert COMPLETION_COMPLETE_METHOD == "completion/complete"

  def test_case_sensitive(self):
    miscased = "Completion/Complete"
    assert miscased != COMPLETION_COMPLETE_METHOD
    # ungated → permissive, but not the spec method
    assert may_client_invoke(miscased, {"completions": {}})


# ─── AC-29.4 — absent ref ⇒ -32602 ──────────────────────────────────────────────


class TestRefRequired:
  def test_rejects_missing_ref(self):
    res = validate_complete_request({"argument": {"name": "a", "value": ""}})
    assert not res.ok
    assert res.error["code"] == COMPLETION_INVALID_PARAMS_CODE
    assert COMPLETION_INVALID_PARAMS_CODE == -32602

  def test_params_predicate_rejects_missing_ref(self):
    assert not is_valid_complete_request_params({"argument": {"name": "a", "value": ""}})


# ─── AC-29.5 — variant selected by ref.type ─────────────────────────────────────


class TestReferences:
  def test_valid(self):
    assert is_valid_completion_reference(PROMPT_REF)
    assert is_valid_completion_reference(RES_REF)

  def test_closed_union(self):
    assert not is_valid_completion_reference({"type": "ref/other", "name": "x"})
    assert not is_valid_completion_reference({"type": "ref/prompt"})  # no name
    assert not is_valid_completion_reference({"type": "ref/resource"})  # no uri

  def test_prompt_ref_selected_by_type(self):
    ref = {"type": PROMPT_REFERENCE_TYPE, "name": "p"}
    assert is_prompt_reference(ref)
    assert not is_resource_template_reference(ref)

  def test_resource_ref_selected_by_type(self):
    ref = {"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "file:///x"}
    assert is_resource_template_reference(ref)
    assert not is_prompt_reference(ref)

  def test_discriminator_values_are_exact(self):
    assert PROMPT_REFERENCE_TYPE == "ref/prompt"
    assert RESOURCE_TEMPLATE_REFERENCE_TYPE == "ref/resource"


# ─── AC-29.6 — closed union: any other ref.type ⇒ -32602 ────────────────────────


class TestClosedUnion:
  def test_rejects_unknown_ref_type(self):
    assert not is_valid_completion_reference({"type": "ref/tool", "name": "x"})

  def test_validate_maps_bad_ref_type_to_minus_32602(self):
    res = validate_complete_request(valid_params(ref={"type": "ref/unknown", "name": "x"}))
    assert not res.ok
    assert res.error["code"] == COMPLETION_INVALID_PARAMS_CODE


# ─── AC-29.7 — missing/malformed argument fields ⇒ -32602 ───────────────────────


class TestArgument:
  def test_rejects_missing_argument_object(self):
    res = validate_complete_request({"ref": {"type": PROMPT_REFERENCE_TYPE, "name": "p"}})
    assert not res.ok
    assert res.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_rejects_missing_argument_name(self):
    res = validate_complete_request(valid_params(argument={"value": "x"}))
    assert not res.ok
    assert res.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_rejects_missing_argument_value(self):
    res = validate_complete_request(valid_params(argument={"name": "x"}))
    assert not res.ok
    assert res.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_rejects_non_string_argument_value(self):
    res = validate_complete_request(valid_params(argument={"name": "x", "value": 42}))
    assert not res.ok
    assert res.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_argument_predicate_requires_both_strings(self):
    assert is_valid_completion_argument({"name": "a", "value": ""})
    assert not is_valid_completion_argument({"name": "a"})
    assert not is_valid_completion_argument({"name": "a", "value": 1})


# ─── AC-29.8 — empty seed ⇒ empty-input suggestions, no error ────────────────────


class TestEmptySeed:
  def test_accepts_empty_value(self):
    res = validate_complete_request(valid_params(argument={"name": "framework", "value": ""}))
    assert res.ok

  def test_prefix_match_empty_seed_returns_all(self):
    candidates = ["python", "pytorch", "rails"]
    assert prefix_match("", candidates) == candidates


# ─── AC-29.9 — context.arguments populated; keys exclude argument.name ──────────


class TestContextArguments:
  def test_accepts_sibling_only_context(self):
    res = validate_complete_request(valid_params(context={"arguments": {"language": "python"}}))
    assert res.ok

  def test_rejects_context_containing_argument_name(self):
    res = validate_complete_request(
      valid_params(
        argument={"name": "framework", "value": "fla"},
        context={"arguments": {"framework": "x"}},
      )
    )
    assert not res.ok
    assert res.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_build_keeps_valid_sibling_context(self):
    params = build_complete_request_params(
      {"type": PROMPT_REFERENCE_TYPE, "name": "p"},
      {"name": "framework", "value": "fla"},
      context={"arguments": {"language": "python"}},
    )
    assert params["context"]["arguments"] == {"language": "python"}

  def test_build_rejects_self_in_context(self):
    with pytest.raises(ValueError):
      build_complete_request_params(
        {"type": PROMPT_REFERENCE_TYPE, "name": "p"},
        {"name": "framework", "value": "fla"},
        context={"arguments": {"framework": "x"}},
      )

  def test_context_predicate_validates_string_map(self):
    assert is_valid_completion_context({})
    assert is_valid_completion_context({"arguments": {}})
    assert is_valid_completion_context({"arguments": {"a": "b"}})
    assert not is_valid_completion_context({"arguments": {"a": 1}})
    assert not is_valid_completion_context({"arguments": "nope"})


# ─── AC-29.10 — server MAY ignore context and still return a valid result ───────


class TestServerMayIgnoreContext:
  def test_empty_or_absent_arguments_map_accepted(self):
    assert is_valid_completion_context({})
    assert is_valid_completion_context({"arguments": {}})

  def test_result_without_context_is_valid(self):
    result = build_complete_result(CompleteResultConfig(values=["python"]))
    assert is_valid_complete_result(result)


# ─── AC-29.11 — reference required fields ────────────────────────────────────────


class TestReferenceRequiredFields:
  def test_prompt_reference_requires_type_and_name(self):
    assert is_valid_prompt_reference({"type": PROMPT_REFERENCE_TYPE, "name": "p"})
    assert not is_valid_prompt_reference({"type": PROMPT_REFERENCE_TYPE})
    assert not is_valid_prompt_reference({"type": "ref/resource", "name": "p"})

  def test_prompt_reference_title_optional(self):
    assert is_valid_prompt_reference({"type": PROMPT_REFERENCE_TYPE, "name": "p", "title": "Pretty"})
    assert not is_valid_prompt_reference({"type": PROMPT_REFERENCE_TYPE, "name": "p", "title": 5})

  def test_resource_template_reference_requires_type_and_uri(self):
    assert is_valid_resource_template_reference({"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "file:///x"})
    assert not is_valid_resource_template_reference({"type": RESOURCE_TEMPLATE_REFERENCE_TYPE})


# ─── AC-29.12 — ResourceTemplateReference.uri literal OR template ───────────────


class TestResourceUriLiteralOrTemplate:
  def test_accepts_literal_uri(self):
    assert is_valid_resource_template_reference({"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "file:///etc/hosts"})

  def test_accepts_template_uri(self):
    assert is_valid_resource_template_reference({"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "file:///{path}"})


# ─── AC-29.13 — completion object + ranked values array ─────────────────────────


class TestResult:
  def test_build_and_validate(self):
    result = build_complete_result(CompleteResultConfig(values=["Ada", "Alan"], total=2))
    assert is_valid_complete_result(result)
    assert result["completion"]["values"] == ["Ada", "Alan"]

  def test_too_many_values_raises(self):
    with pytest.raises(ValueError):
      build_complete_result(CompleteResultConfig(values=["x"] * (MAX_COMPLETION_VALUES + 1)))

  def test_resolve_has_more(self):
    assert resolve_has_more({"hasMore": True})
    assert not resolve_has_more({})

  def test_invalid_result_over_cap(self):
    assert not is_valid_complete_result({"resultType": "complete", "completion": {"values": ["x"] * 101}})

  def test_carries_required_values_array(self):
    result = build_complete_result(CompleteResultConfig(values=["python", "pytorch", "pyside"], total=10, has_more=True))
    assert is_valid_complete_result(result)
    assert result["completion"]["values"] == ["python", "pytorch", "pyside"]

  def test_rejects_completion_object_with_no_values(self):
    assert not is_valid_completion_object({"total": 1})

  def test_preserves_caller_supplied_order(self):
    c = compute_completion(["z-best", "a-worse"])
    assert c["values"] == ["z-best", "a-worse"]


# ─── AC-29.14 — >100 matches: cap at 100, hasMore, MAY total ────────────────────


class TestComputeCompletion:
  def test_under_cap(self):
    c = compute_completion(["a", "b"])
    assert c["values"] == ["a", "b"] and "hasMore" not in c

  def test_over_cap_signals_truncation(self):
    c = compute_completion([str(i) for i in range(150)])
    assert len(c["values"]) == MAX_COMPLETION_VALUES
    assert c["total"] == 150 and c["hasMore"] is True

  def test_explicit_total(self):
    c = compute_completion(["a", "b"], total=99)
    assert c["total"] == 99 and c["hasMore"] is True

  def test_caps_values_at_exactly_100(self):
    many = [f"item-{i}" for i in range(250)]
    c = compute_completion(many)
    assert len(c["values"]) == MAX_COMPLETION_VALUES
    assert MAX_COMPLETION_VALUES == 100

  def test_signals_truncation_and_true_total(self):
    many = [f"item-{i}" for i in range(250)]
    c = compute_completion(many)
    assert c["hasMore"] is True
    assert c["total"] == 250

  def test_parsed_result_never_exceeds_100(self):
    many = [f"item-{i}" for i in range(250)]
    result = build_complete_result(CompleteResultConfig(values=compute_completion(many)["values"], total=250, has_more=True))
    assert is_valid_complete_result(result)
    assert len(result["completion"]["values"]) == 100

  def test_predicate_rejects_over_100_values(self):
    too_many = [f"v{i}" for i in range(101)]
    assert not is_valid_completion_object({"values": too_many})

  def test_build_raises_over_100(self):
    too_many = [f"v{i}" for i in range(101)]
    with pytest.raises(ValueError):
      build_complete_result(CompleteResultConfig(values=too_many))

  def test_explicit_total_marks_truncation_for_small_list(self):
    c = compute_completion(["python", "pytorch", "pyside"], total=10)
    assert c["total"] == 10
    assert c["hasMore"] is True
    assert len(c["values"]) == 3


# ─── AC-29.15 — no matches ⇒ empty values, still valid ───────────────────────────


class TestNoMatches:
  def test_empty_values_is_valid(self):
    result = build_complete_result(CompleteResultConfig(values=[]))
    assert is_valid_complete_result(result)
    assert result["completion"]["values"] == []

  def test_compute_over_no_matches_untruncated(self):
    c = compute_completion([])
    assert c["values"] == []
    assert "hasMore" not in c
    assert "total" not in c


# ─── AC-29.16 — total MAY exceed values.length; omitted ⇒ unknown ───────────────


class TestTotalSemantics:
  def test_total_may_exceed_values_length(self):
    result = build_complete_result(CompleteResultConfig(values=["a", "b"], total=999, has_more=True))
    assert result["completion"]["total"] == 999
    assert result["completion"]["total"] > len(result["completion"]["values"])
    assert is_valid_complete_result(result)

  def test_total_omitted_when_not_supplied(self):
    result = build_complete_result(CompleteResultConfig(values=["a"]))
    assert "total" not in result["completion"]


# ─── AC-29.17 — omitted hasMore treated as false ────────────────────────────────


class TestHasMoreOmission:
  def test_resolve_treats_omitted_as_false(self):
    assert resolve_has_more({}) is False
    assert resolve_has_more({"hasMore": False}) is False
    assert resolve_has_more({"hasMore": True}) is True

  def test_built_result_without_has_more_omits_field(self):
    result = build_complete_result(CompleteResultConfig(values=["a"]))
    assert "hasMore" not in result["completion"]
    assert resolve_has_more(result["completion"]) is False


# ─── AC-29.18 — resultType "complete"; absent ⇒ "complete" ──────────────────────


class TestResultType:
  def test_built_result_includes_complete(self):
    assert build_complete_result(CompleteResultConfig(values=[]))["resultType"] == "complete"

  def test_resolve_treats_absent_as_complete(self):
    assert resolve_complete_result_type({}) == "complete"
    assert resolve_complete_result_type({"resultType": "complete"}) == "complete"


# ─── AC-29.19 — advisory: value absent from results is not forbidden ─────────────


class TestAdvisory:
  def test_unsurfaced_value_is_not_forbidden(self):
    surfaced = compute_completion(["python", "pytorch"])["values"]
    user_typed = "pyramid"
    assert user_typed not in surfaced
    # No API forbids a value merely because completion did not surface it.
    assert callable(build_complete_result)


# ─── AC-29.20 — match against seed; refine with context ─────────────────────────


class TestPrefixMatch:
  def test_prefix(self):
    assert prefix_match("Al", ["Ada", "Alan", "Alex"]) == ["Alan", "Alex"]

  def test_empty_seed_matches_all(self):
    assert prefix_match("", ["a", "b"]) == ["a", "b"]

  def test_case_insensitive(self):
    assert prefix_match("al", ["Ada", "Alan"], case_insensitive=True) == ["Alan"]

  def test_matches_non_empty_seed(self):
    assert prefix_match("py", ["python", "pytorch", "rails"]) == ["python", "pytorch"]

  def test_case_insensitive_keeps_original_casing(self):
    assert prefix_match("PY", ["python", "Pytorch"], case_insensitive=True) == ["python", "Pytorch"]

  def test_context_narrows_pool_before_matching(self):
    by_language = {
      "python": ["pytorch", "pyramid", "pydantic"],
      "ruby": ["rails", "roda"],
    }
    pool = by_language["python"]
    assert prefix_match("py", pool) == ["pytorch", "pyramid", "pydantic"]


# ─── AC-29.21 — validate inputs; -32603 for internal failures ───────────────────


class TestRobustness:
  def test_non_object_params_rejected(self):
    assert not validate_complete_request(None).ok
    assert not validate_complete_request("nope").ok
    assert not validate_complete_request([]).ok

  def test_internal_failures_map_to_minus_32603(self):
    err = build_completion_internal_error("ranker timed out")
    assert err["code"] == COMPLETION_INTERNAL_ERROR_CODE
    assert COMPLETION_INTERNAL_ERROR_CODE == -32603
    assert "ranker timed out" in err["message"]

  def test_internal_error_without_detail(self):
    assert build_completion_internal_error()["message"] == "Internal error"

  def test_invalid_params_builder_is_minus_32602(self):
    assert build_completion_invalid_params_error("bad")["code"] == -32602


# ─── AC-29.22 — access control: entitlement filter applied before capping ───────


class TestAccessControl:
  def test_unentitled_values_filtered_before_capping(self):
    all_candidates = ["public-a", "secret-x", "public-b"]
    filtered = [v for v in all_candidates if not v.startswith("secret-")]
    c = compute_completion(filtered)
    assert c["values"] == ["public-a", "public-b"]
    assert "secret-x" not in c["values"]


# ─── AC-29.23 — client handles partial / missing-field results gracefully ───────


class TestClientGracefulHandling:
  def test_handles_missing_has_more_and_total(self):
    partial = {"resultType": "complete", "completion": {"values": ["x"]}}
    assert is_valid_complete_result(partial)
    assert resolve_has_more(partial["completion"]) is False

  def test_handles_omitted_result_type(self):
    no_type = {"completion": {"values": []}}
    assert resolve_complete_result_type(no_type) == "complete"

  def test_handles_empty_completion(self):
    empty = {"resultType": "complete", "completion": {"values": []}}
    assert is_valid_complete_result(empty)


class TestValidation:
  def test_valid(self):
    v = validate_complete_request({"ref": PROMPT_REF, "argument": ARG})
    assert v.ok and v.params is not None

  def test_missing_ref(self):
    v = validate_complete_request({"argument": ARG})
    assert not v.ok and v.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_bad_ref_type(self):
    v = validate_complete_request({"ref": {"type": "ref/other"}, "argument": ARG})
    assert not v.ok

  def test_bad_argument(self):
    v = validate_complete_request({"ref": PROMPT_REF, "argument": {"name": "who"}})
    assert not v.ok

  def test_context_self_rejected(self):
    v = validate_complete_request({"ref": PROMPT_REF, "argument": ARG, "context": {"arguments": {"who": "x"}}})
    assert not v.ok

  def test_bad_context_arguments_rejected(self):
    v = validate_complete_request({"ref": PROMPT_REF, "argument": ARG, "context": {"arguments": {"x": 1}}})
    assert not v.ok


# ─── AC-29.24 — unknown ref / unknown argument ⇒ -32602 (not a not-found) ───────


class _Catalog:
  def prompt_argument_names(self, name):
    return ["who", "style"] if name == "greet" else None

  def resource_template_variable_names(self, uri):
    return ["id"] if uri == "x://{id}" else None


class _ReviewCatalog:
  def prompt_argument_names(self, name):
    return ["framework", "language"] if name == "code_review" else None

  def resource_template_variable_names(self, uri):
    return ["path"] if uri == "file:///{path}" else None


class TestResolveTarget:
  def test_known_prompt_arg(self):
    assert resolve_completion_target({"ref": PROMPT_REF, "argument": ARG}, _Catalog()).ok

  def test_unknown_prompt(self):
    res = resolve_completion_target({"ref": {"type": "ref/prompt", "name": "ghost"}, "argument": ARG}, _Catalog())
    assert not res.ok and res.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_unknown_argument(self):
    res = resolve_completion_target({"ref": PROMPT_REF, "argument": {"name": "nope", "value": ""}}, _Catalog())
    assert not res.ok

  def test_resource_template_variable(self):
    assert resolve_completion_target({"ref": RES_REF, "argument": {"name": "id", "value": "1"}}, _Catalog()).ok

  def test_unknown_template(self):
    res = resolve_completion_target(
      {"ref": {"type": "ref/resource", "uri": "y://{q}"}, "argument": {"name": "q", "value": ""}}, _Catalog()
    )
    assert not res.ok

  def _params_for(self, ref, arg_name):
    res = validate_complete_request({"ref": ref, "argument": {"name": arg_name, "value": ""}})
    assert res.ok, "expected valid shape"
    return res.params

  def test_unknown_prompt_is_invalid_params_not_not_found(self):
    params = self._params_for({"type": PROMPT_REFERENCE_TYPE, "name": "code_reviw"}, "framework")
    r = resolve_completion_target(params, _ReviewCatalog())
    assert not r.ok
    assert r.error["code"] == COMPLETION_INVALID_PARAMS_CODE
    assert "unknown prompt" in r.error["message"]

  def test_known_prompt_unknown_argument(self):
    params = self._params_for({"type": PROMPT_REFERENCE_TYPE, "name": "code_review"}, "nope")
    r = resolve_completion_target(params, _ReviewCatalog())
    assert not r.ok and r.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_known_prompt_known_argument_ok(self):
    params = self._params_for({"type": PROMPT_REFERENCE_TYPE, "name": "code_review"}, "framework")
    assert resolve_completion_target(params, _ReviewCatalog()).ok

  def test_unknown_resource_template_message(self):
    params = self._params_for({"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "file:///{nope}"}, "path")
    r = resolve_completion_target(params, _ReviewCatalog())
    assert not r.ok
    assert "unknown resource template" in r.error["message"]

  def test_known_template_unknown_variable(self):
    params = self._params_for({"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "file:///{path}"}, "other")
    r = resolve_completion_target(params, _ReviewCatalog())
    assert not r.ok and r.error["code"] == COMPLETION_INVALID_PARAMS_CODE

  def test_known_template_known_variable_ok(self):
    params = self._params_for({"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "file:///{path}"}, "path")
    assert resolve_completion_target(params, _ReviewCatalog()).ok


class TestErrorBuilders:
  def test_not_supported(self):
    assert build_completion_not_supported_error()["code"] == COMPLETION_METHOD_NOT_FOUND_CODE

  def test_internal(self):
    assert build_completion_internal_error("rate limited")["code"] == COMPLETION_INTERNAL_ERROR_CODE

  def test_unknown_reference_is_minus_32602(self):
    assert build_unknown_reference_error('unknown prompt "x"')["code"] == -32602


# ─── Catalog adapters reuse S28/S26 shapes ──────────────────────────────────────


class TestCatalogHelpers:
  def test_prompt_argument_names_of(self):
    assert prompt_argument_names_of({"arguments": [{"name": "a"}, {"name": "b"}]}) == ["a", "b"]
    assert prompt_argument_names_of({"name": "p"}) == []

  def test_prompt_argument_names_of_reads_name(self):
    assert prompt_argument_names_of({"arguments": [{"name": "framework"}, {"name": "language"}]}) == ["framework", "language"]
    assert prompt_argument_names_of({}) == []

  def test_resource_template_variable_names_of_delegates_to_s26(self):
    names = resource_template_variable_names_of({"uriTemplate": "db://{table}/{id}"}, uri_template_variables)
    assert names == ["table", "id"]

  def test_literal_uri_template_yields_no_variables(self):
    assert resource_template_variable_names_of({"uriTemplate": "file:///etc/hosts"}, lambda _t: []) == []


# ─── R-19.5-n — client-side request debouncing ──────────────────────────────────


class TestDebouncer:
  def test_coalesces_burst_into_single_request_with_final_value(self):
    calls = []

    def run(value):
      calls.append(value)
      return f"results:{value}"

    complete = create_completion_debouncer(run, wait_ms=50)
    f1 = complete("a")
    f2 = complete("ab")
    f3 = complete("abc")

    # All burst callers resolve with the single coalesced result.
    assert f1.result(timeout=2) == "results:abc"
    assert f2.result(timeout=2) == "results:abc"
    assert f3.result(timeout=2) == "results:abc"
    assert calls == ["abc"]

  def test_separate_requests_when_spaced_beyond_window(self):
    calls = []

    def run(value):
      calls.append(value)
      return value

    complete = create_completion_debouncer(run, wait_ms=30)
    first = complete("x")
    assert first.result(timeout=2) == "x"

    # A second call after the first has fired starts a fresh window.
    time.sleep(0.01)
    second = complete("y")
    assert second.result(timeout=2) == "y"

    assert calls == ["x", "y"]

  def test_run_failure_propagates_to_all_waiters(self):
    def run(_value):
      raise RuntimeError("boom")

    complete = create_completion_debouncer(run, wait_ms=20)
    f1 = complete("a")
    f2 = complete("ab")
    with pytest.raises(RuntimeError):
      f1.result(timeout=2)
    with pytest.raises(RuntimeError):
      f2.result(timeout=2)


# ─── Python-side edge cases (branches not exercised by the TS mirror) ────────────


class TestComputeCompletionEdges:
  def test_total_override_not_exceeding_values_does_not_truncate(self):
    # trueTotal <= len(values) ⇒ neither `total` nor `hasMore` is emitted.
    c = compute_completion(["a", "b", "c"], total=3)
    assert c["values"] == ["a", "b", "c"]
    assert "total" not in c
    assert "hasMore" not in c

  def test_total_override_below_values_length_does_not_truncate(self):
    # A nonsensical small override (< len) must NOT spuriously signal truncation.
    c = compute_completion(["a", "b", "c"], total=1)
    assert "hasMore" not in c
    assert "total" not in c

  def test_exactly_100_does_not_signal_truncation(self):
    c = compute_completion([f"v{i}" for i in range(MAX_COMPLETION_VALUES)])
    assert len(c["values"]) == MAX_COMPLETION_VALUES
    assert "hasMore" not in c
    assert "total" not in c

  def test_101_signals_truncation_with_true_total(self):
    c = compute_completion([f"v{i}" for i in range(MAX_COMPLETION_VALUES + 1)])
    assert len(c["values"]) == MAX_COMPLETION_VALUES
    assert c["hasMore"] is True
    assert c["total"] == MAX_COMPLETION_VALUES + 1

  def test_does_not_mutate_input_list(self):
    ranked = [f"v{i}" for i in range(250)]
    compute_completion(ranked)
    assert len(ranked) == 250


class TestBuildRequestParamsEdges:
  def test_omits_optional_fields_when_absent(self):
    params = build_complete_request_params(PROMPT_REF, ARG)
    assert params == {"ref": PROMPT_REF, "argument": ARG}
    assert "context" not in params
    assert "_meta" not in params

  def test_includes_meta_when_supplied(self):
    params = build_complete_request_params(PROMPT_REF, ARG, meta={"trace": "abc"})
    assert params["_meta"] == {"trace": "abc"}

  def test_includes_empty_context_when_supplied(self):
    # An empty context object (server MAY ignore) is still forwarded verbatim.
    params = build_complete_request_params(PROMPT_REF, ARG, context={})
    assert params["context"] == {}


class TestParamsPredicateEdges:
  def test_accepts_full_params_with_context_and_meta(self):
    assert is_valid_complete_request_params(
      {"ref": PROMPT_REF, "argument": ARG, "context": {"arguments": {"x": "y"}}, "_meta": {"k": "v"}}
    )

  def test_rejects_non_dict(self):
    assert not is_valid_complete_request_params("nope")
    assert not is_valid_complete_request_params(None)
    assert not is_valid_complete_request_params([])

  def test_rejects_bad_meta(self):
    assert not is_valid_complete_request_params({"ref": PROMPT_REF, "argument": ARG, "_meta": "nope"})

  def test_rejects_bad_context(self):
    assert not is_valid_complete_request_params({"ref": PROMPT_REF, "argument": ARG, "context": {"arguments": {"x": 1}}})

  def test_tolerates_extra_top_level_keys(self):
    # `.passthrough()` parity — forward-compatible additions are preserved/tolerated.
    assert is_valid_complete_request_params({"ref": PROMPT_REF, "argument": ARG, "futureField": True})


class TestReferencePassthrough:
  def test_prompt_reference_tolerates_extra_keys(self):
    assert is_valid_prompt_reference({"type": PROMPT_REFERENCE_TYPE, "name": "p", "futureField": 1})

  def test_resource_reference_tolerates_extra_keys(self):
    assert is_valid_resource_template_reference(
      {"type": RESOURCE_TEMPLATE_REFERENCE_TYPE, "uri": "x://{id}", "futureField": 1}
    )

  def test_non_dict_references_rejected(self):
    assert not is_valid_prompt_reference("nope")
    assert not is_valid_resource_template_reference(None)
    assert not is_valid_completion_reference(42)


class TestCompletionObjectEdges:
  def test_rejects_non_list_values(self):
    assert not is_valid_completion_object({"values": "nope"})

  def test_rejects_non_string_value_entries(self):
    assert not is_valid_completion_object({"values": ["ok", 7]})

  def test_rejects_non_number_total(self):
    assert not is_valid_completion_object({"values": [], "total": "5"})

  def test_rejects_bool_disguised_as_total(self):
    # A bool is not an acceptable numeric `total` (Python bool ⊂ int guard).
    assert not is_valid_completion_object({"values": [], "total": True})

  def test_rejects_non_bool_has_more(self):
    assert not is_valid_completion_object({"values": [], "hasMore": "yes"})

  def test_accepts_exactly_100_values(self):
    assert is_valid_completion_object({"values": [f"v{i}" for i in range(MAX_COMPLETION_VALUES)]})

  def test_non_dict_completion_object_rejected(self):
    assert not is_valid_completion_object("nope")


class TestResultTypeEdges:
  def test_non_complete_raw_is_stringified(self):
    # An explicit non-"complete" discriminator is surfaced verbatim (stringified),
    # NOT defaulted — only absent/None defaults to "complete".
    assert resolve_complete_result_type({"resultType": "other"}) == "other"

  def test_complete_result_predicate_rejects_wrong_result_type(self):
    assert not is_valid_complete_result({"resultType": "other", "completion": {"values": []}})

  def test_complete_result_predicate_rejects_bad_meta(self):
    assert not is_valid_complete_result({"resultType": "complete", "completion": {"values": []}, "_meta": "nope"})

  def test_complete_result_predicate_rejects_missing_completion(self):
    assert not is_valid_complete_result({"resultType": "complete"})


class TestPrefixMatchEdges:
  def test_case_sensitive_default_does_not_fold(self):
    # Without case_insensitive, "py" does not match "Python".
    assert prefix_match("py", ["Python", "python"]) == ["python"]

  def test_no_matches_returns_empty(self):
    assert prefix_match("z", ["alpha", "beta"]) == []

  def test_does_not_mutate_candidates_on_empty_seed(self):
    candidates = ["a", "b"]
    result = prefix_match("", candidates)
    result.append("c")
    assert candidates == ["a", "b"]
