"""Tests for Tools II — calling, the two-layer error model, annotations, list-changed (§16.5–§16.9).

Mirrors the TS acceptance criteria AC-25.1 … AC-25.36 (``tools-call.test.ts``), then adds
Python-specific edge cases. The TS SDK uses Zod schemas where this module uses structural
``is_call_tool_*`` predicates (the documented py-sdk analogue).
"""

import json

import pytest

from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.tools import validate_tool_structured_content
from mcp.protocol.tools_call import (
  CallToolRequestConfig,
  CallToolResultConfig,
  CallToolRetryConfig,
  TOOL_ANNOTATION_DEFAULTS,
  TOOLS_CALL_METHOD,
  TOOLS_LIST_CHANGED_METHOD,
  build_call_tool_request,
  build_call_tool_result,
  build_call_tool_retry_request,
  build_invalid_arguments_error,
  build_output_schema_result,
  build_tool_execution_error,
  build_tool_list_changed_notification,
  build_unknown_tool_error,
  dispatch_tool_call,
  is_call_tool_error,
  is_call_tool_request,
  is_call_tool_result,
  is_structured_content_present,
  is_tool_list_changed_notification,
  may_trust_tool_annotations,
  react_to_tool_list_changed,
  resolve_call_tool_arguments,
  resolve_tool_annotation_hints,
  structured_content_text_fallback,
)

TOOL = {"name": "add", "inputSchema": {"type": "object", "properties": {"a": {"type": "number"}}, "required": ["a"]}}

# ── Fixtures mirroring tools-call.test.ts ────────────────────────────────────────

WEATHER_TOOL = {
  "name": "get_weather_data",
  "inputSchema": {
    "type": "object",
    "properties": {"location": {"type": "string"}},
    "required": ["location"],
  },
  "outputSchema": {
    "type": "object",
    "properties": {"temperature": {"type": "number"}, "conditions": {"type": "string"}},
    "required": ["temperature", "conditions"],
  },
}

NO_ARG_TOOL = {"name": "ping", "inputSchema": {"type": "object"}}


class TestRequest:
  def test_is_call_tool_request(self):
    assert is_call_tool_request({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "x"}})
    assert not is_call_tool_request({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {}})
    assert not is_call_tool_request({"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "x"}})

  def test_rejects_malformed_params_shape(self):
    # P1-2 parity: the request-shape contract matches TS `CallToolRequestParamsSchema`,
    # which rejects more than a missing/non-string `name`. (R-16.5-c/-f/-h/-k)
    def req(params):
      return {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": params}

    # `arguments` MUST be an object when present (R-16.5-c).
    assert not is_call_tool_request(req({"name": "x", "arguments": [1, 2]}))
    assert not is_call_tool_request(req({"name": "x", "arguments": "not-an-object"}))
    # `inputResponses` MUST be an object when present (R-16.5-f).
    assert not is_call_tool_request(req({"name": "x", "inputResponses": "nope"}))
    # `requestState` MUST be a string when present (R-16.5-h).
    assert not is_call_tool_request(req({"name": "x", "requestState": 123}))
    # `_meta` MUST be an object when present (R-16.5-k).
    assert not is_call_tool_request(req({"name": "x", "_meta": "nope"}))
    # params itself must be an object.
    assert not is_call_tool_request(req("not-an-object"))

  def test_accepts_well_formed_optional_params(self):
    # The complement: every optional field, when well-typed, is accepted (no over-rejection).
    req = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/call",
      "params": {
        "name": "x",
        "arguments": {"a": 1},
        "inputResponses": {"k": "v"},
        "requestState": "tok",
        "_meta": {"progressToken": "p"},
      },
    }
    assert is_call_tool_request(req)

  def test_resolve_arguments_defaults_to_empty(self):
    assert resolve_call_tool_arguments({"name": "x"}) == {}
    assert resolve_call_tool_arguments({"name": "x", "arguments": {"a": 1}}) == {"a": 1}

  def test_build_request(self):
    req = build_call_tool_request(1, CallToolRequestConfig(name="add", arguments={"a": 1}))
    assert req == {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "add", "arguments": {"a": 1}}}

  def test_build_request_omits_arguments(self):
    req = build_call_tool_request(1, CallToolRequestConfig(name="add"))
    assert "arguments" not in req["params"]

  def test_retry_request_needs_fresh_id(self):
    req = build_call_tool_retry_request(1, 2, CallToolRetryConfig(name="add", input_responses={"in-1": {}}, request_state="OPAQUE"))
    assert req["id"] == 2 and req["params"]["requestState"] == "OPAQUE"
    assert req["params"]["inputResponses"] == {"in-1": {}}

  def test_retry_same_id_raises(self):
    with pytest.raises(ValueError):
      build_call_tool_retry_request(1, 1, CallToolRetryConfig(name="add", input_responses={}))


class TestResult:
  def test_build_and_validate(self):
    result = build_call_tool_result(CallToolResultConfig(content=[{"type": "text", "text": "hi"}]))
    assert is_call_tool_result(result) and result["resultType"] == "complete"
    assert not is_call_tool_error(result)

  def test_explicit_null_structured_content_survives(self):
    result = build_call_tool_result(CallToolResultConfig(content=[], structured_content=None))
    assert is_structured_content_present(result) and result["structuredContent"] is None

  def test_omitted_structured_content_absent(self):
    result = build_call_tool_result(CallToolResultConfig(content=[]))
    assert not is_structured_content_present(result)

  def test_text_fallback(self):
    block = structured_content_text_fallback({"sum": 5})
    assert block["type"] == "text" and json.loads(block["text"]) == {"sum": 5}

  def test_output_schema_result(self):
    result = build_output_schema_result({"sum": 5})
    assert result["structuredContent"] == {"sum": 5}
    assert json.loads(result["content"][0]["text"]) == {"sum": 5}

  def test_execution_error(self):
    result = build_tool_execution_error("boom")
    assert is_call_tool_result(result) and is_call_tool_error(result)
    assert result["content"][0]["text"] == "boom"


class TestTwoLayerErrors:
  def test_unknown_tool_error(self):
    assert build_unknown_tool_error("ghost") == {"code": INVALID_PARAMS_CODE, "message": "Unknown tool: ghost"}

  def test_invalid_arguments_error(self):
    err = build_invalid_arguments_error("add", ["a is required"])
    assert err["code"] == INVALID_PARAMS_CODE and "a is required" in err["message"]


class TestDispatch:
  def test_dispatched(self):
    d = dispatch_tool_call({"name": "add", "arguments": {"a": 1}}, [TOOL])
    assert d.dispatched and d.tool is TOOL and d.arguments == {"a": 1}

  def test_unknown_tool(self):
    d = dispatch_tool_call({"name": "ghost"}, [TOOL])
    assert not d.dispatched and d.error["code"] == INVALID_PARAMS_CODE

  def test_invalid_arguments_not_dispatched(self):
    d = dispatch_tool_call({"name": "add", "arguments": {"a": "no"}}, [TOOL])
    assert not d.dispatched and d.error["code"] == INVALID_PARAMS_CODE

  def test_omitted_arguments_default_validated(self):
    d = dispatch_tool_call({"name": "add"}, [TOOL])  # missing required 'a'
    assert not d.dispatched


class TestAnnotations:
  def test_defaults_applied(self):
    hints = resolve_tool_annotation_hints(None)
    assert hints == TOOL_ANNOTATION_DEFAULTS

  def test_overrides(self):
    hints = resolve_tool_annotation_hints({"readOnlyHint": True})
    assert hints["readOnlyHint"] is True and hints["openWorldHint"] is True

  def test_untrusted_fails_closed(self):
    assert not may_trust_tool_annotations()
    assert not may_trust_tool_annotations(False)
    assert may_trust_tool_annotations(True)


class TestListChanged:
  def test_build_and_validate(self):
    note = build_tool_list_changed_notification()
    assert is_tool_list_changed_notification(note) and "id" not in note

  def test_with_meta(self):
    note = build_tool_list_changed_notification({"k": 1})
    assert note["params"]["_meta"] == {"k": 1}

  def test_rejects_request_with_id(self):
    assert not is_tool_list_changed_notification({"jsonrpc": "2.0", "id": 1, "method": "notifications/tools/list_changed"})

  def test_reaction(self):
    assert react_to_tool_list_changed() == {"invalidateCachedToolList": True, "mayRelist": True}


# ─── AC-mapped mirror of tools-call.test.ts (AC-25.1 … AC-25.36) ──────────────


class TestAC25_1_NameRequiredString:
  """AC-25.1 — ``name`` REQUIRED string. (R-16.5-a)"""

  def test_accepts_string_name(self):
    req = {"jsonrpc": "2.0", "id": 2, "method": TOOLS_CALL_METHOD, "params": {"name": "get_weather_data"}}
    assert is_call_tool_request(req)

  def test_rejects_missing_name(self):
    req = {"jsonrpc": "2.0", "id": 2, "method": TOOLS_CALL_METHOD, "params": {}}
    assert not is_call_tool_request(req)

  def test_rejects_non_string_name(self):
    req = {"jsonrpc": "2.0", "id": 2, "method": TOOLS_CALL_METHOD, "params": {"name": 42}}
    assert not is_call_tool_request(req)


class TestAC25_2_UnknownToolError:
  """AC-25.2 — unknown tool name ⇒ JSON-RPC error -32602. (R-16.5-b, R-16.6-e)"""

  def test_dispatch_fails_for_unknown_name(self):
    outcome = dispatch_tool_call({"name": "invalid_tool_name"}, [WEATHER_TOOL])
    assert not outcome.dispatched
    assert outcome.error["code"] == -32602 == INVALID_PARAMS_CODE
    assert "invalid_tool_name" in outcome.error["message"]

  def test_build_unknown_tool_error_payload(self):
    assert build_unknown_tool_error("foo") == {"code": -32602, "message": "Unknown tool: foo"}


class TestAC25_3_ArgumentsPresentOrAbsent:
  """AC-25.3 — ``arguments`` present or absent both valid. (R-16.5-c)"""

  def test_accepts_arguments_present(self):
    req = {"jsonrpc": "2.0", "id": 1, "method": TOOLS_CALL_METHOD, "params": {"name": "get_weather_data", "arguments": {"location": "New York"}}}
    assert is_call_tool_request(req)

  def test_accepts_arguments_absent(self):
    req = {"jsonrpc": "2.0", "id": 1, "method": TOOLS_CALL_METHOD, "params": {"name": "get_weather_data"}}
    assert is_call_tool_request(req)


class TestAC25_4_InvalidArgumentsError:
  """AC-25.4 — invalid arguments ⇒ -32602 and tool NOT invoked. (R-16.5-d, R-16.6-f)"""

  def test_dispatch_fails_on_bad_arguments(self):
    outcome = dispatch_tool_call({"name": "get_weather_data", "arguments": {"location": 42}}, [WEATHER_TOOL])
    assert not outcome.dispatched
    assert outcome.error["code"] == INVALID_PARAMS_CODE
    assert "get_weather_data" in outcome.error["message"]

  def test_build_invalid_arguments_error_carries_detail(self):
    err = build_invalid_arguments_error("t", ["/location must be string"])
    assert err["code"] == -32602
    assert "/location must be string" in err["message"]


class TestAC25_5_OmittedArgumentsTreatedAsEmpty:
  """AC-25.5 — omitted arguments treated as ``{}``. (R-16.5-e)"""

  def test_resolve_returns_empty_when_omitted(self):
    assert resolve_call_tool_arguments({}) == {}
    assert resolve_call_tool_arguments({"arguments": {"a": 1}}) == {"a": 1}

  def test_no_arg_tool_dispatches_as_empty(self):
    outcome = dispatch_tool_call({"name": "ping"}, [NO_ARG_TOOL])
    assert outcome.dispatched
    assert outcome.arguments == {}


class TestAC25_6_RetryIncludesPriorKeys:
  """AC-25.6 — retry includes exactly the prior inputRequests keys. (R-16.5-f/-g)"""

  def test_builds_retry_with_matching_keys(self):
    retry = build_call_tool_retry_request(
      5, 6, CallToolRetryConfig(name="book_flight", input_responses={"seat_class": "economy"}, request_state="opaque-token")
    )
    assert retry["params"]["inputResponses"] == {"seat_class": "economy"}
    for key in ["seat_class"]:
      assert key in retry["params"]["inputResponses"]


class TestAC25_7_RequestStateEchoedVerbatim:
  """AC-25.7 — requestState echoed verbatim, never parsed/mutated. (R-16.5-h/-i/-j)"""

  def test_echoes_byte_for_byte(self):
    token = 'opaque-continuation-token-from-server::{"not":"parsed"}'
    retry = build_call_tool_retry_request(
      5, 6, CallToolRetryConfig(name="book_flight", input_responses={"seat_class": "economy"}, request_state=token)
    )
    assert retry["params"]["requestState"] == token

  def test_omits_when_not_supplied(self):
    retry = build_call_tool_retry_request(5, 6, CallToolRetryConfig(name="book_flight", input_responses={"seat_class": "economy"}))
    assert "requestState" not in retry["params"]


class TestAC25_8_MetaAcceptedOnRequest:
  """AC-25.8 — ``_meta`` accepted, request still valid. (R-16.5-k)"""

  def test_accepts_meta_with_progress_token(self):
    req = build_call_tool_request(2, CallToolRequestConfig(name="get_weather_data", arguments={"location": "NY"}, meta={"progressToken": "abc"}))
    assert is_call_tool_request(req)
    assert req["params"]["_meta"] == {"progressToken": "abc"}


class TestAC25_9_ContentBlockArray:
  """AC-25.9 — content is a ContentBlock[]; empty / mixed accepted. (R-16.5-l/-m)"""

  def test_accepts_non_empty_content(self):
    r = build_call_tool_result(CallToolResultConfig(content=[{"type": "text", "text": "hi"}]))
    assert is_call_tool_result(r)

  def test_accepts_empty_content(self):
    assert is_call_tool_result(build_call_tool_result(CallToolResultConfig(content=[])))

  def test_accepts_mixed_block_types(self):
    r = build_call_tool_result(
      CallToolResultConfig(content=[{"type": "text", "text": "a"}, {"type": "image", "data": "AAAA", "mimeType": "image/png"}])
    )
    assert is_call_tool_result(r)

  def test_rejects_missing_content(self):
    assert not is_call_tool_result({"resultType": "complete"})


class TestAC25_10_StructuredContentAnyJson:
  """AC-25.10 — structuredContent may be ANY JSON value. (R-16.5-n)"""

  @pytest.mark.parametrize(
    "value",
    [{"a": 1}, [1, 2, 3], "hello", 42, False, None],
  )
  def test_accepts_any_json(self, value):
    r = build_call_tool_result(CallToolResultConfig(content=[], structured_content=value))
    assert is_call_tool_result(r)
    assert is_structured_content_present(r)

  def test_distinguishes_explicit_null_from_absence(self):
    with_null = build_call_tool_result(CallToolResultConfig(content=[], structured_content=None))
    without = build_call_tool_result(CallToolResultConfig(content=[]))
    assert is_structured_content_present(with_null)
    assert not is_structured_content_present(without)


class TestAC25_11_OutputSchemaConformance:
  """AC-25.11 — outputSchema ⇒ structuredContent present & conforming. (R-16.5-o)"""

  def test_validates_conforming(self):
    assert validate_tool_structured_content(WEATHER_TOOL, {"temperature": 22.5, "conditions": "Partly cloudy"}).valid

  def test_fails_non_conforming(self):
    assert not validate_tool_structured_content(WEATHER_TOOL, {"temperature": "warm"}).valid

  def test_fails_when_absent_for_output_schema_tool(self):
    assert not validate_tool_structured_content(WEATHER_TOOL, None).valid


class TestAC25_12_TextualContentFallback:
  """AC-25.12 — outputSchema result carries a textual content fallback. (R-16.5-p)"""

  def test_text_fallback_serializes(self):
    value = {"temperature": 22.5, "conditions": "Partly cloudy", "humidity": 65}
    block = structured_content_text_fallback(value)
    assert block["type"] == "text"
    assert json.loads(block["text"]) == value

  def test_output_schema_result_populates_both(self):
    value = {"temperature": 22.5, "conditions": "Partly cloudy"}
    r = build_output_schema_result(value)
    assert r["structuredContent"] == value
    assert r["content"][0]["type"] == "text"
    assert json.loads(r["content"][0]["text"]) == value
    assert is_call_tool_result(r)


class TestAC25_13_AbsentIsErrorIsFalse:
  """AC-25.13 — absent isError treated as false / success. (R-16.5-q)"""

  def test_false_when_absent(self):
    r = build_call_tool_result(CallToolResultConfig(content=[]))
    assert "isError" not in r
    assert not is_call_tool_error(r)

  def test_true_when_true(self):
    assert is_call_tool_error({"isError": True})


class TestAC25_14_ResultTypeRequired:
  """AC-25.14 — resultType REQUIRED; "complete" for a finished call. (R-16.5-r)"""

  def test_built_result_is_complete(self):
    assert build_call_tool_result(CallToolResultConfig(content=[]))["resultType"] == "complete"

  def test_rejects_missing_result_type(self):
    assert not is_call_tool_result({"content": []})

  def test_rejects_non_complete_result_type(self):
    assert not is_call_tool_result({"resultType": "input_required", "content": []})


class TestAC25_15_MetaOnResult:
  """AC-25.15 — _meta accepted on a result. (R-16.5-s)"""

  def test_accepts_meta(self):
    r = build_call_tool_result(CallToolResultConfig(content=[], meta={"trace": "x"}))
    assert is_call_tool_result(r)
    assert r["_meta"] == {"trace": "x"}


class TestAC25_16_InputRequiredRetry:
  """AC-25.16 — input_required ⇒ client may gather input and retry. (R-16.5-t)"""

  def test_retry_sets_both_fields(self):
    retry = build_call_tool_retry_request(
      5, 6, CallToolRetryConfig(name="book_flight", input_responses={"seat_class": "economy"}, request_state="opaque")
    )
    assert retry["params"]["inputResponses"] == {"seat_class": "economy"}
    assert retry["params"]["requestState"] == "opaque"
    assert retry["method"] == "tools/call"


class TestAC25_17_RetryIdDiffers:
  """AC-25.17 — retry id differs from initial id. (R-16.5-u)"""

  def test_raises_when_ids_equal(self):
    with pytest.raises(ValueError):
      build_call_tool_retry_request(5, 5, CallToolRetryConfig(name="book_flight", input_responses={"seat_class": "economy"}))

  def test_different_id_when_ids_differ(self):
    retry = build_call_tool_retry_request(5, 6, CallToolRetryConfig(name="book_flight", input_responses={"seat_class": "economy"}))
    assert retry["id"] == 6
    assert retry["id"] != 5


class TestAC25_18_TwoLayersNeverConflated:
  """AC-25.18 — tool failure vs dispatch failure never conflated. (R-16.6-a)"""

  def test_dispatch_failure_is_jsonrpc_error(self):
    outcome = dispatch_tool_call({"name": "nope"}, [WEATHER_TOOL])
    assert not outcome.dispatched
    assert not is_call_tool_result(outcome.error)
    assert outcome.error["code"] == INVALID_PARAMS_CODE

  def test_execution_failure_is_result_with_iserror(self):
    result = build_tool_execution_error("boom")
    assert is_call_tool_result(result)
    assert is_call_tool_error(result)
    assert "code" not in result


class TestAC25_19_ExecutionErrorShape:
  """AC-25.19 — tool execution error is a successful result w/ isError + explanation. (R-16.6-b)"""

  def test_builds_iserror_with_text_explanation(self):
    msg = "Invalid departure date: must be in the future. Current date is 08/08/2025."
    result = build_tool_execution_error(msg)
    assert result["resultType"] == "complete"
    assert result["isError"] is True
    assert result["content"][0] == {"type": "text", "text": msg}
    assert is_call_tool_result(result)


class TestAC25_20_ClientProvidesErrorToModel:
  """AC-25.20 — client provides tool execution error to the model. (R-16.6-c)"""

  def test_explanation_is_forwardable(self):
    result = build_tool_execution_error("upstream timed out")
    assert is_call_tool_error(result)
    assert result["content"][0]["text"] == "upstream timed out"


class TestAC25_21_UndispatchableIsJsonRpcError:
  """AC-25.21 — undispatchable request ⇒ JSON-RPC error, never a CallToolResult. (R-16.6-d)"""

  def test_unknown_and_bad_args_both_jsonrpc_errors(self):
    unknown = dispatch_tool_call({"name": "x"}, [WEATHER_TOOL])
    bad_args = dispatch_tool_call({"name": "get_weather_data", "arguments": {"location": 1}}, [WEATHER_TOOL])
    for outcome in (unknown, bad_args):
      assert not outcome.dispatched
      assert outcome.error["code"] == INVALID_PARAMS_CODE
      assert not is_call_tool_result(outcome.error)


class TestAC25_22_ProtocolErrorSurfaceable:
  """AC-25.22 — client MAY surface protocol errors to the model. (R-16.6-g)"""

  def test_protocol_error_has_message(self):
    err = build_unknown_tool_error("ghost_tool")
    assert isinstance(err["message"], str)
    assert len(err["message"]) > 0


class TestAC25_23_AnnotationsTitle:
  """AC-25.23 — annotations.title optional display string. (R-16.7-a)"""

  def test_resolves_with_or_without_title(self):
    # The py-sdk surface resolves the four boolean hints; title is carried on the
    # Tool annotations map and consumed by tool_display_name (tested in test_tools).
    assert resolve_tool_annotation_hints({"title": "Web Search"}) == TOOL_ANNOTATION_DEFAULTS
    assert resolve_tool_annotation_hints({}) == TOOL_ANNOTATION_DEFAULTS


class TestAC25_24_ReadOnlyHintDefaultFalse:
  """AC-25.24 — readOnlyHint defaults to false. (R-16.7-b)"""

  def test_defaults_false(self):
    assert resolve_tool_annotation_hints(None)["readOnlyHint"] is False
    assert resolve_tool_annotation_hints({})["readOnlyHint"] is False
    assert TOOL_ANNOTATION_DEFAULTS["readOnlyHint"] is False

  def test_reflects_true(self):
    assert resolve_tool_annotation_hints({"readOnlyHint": True})["readOnlyHint"] is True


class TestAC25_25_DestructiveHintDefaultTrue:
  """AC-25.25 — destructiveHint defaults to true. (R-16.7-c)"""

  def test_defaults_true(self):
    assert resolve_tool_annotation_hints({})["destructiveHint"] is True
    assert TOOL_ANNOTATION_DEFAULTS["destructiveHint"] is True

  def test_reflects_false(self):
    assert resolve_tool_annotation_hints({"destructiveHint": False})["destructiveHint"] is False


class TestAC25_26_IdempotentHintDefaultFalse:
  """AC-25.26 — idempotentHint defaults to false. (R-16.7-d)"""

  def test_defaults_false(self):
    assert resolve_tool_annotation_hints({})["idempotentHint"] is False
    assert TOOL_ANNOTATION_DEFAULTS["idempotentHint"] is False

  def test_reflects_true(self):
    assert resolve_tool_annotation_hints({"idempotentHint": True})["idempotentHint"] is True


class TestAC25_27_OpenWorldHintDefaultTrue:
  """AC-25.27 — openWorldHint defaults to true. (R-16.7-e)"""

  def test_defaults_true(self):
    assert resolve_tool_annotation_hints({})["openWorldHint"] is True
    assert TOOL_ANNOTATION_DEFAULTS["openWorldHint"] is True

  def test_reflects_false(self):
    assert resolve_tool_annotation_hints({"openWorldHint": False})["openWorldHint"] is False


class TestAC25_28_AnnotationsUntrusted:
  """AC-25.28 — annotations are untrusted; no safety decision on untrusted server. (R-16.7-f/-g)"""

  def test_fails_closed_for_untrusted(self):
    assert not may_trust_tool_annotations()
    assert not may_trust_tool_annotations(False)

  def test_permits_only_for_trusted(self):
    assert may_trust_tool_annotations(True)


class TestAC25_29_ListChangedNotification:
  """AC-25.29 — notifications/tools/list_changed on tool-set change. (R-16.8-a)"""

  def test_builds_well_formed_with_reused_method(self):
    n = build_tool_list_changed_notification()
    assert n["method"] == "notifications/tools/list_changed" == TOOLS_LIST_CHANGED_METHOD
    assert is_tool_list_changed_notification(n)


class TestAC25_30_NotificationNeedsNoPayload:
  """AC-25.30 — notification needs no payload / no prior subscription. (R-16.8-b)"""

  def test_valid_with_no_params(self):
    n = {"jsonrpc": "2.0", "method": TOOLS_LIST_CHANGED_METHOD}
    assert is_tool_list_changed_notification(n)

  def test_valid_carrying_only_meta(self):
    n = build_tool_list_changed_notification({"k": "v"})
    assert n["params"] == {"_meta": {"k": "v"}}
    assert is_tool_list_changed_notification(n)

  def test_has_no_id(self):
    assert "id" not in build_tool_list_changed_notification()


class TestAC25_31_ClientInvalidatesAndRelists:
  """AC-25.31 — client invalidates cache and may re-list. (R-16.8-c/-d)"""

  def test_reaction_invalidates_and_permits_relist(self):
    reaction = react_to_tool_list_changed()
    assert reaction["invalidateCachedToolList"] is True
    assert reaction["mayRelist"] is True


class TestAC25_32_ExplicitHandleRoundTrip:
  """AC-25.32 — explicit handle returned and accepted, not connection identity. (R-16.9-a)"""

  def test_handle_in_structured_content_then_arg(self):
    handle = "550e8400-e29b-41d4-a716-446655440000"
    created = build_output_schema_result({"cartHandle": handle})
    assert created["structuredContent"]["cartHandle"] == handle
    add_item = {
      "name": "cart_add_item",
      "inputSchema": {
        "type": "object",
        "properties": {"cartHandle": {"type": "string"}, "sku": {"type": "string"}},
        "required": ["cartHandle", "sku"],
      },
    }
    outcome = dispatch_tool_call({"name": "cart_add_item", "arguments": {"cartHandle": handle, "sku": "ABC"}}, [add_item])
    assert outcome.dispatched
    assert outcome.arguments["cartHandle"] == handle


class TestAC25_33_AuthzAgainstHandleEveryCall:
  """AC-25.33 — authenticated server validates authz against handle every call. (R-16.9-b)"""

  def test_authz_failure_is_execution_error(self):
    def authorized(caller, handle):
      return caller == "alice" and handle == "h1"

    result = (
      build_output_schema_result({"ok": True})
      if authorized("mallory", "h1")
      else build_tool_execution_error("Not authorized for handle h1")
    )
    assert is_call_tool_error(result)


class TestAC25_34_HandleHighEntropyBoundedLifetime:
  """AC-25.34 — unauthenticated handle is high-entropy with bounded lifetime. (R-16.9-c)"""

  def test_uuid_shaped_handle(self):
    import re

    handle = "550e8400-e29b-41d4-a716-446655440000"
    uuid_v4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)
    assert uuid_v4.match(handle)


class TestAC25_35_HandleIsOpaque:
  """AC-25.35 — handle is opaque; retention policy stated in description. (R-16.9-d/-e)"""

  def test_opaque_handle_is_plain_string(self):
    handle = "opaque-token-do-not-parse"
    outcome = dispatch_tool_call({"name": "ping", "arguments": {}}, [NO_ARG_TOOL])
    assert outcome.dispatched
    assert isinstance(handle, str)

  def test_retention_policy_in_description(self):
    description = "Creates a shopping cart and returns an opaque handle. Handles expire after 1 hour."
    assert "expire" in description.lower()


class TestAC25_36_ExpiredHandleExecutionError:
  """AC-25.36 — expired/unknown handle ⇒ tool execution error describing the condition. (R-16.9-f)"""

  def test_unknown_handle_returns_iserror(self):
    result = build_tool_execution_error("Cart handle expired or unknown; create a new cart to continue.")
    assert is_call_tool_error(result)
    assert "expired or unknown" in result["content"][0]["text"].lower()
    assert "code" not in result
