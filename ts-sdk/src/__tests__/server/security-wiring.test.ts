/**
 * P0-2 (S14/S15, §9.5) + P0-5 (S44, §28) — the security MUSTs the SDK now ENFORCES
 * at the runtime seam, not merely offers as library helpers. Each test drives the
 * real `McpServer.dispatch` / `createMcpRequestHandler`, so a regression that
 * un-wires a validator fails here even though the isolated helper still passes.
 */
import { describe, it, expect } from 'vitest';
import { McpServer, type RequestContext } from '../../server/server.js';
import { createMcpRequestHandler } from '../../server/streamable-http.js';

const ctx: RequestContext = {
  protocolVersion: '2026-07-28',
  requestId: 1,
  meta: {},
  signal: new AbortController().signal,
  notify() {},
  serverRequest: async () => ({}),
};

const envelope = {
  _meta: {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
    'io.modelcontextprotocol/clientCapabilities': {},
  },
};

describe('P0-2 — server validates a tools/call Mcp-Param-* headers against the body (§9.5.4)', () => {
  function handlerWithRegionTool() {
    const server = new McpServer({ name: 's', version: '1' }, { tools: {} });
    server.registerTool(
      'lookup',
      {
        inputSchema: {
          type: 'object',
          properties: { region: { type: 'string', 'x-mcp-header': 'Region' } },
          required: ['region'],
        },
      },
      async (a) => ({ content: [{ type: 'text', text: String(a.region) }] }),
    );
    return createMcpRequestHandler(server);
  }

  function post(headers: Record<string, string>, body: unknown): Request {
    return new Request('http://srv.test/mcp', { method: 'POST', headers, body: JSON.stringify(body) });
  }

  const baseHeaders: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': 'tools/call',
    'mcp-name': 'lookup',
  };
  const callBody = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lookup', arguments: { region: 'us' }, ...envelope } };

  it('accepts a matching Mcp-Param-* header (200)', async () => {
    const res = await handlerWithRegionTool()(post({ ...baseHeaders, 'mcp-param-region': 'us' }, callBody));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).result.content[0].text).toBe('us');
  });

  it('rejects a FORGED Mcp-Param-* header that disagrees with the body (400 + -32001)', async () => {
    const res = await handlerWithRegionTool()(post({ ...baseHeaders, 'mcp-param-region': 'eu' }, callBody));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe(-32001);
  });

  it('rejects a MISSING Mcp-Param-* header while the body value is present (400 + -32001)', async () => {
    const res = await handlerWithRegionTool()(post({ ...baseHeaders }, callBody));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe(-32001);
  });
});

describe('P0-5 — §28 MUSTs enforced by the runtime', () => {
  it('sanitizes control sequences from tool-output text before returning it (R-28.3-i)', async () => {
    const server = new McpServer({ name: 's', version: '1' }, { tools: {} });
    // The tool smuggles an ESC (0x1b), a NUL (0x00), and a BEL (0x07) into its output,
    // while keeping ordinary whitespace (\t, \n) which MUST be preserved.
    server.registerTool('noisy', {}, async () => ({
      content: [{ type: 'text', text: 'a\x1bb\x00c\x07d\tok\n' }],
    }));
    const r = await server.dispatch('tools/call', { name: 'noisy' }, ctx);
    const text = (r.content as any[])[0].text as string;
    expect(text).toBe('abcd\tok\n'); // control chars stripped; \t and \n preserved
    // eslint-disable-next-line no-control-regex
    expect(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)).toBe(false);
  });

  it('rate-limits tools/call and rejects the over-limit call with -32600 (R-28.3-g/h)', async () => {
    const server = new McpServer(
      { name: 's', version: '1' },
      { tools: {} },
      { toolCallRateLimit: { maxInWindow: 1, windowMs: 60_000 } },
    );
    server.registerTool('ping', {}, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    // First call within the window succeeds; the second from the same caller is rejected.
    await expect(server.dispatch('tools/call', { name: 'ping' }, ctx)).resolves.toMatchObject({ resultType: 'complete' });
    await expect(server.dispatch('tools/call', { name: 'ping' }, ctx)).rejects.toMatchObject({ code: -32600 });
  });

  it('rejects an oversized argument payload before validation (R-28.10-l)', async () => {
    const server = new McpServer({ name: 's', version: '1' }, { tools: {} });
    server.registerTool('big', { inputSchema: { type: 'object', properties: { blob: { type: 'string' } } } }, async () => ({ content: [] }));
    // A payload larger than the default 4 MiB bound is rejected, not executed.
    const huge = 'x'.repeat(5 * 1024 * 1024);
    await expect(server.dispatch('tools/call', { name: 'big', arguments: { blob: huge } }, ctx)).rejects.toMatchObject({ code: -32602 });
  });

  it('bounds schema nesting depth before validation (R-28.10-k)', async () => {
    const server = new McpServer({ name: 's', version: '1' }, { tools: {} });
    // Build an object schema nested far beyond the default depth bound (64).
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 90; i++) schema = { type: 'object', properties: { nested: schema } };
    server.registerTool('deep', { inputSchema: schema }, async () => ({ content: [] }));
    await expect(server.dispatch('tools/call', { name: 'deep', arguments: {} }, ctx)).rejects.toMatchObject({ code: -32602 });
  });

  it('rejects a file:// resource path that escapes the authorized root (R-28.10-o/p)', async () => {
    const server = new McpServer({ name: 's', version: '1' }, { resources: {} }, { fileResourceRoot: '/srv/data' });
    server.registerResource('ok', 'file:///srv/data/ok.txt', {}, async (uri) => ({
      contents: [{ uri, mimeType: 'text/plain', text: 'hello' }],
    }));
    // An in-root file reads normally…
    const ok = await server.dispatch('resources/read', { uri: 'file:///srv/data/ok.txt' }, ctx);
    expect((ok.contents as any[])[0].text).toBe('hello');
    // …a traversal that escapes the root is rejected BEFORE any reader runs.
    await expect(
      server.dispatch('resources/read', { uri: 'file:///srv/data/../../etc/passwd' }, ctx),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it('validates a resource URI against the access policy + SSRF guard before deref (R-28.10-f/g/h)', async () => {
    const server = new McpServer(
      { name: 's', version: '1' },
      { resources: {} },
      { resourceAccess: { isAuthorizedLocation: (url) => url.hostname === 'allowed.test', guardSsrf: true } },
    );
    server.registerResource('doc', 'https://allowed.test/doc', {}, async (uri) => ({
      contents: [{ uri, mimeType: 'text/plain', text: 'doc' }],
    }));
    server.registerResource('loopback', 'http://127.0.0.1/secret', {}, async (uri) => ({
      contents: [{ uri, mimeType: 'text/plain', text: 'secret' }],
    }));
    // Authorized, non-SSRF location reads normally.
    const ok = await server.dispatch('resources/read', { uri: 'https://allowed.test/doc' }, ctx);
    expect((ok.contents as any[])[0].text).toBe('doc');
    // Unauthorized location is rejected before dereference.
    await expect(
      server.dispatch('resources/read', { uri: 'https://evil.test/doc' }, ctx),
    ).rejects.toMatchObject({ code: -32602 });
    // A registered loopback URI is still rejected by the SSRF guard.
    await expect(
      server.dispatch('resources/read', { uri: 'http://127.0.0.1/secret' }, ctx),
    ).rejects.toMatchObject({ code: -32602 });
  });
});
