using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for §21.2 Sampling — the capability gate (tool use without <c>sampling.tools</c>
/// ⇒ <c>-32602</c>; Deprecated <c>includeContext</c> gated by <c>sampling.context</c>), the §21.2.7
/// message-ordering / user-tool-result-exclusivity / tool_result-back-reference rules, the
/// <c>ModelPreferences</c> priority 0..1 validation, the resolvers/defaults, and the consent
/// obligations. Mirrors the TypeScript <c>sampling.test.ts</c> scenarios.
/// </summary>
public sealed class SamplingBehaviorTests
{
  // Capability fixtures (raw JSON capability maps, as carried on the wire).
  private static JsonObject DeclaredSampling => new() { ["sampling"] = new JsonObject() };
  private static JsonObject DeclaredSamplingTools => new() { ["sampling"] = new JsonObject { ["tools"] = new JsonObject() } };
  private static JsonObject DeclaredSamplingContext => new() { ["sampling"] = new JsonObject { ["context"] = new JsonObject() } };

  private static SamplingMessage UserText(string text) =>
    new() { Role = Role.User, Content = [SamplingContentBlocks.Text(text)] };

  private static CreateMessageRequestParams Request(
    IReadOnlyList<SamplingMessage>? messages = null,
    IReadOnlyList<Tool>? tools = null,
    ToolChoice? toolChoice = null,
    IncludeContext? includeContext = null,
    ModelPreferences? modelPreferences = null) =>
    new()
    {
      Messages = messages ?? [UserText("What is the capital of France?")],
      MaxTokens = 100,
      Tools = tools,
      ToolChoice = toolChoice,
      IncludeContext = includeContext,
      ModelPreferences = modelPreferences,
    };

  // ── Tool-use gating (AC-33.3 · R-21.2.3-a/b, R-21.2.4-n/o) ──

  [Fact]
  public void Server_must_not_send_a_tool_enabled_request_without_sampling_tools()
  {
    Assert.False(SamplingValidation.MayServerSendSamplingRequest(
      DeclaredSampling, Request(tools: [new Tool { Name = "t", InputSchema = new JsonObject() }])));
    Assert.False(SamplingValidation.MayServerSendSamplingRequest(
      DeclaredSampling, Request(toolChoice: new ToolChoice { Mode = ToolChoiceMode.Auto })));
  }

  [Fact]
  public void Server_may_send_a_tool_enabled_request_when_sampling_tools_declared()
  {
    Assert.True(SamplingValidation.MayServerSendSamplingRequest(
      DeclaredSamplingTools, Request(tools: [new Tool { Name = "t", InputSchema = new JsonObject() }])));
  }

  [Fact]
  public void Client_gate_rejects_tools_without_sampling_tools_with_minus_32602()
  {
    var gate = SamplingValidation.GateSamplingToolUse(
      DeclaredSampling, Request(tools: [new Tool { Name = "t", InputSchema = new JsonObject() }]));
    Assert.False(gate.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, gate.Error!.Code);
    Assert.Contains("tools", gate.Error.Message);
  }

  [Fact]
  public void Client_gate_rejects_tool_choice_without_sampling_tools_and_names_the_field()
  {
    var gate = SamplingValidation.GateSamplingToolUse(
      DeclaredSampling, Request(toolChoice: new ToolChoice { Mode = ToolChoiceMode.Required }));
    Assert.False(gate.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, gate.Error!.Code);
    Assert.Contains("toolChoice", gate.Error.Message);
  }

  [Fact]
  public void Client_gate_accepts_tool_enabled_requests_when_declared_and_non_tool_requests_always()
  {
    Assert.True(SamplingValidation.GateSamplingToolUse(
      DeclaredSamplingTools, Request(tools: [new Tool { Name = "t", InputSchema = new JsonObject() }])).Ok);
    Assert.True(SamplingValidation.GateSamplingToolUse(DeclaredSampling, Request()).Ok);
  }

  [Fact]
  public void Tools_not_declared_error_names_the_per_field_rule()
  {
    Assert.Contains("n)", SamplingValidation.BuildSamplingToolsNotDeclaredError(SamplingToolField.Tools).Message);
    Assert.Contains("o)", SamplingValidation.BuildSamplingToolsNotDeclaredError(SamplingToolField.ToolChoice).Message);
  }

  // ── includeContext gating (AC-33.4 · R-21.2.3-c, R-21.2.4-e) ──

  [Fact]
  public void Include_context_none_or_omitted_is_always_permitted()
  {
    Assert.True(SamplingValidation.MayServerSendSamplingRequest(DeclaredSampling, Request()));
    Assert.True(SamplingValidation.MayServerSendSamplingRequest(DeclaredSampling, Request(includeContext: IncludeContext.None)));
  }

  [Fact]
  public void Deprecated_include_context_values_require_sampling_context()
  {
    Assert.False(SamplingValidation.MayServerSendSamplingRequest(DeclaredSampling, Request(includeContext: IncludeContext.ThisServer)));
    Assert.False(SamplingValidation.MayServerSendSamplingRequest(DeclaredSampling, Request(includeContext: IncludeContext.AllServers)));
    Assert.True(SamplingValidation.MayServerSendSamplingRequest(DeclaredSamplingContext, Request(includeContext: IncludeContext.ThisServer)));
    Assert.True(SamplingValidation.MayServerSendSamplingRequest(DeclaredSamplingContext, Request(includeContext: IncludeContext.AllServers)));
  }

  [Fact]
  public void Deprecated_include_context_classifier()
  {
    Assert.True(SamplingValidation.IsDeprecatedIncludeContext(IncludeContext.ThisServer));
    Assert.True(SamplingValidation.IsDeprecatedIncludeContext(IncludeContext.AllServers));
    Assert.False(SamplingValidation.IsDeprecatedIncludeContext(IncludeContext.None));
  }

  // ── validateSamplingRequest (AC-33.5 · R-21.2.4-a/h) ──

  [Fact]
  public void Validate_sampling_request_rejects_empty_messages()
  {
    var result = SamplingValidation.ValidateSamplingRequest(DeclaredSampling, Request(messages: []));
    Assert.False(result.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, result.Error!.Code);
  }

  [Fact]
  public void Validate_sampling_request_passes_a_well_formed_tool_request_with_sampling_tools()
  {
    var request = Request(tools: [new Tool { Name = "get_weather", InputSchema = new JsonObject() }]);
    Assert.True(SamplingValidation.ValidateSamplingRequest(DeclaredSamplingTools, request).Ok);
  }

  // ── ModelPreferences priority 0..1 (AC-33.22 · R-21.2.9-e) ──

  [Theory]
  [InlineData(0.0, true)]
  [InlineData(1.0, true)]
  [InlineData(0.5, true)]
  [InlineData(1.5, false)]
  [InlineData(-0.1, false)]
  public void Priority_must_be_in_0_to_1(double value, bool valid)
  {
    Assert.Equal(valid, SamplingValidation.IsValidPriority(value));
  }

  [Fact]
  public void Validate_model_preferences_names_the_first_out_of_range_field()
  {
    Assert.Null(SamplingValidation.ValidateModelPreferences(new ModelPreferences { CostPriority = 0.3, SpeedPriority = 0.5 }));
    Assert.Equal("costPriority", SamplingValidation.ValidateModelPreferences(new ModelPreferences { CostPriority = 1.5 }));
    Assert.Equal("speedPriority", SamplingValidation.ValidateModelPreferences(new ModelPreferences { SpeedPriority = -0.1 }));
    Assert.Null(SamplingValidation.ValidateModelPreferences(null));
  }

  [Fact]
  public void Validate_sampling_request_rejects_out_of_range_priority()
  {
    var request = Request(modelPreferences: new ModelPreferences { IntelligencePriority = 2.0 });
    var result = SamplingValidation.ValidateSamplingRequest(DeclaredSampling, request);
    Assert.False(result.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, result.Error!.Code);
  }

  // ── Resolvers + defaults (AC-33.8, AC-33.9, AC-33.11) ──

  [Fact]
  public void Resolve_include_context_defaults_to_none()
  {
    Assert.Equal(IncludeContext.None, SamplingValidation.ResolveIncludeContext(null));
    Assert.Equal(IncludeContext.ThisServer, SamplingValidation.ResolveIncludeContext(IncludeContext.ThisServer));
  }

  [Fact]
  public void Resolve_tool_choice_defaults_omitted_to_auto()
  {
    Assert.Equal(ToolChoiceMode.Auto, SamplingValidation.ResolveToolChoice(null).Mode);
    Assert.Equal(ToolChoiceMode.Auto, SamplingValidation.ResolveToolChoice(new ToolChoice()).Mode);
    Assert.Equal(ToolChoiceMode.Required, SamplingValidation.ResolveToolChoice(new ToolChoice { Mode = ToolChoiceMode.Required }).Mode);
  }

  [Fact]
  public void Clamp_to_max_tokens_is_an_upper_bound()
  {
    Assert.Equal(100, SamplingValidation.ClampToMaxTokens(150, 100));
    Assert.Equal(40, SamplingValidation.ClampToMaxTokens(40, 100));
    Assert.Equal(100, SamplingValidation.ClampToMaxTokens(100, 100));
  }

  [Fact]
  public void Is_tool_enabled_request_detects_tools_or_tool_choice()
  {
    Assert.True(SamplingValidation.IsToolEnabledRequest(Request(tools: [new Tool { Name = "t", InputSchema = new JsonObject() }])));
    Assert.True(SamplingValidation.IsToolEnabledRequest(Request(toolChoice: new ToolChoice { Mode = ToolChoiceMode.Auto })));
    Assert.False(SamplingValidation.IsToolEnabledRequest(Request()));
  }

  // ── Stop reasons + hint matching (AC-33.20, AC-33.21, AC-33.23) ──

  [Fact]
  public void Standard_stop_reasons_classifier()
  {
    Assert.Equal(["endTurn", "stopSequence", "maxTokens", "toolUse"], SamplingValidation.StandardStopReasons);
    Assert.True(SamplingValidation.IsStandardStopReason("toolUse"));
    Assert.False(SamplingValidation.IsStandardStopReason("custom"));
  }

  [Fact]
  public void Select_first_hint_match_uses_order_sensitive_first_substring_match()
  {
    var hints = new List<ModelHint> { new() { Name = "gpt-9" }, new() { Name = "sonnet" }, new() { Name = "claude" } };
    var models = new List<string> { "claude-3-5-sonnet-20241022", "claude-3-opus" };
    var match = SamplingValidation.SelectFirstHintMatch(hints, models);
    Assert.NotNull(match);
    Assert.Equal("sonnet", match!.Hint.Name);
    Assert.Equal("claude-3-5-sonnet-20241022", match.Model);
  }

  [Fact]
  public void Select_first_hint_match_returns_null_when_nothing_matches()
  {
    Assert.Null(SamplingValidation.SelectFirstHintMatch([new ModelHint { Name = "mistral" }], ["claude-3"]));
    Assert.Null(SamplingValidation.SelectFirstHintMatch(null, ["claude-3"]));
  }

  // ── User tool_result exclusivity (AC-33.17 · R-21.2.7-a) ──

  [Fact]
  public void User_message_of_only_tool_results_is_valid()
  {
    var message = new SamplingMessage
    {
      Role = Role.User,
      Content =
      [
        new ToolResultContent { ToolUseId = "1", Content = [ContentBlocks.Text("r")] },
        new ToolResultContent { ToolUseId = "2", Content = [ContentBlocks.Text("s")] },
      ],
    };
    Assert.True(SamplingValidation.ValidateUserToolResultExclusivity(message).Ok);
  }

  [Fact]
  public void User_message_mixing_tool_result_with_text_is_rejected()
  {
    var message = new SamplingMessage
    {
      Role = Role.User,
      Content =
      [
        new ToolResultContent { ToolUseId = "1", Content = [ContentBlocks.Text("r")] },
        SamplingContentBlocks.Text("extra"),
      ],
    };
    Assert.False(SamplingValidation.ValidateUserToolResultExclusivity(message).Ok);
  }

  [Fact]
  public void User_message_without_tool_results_and_assistant_messages_are_unconstrained()
  {
    Assert.True(SamplingValidation.ValidateUserToolResultExclusivity(UserText("hi")).Ok);
    var assistant = new SamplingMessage { Role = Role.Assistant, Content = [SamplingContentBlocks.Text("x")] };
    Assert.True(SamplingValidation.ValidateUserToolResultExclusivity(assistant).Ok);
  }

  // ── Message ordering (AC-33.18 · R-21.2.7-b) ──

  [Fact]
  public void Well_formed_parallel_tool_use_result_sequence_is_accepted()
  {
    var messages = new List<SamplingMessage>
    {
      UserText("weather?"),
      new()
      {
        Role = Role.Assistant,
        Content =
        [
          new ToolUseContent { Id = "a", Name = "t", Input = new JsonObject() },
          new ToolUseContent { Id = "b", Name = "u", Input = new JsonObject() },
        ],
      },
      new()
      {
        Role = Role.User,
        Content =
        [
          new ToolResultContent { ToolUseId = "a", Content = [ContentBlocks.Text("ra")] },
          new ToolResultContent { ToolUseId = "b", Content = [ContentBlocks.Text("rb")] },
        ],
      },
    };
    Assert.True(SamplingValidation.ValidateSamplingMessageOrdering(messages).Ok);
  }

  [Fact]
  public void Ordering_rejects_a_trailing_tool_use_with_no_following_message()
  {
    var messages = new List<SamplingMessage>
    {
      UserText("weather?"),
      new() { Role = Role.Assistant, Content = [new ToolUseContent { Id = "a", Name = "t", Input = new JsonObject() }] },
    };
    var result = SamplingValidation.ValidateSamplingMessageOrdering(messages);
    Assert.False(result.Ok);
    Assert.Equal(1, result.Index);
  }

  [Fact]
  public void Ordering_rejects_a_tool_use_not_followed_by_a_user_tool_result_message()
  {
    var messages = new List<SamplingMessage>
    {
      UserText("weather?"),
      new() { Role = Role.Assistant, Content = [new ToolUseContent { Id = "a", Name = "t", Input = new JsonObject() }] },
      new() { Role = Role.Assistant, Content = [SamplingContentBlocks.Text("oops")] },
    };
    Assert.False(SamplingValidation.ValidateSamplingMessageOrdering(messages).Ok);
  }

  [Fact]
  public void Ordering_rejects_an_unmatched_tool_use_id()
  {
    var messages = new List<SamplingMessage>
    {
      UserText("weather?"),
      new() { Role = Role.Assistant, Content = [new ToolUseContent { Id = "a", Name = "t", Input = new JsonObject() }] },
      new()
      {
        Role = Role.User,
        Content = [new ToolResultContent { ToolUseId = "WRONG", Content = [ContentBlocks.Text("r")] }],
      },
    };
    Assert.False(SamplingValidation.ValidateSamplingMessageOrdering(messages).Ok);
  }

  [Fact]
  public void Ordering_rejects_a_following_user_message_mixing_a_non_tool_result_block()
  {
    var messages = new List<SamplingMessage>
    {
      UserText("weather?"),
      new() { Role = Role.Assistant, Content = [new ToolUseContent { Id = "a", Name = "t", Input = new JsonObject() }] },
      new()
      {
        Role = Role.User,
        Content =
        [
          new ToolResultContent { ToolUseId = "a", Content = [ContentBlocks.Text("r")] },
          SamplingContentBlocks.Text("extra"),
        ],
      },
    };
    Assert.False(SamplingValidation.ValidateSamplingMessageOrdering(messages).Ok);
  }

  // ── tool_result back-references (AC-33.15 · R-21.2.6-d) ──

  [Fact]
  public void Tool_result_references_accept_a_matching_prior_tool_use()
  {
    var messages = new List<SamplingMessage>
    {
      new() { Role = Role.Assistant, Content = [new ToolUseContent { Id = "abc", Name = "t", Input = new JsonObject() }] },
      new() { Role = Role.User, Content = [new ToolResultContent { ToolUseId = "abc", Content = [ContentBlocks.Text("r")] }] },
    };
    Assert.True(SamplingValidation.ValidateToolResultReferences(messages).Ok);
  }

  [Fact]
  public void Tool_result_references_reject_a_dangling_id()
  {
    var messages = new List<SamplingMessage>
    {
      new() { Role = Role.User, Content = [new ToolResultContent { ToolUseId = "nope", Content = [ContentBlocks.Text("r")] }] },
    };
    var result = SamplingValidation.ValidateToolResultReferences(messages);
    Assert.False(result.Ok);
    Assert.Equal("nope", result.ToolUseId);
  }

  // ── Consent obligations + iteration limit (AC-33.24, AC-33.25 · R-21.2.10) ──

  private static SamplingConsentObligations FullyConsenting() => new()
  {
    HumanInTheLoop = true,
    UserMayDeny = true,
    ReviewPromptBeforeSampling = true,
    ReviewResultBeforeServer = true,
    MayModifyControlFields = true,
    RateLimiting = true,
    ValidateContent = true,
    HandleSensitiveData = true,
    ToolLoopIterationLimits = true,
  };

  [Fact]
  public void A_host_meeting_all_must_obligations_has_none_unmet()
  {
    Assert.Empty(SamplingValidation.UnmetRequiredConsentObligations(FullyConsenting()));
  }

  [Fact]
  public void Missing_must_obligations_are_flagged_should_obligations_are_not()
  {
    var obligations = FullyConsenting() with { HumanInTheLoop = false, HandleSensitiveData = false, RateLimiting = false };
    var unmet = SamplingValidation.UnmetRequiredConsentObligations(obligations);
    Assert.Contains("humanInTheLoop", unmet);
    Assert.Contains("handleSensitiveData", unmet);
    Assert.DoesNotContain("rateLimiting", unmet); // SHOULD-level, advisory
  }

  [Fact]
  public void Client_modifiable_request_fields_cover_the_documented_set()
  {
    foreach (var field in new[] { "systemPrompt", "includeContext", "temperature", "stopSequences", "metadata" })
    {
      Assert.True(SamplingValidation.IsClientModifiableRequestField(field));
    }
    Assert.False(SamplingValidation.IsClientModifiableRequestField("maxTokens"));
  }

  [Fact]
  public void Within_tool_loop_limit()
  {
    Assert.True(SamplingValidation.WithinToolLoopLimit(0, 5));
    Assert.True(SamplingValidation.WithinToolLoopLimit(4, 5));
    Assert.False(SamplingValidation.WithinToolLoopLimit(5, 5));
    Assert.False(SamplingValidation.WithinToolLoopLimit(6, 5));
  }
}
