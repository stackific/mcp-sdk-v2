/**
 * P1-1 (S16, §10) — subscriptions over the stdio runtime (`serveStdio`).
 *
 * Drives the real in-SDK Client against a server served by `serveStdio` over an
 * in-memory transport pair, asserting that a `subscriptions/listen` on stdio:
 *   - returns the mandatory acknowledgement with the honored subset;
 *   - fans out ONLY the honored change-notification kinds, each tagged with its
 *     `io.modelcontextprotocol/subscriptionId`;
 *   - tears down on `notifications/cancelled` (unsubscribe);
 *   - rejects a `taskIds` opt-in from a client that did not negotiate Tasks (-32003).
 */
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '../../server/server.js';
import { serveStdio } from '../../server/stdio.js';
import { Client } from '../../client/client.js';
import { createInMemoryTransportPair } from '../../transport/in-memory.js';
import { connectInMemory } from '../../testing/in-memory.js';
import { TASKS_EXTENSION_ID } from '../../protocol/tasks.js';

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'stdio-subs', version: '1.0.0' },
    { tools: {}, resources: { listChanged: true }, prompts: { listChanged: true }, extensions: { [TASKS_EXTENSION_ID]: {} } },
  );
  // A tool that broadcasts two change notifications to subscribers.
  server.registerTool('mutate', {}, async (_args, ctx) => {
    ctx.notifySubscribers({ method: 'notifications/resources/list_changed' });
    ctx.notifySubscribers({ method: 'notifications/prompts/list_changed' });
    return { content: [{ type: 'text', text: 'mutated' }] };
  });
  return server;
}

describe('P1-1 — subscriptions over serveStdio (§10)', () => {
  it('acks the honored subset, delivers only filtered notifications, and tears down', async () => {
    const harness = connectInMemory(buildServer(), { name: 'c', version: '1' });
    const { client } = harness;

    const received: string[] = [];
    // Subscribe to resources-list-changed only → only that kind should arrive on stdio.
    const sub = await client.subscribe({ resourcesListChanged: true }, (method) => received.push(method));
    expect(sub.acknowledgedFilter.resourcesListChanged).toBe(true);
    expect(sub.acknowledgedFilter.promptsListChanged).toBeUndefined();
    expect(typeof sub.subscriptionId).toBe('string');

    await client.callTool({ name: 'mutate' });
    await vi.waitFor(() => expect(received).toContain('notifications/resources/list_changed'));
    // The unsubscribed kind is filtered out by the honored set, even on the shared channel.
    expect(received).not.toContain('notifications/prompts/list_changed');

    // Teardown: unsubscribe sends notifications/cancelled; the server stops delivering.
    await sub.unsubscribe();
    received.length = 0;
    await client.callTool({ name: 'mutate' });
    // Give any (erroneous) post-teardown delivery a chance to arrive, then assert none did.
    await new Promise((r) => setTimeout(r, 10));
    expect(received).not.toContain('notifications/resources/list_changed');

    await harness.close();
  });

  it('tags every delivered subscription notification with the subscriptionId (§10.4)', async () => {
    const harness = connectInMemory(buildServer(), { name: 'c', version: '1' });
    const { client } = harness;

    const params: Array<Record<string, unknown>> = [];
    const sub = await client.subscribe({ resourcesListChanged: true }, (_method, p) => params.push(p));
    await client.callTool({ name: 'mutate' });
    await vi.waitFor(() => expect(params.length).toBeGreaterThan(0));

    const meta = params[0]!['_meta'] as Record<string, unknown>;
    expect(meta['io.modelcontextprotocol/subscriptionId']).toBe(sub.subscriptionId);

    await harness.close();
  });

  it('rejects a taskIds opt-in from a client that did not negotiate Tasks with -32003 (§25.10 R-25.10-f)', async () => {
    // Server advertises Tasks; client declares no tasks extension → -32003 on stdio too.
    const harness = connectInMemory(buildServer(), { name: 'c', version: '1' });
    await expect(harness.client.subscribe({ taskIds: ['task-1'] }, () => {})).rejects.toMatchObject({ code: -32003 });
    await harness.close();
  });

  it('emits notifications/cancelled to active subscriptions on SERVER-initiated teardown (S16, R-10.7-b)', async () => {
    const [clientSide, serverSide] = createInMemoryTransportPair();
    const stop = serveStdio(buildServer(), serverSide);
    const client = new Client({ name: 'c', version: '1' });
    client.connect(clientSide);

    const cancellations: Array<Record<string, unknown>> = [];
    client.setNotificationHandler('notifications/cancelled', (params) => cancellations.push(params));

    const sub = await client.subscribe({ resourcesListChanged: true }, () => {});
    // Server tears the subscription down (e.g. on shutdown) by disposing serveStdio —
    // it MUST signal each active subscription to the client over the shared channel.
    stop();
    await vi.waitFor(() => expect(cancellations.length).toBeGreaterThan(0));
    expect(String(cancellations[0]!.requestId)).toBe(sub.subscriptionId);

    await client.close();
  });
});
