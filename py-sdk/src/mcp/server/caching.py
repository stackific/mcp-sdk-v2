"""Server-side caching-hint helper (§13).

A result MAY carry top-level freshness hints — ``ttlMs`` (non-negative integer
lifetime) and ``cacheScope`` (``"public"`` / ``"private"``). :func:`with_cache_hints`
stamps them onto a result without disturbing its other members, so a tool can opt a
single result into caching. (§13.3, §13.4)
"""

from __future__ import annotations


def with_cache_hints(result: dict, *, ttl_ms: int, cache_scope: str = "private") -> dict:
  """Return ``result`` with the top-level ``ttlMs`` + ``cacheScope`` cache hints set. (§13.4)"""
  if cache_scope not in ("public", "private"):
    cache_scope = "private"
  return {**result, "ttlMs": ttl_ms, "cacheScope": cache_scope}
