"""MCP client host (2026-07-28) — the high-level counterpart to the server harness.

It owns the client-side runtime an embedder needs:

* stamps every outgoing request with the REQUIRED per-request ``_meta`` envelope —
  protocol version, client identity, client capabilities (§4.3);
* correlates each request to its response over a :class:`ClientTransport` (the Python
  transport blocks in ``request(message) -> response``, so the request/response shape is
  the natural correlation point — no separate long-lived correlator is required);
* routes inbound server→client requests (sampling/elicitation/roots, §20–§21) and
  notifications (progress/logging/list-changed, §15) to registered handlers, posting
  each request handler's result back as the JSON-RPC response;
* performs discovery + revision negotiation (``server/discover``, §5.3–§5.4), caching
  only the negotiated revision + status (the connection carries no conversational
  state, §4.4/§7.6);
* supports cancellation (``notifications/cancelled``, §15.2), per-request progress
  correlation (§15.1), the §11 multi-round-trip ``input_required`` driver, the §25 Tasks
  extension helpers, and §10 subscriptions (``subscriptions/listen`` → acknowledged →
  filtered change notifications → teardown via ``notifications/cancelled``);
* exposes typed convenience methods for the read/call feature methods and pagination
  auto-iteration, surfacing a delivered JSON-RPC error as a :class:`RequestError`.

This is the synchronous Python analogue of the TS ``Client``. Where the TS host drives an
async, message-pump :class:`Transport` and correlates by JSON-RPC id through a
``RequestCorrelator``, the Python host drives a synchronous
:class:`~mcp.client.transport.ClientTransport` whose ``request`` returns the correlated
response directly; inbound interim frames (notifications, server→client requests, the
subscription acknowledgement) ride a ``set_on_message`` tap the transport invokes while a
request is in flight. The public surface, routing, and error semantics mirror the TS host.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Iterator

from mcp.client.transport import ClientTransport
from mcp.protocol.discovery import resolve_instructions
from mcp.protocol.errors import MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.negotiation import (
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  IncompatibleProtocolError,
  negotiate_revision,
  reselect_after_unsupported_version,
)
from mcp.protocol.meta import (
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
)
from mcp.protocol.multi_round_trip import MrtrRoundGuard, discriminate_result_type
from mcp.protocol.pagination import is_cursor_present
from mcp.protocol.progress import PROGRESS_NOTIFICATION_METHOD
from mcp.protocol.streaming import (
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  SUBSCRIPTIONS_LISTEN_METHOD,
  read_subscription_id,
  subscription_id_from_request_id,
)
from mcp.protocol.security import redact_for_logging, sanitize_tool_output_text
from mcp.protocol.tools import validate_tool_structured_content
from mcp.transport.http.param_headers import build_param_headers, filter_valid_tools

# ─── Error codes ────────────────────────────────────────────────────────────────

#: JSON-RPC "Method not found" — sent when no handler is registered for a server→client
#: request. (§7.5)
METHOD_NOT_FOUND_CODE = -32601
#: JSON-RPC "Internal error" — the fallback code for a throwing request handler. (§7.5)
INTERNAL_ERROR_CODE = -32603
#: JSON-RPC "Invalid params" — used here when a tool result violates its declared
#: ``outputSchema`` on the client receive path (§16.6, R-28-validation). (§7.5)
INVALID_PARAMS_CODE = -32602


class RequestError(Exception):
  """A delivered JSON-RPC error response surfaced as a raised error.

  Distinct from a transport channel failure: the request was fully delivered and the
  peer answered with an ``error``. (§7.5) Mirrors the TS ``RequestError`` — ``code`` /
  ``message`` / ``data`` carry the JSON-RPC ``error`` members.
  """

  #: Stable class name mirroring the TS ``RequestError.name`` (so callers can branch on it).
  name = "RequestError"

  def __init__(self, code: int | None, message: str, data: object = None) -> None:
    super().__init__(message)
    self.code = code
    #: The protocol error message (a server-provided JSON-RPC ``error.message``), exposed
    #: as a plain attribute so callers surface it without stringifying the exception.
    self.message = message
    self.data = data


def _progress_key(token: object) -> str:
  """Type-tag a progress token so string ``"1"`` and number ``1`` never collide.

  Mirrors the TS ``progressKey`` helper. (§15.1)
  """
  return f"s:{token}" if isinstance(token, str) else f"n:{token}"


def _cursor_params(cursor: str | None) -> dict:
  """Build the ``params`` for a paginated request from a cursor by PRESENCE, not
  truthiness: a present cursor — including the empty string ``""`` (§12.1) — is sent
  verbatim, while only an absent (``None``) cursor omits the field. This keeps the wire
  path consistent with :func:`mcp.protocol.pagination.is_cursor_present`. (R-12.1-a,
  R-12.3-e)
  """
  return {"cursor": cursor} if is_cursor_present(cursor) else {}


def _sanitize_result_text(result: dict) -> dict:
  """Return a shallow copy of a tool/resource result with C0/C1 control sequences stripped
  from its text blocks (``content[].text`` for tools, ``contents[].text`` for resources).
  Ordinary whitespace is preserved. (§28.3, R-28.3-i)
  """

  def _scrub(blocks: object) -> object:
    if not isinstance(blocks, list):
      return blocks
    return [
      {**b, "text": sanitize_tool_output_text(b["text"])}
      if isinstance(b, dict) and isinstance(b.get("text"), str)
      else b
      for b in blocks
    ]

  scrubbed = dict(result)
  if "content" in scrubbed:
    scrubbed["content"] = _scrub(scrubbed["content"])
  if "contents" in scrubbed:
    scrubbed["contents"] = _scrub(scrubbed["contents"])
  return scrubbed


class SubscriptionHandle:
  """A handle to an active subscription opened via :meth:`Client.subscribe`. (§10)

  Mirrors the TS ``SubscriptionHandle`` interface: it carries the server-assigned
  ``subscription_id``, the honored ``acknowledged_filter`` subset, a ``closed``
  :class:`threading.Event` set at teardown, and an :meth:`unsubscribe` tearing the stream
  down (sending ``notifications/cancelled`` for the listen request).

  In this synchronous SDK :meth:`Client.subscribe` does NOT block the caller waiting for
  the acknowledgement — it returns this handle as soon as the ``subscriptions/listen``
  request is on the wire. The acknowledgement arrives later through the ``set_on_message``
  tap (just like the change notifications), at which point :attr:`acknowledged_filter` is
  populated and :attr:`acknowledged` is set. Callers that need to block until the honored
  subset is known may :meth:`wait_acknowledged`; everything else (the change-notification
  callback, teardown) works regardless of when the ack lands.
  """

  def __init__(
    self,
    subscription_id: str,
    closed: threading.Event,
    unsubscribe: Callable[[], None],
  ) -> None:
    #: The server-assigned subscription id (``io.modelcontextprotocol/subscriptionId``).
    self.subscription_id = subscription_id
    #: The honored subset of the requested filter, from the acknowledgement. Empty until
    #: the acknowledgement is delivered through the inbound tap.
    self.acknowledged_filter: dict = {}
    #: Set once the server's acknowledgement has been delivered and the honored subset
    #: above has been populated.
    self.acknowledged = threading.Event()
    #: Set when the subscription stream ends (teardown / unsubscribe / disconnect).
    self.closed = closed
    self._unsubscribe = unsubscribe

  def wait_acknowledged(self, timeout: float | None = None) -> bool:
    """Block until the acknowledgement lands (or ``timeout`` elapses); return whether it did.

    A convenience for callers that want the honored ``acknowledged_filter`` before
    proceeding. This only works when another thread (a real async transport) drives the
    inbound tap; in a single-threaded synchronous driver the ack is observed by reading
    :attr:`acknowledged` / :attr:`acknowledged_filter` after the inbound frame is injected.
    """
    return self.acknowledged.wait(timeout=timeout)

  def unsubscribe(self) -> None:
    """Tear the subscription down (sends ``notifications/cancelled`` for the listen request)."""
    self._unsubscribe()


class Client:
  """A stateless MCP client host driving a server over a :class:`ClientTransport`."""

  def __init__(
    self,
    transport: ClientTransport,
    client_info: dict,
    *,
    capabilities: dict | None = None,
    protocol_versions: list[str] | None = None,
    sanitize_tool_text: bool = False,
  ) -> None:
    self._transport = transport
    #: This client's ``Implementation`` identity, stamped into every request (§4.3).
    self.client_info = client_info
    #: Capabilities declared in every request's ``_meta`` (§6.2).
    self.capabilities = capabilities or {}
    #: §28.3 (R-28.3-i): when ``True``, strip C0/C1 control sequences from received tool /
    #: resource text on the receive path. Off by default so results pass through verbatim;
    #: a host that does not sanitize at its render target SHOULD enable it.
    self._sanitize_tool_text = sanitize_tool_text
    #: Tool ``outputSchema`` learned from ``tools/list``, used to validate a tool result's
    #: ``structuredContent`` on the receive path (§16.6). Keyed by tool name.
    self._tool_output_schemas: dict[str, dict] = {}
    #: Optional pre-dispatch review hook: ``hook(name, arguments)`` invoked before a
    #: ``tools/call`` leaves the client, so a host can surface arguments for approval (§28.6).
    self._pre_dispatch_hook: Callable[[str, dict], None] | None = None
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
    #: Handlers for inbound one-way notifications: ``method -> handler(params)``. (§15)
    self._notification_handlers: dict[str, Callable[[dict], None]] = {}
    #: Per-request progress callbacks keyed by a type-tagged progress token. (§15.1)
    self._progress_handlers: dict[str, Callable[[dict], None]] = {}
    #: A wire tap invoked as ``listener(direction, frame)`` for every frame (debug view).
    self._frame_listener: Callable[[str, dict], None] | None = None
    #: Cancellable in-flight calls: ``cancel_id -> request_id`` (→ ``notifications/cancelled``).
    self._inflight: dict[str, int] = {}
    #: Active subscriptions: ``subscription_id -> change-notification callback``. (§10)
    self._subscription_routers: dict[str, Callable[[str, dict], None]] = {}
    #: Pending subscribe() acknowledgement resolvers: ``subscription_id -> resolver(params)``.
    #: The resolver populates the :class:`SubscriptionHandle` when the ack frame is delivered
    #: through the inbound tap. (mirrors the TS ``subscriptionAcks`` map)
    self._subscription_acks: dict[str, Callable[[dict], None]] = {}
    #: Tool inputSchemas learned from tools/list, used to derive Mcp-Param-* headers. (§9.5.2)
    self._tool_schemas: dict[str, object] = {}
    # Surface inbound interim frames (notifications, server→client requests, the final
    # response) through one tap + routing path, when the transport supports it.
    setter = getattr(transport, "set_on_message", None)
    if callable(setter):
      setter(self._on_inbound)
    # §9.5.2: when the transport supports param-header routing, derive Mcp-Param-* headers
    # for a tools/call from the tool's x-mcp-header annotations (learned via tools/list).
    resolver_setter = getattr(transport, "set_param_header_resolver", None)
    if callable(resolver_setter):
      resolver_setter(self._resolve_param_headers)

  # ── frame tap + handler registration ──
  def set_frame_listener(self, listener: Callable[[str, dict], None] | None) -> None:
    """Install a wire tap invoked as ``listener("send"|"recv", frame)`` for every frame."""
    self._frame_listener = listener

  def set_request_handler(self, method: str, handler: Callable[[dict], object]) -> None:
    """Register the handler for a server→client request kind (``sampling/createMessage``,
    ``elicitation/create``, ``roots/list``) — used by the §11 MRTR loop and inbound routing.
    """
    self._request_handlers[method] = handler

  def remove_request_handler(self, method: str) -> None:
    """Unregister any server→client request handler for ``method``. (mirrors TS ``removeRequestHandler``)"""
    self._request_handlers.pop(method, None)

  def set_notification_handler(self, method: str, handler: Callable[[dict], None]) -> None:
    """Register the handler for an inbound notification ``method`` (e.g.
    ``notifications/message``, ``notifications/tools/list_changed``). The handler receives the
    notification ``params`` and is never answered. (mirrors TS ``setNotificationHandler``, §15)
    """
    self._notification_handlers[method] = handler

  def remove_notification_handler(self, method: str) -> None:
    """Unregister any inbound notification handler for ``method``. (mirrors TS ``removeNotificationHandler``)"""
    self._notification_handlers.pop(method, None)

  def _tap(self, direction: str, frame: dict) -> None:
    if self._frame_listener is not None:
      try:
        # §28.9 (R-28.9-d, RC-8/15/16): never surface a credential/token to the debug/audit
        # listener — redact sensitive keys before the frame leaves the SDK boundary.
        self._frame_listener(direction, redact_for_logging(frame))
      except Exception:  # noqa: BLE001 — the tap is observational; never break the call
        pass

  def set_pre_dispatch_hook(self, hook: Callable[[str, dict], None] | None) -> None:
    """Install a pre-dispatch review hook invoked as ``hook(name, arguments)`` immediately
    before a ``tools/call`` is sent, so a host can surface the exact arguments for review /
    approval before they reach the server. The hook may raise to veto the call. (§28.6)
    """
    self._pre_dispatch_hook = hook

  def _finalize_tool_result(self, name: str, result: dict) -> dict:
    """Apply the §16.6/§28.3 client receive-path guards to a ``tools/call`` result.

    * Validates ``structuredContent`` against the tool's learned ``outputSchema`` and raises
      :class:`RequestError` (``-32602``) on a violation — a server MUST NOT return structured
      output that breaks its own contract, and the client refuses it. (§16.6, RC-17)
    * When :attr:`_sanitize_tool_text` is set, strips control sequences from text content.
      (§28.3, R-28.3-i, RC-5)
    """
    if not isinstance(result, dict):
      return result
    schema = self._tool_output_schemas.get(name)
    structured = result.get("structuredContent")
    if schema is not None and structured is not None and result.get("isError") is not True:
      verdict = validate_tool_structured_content({"name": name, "outputSchema": schema}, structured)
      if not verdict.valid:
        raise RequestError(
          INVALID_PARAMS_CODE,
          f'Tool "{name}" returned structuredContent that violates its outputSchema',
          {"errors": verdict.errors},
        )
    if self._sanitize_tool_text:
      result = _sanitize_result_text(result)
    return result

  def _resolve_param_headers(self, method: str, params: dict | None) -> dict:
    """Resolve the ``Mcp-Param-*`` routing headers for an outgoing request from the tool's
    learned ``inputSchema`` (§9.5.2). Mirrors the TS ``setParamHeaderResolver`` callback: only
    ``tools/call`` is routed, and only when the named tool's schema was learned via
    :meth:`list_tools`. Returns ``{}`` otherwise.
    """
    if method != "tools/call" or not isinstance(params, dict):
      return {}
    name = params.get("name")
    if not isinstance(name, str):
      return {}
    schema = self._tool_schemas.get(name)
    if schema is None:
      return {}
    arguments = params.get("arguments")
    return build_param_headers(schema, arguments if isinstance(arguments, dict) else {})

  def _on_inbound(self, frame: dict) -> None:
    """Route an inbound frame: tap it, then dispatch by shape (§9.6.2).

    * a server→client **request** (``method`` + ``id``, no ``result``/``error``) is answered
      via a registered handler (or ``-32601`` when none is registered);
    * a **notification** (``method``, no ``id``) is routed to progress correlation, the
      subscription routers, and any registered notification handler;
    * the subscription **acknowledgement** resolves the pending :meth:`subscribe` waiter.

    The final response is also surfaced here (and returned by :meth:`request`); routing here
    is idempotent for it (a result/error frame matches none of the cases below).
    """
    self._tap("recv", frame)
    if not isinstance(frame, dict):
      return
    method = frame.get("method")
    # A true server→client request (has both method and id): answer via a registered handler.
    if isinstance(method, str) and frame.get("id") is not None and "result" not in frame and "error" not in frame:
      self._answer_server_request(frame)
      return
    # An inbound notification (has a method, no id): route to progress / subscriptions / handlers.
    if isinstance(method, str) and frame.get("id") is None:
      params = frame.get("params") if isinstance(frame.get("params"), dict) else {}
      if method == PROGRESS_NOTIFICATION_METHOD:
        self._dispatch_progress(params)
      self._dispatch_subscription(method, params)
      handler = self._notification_handlers.get(method)
      if handler is not None:
        try:
          handler(params)
        except Exception:  # noqa: BLE001 — a notification handler's failure is local, never answered
          pass

  def _answer_server_request(self, frame: dict) -> None:
    sender = getattr(self._transport, "send", None)
    if not callable(sender):
      return
    handler = self._request_handlers.get(frame["method"])
    if handler is None:
      reply = {
        "jsonrpc": "2.0",
        "id": frame["id"],
        "error": {"code": METHOD_NOT_FOUND_CODE, "message": f'Method not found: {frame["method"]}'},
      }
    else:
      try:
        result = handler(frame.get("params") or {})
        reply = {"jsonrpc": "2.0", "id": frame["id"], "result": result if isinstance(result, dict) else {}}
      except RequestError as exc:  # a structured handler error maps to its JSON-RPC error
        error: dict = {"code": exc.code, "message": exc.message}
        if exc.data is not None:
          error["data"] = exc.data
        reply = {"jsonrpc": "2.0", "id": frame["id"], "error": error}
      except Exception as exc:  # noqa: BLE001 — any other handler failure becomes an internal error
        reply = {"jsonrpc": "2.0", "id": frame["id"], "error": {"code": INTERNAL_ERROR_CODE, "message": str(exc)}}
    self._tap("send", reply)
    sender(reply)

  def _dispatch_progress(self, params: dict) -> None:
    """Route a ``notifications/progress`` payload to the request's progress callback. (§15.1)"""
    token = params.get("progressToken")
    if not isinstance(token, (str, int)) or isinstance(token, bool):
      return
    handler = self._progress_handlers.get(_progress_key(token))
    if handler is not None:
      try:
        handler(params)
      except Exception:  # noqa: BLE001 — progress callbacks are observational
        pass

  def _dispatch_subscription(self, method: str, params: dict) -> None:
    """Route an inbound notification to a subscription's callback (or resolve a pending ack).

    The acknowledgement resolves the :meth:`subscribe` waiter; a change notification carrying a
    ``io.modelcontextprotocol/subscriptionId`` is delivered to that subscription's callback. (§10)
    """
    if method == SUBSCRIPTIONS_ACKNOWLEDGED_METHOD:
      sub_id = read_subscription_id(params)
      resolver = self._subscription_acks.get(sub_id) if sub_id else None
      if resolver is not None:
        resolver(params)
      return
    sub_id = read_subscription_id(params)
    if sub_id is None:
      return
    router = self._subscription_routers.get(sub_id)
    if router is not None:
      try:
        router(method, params)
      except Exception:  # noqa: BLE001 — subscription callbacks are observational
        pass

  # ── envelope + core request ──
  def _meta(self) -> dict:
    """Build the REQUIRED per-request ``_meta`` envelope for this request (§4.3)."""
    return {
      PROTOCOL_VERSION_META_KEY: self.protocol_version(),
      CLIENT_INFO_META_KEY: self.client_info,
      CLIENT_CAPABILITIES_META_KEY: self.capabilities,
    }

  def request(
    self,
    method: str,
    params: dict | None = None,
    *,
    progress: bool = False,
    progress_token: str | int | None = None,
    on_progress: Callable[[dict], None] | None = None,
    cancel_id: str | None = None,
    timeout_ms: int | None = None,
    meta_extra: dict | None = None,
    _retry_unsupported_version: bool = True,
  ) -> dict:
    """Send a request and return its ``result``, or raise :class:`RequestError`.

    The ``_meta`` envelope is merged into ``params`` automatically. ``meta_extra``
    merges caller ``_meta`` keys (e.g. a W3C ``traceparent``); ``progress`` (or an explicit
    ``progress_token`` / ``on_progress``) attaches a ``progressToken`` so the server's
    ``notifications/progress`` are correlated to this request (and routed to ``on_progress``
    when supplied, §15.1); ``cancel_id`` registers the call for later :meth:`cancel`
    (→ ``notifications/cancelled``, §15.2); ``timeout_ms`` bounds the call when the transport
    honors a per-request timeout (the synthesized failure surfaces as a transport error).

    On a ``-32004`` (UnsupportedProtocolVersion) the client re-selects from the error's
    authoritative ``data.supported`` set and retries the request EXACTLY ONCE at the chosen
    revision; if the sets are disjoint it raises :class:`IncompatibleProtocolError` rather
    than looping. (§5.5 R-5.5-h/-i/-j, §29.3 R-29.3-c)
    """
    self._id += 1
    request_id = self._id
    caller_meta = (params or {}).get("_meta") or {}
    rest = {k: v for k, v in (params or {}).items() if k != "_meta"}
    envelope = {**caller_meta, **(meta_extra or {}), **self._meta()}

    # §15.1: derive a progress token (explicit, else the request id) when progress is wanted.
    token: str | int | None = None
    if progress or progress_token is not None or on_progress is not None:
      token = progress_token if progress_token is not None else request_id
      envelope["progressToken"] = token
      if on_progress is not None:
        self._progress_handlers[_progress_key(token)] = on_progress

    message = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": {**rest, "_meta": envelope}}

    self._tap("send", message)
    if cancel_id is not None:
      self._inflight[cancel_id] = request_id
    try:
      response = self._transport_request(message, timeout_ms)
    finally:
      if cancel_id is not None:
        self._inflight.pop(cancel_id, None)
      if token is not None and on_progress is not None:
        self._progress_handlers.pop(_progress_key(token), None)
    if not isinstance(response, dict):
      raise RequestError(None, "transport returned a non-object response")
    if "error" in response:
      error = response["error"]
      if _retry_unsupported_version and error.get("code") == UNSUPPORTED_PROTOCOL_VERSION_CODE:
        return self._reselect_and_retry(
          error,
          method,
          params,
          progress=progress,
          progress_token=progress_token,
          on_progress=on_progress,
          cancel_id=cancel_id,
          timeout_ms=timeout_ms,
          meta_extra=meta_extra,
        )
      raise RequestError(error.get("code"), error.get("message", ""), error.get("data"))
    return response.get("result", {})

  def _reselect_and_retry(self, error: dict, method: str, params: dict | None, **kwargs) -> dict:
    """React to a ``-32004`` by re-selecting a mutually supported revision and retrying once.

    Uses the error's authoritative ``data.supported`` set (§5.5). On overlap the chosen
    revision is adopted (so the retry's ``_meta`` carries it) and the request is re-sent
    exactly once with version-retry disabled; on no overlap the terminal
    :class:`IncompatibleProtocolError` is raised instead of retrying indefinitely.
    (R-5.5-h/-i/-j, R-29.3-c)
    """
    reselection = reselect_after_unsupported_version(error, self.preferred_versions)
    if not reselection.ok:
      raise IncompatibleProtocolError(
        self.preferred_versions, (error.get("data") or {}).get("supported") or []
      )
    self.negotiated_version = reselection.selected
    return self.request(method, params, _retry_unsupported_version=False, **kwargs)

  def _transport_request(self, message: dict, timeout_ms: int | None) -> dict:
    """Dispatch one request over the transport, passing a per-request ``timeout_ms`` when the
    transport accepts one. Transports that do not declare the keyword fall back to a plain call.
    """
    if timeout_ms is not None:
      try:
        return self._transport.request(message, timeout_ms=timeout_ms)  # type: ignore[call-arg]
      except TypeError:
        pass  # transport does not accept a per-request timeout — fall through
    return self._transport.request(message)

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

  def close(self) -> None:
    """Tear down handlers and close the transport. Idempotent and best-effort (mirrors TS ``close``)."""
    self._request_handlers.clear()
    self._notification_handlers.clear()
    self._progress_handlers.clear()
    self._subscription_routers.clear()
    closer = getattr(self._transport, "close", None)
    if callable(closer):
      try:
        closer()
      except Exception:  # noqa: BLE001 — close is best-effort; nothing further to do here
        pass

  # ── discovery ──
  def discover(self) -> dict:
    """Run ``server/discover``, cache status, and negotiate the protocol revision (§5.3)."""
    result = self.request("server/discover")
    self.server_info = result.get("serverInfo")
    self.server_capabilities = result.get("capabilities")
    self.instructions = resolve_instructions(result)
    negotiation = negotiate_revision(self.preferred_versions, result.get("supportedVersions", []))
    self.negotiated_version = negotiation.selected if negotiation.ok else None
    return result

  @property
  def connected(self) -> bool:
    """``True`` once discovery has negotiated a shared revision."""
    return self.negotiated_version is not None

  # ── negotiated status (populated by discover) ──
  def get_server_version(self) -> dict | None:
    """The server's ``Implementation`` identity from the last :meth:`discover`, or ``None``."""
    return self.server_info

  def get_server_capabilities(self) -> dict | None:
    """The server's advertised capabilities from the last :meth:`discover`, or ``None``."""
    return self.server_capabilities

  def get_negotiated_version(self) -> str | None:
    """The negotiated protocol revision, or ``None`` before a successful :meth:`discover`."""
    return self.negotiated_version

  def get_instructions(self) -> str | None:
    """The server's free-text usage instructions from the last :meth:`discover`, or ``None``."""
    return self.instructions

  def protocol_version(self) -> str:
    """The protocol revision placed in outgoing ``_meta``: negotiated, else most-preferred."""
    return self.negotiated_version or (self.preferred_versions[0] if self.preferred_versions else CURRENT_PROTOCOL_VERSION)

  def server_supports(self, capability: str) -> bool:
    """Return ``True`` when the last :meth:`discover` advertised ``capability``. (§6)"""
    caps = self.server_capabilities or {}
    return caps.get(capability) is not None

  def assert_server_capability(self, capability: str) -> None:
    """Raise unless the server advertised ``capability`` — fail fast before a round-trip. (§6.4)

    Mirrors the TS ``assertServerCapability``: a missing capability raises a
    :class:`RequestError` with the ``-32003`` missing-capability code.
    """
    if not self.server_supports(capability):
      raise RequestError(
        MISSING_CLIENT_CAPABILITY_CODE, f'Server does not advertise the "{capability}" capability'
      )

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
    """``ping`` — a no-op round-trip to check liveness."""
    return self.request("ping")

  def list_tools(self, cursor: str | None = None) -> dict:
    """``tools/list`` — one page of tools (pass a cursor, or use :meth:`list_all_tools`). (§16.2)

    M1 (§9.5.1): excludes tools whose ``x-mcp-header`` parameter annotations are invalid,
    keeping every valid tool usable (R-9.5.1-i/j). §9.5.2: remembers each tool's ``inputSchema``
    so a later ``tools/call`` can emit ``Mcp-Param-*`` routing headers.
    """
    result = self.request("tools/list", _cursor_params(cursor))
    tools = result.get("tools")
    if isinstance(tools, list):
      filtered = filter_valid_tools(tools).tools
      result["tools"] = filtered
      for tool in filtered:
        if isinstance(tool, dict) and isinstance(tool.get("name"), str):
          self._tool_schemas[tool["name"]] = tool.get("inputSchema")
          if isinstance(tool.get("outputSchema"), dict):
            self._tool_output_schemas[tool["name"]] = tool["outputSchema"]
    return result

  def call_tool(self, name: str, arguments: dict | None = None, *, meta: dict | None = None) -> dict:
    """``tools/call`` — invoke a tool, driving the §11 MRTR loop for any required client input.

    A tool needing client input (elicitation/sampling/roots) returns ``input_required``, which is
    fulfilled by the registered handlers and retried. ``meta`` carries caller ``_meta`` (e.g. a
    W3C ``traceparent``) on the wire. (§16.5)

    The result passes through the §16.6/§28.3 receive-path guards (``outputSchema`` validation
    and optional text sanitization); a pre-dispatch hook (if installed) reviews the arguments
    first.
    """
    args = arguments or {}
    self._review_before_dispatch(name, args)
    result = self.request_with_input("tools/call", {"name": name, "arguments": args}, meta_extra=meta)
    return self._finalize_tool_result(name, result)

  def call_tool_cancellable(self, name: str, arguments: dict | None, cancel_id: str) -> dict:
    """A cancellable, progress-reporting ``tools/call`` (abort later via :meth:`cancel`)."""
    args = arguments or {}
    self._review_before_dispatch(name, args)
    result = self.request_with_input(
      "tools/call", {"name": name, "arguments": args}, cancel_id=cancel_id, progress=True
    )
    return self._finalize_tool_result(name, result)

  def call_tool_with_meta(self, name: str, arguments: dict | None, meta: dict) -> dict:
    """A ``tools/call`` carrying caller ``_meta`` (e.g. W3C ``traceparent``) on the wire."""
    args = arguments or {}
    self._review_before_dispatch(name, args)
    result = self.request_with_input("tools/call", {"name": name, "arguments": args}, meta_extra=meta)
    return self._finalize_tool_result(name, result)

  def _review_before_dispatch(self, name: str, arguments: dict) -> None:
    """Invoke the installed pre-dispatch review hook (if any) with the exact arguments about
    to be sent. The hook may raise to veto the call. (§28.6, RC-6)
    """
    if self._pre_dispatch_hook is not None:
      self._pre_dispatch_hook(name, arguments)

  def list_resources(self, cursor: str | None = None) -> dict:
    """``resources/list`` — one page of resources. (§17.2)"""
    return self.request("resources/list", _cursor_params(cursor))

  def list_resource_templates(self, cursor: str | None = None) -> dict:
    """``resources/templates/list`` — one page of resource templates. (§17.3)"""
    return self.request("resources/templates/list", _cursor_params(cursor))

  def read_resource(self, uri: str) -> dict:
    """``resources/read`` — read a resource by URI. (§17.5)

    When text sanitization is enabled (see the ``sanitize_tool_text`` constructor flag),
    control sequences are stripped from the returned text contents. (§28.3, R-28.3-i)
    """
    result = self.request("resources/read", {"uri": uri})
    return _sanitize_result_text(result) if self._sanitize_tool_text else result

  def list_prompts(self, cursor: str | None = None) -> dict:
    """``prompts/list`` — one page of prompts. (§18.2)"""
    return self.request("prompts/list", _cursor_params(cursor))

  def get_prompt(self, name: str, arguments: dict | None = None) -> dict:
    """``prompts/get`` — resolve a prompt with arguments. (§18.4)"""
    return self.request("prompts/get", {"name": name, "arguments": arguments or {}})

  def complete(self, ref: dict, argument: dict, context: dict | None = None) -> dict:
    """``completion/complete`` — argument autocompletion. (§19.2)"""
    params = {"ref": ref, "argument": argument}
    if context is not None:
      params["context"] = context
    return self.request("completion/complete", params)

  def set_logging_level(self, level: str) -> dict:
    """``logging/setLevel`` — set the minimum log severity the server emits. (§15.3, Deprecated)"""
    return self.request("logging/setLevel", {"level": level})

  def raw(self, method: str, params: dict | None = None) -> dict:
    """Escape hatch: issue an arbitrary method with the ``_meta`` envelope applied."""
    return self.request(method, params)

  # ── pagination auto-iteration (§12) ──
  def paginate(self, method: str, items_key: str) -> Iterator[dict]:
    """Lazily iterate every item of a paginated list method, following ``nextCursor`` until
    the server stops returning one. (§12.3)

    :param method: the paginated list method (e.g. ``"tools/list"``).
    :param items_key: the result key holding the page array (e.g. ``"tools"``).
    """
    cursor: str | None = None
    while True:
      result = self.request(method, _cursor_params(cursor))
      for item in result.get(items_key) or []:
        yield item
      next_cursor = result.get("nextCursor")
      # Absence of nextCursor (NOT a falsy '') signals the last page; an empty-string
      # nextCursor is a present cursor that MUST be echoed to fetch the next page.
      # (R-12.3-d, R-12.3-e)
      if not isinstance(next_cursor, str):
        return
      cursor = next_cursor

  def list_all_tools(self) -> Iterator[dict]:
    """Iterate all tools across pages. (§16.2)"""
    return self.paginate("tools/list", "tools")

  def list_all_resources(self) -> Iterator[dict]:
    """Iterate all resources across pages. (§17.2)"""
    return self.paginate("resources/list", "resources")

  def list_all_prompts(self) -> Iterator[dict]:
    """Iterate all prompts across pages. (§18.2)"""
    return self.paginate("prompts/list", "prompts")

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
        raise RequestError(INTERNAL_ERROR_CODE, f"Multi-round-trip error: {decision.reason}")
      if not guard.record_round():
        raise RequestError(INTERNAL_ERROR_CODE, f"Multi-round-trip exceeded {guard.max_rounds} rounds")
      input_responses: dict = {}
      for key, request in (decision.result.get("inputRequests") or {}).items():
        handler = self._request_handlers.get(request["method"])
        if handler is None:
          raise RequestError(METHOD_NOT_FOUND_CODE, f'No handler registered for input-request kind "{request["method"]}"')
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

  def update_task(self, task_id: str, input_responses: dict) -> dict:
    """``tasks/update`` — supply input to an ``input_required`` task. (§25.8)"""
    return self.request("tasks/update", {"taskId": task_id, "inputResponses": input_responses})

  def cancel_task(self, task_id: str) -> dict:
    """``tasks/cancel`` — request cooperative cancellation of a task. (§25.9)"""
    return self.request("tasks/cancel", {"taskId": task_id})

  def poll_task_until_terminal(
    self,
    task_id: str,
    *,
    interval_ms: int = 500,
    timeout_ms: int | None = None,
  ) -> dict:
    """Poll ``tasks/get`` until the task reaches a terminal status, then return the final task.

    Polls until ``status`` is ``completed`` / ``failed`` / ``cancelled`` (§25.5); honors an
    overall ``timeout_ms`` (raising a :class:`RequestError` on expiry). Mirrors the TS
    ``pollTaskUntilTerminal``.
    """
    deadline = (time.monotonic() + timeout_ms / 1000) if timeout_ms else None
    while True:
      task = self.get_task(task_id)
      status = str(task.get("status") or "")
      if status in ("completed", "failed", "cancelled"):
        return task
      if deadline is not None and time.monotonic() > deadline:
        raise RequestError(INTERNAL_ERROR_CODE, f"task {task_id} did not finish within {timeout_ms}ms")
      time.sleep(interval_ms / 1000)

  # ── §10 subscriptions ──
  def subscribe(
    self,
    notifications: dict,
    on_notification: Callable[[str, dict], None] | None = None,
  ) -> SubscriptionHandle:
    """Open a ``subscriptions/listen`` stream, returning a handle immediately. (§10)

    This SDK drives a SYNCHRONOUS transport: inbound interim frames (the acknowledgement and
    the change notifications) arrive through the ``set_on_message`` tap, NOT as the return of
    a blocking call. So unlike a thread that could await the ack, :meth:`subscribe` MUST NOT
    block the caller waiting for it — doing so would deadlock a single-threaded driver that
    can only feed the ack in *after* :meth:`subscribe` returns. Instead it sends the listen
    request and returns a :class:`SubscriptionHandle` right away; the acknowledgement, when it
    is delivered through the tap, populates :attr:`SubscriptionHandle.acknowledged_filter` and
    sets :attr:`SubscriptionHandle.acknowledged` (mirroring the TS host, whose ``subscribe``
    resolves the handle from the ack delivered to its message pump).

    The honored change notifications are routed to ``on_notification`` (invoked as
    ``on_notification(method, params)``). The handle's ``closed`` event is set at teardown, and
    :meth:`SubscriptionHandle.unsubscribe` tears the stream down by sending
    ``notifications/cancelled`` for the listen request.

    The server MAY instead reject the listen request outright with a single response (e.g.
    ``-32003`` when ``taskIds`` is supplied without the negotiated tasks capability, §25.10,
    R-25.10-f). That rejection rides the same inbound tap as a normal error frame; it is not
    raised here because :meth:`subscribe` no longer blocks on the round-trip.
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

    # Register the change-notification router up front so a notification that arrives between
    # the ack and the caller observing the handle is still delivered (the §10 stream is ordered
    # after the acknowledgement, but routing is registered eagerly to avoid any race).
    if on_notification is not None:
      self._subscription_routers[subscription_id] = on_notification

    # Open the stream first; a transport that surfaces its own stream-closed event lets
    # unsubscribe()/disconnect drive it, otherwise the handle owns a fresh one.
    self._tap("send", message)
    stream = opener(message, lambda: None)
    stream_closed = getattr(stream, "closed", None)
    closed = stream_closed if isinstance(stream_closed, threading.Event) else threading.Event()

    def unsubscribe() -> None:
      self._subscription_routers.pop(subscription_id, None)
      self._subscription_acks.pop(subscription_id, None)
      self.notify("notifications/cancelled", {"requestId": listen_id, "reason": "unsubscribe"})
      closed.set()

    handle = SubscriptionHandle(subscription_id, closed, unsubscribe)

    # Resolve the acknowledgement (delivered later through the inbound tap) onto the handle.
    def on_ack(params: dict) -> None:
      self._subscription_acks.pop(subscription_id, None)
      acknowledged = params.get("notifications")
      handle.acknowledged_filter = acknowledged if isinstance(acknowledged, dict) else {}
      handle.acknowledged.set()

    self._subscription_acks[subscription_id] = on_ack

    return handle
