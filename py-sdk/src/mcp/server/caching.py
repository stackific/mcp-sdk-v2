"""Server-side caching-hint helper (§13).

S6 — a tiny helper that sets the **top-level** caching fields (``ttlMs`` /
``cacheScope``) on a cacheable-method result so a spec-aware client MAY serve the
cached value until the TTL lapses. Purely additive and edge-safe.

Per §13.4 the hints are top-level result fields (NOT inside ``_meta``), and per §13.3
``cacheScope`` is exactly ``"public"`` or ``"private"``. The ``McpServer`` already stamps
default hints on the five cacheable methods; use :func:`with_cache_hints` to override them
for a specific result (e.g. a long-lived ``resources/read``). (§13.3, §13.4)

This mirrors the TS ``withCacheHints``: it sets a field ONLY when the caller supplies it,
applies no privacy fallback or coercion (the §13.1-e fallback is a *consumption*-time
concern handled by :func:`mcp.protocol.caching.resolve_cache_scope`), and never disturbs
the result's other members.
"""

from __future__ import annotations

# A sentinel distinct from ``None``: ``None`` is not a valid hint value, but the TS helper
# keys off ``undefined`` (absence) — passing ``cacheScope: undefined`` is the same as
# omitting it. ``_UNSET`` is the Python analogue of that absent/``undefined`` argument.
_UNSET = object()


def with_cache_hints(result: dict, *, ttl_ms: object = _UNSET, cache_scope: object = _UNSET) -> dict:
  """Return a copy of ``result`` with the top-level ``ttlMs`` / ``cacheScope`` cache hints
  set. (§13.4)

  Mirrors the TS ``withCacheHints<T>(result, hints)``: each hint is applied to the returned
  copy ONLY when the caller supplies it (the Python analogue of TS ``!== undefined``).
  Omitting both args returns a plain copy of ``result`` unchanged; supplying one sets only
  that field; supplying both sets both. No privacy fallback or validation is performed here
  — the values are written through verbatim, exactly as the TS spread does. (§13.3, §13.4)
  """
  out = {**result}
  if ttl_ms is not _UNSET:
    out["ttlMs"] = ttl_ms
  if cache_scope is not _UNSET:
    out["cacheScope"] = cache_scope
  return out
