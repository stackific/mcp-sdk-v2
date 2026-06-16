using System.Globalization;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// End-to-end exercise of the SDK engine (McpServer ↔ in-memory transport ↔ McpClient): discovery and
/// revision negotiation (§5), capability gating (§6/§22), tools (§16), resources + templates (§17),
/// prompts (§18), completion (§19), pagination (§12), request-scoped progress/log notifications (§15),
/// and the protocol-vs-tool error distinction (§16.6/§22).
/// </summary>
public sealed class EngineTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static McpServer BuildServer()
  {
    var server = new McpServer(
      new Implementation { Name = "test-server", Title = "Test Server", Version = "1.0.0" },
      new ServerCapabilities
      {
        Tools = new ToolsCapability { ListChanged = true },
        Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
        Prompts = new PromptsCapability { ListChanged = true },
        Completions = new JsonObject(),
        Logging = new JsonObject(),
      },
      instructions: "A server for tests.");

    server.RegisterTool(
      new Tool { Name = "add", InputSchema = Obj("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}""") },
      ctx => Task.FromResult(CallToolResult.FromText((ctx.GetDouble("a") + ctx.GetDouble("b")).ToString(CultureInfo.InvariantCulture))));

    server.RegisterTool(
      new Tool { Name = "divide", InputSchema = Obj("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}""") },
      ctx => Task.FromResult(ctx.GetDouble("b") == 0
        ? CallToolResult.FromError("Cannot divide by zero.")
        : CallToolResult.FromText((ctx.GetDouble("a") / ctx.GetDouble("b")).ToString(CultureInfo.InvariantCulture))));

    server.RegisterTool(
      new Tool { Name = "get_weather", InputSchema = Obj("""{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}""") },
      ctx =>
      {
        var structured = new JsonObject { ["city"] = ctx.GetString("city"), ["tempC"] = 21 };
        return Task.FromResult(new CallToolResult { Content = [ContentBlocks.Text(structured.ToJsonString())], StructuredContent = structured });
      });

    server.RegisterTool(
      new Tool { Name = "count_with_logs", InputSchema = Obj("""{"type":"object","properties":{"count":{"type":"integer"}}}""") },
      async ctx =>
      {
        var count = ctx.GetInt("count", 3);
        for (var i = 1; i <= count; i++)
        {
          await ctx.LogAsync(LoggingLevel.Info, $"tick {i}/{count}");
          await ctx.ReportProgressAsync(i, count);
        }
        return CallToolResult.FromText($"Done {count}.");
      });

    server.RegisterResource(
      new Resource { Uri = "docs://readme", Name = "readme", MimeType = "text/markdown" },
      uri => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, "# Readme", "text/markdown")] }));

    server.RegisterResourceTemplate(
      new ResourceTemplate { UriTemplate = "weather://{city}/current", Name = "city-weather", MimeType = "application/json" },
      (uri, vars) => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, $$"""{"city":"{{vars["city"]}}"}""", "application/json")] }),
      new Dictionary<string, ArgumentCompleter> { ["city"] = value => new[] { "oslo", "tokyo" }.Where(c => c.StartsWith(value, StringComparison.Ordinal)).ToList() });

    server.RegisterPrompt(
      new Prompt { Name = "greeting", Arguments = [new PromptArgument { Name = "name", Required = true }, new PromptArgument { Name = "language" }] },
      args => Task.FromResult(new GetPromptResult { Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text($"Greet {args["name"]}.") }] }),
      new Dictionary<string, ArgumentCompleter> { ["language"] = value => new[] { "english", "spanish" }.Where(l => l.StartsWith(value, StringComparison.Ordinal)).ToList() });

    return server;
  }

  [Fact]
  public async Task Discover_negotiates_revision_and_reports_capabilities()
  {
    await using var client = InMemory.Connect(BuildServer());
    var discover = await client.DiscoverAsync();

    Assert.Equal(ProtocolRevision.Current, client.NegotiatedVersion);
    Assert.Equal("test-server", client.ServerInfo!.Name);
    Assert.True(client.ServerSupports(c => c.Tools is not null));
    Assert.Contains(ProtocolRevision.Current, discover.SupportedVersions);
  }

  [Fact]
  public async Task Lists_and_calls_tools()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var tools = await client.ListToolsAsync();
    Assert.Contains(tools.Tools, t => t.Name == "add");

    var result = await client.CallToolAsync("add", Obj("""{"a":2,"b":3}"""));
    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal("5", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Tool_execution_error_is_a_result_not_a_protocol_error()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var result = await client.CallToolAsync("divide", Obj("""{"a":1,"b":0}"""));
    Assert.True(result["isError"]!.GetValue<bool>());
  }

  [Fact]
  public async Task Structured_content_is_returned_alongside_text()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var result = await client.CallToolAsync("get_weather", Obj("""{"city":"oslo"}"""));
    Assert.Equal("oslo", result["structuredContent"]!["city"]!.GetValue<string>());
  }

  [Fact]
  public async Task Unknown_tool_is_invalid_params_minus_32602()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("nope"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Missing_required_argument_is_invalid_params()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("add", Obj("""{"a":1}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Method_gated_behind_undeclared_capability_is_method_not_found()
  {
    var bare = new McpServer(new Implementation { Name = "bare", Version = "1.0.0" }, new ServerCapabilities());
    await using var client = InMemory.Connect(bare);
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.ListPromptsAsync());
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Progress_and_log_notifications_stream_on_the_request()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var notifications = new List<JsonRpcNotification>();
    var result = await client.CallToolAsync("count_with_logs", Obj("""{"count":3}"""), new RequestOptions
    {
      ProgressToken = "p-1",
      OnNotification = notifications.Add,
      // §15.3.3: opt in to logs for this request, else the server emits no notifications/message.
      Meta = new JsonObject { ["io.modelcontextprotocol/logLevel"] = "info" },
    });

    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal(3, notifications.Count(n => n.Method == McpMethods.NotificationsProgress));
    Assert.Equal(3, notifications.Count(n => n.Method == McpMethods.NotificationsMessage));
  }

  [Fact]
  public async Task Reads_resources_directly_and_via_template()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var direct = await client.ReadResourceAsync("docs://readme");
    Assert.Equal("# Readme", direct.Contents[0].Text);

    var templated = await client.ReadResourceAsync("weather://oslo/current");
    Assert.Contains("oslo", templated.Contents[0].Text);

    var templates = await client.ListResourceTemplatesAsync();
    Assert.Contains(templates.ResourceTemplates, t => t.UriTemplate == "weather://{city}/current");
  }

  [Fact]
  public async Task Resource_not_found_is_invalid_params_with_uri()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.ReadResourceAsync("docs://missing"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Equal("docs://missing", error.ErrorData!["uri"]!.GetValue<string>());
  }

  [Fact]
  public async Task Gets_prompt_and_enforces_required_argument()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var prompt = await client.GetPromptAsync("greeting", new Dictionary<string, string> { ["name"] = "Ada" });
    Assert.Contains("Ada", prompt.Messages[0].Content is TextContent text ? text.Text : "");

    var error = await Assert.ThrowsAsync<McpError>(() => client.GetPromptAsync("greeting"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Completes_prompt_and_template_arguments()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var prompt = await client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "language", Value = "eng" });
    Assert.Equal(["english"], prompt.Completion.Values);

    var template = await client.CompleteAsync(new ResourceTemplateReference { Uri = "weather://{city}/current" }, new CompletionArgument { Name = "city", Value = "os" });
    Assert.Equal(["oslo"], template.Completion.Values);
  }

  [Fact]
  public async Task Pagination_walks_pages_with_opaque_cursor()
  {
    var server = new McpServer(new Implementation { Name = "p", Version = "1" }, new ServerCapabilities { Tools = new ToolsCapability() }) { PageSize = 2 };
    for (var i = 0; i < 5; i++)
    {
      server.RegisterTool(new Tool { Name = $"t{i}", InputSchema = Obj("""{"type":"object"}""") }, _ => Task.FromResult(CallToolResult.FromText("ok")));
    }
    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    var seen = new List<string>();
    string? cursor = null;
    do
    {
      var page = await client.ListToolsAsync(cursor);
      seen.AddRange(page.Tools.Select(t => t.Name));
      cursor = page.NextCursor;
    }
    while (cursor is not null);

    Assert.Equal(5, seen.Count);
    Assert.Equal(seen, seen.Distinct().ToList());
  }
}
