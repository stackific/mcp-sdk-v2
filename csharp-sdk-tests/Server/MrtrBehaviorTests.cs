using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Exhaustive behavior tests for the multi-round-trip mechanism (spec §11), exercised through the
/// in-memory harness: the three input-request kinds (elicitation §20, sampling §21, roots §21) each
/// suspend a tool with an <c>input_required</c> result, are fulfilled by a registered client handler,
/// and the retried call completes carrying the answered data. Capability gating returns <c>-32003</c>
/// (§11.5) with the precise required capability in <c>data.requiredCapabilities</c>; multi-input tools
/// complete after several retries; handler faults and unknown input kinds surface as errors.
/// Error CODES are asserted, never messages.
/// </summary>
public sealed class MrtrBehaviorTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static JsonNode Serialize<T>(T value) => JsonSerializer.SerializeToNode(value, McpJson.Options)!;

  // ───────────────────────── Server factory ─────────────────────────

  /// <summary>
  /// Builds a server whose tools each drive exactly one MRTR flavor. Every tool surfaces the answered
  /// data verbatim into its text result so a completed retry is observable, and surfaces the chosen
  /// elicitation action for the decline/cancel branches.
  /// </summary>
  private static McpServer BuildServer()
  {
    var server = new McpServer(
      new Implementation { Name = "mrtr-behavior-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });

    // Form-mode elicitation: echo the accepted username, or the declined/cancelled action.
    server.RegisterTool(
      new Tool { Name = "register_user", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var result = await ctx.ElicitInputAsync(new ElicitRequestFormParams
        {
          Message = "Please register.",
          RequestedSchema = Obj("""{"type":"object","properties":{"username":{"type":"string"}},"required":["username"]}"""),
        });
        return result is { Action: ElicitationAction.Accept, Content: { } content }
          ? CallToolResult.FromText($"Registered {content["username"]!.GetValue<string>()}.")
          : CallToolResult.FromText($"User chose {result.Action}.");
      });

    // URL-mode elicitation: echo the action (URL mode never returns content, §20.5).
    server.RegisterTool(
      new Tool { Name = "authorize", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var result = await ctx.ElicitInputAsync(new ElicitRequestURLParams
        {
          Message = "Authorize.",
          ElicitationId = "elicit-1",
          Url = "https://example.test/authorize",
        });
        return CallToolResult.FromText($"Authorization {result.Action}.");
      });

    // Sampling: echo the produced model + the first text block.
    server.RegisterTool(
      new Tool { Name = "summarize", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var result = await ctx.CreateMessageAsync(new CreateMessageRequestParams
        {
          Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text("Summarize.")] }],
          MaxTokens = 100,
        });
        var text = ((SamplingTextContent)result.Content[0]).Text;
        return CallToolResult.FromText($"{result.Model}: {text}");
      });

    // Roots: echo the count + first root URI.
    server.RegisterTool(
      new Tool { Name = "scan_roots", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var roots = await ctx.ListRootsAsync();
        var first = roots.Count > 0 ? roots[0].Uri : "(none)";
        return CallToolResult.FromText($"{roots.Count} roots, first {first}.");
      });

    // Two inputs across two rounds: counts the rounds (each retry re-runs the handler with a fresh
    // ToolContext, so the first elicitation is answered from inputResponses, then the second signals).
    server.RegisterTool(
      new Tool { Name = "two_step", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var first = await ctx.ElicitInputAsync(new ElicitRequestFormParams
        {
          Message = "First.",
          RequestedSchema = Obj("""{"type":"object","properties":{"a":{"type":"string"}}}"""),
        });
        var second = await ctx.ElicitInputAsync(new ElicitRequestFormParams
        {
          Message = "Second.",
          RequestedSchema = Obj("""{"type":"object","properties":{"b":{"type":"string"}}}"""),
        });
        var a = first.Content!["a"]!.GetValue<string>();
        var b = second.Content!["b"]!.GetValue<string>();
        return CallToolResult.FromText($"{a}+{b}");
      });

    return server;
  }

  private static ClientCapabilities FormElicitation() =>
    new() { Elicitation = new ElicitationCapability { Form = new JsonObject() } };

  private static ClientCapabilities UrlElicitation() =>
    new() { Elicitation = new ElicitationCapability { Form = new JsonObject(), Url = new JsonObject() } };

  private static ClientCapabilities Sampling() =>
    new() { Sampling = new SamplingCapability() };

  private static ClientCapabilities Roots() =>
    new() { Roots = new JsonObject() };

  // ───────────────────────── Form-mode elicitation round-trip ─────────────────────────

  public static IEnumerable<object[]> ElicitationActions() =>
    [[ElicitationAction.Accept], [ElicitationAction.Decline], [ElicitationAction.Cancel]];

  [Theory]
  [MemberData(nameof(ElicitationActions))]
  public async Task Form_elicitation_round_trip_surfaces_the_action(ElicitationAction action)
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var prompted = false;
    client.RegisterInputHandler(McpMethods.ElicitationCreate, parameters =>
    {
      prompted = true;
      Assert.Equal("form", parameters!["mode"]!.GetValue<string>());
      var response = action == ElicitationAction.Accept
        ? new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["username"] = "neo" } }
        : new ElicitResult { Action = action };
      return Task.FromResult(Serialize(response));
    });

    var result = await client.CallToolWithInputAsync("register_user");

    Assert.True(prompted);
    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    var expected = action == ElicitationAction.Accept ? "Registered neo." : $"User chose {action}.";
    Assert.Equal(expected, result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Form_elicitation_accept_with_content_completes_the_tool()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult(Serialize(new ElicitResult
      {
        Action = ElicitationAction.Accept,
        Content = new JsonObject { ["username"] = "trinity" },
      })));

    var result = await client.CallToolWithInputAsync("register_user");
    Assert.Equal("Registered trinity.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Form_elicitation_decline_is_surfaced_to_the_tool()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult(Serialize(new ElicitResult { Action = ElicitationAction.Decline })));

    var result = await client.CallToolWithInputAsync("register_user");
    Assert.Equal("User chose Decline.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Form_elicitation_cancel_is_surfaced_to_the_tool()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult(Serialize(new ElicitResult { Action = ElicitationAction.Cancel })));

    var result = await client.CallToolWithInputAsync("register_user");
    Assert.Equal("User chose Cancel.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task First_round_is_input_required_then_the_retry_completes()
  {
    // Drive the loop by hand to observe the suspended round (resultType input_required) explicitly.
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var firstRound = await client.CallToolAsync("register_user");
    Assert.Equal("input_required", firstRound["resultType"]!.GetValue<string>());
    Assert.NotNull(firstRound["inputRequests"]);

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult(Serialize(new ElicitResult
      {
        Action = ElicitationAction.Accept,
        Content = new JsonObject { ["username"] = "morpheus" },
      })));

    var completed = await client.CallToolWithInputAsync("register_user");
    Assert.Equal("complete", completed["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task Input_request_carries_the_elicitation_create_method()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var firstRound = await client.CallToolAsync("register_user");
    var requests = firstRound["inputRequests"]!.AsObject();
    Assert.Single(requests);
    var only = requests.First().Value!.AsObject();
    Assert.Equal(McpMethods.ElicitationCreate, only["method"]!.GetValue<string>());
  }

  // ───────────────────────── URL-mode elicitation round-trip ─────────────────────────

  [Fact]
  public async Task Url_elicitation_round_trip_completes_the_tool()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: UrlElicitation());
    await client.DiscoverAsync();

    var prompted = false;
    client.RegisterInputHandler(McpMethods.ElicitationCreate, parameters =>
    {
      prompted = true;
      Assert.Equal("url", parameters!["mode"]!.GetValue<string>());
      Assert.Equal("https://example.test/authorize", parameters["url"]!.GetValue<string>());
      return Task.FromResult(Serialize(new ElicitResult { Action = ElicitationAction.Accept }));
    });

    var result = await client.CallToolWithInputAsync("authorize");

    Assert.True(prompted);
    Assert.Equal("Authorization Accept.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Url_elicitation_cancel_is_surfaced_to_the_tool()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: UrlElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult(Serialize(new ElicitResult { Action = ElicitationAction.Cancel })));

    var result = await client.CallToolWithInputAsync("authorize");
    Assert.Equal("Authorization Cancel.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Url_input_request_carries_the_elicitation_id()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: UrlElicitation());
    await client.DiscoverAsync();

    var firstRound = await client.CallToolAsync("authorize");
    var only = firstRound["inputRequests"]!.AsObject().First().Value!.AsObject();
    Assert.Equal("elicit-1", only["params"]!["elicitationId"]!.GetValue<string>());
  }

  // ───────────────────────── Sampling round-trip ─────────────────────────

  [Fact]
  public async Task Sampling_round_trip_returns_the_text_and_model_to_the_tool()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: Sampling());
    await client.DiscoverAsync();

    var prompted = false;
    client.RegisterInputHandler(McpMethods.SamplingCreateMessage, parameters =>
    {
      prompted = true;
      Assert.NotNull(parameters!["messages"]);
      var response = new CreateMessageResult
      {
        Role = Role.Assistant,
        Model = "test-model",
        Content = [SamplingContentBlocks.Text("a short summary")],
      };
      return Task.FromResult(Serialize(response));
    });

    var result = await client.CallToolWithInputAsync("summarize");

    Assert.True(prompted);
    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal("test-model: a short summary", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Sampling_input_request_carries_the_sampling_method()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: Sampling());
    await client.DiscoverAsync();

    var firstRound = await client.CallToolAsync("summarize");
    var only = firstRound["inputRequests"]!.AsObject().First().Value!.AsObject();
    Assert.Equal(McpMethods.SamplingCreateMessage, only["method"]!.GetValue<string>());
  }

  // ───────────────────────── Roots round-trip ─────────────────────────

  [Fact]
  public async Task Roots_round_trip_returns_the_roots_to_the_tool()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: Roots());
    await client.DiscoverAsync();

    var prompted = false;
    client.RegisterInputHandler(McpMethods.RootsList, _ =>
    {
      prompted = true;
      var response = new ListRootsResult
      {
        Roots =
        [
          new Root { Uri = "file:///workspace", Name = "workspace" },
          new Root { Uri = "file:///tmp" },
        ],
      };
      return Task.FromResult(Serialize(response));
    });

    var result = await client.CallToolWithInputAsync("scan_roots");

    Assert.True(prompted);
    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal("2 roots, first file:///workspace.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Roots_round_trip_handles_an_empty_root_list()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: Roots());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.RootsList, _ =>
      Task.FromResult(Serialize(new ListRootsResult { Roots = [] })));

    var result = await client.CallToolWithInputAsync("scan_roots");
    Assert.Equal("0 roots, first (none).", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Roots_input_request_carries_the_roots_list_method_with_no_params()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: Roots());
    await client.DiscoverAsync();

    var firstRound = await client.CallToolAsync("scan_roots");
    var only = firstRound["inputRequests"]!.AsObject().First().Value!.AsObject();
    Assert.Equal(McpMethods.RootsList, only["method"]!.GetValue<string>());
    // roots/list carries no params (the runtime passed null, §21.1.5).
    Assert.True(only["params"] is null || only["params"]!.GetValueKind() == JsonValueKind.Null);
  }

  // ───────────────────────── Capability gating (§11.5, -32003) ─────────────────────────

  [Fact]
  public async Task Missing_elicitation_capability_is_minus_32003_naming_elicitation()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("register_user"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
    Assert.NotNull(error.ErrorData!["requiredCapabilities"]!["elicitation"]);
  }

  [Fact]
  public async Task Missing_url_sub_capability_is_minus_32003_naming_elicitation_url()
  {
    // The client declared form elicitation but NOT url, so the url-mode request is gated (§11.5).
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("authorize"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
    Assert.NotNull(error.ErrorData!["requiredCapabilities"]!["elicitation"]!["url"]);
  }

  [Fact]
  public async Task Missing_sampling_capability_is_minus_32003_naming_sampling()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("summarize"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
    Assert.NotNull(error.ErrorData!["requiredCapabilities"]!["sampling"]);
  }

  [Fact]
  public async Task Missing_roots_capability_is_minus_32003_naming_roots()
  {
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("scan_roots"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
    Assert.NotNull(error.ErrorData!["requiredCapabilities"]!["roots"]);
  }

  [Fact]
  public async Task Capability_gate_fires_on_the_first_round_before_any_handler_runs()
  {
    // The gate is enforced inside the tool on the very first round, so the input handler is unused.
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var handlerRan = false;
    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
    {
      handlerRan = true;
      return Task.FromResult(Serialize(new ElicitResult { Action = ElicitationAction.Accept }));
    });

    await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("register_user"));
    Assert.False(handlerRan);
  }

  // ───────────────────────── Two inputs across rounds (counter) ─────────────────────────

  [Fact]
  public async Task Tool_requesting_two_inputs_completes_after_two_retries()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var promptCount = 0;
    client.RegisterInputHandler(McpMethods.ElicitationCreate, parameters =>
    {
      // The handler distinguishes the two requests by the field name in requestedSchema.
      var schema = parameters!["requestedSchema"]!["properties"]!.AsObject();
      promptCount++;
      var (field, value) = schema.ContainsKey("a") ? ("a", "x") : ("b", "y");
      return Task.FromResult(Serialize(new ElicitResult
      {
        Action = ElicitationAction.Accept,
        Content = new JsonObject { [field] = value },
      }));
    });

    var result = await client.CallToolWithInputAsync("two_step");

    Assert.Equal(2, promptCount);
    Assert.Equal("x+y", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Two_input_tool_suspends_again_after_the_first_answer()
  {
    // Manually answer only the first input, echoing requestState, and confirm the second round is
    // still input_required (the counter advanced to mrtr-1 for the second elicitation).
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var firstRound = await client.CallToolAsync("two_step");
    Assert.Equal("input_required", firstRound["resultType"]!.GetValue<string>());
    var firstKey = firstRound["inputRequests"]!.AsObject().First().Key;

    var inputResponses = new JsonObject
    {
      [firstKey] = Serialize(new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["a"] = "x" } }),
    };
    // inputResponses sits at the top level of tools/call params (beside name/arguments), so the call
    // goes through RequestAsync directly rather than CallToolAsync (which nests under "arguments").
    var secondRound = await client.RequestAsync(McpMethods.ToolsCall, new JsonObject
    {
      ["name"] = "two_step",
      ["arguments"] = new JsonObject(),
      ["inputResponses"] = inputResponses,
    });
    Assert.Equal("input_required", secondRound["resultType"]!.GetValue<string>());
  }

  // ───────────────────────── Handler faults & unknown kinds ─────────────────────────

  [Fact]
  public async Task Input_handler_exception_surfaces_to_the_caller()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      throw new InvalidOperationException("handler boom"));

    var error = await Assert.ThrowsAsync<InvalidOperationException>(() => client.CallToolWithInputAsync("register_user"));
    Assert.Equal("handler boom", error.Message);
  }

  [Fact]
  public async Task Async_input_handler_fault_surfaces_to_the_caller()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, async _ =>
    {
      await Task.Yield();
      throw new TimeoutException("async boom");
    });

    await Assert.ThrowsAsync<TimeoutException>(() => client.CallToolWithInputAsync("register_user"));
  }

  [Fact]
  public async Task Unknown_input_kind_without_a_handler_is_invalid_params()
  {
    // The tool requests elicitation, but the client registered no handler for that kind, so the
    // driver itself raises -32602 (§11) before any retry can be sent.
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    // No RegisterInputHandler call at all.
    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("register_user"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Handler_registered_for_a_different_kind_is_invalid_params()
  {
    // A handler for roots/list does not satisfy an elicitation/create request: still -32602.
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.RootsList, _ =>
      Task.FromResult(Serialize(new ListRootsResult { Roots = [] })));

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("register_user"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Unknown_tool_under_the_mrtr_driver_is_invalid_params()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("no_such_tool"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ───────────────────────── Further small correctness cases ─────────────────────────

  [Fact]
  public async Task Form_accept_without_content_is_not_treated_as_a_completed_registration()
  {
    // Accept but with no content: the tool's pattern requires Content to be non-null, so it falls
    // through to the action branch (Accept) rather than reading a username.
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult(Serialize(new ElicitResult { Action = ElicitationAction.Accept })));

    var result = await client.CallToolWithInputAsync("register_user");
    Assert.Equal("User chose Accept.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Roots_round_trip_works_with_both_sampling_and_roots_declared()
  {
    // Declaring extra capabilities does not interfere with the gated one.
    await using var client = InMemory.Connect(
      BuildServer(),
      capabilities: new ClientCapabilities { Sampling = new SamplingCapability(), Roots = new JsonObject() });
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.RootsList, _ =>
      Task.FromResult(Serialize(new ListRootsResult { Roots = [new Root { Uri = "file:///only" }] })));

    var result = await client.CallToolWithInputAsync("scan_roots");
    Assert.Equal("1 roots, first file:///only.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Sampling_round_trip_preserves_a_distinct_model_name()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: Sampling());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.SamplingCreateMessage, _ =>
      Task.FromResult(Serialize(new CreateMessageResult
      {
        Role = Role.Assistant,
        Model = "another-model",
        Content = [SamplingContentBlocks.Text("hello")],
      })));

    var result = await client.CallToolWithInputAsync("summarize");
    Assert.Equal("another-model: hello", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Each_call_gets_its_own_input_counter_so_repeated_calls_both_complete()
  {
    // The mrtr key counter is per-ToolContext (per request), so two independent calls each start at
    // mrtr-0 and both complete cleanly.
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult(Serialize(new ElicitResult
      {
        Action = ElicitationAction.Accept,
        Content = new JsonObject { ["username"] = "neo" },
      })));

    var first = await client.CallToolWithInputAsync("register_user");
    var second = await client.CallToolWithInputAsync("register_user");
    Assert.Equal("Registered neo.", first["content"]![0]!["text"]!.GetValue<string>());
    Assert.Equal("Registered neo.", second["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task A_plain_call_without_the_driver_returns_the_raw_input_required_result()
  {
    // CallToolAsync (no MRTR driver) returns the raw input_required result without fulfilling it.
    await using var client = InMemory.Connect(BuildServer(), capabilities: FormElicitation());
    await client.DiscoverAsync();

    var raw = await client.CallToolAsync("register_user");
    Assert.Equal("input_required", raw["resultType"]!.GetValue<string>());
    Assert.Null(raw["content"]);
  }
}
