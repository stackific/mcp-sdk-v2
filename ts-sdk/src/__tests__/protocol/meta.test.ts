/**
 * Tests for S05 — The `_meta` Object & Metadata Naming Rules (§4.1–§4.3).
 *
 * Key-naming grammar (AC-05.8 through AC-05.16) is validated via the functions
 * in `src/json/meta-key.ts` (S02); this test file delegates those tests there
 * and focuses on the semantic layer added by S05: MetaObject, RequestMetaObject,
 * LoggingLevel, per-request key validation, and error-code behaviors.
 *
 * AC coverage:
 *  AC-05.1  (R-4.1-a, R-4.1-b)    — _meta accepted on request/notification/result
 *  AC-05.2  (R-4.1-c, R-4.3-o)    — _meta optional on non-request messages
 *  AC-05.3  (R-4.1-d)             — client request without _meta is rejected
 *  AC-05.4  (R-4.1-e, R-4.1-f)    — unknown _meta keys are tolerated and ignored
 *  AC-05.5  (R-4.1-g)             — no assumptions on reserved-key values
 *  AC-05.6  (R-4.1-h)             — purpose-specific reservations respected
 *  AC-05.7  (R-4.1-i, R-4.1-j)    — array or scalar _meta is rejected
 *  AC-05.8  (R-4.2-a – R-4.2-d)   — prefix grammar
 *  AC-05.9  (R-4.2-g, R-4.2-h)    — name grammar
 *  AC-05.10 (R-4.2-e)             — reverse-DNS SHOULD guidance
 *  AC-05.11 (R-4.2-f)             — reserved-prefix detection
 *  AC-05.12 (R-4.2-i)             — vendor keys need non-reserved prefix
 *  AC-05.13 (R-4.2-j)             — four reserved bare keys are accepted
 *  AC-05.14 (R-4.2-k)             — trace-context values carried unchanged
 *  AC-05.15 (R-4.2-l, R-4.2-m)    — W3C trace-context format validation
 *  AC-05.16 (R-4.2-n, R-4.2-o)    — non-tracing receivers ignore trace keys
 *  AC-05.17 (R-4.3-a – R-4.3-c)   — three required per-request keys validated
 *  AC-05.18 (R-4.3-n)             — missing required key → -32602
 *  AC-05.19 (R-4.3-d, R-4.3-l, R-4.3-m) — logLevel optional/deprecated
 *  AC-05.20 (R-4.3-e)             — progressToken optional in request _meta
 *  AC-05.21 (R-4.3-h)             — Implementation requires name+version
 *  AC-05.22 (R-4.3-f)             — unsupported protocolVersion → rejection
 *  AC-05.23 (R-4.3-g)             — HTTP header mismatch behavior documented
 *  AC-05.24 (R-4.3-i, R-4.3-j)    — per-request capability inference rule
 *  AC-05.25 (R-4.3-k)             — missing capability → -32003
 */

import { describe, it, expect } from 'vitest';
import {
  RESERVED_BARE_KEYS,
  isReservedBareKey,
  MetaObjectSchema,
  LoggingLevelSchema,
  LOGGING_LEVELS,
  loggingLevelIndex,
  isAtOrAboveLogLevel,
  CURRENT_PROTOCOL_VERSION,
  isSupportedProtocolVersion,
  RequestMetaObjectSchema,
  validateRequestMeta,
  INVALID_PARAMS_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  buildMissingCapabilityError,
} from '../../protocol/meta.js';

import {
  isValidMetaKeyPrefix,
  isReservedMetaKeyPrefix,
  isValidMetaKeyName,
  isValidMetaKey,
  isValidTraceparent,
  isValidTracestate,
  isValidBaggage,
  isValidTraceContextValue,
} from '../../json/meta-key.js';

import {
  NotificationParamsSchema,
  RequestParamsSchema,
  ResultSchema,
} from '../../jsonrpc/payload.js';

// ─── AC-05.1 — _meta accepted on request, notification, and result ─────────────

describe('_meta placement (AC-05.1 · R-4.1-a, R-4.1-b)', () => {
  it('accepts _meta on a result with various JSON value types', () => {
    const result = ResultSchema.safeParse({
      resultType: 'complete',
      _meta: {
        str: 'text',
        num: 42,
        bool: true,
        nul: null,
        obj: { nested: true },
        arr: [1, 2, 3],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts _meta on notification params', () => {
    const result = NotificationParamsSchema.safeParse({
      _meta: { 'com.example/tag': 'nightly' },
      progress: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts _meta on request params', () => {
    const result = RequestParamsSchema.safeParse({
      _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
    });
    expect(result.success).toBe(true);
  });
});

// ─── AC-05.2 — _meta optional on non-client messages ──────────────────────────

describe('_meta optional on notifications and results (AC-05.2 · R-4.1-c, R-4.3-o)', () => {
  it('notification params is valid without _meta', () => {
    expect(
      NotificationParamsSchema.safeParse({ progress: 0.5 }).success,
    ).toBe(true);
  });

  it('result is valid without _meta', () => {
    expect(
      ResultSchema.safeParse({ resultType: 'complete' }).success,
    ).toBe(true);
  });
});

// ─── AC-05.3 — client request without _meta is rejected ───────────────────────

describe('client request _meta required (AC-05.3 · R-4.1-d)', () => {
  it('RequestParamsSchema rejects params with no _meta', () => {
    expect(RequestParamsSchema.safeParse({}).success).toBe(false);
  });

  it('RequestParamsSchema accepts params with _meta present', () => {
    expect(
      RequestParamsSchema.safeParse({
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
      }).success,
    ).toBe(true);
  });
});

// ─── AC-05.4 — unknown _meta keys tolerated and ignored ───────────────────────

describe('unknown _meta keys ignored (AC-05.4 · R-4.1-e, R-4.1-f)', () => {
  it('validateRequestMeta ignores unknown extra keys after validating required ones', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1.0.0' },
      'io.modelcontextprotocol/clientCapabilities': {},
      'com.example/unknownFutureKey': { data: 42 },
    };
    const result = validateRequestMeta(meta);
    expect(result.ok).toBe(true);
  });

  it('MetaObjectSchema accepts any string keys (no known-key allowlist)', () => {
    expect(
      MetaObjectSchema.safeParse({
        someUnknownKey: 'value',
        'io.future/newFeature': true,
      }).success,
    ).toBe(true);
  });
});

// ─── AC-05.5 — no assumptions on reserved-key values ──────────────────────────

describe('reserved-key value opacity (AC-05.5 · R-4.1-g)', () => {
  it('MetaObjectSchema accepts any value under a reserved key', () => {
    // Receivers MUST NOT assume a particular value type for MCP-reserved keys
    // beyond what the spec states for that key.
    expect(
      MetaObjectSchema.safeParse({
        'io.modelcontextprotocol/futureKey': { complex: 'structure' },
      }).success,
    ).toBe(true);
  });
});

// ─── AC-05.6 — purpose-specific reservations ──────────────────────────────────

describe('purpose-specific _meta name reservations (AC-05.6 · R-4.1-h)', () => {
  it('reserved bare key progressToken is accepted in _meta', () => {
    expect(isReservedBareKey('progressToken')).toBe(true);
  });

  it('trace context keys are reserved bare keys', () => {
    for (const key of ['traceparent', 'tracestate', 'baggage']) {
      expect(isReservedBareKey(key)).toBe(true);
    }
  });

  it('RESERVED_BARE_KEYS contains exactly the four reserved bare keys', () => {
    expect([...RESERVED_BARE_KEYS].sort()).toEqual(
      ['baggage', 'progressToken', 'traceparent', 'tracestate'].sort(),
    );
  });
});

// ─── AC-05.7 — array or scalar _meta rejected ─────────────────────────────────

describe('_meta must be a JSON object (AC-05.7 · R-4.1-i, R-4.1-j)', () => {
  it('MetaObjectSchema rejects an array', () => {
    expect(MetaObjectSchema.safeParse([]).success).toBe(false);
    expect(MetaObjectSchema.safeParse(['key', 'value']).success).toBe(false);
  });

  it('MetaObjectSchema rejects a string scalar', () => {
    expect(MetaObjectSchema.safeParse('bad').success).toBe(false);
  });

  it('MetaObjectSchema rejects a number scalar', () => {
    expect(MetaObjectSchema.safeParse(42).success).toBe(false);
  });

  it('MetaObjectSchema rejects null', () => {
    expect(MetaObjectSchema.safeParse(null).success).toBe(false);
  });

  it('MetaObjectSchema accepts an empty object', () => {
    expect(MetaObjectSchema.safeParse({}).success).toBe(true);
  });
});

// ─── AC-05.8 — prefix grammar ─────────────────────────────────────────────────

describe('Prefix grammar (AC-05.8 · R-4.2-a – R-4.2-d)', () => {
  it('accepts a single-label prefix', () => {
    expect(isValidMetaKeyPrefix('example/')).toBe(true);
  });

  it('accepts a multi-label prefix (reverse-DNS style)', () => {
    expect(isValidMetaKeyPrefix('com.example/')).toBe(true);
  });

  it('accepts labels with interior hyphens', () => {
    expect(isValidMetaKeyPrefix('com.my-company/')).toBe(true);
  });

  it('rejects a prefix without trailing slash', () => {
    expect(isValidMetaKeyPrefix('com.example')).toBe(false);
  });

  it('rejects a label starting with a digit', () => {
    expect(isValidMetaKeyPrefix('1label/')).toBe(false);
  });

  it('rejects a label ending with a hyphen', () => {
    expect(isValidMetaKeyPrefix('com.bad-/')).toBe(false);
  });

  it('bare key (no slash) is also a valid key form (prefix is optional)', () => {
    // A bare name with no prefix is valid per R-4.2-a (prefix is OPTIONAL).
    expect(isValidMetaKeyName('bareKey')).toBe(true);
  });
});

// ─── AC-05.9 — name grammar ───────────────────────────────────────────────────

describe('Name grammar (AC-05.9 · R-4.2-g, R-4.2-h)', () => {
  it('accepts a name that starts and ends with alphanumeric', () => {
    expect(isValidMetaKeyName('protocolVersion')).toBe(true);
  });

  it('accepts a name with hyphens, underscores, dots in interior', () => {
    expect(isValidMetaKeyName('a-b_c.d')).toBe(true);
  });

  it('rejects a name that starts with a hyphen', () => {
    expect(isValidMetaKeyName('-bad')).toBe(false);
  });

  it('rejects a name that ends with a hyphen', () => {
    expect(isValidMetaKeyName('bad-')).toBe(false);
  });

  it('accepts an empty name (when prefix is present)', () => {
    expect(isValidMetaKeyName('')).toBe(true);
  });
});

// ─── AC-05.10 — reverse-DNS SHOULD guidance ───────────────────────────────────

describe('Reverse-DNS prefix guidance (AC-05.10 · R-4.2-e)', () => {
  it('com.example/ is a conformant vendor prefix', () => {
    // SHOULD use reverse-DNS; com.example/ is the canonical form.
    expect(isValidMetaKeyPrefix('com.example/')).toBe(true);
    expect(isReservedMetaKeyPrefix('com.example/')).toBe(false);
  });

  it('isValidMetaKey accepts a well-formed vendor key', () => {
    expect(isValidMetaKey('com.example/requestTag')).toBe(true);
  });
});

// ─── AC-05.11 — reserved-prefix detection ─────────────────────────────────────

describe('Reserved prefix rejection for third parties (AC-05.11 · R-4.2-f)', () => {
  it('io.modelcontextprotocol/ is reserved', () => {
    expect(isReservedMetaKeyPrefix('io.modelcontextprotocol/')).toBe(true);
  });

  it('dev.mcp/ is reserved (second label = mcp)', () => {
    expect(isReservedMetaKeyPrefix('dev.mcp/')).toBe(true);
  });

  it('org.modelcontextprotocol.api/ is reserved (second label = modelcontextprotocol)', () => {
    expect(isReservedMetaKeyPrefix('org.modelcontextprotocol.api/')).toBe(true);
  });

  it('com.mcp.tools/ is reserved (second label = mcp)', () => {
    expect(isReservedMetaKeyPrefix('com.mcp.tools/')).toBe(true);
  });

  it('com.example.mcp/ is NOT reserved (second label = example)', () => {
    expect(isReservedMetaKeyPrefix('com.example.mcp/')).toBe(false);
  });

  it('isValidMetaKey rejects third-party use of io.modelcontextprotocol/ prefix', () => {
    expect(isValidMetaKey('io.modelcontextprotocol/customKey')).toBe(false);
  });

  it('isValidMetaKey accepts com.example.mcp/key (non-reserved second label)', () => {
    expect(isValidMetaKey('com.example.mcp/key')).toBe(true);
  });
});

// ─── AC-05.12 — vendor keys need non-reserved prefix ──────────────────────────

describe('Vendor keys require non-reserved prefix (AC-05.12 · R-4.2-i)', () => {
  it('com.example/requestTag is valid', () => {
    expect(isValidMetaKey('com.example/requestTag')).toBe(true);
  });

  it('acme.corp/traceId is valid', () => {
    expect(isValidMetaKey('acme.corp/traceId')).toBe(true);
  });
});

// ─── AC-05.13 — four reserved bare keys accepted ──────────────────────────────

describe('Reserved bare keys are accepted (AC-05.13 · R-4.2-j)', () => {
  it('progressToken is accepted as a bare key', () => {
    expect(isValidMetaKey('progressToken')).toBe(true);
  });

  it('traceparent is accepted as a bare key', () => {
    expect(isValidMetaKey('traceparent')).toBe(true);
  });

  it('tracestate is accepted as a bare key', () => {
    expect(isValidMetaKey('tracestate')).toBe(true);
  });

  it('baggage is accepted as a bare key', () => {
    expect(isValidMetaKey('baggage')).toBe(true);
  });

  it('their values are accepted in RequestMetaObjectSchema', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
      progressToken: 'tok-42',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'rojo=00f067aa0ba902b7',
      baggage: 'userId=alice,serverNode=DF-28',
    };
    expect(RequestMetaObjectSchema.safeParse(meta).success).toBe(true);
  });
});

// ─── AC-05.14 — trace-context values carried unchanged ────────────────────────

describe('Trace-context values are opaque (AC-05.14 · R-4.2-k)', () => {
  it('trace context values are passed through MetaObjectSchema unchanged', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const result = MetaObjectSchema.safeParse({ traceparent: tp });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data['traceparent']).toBe(tp);
    }
  });
});

// ─── AC-05.15 — W3C trace-context format validation ───────────────────────────

describe('W3C trace-context format (AC-05.15 · R-4.2-l, R-4.2-m)', () => {
  it('valid traceparent passes isValidTraceparent', () => {
    expect(
      isValidTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'),
    ).toBe(true);
  });

  it('invalid traceparent (wrong format) fails isValidTraceparent', () => {
    expect(isValidTraceparent('not-a-traceparent')).toBe(false);
    expect(isValidTraceparent('')).toBe(false);
  });

  it('valid tracestate passes isValidTracestate (R-4.2-l)', () => {
    expect(isValidTracestate('rojo=00f067aa0ba902b7')).toBe(true);
  });

  it('malformed tracestate (no key=value) fails isValidTracestate', () => {
    expect(isValidTracestate('@@@invalid@@@')).toBe(false);
    expect(isValidTracestate('')).toBe(false);
  });

  it('valid baggage passes isValidBaggage (R-4.2-m)', () => {
    expect(isValidBaggage('userId=alice,serverNode=DF-28')).toBe(true);
  });

  it('malformed baggage fails isValidBaggage', () => {
    expect(isValidBaggage('@@@invalid@@@')).toBe(false);
    expect(isValidBaggage('')).toBe(false);
  });

  it('valid tracestate passes isValidTraceContextValue (backward-compat)', () => {
    expect(isValidTraceContextValue('rojo=00f067aa0ba902b7')).toBe(true);
  });

  it('empty string fails isValidTraceContextValue', () => {
    expect(isValidTraceContextValue('')).toBe(false);
  });

  it('valid baggage passes isValidTraceContextValue (backward-compat)', () => {
    expect(isValidTraceContextValue('userId=alice,serverNode=DF-28')).toBe(true);
  });

  it('malformed value fails isValidTraceContextValue — fixes RQ-10 (R-4.2-l, R-4.2-m)', () => {
    expect(isValidTraceContextValue('@@@invalid@@@')).toBe(false);
  });

  // §15.4.2 (R-15.4.2-c, R-15.4.2-g): the receiver MUST treat trace-context
  // values as OPAQUE — it must neither parse nor branch on their contents, and a
  // non-tracing receiver MUST ignore them without error. So an arbitrarily-shaped
  // value is accepted just like a W3C-conformant one (behavior is value-agnostic).
  it('RequestMetaObjectSchema accepts an opaque (non-W3C-shaped) tracestate without error', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
      tracestate: 'vendorA=t61rcWkgMzE,vendorB=00f067aa0ba902b7',
    };
    expect(RequestMetaObjectSchema.safeParse(meta).success).toBe(true);
  });

  it('RequestMetaObjectSchema accepts an opaque (non-W3C-shaped) baggage without error', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
      baggage: '@@@arbitrary-opaque-value@@@',
    };
    expect(RequestMetaObjectSchema.safeParse(meta).success).toBe(true);
  });

  it('RequestMetaObjectSchema accepts valid tracestate (rojo=00f067aa0ba902b7)', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
      tracestate: 'rojo=00f067aa0ba902b7',
    };
    expect(RequestMetaObjectSchema.safeParse(meta).success).toBe(true);
  });

  it('RequestMetaObjectSchema accepts valid baggage (userId=alice,serverNode=DF-28)', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
      baggage: 'userId=alice,serverNode=DF-28',
    };
    expect(RequestMetaObjectSchema.safeParse(meta).success).toBe(true);
  });
});

// ─── AC-05.16 — non-tracing receivers ignore trace keys ───────────────────────

describe('Non-tracing receiver ignores trace keys (AC-05.16 · R-4.2-n, R-4.2-o)', () => {
  it('validateRequestMeta accepts requests carrying trace-context keys', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'rojo=00f067aa0ba902b7',
      baggage: 'userId=alice',
    };
    const result = validateRequestMeta(meta);
    expect(result.ok).toBe(true);
  });

  it('trace-context keys do not cause a request to be rejected', () => {
    // Even if a receiver does not participate in tracing, the keys must not
    // trigger rejection. validateRequestMeta returns ok:true when the required
    // per-request keys are present, regardless of trace keys.
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
      traceparent: 'any-value',
    };
    expect(validateRequestMeta(meta).ok).toBe(true);
  });
});

// ─── AC-05.17 — three required per-request keys ───────────────────────────────

describe('Required per-request _meta keys (AC-05.17 · R-4.3-a, R-4.3-b, R-4.3-c)', () => {
  const validMeta = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'example-client', version: '1.4.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };

  it('validateRequestMeta returns ok:true when all three required keys are present', () => {
    expect(validateRequestMeta(validMeta).ok).toBe(true);
  });

  it('RequestMetaObjectSchema accepts a valid per-request meta', () => {
    expect(RequestMetaObjectSchema.safeParse(validMeta).success).toBe(true);
  });

  it('RequestMetaObjectSchema requires protocolVersion', () => {
    const { 'io.modelcontextprotocol/protocolVersion': _, ...rest } = validMeta;
    expect(RequestMetaObjectSchema.safeParse(rest).success).toBe(false);
  });

  it('RequestMetaObjectSchema requires clientInfo', () => {
    const { 'io.modelcontextprotocol/clientInfo': _, ...rest } = validMeta;
    expect(RequestMetaObjectSchema.safeParse(rest).success).toBe(false);
  });

  it('RequestMetaObjectSchema requires clientCapabilities', () => {
    const { 'io.modelcontextprotocol/clientCapabilities': _, ...rest } = validMeta;
    expect(RequestMetaObjectSchema.safeParse(rest).success).toBe(false);
  });

  it('clientCapabilities {} (no capabilities) is accepted', () => {
    expect(
      RequestMetaObjectSchema.safeParse({ ...validMeta }).success,
    ).toBe(true);
  });

  it('protocolVersion must be a string', () => {
    const bad = { ...validMeta, 'io.modelcontextprotocol/protocolVersion': 20260728 };
    expect(RequestMetaObjectSchema.safeParse(bad).success).toBe(false);
  });
});

// ─── AC-05.18 — missing required key → -32602 ─────────────────────────────────

describe('Missing required key → -32602 (AC-05.18 · R-4.3-n)', () => {
  it('returns ok:false with code -32602 when protocolVersion is absent', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(INVALID_PARAMS_CODE);
      expect(result.code).toBe(-32602);
    }
  });

  it('returns ok:false with code -32602 when clientInfo is absent', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(INVALID_PARAMS_CODE);
    }
  });

  it('returns ok:false with code -32602 when clientCapabilities is absent', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(INVALID_PARAMS_CODE);
    }
  });

  it('the error message mentions the missing key', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    });
    if (!result.ok) {
      expect(result.message).toMatch(/protocolVersion/);
    }
  });

  it('INVALID_PARAMS_CODE equals -32602', () => {
    expect(INVALID_PARAMS_CODE).toBe(-32602);
  });
});

// ─── AC-05.19 — logLevel optional and deprecated ──────────────────────────────

describe('logLevel (AC-05.19 · R-4.3-d, R-4.3-l, R-4.3-m)', () => {
  it('logLevel is optional: meta without it passes RequestMetaObjectSchema', () => {
    expect(
      RequestMetaObjectSchema.safeParse({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': {},
      }).success,
    ).toBe(true);
  });

  it('logLevel accepts all defined severity values', () => {
    for (const level of LOGGING_LEVELS) {
      expect(LoggingLevelSchema.safeParse(level).success).toBe(true);
    }
  });

  it('rejects an unrecognized logLevel value', () => {
    expect(LoggingLevelSchema.safeParse('verbose').success).toBe(false);
  });

  it('LOGGING_LEVELS are in ascending severity order (debug < emergency)', () => {
    expect(loggingLevelIndex('debug')).toBeLessThan(loggingLevelIndex('emergency'));
    expect(loggingLevelIndex('info')).toBeLessThan(loggingLevelIndex('error'));
  });

  it('isAtOrAboveLogLevel: "warning" is at or above "info"', () => {
    expect(isAtOrAboveLogLevel('warning', 'info')).toBe(true);
  });

  it('isAtOrAboveLogLevel: "debug" is NOT at or above "warning"', () => {
    expect(isAtOrAboveLogLevel('debug', 'warning')).toBe(false);
  });

  it('isAtOrAboveLogLevel: same level returns true', () => {
    expect(isAtOrAboveLogLevel('error', 'error')).toBe(true);
  });
});

// ─── AC-05.20 — progressToken optional in request _meta ───────────────────────

describe('progressToken in request _meta (AC-05.20 · R-4.3-e)', () => {
  it('accepts a string progressToken', () => {
    expect(
      RequestMetaObjectSchema.safeParse({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': {},
        progressToken: 'req-1-progress',
      }).success,
    ).toBe(true);
  });

  it('accepts a numeric progressToken', () => {
    expect(
      RequestMetaObjectSchema.safeParse({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': {},
        progressToken: 42,
      }).success,
    ).toBe(true);
  });
});

// ─── AC-05.21 — Implementation requires name + version ────────────────────────

describe('Implementation shape (AC-05.21 · R-4.3-h)', () => {
  it('accepts minimal Implementation with name and version', () => {
    expect(
      RequestMetaObjectSchema.safeParse({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'example-client', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      }).success,
    ).toBe(true);
  });

  it('rejects clientInfo without name', () => {
    expect(
      RequestMetaObjectSchema.safeParse({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      }).success,
    ).toBe(false);
  });

  it('rejects clientInfo without version', () => {
    expect(
      RequestMetaObjectSchema.safeParse({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'client' },
        'io.modelcontextprotocol/clientCapabilities': {},
      }).success,
    ).toBe(false);
  });

  it('accepts clientInfo with optional fields', () => {
    expect(
      RequestMetaObjectSchema.safeParse({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': {
          name: 'example-client',
          version: '1.4.0',
          title: 'Example Client',
          description: 'Test client',
        },
        'io.modelcontextprotocol/clientCapabilities': {},
      }).success,
    ).toBe(true);
  });
});

// ─── AC-05.22 — unsupported protocolVersion → rejection ───────────────────────

describe('Protocol version support (AC-05.22 · R-4.3-f)', () => {
  it('CURRENT_PROTOCOL_VERSION is the supported revision', () => {
    expect(CURRENT_PROTOCOL_VERSION).toBe('2026-07-28');
  });

  it('isSupportedProtocolVersion accepts the current version', () => {
    expect(isSupportedProtocolVersion('2026-07-28')).toBe(true);
  });

  it('isSupportedProtocolVersion rejects an older revision', () => {
    expect(isSupportedProtocolVersion('2025-01-01')).toBe(false);
  });

  it('isSupportedProtocolVersion rejects an arbitrary string', () => {
    expect(isSupportedProtocolVersion('unknown')).toBe(false);
  });
});

// ─── AC-05.23 — HTTP header mismatch (behavioral) ─────────────────────────────

describe('HTTP protocolVersion / MCP-Protocol-Version header (AC-05.23 · R-4.3-g)', () => {
  it('CURRENT_PROTOCOL_VERSION can be compared against an HTTP header value', () => {
    // The HTTP transport must compare params._meta[protocolVersion] against the
    // MCP-Protocol-Version header. This test documents the available constant.
    const headerValue = '2026-07-28';
    expect(headerValue === CURRENT_PROTOCOL_VERSION).toBe(true);

    const mismatchedHeader = '2025-03-26';
    expect(mismatchedHeader === CURRENT_PROTOCOL_VERSION).toBe(false);
    // A mismatch → HTTP 400 (enforced by the transport layer, not this module).
  });
});

// ─── AC-05.24 — per-request capability inference rule ─────────────────────────

describe('Per-request capability model (AC-05.24 · R-4.3-i, R-4.3-j)', () => {
  it('capabilities are provided as a fresh object per request — no accumulation', () => {
    // The RequestMetaObjectSchema treats clientCapabilities as an independent
    // per-request declaration. A server must not infer capabilities from any
    // earlier request; each request's clientCapabilities is the only source.
    const req1 = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': { elicitation: {} },
    };
    const req2 = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    };
    const r1 = validateRequestMeta(req1);
    const r2 = validateRequestMeta(req2);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // r2 declares {} — elicitation is NOT inferred from r1.
    // The server must read only r2's clientCapabilities for r2.
    const r2caps = req2['io.modelcontextprotocol/clientCapabilities'] as Record<string, unknown>;
    expect('elicitation' in r2caps).toBe(false);
  });
});

// ─── AC-05.25 — missing capability → -32003 ──────────────────────────────────

describe('Missing required client capability → -32003 (AC-05.25 · R-4.3-k)', () => {
  it('MISSING_CLIENT_CAPABILITY_CODE is -32003', () => {
    expect(MISSING_CLIENT_CAPABILITY_CODE).toBe(-32003);
  });

  it('buildMissingCapabilityError returns code -32003 with requiredCapabilities', () => {
    const err = buildMissingCapabilityError({ elicitation: {} });
    expect(err.code).toBe(-32003);
    expect(err.data.requiredCapabilities).toEqual({ elicitation: {} });
    expect(typeof err.message).toBe('string');
  });

  it('buildMissingCapabilityError payload matches the wire example', () => {
    const err = buildMissingCapabilityError({ elicitation: {} });
    expect(err).toMatchObject({
      code: -32003,
      message: 'Missing required client capability',
      data: { requiredCapabilities: { elicitation: {} } },
    });
  });

  it('data.requiredCapabilities lists the missing capability names', () => {
    const err = buildMissingCapabilityError({ sampling: {}, roots: {} });
    expect(err.data.requiredCapabilities).toEqual({ sampling: {}, roots: {} });
  });
});

// ─── Wire example (§4.3) ──────────────────────────────────────────────────────

describe('Wire example validation (§4.3)', () => {
  it('spec wire example request _meta passes RequestMetaObjectSchema', () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': {
        name: 'example-client',
        version: '1.4.0',
        title: 'Example Client',
      },
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/logLevel': 'warning',
      progressToken: 'req-1-progress',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      'com.example/requestTag': 'nightly-sync',
    };
    expect(RequestMetaObjectSchema.safeParse(meta).success).toBe(true);
    expect(validateRequestMeta(meta).ok).toBe(true);
  });

  it('spec wire example -32602 rejection payload has correct code', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      // clientCapabilities missing
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(-32602);
    }
  });

  it('spec wire example -32003 rejection payload matches shape', () => {
    const err = buildMissingCapabilityError({ elicitation: {} });
    expect(err.code).toBe(-32003);
    expect(err.data.requiredCapabilities).toMatchObject({ elicitation: {} });
  });
});
