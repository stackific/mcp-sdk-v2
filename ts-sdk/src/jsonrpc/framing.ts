/**
 * JSON-RPC 2.0 message framing for MCP (§3.1–§3.5).
 *
 * Defines the three structural message kinds (request, notification, response),
 * the `RequestId` type, the classification algorithm, in-flight id tracking,
 * and the malformed-message rejection rules.
 *
 * Out of scope here: the `Result` base shape (§3.6, S04), the `Error` object
 * shape and standard error-code constants (§3.8–§3.10, S04), and transport
 * framing (§8, S12+).
 */

import { z } from 'zod';

// ─── RequestId ──────────────────────────────────────────────────────────────

/**
 * `RequestId` correlates a response with the request that originated it.
 *
 * MUST be a JSON string or JSON number. MUST NOT be `null`. (R-3.2-a, R-3.2-b)
 * This is stricter than base JSON-RPC 2.0 which permits `null`.
 */
export const RequestIdSchema = z.union([
  z.string(),
  // §2.5: a numeric id MUST be an IEEE-754 safe integer (no fractional or
  // out-of-safe-range values), so it round-trips without precision loss.
  z.number().refine(Number.isSafeInteger, { message: 'numeric id MUST be an IEEE-754 safe integer (§2.5)' }),
]);
export type RequestId = z.infer<typeof RequestIdSchema>;

// ─── JSONRPCRequest ─────────────────────────────────────────────────────────

/**
 * A request carries `jsonrpc`, `id`, and `method`; it expects exactly one
 * matching response. (§3.3, R-3.3-a – R-3.3-i)
 *
 * `params` is OPTIONAL and, when present, MUST be a JSON object (not an array).
 * `.passthrough()` lets future protocol extensions add fields without breaking
 * conformant receivers.
 */
export const JSONRPCRequestSchema = z.object({
  /** MUST be the literal string `"2.0"`. (R-3.3-a) */
  jsonrpc: z.literal('2.0'),
  /** REQUIRED. Correlates the response; MUST be a string or number. (R-3.3-b) */
  id: RequestIdSchema,
  /** REQUIRED. Case-sensitive method name; reproduced verbatim. (R-3.3-c, R-3.3-d) */
  method: z.string(),
  /**
   * OPTIONAL. Named arguments object. When present, MUST be a JSON object —
   * positional arrays are not permitted. (R-3.3-e, R-3.3-f, R-3.3-g)
   */
  params: z.record(z.unknown()).optional(),
}).passthrough();

export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;

// ─── JSONRPCNotification ─────────────────────────────────────────────────────

/**
 * A notification carries `jsonrpc` and `method` but NO `id`. It is one-way:
 * a receiver MUST NOT send any response to it, even if it is malformed or
 * the method is unrecognized. (§3.4, R-3.4-a – R-3.4-f)
 */
export const JSONRPCNotificationSchema = z
  .object({
    /** MUST be the literal string `"2.0"`. (R-3.4-b) */
    jsonrpc: z.literal('2.0'),
    /** REQUIRED. Case-sensitive notification name; reproduced verbatim. (R-3.4-c) */
    method: z.string(),
    /**
     * OPTIONAL. Named data object — same object-only constraint as request
     * `params`. (R-3.4-d)
     */
    params: z.record(z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if ('id' in (val as Record<string, unknown>)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A notification MUST NOT contain an `id` member (R-3.4-e)',
      });
    }
  });

export type JSONRPCNotification = z.infer<typeof JSONRPCNotificationSchema>;

// ─── JSONRPCResultResponse ───────────────────────────────────────────────────

/**
 * A success response carries `jsonrpc`, `id`, and `result`.
 * The `result` shape (the `Result` base type) is defined in S04. (§3.5.1)
 */
export const JSONRPCResultResponseSchema = z.object({
  /** MUST be the literal string `"2.0"`. (R-3.5.1-a) */
  jsonrpc: z.literal('2.0'),
  /**
   * REQUIRED. MUST equal the request's id — same JSON type and value.
   * No type coercion. (R-3.5.1-b, R-3.2-e, R-3.2-f, R-3.2-g)
   */
  id: RequestIdSchema,
  /** REQUIRED. The method's result payload (a `Result` object, §3.6 / S04). */
  result: z.record(z.unknown()),
}).passthrough();

export type JSONRPCResultResponse = z.infer<typeof JSONRPCResultResponseSchema>;

// ─── JSONRPCErrorResponse ────────────────────────────────────────────────────

/**
 * An error response carries `jsonrpc`, a required `error` object, and an
 * optional `id`. The `id` MUST be set to the originating request's identifier
 * when known; it MAY be omitted only when the identifier cannot be determined
 * (e.g. unparseable JSON). (§3.5.2, R-3.5.2-a – R-3.5.2-f)
 *
 * The `Error` object shape and standard error-code constants are defined in S04.
 */
export const JSONRPCErrorResponseSchema = z.object({
  /** MUST be the literal string `"2.0"`. (R-3.5.2-a) */
  jsonrpc: z.literal('2.0'),
  /**
   * OPTIONAL. Set when the originating id is known; omitted otherwise.
   * When present, echoes the request id without type coercion. (R-3.5.2-b – R-3.5.2-e)
   */
  id: RequestIdSchema.optional(),
  /** REQUIRED. The `Error` object (shape defined in §3.8 / S04). (R-3.5.2-f) */
  error: z.record(z.unknown()),
}).passthrough();

export type JSONRPCErrorResponse = z.infer<typeof JSONRPCErrorResponseSchema>;

// ─── Union types ─────────────────────────────────────────────────────────────

/** Union of the two response shapes. A response carries exactly one of `result` or `error`. */
export type JSONRPCResponse = JSONRPCResultResponse | JSONRPCErrorResponse;

/** Top-level wire type — every MCP message is exactly one of these three kinds. */
export type JSONRPCMessage =
  | JSONRPCRequest
  | JSONRPCNotification
  | JSONRPCResultResponse
  | JSONRPCErrorResponse;

// ─── Classification ──────────────────────────────────────────────────────────

/** The structural kind of a classified JSON-RPC message. */
export type MessageKind = 'request' | 'notification' | 'result-response' | 'error-response';

/** Returned by `classifyMessage` when the message is valid. */
export type ClassifiedMessage =
  | { kind: 'request'; message: JSONRPCRequest }
  | { kind: 'notification'; message: JSONRPCNotification }
  | { kind: 'result-response'; message: JSONRPCResultResponse }
  | { kind: 'error-response'; message: JSONRPCErrorResponse };

/**
 * Thrown when a received message is structurally malformed and must be rejected.
 *
 * Per R-3.4-f, malformed notifications are silently discarded — callers MUST
 * check the classification result before throwing this error toward the sender.
 */
export class MalformedMessageError extends Error {
  /** Stable machine-readable code for programmatic handling. */
  readonly code = 'MALFORMED_MESSAGE' as const;

  constructor(reason: string) {
    super(`Malformed JSON-RPC message: ${reason}`);
    this.name = 'MalformedMessageError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Parses `raw` with `schema`, converting any `ZodError` to `MalformedMessageError`
 * so callers always receive a single rejection type from `classifyMessage`.
 */
function parseMalformed<T>(schema: z.ZodType<T>, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const detail = e.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ');
      throw new MalformedMessageError(`schema validation failed — ${detail}`);
    }
    throw e;
  }
}

/**
 * Classifies a raw incoming value as a `JSONRPCMessage` or throws
 * `MalformedMessageError`.
 *
 * Classification algorithm (§3.1 informative):
 *  - `id` + `method`  → request
 *  - `method`, no `id` → notification
 *  - `id` + `result`  → success response
 *  - `error` (±`id`)  → error response
 *
 * Rejects (throws):
 *  - Top-level JSON arrays (batches) — R-3.1-b, R-3.1-c
 *  - Missing or incorrect `jsonrpc` — R-3.1-d, R-3.1-e
 *  - Contradictory member combinations — R-3.1-f
 *  - Unclassifiable member combinations
 *
 * @throws {MalformedMessageError}
 */
export function classifyMessage(raw: unknown): ClassifiedMessage {
  // Batches (top-level arrays) are forbidden. (R-3.1-b, R-3.1-c)
  if (Array.isArray(raw)) {
    throw new MalformedMessageError(
      'JSON-RPC batch arrays are not permitted (R-3.1-c); each message must be a single JSON object',
    );
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new MalformedMessageError('message must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  // `jsonrpc` MUST be the string "2.0". (R-3.1-d, R-3.1-e)
  if (!('jsonrpc' in obj) || obj['jsonrpc'] !== '2.0') {
    throw new MalformedMessageError(
      '`jsonrpc` member must be present and equal to the string "2.0" (R-3.1-d)',
    );
  }

  const hasId = 'id' in obj;
  const hasMethod = 'method' in obj;
  const hasResult = 'result' in obj;
  const hasError = 'error' in obj;

  // Contradictory member combinations are malformed. (R-3.1-f)
  if (hasMethod && (hasResult || hasError)) {
    throw new MalformedMessageError(
      '`method` cannot coexist with `result` or `error` (R-3.1-f)',
    );
  }
  if (hasResult && hasError) {
    throw new MalformedMessageError(
      'a response MUST carry exactly one of `result` or `error`, not both (R-3.1-f)',
    );
  }

  // Route to the correct kind. Wrap ZodError so all rejections from this
  // function are consistently MalformedMessageError.
  if (hasMethod && hasId) {
    return { kind: 'request', message: parseMalformed(JSONRPCRequestSchema, raw) };
  }

  if (hasMethod) {
    return { kind: 'notification', message: parseMalformed(JSONRPCNotificationSchema, raw) };
  }

  if (hasId && hasResult) {
    return { kind: 'result-response', message: parseMalformed(JSONRPCResultResponseSchema, raw) };
  }

  if (hasError) {
    return { kind: 'error-response', message: parseMalformed(JSONRPCErrorResponseSchema, raw) };
  }

  throw new MalformedMessageError(
    'cannot classify message: no valid member combination matched (id/method/result/error)',
  );
}

// ─── Identifier echo validation ───────────────────────────────────────────────

/**
 * Returns `true` when `responseId` is a correct echo of `requestId` — same
 * JSON type (string ↔ string, number ↔ number) and same value. Type coercion
 * MUST NOT be applied. (R-3.2-e, R-3.2-f, R-3.2-g)
 */
export function idEchoMatches(requestId: RequestId, responseId: RequestId): boolean {
  return typeof requestId === typeof responseId && requestId === responseId;
}

// ─── In-flight tracker ────────────────────────────────────────────────────────

/**
 * Tracks in-flight request identifiers for a single sender on a single
 * connection, enforcing the uniqueness rules in §3.2.
 *
 * Per R-3.2-c a sender MUST NOT reuse an identifier while the original
 * request is still awaiting a response. Per R-3.2-d all outstanding ids
 * from a single sender on a single connection MUST be unique.
 *
 * String and number ids with the same textual representation are kept
 * distinct because they are different JSON types (R-3.2-f, R-3.2-g):
 * `"1"` and `1` are different ids.
 */
export class InFlightTracker {
  private readonly _inflight = new Map<string, RequestId>();

  /** Prefixes the natural key with a type tag to distinguish `"1"` from `1`. */
  private key(id: RequestId): string {
    return typeof id === 'string' ? `s:${id}` : `n:${id}`;
  }

  /**
   * Registers `id` as in-flight for an outgoing request.
   * @throws {Error} When `id` is already in-flight, indicating a reuse violation.
   */
  register(id: RequestId): void {
    const k = this.key(id);
    if (this._inflight.has(k)) {
      throw new Error(
        `Request id ${JSON.stringify(id)} is already in-flight; ids MUST be unique (R-3.2-c, R-3.2-d)`,
      );
    }
    this._inflight.set(k, id);
  }

  /**
   * Removes `id` from the in-flight set once a response has been received.
   * It is safe to call this for an id that is not currently tracked.
   */
  complete(id: RequestId): void {
    this._inflight.delete(this.key(id));
  }

  /** Returns `true` when `id` is currently registered as in-flight. */
  has(id: RequestId): boolean {
    return this._inflight.has(this.key(id));
  }

  /** The number of currently in-flight requests. */
  get size(): number {
    return this._inflight.size;
  }

  /** All currently outstanding identifiers (snapshot). */
  get outstanding(): ReadonlyArray<RequestId> {
    return Array.from(this._inflight.values());
  }
}
