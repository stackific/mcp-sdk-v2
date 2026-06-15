/**
 * Tests for the SDK server runtime: the McpServer dispatcher and the Web-standard
 * Streamable HTTP request handler — including the SSE response shape and a full
 * server→client (elicitation) round-trip driven by the in-SDK Client.
 */
import { describe, it, expect } from 'vitest';
import { McpServer, ServerError } from '../../server/server.js';
import { createMcpRequestHandler } from '../../server/streamable-http.js';
import { Client } from '../../client/client.js';
import { StreamableHTTPClientTransport } from '../../client/streamable-http.js';

function makeServer(): McpServer {
  const server = new McpServer({ name: 'test-server', version: '1.0.0' }, { tools: {}, elicitation: {} });
  server.registerTool(
    'add',
    { description: 'adds', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } },
    async (args) => ({ content: [{ type: 'text', text: String((args.a as number) + (args.b as number)) }] }),
  );
  server.registerTool('register_user', {}, async (_args, ctx) => {
    const elicited = await ctx.elicitInput({ mode: 'form' });
    return { content: [{ type: 'text', text: 'done' }], structuredContent: elicited };
  });
  return server;
}

describe('McpServer dispatch', () => {
  const noStreamCtx = {
    protocolVersion: '2026-07-28',
    requestId: 1,
    meta: {},
    signal: new AbortController().signal,
    notify() {},
    serverRequest: async () => ({}),
  };

  it('lists tools and validates tools/call arguments', async () => {
    const server = makeServer();
    const list = await server.dispatch('tools/list', {}, noStreamCtx);
    expect((list.tools as any[]).map((t) => t.name)).toContain('add');

    const ok = await server.dispatch('tools/call', { name: 'add', arguments: { a: 2, b: 3 } }, noStreamCtx);
    expect((ok.content as any[])[0].text).toBe('5');

    await expect(
      server.dispatch('tools/call', { name: 'add', arguments: { a: 'x' } }, noStreamCtx),
    ).rejects.toBeInstanceOf(ServerError);
  });

  it('answers server/discover with supportedVersions + serverInfo', async () => {
    const result = await makeServer().dispatch('server/discover', {}, noStreamCtx);
    expect(result.supportedVersions).toEqual(['2026-07-28']);
    expect((result.serverInfo as any).name).toBe('test-server');
  });

  it('rejects an unknown method with -32601', async () => {
    await expect(makeServer().dispatch('does/not/exist', {}, noStreamCtx)).rejects.toMatchObject({ code: -32601 });
  });
});

describe('createMcpRequestHandler — Web fetch handler', () => {
  const envelope = {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  };

  function post(body: unknown, headerOverrides?: Record<string, string | null>): Request {
    const b = body as any;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': b.method,
    };
    // Mirror the routing name for the targeted methods (§9.4.2).
    if (b.method === 'tools/call' || b.method === 'prompts/get') headers['mcp-name'] = b.params?.name;
    else if (b.method === 'resources/read') headers['mcp-name'] = b.params?.uri;
    for (const [k, v] of Object.entries(headerOverrides ?? {})) {
      if (v === null) delete headers[k];
      else headers[k] = v;
    }
    return new Request('http://srv.test/mcp', { method: 'POST', headers, body: JSON.stringify(body) });
  }

  it('answers a non-streaming tools/call with a single JSON response (200)', async () => {
    const handle = createMcpRequestHandler(makeServer());
    const res = await handle(post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add', arguments: { a: 4, b: 5 }, ...envelope } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as any;
    expect(body.id).toBe(1);
    expect(body.result.content[0].text).toBe('9');
    expect(body.result.resultType).toBe('complete');
  });

  it('maps a dispatch error to the §9.7 HTTP status as a single JSON response (C4)', async () => {
    const handle = createMcpRequestHandler(makeServer());
    // Unknown method → -32601 → 404.
    const nf = await handle(post({ jsonrpc: '2.0', id: 1, method: 'does/not/exist', params: { ...envelope } }));
    expect(nf.status).toBe(404);
    expect(((await nf.json()) as any).error.code).toBe(-32601);
    // Unknown tool → -32602 → 400.
    const bad = await handle(post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nope', arguments: {}, ...envelope } }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.code).toBe(-32602);
  });

  it('returns 202 for a client notification', async () => {
    const handle = createMcpRequestHandler(makeServer());
    const res = await handle(post({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }));
    expect(res.status).toBe(202);
  });

  it('returns a 404 for a non-MCP path', async () => {
    const handle = createMcpRequestHandler(makeServer());
    const res = await handle(new Request('http://srv.test/nope', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(404);
  });

  it('rejects GET and DELETE with 405 (stateless, §9.9)', async () => {
    const handle = createMcpRequestHandler(makeServer());
    expect((await handle(new Request('http://srv.test/mcp', { method: 'GET' }))).status).toBe(405);
    expect((await handle(new Request('http://srv.test/mcp', { method: 'DELETE' }))).status).toBe(405);
  });

  it('does not advertise Mcp-Session-Id in CORS allow-headers (§9.9)', async () => {
    const handle = createMcpRequestHandler(makeServer());
    const res = await handle(new Request('http://srv.test/mcp', { method: 'OPTIONS' }));
    expect(res.headers.get('access-control-allow-headers') ?? '').not.toMatch(/Mcp-Session-Id/i);
  });

  it('rejects a missing required / routing header or _meta with the §9.7 status', async () => {
    const handle = createMcpRequestHandler(makeServer());
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add', arguments: { a: 1, b: 2 }, ...envelope } };

    const noName = await handle(post(call, { 'mcp-name': null }));
    expect(noName.status).toBe(400);
    expect(((await noName.json()) as any).error.code).toBe(-32001);

    expect((await handle(post(call, { 'content-type': 'text/plain' }))).status).toBe(400);
    expect((await handle(post(call, { accept: 'application/json' }))).status).toBe(400);

    const noMeta = await handle(
      post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add', arguments: { a: 1, b: 2 } } }),
    );
    expect(noMeta.status).toBe(400);
    expect(((await noMeta.json()) as any).error.code).toBe(-32602);
  });

  it('validates Origin by default: same-origin/no-Origin pass, cross-origin needs the allowlist (§9.11)', async () => {
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add', arguments: { a: 1, b: 2 }, ...envelope } };
    // Default-on (no allowedOrigins): a cross-origin browser Origin is rejected; same-origin + no-Origin pass.
    const def = createMcpRequestHandler(makeServer());
    expect((await def(post(call))).status).toBe(200); // no Origin (non-browser)
    expect((await def(post(call, { origin: 'http://srv.test' }))).status).toBe(200); // same-origin
    expect((await def(post(call, { origin: 'https://evil.test' }))).status).toBe(403); // cross-origin
    // An explicit allowlist admits the listed cross-origin; others still 403.
    const allow = createMcpRequestHandler(makeServer(), { allowedOrigins: ['https://ok.test'] });
    expect((await allow(post(call, { origin: 'https://ok.test' }))).status).toBe(200);
    expect((await allow(post(call, { origin: 'https://evil.test' }))).status).toBe(403);
    // '*' allows any origin.
    const any = createMcpRequestHandler(makeServer(), { allowedOrigins: ['*'] });
    expect((await any(post(call, { origin: 'https://anywhere.test' }))).status).toBe(200);
  });
});

describe('end-to-end — in-SDK Client drives in-SDK server over the Web handler', () => {
  it('runs a tools/call that solicits input via the §11 input_required + retry loop', async () => {
    const handle = createMcpRequestHandler(makeServer());
    // Bridge the client transport's fetch directly to the server handler (same isolate).
    const fakeFetch = ((url: string, init: RequestInit) =>
      handle(new Request(url, init))) as unknown as typeof fetch;

    const transport = new StreamableHTTPClientTransport('http://srv.test/mcp', { fetch: fakeFetch });
    const client = new Client({ name: 'c', version: '1' }, { capabilities: { elicitation: {} } });
    client.connect(transport);
    client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { name: 'Ada' } }));

    // register_user solicits elicitation → the server returns an input_required result,
    // which requestWithInput fulfills (via the registered handler) and retries to completion.
    const result = await client.requestWithInput({ method: 'tools/call', params: { name: 'register_user' } });
    expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
    expect(result.structuredContent).toEqual({ action: 'accept', content: { name: 'Ada' } });

    const sum = await client.callTool({ name: 'add', arguments: { a: 10, b: 20 } });
    expect((sum.content as any[])[0].text).toBe('30');

    await client.close();
  });
});
