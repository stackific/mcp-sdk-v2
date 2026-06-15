/**
 * S14 — Streamable HTTP request framing, headers & routing (§9.1–§9.4).
 *
 * The request half of the Streamable HTTP transport: each client message is one
 * HTTP `POST` to the single MCP endpoint, carrying exactly one JSON-RPC request
 * or notification (UTF-8, never a batch, never a response). Selected body fields
 * are mirrored into headers so intermediaries route without parsing the body;
 * the body is the single source of truth and any disagreeing header is rejected
 * with `-32001` (`HeaderMismatch`).
 *
 * This module provides the header constants, case-insensitive header access,
 * POST-header construction, body-framing validation, and the server-side
 * validators for the required headers (`Content-Type`, `Accept`,
 * `MCP-Protocol-Version`) and routing headers (`Mcp-Method`, `Mcp-Name`),
 * plus the notification-acceptance response shape.
 *
 * The `-32004` (`UnsupportedProtocolVersion`) builder is reused from S09; the
 * full `-32001` (`HeaderMismatch`) error object is owned by S15 — this story
 * only emits the code, defined here as `HEADER_MISMATCH_CODE`.
 */

import { classifyMessage, MalformedMessageError } from '../../jsonrpc/framing.js';
import { MCP_PROTOCOL_VERSION_HEADER } from '../../protocol/revision.js';
import {
  buildUnsupportedProtocolVersionError,
  type UnsupportedProtocolVersionError,
} from '../../protocol/negotiation.js';

export { MCP_PROTOCOL_VERSION_HEADER } from '../../protocol/revision.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** HTTP method every client message uses. (R-9.2-b) */
export const MCP_ENDPOINT_HTTP_METHOD = 'POST';
export const CONTENT_TYPE_HEADER = 'Content-Type';
export const ACCEPT_HEADER = 'Accept';
export const MCP_METHOD_HEADER = 'Mcp-Method';
export const MCP_NAME_HEADER = 'Mcp-Name';
/** Prefix for one-per-annotated-parameter headers, e.g. `Mcp-Param-Region`. */
export const MCP_PARAM_HEADER_PREFIX = 'Mcp-Param-';

/** Required `Content-Type` value. (R-9.3.1-a) */
export const CONTENT_TYPE_JSON = 'application/json';
/** The two media types `Accept` MUST list. (R-9.3.2-b) */
export const ACCEPT_MEDIA_TYPES = ['application/json', 'text/event-stream'] as const;

/** `HeaderMismatch` JSON-RPC error code (full object owned by S15). (§9.8) */
export const HEADER_MISMATCH_CODE = -32001;
/** HTTP status for an accepted notification. (R-9.2-g) */
export const NOTIFICATION_ACCEPTED_STATUS = 202;
/** HTTP status for every header/version rejection in this story. (§9.3–§9.4) */
export const BAD_REQUEST_STATUS = 400;

/** The methods that carry an `Mcp-Name` routing header. (R-9.4.2-a) */
export const MCP_NAME_METHODS = new Set(['tools/call', 'resources/read', 'prompts/get'] as const);

// ─── Header access (case-insensitive names) ────────────────────────────────────

/** A bag of HTTP headers keyed by field name (names compared case-insensitively). */
export type HttpHeaders = Record<string, string>;

/**
 * Returns the value of header `name`, matching the field name case-insensitively
 * (R-9.3-b). Returns `undefined` when absent.
 */
export function getHeader(headers: HttpHeaders, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      return headers[key];
    }
  }
  return undefined;
}

/** Returns `true` when header `name` is present (case-insensitive). */
export function hasHeader(headers: HttpHeaders, name: string): boolean {
  return getHeader(headers, name) !== undefined;
}

/** Returns `true` when `name` is an `Mcp-Param-*` header (case-insensitive). */
export function isParamHeader(name: string): boolean {
  return name.toLowerCase().startsWith(MCP_PARAM_HEADER_PREFIX.toLowerCase());
}

// ─── Rejections ────────────────────────────────────────────────────────────────

/** A rejected POST: HTTP `400` plus a JSON-RPC error to put in the body. */
export interface HttpRejection {
  status: typeof BAD_REQUEST_STATUS;
  error: { code: number; message: string; data?: unknown };
}

/** Outcome of a header/body validator. */
export type HttpValidation = { ok: true } | { ok: false; rejection: HttpRejection };

/** Builds a `HeaderMismatch` (`-32001`) rejection (HTTP `400`). (§9.3–§9.4) */
export function buildHeaderMismatch(message = 'Header does not match request body'): HttpRejection {
  return { status: BAD_REQUEST_STATUS, error: { code: HEADER_MISMATCH_CODE, message } };
}

const reject = (rejection: HttpRejection): HttpValidation => ({ ok: false, rejection });
const OK: HttpValidation = { ok: true };

// ─── Routing-name resolution ───────────────────────────────────────────────────

/** Returns `true` when `method` carries an `Mcp-Name` header. (R-9.4.2-a, R-9.4.2-e) */
export function methodRequiresMcpName(method: string): boolean {
  return MCP_NAME_METHODS.has(method as never);
}

/**
 * Returns the routing-name value for `method` from its `params`, or `undefined`
 * when the method carries no `Mcp-Name`. (R-9.4.2-b/c/d)
 *
 *   - `tools/call`, `prompts/get` → `params.name`
 *   - `resources/read`           → `params.uri`
 */
export function routingNameFor(method: string, params: Record<string, unknown> | undefined): string | undefined {
  if (!methodRequiresMcpName(method) || params === undefined) return undefined;
  const field = method === 'resources/read' ? 'uri' : 'name';
  const value = params[field];
  return typeof value === 'string' ? value : undefined;
}

// ─── POST header construction (client) ─────────────────────────────────────────

/** Inputs to {@link buildPostHeaders}. */
export interface BuildPostHeadersOptions {
  /** The protocol revision; also present in the body `_meta`. (R-9.3.3-a) */
  protocolVersion: string;
  /** The JSON-RPC `method`; mirrored into `Mcp-Method`. (R-9.4.1-a) */
  method: string;
  /** The body `params`, used to derive `Mcp-Name` for targeted methods. */
  params?: Record<string, unknown>;
  /** Pre-built `Mcp-Param-*` headers (see param-headers.ts). */
  paramHeaders?: Record<string, string>;
}

/**
 * Builds the HTTP headers for a client POST: the three required request headers,
 * the `Mcp-Method` routing header, the conditional `Mcp-Name`, and any
 * `Mcp-Param-*` headers. (§9.2-f, §9.3, §9.4)
 */
export function buildPostHeaders(options: BuildPostHeadersOptions): HttpHeaders {
  const headers: HttpHeaders = {
    [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
    [ACCEPT_HEADER]: ACCEPT_MEDIA_TYPES.join(', '),
    [MCP_PROTOCOL_VERSION_HEADER]: options.protocolVersion,
    [MCP_METHOD_HEADER]: options.method,
  };
  const name = routingNameFor(options.method, options.params);
  if (name !== undefined) {
    headers[MCP_NAME_HEADER] = name;
  }
  if (options.paramHeaders) {
    Object.assign(headers, options.paramHeaders);
  }
  return headers;
}

// ─── Body framing (server) ─────────────────────────────────────────────────────

/** Outcome of {@link validatePostBodyFraming}. */
export type BodyFramingResult =
  | { ok: true; kind: 'request' | 'notification' }
  | { ok: false; reason: string };

/**
 * Validates that a POST body is exactly one JSON-RPC request or notification —
 * never a batch (array), never a response, never malformed. (R-9.1-b, R-9.2-c,
 * R-9.2-d, R-9.2-e)
 *
 * UTF-8 well-formedness (R-9.1-a) is enforced upstream by the transport decode
 * layer (`decodeMessageUnit`, S12); this operates on the already-parsed value.
 */
export function validatePostBodyFraming(body: unknown): BodyFramingResult {
  let classified;
  try {
    classified = classifyMessage(body);
  } catch (e) {
    const reason = e instanceof MalformedMessageError ? e.message : 'malformed message';
    return { ok: false, reason };
  }
  if (classified.kind === 'request' || classified.kind === 'notification') {
    return { ok: true, kind: classified.kind };
  }
  // A client MUST NOT send a JSON-RPC response to the server. (R-9.2-d)
  return { ok: false, reason: 'body must be a JSON-RPC request or notification, not a response' };
}

// ─── Required request headers (server) ─────────────────────────────────────────

/** Validates `Content-Type: application/json`. (R-9.3.1-a) */
export function validateContentType(headers: HttpHeaders): HttpValidation {
  const value = getHeader(headers, CONTENT_TYPE_HEADER);
  // Tolerate parameters like "application/json; charset=utf-8" by comparing the media type.
  const mediaType = value?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== CONTENT_TYPE_JSON) {
    return reject(buildHeaderMismatch(`Content-Type must be ${CONTENT_TYPE_JSON}`));
  }
  return OK;
}

/** Validates the HTTP method is `POST`. (R-9.2-a, R-9.2-b) */
export function validateHttpMethod(method: string): HttpValidation {
  if (method.toUpperCase() !== MCP_ENDPOINT_HTTP_METHOD) {
    return reject(buildHeaderMismatch(`HTTP method must be ${MCP_ENDPOINT_HTTP_METHOD}`));
  }
  return OK;
}

/** Validates `Accept` lists both `application/json` and `text/event-stream`. (R-9.3.2-a, R-9.3.2-b) */
export function validateAccept(headers: HttpHeaders): HttpValidation {
  const value = getHeader(headers, ACCEPT_HEADER)?.toLowerCase() ?? '';
  const listed = value.split(',').map((p) => p.split(';')[0]!.trim());
  const hasBoth = ACCEPT_MEDIA_TYPES.every((m) => listed.includes(m));
  if (!hasBoth) {
    return reject(buildHeaderMismatch(`Accept must list ${ACCEPT_MEDIA_TYPES.join(' and ')}`));
  }
  return OK;
}

// ─── MCP-Protocol-Version header (server) ──────────────────────────────────────

/** Options for {@link validateProtocolVersionHeader}. */
export interface ProtocolVersionValidationOptions {
  /** The protocol revisions this server implements. */
  supportedVersions: readonly string[];
  /**
   * When `true`, a request that omits the `MCP-Protocol-Version` header is
   * treated as the earliest revision that predates the header rather than being
   * rejected. (R-9.3.3-c) Defaults to `false` (reject absent header).
   */
  supportsPreHeaderClients?: boolean;
  /** The revision assumed for a header-less request when the above is `true`. */
  earliestRevision?: string;
}

/** Outcome of {@link validateProtocolVersionHeader}. */
export type ProtocolVersionResult =
  | { ok: true; version: string }
  | { ok: false; rejection: HttpRejection };

/** Reads the body `_meta` protocol-version field, or `undefined`. */
function bodyProtocolVersion(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const params = (body as Record<string, unknown>)['params'];
  if (typeof params !== 'object' || params === null) return undefined;
  const meta = (params as Record<string, unknown>)['_meta'];
  if (typeof meta !== 'object' || meta === null) return undefined;
  const v = (meta as Record<string, unknown>)['io.modelcontextprotocol/protocolVersion'];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Validates the `MCP-Protocol-Version` header against the body and the server's
 * supported revisions. (§9.3.3)
 *
 *   - Absent header → reject `400` + `-32001`, unless `supportsPreHeaderClients`
 *     is set, in which case the request is treated as `earliestRevision`.
 *     (R-9.3.3-b, R-9.3.3-c)
 *   - Header ≠ body `_meta` protocolVersion → reject `400` + `-32001`. (R-9.3.3-d)
 *   - Header valid but revision unimplemented → reject `400` + `-32004`
 *     (`UnsupportedProtocolVersion`) naming `supported`/`requested`. (R-9.3.3-e)
 */
export function validateProtocolVersionHeader(
  headers: HttpHeaders,
  body: unknown,
  options: ProtocolVersionValidationOptions,
): ProtocolVersionResult {
  const header = getHeader(headers, MCP_PROTOCOL_VERSION_HEADER);

  if (header === undefined) {
    if (options.supportsPreHeaderClients && options.earliestRevision !== undefined) {
      return { ok: true, version: options.earliestRevision };
    }
    return {
      ok: false,
      rejection: buildHeaderMismatch(`${MCP_PROTOCOL_VERSION_HEADER} header is required`),
    };
  }

  const bodyVersion = bodyProtocolVersion(body);
  if (bodyVersion !== undefined && header !== bodyVersion) {
    return {
      ok: false,
      rejection: buildHeaderMismatch(
        `${MCP_PROTOCOL_VERSION_HEADER} "${header}" does not match body _meta protocolVersion "${bodyVersion}"`,
      ),
    };
  }

  if (!options.supportedVersions.includes(header)) {
    const error: UnsupportedProtocolVersionError = buildUnsupportedProtocolVersionError(
      header,
      options.supportedVersions,
    );
    return { ok: false, rejection: { status: BAD_REQUEST_STATUS, error } };
  }

  return { ok: true, version: header };
}

// ─── Routing headers (server) ──────────────────────────────────────────────────

/**
 * Validates the `Mcp-Method` and `Mcp-Name` routing headers against the body.
 * (§9.4)
 *
 *   - `Mcp-Method` REQUIRED on every POST and MUST equal the body `method`
 *     verbatim, case-sensitively. (R-9.4-a, R-9.4.1-a)
 *   - `Mcp-Name` REQUIRED on `tools/call`/`prompts/get` (= `params.name`) and
 *     `resources/read` (= `params.uri`), and MUST NOT appear on other methods.
 *     (R-9.4.2-a–e)
 *   - Any mismatch or missing required routing header → `400` + `-32001`.
 *     (R-9.4.3-a)
 */
export function validateRoutingHeaders(headers: HttpHeaders, body: unknown): HttpValidation {
  if (typeof body !== 'object' || body === null) {
    return reject(buildHeaderMismatch('request body is not an object'));
  }
  const method = (body as Record<string, unknown>)['method'];
  if (typeof method !== 'string') {
    return reject(buildHeaderMismatch('request body has no method'));
  }
  const params = (body as Record<string, unknown>)['params'] as Record<string, unknown> | undefined;

  const mcpMethod = getHeader(headers, MCP_METHOD_HEADER);
  if (mcpMethod === undefined) {
    return reject(buildHeaderMismatch(`${MCP_METHOD_HEADER} header is required`));
  }
  // Values mirroring body fields are compared exactly (case-sensitively). (R-9.3-c)
  if (mcpMethod !== method) {
    return reject(buildHeaderMismatch(`${MCP_METHOD_HEADER} "${mcpMethod}" does not match body method "${method}"`));
  }

  const mcpName = getHeader(headers, MCP_NAME_HEADER);
  if (methodRequiresMcpName(method)) {
    const expected = routingNameFor(method, params);
    if (mcpName === undefined) {
      return reject(buildHeaderMismatch(`${MCP_NAME_HEADER} header is required for ${method}`));
    }
    if (expected === undefined || mcpName !== expected) {
      return reject(
        buildHeaderMismatch(`${MCP_NAME_HEADER} "${mcpName}" does not match body for ${method}`),
      );
    }
  } else if (mcpName !== undefined) {
    // Mcp-Name MUST NOT be sent for methods without a targeted name/URI. (R-9.4.2-e)
    return reject(buildHeaderMismatch(`${MCP_NAME_HEADER} MUST NOT be sent for ${method}`));
  }

  return OK;
}

// ─── Notification response shape (server) ──────────────────────────────────────

/** The HTTP response a server returns to a posted notification. (§9.2) */
export interface NotificationHttpResponse {
  status: number;
  /** Present only on rejection; an id-less JSON-RPC error. (R-9.2-i) */
  body?: { jsonrpc: '2.0'; error: { code: number; message: string; data?: unknown } };
}

/**
 * Builds the HTTP response for a posted notification. (R-9.2-g, R-9.2-h, R-9.2-i)
 *
 *   - accepted → `202 Accepted` with no body.
 *   - rejected → an HTTP error status (default `400`); the body, if present, is
 *     a JSON-RPC error response with the `id` omitted.
 */
export function notificationHttpResponse(
  accepted: boolean,
  rejection?: { status?: number; error: { code: number; message: string; data?: unknown } },
): NotificationHttpResponse {
  if (accepted) {
    return { status: NOTIFICATION_ACCEPTED_STATUS };
  }
  return {
    status: rejection?.status ?? BAD_REQUEST_STATUS,
    body: rejection ? { jsonrpc: '2.0', error: rejection.error } : undefined,
  };
}
