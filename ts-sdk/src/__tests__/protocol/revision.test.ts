/**
 * Tests for S07 — Protocol Revision & Carrying the Revision (§5.1–§5.2).
 *
 * AC coverage:
 *  AC-07.1  (R-5.1-a)  — exact-match comparison for revision identifiers
 *  AC-07.2  (R-5.1-b)  — no lexical/chronological/range comparison
 *  AC-07.3  (R-5.1-c)  — no session-revision inheritance (each request is standalone)
 *  AC-07.4  (R-5.2-a)  — protocolVersion key REQUIRED on every request
 *  AC-07.5  (R-5.2-b)  — value must be YYYY-MM-DD string
 *  AC-07.6  (R-5.2-c)  — HTTP transport must mirror revision in header
 *  AC-07.7  (R-5.2-d)  — header matches _meta value → accepted
 *  AC-07.8  (R-5.2-e)  — header mismatches _meta value → 400 Bad Request
 */

import { describe, it, expect } from 'vitest';
import {
  CURRENT_PROTOCOL_VERSION,
  isSupportedProtocolVersion,
  PROTOCOL_REVISION_FORMAT_RE,
  isValidRevisionFormat,
  checkHttpRevisionHeader,
  HTTP_REVISION_MISMATCH_STATUS,
  MCP_PROTOCOL_VERSION_HEADER,
} from '../../protocol/revision.js';
import { validateRequestMeta } from '../../protocol/meta.js';

// ─── CURRENT_PROTOCOL_VERSION ─────────────────────────────────────────────────

describe('CURRENT_PROTOCOL_VERSION', () => {
  it('is the string "2026-07-28"', () => {
    expect(CURRENT_PROTOCOL_VERSION).toBe('2026-07-28');
  });

  it('matches the YYYY-MM-DD format', () => {
    expect(isValidRevisionFormat(CURRENT_PROTOCOL_VERSION)).toBe(true);
  });
});

// ─── AC-07.1 — exact-match comparison (R-5.1-a) ──────────────────────────────

describe('isSupportedProtocolVersion — exact-match (AC-07.1 · R-5.1-a)', () => {
  it('supports the exact current revision string', () => {
    expect(isSupportedProtocolVersion('2026-07-28')).toBe(true);
  });

  it('rejects a revision with a different day digit (one-char difference)', () => {
    expect(isSupportedProtocolVersion('2026-07-29')).toBe(false);
  });

  it('rejects a revision with a trailing space — not byte-for-byte equal', () => {
    expect(isSupportedProtocolVersion('2026-07-28 ')).toBe(false);
  });

  it('rejects a revision with a leading space', () => {
    expect(isSupportedProtocolVersion(' 2026-07-28')).toBe(false);
  });

  it('rejects a single-digit month variant (not canonical YYYY-MM-DD)', () => {
    expect(isSupportedProtocolVersion('2026-7-28')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSupportedProtocolVersion('')).toBe(false);
  });
});

// ─── AC-07.2 — no lexical/range comparison (R-5.1-b) ─────────────────────────

describe('isSupportedProtocolVersion — no ordering/range logic (AC-07.2 · R-5.1-b)', () => {
  it('does not support a "later" date just because it is lexically greater', () => {
    // "2027-01-01" sorts after "2026-07-28" but must NOT be treated as supported
    expect(isSupportedProtocolVersion('2027-01-01')).toBe(false);
  });

  it('does not support a "later" date by chronological comparison', () => {
    expect(isSupportedProtocolVersion('2099-12-31')).toBe(false);
  });

  it('does not support an earlier date', () => {
    expect(isSupportedProtocolVersion('2025-01-01')).toBe(false);
  });
});

// ─── AC-07.3 — no session-revision inheritance (R-5.1-c) ──────────────────────

describe('Per-request revision declaration (AC-07.3 · R-5.1-c)', () => {
  it('each call to isSupportedProtocolVersion evaluates independently', () => {
    // Simulates: request A declares "2026-07-28" (supported); request B declares "2025-01-01"
    // The receiver must evaluate B independently — it cannot inherit A's revision
    expect(isSupportedProtocolVersion('2026-07-28')).toBe(true);
    expect(isSupportedProtocolVersion('2025-01-01')).toBe(false);
  });
});

// ─── AC-07.4 — protocolVersion key REQUIRED (R-5.2-a) ────────────────────────

describe('protocolVersion is REQUIRED in request _meta (AC-07.4 · R-5.2-a)', () => {
  const validClientInfo = { name: 'test', version: '1.0.0' };
  const validCaps = {};

  it('validateRequestMeta rejects when protocolVersion is absent', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/clientInfo': validClientInfo,
      'io.modelcontextprotocol/clientCapabilities': validCaps,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(-32602);
  });

  it('validateRequestMeta accepts when all three keys including protocolVersion are present', () => {
    const result = validateRequestMeta({
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': validClientInfo,
      'io.modelcontextprotocol/clientCapabilities': validCaps,
    });
    expect(result.ok).toBe(true);
  });
});

// ─── AC-07.5 — value must be a YYYY-MM-DD string (R-5.2-b) ───────────────────

describe('PROTOCOL_REVISION_FORMAT_RE and isValidRevisionFormat (AC-07.5 · R-5.2-b)', () => {
  it('accepts the current protocol version format', () => {
    expect(isValidRevisionFormat('2026-07-28')).toBe(true);
  });

  it('accepts any YYYY-MM-DD date string', () => {
    expect(isValidRevisionFormat('2025-01-01')).toBe(true);
    expect(isValidRevisionFormat('2099-12-31')).toBe(true);
  });

  it('rejects a number value — type must be string', () => {
    expect(PROTOCOL_REVISION_FORMAT_RE.test('20260728')).toBe(false);
  });

  it('rejects a date with single-digit month', () => {
    expect(isValidRevisionFormat('2026-7-28')).toBe(false);
  });

  it('rejects an ISO datetime string (has time component)', () => {
    expect(isValidRevisionFormat('2026-07-28T00:00:00Z')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidRevisionFormat('')).toBe(false);
  });

  it('rejects a non-date-formatted string', () => {
    expect(isValidRevisionFormat('latest')).toBe(false);
    expect(isValidRevisionFormat('v1.0')).toBe(false);
  });

  it('rejects a string with extra whitespace', () => {
    expect(isValidRevisionFormat(' 2026-07-28')).toBe(false);
    expect(isValidRevisionFormat('2026-07-28 ')).toBe(false);
  });
});

// ─── AC-07.5 (gate) — request gate rejects a malformed-but-string version ────

describe('validateRequestMeta rejects a malformed-but-string protocolVersion (R-5.2-b)', () => {
  const base = {
    'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };

  it('rejects a slash-separated date "2026/07/28" at the gate with -32602', () => {
    const result = validateRequestMeta({
      ...base,
      'io.modelcontextprotocol/protocolVersion': '2026/07/28',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(-32602);
  });

  it('rejects a non-date label like "latest"', () => {
    const result = validateRequestMeta({
      ...base,
      'io.modelcontextprotocol/protocolVersion': 'latest',
    });
    expect(result.ok).toBe(false);
  });

  it('still accepts a well-formed YYYY-MM-DD value (even if unsupported)', () => {
    // Format validity is independent of support: the gate passes a well-formed
    // revision; an unsupported one is handled later by the negotiation layer.
    const result = validateRequestMeta({
      ...base,
      'io.modelcontextprotocol/protocolVersion': '2019-01-01',
    });
    expect(result.ok).toBe(true);
  });
});

// ─── AC-07.6 — HTTP transport mirrors revision in header (R-5.2-c) ───────────

describe('MCP_PROTOCOL_VERSION_HEADER constant (AC-07.6 · R-5.2-c)', () => {
  it('is the string "MCP-Protocol-Version"', () => {
    expect(MCP_PROTOCOL_VERSION_HEADER).toBe('MCP-Protocol-Version');
  });
});

// ─── AC-07.7 — header matches _meta → accepted (R-5.2-d) ────────────────────

describe('checkHttpRevisionHeader — match accepted (AC-07.7 · R-5.2-d)', () => {
  it('returns ok:true when header equals metaVersion', () => {
    const result = checkHttpRevisionHeader('2026-07-28', '2026-07-28');
    expect(result.ok).toBe(true);
  });

  it('returns ok:true when header is undefined (non-HTTP transport)', () => {
    const result = checkHttpRevisionHeader(undefined, '2026-07-28');
    expect(result.ok).toBe(true);
  });
});

// ─── AC-07.8 — header mismatches _meta → 400 (R-5.2-e) ──────────────────────

describe('checkHttpRevisionHeader — mismatch → 400 (AC-07.8 · R-5.2-e)', () => {
  it('returns status 400 when header differs from metaVersion', () => {
    const result = checkHttpRevisionHeader('2026-07-28', '2025-01-01');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(HTTP_REVISION_MISMATCH_STATUS);
      expect(result.status).toBe(400);
    }
  });

  it('returns status 400 when header has extra whitespace vs metaVersion', () => {
    const result = checkHttpRevisionHeader('2026-07-28 ', '2026-07-28');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('returns status 400 when header is empty string and metaVersion is set', () => {
    const result = checkHttpRevisionHeader('', '2026-07-28');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('includes a descriptive message on mismatch', () => {
    const result = checkHttpRevisionHeader('2025-01-01', '2026-07-28');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('HTTP_REVISION_MISMATCH_STATUS constant is 400', () => {
    expect(HTTP_REVISION_MISMATCH_STATUS).toBe(400);
  });
});
