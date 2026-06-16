"""Tests for Interactive UI Extension II — UI-to-host dialect, registry & security
(§26.5–§26.9)."""

import pytest

from mcp.protocol.errors import INTERNAL_ERROR_CODE, INVALID_PARAMS_CODE, METHOD_NOT_FOUND_CODE
from mcp.protocol.ui_host import (
  ALLOWED_UI_EXPOSURE_KEYS,
  DECLINABLE_UI_REQUESTS,
  DIALECT_CHANNEL_PATH,
  HOST_ONLY_CONCERNS,
  LOGGING_MESSAGE_METHOD,
  SANDBOX_DENIED_ACCESS,
  SERVER_SDK_OBLIGATIONS,
  UI_DIALECT_METHODS,
  UI_DIALECT_PROTOCOL_VERSION,
  UI_DIALECT_REGISTRY,
  UI_DISPLAY_MODES,
  ToolsCallMediationInput,
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
  is_valid_ui_message_params,
  is_valid_ui_sandbox_report,
  is_valid_update_model_context_params,
  mediate_open_link,
  mediate_ui_message,
  mediate_ui_tools_call,
  method_not_found_response,
  sandbox_isolation_is_conforming,
  ui_dialect_registry_entry,
  ui_may_emit_before_init_response,
  ui_exposure_is_clean,
  validate_dialect_message,
)

TEXT_BLOCK = {"type": "text", "text": "hi"}


def _req(method, id_=1, params=None):
  msg = {"jsonrpc": "2.0", "id": id_, "method": method}
  if params is not None:
    msg["params"] = params
  return msg


# ─── §26.5 — Dialect protocol version ─────────────────────────────────────────


class TestProtocolVersion:
  def test_constant(self):
    assert UI_DIALECT_PROTOCOL_VERSION == "2026-01-26"

  def test_exact_match(self):
    assert is_ui_dialect_protocol_version("2026-01-26")
    assert not is_ui_dialect_protocol_version("2026-01-27")
    assert not is_ui_dialect_protocol_version(None)


# ─── §26.5.1 — Display modes ──────────────────────────────────────────────────


class TestDisplayModes:
  def test_constant(self):
    assert UI_DISPLAY_MODES == ("inline", "fullscreen", "pip")

  def test_predicate(self):
    assert is_ui_display_mode("inline")
    assert is_ui_display_mode("pip")
    assert not is_ui_display_mode("floating")
    assert not is_ui_display_mode(None)


# ─── §26.6 — Method/notification registry ─────────────────────────────────────


class TestRegistry:
  def test_19_entries(self):
    assert len(UI_DIALECT_REGISTRY) == 19
    # Every name is distinct.
    names = [e.name for e in UI_DIALECT_REGISTRY]
    assert len(set(names)) == 19

  def test_log_message_reuses_core(self):
    assert LOGGING_MESSAGE_METHOD == "notifications/message"
    assert UI_DIALECT_METHODS["LOG_MESSAGE"] == "notifications/message"

  def test_verbatim_names(self):
    assert UI_DIALECT_METHODS["INITIALIZE"] == "ui/initialize"
    assert UI_DIALECT_METHODS["TOOLS_CALL"] == "tools/call"
    assert UI_DIALECT_METHODS["PING"] == "ping"

  def test_is_ui_dialect_method_name_case_sensitive(self):
    assert is_ui_dialect_method_name("ui/initialize")
    assert is_ui_dialect_method_name("tools/call")
    assert not is_ui_dialect_method_name("UI/Initialize")  # wrong case
    assert not is_ui_dialect_method_name("ui/Initialize")
    assert not is_ui_dialect_method_name("ui/unknown")
    assert not is_ui_dialect_method_name(None)

  def test_lookup_entry(self):
    entry = ui_dialect_registry_entry("ui/initialize")
    assert entry is not None
    assert entry.kind == "request"
    assert entry.sender == "ui-to-host"
    assert ui_dialect_registry_entry("nope") is None

  def test_kinds_and_senders(self):
    by_name = {e.name: e for e in UI_DIALECT_REGISTRY}
    assert by_name["ui/notifications/tool-input"].kind == "notification"
    assert by_name["ui/notifications/tool-input"].sender == "host-to-ui"
    assert by_name["ping"].sender == "ui-or-host"
    assert by_name["ui/resource-teardown"].sender == "host-to-ui"
    assert by_name["ui/notifications/sandbox-proxy-ready"].sender == "sandbox-to-host"
    assert by_name["ui/notifications/sandbox-resource-ready"].sender == "host-to-sandbox"


# ─── §26.5.1 — Handshake params/result ────────────────────────────────────────


class TestInitializeShapes:
  def test_client_info(self):
    assert is_valid_ui_client_info({"name": "ui", "version": "1.0"})
    assert not is_valid_ui_client_info({"name": "ui"})  # version required
    assert not is_valid_ui_client_info(None)

  def test_app_capabilities(self):
    assert is_valid_ui_app_capabilities({})
    assert is_valid_ui_app_capabilities({"tools": {"listChanged": True}})
    assert is_valid_ui_app_capabilities({"availableDisplayModes": ["inline", "pip"]})
    assert not is_valid_ui_app_capabilities({"tools": {"listChanged": "yes"}})
    assert not is_valid_ui_app_capabilities({"availableDisplayModes": ["bad"]})

  def test_host_context_partial(self):
    assert is_valid_ui_host_context({})  # all optional → partial change valid
    assert is_valid_ui_host_context({"theme": "dark", "platform": "web"})
    assert is_valid_ui_host_context({"displayMode": "inline", "locale": "en-US"})
    assert not is_valid_ui_host_context({"theme": "neon"})
    assert not is_valid_ui_host_context({"platform": "watch"})
    assert not is_valid_ui_host_context({"displayMode": "floating"})
    assert not is_valid_ui_host_context({"locale": 5})

  def test_host_capabilities_and_sandbox(self):
    assert is_valid_ui_host_capabilities({})
    assert is_valid_ui_host_capabilities({"openLinks": {}})
    report = {"csp": {"connectDomains": []}, "permissions": {"camera": {}}}
    assert is_valid_ui_sandbox_report(report)
    assert is_valid_ui_host_capabilities({"sandbox": report})
    assert not is_valid_ui_host_capabilities({"openLinks": "yes"})
    assert not is_valid_ui_sandbox_report({"permissions": {"camera": True}})

  def test_initialize_result_requires_protocol_version(self):
    assert is_ui_initialize_result({"protocolVersion": "2026-01-26"})
    # protocolVersion is REQUIRED — absence is a conformance failure (AC-42.4).
    assert not is_ui_initialize_result({})
    assert not is_ui_initialize_result({"hostInfo": {"name": "h", "version": "1"}})
    assert is_ui_initialize_result(
      {"protocolVersion": "x", "hostInfo": {"name": "h", "version": "1"}, "hostContext": {"theme": "light"}}
    )
    assert not is_ui_initialize_result({"protocolVersion": "x", "hostInfo": {"name": "h"}})  # bad hostInfo


# ─── §26.5.2 — Host → UI delivery params ──────────────────────────────────────


class TestDeliveryParams:
  def test_tool_input(self):
    assert is_valid_tool_input_params({"arguments": {}})
    assert is_valid_tool_input_params({"arguments": {"x": 1}})
    assert not is_valid_tool_input_params({})  # arguments required
    assert not is_valid_tool_input_params({"arguments": []})

  def test_tool_result(self):
    assert is_valid_tool_result_params({})
    assert is_valid_tool_result_params({"content": [TEXT_BLOCK], "isError": True})
    assert is_valid_tool_result_params({"structuredContent": {"any": "json"}})
    assert not is_valid_tool_result_params({"content": [{"type": "text"}]})  # bad block
    assert not is_valid_tool_result_params({"isError": "yes"})

  def test_tool_cancelled(self):
    assert is_valid_tool_cancelled_params({"reason": "user-cancel"})
    assert not is_valid_tool_cancelled_params({})


# ─── §26.5.3 — UI → Host request params/results ───────────────────────────────


class TestRequestParams:
  def test_tools_call(self):
    assert is_valid_tools_call_params({"name": "do"})
    assert is_valid_tools_call_params({"name": "do", "arguments": {"a": 1}})
    assert not is_valid_tools_call_params({})  # name required
    assert not is_valid_tools_call_params({"name": "do", "arguments": []})

  def test_open_link(self):
    assert is_valid_open_link_params({"url": "https://x"})
    assert not is_valid_open_link_params({})

  def test_ui_message(self):
    assert is_valid_ui_message_params({"role": "user", "content": TEXT_BLOCK})
    assert not is_valid_ui_message_params({"role": "assistant", "content": TEXT_BLOCK})  # role must be user
    assert not is_valid_ui_message_params({"role": "user", "content": {"type": "image"}})

  def test_request_display_mode(self):
    assert is_valid_request_display_mode_params({"mode": "fullscreen"})
    assert not is_valid_request_display_mode_params({"mode": "bad"})
    assert is_valid_request_display_mode_result({"mode": "inline"})
    assert not is_valid_request_display_mode_result({})

  def test_update_model_context(self):
    assert is_valid_update_model_context_params({})
    assert is_valid_update_model_context_params({"content": [TEXT_BLOCK]})
    assert not is_valid_update_model_context_params({"content": [{"type": "text"}]})

  def test_ping(self):
    assert is_valid_ping_params({})
    assert not is_valid_ping_params(None)


# ─── §26.5.4 — Host → UI lifecycle params ─────────────────────────────────────


class TestLifecycleParams:
  def test_size_changed(self):
    assert is_valid_size_changed_params({"width": 100, "height": 200})
    assert not is_valid_size_changed_params({"width": 100})
    assert not is_valid_size_changed_params({"width": True, "height": 1})  # bool not a number

  def test_resource_teardown(self):
    assert is_valid_resource_teardown_params({"reason": "removed"})
    assert not is_valid_resource_teardown_params({})


# ─── §26.5.5 — Sandbox-resource-ready params ──────────────────────────────────


class TestSandboxResourceReady:
  def test_valid(self):
    assert is_valid_sandbox_resource_ready_params({"html": "<x>"})
    assert is_valid_sandbox_resource_ready_params(
      {"html": "<x>", "sandbox": "allow-scripts", "csp": {"connectDomains": []}, "permissions": {"camera": {}}}
    )

  def test_invalid(self):
    assert not is_valid_sandbox_resource_ready_params({})  # html required
    assert not is_valid_sandbox_resource_ready_params({"html": "<x>", "csp": {"connectDomains": "x"}})


# ─── §26.5.1 — Handshake ordering ─────────────────────────────────────────────


class TestHandshakeOrder:
  def test_only_initialize_before_response(self):
    assert ui_may_emit_before_init_response("ui/initialize")
    assert not ui_may_emit_before_init_response("ui/notifications/initialized")
    assert not ui_may_emit_before_init_response("tools/call")

  def test_check_handshake_order(self):
    # In awaiting phase only ui/initialize is allowed.
    assert check_handshake_order("awaiting-init-response", "ui/initialize").ok
    premature = check_handshake_order("awaiting-init-response", "ui/notifications/initialized")
    assert not premature.ok
    assert premature.reason == "premature-message"
    assert premature.method == "ui/notifications/initialized"
    # Once initialized, anything goes.
    assert check_handshake_order("initialized", "tools/call").ok


# ─── §26.7 — Message validation ───────────────────────────────────────────────


class TestValidateDialectMessage:
  def test_known_request(self):
    res = validate_dialect_message(_req("ui/initialize", params={"_meta": {}}))
    assert res.ok and res.kind == "request"
    assert res.entry.name == "ui/initialize"

  def test_known_notification(self):
    res = validate_dialect_message({"jsonrpc": "2.0", "method": "ui/notifications/size-changed", "params": {"_meta": {}}})
    assert res.ok and res.kind == "notification"

  def test_response_passes_framing_only(self):
    res = validate_dialect_message({"jsonrpc": "2.0", "id": 1, "result": {}})
    assert res.ok and res.kind == "response"
    err = validate_dialect_message({"jsonrpc": "2.0", "id": 1, "error": {"code": -32600, "message": "x"}})
    assert err.ok and err.kind == "response"

  def test_malformed_framing(self):
    res = validate_dialect_message([1, 2, 3])  # batch array
    assert not res.ok and res.reason == "malformed-framing"
    res2 = validate_dialect_message({"jsonrpc": "1.0", "id": 1, "method": "ping"})  # bad jsonrpc
    assert not res2.ok and res2.reason == "malformed-framing"

  def test_unknown_method(self):
    res = validate_dialect_message(_req("ui/not-a-method"))
    assert not res.ok and res.reason == "unknown-method"
    assert "ui/not-a-method" in res.detail

  def test_does_not_raise(self):
    # Never raises MalformedMessageError — always returns a result.
    assert validate_dialect_message(None).ok is False


# ─── §26.8 — Error responses ──────────────────────────────────────────────────


class TestErrorResponses:
  def test_build_dialect_error_response(self):
    resp = build_dialect_error_response(7, INVALID_PARAMS_CODE, "bad", {"k": 1})
    assert resp == {"jsonrpc": "2.0", "id": 7, "error": {"code": INVALID_PARAMS_CODE, "message": "bad", "data": {"k": 1}}}

  def test_method_not_found_response(self):
    resp = method_not_found_response(3)
    assert resp["error"]["code"] == METHOD_NOT_FOUND_CODE
    assert resp["error"]["message"] == "Method not found"

  def test_declinable_requests(self):
    assert set(DECLINABLE_UI_REQUESTS) == {
      "tools/call",
      "resources/read",
      "ui/open-link",
      "ui/message",
      "ui/update-model-context",
    }

  def test_decline_error_code(self):
    assert decline_error_code("unknown-method") == METHOD_NOT_FOUND_CODE
    assert decline_error_code("invalid-params") == INVALID_PARAMS_CODE
    assert decline_error_code("no-consent") == INTERNAL_ERROR_CODE
    assert decline_error_code("policy") == INTERNAL_ERROR_CODE
    with pytest.raises(ValueError):
      decline_error_code("mystery")

  def test_build_decline_error_response(self):
    resp = build_decline_error_response(9, "no-consent", "refused")
    assert resp["id"] == 9
    assert resp["error"]["code"] == INTERNAL_ERROR_CODE
    assert resp["error"]["message"] == "refused"


# ─── §26.5.3 / §26.7 — Mediation & consent ────────────────────────────────────


class TestMediation:
  def test_routes_when_all_hold(self):
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["app"]}, user_consented=True, policy_allows=True)
    assert mediate_ui_tools_call(inp).route

  def test_rejects_without_app_visibility(self):
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["model"]}, user_consented=True, policy_allows=True)
    decision = mediate_ui_tools_call(inp)
    assert not decision.route and decision.reason == "policy"

  def test_rejects_without_declaration(self):
    inp = ToolsCallMediationInput(ui_meta=None, user_consented=True, policy_allows=True)
    assert mediate_ui_tools_call(inp).reason == "policy"

  def test_rejects_without_policy(self):
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["app"]}, user_consented=True, policy_allows=False)
    assert mediate_ui_tools_call(inp).reason == "policy"

  def test_rejects_without_consent(self):
    # All else holds but consent is missing → no-consent (AC-42.5: never reach server).
    inp = ToolsCallMediationInput(ui_meta={"visibility": ["app"]}, user_consented=False, policy_allows=True)
    decision = mediate_ui_tools_call(inp)
    assert not decision.route and decision.reason == "no-consent"

  def test_open_link(self):
    assert mediate_open_link(True, True).route
    assert mediate_open_link(False, True).reason == "policy"
    assert mediate_open_link(True, False).reason == "no-consent"

  def test_ui_message(self):
    assert mediate_ui_message(True, True).route
    assert mediate_ui_message(True, False).reason == "no-consent"


# ─── §26.5.3 / §26.5.4 — Result builders ──────────────────────────────────────


class TestResultBuilders:
  def test_display_mode_result(self):
    # Host MAY apply a different mode than requested (AC-42.9).
    assert build_display_mode_result("fullscreen", "inline") == {"mode": "inline"}

  def test_ping_response(self):
    assert build_ping_response(5) == {"jsonrpc": "2.0", "id": 5, "result": {}}

  def test_teardown_response(self):
    assert build_teardown_response(6) == {"jsonrpc": "2.0", "id": 6, "result": {}}


# ─── §26.7 — Sandbox CSP / permission enforcement ─────────────────────────────


class TestGrantedPermissions:
  def test_keeps_requested(self):
    assert granted_permissions({"camera": {}, "microphone": {}}) == {"camera": {}, "microphone": {}}

  def test_drops_declined(self):
    assert granted_permissions({"camera": {}, "microphone": {}}, declined=["microphone"]) == {"camera": {}}

  def test_never_grants_unrequested(self):
    # Declining something not requested has no effect; nothing extra is granted.
    assert granted_permissions(None) == {}
    assert granted_permissions({"camera": {}}, declined=["geolocation"]) == {"camera": {}}

  def test_build_sandbox_report(self):
    csp = {"connectDomains": []}
    granted = {"camera": {}}
    assert build_sandbox_report(csp, granted) == {"csp": csp, "permissions": granted}


# ─── §26.7 — Data-exposure guard ──────────────────────────────────────────────


class TestExposureGuard:
  def test_allowed_keys(self):
    assert set(ALLOWED_UI_EXPOSURE_KEYS) == {"toolInput", "toolResult", "hostContext"}

  def test_clean(self):
    assert ui_exposure_is_clean({})
    assert ui_exposure_is_clean({"toolInput": {}, "toolResult": {}, "hostContext": {}})

  def test_dirty(self):
    assert not ui_exposure_is_clean({"toolInput": {}, "token": "secret"})
    assert not ui_exposure_is_clean({"conversationHistory": []})
    # Allow-list based: even an unforeseen key is caught.
    assert not ui_exposure_is_clean({"somethingNew": 1})


# ─── §26.7 — Sandbox isolation model ──────────────────────────────────────────


class TestSandboxIsolation:
  def test_denied_categories(self):
    assert set(SANDBOX_DENIED_ACCESS) == {"dom", "cookies", "storage", "navigation"}

  def test_conforming(self):
    assert sandbox_isolation_is_conforming(["dom", "cookies", "storage", "navigation"])
    assert sandbox_isolation_is_conforming(["dom", "cookies", "storage", "navigation", "extra"])

  def test_non_conforming(self):
    assert not sandbox_isolation_is_conforming(["dom", "cookies"])  # missing some
    assert not sandbox_isolation_is_conforming([])

  def test_dialect_is_only_channel(self):
    assert dialect_is_only_channel([DIALECT_CHANNEL_PATH])
    assert not dialect_is_only_channel([DIALECT_CHANNEL_PATH, "backdoor"])
    assert not dialect_is_only_channel([])
    assert not dialect_is_only_channel(["other"])


# ─── §26.9 — SDK scope summary ────────────────────────────────────────────────


class TestSdkScope:
  def test_obligations(self):
    assert set(SERVER_SDK_OBLIGATIONS) == {"acknowledge-extension", "declare-ui-meta", "serve-ui-resource"}

  def test_host_only(self):
    assert set(HOST_ONLY_CONCERNS) == {
      "render-sandboxed",
      "enforce-csp-permissions",
      "run-dialect-runtime",
      "obtain-consent",
    }

  def test_is_server_sdk_obligation(self):
    assert is_server_sdk_obligation("declare-ui-meta")
    assert is_server_sdk_obligation("serve-ui-resource")
    assert is_server_sdk_obligation("acknowledge-extension")
    # Host-only concerns are NOT server obligations (R-26.9-d, AC-42.25).
    for concern in HOST_ONLY_CONCERNS:
      assert not is_server_sdk_obligation(concern)
    assert not is_server_sdk_obligation("render-sandboxed")
