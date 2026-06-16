using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape coverage for the Prompts server feature (spec §18): the
/// <see cref="Prompt"/> template, its <see cref="PromptArgument"/> list, the role-plus-single-block
/// <see cref="PromptMessage"/> (polymorphic content), the <see cref="GetPromptResult"/>, and the
/// paginated, cacheable <see cref="ListPromptsResult"/>.
/// </summary>
public sealed class PromptsWireTests
{
  // ---- Prompt: required + optional ----------------------------------------------------------

  [Fact]
  public void Prompt_serializes_required_name()
  {
    var json = McpJson.Serialize(new Prompt { Name = "greeting" });
    Assert.Contains("\"name\":\"greeting\"", json);
  }

  [Fact]
  public void Prompt_omits_optional_fields_when_null()
  {
    var json = McpJson.Serialize(new Prompt { Name = "p" });
    Assert.DoesNotContain("\"title\"", json);
    Assert.DoesNotContain("\"description\"", json);
    Assert.DoesNotContain("\"arguments\"", json);
    Assert.DoesNotContain("\"icons\"", json);
    Assert.DoesNotContain("\"_meta\"", json);
  }

  [Theory]
  [InlineData("greeting")]
  [InlineData("code_review")]
  [InlineData("summarize-text")]
  public void Prompt_name_round_trips(string name)
  {
    var back = McpJson.Deserialize<Prompt>(McpJson.Serialize(new Prompt { Name = name }))!;
    Assert.Equal(name, back.Name);
  }

  [Theory]
  [InlineData("Greeting")]
  [InlineData("Code Review")]
  public void Prompt_title_serializes_when_set(string title)
  {
    var json = McpJson.Serialize(new Prompt { Name = "p", Title = title });
    Assert.Contains($"\"title\":\"{title}\"", json);
  }

  [Fact]
  public void Prompt_description_serializes_when_set()
  {
    var json = McpJson.Serialize(new Prompt { Name = "p", Description = "Greets a user." });
    Assert.Contains("\"description\":\"Greets a user.\"", json);
  }

  [Fact]
  public void Prompt_icons_serialize()
  {
    var json = McpJson.Serialize(new Prompt { Name = "p", Icons = [new Icon { Src = "https://x/i.png" }] });
    Assert.Contains("\"src\":\"https://x/i.png\"", json);
  }

  [Fact]
  public void Prompt_meta_serializes_under_underscore_meta()
  {
    var json = McpJson.Serialize(new Prompt { Name = "p", Meta = new JsonObject { ["k"] = 1 } });
    Assert.Contains("\"_meta\":{\"k\":1}", json);
  }

  [Fact]
  public void Prompt_arguments_serialize_as_array()
  {
    var prompt = new Prompt
    {
      Name = "greeting",
      Arguments = [new PromptArgument { Name = "name", Required = true }, new PromptArgument { Name = "language" }],
    };
    var json = McpJson.Serialize(prompt);

    Assert.Contains("\"arguments\":[{", json);
    Assert.Contains("\"name\":\"name\"", json);
    Assert.Contains("\"required\":true", json);
    Assert.Contains("\"name\":\"language\"", json);
  }

  [Fact]
  public void Prompt_empty_arguments_serialize_as_empty_array()
  {
    var json = McpJson.Serialize(new Prompt { Name = "p", Arguments = [] });
    Assert.Contains("\"arguments\":[]", json);
  }

  // ---- PromptArgument -----------------------------------------------------------------------

  [Fact]
  public void Prompt_argument_serializes_required_name_only()
  {
    var json = McpJson.Serialize(new PromptArgument { Name = "name" });
    Assert.Equal("{\"name\":\"name\"}", json);
  }

  [Theory]
  [InlineData("Display Name")]
  [InlineData("Lang")]
  public void Prompt_argument_title_serializes_when_set(string title)
  {
    var json = McpJson.Serialize(new PromptArgument { Name = "n", Title = title });
    Assert.Contains($"\"title\":\"{title}\"", json);
  }

  [Fact]
  public void Prompt_argument_description_serializes_when_set()
  {
    var json = McpJson.Serialize(new PromptArgument { Name = "n", Description = "The user's name." });
    Assert.Contains("\"description\":\"The user's name.\"", json);
  }

  [Theory]
  [InlineData(true, "\"required\":true")]
  [InlineData(false, "\"required\":false")]
  public void Prompt_argument_required_serializes_when_set(bool required, string expected)
  {
    var json = McpJson.Serialize(new PromptArgument { Name = "n", Required = required });
    Assert.Contains(expected, json);
  }

  [Fact]
  public void Prompt_argument_required_omitted_when_null()
  {
    var json = McpJson.Serialize(new PromptArgument { Name = "n" });
    Assert.DoesNotContain("\"required\"", json);
  }

  [Fact]
  public void Prompt_argument_round_trips_all_fields()
  {
    var arg = new PromptArgument { Name = "name", Title = "Name", Description = "d", Required = true };
    var back = McpJson.Deserialize<PromptArgument>(McpJson.Serialize(arg))!;

    Assert.Equal("name", back.Name);
    Assert.Equal("Name", back.Title);
    Assert.Equal("d", back.Description);
    Assert.True(back.Required);
  }

  // ---- PromptMessage: role + single polymorphic content -------------------------------------

  [Theory]
  [InlineData(Role.User, "\"role\":\"user\"")]
  [InlineData(Role.Assistant, "\"role\":\"assistant\"")]
  public void Prompt_message_serializes_role_wire_value(Role role, string expected)
  {
    var message = new PromptMessage { Role = role, Content = ContentBlocks.Text("hi") };
    var json = McpJson.Serialize(message);
    Assert.Contains(expected, json);
  }

  [Fact]
  public void Prompt_message_content_is_a_single_object_not_an_array()
  {
    var message = new PromptMessage { Role = Role.User, Content = ContentBlocks.Text("hi") };
    var json = McpJson.Serialize(message);

    Assert.Contains("\"content\":{", json);
    Assert.DoesNotContain("\"content\":[", json);
  }

  [Fact]
  public void Prompt_message_text_content_carries_type_discriminator()
  {
    var json = McpJson.Serialize(new PromptMessage { Role = Role.User, Content = ContentBlocks.Text("hi") });
    Assert.Contains("\"type\":\"text\"", json);
    Assert.Contains("\"text\":\"hi\"", json);
  }

  public static IEnumerable<object[]> ContentBlockCases() =>
  [
    [(ContentBlock)ContentBlocks.Text("hi"), "text", typeof(TextContent)],
    [(ContentBlock)ContentBlocks.Image("AAAA", "image/png"), "image", typeof(ImageContent)],
    [(ContentBlock)ContentBlocks.Audio("BBBB", "audio/wav"), "audio", typeof(AudioContent)],
    [(ContentBlock)ContentBlocks.LinkTo("u://x", "x", "application/json"), "resource_link", typeof(ResourceLink)],
    [(ContentBlock)ContentBlocks.Resource(ResourceContents.OfText("u://r", "body")), "resource", typeof(EmbeddedResource)],
  ];

  [Theory]
  [MemberData(nameof(ContentBlockCases))]
  public void Prompt_message_round_trips_each_content_kind(ContentBlock content, string discriminator, Type expectedType)
  {
    var message = new PromptMessage { Role = Role.User, Content = content };
    var json = McpJson.Serialize(message);
    Assert.Contains($"\"type\":\"{discriminator}\"", json);

    var back = McpJson.Deserialize<PromptMessage>(json)!;
    Assert.Equal(Role.User, back.Role);
    Assert.IsType(expectedType, back.Content);
  }

  // ---- GetPromptResult ----------------------------------------------------------------------

  [Fact]
  public void Get_prompt_result_serializes_messages()
  {
    var result = new GetPromptResult
    {
      Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text("Greet Ada.") }],
    };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"messages\":[{", json);
    Assert.Contains("Greet Ada.", json);
  }

  [Fact]
  public void Get_prompt_result_description_omitted_when_null()
  {
    var json = McpJson.Serialize(new GetPromptResult { Messages = [] });
    Assert.DoesNotContain("\"description\"", json);
  }

  [Theory]
  [InlineData("A friendly greeting.")]
  [InlineData("Rendered prompt.")]
  public void Get_prompt_result_description_serializes_when_set(string description)
  {
    var json = McpJson.Serialize(new GetPromptResult { Messages = [], Description = description });
    Assert.Contains($"\"description\":\"{description}\"", json);
  }

  [Fact]
  public void Get_prompt_result_allows_empty_messages()
  {
    var json = McpJson.Serialize(new GetPromptResult { Messages = [] });
    Assert.Contains("\"messages\":[]", json);
  }

  [Fact]
  public void Get_prompt_result_meta_serializes()
  {
    var result = new GetPromptResult { Messages = [], Meta = new JsonObject { ["k"] = "v" } };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"_meta\":{\"k\":\"v\"}", json);
  }

  [Fact]
  public void Get_prompt_result_round_trips_multiple_messages_and_kinds()
  {
    var result = new GetPromptResult
    {
      Description = "two-turn",
      Messages =
      [
        new PromptMessage { Role = Role.User, Content = ContentBlocks.Text("Hi") },
        new PromptMessage { Role = Role.Assistant, Content = ContentBlocks.Image("AAAA", "image/png") },
      ],
      Meta = new JsonObject { ["x"] = 1 },
    };
    var back = McpJson.Deserialize<GetPromptResult>(McpJson.Serialize(result))!;

    Assert.Equal("two-turn", back.Description);
    Assert.Equal(2, back.Messages.Count);
    Assert.Equal(Role.User, back.Messages[0].Role);
    Assert.IsType<TextContent>(back.Messages[0].Content);
    Assert.Equal(Role.Assistant, back.Messages[1].Role);
    Assert.IsType<ImageContent>(back.Messages[1].Content);
    Assert.Equal(1, back.Meta!["x"]!.GetValue<int>());
  }

  // ---- ListPromptsResult --------------------------------------------------------------------

  [Fact]
  public void List_prompts_result_serializes_prompts_array()
  {
    var json = McpJson.Serialize(new ListPromptsResult { Prompts = [new Prompt { Name = "greeting" }] });
    Assert.Contains("\"prompts\":[{", json);
    Assert.Contains("\"name\":\"greeting\"", json);
  }

  [Fact]
  public void List_prompts_result_allows_empty()
  {
    var json = McpJson.Serialize(new ListPromptsResult { Prompts = [] });
    Assert.Contains("\"prompts\":[]", json);
  }

  [Theory]
  [InlineData("c1")]
  [InlineData("opaque==")]
  public void List_prompts_result_next_cursor_round_trips(string cursor)
  {
    var back = McpJson.Deserialize<ListPromptsResult>(
      McpJson.Serialize(new ListPromptsResult { Prompts = [], NextCursor = cursor }))!;
    Assert.Equal(cursor, back.NextCursor);
  }

  [Theory]
  [InlineData(CacheScope.Public, "\"cacheScope\":\"public\"")]
  [InlineData(CacheScope.Private, "\"cacheScope\":\"private\"")]
  public void List_prompts_result_cache_fields_serialize(CacheScope scope, string expected)
  {
    var json = McpJson.Serialize(new ListPromptsResult { Prompts = [], TtlMs = 100, CacheScope = scope });
    Assert.Contains(expected, json);
    Assert.Contains("\"ttlMs\":100", json);
  }

  [Fact]
  public void List_prompts_result_round_trips_with_cache_fields()
  {
    var result = new ListPromptsResult
    {
      Prompts = [new Prompt { Name = "greeting", Arguments = [new PromptArgument { Name = "name", Required = true }] }],
      NextCursor = "c",
      TtlMs = 30000,
      CacheScope = CacheScope.Public,
    };
    var back = McpJson.Deserialize<ListPromptsResult>(McpJson.Serialize(result))!;

    Assert.Equal("greeting", back.Prompts[0].Name);
    Assert.True(back.Prompts[0].Arguments![0].Required);
    Assert.Equal("c", back.NextCursor);
    Assert.Equal(30000, back.TtlMs);
    Assert.Equal(CacheScope.Public, back.CacheScope);
  }

  // ---- requiredArgumentNames (§18.3, R-18.3-l) ----------------------------------------------

  [Fact]
  public void Required_argument_names_lists_only_required()
  {
    var prompt = new Prompt
    {
      Name = "greeting",
      Arguments = [new PromptArgument { Name = "name", Required = true }, new PromptArgument { Name = "language" }],
    };
    Assert.Equal(new[] { "name" }, Prompts.RequiredArgumentNames(prompt));
  }

  [Fact]
  public void Required_argument_names_empty_when_no_arguments()
  {
    Assert.Empty(Prompts.RequiredArgumentNames(new Prompt { Name = "p" }));
  }

  // ---- resolveGetPromptResultType (§18.4, R-18.4-p) -----------------------------------------

  [Fact]
  public void Resolve_result_type_defaults_absent_to_complete()
  {
    Assert.Equal("complete", Prompts.ResolveResultType(Obj("""{"messages":[]}""")));
    Assert.Equal("complete", Prompts.ResolveResultType(Obj("""{"resultType":"complete","messages":[]}""")));
  }

  // ---- discriminateGetPromptResponse (§18.4, R-18.4-p/q/r) ----------------------------------

  [Fact]
  public void Discriminate_get_prompt_response_absent_result_type_is_complete()
  {
    var response = Obj("""{"messages":[{"role":"user","content":{"type":"text","text":"hi"}}]}""");
    var outcome = Prompts.DiscriminateGetPromptResponse(response);
    Assert.Equal(GetPromptResponseKind.Complete, outcome.Kind);
    Assert.Single(outcome.Result!.Messages);
  }

  [Fact]
  public void Discriminate_get_prompt_response_complete_branch()
  {
    var response = Obj("""{"resultType":"complete","description":"d","messages":[{"role":"assistant","content":{"type":"text","text":"yo"}}]}""");
    var outcome = Prompts.DiscriminateGetPromptResponse(response);
    Assert.Equal(GetPromptResponseKind.Complete, outcome.Kind);
    Assert.Equal("d", outcome.Result!.Description);
  }

  [Fact]
  public void Discriminate_get_prompt_response_input_required_branch()
  {
    var response = Obj("""{"resultType":"input_required","requestState":"opaque"}""");
    var outcome = Prompts.DiscriminateGetPromptResponse(response);
    Assert.Equal(GetPromptResponseKind.InputRequired, outcome.Kind);
    Assert.Equal("opaque", outcome.InputRequired!.RequestState);
  }

  [Fact]
  public void Discriminate_get_prompt_response_unknown_result_type_is_error()
  {
    var response = Obj("""{"resultType":"weird","messages":[]}""");
    var outcome = Prompts.DiscriminateGetPromptResponse(response);
    Assert.Equal(GetPromptResponseKind.Error, outcome.Kind);
  }

  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();
}
