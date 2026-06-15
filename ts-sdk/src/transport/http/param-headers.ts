/**
 * S14 — Tool parameters surfaced as `Mcp-Param-*` headers (§9.5).
 *
 * A server MAY annotate `inputSchema` parameters with `x-mcp-header` to mirror
 * them into request headers; clients on this transport MUST support it. This
 * module covers:
 *   - `x-mcp-header` annotation validity (§9.5.1) and client rejection of
 *     invalid tools (§9.5.1) — keeping other tools usable.
 *   - client emission of `Mcp-Param-{name}` headers from a tool's schema and the
 *     call arguments (§9.5.2), with value encoding (param-encoding.ts).
 *   - receiver validation of those headers against the body (§9.5.4), including
 *     numeric comparison of integers.
 */

import {
  getHeader,
  MCP_PARAM_HEADER_PREFIX,
  buildHeaderMismatch,
  type HttpHeaders,
  type HttpValidation,
} from './headers.js';
import {
  encodeHeaderValue,
  decodeHeaderValue,
  isSentinelEncoded,
  isAnnotatedIntegerInRange,
  plainStringForm,
} from './param-encoding.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** HTTP field-name token: `1*tchar` (RFC 7230). Excludes control chars and CR/LF. */
const TCHAR_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** The JSON primitive types an `x-mcp-header` annotation may decorate. (R-9.5.1-e) */
const ANNOTATABLE_TYPES = new Set(['integer', 'string', 'boolean']);

/** Reads the value at a property `path` from `args`, or `undefined`. */
function readPath(args: Record<string, unknown>, path: readonly string[]): unknown {
  let cur: unknown = args;
  for (const key of path) {
    if (!isObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

// ─── Annotation collection ─────────────────────────────────────────────────────

/** One `x-mcp-header`-annotated parameter discovered in an `inputSchema`. */
export interface AnnotatedParam {
  /** The raw `x-mcp-header` value (the name portion). */
  rawName: unknown;
  /** The annotated property's declared JSON `type`, if any. */
  type: string | undefined;
  /** The property path from the schema root (object nesting only). */
  path: string[];
  /** `true` when the annotation sits under an array `items` subschema. */
  underArray: boolean;
}

/** Recursively collects every `x-mcp-header`-annotated subschema. (R-9.5.1-h) */
function collectAnnotations(
  schema: unknown,
  path: string[],
  underArray: boolean,
  out: AnnotatedParam[],
): void {
  if (!isObject(schema)) return;

  if ('x-mcp-header' in schema) {
    out.push({
      rawName: schema['x-mcp-header'],
      type: typeof schema['type'] === 'string' ? (schema['type'] as string) : undefined,
      path,
      underArray,
    });
  }

  const props = schema['properties'];
  if (isObject(props)) {
    for (const [key, sub] of Object.entries(props)) {
      collectAnnotations(sub, [...path, key], underArray, out);
    }
  }
  const items = schema['items'];
  if (isObject(items)) {
    collectAnnotations(items, path, true, out);
  }
}

/** Collects all `x-mcp-header` annotations from an `inputSchema`. */
export function collectXMcpHeaders(inputSchema: unknown): AnnotatedParam[] {
  const out: AnnotatedParam[] = [];
  collectAnnotations(inputSchema, [], false, out);
  return out;
}

// ─── Annotation-name validity (§9.5.1) ─────────────────────────────────────────

/** Outcome of validating a single `x-mcp-header` name. */
export type XMcpHeaderNameResult = { valid: true } | { valid: false; reason: string };

/**
 * Validates one `x-mcp-header` name against §9.5.1: non-empty (R-9.5.1-a),
 * `1*tchar` (R-9.5.1-b), and free of control characters including CR/LF
 * (R-9.5.1-c, subsumed by the token grammar).
 */
export function validateXMcpHeaderName(name: unknown): XMcpHeaderNameResult {
  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, reason: 'x-mcp-header MUST be a non-empty string' };
  }
  if (!TCHAR_RE.test(name)) {
    return { valid: false, reason: `x-mcp-header "${name}" is not a valid 1*tchar token` };
  }
  return { valid: true };
}

// ─── Tool validity (§9.5.1) ────────────────────────────────────────────────────

/** A tool definition with an optional `inputSchema`. */
export interface ToolDefinition {
  name: string;
  inputSchema?: unknown;
  [key: string]: unknown;
}

/** Outcome of validating a tool's `x-mcp-header` annotations. */
export type ToolValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Validates every `x-mcp-header` annotation in a tool's `inputSchema`. (§9.5.1)
 *
 * Checks each annotation's name (R-9.5.1-a/b/c), that the annotated parameter's
 * type is a primitive `integer`/`string`/`boolean` (R-9.5.1-e) and not `number`
 * (R-9.5.1-f), and that all names are case-insensitively unique within the
 * schema (R-9.5.1-d). Annotations at any nesting depth are accepted (R-9.5.1-h).
 */
export function validateToolXMcpHeaders(tool: ToolDefinition): ToolValidationResult {
  const annotations = collectXMcpHeaders(tool.inputSchema);
  const seen = new Set<string>();

  for (const ann of annotations) {
    const nameResult = validateXMcpHeaderName(ann.rawName);
    if (!nameResult.valid) {
      return { valid: false, reason: nameResult.reason };
    }
    const lower = (ann.rawName as string).toLowerCase();
    if (seen.has(lower)) {
      return { valid: false, reason: `duplicate x-mcp-header "${ann.rawName as string}" (case-insensitive)` };
    }
    seen.add(lower);

    if (ann.type === undefined || !ANNOTATABLE_TYPES.has(ann.type)) {
      return {
        valid: false,
        reason: `x-mcp-header "${ann.rawName as string}" must annotate an integer/string/boolean parameter, not "${ann.type ?? 'unknown'}"`,
      };
    }
  }
  return { valid: true };
}

/** A tool rejected by {@link filterValidTools}, with the reason for logging. */
export interface RejectedTool {
  tool: string;
  reason: string;
}

/** Result of filtering tools: the usable ones plus warnings about rejected ones. */
export interface FilterToolsResult {
  tools: ToolDefinition[];
  /** Rejected tools — the caller SHOULD log each as a warning. (R-9.5.1-k) */
  warnings: RejectedTool[];
}

/**
 * Filters a `tools/list` result, excluding only tools whose `x-mcp-header`
 * annotations are invalid and keeping all valid tools usable. (R-9.5.1-i,
 * R-9.5.1-j) The returned `warnings` name each rejected tool and the reason so
 * the caller can log them. (R-9.5.1-k)
 *
 * Clients on non-HTTP transports MAY skip this entirely (R-9.5.1-l) — it is only
 * invoked by the Streamable HTTP client.
 */
export function filterValidTools(tools: readonly ToolDefinition[]): FilterToolsResult {
  const valid: ToolDefinition[] = [];
  const warnings: RejectedTool[] = [];
  for (const tool of tools) {
    const result = validateToolXMcpHeaders(tool);
    if (result.valid) {
      valid.push(tool);
    } else {
      warnings.push({ tool: tool.name, reason: result.reason });
    }
  }
  return { tools: valid, warnings };
}

// ─── Client emission (§9.5.2) ──────────────────────────────────────────────────

/** Returns the header name for an annotated parameter. */
export function paramHeaderName(rawName: string): string {
  return `${MCP_PARAM_HEADER_PREFIX}${rawName}`;
}

/**
 * Builds the `Mcp-Param-*` headers for a `tools/call` POST from the tool's
 * `inputSchema` and the call `arguments`. (§9.5.2)
 *
 * One header per annotated parameter present in `arguments`; a parameter whose
 * value is `null` or absent is omitted (R-9.5.2-g, R-9.5.2-i); each present
 * value is encoded per §9.5.3 (R-9.5.2-c). Annotations under array `items` (no
 * single resolvable value) are skipped.
 *
 * @throws {RangeError} When an annotated integer value is out of the safe range.
 */
export function buildParamHeaders(
  inputSchema: unknown,
  args: Record<string, unknown>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const ann of collectXMcpHeaders(inputSchema)) {
    if (ann.underArray) continue;
    if (typeof ann.rawName !== 'string' || !validateXMcpHeaderName(ann.rawName).valid) continue;

    const value = readPath(args, ann.path);
    if (value === undefined || value === null) {
      continue; // omit absent/null (R-9.5.2-g, R-9.5.2-i)
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      continue; // only primitives are annotatable
    }
    headers[paramHeaderName(ann.rawName)] = encodeHeaderValue(value);
  }
  return headers;
}

// ─── Receiver validation (§9.5.4) ──────────────────────────────────────────────

/** Returns `true` when a header value contains only permissible header characters. */
function headerCharsPermissible(value: string): boolean {
  if (isSentinelEncoded(value)) return true; // pure-ASCII sentinel form is always safe
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    const safe = c === 0x09 || (c >= 0x20 && c <= 0x7e);
    if (!safe) return false;
  }
  return true;
}

/** Compares a decoded header value to a body value, numerically for integers. */
function valuesMatch(decoded: string, bodyValue: string | number | boolean, type: string | undefined): boolean {
  if (type === 'integer' || typeof bodyValue === 'number') {
    const h = Number(decoded);
    const b = Number(bodyValue);
    return Number.isFinite(h) && Number.isFinite(b) && h === b; // numeric (R-9.5.4-d)
  }
  return decoded === plainStringForm(bodyValue);
}

/**
 * Validates the `Mcp-Param-*` headers of a request against its body. (§9.5.4)
 *
 *   - A recognized header with impermissible characters → `400` + `-32001`.
 *     (R-9.5.4-b)
 *   - A header whose decoded value does not match the body value → `400` +
 *     `-32001`; integers are compared numerically. (R-9.5.4-c, R-9.5.4-d)
 *   - A body value present while its header is omitted → `400` + `-32001`.
 *     (R-9.5.2-k)
 *   - A header present while the body value is absent/null → `400` + `-32001`.
 *
 * @param inputSchema - The tool's `inputSchema` (source of annotations).
 * @param args        - The body `params.arguments`.
 * @param headers     - The request headers.
 */
export function validateParamHeaders(
  inputSchema: unknown,
  args: Record<string, unknown>,
  headers: HttpHeaders,
): HttpValidation {
  for (const ann of collectXMcpHeaders(inputSchema)) {
    if (ann.underArray) continue;
    if (typeof ann.rawName !== 'string' || !validateXMcpHeaderName(ann.rawName).valid) continue;

    const headerName = paramHeaderName(ann.rawName);
    const headerValue = getHeader(headers, headerName);
    const bodyValue = readPath(args, ann.path);
    const bodyPresent = bodyValue !== undefined && bodyValue !== null;

    if (!bodyPresent) {
      // The client MUST omit the header for null/absent values; an extra header
      // is a mismatch the body-processing receiver rejects.
      if (headerValue !== undefined) {
        return { ok: false, rejection: buildHeaderMismatch(`${headerName} present but no matching body value`) };
      }
      continue;
    }

    // Body value present → the header is REQUIRED. (R-9.5.2-k)
    if (headerValue === undefined) {
      return { ok: false, rejection: buildHeaderMismatch(`${headerName} omitted while body value is present`) };
    }
    if (!headerCharsPermissible(headerValue)) {
      return { ok: false, rejection: buildHeaderMismatch(`${headerName} contains impermissible characters`) };
    }
    if (typeof bodyValue !== 'string' && typeof bodyValue !== 'number' && typeof bodyValue !== 'boolean') {
      continue; // non-primitive body value — outside the annotation contract
    }
    const decoded = decodeHeaderValue(headerValue);
    if (!valuesMatch(decoded, bodyValue, ann.type)) {
      return { ok: false, rejection: buildHeaderMismatch(`${headerName} value does not match the request body`) };
    }
  }
  return { ok: true };
}

/**
 * An intermediary that does not process the message body MUST forward an
 * unrecognized `Mcp-Param-*` header unchanged and otherwise ignore it.
 * (R-9.5.4-a) This predicate marks such headers; intermediaries pass them
 * through without validation. Re-exported for clarity at the call site.
 */
export { isParamHeader } from './headers.js';

/** Documents that integer annotations are bounded by the safe range. (R-9.5.1-g) */
export { isAnnotatedIntegerInRange };

/**
 * The client strategy for a missing or stale `inputSchema`. (§9.5.2)
 *
 *   - With no/stale schema, the client SHOULD send the `tools/call` without
 *     custom `Mcp-Param-*` headers — {@link buildParamHeaders} returns `{}` for
 *     an absent schema. (R-9.5.2-l)
 *   - If the server rejects because required custom headers are missing, the
 *     client SHOULD call `tools/list` for the current schema and retry. (R-9.5.2-m)
 *   - A client MAY pre-load tool definitions by other means to emit headers
 *     without a prior `tools/list`. (R-9.5.2-n)
 */
export const STALE_SCHEMA_STRATEGY = {
  SEND_WITHOUT_HEADERS: 'R-9.5.2-l',
  RETRY_AFTER_TOOLS_LIST: 'R-9.5.2-m',
  MAY_PRELOAD: 'R-9.5.2-n',
} as const;
