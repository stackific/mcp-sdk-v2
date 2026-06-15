/**
 * Tests for S22 — Utilities: Progress & Cancellation (§15.1–§15.2).
 *
 * AC coverage:
 *  AC-22.1  (R-15-a)        — optional mechanism; correct without it
 *  AC-22.2  (R-15.1.1-a)   — progress token must be string or number
 *  AC-22.3  (R-15.1.1-b,c) — uniqueness across active requests
 *  AC-22.4  (R-15.1.1-d,e) — receiver treats token as opaque
 *  AC-22.5  (R-15.1.2-a)   — no progressToken → no progress notifications
 *  AC-22.6  (R-15.1.3-a,d) — progressToken and progress are REQUIRED
 *  AC-22.7  (R-15.1.3-b,c) — token must match an active opted-in request
 *  AC-22.8  (R-15.1.3-e)   — progress must strictly increase
 *  AC-22.9  (R-15.1.3-f,h) — progress and total accept int or float
 *  AC-22.10 (R-15.1.3-g,i) — total is optional
 *  AC-22.11 (R-15.1.3-j,k) — message is optional human-readable string
 *  AC-22.12 (R-15.1.4-a)   — bidirectional: either party can report progress
 *  AC-22.13 (R-15.1.4-b,c) — request-scoped; before final response
 *  AC-22.14 (R-15.1.4-d)   — processor may send zero notifications
 *  AC-22.15 (R-15.1.4-e)   — maintains active token set
 *  AC-22.16 (R-15.1.4-f)   — rate limiting (implementation guidance)
 *  AC-22.17 (R-15.1.4-g)   — no progress after terminal state
 *  AC-22.18 (R-15.2.1-a,b) — requestId must be own in-flight request
 *  AC-22.19 (R-15.2.1-c,d) — reason is optional human-readable string
 *  AC-22.20 (R-15.2.2-a)   — either party may cancel its in-flight requests
 *  AC-22.21 (R-15.2.2-b)   — client must not cancel server/discover
 *  AC-22.22 (R-15.2.2-c)   — task-augmented requests use tasks/cancel instead
 *  AC-22.23 (R-15.2.2-d)   — receiver should stop processing on cancellation
 *  AC-22.24 (R-15.2.2-e,f) — receiver may ignore unknown/malformed cancellations
 *  AC-22.25 (R-15.2.3-a,b) — race conditions handled gracefully
 *  AC-22.26 (R-15.2.3-c,d,e) — late response after cancellation tolerated
 */

import { describe, it, expect } from 'vitest';
import {
  ProgressTokenSchema,
  ProgressNotificationParamsSchema,
  ProgressNotificationSchema,
  CancelledNotificationParamsSchema,
  CancelledNotificationSchema,
  ProgressTracker,
  ProgressRateLimiter,
  CancellationHandler,
  CancelledRequestSet,
  validateCancellationTarget,
  isDiscoverMethod,
  SERVER_DISCOVER_METHOD,
  PROGRESS_NOTIFICATION_METHOD,
  CANCELLED_NOTIFICATION_METHOD,
} from '../../protocol/progress.js';

// ─── AC-22.1 — optional mechanism (R-15-a) ───────────────────────────────────

describe('Optional mechanism (AC-22.1 · R-15-a)', () => {
  it('a progress notification with a valid token and progress is parsed without error', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'abc123',
      progress: 50,
    });
    expect(result.success).toBe(true);
  });

  it('a cancelled notification with a valid requestId is parsed without error', () => {
    const result = CancelledNotificationParamsSchema.safeParse({
      requestId: 1,
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-22.2 — token must be string or number (R-15.1.1-a) ──────────────────

describe('ProgressTokenSchema — string or number only (AC-22.2 · R-15.1.1-a)', () => {
  it('accepts a string token', () => {
    expect(ProgressTokenSchema.safeParse('abc123').success).toBe(true);
  });

  it('accepts a number token', () => {
    expect(ProgressTokenSchema.safeParse(42).success).toBe(true);
  });

  it('accepts a float token', () => {
    expect(ProgressTokenSchema.safeParse(3.14).success).toBe(true);
  });

  it('rejects an object token', () => {
    expect(ProgressTokenSchema.safeParse({ id: 1 }).success).toBe(false);
  });

  it('rejects an array token', () => {
    expect(ProgressTokenSchema.safeParse([1]).success).toBe(false);
  });

  it('rejects a boolean token', () => {
    expect(ProgressTokenSchema.safeParse(true).success).toBe(false);
  });

  it('rejects null', () => {
    expect(ProgressTokenSchema.safeParse(null).success).toBe(false);
  });
});

// ─── AC-22.3 — uniqueness across active requests (R-15.1.1-b,c) ──────────────

describe('ProgressTracker — uniqueness (AC-22.3 · R-15.1.1-b, R-15.1.1-c)', () => {
  it('allows two distinct tokens to be registered simultaneously', () => {
    const tracker = new ProgressTracker();
    tracker.register('tok-A');
    tracker.register('tok-B');
    expect(tracker.has('tok-A')).toBe(true);
    expect(tracker.has('tok-B')).toBe(true);
    expect(tracker.size).toBe(2);
  });

  it('throws when the same string token is registered twice while active', () => {
    const tracker = new ProgressTracker();
    tracker.register('dup');
    expect(() => tracker.register('dup')).toThrow();
  });

  it('throws when the same number token is registered twice while active', () => {
    const tracker = new ProgressTracker();
    tracker.register(99);
    expect(() => tracker.register(99)).toThrow();
  });

  it('distinguishes string "1" from number 1 (different JSON types)', () => {
    const tracker = new ProgressTracker();
    tracker.register('1');
    expect(() => tracker.register(1)).not.toThrow();
    expect(tracker.size).toBe(2);
  });

  it('allows re-use of a token after it has been completed', () => {
    const tracker = new ProgressTracker();
    tracker.register('reuse');
    tracker.complete('reuse');
    expect(() => tracker.register('reuse')).not.toThrow();
  });
});

// ─── AC-22.4 — receiver treats token as opaque (R-15.1.1-d,e) ───────────────

describe('Token opaqueness (AC-22.4 · R-15.1.1-d, R-15.1.1-e)', () => {
  it('ProgressTracker.has identifies token by value only (no content inspection)', () => {
    const tracker = new ProgressTracker();
    // Internal encoding used by tracker; result must match by value, not structure
    tracker.register('some-opaque-base64-value');
    expect(tracker.has('some-opaque-base64-value')).toBe(true);
    expect(tracker.has('different-value')).toBe(false);
  });

  it('a UUID-formatted token is accepted identically to any other string (opaque)', () => {
    const tracker = new ProgressTracker();
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    tracker.register(uuid);
    expect(tracker.has(uuid)).toBe(true);
  });
});

// ─── AC-22.5 — absent progressToken → no progress (R-15.1.2-a) ──────────────

describe('Opt-in: absent progressToken → no progress (AC-22.5 · R-15.1.2-a)', () => {
  it('tracker.has returns false for a token that was never registered', () => {
    const tracker = new ProgressTracker();
    expect(tracker.has('unregistered')).toBe(false);
  });

  it('isMonotonic returns false for an unregistered token', () => {
    const tracker = new ProgressTracker();
    expect(tracker.isMonotonic('unregistered', 10)).toBe(false);
  });
});

// ─── AC-22.6 — progressToken and progress are REQUIRED (R-15.1.3-a, R-15.1.3-d) ──

describe('ProgressNotificationParamsSchema — required fields (AC-22.6 · R-15.1.3-a, R-15.1.3-d)', () => {
  it('accepts a notification with progressToken and progress', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when progressToken is absent', () => {
    const result = ProgressNotificationParamsSchema.safeParse({ progress: 50 });
    expect(result.success).toBe(false);
  });

  it('rejects when progress is absent', () => {
    const result = ProgressNotificationParamsSchema.safeParse({ progressToken: 'tok' });
    expect(result.success).toBe(false);
  });
});

// ─── AC-22.7 — token must correlate to an active opted-in request (R-15.1.3-b,c) ──

describe('Token correlation (AC-22.7 · R-15.1.3-b, R-15.1.3-c)', () => {
  it('isMonotonic returns false for a token not in the active set', () => {
    const tracker = new ProgressTracker();
    expect(tracker.isMonotonic('unknown-token', 10)).toBe(false);
  });

  it('isMonotonic returns true for the first progress on an active token', () => {
    const tracker = new ProgressTracker();
    tracker.register('active-tok');
    expect(tracker.isMonotonic('active-tok', 0.1)).toBe(true);
  });
});

// ─── AC-22.8 — progress must strictly increase (R-15.1.3-e) ─────────────────

describe('ProgressTracker — monotonic increase (AC-22.8 · R-15.1.3-e)', () => {
  it('first progress value is accepted (anything > -∞)', () => {
    const tracker = new ProgressTracker();
    tracker.register('tok');
    expect(tracker.isMonotonic('tok', 0)).toBe(true);
  });

  it('a higher subsequent value is monotonic', () => {
    const tracker = new ProgressTracker();
    tracker.register('tok');
    tracker.recordProgress('tok', 10);
    expect(tracker.isMonotonic('tok', 11)).toBe(true);
  });

  it('an equal value is NOT monotonic (must be strictly greater)', () => {
    const tracker = new ProgressTracker();
    tracker.register('tok');
    tracker.recordProgress('tok', 50);
    expect(tracker.isMonotonic('tok', 50)).toBe(false);
  });

  it('a lower value is NOT monotonic', () => {
    const tracker = new ProgressTracker();
    tracker.register('tok');
    tracker.recordProgress('tok', 50);
    expect(tracker.isMonotonic('tok', 49)).toBe(false);
  });

  it('recordProgress updates last value for subsequent checks', () => {
    const tracker = new ProgressTracker();
    tracker.register('tok');
    tracker.recordProgress('tok', 25);
    tracker.recordProgress('tok', 75);
    expect(tracker.isMonotonic('tok', 76)).toBe(true);
    expect(tracker.isMonotonic('tok', 75)).toBe(false);
  });
});

// ─── AC-22.9 — int or float accepted for progress/total (R-15.1.3-f,h) ──────

describe('progress and total accept int or float (AC-22.9 · R-15.1.3-f, R-15.1.3-h)', () => {
  it('accepts integer progress', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 50,
      total: 100,
    });
    expect(result.success).toBe(true);
  });

  it('accepts floating-point progress', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 87.5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts floating-point total', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 0.5,
      total: 1.0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a string progress value', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: '50',
    });
    expect(result.success).toBe(false);
  });
});

// ─── AC-22.10 — total is optional (R-15.1.3-g,i) ────────────────────────────

describe('total is optional (AC-22.10 · R-15.1.3-g, R-15.1.3-i)', () => {
  it('notification without total is valid', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.total).toBeUndefined();
  });

  it('notification with total is also valid', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 10,
      total: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.total).toBe(100);
  });
});

// ─── AC-22.11 — message is optional (R-15.1.3-j,k) ─────────────────────────

describe('message is optional (AC-22.11 · R-15.1.3-j, R-15.1.3-k)', () => {
  it('notification without message is valid', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBeUndefined();
  });

  it('notification with message string is valid', () => {
    const result = ProgressNotificationParamsSchema.safeParse({
      progressToken: 'tok',
      progress: 10,
      message: 'Reticulating splines...',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBe('Reticulating splines...');
  });
});

// ─── AC-22.15 — maintains active token set (R-15.1.4-e) ─────────────────────

describe('ProgressTracker — active token set (AC-22.15 · R-15.1.4-e)', () => {
  it('reports correct size as tokens are registered and completed', () => {
    const tracker = new ProgressTracker();
    expect(tracker.size).toBe(0);
    tracker.register('a');
    tracker.register('b');
    expect(tracker.size).toBe(2);
    tracker.complete('a');
    expect(tracker.size).toBe(1);
    tracker.complete('b');
    expect(tracker.size).toBe(0);
  });

  it('activeTokens returns all currently registered tokens', () => {
    const tracker = new ProgressTracker();
    tracker.register('x');
    tracker.register(42);
    const tokens = tracker.activeTokens;
    expect(tokens).toContain('x');
    expect(tokens).toContain(42);
  });
});

// ─── AC-22.17 — no progress after terminal state (R-15.1.4-g) ────────────────

describe('Terminal state: no progress after completion (AC-22.17 · R-15.1.4-g)', () => {
  it('tracker.has returns false after complete', () => {
    const tracker = new ProgressTracker();
    tracker.register('finished');
    tracker.complete('finished');
    expect(tracker.has('finished')).toBe(false);
  });

  it('isMonotonic returns false for a completed token (cannot send more progress)', () => {
    const tracker = new ProgressTracker();
    tracker.register('done');
    tracker.complete('done');
    expect(tracker.isMonotonic('done', 999)).toBe(false);
  });
});

// ─── ProgressNotificationSchema (full envelope) ──────────────────────────────

describe('ProgressNotificationSchema full envelope', () => {
  it('PROGRESS_NOTIFICATION_METHOD is "notifications/progress"', () => {
    expect(PROGRESS_NOTIFICATION_METHOD).toBe('notifications/progress');
  });

  it('accepts a valid full notification', () => {
    const result = ProgressNotificationSchema.safeParse({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: 'tok', progress: 10, total: 100, message: 'Working...' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects when method is wrong', () => {
    const result = ProgressNotificationSchema.safeParse({
      jsonrpc: '2.0',
      method: 'notifications/other',
      params: { progressToken: 'tok', progress: 10 },
    });
    expect(result.success).toBe(false);
  });
});

// ─── CancelledNotificationSchema ─────────────────────────────────────────────

describe('CancelledNotificationSchema (AC-22.18–AC-22.24)', () => {
  it('CANCELLED_NOTIFICATION_METHOD is "notifications/cancelled"', () => {
    expect(CANCELLED_NOTIFICATION_METHOD).toBe('notifications/cancelled');
  });

  it('accepts a valid cancellation with requestId and reason', () => {
    const result = CancelledNotificationSchema.safeParse({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 1, reason: 'User cancelled' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a cancellation without requestId (malformed tolerance per R-15.2.2-f)', () => {
    const result = CancelledNotificationParamsSchema.safeParse({ reason: 'gone' });
    expect(result.success).toBe(true);
  });

  it('accepts a cancellation without reason (AC-22.19 · R-15.2.1-c)', () => {
    const result = CancelledNotificationParamsSchema.safeParse({ requestId: '42' });
    expect(result.success).toBe(true);
  });
});

// ─── AC-22.18 — validateCancellationTarget (R-15.2.1-a,b) ───────────────────

describe('validateCancellationTarget (AC-22.18 · R-15.2.1-a, R-15.2.1-b)', () => {
  it('returns ok:true when requestId is in-flight', () => {
    const inflight = new Set<string | number>([1, '2']);
    const result = validateCancellationTarget(1, inflight);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when requestId is not in-flight', () => {
    const inflight = new Set<string | number>([1]);
    const result = validateCancellationTarget(99, inflight);
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when requestId is undefined', () => {
    const inflight = new Set<string | number>([1]);
    const result = validateCancellationTarget(undefined, inflight);
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when requestId is the server/discover id (AC-22.21 · R-15.2.2-b)', () => {
    const inflight = new Set<string | number>([0]);
    const result = validateCancellationTarget(0, inflight, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/server\/discover/);
  });
});

// ─── AC-22.21 — isDiscoverMethod (R-15.2.2-b) ────────────────────────────────

describe('isDiscoverMethod (AC-22.21 · R-15.2.2-b)', () => {
  it('returns true for server/discover', () => {
    expect(isDiscoverMethod('server/discover')).toBe(true);
    expect(SERVER_DISCOVER_METHOD).toBe('server/discover');
  });

  it('returns false for other methods', () => {
    expect(isDiscoverMethod('tools/call')).toBe(false);
    expect(isDiscoverMethod('notifications/cancelled')).toBe(false);
  });
});

// ─── AC-22.25–AC-22.26 — race condition tolerance ────────────────────────────

describe('Race condition tolerance (AC-22.25 · R-15.2.3-a,b; AC-22.26 · R-15.2.3-c,d,e)', () => {
  it('complete() on an already-completed token does not throw (tolerates late completion)', () => {
    const tracker = new ProgressTracker();
    tracker.register('race');
    tracker.complete('race');
    expect(() => tracker.complete('race')).not.toThrow();
  });

  it('complete() on a never-registered token does not throw (tolerates stale events)', () => {
    const tracker = new ProgressTracker();
    expect(() => tracker.complete('unknown')).not.toThrow();
  });

  it('validateCancellationTarget on a no-longer-in-flight id returns ok:false (tolerated)', () => {
    // After a response arrived, the id was removed from in-flight; a late cancel is simply ignored
    const inflight = new Set<string | number>(); // already cleared
    const result = validateCancellationTarget(5, inflight);
    expect(result.ok).toBe(false);
  });
});

// ─── AC-22.16 — ProgressRateLimiter (RC-3 / SHOULD) ─────────────────────────

describe('ProgressRateLimiter (AC-22.16 · RC-3)', () => {
  it('permits the first emission for a token', () => {
    const limiter = new ProgressRateLimiter(100);
    expect(limiter.shouldEmit('tok', 1000)).toBe(true);
  });

  it('suppresses a second emission within the interval', () => {
    const limiter = new ProgressRateLimiter(100);
    limiter.shouldEmit('tok', 1000);
    expect(limiter.shouldEmit('tok', 1050)).toBe(false); // 50 ms < 100 ms
  });

  it('permits a second emission after the interval has elapsed', () => {
    const limiter = new ProgressRateLimiter(100);
    limiter.shouldEmit('tok', 1000);
    expect(limiter.shouldEmit('tok', 1100)).toBe(true); // exactly at boundary
  });

  it('permits a second emission well after the interval', () => {
    const limiter = new ProgressRateLimiter(100);
    limiter.shouldEmit('tok', 1000);
    expect(limiter.shouldEmit('tok', 1500)).toBe(true);
  });

  it('tracks tokens independently — a different token is not throttled', () => {
    const limiter = new ProgressRateLimiter(100);
    limiter.shouldEmit('tok-A', 1000);
    // tok-B was never emitted; should be allowed
    expect(limiter.shouldEmit('tok-B', 1050)).toBe(true);
  });

  it('string and number tokens are tracked independently', () => {
    const limiter = new ProgressRateLimiter(100);
    limiter.shouldEmit('1', 1000);
    // Number 1 should not be rate-limited because it is a different token type
    expect(limiter.shouldEmit(1, 1050)).toBe(true);
  });

  it('complete() clears rate-limit state for the token', () => {
    const limiter = new ProgressRateLimiter(100);
    limiter.shouldEmit('tok', 1000);
    limiter.complete('tok');
    // After completion, next emit is permitted immediately
    expect(limiter.shouldEmit('tok', 1050)).toBe(true);
  });

  it('complete() on an unknown token does not throw', () => {
    const limiter = new ProgressRateLimiter(100);
    expect(() => limiter.complete('never-seen')).not.toThrow();
  });

  it('default interval is 100 ms', () => {
    const limiter = new ProgressRateLimiter(); // default
    limiter.shouldEmit('tok', 1000);
    expect(limiter.shouldEmit('tok', 1099)).toBe(false);
    expect(limiter.shouldEmit('tok', 1100)).toBe(true);
  });

  it('custom interval is respected', () => {
    const limiter = new ProgressRateLimiter(200);
    limiter.shouldEmit('tok', 1000);
    expect(limiter.shouldEmit('tok', 1199)).toBe(false);
    expect(limiter.shouldEmit('tok', 1200)).toBe(true);
  });
});

// ─── AC-22.23 — CancellationHandler (RC-4 · R-15.2.2-d) ─────────────────────

describe('CancellationHandler — receiver stops work on cancellation (AC-22.23 · RC-4 · R-15.2.2-d)', () => {
  it('trigger() calls the registered callback and returns true', () => {
    let called = false;
    const handler = new CancellationHandler();
    handler.register(1, () => { called = true; });
    const result = handler.trigger(1);
    expect(result).toBe(true);
    expect(called).toBe(true);
  });

  it('trigger() removes the handler so a second trigger returns false', () => {
    let callCount = 0;
    const handler = new CancellationHandler();
    handler.register(1, () => { callCount++; });
    handler.trigger(1);
    const second = handler.trigger(1);
    expect(second).toBe(false);
    expect(callCount).toBe(1);
  });

  it('trigger() returns false when no handler is registered (work already completed)', () => {
    const handler = new CancellationHandler();
    expect(handler.trigger(99)).toBe(false);
  });

  it('has() returns true after register and false after trigger', () => {
    const handler = new CancellationHandler();
    handler.register('req-A', () => {});
    expect(handler.has('req-A')).toBe(true);
    handler.trigger('req-A');
    expect(handler.has('req-A')).toBe(false);
  });

  it('deregister() removes the handler without calling it', () => {
    let called = false;
    const handler = new CancellationHandler();
    handler.register('req-B', () => { called = true; });
    handler.deregister('req-B');
    expect(handler.has('req-B')).toBe(false);
    expect(called).toBe(false);
  });

  it('deregister() on an unknown id does not throw', () => {
    const handler = new CancellationHandler();
    expect(() => handler.deregister('unknown')).not.toThrow();
  });

  it('size reflects the number of registered handlers', () => {
    const handler = new CancellationHandler();
    expect(handler.size).toBe(0);
    handler.register(1, () => {});
    handler.register(2, () => {});
    expect(handler.size).toBe(2);
    handler.trigger(1);
    expect(handler.size).toBe(1);
    handler.deregister(2);
    expect(handler.size).toBe(0);
  });

  it('string and number ids are tracked independently', () => {
    let stringCalled = false;
    let numberCalled = false;
    const handler = new CancellationHandler();
    handler.register('1', () => { stringCalled = true; });
    handler.register(1, () => { numberCalled = true; });
    handler.trigger('1');
    expect(stringCalled).toBe(true);
    expect(numberCalled).toBe(false);
  });

  it('can be used with AbortController to stop async work', () => {
    const handler = new CancellationHandler();
    const ac = new AbortController();
    handler.register('async-req', () => ac.abort());
    expect(ac.signal.aborted).toBe(false);
    handler.trigger('async-req');
    expect(ac.signal.aborted).toBe(true);
  });
});

// ─── AC-22.26 — CancelledRequestSet (RC-6 · R-15.2.3-e) ─────────────────────

describe('CancelledRequestSet — sender ignores late responses (AC-22.26 · RC-6 · R-15.2.3-e)', () => {
  it('isIgnorable() returns true after add()', () => {
    const set = new CancelledRequestSet();
    set.add(42);
    expect(set.isIgnorable(42)).toBe(true);
  });

  it('isIgnorable() returns false for an id that was never cancelled', () => {
    const set = new CancelledRequestSet();
    expect(set.isIgnorable(99)).toBe(false);
  });

  it('acknowledge() removes the id; subsequent isIgnorable() returns false', () => {
    const set = new CancelledRequestSet();
    set.add('req-1');
    set.acknowledge('req-1');
    expect(set.isIgnorable('req-1')).toBe(false);
  });

  it('acknowledge() on an unknown id does not throw', () => {
    const set = new CancelledRequestSet();
    expect(() => set.acknowledge('never-added')).not.toThrow();
  });

  it('size reflects the number of outstanding cancelled ids', () => {
    const set = new CancelledRequestSet();
    expect(set.size).toBe(0);
    set.add(1);
    set.add(2);
    expect(set.size).toBe(2);
    set.acknowledge(1);
    expect(set.size).toBe(1);
  });

  it('string and number ids are tracked independently', () => {
    const set = new CancelledRequestSet();
    set.add('5');
    expect(set.isIgnorable('5')).toBe(true);
    expect(set.isIgnorable(5)).toBe(false);
  });

  it('models the full cancel-then-ignore lifecycle', () => {
    const set = new CancelledRequestSet();
    // 1. Sender sends notifications/cancelled for requestId 7
    set.add(7);
    // 2. Server processes request and sends response despite cancellation (race)
    expect(set.isIgnorable(7)).toBe(true); // → discard response
    // 3. Sender discards the late response
    set.acknowledge(7);
    // 4. Set is clean
    expect(set.size).toBe(0);
    expect(set.isIgnorable(7)).toBe(false);
  });
});
