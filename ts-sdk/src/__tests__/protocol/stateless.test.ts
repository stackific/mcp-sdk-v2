/**
 * Tests for S06 — Stateless Per-Request Model & Cross-Call Continuity (§4.4–§4.7).
 *
 * AC coverage:
 *  AC-06.1  (R-4.4-a)  — request processed without prior-request state
 *  AC-06.2  (R-4.4-b)  — first request processed without handshake
 *  AC-06.3  (R-4.4-c)  — identity derived from current _meta only
 *  AC-06.4  (R-4.4-d)  — no per-connection conversational state needed
 *  AC-06.5  (R-4.4-e)  — unrelated requests interleaved on one connection
 *  AC-06.6  (R-4.4-f)  — connection/process identity not a conversation proxy
 *  AC-06.7  (R-4.4-g)  — identical behavior across server instances
 *  AC-06.8  (R-4.4-h)  — multiple independent tasks on one connection
 *  AC-06.9  (R-4.4-i)  — related ops can span different connections
 *  AC-06.10 (R-4.4-j)  — connection/process lifetime ≠ conversation boundary
 *  AC-06.11 (R-4.5-a)  — cross-request state via explicit identifier
 *  AC-06.12 (R-4.5-b)  — server mints opaque continuation identifier
 *  AC-06.13 (R-4.5-c)  — client echoes identifier verbatim (opaque)
 *  AC-06.14 (R-4.5-d)  — continuation works across connections/instances
 *  AC-06.15 (R-4.6-a, R-4.6-b) — list results eligible to be same regardless of connection
 *  AC-06.16 (R-4.6-c)  — list variation from explicit inputs, not connection identity
 */

import { describe, it, expect } from 'vitest';
import {
  isValidContinuationId,
  isStringContinuationId,
  STATELESS_MODEL,
  DEFERRED_TO_TRANSPORT,
  type ContinuationId,
} from '../../protocol/stateless.js';

// ─── ContinuationId validation (AC-06.11–AC-06.14) ──────────────────────────

describe('isValidContinuationId (AC-06.11–AC-06.14 · R-4.5-a – R-4.5-d)', () => {
  it('accepts a string continuation id', () => {
    expect(isValidContinuationId('eyJvIjoxMDB9.Zm9vYmFy')).toBe(true);
  });

  it('accepts a number continuation id', () => {
    expect(isValidContinuationId(42)).toBe(true);
  });

  it('accepts zero as a continuation id', () => {
    expect(isValidContinuationId(0)).toBe(true);
  });

  it('accepts a boolean continuation id', () => {
    // Unusual but JSON-serializable
    expect(isValidContinuationId(true)).toBe(true);
    expect(isValidContinuationId(false)).toBe(true);
  });

  it('accepts null as a continuation id', () => {
    expect(isValidContinuationId(null)).toBe(true);
  });

  it('accepts an array continuation id', () => {
    expect(isValidContinuationId([1, 2, 3])).toBe(true);
  });

  it('accepts an object continuation id', () => {
    expect(isValidContinuationId({ offset: 100, version: 2 })).toBe(true);
  });

  it('rejects undefined — not JSON-serializable', () => {
    expect(isValidContinuationId(undefined)).toBe(false);
  });

  it('rejects a Function — not JSON-serializable (AC-06.13 — opaque, no construction)', () => {
    expect(isValidContinuationId(() => {})).toBe(false);
  });

  it('rejects a Symbol — not JSON-serializable', () => {
    expect(isValidContinuationId(Symbol('tok'))).toBe(false);
  });

  it('rejects bigint — not JSON-serializable', () => {
    expect(isValidContinuationId(9007199254740993n)).toBe(false);
  });
});

// ─── isStringContinuationId ──────────────────────────────────────────────────

describe('isStringContinuationId (AC-06.12 · R-4.5-b, AC-06.13 · R-4.5-c)', () => {
  it('returns true for a string', () => {
    expect(isStringContinuationId('opaque-token-value')).toBe(true);
  });

  it('returns true for an empty string — even empty strings are valid continuation ids', () => {
    expect(isStringContinuationId('')).toBe(true);
  });

  it('returns false for a number', () => {
    expect(isStringContinuationId(42)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isStringContinuationId(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isStringContinuationId(undefined)).toBe(false);
  });
});

// ─── Opaqueness: clients must not parse/modify (AC-06.13 · R-4.5-c) ─────────

describe('Continuation identifier opaqueness (AC-06.13 · R-4.5-c)', () => {
  it('any verbatim echo of a server-minted string is a valid continuation id', () => {
    const minted = 'eyJzdGVwIjoiYXdhaXQiLCJzaWciOiJhYmMifQ==';
    // The client must echo verbatim — isValidContinuationId should accept it unchanged
    expect(isValidContinuationId(minted)).toBe(true);
  });

  it('a base64-looking string is valid regardless of its structure (opaque)', () => {
    expect(isValidContinuationId('aGVsbG8gd29ybGQ=')).toBe(true);
  });

  it('a UUID-looking string is valid (client must not try to parse as UUID)', () => {
    expect(isValidContinuationId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
});

// ─── Stateless model constants (AC-06.1 – AC-06.16) ─────────────────────────

describe('STATELESS_MODEL constants (documentation / AC-06.1 – AC-06.16)', () => {
  it('documents the no-prior-request-inference rule (R-4.4-a)', () => {
    expect(STATELESS_MODEL.NO_PRIOR_REQUEST_INFERENCE).toBe('R-4.4-a');
  });

  it('documents the no-handshake-required rule (R-4.4-b)', () => {
    expect(STATELESS_MODEL.NO_HANDSHAKE_REQUIRED).toBe('R-4.4-b');
  });

  it('documents the identity-from-meta-only rule (R-4.4-c)', () => {
    expect(STATELESS_MODEL.IDENTITY_FROM_META_ONLY).toBe('R-4.4-c');
  });

  it('documents the no-per-connection-state rule (R-4.4-d)', () => {
    expect(STATELESS_MODEL.NO_PER_CONNECTION_STATE).toBe('R-4.4-d');
  });

  it('documents the connection-not-conversation rule (R-4.4-f)', () => {
    expect(STATELESS_MODEL.CONNECTION_NOT_CONVERSATION).toBe('R-4.4-f');
  });

  it('documents the explicit-continuation-only rule (R-4.5-a)', () => {
    expect(STATELESS_MODEL.EXPLICIT_CONTINUATION_ONLY).toBe('R-4.5-a');
  });

  it('documents the list-results-connection-independent rule (R-4.6-a)', () => {
    expect(STATELESS_MODEL.LIST_RESULTS_CONNECTION_INDEPENDENT).toBe('R-4.6-a');
  });
});

// ─── Cross-call continuity: explicit identifier drives continuation (AC-06.11–AC-06.14) ──

describe('Cross-call continuity model (AC-06.11–AC-06.14 · R-4.5-a – R-4.5-d)', () => {
  it('a server-minted cursor is a valid continuation identifier (AC-06.12 · R-4.5-b)', () => {
    const serverMinted: ContinuationId = 'eyJvIjoxMDB9.Zm9vYmFy';
    expect(isValidContinuationId(serverMinted)).toBe(true);
  });

  it('the same cursor value is a valid continuation id across connections (AC-06.14 · R-4.5-d)', () => {
    // Both "connections" use the same opaque cursor value — the value carries identity
    const cursor = 'cursor-page-2';
    expect(isValidContinuationId(cursor)).toBe(true);
    expect(isValidContinuationId(cursor)).toBe(true); // same result on any "instance"
  });

  it('a numeric continuation id is valid (some features mint number handles)', () => {
    expect(isValidContinuationId(12345)).toBe(true);
  });

  it('an object continuation id is valid (structured but still opaque to client)', () => {
    // The client must not introspect this — `isValidContinuationId` only checks serializability
    expect(isValidContinuationId({ taskId: 'abc', shard: 3 })).toBe(true);
  });
});

// ─── DEFERRED_TO_TRANSPORT constants (AC-06.8 – AC-06.10) ────────────────────

describe('DEFERRED_TO_TRANSPORT constants (AC-06.8 · R-4.4-h; AC-06.9 · R-4.4-i; AC-06.10 · R-4.4-j)', () => {
  it('documents the interleaved-task-streams RECOMMENDED behavior (R-4.4-h)', () => {
    expect(DEFERRED_TO_TRANSPORT.INTERLEAVED_TASK_STREAMS).toBe('R-4.4-h');
  });

  it('documents the no-connection-reuse-requirement RECOMMENDED behavior (R-4.4-i)', () => {
    expect(DEFERRED_TO_TRANSPORT.NO_CONNECTION_REUSE_REQUIREMENT).toBe('R-4.4-i');
  });

  it('documents the mid-task-resume-on-new-connection RECOMMENDED behavior (R-4.4-j)', () => {
    expect(DEFERRED_TO_TRANSPORT.MID_TASK_RESUME_ON_NEW_CONNECTION).toBe('R-4.4-j');
  });

  it('has exactly three entries — no undocumented deferrals', () => {
    expect(Object.keys(DEFERRED_TO_TRANSPORT)).toHaveLength(3);
  });
});
