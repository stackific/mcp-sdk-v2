"""Tests for the Interactive UI ("apps") extension — both halves of the cluster:

* S41 — Interactive UI Extension I: negotiation, ``_meta.ui`` declaration & UI resource
  (§26.1–§26.4), in :mod:`mcp.protocol.ui`;
* S42 — Interactive UI Extension II: the UI-to-host dialect, registry & security
  (§26.5–§26.9), in :mod:`mcp.protocol.ui_host`.

Mirrors the TypeScript test files ``__tests__/protocol/ui.test.ts`` (AC-41.1..AC-41.44)
and ``__tests__/protocol/ui-host.test.ts`` (AC-42.1..AC-42.25), PLUS additional edge
cases. Host-only obligations (rendering, sandboxing, the channel, consent) are exercised
through the declarative model the SDK exposes — a conforming server SDK has no
browser/UI dependency, so those rules are validated as role assignments and predicates a
host implementation consults, not by rendering anything (AC-41.10, AC-42.25).
"""

import pytest

from mcp.protocol.errors import INTERNAL_ERROR_CODE, INVALID_PARAMS_CODE, METHOD_NOT_FOUND_CODE
from mcp.protocol.meta import CLIENT_CAPABILITIES_META_KEY
from mcp.protocol.ui import (
  DEFAULT_UI_VISIBILITY,
  DENY_BY_DEFAULT_CSP,
  TOOL_UI_META_KEY,
  UI_CSP_DIRECTIVES,
  UI_EXTENSION_ID,
  UI_MIME_TYPE,
  UI_PERMISSION_NAMES,
  UI_RESPONSIBILITY_OWNER,
  UI_URI_SCHEME,
  UI_VISIBILITY_VALUES,
  build_server_ui_acknowledgement,
  build_ui_host_extension_capability,
  build_ui_resource_contents,
  build_ui_resource_read_result,
  capability_renders_ui,
  csp_allows_origin,
  effective_visibility,
  extension_ids_match,
  get_resource_ui_meta,
  get_tool_ui_meta,
  get_ui_host_capability,
  host_advertises_ui_rendering,
  host_should_reject_ui_originated_call,
  is_app_invokable,
  is_resource_ui_meta,
  is_server_responsibility,
  is_server_ui_acknowledgement,
  is_tool_ui_meta,
  is_ui_content_security_policy,
  is_ui_extension_active,
  is_ui_host_extension_capability,
  is_ui_mime_type,
  is_ui_permissions,
  is_ui_resource_contents,
  is_ui_resource_uri,
  is_ui_visibility,
  is_visible_to_model,
  may_emit_ui_surface,
  may_grant_permission,
  may_server_declare_ui,
  may_server_expect_rendering,
  permission_requested,
  read_tool_ui_meta,
  request_advertises_ui_rendering,
  requested_permissions,
  resolve_csp,
  server_acknowledges_ui,
  tools_visible_to_model,
  ui_resource_read_uri,
  ui_responsibility_owner,
)
from mcp.protocol.ui_host import (
  ALLOWED_UI_EXPOSURE_KEYS,
  DECLINABLE_UI_REQUESTS,
  DECLINE_REASONS,
  DIALECT_CHANNEL_PATH,
  FORBIDDEN_UI_EXPOSURE_KEYS,
  HOST_ONLY_CONCERNS,
  LOGGING_MESSAGE_METHOD,
  SANDBOX_DENIED_ACCESS,
  SERVER_SDK_OBLIGATIONS,
  UI_CHANNEL_PHASES,
  UI_DIALECT_METHODS,
  UI_DIALECT_PROTOCOL_VERSION,
  UI_DIALECT_REGISTRY,
  UI_DISPLAY_MODES,
  UI_PLATFORMS,
  UI_THEMES,
  HandshakeOrderViolation,
  ToolsCallMediationDecision,
  ToolsCallMediationInput,
  UiDialectRegistryEntry,
  build_decline_error_response,
  build_dialect_error_response,
  build_display_mode_result,
  build_ping_response,
  build_sandbox_report,
  build_teardown_response,
  check_handshake_order,
  decline_error_code,
  dialect_is_only_channel,
  granted_permissions,
  is_server_sdk_obligation,
  is_ui_dialect_method_name,
  is_ui_dialect_protocol_version,
  is_ui_display_mode,
  is_ui_initialize_result,
  is_valid_host_context_changed_params,
  is_valid_open_link_params,
  is_valid_ping_params,
  is_valid_request_display_mode_params,
  is_valid_request_display_mode_result,
  is_valid_resource_teardown_params,
  is_valid_sandbox_resource_ready_params,
  is_valid_size_changed_params,
  is_valid_tool_cancelled_params,
  is_valid_tool_input_params,
  is_valid_tool_result_params,
  is_valid_tools_call_params,
  is_valid_ui_app_capabilities,
  is_valid_ui_client_info,
  is_valid_ui_host_capabilities,
  is_valid_ui_host_context,
  is_valid_ui_host_info,
  is_valid_ui_initialize_params,
  is_valid_ui_message_params,
  is_valid_ui_sandbox_report,
  is_valid_update_model_context_params,
  mediate_open_link,
  mediate_ui_message,
  mediate_ui_tools_call,
  method_not_found_response,
  sandbox_isolation_is_conforming,
  ui_dialect_registry_entry,
  ui_exposure_is_clean,
  ui_may_emit_before_init_response,
  validate_dialect_message,
)

UI_URI = "ui://app/widget"


def _host_caps_extensions(*mime_types):
  """An ``extensions`` map advertising the apps extension with the given MIME types."""
  return {UI_EXTENSION_ID: {"mimeTypes": list(mime_types)}}


RENDERING_MAP = _host_caps_extensions(UI_MIME_TYPE)
TEXT_BLOCK = {"type": "text", "text": "hi"}


def _req(method, id_=1, params=None):
  msg = {"jsonrpc": "2.0", "id": id_, "method": method}
  if params is not None:
    msg["params"] = params
  return msg


# ══════════════════════════════════════════════════════════════════════════════
# S41 — Interactive UI Extension I (§26.1–§26.4)
# ══════════════════════════════════════════════════════════════════════════════


# ─── §26.2 — Identifier & MIME type ───────────────────────────────────────────


class TestConstants:
  def test_canonical_values(self):
    # AC-41.1 / AC-41.12 / AC-41.15: exact, opaque, case-sensitive strings.
    assert UI_EXTENSION_ID == "io.modelcontextprotocol/ui"
    assert UI_MIME_TYPE == "text/html;profile=mcp-app"
    assert UI_URI_SCHEME == "ui://"
    assert TOOL_UI_META_KEY == "ui"
    assert UI_VISIBILITY_VALUES == ("model", "app")
    assert DEFAULT_UI_VISIBILITY == ("model", "app")


class TestExtensionIdsMatch:
  def test_case_sensitive(self):
    # AC-41.12: identifier matched as an opaque, case-sensitive string.
    assert extension_ids_match(UI_EXTENSION_ID, "io.modelcontextprotocol/ui")
    assert not extension_ids_match(UI_EXTENSION_ID, "IO.ModelContextProtocol/UI")


class TestIsUiMimeType:
  def test_exact_match(self):
    assert is_ui_mime_type(UI_MIME_TYPE)

  def test_rejects_near_misses(self):
    # AC-41.15: extra whitespace and wrong case must NOT match (R-26.2-e, R-26.4-d).
    assert not is_ui_mime_type("text/html; profile=mcp-app")  # extra space
    assert not is_ui_mime_type("TEXT/HTML;PROFILE=MCP-APP")  # wrong case
    assert not is_ui_mime_type(" text/html;profile=mcp-app")  # leading space
    assert not is_ui_mime_type("text/html;profile=mcp-app ")  # trailing space
    assert not is_ui_mime_type("text/html")
    assert not is_ui_mime_type(None)
    assert not is_ui_mime_type(123)


class TestIsUiResourceUri:
  def test_scheme_match(self):
    # AC-41.22 / AC-41.30: scheme-only check; authority/path are opaque.
    assert is_ui_resource_uri("ui://anything/here")
    assert is_ui_resource_uri("ui://")  # bare scheme prefix qualifies
    assert is_ui_resource_uri("ui://anything/at/all?q=1")  # query opaque
    assert is_ui_resource_uri("ui://A/b?c=d#e")  # fragment opaque

  def test_rejects_non_ui(self):
    # AC-41.22 / AC-41.31: a non-ui:// value is rejected; no origin derived.
    assert not is_ui_resource_uri("https://example.com")
    assert not is_ui_resource_uri("UI://app")  # case-sensitive scheme
    assert not is_ui_resource_uri("file:///ui://x")
    assert not is_ui_resource_uri(None)
    assert not is_ui_resource_uri(123)


# ─── §26.1 — Role responsibility split ────────────────────────────────────────


class TestResponsibilities:
  def test_owner_mapping(self):
    # AC-41.3 / AC-41.4 / AC-41.6 / AC-41.7 / AC-41.8 / AC-41.9.
    assert ui_responsibility_owner("declare-ui-meta") == "server"
    assert ui_responsibility_owner("serve-ui-resource") == "server"
    for host_resp in ("render", "sandbox", "enforce-csp", "run-channel", "mediate-consent"):
      assert ui_responsibility_owner(host_resp) == "host"

  def test_is_server_responsibility(self):
    # AC-41.5: rendering/sandbox/run-channel are NOT server responsibilities.
    assert is_server_responsibility("declare-ui-meta")
    assert is_server_responsibility("serve-ui-resource")
    assert not is_server_responsibility("render")
    assert not is_server_responsibility("sandbox")
    assert not is_server_responsibility("run-channel")
    assert not is_server_responsibility("unknown")  # unknown → not a server responsibility

  def test_only_two_server_responsibilities(self):
    # AC-41.10: the server-owned surface is exactly the two declarative responsibilities.
    servers = sorted(r for r, owner in UI_RESPONSIBILITY_OWNER.items() if owner == "server")
    assert servers == ["declare-ui-meta", "serve-ui-resource"]

  def test_unknown_responsibility_raises_keyerror(self):
    with pytest.raises(KeyError):
      ui_responsibility_owner("not-a-responsibility")


# ─── §26.2 — Host extension capability ────────────────────────────────────────


class TestHostExtensionCapability:
  def test_well_formed(self):
    # AC-41.14: a mimeTypes array makes it well-formed (even when empty).
    assert is_ui_host_extension_capability({"mimeTypes": []})
    assert is_ui_host_extension_capability({"mimeTypes": [UI_MIME_TYPE]})
    assert is_ui_host_extension_capability({"mimeTypes": ["x"], "extra": 1})  # passthrough

  def test_malformed(self):
    # AC-41.14: omission of mimeTypes / non-array is non-conformant.
    assert not is_ui_host_extension_capability({})  # mimeTypes required
    assert not is_ui_host_extension_capability({"mimeTypes": "x"})  # not a list
    assert not is_ui_host_extension_capability({"mimeTypes": [1, 2]})  # non-strings
    assert not is_ui_host_extension_capability(None)

  def test_capability_renders_ui(self):
    assert capability_renders_ui({"mimeTypes": [UI_MIME_TYPE]})
    assert capability_renders_ui({"mimeTypes": ["other", UI_MIME_TYPE]})

  def test_capability_renders_ui_rejects_near_misses(self):
    # AC-41.15: byte-exact match required.
    assert not capability_renders_ui({"mimeTypes": []})
    assert not capability_renders_ui({"mimeTypes": ["text/html; profile=mcp-app"]})
    assert not capability_renders_ui({"mimeTypes": ["TEXT/HTML;PROFILE=MCP-APP"]})
    assert not capability_renders_ui("nope")  # not even a capability

  def test_build(self):
    # AC-41.20 helper: always includes the UI MIME type and dedupes.
    assert build_ui_host_extension_capability() == {"mimeTypes": [UI_MIME_TYPE]}
    built = build_ui_host_extension_capability(["a", UI_MIME_TYPE, "b"])
    assert built == {"mimeTypes": [UI_MIME_TYPE, "a", "b"]}  # UI type first + deduped
    assert capability_renders_ui(built)
    assert capability_renders_ui(build_ui_host_extension_capability(["image/svg+xml"]))


# ─── §26.2 — Reading advertisement from negotiation surfaces ──────────────────


class TestReadAdvertisement:
  def test_get_ui_host_capability(self):
    assert get_ui_host_capability(RENDERING_MAP) == {"mimeTypes": [UI_MIME_TYPE]}
    assert get_ui_host_capability({}) is None
    assert get_ui_host_capability({UI_EXTENSION_ID: None}) is None  # null malformed
    assert get_ui_host_capability({UI_EXTENSION_ID: {"mimeTypes": 1}}) is None  # bad mimeTypes
    assert get_ui_host_capability({UI_EXTENSION_ID: {"bad": 1}}) is None  # no mimeTypes
    assert get_ui_host_capability(None) is None

  def test_host_advertises_ui_rendering(self):
    assert host_advertises_ui_rendering(RENDERING_MAP)
    assert not host_advertises_ui_rendering(_host_caps_extensions("other"))
    assert not host_advertises_ui_rendering({})
    assert not host_advertises_ui_rendering(None)
    # AC-41.12: a case-folded key does not advertise.
    assert not host_advertises_ui_rendering({"IO.ModelContextProtocol/UI": {"mimeTypes": [UI_MIME_TYPE]}})

  def test_request_advertises_ui_rendering(self):
    # AC-41.13: the host advertises the key in clientCapabilities.extensions of each request.
    meta = {CLIENT_CAPABILITIES_META_KEY: {"extensions": RENDERING_MAP}}
    assert request_advertises_ui_rendering(meta)

  def test_request_advertises_missing_pieces(self):
    # AC-41.13 / R-26.2-i: a request judged on its own _meta; omission → inactive.
    assert not request_advertises_ui_rendering({})  # no clientCapabilities
    assert not request_advertises_ui_rendering({CLIENT_CAPABILITIES_META_KEY: {}})  # no extensions
    assert not request_advertises_ui_rendering({CLIENT_CAPABILITIES_META_KEY: {"extensions": {}}})
    assert not request_advertises_ui_rendering(None)
    bad = {CLIENT_CAPABILITIES_META_KEY: {"extensions": _host_caps_extensions("other")}}
    assert not request_advertises_ui_rendering(bad)


# ─── §26.2 — Server gating ────────────────────────────────────────────────────


class TestServerGating:
  def test_may_declare_and_expect(self):
    # AC-41.2: declaring is permitted (MAY) when the host advertises rendering.
    assert may_server_declare_ui(RENDERING_MAP)
    assert may_server_expect_rendering(RENDERING_MAP)

  def test_gated_off_without_mime(self):
    # AC-41.16 / AC-41.17: without the required MIME type the server MUST NOT declare /
    # expect rendering.
    ext = _host_caps_extensions("other")
    assert not may_server_declare_ui(ext)
    assert not may_server_expect_rendering(ext)
    assert not may_server_declare_ui({})
    assert not may_server_expect_rendering({UI_EXTENSION_ID: {"mimeTypes": []}})

  def test_is_ui_extension_active(self):
    # AC-41.11 / AC-41.1: intersection; activation does not require the MIME value.
    client = {UI_EXTENSION_ID: {}}
    server = {UI_EXTENSION_ID: {}}
    assert is_ui_extension_active(client, server)
    assert is_ui_extension_active(RENDERING_MAP, {UI_EXTENSION_ID: {}})
    assert not is_ui_extension_active(client, {})  # one-sided
    assert not is_ui_extension_active({}, server)
    assert not is_ui_extension_active({}, {})  # absent both sides
    assert not is_ui_extension_active({UI_EXTENSION_ID: None}, server)  # malformed

  def test_is_ui_extension_active_case_sensitive(self):
    # AC-41.12: a case-folded key does not activate.
    wrong = {"IO.ModelContextProtocol/UI": {"mimeTypes": [UI_MIME_TYPE]}}
    assert not is_ui_extension_active(wrong, RENDERING_MAP)

  def test_may_emit_ui_surface(self):
    assert may_emit_ui_surface([UI_EXTENSION_ID])
    assert may_emit_ui_surface({UI_EXTENSION_ID, "other"})
    assert not may_emit_ui_surface([])
    assert not may_emit_ui_surface(["other"])


# ─── §26.2 — Server acknowledgement ───────────────────────────────────────────


class TestAcknowledgement:
  def test_build(self):
    # AC-41.20: acknowledge under capabilities.extensions with an empty object.
    assert build_server_ui_acknowledgement() == {UI_EXTENSION_ID: {}}

  def test_is_server_ui_acknowledgement(self):
    assert is_server_ui_acknowledgement({})
    assert is_server_ui_acknowledgement({"v": 2})
    assert not is_server_ui_acknowledgement(None)
    assert not is_server_ui_acknowledgement("x")

  def test_server_acknowledges_ui(self):
    assert server_acknowledges_ui(build_server_ui_acknowledgement())
    assert server_acknowledges_ui({UI_EXTENSION_ID: {"meta": 1}})
    assert not server_acknowledges_ui({})
    assert not server_acknowledges_ui({UI_EXTENSION_ID: None})  # malformed
    assert not server_acknowledges_ui(None)


# ─── §26.3 — ToolUiMeta declaration ───────────────────────────────────────────


class TestToolUiMeta:
  def test_visibility_enum(self):
    # AC-41.24: present elements must be the enum strings, case-sensitive.
    assert is_ui_visibility("model")
    assert is_ui_visibility("app")
    assert not is_ui_visibility("both")
    assert not is_ui_visibility("agent")
    assert not is_ui_visibility("Model")  # case-sensitive

  def test_valid_minimal(self):
    # AC-41.21: resourceUri alone is sufficient.
    assert is_tool_ui_meta({"resourceUri": UI_URI})

  def test_valid_with_visibility(self):
    assert is_tool_ui_meta({"resourceUri": UI_URI, "visibility": ["model"]})
    assert is_tool_ui_meta({"resourceUri": UI_URI, "visibility": ["app"]})
    assert is_tool_ui_meta({"resourceUri": UI_URI, "visibility": ["model", "app"]})
    assert is_tool_ui_meta({"resourceUri": UI_URI, "visibility": []})
    assert is_tool_ui_meta({"resourceUri": UI_URI, "extra": "ok"})  # passthrough

  def test_rejects_bad(self):
    # AC-41.21 / AC-41.22 / AC-41.24.
    assert not is_tool_ui_meta({})  # no resourceUri
    assert not is_tool_ui_meta({"visibility": ["model"]})  # no resourceUri
    assert not is_tool_ui_meta({"resourceUri": "https://x"})  # non-ui scheme
    assert not is_tool_ui_meta({"resourceUri": UI_URI, "visibility": "model"})  # not a list
    assert not is_tool_ui_meta({"resourceUri": UI_URI, "visibility": ["model", "nope"]})  # bad enum
    assert not is_tool_ui_meta(None)

  def test_get_tool_ui_meta(self):
    tool = {"_meta": {TOOL_UI_META_KEY: {"resourceUri": UI_URI}}}
    assert get_tool_ui_meta(tool) == {"resourceUri": UI_URI}
    assert get_tool_ui_meta({"_meta": {}}) is None
    assert get_tool_ui_meta({}) is None
    assert get_tool_ui_meta({"name": "t", "_meta": {}}) is None
    assert get_tool_ui_meta({"_meta": {TOOL_UI_META_KEY: {"resourceUri": "https://x"}}}) is None
    assert get_tool_ui_meta(None) is None

  def test_get_tool_ui_meta_does_not_mutate(self):
    # AC-41.28: extracting the declaration never mutates the tool.
    import json

    with_ui = {"name": "t", "_meta": {TOOL_UI_META_KEY: {"resourceUri": "ui://t"}}}
    before = json.dumps(with_ui, sort_keys=True)
    get_tool_ui_meta(with_ui)
    assert json.dumps(with_ui, sort_keys=True) == before

  def test_read_tool_ui_meta_gates_on_active(self):
    # AC-41.27: a receiver that has not negotiated the extension ignores _meta.ui.
    tool = {"_meta": {TOOL_UI_META_KEY: {"resourceUri": UI_URI}}}
    assert read_tool_ui_meta(tool, [UI_EXTENSION_ID]) == {"resourceUri": UI_URI}
    assert read_tool_ui_meta(tool, []) is None
    assert read_tool_ui_meta(tool, ["other"]) is None

  def test_read_tool_ui_meta_app_only_ignored_when_inactive(self):
    # AC-41.19: even an ["app"]-only tool yields no declaration when inactive.
    tool = {"name": "t", "_meta": {TOOL_UI_META_KEY: {"resourceUri": UI_URI, "visibility": ["app"]}}}
    assert read_tool_ui_meta(tool, []) is None


class TestVisibility:
  def test_effective_default(self):
    # AC-41.24: omitted visibility ⇒ ["model","app"].
    assert effective_visibility({"resourceUri": UI_URI}) == ("model", "app")
    assert effective_visibility({"visibility": None}) == ("model", "app")
    assert effective_visibility({"visibility": ["app"]}) == ("app",)
    assert effective_visibility({"visibility": []}) == ()

  def test_is_app_invokable(self):
    assert is_app_invokable({"resourceUri": UI_URI})  # default includes app
    assert is_app_invokable({"visibility": ["app"]})
    assert not is_app_invokable({"visibility": ["model"]})
    assert not is_app_invokable({"visibility": []})

  def test_is_visible_to_model(self):
    # AC-41.26: an ["app"]-only tool is hidden from the model.
    assert is_visible_to_model({"resourceUri": UI_URI})  # default includes model
    assert is_visible_to_model({"visibility": ["model"]})
    assert not is_visible_to_model({"visibility": ["app"]})

  def test_host_should_reject_ui_originated_call(self):
    # AC-41.25: reject when effective visibility excludes "app".
    assert host_should_reject_ui_originated_call(None)  # no declaration → reject
    assert host_should_reject_ui_originated_call({"visibility": ["model"]})  # no app
    assert not host_should_reject_ui_originated_call({"visibility": ["app"]})
    assert not host_should_reject_ui_originated_call({"visibility": ["model", "app"]})
    assert not host_should_reject_ui_originated_call({"resourceUri": UI_URI})  # default has app


class TestToolsVisibleToModel:
  def test_inactive_returns_all(self):
    # AC-41.18: inactive extension → tools exposed as ordinary tools.
    tool = {"name": "get-time", "_meta": {TOOL_UI_META_KEY: {"resourceUri": "ui://x"}}}
    assert tools_visible_to_model([tool], []) == [tool]
    app_only = {"name": "a", "_meta": {TOOL_UI_META_KEY: {"resourceUri": "ui://x", "visibility": ["app"]}}}
    assert tools_visible_to_model([app_only], []) == [app_only]

  def test_active_hides_app_only(self):
    # AC-41.26: an ["app"]-only tool is omitted from the model list when active.
    model_tool = {"name": "m"}
    app_only = {"name": "a", "_meta": {TOOL_UI_META_KEY: {"resourceUri": UI_URI, "visibility": ["app"]}}}
    both = {"name": "b", "_meta": {TOOL_UI_META_KEY: {"resourceUri": UI_URI}}}
    result = tools_visible_to_model([model_tool, app_only, both], [UI_EXTENSION_ID])
    assert result == [model_tool, both]  # app-only hidden

  def test_active_keeps_undeclared(self):
    # AC-41.28: the key adds no model-facing behavior change for undeclared tools.
    plain = {"name": "p"}
    assert tools_visible_to_model([plain], [UI_EXTENSION_ID]) == [plain]


# ─── §26.4 — CSP hints ────────────────────────────────────────────────────────


class TestCsp:
  def test_directives_constant(self):
    # AC-41.34: connect/resource/frame/baseUri origins.
    assert UI_CSP_DIRECTIVES == ("connectDomains", "resourceDomains", "frameDomains", "baseUriDomains")

  def test_valid(self):
    assert is_ui_content_security_policy({})
    assert is_ui_content_security_policy(
      {"connectDomains": ["https://c"], "resourceDomains": ["https://r"],
       "frameDomains": ["https://f"], "baseUriDomains": ["https://b"]}
    )
    assert is_ui_content_security_policy({"frameDomains": [], "extra": 1})

  def test_invalid(self):
    assert not is_ui_content_security_policy({"connectDomains": "x"})  # not a list
    assert not is_ui_content_security_policy({"frameDomains": [1]})  # non-strings
    assert not is_ui_content_security_policy(None)

  def test_csp_allows_origin(self):
    # AC-41.34 / AC-41.35: only listed origins allowed, per applicable directive.
    csp = {
      "connectDomains": ["https://c"],
      "resourceDomains": ["https://r"],
      "frameDomains": ["https://f"],
      "baseUriDomains": ["https://b"],
    }
    assert csp_allows_origin(csp, "connectDomains", "https://c")
    assert csp_allows_origin(csp, "resourceDomains", "https://r")
    assert csp_allows_origin(csp, "frameDomains", "https://f")
    assert csp_allows_origin(csp, "baseUriDomains", "https://b")
    # AC-41.35: listed in connect but not resource → blocked for resource loads.
    single = {"connectDomains": ["https://allowed"]}
    assert not csp_allows_origin(single, "connectDomains", "https://evil")
    assert not csp_allows_origin(single, "resourceDomains", "https://allowed")
    assert not csp_allows_origin(single, "frameDomains", "https://allowed")  # member absent
    assert not csp_allows_origin(None, "connectDomains", "https://allowed")  # deny-by-default

  def test_resolve_csp(self):
    # AC-41.36 / AC-41.43: present csp returned as-is; absent → deny-by-default.
    csp = {"connectDomains": ["https://x"]}
    assert resolve_csp(csp) is csp  # returned as-is
    assert resolve_csp(None) == DENY_BY_DEFAULT_CSP
    assert DENY_BY_DEFAULT_CSP["connectDomains"] == []
    # AC-41.36: deny-by-default blocks every origin in every directive.
    for directive in UI_CSP_DIRECTIVES:
      assert not csp_allows_origin(resolve_csp(None), directive, "https://anything")


# ─── §26.4 — Permissions hints ────────────────────────────────────────────────


class TestPermissions:
  def test_names_constant(self):
    # AC-41.37: the four permission names.
    assert UI_PERMISSION_NAMES == ("camera", "microphone", "geolocation", "clipboardWrite")

  def test_valid(self):
    # AC-41.37: each member is an empty-object value.
    assert is_ui_permissions({})
    assert is_ui_permissions({"camera": {}})
    assert is_ui_permissions({"microphone": {}, "geolocation": {}})
    assert is_ui_permissions({"clipboardWrite": {}, "extra": 1})  # passthrough

  def test_invalid(self):
    assert not is_ui_permissions({"camera": True})  # must be an object
    assert not is_ui_permissions({"camera": "yes"})
    assert not is_ui_permissions(None)

  def test_permission_requested(self):
    # AC-41.38: a capability not present is not requested.
    perms = {"camera": {}, "microphone": {}}
    assert permission_requested(perms, "camera")
    assert permission_requested(perms, "microphone")
    assert not permission_requested(perms, "geolocation")
    assert not permission_requested(None, "camera")

  def test_requested_permissions_in_spec_order(self):
    # AC-41.37: returned in spec order regardless of declaration order.
    perms = {"clipboardWrite": {}, "camera": {}}
    assert requested_permissions(perms) == ["camera", "clipboardWrite"]
    assert requested_permissions(None) == []
    assert requested_permissions({}) == []

  def test_may_grant_permission(self):
    # AC-41.38 / AC-41.39: never grant unrequested; MAY decline a requested one.
    perms = {"camera": {}}
    assert may_grant_permission(perms, "camera")  # requested, not declined
    assert not may_grant_permission(perms, "camera", host_declines=True)  # MAY decline
    assert not may_grant_permission(perms, "microphone")  # never grant unrequested
    assert not may_grant_permission(None, "camera")


# ─── §26.4 — ResourceUiMeta ───────────────────────────────────────────────────


class TestResourceUiMeta:
  def test_valid(self):
    # AC-41.40 / AC-41.41: domain (string) and prefersBorder (bool) optional.
    assert is_resource_ui_meta({})
    assert is_resource_ui_meta({"csp": {"connectDomains": []}, "permissions": {"camera": {}}})
    assert is_resource_ui_meta({"domain": "https://ui-1.example", "prefersBorder": True})
    assert is_resource_ui_meta({"csp": {}, "permissions": {}, "domain": "x", "prefersBorder": False})
    assert is_resource_ui_meta({"unknownHint": 1})  # passthrough

  def test_invalid(self):
    assert not is_resource_ui_meta({"csp": {"connectDomains": "x"}})
    assert not is_resource_ui_meta({"permissions": {"camera": True}})
    assert not is_resource_ui_meta({"domain": 5})
    assert not is_resource_ui_meta({"prefersBorder": "yes"})
    assert not is_resource_ui_meta(None)

  def test_get_resource_ui_meta(self):
    # AC-41.33: a contents entry MAY carry a _meta.ui hints object.
    contents = {
      "uri": "ui://x",
      "mimeType": UI_MIME_TYPE,
      "text": "<html></html>",
      "_meta": {TOOL_UI_META_KEY: {"csp": {"connectDomains": ["https://api.example.com"]}, "prefersBorder": True}},
    }
    hints = get_resource_ui_meta(contents)
    assert hints["prefersBorder"] is True
    assert hints["csp"]["connectDomains"] == ["https://api.example.com"]
    assert get_resource_ui_meta({"uri": "ui://x", "mimeType": UI_MIME_TYPE, "text": "a"}) is None
    assert get_resource_ui_meta({"_meta": {}}) is None
    assert get_resource_ui_meta({}) is None
    assert get_resource_ui_meta({"_meta": {TOOL_UI_META_KEY: {"domain": 5}}}) is None  # malformed
    assert get_resource_ui_meta(None) is None


# ─── §26.4 — UI resource contents ─────────────────────────────────────────────


class TestUiResourceContents:
  def test_valid_text(self):
    assert is_ui_resource_contents({"uri": UI_URI, "mimeType": UI_MIME_TYPE, "text": "<html>"})

  def test_valid_blob(self):
    # S21 exclusivity: blob alone accepted.
    assert is_ui_resource_contents({"uri": UI_URI, "mimeType": UI_MIME_TYPE, "blob": "AAAA"})

  def test_rejects_wrong_mime(self):
    # AC-41.32: mimeType MUST be exactly the verbatim UI MIME type (R-26.4-d).
    assert not is_ui_resource_contents({"uri": UI_URI, "mimeType": "text/html", "text": "<x>"})
    assert not is_ui_resource_contents(
      {"uri": UI_URI, "mimeType": "text/html; profile=mcp-app", "text": "<x>"}
    )

  def test_rejects_missing_mime(self):
    assert not is_ui_resource_contents({"uri": UI_URI, "text": "<x>"})

  def test_rejects_both_text_and_blob(self):
    # S21 exclusivity: not both.
    assert not is_ui_resource_contents({"uri": UI_URI, "mimeType": UI_MIME_TYPE, "text": "a", "blob": "AAAA"})

  def test_rejects_malformed_meta_ui(self):
    # AC-41.33: malformed hints are rejected by the content schema.
    bad = {"uri": UI_URI, "mimeType": UI_MIME_TYPE, "text": "<x>", "_meta": {TOOL_UI_META_KEY: {"domain": 5}}}
    assert not is_ui_resource_contents(bad)
    bad2 = {"uri": UI_URI, "mimeType": UI_MIME_TYPE, "text": "a", "_meta": {TOOL_UI_META_KEY: {"csp": {"connectDomains": "not-array"}}}}
    assert not is_ui_resource_contents(bad2)

  def test_accepts_well_formed_meta_ui(self):
    good = {"uri": UI_URI, "mimeType": UI_MIME_TYPE, "text": "<x>", "_meta": {TOOL_UI_META_KEY: {"prefersBorder": True}}}
    assert is_ui_resource_contents(good)


class TestBuildUiResourceContents:
  def test_text(self):
    c = build_ui_resource_contents(UI_URI, text="<html>")
    assert c == {"uri": UI_URI, "mimeType": UI_MIME_TYPE, "text": "<html>"}
    assert is_ui_resource_contents(c)

  def test_blob(self):
    c = build_ui_resource_contents(UI_URI, blob="AAAA")
    assert c == {"uri": UI_URI, "mimeType": UI_MIME_TYPE, "blob": "AAAA"}

  def test_with_ui_hints(self):
    # Wire shape: hints nested under _meta.ui.
    c = build_ui_resource_contents(UI_URI, text="<!DOCTYPE html>", ui={"permissions": {"clipboardWrite": {}}, "prefersBorder": True})
    assert c["mimeType"] == UI_MIME_TYPE
    assert c["_meta"] == {TOOL_UI_META_KEY: {"permissions": {"clipboardWrite": {}}, "prefersBorder": True}}
    assert is_ui_resource_contents(c)

  def test_rejects_non_ui_uri(self):
    with pytest.raises(ValueError):
      build_ui_resource_contents("https://x", text="<x>")

  def test_rejects_neither_text_nor_blob(self):
    with pytest.raises(ValueError):
      build_ui_resource_contents(UI_URI)

  def test_rejects_both_text_and_blob(self):
    with pytest.raises(ValueError):
      build_ui_resource_contents(UI_URI, text="a", blob="AAAA")


class TestBuildUiResourceReadResult:
  def test_build(self):
    contents = build_ui_resource_contents(UI_URI, text="<x>")
    result = build_ui_resource_read_result(contents, ttl_ms=1000, cache_scope="public")
    assert result == {
      "resultType": "complete",
      "contents": [contents],
      "ttlMs": 1000,
      "cacheScope": "public",
    }

  def test_build_zero_ttl_private(self):
    contents = build_ui_resource_contents(UI_URI, text="<x>")
    result = build_ui_resource_read_result(contents, ttl_ms=0, cache_scope="private")
    assert result["ttlMs"] == 0
    assert result["cacheScope"] == "private"
    assert result["resultType"] == "complete"

  def test_rejects_bad_ttl(self):
    contents = build_ui_resource_contents(UI_URI, text="<x>")
    with pytest.raises(ValueError):
      build_ui_resource_read_result(contents, ttl_ms=-1, cache_scope="public")
    with pytest.raises(ValueError):
      build_ui_resource_read_result(contents, ttl_ms=1.5, cache_scope="public")
    with pytest.raises(ValueError):
      build_ui_resource_read_result(contents, ttl_ms=True, cache_scope="public")  # bool rejected

  def test_rejects_bad_cache_scope(self):
    contents = build_ui_resource_contents(UI_URI, text="<x>")
    with pytest.raises(ValueError):
      build_ui_resource_read_result(contents, ttl_ms=0, cache_scope="shared")


# ─── §26.4 — ui:// read URI opacity ───────────────────────────────────────────


class TestUiResourceReadUri:
  def test_returns_exact_uri(self):
    # AC-41.23 / AC-41.29 / AC-41.30 / AC-41.31: the exact declared string verbatim.
    assert ui_resource_read_uri({"resourceUri": UI_URI}) == UI_URI
    assert ui_resource_read_uri({"resourceUri": "ui://A/b?c=d#e"}) == "ui://A/b?c=d#e"
    assert ui_resource_read_uri({"resourceUri": "ui://preload/me.html"}) == "ui://preload/me.html"
    odd = "ui://not-a-real-host.example/x"
    assert ui_resource_read_uri({"resourceUri": odd}) == odd

  def test_none_cases(self):
    assert ui_resource_read_uri(None) is None
    assert ui_resource_read_uri({}) is None


# ══════════════════════════════════════════════════════════════════════════════
# S42 — Interactive UI Extension II (§26.5–§26.9)
# ══════════════════════════════════════════════════════════════════════════════


# ─── AC-42.2 — Dialect protocol version ───────────────────────────────────────


class TestProtocolVersion:
  def test_constant(self):
    assert UI_DIALECT_PROTOCOL_VERSION == "2026-01-26"

  def test_exact_match(self):
    assert is_ui_dialect_protocol_version("2026-01-26")
    assert not is_ui_dialect_protocol_version("2026-01-27")
    assert not is_ui_dialect_protocol_version("2026-07-28")  # core revision is distinct
    assert not is_ui_dialect_protocol_version(None)

  def test_independent_of_core_revision(self):
    # AC-42.2: observably distinct from the core revision string.
    assert UI_DIALECT_PROTOCOL_VERSION != "2026-07-28"


# ─── AC-42.x — Display modes / themes / platforms ─────────────────────────────


class TestDisplayModes:
  def test_constants(self):
    assert UI_DISPLAY_MODES == ("inline", "fullscreen", "pip")
    assert UI_THEMES == ("light", "dark")
    assert UI_PLATFORMS == ("web", "desktop", "mobile")
    assert UI_CHANNEL_PHASES == ("awaiting-init-response", "initialized")

  def test_predicate(self):
    assert is_ui_display_mode("inline")
    assert is_ui_display_mode("pip")
    assert is_ui_display_mode("fullscreen")
    assert not is_ui_display_mode("floating")
    assert not is_ui_display_mode(None)


# ─── AC-42.1 — §26.6 method/notification registry ─────────────────────────────


class TestRegistry:
  EXPECTED_NAMES = [
    "ui/initialize",
    "ui/notifications/initialized",
    "ui/notifications/tool-input",
    "ui/notifications/tool-input-partial",
    "ui/notifications/tool-result",
    "ui/notifications/tool-cancelled",
    "tools/call",
    "resources/read",
    "ui/open-link",
    "ui/message",
    "ui/request-display-mode",
    "ui/update-model-context",
    "notifications/message",
    "ping",
    "ui/notifications/size-changed",
    "ui/notifications/host-context-changed",
    "ui/resource-teardown",
    "ui/notifications/sandbox-proxy-ready",
    "ui/notifications/sandbox-resource-ready",
  ]

  def test_19_entries_in_spec_order(self):
    # AC-42.1: 19 verbatim names in spec order.
    assert len(UI_DIALECT_REGISTRY) == 19
    assert [e.name for e in UI_DIALECT_REGISTRY] == self.EXPECTED_NAMES
    assert len({e.name for e in UI_DIALECT_REGISTRY}) == 19  # distinct

  def test_log_message_reuses_core(self):
    # The core logging method name is reused verbatim, never re-spelled.
    assert LOGGING_MESSAGE_METHOD == "notifications/message"
    assert UI_DIALECT_METHODS["LOG_MESSAGE"] == "notifications/message"

  def test_verbatim_names(self):
    assert UI_DIALECT_METHODS["INITIALIZE"] == "ui/initialize"
    assert UI_DIALECT_METHODS["TOOLS_CALL"] == "tools/call"
    assert UI_DIALECT_METHODS["PING"] == "ping"
    assert UI_DIALECT_METHODS["RESOURCE_TEARDOWN"] == "ui/resource-teardown"

  def test_all_method_constants_are_dialect_names(self):
    for name in UI_DIALECT_METHODS.values():
      assert is_ui_dialect_method_name(name)

  def test_is_ui_dialect_method_name_case_sensitive(self):
    # AC-42.1: byte-for-byte, case-sensitive.
    assert is_ui_dialect_method_name("ui/initialize")
    assert is_ui_dialect_method_name("tools/call")
    assert not is_ui_dialect_method_name("UI/Initialize")  # wrong case
    assert not is_ui_dialect_method_name("ui/Initialize")
    assert not is_ui_dialect_method_name(" ui/initialize")  # leading space
    assert not is_ui_dialect_method_name("ui/unknown")
    assert not is_ui_dialect_method_name(42)  # not a string
    assert not is_ui_dialect_method_name(None)

  def test_lookup_entry(self):
    entry = ui_dialect_registry_entry("ping")
    assert entry == UiDialectRegistryEntry(name="ping", kind="request", sender="ui-or-host")
    init = ui_dialect_registry_entry("ui/initialize")
    assert init.kind == "request" and init.sender == "ui-to-host"
    assert ui_dialect_registry_entry("not-a-method") is None

  def test_kinds_and_senders(self):
    by_name = {e.name: e for e in UI_DIALECT_REGISTRY}
    assert by_name["ui/notifications/tool-input"].kind == "notification"
    assert by_name["ui/notifications/tool-input"].sender == "host-to-ui"
    assert by_name["ping"].sender == "ui-or-host"
    assert by_name["ui/resource-teardown"].sender == "host-to-ui"
    assert by_name["ui/resource-teardown"].kind == "request"
    assert by_name["ui/notifications/sandbox-proxy-ready"].sender == "sandbox-to-host"
    assert by_name["ui/notifications/sandbox-resource-ready"].sender == "host-to-sandbox"
    assert by_name["notifications/message"].kind == "notification"
    assert by_name["notifications/message"].sender == "ui-to-host"


# ─── AC-42.4 — §26.5.1 handshake params/result ────────────────────────────────


class TestInitializeShapes:
  def test_client_info(self):
    assert is_valid_ui_client_info({"name": "Get Time App", "version": "1.0.0"})
    assert is_valid_ui_client_info({"name": "ui", "version": "1.0", "extra": 1})  # passthrough
    assert not is_valid_ui_client_info({"name": "ui"})  # version required
    assert not is_valid_ui_client_info({"version": "1.0"})  # name required
    assert not is_valid_ui_client_info(None)

  def test_host_info(self):
    assert is_valid_ui_host_info({"name": "ExampleHost", "version": "1.0.0"})
    assert not is_valid_ui_host_info({"name": "h"})  # version required
    assert not is_valid_ui_host_info(None)

  def test_app_capabilities(self):
    assert is_valid_ui_app_capabilities({})
    assert is_valid_ui_app_capabilities({"experimental": {}})
    assert is_valid_ui_app_capabilities({"tools": {"listChanged": True}})
    assert is_valid_ui_app_capabilities({"availableDisplayModes": ["inline", "fullscreen", "pip"]})
    assert not is_valid_ui_app_capabilities({"tools": {"listChanged": "yes"}})
    assert not is_valid_ui_app_capabilities({"availableDisplayModes": ["bad"]})
    assert not is_valid_ui_app_capabilities({"experimental": "x"})

  def test_initialize_params_all_optional(self):
    # AC-42.4: every field optional; empty params valid; spec wire example.
    assert is_valid_ui_initialize_params({})
    assert is_valid_ui_initialize_params(
      {
        "protocolVersion": "2026-01-26",
        "clientInfo": {"name": "Get Time App", "version": "1.0.0"},
        "appCapabilities": {"availableDisplayModes": ["inline", "fullscreen", "pip"], "tools": {"listChanged": True}},
      }
    )
    assert not is_valid_ui_initialize_params({"protocolVersion": 1})
    assert not is_valid_ui_initialize_params({"clientInfo": {"name": "x"}})  # bad clientInfo
    assert not is_valid_ui_initialize_params(None)

  def test_host_context_partial(self):
    assert is_valid_ui_host_context({})  # all optional → partial change valid
    assert is_valid_ui_host_context({"theme": "dark", "platform": "web"})
    assert is_valid_ui_host_context({"displayMode": "inline", "locale": "en-US"})
    # Spec wire example.
    assert is_valid_ui_host_context(
      {"theme": "dark", "displayMode": "inline", "locale": "en-US", "platform": "web",
       "containerDimensions": {"width": 640, "maxHeight": 480}}
    )
    assert not is_valid_ui_host_context({"theme": "neon"})
    assert not is_valid_ui_host_context({"theme": "sepia"})
    assert not is_valid_ui_host_context({"platform": "watch"})
    assert not is_valid_ui_host_context({"displayMode": "floating"})
    assert not is_valid_ui_host_context({"locale": 5})

  def test_host_context_full_members(self):
    # Strengthened validator: every documented member is validated.
    assert is_valid_ui_host_context(
      {
        "toolInfo": {"id": 7, "tool": {"name": "get-time"}},
        "styles": {"variables": {"--bg": "#fff"}, "css": {"fonts": "@font-face {}"}},
        "containerDimensions": {"height": 1, "maxHeight": 2, "width": 3, "maxWidth": 4},
        "timeZone": "UTC",
        "userAgent": "agent/1",
        "deviceCapabilities": {"touch": True, "hover": False},
        "safeAreaInsets": {"top": 0, "right": 0, "bottom": 0, "left": 0},
      }
    )
    assert is_valid_ui_host_context({"toolInfo": {"id": "abc", "tool": {}}})  # id string or number

  def test_host_context_rejects_bad_members(self):
    assert not is_valid_ui_host_context({"toolInfo": {"tool": "not-an-object"}})
    assert not is_valid_ui_host_context({"toolInfo": {"id": True, "tool": {}}})  # bool not str/num
    assert not is_valid_ui_host_context({"toolInfo": {}})  # tool required
    assert not is_valid_ui_host_context({"styles": {"variables": {"x": 5}}})  # non-string value
    assert not is_valid_ui_host_context({"styles": {"css": {"fonts": 5}}})
    assert not is_valid_ui_host_context({"containerDimensions": {"width": True}})  # bool not num
    assert not is_valid_ui_host_context({"deviceCapabilities": {"touch": "yes"}})
    assert not is_valid_ui_host_context({"safeAreaInsets": {"top": 1}})  # all four required
    assert not is_valid_ui_host_context({"safeAreaInsets": {"top": 1, "right": 1, "bottom": 1, "left": "x"}})
    assert not is_valid_ui_host_context({"availableDisplayModes": [1]})

  def test_host_context_changed_params_alias(self):
    # §26.5.4: the change notification reuses the partial host-context shape.
    assert is_valid_host_context_changed_params({"theme": "light"})
    assert is_valid_host_context_changed_params({})
    assert not is_valid_host_context_changed_params({"theme": "neon"})

  def test_sandbox_report(self):
    report = {"csp": {"connectDomains": ["https://api.example.com"]}, "permissions": {"clipboardWrite": {}}}
    assert is_valid_ui_sandbox_report(report)
    assert is_valid_ui_sandbox_report({})
    assert not is_valid_ui_sandbox_report({"permissions": {"camera": True}})
    assert not is_valid_ui_sandbox_report({"csp": {"connectDomains": "x"}})
    assert not is_valid_ui_sandbox_report(None)

  def test_host_capabilities(self):
    assert is_valid_ui_host_capabilities({})
    assert is_valid_ui_host_capabilities({"openLinks": {}})
    assert is_valid_ui_host_capabilities(
      {"openLinks": {}, "serverTools": {"listChanged": True}, "logging": {},
       "sandbox": {"permissions": {"clipboardWrite": {}}, "csp": {"connectDomains": ["https://api.example.com"]}}}
    )
    assert not is_valid_ui_host_capabilities({"openLinks": "yes"})
    assert not is_valid_ui_host_capabilities({"serverTools": {"listChanged": "yes"}})  # bad listChanged
    assert not is_valid_ui_host_capabilities({"sandbox": {"permissions": {"camera": True}}})

  def test_initialize_result_requires_protocol_version(self):
    # AC-42.4: protocolVersion REQUIRED — absence is a conformance failure.
    assert is_ui_initialize_result({"protocolVersion": "2026-01-26"})
    assert is_ui_initialize_result(
      {"protocolVersion": "2026-01-26", "hostInfo": {"name": "ExampleHost", "version": "1.0.0"},
       "hostCapabilities": {"openLinks": {}}}
    )
    assert not is_ui_initialize_result({})
    assert not is_ui_initialize_result({"hostInfo": {"name": "H", "version": "1"}})
    assert not is_ui_initialize_result({"protocolVersion": "x", "hostInfo": {"name": "h"}})  # bad hostInfo
    assert not is_ui_initialize_result({"protocolVersion": "x", "hostContext": {"theme": "neon"}})


# ─── §26.5.2 — Host → UI delivery params ──────────────────────────────────────


class TestDeliveryParams:
  def test_tool_input(self):
    assert is_valid_tool_input_params({"arguments": {}})
    assert is_valid_tool_input_params({"arguments": {"city": "NYC"}})
    assert not is_valid_tool_input_params({})  # arguments required
    assert not is_valid_tool_input_params({"arguments": []})  # must be an object

  def test_tool_result(self):
    assert is_valid_tool_result_params({})
    assert is_valid_tool_result_params({"content": [{"type": "text", "text": "2026-07-28T12:00:00Z"}], "isError": False})
    assert is_valid_tool_result_params({"structuredContent": {"any": "json"}})
    assert is_valid_tool_result_params({"_meta": {"k": 1}})
    assert not is_valid_tool_result_params({"content": [{"type": "text"}]})  # bad block (no text)
    assert not is_valid_tool_result_params({"isError": "yes"})
    assert not is_valid_tool_result_params({"_meta": []})

  def test_tool_result_rejects_forbidden_sampling_content(self):
    # ContentBlock reuse: forbidden sampling types are rejected.
    assert not is_valid_tool_result_params({"content": [{"type": "tool_use", "id": "x"}]})
    assert not is_valid_tool_result_params({"content": [{"type": "tool_result", "content": []}]})

  def test_tool_cancelled(self):
    assert is_valid_tool_cancelled_params({"reason": "user-abort"})
    assert not is_valid_tool_cancelled_params({})
    assert not is_valid_tool_cancelled_params({"reason": 5})


# ─── §26.5.3 — UI → Host request params/results ───────────────────────────────


class TestRequestParams:
  def test_tools_call(self):
    assert is_valid_tools_call_params({"name": "get-time"})
    assert is_valid_tools_call_params({"name": "get-time", "arguments": {}})
    assert not is_valid_tools_call_params({})  # name required
    assert not is_valid_tools_call_params({"arguments": {}})  # name required
    assert not is_valid_tools_call_params({"name": "do", "arguments": []})  # arguments must be an object

  def test_open_link(self):
    assert is_valid_open_link_params({"url": "https://x"})
    assert not is_valid_open_link_params({})
    assert not is_valid_open_link_params({"url": 5})

  def test_ui_message(self):
    assert is_valid_ui_message_params({"role": "user", "content": {"type": "text", "text": "hi"}})
    assert not is_valid_ui_message_params({"role": "assistant", "content": {"type": "text", "text": "x"}})  # role must be user
    assert not is_valid_ui_message_params({"role": "user", "content": {"type": "image"}})  # not a text block
    assert not is_valid_ui_message_params({"role": "user", "content": {"type": "text"}})  # text required
    assert not is_valid_ui_message_params({"role": "user"})  # content required

  def test_request_display_mode(self):
    assert is_valid_request_display_mode_params({"mode": "fullscreen"})
    assert not is_valid_request_display_mode_params({"mode": "floating"})
    assert not is_valid_request_display_mode_params({})
    assert is_valid_request_display_mode_result({"mode": "pip"})
    assert not is_valid_request_display_mode_result({})
    assert not is_valid_request_display_mode_result({"mode": "bad"})

  def test_update_model_context(self):
    assert is_valid_update_model_context_params({})
    assert is_valid_update_model_context_params({"content": [TEXT_BLOCK]})
    assert is_valid_update_model_context_params({"structuredContent": [1, 2, 3]})
    assert not is_valid_update_model_context_params({"content": [{"type": "text"}]})  # bad block

  def test_ping(self):
    assert is_valid_ping_params({})
    assert is_valid_ping_params({"extra": 1})  # passthrough
    assert not is_valid_ping_params(None)
    assert not is_valid_ping_params([])


# ─── §26.5.4 — Host → UI lifecycle params ─────────────────────────────────────


class TestLifecycleParams:
  def test_size_changed(self):
    assert is_valid_size_changed_params({"width": 640, "height": 480})
    assert is_valid_size_changed_params({"width": 1.5, "height": 2.5})
    assert not is_valid_size_changed_params({"width": 640})  # height required
    assert not is_valid_size_changed_params({"width": True, "height": 1})  # bool not a number

  def test_resource_teardown(self):
    assert is_valid_resource_teardown_params({"reason": "conversation-closed"})
    assert not is_valid_resource_teardown_params({})
    assert not is_valid_resource_teardown_params({"reason": 5})


# ─── §26.5.5 — Sandbox-resource-ready params ──────────────────────────────────


class TestSandboxResourceReady:
  def test_valid(self):
    assert is_valid_sandbox_resource_ready_params({"html": "<div>hi</div>"})
    assert is_valid_sandbox_resource_ready_params(
      {"html": "<div>hi</div>", "sandbox": "allow-scripts",
       "csp": {"connectDomains": ["https://api.example.com"]}, "permissions": {"clipboardWrite": {}}}
    )

  def test_invalid(self):
    assert not is_valid_sandbox_resource_ready_params({})  # html required
    assert not is_valid_sandbox_resource_ready_params({"html": 5})
    assert not is_valid_sandbox_resource_ready_params({"html": "<x>", "sandbox": 5})
    assert not is_valid_sandbox_resource_ready_params({"html": "<x>", "csp": {"connectDomains": "x"}})
    assert not is_valid_sandbox_resource_ready_params({"html": "<x>", "permissions": {"camera": True}})


# ─── AC-42.3 — §26.5.1 handshake ordering ─────────────────────────────────────


class TestHandshakeOrder:
  def test_only_initialize_before_response(self):
    assert ui_may_emit_before_init_response("ui/initialize")
    assert not ui_may_emit_before_init_response("ui/notifications/initialized")
    assert not ui_may_emit_before_init_response("tools/call")
    assert not ui_may_emit_before_init_response("ping")

  def test_check_handshake_order_awaiting(self):
    assert check_handshake_order("awaiting-init-response", "ui/initialize") == HandshakeOrderViolation(True)
    premature = check_handshake_order("awaiting-init-response", "tools/call")
    assert premature == HandshakeOrderViolation(False, reason="premature-message", method="tools/call")
    # initialized is only sent AFTER the response.
    premature2 = check_handshake_order("awaiting-init-response", "ui/notifications/initialized")
    assert not premature2.ok
    assert premature2.reason == "premature-message"
    assert premature2.method == "ui/notifications/initialized"

  def test_check_handshake_order_initialized(self):
    assert check_handshake_order("initialized", "tools/call") == HandshakeOrderViolation(True)
    assert check_handshake_order("initialized", "ui/notifications/initialized").ok


# ─── AC-42.18 — §26.7 message validation ──────────────────────────────────────


class TestValidateDialectMessage:
  def test_known_request(self):
    res = validate_dialect_message(_req("ui/initialize", params={}))
    assert res.ok and res.kind == "request"
    assert res.entry.name == "ui/initialize"

  def test_known_notification(self):
    res = validate_dialect_message({"jsonrpc": "2.0", "method": "ui/notifications/size-changed"})
    assert res.ok and res.kind == "notification"
    assert res.entry.name == "ui/notifications/size-changed"

  def test_response_passes_framing_only(self):
    res = validate_dialect_message({"jsonrpc": "2.0", "id": 1, "result": {}})
    assert res.ok and res.kind == "response"
    assert res.entry is None
    err = validate_dialect_message({"jsonrpc": "2.0", "id": 1, "error": {"code": -32600, "message": "x"}})
    assert err.ok and err.kind == "response"

  def test_malformed_framing_never_raises(self):
    # AC-42.18: batch / bad jsonrpc / non-object are malformed-framing, never throw.
    res = validate_dialect_message([{"jsonrpc": "2.0"}])  # batch array
    assert not res.ok and res.reason == "malformed-framing"
    res2 = validate_dialect_message({"jsonrpc": "1.0", "id": 1, "method": "ping"})  # bad jsonrpc
    assert not res2.ok and res2.reason == "malformed-framing"
    res3 = validate_dialect_message("not-an-object")
    assert not res3.ok and res3.reason == "malformed-framing"
    assert validate_dialect_message(None).ok is False

  def test_unknown_method(self):
    res = validate_dialect_message(_req("ui/bogus"))
    assert not res.ok and res.reason == "unknown-method"
    assert "ui/bogus" in res.detail


# ─── AC-42.19 / AC-42.21 — §26.8 error responses ──────────────────────────────


class TestErrorResponses:
  def test_build_dialect_error_response(self):
    # AC-42.19: §3/§22-conforming error response.
    resp = build_dialect_error_response(2, INVALID_PARAMS_CODE, "bad params", {"field": "url"})
    assert resp == {
      "jsonrpc": "2.0",
      "id": 2,
      "error": {"code": INVALID_PARAMS_CODE, "message": "bad params", "data": {"field": "url"}},
    }

  def test_build_dialect_error_response_default_message(self):
    # Default message comes from the §22 registry name.
    resp = build_dialect_error_response(1, METHOD_NOT_FOUND_CODE)
    assert resp["error"]["message"] == "Method not found"
    assert "data" not in resp["error"]

  def test_method_not_found_response(self):
    # AC-42.21: matches the spec wire example for a declined unknown method.
    resp = method_not_found_response(2)
    assert resp == {"jsonrpc": "2.0", "id": 2, "error": {"code": -32601, "message": "Method not found"}}
    assert resp["error"]["code"] == METHOD_NOT_FOUND_CODE


# ─── AC-42.20 — §26.8 declined requests → errors ──────────────────────────────


class TestDeclineErrors:
  def test_declinable_requests_in_order(self):
    assert tuple(DECLINABLE_UI_REQUESTS) == (
      "tools/call",
      "resources/read",
      "ui/open-link",
      "ui/message",
      "ui/update-model-context",
    )

  def test_decline_reasons_constant(self):
    assert DECLINE_REASONS == ("no-consent", "policy", "unknown-method", "invalid-params")

  def test_decline_error_code(self):
    assert decline_error_code("unknown-method") == METHOD_NOT_FOUND_CODE
    assert decline_error_code("invalid-params") == INVALID_PARAMS_CODE
    assert decline_error_code("no-consent") == INTERNAL_ERROR_CODE
    assert decline_error_code("policy") == INTERNAL_ERROR_CODE
    with pytest.raises(ValueError):
      decline_error_code("mystery")

  def test_build_decline_error_response_never_drops(self):
    # AC-42.20: every reason produces an error response (never a silent drop).
    for reason in DECLINE_REASONS:
      resp = build_decline_error_response(3, reason)
      assert resp["id"] == 3
      assert isinstance(resp["error"]["code"], int)
    resp = build_decline_error_response(9, "no-consent", "refused")
    assert resp["error"]["code"] == INTERNAL_ERROR_CODE
    assert resp["error"]["message"] == "refused"


# ─── AC-42.5 / AC-42.6 — §26.5.3/§26.7 mediation & consent ────────────────────


class TestMediation:
  def test_routes_when_all_hold(self):
    # AC-42.5: routes only when visibility=app AND policy AND consent.
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["model", "app"]}, user_consented=True, policy_allows=True)
    assert mediate_ui_tools_call(inp) == ToolsCallMediationDecision(True)

  def test_default_visibility_routes(self):
    # AC-42.6: omitted visibility includes "app" and may route.
    inp = ToolsCallMediationInput(ui_meta={}, user_consented=True, policy_allows=True)
    assert mediate_ui_tools_call(inp).route

  def test_rejects_without_app_visibility(self):
    # AC-42.6: reject when effective visibility excludes "app".
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["model"]}, user_consented=True, policy_allows=True)
    decision = mediate_ui_tools_call(inp)
    assert not decision.route and decision.reason == "policy"

  def test_rejects_without_declaration(self):
    # AC-42.6: a tool with no UI declaration is rejected (policy).
    inp = ToolsCallMediationInput(ui_meta=None, user_consented=True, policy_allows=True)
    assert mediate_ui_tools_call(inp).reason == "policy"

  def test_rejects_without_policy(self):
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["model", "app"]}, user_consented=True, policy_allows=False)
    assert mediate_ui_tools_call(inp).reason == "policy"

  def test_rejects_without_consent(self):
    # AC-42.5: never reach the server without consent.
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["model", "app"]}, user_consented=False, policy_allows=True)
    decision = mediate_ui_tools_call(inp)
    assert not decision.route and decision.reason == "no-consent"

  def test_open_link(self):
    # AC-42.8: honors only when host chooses to AND user confirmed.
    assert mediate_open_link(True, True) == ToolsCallMediationDecision(True)
    assert mediate_open_link(True, False) == ToolsCallMediationDecision(False, reason="no-consent")
    assert mediate_open_link(False, True) == ToolsCallMediationDecision(False, reason="policy")

  def test_ui_message_same_gate(self):
    assert mediate_ui_message(True, True).route
    assert mediate_ui_message(True, False).reason == "no-consent"
    assert mediate_ui_message(False, True).reason == "policy"


# ─── AC-42.9 / AC-42.10 / AC-42.11 — result builders ──────────────────────────


class TestResultBuilders:
  def test_display_mode_result(self):
    # AC-42.9: result reports the host-applied mode, which may differ from requested.
    assert build_display_mode_result("fullscreen", "pip") == {"mode": "pip"}
    assert build_display_mode_result("inline", "inline") == {"mode": "inline"}

  def test_ping_response(self):
    # AC-42.10: empty success result echoing the id.
    assert build_ping_response(4) == {"jsonrpc": "2.0", "id": 4, "result": {}}

  def test_teardown_response(self):
    # AC-42.11: the UI responds with an empty object.
    assert build_teardown_response(9) == {"jsonrpc": "2.0", "id": 9, "result": {}}


# ─── AC-42.15 / AC-42.16 — §26.7 sandbox CSP / permission enforcement ─────────


class TestGrantedPermissions:
  def test_keeps_requested(self):
    assert granted_permissions({"camera": {}, "microphone": {}}) == {"camera": {}, "microphone": {}}

  def test_drops_declined(self):
    # AC-42.15: granted is a subset of requested; host may decline.
    granted = granted_permissions({"clipboardWrite": {}, "camera": {}}, declined=["camera"])
    assert granted == {"clipboardWrite": {}}
    assert "camera" not in granted

  def test_never_grants_unrequested(self):
    # AC-42.16: a permission not requested can never be granted, even if not declined.
    assert granted_permissions(None) == {}
    assert granted_permissions({}) == {}
    granted = granted_permissions({"clipboardWrite": {}}, declined=["geolocation"])
    assert granted == {"clipboardWrite": {}}
    assert "geolocation" not in granted

  def test_build_sandbox_report(self):
    # AC-42.15: report carries effective csp + granted permissions.
    report = build_sandbox_report({"connectDomains": ["https://api.example.com"]}, {"clipboardWrite": {}})
    assert report == {"csp": {"connectDomains": ["https://api.example.com"]}, "permissions": {"clipboardWrite": {}}}
    assert is_valid_ui_sandbox_report(report)


# ─── AC-42.17 — §26.7 data-exposure guard ─────────────────────────────────────


class TestExposureGuard:
  def test_allowed_keys(self):
    assert tuple(ALLOWED_UI_EXPOSURE_KEYS) == ("toolInput", "toolResult", "hostContext")

  def test_clean(self):
    assert ui_exposure_is_clean({})
    assert ui_exposure_is_clean({"toolInput": {}, "toolResult": {}, "hostContext": {}})

  def test_dirty_for_every_forbidden_key(self):
    # AC-42.17: a credential/token/cookie/conversation datum is dirty.
    for key in FORBIDDEN_UI_EXPOSURE_KEYS:
      assert not ui_exposure_is_clean({"toolInput": {}, key: "secret"})

  def test_dirty_allow_list_based(self):
    # Allow-list based: even an unforeseen key is caught.
    assert not ui_exposure_is_clean({"surpriseLeak": 1})
    assert not ui_exposure_is_clean({"conversationHistory": []})


# ─── AC-42.12 / AC-42.13 — §26.7 sandbox isolation model ──────────────────────


class TestSandboxIsolation:
  def test_denied_categories(self):
    assert tuple(SANDBOX_DENIED_ACCESS) == ("dom", "cookies", "storage", "navigation")

  def test_conforming(self):
    assert sandbox_isolation_is_conforming(["dom", "cookies", "storage", "navigation"])
    assert sandbox_isolation_is_conforming(["dom", "cookies", "storage", "navigation", "extra"])

  def test_non_conforming(self):
    # AC-42.12: a config missing any denied category is non-conforming.
    assert not sandbox_isolation_is_conforming(["dom", "cookies", "storage"])
    assert not sandbox_isolation_is_conforming(["dom", "cookies"])
    assert not sandbox_isolation_is_conforming([])

  def test_dialect_is_only_channel(self):
    # AC-42.13: the dialect channel is the only granted path.
    assert dialect_is_only_channel([DIALECT_CHANNEL_PATH])
    assert not dialect_is_only_channel([DIALECT_CHANNEL_PATH, "direct-cookie-access"])
    assert not dialect_is_only_channel([])
    assert not dialect_is_only_channel(["other"])


# ─── AC-42.22 .. AC-42.25 — §26.9 SDK scope summary ───────────────────────────


class TestSdkScope:
  def test_obligations_in_order(self):
    assert tuple(SERVER_SDK_OBLIGATIONS) == ("acknowledge-extension", "declare-ui-meta", "serve-ui-resource")

  def test_host_only_in_order(self):
    assert tuple(HOST_ONLY_CONCERNS) == (
      "render-sandboxed",
      "enforce-csp-permissions",
      "run-dialect-runtime",
      "obtain-consent",
    )

  def test_each_obligation_recognized(self):
    # AC-42.22–AC-42.24.
    assert is_server_sdk_obligation("acknowledge-extension")
    assert is_server_sdk_obligation("declare-ui-meta")
    assert is_server_sdk_obligation("serve-ui-resource")

  def test_host_only_not_server_obligation(self):
    # AC-42.25: host-only concerns are NOT server obligations.
    for concern in HOST_ONLY_CONCERNS:
      assert not is_server_sdk_obligation(concern)
    assert not is_server_sdk_obligation("render-sandboxed")
    assert not is_server_sdk_obligation("anything-else")
