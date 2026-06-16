"""Hosts the MCP *client* for the companion backend, built on the Python SDK
(``stackific-mcp``).

The SDK's :class:`~mcp.client.Client` owns the request/response lifecycle: it stamps
every request with the required ``_meta`` envelope, correlates responses over Streamable
HTTP, drives the §11 multi-round-trip loop (fulfilling elicitation / sampling / roots via
the handlers registered below), and surfaces inbound frames. We additionally tap every
wire frame and relay it to the debug bus for the SPA's "under the hood" view.
"""

from __future__ import annotations

import threading
import uuid

from mcp.client import Client, StreamableHttpClientTransport

from config import MCP_SERVER_URL
from debug_bus import bus
from elicitation import create_pending, wait_for
from sampling import sample

# The capabilities this client declares in every request's _meta. (Single source of truth.)
CLIENT_CAPABILITIES = {"elicitation": {"form": {}, "url": {}}, "sampling": {}, "roots": {}, "tasks": {}}
CLIENT_INFO = {"name": "companion-mcp-client", "title": "Companion MCP Client", "version": "0.1.0"}

_DEFAULT_ROOTS = [
  {"uri": "file:///workspace/companion-project", "name": "companion-project"},
  {"uri": "file:///workspace/shared-lib", "name": "shared-lib"},
]

# Module state: the live client + transport, the configured roots, and a per-thread
# "trace" tag so frames emitted while handling one frontend action can be grouped.
_state: dict = {"client": None, "transport": None, "roots": list(_DEFAULT_ROOTS)}
_local = threading.local()
_connect_lock = threading.Lock()


def _trace() -> str | None:
  return getattr(_local, "trace", None)


def _classify(message: dict) -> dict:
  """Map a JSON-RPC frame to its kind + a human summary (mirrors the TS wire view)."""
  if isinstance(message, dict):
    if "method" in message and "id" in message:
      return {"kind": "request", "method": message["method"], "id": message.get("id"), "summary": f"request → {message['method']}"}
    if "method" in message:
      return {"kind": "notification", "method": message["method"], "summary": f"notification {message['method']}"}
    if "result" in message:
      return {"kind": "response", "id": message.get("id"), "summary": f"result for #{message.get('id')}"}
    if "error" in message:
      err = message.get("error") or {}
      return {"kind": "error", "id": message.get("id"), "summary": f"error {err.get('code')}: {err.get('message')}"}
  return {"kind": "note", "summary": "message"}


def _tap(direction: str, message: dict) -> None:
  c = _classify(message)
  bus.emit_frame(
    {
      "dir": direction,
      "kind": c["kind"],
      "method": c.get("method"),
      "id": c.get("id"),
      "summary": c.get("summary"),
      "payload": message,
      "trace": _trace(),
    }
  )


# ── server→client request handlers (driven by the §11 MRTR loop) ──
def _handle_sampling(params: dict) -> dict:
  bus.emit_frame({"dir": "local", "kind": "note", "method": "sampling/createMessage", "summary": "client handling sampling → DeepSeek", "payload": params, "trace": _trace()})
  return sample(
    {"messages": params.get("messages"), "maxTokens": params.get("maxTokens"), "systemPrompt": params.get("systemPrompt")}
  )


def _handle_roots(_params: dict) -> dict:
  bus.emit_frame({"dir": "local", "kind": "note", "method": "roots/list", "summary": "client returning configured roots", "payload": {"roots": _state["roots"]}, "trace": _trace()})
  return {"roots": _state["roots"]}


def _handle_elicitation(params: dict) -> dict:
  pending_id = str(uuid.uuid4())
  mode = params.get("mode", "form")
  bus.emit_frame(
    {"dir": "recv", "kind": "elicitation", "method": "elicitation/create", "summary": f"server requests {mode} input → asking the user", "payload": {"pendingId": pending_id, "params": params}, "trace": _trace()}
  )
  pending = create_pending(pending_id, mode)
  result = wait_for(pending)
  bus.emit_frame({"dir": "local", "kind": "note", "method": "elicitation/create", "summary": f"user chose: {result.get('action')}", "payload": result, "trace": _trace()})
  return result


def _build_client() -> Client:
  transport = StreamableHttpClientTransport(MCP_SERVER_URL)
  client = Client(transport, CLIENT_INFO, capabilities=CLIENT_CAPABILITIES)
  client.set_frame_listener(_tap)
  client.set_request_handler("sampling/createMessage", _handle_sampling)
  client.set_request_handler("roots/list", _handle_roots)
  client.set_request_handler("elicitation/create", _handle_elicitation)
  _state["client"] = client
  _state["transport"] = transport
  return client


def ensure_connected() -> Client:
  """Build + discover the client on first use (idempotent). Discovery failures are
  swallowed; ``status.connected`` reflects the outcome.
  """
  client = _state["client"]
  if client is not None:
    return client
  with _connect_lock:
    if _state["client"] is not None:
      return _state["client"]
    client = _build_client()
    bus.emit_frame({"dir": "local", "kind": "lifecycle", "summary": f"connecting to {MCP_SERVER_URL}"})
    try:
      client.discover()
    except Exception as exc:  # noqa: BLE001 — unreachable server → connected stays False
      # Surface the failure type (not the raw exception text) on the wire view.
      bus.emit_frame({"dir": "local", "kind": "error", "summary": f"discover failed: {type(exc).__name__}"})
    bus.emit_frame({"dir": "local", "kind": "lifecycle", "summary": f"connected — protocol {client.negotiated_version or 'unknown'}"})
    return client


def reconnect() -> None:
  """Tear down any existing connection and connect fresh, driving a visible discover."""
  with _connect_lock:
    old = _state.get("transport")
    if old is not None:
      try:
        old.close()
      except Exception:  # noqa: BLE001 — ignore teardown errors
        pass
    _state["client"] = None
    _state["transport"] = None
  client = ensure_connected()
  with _trace_scope("reconnect"):
    try:
      client.discover()
    except Exception:  # noqa: BLE001
      pass


class _trace_scope:
  """Context manager setting the per-thread trace tag for grouping emitted frames."""

  def __init__(self, trace: str) -> None:
    self._trace = trace

  def __enter__(self) -> None:
    _local.trace = self._trace

  def __exit__(self, *_exc) -> None:
    _local.trace = None


def _with_trace(trace: str, fn):
  ensure_connected()
  with _trace_scope(trace):
    return fn()


def get_status() -> dict:
  client = _state["client"]
  if client is None:
    return {"connected": False, "negotiatedVersion": None, "serverInfo": None, "serverCapabilities": None, "serverExtensions": None, "clientCapabilities": CLIENT_CAPABILITIES, "roots": _state["roots"], "serverUrl": MCP_SERVER_URL}
  status = client.status()
  return {**status, "clientCapabilities": CLIENT_CAPABILITIES, "roots": _state["roots"], "serverUrl": MCP_SERVER_URL}


def get_roots() -> list[dict]:
  return _state["roots"]


def set_roots(roots: list[dict]) -> None:
  _state["roots"] = roots or []


def cancel(cancel_id: str) -> bool:
  client = _state["client"]
  return bool(client and client.cancel(cancel_id))


# ── the REST-facing capability surface ──
class _Api:
  """Each method drives a real MCP request, grouped under its own wire trace."""

  def discover(self) -> dict:
    def run() -> dict:
      client = _state["client"]
      discover_result = None
      discover_error = None
      try:
        discover_result = client.discover()
      except Exception as exc:  # noqa: BLE001
        # Surface a protocol error's message (a server-provided field), not raw exception text.
        discover_error = {"message": getattr(exc, "message", "discovery failed"), "code": getattr(exc, "code", None)}
      return {"discoverResult": discover_result, "discoverError": discover_error, "status": get_status()}

    return _with_trace("discover", run)

  def list_tools(self) -> dict:
    return _with_trace("tools/list", lambda: _state["client"].list_tools())

  def call_tool(self, name: str, args: dict) -> dict:
    return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool(name, args))

  def call_tool_cancellable(self, name: str, args: dict, cancel_id: str) -> dict:
    return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool_cancellable(name, args, cancel_id))

  def call_tool_with_meta(self, name: str, args: dict, meta: dict) -> dict:
    return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool_with_meta(name, args, meta))

  def raw(self, method: str, params: dict) -> dict:
    return _with_trace(method, lambda: _state["client"].raw(method, params))

  def create_task(self, name: str, args: dict, ttl: int | None = 300000) -> dict:
    return _with_trace(f"tasks/create:{name}", lambda: _state["client"].create_task(name, args, ttl_ms=ttl))

  def get_task(self, task_id: str) -> dict:
    return _with_trace("tasks/get", lambda: _state["client"].get_task(task_id))

  def subscribe(self, notifications: dict) -> dict:
    # The SDK's subscribe() is non-blocking and returns a SubscriptionHandle (not a
    # JSON-serialisable value). Mirror the TS host: keep a single active handle, wait
    # for the server's acknowledgement, then return the honored filter as a plain dict.
    # Change notifications ride the wire tap to /debug/stream, so no per-delivery
    # callback is needed here.
    def _do() -> dict:
      prior = _state.get("subscription")
      if prior is not None:
        try:
          prior.unsubscribe()
        except Exception:
          pass
        _state["subscription"] = None
      handle = _state["client"].subscribe(notifications)
      handle.wait_acknowledged(timeout=5.0)
      _state["subscription"] = handle
      return {
        "subscriptionId": handle.subscription_id,
        "acknowledgedFilter": handle.acknowledged_filter,
      }

    return _with_trace("subscriptions/listen", _do)

  def list_resources(self) -> dict:
    return _with_trace("resources/list", lambda: _state["client"].list_resources())

  def list_resource_templates(self) -> dict:
    return _with_trace("resources/templates/list", lambda: _state["client"].list_resource_templates())

  def read_resource(self, uri: str) -> dict:
    return _with_trace("resources/read", lambda: _state["client"].read_resource(uri))

  def list_prompts(self) -> dict:
    return _with_trace("prompts/list", lambda: _state["client"].list_prompts())

  def get_prompt(self, name: str, args: dict) -> dict:
    return _with_trace(f"prompts/get:{name}", lambda: _state["client"].get_prompt(name, args))

  def complete(self, ref: object, argument: object, context: object | None = None) -> dict:
    return _with_trace("completion/complete", lambda: _state["client"].complete(ref, argument, context))


api = _Api()
