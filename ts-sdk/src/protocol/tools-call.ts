/**
 * S25 — Tools II: Calling, Errors, Annotations & Change Notifications
 * (§16.5–§16.9).
 *
 * The runtime half of MCP tools, layered on top of S24's discovery half
 * (`src/protocol/tools.ts`). S24 defines the `tools` capability, `tools/list`,
 * the `Tool` type, and the JSON-Schema rules for `inputSchema` / `outputSchema`;
 * this module makes a tool actually invokable and defines exactly what comes
 * back:
 *
 *   - `CallToolRequestParamsSchema` / `CallToolRequestSchema` — the `tools/call`
 *     request (`name`, OPTIONAL `arguments`, the multi-round-trip retry fields
 *     `inputResponses` / `requestState`, and `_meta`), plus `buildCallToolRequest`
 *     and `buildCallToolRetryRequest` (which guarantees a fresh `id`).
 *   - `CallToolResultSchema` — the successfully-dispatched result (`content`,
 *     OPTIONAL `structuredContent`, OPTIONAL `isError`, REQUIRED `resultType`,
 *     OPTIONAL `_meta`), with `buildCallToolResult`, `buildToolExecutionError`,
 *     `isCallToolError`, and the `outputSchema`/textual-fallback helpers.
 *   - The two-layer error model: a tool-execution failure is a *successful*
 *     `CallToolResult` with `isError: true` (so the model can self-correct),
 *     while a protocol failure (`-32602` unknown tool / invalid arguments) is a
 *     JSON-RPC error — `dispatchToolCall` performs exactly this split, reusing
 *     S24's `validateToolArguments`.
 *   - `ToolAnnotationsSchema` and the untrusted-annotation rule
 *     (`resolveToolAnnotationHints`, `mayTrustToolAnnotations`).
 *   - `ToolListChangedNotificationSchema` / `buildToolListChangedNotification`
 *     (reusing S24's `TOOLS_LIST_CHANGED_METHOD`), plus the client-side
 *     `reactToToolListChanged` cache-invalidation guidance.
 *
 * Out of scope (owned elsewhere): the `tools` capability + `tools/list` + the
 * `Tool` type + JSON-Schema rules — S24 (`tools.ts`); the `ContentBlock` union —
 * S21 (`types/content.ts`); the multi-round-trip mechanics (`InputRequiredResult`,
 * the exchange algorithm) — S17 (`multi-round-trip.ts`); pagination — S18;
 * caching — S19; the full error-code registry — S34 (this story uses `-32602`).
 */

import { z } from 'zod';
import { RequestIdSchema, type RequestId } from '../jsonrpc/framing.js';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import { ContentBlockSchema, type ContentBlock, type TextContent } from '../types/content.js';
import { MetaObjectSchema, type MetaObject, INVALID_PARAMS_CODE } from './meta.js';
import {
  TOOLS_CALL_METHOD,
  TOOLS_LIST_CHANGED_METHOD,
  validateToolArguments,
  type SchemaValueValidation,
} from './tools.js';

// Re-export the already-existing method-name / error-code / notification-method
// bindings so `tools/call` callers can reference them from this module without
// reaching back into S24 / S05 (same bindings — never redefined here).
export { TOOLS_CALL_METHOD } from './tools.js';
export { TOOLS_LIST_CHANGED_METHOD } from './tools.js';
export { INVALID_PARAMS_CODE } from './meta.js';

// ─── §16.5 The `tools/call` request ───────────────────────────────────────────

/**
 * The `params` of a `tools/call` request invoking a named tool. (§16.5)
 *
 * Field constraints:
 *   - `name` REQUIRED string: the tool to invoke; MUST match a tool the server
 *     currently exposes to the caller (the *exposure* check is a dispatch-time
 *     concern handled by {@link dispatchToolCall}, not a shape concern).
 *     (R-16.5-a, R-16.5-b)
 *   - `arguments` OPTIONAL object: the call arguments; when present MUST validate
 *     against the tool's `inputSchema` (validated by S24's `validateToolArguments`
 *     at dispatch, R-16.5-d); when omitted the server MUST treat it as `{}`
 *     (R-16.5-e, see {@link resolveCallToolArguments}). (R-16.5-c)
 *   - `inputResponses` OPTIONAL object: on retry after an `input_required`
 *     result, the responses keyed by the server's earlier `inputRequests` keys
 *     (mechanics per S17). (R-16.5-f, R-16.5-g)
 *   - `requestState` OPTIONAL string: the opaque continuation token echoed back
 *     unchanged on retry; the client MUST treat it as opaque and MUST NOT
 *     interpret or modify it (S17). (R-16.5-h, R-16.5-i, R-16.5-j)
 *   - `_meta` OPTIONAL reserved metadata map (e.g. a `progressToken`). (R-16.5-k)
 *
 * `arguments` is `z.record(z.unknown())` — a JSON object whose member values MAY
 * be any JSON value. `.passthrough()` preserves forward-compatible members.
 */
export const CallToolRequestParamsSchema = z
  .object({
    /** REQUIRED. Name of the tool to invoke. (R-16.5-a, R-16.5-b) */
    name: z.string(),
    /** OPTIONAL. Arguments object; omitted ⇒ treated as `{}`. (R-16.5-c, R-16.5-e) */
    arguments: z.record(z.unknown()).optional(),
    /** OPTIONAL. Retry responses keyed by the prior `inputRequests` keys (S17). (R-16.5-f) */
    inputResponses: z.record(z.unknown()).optional(),
    /** OPTIONAL. Opaque continuation token echoed verbatim on retry (S17). (R-16.5-h) */
    requestState: z.string().optional(),
    /** OPTIONAL. Reserved request metadata map (e.g. a `progressToken`). (R-16.5-k) */
    _meta: MetaObjectSchema.optional(),
  })
  .passthrough();

export type CallToolRequestParams = z.infer<typeof CallToolRequestParamsSchema>;

/**
 * The full `tools/call` request envelope. (§16.5)
 *
 * `name` is REQUIRED within `params`; a request whose `name` is missing or
 * non-string fails to parse and is a malformed/protocol error. (R-16.5-a)
 */
export const CallToolRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: RequestIdSchema,
    method: z.literal(TOOLS_CALL_METHOD),
    params: CallToolRequestParamsSchema,
  })
  .passthrough();

export type CallToolRequest = z.infer<typeof CallToolRequestSchema>;

/** Returns `true` when `value` is a well-formed `tools/call` request. (R-16.5-a) */
export function isCallToolRequest(value: unknown): value is CallToolRequest {
  return CallToolRequestSchema.safeParse(value).success;
}

/**
 * Resolves the effective `arguments` of a `tools/call`: the supplied object, or
 * the empty object `{}` when `arguments` is omitted. The server MUST treat an
 * omitted `arguments` as `{}`. (§16.5, R-16.5-e)
 */
export function resolveCallToolArguments(
  params: { arguments?: Record<string, unknown> | undefined },
): Record<string, unknown> {
  return params.arguments ?? {};
}

/** The caller-supplied inputs to a first-issue `tools/call` request. */
export interface CallToolRequestConfig {
  /** REQUIRED tool name to invoke. (R-16.5-a) */
  name: string;
  /** OPTIONAL arguments object; omit for a no-argument call (server treats as `{}`). (R-16.5-c) */
  arguments?: Record<string, unknown>;
  /** OPTIONAL additional `_meta` members (e.g. a `progressToken`). (R-16.5-k) */
  _meta?: MetaObject;
}

/**
 * Builds a first-issue `tools/call` JSON-RPC request. `arguments` and `_meta` are
 * included only when supplied — never defaulted to `{}` on the wire (the server
 * applies the omitted-arguments default, R-16.5-e). (§16.5)
 *
 * @param id - The JSON-RPC request id.
 * @param config - The tool name and OPTIONAL arguments / `_meta`.
 */
export function buildCallToolRequest(id: RequestId, config: CallToolRequestConfig): CallToolRequest {
  const params: CallToolRequestParams = { name: config.name };
  if (config.arguments !== undefined) params.arguments = config.arguments;
  if (config._meta !== undefined) params._meta = config._meta;
  return { jsonrpc: '2.0', id, method: TOOLS_CALL_METHOD, params };
}

/** The caller-supplied inputs to a retry of a previously `input_required` call. */
export interface CallToolRetryConfig {
  /** REQUIRED tool name (same tool being retried). (R-16.5-a) */
  name: string;
  /**
   * REQUIRED responses keyed by the prior result's `inputRequests` keys. For each
   * key in that result's `inputRequests`, the same key MUST appear here with its
   * response. (R-16.5-f, R-16.5-g)
   */
  inputResponses: Record<string, unknown>;
  /**
   * OPTIONAL opaque continuation token from the server's `input_required` result.
   * It is echoed back VERBATIM — never derived, parsed, or mutated. (R-16.5-h,
   * R-16.5-i, R-16.5-j)
   */
  requestState?: string;
  /** OPTIONAL additional `_meta` members. (R-16.5-k) */
  _meta?: MetaObject;
}

/**
 * Builds a retry `tools/call` request after an `input_required` result, echoing
 * `requestState` byte-for-byte and supplying `inputResponses`. (§16.5, S17)
 *
 * The retry's JSON-RPC `id` MUST differ from the initial request's `id`; this
 * helper enforces that by throwing when `retryId` equals `initialId`. (R-16.5-u)
 *
 * `requestState` is passed through untouched — this function never derives,
 * parses, or mutates it, honoring the opaque-blob rule. (R-16.5-i, R-16.5-j)
 *
 * @param initialId - The `id` of the original (now `input_required`) request.
 * @param retryId - The `id` for the retry; MUST differ from `initialId`.
 * @param config - The tool name, `inputResponses`, echoed `requestState`, `_meta`.
 * @throws {RangeError} When `retryId` equals `initialId` (R-16.5-u).
 */
export function buildCallToolRetryRequest(
  initialId: RequestId,
  retryId: RequestId,
  config: CallToolRetryConfig,
): CallToolRequest {
  if (retryId === initialId) {
    throw new RangeError(
      'A tools/call retry MUST use a JSON-RPC id different from the initial request (R-16.5-u)',
    );
  }
  const params: CallToolRequestParams = {
    name: config.name,
    inputResponses: config.inputResponses,
  };
  // Echo requestState verbatim when present — never derived/parsed/mutated.
  if (config.requestState !== undefined) params.requestState = config.requestState;
  if (config._meta !== undefined) params._meta = config._meta;
  return { jsonrpc: '2.0', id: retryId, method: TOOLS_CALL_METHOD, params };
}

// ─── §16.5 The `CallToolResult` ───────────────────────────────────────────────

/**
 * The result of a successfully dispatched `tools/call` — a JSON-RPC *result*,
 * whether the tool succeeded, failed at execution (`isError: true`), or paused
 * for input (`resultType: "input_required"`). (§16.5)
 *
 * Field constraints:
 *   - `content` REQUIRED `ContentBlock[]` (S21): the unstructured result; MAY be
 *     empty and MAY mix block types. (R-16.5-l, R-16.5-m)
 *   - `structuredContent` OPTIONAL: ANY JSON value — object, array, string,
 *     number, boolean, or `null`; explicitly NOT restricted to objects. `z.unknown()`
 *     with the key present (see `isStructuredContentPresent`) distinguishes an
 *     explicit `null` from an omitted field. (R-16.5-n)
 *   - `isError` OPTIONAL boolean; absent ⇒ `false` (success). (R-16.5-q)
 *   - `resultType` REQUIRED: `"complete"` for a finished call (the value §16.5
 *     fixes for a `CallToolResult`); a paused call is instead an
 *     `InputRequiredResult` (S17) carrying `"input_required"`. (R-16.5-r)
 *   - `_meta` OPTIONAL reserved metadata map. (R-16.5-s)
 *
 * `resultType` is narrowed to the `"complete"` literal: a paused tool call is an
 * `InputRequiredResult` (S17), which carries the `"input_required"` discriminator
 * — this schema models the *completed* shape. `.passthrough()` preserves
 * forward-compatible members.
 */
export const CallToolResultSchema = z
  .object({
    /** REQUIRED discriminator; a completed `CallToolResult` is `"complete"`. (R-16.5-r) */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** REQUIRED unstructured result; MAY be empty / mixed types. (R-16.5-l, R-16.5-m) */
    content: z.array(ContentBlockSchema),
    /** OPTIONAL structured result; ANY JSON value, not restricted to objects. (R-16.5-n) */
    structuredContent: z.unknown().optional(),
    /** OPTIONAL; absent ⇒ `false` (success). (R-16.5-q) */
    isError: z.boolean().optional(),
    /** OPTIONAL reserved metadata map. (R-16.5-s) */
    _meta: MetaObjectSchema.optional(),
  })
  .passthrough();

export type CallToolResult = z.infer<typeof CallToolResultSchema>;

/** Returns `true` when `value` is a well-formed (completed) `CallToolResult`. */
export function isCallToolResult(value: unknown): value is CallToolResult {
  return CallToolResultSchema.safeParse(value).success;
}

/**
 * Returns whether a `CallToolResult` ended in a tool execution error, applying
 * the absent-⇒-`false` rule: `isError` absent is interpreted as `false`
 * (success). (§16.5, R-16.5-q; §16.6, R-16.6-b)
 */
export function isCallToolError(result: { isError?: boolean | undefined }): boolean {
  return result.isError === true;
}

/**
 * Returns `true` when `structuredContent` is *present* on a result, treating an
 * explicit `null` value as present (it is a valid structured value, R-16.5-n)
 * while an omitted key is absent. Use this rather than a truthiness check so an
 * intentional `null`/`false`/`0`/`""` structured value is not mistaken for
 * absence. (R-16.5-n)
 */
export function isStructuredContentPresent(
  result: Record<string, unknown>,
): boolean {
  return 'structuredContent' in result && result['structuredContent'] !== undefined;
}

/**
 * Serializes a structured value to a `text` `ContentBlock`, the textual
 * `content` fallback a server SHOULD provide alongside `structuredContent` for
 * clients that do not consume structured content. (§16.5, R-16.5-p)
 *
 * The block carries the JSON serialization of the structured value, mirroring
 * the §16.5 weather example.
 */
export function structuredContentTextFallback(structuredContent: unknown): TextContent {
  return { type: 'text', text: JSON.stringify(structuredContent) };
}

/** The server-supplied inputs to a successful (non-error) `CallToolResult`. */
export interface CallToolResultConfig {
  /** REQUIRED unstructured content blocks; MAY be empty / mixed. (R-16.5-l, R-16.5-m) */
  content: ReadonlyArray<ContentBlock>;
  /**
   * OPTIONAL structured result (ANY JSON value). Pass the property to include it
   * — including an explicit `null`. (R-16.5-n)
   */
  structuredContent?: unknown;
  /** OPTIONAL; defaults to `false` (success) when omitted. (R-16.5-q) */
  isError?: boolean;
  /** OPTIONAL reserved metadata map. (R-16.5-s) */
  _meta?: MetaObject;
}

/**
 * Builds a completed `CallToolResult`. `resultType` is fixed to `"complete"`
 * (R-16.5-r). `structuredContent`, `isError`, and `_meta` are included only when
 * supplied; `structuredContent` is included whenever the property is present in
 * `config` (so an explicit `null` survives, R-16.5-n). (§16.5)
 *
 * This builder does NOT itself enforce the `outputSchema` conformance rule
 * (R-16.5-o) — that belongs to the dispatch path, where the tool's `outputSchema`
 * is known; see {@link validateToolStructuredContent} (S24) and
 * {@link buildOutputSchemaResult}.
 */
export function buildCallToolResult(config: CallToolResultConfig): CallToolResult {
  const result: CallToolResult = {
    resultType: RESULT_TYPE.COMPLETE,
    content: [...config.content],
  };
  if ('structuredContent' in config) result.structuredContent = config.structuredContent;
  if (config.isError !== undefined) result.isError = config.isError;
  if (config._meta !== undefined) result._meta = config._meta;
  return result;
}

/**
 * Builds a successful `CallToolResult` for a tool that declares an `outputSchema`:
 * it populates `structuredContent` with the (assumed schema-conforming) value
 * AND prepends a textual `content` fallback carrying the JSON serialization, per
 * the SHOULD in §16.5. (R-16.5-o, R-16.5-p)
 *
 * The caller is responsible for validating `structuredContent` against the
 * `outputSchema` (via S24's {@link validateToolStructuredContent}); this helper
 * assembles the wire shape.
 *
 * @param structuredContent - The schema-conforming structured result.
 * @param extraContent - OPTIONAL additional content blocks appended after the
 *   serialized-JSON text fallback.
 */
export function buildOutputSchemaResult(
  structuredContent: unknown,
  extraContent: ReadonlyArray<ContentBlock> = [],
): CallToolResult {
  return buildCallToolResult({
    content: [structuredContentTextFallback(structuredContent), ...extraContent],
    structuredContent,
  });
}

/**
 * Builds a *tool execution error* result: a successful `CallToolResult` (a
 * JSON-RPC result, NOT a JSON-RPC error) with `isError: true` and a human- and
 * model-readable explanation in `content`. This is the §16.6 mechanism for a
 * tool that reached execution and failed (upstream failure, semantically-invalid
 * input, business-logic failure), reported so the model can observe it and
 * self-correct. (§16.6, R-16.6-b)
 *
 * @param message - A human- and model-readable explanation of the failure.
 * @param extra - OPTIONAL extra content blocks / `structuredContent` / `_meta`.
 */
export function buildToolExecutionError(
  message: string,
  extra: {
    content?: ReadonlyArray<ContentBlock>;
    structuredContent?: unknown;
    _meta?: MetaObject;
  } = {},
): CallToolResult {
  const config: CallToolResultConfig = {
    content: [{ type: 'text', text: message }, ...(extra.content ?? [])],
    isError: true,
  };
  if ('structuredContent' in extra) config.structuredContent = extra.structuredContent;
  if (extra._meta !== undefined) config._meta = extra._meta;
  return buildCallToolResult(config);
}

// ─── §16.6 The two-layer error model ──────────────────────────────────────────

/**
 * A JSON-RPC error payload for a *protocol* failure — the request could not be
 * dispatched to a tool. This is NEVER a `CallToolResult`; the two layers are
 * never conflated. (§16.6, R-16.6-a, R-16.6-d)
 */
export interface ToolProtocolError {
  /** Error code; for the §16.6 cases this is `-32602` (Invalid params). */
  code: typeof INVALID_PARAMS_CODE;
  /** Short, human-readable description. */
  message: string;
}

/**
 * Builds the JSON-RPC error for an UNKNOWN tool name — a `tools/call` whose
 * `name` does not match any tool the server currently exposes. MUST be reported
 * with code `-32602` (Invalid params), as a JSON-RPC error and never as a
 * `CallToolResult`. (§16.6, R-16.5-b, R-16.6-d, R-16.6-e)
 *
 * @param name - The unknown tool name from the request.
 */
export function buildUnknownToolError(name: string): ToolProtocolError {
  return { code: INVALID_PARAMS_CODE, message: `Unknown tool: ${name}` };
}

/**
 * Builds the JSON-RPC error for an ARGUMENT-VALIDATION failure — `arguments` that
 * do not conform to the tool's `inputSchema`. MUST be reported with code `-32602`
 * (Invalid params), as a JSON-RPC error and never as a `CallToolResult`; the tool
 * MUST NOT be invoked. (§16.6, R-16.5-d, R-16.6-d, R-16.6-f)
 *
 * @param name - The tool name whose arguments failed validation.
 * @param errors - OPTIONAL validation error detail (e.g. from `validateToolArguments`).
 */
export function buildInvalidArgumentsError(
  name: string,
  errors: ReadonlyArray<string> = [],
): ToolProtocolError {
  const detail = errors.length > 0 ? `: ${errors.join('; ')}` : '';
  return {
    code: INVALID_PARAMS_CODE,
    message: `Invalid arguments for tool ${name}${detail}`,
  };
}

/** A tool whose schemas are needed to dispatch a `tools/call`. (Subset of S24's `Tool`.) */
export interface DispatchableTool {
  /** The tool's `name`. */
  name: string;
  /** The tool's REQUIRED `inputSchema` (root `type: "object"`). */
  inputSchema: unknown;
  /** OPTIONAL `outputSchema` governing `structuredContent` conformance. */
  outputSchema?: unknown;
}

/**
 * Outcome of {@link dispatchToolCall}: either the request reaches the tool
 * (`dispatched: true`, with the resolved `arguments` per R-16.5-e), or it fails
 * to dispatch and a JSON-RPC PROTOCOL error MUST be returned (`dispatched: false`).
 * These are the two layers §16.6 keeps strictly distinct. (R-16.6-a)
 */
export type ToolDispatch =
  | { dispatched: true; tool: DispatchableTool; arguments: Record<string, unknown> }
  | { dispatched: false; error: ToolProtocolError };

/**
 * Performs the §16.6 dispatch decision for a `tools/call`, returning a structured
 * outcome rather than throwing. This is the boundary between the two error
 * layers: it resolves protocol-level dispatchability ONLY; a tool that dispatches
 * and then fails reports that failure as a `CallToolResult` with `isError: true`
 * (see {@link buildToolExecutionError}), which is NOT this function's concern.
 * (§16.6, R-16.6-a, R-16.6-d)
 *
 * Decision, in order:
 *   1. Unknown tool name (no tool in `exposedTools` matches `params.name`) ⇒
 *      `{ dispatched: false }` with a `-32602` error (R-16.5-b, R-16.6-e).
 *   2. `arguments` (defaulting to `{}` when omitted, R-16.5-e) fail to validate
 *      against the tool's `inputSchema` ⇒ `{ dispatched: false }` with a `-32602`
 *      error and the tool is NOT invoked (R-16.5-d, R-16.6-f).
 *   3. Otherwise ⇒ `{ dispatched: true }` carrying the matched tool and the
 *      resolved `arguments`, ready for the tool to run.
 *
 * Tool names are matched case-sensitively, per S24's name conventions (R-16.3-e).
 *
 * @param params - The parsed `tools/call` params.
 * @param exposedTools - The tools the server currently exposes to the caller.
 */
export function dispatchToolCall(
  params: { name: string; arguments?: Record<string, unknown> | undefined },
  exposedTools: ReadonlyArray<DispatchableTool>,
): ToolDispatch {
  const tool = exposedTools.find((t) => t.name === params.name);
  if (tool === undefined) {
    return { dispatched: false, error: buildUnknownToolError(params.name) };
  }
  const args = resolveCallToolArguments(params);
  const validation: SchemaValueValidation = validateToolArguments(tool, args);
  if (!validation.valid) {
    return {
      dispatched: false,
      error: buildInvalidArgumentsError(tool.name, validation.errors),
    };
  }
  return { dispatched: true, tool, arguments: args };
}

// ─── §16.7 Tool annotations (untrusted hints) ─────────────────────────────────

/**
 * `ToolAnnotations` — OPTIONAL, UNTRUSTED, human- and model-oriented hints about
 * a tool's behavior. Attached to a `Tool` (the `Tool` envelope and its open
 * `annotations` record are defined in S24); this schema gives the five known
 * hint fields their explicit shapes and defaults. (§16.7)
 *
 * Every field is OPTIONAL; the spec defaults (`readOnlyHint: false`,
 * `destructiveHint: true`, `idempotentHint: false`, `openWorldHint: true`) are
 * applied by {@link resolveToolAnnotationHints}, NOT by Zod (the wire shape keeps
 * absent fields absent). `.passthrough()` preserves forward-compatible additions.
 * (R-16.7-a – R-16.7-e)
 */
export const ToolAnnotationsSchema = z
  .object({
    /** OPTIONAL display title; ranks after the tool's `title`, before `name` (S24). (R-16.7-a) */
    title: z.string().optional(),
    /** OPTIONAL (default `false`); `true` ⇒ tool does not modify its environment. (R-16.7-b) */
    readOnlyHint: z.boolean().optional(),
    /** OPTIONAL (default `true`); `true` ⇒ MAY perform destructive updates; meaningful only when not read-only. (R-16.7-c) */
    destructiveHint: z.boolean().optional(),
    /** OPTIONAL (default `false`); `true` ⇒ repeated same-arg calls have no extra effect; meaningful only when not read-only. (R-16.7-d) */
    idempotentHint: z.boolean().optional(),
    /** OPTIONAL (default `true`); `true` ⇒ MAY interact with an open world of external entities. (R-16.7-e) */
    openWorldHint: z.boolean().optional(),
  })
  .passthrough();

export type ToolAnnotations = z.infer<typeof ToolAnnotationsSchema>;

/** The `ToolAnnotations` boolean hints with the §16.7 defaults applied. */
export interface ResolvedToolAnnotationHints {
  /** Default `false`. (R-16.7-b) */
  readOnlyHint: boolean;
  /** Default `true`; meaningful only when `readOnlyHint` is `false`. (R-16.7-c) */
  destructiveHint: boolean;
  /** Default `false`; meaningful only when `readOnlyHint` is `false`. (R-16.7-d) */
  idempotentHint: boolean;
  /** Default `true`. (R-16.7-e) */
  openWorldHint: boolean;
}

/** The §16.7 default values for the four boolean annotation hints. (R-16.7-b – R-16.7-e) */
export const TOOL_ANNOTATION_DEFAULTS: ResolvedToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * Resolves the four boolean `ToolAnnotations` hints to concrete values, applying
 * the §16.7 defaults for any absent field: `readOnlyHint` ⇒ `false`,
 * `destructiveHint` ⇒ `true`, `idempotentHint` ⇒ `false`, `openWorldHint` ⇒
 * `true`. (R-16.7-b, R-16.7-c, R-16.7-d, R-16.7-e)
 *
 * Note `destructiveHint` and `idempotentHint` are meaningful only when
 * `readOnlyHint` is `false`; callers SHOULD ignore them otherwise.
 *
 * @param annotations - The (possibly partial / absent) annotations object.
 */
export function resolveToolAnnotationHints(
  annotations: ToolAnnotations | undefined,
): ResolvedToolAnnotationHints {
  return {
    readOnlyHint: annotations?.readOnlyHint ?? TOOL_ANNOTATION_DEFAULTS.readOnlyHint,
    destructiveHint: annotations?.destructiveHint ?? TOOL_ANNOTATION_DEFAULTS.destructiveHint,
    idempotentHint: annotations?.idempotentHint ?? TOOL_ANNOTATION_DEFAULTS.idempotentHint,
    openWorldHint: annotations?.openWorldHint ?? TOOL_ANNOTATION_DEFAULTS.openWorldHint,
  };
}

/**
 * The untrusted-annotations rule: a client MUST treat tool annotations as
 * untrusted and MUST NOT make tool-use or safety decisions based on annotations
 * received from a server it does not trust. Returns `true` ONLY when the server
 * is explicitly trusted — so a caller gating a safety decision on annotations
 * fails closed for any untrusted server. (§16.7, R-16.7-f, R-16.7-g)
 *
 * Annotations are HINTS, never guaranteed to be faithful (including `title`);
 * this predicate makes the trust boundary explicit at the decision site.
 *
 * @param serverIsTrusted - Whether the application trusts the server that sent
 *   the annotations. Defaults to `false` (fail closed).
 */
export function mayTrustToolAnnotations(serverIsTrusted: boolean = false): boolean {
  return serverIsTrusted === true;
}

// ─── §16.8 `notifications/tools/list_changed` ─────────────────────────────────

/**
 * The `params` of a `notifications/tools/list_changed` notification: entirely
 * OPTIONAL — no required payload, MAY carry `_meta` and additional keys. (§16.8,
 * R-16.8-b)
 */
export const ToolListChangedNotificationParamsSchema = z
  .object({
    /** OPTIONAL reserved metadata map. (R-16.8-b) */
    _meta: MetaObjectSchema.optional(),
  })
  .passthrough();

export type ToolListChangedNotificationParams = z.infer<
  typeof ToolListChangedNotificationParamsSchema
>;

/**
 * The `notifications/tools/list_changed` notification: a server-to-client signal
 * that the available tool set changed. Reuses S24's `TOOLS_LIST_CHANGED_METHOD`
 * for the method name. `params` is OPTIONAL and carries no required payload.
 * (§16.8, R-16.8-a, R-16.8-b)
 *
 * It is a JSON-RPC notification — no `id`. The server SHOULD send it only when it
 * declared `tools.listChanged: true` (the capability gate is S24's
 * `mayServerEmitToolsListChanged`).
 */
export const ToolListChangedNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.literal(TOOLS_LIST_CHANGED_METHOD),
    params: ToolListChangedNotificationParamsSchema.optional(),
  })
  .passthrough();

export type ToolListChangedNotification = z.infer<typeof ToolListChangedNotificationSchema>;

/** Returns `true` when `value` is a well-formed list-changed notification. */
export function isToolListChangedNotification(
  value: unknown,
): value is ToolListChangedNotification {
  return ToolListChangedNotificationSchema.safeParse(value).success;
}

/**
 * Builds a `notifications/tools/list_changed` notification. `params` is included
 * only when `_meta` is supplied — the notification needs no payload and MAY be
 * issued without any prior explicit subscription request. (§16.8, R-16.8-a,
 * R-16.8-b)
 *
 * @param meta - OPTIONAL `_meta` members to attach.
 */
export function buildToolListChangedNotification(
  meta?: MetaObject,
): ToolListChangedNotification {
  const notification: ToolListChangedNotification = {
    jsonrpc: '2.0',
    method: TOOLS_LIST_CHANGED_METHOD,
  };
  if (meta !== undefined) notification.params = { _meta: meta };
  return notification;
}

/** The client-side reaction to a received list-changed notification. (§16.8) */
export interface ToolListChangedReaction {
  /** A client SHOULD invalidate any cached tool list (S19). (R-16.8-c) */
  invalidateCachedToolList: true;
  /** A client MAY issue a fresh `tools/list` request to obtain the updated set. (R-16.8-d) */
  mayRelist: true;
}

/**
 * Returns the prescribed client reaction to a `notifications/tools/list_changed`:
 * invalidate any cached tool list (SHOULD) and optionally re-list (MAY). This
 * encodes the §16.8 client guidance as a value a caller can act on. (R-16.8-c,
 * R-16.8-d)
 */
export function reactToToolListChanged(): ToolListChangedReaction {
  return { invalidateCachedToolList: true, mayRelist: true };
}
