using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for the S42 UI-to-host dialect, registry, handshake ordering, message validation,
/// the §26.8 error contract, host mediation/consent gates, sandbox reporting, the data-exposure guard,
/// and the §26.9 SDK scope split (spec §26.5–§26.9). Mirrors the TypeScript <c>ui-host.test.ts</c>
/// acceptance criteria AC-42.1 … AC-42.25, with explicit coverage of the security-critical edges:
/// dialect-method validation, premature-handshake rejection, malformed-framing rejection, the
/// consent-precedence mediation, granted-permission narrowing, and the credential-leak guard.
/// </summary>
public sealed class UiHostTests
{
  // ── AC-42.1 (R-26.5-a) verbatim 19-name registry ──

  [Fact]
  public void Dialect_registry_has_the_19_verbatim_names_in_spec_order()
  {
    Assert.Equal(19, UiHost.DialectRegistry.Count);
    Assert.Equal(
      new[]
      {
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
      },
      UiHost.DialectRegistry.Select(e => e.Name).ToArray());
  }

  [Fact]
  public void Is_ui_dialect_method_name_is_byte_exact_and_case_sensitive()
  {
    Assert.True(UiHost.IsUiDialectMethodName("ui/initialize"));
    Assert.True(UiHost.IsUiDialectMethodName("ping"));
    Assert.False(UiHost.IsUiDialectMethodName("UI/Initialize"));
    Assert.False(UiHost.IsUiDialectMethodName("ui/Initialize"));
    Assert.False(UiHost.IsUiDialectMethodName("ui/bogus"));
    Assert.False(UiHost.IsUiDialectMethodName(null));
  }

  [Fact]
  public void Dialect_registry_entry_reports_kind_and_sender()
  {
    Assert.Equal(UiHost.DialectSender.UiOrHost, UiHost.DialectRegistryEntryFor("ping")!.Sender);
    Assert.Equal(UiHost.DialectKind.Request, UiHost.DialectRegistryEntryFor("ui/initialize")!.Kind);
    Assert.Equal(UiHost.DialectKind.Notification, UiHost.DialectRegistryEntryFor("ui/notifications/initialized")!.Kind);
    Assert.Null(UiHost.DialectRegistryEntryFor("ui/bogus"));
  }

  // ── AC-42.2 (R-26.5-b) dialect protocol version ──

  [Fact]
  public void Dialect_protocol_version_is_the_exact_revision()
  {
    Assert.Equal("2026-01-26", UiHost.DialectProtocolVersion);
    Assert.True(UiHost.IsUiDialectProtocolVersion("2026-01-26"));
    Assert.False(UiHost.IsUiDialectProtocolVersion("2026-07-28"));
    Assert.False(UiHost.IsUiDialectProtocolVersion(null));
  }

  [Theory]
  [InlineData("inline", true)]
  [InlineData("fullscreen", true)]
  [InlineData("pip", true)]
  [InlineData("floating", false)]
  public void Display_modes_are_the_exact_three(string mode, bool expected)
  {
    Assert.Equal(expected, UiHost.IsUiDisplayMode(mode));
    Assert.Equal(new[] { "inline", "fullscreen", "pip" }, UiHost.DisplayModes);
  }

  // ── AC-42.3 (R-26.5.1-a) handshake ordering ──

  [Fact]
  public void Handshake_order_permits_only_initialize_before_the_init_response()
  {
    Assert.True(UiHost.CheckHandshakeOrder(UiHost.ChannelPhase.AwaitingInitResponse, "ui/initialize").Ok);

    var prematureCall = UiHost.CheckHandshakeOrder(UiHost.ChannelPhase.AwaitingInitResponse, "tools/call");
    Assert.False(prematureCall.Ok);
    Assert.Equal("tools/call", prematureCall.PrematureMethod);

    // Even `initialized` must wait for the response (it is the third handshake step).
    Assert.False(UiHost.CheckHandshakeOrder(UiHost.ChannelPhase.AwaitingInitResponse, "ui/notifications/initialized").Ok);

    Assert.True(UiHost.CheckHandshakeOrder(UiHost.ChannelPhase.Initialized, "tools/call").Ok);
    Assert.True(UiHost.CheckHandshakeOrder(UiHost.ChannelPhase.Initialized, "ui/notifications/initialized").Ok);

    Assert.True(UiHost.UiMayEmitBeforeInitResponse("ui/initialize"));
    Assert.False(UiHost.UiMayEmitBeforeInitResponse("ping"));
  }

  // ── AC-42.4 (R-26.5.1-b) UiInitializeResult.protocolVersion required ──

  [Fact]
  public void Init_result_requires_protocol_version()
  {
    Assert.True(UiHost.IsUiInitializeResult(JsonNode.Parse("""{ "protocolVersion": "2026-01-26" }""")));
    Assert.False(UiHost.IsUiInitializeResult(JsonNode.Parse("""{ "hostInfo": { "name": "H", "version": "1" } }""")));
    Assert.False(UiHost.IsUiInitializeResult(JsonNode.Parse("""{ "protocolVersion": 1 }""")));
  }

  // ── AC-42.5 / AC-42.6 (R-26.5.3, R-26.7) mediate UI tools/call ──

  [Fact]
  public void Mediate_tools_call_routes_only_with_app_visibility_policy_and_consent()
  {
    var appMeta = new ToolUiMeta { ResourceUri = "ui://a", Visibility = [UiVisibility.App] };

    Assert.True(UiHost.MediateUiToolsCall(new UiHost.ToolsCallMediationInput(appMeta, UserConsented: true, PolicyAllows: true)).Route);

    var noConsent = UiHost.MediateUiToolsCall(new UiHost.ToolsCallMediationInput(appMeta, UserConsented: false, PolicyAllows: true));
    Assert.False(noConsent.Route);
    Assert.Equal(UiHost.DeclineReason.NoConsent, noConsent.Reason);

    var noPolicy = UiHost.MediateUiToolsCall(new UiHost.ToolsCallMediationInput(appMeta, UserConsented: true, PolicyAllows: false));
    Assert.False(noPolicy.Route);
    Assert.Equal(UiHost.DeclineReason.Policy, noPolicy.Reason);
  }

  [Fact]
  public void Mediate_tools_call_rejects_non_app_visible_or_unexposed_tools()
  {
    var modelOnly = new ToolUiMeta { ResourceUri = "ui://m", Visibility = [UiVisibility.Model] };
    var rejected = UiHost.MediateUiToolsCall(new UiHost.ToolsCallMediationInput(modelOnly, UserConsented: true, PolicyAllows: true));
    Assert.False(rejected.Route);
    Assert.Equal(UiHost.DeclineReason.Policy, rejected.Reason);

    // A tool with no UI declaration was never UI-exposed ⇒ policy reject.
    var noMeta = UiHost.MediateUiToolsCall(new UiHost.ToolsCallMediationInput(null, UserConsented: true, PolicyAllows: true));
    Assert.False(noMeta.Route);
    Assert.Equal(UiHost.DeclineReason.Policy, noMeta.Reason);
  }

  // ── AC-42.7 (R-26.5.3-c) resources/read declinable ──

  [Fact]
  public void Resources_read_is_a_declinable_ui_request()
  {
    Assert.Contains("resources/read", UiHost.DeclinableUiRequests);
  }

  [Fact]
  public void Decline_produces_an_error_response_not_a_silent_drop()
  {
    var res = UiHost.BuildDeclineErrorResponse(new RequestId(7), UiHost.DeclineReason.Policy);
    Assert.Equal(ErrorCodes.InternalError, res.Error.Code);
    Assert.Equal(new RequestId(7), res.Id);
  }

  // ── AC-42.8 (R-26.5.3-d, R-26.7-l) ui/open-link & ui/message consent ──

  [Fact]
  public void Open_link_honors_only_when_host_chooses_and_user_confirms()
  {
    Assert.True(UiHost.MediateOpenLink(true, true).Route);

    var noConsent = UiHost.MediateOpenLink(true, false);
    Assert.False(noConsent.Route);
    Assert.Equal(UiHost.DeclineReason.NoConsent, noConsent.Reason);

    var declined = UiHost.MediateOpenLink(false, true);
    Assert.False(declined.Route);
    Assert.Equal(UiHost.DeclineReason.Policy, declined.Reason);
  }

  [Fact]
  public void Ui_message_uses_the_same_confirm_before_insert_gate()
  {
    Assert.True(UiHost.MediateUiMessage(true, true).Route);
    Assert.Equal(UiHost.DeclineReason.NoConsent, UiHost.MediateUiMessage(true, false).Reason);
  }

  // ── AC-42.9 (R-26.5.3-e) display-mode result reports the applied mode ──

  [Fact]
  public void Display_mode_result_reports_the_applied_mode()
  {
    Assert.Equal("pip", UiHost.BuildDisplayModeResult("pip")["mode"]!.GetValue<string>());
    Assert.Equal("inline", UiHost.BuildDisplayModeResult("inline")["mode"]!.GetValue<string>());
  }

  // ── AC-42.10 (R-26.5.3-f,g) ping liveness ──

  [Fact]
  public void Ping_yields_an_empty_success_result_echoing_the_id()
  {
    var res = UiHost.BuildPingResponse(new RequestId(4));
    Assert.Equal(new RequestId(4), res.Id);
    Assert.Empty(res.Result);
  }

  [Fact]
  public void Ping_registry_sender_is_ui_or_host()
  {
    Assert.Equal(UiHost.DialectSender.UiOrHost, UiHost.DialectRegistryEntryFor("ping")!.Sender);
  }

  // ── AC-42.11 (R-26.5.4-a) teardown response ──

  [Fact]
  public void Teardown_response_is_an_empty_success_echoing_the_id()
  {
    var res = UiHost.BuildTeardownResponse(new RequestId(9));
    Assert.Equal(new RequestId(9), res.Id);
    Assert.Empty(res.Result);
  }

  // ── AC-42.12 / AC-42.13 (R-26.7-a/b/c) sandbox isolation & single channel ──

  [Fact]
  public void Sandbox_isolation_requires_denying_dom_cookies_storage_navigation()
  {
    Assert.True(UiHost.SandboxIsolationIsConforming(["dom", "cookies", "storage", "navigation"]));
    Assert.False(UiHost.SandboxIsolationIsConforming(["dom", "cookies"]));
    Assert.Equal(new[] { "dom", "cookies", "storage", "navigation" }, UiHost.SandboxDeniedAccess);
  }

  [Fact]
  public void Dialect_is_the_only_granted_channel()
  {
    Assert.True(UiHost.DialectIsOnlyChannel([UiHost.DialectChannelPath]));
    Assert.False(UiHost.DialectIsOnlyChannel([UiHost.DialectChannelPath, "backdoor"]));
    Assert.False(UiHost.DialectIsOnlyChannel([]));
  }

  // ── AC-42.15 / AC-42.16 (R-26.7-g,h) granted permissions & sandbox report ──

  [Fact]
  public void Granted_permissions_drops_declined_and_unrequested()
  {
    var requested = new UiPermissions { Camera = new JsonObject(), Geolocation = new JsonObject() };
    var granted = UiHost.GrantedPermissions(requested, [Ui.UiPermissionName.Camera]);
    Assert.Null(granted.Camera); // host declined
    Assert.NotNull(granted.Geolocation); // requested, not declined
    Assert.Null(granted.Microphone); // never requested
  }

  [Fact]
  public void Granted_permissions_for_no_request_is_empty()
  {
    var granted = UiHost.GrantedPermissions(null);
    Assert.Null(granted.Camera);
    Assert.Null(granted.Microphone);
    Assert.Null(granted.Geolocation);
    Assert.Null(granted.ClipboardWrite);
  }

  [Fact]
  public void Sandbox_report_carries_effective_csp_and_granted_permissions()
  {
    var csp = Ui.ResolveCsp(new UiContentSecurityPolicy { ConnectDomains = ["https://api"] });
    var granted = UiHost.GrantedPermissions(new UiPermissions { ClipboardWrite = new JsonObject() });
    var report = UiHost.BuildSandboxReport(csp, granted);
    Assert.NotNull(report["csp"]);
    Assert.Equal("{}", report["permissions"]!["clipboardWrite"]!.ToJsonString());
  }

  // ── AC-42.17 (R-26.7-m) data-exposure guard ──

  [Fact]
  public void Exposure_is_clean_only_for_allow_listed_keys()
  {
    Assert.True(UiHost.UiExposureIsClean(new JsonObject { ["toolInput"] = new JsonObject(), ["toolResult"] = new JsonObject(), ["hostContext"] = new JsonObject() }));
    foreach (var key in UiHost.ForbiddenUiExposureKeys)
    {
      Assert.False(UiHost.UiExposureIsClean(new JsonObject { ["toolInput"] = new JsonObject(), [key] = "secret" }));
    }
    // An unforeseen leaking key (not on either list) is also caught by the allow-list.
    Assert.False(UiHost.UiExposureIsClean(new JsonObject { ["surpriseLeak"] = 1 }));
  }

  // ── AC-42.18 (R-26.7-n,o) message validation before acting ──

  [Fact]
  public void Validate_dialect_message_resolves_a_well_framed_request()
  {
    var v = UiHost.ValidateDialectMessage(JsonNode.Parse("""{ "jsonrpc": "2.0", "id": 1, "method": "ui/initialize", "params": {} }"""));
    Assert.True(v.Ok);
    Assert.Equal(UiHost.DialectMessageClass.Request, v.Class);
    Assert.Equal("ui/initialize", v.Entry!.Name);
  }

  [Fact]
  public void Validate_dialect_message_rejects_a_batch_array()
  {
    var v = UiHost.ValidateDialectMessage(JsonNode.Parse("""[{ "jsonrpc": "2.0" }]"""));
    Assert.False(v.Ok);
    Assert.Equal(UiHost.DialectValidationFailure.MalformedFraming, v.Failure);
  }

  [Fact]
  public void Validate_dialect_message_rejects_bad_jsonrpc_version()
  {
    var v = UiHost.ValidateDialectMessage(JsonNode.Parse("""{ "jsonrpc": "1.0", "id": 1, "method": "ping" }"""));
    Assert.False(v.Ok);
    Assert.Equal(UiHost.DialectValidationFailure.MalformedFraming, v.Failure);
  }

  [Fact]
  public void Validate_dialect_message_rejects_a_non_object()
  {
    var v = UiHost.ValidateDialectMessage(JsonValue.Create("not-an-object"));
    Assert.False(v.Ok);
    Assert.Equal(UiHost.DialectValidationFailure.MalformedFraming, v.Failure);
  }

  [Fact]
  public void Validate_dialect_message_flags_an_unknown_method()
  {
    var v = UiHost.ValidateDialectMessage(JsonNode.Parse("""{ "jsonrpc": "2.0", "id": 1, "method": "ui/bogus", "params": {} }"""));
    Assert.False(v.Ok);
    Assert.Equal(UiHost.DialectValidationFailure.UnknownMethod, v.Failure);
  }

  [Fact]
  public void Validate_dialect_message_passes_a_response_framing_only()
  {
    var v = UiHost.ValidateDialectMessage(JsonNode.Parse("""{ "jsonrpc": "2.0", "id": 1, "result": {} }"""));
    Assert.True(v.Ok);
    Assert.Equal(UiHost.DialectMessageClass.Response, v.Class);
  }

  // ── AC-42.19 (R-26.8-a) failed dialect request → JSON-RPC error ──

  [Fact]
  public void Build_dialect_error_response_is_spec_conforming()
  {
    var res = UiHost.BuildDialectErrorResponse(new RequestId(2), ErrorCodes.InvalidParams, "bad params", new JsonObject { ["field"] = "url" });
    Assert.Equal(new RequestId(2), res.Id);
    Assert.Equal(ErrorCodes.InvalidParams, res.Error.Code);
    Assert.Equal("bad params", res.Error.Message);
    Assert.Equal("url", res.Error.Data!["field"]!.GetValue<string>());
  }

  // ── AC-42.20 (R-26.8-b) declined requests return errors ──

  [Fact]
  public void Declinable_ui_requests_are_the_five_enumerated()
  {
    Assert.Equal(
      new[] { "tools/call", "resources/read", "ui/open-link", "ui/message", "ui/update-model-context" },
      UiHost.DeclinableUiRequests.ToArray());
  }

  [Fact]
  public void Each_decline_reason_maps_to_a_code_and_never_drops_silently()
  {
    Assert.Equal(ErrorCodes.MethodNotFound, UiHost.DeclineErrorCode(UiHost.DeclineReason.UnknownMethod));
    Assert.Equal(ErrorCodes.InvalidParams, UiHost.DeclineErrorCode(UiHost.DeclineReason.InvalidParams));
    Assert.Equal(ErrorCodes.InternalError, UiHost.DeclineErrorCode(UiHost.DeclineReason.NoConsent));
    Assert.Equal(ErrorCodes.InternalError, UiHost.DeclineErrorCode(UiHost.DeclineReason.Policy));

    foreach (var reason in new[] { UiHost.DeclineReason.NoConsent, UiHost.DeclineReason.Policy, UiHost.DeclineReason.UnknownMethod, UiHost.DeclineReason.InvalidParams })
    {
      var res = UiHost.BuildDeclineErrorResponse(new RequestId(3), reason);
      Assert.Equal(new RequestId(3), res.Id);
    }
  }

  // ── AC-42.21 (R-26.8-c) unimplemented method → -32601 ──

  [Fact]
  public void Method_not_found_response_uses_minus_32601()
  {
    var res = UiHost.MethodNotFoundResponse(new RequestId(2));
    Assert.Equal(-32601, res.Error.Code);
    Assert.Equal(ErrorCodes.MethodNotFound, res.Error.Code);
    Assert.Equal("Method not found", res.Error.Message);
    Assert.Equal(new RequestId(2), res.Id);
  }

  // ── AC-42.22–AC-42.25 (R-26.9) SDK scope split ──

  [Fact]
  public void Server_sdk_obligations_are_the_three_enumerated()
  {
    Assert.Equal(new[] { "acknowledge-extension", "declare-ui-meta", "serve-ui-resource" }, UiHost.ServerSdkObligations);
    Assert.True(UiHost.IsServerSdkObligation("acknowledge-extension"));
    Assert.True(UiHost.IsServerSdkObligation("declare-ui-meta"));
    Assert.True(UiHost.IsServerSdkObligation("serve-ui-resource"));
  }

  [Fact]
  public void Host_only_concerns_are_not_server_obligations()
  {
    Assert.Equal(new[] { "render-sandboxed", "enforce-csp-permissions", "run-dialect-runtime", "obtain-consent" }, UiHost.HostOnlyConcerns);
    foreach (var concern in UiHost.HostOnlyConcerns)
    {
      Assert.False(UiHost.IsServerSdkObligation(concern));
    }
  }

  // ── §26.4 (R-26.4-l): dedicated render origin / isolation ──

  [Fact]
  public void Dedicated_render_origin_reads_the_declared_domain()
  {
    Assert.Equal("https://ui.example", UiHost.DedicatedRenderOrigin(new ResourceUiMeta { Domain = "https://ui.example" }));
    Assert.Null(UiHost.DedicatedRenderOrigin(new ResourceUiMeta()));
    Assert.Null(UiHost.DedicatedRenderOrigin(null));
  }

  [Fact]
  public void Ui_is_isolated_only_under_its_declared_domain_and_not_shared()
  {
    // Isolated: render origin matches the declared domain and no other UI shares that origin.
    Assert.True(UiHost.IsIsolatedUnderDedicatedOrigin("https://ui.example", "https://ui.example", ["https://other.example"]));
    // Not isolated: rendered under a different origin than declared.
    Assert.False(UiHost.IsIsolatedUnderDedicatedOrigin("https://ui.example", "https://elsewhere.example", []));
    // Not isolated: the declared origin is shared with another UI surface.
    Assert.False(UiHost.IsIsolatedUnderDedicatedOrigin("https://ui.example", "https://ui.example", ["https://ui.example"]));
    // No declared domain ⇒ no isolation constraint applies.
    Assert.True(UiHost.IsIsolatedUnderDedicatedOrigin(null, "https://anywhere.example", ["https://anywhere.example"]));
  }
}
