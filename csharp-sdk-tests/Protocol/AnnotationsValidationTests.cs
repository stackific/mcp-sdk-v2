using System.Text.Json;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Deserialisation-rejection coverage for the §14 common types (S21): the <see cref="Annotations"/>
/// <c>priority</c> field MUST fall within the inclusive 0..1 range and an out-of-range value is rejected
/// on deserialise (R-14.6-d, via <see cref="AnnotationsConverter"/>), and the <see cref="Role"/> enum is
/// a CLOSED set whose only wire values are <c>user</c>/<c>assistant</c> — any other string is rejected
/// (R-14.7-a). These complement the existing round-trip tests, which only cover the accepted values.
/// </summary>
public sealed class AnnotationsValidationTests
{
  // ════════════════════════ R-14.6-d — priority out of the inclusive 0..1 range ════════════════════════

  [Theory]
  [InlineData(1.5)]
  [InlineData(-0.1)]
  [InlineData(2.0)]
  [InlineData(-1.0)]
  [InlineData(1.0000001)]
  [InlineData(100.0)]
  public void Annotations_priority_outside_the_inclusive_0_to_1_range_is_rejected(double priority)
  {
    // The wire is the source of truth: an out-of-range numeric priority must be rejected on deserialise,
    // not silently clamped or accepted. Build the JSON with an invariant-culture decimal point.
    var json = $$"""{"priority":{{priority.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}""";
    Assert.Throws<JsonException>(() => McpJson.Deserialize<Annotations>(json));
  }

  [Theory]
  [InlineData(0.0)]
  [InlineData(0.5)]
  [InlineData(1.0)]
  public void Annotations_priority_at_the_inclusive_boundaries_is_accepted(double priority)
  {
    // The positive control: the boundary values 0 and 1 (and a mid value) are accepted (R-14.6-c).
    var json = $$"""{"priority":{{priority.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}""";
    var back = McpJson.Deserialize<Annotations>(json)!;
    Assert.Equal(priority, back.Priority);
  }

  [Fact]
  public void Annotations_with_no_priority_is_accepted_and_priority_is_null()
  {
    var back = McpJson.Deserialize<Annotations>("""{"lastModified":"2026-01-01T00:00:00Z"}""")!;
    Assert.Null(back.Priority);
  }

  // ════════════════════════ R-14.7-a — Role is a closed user/assistant set ════════════════════════

  [Theory]
  [InlineData("\"system\"")]
  [InlineData("\"tool\"")]
  [InlineData("\"User\"")]       // wire values are lowercase; case-sensitive
  [InlineData("\"ASSISTANT\"")]
  [InlineData("\"\"")]           // empty string
  [InlineData("\"client\"")]     // an endpoint role, not a content-author role
  public void Role_rejects_any_string_outside_the_closed_user_assistant_set(string json)
  {
    // R-14.7-a: the only permitted Role wire values are "user" and "assistant"; anything else is rejected.
    Assert.Throws<JsonException>(() => McpJson.Deserialize<Role>(json));
  }

  [Theory]
  [InlineData("\"user\"", Role.User)]
  [InlineData("\"assistant\"", Role.Assistant)]
  public void Role_accepts_exactly_the_two_wire_values(string json, Role expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<Role>(json));
  }

  [Fact]
  public void An_invalid_role_inside_an_annotations_audience_is_rejected()
  {
    // The closed-set rule also applies when Role appears nested in an Annotations.audience array.
    Assert.Throws<JsonException>(() =>
      McpJson.Deserialize<Annotations>("""{"audience":["user","system"]}"""));
  }
}
