"""Tests for Tools I — capability, JSON-Schema rules, value validation, Tool, tools/list (§16)."""

import pytest

from mcp.protocol.tools import (
  DEFAULT_SCHEMA_DIALECT,
  ListToolsResultConfig,
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
  is_valid_list_tools_result,
  is_valid_tool,
  may_client_expect_tools_list_changed,
  may_client_send_tools_request,
  may_server_answer_tools_list,
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
