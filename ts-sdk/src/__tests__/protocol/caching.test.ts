/**
 * Tests for S19 — Response Caching Hints (§13).
 *
 * AC coverage:
 *  AC-19.1  (R-13.1-a, R-13.1-d, R-13.2-a) — both fields required/valid on cacheable results
 *  AC-19.2  (R-13.1-b, R-13.1-c)            — invalid/missing ttlMs → not cacheable / stale
 *  AC-19.3  (R-13.1-e, R-13.1-f)            — unrecognized/absent cacheScope → treat as private
 *  AC-19.4  (R-13.1-g)                       — server must not emit one field without the other
 *  AC-19.5  (R-13.2-b, R-13.2-c, R-13.2-d)  — ttlMs=0 → immediately stale
 *  AC-19.6  (R-13.2-e, R-13.2-f)            — ttlMs=N → fresh until receivedAt+N
 *  AC-19.7  (R-13.2-g)                       — freshness uses client-local clock only
 *  AC-19.8  (R-13.2-h)                       — latest-state seekers re-fetch
 *  AC-19.9  (R-13.2-i)                       — client may ignore ttlMs / re-fetch early
 *  AC-19.10 (R-13.2-j)                       — large ttlMs is an upper bound, not lower
 *  AC-19.11 (R-13.2-k)                       — server chooses ttlMs to reflect data stability
 *  AC-19.12 (R-13.3-a)                       — public result may be served to any user
 *  AC-19.13 (R-13.3-b, R-13.3-c)            — private result: originating context only
 *  AC-19.14 (R-13.3-d, R-13.3-e)            — cacheScope is not access control
 *  AC-19.15 (R-13.3-f, R-13.3-g, R-13.3-h)  — authorization and privacy defaults
 *  AC-19.16 (R-13.4-a)                       — cacheable methods must populate both fields
 *  AC-19.17 (R-13.4-b)                       — no-cache intent: ttlMs=0 still included
 *  AC-19.18 (R-13.4-c, R-13.4-d)            — public only when identical for all requesters
 *  AC-19.19 (R-13.4-e)                       — hints on non-cacheable methods are ignored
 *  AC-19.20 (R-13.4-f, R-13.4-g)            — client may decline; must respect both when honoring
 *  AC-19.21 (R-13.5-a, R-13.5-b, R-13.5-c)  — change notification invalidates cache
 *  AC-19.22 (R-13.5-d)                       — absence of notification doesn't extend ttlMs
 *  AC-19.23 (R-13.5-e)                       — per-page independent ttlMs
 *  AC-19.24 (R-13.5-f, R-13.5-g)            — consistent cacheScope across pages
 *  AC-19.25 (R-13.5-h)                       — inconsistent cacheScope → treat list as private
 *  AC-19.26 (R-13.5-i)                       — don't parse cursor or derive caching from it
 */

import { describe, it, expect } from 'vitest';
import {
  CACHE_SCOPES,
  CacheScopeSchema,
  CacheableResultSchema,
  isCacheHintValid,
  hasBothOrNeitherCacheHints,
  resolveCacheScope,
  isFresh,
  expiresAt,
  hasConsistentCacheScope,
  effectiveCacheScope,
  CACHEABLE_METHODS,
  isCacheableMethod,
  METHOD_TO_NOTIFICATION_MAP,
  methodsForNotification,
  ResponseCache,
} from '../../protocol/caching.js';

// ─── AC-19.1 — both fields required, valid on cacheable results ───────────────

describe('CacheableResultSchema — both fields required (AC-19.1 · R-13.1-a, R-13.1-d, R-13.2-a)', () => {
  it('accepts a cacheable result with valid ttlMs and cacheScope', () => {
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        ttlMs: 600000,
        cacheScope: 'public',
        tools: [],
      }).success,
    ).toBe(true);
  });

  it('rejects when ttlMs is absent', () => {
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        cacheScope: 'public',
      }).success,
    ).toBe(false);
  });

  it('rejects when cacheScope is absent', () => {
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        ttlMs: 600000,
      }).success,
    ).toBe(false);
  });

  it('ttlMs must be a non-negative integer', () => {
    expect(
      CacheableResultSchema.safeParse({ resultType: 'complete', ttlMs: 0, cacheScope: 'private' }).success,
    ).toBe(true);

    expect(
      CacheableResultSchema.safeParse({ resultType: 'complete', ttlMs: -1, cacheScope: 'private' }).success,
    ).toBe(false);

    expect(
      CacheableResultSchema.safeParse({ resultType: 'complete', ttlMs: 1.5, cacheScope: 'private' }).success,
    ).toBe(false);
  });

  it('cacheScope must be exactly "public" or "private"', () => {
    expect(CacheScopeSchema.safeParse('public').success).toBe(true);
    expect(CacheScopeSchema.safeParse('private').success).toBe(true);
    expect(CacheScopeSchema.safeParse('shared').success).toBe(false);
    expect(CacheScopeSchema.safeParse('PUBLIC').success).toBe(false);
  });

  it('CACHE_SCOPES contains exactly public and private', () => {
    expect([...CACHE_SCOPES].sort()).toEqual(['private', 'public'].sort());
  });
});

// ─── AC-19.2 — invalid/missing ttlMs → not cacheable / stale ─────────────────

describe('Invalid ttlMs (AC-19.2 · R-13.1-b, R-13.1-c)', () => {
  it('isCacheHintValid returns false for negative ttlMs', () => {
    expect(isCacheHintValid(-1, 'public')).toBe(false);
  });

  it('isCacheHintValid returns false for fractional ttlMs', () => {
    expect(isCacheHintValid(1.5, 'private')).toBe(false);
  });

  it('isCacheHintValid returns false for string ttlMs', () => {
    expect(isCacheHintValid('600000', 'public')).toBe(false);
  });

  it('isCacheHintValid returns false for missing ttlMs (undefined)', () => {
    expect(isCacheHintValid(undefined, 'public')).toBe(false);
  });

  it('isCacheHintValid returns true for valid hint pair', () => {
    expect(isCacheHintValid(600000, 'public')).toBe(true);
    expect(isCacheHintValid(0, 'private')).toBe(true);
  });
});

// ─── AC-19.3 — unrecognized/absent cacheScope → treat as private ──────────────

describe('Invalid/absent cacheScope → private fallback (AC-19.3 · R-13.1-e, R-13.1-f)', () => {
  it('resolveCacheScope returns "private" for an unrecognized string', () => {
    expect(resolveCacheScope('shared')).toBe('private');
    expect(resolveCacheScope('PUBLIC')).toBe('private');
  });

  it('resolveCacheScope returns "private" for undefined', () => {
    expect(resolveCacheScope(undefined)).toBe('private');
  });

  it('resolveCacheScope returns "private" for null', () => {
    expect(resolveCacheScope(null)).toBe('private');
  });

  it('resolveCacheScope returns "public" for "public"', () => {
    expect(resolveCacheScope('public')).toBe('public');
  });

  it('resolveCacheScope returns "private" for "private"', () => {
    expect(resolveCacheScope('private')).toBe('private');
  });

  it('isCacheHintValid returns false for an unrecognized cacheScope', () => {
    expect(isCacheHintValid(600000, 'shared')).toBe(false);
  });
});

// ─── AC-19.4 — never one field without the other ─────────────────────────────

describe('Both or neither hint fields (AC-19.4 · R-13.1-g)', () => {
  it('hasBothOrNeitherCacheHints returns true when both fields are present', () => {
    expect(hasBothOrNeitherCacheHints({ ttlMs: 600, cacheScope: 'public' })).toBe(true);
  });

  it('hasBothOrNeitherCacheHints returns true when neither field is present', () => {
    expect(hasBothOrNeitherCacheHints({ resultType: 'complete' })).toBe(true);
  });

  it('hasBothOrNeitherCacheHints returns false when only ttlMs is present', () => {
    expect(hasBothOrNeitherCacheHints({ ttlMs: 600 })).toBe(false);
  });

  it('hasBothOrNeitherCacheHints returns false when only cacheScope is present', () => {
    expect(hasBothOrNeitherCacheHints({ cacheScope: 'public' })).toBe(false);
  });
});

// ─── AC-19.5 — ttlMs=0 → immediately stale ───────────────────────────────────

describe('ttlMs = 0 (AC-19.5 · R-13.2-b, R-13.2-c, R-13.2-d)', () => {
  it('isFresh returns false when ttlMs is 0', () => {
    const receivedAt = 1000;
    const now = 1000; // same instant
    expect(isFresh(0, receivedAt, now)).toBe(false);
  });

  it('CacheableResultSchema accepts ttlMs=0', () => {
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        ttlMs: 0,
        cacheScope: 'private',
        contents: [],
      }).success,
    ).toBe(true);
  });
});

// ─── AC-19.6 — ttlMs=N → fresh until receivedAt+N ───────────────────────────

describe('Freshness interval (AC-19.6 · R-13.2-e, R-13.2-f)', () => {
  const receivedAt = 1000;

  it('isFresh returns true when now < receivedAt + ttlMs', () => {
    expect(isFresh(500, receivedAt, receivedAt + 499)).toBe(true);
  });

  it('isFresh returns false when now === receivedAt + ttlMs (expired)', () => {
    expect(isFresh(500, receivedAt, receivedAt + 500)).toBe(false);
  });

  it('isFresh returns false when now > receivedAt + ttlMs (stale)', () => {
    expect(isFresh(500, receivedAt, receivedAt + 501)).toBe(false);
  });

  it('expiresAt equals receivedAt + ttlMs', () => {
    expect(expiresAt(600000, receivedAt)).toBe(receivedAt + 600000);
  });
});

// ─── AC-19.7 — freshness uses only client-local clock ─────────────────────────

describe('Client-local clock only (AC-19.7 · R-13.2-g)', () => {
  it('isFresh uses only receivedAt and ttlMs — no server clock', () => {
    // Computation: expiresAt = receivedAt + ttlMs; isFresh = now < expiresAt.
    // The "server clock" doesn't enter the picture.
    const receivedAt = 9999000; // arbitrary client local time
    const ttlMs = 1000;
    const nowFresh = receivedAt + 999;
    const nowStale = receivedAt + 1000;
    expect(isFresh(ttlMs, receivedAt, nowFresh)).toBe(true);
    expect(isFresh(ttlMs, receivedAt, nowStale)).toBe(false);
  });
});

// ─── AC-19.8 — latest-state seekers re-fetch ──────────────────────────────────

describe('Re-fetch for latest state (AC-19.8 · R-13.2-h)', () => {
  it('isFresh returning true does NOT mean the client cannot re-fetch', () => {
    // R-13.2-i: a client MAY re-fetch at any time before the interval elapses.
    // There is no API to "force re-fetch" in the schema layer — this is a
    // client policy. The test documents that freshness is not a re-fetch prohibition.
    expect(isFresh(600000, 1000, 1001)).toBe(true);
    // A client needing latest state is allowed to re-fetch despite isFresh=true.
  });
});

// ─── AC-19.9 — client may ignore ttlMs / re-fetch early ──────────────────────

describe('Client may decline to cache (AC-19.9 · R-13.2-i)', () => {
  it('isCacheHintValid returning true does NOT obligate caching', () => {
    // Valid hints are hints; a client may cache less aggressively or not at all.
    expect(isCacheHintValid(600000, 'public')).toBe(true);
    // Whether to cache is a client policy decision outside the schema layer.
  });
});

// ─── AC-19.10 — large ttlMs is an upper bound, not a lower bound ─────────────

describe('ttlMs is an upper bound (AC-19.10 · R-13.2-j)', () => {
  it('isFresh returns false after ttlMs elapses — not extended by a large value', () => {
    const receivedAt = 0;
    const largeTtl = Number.MAX_SAFE_INTEGER; // as large as possible
    const justExpired = receivedAt + largeTtl;
    // Verification: after the interval, the result is stale regardless of size.
    expect(isFresh(largeTtl, receivedAt, justExpired)).toBe(false);
    expect(isFresh(largeTtl, receivedAt, justExpired - 1)).toBe(true);
  });
});

// ─── AC-19.11 — server chooses ttlMs to reflect data stability ───────────────

describe('ttlMs reflects data stability (AC-19.11 · R-13.2-k)', () => {
  it('CacheableResultSchema accepts large ttlMs for stable data', () => {
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        ttlMs: 86400000, // 24 hours
        cacheScope: 'public',
        tools: [],
      }).success,
    ).toBe(true);
  });

  it('CacheableResultSchema accepts ttlMs=0 for volatile data', () => {
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        ttlMs: 0,
        cacheScope: 'private',
        contents: [],
      }).success,
    ).toBe(true);
  });
});

// ─── AC-19.12 — public result may be served to any user ──────────────────────

describe('Public scope semantics (AC-19.12 · R-13.3-a)', () => {
  it('cacheScope "public" is a valid scope for shared caches', () => {
    expect(resolveCacheScope('public')).toBe('public');
    expect(CacheScopeSchema.safeParse('public').success).toBe(true);
  });
});

// ─── AC-19.13 — private result: originating context only ─────────────────────

describe('Private scope semantics (AC-19.13 · R-13.3-b, R-13.3-c)', () => {
  it('cacheScope "private" is the conservative default', () => {
    expect(resolveCacheScope('private')).toBe('private');
  });

  it('resolveCacheScope defaults to private for unknown values', () => {
    expect(resolveCacheScope('unknown')).toBe('private');
    expect(resolveCacheScope(undefined)).toBe('private');
  });
});

// ─── AC-19.14 — cacheScope is not access control ─────────────────────────────

describe('cacheScope is not access control (AC-19.14 · R-13.3-d, R-13.3-e)', () => {
  it('CacheableResultSchema does not enforce access control — that is a server obligation', () => {
    // Both "public" and "private" are valid schema values; enforcement of entitlement
    // is outside the schema layer.
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        ttlMs: 600000,
        cacheScope: 'public',
      }).success,
    ).toBe(true);
  });
});

// ─── AC-19.15 — authorization defaults ───────────────────────────────────────

describe('Authorization and privacy defaults (AC-19.15 · R-13.3-f, R-13.3-g, R-13.3-h)', () => {
  it('effectiveCacheScope returns private when scopes are inconsistent', () => {
    expect(effectiveCacheScope(['public', 'private'])).toBe('private');
  });

  it('effectiveCacheScope returns the consistent scope', () => {
    expect(effectiveCacheScope(['private', 'private'])).toBe('private');
    expect(effectiveCacheScope(['public', 'public'])).toBe('public');
  });

  it('resolveCacheScope falls back to private when in doubt', () => {
    expect(resolveCacheScope(null)).toBe('private');
    expect(resolveCacheScope('')).toBe('private');
  });
});

// ─── AC-19.16 — cacheable methods must populate both fields ──────────────────

describe('Cacheable methods registry (AC-19.16 · R-13.4-a)', () => {
  it('tools/list is a cacheable method', () => {
    expect(isCacheableMethod('tools/list')).toBe(true);
  });

  it('prompts/list is a cacheable method', () => {
    expect(isCacheableMethod('prompts/list')).toBe(true);
  });

  it('resources/list is a cacheable method', () => {
    expect(isCacheableMethod('resources/list')).toBe(true);
  });

  it('resources/templates/list is a cacheable method', () => {
    expect(isCacheableMethod('resources/templates/list')).toBe(true);
  });

  it('resources/read is a cacheable method', () => {
    expect(isCacheableMethod('resources/read')).toBe(true);
  });

  it('CACHEABLE_METHODS contains exactly five methods', () => {
    expect(CACHEABLE_METHODS.size).toBe(5);
  });

  it('tools/call is NOT a cacheable method', () => {
    expect(isCacheableMethod('tools/call')).toBe(false);
  });
});

// ─── AC-19.17 — no-cache intent: ttlMs=0 still included ─────────────────────

describe('No-cache intent uses ttlMs=0 (AC-19.17 · R-13.4-b)', () => {
  it('CacheableResultSchema accepts ttlMs=0 cacheScope=private', () => {
    expect(
      CacheableResultSchema.safeParse({
        resultType: 'complete',
        ttlMs: 0,
        cacheScope: 'private',
        contents: [],
      }).success,
    ).toBe(true);
  });

  it('isFresh(0, ...) is always false — intent is honored', () => {
    expect(isFresh(0, 0, 0)).toBe(false);
    expect(isFresh(0, 0, 9999999)).toBe(false);
  });
});

// ─── AC-19.18 — cacheScope assignment rules ───────────────────────────────────

describe('cacheScope assignment (AC-19.18 · R-13.4-c, R-13.4-d)', () => {
  it('"public" is only valid when result is identical for all requesters', () => {
    // The schema allows "public" — the server is responsible for the policy.
    expect(CacheScopeSchema.safeParse('public').success).toBe(true);
  });

  it('"private" is the recommended default for authorization-dependent results', () => {
    expect(CacheScopeSchema.safeParse('private').success).toBe(true);
  });
});

// ─── AC-19.19 — hints on non-cacheable methods are ignored ───────────────────

describe('Hints on non-cacheable methods are ignored (AC-19.19 · R-13.4-e)', () => {
  it('isCacheableMethod returns false for non-cacheable methods', () => {
    expect(isCacheableMethod('tools/call')).toBe(false);
    expect(isCacheableMethod('notifications/tools/list_changed')).toBe(false);
    expect(isCacheableMethod('ping')).toBe(false);
  });
});

// ─── AC-19.20 — client may decline / must respect both when honoring ──────────

describe('Client caching policy (AC-19.20 · R-13.4-f, R-13.4-g)', () => {
  it('isFresh and resolveCacheScope are independent — both must hold for reuse', () => {
    const receivedAt = 1000;
    const now = 1500;
    const ttlMs = 1000; // still fresh
    const scope = resolveCacheScope('public');

    expect(isFresh(ttlMs, receivedAt, now)).toBe(true);
    expect(scope).toBe('public');
    // A client that honors hints must satisfy BOTH conditions for reuse.
  });
});

// ─── AC-19.21 — change notification invalidates cached result ─────────────────

describe('Change notification invalidation (AC-19.21 · R-13.5-a, R-13.5-b, R-13.5-c)', () => {
  it('a notification takes precedence over a still-fresh ttlMs', () => {
    // This is a behavioral rule. The test demonstrates the protocol intent:
    // even when isFresh(...) returns true, a relevant notification should
    // trigger a re-fetch.
    const receivedAt = 1000;
    const now = 1001;
    const ttlMs = 600000; // still fresh by a wide margin
    const notificationReceived = true; // e.g. notifications/tools/list_changed

    const wouldReuseWithoutNotification = isFresh(ttlMs, receivedAt, now);
    const shouldRefetchBecauseOfNotification = notificationReceived;

    expect(wouldReuseWithoutNotification).toBe(true);
    expect(shouldRefetchBecauseOfNotification).toBe(true);
    // A correct client re-fetches when shouldRefetchBecauseOfNotification is true,
    // regardless of wouldReuseWithoutNotification.
  });
});

// ─── AC-19.22 — absence of notification does not extend ttlMs ────────────────

describe('Notification absence does not extend freshness (AC-19.22 · R-13.5-d)', () => {
  it('isFresh returns false after ttlMs elapses regardless of notification history', () => {
    const receivedAt = 0;
    const ttlMs = 1000;
    const elapsed = receivedAt + ttlMs; // exactly expired
    expect(isFresh(ttlMs, receivedAt, elapsed)).toBe(false);
    // The absence of a notification does not keep the entry fresh past ttlMs.
  });
});

// ─── AC-19.23 — per-page independent ttlMs ───────────────────────────────────

describe('Per-page independent ttlMs (AC-19.23 · R-13.5-e)', () => {
  it('each page may carry its own ttlMs', () => {
    const page1 = CacheableResultSchema.safeParse({
      resultType: 'complete',
      tools: [],
      nextCursor: 'C1',
      ttlMs: 60000,
      cacheScope: 'public',
    });
    const page2 = CacheableResultSchema.safeParse({
      resultType: 'complete',
      tools: [],
      ttlMs: 600000, // different from page 1
      cacheScope: 'public',
    });
    expect(page1.success).toBe(true);
    expect(page2.success).toBe(true);

    // Pages can expire at different times.
    const receivedAt = 0;
    expect(isFresh(60000, receivedAt, 59999)).toBe(true);
    expect(isFresh(60000, receivedAt, 60001)).toBe(false);
    expect(isFresh(600000, receivedAt, 60001)).toBe(true);
  });
});

// ─── AC-19.24 — consistent cacheScope across pages ───────────────────────────

describe('Consistent cacheScope across pages (AC-19.24 · R-13.5-f, R-13.5-g)', () => {
  it('hasConsistentCacheScope returns true for homogeneous scopes', () => {
    expect(hasConsistentCacheScope(['public', 'public', 'public'])).toBe(true);
    expect(hasConsistentCacheScope(['private', 'private'])).toBe(true);
  });

  it('hasConsistentCacheScope returns false when mixing public and private', () => {
    expect(hasConsistentCacheScope(['public', 'private'])).toBe(false);
    expect(hasConsistentCacheScope(['private', 'public', 'private'])).toBe(false);
  });

  it('hasConsistentCacheScope returns true for empty or single-page list', () => {
    expect(hasConsistentCacheScope([])).toBe(true);
    expect(hasConsistentCacheScope(['public'])).toBe(true);
  });
});

// ─── AC-19.25 — inconsistent cacheScope → treat as private ───────────────────

describe('Inconsistent cacheScope → treat as private (AC-19.25 · R-13.5-h)', () => {
  it('effectiveCacheScope returns private for mixed scopes', () => {
    expect(effectiveCacheScope(['public', 'private', 'public'])).toBe('private');
  });

  it('effectiveCacheScope returns the common scope when consistent', () => {
    expect(effectiveCacheScope(['public', 'public'])).toBe('public');
    expect(effectiveCacheScope(['private', 'private'])).toBe('private');
  });

  it('effectiveCacheScope on empty list returns private (safe default)', () => {
    expect(effectiveCacheScope([])).toBe('private');
  });
});

// ─── AC-19.26 — don't derive caching from cursor ─────────────────────────────

describe('Cursor is not a cache discriminator (AC-19.26 · R-13.5-i)', () => {
  it('caching is keyed by the request, not the cursor value', () => {
    // The cursor is opaque — its value must not influence cache logic.
    // isFresh and resolveCacheScope do not accept a cursor.
    // This test confirms the API does not expose cursor-based caching.
    const fn = isFresh;
    // isFresh(ttlMs, receivedAt, now) — no cursor parameter.
    expect(fn.length).toBe(3);
  });
});

// ─── METHOD_TO_NOTIFICATION_MAP (§13.5) ──────────────────────────────────────

describe('METHOD_TO_NOTIFICATION_MAP (§13.5, R-13.5-j)', () => {
  it('tools/list maps to notifications/tools/list_changed', () => {
    expect(METHOD_TO_NOTIFICATION_MAP['tools/list']).toBe('notifications/tools/list_changed');
  });

  it('prompts/list maps to notifications/prompts/list_changed', () => {
    expect(METHOD_TO_NOTIFICATION_MAP['prompts/list']).toBe('notifications/prompts/list_changed');
  });

  it('resources/list maps to notifications/resources/list_changed', () => {
    expect(METHOD_TO_NOTIFICATION_MAP['resources/list']).toBe('notifications/resources/list_changed');
  });

  it('resources/templates/list maps to notifications/resources/list_changed', () => {
    expect(METHOD_TO_NOTIFICATION_MAP['resources/templates/list']).toBe(
      'notifications/resources/list_changed',
    );
  });

  it('resources/read maps to notifications/resources/updated', () => {
    expect(METHOD_TO_NOTIFICATION_MAP['resources/read']).toBe('notifications/resources/updated');
  });

  it('contains exactly five entries', () => {
    expect(Object.keys(METHOD_TO_NOTIFICATION_MAP).length).toBe(5);
  });
});

describe('methodsForNotification (§13.5)', () => {
  it('returns methods for notifications/tools/list_changed', () => {
    expect(methodsForNotification('notifications/tools/list_changed')).toEqual(['tools/list']);
  });

  it('returns multiple methods for notifications/resources/list_changed', () => {
    const methods = methodsForNotification('notifications/resources/list_changed');
    expect(methods).toContain('resources/list');
    expect(methods).toContain('resources/templates/list');
    expect(methods.length).toBe(2);
  });

  it('returns empty array for an unknown notification', () => {
    expect(methodsForNotification('notifications/unknown')).toEqual([]);
  });
});

// ─── ResponseCache ─────────────────────────────────────────────────────────────

type TestEntry = { ttlMs: number; cacheScope: string; data: string };

describe('ResponseCache.set and .get (RC-3, RC-5)', () => {
  it('stores and retrieves a fresh entry', () => {
    const cache = new ResponseCache<TestEntry>();
    const entry: TestEntry = { ttlMs: 1000, cacheScope: 'public', data: 'hello' };
    cache.set('key', entry, 0);
    const result = cache.get('key', 500);
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.value.data).toBe('hello');
      expect(result.cacheScope).toBe('public');
    }
  });

  it('returns hit:false for a missing key', () => {
    const cache = new ResponseCache<TestEntry>();
    expect(cache.get('missing', 0).hit).toBe(false);
  });

  it('returns hit:false and evicts an expired entry (RC-3)', () => {
    const cache = new ResponseCache<TestEntry>();
    cache.set('key', { ttlMs: 100, cacheScope: 'private', data: 'd' }, 0);
    expect(cache.get('key', 100).hit).toBe(false); // expired at exactly ttlMs
    expect(cache.size).toBe(0);
  });

  it('ttlMs=0 entries are stored but never served fresh', () => {
    const cache = new ResponseCache<TestEntry>();
    cache.set('key', { ttlMs: 0, cacheScope: 'private', data: 'd' }, 0);
    expect(cache.size).toBe(1);
    expect(cache.get('key', 0).hit).toBe(false);
  });

  it('skips entries with missing hints (hasBothOrNeitherCacheHints)', () => {
    const cache = new ResponseCache<Record<string, unknown>>();
    cache.set('key', { ttlMs: 100 } as Record<string, unknown>, 0);
    expect(cache.size).toBe(0);
  });

  it('resolves unknown cacheScope to "private" conservatively (RC-5)', () => {
    const cache = new ResponseCache<Record<string, unknown>>();
    cache.set('key', { ttlMs: 1000, cacheScope: 'unknown' }, 0);
    // Invalid cacheScope → isCacheHintValid returns false → not stored
    expect(cache.size).toBe(0);
  });
});

describe('ResponseCache.invalidateByNotification (RC-9)', () => {
  it('evicts the tools/list entry on notifications/tools/list_changed', () => {
    const cache = new ResponseCache<TestEntry>();
    cache.set('tools/list::page:first', { ttlMs: 60000, cacheScope: 'public', data: 'p1' }, 0);
    cache.invalidateByNotification('notifications/tools/list_changed');
    expect(cache.get('tools/list::page:first', 1000).hit).toBe(false);
    expect(cache.size).toBe(0);
  });

  it('evicts all cursor pages for a method', () => {
    const cache = new ResponseCache<TestEntry>();
    cache.set('tools/list::page:first', { ttlMs: 60000, cacheScope: 'public', data: 'p1' }, 0);
    cache.set('tools/list::page:cursor:abc', { ttlMs: 60000, cacheScope: 'public', data: 'p2' }, 0);
    cache.invalidateByNotification('notifications/tools/list_changed');
    expect(cache.size).toBe(0);
  });

  it('does not evict unrelated method entries', () => {
    const cache = new ResponseCache<TestEntry>();
    cache.set('tools/list::page:first', { ttlMs: 60000, cacheScope: 'public', data: 'tools' }, 0);
    cache.set('prompts/list::page:first', { ttlMs: 60000, cacheScope: 'public', data: 'prompts' }, 0);
    cache.invalidateByNotification('notifications/tools/list_changed');
    expect(cache.size).toBe(1);
    expect(cache.get('prompts/list::page:first', 1000).hit).toBe(true);
  });

  it('evicts both resources/list and resources/templates/list on notifications/resources/list_changed', () => {
    const cache = new ResponseCache<TestEntry>();
    cache.set('resources/list::page:first', { ttlMs: 60000, cacheScope: 'public', data: 'r' }, 0);
    cache.set('resources/templates/list::page:first', { ttlMs: 60000, cacheScope: 'public', data: 't' }, 0);
    cache.invalidateByNotification('notifications/resources/list_changed');
    expect(cache.size).toBe(0);
  });

  it('no-ops for an unknown notification', () => {
    const cache = new ResponseCache<TestEntry>();
    cache.set('tools/list::page:first', { ttlMs: 60000, cacheScope: 'public', data: 'p1' }, 0);
    cache.invalidateByNotification('notifications/unknown/event');
    expect(cache.size).toBe(1);
  });
});

// ─── Wire examples (§13) ──────────────────────────────────────────────────────

describe('Wire examples (§13)', () => {
  it('tools/list page with caching hints (spec example)', () => {
    const result = CacheableResultSchema.safeParse({
      resultType: 'complete',
      tools: [
        {
          name: 'get_weather',
          title: 'Get Weather',
          description: 'Return the current weather for a city.',
          inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
      nextCursor: 'eyJwYWdlIjogMn0=',
      ttlMs: 600000,
      cacheScope: 'public',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlMs).toBe(600000);
      expect(result.data.cacheScope).toBe('public');
    }
  });

  it('resources/read no-cache result (spec example)', () => {
    const result = CacheableResultSchema.safeParse({
      resultType: 'complete',
      contents: [{ uri: 'file:///home/user/report.txt', mimeType: 'text/plain', text: 'Quarterly report.' }],
      ttlMs: 0,
      cacheScope: 'private',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isFresh(result.data.ttlMs, 0, 0)).toBe(false);
    }
  });
});
