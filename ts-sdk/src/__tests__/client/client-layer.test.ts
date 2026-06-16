/**
 * Tests for the higher-level client layer (proposal items):
 *  C1 typed convenience methods, C4 pagination auto-iteration, C5 tasks helpers,
 *  C7 capability guards, C2 multi-round-trip (input-required) driver.
 */
import { describe, it, expect, vi } from 'vitest';
import type { JSONRPCMessage } from '../../jsonrpc/framing.js';
import { type Transport, type TransportCloseInfo, type Unsubscribe } from '../../transport/contract.js';
import { Client, RequestError } from '../../client/index.js';
import { IncompatibleProtocolError } from '../../protocol/negotiation.js';

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
      if (method === 'server/discover') {
        return {
          resultType: 'complete',
          serverInfo: { name: 's', version: '1' },
          capabilities: { prompts: {}, completions: {} },
          supportedVersions: ['2026-07-28'],
        };
      }
      if (method === 'tools/list') return { resultType: 'complete', tools: [{ name: 'add' }] };
      return { resultType: 'complete' };
    });

    // prompts/* and completion/complete are gated on the advertised server capability
    // (§18.1-b / §19.1-c), so discover first to learn the server supports them.
    await client.discover();

    const tools = await client.listTools();
    expect(tools.tools).toEqual([{ name: 'add' }]);

    await client.readResource('docs://x');
    await client.getPrompt('greeting', { name: 'Ada' });
    await client.complete({ type: 'ref/prompt', name: 'greeting' }, { name: 'language', value: 'en' });
    await client.ping();

    const methods = transport.sent.map((m) => m.method);
    expect(methods).toEqual(['server/discover', 'tools/list', 'resources/read', 'prompts/get', 'completion/complete', 'ping']);
    // prompts/get carried the name + arguments.
    const promptsGet = transport.sent.find((m) => m.method === 'prompts/get');
    expect(promptsGet.params.name).toBe('greeting');
    expect(promptsGet.params.arguments).toEqual({ name: 'Ada' });
  });

  it('refuses prompts/* and completion/complete when the server did not advertise the capability (§18.1-b / §19.1-c)', async () => {
    // Server advertises tools only — prompts/completions are absent.
    const { client, transport } = connected((method) => {
      if (method === 'server/discover') {
        return {
          resultType: 'complete',
          serverInfo: { name: 's', version: '1' },
          capabilities: { tools: {} },
          supportedVersions: ['2026-07-28'],
        };
      }
      return { resultType: 'complete' };
    });
    await client.discover();

    await expect(client.getPrompt('greeting')).rejects.toMatchObject({ code: -32003 });
    await expect(client.listPrompts()).rejects.toMatchObject({ code: -32003 });
    await expect(
      client.complete({ type: 'ref/prompt', name: 'greeting' }, { name: 'a', value: '' }),
    ).rejects.toMatchObject({ code: -32003 });
    // The client never put an unsupported request on the wire (only the discover did).
    expect(transport.sent.map((m) => m.method)).toEqual(['server/discover']);
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

  it('emits a logger warning naming each dropped tool + reason (S14a, R-9.5.1-k)', async () => {
    const warnings: string[] = [];
    const transport = new StubTransport();
    const client = new Client(clientInfo, { logger: { warn: (m) => warnings.push(m) } });
    client.connect(transport);
    transport.onSend = (m) => {
      if (m.id === undefined) return;
      transport.inject({
        jsonrpc: '2.0',
        id: m.id,
        result: {
          resultType: 'complete',
          tools: [
            { name: 'good', inputSchema: { type: 'object' } },
            { name: 'bad', inputSchema: { type: 'object', properties: { x: { type: 'object', 'x-mcp-header': 'X' } } } },
          ],
        },
      });
    };
    const r = await client.listTools();
    expect((r.tools as any[]).map((t) => t.name)).toEqual(['good']);
    // Exactly one warning, naming the dropped tool.
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('bad');
  });
});

describe('S14b — client refreshes tools/list and retries a tools/call once on -32001 (§9.5.2, R-9.5.2-m)', () => {
  it('on a missing-header -32001, re-fetches the schema and retries the call exactly once', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);
    const methods: string[] = [];
    let callAttempts = 0;
    transport.onSend = (m) => {
      if (m.id === undefined) return;
      methods.push(m.method);
      if (m.method === 'tools/call') {
        callAttempts++;
        if (callAttempts === 1) {
          transport.inject({ jsonrpc: '2.0', id: m.id, error: { code: -32001, message: 'missing required Mcp-Param-Region header' } });
        } else {
          transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', content: [{ type: 'text', text: 'ok' }] } });
        }
      } else if (m.method === 'tools/list') {
        transport.inject({
          jsonrpc: '2.0',
          id: m.id,
          result: { resultType: 'complete', tools: [{ name: 'lookup', inputSchema: { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } } }] },
        });
      } else {
        transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete' } });
      }
    };
    const r = await client.callTool({ name: 'lookup', arguments: { region: 'us' } });
    expect((r.content as any[])[0].text).toBe('ok');
    // call (fails -32001) → tools/list (refresh) → call (succeeds) — retried exactly once.
    expect(methods).toEqual(['tools/call', 'tools/list', 'tools/call']);
    expect(callAttempts).toBe(2);
  });

  it('does NOT retry on a non-(-32001) error', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo);
    client.connect(transport);
    let callAttempts = 0;
    transport.onSend = (m) => {
      if (m.id === undefined) return;
      if (m.method === 'tools/call') {
        callAttempts++;
        transport.inject({ jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'bad args' } });
      }
    };
    await expect(client.callTool({ name: 'lookup' })).rejects.toMatchObject({ code: -32602 });
    expect(callAttempts).toBe(1); // no refresh/retry for unrelated errors
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

  it('treats nextCursor:"" as a PRESENT cursor — continues AND re-sends it verbatim (§12.3 R-12.3-d/e)', async () => {
    const sentCursors: Array<string | undefined> = [];
    const { client } = connected((method, params) => {
      if (method !== 'tools/list') return { resultType: 'complete' };
      sentCursors.push(params.cursor);
      // Page 1 ends with an EMPTY-STRING cursor (present → "more pages follow").
      if (params.cursor === undefined) return { resultType: 'complete', tools: [{ name: 'a' }], nextCursor: '' };
      // Page 2 (reached only if the client followed the "" cursor) ends the list.
      return { resultType: 'complete', tools: [{ name: 'b' }] };
    });
    const names: string[] = [];
    for await (const t of client.listAllTools()) names.push((t as { name: string }).name);
    // Both pages were iterated — the "" cursor was NOT treated as end-of-list…
    expect(names).toEqual(['a', 'b']);
    // …and the empty-string cursor was echoed back verbatim on the second request.
    expect(sentCursors).toEqual([undefined, '']);
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

  it('paces polling by the task pollIntervalMs and adapts when it changes mid-poll (S39/S40, R-25.4-d/e)', async () => {
    const states = [
      { taskId: 't1', status: 'working', pollIntervalMs: 5 },
      { taskId: 't1', status: 'working', pollIntervalMs: 20 },
      { taskId: 't1', status: 'completed', result: { content: [] } },
    ];
    let i = 0;
    const { client } = connected((method) =>
      method === 'tasks/get'
        ? { resultType: 'complete', ...states[Math.min(i++, states.length - 1)] }
        : { resultType: 'complete' },
    );
    // Capture the wait passed to setTimeout each round (run them instantly so the test is fast).
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any, ms?: number) => {
      delays.push(Number(ms ?? 0));
      return realSetTimeout(fn, 0);
    }) as any);
    try {
      const final = await client.pollTaskUntilTerminal('t1');
      expect(final.status).toBe('completed');
      // The inter-poll wait adopted each newly-advertised interval: 5 → 20.
      expect(delays).toEqual([5, 20]);
    } finally {
      spy.mockRestore();
    }
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

  it('backs off and retries on a load-shedding input_required result, echoing requestState (S17, §11.5 R-11.5-m–p)', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo, { capabilities: { elicitation: {} } });
    client.connect(transport);
    let calls = 0;
    const sentRequestStates: Array<unknown> = [];
    transport.onSend = (m) => {
      if (m.id === undefined || m.method !== 'tools/call') return;
      sentRequestStates.push(m.params?.requestState);
      if (++calls === 1) {
        // Load-shedding signal: input_required with a requestState but NO inputRequests.
        transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'input_required', requestState: 'shed-1' } });
      } else {
        transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', content: [{ type: 'text', text: 'ok' }] } });
      }
    };
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any, ms?: number) => {
      delays.push(Number(ms ?? 0));
      return realSetTimeout(fn, 0);
    }) as any);
    try {
      const result = await client.requestWithInput({ method: 'tools/call', params: { name: 'job' } });
      expect((result.content as any[])[0].text).toBe('ok');
      // It did NOT error on the load-shed; it backed off (computeRetryBackoffMs(1) = 250ms)…
      expect(delays).toEqual([250]);
      // …and the retry echoed the requestState verbatim (the first call carried none).
      expect(sentRequestStates).toEqual([undefined, 'shed-1']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('S45 RC-1 — client reacts to -32004 by reselecting the revision (§5.5, R-29.3-c)', () => {
  const versionOf = (m: any): string => m.params?._meta?.['io.modelcontextprotocol/protocolVersion'];

  it('reselects a mutually-supported revision and retries once, then succeeds', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo, { protocolVersions: ['2099-01-01', '2026-07-28'] });
    client.connect(transport);
    const tried: string[] = [];
    transport.onSend = (m) => {
      if (m.id === undefined) return;
      tried.push(versionOf(m));
      if (versionOf(m) === '2099-01-01') {
        // Server doesn't support the most-preferred revision → -32004 with its set.
        transport.inject({
          jsonrpc: '2.0',
          id: m.id,
          error: { code: -32004, message: 'unsupported', data: { supported: ['2026-07-28'], requested: '2099-01-01' } },
        });
      } else {
        transport.inject({ jsonrpc: '2.0', id: m.id, result: { resultType: 'complete', ok: true } });
      }
    };
    const r = await client.request({ method: 'ping' });
    expect(r).toMatchObject({ ok: true });
    // Tried the preferred revision, then the reselected one — exactly once each.
    expect(tried).toEqual(['2099-01-01', '2026-07-28']);
    expect(client.getNegotiatedVersion()).toBe('2026-07-28');
  });

  it('surfaces IncompatibleProtocolError (no loop) when no revision overlaps', async () => {
    const transport = new StubTransport();
    const client = new Client(clientInfo, { protocolVersions: ['2099-01-01'] });
    client.connect(transport);
    let calls = 0;
    transport.onSend = (m) => {
      if (m.id === undefined) return;
      calls++;
      transport.inject({
        jsonrpc: '2.0',
        id: m.id,
        error: { code: -32004, message: 'unsupported', data: { supported: ['2026-07-28'], requested: '2099-01-01' } },
      });
    };
    await expect(client.request({ method: 'ping' })).rejects.toBeInstanceOf(IncompatibleProtocolError);
    expect(calls).toBe(1); // it did NOT retry against a set it can't satisfy
  });
});
