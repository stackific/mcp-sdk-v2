"""MCP server runtime (2026-07-28, stateless) — the embeddable counterpart to the
client host. It supplies the method dispatcher and a registration API for tools,
resources, resource templates, prompts, and completion, built on the SDK's protocol
primitives (discovery, error codes, pagination).

Statelessness (§4.4, §7.6): there is no session. Each request is self-contained; its
context is derived solely from the request's own ``_meta``, never from the connection.

Scope of this port: the dispatcher core and the read/list/call feature methods. Three
features are injected or deferred so this module stays free of not-yet-ported
dependencies, each a clean seam:

* **JSON-Schema validation** of ``tools/call`` arguments/output is performed by an
  injected ``value_validator`` (defaults to a permissive no-op). The real validator
  lands with ``mcp.protocol.tools``.
* the **Tasks** extension (``tasks/*``) and the **§11 input_required** multi-round-trip
  loop are deferred to their own phases; until then ``tasks/*`` is method-not-found.
"""

from __future__ import annotations

import base64
import json
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass, field

from mcp.protocol.discovery import DiscoverConfig, build_discover_result
from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  METHOD_NOT_FOUND_CODE,
)
from mcp.protocol.meta import CURRENT_PROTOCOL_VERSION
from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE
from mcp.protocol.multi_round_trip import build_input_required_result
from mcp.protocol.tasks import (
  TASK_MISSING_CAPABILITY_CODE,
  build_tasks_missing_capability_error,
)

#: Log severities in ascending order (mirrors §15.3).
LOG_LEVELS = ("debug", "info", "notice", "warning", "error", "critical", "alert", "emergency")

#: resultType discriminator for a task-augmented (CreateTask) result (§25.3).
TASK_RESULT_TYPE = "task"

#: A value validator returns ``(valid, errors)``. The default accepts everything; the
#: real JSON-Schema validator is injected once ``mcp.protocol.tools`` is ported.
ValueValidator = Callable[[dict, object], "tuple[bool, list[str]]"]


def _permissive_validator(_schema: dict, _value: object) -> tuple[bool, list[str]]:
  return True, []


class CancelSignal:
  """A cooperative cancellation signal handed to a tool via :attr:`ToolContext.signal`.

  Mirrors the browser ``AbortSignal`` the TS SDK uses: a tool polls
  :attr:`aborted` between steps, or sleeps interruptibly with :meth:`wait`. The
  transport calls :meth:`abort` when the client sends ``notifications/cancelled``
  referencing the in-flight request id (§15.2).
  """

  def __init__(self) -> None:
    self._event = threading.Event()

  @property
  def aborted(self) -> bool:
    """``True`` once the request has been cancelled."""
    return self._event.is_set()

  def abort(self) -> None:
    """Mark the request cancelled (idempotent)."""
    self._event.set()

  def wait(self, timeout: float) -> bool:
    """Sleep up to ``timeout`` seconds, returning early ``True`` if aborted meanwhile."""
    return self._event.wait(timeout)


class InputRequired(Exception):
  """Raised by a tool's ``elicit_input``/``create_message``/``list_roots`` when the
  matching client input is not yet available — caught by :class:`McpServer` and
  converted into an ``input_required`` result for the §11 retry loop.
  """

  def __init__(self, key: str, request: dict) -> None:
    super().__init__(key)
    self.key = key
    self.request = request


class _InputCollector:
  """Maps a tool's input solicitations to responses the client already supplied (via
  ``requestState`` + ``inputResponses``), or raises :class:`InputRequired` for the
  first one not yet answered. Keys are a stable per-call-site counter (§11).
  """

  def __init__(self, accumulated: dict) -> None:
    self._accumulated = accumulated
    self._index = 0

  def solicit(self, method: str, params: dict) -> dict:
    self._index += 1
    key = f"in-{self._index}"
    if key in self._accumulated:
      return self._accumulated[key]
    raise InputRequired(key, {"method": method, "params": params})


def _encode_request_state(accumulated: dict) -> str:
  """Encode the accumulated input responses as an opaque base64 continuation token (§11.3)."""
  return base64.b64encode(json.dumps(accumulated).encode("utf-8")).decode("ascii")


def _decode_request_state(state: str) -> dict:
  """Decode an opaque ``requestState`` token back to accumulated responses; ``{}`` on failure."""
  try:
    decoded = json.loads(base64.b64decode(state.encode("ascii")).decode("utf-8"))
    return decoded if isinstance(decoded, dict) else {}
  except (ValueError, TypeError):
    return {}


class ServerError(Exception):
  """A JSON-RPC protocol error a handler may raise; it becomes a wire ``error`` object.

  Distinct from a tool error (a successful result with ``isError: true``).
  """

  def __init__(self, code: int, message: str, data: object = None) -> None:
    super().__init__(message)
    self.code = code
    self.data = data


@dataclass
class ServerRequestContext:
  """Per-request context the transport hands the dispatcher (one per request)."""

  #: The negotiated protocol revision for this exchange.
  protocol_version: str
  #: The JSON-RPC id of the originating request.
  request_id: str | int
  #: The request's ``params._meta`` (carries ``progressToken``, trace context, …).
  meta: dict = field(default_factory=dict)
  #: Emits a notification on this request's stream (no-op by default).
  notify: Callable[[dict], None] = lambda _n: None
  #: Aborts when the client cancels this request (``notifications/cancelled``, §15.2).
  signal: CancelSignal = field(default_factory=CancelSignal)
  #: Transport-resolved caller identity (e.g. a validated bearer token), if any.
  auth_info: object = None
  #: Broadcasts a change notification to active subscription streams (§10.5/§10.6).
  notify_subscribers: Callable[[dict], None] = lambda _n: None


@dataclass
class ToolContext:
  """The ergonomic context passed to every tool handler."""

  meta: dict
  progress_token: str | int | None
  task_requested: bool
  task_ttl_ms: int | None
  notify: Callable[[dict], None]
  log: Callable[[str, str], None]
  #: Cancellation signal — a tool polls ``signal.aborted`` / sleeps via ``signal.wait``.
  signal: CancelSignal = field(default_factory=CancelSignal)
  #: Validated caller identity threaded from the auth gate (``ctx.auth_info``), if any.
  auth_info: object = None
  #: Solicit structured user input (§11/§20). Returns the supplied response or raises
  #: :class:`InputRequired` for the §11 retry loop.
  elicit_input: Callable[[dict], dict] = lambda _p: {}
  #: Borrow the client's model (§11/§21 sampling, Deprecated).
  create_message: Callable[[dict], dict] = lambda _p: {}
  #: Request the client's workspace roots (§11/§21 roots, Deprecated).
  list_roots: Callable[[], dict] = lambda: {}
  #: Broadcast a change notification to all matching subscription streams (§10.5/§10.6).
  notify_subscribers: Callable[[dict], None] = lambda _n: None
  #: Emit ``notifications/tools/list_changed`` on this request's stream (§16.9).
  send_tool_list_changed: Callable[[], None] = lambda: None
  #: Emit ``notifications/prompts/list_changed`` on this request's stream (§18.6).
  send_prompt_list_changed: Callable[[], None] = lambda: None
  #: Emit ``notifications/resources/list_changed`` on this request's stream (§17.7).
  send_resource_list_changed: Callable[[], None] = lambda: None
  #: Emit ``notifications/resources/updated`` on this request's stream (§17.7).
  send_resource_updated: Callable[[dict], None] = lambda _p: None


# ── Internal registration records ─────────────────────────────────────────────

@dataclass
class _Tool:
  name: str
  handler: Callable[[dict, ToolContext], dict]
  input_schema: dict | None = None
  output_schema: dict | None = None
  title: str | None = None
  description: str | None = None
  annotations: dict | None = None
  execution: dict | None = None


@dataclass
class _Resource:
  name: str
  uri: str
  read: Callable[[str], dict]
  title: str | None = None
  description: str | None = None
  mime_type: str | None = None


@dataclass
class _Template:
  name: str
  uri_template: str
  read: Callable[[str, dict], dict]
  title: str | None = None
  description: str | None = None
  mime_type: str | None = None
  complete: dict | None = None


@dataclass
class _Prompt:
  name: str
  handler: Callable[[dict], dict]
  title: str | None = None
  description: str | None = None
  arguments: list[dict] | None = None


class McpServer:
  """The stateless MCP method dispatcher + feature registry (§4.4, §5–§19)."""

  def __init__(
    self,
    info: dict,
    capabilities: dict | None = None,
    *,
    page_size: int = 50,
    cache_ttl_ms: int = 0,
    cache_scope: str = "private",
    value_validator: ValueValidator | None = None,
  ) -> None:
    self.info = info
    self.capabilities = capabilities or {}
    self._tools: dict[str, _Tool] = {}
    self._resources: dict[str, _Resource] = {}
    self._templates: list[_Template] = []
    self._prompts: dict[str, _Prompt] = {}
    self._log_level = "info"
    self._page_size = page_size
    self._cache_ttl_ms = cache_ttl_ms
    self._cache_scope = cache_scope
    self._validate = value_validator or _permissive_validator
    self._task_store: object | None = None
    self._task_notifier: Callable[[dict], None] | None = None

  # ── tasks wiring (§25) ──
  def set_task_store(self, store: object) -> None:
    """Attach the Tasks-extension store; wires its update listener → ``notifications/tasks``."""
    self._task_store = store
    setter = getattr(store, "set_update_listener", None)
    if callable(setter):
      setter(self._on_task_update)

  def set_task_notifier(self, notify: Callable[[dict], None]) -> None:
    """Wire the subscription fan-out used to deliver ``notifications/tasks`` pushes (§25.10)."""
    self._task_notifier = notify

  def _on_task_update(self, task: dict) -> None:
    if self._task_notifier is not None:
      self._task_notifier({"method": "notifications/tasks", "params": task})

  # ── registration ──
  def register_tool(
    self,
    name: str,
    handler: Callable[[dict, ToolContext], dict],
    *,
    input_schema: dict | None = None,
    output_schema: dict | None = None,
    title: str | None = None,
    description: str | None = None,
    annotations: dict | None = None,
    execution: dict | None = None,
  ) -> None:
    self._tools[name] = _Tool(
      name, handler, input_schema, output_schema, title, description, annotations, execution
    )

  def register_resource(
    self,
    name: str,
    uri: str,
    read: Callable[[str], dict],
    *,
    title: str | None = None,
    description: str | None = None,
    mime_type: str | None = None,
  ) -> None:
    self._resources[uri] = _Resource(name, uri, read, title, description, mime_type)

  def register_resource_template(
    self,
    name: str,
    uri_template: str,
    read: Callable[[str, dict], dict],
    *,
    title: str | None = None,
    description: str | None = None,
    mime_type: str | None = None,
    complete: dict | None = None,
  ) -> None:
    self._templates.append(_Template(name, uri_template, read, title, description, mime_type, complete))

  def register_prompt(
    self,
    name: str,
    handler: Callable[[dict], dict],
    *,
    title: str | None = None,
    description: str | None = None,
    arguments: list[dict] | None = None,
  ) -> None:
    self._prompts[name] = _Prompt(name, handler, title, description, arguments)

  def has_tool(self, name: str) -> bool:
    return name in self._tools

  @property
  def min_log_level(self) -> str:
    return self._log_level

  # ── helpers ──
  def _as_complete(self, result: dict) -> dict:
    """Stamp the REQUIRED ``resultType`` discriminator (§3.6), preserving any set value."""
    return {"resultType": RESULT_TYPE_COMPLETE, **result}

  def _with_cacheable_hints(self, result: dict) -> dict:
    """Add ``resultType`` + the REQUIRED top-level caching hints (``ttlMs``,
    ``cacheScope``, §13.4) without overriding hints a handler set explicitly.
    """
    out = {"resultType": RESULT_TYPE_COMPLETE, **result}
    out.setdefault("ttlMs", self._cache_ttl_ms)
    out.setdefault("cacheScope", self._cache_scope)
    return out

  def _require_capability(self, capability: str, method: str) -> None:
    """Capability gating (§6.4): a server MUST NOT answer a request for a capability it
    did not advertise. Raises ``-32601``.
    """
    if self.capabilities.get(capability) is None:
      raise ServerError(
        METHOD_NOT_FOUND_CODE,
        f'Method not found: {method} (the "{capability}" capability is not advertised)',
      )

  # ── dispatch ──
  def dispatch(self, method: str, params: dict, ctx: ServerRequestContext) -> dict:
    """Route one JSON-RPC request to its handler, returning the ``result`` payload.

    :raises ServerError: for protocol-level failures (method-not-found, invalid params).
    """
    if method == "initialize":
      return self._initialize(params)
    if method == "ping":
      return {}
    if method == "logging/setLevel":
      level = params.get("level")
      if isinstance(level, str):
        self._log_level = level
      return {}
    if method == "server/discover":
      return self._discover()
    if method == "tools/list":
      self._require_capability("tools", method)
      return self._list_tools(params)
    if method == "tools/call":
      self._require_capability("tools", method)
      return self._call_tool(params, ctx)
    if method == "resources/list":
      self._require_capability("resources", method)
      return self._list_resources(params)
    if method == "resources/templates/list":
      self._require_capability("resources", method)
      return self._list_resource_templates(params)
    if method == "resources/read":
      self._require_capability("resources", method)
      return self._read_resource(params)
    if method == "prompts/list":
      self._require_capability("prompts", method)
      return self._list_prompts(params)
    if method == "prompts/get":
      self._require_capability("prompts", method)
      return self._get_prompt(params)
    if method == "completion/complete":
      self._require_capability("completions", method)
      return self._complete(params)
    if method == "tasks/get":
      # §25.7: a GetTaskResult is the DetailedTask (with inline outcome) + resultType.
      return self._task_op(method, params, lambda store, tid: self._as_complete(store.get_detailed(tid)))
    if method == "tasks/cancel":
      return self._task_op(method, params, lambda store, tid: self._cancel_task(store, tid))
    if method == "tasks/update":
      # §25.8: supply input to an input_required task, then return its DetailedTask.
      return self._task_op(method, params, lambda store, tid: self._update_task(store, tid, params))
    raise ServerError(METHOD_NOT_FOUND_CODE, f"Method not found: {method}")

  def _initialize(self, params: dict) -> dict:
    """Legacy ``initialize`` handshake (back-compat probe). Echoes the requested revision so
    any client accepts it; the server itself targets ``CURRENT_PROTOCOL_VERSION`` (§9.12).
    """
    requested = params.get("protocolVersion")
    return {
      "protocolVersion": requested if isinstance(requested, str) else CURRENT_PROTOCOL_VERSION,
      "capabilities": self.capabilities,
      "serverInfo": self.info,
    }

  def _task_op(self, method: str, params: dict, op: Callable[[object, str], dict]) -> dict:
    """Run a Tasks operation, enforcing capability (§25.2) and a valid ``taskId`` (§25.7)."""
    if self._task_store is None:
      raise ServerError(
        TASK_MISSING_CAPABILITY_CODE,
        f"Tasks extension not supported (required for {method})",
        build_tasks_missing_capability_error(method)["data"],
      )
    task_id = params.get("taskId")
    if not isinstance(task_id, str):
      raise ServerError(INVALID_PARAMS_CODE, "taskId (string) is required")
    return op(self._task_store, task_id)

  def _cancel_task(self, store: object, task_id: str) -> dict:
    store.cancel(task_id)
    return self._as_complete(store.get_detailed(task_id))

  def _update_task(self, store: object, task_id: str, params: dict) -> dict:
    store.apply_input(task_id, params.get("inputResponses") or {})
    return self._as_complete(store.get_detailed(task_id))

  def _discover(self) -> dict:
    return build_discover_result(
      DiscoverConfig(
        supported_versions=[CURRENT_PROTOCOL_VERSION],
        capabilities=self.capabilities,
        server_info=dict(self.info),
      )
    )

  # ── pagination ──
  def _paginate(self, items: list, key: str, params: dict) -> dict:
    offset = 0
    cursor = params.get("cursor")
    if isinstance(cursor, str) and cursor:
      offset = _decode_cursor_offset(cursor)
      if offset is None or offset < 0 or offset > len(items):
        raise ServerError(INVALID_PARAMS_CODE, "Invalid pagination cursor")
    page = items[offset : offset + self._page_size]
    out: dict = {key: page}
    next_offset = offset + self._page_size
    if next_offset < len(items):
      out["nextCursor"] = _encode_cursor_offset(next_offset)
    return out

  # ── tools ──
  def _list_tools(self, params: dict) -> dict:
    tools = []
    for t in self._tools.values():
      entry: dict = {"name": t.name, "inputSchema": t.input_schema or {"type": "object"}}
      if t.title:
        entry["title"] = t.title
      if t.description:
        entry["description"] = t.description
      if t.output_schema:
        entry["outputSchema"] = t.output_schema
      if t.annotations:
        entry["annotations"] = t.annotations
      if t.execution:
        entry["execution"] = t.execution
      tools.append(entry)
    return self._with_cacheable_hints(self._paginate(tools, "tools", params))

  def _call_tool(self, params: dict, ctx: ServerRequestContext) -> dict:
    name = params.get("name")
    if not isinstance(name, str) or name not in self._tools:
      raise ServerError(INVALID_PARAMS_CODE, f"Unknown tool: {name}")
    tool = self._tools[name]
    args = params.get("arguments") or {}

    # A schema violation is a PROTOCOL error (-32602), not a tool error.
    if tool.input_schema is not None:
      valid, errors = self._validate(tool.input_schema, args)
      if not valid:
        raise ServerError(INVALID_PARAMS_CODE, f"Invalid arguments for {name}: {'; '.join(errors)}")

    task_param = params.get("task")

    # §11 multi-round-trip: a tool solicits client input (elicitation/sampling/roots) by
    # returning an input_required result resolved by client RETRY — never a server-initiated
    # request. The collector replays responses the client already supplied (echoed
    # requestState plus this round's inputResponses); the first unanswered solicitation
    # raises InputRequired, which we convert into the input_required result to retry against.
    input_responses = params.get("inputResponses") or {}
    prior = _decode_request_state(params["requestState"]) if isinstance(params.get("requestState"), str) else {}
    accumulated = {**prior, **input_responses}
    collector = _InputCollector(accumulated)

    try:
      result = tool.handler(_apply_defaults(args, tool.input_schema), self._tool_context(ctx, task_param, collector))
    except InputRequired as needed:
      return build_input_required_result({needed.key: needed.request}, _encode_request_state(accumulated))

    # Validate declared outputSchema against returned structuredContent (§16.5/§16.6).
    if (
      tool.output_schema is not None
      and result.get("structuredContent") is not None
      and result.get("isError") is not True
    ):
      valid, errors = self._validate(tool.output_schema, result["structuredContent"])
      if not valid:
        raise ServerError(
          INTERNAL_ERROR_CODE,
          f'Tool "{name}" produced structuredContent that violates its outputSchema: '
          f"{'; '.join(errors)}",
        )

    # A task-augmented call returns a handle (resultType "task"); otherwise "complete".
    if result.get("task") is not None:
      return {"resultType": TASK_RESULT_TYPE, **result["task"]}
    return self._as_complete(result)

  def _tool_context(
    self, ctx: ServerRequestContext, task_param: dict | None, collector: _InputCollector | None = None
  ) -> ToolContext:
    progress_token = ctx.meta.get("progressToken")
    server = self
    collect = collector or _InputCollector({})

    def _log(level: str, message: str) -> None:
      # §15.3: only emit a log at or above the server's current minimum level.
      if LOG_LEVELS.index(level) < LOG_LEVELS.index(server._log_level):
        return
      ctx.notify(
        {"method": "notifications/message", "params": {"level": level, "logger": server.info.get("name"), "data": message}}
      )

    return ToolContext(
      meta=ctx.meta,
      progress_token=progress_token,
      task_requested=task_param is not None,
      task_ttl_ms=(task_param or {}).get("ttl"),
      notify=ctx.notify,
      log=_log,
      signal=ctx.signal,
      auth_info=ctx.auth_info,
      # §11: solicit client input via the input_required + retry mechanism (NOT a
      # server-initiated request); each returns the supplied response or raises InputRequired.
      elicit_input=lambda p: collect.solicit("elicitation/create", p),
      create_message=lambda p: collect.solicit("sampling/createMessage", p),
      list_roots=lambda: collect.solicit("roots/list", {}),
      notify_subscribers=ctx.notify_subscribers,
      send_tool_list_changed=lambda: ctx.notify({"method": "notifications/tools/list_changed"}),
      send_prompt_list_changed=lambda: ctx.notify({"method": "notifications/prompts/list_changed"}),
      send_resource_list_changed=lambda: ctx.notify({"method": "notifications/resources/list_changed"}),
      send_resource_updated=lambda p: ctx.notify({"method": "notifications/resources/updated", "params": p}),
    )

  # ── resources ──
  def _list_resources(self, params: dict) -> dict:
    resources = []
    for r in self._resources.values():
      entry: dict = {"uri": r.uri, "name": r.name}
      if r.title:
        entry["title"] = r.title
      if r.description:
        entry["description"] = r.description
      if r.mime_type:
        entry["mimeType"] = r.mime_type
      resources.append(entry)
    return self._with_cacheable_hints(self._paginate(resources, "resources", params))

  def _list_resource_templates(self, params: dict) -> dict:
    templates = []
    for t in self._templates:
      entry: dict = {"uriTemplate": t.uri_template, "name": t.name}
      if t.title:
        entry["title"] = t.title
      if t.description:
        entry["description"] = t.description
      if t.mime_type:
        entry["mimeType"] = t.mime_type
      templates.append(entry)
    return self._with_cacheable_hints(self._paginate(templates, "resourceTemplates", params))

  def _read_resource(self, params: dict) -> dict:
    uri = params.get("uri")
    if not isinstance(uri, str):
      raise ServerError(INVALID_PARAMS_CODE, "resources/read requires a string uri")
    direct = self._resources.get(uri)
    if direct is not None:
      return self._read_result(uri, direct.read(uri))
    for tpl in self._templates:
      variables = _match_template(tpl.uri_template, uri)
      if variables is not None:
        return self._read_result(uri, tpl.read(uri, variables))
    raise ServerError(INVALID_PARAMS_CODE, f"Resource not found: {uri}", {"uri": uri})

  def _read_result(self, uri: str, read: dict) -> dict:
    contents = read.get("contents")
    # §17.5: a read of an existing resource MUST return ≥1 content entry.
    if not isinstance(contents, list) or len(contents) == 0:
      raise ServerError(INTERNAL_ERROR_CODE, f'resources/read of "{uri}" returned no contents (§17.5)')
    return self._with_cacheable_hints(read)

  # ── prompts ──
  def _list_prompts(self, params: dict) -> dict:
    prompts = []
    for p in self._prompts.values():
      entry: dict = {"name": p.name}
      if p.title:
        entry["title"] = p.title
      if p.description:
        entry["description"] = p.description
      if p.arguments:
        entry["arguments"] = [
          {
            "name": a["name"],
            **({"description": a["description"]} if a.get("description") else {}),
            **({"required": a["required"]} if a.get("required") else {}),
          }
          for a in p.arguments
        ]
      prompts.append(entry)
    return self._with_cacheable_hints(self._paginate(prompts, "prompts", params))

  def _get_prompt(self, params: dict) -> dict:
    name = params.get("name")
    if not isinstance(name, str) or name not in self._prompts:
      raise ServerError(INVALID_PARAMS_CODE, f"Unknown prompt: {name}")
    prompt = self._prompts[name]
    args = params.get("arguments") or {}
    # §18.4: a missing REQUIRED argument is a protocol error, not a render.
    for arg in prompt.arguments or []:
      if arg.get("required") and not args.get(arg["name"]):
        raise ServerError(INVALID_PARAMS_CODE, f'Missing required argument "{arg["name"]}" for prompt "{name}"')
    rendered = prompt.handler(args)
    out: dict = {"messages": rendered["messages"]}
    if prompt.description:
      out = {"description": prompt.description, **out}
    return self._as_complete(out)

  # ── completion ──
  def _complete(self, params: dict) -> dict:
    ref = params.get("ref") or {}
    argument = params.get("argument") or {}
    value = argument.get("value", "")
    arg_name = argument.get("name")
    values: list[str] = []

    # §19.5: an unknown prompt/template/argument or out-of-union ref.type → -32602.
    if ref.get("type") == "ref/prompt":
      prompt = self._prompts.get(ref.get("name"))
      if prompt is None:
        raise ServerError(INVALID_PARAMS_CODE, f"Unknown prompt for completion: {ref.get('name')}")
      arg = next((a for a in (prompt.arguments or []) if a["name"] == arg_name), None)
      if arg is None:
        raise ServerError(INVALID_PARAMS_CODE, f'Unknown argument "{arg_name}" for prompt "{ref.get("name")}"')
      if arg.get("complete"):
        values = arg["complete"](value)
    elif ref.get("type") == "ref/resource":
      tpl = next((t for t in self._templates if t.uri_template == ref.get("uri")), None)
      if tpl is None:
        raise ServerError(INVALID_PARAMS_CODE, f"Unknown resource template for completion: {ref.get('uri')}")
      fn = (tpl.complete or {}).get(arg_name) if arg_name else None
      if fn is None:
        raise ServerError(INVALID_PARAMS_CODE, f'Unknown argument "{arg_name}" for template "{ref.get("uri")}"')
      values = fn(value)
    else:
      raise ServerError(INVALID_PARAMS_CODE, f"Invalid completion ref.type: {ref.get('type')}")

    capped = values[:100]
    return self._as_complete(
      {"completion": {"values": capped, "total": len(values), "hasMore": len(values) > len(capped)}}
    )


# ─── module helpers ───────────────────────────────────────────────────────────

def _encode_cursor_offset(offset: int) -> str:
  """Encode a numeric offset as an opaque base64 pagination cursor (§12.1)."""
  return base64.b64encode(str(offset).encode("ascii")).decode("ascii")


def _decode_cursor_offset(cursor: str) -> int | None:
  """Decode an opaque cursor back to an offset; ``None`` when undecodable."""
  try:
    # binascii.Error (invalid base64) and UnicodeDecodeError both subclass ValueError,
    # as does int() on non-numeric text — one except clause covers every failure.
    return int(base64.b64decode(cursor.encode("ascii")).decode("ascii"))
  except ValueError:
    return None


def _apply_defaults(args: dict, schema: dict | None) -> dict:
  """Apply top-level JSON-Schema ``default``s to absent arguments."""
  if not schema or not isinstance(schema.get("properties"), dict):
    return args
  out = dict(args)
  for key, prop in schema["properties"].items():
    if out.get(key) is None and isinstance(prop, dict) and "default" in prop:
      out[key] = prop["default"]
  return out


def _match_template(template: str, uri: str) -> dict | None:
  """Match a concrete URI against an RFC 6570 ``{var}`` template; captured vars or ``None``."""
  names: list[str] = []

  def _sub(match: re.Match) -> str:
    names.append(match.group(1))
    return "([^/]+)"

  # Escape regex metacharacters except the template braces, then turn {var} into a group.
  escaped = re.sub(r"([.*+?^${}()|\[\]\\])", lambda m: m.group(1) if m.group(1) in "{}" else "\\" + m.group(1), template)
  pattern = "^" + re.sub(r"\{([^}]+)\}", _sub, escaped) + "$"
  match = re.match(pattern, uri)
  if match is None:
    return None
  return {name: match.group(i + 1) for i, name in enumerate(names)}
