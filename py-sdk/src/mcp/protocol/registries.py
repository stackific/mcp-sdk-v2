"""Consolidated Registries: Methods, Errors, ``_meta`` Keys, Capabilities, and Types
(Appendices A–E).

The capstone reference artifact: five authoritative, document-wide tables that
enumerate the wire surface defined across the whole specification, each row pointing to
the section that normatively specifies the entry. These appendices define no new wire
types — they are a *consolidation*, not a new definition, and the cited section remains
normative.

This module REUSES existing bindings rather than redefining them:

* The §22 / Appendix B error-code registry is re-exported from :mod:`mcp.protocol.errors`
  (``ERROR_CODE_REGISTRY``, ``RESERVED_ERROR_CODES``, ``validate_extension_error_code``,
  ``SERVER_ERROR_RANGE``); it is never rebuilt here. (Appendix B; R-AppB-a, R-AppB-b)
* The reserved-bare-key set comes from :mod:`mcp.protocol.meta` (``RESERVED_BARE_KEYS``)
  and the prefix-reservation predicate / parser come from :mod:`mcp.json.meta_key`
  (``is_reserved_meta_key_prefix``, ``parse_meta_key``).

The four NEW registries (methods, ``_meta`` keys, capabilities, types) are expressed as
DATA structures over the literal wire names plus their metadata (direction, kind,
capability gating, owning section), mirroring the registry-as-data style of
:mod:`mcp.protocol.errors`. Method/key/capability names appear as string literals in the
data — this is deliberate and safer than importing the scattered method-name constants
from a dozen sibling modules.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from mcp.json.meta_key import is_reserved_meta_key_prefix, parse_meta_key
from mcp.protocol.errors import (
  ERROR_CODE_REGISTRY,
  HEADER_MISMATCH_CODE,
  RESERVED_ERROR_CODES,
  SERVER_ERROR_RANGE,
  validate_extension_error_code,
)
from mcp.protocol.meta import RESERVED_BARE_KEYS

# ─── Appendix B re-export (the §22 registry, never rebuilt) ────────────────────
#
# Appendix B IS the §22 Error Code Registry. Rather than restate it, this module
# re-exports the existing authoritative table and its collision helpers so a caller can
# reach the whole error surface through the registries module. The names below are
# imported above and intentionally surfaced here as part of this module's public API
# (the Python analogue of TS ``export { … } from './errors.js'``):
# ``ERROR_CODE_REGISTRY``, ``RESERVED_ERROR_CODES``, ``validate_extension_error_code``,
# ``SERVER_ERROR_RANGE``. (Appendix B; R-AppB-a, R-AppB-b)


@dataclass(frozen=True)
class CustomErrorCodeValidation:
  """Outcome of :func:`validate_custom_error_code`.

  ``ok=True`` means the code is usable; ``in_reserved_range`` then says whether the code
  lies inside the reserved server-error range ``-32000..-32099``. ``ok=False`` carries a
  machine-readable ``reason``.
  """

  ok: bool
  in_reserved_range: bool | None = None
  reason: Literal["not-an-integer", "collides-with-reserved"] | None = None


def validate_custom_error_code(code: object) -> CustomErrorCodeValidation:
  """Validate a custom error ``code`` against Appendix B's collision rule.

  A custom code MUST NOT equal any code listed in the Error Code Registry (the five
  standard JSON-RPC codes, the two protocol codes, and ``-32001`` HeaderMismatch).
  (R-AppB-a, AC-46.1)

  Codes inside the reserved server-error range ``-32000..-32099`` are permitted only
  when they avoid collision with a code this document defines (notably ``-32001``);
  ``-32000..-32099`` is the range in which additions are explicitly allowed. (R-AppB-b,
  AC-46.2)

  Returns ``ok=True`` when the code is usable (with ``in_reserved_range`` set), otherwise
  ``ok=False`` with a ``reason``. Delegates the integer/collision check to
  :func:`mcp.protocol.errors.validate_extension_error_code` (the §22 helper) so the two
  stay in lockstep.
  """
  result = validate_extension_error_code(code)
  if not result.ok:
    return CustomErrorCodeValidation(False, reason=result.reason)
  in_reserved_range = SERVER_ERROR_RANGE.min <= code <= SERVER_ERROR_RANGE.max
  return CustomErrorCodeValidation(True, in_reserved_range=in_reserved_range)


# ─── Appendix A: Method and Notification Index ─────────────────────────────────

class RegistryMethodKind(StrEnum):
  """The **Kind** column of Appendix A: whether a name is a request (expects a
  response), a notification (no response), or an input-request kind delivered embedded
  in an input-required result (§11) rather than as a standalone server-initiated
  request. (Appendix A)
  """

  #: A request that expects a response.
  REQUEST = "request"
  #: A notification — no response is sent.
  NOTIFICATION = "notification"
  #: An input-request kind (``elicitation/create``, ``sampling/createMessage``,
  #: ``roots/list``): delivered inside an input-required result and resolved by client
  #: retry (§11); NOT a standalone server-initiated JSON-RPC request.
  INPUT_REQUEST = "input-request kind"


@dataclass(frozen=True)
class MethodNotificationIndexEntry:
  """One row of Appendix A — a single method or notification name."""

  #: The JSON-RPC method or notification name (for example ``tools/list``).
  name: str
  #: Whether the name is a request, a notification, or an input-request kind.
  kind: RegistryMethodKind
  #: The normal sender→receiver pairing (for example ``client→server``).
  direction: str
  #: The section that normatively defines the message.
  defined_in: str
  #: When ``True``, the name is only in scope while the named extension is active.
  extension_scoped: bool = False


#: Appendix A — the Method and Notification Index: every JSON-RPC method and notification
#: defined by the document and its extensions, with its kind, direction, and defining
#: section. (Appendix A)
#:
#: The three input-request kinds (``elicitation/create``, ``sampling/createMessage``,
#: ``roots/list``) are delivered embedded in an input-required result and are NOT
#: standalone server-initiated requests (see :class:`RegistryMethodKind`). The two
#: trailing ``UI↔host`` handshake rows (§26) are in scope only when the UI extension is
#: active; they carry ``extension_scoped=True``.
METHOD_REGISTRY: tuple[MethodNotificationIndexEntry, ...] = (
  # ── Core requests (client→server) ──
  MethodNotificationIndexEntry("server/discover", RegistryMethodKind.REQUEST, "client→server", "§5 Protocol Revision, Version Negotiation, and Discovery"),
  MethodNotificationIndexEntry("tools/list", RegistryMethodKind.REQUEST, "client→server", "§16 Tools"),
  MethodNotificationIndexEntry("tools/call", RegistryMethodKind.REQUEST, "client→server", "§16 Tools"),
  MethodNotificationIndexEntry("resources/list", RegistryMethodKind.REQUEST, "client→server", "§17 Resources"),
  MethodNotificationIndexEntry("resources/read", RegistryMethodKind.REQUEST, "client→server", "§17 Resources"),
  MethodNotificationIndexEntry("resources/templates/list", RegistryMethodKind.REQUEST, "client→server", "§17 Resources"),
  MethodNotificationIndexEntry("prompts/list", RegistryMethodKind.REQUEST, "client→server", "§18 Prompts"),
  MethodNotificationIndexEntry("prompts/get", RegistryMethodKind.REQUEST, "client→server", "§18 Prompts"),
  MethodNotificationIndexEntry("completion/complete", RegistryMethodKind.REQUEST, "client→server", "§19 Completion"),
  MethodNotificationIndexEntry("subscriptions/listen", RegistryMethodKind.REQUEST, "client→server", "§10 Server-to-Client Streaming and Subscriptions"),
  # ── Input-request kinds (server→client via input-required result, §11) ──
  MethodNotificationIndexEntry("elicitation/create", RegistryMethodKind.INPUT_REQUEST, "server→client (via input-required result, §11)", "§20 Elicitation"),
  MethodNotificationIndexEntry("sampling/createMessage", RegistryMethodKind.INPUT_REQUEST, "server→client (via input-required result, §11)", "§21 Deprecated Client-Provided Capabilities"),
  MethodNotificationIndexEntry("roots/list", RegistryMethodKind.INPUT_REQUEST, "server→client (via input-required result, §11)", "§21 Deprecated Client-Provided Capabilities"),
  # ── Tasks extension requests (client→server) ──
  MethodNotificationIndexEntry("tasks/get", RegistryMethodKind.REQUEST, "client→server", "§25 The Tasks Extension"),
  MethodNotificationIndexEntry("tasks/update", RegistryMethodKind.REQUEST, "client→server", "§25 The Tasks Extension"),
  MethodNotificationIndexEntry("tasks/cancel", RegistryMethodKind.REQUEST, "client→server", "§25 The Tasks Extension"),
  # ── UI extension handshake (UI↔host) ──
  MethodNotificationIndexEntry("ui/initialize", RegistryMethodKind.REQUEST, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/notifications/initialized", RegistryMethodKind.NOTIFICATION, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  # ── Notifications ──
  MethodNotificationIndexEntry("notifications/progress", RegistryMethodKind.NOTIFICATION, "client→server or server→client", "§15 Utilities: Progress, Cancellation, Logging, and Trace Context"),
  MethodNotificationIndexEntry("notifications/cancelled", RegistryMethodKind.NOTIFICATION, "client→server or server→client", "§15 Utilities: Progress, Cancellation, Logging, and Trace Context"),
  MethodNotificationIndexEntry("notifications/message", RegistryMethodKind.NOTIFICATION, "server→client", "§15 Utilities: Progress, Cancellation, Logging, and Trace Context"),
  MethodNotificationIndexEntry("notifications/tools/list_changed", RegistryMethodKind.NOTIFICATION, "server→client", "§16 Tools"),
  MethodNotificationIndexEntry("notifications/prompts/list_changed", RegistryMethodKind.NOTIFICATION, "server→client", "§18 Prompts"),
  MethodNotificationIndexEntry("notifications/resources/list_changed", RegistryMethodKind.NOTIFICATION, "server→client", "§17 Resources"),
  MethodNotificationIndexEntry("notifications/resources/updated", RegistryMethodKind.NOTIFICATION, "server→client", "§17 Resources"),
  MethodNotificationIndexEntry("notifications/subscriptions/acknowledged", RegistryMethodKind.NOTIFICATION, "server→client", "§10 Server-to-Client Streaming and Subscriptions"),
  MethodNotificationIndexEntry("notifications/elicitation/complete", RegistryMethodKind.NOTIFICATION, "server→client", "§20 Elicitation"),
  MethodNotificationIndexEntry("notifications/tasks", RegistryMethodKind.NOTIFICATION, "server→client", "§25 The Tasks Extension"),
)


#: The additional UI-dialect message names (§26) exchanged on the UI message channel
#: (``UI↔host``), in scope ONLY when the user-interface extension is active — beyond the
#: two handshake names already in :data:`METHOD_REGISTRY`. Named ``..._INDEX`` to stay
#: distinct from the method-name constant map owned by the UI module. Recorded
#: separately because they are conditional on the extension. (Appendix A)
UI_DIALECT_METHOD_INDEX: tuple[MethodNotificationIndexEntry, ...] = (
  # Host → UI tool-data notifications
  MethodNotificationIndexEntry("ui/notifications/tool-input", RegistryMethodKind.NOTIFICATION, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/notifications/tool-input-partial", RegistryMethodKind.NOTIFICATION, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/notifications/tool-result", RegistryMethodKind.NOTIFICATION, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/notifications/tool-cancelled", RegistryMethodKind.NOTIFICATION, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  # UI → host requests
  MethodNotificationIndexEntry("tools/call", RegistryMethodKind.REQUEST, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("resources/read", RegistryMethodKind.REQUEST, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/open-link", RegistryMethodKind.REQUEST, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/message", RegistryMethodKind.REQUEST, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/request-display-mode", RegistryMethodKind.REQUEST, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/update-model-context", RegistryMethodKind.REQUEST, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  # UI → host notification
  MethodNotificationIndexEntry("notifications/message", RegistryMethodKind.NOTIFICATION, "UI↔host (UI→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  # Bidirectional
  MethodNotificationIndexEntry("ping", RegistryMethodKind.REQUEST, "UI↔host (bidirectional)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  # Host → UI notifications and request
  MethodNotificationIndexEntry("ui/notifications/size-changed", RegistryMethodKind.NOTIFICATION, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/notifications/host-context-changed", RegistryMethodKind.NOTIFICATION, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/resource-teardown", RegistryMethodKind.REQUEST, "UI↔host (host→UI)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  # Sandbox-bridging notifications
  MethodNotificationIndexEntry("ui/notifications/sandbox-proxy-ready", RegistryMethodKind.NOTIFICATION, "UI↔host (sandbox→host)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
  MethodNotificationIndexEntry("ui/notifications/sandbox-resource-ready", RegistryMethodKind.NOTIFICATION, "UI↔host (host→sandbox)", "§26 The Interactive User-Interface Extension", extension_scoped=True),
)


def lookup_method(name: str, include_ui_dialect: bool = False) -> MethodNotificationIndexEntry | None:
  """Look up the Appendix A entry for a method or notification ``name``.

  Searches the core index first and (when ``include_ui_dialect`` is ``True``) the
  UI-dialect names. Returns ``None`` when the name is not in the index. (Appendix A)

  Because a handful of UI-dialect names (``tools/call``, ``resources/read``,
  ``notifications/message``) shadow core names, the core index is preferred unless a core
  hit is absent. To inspect a UI-dialect-only meaning, pass ``include_ui_dialect=True``
  and read the returned ``direction``/``defined_in``.
  """
  for entry in METHOD_REGISTRY:
    if entry.name == name:
      return entry
  if include_ui_dialect:
    for entry in UI_DIALECT_METHOD_INDEX:
      if entry.name == name:
        return entry
  return None


def is_registered_method(name: str) -> bool:
  """Return ``True`` when ``name`` appears in the core Appendix A index."""
  return any(entry.name == name for entry in METHOD_REGISTRY)


# ─── Appendix C: Reserved `_meta` Key Registry ─────────────────────────────────

@dataclass(frozen=True)
class MetaKeyRegistryEntry:
  """One row of Appendix C — a reserved key that MAY appear in ``_meta``."""

  #: The reserved ``_meta`` key (prefixed or bare-by-exception).
  key: str
  #: Where the key normally appears.
  used_on: str
  #: Purpose, requirement level, and deprecation status where applicable.
  meaning: str
  #: The section that normatively specifies the key.
  defined_in: str
  #: Requirement level on the location named in ``used_on``.
  requirement: Literal["required", "optional"]
  #: When ``True``, the key carries Deprecated status.
  deprecated: bool = False


#: Appendix C — the Reserved ``_meta`` Key Registry: every key reserved by this document
#: that MAY appear in ``_meta`` (the ``io.modelcontextprotocol/`` prefixed keys plus the
#: four bare-by-exception keys), each with where it is used, its meaning/requirement
#: level, and its defining section. (Appendix C; R-AppC-a … j)
META_KEY_REGISTRY: tuple[MetaKeyRegistryEntry, ...] = (
  MetaKeyRegistryEntry(
    key="io.modelcontextprotocol/protocolVersion",
    used_on="every client request (_meta)",
    meaning='The protocol revision the request uses (the wire value, e.g. "2026-07-28"). REQUIRED on client requests.',
    defined_in="§4 Request Metadata and the Stateless Model",
    requirement="required",
  ),
  MetaKeyRegistryEntry(
    key="io.modelcontextprotocol/clientInfo",
    used_on="every client request (_meta)",
    meaning="An Implementation object identifying the client software issuing the request. REQUIRED on client requests.",
    defined_in="§4 Request Metadata and the Stateless Model",
    requirement="required",
  ),
  MetaKeyRegistryEntry(
    key="io.modelcontextprotocol/clientCapabilities",
    used_on="every client request (_meta)",
    meaning="A ClientCapabilities object declaring, for this request, the optional capabilities the client supports. REQUIRED on client requests.",
    defined_in="§4 Request Metadata and the Stateless Model",
    requirement="required",
  ),
  MetaKeyRegistryEntry(
    key="io.modelcontextprotocol/logLevel",
    used_on="client request _meta (OPTIONAL)",
    meaning="The minimum log severity the server may emit while processing this request, as a LoggingLevel string. Status: Deprecated.",
    defined_in="§4 Request Metadata and the Stateless Model",
    requirement="optional",
    deprecated=True,
  ),
  MetaKeyRegistryEntry(
    key="progressToken",
    used_on="request _meta (OPTIONAL)",
    meaning="Out-of-band progress correlation token; the value (a string or number) is echoed in notifications/progress to correlate updates with the originating request.",
    defined_in="§15 Utilities: Progress, Cancellation, Logging, and Trace Context",
    requirement="optional",
  ),
  MetaKeyRegistryEntry(
    key="io.modelcontextprotocol/subscriptionId",
    used_on="notification _meta on a subscription stream",
    meaning="Correlates a notification delivered on a subscriptions/listen stream with the subscription it belongs to; value is the subscription identifier as a string.",
    defined_in="§10 Server-to-Client Streaming and Subscriptions",
    requirement="optional",
  ),
  MetaKeyRegistryEntry(
    key="traceparent",
    used_on="request and notification _meta (OPTIONAL)",
    meaning="W3C Trace Context traceparent value, carried unchanged for distributed-trace propagation.",
    defined_in="§15 Utilities: Progress, Cancellation, Logging, and Trace Context",
    requirement="optional",
  ),
  MetaKeyRegistryEntry(
    key="tracestate",
    used_on="request and notification _meta (OPTIONAL)",
    meaning="W3C Trace Context tracestate value, carried unchanged for distributed-trace propagation.",
    defined_in="§15 Utilities: Progress, Cancellation, Logging, and Trace Context",
    requirement="optional",
  ),
  MetaKeyRegistryEntry(
    key="baggage",
    used_on="request and notification _meta (OPTIONAL)",
    meaning="W3C Baggage value, carried unchanged for distributed-trace propagation.",
    defined_in="§15 Utilities: Progress, Cancellation, Logging, and Trace Context",
    requirement="optional",
  ),
  MetaKeyRegistryEntry(
    key="io.modelcontextprotocol/tasks",
    used_on="extensions map within client clientCapabilities and within server capabilities",
    meaning="Extension identifier declaring support for the Tasks extension; its value is an OPTIONAL settings object (empty {} defined).",
    defined_in="§25 The Tasks Extension",
    requirement="optional",
  ),
  MetaKeyRegistryEntry(
    key="io.modelcontextprotocol/ui",
    used_on="extensions map within host/server capabilities",
    meaning="Extension identifier declaring support for the Interactive User-Interface extension; the host's value carries the REQUIRED mimeTypes array.",
    defined_in="§26 The Interactive User-Interface Extension",
    requirement="optional",
  ),
  MetaKeyRegistryEntry(
    key="ui",
    used_on="a Tool object's _meta (§16 Tools)",
    meaning="Declares the user interface associated with a tool: an object with REQUIRED resourceUri (a ui:// URI) and OPTIONAL visibility. In scope only when the user-interface extension is active.",
    defined_in="§26 The Interactive User-Interface Extension",
    requirement="required",
  ),
)


def lookup_meta_key(key: str) -> MetaKeyRegistryEntry | None:
  """Look up the Appendix C entry for an exact reserved ``key``, or ``None`` when the
  key is not an enumerated registry row.

  Note this matches the literal rows only; use :func:`is_reserved_meta_key` for the
  broader prefix-based reservation test that covers all ``io.modelcontextprotocol/…``
  keys. (Appendix C)
  """
  for entry in META_KEY_REGISTRY:
    if entry.key == key:
      return entry
  return None


def is_reserved_meta_key(key: str) -> bool:
  """Return ``True`` when ``key`` is reserved by this document and so MAY appear in
  ``_meta`` without being treated as an unknown/custom key.

  Any key under the reserved ``io.modelcontextprotocol/``/``mcp`` prefix, or one of the
  four bare-by-exception keys (``progressToken``, ``traceparent``, ``tracestate``,
  ``baggage``). (R-AppC-a, AC-46.3)

  Reuses ``RESERVED_BARE_KEYS`` (§4.2) and ``is_reserved_meta_key_prefix`` (§2.6.2) so the
  reservation surface stays single-sourced. Extension-defined keys outside the reserved
  prefix are NOT reserved by this predicate — they are nonetheless permitted in ``_meta``
  by the §24/§4 namespacing rules; use :func:`is_meta_key_permitted` to confirm a key MAY
  appear at all. (R-AppC-j)
  """
  if key in RESERVED_BARE_KEYS:
    return True
  prefix, _name = parse_meta_key(key)
  return prefix is not None and is_reserved_meta_key_prefix(prefix)


def is_meta_key_permitted(key: str) -> bool:
  """Return ``True`` when ``key`` MAY appear in ``_meta``.

  Either because it is a registry-reserved key (see :func:`is_reserved_meta_key`) or
  because it is an extension-defined key carried under a valid non-reserved prefix, which
  the §24 extension-mechanism and §4 namespacing rules permit. (R-AppC-a, R-AppC-j,
  AC-46.3, AC-46.12)

  A bare key that is neither reserved-by-exception nor prefixed is NOT permitted (the
  spec requires a prefix for any non-reserved key).
  """
  if is_reserved_meta_key(key):
    return True
  # An extension-defined key must carry a (non-reserved) prefix to be permitted.
  prefix, _name = parse_meta_key(key)
  return prefix is not None and not is_reserved_meta_key_prefix(prefix)


def required_client_request_meta_keys() -> tuple[str, ...]:
  """Return the reserved keys (Appendix C rows) that are REQUIRED on a client request.
  (R-AppC-b … d)
  """
  return tuple(
    entry.key
    for entry in META_KEY_REGISTRY
    if entry.requirement == "required" and entry.used_on.startswith("every client request")
  )


# ─── Appendix D: Capability Registry ───────────────────────────────────────────

#: The **Side** column of Appendix D.
CapabilitySide = Literal["client", "server", "host", "host/server", "client and server"]

#: The set of legal :data:`CapabilitySide` values (for validation/iteration).
CAPABILITY_SIDES: frozenset[str] = frozenset(
  {"client", "server", "host", "host/server", "client and server"}
)


@dataclass(frozen=True)
class CapabilitySubFlag:
  """A single nested sub-flag of a capability, with its optionality and notes."""

  #: The sub-flag member name (for example ``listChanged``, ``form``, ``mimeTypes``).
  name: str
  #: Requirement level of the sub-flag.
  requirement: Literal["required", "optional"]
  #: One-line statement of what the sub-flag gates or carries.
  gates: str
  #: When ``True``, the sub-flag is a boolean toggle.
  boolean: bool = False
  #: When ``True``, the sub-flag carries Deprecated status.
  deprecated: bool = False


@dataclass(frozen=True)
class CapabilityRegistryEntry:
  """One row of Appendix D — a capability defined by this document."""

  #: Capability name (for example ``tools``, ``io.modelcontextprotocol/ui``).
  capability: str
  #: Which side(s) advertise the capability.
  side: CapabilitySide
  #: Nested members defined for the capability (empty when the value is ``{}``).
  sub_flags: tuple[CapabilitySubFlag, ...]
  #: The section that normatively specifies the capability.
  defined_in: str
  #: When ``True``, the capability as a whole carries Deprecated status.
  deprecated: bool = False
  #: When ``True``, the capability is negotiated through the ``extensions`` map.
  extension: bool = False


#: Appendix D — the Capability Registry: every client/server/extension capability defined
#: by this document, with its side, its sub-flags (and their optionality, boolean-ness,
#: and deprecation), and its defining section. (Appendix D; R-AppD-a … f)
CAPABILITY_REGISTRY: tuple[CapabilityRegistryEntry, ...] = (
  # ── Client capabilities ──
  CapabilityRegistryEntry(
    capability="elicitation",
    side="client",
    sub_flags=(
      CapabilitySubFlag("form", "optional", "enables the form elicitation mode; the url mode is the other defined mode (§20)"),
    ),
    defined_in="§6 Capabilities and Extensions",
  ),
  CapabilityRegistryEntry(
    capability="roots",
    side="client",
    sub_flags=(),
    defined_in="§6 Capabilities and Extensions",
    deprecated=True,
  ),
  CapabilityRegistryEntry(
    capability="sampling",
    side="client",
    sub_flags=(
      CapabilitySubFlag("tools", "optional", "enables the sampling tools/toolChoice parameters"),
      CapabilitySubFlag("context", "optional", "enables non-none includeContext values", deprecated=True),
    ),
    defined_in="§6 Capabilities and Extensions",
    deprecated=True,
  ),
  CapabilityRegistryEntry(
    capability="extensions",
    side="client",
    sub_flags=(),
    defined_in="§6 Capabilities and Extensions",
  ),
  # ── Server capabilities ──
  CapabilityRegistryEntry(
    capability="tools",
    side="server",
    sub_flags=(
      CapabilitySubFlag("listChanged", "optional", "enables notifications/tools/list_changed", boolean=True),
    ),
    defined_in="§6 Capabilities and Extensions",
  ),
  CapabilityRegistryEntry(
    capability="resources",
    side="server",
    sub_flags=(
      CapabilitySubFlag("listChanged", "optional", "enables notifications/resources/list_changed", boolean=True),
      CapabilitySubFlag("subscribe", "optional", "enables resource subscriptions (subscriptions/listen)", boolean=True),
    ),
    defined_in="§6 Capabilities and Extensions",
  ),
  CapabilityRegistryEntry(
    capability="prompts",
    side="server",
    sub_flags=(
      CapabilitySubFlag("listChanged", "optional", "enables notifications/prompts/list_changed", boolean=True),
    ),
    defined_in="§6 Capabilities and Extensions",
  ),
  CapabilityRegistryEntry(
    capability="completions",
    side="server",
    sub_flags=(),
    defined_in="§6 Capabilities and Extensions",
  ),
  CapabilityRegistryEntry(
    capability="logging",
    side="server",
    sub_flags=(),
    defined_in="§6 Capabilities and Extensions",
    deprecated=True,
  ),
  CapabilityRegistryEntry(
    capability="extensions",
    side="server",
    sub_flags=(),
    defined_in="§6 Capabilities and Extensions",
  ),
  # ── Extension capabilities (negotiated via the extensions map) ──
  CapabilityRegistryEntry(
    capability="io.modelcontextprotocol/tasks",
    side="client and server",
    sub_flags=(),
    defined_in="§25 The Tasks Extension",
    extension=True,
  ),
  CapabilityRegistryEntry(
    capability="io.modelcontextprotocol/ui",
    side="host/server",
    sub_flags=(
      CapabilitySubFlag(
        "mimeTypes",
        "required",
        'host value: string array that MUST include "text/html;profile=mcp-app"; server acknowledgement value MAY be empty',
      ),
    ),
    defined_in="§26 The Interactive User-Interface Extension",
    extension=True,
  ),
)


def lookup_capability(capability: str, side: CapabilitySide | None = None) -> CapabilityRegistryEntry | None:
  """Look up the Appendix D entry for ``capability``.

  When the same name is defined on more than one side (``extensions`` is both a client
  and a server capability), pass ``side`` to disambiguate; otherwise the first match is
  returned. Returns ``None`` when the capability is not in the registry. (Appendix D)
  """
  for entry in CAPABILITY_REGISTRY:
    if entry.capability == capability and (side is None or entry.side == side):
      return entry
  return None


def lookup_capability_sub_flag(
  capability: str,
  sub_flag: str,
  side: CapabilitySide | None = None,
) -> CapabilitySubFlag | None:
  """Return the named sub-flag of a capability, or ``None`` when the capability or the
  sub-flag is not defined.

  Handy for asserting a sub-flag's optionality, boolean-ness, or deprecation.
  (Appendix D)
  """
  entry = lookup_capability(capability, side)
  if entry is None:
    return None
  for flag in entry.sub_flags:
    if flag.name == sub_flag:
      return flag
  return None


#: The MIME type the ``io.modelcontextprotocol/ui`` host value's ``mimeTypes`` array MUST
#: include. (R-AppD-f, AC-46.18) Pinned as registry DATA; the UI extension (§26) owns the
#: normative type.
UI_HOST_REQUIRED_MIME_TYPE = "text/html;profile=mcp-app"


@dataclass(frozen=True)
class UiHostValueValidation:
  """Outcome of :func:`validate_ui_host_value`."""

  ok: bool
  reason: Literal[
    "not-an-object",
    "missing-mimeTypes",
    "mimeTypes-not-array",
    "missing-required-mime-type",
  ] | None = None


def validate_ui_host_value(value: object) -> UiHostValueValidation:
  """Validate the ``io.modelcontextprotocol/ui`` host value against Appendix C/D.

  It MUST carry a ``mimeTypes`` array (REQUIRED) that includes
  :data:`UI_HOST_REQUIRED_MIME_TYPE`; absence of ``mimeTypes`` is non-conformant.
  (R-AppC-h, R-AppD-f, AC-46.10, AC-46.18)

  A server *acknowledgement* value (as opposed to the host value) MAY be empty; that case
  is the caller's to distinguish — this validator checks the host value, where
  ``mimeTypes`` is required.
  """
  if not isinstance(value, dict):
    return UiHostValueValidation(False, "not-an-object")
  if "mimeTypes" not in value:
    return UiHostValueValidation(False, "missing-mimeTypes")
  mime_types = value["mimeTypes"]
  if not isinstance(mime_types, list):
    return UiHostValueValidation(False, "mimeTypes-not-array")
  if UI_HOST_REQUIRED_MIME_TYPE not in mime_types:
    return UiHostValueValidation(False, "missing-required-mime-type")
  return UiHostValueValidation(True)


@dataclass(frozen=True)
class ToolUiMetaValidation:
  """Outcome of :func:`validate_tool_ui_meta_value`."""

  ok: bool
  reason: Literal["not-an-object", "missing-resourceUri", "resourceUri-not-ui-uri"] | None = None


def validate_tool_ui_meta_value(value: object) -> ToolUiMetaValidation:
  """Validate a ``Tool`` object's ``_meta.ui`` value against Appendix C.

  It MUST be an object with a REQUIRED ``resourceUri`` that is a ``ui://`` URI and an
  OPTIONAL ``visibility``; absence of ``resourceUri`` (or a non-``ui://`` value) is
  non-conformant. The key is meaningful only when the UI extension is active. (R-AppC-i,
  AC-46.11)
  """
  if not isinstance(value, dict):
    return ToolUiMetaValidation(False, "not-an-object")
  resource_uri = value.get("resourceUri")
  if not isinstance(resource_uri, str):
    return ToolUiMetaValidation(False, "missing-resourceUri")
  if not resource_uri.startswith("ui://"):
    return ToolUiMetaValidation(False, "resourceUri-not-ui-uri")
  return ToolUiMetaValidation(True)


# ─── Appendix E: Consolidated Type Index ───────────────────────────────────────

@dataclass(frozen=True)
class TypeIndexEntry:
  """One row of Appendix E — a named wire type declared by this document."""

  #: The wire type (interface or type alias) name.
  type: str
  #: The section containing the type's full canonical declaration.
  defined_in: str
  #: One-line statement of the type's purpose.
  purpose: str


#: Appendix E — the Consolidated Type Index: every wire type (interface or type alias)
#: declared by this document, alphabetically sorted (case-insensitive), each with its
#: canonical defining section and a one-line purpose. (Appendix E)
TYPE_REGISTRY: tuple[TypeIndexEntry, ...] = (
  TypeIndexEntry("Annotations", "§14.6 Annotations", "Optional client-facing hints (audience, priority, timestamps) attachable to content and resources."),
  TypeIndexEntry("AudioContent", "§14.4.3 AudioContent", "Content block carrying base64-encoded audio data with a MIME type."),
  TypeIndexEntry("AuthorizationServerMetadata", "§23.3 Authorization Server Metadata Discovery", "OAuth authorization-server metadata document advertising endpoints and supported capabilities."),
  TypeIndexEntry("BaseMetadata", "§14.1 BaseMetadata: name and title", "Common base carrying the programmatic name and human-facing title."),
  TypeIndexEntry("BlobResourceContents", "§14.5 ResourceContents and variants", "Resource contents variant carrying base64-encoded binary data."),
  TypeIndexEntry("BooleanSchema", "§20.4 The restricted form schema", "Primitive form-field schema describing a boolean input."),
  TypeIndexEntry("CacheableResult", "§13.1 The CacheableResult Structure", "Result mixin carrying caching hints (ttlMs, cacheScope)."),
  TypeIndexEntry("CallToolRequest", "§16.5 Calling tools: tools/call", "Request to invoke a tool by name with arguments."),
  TypeIndexEntry("CallToolResult", "§16.5 Calling tools: tools/call", "Successful tool-invocation result carrying content blocks and optional structured output."),
  TypeIndexEntry("CancelledNotification", "§15.2.1 The notifications/cancelled notification", "Notification that the sender is cancelling a request the sender issued earlier."),
  TypeIndexEntry("CancelledNotificationParams", "§15.2.1 The notifications/cancelled notification", "Parameters of the cancellation notification (target request id and optional reason)."),
  TypeIndexEntry("CancelledTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the cancelled terminal state."),
  TypeIndexEntry("CancelTaskRequest", "§25.9 Cancelling a Task: tasks/cancel", "Request to cancel an in-progress task by taskId."),
  TypeIndexEntry("CancelTaskResult", "§25.9 Cancelling a Task: tasks/cancel", "Empty acknowledgement returned for a task cancellation."),
  TypeIndexEntry("ClientCapabilities", "§6.2 ClientCapabilities", "Capability set a client advertises to the server."),
  TypeIndexEntry("ClientIdMetadataDocument", "§23.12 Client ID Metadata Documents", "Client-published metadata document identified by a client-id URL."),
  TypeIndexEntry("ClientRegistrationRequest", "§23.14 Dynamic Client Registration", "Dynamic client registration request body."),
  TypeIndexEntry("ClientRegistrationResponse", "§23.14 Dynamic Client Registration", "Dynamic client registration response carrying issued client credentials."),
  TypeIndexEntry("ClientSamplingCapability", "§21.2.3 Client Capability", "Client capability declaring support for the deprecated sampling input-request kind."),
  TypeIndexEntry("CompletedTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the completed terminal state."),
  TypeIndexEntry("CompleteRequest", "§19.2 completion/complete request", "Request for completion suggestions for a prompt or resource-template argument."),
  TypeIndexEntry("CompleteRequestParams", "§19.2 completion/complete request", "Parameters of a completion request (reference, argument, context)."),
  TypeIndexEntry("CompleteResult", "§19.4 CompleteResult", "Completion result carrying candidate values and totals."),
  TypeIndexEntry("CompletionsCapability", "§19.1 The completions capability", "Server capability declaring support for argument completion."),
  TypeIndexEntry("ContentBlock", "§14.4 ContentBlock", "Discriminated union of content block kinds exchanged in messages and results."),
  TypeIndexEntry("CreateMessageRequest", "§21.2.4 Request Parameters", "Deprecated sampling request asking the client to produce a model message."),
  TypeIndexEntry("CreateMessageRequestParams", "§21.2.4 Request Parameters", "Parameters of the deprecated sampling request (messages, model preferences, tools)."),
  TypeIndexEntry("CreateMessageResult", "§21.2.8 Result", "Result of the deprecated sampling request carrying the generated message."),
  TypeIndexEntry("CreateTaskResult", "§25.3 Task Augmentation of Existing Requests", 'Task-handle result (resultType: "task") returned in place of an ordinary result.'),
  TypeIndexEntry("Cursor", "§3.7 Base Request and Notification Params", "Opaque pagination cursor string."),
  TypeIndexEntry("DetailedTask", "§25.4 Task and DetailedTask Object Types", "Discriminated union of task objects with status-specific fields."),
  TypeIndexEntry("DiscoverRequest", "§5.3.1 Request", "Request for server discovery and protocol-revision negotiation."),
  TypeIndexEntry("DiscoverResult", "§5.3.2 Result", "Result of server/discover carrying the negotiated revision and capabilities."),
  TypeIndexEntry("DiscoverResultResponse", "§5.3.2 Result", "Success-response envelope wrapping a DiscoverResult."),
  TypeIndexEntry("ElicitRequest", "§20.2 Delivery via input-required result", "Input-request asking the client to collect user input via form or URL."),
  TypeIndexEntry("ElicitRequestFormParams", "§20.3 Elicitation modes and parameter shapes", "Form-mode elicitation parameters carrying the requested schema."),
  TypeIndexEntry("ElicitRequestParams", "§20.2 Delivery via input-required result", "Union of form-mode and URL-mode elicitation parameter shapes."),
  TypeIndexEntry("ElicitRequestURLParams", "§20.3 Elicitation modes and parameter shapes", "URL-mode elicitation parameters carrying the out-of-band URL and id."),
  TypeIndexEntry("ElicitResult", "§20.5 ElicitResult and response actions", "Elicitation response carrying the user action and any collected content."),
  TypeIndexEntry("EmbeddedResource", "§14.4.5 EmbeddedResource", "Content block embedding resource contents inline."),
  TypeIndexEntry("EmptyResult", "§3.9 Empty Result", "Result type with no fields beyond the base, used for bare acknowledgements."),
  TypeIndexEntry("EnumSchema", "§20.4 The restricted form schema", "Union of enumerated (single/multi-select) primitive form-field schemas."),
  TypeIndexEntry("Error", "§3.8 Error Object", "JSON-RPC error object (code, message, optional data)."),
  TypeIndexEntry("ExtensionSettings", "§24.3 Negotiation", "Per-extension settings map carried during extension negotiation."),
  TypeIndexEntry("FailedTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the failed terminal state."),
  TypeIndexEntry("GetPromptRequest", "§18.4 Getting a prompt: prompts/get", "Request to resolve a prompt by name with arguments."),
  TypeIndexEntry("GetPromptResult", "§18.4 Getting a prompt: prompts/get", "Resolved prompt result carrying the message list."),
  TypeIndexEntry("GetTaskRequest", "§25.7 Retrieving a Task: tasks/get", "Request to retrieve a task's current detailed state by taskId."),
  TypeIndexEntry("GetTaskResult", "§25.7 Retrieving a Task: tasks/get", "Result carrying a DetailedTask for the requested task."),
  TypeIndexEntry("Icon", "§14.2 Icon and Icons", "Single icon descriptor (source, optional MIME type and size)."),
  TypeIndexEntry("Icons", "§14.2 Icon and Icons", "Collection of icon descriptors."),
  TypeIndexEntry("ImageContent", "§14.4.2 ImageContent", "Content block carrying base64-encoded image data with a MIME type."),
  TypeIndexEntry("Implementation", "§14.3 Implementation", "Descriptor identifying an implementation (name, title, version)."),
  TypeIndexEntry("InputRequest", "§11.2 InputRequiredResult and the Input Requests", "Discriminated union of input-request kinds a server may ask a client to fulfill."),
  TypeIndexEntry("InputRequests", "§11.2 InputRequiredResult and the Input Requests", "Map from server-chosen key to a single InputRequest."),
  TypeIndexEntry("InputRequiredResult", "§11.2 InputRequiredResult and the Input Requests", 'Result (resultType: "input_required") requesting further client input.'),
  TypeIndexEntry("InputRequiredTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task awaiting client input."),
  TypeIndexEntry("InputResponse", "§11.4 The Retry Request: InputResponseRequestParams", "Discriminated union of input-response kinds answering an InputRequest."),
  TypeIndexEntry("InputResponseRequestParams", "§11.4 The Retry Request: InputResponseRequestParams", "Retry parameters carrying inputResponses and the echoed requestState."),
  TypeIndexEntry("InputResponses", "§11.4 The Retry Request: InputResponseRequestParams", "Map from key to InputResponse, answering the corresponding inputRequests."),
  TypeIndexEntry("JSONArray", "§2.3 JSON Value Model", "Ordered list of JSON values."),
  TypeIndexEntry("JSONObject", "§2.3 JSON Value Model", "Unordered, string-keyed map of JSON values."),
  TypeIndexEntry("JSONRPCErrorResponse", "§3.5.2 Error Response", "JSON-RPC error response envelope."),
  TypeIndexEntry("JSONRPCMessage", "§3.1 JSON-RPC Framing", "Union of all framed JSON-RPC message kinds."),
  TypeIndexEntry("JSONRPCNotification", "§3.4 Notifications", "JSON-RPC notification envelope (no id)."),
  TypeIndexEntry("JSONRPCRequest", "§3.3 Requests", "JSON-RPC request envelope (with id)."),
  TypeIndexEntry("JSONRPCResponse", "§3.5 Responses", "Union of success and error response envelopes."),
  TypeIndexEntry("JSONRPCResultResponse", "§3.5.1 Success Response", "JSON-RPC success response envelope carrying a result."),
  TypeIndexEntry("JSONValue", "§2.3 JSON Value Model", "Any JSON value (null, boolean, number, string, array, object)."),
  TypeIndexEntry("LegacyTitledEnumSchema", "§20.4 The restricted form schema", "Deprecated enum form-field schema using a parallel enumNames array."),
  TypeIndexEntry("ListPromptsRequest", "§18.2 Listing prompts: prompts/list", "Paginated request to list available prompts."),
  TypeIndexEntry("ListPromptsResult", "§18.2 Listing prompts: prompts/list", "Paginated result listing prompts."),
  TypeIndexEntry("ListResourcesRequest", "§17.2 Listing resources: resources/list", "Paginated request to list available resources."),
  TypeIndexEntry("ListResourcesResult", "§17.2 Listing resources: resources/list", "Paginated, cacheable result listing resources."),
  TypeIndexEntry("ListResourceTemplatesRequest", "§17.3 Listing resource templates: resources/templates/list", "Paginated request to list resource templates."),
  TypeIndexEntry("ListResourceTemplatesResult", "§17.3 Listing resource templates: resources/templates/list", "Paginated, cacheable result listing resource templates."),
  TypeIndexEntry("ListRootsRequest", "§21.1.4 The roots/list Input Request", "Deprecated input-request asking the client for its root list."),
  TypeIndexEntry("ListRootsResult", "§21.1.5 The ListRootsResult and the Root Type", "Result of the deprecated roots listing."),
  TypeIndexEntry("ListToolsRequest", "§16.2 Listing tools: tools/list", "Paginated request to list available tools."),
  TypeIndexEntry("ListToolsResult", "§16.2 Listing tools: tools/list", "Paginated result listing tools."),
  TypeIndexEntry("LoggingLevel", "§15.3.1 The LoggingLevel enumeration", "Enumeration of syslog-style log severity levels."),
  TypeIndexEntry("LoggingMessageNotification", "§15.3.2 The notifications/message notification", "Notification carrying a log message from server to client."),
  TypeIndexEntry("LoggingMessageNotificationParams", "§15.3.2 The notifications/message notification", "Parameters of a logging notification (level, logger, data)."),
  TypeIndexEntry("MetaObject", "§4.1 The _meta Object", "Open string-keyed metadata map carried in _meta."),
  TypeIndexEntry("MissingRequiredClientCapabilityError", "§22.3.1 -32003 MissingRequiredClientCapability", "Error payload reporting a required client capability that was not declared."),
  TypeIndexEntry("ModelHint", "§21.2.9 Model Preferences", "Hint guiding model selection during deprecated sampling."),
  TypeIndexEntry("ModelPreferences", "§21.2.9 Model Preferences", "Model-selection preferences for deprecated sampling."),
  TypeIndexEntry("Notification", "§3.4 Notifications", "Base shape of a notification (method and optional params)."),
  TypeIndexEntry("NotificationParams", "§3.7 Base Request and Notification Params", "Base parameters shape common to notifications."),
  TypeIndexEntry("NumberSchema", "§20.4 The restricted form schema", "Primitive form-field schema describing a numeric input."),
  TypeIndexEntry("OpenLinkParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host request parameters to open an external link."),
  TypeIndexEntry("PaginatedRequestParams", "§12.2 Request and Result Shapes", "Base request parameters carrying an optional cursor."),
  TypeIndexEntry("PaginatedResult", "§12.2 Request and Result Shapes", "Base result carrying an optional nextCursor."),
  TypeIndexEntry("PrimitiveSchemaDefinition", "§20.4 The restricted form schema", "Union of primitive form-field schema kinds (string, number, boolean, enum)."),
  TypeIndexEntry("ProgressNotification", "§15.1.3 The notifications/progress notification", "Notification reporting progress on a long-running request."),
  TypeIndexEntry("ProgressNotificationParams", "§15.1.3 The notifications/progress notification", "Parameters of a progress notification (token, progress, total, message)."),
  TypeIndexEntry("ProgressToken", "§3.7 Base Request and Notification Params", "Token correlating progress notifications with a request."),
  TypeIndexEntry("Prompt", "§18.3 The Prompt and PromptArgument types", "Descriptor of an available prompt and its arguments."),
  TypeIndexEntry("PromptArgument", "§18.3 The Prompt and PromptArgument types", "Descriptor of a single prompt argument."),
  TypeIndexEntry("PromptListChangedNotification", "§18.6 The prompts-list-changed notification", "Notification that the prompt list has changed."),
  TypeIndexEntry("PromptMessage", "§18.5 The PromptMessage type and valid content", "Single message within a resolved prompt."),
  TypeIndexEntry("PromptReference", "§19.3 Reference types: PromptReference and ResourceTemplateReference", "Completion reference identifying a prompt."),
  TypeIndexEntry("PromptsCapability", "§18.1 The prompts capability", "Server capability declaring support for prompts."),
  TypeIndexEntry("ProtectedResourceMetadata", "§23.2 Protected Resource Metadata Discovery", "Metadata document advertising the resource server's authorization servers."),
  TypeIndexEntry("ReadResourceRequest", "§17.5 Reading a resource: resources/read", "Request to read a resource by URI."),
  TypeIndexEntry("ReadResourceRequestParams", "§17.5 Reading a resource: resources/read", "Parameters of a resource-read request (URI plus input responses)."),
  TypeIndexEntry("ReadResourceResult", "§17.5 Reading a resource: resources/read", "Cacheable result carrying the read resource's contents."),
  TypeIndexEntry("Request", "§3.3 Requests", "Base shape of a request (method and optional params)."),
  TypeIndexEntry("RequestId", "§3.2 Request Identifier", "Request-correlation identifier (string or number)."),
  TypeIndexEntry("RequestMetaObject", "§4.3 Protocol-Defined Per-Request _meta Keys", "_meta shape for protocol-defined per-request metadata keys."),
  TypeIndexEntry("RequestParams", "§3.7 Base Request and Notification Params", "Base parameters shape common to requests, carrying _meta."),
  TypeIndexEntry("RequestProtocolVersionMeta", "§5.2 Carrying the Protocol Revision on a Request", "_meta shape carrying the protocol revision on a request."),
  TypeIndexEntry("Resource", "§17.4 The Resource and ResourceTemplate types", "Descriptor of a concrete resource."),
  TypeIndexEntry("ResourceContents", "§14.5 ResourceContents and variants", "Base of the resource-contents variants (text/blob)."),
  TypeIndexEntry("ResourceLink", "§14.4.4 ResourceLink", "Content block referencing a resource by URI."),
  TypeIndexEntry("ResourceListChangedNotification", "§17.7 Change notifications and subscriptions", "Notification that the resource list has changed."),
  TypeIndexEntry("ResourceNotFoundError", "§17.6 Resource-not-found error", "Error payload reporting that a requested resource URI was not found."),
  TypeIndexEntry("ResourcesServerCapability", "§17.1 The resources capability", "Server capability declaring support for resources (and subscription flags)."),
  TypeIndexEntry("ResourceTeardownParams", "§26.5.4 Lifecycle and context-change messages (Host → UI)", "Host-to-UI parameters signalling that the UI resource is being torn down."),
  TypeIndexEntry("ResourceTemplate", "§17.4 The Resource and ResourceTemplate types", "Descriptor of a parameterized resource URI template."),
  TypeIndexEntry("ResourceTemplateReference", "§19.3 Reference types: PromptReference and ResourceTemplateReference", "Completion reference identifying a resource template."),
  TypeIndexEntry("ResourceUiMeta", "§26.4 The UI Resource", "UI metadata (CSP, permissions) attached to a UI resource."),
  TypeIndexEntry("ResourceUpdatedNotification", "§17.7 Change notifications and subscriptions", "Notification that a subscribed resource has been updated."),
  TypeIndexEntry("ResourceUpdatedNotificationParams", "§17.7 Change notifications and subscriptions", "Parameters of a resource-updated notification (URI)."),
  TypeIndexEntry("Result", "§3.6 Result Base Type", "Base of all result types, carrying resultType and _meta."),
  TypeIndexEntry("ResultType", "§3.6 Result Base Type", "Open discriminator selecting the concrete result shape."),
  TypeIndexEntry("Role", "§14.7 Role", "Message-author role (user or assistant)."),
  TypeIndexEntry("Root", "§21.1.5 The ListRootsResult and the Root Type", "Deprecated descriptor of a client-exposed filesystem root."),
  TypeIndexEntry("SamplingMessage", "§21.2.6 Messages and Content Blocks", "Single message in a deprecated sampling conversation."),
  TypeIndexEntry("SamplingMessageContentBlock", "§21.2.6 Messages and Content Blocks", "Content-block union for sampling messages (text/image/audio plus tool_use/tool_result; excludes resource_link and resource)."),
  TypeIndexEntry("SandboxResourceReadyParams", "§26.5.5 Host-internal sandbox-proxy messages", "Host-internal sandbox-proxy parameters signalling the UI resource is ready."),
  TypeIndexEntry("ServerCapabilities", "§6.3 ServerCapabilities", "Capability set a server advertises to the client."),
  TypeIndexEntry("SingleSelectEnumSchema", "§20.4 The restricted form schema", "Union of single-select enum form-field schema variants."),
  TypeIndexEntry("SizeChangedParams", "§26.5.4 Lifecycle and context-change messages (Host → UI)", "Host-to-UI parameters reporting a UI size change."),
  TypeIndexEntry("StringSchema", "§20.4 The restricted form schema", "Primitive form-field schema describing a string input."),
  TypeIndexEntry("SubscriptionFilter", "§10.2 The subscriptions/listen Request and the Notification Filter", "Filter selecting which notification kinds a subscription delivers."),
  TypeIndexEntry("SubscriptionsAcknowledgedNotification", "§10.3 Acknowledgement", "Notification acknowledging an established subscription."),
  TypeIndexEntry("SubscriptionsAcknowledgedNotificationParams", "§10.3 Acknowledgement", "Parameters of the subscription-acknowledgement notification."),
  TypeIndexEntry("SubscriptionsListenRequest", "§10.2 The subscriptions/listen Request and the Notification Filter", "Request to open a server-to-client notification stream."),
  TypeIndexEntry("SubscriptionsListenRequestParams", "§10.2 The subscriptions/listen Request and the Notification Filter", "Parameters of the subscription-listen request (filter)."),
  TypeIndexEntry("Task", "§25.4 Task and DetailedTask Object Types", "Core task object (id, status, timestamps) shared by all task variants."),
  TypeIndexEntry("TaskStatus", "§25.5 Task Status Lifecycle", "Enumeration of task lifecycle states."),
  TypeIndexEntry("TaskStatusNotification", "§25.10 Task Status Notifications: notifications/tasks", "Notification reporting a task's status change."),
  TypeIndexEntry("TaskStatusNotificationParams", "§25.10 Task Status Notifications: notifications/tasks", "Parameters of a task-status notification (a DetailedTask)."),
  TypeIndexEntry("TasksExtensionCapability", "§25.2 Capability Declaration and Negotiation", "Capability declaring support for the Tasks extension."),
  TypeIndexEntry("TextContent", "§14.4.1 TextContent", "Content block carrying plain text."),
  TypeIndexEntry("TextResourceContents", "§14.5 ResourceContents and variants", "Resource contents variant carrying text."),
  TypeIndexEntry("TitledMultiSelectEnumSchema", "§20.4 The restricted form schema", "Multi-select enum form-field schema with per-option titles."),
  TypeIndexEntry("TitledSingleSelectEnumSchema", "§20.4 The restricted form schema", "Single-select enum form-field schema with per-option titles."),
  TypeIndexEntry("Tool", "§16.3 The Tool type", "Descriptor of an available tool (name, schemas, annotations)."),
  TypeIndexEntry("ToolAnnotations", "§16.7 Tool annotations", "Behavioral hints about a tool (read-only, destructive, idempotent, etc.)."),
  TypeIndexEntry("ToolCancelledParams", "§26.5.2 Tool input and result delivery (Host → UI)", "Host-to-UI parameters signalling a tool invocation was cancelled."),
  TypeIndexEntry("ToolChoice", "§21.2.5 Tool Choice", "Deprecated sampling control selecting how tools may be used."),
  TypeIndexEntry("ToolInputParams", "§26.5.2 Tool input and result delivery (Host → UI)", "Host-to-UI parameters delivering tool input arguments."),
  TypeIndexEntry("ToolListChangedNotification", "§16.8 The notifications/tools/list_changed notification", "Notification that the tool list has changed."),
  TypeIndexEntry("ToolResultContent", "§21.2.6 Messages and Content Blocks", "Sampling content block carrying a tool result."),
  TypeIndexEntry("ToolResultParams", "§26.5.2 Tool input and result delivery (Host → UI)", "Host-to-UI parameters delivering a tool result."),
  TypeIndexEntry("ToolsCallParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host parameters requesting a tool invocation."),
  TypeIndexEntry("ToolsCapability", "§16.1 The tools server capability", "Server capability declaring support for tools."),
  TypeIndexEntry("ToolUiMeta", "§26.3 Declaring a UI on a Tool", "UI metadata declaring an interactive UI on a tool."),
  TypeIndexEntry("ToolUseContent", "§21.2.6 Messages and Content Blocks", "Sampling content block carrying a tool-use request."),
  TypeIndexEntry("TraceContextMeta", "§15.4.1 Reserved trace-context metadata keys", "_meta shape carrying W3C trace-context fields."),
  TypeIndexEntry("UiContentSecurityPolicy", "§26.4 The UI Resource", "Content-security-policy descriptor for a UI resource."),
  TypeIndexEntry("UiHostContext", "§26.5.1 Initialization handshake", "Host rendering context (theme, display mode, styles) supplied to a UI."),
  TypeIndexEntry("UiHostExtensionCapability", "§26.2 Extension Identifier and Capability Negotiation", "Capability declaring support for the interactive user-interface extension."),
  TypeIndexEntry("UiInitializeParams", "§26.5.1 Initialization handshake", "UI-to-host initialization request parameters."),
  TypeIndexEntry("UiInitializeResult", "§26.5.1 Initialization handshake", "Host-to-UI initialization result (granted permissions, CSP, host context)."),
  TypeIndexEntry("UiMessageParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host parameters carrying a user-facing message."),
  TypeIndexEntry("UiPermissions", "§26.4 The UI Resource", "Sandbox permission set requested or granted for a UI resource."),
  TypeIndexEntry("UnsupportedProtocolVersionError", "§22.3.2 -32004 UnsupportedProtocolVersion", "Error payload reporting that no mutually supported protocol revision exists."),
  TypeIndexEntry("UntitledMultiSelectEnumSchema", "§20.4 The restricted form schema", "Multi-select enum form-field schema without per-option titles."),
  TypeIndexEntry("UntitledSingleSelectEnumSchema", "§20.4 The restricted form schema", "Single-select enum form-field schema without per-option titles."),
  TypeIndexEntry("UpdateModelContextParams", "§26.5.3 Tool-invocation and other requests (UI → Host)", "UI-to-host parameters updating the model-visible context."),
  TypeIndexEntry("UpdateTaskRequest", "§25.8 Supplying Input to a Task: tasks/update", "Request supplying input responses to an in-progress task."),
  TypeIndexEntry("UpdateTaskResult", "§25.8 Supplying Input to a Task: tasks/update", "Empty acknowledgement returned for a task update."),
  TypeIndexEntry("WorkingTask", "§25.4 Task and DetailedTask Object Types", "DetailedTask variant for a task in the working state."),
)


def lookup_type(type_name: str) -> TypeIndexEntry | None:
  """Look up the Appendix E entry for a wire ``type`` name, or ``None`` when the type is
  not in the index. (Appendix E)
  """
  for entry in TYPE_REGISTRY:
    if entry.type == type_name:
      return entry
  return None


#: The set of reserved error codes the §22 / Appendix B registry pins (the eight codes a
#: custom code MUST NOT collide with). Surfaced as a convenience set so a caller need not
#: derive it from ``RESERVED_ERROR_CODES``; the ``-32001`` HeaderMismatch member is the
#: one that lies inside the ``-32000..-32099`` range. (R-AppB-a, R-AppB-b)
APPENDIX_B_RESERVED_CODE_SET: frozenset[int] = frozenset(RESERVED_ERROR_CODES)


def is_error_code_defined_by_document(code: int) -> bool:
  """Return ``True`` when ``code`` is a code the document already defines in Appendix B —
  i.e. a code a custom definition MUST avoid.

  A ``True`` result means a custom code that equals it is non-conformant. (R-AppB-a,
  AC-46.1)

  Consults the full ``ERROR_CODE_REGISTRY`` so it catches every listed code (including
  the resource-not-found legacy literal), not only the eight in
  ``RESERVED_ERROR_CODES``. The ``-32001`` HeaderMismatch code is included.
  """
  return (
    code in APPENDIX_B_RESERVED_CODE_SET
    or code == HEADER_MISMATCH_CODE
    or code in ERROR_CODE_REGISTRY
  )
