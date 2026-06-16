/**
 * Companion-app (backend) tests: exercise the real `mcp-client.ts` wiring — which
 * hosts the in-SDK `Client` over Streamable HTTP — against an in-SDK `McpServer`,
 * by stubbing the global `fetch` to route to that server's request handler. This
 * verifies discovery/status, tools/call round-trips, and that the backend's
 * server→client handlers (sampling, roots) are registered and respond.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { McpServer, createMcpRequestHandler } from '@stackific/mcp-sdk-ts/server';

// A fake MCP server whose tools exercise the backend's server→client handlers.
function buildFakeServer(): McpServer {
  const server = new McpServer(
    { name: 'fake-server', version: '9.9.9' },
    { tools: {}, sampling: {}, roots: {} },
  );
  server.registerTool(
    'add',
    {
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    },
    async (args) => ({
      content: [{ type: 'text', text: String((args.a as number) + (args.b as number)) }],
    }),
  );
  // Borrows the client's model → routes to the backend's sampling/createMessage handler.
  server.registerTool('summarize', {}, async (_args, ctx) => {
    const r = await ctx.createMessage({
      messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
      maxTokens: 16,
    });
    return {
      content: [
        { type: 'text', text: String((r as { content?: { text?: string } }).content?.text ?? '') },
      ],
    };
  });
  // Asks for workspace roots → routes to the backend's roots/list handler.
  server.registerTool('show_roots', {}, async (_args, ctx) => {
    const r = await ctx.listRoots();
    return { content: [{ type: 'text', text: JSON.stringify(r) }] };
  });
  return server;
}

const handle = createMcpRequestHandler(buildFakeServer());

beforeAll(() => {
  vi.stubGlobal('fetch', ((url: string, init: RequestInit) =>
    handle(new Request(url, init))) as unknown as typeof fetch);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// Imported after the stub helper is defined; the backend constructs its transport
// lazily on the first call, by which point beforeAll has installed the fetch stub.
const { api, getStatus } = await import('../mcp-client.js');

describe('backend mcp-client wiring', () => {
  it('connects + discovers, populating negotiated status', async () => {
    const tools = (await api.listTools()) as { tools: { name: string }[] };
    expect(tools.tools.map((t) => t.name)).toContain('add');
    const status = getStatus();
    expect(status.connected).toBe(true);
    expect(status.negotiatedVersion).toBe('2026-07-28');
    expect((status.serverInfo as { name?: string } | null)?.name).toBe('fake-server');
  });

  it('round-trips a tools/call', async () => {
    const result = (await api.callTool('add', { a: 2, b: 3 })) as { content: { text: string }[] };
    expect(result.content[0]!.text).toBe('5');
  });

  it('routes a server→client sampling request through the backend handler', async () => {
    const result = (await api.callTool('summarize', {})) as { content: { text: string }[] };
    // The backend's sampling handler returns a (mock, no key) SampleResult text.
    expect(typeof result.content[0]!.text).toBe('string');
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });

  it('routes a server→client roots/list request and returns the configured roots', async () => {
    const result = (await api.callTool('show_roots', {})) as { content: { text: string }[] };
    expect(result.content[0]!.text).toContain('companion-project');
  });
});
