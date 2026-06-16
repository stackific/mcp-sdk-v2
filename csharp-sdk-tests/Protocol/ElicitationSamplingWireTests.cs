using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape tests for Elicitation (spec §20) and the Deprecated Sampling capability
/// (spec §21.2): the <c>mode</c>-discriminated elicitation union, the <see cref="ElicitationAction"/>
/// enum, the <c>type</c>-discriminated sampling content union, sampling messages, model preferences,
/// the tool-choice / include-context enums, and the create-message request/result records. All
/// assertions cover REAL serialization behavior of <see cref="McpJson"/>.
/// </summary>
public sealed class ElicitationSamplingWireTests
{
  // ── ElicitRequestParams polymorphism (mode discriminator) ──

  [Fact]
  public void Elicit_form_params_carry_mode_form_and_requested_schema()
  {
    ElicitRequestParams form = new ElicitRequestFormParams
    {
      Message = "Register",
      RequestedSchema = new JsonObject { ["type"] = "object" },
    };
    var json = McpJson.Serialize(form);
    Assert.Contains("\"mode\":\"form\"", json);
    Assert.Contains("\"message\":\"Register\"", json);
    Assert.Contains("\"requestedSchema\":{\"type\":\"object\"}", json);
  }

  [Fact]
  public void Elicit_url_params_carry_mode_url_id_and_url()
  {
    ElicitRequestParams url = new ElicitRequestURLParams
    {
      Message = "Confirm",
      ElicitationId = "p-1",
      Url = "https://x/elicit/p-1",
    };
    var json = McpJson.Serialize(url);
    Assert.Contains("\"mode\":\"url\"", json);
    Assert.Contains("\"message\":\"Confirm\"", json);
    Assert.Contains("\"elicitationId\":\"p-1\"", json);
    Assert.Contains("\"url\":\"https://x/elicit/p-1\"", json);
  }

  [Fact]
  public void Elicit_form_params_round_trip_to_concrete_form_subtype()
  {
    ElicitRequestParams form = new ElicitRequestFormParams
    {
      Message = "Register",
      RequestedSchema = new JsonObject { ["type"] = "object", ["required"] = new JsonArray("name") },
    };
    var back = Assert.IsType<ElicitRequestFormParams>(
      McpJson.Deserialize<ElicitRequestParams>(McpJson.Serialize(form)));
    Assert.Equal("Register", back.Message);
    Assert.Equal("object", back.RequestedSchema["type"]!.GetValue<string>());
  }

  [Fact]
  public void Elicit_url_params_round_trip_to_concrete_url_subtype()
  {
    ElicitRequestParams url = new ElicitRequestURLParams
    {
      Message = "Confirm",
      ElicitationId = "p-2",
      Url = "https://x/elicit/p-2",
    };
    var back = Assert.IsType<ElicitRequestURLParams>(
      McpJson.Deserialize<ElicitRequestParams>(McpJson.Serialize(url)));
    Assert.Equal("p-2", back.ElicitationId);
    Assert.Equal("https://x/elicit/p-2", back.Url);
  }

  [Fact]
  public void Elicit_missing_mode_defaults_to_form_subtype()
  {
    // §20.3: a request with no mode field MUST be treated as form mode.
    var json = "{\"message\":\"Register\",\"requestedSchema\":{\"type\":\"object\"}}";
    var back = Assert.IsType<ElicitRequestFormParams>(McpJson.Deserialize<ElicitRequestParams>(json));
    Assert.Equal("Register", back.Message);
  }

  [Fact]
  public void Elicitation_complete_notification_method_constant_is_namespaced()
  {
    Assert.Equal("notifications/elicitation/complete", ElicitationCompleteNotificationParams.Method);
    Assert.Equal(ElicitationCompleteNotificationParams.Method, McpMethods.NotificationsElicitationComplete);
  }

  [Fact]
  public void Elicitation_complete_notification_carries_elicitation_id()
  {
    var json = McpJson.Serialize(new ElicitationCompleteNotificationParams { ElicitationId = "p-9" });
    Assert.Contains("\"elicitationId\":\"p-9\"", json);
  }

  // ── ElicitationAction ──

  [Theory]
  [InlineData(ElicitationAction.Accept, "accept")]
  [InlineData(ElicitationAction.Decline, "decline")]
  [InlineData(ElicitationAction.Cancel, "cancel")]
  public void Elicitation_action_uses_lowercase_wire_value(ElicitationAction action, string wire)
  {
    Assert.Equal($"\"{wire}\"", McpJson.Serialize(action));
  }

  [Theory]
  [InlineData("\"accept\"", ElicitationAction.Accept)]
  [InlineData("\"decline\"", ElicitationAction.Decline)]
  [InlineData("\"cancel\"", ElicitationAction.Cancel)]
  public void Elicitation_action_deserializes_from_wire_value(string raw, ElicitationAction expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<ElicitationAction>(raw));
  }

  // ── ElicitResult ──

  [Fact]
  public void Elicit_result_accept_carries_content()
  {
    var json = McpJson.Serialize(new ElicitResult
    {
      Action = ElicitationAction.Accept,
      Content = new JsonObject { ["username"] = "neo" },
    });
    Assert.Contains("\"action\":\"accept\"", json);
    Assert.Contains("\"content\":{\"username\":\"neo\"}", json);
  }

  [Fact]
  public void Elicit_result_decline_omits_content_and_meta()
  {
    var json = McpJson.Serialize(new ElicitResult { Action = ElicitationAction.Decline });
    Assert.Contains("\"action\":\"decline\"", json);
    Assert.DoesNotContain("\"content\"", json);
    Assert.DoesNotContain("\"_meta\"", json);
  }

  [Fact]
  public void Elicit_result_round_trips_action_and_content()
  {
    var json = McpJson.Serialize(new ElicitResult
    {
      Action = ElicitationAction.Accept,
      Content = new JsonObject { ["age"] = 30 },
      Meta = new JsonObject { ["x"] = 1 },
    });
    var back = McpJson.Deserialize<ElicitResult>(json)!;
    Assert.Equal(ElicitationAction.Accept, back.Action);
    Assert.Equal(30, back.Content!["age"]!.GetValue<int>());
    Assert.NotNull(back.Meta);
  }

  // ── S30 front-half: mode resolution, capability gating, builders (§20.1–§20.3) ──

  [Theory]
  [InlineData("form")]
  [InlineData("url")]
  public void Elicitation_modes_are_recognized(string mode)
  {
    Assert.True(Elicitation.IsElicitationMode(mode));
  }

  [Fact]
  public void Elicitation_unknown_mode_is_not_recognized()
  {
    Assert.False(Elicitation.IsElicitationMode("inline"));
    Assert.False(Elicitation.IsElicitationMode(null));
  }

  [Fact]
  public void Resolve_mode_defaults_absent_to_form_and_maps_url()
  {
    Assert.Equal("form", Elicitation.ResolveElicitationMode(new JsonObject { ["message"] = "hi" }));
    Assert.Equal("form", Elicitation.ResolveElicitationMode(new JsonObject { ["mode"] = "form" }));
    Assert.Equal("url", Elicitation.ResolveElicitationMode(new JsonObject { ["mode"] = "url" }));
    // A malformed mode yields null (no signal of a defined mode).
    Assert.Null(Elicitation.ResolveElicitationMode(new JsonObject { ["mode"] = "bogus" }));
    Assert.Null(Elicitation.ResolveElicitationMode(JsonValue.Create(7)));
  }

  [Fact]
  public void Is_elicitation_create_request_is_a_method_only_check()
  {
    Assert.True(Elicitation.IsElicitationCreateRequest(new JsonObject { ["method"] = "elicitation/create" }));
    Assert.False(Elicitation.IsElicitationCreateRequest(new JsonObject { ["method"] = "tools/call" }));
    Assert.False(Elicitation.IsElicitationCreateRequest(JsonValue.Create("x")));
  }

  [Theory]
  [InlineData("https://example.com/x", true)]
  [InlineData("ftp://host/path", true)]
  [InlineData("/relative", false)]
  [InlineData("not a url", false)]
  [InlineData("", false)]
  public void Is_valid_elicitation_url_requires_an_absolute_url(string url, bool expected)
  {
    Assert.Equal(expected, Elicitation.IsValidElicitationUrl(url));
  }

  [Fact]
  public void Supported_modes_follow_the_declared_sub_flags()
  {
    Assert.Empty(Elicitation.SupportedElicitationModes(new JsonObject()));
    Assert.Equal(new[] { "form" }, Elicitation.SupportedElicitationModes(new JsonObject { ["elicitation"] = new JsonObject() }));
    Assert.Equal(new[] { "form", "url" },
      Elicitation.SupportedElicitationModes(new JsonObject { ["elicitation"] = new JsonObject { ["url"] = new JsonObject() } }));
  }

  [Fact]
  public void Gate_rejects_undeclared_capability_and_unsupported_mode()
  {
    // No elicitation declared ⇒ capability-not-declared.
    var undeclared = Elicitation.GateElicitationRequest(new JsonObject());
    Assert.False(undeclared.Ok);
    Assert.Equal(Elicitation.ElicitationGateRejection.CapabilityNotDeclared, undeclared.Reason);

    // Form-only client asked for url ⇒ mode-not-supported.
    var formOnly = new JsonObject { ["elicitation"] = new JsonObject() };
    var urlOnFormOnly = Elicitation.GateElicitationRequest(formOnly, "url");
    Assert.False(urlOnFormOnly.Ok);
    Assert.Equal(Elicitation.ElicitationGateRejection.ModeNotSupported, urlOnFormOnly.Reason);
    Assert.Equal("url", urlOnFormOnly.Mode);

    // Form on a form-capable client ⇒ ok.
    Assert.True(Elicitation.GateElicitationRequest(formOnly).Ok);
    Assert.True(Elicitation.MayServerSendElicitation(formOnly));
    Assert.False(Elicitation.MayServerSendElicitation(formOnly, "url"));
  }

  [Fact]
  public void Build_form_request_validates_the_requested_schema()
  {
    var schema = new JsonObject
    {
      ["type"] = "object",
      ["properties"] = new JsonObject { ["name"] = new JsonObject { ["type"] = "string" } },
    };
    var form = Elicitation.BuildFormElicitRequest("Register", schema);
    Assert.Equal("Register", form.Message);
    Assert.Same(schema, form.RequestedSchema);

    // A nested-object schema is rejected before the request is built.
    var bad = new JsonObject
    {
      ["type"] = "object",
      ["properties"] = new JsonObject { ["a"] = new JsonObject { ["type"] = "object" } },
    };
    Assert.Throws<ArgumentException>(() => Elicitation.BuildFormElicitRequest("x", bad));
  }

  [Fact]
  public void Build_url_request_validates_id_and_url()
  {
    var url = Elicitation.BuildUrlElicitRequest("Confirm", "p-1", "https://x/elicit/p-1");
    Assert.Equal("p-1", url.ElicitationId);
    Assert.Equal("https://x/elicit/p-1", url.Url);

    Assert.Throws<ArgumentException>(() => Elicitation.BuildUrlElicitRequest("m", "", "https://x"));
    Assert.Throws<ArgumentException>(() => Elicitation.BuildUrlElicitRequest("m", "p-2", "not a url"));
  }

  // ── SamplingMessageContentBlock union (type discriminator) ──

  [Fact]
  public void Sampling_text_content_carries_text_discriminator()
  {
    SamplingMessageContentBlock block = SamplingContentBlocks.Text("hi");
    var json = McpJson.Serialize(block);
    Assert.Contains("\"type\":\"text\"", json);
    Assert.Contains("\"text\":\"hi\"", json);
  }

  [Fact]
  public void Sampling_image_content_carries_image_discriminator()
  {
    SamplingMessageContentBlock block = SamplingContentBlocks.Image("AAAA", "image/png");
    var json = McpJson.Serialize(block);
    Assert.Contains("\"type\":\"image\"", json);
    Assert.Contains("\"data\":\"AAAA\"", json);
    Assert.Contains("\"mimeType\":\"image/png\"", json);
  }

  [Fact]
  public void Sampling_audio_content_carries_audio_discriminator()
  {
    SamplingMessageContentBlock block = SamplingContentBlocks.Audio("BBBB", "audio/wav");
    var json = McpJson.Serialize(block);
    Assert.Contains("\"type\":\"audio\"", json);
    Assert.Contains("\"mimeType\":\"audio/wav\"", json);
  }

  [Fact]
  public void Tool_use_content_carries_tool_use_discriminator()
  {
    SamplingMessageContentBlock block = new ToolUseContent
    {
      Id = "t1",
      Name = "add",
      Input = new JsonObject { ["a"] = 1 },
    };
    var json = McpJson.Serialize(block);
    Assert.Contains("\"type\":\"tool_use\"", json);
    Assert.Contains("\"id\":\"t1\"", json);
    Assert.Contains("\"name\":\"add\"", json);
    Assert.Contains("\"input\":{\"a\":1}", json);
  }

  [Fact]
  public void Tool_result_content_carries_tool_result_discriminator()
  {
    SamplingMessageContentBlock block = new ToolResultContent
    {
      ToolUseId = "t1",
      Content = [ContentBlocks.Text("3")],
    };
    var json = McpJson.Serialize(block);
    Assert.Contains("\"type\":\"tool_result\"", json);
    Assert.Contains("\"toolUseId\":\"t1\"", json);
    Assert.Contains("\"content\":", json);
  }

  [Theory]
  [InlineData("text")]
  [InlineData("image")]
  [InlineData("audio")]
  [InlineData("tool_use")]
  [InlineData("tool_result")]
  public void Sampling_union_round_trips_each_variant_to_its_subtype(string discriminator)
  {
    SamplingMessageContentBlock original = discriminator switch
    {
      "text" => SamplingContentBlocks.Text("hi"),
      "image" => SamplingContentBlocks.Image("AAAA", "image/png"),
      "audio" => SamplingContentBlocks.Audio("BBBB", "audio/wav"),
      "tool_use" => new ToolUseContent { Id = "t", Name = "n", Input = new JsonObject() },
      _ => new ToolResultContent { ToolUseId = "t", Content = [ContentBlocks.Text("x")] },
    };
    var json = McpJson.Serialize(original);
    var back = McpJson.Deserialize<SamplingMessageContentBlock>(json)!;
    Assert.Contains($"\"type\":\"{discriminator}\"", json);
    Assert.Equal(original.GetType(), back.GetType());
  }

  [Fact]
  public void Tool_use_content_round_trips_its_fields()
  {
    var json = McpJson.Serialize<SamplingMessageContentBlock>(new ToolUseContent
    {
      Id = "abc",
      Name = "calc",
      Input = new JsonObject { ["x"] = 9 },
    });
    var back = Assert.IsType<ToolUseContent>(McpJson.Deserialize<SamplingMessageContentBlock>(json));
    Assert.Equal("abc", back.Id);
    Assert.Equal("calc", back.Name);
    Assert.Equal(9, back.Input["x"]!.GetValue<int>());
  }

  [Fact]
  public void Tool_result_content_emits_structured_content_and_is_error_when_set()
  {
    var json = McpJson.Serialize<SamplingMessageContentBlock>(new ToolResultContent
    {
      ToolUseId = "t1",
      Content = [ContentBlocks.Text("oops")],
      StructuredContent = new JsonObject { ["ok"] = false },
      IsError = true,
    });
    Assert.Contains("\"structuredContent\":{\"ok\":false}", json);
    Assert.Contains("\"isError\":true", json);
  }

  [Fact]
  public void Tool_result_content_omits_structured_content_and_is_error_when_absent()
  {
    var json = McpJson.Serialize<SamplingMessageContentBlock>(new ToolResultContent
    {
      ToolUseId = "t1",
      Content = [ContentBlocks.Text("ok")],
    });
    Assert.DoesNotContain("\"structuredContent\"", json);
    Assert.DoesNotContain("\"isError\"", json);
  }

  // ── SamplingMessage ──

  [Theory]
  [InlineData(Role.User, "user")]
  [InlineData(Role.Assistant, "assistant")]
  public void Sampling_message_emits_lowercase_role(Role role, string wire)
  {
    var json = McpJson.Serialize(new SamplingMessage
    {
      Role = role,
      Content = [SamplingContentBlocks.Text("hi")],
    });
    Assert.Contains($"\"role\":\"{wire}\"", json);
  }

  [Fact]
  public void Sampling_message_serializes_content_as_an_array()
  {
    var json = McpJson.Serialize(new SamplingMessage
    {
      Role = Role.User,
      Content = [SamplingContentBlocks.Text("a"), SamplingContentBlocks.Text("b")],
    });
    Assert.Contains("\"content\":[", json);
  }

  [Fact]
  public void Sampling_message_round_trips_role_and_content()
  {
    var json = McpJson.Serialize(new SamplingMessage
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text("done")],
    });
    var back = McpJson.Deserialize<SamplingMessage>(json)!;
    Assert.Equal(Role.Assistant, back.Role);
    var text = Assert.IsType<SamplingTextContent>(back.Content[0]);
    Assert.Equal("done", text.Text);
  }

  // ── CreateMessageRequestParams ──

  [Fact]
  public void Create_message_request_method_constant_is_correct()
  {
    Assert.Equal("sampling/createMessage", CreateMessageRequestParams.Method);
    Assert.Equal(CreateMessageRequestParams.Method, McpMethods.SamplingCreateMessage);
  }

  [Fact]
  public void Create_message_request_emits_required_messages_and_max_tokens()
  {
    var json = McpJson.Serialize(new CreateMessageRequestParams
    {
      Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text("hi")] }],
      MaxTokens = 200,
    });
    Assert.Contains("\"messages\":[", json);
    Assert.Contains("\"maxTokens\":200", json);
  }

  [Fact]
  public void Create_message_request_omits_all_optionals_when_absent()
  {
    var json = McpJson.Serialize(new CreateMessageRequestParams
    {
      Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text("hi")] }],
      MaxTokens = 10,
    });
    Assert.DoesNotContain("\"modelPreferences\"", json);
    Assert.DoesNotContain("\"systemPrompt\"", json);
    Assert.DoesNotContain("\"temperature\"", json);
    Assert.DoesNotContain("\"includeContext\"", json);
    Assert.DoesNotContain("\"stopSequences\"", json);
    Assert.DoesNotContain("\"tools\"", json);
    Assert.DoesNotContain("\"toolChoice\"", json);
    Assert.DoesNotContain("\"metadata\"", json);
  }

  [Fact]
  public void Create_message_request_emits_optionals_when_present()
  {
    var json = McpJson.Serialize(new CreateMessageRequestParams
    {
      Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text("hi")] }],
      MaxTokens = 256,
      SystemPrompt = "Be terse.",
      Temperature = 0.7,
      IncludeContext = IncludeContext.ThisServer,
      StopSequences = ["END"],
      ModelPreferences = new ModelPreferences { CostPriority = 0.2 },
      ToolChoice = new ToolChoice { Mode = ToolChoiceMode.Required },
    });
    Assert.Contains("\"systemPrompt\":\"Be terse.\"", json);
    Assert.Contains("\"temperature\":0.7", json);
    Assert.Contains("\"includeContext\":\"thisServer\"", json);
    Assert.Contains("\"stopSequences\":[\"END\"]", json);
    Assert.Contains("\"modelPreferences\":", json);
    Assert.Contains("\"toolChoice\":{\"mode\":\"required\"}", json);
  }

  [Fact]
  public void Create_message_request_round_trips_max_tokens_as_long()
  {
    var json = McpJson.Serialize(new CreateMessageRequestParams
    {
      Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text("hi")] }],
      MaxTokens = 4096,
    });
    var back = McpJson.Deserialize<CreateMessageRequestParams>(json)!;
    Assert.Equal(4096L, back.MaxTokens);
  }

  // ── ModelPreferences ──

  [Fact]
  public void Model_preferences_emit_hints_and_priorities()
  {
    var json = McpJson.Serialize(new ModelPreferences
    {
      Hints = [new ModelHint { Name = "sonnet" }],
      CostPriority = 0.1,
      SpeedPriority = 0.5,
      IntelligencePriority = 0.9,
    });
    Assert.Contains("\"hints\":[{\"name\":\"sonnet\"}]", json);
    Assert.Contains("\"costPriority\":0.1", json);
    Assert.Contains("\"speedPriority\":0.5", json);
    Assert.Contains("\"intelligencePriority\":0.9", json);
  }

  [Fact]
  public void Model_preferences_omit_absent_fields()
  {
    var json = McpJson.Serialize(new ModelPreferences { CostPriority = 1 });
    Assert.Contains("\"costPriority\":1", json);
    Assert.DoesNotContain("\"hints\"", json);
    Assert.DoesNotContain("\"speedPriority\"", json);
    Assert.DoesNotContain("\"intelligencePriority\"", json);
  }

  [Fact]
  public void Model_preferences_round_trip_priorities()
  {
    var json = McpJson.Serialize(new ModelPreferences
    {
      Hints = [new ModelHint { Name = "haiku" }, new ModelHint { Name = "opus" }],
      SpeedPriority = 0.25,
    });
    var back = McpJson.Deserialize<ModelPreferences>(json)!;
    Assert.Equal(2, back.Hints!.Count);
    Assert.Equal("haiku", back.Hints[0].Name);
    Assert.Equal(0.25, back.SpeedPriority);
  }

  // ── ToolChoiceMode + IncludeContext enums ──

  [Theory]
  [InlineData(ToolChoiceMode.Auto, "auto")]
  [InlineData(ToolChoiceMode.Required, "required")]
  [InlineData(ToolChoiceMode.None, "none")]
  public void Tool_choice_mode_uses_lowercase_wire_value(ToolChoiceMode mode, string wire)
  {
    Assert.Equal($"\"{wire}\"", McpJson.Serialize(mode));
  }

  [Theory]
  [InlineData(IncludeContext.None, "none")]
  [InlineData(IncludeContext.ThisServer, "thisServer")]
  [InlineData(IncludeContext.AllServers, "allServers")]
  public void Include_context_uses_camel_case_wire_value(IncludeContext value, string wire)
  {
    Assert.Equal($"\"{wire}\"", McpJson.Serialize(value));
  }

  [Theory]
  [InlineData("\"auto\"", ToolChoiceMode.Auto)]
  [InlineData("\"required\"", ToolChoiceMode.Required)]
  [InlineData("\"none\"", ToolChoiceMode.None)]
  public void Tool_choice_mode_deserializes_from_wire_value(string raw, ToolChoiceMode expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<ToolChoiceMode>(raw));
  }

  // ── CreateMessageResult ──

  [Fact]
  public void Create_message_result_emits_required_fields()
  {
    var json = McpJson.Serialize(new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text("Summary.")],
      Model = "deepseek-chat",
    });
    Assert.Contains("\"role\":\"assistant\"", json);
    Assert.Contains("\"content\":[", json);
    Assert.Contains("\"model\":\"deepseek-chat\"", json);
    // §21.2.8 (R-21.2.8-e): the result MUST carry the resultType discriminator; a sampling completion is "complete".
    Assert.Contains("\"resultType\":\"complete\"", json);
  }

  [Fact]
  public void Create_message_result_validated_rejects_missing_model()
  {
    // TV-33.14 / §21.2.8 (R-21.2.8-c): model is REQUIRED and MUST be non-empty on emit.
    var result = new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text("x")],
      Model = "",
    };
    Assert.Throws<ArgumentException>(() => result.Validated());
  }

  [Fact]
  public void Create_message_result_validated_rejects_non_complete_result_type()
  {
    // §21.2.8 (R-21.2.8-e): a sampling completion's discriminator MUST be "complete".
    var result = new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text("x")],
      Model = "m",
      ResultType = ResultTypes.InputRequired,
    };
    Assert.Throws<ArgumentException>(() => result.Validated());
  }

  [Fact]
  public void Create_message_result_receive_tolerates_absent_result_type()
  {
    // §3.6 receiver degradation: a result the server receives without resultType binds with the
    // discriminator defaulting to "complete" rather than failing.
    var back = McpJson.Deserialize<CreateMessageResult>(
      """{"role":"assistant","content":[{"type":"text","text":"x"}],"model":"m"}""")!;
    Assert.Equal(ResultTypes.Complete, back.ResultType);
  }

  [Fact]
  public void Create_message_result_omits_absent_stop_reason()
  {
    var json = McpJson.Serialize(new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text("x")],
      Model = "m",
    });
    Assert.DoesNotContain("\"stopReason\"", json);
  }

  [Theory]
  [InlineData("endTurn")]
  [InlineData("stopSequence")]
  [InlineData("maxTokens")]
  [InlineData("toolUse")]
  public void Create_message_result_round_trips_stop_reason(string stopReason)
  {
    var json = McpJson.Serialize(new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text("x")],
      Model = "m",
      StopReason = stopReason,
    });
    var back = McpJson.Deserialize<CreateMessageResult>(json)!;
    Assert.Equal(stopReason, back.StopReason);
    Assert.Equal("m", back.Model);
    Assert.Equal(Role.Assistant, back.Role);
  }

  [Fact]
  public void Create_message_result_can_carry_a_tool_use_block()
  {
    var json = McpJson.Serialize(new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [new ToolUseContent { Id = "u1", Name = "add", Input = new JsonObject { ["a"] = 2 } }],
      Model = "m",
      StopReason = "toolUse",
    });
    var back = McpJson.Deserialize<CreateMessageResult>(json)!;
    var toolUse = Assert.IsType<ToolUseContent>(back.Content[0]);
    Assert.Equal("u1", toolUse.Id);
  }
}
