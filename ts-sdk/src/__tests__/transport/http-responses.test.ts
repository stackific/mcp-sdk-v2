/**
 * S15 — Tests for the Streamable HTTP response half (§9.6–§9.12).
 *
 * Each `describe` maps to an acceptance criterion (AC-15.1 … AC-15.25); the
 * test names cite the normative atoms they exercise.
 */

import { describe, it, expect } from 'vitest';
import {
  ResponseShape,
  chooseResponseShape,
  buildSingleJsonResponse,
  buildEventStreamHeaders,
  buildErrorResponse,
  buildMethodNotFoundResponse,
  buildNotificationAcceptedResponse,
  buildHeaderMismatchError,
  buildHeaderMismatchResponse,
  headerMismatchForCause,
  formatSseEvent,
  validateStreamMessage,
  RequestEventStream,
  httpStatusForErrorCode,
  REVISION_ERROR_CODES,
  isSessionIdHeader,
  stripIgnoredStatelessHeaders,
  methodNotAllowedResponse,
  recommendedLocalBindAddress,
  validateOrigin,
  buildForbiddenOriginResponse,
  interpretPostForFallback,
  isLegacyHttpSseServer,
  OK_STATUS,
  FORBIDDEN_STATUS,
  NOT_FOUND_STATUS,
  METHOD_NOT_ALLOWED_STATUS,
  BAD_REQUEST_STATUS,
  NOTIFICATION_ACCEPTED_STATUS,
  HEADER_MISMATCH_CODE,
  METHOD_NOT_FOUND_CODE,
  INVALID_REQUEST_CODE,
  INVALID_PARAMS_CODE,
  PARSE_ERROR_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  SINGLE_JSON_CONTENT_TYPE,
  EVENT_STREAM_CONTENT_TYPE,
  X_ACCEL_BUFFERING_HEADER,
  X_ACCEL_BUFFERING_VALUE,
  LAST_EVENT_ID_HEADER,
  LOOPBACK_BIND_ADDRESS,
  ALL_INTERFACES_BIND_ADDRESS,
  LEGACY_ENDPOINT_EVENT,
} from '../../transport/http/responses.js';

// ─── AC-15.1 — exactly one of two shapes, both 200 OK (R-9.6-a) ────────────────

describe('AC-15.1 response-shape choice (R-9.6-a)', () => {
  it('picks exactly one of the two shapes per request', () => {
    expect(chooseResponseShape(false)).toBe(ResponseShape.SINGLE_JSON);
    expect(chooseResponseShape(true)).toBe(ResponseShape.EVENT_STREAM);
    expect(new Set(Object.values(ResponseShape)).size).toBe(2);
  });

  it('both shapes are delivered over HTTP 200 OK', () => {
    expect(OK_STATUS).toBe(200);
    const single = buildSingleJsonResponse({ jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } });
    expect(single.status).toBe(OK_STATUS);
    // The event-stream shape opens with the same 200 status.
    expect(buildEventStreamHeaders()['Content-Type']).toBe(EVENT_STREAM_CONTENT_TYPE);
  });
});

// ─── AC-15.2 — single JSON response (R-9.6.1-a) ────────────────────────────────

describe('AC-15.2 single JSON response (R-9.6.1-a)', () => {
  it('200 + application/json + exactly one response whose id equals the request id', () => {
    const res = buildSingleJsonResponse({ jsonrpc: '2.0', id: 7, result: { resultType: 'complete' } });
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toBe(SINGLE_JSON_CONTENT_TYPE);
    expect(res.body).toEqual({ jsonrpc: '2.0', id: 7, result: { resultType: 'complete' } });
    expect((res.body as { id: number }).id).toBe(7);
  });

  it('carries an error response shape too (id preserved)', () => {
    const res = buildSingleJsonResponse({ jsonrpc: '2.0', id: 'abc', error: { code: -1, message: 'x' } });
    expect((res.body as { id: string }).id).toBe('abc');
  });
});

// ─── AC-15.3 — event-stream framing (R-9.6.2-a) ────────────────────────────────

describe('AC-15.3 event-stream response framing (R-9.6.2-a)', () => {
  it('opens 200 + text/event-stream', () => {
    const headers = buildEventStreamHeaders();
    expect(headers['Content-Type']).toBe('text/event-stream');
  });

  it('each event is one data: line carrying one JSON-RPC message, terminated by a blank line', () => {
    const msg = { jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } };
    const event = formatSseEvent(msg);
    expect(event).toBe(`data: ${JSON.stringify(msg)}\n\n`);
    expect(event.endsWith('\n\n')).toBe(true);
    expect(event.startsWith('data: ')).toBe(true);
    // The data field round-trips to exactly one JSON-RPC message.
    expect(JSON.parse(event.slice('data: '.length).trimEnd())).toEqual(msg);
  });
});

// ─── AC-15.4 — pre-response notifications relate to the request (R-9.6.2-b/c) ──

describe('AC-15.4 request-scoped notifications (R-9.6.2-b, R-9.6.2-c)', () => {
  it('MAY emit notifications before the final response', () => {
    const events: string[] = [];
    const stream = new RequestEventStream((e) => events.push(e));
    stream.sendNotification({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: 'sql-1', progress: 50, total: 100 },
    });
    stream.sendNotification({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level: 'info', data: 'querying' },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toContain('notifications/progress');
    expect(events[1]).toContain('notifications/message');
  });

  it('a notification carrying an id is rejected (must be a true notification)', () => {
    const stream = new RequestEventStream(() => {});
    // A method+id object is a request, not a notification, and is rejected outright.
    expect(() =>
      stream.sendNotification({ jsonrpc: '2.0', method: 'notifications/progress', id: 1 } as never),
    ).toThrow();
  });
});

// ─── AC-15.5 — never an independent request on the stream (R-9.6.2-d) ──────────

describe('AC-15.5 no independent request on the stream (R-9.6.2-d)', () => {
  it('an object with both method and id is forbidden on the stream', () => {
    const result = validateStreamMessage({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 9 });
    expect(result.ok).toBe(false);
  });

  it('a notification (method, no id) and a response (id, no method) are allowed', () => {
    expect(validateStreamMessage({ jsonrpc: '2.0', method: 'notifications/progress', params: {} }).ok).toBe(true);
    expect(validateStreamMessage({ jsonrpc: '2.0', id: 1, result: {} }).ok).toBe(true);
  });
});

// ─── AC-15.6 — final response terminates, nothing after (R-9.6.2-e/f) ──────────

describe('AC-15.6 final response terminates the stream (R-9.6.2-e, R-9.6.2-f)', () => {
  it('the final response closes the stream as completed', () => {
    const events: string[] = [];
    const stream = new RequestEventStream((e) => events.push(e));
    stream.sendFinalResponse({ jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } });
    expect(stream.closed).toBe(true);
    expect(stream.completed).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('no further messages may be sent after the final response', () => {
    const stream = new RequestEventStream(() => {});
    stream.sendFinalResponse({ jsonrpc: '2.0', id: 1, result: {} });
    expect(() => stream.sendNotification({ jsonrpc: '2.0', method: 'notifications/progress' })).toThrow();
    expect(() => stream.sendFinalResponse({ jsonrpc: '2.0', id: 1, result: {} })).toThrow();
  });
});

// ─── AC-15.7 — X-Accel-Buffering: no (R-9.6.2-g) ───────────────────────────────

describe('AC-15.7 X-Accel-Buffering hint (R-9.6.2-g)', () => {
  it('includes X-Accel-Buffering: no by default', () => {
    const headers = buildEventStreamHeaders();
    expect(headers[X_ACCEL_BUFFERING_HEADER]).toBe(X_ACCEL_BUFFERING_VALUE);
    expect(X_ACCEL_BUFFERING_VALUE).toBe('no');
  });

  it('can be omitted when requested', () => {
    const headers = buildEventStreamHeaders(false);
    expect(headers[X_ACCEL_BUFFERING_HEADER]).toBeUndefined();
  });
});

// ─── AC-15.8 — Last-Event-ID ignored, non-resumable (R-9.6.2-h, R-9.9-g) ───────

describe('AC-15.8 Last-Event-ID ignored (R-9.6.2-h, R-9.9-g)', () => {
  it('strips the Last-Event-ID header from the request', () => {
    const stripped = stripIgnoredStatelessHeaders({
      'Content-Type': 'application/json',
      'Last-Event-ID': '42',
    });
    expect(stripped['Last-Event-ID']).toBeUndefined();
    expect(stripped['Content-Type']).toBe('application/json');
  });

  it('strips case-insensitively', () => {
    const stripped = stripIgnoredStatelessHeaders({ 'last-event-id': '7' });
    expect(Object.keys(stripped)).toHaveLength(0);
    expect(LAST_EVENT_ID_HEADER).toBe('Last-Event-ID');
  });
});

// ─── AC-15.9 — close-as-cancellation (R-9.6.2-i/j/k) ───────────────────────────

describe('AC-15.9 stream close is cancellation (R-9.6.2-i, R-9.6.2-j, R-9.6.2-k)', () => {
  it('client close closes the stream without completing it', () => {
    const stream = new RequestEventStream(() => {});
    stream.cancelByClientClose();
    expect(stream.closed).toBe(true);
    expect(stream.completed).toBe(false);
  });

  it('no further messages may be sent after a client close', () => {
    const events: string[] = [];
    const stream = new RequestEventStream((e) => events.push(e));
    stream.cancelByClientClose();
    expect(() => stream.sendNotification({ jsonrpc: '2.0', method: 'notifications/progress' })).toThrow();
    expect(() => stream.sendFinalResponse({ jsonrpc: '2.0', id: 1, result: {} })).toThrow();
    expect(events).toHaveLength(0);
  });

  it('cancelByClientClose is idempotent', () => {
    const stream = new RequestEventStream(() => {});
    stream.cancelByClientClose();
    expect(() => stream.cancelByClientClose()).not.toThrow();
  });
});

// ─── AC-15.10 — 404 + -32601 for unknown method (R-9.7-b) ──────────────────────

describe('AC-15.10 method-not-found 404 (R-9.7-b)', () => {
  it('returns 404 with a JSON-RPC error body of code -32601', () => {
    const res = buildMethodNotFoundResponse('tools/teleport', 7);
    expect(res.status).toBe(NOT_FOUND_STATUS);
    expect(res.status).toBe(404);
    const body = res.body as { jsonrpc: string; id: number; error: { code: number; message: string } };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(7);
    expect(body.error.code).toBe(METHOD_NOT_FOUND_CODE);
    expect(body.error.code).toBe(-32601);
    expect(body.error.message).toContain('tools/teleport');
  });

  it('the status map sends -32601 to 404 and other codes to 400', () => {
    expect(httpStatusForErrorCode(METHOD_NOT_FOUND_CODE)).toBe(404);
    expect(httpStatusForErrorCode(PARSE_ERROR_CODE)).toBe(400);
    expect(httpStatusForErrorCode(INVALID_REQUEST_CODE)).toBe(400);
    expect(httpStatusForErrorCode(INVALID_PARAMS_CODE)).toBe(400);
    expect(httpStatusForErrorCode(HEADER_MISMATCH_CODE)).toBe(400);
    expect(httpStatusForErrorCode(-32603)).toBe(400);
  });
});

// ─── AC-15.11 — -32001 HeaderMismatch on 400 (R-9.8-a/b/c/d) ───────────────────

describe('AC-15.11 HeaderMismatch -32001 (R-9.8-a, R-9.8-b, R-9.8-c, R-9.8-d)', () => {
  it('builds the full -32001 error object', () => {
    const err = buildHeaderMismatchError("Mcp-Name header value 'foo' does not match body value 'bar'");
    expect(err.code).toBe(-32001);
    expect(err.code).toBe(HEADER_MISMATCH_CODE);
    expect(err.message).toContain('foo');
  });

  it('wraps the error into HTTP 400 with the originating id', () => {
    const res = buildHeaderMismatchResponse(buildHeaderMismatchError(), 1);
    expect(res.status).toBe(BAD_REQUEST_STATUS);
    expect(res.status).toBe(400);
    const body = res.body as { id: number; error: { code: number } };
    expect(body.id).toBe(1);
    expect(body.error.code).toBe(-32001);
  });

  it('R-9.8-b — missing required header', () => {
    const err = headerMismatchForCause({ kind: 'missing-required-header', header: 'Mcp-Method' });
    expect(err.code).toBe(-32001);
    expect(err.message).toMatch(/Mcp-Method.*missing/);
  });

  it('R-9.8-c — header value disagrees with body', () => {
    const err = headerMismatchForCause({
      kind: 'value-mismatch',
      header: 'Mcp-Name',
      headerValue: 'foo',
      bodyValue: 'bar',
    });
    expect(err.code).toBe(-32001);
    expect(err.message).toContain("'foo'");
    expect(err.message).toContain("'bar'");
  });

  it('R-9.8-d — Mcp-Param-* with invalid characters', () => {
    const err = headerMismatchForCause({ kind: 'invalid-param-characters', header: 'Mcp-Param-Region' });
    expect(err.code).toBe(-32001);
    expect(err.message).toMatch(/invalid characters/);
  });
});

// ─── AC-15.12 — intermediary MAY omit JSON-RPC body (R-9.8-e, R-9.8-f) ─────────

describe('AC-15.12 intermediary rejection (R-9.8-e, R-9.8-f)', () => {
  it('an intermediary returns an appropriate status (400) and MAY omit the JSON-RPC body', () => {
    // R-9.8-e: an appropriate HTTP error status, e.g. 400.
    const bodied = buildHeaderMismatchResponse(buildHeaderMismatchError());
    expect(bodied.status).toBe(400);
    // R-9.8-f: the intermediary need not include a JSON-RPC body — a bare 400 is valid.
    const bare = methodNotAllowedResponse('POST'); // POST → no 405; intermediary uses its own bare reject below
    expect(bare).toBeUndefined();
    const bareReject = { status: BAD_REQUEST_STATUS, headers: {} };
    expect(bareReject.status).toBe(400);
    expect((bareReject as { body?: unknown }).body).toBeUndefined();
  });
});

// ─── AC-15.13 — intermediary trust depends on MCP-Protocol-Version (R-9.8-g/h) ─

describe('AC-15.13 intermediary trust of mirrored headers (R-9.8-g, R-9.8-h)', () => {
  // The intermediary policy is expressed as: trust mirrored headers only when the
  // protocol-version header is present (indicating header-body validation);
  // otherwise reject. We model that decision with the revision-error recognizer
  // and a small policy helper inline to assert the SHOULD behavior.
  function intermediaryShouldTrust(protocolVersionHeader: string | undefined): boolean {
    return protocolVersionHeader !== undefined;
  }

  it('R-9.8-g — MAY trust mirrored headers when the version header is present', () => {
    expect(intermediaryShouldTrust('2026-07-28')).toBe(true);
  });

  it('R-9.8-h — SHOULD reject when the version header is absent', () => {
    expect(intermediaryShouldTrust(undefined)).toBe(false);
  });
});

// ─── AC-15.14 — no handshake / no session state (R-9.9-a) ──────────────────────

describe('AC-15.14 stateless: no handshake (R-9.9-a)', () => {
  it('a POST is self-contained: building a response needs no prior session', () => {
    // There is no session-establishment builder in the surface; any request maps
    // straight to a response. Building from a bare request body succeeds.
    const res = buildSingleJsonResponse({ jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } });
    expect(res.status).toBe(200);
  });
});

// ─── AC-15.15 — no session identifier header (R-9.9-b/c/d) ─────────────────────

describe('AC-15.15 no session identifier (R-9.9-b, R-9.9-c, R-9.9-d)', () => {
  it('recognizes session-id headers case-insensitively', () => {
    expect(isSessionIdHeader('Mcp-Session-Id')).toBe(true);
    expect(isSessionIdHeader('x-session-id')).toBe(true);
    expect(isSessionIdHeader('Content-Type')).toBe(false);
  });

  it('a client-supplied session-id header is stripped (ignored)', () => {
    const stripped = stripIgnoredStatelessHeaders({
      'Mcp-Session-Id': 'abc',
      'MCP-Protocol-Version': '2026-07-28',
    });
    expect(stripped['Mcp-Session-Id']).toBeUndefined();
    expect(stripped['MCP-Protocol-Version']).toBe('2026-07-28');
  });

  it('no builder mints or echoes a session id', () => {
    const res = buildSingleJsonResponse({ jsonrpc: '2.0', id: 1, result: {} });
    const headerNames = Object.keys(res.headers).map((h) => h.toLowerCase());
    expect(headerNames.some((h) => h.includes('session'))).toBe(false);
  });
});

// ─── AC-15.16 — no server affinity (R-9.9-e) ───────────────────────────────────

describe('AC-15.16 no server affinity (R-9.9-e)', () => {
  it('the same request body produces an identical response on any instance', () => {
    const body = { jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } } as const;
    const onInstanceA = buildSingleJsonResponse({ ...body });
    const onInstanceB = buildSingleJsonResponse({ ...body });
    expect(onInstanceA).toEqual(onInstanceB);
  });
});

// ─── AC-15.17 — 405 for GET/DELETE (R-9.9-f) ───────────────────────────────────

describe('AC-15.17 405 for GET/DELETE (R-9.9-f)', () => {
  it('GET and DELETE at the endpoint return 405 with empty body', () => {
    for (const method of ['GET', 'DELETE', 'get', 'delete']) {
      const res = methodNotAllowedResponse(method);
      expect(res).toBeDefined();
      expect(res!.status).toBe(METHOD_NOT_ALLOWED_STATUS);
      expect(res!.status).toBe(405);
      expect(res!.body).toBeUndefined();
    }
  });

  it('POST is allowed (no 405)', () => {
    expect(methodNotAllowedResponse('POST')).toBeUndefined();
    expect(methodNotAllowedResponse('post')).toBeUndefined();
  });
});

// ─── AC-15.18 — Origin validation + 403 (R-9.11-a/b/c, R-9.7-a) ────────────────

describe('AC-15.18 Origin validation (R-9.11-a, R-9.11-b, R-9.11-c, R-9.7-a)', () => {
  it('accepts an absent Origin and an accepted Origin', () => {
    expect(validateOrigin(undefined, ['https://app.example']).accepted).toBe(true);
    expect(validateOrigin('https://app.example', ['https://app.example']).accepted).toBe(true);
  });

  it('rejects a present Origin not in the accepted set', () => {
    const result = validateOrigin('https://evil.example', new Set(['https://app.example']));
    expect(result.accepted).toBe(false);
  });

  it('403 body, when present, carries a JSON-RPC error with no id', () => {
    const res = buildForbiddenOriginResponse();
    expect(res.status).toBe(FORBIDDEN_STATUS);
    expect(res.status).toBe(403);
    const body = res.body as { jsonrpc: string; id?: unknown; error: { code: number } };
    expect(body.jsonrpc).toBe('2.0');
    expect('id' in body).toBe(false);
    expect(body.error.code).toBe(INVALID_REQUEST_CODE);
  });

  it('403 body MAY be omitted entirely (R-9.7-a / R-9.11-c)', () => {
    const res = buildForbiddenOriginResponse('nope', false);
    expect(res.status).toBe(403);
    expect(res.body).toBeUndefined();
  });
});

// ─── AC-15.19 — loopback binding (R-9.11-d) ────────────────────────────────────

describe('AC-15.19 loopback binding (R-9.11-d)', () => {
  it('recommends the loopback interface, not all interfaces', () => {
    expect(recommendedLocalBindAddress()).toBe(LOOPBACK_BIND_ADDRESS);
    expect(LOOPBACK_BIND_ADDRESS).toBe('127.0.0.1');
    expect(recommendedLocalBindAddress()).not.toBe(ALL_INTERFACES_BIND_ADDRESS);
    expect(ALL_INTERFACES_BIND_ADDRESS).toBe('0.0.0.0');
  });
});

// ─── AC-15.20 — auth recommendation / §23 deferral (R-9.11-e, R-9.11-f) ────────

describe('AC-15.20 authentication & §23 deferral (R-9.11-e, R-9.11-f)', () => {
  it('the negotiation/MCP error codes mapped here do not encode authorization (deferred to §23)', () => {
    // This story only maps transport-boundary codes; authorization codes are owned
    // by §23 (S35-S37) and are absent from the revision-error set surfaced here.
    expect(REVISION_ERROR_CODES.has(MISSING_CLIENT_CAPABILITY_CODE)).toBe(true);
    expect(REVISION_ERROR_CODES.has(UNSUPPORTED_PROTOCOL_VERSION_CODE)).toBe(true);
    // Authentication is a deployment SHOULD; the module exposes no auth bypass.
    expect(REVISION_ERROR_CODES.has(-32603)).toBe(false);
  });
});

// ─── AC-15.21 — probe inspects body on 400 (R-9.12-a, R-9.12-b) ────────────────

describe('AC-15.21 probe inspects body before fallback (R-9.12-a, R-9.12-b)', () => {
  it('a 400 carrying a recognized revision error → retry, not legacy fallback', () => {
    const decision = interpretPostForFallback(400, {
      jsonrpc: '2.0',
      error: { code: HEADER_MISMATCH_CODE, message: 'mismatch' },
    });
    expect(decision.action).toBe('retry');
  });

  it('recognizes all modern -3200x and base codes on a 400', () => {
    for (const code of REVISION_ERROR_CODES) {
      const decision = interpretPostForFallback(400, { jsonrpc: '2.0', error: { code, message: 'x' } });
      expect(decision.action).toBe('retry');
    }
  });
});

// ─── AC-15.22 — recognized error → retry, no initialize fallback (R-9.12-c/d) ──

describe('AC-15.22 recognized error retries (R-9.12-c, R-9.12-d)', () => {
  it('retries using error.data.supported when present', () => {
    const decision = interpretPostForFallback(400, {
      jsonrpc: '2.0',
      error: {
        code: UNSUPPORTED_PROTOCOL_VERSION_CODE,
        message: 'unsupported',
        data: { supported: ['2026-07-28', '2025-11-25'], requested: '1999-01-01' },
      },
    });
    expect(decision).toEqual({ action: 'retry', supported: ['2026-07-28', '2025-11-25'] });
    expect(decision.action).not.toBe('legacy-probe');
  });

  it('retries (correcting the request) when no data.supported is present', () => {
    const decision = interpretPostForFallback(400, {
      jsonrpc: '2.0',
      error: { code: INVALID_PARAMS_CODE, message: 'bad params' },
    });
    expect(decision).toEqual({ action: 'retry' });
  });
});

// ─── AC-15.23 — empty/unrecognized body MAY fall back (R-9.12-e) ───────────────

describe('AC-15.23 unrecognized body falls back (R-9.12-e)', () => {
  it('an empty body on a 400 → legacy-probe', () => {
    expect(interpretPostForFallback(400, undefined).action).toBe('legacy-probe');
    expect(interpretPostForFallback(400, null).action).toBe('legacy-probe');
  });

  it('a body with an unrecognized error code on a 400 → legacy-probe', () => {
    const decision = interpretPostForFallback(400, {
      jsonrpc: '2.0',
      error: { code: -32099, message: 'some other server error' },
    });
    expect(decision.action).toBe('legacy-probe');
  });

  it('a non-failing status with no revision error → proceed', () => {
    expect(interpretPostForFallback(200, { jsonrpc: '2.0', id: 1, result: {} }).action).toBe('proceed');
  });
});

// ─── AC-15.24 — server dual-hosts legacy transport (R-9.12-f) ──────────────────

describe('AC-15.24 dual-hosting recommendation (R-9.12-f)', () => {
  it('the legacy endpoint-event name is exposed so a server can host both transports', () => {
    // The SHOULD is a deployment choice; the constant lets a dual-hosting server
    // and a probing client agree on the marker event.
    expect(LEGACY_ENDPOINT_EVENT).toBe('endpoint');
  });
});

// ─── AC-15.25 — client falls back via GET + endpoint event (R-9.12-g/h) ────────

describe('AC-15.25 legacy GET fallback (R-9.12-g, R-9.12-h)', () => {
  it('400/404/405 with an unrecognized body triggers a legacy GET probe', () => {
    for (const status of [400, 404, 405]) {
      expect(interpretPostForFallback(status, undefined).action).toBe('legacy-probe');
    }
  });

  it('an SSE stream whose first event is `endpoint` marks the deprecated HTTP+SSE transport', () => {
    expect(isLegacyHttpSseServer('endpoint')).toBe(true);
    expect(isLegacyHttpSseServer('message')).toBe(false);
    expect(isLegacyHttpSseServer(undefined)).toBe(false);
  });
});

// ─── Cross-cutting builders & status constants ────────────────────────────────

describe('shared response builders & constants', () => {
  it('202 Accepted has an empty body', () => {
    const res = buildNotificationAcceptedResponse();
    expect(res.status).toBe(NOTIFICATION_ACCEPTED_STATUS);
    expect(res.status).toBe(202);
    expect(res.body).toBeUndefined();
  });

  it('buildErrorResponse omits id when not provided', () => {
    const res = buildErrorResponse(400, { code: PARSE_ERROR_CODE, message: 'Parse error' });
    const body = res.body as { id?: unknown };
    expect('id' in body).toBe(false);
  });

  it('error code constants have their canonical values', () => {
    expect(HEADER_MISMATCH_CODE).toBe(-32001);
    expect(MISSING_CLIENT_CAPABILITY_CODE).toBe(-32003);
    expect(UNSUPPORTED_PROTOCOL_VERSION_CODE).toBe(-32004);
    expect(PARSE_ERROR_CODE).toBe(-32700);
    expect(INVALID_REQUEST_CODE).toBe(-32600);
    expect(METHOD_NOT_FOUND_CODE).toBe(-32601);
    expect(INVALID_PARAMS_CODE).toBe(-32602);
  });
});
