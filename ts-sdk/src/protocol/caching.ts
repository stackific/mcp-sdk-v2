/**
 * S19 — Response caching hints (§13).
 *
 * Defines the `CacheableResult` shape and the runtime utilities for:
 *   - Validating caching-hint fields (`ttlMs`, `cacheScope`)
 *   - Computing freshness from the client's local clock
 *   - Resolving `cacheScope` with the privacy fallback
 *   - Detecting inconsistent `cacheScope` across pages of one list
 *   - Identifying the five methods whose results carry hints
 *
 * Caching hints are purely advisory: they never alter a result's meaning,
 * never function as access control, and clients MAY ignore them entirely.
 * (R-13.4-f, R-13.3-d, R-13.3-e)
 */

import { z } from 'zod';
import { ResultTypeSchema } from '../jsonrpc/payload.js';

// ─── CacheScope ───────────────────────────────────────────────────────────────

/**
 * The two sharing-scope values for a cached result. (§13.3)
 *
 * `"public"` — any client or shared intermediary may reuse the stored copy
 * for any user, subject to the freshness interval. (R-13.3-a)
 *
 * `"private"` — may be stored and reused only within the single authorization
 * context that made the request. A shared intermediary MUST NOT serve a stored
 * `"private"` copy to a different user. (R-13.3-b, R-13.3-c)
 *
 * Any unrecognized or absent value MUST be treated as `"private"`. (R-13.1-e)
 */
export const CACHE_SCOPES = ['public', 'private'] as const;
export const CacheScopeSchema = z.enum(CACHE_SCOPES);
export type CacheScope = z.infer<typeof CacheScopeSchema>;

// ─── CacheableResult ─────────────────────────────────────────────────────────

/**
 * A result that augments the base `Result` shape with two advisory caching
 * fields. (§13, R-13.1-a, R-13.1-d)
 *
 * `ttlMs` (REQUIRED on cacheable results): non-negative integer freshness hint
 * in milliseconds. `0` means immediately stale; `N > 0` means fresh for N ms
 * from the client's local receive time. (R-13.2-a, R-13.2-e)
 *
 * `cacheScope` (REQUIRED on cacheable results): `"public"` or `"private"`.
 * (R-13.1-d)
 *
 * Both fields MUST appear together: a server MUST NOT emit one without the
 * other on results specified to carry caching hints. (R-13.1-g)
 *
 * `.passthrough()` preserves method-specific payload members.
 */
export const CacheableResultSchema = z
  .object({
    /** REQUIRED base discriminator. (§3.6 / S04) */
    resultType: ResultTypeSchema,
    /** OPTIONAL metadata. */
    _meta: z.record(z.unknown()).optional(),
    /**
     * REQUIRED non-negative integer freshness hint in milliseconds. (R-13.1-a, R-13.2-a)
     * `0` = immediately stale; `N > 0` = fresh for N ms from local receive time.
     */
    ttlMs: z.number().int().nonnegative(),
    /**
     * REQUIRED sharing scope. Must be exactly `"public"` or `"private"`.
     * (R-13.1-d)
     */
    cacheScope: CacheScopeSchema,
  })
  .passthrough();

export type CacheableResult = z.infer<typeof CacheableResultSchema>;

// ─── Hint validation ──────────────────────────────────────────────────────────

/**
 * Returns `true` when BOTH caching hint fields are present and valid.
 * (R-13.1-a, R-13.1-b, R-13.1-d)
 *
 * A receiver MUST NOT treat a result as cacheable when `ttlMs` is negative,
 * non-integer, or missing, and MUST treat `cacheScope` as `"private"` when
 * the value is unrecognized or missing. (R-13.1-b, R-13.1-e)
 *
 * @param ttlMs - The raw value of the `ttlMs` field from the result.
 * @param cacheScope - The raw value of the `cacheScope` field from the result.
 */
export function isCacheHintValid(ttlMs: unknown, cacheScope: unknown): boolean {
  if (
    typeof ttlMs !== 'number' ||
    !Number.isInteger(ttlMs) ||
    ttlMs < 0
  ) {
    return false;
  }
  return cacheScope === 'public' || cacheScope === 'private';
}

/**
 * Returns `true` when a result object carries BOTH caching-hint fields (or
 * neither). A server MUST NOT emit exactly one without the other. (R-13.1-g)
 *
 * Pass a raw result object; this is a conformance check on server output.
 */
export function hasBothOrNeitherCacheHints(result: Record<string, unknown>): boolean {
  const hasTtl = 'ttlMs' in result;
  const hasScope = 'cacheScope' in result;
  return hasTtl === hasScope;
}

// ─── CacheScope resolution ────────────────────────────────────────────────────

/**
 * Returns `"public"` or `"private"`, applying the privacy fallback for any
 * unrecognized or absent value. (R-13.1-e, R-13.3-h)
 *
 * A receiver that cannot reliably distinguish authorization contexts MUST treat
 * every cached result as `"private"`.
 */
export function resolveCacheScope(scope: unknown): CacheScope {
  if (scope === 'public' || scope === 'private') return scope;
  return 'private';
}

// ─── Freshness computation ────────────────────────────────────────────────────

/**
 * Returns `true` when the result is still within its freshness window.
 * (R-13.2-e, R-13.2-f)
 *
 * Formula: `(ttlMs > 0) AND (now < receivedAt + ttlMs)`.
 *
 * A client MUST NOT assume the client and server clocks agree; the computation
 * uses only the client's local `receivedAt` and the `ttlMs` value. (R-13.2-g)
 *
 * @param ttlMs - Non-negative freshness hint from the result.
 * @param receivedAt - The client's local timestamp (ms since epoch) when the
 *   response was received.
 * @param now - The current client-local timestamp (ms since epoch).
 */
export function isFresh(ttlMs: number, receivedAt: number, now: number): boolean {
  if (ttlMs <= 0) return false;
  return now < receivedAt + ttlMs;
}

/**
 * Computes `expiresAt` — the absolute timestamp after which the result is stale.
 * (R-13.2-e, R-13.2-f)
 *
 * @param ttlMs - Non-negative freshness hint.
 * @param receivedAt - Local receive timestamp in ms.
 */
export function expiresAt(ttlMs: number, receivedAt: number): number {
  return receivedAt + ttlMs;
}

// ─── Page-scope consistency ───────────────────────────────────────────────────

/**
 * Returns `true` when all `cacheScope` values across the pages of one logical
 * list are identical (no mixing of `"public"` and `"private"`). (R-13.5-f, R-13.5-g)
 *
 * A server MUST NOT mix `"public"` and `"private"` across pages. When a client
 * observes inconsistency it MUST treat the entire list as `"private"`. (R-13.5-h)
 */
export function hasConsistentCacheScope(scopes: ReadonlyArray<string>): boolean {
  if (scopes.length === 0) return true;
  const first = scopes[0];
  return scopes.every((s) => s === first);
}

/**
 * Given the `cacheScope` values observed across a multi-page list, returns the
 * effective scope to apply. If inconsistent, returns `"private"`. (R-13.5-h)
 */
export function effectiveCacheScope(scopes: ReadonlyArray<string>): CacheScope {
  if (!hasConsistentCacheScope(scopes)) return 'private';
  return resolveCacheScope(scopes[0]);
}

// ─── Method → notification invalidation map ───────────────────────────────────

/**
 * Maps each cacheable method name to the notification that signals a change.
 * When the notification arrives the client MUST discard the cached result and
 * re-fetch. (§13.5, R-13.5-a)
 */
export const METHOD_TO_NOTIFICATION_MAP: Readonly<Record<string, string>> = {
  'tools/list': 'notifications/tools/list_changed',
  'prompts/list': 'notifications/prompts/list_changed',
  'resources/list': 'notifications/resources/list_changed',
  'resources/templates/list': 'notifications/resources/list_changed',
  'resources/read': 'notifications/resources/updated',
};

/**
 * Returns the method names whose cached results should be invalidated when
 * `notification` is received. (§13.5, R-13.5-a)
 */
export function methodsForNotification(notification: string): ReadonlyArray<string> {
  return Object.entries(METHOD_TO_NOTIFICATION_MAP)
    .filter(([, n]) => n === notification)
    .map(([m]) => m);
}

// ─── ResponseCache ────────────────────────────────────────────────────────────

interface StoredEntry {
  readonly receivedAt: number;
  readonly ttlMs: number;
  readonly cacheScope: CacheScope;
  readonly value: Record<string, unknown>;
}

/** Result type returned by `ResponseCache.get`. */
export type CacheGetResult<T> =
  | { hit: true; value: T; cacheScope: CacheScope }
  | { hit: false };

/**
 * Minimal in-memory response cache wired to `isFresh`, `resolveCacheScope`,
 * and the method→notification invalidation map. (§13, R-13.5-j)
 *
 * - Freshness is computed via `isFresh(ttlMs, receivedAt, now)` — `ttlMs=0`
 *   entries are stored but never served fresh. (RC-3)
 * - `invalidateByNotification` evicts all entries (including paginated cursor
 *   pages) for every method mapped to the given notification. (RC-9)
 * - Scope is resolved conservatively via `resolveCacheScope`. (RC-5)
 */
export class ResponseCache<T extends Record<string, unknown>> {
  private readonly store = new Map<string, StoredEntry>();

  /**
   * Stores `value` under `key`. Skipped when either caching hint is missing or
   * invalid (`hasBothOrNeitherCacheHints` + `isCacheHintValid`). A `ttlMs=0`
   * entry is stored but will never be returned as a cache hit. (R-13.1-g)
   */
  set(key: string, value: T, receivedAt: number): void {
    if (!hasBothOrNeitherCacheHints(value as Record<string, unknown>)) return;
    const ttlMs = value['ttlMs'];
    const rawScope = value['cacheScope'];
    if (!isCacheHintValid(ttlMs, rawScope)) return;
    this.store.set(key, {
      value: value as Record<string, unknown>,
      receivedAt,
      ttlMs: ttlMs as number,
      cacheScope: resolveCacheScope(rawScope),
    });
  }

  /**
   * Returns the entry for `key` if it is still fresh at `now`; otherwise returns
   * `{ hit: false }` and evicts the stale entry. (R-13.2-e, RC-3, RC-5)
   */
  get(key: string, now: number): CacheGetResult<T> {
    const entry = this.store.get(key);
    if (!entry) return { hit: false };
    if (!isFresh(entry.ttlMs, entry.receivedAt, now)) {
      this.store.delete(key);
      return { hit: false };
    }
    return { hit: true, value: entry.value as T, cacheScope: entry.cacheScope };
  }

  /**
   * Evicts all entries for every method that maps to `notification`, including
   * all paginated-cursor-page entries (keys prefixed with `method::`). (RC-9)
   */
  invalidateByNotification(notification: string): void {
    const methods = methodsForNotification(notification);
    for (const method of methods) {
      const prefix = `${method}::`;
      for (const key of [...this.store.keys()]) {
        if (key === method || key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    }
  }

  /** Number of entries currently stored (may include `ttlMs=0` entries). */
  get size(): number {
    return this.store.size;
  }
}

// ─── Cacheable methods registry ───────────────────────────────────────────────

/**
 * The set of method names whose results carry `CacheableResult` shapes. (§13.4, R-13.4-a)
 *
 * On every result from these methods a server MUST populate both `ttlMs` and
 * `cacheScope` with valid values. A server that does not wish to encourage
 * caching MUST still include the fields and SHOULD set `ttlMs` to `0`. (R-13.4-b)
 *
 * On any other message, receivers MUST ignore `ttlMs`/`cacheScope` if present.
 * (R-13.4-e)
 */
export const CACHEABLE_METHODS = new Set([
  'tools/list',
  'prompts/list',
  'resources/list',
  'resources/templates/list',
  'resources/read',
] as const);

/** Returns `true` when `method` is one of the five methods that carry caching hints. */
export function isCacheableMethod(method: string): boolean {
  return CACHEABLE_METHODS.has(method as never);
}
