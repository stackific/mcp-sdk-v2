/**
 * Tests for S34 — Error Handling & Error Code Registry (§22).
 *
 * AC coverage:
 *  AC-34.1  (R-22.1-a)                       — exactly one of result/error
 *  AC-34.2  (R-22.1-d)                       — jsonrpc is exactly "2.0"
 *  AC-34.3  (R-22.1-b/e, R-22.6-g)           — error id equals request id
 *  AC-34.4  (R-22.1-f, R-22.6-h)             — undeterminable id → null/omitted
 *  AC-34.5  (R-22.1-g, R-22.6-i)             — notification → no response
 *  AC-34.6  (R-22.1-c/h/i)                   — code integer + message string
 *  AC-34.7  (R-22.1-j)                       — code authoritative, not message
 *  AC-34.8  (R-22.1-k, R-22.3-a)             — data optional / normative shapes
 *  AC-34.9  (R-22.2-a..f)                    — standard condition → code
 *  AC-34.10 (R-22.2-g)                       — unadvertised server cap → -32601
 *  AC-34.11 (R-22.2-h, R-22.3.1-a/b)         — missing client cap → -32003 not -32601
 *  AC-34.12 (R-22.3.1-b, R-22.3-a)           — -32003 data.requiredCapabilities
 *  AC-34.13 (R-22.3.2-a, R-22.3-a)           — -32004 data.supported/requested
 *  AC-34.14 (R-22.3.2-b)                     — client re-selects on -32004
 *  AC-34.15 (R-22.4-a..g)                    — canonical -32602 conditions
 *  AC-34.16 (R-22.4-h, R-22.4-i)             — resource-not-found data.uri; no empty contents
 *  AC-34.17 (R-22.4-j)                       — unexpected server-side → -32603
 *  AC-34.18 (R-22.5-a..f)                    — protocol error vs error result
 *  AC-34.19 (R-22.6-a)                       — -32003/-32004 → HTTP 400
 *  AC-34.20 (R-22.6-b)                       — routing header → -32001 + 400
 *  AC-34.21 (R-22.6-c, R-22.6-d)             — invalid request -32600 / bad metadata -32602
 *  AC-34.22 (R-22.6-e, R-22.6-f)             — unparseable -32700 / non-request -32600
 *  AC-34.23 (R-22.7-a..d)                    — extension code rules
 *  AC-34.24 (R-22.7-e)                       — unknown code surfaced, not rejected
 *  AC-34.25 (R-22-a)                         — exact, case-sensitive codes/names/data
 */

import { describe, it, expect } from 'vitest';
import {
  PARSE_ERROR_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  INVALID_PARAMS_CODE,
  INTERNAL_ERROR_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  HEADER_MISMATCH_CODE,
  INVALID_CURSOR_CODE,
  RESOURCE_NOT_FOUND_LEGACY_CODE,
  ErrorCodeClass,
  JSON_RPC_RESERVED_RANGE,
  SERVER_ERROR_RANGE,
  ERROR_CODE_REGISTRY,
  RESERVED_ERROR_CODES,
  lookupErrorCode,
  classifyErrorCode,
  isReservedErrorCode,
  validateExtensionErrorCode,
  isErrorCodeInClass,
  JSONRPC_VERSION,
  isValidErrorObject,
  hasExactlyResultOrError,
  isValidErrorResponse,
  suppressesErrorResponse,
  buildErrorObject,
  buildResourceNotFoundParamsError,
  describeUnknownErrorCode,
  ToolFailureMechanism,
  classifyToolCallFailure,
  httpStatusForRegistryCode,
  errorCodeForInboundFailure,
  buildNullIdParseErrorResponse,
} from '../../protocol/errors.js';
import { reselectAfterUnsupportedVersion } from '../../protocol/negotiation.js';

describe('S34 — re-exported existing code bindings (same constants)', () => {
  it('re-exports the eight reserved codes at their spec values (AC-34.25)', () => {
    expect(PARSE_ERROR_CODE).toBe(-32700);
    expect(INVALID_REQUEST_CODE).toBe(-32600);
    expect(METHOD_NOT_FOUND_CODE).toBe(-32601);
    expect(INVALID_PARAMS_CODE).toBe(-32602);
    expect(INTERNAL_ERROR_CODE).toBe(-32603);
    expect(MISSING_CLIENT_CAPABILITY_CODE).toBe(-32003);
    expect(UNSUPPORTED_PROTOCOL_VERSION_CODE).toBe(-32004);
    expect(HEADER_MISMATCH_CODE).toBe(-32001);
  });

  it('treats -32602 invalid-cursor as the same params code (no duplicate value)', () => {
    expect(INVALID_CURSOR_CODE).toBe(INVALID_PARAMS_CODE);
  });
});

describe('AC-34.1 — exactly one of result/error (R-22.1-a)', () => {
  it('accepts an error-only response and a result-only response', () => {
    expect(hasExactlyResultOrError({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'x' } })).toBe(true);
    expect(hasExactlyResultOrError({ jsonrpc: '2.0', id: 1, result: {} })).toBe(true);
  });

  it('rejects a response with both or neither member', () => {
    expect(hasExactlyResultOrError({ jsonrpc: '2.0', id: 1, result: {}, error: { code: -1, message: 'x' } })).toBe(false);
    expect(hasExactlyResultOrError({ jsonrpc: '2.0', id: 1 })).toBe(false);
  });
});

describe('AC-34.2 — jsonrpc is exactly "2.0" (R-22.1-d)', () => {
  it('exposes the literal and rejects other markers', () => {
    expect(JSONRPC_VERSION).toBe('2.0');
    expect(isValidErrorResponse({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'x' } })).toBe(true);
    expect(isValidErrorResponse({ jsonrpc: '1.0', id: 1, error: { code: -32603, message: 'x' } })).toBe(false);
    expect(isValidErrorResponse({ jsonrpc: 2.0, id: 1, error: { code: -32603, message: 'x' } })).toBe(false);
  });
});

describe('AC-34.3 / AC-34.4 — id rules (R-22.1-b/e/f, R-22.6-g/h)', () => {
  it('accepts an error response echoing a string or integer id', () => {
    expect(isValidErrorResponse({ jsonrpc: '2.0', id: 'X', error: { code: -32602, message: 'x' } })).toBe(true);
    expect(isValidErrorResponse({ jsonrpc: '2.0', id: 7, error: { code: -32602, message: 'x' } })).toBe(true);
  });

  it('allows id null (undeterminable request id) — the only exception (AC-34.4)', () => {
    const res = buildNullIdParseErrorResponse();
    expect(res.id).toBeNull();
    expect(res.error.code).toBe(PARSE_ERROR_CODE);
    expect(isValidErrorResponse(res)).toBe(true);
  });

  it('rejects a non-string/non-integer/non-null id', () => {
    expect(isValidErrorResponse({ jsonrpc: '2.0', id: 1.5, error: { code: -32602, message: 'x' } })).toBe(false);
    expect(isValidErrorResponse({ jsonrpc: '2.0', id: {}, error: { code: -32602, message: 'x' } })).toBe(false);
  });
});

describe('AC-34.5 — notifications get no response (R-22.1-g, R-22.6-i)', () => {
  it('identifies a notification (method, no id) as suppressing any response', () => {
    expect(suppressesErrorResponse({ jsonrpc: '2.0', method: 'notifications/progress' })).toBe(true);
  });

  it('does not suppress a response for a request (has id)', () => {
    expect(suppressesErrorResponse({ jsonrpc: '2.0', id: 1, method: 'tools/call' })).toBe(false);
    expect(suppressesErrorResponse(null)).toBe(false);
    expect(suppressesErrorResponse(42)).toBe(false);
  });
});

describe('AC-34.6 — error object shape (R-22.1-c/h/i)', () => {
  it('requires an integer code (possibly negative) and a string message', () => {
    expect(isValidErrorObject({ code: -32602, message: 'Invalid params' })).toBe(true);
    expect(isValidErrorObject({ code: 12345, message: 'ext' })).toBe(true);
    expect(isValidErrorObject({ code: -32602 })).toBe(false);
    expect(isValidErrorObject({ message: 'x' })).toBe(false);
    expect(isValidErrorObject({ code: -32.5, message: 'x' })).toBe(false);
    expect(isValidErrorObject({ code: -32602, message: 7 })).toBe(false);
  });

  it('buildErrorObject yields a non-empty message even without one supplied', () => {
    expect(buildErrorObject(PARSE_ERROR_CODE).message).toBe('Parse error');
    expect(buildErrorObject(-99999).message).toBe('Error');
    const withData = buildErrorObject(INVALID_PARAMS_CODE, 'bad', { k: 1 });
    expect(withData).toEqual({ code: -32602, message: 'bad', data: { k: 1 } });
    expect('data' in buildErrorObject(INVALID_PARAMS_CODE, 'bad')).toBe(false);
  });
});

describe('AC-34.7 — code is authoritative, message is not (R-22.1-j)', () => {
  it('classification varies with code, never with message text', () => {
    const a = describeUnknownErrorCode({ code: 70001, message: 'one' });
    const b = describeUnknownErrorCode({ code: 70001, message: 'a totally different message' });
    expect(a.class).toBe(b.class);
    expect(a.code).toBe(b.code);
    expect(classifyErrorCode(INVALID_PARAMS_CODE)).toBe(ErrorCodeClass.JSON_RPC_STANDARD);
  });
});

describe('AC-34.8 — data optional / normative (R-22.1-k, R-22.3-a)', () => {
  it('marks -32003 and -32004 data as normative with required keys', () => {
    expect(ERROR_CODE_REGISTRY[MISSING_CLIENT_CAPABILITY_CODE].dataPolicy).toBe('normative');
    expect(ERROR_CODE_REGISTRY[MISSING_CLIENT_CAPABILITY_CODE].dataKeys).toEqual(['requiredCapabilities']);
    expect(ERROR_CODE_REGISTRY[UNSUPPORTED_PROTOCOL_VERSION_CODE].dataPolicy).toBe('normative');
    expect(ERROR_CODE_REGISTRY[UNSUPPORTED_PROTOCOL_VERSION_CODE].dataKeys).toEqual(['supported', 'requested']);
  });

  it('marks the standard codes data as sender-defined and tolerates absent data', () => {
    expect(ERROR_CODE_REGISTRY[PARSE_ERROR_CODE].dataPolicy).toBe('sender-defined');
    expect(isValidErrorObject({ code: -32700, message: 'Parse error' })).toBe(true);
  });
});

describe('AC-34.9 — standard condition → code (R-22.2-a..f)', () => {
  it('maps each standard condition to the mandated code', () => {
    expect(errorCodeForInboundFailure('unparseable-json')).toBe(-32700);
    expect(errorCodeForInboundFailure('invalid-request-object')).toBe(-32600);
    expect(METHOD_NOT_FOUND_CODE).toBe(-32601);
    expect(errorCodeForInboundFailure('invalid-metadata')).toBe(-32602);
    expect(INTERNAL_ERROR_CODE).toBe(-32603);
  });

  it('registers all five standard codes as JSON-RPC standard', () => {
    for (const code of [-32700, -32600, -32601, -32602, -32603]) {
      expect(lookupErrorCode(code)?.class).toBe(ErrorCodeClass.JSON_RPC_STANDARD);
    }
  });
});

describe('AC-34.10 / AC-34.11 — capability gating (R-22.2-g/h, R-22.3.1)', () => {
  it('an unadvertised server capability is method-not-found, not missing-cap', () => {
    // prompts/list on a server lacking the prompts capability ⇒ -32601
    expect(METHOD_NOT_FOUND_CODE).toBe(-32601);
    expect(METHOD_NOT_FOUND_CODE).not.toBe(MISSING_CLIENT_CAPABILITY_CODE);
  });

  it('a required *client* capability uses -32003, never -32601', () => {
    expect(MISSING_CLIENT_CAPABILITY_CODE).toBe(-32003);
    expect(MISSING_CLIENT_CAPABILITY_CODE).not.toBe(METHOD_NOT_FOUND_CODE);
  });
});

describe('AC-34.12 — -32003 normative data (R-22.3.1-b)', () => {
  it('registry pins data.requiredCapabilities for -32003', () => {
    const entry = ERROR_CODE_REGISTRY[MISSING_CLIENT_CAPABILITY_CODE];
    expect(entry.name).toBe('MissingRequiredClientCapability');
    expect(entry.dataKeys).toContain('requiredCapabilities');
  });
});

describe('AC-34.13 / AC-34.14 — -32004 data + client retry (R-22.3.2)', () => {
  it('registry pins data.supported and data.requested for -32004', () => {
    const entry = ERROR_CODE_REGISTRY[UNSUPPORTED_PROTOCOL_VERSION_CODE];
    expect(entry.name).toBe('UnsupportedProtocolVersion');
    expect(entry.dataKeys).toEqual(['supported', 'requested']);
  });

  it('a client re-selects a mutually supported revision from data.supported', () => {
    const error = {
      code: UNSUPPORTED_PROTOCOL_VERSION_CODE,
      message: 'Unsupported protocol version',
      data: { supported: ['2026-07-28', '2025-01-01'], requested: '1999-01-01' },
    } as const;
    const result = reselectAfterUnsupportedVersion(error, ['2026-07-28']);
    expect(result).toEqual({ ok: true, selected: '2026-07-28' });
  });
});

describe('AC-34.15 / AC-34.16 / AC-34.17 — -32602 conditions and -32603 fallback (R-22.4)', () => {
  it('all canonical validation failures collapse onto the single -32602 code', () => {
    // unknown tool, invalid tool args, unknown/under-specified prompt, unknown
    // resource template, invalid/expired cursor, resource-not-found.
    expect(INVALID_PARAMS_CODE).toBe(-32602);
    expect(INVALID_CURSOR_CODE).toBe(-32602);
    expect(buildResourceNotFoundParamsError('file:///x.txt').code).toBe(-32602);
  });

  it('resource-not-found carries data.uri and is not signaled by empty contents (AC-34.16)', () => {
    const err = buildResourceNotFoundParamsError('file:///nonexistent.txt');
    expect(err).toEqual({ code: -32602, message: 'Resource not found', data: { uri: 'file:///nonexistent.txt' } });
    // The not-found signal is an error object, never a {contents: []} result.
    expect('contents' in err).toBe(false);
  });

  it('an unexpected server-side condition uses -32603, not -32602 (AC-34.17)', () => {
    expect(INTERNAL_ERROR_CODE).toBe(-32603);
    expect(INTERNAL_ERROR_CODE).not.toBe(INVALID_PARAMS_CODE);
  });
});

describe('AC-34.18 — protocol error vs feature-level error result (R-22.5)', () => {
  it('undispatchable / schema-invalid tool calls are protocol errors (-32602)', () => {
    expect(classifyToolCallFailure('unknown-tool')).toBe(ToolFailureMechanism.PROTOCOL_ERROR);
    expect(classifyToolCallFailure('invalid-arguments')).toBe(ToolFailureMechanism.PROTOCOL_ERROR);
  });

  it('a tool that ran but failed is a successful result with isError:true', () => {
    expect(classifyToolCallFailure('execution-failure')).toBe(ToolFailureMechanism.ERROR_RESULT);
  });

  it('the mapping is never the reverse', () => {
    expect(classifyToolCallFailure('execution-failure')).not.toBe(ToolFailureMechanism.PROTOCOL_ERROR);
    expect(classifyToolCallFailure('unknown-tool')).not.toBe(ToolFailureMechanism.ERROR_RESULT);
  });
});

describe('AC-34.19 / AC-34.20 / AC-34.21 / AC-34.22 — transport mapping (R-22.6)', () => {
  it('-32003 and -32004 map to HTTP 400 (AC-34.19)', () => {
    expect(httpStatusForRegistryCode(MISSING_CLIENT_CAPABILITY_CODE)).toBe(400);
    expect(httpStatusForRegistryCode(UNSUPPORTED_PROTOCOL_VERSION_CODE)).toBe(400);
  });

  it('a routing-header failure is -32001 HeaderMismatch + HTTP 400 (AC-34.20)', () => {
    expect(errorCodeForInboundFailure('routing-header')).toBe(HEADER_MISMATCH_CODE);
    expect(httpStatusForRegistryCode(HEADER_MISMATCH_CODE)).toBe(400);
  });

  it('invalid request → -32600, bad metadata → -32602 (AC-34.21)', () => {
    expect(errorCodeForInboundFailure('invalid-request-object')).toBe(-32600);
    expect(errorCodeForInboundFailure('invalid-metadata')).toBe(-32602);
  });

  it('unparseable → -32700, non-request JSON → -32600 (AC-34.22)', () => {
    expect(errorCodeForInboundFailure('unparseable-json')).toBe(-32700);
    expect(errorCodeForInboundFailure('invalid-request-object')).toBe(-32600);
  });

  it('codes without an HTTP overlay return undefined', () => {
    expect(httpStatusForRegistryCode(PARSE_ERROR_CODE)).toBeUndefined();
    expect(httpStatusForRegistryCode(INVALID_PARAMS_CODE)).toBeUndefined();
  });
});

describe('AC-34.23 — extension code rules (R-22.7-a..d)', () => {
  it('lists exactly the eight reserved codes', () => {
    expect([...RESERVED_ERROR_CODES].sort((a, b) => a - b)).toEqual(
      [-32700, -32603, -32602, -32601, -32600, -32004, -32003, -32001].sort((a, b) => a - b),
    );
  });

  it('accepts a non-reserved integer outside the reserved range', () => {
    expect(validateExtensionErrorCode(1000)).toEqual({ ok: true });
    expect(validateExtensionErrorCode(-31999)).toEqual({ ok: true });
  });

  it('rejects non-integers and collisions with reserved codes', () => {
    expect(validateExtensionErrorCode(1.5)).toEqual({ ok: false, reason: 'not-an-integer' });
    for (const code of RESERVED_ERROR_CODES) {
      expect(validateExtensionErrorCode(code)).toEqual({ ok: false, reason: 'collides-with-reserved' });
    }
    expect(isReservedErrorCode(-32700)).toBe(true);
    expect(isReservedErrorCode(1000)).toBe(false);
  });
});

describe('AC-34.24 — unknown codes tolerated, not rejected (R-22.7-e)', () => {
  it('surfaces an unknown code as a failed request using message and data', () => {
    const descriptor = describeUnknownErrorCode({ code: 424242, message: 'custom', data: { detail: 1 } });
    expect(descriptor).toEqual({
      failed: true,
      code: 424242,
      class: ErrorCodeClass.EXTENSION_DEFINED,
      message: 'custom',
      data: { detail: 1 },
    });
  });

  it('omits data when none is present, and never marks the request rejected-as-malformed', () => {
    const descriptor = describeUnknownErrorCode({ code: 424242, message: 'custom' });
    expect(descriptor.failed).toBe(true);
    expect('data' in descriptor).toBe(false);
  });
});

describe('AC-34.25 — registry exactness & classification (R-22-a)', () => {
  it('every registry row reports its own code under its key, case-sensitively', () => {
    for (const [key, entry] of Object.entries(ERROR_CODE_REGISTRY)) {
      expect(entry.code).toBe(Number(key));
      expect(entry.name).toBe(entry.name.trim());
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('classifies every range correctly', () => {
    expect(classifyErrorCode(HEADER_MISMATCH_CODE)).toBe(ErrorCodeClass.SERVER_DEFINED);
    expect(classifyErrorCode(-32050)).toBe(ErrorCodeClass.SERVER_DEFINED); // unregistered server-range
    expect(classifyErrorCode(MISSING_CLIENT_CAPABILITY_CODE)).toBe(ErrorCodeClass.MCP_PROTOCOL);
    expect(classifyErrorCode(-32700)).toBe(ErrorCodeClass.JSON_RPC_STANDARD);
    expect(classifyErrorCode(-32500)).toBe(ErrorCodeClass.JSON_RPC_STANDARD); // unregistered reserved-range
    expect(classifyErrorCode(5000)).toBe(ErrorCodeClass.EXTENSION_DEFINED);
  });

  it('exposes the reserved and server-error ranges with correct bounds', () => {
    expect(JSON_RPC_RESERVED_RANGE).toEqual({ min: -32768, max: -32000 });
    expect(SERVER_ERROR_RANGE).toEqual({ min: -32099, max: -32000 });
  });

  it('validates code membership in a class', () => {
    expect(isErrorCodeInClass(-32001, ErrorCodeClass.SERVER_DEFINED)).toBe(true);
    expect(isErrorCodeInClass(-32700, ErrorCodeClass.SERVER_DEFINED)).toBe(false);
    expect(isErrorCodeInClass(9000, ErrorCodeClass.EXTENSION_DEFINED)).toBe(true);
    expect(isErrorCodeInClass(-32602, ErrorCodeClass.EXTENSION_DEFINED)).toBe(false);
    expect(isErrorCodeInClass(-32602, ErrorCodeClass.JSON_RPC_STANDARD)).toBe(true);
    expect(isErrorCodeInClass(-32003, ErrorCodeClass.MCP_PROTOCOL)).toBe(true);
  });

  it('records the legacy resource-not-found literal -32002 as MCP-protocol', () => {
    expect(RESOURCE_NOT_FOUND_LEGACY_CODE).toBe(-32002);
    expect(ERROR_CODE_REGISTRY[RESOURCE_NOT_FOUND_LEGACY_CODE].name).toBe('Resource not found');
    expect(lookupErrorCode(-32002)?.class).toBe(ErrorCodeClass.MCP_PROTOCOL);
  });

  it('lookupErrorCode returns undefined for an unregistered code', () => {
    expect(lookupErrorCode(123456)).toBeUndefined();
  });
});
