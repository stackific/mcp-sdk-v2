using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// The server-side <see cref="UiHelpers.UiToolResult"/> launcher for the Interactive UI extension
/// (spec §26.3/§26.4): it MUST declare the <c>ui://</c> resource in <c>_meta.ui.resourceUri</c>
/// (R-26.3-b), serve the app HTML verbatim as <c>text/html;profile=mcp-app</c> (R-26.4-d, R-26.1-b),
/// and reject a non-<c>ui://</c> association (R-26.3-b).
/// </summary>
public sealed class UiToolResultTests
{
  private static JsonObject Wire(CallToolResult result) =>
    JsonNode.Parse(McpJson.Serialize(result))!.AsObject();

  [Theory]
  [InlineData("https://example.com/app")]
  [InlineData("http://app")]
  [InlineData("app://x")]
  [InlineData("file:///x")]
  [InlineData("counter")]
  public void Rejects_a_non_ui_scheme_resource_uri(string uri) =>
    Assert.Throws<ArgumentException>(() => UiHelpers.UiToolResult(uri, "<h1>hi</h1>"));

  [Fact]
  public void Declares_the_ui_resource_uri_in_tool_meta_ui()
  {
    var ui = Wire(UiHelpers.UiToolResult("ui://app/counter", "<h1>hi</h1>"))["_meta"]!["ui"]!.AsObject();
    Assert.Equal("ui://app/counter", ui["resourceUri"]!.GetValue<string>());
  }

  [Fact]
  public void Embeds_the_app_html_verbatim_as_the_mcp_app_mime_type()
  {
    var content = Wire(UiHelpers.UiToolResult("ui://app/counter", "<h1>hi</h1>", text: "fallback"))["content"]!.AsArray();
    // The optional text fallback comes first, then the embedded ui:// resource.
    Assert.Equal("fallback", content[0]!["text"]!.GetValue<string>());
    var resource = content[1]!["resource"]!.AsObject();
    Assert.Equal("ui://app/counter", resource["uri"]!.GetValue<string>());
    Assert.Equal("text/html;profile=mcp-app", resource["mimeType"]!.GetValue<string>());
    Assert.Equal("<h1>hi</h1>", resource["text"]!.GetValue<string>());
  }

  [Fact]
  public void Omits_the_text_fallback_when_not_supplied()
  {
    var content = Wire(UiHelpers.UiToolResult("ui://app/x", "<p/>"))["content"]!.AsArray();
    Assert.Single(content);
    Assert.Equal("resource", content[0]!["type"]!.GetValue<string>());
  }

  [Fact]
  public void Omits_visibility_when_not_supplied()
  {
    var ui = Wire(UiHelpers.UiToolResult("ui://app/x", "<p/>"))["_meta"]!["ui"]!.AsObject();
    Assert.False(ui.ContainsKey("visibility"));
  }

  [Theory]
  [InlineData(UiVisibility.App, "app")]
  [InlineData(UiVisibility.Model, "model")]
  public void Writes_visibility_audiences_as_their_wire_strings(UiVisibility audience, string wire)
  {
    var ui = Wire(UiHelpers.UiToolResult("ui://app/x", "<p/>", visibility: [audience]))["_meta"]!["ui"]!.AsObject();
    Assert.Equal([wire], ui["visibility"]!.AsArray().Select(n => n!.GetValue<string>()));
  }
}
