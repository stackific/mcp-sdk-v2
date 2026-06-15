/**
 * Tests for S09 — Revision Selection & Negotiation Errors (§5.4–§5.7).
 *
 * AC coverage:
 *  AC-09.1  (R-5.4-a)                 — server/discover is optional
 *  AC-09.2  (R-5.4-b)                 — highest client-preferred revision in server set, exact match
 *  AC-09.3  (R-5.4-c)                 — empty intersection → no fabricated revision
 *  AC-09.4  (R-5.4-d)                 — empty intersection → actionable incompatibility
 *  AC-09.5  (R-5.5-a, R-5.5-d)        — unsupported revision → -32004
 *  AC-09.6  (R-5.5-b)                 — -32004 → HTTP 400
 *  AC-09.7  (R-5.5-c/e/f/g)           — data has exactly supported (non-empty) + requested; message present
 *  AC-09.8  (R-5.5-h)                 — client re-selects from data.supported and retries
 *  AC-09.9  (R-5.5-i, R-5.5-j)        — no mutual revision → no infinite retry; surface incompatibility
 *  AC-09.10 (R-5.6-a, R-5.6-b)        — per-request {} caps; no inference from prior request
 *  AC-09.11 (R-5.6-c, R-5.6-f)        — missing capability → -32003
 *  AC-09.12 (R-5.6-d)                 — -32003 → HTTP 400
 *  AC-09.13 (R-5.6-e/g/h)             — data has requiredCapabilities; message present
 *  AC-09.14 (R-5.6-i)                 — client retries with required capability declared
 *  AC-09.15 (R-5.7-a, R-5.7-b)        — probe via server/discover as opening request
 *  AC-09.16 (R-5.7-c, R-5.7-d)        — unrecognized/malformed/timeout → not-this-protocol
 *  AC-09.17 (R-5.7-e, R-5.7-f)        — cache determination per endpoint; persist; re-probe
 *  AC-09.18 (R-5.7-g)                 — server names supported revisions in error
 */

import { describe, it, expect } from 'vitest';
import {
  NEGOTIATION_ERROR_HTTP_STATUS,
  httpStatusForNegotiationError,
  SERVER_DISCOVER_IS_OPTIONAL,
  negotiateRevision,
  IncompatibleProtocolError,
  reselectAfterUnsupportedVersion,
  canSatisfyRequiredCapabilities,
  augmentClientCapabilities,
  interpretProbeResponse,
  nameSupportedRevisionsInError,
  ProtocolSupportCache,
  determinationFromProbe,
  SERVER_DISCOVER_METHOD,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  buildUnsupportedProtocolVersionError,
  buildMissingCapabilityError,
} from '../../protocol/negotiation.js';

// ─── AC-09.1 — discovery optional (R-5.4-a) ─────────────────────────────────────

describe('server/discover is optional (AC-09.1 · R-5.4-a)', () => {
  it('exposes the optional-discovery invariant', () => {
    expect(SERVER_DISCOVER_IS_OPTIONAL).toBe(true);
  });

  it('selection works from a rejection set with no prior discovery call', () => {
    // The server set came from an UnsupportedProtocolVersion error, not discovery.
    const err = buildUnsupportedProtocolVersionError('1900-01-01', ['2026-07-28']);
    const result = reselectAfterUnsupportedVersion(err, ['2026-07-28']);
    expect(result.ok).toBe(true);
  });
});

// ─── AC-09.2 — highest client-preferred, exact match (R-5.4-b) ──────────────────

describe('revision selection rule (AC-09.2 · R-5.4-b)', () => {
  it('chooses B given client [B, A] and server [A, B]', () => {
    const result = negotiateRevision(['B', 'A'], ['A', 'B']);
    expect(result).toEqual({ ok: true, selected: 'B' });
  });

  it('is exact-match, not lexical/date comparison', () => {
    // "2027-01-01" sorts after "2026-07-28" but is not offered → not chosen.
    const result = negotiateRevision(['2027-01-01', '2026-07-28'], ['2026-07-28']);
    expect(result).toEqual({ ok: true, selected: '2026-07-28' });
  });

  it('is independent of the server array order', () => {
    const pref = ['2026-07-28', '2025-03-26'];
    const a = negotiateRevision(pref, ['2025-03-26', '2026-07-28']);
    const b = negotiateRevision(pref, ['2026-07-28', '2025-03-26']);
    expect(a).toEqual(b);
    expect(a).toEqual({ ok: true, selected: '2026-07-28' });
  });
});

// ─── AC-09.3 / AC-09.4 — empty intersection (R-5.4-c, R-5.4-d) ──────────────────

describe('empty intersection handling (AC-09.3 · AC-09.4)', () => {
  it('does not fabricate a revision (R-5.4-c)', () => {
    const result = negotiateRevision(['2020-01-01'], ['2026-07-28']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no-mutual-revision');
      expect(result.selected as unknown).toBeUndefined();
    }
  });

  it('IncompatibleProtocolError surfaces both sides for an actionable diagnostic (R-5.4-d)', () => {
    const err = new IncompatibleProtocolError(['2020-01-01'], ['2026-07-28']);
    expect(err).toBeInstanceOf(Error);
    expect(err.clientPreference).toEqual(['2020-01-01']);
    expect(err.serverSupported).toEqual(['2026-07-28']);
    expect(err.message).toContain('2026-07-28');
  });
});

// ─── AC-09.5 / AC-09.7 — UnsupportedProtocolVersion shape (R-5.5-a/c/d/e/f/g) ───

describe('UnsupportedProtocolVersion error shape (AC-09.5 · AC-09.7)', () => {
  it('code is exactly -32004', () => {
    expect(UNSUPPORTED_PROTOCOL_VERSION_CODE).toBe(-32004);
    const err = buildUnsupportedProtocolVersionError('1900-01-01', ['2026-07-28']);
    expect(err.code).toBe(-32004);
  });

  it('data contains exactly supported (non-empty array) and requested; message present', () => {
    const err = buildUnsupportedProtocolVersionError('1900-01-01', ['2026-07-28']);
    expect(Object.keys(err.data).sort()).toEqual(['requested', 'supported']);
    expect(Array.isArray(err.data.supported)).toBe(true);
    expect(err.data.supported.length).toBeGreaterThan(0);
    expect(err.data.requested).toBe('1900-01-01');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('matches the §9.1 wire example', () => {
    expect(buildUnsupportedProtocolVersionError('1900-01-01', ['2026-07-28'])).toEqual({
      code: -32004,
      message: 'Unsupported protocol version',
      data: { supported: ['2026-07-28'], requested: '1900-01-01' },
    });
  });
});

// ─── AC-09.6 / AC-09.12 — HTTP 400 mapping (R-5.5-b, R-5.6-d) ───────────────────

describe('negotiation errors map to HTTP 400 (AC-09.6 · AC-09.12)', () => {
  it('both -32004 and -32003 map to 400', () => {
    expect(NEGOTIATION_ERROR_HTTP_STATUS).toBe(400);
    expect(httpStatusForNegotiationError(-32004)).toBe(400);
    expect(httpStatusForNegotiationError(-32003)).toBe(400);
  });

  it('an unrelated code does not map to a negotiation 400', () => {
    expect(httpStatusForNegotiationError(-32601)).toBeUndefined();
  });
});

// ─── AC-09.8 — client re-selects and retries (R-5.5-h) ──────────────────────────

describe('client re-selects after UnsupportedProtocolVersion (AC-09.8 · R-5.5-h)', () => {
  it('re-selects from data.supported', () => {
    const err = buildUnsupportedProtocolVersionError('1900-01-01', ['2025-03-26', '2026-07-28']);
    const result = reselectAfterUnsupportedVersion(err, ['2026-07-28', '2025-03-26']);
    expect(result).toEqual({ ok: true, selected: '2026-07-28' });
  });
});

// ─── AC-09.9 — no mutual revision in data.supported (R-5.5-i, R-5.5-j) ──────────

describe('no mutual revision after rejection (AC-09.9)', () => {
  it('returns a terminal no-mutual-revision result (no infinite retry)', () => {
    const err = buildUnsupportedProtocolVersionError('1900-01-01', ['2026-07-28']);
    const result = reselectAfterUnsupportedVersion(err, ['2020-01-01']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-mutual-revision');
  });

  it('the result carries enough to build an IncompatibleProtocolError to surface', () => {
    const err = buildUnsupportedProtocolVersionError('1900-01-01', ['2026-07-28']);
    const result = reselectAfterUnsupportedVersion(err, ['2020-01-01']);
    if (!result.ok) {
      const surfaced = new IncompatibleProtocolError(result.clientPreference, result.serverSupported);
      expect(surfaced.serverSupported).toEqual(['2026-07-28']);
    }
  });
});

// ─── AC-09.10 — per-request {} caps, no inference (R-5.6-a, R-5.6-b) ────────────

describe('per-request client capabilities, no inference (AC-09.10)', () => {
  it('an empty {} declares no optional capabilities (independent of any prior request)', () => {
    // Each request is evaluated only against its own declaration.
    expect(canSatisfyRequiredCapabilities({ elicitation: {} }, {})).toBe(false);
    // A capability declared on a *prior* request does not carry over: the second
    // request's declaration is {}, so the required capability is still missing.
    const secondRequestDeclared = {};
    expect(canSatisfyRequiredCapabilities({ elicitation: {} }, secondRequestDeclared)).toBe(false);
  });
});

// ─── AC-09.11 / AC-09.13 — MissingRequiredClientCapability shape (R-5.6-c/e/f/g/h)

describe('MissingRequiredClientCapability error shape (AC-09.11 · AC-09.13)', () => {
  it('code is exactly -32003', () => {
    expect(MISSING_CLIENT_CAPABILITY_CODE).toBe(-32003);
    expect(buildMissingCapabilityError({ elicitation: {} }).code).toBe(-32003);
  });

  it('data contains requiredCapabilities; message present', () => {
    const err = buildMissingCapabilityError({ elicitation: {} });
    expect(err.data.requiredCapabilities).toEqual({ elicitation: {} });
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });
});

// ─── AC-09.14 — client retries with the required capability (R-5.6-i) ───────────

describe('client retries declaring the required capability (AC-09.14)', () => {
  it('canSatisfy is true when the client supports the required capability', () => {
    expect(canSatisfyRequiredCapabilities({ elicitation: {} }, { elicitation: {}, sampling: {} })).toBe(true);
  });

  it('augmentClientCapabilities merges required into declared without mutation', () => {
    const declared = { sampling: {} };
    const augmented = augmentClientCapabilities(declared, { elicitation: {} });
    expect(augmented).toEqual({ sampling: {}, elicitation: {} });
    expect(declared).toEqual({ sampling: {} }); // unchanged
  });
});

// ─── AC-09.15 — probe via server/discover (R-5.7-a, R-5.7-b) ────────────────────

describe('probe uses server/discover as opening request (AC-09.15)', () => {
  it('the probe method is server/discover', () => {
    expect(SERVER_DISCOVER_METHOD).toBe('server/discover');
  });

  it('a successful DiscoverResult means the server speaks this protocol family', () => {
    const outcome = interpretProbeResponse({
      jsonrpc: '2.0', id: 0,
      result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1' } },
    });
    expect(outcome.kind).toBe('supported');
    if (outcome.kind === 'supported') expect(outcome.supportedVersions).toEqual(['2026-07-28']);
  });

  it('a recognized -32004 means same family, different revision', () => {
    const outcome = interpretProbeResponse({
      jsonrpc: '2.0', id: 0,
      error: { code: -32004, message: 'x', data: { supported: ['2026-07-28'], requested: '1900-01-01' } },
    });
    expect(outcome.kind).toBe('unsupported-version');
    if (outcome.kind === 'unsupported-version') expect(outcome.supported).toEqual(['2026-07-28']);
  });
});

// ─── AC-09.16 — unrecognized/malformed/timeout → not-this-protocol (R-5.7-c/d) ──

describe('probe failure means not-this-protocol (AC-09.16)', () => {
  it('unknown-method error → not-this-protocol', () => {
    const outcome = interpretProbeResponse({ jsonrpc: '2.0', id: 0, error: { code: -32601, message: 'Method not found' } });
    expect(outcome.kind).toBe('not-this-protocol');
  });

  it('malformed result (not a DiscoverResult) → not-this-protocol', () => {
    const outcome = interpretProbeResponse({ jsonrpc: '2.0', id: 0, result: { foo: 'bar' } });
    expect(outcome.kind).toBe('not-this-protocol');
  });

  it('no response within timeout (undefined/null) → not-this-protocol', () => {
    expect(interpretProbeResponse(undefined).kind).toBe('not-this-protocol');
    expect(interpretProbeResponse(null).kind).toBe('not-this-protocol');
  });
});

// ─── AC-09.17 — cache the determination (R-5.7-e, R-5.7-f) ──────────────────────

describe('protocol-support determination cache (AC-09.17)', () => {
  it('caches per endpoint and reports it', () => {
    const cache = new ProtocolSupportCache();
    const outcome = interpretProbeResponse({
      jsonrpc: '2.0', id: 0,
      result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {}, serverInfo: { name: 'S', version: '1' } },
    });
    cache.set('npx some-server', determinationFromProbe(outcome));
    expect(cache.get('npx some-server')).toEqual({ speaksProtocol: true, supportedVersions: ['2026-07-28'] });
  });

  it('persists across "restarts" via entries()/fromEntries()', () => {
    const cache = new ProtocolSupportCache();
    cache.set('e1', { speaksProtocol: false });
    const restored = ProtocolSupportCache.fromEntries(cache.entries());
    expect(restored.get('e1')).toEqual({ speaksProtocol: false });
  });

  it('invalidate() drops a cached assumption so the client re-probes (R-5.7-f)', () => {
    const cache = new ProtocolSupportCache();
    cache.set('e1', { speaksProtocol: true, supportedVersions: ['2026-07-28'] });
    cache.invalidate('e1');
    expect(cache.has('e1')).toBe(false);
  });

  it('a -32004 probe outcome still counts as speaking the protocol family', () => {
    const outcome = interpretProbeResponse({
      jsonrpc: '2.0', id: 0,
      error: { code: -32004, message: 'x', data: { supported: ['2026-07-28'], requested: '1900-01-01' } },
    });
    expect(determinationFromProbe(outcome)).toEqual({ speaksProtocol: true, supportedVersions: ['2026-07-28'] });
  });
});

// ─── AC-09.18 — server names supported revisions in error (R-5.7-g) ─────────────

describe('server names supported revisions in any error (AC-09.18 · R-5.7-g)', () => {
  it('adds data.supported to an otherwise opaque error', () => {
    const annotated = nameSupportedRevisionsInError(
      { code: -32600, message: 'Invalid Request' },
      ['2026-07-28'],
    );
    expect(annotated.data.supported).toEqual(['2026-07-28']);
    expect(annotated.code).toBe(-32600);
  });

  it('preserves existing data fields', () => {
    const annotated = nameSupportedRevisionsInError(
      { code: -32600, message: 'x', data: { detail: 'y' } },
      ['2026-07-28'],
    );
    expect(annotated.data).toEqual({ detail: 'y', supported: ['2026-07-28'] });
  });
});
