using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for the S41 server-side UI predicates, gating, and visibility logic (spec
/// §26.1–§26.4). Mirrors the TypeScript <c>ui.test.ts</c> acceptance criteria covering the verbatim MIME
/// type and <c>ui://</c> scheme checks, host-advertisement reading, server gating (R-26.2-f/g), the
/// <c>_meta.ui</c> visibility model with the <c>["app"]</c>-only hide rule (R-26.3-e/f), the
/// negotiation-aware read (R-26.3-g), the CSP/permission helpers, and the UI-resource builders.
/// </summary>
public sealed class UiVisibilityTests
{
  private const string ExtId = UiResource.ExtensionId;

  /// <summary>A host extensions map that conformingly advertises UI rendering.</summary>
  private static JsonObject RenderingMap() => new()
  {
    [ExtId] = new JsonObject { ["mimeTypes"] = new JsonArray(UiResource.MimeType) },
  };

  // ── §26.2 MIME type & ui:// scheme (AC-41.15, AC-41.22, AC-41.30) ──

  [Theory]
  [InlineData("text/html;profile=mcp-app", true)]
  [InlineData("text/html; profile=mcp-app", false)] // extra space
  [InlineData("TEXT/HTML;PROFILE=MCP-APP", false)] // wrong case
  [InlineData("text/html", false)]
  public void Is_ui_mime_type_matches_byte_exact_and_case_sensitive(string mime, bool expected)
  {
    Assert.Equal(expected, Ui.IsUiMimeType(mime));
  }

  [Theory]
  [InlineData("ui://x/y.html", true)]
  [InlineData("ui://anything/at/all?q=1", true)]
  [InlineData("https://example.com/x.html", false)]
  [InlineData("UI://x", false)]
  public void Is_ui_resource_uri_checks_scheme_only(string uri, bool expected)
  {
    Assert.Equal(expected, Ui.IsUiResourceUri(uri));
  }

  // ── §26.2 host capability shape & rendering advertisement (AC-41.14, AC-41.15, AC-41.16) ──

  [Fact]
  public void Capability_renders_ui_requires_exact_mime_type()
  {
    Assert.True(Ui.CapabilityRendersUi(JsonNode.Parse($$"""{ "mimeTypes": ["{{UiResource.MimeType}}"] }""")));
    Assert.False(Ui.CapabilityRendersUi(JsonNode.Parse("""{ "mimeTypes": ["text/html"] }""")));
    Assert.False(Ui.CapabilityRendersUi(JsonNode.Parse("""{ "mimeTypes": ["text/html; profile=mcp-app"] }""")));
    Assert.False(Ui.CapabilityRendersUi(JsonNode.Parse("""{ }""")));
  }

  [Fact]
  public void Is_ui_host_extension_capability_requires_mime_types_array()
  {
    Assert.True(Ui.IsUiHostExtensionCapability(JsonNode.Parse("""{ "mimeTypes": [] }""")));
    Assert.False(Ui.IsUiHostExtensionCapability(JsonNode.Parse("""{ }""")));
    Assert.False(Ui.IsUiHostExtensionCapability(JsonNode.Parse("""{ "mimeTypes": "x" }""")));
  }

  [Fact]
  public void Build_ui_host_extension_capability_always_includes_ui_mime_deduped()
  {
    var cap = Ui.BuildUiHostExtensionCapability(["text/html", UiResource.MimeType]);
    Assert.Equal(2, cap.MimeTypes.Count);
    Assert.Equal(UiResource.MimeType, cap.MimeTypes[0]);
    Assert.Contains("text/html", cap.MimeTypes);
  }

  [Fact]
  public void May_server_declare_ui_only_when_host_advertises_required_mime()
  {
    Assert.True(Ui.MayServerDeclareUi(RenderingMap()));
    Assert.True(Ui.MayServerExpectRendering(RenderingMap()));
    Assert.False(Ui.MayServerDeclareUi(new JsonObject { [ExtId] = new JsonObject { ["mimeTypes"] = new JsonArray("text/html") } }));
    Assert.False(Ui.MayServerDeclareUi(new JsonObject()));
  }

  [Fact]
  public void Request_advertises_ui_rendering_reads_nested_client_capabilities()
  {
    var meta = new JsonObject
    {
      [MetaKeys.ClientCapabilities] = new JsonObject { ["extensions"] = RenderingMap() },
    };
    Assert.True(Ui.RequestAdvertisesUiRendering(meta));
    Assert.False(Ui.RequestAdvertisesUiRendering(new JsonObject { [MetaKeys.ClientCapabilities] = new JsonObject { ["extensions"] = new JsonObject() } }));
    Assert.False(Ui.RequestAdvertisesUiRendering(new JsonObject()));
  }

  // ── §26.2 activation & acknowledgement (AC-41.11, AC-41.20) ──

  [Fact]
  public void Ui_extension_active_only_when_both_sides_advertise()
  {
    Assert.False(Ui.IsUiExtensionActive(new JsonObject(), new JsonObject()));
    var both = new JsonObject { [ExtId] = new JsonObject() };
    Assert.True(Ui.IsUiExtensionActive(both, both));
  }

  [Fact]
  public void Server_acknowledgement_round_trips()
  {
    var ack = Ui.BuildServerUiAcknowledgement();
    Assert.True(ack.ContainsKey(ExtId));
    Assert.True(Ui.ServerAcknowledgesUi(ack));
    Assert.False(Ui.ServerAcknowledgesUi(new JsonObject()));
  }

  // ── §26.3 ToolUiMeta extraction & negotiation gate (AC-41.18, AC-41.19, AC-41.27) ──

  [Fact]
  public void Get_tool_ui_meta_returns_null_for_missing_or_malformed_declarations()
  {
    Assert.Null(Ui.GetToolUiMeta(JsonNode.Parse("""{ }""")));
    Assert.Null(Ui.GetToolUiMeta(JsonNode.Parse("""{ "_meta": {} }""")));
    Assert.Null(Ui.GetToolUiMeta(JsonNode.Parse("""{ "_meta": { "ui": { "resourceUri": "https://x" } } }""")));
    Assert.Null(Ui.GetToolUiMeta(null));
  }

  [Fact]
  public void Get_tool_ui_meta_extracts_a_well_formed_declaration()
  {
    var meta = Ui.GetToolUiMeta(JsonNode.Parse("""{ "_meta": { "ui": { "resourceUri": "ui://weather" } } }"""));
    Assert.NotNull(meta);
    Assert.Equal("ui://weather", meta!.ResourceUri);
  }

  [Fact]
  public void Read_tool_ui_meta_ignores_the_key_when_extension_inactive()
  {
    var tool = JsonNode.Parse("""{ "_meta": { "ui": { "resourceUri": "ui://x" } } }""");
    Assert.Null(Ui.ReadToolUiMeta(tool, [])); // inactive ⇒ ignored (R-26.3-g)
    var read = Ui.ReadToolUiMeta(tool, [ExtId]);
    Assert.NotNull(read);
    Assert.Equal("ui://x", read!.ResourceUri);
  }

  // ── §26.3 visibility (AC-41.24, AC-41.25, AC-41.26) ──

  [Fact]
  public void Effective_visibility_defaults_to_model_and_app()
  {
    Assert.Equal(new[] { UiVisibility.Model, UiVisibility.App }, Ui.EffectiveVisibility(new ToolUiMeta { ResourceUri = "ui://x" }));
    Assert.Equal(new[] { UiVisibility.App }, Ui.EffectiveVisibility(new ToolUiMeta { ResourceUri = "ui://x", Visibility = [UiVisibility.App] }));
  }

  [Fact]
  public void Host_should_reject_ui_originated_call_when_visibility_excludes_app()
  {
    Assert.True(Ui.HostShouldRejectUiOriginatedCall(new ToolUiMeta { ResourceUri = "ui://x", Visibility = [UiVisibility.Model] }));
    Assert.False(Ui.HostShouldRejectUiOriginatedCall(new ToolUiMeta { ResourceUri = "ui://x", Visibility = [UiVisibility.Model, UiVisibility.App] }));
    // Default visibility includes "app".
    Assert.False(Ui.HostShouldRejectUiOriginatedCall(new ToolUiMeta { ResourceUri = "ui://x" }));
    // A tool with no UI declaration was never UI-exposed ⇒ reject.
    Assert.True(Ui.HostShouldRejectUiOriginatedCall(null));
  }

  [Fact]
  public void App_only_tool_is_hidden_from_the_model_list_but_remains_app_invokable()
  {
    var appOnly = JsonNode.Parse("""{ "name": "a", "_meta": { "ui": { "resourceUri": "ui://a", "visibility": ["app"] } } }""");
    var modelTool = JsonNode.Parse("""{ "name": "m", "_meta": { "ui": { "resourceUri": "ui://m", "visibility": ["model"] } } }""");
    Assert.False(Ui.IsVisibleToModel(new ToolUiMeta { ResourceUri = "ui://a", Visibility = [UiVisibility.App] }));

    var visible = Ui.ToolsVisibleToModel([appOnly, modelTool], [ExtId]);
    Assert.Single(visible);
    Assert.Equal("m", visible[0]!["name"]!.GetValue<string>());

    Assert.True(Ui.IsAppInvokable(new ToolUiMeta { ResourceUri = "ui://a", Visibility = [UiVisibility.App] }));
  }

  [Fact]
  public void Tools_visible_to_model_treats_all_tools_as_visible_when_inactive()
  {
    var tool = JsonNode.Parse("""{ "name": "a", "_meta": { "ui": { "resourceUri": "ui://a", "visibility": ["app"] } } }""");
    // Empty active set ⇒ extension inactive ⇒ key ignored, tool stays visible.
    var visible = Ui.ToolsVisibleToModel([tool], []);
    Assert.Single(visible);
  }

  [Fact]
  public void A_tool_with_no_ui_declaration_is_always_model_visible()
  {
    var plain = JsonNode.Parse("""{ "name": "t" }""");
    var withUi = JsonNode.Parse("""{ "name": "t", "_meta": { "ui": { "resourceUri": "ui://t" } } }""");
    Assert.Single(Ui.ToolsVisibleToModel([plain], [ExtId]));
    Assert.Single(Ui.ToolsVisibleToModel([withUi], [ExtId]));
  }

  // ── §26.4 ui:// read uri & resource contents (AC-41.29, AC-41.32, AC-41.33) ──

  [Fact]
  public void Ui_resource_read_uri_returns_the_exact_opaque_uri()
  {
    Assert.Equal("ui://anything/at/all?q=1",
      Ui.UiResourceReadUri(new ToolUiMeta { ResourceUri = "ui://anything/at/all?q=1" }));
    Assert.Null(Ui.UiResourceReadUri(null));
  }

  [Fact]
  public void Is_ui_resource_contents_requires_exact_mime_and_text_xor_blob()
  {
    Assert.True(Ui.IsUiResourceContents(JsonNode.Parse($$"""{ "uri": "ui://x", "mimeType": "{{UiResource.MimeType}}", "text": "<html></html>" }""")));
    Assert.True(Ui.IsUiResourceContents(JsonNode.Parse($$"""{ "uri": "ui://x", "mimeType": "{{UiResource.MimeType}}", "blob": "AAAA" }""")));
    // wrong mime
    Assert.False(Ui.IsUiResourceContents(JsonNode.Parse("""{ "uri": "ui://x", "mimeType": "text/html", "text": "a" }""")));
    // both text and blob
    Assert.False(Ui.IsUiResourceContents(JsonNode.Parse($$"""{ "uri": "ui://x", "mimeType": "{{UiResource.MimeType}}", "text": "a", "blob": "AAAA" }""")));
    // non-ui uri
    Assert.False(Ui.IsUiResourceContents(JsonNode.Parse($$"""{ "uri": "https://x", "mimeType": "{{UiResource.MimeType}}", "text": "a" }""")));
  }

  [Fact]
  public void Get_resource_ui_meta_extracts_hints_or_returns_null()
  {
    var contents = JsonNode.Parse($$"""
      { "uri": "ui://x", "mimeType": "{{UiResource.MimeType}}", "text": "<html></html>",
        "_meta": { "ui": { "csp": { "connectDomains": ["https://api.example.com"] }, "prefersBorder": true } } }
      """);
    var hints = Ui.GetResourceUiMeta(contents);
    Assert.NotNull(hints);
    Assert.True(hints!.PrefersBorder);
    Assert.Equal("https://api.example.com", Assert.Single(hints.Csp!.ConnectDomains!));

    Assert.Null(Ui.GetResourceUiMeta(JsonNode.Parse($$"""{ "uri": "ui://x", "mimeType": "{{UiResource.MimeType}}", "text": "a" }""")));
  }

  [Fact]
  public void Malformed_resource_hints_make_the_contents_entry_invalid()
  {
    var contents = JsonNode.Parse($$"""
      { "uri": "ui://x", "mimeType": "{{UiResource.MimeType}}", "text": "a", "_meta": { "ui": { "csp": { "connectDomains": "not-array" } } } }
      """);
    Assert.False(Ui.IsUiResourceContents(contents));
  }

  // ── §26.4 builders (AC-41.32, wire shape) ──

  [Fact]
  public void Build_ui_resource_contents_assembles_the_wire_shape()
  {
    var contents = Ui.BuildUiResourceContents(
      "ui://get-time/mcp-app.html",
      text: "<!DOCTYPE html>",
      ui: new ResourceUiMeta { Permissions = new UiPermissions { ClipboardWrite = new JsonObject() }, PrefersBorder = true });

    Assert.Equal(UiResource.MimeType, contents["mimeType"]!.GetValue<string>());
    var meta = contents["_meta"]!["ui"]!;
    Assert.Equal("{}", meta["permissions"]!["clipboardWrite"]!.ToJsonString());
    Assert.True(meta["prefersBorder"]!.GetValue<bool>());

    var result = Ui.BuildUiResourceReadResult(contents, 0, "private");
    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal(0, result["ttlMs"]!.GetValue<long>());
    Assert.Equal("private", result["cacheScope"]!.GetValue<string>());
    Assert.Single(result["contents"]!.AsArray());
  }

  [Fact]
  public void Build_ui_resource_contents_rejects_non_ui_uri_and_bad_text_blob_combos()
  {
    Assert.Throws<ArgumentException>(() => Ui.BuildUiResourceContents("https://x", text: "a"));
    Assert.Throws<ArgumentException>(() => Ui.BuildUiResourceContents("ui://x")); // neither text nor blob
    Assert.Throws<ArgumentException>(() => Ui.BuildUiResourceContents("ui://x", text: "a", blob: "AAAA"));
    Assert.Throws<ArgumentOutOfRangeException>(() =>
      Ui.BuildUiResourceReadResult(Ui.BuildUiResourceContents("ui://x", text: "a"), -1, "private"));
  }

  // ── §26.4 CSP (AC-41.34, AC-41.35, AC-41.36) ──

  [Fact]
  public void Csp_allows_only_listed_origins_per_directive()
  {
    var csp = new UiContentSecurityPolicy
    {
      ConnectDomains = ["https://c"],
      ResourceDomains = ["https://r"],
      FrameDomains = ["https://f"],
      BaseUriDomains = ["https://b"],
    };
    Assert.True(Ui.CspAllowsOrigin(csp, Ui.UiCspDirective.ConnectDomains, "https://c"));
    Assert.True(Ui.CspAllowsOrigin(csp, Ui.UiCspDirective.ResourceDomains, "https://r"));
    Assert.True(Ui.CspAllowsOrigin(csp, Ui.UiCspDirective.FrameDomains, "https://f"));
    Assert.True(Ui.CspAllowsOrigin(csp, Ui.UiCspDirective.BaseUriDomains, "https://b"));
  }

  [Fact]
  public void Csp_blocks_origins_not_listed_in_the_applicable_member()
  {
    var csp = new UiContentSecurityPolicy { ConnectDomains = ["https://allowed"] };
    Assert.False(Ui.CspAllowsOrigin(csp, Ui.UiCspDirective.ConnectDomains, "https://evil"));
    Assert.False(Ui.CspAllowsOrigin(csp, Ui.UiCspDirective.ResourceDomains, "https://allowed"));
  }

  [Fact]
  public void Csp_omitted_means_deny_by_default()
  {
    Assert.Same(Ui.DenyByDefaultCsp, Ui.ResolveCsp(null));
    Assert.Empty(Ui.DenyByDefaultCsp.ConnectDomains!);
    foreach (var directive in new[] { Ui.UiCspDirective.ConnectDomains, Ui.UiCspDirective.ResourceDomains, Ui.UiCspDirective.FrameDomains, Ui.UiCspDirective.BaseUriDomains })
    {
      Assert.False(Ui.CspAllowsOrigin(null, directive, "https://anything"));
    }
    var present = new UiContentSecurityPolicy { ConnectDomains = ["https://x"] };
    Assert.Same(present, Ui.ResolveCsp(present));
  }

  // ── §26.4 permissions (AC-41.37, AC-41.38, AC-41.39) ──

  [Fact]
  public void Requested_permissions_lists_present_members_in_spec_order()
  {
    var perms = new UiPermissions { Camera = new JsonObject(), ClipboardWrite = new JsonObject() };
    Assert.True(Ui.PermissionRequested(perms, Ui.UiPermissionName.Camera));
    Assert.True(Ui.PermissionRequested(perms, Ui.UiPermissionName.ClipboardWrite));
    Assert.Equal(new[] { Ui.UiPermissionName.Camera, Ui.UiPermissionName.ClipboardWrite }, Ui.RequestedPermissions(perms));
  }

  [Fact]
  public void Unrequested_permission_is_never_granted()
  {
    var perms = new UiPermissions { Camera = new JsonObject() };
    Assert.False(Ui.PermissionRequested(perms, Ui.UiPermissionName.Microphone));
    Assert.False(Ui.MayGrantPermission(perms, Ui.UiPermissionName.Microphone));
    Assert.False(Ui.MayGrantPermission(null, Ui.UiPermissionName.Camera));
    Assert.Empty(Ui.RequestedPermissions(null));
  }

  [Fact]
  public void Host_may_decline_a_requested_permission()
  {
    var perms = new UiPermissions { Camera = new JsonObject() };
    Assert.True(Ui.MayGrantPermission(perms, Ui.UiPermissionName.Camera));
    Assert.False(Ui.MayGrantPermission(perms, Ui.UiPermissionName.Camera, hostDeclines: true));
  }

  [Fact]
  public void Resource_ui_meta_is_validated_structurally()
  {
    Assert.True(Ui.IsResourceUiMeta(JsonNode.Parse("""{ "csp": {}, "permissions": {}, "domain": "x", "prefersBorder": false }""")));
    Assert.False(Ui.IsResourceUiMeta(JsonNode.Parse("""{ "prefersBorder": "yes" }""")));
    Assert.False(Ui.IsResourceUiMeta(JsonValue.Create("x")));
  }
}
