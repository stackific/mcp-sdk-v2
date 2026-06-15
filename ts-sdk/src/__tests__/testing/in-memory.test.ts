/**
 * SH2 — the in-memory test-kit drives a real Client↔McpServer exchange (discover,
 * pagination, tools/call, and a server→client elicitation) entirely in memory.
 */
import { describe, it, expect } from 'vitest';
import { McpServer } from '../../server/server.js';
import { connectInMemory } from '../../testing/index.js';

function buildServer(): McpServer {
  const server = new McpServer({ name: 'kit-server', version: '1.0.0' }, { tools: {} }, { pageSize: 2 });
  server.registerTool(
    'add',
    { inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } },
    async (args) => ({ content: [{ type: 'text', text: String((args.a as number) + (args.b as number)) }] }),
  );
  server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'echo' }] }));
  server.registerTool('ask', {}, async (_args, ctx) => {
    const r = await ctx.elicitInput({ mode: 'form' });
    return { content: [{ type: 'text', text: String((r as { action?: string }).action) }] };
  });
  return server;
}

describe('SH2 — in-memory Client↔McpServer harness', () => {
  it('discovers, paginates, calls a tool, and runs a server→client elicitation', async () => {
    const { client, close } = connectInMemory(buildServer(), { name: 'c', version: '1' }, { capabilities: { elicitation: {} } });
    client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { ok: true } }));

    await client.discover();
    expect(client.getNegotiatedVersion()).toBe('2026-07-28');

    // pagination: pageSize 2 over 3 tools → two pages.
    const names: string[] = [];
    for await (const t of client.listAllTools()) names.push((t as { name: string }).name);
    expect(names.sort()).toEqual(['add', 'ask', 'echo']);

    const sum = await client.callTool({ name: 'add', arguments: { a: 2, b: 3 } });
    expect((sum.content as any[])[0].text).toBe('5');

    // `ask` solicits elicitation → input_required result, fulfilled + retried by requestWithInput.
    const elicited = await client.requestWithInput({ method: 'tools/call', params: { name: 'ask' } });
    expect((elicited.content as any[])[0].text).toBe('accept');

    await close();
  });
});
