"""Interactive UI Extension I: Negotiation, UI Declaration & UI Resource (§26.1–§26.4).

The server-facing, *static* half of the OPTIONAL Interactive User-Interface ("apps")
extension: how the extension is identified and negotiated, how a server DECLARES that
one of its tools has an associated interactive HTML interface (``_meta.ui`` ⇒ the
``{resourceUri, visibility?}`` shape validated by :func:`is_tool_ui_meta`), and how
that interface is served as an ordinary MCP resource under the ``ui://`` scheme with
the verbatim ``text/html;profile=mcp-app`` MIME type (the UI resource and its
:func:`is_resource_ui_meta` presentation/security hints).

The extension is an instance of the general Extension Mechanism (§24): the identifier
:data:`UI_EXTENSION_ID` is an ordinary key in the ``extensions`` capability map,
negotiated by intersection, and ``_meta.ui`` is the extension's reserved tool metadata
key. The TypeScript SDK reuses dedicated S38/S11 extension modules for that machinery;
the Python port has no such modules yet, so the small subset of extension primitives
this layer needs (advertised/active/intersection/may-emit) is reproduced here as
private helpers (:func:`_is_extension_settings`, :func:`_get_extension_settings`,
:func:`_is_extension_advertised`, :func:`_is_extension_active`, :func:`_may_emit_surface`)
with the EXACT semantics of their TS counterparts (R-6.5-h/-j/-l, R-24.3, R-24.4).

The UI rendering itself, the sandbox/CSP enforcement, the host-provided message
channel, and consent mediation are HOST responsibilities and are NOT implemented by a
server SDK — a conforming server SDK MUST be implementable with no
rendering/browser/UI-toolkit dependency (R-26.1-i). This module therefore models the
host obligations declaratively (documented constants and predicates a host can consult)
but never renders anything.

This is the protocol-level validation layer; the server shaping helpers (which build
``ui://`` resource blocks and launcher tool results) live in :mod:`mcp.server.ui`. The
canonical constants are defined HERE; the server module's matching values are aliases
of the same strings.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, StrictBool

from mcp._model import McpModel, validates
from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE
from mcp.protocol.meta import CLIENT_CAPABILITIES_META_KEY
from mcp.types.resource_contents import is_valid_resource_contents

# ─── §26.2 — Extension identifier & UI MIME type ──────────────────────────────

#: The Interactive UI ("apps") extension identifier: the exact, opaque,
#: case-sensitive string used as a key in the ``extensions`` capability map.
#: A receiver MUST treat this as an opaque, case-sensitive string — compare with
#: :func:`extension_ids_match`, never with case folding, so ``IO.ModelContextProtocol/UI``
#: does NOT match. (§26.2, R-26.2-b)
UI_EXTENSION_ID = "io.modelcontextprotocol/ui"

#: The UI resource MIME type, reproduced verbatim and case-sensitively, including the
#: ``;profile=mcp-app`` parameter and the ABSENCE of surrounding whitespace. A host that
#: supports the extension MUST include this exact string in its advertised ``mimeTypes``;
#: a UI resource MUST be served with this exact type. ``"text/html; profile=mcp-app"``
#: (extra space) and ``"TEXT/HTML;PROFILE=MCP-APP"`` (wrong case) do NOT satisfy it.
#: (§26.2 / §26.4, R-26.2-e, R-26.4-d)
UI_MIME_TYPE = "text/html;profile=mcp-app"

#: The ``ui://`` URI scheme prefix designating an MCP UI resource. The host MUST treat
#: the whole URI as opaque and MUST NOT derive a network origin from it.
#: (§26.4, R-26.4-b, R-26.4-c)
UI_URI_SCHEME = "ui://"


def extension_ids_match(a: str, b: str) -> bool:
  """Return ``True`` when two extension identifiers are equal, compared verbatim and
  case-sensitively (never case-folded). (§26.2, R-26.2-b; §24)
  """
  return a == b


def is_ui_mime_type(mime_type: object) -> bool:
  """Return ``True`` when ``mime_type`` is exactly :data:`UI_MIME_TYPE` — matched
  verbatim and case-sensitively, with no whitespace tolerance. (R-26.2-e, R-26.4-d)

  This single gate backs both "the host advertised the required type" and "the resource
  was served with the required type": both demand the byte-exact string, so trimming or
  lower-casing would be non-conformant.
  """
  return mime_type == UI_MIME_TYPE


def is_ui_resource_uri(uri: object) -> bool:
  """Return ``True`` when ``uri`` is a ``ui://``-scheme URI string. (§26.4, R-26.3-b,
  R-26.4-b, R-26.4-c)

  The authority and path after ``ui://`` are server-defined and opaque; this only
  checks the scheme — it deliberately parses no structure, because the host MUST treat
  the whole URI as an opaque identifier and derive no network origin from it.
  """
  return isinstance(uri, str) and uri.startswith(UI_URI_SCHEME)


# ─── Extension-mechanism primitives (S38/S11 subset, reproduced) ──────────────
# The TS module imports these from dedicated extension modules; the Python port has
# none yet, so the exact-semantics subset the UI layer needs lives here as private
# helpers. (R-6.5-h, R-6.5-j, R-6.5-l, R-24.3-a, R-24.4-c)


def _is_extension_settings(value: object) -> bool:
  """Return ``True`` for the only legal extension settings shape — a non-null, non-list
  object. An empty object ``{}`` qualifies (a valid enabling declaration, not absence).
  (R-6.5-h)
  """
  return isinstance(value, dict)


def _get_extension_settings(raw: object, identifier: str) -> dict | None:
  """Return the settings object a peer advertised for ``identifier``, or ``None`` when
  the extension is not validly advertised (absent, ``null``, or malformed).
  (R-6.5-h, R-6.5-j)
  """
  if not _is_extension_settings(raw):
    return None
  value = raw.get(identifier)
  return value if _is_extension_settings(value) else None


def _is_extension_advertised(raw: object, identifier: str) -> bool:
  """Return ``True`` when a receiver should treat ``identifier`` as ADVERTISED by a peer
  whose raw ``extensions`` map is ``raw`` — the key is present and maps to a valid
  (non-``null``, object) settings value. (R-6.5-h, R-6.5-j)
  """
  return _get_extension_settings(raw, identifier) is not None


def _is_extension_active(identifier: str, client_extensions: object, server_extensions: object) -> bool:
  """Return ``True`` when ``identifier`` is ACTIVE between two peers — both validly
  advertise it (the intersection of their maps). (R-6.5-l)
  """
  return _is_extension_advertised(client_extensions, identifier) and _is_extension_advertised(
    server_extensions, identifier
  )


def _may_emit_surface(identifier: str, active_set: Iterable[str]) -> bool:
  """Return ``True`` when ``identifier`` is present in ``active_set`` and an extension
  MAY therefore emit its surface. Extensions are disabled by default. (R-24.3-e, R-24.5-c)
  """
  return identifier in set(active_set)


# ─── §26.1 — Roles: server vs host responsibility split ───────────────────────

#: The discrete responsibilities the apps extension assigns, each fixed to a single
#: role. (§26.1, R-26.1-b..h)
UI_RESPONSIBILITIES = (
  "declare-ui-meta",
  "serve-ui-resource",
  "render",
  "sandbox",
  "enforce-csp",
  "run-channel",
  "mediate-consent",
)

#: The fixed, normative assignment of each responsibility to the role that owns it. The
#: server (and server-side SDK) is RESPONSIBLE only for declaring the association and
#: serving the resource; everything to do with rendering, isolation, policy enforcement,
#: the channel, and consent is the host's. (§26.1, R-26.1-b..h)
UI_RESPONSIBILITY_OWNER: dict[str, str] = {
  "declare-ui-meta": "server",
  "serve-ui-resource": "server",
  "render": "host",
  "sandbox": "host",
  "enforce-csp": "host",
  "run-channel": "host",
  "mediate-consent": "host",
}


def ui_responsibility_owner(responsibility: str) -> str:
  """Return the role (``"server"`` / ``"host"``) that owns ``responsibility``. (§26.1)

  :raises KeyError: when ``responsibility`` is not a recognized responsibility.
  """
  return UI_RESPONSIBILITY_OWNER[responsibility]


def is_server_responsibility(responsibility: str) -> bool:
  """Return ``True`` when ``responsibility`` belongs to the server — one of the only two
  server obligations, declaring ``_meta.ui`` and serving the ``ui://`` resource.
  (R-26.1-b, R-26.1-c)

  Every other responsibility (render, sandbox, enforce CSP/permissions, run the channel,
  mediate consent) returns ``False``: a conforming server SDK does NOT carry them and
  MUST be implementable with no rendering/browser/UI-toolkit dependency. (R-26.1-d, R-26.1-i)
  """
  return UI_RESPONSIBILITY_OWNER.get(responsibility) == "server"


# ─── §26.2 — UiHostExtensionCapability (the host's advertised value) ──────────


class UiHostExtensionCapability(McpModel):
  """The host's advertised apps-extension capability value (§26.2): a ``mimeTypes`` array of
  strings; extra members pass through. (R-26.2-d)
  """

  mime_types: list[str]


def is_ui_host_extension_capability(value: object) -> bool:
  """Return ``True`` when ``value`` is a well-formed ``UiHostExtensionCapability`` — an
  object carrying a ``mimeTypes`` array of strings. (§26.2, R-26.2-d)
  """
  return validates(UiHostExtensionCapability, value)


def capability_renders_ui(value: object) -> bool:
  """Return ``True`` when an advertised host capability value enables UI rendering: it is
  a well-formed ``UiHostExtensionCapability`` AND its ``mimeTypes`` contains the verbatim
  :data:`UI_MIME_TYPE`. (R-26.2-d, R-26.2-e)

  A capability whose ``mimeTypes`` carries only ``"text/html; profile=mcp-app"`` (extra
  whitespace) or ``"TEXT/HTML;PROFILE=MCP-APP"`` (wrong case) returns ``False``.
  """
  if not is_ui_host_extension_capability(value):
    return False
  return any(is_ui_mime_type(m) for m in value["mimeTypes"])


def build_ui_host_extension_capability(additional_mime_types: Iterable[str] = ()) -> dict:
  """Build a conformant ``UiHostExtensionCapability`` for a host that supports UI
  rendering. :data:`UI_MIME_TYPE` is always included (deduplicated) so the result
  satisfies R-26.2-e; additional renderable MIME types MAY be supplied and are appended
  in order. (§26.2, R-26.2-d, R-26.2-e)
  """
  mime_types = [UI_MIME_TYPE]
  for m in additional_mime_types:
    if m != UI_MIME_TYPE:
      mime_types.append(m)
  return {"mimeTypes": mime_types}


# ─── §26.2 — Reading the host advertisement from negotiation surfaces ─────────


def get_ui_host_capability(extensions_map: object) -> dict | None:
  """Return the ``UiHostExtensionCapability`` a host advertised under
  :data:`UI_EXTENSION_ID` in an ``extensions`` map (raw), or ``None`` when the extension
  is not validly advertised or its value is not a well-formed capability.
  (§26.2, R-26.2-c, R-26.2-d)
  """
  settings = _get_extension_settings(extensions_map, UI_EXTENSION_ID)
  if settings is None:
    return None
  return settings if is_ui_host_extension_capability(settings) else None


def host_advertises_ui_rendering(extensions_map: object) -> bool:
  """Return ``True`` when a host's ``extensions`` map advertises the apps extension in a
  way that enables UI rendering: the :data:`UI_EXTENSION_ID` key is present with a
  capability whose ``mimeTypes`` includes the verbatim :data:`UI_MIME_TYPE`.
  (§26.2, R-26.2-c, R-26.2-d, R-26.2-e)

  This is the predicate behind the server's two prohibitions: a server MUST NOT declare
  UI associations (R-26.2-f) and MUST NOT expect any UI resource to be rendered
  (R-26.2-g) unless this returns ``True``. See :func:`may_server_declare_ui` /
  :func:`may_server_expect_rendering`.
  """
  return capability_renders_ui(get_ui_host_capability(extensions_map))


def request_advertises_ui_rendering(request_meta: object) -> bool:
  """Read the host's advertised ``extensions`` map from a single request's ``_meta`` (the
  map nested under ``io.modelcontextprotocol/clientCapabilities.extensions``) and report
  whether it advertises UI rendering with the required MIME type. (§26.2, R-26.2-c)

  A host that supports rendering UIs MUST advertise the extension in the ``_meta`` of
  EVERY request (R-26.2-c); the stateless model means each request is judged on its own
  ``_meta``. A request whose ``_meta`` omits the advertisement — or omits
  ``clientCapabilities`` entirely — yields ``False``, and the server treats that request
  as if the extension were inactive (R-26.2-i).
  """
  if not isinstance(request_meta, dict):
    return False
  client_caps = request_meta.get(CLIENT_CAPABILITIES_META_KEY)
  if not isinstance(client_caps, dict):
    return False
  return host_advertises_ui_rendering(client_caps.get("extensions"))


# ─── §26.2 — Server gating: may declare UI / expect rendering ─────────────────


def may_server_declare_ui(host_extensions_map: object) -> bool:
  """Return ``True`` when a server MAY declare UI associations on its tools — only when
  the host has advertised the extension with a ``mimeTypes`` array that includes the
  verbatim :data:`UI_MIME_TYPE`. A server MUST NOT declare otherwise. (§26.2, R-26.2-f)
  """
  return host_advertises_ui_rendering(host_extensions_map)


def may_server_expect_rendering(host_extensions_map: object) -> bool:
  """Return ``True`` when a server MAY expect a UI resource to be rendered — only when the
  host has advertised the extension with the required :data:`UI_MIME_TYPE`. A server MUST
  NOT expect rendering otherwise. (§26.2, R-26.2-g)

  Same gate as :func:`may_server_declare_ui`; named separately so each prohibition
  (declare vs expect-rendering) reads clearly at the call site.
  """
  return host_advertises_ui_rendering(host_extensions_map)


def is_ui_extension_active(client_extensions: object, server_extensions: object) -> bool:
  """Return ``True`` when the apps extension is ACTIVE between client and server — both
  validly advertise :data:`UI_EXTENSION_ID` in their ``extensions`` maps. (§26.2, R-26.2-a)

  Mere presence of the key on one side does not activate the extension; the receiver
  computes the intersection. When inactive, the host treats a tool carrying ``_meta.ui``
  as a normal tool and ignores the UI key. (R-26.2-i)
  """
  return _is_extension_active(UI_EXTENSION_ID, client_extensions, server_extensions)


def may_emit_ui_surface(active_set: Iterable[str]) -> bool:
  """Return ``True`` when the apps extension is in ``active_set`` and the server MAY
  therefore emit its surface (the ``_meta.ui`` key, the ``ui://`` resource) for this
  interaction. (§26.2, R-26.2-a)
  """
  return _may_emit_surface(UI_EXTENSION_ID, active_set)


# ─── §26.2 — Server acknowledgement in server/discover ────────────────────────


def is_server_ui_acknowledgement(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid ``ServerUiAcknowledgement`` — any object,
  which MAY be empty (``{}``). Presence of the key is what signals acknowledgement.
  (§26.2, R-26.2-j)
  """
  return isinstance(value, dict)


def build_server_ui_acknowledgement() -> dict:
  """Build the ``capabilities.extensions`` fragment a server includes in its
  ``server/discover`` result to acknowledge the apps extension: a single
  :data:`UI_EXTENSION_ID` key mapped to an empty object. (§26.2, R-26.2-j)

  Acknowledgement is OPTIONAL (MAY); a server merges this fragment into the
  ``extensions`` map of its result capabilities when it chooses to acknowledge.
  """
  return {UI_EXTENSION_ID: {}}


def server_acknowledges_ui(server_extensions_map: object) -> bool:
  """Return ``True`` when a server's ``server/discover`` result ``capabilities.extensions``
  map acknowledges the apps extension — the :data:`UI_EXTENSION_ID` key is present with a
  (possibly empty) object value. (§26.2, R-26.2-j)
  """
  return _is_extension_advertised(server_extensions_map, UI_EXTENSION_ID)


# ─── §26.3 — ToolUiMeta (the _meta.ui declaration on a tool) ──────────────────

#: The reserved nested key under a tool's ``_meta`` that carries the UI declaration:
#: ``ui``, giving the path ``_meta.ui``. (§26.3)
TOOL_UI_META_KEY = "ui"

#: The exact visibility enum strings: which actor may invoke a tool. ``"model"`` —
#: callable by the model/agent via ordinary tool-calling (§16); ``"app"`` — callable by
#: the rendered UI over the channel (§26.5). (§26.3, R-26.3-d)
UI_VISIBILITY_VALUES = ("model", "app")

#: The effective ``visibility`` when ``_meta.ui.visibility`` is omitted: both actors may
#: invoke the tool. (§26.3, R-26.3-d)
DEFAULT_UI_VISIBILITY = ("model", "app")


def is_ui_visibility(value: object) -> bool:
  """Return ``True`` when ``value`` is one of the exact visibility enum strings
  (``"model"`` / ``"app"``), matched case-sensitively. (R-26.3-d)
  """
  return value in UI_VISIBILITY_VALUES


def _require_ui_uri(value: str) -> str:
  """Field validator: a ``ToolUiMeta.resourceUri`` MUST use the ``ui://`` scheme. (R-26.3-b)"""
  if not is_ui_resource_uri(value):
    raise ValueError(f"resourceUri MUST use the {UI_URI_SCHEME} scheme (R-26.3-b)")
  return value


class ToolUiMeta(McpModel):
  """The ``_meta.ui`` declaration on a tool (§26.3) — a ``ui://`` ``resourceUri`` and an
  OPTIONAL ``visibility`` array of ``"model"``/``"app"`` (omitted ⇒ both). (R-26.3-a/-b/-d)
  """

  resource_uri: Annotated[str, AfterValidator(_require_ui_uri)]
  visibility: list[Literal["model", "app"]] | None = None


def is_tool_ui_meta(value: object) -> bool:
  """Return ``True`` when ``value`` is a well-formed ``ToolUiMeta`` — the object at a
  tool's ``_meta.ui`` declaring its associated interactive UI. (§26.3, R-26.3-a/-b/-d)
  """
  return validates(ToolUiMeta, value)


def get_tool_ui_meta(tool: object) -> dict | None:
  """Extract the ``ToolUiMeta`` from a tool — i.e. parse ``tool._meta.ui`` — returning
  ``None`` when there is no ``_meta``, no ``ui`` key, or the value is not a well-formed
  declaration. (§26.3)

  This does NOT gate on negotiation: a receiver that has not negotiated the extension
  MUST ignore the key (R-26.3-g) — use :func:`read_tool_ui_meta` for the
  negotiation-aware read.
  """
  if not isinstance(tool, dict):
    return None
  meta = tool.get("_meta")
  if not isinstance(meta, dict):
    return None
  ui = meta.get(TOOL_UI_META_KEY)
  return ui if is_tool_ui_meta(ui) else None


def read_tool_ui_meta(tool: object, active_set: Iterable[str]) -> dict | None:
  """Read a tool's UI declaration ONLY when the extension is active for the interaction;
  return ``None`` when inactive, modeling "a receiver that does not negotiate this
  extension MUST ignore the ``_meta.ui`` key". (§26.3, R-26.3-g, R-26.2-i)

  When inactive the tool is treated as a normal tool and the key is ignored — its
  presence MUST NOT change the behavior of an ordinary ``tools/call`` (R-26.3-h).
  """
  if not may_emit_ui_surface(active_set):
    return None
  return get_tool_ui_meta(tool)


def effective_visibility(meta: dict) -> tuple[str, ...]:
  """Return the EFFECTIVE visibility of a UI declaration: the declared ``visibility``
  array when present, otherwise the default ``("model", "app")``. (§26.3, R-26.3-d)
  """
  vis = meta.get("visibility")
  if vis is None:
    return DEFAULT_UI_VISIBILITY
  return tuple(vis)


def is_app_invokable(meta: dict) -> bool:
  """Return ``True`` when a tool's effective visibility includes ``"app"`` — i.e. the
  rendered UI MAY invoke it over the channel. A host SHOULD reject a UI-originated
  ``tools/call`` for a tool whose effective ``visibility`` does NOT include ``"app"``.
  (§26.3, R-26.3-e)
  """
  return "app" in effective_visibility(meta)


def host_should_reject_ui_originated_call(meta: dict | None) -> bool:
  """Return ``True`` when a host SHOULD REJECT a ``tools/call`` that originates from a
  rendered UI, given the tool's UI declaration: rejected exactly when the tool's
  effective visibility excludes ``"app"``. (§26.3, R-26.3-e)

  A tool with no UI declaration (``None``) was not exposed to the UI at all; a
  UI-originated call for it is likewise rejected.
  """
  if meta is None:
    return True
  return not is_app_invokable(meta)


def is_visible_to_model(meta: dict) -> bool:
  """Return ``True`` when a tool's effective visibility includes ``"model"`` — i.e. it
  appears in the model's tool list and is callable via ordinary tool-calling. A tool
  with ``visibility`` ``["app"]`` is callable ONLY by the UI and is HIDDEN from the
  model's tool list, so this returns ``False``. (§26.3, R-26.3-f)
  """
  return "model" in effective_visibility(meta)


def tools_visible_to_model(tools: Iterable, active_set: Iterable[str]) -> list:
  """Filter tools to those visible to the model, applying the §26.3 hide rule: a tool
  whose effective UI visibility is ``["app"]``-only is omitted from the model's tool
  list. (§26.3, R-26.3-f)

  The extension must be active for the rule to apply (R-26.3-g): when inactive,
  ``_meta.ui`` is ignored and every tool is treated as ordinary and model-visible. A
  tool with no UI declaration is always model-visible.
  """
  tool_list = list(tools)
  if not may_emit_ui_surface(active_set):
    return tool_list
  result = []
  for tool in tool_list:
    meta = get_tool_ui_meta(tool)
    if meta is None or is_visible_to_model(meta):
      result.append(tool)
  return result


# ─── §26.4 — UI resource hints: CSP, permissions, domain, border ──────────────

#: The four CSP descriptor members, in spec order. (§26.4, R-26.4-f)
UI_CSP_DIRECTIVES = ("connectDomains", "resourceDomains", "frameDomains", "baseUriDomains")

#: The deny-by-default CSP a host MUST apply when a UI resource omits ``csp``: every
#: directive is an empty origin list, so every origin is blocked. (§26.4, R-26.4-h)
DENY_BY_DEFAULT_CSP: dict[str, list[str]] = {
  "connectDomains": [],
  "resourceDomains": [],
  "frameDomains": [],
  "baseUriDomains": [],
}


class UiContentSecurityPolicy(McpModel):
  """A ``UiContentSecurityPolicy`` (§26.4): OPTIONAL directive members, each an array of
  origin strings; extra members pass through. (R-26.4-f, R-26.4-g)
  """

  connect_domains: list[str] | None = None
  resource_domains: list[str] | None = None
  frame_domains: list[str] | None = None
  base_uri_domains: list[str] | None = None


def is_ui_content_security_policy(value: object) -> bool:
  """Return ``True`` when ``value`` is a well-formed ``UiContentSecurityPolicy`` — an
  object whose present directive members are each arrays of origin strings. (§26.4, R-26.4-f/-g)
  """
  return validates(UiContentSecurityPolicy, value)


def csp_allows_origin(csp: dict | None, directive: str, origin: str) -> bool:
  """Return ``True`` when ``origin`` is ALLOWED for the given CSP ``directive`` of a
  ``csp`` descriptor — it is explicitly listed in that member. An origin not listed
  (including when the member is absent) MUST be blocked. (§26.4, R-26.4-g)

  When ``csp`` is ``None`` (omitted), deny-by-default applies and this always returns
  ``False`` (R-26.4-h).
  """
  if csp is None:
    return False  # deny-by-default (R-26.4-h)
  allowed = csp.get(directive)
  return isinstance(allowed, list) and origin in allowed


def resolve_csp(csp: dict | None) -> dict:
  """Resolve the CSP a host applies for a UI resource: the declared ``csp`` when present,
  otherwise the restrictive :data:`DENY_BY_DEFAULT_CSP` (deny-by-default). (§26.4, R-26.4-h)

  The host MUST apply a restrictive policy CONSTRAINED by the declared descriptor — it
  never grants an origin the descriptor did not list — so a present ``csp`` is returned
  as-is for the host to constrain by (R-26.4-o). An absent ``csp`` yields the all-empty
  deny-by-default policy.
  """
  return csp if csp is not None else DENY_BY_DEFAULT_CSP


#: The four sandbox capability names a UI MAY request, in spec order. (§26.4, R-26.4-i)
UI_PERMISSION_NAMES = ("camera", "microphone", "geolocation", "clipboardWrite")


class UiPermissions(McpModel):
  """A ``UiPermissions`` object (§26.4): OPTIONAL capability members, each an object ``{}``
  whose presence requests that sandbox capability; extra members pass through. (R-26.4-i/-j)
  """

  camera: dict[str, Any] | None = None
  microphone: dict[str, Any] | None = None
  geolocation: dict[str, Any] | None = None
  clipboard_write: dict[str, Any] | None = None


def is_ui_permissions(value: object) -> bool:
  """Return ``True`` when ``value`` is a well-formed ``UiPermissions`` — an object whose
  present capability members are each objects ``{}``. (§26.4, R-26.4-i, R-26.4-j)
  """
  return validates(UiPermissions, value)


def permission_requested(permissions: dict | None, name: str) -> bool:
  """Return ``True`` when a UI resource's ``permissions`` REQUESTS the named sandbox
  capability — i.e. the member is present. Absence means the capability is not requested,
  and the host MUST NOT grant it. (§26.4, R-26.4-i, R-26.4-j)
  """
  if permissions is None:
    return False
  return permissions.get(name) is not None


def requested_permissions(permissions: dict | None) -> list[str]:
  """Return the set of sandbox capabilities a UI resource requests, as the subset of
  :data:`UI_PERMISSION_NAMES` present in ``permissions``. The host MUST NOT grant any
  capability outside this set (R-26.4-j) and MAY decline any within it (R-26.4-k).
  (§26.4, R-26.4-i)
  """
  if permissions is None:
    return []
  return [name for name in UI_PERMISSION_NAMES if permissions.get(name) is not None]


def may_grant_permission(permissions: dict | None, name: str, host_declines: bool = False) -> bool:
  """Return ``True`` when a host MAY grant the named sandbox capability for a UI resource:
  ONLY when it was requested (the host MUST NOT grant an unrequested capability) AND the
  host did not decline it (the host MAY decline a requested one). (§26.4, R-26.4-j, R-26.4-k)
  """
  if not permission_requested(permissions, name):
    return False  # never grant the unrequested (R-26.4-j)
  return not host_declines  # MAY decline the requested (R-26.4-k)


class ResourceUiMeta(McpModel):
  """The optional presentation/security hints on a UI resource ``contents`` entry's
  ``_meta.ui`` (§26.4): all OPTIONAL — ``csp``, ``permissions``, ``domain`` (string),
  ``prefersBorder`` (boolean). Extra members pass through. (R-26.4-e/-f/-i/-l/-m)
  """

  csp: UiContentSecurityPolicy | None = None
  permissions: UiPermissions | None = None
  domain: str | None = None
  prefers_border: StrictBool | None = None


def is_resource_ui_meta(value: object) -> bool:
  """Return ``True`` when ``value`` is a well-formed ``ResourceUiMeta`` — the optional
  presentation and security hints carried on a UI resource's ``contents`` entry under its
  own ``_meta.ui``. (§26.4, R-26.4-e)
  """
  return validates(ResourceUiMeta, value)


# ─── §26.4 — The UI resource content ──────────────────────────────────────────


def is_ui_resource_contents(value: object) -> bool:
  """Return ``True`` when ``value`` is a well-formed UI resource ``contents`` entry: an
  ordinary ``ResourceContents`` (§14.5 — ``text`` or ``blob``, mutually exclusive) whose
  ``mimeType`` is the verbatim :data:`UI_MIME_TYPE`, OPTIONALLY carrying ``ResourceUiMeta``
  hints under ``_meta.ui``. (§26.4, R-26.4-d, R-26.4-e)

  The base shape and the text/blob exclusivity come from :func:`is_valid_resource_contents`;
  this narrows the ``mimeType`` to the exact UI type (so any other MIME type is rejected)
  and validates the nested ``_meta.ui`` hint object when present.
  """
  if not is_valid_resource_contents(value):
    return False
  if not is_ui_mime_type(value.get("mimeType")):
    return False
  meta = value.get("_meta")
  if isinstance(meta, dict):
    ui = meta.get(TOOL_UI_META_KEY)
    if ui is not None and not is_resource_ui_meta(ui):
      return False
  return True


def get_resource_ui_meta(contents: object) -> dict | None:
  """Extract the ``ResourceUiMeta`` hints from a UI resource ``contents`` entry — i.e.
  parse ``contents._meta.ui`` — returning ``None`` when there are no hints or they are
  malformed. When present, these hints take effect for rendering. (§26.4, R-26.4-e)
  """
  if not isinstance(contents, dict):
    return None
  meta = contents.get("_meta")
  if not isinstance(meta, dict):
    return None
  ui = meta.get(TOOL_UI_META_KEY)
  return ui if is_resource_ui_meta(ui) else None


def build_ui_resource_contents(
  uri: str,
  *,
  text: str | None = None,
  blob: str | None = None,
  ui: dict | None = None,
) -> dict:
  """Build a UI resource ``contents`` entry: the ``ui://`` ``uri``, the verbatim
  :data:`UI_MIME_TYPE`, the ``text`` OR ``blob`` payload, and — when supplied — the
  ``ResourceUiMeta`` hints nested under ``_meta.ui``. (§26.4, R-26.4-d, R-26.4-e)

  ``mimeType`` is always set to the exact UI type so the result satisfies R-26.4-d.
  Exactly one of ``text`` / ``blob`` MUST be supplied (the §14.5 text/blob exclusivity).

  :raises ValueError: when ``uri`` is not a ``ui://`` URI (R-26.4-b), or when neither or
    both of ``text`` and ``blob`` are supplied (R-14.5-h).
  """
  if not is_ui_resource_uri(uri):
    raise ValueError(f"UI resource uri MUST use the {UI_URI_SCHEME} scheme (R-26.4-b)")
  has_text = text is not None
  has_blob = blob is not None
  if has_text == has_blob:
    raise ValueError("A UI resource content MUST carry exactly one of `text` or `blob` (R-14.5-h)")
  contents: dict = {"uri": uri, "mimeType": UI_MIME_TYPE}
  if has_text:
    contents["text"] = text
  else:
    contents["blob"] = blob
  if ui is not None:
    contents["_meta"] = {TOOL_UI_META_KEY: ui}
  return contents


def build_ui_resource_read_result(contents: dict, *, ttl_ms: int, cache_scope: str) -> dict:
  """Build the result object a server returns from ``resources/read`` for a UI resource:
  a complete, cacheable result carrying the single UI ``contents`` entry. (§26.4)

  The result mirrors the §27 ``ReadResourceResult`` shape used in the §26.4 wire
  example: ``resultType: "complete"``, a ``contents`` array, and the REQUIRED
  ``ttlMs`` / ``cacheScope`` cache fields.

  :raises ValueError: when ``ttl_ms`` is not a non-negative integer (R-13), or when
    ``cache_scope`` is not ``"public"`` / ``"private"``.
  """
  if isinstance(ttl_ms, bool) or not isinstance(ttl_ms, int) or ttl_ms < 0:
    raise ValueError("UI resource read result ttlMs MUST be a non-negative integer (R-13)")
  if cache_scope not in ("public", "private"):
    raise ValueError('UI resource read result cacheScope MUST be "public" or "private"')
  return {
    "resultType": RESULT_TYPE_COMPLETE,
    "contents": [contents],
    "ttlMs": ttl_ms,
    "cacheScope": cache_scope,
  }


# ─── §26.4 — ui:// URI opacity (host obligations, declarative) ────────────────


def ui_resource_read_uri(meta: dict | None) -> str | None:
  """Return the ``ui://`` URI to use in a ``resources/read`` request for a tool's UI
  resource: the EXACT ``resourceUri`` from the tool's ``_meta.ui``, treated as an opaque
  identifier. The host issues ``resources/read`` for this exact string and MUST NOT
  derive a network origin from it. (§26.4, R-26.3-c, R-26.4-b, R-26.4-c)

  Returns ``None`` when ``meta`` is ``None`` or carries no ``resourceUri``.
  """
  if meta is None:
    return None
  return meta.get("resourceUri")
