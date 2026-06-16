using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral coverage for the server-to-client subscription helpers (spec §10) that the wire-shape
/// suite does not exercise (S16): the <c>io.modelcontextprotocol/subscriptionId</c> correlation routing
/// used on the stdio shared channel (<see cref="SubscriptionRegistry.Route"/> /
/// <see cref="SubscriptionRegistry.ReadSubscriptionId"/>, §10.4, R-10.4-c/d), sub-resource container
/// coverage (<see cref="Subscriptions.UriCoveredBySubscription"/> /
/// <see cref="Subscriptions.MayDeliverResourceUpdate"/>, §10.5, R-10.5-j/k), the §10.6 stream-boundary
/// classification and violation detectors, absolute-URI validation (§10.2, R-10.2-i), and the
/// §10.3 acknowledgement-arrives-first lifecycle (R-10.3-a/b). The pure helpers are validated directly.
/// </summary>
public sealed class SubscriptionCoverageTests
{
  // ════════════════════════ §10.4 — subscriptionId correlation routing (R-10.4-c/d) ════════════════════════

  /// <summary>Builds a notification params object carrying the subscription id under <c>_meta</c>.</summary>
  private static JsonObject WithSubscriptionId(string id) =>
    new() { ["_meta"] = new JsonObject { [MetaKeys.SubscriptionId] = id } };

  [Fact]
  public void Read_subscription_id_extracts_the_namespaced_meta_value()
  {
    Assert.Equal("sub-7", SubscriptionRegistry.ReadSubscriptionId(WithSubscriptionId("sub-7")));
  }

  [Fact]
  public void Read_subscription_id_is_null_when_meta_absent()
  {
    Assert.Null(SubscriptionRegistry.ReadSubscriptionId(new JsonObject { ["uri"] = "docs://x" }));
  }

  [Fact]
  public void Read_subscription_id_is_null_when_params_null()
  {
    Assert.Null(SubscriptionRegistry.ReadSubscriptionId(null));
  }

  [Fact]
  public void Read_subscription_id_is_null_when_value_is_not_a_string()
  {
    // R-10.4-f: the key value MUST be a string; a non-string yields null (it does not throw).
    var prms = new JsonObject { ["_meta"] = new JsonObject { [MetaKeys.SubscriptionId] = 42 } };
    Assert.Null(SubscriptionRegistry.ReadSubscriptionId(prms));
  }

  [Fact]
  public void Read_subscription_id_lookup_is_case_sensitive_and_verbatim()
  {
    // R-10.4-a: the lookup is exact; a differently-cased key is NOT the subscription-id key.
    var prms = new JsonObject { ["_meta"] = new JsonObject { ["io.modelcontextprotocol/SubscriptionId"] = "x" } };
    Assert.Null(SubscriptionRegistry.ReadSubscriptionId(prms));
  }

  [Fact]
  public void Route_directs_a_notification_to_the_owning_subscription_on_a_shared_channel()
  {
    // On stdio every subscription shares one channel, so routing is purely by subscriptionId (§10.4).
    var registry = new SubscriptionRegistry();
    var a = new Subscription(new RequestId(1L), new SubscriptionFilter { ToolsListChanged = true });
    var b = new Subscription(new RequestId(2L), new SubscriptionFilter { ToolsListChanged = true });
    registry.Add(a);
    registry.Add(b);

    var routedToA = registry.Route(WithSubscriptionId(a.SubscriptionId));
    var routedToB = registry.Route(WithSubscriptionId(b.SubscriptionId));

    Assert.Same(a, routedToA);
    Assert.Same(b, routedToB);
  }

  [Fact]
  public void Route_returns_null_for_an_unknown_or_missing_subscription_id()
  {
    var registry = new SubscriptionRegistry();
    registry.Add(new Subscription(new RequestId(1L), new SubscriptionFilter { ToolsListChanged = true }));

    Assert.Null(registry.Route(WithSubscriptionId("not-active")));
    Assert.Null(registry.Route(new JsonObject { ["uri"] = "docs://x" })); // no _meta id at all
  }

  [Fact]
  public void Removing_a_subscription_makes_routing_to_it_return_null()
  {
    var registry = new SubscriptionRegistry();
    var sub = new Subscription(new RequestId(5L), new SubscriptionFilter { ToolsListChanged = true });
    registry.Add(sub);
    Assert.Same(sub, registry.Route(WithSubscriptionId(sub.SubscriptionId)));

    Assert.True(registry.Remove(sub.SubscriptionId, SubscriptionCloseReason.ClientCancel));
    Assert.Null(registry.Route(WithSubscriptionId(sub.SubscriptionId)));
    Assert.Equal(0, registry.Count);
  }

  [Fact]
  public void Adding_a_duplicate_subscription_id_throws()
  {
    var registry = new SubscriptionRegistry();
    registry.Add(new Subscription(new RequestId(1L), new SubscriptionFilter()));
    Assert.Throws<InvalidOperationException>(() =>
      registry.Add(new Subscription(new RequestId(1L), new SubscriptionFilter())));
  }

  // ════════════════════════ §10.5 — sub-resource container coverage (R-10.5-j/k) ════════════════════════

  [Theory]
  [InlineData("file:///dir/file.txt", "file:///dir", true)]      // descendant of a container
  [InlineData("file:///dir/sub/deep.txt", "file:///dir", true)] // deeper descendant
  [InlineData("file:///dir/file.txt", "file:///dir/", true)]    // container with trailing slash
  [InlineData("file:///dir", "file:///dir", true)]              // exact match
  [InlineData("file:///directory/x", "file:///dir", false)]    // bare prefix, NOT a path boundary
  [InlineData("file:///other/file.txt", "file:///dir", false)] // different subtree
  [InlineData("http://host/a/b", "file:///a", false)]          // different scheme
  [InlineData("file://hostA/a/b", "file://hostB/a", false)]    // different authority
  public void Uri_covered_by_subscription_honors_path_boundaries(string updated, string subscribed, bool expected)
  {
    Assert.Equal(expected, Subscriptions.UriCoveredBySubscription(updated, subscribed));
  }

  [Fact]
  public void May_deliver_resource_update_when_any_subscribed_uri_covers_it()
  {
    string[] subscribed = ["docs://readme", "file:///dir"];
    Assert.True(Subscriptions.MayDeliverResourceUpdate("docs://readme", subscribed));        // exact
    Assert.True(Subscriptions.MayDeliverResourceUpdate("file:///dir/child.txt", subscribed)); // container
    Assert.False(Subscriptions.MayDeliverResourceUpdate("docs://other", subscribed));         // unlisted
  }

  [Fact]
  public void May_deliver_resource_update_is_false_when_no_subscriptions()
  {
    Assert.False(Subscriptions.MayDeliverResourceUpdate("docs://x", null));
    Assert.False(Subscriptions.MayDeliverResourceUpdate("docs://x", []));
  }

  [Fact]
  public void May_emit_change_notification_applies_container_coverage_for_resource_updates()
  {
    // R-10.5-l + R-10.5-j: a resources/updated for a sub-resource of a subscribed container is emittable.
    var acknowledged = new SubscriptionFilter { ResourceSubscriptions = ["file:///dir"] };
    Assert.True(Subscriptions.MayEmitChangeNotification(
      McpMethods.NotificationsResourcesUpdated, acknowledged, "file:///dir/file.txt"));
    Assert.False(Subscriptions.MayEmitChangeNotification(
      McpMethods.NotificationsResourcesUpdated, acknowledged, "file:///elsewhere/file.txt"));
  }

  // ════════════════════════ §10.2 — absolute-URI validation (R-10.2-i) ════════════════════════

  [Theory]
  [InlineData("file:///dir/file.txt", true)]
  [InlineData("https://example.com/x", true)]
  [InlineData("docs://readme", true)]
  [InlineData("custom+scheme://x", true)]
  [InlineData("/relative/path", false)]     // no scheme
  [InlineData("readme", false)]             // bare reference
  [InlineData("://noscheme", false)]        // empty scheme
  [InlineData("1http://x", false)]          // scheme MUST start with ALPHA
  [InlineData("", false)]
  [InlineData(null, false)]
  public void Is_absolute_uri_matches_rfc3986_scheme_rule(string? value, bool expected)
  {
    Assert.Equal(expected, Subscriptions.IsAbsoluteUri(value));
  }

  // ════════════════════════ §10.6 — stream-boundary classification & violation detection ════════════════════════

  [Theory]
  [InlineData(McpMethods.NotificationsToolsListChanged, NotificationStreamPlacement.Subscription)]
  [InlineData(McpMethods.NotificationsPromptsListChanged, NotificationStreamPlacement.Subscription)]
  [InlineData(McpMethods.NotificationsResourcesListChanged, NotificationStreamPlacement.Subscription)]
  [InlineData(McpMethods.NotificationsResourcesUpdated, NotificationStreamPlacement.Subscription)]
  [InlineData(McpMethods.NotificationsProgress, NotificationStreamPlacement.RequestScoped)]
  [InlineData(McpMethods.NotificationsMessage, NotificationStreamPlacement.RequestScoped)]
  [InlineData("notifications/cancelled", NotificationStreamPlacement.Neither)]
  [InlineData("notifications/unknown", NotificationStreamPlacement.Neither)]
  public void Classify_notification_stream_places_each_kind_on_its_boundary(string method, NotificationStreamPlacement expected)
  {
    Assert.Equal(expected, Subscriptions.ClassifyNotificationStream(method));
  }

  [Theory]
  [InlineData(McpMethods.NotificationsProgress, true)]  // request-scoped MUST NOT appear on a subscription stream
  [InlineData(McpMethods.NotificationsMessage, true)]
  [InlineData(McpMethods.NotificationsToolsListChanged, false)]
  [InlineData(McpMethods.NotificationsResourcesUpdated, false)]
  public void Is_violation_on_subscription_stream_flags_request_scoped_kinds(string method, bool expected)
  {
    // R-10.6-b/e/g: receiving progress/logging on a subscription stream is a protocol violation.
    Assert.Equal(expected, Subscriptions.IsViolationOnSubscriptionStream(method));
  }

  [Theory]
  [InlineData(McpMethods.NotificationsToolsListChanged, true)]  // change kinds MUST NOT appear on a request stream
  [InlineData(McpMethods.NotificationsPromptsListChanged, true)]
  [InlineData(McpMethods.NotificationsResourcesListChanged, true)]
  [InlineData(McpMethods.NotificationsResourcesUpdated, true)]
  [InlineData(McpMethods.NotificationsProgress, false)]
  [InlineData(McpMethods.NotificationsMessage, false)]
  public void Is_violation_on_request_stream_flags_change_kinds(string method, bool expected)
  {
    // R-10.6-d/f/g: receiving one of the four change kinds on a non-subscription response stream is a violation.
    Assert.Equal(expected, Subscriptions.IsViolationOnRequestStream(method));
  }

  [Fact]
  public void The_two_boundary_detectors_are_complementary_over_the_six_stream_kinds()
  {
    // A kind that violates the subscription boundary is exactly a request-scoped kind, and vice-versa;
    // the two detectors never both fire (or both stay silent) for any of the six classified kinds.
    foreach (var method in Subscriptions.ChangeNotificationMethods)
    {
      Assert.True(Subscriptions.IsViolationOnRequestStream(method));
      Assert.False(Subscriptions.IsViolationOnSubscriptionStream(method));
    }
    foreach (var method in Subscriptions.RequestScopedNotificationMethods)
    {
      Assert.True(Subscriptions.IsViolationOnSubscriptionStream(method));
      Assert.False(Subscriptions.IsViolationOnRequestStream(method));
    }
  }

  // ════════════════════════ §10.3 — acknowledgement arrives first (R-10.3-a/b) ════════════════════════

  [Fact]
  public void Subscription_starts_opening_and_acknowledge_transitions_to_active()
  {
    // The honored filter only echoes a kind the server supports, so declare the tools/list_changed
    // capability for the ack to carry it through.
    var sub = new Subscription(
      new RequestId(1L),
      new SubscriptionFilter { ToolsListChanged = true },
      new ServerCapabilities { Tools = new ToolsCapability { ListChanged = true } });
    Assert.Equal(SubscriptionState.Opening, sub.State);

    var ack = sub.Acknowledge();

    Assert.Equal(SubscriptionState.Active, sub.State);
    Assert.True(ack.Notifications.ToolsListChanged);
  }

  [Fact]
  public void May_emit_is_false_before_acknowledgement_and_true_after()
  {
    // R-10.3-a/b: no change notification may precede the acknowledgement; the ack is the single first
    // message and only then may matching change kinds flow.
    var sub = new Subscription(
      new RequestId(1L),
      new SubscriptionFilter { ToolsListChanged = true },
      new ServerCapabilities { Tools = new ToolsCapability { ListChanged = true } });

    Assert.False(sub.MayEmit(McpMethods.NotificationsToolsListChanged)); // still opening
    sub.Acknowledge();
    Assert.True(sub.MayEmit(McpMethods.NotificationsToolsListChanged));  // now active
  }

  [Fact]
  public void Acknowledge_twice_throws_because_the_ack_is_the_single_first_message()
  {
    var sub = new Subscription(new RequestId(1L), new SubscriptionFilter());
    sub.Acknowledge();
    Assert.Throws<InvalidOperationException>(() => sub.Acknowledge());
  }

  [Fact]
  public void Acknowledged_filter_is_the_honored_subset_computed_at_construction()
  {
    // The ack echoes only the kinds the server supports — tools honored, prompts dropped (no capability).
    var sub = new Subscription(
      new RequestId(9L),
      new SubscriptionFilter { ToolsListChanged = true, PromptsListChanged = true },
      new ServerCapabilities { Tools = new ToolsCapability { ListChanged = true } });

    var ack = sub.Acknowledge();
    Assert.True(ack.Notifications.ToolsListChanged);
    Assert.Null(ack.Notifications.PromptsListChanged);
  }

  [Fact]
  public void A_closed_subscription_may_not_emit_even_a_honored_kind()
  {
    var sub = new Subscription(
      new RequestId(1L),
      new SubscriptionFilter { ToolsListChanged = true },
      new ServerCapabilities { Tools = new ToolsCapability { ListChanged = true } });
    sub.Acknowledge();
    sub.Close(SubscriptionCloseReason.ClientCancel);

    Assert.True(sub.IsClosed);
    Assert.False(sub.MayEmit(McpMethods.NotificationsToolsListChanged));
  }
}
