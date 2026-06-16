"""Tests for the server-side cache-hint helper :func:`with_cache_hints` (§13).

The TS counterpart ``ts-sdk/src/server/caching.ts`` has no dedicated test file (the only
caching suite is ``__tests__/protocol/caching.test.ts``); these cases are derived directly
from the TS ``withCacheHints<T>(result, hints)`` behavior and the §13.3/§13.4 normative
rules, mirroring EVERY observable branch of the TS spread plus Python edge cases.

Behavior under test (matching TS exactly):
  * each hint is applied ONLY when supplied (TS ``hints.x !== undefined`` → Python ``_UNSET``);
  * a field is set verbatim with NO privacy fallback / coercion / validation;
  * the result is COPIED — the input is never mutated;
  * all other members survive untouched (the ``...result`` spread). (§13.3, §13.4)
"""

import inspect

from mcp.server.caching import with_cache_hints


# ─── both hints supplied → top-level ttlMs + cacheScope set (§13.4) ────────────


class TestBothHintsSupplied:
  def test_sets_both_top_level_fields(self):
    out = with_cache_hints({"resultType": "complete"}, ttl_ms=600000, cache_scope="public")
    assert out["ttlMs"] == 600000
    assert out["cacheScope"] == "public"

  def test_hints_are_top_level_not_inside_meta(self):
    # §13.4 — hints are top-level result fields, NEVER nested under _meta.
    out = with_cache_hints({"resultType": "complete", "_meta": {"k": 1}}, ttl_ms=5000, cache_scope="private")
    assert "ttlMs" in out and "cacheScope" in out
    assert out["_meta"] == {"k": 1}
    assert "ttlMs" not in out["_meta"]
    assert "cacheScope" not in out["_meta"]

  def test_preserves_payload_members(self):
    # The TS ``...result`` spread keeps every method-specific member (tools/contents/…).
    out = with_cache_hints(
      {"resultType": "complete", "tools": [{"name": "t"}], "nextCursor": "abc"},
      ttl_ms=1000,
      cache_scope="public",
    )
    assert out["tools"] == [{"name": "t"}]
    assert out["nextCursor"] == "abc"
    assert out["resultType"] == "complete"

  def test_zero_ttl_is_written_verbatim(self):
    # §13.2 — ttlMs == 0 is a valid hint ("immediately stale"); the helper must not drop it.
    out = with_cache_hints({"resultType": "complete"}, ttl_ms=0, cache_scope="private")
    assert out["ttlMs"] == 0
    assert out["cacheScope"] == "private"


# ─── single hint supplied → only that field set (TS conditional spread) ────────


class TestSingleHintSupplied:
  def test_only_ttl_sets_only_ttl(self):
    out = with_cache_hints({"resultType": "complete"}, ttl_ms=300000)
    assert out["ttlMs"] == 300000
    assert "cacheScope" not in out

  def test_only_scope_sets_only_scope(self):
    out = with_cache_hints({"resultType": "complete"}, cache_scope="public")
    assert out["cacheScope"] == "public"
    assert "ttlMs" not in out

  def test_only_ttl_zero_is_applied(self):
    out = with_cache_hints({"resultType": "complete"}, ttl_ms=0)
    assert out["ttlMs"] == 0
    assert "cacheScope" not in out


# ─── no hints supplied → unchanged copy (TS empty spreads) ─────────────────────


class TestNoHintsSupplied:
  def test_returns_unchanged_copy(self):
    src = {"resultType": "complete", "tools": []}
    out = with_cache_hints(src)
    assert out == src
    assert "ttlMs" not in out
    assert "cacheScope" not in out

  def test_returns_a_distinct_object(self):
    src = {"resultType": "complete"}
    out = with_cache_hints(src)
    assert out is not src


# ─── input is never mutated (TS returns a NEW object) ──────────────────────────


class TestImmutability:
  def test_does_not_mutate_input_when_setting_both(self):
    src = {"resultType": "complete"}
    with_cache_hints(src, ttl_ms=5000, cache_scope="public")
    assert "ttlMs" not in src
    assert "cacheScope" not in src

  def test_returned_object_is_a_distinct_copy(self):
    src = {"resultType": "complete"}
    out = with_cache_hints(src, ttl_ms=5000, cache_scope="public")
    assert out is not src

  def test_overrides_existing_hints_without_touching_input(self):
    # McpServer stamps defaults; the helper overrides them on the copy only.
    src = {"resultType": "complete", "ttlMs": 0, "cacheScope": "private"}
    out = with_cache_hints(src, ttl_ms=600000, cache_scope="public")
    assert out["ttlMs"] == 600000
    assert out["cacheScope"] == "public"
    assert src["ttlMs"] == 0
    assert src["cacheScope"] == "private"

  def test_partial_override_leaves_other_existing_hint(self):
    # Supplying only ttlMs overrides ttlMs but leaves a pre-existing cacheScope intact.
    src = {"resultType": "complete", "ttlMs": 0, "cacheScope": "private"}
    out = with_cache_hints(src, ttl_ms=600000)
    assert out["ttlMs"] == 600000
    assert out["cacheScope"] == "private"


# ─── verbatim write: NO fallback / coercion / validation (matches TS spread) ───


class TestVerbatimNoCoercion:
  def test_unknown_scope_is_written_through_unchanged(self):
    # The TS helper performs NO §13.1-e privacy fallback — that is a consumption-time
    # concern (resolve_cache_scope). The helper writes whatever the caller passes.
    out = with_cache_hints({"resultType": "complete"}, cache_scope="shared")
    assert out["cacheScope"] == "shared"

  def test_uppercase_scope_is_not_normalized(self):
    out = with_cache_hints({"resultType": "complete"}, cache_scope="PUBLIC")
    assert out["cacheScope"] == "PUBLIC"

  def test_negative_ttl_is_written_through(self):
    out = with_cache_hints({"resultType": "complete"}, ttl_ms=-1)
    assert out["ttlMs"] == -1

  def test_float_ttl_is_written_through(self):
    out = with_cache_hints({"resultType": "complete"}, ttl_ms=1.5)
    assert out["ttlMs"] == 1.5


# ─── shallow-copy semantics (TS object spread is shallow) ──────────────────────


class TestShallowCopy:
  def test_nested_members_are_shared_by_reference(self):
    # The TS spread is shallow; nested objects/arrays are shared, not deep-copied.
    nested = [{"name": "t"}]
    out = with_cache_hints({"resultType": "complete", "tools": nested}, ttl_ms=5000, cache_scope="public")
    assert out["tools"] is nested


# ─── public surface / signature parity with TS withCacheHints ──────────────────


class TestPublicSurface:
  def test_keyword_only_hint_parameters(self):
    sig = inspect.signature(with_cache_hints)
    params = sig.parameters
    assert list(params) == ["result", "ttl_ms", "cache_scope"]
    assert params["ttl_ms"].kind is inspect.Parameter.KEYWORD_ONLY
    assert params["cache_scope"].kind is inspect.Parameter.KEYWORD_ONLY

  def test_hints_are_optional(self):
    # TS CacheHints has both fields optional → callable with neither.
    assert with_cache_hints({"resultType": "complete"}) == {"resultType": "complete"}
