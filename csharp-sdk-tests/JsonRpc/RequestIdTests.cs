using System.Text.Json;

using Stackific.Mcp;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Tests.JsonRpc;

/// <summary>
/// Fine-grained behavior of <see cref="RequestId"/> (spec §3.2): string-vs-number identity,
/// implicit conversions, equality and hashing, kind predicates, <c>ToString</c> rendering,
/// JSON round-tripping through <see cref="McpJson"/>, and converter rejection of non-id JSON.
/// </summary>
public sealed class RequestIdTests
{
  [Fact]
  public void String_constructor_produces_a_string_id()
  {
    var id = new RequestId("abc");
    Assert.True(id.IsString);
    Assert.False(id.IsNumber);
    Assert.Equal("abc", id.ToString());
  }

  [Theory]
  [InlineData(0L)]
  [InlineData(1L)]
  [InlineData(-1L)]
  [InlineData(42L)]
  [InlineData(long.MaxValue)]
  [InlineData(long.MinValue)]
  public void Long_constructor_produces_a_number_id(long value)
  {
    var id = new RequestId(value);
    Assert.True(id.IsNumber);
    Assert.False(id.IsString);
  }

  [Fact]
  public void Null_string_constructor_throws()
  {
    Assert.Throws<ArgumentNullException>(() => new RequestId((string)null!));
  }

  [Fact]
  public void Implicit_conversion_from_long_yields_number_id()
  {
    RequestId id = 7L;
    Assert.True(id.IsNumber);
    Assert.Equal(new RequestId(7L), id);
  }

  [Fact]
  public void Implicit_conversion_from_string_yields_string_id()
  {
    RequestId id = "call-1";
    Assert.True(id.IsString);
    Assert.Equal(new RequestId("call-1"), id);
  }

  // --- Equality: same kind + same value are equal. ---

  [Theory]
  [InlineData(0L)]
  [InlineData(1L)]
  [InlineData(-1L)]
  [InlineData(42L)]
  [InlineData(long.MaxValue)]
  public void Numbers_with_equal_value_are_equal(long value)
  {
    Assert.Equal(new RequestId(value), new RequestId(value));
    Assert.True(new RequestId(value) == new RequestId(value));
    Assert.False(new RequestId(value) != new RequestId(value));
  }

  [Theory]
  [InlineData("a")]
  [InlineData("uuid-1234")]
  [InlineData("")]
  [InlineData("1")]
  public void Strings_with_equal_value_are_equal(string value)
  {
    Assert.Equal(new RequestId(value), new RequestId(value));
    Assert.True(new RequestId(value) == new RequestId(value));
  }

  // --- Inequality: differing values within a kind, and across kinds. ---

  [Theory]
  [InlineData(1L, 2L)]
  [InlineData(0L, -1L)]
  [InlineData(42L, 43L)]
  public void Numbers_with_different_value_are_not_equal(long left, long right)
  {
    Assert.NotEqual(new RequestId(left), new RequestId(right));
    Assert.True(new RequestId(left) != new RequestId(right));
  }

  [Theory]
  [InlineData("a", "b")]
  [InlineData("A", "a")] // ordinal comparison is case-sensitive
  [InlineData("1", "1 ")]
  public void Strings_with_different_value_are_not_equal(string left, string right)
  {
    Assert.NotEqual(new RequestId(left), new RequestId(right));
  }

  [Theory]
  [InlineData(1L, "1")]
  [InlineData(0L, "0")]
  [InlineData(42L, "42")]
  [InlineData(-1L, "-1")]
  public void A_number_id_and_a_string_id_never_compare_equal(long number, string text)
  {
    Assert.NotEqual(new RequestId(number), new RequestId(text));
    Assert.True(new RequestId(number) != new RequestId(text));
    Assert.False(new RequestId(number) == new RequestId(text));
  }

  [Fact]
  public void Equals_object_overload_handles_other_types()
  {
    object boxed = new RequestId(5L);
    Assert.True(boxed.Equals(new RequestId(5L)));
    Assert.False(boxed.Equals("not an id"));
    Assert.False(boxed.Equals(null));
  }

  // --- GetHashCode is consistent with equality. ---

  [Theory]
  [InlineData(1L)]
  [InlineData(-1L)]
  [InlineData(42L)]
  [InlineData(long.MaxValue)]
  public void Equal_number_ids_share_a_hash_code(long value)
  {
    Assert.Equal(new RequestId(value).GetHashCode(), new RequestId(value).GetHashCode());
  }

  [Theory]
  [InlineData("a")]
  [InlineData("uuid-abc")]
  public void Equal_string_ids_share_a_hash_code(string value)
  {
    Assert.Equal(new RequestId(value).GetHashCode(), new RequestId(value).GetHashCode());
  }

  [Fact]
  public void Number_and_string_ids_of_same_text_have_distinct_hash_codes()
  {
    // Not strictly required, but the kind is folded into the hash so collisions are avoided.
    Assert.NotEqual(new RequestId(1L).GetHashCode(), new RequestId("1").GetHashCode());
  }

  // --- ToString rendering. ---

  [Theory]
  [InlineData(0L, "0")]
  [InlineData(1L, "1")]
  [InlineData(-1L, "-1")]
  [InlineData(42L, "42")]
  [InlineData(9007199254740991L, "9007199254740991")]
  public void ToString_renders_integral_numbers_without_a_decimal_point(long value, string expected)
  {
    Assert.Equal(expected, new RequestId(value).ToString());
  }

  [Theory]
  [InlineData("a")]
  [InlineData("uuid-1234-5678")]
  [InlineData("123")]
  public void ToString_renders_a_string_id_verbatim(string value)
  {
    Assert.Equal(value, new RequestId(value).ToString());
  }

  [Fact]
  public void ToString_renders_a_non_integral_number_with_a_decimal_point()
  {
    Assert.Equal("1.5", new RequestId(1.5).ToString());
  }

  [Fact]
  public void Default_request_id_renders_as_empty_string()
  {
    Assert.Equal(string.Empty, default(RequestId).ToString());
  }

  // --- JSON round-trip through McpJson (the converter is registered on McpJson.Options). ---

  [Theory]
  [InlineData(0L)]
  [InlineData(1L)]
  [InlineData(-1L)]
  [InlineData(42L)]
  [InlineData(9007199254740991L)] // SafeIntegerMax
  [InlineData(-9007199254740991L)] // SafeIntegerMin
  public void Number_ids_round_trip_through_json(long value)
  {
    var id = new RequestId(value);
    var json = McpJson.Serialize(id);
    var back = McpJson.Deserialize<RequestId>(json);

    Assert.Equal(id, back);
    Assert.True(back.IsNumber);
  }

  // --- §2.5: a numeric id MUST be an IEEE-754 safe integer; the converter rejects others. ---

  [Theory]
  [InlineData("1.5")] // fractional
  [InlineData("0.1")] // fractional
  [InlineData("9007199254740992")] // 2^53, just past SafeIntegerMax
  [InlineData("-9007199254740992")] // just past SafeIntegerMin
  [InlineData("9223372036854775807")] // long.MaxValue, far out of safe range
  [InlineData("1e21")] // out of long range entirely
  public void Converter_rejects_a_numeric_id_that_is_not_a_safe_integer(string json)
  {
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<RequestId>(json));
  }

  [Theory]
  [InlineData("9007199254740991")] // SafeIntegerMax
  [InlineData("-9007199254740991")] // SafeIntegerMin
  public void Converter_accepts_a_numeric_id_at_the_safe_integer_boundary(string json)
  {
    var id = McpJson.Deserialize<RequestId>(json);
    Assert.True(id.IsNumber);
  }

  [Theory]
  [InlineData("a")]
  [InlineData("uuid-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")]
  [InlineData("0")]
  [InlineData("1")]
  [InlineData("42")]
  [InlineData("-7")]
  public void String_ids_round_trip_through_json(string value)
  {
    var id = new RequestId(value);
    var json = McpJson.Serialize(id);
    var back = McpJson.Deserialize<RequestId>(json);

    Assert.Equal(id, back);
    Assert.True(back.IsString);
  }

  [Theory]
  [InlineData("0", true)]
  [InlineData("1", true)]
  [InlineData("-1", true)]
  [InlineData("42", true)]
  [InlineData("\"1\"", false)]
  [InlineData("\"uuid-x\"", false)]
  public void Json_token_type_determines_the_id_kind(string json, bool expectNumber)
  {
    var id = McpJson.Deserialize<RequestId>(json);
    Assert.Equal(expectNumber, id.IsNumber);
    Assert.Equal(!expectNumber, id.IsString);
  }

  [Fact]
  public void A_numeric_id_serializes_as_a_bare_number()
  {
    Assert.Equal("99", McpJson.Serialize(new RequestId(99L)));
  }

  [Fact]
  public void A_string_id_serializes_as_a_quoted_string()
  {
    Assert.Equal("\"call-1\"", McpJson.Serialize(new RequestId("call-1")));
  }

  // --- The converter rejects anything that is not a JSON string or number. ---

  [Theory]
  [InlineData("null")]
  [InlineData("true")]
  [InlineData("false")]
  [InlineData("[]")]
  [InlineData("[1,2]")]
  [InlineData("{}")]
  [InlineData("""{"id":1}""")]
  public void Converter_rejects_non_string_non_number_json(string json)
  {
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<RequestId>(json));
  }
}
