using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// A progress-correlation token (spec §15.1.1): a value that is either a JSON string or a JSON
/// number, never <c>null</c>. The token is carried in an originating request's
/// <c>_meta.progressToken</c> (§15.1.2) and is echoed on every <see cref="ProgressNotificationParams"/>
/// so that out-of-band progress can be matched to the request that opted in.
/// </summary>
/// <remarks>
/// The wire type is preserved exactly — a numeric token round-trips as a number and a string
/// token as a string, and the two are never coerced into one another. Receivers MUST treat the
/// token as opaque (§15.1.1).
/// </remarks>
[JsonConverter(typeof(ProgressTokenJsonConverter))]
public readonly record struct ProgressToken
{
  private readonly string? _string;
  private readonly long _integer;
  private readonly double _real;
  private readonly Kind _kind;

  private enum Kind : byte { Unset = 0, String = 1, Integer = 2, Real = 3 }

  /// <summary>Creates a string-valued progress token.</summary>
  /// <param name="value">The non-null string token.</param>
  public ProgressToken(string value)
  {
    _string = value ?? throw new ArgumentNullException(nameof(value));
    _integer = 0;
    _real = 0;
    _kind = Kind.String;
  }

  /// <summary>Creates an integer-valued progress token (kept exactly, with no precision loss).</summary>
  /// <param name="value">The integer token.</param>
  public ProgressToken(long value)
  {
    _string = null;
    _integer = value;
    _real = 0;
    _kind = Kind.Integer;
  }

  /// <summary>Creates a number-valued progress token; integral values in range are stored as integers.</summary>
  /// <param name="value">The numeric token.</param>
  public ProgressToken(double value)
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

  /// <summary><c>true</c> if this token carries a JSON string.</summary>
  public bool IsString => _kind == Kind.String;

  /// <summary><c>true</c> if this token carries a JSON number.</summary>
  public bool IsNumber => _kind is Kind.Integer or Kind.Real;

  /// <summary>Implicitly wraps an integer as a <see cref="ProgressToken"/>.</summary>
  /// <param name="value">The integer token.</param>
  public static implicit operator ProgressToken(long value) => new(value);

  /// <summary>Implicitly wraps a string as a <see cref="ProgressToken"/>.</summary>
  /// <param name="value">The string token.</param>
  public static implicit operator ProgressToken(string value) => new(value);

  /// <summary>Renders the token as a stable correlation key, matching how it is written to the wire.</summary>
  /// <returns>The string form of the token.</returns>
  public override string ToString() => _kind switch
  {
    Kind.String => _string!,
    Kind.Integer => _integer.ToString(CultureInfo.InvariantCulture),
    // The default ("G") format is the shortest round-trippable form since .NET Core 3.0; the legacy
    // "R" specifier is documented as discouraged for double.
    Kind.Real => _real.ToString(CultureInfo.InvariantCulture),
    _ => string.Empty,
  };

  /// <summary>Materializes this token as a JSON node for inclusion in a message object.</summary>
  /// <returns>A <see cref="JsonValue"/> carrying the string or number.</returns>
  /// <exception cref="InvalidOperationException">Thrown when the token is uninitialized.</exception>
  public JsonNode ToJsonNode() => _kind switch
  {
    Kind.String => JsonValue.Create(_string)!,
    Kind.Integer => JsonValue.Create(_integer),
    Kind.Real => JsonValue.Create(_real),
    _ => throw new InvalidOperationException("An uninitialized ProgressToken cannot be serialized."),
  };

  /// <summary>Reads a <see cref="ProgressToken"/> from a JSON node, enforcing the string/number rule.</summary>
  /// <param name="node">The token node (a string or number; never <c>null</c>).</param>
  /// <returns>The parsed token.</returns>
  /// <exception cref="McpError">Thrown (-32602) when the node is not a string or number.</exception>
  public static ProgressToken FromJsonNode(JsonNode node)
  {
    if (node is JsonValue value)
    {
      switch (value.GetValueKind())
      {
        case JsonValueKind.String:
          return new ProgressToken(value.GetValue<string>());
        case JsonValueKind.Number:
          // Normalize through the number's JSON text so the result is independent of the node's
          // backing type and integral precision is preserved exactly.
          var text = value.ToJsonString();
          if (long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var asLong))
          {
            return new ProgressToken(asLong);
          }
          if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var asDouble))
          {
            return new ProgressToken(asDouble);
          }
          break;
      }
    }
    throw McpError.InvalidParams("A \"progressToken\" must be a JSON string or number (never null) (§15.1.1).");
  }

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
        throw new InvalidOperationException("An uninitialized ProgressToken cannot be serialized.");
    }
  }
}

/// <summary>System.Text.Json converter that reads/writes a <see cref="ProgressToken"/> as a bare string or number.</summary>
internal sealed class ProgressTokenJsonConverter : JsonConverter<ProgressToken>
{
  /// <inheritdoc/>
  public override ProgressToken Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
    reader.TokenType switch
    {
      JsonTokenType.String => new ProgressToken(reader.GetString()!),
      JsonTokenType.Number => reader.TryGetInt64(out var asLong) ? new ProgressToken(asLong) : new ProgressToken(reader.GetDouble()),
      _ => throw new JsonException("A \"progressToken\" must be a JSON string or number (never null)."),
    };

  /// <inheritdoc/>
  public override void Write(Utf8JsonWriter writer, ProgressToken value, JsonSerializerOptions options) => value.Write(writer);
}

/// <summary>
/// Parameters of the <c>notifications/progress</c> notification (spec §15.1.3), sent by the party
/// that is processing a request to report incremental progress on it. The notification is
/// request-scoped: it MUST reference a token the peer supplied in an active request's
/// <c>_meta.progressToken</c>, and MUST be sent before that request's final response (§15.1.4).
/// </summary>
public sealed record ProgressNotificationParams
{
  /// <summary>The method name of the notification these parameters belong to.</summary>
  public const string Method = "notifications/progress";

  /// <summary>REQUIRED. The token from the originating request's <c>_meta</c> that this update correlates to (§15.1.3).</summary>
  public required ProgressToken ProgressToken { get; init; }

  /// <summary>
  /// REQUIRED. The amount of progress so far. It MUST strictly increase across successive
  /// notifications for the same token, even when <see cref="Total"/> is unknown, and MAY be
  /// integral or fractional (§15.1.3).
  /// </summary>
  public required double Progress { get; init; }

  /// <summary>OPTIONAL. The total amount of progress expected, when known; MAY be integral or fractional (§15.1.3).</summary>
  public double? Total { get; init; }

  /// <summary>OPTIONAL. A human-readable description of the current progress, suitable for display (§15.1.3).</summary>
  public string? Message { get; init; }

  /// <summary>OPTIONAL. Notification metadata (§4 / §14).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// Parameters of the <c>notifications/cancelled</c> notification (spec §15.2.1), sent by a party to
/// cancel an in-flight request that it issued earlier in the same direction. Cancellation is
/// best-effort and races are tolerated: a receiver MAY ignore it when the request is unknown,
/// already complete, or uncancellable, and the canceller SHOULD ignore any late response (§15.2.2/§15.2.3).
/// </summary>
public sealed record CancelledNotificationParams
{
  /// <summary>The method name of the notification these parameters belong to.</summary>
  public const string Method = "notifications/cancelled";

  /// <summary>
  /// The JSON-RPC <c>id</c> of the request to cancel. It MUST correspond to a request the sender
  /// issued earlier in the same direction and believes is still in-flight (§15.2.1).
  /// </summary>
  /// <remarks>
  /// Modeled as a nullable <see cref="RequestId"/> so a malformed cancellation that omits the id
  /// still round-trips: a receiver MUST tolerate such a notification gracefully (R-15.2.2-f) rather
  /// than reject it. When <c>null</c> the notification names no target and is simply ignored. The
  /// <c>WhenWritingNull</c> serializer policy omits the member on the wire when it is absent.
  /// </remarks>
  public RequestId? RequestId { get; init; }

  /// <summary>OPTIONAL. A human-readable explanation that MAY be logged or shown to a user (§15.2.1).</summary>
  public string? Reason { get; init; }

  /// <summary>OPTIONAL. Notification metadata (§4 / §14).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// A structured log severity (spec §15.3.1), mapping to the standard syslog message severities.
/// The members are declared from least to most severe; that ordering is significant because a
/// request opts in at a minimum level and the emitter MUST emit only messages at or above it.
/// </summary>
/// <remarks>
/// Deprecated [SEP-2577]: the logging-message mechanism of §15.3 is Deprecated and retained only
/// for interoperability with peers that emit it.
/// </remarks>
[JsonConverter(typeof(JsonStringEnumConverter<LoggingLevel>))]
public enum LoggingLevel
{
  /// <summary>Detailed debugging information (lowest severity).</summary>
  [JsonStringEnumMemberName("debug")]
  Debug,

  /// <summary>General informational messages.</summary>
  [JsonStringEnumMemberName("info")]
  Info,

  /// <summary>Normal but significant events.</summary>
  [JsonStringEnumMemberName("notice")]
  Notice,

  /// <summary>Warning conditions.</summary>
  [JsonStringEnumMemberName("warning")]
  Warning,

  /// <summary>Error conditions.</summary>
  [JsonStringEnumMemberName("error")]
  Error,

  /// <summary>Critical conditions.</summary>
  [JsonStringEnumMemberName("critical")]
  Critical,

  /// <summary>Action must be taken immediately.</summary>
  [JsonStringEnumMemberName("alert")]
  Alert,

  /// <summary>System is unusable (highest severity).</summary>
  [JsonStringEnumMemberName("emergency")]
  Emergency,
}

/// <summary>
/// Parameters of the <c>notifications/message</c> notification (spec §15.3.2), by which a server
/// emits a structured log message. The notification is request-scoped and emitted only when the
/// request opted in via <c>_meta.io.modelcontextprotocol/logLevel</c>, at or above that level (§15.3.3).
/// </summary>
/// <remarks>
/// Deprecated [SEP-2577]. Log <see cref="Data"/> MUST NOT contain credentials, secrets, personally
/// identifying information, or internal details that could aid an attacker (§15.3.2).
/// </remarks>
[Obsolete("Logging (notifications/message) is Deprecated [SEP-2577] (spec §15.3). Still accepted and round-tripped for backward compatibility.")]
public sealed record LoggingMessageNotificationParams
{
  /// <summary>The method name of the notification these parameters belong to.</summary>
  public const string Method = "notifications/message";

  /// <summary>REQUIRED. The severity of the message, one of the §15.3.1 levels.</summary>
  public required LoggingLevel Level { get; init; }

  /// <summary>OPTIONAL. A name identifying the logger that issued the message (§15.3.2).</summary>
  public string? Logger { get; init; }

  /// <summary>REQUIRED. The payload to be logged; any JSON-serializable value is allowed (§15.3.2).</summary>
  public required JsonNode Data { get; init; }

  /// <summary>OPTIONAL. Notification metadata (§4 / §14).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

// §15.4 Trace Context is propagated through three reserved bare `_meta` keys —
// `traceparent`, `tracestate`, and `baggage` — already defined as
// Stackific.Mcp.Json.MetaKeys.TraceParent / TraceState / Baggage. They are carried verbatim on
// any request's or notification's `_meta` (see RequestMeta.Additional) and are NOT redefined here.

// ─── Pagination (§12) ──────────────────────────────────────────────────────────────────────────────

/// <summary>
/// The §12 cursor-based pagination behavioral layer — the C# counterpart of the TypeScript
/// <c>protocol/pagination.ts</c> module. A <c>cursor</c> is an OPAQUE string: the empty string
/// <c>""</c> is a PRESENT cursor (not absence), and only the absence of a cursor (<c>null</c>) means
/// "first page" / "last page". This class adds the cursor predicates, the per-cursor cache-key
/// helper (R-12.5-a), the invalid-cursor error builder (<c>-32602</c>), and the reference
/// <see cref="OffsetPaginator{T}"/> that NEVER throws on a bad cursor.
/// </summary>
public static class PaginationUtilities
{
  /// <summary>The four paginated list methods whose results carry a <c>nextCursor</c> (§12). Mirrors TS <c>PAGINATED_METHODS</c>.</summary>
  public static IReadOnlySet<string> PaginatedMethods { get; } = new HashSet<string>(StringComparer.Ordinal)
  {
    McpMethods.ToolsList,
    McpMethods.ResourcesList,
    McpMethods.ResourceTemplatesList,
    McpMethods.PromptsList,
  };

  /// <summary>Returns <c>true</c> when <paramref name="method"/> is one of the four paginated list methods. Mirrors TS <c>isPaginatedMethod</c>.</summary>
  /// <param name="method">The method name.</param>
  /// <returns><c>true</c> when paginated.</returns>
  public static bool IsPaginatedMethod(string method) => PaginatedMethods.Contains(method);

  /// <summary>
  /// Returns <c>true</c> when a <c>nextCursor</c> is PRESENT in a result, indicating more results MAY
  /// follow. The empty string <c>""</c> is a present cursor — only <c>null</c> (absent) is treated as
  /// "no more". Mirrors TS <c>hasNextCursor</c>. (R-12.2-c, R-12.3-b/d)
  /// </summary>
  /// <param name="nextCursor">The result's <c>nextCursor</c>, or <c>null</c> when absent.</param>
  /// <returns><c>true</c> when a (possibly empty) cursor is present.</returns>
  public static bool HasNextCursor(string? nextCursor) => nextCursor is not null;

  /// <summary>Returns <c>true</c> when this is the final page — <c>nextCursor</c> is absent (<c>null</c>). Mirrors TS <c>isLastPage</c>. (R-12.2-d, R-12.3-c)</summary>
  /// <param name="nextCursor">The result's <c>nextCursor</c>, or <c>null</c>.</param>
  /// <returns><c>true</c> when the cursor is absent.</returns>
  public static bool IsLastPage(string? nextCursor) => !HasNextCursor(nextCursor);

  /// <summary>
  /// Returns <c>true</c> when a <c>cursor</c> is a present value (including the empty string). A client
  /// MUST echo any present <c>nextCursor</c> — even <c>""</c> — on the next request; only <c>null</c>
  /// signals "no cursor". Mirrors TS <c>isCursorPresent</c>. (R-12.1-a)
  /// </summary>
  /// <param name="cursor">The cursor, or <c>null</c> when absent.</param>
  /// <returns><c>true</c> when a (possibly empty) cursor is present.</returns>
  public static bool IsCursorPresent(string? cursor) => cursor is not null;

  /// <summary>The <c>-32602</c> code for an invalid / unrecognized cursor (§18/§22.4). Same value as <see cref="ErrorCodes.InvalidParams"/>. Mirrors TS <c>INVALID_CURSOR_CODE</c>.</summary>
  public const int InvalidCursorCode = ErrorCodes.InvalidParams;

  /// <summary>The default invalid-cursor message, matching the TS <c>buildInvalidCursorError</c> default.</summary>
  public const string DefaultInvalidCursorMessage = "Invalid params: unrecognized cursor";

  /// <summary>
  /// Builds the <c>-32602</c> error a server returns when a client supplies an unrecognized or
  /// malformed cursor (R-12.4-c/d). Mirrors TS <c>buildInvalidCursorError</c>.
  /// </summary>
  /// <param name="message">An optional override; defaults to <see cref="DefaultInvalidCursorMessage"/>.</param>
  /// <returns>The constructed invalid-params error.</returns>
  public static McpError BuildInvalidCursorError(string? message = null) =>
    McpError.InvalidParams(message ?? DefaultInvalidCursorMessage);

  /// <summary>
  /// Produces a per-page cache key for a paginated request, enforcing per-cursor cache isolation: a
  /// cached page for one cursor value MUST NOT be served for a request bearing a different cursor
  /// (including the first-page request, which omits <c>cursor</c>). The empty string <c>""</c> is a
  /// present cursor distinct from absence. Mirrors TS <c>paginationCacheKey</c>. (R-12.5-a, R-13.5-i)
  /// </summary>
  /// <param name="method">The list method name.</param>
  /// <param name="cursor">The request's <c>cursor</c>, or <c>null</c> for the first page.</param>
  /// <returns>A cache key isolating this page from every other cursor.</returns>
  public static string PaginationCacheKey(string method, string? cursor) =>
    cursor is null ? $"{method}::page:first" : $"{method}::page:cursor:{cursor}";
}

/// <summary>
/// The result of <see cref="OffsetPaginator{T}.GetPage"/>: either a successful page (with items and
/// an optional next cursor) or a structured invalid-cursor error. The paginator NEVER throws on an
/// unrecognized cursor (RC-3/RC-4). Mirrors TS <c>PaginatorPageResult</c>.
/// </summary>
/// <typeparam name="T">The item type.</typeparam>
public sealed record PaginatorPageResult<T>
{
  private PaginatorPageResult() { }

  /// <summary><c>true</c> when the page was produced; <c>false</c> when the cursor was rejected.</summary>
  public bool Ok { get; private init; }

  /// <summary>The page items when <see cref="Ok"/> is <c>true</c>; otherwise empty.</summary>
  public IReadOnlyList<T> Items { get; private init; } = [];

  /// <summary>The next-page cursor when more items remain; <c>null</c> on the last page or on error.</summary>
  public string? NextCursor { get; private init; }

  /// <summary>The <c>-32602</c> error when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public McpError? Error { get; private init; }

  /// <summary>Builds a successful page.</summary>
  /// <param name="items">The page items.</param>
  /// <param name="nextCursor">The next cursor, or <c>null</c> on the last page.</param>
  /// <returns>A successful page result.</returns>
  public static PaginatorPageResult<T> Page(IReadOnlyList<T> items, string? nextCursor) =>
    new() { Ok = true, Items = items, NextCursor = nextCursor };

  /// <summary>Builds an error result carrying the invalid-cursor error.</summary>
  /// <param name="error">The <c>-32602</c> error.</param>
  /// <returns>An error result.</returns>
  public static PaginatorPageResult<T> Invalid(McpError error) => new() { Ok = false, Error = error };
}

/// <summary>
/// A reference cursor-based paginator over an in-memory list — the C# counterpart of the TypeScript
/// <c>OffsetPaginator</c>. Cursors are deterministic DECIMAL offset strings (matching TS, not
/// base64): the same position always yields the same cursor token (RC-2: stability). An unrecognized
/// or malformed cursor is returned as a structured error rather than thrown (RC-3/RC-4), so the
/// server remains operational after a bad cursor.
/// </summary>
/// <typeparam name="T">The item type.</typeparam>
public sealed class OffsetPaginator<T>
{
  private readonly IReadOnlyList<T> _items;

  /// <summary>The number of items returned per page.</summary>
  public int PageSize { get; }

  /// <summary>
  /// Creates a paginator over <paramref name="items"/> with the given <paramref name="pageSize"/>.
  /// </summary>
  /// <param name="items">The items to paginate.</param>
  /// <param name="pageSize">The page size; MUST be a positive integer. Defaults to 20 (matching TS).</param>
  /// <exception cref="ArgumentOutOfRangeException">Thrown when <paramref name="pageSize"/> is less than 1.</exception>
  public OffsetPaginator(IReadOnlyList<T> items, int pageSize = 20)
  {
    ArgumentNullException.ThrowIfNull(items);
    if (pageSize < 1)
    {
      // TS throws RangeError; the idiomatic .NET equivalent is ArgumentOutOfRangeException.
      throw new ArgumentOutOfRangeException(nameof(pageSize), pageSize, "pageSize must be a positive integer.");
    }
    _items = items;
    PageSize = pageSize;
  }

  /// <summary>
  /// Returns a page of items for the given cursor. An absent cursor (<c>null</c>) yields the first
  /// page; a present cursor yields the page starting at the encoded offset; an unrecognized cursor
  /// yields an error WITHOUT throwing (RC-3/RC-4). Mirrors TS <c>getPage</c>.
  /// </summary>
  /// <param name="cursor">The page cursor, or <c>null</c> for the first page.</param>
  /// <returns>The page or a structured invalid-cursor error.</returns>
  public PaginatorPageResult<T> GetPage(string? cursor)
  {
    var offset = cursor is null ? 0 : DecodeCursor(cursor);
    if (offset is null)
    {
      return PaginatorPageResult<T>.Invalid(PaginationUtilities.BuildInvalidCursorError());
    }

    var start = offset.Value;
    var count = Math.Min(PageSize, _items.Count - start);
    var page = new List<T>(count);
    for (var i = start; i < start + count; i++) page.Add(_items[i]);
    var nextOffset = start + PageSize;
    var nextCursor = nextOffset < _items.Count ? EncodeCursor(nextOffset) : null;
    return PaginatorPageResult<T>.Page(page, nextCursor);
  }

  /// <summary>Encodes an offset as a deterministic decimal cursor string (RC-2).</summary>
  /// <param name="offset">The item offset.</param>
  /// <returns>The cursor token.</returns>
  private static string EncodeCursor(int offset) => offset.ToString(System.Globalization.CultureInfo.InvariantCulture);

  /// <summary>Decodes a cursor string; returns <c>null</c> for any unrecognized token.</summary>
  /// <param name="cursor">The cursor token.</param>
  /// <returns>The offset, or <c>null</c> when the cursor is invalid.</returns>
  private int? DecodeCursor(string cursor)
  {
    // Only a run of ASCII digits is a recognized token (matches the TS /^\d+$/ guard; "" and "-1"
    // are rejected). An in-range value in [0, items.Length] is valid.
    if (cursor.Length == 0) return null;
    foreach (var ch in cursor)
    {
      if (ch is < '0' or > '9') return null;
    }
    if (!int.TryParse(cursor, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var n))
    {
      return null;
    }
    return n >= 0 && n <= _items.Count ? n : null;
  }
}

// ─── Progress (§15.1) ──────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Tracks active progress tokens for a single sender, enforcing the §15.1 uniqueness and monotonicity
/// rules — the C# counterpart of the TypeScript <c>ProgressTracker</c>. A token's identity preserves
/// the JSON type, so string <c>"1"</c> and number <c>1</c> are distinct (R-15.1.1-c).
/// </summary>
/// <remarks>
/// Rules enforced: tokens MUST be unique across the sender's active requests (R-15.1.1-c); receivers
/// MUST treat the token as opaque (R-15.1.1-d); <c>progress</c> MUST strictly increase across
/// successive notifications (R-15.1.3-e); progress MUST stop once the operation reaches a terminal
/// state (R-15.1.4-g — modeled by <see cref="Complete"/> removing the token). Not thread-safe.
/// </remarks>
public sealed class ProgressTracker
{
  private sealed class Tracked
  {
    public required ProgressToken Token { get; init; }
    public double LastProgress { get; set; } = double.NegativeInfinity;
  }

  private readonly Dictionary<string, Tracked> _active = new(StringComparer.Ordinal);

  /// <summary>Derives a typed key distinguishing string and number tokens with the same text (R-15.1.1-c).</summary>
  private static string TokenKey(ProgressToken token) => token.IsString ? $"s:{token}" : $"n:{token}";

  /// <summary>
  /// Registers <paramref name="token"/> as active when a request carrying it is about to be sent.
  /// Mirrors TS <c>register</c>.
  /// </summary>
  /// <param name="token">The progress token.</param>
  /// <exception cref="InvalidOperationException">Thrown when the token is already active (R-15.1.1-c).</exception>
  public void Register(ProgressToken token)
  {
    var key = TokenKey(token);
    if (_active.ContainsKey(key))
    {
      throw new InvalidOperationException(
        $"Progress token \"{token}\" is already active; tokens must be unique across the sender's active requests (R-15.1.1-c).");
    }
    _active[key] = new Tracked { Token = token };
  }

  /// <summary>
  /// Removes <paramref name="token"/> from the active set once the operation has reached a terminal
  /// state (R-15.1.4-g). Safe to call for a token that is not currently tracked. Mirrors TS <c>complete</c>.
  /// </summary>
  /// <param name="token">The progress token.</param>
  public void Complete(ProgressToken token) => _active.Remove(TokenKey(token));

  /// <summary>Returns <c>true</c> when <paramref name="token"/> is currently registered as active. Mirrors TS <c>has</c>.</summary>
  /// <param name="token">The progress token.</param>
  /// <returns><c>true</c> when active.</returns>
  public bool Has(ProgressToken token) => _active.ContainsKey(TokenKey(token));

  /// <summary>
  /// Returns <c>true</c> when <paramref name="progress"/> is strictly greater than the last recorded
  /// value for <paramref name="token"/> (R-15.1.3-e). Returns <c>false</c> for an unknown (not-yet-
  /// registered or already-completed) token. Mirrors TS <c>isMonotonic</c>.
  /// </summary>
  /// <param name="token">The progress token.</param>
  /// <param name="progress">The candidate progress value.</param>
  /// <returns><c>true</c> when the value strictly increases.</returns>
  public bool IsMonotonic(ProgressToken token, double progress)
  {
    if (!_active.TryGetValue(TokenKey(token), out var entry)) return false;
    return progress > entry.LastProgress;
  }

  /// <summary>
  /// Records <paramref name="progress"/> as the latest value for <paramref name="token"/> after a
  /// monotonicity check has passed. Mirrors TS <c>recordProgress</c>.
  /// </summary>
  /// <param name="token">The progress token.</param>
  /// <param name="progress">The progress value to record.</param>
  /// <exception cref="InvalidOperationException">Thrown when the token is not currently active.</exception>
  public void RecordProgress(ProgressToken token, double progress)
  {
    if (!_active.TryGetValue(TokenKey(token), out var entry))
    {
      throw new InvalidOperationException($"Progress token \"{token}\" is not active; cannot record progress.");
    }
    entry.LastProgress = progress;
  }

  /// <summary>The number of currently active progress tokens. Mirrors TS <c>size</c>.</summary>
  public int Count => _active.Count;

  /// <summary>A snapshot of all currently active tokens. Mirrors TS <c>activeTokens</c>.</summary>
  public IReadOnlyList<ProgressToken> ActiveTokens => _active.Values.Select(e => e.Token).ToList();
}

/// <summary>
/// A per-token rate limiter for <c>notifications/progress</c> emissions (RC-3 / SHOULD) — the C#
/// counterpart of the TypeScript <c>ProgressRateLimiter</c>. Each token has an independent last-emit
/// time so a slow token is not penalized by a fast one; string and number tokens are tracked
/// independently. The current time is injected (no wall-clock), so behavior is deterministic.
/// </summary>
public sealed class ProgressRateLimiter
{
  private readonly long _intervalMs;
  private readonly Dictionary<string, long> _lastEmit = new(StringComparer.Ordinal);

  /// <summary>Creates a limiter with the given minimum interval between emissions for the same token.</summary>
  /// <param name="intervalMs">The minimum milliseconds between successive emissions per token. Defaults to 100 ms (RC-3).</param>
  public ProgressRateLimiter(long intervalMs = 100) => _intervalMs = intervalMs;

  private static string TokenKey(ProgressToken token) => token.IsString ? $"s:{token}" : $"n:{token}";

  /// <summary>
  /// Returns <c>true</c> when a notification for <paramref name="token"/> may be emitted at
  /// <paramref name="nowMs"/>, recording <paramref name="nowMs"/> as the new last-emit time when
  /// permitted. Mirrors TS <c>shouldEmit</c>.
  /// </summary>
  /// <param name="token">The progress token.</param>
  /// <param name="nowMs">The current time in milliseconds (injected at the call site).</param>
  /// <returns><c>true</c> when emission is permitted.</returns>
  public bool ShouldEmit(ProgressToken token, long nowMs)
  {
    var key = TokenKey(token);
    if (_lastEmit.TryGetValue(key, out var last) && nowMs - last < _intervalMs) return false;
    _lastEmit[key] = nowMs;
    return true;
  }

  /// <summary>Clears the rate-limit state for <paramref name="token"/> when the operation is terminal. Safe for an unknown token. Mirrors TS <c>complete</c>.</summary>
  /// <param name="token">The progress token.</param>
  public void Complete(ProgressToken token) => _lastEmit.Remove(TokenKey(token));
}

// ─── Cancellation utilities (§15.2) ── live in Cancellation.cs (CancellationHandler, etc.) ──────────

// ─── Logging filtering (§15.3) ───────────────────────────────────────────────────────────────────

/// <summary>
/// The §15.3 logging-filter behavioral layer — the C# counterpart of the TypeScript
/// <c>protocol/logging.ts</c> helpers — for the <b>Deprecated</b> logging-message mechanism. The
/// <see cref="LoggingLevel"/> enum (and its <see cref="LoggingLevelExtensions"/> ordering) carries
/// the severities; this class adds the per-request opt-in validation (<c>-32602</c> on a bad value,
/// R-15.3.3-g), the min-emit-level resolution (absent/invalid ⇒ emit nothing, R-15.3.3-a), and the
/// global <see cref="LogRateLimiter"/>.
/// </summary>
public static class LoggingFilter
{
  /// <summary>The eight syslog levels in ascending-severity order (§15.3.1). Mirrors TS <c>LOGGING_LEVELS</c>.</summary>
  public static IReadOnlyList<LoggingLevel> LoggingLevels { get; } =
  [
    LoggingLevel.Debug, LoggingLevel.Info, LoggingLevel.Notice, LoggingLevel.Warning,
    LoggingLevel.Error, LoggingLevel.Critical, LoggingLevel.Alert, LoggingLevel.Emergency,
  ];

  /// <summary>The wire string for each level, indexed by severity (§15.3.1).</summary>
  private static readonly string[] LevelWireValues =
    ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"];

  /// <summary>
  /// Parses a raw <c>io.modelcontextprotocol/logLevel</c> opt-in string to its <see cref="LoggingLevel"/>,
  /// or <c>null</c> when the value is not one of the eight recognized strings (case-sensitive).
  /// </summary>
  /// <param name="logLevel">The raw opt-in string, or <c>null</c>.</param>
  /// <returns>The parsed level, or <c>null</c> when unrecognized/absent.</returns>
  public static LoggingLevel? ParseLogLevel(string? logLevel)
  {
    if (logLevel is null) return null;
    var index = Array.IndexOf(LevelWireValues, logLevel);
    return index >= 0 ? (LoggingLevel)index : null;
  }

  /// <summary>
  /// Returns <c>true</c> when a message of <paramref name="candidate"/> severity is at or above the
  /// requested <paramref name="minimum"/> — the server-side emit filter. Mirrors TS
  /// <c>isAtOrAboveLogLevel</c>. (R-15.3.3-c/d)
  /// </summary>
  /// <param name="candidate">The severity of the message being considered.</param>
  /// <param name="minimum">The minimum severity the request opted in at.</param>
  /// <returns><c>true</c> when the message should be emitted.</returns>
  public static bool IsAtOrAboveLogLevel(LoggingLevel candidate, LoggingLevel minimum) =>
    candidate.IsAtOrAbove(minimum);

  /// <summary>
  /// Validates the <c>io.modelcontextprotocol/logLevel</c> opt-in value from a request's <c>_meta</c>:
  /// returns success when it is a recognized level string, or a <c>-32602</c> error when it is not
  /// (a number, an unknown string, or <c>null</c> are all rejected). Mirrors TS <c>validateLogLevelOptIn</c>.
  /// (R-15.3.3-g)
  /// </summary>
  /// <param name="logLevel">The raw opt-in value, or <c>null</c> when absent.</param>
  /// <returns>The validation result; on failure carrying the <c>-32602</c> error.</returns>
  public static LogLevelValidationResult ValidateLogLevelOptIn(string? logLevel)
  {
    if (ParseLogLevel(logLevel) is not null) return LogLevelValidationResult.Pass;
    return LogLevelValidationResult.Fail(
      McpError.InvalidParams(
        "Invalid params: io.modelcontextprotocol/logLevel must be one of the recognized LoggingLevel strings (R-15.3.3-g)."));
  }

  /// <summary>
  /// Returns the minimum numeric severity index that should be emitted for a request bearing
  /// <paramref name="logLevelOptIn"/>, or <c>-1</c> when no valid opt-in is present — in which case
  /// NO log notifications MUST be emitted. Mirrors TS <c>resolvedMinLogLevelIndex</c>. (R-15.3.3-a)
  /// </summary>
  /// <param name="logLevelOptIn">The raw opt-in value, or <c>null</c>.</param>
  /// <returns>The minimum emit index, or <c>-1</c> to emit nothing.</returns>
  public static int ResolvedMinLogLevelIndex(string? logLevelOptIn)
  {
    var level = ParseLogLevel(logLevelOptIn);
    return level is { } l ? l.Index() : -1;
  }
}

/// <summary>The outcome of <see cref="LoggingFilter.ValidateLogLevelOptIn"/> (§15.3.3-g). Mirrors TS <c>LogLevelValidationResult</c>.</summary>
public sealed record LogLevelValidationResult
{
  private LogLevelValidationResult() { }

  /// <summary><c>true</c> when the opt-in value is a recognized level.</summary>
  public bool Ok { get; private init; }

  /// <summary>The <c>-32602</c> error when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public McpError? Error { get; private init; }

  /// <summary>A shared success result.</summary>
  public static LogLevelValidationResult Pass { get; } = new() { Ok = true };

  /// <summary>Builds a rejection carrying the <c>-32602</c> error.</summary>
  /// <param name="error">The invalid-params error.</param>
  /// <returns>A rejection result.</returns>
  public static LogLevelValidationResult Fail(McpError error) => new() { Ok = false, Error = error };
}

/// <summary>
/// A global rate limiter for <c>notifications/message</c> log emissions (RC-3 / SHOULD) — the C#
/// counterpart of the TypeScript <c>LogRateLimiter</c>. Unlike <see cref="ProgressRateLimiter"/>, a
/// single shared throttle window applies to the entire log stream (all messages share the one
/// <c>notifications/message</c> channel). The current time is injected, so behavior is deterministic.
/// </summary>
public sealed class LogRateLimiter
{
  private readonly long _intervalMs;
  private long? _lastEmitMs;

  /// <summary>Creates a limiter with the given minimum interval between log notifications.</summary>
  /// <param name="intervalMs">The minimum milliseconds between successive log notifications. Defaults to 50 ms (RC-3).</param>
  public LogRateLimiter(long intervalMs = 50) => _intervalMs = intervalMs;

  /// <summary>
  /// Returns <c>true</c> when a log notification may be emitted at <paramref name="nowMs"/>, recording
  /// <paramref name="nowMs"/> as the new last-emit time when permitted. Mirrors TS <c>shouldEmit</c>.
  /// </summary>
  /// <param name="nowMs">The current time in milliseconds (injected at the call site).</param>
  /// <returns><c>true</c> when emission is permitted.</returns>
  public bool ShouldEmit(long nowMs)
  {
    if (_lastEmitMs is { } last && nowMs - last < _intervalMs) return false;
    _lastEmitMs = nowMs;
    return true;
  }
}

// ─── Trace context (§15.4) ───────────────────────────────────────────────────────────────────────

/// <summary>
/// The §15.4 W3C trace-context propagation helpers — the C# counterpart of the TypeScript
/// <c>protocol/logging.ts</c> trace utilities. The three bare keys (<c>traceparent</c>,
/// <c>tracestate</c>, <c>baggage</c>) ride in <c>_meta</c>; receivers MUST treat them as opaque and
/// intermediaries SHOULD propagate them UNCHANGED (R-15.4.2-h). This class uses the format validators
/// already defined on <see cref="Stackific.Mcp.Json.MetaKeys"/>.
/// </summary>
public static class TraceContext
{
  /// <summary>The three W3C trace-context bare keys carried in <c>_meta</c> (§15.4.1). Mirrors TS <c>TRACE_CONTEXT_BARE_KEYS</c>.</summary>
  public static IReadOnlyList<string> BareKeys { get; } =
    [Stackific.Mcp.Json.MetaKeys.TraceParent, Stackific.Mcp.Json.MetaKeys.TraceState, Stackific.Mcp.Json.MetaKeys.Baggage];

  private static bool TryGetString(JsonObject meta, string key, out string value)
  {
    value = string.Empty;
    if (meta[key] is JsonValue v && v.GetValueKind() == JsonValueKind.String)
    {
      value = v.GetValue<string>();
      return true;
    }
    return false;
  }

  /// <summary>Returns <c>true</c> when <paramref name="meta"/> carries a W3C-conformant <c>traceparent</c>. Mirrors TS <c>hasTraceparent</c>. (R-15.4.1-a)</summary>
  /// <param name="meta">The <c>_meta</c> object.</param>
  /// <returns><c>true</c> when a valid <c>traceparent</c> is present.</returns>
  public static bool HasTraceparent(JsonObject meta)
  {
    ArgumentNullException.ThrowIfNull(meta);
    return TryGetString(meta, Stackific.Mcp.Json.MetaKeys.TraceParent, out var v) && Stackific.Mcp.Json.MetaKeys.IsValidTraceparent(v);
  }

  /// <summary>Returns <c>true</c> when <paramref name="meta"/> carries a W3C-conformant <c>tracestate</c>. Mirrors TS <c>hasTracestate</c>. (R-15.4.1-b)</summary>
  /// <param name="meta">The <c>_meta</c> object.</param>
  /// <returns><c>true</c> when a valid <c>tracestate</c> is present.</returns>
  public static bool HasTracestate(JsonObject meta)
  {
    ArgumentNullException.ThrowIfNull(meta);
    return TryGetString(meta, Stackific.Mcp.Json.MetaKeys.TraceState, out var v) && Stackific.Mcp.Json.MetaKeys.IsValidTracestate(v);
  }

  /// <summary>Returns <c>true</c> when <paramref name="meta"/> carries a W3C-conformant <c>baggage</c>. Mirrors TS <c>hasBaggage</c>. (R-15.4.1-c)</summary>
  /// <param name="meta">The <c>_meta</c> object.</param>
  /// <returns><c>true</c> when a valid <c>baggage</c> is present.</returns>
  public static bool HasBaggage(JsonObject meta)
  {
    ArgumentNullException.ThrowIfNull(meta);
    return TryGetString(meta, Stackific.Mcp.Json.MetaKeys.Baggage, out var v) && Stackific.Mcp.Json.MetaKeys.IsValidBaggage(v);
  }

  /// <summary>
  /// Copies the three trace-context keys present in <paramref name="inbound"/> onto a fresh copy of
  /// <paramref name="outbound"/>, UNCHANGED, for intermediary relay. Only keys present in
  /// <paramref name="inbound"/> are copied; existing same-named outbound values are overwritten so the
  /// inbound values propagate unchanged; <paramref name="outbound"/> is NOT mutated. Mirrors TS
  /// <c>relayTraceContext</c>. (R-15.4.2-h)
  /// </summary>
  /// <param name="inbound">The inbound <c>_meta</c> carrying trace context.</param>
  /// <param name="outbound">The outbound <c>_meta</c> to relay onto.</param>
  /// <returns>A new object merging <paramref name="outbound"/> with the relayed keys.</returns>
  public static JsonObject RelayTraceContext(JsonObject inbound, JsonObject outbound)
  {
    ArgumentNullException.ThrowIfNull(inbound);
    ArgumentNullException.ThrowIfNull(outbound);
    var result = (JsonObject)outbound.DeepClone();
    foreach (var key in BareKeys)
    {
      if (inbound[key] is { } value) result[key] = value.DeepClone();
    }
    return result;
  }

  /// <summary>
  /// Extracts only the string trace-context keys from <paramref name="meta"/>, returning an object
  /// that contains at most <c>traceparent</c>, <c>tracestate</c>, and <c>baggage</c>. A non-tracing
  /// receiver can safely ignore the result. Values are copied verbatim (not parsed). Mirrors TS
  /// <c>extractTraceContext</c>. (R-15.4.2-c/g)
  /// </summary>
  /// <param name="meta">The <c>_meta</c> object.</param>
  /// <returns>A new object carrying only the present string trace keys.</returns>
  public static JsonObject ExtractTraceContext(JsonObject meta)
  {
    ArgumentNullException.ThrowIfNull(meta);
    var ctx = new JsonObject();
    foreach (var key in BareKeys)
    {
      if (TryGetString(meta, key, out var value)) ctx[key] = value;
    }
    return ctx;
  }
}
