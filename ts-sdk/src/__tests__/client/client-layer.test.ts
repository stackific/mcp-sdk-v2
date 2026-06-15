/**
 * Tests for the higher-level client layer (proposal items):
 *  C1 typed convenience methods, C4 pagination auto-iteration, C5 tasks helpers,
 *  C7 capability guards, C2 multi-round-trip (input-required) driver.
 */
import { describe, it, expect } from 'vitest';
import type { JSONRPCMessage } from '../../jsonrpc/framing.js';
import { type Transport, type TransportCloseInfo, type Unsubscribe } from '../../transport/contract.js';
import { Client, RequestError } from '../../client/index.js';

const clientInfo = { name: 'test', version: '1' };

/** Controllable transport: records sends and auto-replies via an onSend hook. */
class StubTransport implements Transport {
  readonly sent: any[] = [];
  closed = false;
  private handlers = new Set<(m: JSONRPCMessage) => void>();
  onSend?: (message: any) => void;
  send(message: JSONRPCMessage): void {
    this.sent.push(message);
    this.onSend?.(message);
  }
  onMessage(h: (m: JSONRPCMessage) => void): Unsubscribe {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
  onError(): Unsubscribe {
    return () => {};
  }
  onClose(_h: (i: TransportCloseInfo) => void): Unsubscribe {
    return () => {};
  }
  close(): void {
    this.closed = true;
  }
  inject(message: any): void {
    for (const h of this.handlers) h(message);
  }
}

/** Wires a client whose every request is auto-answered by `reply(method, params) => result`. */
function connected(reply: (method: string, params: any) => Record<string, unknown>) {
  const transport = new StubTransport();
  const client = new Client(clientInfo, { capabilities: { elicitation: {} } });
  client.connect(transport);
  transport.onSend = (m) => {
    if (m.id === undefined) return; // notification
    transport.inject({ jsonrpc: '2.0', id: m.id, result: reply(m.method, m.params) });
  };
  return { client, transport };
}

describe('C1 — typed convenience methods', () => {
  it('send the correct JSON-RPC methods', async () => {
    const { client, transport } = connected((method) => {
      if (method === 'tools/list') return { resultType: 'complete', tools: [{ name: 'add' }] };
      return { resultType: 'complete' };
    });

    const tools = await client.listTools();
    expect(tools.tools).toEqual([{ name: 'add' }]);

    await client.readResource('docs://x');
    await client.getPrompt('greeting', { name: 'Ada' });
    await client.complete({ type: 'ref/prompt', name: 'greeting' }, { name: 'language', value: 'en' });
    await client.setLoggingLevel('debug');
    await client.ping();

    const methods = transport.sent.map((m) => m.method);
    expect(methods).toEqual(['tools/list', 'resources/read', 'prompts/get', 'completion/complete', 'logging/setLevel', 'ping']);
    // prompts/get carried the name + arguments
    expect(transport.sent[2].params.name).toBe('greeting');
    expect(transport.sent[2].params.arguments).toEqual({ name: 'Ada' });
  });
});

describe('M1 — client filters tools with invalid x-mcp-header annotations (§9.5.1)', () => {
  it('drops a tool whose x-mcp-header annotates a non-annotatable type, keeps valid tools', async () => {
    const { client } = connected((method) =>
      method === 'tools/list'
        ? {
            resultType: 'complete',
            tools: [
              { name: 'good', inputSchema: { type: 'object' } },
              { name: 'bad', inputSchema: { type: 'object', properties: { x: { type: 'object', 'x-mcp-header': 'X' } } } },
            ],
          }
        : { resultType: 'complete' },
    );
    const r = await client.listTools();
    expect((r.tools as any[]).map((t) => t.name)).toEqual(['good']);
  });
});

describe('C4 — pagination auto-iteration', () => {
  it('follows nextCursor across pages', async () => {
    const { client } = connected((method, params) => {
      if (method !== 'tools/list') return { resultType: 'complete' };
      if (!params.cursor) return { resultType: 'complete', tools: [{ name: 'a' }, { name: 'b' }], nextCursor: 'p2' };
      return { resultType: 'complete', tools: [{ name: 'c' }] };
    });
    const names: string[] = [];
    for await (const t of client.listAllTools()) names.push((t as { name: string }).name);
    expect(names).toEqual(['a', 'b', 'c']);
  });
});

describe('C7 — capability guards', () => {
  it('reflects discovered server capabilities', async () => {
    const { client } = connected((method) =>
      method === 'server/discover'
        ? {
            resultType: 'complete',
            supportedVersions: ['2026-07-28'],
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: 's', version: '1' },
          }
        : { resultType: 'complete' },
    );
    await client.discover();
    expect(client.serverSupports('tools')).toBe(true);
    expect(client.serverSupports('prompts')).toBe(false);
    expect(() => client.assertServerCapability('tools')).not.toThrow();
    expect(() => client.assertServerCapability('prompts')).toThrow(RequestError);
  });
});

describe('C5 — tasks client helpers', () => {
  it('createTask returns a CreateTaskResult; poll returns the terminal DetailedTask with inline result', async () => {
    let polls = 0;
    const { client, transport } = connected((method) => {
      // The augmented tools/call returns a CreateTaskResult (flattened Task + resultType:"task").
      if (method === 'tools/call') return { resultType: 'task', taskId: 't1', status: 'working' };
      // tasks/get returns a DetailedTask; the outcome is INLINE once terminal (§25.7) — no tasks/result.
      if (method === 'tasks/get')
        return ++polls >= 2
          ? { resultType: 'complete', taskId: 't1', status: 'completed', result: { content: [{ type: 'text', text: 'done' }] } }
          : { resultType: 'complete', taskId: 't1', status: 'working' };
      return { resultType: 'complete' };
    });

    const handle = await client.createTask('long_job', { steps: 2 }, { ttlMs: 1000 });
    expect((handle as any).taskId).toBe('t1');
    expect((handle as any).resultType).toBe('task');
    // augmented call carried task.ttl
    expect(transport.sent[0].params.task).toEqual({ ttl: 1000 });

    const finalTask = await client.pollTaskUntilTerminal('t1', { intervalMs: 1 });
    expect(finalTask.status).toBe('completed');
    expect(((finalTask.result as any).content as any[])[0].text).toBe('done');
  });
});

describe('C2 — multi-round-trip (input-required) driver', () => {
  it('fulfills an input_required result via a registered handler, then completes', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo, { capabilities: { elicitation: {} } });
    client.connect(transport);
    client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { name: 'Ada' } }));

    transport.onSend = (m) => {
      if (m.id === undefined) return;
      if (m.method === 'tools/call' && !m.params.inputResponses) {
        // First call → ask for input.
        transport.inject({
          jsonrpc: '2.0',
          id: m.id,
          result: {
            resultType: 'input_required',
            inputRequests: { who: { method: 'elicitation/create', params: { mode: 'form' } } },
            requestState: 'state-1',
          },
        });
      } else {
        // Retry carrying inputResponses + requestState → complete.
        transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', content: [{ type: 'text', text: 'ok' }] } });
      }
    };

    const result = await client.requestWithInput({ method: 'tools/call', params: { name: 'register_user' } });
    expect((result.content as any[])[0].text).toBe('ok');

    // The retry echoed the requestState and supplied the fulfilled input.
    const retry = transport.sent.find((m) => m.params?.inputResponses);
    expect(retry.params.requestState).toBe('state-1');
    expect(retry.params.inputResponses.who).toEqual({ action: 'accept', content: { name: 'Ada' } });
  });
});
