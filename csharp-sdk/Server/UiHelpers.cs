using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Server;

/// <summary>
/// Helpers for the Interactive User-Interface extension (spec §26): a server returns an interactive UI
/// by embedding a <c>ui://</c> resource (<c>text/html;profile=mcp-app</c>) in a tool result, which the
/// host renders sandboxed. The C# counterpart of the SDK's <c>uiToolResult</c>.
/// </summary>
public static class UiHelpers
{
  /// <summary>
  /// Builds a tool result that launches an MCP App (spec §26.3/§26.4): a text fallback block plus an
  /// embedded <c>ui://</c> resource carrying the app HTML, with the tool's <c>_meta.ui</c> declaring the
  /// resource URI (and, when supplied, the visibility audiences).
  /// </summary>
  /// <remarks>
  /// The <paramref name="resourceUri"/> MUST use the <c>ui://</c> scheme — a non-<c>ui://</c> value is a
  /// non-conformant UI association and is rejected (spec §26.3, R-26.3-b). When
  /// <paramref name="visibility"/> is supplied it is written into the <c>_meta.ui.visibility</c> array;
  /// omitted, the host treats the declaration as <c>["model","app"]</c> (spec §26.3, R-26.3-d).
  /// </remarks>
  /// <param name="resourceUri">The <c>ui://</c> URI identifying the app resource.</param>
  /// <param name="html">The app HTML (served as <c>text/html;profile=mcp-app</c>).</param>
  /// <param name="text">An optional text fallback for hosts that do not render UI.</param>
  /// <param name="visibility">
  /// OPTIONAL invoking audiences (<see cref="UiVisibility"/>); when omitted the host treats the
  /// declaration as <c>["model","app"]</c> and the key carries only <c>resourceUri</c> (§26.3).
  /// </param>
  /// <returns>The tool result.</returns>
  /// <exception cref="ArgumentException">When <paramref name="resourceUri"/> is not a <c>ui://</c> URI (R-26.3-b).</exception>
  public static CallToolResult UiToolResult(
    string resourceUri, string html, string? text = null, IReadOnlyList<UiVisibility>? visibility = null)
  {
    ArgumentNullException.ThrowIfNull(resourceUri);
    if (!Ui.IsUiResourceUri(resourceUri))
    {
      throw new ArgumentException(
        $"UI tool-result resourceUri MUST use the {Ui.UriScheme} scheme (R-26.3-b)", nameof(resourceUri));
    }

    var content = new List<ContentBlock>();
    if (text is not null) content.Add(ContentBlocks.Text(text));
    content.Add(ContentBlocks.Resource(ResourceContents.OfText(resourceUri, html, UiResource.MimeType)));

    var uiMeta = new JsonObject { ["resourceUri"] = resourceUri };
    if (visibility is not null)
    {
      // Honor the visibility option, writing the audiences as the spec wire strings (§26.3, R-26.3-d).
      var array = new JsonArray();
      foreach (var audience in visibility)
      {
        array.Add(audience == UiVisibility.App ? "app" : "model");
      }
      uiMeta["visibility"] = array;
    }

    return new CallToolResult
    {
      Content = content,
      Meta = new JsonObject { [Ui.ToolUiMetaKey] = uiMeta },
    };
  }
}
