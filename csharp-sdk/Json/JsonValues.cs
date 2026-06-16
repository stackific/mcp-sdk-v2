using System.Text.Json;
using System.Text.Json.Nodes;

namespace Stackific.Mcp.Json;

/// <summary>
/// The JSON value model and numeric-handling helpers for MCP (spec §2.3, §2.5).
/// </summary>
/// <remarks>
/// <para>
/// Every value that crosses the wire is exactly one of the six JSON forms — string,
/// number, boolean, null, object, or array (§2.3). This SDK represents those forms with
/// <see cref="System.Text.Json.Nodes.JsonNode"/> and its derivatives rather than a bespoke
/// union type, so the helpers here operate on <see cref="JsonNode"/> where a runtime guard
/// is needed.
/// </para>
/// <para>
/// Numeric handling (§2.5): identifiers and counters (request ids, error codes, progress
/// counters, pagination counters) MUST stay within the IEEE 754 safe-integer range
/// <c>−9007199254740991</c> to <c>9007199254740991</c>, so a number round-trips through a
/// double-precision float without losing precision. These bounds and the predicates that
/// enforce them mirror <c>json/value.ts</c>.
/// </para>
/// </remarks>
public static class JsonValues
{
  /// <summary>
  /// Inclusive lower bound for safe identifiers and counters: <c>−(2^53 − 1)</c> (§2.5, R-2.5-c).
  /// Equal to JavaScript's <c>Number.MIN_SAFE_INTEGER</c>.
  /// </summary>
  public const long SafeIntegerMin = -9007199254740991L;

  /// <summary>
  /// Inclusive upper bound for safe identifiers and counters: <c>2^53 − 1</c> (§2.5, R-2.5-c).
  /// Equal to JavaScript's <c>Number.MAX_SAFE_INTEGER</c>.
  /// </summary>
  public const long SafeIntegerMax = 9007199254740991L;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="n"/> is a safe integer: it has no fractional
  /// part and lies within the safe-integer range. (R-2.5-c, R-2.5-e, AC-02.14)
  /// </summary>
  /// <param name="n">The number to test.</param>
  /// <returns><c>true</c> when <paramref name="n"/> is a finite, fraction-free value in range.</returns>
  /// <remarks>
  /// Mirrors JavaScript's <c>Number.isSafeInteger</c>: the comparison against the bounds is
  /// done in floating point so that values just past the boundary (for example
  /// <see cref="SafeIntegerMax"/> + 1) are correctly rejected even though they are still
  /// integral.
  /// </remarks>
  public static bool IsSafeInteger(double n) =>
    IsInteger(n) && n >= SafeIntegerMin && n <= SafeIntegerMax;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="n"/> has no fractional part (it may still be
  /// outside the safe-integer range). Used to validate integer-typed fields. (R-2.5-a,
  /// R-2.5-b, AC-02.13)
  /// </summary>
  /// <param name="n">The number to test.</param>
  /// <returns><c>true</c> when <paramref name="n"/> is finite and whole.</returns>
  public static bool IsInteger(double n) =>
    double.IsFinite(n) && Math.Floor(n) == n;

  /// <summary>
  /// Asserts that <paramref name="n"/> has no fractional part. Throws when a fractional value
  /// is supplied where an integer field is required. (R-2.5-b, AC-02.13)
  /// </summary>
  /// <param name="n">The number that must be integral.</param>
  /// <exception cref="ArgumentException">Thrown when <paramref name="n"/> is fractional or non-finite.</exception>
  /// <remarks>
  /// The TypeScript SDK throws a <c>TypeError</c> here; the idiomatic .NET equivalent for an
  /// argument that violates a type/shape contract is <see cref="ArgumentException"/>.
  /// </remarks>
  public static void AssertInteger(double n)
  {
    if (!IsInteger(n))
    {
      throw new ArgumentException(
        $"Expected an integer, but got {n.ToString(System.Globalization.CultureInfo.InvariantCulture)}.",
        nameof(n));
    }
  }

  /// <summary>
  /// Asserts that <paramref name="n"/> is within the safe-integer range. Senders MUST NOT
  /// emit identifier or counter values outside this range. (R-2.5-d)
  /// </summary>
  /// <param name="n">The number that must be a safe integer.</param>
  /// <exception cref="ArgumentOutOfRangeException">Thrown when <paramref name="n"/> is fractional or out of range.</exception>
  /// <remarks>
  /// The TypeScript SDK throws a <c>RangeError</c>; the idiomatic .NET equivalent for a value
  /// outside its permitted range is <see cref="ArgumentOutOfRangeException"/>.
  /// </remarks>
  public static void AssertSafeInteger(double n)
  {
    if (!IsSafeInteger(n))
    {
      throw new ArgumentOutOfRangeException(
        nameof(n),
        n,
        $"Value is outside the safe-integer range [{SafeIntegerMin}, {SafeIntegerMax}].");
    }
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="a"/> and <paramref name="b"/> are numerically
  /// equal regardless of their textual JSON representation (for example <c>1e2</c> equals
  /// <c>100</c>, and <c>1.0</c> equals <c>1</c>). Two numerically equal JSON numbers MUST be
  /// treated as equal. (R-2.5-g, AC-02.15)
  /// </summary>
  /// <param name="a">The left number.</param>
  /// <param name="b">The right number.</param>
  /// <returns><c>true</c> when the two values are numerically equal.</returns>
  public static bool NumericEqual(double a, double b) => a == b;

  /// <summary>
  /// Builds a <see cref="JsonObject"/> from a sequence of name/value pairs, applying the
  /// last-duplicate-wins rule (§2.3.1, R-2.3.1-c, AC-02.3).
  /// </summary>
  /// <param name="entries">The ordered name/value pairs; later names overwrite earlier ones.</param>
  /// <returns>An object in which each name maps to the value of its last occurrence.</returns>
  /// <remarks>
  /// When a receiver does not reject an object with duplicate member names as malformed, it
  /// MUST behave as though only the last occurrence is present. This helper makes that
  /// behaviour explicit and testable. Each value is deep-cloned before insertion so that a
  /// node already parented elsewhere can be supplied safely.
  /// </remarks>
  public static JsonObject LastDuplicateWins(
    IEnumerable<KeyValuePair<string, JsonNode?>> entries)
  {
    ArgumentNullException.ThrowIfNull(entries);
    var result = new JsonObject();
    foreach (var (key, value) in entries)
    {
      // Re-parenting the same node twice throws in System.Text.Json, and the same node may
      // legitimately appear under two duplicate keys; clone defensively so last-wins holds.
      result[key] = value?.DeepClone();
    }
    return result;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a valid JSON value — one of the six
  /// wire forms (string, number, boolean, null, object, array) — recursively. Useful as a
  /// runtime guard at a system boundary. (R-2.3-a, AC-02.1)
  /// </summary>
  /// <param name="value">The candidate node; <c>null</c> represents JSON <c>null</c>.</param>
  /// <returns><c>true</c> when the node and all nested nodes are valid JSON values.</returns>
  /// <remarks>
  /// In the <see cref="JsonNode"/> model a JSON <c>null</c> is represented by the CLR
  /// <c>null</c> reference, which is always a valid JSON value. A non-null node is valid when
  /// it is a <see cref="JsonValue"/> (scalar), a <see cref="JsonObject"/> whose members are
  /// all valid, or a <see cref="JsonArray"/> whose elements are all valid. A
  /// <see cref="JsonValue"/> backed by a non-JSON CLR type (something that has no JSON value
  /// kind) is rejected — the analogue of TypeScript rejecting <c>undefined</c>, a function,
  /// or a <c>Symbol</c>.
  /// </remarks>
  public static bool IsJsonValue(JsonNode? value)
  {
    switch (value)
    {
      case null:
        // JSON null.
        return true;
      case JsonObject obj:
        foreach (var member in obj)
        {
          if (!IsJsonValue(member.Value)) return false;
        }
        return true;
      case JsonArray array:
        foreach (var element in array)
        {
          if (!IsJsonValue(element)) return false;
        }
        return true;
      case JsonValue scalar:
        // A scalar is a valid JSON value only when it maps to one of the JSON value kinds
        // (string, number, true, false, null). Anything else is not a JSON value.
        return scalar.GetValueKind() is
          JsonValueKind.String or
          JsonValueKind.Number or
          JsonValueKind.True or
          JsonValueKind.False or
          JsonValueKind.Null;
      default:
        return false;
    }
  }
}
