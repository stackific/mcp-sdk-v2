using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Exhaustive behavior coverage for server-to-client subscriptions (spec §10): the honored filter is
/// the intersection of the requested kinds and the server-supported kinds (§10.3); delivered
/// notifications carry the subscription id in <c>params._meta</c> (§10.4); <c>resources/updated</c> is
/// delivered only for subscribed URIs (§10.5); unrequested kinds are never delivered; unsubscribe stops
/// delivery (§10.7); independent subscriptions are isolated. Driven both end-to-end through the
/// in-memory harness and directly against <see cref="SubscriptionManager"/> for fan-out matching.
/// </summary>
public sealed class SubscriptionsBehaviorTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  /// <summary>
  /// Builds a server with selectable capabilities and registers a single "emit" tool that fans every
  /// change-notification kind to subscribers, so a tool call exercises the full filter matrix.
  /// </summary>
  private static McpServer BuildServer(
    bool toolsListChanged = true,
    bool resourcesSubscribe = true,
    bool resourcesListChanged = true,
    bool promptsListChanged = true)
  {
    var capabilities = new ServerCapabilities
    {
      Tools = new ToolsCapability { ListChanged = toolsListChanged },
      Resources = new ResourcesCapability { Subscribe = resourcesSubscribe, ListChanged = resourcesListChanged },
      Prompts = new PromptsCapability { ListChanged = promptsListChanged },
    };

    var server = new McpServer(new Implementation { Name = "subs", Version = "1.0.0" }, capabilities);

    server.RegisterTool(
      new Tool { Name = "emit", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsPromptsListChanged));
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesListChanged));
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://other" }));
        return CallToolResult.FromText("emitted");
      });

    return server;
  }

  // ───────────────────────── Honored-filter intersection (§10.3) ─────────────────────────

  [Fact]
  public async Task Tools_list_changed_honored_when_requested_and_supported()
  {
    await using var client = InMemory.Connect(BuildServer(toolsListChanged: true));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    Assert.True(handle.HonoredFilter.ToolsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Declined_filter_kinds_are_surfaced_on_the_handle()
  {
    // §10.3: the server supports tools/list_changed but NOT prompts/list_changed; a client requesting both
    // gets tools honored and prompts surfaced as a declined kind.
    await using var client = InMemory.Connect(BuildServer(toolsListChanged: true, promptsListChanged: false));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true, PromptsListChanged = true });

    Assert.True(handle.HonoredFilter.ToolsListChanged);
    Assert.Contains(nameof(SubscriptionFilter.PromptsListChanged), handle.DeclinedFields);
    Assert.DoesNotContain(nameof(SubscriptionFilter.ToolsListChanged), handle.DeclinedFields);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Tools_list_changed_not_honored_when_server_lacks_capability()
  {
    await using var client = InMemory.Connect(BuildServer(toolsListChanged: false));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    Assert.Null(handle.HonoredFilter.ToolsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Tools_list_changed_not_honored_when_not_requested()
  {
    await using var client = InMemory.Connect(BuildServer(toolsListChanged: true));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { PromptsListChanged = true });
    Assert.Null(handle.HonoredFilter.ToolsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Prompts_list_changed_honored_when_requested_and_supported()
  {
    await using var client = InMemory.Connect(BuildServer(promptsListChanged: true));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { PromptsListChanged = true });
    Assert.True(handle.HonoredFilter.PromptsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Prompts_list_changed_not_honored_when_server_lacks_capability()
  {
    await using var client = InMemory.Connect(BuildServer(promptsListChanged: false));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { PromptsListChanged = true });
    Assert.Null(handle.HonoredFilter.PromptsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Prompts_list_changed_not_honored_when_not_requested()
  {
    await using var client = InMemory.Connect(BuildServer(promptsListChanged: true));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    Assert.Null(handle.HonoredFilter.PromptsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Resources_list_changed_honored_when_requested_and_supported()
  {
    await using var client = InMemory.Connect(BuildServer(resourcesListChanged: true));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourcesListChanged = true });
    Assert.True(handle.HonoredFilter.ResourcesListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Resources_list_changed_not_honored_when_server_lacks_capability()
  {
    await using var client = InMemory.Connect(BuildServer(resourcesListChanged: false));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourcesListChanged = true });
    Assert.Null(handle.HonoredFilter.ResourcesListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Resources_list_changed_not_honored_when_not_requested()
  {
    await using var client = InMemory.Connect(BuildServer(resourcesListChanged: true));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    Assert.Null(handle.HonoredFilter.ResourcesListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Resource_subscriptions_honored_when_server_supports_subscribe()
  {
    await using var client = InMemory.Connect(BuildServer(resourcesSubscribe: true));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] });
    Assert.Equal(["docs://readme"], handle.HonoredFilter.ResourceSubscriptions);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Resource_subscriptions_not_honored_when_server_lacks_subscribe()
  {
    await using var client = InMemory.Connect(BuildServer(resourcesSubscribe: false));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] });
    Assert.Null(handle.HonoredFilter.ResourceSubscriptions);
    await handle.Unsubscribe();
  }

  /// <summary>
  /// Drives the honored-filter intersection over the full capability matrix (§10.3): a kind is honored
  /// iff the client requested it AND the server advertises the backing capability.
  /// </summary>
  [Theory]
  [InlineData(true, true, true)]
  [InlineData(true, false, false)]
  [InlineData(false, true, false)]
  [InlineData(false, false, false)]
  public async Task Tools_list_changed_intersection_matrix(bool requested, bool supported, bool expected)
  {
    await using var client = InMemory.Connect(BuildServer(toolsListChanged: supported));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = requested ? true : null });
    Assert.Equal(expected ? true : null, handle.HonoredFilter.ToolsListChanged);
    await handle.Unsubscribe();
  }

  [Theory]
  [InlineData(true, true, true)]
  [InlineData(true, false, false)]
  [InlineData(false, true, false)]
  [InlineData(false, false, false)]
  public async Task Prompts_list_changed_intersection_matrix(bool requested, bool supported, bool expected)
  {
    await using var client = InMemory.Connect(BuildServer(promptsListChanged: supported));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { PromptsListChanged = requested ? true : null });
    Assert.Equal(expected ? true : null, handle.HonoredFilter.PromptsListChanged);
    await handle.Unsubscribe();
  }

  [Theory]
  [InlineData(true, true, true)]
  [InlineData(true, false, false)]
  [InlineData(false, true, false)]
  [InlineData(false, false, false)]
  public async Task Resources_list_changed_intersection_matrix(bool requested, bool supported, bool expected)
  {
    await using var client = InMemory.Connect(BuildServer(resourcesListChanged: supported));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourcesListChanged = requested ? true : null });
    Assert.Equal(expected ? true : null, handle.HonoredFilter.ResourcesListChanged);
    await handle.Unsubscribe();
  }

  [Theory]
  [InlineData(true, true)]
  [InlineData(false, false)]
  public async Task Resource_subscriptions_intersection_matrix(bool supported, bool expectHonored)
  {
    await using var client = InMemory.Connect(BuildServer(resourcesSubscribe: supported));
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://a"] });
    if (expectHonored) Assert.Equal(["docs://a"], handle.HonoredFilter.ResourceSubscriptions);
    else Assert.Null(handle.HonoredFilter.ResourceSubscriptions);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Fully_capable_server_honors_all_requested_kinds()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter
    {
      ToolsListChanged = true,
      PromptsListChanged = true,
      ResourcesListChanged = true,
      ResourceSubscriptions = ["docs://readme"],
    });
    Assert.True(handle.HonoredFilter.ToolsListChanged);
    Assert.True(handle.HonoredFilter.PromptsListChanged);
    Assert.True(handle.HonoredFilter.ResourcesListChanged);
    Assert.Equal(["docs://readme"], handle.HonoredFilter.ResourceSubscriptions);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Empty_filter_honors_nothing()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter());
    Assert.Null(handle.HonoredFilter.ToolsListChanged);
    Assert.Null(handle.HonoredFilter.PromptsListChanged);
    Assert.Null(handle.HonoredFilter.ResourcesListChanged);
    await handle.Unsubscribe();
  }

  // ───────────────────────── Non-absolute resource URI rejection (§10.2, R-10.2-i) ─────────────────────────

  [Theory]
  [InlineData("/relative/path")]
  [InlineData("readme")]
  [InlineData("docs-without-scheme")]
  [InlineData("://noscheme")]
  public async Task Subscribe_rejects_a_non_absolute_resource_subscription_uri(string badUri)
  {
    // S16 / R-10.2-i: a client MUST NOT subscribe to a non-absolute resource URI. The client rejects it
    // up front with -32602 rather than sending it to the server.
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = [badUri] }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    // The faulty subscription was never registered (no active subscription leaked).
    Assert.Empty(client.ActiveSubscriptionIds);
  }

  [Fact]
  public async Task Subscribe_rejects_when_any_uri_in_the_list_is_non_absolute()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://ok", "not-absolute"] }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Empty(client.ActiveSubscriptionIds);
  }

  [Fact]
  public async Task Subscribe_accepts_an_absolute_resource_subscription_uri()
  {
    // The positive control: an absolute URI is accepted and the subscription becomes active.
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] });
    Assert.Single(client.ActiveSubscriptionIds);
    await handle.Unsubscribe();
  }

  // ───────────────────────── subscriptionId correlation routing (§10.4, R-10.4-c) ─────────────────────────

  [Fact]
  public async Task Each_subscription_routes_only_its_own_subscription_ids_notifications()
  {
    // S16 / R-10.4-c: with two concurrent subscriptions over the same client channel, every delivered
    // notification carries the OWNING subscription's id in _meta and is routed to that handler only.
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var a = new List<JsonRpcNotification>();
    var b = new List<JsonRpcNotification>();
    var handleA = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, a.Add);
    var handleB = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, b.Add);

    var idA = client.ActiveSubscriptionIds[0];
    var idB = client.ActiveSubscriptionIds[1];

    await client.CallToolAsync("emit");

    Assert.NotEmpty(a);
    Assert.NotEmpty(b);
    // Every notification each handler saw is tagged with that handler's own subscription id (R-10.4-c).
    Assert.All(a, n => Assert.Equal(idA, SubscriptionRegistry.ReadSubscriptionId(n.Params)));
    Assert.All(b, n => Assert.Equal(idB, SubscriptionRegistry.ReadSubscriptionId(n.Params)));
    Assert.NotEqual(idA, idB);

    await handleA.Unsubscribe();
    await handleB.Unsubscribe();
  }

  [Fact]
  public async Task Active_subscription_is_retrievable_by_its_id_and_gone_after_unsubscribe()
  {
    // The client tracks the request-scoped lifecycle through a SubscriptionRegistry keyed by the
    // subscription id (the subscriptions/listen request id) — §10.4/§10.7.
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    var id = client.ActiveSubscriptionIds[0];

    var sub = client.GetSubscription(id);
    Assert.NotNull(sub);
    Assert.Equal(id, sub!.SubscriptionId);

    await handle.Unsubscribe();
    Assert.Null(client.GetSubscription(id));
    Assert.Empty(client.ActiveSubscriptionIds);
  }

  // ───────────────────────── Delivery + subscription id (§10.4/§10.5) ─────────────────────────

  [Fact]
  public async Task Delivered_notifications_carry_subscription_id_in_meta()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, received.Add);

    await client.CallToolAsync("emit");

    Assert.NotEmpty(received);
    Assert.All(received, n => Assert.NotNull(n.Params!["_meta"]![MetaKeys.SubscriptionId]));
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Tools_list_changed_delivered_when_subscribed()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, received.Add);

    await client.CallToolAsync("emit");

    Assert.Contains(received, n => n.Method == McpMethods.NotificationsToolsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Prompts_list_changed_delivered_when_subscribed()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { PromptsListChanged = true }, received.Add);

    await client.CallToolAsync("emit");

    Assert.Contains(received, n => n.Method == McpMethods.NotificationsPromptsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Resources_list_changed_delivered_when_subscribed()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourcesListChanged = true }, received.Add);

    await client.CallToolAsync("emit");

    Assert.Contains(received, n => n.Method == McpMethods.NotificationsResourcesListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Resources_updated_delivered_only_for_subscribed_uri()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] }, received.Add);

    await client.CallToolAsync("emit");

    Assert.Contains(received, n => n.Method == McpMethods.NotificationsResourcesUpdated && n.Params!["uri"]!.GetValue<string>() == "docs://readme");
    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsResourcesUpdated && n.Params!["uri"]!.GetValue<string>() == "docs://other");
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Multiple_kinds_delivered_together()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(
      new SubscriptionFilter { ToolsListChanged = true, PromptsListChanged = true, ResourcesListChanged = true },
      received.Add);

    await client.CallToolAsync("emit");

    Assert.Contains(received, n => n.Method == McpMethods.NotificationsToolsListChanged);
    Assert.Contains(received, n => n.Method == McpMethods.NotificationsPromptsListChanged);
    Assert.Contains(received, n => n.Method == McpMethods.NotificationsResourcesListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Unrequested_kind_is_never_delivered()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    // Subscribe to tools only; the emit tool also fans prompts/resources kinds.
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, received.Add);

    await client.CallToolAsync("emit");

    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsPromptsListChanged);
    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsResourcesListChanged);
    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsResourcesUpdated);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Kind_not_honored_due_to_missing_capability_is_not_delivered()
  {
    // Client requests tools/list_changed, but the server does not support it ⇒ never delivered.
    await using var client = InMemory.Connect(BuildServer(toolsListChanged: false));
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, received.Add);

    await client.CallToolAsync("emit");

    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsToolsListChanged);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Unsubscribe_stops_further_delivery()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, received.Add);

    await client.CallToolAsync("emit");
    var countBefore = received.Count;
    Assert.True(countBefore > 0);

    await handle.Unsubscribe();
    received.Clear();

    await client.CallToolAsync("emit");

    Assert.Empty(received);
  }

  [Fact]
  public async Task Two_subscriptions_each_get_their_own_id()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var a = new List<JsonRpcNotification>();
    var b = new List<JsonRpcNotification>();
    var handleA = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, a.Add);
    var handleB = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, b.Add);

    await client.CallToolAsync("emit");

    var idA = a.First().Params!["_meta"]![MetaKeys.SubscriptionId]!.GetValue<string>();
    var idB = b.First().Params!["_meta"]![MetaKeys.SubscriptionId]!.GetValue<string>();
    Assert.NotEqual(idA, idB);
    await handleA.Unsubscribe();
    await handleB.Unsubscribe();
  }

  [Fact]
  public async Task Two_subscriptions_get_their_own_kinds()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var tools = new List<JsonRpcNotification>();
    var prompts = new List<JsonRpcNotification>();
    var handleTools = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, tools.Add);
    var handlePrompts = await client.SubscribeAsync(new SubscriptionFilter { PromptsListChanged = true }, prompts.Add);

    await client.CallToolAsync("emit");

    // The tools subscription sees only tools; the prompts subscription sees only prompts.
    Assert.Contains(tools, n => n.Method == McpMethods.NotificationsToolsListChanged);
    Assert.DoesNotContain(tools, n => n.Method == McpMethods.NotificationsPromptsListChanged);
    Assert.Contains(prompts, n => n.Method == McpMethods.NotificationsPromptsListChanged);
    Assert.DoesNotContain(prompts, n => n.Method == McpMethods.NotificationsToolsListChanged);
    await handleTools.Unsubscribe();
    await handlePrompts.Unsubscribe();
  }

  [Fact]
  public async Task Independent_subscriptions_watch_different_uris()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var readme = new List<JsonRpcNotification>();
    var other = new List<JsonRpcNotification>();
    var handleReadme = await client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] }, readme.Add);
    var handleOther = await client.SubscribeAsync(new SubscriptionFilter { ResourceSubscriptions = ["docs://other"] }, other.Add);

    await client.CallToolAsync("emit");

    Assert.Contains(readme, n => n.Params!["uri"]!.GetValue<string>() == "docs://readme");
    Assert.DoesNotContain(readme, n => n.Params!["uri"]!.GetValue<string>() == "docs://other");
    Assert.Contains(other, n => n.Params!["uri"]!.GetValue<string>() == "docs://other");
    Assert.DoesNotContain(other, n => n.Params!["uri"]!.GetValue<string>() == "docs://readme");
    await handleReadme.Unsubscribe();
    await handleOther.Unsubscribe();
  }

  [Fact]
  public async Task Resources_updated_for_unsubscribed_uri_is_not_delivered_to_list_changed_subscriber()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    // A subscriber watching only list-changed kinds must never see resources/updated.
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ResourcesListChanged = true }, received.Add);

    await client.CallToolAsync("emit");

    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsResourcesUpdated);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Subscriber_receives_only_its_subset_across_many_emits()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, received.Add);

    await client.CallToolAsync("emit");
    await client.CallToolAsync("emit");
    await client.CallToolAsync("emit");

    // Three emits, one matching kind each ⇒ exactly three deliveries, all tools/list_changed.
    Assert.Equal(3, received.Count);
    Assert.All(received, n => Assert.Equal(McpMethods.NotificationsToolsListChanged, n.Method));
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Unsubscribe_is_idempotent()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    await handle.Unsubscribe();
    await handle.Unsubscribe(); // a second close must not throw.
  }

  [Fact]
  public async Task One_unsubscribe_does_not_affect_the_other_subscription()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();
    var a = new List<JsonRpcNotification>();
    var b = new List<JsonRpcNotification>();
    var handleA = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, a.Add);
    var handleB = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true }, b.Add);

    await handleA.Unsubscribe();
    await client.CallToolAsync("emit");

    Assert.Empty(a);
    Assert.NotEmpty(b);
    await handleB.Unsubscribe();
  }

  // ───────────────────────── SubscriptionManager unit (fan-out matching) ─────────────────────────

  private static readonly ServerCapabilities FullCaps = new()
  {
    Tools = new ToolsCapability { ListChanged = true },
    Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
    Prompts = new PromptsCapability { ListChanged = true },
  };

  /// <summary>Registers a single subscription on a fresh manager and captures everything it delivers.</summary>
  private static (SubscriptionManager Manager, List<JsonRpcNotification> Received, string Id) Subscribe(
    SubscriptionFilter requested, ServerCapabilities? caps = null, string id = "sub-1")
  {
    var manager = new SubscriptionManager();
    var received = new List<JsonRpcNotification>();
    var (_, _teardown) = manager.Register(requested, caps ?? FullCaps, id, n => { received.Add(n); return Task.CompletedTask; });
    _ = _teardown;
    return (manager, received, id);
  }

  [Fact]
  public void Register_returns_honored_intersection()
  {
    var manager = new SubscriptionManager();
    var (honored, _) = manager.Register(
      new SubscriptionFilter { ToolsListChanged = true, PromptsListChanged = true },
      new ServerCapabilities { Tools = new ToolsCapability { ListChanged = true } },
      "id",
      _ => Task.CompletedTask);
    Assert.True(honored.ToolsListChanged);
    Assert.Null(honored.PromptsListChanged); // server has no prompts capability
  }

  [Fact]
  public async Task FanOut_delivers_matching_tools_list_changed()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { ToolsListChanged = true });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
    Assert.Single(received);
    Assert.Equal(McpMethods.NotificationsToolsListChanged, received[0].Method);
  }

  [Fact]
  public async Task FanOut_delivers_matching_prompts_list_changed()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { PromptsListChanged = true });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsPromptsListChanged));
    Assert.Single(received);
  }

  [Fact]
  public async Task FanOut_delivers_matching_resources_list_changed()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { ResourcesListChanged = true });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesListChanged));
    Assert.Single(received);
  }

  [Fact]
  public async Task FanOut_skips_unsubscribed_kind()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { ToolsListChanged = true });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsPromptsListChanged));
    Assert.Empty(received);
  }

  [Fact]
  public async Task FanOut_tags_delivered_notification_with_subscription_id()
  {
    var (manager, received, id) = Subscribe(new SubscriptionFilter { ToolsListChanged = true }, id: "my-sub");
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
    Assert.Equal(id, received[0].Params!["_meta"]![MetaKeys.SubscriptionId]!.GetValue<string>());
  }

  [Fact]
  public async Task FanOut_resources_updated_matches_only_subscribed_uri()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://other" }));
    Assert.Single(received);
    Assert.Equal("docs://readme", received[0].Params!["uri"]!.GetValue<string>());
  }

  [Fact]
  public async Task FanOut_resources_updated_matches_any_of_multiple_subscribed_uris()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { ResourceSubscriptions = ["docs://a", "docs://b"] });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://a" }));
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://b" }));
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://c" }));
    Assert.Equal(2, received.Count);
  }

  [Fact]
  public async Task FanOut_resources_updated_not_matched_without_subscriptions()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { ToolsListChanged = true });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://x" }));
    Assert.Empty(received);
  }

  [Fact]
  public async Task FanOut_unknown_method_matches_nothing()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter
    {
      ToolsListChanged = true,
      PromptsListChanged = true,
      ResourcesListChanged = true,
      ResourceSubscriptions = ["docs://x"],
    });
    await manager.FanOutAsync(new JsonRpcNotification("notifications/unknown"));
    Assert.Empty(received);
  }

  [Fact]
  public async Task FanOut_preserves_original_notification_payload()
  {
    var (manager, received, _) = Subscribe(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] });
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
    Assert.Equal("docs://readme", received[0].Params!["uri"]!.GetValue<string>());
    Assert.NotNull(received[0].Params!["_meta"]![MetaKeys.SubscriptionId]);
  }

  [Fact]
  public async Task Teardown_removes_subscription_from_fan_out()
  {
    var manager = new SubscriptionManager();
    var received = new List<JsonRpcNotification>();
    var (_, teardown) = manager.Register(
      new SubscriptionFilter { ToolsListChanged = true }, FullCaps, "id",
      n => { received.Add(n); return Task.CompletedTask; });

    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
    Assert.Single(received);

    teardown.Dispose();
    received.Clear();
    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
    Assert.Empty(received);
  }

  [Fact]
  public async Task FanOut_delivers_to_all_matching_subscriptions()
  {
    var manager = new SubscriptionManager();
    var a = new List<JsonRpcNotification>();
    var b = new List<JsonRpcNotification>();
    manager.Register(new SubscriptionFilter { ToolsListChanged = true }, FullCaps, "a", n => { a.Add(n); return Task.CompletedTask; });
    manager.Register(new SubscriptionFilter { ToolsListChanged = true }, FullCaps, "b", n => { b.Add(n); return Task.CompletedTask; });

    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));

    Assert.Single(a);
    Assert.Single(b);
    Assert.Equal("a", a[0].Params!["_meta"]![MetaKeys.SubscriptionId]!.GetValue<string>());
    Assert.Equal("b", b[0].Params!["_meta"]![MetaKeys.SubscriptionId]!.GetValue<string>());
  }

  [Fact]
  public async Task FanOut_only_delivers_to_subscriptions_whose_filter_matches()
  {
    var manager = new SubscriptionManager();
    var toolsOnly = new List<JsonRpcNotification>();
    var promptsOnly = new List<JsonRpcNotification>();
    manager.Register(new SubscriptionFilter { ToolsListChanged = true }, FullCaps, "t", n => { toolsOnly.Add(n); return Task.CompletedTask; });
    manager.Register(new SubscriptionFilter { PromptsListChanged = true }, FullCaps, "p", n => { promptsOnly.Add(n); return Task.CompletedTask; });

    await manager.FanOutAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));

    Assert.Single(toolsOnly);
    Assert.Empty(promptsOnly);
  }

  [Fact]
  public async Task FanOut_does_not_mutate_source_notification()
  {
    var (manager, _, _) = Subscribe(new SubscriptionFilter { ResourceSubscriptions = ["docs://readme"] });
    var source = new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" });
    await manager.FanOutAsync(source);
    // The original params must be untouched by the per-subscription id tagging (deep-clone, §10.4).
    Assert.Null(source.Params!["_meta"]);
  }

  [Fact]
  public void Honor_strips_resource_subscriptions_when_subscribe_unsupported()
  {
    var manager = new SubscriptionManager();
    var (honored, _) = manager.Register(
      new SubscriptionFilter { ResourceSubscriptions = ["docs://x"] },
      new ServerCapabilities { Resources = new ResourcesCapability { Subscribe = false } },
      "id",
      _ => Task.CompletedTask);
    Assert.Null(honored.ResourceSubscriptions);
  }

  [Fact]
  public void Honor_keeps_resource_subscriptions_when_subscribe_supported()
  {
    var manager = new SubscriptionManager();
    var (honored, _) = manager.Register(
      new SubscriptionFilter { ResourceSubscriptions = ["docs://x"] },
      new ServerCapabilities { Resources = new ResourcesCapability { Subscribe = true } },
      "id",
      _ => Task.CompletedTask);
    Assert.Equal(["docs://x"], honored.ResourceSubscriptions);
  }
}
