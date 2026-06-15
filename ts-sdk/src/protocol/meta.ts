/**
 * S05 — The `_meta` object, metadata naming rules, and per-request keys (§4.1–§4.3).
 *
 * Builds on the key-naming grammar functions in `src/json/meta-key.ts` (S02)
 * and adds the semantic layer:
 *   - `MetaObject` type: the generic string-keyed metadata container
 *   - `RESERVED_BARE_KEYS`: the four prefix-less keys the spec allows in `_meta`
 *   - `LoggingLevel` enum with ascending-severity ordering
 *   - `RequestMetaObjectSchema`: the full per-request `_meta` shape
 *   - `validateRequestMeta`: structured validation of required per-request keys
 *   - Error-code constants for `-32602` (invalid params) and `-32003` (missing capability)
 *
 * Key-naming grammar functions (`isValidMetaKeyPrefix`, `isReservedMetaKeyPrefix`,
 * `isValidMetaKey`, etc.) remain in `src/json/meta-key.ts`.
 */

import { z } from 'zod';
import { ImplementationSchema } from '../types/implementation.js';
import { ProgressTokenSchema } from '../jsonrpc/payload.js';

// ─── Error codes ──────────────────────────────────────────────────────────────

/** JSON-RPC standard "Invalid params" error code. (§22 / S34) */
export const INVALID_PARAMS_CODE = -32602 as const;

/** MCP-specific "Missing required client capability" error code. (§5 / S09) */
export const MISSING_CLIENT_CAPABILITY_CODE = -32003 as const;

// ─── Reserved bare keys ───────────────────────────────────────────────────────

/**
 * The four bare keys (no prefix) that are RESERVED and MAY appear in `_meta`.
 * (§4.2, R-4.2-j)
 *
 * All other bare keys are non-conformant (they have no prefix and are not in
 * this set). `progressToken` correlates progress notifications (§15 / S22);
 * the three W3C keys carry distributed-trace context (§4.2 / R-4.2-l, R-4.2-m).
 */
export const RESERVED_BARE_KEYS = new Set([
  'progressToken',
  'traceparent',
  'tracestate',
  'baggage',
] as const);

/** Returns `true` when `key` is one of the four reserved bare keys. (R-4.2-j) */
export function isReservedBareKey(key: string): boolean {
  return RESERVED_BARE_KEYS.has(key as never);
}

// ─── Reserved per-request `_meta` keys ─────────────────────────────────────────

/**
 * The three reserved `io.modelcontextprotocol/*` keys that are REQUIRED in the
 * `_meta` of every client request. (§4.3, R-4.3-a – R-4.3-c)
 *
 * Exported as named constants so that every module that constructs or inspects
 * a request envelope — discovery (S08), the transport contract (S12), and any
 * later feature — references the same canonical key strings instead of
 * re-typing the literals.
 */
export const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion' as const;
export const CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo' as const;
export const CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities' as const;

/** The three required reserved request `_meta` keys, in declaration order. (§4.3) */
export const RESERVED_REQUEST_META_KEYS = [
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
] as const;

// ─── MetaObject ───────────────────────────────────────────────────────────────

/**
 * A string-keyed map for arbitrary metadata attached to a message. (§4.1)
 *
 * The value of `_meta` is always a JSON object — never an array or scalar.
 * (R-4.1-j) Each member value MAY be any JSON value. (R-4.1-b)
 */
export const MetaObjectSchema = z.record(z.unknown());
export type MetaObject = z.infer<typeof MetaObjectSchema>;

// ─── LoggingLevel ─────────────────────────────────────────────────────────────

/**
 * Log severity values, in ascending order. (§4.3, R-4.3-d)
 *
 * Used in `io.modelcontextprotocol/logLevel`. Status: **Deprecated** (see §15 / S23).
 * When present, the server SHOULD emit only log notifications at or above this
 * severity. When absent, the server MUST NOT emit log notifications for the
 * request (R-4.3-l, R-4.3-m).
 */
export const LOGGING_LEVELS = [
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency',
] as const;

/**
 * @deprecated The `io.modelcontextprotocol/logLevel` `_meta` key (and the Logging
 * capability it drives) is Deprecated (§27.3). See the Logging capability
 * migration note (stderr on stdio; external observability otherwise). Earliest
 * removal: 2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
 */
export const LoggingLevelSchema = z.enum(LOGGING_LEVELS);
export type LoggingLevel = z.infer<typeof LoggingLevelSchema>;

/**
 * Returns the numeric severity index of a `LoggingLevel` value (lower = less severe).
 * Useful for deciding whether to emit a notification given a requested `logLevel`.
 */
export function loggingLevelIndex(level: LoggingLevel): number {
  return LOGGING_LEVELS.indexOf(level);
}

/**
 * Returns `true` when `candidate` severity is at or above `minimum`.
 * Implements the server-side filtering rule R-4.3-m.
 */
export function isAtOrAboveLogLevel(
  candidate: LoggingLevel,
  minimum: LoggingLevel,
): boolean {
  return loggingLevelIndex(candidate) >= loggingLevelIndex(minimum);
}

// ─── Protocol version ─────────────────────────────────────────────────────────

/** The protocol revision supported by this SDK release. (§5 / S07) */
export const CURRENT_PROTOCOL_VERSION = '2026-07-28' as const;

/**
 * Returns `true` when the server recognizes and supports `version`.
 * A server that does not support the requested revision MUST reject the request
 * with the unsupported-protocol-version error (§5 / S09). (R-4.3-f)
 */
export function isSupportedProtocolVersion(version: string): boolean {
  return version === CURRENT_PROTOCOL_VERSION;
}

/**
 * Regular expression for the `YYYY-MM-DD` revision-identifier format. (§5.1)
 *
 * A conforming revision identifier is exactly 10 characters in the form
 * `2026-07-28`. The regex validates only the digit/separator layout, not
 * calendar correctness — implementations MUST treat revision identifiers as
 * opaque, exactly-matched strings and MUST NOT perform lexical, chronological,
 * or range comparison. (R-5.1-a, R-5.1-b)
 *
 * This primitive lives here (S05/meta) rather than in revision.ts (S07) so that
 * the request gate `validateRequestMeta` can reject a malformed-but-string
 * `protocolVersion` without importing S07 (which would create a meta↔revision
 * import cycle). `revision.ts` re-exports it.
 */
export const PROTOCOL_REVISION_FORMAT_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns `true` when `revision` matches the `YYYY-MM-DD` format. (§5.1, R-5.2-b)
 *
 * A `true` result does NOT mean the revision is supported — use
 * {@link isSupportedProtocolVersion} for that. Format validity is a weaker,
 * pre-check condition on the identifier's shape.
 */
export function isValidRevisionFormat(revision: string): boolean {
  return PROTOCOL_REVISION_FORMAT_RE.test(revision);
}

// ─── RequestMetaObject ────────────────────────────────────────────────────────

/**
 * The full shape of a request's `params._meta` object. (§4.3)
 *
 * Three keys are REQUIRED on every client request (R-4.3-a, R-4.3-b, R-4.3-c):
 *   `io.modelcontextprotocol/protocolVersion` — protocol revision in use.
 *   `io.modelcontextprotocol/clientInfo`      — `Implementation` identity.
 *   `io.modelcontextprotocol/clientCapabilities` — per-request declared capabilities.
 *
 * Optional keys (R-4.3-d, R-4.3-e):
 *   `io.modelcontextprotocol/logLevel`  — Deprecated min log severity.
 *   `progressToken`, `traceparent`, `tracestate`, `baggage` — bare reserved keys.
 *
 * Additional protocol-defined or vendor keys MAY appear. `.passthrough()` preserves them.
 *
 * Note: the `ClientCapabilities` object's full shape is defined in §6 / S10.
 * Here it is accepted as any JSON object (`z.record(z.unknown())`).
 */
export const RequestMetaObjectSchema = z
  .object({
    /** REQUIRED on client requests: the protocol revision this request uses. (R-4.3-a) */
    'io.modelcontextprotocol/protocolVersion': z.string(),
    /** REQUIRED on client requests: identifies the client software. (R-4.3-b) */
    'io.modelcontextprotocol/clientInfo': ImplementationSchema,
    /** REQUIRED on client requests: per-request declared client capabilities. (R-4.3-c) */
    'io.modelcontextprotocol/clientCapabilities': z.record(z.unknown()),
    /** OPTIONAL and Deprecated: min log severity for this request. (R-4.3-d) */
    'io.modelcontextprotocol/logLevel': LoggingLevelSchema.optional(),
    /** OPTIONAL: out-of-band progress correlation token. (R-4.3-e) */
    progressToken: ProgressTokenSchema.optional(),
    // Trace-context values are carried as OPAQUE transport for trace propagation:
    // a receiver MUST NOT parse or branch on their contents, and a non-tracing
    // receiver MUST ignore them without error (§15.4.2, R-15.4.2-c, R-15.4.2-g).
    // They are therefore accepted as plain optional strings here. W3C grammar
    // validation is available to SENDERS only via `isValidTracestate`/
    // `isValidBaggage` in `../json/meta-key.js` — never on this receiver gate.
    /** OPTIONAL: W3C Trace Context traceparent — opaque to the receiver. (R-15.4.2-c, R-15.4.2-g) */
    traceparent: z.string().optional(),
    /** OPTIONAL: W3C Trace Context tracestate — opaque to the receiver. (R-15.4.2-c, R-15.4.2-g) */
    tracestate: z.string().optional(),
    /** OPTIONAL: W3C Baggage — opaque to the receiver. (R-15.4.2-c, R-15.4.2-g) */
    baggage: z.string().optional(),
  })
  .passthrough();

export type RequestMetaObject = z.infer<typeof RequestMetaObjectSchema>;

// ─── validateRequestMeta ──────────────────────────────────────────────────────

/** Outcome of `validateRequestMeta`. */
export type RequestMetaValidationResult =
  | { ok: true }
  | { ok: false; code: typeof INVALID_PARAMS_CODE; message: string };

/**
 * Validates that a request's `_meta` object contains all three REQUIRED
 * per-request keys. (§4.3, R-4.3-n)
 *
 * Returns `{ ok: false, code: -32602, message }` when any required key is
 * missing or has the wrong type; the server MUST respond with this code (and
 * HTTP `400 Bad Request` on the HTTP transport).
 *
 * Unknown extra keys are ignored per R-4.1-e, R-4.1-f.
 *
 * @param meta - The raw `_meta` value from the request's `params`.
 */
export function validateRequestMeta(
  meta: Record<string, unknown>,
): RequestMetaValidationResult {
  const protocolVersion = meta[PROTOCOL_VERSION_META_KEY];
  if (typeof protocolVersion !== 'string') {
    return {
      ok: false,
      code: INVALID_PARAMS_CODE,
      message: `Invalid params: missing required _meta key ${PROTOCOL_VERSION_META_KEY}`,
    };
  }
  // The value MUST be a revision identifier, i.e. well-formed `YYYY-MM-DD`
  // (§5.1, R-5.2-b). A malformed-but-string version is rejected at the request
  // gate as invalid params — distinct from a well-formed-but-unsupported
  // revision, which the discovery/negotiation layer answers with -32004.
  if (!isValidRevisionFormat(protocolVersion)) {
    return {
      ok: false,
      code: INVALID_PARAMS_CODE,
      message: `Invalid params: ${PROTOCOL_VERSION_META_KEY} "${protocolVersion}" is not a valid YYYY-MM-DD revision identifier`,
    };
  }

  const clientInfo = meta[CLIENT_INFO_META_KEY];
  const infoResult = ImplementationSchema.safeParse(clientInfo);
  if (!infoResult.success) {
    return {
      ok: false,
      code: INVALID_PARAMS_CODE,
      message: `Invalid params: missing or invalid required _meta key ${CLIENT_INFO_META_KEY}`,
    };
  }

  const caps = meta[CLIENT_CAPABILITIES_META_KEY];
  if (typeof caps !== 'object' || caps === null || Array.isArray(caps)) {
    return {
      ok: false,
      code: INVALID_PARAMS_CODE,
      message: `Invalid params: missing required _meta key ${CLIENT_CAPABILITIES_META_KEY}`,
    };
  }

  return { ok: true };
}

// ─── Missing-capability error builder ─────────────────────────────────────────

/**
 * The `data` payload for a `-32003` "Missing required client capability" error.
 * (§5 / S09, R-4.3-k)
 */
export interface MissingCapabilityErrorData {
  /** Keys are the capability names the request required but did not declare. */
  requiredCapabilities: Record<string, unknown>;
}

/**
 * Builds the JSON-RPC error payload for a missing-required-client-capability
 * rejection. (R-4.3-k)
 *
 * On the HTTP transport, the response status MUST also be `400 Bad Request`.
 *
 * @param requiredCapabilities - Map whose keys are the capability names that
 *   were required but not declared in `clientCapabilities`.
 */
export function buildMissingCapabilityError(
  requiredCapabilities: Record<string, unknown>,
): {
  code: typeof MISSING_CLIENT_CAPABILITY_CODE;
  message: string;
  data: MissingCapabilityErrorData;
} {
  return {
    code: MISSING_CLIENT_CAPABILITY_CODE,
    message: 'Missing required client capability',
    data: { requiredCapabilities },
  };
}
