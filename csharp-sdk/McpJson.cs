using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp;

/// <summary>
/// The single, shared <see cref="JsonSerializerOptions"/> used for every MCP wire
/// (de)serialization in this SDK.
/// </summary>
/// <remarks>
/// <para>
/// MCP field names are mostly <c>camelCase</c> (for example <c>supportedVersions</c>,
/// <c>serverInfo</c>), so <see cref="JsonNamingPolicy.CamelCase"/> is the default for any
/// unannotated member; the handful of reserved, dotted keys (such as
/// <c>io.modelcontextprotocol/protocolVersion</c>) are written verbatim via explicit
/// <see cref="JsonPropertyNameAttribute"/> annotations.
/// </para>
/// <para>
/// <c>null</c> members are omitted on write (MCP treats an absent optional field and a
/// <c>null</c> field identically), and the options are frozen so the configuration cannot
/// drift at runtime.
/// </para>
/// </remarks>
public static class McpJson
{
  /// <summary>The shared, read-only serializer options for all MCP messages.</summary>
  public static JsonSerializerOptions Options { get; } = CreateOptions();

  private static JsonSerializerOptions CreateOptions()
  {
    var options = new JsonSerializerOptions
    {
      DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
      PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
      // Wire payloads are exchanged with peers in other languages; never emit comments
      // or trailing commas, and read strictly.
      ReadCommentHandling = JsonCommentHandling.Disallow,
      AllowTrailingCommas = false,
      // The wire is JSON in HTTP bodies (not HTML), so use the relaxed encoder: it emits
      // characters like ', <, >, & literally — matching JSON.stringify (and the TypeScript
      // SDK) byte-for-byte — while still escaping control characters, quotes, and backslashes.
      Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
    options.Converters.Add(new RequestIdJsonConverter());
    // Freeze the options, populating the default reflection-based type resolver so the SDK
    // works without source-generated metadata (the companion hosts run JIT, not trimmed AOT).
    options.MakeReadOnly(populateMissingResolver: true);
    return options;
  }

  /// <summary>Serializes <paramref name="value"/> to compact UTF-8 JSON text.</summary>
  /// <typeparam name="T">The value's static type.</typeparam>
  /// <param name="value">The value to serialize.</param>
  /// <returns>The JSON text.</returns>
  public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

  /// <summary>Deserializes <paramref name="json"/> into <typeparamref name="T"/>.</summary>
  /// <typeparam name="T">The target type.</typeparam>
  /// <param name="json">The JSON text.</param>
  /// <returns>The deserialized value, or <c>null</c> when the JSON is the literal <c>null</c>.</returns>
  public static T? Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);
}
