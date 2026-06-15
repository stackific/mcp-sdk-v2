/**
 * Tests for S23 — Utilities: Logging & Trace Context (§15.3–§15.4).
 *
 * AC coverage:
 *  AC-23.1  (R-15.3-a)    — logging is Deprecated; implementations SHOULD NOT rely on it
 *  AC-23.2  (R-15.3-b)    — alternatives: stderr / out-of-band tracing
 *  AC-23.3  (R-15.3.1-a, R-15.3.3-c,d) — level ordering; server emits only at-or-above
 *  AC-23.4  (R-15.3.2-a)  — level required and must be a known LoggingLevel string
 *  AC-23.5  (R-15.3.2-b)  — logger optional
 *  AC-23.6  (R-15.3.2-c)  — data required
 *  AC-23.7  (R-15.3.2-d)  — data can be string or object
 *  AC-23.8  (R-15.3.2-e)  — data must not contain sensitive content (guidance)
 *  AC-23.9  (R-15.3.3-a)  — absent logLevel → zero notifications
 *  AC-23.10 (R-15.3.3-b,c,d) — logLevel honored; only at-or-above emitted
 *  AC-23.11 (R-15.3.3-e,f) — request-scoped; no other stream
 *  AC-23.12 (R-15.3.3-g)  — invalid logLevel → -32602
 *  AC-23.13 (R-15.3.3-h)  — rate limiting (guidance)
 *  AC-23.14 (R-15.4.1-a,b,c) — trace keys optional, W3C format
 *  AC-23.15 (R-15.4.2-a,b) — trace keys on request or notification
 *  AC-23.16 (R-15.4.2-c)  — receiver treats values as opaque
 *  AC-23.17 (R-15.4.2-d,e,f) — absent keys: no assumption, no requirement
 *  AC-23.18 (R-15.4.2-g)  — non-tracing receiver ignores keys without error
 *  AC-23.19 (R-15.4.2-h)  — intermediary propagates trace context unchanged
 */

import { describe, it, expect } from 'vitest';
import {
  LoggingLevelSchema,
  LOGGING_LEVELS,
  LoggingMessageNotificationParamsSchema,
  LoggingMessageNotificationSchema,
  validateLogLevelOptIn,
  resolvedMinLogLevelIndex,
  loggingLevelIndex,
  isAtOrAboveLogLevel,
  LOGGING_MESSAGE_METHOD,
  TRACE_CONTEXT_BARE_KEYS,
  hasTraceparent,
  hasTracestate,
  hasBaggage,
  relayTraceContext,
  extractTraceContext,
  LogRateLimiter,
} from '../../protocol/logging.js';

// ─── AC-23.1 — Deprecated status ─────────────────────────────────────────────

describe('Deprecated: logging mechanism (AC-23.1 · R-15.3-a)', () => {
  it('LOGGING_MESSAGE_METHOD constant exists to name the Deprecated mechanism', () => {
    expect(LOGGING_MESSAGE_METHOD).toBe('notifications/message');
  });

  it('LoggingLevelSchema is defined (for interoperability with peers that still emit it)', () => {
    expect(LoggingLevelSchema).toBeDefined();
  });
});

// ─── AC-23.3 — level ordering (R-15.3.1-a) ───────────────────────────────────

describe('LoggingLevel ordering (AC-23.3 · R-15.3.1-a)', () => {
  it('debug is the lowest severity (index 0)', () => {
    expect(loggingLevelIndex('debug')).toBe(0);
  });

  it('emergency is the highest severity (index 7)', () => {
    expect(loggingLevelIndex('emergency')).toBe(7);
  });

  it('ordering is debug < info < notice < warning < error < critical < alert < emergency', () => {
    const levels = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'] as const;
    for (let i = 0; i < levels.length - 1; i++) {
      expect(loggingLevelIndex(levels[i]!)).toBeLessThan(loggingLevelIndex(levels[i + 1]!));
    }
  });

  it('LOGGING_LEVELS contains all 8 levels in ascending-severity order', () => {
    expect(LOGGING_LEVELS).toHaveLength(8);
    expect(LOGGING_LEVELS[0]).toBe('debug');
    expect(LOGGING_LEVELS[7]).toBe('emergency');
  });

  it('isAtOrAboveLogLevel filters correctly for minimum "warning"', () => {
    // At-or-above: warning, error, critical, alert, emergency
    expect(isAtOrAboveLogLevel('debug', 'warning')).toBe(false);
    expect(isAtOrAboveLogLevel('info', 'warning')).toBe(false);
    expect(isAtOrAboveLogLevel('notice', 'warning')).toBe(false);
    expect(isAtOrAboveLogLevel('warning', 'warning')).toBe(true);
    expect(isAtOrAboveLogLevel('error', 'warning')).toBe(true);
    expect(isAtOrAboveLogLevel('emergency', 'warning')).toBe(true);
  });
});

// ─── AC-23.4 — level required and must be valid (R-15.3.2-a) ────────────────

describe('LoggingMessageNotificationParamsSchema — level required (AC-23.4 · R-15.3.2-a)', () => {
  it('accepts all eight recognized level strings', () => {
    const levels = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];
    for (const level of levels) {
      const result = LoggingMessageNotificationParamsSchema.safeParse({ level, data: 'msg' });
      expect(result.success).toBe(true);
    }
  });

  it('rejects when level is absent', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({ data: 'msg' });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized level string (e.g. "verbose")', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({ level: 'verbose', data: 'msg' });
    expect(result.success).toBe(false);
  });

  it('rejects a numeric level', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({ level: 3, data: 'msg' });
    expect(result.success).toBe(false);
  });
});

// ─── AC-23.5 — logger optional (R-15.3.2-b) ─────────────────────────────────

describe('logger is optional (AC-23.5 · R-15.3.2-b)', () => {
  it('is valid without logger', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({
      level: 'info',
      data: 'hello',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logger).toBeUndefined();
  });

  it('is valid with logger', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({
      level: 'info',
      logger: 'database',
      data: 'hello',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logger).toBe('database');
  });
});

// ─── AC-23.6 — data required (R-15.3.2-c) ───────────────────────────────────

describe('data is required (AC-23.6 · R-15.3.2-c)', () => {
  it('rejects when data is absent', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({ level: 'info' });
    expect(result.success).toBe(false);
  });
});

// ─── AC-23.7 — data can be string or object (R-15.3.2-d) ─────────────────────

describe('data can be string or object (AC-23.7 · R-15.3.2-d)', () => {
  it('accepts data as a JSON string', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({
      level: 'error',
      data: 'Connection failed',
    });
    expect(result.success).toBe(true);
  });

  it('accepts data as a JSON object', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({
      level: 'error',
      data: { error: 'Connection failed', host: 'localhost' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts data as a number', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({
      level: 'debug',
      data: 42,
    });
    expect(result.success).toBe(true);
  });

  it('accepts data as null', () => {
    const result = LoggingMessageNotificationParamsSchema.safeParse({
      level: 'debug',
      data: null,
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-23.9 — absent logLevel → zero notifications (R-15.3.3-a) ─────────────

describe('resolvedMinLogLevelIndex — absent opt-in (AC-23.9 · R-15.3.3-a)', () => {
  it('returns -1 when logLevel is undefined (absent)', () => {
    expect(resolvedMinLogLevelIndex(undefined)).toBe(-1);
  });

  it('returns -1 when logLevel is null', () => {
    expect(resolvedMinLogLevelIndex(null)).toBe(-1);
  });

  it('returns -1 when logLevel is an invalid string', () => {
    expect(resolvedMinLogLevelIndex('verbose')).toBe(-1);
  });
});

// ─── AC-23.10 — logLevel honored: only at-or-above (R-15.3.3-b,c,d) ─────────

describe('resolvedMinLogLevelIndex — level honored (AC-23.10 · R-15.3.3-b,c,d)', () => {
  it('returns the correct index for "warning" (3)', () => {
    expect(resolvedMinLogLevelIndex('warning')).toBe(3);
  });

  it('returns 0 for "debug" — all levels pass', () => {
    expect(resolvedMinLogLevelIndex('debug')).toBe(0);
  });

  it('returns 7 for "emergency" — only emergency passes', () => {
    expect(resolvedMinLogLevelIndex('emergency')).toBe(7);
  });

  it('combined with isAtOrAboveLogLevel correctly filters messages', () => {
    const minIndex = resolvedMinLogLevelIndex('warning'); // 3
    const levels = ['debug', 'info', 'notice', 'warning', 'error', 'emergency'] as const;
    const willEmit = levels.filter((l) => loggingLevelIndex(l) >= minIndex);
    expect(willEmit).toEqual(['warning', 'error', 'emergency']);
    const willDrop = levels.filter((l) => loggingLevelIndex(l) < minIndex);
    expect(willDrop).toEqual(['debug', 'info', 'notice']);
  });
});

// ─── AC-23.12 — invalid logLevel → -32602 (R-15.3.3-g) ──────────────────────

describe('validateLogLevelOptIn (AC-23.12 · R-15.3.3-g)', () => {
  it('returns ok:true for a recognized level', () => {
    const result = validateLogLevelOptIn('warning');
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with code -32602 for an unrecognized string', () => {
    const result = validateLogLevelOptIn('verbose');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(-32602);
  });

  it('returns ok:false for a numeric value', () => {
    const result = validateLogLevelOptIn(3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(-32602);
  });

  it('returns ok:false for null', () => {
    const result = validateLogLevelOptIn(null);
    expect(result.ok).toBe(false);
  });
});

// ─── Full notification schema ─────────────────────────────────────────────────

describe('LoggingMessageNotificationSchema full envelope', () => {
  it('accepts a well-formed log notification', () => {
    const result = LoggingMessageNotificationSchema.safeParse({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: {
        level: 'error',
        logger: 'database',
        data: { error: 'Connection failed', host: 'localhost', port: 5432 },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects wrong method name', () => {
    const result = LoggingMessageNotificationSchema.safeParse({
      jsonrpc: '2.0',
      method: 'notifications/log',
      params: { level: 'info', data: 'hello' },
    });
    expect(result.success).toBe(false);
  });
});

// ─── AC-23.14 — trace keys optional, W3C format (R-15.4.1-a,b,c) ────────────

describe('Trace context presence predicates (AC-23.14 · R-15.4.1-a,b,c)', () => {
  const validTraceparent =
    '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  // W3C tracestate keys must be lowercase; using lowercase-conformant keys
  const validTracestate = 'vendora=t61rcwkgmze,vendorb=00f067aa0ba902b7';
  const validBaggage = 'userTier=gold,region=us-east-1';

  it('hasTraceparent returns true for a valid W3C traceparent value', () => {
    expect(hasTraceparent({ traceparent: validTraceparent })).toBe(true);
  });

  it('hasTraceparent returns false when traceparent is absent', () => {
    expect(hasTraceparent({})).toBe(false);
  });

  it('hasTracestate returns true for a valid W3C tracestate value', () => {
    expect(hasTracestate({ tracestate: validTracestate })).toBe(true);
  });

  it('hasTracestate returns false when tracestate is absent', () => {
    expect(hasTracestate({})).toBe(false);
  });

  it('hasBaggage returns true for a valid W3C baggage value', () => {
    expect(hasBaggage({ baggage: validBaggage })).toBe(true);
  });

  it('hasBaggage returns false when baggage is absent', () => {
    expect(hasBaggage({})).toBe(false);
  });
});

// ─── AC-23.15 — keys may appear on request or notification (R-15.4.2-a,b) ───

describe('Trace keys may appear on any message (AC-23.15 · R-15.4.2-a,b)', () => {
  it('TRACE_CONTEXT_BARE_KEYS contains the three expected keys', () => {
    expect(TRACE_CONTEXT_BARE_KEYS).toContain('traceparent');
    expect(TRACE_CONTEXT_BARE_KEYS).toContain('tracestate');
    expect(TRACE_CONTEXT_BARE_KEYS).toContain('baggage');
  });

  it('a message with none of the trace keys is still valid', () => {
    // extractTraceContext returns an empty object when no keys present
    const ctx = extractTraceContext({ foo: 'bar' });
    expect(Object.keys(ctx)).toHaveLength(0);
  });
});

// ─── AC-23.16 — receiver treats values as opaque (R-15.4.2-c) ───────────────

describe('Trace context is opaque to receiver (AC-23.16 · R-15.4.2-c)', () => {
  it('extractTraceContext copies values without parsing', () => {
    const meta = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendorX=abc',
      baggage: 'k=v',
      'other-key': 'ignored',
    };
    const ctx = extractTraceContext(meta);
    expect(ctx.traceparent).toBe(meta.traceparent);
    expect(ctx.tracestate).toBe(meta.tracestate);
    expect(ctx.baggage).toBe(meta.baggage);
    // Non-trace key not included
    expect('other-key' in ctx).toBe(false);
  });
});

// ─── AC-23.17 — absent keys: no assumption or requirement (R-15.4.2-d,e,f) ──

describe('Absent trace keys: no assumption, no requirement (AC-23.17 · R-15.4.2-d,e,f)', () => {
  it('extractTraceContext with no trace keys returns empty object (receiver still functions)', () => {
    const ctx = extractTraceContext({});
    expect(Object.keys(ctx)).toHaveLength(0);
  });

  it('relayTraceContext copies no keys when inbound has none', () => {
    const out = relayTraceContext({}, { existing: 'value' });
    expect(out['traceparent']).toBeUndefined();
    expect(out['tracestate']).toBeUndefined();
    expect(out['baggage']).toBeUndefined();
    expect(out['existing']).toBe('value');
  });
});

// ─── AC-23.18 — non-tracing receiver ignores keys (R-15.4.2-g) ───────────────

describe('Non-tracing receiver ignores trace keys (AC-23.18 · R-15.4.2-g)', () => {
  it('extractTraceContext does not throw on unrecognized or missing trace values', () => {
    expect(() => extractTraceContext({ traceparent: 'garbage-value' })).not.toThrow();
  });

  it('a meta object with only non-trace keys is handled without error', () => {
    const ctx = extractTraceContext({ 'io.modelcontextprotocol/protocolVersion': '2026-07-28' });
    expect(Object.keys(ctx)).toHaveLength(0);
  });
});

// ─── AC-23.19 — intermediary propagates unchanged (R-15.4.2-h) ───────────────

describe('relayTraceContext — intermediary propagation (AC-23.19 · R-15.4.2-h)', () => {
  const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  const ts = 'vendora=t61rcwkgmze';
  const bg = 'userTier=gold';

  it('copies all three trace keys from inbound to outbound unchanged', () => {
    const inbound = { traceparent: tp, tracestate: ts, baggage: bg };
    const outbound = relayTraceContext(inbound, {});
    expect(outbound['traceparent']).toBe(tp);
    expect(outbound['tracestate']).toBe(ts);
    expect(outbound['baggage']).toBe(bg);
  });

  it('preserves existing outbound keys that are not trace keys', () => {
    const inbound = { traceparent: tp };
    const existing = { someKey: 'preserved' };
    const outbound = relayTraceContext(inbound, existing);
    expect(outbound['someKey']).toBe('preserved');
    expect(outbound['traceparent']).toBe(tp);
  });

  it('only copies present keys (does not add undefined entries for absent keys)', () => {
    const inbound = { traceparent: tp }; // tracestate and baggage absent
    const outbound = relayTraceContext(inbound, {});
    expect('traceparent' in outbound).toBe(true);
    expect('tracestate' in outbound).toBe(false);
    expect('baggage' in outbound).toBe(false);
  });

  it('does not mutate the original outbound object', () => {
    const inbound = { traceparent: tp };
    const original = { original: true };
    relayTraceContext(inbound, original);
    expect('traceparent' in original).toBe(false);
  });
});

// ─── AC-23.13 — LogRateLimiter (RC-3 / SHOULD) ───────────────────────────────

describe('LogRateLimiter (AC-23.13 · RC-3)', () => {
  it('permits the first emission', () => {
    const limiter = new LogRateLimiter(50);
    expect(limiter.shouldEmit(1000)).toBe(true);
  });

  it('suppresses a second emission within the interval', () => {
    const limiter = new LogRateLimiter(50);
    limiter.shouldEmit(1000);
    expect(limiter.shouldEmit(1030)).toBe(false); // 30 ms < 50 ms
  });

  it('permits a second emission at exactly the interval boundary', () => {
    const limiter = new LogRateLimiter(50);
    limiter.shouldEmit(1000);
    expect(limiter.shouldEmit(1050)).toBe(true);
  });

  it('permits a second emission after the interval has elapsed', () => {
    const limiter = new LogRateLimiter(50);
    limiter.shouldEmit(1000);
    expect(limiter.shouldEmit(1200)).toBe(true);
  });

  it('default interval is 50 ms', () => {
    const limiter = new LogRateLimiter(); // default
    limiter.shouldEmit(1000);
    expect(limiter.shouldEmit(1049)).toBe(false);
    expect(limiter.shouldEmit(1050)).toBe(true);
  });

  it('custom interval is respected', () => {
    const limiter = new LogRateLimiter(200);
    limiter.shouldEmit(1000);
    expect(limiter.shouldEmit(1199)).toBe(false);
    expect(limiter.shouldEmit(1200)).toBe(true);
  });

  it('a fresh limiter (no prior emission) allows emission regardless of nowMs', () => {
    const limiter = new LogRateLimiter(50);
    // First call always returns true independent of the timestamp
    expect(limiter.shouldEmit(0)).toBe(true);
  });

  it('updates last-emit time so subsequent calls start from the new baseline', () => {
    const limiter = new LogRateLimiter(50);
    limiter.shouldEmit(1000); // baseline = 1000
    limiter.shouldEmit(1050); // baseline = 1050 (permitted)
    expect(limiter.shouldEmit(1080)).toBe(false); // 1080 - 1050 = 30 < 50
    expect(limiter.shouldEmit(1100)).toBe(true);  // 1100 - 1050 = 50 >= 50
  });
});
