using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Server-to-client subscriptions (spec §10): a <c>subscriptions/listen</c> stream acknowledges the
/// honored filter (§10.3) and then delivers only the opted-in change notifications, each tagged with
/// the subscription id (§10.4); unrequested kinds are not delivered.
/// </summary>
public sealed class SubscriptionsTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static McpServer BuildServer()
  {
    var server = new McpServer(
      new Implementation { Name = "subs-server", Version = "1.0.0" },
      new ServerCapabilities
      {
        Tools = new ToolsCapability { ListChanged = true },
        Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
        Prompts = new PromptsCapability { ListChanged = true },
      });

    server.RegisterTool(
      new Tool { Name = "mutate", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsPromptsListChanged));
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://other" }));
        return CallToolResult.FromText("mutated");
      });

    return server;
  }

  [Fact]
  public async Task Acknowledges_honored_filter_and_delivers_opted_in_kinds_only()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var received = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(
      new SubscriptionFilter { ToolsListChanged = true, ResourceSubscriptions = ["docs://readme"] },
      received.Add);

    // §10.3: honored filter reflects what the server supports and the client requested.
    Assert.True(handle.HonoredFilter.ToolsListChanged);
    Assert.Null(handle.HonoredFilter.PromptsListChanged); // not requested
    Assert.Equal(["docs://readme"], handle.HonoredFilter.ResourceSubscriptions);

    await client.CallToolAsync("mutate");

    // Delivered: tools/list_changed and the resources/updated for the watched URI — not prompts, not the other URI.
    Assert.Contains(received, n => n.Method == McpMethods.NotificationsToolsListChanged);
    Assert.Contains(received, n => n.Method == McpMethods.NotificationsResourcesUpdated && n.Params!["uri"]!.GetValue<string>() == "docs://readme");
    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsPromptsListChanged);
    Assert.DoesNotContain(received, n => n.Method == McpMethods.NotificationsResourcesUpdated && n.Params!["uri"]!.GetValue<string>() == "docs://other");

    // §10.4: every delivered notification carries the subscription id in _meta.
    Assert.All(received, n => Assert.NotNull(n.Params!["_meta"]![MetaKeys.SubscriptionId]));

    await handle.Unsubscribe();
  }
}
