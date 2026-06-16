using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Parity tests for the server-runtime behaviors aligned to the TypeScript SDK in the Phase-5 port: the
/// privacy-default cache scope on cacheable results (§13.3, TS default <c>private</c>), the configurable
/// <c>cacheTtlMs</c>/<c>cacheScope</c> options, the <c>logging/setLevel</c> gate on
/// <c>notifications/message</c> emission (§15.3), the discover result-level <c>_meta</c>, and the R-6.5-j
/// extension-advertisement fix (a <c>null</c>-valued extension entry is NOT advertised).
/// </summary>
public sealed class ServerRuntimeParityTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private sealed class CapturingNotifier : IServerNotifier
  {
    public List<JsonRpcNotification> Notifications { get; } = [];
    public Task NotifyAsync(JsonRpcNotification notification)
    {
      Notifications.Add(notification);
      return Task.CompletedTask;
    }
  }

  private static JsonObject GoodMeta(string? logLevel = null)
  {
    var meta = new JsonObject
    {
      [MetaKeys.ProtocolVersion] = ProtocolRevision.Current,
      [MetaKeys.ClientInfo] = JsonSerializer.SerializeToNode(new Implementation { Name = "c", Version = "1" }, McpJson.Options),
      [MetaKeys.ClientCapabilities] = JsonSerializer.SerializeToNode(ClientCapabilities.None, McpJson.Options),
    };
    if (logLevel is not null) meta[MetaKeys.LogLevel] = logLevel;
    return meta;
  }

  private static async Task<JsonObject> DispatchSuccess(McpServer server, string method, JsonObject prms, CapturingNotifier? notifier = null)
  {
    var response = await server.HandleRequestAsync(
      new JsonRpcRequest(new RequestId(1L), method, prms), notifier ?? new CapturingNotifier(), null, CancellationToken.None);
    return Assert.IsType<JsonRpcSuccessResponse>(response).Result;
  }

  private static McpServer ToolServer(long cacheTtlMs = 0, CacheScope cacheScope = CacheScope.Private)
  {
    var server = new McpServer(
      new Implementation { Name = "p", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability(), Logging = new JsonObject() })
    { CacheTtlMs = cacheTtlMs, CacheScope = cacheScope };

    server.RegisterTool(
      new Tool { Name = "noisy", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        await ctx.LogAsync(LoggingLevel.Debug, "debug-line");
        await ctx.LogAsync(LoggingLevel.Error, "error-line");
        return CallToolResult.FromText("ok");
      });
    return server;
  }

  // ───────────────────────── Cache scope default (§13.3) ─────────────────────────

  [Fact]
  public async Task A_non_caching_server_emits_ttlms_zero_and_scope_private_on_tools_list()
  {
    var result = await DispatchSuccess(ToolServer(), McpMethods.ToolsList, new JsonObject { ["_meta"] = GoodMeta() });
    Assert.Equal(0, result["ttlMs"]!.GetValue<long>());
    // TS default is private — NOT public.
    Assert.Equal("private", result["cacheScope"]!.GetValue<string>());
  }

  [Fact]
  public async Task Cache_options_override_the_defaults_on_list_results()
  {
    var result = await DispatchSuccess(ToolServer(cacheTtlMs: 60000, cacheScope: CacheScope.Public), McpMethods.ToolsList, new JsonObject { ["_meta"] = GoodMeta() });
    Assert.Equal(60000, result["ttlMs"]!.GetValue<long>());
    Assert.Equal("public", result["cacheScope"]!.GetValue<string>());
  }

  // ───────────────────────── per-request logLevel opt-in gate (§4.3, §15.3.3) ─────────────────────────

  [Fact]
  public async Task Without_a_logLevel_opt_in_no_message_notifications_are_emitted()
  {
    // §15.3.3 first bullet (MUST NOT): a request whose _meta omits io.modelcontextprotocol/logLevel
    // receives NO notifications/message at all — not even the high-severity error line.
    var server = ToolServer();
    var notifier = new CapturingNotifier();
    await DispatchSuccess(server, McpMethods.ToolsCall, Obj("""{"name":"noisy","arguments":{}}""").Also(p => p["_meta"] = GoodMeta()), notifier);

    Assert.DoesNotContain(notifier.Notifications, n => n.Method == McpMethods.NotificationsMessage);
  }

  [Fact]
  public async Task An_info_opt_in_drops_debug_but_emits_error()
  {
    // §15.3.3 second bullet: opting in at "info" emits info+ only — debug is dropped, error passes.
    var server = ToolServer();
    var notifier = new CapturingNotifier();
    await DispatchSuccess(server, McpMethods.ToolsCall, Obj("""{"name":"noisy","arguments":{}}""").Also(p => p["_meta"] = GoodMeta("info")), notifier);

    var logs = notifier.Notifications.Where(n => n.Method == McpMethods.NotificationsMessage).ToList();
    Assert.Single(logs);
    Assert.Equal("error", logs[0].Params!["level"]!.GetValue<string>());
  }

  [Fact]
  public async Task A_warning_opt_in_emits_only_at_or_above_warning()
  {
    // §15.3.3: opting in at "warning" drops debug (below) and emits error (>= warning).
    var server = ToolServer();
    var notifier = new CapturingNotifier();
    await DispatchSuccess(server, McpMethods.ToolsCall, Obj("""{"name":"noisy","arguments":{}}""").Also(p => p["_meta"] = GoodMeta("warning")), notifier);

    var logs = notifier.Notifications.Where(n => n.Method == McpMethods.NotificationsMessage).ToList();
    Assert.Single(logs);
    Assert.Equal("error", logs[0].Params!["level"]!.GetValue<string>());
  }

  [Fact]
  public async Task An_invalid_logLevel_opt_in_is_rejected_with_invalid_params()
  {
    // §15.3.3 (R-15.3.3-g): a present-but-unrecognized opt-in value is rejected with -32602.
    var server = ToolServer();
    var response = await server.HandleRequestAsync(
      new JsonRpcRequest(new RequestId(1L), McpMethods.ToolsCall, Obj("""{"name":"noisy","arguments":{}}""").Also(p => p["_meta"] = GoodMeta("verbose"))),
      new CapturingNotifier(), null, CancellationToken.None);
    var error = Assert.IsType<JsonRpcErrorResponse>(response);
    Assert.Equal(ErrorCodes.InvalidParams, error.Error.Code);
  }

  [Fact]
  public async Task Setting_the_level_to_debug_lets_a_debug_message_through()
  {
    var server = ToolServer();
    // logging/setLevel debug lowers the server-wide floor to debug...
    await DispatchSuccess(server, McpMethods.LoggingSetLevel, Obj("""{"level":"debug"}""").Also(p => p["_meta"] = GoodMeta()));

    var notifier = new CapturingNotifier();
    // ...and the request opts in at debug, so both messages clear both floors and emit.
    await DispatchSuccess(server, McpMethods.ToolsCall, Obj("""{"name":"noisy","arguments":{}}""").Also(p => p["_meta"] = GoodMeta("debug")), notifier);

    var logs = notifier.Notifications.Where(n => n.Method == McpMethods.NotificationsMessage).ToList();
    Assert.Equal(2, logs.Count);
  }

  [Fact]
  public async Task Setting_the_level_to_critical_drops_an_error_message()
  {
    var server = ToolServer();
    await DispatchSuccess(server, McpMethods.LoggingSetLevel, Obj("""{"level":"critical"}""").Also(p => p["_meta"] = GoodMeta()));

    var notifier = new CapturingNotifier();
    // The request opts in at debug, but the server-wide critical floor still drops error (< critical).
    await DispatchSuccess(server, McpMethods.ToolsCall, Obj("""{"name":"noisy","arguments":{}}""").Also(p => p["_meta"] = GoodMeta("debug")), notifier);

    Assert.DoesNotContain(notifier.Notifications, n => n.Method == McpMethods.NotificationsMessage);
  }

  [Fact]
  public async Task An_invalid_set_level_value_is_rejected_with_invalid_params()
  {
    var server = ToolServer();
    var response = await server.HandleRequestAsync(
      new JsonRpcRequest(new RequestId(1L), McpMethods.LoggingSetLevel, Obj("""{"level":"loud"}""").Also(p => p["_meta"] = GoodMeta())),
      new CapturingNotifier(), null, CancellationToken.None);
    var error = Assert.IsType<JsonRpcErrorResponse>(response);
    Assert.Equal(ErrorCodes.InvalidParams, error.Error.Code);
  }

  // ───────────────────────── Discover result _meta (§5.3.2) ─────────────────────────

  [Fact]
  public async Task Discover_carries_result_level_meta_when_configured()
  {
    var server = new McpServer(
      new Implementation { Name = "d", Version = "1.0.0" },
      new ServerCapabilities())
    { DiscoverMeta = new JsonObject { ["vendor.example/build"] = "abc123" } };

    var result = await DispatchSuccess(server, McpMethods.Discover, new JsonObject { ["_meta"] = GoodMeta() });
    Assert.Equal("abc123", result["_meta"]!["vendor.example/build"]!.GetValue<string>());
    // Still well-formed: a non-empty supportedVersions list (Validated()).
    Assert.NotEmpty(result["supportedVersions"]!.AsArray());
  }

  // ───────────────────────── R-6.5-j extension advertisement ─────────────────────────

  [Fact]
  public void A_null_valued_extension_entry_is_not_advertised()
  {
    // A JSON null deserializes to a null dictionary value; per R-6.5-j it MUST NOT count as advertised,
    // whereas a well-formed {} settings object does.
    var capsJson = new JsonObject
    {
      ["extensions"] = new JsonObject
      {
        [MetaKeys.TasksExtension] = null,
        ["vendor.example/real"] = new JsonObject(),
      },
    };
    var caps = capsJson.Deserialize<ClientCapabilities>(McpJson.Options)!;

    Assert.False(caps.HasExtension(MetaKeys.TasksExtension)); // null-valued → not advertised
    Assert.True(caps.HasExtension("vendor.example/real"));    // {} → advertised
    Assert.False(caps.HasExtension("vendor.example/absent")); // absent → not advertised
  }
}

/// <summary>Small fluent helper so a JSON object literal can be augmented inline in a test.</summary>
internal static class JsonObjectTestExtensions
{
  public static JsonObject Also(this JsonObject self, Action<JsonObject> mutate)
  {
    mutate(self);
    return self;
  }
}
