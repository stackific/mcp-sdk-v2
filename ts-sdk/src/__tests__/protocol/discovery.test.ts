/**
 * Tests for S08 — Discovery via `server/discover` (§5.3).
 *
 * AC coverage:
 *  AC-08.1  (R-5.3-a)                          — server/discover is implemented
 *  AC-08.2  (R-5.3.1-a – R-5.3.1-d)            — three reserved _meta keys REQUIRED
 *  AC-08.3  (R-5.3.1-e)                        — extra _meta keys accepted
 *  AC-08.4  (R-5.3.1-f, R-5.3.1-g)             — unsupported revision → -32004 (no crash/hang)
 *  AC-08.5  (R-5.3.2-a)                        — result carries resultType
 *  AC-08.6  (R-5.3.2-b, R-5.3.2-c)             — supportedVersions non-empty string[]
 *  AC-08.7  (R-5.3.2-d)                        — order is not a preference signal
 *  AC-08.8  (R-5.3.2-e)                        — capabilities present; {} valid
 *  AC-08.9  (R-5.3.2-f)                        — serverInfo requires name + version
 *  AC-08.10 (R-5.3.2-g, R-5.3.2-h, R-5.3.2-i)  — instructions is guidance string
 *  AC-08.11 (R-5.3.2-j)                        — absent instructions → no fabricated guidance
 *  AC-08.12 (R-5.3.2-k)                        — result-level _meta accepted
 */

import { describe, it, expect } from 'vitest';
import {
  SERVER_DISCOVER_METHOD,
  DiscoverRequestSchema,
  DiscoverResultSchema,
  DiscoverResultResponseSchema,
  isDiscoverResult,
  validateDiscoverRequest,
  processDiscoverRequest,
  buildDiscoverResult,
  buildDiscoverRequest,
  buildDiscoverResponse,
  buildUnsupportedProtocolVersionError,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  isVersionSupported,
  selectRevision,
  resolveInstructions,
  CURRENT_PROTOCOL_VERSION,
  type DiscoverConfig,
} from '../../protocol/discovery.js';
import { INVALID_PARAMS_CODE } from '../../protocol/meta.js';

// A baseline server configuration used across the suite.
const config: DiscoverConfig = {
  supportedVersions: ['2026-07-28'],
  capabilities: {},
  serverInfo: { name: 'ExampleServer', version: '2.3.1' },
};

// A well-formed server/discover request matching the §5.3.3 wire example.
function validRequest(version = CURRENT_PROTOCOL_VERSION): unknown {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: SERVER_DISCOVER_METHOD,
    params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': version,
        'io.modelcontextprotocol/clientInfo': { name: 'ExampleClient', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  };
}

// ─── method name ───────────────────────────────────────────────────────────────

describe('SERVER_DISCOVER_METHOD', () => {
  it('is the string "server/discover"', () => {
    expect(SERVER_DISCOVER_METHOD).toBe('server/discover');
  });
});

// ─── AC-08.1 — server/discover is implemented (R-5.3-a) ─────────────────────────

describe('processDiscoverRequest — server/discover is implemented (AC-08.1 · R-5.3-a)', () => {
  it('handles a well-formed request and returns a DiscoverResult', () => {
    const outcome = processDiscoverRequest(config, validRequest());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(isDiscoverResult(outcome.result)).toBe(true);
      expect(outcome.result.serverInfo).toEqual({ name: 'ExampleServer', version: '2.3.1' });
    }
  });

  it('the discovery method literal is enforced by the request schema', () => {
    expect(DiscoverRequestSchema.safeParse({
      method: 'server/discover',
      params: { _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': {},
      } },
    }).success).toBe(true);
    expect(DiscoverRequestSchema.safeParse({ method: 'server/other', params: { _meta: {} } }).success).toBe(false);
  });

  it('matches the §5.3.3 successful-result wire example', () => {
    const outcome = processDiscoverRequest(
      {
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/tasks': {} } },
        serverInfo: { name: 'ExampleServer', version: '2.3.1' },
        instructions:
          'This server exposes file-search and code-analysis tools. Prefer search before analysis for large repositories.',
      },
      validRequest(),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toMatchObject({
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/tasks': {} } },
        serverInfo: { name: 'ExampleServer', version: '2.3.1' },
      });
    }
  });
});

// ─── AC-08.2 — three reserved _meta keys REQUIRED (R-5.3.1-a – R-5.3.1-d) ────────

describe('validateDiscoverRequest — reserved _meta keys REQUIRED (AC-08.2)', () => {
  it('accepts a request carrying all three reserved keys', () => {
    const result = validateDiscoverRequest(validRequest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.requestedVersion).toBe('2026-07-28');
  });

  it('rejects when protocolVersion is missing (R-5.3.1-b)', () => {
    const req = validRequest() as Record<string, any>;
    delete req.params._meta['io.modelcontextprotocol/protocolVersion'];
    const result = validateDiscoverRequest(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(INVALID_PARAMS_CODE);
  });

  it('rejects when clientInfo is missing (R-5.3.1-c)', () => {
    const req = validRequest() as Record<string, any>;
    delete req.params._meta['io.modelcontextprotocol/clientInfo'];
    expect(validateDiscoverRequest(req).ok).toBe(false);
  });

  it('rejects when clientInfo lacks version (Implementation requires name+version)', () => {
    const req = validRequest() as Record<string, any>;
    req.params._meta['io.modelcontextprotocol/clientInfo'] = { name: 'c' };
    expect(validateDiscoverRequest(req).ok).toBe(false);
  });

  it('rejects when clientCapabilities is missing (R-5.3.1-d)', () => {
    const req = validRequest() as Record<string, any>;
    delete req.params._meta['io.modelcontextprotocol/clientCapabilities'];
    expect(validateDiscoverRequest(req).ok).toBe(false);
  });

  it('rejects a request with the wrong method', () => {
    const req = validRequest() as Record<string, any>;
    req.method = 'tools/list';
    expect(validateDiscoverRequest(req).ok).toBe(false);
  });

  it('rejects when params is absent', () => {
    expect(validateDiscoverRequest({ jsonrpc: '2.0', id: 1, method: SERVER_DISCOVER_METHOD }).ok).toBe(false);
  });

  it('a malformed request also fails through processDiscoverRequest with -32602', () => {
    const req = validRequest() as Record<string, any>;
    delete req.params._meta['io.modelcontextprotocol/protocolVersion'];
    const outcome = processDiscoverRequest(config, req);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe(INVALID_PARAMS_CODE);
  });
});

// ─── AC-08.3 — extra _meta keys accepted (R-5.3.1-e) ─────────────────────────────

describe('extra _meta keys are accepted (AC-08.3 · R-5.3.1-e)', () => {
  it('validateDiscoverRequest accepts a request with additional _meta keys', () => {
    const req = validRequest() as Record<string, any>;
    req.params._meta['com.example/trace'] = 'abc';
    req.params._meta['progressToken'] = 42;
    const result = validateDiscoverRequest(req);
    expect(result.ok).toBe(true);
  });

  it('processDiscoverRequest still succeeds with extra _meta keys', () => {
    const req = validRequest() as Record<string, any>;
    req.params._meta['com.example/trace'] = 'abc';
    expect(processDiscoverRequest(config, req).ok).toBe(true);
  });

  it('buildDiscoverRequest carries extra _meta keys alongside the reserved three', () => {
    const req = buildDiscoverRequest(
      7,
      '2026-07-28',
      { name: 'c', version: '1.0.0' },
      {},
      { 'com.example/tenant': 'acme' },
    );
    expect(req.params._meta['com.example/tenant']).toBe('acme');
    expect(req.params._meta['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
    expect(validateDiscoverRequest(req).ok).toBe(true);
  });

  it('extra keys never overwrite the reserved three', () => {
    // extraMeta tries to smuggle a bogus protocolVersion; reserved spread wins.
    const req = buildDiscoverRequest(
      1,
      '2026-07-28',
      { name: 'c', version: '1.0.0' },
      {},
      { 'io.modelcontextprotocol/protocolVersion': 'HACKED' } as any,
    );
    expect(req.params._meta['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
  });
});

// ─── AC-08.4 — unsupported revision → -32004 (R-5.3.1-f, R-5.3.1-g) ──────────────

describe('unsupported requested revision → UnsupportedProtocolVersion (AC-08.4)', () => {
  it('does not throw/hang and returns a -32004 error for an unsupported revision', () => {
    const outcome = processDiscoverRequest(config, validRequest('2019-01-01'));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe(UNSUPPORTED_PROTOCOL_VERSION_CODE);
      expect(outcome.error.code).toBe(-32004);
    }
  });

  it('data.supported lists the server revisions and data.requested echoes the rejected one', () => {
    const multi: DiscoverConfig = { ...config, supportedVersions: ['2026-07-28', '2025-03-26'] };
    const outcome = processDiscoverRequest(multi, validRequest('2019-01-01'));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && 'data' in outcome.error) {
      expect(outcome.error.data.supported).toEqual(['2026-07-28', '2025-03-26']);
      expect(outcome.error.data.requested).toBe('2019-01-01');
    }
  });

  it('the builder matches the §5.3.3 error wire example', () => {
    const err = buildUnsupportedProtocolVersionError('2019-01-01', ['2026-07-28']);
    expect(err).toEqual({
      code: -32004,
      message: 'Unsupported protocol version',
      data: { supported: ['2026-07-28'], requested: '2019-01-01' },
    });
  });

  it('the builder copies the supported array (caller mutations do not leak in)', () => {
    const supported = ['2026-07-28'];
    const err = buildUnsupportedProtocolVersionError('x', supported);
    supported.push('mutated');
    expect(err.data.supported).toEqual(['2026-07-28']);
  });

  it('a server tolerates probing: same config answers both supported and unsupported (R-5.3.1-f)', () => {
    expect(processDiscoverRequest(config, validRequest('2026-07-28')).ok).toBe(true);
    expect(processDiscoverRequest(config, validRequest('1999-09-09')).ok).toBe(false);
  });
});

// ─── AC-08.5 — result carries resultType (R-5.3.2-a) ─────────────────────────────

describe('DiscoverResult carries resultType (AC-08.5 · R-5.3.2-a)', () => {
  it('buildDiscoverResult sets resultType to "complete"', () => {
    expect(buildDiscoverResult(config).resultType).toBe('complete');
  });

  it('DiscoverResultSchema rejects a result missing resultType', () => {
    const parsed = DiscoverResultSchema.safeParse({
      supportedVersions: ['2026-07-28'],
      capabilities: {},
      serverInfo: { name: 'S', version: '1' },
    });
    expect(parsed.success).toBe(false);
  });
});

// ─── AC-08.6 — supportedVersions non-empty string[] (R-5.3.2-b, R-5.3.2-c) ───────

describe('supportedVersions non-empty array of strings (AC-08.6)', () => {
  it('accepts a non-empty string array', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1' },
    }).success).toBe(true);
  });

  it('rejects an empty supportedVersions array (R-5.3.2-b)', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: [], capabilities: {}, serverInfo: { name: 'S', version: '1' },
    }).success).toBe(false);
  });

  it('rejects non-string elements (R-5.3.2-c)', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28', 7], capabilities: {}, serverInfo: { name: 'S', version: '1' },
    }).success).toBe(false);
  });

  it('buildDiscoverResult throws when supportedVersions is empty', () => {
    expect(() => buildDiscoverResult({ ...config, supportedVersions: [] })).toThrow(RangeError);
  });

  it('isVersionSupported uses exact string membership', () => {
    expect(isVersionSupported(['2026-07-28'], '2026-07-28')).toBe(true);
    expect(isVersionSupported(['2026-07-28'], '2026-07-29')).toBe(false);
    expect(isVersionSupported(['2026-07-28'], ' 2026-07-28')).toBe(false);
  });
});

// ─── AC-08.7 — order is not a preference signal (R-5.3.2-d) ──────────────────────

describe('selectRevision — order independence (AC-08.7 · R-5.3.2-d)', () => {
  it('selects the same revision regardless of server array order', () => {
    const clientPref = ['2026-07-28', '2025-03-26'];
    const a = selectRevision(['2025-03-26', '2026-07-28'], clientPref);
    const b = selectRevision(['2026-07-28', '2025-03-26'], clientPref);
    expect(a).toBe('2026-07-28'); // client's most-preferred that the server offers
    expect(b).toBe('2026-07-28');
    expect(a).toBe(b);
  });

  it('reordering supportedVersions does not change the selection', () => {
    const server = ['2024-01-01', '2025-03-26', '2026-07-28'];
    const reversed = [...server].reverse();
    const pref = ['2025-03-26', '2026-07-28', '2024-01-01'];
    expect(selectRevision(server, pref)).toBe(selectRevision(reversed, pref));
    expect(selectRevision(server, pref)).toBe('2025-03-26');
  });

  it('defaults to the current revision when the client expresses no preference', () => {
    expect(selectRevision(['2025-03-26', CURRENT_PROTOCOL_VERSION])).toBe(CURRENT_PROTOCOL_VERSION);
  });

  it('returns undefined when client and server share no revision', () => {
    expect(selectRevision(['2026-07-28'], ['1999-01-01'])).toBeUndefined();
  });
});

// ─── AC-08.8 — capabilities present; {} valid (R-5.3.2-e) ────────────────────────

describe('capabilities present, empty object valid (AC-08.8 · R-5.3.2-e)', () => {
  it('accepts an empty capabilities object', () => {
    const parsed = DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.capabilities).toEqual({});
  });

  it('accepts a populated capabilities object', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, serverInfo: { name: 'S', version: '1' },
    }).success).toBe(true);
  });

  it('rejects a result missing capabilities', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], serverInfo: { name: 'S', version: '1' },
    }).success).toBe(false);
  });
});

// ─── AC-08.9 — serverInfo requires name + version (R-5.3.2-f) ────────────────────

describe('serverInfo requires name and version (AC-08.9 · R-5.3.2-f)', () => {
  it('accepts a serverInfo with string name and version', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1.0.0' },
    }).success).toBe(true);
  });

  it('rejects serverInfo missing version', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S' },
    }).success).toBe(false);
  });

  it('rejects serverInfo missing name', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { version: '1.0.0' },
    }).success).toBe(false);
  });

  it('rejects a result missing serverInfo entirely', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {},
    }).success).toBe(false);
  });
});

// ─── AC-08.10 — instructions is a guidance string (R-5.3.2-g/h/i) ────────────────

describe('instructions is an optional guidance string (AC-08.10)', () => {
  it('accepts a result with an instructions string', () => {
    const parsed = DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1' },
      instructions: 'Prefer search before analysis for large repositories.',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-string instructions value', () => {
    expect(DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1' },
      instructions: 123,
    }).success).toBe(false);
  });

  it('buildDiscoverResult includes instructions only when provided', () => {
    expect('instructions' in buildDiscoverResult(config)).toBe(false);
    const withInstr = buildDiscoverResult({ ...config, instructions: 'Use X then Y.' });
    expect(withInstr.instructions).toBe('Use X then Y.');
  });
});

// ─── AC-08.11 — absent instructions → no fabricated guidance (R-5.3.2-j) ─────────

describe('resolveInstructions — no fabricated guidance (AC-08.11 · R-5.3.2-j)', () => {
  it('returns undefined when instructions is absent', () => {
    expect(resolveInstructions(buildDiscoverResult(config))).toBeUndefined();
  });

  it('returns the string when instructions is present', () => {
    expect(resolveInstructions({ instructions: 'do X' })).toBe('do X');
  });

  it('returns undefined for a non-string instructions value (no coercion)', () => {
    expect(resolveInstructions({ instructions: 123 as unknown as string })).toBeUndefined();
    expect(resolveInstructions({})).toBeUndefined();
  });
});

// ─── AC-08.12 — result-level _meta accepted (R-5.3.2-k) ──────────────────────────

describe('result-level _meta accepted (AC-08.12 · R-5.3.2-k)', () => {
  it('accepts a DiscoverResult carrying _meta', () => {
    const parsed = DiscoverResultSchema.safeParse({
      resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1' },
      _meta: { 'io.modelcontextprotocol/foo': 'bar' },
    });
    expect(parsed.success).toBe(true);
  });

  it('buildDiscoverResult includes _meta only when provided', () => {
    expect('_meta' in buildDiscoverResult(config)).toBe(false);
    const withMeta = buildDiscoverResult({ ...config, _meta: { 'x.y/z': 1 } });
    expect(withMeta._meta).toEqual({ 'x.y/z': 1 });
  });
});

// ─── JSON-RPC envelopes ──────────────────────────────────────────────────────────

describe('DiscoverResultResponse envelope', () => {
  it('buildDiscoverResponse produces a valid JSON-RPC success envelope', () => {
    const response = buildDiscoverResponse(1, config);
    const parsed = DiscoverResultResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    expect(response.id).toBe(1);
    expect(response.result.resultType).toBe('complete');
  });

  it('echoes a string id without coercion', () => {
    const response = buildDiscoverResponse('req-9', config);
    expect(response.id).toBe('req-9');
  });

  it('the minimal §5.3.3 result example validates', () => {
    expect(DiscoverResultResponseSchema.safeParse({
      jsonrpc: '2.0',
      id: 2,
      result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'ExampleServer', version: '2.3.1' } },
    }).success).toBe(true);
  });
});
