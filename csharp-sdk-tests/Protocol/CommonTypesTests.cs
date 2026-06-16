using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape coverage for the §14 common data types: the <see cref="ContentBlock"/>
/// discriminated union (§14.4), <see cref="ResourceContents"/> variants (§14.5),
/// <see cref="Annotations"/> hints (§14.6), the <see cref="Role"/> enum (§14.7),
/// <see cref="Implementation"/> identity (§14.3), and <see cref="Icon"/> descriptors (§14.2).
/// Each case asserts only behavior the SDK actually implements and round-trips through
/// <see cref="McpJson.Options"/> where applicable.
/// </summary>
public sealed class CommonTypesTests
{
  // ----- ContentBlock: type discriminator on serialize (§14.4) -----

  [Theory]
  [InlineData("text")]
  [InlineData("image")]
  [InlineData("audio")]
  [InlineData("resource")]
  [InlineData("resource_link")]
  public void ContentBlock_serializes_with_the_expected_type_discriminator(string discriminator)
  {
    ContentBlock block = discriminator switch
    {
      "text" => ContentBlocks.Text("hello"),
      "image" => ContentBlocks.Image("AAAA", "image/png"),
      "audio" => ContentBlocks.Audio("BBBB", "audio/wav"),
      "resource" => ContentBlocks.Resource(ResourceContents.OfText("docs://r", "body")),
      "resource_link" => ContentBlocks.LinkTo("weather://oslo", "oslo"),
      _ => throw new ArgumentOutOfRangeException(nameof(discriminator)),
    };

    var json = McpJson.Serialize(block);

    Assert.Contains($"\"type\":\"{discriminator}\"", json);
  }

  // ----- ContentBlock: deserialize back to the concrete subtype (§14.4) -----

  [Theory]
  [InlineData("text", typeof(TextContent))]
  [InlineData("image", typeof(ImageContent))]
  [InlineData("audio", typeof(AudioContent))]
  [InlineData("resource", typeof(EmbeddedResource))]
  [InlineData("resource_link", typeof(ResourceLink))]
  public void ContentBlock_deserializes_to_the_concrete_subtype(string discriminator, Type expected)
  {
    ContentBlock block = discriminator switch
    {
      "text" => ContentBlocks.Text("hello"),
      "image" => ContentBlocks.Image("AAAA", "image/png"),
      "audio" => ContentBlocks.Audio("BBBB", "audio/wav"),
      "resource" => ContentBlocks.Resource(ResourceContents.OfBlob("docs://r", "QkJCQg==")),
      "resource_link" => ContentBlocks.LinkTo("weather://oslo", "oslo"),
      _ => throw new ArgumentOutOfRangeException(nameof(discriminator)),
    };

    var json = McpJson.Serialize(block);
    var back = McpJson.Deserialize<ContentBlock>(json);

    Assert.IsType(expected, back);
  }

  [Theory]
  [InlineData("""{"type":"text","text":"x"}""", typeof(TextContent))]
  [InlineData("""{"type":"image","data":"AA","mimeType":"image/png"}""", typeof(ImageContent))]
  [InlineData("""{"type":"audio","data":"AA","mimeType":"audio/wav"}""", typeof(AudioContent))]
  [InlineData("""{"type":"resource","resource":{"uri":"u","text":"t"}}""", typeof(EmbeddedResource))]
  [InlineData("""{"type":"resource_link","uri":"u","name":"n"}""", typeof(ResourceLink))]
  public void ContentBlock_dispatches_on_exact_type_string(string json, Type expected)
  {
    var block = McpJson.Deserialize<ContentBlock>(json);
    Assert.IsType(expected, block);
  }

  // ----- TextContent required field (§14.4.1) -----

  [Fact]
  public void TextContent_carries_required_text()
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.Text("the build passed"));
    Assert.Contains("\"text\":\"the build passed\"", json);

    var back = Assert.IsType<TextContent>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal("the build passed", back.Text);
  }

  // ----- ImageContent required fields (§14.4.2) -----

  [Theory]
  [InlineData("iVBORw0KGgo=", "image/png")]
  [InlineData("/9j/4AAQ", "image/jpeg")]
  [InlineData("UklGRg==", "image/webp")]
  public void ImageContent_carries_required_data_and_mime_type(string data, string mimeType)
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.Image(data, mimeType));
    Assert.Contains($"\"data\":\"{data}\"", json);
    Assert.Contains($"\"mimeType\":\"{mimeType}\"", json);

    var back = Assert.IsType<ImageContent>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal(data, back.Data);
    Assert.Equal(mimeType, back.MimeType);
  }

  // ----- AudioContent required fields (§14.4.3) -----

  [Theory]
  [InlineData("UklGRiQ=", "audio/wav")]
  [InlineData("SUQzBA==", "audio/mpeg")]
  [InlineData("T2dnUw==", "audio/ogg")]
  public void AudioContent_carries_required_data_and_mime_type(string data, string mimeType)
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.Audio(data, mimeType));
    Assert.Contains($"\"data\":\"{data}\"", json);
    Assert.Contains($"\"mimeType\":\"{mimeType}\"", json);

    var back = Assert.IsType<AudioContent>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal(data, back.Data);
    Assert.Equal(mimeType, back.MimeType);
  }

  // ----- ResourceLink required fields (§14.4.4) -----

  [Fact]
  public void ResourceLink_carries_required_uri_and_name()
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.LinkTo("file:///a.txt", "a"));
    Assert.Contains("\"uri\":\"file:///a.txt\"", json);
    Assert.Contains("\"name\":\"a\"", json);

    var back = Assert.IsType<ResourceLink>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal("file:///a.txt", back.Uri);
    Assert.Equal("a", back.Name);
  }

  // ----- ResourceLink optional fields are omitted when null (§14.4.4) -----

  [Theory]
  [InlineData("title")]
  [InlineData("description")]
  [InlineData("mimeType")]
  [InlineData("size")]
  [InlineData("icons")]
  public void ResourceLink_omits_unset_optional_fields(string field)
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.LinkTo("file:///a", "a"));
    Assert.DoesNotContain($"\"{field}\":", json);
  }

  [Fact]
  public void ResourceLink_serializes_all_optional_fields_when_set()
  {
    var link = new ResourceLink
    {
      Uri = "file:///doc.md",
      Name = "doc",
      Title = "The Doc",
      Description = "A document",
      MimeType = "text/markdown",
      Size = 4096,
      Icons = [new Icon { Src = "https://x/icon.png", MimeType = "image/png" }],
    };
    var json = McpJson.Serialize<ContentBlock>(link);

    Assert.Contains("\"title\":\"The Doc\"", json);
    Assert.Contains("\"description\":\"A document\"", json);
    Assert.Contains("\"mimeType\":\"text/markdown\"", json);
    Assert.Contains("\"size\":4096", json);
    Assert.Contains("\"icons\":[", json);

    var back = Assert.IsType<ResourceLink>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal("The Doc", back.Title);
    Assert.Equal("A document", back.Description);
    Assert.Equal("text/markdown", back.MimeType);
    Assert.Equal(4096, back.Size);
    Assert.Single(back.Icons!);
  }

  // ----- EmbeddedResource required field (§14.4.5) -----

  [Fact]
  public void EmbeddedResource_carries_required_resource()
  {
    var embedded = ContentBlocks.Resource(ResourceContents.OfText("docs://x", "body", "text/plain"));
    var json = McpJson.Serialize<ContentBlock>(embedded);
    Assert.Contains("\"resource\":{", json);

    var back = Assert.IsType<EmbeddedResource>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal("docs://x", back.Resource.Uri);
    Assert.Equal("body", back.Resource.Text);
  }

  // ----- Annotations carried on content blocks (§14.6) -----

  [Fact]
  public void ContentBlock_carries_annotations_when_present()
  {
    var block = ContentBlocks.Text("x", new Annotations { Audience = [Role.User], Priority = 0.3 });
    var json = McpJson.Serialize<ContentBlock>(block);
    Assert.Contains("\"annotations\":{", json);

    var back = Assert.IsType<TextContent>(McpJson.Deserialize<ContentBlock>(json));
    Assert.NotNull(back.Annotations);
    Assert.Equal(0.3, back.Annotations!.Priority);
    Assert.Equal(Role.User, back.Annotations.Audience![0]);
  }

  [Fact]
  public void ContentBlock_omits_annotations_when_absent()
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.Text("x"));
    Assert.DoesNotContain("\"annotations\":", json);
  }

  // ----- _meta carried on content blocks (§4/§14.4) -----

  [Fact]
  public void ContentBlock_carries_meta_under_the_underscore_key()
  {
    var block = new TextContent { Text = "x", Meta = new JsonObject { ["k"] = "v" } };
    var json = McpJson.Serialize<ContentBlock>(block);
    Assert.Contains("\"_meta\":{\"k\":\"v\"}", json);

    var back = Assert.IsType<TextContent>(McpJson.Deserialize<ContentBlock>(json));
    Assert.Equal("v", back.Meta!["k"]!.GetValue<string>());
  }

  [Fact]
  public void ContentBlock_omits_meta_when_absent()
  {
    var json = McpJson.Serialize<ContentBlock>(ContentBlocks.Text("x"));
    Assert.DoesNotContain("\"_meta\":", json);
  }

  // ----- ResourceContents: text vs blob variants, never both (§14.5) -----

  [Fact]
  public void ResourceContents_text_variant_carries_text_not_blob()
  {
    var contents = ResourceContents.OfText("file:///a.txt", "hi", "text/plain");
    var json = McpJson.Serialize(contents);

    Assert.Contains("\"text\":\"hi\"", json);
    Assert.DoesNotContain("\"blob\":", json);

    var back = McpJson.Deserialize<ResourceContents>(json)!;
    Assert.Equal("hi", back.Text);
    Assert.Null(back.Blob);
  }

  [Fact]
  public void ResourceContents_blob_variant_carries_blob_not_text()
  {
    var contents = ResourceContents.OfBlob("file:///a.bin", "QkJCQg==", "application/octet-stream");
    var json = McpJson.Serialize(contents);

    Assert.Contains("\"blob\":\"QkJCQg==\"", json);
    Assert.DoesNotContain("\"text\":", json);

    var back = McpJson.Deserialize<ResourceContents>(json)!;
    Assert.Equal("QkJCQg==", back.Blob);
    Assert.Null(back.Text);
  }

  [Theory]
  [InlineData("file:///a", "text/plain")]
  [InlineData("docs://readme", "text/markdown")]
  [InlineData("https://x/y", null)]
  public void ResourceContents_OfText_round_trips(string uri, string? mimeType)
  {
    var contents = ResourceContents.OfText(uri, "payload", mimeType);
    var back = McpJson.Deserialize<ResourceContents>(McpJson.Serialize(contents))!;

    Assert.Equal(uri, back.Uri);
    Assert.Equal("payload", back.Text);
    Assert.Equal(mimeType, back.MimeType);
    Assert.Null(back.Blob);
  }

  [Theory]
  [InlineData("file:///a.bin", "application/pdf")]
  [InlineData("data://x", null)]
  public void ResourceContents_OfBlob_round_trips(string uri, string? mimeType)
  {
    var contents = ResourceContents.OfBlob(uri, "QkJCQg==", mimeType);
    var back = McpJson.Deserialize<ResourceContents>(McpJson.Serialize(contents))!;

    Assert.Equal(uri, back.Uri);
    Assert.Equal("QkJCQg==", back.Blob);
    Assert.Equal(mimeType, back.MimeType);
    Assert.Null(back.Text);
  }

  [Fact]
  public void ResourceContents_omits_mime_type_when_absent()
  {
    var json = McpJson.Serialize(ResourceContents.OfText("u", "t"));
    Assert.DoesNotContain("\"mimeType\":", json);
  }

  [Fact]
  public void ResourceContents_carries_meta_under_the_underscore_key()
  {
    var contents = ResourceContents.OfText("u", "t") with { Meta = new JsonObject { ["k"] = 1 } };
    var json = McpJson.Serialize(contents);
    Assert.Contains("\"_meta\":{\"k\":1}", json);

    var back = McpJson.Deserialize<ResourceContents>(json)!;
    Assert.Equal(1, back.Meta!["k"]!.GetValue<int>());
  }

  // ----- Role enum wire values (§14.7) -----

  [Theory]
  [InlineData(Role.User, "user")]
  [InlineData(Role.Assistant, "assistant")]
  public void Role_serializes_to_its_lowercase_wire_value(Role role, string wire)
  {
    var json = McpJson.Serialize(role);
    Assert.Equal($"\"{wire}\"", json);
  }

  [Theory]
  [InlineData("\"user\"", Role.User)]
  [InlineData("\"assistant\"", Role.Assistant)]
  public void Role_deserializes_from_its_lowercase_wire_value(string json, Role expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<Role>(json));
  }

  // ----- Annotations: audience, priority, lastModified (§14.6) -----

  [Fact]
  public void Annotations_audience_serializes_as_an_array_of_role_wire_values()
  {
    var json = McpJson.Serialize(new Annotations { Audience = [Role.User, Role.Assistant] });
    Assert.Contains("\"audience\":[\"user\",\"assistant\"]", json);
  }

  [Theory]
  [InlineData(0.0)]
  [InlineData(0.5)]
  [InlineData(1.0)]
  public void Annotations_priority_round_trips(double priority)
  {
    var back = McpJson.Deserialize<Annotations>(McpJson.Serialize(new Annotations { Priority = priority }))!;
    Assert.Equal(priority, back.Priority);
  }

  [Theory]
  [InlineData("2025-01-12T15:00:58Z")]
  [InlineData("2026-07-28T09:15:00Z")]
  public void Annotations_last_modified_round_trips(string timestamp)
  {
    var back = McpJson.Deserialize<Annotations>(McpJson.Serialize(new Annotations { LastModified = timestamp }))!;
    Assert.Equal(timestamp, back.LastModified);
  }

  [Theory]
  [InlineData("audience")]
  [InlineData("priority")]
  [InlineData("lastModified")]
  public void Annotations_omits_unset_optional_fields(string field)
  {
    var json = McpJson.Serialize(new Annotations());
    Assert.DoesNotContain($"\"{field}\":", json);
  }

  // ----- Icon: src, mimeType, sizes (§14.2) -----

  [Fact]
  public void Icon_carries_required_src()
  {
    var json = McpJson.Serialize(new Icon { Src = "https://x/icon.png" });
    Assert.Contains("\"src\":\"https://x/icon.png\"", json);

    var back = McpJson.Deserialize<Icon>(json)!;
    Assert.Equal("https://x/icon.png", back.Src);
  }

  [Theory]
  [InlineData("https://x/i.png", "image/png", "48x48")]
  [InlineData("https://x/i.svg", "image/svg+xml", "any")]
  [InlineData("data:image/png;base64,AAAA", "image/png", "16x16 32x32")]
  public void Icon_round_trips_src_mime_type_and_sizes(string src, string mimeType, string sizes)
  {
    var icon = new Icon { Src = src, MimeType = mimeType, Sizes = sizes.Split(' ') };
    var back = McpJson.Deserialize<Icon>(McpJson.Serialize(icon))!;

    Assert.Equal(src, back.Src);
    Assert.Equal(mimeType, back.MimeType);
    Assert.Equal(sizes.Split(' '), back.Sizes);
  }

  [Theory]
  [InlineData("mimeType")]
  [InlineData("sizes")]
  public void Icon_omits_unset_optional_fields(string field)
  {
    var json = McpJson.Serialize(new Icon { Src = "https://x/i.png" });
    Assert.DoesNotContain($"\"{field}\":", json);
  }

  // ----- Implementation identity (§14.3) -----

  [Fact]
  public void Implementation_carries_required_name_and_version()
  {
    var json = McpJson.Serialize(new Implementation { Name = "srv", Version = "1.0.0" });
    Assert.Contains("\"name\":\"srv\"", json);
    Assert.Contains("\"version\":\"1.0.0\"", json);
  }

  [Fact]
  public void Implementation_serializes_all_optional_fields_when_set()
  {
    var impl = new Implementation
    {
      Name = "example-files-server",
      Title = "Example Files Server",
      Version = "1.4.2",
      Description = "Provides read access to project files.",
      WebsiteUrl = "https://example.com/files-server",
      Icons = [new Icon { Src = "https://example.com/i.png", MimeType = "image/png", Sizes = ["48x48"] }],
    };
    var json = McpJson.Serialize(impl);

    Assert.Contains("\"title\":\"Example Files Server\"", json);
    Assert.Contains("\"description\":\"Provides read access to project files.\"", json);
    Assert.Contains("\"websiteUrl\":\"https://example.com/files-server\"", json);
    Assert.Contains("\"icons\":[", json);

    var back = McpJson.Deserialize<Implementation>(json)!;
    Assert.Equal("Example Files Server", back.Title);
    Assert.Equal("Provides read access to project files.", back.Description);
    Assert.Equal("https://example.com/files-server", back.WebsiteUrl);
    Assert.Single(back.Icons!);
  }

  [Theory]
  [InlineData("title")]
  [InlineData("description")]
  [InlineData("websiteUrl")]
  [InlineData("icons")]
  public void Implementation_omits_unset_optional_fields(string field)
  {
    var json = McpJson.Serialize(new Implementation { Name = "n", Version = "v" });
    Assert.DoesNotContain($"\"{field}\":", json);
  }

  // ----- Full round-trip of an annotated embedded resource (§14.9 example) -----

  [Fact]
  public void Embedded_resource_with_annotations_round_trips_in_full()
  {
    var block = new EmbeddedResource
    {
      Resource = ResourceContents.OfText("file:///project/README.md", "# Example Project", "text/markdown"),
      Annotations = new Annotations
      {
        Audience = [Role.User, Role.Assistant],
        Priority = 0.8,
        LastModified = "2026-07-28T09:15:00Z",
      },
    };

    var back = Assert.IsType<EmbeddedResource>(
      McpJson.Deserialize<ContentBlock>(McpJson.Serialize<ContentBlock>(block)));

    Assert.Equal("file:///project/README.md", back.Resource.Uri);
    Assert.Equal("# Example Project", back.Resource.Text);
    Assert.Equal("text/markdown", back.Resource.MimeType);
    Assert.Equal(0.8, back.Annotations!.Priority);
    Assert.Equal("2026-07-28T09:15:00Z", back.Annotations.LastModified);
    Assert.Equal([Role.User, Role.Assistant], back.Annotations.Audience!);
  }
}
