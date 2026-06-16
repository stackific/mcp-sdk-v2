using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The discriminated union of content blocks carried by tool results and prompt messages
/// (spec §14.4). The wire discriminator is the case-sensitive <c>type</c> field (R-14.4-a).
/// </summary>
/// <remarks>
/// <para>
/// Five member types are recognised: <see cref="TextContent"/>, <see cref="ImageContent"/>,
/// <see cref="AudioContent"/>, <see cref="ResourceLink"/>, and <see cref="EmbeddedResource"/>.
/// </para>
/// <para>
/// An <em>unknown</em> <c>type</c> is forward-compatible: it deserialises to
/// <see cref="UnsupportedContentBlock"/> rather than failing the enclosing message (R-14.4-b). The
/// sole exception is the deprecated sampling discriminators <c>tool_use</c> and <c>tool_result</c>,
/// which MUST be rejected even on the fallback path (R-14.8-a, R-14.8-b). This dispatch is performed
/// by <see cref="ContentBlockConverter"/> so the unknown-type tolerance and the forbidden-type
/// rejection are both honoured (STJ's built-in polymorphism would instead throw on any unknown
/// discriminator).
/// </para>
/// </remarks>
[JsonConverter(typeof(ContentBlockConverter))]
public abstract record ContentBlock
{
  private protected ContentBlock() { }

  /// <summary>OPTIONAL. Untrusted presentation hints for this block (§14.6).</summary>
  public Annotations? Annotations { get; init; }

  /// <summary>OPTIONAL. Implementation-specific metadata (§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// The set of <c>type</c> discriminators from the deprecated sampling capability that MUST NOT
/// appear where a <see cref="ContentBlock"/> is expected (R-14.8-a, R-14.8-b).
/// </summary>
public static class ContentBlockTypes
{
  /// <summary>The forbidden sampling content discriminators: <c>tool_use</c> and <c>tool_result</c>.</summary>
  public static IReadOnlySet<string> Forbidden { get; } =
    new HashSet<string>(StringComparer.Ordinal) { "tool_use", "tool_result" };

  /// <summary>The five known, supported content discriminators, in wire order.</summary>
  public static IReadOnlySet<string> Known { get; } =
    new HashSet<string>(StringComparer.Ordinal) { "text", "image", "audio", "resource_link", "resource" };

  /// <summary>
  /// Returns <c>true</c> when <paramref name="type"/> is a known, supported content discriminator.
  /// A receiver SHOULD treat unknown types as unsupported content, not as errors (R-14.4-b).
  /// </summary>
  /// <param name="type">The candidate discriminator.</param>
  /// <returns><c>true</c> when the type is one of the five known content types.</returns>
  public static bool IsKnown(string type) => Known.Contains(type);

  /// <summary>Returns <c>true</c> when <paramref name="type"/> is a forbidden sampling discriminator (R-14.8-a/b).</summary>
  /// <param name="type">The candidate discriminator.</param>
  /// <returns><c>true</c> when the type is <c>tool_use</c> or <c>tool_result</c>.</returns>
  public static bool IsForbidden(string type) => Forbidden.Contains(type);
}

/// <summary>
/// Ergonomic factory helpers for building <see cref="ContentBlock"/> values (spec §14.4).
/// </summary>
public static class ContentBlocks
{
  /// <summary>Creates a <see cref="TextContent"/> block.</summary>
  /// <param name="text">The text.</param>
  /// <param name="annotations">Optional hints.</param>
  /// <returns>The block.</returns>
  public static TextContent Text(string text, Annotations? annotations = null) =>
    new() { Text = text, Annotations = annotations };

  /// <summary>Creates an <see cref="ImageContent"/> block from Base64 data.</summary>
  /// <param name="base64Data">Base64-encoded image bytes.</param>
  /// <param name="mimeType">The image MIME type (for example <c>image/png</c>).</param>
  /// <returns>The block.</returns>
  public static ImageContent Image(string base64Data, string mimeType) =>
    new() { Data = base64Data, MimeType = mimeType };

  /// <summary>Creates an <see cref="AudioContent"/> block from Base64 data.</summary>
  /// <param name="base64Data">Base64-encoded audio bytes.</param>
  /// <param name="mimeType">The audio MIME type (for example <c>audio/wav</c>).</param>
  /// <returns>The block.</returns>
  public static AudioContent Audio(string base64Data, string mimeType) =>
    new() { Data = base64Data, MimeType = mimeType };

  /// <summary>Creates an <see cref="EmbeddedResource"/> block carrying resource contents inline.</summary>
  /// <param name="resource">The embedded contents.</param>
  /// <returns>The block.</returns>
  public static EmbeddedResource Resource(ResourceContents resource) => new() { Resource = resource };

  /// <summary>Creates a <see cref="ResourceLink"/> block referencing a resource by URI.</summary>
  /// <param name="uri">The resource URI.</param>
  /// <param name="name">The programmatic resource name.</param>
  /// <param name="mimeType">The optional MIME type.</param>
  /// <param name="title">The optional display title.</param>
  /// <returns>The block.</returns>
  public static ResourceLink LinkTo(string uri, string name, string? mimeType = null, string? title = null) =>
    new() { Uri = uri, Name = name, MimeType = mimeType, Title = title };
}

/// <summary>Plain text content (spec §14.4.1).</summary>
public sealed record TextContent : ContentBlock
{
  /// <summary>REQUIRED. The text content.</summary>
  public required string Text { get; init; }
}

/// <summary>Base64-encoded image content with a MIME type (spec §14.4.2).</summary>
public sealed record ImageContent : ContentBlock
{
  /// <summary>REQUIRED. Base64-encoded image bytes. MUST contain only valid Base64 characters (R-14.4.2-b).</summary>
  public required string Data { get; init; }

  /// <summary>REQUIRED. The image MIME type.</summary>
  public required string MimeType { get; init; }
}

/// <summary>Base64-encoded audio content with a MIME type (spec §14.4.3).</summary>
public sealed record AudioContent : ContentBlock
{
  /// <summary>REQUIRED. Base64-encoded audio bytes. MUST contain only valid Base64 characters (R-14.4.3-b).</summary>
  public required string Data { get; init; }

  /// <summary>REQUIRED. The audio MIME type.</summary>
  public required string MimeType { get; init; }
}

/// <summary>A reference to a resource by URI rather than its contents (spec §14.4.4).</summary>
public sealed record ResourceLink : ContentBlock
{
  /// <summary>REQUIRED. The referenced resource URI.</summary>
  public required string Uri { get; init; }

  /// <summary>REQUIRED. The programmatic resource name (from <c>BaseMetadata</c>).</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. The human display name.</summary>
  public string? Title { get; init; }

  /// <summary>OPTIONAL. A description of the resource.</summary>
  public string? Description { get; init; }

  /// <summary>OPTIONAL. The resource MIME type, if known.</summary>
  public string? MimeType { get; init; }

  /// <summary>OPTIONAL. The raw resource size in bytes, if known.</summary>
  public long? Size { get; init; }

  /// <summary>OPTIONAL. Icons for display.</summary>
  public IReadOnlyList<Icon>? Icons { get; init; }
}

/// <summary>Resource contents embedded directly into a result or message (spec §14.4.5).</summary>
public sealed record EmbeddedResource : ContentBlock
{
  /// <summary>REQUIRED. The embedded contents (text or blob variant).</summary>
  public required ResourceContents Resource { get; init; }
}

/// <summary>
/// A content block with an unrecognised <c>type</c>, preserved verbatim so a forward-compatible
/// receiver can carry it without failing the enclosing message (R-14.4-b).
/// </summary>
/// <remarks>
/// The original wire object is retained on <see cref="Raw"/> (including the unknown <c>type</c> and
/// any extension fields) and is re-emitted byte-faithfully on serialisation. This type is produced
/// only by <see cref="ContentBlockConverter"/>; it is never used for the five known types and is
/// never produced for the forbidden sampling types, which are rejected instead.
/// </remarks>
public sealed record UnsupportedContentBlock : ContentBlock
{
  /// <summary>The unrecognised <c>type</c> discriminator value (case-sensitive, as received).</summary>
  public required string Type { get; init; }

  /// <summary>The complete original wire object, preserved for faithful round-tripping.</summary>
  public required JsonObject Raw { get; init; }
}

/// <summary>
/// The custom polymorphic (de)serialiser for <see cref="ContentBlock"/>. It dispatches on the
/// case-sensitive <c>type</c> field, tolerates unknown types as <see cref="UnsupportedContentBlock"/>
/// (R-14.4-b), and rejects the forbidden sampling types (R-14.8-a, R-14.8-b).
/// </summary>
public sealed class ContentBlockConverter : JsonConverter<ContentBlock>
{
  /// <inheritdoc />
  public override ContentBlock Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
  {
    // Materialise the object so we can read the discriminator without consuming the concrete
    // payload, then deserialise into the matching concrete type (which has no converter of its own,
    // so there is no recursion back into this converter).
    var node = JsonNode.Parse(ref reader);
    if (node is not JsonObject obj)
    {
      throw new JsonException("A ContentBlock must be a JSON object.");
    }

    if (obj["type"] is not JsonValue typeValue || typeValue.GetValueKind() != JsonValueKind.String)
    {
      throw new JsonException("A ContentBlock must carry a string `type` discriminator (R-14.4-a).");
    }

    var type = typeValue.GetValue<string>();

    if (ContentBlockTypes.IsForbidden(type))
    {
      throw new JsonException(
        "tool_use/tool_result MUST NOT appear where a ContentBlock is expected (R-14.8-a, R-14.8-b).");
    }

    return type switch
    {
      "text" => obj.Deserialize<TextContent>(options)!,
      "image" => ValidateBase64Data(obj.Deserialize<ImageContent>(options)!, static b => b.Data, "R-14.4.2-b"),
      "audio" => ValidateBase64Data(obj.Deserialize<AudioContent>(options)!, static b => b.Data, "R-14.4.3-b"),
      "resource_link" => obj.Deserialize<ResourceLink>(options)!,
      "resource" => obj.Deserialize<EmbeddedResource>(options)!,
      // Forward-compat fallback: an unknown type is preserved, not rejected (R-14.4-b).
      _ => new UnsupportedContentBlock { Type = type, Raw = obj },
    };
  }

  /// <summary>
  /// Enforces that an image/audio block's <c>data</c> is valid Base64 (R-14.4.2-b, R-14.4.3-b),
  /// returning the block unchanged when valid and throwing a <see cref="JsonException"/> otherwise.
  /// </summary>
  private static T ValidateBase64Data<T>(T block, Func<T, string> data, string rule) where T : ContentBlock
  {
    if (!Base64.IsValidBase64(data(block)))
    {
      throw new JsonException($"data MUST contain only valid Base64 characters ({rule}).");
    }

    return block;
  }

  /// <inheritdoc />
  public override void Write(Utf8JsonWriter writer, ContentBlock value, JsonSerializerOptions options)
  {
    // An unsupported block re-emits its preserved wire object verbatim.
    if (value is UnsupportedContentBlock unsupported)
    {
      unsupported.Raw.WriteTo(writer, options);
      return;
    }

    // Serialise the concrete subtype into an object, then prepend the `type` discriminator so the
    // wire shape matches the union member. Serialising as `object` selects the runtime type's
    // contract (TextContent, ImageContent, …) without re-entering this converter.
    var (discriminator, payload) = value switch
    {
      TextContent => ("text", JsonSerializer.SerializeToNode(value, value.GetType(), options)),
      ImageContent => ("image", JsonSerializer.SerializeToNode(value, value.GetType(), options)),
      AudioContent => ("audio", JsonSerializer.SerializeToNode(value, value.GetType(), options)),
      ResourceLink => ("resource_link", JsonSerializer.SerializeToNode(value, value.GetType(), options)),
      EmbeddedResource => ("resource", JsonSerializer.SerializeToNode(value, value.GetType(), options)),
      _ => throw new JsonException($"Unsupported ContentBlock subtype {value.GetType().Name}."),
    };

    var obj = payload as JsonObject ?? throw new JsonException("A ContentBlock must serialise to an object.");

    writer.WriteStartObject();
    writer.WriteString("type", discriminator);
    foreach (var (name, child) in obj)
    {
      writer.WritePropertyName(name);
      if (child is null)
      {
        writer.WriteNullValue();
      }
      else
      {
        child.WriteTo(writer, options);
      }
    }

    writer.WriteEndObject();
  }
}

/// <summary>
/// The concrete contents of a resource (spec §14.5). A value is the text variant if and only
/// if it carries <see cref="Text"/>, and the blob variant if and only if it carries
/// <see cref="Blob"/>; a value MUST NOT carry both (R-14.5-h). Use <see cref="OfText"/>/<see cref="OfBlob"/>
/// to construct a well-formed variant.
/// </summary>
[JsonConverter(typeof(ResourceContentsConverter))]
public sealed record ResourceContents
{
  /// <summary>REQUIRED. The URI of the resource these contents belong to.</summary>
  public required string Uri { get; init; }

  /// <summary>OPTIONAL. The MIME type, if known.</summary>
  public string? MimeType { get; init; }

  /// <summary>The textual content (text variant).</summary>
  public string? Text { get; init; }

  /// <summary>Base64-encoded binary content (blob variant). MUST contain only valid Base64 characters (R-14.5-f).</summary>
  public string? Blob { get; init; }

  /// <summary>OPTIONAL. Implementation-specific metadata (§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }

  /// <summary>Builds the text variant of resource contents.</summary>
  /// <param name="uri">The resource URI.</param>
  /// <param name="text">The textual content.</param>
  /// <param name="mimeType">The optional MIME type.</param>
  /// <returns>The contents.</returns>
  public static ResourceContents OfText(string uri, string text, string? mimeType = null) =>
    new() { Uri = uri, Text = text, MimeType = mimeType };

  /// <summary>Builds the blob variant of resource contents.</summary>
  /// <param name="uri">The resource URI.</param>
  /// <param name="base64Blob">Base64-encoded binary content.</param>
  /// <param name="mimeType">The optional MIME type.</param>
  /// <returns>The contents.</returns>
  public static ResourceContents OfBlob(string uri, string base64Blob, string? mimeType = null) =>
    new() { Uri = uri, Blob = base64Blob, MimeType = mimeType };
}

/// <summary>
/// (De)serialiser for <see cref="ResourceContents"/> that enforces the §14.5 variant rules on read:
/// a value MUST carry exactly one of <c>text</c> or <c>blob</c> (R-14.5-d, R-14.5-g), MUST NOT carry
/// both (R-14.5-h), and any <c>blob</c> MUST be valid Base64 (R-14.5-f). Writing is the default
/// record projection.
/// </summary>
public sealed class ResourceContentsConverter : JsonConverter<ResourceContents>
{
  /// <inheritdoc />
  public override ResourceContents Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
  {
    var node = JsonNode.Parse(ref reader);
    if (node is not JsonObject obj)
    {
      throw new JsonException("ResourceContents must be a JSON object.");
    }

    var hasText = obj.TryGetPropertyValue("text", out var textNode) && textNode is not null;
    var hasBlob = obj.TryGetPropertyValue("blob", out var blobNode) && blobNode is not null;

    if (hasText && hasBlob)
    {
      throw new JsonException("ResourceContents MUST NOT carry both `text` and `blob` (R-14.5-h).");
    }

    if (!hasText && !hasBlob)
    {
      throw new JsonException("ResourceContents MUST carry exactly one of `text` or `blob` (R-14.5-d, R-14.5-g).");
    }

    if (hasBlob)
    {
      var blob = blobNode!.GetValue<string>();
      if (!Base64.IsValidBase64(blob))
      {
        throw new JsonException("blob MUST contain only valid Base64 characters (R-14.5-f).");
      }
    }

    return new ResourceContents
    {
      Uri = obj.TryGetPropertyValue("uri", out var uri) && uri is not null
        ? uri.GetValue<string>()
        : throw new JsonException("ResourceContents requires a string `uri` (R-14.5-a)."),
      MimeType = obj.TryGetPropertyValue("mimeType", out var mime) && mime is not null ? mime.GetValue<string>() : null,
      Text = hasText ? textNode!.GetValue<string>() : null,
      Blob = hasBlob ? blobNode!.GetValue<string>() : null,
      // Deep-clone so the detached node carries no parent reference from the parsed tree.
      Meta = obj.TryGetPropertyValue("_meta", out var meta) && meta is JsonObject metaObj
        ? (JsonObject)metaObj.DeepClone()
        : null,
    };
  }

  /// <inheritdoc />
  public override void Write(Utf8JsonWriter writer, ResourceContents value, JsonSerializerOptions options)
  {
    writer.WriteStartObject();
    writer.WriteString("uri", value.Uri);
    if (value.MimeType is not null)
    {
      writer.WriteString("mimeType", value.MimeType);
    }

    if (value.Text is not null)
    {
      writer.WriteString("text", value.Text);
    }

    if (value.Blob is not null)
    {
      writer.WriteString("blob", value.Blob);
    }

    if (value.Meta is not null)
    {
      writer.WritePropertyName("_meta");
      value.Meta.WriteTo(writer, options);
    }

    writer.WriteEndObject();
  }
}

/// <summary>Base64 validation shared by content, resource-contents, and icon payloads (spec §14.5).</summary>
public static class Base64
{
  /// <summary>
  /// Returns <c>true</c> when <paramref name="s"/> contains only valid Base64 characters (including
  /// optional <c>=</c> padding), accepting both the standard (<c>+/</c>) and URL-safe (<c>-_</c>)
  /// alphabets so the SDK stays interoperable (R-14.5-f, R-14.4.2-b, R-14.4.3-b). An empty string is
  /// valid.
  /// </summary>
  /// <param name="s">The candidate Base64 string.</param>
  /// <returns><c>true</c> when every character is in the (extended) Base64 alphabet.</returns>
  public static bool IsValidBase64(string s)
  {
    ArgumentNullException.ThrowIfNull(s);

    // Mirrors the TypeScript regex /^[A-Za-z0-9+/\-_]*(={0,2})?$/: any run of alphabet characters,
    // then up to two trailing '=' padding characters. Implemented as a single forward scan rather
    // than a Regex so it is allocation-free on the hot path.
    var i = 0;
    while (i < s.Length && IsBase64AlphabetChar(s[i]))
    {
      i++;
    }

    var padding = 0;
    while (i < s.Length && s[i] == '=')
    {
      padding++;
      i++;
    }

    return i == s.Length && padding <= 2;
  }

  private static bool IsBase64AlphabetChar(char c) =>
    c is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '+' or '/' or '-' or '_';
}

/// <summary>Display-name resolution for §14.1 identity types (<c>BaseMetadata</c>).</summary>
public static class DisplayName
{
  /// <summary>
  /// Resolves the display name to show a human user, applying the §14.1 precedence rule
  /// (R-14.1-c/d/e, AC-20.4–6):
  /// </summary>
  /// <remarks>
  /// <list type="number">
  ///   <item><description>Returns <paramref name="title"/> when it is a non-empty string.</description></item>
  ///   <item><description>Returns <paramref name="annotationsTitle"/> when provided and non-empty (tool descriptors only).</description></item>
  ///   <item><description>Falls back to <paramref name="name"/>.</description></item>
  /// </list>
  /// </remarks>
  /// <param name="name">The programmatic identifier (always present).</param>
  /// <param name="title">The human display name (optional).</param>
  /// <param name="annotationsTitle">The tool-only <c>annotations.title</c> (optional).</param>
  /// <returns>The display name per the precedence rule.</returns>
  public static string Resolve(string name, string? title = null, string? annotationsTitle = null)
  {
    if (!string.IsNullOrEmpty(title))
    {
      return title;
    }

    if (!string.IsNullOrEmpty(annotationsTitle))
    {
      return annotationsTitle;
    }

    return name;
  }
}
