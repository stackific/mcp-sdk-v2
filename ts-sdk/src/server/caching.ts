/**
 * S6 — response caching hints (§13). A tiny helper that sets the **top-level**
 * caching fields (`ttlMs`, `cacheScope`) on a cacheable-method result so a
 * spec-aware client MAY serve the cached value until the TTL lapses. Purely
 * additive and edge-safe.
 *
 * Per §13.4 the hints are top-level result fields (NOT inside `_meta`), and per
 * §13.3 `cacheScope` is exactly `"public"` or `"private"`. {@link McpServer}
 * already stamps default hints on the five cacheable methods; use this to
 * override them for a specific result (e.g. a long-lived `resources/read`).
 */
import type { CacheScope } from '../protocol/caching.js';

/** Top-level caching hints on a cacheable result. (§13.1–§13.4) */
export interface CacheHints {
  /** Freshness lifetime in ms; a client MAY reuse the cached result within it. (§13.2) */
  ttlMs?: number;
  /** Cache-sharing scope — exactly `"public"` or `"private"`. (§13.3) */
  cacheScope?: CacheScope;
}

/** Returns a copy of `result` with the top-level caching fields set. (§13.4) */
export function withCacheHints<T extends Record<string, unknown>>(result: T, hints: CacheHints): T {
  return {
    ...result,
    ...(hints.ttlMs !== undefined ? { ttlMs: hints.ttlMs } : {}),
    ...(hints.cacheScope !== undefined ? { cacheScope: hints.cacheScope } : {}),
  };
}
