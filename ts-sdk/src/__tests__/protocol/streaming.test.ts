/**
 * S16 — Server-to-Client Streaming & Subscriptions (§10) tests.
 *
 * Each `describe` block maps to one AC (AC-16.1 … AC-16.23) from the story.
 */

import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTIONS_LISTEN_METHOD,
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  TOOLS_LIST_CHANGED_METHOD,
  PROMPTS_LIST_CHANGED_METHOD,
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
  CHANGE_NOTIFICATION_METHODS,
  isChangeNotificationMethod,
  REQUEST_SCOPED_NOTIFICATION_METHODS,
  isRequestScopedNotificationMethod,
  SUBSCRIPTION_ID_META_KEY,
  subscriptionIdFromRequestId,
  isAbsoluteUri,
  AbsoluteUriSchema,
  SubscriptionFilterSchema,
  isEmptySubscriptionFilter,
  SubscriptionsListenRequestParamsSchema,
  SubscriptionsListenRequestSchema,
  SubscriptionMetaSchema,
  readSubscriptionId,
  SubscriptionsAcknowledgedNotificationParamsSchema,
  SubscriptionsAcknowledgedNotificationSchema,
  ResourceUpdatedNotificationParamsSchema,
  computeAcknowledgedFilter,
  declinedFilterKinds,
  uriCoveredBySubscription,
  mayDeliverResourceUpdate,
  mayEmitChangeNotification,
  classifyNotificationStream,
  isViolationOnSubscriptionStream,
  isViolationOnRequestStream,
  Subscription,
  SubscriptionRegistry,
} from '../../protocol/streaming.js';

// A valid per-request `_meta` (the three required reserved keys), reused below.
const REQUEST_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'ExampleClient', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

const CONFIG_URI = 'file:///project/config.json';

/** Server caps declaring all relevant sub-flags. */
const FULL_CAPS = {
  tools: { listChanged: true },
  prompts: { listChanged: true },
  resources: { subscribe: true, listChanged: true },
};

// ─── AC-16.1 ───────────────────────────────────────────────────────────────────

describe('AC-16.1 — subscriptions/listen is a JSON-RPC request with id + required params', () => {
  it('accepts a well-formed request whose id doubles as the subscription identifier', () => {
    const req = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: SUBSCRIPTIONS_LISTEN_METHOD,
      params: { _meta: REQUEST_META, notifications: { toolsListChanged: true } },
    };
    const parsed = SubscriptionsListenRequestSchema.parse(req);
    expect(parsed.id).toBe(1);
    expect(parsed.method).toBe('subscriptions/listen');
  });

  it('rejects a request missing the params object (R-10.2-a)', () => {
    const req = { jsonrpc: '2.0', id: 1, method: SUBSCRIPTIONS_LISTEN_METHOD };
    expect(SubscriptionsListenRequestSchema.safeParse(req).success).toBe(false);
  });

  it('rejects a notification shape (no id) for the listen method (R-10.1-a, R-10.1-b)', () => {
    const notif = {
      jsonrpc: '2.0',
      method: SUBSCRIPTIONS_LISTEN_METHOD,
      params: { _meta: REQUEST_META, notifications: {} },
    };
    expect(SubscriptionsListenRequestSchema.safeParse(notif).success).toBe(false);
  });
});

// ─── AC-16.2 ───────────────────────────────────────────────────────────────────

describe('AC-16.2 — notifications required; kinds taken solely from the filter; _meta optional-metadata', () => {
  it('requires the notifications field (R-10.2-b)', () => {
    const params = { _meta: REQUEST_META };
    expect(SubscriptionsListenRequestParamsSchema.safeParse(params).success).toBe(false);
  });

  it('accepts params carrying notifications + _meta (R-10.2-b, R-10.2-d)', () => {
    const params = { _meta: REQUEST_META, notifications: { toolsListChanged: true } };
    const parsed = SubscriptionsListenRequestParamsSchema.parse(params);
    expect(parsed.notifications.toolsListChanged).toBe(true);
  });

  it('has no implicit/default subscriptions — an empty filter requests nothing (R-10.1-c)', () => {
    const params = SubscriptionsListenRequestParamsSchema.parse({
      _meta: REQUEST_META,
      notifications: {},
    });
    expect(isEmptySubscriptionFilter(params.notifications)).toBe(true);
  });
});

// ─── AC-16.3 ───────────────────────────────────────────────────────────────────

describe('AC-16.3 — all SubscriptionFilter fields optional; omitting/false/empty = not subscribed', () => {
  it('accepts an entirely empty filter (R-10.2-j)', () => {
    expect(SubscriptionFilterSchema.parse({})).toEqual({});
  });

  it('accepts the three optional booleans and the optional array (R-10.2-e/f/g/h)', () => {
    const f = SubscriptionFilterSchema.parse({
      toolsListChanged: true,
      promptsListChanged: false,
      resourcesListChanged: true,
      resourceSubscriptions: [CONFIG_URI],
    });
    expect(f.toolsListChanged).toBe(true);
    expect(f.promptsListChanged).toBe(false);
    expect(f.resourceSubscriptions).toEqual([CONFIG_URI]);
  });

  it('treats false / absent / empty-array as not-subscribed (R-10.2-j, R-10.2-k)', () => {
    expect(isEmptySubscriptionFilter({})).toBe(true);
    expect(isEmptySubscriptionFilter({ toolsListChanged: false })).toBe(true);
    expect(isEmptySubscriptionFilter({ resourceSubscriptions: [] })).toBe(true);
    expect(isEmptySubscriptionFilter({ toolsListChanged: true })).toBe(false);
    expect(isEmptySubscriptionFilter({ resourceSubscriptions: [CONFIG_URI] })).toBe(false);
  });

  it('a no-kinds filter still yields a valid (acknowledgement-only) stream (R-10.2-k)', () => {
    const sub = new Subscription(7, {}, FULL_CAPS);
    const ack = sub.acknowledge();
    expect(ack._meta[SUBSCRIPTION_ID_META_KEY]).toBe('7');
    expect(isEmptySubscriptionFilter(ack.notifications)).toBe(true);
    expect(sub.state).toBe('active');
  });
});

// ─── AC-16.4 ───────────────────────────────────────────────────────────────────

describe('AC-16.4 — resourceSubscriptions elements must be absolute URIs [RFC3986]', () => {
  it('accepts absolute URIs (R-10.2-i)', () => {
    expect(isAbsoluteUri(CONFIG_URI)).toBe(true);
    expect(isAbsoluteUri('https://host/path')).toBe(true);
    expect(AbsoluteUriSchema.safeParse('https://h/p').success).toBe(true);
  });

  it('rejects non-absolute / non-URI elements (R-10.2-i)', () => {
    expect(isAbsoluteUri('/project/config.json')).toBe(false);
    expect(isAbsoluteUri('config.json')).toBe(false);
    expect(isAbsoluteUri('')).toBe(false);
    expect(isAbsoluteUri(42)).toBe(false);
    expect(AbsoluteUriSchema.safeParse('relative/path').success).toBe(false);
  });

  it('rejects a filter whose resourceSubscriptions contains a relative entry (R-10.2-i)', () => {
    const result = SubscriptionFilterSchema.safeParse({
      resourceSubscriptions: [CONFIG_URI, 'not-a-uri'],
    });
    expect(result.success).toBe(false);
  });
});

// ─── AC-16.5 ───────────────────────────────────────────────────────────────────

describe('AC-16.5 — never sends an unrequested kind; resources/updated only for listed URIs', () => {
  it('does not emit a kind the client did not request (R-10.1-d, R-10.2-c)', () => {
    const ack = computeAcknowledgedFilter({ toolsListChanged: true }, FULL_CAPS);
    expect(mayEmitChangeNotification(PROMPTS_LIST_CHANGED_METHOD, ack)).toBe(false);
    expect(mayEmitChangeNotification(TOOLS_LIST_CHANGED_METHOD, ack)).toBe(true);
  });

  it('emits resources/updated only for a listed URI (R-10.2-l)', () => {
    const ack = computeAcknowledgedFilter({ resourceSubscriptions: [CONFIG_URI] }, FULL_CAPS);
    expect(mayEmitChangeNotification(RESOURCES_UPDATED_METHOD, ack, CONFIG_URI)).toBe(true);
  });

  it('never emits resources/updated for an unlisted URI (R-10.2-m)', () => {
    const ack = computeAcknowledgedFilter({ resourceSubscriptions: [CONFIG_URI] }, FULL_CAPS);
    expect(
      mayEmitChangeNotification(RESOURCES_UPDATED_METHOD, ack, 'file:///other/file.txt'),
    ).toBe(false);
    expect(mayDeliverResourceUpdate('file:///other.txt', [CONFIG_URI])).toBe(false);
  });
});

// ─── AC-16.6 ───────────────────────────────────────────────────────────────────

describe('AC-16.6 — first server message is the acknowledgement, before any change notification', () => {
  it('the acknowledgement notification uses the literal method name (R-10.3-a)', () => {
    const ack = {
      jsonrpc: '2.0',
      method: SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
      params: {
        notifications: { toolsListChanged: true },
        _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' },
      },
    };
    expect(SUBSCRIPTIONS_ACKNOWLEDGED_METHOD).toBe('notifications/subscriptions/acknowledged');
    expect(SubscriptionsAcknowledgedNotificationSchema.safeParse(ack).success).toBe(true);
  });

  it('acknowledge() transitions opening→active and is the single first message (R-10.1-e, R-10.3-b)', () => {
    const sub = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    expect(sub.state).toBe('opening');
    // mayEmit is false before acknowledging — nothing precedes the ack.
    expect(sub.mayEmit(TOOLS_LIST_CHANGED_METHOD)).toBe(false);
    sub.acknowledge();
    expect(sub.state).toBe('active');
    expect(sub.mayEmit(TOOLS_LIST_CHANGED_METHOD)).toBe(true);
  });

  it('throws if acknowledged twice — the ack is the single first message (R-10.3-a)', () => {
    const sub = new Subscription(1, {}, FULL_CAPS);
    sub.acknowledge();
    expect(() => sub.acknowledge()).toThrow();
  });
});

// ─── AC-16.7 ───────────────────────────────────────────────────────────────────

describe('AC-16.7 — acknowledged notifications reflects the honored subset; unsupported kinds omitted', () => {
  it('omits a kind the server does not support (no prompts) (R-10.3-c, R-10.3-d)', () => {
    const requested = { toolsListChanged: true, promptsListChanged: true };
    const caps = { tools: { listChanged: true } }; // no prompts capability
    const honored = computeAcknowledgedFilter(requested, caps);
    expect(honored.toolsListChanged).toBe(true);
    expect(honored.promptsListChanged).toBeUndefined();
  });

  it('reflects honored resourceSubscriptions only when resources.subscribe declared (R-10.3-c)', () => {
    const requested = { resourceSubscriptions: [CONFIG_URI] };
    expect(computeAcknowledgedFilter(requested, {}).resourceSubscriptions).toBeUndefined();
    expect(
      computeAcknowledgedFilter(requested, { resources: { subscribe: true } }).resourceSubscriptions,
    ).toEqual([CONFIG_URI]);
  });

  it('parses an acknowledgement params with the honored filter (R-10.3-c)', () => {
    const params = {
      notifications: { toolsListChanged: true },
      _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' },
    };
    expect(SubscriptionsAcknowledgedNotificationParamsSchema.safeParse(params).success).toBe(true);
  });

  it('honors taskIds only when the Tasks extension is active for the request (§25.10, Gap B)', () => {
    const requested = { taskIds: ['t1', 't2'] };
    // Without an active Tasks extension, taskIds are dropped — regardless of caps shape.
    expect(computeAcknowledgedFilter(requested, FULL_CAPS).taskIds).toBeUndefined();
    // A bare top-level `tasks` capability MUST NOT enable taskIds (the old mis-keyed gate).
    expect(computeAcknowledgedFilter(requested, { tasks: {} }).taskIds).toBeUndefined();
    // Honored only when the caller signals the extension is active for the request.
    expect(computeAcknowledgedFilter(requested, FULL_CAPS, { tasksActive: true }).taskIds).toEqual(['t1', 't2']);
    // The Subscription threads the same flag through to its acknowledged filter.
    expect(new Subscription(1, requested, {}, { tasksActive: true }).acknowledgedFilter.taskIds).toEqual(['t1', 't2']);
    expect(new Subscription(1, requested, { tasks: {} }).acknowledgedFilter.taskIds).toBeUndefined();
  });
});

// ─── AC-16.8 ───────────────────────────────────────────────────────────────────

describe('AC-16.8 — client handles declined (omitted) kinds gracefully', () => {
  it('reports declined boolean fields and declined URIs (R-10.3-f)', () => {
    const requested = {
      toolsListChanged: true,
      promptsListChanged: true,
      resourceSubscriptions: [CONFIG_URI, 'file:///x.txt'],
    };
    const acknowledged = { toolsListChanged: true, resourceSubscriptions: [CONFIG_URI] };
    const declined = declinedFilterKinds(requested, acknowledged);
    expect(declined.fields).toContain('promptsListChanged');
    expect(declined.fields).not.toContain('toolsListChanged');
    expect(declined.uris).toEqual(['file:///x.txt']);
  });

  it('reports nothing declined when everything was honored (R-10.3-f)', () => {
    const f = { toolsListChanged: true };
    expect(declinedFilterKinds(f, f)).toEqual({ fields: [], uris: [] });
  });
});

// ─── AC-16.9 ───────────────────────────────────────────────────────────────────

describe('AC-16.9 — every subscription notification carries io.modelcontextprotocol/subscriptionId as a string', () => {
  it('serializes a numeric id to its string form, e.g. 1 → "1" (R-10.4-b)', () => {
    expect(subscriptionIdFromRequestId(1)).toBe('1');
    expect(subscriptionIdFromRequestId('abc')).toBe('abc');
    expect(SUBSCRIPTION_ID_META_KEY).toBe('io.modelcontextprotocol/subscriptionId');
  });

  it('the acknowledgement _meta carries the id verbatim (R-10.1-f, R-10.3-e, R-10.4-a)', () => {
    const sub = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    const ack = sub.acknowledge();
    expect(ack._meta[SUBSCRIPTION_ID_META_KEY]).toBe('1');
  });

  it('SubscriptionMetaSchema requires the reserved key be a string (R-10.4-a)', () => {
    expect(SubscriptionMetaSchema.safeParse({ [SUBSCRIPTION_ID_META_KEY]: '1' }).success).toBe(true);
    expect(SubscriptionMetaSchema.safeParse({ [SUBSCRIPTION_ID_META_KEY]: 1 }).success).toBe(false);
    expect(SubscriptionMetaSchema.safeParse({}).success).toBe(false);
  });

  it('the key is case-sensitive — a differently-cased key is not recognized (R-10.4-f)', () => {
    const wrongCase = { _meta: { 'io.modelcontextprotocol/subscriptionid': '1' } };
    expect(readSubscriptionId(wrongCase)).toBeUndefined();
    const right = { _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' } };
    expect(readSubscriptionId(right)).toBe('1');
  });
});

// ─── AC-16.10 ──────────────────────────────────────────────────────────────────

describe('AC-16.10 — stdio multiplexing routes by subscriptionId', () => {
  it('routes each notification to its subscription by id (R-10.4-c)', () => {
    const registry = new SubscriptionRegistry();
    const a = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    const b = new Subscription('two', { resourcesListChanged: true }, FULL_CAPS);
    registry.add(a);
    registry.add(b);

    const toA = { _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' } };
    const toB = { _meta: { [SUBSCRIPTION_ID_META_KEY]: 'two' } };
    expect(registry.route(toA)).toBe(a);
    expect(registry.route(toB)).toBe(b);
  });

  it('returns undefined when the id is absent or unknown (R-10.4-c)', () => {
    const registry = new SubscriptionRegistry();
    registry.add(new Subscription(1, {}, FULL_CAPS));
    expect(registry.route({ _meta: {} })).toBeUndefined();
    expect(registry.route({ _meta: { [SUBSCRIPTION_ID_META_KEY]: '99' } })).toBeUndefined();
  });
});

// ─── AC-16.11 ──────────────────────────────────────────────────────────────────

describe('AC-16.11 — over HTTP the subscriptionId is still present (per-stream separation is optional)', () => {
  it('the key is present on a notification even with per-stream separation (R-10.4-d, R-10.4-e)', () => {
    const sub = new Subscription(5, { toolsListChanged: true }, FULL_CAPS);
    sub.acknowledge();
    const meta = sub.metaFragment();
    expect(meta[SUBSCRIPTION_ID_META_KEY]).toBe('5');
    // A client MAY still correlate by id even when it has a dedicated stream.
    expect(readSubscriptionId({ _meta: meta })).toBe('5');
  });
});

// ─── AC-16.12 ──────────────────────────────────────────────────────────────────

describe('AC-16.12 — exactly the four change kinds flow, each gated by its filter field', () => {
  it('the four kinds are exactly these method names (R-10.5-a)', () => {
    expect(CHANGE_NOTIFICATION_METHODS).toEqual([
      'notifications/tools/list_changed',
      'notifications/prompts/list_changed',
      'notifications/resources/list_changed',
      'notifications/resources/updated',
    ]);
    expect(CHANGE_NOTIFICATION_METHODS).toHaveLength(4);
    for (const m of CHANGE_NOTIFICATION_METHODS) expect(isChangeNotificationMethod(m)).toBe(true);
    expect(isChangeNotificationMethod('notifications/progress')).toBe(false);
  });

  it('tools iff toolsListChanged true (R-10.5-b)', () => {
    expect(mayEmitChangeNotification(TOOLS_LIST_CHANGED_METHOD, { toolsListChanged: true })).toBe(true);
    expect(mayEmitChangeNotification(TOOLS_LIST_CHANGED_METHOD, {})).toBe(false);
  });

  it('prompts iff promptsListChanged true (R-10.5-d)', () => {
    expect(mayEmitChangeNotification(PROMPTS_LIST_CHANGED_METHOD, { promptsListChanged: true })).toBe(true);
    expect(mayEmitChangeNotification(PROMPTS_LIST_CHANGED_METHOD, {})).toBe(false);
  });

  it('resources-list iff resourcesListChanged true (R-10.5-f)', () => {
    expect(mayEmitChangeNotification(RESOURCES_LIST_CHANGED_METHOD, { resourcesListChanged: true })).toBe(true);
    expect(mayEmitChangeNotification(RESOURCES_LIST_CHANGED_METHOD, {})).toBe(false);
  });

  it('resources-updated iff the URI (or a parent) was listed (R-10.5-h)', () => {
    const ack = { resourceSubscriptions: [CONFIG_URI] };
    expect(mayEmitChangeNotification(RESOURCES_UPDATED_METHOD, ack, CONFIG_URI)).toBe(true);
    expect(mayEmitChangeNotification(RESOURCES_UPDATED_METHOD, ack, 'file:///nope')).toBe(false);
  });

  it('each change kind is a JSON-RPC notification (no id) carrying _meta with the subId', () => {
    const sub = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    sub.acknowledge();
    const notif = {
      jsonrpc: '2.0',
      method: TOOLS_LIST_CHANGED_METHOD,
      params: { _meta: sub.metaFragment() },
    };
    expect('id' in notif).toBe(false);
    expect(readSubscriptionId(notif.params)).toBe('1');
  });
});

// ─── AC-16.13 ──────────────────────────────────────────────────────────────────

describe('AC-16.13 — list-changed kinds map to the list a client SHOULD re-fetch', () => {
  it('each list-changed method names its list (R-10.5-c, R-10.5-e, R-10.5-g)', () => {
    expect(TOOLS_LIST_CHANGED_METHOD).toBe('notifications/tools/list_changed');
    expect(PROMPTS_LIST_CHANGED_METHOD).toBe('notifications/prompts/list_changed');
    expect(RESOURCES_LIST_CHANGED_METHOD).toBe('notifications/resources/list_changed');
    // These three are the list-changed kinds (resources/updated is the fourth, non-list kind).
    const listChanged = CHANGE_NOTIFICATION_METHODS.filter((m) => m.endsWith('list_changed'));
    expect(listChanged).toEqual([
      TOOLS_LIST_CHANGED_METHOD,
      PROMPTS_LIST_CHANGED_METHOD,
      RESOURCES_LIST_CHANGED_METHOD,
    ]);
  });
});

// ─── AC-16.14 ──────────────────────────────────────────────────────────────────

describe('AC-16.14 — resources/updated: uri required & absolute; MAY be sub-resource; correlate by subId', () => {
  it('requires an absolute uri (R-10.5-i)', () => {
    const ok = {
      uri: CONFIG_URI,
      _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' },
    };
    expect(ResourceUpdatedNotificationParamsSchema.safeParse(ok).success).toBe(true);
    const noUri = { _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' } };
    expect(ResourceUpdatedNotificationParamsSchema.safeParse(noUri).success).toBe(false);
    const relUri = { uri: '/relative', _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' } };
    expect(ResourceUpdatedNotificationParamsSchema.safeParse(relUri).success).toBe(false);
  });

  it('a sub-resource of a subscribed container URI is covered (R-10.5-j)', () => {
    expect(uriCoveredBySubscription('file:///dir/file.txt', 'file:///dir')).toBe(true);
    expect(uriCoveredBySubscription('file:///dir/sub/f.txt', 'file:///dir/')).toBe(true);
    // not a path boundary
    expect(uriCoveredBySubscription('file:///directory/f', 'file:///dir')).toBe(false);
    // different host/scheme
    expect(uriCoveredBySubscription('https://a/p', 'https://b/p')).toBe(false);
  });

  it('correlation is by subscriptionId, not solely by uri (R-10.5-k)', () => {
    const params = { uri: CONFIG_URI, _meta: { [SUBSCRIPTION_ID_META_KEY]: '1' } };
    expect(readSubscriptionId(params)).toBe('1');
  });
});

// ─── AC-16.15 ──────────────────────────────────────────────────────────────────

describe('AC-16.15 — emit only if requested AND reflected in the acknowledged filter', () => {
  it('not emitted when requested but capability undeclared (so not acknowledged) (R-10.5-l)', () => {
    const requested = { toolsListChanged: true };
    const caps = {}; // tools.listChanged not declared
    const ack = computeAcknowledgedFilter(requested, caps);
    expect(ack.toolsListChanged).toBeUndefined();
    expect(mayEmitChangeNotification(TOOLS_LIST_CHANGED_METHOD, ack)).toBe(false);
  });

  it('emitted when both requested and reflected in the acknowledged filter (R-10.5-l)', () => {
    const ack = computeAcknowledgedFilter({ toolsListChanged: true }, FULL_CAPS);
    expect(ack.toolsListChanged).toBe(true);
    expect(mayEmitChangeNotification(TOOLS_LIST_CHANGED_METHOD, ack)).toBe(true);
  });

  it('Subscription.mayEmit gates on active state + acknowledged filter (R-10.5-l)', () => {
    const sub = new Subscription(1, { toolsListChanged: true }, {});
    sub.acknowledge();
    // tools.listChanged not declared → declined → not emittable.
    expect(sub.mayEmit(TOOLS_LIST_CHANGED_METHOD)).toBe(false);
  });
});

// ─── AC-16.16 ──────────────────────────────────────────────────────────────────

describe('AC-16.16 — boundary: request-scoped vs subscription notifications', () => {
  it('progress/message are request-scoped, never on a subscription stream (R-10.6-a, R-10.6-b, R-10.6-e)', () => {
    expect(REQUEST_SCOPED_NOTIFICATION_METHODS).toEqual([
      'notifications/progress',
      'notifications/message',
    ]);
    for (const m of REQUEST_SCOPED_NOTIFICATION_METHODS) {
      expect(isRequestScopedNotificationMethod(m)).toBe(true);
      expect(classifyNotificationStream(m)).toBe('request-scoped');
    }
  });

  it('the four change kinds belong on a subscription stream (R-10.6-c, R-10.6-d, R-10.6-f)', () => {
    for (const m of CHANGE_NOTIFICATION_METHODS) {
      expect(classifyNotificationStream(m)).toBe('subscription');
    }
  });

  it('an unrelated method belongs to neither stream', () => {
    expect(classifyNotificationStream('notifications/initialized')).toBe('neither');
  });
});

// ─── AC-16.17 ──────────────────────────────────────────────────────────────────

describe('AC-16.17 — a notification on the wrong stream is a protocol violation', () => {
  it('a request-scoped kind on a subscription stream is a violation (R-10.6-g)', () => {
    expect(isViolationOnSubscriptionStream('notifications/progress')).toBe(true);
    expect(isViolationOnSubscriptionStream('notifications/message')).toBe(true);
    expect(isViolationOnSubscriptionStream(TOOLS_LIST_CHANGED_METHOD)).toBe(false);
  });

  it('a change kind on an unrelated request stream is a violation (R-10.6-g)', () => {
    expect(isViolationOnRequestStream(TOOLS_LIST_CHANGED_METHOD)).toBe(true);
    expect(isViolationOnRequestStream(RESOURCES_UPDATED_METHOD)).toBe(true);
    expect(isViolationOnRequestStream('notifications/progress')).toBe(false);
  });
});

// ─── AC-16.18 ──────────────────────────────────────────────────────────────────

describe('AC-16.18 — client cancellation closes the stream', () => {
  it('closes with the client-cancel reason (R-10.7-a)', () => {
    const sub = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    sub.acknowledge();
    sub.close('client-cancel');
    expect(sub.state).toBe('closed');
    expect(sub.closeReason).toBe('client-cancel');
    expect(sub.isClosed).toBe(true);
  });

  it('a closed subscription emits nothing further (R-10.7-a)', () => {
    const sub = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    sub.acknowledge();
    sub.close('client-cancel');
    expect(sub.mayEmit(TOOLS_LIST_CHANGED_METHOD)).toBe(false);
  });
});

// ─── AC-16.19 ──────────────────────────────────────────────────────────────────

describe('AC-16.19 — server teardown signals the client', () => {
  it('closes with the server-teardown reason (R-10.7-b)', () => {
    const sub = new Subscription(1, {}, FULL_CAPS);
    sub.acknowledge();
    sub.close('server-teardown');
    expect(sub.closeReason).toBe('server-teardown');
  });
});

// ─── AC-16.20 ──────────────────────────────────────────────────────────────────

describe('AC-16.20 — transport closure ends the subscription', () => {
  it('closes with the transport-close reason (R-10.7-c)', () => {
    const sub = new Subscription(1, {}, FULL_CAPS);
    sub.acknowledge();
    sub.close('transport-close');
    expect(sub.state).toBe('closed');
    expect(sub.closeReason).toBe('transport-close');
  });

  it('close is idempotent — the first reason wins (R-10.7-c)', () => {
    const sub = new Subscription(1, {}, FULL_CAPS);
    sub.close('transport-close');
    sub.close('client-cancel');
    expect(sub.closeReason).toBe('transport-close');
  });
});

// ─── AC-16.21 ──────────────────────────────────────────────────────────────────

describe('AC-16.21 — no retained state across connections; client must re-issue listen', () => {
  it('removing a subscription leaves no retained state (R-10.7-d)', () => {
    const registry = new SubscriptionRegistry();
    registry.add(new Subscription(1, { toolsListChanged: true }, FULL_CAPS));
    expect(registry.size).toBe(1);
    expect(registry.remove('1', 'transport-close')).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.get('1')).toBeUndefined();
  });

  it('re-establishing is a brand-new subscription with a new id (R-10.7-e)', () => {
    const registry = new SubscriptionRegistry();
    registry.add(new Subscription(1, { toolsListChanged: true }, FULL_CAPS));
    registry.remove('1', 'transport-close');
    // Re-issue: a NEW subscriptions/listen with a new id.
    const fresh = new Subscription(2, { toolsListChanged: true }, FULL_CAPS);
    registry.add(fresh);
    expect(registry.activeIds).toEqual(['2']);
  });
});

// ─── AC-16.22 ──────────────────────────────────────────────────────────────────

describe('AC-16.22 — no GET endpoint, no Last-Event-ID; re-establish via new listen with new id', () => {
  it('a new listen request yields a new subscription identifier (R-10.1-g, R-10.1-h, R-10.7-f)', () => {
    const first = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    const second = new Subscription(2, { toolsListChanged: true }, FULL_CAPS);
    expect(first.subscriptionId).toBe('1');
    expect(second.subscriptionId).toBe('2');
    expect(first.subscriptionId).not.toBe(second.subscriptionId);
  });

  it('there is no resumption surface — only the listen method opens a stream (R-10.7-f)', () => {
    // The sole entry point is the request method; no GET/Last-Event-ID symbol exists.
    expect(SUBSCRIPTIONS_LISTEN_METHOD).toBe('subscriptions/listen');
  });
});

// ─── AC-16.23 ──────────────────────────────────────────────────────────────────

describe('AC-16.23 — a client MAY hold multiple concurrent, independent subscriptions', () => {
  it('holds independent subscriptions keyed by their own ids (R-10.1-i)', () => {
    const registry = new SubscriptionRegistry();
    const a = new Subscription(1, { toolsListChanged: true }, FULL_CAPS);
    const b = new Subscription(2, { resourceSubscriptions: [CONFIG_URI] }, FULL_CAPS);
    registry.add(a);
    registry.add(b);
    expect(registry.size).toBe(2);
    expect(registry.activeIds.sort()).toEqual(['1', '2']);
    // independence: closing one does not affect the other
    registry.remove('1', 'client-cancel');
    expect(a.isClosed).toBe(true);
    expect(b.isClosed).toBe(false);
    expect(registry.get('2')).toBe(b);
  });

  it('rejects a duplicate active id (R-10.1-i)', () => {
    const registry = new SubscriptionRegistry();
    registry.add(new Subscription(1, {}, FULL_CAPS));
    expect(() => registry.add(new Subscription(1, {}, FULL_CAPS))).toThrow();
  });
});
