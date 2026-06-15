/**
 * S27 — Resources II: reading, not-found, subscriptions & URI schemes
 * (§17.5–§17.9).
 *
 * The **read side** of the Resources feature begun in S26. It turns a concrete
 * resource `uri` (discovered via `resources/list` or produced by expanding a
 * `ResourceTemplate`) into actual bytes or text, and fixes the surrounding
 * normative surface:
 *   - the `resources/read` request shape (`ReadResourceRequestParams`: a REQUIRED
 *     `uri` plus the OPTIONAL multi-round-trip retry fields `inputResponses` /
 *     `requestState`) and the read result (`ReadResourceResult`): a
 *     `CacheableResult` carrying a REQUIRED `contents` array of
 *     `TextResourceContents` | `BlobResourceContents`;
 *   - the `input_required` read variant (mechanics owned by §11 / S17) and the
 *     client's direct-`https`-fetch shortcut;
 *   - the resource-not-found error — `-32602` (Invalid params) with `data.uri`,
 *     plus legacy-`-32002` client acceptance and the `-32603` internal-error
 *     boundary — and the prohibition on an empty `contents` array to signal
 *     non-existence;
 *   - the resource change/update notification payloads
 *     (`notifications/resources/list_changed`,
 *     `notifications/resources/updated`) and the §10 / S16 filter gating that
 *     decides which streams receive them (there is NO `subscribe`/`unsubscribe`
 *     request method);
 *   - the common-URI-scheme catalog (`https` / `file` / `git` + custom-scheme
 *     rules per RFC3986) and the scheme-selection guidance.
 *
 * Reuse (never redefined here): `Resource` / `RESOURCES_LIST_METHOD` /
 * `mayAcceptResourceRequest` / `isResourceUri` (S26 resources.ts);
 * `ResourceContentsSchema` / `TextResourceContentsSchema` /
 * `BlobResourceContentsSchema` (S21 resource-contents.ts); the
 * `RESOURCES_UPDATED_METHOD` / `RESOURCES_LIST_CHANGED_METHOD` constants, the
 * `SubscriptionFilter` machinery, `mayDeliverResourceUpdate` /
 * `mayEmitChangeNotification` / `ResourceUpdatedNotificationParamsSchema`
 * (S16 streaming.ts); `CacheableResultSchema` / `CacheScopeSchema` (S19
 * caching.ts); `RESULT_TYPE` (S04 payload.ts); `INVALID_PARAMS_CODE` (S05
 * meta.ts); `InputResponseRequestParamsSchema` / `discriminateResultType` (S17).
 *
 * Out of scope (owned elsewhere): the `resources` capability and its
 * `subscribe` / `listChanged` sub-flags, `resources/list`, the `Resource` and
 * `ResourceTemplate` types — S26; the subscription stream, the
 * `subscriptions/listen` request and subscription-id correlation — S16; the
 * multi-round-trip `input_required` payload structure — S17; the
 * `ttlMs`/`cacheScope` caching semantics — S19; the `TextResourceContents` /
 * `BlobResourceContents` definitions — S21; the full error-code registry — S34.
 */

import { z } from 'zod';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import { INVALID_PARAMS_CODE } from './meta.js';
import { CacheableResultSchema, CacheScopeSchema, type CacheScope } from './caching.js';
import {
  ResourceContentsSchema,
  TextResourceContentsSchema,
  BlobResourceContentsSchema,
  type ResourceContents,
} from '../types/resource-contents.js';
import { isResourceUri, ResourceUriSchema, mayAcceptResourceRequest } from './resources.js';
import {
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
  ResourceUpdatedNotificationParamsSchema,
  mayDeliverResourceUpdate,
  type SubscriptionFilter,
} from './streaming.js';

// Re-export the notification-name constants this read surface depends on so a
// caller can reach the whole resources-read feature from one module. (Same
// bindings as S16 — not duplicates; do NOT redefine.)
export {
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
} from './streaming.js';

// ─── Method name (§17.5) ───────────────────────────────────────────────────────

/** Method name of the `resources/read` request. (§17.5, R-17.5-b) */
export const RESOURCES_READ_METHOD = 'resources/read' as const;

// ─── Error codes (§17.6) ───────────────────────────────────────────────────────

/**
 * The code a server MUST return when a requested `uri` does not correspond to a
 * readable resource: `-32602` (Invalid params). Reuses the canonical
 * {@link INVALID_PARAMS_CODE} from S05/S34. (§17.6, R-17.6-a)
 *
 * Re-exported under the `RESOURCE_NOT_FOUND` name so resource-read callers can
 * reference the not-found code without re-importing the generic params code.
 */
export const RESOURCE_NOT_FOUND_CODE = INVALID_PARAMS_CODE;

/**
 * The LEGACY resource-not-found code, `-32002`. An earlier protocol revision
 * used this code for the not-found condition; for interoperability a client
 * SHOULD treat it as resource-not-found in ADDITION to `-32602`. A modern
 * server MUST NOT mint it — {@link buildResourceNotFoundError} emits `-32602`.
 * (§17.6, R-17.6-c)
 */
export const LEGACY_RESOURCE_NOT_FOUND_CODE = -32002 as const;

/**
 * The code a server SHOULD return for an internal failure that is unrelated to
 * the validity of the requested `uri`: `-32603` (Internal error). Defined
 * locally (mirroring `PROMPTS_INTERNAL_ERROR_CODE` in S18) so this protocol
 * module does not depend on the HTTP transport layer; S34 owns the canonical
 * registry entry. (§17.6, R-17.6-d)
 */
export const RESOURCE_READ_INTERNAL_ERROR_CODE = -32603 as const;

/**
 * Returns `true` when `code` denotes resource-not-found from a CLIENT's
 * perspective — either the modern `-32602` or the legacy `-32002`. A client
 * SHOULD accept both. (§17.6, R-17.6-a, R-17.6-c)
 */
export function isResourceNotFoundCode(code: unknown): boolean {
  return code === RESOURCE_NOT_FOUND_CODE || code === LEGACY_RESOURCE_NOT_FOUND_CODE;
}

/** The `data` payload of a resource-not-found error. (§17.6, R-17.6-b) */
export interface ResourceNotFoundErrorData {
  /** SHOULD carry the offending `uri` so the client can correlate the failure. (R-17.6-b) */
  uri?: string;
  /** Additional sender-defined detail MAY be present. */
  [key: string]: unknown;
}

/** A JSON-RPC resource-not-found error payload. (§17.6) */
export interface ResourceNotFoundError {
  /** `-32602` (Invalid params). (R-17.6-a) */
  code: typeof RESOURCE_NOT_FOUND_CODE;
  /** Human-readable description, e.g. "Resource not found". */
  message: string;
  /** SHOULD include the offending `uri`. (R-17.6-b) */
  data: ResourceNotFoundErrorData;
}

/**
 * Builds the JSON-RPC error a server returns when a requested `uri` is not a
 * readable resource. The `code` is the modern `-32602` (Invalid params); the
 * offending `uri` is placed in `data.uri` so the client can correlate the
 * failure. A server MUST return this error — NOT an empty `contents` result —
 * to signal non-existence. (§17.5, §17.6, R-17.5-aa, R-17.6-a, R-17.6-b)
 *
 * @param uri     - The offending resource URI (echoed into `data.uri`).
 * @param message - OPTIONAL human-readable message (defaults to "Resource not found").
 */
export function buildResourceNotFoundError(
  uri: string,
  message = 'Resource not found',
): ResourceNotFoundError {
  return {
    code: RESOURCE_NOT_FOUND_CODE,
    message,
    data: { uri },
  };
}

/**
 * Builds the `-32603` (Internal error) a server SHOULD return for a failure
 * UNRELATED to the validity of the requested `uri` (e.g. a backing store is
 * unreachable). Distinct from {@link buildResourceNotFoundError}, which is for a
 * `uri` that simply does not exist. (§17.6, R-17.6-d)
 */
export function buildResourceReadInternalError(message = 'Internal error reading resource'): {
  code: typeof RESOURCE_READ_INTERNAL_ERROR_CODE;
  message: string;
} {
  return { code: RESOURCE_READ_INTERNAL_ERROR_CODE, message };
}

// ─── `resources/read` request (§17.5) ──────────────────────────────────────────

/**
 * The `params` of a `resources/read` request. (§17.5)
 *
 *   - `uri` REQUIRED — the exact resource to read, in URI format [RFC3986]. MAY
 *     be a concrete resource from `resources/list` or a URI produced by
 *     expanding a `ResourceTemplate`. (R-17.5-b, R-17.5-c)
 *   - `inputResponses` OPTIONAL — present only on a retry that satisfies the
 *     server's earlier `inputRequests`. Every key from those `inputRequests`
 *     MUST appear here with its response. Mechanics owned by §11 / S17.
 *     (R-17.5-a, R-17.5-d, R-17.5-e)
 *   - `requestState` OPTIONAL — the opaque continuation token from an earlier
 *     `input_required` result, echoed back UNCHANGED on retry; the client MUST
 *     treat it as opaque and MUST NOT interpret or modify it.
 *     (R-17.5-f, R-17.5-g, R-17.5-h)
 *   - `_meta` OPTIONAL reserved metadata map (§14 / S21).
 *
 * `_meta` is OPTIONAL on this abstract params shape (per §17.5's table); the
 * per-request reserved keys of §4 are layered on by the transport, exactly as
 * for the other resource methods. `.passthrough()` preserves forward-compatible
 * members. The retry fields mirror `InputResponseRequestParamsSchema` (S17),
 * which owns their semantics.
 */
export const ReadResourceRequestParamsSchema = z
  .object({
    /** REQUIRED. The exact resource to read, an RFC3986 URI string. (R-17.5-b, R-17.5-c) */
    uri: ResourceUriSchema,
    /** OPTIONAL. Retry responses keyed by the server's earlier `inputRequests`. (R-17.5-d, R-17.5-e) */
    inputResponses: z.record(z.unknown()).optional(),
    /** OPTIONAL. Opaque continuation token echoed verbatim on retry. (R-17.5-f, R-17.5-g, R-17.5-h) */
    requestState: z.string().optional(),
    /** OPTIONAL. Reserved metadata map. (§14 / S21) */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ReadResourceRequestParams = z.infer<typeof ReadResourceRequestParamsSchema>;

/**
 * The full `resources/read` request envelope: the literal method name plus the
 * REQUIRED `params`. (§17.5)
 */
export const ReadResourceRequestSchema = z
  .object({
    method: z.literal(RESOURCES_READ_METHOD),
    params: ReadResourceRequestParamsSchema,
  })
  .passthrough();

export type ReadResourceRequest = z.infer<typeof ReadResourceRequestSchema>;

/**
 * Returns `true` when `method` is `resources/read` AND the server declared the
 * `resources` capability — i.e. a server MAY accept the read and a client MAY
 * issue it. Reuses {@link mayAcceptResourceRequest} (S26), which already gates
 * `resources/read` on the `resources` capability. (§17.1 via §17.5)
 */
export function mayReadResource(serverCaps: Record<string, unknown>): boolean {
  return mayAcceptResourceRequest(RESOURCES_READ_METHOD, serverCaps);
}

/**
 * Builds a `resources/read` request-params object. Includes the OPTIONAL retry
 * fields only when supplied, so a first-attempt read carries just `uri`.
 * (§17.5, R-17.5-a, R-17.5-b, R-17.5-d, R-17.5-f)
 *
 * @param uri  - The resource to read (REQUIRED).
 * @param opts - OPTIONAL `inputResponses` / `requestState` (retry) and `_meta`.
 * @throws {TypeError} When `uri` is not a valid RFC3986 resource URI. (R-17.5-b)
 */
export function buildReadResourceRequestParams(
  uri: string,
  opts: {
    inputResponses?: Record<string, unknown>;
    requestState?: string;
    _meta?: Record<string, unknown>;
  } = {},
): ReadResourceRequestParams {
  if (!isResourceUri(uri)) {
    throw new TypeError(`resources/read uri MUST be a URI string [RFC3986] with a scheme (R-17.5-b): ${uri}`);
  }
  const params: ReadResourceRequestParams = { uri };
  if (opts.inputResponses !== undefined) params.inputResponses = opts.inputResponses;
  if (opts.requestState !== undefined) params.requestState = opts.requestState;
  if (opts._meta !== undefined) params._meta = opts._meta;
  return params;
}

/**
 * Builds the retry params for a `resources/read` that the server answered with
 * `input_required`. Every key in the server's `inputRequests` MUST be answered
 * in `inputResponses`; the prior `requestState` (when the server supplied one)
 * is echoed back BYTE-FOR-BYTE unchanged. (§17.5, R-17.5-e, R-17.5-g, R-17.5-h, R-17.5-x)
 *
 * @param uri            - The same resource URI as the original request.
 * @param inputRequests  - The server's earlier `inputRequests` (its key set).
 * @param inputResponses - The client's responses; MUST cover every `inputRequests` key.
 * @param requestState   - The opaque token from the `input_required` result, if any.
 * @throws {Error} When `inputResponses` does not answer every `inputRequests` key. (R-17.5-e)
 */
export function buildReadResourceRetryParams(
  uri: string,
  inputRequests: Record<string, unknown>,
  inputResponses: Record<string, unknown>,
  requestState?: string,
): ReadResourceRequestParams {
  const missing = Object.keys(inputRequests).filter(
    (k) => !Object.prototype.hasOwnProperty.call(inputResponses, k),
  );
  if (missing.length > 0) {
    throw new Error(
      `resources/read retry inputResponses MUST answer every inputRequests key (R-17.5-e); missing: ${missing.join(', ')}`,
    );
  }
  // requestState is opaque: echoed verbatim, never interpreted or modified. (R-17.5-g, R-17.5-h)
  return buildReadResourceRequestParams(uri, { inputResponses, requestState });
}

// ─── `ReadResourceResult` (§17.5) ──────────────────────────────────────────────

/**
 * The result of a successful `resources/read`. It is a `CacheableResult` (S19)
 * carrying a REQUIRED `contents` array. (§17.5)
 *
 *   - `contents` REQUIRED `(TextResourceContents | BlobResourceContents)[]`. MAY
 *     hold multiple entries (e.g. the files under a directory resource). Each
 *     entry is EITHER text or binary; a text entry sets `text` only when the
 *     item is representable as text, a binary entry carries base64 `blob`
 *     [RFC4648] and MUST NOT carry `text`. An entry's `uri` MAY differ from the
 *     requested `uri` (sub-resources). (R-17.5-i – R-17.5-p, R-17.5-s – R-17.5-v)
 *   - `resultType` REQUIRED; fixed to `"complete"` for a completed read. The
 *     `"input_required"` variant is the SEPARATE
 *     {@link InputRequiredReadResultSchema}. (R-17.5-q)
 *   - `ttlMs` (≥ 0) and `cacheScope` (`"public" | "private"`) REQUIRED; governed
 *     by §13 / S19. (R-17.5-r)
 *   - `_meta` OPTIONAL reserved metadata map.
 *
 * Built by intersecting the reused `CacheableResultSchema` with the read payload
 * and narrowing the inherited `resultType` to the `"complete"` literal, so a
 * list-style result with any other `resultType` is rejected. The element schema
 * reuses S21's `ResourceContentsSchema`, whose own `superRefine` already rejects
 * an entry carrying BOTH `text` and `blob`. (R-17.5-n)
 */
export const ReadResourceResultSchema = CacheableResultSchema.and(
  z.object({
    /**
     * REQUIRED. A read result is fixed to `"complete"`; the intersection narrows
     * the inherited base `resultType` to this literal so a malformed list-style
     * value is rejected. (R-17.5-q)
     */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** REQUIRED. One or more text/binary content entries; MAY differ in `uri`. (R-17.5-i, R-17.5-j, R-17.5-p) */
    contents: z.array(ResourceContentsSchema),
  }),
);

export type ReadResourceResult = z.infer<typeof ReadResourceResultSchema>;

/**
 * The `input_required` variant a server MAY return from `resources/read` instead
 * of a {@link ReadResourceResultSchema}, signalling it needs additional client
 * input before the resource can be read. The full multi-round-trip payload
 * shape (`inputRequests` / `requestState`) is owned by §11 / S17; here we fix
 * only the discriminator so a caller can branch on it. (§17.5, R-17.5-w)
 *
 * `.passthrough()` preserves the S17-owned members.
 */
export const InputRequiredReadResultSchema = z
  .object({
    /** REQUIRED discriminator; `"input_required"` selects this variant. (R-17.5-w) */
    resultType: z.literal(RESULT_TYPE.INPUT_REQUIRED),
  })
  .passthrough();

export type InputRequiredReadResult = z.infer<typeof InputRequiredReadResultSchema>;

/**
 * Returns `true` when a `resources/read` reply is the `input_required` variant
 * rather than a completed `ReadResourceResult`. (§17.5, R-17.5-w)
 */
export function isInputRequiredReadResult(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false;
  return (result as Record<string, unknown>)['resultType'] === RESULT_TYPE.INPUT_REQUIRED;
}

/** The REQUIRED caching hints every read result carries together. (§13, R-17.5-r) */
export interface ReadCacheHints {
  /** REQUIRED non-negative cache time-to-live in milliseconds. (R-17.5-r) */
  ttlMs: number;
  /** REQUIRED cache-sharing scope. (R-17.5-r) */
  cacheScope: CacheScope;
}

/**
 * Builds a `ReadResourceResult` with `resultType: "complete"` and the REQUIRED
 * caching hints. The `contents` array MUST NOT be used to signal non-existence —
 * an empty array is rejected here so a server cannot accidentally express
 * "not found" as an empty result; use {@link buildResourceNotFoundError}
 * instead. (§17.5, R-17.5-i, R-17.5-q, R-17.5-r, R-17.5-z)
 *
 * @param contents - One or more text/binary content entries (MUST be non-empty).
 * @param hints    - The REQUIRED `ttlMs` / `cacheScope` caching hints.
 * @param opts     - OPTIONAL `_meta`.
 * @throws {RangeError} When `hints.ttlMs` is negative. (R-17.5-r)
 * @throws {RangeError} When `contents` is empty — non-existence MUST be the
 *   `-32602` error, never an empty result. (R-17.5-z, R-17.5-aa)
 */
export function buildReadResourceResult(
  contents: readonly ResourceContents[],
  hints: ReadCacheHints,
  opts: { _meta?: Record<string, unknown> } = {},
): ReadResourceResult {
  if (hints.ttlMs < 0) {
    throw new RangeError('ReadResourceResult.ttlMs MUST be ≥ 0 (R-17.5-r)');
  }
  if (contents.length === 0) {
    throw new RangeError(
      'ReadResourceResult.contents MUST NOT be empty; signal non-existence with the -32602 error, not an empty array (R-17.5-z)',
    );
  }
  const result: ReadResourceResult = {
    resultType: RESULT_TYPE.COMPLETE,
    contents: [...contents],
    ttlMs: hints.ttlMs,
    cacheScope: hints.cacheScope,
  };
  if (opts._meta !== undefined) result._meta = opts._meta;
  return result;
}

// ─── Change & update notifications (§17.7) ─────────────────────────────────────

/**
 * The full `notifications/resources/list_changed` notification envelope — the
 * server-to-client signal that the set of available resources changed. `params`
 * is OPTIONAL and MAY carry only `_meta`. The server SHOULD emit this only when
 * it declared the `listChanged` sub-flag, and MUST NOT deliver it on a stream
 * whose §10 filter did not request `resourcesListChanged`. (§17.7, R-17.7-b,
 * R-17.7-c, R-17.7-e)
 *
 * The DELIVERY-gating (which streams receive it) is owned by §10 / S16; this is
 * just the payload shape — a notification with NO required `params`.
 */
export const ResourceListChangedNotificationSchema = z
  .object({
    method: z.literal(RESOURCES_LIST_CHANGED_METHOD),
    params: z
      .object({ _meta: z.record(z.unknown()).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ResourceListChangedNotification = z.infer<
  typeof ResourceListChangedNotificationSchema
>;

/**
 * The full `notifications/resources/updated` notification envelope — the
 * server-to-client signal that a specific subscribed resource changed and may
 * need re-reading. `params` is REQUIRED and reuses S16's
 * {@link ResourceUpdatedNotificationParamsSchema}, which fixes the REQUIRED
 * absolute `uri` (MAY be a sub-resource of the subscribed URI) and the `_meta`
 * subscription-id correlation. The server MUST NOT send this for a resource the
 * client did not list in `resourceSubscriptions`. (§17.7, R-17.7-f, R-17.7-g,
 * R-17.7-h, R-17.7-j)
 */
export const ResourceUpdatedNotificationSchema = z
  .object({
    method: z.literal(RESOURCES_UPDATED_METHOD),
    params: ResourceUpdatedNotificationParamsSchema,
  })
  .passthrough();

export type ResourceUpdatedNotification = z.infer<typeof ResourceUpdatedNotificationSchema>;

/**
 * Builds a `notifications/resources/list_changed` notification. `params` is
 * included only when `_meta` is supplied. (§17.7, R-17.7-b)
 */
export function buildResourceListChangedNotification(
  opts: { _meta?: Record<string, unknown> } = {},
): ResourceListChangedNotification {
  if (opts._meta === undefined) {
    return { method: RESOURCES_LIST_CHANGED_METHOD };
  }
  return { method: RESOURCES_LIST_CHANGED_METHOD, params: { _meta: opts._meta } };
}

/**
 * Builds a `notifications/resources/updated` notification carrying the changed
 * resource `uri` (which MAY be a sub-resource of the subscribed URI) and the
 * subscription id under `io.modelcontextprotocol/subscriptionId` in `_meta`.
 * (§17.7, R-17.7-f, R-17.7-g, R-17.7-h)
 *
 * @param uri            - The updated resource URI (REQUIRED, absolute).
 * @param subscriptionId - The subscription id to correlate against (the
 *   `subscriptions/listen` request id, serialized).
 * @param extraMeta      - OPTIONAL additional `_meta` members.
 */
export function buildResourceUpdatedNotification(
  uri: string,
  subscriptionId: string,
  extraMeta: Record<string, unknown> = {},
): ResourceUpdatedNotification {
  return {
    method: RESOURCES_UPDATED_METHOD,
    params: {
      ...extraMeta,
      uri,
      _meta: {
        ...(extraMeta._meta as Record<string, unknown> | undefined),
        'io.modelcontextprotocol/subscriptionId': subscriptionId,
      },
    },
  };
}

/**
 * Returns `true` when a server MAY send `notifications/resources/updated` for
 * `updatedUri` given the client's opted-in `resourceSubscriptions` filter — i.e.
 * the URI (or a parent container it is a sub-resource of) was listed. A server
 * MUST NOT send an update for any resource the client did not opt into. Reuses
 * S16's {@link mayDeliverResourceUpdate}. (§17.7, R-17.7-i, R-17.7-j)
 *
 * @param updatedUri - The URI that changed.
 * @param filter     - The §10 subscription filter the client opened the stream with.
 */
export function mayNotifyResourceUpdated(
  updatedUri: string,
  filter: SubscriptionFilter,
): boolean {
  const subscriptions = filter.resourceSubscriptions ?? [];
  if (subscriptions.length === 0) return false;
  return mayDeliverResourceUpdate(updatedUri, subscriptions);
}

/**
 * Returns `true` when a server MAY deliver `notifications/resources/list_changed`
 * on a stream whose §10 filter is `filter` — only when the client opted in via
 * `resourcesListChanged: true`. A server MUST NOT deliver it on a stream that did
 * not request the filter. (§17.7, R-17.7-d, R-17.7-e)
 */
export function mayNotifyResourcesListChanged(filter: SubscriptionFilter): boolean {
  return filter.resourcesListChanged === true;
}

/**
 * There is NO `subscribe` / `unsubscribe` request method for resources;
 * subscription is governed ENTIRELY by the §10 / S16 stream filters. This
 * constant records that absence so a caller can assert it. (§17.7, R-17.7-a)
 */
export const RESOURCE_SUBSCRIBE_REQUEST_METHODS = Object.freeze([] as const);

/**
 * Returns `true` if `method` is a (non-existent) per-resource subscribe/
 * unsubscribe request — it ALWAYS returns `false`, because no such method
 * exists; opting in/out is done through the §10 filter, not a request.
 * (§17.7, R-17.7-a)
 */
export function isResourceSubscribeRequestMethod(_method: string): boolean {
  return false;
}

// ─── Common URI schemes (§17.9) ────────────────────────────────────────────────

/**
 * The standard (NON-exhaustive) URI schemes a resource `uri` commonly uses.
 * (§17.9, R-17.9-a, R-17.9-b, R-17.9-c)
 *
 *   - `https` — use ONLY when the client can fetch and load the resource
 *     directly from the web on its own, without reading it via the MCP server.
 *   - `file`  — local-filesystem resources (including non-regular files such as
 *     directories, see {@link INODE_DIRECTORY_MIME_TYPE}).
 *   - `git`   — resources addressed in a Git repository.
 *
 * The list is explicitly non-exhaustive: an implementation MAY use additional
 * custom schemes (which MUST conform to RFC3986). (R-17.9-a, R-17.9-e)
 */
export const WELL_KNOWN_URI_SCHEMES = ['https', 'file', 'git'] as const;

export type WellKnownUriScheme = (typeof WELL_KNOWN_URI_SCHEMES)[number];

/**
 * The XDG shared-mime-info type a server MAY use to identify a `file://`
 * resource that is a non-regular file (e.g. a directory) with no other standard
 * MIME type. (§17.9, R-17.9-d)
 */
export const INODE_DIRECTORY_MIME_TYPE = 'inode/directory' as const;

/**
 * Extracts the lower-cased scheme of a URI string, or `undefined` when `value`
 * is not a string with a conformant RFC3986 scheme (`ALPHA *( ALPHA / DIGIT /
 * "+" / "-" / "." )`). The scheme is everything before the first `:`. (§17.9, R-17.9-e)
 *
 * @example
 * uriScheme('file:///x')          // 'file'
 * uriScheme('Custom-App.v2://x')  // 'custom-app.v2'
 * uriScheme('not a uri')          // undefined
 */
export function uriScheme(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(value);
  return match ? match[1]!.toLowerCase() : undefined;
}

/**
 * Returns `true` when `value` is a valid RFC3986 URI whose scheme is NOT one of
 * the well-known schemes — i.e. a custom scheme. A custom scheme MUST conform to
 * RFC3986 (enforced via {@link isResourceUri}); the SHOULD-level scheme-selection
 * guidance is advisory and not enforced here. (§17.9, R-17.9-a, R-17.9-e, R-17.9-f)
 */
export function isCustomUriScheme(value: unknown): boolean {
  if (!isResourceUri(value)) return false;
  const scheme = uriScheme(value);
  return scheme !== undefined && !(WELL_KNOWN_URI_SCHEMES as readonly string[]).includes(scheme);
}

/**
 * Returns `true` when `value` is an `https`-scheme resource URI — the case in
 * which a client MAY fetch the resource directly from the web rather than via
 * `resources/read`. (§17.5, §17.9, R-17.5-y, R-17.9-b)
 */
export function isHttpsResourceUri(value: unknown): boolean {
  return isResourceUri(value) && uriScheme(value) === 'https';
}

/**
 * Returns `true` when a client MAY skip `resources/read` and fetch `uri`
 * directly from the web — true exactly when `uri` is an `https` resource URI.
 * (§17.5, R-17.5-y)
 */
export function mayFetchDirectly(uri: string): boolean {
  return isHttpsResourceUri(uri);
}

/**
 * Scheme-selection guidance (§17.9, R-17.9-b, R-17.9-c): a server SHOULD use the
 * `https` scheme ONLY when the client can fetch and load the resource directly
 * from the web on its own; for any OTHER case it SHOULD prefer another scheme (or
 * define a custom one) EVEN IF the server itself downloads the contents over the
 * internet.
 *
 * Returns the SHOULD-recommended scheme posture for a resource:
 *   - `directlyFetchable: true`  → recommends `https`. (R-17.9-b)
 *   - `directlyFetchable: false` → recommends a non-`https` scheme. (R-17.9-c)
 *
 * This encodes the SHOULD as advice a server can consult; it does not forbid
 * other choices.
 */
export function recommendedUriScheme(directlyFetchable: boolean): {
  scheme: 'https' | 'non-https';
  rationale: string;
} {
  return directlyFetchable
    ? {
        scheme: 'https',
        rationale:
          'The client can fetch and load the resource directly from the web; use https (R-17.9-b)',
      }
    : {
        scheme: 'non-https',
        rationale:
          'The resource is not directly web-fetchable by the client; prefer another or a custom scheme even if the server downloads it (R-17.9-c)',
      };
}

/**
 * Returns `true` when using the `https` scheme is consistent with the §17.9
 * guidance for a resource with the given direct-fetchability. `https` is
 * appropriate ONLY when the client can fetch it directly; otherwise a server
 * SHOULD prefer another scheme. (§17.9, R-17.9-b, R-17.9-c)
 */
export function shouldUseHttpsScheme(directlyFetchable: boolean): boolean {
  return directlyFetchable;
}

// Re-export the content-entry schemas this read result composes, so callers can
// validate/construct individual entries from the same module. (Same bindings as
// S21 — not duplicates; do NOT redefine.)
export {
  ResourceContentsSchema,
  TextResourceContentsSchema,
  BlobResourceContentsSchema,
} from '../types/resource-contents.js';
export type {
  ResourceContents,
  TextResourceContents,
  BlobResourceContents,
} from '../types/resource-contents.js';
