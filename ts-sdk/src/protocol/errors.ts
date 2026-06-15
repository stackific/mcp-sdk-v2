/**
 * S34 — Error Handling & Error Code Registry (§22).
 *
 * The single, authoritative model for how a receiver reports that a request
 * could not be processed: the JSON-RPC `error` object shape, the full registry
 * of error codes (the five standard JSON-RPC codes plus MCP's protocol-specific
 * and transport codes), the normative `data` payloads, the HTTP status
 * mappings, the canonical mapping of validation failures to `-32602`, the firm
 * boundary between a protocol-level JSON-RPC `error` and a feature-level error
 * *result* (a tool that ran and failed), and the rules for extension-defined
 * and unknown error codes.
 *
 * Every numeric code already defined by waves 1–9 is RE-EXPORTED here (the same
 * binding, never a duplicate) so the whole error surface lives behind one
 * module:
 *   - `PARSE_ERROR_CODE` (-32700) — src/transport/correlation.ts (S15)
 *   - `INVALID_REQUEST_CODE` / `METHOD_NOT_FOUND_CODE` / `INTERNAL_ERROR_CODE`
 *     (-32600 / -32601 / -32603) — src/transport/http/responses.ts (S15)
 *   - `INVALID_PARAMS_CODE` (-32602) — src/protocol/meta.ts (S05)
 *   - `INVALID_CURSOR_CODE` (-32602, an alias for invalid-params on bad cursors)
 *     — src/protocol/pagination.ts (S18)
 *   - `MISSING_CLIENT_CAPABILITY_CODE` (-32003) — src/protocol/meta.ts (S05)
 *   - `UNSUPPORTED_PROTOCOL_VERSION_CODE` (-32004) — src/protocol/discovery.ts (S08)
 *   - `HEADER_MISMATCH_CODE` (-32001) — src/transport/http/headers.ts (S15)
 *
 * Codes whose owning feature module is built in a concurrent wave (e.g.
 * `-32002` Resource not found, owned by Resources) are expressed here as
 * registry DATA (numeric literal + name + meaning), not imported, so this
 * module never takes a dependency on a not-yet-built sibling. The numeric
 * literal `RESOURCE_NOT_FOUND_CODE` is the only such case in §22's registry.
 */

// ─── Re-exported existing code bindings (the same constants, never redeclared) ──

export { PARSE_ERROR_CODE } from '../transport/correlation.js';
export {
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  INTERNAL_ERROR_CODE,
} from '../transport/http/responses.js';
export { INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE } from './meta.js';
export { INVALID_CURSOR_CODE } from './pagination.js';
export { UNSUPPORTED_PROTOCOL_VERSION_CODE } from './discovery.js';
export { HEADER_MISMATCH_CODE } from '../transport/http/headers.js';

// These local bindings drive the registry tables below. They are the SAME
// values re-exported above, imported here so the data structure can reference
// them by constant rather than by a re-typed literal.
import { PARSE_ERROR_CODE } from '../transport/correlation.js';
import {
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  INTERNAL_ERROR_CODE,
} from '../transport/http/responses.js';
import { INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE } from './meta.js';
import { UNSUPPORTED_PROTOCOL_VERSION_CODE } from './discovery.js';
import { HEADER_MISMATCH_CODE } from '../transport/http/headers.js';
import { isNotification } from './messages.js';

// ─── Codes owned by concurrent-wave feature modules (expressed as DATA) ─────────

/**
 * The legacy MCP "Resource not found" error code literal, `-32002`. (§22.4)
 *
 * In §22's registry a `resources/read` for a non-existent URI is canonically a
 * `-32602` Invalid params condition (R-22.4-g) carrying `data.uri` (R-22.4-h);
 * the registry also recognizes this dedicated `-32002` literal that the
 * Resources feature (a concurrent wave) owns. This module does not import that
 * sibling constant — it pins the numeric literal as registry DATA so the
 * registry is complete without a forward dependency. The name is suffixed
 * `_LEGACY_` to stay collision-free with the Resources module's own bindings.
 */
export const RESOURCE_NOT_FOUND_LEGACY_CODE = -32002 as const;

// ─── Error code classification ranges (§22.2, §22.7) ────────────────────────────

/**
 * The three classes a JSON-RPC error code can fall into, per §22. The numeric
 * `code` is authoritative; this taxonomy lets a receiver reason about a code it
 * has never seen. (R-22.1-h, R-22.7-a, R-22.7-e)
 */
export const ErrorCodeClass = {
  /** The five reserved JSON-RPC pre-defined codes (`-32700`, `-32600..-32603`). */
  JSON_RPC_STANDARD: 'json-rpc-standard',
  /** MCP protocol-specific codes (`-32003`, `-32004`) — normative `data`. (§22.3) */
  MCP_PROTOCOL: 'mcp-protocol',
  /** The implementation-defined server-error range `-32000..-32099`. (§22.7) */
  SERVER_DEFINED: 'server-defined',
  /** Any integer outside every reserved/server range — extension-defined. (§22.7) */
  EXTENSION_DEFINED: 'extension-defined',
} as const;

/** One of the {@link ErrorCodeClass} values. */
export type ErrorCodeClass = (typeof ErrorCodeClass)[keyof typeof ErrorCodeClass];

/**
 * The JSON-RPC 2.0 reserved range for pre-defined errors: `-32768..-32000`
 * inclusive. Codes outside this range are available for application use.
 * (§22.2, §22.7)
 */
export const JSON_RPC_RESERVED_RANGE = { min: -32768, max: -32000 } as const;

/**
 * The implementation-defined server-error sub-range `-32000..-32099` inclusive,
 * inside the reserved range. `-32001` HeaderMismatch lives here. (§22.7, S15 §9.8)
 */
export const SERVER_ERROR_RANGE = { min: -32099, max: -32000 } as const;

/** Returns `true` when `code` lies within `[range.min, range.max]` inclusive. */
function inRange(code: number, range: { min: number; max: number }): boolean {
  return code >= range.min && code <= range.max;
}

// ─── Registry rows (§22.2, §22.3, §6.5) ─────────────────────────────────────────

/**
 * Whether a code's `data` shape is normative (fixed by the spec) or
 * sender-defined (the sender MAY attach any structure). (R-22.1-k, R-22.3-a)
 */
export type ErrorDataPolicy = 'normative' | 'sender-defined';

/** One row of the §22 error-code registry. (§6.5) */
export interface ErrorCodeRegistryEntry {
  /** The authoritative numeric code. (R-22.1-h) */
  readonly code: number;
  /** The canonical condition name (case-sensitive, exactly as in §22). (R-22-a) */
  readonly name: string;
  /** Which classification range this code belongs to. */
  readonly class: ErrorCodeClass;
  /** One-line meaning of the condition the code signals. */
  readonly meaning: string;
  /** Whether `error.data` is spec-normative or sender-defined. (R-22.1-k, R-22.3-a) */
  readonly dataPolicy: ErrorDataPolicy;
  /** The keys a normative `data` payload MUST carry, if any. (R-22.3-a) */
  readonly dataKeys?: readonly string[];
  /** The HTTP status this code maps to on the Streamable HTTP transport. (§22.6) */
  readonly httpStatus?: number;
}

/**
 * The complete §22 error-code registry, keyed by numeric code. (§6.5, §22.2,
 * §22.3) The same `code` applies on every transport; the optional `httpStatus`
 * is the Streamable HTTP mapping (§22.6). (R-22-a, R-22.2-a, R-22.3-a, R-22.6-a)
 *
 * Note that `-32602` has a single entry even though several distinct conditions
 * collapse onto it (invalid params, invalid/expired cursor, unknown tool/prompt/
 * template, resource-not-found): the code is the registry key, the specific
 * condition is conveyed by `message`/`data`. (§22.4)
 */
export const ERROR_CODE_REGISTRY: Readonly<Record<number, ErrorCodeRegistryEntry>> = {
  [PARSE_ERROR_CODE]: {
    code: PARSE_ERROR_CODE,
    name: 'Parse error',
    class: ErrorCodeClass.JSON_RPC_STANDARD,
    meaning: 'Invalid JSON was received; the byte stream could not be parsed as JSON text.',
    dataPolicy: 'sender-defined',
  },
  [INVALID_REQUEST_CODE]: {
    code: INVALID_REQUEST_CODE,
    name: 'Invalid Request',
    class: ErrorCodeClass.JSON_RPC_STANDARD,
    meaning: 'Valid JSON, but not a valid JSON-RPC request object.',
    dataPolicy: 'sender-defined',
  },
  [METHOD_NOT_FOUND_CODE]: {
    code: METHOD_NOT_FOUND_CODE,
    name: 'Method not found',
    class: ErrorCodeClass.JSON_RPC_STANDARD,
    meaning:
      'The method does not exist / is not available, including a method gated behind an unadvertised server capability.',
    dataPolicy: 'sender-defined',
  },
  [INVALID_PARAMS_CODE]: {
    code: INVALID_PARAMS_CODE,
    name: 'Invalid params',
    class: ErrorCodeClass.JSON_RPC_STANDARD,
    meaning:
      'Invalid or malformed method parameters: unknown tool/prompt/template, invalid tool arguments, missing required prompt argument, invalid/expired cursor, or resource-not-found.',
    dataPolicy: 'sender-defined',
  },
  [INTERNAL_ERROR_CODE]: {
    code: INTERNAL_ERROR_CODE,
    name: 'Internal error',
    class: ErrorCodeClass.JSON_RPC_STANDARD,
    meaning: 'An unexpected condition prevented fulfilling an otherwise well-formed request.',
    dataPolicy: 'sender-defined',
  },
  [MISSING_CLIENT_CAPABILITY_CODE]: {
    code: MISSING_CLIENT_CAPABILITY_CODE,
    name: 'MissingRequiredClientCapability',
    class: ErrorCodeClass.MCP_PROTOCOL,
    meaning: 'The request requires a client capability the client did not declare.',
    dataPolicy: 'normative',
    dataKeys: ['requiredCapabilities'],
    httpStatus: 400,
  },
  [UNSUPPORTED_PROTOCOL_VERSION_CODE]: {
    code: UNSUPPORTED_PROTOCOL_VERSION_CODE,
    name: 'UnsupportedProtocolVersion',
    class: ErrorCodeClass.MCP_PROTOCOL,
    meaning: "The request's protocol revision is unknown to or unsupported by the server.",
    dataPolicy: 'normative',
    dataKeys: ['supported', 'requested'],
    httpStatus: 400,
  },
  [RESOURCE_NOT_FOUND_LEGACY_CODE]: {
    code: RESOURCE_NOT_FOUND_LEGACY_CODE,
    name: 'Resource not found',
    class: ErrorCodeClass.MCP_PROTOCOL,
    meaning: 'A requested resource URI does not exist (carries data.uri; §22.4 also maps this to -32602).',
    dataPolicy: 'sender-defined',
    dataKeys: ['uri'],
  },
  [HEADER_MISMATCH_CODE]: {
    code: HEADER_MISMATCH_CODE,
    name: 'HeaderMismatch',
    class: ErrorCodeClass.SERVER_DEFINED,
    meaning:
      'A routing header (MCP-Protocol-Version, Mcp-Method, Mcp-Name, or a parameter header) is missing, malformed, or mismatched (Streamable HTTP transport).',
    dataPolicy: 'sender-defined',
    httpStatus: 400,
  },
};

/**
 * The reserved codes an extension-defined code MUST NOT collide with: the five
 * standard JSON-RPC codes, the two protocol-specific codes, and the `-32001`
 * HeaderMismatch transport code. (R-22.7-c, AC-34.23)
 */
export const RESERVED_ERROR_CODES: readonly number[] = [
  PARSE_ERROR_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  INVALID_PARAMS_CODE,
  INTERNAL_ERROR_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  HEADER_MISMATCH_CODE,
];

// ─── Registry lookups & classification (§6.5 helpers) ───────────────────────────

/**
 * Looks up the registry entry for `code`, or `undefined` if the code is not in
 * the §22 registry. An absent entry is not an error — receivers MUST tolerate
 * unknown codes (see {@link describeUnknownErrorCode}). (R-22.7-e)
 */
export function lookupErrorCode(code: number): ErrorCodeRegistryEntry | undefined {
  return Object.prototype.hasOwnProperty.call(ERROR_CODE_REGISTRY, code)
    ? ERROR_CODE_REGISTRY[code]
    : undefined;
}

/**
 * Classifies any integer `code` into one of the {@link ErrorCodeClass} ranges,
 * even codes not present in the registry. A registry entry's own `class` always
 * wins; otherwise the code is placed by range: the server-error sub-range
 * (`-32000..-32099`) → `SERVER_DEFINED`, any other reserved-range code →
 * `JSON_RPC_STANDARD`, and everything outside the reserved range →
 * `EXTENSION_DEFINED`. (§22.2, §22.7, R-22.7-a)
 */
export function classifyErrorCode(code: number): ErrorCodeClass {
  const entry = lookupErrorCode(code);
  if (entry) {
    return entry.class;
  }
  if (inRange(code, SERVER_ERROR_RANGE)) {
    return ErrorCodeClass.SERVER_DEFINED;
  }
  if (inRange(code, JSON_RPC_RESERVED_RANGE)) {
    return ErrorCodeClass.JSON_RPC_STANDARD;
  }
  return ErrorCodeClass.EXTENSION_DEFINED;
}

/** Returns `true` when `code` is one of the eight reserved codes. (R-22.7-c) */
export function isReservedErrorCode(code: number): boolean {
  return RESERVED_ERROR_CODES.includes(code);
}

/**
 * Validates that `code` is a legal extension-defined error code: an integer
 * that does not collide with any reserved code. (R-22.7-a, R-22.7-b, R-22.7-c)
 *
 * Returns `{ ok: true }` when usable; otherwise `{ ok: false, reason }`
 * explaining the violation. Extensions SHOULD additionally carry structured
 * `data` (R-22.7-d) — that is a payload concern, not enforced here.
 */
export function validateExtensionErrorCode(
  code: number,
): { ok: true } | { ok: false; reason: 'not-an-integer' | 'collides-with-reserved' } {
  if (!Number.isInteger(code)) {
    return { ok: false, reason: 'not-an-integer' };
  }
  if (isReservedErrorCode(code)) {
    return { ok: false, reason: 'collides-with-reserved' };
  }
  return { ok: true };
}

/**
 * Validates that `code` is allowed for the given classification — used to check
 * a value sits in its intended range. For `SERVER_DEFINED`, the code MUST lie in
 * `-32000..-32099`; for `EXTENSION_DEFINED`, it MUST be a non-reserved integer
 * outside the reserved range; for the standard/protocol classes, it MUST be the
 * corresponding registered code. (§22.2, §22.7)
 */
export function isErrorCodeInClass(code: number, cls: ErrorCodeClass): boolean {
  if (!Number.isInteger(code)) {
    return false;
  }
  switch (cls) {
    case ErrorCodeClass.SERVER_DEFINED:
      return inRange(code, SERVER_ERROR_RANGE);
    case ErrorCodeClass.EXTENSION_DEFINED:
      return !isReservedErrorCode(code) && !inRange(code, JSON_RPC_RESERVED_RANGE);
    case ErrorCodeClass.JSON_RPC_STANDARD:
    case ErrorCodeClass.MCP_PROTOCOL:
      return classifyErrorCode(code) === cls;
  }
}

// ─── Error object shape (§22.1, canonical Error from §3.8 / S04) ─────────────────

/**
 * The canonical JSON-RPC `error` object. (§22.1 / §3.8) `code` is REQUIRED and
 * MUST be an integer (it MAY be negative); `message` is REQUIRED and is a short
 * human-readable description; `data` is OPTIONAL. (R-22.1-c, R-22.1-h, R-22.1-i,
 * R-22.1-k)
 */
export interface JsonRpcErrorObject {
  /** The authoritative numeric condition code. (R-22.1-h) */
  code: number;
  /** Short, human-readable description — informational only. (R-22.1-i, R-22.1-j) */
  message: string;
  /** Optional additional information; normative for `-32003`/`-32004`. (R-22.1-k) */
  data?: unknown;
}

/**
 * The JSON-RPC version marker every error response MUST carry. (R-22.1-d)
 * Re-stated here for validation; the envelope itself is owned by S03.
 */
export const JSONRPC_VERSION = '2.0' as const;

/**
 * A JSON-RPC id is a string or an integer; an error response answering an
 * undeterminable request MAY use `null` (or omit the field). (§22.1, §22.6)
 */
export type JsonRpcId = string | number;

/**
 * The error response envelope, restated for reference (owned by S03 / §3.5.2).
 * Carries an `error` in place of a `result`. `id` is normally REQUIRED and MUST
 * equal the answered request's id; it MAY be `null`/omitted only when the
 * request id could not be determined. (R-22.1-a, R-22.1-b, R-22.1-d, R-22.1-f)
 */
export interface JsonRpcErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  /** Echoes the request id; `null` only when the id is undeterminable. (§22.6) */
  id?: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

/** Returns `true` for a non-null, non-array object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the canonical error-object shape: `code` present and an integer
 * (possibly negative), `message` present and a string, `data` optional.
 * (R-22.1-c, R-22.1-h, R-22.1-i, R-22.1-k, AC-34.6)
 */
export function isValidErrorObject(value: unknown): value is JsonRpcErrorObject {
  if (!isPlainObject(value)) {
    return false;
  }
  return Number.isInteger(value['code']) && typeof value['message'] === 'string';
}

/**
 * Validates a single response object's mutual-exclusion invariant: it MUST
 * carry exactly one of `result` or `error` — never both, never neither.
 * (R-22.1-a, AC-34.1) The exactly-one-of rule and the envelope shape are owned
 * by S03; this is the §22 view used to reject a non-conformant error response.
 */
export function hasExactlyResultOrError(response: unknown): boolean {
  if (!isPlainObject(response)) {
    return false;
  }
  const hasResult = 'result' in response;
  const hasError = 'error' in response;
  return hasResult !== hasError;
}

/**
 * Validates an error response envelope per §22.1/§22.6: `jsonrpc` is exactly
 * `"2.0"`, it carries a valid `error` object and no `result`, and `id` — when
 * present — is a string, an integer, or `null`. (R-22.1-a, R-22.1-d, R-22.6-g,
 * R-22.6-h, AC-34.1, AC-34.2, AC-34.3, AC-34.4)
 *
 * This validates structure only; whether the `id` *matches* a specific request
 * is the caller's correlation concern (S03).
 */
export function isValidErrorResponse(value: unknown): value is JsonRpcErrorResponse {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value['jsonrpc'] !== JSONRPC_VERSION) {
    return false;
  }
  if (!('error' in value) || 'result' in value) {
    return false;
  }
  if (!isValidErrorObject(value['error'])) {
    return false;
  }
  if ('id' in value) {
    const id = value['id'];
    const idOk = id === null || typeof id === 'string' || Number.isInteger(id);
    if (!idOk) {
      return false;
    }
  }
  return true;
}

/**
 * Returns `true` when a message MUST NOT receive any response — a JSON-RPC
 * notification, i.e. an object carrying `method` and no `id`. Notifications
 * never receive a response, error or otherwise. (R-22.1-g, R-22.6-i, AC-34.5)
 *
 * Reuses the canonical {@link isNotification} predicate from S01's messages
 * module (the same binding, never redefined); this wrapper only narrows an
 * arbitrary `unknown` to the object form that predicate expects.
 */
export function suppressesErrorResponse(message: unknown): boolean {
  return isPlainObject(message) && isNotification(message);
}

// ─── Error object builders (§22) ────────────────────────────────────────────────

/**
 * Builds a canonical error object with the authoritative `code`, a
 * human-readable `message`, and optional `data`. (R-22.1-c, R-22.1-i, R-22.1-k)
 * When `message` is omitted, the registry's condition name is used (the
 * registry default), so the resulting object always has a non-empty message.
 */
export function buildErrorObject(
  code: number,
  message?: string,
  data?: unknown,
): JsonRpcErrorObject {
  const resolvedMessage = message ?? lookupErrorCode(code)?.name ?? 'Error';
  const error: JsonRpcErrorObject = { code, message: resolvedMessage };
  if (data !== undefined) {
    error.data = data;
  }
  return error;
}

/**
 * Builds a `-32602` Invalid params resource-not-found error whose `data`
 * includes the requested `uri`, per the §22.4 canonical mapping. (R-22.4-g,
 * R-22.4-h, AC-34.15, AC-34.16) A non-existent resource MUST be signaled this
 * way and MUST NOT be signaled by an empty `contents` array. (R-22.4-i)
 *
 * @param uri     - The requested resource URI that was not found.
 * @param message - Optional override; defaults to `"Resource not found"`.
 */
export function buildResourceNotFoundParamsError(
  uri: string,
  message = 'Resource not found',
): JsonRpcErrorObject & { data: { uri: string } } {
  return { code: INVALID_PARAMS_CODE, message, data: { uri } };
}

/**
 * Surfaces an error response carrying a code the receiver does not recognize.
 * Per R-22.7-e a receiver MUST treat an unknown code as a failed request and
 * surface it using `error.message` and `error.data`, NOT reject it as
 * malformed. Returns a plain descriptor a caller can log or propagate. (AC-34.24)
 *
 * @param error - The (well-formed) error object with an unrecognized `code`.
 */
export function describeUnknownErrorCode(error: JsonRpcErrorObject): {
  failed: true;
  code: number;
  class: ErrorCodeClass;
  message: string;
  data?: unknown;
} {
  const descriptor: {
    failed: true;
    code: number;
    class: ErrorCodeClass;
    message: string;
    data?: unknown;
  } = {
    failed: true,
    code: error.code,
    class: classifyErrorCode(error.code),
    message: error.message,
  };
  if (error.data !== undefined) {
    descriptor.data = error.data;
  }
  return descriptor;
}

// ─── Protocol error vs. feature-level error result (§22.5) ──────────────────────

/**
 * The two distinct mechanisms for reporting that something went wrong with a
 * `tools/call`. Choosing the correct one is a MUST. (R-22.5-a, AC-34.18)
 */
export const ToolFailureMechanism = {
  /** A JSON-RPC `error` (`-32602`): the request could not be dispatched. (R-22.5-c) */
  PROTOCOL_ERROR: 'protocol-error',
  /** A successful `result` with `isError: true`: the tool ran but failed. (R-22.5-b) */
  ERROR_RESULT: 'error-result',
} as const;

/** One of the {@link ToolFailureMechanism} values. */
export type ToolFailureMechanism =
  (typeof ToolFailureMechanism)[keyof typeof ToolFailureMechanism];

/**
 * The situations a `tools/call` failure can arise from, used to pick the
 * reporting mechanism. (§22.5)
 */
export type ToolCallFailureSituation =
  /** Tool name not exposed by the server. (R-22.5-c) */
  | 'unknown-tool'
  /** Arguments fail the tool's declared input schema. (R-22.5-c) */
  | 'invalid-arguments'
  /** The tool was dispatched and ran, but its work failed. (R-22.5-d) */
  | 'execution-failure';

/**
 * Decides whether a `tools/call` failure is reported as a JSON-RPC protocol
 * error (`-32602`) or as a successful result with `isError: true`. (R-22.5-a,
 * R-22.5-b, R-22.5-c, R-22.5-d, R-22.5-e, R-22.5-f, AC-34.18)
 *
 * Undispatchable / schema-invalid requests (`unknown-tool`, `invalid-arguments`)
 * are PROTOCOL errors and MUST never produce `isError: true` (R-22.5-f); a tool
 * that ran and failed (`execution-failure`) is an ERROR RESULT and MUST never
 * produce a JSON-RPC error (R-22.5-e). The mapping is total and never the
 * reverse.
 */
export function classifyToolCallFailure(
  situation: ToolCallFailureSituation,
): ToolFailureMechanism {
  switch (situation) {
    case 'unknown-tool':
    case 'invalid-arguments':
      return ToolFailureMechanism.PROTOCOL_ERROR;
    case 'execution-failure':
      return ToolFailureMechanism.ERROR_RESULT;
  }
}

// ─── Transport error / HTTP status mapping (§22.6) ──────────────────────────────

/**
 * Maps an error `code` to the Streamable HTTP status it MUST ride on. (§22.6,
 * AC-34.19, AC-34.20) `-32003`/`-32004` (negotiation) and `-32001`
 * (HeaderMismatch) all map to `400 Bad Request` (R-22.6-a, R-22.6-b); codes the
 * registry does not pin to a status return `undefined`. The numeric `code` is
 * the same on every transport — this only supplies the HTTP overlay. (R-22-a)
 */
export function httpStatusForRegistryCode(code: number): number | undefined {
  return lookupErrorCode(code)?.httpStatus;
}

/**
 * The stage at which an inbound message failed validation, used to select the
 * authoritative `error.code` per the §22.6 classification pipeline. (§22.6)
 */
export type InboundFailureStage =
  /** Bytes were not parseable as JSON. → `-32700` (R-22.6-e) */
  | 'unparseable-json'
  /** Parsed JSON is not a valid request object (and not a routing failure). → `-32600` (R-22.6-c, R-22.6-f) */
  | 'invalid-request-object'
  /** A routing header is missing/malformed/mismatched (HTTP). → `-32001` (R-22.6-b) */
  | 'routing-header'
  /** Required per-request metadata is missing/invalid. → `-32602` (R-22.6-d) */
  | 'invalid-metadata';

/**
 * Selects the authoritative `error.code` for a failed-inbound-message stage,
 * per the §22.6 transport mapping. (R-22.6-b, R-22.6-c, R-22.6-d, R-22.6-e,
 * R-22.6-f, AC-34.21, AC-34.22)
 *
 *   - `unparseable-json`      → `-32700` Parse error
 *   - `invalid-request-object`→ `-32600` Invalid Request
 *   - `routing-header`        → `-32001` HeaderMismatch (HTTP transport)
 *   - `invalid-metadata`      → `-32602` Invalid params
 */
export function errorCodeForInboundFailure(stage: InboundFailureStage): number {
  switch (stage) {
    case 'unparseable-json':
      return PARSE_ERROR_CODE;
    case 'invalid-request-object':
      return INVALID_REQUEST_CODE;
    case 'routing-header':
      return HEADER_MISMATCH_CODE;
    case 'invalid-metadata':
      return INVALID_PARAMS_CODE;
  }
}

/**
 * Builds the `id`-less / `null`-id parse-error response for unparseable input,
 * the one circumstance in which an error response's `id` need not match a
 * request id. (R-22.1-f, R-22.6-h, AC-34.4) The transport structurally requires
 * a value, so `id` is sent as `null`.
 */
export function buildNullIdParseErrorResponse(message = 'Parse error'): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: null,
    error: { code: PARSE_ERROR_CODE, message },
  };
}
