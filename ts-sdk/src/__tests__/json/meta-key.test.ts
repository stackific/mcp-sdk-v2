/**
 * Tests for `_meta` key naming validation — S02 §2.6.2.
 *
 * AC coverage:
 *  AC-02.17 (R-2.6.2-b,c,d,e,f) — prefix grammar and reserved-prefix detection
 *  AC-02.18 (R-2.6.2-a,g,h)     — name grammar and no-assumption on reserved values
 *  AC-02.19 (R-2.6.2-i,j)       — W3C trace keys are valid; unknown keys ignored
 */

import { describe, it, expect } from 'vitest';
import {
  isValidMetaKeyPrefix,
  isReservedMetaKeyPrefix,
  isValidMetaKeyName,
  isValidMetaKey,
  parseMetaKey,
  isValidTraceparent,
  isValidTracestate,
  isValidBaggage,
  isValidTraceContextValue,
  TRACE_CONTEXT_KEYS,
} from '../../json/meta-key.js';

describe('isValidMetaKeyPrefix (AC-02.17 — R-2.6.2-b, R-2.6.2-c, R-2.6.2-d)', () => {
  it('accepts a single-label prefix', () => {
    expect(isValidMetaKeyPrefix('example/')).toBe(true);
  });

  it('accepts a multi-label prefix', () => {
    expect(isValidMetaKeyPrefix('com.example/')).toBe(true);
    expect(isValidMetaKeyPrefix('io.modelcontextprotocol/')).toBe(true);
  });

  it('accepts labels with hyphens in interior', () => {
    expect(isValidMetaKeyPrefix('com.my-company/')).toBe(true);
  });

  it('rejects a prefix without trailing slash', () => {
    expect(isValidMetaKeyPrefix('com.example')).toBe(false);
  });

  it('rejects an empty prefix', () => {
    expect(isValidMetaKeyPrefix('/')).toBe(false);
    expect(isValidMetaKeyPrefix('')).toBe(false);
  });

  it('rejects a label starting with a digit', () => {
    expect(isValidMetaKeyPrefix('1bad/')).toBe(false);
    expect(isValidMetaKeyPrefix('com.1bad/')).toBe(false);
  });

  it('rejects a label ending with a hyphen', () => {
    expect(isValidMetaKeyPrefix('com.bad-/')).toBe(false);
  });

  it('rejects consecutive dots', () => {
    expect(isValidMetaKeyPrefix('com..example/')).toBe(false);
  });
});

describe('isReservedMetaKeyPrefix (AC-02.17 — R-2.6.2-f)', () => {
  it('io.modelcontextprotocol/ is reserved (second label = modelcontextprotocol)', () => {
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

  it('com.example/ is NOT reserved (second label = example)', () => {
    expect(isReservedMetaKeyPrefix('com.example/')).toBe(false);
  });

  it('com.example.mcp/ is NOT reserved (second label = example)', () => {
    expect(isReservedMetaKeyPrefix('com.example.mcp/')).toBe(false);
  });

  it('single-label prefix is NOT reserved (no second label)', () => {
    expect(isReservedMetaKeyPrefix('mcp/')).toBe(false);
  });
});

describe('isValidMetaKeyName (AC-02.18 — R-2.6.2-g, R-2.6.2-h)', () => {
  it('accepts an empty name (valid when prefix is present)', () => {
    expect(isValidMetaKeyName('')).toBe(true);
  });

  it('accepts an alphanumeric name', () => {
    expect(isValidMetaKeyName('tenant')).toBe(true);
    expect(isValidMetaKeyName('logLevel')).toBe(true);
    expect(isValidMetaKeyName('protocolVersion')).toBe(true);
  });

  it('accepts a name with interior hyphens, underscores, and dots', () => {
    expect(isValidMetaKeyName('my-key')).toBe(true);
    expect(isValidMetaKeyName('my_key')).toBe(true);
    expect(isValidMetaKeyName('my.key')).toBe(true);
  });

  it('rejects a name starting with a hyphen', () => {
    expect(isValidMetaKeyName('-bad')).toBe(false);
  });

  it('rejects a name ending with a hyphen', () => {
    expect(isValidMetaKeyName('bad-')).toBe(false);
  });

  it('rejects a name starting with an underscore', () => {
    expect(isValidMetaKeyName('_bad')).toBe(false);
  });
});

describe('parseMetaKey', () => {
  it('parses a key without prefix', () => {
    expect(parseMetaKey('traceparent')).toEqual({ prefix: undefined, name: 'traceparent' });
  });

  it('parses a key with prefix', () => {
    expect(parseMetaKey('com.example/tenant')).toEqual({ prefix: 'com.example/', name: 'tenant' });
  });

  it('uses the first slash as the separator', () => {
    expect(parseMetaKey('a.b/c/d')).toEqual({ prefix: 'a.b/', name: 'c/d' });
  });
});

describe('isValidMetaKey (AC-02.17, AC-02.18, AC-02.19)', () => {
  it('accepts a bare name (no prefix)', () => {
    expect(isValidMetaKey('tenant')).toBe(true);
  });

  it('accepts a well-formed vendor-prefixed key', () => {
    expect(isValidMetaKey('com.example/tenant')).toBe(true);
  });

  it('rejects a key under a reserved prefix', () => {
    expect(isValidMetaKey('io.modelcontextprotocol/something')).toBe(false);
    expect(isValidMetaKey('dev.mcp/key')).toBe(false);
  });

  it('accepts the W3C bare trace keys as always valid (AC-02.19)', () => {
    expect(isValidMetaKey('traceparent')).toBe(true);
    expect(isValidMetaKey('tracestate')).toBe(true);
    expect(isValidMetaKey('baggage')).toBe(true);
  });

  it('rejects a key with invalid prefix syntax', () => {
    expect(isValidMetaKey('1bad/key')).toBe(false);
  });
});

describe('TRACE_CONTEXT_KEYS (AC-02.19 — R-2.6.2-i)', () => {
  it('contains traceparent, tracestate, and baggage', () => {
    expect(TRACE_CONTEXT_KEYS.has('traceparent')).toBe(true);
    expect(TRACE_CONTEXT_KEYS.has('tracestate')).toBe(true);
    expect(TRACE_CONTEXT_KEYS.has('baggage')).toBe(true);
  });
});

describe('isValidTraceparent (AC-02.19 — R-2.6.2-i)', () => {
  it('accepts a well-formed traceparent', () => {
    expect(
      isValidTraceparent('00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01'),
    ).toBe(true);
  });

  it('rejects a malformed traceparent', () => {
    expect(isValidTraceparent('not-a-traceparent')).toBe(false);
    expect(isValidTraceparent('')).toBe(false);
  });

  it('rejects uppercase hex (W3C format requires lowercase)', () => {
    expect(
      isValidTraceparent('00-0AF7651916CD43DD8448EB211C80319C-00F067AA0BA902B7-01'),
    ).toBe(false);
  });

  it('rejects the reserved version ff and all-zero trace/parent ids (R-2.6.2-i)', () => {
    // Version 0xff is reserved/forbidden.
    expect(isValidTraceparent('ff-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01')).toBe(false);
    // An all-zero trace-id is the "invalid" sentinel.
    expect(isValidTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBe(false);
    // An all-zero parent-id is likewise invalid.
    expect(isValidTraceparent('00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01')).toBe(false);
  });
});

describe('isValidTracestate (R-4.2-l)', () => {
  it('accepts a single valid list member', () => {
    expect(isValidTracestate('rojo=00f067aa0ba902b7')).toBe(true);
  });

  it('accepts multiple comma-separated members', () => {
    expect(isValidTracestate('vendorname=opaqueValue,mynamespace=myvalue')).toBe(true);
  });

  it('accepts a multi-tenant key (tenant-id@system-id)', () => {
    expect(isValidTracestate('fw529a3039@dt=FxAAsdfh28')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidTracestate('')).toBe(false);
  });

  it('rejects a string with no "=" separator', () => {
    expect(isValidTracestate('invalid')).toBe(false);
  });

  it('rejects an uppercase key (keys must be lowercase)', () => {
    expect(isValidTracestate('UserId=value')).toBe(false);
  });

  it('rejects an "@@@"-prefixed malformed value', () => {
    expect(isValidTracestate('@@@invalid@@@')).toBe(false);
  });

  it('rejects a value with a trailing comma (empty member)', () => {
    expect(isValidTracestate('rojo=value,')).toBe(false);
  });
});

describe('isValidBaggage (R-4.2-m)', () => {
  it('accepts a single key=value member', () => {
    expect(isValidBaggage('userId=alice')).toBe(true);
  });

  it('accepts multiple comma-separated members', () => {
    expect(isValidBaggage('userId=alice,serverNode=DF-28')).toBe(true);
  });

  it('accepts a member with properties', () => {
    expect(isValidBaggage('key=value;property=val')).toBe(true);
  });

  it('accepts uppercase keys (baggage tokens are case-insensitive by RFC 7230)', () => {
    expect(isValidBaggage('UserId=alice')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidBaggage('')).toBe(false);
  });

  it('rejects a string with no "=" separator', () => {
    expect(isValidBaggage('invalid')).toBe(false);
  });

  it('rejects an "@@@"-prefixed malformed value', () => {
    expect(isValidBaggage('@@@invalid@@@')).toBe(false);
  });

  it('rejects a key containing double-quote (not a valid token char)', () => {
    expect(isValidBaggage('"bad"=value')).toBe(false);
  });
});

describe('isValidTraceContextValue (AC-02.19 — R-2.6.2-i)', () => {
  it('accepts a valid tracestate-format value', () => {
    expect(isValidTraceContextValue('key=value')).toBe(true);
  });

  it('accepts a valid baggage-format value', () => {
    expect(isValidTraceContextValue('userId=alice,serverNode=DF-28')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidTraceContextValue('')).toBe(false);
  });

  it('rejects a malformed value that is neither valid tracestate nor valid baggage', () => {
    expect(isValidTraceContextValue('@@@invalid@@@')).toBe(false);
  });
});
