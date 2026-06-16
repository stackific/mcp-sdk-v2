"""End-to-end tests for the in-memory Client↔McpServer harness.

These build a small but complete :class:`~mcp.server.server.McpServer` (a tool, a
resource, a prompt, and matching capabilities), connect a real
:class:`~mcp.client.client.Client` through :func:`mcp.testing.connect_in_memory`, and
assert the whole request/response path runs in-process: discovery, list/call tools,
read resource, get prompt — plus the error path (an unknown tool surfacing as a
:class:`~mcp.client.client.RequestError`).
"""

from __future__ import annotations

import pytest

from mcp.client.client import Client, RequestError
from mcp.client.transport import ClientTransportError
from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.server.server import McpServer
from mcp.testing import InMemoryClientTransport, connect_in_memory
from mcp.testing.in_memory import InMemoryClientTransport as DirectImport

SERVER_INFO = {"name": "in-memory-srv", "version": "1.0"}
CLIENT_INFO = {"name": "in-memory-cli", "version": "0.1"}
SERVER_CAPS = {"tools": {}, "resources": {}, "prompts": {}}
CLIENT_CAPS = {"tools": {}, "resources": {}, "prompts": {}}


def build_server() -> McpServer:
  """A minimal server exercising every feature method the tests drive."""
  server = McpServer(SERVER_INFO, SERVER_CAPS)

  # A tool that echoes its single argument back as text content.
  server.register_tool(
    "echo",
    lambda args, ctx: {"content": [{"type": "text", "text": args.get("msg", "")}]},
    description="Echo the msg argument.",
  )

  # A concrete (non-template) resource returning a fixed text body.
  server.register_resource(
    "greeting",
    "mem://greeting",
    lambda uri: {"contents": [{"uri": uri, "mimeType": "text/plain", "text": "hello"}]},
    description="A static greeting.",
  )

  # A prompt that renders one user message interpolating a required argument.
  server.register_prompt(
    "greet",
    lambda args: {"messages": [{"role": "user", "content": {"type": "text", "text": f"Hi {args['name']}"}}]},
    description="Greet someone by name.",
    arguments=[{"name": "name", "required": True}],
  )

  return server


def build_client(**kwargs) -> Client:
  """A client connected to a freshly built server over the in-memory harness."""
  return connect_in_memory(build_server(), CLIENT_INFO, capabilities=CLIENT_CAPS, **kwargs)


class TestPackageSurface:
  """The harness's public names are exported and refer to the same objects."""

  def test_exports_are_re_exported_from_package(self):
    # The convenience factory and the transport are both importable from the package
    # root and from the module, and resolve to the same class.
    assert DirectImport is InMemoryClientTransport

  def test_transport_is_a_client_transport(self):
    from mcp.client.transport import ClientTransport

    assert issubclass(InMemoryClientTransport, ClientTransport)


class TestConnect:
  """connect_in_memory wires and (by default) connects the client."""

  def test_returns_connected_client_after_discovery(self):
    client = build_client()
    assert isinstance(client, Client)
    # discover() ran, so the client negotiated a revision and cached server status.
    assert client.connected
    assert client.negotiated_version == "2026-07-28"
    assert client.server_info == SERVER_INFO
    assert client.server_capabilities == SERVER_CAPS

  def test_discover_false_leaves_client_unconnected(self):
    client = build_client(discover=False)
    assert not client.connected
    assert client.negotiated_version is None
    assert client.server_info is None
    # …and discovery can still be driven by hand against the same in-process server.
    result = client.discover()
    assert result["serverInfo"] == SERVER_INFO
    assert client.connected

  def test_client_capabilities_threaded_through(self):
    client = build_client()
    assert client.capabilities == CLIENT_CAPS
    assert client.server_supports("tools")
    assert client.server_supports("resources")
    assert client.server_supports("prompts")

  def test_protocol_versions_override_is_honoured(self):
    # An unsupported preferred revision means discovery negotiates nothing in common.
    client = connect_in_memory(
      build_server(), CLIENT_INFO, capabilities=CLIENT_CAPS, protocol_versions=["1999-01-01"]
    )
    assert client.preferred_versions == ["1999-01-01"]
    assert client.negotiated_version is None  # no shared revision → not connected
    assert not client.connected


class TestFeatureMethodsEndToEnd:
  """Every read/list/call path runs through the live server in-process."""

  def test_ping(self):
    assert build_client().ping() == {}

  def test_list_tools(self):
    tools = build_client().list_tools()
    names = {t["name"] for t in tools["tools"]}
    assert names == {"echo"}
    assert tools["tools"][0]["description"] == "Echo the msg argument."

  def test_call_tool(self):
    result = build_client().call_tool("echo", {"msg": "in-memory"})
    assert result["content"][0]["text"] == "in-memory"

  def test_call_tool_empty_arguments_uses_default(self):
    # The echo tool defaults msg to "" when omitted; the call still completes.
    result = build_client().call_tool("echo")
    assert result["content"][0]["text"] == ""

  def test_list_resources(self):
    resources = build_client().list_resources()
    entry = resources["resources"][0]
    assert entry["uri"] == "mem://greeting"
    assert entry["name"] == "greeting"

  def test_read_resource(self):
    result = build_client().read_resource("mem://greeting")
    content = result["contents"][0]
    assert content["uri"] == "mem://greeting"
    assert content["text"] == "hello"

  def test_list_prompts(self):
    prompts = build_client().list_prompts()
    entry = prompts["prompts"][0]
    assert entry["name"] == "greet"
    assert entry["arguments"] == [{"name": "name", "required": True}]

  def test_get_prompt(self):
    result = build_client().get_prompt("greet", {"name": "Ada"})
    assert result["description"] == "Greet someone by name."
    assert result["messages"][0]["content"]["text"] == "Hi Ada"


class TestErrorPaths:
  """Delivered JSON-RPC errors surface as RequestError; channel misuse as transport error."""

  def test_unknown_tool_raises_request_error(self):
    with pytest.raises(RequestError) as exc:
      build_client().call_tool("does-not-exist")
    # An unknown tool is invalid params (-32602), not an internal/transport failure.
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_missing_required_prompt_argument_raises_request_error(self):
    with pytest.raises(RequestError) as exc:
      build_client().get_prompt("greet")  # 'name' is required
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_unknown_resource_raises_request_error(self):
    with pytest.raises(RequestError) as exc:
      build_client().read_resource("mem://missing")
    assert exc.value.code == INVALID_PARAMS_CODE

  def test_uncapability_gated_method_when_not_advertised(self):
    # A server advertising only 'tools' must refuse a resources/* request (-32601).
    server = McpServer(SERVER_INFO, {"tools": {}})
    server.register_tool("echo", lambda args, ctx: {"content": []})
    client = connect_in_memory(server, CLIENT_INFO, capabilities=CLIENT_CAPS)
    with pytest.raises(RequestError) as exc:
      client.read_resource("mem://greeting")
    assert exc.value.code == -32601

  def test_transport_raises_on_non_request_message(self):
    # Driving the transport directly with a notification yields no response → channel error.
    transport = InMemoryClientTransport(build_server())
    with pytest.raises(ClientTransportError):
      transport.request({"jsonrpc": "2.0", "method": "notifications/cancelled"})


class TestSharedServerReference:
  """The transport holds the server by reference, so late registrations are visible."""

  def test_tool_registered_after_connect_is_callable(self):
    server = build_server()
    client = connect_in_memory(server, CLIENT_INFO, capabilities=CLIENT_CAPS)
    # Register a new tool *after* the client connected; it must be reachable in-process.
    server.register_tool("late", lambda args, ctx: {"content": [{"type": "text", "text": "late!"}]})
    assert client.call_tool("late")["content"][0]["text"] == "late!"


# ─── TS-test parity: discover → paginate → call → server→client elicitation ──────
# The authoritative TS in-memory test (ts-sdk/src/__tests__/testing/in-memory.test.ts)
# drives one end-to-end exchange: discover, paginate (pageSize 2 over 3 tools), call a
# tool, and run a server→client elicitation. In this SDK a server→client interaction is
# NOT a separate server-initiated request — it is embedded as an input request inside a
# result and resolved by client retry (the §11 MRTR mechanism; spec §7.5 / §11). So the
# Python harness exercises the same scenario through `request_with_input` over the single
# synchronous `request()` call, with the elicitation answered by a registered handler.

ELICIT_CLIENT_CAPS = {"tools": {}, "elicitation": {}}


def build_mrtr_server(page_size: int = 2) -> McpServer:
  """Mirror the TS ``buildServer``: an ``add``, an ``echo``, and an ``ask`` (elicitation).

  ``ask`` solicits elicitation via ``ctx.elicit_input``; in the §11 model the server turns
  the first unanswered solicitation into an ``input_required`` result, which the client's
  ``request_with_input`` resolves through the registered ``elicitation/create`` handler and
  retries. ``page_size`` (default 2) over the three tools forces two pages of ``tools/list``.
  """
  server = McpServer(SERVER_INFO, {"tools": {}}, page_size=page_size)

  server.register_tool(
    "add",
    lambda args, ctx: {"content": [{"type": "text", "text": str(int(args["a"]) + int(args["b"]))}]},
    description="Add two numbers.",
  )
  server.register_tool(
    "echo",
    lambda args, ctx: {"content": [{"type": "text", "text": "echo"}]},
    description="Echo a fixed string.",
  )

  def ask_tool(args, ctx):
    # Solicit elicitation; resolved by the client and supplied back as the response dict.
    response = ctx.elicit_input({"mode": "form"})
    return {"content": [{"type": "text", "text": str(response.get("action"))}]}

  server.register_tool("ask", ask_tool, description="Ask the client to elicit input.")
  return server


class TestTsScenarioParity:
  """The single TS in-memory scenario, end-to-end through the Python harness."""

  def test_discovers_paginates_calls_and_elicits(self):
    server = build_mrtr_server(page_size=2)
    client = connect_in_memory(server, CLIENT_INFO, capabilities=ELICIT_CLIENT_CAPS)
    # The elicitation handler the §11 loop invokes for an `elicitation/create` input request.
    client.set_request_handler("elicitation/create", lambda params: {"action": "accept"})

    # discover() ran in connect_in_memory; the negotiated revision matches the TS assertion.
    assert client.negotiated_version == "2026-07-28"

    # pagination: page_size 2 over 3 tools → two pages; collect every tool name across pages.
    names: list[str] = []
    page = client.list_tools()
    names.extend(t["name"] for t in page["tools"])
    assert "nextCursor" in page  # first page is full, more to come
    page2 = client.list_tools(cursor=page["nextCursor"])
    names.extend(t["name"] for t in page2["tools"])
    assert sorted(names) == ["add", "ask", "echo"]
    assert "nextCursor" not in page2  # the second page is the last

    # tools/call: add(2, 3) → "5".
    summed = client.call_tool("add", {"a": 2, "b": 3})
    assert summed["content"][0]["text"] == "5"

    # `ask` solicits elicitation → input_required, fulfilled by the handler + retried.
    elicited = client.call_tool("ask")
    assert elicited["content"][0]["text"] == "accept"


class TestPaginationEndToEnd:
  """tools/list pagination runs through the live server's cursor mechanism."""

  def test_two_pages_cover_all_tools_without_overlap(self):
    server = build_mrtr_server(page_size=2)
    client = connect_in_memory(server, CLIENT_INFO, capabilities=ELICIT_CLIENT_CAPS)
    first = client.list_tools()
    assert len(first["tools"]) == 2
    cursor = first["nextCursor"]
    second = client.list_tools(cursor=cursor)
    assert len(second["tools"]) == 1
    first_names = {t["name"] for t in first["tools"]}
    second_names = {t["name"] for t in second["tools"]}
    assert first_names.isdisjoint(second_names)  # no tool appears on both pages
    assert first_names | second_names == {"add", "ask", "echo"}

  def test_single_page_when_page_size_covers_all(self):
    # A page_size >= tool count yields exactly one page and no cursor.
    server = build_mrtr_server(page_size=50)
    client = connect_in_memory(server, CLIENT_INFO, capabilities=ELICIT_CLIENT_CAPS)
    page = client.list_tools()
    assert {t["name"] for t in page["tools"]} == {"add", "ask", "echo"}
    assert "nextCursor" not in page


class TestElicitationViaMrtr:
  """A server→client elicitation resolved by the §11 input_required + retry loop."""

  def test_elicitation_response_flows_back_into_the_tool(self):
    server = build_mrtr_server()
    client = connect_in_memory(server, CLIENT_INFO, capabilities=ELICIT_CLIENT_CAPS)
    seen_params: list[dict] = []

    def handler(params):
      seen_params.append(params)
      return {"action": "decline"}

    client.set_request_handler("elicitation/create", handler)
    result = client.call_tool("ask")
    # The handler's response reached the tool, which echoed its `action`.
    assert result["content"][0]["text"] == "decline"
    # …and the tool's solicited params ({"mode": "form"}) reached the handler.
    assert seen_params == [{"mode": "form"}]

  def test_missing_elicitation_handler_raises_request_error(self):
    # With no handler registered for the solicited kind, the §11 loop fails loudly.
    server = build_mrtr_server()
    client = connect_in_memory(server, CLIENT_INFO, capabilities=ELICIT_CLIENT_CAPS)
    with pytest.raises(RequestError):
      client.call_tool("ask")

  def test_undeclared_elicitation_capability_surfaces_as_error(self):
    # Without the `elicitation` capability declared, the input_required kind is gated off
    # and discrimination yields an MRTR error rather than silently proceeding (R-11.5-k).
    server = build_mrtr_server()
    client = connect_in_memory(server, CLIENT_INFO, capabilities={"tools": {}})
    client.set_request_handler("elicitation/create", lambda params: {"action": "accept"})
    with pytest.raises(RequestError):
      client.call_tool("ask")
