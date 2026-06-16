/**
 * S10 — Capability Negotiation: Client & Server Capabilities (§6.1–§6.4).
 *
 * The capability layer: the two declaration objects (`ClientCapabilities`,
 * `ServerCapabilities`) and the per-request, stateless negotiation rules that
 * gate every optional feature. Because MCP is stateless, a feature is usable
 * only when BOTH peers declare the governing capability/sub-flag; this module
 * fixes the declaration shapes and the gating discipline that every later
 * feature story builds on.
 *
 * It provides:
 *   - `ClientCapabilitiesSchema` / `ServerCapabilitiesSchema` — the declaration
 *     envelopes; an empty `{}` is valid for either (no optional behaviors).
 *   - `clientDeclares` / `serverDeclares` — presence-means-supported predicates,
 *     including the `elicitation.form` implicit-baseline rule and the boolean
 *     sub-flags (`listChanged`, `subscribe`).
 *   - method→capability and notification→sub-flag gating maps + `mayClientInvoke`
 *     / `clientShouldExpectNotification`.
 *   - `gateRequiredClientCapabilities` → the `-32003` missing-capability error,
 *     and `httpStatusForCapabilityError` (both `-32003` and the malformed-`_meta`
 *     `-32602` map to HTTP `400`).
 *   - graceful-degradation decision (`decideDegradation`) and the sampling/
 *     elicitation sub-flag usage rules (`mayUseUrlElicitation`,
 *     `mayUseSamplingTools`, `mayUseIncludeContext`).
 *
 * The `-32003` builder/code and the malformed-`_meta` `-32602` validator live in
 * meta.ts (S05) and the revision negotiation in negotiation.ts (S09); this
 * module re-exports the capability-relevant pieces so the gating surface is in
 * one place (same bindings, not duplicates).
 */

import { z } from 'zod';
import {
  buildMissingCapabilityError,
  MISSING_CLIENT_CAPABILITY_CODE,
  INVALID_PARAMS_CODE,
} from './meta.js';

export {
  buildMissingCapabilityError,
  MISSING_CLIENT_CAPABILITY_CODE,
  INVALID_PARAMS_CODE,
  validateRequestMeta,
} from './meta.js';
export type { MissingCapabilityErrorData } from './meta.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Returns `true` when `value` is a non-null, non-array object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the nested object at `obj[key]`, or `undefined` when not an object. */
function nested(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = obj[key];
  return isObject(v) ? v : undefined;
}

// ─── Capability declaration schemas (§6.1, §6.2) ───────────────────────────────

/** `experimental` map: non-standard identifier → arbitrary settings object. */
const ExperimentalSchema = z.record(z.record(z.unknown()));

/** Elicitation capability with optional `form` / `url` sub-flags. (§6.1) */
const ElicitationCapabilitySchema = z
  .object({
    form: z.record(z.unknown()).optional(),
    url: z.record(z.unknown()).optional(),
  })
  .passthrough();

/** Sampling capability (Deprecated) with optional `context` / `tools` sub-flags. */
const SamplingCapabilitySchema = z
  .object({
    context: z.record(z.unknown()).optional(),
    tools: z.record(z.unknown()).optional(),
  })
  .passthrough();

/**
 * `ClientCapabilities` — the optional client behaviors, supplied on every
 * request. An entirely empty `{}` is valid and declares none. (§6.1, R-6.2-s)
 *
 * All fields are OPTIONAL; an omitted field declares the behavior unsupported.
 * `roots` and `sampling` are Deprecated. `.passthrough()` preserves forward-
 * compatible additions.
 */
export const ClientCapabilitiesSchema = z
  .object({
    experimental: ExperimentalSchema.optional(),
    elicitation: ElicitationCapabilitySchema.optional(),
    roots: z.record(z.unknown()).optional(),
    sampling: SamplingCapabilitySchema.optional(),
    extensions: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;

/**
 * `ServerCapabilities` — the optional server behaviors, learned by the client
 * from the `server/discover` result. An entirely empty `{}` is valid and
 * declares none. (§6.2, R-6.3-s)
 *
 * `listChanged` / `subscribe` are booleans; the `{}`-style capabilities are
 * objects. `logging` is Deprecated. `.passthrough()` preserves additions.
 */
export const ServerCapabilitiesSchema = z
  .object({
    experimental: ExperimentalSchema.optional(),
    completions: z.record(z.unknown()).optional(),
    prompts: z.object({ listChanged: z.boolean().optional() }).passthrough().optional(),
    resources: z
      .object({ subscribe: z.boolean().optional(), listChanged: z.boolean().optional() })
      .passthrough()
      .optional(),
    tools: z.object({ listChanged: z.boolean().optional() }).passthrough().optional(),
    logging: z.record(z.unknown()).optional(),
    extensions: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;

// ─── Deprecated capabilities (§6.1, §6.2) ──────────────────────────────────────

/** Client capabilities marked Deprecated; new implementations SHOULD NOT rely on them. (R-6.2-j, R-6.2-m) */
export const DEPRECATED_CLIENT_CAPABILITIES = new Set(['roots', 'sampling'] as const);
/** Server capabilities marked Deprecated; new implementations SHOULD NOT rely on them. (R-6.3-q) */
export const DEPRECATED_SERVER_CAPABILITIES = new Set(['logging'] as const);

/** Returns `true` when `name` is a Deprecated client capability. */
export function isDeprecatedClientCapability(name: string): boolean {
  return DEPRECATED_CLIENT_CAPABILITIES.has(name as never);
}
/** Returns `true` when `name` is a Deprecated server capability. */
export function isDeprecatedServerCapability(name: string): boolean {
  return DEPRECATED_SERVER_CAPABILITIES.has(name as never);
}

// ─── Capability predicates (§6.1, §6.4) ────────────────────────────────────────

/** A client capability name or sub-flag path. */
export type ClientCapabilityName =
  | 'experimental'
  | 'elicitation'
  | 'elicitation.form'
  | 'elicitation.url'
  | 'roots'
  | 'sampling'
  | 'sampling.context'
  | 'sampling.tools'
  | 'extensions';

/** A server capability name or sub-flag path. */
export type ServerCapabilityName =
  | 'experimental'
  | 'completions'
  | 'prompts'
  | 'prompts.listChanged'
  | 'resources'
  | 'resources.subscribe'
  | 'resources.listChanged'
  | 'tools'
  | 'tools.listChanged'
  | 'logging'
  | 'extensions';

/**
 * Returns `true` when the client's capabilities declare `capability`. (§6.1)
 *
 * Presence of an object means supported. Two special rules apply:
 *   - `elicitation.form` is supported whenever `elicitation` is present, even if
 *     the `form` sub-flag is absent — form mode is the implicit baseline. (R-6.2-e)
 *   - `elicitation.url`, `sampling.context`, `sampling.tools` require their own
 *     sub-flag object to be present. (R-6.2-f/g, R-6.2-n, R-6.2-p)
 */
export function clientDeclares(caps: Record<string, unknown>, capability: ClientCapabilityName): boolean {
  switch (capability) {
    case 'experimental':
      return isObject(caps['experimental']);
    case 'elicitation':
      return isObject(caps['elicitation']);
    case 'elicitation.form':
      // Implicit baseline: elicitation present ⇒ form supported (explicit or not).
      return isObject(caps['elicitation']);
    case 'elicitation.url':
      return nested(caps, 'elicitation') !== undefined && isObject(nested(caps, 'elicitation')!['url']);
    case 'roots':
      return isObject(caps['roots']);
    case 'sampling':
      return isObject(caps['sampling']);
    case 'sampling.context':
      return nested(caps, 'sampling') !== undefined && isObject(nested(caps, 'sampling')!['context']);
    case 'sampling.tools':
      return nested(caps, 'sampling') !== undefined && isObject(nested(caps, 'sampling')!['tools']);
    case 'extensions':
      return isObject(caps['extensions']);
  }
}

/**
 * Returns `true` when the server's capabilities declare `capability`. (§6.2)
 *
 * Object capabilities are declared by presence; the boolean sub-flags
 * (`listChanged`, `subscribe`) are declared only when explicitly `true`
 * (absent or `false` ⇒ not declared). (R-6.3-h, R-6.3-l, R-6.3-o)
 */
export function serverDeclares(caps: Record<string, unknown>, capability: ServerCapabilityName): boolean {
  switch (capability) {
    case 'experimental':
      return isObject(caps['experimental']);
    case 'completions':
      return isObject(caps['completions']);
    case 'prompts':
      return isObject(caps['prompts']);
    case 'prompts.listChanged':
      return nested(caps, 'prompts')?.['listChanged'] === true;
    case 'resources':
      return isObject(caps['resources']);
    case 'resources.subscribe':
      return nested(caps, 'resources')?.['subscribe'] === true;
    case 'resources.listChanged':
      return nested(caps, 'resources')?.['listChanged'] === true;
    case 'tools':
      return isObject(caps['tools']);
    case 'tools.listChanged':
      return nested(caps, 'tools')?.['listChanged'] === true;
    case 'logging':
      return isObject(caps['logging']);
    case 'extensions':
      return isObject(caps['extensions']);
  }
}

// ─── Method & notification gating (§6.3, §6.4) ─────────────────────────────────

/** Maps a server method to the `ServerCapabilities` field that gates it. (§6.2, §6.3) */
export const SERVER_METHOD_CAPABILITY: Readonly<Record<string, ServerCapabilityName>> = {
  'completion/complete': 'completions',
  'prompts/list': 'prompts',
  'prompts/get': 'prompts',
  'resources/list': 'resources',
  'resources/read': 'resources',
  'tools/list': 'tools',
  'tools/call': 'tools',
};

/** The capability that gates `method`, or `undefined` for an ungated (core) method. */
export function serverMethodRequiredCapability(method: string): ServerCapabilityName | undefined {
  return SERVER_METHOD_CAPABILITY[method];
}

/**
 * Returns `true` when a client MAY invoke `method` given the server's declared
 * capabilities. (R-6.3-e, R-6.4-f, R-6.4-g)
 *
 * An ungated (core) method is always invocable; a gated method requires the
 * governing capability to be declared in `serverCaps`.
 */
export function mayClientInvoke(method: string, serverCaps: Record<string, unknown>): boolean {
  const required = serverMethodRequiredCapability(method);
  return required === undefined || serverDeclares(serverCaps, required);
}

/** Maps a server-to-client notification to the capability/sub-flag that gates it. (§6.2, §6.3) */
export const NOTIFICATION_REQUIRED_CAPABILITY: Readonly<Record<string, ServerCapabilityName>> = {
  'notifications/prompts/list_changed': 'prompts.listChanged',
  'notifications/resources/list_changed': 'resources.listChanged',
  'notifications/resources/updated': 'resources.subscribe',
  'notifications/tools/list_changed': 'tools.listChanged',
  'notifications/message': 'logging',
};

/** The capability/sub-flag that gates `notification`, or `undefined` for an ungated one. */
export function notificationRequiredCapability(notification: string): ServerCapabilityName | undefined {
  return NOTIFICATION_REQUIRED_CAPABILITY[notification];
}

/**
 * Returns `true` when a client should expect `notification` given the server's
 * declared capabilities. When the gating sub-flag is absent or `false`, the
 * client MUST NOT expect the notification. (R-6.3-h, R-6.3-l, R-6.3-o)
 */
export function clientShouldExpectNotification(
  notification: string,
  serverCaps: Record<string, unknown>,
): boolean {
  const required = notificationRequiredCapability(notification);
  return required === undefined || serverDeclares(serverCaps, required);
}

// ─── Missing-required-client-capability gate (§6.4) ────────────────────────────

/**
 * Returns the subset of `required` capabilities not present in `declared`
 * (compared by top-level key presence — capabilities are never inferred from a
 * prior request). (R-6.4-c, R-6.4-d, R-6.4-h)
 */
export function computeMissingClientCapabilities(
  declared: Record<string, unknown>,
  required: Record<string, unknown>,
): Record<string, unknown> {
  const missing: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(required)) {
    if (!Object.prototype.hasOwnProperty.call(declared, key)) {
      missing[key] = value;
    }
  }
  return missing;
}

/** Outcome of {@link gateRequiredClientCapabilities}. */
export type CapabilityGateResult =
  | { ok: true }
  | { ok: false; error: ReturnType<typeof buildMissingCapabilityError> };

/**
 * Gates a request against the capabilities it requires. (§6.4, R-6.4-h)
 *
 * When every required capability is declared, returns `{ ok: true }`. Otherwise
 * returns `{ ok: false, error }` where `error` is the `-32003`
 * `MissingRequiredClientCapability` error whose `data.requiredCapabilities`
 * lists exactly the required-but-undeclared capabilities; on HTTP this rides a
 * `400 Bad Request` (see {@link httpStatusForCapabilityError}).
 *
 * @param declared - The `ClientCapabilities` from the current request's `_meta`.
 * @param required - The capabilities the server needs to process the request.
 */
export function gateRequiredClientCapabilities(
  declared: Record<string, unknown>,
  required: Record<string, unknown>,
): CapabilityGateResult {
  const missing = computeMissingClientCapabilities(declared, required);
  if (Object.keys(missing).length === 0) {
    return { ok: true };
  }
  return { ok: false, error: buildMissingCapabilityError(missing) };
}

// ─── HTTP status mapping (§6.4) ────────────────────────────────────────────────

/** Capability-negotiation errors ride HTTP `400 Bad Request`. (R-6.4-i, R-6.4-k) */
export const CAPABILITY_ERROR_HTTP_STATUS = 400 as const;

/**
 * Returns `400` for the capability-negotiation error codes — `-32003`
 * (missing required client capability) and `-32602` (malformed request omitting
 * a required `_meta` field) — both of which map to `400 Bad Request` on the
 * HTTP transport; `undefined` otherwise. (R-6.4-i, R-6.4-k)
 */
export function httpStatusForCapabilityError(
  code: number,
): typeof CAPABILITY_ERROR_HTTP_STATUS | undefined {
  return code === MISSING_CLIENT_CAPABILITY_CODE || code === INVALID_PARAMS_CODE
    ? CAPABILITY_ERROR_HTTP_STATUS
    : undefined;
}

// ─── Sub-flag usage rules (§6.2) ───────────────────────────────────────────────

/** A server MUST NOT use URL-mode elicitation unless `elicitation.url` is present. (R-6.2-g) */
export function mayUseUrlElicitation(clientCaps: Record<string, unknown>): boolean {
  return clientDeclares(clientCaps, 'elicitation.url');
}

/** A server MUST NOT supply sampling `tools`/`toolChoice` unless `sampling.tools` is present. (R-6.2-q) */
export function mayUseSamplingTools(clientCaps: Record<string, unknown>): boolean {
  return clientDeclares(clientCaps, 'sampling.tools');
}

/** A server MUST NOT invoke `roots/list` unless `roots` is present. (R-6.2-i) */
export function mayInvokeRootsList(clientCaps: Record<string, unknown>): boolean {
  return clientDeclares(clientCaps, 'roots');
}

/** A server MUST NOT invoke `sampling/createMessage` unless `sampling` is present. (R-6.2-l) */
export function mayInvokeSampling(clientCaps: Record<string, unknown>): boolean {
  return clientDeclares(clientCaps, 'sampling');
}

/**
 * Returns whether a server MAY use a given `includeContext` value during
 * sampling, given the client's capabilities. (R-6.2-o)
 *
 * When `sampling.context` is absent the server SHOULD only use
 * `includeContext: "none"` (or omit it entirely); when present, any value is
 * allowed.
 */
export function mayUseIncludeContext(
  clientCaps: Record<string, unknown>,
  value: 'none' | 'thisServer' | 'allServers' | undefined,
): boolean {
  if (value === undefined || value === 'none') return true;
  return clientDeclares(clientCaps, 'sampling.context');
}

// ─── Graceful degradation (§6.4) ───────────────────────────────────────────────

/** What a peer should do when the other peer lacks an optional behavior. */
export type DegradationDecision = 'proceed' | 'fallback' | 'reject';

/**
 * Decides how to handle an operation when the other peer may not declare the
 * optional behavior it would use. (R-6.4-l, R-6.4-m)
 *
 *   - peer declares the behavior        → `'proceed'` (use the optional behavior)
 *   - peer does not, behavior optional  → `'fallback'` (use mutually supported core)
 *   - peer does not, behavior mandatory → `'reject'`
 *
 * A peer MUST NOT return `'reject'` merely because the other declared fewer
 * capabilities — rejection happens only when the missing behavior is mandatory
 * for the operation. (R-6.4-m)
 */
export function decideDegradation(opts: {
  peerDeclaresBehavior: boolean;
  behaviorMandatory: boolean;
}): DegradationDecision {
  if (opts.peerDeclaresBehavior) return 'proceed';
  return opts.behaviorMandatory ? 'reject' : 'fallback';
}
