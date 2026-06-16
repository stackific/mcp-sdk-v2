/**
 * Streamable HTTP server handler (MCP 2026-07-28, §9) as a Web-standard `fetch`
 * handler: `(Request) => Promise<Response>`. This is the runtime-agnostic core —
 * it runs unchanged on Cloudflare Workers, Deno, and Bun, and is wrapped by the
 * `node:http` and Hono adapters for those environments.
 *
 * Routing on the MCP endpoint (mirrors §9.2/§9.6):
 *   - POST initialize   → single `application/json` response (no session).
 *   - POST request      → `text/event-stream`: interim notifications / server→client
 *                         requests, then the final JSON-RPC response, then close.
 *   - POST notification → `202 Accepted` (e.g. `notifications/cancelled` aborts).
 *   - POST response     → `202 Accepted`; routed to the awaiting server→client request.
 *   - GET               → standalone keep-alive SSE stream (honored; notifications
 *                         ride the originating request stream so it stays idle).
 *   - DELETE            → `200` (no-op; nothing to tear down when stateless).
 *
 * Statelessness (§9.9): there is no `Mcp-Session-Id`. A server→client request
 * issued mid-tool is correlated to the client's reply purely by JSON-RPC id, using
 * the SDK's {@link RequestCorrelator}, held in this handler's closure.
 */
import { classifyMessage } from '../jsonrpc/framing.js';
import { RequestCorrelator } from '../transport/correlation.js';
import {
  formatSseEvent,
  buildEventStreamHeaders,
  httpStatusForErrorCode,
  ORIGIN_HEADER,
} from '../transport/http/responses.js';
import {
  validateContentType,
  validateAccept,
  validateProtocolVersionHeader,
  validateRoutingHeaders,
  getHeader,
  type HttpHeaders,
  type HttpValidation,
} from '../transport/http/headers.js';
import { validateRequestMeta, CLIENT_CAPABILITIES_META_KEY } from '../protocol/meta.js';
import { validateParamHeaders } from '../transport/http/param-headers.js';
import { isTasksActiveForRequest, buildTasksMissingCapabilityError } from '../protocol/tasks.js';
import { taskSubscriptionRequiresCapability } from '../protocol/tasks-lifecycle.js';
import { CURRENT_PROTOCOL_VERSION } from '../protocol/discovery.js';
import { McpServer, ServerError, type RequestContext } from './server.js';
import {
  Subscription,
  SUBSCRIPTIONS_LISTEN_METHOD,
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  SUBSCRIPTION_ID_META_KEY,
  type SubscriptionFilter,
} from '../protocol/streaming.js';

const PARSE_ERROR_CODE = -32700;
const INVALID_REQUEST_CODE = -32600;
const INTERNAL_ERROR_CODE = -32603;

/** Resolves the caller identity for a request, or a challenge to reject it. */
export type AuthGate = (
  request: Request,
) =>
  | { ok: true; authInfo?: unknown }
  | { ok: false; status: number; wwwAuthenticate?: string; body: unknown }
  | Promise<{ ok: true; authInfo?: unknown } | { ok: false; status: number; wwwAuthenticate?: string; body: unknown }>;

/** Options for {@link createMcpRequestHandler}. */
export interface McpRequestHandlerOptions {
  /** The MCP endpoint path (default `/mcp`). Requests to other paths get `404`. */
  path?: string;
  /** Optional bearer/auth gate for a protected resource. */
  authGate?: AuthGate;
  /** `Access-Control-Allow-Origin` value; default `*`. Pass `null` to omit CORS headers. */
  cors?: string | null;
  /**
   * Accepted `Origin` values for DNS-rebinding defense (§9.11). When provided, a
   * request whose `Origin` header is present and not in this set is rejected with
   * `403`; a request with no `Origin` (non-browser) is always allowed. When omitted,
   * `Origin` is not enforced (back-compatible default).
   */
  allowedOrigins?: Iterable<string>;
}

/**
 * Builds a Web `fetch` handler that serves `server` over Streamable HTTP.
 *
 * Scope (S15): this is an **endpoint** server handler, not an intermediary or a
 * multi-host gateway. The §9 Recommended behaviors for intermediaries — version-
 * trust propagation and dual-hosting/multi-host guidance (RC-4/RC-5/RC-10/RC-11) —
 * do not apply to an endpoint and are intentionally out of scope here; an embedder
 * that fronts this handler with a proxy owns those intermediary obligations.
 *
 * @example
 * ```ts
 * // Cloudflare Workers
 * const handle = createMcpRequestHandler(server);
 * export default { fetch: (req: Request) => handle(req) };
 * ```
 */
export function createMcpRequestHandler(
  server: McpServer,
  options: McpRequestHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const path = options.path ?? '/mcp';
  const corsOrigin = options.cors === undefined ? '*' : options.cors;
  const acceptedOrigins = options.allowedOrigins;
  // Global correlator: server→client requests are matched by id alone — no session.
  const correlator = new RequestCorrelator();
  // In-flight client→server requests, so notifications/cancelled can abort them by id.
  const inflight = new Map<string, AbortController>();
  let srvReqSeq = 0;
  const encoder = new TextEncoder();

  // Active subscription streams (subscriptions/listen), keyed by subscriptionId. (§10)
  const subscriptions = new Map<
    string,
    { sub: Subscription; write: (m: unknown) => void; close: () => void; controller: AbortController }
  >();

  // Fan a change notification out to every subscription whose honored filter permits it,
  // tagging each with its subscriptionId in `_meta`. (§10.5/§10.6) The subject key used for
  // filtering is the updated resource URI, or — for a `notifications/tasks` push — the taskId.
  const notifySubscribers = (notification: { method: string; params?: Record<string, unknown> }): void => {
    const params = notification.params ?? {};
    const key =
      notification.method === 'notifications/tasks'
        ? (typeof params['taskId'] === 'string' ? (params['taskId'] as string) : undefined)
        : typeof params['uri'] === 'string'
          ? (params['uri'] as string)
          : undefined;
    for (const { sub, write } of subscriptions.values()) {
      if (!sub.mayEmit(notification.method, key)) continue;
      const existingMeta = (params['_meta'] as Record<string, unknown> | undefined) ?? {};
      write({
        jsonrpc: '2.0',
        method: notification.method,
        params: { ...params, _meta: { ...existingMeta, [SUBSCRIPTION_ID_META_KEY]: sub.subscriptionId } },
      });
    }
  };
  // §25.10: deliver task status pushes through the same subscriber fan-out.
  server.setTaskNotifier(notifySubscribers);

  const teardownSubscription = (subId: string): void => {
    const entry = subscriptions.get(subId);
    if (!entry) return;
    subscriptions.delete(subId);
    entry.sub.close('client-cancel');
    entry.controller.abort();
    entry.close(); // close the SSE response → the client observes teardown (§10.7)
  };

  const corsHeaders = (): Record<string, string> =>
    corsOrigin === null
      ? {}
      : {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          // No `Mcp-Session-Id`: the stateless transport MUST NOT use a session header (§9.9).
          'Access-Control-Allow-Headers':
            'Content-Type, MCP-Protocol-Version, Authorization, Mcp-Method, Mcp-Name',
          'Access-Control-Expose-Headers': 'MCP-Protocol-Version, WWW-Authenticate',
        };

  const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extra },
    });

  const errorEnvelope = (id: string | number, e: unknown): Record<string, unknown> => {
    if (e instanceof ServerError) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: e.code, message: e.message, ...(e.data !== undefined ? { data: e.data } : {}) },
      };
    }
    return {
      jsonrpc: '2.0',
      id,
      error: { code: INTERNAL_ERROR_CODE, message: e instanceof Error ? e.message : String(e) },
    };
  };

  /** A single-JSON request rejection with the §9.7-mapped HTTP status (−32601 → 404, else 400). */
  const rejectRequest = (
    id: string | number | null,
    error: { code: number; message: string; data?: unknown },
  ): Response => json(httpStatusForErrorCode(error.code), { jsonrpc: '2.0', id, error });

  /**
   * Validates a client→server request's required headers (§9.3), routing headers
   * (§9.4), and the per-request `_meta` envelope (§4.3) before dispatch. Returns a
   * rejection `Response`, or `null` when the request is well-formed. `initialize`
   * (the one legacy method) is exempt from the `_meta` gate.
   */
  const validateRequestEnvelope = (
    headers: HttpHeaders,
    body: unknown,
    params: Record<string, unknown>,
    meta: Record<string, unknown>,
    method: string,
    id: string | number | null,
  ): Response | null => {
    const checks: HttpValidation[] = [
      validateContentType(headers),
      validateAccept(headers),
      validateRoutingHeaders(headers, body),
    ];
    for (const c of checks) {
      if (!c.ok) return rejectRequest(id, c.rejection.error);
    }
    const pv = validateProtocolVersionHeader(headers, body, { supportedVersions: [CURRENT_PROTOCOL_VERSION] });
    if (!pv.ok) return rejectRequest(id, pv.rejection.error);
    if (method !== 'initialize') {
      const m = validateRequestMeta(meta);
      if (!m.ok) return rejectRequest(id, { code: m.code, message: m.message });
    }
    // §9.5.4 (S14-RQ-29/34) / §9.8-d (S15-RQ-10): for a `tools/call`, the request's
    // `Mcp-Param-*` headers MUST match the body. Resolve the registered tool's
    // inputSchema and validate the headers against `params.arguments`; a forged,
    // missing, or invalid-character header is rejected with -32001 (HTTP 400). The
    // receiver-side check (`validateParamHeaders`) is wired here so the runtime —
    // not just the library — enforces the §9.5 MUSTs.
    if (method === 'tools/call' && typeof params['name'] === 'string') {
      const schema = server.toolInputSchema(params['name']);
      if (schema !== undefined) {
        const args = (params['arguments'] ?? {}) as Record<string, unknown>;
        const headerCheck = validateParamHeaders(schema, args, headers);
        if (!headerCheck.ok) return rejectRequest(id, headerCheck.rejection.error);
      }
    }
    return null;
  };

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === '/health') {
      return json(200, { status: 'ok', name: server.info.name });
    }
    if (url.pathname !== path) {
      return json(404, { error: 'not found' });
    }

    const reqHeaders = Object.fromEntries(request.headers) as HttpHeaders;

    // DNS-rebinding defense (§9.11): validate Origin on every request (default-on). A
    // same-origin request and a non-browser request (no Origin) always pass; a cross-origin
    // browser Origin must be in `allowedOrigins` (pass ['*'] to allow any). With no list
    // configured, only same-origin browsers pass.
    const origin = getHeader(reqHeaders, ORIGIN_HEADER);
    if (origin !== undefined && origin !== url.origin && !originAllowed(origin, acceptedOrigins)) {
      return json(403, {
        jsonrpc: '2.0',
        id: null,
        error: { code: INVALID_REQUEST_CODE, message: `Origin not permitted: ${origin}` },
      });
    }

    // Optional bearer gate (protected resource).
    let authInfo: unknown;
    if (options.authGate) {
      const verdict = await options.authGate(request);
      if (!verdict.ok) {
        const extra: Record<string, string> = verdict.wwwAuthenticate
          ? { 'WWW-Authenticate': verdict.wwwAuthenticate }
          : {};
        return json(verdict.status, verdict.body, extra);
      }
      authInfo = verdict.authInfo;
    }

    // The stateless transport is POST-only; GET/DELETE (session lifecycle in other
    // bindings) are not part of it and get 405 (§9.9). A Last-Event-ID is ignored.
    if (request.method !== 'POST') {
      return json(405, { jsonrpc: '2.0', id: null, error: { code: INVALID_REQUEST_CODE, message: 'Method not allowed' } });
    }

    const raw = await request.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(400, { jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR_CODE, message: 'Parse error' } });
    }

    let classified;
    try {
      classified = classifyMessage(parsed);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid Request';
      return json(400, { jsonrpc: '2.0', id: null, error: { code: INVALID_REQUEST_CODE, message } });
    }

    // A client reply to a server→client request — route it and acknowledge.
    if (classified.kind === 'result-response' || classified.kind === 'error-response') {
      correlator.deliver(classified.message as never);
      return new Response(null, { status: 202, headers: corsHeaders() });
    }

    // A one-way client notification.
    if (classified.kind === 'notification') {
      handleNotification(classified.message as { method: string; params?: Record<string, unknown> });
      return new Response(null, { status: 202, headers: corsHeaders() });
    }

    // A client→server request.
    const requestMsg = classified.message as { id: string | number; method: string; params?: Record<string, unknown> };
    const params = (requestMsg.params ?? {}) as Record<string, unknown>;
    const meta = (params['_meta'] ?? {}) as Record<string, unknown>;

    // §9.3–§9.4 + §4.3: validate the required headers, routing headers, and the
    // per-request `_meta` envelope before dispatch; reject with the §9.7 status.
    const rejection = validateRequestEnvelope(reqHeaders, parsed, params, meta, requestMsg.method, requestMsg.id);
    if (rejection) return rejection;

    // The negotiated revision is taken from the (now-validated) header.
    const protocolVersion = getHeader(reqHeaders, 'MCP-Protocol-Version') ?? CURRENT_PROTOCOL_VERSION;

    if (requestMsg.method === 'initialize') {
      // The handshake never streams and carries no session.
      const ctx = bareContext(requestMsg.id, meta, protocolVersion, authInfo);
      try {
        const result = await server.dispatch('initialize', params, ctx);
        return json(200, { jsonrpc: '2.0', id: requestMsg.id, result });
      } catch (e) {
        return json(200, errorEnvelope(requestMsg.id, e));
      }
    }

    if (requestMsg.method === SUBSCRIPTIONS_LISTEN_METHOD) {
      // A long-lived subscription stream: acknowledge the honored subset, then keep
      // the SSE open carrying only filtered change notifications until teardown. (§10)
      const requested = (params['notifications'] ?? {}) as SubscriptionFilter;

      // §25.10: a `taskIds` opt-in requires the Tasks extension active for THIS
      // request — the client must declare `io.modelcontextprotocol/tasks` in its
      // per-request `clientCapabilities.extensions` AND the server must advertise it.
      // Supplying `taskIds` without it MUST be rejected with -32003. (R-25.10-e/f)
      const clientCaps = (meta[CLIENT_CAPABILITIES_META_KEY] ?? {}) as Record<string, unknown>;
      const tasksActive = isTasksActiveForRequest(clientCaps['extensions'], server.capabilities['extensions']);
      if (taskSubscriptionRequiresCapability(requested, tasksActive)) {
        return rejectRequest(requestMsg.id, buildTasksMissingCapabilityError(SUBSCRIPTIONS_LISTEN_METHOD));
      }

      const sub = new Subscription(requestMsg.id, requested, server.capabilities, { tasksActive });
      const controller = new AbortController();
      inflight.set(String(requestMsg.id), controller);
      const stream = new ReadableStream<Uint8Array>({
        start: (sseController) => {
          const write = (message: unknown): void => {
            try {
              sseController.enqueue(encoder.encode(formatSseEvent(message)));
            } catch {
              // stream already closed
            }
          };
          write({ jsonrpc: '2.0', method: SUBSCRIPTIONS_ACKNOWLEDGED_METHOD, params: sub.acknowledge() });
          subscriptions.set(sub.subscriptionId, {
            sub,
            write,
            controller,
            close: () => {
              try {
                sseController.close();
              } catch {
                // already closed
              }
            },
          });
        },
        cancel: () => {
          subscriptions.delete(sub.subscriptionId);
          inflight.delete(String(requestMsg.id));
          sub.close('transport-close');
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { ...buildEventStreamHeaders(), 'Cache-Control': 'no-cache, no-transform', ...corsHeaders() },
      });
    }

    // Lazy-commit (§9.6/§9.7): run the handler with a context that BUFFERS any
    // notifications / server→client requests. If the handler finishes (or throws)
    // WITHOUT streaming, answer with a single JSON response carrying the §9.7-mapped
    // status (e.g. method-not-found → 404, invalid-params → 400). Only once the
    // handler first emits do we commit to an SSE stream (status is then fixed at 200).
    const controller = new AbortController();
    inflight.set(String(requestMsg.id), controller);

    let sseController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const queued: unknown[] = [];
    let committed = false;
    let resolveCommit!: () => void;
    const committedPromise = new Promise<void>((r) => (resolveCommit = r));

    const write = (message: unknown): void => {
      if (sseController) {
        try {
          sseController.enqueue(encoder.encode(formatSseEvent(message)));
        } catch {
          // stream already closed by the peer
        }
        return;
      }
      queued.push(message);
      if (!committed) {
        committed = true;
        resolveCommit();
      }
    };

    const ctx: RequestContext = {
      protocolVersion,
      requestId: requestMsg.id,
      meta,
      signal: controller.signal,
      authInfo,
      notify(notification) {
        write({ jsonrpc: '2.0', ...notification });
      },
      serverRequest(method, requestParams) {
        const id = `srv-${++srvReqSeq}`;
        const pending = correlator.issue(id);
        write({ jsonrpc: '2.0', id, method, params: requestParams });
        return pending.then((response) => {
          const errored = response as { error?: { code: number; message: string; data?: unknown } };
          if (errored.error) throw new ServerError(errored.error.code, errored.error.message, errored.error.data);
          return (response as { result: Record<string, unknown> }).result;
        });
      },
      notifySubscribers,
    };

    type Outcome = { ok: true; result: Record<string, unknown> } | { ok: false; error: unknown };
    const dispatchPromise: Promise<Outcome> = server
      .dispatch(requestMsg.method, params, ctx)
      .then((result) => ({ ok: true as const, result }))
      .catch((error) => ({ ok: false as const, error }));

    // Did the handler commit to streaming before it finished?
    await Promise.race([committedPromise, dispatchPromise.then(() => undefined)]);

    if (!committed) {
      // No streaming: single JSON response with the §9.7-mapped status.
      inflight.delete(String(requestMsg.id));
      const outcome = await dispatchPromise;
      if (outcome.ok) {
        return json(200, { jsonrpc: '2.0', id: requestMsg.id, result: outcome.result });
      }
      const env = errorEnvelope(requestMsg.id, outcome.error) as { error: { code: number } };
      return json(httpStatusForErrorCode(env.error.code), env);
    }

    // The handler streamed: open the SSE response, flush the queued frames, then write
    // the final response on dispatch completion and close.
    const stream = new ReadableStream<Uint8Array>({
      start: (sc) => {
        sseController = sc;
        for (const m of queued) {
          try {
            sc.enqueue(encoder.encode(formatSseEvent(m)));
          } catch {
            // already closed
          }
        }
        queued.length = 0;
        void dispatchPromise
          .then((outcome) => {
            if (outcome.ok) write({ jsonrpc: '2.0', id: requestMsg.id, result: outcome.result });
            else write(errorEnvelope(requestMsg.id, outcome.error));
          })
          .finally(() => {
            inflight.delete(String(requestMsg.id));
            try {
              sc.close();
            } catch {
              // already closed
            }
          });
      },
      cancel: () => {
        // The client disconnected; abort the in-flight handler.
        inflight.delete(String(requestMsg.id));
        controller.abort();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { ...buildEventStreamHeaders(), 'Cache-Control': 'no-cache, no-transform', ...corsHeaders() },
    });
  };

  function handleNotification(message: { method: string; params?: Record<string, unknown> }): void {
    if (message.method === 'notifications/cancelled') {
      const target = message.params?.['requestId'];
      inflight.get(String(target))?.abort();
      // If it targets a subscription's listen request, tear that subscription down. (§10.7)
      for (const [subId, entry] of subscriptions) {
        if (String(entry.sub.requestId) === String(target)) teardownSubscription(subId);
      }
    }
    // notifications/initialized and others: nothing to do in the stateless model.
  }

}

/** True when a cross-origin `origin` is explicitly permitted (`allowed` contains it or `'*'`). */
function originAllowed(origin: string, allowed: Iterable<string> | undefined): boolean {
  if (!allowed) return false;
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return set.has('*') || set.has(origin);
}

/** A context for the single-response (initialize) path: notifications / server requests are unavailable. */
function bareContext(
  requestId: string | number,
  meta: Record<string, unknown>,
  protocolVersion: string,
  authInfo: unknown,
): RequestContext {
  return {
    protocolVersion,
    requestId,
    meta,
    authInfo,
    signal: new AbortController().signal,
    notify() {
      throw new ServerError(INTERNAL_ERROR_CODE, 'notifications are not available on a single-response request');
    },
    serverRequest() {
      throw new ServerError(INTERNAL_ERROR_CODE, 'server→client requests are not available on a single-response request');
    },
  };
}
