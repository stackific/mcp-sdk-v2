/**
 * Tests for the MCP client host (2026-07-28).
 *
 * Coverage:
 *  - Outgoing requests carry the REQUIRED per-request `_meta` envelope (§4.3):
 *    protocol version, client identity, client capabilities.
 *  - Response correlation by id; delivered error → RequestError (§7.5).
 *  - Inbound server→client requests routed to setRequestHandler; the handler's
 *    result is posted back as the JSON-RPC response; missing handler → -32601.
 *  - Notifications routed to setNotificationHandler; progress correlated by token.
 *  - Cancellation: aborting sends `notifications/cancelled` and rejects (§15.2).
 *  - discover() parses DiscoverResult and selects the negotiated revision (§5.3–§5.4).
 *  - End-to-end over StreamableHTTPClientTransport: a tools/call whose stream
 *    issues a server→client elicitation request, answered by the client, then
 *    completes — the full bidirectional path on one open stream.
 */
import { describe, it, expect, vi } from 'vitest';
import type { JSONRPCMessage } from '../../jsonrpc/framing.js';
import {
  TransportError,
  type Transport,
  type TransportCloseInfo,
  type Unsubscribe,
} from '../../transport/contract.js';
import {
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from '../../protocol/meta.js';
import { Client, StreamableHTTPClientTransport } from '../../client/index.js';

const clientInfo = { name: 'test-client', version: '0.0.1' };

/** A controllable in-process transport: records sends and lets a test inject inbound frames. */
class StubTransport implements Transport {
  readonly sent: any[] = [];
  closed = false;
  private messageHandlers = new Set<(m: JSONRPCMessage) => void>();
  private closeHandlers = new Set<(i: TransportCloseInfo) => void>();
  /** Optional hook invoked for each sent message (e.g. to auto-reply). */
  onSend?: (message: any) => void;

  send(message: JSONRPCMessage): void {
    this.sent.push(message);
    this.onSend?.(message);
  }
  onMessage(handler: (m: JSONRPCMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
  onError(): Unsubscribe {
    return () => {};
  }
  onClose(handler: (i: TransportCloseInfo) => void): Unsubscribe {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }
  close(): void {
    this.closed = true;
    for (const h of this.closeHandlers) h({ clean: true });
  }
  /** Test helper: deliver an inbound frame to the client. */
  inject(message: any): void {
    for (const h of this.messageHandlers) h(message);
  }
}

describe('Client — outgoing request envelope (§4.3)', () => {
  it('stamps the three required _meta keys on every request', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo, { capabilities: { sampling: {}, elicitation: {} } });
    client.connect(transport);

    transport.onSend = (m) => {
      // Auto-respond so the request settles.
      transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', tools: [] } });
    };

    await client.request({ method: 'tools/list' });
    const meta = transport.sent[0].params._meta;
    expect(meta[PROTOCOL_VERSION_META_KEY]).toBe('2026-07-28');
    expect(meta[CLIENT_INFO_META_KEY]).toEqual(clientInfo);
    expect(meta[CLIENT_CAPABILITIES_META_KEY]).toEqual({ sampling: {}, elicitation: {} });
  });

  it('preserves caller _meta (e.g. traceparent) alongside the reserved keys', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);
    transport.onSend = (m) => transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete' } });

    await client.request({ method: 'ping', params: { _meta: { traceparent: '00-abc-def-01' } } });
    expect(transport.sent[0].params._meta.traceparent).toBe('00-abc-def-01');
    expect(transport.sent[0].params._meta[PROTOCOL_VERSION_META_KEY]).toBe('2026-07-28');
  });
});

describe('Client — correlation and errors', () => {
  it('resolves with the result on a success response', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);
    transport.onSend = (m) => transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', value: 42 } });

    const result = await client.request({ method: 'tools/list' });
    expect(result.value).toBe(42);
  });

  it('throws RequestError on a delivered error response', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);
    transport.onSend = (m) =>
      transport.inject({ jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'Invalid params', data: { field: 'x' } } });

    await expect(client.request({ method: 'tools/call', params: { name: 'add' } })).rejects.toMatchObject({
      name: 'RequestError',
      code: -32602,
      data: { field: 'x' },
    });
  });
});

describe('Client — inbound server→client requests (§20–§21)', () => {
  it('routes to the registered handler and posts the result back', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo, { capabilities: { elicitation: {} } });
    client.connect(transport);

    client.setRequestHandler('elicitation/create', async (params) => {
      expect(params.mode).toBe('form');
      return { action: 'accept', content: { name: 'Ada' } };
    });

    transport.inject({ jsonrpc: '2.0', id: 'srv-1', method: 'elicitation/create', params: { mode: 'form' } });
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));

    const reply = transport.sent[0];
    expect(reply.id).toBe('srv-1');
    expect(reply.result).toEqual({ action: 'accept', content: { name: 'Ada' } });
  });

  it('replies with -32601 when no handler is registered', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);

    transport.inject({ jsonrpc: '2.0', id: 'srv-2', method: 'sampling/createMessage', params: {} });
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
    expect(transport.sent[0].error.code).toBe(-32601);
  });
});

describe('Client — notifications and progress (§15.1)', () => {
  it('routes notifications and correlates progress by token', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);

    const logged: any[] = [];
    client.setNotificationHandler('notifications/message', (p) => logged.push(p));

    const progressSeen: any[] = [];
    transport.onSend = (m) => {
      // Emit a correlated progress notification, then the final result.
      transport.inject({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progressToken: m.params._meta.progressToken, progress: 0.5 },
      });
      transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete' } });
    };

    await client.request(
      { method: 'tools/call', params: { name: 'slow' } },
      { onProgress: (p) => progressSeen.push(p) },
    );
    expect(progressSeen).toHaveLength(1);
    expect(progressSeen[0].progress).toBe(0.5);

    transport.inject({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'hi' } });
    expect(logged).toHaveLength(1);
  });
});

describe('Client — cancellation (§15.2)', () => {
  it('sends notifications/cancelled and rejects when aborted', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);
    // Never auto-respond, so the request stays open until cancelled.

    const controller = new AbortController();
    const pending = client.request({ method: 'tools/call', params: { name: 'forever' } }, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(TransportError);
    const cancelled = transport.sent.find((m) => m.method === 'notifications/cancelled');
    expect(cancelled).toBeTruthy();
    expect(cancelled.params.requestId).toBe(transport.sent[0].id);
  });
});

describe('Client — discovery and negotiation (§5.3–§5.4)', () => {
  it('parses DiscoverResult and selects the negotiated revision', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);
    transport.onSend = (m) =>
      transport.inject({
        jsonrpc: '2.0',
        id: m.id,
        result: {
          resultType: 'complete',
          supportedVersions: ['2026-07-28'],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'fake-server', version: '2.0.0' },
          instructions: 'be nice',
        },
      });

    const result = await client.discover();
    expect(result.serverInfo.name).toBe('fake-server');
    expect(client.getNegotiatedVersion()).toBe('2026-07-28');
    expect(client.getServerCapabilities()).toEqual({ tools: {}, resources: {} });
    expect(client.getInstructions()).toBe('be nice');
    // The discover request itself carried the envelope.
    expect(transport.sent[0].params._meta[CLIENT_INFO_META_KEY]).toEqual(clientInfo);
  });
});

describe('Client — end-to-end over StreamableHTTPClientTransport', () => {
  it('drives a tools/call that issues a server→client elicitation on its stream', async () => {
    // A tiny fake MCP server: tools/call opens an SSE stream that first issues a
    // server→client elicitation request, then — once the client POSTs its reply —
    // emits the final tool result and closes the stream.
    const encoder = new TextEncoder();
    let pending: { controller: ReadableStreamDefaultController; callId: unknown } | null = null;

    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const msg = JSON.parse(init.body as string);

      if (msg.method === 'tools/call') {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ jsonrpc: '2.0', id: 'srv-1', method: 'elicitation/create', params: { mode: 'form' } })}\n\n`,
              ),
            );
            pending = { controller, callId: msg.id };
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
      }

      // The client's reply to the server→client elicitation request.
      if (msg.result !== undefined || msg.error !== undefined) {
        expect(msg.id).toBe('srv-1');
        pending!.controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              jsonrpc: '2.0',
              id: (pending as any).callId,
              result: { resultType: 'complete', content: [{ type: 'text', text: 'registered' }], elicited: msg.result },
            })}\n\n`,
          ),
        );
        pending!.controller.close();
        return new Response(null, { status: 202 });
      }

      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const transport = new StreamableHTTPClientTransport('http://mcp.test/mcp', { fetch: fakeFetch });
    const client = new Client(clientInfo, { capabilities: { elicitation: { form: {} } } });
    client.connect(transport);
    client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { name: 'Ada' } }));

    const result = await client.callTool({ name: 'register_user' });
    expect(result.content).toEqual([{ type: 'text', text: 'registered' }]);
    expect(result.elicited).toEqual({ action: 'accept', content: { name: 'Ada' } });

    await client.close();
  });

  it('emits Mcp-Param-* headers for a tool declaring x-mcp-header (§9.5.2)', async () => {
    let toolCallHeaders: Headers | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const msg = JSON.parse(init.body as string);
      if (msg.method === 'tools/list') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              resultType: 'complete',
              ttlMs: 0,
              cacheScope: 'private',
              tools: [{ name: 'search', inputSchema: { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } } }],
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      toolCallHeaders = new Headers(init.headers as HeadersInit);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { resultType: 'complete', content: [] } }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const transport = new StreamableHTTPClientTransport('http://mcp.test/mcp', { fetch: fakeFetch });
    const client = new Client(clientInfo);
    client.connect(transport);
    await client.listTools(); // learns the x-mcp-header annotation
    await client.callTool({ name: 'search', arguments: { region: 'us-east' } });
    expect(toolCallHeaders?.get('Mcp-Param-Region')).toBe('us-east');
    await client.close();
  });
});

describe('Client — close() never orphans a pending request (§7.5 robustness)', () => {
  /** A transport whose send always rejects — models a fetch failure during a reconnect race. */
  class ThrowingSendTransport implements Transport {
    private closeHandlers = new Set<(i: TransportCloseInfo) => void>();
    send(): Promise<void> {
      return Promise.reject(new TransportError('send failed: network down'));
    }
    onMessage(): Unsubscribe {
      return () => {};
    }
    onError(): Unsubscribe {
      return () => {};
    }
    onClose(handler: (i: TransportCloseInfo) => void): Unsubscribe {
      this.closeHandlers.add(handler);
      return () => this.closeHandlers.delete(handler);
    }
    close(): void {
      for (const h of this.closeHandlers) h({ clean: true });
    }
  }

  it('a request whose send fails rejects, and a later close() raises no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown): void => {
      unhandled.push(e);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const client = new Client(clientInfo);
      client.connect(new ThrowingSendTransport());

      // The send fails, so the request rejects — and crucially its correlator entry
      // must not be left dangling for close()'s failAll() to orphan.
      await expect(client.request({ method: 'ping' })).rejects.toBeInstanceOf(TransportError);
      await client.close();
      // Give any stray microtask-queued rejection a chance to surface.
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('close() rejects a still-pending request without an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown): void => {
      unhandled.push(e);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const transport = new StubTransport(); // send succeeds, but nothing ever replies
      const client = new Client(clientInfo);
      client.connect(transport);

      const pending = client.request({ method: 'ping' });
      await client.close();
      await expect(pending).rejects.toBeInstanceOf(TransportError);
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
