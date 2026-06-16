"""Tests for Completion — capability, refs, params, result, matching, validation (§19)."""

import pytest

from mcp.protocol.completion import (
  COMPLETION_INTERNAL_ERROR_CODE,
  COMPLETION_INVALID_PARAMS_CODE,
  COMPLETION_METHOD_NOT_FOUND_CODE,
  MAX_COMPLETION_VALUES,
  CompleteResultConfig,
  build_complete_request_params,
  build_complete_result,
  build_completion_internal_error,
  build_completion_not_supported_error,
  build_completions_capability,
  compute_completion,
  completion_gated_by_completions,
  is_valid_complete_request_params,
  is_valid_complete_result,
  is_valid_completion_reference,
  may_call_completion,
  prefix_match,
  prompt_argument_names_of,
  resolve_completion_target,
  resolve_has_more,
  server_declares_completions,
  validate_complete_request,
)

PROMPT_REF = {"type": "ref/prompt", "name": "greet"}
RES_REF = {"type": "ref/resource", "uri": "x://{id}"}
ARG = {"name": "who", "value": "A"}


class TestCapability:
  def test_declares_and_gating(self):
    assert build_completions_capability() == {}
    assert server_declares_completions({"completions": {}})
    assert may_call_completion({"completions": {}})
    assert not may_call_completion({})
    assert completion_gated_by_completions()


class TestReferences:
  def test_valid(self):
    assert is_valid_completion_reference(PROMPT_REF)
    assert is_valid_completion_reference(RES_REF)

  def test_closed_union(self):
    assert not is_valid_completion_reference({"type": "ref/other", "name": "x"})
    assert not is_valid_completion_reference({"type": "ref/prompt"})  # no name
    assert not is_valid_completion_reference({"type": "ref/resource"})  # no uri


class TestParams:
  def test_valid(self):
    assert is_valid_complete_request_params({"ref": PROMPT_REF, "argument": ARG})

  def test_build(self):
    params = build_complete_request_params(PROMPT_REF, ARG, context={"arguments": {"style": "x"}})
    assert params["ref"] == PROMPT_REF and params["context"]["arguments"] == {"style": "x"}

  def test_build_rejects_self_in_context(self):
    with pytest.raises(ValueError):
      build_complete_request_params(PROMPT_REF, ARG, context={"arguments": {"who": "self"}})


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


class TestPrefixMatch:
  def test_prefix(self):
    assert prefix_match("Al", ["Ada", "Alan", "Alex"]) == ["Alan", "Alex"]

  def test_empty_seed_matches_all(self):
    assert prefix_match("", ["a", "b"]) == ["a", "b"]

  def test_case_insensitive(self):
    assert prefix_match("al", ["Ada", "Alan"], case_insensitive=True) == ["Alan"]


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


class _Catalog:
  def prompt_argument_names(self, name):
    return ["who", "style"] if name == "greet" else None

  def resource_template_variable_names(self, uri):
    return ["id"] if uri == "x://{id}" else None


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
    res = resolve_completion_target({"ref": {"type": "ref/resource", "uri": "y://{q}"}, "argument": {"name": "q", "value": ""}}, _Catalog())
    assert not res.ok


class TestErrorBuilders:
  def test_not_supported(self):
    assert build_completion_not_supported_error()["code"] == COMPLETION_METHOD_NOT_FOUND_CODE

  def test_internal(self):
    assert build_completion_internal_error("rate limited")["code"] == COMPLETION_INTERNAL_ERROR_CODE


class TestCatalogHelpers:
  def test_prompt_argument_names_of(self):
    assert prompt_argument_names_of({"arguments": [{"name": "a"}, {"name": "b"}]}) == ["a", "b"]
    assert prompt_argument_names_of({"name": "p"}) == []
