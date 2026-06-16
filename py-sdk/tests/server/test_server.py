"""Tests for the McpServer dispatcher + feature methods (§5–§19)."""

import pytest

from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  METHOD_NOT_FOUND_CODE,
)
from mcp.protocol.discovery import is_discover_result
from mcp.server.server import McpServer, ServerError, ServerRequestContext

INFO = {"name": "srv", "version": "1.0"}
CAPS = {"tools": {}, "resources": {}, "prompts": {}, "completions": {}}


def ctx() -> ServerRequestContext:
  return ServerRequestContext(protocol_version="2026-07-28", request_id=1, meta={})


def server(**kw) -> McpServer:
  return McpServer(INFO, CAPS, **kw)


class TestBuiltins:
  def test_ping(self):
    assert server().dispatch("ping", {}, ctx()) == {}

  def test_discover(self):
    result = server().dispatch("server/discover", {}, ctx())
    assert is_discover_result(result)
    assert result["serverInfo"] == INFO
    assert result["supportedVersions"] == ["2026-07-28"]

  def test_logging_set_level(self):
    s = server()
    assert s.dispatch("logging/setLevel", {"level": "debug"}, ctx()) == {}
    assert s.min_log_level == "debug"

  def test_unknown_method(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("bogus/method", {}, ctx())
    assert exc.value.code == METHOD_NOT_FOUND_CODE


class TestCapabilityGating:
  def test_unadvertised_capability_is_method_not_found(self):
    s = McpServer(INFO, {})  # no capabilities advertised
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/list", {}, ctx())
    assert exc.value.code == METHOD_NOT_FOUND_CODE


class TestTools:
  def test_list_tools_shape_and_cache_hints(self):
    s = server()
    s.register_tool("echo", lambda args, c: {"content": [args]}, description="Echo")
    result = s.dispatch("tools/list", {}, ctx())
    assert result["resultType"] == "complete"
    assert result["ttlMs"] == 0 and result["cacheScope"] == "private"
    assert result["tools"][0]["name"] == "echo"
    assert result["tools"][0]["inputSchema"] == {"type": "object"}

  def test_call_unknown_tool(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("tools/call", {"name": "nope"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_call_tool_complete(self):
    s = server()
    s.register_tool("echo", lambda args, c: {"content": [{"type": "text", "text": str(args)}]})
    result = s.dispatch("tools/call", {"name": "echo", "arguments": {"a": 1}}, ctx())
    assert result["resultType"] == "complete"
    assert result["content"][0]["text"] == "{'a': 1}"

  def test_input_schema_validation_failure(self):
    def validator(schema, value):
      return ("x" in value, [] if "x" in value else ["missing x"])

    s = server(value_validator=validator)
    s.register_tool("t", lambda a, c: {}, input_schema={"type": "object"})
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/call", {"name": "t", "arguments": {"y": 1}}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_output_schema_violation_is_internal_error(self):
    s = server(value_validator=lambda schema, value: (False, ["bad"]))
    s.register_tool("t", lambda a, c: {"structuredContent": {"z": 1}}, output_schema={"type": "object"})
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert exc.value.code == INTERNAL_ERROR_CODE

  def test_apply_defaults(self):
    s = server()
    seen = {}
    s.register_tool(
      "t",
      lambda args, c: seen.update(args) or {"content": []},
      input_schema={"type": "object", "properties": {"n": {"default": 5}}},
    )
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert seen["n"] == 5

  def test_task_handle_passthrough(self):
    s = server()
    s.register_tool("t", lambda a, c: {"task": {"taskId": "t1", "status": "working"}})
    result = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert result == {"resultType": "task", "taskId": "t1", "status": "working"}


class TestResources:
  def test_read_direct(self):
    s = server()
    s.register_resource("doc", "file:///doc", lambda uri: {"contents": [{"uri": uri, "text": "hi"}]})
    result = s.dispatch("resources/read", {"uri": "file:///doc"}, ctx())
    assert result["contents"][0]["text"] == "hi"

  def test_read_template(self):
    s = server()
    s.register_resource_template("item", "item://{id}", lambda uri, vars: {"contents": [{"uri": uri, "id": vars["id"]}]})
    result = s.dispatch("resources/read", {"uri": "item://42"}, ctx())
    assert result["contents"][0]["id"] == "42"

  def test_read_not_found(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("resources/read", {"uri": "file:///missing"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE
    assert exc.value.data == {"uri": "file:///missing"}

  def test_empty_contents_is_internal_error(self):
    s = server()
    s.register_resource("e", "file:///e", lambda uri: {"contents": []})
    with pytest.raises(ServerError) as exc:
      s.dispatch("resources/read", {"uri": "file:///e"}, ctx())
    assert exc.value.code == INTERNAL_ERROR_CODE


class TestPrompts:
  def test_get_prompt(self):
    s = server()
    s.register_prompt("greet", lambda args: {"messages": [{"role": "user", "content": args.get("name", "")}]})
    result = s.dispatch("prompts/get", {"name": "greet", "arguments": {"name": "Ada"}}, ctx())
    assert result["resultType"] == "complete"
    assert result["messages"][0]["content"] == "Ada"

  def test_missing_required_argument(self):
    s = server()
    s.register_prompt("greet", lambda args: {"messages": []}, arguments=[{"name": "name", "required": True}])
    with pytest.raises(ServerError) as exc:
      s.dispatch("prompts/get", {"name": "greet", "arguments": {}}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE


class TestCompletion:
  def test_prompt_completion(self):
    s = server()
    s.register_prompt(
      "greet",
      lambda a: {"messages": []},
      arguments=[{"name": "name", "complete": lambda v: ["Ada", "Alan"]}],
    )
    result = s.dispatch(
      "completion/complete",
      {"ref": {"type": "ref/prompt", "name": "greet"}, "argument": {"name": "name", "value": "A"}},
      ctx(),
    )
    assert result["completion"]["values"] == ["Ada", "Alan"]
    assert result["completion"]["total"] == 2

  def test_invalid_ref_type(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("completion/complete", {"ref": {"type": "bogus"}, "argument": {}}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE


class TestPagination:
  def test_pages_and_next_cursor(self):
    s = server(page_size=2)
    for i in range(5):
      s.register_tool(f"t{i}", lambda a, c: {})
    page1 = s.dispatch("tools/list", {}, ctx())
    assert len(page1["tools"]) == 2 and "nextCursor" in page1
    page2 = s.dispatch("tools/list", {"cursor": page1["nextCursor"]}, ctx())
    assert len(page2["tools"]) == 2

  def test_invalid_cursor(self):
    s = server(page_size=2)
    s.register_tool("t", lambda a, c: {})
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/list", {"cursor": "@@notbase64@@"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE
