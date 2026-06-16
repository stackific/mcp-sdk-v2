/**
 * Tests for the Streamable HTTP client transport (§9, client half).
 *
 * Coverage:
 *  - POST framing: required headers (Content-Type, Accept ×2, MCP-Protocol-Version),
 *    routing headers (Mcp-Method, Mcp-Name), and body protocol-version mirroring.
 *  - Response shapes: single `application/json` and `text/event-stream` (§9.6),
 *    delivering every SSE frame in order via `onMessage`.
 *  - Failure surfacing (R-7.2-q): HTTP error → delivered error response for the id;
 *    stream ending before the final response → synthesized error response;
 *    non-2xx for a notification → thrown TransportError.
 *  - Bearer auth header from an AuthProvider (§23.8).
 *  - Clean close is observable and blocks further sends.
 */
import { describe, it, expect, vi } from 'vitest';
import type { JSONRPCMessage } from '../../jsonrpc/framing.js';
import { TransportError } from '../../transport/contract.js';
import { PROTOCOL_VERSION_META_KEY } from '../../protocol/meta.js';
import { StreamableHTTPClientTransport } from '../../client/streamable-http.js';

/** A request message carrying a valid `_meta` envelope (only the version is read by the transport). */
function request(id: number, method: string, params: Record<string, unknown> = {}): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: { ...params, _meta: { [PROTOCOL_VERSION_META_KEY]: '2026-07-28' } },
  } as unknown as JSONRPCMessage;
}

/** Builds a `text/event-stream` Response from a list of JSON-RPC frames. */
function sseResponse(frames: unknown[], status = 200): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('');
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Collects inbound frames and exposes the recorded fetch calls. */
function harness(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; headers: Record<string, string>; body: any }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, init, headers, body });
    return handler(url, init);
  }) as unknown as typeof fetch;
  const frames: JSONRPCMessage[] = [];
  const transport = new StreamableHTTPClientTransport('http://mcp.test/mcp', { fetch: fetchImpl });
  transport.onMessage((m) => frames.push(m));
  return { transport, frames, calls };
}

describe('StreamableHTTPClientTransport — POST headers (§9.3–§9.4)', () => {
  it('sends the required + routing headers for a tools/call', async () => {
    const { transport, calls } = harness(() => sseResponse([{ jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } }]));
    await transport.send(request(1, 'tools/call', { name: 'add', arguments: { a: 1 } }));

    const headers = calls[0]!.headers;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toContain('application/json');
    expect(headers['Accept']).toContain('text/event-stream');
    expect(headers['MCP-Protocol-Version']).toBe('2026-07-28');
    expect(headers['Mcp-Method']).toBe('tools/call');
    // tools/call carries an Mcp-Name routing header equal to params.name. (R-9.4.2-b)
    expect(headers['Mcp-Name']).toBe('add');
  });

  it('omits Mcp-Name for methods without a targeted name', async () => {
    const { transport, calls } = harness(() => sseResponse([{ jsonrpc: '2.0', id: 2, result: { resultType: 'complete' } }]));
    await transport.send(request(2, 'tools/list'));
    expect(calls[0]!.headers['Mcp-Name']).toBeUndefined();
    expect(calls[0]!.headers['Mcp-Method']).toBe('tools/list');
  });

  it('attaches a bearer token from the AuthProvider', async () => {
    const calls: Record<string, string>[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(init.headers as Record<string, string>);
      return sseResponse([{ jsonrpc: '2.0', id: 3, result: { resultType: 'complete' } }]);
    }) as unknown as typeof fetch;
    const transport = new StreamableHTTPClientTransport('http://mcp.test/mcp', {
      fetch: fetchImpl,
      authProvider: { token: async () => 'secret-token' },
    });
    transport.onMessage(() => {});
    await transport.send(request(3, 'tools/list'));
    expect(calls[0]!['Authorization']).toBe('Bearer secret-token');
  });
});

describe('StreamableHTTPClientTransport — response shapes (§9.6)', () => {
  it('delivers every SSE frame in order (notification, server→client request, final response)', async () => {
    const { transport, frames } = harness(() =>
      sseResponse([
        { jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: 1, progress: 0.5 } },
        { jsonrpc: '2.0', id: 'srv-1', method: 'elicitation/create', params: { mode: 'form' } },
        { jsonrpc: '2.0', id: 7, result: { resultType: 'complete', content: [] } },
      ]),
    );
    await transport.send(request(7, 'tools/call', { name: 'x' }));
    await vi.waitFor(() => expect(frames).toHaveLength(3));

    expect((frames[0] as any).method).toBe('notifications/progress');
    expect((frames[1] as any).method).toBe('elicitation/create');
    expect((frames[2] as any).result.resultType).toBe('complete');
  });

  it('handles a single application/json response', async () => {
    const { transport, frames } = harness(() =>
      jsonResponse({ jsonrpc: '2.0', id: 9, result: { resultType: 'complete', ok: true } }),
    );
    await transport.send(request(9, 'ping'));
    await vi.waitFor(() => expect(frames).toHaveLength(1));
    expect((frames[0] as any).result.ok).toBe(true);
  });
});

describe('StreamableHTTPClientTransport — failure surfacing (R-7.2-q, §7.5)', () => {
  it('turns an HTTP error status into a delivered error response for the id', async () => {
    const { transport, frames } = harness(() =>
      jsonResponse({ jsonrpc: '2.0', id: 5, error: { code: -32601, message: 'Method not found' } }, 404),
    );
    await transport.send(request(5, 'does/not/exist'));
    await vi.waitFor(() => expect(frames).toHaveLength(1));
    expect((frames[0] as any).error.code).toBe(-32601);
    expect((frames[0] as any).id).toBe(5);
  });

  it('synthesizes an error response when the stream ends before the final response', async () => {
    const { transport, frames } = harness(() =>
      sseResponse([
        { jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'hi' } },
        // no final response for id 6 — the stream just ends
      ]),
    );
    await transport.send(request(6, 'tools/call', { name: 'y' }));
    await vi.waitFor(() => expect(frames.some((f) => (f as any).id === 6 && (f as any).error)).toBe(true));
    const synthetic = frames.find((f) => (f as any).id === 6) as any;
    expect(synthetic.error.code).toBe(-32603);
  });

  it('throws a TransportError when a notification POST is not accepted', async () => {
    const { transport } = harness(() => new Response('nope', { status: 500 }));
    await expect(
      transport.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } } as JSONRPCMessage),
    ).rejects.toBeInstanceOf(TransportError);
  });
});

describe('StreamableHTTPClientTransport — lifecycle', () => {
  it('observes a clean close and refuses further sends', async () => {
    const { transport } = harness(() => jsonResponse({ jsonrpc: '2.0', id: 1, result: { resultType: 'complete' } }));
    const onClose = vi.fn();
    transport.onClose(onClose);
    await transport.close('done');
    expect(onClose).toHaveBeenCalledWith({ clean: true, reason: 'done' });
    expect(transport.closed).toBe(true);
    await expect(transport.send(request(1, 'ping'))).rejects.toBeInstanceOf(TransportError);
  });
});
