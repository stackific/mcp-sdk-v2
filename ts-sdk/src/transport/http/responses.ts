/**
 * S15 — Streamable HTTP: Responses, Status Mapping & `HeaderMismatch` (§9.6–§9.12).
 *
 * The response half of the Streamable HTTP transport, completing S14 (the
 * request half). For a well-formed POST whose body is a JSON-RPC *request*, the
 * server picks exactly one of two response shapes — a single JSON object
 * (§9.6.1) or a request-scoped Server-Sent Events stream (§9.6.2) — both
 * delivered over HTTP `200 OK`. This module also owns:
 *
 *   - the full `-32001` `HeaderMismatch` error *object* and its HTTP `400`
 *     mapping, built on the `HEADER_MISMATCH_CODE` constant from S14 (§9.8);
 *   - the JSON-RPC-error-code → HTTP-status mapping table (§9.7), spanning the
 *     base codes (`-32700`/`-32600`/`-32601`/`-32602`/`-32603`) and the MCP
 *     server-range codes (`-32001`/`-32003`/`-32004`);
 *   - statelessness helpers at the HTTP layer — no handshake, no session id,
 *     `405` for `GET`/`DELETE`, ignored `Last-Event-ID` (§9.9);
 *   - `Origin`-validation and loopback-binding security helpers (§9.11);
 *   - the backward-compatibility probe that distinguishes a modern server from a
 *     legacy HTTP+SSE server by inspecting status codes and error bodies (§9.12).
 *
 * Reuses (never redefines) the S14 constants `HEADER_MISMATCH_CODE`,
 * `BAD_REQUEST_STATUS`, `NOTIFICATION_ACCEPTED_STATUS`, the S04 `PARSE_ERROR_CODE`
 * / `INVALID_PARAMS_CODE`, and the S09 negotiation codes; this story emits the
 * `HeaderMismatch` *object* on top of those primitives.
 */

import type { RequestId } from '../../jsonrpc/framing.js';
import type { McpError } from '../../jsonrpc/payload.js';
import {
  HEADER_MISMATCH_CODE,
  BAD_REQUEST_STATUS,
  NOTIFICATION_ACCEPTED_STATUS,
} from './headers.js';
import { PARSE_ERROR_CODE } from '../correlation.js';
import { INVALID_PARAMS_CODE } from '../../protocol/meta.js';
import {
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
} from '../../protocol/negotiation.js';

export { HEADER_MISMATCH_CODE, BAD_REQUEST_STATUS, NOTIFICATION_ACCEPTED_STATUS } from './headers.js';

// ─── HTTP status constants (§9.7) ──────────────────────────────────────────────

/** HTTP status for a successfully handled request — both response shapes. (R-9.6-a) */
export const OK_STATUS = 200 as const;
/** HTTP status when an `Origin` header is present and not accepted. (R-9.11-b) */
export const FORBIDDEN_STATUS = 403 as const;
/** HTTP status for a request whose method the server does not implement. (R-9.7-b) */
export const NOT_FOUND_STATUS = 404 as const;
/** HTTP status for a `GET`/`DELETE` at a this-transport-only endpoint. (R-9.9-f) */
export const METHOD_NOT_ALLOWED_STATUS = 405 as const;

// ─── JSON-RPC error codes mapped here (§9.7) ───────────────────────────────────
//
// `PARSE_ERROR_CODE` (-32700), `INVALID_PARAMS_CODE` (-32602),
// `HEADER_MISMATCH_CODE` (-32001), `UNSUPPORTED_PROTOCOL_VERSION_CODE` (-32004)
// and `MISSING_CLIENT_CAPABILITY_CODE` (-32003) are reused from their owning
// modules; the remaining base codes are defined here for the status table.

/** JSON-RPC `Invalid request` — body is not a valid request object. (§9.7, §22) */
export const INVALID_REQUEST_CODE = -32600 as const;
/** JSON-RPC `Method not found` — requested RPC method not implemented. (§9.7, R-9.7-b) */
export const METHOD_NOT_FOUND_CODE = -32601 as const;
/** JSON-RPC `Internal error` — server-side failure handling a valid request. (§22) */
export const INTERNAL_ERROR_CODE = -32603 as const;

export { PARSE_ERROR_CODE } from '../correlation.js';
export { INVALID_PARAMS_CODE } from '../../protocol/meta.js';
export {
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
} from '../../protocol/negotiation.js';

// ─── Response content types & stream headers (§9.6) ────────────────────────────

/** `Content-Type` of the single-JSON response shape. (R-9.6.1-a) */
export const SINGLE_JSON_CONTENT_TYPE = 'application/json' as const;
/** `Content-Type` of the event-stream response shape. (R-9.6.2-a) */
export const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream' as const;
/** Response header name asking reverse proxies not to buffer SSE events. (R-9.6.2-g) */
export const X_ACCEL_BUFFERING_HEADER = 'X-Accel-Buffering' as const;
/** Value paired with {@link X_ACCEL_BUFFERING_HEADER} to disable buffering. (R-9.6.2-g) */
export const X_ACCEL_BUFFERING_VALUE = 'no' as const;
/** The (ignored) resumption header; streams are never resumable. (R-9.6.2-h, R-9.9-g) */
export const LAST_EVENT_ID_HEADER = 'Last-Event-ID' as const;
/** The `Origin` request header the server MUST validate. (R-9.11-a) */
export const ORIGIN_HEADER = 'Origin' as const;

// ─── Response-shape selection (§9.6) ───────────────────────────────────────────

/**
 * The two ways a server MAY answer a JSON-RPC *request* body. Exactly one is
 * chosen per request; both succeed with HTTP `200 OK`. (R-9.6-a)
 */
export const ResponseShape = {
  /** One HTTP `200 OK` + `application/json` carrying a single JSON-RPC response. (§9.6.1) */
  SINGLE_JSON: 'single-json',
  /** HTTP `200 OK` + `text/event-stream`, a request-scoped SSE stream. (§9.6.2) */
  EVENT_STREAM: 'event-stream',
} as const;

/** One of the two {@link ResponseShape} values. */
export type ResponseShape = (typeof ResponseShape)[keyof typeof ResponseShape];

/**
 * Picks the response shape for a JSON-RPC request body. (R-9.6-a, R-9.6.1-a,
 * R-9.6.2-a)
 *
 * A server uses the single-JSON shape when it can produce the response without
 * emitting any request-scoped notifications, and the event-stream shape when it
 * intends to emit request-scoped notifications (progress, logging) before the
 * final response. The choice is per request and is a server decision — this
 * helper encodes the spec's "emits request-scoped notifications" criterion.
 *
 * @param emitsRequestScopedNotifications - Whether the server will stream any
 *   request-scoped notification before the final response.
 */
export function chooseResponseShape(emitsRequestScopedNotifications: boolean): ResponseShape {
  return emitsRequestScopedNotifications ? ResponseShape.EVENT_STREAM : ResponseShape.SINGLE_JSON;
}

// ─── Single JSON response (§9.6.1) ─────────────────────────────────────────────

/** A fully-formed HTTP response: status, headers, and an optional JSON body. */
export interface HttpResponse {
  /** The HTTP status code. */
  status: number;
  /** Response headers (field names as written; compared case-insensitively elsewhere). */
  headers: Record<string, string>;
  /** The JSON body, when present; absent for empty-body responses (e.g. `202`, `405`). */
  body?: unknown;
}

/**
 * Builds the single-JSON response: HTTP `200 OK`, `Content-Type: application/json`,
 * and a body of exactly one JSON-RPC response whose `id` equals the request `id`.
 * (R-9.6.1-a)
 *
 * @param response - One JSON-RPC response object (a result or error response);
 *   its `id` MUST already equal the originating request's `id`.
 */
export function buildSingleJsonResponse(response: { jsonrpc: '2.0'; id: RequestId } & Record<string, unknown>): HttpResponse {
  return {
    status: OK_STATUS,
    headers: { 'Content-Type': SINGLE_JSON_CONTENT_TYPE },
    body: response,
  };
}

// ─── Event-stream response (§9.6.2) ────────────────────────────────────────────

/** The response headers that open an event-stream (SSE) response. */
export interface EventStreamHeaders {
  'Content-Type': typeof EVENT_STREAM_CONTENT_TYPE;
  /** Present by default (SHOULD); set `includeAccelBuffering: false` to omit. (R-9.6.2-g) */
  [X_ACCEL_BUFFERING_HEADER]?: typeof X_ACCEL_BUFFERING_VALUE;
}

/**
 * Builds the response headers that open an event-stream response: HTTP `200 OK`
 * with `Content-Type: text/event-stream`, and — by default — the
 * `X-Accel-Buffering: no` hint so reverse proxies deliver events immediately.
 * (R-9.6.2-a, R-9.6.2-g)
 *
 * @param includeAccelBuffering - Whether to include `X-Accel-Buffering: no`
 *   (default `true`; the spec SHOULD).
 */
export function buildEventStreamHeaders(includeAccelBuffering = true): EventStreamHeaders {
  const headers: EventStreamHeaders = { 'Content-Type': EVENT_STREAM_CONTENT_TYPE };
  if (includeAccelBuffering) {
    headers[X_ACCEL_BUFFERING_HEADER] = X_ACCEL_BUFFERING_VALUE;
  }
  return headers;
}

/** HTTP status that opens an event-stream response. (R-9.6.2-a) */
export const EVENT_STREAM_STATUS = OK_STATUS;

/**
 * Serializes one JSON-RPC message as a single SSE event: a `data:` field
 * carrying the message as JSON, terminated by a blank line. (R-9.6.2-a)
 *
 * The result ends with `\n\n`; the trailing blank line is the event terminator
 * required by the `text/event-stream` framing.
 *
 * @param message - One JSON-RPC notification or response object.
 */
export function formatSseEvent(message: unknown): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}

/**
 * Validates that a message a server intends to write on the event stream is
 * allowed there. (R-9.6.2-c, R-9.6.2-d)
 *
 * Permitted: request-scoped *notifications* (a `notifications/*` whose `params`
 * relate to the originating request) and the final *response* (an object with
 * `id` plus `result` or `error`). Forbidden: an independent JSON-RPC *request*
 * (an object carrying both `method` and `id`), which the server MUST NOT send on
 * this stream.
 *
 * @param message - The candidate message object.
 * @returns `{ ok: true }` when allowed, otherwise `{ ok: false, reason }`.
 */
export function validateStreamMessage(
  message: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (typeof message !== 'object' || message === null) {
    return { ok: false, reason: 'stream message must be a JSON-RPC object' };
  }
  const obj = message as Record<string, unknown>;
  const hasMethod = typeof obj['method'] === 'string';
  const hasId = obj['id'] !== undefined;
  // An independent request carries both `method` and `id`; that is forbidden. (R-9.6.2-d)
  if (hasMethod && hasId) {
    return { ok: false, reason: 'a JSON-RPC request MUST NOT be sent on the response stream' };
  }
  return { ok: true };
}

// ─── Request-scoped event stream (server) ──────────────────────────────────────

/**
 * A request-scoped event stream that enforces the §9.6.2 lifecycle: only
 * request-scoped notifications before the final response, the final response
 * terminates the stream, and no message is sent after termination — whether the
 * terminator is the final response or a client-initiated close (cancellation).
 * (R-9.6.2-c, R-9.6.2-d, R-9.6.2-e, R-9.6.2-f, R-9.6.2-i, R-9.6.2-k)
 *
 * It is a thin, transport-agnostic state machine: `sink` receives each formatted
 * SSE event string; how that string reaches the wire is the caller's concern.
 */
export class RequestEventStream {
  /** Whether the stream has been terminated (by final response or cancellation). */
  #closed = false;
  /** True only when the terminator was the final response (not a client close). */
  #completed = false;
  readonly #sink: (event: string) => void;

  /**
   * @param sink - Receives each formatted SSE event string to deliver on the wire.
   */
  constructor(sink: (event: string) => void) {
    this.#sink = sink;
  }

  /** Whether the stream is closed (terminated). */
  get closed(): boolean {
    return this.#closed;
  }

  /** Whether the stream closed by delivering its final response. */
  get completed(): boolean {
    return this.#completed;
  }

  /**
   * Emits a request-scoped notification before the final response. (R-9.6.2-b,
   * R-9.6.2-c) Throws if the message is not stream-legal (e.g. a request) or if
   * the stream is already closed (R-9.6.2-f/k forbid further messages).
   */
  sendNotification(notification: { jsonrpc: '2.0'; method: string } & Record<string, unknown>): void {
    this.#assertOpen();
    const check = validateStreamMessage(notification);
    if (!check.ok) {
      throw new Error(check.reason);
    }
    if (notification['id'] !== undefined) {
      throw new Error('a notification MUST NOT carry an id');
    }
    this.#sink(formatSseEvent(notification));
  }

  /**
   * Sends the final JSON-RPC response and terminates the stream. (R-9.6.2-e)
   * After this, the server MUST NOT send further messages for the request
   * (R-9.6.2-f); subsequent `sendNotification`/`sendFinalResponse` calls throw.
   */
  sendFinalResponse(response: { jsonrpc: '2.0'; id: RequestId } & Record<string, unknown>): void {
    this.#assertOpen();
    this.#sink(formatSseEvent(response));
    this.#closed = true;
    this.#completed = true;
  }

  /**
   * Records that the client closed the stream before the final response. The
   * server MUST treat this as cancellation of the request and MUST NOT send any
   * further messages for it. (R-9.6.2-i, R-9.6.2-k) Idempotent.
   */
  cancelByClientClose(): void {
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error('the response stream is closed; no further messages may be sent for this request');
    }
  }
}

// ─── The `-32001` `HeaderMismatch` error object (§9.8) ─────────────────────────

/**
 * The canonical `JSONRPCErrorResponse` body delivered with an HTTP `400`
 * (and optionally a `403`) at the transport boundary. (§9.7)
 *
 * `id` is omitted when no request id can be determined — an unparseable body or
 * an `Origin`-rejected request. (§9.7, R-9.11-c)
 */
export interface JsonRpcErrorResponseBody {
  jsonrpc: '2.0';
  /** The originating request id; omitted when it cannot be determined. */
  id?: RequestId;
  /** The canonical error object (§3.8): `code`, `message`, optional `data`. */
  error: McpError;
}

/**
 * Builds the full `-32001` `HeaderMismatch` JSON-RPC error *object* (not just the
 * code). (R-9.8-a) The code sits in the implementation-defined server-error
 * range `-32000`…`-32099`; this is the object S14 deferred to S15.
 *
 * @param message - A human-readable mismatch description (e.g. naming the
 *   offending header and the body value it disagrees with).
 * @param data    - OPTIONAL structured detail for the error.
 */
export function buildHeaderMismatchError(
  message = 'Header mismatch: HTTP headers do not match the request body',
  data?: unknown,
): McpError {
  return data === undefined
    ? { code: HEADER_MISMATCH_CODE, message }
    : { code: HEADER_MISMATCH_CODE, message, data };
}

/**
 * Wraps an error object into a `400 Bad Request` HTTP response carrying a
 * `JSONRPCErrorResponse` body. (R-9.8-a, §9.7)
 *
 * @param error - The JSON-RPC error object (e.g. from {@link buildHeaderMismatchError}).
 * @param id    - The originating request id, when known; omitted otherwise.
 */
export function buildHeaderMismatchResponse(error: McpError, id?: RequestId): HttpResponse {
  return buildErrorResponse(BAD_REQUEST_STATUS, error, id);
}

/** Describes the four conditions that MUST produce `-32001`. (R-9.8-b/c/d) */
export type HeaderMismatchCause =
  /** A REQUIRED standard header is missing. (R-9.8-b) */
  | { kind: 'missing-required-header'; header: string }
  /** A header value disagrees with the corresponding body value. (R-9.8-c) */
  | { kind: 'value-mismatch'; header: string; headerValue: string; bodyValue: string }
  /** An `Mcp-Param-*` header value contains invalid characters. (R-9.8-d) */
  | { kind: 'invalid-param-characters'; header: string };

/**
 * Builds a `-32001` `HeaderMismatch` error object from a structured cause,
 * producing a descriptive message for each of the conditions §9.8 enumerates.
 * (R-9.8-b, R-9.8-c, R-9.8-d)
 */
export function headerMismatchForCause(cause: HeaderMismatchCause): McpError {
  switch (cause.kind) {
    case 'missing-required-header':
      return buildHeaderMismatchError(`Header mismatch: required header ${cause.header} is missing`);
    case 'value-mismatch':
      return buildHeaderMismatchError(
        `Header mismatch: ${cause.header} header value '${cause.headerValue}' does not match body value '${cause.bodyValue}'`,
      );
    case 'invalid-param-characters':
      return buildHeaderMismatchError(`Header mismatch: ${cause.header} header value contains invalid characters`);
  }
}

// ─── Generic error & success response builders (§9.7) ──────────────────────────

/**
 * Wraps any JSON-RPC error object into an HTTP response carrying a
 * `JSONRPCErrorResponse` body. (§9.7) Used for `400`/`404`/`403` bodies.
 *
 * @param status - The HTTP status (e.g. `400`, `404`, `403`).
 * @param error  - The JSON-RPC error object.
 * @param id     - The originating request id; omitted when it cannot be determined.
 */
export function buildErrorResponse(status: number, error: McpError, id?: RequestId): HttpResponse {
  const body: JsonRpcErrorResponseBody =
    id === undefined ? { jsonrpc: '2.0', error } : { jsonrpc: '2.0', id, error };
  return { status, headers: { 'Content-Type': SINGLE_JSON_CONTENT_TYPE }, body };
}

/**
 * Builds the `404 Not Found` for an unimplemented method: it ALWAYS carries a
 * JSON-RPC error body with code `-32601`, which distinguishes an MCP endpoint
 * from a host `404` that does not serve the endpoint at all. (R-9.7-b)
 *
 * @param method - The method name that was not found (for the message).
 * @param id     - The originating request id, when known.
 */
export function buildMethodNotFoundResponse(method: string, id?: RequestId): HttpResponse {
  return buildErrorResponse(
    NOT_FOUND_STATUS,
    { code: METHOD_NOT_FOUND_CODE, message: `Method not found: ${method}` },
    id,
  );
}

/** Builds the `202 Accepted` (empty body) acknowledgement of a notification POST. (§9.7) */
export function buildNotificationAcceptedResponse(): HttpResponse {
  return { status: NOTIFICATION_ACCEPTED_STATUS, headers: {} };
}

// ─── JSON-RPC-error-code → HTTP-status mapping (§9.7) ──────────────────────────

/**
 * Maps a JSON-RPC error `code` to the HTTP status it rides on. (§9.7)
 *
 *   - `-32601` (`Method not found`)             → `404 Not Found` (R-9.7-b)
 *   - `-32700`/`-32600`/`-32602`                → `400 Bad Request`
 *   - `-32001`/`-32003`/`-32004` (MCP codes)    → `400 Bad Request`
 *   - any other code (e.g. `-32603` internal)   → `400 Bad Request` as the
 *     transport-boundary default for a JSON-RPC error body.
 *
 * `200`/`202`/`403`/`405` are not error-body conditions and are produced by
 * their dedicated builders, not by this code-driven map.
 */
export function httpStatusForErrorCode(code: number): typeof NOT_FOUND_STATUS | typeof BAD_REQUEST_STATUS {
  return code === METHOD_NOT_FOUND_CODE ? NOT_FOUND_STATUS : BAD_REQUEST_STATUS;
}

/**
 * The set of JSON-RPC error codes a *modern* server of this revision returns
 * with HTTP `400` at the transport boundary — the codes a dual-revision client
 * MUST recognize before deciding to fall back. (§9.12) These are the
 * `HeaderMismatch` (`-32001`), `MissingRequiredClientCapability` (`-32003`),
 * `UnsupportedProtocolVersion` (`-32004`), and the base validation codes.
 */
export const REVISION_ERROR_CODES: ReadonlySet<number> = new Set<number>([
  HEADER_MISMATCH_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  PARSE_ERROR_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  INVALID_PARAMS_CODE,
]);

// ─── Statelessness at the HTTP layer (§9.9) ────────────────────────────────────

/** Header names commonly used by *other* bindings to carry a session identifier. */
const SESSION_ID_HEADER_NAMES = ['mcp-session-id', 'x-session-id', 'session-id'] as const;

/**
 * Returns `true` when `name` is a session-identifier header this transport MUST
 * NOT use; the server MUST ignore any such header a client sends. (R-9.9-b,
 * R-9.9-c, R-9.9-d) Comparison is case-insensitive.
 */
export function isSessionIdHeader(name: string): boolean {
  const lowered = name.toLowerCase();
  return (SESSION_ID_HEADER_NAMES as readonly string[]).includes(lowered);
}

/**
 * Strips any session-identifier and `Last-Event-ID` headers from a request,
 * realizing the rule that the server MUST ignore them — no session affinity, no
 * resumption. (R-9.9-d, R-9.9-g, R-9.6.2-h) The input is not mutated.
 *
 * @param headers - The incoming request headers.
 * @returns A copy with the ignored headers removed.
 */
export function stripIgnoredStatelessHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSessionIdHeader(key) || key.toLowerCase() === LAST_EVENT_ID_HEADER.toLowerCase()) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** The HTTP methods this transport handles at the MCP endpoint. (§9.2, §9.9) */
export const ALLOWED_ENDPOINT_METHODS = new Set(['POST'] as const);

/**
 * For a this-transport-only server, returns a `405 Method Not Allowed` response
 * (empty body) for an HTTP `GET` or `DELETE` at the MCP endpoint, or `undefined`
 * for `POST`. (R-9.9-f)
 *
 * @param httpMethod - The incoming HTTP method (any case).
 */
export function methodNotAllowedResponse(httpMethod: string): HttpResponse | undefined {
  if (ALLOWED_ENDPOINT_METHODS.has(httpMethod.toUpperCase() as never)) {
    return undefined;
  }
  return { status: METHOD_NOT_ALLOWED_STATUS, headers: {} };
}

// ─── Security & endpoint binding (§9.11) ───────────────────────────────────────

/** The loopback interface a locally-run server SHOULD bind to. (R-9.11-d) */
export const LOOPBACK_BIND_ADDRESS = '127.0.0.1' as const;
/** The all-interfaces address a local server SHOULD avoid binding to. (R-9.11-d) */
export const ALL_INTERFACES_BIND_ADDRESS = '0.0.0.0' as const;

/**
 * Returns the address a locally-run server SHOULD bind its MCP endpoint to:
 * the loopback interface, never all interfaces. (R-9.11-d)
 */
export function recommendedLocalBindAddress(): typeof LOOPBACK_BIND_ADDRESS {
  return LOOPBACK_BIND_ADDRESS;
}

/**
 * Validates the `Origin` header against the server's accepted-origin set,
 * defending against DNS-rebinding. (R-9.11-a, R-9.11-b)
 *
 * When the `Origin` header is *present and not accepted*, the request MUST be
 * rejected (`accepted: false`). When `Origin` is absent or in the accepted set,
 * it passes. Matching is exact against the configured origins.
 *
 * @param origin           - The request's `Origin` header value, or `undefined`.
 * @param acceptedOrigins  - The origins the server is configured to accept.
 */
export function validateOrigin(
  origin: string | undefined,
  acceptedOrigins: Iterable<string>,
): { accepted: true } | { accepted: false; origin: string } {
  if (origin === undefined) {
    return { accepted: true };
  }
  const allow = acceptedOrigins instanceof Set ? acceptedOrigins : new Set(acceptedOrigins);
  if (allow.has(origin)) {
    return { accepted: true };
  }
  return { accepted: false, origin };
}

/**
 * Builds the `403 Forbidden` response for a rejected `Origin`. The body MAY
 * carry a JSON-RPC error response *with no `id`*; pass `includeBody: false` to
 * omit it entirely. (R-9.7-a, R-9.11-b, R-9.11-c)
 *
 * @param message      - The error message when a body is included.
 * @param includeBody  - Whether to include the id-less JSON-RPC error body
 *   (default `true`).
 */
export function buildForbiddenOriginResponse(
  message = 'Origin not permitted',
  includeBody = true,
): HttpResponse {
  if (!includeBody) {
    return { status: FORBIDDEN_STATUS, headers: {} };
  }
  // The body, when present, MUST carry no `id`. (R-9.11-c)
  const body: JsonRpcErrorResponseBody = {
    jsonrpc: '2.0',
    error: { code: INVALID_REQUEST_CODE, message },
  };
  return { status: FORBIDDEN_STATUS, headers: { 'Content-Type': SINGLE_JSON_CONTENT_TYPE }, body };
}

// ─── Backward compatibility (§9.12) ────────────────────────────────────────────

/** Whether a body is a recognized JSON-RPC error object of this revision. */
function isRecognizedRevisionError(
  body: unknown,
): body is { jsonrpc?: string; error: McpError } {
  if (typeof body !== 'object' || body === null) return false;
  const error = (body as Record<string, unknown>)['error'];
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as Record<string, unknown>)['code'];
  return typeof code === 'number' && REVISION_ERROR_CODES.has(code);
}

/**
 * The decision a dual-revision client makes after a modern POST. (§9.12)
 *
 *   - `retry`    — the body is a recognized error of this revision; the client
 *     MUST retry (using `error.data.supported` if present) and MUST NOT fall
 *     back to `initialize`. (R-9.12-c, R-9.12-d)
 *   - `proceed`  — a non-`400` success/continuation; nothing to fall back from.
 *   - `legacy-probe` — the status is `400`/`404`/`405` and the body is not a
 *     recognized revision error; the client SHOULD issue a `GET` to detect the
 *     deprecated HTTP+SSE transport. (R-9.12-b, R-9.12-e, R-9.12-g)
 */
export type PostFallbackDecision =
  | { action: 'retry'; supported?: string[] }
  | { action: 'proceed' }
  | { action: 'legacy-probe' };

/**
 * Interprets the outcome of a modern POST for a client that also supports an
 * earlier `initialize`-handshake revision. (R-9.12-a, R-9.12-b, R-9.12-c,
 * R-9.12-d, R-9.12-e, R-9.12-g)
 *
 * On a `400`, the client SHOULD inspect the body before falling back, because a
 * modern server returns `400` for `-32004`/`-32003`/`-32001`. A recognized
 * revision error means retry, never fall back. An empty/unrecognized body on a
 * `400`/`404`/`405` means the client SHOULD probe for the legacy transport.
 *
 * @param status - The HTTP status the POST returned.
 * @param body   - The parsed response body (or `undefined`/`null` if empty).
 */
export function interpretPostForFallback(status: number, body: unknown): PostFallbackDecision {
  if (isRecognizedRevisionError(body)) {
    const data = (body as { error: McpError }).error.data;
    const supported =
      typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>)['supported'])
        ? ((data as Record<string, unknown>)['supported'] as string[])
        : undefined;
    return supported === undefined ? { action: 'retry' } : { action: 'retry', supported };
  }
  if (
    status === BAD_REQUEST_STATUS ||
    status === NOT_FOUND_STATUS ||
    status === METHOD_NOT_ALLOWED_STATUS
  ) {
    // Empty or unrecognized body on a failing status → probe for legacy transport. (R-9.12-e, R-9.12-g)
    return { action: 'legacy-probe' };
  }
  return { action: 'proceed' };
}

/** The SSE event name that, as the first event of a `GET` stream, marks the legacy transport. (R-9.12-h) */
export const LEGACY_ENDPOINT_EVENT = 'endpoint' as const;

/**
 * Interprets the first event of the SSE stream a fallback `GET` opens. (R-9.12-h)
 *
 * Returns `true` when the first event is an `endpoint` event, in which case the
 * client SHOULD treat the server as running the deprecated HTTP+SSE transport
 * and use that transport for subsequent communication.
 *
 * @param firstEventName - The `event:` field of the first SSE event, if any.
 */
export function isLegacyHttpSseServer(firstEventName: string | undefined): boolean {
  return firstEventName === LEGACY_ENDPOINT_EVENT;
}
