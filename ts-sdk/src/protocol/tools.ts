/**
 * S24 — Tools I: Capability, Listing & the `Tool` type (§16.1–§16.4).
 *
 * The discovery half of MCP tools: how a server announces it offers tools, how
 * a client lists them (paginated + cacheable), the exact shape of a `Tool`
 * definition, and the normative JSON Schema rules governing a tool's
 * `inputSchema` / `outputSchema`. Calling a tool (`tools/call`), the
 * `CallToolResult`, the `isError` model, `ToolAnnotations` semantics, and the
 * `notifications/tools/list_changed` notification are deferred to S25.
 *
 * This module provides:
 *   - `ToolsCapabilitySchema` — the `tools` capability object with its optional
 *     `listChanged` sub-flag; plus the capability-gating predicates
 *     (`serverExposesTools`, `mayServerAnswerToolsList`,
 *     `mayClientSendToolsRequest`, `mayServerEmitToolsListChanged`,
 *     `mayClientExpectToolsListChanged`) layered over S10's
 *     `serverDeclares` / `mayClientInvoke` / `clientShouldExpectNotification`.
 *   - `ToolSchema` / `Tool` — the tool definition (name/title/description,
 *     `inputSchema`, `outputSchema`, `annotations`, `icons`, `_meta`), with the
 *     `inputSchema` root-`type:"object"` constraint enforced, plus name-convention
 *     and display-name helpers (`isConventionalToolName`, `toolDisplayName`,
 *     `disambiguateToolName`, `findDuplicateToolNames`).
 *   - `ListToolsRequestParamsSchema` / `ListToolsRequestSchema` and
 *     `ListToolsResultSchema` — the cursor-paginated, cacheable `tools/list`
 *     exchange (reusing S18 pagination + S19 caching fields), with
 *     `buildListToolsResult` / `buildListToolsRequest`.
 *   - JSON Schema rules for `inputSchema` / `outputSchema`: the 2020-12 default
 *     dialect (`DEFAULT_SCHEMA_DIALECT`, `schemaDialect`, `SUPPORTED_SCHEMA_DIALECTS`,
 *     `isSupportedSchemaDialect`), in-document-only `$ref` resolution
 *     (`isInDocumentRef`, `hasExternalRef`), resource bounds
 *     (`schemaNestingDepth`, `DEFAULT_SCHEMA_LIMITS`), and the unsafe-schema
 *     rejection gate (`validateToolSchema`, `assertRegistrableToolSchema`,
 *     `UnsupportedDialectError`).
 *
 * Out of scope (owned elsewhere): `tools/call` + `CallToolResult` + structured
 * content + `ToolAnnotations` field semantics + the list-changed notification
 * payload — S25 (§16.5–§16.9); generic pagination — S18 (§12); generic caching —
 * S19 (§13); `BaseMetadata` / `Icon` — S20 (§14); `_meta` rules — S05 (§4).
 */

import { z } from 'zod';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import { RequestIdSchema, type RequestId } from '../jsonrpc/framing.js';
import { CursorSchema, type Cursor } from '../protocol/pagination.js';
import { CacheScopeSchema, type CacheScope } from '../protocol/caching.js';
import { BaseMetadataSchema, resolveDisplayName } from '../types/base-metadata.js';
import { IconSchema } from '../types/icon.js';
import { MetaObjectSchema, type MetaObject } from './meta.js';
import {
  serverDeclares,
  mayClientInvoke,
  clientShouldExpectNotification,
} from './capability-negotiation.js';
import { TOOLS_LIST_CHANGED_METHOD } from './streaming.js';

// Re-export the already-existing list-changed notification method name so tools
// callers can reference it without importing from streaming.ts (same binding).
export { TOOLS_LIST_CHANGED_METHOD } from './streaming.js';

// ─── Method names ──────────────────────────────────────────────────────────────

/** Method name of the paginated tool-discovery request. (§16.2, R-16.2-a) */
export const TOOLS_LIST_METHOD = 'tools/list' as const;

/** Method name of the tool-invocation request, defined in S25; named here for gating. (§16.1) */
export const TOOLS_CALL_METHOD = 'tools/call' as const;

// ─── §16.1 The `tools` server capability ────────────────────────────────────────

/**
 * `ToolsCapability` — the value of the `tools` key inside a server's
 * capabilities object. Declares the server exposes tools and OPTIONALLY that it
 * emits list-changed notifications. (§16.1, R-16.1-a, R-16.1-b)
 *
 * `listChanged` (OPTIONAL boolean): when `true`, the server MAY emit
 * `notifications/tools/list_changed` when its tool set changes; absent or
 * `false` means it does not. `.passthrough()` preserves forward-compatible
 * additions. (Mirrors the `tools` shape in `ServerCapabilitiesSchema`, S10.)
 */
export const ToolsCapabilitySchema = z
  .object({
    /** OPTIONAL. `true` ⇒ server MAY emit `notifications/tools/list_changed`. (R-16.1-b) */
    listChanged: z.boolean().optional(),
  })
  .passthrough();

export type ToolsCapability = z.infer<typeof ToolsCapabilitySchema>;

/**
 * Returns `true` when the server's capabilities declare the `tools` capability.
 * A server that exposes tools MUST declare it during version negotiation, and
 * presence of the object means supported. (§16.1, R-16.1-a; delegates to
 * S10 `serverDeclares(caps, 'tools')`.)
 */
export function serverExposesTools(serverCaps: Record<string, unknown>): boolean {
  return serverDeclares(serverCaps, 'tools');
}

/**
 * Returns `true` when the server MAY respond to `tools/list` / `tools/call` — i.e.
 * it has declared the `tools` capability. A server MUST NOT respond otherwise.
 * (§16.1, R-16.1-c; the `tools/list` and `tools/call` methods are both gated on
 * the `tools` capability via S10's `SERVER_METHOD_CAPABILITY`.)
 *
 * @param method - `"tools/list"` or `"tools/call"`.
 */
export function mayServerAnswerToolsList(
  serverCaps: Record<string, unknown>,
  method: string = TOOLS_LIST_METHOD,
): boolean {
  if (method !== TOOLS_LIST_METHOD && method !== TOOLS_CALL_METHOD) return false;
  return serverExposesTools(serverCaps);
}

/**
 * Returns `true` when a client MAY send `tools/list` / `tools/call` to the
 * server — only when the server has declared the `tools` capability. A client
 * MUST NOT send either otherwise. (§16.1, R-16.1-d; delegates to S10
 * `mayClientInvoke`.)
 *
 * @param method - `"tools/list"` or `"tools/call"`.
 */
export function mayClientSendToolsRequest(
  serverCaps: Record<string, unknown>,
  method: string = TOOLS_LIST_METHOD,
): boolean {
  if (method !== TOOLS_LIST_METHOD && method !== TOOLS_CALL_METHOD) return false;
  return mayClientInvoke(method, serverCaps);
}

/**
 * Returns `true` when the server MAY emit `notifications/tools/list_changed` —
 * only when it declared `tools.listChanged: true`. When the flag is absent or
 * `false` the server does not emit that notification. (§16.1, R-16.1-b;
 * delegates to S10 `serverDeclares(caps, 'tools.listChanged')`.)
 */
export function mayServerEmitToolsListChanged(serverCaps: Record<string, unknown>): boolean {
  return serverDeclares(serverCaps, 'tools.listChanged');
}

/**
 * Returns `true` when a client may rely on receiving
 * `notifications/tools/list_changed`. A client MUST NOT rely on it unless the
 * server declared `tools.listChanged: true`. (§16.1, R-16.1-e; delegates to S10
 * `clientShouldExpectNotification`.)
 */
export function mayClientExpectToolsListChanged(serverCaps: Record<string, unknown>): boolean {
  return clientShouldExpectNotification(TOOLS_LIST_CHANGED_METHOD, serverCaps);
}

// ─── §16.4 JSON Schema rules for `inputSchema` / `outputSchema` ──────────────────

/**
 * The default JSON Schema dialect for `inputSchema` / `outputSchema` when no
 * explicit `$schema` keyword is present. (§16.4(1), R-16.4-a)
 */
export const DEFAULT_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema' as const;

/**
 * The schema dialects this implementation supports. Per R-16.4-u an
 * implementation SHOULD document which dialects it supports beyond the required
 * 2020-12; this set is that documented surface — here, exactly the required
 * 2020-12 dialect (and its trailing-`#` form). (R-16.4-s, R-16.4-u)
 */
export const SUPPORTED_SCHEMA_DIALECTS: ReadonlySet<string> = new Set([
  DEFAULT_SCHEMA_DIALECT,
  'https://json-schema.org/draft/2020-12/schema#',
]);

/**
 * Returns the dialect that governs a schema document: the explicit `$schema`
 * keyword when present, otherwise the default 2020-12 dialect. A document MAY
 * declare a different dialect; when present, that dialect governs interpretation.
 * (§16.4(1), R-16.4-a, R-16.4-b)
 */
export function schemaDialect(schema: Record<string, unknown>): string {
  const declared = schema['$schema'];
  return typeof declared === 'string' ? declared : DEFAULT_SCHEMA_DIALECT;
}

/** Returns `true` when `dialect` is one this implementation can validate against. (R-16.4-s, R-16.4-t) */
export function isSupportedSchemaDialect(dialect: string): boolean {
  return SUPPORTED_SCHEMA_DIALECTS.has(dialect);
}

/**
 * Returns `true` when a `$ref` / `$dynamicRef` value resolves WITHIN the same
 * schema document — i.e. it is a document-local JSON Pointer (`#`, `#/…`) or a
 * plain-name fragment anchor (`#anchor`). An absolute or relative URI that names
 * another document is NOT in-document. (§16.4(5), R-16.4-f)
 */
export function isInDocumentRef(ref: string): boolean {
  return ref === '#' || ref.startsWith('#/') || (ref.startsWith('#') && !ref.includes('/'));
}

/**
 * Walks a schema document and returns `true` when any `$ref` / `$dynamicRef`
 * targets a location OUTSIDE the document (a non-in-document reference). Such a
 * reference MUST NOT be automatically dereferenced or fetched over network or
 * file system; only in-document references are resolved. (§16.4(5), R-16.4-f,
 * R-16.4-g, R-16.4-r)
 *
 * This is a pure structural inspection: it never performs any I/O, so it cannot
 * trigger an SSRF fetch — it only reports whether an external `$ref` is present
 * so callers can reject it (R-16.4-k) rather than dereference it.
 *
 * @param node - The schema (or sub-schema) to inspect.
 * @param maxDepth - Bound on recursion depth so a pathological schema cannot
 *   exhaust the stack. (R-16.4-l, R-16.4-m)
 */
export function hasExternalRef(
  node: unknown,
  maxDepth: number = DEFAULT_SCHEMA_LIMITS.maxDepth,
): boolean {
  function walk(value: unknown, depth: number): boolean {
    if (depth > maxDepth) return false;
    if (Array.isArray(value)) {
      return value.some((v) => walk(v, depth + 1));
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      for (const key of ['$ref', '$dynamicRef'] as const) {
        const ref = obj[key];
        if (typeof ref === 'string' && !isInDocumentRef(ref)) return true;
      }
      return Object.values(obj).some((v) => walk(v, depth + 1));
    }
    return false;
  }
  return walk(node, 0);
}

/** Resource bounds an implementation MAY impose on schema processing. (§16.4(6), R-16.4-m) */
export interface SchemaLimits {
  /** Maximum nesting depth of the schema document. */
  maxDepth: number;
  /** Maximum number of object/array nodes in the schema document. */
  maxNodes: number;
}

/**
 * The default resource bounds applied when validating/registering a tool schema,
 * so processing cannot exhaust memory, stack, or CPU. (§16.4(6), R-16.4-l,
 * R-16.4-m)
 */
export const DEFAULT_SCHEMA_LIMITS: SchemaLimits = {
  maxDepth: 64,
  maxNodes: 10_000,
};

/**
 * Returns the maximum nesting depth of a schema document (objects + arrays).
 * Counting stops at `cap` so a self-referential or pathologically deep value
 * cannot exhaust the stack. (§16.4(6), R-16.4-l)
 *
 * @param node - The schema value.
 * @param cap - Hard recursion cap; the returned depth is never above this.
 */
export function schemaNestingDepth(node: unknown, cap: number = DEFAULT_SCHEMA_LIMITS.maxDepth + 1): number {
  function depthOf(value: unknown, depth: number): number {
    if (depth >= cap) return cap;
    if (Array.isArray(value)) {
      let max = depth;
      for (const v of value) max = Math.max(max, depthOf(v, depth + 1));
      return max;
    }
    if (typeof value === 'object' && value !== null) {
      let max = depth;
      for (const v of Object.values(value)) max = Math.max(max, depthOf(v, depth + 1));
      return max;
    }
    return depth;
  }
  return depthOf(node, 0);
}

/** Counts object/array nodes in a schema, stopping once `cap` is exceeded. (R-16.4-m) */
function countNodes(node: unknown, cap: number): number {
  let count = 0;
  function walk(value: unknown, depth: number): void {
    if (count > cap || depth > cap) return;
    if (Array.isArray(value)) {
      count += 1;
      for (const v of value) walk(v, depth + 1);
    } else if (typeof value === 'object' && value !== null) {
      count += 1;
      for (const v of Object.values(value)) walk(v, depth + 1);
    }
  }
  walk(node, 0);
  return count;
}

/**
 * Error thrown / reported when a tool schema declares a dialect this
 * implementation does not support. The implementation MUST handle an unsupported
 * dialect gracefully by signalling an error rather than silently ignoring the
 * declaration or treating the schema as permissive. (§16.4(9), R-16.4-t)
 */
export class UnsupportedDialectError extends Error {
  constructor(public readonly dialect: string) {
    super(`Unsupported JSON Schema dialect: ${dialect}`);
    this.name = 'UnsupportedDialectError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Which schema slot is being validated — governs the root-`type` rule. */
export type SchemaRole = 'input' | 'output';

/** Discriminated outcome of {@link validateToolSchema}. */
export type ToolSchemaValidation =
  | { ok: true; dialect: string }
  | { ok: false; reason: string };

/**
 * Validates a tool's `inputSchema` or `outputSchema` against the §16.4 rules,
 * WITHOUT performing any network or file-system retrieval. Returns a structured
 * result rather than throwing, so callers can reject-or-refuse-registration.
 * (§16.4, R-16.4-d, R-16.4-e, R-16.4-f, R-16.4-g, R-16.4-k, R-16.4-l, R-16.4-n,
 * R-16.4-s, R-16.4-t)
 *
 * Checks, in order:
 *   1. the schema is a valid JSON Schema object — not `null`, not an array, not a
 *      non-object (R-16.4-n: "not a valid JSON Schema object, for example null");
 *   2. its declared/default dialect is supported (else `ok:false` — the caller
 *      surfaces an unsupported-dialect error, R-16.4-t/s);
 *   3. resource bounds: nesting depth and node count are within `limits`
 *      (R-16.4-l, R-16.4-m, R-16.4-n);
 *   4. when `allowExternalRefs` is `false` (the default, R-16.4-i), the schema
 *      contains no external `$ref`/`$dynamicRef`; an external reference is
 *      rejected rather than dereferenced or treated as permissive (R-16.4-f,
 *      R-16.4-g, R-16.4-k);
 *   5. for `role === 'input'`, the root `type` MUST be `"object"` (R-16.4-d);
 *      for `role === 'output'`, the root `type` is unrestricted (R-16.4-e).
 *
 * @param schema - The raw schema document.
 * @param role - `'input'` (root must be `"object"`) or `'output'` (unrestricted).
 * @param opts.limits - Resource bounds; defaults to {@link DEFAULT_SCHEMA_LIMITS}.
 * @param opts.allowExternalRefs - Opt-in non-local `$ref` fetching; MUST default
 *   to `false` / disabled. (R-16.4-h, R-16.4-i)
 */
export function validateToolSchema(
  schema: unknown,
  role: SchemaRole,
  opts: { limits?: SchemaLimits; allowExternalRefs?: boolean } = {},
): ToolSchemaValidation {
  const limits = opts.limits ?? DEFAULT_SCHEMA_LIMITS;
  const allowExternalRefs = opts.allowExternalRefs ?? false;

  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return { ok: false, reason: 'schema is not a valid JSON Schema object (R-16.4-n)' };
  }
  const obj = schema as Record<string, unknown>;

  const dialect = schemaDialect(obj);
  if (!isSupportedSchemaDialect(dialect)) {
    return { ok: false, reason: `unsupported dialect '${dialect}' (R-16.4-t)` };
  }

  if (schemaNestingDepth(obj, limits.maxDepth + 1) > limits.maxDepth) {
    return { ok: false, reason: `schema nesting depth exceeds limit ${limits.maxDepth} (R-16.4-l, R-16.4-n)` };
  }
  if (countNodes(obj, limits.maxNodes + 1) > limits.maxNodes) {
    return { ok: false, reason: `schema node count exceeds limit ${limits.maxNodes} (R-16.4-m, R-16.4-n)` };
  }

  if (!allowExternalRefs && hasExternalRef(obj, limits.maxDepth)) {
    return { ok: false, reason: 'schema contains an external $ref that is not permitted (R-16.4-f, R-16.4-k)' };
  }

  if (role === 'input' && obj['type'] !== 'object') {
    return { ok: false, reason: 'inputSchema root type MUST be "object" (R-16.4-d)' };
  }

  return { ok: true, dialect };
}

/**
 * Asserts a tool schema is safe to register, throwing when it is not. A server
 * MUST reject — or refuse to register — any schema it cannot safely validate.
 * Throws {@link UnsupportedDialectError} specifically for an unsupported dialect
 * (so callers can map it to the §16.4(9) "dialect not supported" error) and a
 * `TypeError` for every other rejection. (§16.4(7)(9), R-16.4-n, R-16.4-t)
 *
 * @throws {UnsupportedDialectError} When the schema declares an unsupported dialect.
 * @throws {TypeError} When the schema is otherwise unsafe to validate/register.
 */
export function assertRegistrableToolSchema(
  schema: unknown,
  role: SchemaRole,
  opts: { limits?: SchemaLimits; allowExternalRefs?: boolean } = {},
): void {
  // An unsupported dialect gets a dedicated error type even though it only
  // applies to object schemas — check it first when the value is an object.
  if (typeof schema === 'object' && schema !== null && !Array.isArray(schema)) {
    const dialect = schemaDialect(schema as Record<string, unknown>);
    if (!isSupportedSchemaDialect(dialect)) {
      throw new UnsupportedDialectError(dialect);
    }
  }
  const result = validateToolSchema(schema, role, opts);
  if (!result.ok) {
    throw new TypeError(`Refusing to register tool schema: ${result.reason}`);
  }
}

// ─── §16.4 JSON Schema VALUE validation (R-16.4-o, R-16.4-p) ─────────────────────

/**
 * A single non-strict 2020-12 validator. `strict: false` keeps MCP's annotation
 * keywords (e.g. the S14 `x-mcp-header`) and the `$schema` declaration from
 * throwing; `allErrors` collects every mismatch. The instance is reused across
 * calls and validators are cached per schema object.
 */
const valueValidator = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });

/** Compiles (or reuses, when the schema carries a colliding `$id`) a validator. */
function compileValueSchema(schema: object): ValidateFunction {
  try {
    return valueValidator.compile(schema);
  } catch (error) {
    const id = (schema as Record<string, unknown>)['$id'];
    if (typeof id === 'string') {
      const existing = valueValidator.getSchema(id);
      if (existing) return existing as ValidateFunction;
    }
    throw error;
  }
}

/** The outcome of validating a JSON value against a JSON Schema document. */
export interface SchemaValueValidation {
  /** `true` when `value` conforms to the schema. */
  valid: boolean;
  /** Human-readable validation errors (empty when `valid`). */
  errors: string[];
}

/**
 * Validates a JSON *value* against a JSON Schema *document* (the 2020-12 dialect).
 * This is the value-validation capability §16.4 places in this story: it is the
 * machinery a `tools/call` handler uses to validate an `arguments` object against
 * a tool's `inputSchema`, and a `structuredContent` value against an
 * `outputSchema`. (§16.4, R-16.4-o, R-16.4-p)
 *
 * Returns `{ valid: false }` (never throws) when the schema is not a supported
 * 2020-12 object schema or cannot be compiled (e.g. an unresolvable external
 * `$ref`), mirroring `validateToolSchema`'s refusal to treat such schemas as
 * permissive.
 *
 * @param schema - The JSON Schema document (e.g. a tool `inputSchema`/`outputSchema`).
 * @param value - The JSON value to validate against it.
 */
export function validateValueAgainstSchema(schema: unknown, value: unknown): SchemaValueValidation {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return { valid: false, errors: ['schema is not a valid JSON Schema object (R-16.4-n)'] };
  }
  const dialect = schemaDialect(schema as Record<string, unknown>);
  if (!isSupportedSchemaDialect(dialect)) {
    return { valid: false, errors: [`unsupported dialect '${dialect}' (R-16.4-t)`] };
  }
  let validate: ValidateFunction;
  try {
    validate = compileValueSchema(schema as object);
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'schema compilation failed'] };
  }
  if (validate(value)) {
    return { valid: true, errors: [] };
  }
  const errors = (validate.errors ?? []).map((e) =>
    `${e.instancePath || '<root>'} ${e.message ?? 'is invalid'}`.trim(),
  );
  return { valid: false, errors: errors.length > 0 ? errors : ['value does not conform to schema'] };
}

/** A tool's schema slots, as needed by the value validators. */
type ToolSchemas = { inputSchema: unknown; outputSchema?: unknown };

/**
 * Validates a `tools/call` `arguments` object against the tool's `inputSchema`.
 * (R-16.4-o)
 *
 * A receiver MUST validate arguments against the input schema — e.g. an object
 * `{ location: 42 }` is rejected when the schema requires a string `location`.
 * The JSON-RPC `tools/call` envelope itself is owned by S25; this is the
 * validation step S25 calls.
 */
export function validateToolArguments(tool: ToolSchemas, args: unknown): SchemaValueValidation {
  return validateValueAgainstSchema(tool.inputSchema, args);
}

/**
 * Validates a tool result's `structuredContent` against the tool's `outputSchema`.
 * (R-16.4-p)
 *
 * When the tool declares no `outputSchema` there is nothing to validate and the
 * result is `{ valid: true }`. Otherwise the value MUST conform to the schema.
 */
export function validateToolStructuredContent(
  tool: ToolSchemas,
  structuredContent: unknown,
): SchemaValueValidation {
  if (tool.outputSchema === undefined) {
    return { valid: true, errors: [] };
  }
  return validateValueAgainstSchema(tool.outputSchema, structuredContent);
}

// ─── §16.3 The `Tool` type ───────────────────────────────────────────────────────

/** Lower/upper inclusive bounds recommended for a tool `name`. (§16.3, R-16.3-b) */
export const TOOL_NAME_MIN_LENGTH = 1 as const;
export const TOOL_NAME_MAX_LENGTH = 128 as const;

/** The set of characters a tool `name` SHOULD be limited to. (§16.3, R-16.3-d) */
export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Returns `true` when a tool `name` follows the recommended conventions: 1–128
 * characters, only `A–Z a–z 0–9 _ - .`, and therefore no spaces/commas/other
 * special characters. Names SHOULD be treated case-sensitively (this check is
 * itself case-preserving). (§16.3, R-16.3-b, R-16.3-c, R-16.3-d, R-16.3-e)
 */
export function isConventionalToolName(name: string): boolean {
  return (
    name.length >= TOOL_NAME_MIN_LENGTH &&
    name.length <= TOOL_NAME_MAX_LENGTH &&
    TOOL_NAME_PATTERN.test(name)
  );
}

/**
 * Schema for a single `Tool` definition. (§16.3)
 *
 * Extends `BaseMetadata` (name REQUIRED, title OPTIONAL — S20) with the schema
 * and display fields. `inputSchema` is REQUIRED and its root `type` MUST be
 * `"object"` (enforced by `superRefine`, R-16.3-k / R-16.4-d). `outputSchema`,
 * `annotations`, `icons`, and `_meta` are OPTIONAL. `annotations` is the
 * untrusted `ToolAnnotations` hints object whose field SEMANTICS are owned by
 * S25; here it is accepted as an open record (`.passthrough()`), with its known
 * fields (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`,
 * `openWorldHint`) documented for callers. (R-16.3-a, R-16.3-i – R-16.3-p)
 */
export const ToolSchema = BaseMetadataSchema.extend({
  /** OPTIONAL human-readable description; MAY be passed to a model as a selection hint. (R-16.3-j) */
  description: z.string().optional(),
  /**
   * REQUIRED JSON Schema (2020-12) for the arguments object; root `type` MUST be
   * `"object"`. A no-parameter tool still provides a valid object schema.
   * (R-16.3-k, R-16.3-l, R-16.4-d)
   */
  inputSchema: z
    .object({ type: z.literal('object') })
    .passthrough(),
  /** OPTIONAL JSON Schema (2020-12) for `structuredContent`; root type unrestricted. (R-16.3-m, R-16.4-e) */
  outputSchema: z.record(z.unknown()).optional(),
  /**
   * OPTIONAL untrusted `ToolAnnotations` behavior hints (semantics in S25). Known
   * fields: `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`,
   * `openWorldHint`. (R-16.3-n)
   */
  annotations: z
    .object({
      title: z.string().optional(),
      readOnlyHint: z.boolean().optional(),
      destructiveHint: z.boolean().optional(),
      idempotentHint: z.boolean().optional(),
      openWorldHint: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  /** OPTIONAL icons for display in user interfaces. (R-16.3-o) */
  icons: z.array(IconSchema).optional(),
  /** OPTIONAL reserved implementation/extension metadata map. (R-16.3-p) */
  _meta: MetaObjectSchema.optional(),
})
  .passthrough()
  .superRefine((tool, ctx) => {
    if (tool.inputSchema['type'] !== 'object') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputSchema', 'type'],
        message: 'inputSchema root type MUST be "object" (R-16.3-k, R-16.4-d)',
      });
    }
  });

export type Tool = z.infer<typeof ToolSchema>;

/** Returns `true` when `value` is a well-formed `Tool`. */
export function isTool(value: unknown): value is Tool {
  return ToolSchema.safeParse(value).success;
}

/**
 * Resolves the display name to show for a tool, applying the §16.3 precedence:
 * `title` → `annotations.title` → `name`. (R-16.3-i; reuses S20
 * `resolveDisplayName`.)
 */
export function toolDisplayName(tool: {
  name: string;
  title?: string;
  annotations?: { title?: string } | undefined;
}): string {
  return resolveDisplayName(tool.name, tool.title, tool.annotations?.title);
}

/**
 * Returns the names that occur more than once across `tools`. Tool names SHOULD
 * be unique within a single server; a client/proxy aggregating tools from
 * multiple servers MAY encounter collisions. (R-16.3-f, R-16.3-g)
 */
export function findDuplicateToolNames(tools: ReadonlyArray<{ name: string }>): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { name } of tools) {
    if (seen.has(name)) dupes.add(name);
    else seen.add(name);
  }
  return [...dupes];
}

/**
 * Applies a disambiguation strategy for an aggregated tool name: prefixes the
 * tool `name` with a server identifier (e.g. `server.tool`). A client or proxy
 * that encounters a name collision SHOULD apply such a strategy. (R-16.3-h)
 *
 * @param serverId - The server identifier to prefix with.
 * @param name - The tool's original name.
 * @param separator - The prefix separator (default `'.'`, a permitted name char).
 */
export function disambiguateToolName(serverId: string, name: string, separator = '.'): string {
  return `${serverId}${separator}${name}`;
}

// ─── §16.2 Listing tools: `tools/list` ───────────────────────────────────────────

/**
 * The `params` of a `tools/list` request: a paginated request whose only field
 * is the OPTIONAL opaque `cursor` (resume position) plus the OPTIONAL `_meta`.
 * (§16.2, R-16.2-a; reuses the S18 `Cursor` shape.)
 *
 * Modelled as an OPTIONAL params object: a first-page request MAY omit `cursor`
 * (and indeed omit `params` entirely — see `ListToolsRequestSchema`).
 * `.passthrough()` preserves forward-compatible members.
 */
export const ListToolsRequestParamsSchema = z
  .object({
    /** OPTIONAL opaque pagination position to resume from; absent ⇒ first page. (R-16.2-a) */
    cursor: CursorSchema.optional(),
    /** OPTIONAL reserved request metadata map. */
    _meta: MetaObjectSchema.optional(),
  })
  .passthrough();

export type ListToolsRequestParams = z.infer<typeof ListToolsRequestParamsSchema>;

/**
 * The full `tools/list` request envelope. `params` is OPTIONAL — omitting it (or
 * omitting `cursor`) requests the first page. (§16.2)
 */
export const ListToolsRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: RequestIdSchema,
    method: z.literal(TOOLS_LIST_METHOD),
    params: ListToolsRequestParamsSchema.optional(),
  })
  .passthrough();

export type ListToolsRequest = z.infer<typeof ListToolsRequestSchema>;

/**
 * The result of `tools/list`. It is simultaneously a paginated result (§12,
 * `nextCursor`) and a cacheable result (§13, `ttlMs` / `cacheScope`), wrapping a
 * REQUIRED page of `Tool` definitions. (§16.2, R-16.2-b – R-16.2-n)
 *
 * Field constraints:
 *   - `resultType` REQUIRED; for a tools list the value is `"complete"`. (R-16.2-m)
 *   - `tools` REQUIRED `Tool[]`: the page of definitions (MAY be empty). (R-16.2-b)
 *   - `nextCursor` OPTIONAL opaque token; absent ⇒ last page. (R-16.2-c)
 *   - `ttlMs` REQUIRED non-negative integer cache-freshness hint. (R-16.2-g, R-16.2-i)
 *   - `cacheScope` REQUIRED `"public"` | `"private"`. (R-16.2-j)
 *   - `_meta` OPTIONAL reserved metadata. (R-16.2-n)
 *
 * Reuses S18's `CursorSchema` and S19's `CacheScopeSchema` rather than
 * re-declaring those shapes; `resultType` is narrowed to the `"complete"` literal.
 */
export const ListToolsResultSchema = z
  .object({
    /**
     * REQUIRED base discriminator. §16.2 fixes a tools-list result to `"complete"`;
     * any other value (e.g. `"input_required"`) MUST be rejected — a list never
     * solicits input. (R-16.2-m)
     */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** REQUIRED page of tool definitions; MAY be empty. (R-16.2-b, R-16.1-g) */
    tools: z.array(ToolSchema),
    /** OPTIONAL opaque token for the page after the last tool; absent ⇒ last page. (R-16.2-c) */
    nextCursor: CursorSchema.optional(),
    /** REQUIRED non-negative integer cache-freshness hint in ms. (R-16.2-g, R-16.2-i) */
    ttlMs: z.number().int().nonnegative(),
    /** REQUIRED cache-sharing scope. (R-16.2-j, R-16.2-k, R-16.2-l) */
    cacheScope: CacheScopeSchema,
    /** OPTIONAL reserved metadata map. (R-16.2-n) */
    _meta: MetaObjectSchema.optional(),
  })
  .passthrough();

export type ListToolsResult = z.infer<typeof ListToolsResultSchema>;

/** Returns `true` when `value` is a well-formed `ListToolsResult`. */
export function isListToolsResult(value: unknown): value is ListToolsResult {
  return ListToolsResultSchema.safeParse(value).success;
}

/** The server-supplied inputs to a `ListToolsResult`. */
export interface ListToolsResultConfig {
  /** The page of tools to return (REQUIRED; MAY be empty). (R-16.2-b, R-16.1-g) */
  tools: ReadonlyArray<Tool>;
  /** Non-negative cache-freshness hint in ms. (R-16.2-g) */
  ttlMs: number;
  /** Cache-sharing scope. (R-16.2-j) */
  cacheScope: CacheScope;
  /** OPTIONAL opaque next-page cursor; omit on the final page. (R-16.2-c) */
  nextCursor?: Cursor;
  /** OPTIONAL reserved metadata map. (R-16.2-n) */
  _meta?: MetaObject;
}

/**
 * Builds a `ListToolsResult` from a server's config. `resultType` is fixed to
 * `"complete"` (R-16.2-m). `nextCursor` and `_meta` are included only when
 * supplied — never defaulted. (§16.2)
 *
 * @throws {RangeError} When `ttlMs` is negative or not an integer (R-16.2-g).
 */
export function buildListToolsResult(config: ListToolsResultConfig): ListToolsResult {
  if (!Number.isInteger(config.ttlMs) || config.ttlMs < 0) {
    throw new RangeError('ListToolsResult.ttlMs MUST be a non-negative integer (R-16.2-g)');
  }
  const result: ListToolsResult = {
    resultType: RESULT_TYPE.COMPLETE,
    tools: [...config.tools],
    ttlMs: config.ttlMs,
    cacheScope: config.cacheScope,
  };
  if (config.nextCursor !== undefined) {
    result.nextCursor = config.nextCursor;
  }
  if (config._meta !== undefined) {
    result._meta = config._meta;
  }
  return result;
}

/**
 * Builds a `tools/list` JSON-RPC request. When `cursor` is supplied it is passed
 * through VERBATIM — the client MUST treat a received `nextCursor` as opaque and
 * MUST NOT parse or construct it. Omitting `cursor` requests the first page.
 * (§16.2, R-16.2-a, R-16.2-d, R-16.2-e, R-16.2-f)
 *
 * @param id - The JSON-RPC request id.
 * @param cursor - OPTIONAL opaque cursor (e.g. a previously received `nextCursor`).
 * @param extraMeta - OPTIONAL additional `_meta` members.
 */
export function buildListToolsRequest(
  id: RequestId,
  cursor?: Cursor,
  extraMeta?: MetaObject,
): ListToolsRequest {
  const request: ListToolsRequest = {
    jsonrpc: '2.0',
    id,
    method: TOOLS_LIST_METHOD,
  };
  if (cursor !== undefined || extraMeta !== undefined) {
    const params: ListToolsRequestParams = {};
    if (cursor !== undefined) params.cursor = cursor;
    if (extraMeta !== undefined) params._meta = extraMeta;
    request.params = params;
  }
  return request;
}
