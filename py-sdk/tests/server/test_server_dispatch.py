"""Exhaustive dispatcher-level tests for :class:`mcp.server.server.McpServer`.

Every case constructs an ``McpServer`` + a ``ServerRequestContext`` and calls
``server.dispatch(method, params, ctx)`` directly — purely synchronous, no I/O,
no transport. ``dispatch`` takes ``params`` + ``ctx`` straight, so the reserved
``_meta`` keys the transport validates are NOT required here; only the per-request
``ctx`` (``meta`` / ``notify`` / ``signal`` / ``notify_subscribers``) is supplied.

These complement ``test_server.py`` with broader, edge-focused coverage of every
dispatch branch: builtins, capability gating (§6.4), tools (list/call/MRTR/tasks),
resources, prompts, completion, the Tasks lifecycle (§25), pagination + cache
hints, and the ToolContext notification/logging surface.
"""

import base64
import json

import pytest

from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  METHOD_NOT_FOUND_CODE,
)
from mcp.protocol.meta import CURRENT_PROTOCOL_VERSION
from mcp.protocol.tasks import TASK_MISSING_CAPABILITY_CODE
from mcp.server.server import (
  CancelSignal,
  McpServer,
  ServerError,
  ServerRequestContext,
  ToolContext,
)
from mcp.server.tasks import InMemoryTaskStore

# ── fixtures / helpers ────────────────────────────────────────────────────────

INFO = {"name": "srv", "version": "1.2.3"}
#: Every feature capability advertised, so gating never short-circuits a feature test.
FULL_CAPS = {"tools": {}, "resources": {}, "prompts": {}, "completions": {}}


def ctx(meta: dict | None = None, **kw) -> ServerRequestContext:
  """A minimal per-request context (no reserved ``_meta`` keys — dispatch doesn't need them)."""
  return ServerRequestContext(
    protocol_version=CURRENT_PROTOCOL_VERSION, request_id=1, meta=meta or {}, **kw
  )


def server(caps: dict | None = None, **kw) -> McpServer:
  return McpServer(INFO, FULL_CAPS if caps is None else caps, **kw)


def _decode_state(token: str) -> dict:
  """Decode the (HMAC-signed, time-bounded) MRTR ``requestState`` token's accumulated state.

  The wire token is ``<base64(payload)>.<base64(hmac)>`` where ``payload`` wraps
  ``{"state": …, "exp": …}`` (§11.3, R-28.6-b/-c); this inspects the ``state`` half only, to
  assert what the server accumulated.
  """
  payload = token.split(".")[0]
  envelope = json.loads(base64.b64decode(payload.encode("ascii")).decode("utf-8"))
  return envelope["state"]


# ── initialize ────────────────────────────────────────────────────────────────


class TestInitialize:
  def test_echoes_requested_protocol_version(self):
    r = server().dispatch("initialize", {"protocolVersion": "1999-01-01"}, ctx())
    assert r["protocolVersion"] == "1999-01-01"

  def test_defaults_to_current_version_when_absent(self):
    r = server().dispatch("initialize", {}, ctx())
    assert r["protocolVersion"] == CURRENT_PROTOCOL_VERSION

  def test_defaults_when_protocol_version_is_non_string(self):
    r = server().dispatch("initialize", {"protocolVersion": 7}, ctx())
    assert r["protocolVersion"] == CURRENT_PROTOCOL_VERSION

  def test_returns_capabilities_and_server_info(self):
    s = server()
    r = s.dispatch("initialize", {"protocolVersion": CURRENT_PROTOCOL_VERSION}, ctx())
    assert r["capabilities"] is s.capabilities
    assert r["serverInfo"] == INFO

  def test_initialize_is_not_capability_gated(self):
    # A no-capability server still answers the back-compat handshake.
    r = McpServer(INFO, {}).dispatch("initialize", {}, ctx())
    assert r["serverInfo"] == INFO


# ── ping / logging ────────────────────────────────────────────────────────────


class TestBuiltins:
  def test_ping_returns_empty(self):
    assert server().dispatch("ping", {}, ctx()) == {}

  def test_ping_ignores_params(self):
    assert server().dispatch("ping", {"anything": True}, ctx()) == {}

  def test_set_level_sets_min_level(self):
    s = server()
    assert s.dispatch("logging/setLevel", {"level": "warning"}, ctx()) == {}
    assert s.min_log_level == "warning"

  def test_set_level_ignores_non_string_level(self):
    s = server()
    assert s.min_log_level == "info"  # default
    s.dispatch("logging/setLevel", {"level": 5}, ctx())
    assert s.min_log_level == "info"

  def test_set_level_missing_level_is_noop(self):
    s = server()
    s.dispatch("logging/setLevel", {}, ctx())
    assert s.min_log_level == "info"

  @pytest.mark.parametrize(
    "level", ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]
  )
  def test_set_level_accepts_every_severity(self, level):
    s = server()
    s.dispatch("logging/setLevel", {"level": level}, ctx())
    assert s.min_log_level == level

  def test_unknown_method_is_method_not_found(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("does/not/exist", {}, ctx())
    assert exc.value.code == METHOD_NOT_FOUND_CODE

  def test_empty_method_name_is_method_not_found(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("", {}, ctx())
    assert exc.value.code == METHOD_NOT_FOUND_CODE


# ── server/discover ───────────────────────────────────────────────────────────


class TestDiscover:
  def test_result_type_complete(self):
    assert server().dispatch("server/discover", {}, ctx())["resultType"] == "complete"

  def test_supported_versions_lists_current(self):
    r = server().dispatch("server/discover", {}, ctx())
    assert r["supportedVersions"] == [CURRENT_PROTOCOL_VERSION]

  def test_capabilities_and_server_info(self):
    r = server().dispatch("server/discover", {}, ctx())
    assert r["capabilities"] == FULL_CAPS
    assert r["serverInfo"] == INFO

  def test_server_info_is_a_copy_not_the_live_object(self):
    # _discover passes dict(self.info); mutating the result must not affect the server.
    s = server()
    r = s.dispatch("server/discover", {}, ctx())
    r["serverInfo"]["name"] = "mutated"
    assert s.info["name"] == "srv"

  def test_discover_is_not_capability_gated(self):
    r = McpServer(INFO, {}).dispatch("server/discover", {}, ctx())
    assert r["resultType"] == "complete"


# ── capability gating (§6.4) ──────────────────────────────────────────────────


class TestCapabilityGating:
  GATED = [
    ("tools/list", {}),
    ("tools/call", {"name": "x"}),
    ("resources/list", {}),
    ("resources/templates/list", {}),
    ("resources/read", {"uri": "file:///x"}),
    ("prompts/list", {}),
    ("prompts/get", {"name": "x"}),
    ("completion/complete", {"ref": {"type": "ref/prompt", "name": "x"}, "argument": {}}),
  ]

  @pytest.mark.parametrize("method,params", GATED)
  def test_unadvertised_capability_is_method_not_found(self, method, params):
    s = McpServer(INFO, {})  # advertises nothing
    with pytest.raises(ServerError) as exc:
      s.dispatch(method, params, ctx())
    assert exc.value.code == METHOD_NOT_FOUND_CODE

  def test_gating_message_names_the_capability(self):
    with pytest.raises(ServerError) as exc:
      McpServer(INFO, {}).dispatch("tools/list", {}, ctx())
    assert "tools" in str(exc.value)

  def test_advertised_capability_is_allowed(self):
    # tools advertised but resources NOT → tools/list works, resources/list is gated.
    s = McpServer(INFO, {"tools": {}})
    assert "tools" in s.dispatch("tools/list", {}, ctx())
    with pytest.raises(ServerError) as exc:
      s.dispatch("resources/list", {}, ctx())
    assert exc.value.code == METHOD_NOT_FOUND_CODE

  def test_empty_dict_capability_value_counts_as_advertised(self):
    # capabilities.get(cap) is None is the gate — an empty {} is "advertised".
    s = McpServer(INFO, {"prompts": {}})
    assert "prompts" in s.dispatch("prompts/list", {}, ctx())

  def test_completions_capability_key_is_completions_not_completion(self):
    s = McpServer(INFO, {"completions": {}})
    s.register_prompt("p", lambda a: {"messages": []}, arguments=[{"name": "n", "complete": lambda v: []}])
    r = s.dispatch(
      "completion/complete",
      {"ref": {"type": "ref/prompt", "name": "p"}, "argument": {"name": "n", "value": ""}},
      ctx(),
    )
    assert r["resultType"] == "complete"


# ── tools/list ────────────────────────────────────────────────────────────────


class TestToolsList:
  def test_lists_all_declared_fields(self):
    s = server()
    s.register_tool(
      "rich",
      lambda a, c: {"content": []},
      input_schema={"type": "object", "properties": {"q": {"type": "string"}}},
      output_schema={"type": "object"},
      title="Rich Tool",
      description="A tool with everything",
      annotations={"readOnlyHint": True},
      execution={"taskSupport": "optional"},
    )
    entry = s.dispatch("tools/list", {}, ctx())["tools"][0]
    assert entry["name"] == "rich"
    assert entry["title"] == "Rich Tool"
    assert entry["description"] == "A tool with everything"
    assert entry["inputSchema"]["properties"]["q"]["type"] == "string"
    assert entry["outputSchema"] == {"type": "object"}
    assert entry["annotations"] == {"readOnlyHint": True}
    assert entry["execution"] == {"taskSupport": "optional"}

  def test_default_input_schema_when_none(self):
    s = server()
    s.register_tool("bare", lambda a, c: {})
    entry = s.dispatch("tools/list", {}, ctx())["tools"][0]
    assert entry["inputSchema"] == {"type": "object"}

  def test_optional_fields_omitted_when_absent(self):
    s = server()
    s.register_tool("bare", lambda a, c: {})
    entry = s.dispatch("tools/list", {}, ctx())["tools"][0]
    for key in ("title", "description", "outputSchema", "annotations", "execution"):
      assert key not in entry

  def test_top_level_cache_hints_present(self):
    s = server()
    s.register_tool("t", lambda a, c: {})
    r = s.dispatch("tools/list", {}, ctx())
    assert r["resultType"] == "complete"
    assert r["ttlMs"] == 0 and r["cacheScope"] == "private"

  def test_cache_hints_reflect_constructor_options(self):
    s = server(cache_ttl_ms=30000, cache_scope="public")
    s.register_tool("t", lambda a, c: {})
    r = s.dispatch("tools/list", {}, ctx())
    assert r["ttlMs"] == 30000 and r["cacheScope"] == "public"

  def test_empty_registry_yields_empty_list(self):
    r = server().dispatch("tools/list", {}, ctx())
    assert r["tools"] == [] and "nextCursor" not in r


# ── tools/list pagination ─────────────────────────────────────────────────────


class TestToolsPagination:
  def test_next_cursor_and_cursor_returns_next_page(self):
    s = server(page_size=3)
    for i in range(7):
      s.register_tool(f"t{i:02d}", lambda a, c: {})
    p1 = s.dispatch("tools/list", {}, ctx())
    assert [t["name"] for t in p1["tools"]] == ["t00", "t01", "t02"]
    assert "nextCursor" in p1
    p2 = s.dispatch("tools/list", {"cursor": p1["nextCursor"]}, ctx())
    assert [t["name"] for t in p2["tools"]] == ["t03", "t04", "t05"]
    p3 = s.dispatch("tools/list", {"cursor": p2["nextCursor"]}, ctx())
    assert [t["name"] for t in p3["tools"]] == ["t06"]
    assert "nextCursor" not in p3

  def test_exact_multiple_omits_trailing_cursor(self):
    # 6 tools at page size 3 → second page is full but is the last (offset+size == len).
    s = server(page_size=3)
    for i in range(6):
      s.register_tool(f"t{i}", lambda a, c: {})
    p1 = s.dispatch("tools/list", {}, ctx())
    p2 = s.dispatch("tools/list", {"cursor": p1["nextCursor"]}, ctx())
    assert len(p2["tools"]) == 3 and "nextCursor" not in p2

  def test_single_page_omits_cursor(self):
    s = server(page_size=50)
    for i in range(4):
      s.register_tool(f"t{i}", lambda a, c: {})
    r = s.dispatch("tools/list", {}, ctx())
    assert len(r["tools"]) == 4 and "nextCursor" not in r

  def test_garbage_cursor_raises_invalid_params(self):
    s = server(page_size=2)
    s.register_tool("t", lambda a, c: {})
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/list", {"cursor": "@@@not-base64@@@"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_out_of_range_cursor_raises_invalid_params(self):
    s = server(page_size=2)
    for i in range(3):
      s.register_tool(f"t{i}", lambda a, c: {})
    bad = base64.b64encode(b"9999").decode("ascii")  # offset way past the end
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/list", {"cursor": bad}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_negative_offset_cursor_raises_invalid_params(self):
    s = server(page_size=2)
    s.register_tool("t", lambda a, c: {})
    bad = base64.b64encode(b"-1").decode("ascii")
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/list", {"cursor": bad}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_offset_at_length_is_valid_empty_page(self):
    # An offset exactly == len(items) is in-range and yields an empty page (not an error).
    s = server(page_size=2)
    for i in range(2):
      s.register_tool(f"t{i}", lambda a, c: {})
    at_end = base64.b64encode(b"2").decode("ascii")
    r = s.dispatch("tools/list", {"cursor": at_end}, ctx())
    assert r["tools"] == [] and "nextCursor" not in r

  def test_empty_string_cursor_is_a_present_unrecognized_cursor(self):
    # The empty string is a PRESENT cursor (§12.1), not absence — it MUST NOT silently
    # fall through to the first page. Since the server never issues '' as a cursor, it
    # does not decode and is rejected as an unrecognized cursor (-32602). (R-12.1-a,
    # R-12.2-a)
    s = server(page_size=2)
    for i in range(3):
      s.register_tool(f"t{i}", lambda a, c: {})
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/list", {"cursor": ""}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_server_issued_cursor_positions_after_it(self):
    # Round-trip the server's own first-page nextCursor: re-sending it (a present, valid
    # cursor) MUST return the page positioned AFTER it, never page one. (R-12.2-a)
    s = server(page_size=2)
    for i in range(3):
      s.register_tool(f"t{i}", lambda a, c: {})
    first = s.dispatch("tools/list", {}, ctx())
    assert len(first["tools"]) == 2 and "nextCursor" in first
    second = s.dispatch("tools/list", {"cursor": first["nextCursor"]}, ctx())
    assert len(second["tools"]) == 1 and "nextCursor" not in second
    # No overlap: the two pages partition the three tools.
    first_names = {t["name"] for t in first["tools"]}
    second_names = {t["name"] for t in second["tools"]}
    assert first_names.isdisjoint(second_names)


# ── tools/call ────────────────────────────────────────────────────────────────


class TestToolsCall:
  def test_unknown_tool_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("tools/call", {"name": "ghost"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_non_string_name_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("tools/call", {"name": 123}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_missing_name_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("tools/call", {}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_complete_result_is_stamped(self):
    s = server()
    s.register_tool("echo", lambda a, c: {"content": [{"type": "text", "text": "hi"}]})
    r = s.dispatch("tools/call", {"name": "echo", "arguments": {}}, ctx())
    assert r["resultType"] == "complete"
    assert r["content"][0]["text"] == "hi"

  def test_arguments_default_to_empty_object(self):
    s = server()
    seen = {}
    s.register_tool("t", lambda a, c: seen.update({"args": a}) or {"content": []})
    s.dispatch("tools/call", {"name": "t"}, ctx())  # no "arguments" key
    assert seen["args"] == {}

  def test_input_schema_validation_failure_is_invalid_params(self):
    def validator(_schema, value):
      ok = "x" in value
      return ok, [] if ok else ["missing required 'x'"]

    s = server(value_validator=validator)
    s.register_tool("t", lambda a, c: {"content": []}, input_schema={"type": "object"})
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/call", {"name": "t", "arguments": {"y": 1}}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE
    assert "missing required 'x'" in str(exc.value)

  def test_valid_input_schema_passes_through(self):
    s = server(value_validator=lambda _s, _v: (True, []))
    s.register_tool("t", lambda a, c: {"content": []}, input_schema={"type": "object"})
    r = s.dispatch("tools/call", {"name": "t", "arguments": {"x": 1}}, ctx())
    assert r["resultType"] == "complete"

  def test_no_validation_when_input_schema_absent(self):
    # A validator that always rejects must NOT run when the tool declares no input_schema.
    s = server(value_validator=lambda _s, _v: (False, ["should never run"]))
    s.register_tool("t", lambda a, c: {"content": []})
    r = s.dispatch("tools/call", {"name": "t", "arguments": {"anything": True}}, ctx())
    assert r["resultType"] == "complete"

  def test_output_schema_violation_is_internal_error(self):
    s = server(value_validator=lambda _s, _v: (False, ["z is not a number"]))
    s.register_tool(
      "t", lambda a, c: {"structuredContent": {"z": "nope"}}, output_schema={"type": "object"}
    )
    with pytest.raises(ServerError) as exc:
      s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert exc.value.code == INTERNAL_ERROR_CODE

  def test_output_schema_passes_when_valid(self):
    s = server(value_validator=lambda _s, _v: (True, []))
    s.register_tool(
      "t", lambda a, c: {"structuredContent": {"z": 1}}, output_schema={"type": "object"}
    )
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert r["structuredContent"] == {"z": 1}

  def test_output_schema_not_validated_when_no_structured_content(self):
    # No structuredContent → outputSchema check is skipped even with a rejecting validator.
    s = server(value_validator=lambda _s, _v: (False, ["bad"]))
    s.register_tool("t", lambda a, c: {"content": []}, output_schema={"type": "object"})
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert r["resultType"] == "complete"

  def test_output_schema_not_validated_for_error_results(self):
    # An isError result is NOT validated against outputSchema even with bad structuredContent.
    s = server(value_validator=lambda _s, _v: (False, ["bad"]))
    s.register_tool(
      "t",
      lambda a, c: {"isError": True, "structuredContent": {"oops": 1}, "content": []},
      output_schema={"type": "object"},
    )
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert r["isError"] is True and r["resultType"] == "complete"

  def test_is_error_result_passes_through(self):
    s = server()
    s.register_tool(
      "t", lambda a, c: {"isError": True, "content": [{"type": "text", "text": "boom"}]}
    )
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert r["isError"] is True
    assert r["resultType"] == "complete"  # still a successful JSON-RPC result
    assert r["content"][0]["text"] == "boom"

  def test_defaults_applied_from_input_schema(self):
    s = server()
    seen = {}
    s.register_tool(
      "t",
      lambda a, c: seen.update(a) or {"content": []},
      input_schema={
        "type": "object",
        "properties": {"limit": {"default": 10}, "verbose": {"default": False}},
      },
    )
    s.dispatch("tools/call", {"name": "t", "arguments": {"verbose": True}}, ctx())
    assert seen["limit"] == 10  # defaulted
    assert seen["verbose"] is True  # supplied value wins over default

  def test_tools_call_is_not_cacheable(self):
    s = server()
    s.register_tool("t", lambda a, c: {"content": []})
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert "ttlMs" not in r and "cacheScope" not in r


# ── tools/call — ToolContext wiring ───────────────────────────────────────────


class TestToolContextWiring:
  def test_progress_token_is_threaded_from_meta(self):
    s = server()
    seen = {}
    s.register_tool("t", lambda a, c: seen.update({"pt": c.progress_token}) or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(meta={"progressToken": "p-9"}))
    assert seen["pt"] == "p-9"

  def test_progress_token_none_when_absent(self):
    s = server()
    seen = {}
    s.register_tool("t", lambda a, c: seen.update({"pt": c.progress_token}) or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert seen["pt"] is None

  def test_auth_info_is_threaded(self):
    s = server()
    seen = {}
    s.register_tool("t", lambda a, c: seen.update({"auth": c.auth_info}) or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(auth_info={"sub": "u1"}))
    assert seen["auth"] == {"sub": "u1"}

  def test_signal_is_threaded_and_reflects_abort(self):
    s = server()
    sig = CancelSignal()
    seen = {}

    def t(_a, c):
      seen["before"] = c.signal.aborted
      sig.abort()
      seen["after"] = c.signal.aborted
      return {"content": []}

    s.register_tool("t", t)
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(signal=sig))
    assert seen["before"] is False and seen["after"] is True

  def test_meta_is_passed_to_tool_context(self):
    s = server()
    seen = {}
    s.register_tool("t", lambda a, c: seen.update({"meta": c.meta}) or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(meta={"k": "v"}))
    assert seen["meta"] == {"k": "v"}


# ── tools/call MRTR (§11 input_required + retry) ──────────────────────────────


class TestMrtr:
  def _ask_server(self) -> McpServer:
    s = McpServer(INFO, {"tools": {}, "elicitation": {}})

    def ask(_args, c):
      reply = c.elicit_input({"mode": "form", "message": "name?"})
      return {"content": [{"type": "text", "text": reply["action"]}]}

    s.register_tool("ask", ask)
    return s

  def _two_step_server(self) -> McpServer:
    s = McpServer(INFO, {"tools": {}, "elicitation": {}})

    def two(_args, c):
      a = c.elicit_input({"message": "first"})
      b = c.elicit_input({"message": "second"})
      return {"content": [{"type": "text", "text": f'{a["action"]}+{b["action"]}'}]}

    s.register_tool("two", two)
    return s

  def test_first_call_returns_input_required(self):
    r = self._ask_server().dispatch("tools/call", {"name": "ask", "arguments": {}}, ctx())
    assert r["resultType"] == "input_required"
    key = next(iter(r["inputRequests"]))
    assert r["inputRequests"][key]["method"] == "elicitation/create"
    assert r["inputRequests"][key]["params"] == {"mode": "form", "message": "name?"}
    assert isinstance(r["requestState"], str)

  def test_create_message_solicitation_uses_sampling_method(self):
    s = McpServer(INFO, {"tools": {}, "sampling": {}})
    s.register_tool("t", lambda a, c: {"content": [{"text": c.create_message({"q": 1})}]})
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    key = next(iter(r["inputRequests"]))
    assert r["inputRequests"][key]["method"] == "sampling/createMessage"
    assert r["inputRequests"][key]["params"] == {"q": 1}

  def test_list_roots_solicitation_uses_roots_method_with_empty_params(self):
    s = McpServer(INFO, {"tools": {}, "roots": {}})
    s.register_tool("t", lambda a, c: {"content": [c.list_roots()]})
    r = s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    key = next(iter(r["inputRequests"]))
    assert r["inputRequests"][key]["method"] == "roots/list"
    assert r["inputRequests"][key]["params"] == {}

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

  def test_initial_request_state_encodes_empty_accumulator(self):
    r1 = self._ask_server().dispatch("tools/call", {"name": "ask", "arguments": {}}, ctx())
    assert _decode_state(r1["requestState"]) == {}

  def test_two_solicitations_request_state_carries_prior_response(self):
    s = self._two_step_server()
    # Round 1: first solicitation, nothing answered yet.
    r1 = s.dispatch("tools/call", {"name": "two", "arguments": {}}, ctx())
    k1 = next(iter(r1["inputRequests"]))
    assert _decode_state(r1["requestState"]) == {}

    # Round 2: answer the first; the tool re-runs and stops at the second solicitation.
    r2 = s.dispatch(
      "tools/call",
      {
        "name": "two",
        "arguments": {},
        "inputResponses": {k1: {"action": "accept"}},
        "requestState": r1["requestState"],
      },
      ctx(),
    )
    assert r2["resultType"] == "input_required"
    k2 = next(iter(r2["inputRequests"]))
    assert k2 != k1
    # The continuation token returned in round 2 carries the round-1 response.
    assert _decode_state(r2["requestState"]) == {k1: {"action": "accept"}}

    # Round 3: answer the second; both responses are now available → complete.
    r3 = s.dispatch(
      "tools/call",
      {
        "name": "two",
        "arguments": {},
        "inputResponses": {k2: {"action": "decline"}},
        "requestState": r2["requestState"],
      },
      ctx(),
    )
    assert r3["resultType"] == "complete"
    assert r3["content"][0]["text"] == "accept+decline"

  def test_garbage_request_state_is_rejected_for_integrity(self):
    # S44 / R-28.6-b: a requestState that fails its integrity check (here, garbage that was
    # never minted by this server) is REJECTED with -32602 + reason
    # "integrity-validation-failed" — NOT silently tolerated as {} and acted upon.
    s = self._ask_server()
    with pytest.raises(ServerError) as exc:
      s.dispatch(
        "tools/call",
        {"name": "ask", "arguments": {}, "requestState": "!!!not-base64!!!"},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE
    assert exc.value.data == {"reason": "integrity-validation-failed"}

  def test_tampered_request_state_is_rejected_and_contents_not_acted_on(self):
    # Mint a legitimate requestState, flip one byte of its signed payload, resubmit: the
    # server rejects it for integrity rather than acting on the forged continuation state.
    s = self._two_step_server()
    r1 = s.dispatch("tools/call", {"name": "two", "arguments": {}}, ctx())
    k1 = next(iter(r1["inputRequests"]))
    r2 = s.dispatch(
      "tools/call",
      {
        "name": "two",
        "arguments": {},
        "inputResponses": {k1: {"action": "accept"}},
        "requestState": r1["requestState"],
      },
      ctx(),
    )
    good = r2["requestState"]
    payload, mac = good.split(".")
    # Tamper a byte of the payload (its HMAC no longer matches).
    flipped = ("A" if payload[5] != "A" else "B")
    tampered = payload[:5] + flipped + payload[6:] + "." + mac
    with pytest.raises(ServerError) as exc:
      s.dispatch(
        "tools/call",
        {"name": "two", "arguments": {}, "requestState": tampered},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE
    assert exc.value.data == {"reason": "integrity-validation-failed"}

  def test_request_state_from_another_server_is_rejected(self):
    # A token minted by a DIFFERENT server (different secret) does not verify here — a forged
    # token cannot be replayed across servers. (R-28.6-b)
    minting = self._ask_server()
    r1 = minting.dispatch("tools/call", {"name": "ask", "arguments": {}}, ctx())
    other = self._ask_server()  # fresh server → fresh secret
    with pytest.raises(ServerError) as exc:
      other.dispatch(
        "tools/call",
        {"name": "ask", "arguments": {}, "requestState": r1["requestState"]},
        ctx(),
      )
    assert exc.value.data == {"reason": "integrity-validation-failed"}

  def test_shared_secret_verifies_across_instances(self):
    # The stateless complement: two instances sharing a secret accept each other's tokens, so
    # an MRTR retry routed to a peer instance still verifies. (§4.4 statelessness)
    secret = b"shared-deployment-secret-0123456789"
    a = McpServer(INFO, {"tools": {}, "elicitation": {}}, request_state_secret=secret)
    b = McpServer(INFO, {"tools": {}, "elicitation": {}}, request_state_secret=secret)
    for s in (a, b):
      s.register_tool(
        "ask",
        lambda _a, c: {"content": [{"type": "text", "text": c.elicit_input({"mode": "form", "message": "name?"})["action"]}]},
      )
    r1 = a.dispatch("tools/call", {"name": "ask", "arguments": {}}, ctx())
    key = next(iter(r1["inputRequests"]))
    r2 = b.dispatch(
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

  def _clocked_two_step(self, clock: dict, *, ttl_ms: int) -> McpServer:
    s = McpServer(
      INFO,
      {"tools": {}, "elicitation": {}},
      request_state_ttl_ms=ttl_ms,
      request_state_clock=lambda: clock["ms"],
    )

    def two(_args, c):
      a = c.elicit_input({"message": "first"})
      b = c.elicit_input({"message": "second"})
      return {"content": [{"type": "text", "text": f'{a["action"]}+{b["action"]}'}]}

    s.register_tool("two", two)
    return s

  def test_expired_request_state_is_rejected(self):
    # R-28.6-c: a captured-but-expired requestState is rejected (bounding replay) rather than
    # honored. Mint at t=1000 with a 5s TTL (exp=6000), then submit at t=7000.
    clock = {"ms": 1000}
    s = self._clocked_two_step(clock, ttl_ms=5000)
    r1 = s.dispatch("tools/call", {"name": "two", "arguments": {}}, ctx())
    k1 = next(iter(r1["inputRequests"]))
    clock["ms"] = 7000  # past expiry
    with pytest.raises(ServerError) as exc:
      s.dispatch(
        "tools/call",
        {"name": "two", "arguments": {}, "inputResponses": {k1: {"action": "accept"}}, "requestState": r1["requestState"]},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE
    assert exc.value.data == {"reason": "continuation-token-expired"}

  def test_request_state_within_ttl_is_accepted(self):
    # The complement: still-fresh tokens verify normally (no over-rejection at the boundary).
    clock = {"ms": 1000}
    s = self._clocked_two_step(clock, ttl_ms=5000)
    r1 = s.dispatch("tools/call", {"name": "two", "arguments": {}}, ctx())
    k1 = next(iter(r1["inputRequests"]))
    clock["ms"] = 6000  # exactly at expiry boundary — still valid (now_ms > exp rejects)
    r2 = s.dispatch(
      "tools/call",
      {"name": "two", "arguments": {}, "inputResponses": {k1: {"action": "accept"}}, "requestState": r1["requestState"]},
      ctx(),
    )
    assert r2["resultType"] == "input_required"  # advanced to the second solicitation


# ── tools/call task augmentation (§25.3) ──────────────────────────────────────


class TestToolCallTaskAugmentation:
  def test_task_handle_is_flattened_with_task_result_type(self):
    s = server()
    s.register_tool(
      "t", lambda a, c: {"task": {"taskId": "t1", "status": "working", "ttlMs": 1000}}
    )
    r = s.dispatch("tools/call", {"name": "t", "task": {"ttl": 1000}}, ctx())
    assert r["resultType"] == "task"
    assert r["taskId"] == "t1" and r["status"] == "working"
    assert "task" not in r  # flattened, not nested

  def test_task_requested_and_ttl_visible_to_handler(self):
    s = server()
    seen = {}

    def t(_a, c):
      seen["requested"] = c.task_requested
      seen["ttl"] = c.task_ttl_ms
      return {"task": {"taskId": "x", "status": "working"}}

    s.register_tool("t", t)
    s.dispatch("tools/call", {"name": "t", "task": {"ttl": 42000}}, ctx())
    assert seen["requested"] is True and seen["ttl"] == 42000

  def test_task_not_requested_when_param_absent(self):
    s = server()
    seen = {}
    s.register_tool(
      "t",
      lambda a, c: seen.update({"requested": c.task_requested, "ttl": c.task_ttl_ms})
      or {"content": []},
    )
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert seen["requested"] is False and seen["ttl"] is None

  def test_task_requested_with_no_ttl_key_yields_none(self):
    s = server()
    seen = {}
    s.register_tool(
      "t", lambda a, c: seen.update({"ttl": c.task_ttl_ms}) or {"task": {"taskId": "x", "status": "working"}}
    )
    s.dispatch("tools/call", {"name": "t", "task": {}}, ctx())  # task present, no ttl
    assert seen["ttl"] is None

  def test_task_augmentation_with_store_round_trips(self):
    s = McpServer(INFO, {"tools": {}, "extensions": {"io.modelcontextprotocol/tasks": {}}})
    store = InMemoryTaskStore()
    s.set_task_store(store)

    def job(_a, c):
      task = store.create_task(ttl_ms=c.task_ttl_ms)
      store.store_result(task["taskId"], {"content": [{"type": "text", "text": "done"}]})
      return {"task": task}

    s.register_tool("job", job, execution={"taskSupport": "required"})
    created = s.dispatch("tools/call", {"name": "job", "task": {"ttl": 60000}}, ctx())
    assert created["resultType"] == "task"
    got = s.dispatch("tasks/get", {"taskId": created["taskId"]}, ctx())
    assert got["status"] == "completed"
    assert got["result"]["content"][0]["text"] == "done"


# ── resources ─────────────────────────────────────────────────────────────────


class TestResourcesList:
  def test_lists_declared_fields(self):
    s = server()
    s.register_resource(
      "doc", "file:///doc", lambda uri: {"contents": [{"uri": uri}]},
      title="Document", description="A doc", mime_type="text/plain",
    )
    entry = s.dispatch("resources/list", {}, ctx())["resources"][0]
    assert entry == {
      "uri": "file:///doc",
      "name": "doc",
      "title": "Document",
      "description": "A doc",
      "mimeType": "text/plain",
    }

  def test_optional_fields_omitted(self):
    s = server()
    s.register_resource("d", "file:///d", lambda uri: {"contents": [{"uri": uri}]})
    entry = s.dispatch("resources/list", {}, ctx())["resources"][0]
    assert entry == {"uri": "file:///d", "name": "d"}

  def test_cache_hints_and_result_type(self):
    s = server(cache_ttl_ms=5, cache_scope="public")
    s.register_resource("d", "file:///d", lambda uri: {"contents": [{"uri": uri}]})
    r = s.dispatch("resources/list", {}, ctx())
    assert r["resultType"] == "complete" and r["ttlMs"] == 5 and r["cacheScope"] == "public"


class TestResourceReadSsrfGuard:
  """B3 / RC-18 (R-28.10): with ``guard_resource_ssrf`` enabled, a ``resources/read`` whose
  URI targets a private/loopback/link-local address is refused BEFORE the read callback runs;
  off by default so a host may serve loopback/file resources.
  """

  def _read(self, uri):
    return {"contents": [{"uri": uri, "text": "secret"}]}

  def _guarded(self, uri):
    s = McpServer(INFO, {"resources": {}}, guard_resource_ssrf=True)
    s.register_resource("r", uri, self._read)
    return s

  def test_loopback_uri_refused_when_guarded(self):
    s = self._guarded("http://127.0.0.1:9000/x")
    with pytest.raises(ServerError) as exc:
      s.dispatch("resources/read", {"uri": "http://127.0.0.1:9000/x"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE
    assert exc.value.data == {"uri": "http://127.0.0.1:9000/x"}

  def test_link_local_metadata_uri_refused_when_guarded(self):
    s = self._guarded("http://169.254.169.254/latest/meta-data")
    with pytest.raises(ServerError):
      s.dispatch("resources/read", {"uri": "http://169.254.169.254/latest/meta-data"}, ctx())

  def test_public_https_uri_allowed_when_guarded(self):
    s = self._guarded("https://example.com/x")
    r = s.dispatch("resources/read", {"uri": "https://example.com/x"}, ctx())
    assert r["contents"][0]["text"] == "secret"

  def test_file_uri_allowed_when_guarded(self):
    s = self._guarded("file:///etc/data")
    r = s.dispatch("resources/read", {"uri": "file:///etc/data"}, ctx())
    assert r["contents"][0]["text"] == "secret"

  def test_loopback_allowed_when_unguarded_by_default(self):
    s = McpServer(INFO, {"resources": {}})  # guard off (default)
    s.register_resource("r", "http://127.0.0.1:9000/x", self._read)
    r = s.dispatch("resources/read", {"uri": "http://127.0.0.1:9000/x"}, ctx())
    assert r["contents"][0]["text"] == "secret"

  def test_pagination(self):
    s = server(page_size=2)
    for i in range(5):
      s.register_resource(f"r{i}", f"file:///r{i}", lambda uri: {"contents": [{"uri": uri}]})
    p1 = s.dispatch("resources/list", {}, ctx())
    assert len(p1["resources"]) == 2 and "nextCursor" in p1
    p2 = s.dispatch("resources/list", {"cursor": p1["nextCursor"]}, ctx())
    assert len(p2["resources"]) == 2


class TestResourceTemplatesList:
  def test_lists_declared_fields(self):
    s = server()
    s.register_resource_template(
      "item", "item://{id}", lambda uri, v: {"contents": [{"uri": uri}]},
      title="Item", description="An item", mime_type="application/json",
    )
    entry = s.dispatch("resources/templates/list", {}, ctx())["resourceTemplates"][0]
    assert entry == {
      "uriTemplate": "item://{id}",
      "name": "item",
      "title": "Item",
      "description": "An item",
      "mimeType": "application/json",
    }

  def test_cache_hints_present(self):
    s = server()
    s.register_resource_template("i", "i://{x}", lambda uri, v: {"contents": [{"uri": uri}]})
    r = s.dispatch("resources/templates/list", {}, ctx())
    assert r["resultType"] == "complete" and r["ttlMs"] == 0 and r["cacheScope"] == "private"

  def test_pagination(self):
    s = server(page_size=1)
    for i in range(3):
      s.register_resource_template(f"t{i}", f"t{i}://{{x}}", lambda uri, v: {"contents": [{"uri": uri}]})
    p1 = s.dispatch("resources/templates/list", {}, ctx())
    assert len(p1["resourceTemplates"]) == 1 and "nextCursor" in p1


class TestResourcesRead:
  def test_direct_uri(self):
    s = server()
    s.register_resource("doc", "file:///doc", lambda uri: {"contents": [{"uri": uri, "text": "body"}]})
    r = s.dispatch("resources/read", {"uri": "file:///doc"}, ctx())
    assert r["contents"][0]["text"] == "body"
    assert r["resultType"] == "complete" and r["ttlMs"] == 0

  def test_template_match_passes_captured_variables(self):
    s = server()
    s.register_resource_template(
      "item", "item://{kind}/{id}",
      lambda uri, v: {"contents": [{"uri": uri, "kind": v["kind"], "id": v["id"]}]},
    )
    r = s.dispatch("resources/read", {"uri": "item://widget/99"}, ctx())
    assert r["contents"][0]["kind"] == "widget" and r["contents"][0]["id"] == "99"

  def test_direct_match_preferred_over_template(self):
    s = server()
    s.register_resource("direct", "x://exact", lambda uri: {"contents": [{"uri": uri, "via": "direct"}]})
    s.register_resource_template("tpl", "x://{name}", lambda uri, v: {"contents": [{"uri": uri, "via": "template"}]})
    r = s.dispatch("resources/read", {"uri": "x://exact"}, ctx())
    assert r["contents"][0]["via"] == "direct"

  def test_not_found_is_invalid_params_with_uri_data(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("resources/read", {"uri": "file:///nope"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE
    assert exc.value.data == {"uri": "file:///nope"}

  def test_non_string_uri_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("resources/read", {"uri": 42}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_missing_uri_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("resources/read", {}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_empty_contents_is_internal_error(self):
    s = server()
    s.register_resource("e", "file:///e", lambda uri: {"contents": []})
    with pytest.raises(ServerError) as exc:
      s.dispatch("resources/read", {"uri": "file:///e"}, ctx())
    assert exc.value.code == INTERNAL_ERROR_CODE

  def test_missing_contents_key_is_internal_error(self):
    s = server()
    s.register_resource("e", "file:///e", lambda uri: {"other": "stuff"})
    with pytest.raises(ServerError) as exc:
      s.dispatch("resources/read", {"uri": "file:///e"}, ctx())
    assert exc.value.code == INTERNAL_ERROR_CODE

  def test_template_empty_contents_is_internal_error(self):
    s = server()
    s.register_resource_template("t", "t://{x}", lambda uri, v: {"contents": []})
    with pytest.raises(ServerError) as exc:
      s.dispatch("resources/read", {"uri": "t://1"}, ctx())
    assert exc.value.code == INTERNAL_ERROR_CODE


# ── prompts ───────────────────────────────────────────────────────────────────


class TestPromptsList:
  def test_lists_name_title_description(self):
    s = server()
    s.register_prompt("greet", lambda a: {"messages": []}, title="Greeting", description="Say hi")
    entry = s.dispatch("prompts/list", {}, ctx())["prompts"][0]
    assert entry["name"] == "greet"
    assert entry["title"] == "Greeting"
    assert entry["description"] == "Say hi"

  def test_lists_arguments_with_description_and_required(self):
    s = server()
    s.register_prompt(
      "p", lambda a: {"messages": []},
      arguments=[
        {"name": "topic", "description": "what about", "required": True},
        {"name": "tone"},  # bare arg — only name surfaces
      ],
    )
    args = s.dispatch("prompts/list", {}, ctx())["prompts"][0]["arguments"]
    assert args[0] == {"name": "topic", "description": "what about", "required": True}
    assert args[1] == {"name": "tone"}

  def test_arguments_omitted_when_none(self):
    s = server()
    s.register_prompt("p", lambda a: {"messages": []})
    entry = s.dispatch("prompts/list", {}, ctx())["prompts"][0]
    assert "arguments" not in entry

  def test_cache_hints_present(self):
    s = server()
    s.register_prompt("p", lambda a: {"messages": []})
    r = s.dispatch("prompts/list", {}, ctx())
    assert r["resultType"] == "complete" and r["ttlMs"] == 0 and r["cacheScope"] == "private"


class TestPromptsGet:
  def test_renders_messages(self):
    s = server()
    s.register_prompt("greet", lambda a: {"messages": [{"role": "user", "content": a.get("name", "")}]})
    r = s.dispatch("prompts/get", {"name": "greet", "arguments": {"name": "Ada"}}, ctx())
    assert r["resultType"] == "complete"
    assert r["messages"][0]["content"] == "Ada"

  def test_description_included(self):
    s = server()
    s.register_prompt("greet", lambda a: {"messages": []}, description="A greeting prompt")
    r = s.dispatch("prompts/get", {"name": "greet"}, ctx())
    assert r["description"] == "A greeting prompt"

  def test_description_omitted_when_absent(self):
    s = server()
    s.register_prompt("greet", lambda a: {"messages": []})
    r = s.dispatch("prompts/get", {"name": "greet"}, ctx())
    assert "description" not in r

  def test_unknown_prompt_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("prompts/get", {"name": "ghost"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_non_string_name_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      server().dispatch("prompts/get", {"name": None}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_missing_required_argument_is_invalid_params(self):
    s = server()
    s.register_prompt("p", lambda a: {"messages": []}, arguments=[{"name": "topic", "required": True}])
    with pytest.raises(ServerError) as exc:
      s.dispatch("prompts/get", {"name": "p", "arguments": {}}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE
    assert "topic" in str(exc.value)

  def test_empty_required_argument_value_is_invalid_params(self):
    # An empty-string arg is falsy → treated as missing (§18.4).
    s = server()
    s.register_prompt("p", lambda a: {"messages": []}, arguments=[{"name": "topic", "required": True}])
    with pytest.raises(ServerError) as exc:
      s.dispatch("prompts/get", {"name": "p", "arguments": {"topic": ""}}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_supplied_required_argument_renders(self):
    s = server()
    s.register_prompt(
      "p", lambda a: {"messages": [{"role": "user", "content": a["topic"]}]},
      arguments=[{"name": "topic", "required": True}],
    )
    r = s.dispatch("prompts/get", {"name": "p", "arguments": {"topic": "MCP"}}, ctx())
    assert r["messages"][0]["content"] == "MCP"

  def test_optional_argument_may_be_omitted(self):
    s = server()
    s.register_prompt(
      "p", lambda a: {"messages": [{"role": "user", "content": a.get("tone", "neutral")}]},
      arguments=[{"name": "tone"}],  # not required
    )
    r = s.dispatch("prompts/get", {"name": "p", "arguments": {}}, ctx())
    assert r["messages"][0]["content"] == "neutral"


# ── completion/complete ───────────────────────────────────────────────────────


class TestCompletion:
  def _server(self) -> McpServer:
    s = server()
    s.register_prompt(
      "greeting", lambda a: {"messages": []},
      arguments=[
        {"name": "name", "required": True},
        {"name": "language", "complete": lambda v: [x for x in ["english", "estonian"] if x.startswith(v)]},
      ],
    )
    s.register_resource_template(
      "city", "weather://{city}",
      lambda uri, v: {"contents": [{"uri": uri}]},
      complete={"city": lambda v: [x for x in ["oslo", "osaka", "oxford"] if x.startswith(v)]},
    )
    return s

  def test_prompt_ref_completion(self):
    r = self._server().dispatch(
      "completion/complete",
      {"ref": {"type": "ref/prompt", "name": "greeting"}, "argument": {"name": "language", "value": "e"}},
      ctx(),
    )
    assert r["resultType"] == "complete"
    assert r["completion"]["values"] == ["english", "estonian"]
    assert r["completion"]["total"] == 2
    assert r["completion"]["hasMore"] is False

  def test_resource_ref_completion(self):
    r = self._server().dispatch(
      "completion/complete",
      {"ref": {"type": "ref/resource", "uri": "weather://{city}"}, "argument": {"name": "city", "value": "os"}},
      ctx(),
    )
    assert r["completion"]["values"] == ["oslo", "osaka"]
    assert r["completion"]["total"] == 2

  def test_prompt_arg_without_complete_yields_empty(self):
    # The "name" arg has no `complete` fn → empty values, not an error.
    r = self._server().dispatch(
      "completion/complete",
      {"ref": {"type": "ref/prompt", "name": "greeting"}, "argument": {"name": "name", "value": "A"}},
      ctx(),
    )
    assert r["completion"]["values"] == []
    assert r["completion"]["total"] == 0

  def test_unknown_prompt_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/prompt", "name": "ghost"}, "argument": {"name": "language", "value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_unknown_prompt_argument_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/prompt", "name": "greeting"}, "argument": {"name": "zzz", "value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_unknown_template_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/resource", "uri": "nope://{x}"}, "argument": {"name": "x", "value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_unknown_template_argument_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/resource", "uri": "weather://{city}"}, "argument": {"name": "zzz", "value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_template_argument_with_no_name_is_invalid_params(self):
    # No argument.name → fn lookup is None → unknown-argument error.
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete",
        {"ref": {"type": "ref/resource", "uri": "weather://{city}"}, "argument": {"value": ""}},
        ctx(),
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_invalid_ref_type_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch(
        "completion/complete", {"ref": {"type": "ref/bogus"}, "argument": {}}, ctx()
      )
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_missing_ref_is_invalid_params(self):
    with pytest.raises(ServerError) as exc:
      self._server().dispatch("completion/complete", {"argument": {}}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_values_capped_at_100_with_total_and_has_more(self):
    s = server()
    s.register_prompt(
      "big", lambda a: {"messages": []},
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

  def test_exactly_100_values_has_more_false(self):
    s = server()
    s.register_prompt(
      "exact", lambda a: {"messages": []},
      arguments=[{"name": "x", "complete": lambda v: [str(i) for i in range(100)]}],
    )
    r = s.dispatch(
      "completion/complete",
      {"ref": {"type": "ref/prompt", "name": "exact"}, "argument": {"name": "x", "value": ""}},
      ctx(),
    )
    assert len(r["completion"]["values"]) == 100
    assert r["completion"]["total"] == 100
    assert r["completion"]["hasMore"] is False


# ── tasks/get | cancel | update (§25) ─────────────────────────────────────────


class TestTasksLifecycle:
  def _wired(self):
    s = McpServer(INFO, {"tools": {}, "extensions": {"io.modelcontextprotocol/tasks": {}}})
    store = InMemoryTaskStore()
    s.set_task_store(store)
    return s, store

  def test_get_returns_detailed_task_complete(self):
    s, store = self._wired()
    task = store.create_task(ttl_ms=None)
    store.store_result(task["taskId"], {"content": [{"type": "text", "text": "ok"}]})
    got = s.dispatch("tasks/get", {"taskId": task["taskId"]}, ctx())
    assert got["resultType"] == "complete"
    assert got["status"] == "completed"
    assert got["taskId"] == task["taskId"]
    assert got["result"]["content"][0]["text"] == "ok"

  def test_get_working_task_has_no_outcome(self):
    s, store = self._wired()
    task = store.create_task(ttl_ms=None)
    got = s.dispatch("tasks/get", {"taskId": task["taskId"]}, ctx())
    assert got["status"] == "working"
    assert "result" not in got and "error" not in got

  def test_get_unknown_task_is_invalid_params(self):
    s, _ = self._wired()
    with pytest.raises(ServerError) as exc:
      s.dispatch("tasks/get", {"taskId": "ghost"}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_cancel_moves_to_cancelled(self):
    s, store = self._wired()
    task = store.create_task(ttl_ms=None)
    got = s.dispatch("tasks/cancel", {"taskId": task["taskId"]}, ctx())
    assert got["resultType"] == "complete"
    assert got["status"] == "cancelled"

  def test_cancel_terminal_task_is_idempotent(self):
    s, store = self._wired()
    task = store.create_task(ttl_ms=None)
    store.store_result(task["taskId"], {"content": []})  # → completed (terminal)
    got = s.dispatch("tasks/cancel", {"taskId": task["taskId"]}, ctx())
    assert got["status"] == "completed"  # terminal state is immutable

  def test_update_applies_input_and_returns_working(self):
    s, store = self._wired()
    task = store.create_task(ttl_ms=None)
    store.set_input_requests(task["taskId"], {"k": {"method": "elicitation/create", "params": {}}})
    got = s.dispatch(
      "tasks/update",
      {"taskId": task["taskId"], "inputResponses": {"k": {"action": "accept"}}},
      ctx(),
    )
    assert got["resultType"] == "complete"
    assert got["status"] == "working"  # input supplied → resumes

  def test_update_with_no_input_responses_defaults_to_empty(self):
    s, store = self._wired()
    task = store.create_task(ttl_ms=None)
    store.set_input_requests(task["taskId"], {"k": {"method": "elicitation/create", "params": {}}})
    got = s.dispatch("tasks/update", {"taskId": task["taskId"]}, ctx())
    assert got["status"] == "working"

  @pytest.mark.parametrize("method", ["tasks/get", "tasks/cancel", "tasks/update"])
  def test_missing_task_store_is_minus_32003(self, method):
    s = McpServer(INFO, {"tools": {}})  # no store wired
    with pytest.raises(ServerError) as exc:
      s.dispatch(method, {"taskId": "x"}, ctx())
    assert exc.value.code == TASK_MISSING_CAPABILITY_CODE

  @pytest.mark.parametrize("method", ["tasks/get", "tasks/cancel", "tasks/update"])
  def test_non_string_task_id_is_invalid_params(self, method):
    s, _ = self._wired()
    with pytest.raises(ServerError) as exc:
      s.dispatch(method, {"taskId": 123}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  @pytest.mark.parametrize("method", ["tasks/get", "tasks/cancel", "tasks/update"])
  def test_missing_task_id_is_invalid_params(self, method):
    s, _ = self._wired()
    with pytest.raises(ServerError) as exc:
      s.dispatch(method, {}, ctx())
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_store_missing_takes_priority_over_task_id_check(self):
    # No store → -32003 even when taskId is also invalid (capability gate runs first).
    s = McpServer(INFO, {"tools": {}})
    with pytest.raises(ServerError) as exc:
      s.dispatch("tasks/get", {"taskId": 999}, ctx())
    assert exc.value.code == TASK_MISSING_CAPABILITY_CODE

  def test_set_task_store_wires_update_listener(self):
    # A status change pushes a notifications/tasks message through the notifier.
    s, store = self._wired()
    pushed = []
    s.set_task_notifier(pushed.append)
    task = store.create_task(ttl_ms=None)
    store.update_status(task["taskId"], "completed")
    assert any(m["method"] == "notifications/tasks" for m in pushed)


# ── ToolContext logging + notification surface ────────────────────────────────


class TestLoggingAndNotifications:
  def test_log_filters_below_min_level(self):
    sent = []
    s = server()
    s.dispatch("logging/setLevel", {"level": "warning"}, ctx())
    s.register_tool(
      "t",
      lambda a, c: (c.log("debug", "below"), c.log("warning", "at"), c.log("error", "above"))
      and {"content": []} or {"content": []},
    )
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(notify=sent.append))
    levels = [m["params"]["level"] for m in sent if m["method"] == "notifications/message"]
    assert levels == ["warning", "error"]  # debug suppressed

  def test_log_includes_logger_name_and_data(self):
    sent = []
    s = server()
    s.register_tool("t", lambda a, c: c.log("info", "hello") or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(notify=sent.append))
    msg = next(m for m in sent if m["method"] == "notifications/message")
    assert msg["params"]["logger"] == "srv"
    assert msg["params"]["data"] == "hello"

  def test_log_at_exactly_min_level_is_emitted(self):
    sent = []
    s = server()
    s.dispatch("logging/setLevel", {"level": "info"}, ctx())
    s.register_tool("t", lambda a, c: c.log("info", "x") or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(notify=sent.append))
    assert any(m["method"] == "notifications/message" for m in sent)

  def test_notify_calls_through(self):
    sent = []
    s = server()
    s.register_tool("t", lambda a, c: c.notify({"method": "notifications/progress"}) or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(notify=sent.append))
    assert sent == [{"method": "notifications/progress"}]

  def test_send_list_changed_helpers_emit_on_stream(self):
    sent = []
    s = server()

    def emitter(_a, c):
      c.send_tool_list_changed()
      c.send_prompt_list_changed()
      c.send_resource_list_changed()
      return {"content": []}

    s.register_tool("t", emitter)
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(notify=sent.append))
    assert [m["method"] for m in sent] == [
      "notifications/tools/list_changed",
      "notifications/prompts/list_changed",
      "notifications/resources/list_changed",
    ]

  def test_send_resource_updated_carries_params(self):
    sent = []
    s = server()
    s.register_tool("t", lambda a, c: c.send_resource_updated({"uri": "file:///x"}) or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(notify=sent.append))
    upd = next(m for m in sent if m["method"] == "notifications/resources/updated")
    assert upd["params"] == {"uri": "file:///x"}

  def test_notify_subscribers_calls_through(self):
    fanned = []
    s = server()
    s.register_tool(
      "t",
      lambda a, c: c.notify_subscribers({"method": "notifications/resources/updated"}) or {"content": []},
    )
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx(notify_subscribers=fanned.append))
    assert fanned == [{"method": "notifications/resources/updated"}]


# ── miscellaneous direct-construction sanity ──────────────────────────────────


class TestDirectConstruction:
  def test_tool_context_is_a_dataclass_instance(self):
    s = server()
    captured = {}
    s.register_tool("t", lambda a, c: captured.update({"ctx": c}) or {"content": []})
    s.dispatch("tools/call", {"name": "t", "arguments": {}}, ctx())
    assert isinstance(captured["ctx"], ToolContext)

  def test_has_tool_reports_registration(self):
    s = server()
    assert s.has_tool("x") is False
    s.register_tool("x", lambda a, c: {"content": []})
    assert s.has_tool("x") is True

  def test_default_page_size_is_50(self):
    s = server()  # default page_size
    for i in range(51):
      s.register_tool(f"t{i:02d}", lambda a, c: {})
    r = s.dispatch("tools/list", {}, ctx())
    assert len(r["tools"]) == 50 and "nextCursor" in r
