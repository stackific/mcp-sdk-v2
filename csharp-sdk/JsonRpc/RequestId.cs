using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.Json;

namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// A JSON-RPC request identifier (spec §3.2): either a JSON string or a JSON number, and
/// never <c>null</c>. The wire type is preserved exactly — a numeric id round-trips as a
/// number and a string id as a string, and the two are never coerced into one another.
/// Integral numbers are kept as a 64-bit integer so large ids round-trip without the
/// precision loss a <see cref="double"/> would introduce.
/// </summary>
[JsonConverter(typeof(RequestIdJsonConverter))]
public readonly struct RequestId : IEquatable<RequestId>
{
  private readonly string? _string;
  private readonly long _integer;
  private readonly double _real;
  private readonly Kind _kind;

  private enum Kind : byte { Unset = 0, String = 1, Integer = 2, Real = 3 }

  /// <summary>Creates a string-valued identifier.</summary>
  /// <param name="value">The non-null string id.</param>
  public RequestId(string value)
  {
    _string = value ?? throw new ArgumentNullException(nameof(value));
    _integer = 0;
    _real = 0;
    _kind = Kind.String;
  }

  /// <summary>Creates an integer-valued identifier (kept exactly, with no precision loss).</summary>
  /// <param name="value">The integer id.</param>
  public RequestId(long value)
  {
    _string = null;
    _integer = value;
    _real = 0;
    _kind = Kind.Integer;
  }

  /// <summary>Creates a number-valued identifier; integral values in range are stored as integers.</summary>
  /// <param name="value">The numeric id.</param>
  public RequestId(double value)
  {
    _string = null;
    if (value >= long.MinValue && value <= long.MaxValue && Math.Floor(value) == value)
    {
      _integer = (long)value;
      _real = 0;
      _kind = Kind.Integer;
    }
    else
    {
      _integer = 0;
      _real = value;
      _kind = Kind.Real;
    }
  }

  /// <summary><c>true</c> if this identifier carries a JSON string.</summary>
  public bool IsString => _kind == Kind.String;

  /// <summary><c>true</c> if this identifier carries a JSON number.</summary>
  public bool IsNumber => _kind is Kind.Integer or Kind.Real;

  /// <summary>Implicitly wraps an integer as a <see cref="RequestId"/>.</summary>
  /// <param name="value">The integer id.</param>
  public static implicit operator RequestId(long value) => new(value);

  /// <summary>Implicitly wraps a string as a <see cref="RequestId"/>.</summary>
  /// <param name="value">The string id.</param>
  public static implicit operator RequestId(string value) => new(value);

  /// <inheritdoc/>
  public bool Equals(RequestId other)
  {
    if (_kind != other._kind) return false;
    return _kind switch
    {
      Kind.String => string.Equals(_string, other._string, StringComparison.Ordinal),
      Kind.Integer => _integer == other._integer,
      Kind.Real => _real.Equals(other._real),
      _ => true,
    };
  }

  /// <inheritdoc/>
  public override bool Equals(object? obj) => obj is RequestId other && Equals(other);

  /// <inheritdoc/>
  public override int GetHashCode() => _kind switch
  {
    Kind.String => HashCode.Combine(Kind.String, _string),
    Kind.Integer => HashCode.Combine(Kind.Integer, _integer),
    Kind.Real => HashCode.Combine(Kind.Real, _real),
    _ => 0,
  };

  /// <summary>Compares two identifiers for value equality (preserving JSON type).</summary>
  /// <param name="left">The left id.</param>
  /// <param name="right">The right id.</param>
  /// <returns><c>true</c> when equal.</returns>
  public static bool operator ==(RequestId left, RequestId right) => left.Equals(right);

  /// <summary>Compares two identifiers for inequality.</summary>
  /// <param name="left">The left id.</param>
  /// <param name="right">The right id.</param>
  /// <returns><c>true</c> when not equal.</returns>
  public static bool operator !=(RequestId left, RequestId right) => !left.Equals(right);

  /// <summary>Renders the identifier as a stable correlation key, matching how it is written to the wire.</summary>
  /// <returns>The string form of the identifier.</returns>
  public override string ToString() => _kind switch
  {
    Kind.String => _string!,
    Kind.Integer => _integer.ToString(CultureInfo.InvariantCulture),
    Kind.Real => _real.ToString("R", CultureInfo.InvariantCulture),
    _ => string.Empty,
  };

  /// <summary>Materializes this identifier as a JSON node for inclusion in a message object.</summary>
  /// <returns>A <see cref="JsonValue"/> carrying the string or number.</returns>
  internal JsonNode ToJsonNode() => _kind switch
  {
    Kind.String => JsonValue.Create(_string)!,
    Kind.Integer => JsonValue.Create(_integer),
    Kind.Real => JsonValue.Create(_real),
    _ => throw new InvalidOperationException("An uninitialized RequestId cannot be serialized."),
  };

  /// <summary>Reads a <see cref="RequestId"/> from a JSON node, enforcing the string/number and safe-integer rules.</summary>
  /// <param name="node">The id node (a string or safe-integer number; never <c>null</c>).</param>
  /// <returns>The parsed identifier.</returns>
  /// <exception cref="McpError">
  /// Thrown (-32600) when the node is not a string or number, or when a numeric id is not an
  /// IEEE-754 safe integer (a fractional value such as <c>1.5</c> or a value outside
  /// <c>±(2^53 − 1)</c>), per §2.5 / R-3.2.
  /// </exception>
  internal static RequestId FromJsonNode(JsonNode node)
  {
    if (node is JsonValue value)
    {
      switch (value.GetValueKind())
      {
        case JsonValueKind.String:
          return new RequestId(value.GetValue<string>());
        case JsonValueKind.Number:
          // Normalize through the number's JSON text so the result is independent of however the
          // node was backed (parsed JsonElement, a CLR int, a CLR long, …) and integral precision
          // is preserved exactly.
          var text = value.ToJsonString();
          // §2.5: a numeric id MUST be an IEEE-754 safe integer. A value that parses as a long
          // within [−(2^53−1), 2^53−1] is safe; a fractional value, an exponent form yielding a
          // fraction, or a magnitude beyond that range fails the long parse or the bound check and
          // is rejected (it could not round-trip through a double without precision loss).
          if (long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var asLong) &&
              asLong >= JsonValues.SafeIntegerMin && asLong <= JsonValues.SafeIntegerMax)
          {
            return new RequestId(asLong);
          }
          throw NotSafeInteger();
      }
    }
    throw McpError.InvalidRequest("Request \"id\" must be a JSON string or number (never null).");
  }

  /// <summary>Builds the rejection thrown when a numeric id is not an IEEE-754 safe integer (§2.5).</summary>
  /// <returns>An invalid-request error describing the safe-integer requirement.</returns>
  private static McpError NotSafeInteger() => McpError.InvalidRequest(
    "Request \"id\", when numeric, MUST be an IEEE-754 safe integer in the range " +
    $"[{JsonValues.SafeIntegerMin}, {JsonValues.SafeIntegerMax}] (no fractional or out-of-range values; §2.5).");

  internal void Write(Utf8JsonWriter writer)
  {
    switch (_kind)
    {
      case Kind.String:
        writer.WriteStringValue(_string);
        break;
      case Kind.Integer:
        writer.WriteNumberValue(_integer);
        break;
      case Kind.Real:
        writer.WriteNumberValue(_real);
        break;
      default:
        throw new InvalidOperationException("An uninitialized RequestId cannot be serialized.");
    }
  }
}

/// <summary>System.Text.Json converter that reads/writes a <see cref="RequestId"/> as a bare string or number.</summary>
/// <remarks>
/// On read, a numeric id is accepted only when it is an IEEE-754 safe integer (§2.5): a
/// fractional value such as <c>1.5</c> or a value outside <c>±(2^53 − 1)</c> is rejected with
/// a <see cref="JsonException"/>, matching the TypeScript <c>RequestIdSchema</c> refinement.
/// </remarks>
internal sealed class RequestIdJsonConverter : JsonConverter<RequestId>
{
  public override RequestId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
  {
    switch (reader.TokenType)
    {
      case JsonTokenType.String:
        return new RequestId(reader.GetString()!);
      case JsonTokenType.Number:
        // Only an integral value within the safe-integer range is a valid numeric id.
        // TryGetInt64 fails for fractional numbers and for values outside long range; an
        // in-range long must still be re-checked against the tighter safe-integer bound.
        if (reader.TryGetInt64(out var asLong) &&
            asLong >= JsonValues.SafeIntegerMin && asLong <= JsonValues.SafeIntegerMax)
        {
          return new RequestId(asLong);
        }
        throw new JsonException(
          "Request \"id\", when numeric, MUST be an IEEE-754 safe integer in the range " +
          $"[{JsonValues.SafeIntegerMin}, {JsonValues.SafeIntegerMax}] (no fractional or out-of-range values; §2.5).");
      default:
        throw new JsonException("Request \"id\" must be a JSON string or number (never null).");
    }
  }

  public override void Write(Utf8JsonWriter writer, RequestId value, JsonSerializerOptions options) => value.Write(writer);
}
