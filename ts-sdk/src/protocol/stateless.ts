/**
 * S06 — Stateless Per-Request Model & Cross-Call Continuity (§4.4–§4.7).
 *
 * Every request is self-describing via its own `_meta`; servers MUST NOT infer
 * identity, capabilities, or protocol version from any earlier request or from
 * the underlying connection. Cross-request continuity rides on explicit,
 * server-minted, opaque identifiers that the client echoes back verbatim.
 *
 * No new named wire types are introduced by this story. This module exports
 * utilities for validating and working with opaque continuation identifiers,
 * plus documentation constants for the stateless-model rules.
 *
 * The `_meta` structure and per-request required keys are defined in S05
 * (src/protocol/meta.ts); `validateRequestMeta` there enforces that each
 * request is self-describing.
 */

// ─── ContinuationId ──────────────────────────────────────────────────────────

/**
 * An opaque value that references cross-request state by identity rather than
 * by connection or session. (§4.5 / R-4.5-b)
 *
 * Servers mint these values and return them as ordinary result fields.
 * Clients MUST echo them back verbatim — never parsing, interpreting,
 * modifying, or constructing them. (R-4.5-c)
 *
 * Concrete field names are defined per feature:
 *   §12 / S18  — `nextCursor` / `cursor` (pagination)
 *   §11 / S17  — `requestState` (multi-round-trip)
 *   §25 / S39  — task handle (long-running tasks)
 */
export type ContinuationId =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<unknown>
  | Readonly<Record<string, unknown>>;

/**
 * Returns `true` when `value` is a JSON-serializable value that may serve as a
 * continuation identifier. A continuation id must be able to round-trip through
 * JSON without loss; `undefined`, `Function`, `Symbol`, and `bigint` are excluded.
 *
 * Used when a server mints a new continuation identifier (R-4.5-b).
 */
export function isValidContinuationId(value: unknown): value is ContinuationId {
  if (value === undefined) return false;
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (Array.isArray(value)) return true;
  if (t === 'object') return true;
  return false; // function, symbol, bigint
}

/**
 * Returns `true` when `value` is a string continuation identifier — the most
 * common form (e.g. pagination cursors, `requestState` tokens).
 *
 * Clients MUST NOT parse, decode, or alter a string continuation id. (R-4.5-c)
 */
export function isStringContinuationId(value: unknown): value is string {
  return typeof value === 'string';
}

// ─── Stateless-model rules ────────────────────────────────────────────────────

/**
 * Documentation constants for the normative stateless-processing rules that
 * every S06-conformant server must satisfy. Runtime enforcement lives in
 * `validateRequestMeta` (S05), which ensures each request carries a
 * self-describing `_meta`.
 */
export const STATELESS_MODEL = {
  /** Server MUST NOT infer state from earlier requests, even on same connection. (R-4.4-a) */
  NO_PRIOR_REQUEST_INFERENCE: 'R-4.4-a',
  /** Server MUST NOT require any prior request before processing a given request. (R-4.4-b) */
  NO_HANDSHAKE_REQUIRED: 'R-4.4-b',
  /** Server MUST derive identity, capabilities, version solely from the current `_meta`. (R-4.4-c) */
  IDENTITY_FROM_META_ONLY: 'R-4.4-c',
  /** Server MUST NOT depend on persisted per-connection conversational state. (R-4.4-d) */
  NO_PER_CONNECTION_STATE: 'R-4.4-d',
  /** Server MUST NOT treat connection/process identity as a proxy for conversation. (R-4.4-f) */
  CONNECTION_NOT_CONVERSATION: 'R-4.4-f',
  /** Cross-request state MUST be referenced by an explicit identifier, not connection. (R-4.5-a) */
  EXPLICIT_CONTINUATION_ONLY: 'R-4.5-a',
  /** List results MUST NOT vary based on connection identity. (R-4.6-a) */
  LIST_RESULTS_CONNECTION_INDEPENDENT: 'R-4.6-a',
} as const;

// ─── Deferred-to-transport behaviors ─────────────────────────────────────────

/**
 * Documentation constants for stateless-model behaviors that are RECOMMENDED
 * (SHOULD) at the transport layer and cannot be enforced by this library.
 *
 * These identifiers track which spec references have been consciously deferred.
 * Implementations in S12 (HTTP transport) and S15 (SSE/streaming) SHOULD
 * satisfy each of these constraints using their transport-specific mechanisms.
 *
 * **Why deferred?** The stateless per-request model deliberately separates
 * application-layer identity (carried in `_meta`) from transport-layer
 * connection management. R-4.4-h, R-4.4-i, and R-4.4-j describe
 * RECOMMENDED connection-management strategies; they require transport-level
 * state that is outside this library's scope.
 */
export const DEFERRED_TO_TRANSPORT = {
  /**
   * Transports SHOULD support interleaved task streams so that unrelated
   * requests on the same connection do not head-of-line block. (R-4.4-h)
   *
   * Deferred to: S12 (HTTP transport), S15 (SSE/streaming).
   */
  INTERLEAVED_TASK_STREAMS: 'R-4.4-h',

  /**
   * Transports SHOULD NOT require connection reuse between requests in the
   * same logical conversation. (R-4.4-i)
   *
   * Deferred to: S12 (HTTP transport), S15 (SSE/streaming).
   */
  NO_CONNECTION_REUSE_REQUIREMENT: 'R-4.4-i',

  /**
   * Transports SHOULD support mid-task resume on a new connection by accepting
   * a continuation identifier from a prior connection's response. (R-4.4-j)
   *
   * Deferred to: S12 (HTTP transport), S15 (SSE/streaming).
   */
  MID_TASK_RESUME_ON_NEW_CONNECTION: 'R-4.4-j',
} as const;
