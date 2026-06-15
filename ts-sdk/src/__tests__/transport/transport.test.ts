/**
 * Tests for S12 — Transport Model & Transport-Agnostic Guarantees (§7).
 *
 * AC coverage:
 *  AC-12.1  (R-7.1-a/b/d)              — carries all 3 kinds both ways, no interpretation
 *  AC-12.2  (R-7.1-c)                  — byte-for-byte integrity after framing removed
 *  AC-12.3  (R-7.2-b/c/d)              — framing delimits without parsing JSON body
 *  AC-12.4  (R-7.2-e/f/g/o)            — association by id, not order/connection
 *  AC-12.5  (R-7.2-h)                  — malformed-id error MAY carry null id or omit it
 *  AC-12.6  (R-7.2-i/j/k/l)            — multiplexing; no id reuse; no await required
 *  AC-12.7  (R-7.2-m/n/p)              — out-of-order delivery; no FIFO assumption
 *  AC-12.8  (R-7.2-q/r/s)              — no silent loss; observable failure
 *  AC-12.9  (R-7.2-t)                  — clean close observable by each side
 *  AC-12.10 (R-7.3-a/b/c/d)            — custom transport conformance obligations
 *  AC-12.11 (R-7.3-e)                  — reuse stdio newline framing over byte stream
 *  AC-12.12 (R-7.4-a/b/c)             — both directions over one connection
 *  AC-12.13 (R-7.4-d/f)               — request carries _meta envelope; body authoritative
 *  AC-12.14 (R-7.4-e)                 — mirroring permitted; body remains source of truth
 *  AC-12.15 (R-7.5-a/b)               — abrupt disconnection observable; no indefinite block
 *  AC-12.16 (R-7.5-c/d/e)             — in-flight failed on disconnect
 *  AC-12.17 (R-7.5-f)                 — MAY retry on fresh connection
 *  AC-12.18 (R-7.5-g/h)               — stdio restart policy (documented, S13)
 *  AC-12.19 (R-7.5-i/j)               — no silent discard on error
 *  AC-12.20 (R-7.6-a/b/c)             — UTF-8 + single JSON value; reject malformed
 *  AC-12.21 (R-7.6-d/e/f)             — no connection-scoped state; context from _meta
 *  AC-12.22 (R-7.6-g/h/i)             — no connection-reuse requirement; interleave
 *  AC-12.23 (R-7.6-j)                 — cross-request state via explicit id
 *  AC-12.24 (R-7.7-a/b)               — lost connection fails in-flight; MAY retry
 */

import { describe, it, expect, vi } from 'vitest';
import type { JSONRPCMessage, JSONRPCResponse } from '../../jsonrpc/index.js';
import {
  // contract
  TransportError,
  isDirectionPermitted,
  requestCarriesMetaEnvelope,
  deriveRequestContext,
  extractEnvelopeForMirroring,
  TRANSPORT_GUARANTEES,
  CUSTOM_TRANSPORT_OBLIGATIONS,
  STDIO_DISCONNECT_POLICY,
  STATELESS_TRANSPORT_RULES,
  // framing
  NewlineFramer,
  NEWLINE_BYTE,
  encodeMessageUnit,
  decodeMessageUnit,
  tryDecodeMessageUnit,
  // correlation
  RequestCorrelator,
  buildParseErrorResponse,
  isAcceptableMalformedIdErrorResponse,
  PARSE_ERROR_CODE,
  // in-memory
  createInMemoryTransportPair,
} from '../../transport/index.js';
import { isValidContinuationId } from '../../protocol/stateless.js';

// ─── builders ────────────────────────────────────────────────────────────────

const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'example-client', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

function request(id: number | string, method = 'tools/call', extraParams: Record<string, unknown> = {}): JSONRPCMessage {
  return { jsonrpc: '2.0', id, method, params: { ...extraParams, _meta: { ...META } } } as JSONRPCMessage;
}
function notification(method = 'notifications/progress'): JSONRPCMessage {
  return { jsonrpc: '2.0', method, params: {} } as JSONRPCMessage;
}
function response(id: number | string, result: Record<string, unknown> = { resultType: 'complete' }): JSONRPCResponse {
  return { jsonrpc: '2.0', id, result } as JSONRPCResponse;
}

// ─── AC-12.1 — carries 3 kinds both ways, no interpretation (R-7.1-a/b/d) ───────

describe('carries all three message kinds in both directions (AC-12.1)', () => {
  it('delivers request, notification, and response with no semantic interpretation', () => {
    const [client, server] = createInMemoryTransportPair();
    const atServer: JSONRPCMessage[] = [];
    const atClient: JSONRPCMessage[] = [];
    server.onMessage((m) => atServer.push(m));
    client.onMessage((m) => atClient.push(m));

    client.send(request(1, 'totally/made-up-method', { anything: [1, 2, 3] })); // unknown method ok
    client.send(notification());
    server.send(response(1));

    expect(atServer).toHaveLength(2);
    expect(atServer[0]).toMatchObject({ method: 'totally/made-up-method', params: { anything: [1, 2, 3] } });
    expect(atServer[1]).toMatchObject({ method: 'notifications/progress' });
    expect(atClient).toHaveLength(1);
    expect(atClient[0]).toMatchObject({ id: 1, result: { resultType: 'complete' } });
  });
});

// ─── AC-12.2 — byte-for-byte integrity (R-7.1-c) ────────────────────────────────

describe('byte-for-byte integrity after framing removed (AC-12.2 · R-7.1-c)', () => {
  it('the received value equals the emitted value through the in-memory transport', () => {
    const [client, server] = createInMemoryTransportPair();
    let received: JSONRPCMessage | undefined;
    server.onMessage((m) => { received = m; });
    const sent = request(42, 'tools/call', { name: 'get_weather', arguments: { location: 'New York' } });
    client.send(sent);
    expect(received).toEqual(sent);
  });

  it('NewlineFramer encode→decode round-trips to byte-identical bodies', () => {
    const framer = new NewlineFramer();
    const msg = request('x', 'tools/call', { unicode: 'héllo 世界 — \n escaped newline' });
    const framed = framer.encode(msg);
    const decoder = framer.createDecoder();
    const [unit] = decoder.push(framed);
    expect(unit).toBeDefined();
    // framing removed → identical to the framing-less encoding
    expect(Array.from(unit!)).toEqual(Array.from(encodeMessageUnit(msg)));
    expect(decodeMessageUnit(unit!)).toEqual(msg);
  });
});

// ─── AC-12.3 — framing delimits without parsing JSON body (R-7.2-b/c/d) ─────────

describe('framing delimits messages without parsing the body (AC-12.3)', () => {
  it('splits two concatenated framed messages by delimiter alone', () => {
    const framer = new NewlineFramer();
    const a = framer.encode(request(1));
    const b = framer.encode(notification());
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);

    const decoder = framer.createDecoder();
    const units = decoder.push(combined);
    expect(units).toHaveLength(2);
    expect(decodeMessageUnit(units[0]!)).toMatchObject({ id: 1 });
    expect(decodeMessageUnit(units[1]!)).toMatchObject({ method: 'notifications/progress' });
  });

  it('handles a message split across two chunks; retains the partial (no drop)', () => {
    const framer = new NewlineFramer();
    const full = framer.encode(request(7));
    const cut = Math.floor(full.length / 2);
    const decoder = framer.createDecoder();

    expect(decoder.push(full.slice(0, cut))).toHaveLength(0); // no delimiter yet
    expect(decoder.pending).toBe(cut); // buffered, not dropped
    const units = decoder.push(full.slice(cut));
    expect(units).toHaveLength(1);
    expect(decodeMessageUnit(units[0]!)).toMatchObject({ id: 7 });
    expect(decoder.pending).toBe(0);
  });

  it('a serialized message never contains a raw newline byte (delimiter is unambiguous)', () => {
    const body = encodeMessageUnit(request(1, 'tools/call', { text: 'line1\nline2' }));
    expect(body.includes(NEWLINE_BYTE)).toBe(false); // embedded \n is JSON-escaped
  });
});

// ─── AC-12.4 — association by id (R-7.2-e/f/g/o) ────────────────────────────────

describe('association by id, independent of order/connection (AC-12.4)', () => {
  it('resolves a request when a response with the matching id is delivered', async () => {
    const correlator = new RequestCorrelator();
    const p = correlator.issue(99);
    correlator.deliver(response(99, { resultType: 'complete', ok: true }));
    await expect(p).resolves.toMatchObject({ id: 99, result: { ok: true } });
  });

  it('matches by id even when the response arrives on a different correlator path', async () => {
    const correlator = new RequestCorrelator();
    const p = correlator.issue('abc');
    // delivery order/position is irrelevant — only id matters
    expect(correlator.deliver(response('zzz'))).toBe(false); // unmatched id ignored
    expect(correlator.deliver(response('abc'))).toBe(true);
    await expect(p).resolves.toMatchObject({ id: 'abc' });
  });

  it('keeps string and number ids distinct (no coercion)', async () => {
    const correlator = new RequestCorrelator();
    const pNum = correlator.issue(1);
    const pStr = correlator.issue('1');
    correlator.deliver(response('1', { resultType: 'complete', which: 'string' }));
    correlator.deliver(response(1, { resultType: 'complete', which: 'number' }));
    await expect(pNum).resolves.toMatchObject({ result: { which: 'number' } });
    await expect(pStr).resolves.toMatchObject({ result: { which: 'string' } });
  });
});

// ─── AC-12.5 — malformed-id error MAY carry null id or omit (R-7.2-h) ───────────

describe('malformed-id error response (AC-12.5 · R-7.2-h)', () => {
  it('accepts a null id form', () => {
    const r = buildParseErrorResponse({ nullId: true });
    expect(r.id).toBeNull();
    expect(r.error.code).toBe(PARSE_ERROR_CODE);
    expect(isAcceptableMalformedIdErrorResponse(r)).toBe(true);
  });

  it('accepts an omitted id form', () => {
    const r = buildParseErrorResponse();
    expect('id' in r).toBe(false);
    expect(isAcceptableMalformedIdErrorResponse(r)).toBe(true);
  });

  it('also accepts the §9 wire example with id null and code -32700', () => {
    expect(isAcceptableMalformedIdErrorResponse({
      jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' },
    })).toBe(true);
  });
});

// ─── AC-12.6 — multiplexing (R-7.2-i/j/k/l) ─────────────────────────────────────

describe('multiplexing concurrent requests (AC-12.6)', () => {
  it('permits multiple outstanding requests without awaiting the first', () => {
    const correlator = new RequestCorrelator();
    correlator.issue(1);
    correlator.issue(2);
    correlator.issue(3);
    expect(correlator.size).toBe(3);
    expect(correlator.outstanding).toEqual([1, 2, 3]);
  });

  it('forbids reuse of the id of an unanswered request (R-7.2-j)', () => {
    const correlator = new RequestCorrelator();
    correlator.issue(5);
    expect(() => correlator.issue(5)).toThrow();
  });

  it('allows reusing an id once its response has been delivered', () => {
    const correlator = new RequestCorrelator();
    correlator.issue(5);
    correlator.deliver(response(5));
    expect(() => correlator.issue(5)).not.toThrow();
  });
});

// ─── AC-12.7 — out-of-order delivery (R-7.2-m/n/p) ──────────────────────────────

describe('out-of-order response delivery (AC-12.7)', () => {
  it('matches each response to its request when id 3 arrives before id 2', async () => {
    const correlator = new RequestCorrelator();
    const p2 = correlator.issue(2);
    const p3 = correlator.issue(3);
    // responses arrive 3-then-2 (reverse of request order)
    correlator.deliver(response(3, { resultType: 'complete', resources: [] }));
    correlator.deliver(response(2, { resultType: 'complete', tools: [] }));
    await expect(p3).resolves.toMatchObject({ id: 3, result: { resources: [] } });
    await expect(p2).resolves.toMatchObject({ id: 2, result: { tools: [] } });
  });
});

// ─── AC-12.8 / AC-12.19 — no silent loss; observable failure (R-7.2-q/r/s, R-7.5-i/j)

describe('no silent loss; observable failure (AC-12.8 · AC-12.19)', () => {
  it('throws a TransportError on send after the channel is closed', () => {
    const [client] = createInMemoryTransportPair();
    client.close();
    expect(() => client.send(request(1))).toThrow(TransportError);
  });

  it('surfaces a failure when the receiving peer is closed (not silently dropped)', () => {
    const [client, server] = createInMemoryTransportPair();
    server.close(); // closing one closes both, so client.send observes it
    expect(() => client.send(request(1))).toThrow(TransportError);
  });
});

// ─── AC-12.9 — clean close observable (R-7.2-t) ─────────────────────────────────

describe('clean close is observable by each side (AC-12.9 · R-7.2-t)', () => {
  it('fires onClose with clean:true on both endpoints', () => {
    const [client, server] = createInMemoryTransportPair();
    const clientClose = vi.fn();
    const serverClose = vi.fn();
    client.onClose(clientClose);
    server.onClose(serverClose);
    client.close('done');
    expect(clientClose).toHaveBeenCalledWith({ clean: true, reason: 'done' });
    expect(serverClose).toHaveBeenCalledWith({ clean: true, reason: 'done' });
    expect(client.closed).toBe(true);
    expect(server.closed).toBe(true);
  });

  it('a handler registered after close still observes it', () => {
    const [client] = createInMemoryTransportPair();
    client.close();
    const late = vi.fn();
    client.onClose(late);
    expect(late).toHaveBeenCalledWith({ clean: true });
  });
});

// ─── AC-12.10 / AC-12.11 — custom transport conformance (R-7.3) ─────────────────

describe('custom transport obligations and framing reuse (AC-12.10 · AC-12.11)', () => {
  it('enumerates the §7.3 obligations and §7.2 guarantees as documentation anchors', () => {
    expect(CUSTOM_TRANSPORT_OBLIGATIONS.UPHOLD_ALL_GUARANTEES).toBe('R-7.3-c');
    expect(CUSTOM_TRANSPORT_OBLIGATIONS.SHOULD_REUSE_STDIO_FRAMING).toBe('R-7.3-e');
    expect(CUSTOM_TRANSPORT_OBLIGATIONS.PRESERVE_FORMAT_PATTERNS_METADATA).toBe('R-7.3-b');
    expect(Object.keys(TRANSPORT_GUARANTEES)).toContain('NO_SILENT_LOSS');
  });

  it('NewlineFramer is the reusable byte-stream framing a custom transport SHOULD reuse', () => {
    const framer = new NewlineFramer();
    expect(framer.name).toBe('newline');
    // round-trips over a simulated byte stream (e.g. Unix socket / TCP)
    const decoder = framer.createDecoder();
    const [unit] = decoder.push(framer.encode(request(1)));
    expect(decodeMessageUnit(unit!)).toMatchObject({ id: 1 });
  });

  it('the in-memory transport (a custom transport) preserves format + metadata model', () => {
    const [client, server] = createInMemoryTransportPair();
    let received: JSONRPCMessage | undefined;
    server.onMessage((m) => { received = m; });
    client.send(request(1));
    expect(requestCarriesMetaEnvelope(received)).toBe(true); // per-request metadata preserved
  });
});

// ─── AC-12.12 — both directions over one connection (R-7.4-a/b/c) ───────────────

describe('bidirectional carriage over one connection (AC-12.12)', () => {
  it('client→server requests/notifications and server→client responses/notifications', () => {
    const [client, server] = createInMemoryTransportPair();
    const serverInbox: JSONRPCMessage[] = [];
    const clientInbox: JSONRPCMessage[] = [];
    server.onMessage((m) => serverInbox.push(m));
    client.onMessage((m) => clientInbox.push(m));

    client.send(request(1));
    client.send(notification('notifications/cancelled'));
    server.send(response(1));
    server.send(notification('notifications/message'));

    expect(serverInbox.map((m) => (m as any).method ?? 'response')).toEqual(['tools/call', 'notifications/cancelled']);
    expect(clientInbox.map((m) => (m as any).method ?? 'response')).toEqual(['response', 'notifications/message']);
  });

  it('directionality: requests are client→server only, responses server→client only', () => {
    expect(isDirectionPermitted('request', 'client-to-server')).toBe(true);
    expect(isDirectionPermitted('request', 'server-to-client')).toBe(false);
    expect(isDirectionPermitted('response', 'server-to-client')).toBe(true);
    expect(isDirectionPermitted('response', 'client-to-server')).toBe(false);
    expect(isDirectionPermitted('notification', 'client-to-server')).toBe(true);
    expect(isDirectionPermitted('notification', 'server-to-client')).toBe(true);
  });
});

// ─── AC-12.13 — request carries _meta envelope (R-7.4-d/f) ───────────────────────

describe('per-request _meta envelope required regardless of transport (AC-12.13)', () => {
  it('accepts a request carrying the three reserved keys', () => {
    expect(requestCarriesMetaEnvelope(request(1))).toBe(true);
    const ctx = deriveRequestContext(request(1));
    expect(ctx?.protocolVersion).toBe('2026-07-28');
    expect(ctx?.clientInfo).toMatchObject({ name: 'example-client' });
  });

  it('rejects a request whose _meta is missing a reserved key', () => {
    const bad = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } };
    expect(requestCarriesMetaEnvelope(bad)).toBe(false);
    expect(deriveRequestContext(bad)).toBeUndefined();
  });

  it('rejects a request with no _meta at all', () => {
    expect(requestCarriesMetaEnvelope({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} })).toBe(false);
  });
});

// ─── AC-12.14 — mirroring permitted; body authoritative (R-7.4-e) ───────────────

describe('envelope mirroring permitted, body is source of truth (AC-12.14)', () => {
  it('extracts the envelope fields from the body for transport-level mirroring', () => {
    const req = request(1);
    const mirror = extractEnvelopeForMirroring(req);
    expect(mirror?.protocolVersion).toBe('2026-07-28');
    // the mirror is derived from the body — it equals the body's _meta values
    expect(mirror).toEqual(deriveRequestContext(req));
  });

  it('returns undefined when the body carries no valid envelope (never fabricates a mirror)', () => {
    expect(extractEnvelopeForMirroring({ jsonrpc: '2.0', id: 1, method: 'x', params: {} })).toBeUndefined();
  });
});

// ─── AC-12.15 — abrupt disconnection observable (R-7.5-a/b) ─────────────────────

describe('abrupt disconnection is observable (AC-12.15)', () => {
  it('fires onClose with clean:false and does not leave the channel "live"', () => {
    const [client, server] = createInMemoryTransportPair();
    const onClose = vi.fn();
    server.onClose(onClose);
    client.disconnect('socket reset');
    expect(onClose).toHaveBeenCalledWith({ clean: false, reason: 'socket reset' });
    expect(server.closed).toBe(true);
    expect(() => server.send(response(1))).toThrow(TransportError); // not blocking as if live
  });
});

// ─── AC-12.16 / AC-12.24 — in-flight failed on disconnect (R-7.5-c/d/e, R-7.7-a) ─

describe('in-flight requests fail on disconnection (AC-12.16 · AC-12.24)', () => {
  it('rejects every outstanding request when the connection is lost (no indefinite wait)', async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new RequestCorrelator();
    // wire disconnection to fail all in-flight requests
    client.onClose((info) => correlator.failAll(new TransportError(`connection lost (clean=${info.clean})`)));

    const p2 = correlator.issue(2);
    const p3 = correlator.issue(3);
    client.send(request(2, 'tools/list'));
    client.send(request(3, 'resources/list'));
    expect(correlator.size).toBe(2);

    server.disconnect(); // lost before responses arrive
    await expect(p2).rejects.toBeInstanceOf(TransportError);
    await expect(p3).rejects.toBeInstanceOf(TransportError);
    expect(correlator.size).toBe(0);
  });

  it('failAll returns the ids it failed', async () => {
    const correlator = new RequestCorrelator();
    // capture rejections so they are observed (callers must handle the failure)
    const p2 = correlator.issue(2).catch(() => 'failed');
    const p3 = correlator.issue(3).catch(() => 'failed');
    const failed = correlator.failAll(new TransportError('lost'));
    expect(failed).toEqual([2, 3]);
    expect(await Promise.all([p2, p3])).toEqual(['failed', 'failed']);
  });
});

// ─── AC-12.17 — MAY retry on fresh connection (R-7.5-f) ─────────────────────────

describe('retry on a fresh connection after failure (AC-12.17)', () => {
  it('the same ids may be reissued on a new correlator because no state is bound to the old one', async () => {
    const first = new RequestCorrelator();
    const p = first.issue(2).catch((e) => e);
    first.failAll(new TransportError('connection lost'));
    expect(await p).toBeInstanceOf(TransportError);

    // fresh connection: reissue the same id, succeed
    const second = new RequestCorrelator();
    const p2 = second.issue(2);
    second.deliver(response(2, { resultType: 'complete', retried: true }));
    await expect(p2).resolves.toMatchObject({ result: { retried: true } });
  });
});

// ─── AC-12.18 — stdio restart policy (documented; S13) (R-7.5-g/h) ──────────────

describe('stdio disconnection policy is documented for S13 (AC-12.18)', () => {
  it('records the SHOULD-restart and MAY-retry atoms', () => {
    expect(STDIO_DISCONNECT_POLICY.SHOULD_RESTART_ON_UNEXPECTED_EXIT).toBe('R-7.5-g');
    expect(STDIO_DISCONNECT_POLICY.MAY_RETRY_INFLIGHT_ON_FRESH_PROCESS).toBe('R-7.5-h');
  });
});

// ─── AC-12.20 — UTF-8 + single JSON value; reject malformed (R-7.6-a/b/c) ───────

describe('UTF-8 + single-JSON-value decoding (AC-12.20)', () => {
  it('decodes a well-formed UTF-8 JSON unit', () => {
    expect(decodeMessageUnit(encodeMessageUnit(request(1)))).toMatchObject({ id: 1 });
  });

  it('rejects ill-formed UTF-8 with a TransportError (no substitution)', () => {
    const badUtf8 = Uint8Array.from([0xff, 0xfe, 0xfd]); // not valid UTF-8
    expect(() => decodeMessageUnit(badUtf8)).toThrow(TransportError);
    const r = tryDecodeMessageUnit(badUtf8);
    expect(r.ok).toBe(false);
  });

  it('rejects a unit that is not a single JSON value', () => {
    const two = new TextEncoder().encode('{"jsonrpc":"2.0"} {"x":1}');
    expect(() => decodeMessageUnit(two)).toThrow(TransportError);
  });

  it('rejects a unit that is not a valid JSON-RPC message', () => {
    const notRpc = new TextEncoder().encode('{"hello":"world"}');
    expect(() => decodeMessageUnit(notRpc)).toThrow(TransportError);
  });
});

// ─── QA Bucket B #4 — receiver-side decode errors go to the receiver channel ────

describe('receiver-side decode errors surface on the receiver, not the sender (QA #4)', () => {
  it('routes a corrupt inbound unit to the receiver onError, leaving send unaffected', () => {
    const [, server] = createInMemoryTransportPair();
    const errors: TransportError[] = [];
    const messages: JSONRPCMessage[] = [];
    server.onError((e) => errors.push(e));
    server.onMessage((m) => messages.push(m));

    // a corrupt (non-UTF-8) framed unit arrives on the wire at the server
    server.injectRawBytes(Uint8Array.from([0xff, 0xfe, 0x0a]));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TransportError);
    expect(messages).toHaveLength(0);
    expect(server.closed).toBe(false); // a parse error is not a disconnection
  });

  it('does not throw back into an unrelated sender', () => {
    const [client, server] = createInMemoryTransportPair();
    server.onError(() => {});
    // injecting bad bytes at the server must not affect the client's send path
    server.injectRawBytes(new TextEncoder().encode('{"not":"rpc"}\n'));
    expect(() => client.send(request(1))).not.toThrow();
  });

  it('buffers decode errors until an onError handler attaches (no silent drop)', () => {
    const [, server] = createInMemoryTransportPair();
    server.injectRawBytes(Uint8Array.from([0xff, 0x0a])); // error before any handler
    const errors: TransportError[] = [];
    server.onError((e) => errors.push(e)); // late subscriber still observes it
    expect(errors).toHaveLength(1);
  });
});

// ─── AC-12.21 — no connection-scoped state; context from _meta (R-7.6-d/e/f) ────

describe('statelessness: context derived from each request _meta (AC-12.21)', () => {
  it('two requests on one connection yield independent contexts from their own _meta', () => {
    const reqA = request(1);
    const reqB = {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'other-client', version: '9.9.9' },
        'io.modelcontextprotocol/clientCapabilities': { sampling: {} },
      } },
    };
    const ctxA = deriveRequestContext(reqA);
    const ctxB = deriveRequestContext(reqB);
    expect(ctxA?.clientInfo).toMatchObject({ name: 'example-client' });
    expect(ctxB?.clientInfo).toMatchObject({ name: 'other-client' });
    expect(ctxB?.clientCapabilities).toMatchObject({ sampling: {} });
  });

  it('enumerates the §7.6 statelessness rule atoms', () => {
    expect(STATELESS_TRANSPORT_RULES.CONTEXT_FROM_META_ONLY).toBe('R-7.6-f');
    expect(STATELESS_TRANSPORT_RULES.NO_PRIOR_REQUEST_INFERENCE).toBe('R-7.6-e');
  });
});

// ─── AC-12.22 — no connection-reuse requirement; interleave (R-7.6-g/h/i) ───────

describe('connection reuse not required; interleaving allowed (AC-12.22)', () => {
  it('interleaves unrelated requests on one connection, each carrying its own _meta', () => {
    const [client, server] = createInMemoryTransportPair();
    const seen: string[] = [];
    server.onMessage((m) => seen.push((m as any).method));
    client.send(request(1, 'tools/call'));
    client.send(request(2, 'resources/list')); // unrelated, interleaved
    client.send(request(3, 'prompts/get'));
    expect(seen).toEqual(['tools/call', 'resources/list', 'prompts/get']);
  });

  it('documents that connection identity is not a proxy for conversation', () => {
    expect(STATELESS_TRANSPORT_RULES.CONNECTION_NOT_CONVERSATION).toBe('R-7.6-i');
    expect(STATELESS_TRANSPORT_RULES.SHOULD_NOT_REQUIRE_CONNECTION_REUSE).toBe('R-7.6-g');
    expect(STATELESS_TRANSPORT_RULES.MAY_INTERLEAVE_UNRELATED).toBe('R-7.6-h');
  });
});

// ─── AC-12.23 — cross-request state via explicit id (R-7.6-j) ───────────────────

describe('cross-request state via explicit client-supplied identifier (AC-12.23)', () => {
  it('continuity rides on an explicit continuation id (S06), not the connection', () => {
    // A server-minted opaque token the client echoes on a later, possibly new-connection request.
    const token = 'cursor-abc-123';
    expect(isValidContinuationId(token)).toBe(true);
    const followUp = request(2, 'resources/list', { cursor: token });
    expect((followUp as any).params.cursor).toBe(token);
    // The identifier travels in the message body, independent of any connection.
    expect(requestCarriesMetaEnvelope(followUp)).toBe(true);
  });
});
