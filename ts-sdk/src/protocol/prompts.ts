/**
 * S28 — Prompts (§18).
 *
 * Prompts are server-offered templates that produce structured conversation
 * messages and instructions for interacting with a language model. A server
 * exposes named prompts (optionally accepting arguments) that a client discovers
 * via `prompts/list` and retrieves via `prompts/get`. Prompts are
 * user-controlled: they are surfaced from servers so a user explicitly selects
 * them (for example as slash commands). The protocol mandates NO specific
 * user-interaction pattern. (§18, R-18-a)
 *
 * This module provides:
 *   - `PromptsCapabilitySchema` — the `prompts` capability object with its
 *     OPTIONAL `listChanged` sub-flag (R-18.1-a – R-18.1-f). Gating reuses
 *     `serverDeclares` / `mayClientInvoke` / `clientShouldExpectNotification`
 *     from capability-negotiation (S10).
 *   - `PromptArgumentSchema`, `PromptSchema` — the `Prompt` descriptor (built on
 *     `BaseMetadata` + `Icons` from S20) and its `PromptArgument` (R-18.3-*).
 *   - `ListPromptsRequestParamsSchema` / `ListPromptsResultSchema` — the
 *     paginated (S18) + cacheable (S19) + result-typed (S04) list exchange
 *     (R-18.2-*).
 *   - `GetPromptRequestParamsSchema` / `GetPromptResultSchema` — the
 *     argument-rendered retrieval (R-18.4-*), reusing the S17 multi-round-trip
 *     fields (`inputResponses` / `requestState`) and `InputRequiredResult`.
 *   - `PromptMessageSchema` — one `{ role, content }` message reusing `RoleSchema`
 *     and `ContentBlockSchema` from S20/S21 (R-18.5-*).
 *   - `PromptListChangedNotificationSchema` — the `notifications/prompts/list_changed`
 *     notification (method constant reused from streaming/S16) (R-18.6-*).
 *   - validation / construction helpers honoring the §18 MUST/SHOULD/MAY rules,
 *     including the `-32602` (unknown name, missing required argument) and
 *     `-32603` (internal failure) error model (R-18.4-s).
 *
 * Out of scope (owned elsewhere, per the story):
 *   - capability machinery and the general gating rule — S10 (§6);
 *   - the `Cursor` type and pagination mechanics — S18 (§12);
 *   - the caching mechanics behind `ttlMs` / `cacheScope` — S19 (§13);
 *   - the `ContentBlock` union field shapes and the `Role` enum — S21 (§14.4-§14.9);
 *   - the `Icon` shape, its MIME/trust rules, and `BaseMetadata` — S20 (§14.1-§14.3);
 *   - the multi-round-trip algorithm and `InputRequiredResult` — S17 (§11);
 *   - the subscription stream carrying the list-changed notification — S16 (§10);
 *   - the Completion request/result wire shapes — S29 (§19);
 *   - the canonical `-32602` / `-32603` definitions — S04 / S34 (§3 / §22).
 */

import { z } from 'zod';
import { ResultTypeSchema, RESULT_TYPE } from '../jsonrpc/payload.js';
import { RoleSchema } from '../types/role.js';
import { ContentBlockSchema } from '../types/content.js';
import { BaseMetadataSchema } from '../types/base-metadata.js';
import { IconSchema } from '../types/icon.js';
import { CacheScopeSchema, type CacheScope } from './caching.js';
import { PaginatedRequestParamsSchema } from './pagination.js';
import { INVALID_PARAMS_CODE, type MetaObject } from './meta.js';
import {
  serverDeclares,
  mayClientInvoke,
  clientShouldExpectNotification,
} from './capability-negotiation.js';
import {
  PROMPTS_LIST_CHANGED_METHOD,
} from './streaming.js';
import {
  RESULT_TYPE as MRTR_RESULT_TYPE,
  InputRequiredResultSchema,
  discriminateResultType,
  type InputRequiredResult,
} from './multi-round-trip.js';

// Re-export the canonical bindings prompt callers most often need alongside the
// prompts surface, so they need not reach into S16/S10/S04 directly. These are
// the SAME underlying bindings (not redefinitions).
export { PROMPTS_LIST_CHANGED_METHOD } from './streaming.js';
export { INVALID_PARAMS_CODE } from './meta.js';

// ─── Method names ───────────────────────────────────────────────────────────────

/** The exact method string for the paginated prompt-discovery request. (§18.2) */
export const PROMPTS_LIST_METHOD = 'prompts/list' as const;

/** The exact method string for the prompt-retrieval request. (§18.4) */
export const PROMPTS_GET_METHOD = 'prompts/get' as const;

// ─── Error codes (§18.4 error model) ───────────────────────────────────────────

/**
 * Error code for an unknown prompt name or a missing required argument in
 * `prompts/get` — both map to JSON-RPC `-32602` (Invalid params). (R-18.4-s,
 * R-18.3-m, R-18.4-d, R-18.4-g)
 *
 * Reuses the canonical `INVALID_PARAMS_CODE` from S05's meta.ts (same binding).
 */
export const PROMPTS_INVALID_PARAMS_CODE = INVALID_PARAMS_CODE;

/**
 * Error code for an internal failure while resolving a `prompts/get` — maps to
 * JSON-RPC `-32603` (Internal error). (R-18.4-s)
 *
 * Defined locally so this protocol module does not depend on the HTTP transport
 * layer (which also defines `-32603`); S34 owns the canonical registry entry.
 */
export const PROMPTS_INTERNAL_ERROR_CODE = -32603 as const;

// ─── PromptsCapability (§18.1) ─────────────────────────────────────────────────

/**
 * The value of the `prompts` key in a server's declared capabilities; presence of
 * the key declares the feature. (§18.1, R-18.1-a)
 *
 * `listChanged` (OPTIONAL boolean): when `true`, the server MAY emit
 * `notifications/prompts/list_changed` when its prompt set changes. When absent or
 * `false`, the server MUST NOT be expected to emit it and a client MUST NOT rely
 * on receiving it. (R-18.1-c – R-18.1-f)
 *
 * Both forms — present `{ listChanged }` and bare `{}` — are accepted (AC-28.4).
 * `.passthrough()` preserves forward-compatible additions. The exact shape mirrors
 * the `prompts` field already declared in `ServerCapabilitiesSchema` (S10); this
 * schema lets a server build/validate that capability value standalone.
 */
export const PromptsCapabilitySchema = z
  .object({
    /** OPTIONAL. When `true`, the server MAY emit list-changed notifications. (R-18.1-c, R-18.1-d) */
    listChanged: z.boolean().optional(),
  })
  .passthrough();

export type PromptsCapability = z.infer<typeof PromptsCapabilitySchema>;

/**
 * Returns `true` when `serverCaps` declares the `prompts` capability — the gate a
 * client MUST pass before sending `prompts/list` or `prompts/get`. (R-18.1-a,
 * R-18.1-b, AC-28.2, AC-28.3)
 *
 * Delegates to `serverDeclares` (S10): presence of the `prompts` object means
 * declared.
 */
export function serverDeclaresPrompts(serverCaps: Record<string, unknown>): boolean {
  return serverDeclares(serverCaps, 'prompts');
}

/**
 * Returns `true` when a client MAY send `method` (`prompts/list` or `prompts/get`)
 * given the server's declared capabilities. A client MUST NOT send either method
 * to a server that has not declared `prompts`. (R-18.1-b, AC-28.3)
 *
 * Delegates to `mayClientInvoke` (S10), whose method→capability map already gates
 * both prompt methods on the `prompts` capability.
 */
export function mayCallPromptMethod(
  method: string,
  serverCaps: Record<string, unknown>,
): boolean {
  return mayClientInvoke(method, serverCaps);
}

/**
 * Returns `true` when a client may expect `notifications/prompts/list_changed`
 * from a server — i.e. the server declared `prompts.listChanged: true`. When the
 * sub-flag is absent or `false`, a client MUST NOT rely on receiving it.
 * (R-18.1-e, R-18.1-f, R-18.6-g, AC-28.6, AC-28.39)
 *
 * Delegates to `clientShouldExpectNotification` (S10), whose gating map already
 * ties this notification to `prompts.listChanged`.
 */
export function mayExpectPromptsListChanged(serverCaps: Record<string, unknown>): boolean {
  return clientShouldExpectNotification(PROMPTS_LIST_CHANGED_METHOD, serverCaps);
}

// ─── PromptArgument (§18.3) ─────────────────────────────────────────────────────

/**
 * One argument a prompt accepts for templating. Carries `BaseMetadata` (§14.1):
 * a REQUIRED `name` and OPTIONAL `title`. (§18.3)
 *
 * Field constraints (R-18.3-j – R-18.3-l):
 *   - `name` REQUIRED — the key under which the client supplies a value in the
 *     `arguments` map of `prompts/get`.
 *   - `title` OPTIONAL — when absent, `name` SHOULD be used for display
 *     (use {@link resolveDisplayName} from S20).
 *   - `description` OPTIONAL — human-readable description.
 *   - `required` OPTIONAL boolean — when `true`, the argument MUST be supplied in
 *     a `prompts/get` request.
 *
 * `.passthrough()` preserves forward-compatible additions.
 */
export const PromptArgumentSchema = BaseMetadataSchema.extend({
  /** OPTIONAL. Human-readable description of the argument. (§18.3) */
  description: z.string().optional(),
  /** OPTIONAL. When `true`, the argument MUST be provided in `prompts/get`. (R-18.3-l) */
  required: z.boolean().optional(),
}).passthrough();

export type PromptArgument = z.infer<typeof PromptArgumentSchema>;

// ─── Prompt (§18.3) ─────────────────────────────────────────────────────────────

/**
 * A single prompt (or prompt template) offered by the server. Carries
 * `BaseMetadata` (`name` REQUIRED, `title` OPTIONAL, §14.1) and an OPTIONAL icon
 * set (§14.2). (§18.3)
 *
 * Field constraints (R-18.3-a – R-18.3-d):
 *   - `name` REQUIRED — the value a client supplies in `prompts/get`; display-name
 *     fallback when `title` is absent (R-18.3-b — use {@link resolveDisplayName}).
 *   - `title` OPTIONAL — human-readable display name.
 *   - `description` OPTIONAL — human-readable description.
 *   - `arguments` OPTIONAL `PromptArgument[]` — when absent or empty the prompt
 *     accepts no arguments (R-18.3-c, AC-28.22).
 *   - `icons` OPTIONAL `Icon[]` — sized icons the client MAY display. The `Icon`
 *     shape and its MIME-type / trust / SVG-script rules are owned and validated
 *     by S20 (§14.2); this schema only carries the field. (R-18.3-d – R-18.3-i)
 *   - `_meta` OPTIONAL — reserved metadata map (§14).
 *
 * `.passthrough()` preserves forward-compatible additions.
 */
export const PromptSchema = BaseMetadataSchema.extend({
  /** OPTIONAL. Human-readable description of what the prompt provides. (§18.3) */
  description: z.string().optional(),
  /** OPTIONAL. Arguments accepted for templating; absent/empty ⇒ none. (R-18.3-c) */
  arguments: z.array(PromptArgumentSchema).optional(),
  /** OPTIONAL. Sized icons the client MAY display; shape/rules owned by S20. (R-18.3-d) */
  icons: z.array(IconSchema).optional(),
  /** OPTIONAL. Reserved metadata map (§14). */
  _meta: z.record(z.unknown()).optional(),
}).passthrough();

export type Prompt = z.infer<typeof PromptSchema>;

/**
 * Returns the names of every argument the prompt declares with `required: true` —
 * the set a `prompts/get` request MUST supply a value for. (R-18.3-l, R-18.4-e,
 * AC-28.27)
 *
 * A prompt with no `arguments` (absent or empty) requires none. (R-18.3-c)
 */
export function requiredArgumentNames(prompt: Pick<Prompt, 'arguments'>): string[] {
  return (prompt.arguments ?? [])
    .filter((arg) => arg.required === true)
    .map((arg) => arg.name);
}

// ─── PromptMessage (§18.5) ─────────────────────────────────────────────────────

/**
 * One message within a prompt: a `role` paired with EXACTLY ONE content block.
 * (§18.5)
 *
 *   - `role` REQUIRED — `"user"` or `"assistant"` (reuses `RoleSchema`, S21 §14.7).
 *     (R-18.5-a)
 *   - `content` REQUIRED — a single `ContentBlock` object, NOT an array (reuses
 *     `ContentBlockSchema`, S21 §14.4). Valid kinds: text, image, audio,
 *     resource_link, embedded resource. (R-18.5-b, R-18.5-c)
 *
 * `.passthrough()` preserves forward-compatible additions.
 */
export const PromptMessageSchema = z
  .object({
    /** REQUIRED. The speaker; `"user"` or `"assistant"`. (R-18.5-a) */
    role: RoleSchema,
    /** REQUIRED. Exactly one content block — a single object, not an array. (R-18.5-b) */
    content: ContentBlockSchema,
  })
  .passthrough();

export type PromptMessage = z.infer<typeof PromptMessageSchema>;

// ─── ListPromptsRequest (§18.2) ────────────────────────────────────────────────

/**
 * The `params` of a `prompts/list` request: the paginated request shape (S18)
 * carrying an OPTIONAL opaque `cursor` and OPTIONAL `_meta`. (§18.2)
 *
 * `cursor` is treated as opaque — a client MUST NOT construct, parse, or modify
 * it; it is echoed back verbatim from a prior `nextCursor`. (R-18.2-a – R-18.2-c,
 * AC-28.11). Reuses `PaginatedRequestParamsSchema` (S18) rather than redefining
 * the cursor field.
 */
export const ListPromptsRequestParamsSchema = PaginatedRequestParamsSchema;

export type ListPromptsRequestParams = z.infer<typeof ListPromptsRequestParamsSchema>;

// ─── ListPromptsResult (§18.2) ─────────────────────────────────────────────────

/**
 * The result of `prompts/list`: simultaneously a paginated result (§12), a
 * cacheable result (§13), and a result-typed result (§3). (§18.2)
 *
 * Field constraints (R-18.2-d – R-18.2-q):
 *   - `prompts` REQUIRED `Prompt[]` — the page; MAY be empty (R-18.2-d, AC-28.12).
 *   - `nextCursor` OPTIONAL opaque token — when present the client MAY fetch the
 *     next page by setting `params.cursor` to it; treated as opaque (R-18.2-e –
 *     R-18.2-g, AC-28.13).
 *   - `ttlMs` REQUIRED non-negative integer (§13). `0` ⇒ immediately stale;
 *     positive ⇒ fresh that many ms after receipt (R-18.2-h – R-18.2-k). A
 *     negative value is rejected (AC-28.14).
 *   - `cacheScope` REQUIRED `"public" | "private"` (§13). `"private"` MUST NOT be
 *     served by a shared cache to a different user (R-18.2-l, R-18.2-m, AC-28.17).
 *   - `resultType` REQUIRED — `"complete"` for a completed list (R-18.2-n,
 *     R-18.2-o). Absence is treated as `"complete"` by the client (R-18.2-p — use
 *     {@link resolveListPromptsResultType}).
 *   - `_meta` OPTIONAL reserved metadata map (R-18.2-q).
 *
 * `ttlMs`/`cacheScope` reuse the S19 schemas (`z.number().int().nonnegative()` /
 * `CacheScopeSchema`); `nextCursor`/`resultType`/`_meta` mirror the paginated/base
 * shapes. `.passthrough()` preserves forward-compatible additions.
 */
export const ListPromptsResultSchema = z
  .object({
    /**
     * REQUIRED discriminator. §18.2 fixes a prompts-list result to `"complete"`;
     * any other value (e.g. `"input_required"`) MUST be rejected — a list never
     * solicits input. (An absent value is treated as `"complete"` by a consumer
     * via {@link resolveListPromptsResultType}, R-18.2-o.) (R-18.2-n)
     */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** REQUIRED. The prompts on this page; MAY be empty. (R-18.2-d) */
    prompts: z.array(PromptSchema),
    /** OPTIONAL. Opaque next-page token; absent ⇒ no further pages. (R-18.2-e – R-18.2-g) */
    nextCursor: z.string().optional(),
    /** REQUIRED. Cache freshness hint in ms, minimum 0. (R-18.2-h) */
    ttlMs: z.number().int().nonnegative(),
    /** REQUIRED. Cache-sharing scope `"public" | "private"`. (R-18.2-l) */
    cacheScope: CacheScopeSchema,
    /** OPTIONAL. Reserved metadata map (§14). (R-18.2-q) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ListPromptsResult = z.infer<typeof ListPromptsResultSchema>;

/**
 * Resolves the `resultType` of a received `prompts/list` result, treating an
 * absent value as `"complete"`. (R-18.2-p, AC-28.18)
 *
 * @param result - The raw result object received on the wire.
 */
export function resolveListPromptsResultType(result: { resultType?: unknown }): string {
  const raw = result.resultType;
  return raw === undefined || raw === null ? RESULT_TYPE.COMPLETE : String(raw);
}

/** The server-supplied inputs to a `ListPromptsResult`. */
export interface ListPromptsResultConfig {
  /** The prompts on this page; MAY be empty. (R-18.2-d) */
  prompts: readonly Prompt[];
  /** OPTIONAL opaque next-page token. (R-18.2-e) */
  nextCursor?: string;
  /** REQUIRED cache freshness hint in ms, minimum 0. (R-18.2-h) */
  ttlMs: number;
  /** REQUIRED cache-sharing scope. (R-18.2-l) */
  cacheScope: CacheScope;
  /** OPTIONAL reserved metadata map. (R-18.2-q) */
  _meta?: MetaObject;
}

/**
 * Builds a completed `ListPromptsResult`. `resultType` is set to `"complete"`
 * (R-18.2-n); optional `nextCursor` and `_meta` are included only when supplied —
 * they are never defaulted. (§18.2)
 *
 * @throws {RangeError} When `config.ttlMs` is negative or non-integer — `ttlMs`
 *   has a minimum of 0 (R-18.2-h).
 */
export function buildListPromptsResult(config: ListPromptsResultConfig): ListPromptsResult {
  if (!Number.isInteger(config.ttlMs) || config.ttlMs < 0) {
    throw new RangeError('ListPromptsResult.ttlMs MUST be a non-negative integer (R-18.2-h)');
  }
  const result: ListPromptsResult = {
    resultType: RESULT_TYPE.COMPLETE,
    prompts: [...config.prompts],
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

// ─── GetPromptRequest (§18.4) ──────────────────────────────────────────────────

/**
 * The `params` of a `prompts/get` request. May participate in a multi-round-trip
 * exchange (§11), so it carries the S17 retry fields. (§18.4)
 *
 * Field constraints (R-18.4-a – R-18.4-k):
 *   - `name` REQUIRED — the prompt to retrieve; MUST match a `Prompt.name` the
 *     server offers (R-18.4-b, R-18.4-c).
 *   - `arguments` OPTIONAL map<string,string> — values keyed by
 *     `PromptArgument.name`; MUST include every `required: true` argument
 *     (R-18.4-e).
 *   - `inputResponses` OPTIONAL map<string,unknown> — multi-round-trip retry
 *     responses (§11); for each key in the server's prior `inputRequests`, the
 *     same key MUST appear here (R-18.4-h). Omitted on a first attempt.
 *   - `requestState` OPTIONAL opaque string — echoed verbatim on retry; treated as
 *     opaque (R-18.4-i – R-18.4-k). Omitted on a first attempt.
 *   - `_meta` OPTIONAL reserved metadata map.
 *
 * `_meta` is REQUIRED on the wire (every client request carries it, S04), so it is
 * modeled as a required record here, matching `RequestParamsSchema`.
 * `.passthrough()` preserves forward-compatible additions.
 */
export const GetPromptRequestParamsSchema = z
  .object({
    /** REQUIRED. The prompt name to retrieve; matches `Prompt.name`. (R-18.4-b, R-18.4-c) */
    name: z.string(),
    /** OPTIONAL. Argument values keyed by `PromptArgument.name`; each a JSON string. */
    arguments: z.record(z.string()).optional(),
    /** OPTIONAL. Multi-round-trip retry responses, keyed by `inputRequests` keys (§11). (R-18.4-h) */
    inputResponses: z.record(z.unknown()).optional(),
    /** OPTIONAL. Opaque multi-round-trip state echoed verbatim on retry (§11). (R-18.4-i) */
    requestState: z.string().optional(),
    /** REQUIRED per-request metadata envelope (§4 / S05). */
    _meta: z.record(z.unknown()),
  })
  .passthrough();

export type GetPromptRequestParams = z.infer<typeof GetPromptRequestParamsSchema>;

// ─── GetPromptResult (§18.4) ───────────────────────────────────────────────────

/**
 * The result of a successful, completed `prompts/get`. (§18.4)
 *
 * Field constraints (R-18.4-l – R-18.4-p):
 *   - `description` OPTIONAL — human-readable description of the rendered prompt.
 *   - `messages` REQUIRED `PromptMessage[]` — the ordered messages; MAY contain
 *     one or several (R-18.4-l, R-18.4-m, AC-28.33).
 *   - `resultType` REQUIRED — `"complete"` for a completed prompt (R-18.4-n,
 *     R-18.4-o). Absence is treated as `"complete"` (R-18.4-p — use
 *     {@link resolveGetPromptResultType}).
 *   - `_meta` OPTIONAL reserved metadata map.
 *
 * When the server needs more input it returns an `InputRequiredResult` instead
 * (signalled by `resultType: "input_required"`, §11 / S17) — see
 * {@link discriminateGetPromptResponse}. `.passthrough()` preserves additions.
 */
export const GetPromptResultSchema = z
  .object({
    /** REQUIRED discriminator; `"complete"` for a completed prompt. (R-18.4-n, R-18.4-o) */
    resultType: ResultTypeSchema,
    /** OPTIONAL. Human-readable description of the rendered prompt. (§18.4) */
    description: z.string().optional(),
    /** REQUIRED. Ordered messages constituting the prompt; one or several. (R-18.4-l, R-18.4-m) */
    messages: z.array(PromptMessageSchema),
    /** OPTIONAL. Reserved metadata map (§14). */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type GetPromptResult = z.infer<typeof GetPromptResultSchema>;

/**
 * Resolves the `resultType` of a received `prompts/get` result, treating an absent
 * value as `"complete"`. (R-18.4-p, AC-28.34)
 *
 * @param result - The raw result object received on the wire.
 */
export function resolveGetPromptResultType(result: { resultType?: unknown }): string {
  const raw = result.resultType;
  return raw === undefined || raw === null ? RESULT_TYPE.COMPLETE : String(raw);
}

/** The server-supplied inputs to a completed `GetPromptResult`. */
export interface GetPromptResultConfig {
  /** REQUIRED ordered messages; one or several. (R-18.4-l, R-18.4-m) */
  messages: readonly PromptMessage[];
  /** OPTIONAL description of the rendered prompt. (§18.4) */
  description?: string;
  /** OPTIONAL reserved metadata map. */
  _meta?: MetaObject;
}

/**
 * Builds a completed `GetPromptResult`. `resultType` is set to `"complete"`
 * (R-18.4-n); optional `description` and `_meta` are included only when supplied.
 * (§18.4)
 */
export function buildGetPromptResult(config: GetPromptResultConfig): GetPromptResult {
  const result: GetPromptResult = {
    resultType: RESULT_TYPE.COMPLETE,
    messages: [...config.messages],
  };
  if (config.description !== undefined) {
    result.description = config.description;
  }
  if (config._meta !== undefined) {
    result._meta = config._meta;
  }
  return result;
}

// ─── prompts/get response discrimination (§18.4 / §11) ─────────────────────────

/**
 * What a client should do after receiving a `prompts/get` response. A client MUST
 * inspect `resultType` before parsing the body. (R-18.4-r, AC-28.35)
 */
export type GetPromptResponseDiscrimination =
  | { kind: 'complete'; result: GetPromptResult }
  | { kind: 'input_required'; result: InputRequiredResult }
  | { kind: 'error'; reason: string; resultType: string | undefined };

/**
 * Branches a `prompts/get` response on its `resultType` discriminator. (R-18.4-q,
 * R-18.4-r, AC-28.35)
 *
 *   - `"complete"` (or absent, R-18.4-p) and a well-formed `GetPromptResult` →
 *     `{ kind: "complete", result }`.
 *   - `"input_required"` and a well-formed `InputRequiredResult` (§11 / S17) →
 *     `{ kind: "input_required", result }`.
 *   - any unrecognized `resultType`, or a body that fails its schema →
 *     `{ kind: "error" }`.
 *
 * Reuses `discriminateResultType` (S17) for the result-type branching so the
 * §3.6/§11.5 receiver rules (absent ⇒ complete; unrecognized ⇒ error) apply
 * uniformly, then validates the completed body against `GetPromptResultSchema`.
 *
 * @param response - The raw `result` object received on the wire.
 */
export function discriminateGetPromptResponse(
  response: unknown,
): GetPromptResponseDiscrimination {
  const branch = discriminateResultType(response);
  if (branch.action === 'input_required') {
    return { kind: 'input_required', result: branch.result };
  }
  if (branch.action === 'error') {
    return { kind: 'error', reason: branch.reason, resultType: branch.resultType };
  }
  // action === 'complete' — validate the GetPromptResult body.
  const parsed = GetPromptResultSchema.safeParse(
    addCompleteResultType(response),
  );
  if (!parsed.success) {
    return {
      kind: 'error',
      reason: `Malformed GetPromptResult: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      resultType: RESULT_TYPE.COMPLETE,
    };
  }
  return { kind: 'complete', result: parsed.data };
}

/**
 * Returns `response` with `resultType` defaulted to `"complete"` when absent, so a
 * server that omitted the field still validates against the result schema.
 * (R-18.4-p) Internal helper for {@link discriminateGetPromptResponse}.
 */
function addCompleteResultType(response: unknown): unknown {
  if (
    typeof response === 'object' &&
    response !== null &&
    !Array.isArray(response) &&
    (response as Record<string, unknown>)['resultType'] === undefined
  ) {
    return { ...(response as Record<string, unknown>), resultType: RESULT_TYPE.COMPLETE };
  }
  return response;
}

// ─── prompts/get validation & error model (§18.4) ──────────────────────────────

/** A JSON-RPC error payload returned by the `prompts/get` validators. */
export interface PromptsGetError {
  /** `-32602` for invalid params; `-32603` for an internal failure. (R-18.4-s) */
  code: typeof PROMPTS_INVALID_PARAMS_CODE | typeof PROMPTS_INTERNAL_ERROR_CODE;
  /** Short human-readable description. */
  message: string;
}

/**
 * Builds the `-32602` (Invalid params) error a server returns when a `prompts/get`
 * names a prompt it does not offer. (R-18.4-d, R-18.4-s, AC-28.29)
 *
 * @param name - The unknown prompt name the client supplied.
 */
export function buildUnknownPromptError(name: string): PromptsGetError {
  return {
    code: PROMPTS_INVALID_PARAMS_CODE,
    message: `Invalid params: unknown prompt "${name}"`,
  };
}

/**
 * Builds the `-32602` (Invalid params) error a server returns when a `prompts/get`
 * omits one or more arguments the prompt declares `required: true`. (R-18.3-m,
 * R-18.4-g, R-18.4-s, AC-28.27, AC-28.30)
 *
 * @param missing - The names of the omitted required arguments.
 */
export function buildMissingArgumentError(missing: readonly string[]): PromptsGetError {
  return {
    code: PROMPTS_INVALID_PARAMS_CODE,
    message: `Invalid params: missing required argument(s): ${missing.join(', ')}`,
  };
}

/**
 * Builds the `-32603` (Internal error) error a server returns when resolving a
 * `prompts/get` fails internally. (R-18.4-s, AC-28.36)
 *
 * @param detail - OPTIONAL human-readable detail.
 */
export function buildPromptInternalError(detail?: string): PromptsGetError {
  return {
    code: PROMPTS_INTERNAL_ERROR_CODE,
    message: detail ? `Internal error: ${detail}` : 'Internal error',
  };
}

/** Outcome of {@link validateGetPromptRequest}. */
export type GetPromptRequestValidation =
  | { ok: true; name: string; arguments: Record<string, string> }
  | { ok: false; error: PromptsGetError };

/**
 * Validates a `prompts/get` request against the server's offered prompts: it MUST
 * name a prompt the server offers, and MUST supply every argument that prompt
 * declares `required: true`. (R-18.4-c – R-18.4-g, AC-28.29, AC-28.30)
 *
 * On failure returns the mapped `-32602` error (unknown name OR missing required
 * argument); a server SHOULD validate arguments before processing (R-18.4-f). The
 * unknown-name check runs first, then the required-argument check.
 *
 * @param params  - The `prompts/get` request params (`name` + optional `arguments`).
 * @param offered - The prompts the server offers, used to look up the named prompt
 *   and its declared arguments (an array of `Prompt`, or a `name → Prompt` map).
 */
export function validateGetPromptRequest(
  params: { name: string; arguments?: Record<string, string> },
  offered: readonly Prompt[] | ReadonlyMap<string, Prompt>,
): GetPromptRequestValidation {
  const prompt = lookupPrompt(params.name, offered);
  if (prompt === undefined) {
    return { ok: false, error: buildUnknownPromptError(params.name) };
  }

  const supplied = params.arguments ?? {};
  const missing = requiredArgumentNames(prompt).filter(
    (argName) => !Object.prototype.hasOwnProperty.call(supplied, argName),
  );
  if (missing.length > 0) {
    return { ok: false, error: buildMissingArgumentError(missing) };
  }

  return { ok: true, name: params.name, arguments: { ...supplied } };
}

/** Resolves a prompt by name from either an array or a `name → Prompt` map. */
function lookupPrompt(
  name: string,
  offered: readonly Prompt[] | ReadonlyMap<string, Prompt>,
): Prompt | undefined {
  if (offered instanceof Map) {
    return offered.get(name);
  }
  for (const prompt of offered as readonly Prompt[]) {
    if (prompt.name === name) return prompt;
  }
  return undefined;
}

// ─── PromptListChangedNotification (§18.6) ─────────────────────────────────────

/**
 * The `params` of a `notifications/prompts/list_changed` notification: when
 * present it MAY carry ONLY a reserved `_meta` map and no prompt data. (§18.6,
 * R-18.6-c, AC-28.40)
 *
 * `.passthrough()` preserves forward-compatible `_meta`-adjacent additions; the
 * notification itself carries no prompt payload.
 */
export const PromptListChangedNotificationParamsSchema = z
  .object({
    /** OPTIONAL. Reserved metadata map; the only permitted member. (R-18.6-c) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type PromptListChangedNotificationParams = z.infer<
  typeof PromptListChangedNotificationParamsSchema
>;

/**
 * The full `notifications/prompts/list_changed` notification: a one-way JSON-RPC
 * notification (no `id`, no response) with the exact method string and OPTIONAL
 * `_meta`-only `params`. (§18.6, R-18.6-b)
 *
 * Reuses `PROMPTS_LIST_CHANGED_METHOD` from streaming (S16) — the canonical method
 * constant — rather than re-typing the literal.
 */
export const PromptListChangedNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    /** REQUIRED. The exact method string. (R-18.6-b) */
    method: z.literal(PROMPTS_LIST_CHANGED_METHOD),
    /** OPTIONAL. `_meta`-only params. (R-18.6-c) */
    params: PromptListChangedNotificationParamsSchema.optional(),
  })
  .passthrough();

export type PromptListChangedNotification = z.infer<
  typeof PromptListChangedNotificationSchema
>;

/**
 * Builds a `notifications/prompts/list_changed` notification. `params` (carrying
 * only `_meta`) is included only when `meta` is supplied. (§18.6, R-18.6-b,
 * R-18.6-c, AC-28.39, AC-28.40)
 *
 * A server SHOULD only emit this when it declared `prompts.listChanged: true`
 * (R-18.6-a, R-18.6-g) — gate with {@link mayExpectPromptsListChanged} on the
 * receiving side. The server MAY emit it without any prior explicit subscription
 * (R-18.6-d).
 *
 * @param meta - OPTIONAL reserved `_meta` map to attach via `params`.
 */
export function buildPromptListChangedNotification(
  meta?: MetaObject,
): PromptListChangedNotification {
  const notification: PromptListChangedNotification = {
    jsonrpc: '2.0',
    method: PROMPTS_LIST_CHANGED_METHOD,
  };
  if (meta !== undefined) {
    notification.params = { _meta: meta };
  }
  return notification;
}

// ─── Argument-completion hook (§18.7) ──────────────────────────────────────────

/**
 * Whether a client MAY request auto-completion suggestions for a prompt argument
 * value through the Completion utility (§19 / S29). Prompt argument values are
 * always completable, so this is unconditionally `true`. (R-18.7-a, AC-28.42)
 *
 * The completion request/result wire shapes, the prompt-argument reference type,
 * and the `completions` capability gating are owned by S29 and are NOT defined
 * here — this is only the hook the story points to.
 */
export function mayCompletePromptArgument(): boolean {
  return true;
}

// Re-export so prompt callers can reference the multi-round-trip "input_required"
// discriminator value and the input-required schema (the SAME S17 bindings) when
// handling a `prompts/get` retry, without importing from multi-round-trip.ts.
export {
  MRTR_RESULT_TYPE,
  InputRequiredResultSchema,
  type InputRequiredResult,
};
