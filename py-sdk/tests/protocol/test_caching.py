"""Tests for response caching hints + ResponseCache (§13).

Mirrors the TS suite ``ts-sdk/src/__tests__/protocol/caching.test.ts`` (AC-19.1 … AC-19.26)
plus Python-specific edge cases. ``is_valid_cacheable_result`` / ``is_valid_cache_scope``
are the Python analogues of the TS ``CacheableResultSchema`` / ``CacheScopeSchema``.
"""

import inspect
import sys

from mcp.protocol.caching import (
  CACHE_SCOPES,
  CACHEABLE_METHODS,
  METHOD_TO_NOTIFICATION_MAP,
  ResponseCache,
  effective_cache_scope,
  expires_at,
  has_both_or_neither_cache_hints,
  has_consistent_cache_scope,
  is_cache_hint_valid,
  is_cacheable_method,
  is_fresh,
  is_valid_cache_scope,
  is_valid_cacheable_result,
  methods_for_notification,
  resolve_cache_scope,
)


# ─── AC-19.1 — both fields required, valid on cacheable results ────────────────


class TestCacheableResultBothFieldsRequired:
  def test_accepts_valid_cacheable_result(self):
    assert is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": 600000, "cacheScope": "public", "tools": []}
    )

  def test_rejects_when_ttl_absent(self):
    assert not is_valid_cacheable_result({"resultType": "complete", "cacheScope": "public"})

  def test_rejects_when_scope_absent(self):
    assert not is_valid_cacheable_result({"resultType": "complete", "ttlMs": 600000})

  def test_rejects_when_result_type_absent(self):
    assert not is_valid_cacheable_result({"ttlMs": 600000, "cacheScope": "public"})

  def test_rejects_non_dict(self):
    assert not is_valid_cacheable_result(None)
    assert not is_valid_cacheable_result("complete")
    assert not is_valid_cacheable_result(42)

  def test_rejects_non_object_meta(self):
    assert not is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": 0, "cacheScope": "private", "_meta": "nope"}
    )

  def test_accepts_object_meta(self):
    assert is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": 0, "cacheScope": "private", "_meta": {"k": 1}}
    )

  def test_ttl_must_be_non_negative_integer(self):
    assert is_valid_cacheable_result({"resultType": "complete", "ttlMs": 0, "cacheScope": "private"})
    assert not is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": -1, "cacheScope": "private"}
    )
    assert not is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": 1.5, "cacheScope": "private"}
    )
    assert not is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": True, "cacheScope": "private"}
    )

  def test_scope_must_be_exactly_public_or_private(self):
    assert is_valid_cache_scope("public")
    assert is_valid_cache_scope("private")
    assert not is_valid_cache_scope("shared")
    assert not is_valid_cache_scope("PUBLIC")
    assert not is_valid_cache_scope(None)

  def test_cache_scopes_contains_exactly_public_and_private(self):
    assert sorted(CACHE_SCOPES) == ["private", "public"]


# ─── AC-19.2 — invalid/missing ttlMs → not cacheable / stale ──────────────────


class TestHintValidation:
  def test_valid(self):
    assert is_cache_hint_valid(0, "private")
    assert is_cache_hint_valid(5000, "public")
    assert is_cache_hint_valid(600000, "public")

  def test_invalid(self):
    assert not is_cache_hint_valid(-1, "public")
    assert not is_cache_hint_valid(1.5, "public")
    assert not is_cache_hint_valid(True, "public")  # bool is not an int ttl
    assert not is_cache_hint_valid(0, "secret")

  def test_false_for_string_ttl(self):
    assert not is_cache_hint_valid("600000", "public")

  def test_false_for_missing_ttl(self):
    assert not is_cache_hint_valid(None, "public")

  def test_false_for_unrecognized_scope(self):
    assert not is_cache_hint_valid(600000, "shared")

  def test_both_or_neither(self):
    assert has_both_or_neither_cache_hints({"ttlMs": 0, "cacheScope": "private"})
    assert has_both_or_neither_cache_hints({})
    assert has_both_or_neither_cache_hints({"resultType": "complete"})
    assert not has_both_or_neither_cache_hints({"ttlMs": 0})
    assert not has_both_or_neither_cache_hints({"cacheScope": "public"})


# ─── AC-19.3 / AC-19.13 / AC-19.15 — unrecognized/absent cacheScope → private ──


class TestScopeResolution:
  def test_resolve(self):
    assert resolve_cache_scope("public") == "public"
    assert resolve_cache_scope("private") == "private"
    assert resolve_cache_scope("weird") == "private"
    assert resolve_cache_scope("shared") == "private"
    assert resolve_cache_scope("PUBLIC") == "private"
    assert resolve_cache_scope("unknown") == "private"
    assert resolve_cache_scope("") == "private"
    assert resolve_cache_scope(None) == "private"

  def test_consistency(self):
    assert has_consistent_cache_scope([])
    assert has_consistent_cache_scope(["public"])
    assert has_consistent_cache_scope(["public", "public"])
    assert has_consistent_cache_scope(["public", "public", "public"])
    assert has_consistent_cache_scope(["private", "private"])
    assert not has_consistent_cache_scope(["public", "private"])
    assert not has_consistent_cache_scope(["private", "public", "private"])

  def test_effective(self):
    assert effective_cache_scope(["public", "public"]) == "public"
    assert effective_cache_scope(["private", "private"]) == "private"
    assert effective_cache_scope(["public", "private"]) == "private"
    assert effective_cache_scope(["public", "private", "public"]) == "private"

  def test_effective_empty_is_private(self):
    # Empty list is "consistent" but resolve(None) → private (safe default). (R-13.5-h)
    assert effective_cache_scope([]) == "private"


# ─── AC-19.5 / AC-19.6 / AC-19.7 / AC-19.10 — freshness ───────────────────────


class TestFreshness:
  def test_is_fresh(self):
    assert is_fresh(1000, received_at=100, now=500)
    assert not is_fresh(1000, received_at=100, now=1200)
    assert not is_fresh(0, received_at=100, now=100)  # ttl 0 is never fresh

  def test_ttl_zero_always_stale(self):
    assert not is_fresh(0, 0, 0)
    assert not is_fresh(0, 0, 9999999)

  def test_boundary_just_inside(self):
    assert is_fresh(500, received_at=1000, now=1000 + 499)

  def test_boundary_exact_expiry_is_stale(self):
    # now === receivedAt + ttlMs is expired (strict <).
    assert not is_fresh(500, received_at=1000, now=1000 + 500)

  def test_boundary_just_past(self):
    assert not is_fresh(500, received_at=1000, now=1000 + 501)

  def test_client_local_clock_only(self):
    received_at = 9999000
    ttl_ms = 1000
    assert is_fresh(ttl_ms, received_at, received_at + 999)
    assert not is_fresh(ttl_ms, received_at, received_at + 1000)

  def test_large_ttl_is_upper_bound_not_lower(self):
    received_at = 0
    large_ttl = sys.maxsize
    just_expired = received_at + large_ttl
    assert not is_fresh(large_ttl, received_at, just_expired)
    assert is_fresh(large_ttl, received_at, just_expired - 1)

  def test_expires_at(self):
    assert expires_at(1000, 100) == 1100
    assert expires_at(600000, 1000) == 601000


# ─── AC-19.16 … AC-19.19 — cacheable methods registry ─────────────────────────


class TestCacheableMethods:
  def test_each_cacheable_method(self):
    assert is_cacheable_method("tools/list")
    assert is_cacheable_method("prompts/list")
    assert is_cacheable_method("resources/list")
    assert is_cacheable_method("resources/templates/list")
    assert is_cacheable_method("resources/read")

  def test_exactly_five_methods(self):
    assert len(CACHEABLE_METHODS) == 5

  def test_non_cacheable_methods(self):
    assert not is_cacheable_method("tools/call")
    assert not is_cacheable_method("notifications/tools/list_changed")
    assert not is_cacheable_method("ping")


# ─── AC-19.21 — METHOD_TO_NOTIFICATION_MAP + methodsForNotification ────────────


class TestNotifications:
  def test_map_entries(self):
    assert METHOD_TO_NOTIFICATION_MAP["tools/list"] == "notifications/tools/list_changed"
    assert METHOD_TO_NOTIFICATION_MAP["prompts/list"] == "notifications/prompts/list_changed"
    assert METHOD_TO_NOTIFICATION_MAP["resources/list"] == "notifications/resources/list_changed"
    assert (
      METHOD_TO_NOTIFICATION_MAP["resources/templates/list"]
      == "notifications/resources/list_changed"
    )
    assert METHOD_TO_NOTIFICATION_MAP["resources/read"] == "notifications/resources/updated"

  def test_map_has_exactly_five_entries(self):
    assert len(METHOD_TO_NOTIFICATION_MAP) == 5

  def test_methods_for_notification(self):
    assert set(methods_for_notification("notifications/resources/list_changed")) == {
      "resources/list",
      "resources/templates/list",
    }
    assert methods_for_notification("notifications/tools/list_changed") == ["tools/list"]
    assert methods_for_notification("notifications/prompts/list_changed") == ["prompts/list"]
    assert methods_for_notification("notifications/resources/updated") == ["resources/read"]

  def test_methods_for_unknown_notification_is_empty(self):
    assert methods_for_notification("notifications/unknown") == []

  def test_cacheable_methods(self):
    assert is_cacheable_method("resources/read")
    assert not is_cacheable_method("tools/call")


# ─── ResponseCache (RC-3, RC-5, RC-9) ─────────────────────────────────────────


class TestResponseCache:
  def test_set_get_hit(self):
    cache = ResponseCache()
    cache.set("k", {"ttlMs": 1000, "cacheScope": "public", "x": 1}, received_at=0)
    hit = cache.get("k", now=500)
    assert hit.hit and hit.value["x"] == 1 and hit.cache_scope == "public"

  def test_missing_key_is_miss(self):
    cache = ResponseCache()
    assert not cache.get("missing", now=0).hit

  def test_stale_is_miss_and_evicted(self):
    cache = ResponseCache()
    cache.set("k", {"ttlMs": 100, "cacheScope": "private"}, received_at=0)
    assert not cache.get("k", now=1000).hit
    assert cache.size == 0  # evicted

  def test_expired_exactly_at_ttl_is_miss(self):
    cache = ResponseCache()
    cache.set("k", {"ttlMs": 100, "cacheScope": "private", "data": "d"}, received_at=0)
    assert not cache.get("k", now=100).hit  # expired at exactly ttlMs
    assert cache.size == 0

  def test_ttl_zero_stored_but_never_fresh(self):
    cache = ResponseCache()
    cache.set("k", {"ttlMs": 0, "cacheScope": "private"}, received_at=0)
    assert cache.size == 1
    assert not cache.get("k", now=0).hit

  def test_invalid_hint_not_stored(self):
    cache = ResponseCache()
    cache.set("k", {"ttlMs": -1, "cacheScope": "public"}, received_at=0)
    assert cache.size == 0

  def test_missing_hint_not_stored(self):
    cache = ResponseCache()
    cache.set("k", {"ttlMs": 100}, received_at=0)  # only ttlMs → both-or-neither fails
    assert cache.size == 0

  def test_unknown_scope_not_stored(self):
    cache = ResponseCache()
    # Invalid cacheScope → is_cache_hint_valid returns False → not stored. (RC-5)
    cache.set("k", {"ttlMs": 1000, "cacheScope": "unknown"}, received_at=0)
    assert cache.size == 0

  def test_invalidate_by_notification_evicts_pages(self):
    cache = ResponseCache()
    cache.set("tools/list", {"ttlMs": 1000, "cacheScope": "public"}, 0)
    cache.set("tools/list::page:cursor:2", {"ttlMs": 1000, "cacheScope": "public"}, 0)
    cache.set("prompts/list", {"ttlMs": 1000, "cacheScope": "public"}, 0)
    cache.invalidate_by_notification("notifications/tools/list_changed")
    assert cache.size == 1  # only prompts/list remains

  def test_invalidate_evicts_single_cursor_page(self):
    cache = ResponseCache()
    cache.set("tools/list::page:first", {"ttlMs": 60000, "cacheScope": "public", "data": "p1"}, 0)
    cache.invalidate_by_notification("notifications/tools/list_changed")
    assert not cache.get("tools/list::page:first", now=1000).hit
    assert cache.size == 0

  def test_invalidate_does_not_evict_unrelated_method(self):
    cache = ResponseCache()
    cache.set("tools/list::page:first", {"ttlMs": 60000, "cacheScope": "public", "d": "t"}, 0)
    cache.set("prompts/list::page:first", {"ttlMs": 60000, "cacheScope": "public", "d": "p"}, 0)
    cache.invalidate_by_notification("notifications/tools/list_changed")
    assert cache.size == 1
    assert cache.get("prompts/list::page:first", now=1000).hit

  def test_invalidate_resources_list_evicts_both_methods(self):
    cache = ResponseCache()
    cache.set("resources/list::page:first", {"ttlMs": 60000, "cacheScope": "public", "d": "r"}, 0)
    cache.set(
      "resources/templates/list::page:first",
      {"ttlMs": 60000, "cacheScope": "public", "d": "t"},
      0,
    )
    cache.invalidate_by_notification("notifications/resources/list_changed")
    assert cache.size == 0

  def test_invalidate_unknown_notification_is_noop(self):
    cache = ResponseCache()
    cache.set("tools/list::page:first", {"ttlMs": 60000, "cacheScope": "public", "d": "p1"}, 0)
    cache.invalidate_by_notification("notifications/unknown/event")
    assert cache.size == 1


# ─── AC-19.23 — per-page independent ttlMs ────────────────────────────────────


class TestPerPageTtl:
  def test_each_page_independent_ttl(self):
    page1 = {
      "resultType": "complete",
      "tools": [],
      "nextCursor": "C1",
      "ttlMs": 60000,
      "cacheScope": "public",
    }
    page2 = {"resultType": "complete", "tools": [], "ttlMs": 600000, "cacheScope": "public"}
    assert is_valid_cacheable_result(page1)
    assert is_valid_cacheable_result(page2)
    # Pages can expire at different times.
    assert is_fresh(60000, 0, 59999)
    assert not is_fresh(60000, 0, 60001)
    assert is_fresh(600000, 0, 60001)


# ─── AC-19.8 — latest-state seekers re-fetch ──────────────────────────────────


class TestRefetchForLatestState:
  def test_is_fresh_true_does_not_prohibit_refetch(self):
    # R-13.2-h/-i: even while fresh, a client needing latest state MAY re-fetch.
    # The schema layer exposes no "force re-fetch" — freshness is not a re-fetch ban.
    assert is_fresh(600000, received_at=1000, now=1001)


# ─── AC-19.9 — client may ignore ttlMs / re-fetch early ───────────────────────


class TestClientMayDeclineToCache:
  def test_valid_hint_does_not_obligate_caching(self):
    # R-13.2-i: valid hints are hints; whether to cache is a client policy decision.
    assert is_cache_hint_valid(600000, "public")


# ─── AC-19.10 — large ttlMs is an upper bound, not a lower bound ───────────────


class TestTtlIsUpperBound:
  def test_large_ttl_not_extended_after_elapsing(self):
    # R-13.2-j: after the interval the result is stale regardless of how large ttl is.
    received_at = 0
    large_ttl = sys.maxsize
    just_expired = received_at + large_ttl
    assert not is_fresh(large_ttl, received_at, just_expired)
    assert is_fresh(large_ttl, received_at, just_expired - 1)


# ─── AC-19.11 — server chooses ttlMs to reflect data stability ────────────────


class TestTtlReflectsDataStability:
  def test_accepts_large_ttl_for_stable_data(self):
    assert is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": 86400000, "cacheScope": "public", "tools": []}
    )

  def test_accepts_zero_ttl_for_volatile_data(self):
    assert is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": 0, "cacheScope": "private", "contents": []}
    )


# ─── AC-19.12 — public result may be served to any user ───────────────────────


class TestPublicScopeSemantics:
  def test_public_is_a_valid_scope_for_shared_caches(self):
    # R-13.3-a: "public" may be reused for any user, subject to freshness.
    assert resolve_cache_scope("public") == "public"
    assert is_valid_cache_scope("public")


# ─── AC-19.13 — private result: originating context only ──────────────────────


class TestPrivateScopeSemantics:
  def test_private_is_the_conservative_default(self):
    # R-13.3-b/-c: "private" reuse is limited to the originating context.
    assert resolve_cache_scope("private") == "private"

  def test_unknown_values_default_to_private(self):
    assert resolve_cache_scope("unknown") == "private"
    assert resolve_cache_scope(None) == "private"


# ─── AC-19.14 — cacheScope is not access control ──────────────────────────────


class TestScopeIsNotAccessControl:
  def test_schema_does_not_enforce_entitlement(self):
    # R-13.3-d/-e: both scopes are valid wire values; entitlement enforcement is a
    # server obligation outside the schema/validation layer.
    assert is_valid_cacheable_result(
      {"resultType": "complete", "ttlMs": 600000, "cacheScope": "public"}
    )


# ─── AC-19.18 — cacheScope assignment rules ───────────────────────────────────


class TestScopeAssignmentRules:
  def test_public_is_a_valid_wire_value(self):
    # R-13.4-c/-d: "public" only when identical for all requesters — a server policy;
    # the validation layer accepts it as a wire value.
    assert is_valid_cache_scope("public")

  def test_private_is_a_valid_wire_value(self):
    assert is_valid_cache_scope("private")


# ─── AC-19.19 — hints on non-cacheable methods are ignored ────────────────────


class TestHintsOnNonCacheableMethodsIgnored:
  def test_non_cacheable_methods(self):
    # R-13.4-e: receivers ignore ttlMs/cacheScope on non-cacheable methods.
    assert not is_cacheable_method("tools/call")
    assert not is_cacheable_method("notifications/tools/list_changed")
    assert not is_cacheable_method("ping")


# ─── AC-19.20 — client must respect BOTH when honoring hints ──────────────────


class TestClientCachingPolicy:
  def test_freshness_and_scope_are_independent_both_required(self):
    # R-13.4-f/-g: a client that honors hints must satisfy BOTH the freshness bound
    # and the sharing scope for reuse.
    received_at = 1000
    now = 1500
    ttl_ms = 1000  # still fresh
    scope = resolve_cache_scope("public")
    assert is_fresh(ttl_ms, received_at, now)
    assert scope == "public"


# ─── AC-19.21 — change notification takes precedence over fresh ttlMs ──────────


class TestNotificationPrecedence:
  def test_notification_takes_precedence_over_fresh_ttl(self):
    # R-13.5-a/-b/-c: even when isFresh is True, a relevant notification should
    # trigger a re-fetch. ResponseCache models this via invalidate_by_notification.
    cache = ResponseCache()
    cache.set("tools/list", {"ttlMs": 600000, "cacheScope": "public", "x": 1}, received_at=1000)
    # Still fresh by a wide margin.
    assert cache.get("tools/list", now=1001).hit
    # A relevant notification invalidates regardless of remaining freshness.
    cache.invalidate_by_notification("notifications/tools/list_changed")
    assert not cache.get("tools/list", now=1001).hit


# ─── AC-19.22 — absence of notification does not extend ttlMs ──────────────────


class TestNotificationAbsenceDoesNotExtendFreshness:
  def test_stale_after_ttl_regardless_of_notification_history(self):
    # R-13.5-d: the absence of a notification does not keep an entry fresh past ttlMs.
    received_at = 0
    ttl_ms = 1000
    elapsed = received_at + ttl_ms  # exactly expired
    assert not is_fresh(ttl_ms, received_at, elapsed)


# ─── AC-19.24 — consistent cacheScope across pages ────────────────────────────


class TestConsistentScopeAcrossPages:
  def test_homogeneous_scopes_are_consistent(self):
    assert has_consistent_cache_scope(["public", "public", "public"])
    assert has_consistent_cache_scope(["private", "private"])

  def test_mixed_scopes_are_inconsistent(self):
    assert not has_consistent_cache_scope(["public", "private"])
    assert not has_consistent_cache_scope(["private", "public", "private"])

  def test_empty_or_single_page_is_consistent(self):
    assert has_consistent_cache_scope([])
    assert has_consistent_cache_scope(["public"])


# ─── AC-19.25 — inconsistent cacheScope → treat as private ────────────────────


class TestInconsistentScopeIsPrivate:
  def test_mixed_scopes_resolve_to_private(self):
    assert effective_cache_scope(["public", "private", "public"]) == "private"

  def test_consistent_scopes_resolve_to_common_value(self):
    assert effective_cache_scope(["public", "public"]) == "public"
    assert effective_cache_scope(["private", "private"]) == "private"

  def test_empty_list_resolves_to_private(self):
    assert effective_cache_scope([]) == "private"


# ─── AC-19.26 — cursor is not a cache discriminator ───────────────────────────


class TestCursorIsNotACacheDiscriminator:
  def test_is_fresh_takes_no_cursor_parameter(self):
    # R-13.5-i: the opaque cursor must not influence cache logic. The freshness API
    # exposes only (ttl_ms, received_at, now) — no cursor parameter.
    params = list(inspect.signature(is_fresh).parameters)
    assert params == ["ttl_ms", "received_at", "now"]
    assert len(params) == 3

  def test_resolve_cache_scope_takes_no_cursor(self):
    # Scope resolution is keyed by the scope value alone, not the cursor.
    assert len(inspect.signature(resolve_cache_scope).parameters) == 1


# ─── §13.6 — wire examples ────────────────────────────────────────────────────


class TestWireExamples:
  def test_tools_list_page_with_hints(self):
    result = {
      "resultType": "complete",
      "tools": [
        {
          "name": "get_weather",
          "title": "Get Weather",
          "description": "Return the current weather for a city.",
          "inputSchema": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
          },
        }
      ],
      "nextCursor": "eyJwYWdlIjogMn0=",
      "ttlMs": 600000,
      "cacheScope": "public",
    }
    assert is_valid_cacheable_result(result)
    assert result["ttlMs"] == 600000
    assert result["cacheScope"] == "public"

  def test_resources_read_no_cache(self):
    result = {
      "resultType": "complete",
      "contents": [
        {
          "uri": "file:///home/user/report.txt",
          "mimeType": "text/plain",
          "text": "Quarterly report.",
        }
      ],
      "ttlMs": 0,
      "cacheScope": "private",
    }
    assert is_valid_cacheable_result(result)
    assert not is_fresh(result["ttlMs"], 0, 0)
