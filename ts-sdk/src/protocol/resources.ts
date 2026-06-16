/**
 * S26 — Resources I: capability, listing, templates & types (§17.1–§17.4).
 *
 * The discovery surface for **resources** — server-provided units of context
 * (files, database schemas, documents, or any application-specific data) a
 * client may find and later read. This module fixes:
 *   - the `resources` server capability object (`listChanged` / `subscribe`
 *     sub-flags) and the gating predicates that bind it to which requests and
 *     notifications are legal (reusing the S10 capability predicates);
 *   - the `Resource` and `ResourceTemplate` data types (the latter carries a
 *     URI Template [RFC6570] and has NO `size` field);
 *   - the two paginated, cacheable discovery methods `resources/list` and
 *     `resources/templates/list`, with their request-params and result shapes
 *     (reusing the S18 pagination and S19 caching base shapes).
 *
 * Reuse (never redefined here): `serverDeclares` / `clientShouldExpectNotification`
 * (capability gating, S10), `PaginatedRequestParamsSchema` / `PaginatedResultSchema`
 * (S18), `CacheableResultSchema` / `CacheScopeSchema` (S19), `BaseMetadataSchema`
 * + `resolveDisplayName` (S20), `AnnotationsSchema` (S21), `IconSchema` (S20),
 * `RESULT_TYPE` (S04), and the `RESOURCES_LIST_CHANGED_METHOD` /
 * `RESOURCES_UPDATED_METHOD` notification-name constants (S16).
 *
 * Out of scope (owned elsewhere, per the story):
 *   - `resources/read`, `ReadResourceResult`, the resource-not-found error, and
 *     the common-URI-scheme catalog — S27 (§17.5–§17.6);
 *   - the `notifications/resources/list_changed` / `notifications/resources/updated`
 *     payload shapes and subscription delivery — S16/S27 (this story governs only
 *     *when* a server may emit them, via capability/sub-flag gating);
 *   - completion of template variable values — S29 (§19).
 */

import { z } from 'zod';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import { PaginatedRequestParamsSchema, PaginatedResultSchema } from './pagination.js';
import { CacheableResultSchema, type CacheScope } from './caching.js';
import {
  serverDeclares,
  clientShouldExpectNotification,
  type ServerCapabilities,
} from './capability-negotiation.js';
import { BaseMetadataSchema, resolveDisplayName } from '../types/base-metadata.js';
import { AnnotationsSchema } from '../types/annotations.js';
import { IconSchema } from '../types/icon.js';
import {
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
} from './streaming.js';

// Re-export the notification-name constants this feature gates so callers can
// reach the resources surface from one module. (Same bindings as S16 — not
// duplicates; do NOT redefine.)
export { RESOURCES_LIST_CHANGED_METHOD, RESOURCES_UPDATED_METHOD } from './streaming.js';

// ─── Method names (§17.2, §17.3) ───────────────────────────────────────────────

/** Method name of the paginated resource-listing request. (§17.2, R-17.2-a) */
export const RESOURCES_LIST_METHOD = 'resources/list' as const;

/** Method name of the paginated resource-template-listing request. (§17.3, R-17.3-a) */
export const RESOURCES_TEMPLATES_LIST_METHOD = 'resources/templates/list' as const;

// ─── `resources` server capability (§17.1) ─────────────────────────────────────

/**
 * The value of the `resources` key inside a server's capabilities object. Its
 * presence declares the feature; the two OPTIONAL boolean sub-flags declare the
 * optional notification behaviors. (§17.1, R-17.1-a, R-17.1-b)
 *
 *   - `listChanged` (OPTIONAL boolean): when `true`, the server MAY emit
 *     `notifications/resources/list_changed` when the available-resource set
 *     changes. (R-17.1-c, R-17.1-d)
 *   - `subscribe` (OPTIONAL boolean): when `true`, the server supports per-resource
 *     `notifications/resources/updated` for subscribed resources. (R-17.1-e)
 *
 * An empty object `{}` is a valid declaration carrying neither sub-flag. A server
 * MAY advertise either sub-flag independently, both, or neither. (R-17.1-f, R-17.1-g)
 * `.passthrough()` preserves forward-compatible additions.
 */
export const ResourcesServerCapabilitySchema = z
  .object({
    /** OPTIONAL. When `true`, the server MAY emit list-changed notifications. (R-17.1-c, R-17.1-d) */
    listChanged: z.boolean().optional(),
    /** OPTIONAL. When `true`, the server supports per-resource update notifications. (R-17.1-e) */
    subscribe: z.boolean().optional(),
  })
  .passthrough();

export type ResourcesServerCapability = z.infer<typeof ResourcesServerCapabilitySchema>;

// ─── Capability gating (§17.1, reusing S10) ────────────────────────────────────

/** The three requests gated by the `resources` capability. (§17.1, R-17.1-h, R-17.1-j) */
export const RESOURCE_GATED_METHODS = [
  RESOURCES_LIST_METHOD,
  RESOURCES_TEMPLATES_LIST_METHOD,
  'resources/read',
] as const;

/**
 * Returns `true` when the server has declared the `resources` capability (object
 * presence). Reuses {@link serverDeclares}; only when this is `true` may a server
 * accept `resources/list`, `resources/templates/list`, or `resources/read`, and a
 * client issue them. (§17.1, R-17.1-h, R-17.1-j)
 */
export function serverDeclaresResources(serverCaps: Record<string, unknown>): boolean {
  return serverDeclares(serverCaps, 'resources');
}

/**
 * Returns `true` when a server MAY accept the resource request `method` given its
 * declared capabilities — i.e. it is one of the three gated methods AND `resources`
 * is declared. A non-resource method returns `false`. (§17.1, R-17.1-h)
 *
 * A client MUST NOT issue any of these requests when this returns `false`
 * (R-17.1-j); a server MUST NOT accept them. (R-17.1-h)
 */
export function mayAcceptResourceRequest(
  method: string,
  serverCaps: Record<string, unknown>,
): boolean {
  if (!(RESOURCE_GATED_METHODS as readonly string[]).includes(method)) return false;
  return serverDeclaresResources(serverCaps);
}

/**
 * Returns `true` when a client MAY issue the resource request `method` against a
 * server with `serverCaps`. Mirror of {@link mayAcceptResourceRequest} from the
 * client's perspective. (§17.1, R-17.1-j)
 */
export function clientMayIssueResourceRequest(
  method: string,
  serverCaps: Record<string, unknown>,
): boolean {
  return mayAcceptResourceRequest(method, serverCaps);
}

/**
 * Returns `true` when the server MAY emit `notifications/resources/list_changed`:
 * it requires BOTH the `resources` capability AND the `listChanged` sub-flag.
 * (§17.1, R-17.1-i, R-17.1-k)
 *
 * Reuses {@link clientShouldExpectNotification}, whose S10 gating map already binds
 * this notification to `resources.listChanged`.
 */
export function mayEmitResourcesListChanged(serverCaps: Record<string, unknown>): boolean {
  return clientShouldExpectNotification(RESOURCES_LIST_CHANGED_METHOD, serverCaps);
}

/**
 * Returns `true` when the server MAY emit `notifications/resources/updated`: it
 * requires BOTH the `resources` capability AND the `subscribe` sub-flag.
 * (§17.1, R-17.1-i, R-17.1-l)
 *
 * Reuses {@link clientShouldExpectNotification} (S10 binds it to `resources.subscribe`).
 */
export function mayEmitResourceUpdated(serverCaps: Record<string, unknown>): boolean {
  return clientShouldExpectNotification(RESOURCES_UPDATED_METHOD, serverCaps);
}

// ─── URI validation (§17.4, RFC3986) ───────────────────────────────────────────

/** RFC3986 scheme: `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`. */
const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Returns `true` when `value` is a string in URI format [RFC3986] usable as a
 * concrete `Resource.uri` — it carries a scheme and at least one further
 * character. The scheme MAY be anything; the server defines its meaning.
 * (§17.4, R-17.4-a, R-17.4-b)
 *
 * A concrete resource URI must identify the resource uniquely, so a relative
 * reference (no scheme) is rejected. Uses the WHATWG `URL` parser (which only
 * accepts absolute URIs) after a conformant-scheme check so values like
 * `urn:isbn:0451450523` with an empty authority are handled consistently.
 */
export function isResourceUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (!URI_SCHEME_RE.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Zod schema for a `Resource.uri` — a non-empty RFC3986 URI string. (R-17.4-a) */
export const ResourceUriSchema = z
  .string()
  .refine(isResourceUri, { message: 'Resource.uri MUST be a URI string [RFC3986] with a scheme (R-17.4-a)' });

// ─── URI-template validation (§17.4, RFC6570) ──────────────────────────────────

/**
 * RFC6570 expression operator characters that MAY lead a `{…}` expression:
 * `+ # . / ; ? &` (Level 2–4); the level-1 simple expansion has no operator.
 */
const URI_TEMPLATE_OPERATOR = '+#./;?&';

/**
 * Returns `true` when `value` conforms to the URI Template grammar of [RFC6570]:
 * literal characters interspersed with well-formed `{…}` variable expressions
 * (e.g. `file:///{path}`, `db://{table}/{id}`). (§17.4, R-17.4-m)
 *
 * The check verifies brace balance and that every expression is non-empty and
 * contains a valid variable list — an optional leading operator from the RFC6570
 * set followed by one or more comma-separated `varspec`s, each a `varname` of
 * pct-encoded / unreserved / `.` / `_` characters with an OPTIONAL `*` (explode)
 * or `:N` (prefix, `N` a positive integer up to 9999) modifier. A literal `{` or
 * `}` that is not part of a balanced expression is rejected.
 */
export function isUriTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;

  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === '}') return false; // a closing brace with no matching opener
    if (ch !== '{') {
      i += 1;
      continue;
    }
    // Parse one `{…}` expression.
    const close = value.indexOf('}', i + 1);
    if (close === -1) return false; // unbalanced opening brace
    let body = value.slice(i + 1, close);
    if (body.length === 0) return false; // empty expression `{}`
    if (body.includes('{')) return false; // nested/unbalanced opener inside

    // Optional leading operator.
    if (URI_TEMPLATE_OPERATOR.includes(body[0]!)) {
      body = body.slice(1);
      if (body.length === 0) return false; // operator with no variables
    }

    const varspecs = body.split(',');
    for (const spec of varspecs) {
      if (!isValidVarspec(spec)) return false;
    }
    i = close + 1;
  }
  return true;
}

/** Validates a single RFC6570 `varspec`: `varname` with an OPTIONAL `*` or `:N` modifier. */
function isValidVarspec(spec: string): boolean {
  if (spec.length === 0) return false;

  // Explode modifier: trailing `*`.
  if (spec.endsWith('*')) {
    return isValidVarname(spec.slice(0, -1));
  }
  // Prefix modifier: `:N` with N a positive integer (max-length 9999 per RFC6570).
  const colon = spec.indexOf(':');
  if (colon !== -1) {
    const name = spec.slice(0, colon);
    const len = spec.slice(colon + 1);
    if (!/^[1-9]\d{0,3}$/.test(len)) return false;
    return isValidVarname(name);
  }
  return isValidVarname(spec);
}

/**
 * Validates an RFC6570 `varname`: one or more `varchar`s (unreserved letters,
 * digits, `_`, or pct-encoded `%XX`) separated by single `.`s. Empty names and
 * leading/trailing/doubled dots are rejected.
 */
function isValidVarname(name: string): boolean {
  if (name.length === 0) return false;
  // varname = varchar *( ["."] varchar ) where varchar = ALPHA / DIGIT / "_" / pct-encoded
  return /^(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*$/.test(name);
}

/**
 * Extracts the variable names referenced by a URI Template's `{…}` expressions,
 * in first-seen order with duplicates removed. Useful for driving completion
 * (§19) or prompting the user for values before expansion. (§17.4, R-17.4-n)
 *
 * Returns `[]` for a template with no expressions. Modifiers (`*`, `:N`) and the
 * leading operator are stripped from the reported names.
 */
export function uriTemplateVariables(template: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const re = /\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    let body = match[1]!;
    if (URI_TEMPLATE_OPERATOR.includes(body[0]!)) body = body.slice(1);
    for (const spec of body.split(',')) {
      const name = spec.replace(/[*].*$/, '').replace(/:.*$/, '');
      if (name.length > 0 && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

/** Zod schema for a `ResourceTemplate.uriTemplate` — an RFC6570 URI Template string. (R-17.4-m) */
export const UriTemplateSchema = z
  .string()
  .refine(isUriTemplate, { message: 'ResourceTemplate.uriTemplate MUST conform to the URI Template grammar [RFC6570] (R-17.4-m)' });

// ─── `Resource` type (§17.4) ───────────────────────────────────────────────────

/**
 * A concrete, directly readable resource identified by a URI. Includes the
 * `BaseMetadata` fields (`name` REQUIRED, `title` OPTIONAL) and the icon array.
 * (§17.4)
 *
 * Fields (R-17.4-a – R-17.4-l):
 *   - `uri` REQUIRED, RFC3986 URI string of any scheme. (R-17.4-a, R-17.4-b)
 *   - `name` REQUIRED programmatic identifier; `title` OPTIONAL display name
 *     (both from `BaseMetadata`; prefer `title` then fall back to `name`).
 *     (R-17.4-c, R-17.4-d, R-17.4-e)
 *   - `description` OPTIONAL prose hint to the model. (R-17.4-f)
 *   - `mimeType` OPTIONAL content MIME type, if known. (R-17.4-g)
 *   - `size` OPTIONAL raw byte count measured BEFORE base64/tokenization; a host
 *     MAY use it for file sizes and context-window estimates. (R-17.4-h, R-17.4-i)
 *   - `annotations` OPTIONAL `Annotations` hints. (R-17.4-j)
 *   - `icons` OPTIONAL `Icon[]` for display. (R-17.4-k)
 *   - `_meta` OPTIONAL reserved metadata map. (R-17.4-l)
 *
 * Composed by extending `BaseMetadataSchema` so `name`/`title` come from the one
 * canonical S20 definition rather than being re-typed. `.passthrough()` preserves
 * forward-compatible members.
 */
export const ResourceSchema = BaseMetadataSchema.extend({
  /** REQUIRED. RFC3986 URI uniquely identifying the resource; any scheme. (R-17.4-a, R-17.4-b) */
  uri: ResourceUriSchema,
  /** OPTIONAL. Prose describing what the resource represents; a hint to the model. (R-17.4-f) */
  description: z.string().optional(),
  /** OPTIONAL. MIME type of the resource's content, if known. (R-17.4-g) */
  mimeType: z.string().optional(),
  /** OPTIONAL. Raw content size in bytes, before base64/tokenization, if known. (R-17.4-h) */
  size: z.number().optional(),
  /** OPTIONAL. Client hints (`audience`, `priority`, `lastModified`, …). (R-17.4-j) */
  annotations: AnnotationsSchema.optional(),
  /** OPTIONAL. Icons for display in user interfaces. (R-17.4-k) */
  icons: z.array(IconSchema).optional(),
  /** OPTIONAL. Reserved metadata map. (R-17.4-l) */
  _meta: z.record(z.unknown()).optional(),
}).passthrough();

export type Resource = z.infer<typeof ResourceSchema>;

/**
 * Resolves the user-facing label for a `Resource`: prefer `title`, fall back to
 * `name`. (§17.4, R-17.4-e) Reuses the canonical S20 {@link resolveDisplayName}.
 */
export function resourceDisplayName(resource: Pick<Resource, 'name' | 'title'>): string {
  return resolveDisplayName(resource.name, resource.title);
}

// ─── `ResourceTemplate` type (§17.4) ───────────────────────────────────────────

/**
 * A family of resources whose URIs are produced by expanding a URI Template
 * [RFC6570]. Includes `BaseMetadata` and icon fields, and — unlike `Resource` —
 * carries NO `size` field (size is a property of a concrete resource, not a
 * template). (§17.4, R-17.4-u)
 *
 * Fields (R-17.4-m – R-17.4-t):
 *   - `uriTemplate` REQUIRED RFC6570 template expanded into a concrete `uri`. The
 *     client substitutes values for the named `{…}` variables, which MAY come from
 *     the user, computation, or completion (§19). (R-17.4-m, R-17.4-n)
 *   - `name` REQUIRED, `title` OPTIONAL (`BaseMetadata`). (R-17.4-o, R-17.4-p)
 *   - `description` OPTIONAL prose hint. (R-17.4-q)
 *   - `mimeType` OPTIONAL; SHOULD be set only when ALL matching resources share it.
 *     (R-17.4-r, R-17.4-s)
 *   - `annotations`, `icons`, `_meta` OPTIONAL, as for `Resource`. (R-17.4-t)
 *
 * `.strict()` is NOT used (forward-compatible members are allowed via
 * `.passthrough()`); the absence of `size` is a definitional property enforced by
 * {@link resourceTemplateHasNoSize} rather than by schema rejection, since
 * `.passthrough()` would otherwise carry an unknown `size` through.
 */
export const ResourceTemplateSchema = BaseMetadataSchema.extend({
  /** REQUIRED. RFC6570 URI Template expanded into a concrete resource `uri`. (R-17.4-m) */
  uriTemplate: UriTemplateSchema,
  /** OPTIONAL. Prose describing the template's purpose; a hint to the model. (R-17.4-q) */
  description: z.string().optional(),
  /** OPTIONAL. MIME type shared by ALL resources matching the template. (R-17.4-r, R-17.4-s) */
  mimeType: z.string().optional(),
  /** OPTIONAL. Client hints, as for `Resource`. (R-17.4-t) */
  annotations: AnnotationsSchema.optional(),
  /** OPTIONAL. Icons, as for `Resource`. (R-17.4-t) */
  icons: z.array(IconSchema).optional(),
  /** OPTIONAL. Reserved metadata map, as for `Resource`. (R-17.4-t) */
  _meta: z.record(z.unknown()).optional(),
}).passthrough();

export type ResourceTemplate = z.infer<typeof ResourceTemplateSchema>;

/**
 * Returns `true` when `template` carries no `size` field — a `ResourceTemplate`
 * MUST NOT have one (size belongs to a concrete resource, not a template).
 * (§17.4, R-17.4-u)
 */
export function resourceTemplateHasNoSize(template: Record<string, unknown>): boolean {
  return !Object.prototype.hasOwnProperty.call(template, 'size');
}

/**
 * Resolves the user-facing label for a `ResourceTemplate`: prefer `title`, fall
 * back to `name`, as for `Resource`. (§17.4, R-17.4-e via R-17.4-p) Reuses S20.
 */
export function resourceTemplateDisplayName(
  template: Pick<ResourceTemplate, 'name' | 'title'>,
): string {
  return resolveDisplayName(template.name, template.title);
}

// ─── `resources/list` request & result (§17.2) ─────────────────────────────────

/**
 * The `params` of a `resources/list` request. Extends the paginated-request shape
 * (S18), so it MAY carry an opaque `cursor` and OPTIONAL `_meta`; both are
 * optional. (§17.2, R-17.2-a, R-17.2-i)
 */
export const ListResourcesRequestParamsSchema = PaginatedRequestParamsSchema;

export type ListResourcesRequestParams = z.infer<typeof ListResourcesRequestParamsSchema>;

/**
 * The full `resources/list` request envelope: the literal method name plus the
 * OPTIONAL paginated `params`. (§17.2)
 */
export const ListResourcesRequestSchema = z
  .object({
    method: z.literal(RESOURCES_LIST_METHOD),
    params: ListResourcesRequestParamsSchema.optional(),
  })
  .passthrough();

export type ListResourcesRequest = z.infer<typeof ListResourcesRequestSchema>;

/**
 * The result of `resources/list`. It is BOTH a `PaginatedResult` (S18) and a
 * `CacheableResult` (S19), carrying a REQUIRED `resources` array. (§17.2)
 *
 *   - `resources` REQUIRED `Resource[]`; MAY be empty. (R-17.2-b)
 *   - `nextCursor` OPTIONAL opaque cursor; absent ⇒ listing complete. The client
 *     MUST treat it as opaque and MUST NOT parse/construct it. (R-17.2-c – R-17.2-e)
 *   - `resultType` REQUIRED; `"complete"` for a list result. (R-17.2-f)
 *   - `ttlMs` REQUIRED `≥ 0` and `cacheScope` REQUIRED `"public" | "private"`. (R-17.2-g, R-17.2-h)
 *   - `_meta` OPTIONAL reserved metadata map. (R-17.2-i)
 *
 * Built by intersecting the two reused base shapes and adding the list payload,
 * so the pagination/caching fields keep their single canonical definitions.
 */
export const ListResourcesResultSchema = PaginatedResultSchema.and(CacheableResultSchema).and(
  z.object({
    /**
     * REQUIRED. §17.2 fixes a list result to `"complete"`; any other value
     * (e.g. `"input_required"`) MUST be rejected — a list never solicits input.
     * The intersection narrows the inherited base `resultType` to this literal.
     * (R-17.2-f)
     */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** REQUIRED. The available resources; MAY be empty. (R-17.2-b) */
    resources: z.array(ResourceSchema),
  }),
);

export type ListResourcesResult = z.infer<typeof ListResourcesResultSchema>;

// ─── `resources/templates/list` request & result (§17.3) ───────────────────────

/**
 * The `params` of a `resources/templates/list` request. Like `resources/list`, it
 * extends the paginated-request shape and MAY carry `cursor` / `_meta`. (§17.3, R-17.3-a)
 */
export const ListResourceTemplatesRequestParamsSchema = PaginatedRequestParamsSchema;

export type ListResourceTemplatesRequestParams = z.infer<
  typeof ListResourceTemplatesRequestParamsSchema
>;

/**
 * The full `resources/templates/list` request envelope. (§17.3)
 */
export const ListResourceTemplatesRequestSchema = z
  .object({
    method: z.literal(RESOURCES_TEMPLATES_LIST_METHOD),
    params: ListResourceTemplatesRequestParamsSchema.optional(),
  })
  .passthrough();

export type ListResourceTemplatesRequest = z.infer<typeof ListResourceTemplatesRequestSchema>;

/**
 * The result of `resources/templates/list`. Paginated (S18) and cacheable (S19);
 * the pagination/caching fields behave exactly as in {@link ListResourcesResultSchema}.
 * (§17.3)
 *
 *   - `resourceTemplates` REQUIRED `ResourceTemplate[]`; MAY be empty. (R-17.3-b)
 *   - `resultType`, `ttlMs`, `cacheScope` REQUIRED, as in `resources/list`. (R-17.3-c)
 */
export const ListResourceTemplatesResultSchema = PaginatedResultSchema.and(
  CacheableResultSchema,
).and(
  z.object({
    /**
     * REQUIRED. Fixed to `"complete"` exactly as `resources/list`; any other
     * value MUST be rejected. (R-17.3-c)
     */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** REQUIRED. The available templates; MAY be empty. (R-17.3-b) */
    resourceTemplates: z.array(ResourceTemplateSchema),
  }),
);

export type ListResourceTemplatesResult = z.infer<typeof ListResourceTemplatesResultSchema>;

// ─── Result builders ───────────────────────────────────────────────────────────

/** The caching hints every list result must carry (REQUIRED together). (§13, R-17.2-g, R-17.2-h) */
export interface ListCacheHints {
  /** REQUIRED non-negative cache time-to-live in milliseconds. (R-17.2-g) */
  ttlMs: number;
  /** REQUIRED cache-sharing scope. (R-17.2-h) */
  cacheScope: CacheScope;
}

/**
 * Builds a `ListResourcesResult` with `resultType: "complete"` and the REQUIRED
 * caching hints. `nextCursor` and `_meta` are included only when supplied — they
 * are never defaulted. (§17.2, R-17.2-b, R-17.2-c, R-17.2-f – R-17.2-i)
 *
 * @param resources - The available resources (MAY be empty).
 * @param hints     - The REQUIRED `ttlMs` / `cacheScope` caching hints.
 * @param opts      - OPTIONAL `nextCursor` (omit on the final page) and `_meta`.
 * @throws {RangeError} When `hints.ttlMs` is negative — caching hints require `≥ 0`.
 */
export function buildListResourcesResult(
  resources: readonly Resource[],
  hints: ListCacheHints,
  opts: { nextCursor?: string; _meta?: Record<string, unknown> } = {},
): ListResourcesResult {
  if (hints.ttlMs < 0) {
    throw new RangeError('ListResourcesResult.ttlMs MUST be ≥ 0 (R-17.2-g)');
  }
  const result: ListResourcesResult = {
    resultType: RESULT_TYPE.COMPLETE,
    resources: [...resources],
    ttlMs: hints.ttlMs,
    cacheScope: hints.cacheScope,
  };
  if (opts.nextCursor !== undefined) result.nextCursor = opts.nextCursor;
  if (opts._meta !== undefined) result._meta = opts._meta;
  return result;
}

/**
 * Builds a `ListResourceTemplatesResult` with `resultType: "complete"` and the
 * REQUIRED caching hints; `nextCursor` / `_meta` included only when supplied.
 * (§17.3, R-17.3-b, R-17.3-c)
 *
 * @throws {RangeError} When `hints.ttlMs` is negative.
 */
export function buildListResourceTemplatesResult(
  resourceTemplates: readonly ResourceTemplate[],
  hints: ListCacheHints,
  opts: { nextCursor?: string; _meta?: Record<string, unknown> } = {},
): ListResourceTemplatesResult {
  if (hints.ttlMs < 0) {
    throw new RangeError('ListResourceTemplatesResult.ttlMs MUST be ≥ 0 (R-17.3-c)');
  }
  const result: ListResourceTemplatesResult = {
    resultType: RESULT_TYPE.COMPLETE,
    resourceTemplates: [...resourceTemplates],
    ttlMs: hints.ttlMs,
    cacheScope: hints.cacheScope,
  };
  if (opts.nextCursor !== undefined) result.nextCursor = opts.nextCursor;
  if (opts._meta !== undefined) result._meta = opts._meta;
  return result;
}

// ─── Capability declaration helper ─────────────────────────────────────────────

/**
 * Builds the `resources` value for a server's `ServerCapabilities`, including a
 * sub-flag only when explicitly `true`. The empty-object form `{}` (neither
 * sub-flag) is produced when both are omitted/false. (§17.1, R-17.1-f, R-17.1-g)
 *
 * @param opts - OPTIONAL `listChanged` / `subscribe` sub-flags.
 */
export function buildResourcesCapability(
  opts: { listChanged?: boolean; subscribe?: boolean } = {},
): ResourcesServerCapability {
  const cap: ResourcesServerCapability = {};
  if (opts.listChanged === true) cap.listChanged = true;
  if (opts.subscribe === true) cap.subscribe = true;
  return cap;
}

/**
 * Narrowing accessor: returns the `resources` capability object from a parsed
 * `ServerCapabilities`, or `undefined` when the server did not declare it.
 * (§17.1, R-17.1-a)
 */
export function getResourcesCapability(
  caps: ServerCapabilities,
): ResourcesServerCapability | undefined {
  return caps.resources;
}
