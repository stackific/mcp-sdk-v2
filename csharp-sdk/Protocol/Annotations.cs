using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The author/recipient role of a message or the intended audience of content (spec §14.7).
/// The only permitted wire values are <c>user</c> and <c>assistant</c>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<Role>))]
public enum Role
{
  /// <summary>The human participant.</summary>
  [JsonStringEnumMemberName("user")]
  User,

  /// <summary>The language-model participant.</summary>
  [JsonStringEnumMemberName("assistant")]
  Assistant,
}

/// <summary>
/// Optional, untrusted hints about a piece of content or a resource (spec §14.6). A consumer
/// MUST NOT rely on annotation values for security or correctness decisions (R-14.6-f).
/// </summary>
/// <remarks>
/// All fields are OPTIONAL; an absent or empty <see cref="Annotations"/> object is valid. Unknown
/// fields are preserved in <see cref="Extensions"/> for forward-compatibility (the TS schema's
/// <c>.passthrough()</c>). The (de)serialiser enforces the <see cref="Priority"/> 0..1 range
/// (R-14.6-d).
/// </remarks>
[JsonConverter(typeof(AnnotationsConverter))]
public sealed record Annotations
{
  /// <summary>OPTIONAL. The intended audience(s) for the annotated object.</summary>
  public IReadOnlyList<Role>? Audience { get; init; }

  /// <summary>
  /// OPTIONAL. Importance from 0 (least) to 1 (most), inclusive. A value outside the inclusive
  /// 0..1 range is rejected on deserialisation (R-14.6-c, R-14.6-d).
  /// </summary>
  public double? Priority { get; init; }

  /// <summary>OPTIONAL. ISO-8601 timestamp of the last modification.</summary>
  public string? LastModified { get; init; }

  /// <summary>
  /// Unknown, forward-compatible fields preserved verbatim from the wire (the TS <c>.passthrough()</c>).
  /// Absent when no extension fields were present.
  /// </summary>
  /// <remarks>
  /// This is NOT a <see cref="JsonExtensionDataAttribute"/> property: <see cref="Annotations"/> carries a
  /// type-level <see cref="AnnotationsConverter"/> that reads/writes unknown members by hand (so it can
  /// enforce the <see cref="Priority"/> range), and STJ rejects a <see cref="JsonNode"/>-valued extension
  /// dictionary anyway.
  /// </remarks>
  public IDictionary<string, JsonNode?>? Extensions { get; init; }
}

/// <summary>
/// (De)serialiser for <see cref="Annotations"/> that validates the <see cref="Annotations.Priority"/>
/// 0..1 range (R-14.6-d) and round-trips unknown fields through <see cref="Annotations.Extensions"/>
/// (the TS <c>.passthrough()</c>).
/// </summary>
public sealed class AnnotationsConverter : JsonConverter<Annotations>
{
  private static readonly HashSet<string> KnownFields =
    new(StringComparer.Ordinal) { "audience", "priority", "lastModified" };

  /// <inheritdoc />
  public override Annotations Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
  {
    var node = JsonNode.Parse(ref reader);
    if (node is not JsonObject obj)
    {
      throw new JsonException("Annotations must be a JSON object.");
    }

    IReadOnlyList<Role>? audience = null;
    if (obj.TryGetPropertyValue("audience", out var audienceNode) && audienceNode is not null)
    {
      audience = audienceNode.Deserialize<IReadOnlyList<Role>>(options);
    }

    double? priority = null;
    if (obj.TryGetPropertyValue("priority", out var priorityNode) && priorityNode is not null)
    {
      var value = priorityNode.GetValue<double>();
      if (value < 0 || value > 1)
      {
        throw new JsonException("priority MUST be within the inclusive range 0..1 (R-14.6-d).");
      }

      priority = value;
    }

    string? lastModified = null;
    if (obj.TryGetPropertyValue("lastModified", out var lastModifiedNode) && lastModifiedNode is not null)
    {
      lastModified = lastModifiedNode.GetValue<string>();
    }

    Dictionary<string, JsonNode?>? extensions = null;
    foreach (var (name, child) in obj)
    {
      if (KnownFields.Contains(name))
      {
        continue;
      }

      extensions ??= [];
      extensions[name] = child?.DeepClone();
    }

    return new Annotations
    {
      Audience = audience,
      Priority = priority,
      LastModified = lastModified,
      Extensions = extensions,
    };
  }

  /// <inheritdoc />
  public override void Write(Utf8JsonWriter writer, Annotations value, JsonSerializerOptions options)
  {
    writer.WriteStartObject();

    if (value.Audience is not null)
    {
      writer.WritePropertyName("audience");
      JsonSerializer.Serialize(writer, value.Audience, options);
    }

    if (value.Priority is { } priority)
    {
      writer.WriteNumber("priority", priority);
    }

    if (value.LastModified is not null)
    {
      writer.WriteString("lastModified", value.LastModified);
    }

    if (value.Extensions is not null)
    {
      foreach (var (name, child) in value.Extensions)
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
    }

    writer.WriteEndObject();
  }
}
