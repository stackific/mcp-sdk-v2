/**
 * Wire-conformance tests for the McpServer runtime (FINAL_REVIEW C1/C2).
 *
 * Unlike the field-spot-checks elsewhere, these assert that the *actual bytes the
 * runtime emits* validate against the SDK's own result SCHEMAS — i.e. that every
 * result carries the REQUIRED `resultType` (§3.6) and that the five cacheable
 * methods carry top-level `ttlMs` + `cacheScope` (§13.4). Before C1/C2 the live
 * server emitted neither, so these results would have failed their own schemas.
 */
import { describe, it, expect } from 'vitest';
import { McpServer, ServerError, type RequestContext, type McpServerOptions } from '../../server/server.js';
import { ListToolsResultSchema } from '../../protocol/tools.js';
import { CallToolResultSchema } from '../../protocol/tools-call.js';
import { ListResourcesResultSchema, ListResourceTemplatesResultSchema } from '../../protocol/resources.js';
import { ReadResourceResultSchema } from '../../protocol/resources-read.js';
import { ListPromptsResultSchema, GetPromptResultSchema } from '../../protocol/prompts.js';
import { CompleteResultSchema } from '../../protocol/completion.js';
import { CACHEABLE_METHODS, isCacheHintValid } from '../../protocol/caching.js';
import { uiToolResult, uiResource } from '../../server/ui.js';
import { UI_MIME_TYPE, ToolUiMetaSchema } from '../../protocol/ui.js';

const ctx: RequestContext = {
  protocolVersion: '2026-07-28',
  requestId: 1,
  meta: {},
  signal: new AbortController().signal,
  notify() {},
  serverRequest: async () => ({}),
};

function buildServer(opts?: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'wire', version: '1.0.0' },
    { tools: {}, resources: {}, prompts: {}, completions: {} },
    opts,
  );
  server.registerTool(
    'echo',
    { description: 'echoes', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    async (a) => ({ content: [{ type: 'text', text: String(a.text) }] }),
  );
  server.registerResource('readme', 'docs://readme', { mimeType: 'text/markdown' }, async (uri) => ({
    contents: [{ uri, mimeType: 'text/markdown', text: '# hi' }],
  }));
  server.registerResourceTemplate(
    'city',
    { uriTemplate: 'weather://{city}', complete: { city: (v) => ['oslo', 'osaka'].filter((c) => c.startsWith(v)) } },
    async (uri, vars) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(vars) }] }),
  );
  server.registerPrompt(
    'greeting',
    {
      description: 'greets',
      arguments: [
        { name: 'name', required: true },
        { name: 'language', complete: (v) => ['english'].filter((l) => l.startsWith(v)) },
      ],
    },
    async (a) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Hi ${a.name}` } }] }),
  );
  return server;
}

describe('runtime wire conformance — results validate against their schemas', () => {
  it('tools/list result is a valid ListToolsResult (resultType + ttlMs + cacheScope)', async () => {
    const r = await buildServer().dispatch('tools/list', {}, ctx);
    expect(() => ListToolsResultSchema.parse(r)).not.toThrow();
    expect(r.resultType).toBe('complete');
    expect(isCacheHintValid(r.ttlMs, r.cacheScope)).toBe(true);
  });

  it('tools/call result is a valid CallToolResult (resultType, no cache hints)', async () => {
    const r = await buildServer().dispatch('tools/call', { name: 'echo', arguments: { text: 'hi' } }, ctx);
    expect(() => CallToolResultSchema.parse(r)).not.toThrow();
    expect(r.resultType).toBe('complete');
    expect(CACHEABLE_METHODS.has('tools/call' as never)).toBe(false);
    expect('ttlMs' in r).toBe(false);
  });

  it('resources/list, resources/templates/list, resources/read carry valid cache hints', async () => {
    const server = buildServer();
    const list = await server.dispatch('resources/list', {}, ctx);
    expect(() => ListResourcesResultSchema.parse(list)).not.toThrow();
    const tpls = await server.dispatch('resources/templates/list', {}, ctx);
    expect(() => ListResourceTemplatesResultSchema.parse(tpls)).not.toThrow();
    const read = await server.dispatch('resources/read', { uri: 'docs://readme' }, ctx);
    expect(() => ReadResourceResultSchema.parse(read)).not.toThrow();
    for (const r of [list, tpls, read]) expect(isCacheHintValid(r.ttlMs, r.cacheScope)).toBe(true);
  });

  it('prompts/list, prompts/get, completion/complete are valid', async () => {
    const server = buildServer();
    const list = await server.dispatch('prompts/list', {}, ctx);
    expect(() => ListPromptsResultSchema.parse(list)).not.toThrow();
    const get = await server.dispatch('prompts/get', { name: 'greeting', arguments: { name: 'Ada' } }, ctx);
    expect(() => GetPromptResultSchema.parse(get)).not.toThrow();
    const comp = await server.dispatch(
      'completion/complete',
      { ref: { type: 'ref/prompt', name: 'greeting' }, argument: { name: 'language', value: 'e' } },
      ctx,
    );
    expect(() => CompleteResultSchema.parse(comp)).not.toThrow();
    expect(get.resultType).toBe('complete');
    expect(comp.resultType).toBe('complete');
  });

  it('gates features on advertised capabilities — undeclared → -32601 (C11)', async () => {
    // A server with NO tools/resources/prompts/completions capabilities, but a tool
    // is registered anyway: the gate must refuse the request.
    const server = new McpServer({ name: 'nocaps', version: '1' }, {});
    server.registerTool('echo', {}, async () => ({ content: [] }));
    await expect(server.dispatch('tools/list', {}, ctx)).rejects.toMatchObject({ code: -32601 });
    await expect(server.dispatch('tools/call', { name: 'echo' }, ctx)).rejects.toMatchObject({ code: -32601 });
    await expect(server.dispatch('resources/list', {}, ctx)).rejects.toMatchObject({ code: -32601 });
    await expect(server.dispatch('prompts/list', {}, ctx)).rejects.toMatchObject({ code: -32601 });
    await expect(
      server.dispatch('completion/complete', { ref: { type: 'ref/prompt', name: 'x' }, argument: { name: 'a', value: '' } }, ctx),
    ).rejects.toMatchObject({ code: -32601 });
    // With the capability declared, the same call is answered.
    const ok = new McpServer({ name: 'caps', version: '1' }, { tools: {} });
    ok.registerTool('echo', {}, async () => ({ content: [] }));
    expect((await ok.dispatch('tools/list', {}, ctx)).resultType).toBe('complete');
  });

  it('rejects structuredContent that violates a tool outputSchema with -32603 (C12)', async () => {
    const server = new McpServer({ name: 'out', version: '1' }, { tools: {} });
    server.registerTool(
      'weather',
      { outputSchema: { type: 'object', properties: { tempC: { type: 'number' } }, required: ['tempC'] } },
      async () => ({ content: [], structuredContent: { tempC: 'not-a-number' } }),
    );
    await expect(server.dispatch('tools/call', { name: 'weather' }, ctx)).rejects.toBeInstanceOf(ServerError);
    await expect(server.dispatch('tools/call', { name: 'weather' }, ctx)).rejects.toMatchObject({ code: -32603 });

    // Conforming structuredContent passes and is a valid CallToolResult.
    server.registerTool(
      'weather2',
      { outputSchema: { type: 'object', properties: { tempC: { type: 'number' } }, required: ['tempC'] } },
      async () => ({ content: [], structuredContent: { tempC: 21 } }),
    );
    const r = await server.dispatch('tools/call', { name: 'weather2' }, ctx);
    expect(() => CallToolResultSchema.parse(r)).not.toThrow();
  });

  it('MCP Apps UI helper declares _meta.ui.resourceUri + text/html;profile=mcp-app (C7)', () => {
    const r = uiToolResult('ui://counter', '<h1>hi</h1>', { text: 'Launch' });
    const ui = (r._meta as any).ui;
    expect(() => ToolUiMetaSchema.parse(ui)).not.toThrow();
    expect(ui.resourceUri).toBe('ui://counter');
    expect((r._meta as any)['mcp.io/ui']).toBeUndefined(); // the wrong legacy key is gone
    const res = (r.content as any[]).find((c) => c.type === 'resource').resource;
    expect(res.mimeType).toBe(UI_MIME_TYPE);
    expect(res.uri).toBe('ui://counter');
    expect(uiResource('ui://x', '<p/>').mimeType).toBe(UI_MIME_TYPE);
    expect(() => uiResource('https://evil.test', '<p/>')).toThrow(); // non-ui:// rejected
  });

  it('rejects a resources/read that returns empty contents (-32603, §17.5)', async () => {
    const server = new McpServer({ name: 's', version: '1' }, { resources: {} });
    server.registerResource('empty', 'docs://empty', {}, async () => ({ contents: [] }));
    await expect(server.dispatch('resources/read', { uri: 'docs://empty' }, ctx)).rejects.toMatchObject({ code: -32603 });
  });

  it('a tool that solicits input returns an input_required result, resolved by retry (C6, §11)', async () => {
    const server = new McpServer({ name: 's', version: '1' }, { tools: {}, elicitation: {} });
    server.registerTool('ask', {}, async (_a, c) => {
      const r = await c.elicitInput({ mode: 'form', message: 'hi' });
      return { content: [{ type: 'text', text: String((r as any).action) }] };
    });
    // First call → input_required carrying an elicitation inputRequest + a requestState
    // (NOT a server-initiated JSON-RPC request).
    const r1 = await server.dispatch('tools/call', { name: 'ask', arguments: {} }, ctx);
    expect(r1.resultType).toBe('input_required');
    const reqs = r1.inputRequests as Record<string, any>;
    const key = Object.keys(reqs)[0]!;
    expect(reqs[key].method).toBe('elicitation/create');
    expect(reqs[key].params.mode).toBe('form');
    expect(typeof r1.requestState).toBe('string');
    // Retry echoing requestState + the supplied input → completes.
    const r2 = await server.dispatch(
      'tools/call',
      { name: 'ask', arguments: {}, inputResponses: { [key]: { action: 'accept' } }, requestState: r1.requestState },
      ctx,
    );
    expect(r2.resultType).toBe('complete');
    expect((r2.content as any[])[0].text).toBe('accept');
  });

  it('rejects a missing required prompt arg and unknown completion refs with -32602 (M3)', async () => {
    const server = buildServer();
    await expect(server.dispatch('prompts/get', { name: 'greeting', arguments: {} }, ctx)).rejects.toMatchObject({ code: -32602 });
    await expect(
      server.dispatch('completion/complete', { ref: { type: 'ref/prompt', name: 'nope' }, argument: { name: 'language', value: '' } }, ctx),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      server.dispatch('completion/complete', { ref: { type: 'ref/prompt', name: 'greeting' }, argument: { name: 'xyz', value: '' } }, ctx),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      server.dispatch('completion/complete', { ref: { type: 'ref/bogus' }, argument: { name: 'a', value: '' } }, ctx),
    ).rejects.toMatchObject({ code: -32602 });
    const ok = await server.dispatch(
      'completion/complete',
      { ref: { type: 'ref/prompt', name: 'greeting' }, argument: { name: 'language', value: 'e' } },
      ctx,
    );
    expect((ok.completion as any).values).toEqual(['english']);
  });

  it('a non-caching server still emits ttlMs:0 / private; options override the defaults', async () => {
    const def = await buildServer().dispatch('tools/list', {}, ctx);
    expect(def.ttlMs).toBe(0);
    expect(def.cacheScope).toBe('private');

    const tuned = await buildServer({ cacheTtlMs: 60000, cacheScope: 'public' }).dispatch('resources/list', {}, ctx);
    expect(tuned.ttlMs).toBe(60000);
    expect(tuned.cacheScope).toBe('public');
  });
});
