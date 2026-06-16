"""Interactive UI Extension II: UI-to-Host Dialect, Registry & Security (§26.5–§26.9).

The runtime, *dynamic* half of the OPTIONAL Interactive User-Interface ("apps")
extension: the JSON-RPC 2.0 message dialect a rendered UI (running in its sandbox)
speaks with its host over a host-provided channel, the verbatim method/notification name
registry that dialect uses, and the normative security/consent model a host MUST enforce
around it. :mod:`mcp.protocol.ui` established *what* a UI is and how it is declared and
served; this module defines *how* it talks to the host once rendered, and how that
channel is kept safe.

The dialect is framed identically to core MCP (§3): every message is a JSON-RPC request,
response, or notification. It reuses a small subset of core method names verbatim
(``tools/call``, ``resources/read``, ``ping``, ``notifications/message``) and adds the
``ui/``-prefixed names. Its handshake carries its OWN protocol-version revision
(:data:`UI_DIALECT_PROTOCOL_VERSION`, ``"2026-01-26"``) — independent of the core
revision negotiated at ``server/discover``.

As with :mod:`mcp.protocol.ui`, rendering, sandboxing, CSP/permission enforcement,
running the channel runtime, and obtaining user consent are HOST responsibilities and
are NOT obligations of a server SDK (R-26.9-d). This module therefore models the dialect
declaratively — message validators, the registry, and host predicates/builders a host
implementation can consult — but never renders anything and takes no browser/UI-toolkit
dependency.

REUSE (never redefined here):

* the §26.1–§26.4 UI symbols — :mod:`mcp.protocol.ui`
  (:func:`~mcp.protocol.ui.host_should_reject_ui_originated_call`,
  :func:`~mcp.protocol.ui.is_ui_permissions`,
  :func:`~mcp.protocol.ui.is_ui_content_security_policy`, …);
* the JSON-RPC framing — :mod:`mcp.jsonrpc.framing`
  (:func:`~mcp.jsonrpc.framing.classify_message`,
  :class:`~mcp.jsonrpc.framing.MalformedMessageError`);
* the §22 error model — :mod:`mcp.protocol.errors`
  (:data:`~mcp.protocol.errors.METHOD_NOT_FOUND_CODE`,
  :data:`~mcp.protocol.errors.INVALID_PARAMS_CODE`,
  :data:`~mcp.protocol.errors.INTERNAL_ERROR_CODE`,
  :func:`~mcp.protocol.errors.build_error_object`);
* the core logging notification method name — :mod:`mcp.protocol.logging`
  (:data:`~mcp.protocol.logging.LOGGING_MESSAGE_METHOD`);
* the §14 content-block shape — :func:`~mcp.types.content.is_valid_content_block`.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, StrictBool

from mcp._model import JsonNumber, McpModel, validates
from mcp.jsonrpc.framing import MalformedMessageError, classify_message
from mcp.protocol.errors import (
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  METHOD_NOT_FOUND_CODE,
  build_error_object,
)
from mcp.protocol.logging import LOGGING_MESSAGE_METHOD
from mcp.protocol.ui import (
  UiContentSecurityPolicy,
  UiPermissions,
  host_should_reject_ui_originated_call,
)
from mcp.types.content import parse_content_block


def _is_object(value: object) -> bool:
  return isinstance(value, dict)


def _is_number(value: object) -> bool:
  """Return ``True`` for a JSON number (``int``/``float``) that is not a ``bool``."""
  return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_content_blocks(items: Any) -> list:
  """Validate a §14 ``ContentBlock`` array (each via :func:`parse_content_block`)."""
  if not isinstance(items, list):
    raise ValueError("content MUST be an array of ContentBlock")
  return [parse_content_block(block) for block in items]


#: A display mode + a §14 ``ContentBlock`` array, as field types for the dialect models.
UiDisplayMode = Literal["inline", "fullscreen", "pip"]
_ContentBlockList = Annotated[list[Any], BeforeValidator(_validate_content_blocks)]


# ─── §26.5 — Dialect protocol version ─────────────────────────────────────────

#: The exact, case-sensitive protocol-version string carried in this dialect's
#: initialization handshake. It identifies the *message-dialect* revision and is
#: INDEPENDENT of the core protocol revision negotiated at ``server/discover``.
#: This is deliberately a distinct constant from any core-revision string: the two
#: revisions evolve separately, and conflating them is a conformance error.
#: (§26.5, R-26.5-b)
UI_DIALECT_PROTOCOL_VERSION = "2026-01-26"


def is_ui_dialect_protocol_version(value: object) -> bool:
  """Return ``True`` when ``value`` is exactly :data:`UI_DIALECT_PROTOCOL_VERSION` —
  matched byte-for-byte and case-sensitively. (R-26.5-b)
  """
  return value == UI_DIALECT_PROTOCOL_VERSION


# ─── §26.5.1 — Display modes ──────────────────────────────────────────────────

#: The three display modes a UI may run in / request. ``"inline"`` — embedded inline
#: within the host surface; ``"fullscreen"`` — occupying the whole host viewport;
#: ``"pip"`` — a picture-in-picture / floating presentation. (§26.5.1, §26.5.3)
UI_DISPLAY_MODES = ("inline", "fullscreen", "pip")


def is_ui_display_mode(value: object) -> bool:
  """Return ``True`` when ``value`` is one of the exact display-mode enum strings,
  matched case-sensitively. (§26.5.1)
  """
  return value in UI_DISPLAY_MODES


# ─── §26.6 — Method & notification name registry (verbatim) ───────────────────

#: The complete set of dialect method and notification names, reproduced VERBATIM and
#: case-sensitively. These are the only names a conforming dialect message may carry; a
#: name that is not byte-for-byte one of these is not part of the dialect.
#: ``LOG_MESSAGE`` is the core logging method name reused verbatim. (§26.6, R-26.5-a)
UI_DIALECT_METHODS: dict[str, str] = {
  "INITIALIZE": "ui/initialize",
  "INITIALIZED": "ui/notifications/initialized",
  "TOOL_INPUT": "ui/notifications/tool-input",
  "TOOL_INPUT_PARTIAL": "ui/notifications/tool-input-partial",
  "TOOL_RESULT": "ui/notifications/tool-result",
  "TOOL_CANCELLED": "ui/notifications/tool-cancelled",
  "TOOLS_CALL": "tools/call",
  "RESOURCES_READ": "resources/read",
  "OPEN_LINK": "ui/open-link",
  "MESSAGE": "ui/message",
  "REQUEST_DISPLAY_MODE": "ui/request-display-mode",
  "UPDATE_MODEL_CONTEXT": "ui/update-model-context",
  "LOG_MESSAGE": LOGGING_MESSAGE_METHOD,
  "PING": "ping",
  "SIZE_CHANGED": "ui/notifications/size-changed",
  "HOST_CONTEXT_CHANGED": "ui/notifications/host-context-changed",
  "RESOURCE_TEARDOWN": "ui/resource-teardown",
  "SANDBOX_PROXY_READY": "ui/notifications/sandbox-proxy-ready",
  "SANDBOX_RESOURCE_READY": "ui/notifications/sandbox-resource-ready",
}


@dataclass(frozen=True)
class UiDialectRegistryEntry:
  """One row of the §26.6 registry: the verbatim name, its kind, and its direction."""

  #: The verbatim, case-sensitive method/notification name. (R-26.5-a)
  name: str
  #: Whether the message is a ``"request"`` or a ``"notification"``.
  kind: str
  #: Which side originates the message (the §26.6 "Sender" column): one of
  #: ``"ui-to-host"``, ``"host-to-ui"``, ``"ui-or-host"``, ``"sandbox-to-host"``,
  #: ``"host-to-sandbox"``.
  sender: str


#: The complete §26.6 registry, in spec order: all 19 distinct names with their kind and
#: direction. The host validates a dialect message's ``method`` against this table
#: byte-for-byte. (§26.6, R-26.5-a; covers AC-42.1)
UI_DIALECT_REGISTRY: tuple[UiDialectRegistryEntry, ...] = (
  UiDialectRegistryEntry(UI_DIALECT_METHODS["INITIALIZE"], "request", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["INITIALIZED"], "notification", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["TOOL_INPUT"], "notification", "host-to-ui"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["TOOL_INPUT_PARTIAL"], "notification", "host-to-ui"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["TOOL_RESULT"], "notification", "host-to-ui"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["TOOL_CANCELLED"], "notification", "host-to-ui"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["TOOLS_CALL"], "request", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["RESOURCES_READ"], "request", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["OPEN_LINK"], "request", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["MESSAGE"], "request", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["REQUEST_DISPLAY_MODE"], "request", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["UPDATE_MODEL_CONTEXT"], "request", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["LOG_MESSAGE"], "notification", "ui-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["PING"], "request", "ui-or-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["SIZE_CHANGED"], "notification", "host-to-ui"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["HOST_CONTEXT_CHANGED"], "notification", "host-to-ui"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["RESOURCE_TEARDOWN"], "request", "host-to-ui"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["SANDBOX_PROXY_READY"], "notification", "sandbox-to-host"),
  UiDialectRegistryEntry(UI_DIALECT_METHODS["SANDBOX_RESOURCE_READY"], "notification", "host-to-sandbox"),
)

#: O(1) name → entry lookup over the registry.
_UI_DIALECT_BY_NAME: dict[str, UiDialectRegistryEntry] = {e.name: e for e in UI_DIALECT_REGISTRY}


def is_ui_dialect_method_name(name: object) -> bool:
  """Return ``True`` when ``name`` is one of the verbatim dialect method/notification
  names — matched byte-for-byte and case-sensitively, so ``"UI/Initialize"`` or
  ``"ui/Initialize"`` do NOT match. (§26.6, R-26.5-a; AC-42.1)
  """
  return isinstance(name, str) and name in _UI_DIALECT_BY_NAME


def ui_dialect_registry_entry(name: str) -> UiDialectRegistryEntry | None:
  """Return the §26.6 registry entry for ``name``, or ``None`` if not a dialect name."""
  return _UI_DIALECT_BY_NAME.get(name)


# ─── §26.5.1 — ui/initialize request params ───────────────────────────────────


class _ListChangedCapability(McpModel):
  """A ``{ listChanged?: boolean }`` capability bag (strict bool)."""

  list_changed: StrictBool | None = None


class UiClientInfo(McpModel):
  """``UiClientInfo`` (§26.5.1): REQUIRED string ``name`` + ``version``."""

  name: str
  version: str


class UiAppCapabilities(McpModel):
  """``UiAppCapabilities`` (§26.5.1): all OPTIONAL — ``experimental``, ``tools``
  (``{listChanged?}``), ``availableDisplayModes`` (display-mode array).
  """

  experimental: dict[str, Any] | None = None
  tools: _ListChangedCapability | None = None
  available_display_modes: list[UiDisplayMode] | None = None


class UiInitializeParams(McpModel):
  """``ui/initialize`` params (§26.5.1) — all OPTIONAL (a UI MAY open with no params):
  ``protocolVersion``, ``clientInfo``, ``appCapabilities``.
  """

  protocol_version: str | None = None
  client_info: UiClientInfo | None = None
  app_capabilities: UiAppCapabilities | None = None


def is_valid_ui_client_info(value: object) -> bool:
  """Return ``True`` for valid ``UiClientInfo`` — REQUIRED string ``name`` and ``version``. (§26.5.1)"""
  return validates(UiClientInfo, value)


def is_valid_ui_app_capabilities(value: object) -> bool:
  """Return ``True`` for valid ``UiAppCapabilities``. (§26.5.1)"""
  return validates(UiAppCapabilities, value)


def is_valid_ui_initialize_params(value: object) -> bool:
  """Return ``True`` for valid ``UiInitializeParams``. (§26.5.1)"""
  return validates(UiInitializeParams, value)


# ─── §26.5.1 — UiHostContext ──────────────────────────────────────────────────

#: The active theme. (§26.5.1)
UI_THEMES = ("light", "dark")
#: The host platform. (§26.5.1)
UI_PLATFORMS = ("web", "desktop", "mobile")


class UiHostInfo(McpModel):
  """``UiHostInfo`` (§26.5.1): REQUIRED string ``name`` + ``version``."""

  name: str
  version: str


class _UiToolInfo(McpModel):
  """``UiHostContext.toolInfo``: OPTIONAL ``id`` (string/number) + REQUIRED ``tool`` object."""

  id: str | JsonNumber | None = None
  tool: dict[str, Any]


class _UiCss(McpModel):
  fonts: str | None = None


class _UiStyles(McpModel):
  variables: dict[str, str] | None = None
  css: _UiCss | None = None


class _UiContainerDimensions(McpModel):
  height: JsonNumber | None = None
  max_height: JsonNumber | None = None
  width: JsonNumber | None = None
  max_width: JsonNumber | None = None


class _UiDeviceCapabilities(McpModel):
  touch: StrictBool | None = None
  hover: StrictBool | None = None


class _UiSafeAreaInsets(McpModel):
  top: JsonNumber
  right: JsonNumber
  bottom: JsonNumber
  left: JsonNumber


class UiHostContext(McpModel):
  """The rendering environment a host delivers to a UI (§26.5.1) — also the PARTIAL shape of
  ``ui/notifications/host-context-changed`` (§26.5.4). Every member is OPTIONAL, so the same
  model accepts the full initial context and a partial change (``{}`` is valid).
  """

  tool_info: _UiToolInfo | None = None
  theme: Literal["light", "dark"] | None = None
  styles: _UiStyles | None = None
  display_mode: UiDisplayMode | None = None
  available_display_modes: list[str] | None = None
  container_dimensions: _UiContainerDimensions | None = None
  locale: str | None = None
  time_zone: str | None = None
  user_agent: str | None = None
  platform: Literal["web", "desktop", "mobile"] | None = None
  device_capabilities: _UiDeviceCapabilities | None = None
  safe_area_insets: _UiSafeAreaInsets | None = None


def is_valid_ui_host_info(value: object) -> bool:
  """Return ``True`` for valid ``UiHostInfo`` — REQUIRED string ``name`` and ``version``. (§26.5.1)"""
  return validates(UiHostInfo, value)


def is_valid_ui_host_context(value: object) -> bool:
  """Return ``True`` for valid ``UiHostContext`` — the rendering environment the host
  delivers to the UI in the initialize result, and (as a PARTIAL) in
  ``ui/notifications/host-context-changed``. Every member is OPTIONAL. (§26.5.1, §26.5.4)
  """
  return validates(UiHostContext, value)


# ─── §26.5.1 — UiInitializeResult ─────────────────────────────────────────────


class UiSandboxReport(McpModel):
  """``UiSandboxReport`` (§26.5.1, §26.7): the EFFECTIVE ``csp`` the host applied and the
  GRANTED ``permissions`` set; both OPTIONAL. (R-26.7-g/-h)
  """

  permissions: UiPermissions | None = None
  csp: UiContentSecurityPolicy | None = None


class UiHostCapabilities(McpModel):
  """``UiHostCapabilities`` (§26.5.1): all OPTIONAL — ``experimental`` / ``openLinks`` /
  ``logging`` objects, ``serverTools`` / ``serverResources`` (``{listChanged?}`` bags), and
  the ``sandbox`` report.
  """

  experimental: dict[str, Any] | None = None
  open_links: dict[str, Any] | None = None
  logging: dict[str, Any] | None = None
  server_tools: _ListChangedCapability | None = None
  server_resources: _ListChangedCapability | None = None
  sandbox: UiSandboxReport | None = None


class UiInitializeResult(McpModel):
  """The host's reply to ``ui/initialize`` (§26.5.1): REQUIRED string ``protocolVersion``;
  OPTIONAL ``hostInfo`` / ``hostCapabilities`` / ``hostContext``. (R-26.5.1-b)
  """

  protocol_version: str
  host_info: UiHostInfo | None = None
  host_capabilities: UiHostCapabilities | None = None
  host_context: UiHostContext | None = None


def is_valid_ui_sandbox_report(value: object) -> bool:
  """Return ``True`` for valid ``UiSandboxReport`` — effective CSP + granted permissions. (§26.5.1, §26.7)"""
  return validates(UiSandboxReport, value)


def is_valid_ui_host_capabilities(value: object) -> bool:
  """Return ``True`` for valid ``UiHostCapabilities`` — host capabilities in the initialize result. (§26.5.1)"""
  return validates(UiHostCapabilities, value)


def is_ui_initialize_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``UiInitializeResult`` — REQUIRED string
  ``protocolVersion``; OPTIONAL host info/capabilities/context. (§26.5.1, R-26.5.1-b; AC-42.4)
  """
  return validates(UiInitializeResult, value)


# ─── §26.5.2 — Host → UI delivery notification params ─────────────────────────


class ToolInputParams(McpModel):
  """``ui/notifications/tool-input`` (and ``-partial``) params (§26.5.2): a REQUIRED
  ``arguments`` object (the complete or partial tool arguments).
  """

  arguments: dict[str, Any]


class ToolResultParams(McpModel):
  """``ui/notifications/tool-result`` params (§26.5.2): the §16 tool-result shape — all
  OPTIONAL ``content`` (ContentBlock array), ``structuredContent`` (any), ``isError``, ``_meta``.
  """

  content: _ContentBlockList | None = None
  structured_content: Any = None
  is_error: StrictBool | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


class ToolCancelledParams(McpModel):
  """``ui/notifications/tool-cancelled`` params (§26.5.2): a REQUIRED string ``reason``."""

  reason: str


def is_valid_tool_input_params(value: object) -> bool:
  """Return ``True`` for valid ``ToolInputParams`` — a REQUIRED ``arguments`` object. (§26.5.2)"""
  return validates(ToolInputParams, value)


def is_valid_tool_result_params(value: object) -> bool:
  """Return ``True`` for valid ``ToolResultParams`` — the §16 tool-result shape. (§26.5.2)"""
  return validates(ToolResultParams, value)


def is_valid_tool_cancelled_params(value: object) -> bool:
  """Return ``True`` for valid ``ToolCancelledParams`` — a REQUIRED string ``reason``. (§26.5.2)"""
  return validates(ToolCancelledParams, value)


# ─── §26.5.3 — UI → Host request params/results ───────────────────────────────


class _UiTextContent(McpModel):
  """A single ``ui/message`` text block: ``type: "text"`` + string ``text``. (§26.5.3)"""

  type: Literal["text"]
  text: str


class ToolsCallParams(McpModel):
  """UI-initiated ``tools/call`` params (§26.5.3): REQUIRED string ``name``, OPTIONAL
  ``arguments`` object.
  """

  name: str
  arguments: dict[str, Any] | None = None


class OpenLinkParams(McpModel):
  """``ui/open-link`` params (§26.5.3): a REQUIRED string ``url``."""

  url: str


class UiMessageParams(McpModel):
  """``ui/message`` params (§26.5.3): ``role`` always ``"user"``; ``content`` a single text block."""

  role: Literal["user"]
  content: _UiTextContent


class RequestDisplayModeParams(McpModel):
  """``ui/request-display-mode`` params (§26.5.3): a REQUIRED display-mode ``mode``."""

  mode: UiDisplayMode


class RequestDisplayModeResult(McpModel):
  """``ui/request-display-mode`` result (§26.5.3): the display-mode ``mode`` the host actually
  applied (MAY differ from the requested one). (R-26.5.3-e)
  """

  mode: UiDisplayMode


class UpdateModelContextParams(McpModel):
  """``ui/update-model-context`` params (§26.5.3): all OPTIONAL — ``content`` (ContentBlock
  array), ``structuredContent`` (any).
  """

  content: _ContentBlockList | None = None
  structured_content: Any = None


def is_valid_tools_call_params(value: object) -> bool:
  """Return ``True`` for valid ``ToolsCallParams`` — REQUIRED ``name``, OPTIONAL ``arguments``. (§26.5.3)"""
  return validates(ToolsCallParams, value)


def is_valid_open_link_params(value: object) -> bool:
  """Return ``True`` for valid ``OpenLinkParams`` — a REQUIRED string ``url``. (§26.5.3)"""
  return validates(OpenLinkParams, value)


def is_valid_ui_message_params(value: object) -> bool:
  """Return ``True`` for valid ``UiMessageParams`` — ``role: "user"`` + a single text block. (§26.5.3)"""
  return validates(UiMessageParams, value)


def is_valid_request_display_mode_params(value: object) -> bool:
  """Return ``True`` for valid ``RequestDisplayModeParams`` — a REQUIRED display-mode ``mode``. (§26.5.3)"""
  return validates(RequestDisplayModeParams, value)


def is_valid_request_display_mode_result(value: object) -> bool:
  """Return ``True`` for valid ``RequestDisplayModeResult`` — the applied display-mode ``mode``. (§26.5.3)"""
  return validates(RequestDisplayModeResult, value)


def is_valid_update_model_context_params(value: object) -> bool:
  """Return ``True`` for valid ``UpdateModelContextParams`` — OPTIONAL ``content`` / ``structuredContent``. (§26.5.3)"""
  return validates(UpdateModelContextParams, value)


class PingParams(McpModel):
  """``ping`` params (§26.5.3): an object carrying no required parameters. (R-26.5.3-f)"""


def is_valid_ping_params(value: object) -> bool:
  """Return ``True`` for valid ``PingParams`` — an object with no required parameters. (§26.5.3)"""
  return validates(PingParams, value)


# ─── §26.5.4 — Host → UI lifecycle / context-change params ────────────────────


class SizeChangedParams(McpModel):
  """``ui/notifications/size-changed`` params (§26.5.4): REQUIRED numeric ``width`` + ``height``."""

  width: JsonNumber
  height: JsonNumber


def is_valid_size_changed_params(value: object) -> bool:
  """Return ``True`` for valid ``SizeChangedParams`` — REQUIRED numeric ``width`` and ``height``. (§26.5.4)"""
  return validates(SizeChangedParams, value)


def is_valid_host_context_changed_params(value: object) -> bool:
  """Return ``True`` for valid ``HostContextChangedParams`` — params of
  ``ui/notifications/host-context-changed``: a PARTIAL ``UiHostContext`` carrying only the
  changed members. The same all-OPTIONAL validator applies. (§26.5.4)
  """
  return is_valid_ui_host_context(value)


class ResourceTeardownParams(McpModel):
  """``ui/resource-teardown`` params (Host → UI, §26.5.4): a REQUIRED string ``reason``. (R-26.5.4-a)"""

  reason: str


def is_valid_resource_teardown_params(value: object) -> bool:
  """Return ``True`` for valid ``ResourceTeardownParams`` — a REQUIRED string ``reason``. (§26.5.4)"""
  return validates(ResourceTeardownParams, value)


# ─── §26.5.5 — Host-internal sandbox-proxy params ─────────────────────────────


class SandboxResourceReadyParams(McpModel):
  """``ui/notifications/sandbox-resource-ready`` params (Host → Sandbox, §26.5.5): REQUIRED
  string ``html``; OPTIONAL ``sandbox`` (string), ``csp``, ``permissions``.
  """

  html: str
  sandbox: str | None = None
  csp: UiContentSecurityPolicy | None = None
  permissions: UiPermissions | None = None


def is_valid_sandbox_resource_ready_params(value: object) -> bool:
  """Return ``True`` for valid ``SandboxResourceReadyParams`` — REQUIRED ``html`` + OPTIONAL
  ``sandbox``/``csp``/``permissions``. (§26.5.5)
  """
  return validates(SandboxResourceReadyParams, value)


# ─── §26.5.1 — Handshake ordering (R-26.5.1-a) ────────────────────────────────

#: The phases of the dialect channel's lifecycle, from the UI's perspective.
#: ``"awaiting-init-response"`` — the UI has sent (or is about to send) ``ui/initialize``
#: and is waiting for the host's response; ``"initialized"`` — the response has arrived;
#: the UI may now send ``ui/notifications/initialized`` and any subsequent message.
UI_CHANNEL_PHASES = ("awaiting-init-response", "initialized")


def ui_may_emit_before_init_response(method: str) -> bool:
  """Return ``True`` when a conforming UI MAY emit a dialect message with ``method``
  BEFORE it has received the ``ui/initialize`` response. Only ``ui/initialize`` itself
  qualifies; every other dialect message — including ``ui/notifications/initialized`` —
  MUST wait for the response. (§26.5.1, R-26.5.1-a; AC-42.3)

  ``ui/notifications/initialized`` is sent only AFTER the response (the third step of the
  handshake), so it returns ``False`` here.
  """
  return method == UI_DIALECT_METHODS["INITIALIZE"]


@dataclass(frozen=True)
class HandshakeOrderViolation:
  """The outcome of a handshake-ordering conformance check (:func:`check_handshake_order`).

  ``ok=True`` means the message is allowed in the current phase. Otherwise ``reason`` is
  ``"premature-message"`` and ``method`` names the offending message.
  """

  ok: bool
  reason: str | None = None
  method: str | None = None


def check_handshake_order(phase: str, method: str) -> HandshakeOrderViolation:
  """Conformance check for the handshake-ordering rule (R-26.5.1-a; AC-42.3): given the
  channel ``phase`` and the ``method`` the UI is attempting to send, return ``ok=True``
  when the message is allowed, or a ``"premature-message"`` violation when the UI emits
  anything other than ``ui/initialize`` before the init response. (§26.5.1)
  """
  if phase == "initialized":
    return HandshakeOrderViolation(True)
  if ui_may_emit_before_init_response(method):
    return HandshakeOrderViolation(True)
  return HandshakeOrderViolation(False, reason="premature-message", method=method)


# ─── §26.7 — Message validation (R-26.7-n, R-26.7-o) ──────────────────────────


@dataclass(frozen=True)
class DialectMessageValidation:
  """The outcome of validating an incoming dialect message (:func:`validate_dialect_message`).

  On success ``ok=True`` and ``kind`` is the message kind (``"request"``,
  ``"notification"``, or ``"response"``), with ``entry`` set to the registry row when the
  message names a known dialect method. On failure ``ok=False`` and ``reason`` is
  ``"malformed-framing"`` or ``"unknown-method"`` with explanatory ``detail``.
  """

  ok: bool
  kind: str | None = None
  entry: UiDialectRegistryEntry | None = None
  reason: str | None = None
  detail: str | None = None


def validate_dialect_message(raw: object) -> DialectMessageValidation:
  """Validate an incoming dialect message against the §3 JSON-RPC framing BEFORE a host
  acts on it, treating the rendered content as untrusted. (§26.7, R-26.7-n, R-26.7-o;
  AC-42.18)

  Steps:

  1. Classify the raw value with :func:`~mcp.jsonrpc.framing.classify_message` (rejects
     batches, bad ``jsonrpc``, contradictory members, …). A framing failure is reported
     as ``"malformed-framing"`` — the host MUST NOT act on it.
  2. For requests and notifications, require the ``method`` to be a verbatim dialect name
     (responses carry no method and pass framing-only). An unrecognized method is
     reported as ``"unknown-method"``; a receiver MUST then answer a *request* with
     method-not-found (R-26.8-c) — see :func:`method_not_found_response`.

  This never raises: a malformed message yields ``ok=False`` rather than propagating
  :class:`~mcp.jsonrpc.framing.MalformedMessageError`, so a host can branch on the result.
  """
  try:
    classified = classify_message(raw)
  except MalformedMessageError as e:
    return DialectMessageValidation(False, reason="malformed-framing", detail=str(e))

  if classified.kind in ("result-response", "error-response"):
    return DialectMessageValidation(True, kind="response")

  method = classified.message["method"]
  entry = ui_dialect_registry_entry(method)
  if entry is None:
    return DialectMessageValidation(False, reason="unknown-method", detail=f'unknown dialect method "{method}"')
  return DialectMessageValidation(True, kind=entry.kind, entry=entry)


# ─── §26.8 — Error responses ──────────────────────────────────────────────────


def build_dialect_error_response(id_: object, code: int, message: str | None = None, data: object = None) -> dict:
  """Build a JSON-RPC error response for a failed dialect request, per §3 and §22.
  (§26.8, R-26.8-a; AC-42.19) Reuses :func:`~mcp.protocol.errors.build_error_object` so
  the ``error`` shape and default messages are the single authoritative ones.

  :param id_: the request id being answered (echoed verbatim).
  :param code: the §22 error code.
  :param message: OPTIONAL human-readable message; defaults to the registry name.
  :param data: OPTIONAL sender-defined additional detail.
  """
  return {"jsonrpc": "2.0", "id": id_, "error": build_error_object(code, message, data)}


def method_not_found_response(id_: object, message: str = "Method not found") -> dict:
  """Build the §22 method-not-found (``-32601``) error response a receiver MUST send when
  it receives a dialect REQUEST naming a method it does not implement. (§26.8, R-26.8-c;
  AC-42.21)
  """
  return build_dialect_error_response(id_, METHOD_NOT_FOUND_CODE, message)


#: The set of UI-initiated requests that a host, when it declines them (for lack of
#: consent, policy, or an unknown method), MUST answer with a §22 error rather than
#: silently dropping. (§26.8, R-26.8-b; AC-42.20)
DECLINABLE_UI_REQUESTS = (
  UI_DIALECT_METHODS["TOOLS_CALL"],
  UI_DIALECT_METHODS["RESOURCES_READ"],
  UI_DIALECT_METHODS["OPEN_LINK"],
  UI_DIALECT_METHODS["MESSAGE"],
  UI_DIALECT_METHODS["UPDATE_MODEL_CONTEXT"],
)

#: Why a host declined a UI-initiated request, used to pick the §22 error code:
#: ``"no-consent"``, ``"policy"``, ``"unknown-method"``, ``"invalid-params"``. (§26.8)
DECLINE_REASONS = ("no-consent", "policy", "unknown-method", "invalid-params")


def decline_error_code(reason: str) -> int:
  """Map a decline ``reason`` to the §22 error code a host returns when it declines a
  UI-initiated request. (§26.8, R-26.8-b; AC-42.20)

  * ``"unknown-method"`` → ``-32601`` Method not found (R-26.8-c);
  * ``"invalid-params"`` → ``-32602`` Invalid params;
  * ``"no-consent"`` / ``"policy"`` → ``-32603`` Internal error (the host refused to act).

  Whichever reason applies, the host MUST return an error — never a silent drop.

  :raises ValueError: when ``reason`` is not a recognized :data:`DECLINE_REASONS` value.
  """
  if reason == "unknown-method":
    return METHOD_NOT_FOUND_CODE
  if reason == "invalid-params":
    return INVALID_PARAMS_CODE
  if reason in ("no-consent", "policy"):
    return INTERNAL_ERROR_CODE
  raise ValueError(f"unknown decline reason: {reason!r}")


def build_decline_error_response(id_: object, reason: str, message: str | None = None) -> dict:
  """Build the §22 error response a host returns when it DECLINES a UI-initiated request,
  instead of silently dropping it. The code is selected from ``reason`` by
  :func:`decline_error_code`. (§26.8, R-26.8-b; AC-42.20)
  """
  return build_dialect_error_response(id_, decline_error_code(reason), message)


# ─── §26.5.3 / §26.7 — Host mediation & consent gating ────────────────────────


@dataclass(frozen=True)
class ToolsCallMediationInput:
  """The host's per-request mediation policy inputs for a UI-initiated ``tools/call``.

  A host MUST mediate the request: route it to the server ONLY after obtaining user
  consent and applying its policy, and SHOULD reject it when the named tool's effective
  ``visibility`` does not include ``"app"``. (§26.5.3, §26.7, R-26.5.3-a/-b,
  R-26.7-i/-j/-k; AC-42.5, AC-42.6)
  """

  #: The tool's UI declaration (``_meta.ui``), or ``None`` if it has none.
  ui_meta: dict | None
  #: Whether the user has granted consent for this invocation. (R-26.7-j)
  user_consented: bool
  #: Whether the host's tool-execution policy permits this invocation. (R-26.7-j)
  policy_allows: bool


@dataclass(frozen=True)
class ToolsCallMediationDecision:
  """The decision a host reaches for a UI-initiated request.

  ``route=True`` means route it to the server; otherwise ``reason`` is the
  :data:`DECLINE_REASONS` value the caller turns into a §22 error.
  """

  route: bool
  reason: str | None = None


def mediate_ui_tools_call(input: ToolsCallMediationInput) -> ToolsCallMediationDecision:
  """Decide whether a host may route a UI-initiated ``tools/call`` to the server.
  (§26.5.3, §26.7, R-26.5.3-a, R-26.5.3-b, R-26.7-i, R-26.7-j, R-26.7-k; AC-42.5, AC-42.6)

  The host routes the call ONLY when ALL hold, in this precedence:

  1. the tool's effective ``visibility`` includes ``"app"`` (SHOULD reject otherwise —
     reuses :func:`~mcp.protocol.ui.host_should_reject_ui_originated_call`); a rejection
     here is a ``"policy"`` decline;
  2. the host's tool-execution policy permits the call (``"policy"`` decline);
  3. the user has consented (``"no-consent"`` decline).

  A path that reaches the server WITHOUT prior consent and policy is a failure (AC-42.5):
  this returns ``route=False`` in every such case, and the caller MUST answer with the
  corresponding §22 error (never a silent drop).
  """
  # R-26.7-k / R-26.5.3-b: reject when effective visibility excludes "app".
  if host_should_reject_ui_originated_call(input.ui_meta):
    return ToolsCallMediationDecision(False, reason="policy")
  # R-26.7-j: the host's tool-execution policy MUST permit the call.
  if not input.policy_allows:
    return ToolsCallMediationDecision(False, reason="policy")
  # R-26.7-j: user consent MUST be obtained before routing.
  if not input.user_consented:
    return ToolsCallMediationDecision(False, reason="no-consent")
  return ToolsCallMediationDecision(True)


def mediate_open_link(host_honors: bool, user_confirmed: bool) -> ToolsCallMediationDecision:
  """Decide whether a host may honor a ``ui/open-link`` request. The host MAY decline and
  SHOULD confirm with the user before honoring it; a non-confirming auto-open is a
  conformance failure. (§26.5.3, §26.7, R-26.5.3-d, R-26.7-l; AC-42.8)

  Returns ``route=True`` only when the host both chose to honor the request AND obtained
  the user's confirmation; otherwise a ``"policy"`` (host declined) or ``"no-consent"``
  (no confirmation) decline.
  """
  if not host_honors:
    return ToolsCallMediationDecision(False, reason="policy")
  if not user_confirmed:
    return ToolsCallMediationDecision(False, reason="no-consent")
  return ToolsCallMediationDecision(True)


def mediate_ui_message(host_honors: bool, user_confirmed: bool) -> ToolsCallMediationDecision:
  """Decide whether a host may honor a ``ui/message`` insertion. The host SHOULD confirm
  with the user before inserting the message into the conversation. (§26.7, R-26.7-l;
  AC-42.20) Same gate shape as :func:`mediate_open_link`.
  """
  return mediate_open_link(host_honors, user_confirmed)


def build_display_mode_result(requested: str, applied: str) -> dict:
  """Build a ``ui/request-display-mode`` result: the host MAY grant a mode different from
  the one requested, and the result reports the mode actually applied. (§26.5.3, R-26.5.3-e;
  AC-42.9)

  ``requested`` is accepted for call-site symmetry but does not constrain the result; the
  host's ``applied`` mode is authoritative.
  """
  return {"mode": applied}


def build_ping_response(id_: object) -> dict:
  """Build the success response to a ``ping``: an empty result ``{}``. The receiver MUST
  respond promptly so the sender can confirm the peer is live. (§26.5.3, R-26.5.3-f,
  R-26.5.3-g; AC-42.10)
  """
  return {"jsonrpc": "2.0", "id": id_, "result": {}}


def build_teardown_response(id_: object) -> dict:
  """Build the empty ``{}`` success response a UI returns to a ``ui/resource-teardown``
  request after releasing its resources. (§26.5.4, R-26.5.4-a; AC-42.11)
  """
  return {"jsonrpc": "2.0", "id": id_, "result": {}}


# ─── §26.7 — Sandbox CSP / permission enforcement ─────────────────────────────


def granted_permissions(requested: dict | None, declined: Iterable[str] = ()) -> dict:
  """Compute the GRANTED permission set for a UI resource, enforcing R-26.7-h: the host
  MUST NOT grant any permission the resource did not request, and MAY decline a requested
  one. The result is exactly what ``hostCapabilities.sandbox.permissions`` reports.
  (§26.7, R-26.7-h; AC-42.15, AC-42.16)

  Starts from the resource's requested set (``permissions``), keeps only members the
  resource requested, and drops any the host chose to decline.

  :param requested: the resource's declared ``permissions``, or ``None``.
  :param declined: the subset of requested permissions the host declines; members not
    requested are ignored.
  """
  decline_set = set(declined)
  granted: dict = {}
  if requested is not None:
    for name, value in requested.items():
      if value is None:
        continue  # not requested
      if name in decline_set:
        continue  # host declined (MAY)
      granted[name] = value
  return granted


def build_sandbox_report(effective_csp: dict, granted: dict) -> dict:
  """Build the ``hostCapabilities.sandbox`` report for the initialize result: the
  EFFECTIVE CSP the host applied and the GRANTED permission set. (§26.7, R-26.7-g,
  R-26.7-h; AC-42.15)

  :param effective_csp: the effective CSP the host applied (e.g. from
    :func:`~mcp.protocol.ui.resolve_csp`); reported verbatim under ``sandbox.csp``.
  :param granted: the granted permission set (e.g. from :func:`granted_permissions`);
    reported verbatim under ``sandbox.permissions``.
  """
  return {"csp": effective_csp, "permissions": granted}


# ─── §26.7 — Data-exposure guard (R-26.7-m) ───────────────────────────────────

#: The keys a host MUST NOT expose to the UI: credentials, authorization tokens (§23),
#: and unrelated conversation/context data. Illustrative of the categories a host must
#: withhold; the authoritative rule is the allow-list test :func:`ui_exposure_is_clean`.
#: (§26.7, R-26.7-m; AC-42.17)
FORBIDDEN_UI_EXPOSURE_KEYS = (
  "credentials",
  "authorization",
  "authorizationToken",
  "accessToken",
  "token",
  "apiKey",
  "cookies",
  "conversation",
  "conversationHistory",
)

#: The ONLY data categories a host MAY make available to the rendered UI: the tool input
#: and result it was rendered for, and host context explicitly delivered through the
#: dialect. (§26.7, R-26.7-m; AC-42.17)
ALLOWED_UI_EXPOSURE_KEYS = ("toolInput", "toolResult", "hostContext")


def ui_exposure_is_clean(exposed: dict) -> bool:
  """Return ``True`` when the data a host is about to expose to the UI contains ONLY
  permitted categories — every top-level key is in :data:`ALLOWED_UI_EXPOSURE_KEYS`. Any
  other key (a credential, token, cookie, or unrelated conversation/context datum) makes
  the exposure dirty. (§26.7, R-26.7-m; AC-42.17)

  The check is allow-list based (not merely "no forbidden key present"), so an unforeseen
  leaking key is caught too.
  """
  allowed = set(ALLOWED_UI_EXPOSURE_KEYS)
  return all(k in allowed for k in exposed.keys())


# ─── §26.7 — Sandbox isolation model (declarative; R-26.7-a/-b/-c) ────────────

#: The single permitted path between UI and host: the §26.5 dialect channel. (R-26.7-c)
DIALECT_CHANNEL_PATH = "ui-dialect-channel"

#: The access categories a sandboxed UI MUST be denied: the embedding document's DOM,
#: cookies, storage, and navigation. The rendered content MUST NOT be able to escape the
#: sandbox to reach host or user state. (§26.7, R-26.7-a, R-26.7-b; AC-42.12)
SANDBOX_DENIED_ACCESS = ("dom", "cookies", "storage", "navigation")


def sandbox_isolation_is_conforming(denied_access: Iterable[str]) -> bool:
  """Return ``True`` when a proposed sandbox configuration is conforming: it denies EVERY
  category in :data:`SANDBOX_DENIED_ACCESS`, leaving the §26.5 dialect channel as the only
  path between the UI and the host (R-26.7-c). (§26.7, R-26.7-a, R-26.7-b, R-26.7-c;
  AC-42.12, AC-42.13)
  """
  denied = set(denied_access)
  return all(cat in denied for cat in SANDBOX_DENIED_ACCESS)


def dialect_is_only_channel(granted_paths: Iterable[str]) -> bool:
  """Return ``True`` when the §26.5 dialect channel is the ONLY path granted between the
  rendered UI and the host — i.e. no other ambient path to host or user data exists. The
  host MUST NOT grant ambient access through any other path. (§26.7, R-26.7-c; AC-42.13)
  """
  paths = list(granted_paths)
  return len(paths) == 1 and paths[0] == DIALECT_CHANNEL_PATH


# ─── §26.9 — SDK scope summary ────────────────────────────────────────────────

#: The server-side obligations of this extension. A server-side implementation MUST
#: support all three: ``"acknowledge-extension"`` (R-26.9-a), ``"declare-ui-meta"``
#: (R-26.9-b), ``"serve-ui-resource"`` (R-26.9-c). (§26.9; AC-42.22–AC-42.24)
SERVER_SDK_OBLIGATIONS = ("acknowledge-extension", "declare-ui-meta", "serve-ui-resource")

#: The host/client-only concerns that are NOT obligations of a server SDK: rendering,
#: sandboxing, CSP/permission enforcement, running the dialect runtime, and obtaining
#: user consent. (§26.9, R-26.9-d; AC-42.25)
HOST_ONLY_CONCERNS = (
  "render-sandboxed",
  "enforce-csp-permissions",
  "run-dialect-runtime",
  "obtain-consent",
)


def is_server_sdk_obligation(concern: str) -> bool:
  """Return ``True`` when ``concern`` is a SERVER-SDK obligation under this extension (one
  of :data:`SERVER_SDK_OBLIGATIONS`); return ``False`` for any host-only concern. A
  server-SDK conformance check uses this to confirm that sandboxing, CSP/permission
  enforcement, the dialect runtime, and consent are NOT required of the server SDK.
  (§26.9, R-26.9-d; AC-42.25)
  """
  return concern in SERVER_SDK_OBLIGATIONS
