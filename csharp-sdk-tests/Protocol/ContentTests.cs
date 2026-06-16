using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Content-block discrimination, resource-contents variants, and tool-result shapes
/// (spec §14.4–§14.5, §16.5–§16.7).
/// </summary>
public sealed class ContentTests
{
  [Fact]
  public void Content_blocks_serialize_with_their_type_discriminator()
  {
    IReadOnlyList<ContentBlock> blocks =
    [
      ContentBlocks.Text("hello"),
      ContentBlocks.Image("AAAA", "image/png"),
      ContentBlocks.Audio("BBBB", "audio/wav"),
      ContentBlocks.Resource(ResourceContents.OfText("docs://readme", "# Title", "text/markdown")),
      ContentBlocks.LinkTo("weather://oslo/current", "Oslo weather", "application/json"),
    ];

    var json = McpJson.Serialize(blocks);

    Assert.Contains("\"type\":\"text\"", json);
    Assert.Contains("\"type\":\"image\"", json);
    Assert.Contains("\"type\":\"audio\"", json);
    Assert.Contains("\"type\":\"resource\"", json);
    Assert.Contains("\"type\":\"resource_link\"", json);
  }

  [Fact]
  public void Content_blocks_round_trip_to_their_concrete_subtype()
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.Text("hi"));
    var block = McpJson.Deserialize<ContentBlock>(json);
    var text = Assert.IsType<TextContent>(block);
    Assert.Equal("hi", text.Text);
  }

  [Fact]
  public void Embedded_resource_round_trips_its_text_variant()
  {
    var embedded = ContentBlocks.Resource(ResourceContents.OfText("docs://x", "body", "text/plain"));
    var json = McpJson.Serialize<ContentBlock>(embedded);
    var back = Assert.IsType<EmbeddedResource>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal("body", back.Resource.Text);
    Assert.Null(back.Resource.Blob);
  }

  [Fact]
  public void Resource_contents_variants_are_distinguished_by_payload_field()
  {
    Assert.Contains("\"text\":", McpJson.Serialize(ResourceContents.OfText("u", "t")));
    Assert.DoesNotContain("\"blob\":", McpJson.Serialize(ResourceContents.OfText("u", "t")));
    Assert.Contains("\"blob\":", McpJson.Serialize(ResourceContents.OfBlob("u", "QkJCQg==")));
  }

  [Fact]
  public void Role_audience_uses_lowercase_wire_values()
  {
    var annotations = new Annotations { Audience = [Role.User, Role.Assistant], Priority = 0.3 };
    var json = McpJson.Serialize(annotations);
    Assert.Contains("\"audience\":[\"user\",\"assistant\"]", json);
  }

  [Fact]
  public void Tool_execution_error_uses_is_error_not_a_protocol_error()
  {
    var result = CallToolResult.FromError("Cannot divide by zero.");
    var json = McpJson.Serialize(result);

    Assert.Contains("\"isError\":true", json);
    Assert.Contains("Cannot divide by zero.", json);
  }

  [Fact]
  public void Tool_with_structured_content_serializes_both_fields()
  {
    var result = new CallToolResult
    {
      Content = [ContentBlocks.Text("{\"tempC\":21}")],
      StructuredContent = new JsonObject { ["tempC"] = 21 },
    };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"content\":", json);
    Assert.Contains("\"structuredContent\":{\"tempC\":21}", json);
    Assert.DoesNotContain("\"isError\"", json); // absent ⇒ false
  }

  [Fact]
  public void Tool_input_schema_is_carried_verbatim()
  {
    var tool = new Tool
    {
      Name = "add",
      InputSchema = new JsonObject
      {
        ["type"] = "object",
        ["properties"] = new JsonObject { ["a"] = new JsonObject { ["type"] = "number" } },
        ["required"] = new JsonArray("a"),
      },
      Annotations = new ToolAnnotations { ReadOnlyHint = true },
    };
    var json = McpJson.Serialize(tool);

    Assert.Contains("\"inputSchema\":{\"type\":\"object\"", json);
    Assert.Contains("\"readOnlyHint\":true", json);
  }

  // ----- ContentBlock: case-sensitive dispatch (AC-21.1 — R-14.4-a) -----

  [Fact]
  public void Content_block_dispatches_on_exact_lowercase_type()
  {
    var block = McpJson.Deserialize<ContentBlock>("""{"type":"text","text":"hi"}""");
    Assert.IsType<TextContent>(block);
  }

  [Theory]
  [InlineData("""{"type":"Text","text":"hi"}""")]
  [InlineData("""{"type":"TEXT","text":"hi"}""")]
  public void Content_block_case_variant_falls_through_to_unsupported_not_text(string json)
  {
    // "Text"/"TEXT" do NOT match the case-sensitive "text" discriminator; they are accepted as
    // unsupported content rather than being mis-dispatched or rejected (R-14.4-a, R-14.4-b).
    var block = McpJson.Deserialize<ContentBlock>(json);
    var unsupported = Assert.IsType<UnsupportedContentBlock>(block);
    Assert.NotEqual("text", unsupported.Type);
  }

  // ----- ContentBlock: unknown type handling (AC-21.2 — R-14.4-b) -----

  [Fact]
  public void Content_block_with_unknown_type_deserializes_to_unsupported_fallback()
  {
    var block = McpJson.Deserialize<ContentBlock>(
      """{"type":"future_content_type","customField":42}""");
    var unsupported = Assert.IsType<UnsupportedContentBlock>(block);
    Assert.Equal("future_content_type", unsupported.Type);
    Assert.Equal(42, unsupported.Raw["customField"]!.GetValue<int>());
  }

  [Fact]
  public void Unsupported_content_block_round_trips_its_raw_wire_object_verbatim()
  {
    const string json = """{"type":"future_diagram_type","data":{"nodes":3}}""";
    var block = McpJson.Deserialize<ContentBlock>(json);
    Assert.IsType<UnsupportedContentBlock>(block);

    var back = McpJson.Serialize(block);
    Assert.Contains("\"type\":\"future_diagram_type\"", back);
    Assert.Contains("\"data\":{\"nodes\":3}", back);
  }

  [Fact]
  public void Unknown_content_block_does_not_fail_an_enclosing_list()
  {
    // R-14.4-b: an unknown block in a list of content must not fail the whole message.
    const string json = """[{"type":"text","text":"ok"},{"type":"mystery","x":1}]""";
    var blocks = McpJson.Deserialize<IReadOnlyList<ContentBlock>>(json)!;
    Assert.Equal(2, blocks.Count);
    Assert.IsType<TextContent>(blocks[0]);
    Assert.IsType<UnsupportedContentBlock>(blocks[1]);
  }

  [Theory]
  [InlineData("text", true)]
  [InlineData("image", true)]
  [InlineData("audio", true)]
  [InlineData("resource_link", true)]
  [InlineData("resource", true)]
  [InlineData("future_type", false)]
  [InlineData("Text", false)]
  public void Is_known_content_block_type_recognizes_only_the_five_known_types(string type, bool known) =>
    Assert.Equal(known, ContentBlockTypes.IsKnown(type));

  // ----- Forbidden sampling content types (AC-21.20 — R-14.8-a, R-14.8-b) -----

  [Theory]
  [InlineData("""{"type":"tool_use","input":{}}""")]
  [InlineData("""{"type":"tool_result","content":[]}""")]
  public void Content_block_rejects_forbidden_sampling_types(string json)
  {
    // tool_use / tool_result MUST NOT appear where a ContentBlock is expected — they are rejected
    // even though a genuinely unknown type would be accepted (R-14.8-a, R-14.8-b).
    Assert.Throws<JsonException>(() => McpJson.Deserialize<ContentBlock>(json));
  }

  [Fact]
  public void Content_block_still_accepts_a_genuinely_unknown_future_type()
  {
    var block = McpJson.Deserialize<ContentBlock>("""{"type":"future_diagram_type","data":{}}""");
    Assert.IsType<UnsupportedContentBlock>(block);
  }

  [Theory]
  [InlineData("tool_use", true)]
  [InlineData("tool_result", true)]
  [InlineData("text", false)]
  [InlineData("image", false)]
  [InlineData("resource", false)]
  [InlineData("future_type", false)]
  public void Is_forbidden_content_block_type_flags_only_the_sampling_types(string type, bool forbidden) =>
    Assert.Equal(forbidden, ContentBlockTypes.IsForbidden(type));

  // ----- ImageContent / AudioContent base64 data (R-14.4.2-b, R-14.4.3-b) -----

  [Theory]
  [InlineData("image", "image/png")]
  [InlineData("audio", "audio/wav")]
  public void Image_and_audio_accept_valid_base64_data(string type, string mimeType)
  {
    var json = $$"""{"type":"{{type}}","data":"aGVsbG8=","mimeType":"{{mimeType}}"}""";
    var block = McpJson.Deserialize<ContentBlock>(json);
    Assert.NotNull(block);
  }

  [Theory]
  [InlineData("image", "image/png")]
  [InlineData("audio", "audio/wav")]
  public void Image_and_audio_reject_non_base64_data(string type, string mimeType)
  {
    var json = $$"""{"type":"{{type}}","data":"not!base64","mimeType":"{{mimeType}}"}""";
    Assert.Throws<JsonException>(() => McpJson.Deserialize<ContentBlock>(json));
  }

  // ----- isValidBase64 (R-14.5-f) -----

  [Theory]
  [InlineData("aGVsbG8=", true)]   // standard with padding
  [InlineData("aGVsbG8", true)]    // unpadded
  [InlineData("", true)]           // empty string is valid
  [InlineData("a-_b", true)]       // URL-safe alphabet accepted
  [InlineData("hello world!", false)]
  [InlineData("not valid!!", false)]
  public void Is_valid_base64_matches_the_extended_alphabet(string input, bool valid) =>
    Assert.Equal(valid, Base64.IsValidBase64(input));

  // ----- ResourceContents: both text and blob rejected (R-14.5-h) -----

  [Fact]
  public void Resource_contents_rejects_carrying_both_text_and_blob()
  {
    const string json = """{"uri":"file:///x","text":"hello","blob":"aGVsbG8="}""";
    Assert.Throws<JsonException>(() => McpJson.Deserialize<ResourceContents>(json));
  }

  [Fact]
  public void Embedded_resource_rejects_a_resource_carrying_both_text_and_blob()
  {
    const string json = """{"type":"resource","resource":{"uri":"file:///x","text":"h","blob":"aGVsbG8="}}""";
    Assert.Throws<JsonException>(() => McpJson.Deserialize<ContentBlock>(json));
  }

  [Fact]
  public void Resource_contents_rejects_carrying_neither_text_nor_blob()
  {
    // A {uri} with neither payload is not a valid variant (R-14.5-d, R-14.5-g).
    Assert.Throws<JsonException>(() => McpJson.Deserialize<ResourceContents>("""{"uri":"file:///x"}"""));
  }

  [Fact]
  public void Resource_contents_blob_must_be_valid_base64()
  {
    Assert.Throws<JsonException>(
      () => McpJson.Deserialize<ResourceContents>("""{"uri":"file:///x","blob":"not valid!!"}"""));
  }

  [Fact]
  public void Resource_contents_text_variant_round_trips_after_validation()
  {
    var back = McpJson.Deserialize<ResourceContents>("""{"uri":"file:///r","text":"body","mimeType":"text/plain"}""")!;
    Assert.Equal("body", back.Text);
    Assert.Null(back.Blob);
    Assert.Equal("text/plain", back.MimeType);
  }

  // ----- resolveDisplayName precedence (R-14.1-c/d/e) -----

  [Fact]
  public void Resolve_display_name_prefers_title()
  {
    Assert.Equal("The Title", DisplayName.Resolve("the_name", "The Title", "Annotated"));
  }

  [Fact]
  public void Resolve_display_name_falls_back_to_annotations_title_when_title_absent()
  {
    Assert.Equal("Annotated", DisplayName.Resolve("the_name", null, "Annotated"));
    Assert.Equal("Annotated", DisplayName.Resolve("the_name", "", "Annotated"));
  }

  [Fact]
  public void Resolve_display_name_falls_back_to_name_last()
  {
    Assert.Equal("the_name", DisplayName.Resolve("the_name"));
    Assert.Equal("the_name", DisplayName.Resolve("the_name", "", ""));
  }
}
