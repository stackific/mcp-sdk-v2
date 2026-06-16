using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

using Xunit;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S06 — Stateless Per-Request Model &amp; Cross-Call Continuity (§4.4–§4.7): the opaque
/// <see cref="ContinuationId"/> validators and the <see cref="FeatureStatus"/> enum. Mirrors the
/// TypeScript <c>stateless.test.ts</c> scenarios.
/// </summary>
public sealed class StatelessTests
{
  // ─── ContinuationId.IsValid ──────────────────────────────────────────────────

  [Fact]
  public void IsValid_AcceptsString()
  {
    Assert.True(ContinuationId.IsValid("eyJvIjoxMDB9.Zm9vYmFy"));
  }

  [Fact]
  public void IsValid_AcceptsNumberAndZero()
  {
    Assert.True(ContinuationId.IsValid(42));
    Assert.True(ContinuationId.IsValid(0));
    Assert.True(ContinuationId.IsValid(12345L));
  }

  [Fact]
  public void IsValid_AcceptsBoolean()
  {
    Assert.True(ContinuationId.IsValid(true));
    Assert.True(ContinuationId.IsValid(false));
  }

  [Fact]
  public void IsValid_AcceptsNull()
  {
    // The JSON `null` literal is an admissible continuation id (R-4.5-b).
    Assert.True(ContinuationId.IsValid(null));
  }

  [Fact]
  public void IsValid_AcceptsArrayAndObjectNodes()
  {
    Assert.True(ContinuationId.IsValid(JsonNode.Parse("[1,2,3]")));
    Assert.True(ContinuationId.IsValid(JsonNode.Parse("""{"offset":100,"version":2}""")));
  }

  [Fact]
  public void IsValid_RejectsNonJsonClrObjects()
  {
    // A delegate / arbitrary CLR object is not JSON-round-trippable (mirrors the TS exclusions of
    // function/symbol/bigint/undefined).
    Func<int> fn = () => 1;
    Assert.False(ContinuationId.IsValid(fn));
    Assert.False(ContinuationId.IsValid(new object()));
  }

  // ─── ContinuationId.IsString ─────────────────────────────────────────────────

  [Fact]
  public void IsString_TrueForStringIncludingEmpty()
  {
    Assert.True(ContinuationId.IsString("opaque-token-value"));
    Assert.True(ContinuationId.IsString(""));
    Assert.True(ContinuationId.IsString(JsonValue.Create("node-string")));
  }

  [Theory]
  [InlineData(42)]
  public void IsString_FalseForNonStrings(int value)
  {
    Assert.False(ContinuationId.IsString(value));
    Assert.False(ContinuationId.IsString(null));
  }

  [Fact]
  public void IsValid_OpaqueLookingStringsAreAccepted()
  {
    // The client must echo verbatim; the validator only checks JSON-serializability.
    Assert.True(ContinuationId.IsValid("aGVsbG8gd29ybGQ="));
    Assert.True(ContinuationId.IsValid("550e8400-e29b-41d4-a716-446655440000"));
  }

  // ─── FeatureStatus enum ──────────────────────────────────────────────────────

  [Fact]
  public void FeatureStatus_HasActiveAndDeprecated()
  {
    Assert.Equal(2, Enum.GetValues<FeatureStatus>().Length);
    Assert.NotEqual(FeatureStatus.Active, FeatureStatus.Deprecated);
  }
}
