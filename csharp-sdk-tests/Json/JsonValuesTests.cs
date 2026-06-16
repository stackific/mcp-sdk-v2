using System.Text.Json.Nodes;

using Stackific.Mcp.Json;

namespace Stackific.Mcp.Tests.Json;

/// <summary>
/// The JSON value model and numeric-handling helpers of <see cref="JsonValues"/> (spec §2.3, §2.5):
/// the six-form value guard, last-duplicate-wins, the safe-integer bounds and predicates, the
/// integer/range assertions, and textual-form-independent numeric equality. Mirrors the TypeScript
/// <c>value.test.ts</c> coverage (AC-02.1, AC-02.3, AC-02.13, AC-02.14, AC-02.15).
/// </summary>
public sealed class JsonValuesTests
{
  // --- IsJsonValue: all six wire forms (AC-02.1 — R-2.3-a). ---

  [Fact]
  public void IsJsonValue_accepts_a_string() =>
    Assert.True(JsonValues.IsJsonValue(JsonValue.Create("hello")));

  [Fact]
  public void IsJsonValue_accepts_a_number() =>
    Assert.True(JsonValues.IsJsonValue(JsonValue.Create(42)));

  [Fact]
  public void IsJsonValue_accepts_boolean_true() =>
    Assert.True(JsonValues.IsJsonValue(JsonValue.Create(true)));

  [Fact]
  public void IsJsonValue_accepts_boolean_false() =>
    Assert.True(JsonValues.IsJsonValue(JsonValue.Create(false)));

  [Fact]
  public void IsJsonValue_accepts_null() =>
    // A JSON null is represented by a null JsonNode reference.
    Assert.True(JsonValues.IsJsonValue(null));

  [Fact]
  public void IsJsonValue_accepts_an_object() =>
    Assert.True(JsonValues.IsJsonValue(new JsonObject { ["a"] = 1 }));

  [Fact]
  public void IsJsonValue_accepts_an_array() =>
    Assert.True(JsonValues.IsJsonValue(new JsonArray(1, "two", null)));

  [Fact]
  public void IsJsonValue_accepts_a_nested_structure()
  {
    var node = new JsonObject { ["x"] = new JsonArray(1, new JsonObject { ["y"] = true }) };
    Assert.True(JsonValues.IsJsonValue(node));
  }

  [Fact]
  public void IsJsonValue_accepts_an_object_with_an_explicit_null_member() =>
    Assert.True(JsonValues.IsJsonValue(new JsonObject { ["a"] = null }));

  // --- LastDuplicateWins: duplicate-key handling (AC-02.3 — R-2.3.1-c). ---

  [Fact]
  public void LastDuplicateWins_uses_the_last_occurrence_for_a_repeated_name()
  {
    var result = JsonValues.LastDuplicateWins(new[]
    {
      new KeyValuePair<string, JsonNode?>("key", JsonValue.Create("first")),
      new KeyValuePair<string, JsonNode?>("key", JsonValue.Create("second")),
    });

    Assert.Equal("second", result["key"]!.GetValue<string>());
  }

  [Fact]
  public void LastDuplicateWins_handles_multiple_duplicate_names_independently()
  {
    var result = JsonValues.LastDuplicateWins(new[]
    {
      new KeyValuePair<string, JsonNode?>("a", JsonValue.Create(1)),
      new KeyValuePair<string, JsonNode?>("b", JsonValue.Create("x")),
      new KeyValuePair<string, JsonNode?>("a", JsonValue.Create(2)),
      new KeyValuePair<string, JsonNode?>("b", JsonValue.Create("y")),
    });

    Assert.Equal(2, result["a"]!.GetValue<int>());
    Assert.Equal("y", result["b"]!.GetValue<string>());
  }

  [Fact]
  public void LastDuplicateWins_returns_all_unique_keys_unchanged()
  {
    var result = JsonValues.LastDuplicateWins(new[]
    {
      new KeyValuePair<string, JsonNode?>("x", JsonValue.Create(1)),
      new KeyValuePair<string, JsonNode?>("y", JsonValue.Create(2)),
    });

    Assert.Equal(1, result["x"]!.GetValue<int>());
    Assert.Equal(2, result["y"]!.GetValue<int>());
    Assert.Equal(2, result.Count);
  }

  [Fact]
  public void LastDuplicateWins_keeps_a_null_value_for_the_last_occurrence()
  {
    var result = JsonValues.LastDuplicateWins(new[]
    {
      new KeyValuePair<string, JsonNode?>("k", JsonValue.Create("present")),
      new KeyValuePair<string, JsonNode?>("k", null),
    });

    Assert.True(result.ContainsKey("k"));
    Assert.Null(result["k"]);
  }

  // --- Safe-integer bounds (AC-02.14 — R-2.5-c, R-2.5-d, R-2.5-e). ---

  [Fact]
  public void SafeIntegerMin_equals_negative_2pow53_minus_1() =>
    Assert.Equal(-9007199254740991L, JsonValues.SafeIntegerMin);

  [Fact]
  public void SafeIntegerMax_equals_2pow53_minus_1() =>
    Assert.Equal(9007199254740991L, JsonValues.SafeIntegerMax);

  [Theory]
  [InlineData(0d)]
  [InlineData(1d)]
  [InlineData(-1d)]
  [InlineData(9007199254740991d)]
  [InlineData(-9007199254740991d)]
  public void IsSafeInteger_returns_true_within_range(double value) =>
    Assert.True(JsonValues.IsSafeInteger(value));

  [Theory]
  [InlineData(9007199254740992d)] // SafeIntegerMax + 1
  [InlineData(-9007199254740992d)] // SafeIntegerMin − 1
  public void IsSafeInteger_returns_false_outside_range(double value) =>
    Assert.False(JsonValues.IsSafeInteger(value));

  [Theory]
  [InlineData(1.5d)]
  [InlineData(0.1d)]
  [InlineData(double.NaN)]
  [InlineData(double.PositiveInfinity)]
  public void IsSafeInteger_returns_false_for_non_integers(double value) =>
    Assert.False(JsonValues.IsSafeInteger(value));

  [Theory]
  [InlineData(9007199254740992d)] // SafeIntegerMax + 1
  [InlineData(-9007199254740992d)] // SafeIntegerMin − 1
  public void AssertSafeInteger_throws_outside_range(double value) =>
    Assert.Throws<ArgumentOutOfRangeException>(() => JsonValues.AssertSafeInteger(value));

  [Theory]
  [InlineData(42d)]
  [InlineData(9007199254740991d)]
  [InlineData(-9007199254740991d)]
  public void AssertSafeInteger_does_not_throw_within_range(double value)
  {
    var exception = Record.Exception(() => JsonValues.AssertSafeInteger(value));
    Assert.Null(exception);
  }

  // --- Integer field validation (AC-02.13 — R-2.5-a, R-2.5-b). ---

  [Theory]
  [InlineData(0d)]
  [InlineData(42d)]
  [InlineData(-7d)]
  public void IsInteger_returns_true_for_whole_numbers(double value) =>
    Assert.True(JsonValues.IsInteger(value));

  [Theory]
  [InlineData(1.5d)]
  [InlineData(0.1d)]
  public void IsInteger_returns_false_for_fractional_numbers(double value) =>
    Assert.False(JsonValues.IsInteger(value));

  [Theory]
  [InlineData(0d)]
  [InlineData(100d)]
  public void AssertInteger_does_not_throw_for_whole_numbers(double value)
  {
    var exception = Record.Exception(() => JsonValues.AssertInteger(value));
    Assert.Null(exception);
  }

  [Theory]
  [InlineData(1.5d)]
  [InlineData(0.001d)]
  public void AssertInteger_throws_for_fractional_values(double value) =>
    Assert.Throws<ArgumentException>(() => JsonValues.AssertInteger(value));

  // --- Numeric equality (AC-02.15 — R-2.5-f, R-2.5-g). ---

  [Theory]
  [InlineData(1e2, 100d)]
  [InlineData(1.0, 1d)]
  public void NumericEqual_is_textual_form_independent(double a, double b) =>
    Assert.True(JsonValues.NumericEqual(a, b));

  [Fact]
  public void NumericEqual_returns_false_for_distinct_values() =>
    Assert.False(JsonValues.NumericEqual(1, 2));
}
