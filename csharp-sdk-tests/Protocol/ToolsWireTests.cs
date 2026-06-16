using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape coverage for the Tools server feature (spec §16): the <see cref="Tool"/>
/// definition (name/title/description/inputSchema/outputSchema/annotations/icons/_meta),
/// <see cref="ToolAnnotations"/> hint flags, the <see cref="CallToolResult"/> shape including
/// structuredContent of every JSON type, and the cacheable, paginated <see cref="ListToolsResult"/>.
/// </summary>
public sealed class ToolsWireTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  // ---- Tool: required fields ----------------------------------------------------------------

  [Fact]
  public void Tool_serializes_required_name_and_input_schema()
  {
    var tool = new Tool { Name = "add", InputSchema = Obj("""{"type":"object"}""") };
    var json = McpJson.Serialize(tool);

    Assert.Contains("\"name\":\"add\"", json);
    Assert.Contains("\"inputSchema\":{\"type\":\"object\"}", json);
  }

  [Theory]
  [InlineData("add")]
  [InlineData("get_weather")]
  [InlineData("namespace.tool")]
  [InlineData("UPPER")]
  public void Tool_name_round_trips_verbatim(string name)
  {
    var tool = new Tool { Name = name, InputSchema = Obj("""{"type":"object"}""") };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;
    Assert.Equal(name, back.Name);
  }

  [Fact]
  public void Tool_omits_optional_fields_when_null()
  {
    var json = McpJson.Serialize(new Tool { Name = "t", InputSchema = Obj("""{"type":"object"}""") });

    Assert.DoesNotContain("\"title\"", json);
    Assert.DoesNotContain("\"description\"", json);
    Assert.DoesNotContain("\"outputSchema\"", json);
    Assert.DoesNotContain("\"annotations\"", json);
    Assert.DoesNotContain("\"icons\"", json);
    Assert.DoesNotContain("\"_meta\"", json);
  }

  [Theory]
  [InlineData("Adder")]
  [InlineData("Get Weather")]
  public void Tool_title_serializes_when_set(string title)
  {
    var json = McpJson.Serialize(new Tool { Name = "t", Title = title, InputSchema = Obj("""{"type":"object"}""") });
    Assert.Contains($"\"title\":\"{title}\"", json);
  }

  [Theory]
  [InlineData("Adds two numbers.")]
  [InlineData("Returns the weather.")]
  public void Tool_description_serializes_when_set(string description)
  {
    var json = McpJson.Serialize(new Tool { Name = "t", Description = description, InputSchema = Obj("""{"type":"object"}""") });
    Assert.Contains($"\"description\":\"{description}\"", json);
  }

  // ---- Tool: inputSchema carried verbatim ---------------------------------------------------

  [Fact]
  public void Tool_input_schema_carries_nested_properties_and_required_verbatim()
  {
    var tool = new Tool
    {
      Name = "add",
      InputSchema = Obj("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}"""),
    };
    var json = McpJson.Serialize(tool);

    Assert.Contains("\"properties\":{\"a\":{\"type\":\"number\"},\"b\":{\"type\":\"number\"}}", json);
    Assert.Contains("\"required\":[\"a\",\"b\"]", json);
  }

  [Fact]
  public void Tool_input_schema_round_trips_nested_structure()
  {
    var tool = new Tool
    {
      Name = "add",
      InputSchema = Obj("""{"type":"object","properties":{"a":{"type":"number"}},"required":["a"]}"""),
    };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;

    Assert.Equal("object", back.InputSchema["type"]!.GetValue<string>());
    Assert.Equal("number", back.InputSchema["properties"]!["a"]!["type"]!.GetValue<string>());
    Assert.Equal("a", back.InputSchema["required"]![0]!.GetValue<string>());
  }

  [Theory]
  [InlineData("""{"type":"object"}""")]
  [InlineData("""{"type":"object","additionalProperties":false}""")]
  [InlineData("""{"type":"object","properties":{}}""")]
  public void Tool_input_schema_preserves_arbitrary_keywords(string schema)
  {
    var tool = new Tool { Name = "t", InputSchema = Obj(schema) };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;
    Assert.Equal(Obj(schema).ToJsonString(), back.InputSchema.ToJsonString());
  }

  [Fact]
  public void Tool_output_schema_serializes_when_set()
  {
    var tool = new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      OutputSchema = Obj("""{"type":"object","properties":{"tempC":{"type":"number"}}}"""),
    };
    var json = McpJson.Serialize(tool);

    Assert.Contains("\"outputSchema\":{\"type\":\"object\"", json);
    Assert.Contains("\"tempC\"", json);
  }

  [Fact]
  public void Tool_output_schema_round_trips()
  {
    var tool = new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      OutputSchema = Obj("""{"type":"object","properties":{"x":{"type":"string"}}}"""),
    };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;
    Assert.Equal("string", back.OutputSchema!["properties"]!["x"]!["type"]!.GetValue<string>());
  }

  // ---- Tool: icons + _meta ------------------------------------------------------------------

  [Fact]
  public void Tool_icons_serialize_with_src_and_optional_fields()
  {
    var tool = new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      Icons = [new Icon { Src = "https://x/icon.png", MimeType = "image/png", Sizes = ["48x48"] }],
    };
    var json = McpJson.Serialize(tool);

    Assert.Contains("\"icons\":[{", json);
    Assert.Contains("\"src\":\"https://x/icon.png\"", json);
    Assert.Contains("\"mimeType\":\"image/png\"", json);
    Assert.Contains("\"sizes\":[\"48x48\"]", json);
  }

  [Fact]
  public void Tool_icon_round_trips()
  {
    var tool = new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      Icons = [new Icon { Src = "data:image/png;base64,AAAA" }],
    };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;
    Assert.Equal("data:image/png;base64,AAAA", back.Icons![0].Src);
    Assert.Null(back.Icons[0].MimeType);
  }

  [Fact]
  public void Tool_meta_serializes_under_underscore_meta_key()
  {
    var tool = new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      Meta = new JsonObject { ["vendor/flag"] = true },
    };
    var json = McpJson.Serialize(tool);
    Assert.Contains("\"_meta\":{\"vendor/flag\":true}", json);
  }

  [Fact]
  public void Tool_meta_round_trips()
  {
    var tool = new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      Meta = new JsonObject { ["k"] = "v" },
    };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;
    Assert.Equal("v", back.Meta!["k"]!.GetValue<string>());
  }

  // ---- ToolAnnotations: hint flags ----------------------------------------------------------

  [Theory]
  [InlineData(true, "\"readOnlyHint\":true")]
  [InlineData(false, "\"readOnlyHint\":false")]
  public void Tool_annotations_read_only_hint_serializes_when_set(bool value, string expected)
  {
    var json = McpJson.Serialize(new ToolAnnotations { ReadOnlyHint = value });
    Assert.Contains(expected, json);
  }

  [Theory]
  [InlineData(true, "\"destructiveHint\":true")]
  [InlineData(false, "\"destructiveHint\":false")]
  public void Tool_annotations_destructive_hint_serializes_when_set(bool value, string expected)
  {
    var json = McpJson.Serialize(new ToolAnnotations { DestructiveHint = value });
    Assert.Contains(expected, json);
  }

  [Theory]
  [InlineData(true, "\"idempotentHint\":true")]
  [InlineData(false, "\"idempotentHint\":false")]
  public void Tool_annotations_idempotent_hint_serializes_when_set(bool value, string expected)
  {
    var json = McpJson.Serialize(new ToolAnnotations { IdempotentHint = value });
    Assert.Contains(expected, json);
  }

  [Theory]
  [InlineData(true, "\"openWorldHint\":true")]
  [InlineData(false, "\"openWorldHint\":false")]
  public void Tool_annotations_open_world_hint_serializes_when_set(bool value, string expected)
  {
    var json = McpJson.Serialize(new ToolAnnotations { OpenWorldHint = value });
    Assert.Contains(expected, json);
  }

  [Fact]
  public void Tool_annotations_title_serializes_when_set()
  {
    var json = McpJson.Serialize(new ToolAnnotations { Title = "Adder" });
    Assert.Contains("\"title\":\"Adder\"", json);
  }

  [Fact]
  public void Tool_annotations_omit_every_unset_hint()
  {
    var json = McpJson.Serialize(new ToolAnnotations());
    Assert.Equal("{}", json);
  }

  [Fact]
  public void Tool_annotations_omit_only_unset_hints()
  {
    var json = McpJson.Serialize(new ToolAnnotations { ReadOnlyHint = true });
    Assert.Contains("\"readOnlyHint\":true", json);
    Assert.DoesNotContain("\"destructiveHint\"", json);
    Assert.DoesNotContain("\"idempotentHint\"", json);
    Assert.DoesNotContain("\"openWorldHint\"", json);
    Assert.DoesNotContain("\"title\"", json);
  }

  [Fact]
  public void Tool_annotations_all_four_hints_round_trip()
  {
    var annotations = new ToolAnnotations
    {
      Title = "T",
      ReadOnlyHint = true,
      DestructiveHint = false,
      IdempotentHint = true,
      OpenWorldHint = false,
    };
    var back = McpJson.Deserialize<ToolAnnotations>(McpJson.Serialize(annotations))!;

    Assert.Equal("T", back.Title);
    Assert.True(back.ReadOnlyHint);
    Assert.False(back.DestructiveHint);
    Assert.True(back.IdempotentHint);
    Assert.False(back.OpenWorldHint);
  }

  [Fact]
  public void Tool_carries_annotations_nested()
  {
    var tool = new Tool
    {
      Name = "t",
      InputSchema = Obj("""{"type":"object"}"""),
      Annotations = new ToolAnnotations { ReadOnlyHint = true, OpenWorldHint = false },
    };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;
    Assert.True(back.Annotations!.ReadOnlyHint);
    Assert.False(back.Annotations.OpenWorldHint);
  }

  // ---- CallToolResult: content array --------------------------------------------------------

  [Fact]
  public void Call_tool_result_serializes_content_array()
  {
    var result = new CallToolResult { Content = [ContentBlocks.Text("hi")] };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"content\":[{", json);
    Assert.Contains("\"type\":\"text\"", json);
    Assert.Contains("\"text\":\"hi\"", json);
  }

  [Fact]
  public void Call_tool_result_allows_empty_content()
  {
    var result = new CallToolResult { Content = [] };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"content\":[]", json);
  }

  [Fact]
  public void Call_tool_result_mixes_content_kinds()
  {
    var result = new CallToolResult
    {
      Content = [ContentBlocks.Text("t"), ContentBlocks.Image("AAAA", "image/png")],
    };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"type\":\"text\"", json);
    Assert.Contains("\"type\":\"image\"", json);
  }

  [Fact]
  public void Call_tool_result_content_round_trips_to_concrete_subtypes()
  {
    var result = new CallToolResult { Content = [ContentBlocks.Text("a"), ContentBlocks.Audio("BBBB", "audio/wav")] };
    var back = McpJson.Deserialize<CallToolResult>(McpJson.Serialize(result))!;

    Assert.IsType<TextContent>(back.Content[0]);
    Assert.IsType<AudioContent>(back.Content[1]);
  }

  // ---- CallToolResult: structuredContent of every JSON type ---------------------------------

  public static IEnumerable<object[]> StructuredContentCases() =>
  [
    [(JsonNode)new JsonObject { ["tempC"] = 21 }, "\"structuredContent\":{\"tempC\":21}"],
    [(JsonNode)new JsonArray(1, 2, 3), "\"structuredContent\":[1,2,3]"],
    [(JsonNode)JsonValue.Create("text"), "\"structuredContent\":\"text\""],
    [(JsonNode)JsonValue.Create(42), "\"structuredContent\":42"],
    [(JsonNode)JsonValue.Create(3.5), "\"structuredContent\":3.5"],
    [(JsonNode)JsonValue.Create(true), "\"structuredContent\":true"],
    [(JsonNode)JsonValue.Create(false), "\"structuredContent\":false"],
  ];

  [Theory]
  [MemberData(nameof(StructuredContentCases))]
  public void Call_tool_result_structured_content_accepts_any_json_type(JsonNode node, string expected)
  {
    var result = new CallToolResult { Content = [], StructuredContent = node };
    var json = McpJson.Serialize(result);
    Assert.Contains(expected, json);
  }

  [Fact]
  public void Call_tool_result_structured_content_null_literal_is_omitted()
  {
    // A null JsonNode reference is an absent optional, so it is not written.
    var result = new CallToolResult { Content = [], StructuredContent = null };
    var json = McpJson.Serialize(result);
    Assert.DoesNotContain("\"structuredContent\"", json);
  }

  [Fact]
  public void Call_tool_result_structured_content_round_trips_object()
  {
    var result = new CallToolResult { Content = [], StructuredContent = new JsonObject { ["n"] = 7 } };
    var back = McpJson.Deserialize<CallToolResult>(McpJson.Serialize(result))!;
    Assert.Equal(7, back.StructuredContent!["n"]!.GetValue<int>());
  }

  // ---- CallToolResult: isError --------------------------------------------------------------

  [Fact]
  public void Call_tool_result_is_error_absent_when_null()
  {
    var json = McpJson.Serialize(new CallToolResult { Content = [] });
    Assert.DoesNotContain("\"isError\"", json);
  }

  [Theory]
  [InlineData(true, "\"isError\":true")]
  [InlineData(false, "\"isError\":false")]
  public void Call_tool_result_is_error_serializes_both_values(bool value, string expected)
  {
    var json = McpJson.Serialize(new CallToolResult { Content = [], IsError = value });
    Assert.Contains(expected, json);
  }

  [Fact]
  public void Call_tool_result_meta_serializes()
  {
    var result = new CallToolResult { Content = [], Meta = new JsonObject { ["trace"] = "abc" } };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"_meta\":{\"trace\":\"abc\"}", json);
  }

  // ---- CallToolResult: factory helpers ------------------------------------------------------

  [Theory]
  [InlineData("done")]
  [InlineData("5")]
  [InlineData("")]
  public void Call_tool_result_from_text_carries_single_text_block_and_no_error(string text)
  {
    var result = CallToolResult.FromText(text);

    Assert.Single(result.Content);
    var block = Assert.IsType<TextContent>(result.Content[0]);
    Assert.Equal(text, block.Text);
    Assert.Null(result.IsError);
  }

  [Fact]
  public void Call_tool_result_from_text_does_not_emit_is_error()
  {
    var json = McpJson.Serialize(CallToolResult.FromText("ok"));
    Assert.DoesNotContain("\"isError\"", json);
  }

  [Theory]
  [InlineData("Cannot divide by zero.")]
  [InlineData("boom")]
  public void Call_tool_result_from_error_sets_is_error_true_with_text(string text)
  {
    var result = CallToolResult.FromError(text);

    Assert.True(result.IsError);
    var block = Assert.IsType<TextContent>(result.Content[0]);
    Assert.Equal(text, block.Text);
  }

  [Fact]
  public void Call_tool_result_from_error_serializes_is_error_true()
  {
    var json = McpJson.Serialize(CallToolResult.FromError("nope"));
    Assert.Contains("\"isError\":true", json);
    Assert.Contains("nope", json);
  }

  // ---- ListToolsResult: pagination + cache --------------------------------------------------

  [Fact]
  public void List_tools_result_serializes_tools_array()
  {
    var result = new ListToolsResult
    {
      Tools = [new Tool { Name = "a", InputSchema = Obj("""{"type":"object"}""") }],
    };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"tools\":[{", json);
    Assert.Contains("\"name\":\"a\"", json);
  }

  [Fact]
  public void List_tools_result_allows_empty_tools()
  {
    var json = McpJson.Serialize(new ListToolsResult { Tools = [] });
    Assert.Contains("\"tools\":[]", json);
  }

  [Fact]
  public void List_tools_result_omits_optional_cursor_and_cache_when_null()
  {
    var json = McpJson.Serialize(new ListToolsResult { Tools = [] });
    Assert.DoesNotContain("\"nextCursor\"", json);
    Assert.DoesNotContain("\"ttlMs\"", json);
    Assert.DoesNotContain("\"cacheScope\"", json);
  }

  [Theory]
  [InlineData("cursor-1")]
  [InlineData("opaque==")]
  public void List_tools_result_next_cursor_serializes_and_round_trips(string cursor)
  {
    var result = new ListToolsResult { Tools = [], NextCursor = cursor };
    var json = McpJson.Serialize(result);
    Assert.Contains($"\"nextCursor\":\"{cursor}\"", json);

    var back = McpJson.Deserialize<ListToolsResult>(json)!;
    Assert.Equal(cursor, back.NextCursor);
  }

  [Theory]
  [InlineData(0L)]
  [InlineData(60000L)]
  [InlineData(86400000L)]
  public void List_tools_result_ttl_ms_serializes(long ttl)
  {
    var json = McpJson.Serialize(new ListToolsResult { Tools = [], TtlMs = ttl });
    Assert.Contains($"\"ttlMs\":{ttl}", json);
  }

  [Theory]
  [InlineData(CacheScope.Public, "\"cacheScope\":\"public\"")]
  [InlineData(CacheScope.Private, "\"cacheScope\":\"private\"")]
  public void List_tools_result_cache_scope_serializes(CacheScope scope, string expected)
  {
    var json = McpJson.Serialize(new ListToolsResult { Tools = [], CacheScope = scope });
    Assert.Contains(expected, json);
  }

  [Fact]
  public void List_tools_result_round_trips_with_cache_fields()
  {
    var result = new ListToolsResult
    {
      Tools = [new Tool { Name = "a", InputSchema = Obj("""{"type":"object"}""") }],
      NextCursor = "c",
      TtlMs = 1000,
      CacheScope = CacheScope.Private,
    };
    var back = McpJson.Deserialize<ListToolsResult>(McpJson.Serialize(result))!;

    Assert.Equal("a", back.Tools[0].Name);
    Assert.Equal("c", back.NextCursor);
    Assert.Equal(1000, back.TtlMs);
    Assert.Equal(CacheScope.Private, back.CacheScope);
  }

  // ---- Full Tool round-trip -----------------------------------------------------------------

  [Fact]
  public void Tool_round_trips_with_every_field_populated()
  {
    var tool = new Tool
    {
      Name = "get_weather",
      Title = "Get Weather",
      Description = "Returns current weather.",
      InputSchema = Obj("""{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}"""),
      OutputSchema = Obj("""{"type":"object","properties":{"tempC":{"type":"number"}}}"""),
      Annotations = new ToolAnnotations { ReadOnlyHint = true, OpenWorldHint = true },
      Icons = [new Icon { Src = "https://x/w.png", MimeType = "image/png" }],
      Meta = new JsonObject { ["x"] = 1 },
    };
    var back = McpJson.Deserialize<Tool>(McpJson.Serialize(tool))!;

    Assert.Equal("get_weather", back.Name);
    Assert.Equal("Get Weather", back.Title);
    Assert.Equal("Returns current weather.", back.Description);
    Assert.Equal("string", back.InputSchema["properties"]!["city"]!["type"]!.GetValue<string>());
    Assert.Equal("number", back.OutputSchema!["properties"]!["tempC"]!["type"]!.GetValue<string>());
    Assert.True(back.Annotations!.ReadOnlyHint);
    Assert.True(back.Annotations.OpenWorldHint);
    Assert.Equal("https://x/w.png", back.Icons![0].Src);
    Assert.Equal(1, back.Meta!["x"]!.GetValue<int>());
  }

  // ---- outputSchema / structuredContent conformance (§16.4/§16.6) ----------------------------

  [Fact]
  public void Validate_tool_structured_content_passes_for_conforming_value()
  {
    var outputSchema = Obj("""{"type":"object","properties":{"tempC":{"type":"number"}},"required":["tempC"]}""");
    var result = ToolSchemas.ValidateToolStructuredContent(outputSchema, Obj("""{"tempC":21}"""));
    Assert.True(result.Valid);
  }

  [Fact]
  public void Validate_tool_structured_content_fails_for_non_conforming_value()
  {
    var outputSchema = Obj("""{"type":"object","properties":{"tempC":{"type":"number"}},"required":["tempC"]}""");
    var result = ToolSchemas.ValidateToolStructuredContent(outputSchema, Obj("""{"tempC":"warm"}"""));
    Assert.False(result.Valid);
  }

  [Fact]
  public void Validate_tool_structured_content_is_valid_when_no_output_schema()
  {
    Assert.True(ToolSchemas.ValidateToolStructuredContent(null, Obj("""{"anything":true}""")).Valid);
  }

  [Fact]
  public void FromStructured_serializes_structured_content_into_a_text_fallback_block()
  {
    // §16.5 (R-16.5-p): a tool with an outputSchema sets structuredContent AND a serialized text fallback.
    var structured = Obj("""{"temp":21,"unit":"C"}""");
    var result = CallToolResult.FromStructured(structured);
    var back = JsonNode.Parse(McpJson.Serialize(result))!.AsObject();

    // structuredContent round-trips equal to the input.
    Assert.Equal(structured.ToJsonString(McpJson.Options), back["structuredContent"]!.ToJsonString(McpJson.Options));
    // Content[0] is a text block whose text parses back to the same JSON object.
    var text = back["content"]![0]!["text"]!.GetValue<string>();
    Assert.Equal(structured.ToJsonString(McpJson.Options), JsonNode.Parse(text)!.ToJsonString(McpJson.Options));
  }
}
