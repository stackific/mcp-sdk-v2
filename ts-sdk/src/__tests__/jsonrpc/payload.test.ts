/**
 * Tests for S04 — Result Base, Base Params, Error Object & Empty Result (§3.6–§3.9).
 *
 * AC coverage:
 *  AC-04.1  (R-3.6-c, R-3.6-h)  — result must carry `resultType`
 *  AC-04.2  (R-3.6-a)           — `_meta` optional on Result
 *  AC-04.3  (R-3.6-b)           — receiver does not act on unknown reserved `_meta` keys
 *  AC-04.4  (R-3.6-d)           — extra method-defined members accepted
 *  AC-04.5  (R-3.6-e)           — only defined / extension resultType values are conformant
 *  AC-04.6  (R-3.6-f, R-3.6-g) — unrecognized resultType → treat as error, read nothing
 *  AC-04.7  (R-3.6-i)           — absent resultType → treat as "complete"
 *  AC-04.8  (R-3.7-a)           — request params `_meta` is required
 *  AC-04.9  (R-3.7-b)           — notification params `_meta` is optional
 *  AC-04.10 (R-3.7-c)           — progress token permits but does not require notifications
 *  AC-04.11 (R-3.7-d)           — Cursor is opaque, never parsed
 *  AC-04.12 (R-3.8-a)           — Error `code` required integer
 *  AC-04.13 (R-3.8-b)           — error codes from §22 only (conformance rule)
 *  AC-04.14 (R-3.8-c, R-3.8-d) — Error `message` required string
 *  AC-04.15 (R-3.8-e)           — Error `data` optional
 *  AC-04.16 (R-3.8-f)           — receiver imposes no structure on `data`
 *  AC-04.17 (R-3.9-a)           — EmptyResult must set `resultType`
 *  AC-04.18 (R-3.9-b)           — EmptyResult may carry `_meta`; no extra members
 */

import { describe, it, expect } from 'vitest';
import {
  RESULT_TYPE,
  ResultTypeSchema,
  isKnownResultType,
  interpretResultType,
  ResultSchema,
  EmptyResultSchema,
  RequestParamsSchema,
  NotificationParamsSchema,
  ProgressTokenSchema,
  CursorSchema,
  McpErrorSchema,
} from '../../jsonrpc/payload.js';

// ─── AC-04.1 — resultType is required on Result ───────────────────────────────

describe('ResultSchema — resultType required (AC-04.1 · R-3.6-c, R-3.6-h)', () => {
  it('accepts a result with resultType present', () => {
    expect(
      ResultSchema.safeParse({ resultType: 'complete' }).success,
    ).toBe(true);
  });

  it('rejects a result with resultType absent — non-conformant sender', () => {
    expect(ResultSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a result whose resultType is not a string', () => {
    expect(ResultSchema.safeParse({ resultType: 42 }).success).toBe(false);
  });

  it('accepts resultType "complete"', () => {
    expect(
      ResultSchema.safeParse({ resultType: RESULT_TYPE.COMPLETE }).success,
    ).toBe(true);
  });

  it('accepts resultType "input_required"', () => {
    expect(
      ResultSchema.safeParse({ resultType: RESULT_TYPE.INPUT_REQUIRED }).success,
    ).toBe(true);
  });
});

// ─── AC-04.2 — _meta optional on Result ──────────────────────────────────────

describe('ResultSchema — _meta optional (AC-04.2 · R-3.6-a)', () => {
  it('is valid when _meta is absent', () => {
    expect(
      ResultSchema.safeParse({ resultType: 'complete' }).success,
    ).toBe(true);
  });

  it('is valid when _meta is present with string keys', () => {
    expect(
      ResultSchema.safeParse({
        resultType: 'complete',
        _meta: { 'io.modelcontextprotocol/revision': '2026-07-28' },
      }).success,
    ).toBe(true);
  });

  it('rejects when _meta is a non-object (e.g. string)', () => {
    expect(
      ResultSchema.safeParse({ resultType: 'complete', _meta: 'bad' }).success,
    ).toBe(false);
  });

  it('rejects when _meta is an array', () => {
    expect(
      ResultSchema.safeParse({ resultType: 'complete', _meta: [] }).success,
    ).toBe(false);
  });
});

// ─── AC-04.3 — unknown _meta keys not acted upon ─────────────────────────────

describe('Result _meta opacity (AC-04.3 · R-3.6-b)', () => {
  it('parses successfully when _meta contains MCP-reserved keys the receiver does not understand', () => {
    // The schema accepts any string-keyed object under _meta; the receiver
    // must not assign semantic meaning to unrecognized reserved keys.
    const parsed = ResultSchema.safeParse({
      resultType: 'complete',
      _meta: {
        'io.modelcontextprotocol/unknownFutureKey': { some: 'value' },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('_meta value can be any JSON type (opaque to the receiver)', () => {
    // Receivers must not assume the type of a _meta value they do not
    // recognize — any JSON type is valid.
    const parsed = ResultSchema.safeParse({
      resultType: 'complete',
      _meta: {
        stringVal: 'text',
        numberVal: 42,
        boolVal: true,
        nullVal: null,
        objVal: {},
        arrVal: [],
      },
    });
    expect(parsed.success).toBe(true);
  });
});

// ─── AC-04.4 — extra method-defined members accepted ─────────────────────────

describe('ResultSchema — extra method-defined members (AC-04.4 · R-3.6-d)', () => {
  it('accepts additional members alongside _meta and resultType', () => {
    const result = ResultSchema.safeParse({
      resultType: 'complete',
      tools: [],
      nextCursor: 'tok-abc',
    });
    expect(result.success).toBe(true);
  });

  it('extra members are preserved through parse (passthrough)', () => {
    const result = ResultSchema.safeParse({
      resultType: 'complete',
      tools: [{ name: 'search' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['tools']).toEqual([
        { name: 'search' },
      ]);
    }
  });
});

// ─── AC-04.5 — only defined/extension resultType values are conformant ────────

describe('ResultType defined values (AC-04.5 · R-3.6-e)', () => {
  it('RESULT_TYPE.COMPLETE equals the string "complete"', () => {
    expect(RESULT_TYPE.COMPLETE).toBe('complete');
  });

  it('RESULT_TYPE.INPUT_REQUIRED equals the string "input_required"', () => {
    expect(RESULT_TYPE.INPUT_REQUIRED).toBe('input_required');
  });

  it('isKnownResultType returns true for "complete"', () => {
    expect(isKnownResultType('complete')).toBe(true);
  });

  it('isKnownResultType returns true for "input_required"', () => {
    expect(isKnownResultType('input_required')).toBe(true);
  });

  it('isKnownResultType returns false for an arbitrary string — outside defined set', () => {
    expect(isKnownResultType('x-custom-vendor-type')).toBe(false);
  });

  it('isKnownResultType returns false for an empty string', () => {
    expect(isKnownResultType('')).toBe(false);
  });
});

// ─── AC-04.6 — unrecognized resultType → treat whole response as error ────────

describe('interpretResultType — unrecognized value (AC-04.6 · R-3.6-f, R-3.6-g)', () => {
  it('returns recognized:false for an unknown resultType', () => {
    const outcome = interpretResultType({ resultType: 'x-future-type', extra: 'data' });
    expect(outcome.recognized).toBe(false);
  });

  it('carries the raw unrecognized value in the result', () => {
    const outcome = interpretResultType({ resultType: 'some-unknown' });
    expect(outcome.recognized).toBe(false);
    if (!outcome.recognized) {
      expect(outcome.resultType).toBe('some-unknown');
    }
  });

  it('R-3.6-g: caller must not read extra members when recognized is false', () => {
    // The library cannot enforce this at the type level for arbitrary callers,
    // but the discriminant makes the obligation explicit.
    const outcome = interpretResultType({ resultType: 'exotic', tools: ['must-not-read'] });
    expect(outcome.recognized).toBe(false);
    // A correct receiver branches here and does NOT access .tools.
  });

  it('returns recognized:true for "complete"', () => {
    const outcome = interpretResultType({ resultType: 'complete' });
    expect(outcome.recognized).toBe(true);
    if (outcome.recognized) {
      expect(outcome.resultType).toBe('complete');
    }
  });

  it('returns recognized:true for "input_required"', () => {
    const outcome = interpretResultType({ resultType: 'input_required' });
    expect(outcome.recognized).toBe(true);
    if (outcome.recognized) {
      expect(outcome.resultType).toBe('input_required');
    }
  });
});

// ─── AC-04.7 — absent resultType → treat as "complete" ───────────────────────

describe('interpretResultType — absent resultType interop fallback (AC-04.7 · R-3.6-i)', () => {
  it('treats a missing resultType field as "complete"', () => {
    const outcome = interpretResultType({ tools: [] });
    expect(outcome.recognized).toBe(true);
    if (outcome.recognized) {
      expect(outcome.resultType).toBe('complete');
    }
  });

  it('treats an explicit null resultType as "complete"', () => {
    const outcome = interpretResultType({ resultType: null });
    expect(outcome.recognized).toBe(true);
    if (outcome.recognized) {
      expect(outcome.resultType).toBe('complete');
    }
  });

  it('treats an explicit undefined resultType as "complete"', () => {
    const outcome = interpretResultType({ resultType: undefined });
    expect(outcome.recognized).toBe(true);
    if (outcome.recognized) {
      expect(outcome.resultType).toBe('complete');
    }
  });
});

// ─── AC-04.8 — request params _meta is required ──────────────────────────────

describe('RequestParamsSchema — _meta required (AC-04.8 · R-3.7-a)', () => {
  it('accepts params with _meta present', () => {
    expect(
      RequestParamsSchema.safeParse({
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects params with _meta absent', () => {
    expect(RequestParamsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects params where _meta is not an object', () => {
    expect(RequestParamsSchema.safeParse({ _meta: 'bad' }).success).toBe(false);
  });

  it('accepts empty _meta object (only protocol-specific fields may be absent)', () => {
    expect(RequestParamsSchema.safeParse({ _meta: {} }).success).toBe(true);
  });

  it('extra method-specific params are preserved (passthrough)', () => {
    const result = RequestParamsSchema.safeParse({
      _meta: {},
      cursor: 'tok-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['cursor']).toBe('tok-1');
    }
  });
});

// ─── AC-04.9 — notification params _meta is optional ─────────────────────────

describe('NotificationParamsSchema — _meta optional (AC-04.9 · R-3.7-b)', () => {
  it('accepts params without _meta', () => {
    expect(
      NotificationParamsSchema.safeParse({ progress: 0.5 }).success,
    ).toBe(true);
  });

  it('accepts params with _meta present', () => {
    expect(
      NotificationParamsSchema.safeParse({ _meta: { traceId: 'abc' } }).success,
    ).toBe(true);
  });

  it('rejects when _meta is present but not an object', () => {
    expect(
      NotificationParamsSchema.safeParse({ _meta: 123 }).success,
    ).toBe(false);
  });

  it('notification-specific members are preserved (passthrough)', () => {
    const result = NotificationParamsSchema.safeParse({
      progressToken: 'tok-abc',
      progress: 0.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['progress']).toBe(0.5);
    }
  });
});

// ─── AC-04.10 — ProgressToken type + optional receiver obligation ─────────────

describe('ProgressToken (AC-04.10 · R-3.7-c)', () => {
  it('accepts a string progress token', () => {
    expect(ProgressTokenSchema.safeParse('abc-123').success).toBe(true);
  });

  it('accepts a numeric progress token', () => {
    expect(ProgressTokenSchema.safeParse(7).success).toBe(true);
  });

  it('accepts numeric token 0', () => {
    expect(ProgressTokenSchema.safeParse(0).success).toBe(true);
  });

  it('rejects null — not string or number', () => {
    expect(ProgressTokenSchema.safeParse(null).success).toBe(false);
  });

  it('rejects boolean — not string or number', () => {
    expect(ProgressTokenSchema.safeParse(true).success).toBe(false);
  });

  it('rejects object — not string or number', () => {
    expect(ProgressTokenSchema.safeParse({}).success).toBe(false);
  });
});

// ─── AC-04.11 — Cursor is opaque ─────────────────────────────────────────────

describe('Cursor — opaque string (AC-04.11 · R-3.7-d)', () => {
  it('accepts any non-empty string as a cursor', () => {
    expect(CursorSchema.safeParse('eyJwYWdlIjozfQ==').success).toBe(true);
  });

  it('accepts an empty string cursor', () => {
    // Spec does not prohibit empty strings; opaqueness means the receiver
    // must not parse or assume structure regardless of content.
    expect(CursorSchema.safeParse('').success).toBe(true);
  });

  it('rejects a non-string cursor', () => {
    expect(CursorSchema.safeParse(42).success).toBe(false);
  });

  it('rejects null cursor', () => {
    expect(CursorSchema.safeParse(null).success).toBe(false);
  });
});

// ─── AC-04.12 — Error code is a required integer ──────────────────────────────

describe('McpErrorSchema — code (AC-04.12 · R-3.8-a)', () => {
  it('accepts a well-formed error with integer code', () => {
    expect(
      McpErrorSchema.safeParse({ code: -32601, message: 'Method not found' }).success,
    ).toBe(true);
  });

  it('rejects when code is absent', () => {
    expect(McpErrorSchema.safeParse({ message: 'oops' }).success).toBe(false);
  });

  it('rejects a fractional code', () => {
    expect(
      McpErrorSchema.safeParse({ code: -32601.5, message: 'err' }).success,
    ).toBe(false);
  });

  it('rejects a string code', () => {
    expect(
      McpErrorSchema.safeParse({ code: '-32601', message: 'err' }).success,
    ).toBe(false);
  });

  it('accepts code 0', () => {
    expect(McpErrorSchema.safeParse({ code: 0, message: 'err' }).success).toBe(true);
  });

  it('accepts a large negative integer code', () => {
    expect(
      McpErrorSchema.safeParse({ code: -32700, message: 'Parse error' }).success,
    ).toBe(true);
  });
});

// ─── AC-04.13 — error codes only from §22 (conformance rule) ─────────────────

describe('McpErrorSchema — code assignment conformance (AC-04.13 · R-3.8-b)', () => {
  it('schema accepts any integer — code-range conformance is a protocol rule, not a parse rule', () => {
    // The schema enforces the integer type; the legal value set is defined in
    // §22 / S34. Implementations MUST NOT assign codes outside those rules (R-3.8-b).
    // This test documents that constraint: the schema cannot enumerate all §22
    // codes, so conformance is the implementation's responsibility.
    expect(
      McpErrorSchema.safeParse({ code: 99999, message: 'non-standard' }).success,
    ).toBe(true);
  });
});

// ─── AC-04.14 — Error message is a required string ────────────────────────────

describe('McpErrorSchema — message (AC-04.14 · R-3.8-c, R-3.8-d)', () => {
  it('accepts a short single-sentence message', () => {
    expect(
      McpErrorSchema.safeParse({
        code: -32601,
        message: 'Method not found.',
      }).success,
    ).toBe(true);
  });

  it('rejects when message is absent', () => {
    expect(McpErrorSchema.safeParse({ code: -32601 }).success).toBe(false);
  });

  it('rejects a non-string message', () => {
    expect(
      McpErrorSchema.safeParse({ code: -32601, message: 42 }).success,
    ).toBe(false);
  });

  it('accepts a multi-sentence message (SHOULD not MUST — not a hard failure)', () => {
    // R-3.8-d uses SHOULD; this is a deviation requiring documentation,
    // not a parse error.
    expect(
      McpErrorSchema.safeParse({
        code: -32600,
        message: 'Invalid request. The id field must be a string or number.',
      }).success,
    ).toBe(true);
  });
});

// ─── AC-04.15 — Error data is optional ───────────────────────────────────────

describe('McpErrorSchema — data optional (AC-04.15 · R-3.8-e)', () => {
  it('is valid when data is absent', () => {
    expect(
      McpErrorSchema.safeParse({ code: -32601, message: 'Method not found' }).success,
    ).toBe(true);
  });

  it('accepts data as an object', () => {
    expect(
      McpErrorSchema.safeParse({
        code: -32601,
        message: 'Method not found',
        data: { method: 'tools/list' },
      }).success,
    ).toBe(true);
  });

  it('accepts data as a string', () => {
    expect(
      McpErrorSchema.safeParse({
        code: -32601,
        message: 'err',
        data: 'extra detail',
      }).success,
    ).toBe(true);
  });

  it('accepts data as a number', () => {
    expect(
      McpErrorSchema.safeParse({ code: -32601, message: 'err', data: 123 }).success,
    ).toBe(true);
  });

  it('accepts data as an array', () => {
    expect(
      McpErrorSchema.safeParse({
        code: -32601,
        message: 'err',
        data: [{ field: 'name', issue: 'required' }],
      }).success,
    ).toBe(true);
  });

  it('accepts data as null', () => {
    expect(
      McpErrorSchema.safeParse({ code: -32601, message: 'err', data: null }).success,
    ).toBe(true);
  });
});

// ─── AC-04.16 — receiver imposes no structure on data ────────────────────────

describe('McpErrorSchema — data is opaque to the receiver (AC-04.16 · R-3.8-f)', () => {
  it('accepts any data shape — structure is sender-defined', () => {
    // Receivers MUST NOT assume particular structure unless the specific code
    // defines one in §22 / S34. The schema enforces this by typing data as unknown.
    const shapes = [
      null,
      42,
      'string',
      [],
      {},
      { nested: { deep: true } },
      [1, 'two', null],
    ];
    for (const data of shapes) {
      expect(
        McpErrorSchema.safeParse({ code: -32603, message: 'Internal error', data }).success,
      ).toBe(true);
    }
  });
});

// ─── AC-04.17 — EmptyResult must set resultType ───────────────────────────────

describe('EmptyResultSchema — resultType required (AC-04.17 · R-3.9-a)', () => {
  it('accepts a minimal EmptyResult with only resultType', () => {
    expect(
      EmptyResultSchema.safeParse({ resultType: 'complete' }).success,
    ).toBe(true);
  });

  it('rejects an EmptyResult missing resultType', () => {
    expect(EmptyResultSchema.safeParse({}).success).toBe(false);
  });

  it('resultType is normally "complete"', () => {
    const result = EmptyResultSchema.safeParse({ resultType: RESULT_TYPE.COMPLETE });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resultType).toBe('complete');
    }
  });
});

// ─── AC-04.18 — EmptyResult may carry _meta; no extra members ─────────────────

describe('EmptyResultSchema — _meta optional, no extra members (AC-04.18 · R-3.9-b)', () => {
  it('accepts _meta alongside resultType', () => {
    expect(
      EmptyResultSchema.safeParse({
        resultType: 'complete',
        _meta: { 'io.modelcontextprotocol/traceId': 'x' },
      }).success,
    ).toBe(true);
  });

  it('extra members are not preserved — EmptyResult carries no method-specific members', () => {
    // Senders MUST NOT include extra members (R-3.9-b). The schema strips them,
    // confirming the shape definition carries only _meta and resultType.
    const result = EmptyResultSchema.safeParse({
      resultType: 'complete',
      unexpectedField: 'should be stripped',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('unexpectedField' in result.data).toBe(false);
    }
  });

  it('parsed EmptyResult contains only resultType when _meta is absent', () => {
    const result = EmptyResultSchema.safeParse({ resultType: 'complete' });
    expect(result.success).toBe(true);
    if (result.success) {
      const keys = Object.keys(result.data);
      expect(keys).toEqual(['resultType']);
    }
  });

  it('parsed EmptyResult contains resultType and _meta when _meta is present', () => {
    const result = EmptyResultSchema.safeParse({
      resultType: 'complete',
      _meta: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const keys = Object.keys(result.data).sort();
      expect(keys).toEqual(['_meta', 'resultType']);
    }
  });
});

// ─── Wire examples from the spec (§3.10) ─────────────────────────────────────

describe('Spec wire examples — S04 (§3.10)', () => {
  it('request params wire example — required _meta present', () => {
    const params = {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'ExampleClient', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    };
    expect(RequestParamsSchema.safeParse(params).success).toBe(true);
  });

  it('notification params wire example — _meta omitted', () => {
    const params = { progressToken: 'abc-123', progress: 0.5 };
    expect(NotificationParamsSchema.safeParse(params).success).toBe(true);
  });

  it('success response result wire example — resultType + method member', () => {
    const result = { resultType: 'complete', tools: [] };
    const parsed = ResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.resultType).toBe('complete');
      expect((parsed.data as Record<string, unknown>)['tools']).toEqual([]);
    }
  });

  it('error response error wire example — code + message + data', () => {
    const error = {
      code: -32601,
      message: 'Method not found',
      data: { method: 'tools/list' },
    };
    const parsed = McpErrorSchema.safeParse(error);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe(-32601);
      expect(parsed.data.message).toBe('Method not found');
    }
  });

  it('empty success result wire example — resultType only', () => {
    const result = { resultType: 'complete' };
    const parsed = EmptyResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.resultType).toBe('complete');
    }
  });

  it('interpretResultType on the success wire example returns complete+recognized', () => {
    const outcome = interpretResultType({ resultType: 'complete', tools: [] });
    expect(outcome.recognized).toBe(true);
    if (outcome.recognized) {
      expect(outcome.resultType).toBe('complete');
    }
  });
});

// ─── ResultTypeSchema standalone ─────────────────────────────────────────────

describe('ResultTypeSchema (standalone)', () => {
  it('accepts any non-empty string', () => {
    expect(ResultTypeSchema.safeParse('complete').success).toBe(true);
    expect(ResultTypeSchema.safeParse('input_required').success).toBe(true);
    expect(ResultTypeSchema.safeParse('x-vendor-custom').success).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(ResultTypeSchema.safeParse(1).success).toBe(false);
    expect(ResultTypeSchema.safeParse(null).success).toBe(false);
    expect(ResultTypeSchema.safeParse(true).success).toBe(false);
  });
});
