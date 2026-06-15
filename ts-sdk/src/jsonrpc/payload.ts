/**
 * S04 payload shapes — Result, RequestParams, NotificationParams,
 * ProgressToken, Cursor, McpError, and EmptyResult (§3.6–§3.9).
 *
 * These objects ride inside the JSON-RPC envelopes framed in S03:
 *   - `params`  in requests           → RequestParams      (§3.7)
 *   - `params`  in notifications      → NotificationParams (§3.7)
 *   - `result`  in success responses  → Result / EmptyResult (§3.6, §3.9)
 *   - `error`   in error responses    → McpError           (§3.8)
 */

import { z } from 'zod';

// ─── ResultType ──────────────────────────────────────────────────────────────

/**
 * The two `ResultType` values defined by this specification (§3.6, R-3.6-e).
 *
 * Additional values MAY exist only when introduced via the extension mechanism
 * (§24 / S38). Implementations MUST NOT mint new values outside it.
 */
export const RESULT_TYPE = {
  /** The request completed; the result carries the final content for the method. */
  COMPLETE: 'complete',
  /** The server needs more client input before it can finish the request (§11 / S17). */
  INPUT_REQUIRED: 'input_required',
} as const;

/**
 * An open string discriminator: the two spec-defined values plus any values
 * introduced through the extension mechanism (§24 / S38).
 *
 * TypeScript note: `"complete" | "input_required" | string` collapses to `string`
 * at the type level. Use `RESULT_TYPE` constants and `isKnownResultType` to work
 * with the defined values in a type-safe way.
 */
export type ResultType = string;

/** Schema for the open string `ResultType` (§3.6). */
export const ResultTypeSchema = z.string();

/**
 * Returns `true` when `value` is one of the two spec-defined `ResultType` values.
 *
 * Use this to enforce R-3.6-f: a receiver that encounters an unrecognized
 * `resultType` MUST treat the whole response as an error and MUST NOT read
 * any other result members (R-3.6-g).
 */
export function isKnownResultType(
  value: string,
): value is (typeof RESULT_TYPE)[keyof typeof RESULT_TYPE] {
  return value === RESULT_TYPE.COMPLETE || value === RESULT_TYPE.INPUT_REQUIRED;
}

/** Discriminated outcome of `interpretResultType`. */
export type ResultTypeInterpretation =
  | { recognized: true; resultType: 'complete' | 'input_required' }
  | { recognized: false; resultType: string };

/**
 * Interprets the `resultType` field of a received result, applying both
 * normative receiver rules from §3.6:
 *
 *   R-3.6-i: an absent `resultType` MUST be treated as `"complete"` (interop
 *             fallback for servers that omit the field).
 *   R-3.6-f: an unrecognized value means the receiver MUST treat the whole
 *             response as an error — `recognized: false` signals this.
 *   R-3.6-g: when `recognized` is `false`, callers MUST NOT read other members.
 *
 * @param result - The raw result object received from the wire.
 */
export function interpretResultType(
  result: Record<string, unknown>,
): ResultTypeInterpretation {
  const raw = result['resultType'];
  const resolved =
    raw === undefined || raw === null ? RESULT_TYPE.COMPLETE : String(raw);

  if (resolved === RESULT_TYPE.COMPLETE || resolved === RESULT_TYPE.INPUT_REQUIRED) {
    return { recognized: true, resultType: resolved };
  }
  return { recognized: false, resultType: resolved };
}

// ─── Result ──────────────────────────────────────────────────────────────────

/**
 * The object that occupies the `result` member of every success response.
 * All method-specific results extend this base type. (§3.6)
 *
 * Fields:
 *   `_meta` (OPTIONAL): metadata map; keys follow the §4 / S05 naming rules.
 *   Receivers MUST NOT act on MCP-reserved `_meta` keys they do not understand.
 *   (R-3.6-a, R-3.6-b)
 *
 *   `resultType` (REQUIRED): discriminator; every server MUST set it.
 *   (R-3.6-c, R-3.6-h)
 *
 *   Additional members: defined by the specific method; MAY be present.
 *   (R-3.6-d) `.passthrough()` preserves them through parse.
 */
export const ResultSchema = z
  .object({
    /** OPTIONAL metadata map. Keys are subject to §4 naming rules. (R-3.6-a) */
    _meta: z.record(z.unknown()).optional(),
    /** REQUIRED discriminator. (R-3.6-c, R-3.6-h) */
    resultType: ResultTypeSchema,
  })
  .passthrough();

export type Result = z.infer<typeof ResultSchema>;

// ─── EmptyResult ─────────────────────────────────────────────────────────────

/**
 * A `Result` returned by a method that succeeds with no method-specific data.
 * (§3.9, R-3.9-a, R-3.9-b)
 *
 * Senders MUST still set `resultType` (normally `"complete"`) and MUST NOT
 * include any members beyond `_meta` and `resultType`.
 *
 * `EmptyResult` is structurally identical to `Result`; the distinction is
 * semantic: no method-defined extra members are expected or emitted.
 */
export const EmptyResultSchema = z.object({
  /** REQUIRED; normally `"complete"`. (R-3.9-a) */
  resultType: ResultTypeSchema,
  /** OPTIONAL metadata. (R-3.9-b) */
  _meta: z.record(z.unknown()).optional(),
});

export type EmptyResult = z.infer<typeof EmptyResultSchema>;

// ─── RequestParams ───────────────────────────────────────────────────────────

/**
 * The common base every request's `params` object extends. (§3.7)
 *
 * `_meta` is REQUIRED on request params because it conveys per-request protocol
 * state (protocol revision, client info, capabilities, etc.). Its full structure
 * (`RequestMetaObject`) and the key-naming rules are defined in §4 / S05.
 * (R-3.7-a)
 *
 * `.passthrough()` allows method-specific params members to survive parse.
 */
export const RequestParamsSchema = z
  .object({
    /** REQUIRED per-request metadata object. (R-3.7-a) */
    _meta: z.record(z.unknown()),
  })
  .passthrough();

export type RequestParams = z.infer<typeof RequestParamsSchema>;

// ─── NotificationParams ──────────────────────────────────────────────────────

/**
 * The common base every notification's `params` object extends. (§3.7)
 *
 * `_meta` is OPTIONAL; when present, it follows the same key-naming and
 * reserved-key rules as other `_meta` objects (§4 / S05). (R-3.7-b)
 *
 * `.passthrough()` allows notification-specific params members to survive parse.
 */
export const NotificationParamsSchema = z
  .object({
    /** OPTIONAL metadata map. (R-3.7-b) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type NotificationParams = z.infer<typeof NotificationParamsSchema>;

// ─── ProgressToken ───────────────────────────────────────────────────────────

/**
 * An opaque value the requester places in request `_meta` to correlate
 * out-of-band progress notifications to the request. (§3.7, §15.1)
 *
 * Canonical type home: §3.7 (Appendix E). Placement within `_meta` and the
 * full progress-notification flow are defined in §15 / S22.
 *
 * The receiver MAY emit correlated progress notifications but is not obligated
 * to do so. (R-3.7-c)
 */
// A progress token is an OPAQUE string-or-number (R-15.1.1-a); unlike request ids and
// error codes it need not be an integer, so §2.5 safe-integer does not constrain it.
export const ProgressTokenSchema = z.union([z.string(), z.number()]);
export type ProgressToken = z.infer<typeof ProgressTokenSchema>;

// ─── Cursor ──────────────────────────────────────────────────────────────────

/**
 * An opaque pagination token referenced by paginated methods. (§3.7)
 *
 * Canonical type home: §3.7 (Appendix E). Use in list operations is defined
 * in §12 / S18. Receivers MUST NOT parse or infer structure from a cursor value.
 * (R-3.7-d)
 */
export const CursorSchema = z.string();
export type Cursor = z.infer<typeof CursorSchema>;

// ─── McpError ────────────────────────────────────────────────────────────────

/**
 * The object carried in the `error` member of every error response. (§3.8)
 *
 * Named `McpError` to avoid shadowing the built-in `Error` class.
 *
 * Fields:
 *   `code` (REQUIRED integer): identifies the error condition. Legal values and
 *   their use conditions are defined in §22 / S34. Implementations MUST NOT
 *   assign codes outside those rules. (R-3.8-a, R-3.8-b)
 *
 *   `message` (REQUIRED string): short, human-readable description. SHOULD be
 *   a single concise sentence. (R-3.8-c, R-3.8-d)
 *
 *   `data` (OPTIONAL any): sender-defined additional info. Receivers MUST NOT
 *   assume a particular structure unless the specific code defines one in §22.
 *   (R-3.8-e, R-3.8-f)
 */
export const McpErrorSchema = z
  .object({
    /** REQUIRED integer error code, within the IEEE-754 safe-integer range. (R-3.8-a, §2.5) */
    code: z.number().int().refine(Number.isSafeInteger, { message: 'error code MUST be a safe integer (§2.5)' }),
    /** REQUIRED human-readable description; SHOULD be a single sentence. (R-3.8-c) */
    message: z.string(),
    /** OPTIONAL sender-defined additional detail. (R-3.8-e) */
    data: z.unknown().optional(),
  })
  .passthrough();

export type McpError = z.infer<typeof McpErrorSchema>;
