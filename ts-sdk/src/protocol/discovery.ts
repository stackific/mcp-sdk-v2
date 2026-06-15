/**
 * S08 — Discovery via `server/discover` (§5.3).
 *
 * Discovery is the one well-known entry point a client uses to learn what a
 * server is and what it can do before issuing feature requests: a single round
 * trip in which the client sends `server/discover` and the server returns a
 * `DiscoverResult` advertising its supported protocol revisions, capabilities,
 * and identity — or, when it does not support the requested revision, an
 * `UnsupportedProtocolVersion` error whose `data.supported` still tells the
 * client which revisions the server accepts.
 *
 * This module provides:
 *   - `DiscoverRequestSchema` / `DiscoverResultSchema` / `DiscoverResultResponseSchema`
 *     — the wire shapes (the result extends the §3.6 `Result` base type).
 *   - `validateDiscoverRequest` — checks the method and the three REQUIRED
 *     reserved `_meta` keys (R-5.3.1-a – R-5.3.1-d), tolerating extra keys.
 *   - `processDiscoverRequest` / `buildDiscoverResult` — the reference
 *     `server/discover` handler every server MUST implement (R-5.3-a), which
 *     tolerates an unsupported requested revision and answers with
 *     `UnsupportedProtocolVersion` (-32004) (R-5.3.1-f, R-5.3.1-g).
 *   - `selectRevision` — order-independent client-side revision selection
 *     (R-5.3.2-d): element order in `supportedVersions` is never a preference.
 *   - `resolveInstructions` — returns the server's `instructions` or `undefined`;
 *     never fabricates guidance when absent (R-5.3.2-j).
 *
 * Out of scope (owned elsewhere, per the story):
 *   - the full revision-selection algorithm and the full `UnsupportedProtocolVersion`
 *     / `MissingRequiredClientCapability` error definitions — S09 (§5.4–§5.7);
 *   - the internals of `ServerCapabilities` / `ClientCapabilities` — S10/S11 (§6);
 *   - the full `Implementation` object — S20 (§14), reused here from `types/`.
 */

import { z } from 'zod';
import { ImplementationSchema, type Implementation } from '../types/implementation.js';
import { RequestIdSchema, type RequestId } from '../jsonrpc/framing.js';
import { ResultTypeSchema, RESULT_TYPE } from '../jsonrpc/payload.js';
import {
  RequestMetaObjectSchema,
  validateRequestMeta,
  INVALID_PARAMS_CODE,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
  CURRENT_PROTOCOL_VERSION,
  isSupportedProtocolVersion,
  type MetaObject,
} from './meta.js';
import { SERVER_DISCOVER_METHOD } from './progress.js';

export { SERVER_DISCOVER_METHOD } from './progress.js';

// ─── DiscoverRequest ───────────────────────────────────────────────────────────

/**
 * The `params` of a `server/discover` request. (§5.3.1, R-5.3.1-a)
 *
 * It carries no operation-specific fields — only the standard request-parameters
 * object with its `_meta` envelope. `RequestMetaObjectSchema` enforces that the
 * three reserved keys are present and well-typed (R-5.3.1-b – R-5.3.1-d) and,
 * being `.passthrough()`, accepts additional `_meta` keys (R-5.3.1-e).
 */
export const DiscoverRequestParamsSchema = z
  .object({
    /** REQUIRED request metadata envelope carrying the three reserved keys. */
    _meta: RequestMetaObjectSchema,
  })
  .passthrough();

export type DiscoverRequestParams = z.infer<typeof DiscoverRequestParamsSchema>;

/**
 * The `server/discover` request shape: the literal method name plus the
 * `params` object whose only required content is the `_meta` envelope. (§5.3.1)
 *
 * The surrounding JSON-RPC envelope members (`jsonrpc`, `id`) are defined by
 * S03; `DiscoverRequestSchema` describes the method-specific payload, while
 * {@link buildDiscoverRequest} produces a complete JSON-RPC request.
 */
export const DiscoverRequestSchema = z
  .object({
    /** REQUIRED literal identifying the discovery method. (R-5.3-a) */
    method: z.literal(SERVER_DISCOVER_METHOD),
    /** REQUIRED standard request-parameters object. */
    params: DiscoverRequestParamsSchema,
  })
  .passthrough();

export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;

// ─── DiscoverResult ────────────────────────────────────────────────────────────

/**
 * The server's advertisement of its supported revisions, capabilities, and
 * identity. A `DiscoverResult` is a `Result` (§3.6) and therefore carries the
 * base `resultType` discriminator (normally `"complete"`, REQUIRED). (§5.3.2)
 *
 * Field constraints (R-5.3.2-a – R-5.3.2-k):
 *   - `supportedVersions` REQUIRED, non-empty `string[]`; each element a revision
 *     the server will accept on subsequent requests. Order carries no preference.
 *   - `capabilities` REQUIRED `ServerCapabilities`; empty `{}` is valid.
 *   - `serverInfo` REQUIRED `Implementation`; REQUIRES string `name` + `version`.
 *   - `instructions` OPTIONAL natural-language guidance.
 *   - `_meta` OPTIONAL result-level metadata.
 *
 * Non-emptiness of `supportedVersions` is enforced by the `superRefine` below so
 * that the inferred type stays a plain `string[]` (matching the EmptyResult /
 * InputRequiredResult conventions elsewhere in this package).
 */
export const DiscoverResultSchema = z
  .object({
    /** REQUIRED base discriminator; normally `"complete"`. (R-5.3.2-a) */
    resultType: ResultTypeSchema,
    /** REQUIRED non-empty list of accepted protocol revisions. (R-5.3.2-b, R-5.3.2-c) */
    supportedVersions: z.array(z.string()),
    /** REQUIRED server capabilities; `{}` is valid. (R-5.3.2-e) */
    capabilities: z.record(z.unknown()),
    /** REQUIRED server identity; REQUIRES `name` + `version`. (R-5.3.2-f) */
    serverInfo: ImplementationSchema,
    /** OPTIONAL natural-language guidance for using the server. (R-5.3.2-g) */
    instructions: z.string().optional(),
    /** OPTIONAL result-level metadata envelope. (R-5.3.2-k) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if (val.supportedVersions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supportedVersions'],
        message: 'supportedVersions MUST be a non-empty array (R-5.3.2-b)',
      });
    }
  });

export type DiscoverResult = z.infer<typeof DiscoverResultSchema>;

/** Returns `true` when `value` is a well-formed `DiscoverResult`. */
export function isDiscoverResult(value: unknown): value is DiscoverResult {
  return DiscoverResultSchema.safeParse(value).success;
}

/**
 * The JSON-RPC success envelope that carries a `DiscoverResult` in `result`.
 * (§5.3.2, `DiscoverResultResponse`)
 */
export const DiscoverResultResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: RequestIdSchema,
    result: DiscoverResultSchema,
  })
  .passthrough();

export type DiscoverResultResponse = z.infer<typeof DiscoverResultResponseSchema>;

// ─── UnsupportedProtocolVersion error (-32004) ─────────────────────────────────

/**
 * The `UnsupportedProtocolVersion` JSON-RPC error code. (§5.5 / S09)
 *
 * Defined here because discovery is the first method that MUST emit it
 * (R-5.3.1-g); S09 owns the full error definition and will reuse this constant.
 * This mirrors how `MISSING_CLIENT_CAPABILITY_CODE` is defined in S05's meta.ts
 * for the same forward-reference reason.
 */
export const UNSUPPORTED_PROTOCOL_VERSION_CODE = -32004 as const;

/** The REQUIRED `data` payload of an `UnsupportedProtocolVersion` error. (§5.5) */
export interface UnsupportedProtocolVersionData {
  /** The revisions the server supports — informs the client even on failure. */
  supported: string[];
  /** The (unsupported) revision the client requested; echoed back. */
  requested: string;
}

/** The `UnsupportedProtocolVersion` error object. (§5.5 / S09) */
export interface UnsupportedProtocolVersionError {
  code: typeof UNSUPPORTED_PROTOCOL_VERSION_CODE;
  message: string;
  data: UnsupportedProtocolVersionData;
}

/**
 * Builds the `UnsupportedProtocolVersion` (-32004) error a server returns when
 * the requested revision is not in its supported set. (R-5.3.1-g)
 *
 * Both `data.supported` and `data.requested` are REQUIRED (§5.5): the former
 * still advertises the server's revisions so the client can recover; the latter
 * echoes the rejected revision.
 *
 * @param requested - The revision the client declared (and the server rejected).
 * @param supported - The revisions the server accepts.
 */
export function buildUnsupportedProtocolVersionError(
  requested: string,
  supported: readonly string[],
): UnsupportedProtocolVersionError {
  return {
    code: UNSUPPORTED_PROTOCOL_VERSION_CODE,
    message: 'Unsupported protocol version',
    data: { supported: [...supported], requested },
  };
}

// ─── Server-side discovery configuration ───────────────────────────────────────

/**
 * The server-supplied inputs to a `DiscoverResult`. A server constructs one of
 * these once and reuses it across discovery requests (the model is stateless —
 * the result does not depend on the connection or any prior request).
 */
export interface DiscoverConfig {
  /** Non-empty list of revisions the server will accept. (R-5.3.2-b, R-5.3.2-c) */
  supportedVersions: readonly string[];
  /** The server's advertised capabilities; `{}` means "no optional capabilities". */
  capabilities: Record<string, unknown>;
  /** Server identity; MUST carry string `name` and `version`. (R-5.3.2-f) */
  serverInfo: Implementation;
  /** OPTIONAL guidance for using the server effectively. (R-5.3.2-g) */
  instructions?: string;
  /** OPTIONAL result-level metadata. (R-5.3.2-k) */
  _meta?: MetaObject;
}

/**
 * Returns `true` when `requested` is one of the server's `supportedVersions`.
 *
 * Comparison is exact string membership (no lexical/chronological ordering, per
 * S07/§5.1) and is independent of element order — reordering `supportedVersions`
 * never changes the outcome.
 */
export function isVersionSupported(
  supportedVersions: readonly string[],
  requested: string,
): boolean {
  return supportedVersions.includes(requested);
}

/**
 * Builds a successful `DiscoverResult` from a server's `DiscoverConfig`. (§5.3.2)
 *
 * `resultType` is set to `"complete"` (R-5.3.2-a). Optional `instructions` and
 * `_meta` are included only when supplied — they are never defaulted.
 *
 * @throws {RangeError} When `config.supportedVersions` is empty — a server MUST
 *   advertise at least one accepted revision (R-5.3.2-b).
 */
export function buildDiscoverResult(config: DiscoverConfig): DiscoverResult {
  if (config.supportedVersions.length === 0) {
    throw new RangeError('DiscoverResult.supportedVersions MUST be non-empty (R-5.3.2-b)');
  }
  const result: DiscoverResult = {
    resultType: RESULT_TYPE.COMPLETE,
    supportedVersions: [...config.supportedVersions],
    capabilities: config.capabilities,
    serverInfo: config.serverInfo,
  };
  if (config.instructions !== undefined) {
    result.instructions = config.instructions;
  }
  if (config._meta !== undefined) {
    result._meta = config._meta;
  }
  return result;
}

// ─── Request validation ────────────────────────────────────────────────────────

/** Outcome of {@link validateDiscoverRequest}. */
export type DiscoverRequestValidation =
  | { ok: true; requestedVersion: string }
  | { ok: false; code: typeof INVALID_PARAMS_CODE; message: string };

/**
 * Validates a raw `server/discover` request payload. (§5.3.1)
 *
 * Checks, in order:
 *   1. the object is present and its `method` is `"server/discover"`;
 *   2. `params` is present and is an object carrying `_meta`;
 *   3. `_meta` carries the three REQUIRED reserved keys with correct types
 *      (delegated to `validateRequestMeta`, R-5.3.1-a – R-5.3.1-d).
 *
 * Extra `_meta` keys are accepted (R-5.3.1-e). On success it returns the
 * declared protocol revision so the caller can decide whether it is supported.
 *
 * @param request - A raw request object (e.g. a classified `JSONRPCRequest`).
 */
export function validateDiscoverRequest(request: unknown): DiscoverRequestValidation {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return { ok: false, code: INVALID_PARAMS_CODE, message: 'Invalid params: request must be an object' };
  }
  const obj = request as Record<string, unknown>;

  if (obj['method'] !== SERVER_DISCOVER_METHOD) {
    return {
      ok: false,
      code: INVALID_PARAMS_CODE,
      message: `Invalid params: method must be "${SERVER_DISCOVER_METHOD}"`,
    };
  }

  const params = obj['params'];
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return { ok: false, code: INVALID_PARAMS_CODE, message: 'Invalid params: params must be an object' };
  }

  const meta = (params as Record<string, unknown>)['_meta'];
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    return { ok: false, code: INVALID_PARAMS_CODE, message: 'Invalid params: params._meta must be an object' };
  }

  const metaResult = validateRequestMeta(meta as Record<string, unknown>);
  if (!metaResult.ok) {
    return metaResult;
  }

  return {
    ok: true,
    requestedVersion: (meta as Record<string, unknown>)[PROTOCOL_VERSION_META_KEY] as string,
  };
}

// ─── Reference handler ─────────────────────────────────────────────────────────

/** Outcome of {@link processDiscoverRequest}. */
export type ProcessDiscoverOutcome =
  | { ok: true; result: DiscoverResult }
  | {
      ok: false;
      error:
        | { code: typeof INVALID_PARAMS_CODE; message: string }
        | UnsupportedProtocolVersionError;
    };

/**
 * The reference `server/discover` handler every server MUST implement. (R-5.3-a)
 *
 * Behavior:
 *   - A malformed request (wrong method, missing/invalid reserved `_meta` keys)
 *     yields an invalid-params (-32602) error.
 *   - A well-formed request whose declared revision the server does NOT support
 *     does not crash or hang; it yields an `UnsupportedProtocolVersion` (-32004)
 *     error whose `data.supported` lists the server's revisions and whose
 *     `data.requested` echoes the rejected revision. (R-5.3.1-f, R-5.3.1-g)
 *   - Otherwise it yields a `DiscoverResult`. (R-5.3.2-a – R-5.3.2-k)
 *
 * The handler is stateless: it derives the requested revision solely from the
 * request's `_meta` and never from a prior request or the connection.
 *
 * @param config  - The server's advertised revisions, capabilities, and identity.
 * @param request - A raw `server/discover` request object.
 */
export function processDiscoverRequest(
  config: DiscoverConfig,
  request: unknown,
): ProcessDiscoverOutcome {
  const validation = validateDiscoverRequest(request);
  if (!validation.ok) {
    return { ok: false, error: { code: validation.code, message: validation.message } };
  }

  // Tolerate a revision the server does not support — answer with the error
  // (not a crash/hang); data.supported still informs the client. (R-5.3.1-f/g)
  if (!isVersionSupported(config.supportedVersions, validation.requestedVersion)) {
    return {
      ok: false,
      error: buildUnsupportedProtocolVersionError(
        validation.requestedVersion,
        config.supportedVersions,
      ),
    };
  }

  return { ok: true, result: buildDiscoverResult(config) };
}

// ─── Request / response construction helpers ───────────────────────────────────

/**
 * Builds a complete `server/discover` JSON-RPC request carrying the three
 * REQUIRED reserved `_meta` keys, plus any additional `_meta` keys. (§5.3.1)
 *
 * @param id                 - The JSON-RPC request id.
 * @param protocolVersion    - The revision this request declares.
 * @param clientInfo         - The client's `Implementation` identity.
 * @param clientCapabilities - The client's declared capabilities (`{}` is valid).
 * @param extraMeta          - OPTIONAL additional `_meta` keys (R-5.3.1-e).
 */
export function buildDiscoverRequest(
  id: RequestId,
  protocolVersion: string,
  clientInfo: Implementation,
  clientCapabilities: Record<string, unknown>,
  extraMeta?: MetaObject,
): {
  jsonrpc: '2.0';
  id: RequestId;
  method: typeof SERVER_DISCOVER_METHOD;
  params: { _meta: MetaObject };
} {
  return {
    jsonrpc: '2.0',
    id,
    method: SERVER_DISCOVER_METHOD,
    params: {
      _meta: {
        ...extraMeta,
        [PROTOCOL_VERSION_META_KEY]: protocolVersion,
        [CLIENT_INFO_META_KEY]: clientInfo,
        [CLIENT_CAPABILITIES_META_KEY]: clientCapabilities,
      },
    },
  };
}

/** Wraps a `DiscoverResult` in its JSON-RPC success envelope. (§5.3.2) */
export function buildDiscoverResponse(
  id: RequestId,
  config: DiscoverConfig,
): DiscoverResultResponse {
  return { jsonrpc: '2.0', id, result: buildDiscoverResult(config) };
}

// ─── Client-side consumption ───────────────────────────────────────────────────

/**
 * Selects a protocol revision from a server's `supportedVersions` using the
 * client's own preference order — never the order of the server's array.
 * (R-5.3.2-d, AC-08.7)
 *
 * The client supplies `clientAcceptable`, its revisions in descending preference.
 * The first client-preferred revision that the server also supports is chosen.
 * Because the decision is driven by the client's order and by set membership of
 * the server's list, **reordering `supportedVersions` cannot change the result**.
 *
 * Returns `undefined` when the client and server share no revision (the caller
 * then has no usable revision — selection makes no fallback assumption).
 *
 * @param supportedVersions - The server's advertised revisions (order ignored).
 * @param clientAcceptable  - The client's acceptable revisions, most-preferred first.
 *   Defaults to `[CURRENT_PROTOCOL_VERSION]`.
 */
export function selectRevision(
  supportedVersions: readonly string[],
  clientAcceptable: readonly string[] = [CURRENT_PROTOCOL_VERSION],
): string | undefined {
  const offered = new Set(supportedVersions);
  for (const candidate of clientAcceptable) {
    if (offered.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Returns the server's `instructions` string, or `undefined` when absent.
 *
 * When `instructions` is missing the client MUST NOT assume or fabricate any
 * guidance — this returns `undefined` rather than an empty or default string.
 * (R-5.3.2-j, AC-08.11)
 */
export function resolveInstructions(result: { instructions?: unknown }): string | undefined {
  return typeof result.instructions === 'string' ? result.instructions : undefined;
}

// Re-export so discovery callers can reference the SDK's current revision and
// the support predicate without importing from meta.ts/revision.ts directly.
// (Same underlying bindings as revision.ts re-exports — not an ambiguity.)
export { CURRENT_PROTOCOL_VERSION, isSupportedProtocolVersion };
