using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape tests for the Subscriptions transport utility (spec §10) and the
/// Interactive User-Interface extension (spec §26): the <see cref="SubscriptionFilter"/> selective
/// emission rule, the listen-request and acknowledgement params, the reserved
/// <see cref="MetaKeys.SubscriptionId"/> key, the <see cref="UiResource"/> constants, the
/// <see cref="ToolUiMeta"/> / <see cref="ResourceUiMeta"/> shapes, the <see cref="UiVisibility"/>
/// enum, and the <see cref="UiHostExtensionCapability"/>. All assertions cover REAL serialization
/// behavior of <see cref="McpJson"/>.
/// </summary>
public sealed class SubscriptionsUiWireTests
{
  // ── SubscriptionFilter: only requested kinds serialize ──

  [Fact]
  public void Subscription_filter_emits_only_tools_list_changed()
  {
    var json = McpJson.Serialize(new SubscriptionFilter { ToolsListChanged = true });
    Assert.Contains("\"toolsListChanged\":true", json);
    Assert.DoesNotContain("promptsListChanged", json);
    Assert.DoesNotContain("resourcesListChanged", json);
    Assert.DoesNotContain("resourceSubscriptions", json);
  }

  [Fact]
  public void Subscription_filter_emits_only_prompts_list_changed()
  {
    var json = McpJson.Serialize(new SubscriptionFilter { PromptsListChanged = true });
    Assert.Contains("\"promptsListChanged\":true", json);
    Assert.DoesNotContain("toolsListChanged", json);
    Assert.DoesNotContain("resourcesListChanged", json);
  }

  [Fact]
  public void Subscription_filter_emits_only_resources_list_changed()
  {
    var json = McpJson.Serialize(new SubscriptionFilter { ResourcesListChanged = true });
    Assert.Contains("\"resourcesListChanged\":true", json);
    Assert.DoesNotContain("toolsListChanged", json);
    Assert.DoesNotContain("promptsListChanged", json);
  }

  [Fact]
  public void Subscription_filter_emits_only_resource_subscriptions()
  {
    var json = McpJson.Serialize(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] });
    Assert.Contains("\"resourceSubscriptions\":[\"docs://readme\"]", json);
    Assert.DoesNotContain("toolsListChanged", json);
    Assert.DoesNotContain("promptsListChanged", json);
  }

  [Fact]
  public void Subscription_filter_emits_nothing_when_all_absent()
  {
    var json = McpJson.Serialize(new SubscriptionFilter());
    Assert.Equal("{}", json);
  }

  [Fact]
  public void Subscription_filter_false_flags_still_serialize_as_false()
  {
    // An explicit false is a present member and is emitted (only null is omitted).
    var json = McpJson.Serialize(new SubscriptionFilter { ToolsListChanged = false });
    Assert.Contains("\"toolsListChanged\":false", json);
  }

  [Fact]
  public void Subscription_filter_emits_multiple_requested_kinds_together()
  {
    var json = McpJson.Serialize(new SubscriptionFilter
    {
      ToolsListChanged = true,
      ResourceSubscriptions = ["a://b"],
    });
    Assert.Contains("\"toolsListChanged\":true", json);
    Assert.Contains("\"resourceSubscriptions\":[\"a://b\"]", json);
    Assert.DoesNotContain("promptsListChanged", json);
  }

  [Fact]
  public void Subscription_filter_round_trips_requested_kinds()
  {
    var json = McpJson.Serialize(new SubscriptionFilter
    {
      PromptsListChanged = true,
      ResourceSubscriptions = ["x://1", "x://2"],
    });
    var back = McpJson.Deserialize<SubscriptionFilter>(json)!;
    Assert.True(back.PromptsListChanged);
    Assert.Null(back.ToolsListChanged);
    Assert.Equal(2, back.ResourceSubscriptions!.Count);
  }

  // ── SubscriptionsListenRequestParams ──

  [Fact]
  public void Listen_request_params_wrap_the_filter_under_notifications()
  {
    var json = McpJson.Serialize(new SubscriptionsListenRequestParams
    {
      Notifications = new SubscriptionFilter { ToolsListChanged = true },
    });
    Assert.Contains("\"notifications\":{\"toolsListChanged\":true}", json);
  }

  [Fact]
  public void Listen_request_method_constant_exists_on_methods_registry()
  {
    Assert.Equal("subscriptions/listen", McpMethods.SubscriptionsListen);
  }

  [Fact]
  public void Listen_request_params_round_trip()
  {
    var json = McpJson.Serialize(new SubscriptionsListenRequestParams
    {
      Notifications = new SubscriptionFilter { ResourcesListChanged = true },
    });
    var back = McpJson.Deserialize<SubscriptionsListenRequestParams>(json)!;
    Assert.True(back.Notifications.ResourcesListChanged);
  }

  // ── SubscriptionsAcknowledgedNotificationParams ──

  [Fact]
  public void Acknowledged_notification_params_echo_the_honored_filter()
  {
    var json = McpJson.Serialize(new SubscriptionsAcknowledgedNotificationParams
    {
      Notifications = new SubscriptionFilter { ToolsListChanged = true, PromptsListChanged = true },
    });
    Assert.Contains("\"notifications\":{", json);
    Assert.Contains("\"toolsListChanged\":true", json);
    Assert.Contains("\"promptsListChanged\":true", json);
  }

  [Fact]
  public void Acknowledged_notification_method_constant_exists_on_methods_registry()
  {
    Assert.Equal("notifications/subscriptions/acknowledged", McpMethods.NotificationsSubscriptionsAcknowledged);
  }

  [Fact]
  public void Acknowledged_notification_params_round_trip()
  {
    var json = McpJson.Serialize(new SubscriptionsAcknowledgedNotificationParams
    {
      Notifications = new SubscriptionFilter { ResourceSubscriptions = ["r://1"] },
    });
    var back = McpJson.Deserialize<SubscriptionsAcknowledgedNotificationParams>(json)!;
    Assert.Single(back.Notifications.ResourceSubscriptions!);
  }

  // ── MetaKeys.SubscriptionId ──

  [Fact]
  public void Subscription_id_meta_key_is_the_namespaced_constant()
  {
    Assert.Equal("io.modelcontextprotocol/subscriptionId", MetaKeys.SubscriptionId);
  }

  // ── UiResource constants ──

  [Fact]
  public void Ui_resource_mime_type_is_the_exact_profile_string()
  {
    Assert.Equal("text/html;profile=mcp-app", UiResource.MimeType);
  }

  [Fact]
  public void Ui_resource_extension_id_equals_the_ui_meta_key()
  {
    Assert.Equal(MetaKeys.UiExtension, UiResource.ExtensionId);
    Assert.Equal("io.modelcontextprotocol/ui", UiResource.ExtensionId);
  }

  // ── §26.2/§26.4 MIME & ui:// scheme predicates (behavior, not just wire) ──

  [Fact]
  public void Is_ui_mime_type_demands_the_byte_exact_profile_string()
  {
    Assert.True(Ui.IsUiMimeType("text/html;profile=mcp-app"));
    Assert.False(Ui.IsUiMimeType("text/html; profile=mcp-app")); // extra space
    Assert.False(Ui.IsUiMimeType("TEXT/HTML;PROFILE=MCP-APP")); // wrong case
  }

  [Fact]
  public void Is_ui_resource_uri_checks_only_the_ui_scheme()
  {
    Assert.True(Ui.IsUiResourceUri("ui://weather"));
    Assert.False(Ui.IsUiResourceUri("https://example.com/x"));
    Assert.False(Ui.IsUiResourceUri(null));
  }

  [Fact]
  public void Server_may_declare_ui_only_against_an_advertising_host()
  {
    var advertising = new JsonObject
    {
      [UiResource.ExtensionId] = new JsonObject { ["mimeTypes"] = new JsonArray(UiResource.MimeType) },
    };
    Assert.True(Ui.MayServerDeclareUi(advertising));
    Assert.False(Ui.MayServerDeclareUi(new JsonObject()));
  }

  // ── UiVisibility ──

  [Theory]
  [InlineData(UiVisibility.Model, "model")]
  [InlineData(UiVisibility.App, "app")]
  public void Ui_visibility_uses_lowercase_wire_value(UiVisibility visibility, string wire)
  {
    Assert.Equal($"\"{wire}\"", McpJson.Serialize(visibility));
  }

  [Theory]
  [InlineData("\"model\"", UiVisibility.Model)]
  [InlineData("\"app\"", UiVisibility.App)]
  public void Ui_visibility_deserializes_from_wire_value(string raw, UiVisibility expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<UiVisibility>(raw));
  }

  // ── ToolUiMeta ──

  [Fact]
  public void Tool_ui_meta_emits_resource_uri_only_when_visibility_absent()
  {
    var json = McpJson.Serialize(new ToolUiMeta { ResourceUri = "ui://weather" });
    Assert.Contains("\"resourceUri\":\"ui://weather\"", json);
    Assert.DoesNotContain("\"visibility\"", json);
  }

  [Fact]
  public void Tool_ui_meta_emits_visibility_array_when_present()
  {
    var json = McpJson.Serialize(new ToolUiMeta
    {
      ResourceUri = "ui://x",
      Visibility = [UiVisibility.Model, UiVisibility.App],
    });
    Assert.Contains("\"visibility\":[\"model\",\"app\"]", json);
  }

  [Fact]
  public void Tool_ui_meta_round_trips_resource_uri_and_visibility()
  {
    var json = McpJson.Serialize(new ToolUiMeta
    {
      ResourceUri = "ui://panel",
      Visibility = [UiVisibility.App],
    });
    var back = McpJson.Deserialize<ToolUiMeta>(json)!;
    Assert.Equal("ui://panel", back.ResourceUri);
    Assert.Equal(UiVisibility.App, Assert.Single(back.Visibility!));
  }

  // ── UiHostExtensionCapability ──

  [Fact]
  public void Ui_host_capability_emits_mime_types_including_the_profile_string()
  {
    var json = McpJson.Serialize(new UiHostExtensionCapability { MimeTypes = [UiResource.MimeType] });
    Assert.Contains("\"mimeTypes\":[\"text/html;profile=mcp-app\"]", json);
  }

  [Fact]
  public void Ui_host_capability_round_trips_mime_types()
  {
    var json = McpJson.Serialize(new UiHostExtensionCapability
    {
      MimeTypes = [UiResource.MimeType, "text/html"],
    });
    var back = McpJson.Deserialize<UiHostExtensionCapability>(json)!;
    Assert.Equal(2, back.MimeTypes.Count);
    Assert.Contains(UiResource.MimeType, back.MimeTypes);
  }

  // ── ResourceUiMeta ──

  [Fact]
  public void Resource_ui_meta_omits_all_fields_when_absent()
  {
    var json = McpJson.Serialize(new ResourceUiMeta());
    Assert.Equal("{}", json);
  }

  [Fact]
  public void Resource_ui_meta_emits_domain_and_prefers_border()
  {
    var json = McpJson.Serialize(new ResourceUiMeta { Domain = "https://ui.example", PrefersBorder = true });
    Assert.Contains("\"domain\":\"https://ui.example\"", json);
    Assert.Contains("\"prefersBorder\":true", json);
  }

  [Fact]
  public void Resource_ui_meta_emits_csp_with_only_requested_domain_members()
  {
    var json = McpJson.Serialize(new ResourceUiMeta
    {
      Csp = new UiContentSecurityPolicy { ConnectDomains = ["https://api.example"] },
    });
    Assert.Contains("\"connectDomains\":[\"https://api.example\"]", json);
    Assert.DoesNotContain("resourceDomains", json);
    Assert.DoesNotContain("frameDomains", json);
    Assert.DoesNotContain("baseUriDomains", json);
  }

  [Fact]
  public void Resource_ui_meta_emits_requested_permissions_as_empty_objects()
  {
    var json = McpJson.Serialize(new ResourceUiMeta
    {
      Permissions = new UiPermissions { Camera = new JsonObject(), ClipboardWrite = new JsonObject() },
    });
    Assert.Contains("\"camera\":{}", json);
    Assert.Contains("\"clipboardWrite\":{}", json);
    Assert.DoesNotContain("microphone", json);
    Assert.DoesNotContain("geolocation", json);
  }

  [Fact]
  public void Resource_ui_meta_round_trips_csp_and_permissions()
  {
    var json = McpJson.Serialize(new ResourceUiMeta
    {
      Csp = new UiContentSecurityPolicy { FrameDomains = ["https://frame.example"] },
      Permissions = new UiPermissions { Microphone = new JsonObject() },
      PrefersBorder = false,
    });
    var back = McpJson.Deserialize<ResourceUiMeta>(json)!;
    Assert.Equal("https://frame.example", Assert.Single(back.Csp!.FrameDomains!));
    Assert.NotNull(back.Permissions!.Microphone);
    Assert.Null(back.Permissions.Camera);
    Assert.False(back.PrefersBorder);
  }
}
