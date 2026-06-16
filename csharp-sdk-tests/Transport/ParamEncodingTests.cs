using Stackific.Mcp.Transport.Http;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Unit tests for <see cref="ParamEncoding"/> — the <c>Mcp-Param-*</c> value encoding (spec §9.5.3),
/// mirroring the TypeScript SDK's <c>http.test.ts</c> AC-14.29/AC-14.30 cases: per-type stringification,
/// the <c>=?base64?…?=</c> sentinel round-trip, the safe-integer range guard, and — critically — the
/// self-collision guard (R-9.5.3-e) by which a literal value that already looks like the sentinel is
/// re-encoded so it round-trips unambiguously.
/// </summary>
public sealed class ParamEncodingTests
{
  // ─── Per-type plain string form (R-9.5.3-a) ────────────────────────────────────

  [Fact]
  public void Encodes_a_safe_string_as_is()
  {
    Assert.Equal("us-west1", ParamEncoding.EncodeHeaderValue("us-west1"));
  }

  [Theory]
  [InlineData(42, "42")]
  [InlineData(-7, "-7")]
  [InlineData(0, "0")]
  public void Encodes_an_integer_as_its_decimal_string(int value, string expected)
  {
    Assert.Equal(expected, ParamEncoding.EncodeHeaderValue((double)value));
  }

  [Theory]
  [InlineData(true, "true")]
  [InlineData(false, "false")]
  public void Encodes_a_boolean_as_lowercase(bool value, string expected)
  {
    Assert.Equal(expected, ParamEncoding.EncodeHeaderValue(value));
  }

  // ─── Sentinel encoding for unsafe values (R-9.5.3-b/c) ─────────────────────────

  [Fact]
  public void Sentinel_encodes_a_non_ascii_value_with_exact_lowercase_prefix_and_suffix()
  {
    var encoded = ParamEncoding.EncodeHeaderValue("Hello, 世界");
    Assert.StartsWith("=?base64?", encoded);
    Assert.EndsWith("?=", encoded);
    Assert.Equal("Hello, 世界", ParamEncoding.DecodeHeaderValue(encoded));
  }

  [Theory]
  [InlineData(" lead")]
  [InlineData("trail ")]
  [InlineData("a\tb\nc")]
  public void Sentinel_encodes_values_with_leading_or_trailing_whitespace_or_control_chars(string value)
  {
    var encoded = ParamEncoding.EncodeHeaderValue(value);
    Assert.True(ParamEncoding.IsSentinelEncoded(encoded));
    Assert.Equal(value, ParamEncoding.DecodeHeaderValue(encoded));
  }

  // ─── Self-collision guard (R-9.5.3-e) ──────────────────────────────────────────

  /// <summary>
  /// A literal value that itself looks like a sentinel MUST be re-encoded so it round-trips
  /// unambiguously: the encoded form differs from the literal, and decoding restores the literal.
  /// </summary>
  [Fact]
  public void Sentinel_encodes_a_plain_value_that_itself_looks_like_a_sentinel()
  {
    const string lookalike = "=?base64?abc?=";
    var encoded = ParamEncoding.EncodeHeaderValue(lookalike);
    Assert.NotEqual(lookalike, encoded);
    Assert.Equal(lookalike, ParamEncoding.DecodeHeaderValue(encoded));
  }

  // ─── Receiver decode (R-9.5.3-d) ───────────────────────────────────────────────

  [Fact]
  public void Decodes_the_spec_example_back_to_the_original_value()
  {
    Assert.Equal("Hello, 世界", ParamEncoding.DecodeHeaderValue("=?base64?SGVsbG8sIOS4lueVjA==?="));
  }

  [Fact]
  public void Decode_is_a_no_op_for_a_plain_value()
  {
    Assert.Equal("us-west1", ParamEncoding.DecodeHeaderValue("us-west1"));
  }

  [Fact]
  public void Round_trips_an_arbitrary_unicode_string()
  {
    foreach (var value in new[] { "🚀 launch", "tab\tinside", "naïve café", "  spaces  ", "ascii-only" })
    {
      var encoded = ParamEncoding.EncodeHeaderValue(value);
      Assert.Equal(value, ParamEncoding.DecodeHeaderValue(encoded));
    }
  }

  // ─── Safe-integer range guard (R-9.5.1-g) ──────────────────────────────────────

  [Fact]
  public void Max_safe_annotated_integer_is_two_to_the_53_minus_one()
  {
    Assert.Equal(9007199254740991L, ParamEncoding.MaxSafeAnnotatedInteger);
    Assert.True(ParamEncoding.IsAnnotatedIntegerInRange(9007199254740991d));
    Assert.False(ParamEncoding.IsAnnotatedIntegerInRange(9007199254740992d));
  }

  [Fact]
  public void Min_safe_annotated_integer_is_negative_two_to_the_53_minus_one()
  {
    Assert.Equal(-9007199254740991L, ParamEncoding.MinSafeAnnotatedInteger);
    Assert.True(ParamEncoding.IsAnnotatedIntegerInRange(-9007199254740991d));
    Assert.False(ParamEncoding.IsAnnotatedIntegerInRange(-9007199254740992d));
  }

  [Fact]
  public void A_fractional_value_is_not_an_annotated_integer()
  {
    Assert.False(ParamEncoding.IsAnnotatedIntegerInRange(1.5));
  }

  [Fact]
  public void Encoding_an_out_of_range_integer_throws()
  {
    Assert.Throws<ArgumentOutOfRangeException>(() => ParamEncoding.EncodeHeaderValue(9007199254740992d));
  }

  // ─── Sentinel detection edge cases ─────────────────────────────────────────────

  [Theory]
  [InlineData("=?base64?abc?=", true)]
  [InlineData("=?base64??=", true)] // empty payload but long enough to carry both delimiters
  [InlineData("=?base64?", false)] // prefix only, too short to also be a suffix
  [InlineData("plain", false)]
  [InlineData("=?BASE64?abc?=", false)] // case-sensitive: the sentinel is exactly lowercase
  public void Recognizes_the_sentinel_shape_exactly(string value, bool expected)
  {
    Assert.Equal(expected, ParamEncoding.IsSentinelEncoded(value));
  }
}
