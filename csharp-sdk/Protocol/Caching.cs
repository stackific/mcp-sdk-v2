using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The intended sharing scope of a cacheable result (spec §13). <c>public</c> means any client
/// or intermediary MAY cache and serve the response to any user; <c>private</c> means only the
/// requesting user's client MAY cache it.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<CacheScope>))]
public enum CacheScope
{
  /// <summary>Cacheable and shareable across users and intermediaries.</summary>
  [JsonStringEnumMemberName("public")]
  Public,

  /// <summary>Cacheable only by the requesting user's client; never served to another user.</summary>
  [JsonStringEnumMemberName("private")]
  Private,
}

/// <summary>
/// Response-cache hints carried by a cacheable result (spec §13.1): a client-cache time-to-live
/// in milliseconds and the sharing scope. Both are REQUIRED on a cacheable result.
/// </summary>
/// <param name="TtlMs">How long the client MAY treat the result as fresh, in milliseconds (minimum 0).</param>
/// <param name="CacheScope">The sharing scope of the cached result.</param>
public sealed record CacheHints(long TtlMs, CacheScope CacheScope)
{
  /// <summary>
  /// The conservative "no-cache" hint: a zero TTL (immediately stale) with the privacy-default
  /// <see cref="CacheScope.Private"/> scope (spec §13.1-e, §13.4-b). A server that does not wish to
  /// encourage caching MUST still include both fields and SHOULD set <c>ttlMs</c> to <c>0</c>; when
  /// the scope is unknown the conservative default is <c>private</c>, never <c>public</c>.
  /// </summary>
  public static CacheHints None { get; } = new(0, CacheScope.Private);
}

/// <summary>
/// The §13 response-caching behavioral layer — the C# counterpart of the TypeScript
/// <c>protocol/caching.ts</c> utilities. The wire records (<see cref="CacheScope"/>,
/// <see cref="CacheHints"/>) carry the advisory hints; this static class adds the runtime rules the
/// spec layers on top: hint validation (<see cref="IsCacheHintValid"/>), the
/// <em>privacy-default</em> scope resolution (<see cref="ResolveCacheScope(string?)"/>, R-13.1-e), the
/// client-local freshness computation (<see cref="IsFresh"/>, R-13.2), cross-page scope consistency
/// (R-13.5-h), and the method→notification invalidation map (R-13.5-j). The cache itself is
/// <see cref="ResponseCache{T}"/>.
/// </summary>
/// <remarks>
/// Caching hints are purely advisory: they never alter a result's meaning, never function as access
/// control, and clients MAY ignore them entirely (R-13.4-f, R-13.3-d/e).
/// </remarks>
public static class Caching
{
  /// <summary>The two recognized <c>cacheScope</c> wire strings (§13.3).</summary>
  public static IReadOnlyList<string> CacheScopes { get; } = ["public", "private"];

  /// <summary>
  /// The five method names whose results carry caching hints (§13.4, R-13.4-a). On every result
  /// from these methods a server MUST populate both <c>ttlMs</c> and <c>cacheScope</c>; on any other
  /// message receivers MUST ignore the fields if present (R-13.4-e). Mirrors TS <c>CACHEABLE_METHODS</c>.
  /// </summary>
  public static IReadOnlySet<string> CacheableMethods { get; } = new HashSet<string>(StringComparer.Ordinal)
  {
    McpMethods.ToolsList,
    McpMethods.PromptsList,
    McpMethods.ResourcesList,
    McpMethods.ResourceTemplatesList,
    McpMethods.ResourcesRead,
  };

  /// <summary>Returns <c>true</c> when <paramref name="method"/> is one of the five cacheable methods. Mirrors TS <c>isCacheableMethod</c>.</summary>
  /// <param name="method">The method name.</param>
  /// <returns><c>true</c> when the method carries caching hints.</returns>
  public static bool IsCacheableMethod(string method) => CacheableMethods.Contains(method);

  /// <summary>
  /// Maps each cacheable method to the notification that signals a change to its data; when the
  /// notification arrives the client MUST discard the cached result and re-fetch (§13.5, R-13.5-a/j).
  /// Mirrors TS <c>METHOD_TO_NOTIFICATION_MAP</c>.
  /// </summary>
  public static IReadOnlyDictionary<string, string> MethodToNotification { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
  {
    [McpMethods.ToolsList] = McpMethods.NotificationsToolsListChanged,
    [McpMethods.PromptsList] = McpMethods.NotificationsPromptsListChanged,
    [McpMethods.ResourcesList] = McpMethods.NotificationsResourcesListChanged,
    [McpMethods.ResourceTemplatesList] = McpMethods.NotificationsResourcesListChanged,
    [McpMethods.ResourcesRead] = McpMethods.NotificationsResourcesUpdated,
  };

  /// <summary>
  /// Returns the method names whose cached results should be invalidated when
  /// <paramref name="notification"/> is received. Mirrors TS <c>methodsForNotification</c>. (R-13.5-j)
  /// </summary>
  /// <param name="notification">The notification method name.</param>
  /// <returns>The methods to invalidate (possibly empty).</returns>
  public static IReadOnlyList<string> MethodsForNotification(string notification)
  {
    var methods = new List<string>();
    foreach (var (method, notif) in MethodToNotification)
    {
      if (string.Equals(notif, notification, StringComparison.Ordinal)) methods.Add(method);
    }
    return methods;
  }

  /// <summary>
  /// Returns <c>true</c> when BOTH caching-hint fields are present and valid: <paramref name="ttlMs"/>
  /// is a non-negative integer and <paramref name="cacheScope"/> is exactly <c>"public"</c> or
  /// <c>"private"</c>. A receiver MUST NOT treat a result as cacheable when <c>ttlMs</c> is negative,
  /// non-integer, or missing, and MUST treat an unrecognized/missing scope as private (handled by
  /// <see cref="ResolveCacheScope(string?)"/>). Mirrors TS <c>isCacheHintValid</c>. (R-13.1-a/b/d/e)
  /// </summary>
  /// <param name="ttlMs">The raw <c>ttlMs</c> value (a <see cref="JsonNode"/> or <c>null</c>).</param>
  /// <param name="cacheScope">The raw <c>cacheScope</c> value.</param>
  /// <returns><c>true</c> when both hints are present and valid.</returns>
  public static bool IsCacheHintValid(JsonNode? ttlMs, JsonNode? cacheScope)
  {
    if (ttlMs is not JsonValue ttlValue || ttlValue.GetValueKind() != JsonValueKind.Number) return false;
    if (!ttlValue.TryGetValue<double>(out var ttl)) return false;
    if (double.IsNaN(ttl) || double.IsInfinity(ttl) || Math.Floor(ttl) != ttl || ttl < 0) return false;
    if (cacheScope is not JsonValue scopeValue || scopeValue.GetValueKind() != JsonValueKind.String) return false;
    var scope = scopeValue.GetValue<string>();
    return scope is "public" or "private";
  }

  /// <summary>
  /// Asserts the <em>emit-side</em> invariant for a cacheable result that is being sent with a
  /// completed (<c>"complete"</c>) discriminator (§3.6, §13.1, §13.4): the <paramref name="resultType"/>
  /// MUST be exactly <c>"complete"</c>, and BOTH caching hints MUST be present — <paramref name="ttlMs"/>
  /// a non-negative integer and <paramref name="cacheScope"/> a resolved scope. A sender MUST NOT emit
  /// one hint without the other (§13.1), MUST NOT emit a negative <c>ttlMs</c> (§13.2), and MUST carry
  /// the discriminator (§3.6). This is the construction-time guard a server applies before a result
  /// reaches the wire; it is the counterpart of the lenient <em>receive-side</em> degradation in
  /// <see cref="IsCacheHintValid"/>/<see cref="ResolveCacheScope(JsonNode)"/>, which never throws.
  /// </summary>
  /// <param name="resultType">The result's discriminator (§3.6).</param>
  /// <param name="ttlMs">The freshness hint in milliseconds, or <c>null</c> when absent.</param>
  /// <param name="cacheScope">The sharing scope, or <c>null</c> when absent.</param>
  /// <param name="resultName">The result type name, used in the exception message.</param>
  /// <exception cref="ArgumentException">When the discriminator is not <c>"complete"</c>, a hint is absent, or <c>ttlMs</c> is negative.</exception>
  public static void ValidateCacheableComplete(string resultType, long? ttlMs, CacheScope? cacheScope, string resultName)
  {
    if (resultType != ResultTypes.Complete)
    {
      throw new ArgumentException(
        $"{resultName}.resultType MUST be \"{ResultTypes.Complete}\" on a completed cacheable result (§3.6); got \"{resultType}\".",
        nameof(resultType));
    }
    if (ttlMs is not { } ttl)
    {
      throw new ArgumentException(
        $"{resultName} MUST carry a ttlMs caching hint (§13.1, §13.4).", nameof(ttlMs));
    }
    if (ttl < 0)
    {
      throw new ArgumentException(
        $"{resultName}.ttlMs MUST be a non-negative integer (§13.2); got {ttl}.", nameof(ttlMs));
    }
    if (cacheScope is null)
    {
      throw new ArgumentException(
        $"{resultName} MUST carry a cacheScope caching hint (§13.1, §13.4).", nameof(cacheScope));
    }
  }

  /// <summary>
  /// Returns <c>true</c> when a result object carries BOTH caching-hint fields, or NEITHER. A server
  /// MUST NOT emit exactly one without the other. Mirrors TS <c>hasBothOrNeitherCacheHints</c>. (R-13.1-g)
  /// </summary>
  /// <param name="result">The raw result object.</param>
  /// <returns><c>true</c> when both or neither hint field is present.</returns>
  public static bool HasBothOrNeitherCacheHints(JsonObject result)
  {
    ArgumentNullException.ThrowIfNull(result);
    return result.ContainsKey("ttlMs") == result.ContainsKey("cacheScope");
  }

  /// <summary>
  /// Returns <see cref="CacheScope.Public"/> or <see cref="CacheScope.Private"/>, applying the
  /// PRIVACY FALLBACK for any unrecognized or absent value — a receiver that cannot reliably
  /// distinguish authorization contexts MUST treat every cached result as private. Mirrors TS
  /// <c>resolveCacheScope</c>. (R-13.1-e, R-13.3-h)
  /// </summary>
  /// <param name="scope">The raw <c>cacheScope</c> value (a <see cref="JsonNode"/> or <c>null</c>).</param>
  /// <returns>The resolved scope, defaulting conservatively to <see cref="CacheScope.Private"/>.</returns>
  public static CacheScope ResolveCacheScope(JsonNode? scope)
  {
    if (scope is JsonValue value && value.GetValueKind() == JsonValueKind.String)
    {
      var text = value.GetValue<string>();
      if (text == "public") return CacheScope.Public;
      if (text == "private") return CacheScope.Private;
    }
    return CacheScope.Private;
  }

  /// <summary>
  /// Returns <see cref="CacheScope.Public"/> or <see cref="CacheScope.Private"/> for a raw scope
  /// string, applying the privacy fallback. Overload of <see cref="ResolveCacheScope(JsonNode)"/>
  /// for callers that already hold a string (or <c>null</c>). (R-13.1-e, R-13.3-h)
  /// </summary>
  /// <param name="scope">The raw scope string, or <c>null</c> when absent.</param>
  /// <returns>The resolved scope, defaulting to <see cref="CacheScope.Private"/>.</returns>
  public static CacheScope ResolveCacheScope(string? scope) => scope switch
  {
    "public" => CacheScope.Public,
    "private" => CacheScope.Private,
    _ => CacheScope.Private,
  };

  /// <summary>
  /// Returns <c>true</c> when the result is still within its freshness window:
  /// <c>(ttlMs &gt; 0) AND (now &lt; receivedAt + ttlMs)</c>. A <c>ttlMs</c> of <c>0</c> is never
  /// fresh (immediately stale). The computation uses ONLY the client's local <paramref name="receivedAt"/>
  /// and the <paramref name="ttlMs"/> value — it MUST NOT assume the client and server clocks agree.
  /// Mirrors TS <c>isFresh</c>. (R-13.2-e/f/g)
  /// </summary>
  /// <param name="ttlMs">The non-negative freshness hint in milliseconds.</param>
  /// <param name="receivedAt">The client-local timestamp (ms) when the response was received.</param>
  /// <param name="now">The current client-local timestamp (ms).</param>
  /// <returns><c>true</c> when the result is still fresh.</returns>
  public static bool IsFresh(long ttlMs, long receivedAt, long now)
  {
    if (ttlMs <= 0) return false;
    return now < receivedAt + ttlMs;
  }

  /// <summary>
  /// Computes <c>expiresAt</c> — the absolute client-local timestamp after which the result is stale
  /// (<c>receivedAt + ttlMs</c>). Mirrors TS <c>expiresAt</c>. (R-13.2-e/f)
  /// </summary>
  /// <param name="ttlMs">The non-negative freshness hint.</param>
  /// <param name="receivedAt">The local receive timestamp (ms).</param>
  /// <returns>The absolute expiry timestamp (ms).</returns>
  public static long ExpiresAt(long ttlMs, long receivedAt) => receivedAt + ttlMs;

  /// <summary>
  /// Returns <c>true</c> when all <c>cacheScope</c> values across the pages of one logical list are
  /// identical (no mixing of public and private). An empty or single-page list is consistent. Mirrors
  /// TS <c>hasConsistentCacheScope</c>. (R-13.5-f/g)
  /// </summary>
  /// <param name="scopes">The observed scope strings across the pages.</param>
  /// <returns><c>true</c> when the scopes are homogeneous.</returns>
  public static bool HasConsistentCacheScope(IReadOnlyList<string> scopes)
  {
    ArgumentNullException.ThrowIfNull(scopes);
    if (scopes.Count == 0) return true;
    var first = scopes[0];
    foreach (var s in scopes)
    {
      if (!string.Equals(s, first, StringComparison.Ordinal)) return false;
    }
    return true;
  }

  /// <summary>
  /// Given the <c>cacheScope</c> values observed across a multi-page list, returns the effective
  /// scope to apply: the common scope when consistent, otherwise <see cref="CacheScope.Private"/>.
  /// An empty list resolves to private (the safe default). Mirrors TS <c>effectiveCacheScope</c>. (R-13.5-h)
  /// </summary>
  /// <param name="scopes">The observed scope strings across the pages.</param>
  /// <returns>The effective scope, collapsing inconsistency to private.</returns>
  public static CacheScope EffectiveCacheScope(IReadOnlyList<string> scopes)
  {
    ArgumentNullException.ThrowIfNull(scopes);
    if (!HasConsistentCacheScope(scopes)) return CacheScope.Private;
    return scopes.Count == 0 ? CacheScope.Private : ResolveCacheScope(scopes[0]);
  }
}

/// <summary>The outcome of a <see cref="ResponseCache{T}"/> lookup (§13).</summary>
/// <typeparam name="T">The cached value type.</typeparam>
public readonly record struct CacheGetResult<T>
{
  /// <summary><c>true</c> when a fresh entry was found and returned.</summary>
  public bool Hit { get; private init; }

  /// <summary>The cached value when <see cref="Hit"/> is <c>true</c>; otherwise <c>default</c>.</summary>
  public T? Value { get; private init; }

  /// <summary>The resolved scope of the cached value when <see cref="Hit"/> is <c>true</c>.</summary>
  public CacheScope CacheScope { get; private init; }

  /// <summary>A shared "miss" result.</summary>
  public static CacheGetResult<T> Miss { get; } = new() { Hit = false };

  /// <summary>Builds a "hit" result carrying the fresh value and its scope.</summary>
  /// <param name="value">The cached value.</param>
  /// <param name="scope">The resolved cache scope.</param>
  /// <returns>A "hit" result.</returns>
  public static CacheGetResult<T> Found(T value, CacheScope scope) =>
    new() { Hit = true, Value = value, CacheScope = scope };
}

/// <summary>
/// A minimal in-memory client response cache wired to <see cref="Caching.IsFresh"/>,
/// <see cref="Caching.ResolveCacheScope(JsonNode)"/>, and the method→notification invalidation map
/// (§13, R-13.5-j) — the C# counterpart of the TypeScript <c>ResponseCache</c>.
/// </summary>
/// <remarks>
/// <para>
/// Freshness is computed via <see cref="Caching.IsFresh"/>: <c>ttlMs = 0</c> entries are stored but
/// never served fresh (RC-3). <see cref="InvalidateByNotification"/> evicts all entries — including
/// paginated cursor pages keyed <c>method::…</c> — for every method mapped to the notification (RC-9).
/// Scope is resolved conservatively to <see cref="CacheScope.Private"/> for unknown values (RC-5).
/// </para>
/// <para>
/// Values are supplied alongside their raw <c>ttlMs</c>/<c>cacheScope</c> hints so the cache can
/// apply <see cref="Caching.HasBothOrNeitherCacheHints"/> and <see cref="Caching.IsCacheHintValid"/>
/// — an entry whose hints are missing or invalid is silently skipped. This type is not thread-safe.
/// </para>
/// </remarks>
/// <typeparam name="T">The cached value type.</typeparam>
public sealed class ResponseCache<T>
{
  private sealed record StoredEntry(T Value, long ReceivedAt, long TtlMs, CacheScope CacheScope);

  private readonly Dictionary<string, StoredEntry> _store = new(StringComparer.Ordinal);

  /// <summary>
  /// Stores <paramref name="value"/> under <paramref name="key"/> with its raw caching hints. The
  /// entry is SKIPPED when the hints are not both-present (R-13.1-g) or are invalid
  /// (<see cref="Caching.IsCacheHintValid"/>). A <c>ttlMs = 0</c> entry is stored but will never be
  /// served as a fresh hit.
  /// </summary>
  /// <param name="key">The cache key (for example a <see cref="PaginationUtilities.PaginationCacheKey"/>).</param>
  /// <param name="value">The value to cache.</param>
  /// <param name="ttlMs">The raw <c>ttlMs</c> hint from the result.</param>
  /// <param name="cacheScope">The raw <c>cacheScope</c> hint from the result.</param>
  /// <param name="receivedAt">The client-local receive timestamp (ms).</param>
  public void Set(string key, T value, JsonNode? ttlMs, JsonNode? cacheScope, long receivedAt)
  {
    ArgumentNullException.ThrowIfNull(key);
    // Both-or-neither: model the presence of each hint by whether the node is non-null.
    var hints = new JsonObject();
    if (ttlMs is not null) hints["ttlMs"] = ttlMs.DeepClone();
    if (cacheScope is not null) hints["cacheScope"] = cacheScope.DeepClone();
    if (!Caching.HasBothOrNeitherCacheHints(hints)) return;
    if (!Caching.IsCacheHintValid(ttlMs, cacheScope)) return;

    var ttl = (long)ttlMs!.GetValue<double>();
    _store[key] = new StoredEntry(value, receivedAt, ttl, Caching.ResolveCacheScope(cacheScope));
  }

  /// <summary>
  /// Returns the entry for <paramref name="key"/> if it is still fresh at <paramref name="now"/>;
  /// otherwise returns a miss and evicts the stale entry. (R-13.2-e, RC-3, RC-5)
  /// </summary>
  /// <param name="key">The cache key.</param>
  /// <param name="now">The current client-local timestamp (ms).</param>
  /// <returns>The cache lookup outcome.</returns>
  public CacheGetResult<T> Get(string key, long now)
  {
    ArgumentNullException.ThrowIfNull(key);
    if (!_store.TryGetValue(key, out var entry)) return CacheGetResult<T>.Miss;
    if (!Caching.IsFresh(entry.TtlMs, entry.ReceivedAt, now))
    {
      _store.Remove(key);
      return CacheGetResult<T>.Miss;
    }
    return CacheGetResult<T>.Found(entry.Value, entry.CacheScope);
  }

  /// <summary>
  /// Evicts all entries for every method that maps to <paramref name="notification"/>, including all
  /// paginated-cursor-page entries (keys equal to <c>method</c> or prefixed <c>method::</c>). (RC-9)
  /// </summary>
  /// <param name="notification">The change notification method name.</param>
  public void InvalidateByNotification(string notification)
  {
    ArgumentNullException.ThrowIfNull(notification);
    foreach (var method in Caching.MethodsForNotification(notification))
    {
      var prefix = $"{method}::";
      var toRemove = new List<string>();
      foreach (var key in _store.Keys)
      {
        if (key == method || key.StartsWith(prefix, StringComparison.Ordinal)) toRemove.Add(key);
      }
      foreach (var key in toRemove) _store.Remove(key);
    }
  }

  /// <summary>The number of entries currently stored (may include <c>ttlMs = 0</c> entries).</summary>
  public int Count => _store.Count;
}
