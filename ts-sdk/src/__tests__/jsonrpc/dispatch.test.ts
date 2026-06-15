/**
 * Tests for the JSON-RPC request dispatcher — S03 §3.3 dispatch obligations.
 *
 * AC coverage:
 *  AC-03.11 (R-3.3-h, R-3.3-i) — params optional unless _meta REQUIRED
 *  AC-03.12 (R-3.3-j, R-3.3-k) — method-not-found / invalid-params error responses
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { dispatchRequest } from '../../jsonrpc/dispatch.js';
import type { MethodRegistry } from '../../jsonrpc/dispatch.js';
import { classifyMessage } from '../../jsonrpc/framing.js';
import type { JSONRPCRequest } from '../../jsonrpc/framing.js';

/** Classify and extract the JSONRPCRequest from a raw object. */
function makeRequest(raw: Record<string, unknown>): JSONRPCRequest {
  const classified = classifyMessage(raw);
  if (classified.kind !== 'request') throw new Error('not a request');
  return classified.message;
}

// ─── method-not-found (AC-03.12 — R-3.3-j) ──────────────────────────────────

describe('dispatchRequest — method-not-found (AC-03.12 — R-3.3-j)', () => {
  const registry: MethodRegistry = new Map([
    ['tools/call', {}],
    ['ping', {}],
  ]);

  it('returns ok:false when method is absent from registry', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'unknown/method' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(false);
  });

  it('error response carries code -32601 (method not found)', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'noSuchMethod' });
    const outcome = dispatchRequest(req, registry);
    if (!outcome.ok) {
      expect(outcome.response.error.code).toBe(-32601);
    }
  });

  it('error response echoes the request id — same value and type (R-3.2-e, R-3.2-g)', () => {
    const numReq = makeRequest({ jsonrpc: '2.0', id: 42, method: 'nope' });
    const numOutcome = dispatchRequest(numReq, registry);
    if (!numOutcome.ok) {
      expect(numOutcome.response.id).toBe(42);
      expect(typeof numOutcome.response.id).toBe('number');
    }

    const strReq = makeRequest({ jsonrpc: '2.0', id: 'req-99', method: 'nope' });
    const strOutcome = dispatchRequest(strReq, registry);
    if (!strOutcome.ok) {
      expect(strOutcome.response.id).toBe('req-99');
      expect(typeof strOutcome.response.id).toBe('string');
    }
  });

  it('method names are case-sensitive — "Ping" is not "ping" (R-3.3-d)', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 2, method: 'Ping' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.response.error.code).toBe(-32601);
  });

  it('returns ok:true for a known method', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 3, method: 'ping' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(true);
  });

  it('returns ok:true for another known method', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(true);
  });
});

// ─── invalid-params — schema validation (AC-03.12 — R-3.3-k) ─────────────────

describe('dispatchRequest — invalid-params from schema (AC-03.12 — R-3.3-k)', () => {
  const paramsSchema = z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  });

  const registry: MethodRegistry = new Map([
    ['tools/call', { paramsSchema }],
    ['ping', {}],
  ]);

  it('returns ok:false with code -32602 when params fail schema', () => {
    const req = makeRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 99 }, // name should be string
    });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.response.error.code).toBe(-32602);
      expect(outcome.response.id).toBe(10);
    }
  });

  it('returns ok:true when params satisfy the schema', () => {
    const req = makeRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'search', arguments: { query: 'mcp' } },
    });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(true);
  });

  it('skips schema validation when method has no paramsSchema', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 12, method: 'ping' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(true);
  });

  it('skips schema validation when params is absent and schema is optional', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 13, method: 'tools/call' });
    const outcome = dispatchRequest(req, registry);
    // params absent — no schema check runs (requiresParams not set)
    expect(outcome.ok).toBe(true);
  });
});

// ─── requiresParams / per-request _meta REQUIRED (AC-03.11 — R-3.3-i) ───────

describe('dispatchRequest — requiresParams (AC-03.11 — R-3.3-i)', () => {
  const registry: MethodRegistry = new Map([
    ['meta/required', { requiresParams: true }],
    ['meta/optional', {}],
    ['meta/both', { requiresParams: true, paramsSchema: z.object({ key: z.string() }) }],
  ]);

  it('returns ok:false with -32602 when requiresParams=true and params absent (R-3.3-i)', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 20, method: 'meta/required' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.response.error.code).toBe(-32602);
    }
  });

  it('returns ok:true when requiresParams=true and params is present', () => {
    const req = makeRequest({
      jsonrpc: '2.0',
      id: 21,
      method: 'meta/required',
      params: { _meta: { key: 'value' } },
    });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(true);
  });

  it('returns ok:true when requiresParams is unset and params is absent (R-3.3-h)', () => {
    const req = makeRequest({ jsonrpc: '2.0', id: 22, method: 'meta/optional' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(true);
  });

  it('validates schema even when requiresParams=true (both checks active)', () => {
    const req = makeRequest({
      jsonrpc: '2.0',
      id: 23,
      method: 'meta/both',
      params: { key: 42 }, // fails schema
    });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.response.error.code).toBe(-32602);
  });
});

// ─── empty registry edge case ─────────────────────────────────────────────────

describe('dispatchRequest — empty registry', () => {
  it('rejects any method when the registry is empty', () => {
    const registry: MethodRegistry = new Map();
    const req = makeRequest({ jsonrpc: '2.0', id: 30, method: 'anything' });
    const outcome = dispatchRequest(req, registry);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.response.error.code).toBe(-32601);
  });
});
