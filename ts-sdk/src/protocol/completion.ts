/**
 * S29 — Completion (§19).
 *
 * Argument autocompletion: a best-effort, advisory facility a server offers so a
 * client can suggest ranked candidate values for the individual arguments of a
 * prompt or the variables of a resource template. As a user fills in an argument
 * (typically a filtering dropdown), the client sends a single
 * `completion/complete` request carrying the current partial value and
 * (optionally) already-resolved sibling arguments, and the server returns a
 * ranked, capped (≤ 100) list of candidate strings. (§19, R-19-a)
 *
 * Completion is a thin overlay on the two facilities whose argument shapes it
 * completes (prompts, S28; resource templates, S26) and is gated by capability
 * negotiation (S10): a client MUST NOT issue `completion/complete` unless the
 * server advertised the `completions` capability. (R-19.1-a, R-19.1-c)
 *
 * This module provides:
 *   - `CompletionsCapabilitySchema` — the open `completions` capability object
 *     whose presence (RECOMMENDED baseline `{}`) signals support (R-19.1-a,
 *     R-19.1-b); gating reuses `serverDeclares` / `mayClientInvoke` from S10,
 *     whose `SERVER_METHOD_CAPABILITY` map already binds `completion/complete`
 *     to `completions`.
 *   - `PromptReferenceSchema` / `ResourceTemplateReferenceSchema` /
 *     `CompletionReferenceSchema` — the closed `ref` discriminated union over
 *     `type` (`"ref/prompt"` / `"ref/resource"`), rejecting any other type
 *     (R-19.2-c – R-19.2-e, R-19.3-a – R-19.3-f).
 *   - `CompleteRequestParamsSchema` — `ref` + `argument` ({name,value}) +
 *     optional `context.arguments` + optional `_meta` (R-19.2-b – R-19.2-l).
 *   - `CompleteResultSchema` — the `completion` object (`values` ≤ 100, optional
 *     `total`, optional `hasMore`) beside the REQUIRED `resultType` discriminator
 *     (R-19.4-a – R-19.4-l), reusing the §3.6 `Result` base (`ResultTypeSchema`).
 *   - `buildCompleteResult` / `computeCompletion` — reference helpers that match
 *     against the seed, cap at 100, and signal truncation via `hasMore` / `total`
 *     (R-19.4-c – R-19.4-h, R-19.5-c – R-19.5-h).
 *   - `validateCompleteRequest` — input validation mapping to `-32602`
 *     (missing/malformed params, closed-union violation, unknown ref / unknown
 *     argument) and the `-32601` (no capability) / `-32603` (internal) builders
 *     (R-19.1-d, R-19.5-r – R-19.5-t).
 *
 * Out of scope (owned elsewhere, per the story):
 *   - the definition of prompts and their argument names — S28 (§18);
 *   - resource templates, URI templates, and their variables — S26 (§17);
 *   - the `completions` field within `ServerCapabilities` and the general gating
 *     machinery — S10 (§6);
 *   - the base request/result envelope, `resultType`, and `_meta` semantics —
 *     S03–S05 (§3–§4);
 *   - the canonical `-32601` / `-32602` / `-32603` registry — S34 (§22).
 */

import { z } from 'zod';
import { ResultTypeSchema, RESULT_TYPE } from '../jsonrpc/payload.js';
import { INVALID_PARAMS_CODE, type MetaObject } from './meta.js';
import {
  serverDeclares,
  mayClientInvoke,
  SERVER_METHOD_CAPABILITY,
} from './capability-negotiation.js';
import { type PromptArgument } from './prompts.js';
import { type ResourceTemplate } from './resources.js';

// Re-export the canonical bindings completion callers most often need alongside
// this surface, so they need not reach into S05/S10 directly. These are the SAME
// underlying bindings (not redefinitions); do NOT redefine them.
export { INVALID_PARAMS_CODE } from './meta.js';

// ─── Method name (§19.2) ────────────────────────────────────────────────────────

/**
 * The exact, case-sensitive method string for the single completion request,
 * sent client→server. (§19.2, R-19-a, R-19.2-a)
 *
 * Mirrors the literal already mapped to the `completions` capability by the S10
 * `SERVER_METHOD_CAPABILITY` gate; {@link completionGatedByCompletions} asserts
 * the two agree.
 */
export const COMPLETION_COMPLETE_METHOD = 'completion/complete' as const;

// ─── Error codes (§19.5 error model) ───────────────────────────────────────────

/**
 * Error code returned when a server that has NOT advertised the `completions`
 * capability receives a `completion/complete` request — JSON-RPC `-32601`
 * (Method not found). (R-19.1-d, R-19.5-q)
 *
 * Defined locally so this protocol module does not depend on the HTTP transport
 * layer (which also defines `-32601` as `METHOD_NOT_FOUND_CODE`); S34 owns the
 * canonical registry entry. Mirrors how `PROMPTS_INTERNAL_ERROR_CODE` is defined
 * locally in S28's prompts.ts for the same forward-reference reason.
 */
export const COMPLETION_METHOD_NOT_FOUND_CODE = -32601 as const;

/**
 * Error code for invalid `completion/complete` params — a missing `ref`, a
 * `ref.type` outside the closed union, a missing/malformed `argument`
 * name/value, an unknown prompt or resource template, or an `argument.name` that
 * is not a valid argument of the referenced target. Maps to JSON-RPC `-32602`
 * (Invalid params). (R-19.5-r, R-19.5-s)
 *
 * Reuses the canonical `INVALID_PARAMS_CODE` from S05's meta.ts (same binding).
 */
export const COMPLETION_INVALID_PARAMS_CODE = INVALID_PARAMS_CODE;

/**
 * Error code for an internal failure while computing completions — maps to
 * JSON-RPC `-32603` (Internal error). (R-19.5-j, R-19.5-t)
 *
 * Defined locally for the same transport-decoupling reason as
 * {@link COMPLETION_METHOD_NOT_FOUND_CODE}; S34 owns the canonical registry entry.
 */
export const COMPLETION_INTERNAL_ERROR_CODE = -32603 as const;

/** The maximum number of items the `completion.values` array may carry. (§19.4, R-19.4-c) */
export const MAX_COMPLETION_VALUES = 100 as const;

// ─── CompletionsCapability (§19.1) ─────────────────────────────────────────────

/**
 * The value of the `completions` key in a server's declared capabilities; its
 * PRESENCE (not its contents) declares support for argument autocompletion. It
 * is an OPEN object — the empty object `{}` is the minimum baseline and the
 * RECOMMENDED value. (§19.1, R-19.1-a, R-19.1-b)
 *
 * `.passthrough()` keeps the object open to forward-compatible additions; the
 * shape mirrors the `completions` field already declared in
 * `ServerCapabilitiesSchema` (S10) — this schema lets a server build/validate the
 * capability value standalone.
 */
export const CompletionsCapabilitySchema = z.record(z.unknown());

export type CompletionsCapability = z.infer<typeof CompletionsCapabilitySchema>;

/**
 * Builds the RECOMMENDED baseline `completions` capability value — the empty
 * object `{}`. (§19.1, R-19.1-b, AC-29.1)
 */
export function buildCompletionsCapability(): CompletionsCapability {
  return {};
}

/**
 * Returns `true` when `serverCaps` declares the `completions` capability — the
 * gate a client MUST pass before sending `completion/complete`. (R-19.1-a,
 * R-19.1-c, AC-29.1, AC-29.2)
 *
 * Delegates to `serverDeclares` (S10): presence of the `completions` object means
 * declared.
 */
export function serverDeclaresCompletions(serverCaps: Record<string, unknown>): boolean {
  return serverDeclares(serverCaps, 'completions');
}

/**
 * Returns `true` when a client MAY send `completion/complete` given the server's
 * declared capabilities. A client MUST NOT send it to a server that has not
 * declared `completions`. (R-19.1-c, AC-29.2)
 *
 * Delegates to `mayClientInvoke` (S10), whose `SERVER_METHOD_CAPABILITY` map
 * already gates `completion/complete` on the `completions` capability.
 */
export function mayCallCompletion(serverCaps: Record<string, unknown>): boolean {
  return mayClientInvoke(COMPLETION_COMPLETE_METHOD, serverCaps);
}

/**
 * Returns `true` when the S10 gate binds `completion/complete` to the
 * `completions` capability — a self-check that this module's method constant and
 * the shared capability map agree. (§6.3 / §19.1, R-19.1-a)
 */
export function completionGatedByCompletions(): boolean {
  return SERVER_METHOD_CAPABILITY[COMPLETION_COMPLETE_METHOD] === 'completions';
}

// ─── Reference union (§19.3) ────────────────────────────────────────────────────

/** The `type` discriminator value identifying a prompt reference. (§19.3, R-19.3-a) */
export const PROMPT_REFERENCE_TYPE = 'ref/prompt' as const;

/** The `type` discriminator value identifying a resource / resource-template reference. (§19.3, R-19.3-c) */
export const RESOURCE_TEMPLATE_REFERENCE_TYPE = 'ref/resource' as const;

/**
 * A reference to a prompt being completed. Discriminator: `type === "ref/prompt"`.
 * (§19.3)
 *
 *   - `type` REQUIRED, MUST equal the exact string `"ref/prompt"`. (R-19.3-a)
 *   - `name` REQUIRED — the programmatic name of the prompt (per S28). (R-19.3-b)
 *   - `title` OPTIONAL — human-readable display name; NOT load-bearing for
 *     matching.
 *
 * `.passthrough()` preserves forward-compatible additions.
 */
export const PromptReferenceSchema = z
  .object({
    /** REQUIRED. MUST equal `"ref/prompt"`. (R-19.3-a) */
    type: z.literal(PROMPT_REFERENCE_TYPE),
    /** REQUIRED. Programmatic name of the prompt being completed. (R-19.3-b) */
    name: z.string(),
    /** OPTIONAL. Display name; not matched on. (§19.3) */
    title: z.string().optional(),
  })
  .passthrough();

export type PromptReference = z.infer<typeof PromptReferenceSchema>;

/**
 * A reference to a resource or resource template whose variable is being
 * completed. Discriminator: `type === "ref/resource"`. (§19.3)
 *
 *   - `type` REQUIRED, MUST equal the exact string `"ref/resource"`. (R-19.3-c)
 *   - `uri` REQUIRED — the URI or URI template (per S26). It MAY be a literal URI
 *     or a URI template containing `{…}` variables; when it is a template,
 *     `argument.name` identifies the variable being completed. (R-19.3-d,
 *     R-19.3-e)
 *
 * `.passthrough()` preserves forward-compatible additions.
 */
export const ResourceTemplateReferenceSchema = z
  .object({
    /** REQUIRED. MUST equal `"ref/resource"`. (R-19.3-c) */
    type: z.literal(RESOURCE_TEMPLATE_REFERENCE_TYPE),
    /** REQUIRED. Literal URI or RFC6570 URI template whose variable is completed. (R-19.3-d, R-19.3-e) */
    uri: z.string(),
  })
  .passthrough();

export type ResourceTemplateReference = z.infer<typeof ResourceTemplateReferenceSchema>;

/**
 * The closed `ref` discriminated union: a receiver MUST select the variant by
 * `ref.type` and MUST reject any other `type` value with `-32602`. (§19.3,
 * R-19.2-c – R-19.2-e, R-19.3-f)
 *
 * `z.discriminatedUnion` over `type` is closed by construction: a `ref` whose
 * `type` is neither `"ref/prompt"` nor `"ref/resource"` fails to parse.
 */
export const CompletionReferenceSchema = z.discriminatedUnion('type', [
  PromptReferenceSchema,
  ResourceTemplateReferenceSchema,
]);

export type CompletionReference = z.infer<typeof CompletionReferenceSchema>;

/** Returns `true` when `ref` is a {@link PromptReference}. (R-19.2-d) */
export function isPromptReference(ref: CompletionReference): ref is PromptReference {
  return ref.type === PROMPT_REFERENCE_TYPE;
}

/** Returns `true` when `ref` is a {@link ResourceTemplateReference}. (R-19.2-d) */
export function isResourceTemplateReference(
  ref: CompletionReference,
): ref is ResourceTemplateReference {
  return ref.type === RESOURCE_TEMPLATE_REFERENCE_TYPE;
}

// ─── CompleteRequestParams (§19.2) ─────────────────────────────────────────────

/**
 * The single argument being completed. (§19.2)
 *
 *   - `name` REQUIRED — the name of the argument (a prompt argument name or a
 *     URI-template variable name). (R-19.2-g)
 *   - `value` REQUIRED — the current partial value entered by the user; the match
 *     seed. MAY be the empty string `""` (the server then returns suggestions
 *     appropriate to empty input). (R-19.2-h, R-19.2-i)
 *
 * `.passthrough()` preserves forward-compatible additions.
 */
export const CompletionArgumentSchema = z
  .object({
    /** REQUIRED. Name of the argument being completed. (R-19.2-g) */
    name: z.string(),
    /** REQUIRED. Current partial value / match seed; MAY be `""`. (R-19.2-h, R-19.2-i) */
    value: z.string(),
  })
  .passthrough();

export type CompletionArgument = z.infer<typeof CompletionArgumentSchema>;

/**
 * Additional completion context. (§19.2)
 *
 *   - `arguments` OPTIONAL map<string,string> — already-resolved sibling
 *     argument values used to disambiguate/refine suggestions. Its keys MUST NOT
 *     include the argument named in `argument.name`. (R-19.2-j, R-19.2-k)
 *
 * A server MAY ignore `context` entirely. (R-19.2-l) `.passthrough()` preserves
 * forward-compatible additions.
 */
export const CompletionContextSchema = z
  .object({
    /** OPTIONAL. Already-resolved sibling arguments; keys exclude `argument.name`. (R-19.2-j, R-19.2-k) */
    arguments: z.record(z.string()).optional(),
  })
  .passthrough();

export type CompletionContext = z.infer<typeof CompletionContextSchema>;

/**
 * The `params` of a `completion/complete` request. (§19.2)
 *
 *   - `ref` REQUIRED — the closed `PromptReference | ResourceTemplateReference`
 *     union identifying what is being completed. (R-19.2-b, R-19.2-c)
 *   - `argument` REQUIRED — the single `{ name, value }` being completed.
 *     (R-19.2-f)
 *   - `context` OPTIONAL — `{ arguments? }` for context-sensitive suggestions.
 *     (R-19.2-l)
 *   - `_meta` OPTIONAL — reserved request metadata (§4).
 *
 * `.passthrough()` preserves forward-compatible additions. Schema-level
 * validation of the closed union and the required fields covers R-19.2-b –
 * R-19.2-h and R-19.3-f; {@link validateCompleteRequest} additionally maps these
 * (and unknown-ref / unknown-argument) failures to the `-32602` error object.
 */
export const CompleteRequestParamsSchema = z
  .object({
    /** REQUIRED. What is being completed; closed union discriminated by `type`. (R-19.2-b, R-19.2-c) */
    ref: CompletionReferenceSchema,
    /** REQUIRED. The single argument being completed. (R-19.2-f) */
    argument: CompletionArgumentSchema,
    /** OPTIONAL. Additional completion context. (R-19.2-l) */
    context: CompletionContextSchema.optional(),
    /** OPTIONAL. Reserved request metadata map (§4). */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type CompleteRequestParams = z.infer<typeof CompleteRequestParamsSchema>;

/**
 * Builds a `completion/complete` request `params` object. `context` and `_meta`
 * are included only when supplied — they are never defaulted. (§19.2)
 *
 * A client SHOULD populate `context.arguments` with already-resolved sibling
 * argument values (excluding `argument.name`) to obtain context-sensitive
 * suggestions across a multi-argument prompt or template (R-19.2-j, R-19.5-m); a
 * supplied `context.arguments` is rejected here when it contains `argument.name`
 * (R-19.2-k).
 *
 * @throws {RangeError} When `context.arguments` includes a key equal to
 *   `argument.name` — that key MUST be excluded (R-19.2-k).
 */
export function buildCompleteRequestParams(opts: {
  ref: CompletionReference;
  argument: CompletionArgument;
  context?: CompletionContext;
  _meta?: MetaObject;
}): CompleteRequestParams {
  if (
    opts.context?.arguments !== undefined &&
    Object.prototype.hasOwnProperty.call(opts.context.arguments, opts.argument.name)
  ) {
    throw new RangeError(
      `context.arguments MUST NOT include the argument being completed ("${opts.argument.name}") (R-19.2-k)`,
    );
  }
  const params: CompleteRequestParams = {
    ref: opts.ref,
    argument: opts.argument,
  };
  if (opts.context !== undefined) {
    params.context = opts.context;
  }
  if (opts._meta !== undefined) {
    params._meta = opts._meta;
  }
  return params;
}

// ─── CompleteResult (§19.4) ────────────────────────────────────────────────────

/**
 * The `completion` object wrapping the ranked suggestions. (§19.4)
 *
 *   - `values` REQUIRED `string[]` — candidate values ranked by DESCENDING
 *     relevance (most relevant first). MUST NOT exceed 100 items; MAY be empty.
 *     (R-19.4-b, R-19.4-c, R-19.5-c)
 *   - `total` OPTIONAL number — total matching options available; MAY exceed
 *     `values.length`; unknown when omitted. (R-19.4-f, R-19.4-h)
 *   - `hasMore` OPTIONAL boolean — whether more matches exist beyond `values`;
 *     clients treat omission as `false`. (R-19.4-e, R-19.4-i)
 *
 * The 100-item cap is enforced by `.max(MAX_COMPLETION_VALUES)` so a result that
 * over-fills `values` fails to parse. `.passthrough()` preserves additions.
 */
export const CompletionObjectSchema = z
  .object({
    /** REQUIRED. Ranked candidates, most relevant first; ≤ 100; MAY be empty. (R-19.4-b, R-19.4-c) */
    values: z.array(z.string()).max(MAX_COMPLETION_VALUES, {
      message: `completion.values MUST NOT contain more than ${MAX_COMPLETION_VALUES} items (R-19.4-c)`,
    }),
    /** OPTIONAL. Total matching options; MAY exceed values.length; unknown if omitted. (R-19.4-h) */
    total: z.number().optional(),
    /** OPTIONAL. Whether more matches exist beyond `values`; omission ⇒ false. (R-19.4-i) */
    hasMore: z.boolean().optional(),
  })
  .passthrough();

export type CompletionObject = z.infer<typeof CompletionObjectSchema>;

/**
 * The result of a successful `completion/complete`. (§19.4)
 *
 *   - `completion` REQUIRED — the {@link CompletionObject} of suggestions.
 *     (R-19.4-a)
 *   - `resultType` REQUIRED — `"complete"` for a successful completion; a server
 *     MUST include it, and a client receiving a result that omits it MUST treat
 *     the absent field as `"complete"` (use {@link resolveCompleteResultType}).
 *     (R-19.4-j, R-19.4-k, R-19.4-l)
 *   - `_meta` OPTIONAL — reserved result metadata (§4).
 *
 * Reuses the §3.6 base `ResultTypeSchema` (S04) for the discriminator.
 * `.passthrough()` preserves forward-compatible additions.
 */
export const CompleteResultSchema = z
  .object({
    /** REQUIRED discriminator; `"complete"` for a successful completion. (R-19.4-j, R-19.4-k) */
    resultType: ResultTypeSchema,
    /** REQUIRED. Container for the ranked suggestions. (R-19.4-a) */
    completion: CompletionObjectSchema,
    /** OPTIONAL. Reserved result metadata map (§4). */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type CompleteResult = z.infer<typeof CompleteResultSchema>;

/**
 * Resolves the `resultType` of a received `completion/complete` result, treating
 * an absent value as `"complete"`. (R-19.4-l, AC-29.18)
 *
 * @param result - The raw result object received on the wire.
 */
export function resolveCompleteResultType(result: { resultType?: unknown }): string {
  const raw = result.resultType;
  return raw === undefined || raw === null ? RESULT_TYPE.COMPLETE : String(raw);
}

/**
 * Resolves the `hasMore` truncation hint of a received `completion` object,
 * treating an absent (or non-boolean) value as `false`. (R-19.4-i, AC-29.17)
 *
 * @param completion - The raw `completion` object received on the wire.
 */
export function resolveHasMore(completion: { hasMore?: unknown }): boolean {
  return completion.hasMore === true;
}

/** The server-supplied inputs to a {@link CompleteResult}. */
export interface CompleteResultConfig {
  /** REQUIRED ranked candidate values, most relevant first; capped at 100. (R-19.4-b) */
  values: readonly string[];
  /** OPTIONAL total matching options; MAY exceed `values.length`. (R-19.4-h) */
  total?: number;
  /** OPTIONAL truncation hint; included only when supplied. (R-19.4-e) */
  hasMore?: boolean;
  /** OPTIONAL reserved result metadata map. */
  _meta?: MetaObject;
}

/**
 * Builds a successful `CompleteResult`. `resultType` is set to `"complete"`
 * (R-19.4-j). Optional `total`, `hasMore`, and `_meta` are included only when
 * supplied — they are never defaulted. (§19.4)
 *
 * @throws {RangeError} When more than 100 `values` are supplied — a server with
 *   more than 100 matches MUST cap `values` at 100 (use {@link computeCompletion}
 *   to cap and signal truncation automatically). (R-19.4-c, R-19.4-d, R-19.5-g)
 */
export function buildCompleteResult(config: CompleteResultConfig): CompleteResult {
  if (config.values.length > MAX_COMPLETION_VALUES) {
    throw new RangeError(
      `CompleteResult.completion.values MUST NOT exceed ${MAX_COMPLETION_VALUES} items (R-19.4-c, R-19.4-d)`,
    );
  }
  const completion: CompletionObject = { values: [...config.values] };
  if (config.total !== undefined) {
    completion.total = config.total;
  }
  if (config.hasMore !== undefined) {
    completion.hasMore = config.hasMore;
  }
  const result: CompleteResult = {
    resultType: RESULT_TYPE.COMPLETE,
    completion,
  };
  if (config._meta !== undefined) {
    result._meta = config._meta;
  }
  return result;
}

/**
 * Reference completion engine: caps an already-ranked candidate list at 100 and
 * signals truncation, producing the `completion` object every server MUST emit.
 * (§19.4, R-19.4-c – R-19.4-h, R-19.5-g, R-19.5-h)
 *
 * Behavior:
 *   - `values` is the first {@link MAX_COMPLETION_VALUES} of `ranked` (already in
 *     descending relevance, R-19.5-c). The cap is hard: `values.length` never
 *     exceeds 100 even when `ranked` is far larger. (R-19.4-c, R-19.4-d)
 *   - `total` is set to the FULL number of matches (`ranked.length`) when it
 *     exceeds what is returned, OR to an explicit `opts.total` when the caller
 *     knows of more matches than it materialized. `total` MAY exceed
 *     `values.length`. (R-19.4-f, R-19.4-h)
 *   - `hasMore` is set to `true` when matches were dropped (`total > values`),
 *     SHOULD-signaling truncation. (R-19.4-e, R-19.5-h)
 *
 * Ranking and the match strategy (prefix/substring/fuzzy) are the server's
 * choice and belong to the caller that produces `ranked`; this helper only caps
 * and signals. (R-19.5-c, R-19.5-d)
 *
 * @param ranked - Candidate values already ordered by descending relevance.
 * @param opts   - OPTIONAL `total` override (the true match count when `ranked`
 *   is itself a pre-truncated subset).
 */
export function computeCompletion(
  ranked: readonly string[],
  opts: { total?: number } = {},
): CompletionObject {
  const values = ranked.slice(0, MAX_COMPLETION_VALUES);
  // The true match total: an explicit override (caller knows of more than it
  // materialized) takes precedence over the length of the supplied list.
  const trueTotal = opts.total ?? ranked.length;
  const completion: CompletionObject = { values };
  if (trueTotal > values.length) {
    completion.total = trueTotal;
    completion.hasMore = true;
  }
  return completion;
}

// ─── Server matching (§19.5) ────────────────────────────────────────────────────

/**
 * A reference prefix matcher: returns the `candidates` whose value starts with
 * the seed `argument.value`, in input order. (§19.5, R-19.5-d, AC-29.20)
 *
 * This is the simplest of the SHOULD-permitted strategies (prefix / substring /
 * fuzzy); a server MAY substitute any matcher and any ranking — that choice is
 * the server's. (R-19.5-c, R-19.5-d) When the seed is the empty string `""`,
 * every candidate matches, yielding suggestions appropriate to empty input.
 * (R-19.2-i, AC-29.8)
 *
 * Matching is case-sensitive by default; pass `caseInsensitive` to fold case.
 *
 * @param seed       - The current partial value (`argument.value`).
 * @param candidates - The full candidate pool to match against.
 * @param opts       - OPTIONAL `caseInsensitive` flag.
 */
export function prefixMatch(
  seed: string,
  candidates: readonly string[],
  opts: { caseInsensitive?: boolean } = {},
): string[] {
  if (seed === '') return [...candidates];
  const needle = opts.caseInsensitive ? seed.toLowerCase() : seed;
  return candidates.filter((candidate) => {
    const hay = opts.caseInsensitive ? candidate.toLowerCase() : candidate;
    return hay.startsWith(needle);
  });
}

// ─── Error builders & request validation (§19.5 error model) ───────────────────

/** A JSON-RPC error payload returned by the completion validators. */
export interface CompletionError {
  /**
   * `-32601` (no `completions` capability), `-32602` (invalid params / unknown
   * ref / unknown argument), or `-32603` (internal failure). (R-19.1-d,
   * R-19.5-r – R-19.5-t)
   */
  code:
    | typeof COMPLETION_METHOD_NOT_FOUND_CODE
    | typeof COMPLETION_INVALID_PARAMS_CODE
    | typeof COMPLETION_INTERNAL_ERROR_CODE;
  /** Short human-readable description. */
  message: string;
}

/**
 * Builds the `-32601` (Method not found) error a server returns when it receives
 * `completion/complete` without having advertised the `completions` capability.
 * (R-19.1-d, R-19.5-q, AC-29.2)
 */
export function buildCompletionNotSupportedError(): CompletionError {
  return {
    code: COMPLETION_METHOD_NOT_FOUND_CODE,
    message: `Method not found: ${COMPLETION_COMPLETE_METHOD}`,
  };
}

/**
 * Builds a `-32602` (Invalid params) error for a malformed `completion/complete`
 * request — a missing `ref`, a `ref.type` outside the closed union, or a
 * missing/malformed `argument` name/value. (R-19.5-s, AC-29.4, AC-29.6, AC-29.7)
 *
 * @param detail - Human-readable detail describing what was invalid.
 */
export function buildCompletionInvalidParamsError(detail: string): CompletionError {
  return {
    code: COMPLETION_INVALID_PARAMS_CODE,
    message: `Invalid params: ${detail}`,
  };
}

/**
 * Builds the `-32602` (Invalid params) error a server returns when `ref` names a
 * prompt or resource template the server does not offer, or when `argument.name`
 * is not a valid argument of the referenced target — reported as Invalid params,
 * NOT as a not-found result. (R-19.5-r, AC-29.24)
 *
 * @param detail - Human-readable detail naming the unknown ref or argument.
 */
export function buildUnknownReferenceError(detail: string): CompletionError {
  return {
    code: COMPLETION_INVALID_PARAMS_CODE,
    message: `Invalid params: ${detail}`,
  };
}

/**
 * Builds the `-32603` (Internal error) error a server returns when computing
 * completions fails internally (or a rate limit sheds the request). (R-19.5-j,
 * R-19.5-t, AC-29.21)
 *
 * @param detail - OPTIONAL human-readable detail.
 */
export function buildCompletionInternalError(detail?: string): CompletionError {
  return {
    code: COMPLETION_INTERNAL_ERROR_CODE,
    message: detail ? `Internal error: ${detail}` : 'Internal error',
  };
}

/** Outcome of {@link validateCompleteRequest}. */
export type CompleteRequestValidation =
  | { ok: true; params: CompleteRequestParams }
  | { ok: false; error: CompletionError };

/**
 * Validates a raw `completion/complete` `params` payload against the §19.2/§19.3
 * shape: `ref` REQUIRED and a member of the closed union, `argument` REQUIRED
 * with REQUIRED string `name`/`value`, and (when present) `context.arguments`
 * keys MUST NOT include `argument.name`. (§19.2, §19.3, R-19.2-b – R-19.2-k,
 * R-19.3-f, R-19.5-s)
 *
 * Maps every shape failure to the `-32602` (Invalid params) error. A
 * `ref.type` outside `"ref/prompt"` / `"ref/resource"` is rejected by the closed
 * union (R-19.2-e, R-19.3-f). This validates the request SHAPE only; the
 * unknown-prompt / unknown-template / unknown-argument checks (R-19.5-r) require
 * the server's catalog and are exposed separately via
 * {@link resolveCompletionTarget}.
 *
 * @param params - The raw `completion/complete` request params.
 */
export function validateCompleteRequest(params: unknown): CompleteRequestValidation {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return { ok: false, error: buildCompletionInvalidParamsError('params must be an object') };
  }
  const obj = params as Record<string, unknown>;

  if (obj['ref'] === undefined) {
    return { ok: false, error: buildCompletionInvalidParamsError('"ref" is required') };
  }

  const parsed = CompleteRequestParamsSchema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false,
      error: buildCompletionInvalidParamsError(
        parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
      ),
    };
  }

  // R-19.2-k: a context.arguments key MUST NOT name the argument being completed.
  const ctxArgs = parsed.data.context?.arguments;
  if (
    ctxArgs !== undefined &&
    Object.prototype.hasOwnProperty.call(ctxArgs, parsed.data.argument.name)
  ) {
    return {
      ok: false,
      error: buildCompletionInvalidParamsError(
        `context.arguments MUST NOT include the argument being completed ("${parsed.data.argument.name}")`,
      ),
    };
  }

  return { ok: true, params: parsed.data };
}

// ─── Reference resolution against a server catalog (§19.5) ─────────────────────

/**
 * The set of valid argument names a given `ref` may complete, supplied by the
 * server's catalog so {@link resolveCompletionTarget} can detect an unknown ref
 * or an argument that is not part of the referenced target. (R-19.5-r)
 *
 * A `PromptReference` is resolved against the server's offered prompts (looked up
 * by `name`); a `ResourceTemplateReference` against the offered resource
 * templates (looked up by `uri`/`uriTemplate`). A target found but carrying an
 * empty argument-name set is still "known" — only an absent target is unknown.
 */
export interface CompletionCatalog {
  /** Resolves the declared argument names of a prompt, or `undefined` when unknown. */
  promptArgumentNames(name: string): readonly string[] | undefined;
  /** Resolves the declared variable names of a resource template, or `undefined` when unknown. */
  resourceTemplateVariableNames(uri: string): readonly string[] | undefined;
}

/** Outcome of {@link resolveCompletionTarget}. */
export type CompletionTargetResolution =
  | { ok: true }
  | { ok: false; error: CompletionError };

/**
 * Resolves a validated `ref` + `argument.name` against the server's catalog,
 * enforcing R-19.5-r: an unknown prompt / unknown resource template, or an
 * `argument.name` that is not a valid argument of the referenced target, MUST be
 * rejected with `-32602` (Invalid params) — NOT a not-found result. (R-19.5-r,
 * AC-29.24)
 *
 * The `ref` is selected by `ref.type` (R-19.2-d): a `PromptReference` resolves
 * against {@link CompletionCatalog.promptArgumentNames}, a
 * `ResourceTemplateReference` against
 * {@link CompletionCatalog.resourceTemplateVariableNames}.
 *
 * @param params  - A `completion/complete` params object already validated for
 *   shape by {@link validateCompleteRequest}.
 * @param catalog - The server's prompt / resource-template catalog.
 */
export function resolveCompletionTarget(
  params: CompleteRequestParams,
  catalog: CompletionCatalog,
): CompletionTargetResolution {
  const argName = params.argument.name;

  if (isPromptReference(params.ref)) {
    const names = catalog.promptArgumentNames(params.ref.name);
    if (names === undefined) {
      return { ok: false, error: buildUnknownReferenceError(`unknown prompt "${params.ref.name}"`) };
    }
    if (!names.includes(argName)) {
      return {
        ok: false,
        error: buildUnknownReferenceError(
          `prompt "${params.ref.name}" has no argument "${argName}"`,
        ),
      };
    }
    return { ok: true };
  }

  // ResourceTemplateReference — select by ref.type (R-19.2-d).
  const variables = catalog.resourceTemplateVariableNames(params.ref.uri);
  if (variables === undefined) {
    return {
      ok: false,
      error: buildUnknownReferenceError(`unknown resource template "${params.ref.uri}"`),
    };
  }
  if (!variables.includes(argName)) {
    return {
      ok: false,
      error: buildUnknownReferenceError(
        `resource template "${params.ref.uri}" has no variable "${argName}"`,
      ),
    };
  }
  return { ok: true };
}

/**
 * Returns the declared argument names of a `Prompt` for use in a
 * {@link CompletionCatalog}. Reuses the S28 `PromptArgument` shape (NOT
 * redefined). A prompt with no `arguments` declares none. (R-19.5-r via §18.3)
 */
export function promptArgumentNamesOf(
  prompt: { arguments?: readonly Pick<PromptArgument, 'name'>[] },
): string[] {
  return (prompt.arguments ?? []).map((arg) => arg.name);
}

/**
 * Returns the URI-template variable names of a `ResourceTemplate` for use in a
 * {@link CompletionCatalog}. The variable extraction itself is owned by S26
 * (`uriTemplateVariables`); this only narrows the field a caller passes in. A
 * literal URI (no `{…}` variables) yields `[]`. (R-19.3-e, R-19.5-r via §17.4)
 *
 * Pass the already-extracted variable names (e.g. from S26's
 * `uriTemplateVariables(template.uriTemplate)`) — this helper exists so callers
 * keep the S26 binding as the single source of template-variable parsing.
 */
export function resourceTemplateVariableNamesOf(
  template: Pick<ResourceTemplate, 'uriTemplate'>,
  extractVariables: (uriTemplate: string) => readonly string[],
): string[] {
  return [...extractVariables(template.uriTemplate)];
}

// ─── Client-side request debouncing (§19.5, R-19.5-n — SHOULD) ───────────────────

/**
 * Wraps a completion runner so rapid successive calls (e.g. one per keystroke)
 * are coalesced into a single in-flight `completion/complete` request: each call
 * resets a `waitMs` timer, and only the final value after a quiet period is sent.
 * All callers awaiting during a burst resolve with that single result. (§19.5
 * line 4882, R-19.5-n)
 *
 * Edge-friendly: uses only `setTimeout`/`clearTimeout` (no `node:*`).
 *
 * @param run    - Issues the actual `completion/complete` for an argument value.
 * @param waitMs - Quiet period before the coalesced call fires. Default 150ms.
 */
export function createCompletionDebouncer<T>(
  run: (value: string) => Promise<T>,
  waitMs = 150,
): (value: string) => Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiters: Array<{ resolve: (value: T) => void; reject: (reason: unknown) => void }> = [];

  return (value: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiters.push({ resolve, reject });
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        const batch = waiters;
        waiters = [];
        timer = undefined;
        run(value).then(
          (result) => batch.forEach((w) => w.resolve(result)),
          (error) => batch.forEach((w) => w.reject(error)),
        );
      }, waitMs);
    });
}
