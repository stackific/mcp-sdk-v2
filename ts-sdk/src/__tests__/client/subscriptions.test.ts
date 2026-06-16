/**
 * C6/S3 — subscriptions end-to-end (§10): the in-SDK Client subscribes over the
 * in-SDK server's Streamable HTTP handler (bridged via a fake fetch). Verifies the
 * ack (honored subset), filtered change-notification delivery via
 * `ctx.notifySubscribers`, and teardown on unsubscribe.
 */
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '../../server/server.js';
import { InMemoryTaskStore } from '../../server/tasks.js';
import { createMcpRequestHandler } from '../../server/streamable-http.js';
import { Client } from '../../client/client.js';
import { StreamableHTTPClientTransport } from '../../client/streamable-http.js';
import { TASKS_EXTENSION_ID } from '../../protocol/tasks.js';
import { buildPostHeaders } from '../../transport/http/headers.js';
import { CURRENT_PROTOCOL_VERSION } from '../../protocol/discovery.js';
import {
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from '../../protocol/meta.js';

/** Client capabilities that negotiate the Tasks extension under the spec key (§25.2). */
const TASKS_CAPS = { extensions: { [TASKS_EXTENSION_ID]: {} } };

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'subs-server', version: '1.0.0' },
    { tools: {}, resources: { listChanged: true }, prompts: { listChanged: true } },
  );
  // A tool that broadcasts a change notification to subscribers.
  server.registerTool('mutate', {}, async (_args, ctx) => {
    ctx.notifySubscribers({ method: 'notifications/resources/list_changed' });
    ctx.notifySubscribers({ method: 'notifications/prompts/list_changed' });
    return { content: [{ type: 'text', text: 'mutated' }] };
  });
  return server;
}

describe('C6/S3 — subscriptions', () => {
  it('acks the honored subset, delivers filtered notifications, and tears down', async () => {
    const handle = createMcpRequestHandler(buildServer());
    const fakeFetch = ((url: string, init: RequestInit) => handle(new Request(url, init))) as unknown as typeof fetch;
    const transport = new StreamableHTTPClientTransport('http://srv.test/mcp', { fetch: fakeFetch });
    const client = new Client({ name: 'c', version: '1' });
    client.connect(transport);

    const received: string[] = [];
    // Subscribe to resources-list-changed only (not prompts) → only that kind should arrive.
    const sub = await client.subscribe({ resourcesListChanged: true }, (method) => received.push(method));
    expect(sub.acknowledgedFilter.resourcesListChanged).toBe(true);

    await client.callTool({ name: 'mutate' });
    await vi.waitFor(() => expect(received).toContain('notifications/resources/list_changed'));
    // The unsubscribed kind is filtered out by the honored set.
    expect(received).not.toContain('notifications/prompts/list_changed');

    await sub.unsubscribe();
    await sub.closed; // resolves at teardown
    await client.close();
  });

  it('delivers notifications/tasks pushes to a taskIds subscriber that negotiated the extension (§25.10)', async () => {
    // Spec-correct capability shape: the Tasks extension lives under
    // `extensions['io.modelcontextprotocol/tasks']` on BOTH peers, not a bare `tasks` key.
    const server = new McpServer({ name: 'task-push', version: '1' }, { tools: {}, extensions: { [TASKS_EXTENSION_ID]: {} } });
    const store = new InMemoryTaskStore();
    server.setTaskStore(store);
    server.registerTool('job', { execution: { taskSupport: 'required' } }, async () => ({ task: store.createTask({ ttlMs: 60000 }) }));

    const handle = createMcpRequestHandler(server);
    const fakeFetch = ((url: string, init: RequestInit) => handle(new Request(url, init))) as unknown as typeof fetch;
    const transport = new StreamableHTTPClientTransport('http://srv.test/mcp', { fetch: fakeFetch });
    const client = new Client({ name: 'c', version: '1' }, { capabilities: TASKS_CAPS });
    client.connect(transport);

    const created = await client.createTask('job', {}, { ttlMs: 60000 });
    const taskId = (created as { taskId: string }).taskId;

    const received: Array<Record<string, unknown>> = [];
    const sub = await client.subscribe({ taskIds: [taskId] }, (method, params) => {
      if (method === 'notifications/tasks') received.push(params);
    });
    expect(sub.acknowledgedFilter.taskIds).toEqual([taskId]);

    // A status change pushes a DetailedTask to the subscriber. (§25.10)
    store.storeResult(taskId, { content: [{ type: 'text', text: 'done' }] });
    await vi.waitFor(() => expect(received.some((p) => p.status === 'completed')).toBe(true));
    expect(received[received.length - 1]!.taskId).toBe(taskId);

    await sub.unsubscribe();
    await client.close();
  });

  it('rejects a taskIds opt-in without the negotiated tasks capability with -32003 (§25.10 R-25.10-f, Gap A)', async () => {
    // The server advertises Tasks, but the CLIENT does not declare the extension in
    // its per-request capabilities → supplying `taskIds` MUST be rejected with -32003.
    const server = new McpServer({ name: 'task-srv', version: '1' }, { tools: {}, extensions: { [TASKS_EXTENSION_ID]: {} } });
    const handle = createMcpRequestHandler(server);
    const fakeFetch = ((url: string, init: RequestInit) => handle(new Request(url, init))) as unknown as typeof fetch;
    const transport = new StreamableHTTPClientTransport('http://srv.test/mcp', { fetch: fakeFetch });
    const client = new Client({ name: 'c', version: '1' }); // no tasks extension declared
    client.connect(transport);

    await expect(client.subscribe({ taskIds: ['task-1'] }, () => {})).rejects.toMatchObject({ code: -32003 });
    await client.close();
  });

  it('rejects subscriptions/listen taskIds with HTTP 400 + -32003 at the wire (§9.7, §25.10 Gap A)', async () => {
    // Wire-level assertion of the MUST: a bad-capability rejection maps to HTTP 400 (§9.7).
    const server = new McpServer({ name: 'task-srv', version: '1' }, { tools: {}, extensions: { [TASKS_EXTENSION_ID]: {} } });
    const handle = createMcpRequestHandler(server);

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'subscriptions/listen',
      params: {
        notifications: { taskIds: ['task-1'] },
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: CURRENT_PROTOCOL_VERSION,
          [CLIENT_INFO_META_KEY]: { name: 'c', version: '1' },
          [CLIENT_CAPABILITIES_META_KEY]: {}, // no tasks extension negotiated
        },
      },
    };
    const headers = buildPostHeaders({ protocolVersion: CURRENT_PROTOCOL_VERSION, method: body.method, params: body.params });
    const res = await handle(new Request('http://srv.test/mcp', { method: 'POST', headers, body: JSON.stringify(body) }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number; data?: { requiredExtension?: string } } };
    expect(json.error.code).toBe(-32003);
    expect(json.error.data?.requiredExtension).toBe(TASKS_EXTENSION_ID);
  });
});
