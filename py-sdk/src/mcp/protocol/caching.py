"""Response caching hints (§13).

The ``CacheableResult`` fields (``ttlMs`` / ``cacheScope``) and runtime utilities for
validating hints, computing freshness from the client's local clock, resolving the
``cacheScope`` privacy fallback, detecting inconsistent scope across pages, and the
method → invalidation-notification map, plus a minimal in-memory ``ResponseCache``.

Caching hints are purely advisory: they never alter a result's meaning, never function
as access control, and clients MAY ignore them. (R-13.4-f, R-13.3-d, R-13.3-e)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import Field, StrictInt

from mcp._model import McpModel, validates

# ─── CacheScope (§13.3) ───────────────────────────────────────────────────────

#: The two sharing-scope values as a field type (the analogue of the TS ``CacheScopeSchema``).
CacheScope = Literal["public", "private"]

#: The two sharing-scope values for a cached result. (§13.3) Unknown/absent → "private".
#:
#: ``"public"`` — any client or shared intermediary MAY reuse the stored copy for any
#: user, subject to the freshness interval. (R-13.3-a)
#:
#: ``"private"`` — may be stored and reused only within the single authorization context
#: that made the request; a shared intermediary MUST NOT serve a stored ``"private"``
#: copy to a different user. (R-13.3-b, R-13.3-c)
#:
#: Any unrecognized or absent value MUST be treated as ``"private"``. (R-13.1-e)
CACHE_SCOPES = ("public", "private")


def is_valid_cache_scope(value: object) -> bool:
  """Return ``True`` only when ``value`` is exactly the case-sensitive string
  ``"public"`` or ``"private"``. (§13.3, R-13.1-d)

  This is the Python analogue of the TS ``CacheScopeSchema`` zod enum: it is strict
  (``"PUBLIC"``, ``"shared"``, ``None``, etc. all fail). Use :func:`resolve_cache_scope`
  when you want the privacy fallback instead of a boolean check.
  """
  return value in CACHE_SCOPES


def _is_int(value: object) -> bool:
  return isinstance(value, int) and not isinstance(value, bool)


def is_cache_hint_valid(ttl_ms: object, cache_scope: object) -> bool:
  """Return ``True`` when BOTH hints are present and valid: non-negative integer
  ``ttlMs`` and ``cacheScope`` exactly ``"public"`` or ``"private"``. (R-13.1-a/-b/-d)
  """
  if not _is_int(ttl_ms) or ttl_ms < 0:
    return False
  return cache_scope in ("public", "private")


def has_both_or_neither_cache_hints(result: dict) -> bool:
  """Return ``True`` when ``result`` carries BOTH hint fields or NEITHER. A server MUST
  NOT emit exactly one without the other. (R-13.1-g)
  """
  return ("ttlMs" in result) == ("cacheScope" in result)


# ─── CacheableResult (§13.1) ──────────────────────────────────────────────────

class CacheableResult(McpModel):
  """A result augmented with the two REQUIRED caching-hint fields (§13.1) — the Python
  analogue of the TS ``CacheableResultSchema``.

  * REQUIRED string ``resultType`` (the §3.6 / S04 base discriminator).
  * REQUIRED non-negative integer ``ttlMs`` (``0`` allowed; negatives / non-integers /
    ``bool`` rejected — ``StrictInt`` accepts only a real ``int``). (R-13.1-a, R-13.2-a)
  * REQUIRED ``cacheScope`` exactly ``"public"`` or ``"private"``. (R-13.1-d)
  * OPTIONAL object ``_meta``.

  Both hint fields MUST be present together (R-13.1-g); method-specific payload members
  (``tools`` / ``contents`` / ``nextCursor`` …) pass through (forward-compatible).
  """

  result_type: str
  ttl_ms: Annotated[StrictInt, Field(ge=0)]
  cache_scope: CacheScope
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_cacheable_result(value: object) -> bool:
  """Return ``True`` for a valid ``CacheableResult`` wire object. (§13.1)

  The base ``Result`` shape augmented with the two REQUIRED caching-hint fields, both of
  which MUST appear and be valid (see :class:`CacheableResult`). (R-13.1-a/-d/-g)
  """
  return validates(CacheableResult, value)


def resolve_cache_scope(scope: object) -> str:
  """Return ``"public"``/``"private"``, applying the privacy fallback for any
  unrecognized or absent value. (R-13.1-e, R-13.3-h)
  """
  return scope if scope in ("public", "private") else "private"


def is_fresh(ttl_ms: int, received_at: float, now: float) -> bool:
  """Return ``True`` when the result is still within its freshness window:
  ``ttlMs > 0`` AND ``now < received_at + ttlMs``. Uses only the client's local clock.
  (R-13.2-e/-f/-g)
  """
  if ttl_ms <= 0:
    return False
  return now < received_at + ttl_ms


def expires_at(ttl_ms: int, received_at: float) -> float:
  """Return the absolute timestamp after which the result is stale. (R-13.2-e/-f)"""
  return received_at + ttl_ms


def has_consistent_cache_scope(scopes: list[str]) -> bool:
  """Return ``True`` when all ``cacheScope`` values across a list's pages are identical
  (no mixing of public/private). (R-13.5-f/-g)
  """
  if not scopes:
    return True
  return all(s == scopes[0] for s in scopes)


def effective_cache_scope(scopes: list[str]) -> str:
  """Return the scope to apply across a multi-page list; ``"private"`` if inconsistent.
  (R-13.5-h)
  """
  if not has_consistent_cache_scope(scopes):
    return "private"
  # An empty (but trivially consistent) list has no first element; TS reads
  # ``scopes[0]`` as ``undefined`` and resolves to the safe ``"private"`` default.
  return resolve_cache_scope(scopes[0] if scopes else None)


#: Maps each cacheable method to the notification that invalidates its cached result. (§13.5)
METHOD_TO_NOTIFICATION_MAP = {
  "tools/list": "notifications/tools/list_changed",
  "prompts/list": "notifications/prompts/list_changed",
  "resources/list": "notifications/resources/list_changed",
  "resources/templates/list": "notifications/resources/list_changed",
  "resources/read": "notifications/resources/updated",
}


def methods_for_notification(notification: str) -> list[str]:
  """Return the method names whose cached results should be invalidated on
  ``notification``. (R-13.5-j)
  """
  return [m for m, n in METHOD_TO_NOTIFICATION_MAP.items() if n == notification]


@dataclass
class _StoredEntry:
  received_at: float
  ttl_ms: int
  cache_scope: str
  value: dict


@dataclass(frozen=True)
class CacheGetResult:
  """Outcome of :meth:`ResponseCache.get`: ``hit`` plus ``value``/``cache_scope`` on a hit."""

  hit: bool
  value: dict | None = None
  cache_scope: str | None = None


class ResponseCache:
  """A minimal in-memory response cache wired to :func:`is_fresh`,
  :func:`resolve_cache_scope`, and the method→notification invalidation map. (§13)
  """

  def __init__(self) -> None:
    self._store: dict[str, _StoredEntry] = {}

  def set(self, key: str, value: dict, received_at: float) -> None:
    """Store ``value`` under ``key``; skipped when a hint is missing or invalid. A
    ``ttlMs == 0`` entry is stored but never served fresh. (R-13.1-g)
    """
    if not has_both_or_neither_cache_hints(value):
      return
    ttl_ms = value.get("ttlMs")
    raw_scope = value.get("cacheScope")
    if not is_cache_hint_valid(ttl_ms, raw_scope):
      return
    self._store[key] = _StoredEntry(received_at, ttl_ms, resolve_cache_scope(raw_scope), value)

  def get(self, key: str, now: float) -> CacheGetResult:
    """Return the entry for ``key`` if fresh at ``now``; otherwise miss + evict the stale
    entry. (R-13.2-e)
    """
    entry = self._store.get(key)
    if entry is None:
      return CacheGetResult(False)
    if not is_fresh(entry.ttl_ms, entry.received_at, now):
      del self._store[key]
      return CacheGetResult(False)
    return CacheGetResult(True, value=entry.value, cache_scope=entry.cache_scope)

  def invalidate_by_notification(self, notification: str) -> None:
    """Evict all entries (incl. paginated cursor pages) for every method mapped to
    ``notification``. (R-13.5-j)
    """
    for method in methods_for_notification(notification):
      prefix = f"{method}::"
      for key in list(self._store.keys()):
        if key == method or key.startswith(prefix):
          del self._store[key]

  @property
  def size(self) -> int:
    """Number of entries currently stored (may include ``ttlMs == 0`` entries)."""
    return len(self._store)


#: The five methods whose results carry caching hints. (§13.4)
CACHEABLE_METHODS = frozenset(
  {"tools/list", "prompts/list", "resources/list", "resources/templates/list", "resources/read"}
)


def is_cacheable_method(method: str) -> bool:
  """Return ``True`` when ``method`` is one of the five methods that carry caching hints."""
  return method in CACHEABLE_METHODS
