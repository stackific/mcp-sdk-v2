using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Client;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Client;

/// <summary>
/// Coverage for the opt-in §13 client response cache and the §19 completion throttle wired into
/// <see cref="McpClient"/>. Caching is driven by a client-LOCAL injected clock so freshness is
/// deterministic (§13.2 forbids assuming client/server clock agreement), and wire requests are counted
/// through the in-memory transport's <see cref="ClientTransport.OnSend"/> tap.
/// </summary>
public sealed class ClientCacheTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  /// <summary>A server that stamps a non-zero ttlMs + public scope on its cacheable list results.</summary>
  private static McpServer CachingServer(long ttlMs = 60_000) =>
    new McpServer(
      new Implementation { Name = "cache-srv", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability { ListChanged = true } })
    { CacheTtlMs = ttlMs, CacheScope = CacheScope.Public };

  private static (McpClient client, Func<int> toolsListSends) Connect(McpServer server, bool cacheResults, Func<long> clock)
  {
    var transport = new InMemoryClientTransport(server);
    var sends = 0;
    transport.OnSend = node =>
    {
      if (node is JsonObject o && o["method"]?.GetValue<string>() == McpMethods.ToolsList) sends++;
    };
    var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" }, cacheResults: cacheResults, clock: clock);
    return (client, () => sends);
  }

  [Fact]
  public async Task A_fresh_cached_list_is_served_within_ttl_without_a_second_wire_request()
  {
    var now = 1_000L;
    var (client, sends) = Connect(CachingServer(ttlMs: 60_000), cacheResults: true, () => now);
    await using var _ = client;

    await client.ListToolsAsync();
    now += 1_000; // still within the 60s ttl
    await client.ListToolsAsync();

    Assert.Equal(1, sends()); // the second call was served from cache — no wire request.
  }

  [Fact]
  public async Task A_stale_cached_list_is_refetched_after_ttl_expires()
  {
    var now = 1_000L;
    var (client, sends) = Connect(CachingServer(ttlMs: 5_000), cacheResults: true, () => now);
    await using var _ = client;

    await client.ListToolsAsync();
    now += 6_000; // beyond the 5s ttl → stale
    await client.ListToolsAsync();

    Assert.Equal(2, sends());
  }

  [Fact]
  public async Task Caching_is_off_by_default_so_every_call_hits_the_wire()
  {
    var now = 1_000L;
    var (client, sends) = Connect(CachingServer(ttlMs: 60_000), cacheResults: false, () => now);
    await using var _ = client;

    await client.ListToolsAsync();
    await client.ListToolsAsync();

    Assert.Equal(2, sends());
  }

  [Fact]
  public void The_completion_throttle_paces_a_burst_of_turns()
  {
    // §19 rate-limiting: a burst of three immediate reservations is spaced by the 100ms interval (waits of
    // 0, 100, 200); once enough local time has elapsed past the last reserved slot, a turn needs no wait.
    var now = 0L;
    var throttle = new CompletionThrottle(TimeSpan.FromMilliseconds(100), () => now);

    Assert.Equal(TimeSpan.Zero, throttle.Reserve());
    Assert.Equal(TimeSpan.FromMilliseconds(100), throttle.Reserve());
    Assert.Equal(TimeSpan.FromMilliseconds(200), throttle.Reserve());

    now = 1_000;
    Assert.Equal(TimeSpan.Zero, throttle.Reserve());
  }

  // ───────────────────────── S28: prompt list caching ─────────────────────────

  /// <summary>A prompts+tools+resources server (all ListChanged) with caching ttl and emit tools that fan list-changed.</summary>
  private static McpServer SubscribeServer(long ttlMs = 60_000)
  {
    var server = new McpServer(
      new Implementation { Name = "sub-srv", Version = "1.0.0" },
      new ServerCapabilities
      {
        Tools = new ToolsCapability { ListChanged = true },
        Prompts = new PromptsCapability { ListChanged = true },
        Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
      })
    { CacheTtlMs = ttlMs, CacheScope = CacheScope.Public };

    server.RegisterPrompt(
      new Prompt { Name = "greeting" },
      _ => Task.FromResult(new GetPromptResult { Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text("hi") }] }));

    server.RegisterTool(
      new Tool { Name = "emit_tools", InputSchema = Obj("""{"type":"object"}""") },
      async ctx => { await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged)); return CallToolResult.FromText("ok"); });
    server.RegisterTool(
      new Tool { Name = "emit_resources", InputSchema = Obj("""{"type":"object"}""") },
      async ctx => { await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesListChanged)); return CallToolResult.FromText("ok"); });

    return server;
  }

  /// <summary>Connects a caching client over the in-memory transport, counting outbound sends per method.</summary>
  private static (McpClient client, Func<string, int> sends) ConnectCounting(McpServer server, Func<long> clock, bool refetchOnListChange = false)
  {
    var transport = new InMemoryClientTransport(server);
    var counts = new System.Collections.Concurrent.ConcurrentDictionary<string, int>(StringComparer.Ordinal);
    transport.OnSend = node =>
    {
      if (node is JsonObject o && o["method"]?.GetValue<string>() is { } method) counts.AddOrUpdate(method, 1, (_, c) => c + 1);
    };
    var client = new McpClient(
      transport, new Implementation { Name = "c", Version = "1" }, cacheResults: true, clock: clock, refetchOnListChange: refetchOnListChange);
    return (client, method => counts.GetValueOrDefault(method, 0));
  }

  private static async Task WaitUntilAsync(Func<bool> condition, string because)
  {
    var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
    while (!condition() && DateTime.UtcNow < deadline) await Task.Delay(10);
    Assert.True(condition(), because);
  }

  [Fact]
  public async Task A_prompt_list_with_ttl_zero_is_refetched_every_call()
  {
    var now = 1_000L;
    var (client, sends) = ConnectCounting(SubscribeServer(ttlMs: 0), () => now);
    await using var _ = client;

    await client.ListPromptsAsync();
    await client.ListPromptsAsync();

    Assert.Equal(2, sends(McpMethods.PromptsList)); // ttl 0 ⇒ never served fresh.
  }

  [Fact]
  public async Task A_fresh_cached_prompt_list_is_served_within_ttl_then_refetched_after_expiry()
  {
    var now = 1_000L;
    var (client, sends) = ConnectCounting(SubscribeServer(ttlMs: 5_000), () => now);
    await using var _ = client;

    await client.ListPromptsAsync();           // send 1, cached.
    now += 1_000;
    await client.ListPromptsAsync();           // within ttl ⇒ cache hit.
    Assert.Equal(1, sends(McpMethods.PromptsList));

    now += 10_000;                             // beyond ttl ⇒ stale.
    await client.ListPromptsAsync();
    Assert.Equal(2, sends(McpMethods.PromptsList));
  }

  // ───────────────────────── S25-RC-4 + S16-RC-3: list-changed invalidation / auto-refetch ─────────────────────────

  [Fact]
  public async Task Tools_list_changed_invalidates_the_cached_tool_list()
  {
    // §13.5: caching ON, auto-refetch OFF — a tools/list_changed evicts the cache, so the NEXT explicit
    // ListToolsAsync re-hits the wire despite no clock advance (frozen clock).
    var now = 1_000L;
    var (client, sends) = ConnectCounting(SubscribeServer(ttlMs: 60_000), () => now, refetchOnListChange: false);
    await using var _ = client;
    await client.DiscoverAsync();

    await client.ListToolsAsync();                                            // send 1, cached.
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    await client.CallToolAsync("emit_tools");                                 // server fans tools/list_changed.

    await client.ListToolsAsync();                                           // cache invalidated ⇒ send 2.
    Assert.Equal(2, sends(McpMethods.ToolsList));
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Tools_list_changed_auto_refetches_the_tool_list_when_enabled()
  {
    // §10.5: caching ON, auto-refetch ON — a tools/list_changed itself triggers a re-fetch (send 2).
    var now = 1_000L;
    var (client, sends) = ConnectCounting(SubscribeServer(ttlMs: 60_000), () => now, refetchOnListChange: true);
    await using var _ = client;
    await client.DiscoverAsync();

    await client.ListToolsAsync();                                           // send 1, cached.
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true });
    await client.CallToolAsync("emit_tools");                                // fans tools/list_changed ⇒ auto-refetch.

    await WaitUntilAsync(() => sends(McpMethods.ToolsList) == 2, "the tools/list_changed should auto-refetch the tool list");
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task A_resources_list_changed_does_not_auto_refetch_the_tool_list()
  {
    // The auto-refetch routes by kind: a resources/list_changed refreshes resources, never tools.
    var now = 1_000L;
    var (client, sends) = ConnectCounting(SubscribeServer(ttlMs: 60_000), () => now, refetchOnListChange: true);
    await using var _ = client;
    await client.DiscoverAsync();

    await client.ListToolsAsync();     // tools/list send 1.
    await client.ListResourcesAsync(); // resources/list send 1.
    var handle = await client.SubscribeAsync(new SubscriptionFilter { ToolsListChanged = true, ResourcesListChanged = true });
    await client.CallToolAsync("emit_resources"); // fans resources/list_changed.

    await WaitUntilAsync(() => sends(McpMethods.ResourcesList) == 2, "the resources/list_changed should auto-refetch the resource list");
    Assert.Equal(1, sends(McpMethods.ToolsList)); // tools list was NOT re-fetched.
    await handle.Unsubscribe();
  }
}
