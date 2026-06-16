using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Client;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Client;

/// <summary>
/// Exhaustive behavioural coverage for the <see cref="McpClient"/> runtime (spec §4 stateless model,
/// §5 discovery/negotiation, §22 protocol errors). Every test exercises the real client over the real
/// in-memory transport bridged to a real <see cref="McpServer"/>; outbound and inbound frames are
/// captured through a transport tap (a <see cref="CapturingTransport"/> wrapping the in-memory bridge,
/// or the public <see cref="ClientTransport.OnSend"/>/<see cref="ClientTransport.OnReceive"/> hooks) so
/// the per-request <c>_meta</c> envelope and the JSON-RPC framing can be asserted byte-shape-accurately.
/// Error <em>codes</em> are asserted, never messages.
/// </summary>
public sealed class ClientBehaviorTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  // ───────────────────────── Test harness ─────────────────────────

  /// <summary>
  /// A <see cref="ClientTransport"/> that delegates to a real <see cref="InMemoryClientTransport"/> and
  /// records every outbound request frame (as raw JSON) so a test can inspect exactly what the client
  /// put on the wire — most importantly the per-request <c>_meta</c> envelope (§4.3). It also forwards
  /// the <see cref="ClientTransport.OnSend"/>/<see cref="ClientTransport.OnReceive"/> taps so the same
  /// transport can verify the wire-tap contract.
  /// </summary>
  private sealed class CapturingTransport : ClientTransport
  {
    private readonly InMemoryClientTransport _inner;

    public CapturingTransport(IMcpRequestHandler server)
    {
      _inner = new InMemoryClientTransport(server);
      // Bridge the inner transport's taps up so OnSend/OnReceive set on THIS transport fire, and
      // capture every frame regardless of whether a test wired its own tap.
      _inner.OnSend = node => { Sent.Add(node); OnSend?.Invoke(node); };
      _inner.OnReceive = node => { Received.Add(node); OnReceive?.Invoke(node); };
    }

    /// <summary>Every outbound frame the client produced, in order.</summary>
    public List<JsonNode> Sent { get; } = new();

    /// <summary>Every inbound frame the client received, in order.</summary>
    public List<JsonNode> Received { get; } = new();

    /// <summary>The outbound request frames only (skipping any non-request frames).</summary>
    public IEnumerable<JsonObject> SentRequests =>
      Sent.OfType<JsonObject>().Where(o => o.ContainsKey("method") && o.ContainsKey("id"));

    /// <summary>The most recently captured outbound request frame.</summary>
    public JsonObject LastRequest => SentRequests.Last();

    /// <summary>The <c>params._meta</c> object of the most recently captured outbound request.</summary>
    public JsonObject LastMeta => LastRequest["params"]!["_meta"]!.AsObject();

    public override Task<JsonRpcMessage> SendRequestAsync(JsonRpcRequest request, RequestOptions options) =>
      _inner.SendRequestAsync(request, options);

    public override Task SendNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken = default) =>
      _inner.SendNotificationAsync(notification, cancellationToken);

    public override Task<SubscriptionHandle> OpenSubscriptionAsync(
      JsonRpcRequest listenRequest,
      Action<JsonRpcNotification> onNotification,
      CancellationToken cancellationToken = default) =>
      _inner.OpenSubscriptionAsync(listenRequest, onNotification, cancellationToken);

    public override ValueTask DisposeAsync() => _inner.DisposeAsync();
  }

  /// <summary>Builds a fully featured server covering every client convenience method.</summary>
  private static McpServer BuildServer() => BuildServer(out _);

  private static McpServer BuildServer(out ServerCapabilities capabilities)
  {
    capabilities = new ServerCapabilities
    {
      Tools = new ToolsCapability { ListChanged = true },
      Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
      Prompts = new PromptsCapability { ListChanged = true },
      Completions = new JsonObject(),
      Logging = new JsonObject(),
    };

    var server = new McpServer(
      new Implementation { Name = "behaviour-server", Title = "Behaviour Server", Version = "9.9.9" },
      capabilities,
      instructions: "A server for client behaviour tests.");

    server.RegisterTool(
      new Tool { Name = "echo", InputSchema = Obj("""{"type":"object","properties":{"text":{"type":"string"}}}""") },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("text", "hi"))));

    server.RegisterTool(
      new Tool { Name = "boom", InputSchema = Obj("""{"type":"object"}""") },
      _ => Task.FromResult(CallToolResult.FromError("tool blew up")));

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

  /// <summary>Wires an <see cref="McpClient"/> over a <see cref="CapturingTransport"/> to a fresh server.</summary>
  private static (McpClient client, CapturingTransport transport) Connect(
    ClientCapabilities? capabilities = null,
    Implementation? clientInfo = null)
  {
    var transport = new CapturingTransport(BuildServer());
    var client = new McpClient(
      transport,
      clientInfo ?? new Implementation { Name = "behaviour-client", Title = "Behaviour Client", Version = "3.2.1" },
      capabilities);
    return (client, transport);
  }

  // ───────────────────────── _meta envelope: present on EVERY method (§4.3) ─────────────────────────

  [Fact]
  public async Task Discover_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task ListTools_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task CallTool_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", Obj("""{"text":"hi"}"""));
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task ReadResource_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ReadResourceAsync("docs://readme");
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task ListResources_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListResourcesAsync();
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task ListResourceTemplates_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListResourceTemplatesAsync();
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task ListPrompts_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListPromptsAsync();
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task GetPrompt_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.GetPromptAsync("greeting", new Dictionary<string, string> { ["name"] = "Ada" });
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task Complete_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "language", Value = "eng" });
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task Ping_stamps_the_meta_envelope()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.PingAsync();
    AssertEnvelope(transport.LastMeta, "behaviour-client");
  }

  [Fact]
  public async Task Every_method_carries_the_protocol_version_key()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    await client.CallToolAsync("echo");
    await client.ReadResourceAsync("docs://readme");
    await client.ListResourcesAsync();
    await client.ListResourceTemplatesAsync();
    await client.ListPromptsAsync();
    await client.GetPromptAsync("greeting", new Dictionary<string, string> { ["name"] = "Ada" });
    await client.CompleteAsync(new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "language", Value = "e" });
    await client.PingAsync();

    Assert.All(transport.SentRequests, req =>
    {
      var meta = req["params"]!["_meta"]!.AsObject();
      Assert.True(meta.ContainsKey(MetaKeys.ProtocolVersion));
      Assert.True(meta.ContainsKey(MetaKeys.ClientInfo));
      Assert.True(meta.ContainsKey(MetaKeys.ClientCapabilities));
    });
  }

  [Fact]
  public async Task Meta_protocol_version_is_the_current_revision()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    Assert.Equal(ProtocolRevision.Current, transport.LastMeta[MetaKeys.ProtocolVersion]!.GetValue<string>());
  }

  [Fact]
  public async Task Meta_client_info_round_trips_name_and_version()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    var info = transport.LastMeta[MetaKeys.ClientInfo]!.AsObject();
    Assert.Equal("behaviour-client", info["name"]!.GetValue<string>());
    Assert.Equal("3.2.1", info["version"]!.GetValue<string>());
  }

  [Fact]
  public async Task Meta_client_info_carries_optional_title()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    var info = transport.LastMeta[MetaKeys.ClientInfo]!.AsObject();
    Assert.Equal("Behaviour Client", info["title"]!.GetValue<string>());
  }

  [Fact]
  public async Task Meta_client_capabilities_reflects_declared_elicitation()
  {
    var caps = new ClientCapabilities { Elicitation = new ElicitationCapability { Form = new JsonObject() } };
    var transport = new CapturingTransport(BuildServer());
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" }, caps);
    await client.DiscoverAsync();
    var declared = transport.LastMeta[MetaKeys.ClientCapabilities]!.AsObject();
    Assert.True(declared.ContainsKey("elicitation"));
  }

  [Fact]
  public async Task Meta_client_capabilities_is_empty_object_when_none_declared()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    var declared = transport.LastMeta[MetaKeys.ClientCapabilities]!.AsObject();
    // ClientCapabilities.None serializes to an empty object — present, but with no declared flags.
    Assert.False(declared.ContainsKey("elicitation"));
    Assert.False(declared.ContainsKey("sampling"));
  }

  [Fact]
  public async Task Custom_client_info_name_is_what_lands_on_the_wire()
  {
    var transport = new CapturingTransport(BuildServer());
    await using var client = new McpClient(transport, new Implementation { Name = "custom-host", Version = "7.7.7" });
    await client.DiscoverAsync();
    Assert.Equal("custom-host", transport.LastMeta[MetaKeys.ClientInfo]!["name"]!.GetValue<string>());
  }

  // ───────────────────────── request ids: unique + monotonic (§3.2) ─────────────────────────

  [Fact]
  public async Task Request_ids_are_unique_across_calls()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    await client.ListResourcesAsync();
    await client.ListPromptsAsync();
    await client.PingAsync();

    var ids = transport.SentRequests.Select(r => r["id"]!.GetValue<long>()).ToList();
    Assert.Equal(ids.Count, ids.Distinct().Count());
  }

  [Fact]
  public async Task Request_ids_increase_monotonically()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    await client.ListResourcesAsync();
    await client.PingAsync();

    var ids = transport.SentRequests.Select(r => r["id"]!.GetValue<long>()).ToList();
    for (var i = 1; i < ids.Count; i++)
    {
      Assert.True(ids[i] > ids[i - 1], $"id {ids[i]} should be greater than {ids[i - 1]}");
    }
  }

  [Fact]
  public async Task First_request_id_is_one()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    Assert.Equal(1L, transport.SentRequests.First()["id"]!.GetValue<long>());
  }

  [Fact]
  public async Task Request_ids_are_json_numbers_not_strings()
  {
    var (client, transport) = Connect();
    await using var _ = client;
    await client.DiscoverAsync();
    Assert.Equal(JsonValueKind.Number, transport.LastRequest["id"]!.GetValueKind());
  }

  // ───────────────────────── NegotiatedVersion / ServerInfo / capabilities (§5) ─────────────────────────

  [Fact]
  public async Task NegotiatedVersion_is_null_before_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    Assert.Null(client.NegotiatedVersion);
  }

  [Fact]
  public async Task NegotiatedVersion_is_current_after_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    Assert.Equal(ProtocolRevision.Current, client.NegotiatedVersion);
  }

  [Fact]
  public async Task IsConnected_flips_on_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    Assert.False(client.IsConnected);
    await client.DiscoverAsync();
    Assert.True(client.IsConnected);
  }

  [Fact]
  public async Task ServerInfo_is_null_before_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    Assert.Null(client.ServerInfo);
  }

  [Fact]
  public async Task ServerInfo_is_populated_after_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    Assert.Equal("behaviour-server", client.ServerInfo!.Name);
    Assert.Equal("9.9.9", client.ServerInfo!.Version);
  }

  [Fact]
  public async Task ServerCapabilities_is_null_before_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    Assert.Null(client.ServerCapabilities);
  }

  [Fact]
  public async Task ServerCapabilities_is_populated_after_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    Assert.NotNull(client.ServerCapabilities!.Tools);
    Assert.NotNull(client.ServerCapabilities!.Resources);
    Assert.NotNull(client.ServerCapabilities!.Prompts);
  }

  [Fact]
  public async Task ClientCapabilities_property_reflects_constructor_argument()
  {
    var caps = new ClientCapabilities { Sampling = new SamplingCapability() };
    var transport = new CapturingTransport(BuildServer());
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" }, caps);
    Assert.Same(caps, client.ClientCapabilities);
  }

  [Fact]
  public async Task ClientCapabilities_defaults_to_none()
  {
    var transport = new CapturingTransport(BuildServer());
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    Assert.Same(ClientCapabilities.None, client.ClientCapabilities);
  }

  [Fact]
  public async Task Discover_returns_supported_versions_including_current()
  {
    var (client, _) = Connect();
    await using var __ = client;
    var result = await client.DiscoverAsync();
    Assert.Contains(ProtocolRevision.Current, result.SupportedVersions);
  }

  [Fact]
  public async Task Discover_returns_server_instructions()
  {
    var (client, _) = Connect();
    await using var __ = client;
    var result = await client.DiscoverAsync();
    Assert.Equal("A server for client behaviour tests.", result.Instructions);
  }

  // ───────────────────────── ServerSupports predicate (§6.3) ─────────────────────────

  [Fact]
  public async Task ServerSupports_is_false_before_discover()
  {
    var (client, _) = Connect();
    await using var __ = client;
    Assert.False(client.ServerSupports(c => c.Tools is not null));
  }

  [Fact]
  public async Task ServerSupports_true_for_advertised_tools()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    Assert.True(client.ServerSupports(c => c.Tools is not null));
  }

  [Fact]
  public async Task ServerSupports_true_for_advertised_resources()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    Assert.True(client.ServerSupports(c => c.Resources is not null));
  }

  [Fact]
  public async Task ServerSupports_false_for_unadvertised_capability()
  {
    var bare = new McpServer(new Implementation { Name = "bare", Version = "1" }, new ServerCapabilities());
    await using var client = InMemory.Connect(bare);
    await client.DiscoverAsync();
    Assert.False(client.ServerSupports(c => c.Tools is not null));
  }

  // ───────────────────────── typed convenience results (§16/§17/§18/§19) ─────────────────────────

  [Fact]
  public async Task ListTools_returns_typed_tools()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    ListToolsResult result = await client.ListToolsAsync();
    Assert.Contains(result.Tools, t => t.Name == "echo");
  }

  [Fact]
  public async Task ListResources_returns_typed_resources()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    ListResourcesResult result = await client.ListResourcesAsync();
    Assert.Contains(result.Resources, r => r.Uri == "docs://readme");
  }

  [Fact]
  public async Task ListResourceTemplates_returns_typed_templates()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    ListResourceTemplatesResult result = await client.ListResourceTemplatesAsync();
    Assert.Contains(result.ResourceTemplates, t => t.UriTemplate == "weather://{city}/current");
  }

  [Fact]
  public async Task ListPrompts_returns_typed_prompts()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    ListPromptsResult result = await client.ListPromptsAsync();
    Assert.Contains(result.Prompts, p => p.Name == "greeting");
  }

  [Fact]
  public async Task GetPrompt_returns_typed_messages()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    GetPromptResult result = await client.GetPromptAsync("greeting", new Dictionary<string, string> { ["name"] = "Ada" });
    var text = Assert.IsType<TextContent>(result.Messages[0].Content);
    Assert.Contains("Ada", text.Text);
  }

  [Fact]
  public async Task ReadResource_returns_typed_contents()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    ReadResourceResult result = await client.ReadResourceAsync("docs://readme");
    Assert.Equal("# Readme", result.Contents[0].Text);
  }

  [Fact]
  public async Task ReadResource_via_template_returns_expanded_contents()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    ReadResourceResult result = await client.ReadResourceAsync("weather://oslo/current");
    Assert.Contains("oslo", result.Contents[0].Text);
  }

  [Fact]
  public async Task Complete_returns_typed_completion_values()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    CompleteResult result = await client.CompleteAsync(
      new PromptReference { Name = "greeting" }, new CompletionArgument { Name = "language", Value = "eng" });
    Assert.Equal(["english"], result.Completion.Values);
  }

  [Fact]
  public async Task Complete_on_resource_template_returns_values()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    CompleteResult result = await client.CompleteAsync(
      new ResourceTemplateReference { Uri = "weather://{city}/current" }, new CompletionArgument { Name = "city", Value = "os" });
    Assert.Equal(["oslo"], result.Completion.Values);
  }

  [Fact]
  public async Task CallTool_returns_raw_result_with_content()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var result = await client.CallToolAsync("echo", Obj("""{"text":"yo"}"""));
    Assert.Equal("yo", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task CallTool_with_null_arguments_sends_empty_arguments_object()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo");
    var args = transport.LastRequest["params"]!["arguments"]!.AsObject();
    Assert.Empty(args);
  }

  [Fact]
  public async Task Tool_execution_failure_is_a_result_flag_not_a_protocol_error()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var result = await client.CallToolAsync("boom");
    Assert.True(result["isError"]!.GetValue<bool>());
  }

  [Fact]
  public async Task Ping_completes_without_throwing()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.PingAsync(); // Should not throw.
  }

  [Fact]
  public async Task Pagination_cursor_is_echoed_into_the_request_params()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    // The opaque test cursor is echoed into the request params; the server rejects it as invalid
    // (it isn't a cursor it minted), which is fine here — we only assert the client transmitted it.
    try { await client.ListToolsAsync("CURSOR-XYZ"); }
    catch (McpError) { /* expected: -32602 for an unrecognized cursor */ }
    Assert.Equal("CURSOR-XYZ", transport.LastRequest["params"]!["cursor"]!.GetValue<string>());
  }

  [Fact]
  public async Task No_cursor_means_no_cursor_param()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    Assert.False(transport.LastRequest["params"]!.AsObject().ContainsKey("cursor"));
  }

  // ───────────────────────── JSON-RPC errors → McpError with the right code (§22) ─────────────────────────

  [Fact]
  public async Task Unknown_tool_surfaces_as_invalid_params()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("does-not-exist"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Missing_required_prompt_argument_surfaces_as_invalid_params()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.GetPromptAsync("greeting"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Unknown_resource_surfaces_as_invalid_params()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ReadResourceAsync("docs://missing"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Unknown_resource_error_data_carries_the_uri()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ReadResourceAsync("docs://missing"));
    Assert.Equal("docs://missing", error.ErrorData!["uri"]!.GetValue<string>());
  }

  [Fact]
  public async Task Method_behind_undeclared_capability_surfaces_as_method_not_found()
  {
    var bare = new McpServer(new Implementation { Name = "bare", Version = "1" }, new ServerCapabilities());
    await using var client = InMemory.Connect(bare);
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.ListPromptsAsync());
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  [Fact]
  public async Task Tasks_method_on_a_non_tasks_server_is_missing_capability()
  {
    // R-25.7-d: the behaviour server does not advertise the Tasks extension, so tasks/get is gated as
    // -32003 (missing required capability), NOT -32601 — matching the TypeScript taskOp gate. The
    // complementary "client did not declare the extension" path is covered in TasksLifecycleTests.
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.GetTaskAsync("task-123"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
  }

  [Fact]
  public async Task Error_response_preserves_the_error_data_payload()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolAsync("does-not-exist"));
    Assert.NotNull(error.ErrorData);
  }

  [Fact]
  public async Task RequestAsync_for_unknown_method_surfaces_as_method_not_found()
  {
    var (client, _) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() => client.RequestAsync("totally/unknown"));
    Assert.Equal(ErrorCodes.MethodNotFound, error.Code);
  }

  // ───────────────────────── RequestOptions.Meta extra keys (§4.2/§15.4) ─────────────────────────

  [Fact]
  public async Task RequestOptions_meta_extra_key_appears_in_the_outbound_meta()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", Obj("""{"text":"hi"}"""), new RequestOptions
    {
      Meta = new JsonObject { [MetaKeys.TraceParent] = "00-trace-span-01" },
    });
    Assert.Equal("00-trace-span-01", transport.LastMeta[MetaKeys.TraceParent]!.GetValue<string>());
  }

  [Fact]
  public async Task RequestOptions_meta_extra_key_does_not_displace_protocol_keys()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", null, new RequestOptions
    {
      Meta = new JsonObject { [MetaKeys.TraceParent] = "00-abc-def-01" },
    });
    AssertEnvelope(transport.LastMeta, "behaviour-client");
    Assert.Equal("00-abc-def-01", transport.LastMeta[MetaKeys.TraceParent]!.GetValue<string>());
  }

  [Fact]
  public async Task RequestOptions_meta_carries_multiple_trace_keys()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", null, new RequestOptions
    {
      Meta = new JsonObject
      {
        [MetaKeys.TraceParent] = "tp",
        [MetaKeys.TraceState] = "ts",
        [MetaKeys.Baggage] = "bg",
      },
    });
    Assert.Equal("tp", transport.LastMeta[MetaKeys.TraceParent]!.GetValue<string>());
    Assert.Equal("ts", transport.LastMeta[MetaKeys.TraceState]!.GetValue<string>());
    Assert.Equal("bg", transport.LastMeta[MetaKeys.Baggage]!.GetValue<string>());
  }

  [Fact]
  public async Task RequestOptions_meta_third_party_key_is_carried_verbatim()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", null, new RequestOptions
    {
      Meta = new JsonObject { ["com.example/tenant"] = "acme" },
    });
    Assert.Equal("acme", transport.LastMeta["com.example/tenant"]!.GetValue<string>());
  }

  // ───────────────────────── RequestOptions.ProgressToken → _meta.progressToken (§15.1.2) ─────────────────────────

  [Fact]
  public async Task ProgressToken_string_appears_in_the_outbound_meta()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", null, new RequestOptions { ProgressToken = "p-1" });
    Assert.Equal("p-1", transport.LastMeta[MetaKeys.ProgressToken]!.GetValue<string>());
  }

  [Fact]
  public async Task ProgressToken_numeric_appears_as_a_json_number()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", null, new RequestOptions { ProgressToken = 42L });
    var token = transport.LastMeta[MetaKeys.ProgressToken]!;
    Assert.Equal(JsonValueKind.Number, token.GetValueKind());
    Assert.Equal(42L, token.GetValue<long>());
  }

  [Fact]
  public async Task No_progress_token_means_no_progress_token_key()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo");
    Assert.False(transport.LastMeta.ContainsKey(MetaKeys.ProgressToken));
  }

  [Fact]
  public async Task ProgressToken_coexists_with_extra_meta()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", null, new RequestOptions
    {
      ProgressToken = "pt",
      Meta = new JsonObject { [MetaKeys.TraceParent] = "tp" },
    });
    Assert.Equal("pt", transport.LastMeta[MetaKeys.ProgressToken]!.GetValue<string>());
    Assert.Equal("tp", transport.LastMeta[MetaKeys.TraceParent]!.GetValue<string>());
  }

  // ───────────────────────── OnSend/OnReceive taps fire (§9) ─────────────────────────

  [Fact]
  public async Task OnSend_tap_fires_for_a_request()
  {
    var transport = new CapturingTransport(BuildServer());
    var sent = new List<JsonNode>();
    transport.OnSend = sent.Add;
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    await client.DiscoverAsync();
    Assert.Contains(sent.OfType<JsonObject>(), o => o["method"]?.GetValue<string>() == McpMethods.Discover);
  }

  [Fact]
  public async Task OnReceive_tap_fires_for_a_response()
  {
    var transport = new CapturingTransport(BuildServer());
    var received = new List<JsonNode>();
    transport.OnReceive = received.Add;
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    await client.DiscoverAsync();
    Assert.Contains(received.OfType<JsonObject>(), o => o.ContainsKey("result"));
  }

  [Fact]
  public async Task OnSend_tap_sees_the_jsonrpc_version_on_the_frame()
  {
    var transport = new CapturingTransport(BuildServer());
    JsonNode? captured = null;
    transport.OnSend = node => captured ??= node;
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    await client.DiscoverAsync();
    Assert.Equal("2.0", captured!.AsObject()["jsonrpc"]!.GetValue<string>());
  }

  [Fact]
  public async Task OnReceive_tap_sees_the_response_id_matching_the_request()
  {
    var transport = new CapturingTransport(BuildServer());
    await using var client = new McpClient(transport, new Implementation { Name = "c", Version = "1" });
    await client.DiscoverAsync();
    var requestId = transport.Sent.OfType<JsonObject>().First()["id"]!.GetValue<long>();
    var responseId = transport.Received.OfType<JsonObject>().First()["id"]!.GetValue<long>();
    Assert.Equal(requestId, responseId);
  }

  [Fact]
  public async Task OnSend_and_OnReceive_both_capture_every_round_trip()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    await client.PingAsync();
    // Three requests sent, three responses received.
    Assert.Equal(3, transport.SentRequests.Count());
    Assert.Equal(3, transport.Received.OfType<JsonObject>().Count(o => o.ContainsKey("result") || o.ContainsKey("error")));
  }

  // ───────────────────────── frame shape (§3.1/§3.3) ─────────────────────────

  [Fact]
  public async Task Every_request_frame_carries_jsonrpc_2_0()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.ListToolsAsync();
    await client.PingAsync();
    Assert.All(transport.SentRequests, req => Assert.Equal("2.0", req["jsonrpc"]!.GetValue<string>()));
  }

  [Fact]
  public async Task Every_request_frame_carries_a_method_and_an_id()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.ListResourcesAsync();
    Assert.All(transport.SentRequests, req =>
    {
      Assert.True(req.ContainsKey("method"));
      Assert.True(req.ContainsKey("id"));
    });
  }

  [Fact]
  public async Task Request_method_names_match_the_called_operation()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    Assert.Equal(McpMethods.Discover, transport.LastRequest["method"]!.GetValue<string>());
    await client.ListToolsAsync();
    Assert.Equal(McpMethods.ToolsList, transport.LastRequest["method"]!.GetValue<string>());
    await client.CallToolAsync("echo");
    Assert.Equal(McpMethods.ToolsCall, transport.LastRequest["method"]!.GetValue<string>());
    await client.ReadResourceAsync("docs://readme");
    Assert.Equal(McpMethods.ResourcesRead, transport.LastRequest["method"]!.GetValue<string>());
    await client.ListPromptsAsync();
    Assert.Equal(McpMethods.PromptsList, transport.LastRequest["method"]!.GetValue<string>());
    await client.PingAsync();
    Assert.Equal(McpMethods.Ping, transport.LastRequest["method"]!.GetValue<string>());
  }

  [Fact]
  public async Task CallTool_request_params_carry_name_and_arguments()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.CallToolAsync("echo", Obj("""{"text":"x"}"""));
    var prms = transport.LastRequest["params"]!.AsObject();
    Assert.Equal("echo", prms["name"]!.GetValue<string>());
    Assert.Equal("x", prms["arguments"]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task GetPrompt_request_params_carry_name_and_arguments()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.GetPromptAsync("greeting", new Dictionary<string, string> { ["name"] = "Ada" });
    var prms = transport.LastRequest["params"]!.AsObject();
    Assert.Equal("greeting", prms["name"]!.GetValue<string>());
    Assert.Equal("Ada", prms["arguments"]!["name"]!.GetValue<string>());
  }

  [Fact]
  public async Task ReadResource_request_params_carry_the_uri()
  {
    var (client, transport) = Connect();
    await using var __ = client;
    await client.DiscoverAsync();
    await client.ReadResourceAsync("docs://readme");
    Assert.Equal("docs://readme", transport.LastRequest["params"]!["uri"]!.GetValue<string>());
  }

  // ───────────────────────── request-scoped notifications still flow (§15) ─────────────────────────

  [Fact]
  public async Task OnNotification_receives_request_scoped_progress()
  {
    // Build a server whose tool reports progress, and confirm the client's per-request
    // OnNotification sink fires for it.
    var server = new McpServer(
      new Implementation { Name = "n", Version = "1" },
      new ServerCapabilities { Tools = new ToolsCapability(), Logging = new JsonObject() });
    server.RegisterTool(
      new Tool { Name = "tick", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        await ctx.ReportProgressAsync(1, 1);
        return CallToolResult.FromText("done");
      });
    await using var client = InMemory.Connect(server);
    await client.DiscoverAsync();

    var notes = new List<JsonRpcNotification>();
    await client.CallToolAsync("tick", null, new RequestOptions { ProgressToken = "p", OnNotification = notes.Add });
    Assert.Contains(notes, n => n.Method == McpMethods.NotificationsProgress);
  }

  // ───────────────────────── §16.6 client-side output validation (CallToolValidatedAsync) ─────────────────────────

  /// <summary>
  /// A minimal request handler that returns canned <c>tools/list</c> and <c>tools/call</c> results,
  /// bypassing the real server's own output validation so a test can inject a non-conforming result and
  /// assert that the CLIENT rejects it on receipt (§3.6, §16.6).
  /// </summary>
  private sealed class CannedToolHandler : IMcpRequestHandler
  {
    private readonly JsonObject _listResult;
    private readonly JsonObject _callResult;

    public CannedToolHandler(JsonObject listResult, JsonObject callResult)
    {
      _listResult = listResult;
      _callResult = callResult;
    }

    public Task<JsonRpcMessage> HandleRequestAsync(JsonRpcRequest request, IServerNotifier notifier, AuthInfo? authInfo, CancellationToken cancellationToken)
    {
      JsonObject result = request.Method switch
      {
        McpMethods.ToolsList => _listResult,
        McpMethods.ToolsCall => _callResult,
        _ => new JsonObject { ["resultType"] = "complete" },
      };
      return Task.FromResult<JsonRpcMessage>(new JsonRpcSuccessResponse(request.Id, (JsonObject)result.DeepClone()));
    }

    public Task HandleNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken) => Task.CompletedTask;
  }

  private static McpClient ConnectCanned(JsonObject listResult, JsonObject callResult) =>
    new(new CapturingTransport(new CannedToolHandler(listResult, callResult)),
        new Implementation { Name = "behaviour-client", Version = "3.2.1" });

  private static JsonObject ToolListWithNumberSchema() => Obj(
    """{"tools":[{"name":"calc","inputSchema":{"type":"object"},"outputSchema":{"type":"object","properties":{"n":{"type":"number"}},"required":["n"]}}],"resultType":"complete","ttlMs":0,"cacheScope":"private"}""");

  [Fact]
  public async Task CallToolValidatedAsync_accepts_structured_content_that_conforms_to_the_output_schema()
  {
    var call = Obj("""{"resultType":"complete","content":[],"structuredContent":{"n":5}}""");
    await using var client = ConnectCanned(ToolListWithNumberSchema(), call);
    await client.ListToolsAsync();
    var result = await client.CallToolValidatedAsync("calc");
    Assert.Equal(5, result["structuredContent"]!["n"]!.GetValue<int>());
  }

  [Fact]
  public async Task CallToolValidatedAsync_rejects_structured_content_that_violates_the_output_schema()
  {
    // §16.6: a completed result whose structuredContent breaks the tool's declared outputSchema is rejected.
    var call = Obj("""{"resultType":"complete","content":[],"structuredContent":{"n":"not-a-number"}}""");
    await using var client = ConnectCanned(ToolListWithNumberSchema(), call);
    await client.ListToolsAsync();
    await Assert.ThrowsAsync<McpError>(() => client.CallToolValidatedAsync("calc"));
  }

  [Fact]
  public async Task CallToolValidatedAsync_rejects_an_unrecognized_result_type()
  {
    // §3.6: a result whose resultType the receiver does not recognize MUST be treated as an error.
    var call = Obj("""{"resultType":"bogus","content":[]}""");
    await using var client = ConnectCanned(ToolListWithNumberSchema(), call);
    await client.ListToolsAsync();
    await Assert.ThrowsAsync<McpError>(() => client.CallToolValidatedAsync("calc"));
  }

  [Fact]
  public async Task CallToolValidatedAsync_skips_validation_when_the_output_schema_is_unknown()
  {
    // Without a prior ListToolsAsync the client has no schema for the tool, so it cannot (and does not)
    // validate — the raw result is returned even though it would violate the schema.
    var call = Obj("""{"resultType":"complete","content":[],"structuredContent":{"n":"not-a-number"}}""");
    await using var client = ConnectCanned(ToolListWithNumberSchema(), call);
    var result = await client.CallToolValidatedAsync("calc"); // never listed → no schema known
    Assert.Equal("not-a-number", result["structuredContent"]!["n"]!.GetValue<string>());
  }

  // ───────────────────────── shared assertions ─────────────────────────

  /// <summary>Asserts the three REQUIRED per-request <c>_meta</c> keys are present and well-formed (§4.3).</summary>
  private static void AssertEnvelope(JsonObject meta, string expectedClientName)
  {
    Assert.Equal(ProtocolRevision.Current, meta[MetaKeys.ProtocolVersion]!.GetValue<string>());
    Assert.Equal(expectedClientName, meta[MetaKeys.ClientInfo]!["name"]!.GetValue<string>());
    Assert.IsType<JsonObject>(meta[MetaKeys.ClientCapabilities]);
  }
}
