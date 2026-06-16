"""Streamable HTTP client transport (MCP 2026-07-28, §9) — stateless, streaming.

POSTs one JSON-RPC request to the single MCP endpoint and returns the correlated
final response, transparently handling both server response shapes (§9.6):

* a single ``application/json`` body → returned directly;
* a ``text/event-stream`` → each interim frame (request-scoped notifications, and
  any server→client request) is surfaced via the ``on_message`` tap, and the final
  response (matching the request id) is returned.

It mirrors the body's ``_meta`` revision into ``MCP-Protocol-Version`` and sets the
required ``Accept`` + routing headers (``Mcp-Method`` / ``Mcp-Name``, §9.4). An
optional ``auth_provider`` supplies a bearer token for a protected resource (§23).
Notifications and the client's replies to server→client requests are POSTed and
expect ``202``. ``open_subscription`` reads a long-lived ``subscriptions/listen``
stream on a background thread (§10).
"""

from __future__ import annotations

import json
import threading
from collections.abc import Callable, Iterator

import httpx

from mcp.client.transport import ClientTransport, ClientTransportError
from mcp.protocol.meta import CURRENT_PROTOCOL_VERSION, PROTOCOL_VERSION_META_KEY

#: Methods that carry an ``Mcp-Name`` routing header, and the param field it mirrors. (§9.4.2)
_NAME_METHODS = {"tools/call": "name", "prompts/get": "name", "resources/read": "uri"}


def _routing_name(method: str, params: dict | None) -> str | None:
  """Return the ``Mcp-Name`` value for ``method`` from its params, or ``None``."""
  field = _NAME_METHODS.get(method)
  if field is None or not isinstance(params, dict):
    return None
  value = params.get(field)
  return value if isinstance(value, str) else None


def _iter_sse(response: httpx.Response) -> Iterator[dict]:
  """Yield each JSON-RPC frame parsed from an SSE response's ``data:`` events."""
  data_lines: list[str] = []
  for line in response.iter_lines():
    if line == "":
      if data_lines:
        payload = "\n".join(data_lines)
        data_lines = []
        try:
          yield json.loads(payload)
        except ValueError:
          pass
      continue
    if line.startswith(":"):
      continue  # comment / keep-alive
    if line.startswith("data:"):
      rest = line[5:]
      data_lines.append(rest[1:] if rest.startswith(" ") else rest)
    # event:/id:/retry: fields are irrelevant to JSON-RPC framing.
  if data_lines:
    try:
      yield json.loads("\n".join(data_lines))
    except ValueError:
      pass


def _is_final_response(frame: object, request_id: object) -> bool:
  """Return ``True`` when ``frame`` is the final response (result|error) for ``request_id``."""
  return (
    isinstance(frame, dict)
    and frame.get("id") == request_id
    and ("result" in frame or "error" in frame)
  )


class SubscriptionStream:
  """A handle to a background ``subscriptions/listen`` stream (§10)."""

  def __init__(self, thread: threading.Thread, closed: threading.Event) -> None:
    self._thread = thread
    self.closed = closed


class StreamableHttpClientTransport(ClientTransport):
  """A stateless, streaming Streamable HTTP client transport for a single MCP endpoint."""

  def __init__(
    self,
    url: str,
    *,
    protocol_version: str = CURRENT_PROTOCOL_VERSION,
    timeout: float = 120.0,
    auth_provider: Callable[[], str | None] | None = None,
  ) -> None:
    self._url = url
    self._protocol_version = protocol_version
    self._auth_provider = auth_provider
    self._client = httpx.Client(timeout=httpx.Timeout(timeout, read=None))
    self._on_message: Callable[[dict], None] | None = None

  def set_on_message(self, callback: Callable[[dict], None] | None) -> None:
    """Install a tap invoked with every inbound frame (interim + final). Used for the wire view."""
    self._on_message = callback

  def _emit(self, frame: dict) -> None:
    if self._on_message is not None:
      try:
        self._on_message(frame)
      except Exception:  # noqa: BLE001 — a tap must never break the transport
        pass

  def _headers(self, message: dict) -> dict[str, str]:
    method = message.get("method")
    meta = (message.get("params") or {}).get("_meta") or {}
    version = meta.get(PROTOCOL_VERSION_META_KEY, self._protocol_version)
    headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": version,
    }
    if isinstance(method, str):
      headers["Mcp-Method"] = method
      name = _routing_name(method, message.get("params"))
      if name is not None:
        headers["Mcp-Name"] = name
    if self._auth_provider is not None:
      token = self._auth_provider()
      if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

  def request(self, message: dict) -> dict:
    """POST a request; return its final response (reading an SSE stream when present)."""
    headers = self._headers(message)
    request_id = message.get("id")
    try:
      with self._client.stream("POST", self._url, headers=headers, content=json.dumps(message)) as response:
        content_type = (response.headers.get("content-type") or "").lower()
        if "text/event-stream" in content_type:
          final: dict | None = None
          for frame in _iter_sse(response):
            self._emit(frame)
            if _is_final_response(frame, request_id):
              final = frame
          if final is None:
            raise ClientTransportError("event stream closed before the final response")
          return final
        body = response.read()
    except httpx.HTTPError as exc:
      raise ClientTransportError(f"transport failure contacting {self._url}: {exc}") from exc

    try:
      parsed = json.loads(body.decode("utf-8"))
    except ValueError as exc:
      raise ClientTransportError("server returned a non-JSON response") from exc
    if isinstance(parsed, dict):
      self._emit(parsed)
    return parsed

  def send(self, message: dict) -> None:
    """POST a notification or a client→server response; expect ``202`` (body ignored)."""
    headers = self._headers(message)
    try:
      response = self._client.post(self._url, headers=headers, content=json.dumps(message))
    except httpx.HTTPError as exc:
      raise ClientTransportError(f"transport failure contacting {self._url}: {exc}") from exc
    if response.status_code // 100 != 2:
      raise ClientTransportError(f"notification rejected with HTTP {response.status_code}")

  def open_subscription(self, message: dict, on_ready: Callable[[], None]) -> SubscriptionStream:
    """Open a long-lived ``subscriptions/listen`` stream on a background thread (§10).

    Every frame (the acknowledgement and each change notification) is surfaced via the
    ``on_message`` tap; ``on_ready`` is invoked once the stream is established. The
    returned handle's ``closed`` event is set when the stream ends (teardown / disconnect).
    """
    headers = self._headers(message)
    closed = threading.Event()

    def run() -> None:
      try:
        on_ready()
        with self._client.stream("POST", self._url, headers=headers, content=json.dumps(message)) as response:
          for frame in _iter_sse(response):
            self._emit(frame)
      except httpx.HTTPError:
        pass
      finally:
        closed.set()

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return SubscriptionStream(thread, closed)

  def close(self) -> None:
    """Release the underlying HTTP connection pool."""
    self._client.close()
