/**
 * S33 — Sampling (DEPRECATED) (§21.2).
 *
 * ⚠️ DEPRECATED CAPABILITY. The `sampling` client capability is Deprecated.
 * Implementations SHOULD NOT adopt it for new functionality; it remains defined
 * only for interoperability. New model-calling functionality SHOULD integrate
 * directly with a model provider instead of delegating through sampling.
 * (R-21.2-a, R-21.2.1-a, R-21.2.1-b) [SEP-2577][SEP-2596]
 *
 * Sampling lets a server obtain a language-model completion by delegating the
 * model call to the client. The client runs the model, keeps a human in the
 * loop, and returns the completion to the server, so a server can leverage
 * model capabilities without holding any model-provider credentials.
 *
 * Delivery is NOT a server-initiated JSON-RPC request. The server returns an
 * input-required result (S17) carrying a `sampling/createMessage` input request;
 * the client answers by retrying the original request with the
 * `CreateMessageResult` attached. A declined or errored request is simply not
 * retried — the server is never blocked awaiting a response. (§21.2.2)
 *
 * This module owns the §21.2 data shapes and behavioral rules. It BUILDS ON, and
 * does NOT redefine, the shared pieces it reuses:
 *   - `SamplingInputRequestSchema` / `CreateMessageResultSchema` (S17): the
 *     input-request envelope and the structural minimum of the result.
 *   - `RoleSchema` (S14/role), `ContentBlockSchema` (S14/content): role + the
 *     `tool_result.content` element vocabulary.
 *   - `clientDeclares` / `mayUseSamplingTools` / `mayUseIncludeContext` /
 *     `mayInvokeSampling` / `isDeprecatedClientCapability` (S10): capability
 *     gating.
 *   - `RESULT_TYPE` / error codes (S04/S05): the result discriminator and the
 *     `-32602` invalid-params code used for capability-gating rejections.
 */

import { z } from 'zod';
import { RoleSchema } from '../types/role.js';
import { ContentBlockSchema } from '../types/content.js';
import { TextContentSchema, ImageContentSchema, AudioContentSchema } from '../types/content.js';
import {
  mayUseSamplingTools,
  mayUseIncludeContext,
  mayInvokeSampling,
  isDeprecatedClientCapability,
} from './capability-negotiation.js';
import { INVALID_PARAMS_CODE } from './meta.js';

// Re-export the reused bindings so the sampling surface is discoverable in one
// place WITHOUT redefining them (same objects, not duplicates).
export { SamplingInputRequestSchema } from './multi-round-trip.js';
export type { SamplingInputRequest } from './multi-round-trip.js';
export { CreateMessageResultSchema } from './multi-round-trip.js';
export type { CreateMessageResult } from './multi-round-trip.js';
export { RESULT_TYPE } from '../jsonrpc/payload.js';
export { INVALID_PARAMS_CODE } from './meta.js';

// ─── Deprecation posture (§21.2, §21.2.1) ──────────────────────────────────────

/**
 * The `sampling` capability is Deprecated. (R-21.2-a, R-21.2.1-a) [SEP-2577][SEP-2596]
 *
 * Implementations SHOULD NOT adopt it for new functionality; it remains defined
 * for interoperability and is subject to eventual removal under the §27 lifecycle
 * policy. New model-calling functionality SHOULD integrate directly with a model
 * provider instead. (R-21.2.1-b)
 */
export const SAMPLING_DEPRECATED = true as const;

/** The exact input-request method name for sampling. (§21.2.4) */
export const SAMPLING_METHOD = 'sampling/createMessage' as const;

/**
 * Returns `true` when sampling is Deprecated — it always is. Provided so callers
 * (and conformance reviewers) can branch on the deprecation posture without
 * hard-coding the constant. Mirrors `isDeprecatedClientCapability('sampling')`.
 * (R-21.2-a, R-21.2.1-a)
 */
export function isSamplingDeprecated(): boolean {
  return isDeprecatedClientCapability('sampling');
}

/**
 * Guidance for builders adding new model-calling functionality: integrate
 * directly with a model provider rather than via sampling. (R-21.2.1-b)
 *
 * Returned as data (not just prose) so a host can surface it in tooling.
 */
export const SAMPLING_REPLACEMENT_GUIDANCE =
  'Sampling is Deprecated. For new model-calling functionality, integrate directly with a model provider instead of delegating through sampling/createMessage.' as const;

// ─── ToolUseContent / ToolResultContent (§21.2.6) ──────────────────────────────

/**
 * `ToolUseContent` — a request from the assistant to call a tool. (§21.2.6)
 *
 * Only valid inside sampling messages/results; MUST NOT appear where a base
 * `ContentBlock` is expected (S14 forbids `tool_use`/`tool_result` there).
 *
 * Fields: `type` literal `"tool_use"`; `id` (unique, matches results to uses);
 * `name`; `input` object; OPTIONAL `_meta` which clients SHOULD preserve across
 * subsequent sampling requests for caching (S19). (R-21.2.6-c)
 */
export const ToolUseContentSchema = z
  .object({
    /** REQUIRED literal discriminator `"tool_use"`. (§21.2.6) */
    type: z.literal('tool_use'),
    /** REQUIRED unique id; matched by a later `ToolResultContent.toolUseId`. (§21.2.6) */
    id: z.string(),
    /** REQUIRED name of the tool to call. (§21.2.6) */
    name: z.string(),
    /** REQUIRED arguments conforming to the tool's input schema. (§21.2.6) */
    input: z.record(z.unknown()),
    /** OPTIONAL reserved metadata; SHOULD be preserved for caching. (R-21.2.6-c) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ToolUseContent = z.infer<typeof ToolUseContentSchema>;

/**
 * `ToolResultContent` — the result of a tool use, provided by the user back to
 * the assistant. (§21.2.6)
 *
 * `content` reuses the S14 `ContentBlock` array form and MAY include text,
 * images, audio, resource links, and embedded resources. (R-21.2.6-e)
 * `structuredContent` is any JSON value; when the tool defined an output schema
 * it SHOULD conform to it. (R-21.2.6-f) `isError` defaults to `false` when
 * omitted. (R-21.2.6-g) `_meta` SHOULD be preserved for caching. (R-21.2.6-h)
 * `toolUseId` MUST match the `id` of a previous `ToolUseContent`. (R-21.2.6-d)
 */
export const ToolResultContentSchema = z
  .object({
    /** REQUIRED literal discriminator `"tool_result"`. (§21.2.6) */
    type: z.literal('tool_result'),
    /** REQUIRED; MUST match a previous `ToolUseContent.id`. (R-21.2.6-d) */
    toolUseId: z.string(),
    /** REQUIRED unstructured result content (S14 ContentBlock array form). (R-21.2.6-e) */
    content: z.array(ContentBlockSchema),
    /** OPTIONAL structured result; SHOULD conform to the tool's output schema. (R-21.2.6-f) */
    structuredContent: z.unknown().optional(),
    /** OPTIONAL; default `false` when omitted. (R-21.2.6-g) */
    isError: z.boolean().optional(),
    /** OPTIONAL reserved metadata; SHOULD be preserved for caching. (R-21.2.6-h) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ToolResultContent = z.infer<typeof ToolResultContentSchema>;

/** Returns `true` when `block` is a `tool_use` content block. */
export function isToolUseContent(block: unknown): block is ToolUseContent {
  return ToolUseContentSchema.safeParse(block).success;
}

/** Returns `true` when `block` is a `tool_result` content block. */
export function isToolResultContent(block: unknown): block is ToolResultContent {
  return ToolResultContentSchema.safeParse(block).success;
}

/**
 * Returns `false` (with an unwrapped result default) for an omitted `isError`.
 * Encapsulates the R-21.2.6-g default so producers never special-case it.
 */
export function toolResultIsError(block: ToolResultContent): boolean {
  return block.isError ?? false;
}

// ─── SamplingMessageContentBlock (§21.2.6) ─────────────────────────────────────

/**
 * `SamplingMessageContentBlock` — the content-block union for sampling messages
 * and results. (§21.2.6)
 *
 * The union is exactly `TextContent`, `ImageContent`, `AudioContent` plus the two
 * sampling-specific blocks (`ToolUseContent`, `ToolResultContent`). §21.2.6
 * deliberately EXCLUDES `resource_link` and embedded `resource` blocks from
 * sampling content, so the base `ContentBlockSchema` (which would admit them) is
 * NOT a member here. (R-21.2.6-d)
 */
export const SamplingMessageContentBlockSchema = z.union([
  ToolUseContentSchema,
  ToolResultContentSchema,
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
]);

export type SamplingMessageContentBlock = z.infer<typeof SamplingMessageContentBlockSchema>;

/**
 * Either a single sampling content block or an array of them. (§21.2.6)
 *
 * `SamplingMessage.content` and `CreateMessageResult.content` both take this
 * single-or-array shape. (R-21.2.6-b, R-21.2.8-b)
 */
export const SamplingContentSchema = z.union([
  SamplingMessageContentBlockSchema,
  z.array(SamplingMessageContentBlockSchema),
]);

export type SamplingContent = z.infer<typeof SamplingContentSchema>;

/** Normalizes single-or-array sampling content to an array, for uniform iteration. */
export function asContentArray(content: SamplingContent): SamplingMessageContentBlock[] {
  return Array.isArray(content) ? content : [content];
}

// ─── SamplingMessage (§21.2.6) ─────────────────────────────────────────────────

/**
 * `SamplingMessage` — one message in the sampled conversation. (§21.2.6)
 *
 * `role` is REQUIRED, `"user"` or `"assistant"` (reuses S14 `RoleSchema`).
 * (R-21.2.6-a) `content` is REQUIRED, a single block or an array. (R-21.2.6-b)
 * `_meta` is OPTIONAL reserved metadata (conventions per S05).
 *
 * @deprecated Sampling is a Deprecated client capability (§27.3). No direct
 * replacement; use Elicitation (§20) for structured user input. Earliest
 * removal: 2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
 */
export const SamplingMessageSchema = z
  .object({
    /** REQUIRED message role. (R-21.2.6-a) */
    role: RoleSchema,
    /** REQUIRED content: single block or array. (R-21.2.6-b) */
    content: SamplingContentSchema,
    /** OPTIONAL reserved metadata (S05). */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type SamplingMessage = z.infer<typeof SamplingMessageSchema>;

// ─── ModelHint / ModelPreferences (§21.2.9) ────────────────────────────────────

/**
 * `ModelHint` — a single advisory hint toward a model. (§21.2.9)
 *
 * `name` is OPTIONAL; the client SHOULD treat it as a substring of a model name
 * and MAY map it to a different provider's model or a similar-niche family.
 * Keys other than `name` are unspecified. (R-21.2.9-f, R-21.2.9-g)
 */
export const ModelHintSchema = z
  .object({
    /** OPTIONAL model-name substring hint. (R-21.2.9-f) */
    name: z.string().optional(),
  })
  .passthrough();

export type ModelHint = z.infer<typeof ModelHintSchema>;

/** A priority weight: an advisory number in the inclusive range 0–1. (R-21.2.9-e) */
const PrioritySchema = z.number().min(0).max(1);

/**
 * `ModelPreferences` — the server's advisory model-selection priorities and
 * hints. (§21.2.9)
 *
 * All preferences are advisory; the client MAY ignore them and makes the final
 * model selection. (R-21.2.9-a) When multiple `hints` are given the client MUST
 * evaluate them in order, first match. (R-21.2.9-b) The numeric priorities are
 * OPTIONAL numbers in the inclusive range 0–1. (R-21.2.9-e)
 */
export const ModelPreferencesSchema = z
  .object({
    /** OPTIONAL ordered hints; evaluated in order, first match. (R-21.2.9-b) */
    hints: z.array(ModelHintSchema).optional(),
    /** OPTIONAL cost-minimization weight, 0–1 inclusive. (R-21.2.9-e) */
    costPriority: PrioritySchema.optional(),
    /** OPTIONAL low-latency weight, 0–1 inclusive. (R-21.2.9-e) */
    speedPriority: PrioritySchema.optional(),
    /** OPTIONAL intelligence/capability weight, 0–1 inclusive. (R-21.2.9-e) */
    intelligencePriority: PrioritySchema.optional(),
  })
  .passthrough();

export type ModelPreferences = z.infer<typeof ModelPreferencesSchema>;

/**
 * Selects the first `ModelHint` whose `name` substring matches a candidate model
 * name, honoring the order-sensitive first-match rule. (R-21.2.9-b, R-21.2.9-f)
 *
 * Hints are advisory: the caller (client/host) makes the final selection and MAY
 * ignore the result. (R-21.2.9-a) This helper only implements the substring
 * first-match semantics; it does not consult the numeric priorities, which the
 * client MAY use only to disambiguate among ambiguous matches. (R-21.2.9-c,
 * R-21.2.9-d)
 *
 * @param hints           - Ordered hints from `ModelPreferences`.
 * @param availableModels - Candidate model names the client can run.
 * @returns The first `{ hint, model }` whose hint name is a substring of a
 *   candidate model name, or `undefined` when no hint matches.
 */
export function selectFirstHintMatch(
  hints: ModelHint[] | undefined,
  availableModels: string[],
): { hint: ModelHint; model: string } | undefined {
  if (!hints) return undefined;
  for (const hint of hints) {
    const needle = hint.name;
    if (needle === undefined) continue;
    const model = availableModels.find((m) => m.includes(needle));
    if (model !== undefined) {
      return { hint, model };
    }
  }
  return undefined;
}

// ─── ToolChoice (§21.2.5) ───────────────────────────────────────────────────────

/** The three `ToolChoice.mode` values. (§21.2.5) */
export const TOOL_CHOICE_MODES = ['auto', 'required', 'none'] as const;

export type ToolChoiceMode = (typeof TOOL_CHOICE_MODES)[number];

/**
 * `ToolChoice` — controls the model's tool-use behavior during sampling. (§21.2.5)
 *
 * `mode` is OPTIONAL; the default when omitted is `{ "mode": "auto" }`.
 * (R-21.2.4-p) `"required"` means the model MUST use at least one tool before
 * completing (R-21.2.5-a); `"none"` means the model MUST NOT use any tools.
 * (R-21.2.5-b)
 */
export const ToolChoiceSchema = z
  .object({
    /** OPTIONAL tool-use mode; default `"auto"`. (R-21.2.4-p, R-21.2.5-a, R-21.2.5-b) */
    mode: z.enum(TOOL_CHOICE_MODES).optional(),
  })
  .passthrough();

export type ToolChoice = z.infer<typeof ToolChoiceSchema>;

/** The default `ToolChoice` applied when the field is omitted. (R-21.2.4-p) */
export const DEFAULT_TOOL_CHOICE: { mode: 'auto' } = { mode: 'auto' } as const;

/**
 * Resolves the effective `ToolChoice`, applying the `{ mode: "auto" }` default
 * for an omitted `toolChoice` or an omitted `mode`. (R-21.2.4-p)
 */
export function resolveToolChoice(toolChoice: ToolChoice | undefined): { mode: ToolChoiceMode } {
  if (toolChoice?.mode !== undefined) return { mode: toolChoice.mode };
  return { ...DEFAULT_TOOL_CHOICE };
}

// ─── includeContext (§21.2.4) ──────────────────────────────────────────────────

/** The three `includeContext` values; `"thisServer"`/`"allServers"` are Deprecated. (§21.2.4) */
export const INCLUDE_CONTEXT_VALUES = ['none', 'thisServer', 'allServers'] as const;

export type IncludeContext = (typeof INCLUDE_CONTEXT_VALUES)[number];

/**
 * `includeContext` values that are Deprecated and gated by `sampling.context`. (§21.2.4)
 *
 * @deprecated The `includeContext` values `"thisServer"` and `"allServers"` are
 * Deprecated (§27.3). No replacement; context management is now host-managed.
 * Earliest removal: 2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
 */
export const DEPRECATED_INCLUDE_CONTEXT_VALUES = new Set(['thisServer', 'allServers'] as const);

/** Returns `true` when `value` is a Deprecated `includeContext` value. (§21.2.4) */
export function isDeprecatedIncludeContext(value: string): boolean {
  return DEPRECATED_INCLUDE_CONTEXT_VALUES.has(value as never);
}

// ─── Tool (request-scoped) (§21.2.4) ───────────────────────────────────────────

/**
 * The minimal `Tool` shape accepted inside a sampling request's `tools[]`. The
 * canonical `Tool` is owned by S24/§16; here only the fields sampling depends on
 * are pinned (`name` plus an input-schema object), and `.passthrough()` keeps
 * the rest. These definitions are scoped to the request and need not correspond
 * to any registered server tool. (R-21.2.4-m)
 */
export const SamplingToolSchema = z
  .object({
    /** REQUIRED tool name. (§16) */
    name: z.string(),
    /** OPTIONAL human description. (§16) */
    description: z.string().optional(),
    /** OPTIONAL JSON-Schema input shape; named `inputSchema` per §16. */
    inputSchema: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type SamplingTool = z.infer<typeof SamplingToolSchema>;

// ─── CreateMessageRequestParams (§21.2.4) ──────────────────────────────────────

/**
 * `CreateMessageRequestParams` — parameters of the `sampling/createMessage`
 * input request. (§21.2.4)
 *
 * `messages` is REQUIRED, ordered oldest→newest (R-21.2.4-a); the list SHOULD NOT
 * be retained between separate requests (R-21.2.4-b — enforced operationally by
 * never sharing arrays across requests, never implicitly here). `maxTokens` is
 * REQUIRED and is a hard upper bound the client MUST respect (R-21.2.4-h,
 * R-21.2.4-j). `modelPreferences`, `systemPrompt`, `temperature`, `stopSequences`,
 * `metadata` are OPTIONAL and advisory; the client MAY modify or ignore them
 * (R-21.2.4-c/d/g/k/l). `includeContext` defaults to `"none"`; the Deprecated
 * values are gated by `sampling.context` (R-21.2.4-e/f). `tools`/`toolChoice` are
 * OPTIONAL and gated by `sampling.tools` (R-21.2.4-m, R-21.2.4-n, R-21.2.4-o,
 * R-21.2.4-p).
 *
 * Note: `maxTokens` is not bounded above structurally; the upper-bound obligation
 * (R-21.2.4-j) is a client sampling-time constraint enforced by
 * {@link clampToMaxTokens}, not a schema bound.
 *
 * The output type is written by hand as {@link CreateMessageRequestParams} and the
 * schema is annotated with it. Inferring the type from the schema overflows the
 * TypeScript serializer (TS7056) because the deep `SamplingContentSchema` union is
 * reachable through `messages`; the explicit annotation keeps it serializable
 * while leaving the runtime schema unchanged.
 */
export interface CreateMessageRequestParams {
  /** REQUIRED conversation, oldest→newest. (R-21.2.4-a) */
  messages: SamplingMessage[];
  /** OPTIONAL advisory model-selection preferences. (R-21.2.4-c) */
  modelPreferences?: ModelPreferences;
  /** OPTIONAL system prompt; client MAY modify/ignore. (R-21.2.4-d) */
  systemPrompt?: string;
  /** OPTIONAL context-inclusion request; default `"none"`. (R-21.2.4-e/f) */
  includeContext?: IncludeContext;
  /** OPTIONAL randomness control; client MAY modify/ignore. (R-21.2.4-g) */
  temperature?: number;
  /** REQUIRED requested max tokens; a hard upper bound. (R-21.2.4-h, R-21.2.4-j) */
  maxTokens: number;
  /** OPTIONAL stop sequences; client MAY modify/ignore. (R-21.2.4-k) */
  stopSequences?: string[];
  /** OPTIONAL provider-specific pass-through; client MAY modify/ignore. (R-21.2.4-l) */
  metadata?: Record<string, unknown>;
  /** OPTIONAL request-scoped tools; gated by `sampling.tools`. (R-21.2.4-m, R-21.2.4-n) */
  tools?: SamplingTool[];
  /** OPTIONAL tool-use control; gated by `sampling.tools`; default `auto`. (R-21.2.4-o, R-21.2.4-p) */
  toolChoice?: ToolChoice;
  /** Forward-compatible additional members preserved by `.passthrough()`. */
  [key: string]: unknown;
}

export const CreateMessageRequestParamsSchema: z.ZodType<CreateMessageRequestParams> = z
  .object({
    /** REQUIRED conversation, oldest→newest. (R-21.2.4-a) */
    messages: z.array(SamplingMessageSchema),
    /** OPTIONAL advisory model-selection preferences. (R-21.2.4-c) */
    modelPreferences: ModelPreferencesSchema.optional(),
    /** OPTIONAL system prompt; client MAY modify/ignore. (R-21.2.4-d) */
    systemPrompt: z.string().optional(),
    /** OPTIONAL context-inclusion request; default `"none"`. (R-21.2.4-e/f) */
    includeContext: z.enum(INCLUDE_CONTEXT_VALUES).optional(),
    /** OPTIONAL randomness control; client MAY modify/ignore. (R-21.2.4-g) */
    temperature: z.number().optional(),
    /** REQUIRED requested max tokens; a hard upper bound. (R-21.2.4-h, R-21.2.4-j) */
    maxTokens: z.number(),
    /** OPTIONAL stop sequences; client MAY modify/ignore. (R-21.2.4-k) */
    stopSequences: z.array(z.string()).optional(),
    /** OPTIONAL provider-specific pass-through; client MAY modify/ignore. (R-21.2.4-l) */
    metadata: z.record(z.unknown()).optional(),
    /** OPTIONAL request-scoped tools; gated by `sampling.tools`. (R-21.2.4-m, R-21.2.4-n) */
    tools: z.array(SamplingToolSchema).optional(),
    /** OPTIONAL tool-use control; gated by `sampling.tools`; default `auto`. (R-21.2.4-o, R-21.2.4-p) */
    toolChoice: ToolChoiceSchema.optional(),
  })
  .passthrough();

/** Returns the effective `includeContext`, defaulting to `"none"` when omitted. (§21.2.4) */
export function resolveIncludeContext(params: { includeContext?: IncludeContext }): IncludeContext {
  return params.includeContext ?? 'none';
}

/**
 * Returns `true` when the request is tool-enabled — it carries `tools` or
 * `toolChoice`. Such a request requires `sampling.tools` on both sides.
 * (R-21.2.3-a, R-21.2.3-b)
 */
export function isToolEnabledRequest(params: {
  tools?: unknown;
  toolChoice?: unknown;
}): boolean {
  return params.tools !== undefined || params.toolChoice !== undefined;
}

/**
 * Clamps a produced token count to the request's `maxTokens` upper bound.
 * The client MAY sample fewer (R-21.2.4-i) but MUST NOT exceed `maxTokens`
 * (R-21.2.4-j). Returns the count unchanged when already within bound.
 */
export function clampToMaxTokens(produced: number, maxTokens: number): number {
  return produced > maxTokens ? maxTokens : produced;
}

// ─── CreateMessageResult (§21.2.8) ─────────────────────────────────────────────

/** Standard `stopReason` values; the field is an open string. (§21.2.8, R-21.2.8-d) */
export const STANDARD_STOP_REASONS = ['endTurn', 'stopSequence', 'maxTokens', 'toolUse'] as const;

export type StandardStopReason = (typeof STANDARD_STOP_REASONS)[number];

/** Returns `true` when `reason` is one of the four standard `stopReason` values. */
export function isStandardStopReason(reason: string): reason is StandardStopReason {
  return (STANDARD_STOP_REASONS as readonly string[]).includes(reason);
}

/**
 * `CreateMessageResult` (§21.2.8) — the completion delivered back to the server
 * on retry. This BUILDS ON the S17 `CreateMessageResultSchema` (which pins the
 * structural minimum `role`/`content`/`model`) by sharpening the field types to
 * the §21.2.8 shape: `role` is the closed `Role` enum, `content` is the
 * single-or-array sampling content, `stopReason` is an OPEN string accepting
 * arbitrary values (R-21.2.8-d), and `resultType` is REQUIRED (R-21.2.8-e).
 *
 * The S17 base schema remains the authoritative kind-correlation schema for the
 * multi-round-trip `inputResponses`; this is the §21.2 full shape. Both accept
 * the same wire objects.
 */
export const SamplingCreateMessageResultSchema = z
  .object({
    /** REQUIRED role; normally `"assistant"`. (R-21.2.8-a) */
    role: RoleSchema,
    /** REQUIRED produced content: single block or array. (R-21.2.8-b) */
    content: SamplingContentSchema,
    /** REQUIRED name of the generating model. (R-21.2.8-c) */
    model: z.string(),
    /** OPTIONAL open-string stop reason; arbitrary values allowed. (R-21.2.8-d) */
    stopReason: z.string().optional(),
    /** REQUIRED result-type discriminator (S04 §3.6). (R-21.2.8-e) */
    resultType: z.string(),
    /** OPTIONAL reserved metadata (S05). */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type SamplingCreateMessageResult = z.infer<typeof SamplingCreateMessageResultSchema>;

// ─── Capability gating (§21.2.3) ───────────────────────────────────────────────

/**
 * The JSON-RPC error a client MUST return when a sampling input request includes
 * `tools` or `toolChoice` but the client did not declare `sampling.tools`.
 * (R-21.2.3-b, R-21.2.4-n, R-21.2.4-o)
 *
 * Code is `-32602` (Invalid params, §22). `field` names the offending member.
 */
export function buildSamplingToolsNotDeclaredError(field: 'tools' | 'toolChoice'): {
  code: typeof INVALID_PARAMS_CODE;
  message: string;
} {
  return {
    code: INVALID_PARAMS_CODE,
    message: `Sampling request includes \`${field}\` but the client did not declare \`sampling.tools\` (R-21.2.3-b, R-21.2.4-${field === 'tools' ? 'n' : 'o'})`,
  };
}

/** Outcome of {@link gateSamplingToolUse} / {@link validateSamplingRequest}. */
export type SamplingGateResult =
  | { ok: true }
  | { ok: false; error: ReturnType<typeof buildSamplingToolsNotDeclaredError> };

/**
 * Client-side gate: returns an error when a tool-enabled sampling request arrives
 * but the client did not declare `sampling.tools`. (R-21.2.3-b, R-21.2.4-n,
 * R-21.2.4-o)
 *
 * `tools` is checked before `toolChoice` so the error names the first offending
 * field deterministically. When `sampling.tools` is declared, or the request is
 * not tool-enabled, returns `{ ok: true }`.
 *
 * @param clientCaps - The client's declared `ClientCapabilities`.
 * @param params     - The incoming sampling params.
 */
export function gateSamplingToolUse(
  clientCaps: Record<string, unknown>,
  params: { tools?: unknown; toolChoice?: unknown },
): SamplingGateResult {
  if (!isToolEnabledRequest(params)) return { ok: true };
  if (mayUseSamplingTools(clientCaps)) return { ok: true };
  const field: 'tools' | 'toolChoice' = params.tools !== undefined ? 'tools' : 'toolChoice';
  return { ok: false, error: buildSamplingToolsNotDeclaredError(field) };
}

/**
 * Server-side gate: returns `true` only when the server MAY send the given
 * sampling params to a client with `clientCaps`. (R-21.2.3-a)
 *
 * A server MUST NOT send a tool-enabled request to a client lacking
 * `sampling.tools`, and MUST NOT invoke sampling at all unless the client
 * declared `sampling`. The `includeContext` deprecation gate (R-21.2.3-c,
 * R-21.2.4-e) is checked via {@link mayUseIncludeContext}.
 */
export function mayServerSendSamplingRequest(
  clientCaps: Record<string, unknown>,
  params: { tools?: unknown; toolChoice?: unknown; includeContext?: IncludeContext },
): boolean {
  if (!mayInvokeSampling(clientCaps)) return false;
  if (isToolEnabledRequest(params) && !mayUseSamplingTools(clientCaps)) return false;
  if (!mayUseIncludeContext(clientCaps, params.includeContext)) return false;
  return true;
}

/**
 * Full client-side validation of an inbound sampling request: structural parse
 * plus the tool-use capability gate. (R-21.2.4-a, R-21.2.4-h, R-21.2.3-b,
 * R-21.2.4-n, R-21.2.4-o)
 *
 * Returns `{ ok: true, params }` with the parsed params, or `{ ok: false, error }`
 * carrying the JSON-RPC error. A request missing `messages` or `maxTokens` is
 * rejected as malformed (R-21.2.4-a, R-21.2.4-h → AC-33.5); a tool-enabled
 * request without `sampling.tools` is rejected per the gate.
 *
 * @param clientCaps - The client's declared `ClientCapabilities`.
 * @param rawParams  - The raw `params` object from the sampling input request.
 */
export function validateSamplingRequest(
  clientCaps: Record<string, unknown>,
  rawParams: unknown,
):
  | { ok: true; params: CreateMessageRequestParams }
  | { ok: false; error: { code: typeof INVALID_PARAMS_CODE; message: string } } {
  const parsed = CreateMessageRequestParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      error: {
        code: INVALID_PARAMS_CODE,
        message: `Malformed sampling/createMessage params: ${detail}`,
      },
    };
  }
  const gate = gateSamplingToolUse(clientCaps, parsed.data);
  if (!gate.ok) return { ok: false, error: gate.error };
  return { ok: true, params: parsed.data };
}

// ─── Message-content constraints (§21.2.7) ─────────────────────────────────────

/**
 * Returns `true` when `content` contains at least one `tool_result` block.
 * Operates on the normalized array form.
 */
function containsToolResult(blocks: SamplingMessageContentBlock[]): boolean {
  return blocks.some((b) => (b as { type?: unknown }).type === 'tool_result');
}

/** Returns `true` when `content` contains at least one `tool_use` block. */
function containsToolUse(blocks: SamplingMessageContentBlock[]): boolean {
  return blocks.some((b) => (b as { type?: unknown }).type === 'tool_use');
}

/**
 * Validates the §21.2.7 content constraint on a single `user` message: when a
 * `user` message contains any `tool_result` block, it MUST contain ONLY
 * `tool_result` blocks — mixing with text/image/audio (or any other type) is
 * NOT allowed. (R-21.2.7-a)
 *
 * Returns `{ ok: true }` for any non-`user` message, a `user` message with no
 * tool results, or a `user` message of only tool results. Returns
 * `{ ok: false, reason }` for a mixed `user` message.
 */
export function validateUserToolResultExclusivity(message: SamplingMessage): {
  ok: boolean;
  reason?: string;
} {
  if (message.role !== 'user') return { ok: true };
  const blocks = asContentArray(message.content);
  if (!containsToolResult(blocks)) return { ok: true };
  const onlyToolResults = blocks.every((b) => (b as { type?: unknown }).type === 'tool_result');
  if (onlyToolResults) return { ok: true };
  return {
    ok: false,
    reason:
      'A user message containing tool_result blocks MUST contain ONLY tool_result blocks (R-21.2.7-a)',
  };
}

/**
 * Validates the §21.2.7 ordering/matching constraint across a `messages`
 * sequence: every `assistant` message containing one or more `ToolUseContent`
 * blocks MUST be followed IMMEDIATELY by a `user` message consisting ENTIRELY of
 * `ToolResultContent` blocks, with each tool use (`id: $id`) matched by a
 * corresponding result (`toolUseId: $id`), before any other message. Multiple
 * parallel tool uses are permitted. (R-21.2.7-b)
 *
 * Also enforces the per-message exclusivity rule (R-21.2.7-a) on each `user`
 * message, so a single call validates both §21.2.7 constraints.
 *
 * Returns `{ ok: true }` when the whole sequence is well-formed, else
 * `{ ok: false, reason, index }` pointing at the first offending message.
 */
export function validateSamplingMessageOrdering(messages: SamplingMessage[]): {
  ok: boolean;
  reason?: string;
  index?: number;
} {
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;

    // Per-message exclusivity for user tool-result messages. (R-21.2.7-a)
    const exclusivity = validateUserToolResultExclusivity(message);
    if (!exclusivity.ok) {
      return { ok: false, reason: exclusivity.reason, index: i };
    }

    if (message.role !== 'assistant') continue;
    const blocks = asContentArray(message.content);
    if (!containsToolUse(blocks)) continue;

    // Collect the ids of this assistant message's tool uses. (R-21.2.7-b)
    const useIds = blocks
      .filter((b) => (b as { type?: unknown }).type === 'tool_use')
      .map((b) => (b as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string');

    const next = messages[i + 1];
    if (next === undefined) {
      return {
        ok: false,
        reason:
          'An assistant message with tool_use MUST be followed immediately by a user tool_result message (R-21.2.7-b)',
        index: i,
      };
    }
    if (next.role !== 'user') {
      return {
        ok: false,
        reason:
          'The message after an assistant tool_use MUST be a user message of tool_result blocks (R-21.2.7-b)',
        index: i + 1,
      };
    }
    const nextBlocks = asContentArray(next.content);
    const allToolResults =
      nextBlocks.length > 0 &&
      nextBlocks.every((b) => (b as { type?: unknown }).type === 'tool_result');
    if (!allToolResults) {
      return {
        ok: false,
        reason:
          'The user message following an assistant tool_use MUST consist entirely of tool_result blocks (R-21.2.7-b)',
        index: i + 1,
      };
    }
    const resultIds = new Set(
      nextBlocks
        .map((b) => (b as { toolUseId?: unknown }).toolUseId)
        .filter((id): id is string => typeof id === 'string'),
    );
    // Each tool use must be matched by a corresponding tool result. (R-21.2.7-b, R-21.2.6-d)
    for (const id of useIds) {
      if (!resultIds.has(id)) {
        return {
          ok: false,
          reason: `tool_use id "${id}" has no matching tool_result toolUseId (R-21.2.7-b, R-21.2.6-d)`,
          index: i + 1,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Validates that every `tool_result` block's `toolUseId` refers to the `id` of a
 * `tool_use` that appeared EARLIER in the message sequence. (R-21.2.6-d)
 *
 * Returns `{ ok: true }` when all tool results reference a prior tool use, else
 * `{ ok: false, reason, toolUseId }` for the first dangling reference.
 */
export function validateToolResultReferences(messages: SamplingMessage[]): {
  ok: boolean;
  reason?: string;
  toolUseId?: string;
} {
  const seenUseIds = new Set<string>();
  for (const message of messages) {
    const blocks = asContentArray(message.content);
    for (const block of blocks) {
      const type = (block as { type?: unknown }).type;
      if (type === 'tool_use') {
        const id = (block as { id?: unknown }).id;
        if (typeof id === 'string') seenUseIds.add(id);
      } else if (type === 'tool_result') {
        const toolUseId = (block as { toolUseId?: unknown }).toolUseId;
        if (typeof toolUseId !== 'string' || !seenUseIds.has(toolUseId)) {
          return {
            ok: false,
            reason:
              'ToolResultContent.toolUseId MUST match the id of a previous ToolUseContent (R-21.2.6-d)',
            toolUseId: typeof toolUseId === 'string' ? toolUseId : undefined,
          };
        }
      }
    }
  }
  return { ok: true };
}

// ─── _meta preservation for caching (§21.2.6, S19) ─────────────────────────────

/**
 * Preserves the `_meta` of prior `ToolUseContent`/`ToolResultContent` blocks when
 * carrying them into a subsequent sampling request, enabling caching
 * optimizations. Clients SHOULD do this. (R-21.2.6-c, R-21.2.6-h)
 *
 * Returns a shallow copy of `block` with `_meta` retained verbatim; non
 * tool_use/tool_result blocks are returned unchanged.
 */
export function preserveContentMeta<T extends SamplingMessageContentBlock>(block: T): T {
  const type = (block as { type?: unknown }).type;
  if (type !== 'tool_use' && type !== 'tool_result') return block;
  // _meta is part of the object; a shallow copy keeps it. Explicit for intent.
  return { ...(block as Record<string, unknown>) } as T;
}

// ─── Consent & safety obligations (§21.2.10) ───────────────────────────────────

/**
 * Fields a client (or host) MAY modify or omit as part of its human-in-the-loop
 * control over a sampling request, without communicating the change to the
 * server. (R-21.2.10-e)
 */
export const CLIENT_MODIFIABLE_REQUEST_FIELDS = [
  'systemPrompt',
  'includeContext',
  'temperature',
  'stopSequences',
  'metadata',
] as const;

export type ClientModifiableRequestField = (typeof CLIENT_MODIFIABLE_REQUEST_FIELDS)[number];

/** Returns `true` when `field` is one the client MAY modify/omit. (R-21.2.10-e) */
export function isClientModifiableRequestField(field: string): field is ClientModifiableRequestField {
  return (CLIENT_MODIFIABLE_REQUEST_FIELDS as readonly string[]).includes(field);
}

/**
 * The consent & safety obligations a conforming client/host MUST or SHOULD honor
 * around sampling. (§21.2.10) Surfaced as a structured checklist so a host can
 * assert it satisfies each obligation and so conformance reviews can enumerate
 * them. The booleans report which obligations a host claims to meet.
 */
export interface SamplingConsentObligations {
  /** MUST keep a human in the loop. (R-21.2.10-a) */
  humanInTheLoop: boolean;
  /** MUST let the user deny a sampling request. (R-21.2.10-b) */
  userMayDeny: boolean;
  /** SHOULD present the prompt for review/edit/reject before sampling. (R-21.2.10-c) */
  reviewPromptBeforeSampling: boolean;
  /** SHOULD present the result for review/edit/reject before the server sees it. (R-21.2.10-d) */
  reviewResultBeforeServer: boolean;
  /** MAY modify/omit systemPrompt/includeContext/temperature/stopSequences/metadata. (R-21.2.10-e) */
  mayModifyControlFields: boolean;
  /** SHOULD implement rate limiting. (R-21.2.10-f) */
  rateLimiting: boolean;
  /** SHOULD validate message content (both parties). (R-21.2.10-g) */
  validateContent: boolean;
  /** MUST handle sensitive data appropriately (both parties). (R-21.2.10-h) */
  handleSensitiveData: boolean;
  /** SHOULD implement iteration limits for tool loops when tools are used. (R-21.2.10-i) */
  toolLoopIterationLimits: boolean;
}

/**
 * The MUST-level consent obligations a conforming client/host MUST satisfy.
 * (R-21.2.10-a, R-21.2.10-b, R-21.2.10-h)
 */
export const REQUIRED_CONSENT_OBLIGATIONS: readonly (keyof SamplingConsentObligations)[] = [
  'humanInTheLoop',
  'userMayDeny',
  'handleSensitiveData',
] as const;

/**
 * Verifies that the MUST-level §21.2.10 obligations are met. Returns the list of
 * unmet MUST obligations; an empty list means the hard requirements are
 * satisfied. SHOULD-level obligations are advisory and not failed here.
 * (R-21.2.10-a, R-21.2.10-b, R-21.2.10-h)
 */
export function unmetRequiredConsentObligations(
  obligations: SamplingConsentObligations,
): (keyof SamplingConsentObligations)[] {
  return REQUIRED_CONSENT_OBLIGATIONS.filter((key) => obligations[key] !== true);
}

/**
 * Enforces a tool-loop iteration limit during sampling tool use; both parties
 * SHOULD apply such a limit. (R-21.2.10-i) Returns `true` when another iteration
 * is permitted (current count is below the limit), `false` when the limit is
 * reached and the loop MUST stop.
 *
 * @param iteration - The zero-based count of tool-loop iterations already run.
 * @param limit     - The maximum number of tool-loop iterations allowed.
 */
export function withinToolLoopLimit(iteration: number, limit: number): boolean {
  return iteration < limit;
}

// ─── Stop-reason note ──────────────────────────────────────────────────────────

/**
 * A sampling request is delivered via the S17 input-required envelope: the
 * carried input request is a {@link SamplingInputRequestSchema} whose `params`
 * are {@link CreateMessageRequestParamsSchema}. The S17 `CreateMessageResultSchema`
 * (re-exported above) remains the kind-correlation schema for the multi-round-trip
 * `inputResponses`; {@link SamplingCreateMessageResultSchema} is the §21.2.8 full
 * shape. Both accept the same wire objects.
 */
export const SAMPLING_INPUT_REQUEST_METHOD = SAMPLING_METHOD;
