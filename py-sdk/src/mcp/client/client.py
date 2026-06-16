"""MCP client host (2026-07-28) — the high-level counterpart to the server harness.

It owns the client-side runtime an embedder needs:

* stamps every outgoing request with the REQUIRED per-request ``_meta`` envelope —
  protocol version, client identity, client capabilities (§4.3);
* performs discovery + revision negotiation (``server/discover``, §5.3–§5.4), caching
  only the negotiated revision + status (the connection carries no conversational
  state, §4.4/§7.6);
* exposes convenience methods for the read/call feature methods, surfacing a delivered
  JSON-RPC error as a :class:`RequestError`.

Scope of this port: the request/response client over a :class:`ClientTransport`.
Deferred to their own phases (each clearly out of scope here): inbound server→client
requests (sampling/elicitation/roots, §20–§21), subscriptions (§10), correlated
progress + cancellation (§15), OAuth, and retry.
"""

from __future__ import annotations

import threading
from collections.abc import Callable

from mcp.client.transport import ClientTransport
from mcp.protocol.discovery import resolve_instructions, select_revision
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
)
from mcp.protocol.multi_round_trip import MrtrRoundGuard, discriminate_result_type
from mcp.protocol.streaming import (
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  SUBSCRIPTIONS_LISTEN_METHOD,
  read_subscription_id,
  subscription_id_from_request_id,
)


class RequestError(Exception):
  """A delivered JSON-RPC error response surfaced as a raised error.

  Distinct from a transport channel failure: the request was fully delivered and the
  peer answered with an ``error``. (§7.5)
  """

  def __init__(self, code: int | None, message: str, data: object = None) -> None:
    super().__init__(message)
    self.code = code
    self.data = data


class Client:
  """A stateless MCP client host driving a server over a :class:`ClientTransport`."""

  def __init__(
    self,
    transport: ClientTransport,
    client_info: dict,
    *,
    capabilities: dict | None = None,
    protocol_versions: list[str] | None = None,
  ) -> None:
    self._transport = transport
    #: This client's ``Implementation`` identity, stamped into every request (§4.3).
    self.client_info = client_info
    #: Capabilities declared in every request's ``_meta`` (§6.2).
    self.capabilities = capabilities or {}
    #: Acceptable revisions, most-preferred first.
    self.preferred_versions = protocol_versions or [CURRENT_PROTOCOL_VERSION]
    #: The revision negotiated via discovery; ``None`` until :meth:`discover` runs.
    self.negotiated_version: str | None = None
    self.server_info: dict | None = None
    self.server_capabilities: dict | None = None
    self.instructions: str | None = None
    self._id = 0
    #: Handlers for server→client requests fulfilled via the §11 MRTR loop and
    #: (when used) inbound request frames: ``method -> handler(params) -> result``.
    self._request_handlers: dict[str, Callable[[dict], object]] = {}
    #: A wire tap invoked as ``listener(direction, frame)`` for every frame (debug view).
    self._frame_listener: Callable[[str, dict], None] | None = None
    #: Cancellable in-flight calls: ``cancel_id -> request_id`` (→ ``notifications/cancelled``).
    self._inflight: dict[str, int] = {}
    #: Pending subscribe() acknowledgements: ``subscription_id -> (event, holder)``.
    self._subscription_acks: dict[str, tuple[threading.Event, dict]] = {}
    # Surface inbound interim frames (notifications, server→client requests, the final
    # response) through one tap + routing path, when the transport supports it.
    setter = getattr(transport, "set_on_message", None)
    if callable(setter):
      setter(self._on_inbound)

  # ── frame tap + handler registration ──
  def set_frame_listener(self, listener: Callable[[str, dict], None] | None) -> None:
    """Install a wire tap invoked as ``listener("send"|"recv", frame)`` for every frame."""
    self._frame_listener = listener

  def set_request_handler(self, method: str, handler: Callable[[dict], object]) -> None:
    """Register the handler for a server→client request kind (``sampling/createMessage``,
    ``elicitation/create``, ``roots/list``) — used by the §11 MRTR loop and inbound routing.
    """
    self._request_handlers[method] = handler

  def _tap(self, direction: str, frame: dict) -> None:
    if self._frame_listener is not None:
      try:
        self._frame_listener(direction, frame)
      except Exception:  # noqa: BLE001 — the tap is observational; never break the call
        pass

  def _on_inbound(self, frame: dict) -> None:
    """Route an inbound frame: tap it, resolve a subscription ack, or answer a
    server→client request. The final response is also surfaced here (and returned by
    :meth:`request`); routing here is idempotent for it.
    """
    self._tap("recv", frame)
    method = frame.get("method")
    if method == SUBSCRIPTIONS_ACKNOWLEDGED_METHOD:
      sub_id = read_subscription_id(frame.get("params") or {})
      pending = self._subscription_acks.get(sub_id) if sub_id else None
      if pending is not None:
        pending[1]["params"] = frame.get("params") or {}
        pending[0].set()
      return
    # A true server→client request (has both method and id): answer via a registered handler.
    if isinstance(method, str) and frame.get("id") is not None and "result" not in frame and "error" not in frame:
      self._answer_server_request(frame)

  def _answer_server_request(self, frame: dict) -> None:
    sender = getattr(self._transport, "send", None)
    if not callable(sender):
      return
    handler = self._request_handlers.get(frame["method"])
    if handler is None:
      reply = {"jsonrpc": "2.0", "id": frame["id"], "error": {"code": -32601, "message": f'Method not found: {frame["method"]}'}}
    else:
      try:
        result = handler(frame.get("params") or {})
        reply = {"jsonrpc": "2.0", "id": frame["id"], "result": result if isinstance(result, dict) else {}}
      except Exception as exc:  # noqa: BLE001 — a handler failure becomes an error response
        reply = {"jsonrpc": "2.0", "id": frame["id"], "error": {"code": -32603, "message": str(exc)}}
    self._tap("send", reply)
    sender(reply)

  # ── envelope + core request ──
  def _meta(self) -> dict:
    """Build the REQUIRED per-request ``_meta`` envelope for this request (§4.3)."""
    version = self.negotiated_version or self.preferred_versions[0]
    return {
      PROTOCOL_VERSION_META_KEY: version,
      CLIENT_INFO_META_KEY: self.client_info,
      CLIENT_CAPABILITIES_META_KEY: self.capabilities,
    }

  def request(
    self,
    method: str,
    params: dict | None = None,
    *,
    progress: bool = False,
    cancel_id: str | None = None,
    meta_extra: dict | None = None,
  ) -> dict:
    """Send a request and return its ``result``, or raise :class:`RequestError`.

    The ``_meta`` envelope is merged into ``params`` automatically. ``meta_extra``
    merges caller ``_meta`` keys (e.g. a W3C ``traceparent``); ``progress`` attaches a
    ``progressToken`` (so the server's ``notifications/progress`` are correlated);
    ``cancel_id`` registers the call for later :meth:`cancel` (→ ``notifications/cancelled``).
    """
    self._id += 1
    request_id = self._id
    caller_meta = (params or {}).get("_meta") or {}
    rest = {k: v for k, v in (params or {}).items() if k != "_meta"}
    envelope = {**caller_meta, **(meta_extra or {}), **self._meta()}
    if progress:
      envelope["progressToken"] = request_id
    message = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": {**rest, "_meta": envelope}}

    self._tap("send", message)
    if cancel_id is not None:
      self._inflight[cancel_id] = request_id
    try:
      response = self._transport.request(message)
    finally:
      if cancel_id is not None:
        self._inflight.pop(cancel_id, None)
    if not isinstance(response, dict):
      raise RequestError(None, "transport returned a non-object response")
    if "error" in response:
      error = response["error"]
      raise RequestError(error.get("code"), error.get("message", ""), error.get("data"))
    return response.get("result", {})

  def notify(self, method: str, params: dict | None = None) -> None:
    """Send a one-way notification (e.g. ``notifications/cancelled``). Best-effort."""
    sender = getattr(self._transport, "send", None)
    if not callable(sender):
      return
    message = {"jsonrpc": "2.0", "method": method, **({"params": params} if params else {})}
    self._tap("send", message)
    try:
      sender(message)
    except Exception:  # noqa: BLE001 — a notification is best-effort
      pass

  def cancel(self, cancel_id: str) -> bool:
    """Abort an in-flight cancellable call by sending ``notifications/cancelled`` (§15.2)."""
    request_id = self._inflight.get(cancel_id)
    if request_id is None:
      return False
    self.notify("notifications/cancelled", {"requestId": request_id, "reason": "client cancelled"})
    return True

  # ── discovery ──
  def discover(self) -> dict:
    """Run ``server/discover``, cache status, and negotiate the protocol revision (§5.3)."""
    result = self.request("server/discover")
    self.server_info = result.get("serverInfo")
    self.server_capabilities = result.get("capabilities")
    self.instructions = resolve_instructions(result)
    self.negotiated_version = select_revision(result.get("supportedVersions", []), self.preferred_versions)
    return result

  @property
  def connected(self) -> bool:
    """``True`` once discovery has negotiated a shared revision."""
    return self.negotiated_version is not None

  def server_supports(self, capability: str) -> bool:
    """Return ``True`` when the last :meth:`discover` advertised ``capability``. (§6)"""
    caps = self.server_capabilities or {}
    return caps.get(capability) is not None

  def status(self) -> dict:
    """A snapshot of connection status (mirrors the companion's BackendStatus shape)."""
    caps = self.server_capabilities or {}
    return {
      "connected": self.connected,
      "negotiatedVersion": self.negotiated_version,
      "serverInfo": self.server_info,
      "serverCapabilities": self.server_capabilities,
      "serverExtensions": caps.get("extensions"),
      "clientCapabilities": self.capabilities,
      "instructions": self.instructions,
    }

  # ── convenience feature methods ──
  def ping(self) -> dict:
    return self.request("ping")

  def list_tools(self, cursor: str | None = None) -> dict:
    return self.request("tools/list", {"cursor": cursor} if cursor else {})

  def call_tool(self, name: str, arguments: dict | None = None) -> dict:
    # Via the §11 MRTR driver: a tool needing client input (elicitation/sampling/roots)
    # returns input_required, which is fulfilled by the registered handlers and retried.
    return self.request_with_input("tools/call", {"name": name, "arguments": arguments or {}})

  def call_tool_cancellable(self, name: str, arguments: dict | None, cancel_id: str) -> dict:
    """A cancellable, progress-reporting ``tools/call`` (abort later via :meth:`cancel`)."""
    return self.request_with_input(
      "tools/call", {"name": name, "arguments": arguments or {}}, cancel_id=cancel_id, progress=True
    )

  def call_tool_with_meta(self, name: str, arguments: dict | None, meta: dict) -> dict:
    """A ``tools/call`` carrying caller ``_meta`` (e.g. W3C ``traceparent``) on the wire."""
    return self.request_with_input(
      "tools/call", {"name": name, "arguments": arguments or {}}, meta_extra=meta
    )

  def list_resources(self, cursor: str | None = None) -> dict:
    return self.request("resources/list", {"cursor": cursor} if cursor else {})

  def list_resource_templates(self, cursor: str | None = None) -> dict:
    return self.request("resources/templates/list", {"cursor": cursor} if cursor else {})

  def read_resource(self, uri: str) -> dict:
    return self.request("resources/read", {"uri": uri})

  def list_prompts(self, cursor: str | None = None) -> dict:
    return self.request("prompts/list", {"cursor": cursor} if cursor else {})

  def get_prompt(self, name: str, arguments: dict | None = None) -> dict:
    return self.request("prompts/get", {"name": name, "arguments": arguments or {}})

  def complete(self, ref: dict, argument: dict, context: dict | None = None) -> dict:
    params = {"ref": ref, "argument": argument}
    if context is not None:
      params["context"] = context
    return self.request("completion/complete", params)

  def raw(self, method: str, params: dict | None = None) -> dict:
    """Escape hatch: issue an arbitrary method with the ``_meta`` envelope applied."""
    return self.request(method, params)

  # ── §11 multi-round-trip driver ──
  def request_with_input(
    self,
    method: str,
    params: dict | None = None,
    *,
    max_rounds: int = 16,
    cancel_id: str | None = None,
    progress: bool = False,
    meta_extra: dict | None = None,
  ) -> dict:
    """Run a participating request to completion, fulfilling ``input_required`` results.

    Each requested input kind is satisfied by the matching handler registered via
    :meth:`set_request_handler`; the request is then retried with ``inputResponses`` +
    the echoed ``requestState``, bounded by ``max_rounds``. (§11.5)
    """
    base = params or {}
    current = dict(base)
    guard = MrtrRoundGuard(max_rounds)
    while True:
      result = self.request(method, current, progress=progress, cancel_id=cancel_id, meta_extra=meta_extra)
      decision = discriminate_result_type(result, self.capabilities)
      if decision.action == "complete":
        return result
      if decision.action == "error":
        raise RequestError(-32603, f"Multi-round-trip error: {decision.reason}")
      if not guard.record_round():
        raise RequestError(-32603, f"Multi-round-trip exceeded {guard.max_rounds} rounds")
      input_responses: dict = {}
      for key, request in (decision.result.get("inputRequests") or {}).items():
        handler = self._request_handlers.get(request["method"])
        if handler is None:
          raise RequestError(-32601, f'No handler registered for input-request kind "{request["method"]}"')
        input_responses[key] = handler(request.get("params") or {})
      current = {**base, "inputResponses": input_responses}
      if decision.result.get("requestState") is not None:
        current["requestState"] = decision.result["requestState"]

  # ── §25 Tasks extension helpers ──
  def create_task(self, name: str, arguments: dict | None = None, *, ttl_ms: int | None = 300000) -> dict:
    """Augmented ``tools/call`` that runs as a task and returns a task handle. (§25.3)"""
    return self.request("tools/call", {"name": name, "arguments": arguments or {}, "task": {"ttl": ttl_ms}})

  def get_task(self, task_id: str) -> dict:
    """``tasks/get`` — the task's current DetailedTask (inline outcome once terminal). (§25.7)"""
    return self.request("tasks/get", {"taskId": task_id})

  def cancel_task(self, task_id: str) -> dict:
    """``tasks/cancel`` — request cooperative cancellation of a task. (§25.9)"""
    return self.request("tasks/cancel", {"taskId": task_id})

  # ── §10 subscriptions ──
  def subscribe(self, notifications: dict, on_notification: Callable[[str, dict], None] | None = None) -> dict:
    """Open a ``subscriptions/listen`` stream and resolve once the server acknowledges.

    The honored change notifications ride the wire tap; ``on_notification`` (optional)
    is invoked per delivery. Returns ``{subscriptionId, acknowledgedFilter}``. (§10)
    """
    opener = getattr(self._transport, "open_subscription", None)
    if not callable(opener):
      raise RequestError(None, "this transport does not support subscriptions")
    self._id += 1
    listen_id = self._id
    subscription_id = subscription_id_from_request_id(listen_id)
    message = {
      "jsonrpc": "2.0",
      "id": listen_id,
      "method": SUBSCRIPTIONS_LISTEN_METHOD,
      "params": {"notifications": notifications, "_meta": self._meta()},
    }
    if on_notification is not None:
      self._request_handlers.setdefault(f"__sub__{subscription_id}", lambda p: None)  # marker
    ack_event = threading.Event()
    holder: dict = {}
    self._subscription_acks[subscription_id] = (ack_event, holder)
    self._tap("send", message)
    self._transport.open_subscription(message, lambda: None)
    if not ack_event.wait(timeout=10.0):
      self._subscription_acks.pop(subscription_id, None)
      raise RequestError(None, "subscriptions/listen was not acknowledged in time")
    self._subscription_acks.pop(subscription_id, None)
    return {
      "subscriptionId": subscription_id,
      "acknowledgedFilter": (holder.get("params") or {}).get("notifications") or {},
    }
