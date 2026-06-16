using System.Globalization;
using System.Text;

namespace Stackific.Mcp.Transport.Http;

/// <summary>
/// S14 — <c>Mcp-Param-*</c> value encoding (spec §9.5.3).
/// </summary>
/// <remarks>
/// <para>
/// A client MUST encode each parameter value before placing it in a header, to ensure safe
/// transmission and prevent injection. The per-type string form is:
/// </para>
/// <list type="bullet">
///   <item><c>string</c> → as-is.</item>
///   <item><c>integer</c> → its decimal string (<c>42</c>, <c>-7</c>).</item>
///   <item><c>boolean</c> → lowercase <c>true</c> / <c>false</c>.</item>
/// </list>
/// <para>
/// When that string cannot be carried safely as a plain ASCII header value — it has non-ASCII or
/// control characters, leading/trailing whitespace, or it itself looks like the sentinel — the
/// client Base64-encodes the UTF-8 bytes and wraps the result as <c>=?base64?{payload}?=</c>
/// (lowercase, exact). A receiver detects the sentinel and decodes it before use. This mirrors the
/// TypeScript SDK's <c>transport/http/param-encoding.ts</c> exactly, including the self-collision
/// guard (R-9.5.3-e): a literal value that already looks like the sentinel is re-encoded so it
/// round-trips unambiguously.
/// </para>
/// </remarks>
public static class ParamEncoding
{
  /// <summary>The exact (lowercase) sentinel prefix. (R-9.5.3-c)</summary>
  public const string Base64SentinelPrefix = "=?base64?";

  /// <summary>The exact (lowercase) sentinel suffix. (R-9.5.3-c)</summary>
  public const string Base64SentinelSuffix = "?=";

  /// <summary>
  /// The widest integer that may safely carry the <c>x-mcp-header</c> annotation: <c>2^53 − 1</c>.
  /// (R-9.5.1-g) Equal to JavaScript's <c>Number.MAX_SAFE_INTEGER</c>.
  /// </summary>
  public const long MaxSafeAnnotatedInteger = 9007199254740991L;

  /// <summary>
  /// The smallest integer that may safely carry the <c>x-mcp-header</c> annotation: <c>−(2^53 − 1)</c>.
  /// (R-9.5.1-g) Equal to JavaScript's <c>Number.MIN_SAFE_INTEGER</c>.
  /// </summary>
  public const long MinSafeAnnotatedInteger = -9007199254740991L;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is an integer within the safe annotated range.
  /// (R-9.5.1-g)
  /// </summary>
  /// <remarks>
  /// The comparison is performed in floating point so a value just past the boundary (for example
  /// <see cref="MaxSafeAnnotatedInteger"/> + 1) is correctly rejected even though it is still integral —
  /// matching JavaScript's <c>Number.isInteger</c> plus the range test in the TypeScript source.
  /// </remarks>
  /// <param name="value">The number to test.</param>
  /// <returns><c>true</c> when finite, whole, and within range.</returns>
  public static bool IsAnnotatedIntegerInRange(double value) =>
    double.IsFinite(value)
    && Math.Floor(value) == value
    && value >= MinSafeAnnotatedInteger
    && value <= MaxSafeAnnotatedInteger;

  /// <summary>
  /// Returns the per-type plain string form of a string parameter value (string → as-is). (R-9.5.3-a)
  /// </summary>
  /// <param name="value">The string value.</param>
  /// <returns>The value unchanged.</returns>
  public static string PlainStringForm(string value)
  {
    ArgumentNullException.ThrowIfNull(value);
    return value;
  }

  /// <summary>
  /// Returns the per-type plain string form of a boolean parameter value (lowercase
  /// <c>true</c>/<c>false</c>). (R-9.5.3-a)
  /// </summary>
  /// <param name="value">The boolean value.</param>
  /// <returns><c>"true"</c> or <c>"false"</c>.</returns>
  public static string PlainStringForm(bool value) => value ? "true" : "false";

  /// <summary>
  /// Returns the per-type plain string form of an integer parameter value (its decimal string).
  /// (R-9.5.3-a)
  /// </summary>
  /// <param name="value">The integer value, expressed as a double to match the JSON number model.</param>
  /// <returns>The decimal string.</returns>
  /// <exception cref="ArgumentOutOfRangeException">When the value is outside the safe annotated range. (R-9.5.1-g)</exception>
  public static string PlainStringForm(double value)
  {
    if (!IsAnnotatedIntegerInRange(value))
    {
      throw new ArgumentOutOfRangeException(
        nameof(value), value, $"annotated integer {value.ToString(CultureInfo.InvariantCulture)} is outside the safe range");
    }
    // Render as a plain decimal integer (no exponent, no trailing ".0"). The value is known to be a
    // whole number within the safe-integer range, so a long round-trips it exactly.
    return ((long)value).ToString(CultureInfo.InvariantCulture);
  }

  /// <summary>Returns <c>true</c> when <paramref name="headerValue"/> is wrapped in the Base64 sentinel.</summary>
  /// <param name="headerValue">The header value to inspect.</param>
  /// <returns><c>true</c> when it begins with the prefix, ends with the suffix, and is long enough to carry both.</returns>
  public static bool IsSentinelEncoded(string headerValue)
  {
    ArgumentNullException.ThrowIfNull(headerValue);
    return headerValue.StartsWith(Base64SentinelPrefix, StringComparison.Ordinal)
      && headerValue.EndsWith(Base64SentinelSuffix, StringComparison.Ordinal)
      && headerValue.Length >= Base64SentinelPrefix.Length + Base64SentinelSuffix.Length;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="plain"/> cannot be safely carried as a plain ASCII header
  /// value and so MUST be sentinel-encoded. (R-9.5.3-b, R-9.5.3-e)
  /// </summary>
  /// <remarks>
  /// Unsafe when it contains non-ASCII or control characters, has leading or trailing whitespace, or
  /// already matches the sentinel shape (to avoid ambiguity — the self-collision guard, R-9.5.3-e).
  /// Safe ASCII is visible ASCII <c>0x21</c>–<c>0x7E</c>, space <c>0x20</c>, and horizontal tab
  /// <c>0x09</c>, with no leading/trailing whitespace.
  /// </remarks>
  /// <param name="plain">The plain per-type string form.</param>
  /// <returns><c>true</c> when sentinel encoding is required.</returns>
  public static bool NeedsSentinel(string plain)
  {
    ArgumentNullException.ThrowIfNull(plain);

    if (IsSentinelEncoded(plain))
    {
      return true; // a value that itself looks like a sentinel (R-9.5.3-e)
    }

    // Leading/trailing whitespace. The TypeScript test is `/^\s|\s$/`; JavaScript's `\s` covers Unicode
    // whitespace, but any non-ASCII whitespace is already caught by the per-character ASCII test below,
    // and ASCII whitespace at the ends is what matters for a header value, so an edge check on the first
    // and last char suffices and matches observable behaviour.
    if (plain.Length > 0 && (IsAsciiWhitespace(plain[0]) || IsAsciiWhitespace(plain[^1])))
    {
      return true; // leading/trailing whitespace
    }

    // Enumerate Unicode scalar values (code points), matching the TS `for…of` over the string so a
    // surrogate pair is treated as one non-ASCII code point rather than two unpaired units.
    foreach (var rune in plain.EnumerateRunes())
    {
      var c = rune.Value;
      var safe = c == 0x09 || (c >= 0x20 && c <= 0x7e);
      if (!safe)
      {
        return true; // non-ASCII or control character
      }
    }

    return false;
  }

  /// <summary>Wraps the UTF-8 Base64 of <paramref name="text"/> in the sentinel form. (R-9.5.3-b, R-9.5.3-c)</summary>
  /// <param name="text">The text to encode.</param>
  /// <returns>The <c>=?base64?{payload}?=</c> form.</returns>
  public static string SentinelEncode(string text)
  {
    ArgumentNullException.ThrowIfNull(text);
    var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(text));
    return $"{Base64SentinelPrefix}{payload}{Base64SentinelSuffix}";
  }

  /// <summary>
  /// Encodes a string parameter value into its header-value form. (§9.5.3) Returns the plain string when
  /// it is safe ASCII; otherwise the <c>=?base64?{payload}?=</c> sentinel form. (R-9.5.3-a/b/e)
  /// </summary>
  /// <param name="value">The string value.</param>
  /// <returns>The encoded header value.</returns>
  public static string EncodeHeaderValue(string value)
  {
    var plain = PlainStringForm(value);
    return NeedsSentinel(plain) ? SentinelEncode(plain) : plain;
  }

  /// <summary>
  /// Encodes a boolean parameter value into its header-value form (always the plain
  /// <c>true</c>/<c>false</c>, which is safe ASCII). (§9.5.3)
  /// </summary>
  /// <param name="value">The boolean value.</param>
  /// <returns>The encoded header value.</returns>
  public static string EncodeHeaderValue(bool value)
  {
    var plain = PlainStringForm(value);
    return NeedsSentinel(plain) ? SentinelEncode(plain) : plain;
  }

  /// <summary>
  /// Encodes an integer parameter value into its header-value form (always the plain decimal, which is
  /// safe ASCII). (§9.5.3)
  /// </summary>
  /// <param name="value">The integer value, expressed as a double to match the JSON number model.</param>
  /// <returns>The encoded header value.</returns>
  /// <exception cref="ArgumentOutOfRangeException">When the value is an out-of-range annotated integer.</exception>
  public static string EncodeHeaderValue(double value)
  {
    var plain = PlainStringForm(value);
    return NeedsSentinel(plain) ? SentinelEncode(plain) : plain;
  }

  /// <summary>
  /// Decodes a header value back to its string form, decoding the Base64 payload first when the sentinel
  /// is present. (R-9.5.3-d) This is the exact inverse of <see cref="EncodeHeaderValue(string)"/>.
  /// </summary>
  /// <param name="headerValue">The (possibly sentinel-encoded) header value.</param>
  /// <returns>The decoded string.</returns>
  public static string DecodeHeaderValue(string headerValue)
  {
    ArgumentNullException.ThrowIfNull(headerValue);
    if (!IsSentinelEncoded(headerValue))
    {
      return headerValue;
    }
    var payload = headerValue.Substring(
      Base64SentinelPrefix.Length,
      headerValue.Length - Base64SentinelPrefix.Length - Base64SentinelSuffix.Length);
    return Encoding.UTF8.GetString(Convert.FromBase64String(payload));
  }

  /// <summary>Returns <c>true</c> for ASCII space, tab, line feed, carriage return, vertical tab, or form feed.</summary>
  private static bool IsAsciiWhitespace(char ch) =>
    ch is ' ' or '\t' or '\n' or '\r' or '\v' or '\f';
}
