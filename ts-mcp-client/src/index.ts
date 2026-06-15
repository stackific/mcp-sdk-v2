/**
 * Backend for the hono-mcp-sdk companion app.
 *
 * Hosts the MCP *client* (the alpha client is Node-only, so it cannot run in the
 * browser) connected to the configured MCP server (MCP_SERVER_URL) over Streamable
 * HTTP — any compliant server, see MCP_SERVER_REQUIREMENTS.md — taps every JSON-RPC
 * frame, and exposes:
 *   - GET  /debug/stream             live SSE relay of every wire frame (the "under the hood" view)
 *   - GET  /api/discover|tools|...    REST to drive each capability from the SPA
 *   - POST /api/elicitation/:id/resolve  the human's answer to a server elicitation
 *   - sampling is handled internally via DeepSeek (Anthropic-compatible)
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';

import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, HAS_KEY, PORT } from './config.js';
import { bus, type Frame } from './debug-bus.js';
import { type ElicitResult, listPending, resolvePending } from './elicitation.js';
import { runAuthFlow } from './auth-flow.js';
import { api, cancel, getRoots, getStatus, reconnect, setRoots } from './mcp-client.js';
import { transportProbe } from './transport.js';

const app = new Hono();

app.use(
  '*',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'] }),
);

app.get('/health', (c) => c.json({ status: 'ok', sampling: HAS_KEY ? 'deepseek' : 'mock' }));

app.get('/info', (c) =>
  c.json({
    name: 'hono-mcp-companion-backend',
    sampling: {
      provider: HAS_KEY ? 'deepseek (anthropic-compatible)' : 'mock',
      model: HAS_KEY ? DEEPSEEK_MODEL : 'mock-deepseek',
      baseUrl: DEEPSEEK_BASE_URL,
      keyPresent: HAS_KEY,
    },
    status: getStatus(),
  }),
);

// Live wire-debug stream — relays every JSON-RPC frame to the frontend.
app.get('/debug/stream', (c) =>
  streamSSE(c, async (stream) => {
    let open = true;
    const onFrame = (f: Frame) => {
      void stream.writeSSE({ event: 'frame', data: JSON.stringify(f) });
    };
    bus.on('frame', onFrame);
    stream.onAbort(() => {
      open = false;
      bus.off('frame', onFrame);
    });
    await stream.writeSSE({ event: 'status', data: JSON.stringify(getStatus()) });
    while (open) {
      await stream.sleep(15000);
      if (open) await stream.writeSSE({ event: 'ping', data: '{}' });
    }
  }),
);

// Run an MCP call and shape errors uniformly so the SPA can render protocol errors
// (a thrown JSON-RPC error) distinctly from tool errors (a result with isError).
async function run(c: Context, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return c.json({ ok: true, result });
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = e as any;
    return c.json({
      ok: false,
      error: { message: err?.message ?? String(err), code: err?.code, data: err?.data },
    });
  }
}

app.post('/api/connect', (c) =>
  run(c, async () => {
    // "(Re)connect" always tears down and reconnects, driving a visible
    // server/discover round-trip on the wire (vs ensureConnected's no-op).
    await reconnect();
    return getStatus();
  }),
);
app.get('/api/status', (c) => c.json(getStatus()));
app.get('/api/discover', (c) => run(c, () => api.discover()));

app.get('/api/tools', (c) => run(c, () => api.listTools()));
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json<{
    name: string;
    arguments?: Record<string, unknown>;
  }>();
  return run(c, () => api.callTool(name, args ?? {}));
});

// Cancellable + progress-reporting tool call. The frontend supplies a cancelId it can
// later POST to /api/cancel to abort (→ the client emits notifications/cancelled).
app.post('/api/tools/call-cancellable', async (c) => {
  const {
    name,
    arguments: args,
    cancelId,
  } = await c.req.json<{ name: string; arguments?: Record<string, unknown>; cancelId: string }>();
  return run(c, () => api.callToolCancellable(name, args ?? {}, cancelId));
});
app.post('/api/cancel', async (c) => {
  const { cancelId } = await c.req.json<{ cancelId: string }>();
  return c.json({ ok: cancel(cancelId) });
});

// Tool call with caller _meta (e.g. W3C traceparent) propagated on the wire (tracing).
app.post('/api/tools/call-traced', async (c) => {
  const {
    name,
    arguments: args,
    _meta,
  } = await c.req.json<{
    name: string;
    arguments?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  }>();
  return run(c, () => api.callToolWithMeta(name, args ?? {}, _meta ?? {}));
});

// Generic JSON-RPC passthrough (resources/subscribe, resources/unsubscribe, ping, …).
app.post('/api/raw', async (c) => {
  const { method, params } = await c.req.json<{
    method: string;
    params?: Record<string, unknown>;
  }>();
  return run(c, () => api.raw(method, params ?? {}));
});

// Subscriptions (Ch 25–26): open a subscriptions/listen stream via the SDK client's
// subscribe(); returns the server's honored-filter acknowledgement promptly.
app.post('/api/subscribe', async (c) => {
  const { notifications } = await c.req.json<{ notifications: Record<string, unknown> }>();
  return run(c, () => api.subscribe(notifications));
});

// Tasks extension: create (augmented tools/call), poll status, fetch result, list.
app.post('/api/tasks/create', async (c) => {
  const {
    name,
    arguments: args,
    ttl,
  } = await c.req.json<{ name: string; arguments?: Record<string, unknown>; ttl?: number }>();
  return run(c, () => api.createTask(name, args ?? {}, ttl));
});
app.post('/api/tasks/get', async (c) => {
  const { taskId } = await c.req.json<{ taskId: string }>();
  return run(c, () => api.getTask(taskId));
});

// Authorization: run the full OAuth 2.1 handshake against the protected MCP resource.
app.post('/api/authorize/run', (c) => run(c, () => runAuthFlow()));

// Transport probe: a raw Streamable HTTP initialize POST, exposing the actual HTTP request
// + response headers and status mapping (Streamable HTTP / headers / status — S12, S14, S15).
app.get('/api/transport/probe', (c) => run(c, () => transportProbe()));

app.get('/api/resources', (c) => run(c, () => api.listResources()));
app.get('/api/resource-templates', (c) => run(c, () => api.listResourceTemplates()));
app.post('/api/resources/read', async (c) => {
  const { uri } = await c.req.json<{ uri: string }>();
  return run(c, () => api.readResource(uri));
});

app.get('/api/prompts', (c) => run(c, () => api.listPrompts()));
app.post('/api/prompts/get', async (c) => {
  const { name, arguments: args } = await c.req.json<{
    name: string;
    arguments?: Record<string, string>;
  }>();
  return run(c, () => api.getPrompt(name, args ?? {}));
});

app.post('/api/complete', async (c) => {
  const { ref, argument, context } = await c.req.json<{
    ref: unknown;
    argument: unknown;
    context?: unknown;
  }>();
  return run(c, () => api.complete(ref, argument, context));
});

app.get('/api/roots', (c) => c.json({ roots: getRoots() }));
app.post('/api/roots', async (c) => {
  const { roots } = await c.req.json<{ roots: { uri: string; name?: string }[] }>();
  setRoots(roots ?? []);
  return c.json({ roots: getRoots() });
});

app.get('/api/elicitation/pending', (c) => c.json({ pending: listPending() }));
app.post('/api/elicitation/:id/resolve', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<ElicitResult>();
  return c.json({ ok: resolvePending(id, body) });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(
    `Backend (MCP client host + debug relay) on http://localhost:${info.port}  sampling=${HAS_KEY ? `DeepSeek ${DEEPSEEK_MODEL}` : 'mock'}`,
  );
});
