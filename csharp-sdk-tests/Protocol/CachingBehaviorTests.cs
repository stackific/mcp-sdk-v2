using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for §13 response caching — hint validation, the PRIVACY-DEFAULT scope resolution
/// (unknown/absent ⇒ private, R-13.1-e), client-local freshness, cross-page scope consistency, the
/// method→notification invalidation map, and the client <see cref="ResponseCache{T}"/> (freshness
/// eviction + notification-driven invalidation incl. cursor pages). Mirrors the TypeScript
/// <c>caching.test.ts</c> scenarios.
/// </summary>
public sealed class CachingBehaviorTests
{
  private static JsonNode Num(double n) => JsonValue.Create(n);
  private static JsonNode Str(string s) => JsonValue.Create(s);

  // ── Privacy-default scope resolution (AC-19.3 · R-13.1-e, R-13.3-h) ──

  [Fact]
  public void Resolve_cache_scope_defaults_unknown_and_absent_to_private()
  {
    Assert.Equal(CacheScope.Private, Caching.ResolveCacheScope("shared"));
    Assert.Equal(CacheScope.Private, Caching.ResolveCacheScope("PUBLIC"));
    Assert.Equal(CacheScope.Private, Caching.ResolveCacheScope((string?)null));
    Assert.Equal(CacheScope.Private, Caching.ResolveCacheScope(""));
    Assert.Equal(CacheScope.Private, Caching.ResolveCacheScope((JsonNode?)null));
  }

  [Fact]
  public void Resolve_cache_scope_passes_through_the_two_recognized_values()
  {
    Assert.Equal(CacheScope.Public, Caching.ResolveCacheScope("public"));
    Assert.Equal(CacheScope.Private, Caching.ResolveCacheScope("private"));
    Assert.Equal(CacheScope.Public, Caching.ResolveCacheScope(Str("public")));
  }

  [Fact]
  public void Cache_hints_no_default_is_private_not_public()
  {
    // The privacy-relevant fix: the conservative no-cache default must be private, never public.
    Assert.Equal(CacheScope.Private, CacheHints.None.CacheScope);
    Assert.Equal(0, CacheHints.None.TtlMs);
  }

  // ── Hint validation (AC-19.1, AC-19.2 · R-13.1-a/b/d/e) ──

  [Theory]
  [InlineData(600000.0, "public", true)]
  [InlineData(0.0, "private", true)]
  [InlineData(-1.0, "public", false)]   // negative ttl
  [InlineData(1.5, "private", false)]   // fractional ttl
  public void Is_cache_hint_valid_checks_ttl_and_scope(double ttl, string scope, bool expected)
  {
    Assert.Equal(expected, Caching.IsCacheHintValid(Num(ttl), Str(scope)));
  }

  [Fact]
  public void Is_cache_hint_valid_rejects_missing_or_string_ttl_and_unknown_scope()
  {
    Assert.False(Caching.IsCacheHintValid(null, Str("public")));        // missing ttl
    Assert.False(Caching.IsCacheHintValid(Str("600000"), Str("public"))); // string ttl
    Assert.False(Caching.IsCacheHintValid(Num(600000), Str("shared")));   // unknown scope
  }

  [Fact]
  public void Has_both_or_neither_cache_hints()
  {
    Assert.True(Caching.HasBothOrNeitherCacheHints(new JsonObject { ["ttlMs"] = 600, ["cacheScope"] = "public" }));
    Assert.True(Caching.HasBothOrNeitherCacheHints(new JsonObject { ["resultType"] = "complete" }));
    Assert.False(Caching.HasBothOrNeitherCacheHints(new JsonObject { ["ttlMs"] = 600 }));
    Assert.False(Caching.HasBothOrNeitherCacheHints(new JsonObject { ["cacheScope"] = "public" }));
  }

  // ── Freshness (AC-19.5, AC-19.6, AC-19.10 · R-13.2-e/f) ──

  [Fact]
  public void Is_fresh_zero_ttl_is_never_fresh()
  {
    Assert.False(Caching.IsFresh(0, 1000, 1000));
    Assert.False(Caching.IsFresh(0, 0, 9999999));
  }

  [Fact]
  public void Is_fresh_is_an_upper_bound_at_received_at_plus_ttl()
  {
    const long receivedAt = 1000;
    Assert.True(Caching.IsFresh(500, receivedAt, receivedAt + 499));
    Assert.False(Caching.IsFresh(500, receivedAt, receivedAt + 500)); // exactly expired
    Assert.False(Caching.IsFresh(500, receivedAt, receivedAt + 501));
  }

  [Fact]
  public void Expires_at_equals_received_at_plus_ttl()
  {
    Assert.Equal(601000, Caching.ExpiresAt(600000, 1000));
  }

  // ── Cross-page scope consistency (AC-19.24, AC-19.25 · R-13.5-f/g/h) ──

  [Fact]
  public void Has_consistent_cache_scope()
  {
    Assert.True(Caching.HasConsistentCacheScope(["public", "public", "public"]));
    Assert.True(Caching.HasConsistentCacheScope([]));
    Assert.True(Caching.HasConsistentCacheScope(["public"]));
    Assert.False(Caching.HasConsistentCacheScope(["public", "private"]));
  }

  [Fact]
  public void Effective_cache_scope_collapses_inconsistency_to_private()
  {
    Assert.Equal(CacheScope.Private, Caching.EffectiveCacheScope(["public", "private", "public"]));
    Assert.Equal(CacheScope.Public, Caching.EffectiveCacheScope(["public", "public"]));
    Assert.Equal(CacheScope.Private, Caching.EffectiveCacheScope(["private", "private"]));
    Assert.Equal(CacheScope.Private, Caching.EffectiveCacheScope([])); // safe default
  }

  // ── Cacheable-method registry + invalidation map (AC-19.16, §13.5 · R-13.5-j) ──

  [Theory]
  [InlineData("tools/list", true)]
  [InlineData("prompts/list", true)]
  [InlineData("resources/list", true)]
  [InlineData("resources/templates/list", true)]
  [InlineData("resources/read", true)]
  [InlineData("tools/call", false)]
  public void Is_cacheable_method(string method, bool expected)
  {
    Assert.Equal(expected, Caching.IsCacheableMethod(method));
  }

  [Fact]
  public void Method_to_notification_map_has_the_five_entries()
  {
    Assert.Equal(5, Caching.MethodToNotification.Count);
    Assert.Equal("notifications/tools/list_changed", Caching.MethodToNotification["tools/list"]);
    Assert.Equal("notifications/resources/updated", Caching.MethodToNotification["resources/read"]);
  }

  [Fact]
  public void Methods_for_notification_returns_both_resource_list_methods()
  {
    var methods = Caching.MethodsForNotification("notifications/resources/list_changed");
    Assert.Contains("resources/list", methods);
    Assert.Contains("resources/templates/list", methods);
    Assert.Equal(2, methods.Count);
    Assert.Empty(Caching.MethodsForNotification("notifications/unknown"));
  }

  // ── ResponseCache (RC-3, RC-5, RC-9) ──

  private sealed record Entry(string Data);

  [Fact]
  public void Cache_stores_and_returns_a_fresh_entry_with_resolved_scope()
  {
    var cache = new ResponseCache<Entry>();
    cache.Set("key", new Entry("hello"), Num(1000), Str("public"), receivedAt: 0);
    var result = cache.Get("key", now: 500);
    Assert.True(result.Hit);
    Assert.Equal("hello", result.Value!.Data);
    Assert.Equal(CacheScope.Public, result.CacheScope);
  }

  [Fact]
  public void Cache_misses_a_missing_key()
  {
    Assert.False(new ResponseCache<Entry>().Get("missing", 0).Hit);
  }

  [Fact]
  public void Cache_evicts_an_expired_entry_on_get()
  {
    var cache = new ResponseCache<Entry>();
    cache.Set("key", new Entry("d"), Num(100), Str("private"), receivedAt: 0);
    Assert.False(cache.Get("key", now: 100).Hit); // expired exactly at ttl
    Assert.Equal(0, cache.Count);
  }

  [Fact]
  public void Cache_stores_zero_ttl_entries_but_never_serves_them_fresh()
  {
    var cache = new ResponseCache<Entry>();
    cache.Set("key", new Entry("d"), Num(0), Str("private"), receivedAt: 0);
    Assert.Equal(1, cache.Count);
    Assert.False(cache.Get("key", 0).Hit);
  }

  [Fact]
  public void Cache_skips_entries_with_missing_or_invalid_hints()
  {
    var cache = new ResponseCache<Entry>();
    cache.Set("only-ttl", new Entry("d"), Num(100), null, 0);       // one hint only
    cache.Set("bad-scope", new Entry("d"), Num(1000), Str("unknown"), 0); // invalid scope
    Assert.Equal(0, cache.Count);
  }

  [Fact]
  public void Invalidate_by_notification_evicts_all_cursor_pages_for_the_mapped_methods()
  {
    var cache = new ResponseCache<Entry>();
    cache.Set("tools/list::page:first", new Entry("p1"), Num(60000), Str("public"), 0);
    cache.Set("tools/list::page:cursor:abc", new Entry("p2"), Num(60000), Str("public"), 0);
    cache.Set("prompts/list::page:first", new Entry("prompts"), Num(60000), Str("public"), 0);

    cache.InvalidateByNotification("notifications/tools/list_changed");

    Assert.False(cache.Get("tools/list::page:first", 1000).Hit);
    Assert.False(cache.Get("tools/list::page:cursor:abc", 1000).Hit);
    Assert.True(cache.Get("prompts/list::page:first", 1000).Hit); // unrelated method survives
  }

  [Fact]
  public void Invalidate_by_notification_evicts_both_resource_list_methods()
  {
    var cache = new ResponseCache<Entry>();
    cache.Set("resources/list::page:first", new Entry("r"), Num(60000), Str("public"), 0);
    cache.Set("resources/templates/list::page:first", new Entry("t"), Num(60000), Str("public"), 0);
    cache.InvalidateByNotification("notifications/resources/list_changed");
    Assert.Equal(0, cache.Count);
  }

  [Fact]
  public void Invalidate_by_unknown_notification_is_a_no_op()
  {
    var cache = new ResponseCache<Entry>();
    cache.Set("tools/list::page:first", new Entry("p1"), Num(60000), Str("public"), 0);
    cache.InvalidateByNotification("notifications/unknown/event");
    Assert.Equal(1, cache.Count);
  }
}
