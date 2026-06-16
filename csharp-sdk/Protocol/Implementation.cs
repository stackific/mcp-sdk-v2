using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// Identifies a client or server software implementation (spec §14.3). Carried as
/// <c>clientInfo</c> in every request's <c>_meta</c> (§4.3) and as <c>serverInfo</c> in the
/// discovery result (§5.3.2). <see cref="Name"/> and <see cref="Version"/> are REQUIRED.
/// </summary>
/// <remarks>
/// Unknown fields are preserved in <see cref="Extensions"/> for forward-compatibility (the TS
/// schema's <c>.passthrough()</c>; R-14.3-f, AC-20.30) so a newer peer's additional identity fields
/// survive a round-trip rather than being silently dropped.
/// </remarks>
public sealed record Implementation
{
  /// <summary>REQUIRED. Programmatic identifier of the implementation.</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. Human-readable display name.</summary>
  public string? Title { get; init; }

  /// <summary>REQUIRED. Implementation version string.</summary>
  public required string Version { get; init; }

  /// <summary>OPTIONAL. Human-readable description of the implementation's purpose.</summary>
  public string? Description { get; init; }

  /// <summary>OPTIONAL. URI of the implementation's website.</summary>
  public string? WebsiteUrl { get; init; }

  /// <summary>OPTIONAL. Visual identifiers for the implementation (§14.2).</summary>
  public IReadOnlyList<Icon>? Icons { get; init; }

  /// <summary>
  /// Unknown, forward-compatible fields preserved verbatim from the wire (R-14.3-f). Absent when no
  /// extension fields were present.
  /// </summary>
  [JsonExtensionData]
  public JsonObject? Extensions { get; init; }
}

/// <summary>
/// A single icon descriptor (spec §14.2): a source URI with optional MIME type, sizes, and theme.
/// </summary>
/// <remarks>
/// This record models the wire shape only; the §14.2 security validation (scheme allowlist,
/// magic-byte MIME detection, credential-free fetch) lives on <see cref="IconSecurity"/> and is
/// applied deliberately before an advertised icon is fetched or rendered. Unknown fields are
/// preserved in <see cref="Extensions"/> for forward-compatibility (the TS schema's
/// <c>.passthrough()</c>).
/// </remarks>
public sealed record Icon
{
  /// <summary>REQUIRED. The icon source — an <c>https</c> URL or a <c>data:</c> URI.</summary>
  public required string Src { get; init; }

  /// <summary>OPTIONAL. The icon's MIME type (for example <c>image/png</c>).</summary>
  public string? MimeType { get; init; }

  /// <summary>OPTIONAL. The sizes the icon is intended for — each a <c>WxH</c> specifier (for example <c>48x48</c>) or the literal <c>any</c>.</summary>
  public IReadOnlyList<string>? Sizes { get; init; }

  /// <summary>OPTIONAL. The background theme the icon is designed for.</summary>
  public IconTheme? Theme { get; init; }

  /// <summary>Unknown, forward-compatible fields preserved verbatim from the wire (the TS <c>.passthrough()</c>).</summary>
  [JsonExtensionData]
  public JsonObject? Extensions { get; init; }
}

/// <summary>The background theme an <see cref="Icon"/> is designed for (spec §14.2).</summary>
[JsonConverter(typeof(JsonStringEnumConverter<IconTheme>))]
public enum IconTheme
{
  /// <summary>The icon is designed for a light background.</summary>
  [JsonStringEnumMemberName("light")]
  Light,

  /// <summary>The icon is designed for a dark background.</summary>
  [JsonStringEnumMemberName("dark")]
  Dark,
}
