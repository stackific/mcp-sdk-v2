/**
 * S16 — Server-to-Client Streaming & Subscriptions (§10).
 *
 * Defines the single, transport-agnostic mechanism by which a client opts in to
 * server-initiated change notifications: the `subscriptions/listen` request,
 * whose response is ONE long-lived stream that carries only the notification
 * kinds the client explicitly requested.
 *
 * The model is stateless and request-scoped: a subscription's state is scoped to
 * its `subscriptions/listen` request, not to the connection. There is exactly
 * one long-lived stream per request; its `id` is the subscription identifier,
 * carried as a JSON string in `io.modelcontextprotocol/subscriptionId` on every
 * notification delivered on the stream (the acknowledgement included). (§10.1, §10.4)
 *
 * Exactly four change-notification kinds flow on the stream, each gated by its
 * `SubscriptionFilter` field AND by the relevant server capability/sub-flag
 * (`resources.subscribe`, `*.listChanged`); request-scoped notifications
 * (`notifications/progress`, `notifications/message`) MUST NOT appear here. (§10.5, §10.6)
 *
 * Subscriptions are NOT resumable: no `Last-Event-ID`, no GET endpoint, no
 * retained state across connections; a dropped subscription is re-established
 * only by a fresh `subscriptions/listen` request, which yields a new id. (§10.7)
 *
 * Out of scope (owned elsewhere): the Streamable HTTP POST/headers/SSE framing
 * (S14/S15), the stdio channel and `notifications/cancelled` mechanics (S13/S22),
 * the concrete payload shapes of the carried list-changed/resource-updated
 * notifications (S25/S27/S28), and the `resources` capability declaration (S26/S27).
 */

import { z } from 'zod';
import { RequestParamsSchema } from '../jsonrpc/payload.js';
import { RequestIdSchema } from '../jsonrpc/framing.js';
import type { RequestId } from '../jsonrpc/framing.js';
import { MetaObjectSchema } from './meta.js';
import {
  serverDeclares,
  NOTIFICATION_REQUIRED_CAPABILITY,
} from './capability-negotiation.js';
import { PROGRESS_NOTIFICATION_METHOD, CANCELLED_NOTIFICATION_METHOD } from './progress.js';
import { LOGGING_MESSAGE_METHOD } from './logging.js';

export type { RequestId } from '../jsonrpc/framing.js';

// ─── Method names ─────────────────────────────────────────────────────────────

/** Method name for the request that opens a subscription stream. (§10.2, R-10.2-a) */
export const SUBSCRIPTIONS_LISTEN_METHOD = 'subscriptions/listen' as const;

/** Method name for the mandatory first notification on the stream. (§10.3, R-10.3-a) */
export const SUBSCRIPTIONS_ACKNOWLEDGED_METHOD =
  'notifications/subscriptions/acknowledged' as const;

/** Method name of the tools-list-changed change notification. (§10.5, R-10.5-b) */
export const TOOLS_LIST_CHANGED_METHOD = 'notifications/tools/list_changed' as const;

/** Method name of the prompts-list-changed change notification. (§10.5, R-10.5-d) */
export const PROMPTS_LIST_CHANGED_METHOD = 'notifications/prompts/list_changed' as const;

/** Method name of the resources-list-changed change notification. (§10.5, R-10.5-f) */
export const RESOURCES_LIST_CHANGED_METHOD = 'notifications/resources/list_changed' as const;

/** Method name of the resource-updated change notification. (§10.5, R-10.5-h) */
export const RESOURCES_UPDATED_METHOD = 'notifications/resources/updated' as const;

/**
 * The exactly-four change-notification kinds that flow on a `subscriptions/listen`
 * stream. (§10.5, R-10.5-a)
 */
export const CHANGE_NOTIFICATION_METHODS = [
  TOOLS_LIST_CHANGED_METHOD,
  PROMPTS_LIST_CHANGED_METHOD,
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
] as const;

export type ChangeNotificationMethod = (typeof CHANGE_NOTIFICATION_METHODS)[number];

/** Returns `true` when `method` is one of the four subscription change kinds. (R-10.5-a) */
export function isChangeNotificationMethod(method: string): method is ChangeNotificationMethod {
  return (CHANGE_NOTIFICATION_METHODS as readonly string[]).includes(method);
}

/**
 * The two request-scoped notification kinds that MUST travel on a request's own
 * response stream and MUST NOT appear on a subscription stream. (§10.6, R-10.6-b, R-10.6-e)
 *
 * Reuses the canonical method-name constants from S22 (progress) and S23 (logging)
 * rather than re-typing the literals.
 */
export const REQUEST_SCOPED_NOTIFICATION_METHODS = [
  PROGRESS_NOTIFICATION_METHOD,
  LOGGING_MESSAGE_METHOD,
] as const;

export type RequestScopedNotificationMethod =
  (typeof REQUEST_SCOPED_NOTIFICATION_METHODS)[number];

/** Returns `true` when `method` is a request-scoped (progress/logging) notification. (R-10.6-a) */
export function isRequestScopedNotificationMethod(
  method: string,
): method is RequestScopedNotificationMethod {
  return (REQUEST_SCOPED_NOTIFICATION_METHODS as readonly string[]).includes(method);
}

// ─── Reserved correlation key ──────────────────────────────────────────────────

/**
 * The reserved `_meta` key carried on EVERY notification delivered for a
 * subscription (the acknowledgement included). Case-sensitive; MUST be reproduced
 * verbatim. Its value is the `subscriptions/listen` request `id` serialized as a
 * JSON string. (§10.4, R-10.4-a, R-10.4-b, R-10.4-f)
 */
export const SUBSCRIPTION_ID_META_KEY = 'io.modelcontextprotocol/subscriptionId' as const;

/**
 * Serializes a `subscriptions/listen` request `id` into the string carried in
 * `io.modelcontextprotocol/subscriptionId` — e.g. `1` → `"1"`, `"abc"` → `"abc"`.
 * (§10.4, R-10.4-b)
 */
export function subscriptionIdFromRequestId(id: RequestId): string {
  return String(id);
}

// ─── Absolute URI validation ───────────────────────────────────────────────────

/**
 * Returns `true` when `value` is an absolute URI string [RFC3986] — it has a
 * scheme followed by `:` and at least one further character (e.g.
 * `file:///x`, `https://h/p`). A relative reference (no scheme) is rejected.
 * (§10.2, R-10.2-i)
 *
 * Uses the WHATWG `URL` parser, which only accepts absolute URLs, then confirms a
 * conformant scheme so that values like `mailto:` with an empty path are handled
 * consistently with the RFC3986 `scheme ":" hier-part` requirement.
 */
export function isAbsoluteUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  // RFC3986 scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  try {
    // The single-arg URL constructor throws on a relative reference; a scheme
    // alone is required for it to succeed.
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Zod schema for an absolute-URI string element of `resourceSubscriptions`. (R-10.2-i) */
export const AbsoluteUriSchema = z
  .string()
  .refine(isAbsoluteUri, { message: 'resourceSubscriptions entries MUST be absolute URI strings [RFC3986] (R-10.2-i)' });

// ─── SubscriptionFilter ────────────────────────────────────────────────────────

/**
 * The explicit opt-in describing exactly which change notifications the client
 * wants on this stream. Used both in the request (`notifications`) and, as the
 * honored subset, in the acknowledgement. (§10.2)
 *
 * ALL fields are OPTIONAL; omitting a field (or `false`, or an absent/empty
 * `resourceSubscriptions`) means "not subscribing" to that kind. (R-10.2-j)
 *   - `toolsListChanged`     OPTIONAL boolean → `notifications/tools/list_changed`.   (R-10.2-e)
 *   - `promptsListChanged`   OPTIONAL boolean → `notifications/prompts/list_changed`. (R-10.2-f)
 *   - `resourcesListChanged` OPTIONAL boolean → `notifications/resources/list_changed`. (R-10.2-g)
 *   - `resourceSubscriptions` OPTIONAL array of absolute URI strings → per-resource
 *     `notifications/resources/updated`; absent/empty means none. (R-10.2-h, R-10.2-i)
 */
export const SubscriptionFilterSchema = z
  .object({
    /** OPTIONAL. Opt in to tools-list-changed notifications. (R-10.2-e) */
    toolsListChanged: z.boolean().optional(),
    /** OPTIONAL. Opt in to prompts-list-changed notifications. (R-10.2-f) */
    promptsListChanged: z.boolean().optional(),
    /** OPTIONAL. Opt in to resources-list-changed notifications. (R-10.2-g) */
    resourcesListChanged: z.boolean().optional(),
    /** OPTIONAL. Absolute URIs to receive per-resource update notifications for. (R-10.2-h, R-10.2-i) */
    resourceSubscriptions: z.array(AbsoluteUriSchema).optional(),
    /** OPTIONAL. Task ids to receive `notifications/tasks` status pushes for. (§25.10, R-25.10-b) */
    taskIds: z.array(z.string()).optional(),
  })
  .passthrough();

export type SubscriptionFilter = z.infer<typeof SubscriptionFilterSchema>;

/**
 * Returns `true` when the filter requests no kinds at all — every boolean is
 * absent/`false` and `resourceSubscriptions` is absent/empty. Such a filter
 * yields an acknowledgement-only stream (a client SHOULD set at least one
 * field). (§10.2, R-10.2-k)
 */
export function isEmptySubscriptionFilter(filter: SubscriptionFilter): boolean {
  return (
    filter.toolsListChanged !== true &&
    filter.promptsListChanged !== true &&
    filter.resourcesListChanged !== true &&
    (filter.resourceSubscriptions === undefined || filter.resourceSubscriptions.length === 0)
  );
}

// ─── SubscriptionsListenRequest ────────────────────────────────────────────────

/**
 * The params of a `subscriptions/listen` request. (§10.2)
 *
 * `notifications` is REQUIRED — the requested kinds are taken SOLELY from this
 * filter; there are no implicit/default subscriptions. (R-10.2-b, R-10.1-c)
 *
 * Extends `RequestParamsSchema` (S04), so `_meta` is REQUIRED per-request metadata
 * (the §4 reserved request keys live there); the spec calls `_meta` OPTIONAL only
 * in the abstract §10.2 shape, but on the wire every client request carries it. (R-10.2-d)
 */
export const SubscriptionsListenRequestParamsSchema = RequestParamsSchema.extend({
  /** REQUIRED. The notification kinds the client opts in to on this stream. (R-10.2-b) */
  notifications: SubscriptionFilterSchema,
}).passthrough();

export type SubscriptionsListenRequestParams = z.infer<
  typeof SubscriptionsListenRequestParamsSchema
>;

/**
 * The full `subscriptions/listen` request envelope. A JSON-RPC request (it has an
 * `id`, which doubles as the subscription identifier) carrying a REQUIRED `params`
 * object. (§10.2, R-10-a, R-10.1-a, R-10.1-b, R-10.2-a)
 */
export const SubscriptionsListenRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: RequestIdSchema,
    method: z.literal(SUBSCRIPTIONS_LISTEN_METHOD),
    params: SubscriptionsListenRequestParamsSchema,
  })
  .passthrough();

export type SubscriptionsListenRequest = z.infer<typeof SubscriptionsListenRequestSchema>;

// ─── Subscription correlation `_meta` ──────────────────────────────────────────

/**
 * The `_meta` fragment present on every subscription notification: it MUST contain
 * the reserved `io.modelcontextprotocol/subscriptionId` string key. (§10.4, R-10.4-a)
 *
 * `.passthrough()` preserves any other `_meta` members. The schema requires the
 * reserved key to be a string (the request `id` serialized as a JSON string).
 */
export const SubscriptionMetaSchema = MetaObjectSchema.and(
  z.object({
    /** REQUIRED on every subscription notification: the request id as a string. (R-10.4-a, R-10.4-b) */
    [SUBSCRIPTION_ID_META_KEY]: z.string(),
  }),
);

export type SubscriptionMeta = z.infer<typeof SubscriptionMetaSchema>;

/**
 * Returns the `io.modelcontextprotocol/subscriptionId` value from a notification's
 * `params._meta`, or `undefined` when absent or not a string. The lookup is
 * case-sensitive and verbatim. (§10.4, R-10.4-a, R-10.4-f)
 */
export function readSubscriptionId(params: unknown): string | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const meta = (params as Record<string, unknown>)['_meta'];
  if (typeof meta !== 'object' || meta === null) return undefined;
  const value = (meta as Record<string, unknown>)[SUBSCRIPTION_ID_META_KEY];
  return typeof value === 'string' ? value : undefined;
}

// ─── SubscriptionsAcknowledgedNotification ─────────────────────────────────────

/**
 * The params of the mandatory first stream message,
 * `notifications/subscriptions/acknowledged`. (§10.3)
 *
 * `notifications` is REQUIRED and reflects the honored subset of the requested
 * filter — kinds the server does NOT support are OMITTED. (R-10.3-c, R-10.3-d)
 *
 * `_meta` is REQUIRED here and MUST carry the subscription id under
 * `io.modelcontextprotocol/subscriptionId`. (R-10.3-e, R-10.4-a)
 */
export const SubscriptionsAcknowledgedNotificationParamsSchema = z
  .object({
    /** REQUIRED. The honored subset of the requested filter. (R-10.3-c) */
    notifications: SubscriptionFilterSchema,
    /** REQUIRED. Carries `io.modelcontextprotocol/subscriptionId`. (R-10.3-e) */
    _meta: SubscriptionMetaSchema,
  })
  .passthrough();

export type SubscriptionsAcknowledgedNotificationParams = z.infer<
  typeof SubscriptionsAcknowledgedNotificationParamsSchema
>;

/**
 * The full `notifications/subscriptions/acknowledged` notification envelope — the
 * mandatory first message on the stream. (§10.3, R-10.1-e, R-10.3-a, R-10.3-b)
 */
export const SubscriptionsAcknowledgedNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.literal(SUBSCRIPTIONS_ACKNOWLEDGED_METHOD),
    params: SubscriptionsAcknowledgedNotificationParamsSchema,
  })
  .passthrough();

export type SubscriptionsAcknowledgedNotification = z.infer<
  typeof SubscriptionsAcknowledgedNotificationSchema
>;

// ─── ResourceUpdated change notification ───────────────────────────────────────

/**
 * The S16-owned constraints on `notifications/resources/updated` params as they
 * appear on the stream. (§10.5)
 *
 * The full payload shape is owned by S27 (§17.7); here we constrain only the two
 * properties §10.5 places on it:
 *   - `uri` REQUIRED, absolute URI string [RFC3986] (MAY be a sub-resource of a
 *     subscribed container URI). (R-10.5-i, R-10.5-j)
 *   - `_meta` carries the subscription id (correlate by id, not solely by `uri`).
 *     (R-10.5-k, R-10.4-a)
 *
 * `.passthrough()` preserves the S27-owned members.
 */
export const ResourceUpdatedNotificationParamsSchema = z
  .object({
    /** REQUIRED. Absolute URI of the changed resource; MAY be a sub-resource. (R-10.5-i, R-10.5-j) */
    uri: AbsoluteUriSchema,
    /** Carries `io.modelcontextprotocol/subscriptionId` for correlation. (R-10.5-k) */
    _meta: SubscriptionMetaSchema,
  })
  .passthrough();

export type ResourceUpdatedNotificationParams = z.infer<
  typeof ResourceUpdatedNotificationParamsSchema
>;

// ─── Acknowledgement (honored-subset) computation ──────────────────────────────

/**
 * The four `SubscriptionFilter` boolean-ish fields keyed by the change-notification
 * method they gate, with the server capability/sub-flag that must also be declared.
 * Reuses {@link NOTIFICATION_REQUIRED_CAPABILITY} from capability-negotiation (S10)
 * rather than redefining the gating map.
 */
const FILTER_FIELD_BY_METHOD = {
  [TOOLS_LIST_CHANGED_METHOD]: 'toolsListChanged',
  [PROMPTS_LIST_CHANGED_METHOD]: 'promptsListChanged',
  [RESOURCES_LIST_CHANGED_METHOD]: 'resourcesListChanged',
} as const;

/**
 * Options refining the honored-subset computation beyond the core §10 server
 * capabilities — currently just the Tasks extension's per-request activation.
 */
export interface AcknowledgedFilterOptions {
  /**
   * Whether the Tasks extension (`io.modelcontextprotocol/tasks`) is active for
   * THIS `subscriptions/listen` request — i.e. the client declared it in this
   * request's `clientCapabilities.extensions` AND the server advertises it under
   * `capabilities.extensions`. A `taskIds` opt-in is honored ONLY when this is
   * `true`; otherwise it is dropped (and the transport rejects the request with
   * `-32003` before this is reached). Defaults to `false`. (§25.2, §25.10,
   * R-25.10-e, R-25.10-f)
   */
  tasksActive?: boolean;
}

/**
 * Computes the honored-subset `SubscriptionFilter` for the acknowledgement: a kind
 * is honored only when the client requested it AND the gating server
 * capability/sub-flag is declared. Unsupported kinds are OMITTED entirely. (§10.3,
 * R-10.3-c, R-10.3-d; gating per R-10.5-l)
 *
 * For `resourceSubscriptions`, the honored list is the requested URIs (subset the
 * server agrees to watch) when `resources.subscribe` is declared, else omitted.
 *
 * For `taskIds`, the honored list is the requested ids when the Tasks extension is
 * active for the request (`options.tasksActive`), else omitted. (§25.10)
 *
 * @param requested  - The client's requested filter.
 * @param serverCaps - The server's declared `ServerCapabilities`.
 * @param options    - Extension-activation refinements (e.g. `tasksActive`).
 */
export function computeAcknowledgedFilter(
  requested: SubscriptionFilter,
  serverCaps: Record<string, unknown>,
  options: AcknowledgedFilterOptions = {},
): SubscriptionFilter {
  const honored: SubscriptionFilter = {};

  for (const [method, field] of Object.entries(FILTER_FIELD_BY_METHOD) as [
    keyof typeof FILTER_FIELD_BY_METHOD,
    'toolsListChanged' | 'promptsListChanged' | 'resourcesListChanged',
  ][]) {
    if (requested[field] !== true) continue;
    const required = NOTIFICATION_REQUIRED_CAPABILITY[method];
    if (required === undefined || serverDeclares(serverCaps, required)) {
      honored[field] = true;
    }
  }

  const uris = requested.resourceSubscriptions;
  if (uris !== undefined && uris.length > 0) {
    const required = NOTIFICATION_REQUIRED_CAPABILITY[RESOURCES_UPDATED_METHOD];
    if (required === undefined || serverDeclares(serverCaps, required)) {
      honored.resourceSubscriptions = [...uris];
    }
  }

  // taskIds → honored only when the Tasks extension is active for this request,
  // i.e. the client declared `extensions['io.modelcontextprotocol/tasks']` (§25.2)
  // AND the server advertises it — NOT a bare top-level `tasks` capability. (§25.10)
  const taskIds = requested.taskIds;
  if (taskIds !== undefined && taskIds.length > 0 && options.tasksActive === true) {
    honored.taskIds = [...taskIds];
  }

  return honored;
}

/**
 * Returns the kinds the client requested but the server did NOT honor (declined),
 * so a client can handle them gracefully and not block waiting on a declined kind.
 * (§10.3, R-10.3-f)
 *
 * Reports the boolean fields whose request was dropped and the requested-but-not-
 * acknowledged `resourceSubscriptions` URIs.
 */
export function declinedFilterKinds(
  requested: SubscriptionFilter,
  acknowledged: SubscriptionFilter,
): { fields: Array<'toolsListChanged' | 'promptsListChanged' | 'resourcesListChanged'>; uris: string[] } {
  const fields: Array<'toolsListChanged' | 'promptsListChanged' | 'resourcesListChanged'> = [];
  for (const field of ['toolsListChanged', 'promptsListChanged', 'resourcesListChanged'] as const) {
    if (requested[field] === true && acknowledged[field] !== true) fields.push(field);
  }
  const ackUris = new Set(acknowledged.resourceSubscriptions ?? []);
  const uris = (requested.resourceSubscriptions ?? []).filter((u) => !ackUris.has(u));
  return { fields, uris };
}

// ─── Resource-update URI matching ──────────────────────────────────────────────

/**
 * Returns `true` when `updatedUri` is covered by `subscribedUri` — either an exact
 * match or a sub-resource of a subscribed container URI (the updated URI MAY be a
 * descendant). (§10.5, R-10.5-j)
 *
 * Container matching is path-prefix based after a normalized origin+path compare:
 * `file:///dir` covers `file:///dir/file.txt`. A bare prefix that is not a path
 * boundary (e.g. `file:///dir` vs `file:///directory`) does NOT match.
 */
export function uriCoveredBySubscription(updatedUri: string, subscribedUri: string): boolean {
  if (updatedUri === subscribedUri) return true;
  if (!isAbsoluteUri(updatedUri) || !isAbsoluteUri(subscribedUri)) return false;
  let sub: URL;
  let upd: URL;
  try {
    sub = new URL(subscribedUri);
    upd = new URL(updatedUri);
  } catch {
    return false;
  }
  if (sub.protocol !== upd.protocol || sub.host !== upd.host) return false;
  const base = sub.pathname.endsWith('/') ? sub.pathname : `${sub.pathname}/`;
  return upd.pathname.startsWith(base);
}

/**
 * Returns `true` when a `notifications/resources/updated` for `updatedUri` is
 * permitted on a subscription whose acknowledged `resourceSubscriptions` are
 * `subscribedUris` — i.e. the URI (or a parent) was listed. A server MUST NOT send
 * an update for an unlisted resource. (§10.2, R-10.2-l, R-10.2-m, §10.5 R-10.5-h)
 */
export function mayDeliverResourceUpdate(
  updatedUri: string,
  subscribedUris: ReadonlyArray<string>,
): boolean {
  return subscribedUris.some((sub) => uriCoveredBySubscription(updatedUri, sub));
}

// ─── Stream-emission gating ────────────────────────────────────────────────────

/**
 * Returns `true` when the server MAY emit the change notification `method` on a
 * subscription stream whose acknowledged filter is `acknowledged`. A kind is
 * emittable ONLY when its filter field is reflected in the acknowledged filter —
 * which already encodes "requested AND capability-declared". (§10.5, R-10.1-d,
 * R-10.2-c, R-10.5-l)
 *
 * For `notifications/resources/updated`, pass `updatedUri` so the per-resource
 * filter is also checked (R-10.2-l, R-10.2-m).
 */
export function mayEmitChangeNotification(
  method: string,
  acknowledged: SubscriptionFilter,
  updatedUri?: string,
): boolean {
  switch (method) {
    case TOOLS_LIST_CHANGED_METHOD:
      return acknowledged.toolsListChanged === true;
    case PROMPTS_LIST_CHANGED_METHOD:
      return acknowledged.promptsListChanged === true;
    case RESOURCES_LIST_CHANGED_METHOD:
      return acknowledged.resourcesListChanged === true;
    case RESOURCES_UPDATED_METHOD: {
      const uris = acknowledged.resourceSubscriptions ?? [];
      if (uris.length === 0) return false;
      if (updatedUri === undefined) return false;
      return mayDeliverResourceUpdate(updatedUri, uris);
    }
    case 'notifications/tasks': {
      // §25.10: emit only for a task the client opted into via `taskIds`. The subject
      // key carries the task's id (passed in the `updatedUri` slot by the transport).
      const ids = acknowledged.taskIds ?? [];
      return updatedUri !== undefined && ids.includes(updatedUri);
    }
    default:
      // Not an emittable subscription kind.
      return false;
  }
}

// ─── Stream-boundary classification ────────────────────────────────────────────

/** Which stream a notification kind belongs on. (§10.6) */
export type NotificationStreamPlacement =
  | 'subscription'
  | 'request-scoped'
  | 'neither';

/**
 * Classifies a notification `method` against the §10.6 boundary:
 *   - one of the four change kinds → `'subscription'`. (R-10.6-c)
 *   - `notifications/progress` / `notifications/message` → `'request-scoped'`. (R-10.6-a)
 *   - anything else → `'neither'`.
 */
export function classifyNotificationStream(method: string): NotificationStreamPlacement {
  if (isChangeNotificationMethod(method)) return 'subscription';
  if (isRequestScopedNotificationMethod(method)) return 'request-scoped';
  return 'neither';
}

/**
 * Returns `true` when receiving notification `method` on a subscription stream is
 * a protocol violation — i.e. it is a request-scoped (progress/logging) kind, which
 * MUST NOT appear there. A client SHOULD treat such a message as a violation.
 * (§10.6, R-10.6-b, R-10.6-e, R-10.6-g)
 */
export function isViolationOnSubscriptionStream(method: string): boolean {
  return isRequestScopedNotificationMethod(method);
}

/**
 * Returns `true` when receiving notification `method` on an unrelated request's
 * response stream is a protocol violation — i.e. it is one of the four change
 * kinds, which MUST NOT appear on a non-`subscriptions/listen` response stream.
 * (§10.6, R-10.6-d, R-10.6-f, R-10.6-g)
 */
export function isViolationOnRequestStream(method: string): boolean {
  return isChangeNotificationMethod(method);
}

// ─── Subscription lifecycle ────────────────────────────────────────────────────

/** The lifecycle states of a subscription. (§10.7) */
export type SubscriptionState = 'opening' | 'active' | 'closed';

/** How a subscription stream ended. (§10.7) */
export type SubscriptionCloseReason =
  | 'client-cancel'
  | 'server-teardown'
  | 'transport-close';

/**
 * Tracks the request-scoped lifecycle of a single subscription. The state is scoped
 * to the `subscriptions/listen` request, NOT to the connection: once `close()` is
 * reached the subscription is gone and retains NO resumable state. (§10.7)
 *
 * Lifecycle: `opening` → (ack sent) → `active` → (cancel/teardown/transport-close)
 * → `closed`. There is no resumption; re-establishment is a NEW `subscriptions/listen`
 * request yielding a NEW id. (R-10.7-d, R-10.7-f)
 *
 * @example
 * ```ts
 * const sub = new Subscription(1, requested, serverCaps);
 * const ackParams = sub.acknowledge();            // → 'active', honored subset + subId
 * sub.close('client-cancel');                     // → 'closed'
 * ```
 */
export class Subscription {
  /** The subscription identifier: the request `id` serialized as a JSON string. */
  readonly subscriptionId: string;
  /** The honored-subset filter the server agreed to (computed at construction). */
  readonly acknowledgedFilter: SubscriptionFilter;
  private _state: SubscriptionState = 'opening';
  private _closeReason: SubscriptionCloseReason | undefined;

  /**
   * @param requestId   - The `subscriptions/listen` request `id`.
   * @param requested   - The client's requested `SubscriptionFilter`.
   * @param serverCaps  - The server's declared capabilities (gates the honored subset).
   * @param options     - Extension-activation refinements (e.g. `tasksActive`, §25.10).
   */
  constructor(
    readonly requestId: RequestId,
    readonly requested: SubscriptionFilter,
    serverCaps: Record<string, unknown> = {},
    options: AcknowledgedFilterOptions = {},
  ) {
    this.subscriptionId = subscriptionIdFromRequestId(requestId);
    this.acknowledgedFilter = computeAcknowledgedFilter(requested, serverCaps, options);
  }

  /** Current lifecycle state. */
  get state(): SubscriptionState {
    return this._state;
  }

  /** How the subscription closed, or `undefined` while still open. */
  get closeReason(): SubscriptionCloseReason | undefined {
    return this._closeReason;
  }

  /**
   * Builds the mandatory first message — the `notifications/subscriptions/acknowledged`
   * params — and transitions `opening` → `active`. The acknowledgement carries the
   * honored subset and the subscription id in `_meta`. (R-10.1-e, R-10.3-a, R-10.3-e)
   *
   * @throws {Error} when called after the subscription has already acknowledged or closed.
   */
  acknowledge(): SubscriptionsAcknowledgedNotificationParams {
    if (this._state !== 'opening') {
      throw new Error(
        `Subscription ${JSON.stringify(this.requestId)} already acknowledged or closed; the acknowledgement is the single first message (R-10.3-a)`,
      );
    }
    this._state = 'active';
    return {
      notifications: this.acknowledgedFilter,
      _meta: { [SUBSCRIPTION_ID_META_KEY]: this.subscriptionId },
    };
  }

  /**
   * Returns the `params._meta` fragment to attach to a change notification on this
   * stream — carrying the subscription id. (R-10.4-a, R-10.5-a)
   */
  metaFragment(): SubscriptionMeta {
    return { [SUBSCRIPTION_ID_META_KEY]: this.subscriptionId };
  }

  /**
   * Returns `true` when the server MAY emit change notification `method` on this
   * subscription's stream (state `active` and the acknowledged filter permits it).
   * For `notifications/resources/updated`, pass `updatedUri`. (R-10.5-l)
   */
  mayEmit(method: string, updatedUri?: string): boolean {
    if (this._state !== 'active') return false;
    return mayEmitChangeNotification(method, this.acknowledgedFilter, updatedUri);
  }

  /**
   * Transitions to `closed` for the given reason. Idempotent: a second close is a
   * no-op (the first reason wins). After close the subscription retains no state and
   * is NOT resumable — recovery requires a new `subscriptions/listen`. (R-10.7-a,
   * R-10.7-b, R-10.7-c, R-10.7-d, R-10.7-f)
   */
  close(reason: SubscriptionCloseReason): void {
    if (this._state === 'closed') return;
    this._state = 'closed';
    this._closeReason = reason;
  }

  /**
   * Builds the server-teardown signal for this subscription: a
   * `notifications/cancelled` referencing the `subscriptions/listen` request `id`.
   *
   * §10.7 (R-10.7-b) requires a server tearing down a subscription (e.g. during
   * shutdown) to signal it to the client — on **stdio** by sending this
   * notification, on **Streamable HTTP** by closing the `text/event-stream`
   * response. This `Subscription` is transport-agnostic: the stdio transport
   * sends the value returned here after `close('server-teardown')`, while the HTTP
   * transport simply ends the SSE response. The `params.requestId` always equals
   * this subscription's listen `id` so the client can correlate the teardown.
   *
   * @param reason - OPTIONAL human-readable explanation.
   */
  teardownNotification(reason = 'subscription torn down by server'): {
    jsonrpc: '2.0';
    method: typeof CANCELLED_NOTIFICATION_METHOD;
    params: { requestId: RequestId; reason: string };
  } {
    return {
      jsonrpc: '2.0',
      method: CANCELLED_NOTIFICATION_METHOD,
      params: { requestId: this.requestId, reason },
    };
  }

  /** Returns `true` once the subscription has closed. */
  get isClosed(): boolean {
    return this._state === 'closed';
  }
}

/**
 * Routes incoming subscription notifications to the correct active `Subscription`
 * by `io.modelcontextprotocol/subscriptionId` — essential on stdio where all
 * subscriptions share one channel, and supported on HTTP where the key is still
 * present. Holds NO state across connections; closing a subscription removes it.
 * (§10.4, R-10.4-c, R-10.4-d, R-10.7-d)
 *
 * A client MAY hold multiple independent subscriptions concurrently, each keyed by
 * its own request `id`. (R-10.1-i)
 *
 * @example
 * ```ts
 * const registry = new SubscriptionRegistry();
 * registry.add(new Subscription(1, f1));
 * registry.add(new Subscription('two', f2));
 * const target = registry.route(incoming.params); // by subscriptionId
 * ```
 */
export class SubscriptionRegistry {
  private readonly byId = new Map<string, Subscription>();

  /**
   * Registers `subscription`, keyed by its subscription id.
   * @throws {Error} when a subscription with the same id is already active (ids are
   *   request ids and MUST be unique while in-flight).
   */
  add(subscription: Subscription): void {
    if (this.byId.has(subscription.subscriptionId)) {
      throw new Error(
        `Subscription id ${JSON.stringify(subscription.subscriptionId)} is already active; each subscription is identified by its own request id (R-10.1-i)`,
      );
    }
    this.byId.set(subscription.subscriptionId, subscription);
  }

  /** Returns the active subscription with `subscriptionId`, or `undefined`. */
  get(subscriptionId: string): Subscription | undefined {
    return this.byId.get(subscriptionId);
  }

  /**
   * Routes a notification's `params` to its owning subscription using the
   * `io.modelcontextprotocol/subscriptionId` key. Returns `undefined` when the key
   * is absent or no matching subscription is active. (R-10.4-c)
   */
  route(params: unknown): Subscription | undefined {
    const id = readSubscriptionId(params);
    return id === undefined ? undefined : this.byId.get(id);
  }

  /**
   * Closes and removes the subscription with `subscriptionId` (no retained state).
   * Returns `true` when one was removed. (R-10.7-d)
   */
  remove(subscriptionId: string, reason: SubscriptionCloseReason): boolean {
    const sub = this.byId.get(subscriptionId);
    if (!sub) return false;
    sub.close(reason);
    this.byId.delete(subscriptionId);
    return true;
  }

  /** Number of currently active subscriptions. */
  get size(): number {
    return this.byId.size;
  }

  /** Snapshot of all active subscription ids. */
  get activeIds(): ReadonlyArray<string> {
    return Array.from(this.byId.keys());
  }
}
