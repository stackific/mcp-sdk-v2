"""Tests for the McpServer dispatcher + feature methods (§5–§19).

Mirrors the TS SDK server-runtime suites (``server-runtime.test.ts``,
``wire-conformance.test.ts``, ``tasks-and-pagination.test.ts``) at the dispatcher level.
"""

import pytest

from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  METHOD_NOT_FOUND_CODE,
)
from mcp.protocol.discovery import is_discover_result
from mcp.protocol.tasks import TASK_MISSING_CAPABILITY_CODE
from mcp.server.server import McpServer, ServerError, ServerRequestContext
from mcp.server.tasks import InMemoryTaskStore

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

  def test_pages_walk_to_end_then_omit_cursor(self):
    # 12 tools, page size 5 → 5, 5, 2 with no trailing nextCursor (mirrors TS S1).
    s = server(page_size=5)
    for i in range(12):
      s.register_tool(f"t{i}", lambda a, c: {})
    p1 = s.dispatch("tools/list", {}, ctx())
    assert len(p1["tools"]) == 5 and isinstance(p1["nextCursor"], str)
    p2 = s.dispatch("tools/list", {"cursor": p1["nextCursor"]}, ctx())
    assert len(p2["tools"]) == 5
    p3 = s.dispatch("tools/list", {"cursor": p2["nextCursor"]}, ctx())
    assert len(p3["tools"]) == 2 and "nextCursor" not in p3

  def test_single_page_omits_cursor(self):
    s = server(page_size=50)
    for i in range(3):
      s.register_tool(f"t{i}", lambda a, c: {})
    r = s.dispatch("tools/list", {}, ctx())
    assert len(r["tools"]) == 3 and "nextCursor" not in r


class TestCachingHints:
  def test_non_caching_server_still_emits_defaults(self):
    # ttlMs:0 / private is the REQUIRED default even on a non-caching server (R-13.4-b).
    s = server()
    s.register_tool("t", lambda a, c: {"content": []})
    r = s.dispatch("tools/list", {}, ctx())
    assert r["ttlMs"] == 0 and r["cacheScope"] == "private"

  def test_options_override_cache_defaults(self):
    s = server(cache_ttl_ms=60000, cache_scope="public")
    s.register_resource("d", "file:///d", lambda uri: {"contents": [{"uri": uri, "text": "x"}]})
    r = s.dispatch("resources/list", {}, ctx())
    assert r["ttlMs"] == 60000 and r["cacheScope"] == "public"

  def test_tools_call_is_not_cacheable(self):
    # tools/call carries resultType but NO top-level cache hints (it isn't a cacheable method).
    s = server()
    s.register_tool("t", lambda a, c: {"content": []})
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert r["resultType"] == "complete"
    assert "ttlMs" not in r and "cacheScope" not in r


class TestInputRequiredRetry:
  """The §11 input_required + retry loop at the dispatcher level (mirrors TS C6)."""

  def _ask_server(self) -> McpServer:
    s = McpServer(INFO, {"tools": {}, "elicitation": {}})

    def ask(_args: dict, c) -> dict:
      r = c.elicit_input({"mode": "form", "message": "hi"})
      return {"content": [{"type": "text", "text": str(r["action"])}]}

    s.register_tool("ask", ask)
    return s

  def test_first_call_returns_input_required_with_request_state(self):
    s = self._ask_server()
    r1 = s.dispatch("tools/call", {"name": "ask", "arguments": {}}, ctx())
    assert r1["resultType"] == "input_required"
    reqs = r1["inputRequests"]
    key = next(iter(reqs))
    assert reqs[key]["method"] == "elicitation/create"
    assert reqs[key]["params"]["mode"] == "form"
    assert isinstance(r1["requestState"], str)

  def test_retry_with_supplied_input_completes(self):
    s = self._ask_server()
    r1 = s.dispatch("tools/call", {"name": "ask", "arguments": {}}, ctx())
    key = next(iter(r1["inputRequests"]))
    r2 = s.dispatch(
      "tools/call",
      {
        "name": "ask",
        "arguments": {},
        "inputResponses": {key: {"action": "accept"}},
        "requestState": r1["requestState"],
      },
      ctx(),
    )
    assert r2["resultType"] == "complete"
    assert r2["content"][0]["text"] == "accept"


class TestCompletionEdgeCases:
  """Unknown completion refs → -32602 (mirrors TS M3)."""

  def _server(self) -> McpServer:
    s = server()
    s.register_prompt(
      "greeting",
      lambda a: {"messages": []},
      arguments=[
        {"name": "name", "required": True},
        {"name": "language", "complete": lambda v: [x for x in ["english"] if x.startswith(v)]},
      ],
    )
    s.register_resource_template(
      "city",
      "weather://{city}",
      lambda uri, vars: {"contents": [{"uri": uri, "text": "{}"}]},
      complete={"city": lambda v: [x for x in ["oslo", "osaka"] if x.startswith(v)]},
    )
    return s

  def test_unknown_prompt_ref(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/prompt", "name": "nope"}, "argument": {"name": "language", "value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_unknown_prompt_argument(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/prompt", "name": "greeting"}, "argument": {"name": "xyz", "value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_unknown_resource_template_ref(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/resource", "uri": "nope://{x}"}, "argument": {"name": "x", "value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_resource_template_completion_succeeds(self):
    r = self._server().dispatch(
      "completion/complete",
      {"ref": {"type": "ref/resource", "uri": "weather://{city}"}, "argument": {"name": "city", "value": "os"}},
      ctx(),
    )
    assert r["completion"]["values"] == ["oslo", "osaka"]

  def test_completion_caps_at_100(self):
    s = server()
    s.register_prompt(
      "big",
      lambda a: {"messages": []},
      arguments=[{"name": "x", "complete": lambda v: [str(i) for i in range(250)]}],
    )
    r = s.dispatch(
      "completion/complete",
      {"ref": {"type": "ref/prompt", "name": "big"}, "argument": {"name": "x", "value": ""}},
      ctx(),
    )
    assert len(r["completion"]["values"]) == 100
    assert r["completion"]["total"] == 250
    assert r["completion"]["hasMore"] is True


class TestTasksDispatch:
  """Tasks-extension dispatch (mirrors TS C8 — §25.3 / §25.7 / §25.8)."""

  def _task_server(self):
    s = McpServer(INFO, {"tools": {}, "extensions": {"io.modelcontextprotocol/tasks": {}}})
    store = InMemoryTaskStore()
    s.set_task_store(store)

    def job(_args: dict, c) -> dict:
      task = store.create_task(ttl_ms=60000)
      store.store_result(task["taskId"], {"content": [{"type": "text", "text": "done"}]})
      return {"task": task}

    s.register_tool("job", job, execution={"taskSupport": "required"})
    return s, store

  def test_task_augmented_call_returns_create_task_result(self):
    s, _ = self._task_server()
    r = s.dispatch("tools/call", {"name": "job", "task": {"ttl": 60000}}, ctx())
    assert r["resultType"] == "task"
    assert isinstance(r["taskId"], str)
    assert "task" not in r  # flattened, not nested

  def test_tasks_get_returns_detailed_task_with_inline_result(self):
    s, _ = self._task_server()
    created = s.dispatch("tools/call", {"name": "job", "task": {"ttl": 60000}}, ctx())
    got = s.dispatch("tasks/get", {"taskId": created["taskId"]}, ctx())
    assert got["resultType"] == "complete"
    assert got["status"] == "completed"
    assert got["result"]["content"][0]["text"] == "done"

  def test_tasks_cancel_moves_to_cancelled(self):
    s, store = self._task_server()
    task = store.create_task(ttl_ms=None)
    got = s.dispatch("tasks/cancel", {"taskId": task["taskId"]}, ctx())
    assert got["status"] == "cancelled"

  def test_missing_task_store_is_minus_32003(self):
    s = McpServer(INFO, {"tools": {}})  # no task store
    with pytest.raises(ServerError) as exc:
      s.dispatch("tasks/get", {"taskId": "x"}, ctx())
    assert exc.value.code == TASK_MISSING_CAPABILITY_CODE

  def test_task_id_must_be_string(self):
    s, _ = self._task_server()
    with pytest.raises(ServerError) as exc:
      s.dispatch("tasks/get", {}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_non_spec_task_methods_are_method_not_found(self):
    s, _ = self._task_server()
    for method in ("tasks/result", "tasks/list"):
      with pytest.raises(ServerError) as exc:
        s.dispatch(method, {"taskId": "x"}, ctx())
      assert exc.value.code == METHOD_NOT_FOUND_CODE


class TestServerDiscover:
  def test_discover_supported_versions_and_info(self):
    r = server().dispatch("server/discover", {}, ctx())
    assert r["supportedVersions"] == ["2026-07-28"]
    assert r["serverInfo"]["name"] == "srv"


class TestToolContextNotifications:
  """ctx.notify / log / list-changed / resource-updated emit on the request stream."""

  def test_log_respects_min_level(self):
    sent = []
    s = server()
    s.dispatch("logging/setLevel", {"level": "warning"}, ctx())
    s.register_tool("t", lambda a, c: (c.log("debug", "below"), c.log("error", "above"), {"content": []})[2])
    c = ServerRequestContext(protocol_version="2026-07-28", request_id=1, meta={}, notify=sent.append)
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, c)
    levels = [m["params"]["level"] for m in sent if m["method"] == "notifications/message"]
    assert levels == ["error"]  # debug is below the warning threshold

  def test_list_changed_and_resource_updated_notify(self):
    sent = []
    s = server()

    def emitter(_a: dict, c) -> dict:
      c.send_tool_list_changed()
      c.send_resource_updated({"uri": "file:///x"})
      return {"content": []}

    s.register_tool("t", emitter)
    c = ServerRequestContext(protocol_version="2026-07-28", request_id=1, meta={}, notify=sent.append)
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, c)
    methods = [m["method"] for m in sent]
    assert "notifications/tools/list_changed" in methods
    assert "notifications/resources/updated" in methods
