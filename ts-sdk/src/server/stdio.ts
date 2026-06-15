/**
 * S7 — serve an {@link McpServer} over any {@link Transport} (the stdio transport
 * in practice): read inbound requests, dispatch them, and write responses. Interim
 * notifications and server→client requests (elicitation/sampling/roots) ride the
 * same channel, correlated by JSON-RPC id via {@link RequestCorrelator}.
 *
 * Transport-agnostic and edge-safe; pair it with `StdioServerTransport`.
 */
import { classifyMessage, type JSONRPCMessage } from '../jsonrpc/framing.js';
import { RequestCorrelator } from '../transport/correlation.js';
import type { Transport, Unsubscribe } from '../transport/contract.js';
import { McpServer, ServerError, INTERNAL_ERROR_CODE, type RequestContext } from './server.js';

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

  return transport.onMessage((message) => {
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
    if (classified.kind !== 'request') return; // notifications: nothing to do in the stateless model

    const req = classified.message as { id: string | number; method: string; params?: Record<string, unknown> };
    const params = (req.params ?? {}) as Record<string, unknown>;
    const meta = (params['_meta'] ?? {}) as Record<string, unknown>;
    const ctx: RequestContext = {
      protocolVersion: typeof meta[PROTOCOL_VERSION_META_KEY] === 'string' ? (meta[PROTOCOL_VERSION_META_KEY] as string) : '2026-07-28',
      requestId: req.id,
      meta,
      signal: new AbortController().signal,
      notify(notification) {
        send({ jsonrpc: '2.0', ...notification });
      },
      serverRequest(method, requestParams) {
        const id = `srv-${++srvSeq}`;
        const pending = correlator.issue(id);
        send({ jsonrpc: '2.0', id, method, params: requestParams });
        return pending.then((response) => {
          const err = (response as { error?: { code: number; message: string; data?: unknown } }).error;
          if (err) throw new ServerError(err.code, err.message, err.data);
          return (response as { result: Record<string, unknown> }).result;
        });
      },
    };

    void server.dispatch(req.method, params, ctx).then(
      (result) => send({ jsonrpc: '2.0', id: req.id, result }),
      (e) => send(errorEnvelope(req.id, e)),
    );
  });
}
