"""Tests for ``Mcp-Param-*`` header construction & validation (§9.5.1–§9.5.4).

Covers every export of :mod:`mcp.transport.http.param_headers`: the local header
primitives (``get_header``/``is_param_header``/``build_header_mismatch``), annotation
collection at every nesting depth, ``x-mcp-header`` name validity, per-tool validation,
``filter_valid_tools`` (invalid tools excluded while valid ones are kept), header-name
derivation, ``build_param_headers`` emission, and receiver-side ``validate_param_headers``.
"""

import pytest

from mcp.protocol.errors import HEADER_MISMATCH_CODE
from mcp.transport.http.param_encoding import encode_header_value
from mcp.transport.http.param_headers import (
  MCP_PARAM_HEADER_PREFIX,
  STALE_SCHEMA_STRATEGY,
  AnnotatedParam,
  FilterToolsResult,
  HttpRejection,
  RejectedTool,
  build_header_mismatch,
  build_param_headers,
  collect_x_mcp_headers,
  filter_valid_tools,
  get_header,
  is_annotated_integer_in_range,
  is_param_header,
  param_header_name,
  validate_param_headers,
  validate_tool_x_mcp_headers,
  validate_x_mcp_header_name,
)


def _prop(name, type_, **extra):
  """Build a single annotated property subschema."""
  return {"type": type_, "x-mcp-header": name, **extra}


def _schema(properties):
  """Build an object inputSchema from a properties dict."""
  return {"type": "object", "properties": properties}


# ─── Header primitives ──────────────────────────────────────────────────────────


class TestHeaderPrimitives:
  def test_get_header_case_insensitive(self):
    headers = {"Mcp-Param-Region": "us"}
    assert get_header(headers, "mcp-param-region") == "us"
    assert get_header(headers, "MCP-PARAM-REGION") == "us"

  def test_get_header_absent(self):
    assert get_header({}, "Mcp-Param-Region") is None

  def test_is_param_header(self):
    assert is_param_header("Mcp-Param-Region")
    assert is_param_header("mcp-param-anything")
    assert not is_param_header("Mcp-Method")
    assert not is_param_header("Content-Type")

  def test_build_header_mismatch_shape(self):
    rejection = build_header_mismatch("nope")
    assert isinstance(rejection, HttpRejection)
    assert rejection.status == 400
    assert rejection.error == {"code": HEADER_MISMATCH_CODE, "message": "nope"}

  def test_build_header_mismatch_default_message(self):
    assert build_header_mismatch().error["message"]


# ─── Annotation collection (§9.5.1-h) ───────────────────────────────────────────


class TestCollectXMcpHeaders:
  def test_empty_for_absent_schema(self):
    assert collect_x_mcp_headers(None) == []
    assert collect_x_mcp_headers({}) == []
    assert collect_x_mcp_headers("not-an-object") == []

  def test_top_level_property(self):
    schema = _schema({"region": _prop("Region", "string")})
    anns = collect_x_mcp_headers(schema)
    assert len(anns) == 1
    assert anns[0].raw_name == "Region"
    assert anns[0].type == "string"
    assert anns[0].path == ["region"]
    assert anns[0].under_array is False

  def test_nested_object_property(self):
    schema = _schema(
      {"location": {"type": "object", "properties": {"region": _prop("Region", "string")}}}
    )
    anns = collect_x_mcp_headers(schema)
    assert len(anns) == 1
    assert anns[0].path == ["location", "region"]

  def test_annotation_under_array_items_is_flagged(self):
    schema = _schema(
      {"tags": {"type": "array", "items": _prop("Tag", "string")}}
    )
    anns = collect_x_mcp_headers(schema)
    assert len(anns) == 1
    assert anns[0].under_array is True

  def test_type_absent_is_none(self):
    schema = _schema({"region": {"x-mcp-header": "Region"}})
    anns = collect_x_mcp_headers(schema)
    assert anns[0].type is None

  def test_non_string_type_is_none(self):
    schema = _schema({"region": {"type": 123, "x-mcp-header": "Region"}})
    anns = collect_x_mcp_headers(schema)
    assert anns[0].type is None

  def test_returns_annotated_param_instances(self):
    schema = _schema({"region": _prop("Region", "string")})
    assert isinstance(collect_x_mcp_headers(schema)[0], AnnotatedParam)


# ─── Name validity (§9.5.1-a/b/c) ───────────────────────────────────────────────


class TestValidateXMcpHeaderName:
  def test_valid_token(self):
    assert validate_x_mcp_header_name("Region").valid
    assert validate_x_mcp_header_name("X-Custom_Header.1").valid

  def test_empty_rejected(self):
    result = validate_x_mcp_header_name("")
    assert not result.valid
    assert "non-empty" in result.reason

  def test_non_string_rejected(self):
    assert not validate_x_mcp_header_name(42).valid
    assert not validate_x_mcp_header_name(None).valid

  def test_whitespace_rejected(self):
    assert not validate_x_mcp_header_name("has space").valid

  def test_control_chars_rejected(self):
    assert not validate_x_mcp_header_name("bad\r\nname").valid
    assert not validate_x_mcp_header_name("bad\tname").valid

  def test_colon_rejected(self):
    # ':' is not a tchar.
    assert not validate_x_mcp_header_name("Region:1").valid


# ─── Tool validity (§9.5.1) ─────────────────────────────────────────────────────


class TestValidateToolXMcpHeaders:
  def test_valid_tool(self):
    tool = {"name": "t", "inputSchema": _schema({"region": _prop("Region", "string")})}
    assert validate_tool_x_mcp_headers(tool).valid

  def test_tool_without_schema_is_valid(self):
    assert validate_tool_x_mcp_headers({"name": "t"}).valid

  def test_tool_without_annotations_is_valid(self):
    tool = {"name": "t", "inputSchema": _schema({"region": {"type": "string"}})}
    assert validate_tool_x_mcp_headers(tool).valid

  def test_all_annotatable_types(self):
    schema = _schema(
      {
        "s": _prop("S", "string"),
        "i": _prop("I", "integer"),
        "b": _prop("B", "boolean"),
      }
    )
    assert validate_tool_x_mcp_headers({"name": "t", "inputSchema": schema}).valid

  def test_number_type_rejected(self):
    # R-9.5.1-f: 'number' is not an annotatable type.
    tool = {"name": "t", "inputSchema": _schema({"x": _prop("X", "number")})}
    result = validate_tool_x_mcp_headers(tool)
    assert not result.valid
    assert "number" in result.reason

  def test_object_type_rejected(self):
    tool = {"name": "t", "inputSchema": _schema({"x": _prop("X", "object")})}
    assert not validate_tool_x_mcp_headers(tool).valid

  def test_missing_type_rejected(self):
    tool = {"name": "t", "inputSchema": _schema({"x": {"x-mcp-header": "X"}})}
    result = validate_tool_x_mcp_headers(tool)
    assert not result.valid
    assert "unknown" in result.reason

  def test_invalid_name_rejected(self):
    tool = {"name": "t", "inputSchema": _schema({"x": _prop("bad name", "string")})}
    assert not validate_tool_x_mcp_headers(tool).valid

  def test_empty_name_rejected(self):
    tool = {"name": "t", "inputSchema": _schema({"x": _prop("", "string")})}
    assert not validate_tool_x_mcp_headers(tool).valid

  def test_duplicate_name_case_insensitive_rejected(self):
    # R-9.5.1-d: names are unique case-insensitively.
    schema = _schema({"a": _prop("Region", "string"), "b": _prop("region", "string")})
    result = validate_tool_x_mcp_headers({"name": "t", "inputSchema": schema})
    assert not result.valid
    assert "duplicate" in result.reason

  def test_nested_annotation_validated(self):
    # R-9.5.1-h: annotations at any depth are validated.
    schema = _schema(
      {"loc": {"type": "object", "properties": {"x": _prop("bad name", "string")}}}
    )
    assert not validate_tool_x_mcp_headers({"name": "t", "inputSchema": schema}).valid


# ─── filter_valid_tools (§9.5.1-i/j/k) ──────────────────────────────────────────


class TestFilterValidTools:
  def test_keeps_valid_excludes_invalid(self):
    good = {"name": "good", "inputSchema": _schema({"region": _prop("Region", "string")})}
    bad = {"name": "bad", "inputSchema": _schema({"x": _prop("X", "number")})}
    result = filter_valid_tools([good, bad])
    assert isinstance(result, FilterToolsResult)
    assert result.tools == [good]
    assert len(result.warnings) == 1
    assert isinstance(result.warnings[0], RejectedTool)
    assert result.warnings[0].tool == "bad"
    assert result.warnings[0].reason

  def test_all_valid_no_warnings(self):
    tools = [
      {"name": "a", "inputSchema": _schema({"r": _prop("R", "string")})},
      {"name": "b"},
    ]
    result = filter_valid_tools(tools)
    assert result.tools == tools
    assert result.warnings == []

  def test_empty_list(self):
    result = filter_valid_tools([])
    assert result.tools == []
    assert result.warnings == []

  def test_only_offending_tool_removed(self):
    # An otherwise-usable tool with one bad annotation is excluded; siblings stay.
    tools = [
      {"name": "ok1"},
      {"name": "broken", "inputSchema": _schema({"x": _prop("dup", "string"), "y": _prop("DUP", "integer")})},
      {"name": "ok2", "inputSchema": _schema({"r": _prop("R", "string")})},
    ]
    result = filter_valid_tools(tools)
    assert [t["name"] for t in result.tools] == ["ok1", "ok2"]
    assert [w.tool for w in result.warnings] == ["broken"]


# ─── Header-name derivation ─────────────────────────────────────────────────────


class TestParamHeaderName:
  def test_prefix_applied(self):
    assert param_header_name("Region") == "Mcp-Param-Region"
    assert param_header_name("Region").startswith(MCP_PARAM_HEADER_PREFIX)


# ─── build_param_headers (§9.5.2) ───────────────────────────────────────────────


class TestBuildParamHeaders:
  def test_absent_schema_yields_empty(self):
    assert build_param_headers(None, {"region": "us"}) == {}

  def test_emits_header_for_present_value(self):
    schema = _schema({"region": _prop("Region", "string")})
    assert build_param_headers(schema, {"region": "us-east"}) == {"Mcp-Param-Region": "us-east"}

  def test_integer_and_boolean_encoded(self):
    schema = _schema({"n": _prop("N", "integer"), "b": _prop("B", "boolean")})
    headers = build_param_headers(schema, {"n": 42, "b": False})
    assert headers == {"Mcp-Param-N": "42", "Mcp-Param-B": "false"}

  def test_absent_argument_omitted(self):
    schema = _schema({"region": _prop("Region", "string")})
    assert build_param_headers(schema, {}) == {}

  def test_null_argument_omitted(self):
    # R-9.5.2-g/-i: a null/None value is omitted.
    schema = _schema({"region": _prop("Region", "string")})
    assert build_param_headers(schema, {"region": None}) == {}

  def test_annotation_under_array_skipped(self):
    schema = _schema({"tags": {"type": "array", "items": _prop("Tag", "string")}})
    assert build_param_headers(schema, {"tags": ["a", "b"]}) == {}

  def test_nested_value_resolved(self):
    schema = _schema(
      {"loc": {"type": "object", "properties": {"region": _prop("Region", "string")}}}
    )
    assert build_param_headers(schema, {"loc": {"region": "eu"}}) == {"Mcp-Param-Region": "eu"}

  def test_special_chars_sentinel_encoded(self):
    schema = _schema({"region": _prop("Region", "string")})
    headers = build_param_headers(schema, {"region": "héllo"})
    assert headers["Mcp-Param-Region"] == encode_header_value("héllo")

  def test_invalid_annotation_name_skipped(self):
    schema = _schema({"region": _prop("bad name", "string")})
    assert build_param_headers(schema, {"region": "us"}) == {}

  def test_non_primitive_value_skipped(self):
    schema = _schema({"region": _prop("Region", "string")})
    assert build_param_headers(schema, {"region": {"nested": 1}}) == {}

  def test_out_of_range_integer_raises(self):
    schema = _schema({"n": _prop("N", "integer")})
    with pytest.raises(ValueError):
      build_param_headers(schema, {"n": 2 ** 53})


# ─── validate_param_headers (§9.5.4) ────────────────────────────────────────────


class TestValidateParamHeaders:
  schema = _schema({"region": _prop("Region", "string"), "count": _prop("Count", "integer")})

  def test_matching_headers_ok(self):
    args = {"region": "us", "count": 3}
    headers = build_param_headers(self.schema, args)
    assert validate_param_headers(self.schema, args, headers).ok

  def test_no_annotations_ok(self):
    assert validate_param_headers(None, {}, {}).ok

  def test_value_mismatch_rejected(self):
    args = {"region": "us"}
    result = validate_param_headers(self.schema, args, {"Mcp-Param-Region": "eu"})
    assert not result.ok
    assert result.rejection.error["code"] == HEADER_MISMATCH_CODE

  def test_integer_numeric_match(self):
    # R-9.5.4-d: integers compared numerically; "03" matches 3.
    args = {"count": 3}
    assert validate_param_headers(self.schema, args, {"Mcp-Param-Count": "03"}).ok

  def test_integer_numeric_mismatch(self):
    args = {"count": 3}
    assert not validate_param_headers(self.schema, args, {"Mcp-Param-Count": "4"}).ok

  def test_body_present_header_omitted_rejected(self):
    # R-9.5.2-k: body value present requires the header.
    args = {"region": "us"}
    result = validate_param_headers(self.schema, args, {})
    assert not result.ok
    assert "omitted" in result.rejection.error["message"]

  def test_header_present_body_absent_rejected(self):
    result = validate_param_headers(self.schema, {}, {"Mcp-Param-Region": "us"})
    assert not result.ok
    assert "no matching body value" in result.rejection.error["message"]

  def test_header_present_body_null_rejected(self):
    result = validate_param_headers(self.schema, {"region": None}, {"Mcp-Param-Region": "us"})
    assert not result.ok

  def test_impermissible_chars_rejected(self):
    # A raw control char in a non-sentinel header value is impermissible (R-9.5.4-b).
    args = {"region": "us"}
    result = validate_param_headers(self.schema, args, {"Mcp-Param-Region": "u\ns"})
    assert not result.ok
    assert "impermissible" in result.rejection.error["message"]

  def test_sentinel_encoded_value_validated(self):
    args = {"region": "héllo"}
    headers = {"Mcp-Param-Region": encode_header_value("héllo")}
    assert validate_param_headers(self.schema, args, headers).ok

  def test_case_insensitive_header_lookup(self):
    args = {"region": "us"}
    assert validate_param_headers(self.schema, args, {"mcp-param-region": "us"}).ok

  def test_annotation_under_array_ignored(self):
    schema = _schema({"tags": {"type": "array", "items": _prop("Tag", "string")}})
    # No per-item header is expected; validation passes regardless of body.
    assert validate_param_headers(schema, {"tags": ["a"]}, {}).ok

  def test_non_primitive_body_value_skipped(self):
    # A body value that is not a primitive is outside the contract → not compared.
    args = {"region": {"nested": 1}}
    assert validate_param_headers(self.schema, args, {"Mcp-Param-Region": "anything"}).ok


# ─── Re-exports & strategy table ────────────────────────────────────────────────


class TestReExports:
  def test_is_annotated_integer_in_range_reexported(self):
    assert is_annotated_integer_in_range(5)
    assert not is_annotated_integer_in_range(True)

  def test_stale_schema_strategy_codes(self):
    assert STALE_SCHEMA_STRATEGY == {
      "SEND_WITHOUT_HEADERS": "R-9.5.2-l",
      "RETRY_AFTER_TOOLS_LIST": "R-9.5.2-m",
      "MAY_PRELOAD": "R-9.5.2-n",
    }
