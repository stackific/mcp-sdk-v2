"""Tests for Tools I — capability, JSON-Schema rules, value validation, Tool, tools/list (§16).

Mirrors the TS acceptance criteria AC-24.1 … AC-24.39 (``tools.test.ts``) plus the
``tools-value-validation.test.ts`` suite, then adds Python-specific edge cases. The TS
SDK expresses the wire shapes as Zod schemas (``ToolSchema``, ``ListToolsResultSchema``);
the py-sdk convention is structural ``is_valid_*`` predicates (the documented analogue),
so a TS ``safeParse(x).success`` assertion maps to the corresponding ``is_valid_*`` call.
"""

import pytest

from mcp.protocol.tools import (
  DEFAULT_SCHEMA_DIALECT,
  DEFAULT_SCHEMA_LIMITS,
  SUPPORTED_SCHEMA_DIALECTS,
  TOOL_NAME_MAX_LENGTH,
  TOOL_NAME_MIN_LENGTH,
  TOOL_NAME_PATTERN,
  TOOLS_CALL_METHOD,
  TOOLS_LIST_CHANGED_METHOD,
  TOOLS_LIST_METHOD,
  ListToolsResultConfig,
  SchemaLimits,
  UnsupportedDialectError,
  assert_registrable_tool_schema,
  build_list_tools_request,
  build_list_tools_result,
  disambiguate_tool_name,
  find_duplicate_tool_names,
  has_external_ref,
  is_conventional_tool_name,
  is_in_document_ref,
  is_supported_schema_dialect,
  is_valid_list_tools_request,
  is_valid_list_tools_request_params,
  is_valid_list_tools_result,
  is_valid_tool,
  is_valid_tools_capability,
  may_client_expect_tools_list_changed,
  may_client_send_tools_request,
  may_server_answer_tools_list,
  may_server_emit_tools_list_changed,
  schema_dialect,
  schema_nesting_depth,
  server_exposes_tools,
  tool_display_name,
  validate_tool_arguments,
  validate_tool_schema,
  validate_tool_structured_content,
  validate_value_against_schema,
)

OBJ_SCHEMA = {"type": "object", "properties": {"x": {"type": "string"}}, "required": ["x"]}

# ── Fixtures mirroring tools.test.ts ─────────────────────────────────────────────

MINIMAL_TOOL = {"name": "get_weather", "inputSchema": {"type": "object"}}

FULL_TOOL = {
  "name": "get_weather_data",
  "title": "Weather Data Retriever",
  "description": "Get current weather data for a location",
  "inputSchema": {
    "type": "object",
    "properties": {"location": {"type": "string", "description": "City name or zip code"}},
    "required": ["location"],
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "temperature": {"type": "number"},
      "conditions": {"type": "string"},
      "humidity": {"type": "number"},
    },
    "required": ["temperature", "conditions", "humidity"],
  },
  "annotations": {"title": "Weather Data Retriever", "readOnlyHint": True, "openWorldHint": True},
  "icons": [{"src": "https://example.com/weather-icon.png", "mimeType": "image/png", "sizes": ["48x48"]}],
}

CAPS_WITH_TOOLS = {"tools": {}}
CAPS_WITH_LISTCHANGED = {"tools": {"listChanged": True}}
CAPS_WITH_LISTCHANGED_FALSE = {"tools": {"listChanged": False}}
CAPS_WITHOUT_TOOLS = {"resources": {}}


class TestCapability:
  def test_server_exposes_and_answers(self):
    assert server_exposes_tools({"tools": {}})
    assert may_server_answer_tools_list({"tools": {}}, "tools/call")
    assert not may_server_answer_tools_list({"tools": {}}, "tools/other")
    assert not may_server_answer_tools_list({}, "tools/list")

  def test_client_send_and_listchanged(self):
    assert may_client_send_tools_request({"tools": {}}, "tools/list")
    assert not may_client_send_tools_request({}, "tools/list")
    assert may_client_expect_tools_list_changed({"tools": {"listChanged": True}})
    assert not may_client_expect_tools_list_changed({"tools": {}})


class TestDialect:
  def test_default_and_explicit(self):
    assert schema_dialect({}) == DEFAULT_SCHEMA_DIALECT
    assert schema_dialect({"$schema": "https://json-schema.org/draft/2020-12/schema#"}).endswith("#")

  def test_supported(self):
    assert is_supported_schema_dialect(DEFAULT_SCHEMA_DIALECT)
    assert not is_supported_schema_dialect("https://json-schema.org/draft-07/schema")


class TestRefsAndDepth:
  def test_in_document_refs(self):
    assert is_in_document_ref("#")
    assert is_in_document_ref("#/$defs/x")
    assert is_in_document_ref("#anchor")
    assert not is_in_document_ref("https://example.com/schema")
    assert not is_in_document_ref("other.json#/x")

  def test_has_external_ref(self):
    assert has_external_ref({"properties": {"a": {"$ref": "https://x/s"}}})
    assert not has_external_ref({"properties": {"a": {"$ref": "#/$defs/a"}}})

  def test_nesting_depth_capped(self):
    deep = {"a": {"b": {"c": {"d": 1}}}}
    assert schema_nesting_depth(deep, cap=2) == 2


class TestValidateToolSchema:
  def test_valid_input(self):
    assert validate_tool_schema(OBJ_SCHEMA, "input").ok

  def test_input_root_must_be_object(self):
    res = validate_tool_schema({"type": "string"}, "input")
    assert not res.ok and "object" in res.reason

  def test_output_root_unrestricted(self):
    assert validate_tool_schema({"type": "string"}, "output").ok

  def test_non_object_rejected(self):
    assert not validate_tool_schema(None, "input").ok

  def test_external_ref_rejected(self):
    res = validate_tool_schema({"type": "object", "properties": {"a": {"$ref": "https://x/s"}}}, "input")
    assert not res.ok and "$ref" in res.reason

  def test_unsupported_dialect_rejected(self):
    res = validate_tool_schema({"type": "object", "$schema": "https://json-schema.org/draft-07/schema"}, "input")
    assert not res.ok

  def test_assert_registrable(self):
    assert_registrable_tool_schema(OBJ_SCHEMA, "input")  # no raise
    with pytest.raises(UnsupportedDialectError):
      assert_registrable_tool_schema({"type": "object", "$schema": "https://json-schema.org/draft-07/schema"}, "input")
    with pytest.raises(TypeError):
      assert_registrable_tool_schema({"type": "string"}, "input")


class TestValueValidation:
  def test_valid_value(self):
    res = validate_value_against_schema(OBJ_SCHEMA, {"x": "hi"})
    assert res.valid and res.errors == []

  def test_invalid_value_collects_errors(self):
    res = validate_value_against_schema(OBJ_SCHEMA, {"x": 42})
    assert not res.valid and res.errors

  def test_missing_required(self):
    assert not validate_value_against_schema(OBJ_SCHEMA, {}).valid

  def test_non_object_schema(self):
    assert not validate_value_against_schema(None, {}).valid

  def test_unsupported_dialect(self):
    assert not validate_value_against_schema({"$schema": "https://json-schema.org/draft-07/schema"}, {}).valid

  def test_validate_tool_arguments_and_output(self):
    tool = {"inputSchema": OBJ_SCHEMA, "outputSchema": {"type": "object", "properties": {"sum": {"type": "number"}}}}
    assert validate_tool_arguments(tool, {"x": "ok"}).valid
    assert not validate_tool_arguments(tool, {"x": 1}).valid
    assert validate_tool_structured_content(tool, {"sum": 5}).valid
    assert not validate_tool_structured_content(tool, {"sum": "no"}).valid

  def test_no_output_schema_is_valid(self):
    assert validate_tool_structured_content({"inputSchema": OBJ_SCHEMA}, {"anything": 1}).valid


class TestToolType:
  def test_conventional_name(self):
    assert is_conventional_tool_name("my.tool-1_x")
    assert not is_conventional_tool_name("has space")
    assert not is_conventional_tool_name("")
    assert not is_conventional_tool_name("x" * 129)

  def test_is_valid_tool(self):
    assert is_valid_tool({"name": "echo", "inputSchema": {"type": "object"}})
    assert not is_valid_tool({"name": "echo"})  # no inputSchema
    assert not is_valid_tool({"name": "echo", "inputSchema": {"type": "string"}})  # root not object
    assert not is_valid_tool({"inputSchema": {"type": "object"}})  # no name

  def test_display_name_precedence(self):
    assert tool_display_name({"name": "n", "title": "T"}) == "T"
    assert tool_display_name({"name": "n", "annotations": {"title": "AT"}}) == "AT"
    assert tool_display_name({"name": "n"}) == "n"

  def test_duplicates_and_disambiguate(self):
    assert find_duplicate_tool_names([{"name": "a"}, {"name": "b"}, {"name": "a"}]) == ["a"]
    assert disambiguate_tool_name("srv", "tool") == "srv.tool"


class TestListResult:
  def test_build_and_validate(self):
    result = build_list_tools_result(
      ListToolsResultConfig(tools=[{"name": "echo", "inputSchema": {"type": "object"}}], ttl_ms=0, cache_scope="private")
    )
    assert is_valid_list_tools_result(result)
    assert result["resultType"] == "complete"

  def test_optional_fields(self):
    result = build_list_tools_result(
      ListToolsResultConfig(tools=[], ttl_ms=5, cache_scope="public", next_cursor="2", meta={"k": 1})
    )
    assert result["nextCursor"] == "2" and result["_meta"] == {"k": 1}

  def test_negative_ttl_raises(self):
    with pytest.raises(ValueError):
      build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=-1, cache_scope="public"))

  def test_invalid_result(self):
    assert not is_valid_list_tools_result({"resultType": "complete", "tools": [{"name": "x"}], "ttlMs": 0, "cacheScope": "private"})
    assert not is_valid_list_tools_result({"resultType": "input_required", "tools": [], "ttlMs": 0, "cacheScope": "private"})

  def test_build_request(self):
    assert build_list_tools_request(1) == {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    req = build_list_tools_request(1, cursor="2")
    assert req["params"]["cursor"] == "2"


# ─── AC-mapped mirror of tools.test.ts (AC-24.1 … AC-24.39) ───────────────────


class TestAC24_1_CapabilityDeclarationAndGating:
  """AC-24.1 — server exposing tools declares ``tools``; gating of list/call. (R-16.1-a/-c)"""

  def test_detects_tools_capability(self):
    assert server_exposes_tools(CAPS_WITH_TOOLS) is True
    assert server_exposes_tools(CAPS_WITHOUT_TOOLS) is False

  def test_server_does_not_honor_list_or_call_without_tools(self):
    assert may_server_answer_tools_list(CAPS_WITHOUT_TOOLS, TOOLS_LIST_METHOD) is False
    assert may_server_answer_tools_list(CAPS_WITHOUT_TOOLS, TOOLS_CALL_METHOD) is False
    assert may_server_answer_tools_list(CAPS_WITH_TOOLS, TOOLS_LIST_METHOD) is True
    assert may_server_answer_tools_list(CAPS_WITH_TOOLS, TOOLS_CALL_METHOD) is True


class TestAC24_2_ClientGating:
  """AC-24.2 — client must not send list/call when server lacks ``tools``. (R-16.1-d)"""

  def test_client_does_not_send_without_tools(self):
    assert may_client_send_tools_request(CAPS_WITHOUT_TOOLS, TOOLS_LIST_METHOD) is False
    assert may_client_send_tools_request(CAPS_WITHOUT_TOOLS, TOOLS_CALL_METHOD) is False

  def test_client_may_send_once_declared(self):
    assert may_client_send_tools_request(CAPS_WITH_TOOLS, TOOLS_LIST_METHOD) is True
    assert may_client_send_tools_request(CAPS_WITH_TOOLS, TOOLS_CALL_METHOD) is True


class TestAC24_3_ListChangedEmissionGating:
  """AC-24.3 — listChanged gates emission of the notification. (R-16.1-b)"""

  def test_no_emit_when_absent_or_false(self):
    assert may_server_emit_tools_list_changed(CAPS_WITH_TOOLS) is False
    assert may_server_emit_tools_list_changed(CAPS_WITH_LISTCHANGED_FALSE) is False

  def test_may_emit_when_true(self):
    assert may_server_emit_tools_list_changed(CAPS_WITH_LISTCHANGED) is True

  def test_notification_method_name(self):
    assert TOOLS_LIST_CHANGED_METHOD == "notifications/tools/list_changed"


class TestAC24_4_ClientMustNotRelyOnListChanged:
  """AC-24.4 — client must not rely on the notification without the flag. (R-16.1-e)"""

  def test_does_not_expect_when_false_or_omitted(self):
    assert may_client_expect_tools_list_changed(CAPS_WITH_TOOLS) is False
    assert may_client_expect_tools_list_changed(CAPS_WITH_LISTCHANGED_FALSE) is False

  def test_may_expect_when_true(self):
    assert may_client_expect_tools_list_changed(CAPS_WITH_LISTCHANGED) is True


class TestAC24_5_DeclaredServerAnswersList:
  """AC-24.5 — declared server responds with the tool set. (R-16.1-f)"""

  def test_builds_complete_result_with_current_set(self):
    result = build_list_tools_result(ListToolsResultConfig(tools=[FULL_TOOL], ttl_ms=300000, cache_scope="public"))
    assert result["resultType"] == "complete"
    assert result["tools"] == [FULL_TOOL]
    assert is_valid_list_tools_result(result)


class TestAC24_6_EmptyChangingSet:
  """AC-24.6 — empty set valid; set may change over time. (R-16.1-g)"""

  def test_empty_tools_is_valid(self):
    result = build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=0, cache_scope="private"))
    assert result["tools"] == []
    assert is_valid_list_tools_result(result)

  def test_later_request_may_return_different_set(self):
    first = build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=0, cache_scope="private"))
    later = build_list_tools_result(ListToolsResultConfig(tools=[MINIMAL_TOOL], ttl_ms=0, cache_scope="private"))
    assert first["tools"] != later["tools"]


class TestAC24_7_SetDoesNotVaryPerConnection:
  """AC-24.7 — same connection + same auth ⇒ identical set. (R-16.1-h)"""

  def test_two_builds_from_same_source_are_identical(self):
    cfg = lambda: ListToolsResultConfig(tools=[FULL_TOOL, MINIMAL_TOOL], ttl_ms=1000, cache_scope="public")
    a = build_list_tools_result(cfg())
    b = build_list_tools_result(cfg())
    assert a["tools"] == b["tools"]


class TestAC24_8_SetMayVaryByAuthorization:
  """AC-24.8 — set MAY differ by authorization scope. (R-16.1-i)"""

  def test_different_credential_views_yield_different_sets(self):
    reader = build_list_tools_result(ListToolsResultConfig(tools=[MINIMAL_TOOL], ttl_ms=0, cache_scope="private"))
    admin = build_list_tools_result(ListToolsResultConfig(tools=[MINIMAL_TOOL, FULL_TOOL], ttl_ms=0, cache_scope="private"))
    assert len(admin["tools"]) > len(reader["tools"])


class TestAC24_9_DeterministicOrdering:
  """AC-24.9 — deterministic ordering across unchanged requests. (R-16.2-o)"""

  def test_preserves_order_verbatim(self):
    ordered = [{"name": "a", "inputSchema": {"type": "object"}}, MINIMAL_TOOL, FULL_TOOL]
    r1 = build_list_tools_result(ListToolsResultConfig(tools=ordered, ttl_ms=0, cache_scope="public"))
    r2 = build_list_tools_result(ListToolsResultConfig(tools=ordered, ttl_ms=0, cache_scope="public"))
    assert [t["name"] for t in r1["tools"]] == [t["name"] for t in r2["tools"]]
    assert [t["name"] for t in r1["tools"]] == ["a", "get_weather", "get_weather_data"]


class TestAC24_10_RequestCursor:
  """AC-24.10 — optional opaque cursor on the request. (R-16.2-a)"""

  def test_accepts_opaque_cursor(self):
    req = build_list_tools_request(1, "page-2-opaque-token")
    assert req["params"]["cursor"] == "page-2-opaque-token"
    assert is_valid_list_tools_request(req)

  def test_absent_cursor_requests_first_page(self):
    req = build_list_tools_request(1)
    assert "params" not in req
    assert is_valid_list_tools_request(req)
    assert is_valid_list_tools_request_params({})


class TestAC24_11_ToolsArrayRequired:
  """AC-24.11 — ``tools`` present as an array of Tool. (R-16.2-b)"""

  def test_requires_tools_array(self):
    assert not is_valid_list_tools_result({"resultType": "complete", "ttlMs": 0, "cacheScope": "public"})
    assert is_valid_list_tools_result({"resultType": "complete", "tools": [FULL_TOOL], "ttlMs": 0, "cacheScope": "public"})

  def test_rejects_non_tool_entry(self):
    bad = {"resultType": "complete", "tools": [{"name": "x"}], "ttlMs": 0, "cacheScope": "public"}
    assert not is_valid_list_tools_result(bad)


class TestAC24_12_NextCursorPagination:
  """AC-24.12 — nextCursor presence/absence + re-issue. (R-16.2-c/-d)"""

  def test_non_final_carries_nextcursor_final_omits(self):
    non_final = build_list_tools_result(
      ListToolsResultConfig(tools=[MINIMAL_TOOL], ttl_ms=0, cache_scope="public", next_cursor="next")
    )
    final = build_list_tools_result(ListToolsResultConfig(tools=[MINIMAL_TOOL], ttl_ms=0, cache_scope="public"))
    assert non_final["nextCursor"] == "next"
    assert "nextCursor" not in final

  def test_client_may_reissue_with_received_cursor(self):
    nxt = build_list_tools_result(
      ListToolsResultConfig(tools=[], ttl_ms=0, cache_scope="public", next_cursor="abc")
    )["nextCursor"]
    req = build_list_tools_request(2, nxt)
    assert req["params"]["cursor"] == "abc"


class TestAC24_13_OpaqueCursorPassThrough:
  """AC-24.13 — nextCursor treated as opaque (pass-through verbatim). (R-16.2-e/-f)"""

  def test_passes_structured_looking_cursor_unchanged(self):
    opaque = '{"offset":40}::weird//token'
    req = build_list_tools_request(3, opaque)
    assert req["params"]["cursor"] == opaque

  def test_empty_string_cursor_preserved(self):
    req = build_list_tools_request(4, "")
    assert req["params"]["cursor"] == ""
    assert is_valid_list_tools_request(req)


class TestAC24_14_TtlAndCacheScopeRequired:
  """AC-24.14 — ttlMs ≥ 0 and cacheScope ∈ {public, private}. (R-16.2-g/-j)"""

  def test_requires_non_negative_integer_ttl(self):
    assert not is_valid_list_tools_result({"resultType": "complete", "tools": [], "ttlMs": -1, "cacheScope": "public"})
    assert not is_valid_list_tools_result({"resultType": "complete", "tools": [], "ttlMs": 1.5, "cacheScope": "public"})
    assert is_valid_list_tools_result({"resultType": "complete", "tools": [], "ttlMs": 0, "cacheScope": "public"})

  def test_requires_public_or_private(self):
    assert not is_valid_list_tools_result({"resultType": "complete", "tools": [], "ttlMs": 0, "cacheScope": "shared"})
    assert is_valid_list_tools_result({"resultType": "complete", "tools": [], "ttlMs": 0, "cacheScope": "private"})

  def test_builder_raises_on_invalid_ttl(self):
    with pytest.raises(ValueError):
      build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=-5, cache_scope="public"))
    with pytest.raises(ValueError):
      build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=2.2, cache_scope="public"))

  def test_bool_ttl_rejected(self):
    # In Python ``bool`` is an ``int`` subclass; a ``True`` ttl must NOT be accepted.
    assert not is_valid_list_tools_result({"resultType": "complete", "tools": [], "ttlMs": True, "cacheScope": "public"})
    with pytest.raises(ValueError):
      build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=True, cache_scope="public"))


class TestAC24_15_TtlFreshnessSemantics:
  """AC-24.15 — ttlMs max-age semantics (0 = stale, N>0 = fresh window). (R-16.2-h/-i)"""

  def test_zero_and_positive_permitted(self):
    assert build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=0, cache_scope="public"))["ttlMs"] == 0
    assert build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=300000, cache_scope="public"))["ttlMs"] == 300000


class TestAC24_16_CacheScopeSemantics:
  """AC-24.16 — cacheScope public/private sharing semantics. (R-16.2-k/-l)"""

  def test_both_representable(self):
    assert build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=1, cache_scope="public"))["cacheScope"] == "public"
    assert build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=1, cache_scope="private"))["cacheScope"] == "private"


class TestAC24_17_ResultTypeComplete:
  """AC-24.17 — resultType is "complete". (R-16.2-m)"""

  def test_result_type_is_complete(self):
    assert build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=0, cache_scope="public"))["resultType"] == "complete"

  def test_rejects_missing_result_type(self):
    assert not is_valid_list_tools_result({"tools": [], "ttlMs": 0, "cacheScope": "public"})


class TestAC24_18_ResultMeta:
  """AC-24.18 — optional ``_meta`` on the result. (R-16.2-n)"""

  def test_accepts_meta_and_omits_when_absent(self):
    with_meta = build_list_tools_result(
      ListToolsResultConfig(tools=[], ttl_ms=0, cache_scope="public", meta={"x.y/z": 1})
    )
    assert with_meta["_meta"] == {"x.y/z": 1}
    without = build_list_tools_result(ListToolsResultConfig(tools=[], ttl_ms=0, cache_scope="public"))
    assert "_meta" not in without


class TestAC24_19_ToolNameRequired:
  """AC-24.19 — Tool.name present as a string. (R-16.3-a)"""

  def test_requires_string_name(self):
    assert is_valid_tool(MINIMAL_TOOL)
    assert not is_valid_tool({"inputSchema": {"type": "object"}})
    assert not is_valid_tool({"name": 42, "inputSchema": {"type": "object"}})


class TestAC24_20_NameConventions:
  """AC-24.20 — name conventions. (R-16.3-b..f)"""

  def test_length_bounds_and_pattern(self):
    assert TOOL_NAME_MIN_LENGTH == 1
    assert TOOL_NAME_MAX_LENGTH == 128
    assert bool(TOOL_NAME_PATTERN.match("Get_weather-data.v2"))

  def test_accepts_conventional_rejects_special(self):
    assert is_conventional_tool_name("get_weather.data-2")
    assert not is_conventional_tool_name("get weather")
    assert not is_conventional_tool_name("a,b")
    assert not is_conventional_tool_name("emoji😀")

  def test_enforces_length_window(self):
    assert not is_conventional_tool_name("")
    assert is_conventional_tool_name("a" * 128)
    assert not is_conventional_tool_name("a" * 129)

  def test_case_sensitive_names_distinct(self):
    assert find_duplicate_tool_names([{"name": "Tool"}, {"name": "tool"}]) == []

  def test_detects_non_unique_names(self):
    assert find_duplicate_tool_names([{"name": "a"}, {"name": "a"}, {"name": "b"}]) == ["a"]


class TestAC24_21_CollisionDisambiguation:
  """AC-24.21 — aggregation collisions & disambiguation. (R-16.3-g/-h)"""

  def test_acknowledges_cross_server_collision(self):
    assert find_duplicate_tool_names([{"name": "search"}, {"name": "search"}]) == ["search"]

  def test_applies_server_id_prefix(self):
    assert disambiguate_tool_name("serverA", "search") == "serverA.search"
    assert disambiguate_tool_name("serverB", "search") == "serverB.search"
    assert disambiguate_tool_name("s", "search", "__") == "s__search"


class TestAC24_22_DisplayNamePrecedence:
  """AC-24.22 — display-name precedence. (R-16.3-i)"""

  def test_prefers_title_then_annotations_then_name(self):
    assert tool_display_name({"name": "n", "title": "T", "annotations": {"title": "A"}}) == "T"
    assert tool_display_name({"name": "n", "annotations": {"title": "A"}}) == "A"
    assert tool_display_name({"name": "n"}) == "n"

  def test_title_optional(self):
    assert is_valid_tool(MINIMAL_TOOL)
    assert "title" not in MINIMAL_TOOL


class TestAC24_23_Description:
  """AC-24.23 — description optional + model selection hint. (R-16.3-j)"""

  def test_description_optional_and_accepted(self):
    assert is_valid_tool({"name": "n", "inputSchema": {"type": "object"}})
    assert is_valid_tool({"name": "n", "description": "help the model choose", "inputSchema": {"type": "object"}})

  def test_non_string_description_rejected(self):
    assert not is_valid_tool({"name": "n", "description": 5, "inputSchema": {"type": "object"}})


class TestAC24_24_InputSchemaRootObject:
  """AC-24.24 — inputSchema present, 2020-12, root type object. (R-16.3-k, R-16.4-d)"""

  def test_requires_root_type_object(self):
    assert is_valid_tool({"name": "n", "inputSchema": {"type": "object"}})
    assert not is_valid_tool({"name": "n", "inputSchema": {"type": "array"}})
    assert not is_valid_tool({"name": "n"})

  def test_2020_12_is_default_dialect(self):
    assert schema_dialect({"type": "object"}) == DEFAULT_SCHEMA_DIALECT
    assert validate_tool_schema({"type": "object"}, "input").ok


class TestAC24_25_NoParameterInputSchema:
  """AC-24.25 — no-parameter tool still has a valid object schema. (R-16.3-l)"""

  def test_accepts_additional_properties_false_and_bare_object(self):
    assert is_valid_tool({"name": "n", "inputSchema": {"type": "object", "additionalProperties": False}})
    assert is_valid_tool({"name": "n", "inputSchema": {"type": "object"}})
    assert validate_tool_schema({"type": "object", "additionalProperties": False}, "input").ok


class TestAC24_26_OptionalToolFields:
  """AC-24.26 — optional Tool fields. (R-16.3-m..p)"""

  def test_accepts_output_annotations_icons_meta(self):
    assert is_valid_tool(FULL_TOOL)
    assert is_valid_tool({**MINIMAL_TOOL, "_meta": {"a.b/c": True}})

  def test_rejects_non_dict_output_schema_and_non_list_icons(self):
    assert not is_valid_tool({**MINIMAL_TOOL, "outputSchema": "no"})
    assert not is_valid_tool({**MINIMAL_TOOL, "icons": "no"})
    assert not is_valid_tool({**MINIMAL_TOOL, "annotations": "no"})
    assert not is_valid_tool({**MINIMAL_TOOL, "_meta": "no"})


class TestAC24_27_DialectDefaultAndDeclaration:
  """AC-24.27 — default vs declared dialect. (R-16.4-a/-b)"""

  def test_no_schema_means_2020_12(self):
    assert schema_dialect({"type": "object"}) == DEFAULT_SCHEMA_DIALECT
    assert DEFAULT_SCHEMA_DIALECT in SUPPORTED_SCHEMA_DIALECTS

  def test_explicit_schema_governs(self):
    declared = "http://json-schema.org/draft-07/schema#"
    assert schema_dialect({"$schema": declared, "type": "object"}) == declared


class TestAC24_28_PermittedKeywords:
  """AC-24.28 — other 2020-12 keywords permitted alongside root type. (R-16.4-c)"""

  def test_accepts_properties_required_additional(self):
    schema = {
      "type": "object",
      "properties": {"a": {"type": "string"}},
      "required": ["a"],
      "additionalProperties": False,
    }
    assert validate_tool_schema(schema, "input").ok
    assert is_valid_tool({"name": "n", "inputSchema": schema})


class TestAC24_29_OutputSchemaRootUnrestricted:
  """AC-24.29 — outputSchema unrestricted root; structuredContent any JSON. (R-16.4-e/-v)"""

  def test_accepts_array_root(self):
    arr = {"type": "array", "items": {"type": "string"}}
    assert validate_tool_schema(arr, "output").ok
    assert is_valid_tool(
      {"name": "list_active_sessions", "inputSchema": {"type": "object", "additionalProperties": False}, "outputSchema": arr}
    )

  def test_accepts_scalar_boolean_null_roots(self):
    for t in ("string", "number", "boolean", "null"):
      assert validate_tool_schema({"type": t}, "output").ok


class TestAC24_30_InDocumentOnlyRef:
  """AC-24.30 — external $ref not fetched; only in-document resolved. (R-16.4-f/-g)"""

  def test_classifies_in_document_vs_external(self):
    assert is_in_document_ref("#")
    assert is_in_document_ref("#/$defs/Foo")
    assert is_in_document_ref("#anchor")
    assert not is_in_document_ref("https://evil.example/schema.json")
    assert not is_in_document_ref("./other.json#/Foo")
    assert not is_in_document_ref("other.json")

  def test_detects_external_ref_without_io(self):
    assert not has_external_ref({"type": "object", "properties": {"a": {"$ref": "#/$defs/A"}}})
    assert has_external_ref({"type": "object", "properties": {"a": {"$ref": "https://evil/x"}}})
    assert has_external_ref({"type": "object", "$dynamicRef": "https://evil/x"})

  def test_validation_rejects_external_ref_by_default(self):
    schema = {"type": "object", "properties": {"a": {"$ref": "https://evil.example/x.json"}}}
    res = validate_tool_schema(schema, "input")
    assert not res.ok
    assert "external $ref" in res.reason

  def test_validation_accepts_in_document_ref(self):
    schema = {"type": "object", "properties": {"a": {"$ref": "#/$defs/A"}}, "$defs": {"A": {"type": "string"}}}
    assert validate_tool_schema(schema, "input").ok


class TestAC24_31_OptInExternalFetchDefaultsOff:
  """AC-24.31 — opt-in external fetch is disabled by default. (R-16.4-h/-i)"""

  def test_external_fetch_off_by_default(self):
    schema = {"type": "object", "properties": {"a": {"$ref": "https://h/x.json"}}}
    assert not validate_tool_schema(schema, "input").ok

  def test_only_relaxed_by_explicit_opt_in(self):
    schema = {"type": "object", "properties": {"a": {"$ref": "https://h/x.json"}}}
    assert validate_tool_schema(schema, "input", allow_external_refs=True).ok


class TestAC24_32_RejectOnUnresolvedExternalRef:
  """AC-24.32 — unresolved external $ref ⇒ reject, not permissive. (R-16.4-k)"""

  def test_rejects_not_permissive(self):
    schema = {"type": "object", "properties": {"a": {"$ref": "https://h/x.json"}}}
    assert not validate_tool_schema(schema, "input").ok
    with pytest.raises(TypeError):
      assert_registrable_tool_schema(schema, "input")


class TestAC24_33_BoundedDepthSize:
  """AC-24.33 — bounded depth & node count. (R-16.4-l/-m)"""

  def test_exposes_default_limits(self):
    assert DEFAULT_SCHEMA_LIMITS.max_depth > 0
    assert DEFAULT_SCHEMA_LIMITS.max_nodes > 0

  def test_measures_depth_and_caps_recursion(self):
    assert schema_nesting_depth({"type": "object"}) == 1
    deep = {"type": "object"}
    for _ in range(5):
      deep = {"type": "object", "properties": {"x": deep}}
    assert schema_nesting_depth(deep) > 1
    very_deep = {"type": "object"}
    for _ in range(DEFAULT_SCHEMA_LIMITS.max_depth + 10):
      very_deep = {"type": "object", "properties": {"x": very_deep}}
    assert not validate_tool_schema(very_deep, "input").ok

  def test_rejects_node_count_over_limit(self):
    props = {f"p{i}": {"type": "string"} for i in range(5)}
    assert not validate_tool_schema(
      {"type": "object", "properties": props}, "input", limits=SchemaLimits(max_depth=64, max_nodes=2)
    ).ok


class TestAC24_34_RejectUnsafeSchemas:
  """AC-24.34 — reject/refuse unsafe schemas (incl. null). (R-16.4-n)"""

  def test_rejects_null_schema(self):
    assert not validate_tool_schema(None, "input").ok
    with pytest.raises(TypeError):
      assert_registrable_tool_schema(None, "input")

  def test_rejects_non_object_schema(self):
    assert not validate_tool_schema([], "input").ok
    assert not validate_tool_schema(42, "input").ok

  def test_refuses_external_dereferencing_registration(self):
    schema = {"type": "object", "$ref": "https://h/x.json"}
    with pytest.raises(TypeError):
      assert_registrable_tool_schema(schema, "input")


class TestAC24_35_ValidationRoles:
  """AC-24.35 — validation roles (input args, output structuredContent). (R-16.4-o/-p)"""

  def test_input_schema_validatable(self):
    assert validate_tool_schema(FULL_TOOL["inputSchema"], "input").ok

  def test_output_schema_validatable(self):
    assert validate_tool_schema(FULL_TOOL["outputSchema"], "output").ok

  def test_input_root_not_object_rejected(self):
    assert not validate_tool_schema({"type": "array"}, "input").ok


class TestAC24_36_ClientOutputValidationRules:
  """AC-24.36 — client output validation uses same in-document $ref rules. (R-16.4-q/-r)"""

  def test_same_in_document_gate_for_output(self):
    external = {"type": "object", "properties": {"a": {"$ref": "https://h/x.json"}}}
    assert not validate_tool_schema(external, "output").ok
    local = {"type": "object", "properties": {"a": {"$ref": "#/$defs/A"}}, "$defs": {"A": {"type": "number"}}}
    assert validate_tool_schema(local, "output").ok


class TestAC24_37_DialectValidationUnsupportedHandling:
  """AC-24.37 — dialect support & graceful failure on unsupported dialect. (R-16.4-s/-t)"""

  def test_validates_supported_default(self):
    assert is_supported_schema_dialect(DEFAULT_SCHEMA_DIALECT)
    assert validate_tool_schema({"type": "object"}, "input").ok

  def test_returns_unsupported_dialect_error_not_permissive(self):
    unsupported = {"$schema": "http://json-schema.org/draft-07/schema#", "type": "object"}
    assert not is_supported_schema_dialect("http://json-schema.org/draft-07/schema#")
    res = validate_tool_schema(unsupported, "input")
    assert not res.ok
    assert "unsupported dialect" in res.reason
    with pytest.raises(UnsupportedDialectError):
      assert_registrable_tool_schema(unsupported, "input")


class TestAC24_38_DocumentedSupportedDialects:
  """AC-24.38 — supported dialect set is documented. (R-16.4-u)"""

  def test_exposes_supported_set(self):
    assert DEFAULT_SCHEMA_DIALECT in SUPPORTED_SCHEMA_DIALECTS
    assert len(SUPPORTED_SCHEMA_DIALECTS) >= 1


class TestAC24_39_HumanCanDeny:
  """AC-24.39 — human-in-the-loop (capability gating allows denial). (R-16-a)"""

  def test_capability_layer_is_the_deny_gate(self):
    assert may_client_send_tools_request(CAPS_WITHOUT_TOOLS, TOOLS_CALL_METHOD) is False
    assert may_server_answer_tools_list(CAPS_WITHOUT_TOOLS, TOOLS_CALL_METHOD) is False


class TestToolsCapabilitySchema:
  """Capability schema sanity — mirror of ``ToolsCapabilitySchema`` describe block."""

  def test_accepts_empty_and_boolean_flag_rejects_non_boolean(self):
    assert is_valid_tools_capability({})
    assert is_valid_tools_capability({"listChanged": True})
    assert is_valid_tools_capability({"listChanged": False})
    assert not is_valid_tools_capability({"listChanged": "yes"})
    assert not is_valid_tools_capability(None)


# ─── Mirror of tools-value-validation.test.ts (RQ-21 / RQ-22) ─────────────────

STRING_LOCATION_SCHEMA = {
  "type": "object",
  "properties": {"location": {"type": "string"}},
  "required": ["location"],
  "additionalProperties": False,
}


class TestValidateToolArgumentsAgainstInputSchema:
  """validateToolArguments — arguments validated against inputSchema. (RQ-21 · R-16.4-o)"""

  TOOL = {"inputSchema": STRING_LOCATION_SCHEMA}

  def test_rejects_wrong_type(self):
    result = validate_tool_arguments(self.TOOL, {"location": 42})
    assert not result.valid
    assert any("string" in e.lower() for e in result.errors)

  def test_accepts_valid(self):
    res = validate_tool_arguments(self.TOOL, {"location": "New York"})
    assert res.valid and res.errors == []

  def test_rejects_missing_required(self):
    assert not validate_tool_arguments(self.TOOL, {}).valid

  def test_rejects_additional_property(self):
    assert not validate_tool_arguments(self.TOOL, {"location": "NYC", "extra": 1}).valid

  def test_validates_against_default_dialect(self):
    assert validate_tool_arguments({"inputSchema": {"type": "object"}}, {}).valid


class TestValidateToolStructuredContentAgainstOutputSchema:
  """validateToolStructuredContent — validated against outputSchema. (RQ-22 · R-16.4-p)"""

  OUTPUT_SCHEMA = {"type": "object", "properties": {"rows": {"type": "integer"}}, "required": ["rows"]}

  def test_valid_when_no_output_schema(self):
    res = validate_tool_structured_content({"inputSchema": {}}, {"anything": True})
    assert res.valid and res.errors == []

  def test_accepts_conforming(self):
    assert validate_tool_structured_content({"inputSchema": {}, "outputSchema": self.OUTPUT_SCHEMA}, {"rows": 3}).valid

  def test_rejects_non_conforming(self):
    assert not validate_tool_structured_content({"inputSchema": {}, "outputSchema": self.OUTPUT_SCHEMA}, {"rows": "three"}).valid


class TestValidateValueAgainstSchemaRefusals:
  """validateValueAgainstSchema — refusals (never raises)."""

  def test_refuses_non_object_schema(self):
    assert not validate_value_against_schema(None, {}).valid
    assert not validate_value_against_schema("nope", {}).valid

  def test_refuses_unsupported_dialect(self):
    res = validate_value_against_schema({"$schema": "https://json-schema.org/draft-04/schema#", "type": "string"}, 42)
    assert not res.valid
    assert any("dialect" in e.lower() for e in res.errors)

  def test_tolerates_x_mcp_header_keyword(self):
    schema = {
      "type": "object",
      "properties": {"region": {"type": "string", "x-mcp-header": "Region"}},
      "required": ["region"],
    }
    assert validate_value_against_schema(schema, {"region": "us-west1"}).valid
    assert not validate_value_against_schema(schema, {"region": 9}).valid

  def test_resolves_in_document_ref_during_value_validation(self):
    schema = {"type": "object", "properties": {"a": {"$ref": "#/$defs/A"}}, "$defs": {"A": {"type": "string"}}}
    assert validate_value_against_schema(schema, {"a": "x"}).valid
    assert not validate_value_against_schema(schema, {"a": 5}).valid


class TestListResultTypeFixedComplete:
  """list results fix resultType to "complete". (RQ-12 · R-16.2-m)"""

  def test_accepts_complete_rejects_others(self):
    base = {"tools": [], "ttlMs": 0, "cacheScope": "public"}
    assert is_valid_list_tools_result({"resultType": "complete", **base})
    assert not is_valid_list_tools_result({"resultType": "input_required", **base})
    assert not is_valid_list_tools_result({"resultType": "partial", **base})
