/**
 * S7 — serve an {@link McpServer} over any {@link Transport} (the stdio transport
 * in practice): read inbound requests, dispatch them, and write responses. Interim
 * notifications and server→client requests (elicitation/sampling/roots) ride the
 * same channel, correlated by JSON-RPC id via {@link RequestCorrelator}.
 *
 * Subscriptions (§10) are first-class on stdio: a `subscriptions/listen` opens ONE
 * long-lived logical stream multiplexed onto the single channel. The server sends
 * the mandatory acknowledgement, then fans out only the honored change-notification
 * kinds, each tagged with its `io.modelcontextprotocol/subscriptionId` so the client
 * can demultiplex; a `notifications/cancelled` for the listen id tears it down (§10.7).
 *
 * Transport-agnostic and edge-safe; pair it with `StdioServerTransport`.
 */
import { classifyMessage, type JSONRPCMessage } from '../jsonrpc/framing.js';
import { RequestCorrelator } from '../transport/correlation.js';
import type { Transport, Unsubscribe } from '../transport/contract.js';
import { McpServer, ServerError, INTERNAL_ERROR_CODE, type RequestContext } from './server.js';
import { CLIENT_CAPABILITIES_META_KEY } from '../protocol/meta.js';
import { isTasksActiveForRequest, buildTasksMissingCapabilityError } from '../protocol/tasks.js';
import { taskSubscriptionRequiresCapability } from '../protocol/tasks-lifecycle.js';
import { CANCELLED_NOTIFICATION_METHOD } from '../protocol/progress.js';
import {
  Subscription,
  SubscriptionRegistry,
  SUBSCRIPTIONS_LISTEN_METHOD,
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  SUBSCRIPTION_ID_META_KEY,
  type SubscriptionFilter,
} from '../protocol/streaming.js';

const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';

function errorEnvelope(id: string | number, e: unknown): Record<string, unknown> {
  if (e instanceof ServerError) {
    return { jsonrpc: '2.0', id, error: { code: e.code, message: e.message, ...(e.data !== undefined ? { data: e.data } : {}) } };
  }
  return { jsonrpc: '2.0', id, error: { code: INTERNAL_ERROR_CODE, message: e instanceof Error ? e.message : String(e) } };
}

/**
 * Wires `server` to `transport` and starts dispatching. Returns an unsubscribe
 * function that stops handling inbound messages.
 *
 * @example
 * ```ts
 * import { StdioServerTransport } from '@stackific/mcp-sdk-ts';
 * serveStdio(server, new StdioServerTransport(process.stdin, process.stdout));
 * ```
 */
export function serveStdio(server: McpServer, transport: Transport): Unsubscribe {
  const correlator = new RequestCorrelator();
  let srvSeq = 0;
  const send = (message: Record<string, unknown>): void => {
    void transport.send(message as unknown as JSONRPCMessage);
  };

  // §10: active subscriptions on this channel, keyed by subscriptionId. Because all
  // subscriptions share the single stdio channel, every delivered change notification
  // carries `io.modelcontextprotocol/subscriptionId` so the client can demultiplex.
  const subscriptions = new SubscriptionRegistry();

  // Fan a change notification out to every active subscription whose honored filter
  // permits it, tagging each with that subscription's id. The subject key is the
  // updated resource URI, or — for a `notifications/tasks` push — the taskId. (§10.5/§10.6)
  const notifySubscribers = (notification: { method: string; params?: Record<string, unknown> }): void => {
    const params = notification.params ?? {};
    const key =
      notification.method === 'notifications/tasks'
        ? typeof params['taskId'] === 'string'
          ? (params['taskId'] as string)
          : undefined
        : typeof params['uri'] === 'string'
          ? (params['uri'] as string)
          : undefined;
    for (const subscriptionId of subscriptions.activeIds) {
      const sub = subscriptions.get(subscriptionId);
      if (!sub || !sub.mayEmit(notification.method, key)) continue;
      const existingMeta = (params['_meta'] as Record<string, unknown> | undefined) ?? {};
      send({
        jsonrpc: '2.0',
        method: notification.method,
        params: { ...params, _meta: { ...existingMeta, [SUBSCRIPTION_ID_META_KEY]: sub.subscriptionId } },
      });
    }
  };
  // §25.10: deliver task status pushes through the same subscriber fan-out.
  server.setTaskNotifier(notifySubscribers);

  const buildContext = (id: string | number, meta: Record<string, unknown>): RequestContext => ({
    protocolVersion: typeof meta[PROTOCOL_VERSION_META_KEY] === 'string' ? (meta[PROTOCOL_VERSION_META_KEY] as string) : '2026-07-28',
    requestId: id,
    meta,
    signal: new AbortController().signal,
    notify(notification) {
      send({ jsonrpc: '2.0', ...notification });
    },
    serverRequest(method, requestParams) {
      const reqId = `srv-${++srvSeq}`;
      const pending = correlator.issue(reqId);
      send({ jsonrpc: '2.0', id: reqId, method, params: requestParams });
      return pending.then((response) => {
        const err = (response as { error?: { code: number; message: string; data?: unknown } }).error;
        if (err) throw new ServerError(err.code, err.message, err.data);
        return (response as { result: Record<string, unknown> }).result;
      });
    },
    notifySubscribers,
  });

  const unsubscribe = transport.onMessage((message) => {
    let classified;
    try {
      classified = classifyMessage(message);
    } catch {
      return; // ignore malformed inbound (never answered)
    }

    if (classified.kind === 'result-response' || classified.kind === 'error-response') {
      correlator.deliver(classified.message as never); // a client reply to a server→client request
      return;
    }
    if (classified.kind === 'notification') {
      const note = classified.message as { method: string; params?: Record<string, unknown> };
      // §10.7: a client tears a subscription down by sending notifications/cancelled
      // referencing the `subscriptions/listen` request id. Close + remove it so the
      // server stops delivering on that subscription.
      if (note.method === CANCELLED_NOTIFICATION_METHOD) {
        const target = note.params?.['requestId'];
        for (const subscriptionId of subscriptions.activeIds) {
          const sub = subscriptions.get(subscriptionId);
          if (sub && String(sub.requestId) === String(target)) {
            subscriptions.remove(subscriptionId, 'client-cancel');
          }
        }
      }
      return; // other notifications: nothing to do in the stateless model
    }
    if (classified.kind !== 'request') return;

    const req = classified.message as { id: string | number; method: string; params?: Record<string, unknown> };
    const params = (req.params ?? {}) as Record<string, unknown>;
    const meta = (params['_meta'] ?? {}) as Record<string, unknown>;

    // §10: a subscriptions/listen opens ONE long-lived subscription on this channel.
    // It is NOT an ordinary request — there is no final response; the acknowledgement
    // is the first (and mandatory) message, then only filtered change notifications flow.
    if (req.method === SUBSCRIPTIONS_LISTEN_METHOD) {
      const requested = (params['notifications'] ?? {}) as SubscriptionFilter;
      // §25.10 (R-25.10-e/f): a `taskIds` opt-in requires the Tasks extension active for
      // THIS request (client declared it AND server advertises it) — else reject -32003.
      const clientCaps = (meta[CLIENT_CAPABILITIES_META_KEY] ?? {}) as Record<string, unknown>;
      const tasksActive = isTasksActiveForRequest(clientCaps['extensions'], server.capabilities['extensions']);
      if (taskSubscriptionRequiresCapability(requested, tasksActive)) {
        const e = buildTasksMissingCapabilityError(SUBSCRIPTIONS_LISTEN_METHOD);
        send(errorEnvelope(req.id, new ServerError(e.code, e.message, e.data)));
        return;
      }
      const sub = new Subscription(req.id, requested, server.capabilities, { tasksActive });
      subscriptions.add(sub);
      // Mandatory first message: the acknowledgement (honored subset + subscriptionId).
      send({ jsonrpc: '2.0', method: SUBSCRIPTIONS_ACKNOWLEDGED_METHOD, params: sub.acknowledge() });
      return;
    }

    const ctx = buildContext(req.id, meta);
    void server.dispatch(req.method, params, ctx).then(
      (result) => send({ jsonrpc: '2.0', id: req.id, result }),
      (e) => send(errorEnvelope(req.id, e)),
    );
  });

  // §10.7 (R-10.7-b): on SERVER-initiated teardown (calling the returned disposer),
  // signal each active subscription to the client via `notifications/cancelled` BEFORE
  // removing it, then stop dispatching. On Streamable HTTP the server closes the SSE
  // response to signal teardown; on the shared stdio channel — which stays open — the
  // cancellation MUST be sent explicitly.
  return () => {
    for (const subscriptionId of subscriptions.activeIds) {
      const sub = subscriptions.get(subscriptionId);
      if (!sub) continue;
      send(sub.teardownNotification());
      subscriptions.remove(subscriptionId, 'server-teardown');
    }
    unsubscribe();
  };
}
