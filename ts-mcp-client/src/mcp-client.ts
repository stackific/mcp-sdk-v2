/**
 * Hosts the MCP *client* for the companion backend, now built on the home-grown,
 * edge-friendly `@stackific/mcp-sdk-ts` client runtime (2026-07-28, stateless)
 * instead of the Node-only alpha client.
 *
 * The SDK's `Client` owns the request/response lifecycle: it stamps every request
 * with the required `_meta` envelope (protocol version, client identity,
 * capabilities), correlates responses by id over the Streamable HTTP transport,
 * and routes server→client requests (sampling / elicitation / roots) to the
 * handlers registered below. We additionally tap every wire frame — outbound by
 * wrapping `transport.send`, inbound via `transport.onMessage` — and relay them to
 * the debug bus for the SPA's "under the hood" view.
 */
import { Client, StreamableHTTPClientTransport } from '@stackific/mcp-sdk-ts';

import { MCP_SERVER_URL } from './config.js';
import { bus, type FrameKind } from './debug-bus.js';
import { createPending } from './elicitation.js';
import { sample } from './sampling.js';

let client: Client | null = null;
let transport: StreamableHTTPClientTransport | null = null;
/** Set around each frontend-triggered action so emitted frames can be grouped in the UI. */
let currentTrace: string | undefined;

/** The capabilities this client declares in every request's `_meta`. (Single source of truth.) */
const CLIENT_CAPABILITIES = {
  elicitation: { form: {}, url: {} },
  sampling: {},
  roots: {},
  tasks: {},
} as const;

const CLIENT_INFO = {
  name: 'companion-mcp-client',
  title: 'Companion MCP Client',
  version: '0.1.0',
} as const;

let roots: { uri: string; name?: string }[] = [
  { uri: 'file:///workspace/companion-project', name: 'companion-project' },
  { uri: 'file:///workspace/shared-lib', name: 'shared-lib' },
];

/** In-flight cancellable calls, so the UI can abort them by id (→ notifications/cancelled). */
const inflight = new Map<string, AbortController>();

export function cancel(cancelId: string): boolean {
  const ctrl = inflight.get(cancelId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classify(message: any): {
  kind: FrameKind;
  method?: string;
  id?: string | number | null;
  summary: string;
} {
  if (message && typeof message === 'object') {
    if ('method' in message && 'id' in message)
      return {
        kind: 'request',
        method: message.method,
        id: message.id,
        summary: `request → ${message.method}`,
      };
    if ('method' in message)
      return {
        kind: 'notification',
        method: message.method,
        summary: `notification ${message.method}`,
      };
    if ('result' in message)
      return { kind: 'response', id: message.id ?? null, summary: `result for #${message.id}` };
    if ('error' in message)
      return {
        kind: 'error',
        id: message.id ?? null,
        summary: `error ${message.error?.code}: ${message.error?.message}`,
      };
  }
  return { kind: 'note', summary: 'message' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tap(dir: 'send' | 'recv', message: any): void {
  const c = classify(message);
  bus.emitFrame({
    dir,
    kind: c.kind,
    method: c.method,
    id: c.id,
    summary: c.summary,
    payload: message,
    trace: currentTrace,
  });
}

export async function ensureConnected(): Promise<void> {
  if (client) return;

  const t = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));

  // Tap OUTGOING frames by wrapping send (captures discovery, calls, and the
  // client's replies to server→client requests).
  const origSend = t.send.bind(t);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t.send = ((message: any) => {
    tap('send', message);
    return origSend(message);
  }) as typeof t.send;

  // Tap INCOMING frames (interim notifications, server→client requests, responses).
  t.onMessage((m) => tap('recv', m));
  t.onError((e) =>
    bus.emitFrame({ dir: 'local', kind: 'error', summary: `transport error: ${e.message}` }),
  );
  t.onClose(() => bus.emitFrame({ dir: 'local', kind: 'lifecycle', summary: 'transport closed' }));

  const c = new Client(CLIENT_INFO, { capabilities: CLIENT_CAPABILITIES });

  // Sampling: the server asks the client to run a model; we route to DeepSeek.
  c.setRequestHandler('sampling/createMessage', async (params) => {
    bus.emitFrame({
      dir: 'local',
      kind: 'note',
      method: 'sampling/createMessage',
      summary: 'client handling sampling → DeepSeek',
      payload: params,
      trace: currentTrace,
    });
    return sample({
      messages: params['messages'] as never,
      maxTokens: params['maxTokens'] as never,
      systemPrompt: params['systemPrompt'] as never,
    });
  });

  // Roots: the server asks for the client's workspace roots.
  c.setRequestHandler('roots/list', async () => {
    bus.emitFrame({
      dir: 'local',
      kind: 'note',
      method: 'roots/list',
      summary: 'client returning configured roots',
      payload: { roots },
      trace: currentTrace,
    });
    return { roots };
  });

  // Elicitation: bridge to the human in the browser.
  c.setRequestHandler('elicitation/create', async (params) => {
    const id = crypto.randomUUID();
    const mode: string = (params['mode'] as string) ?? 'form';
    bus.emitFrame({
      dir: 'recv',
      kind: 'elicitation',
      method: 'elicitation/create',
      summary: `server requests ${mode} input → asking the user`,
      payload: { pendingId: id, params },
      trace: currentTrace,
    });
    const result = await createPending(id, mode);
    bus.emitFrame({
      dir: 'local',
      kind: 'note',
      method: 'elicitation/create',
      summary: `user chose: ${result.action}`,
      payload: result,
      trace: currentTrace,
    });
    return result as unknown as Record<string, unknown>;
  });

  bus.emitFrame({ dir: 'local', kind: 'lifecycle', summary: `connecting to ${MCP_SERVER_URL}` });
  c.connect(t);
  client = c;
  transport = t;

  // Discovery (server/discover) populates the negotiated revision + server identity
  // for the status panel; the request/response are tapped like any other frame.
  try {
    await c.discover();
  } catch (e) {
    bus.emitFrame({
      dir: 'local',
      kind: 'error',
      summary: `discover failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  bus.emitFrame({
    dir: 'local',
    kind: 'lifecycle',
    summary: `connected — protocol ${c.getNegotiatedVersion() ?? 'unknown'}`,
  });
}

/**
 * Tears down any existing connection and connects fresh. Unlike {@link ensureConnected}
 * (which no-ops when already connected), this always drives a visible server/discover
 * round-trip — so the "reconnect" control produces wire frames every time.
 */
export async function reconnect(): Promise<void> {
  if (client) {
    try {
      await client.close();
    } catch {
      // ignore teardown errors
    }
    client = null;
    transport = null;
  }
  await withTrace('reconnect', async () => {});
}

async function withTrace<T>(trace: string, fn: () => Promise<T>): Promise<T> {
  await ensureConnected();
  currentTrace = trace;
  try {
    return await fn();
  } finally {
    currentTrace = undefined;
  }
}

export function getStatus() {
  const caps = client?.getServerCapabilities() ?? null;
  return {
    connected: !!client,
    negotiatedVersion: client?.getNegotiatedVersion() ?? null,
    serverInfo: client?.getServerVersion() ?? null,
    serverCapabilities: caps,
    serverExtensions: (caps?.['extensions'] as unknown) ?? null,
    clientCapabilities: CLIENT_CAPABILITIES,
    roots,
    serverUrl: MCP_SERVER_URL,
  };
}

/** The single active subscription handle (subscriptions/listen), if any. */
let subscription: Awaited<ReturnType<Client['subscribe']>> | null = null;

/**
 * Opens (or re-opens) a single subscription via the SDK client's `subscribe()` —
 * which sends `subscriptions/listen`, awaits the server's acknowledgement, and keeps
 * the stream open. Unlike a raw `client.request('subscriptions/listen')` (whose final
 * response never arrives, so the caller hangs forever), this resolves as soon as the
 * honored filter is acked; subsequent change notifications ride the tapped wire stream.
 */
async function doSubscribe(
  filter: Parameters<Client['subscribe']>[0],
): Promise<{ subscriptionId: string; acknowledgedFilter: Record<string, unknown> }> {
  await ensureConnected();
  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch {
      // ignore teardown errors from a stale subscription
    }
    subscription = null;
  }
  const handle = await client!.subscribe(filter, () => {
    // Change notifications are already surfaced on the wire panel by the transport
    // tap (onMessage); there is nothing extra to do per delivery here.
  });
  subscription = handle;
  void handle.closed.then(() => {
    if (subscription === handle) subscription = null;
  });
  return { subscriptionId: handle.subscriptionId, acknowledgedFilter: handle.acknowledgedFilter };
}

export const api = {
  discover: () =>
    withTrace('discover', async () => {
      // server/discover is the 2026-07-28 entry point. We surface the outcome either
      // way; the negotiated info is cached on the client.
      let discoverResult: unknown = null;
      let discoverError: unknown = null;
      try {
        discoverResult = await client!.discover();
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = e as any;
        discoverError = { message: err?.message ?? String(err), code: err?.code };
      }
      return { discoverResult, discoverError, status: getStatus() };
    }),
  listTools: () => withTrace('tools/list', () => client!.listTools()),
  // tools/call via the SDK's multi-round-trip driver: when the tool needs client input
  // (elicitation/sampling/roots → an input_required result), requestWithInput fulfills it
  // using the handlers registered above and RETRIES until the tool completes (§11).
  callTool: (name: string, args: Record<string, unknown>) =>
    withTrace(`tools/call:${name}`, () =>
      client!.requestWithInput({ method: 'tools/call', params: { name, arguments: args } }),
    ),
  // Cancellable + progress-reporting call: passing onProgress makes the client attach a
  // progressToken so the server's notifications/progress are correlated and delivered.
  callToolCancellable: (name: string, args: Record<string, unknown>, cancelId: string) =>
    withTrace(`tools/call:${name}`, async () => {
      const ctrl = new AbortController();
      inflight.set(cancelId, ctrl);
      try {
        return await client!.requestWithInput(
          { method: 'tools/call', params: { name, arguments: args } },
          { signal: ctrl.signal, onProgress: () => {}, timeoutMs: 120000 },
        );
      } finally {
        inflight.delete(cancelId);
      }
    }),
  // Call a tool with caller-supplied _meta (e.g. W3C traceparent) propagated on the wire.
  callToolWithMeta: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
    withTrace(`tools/call:${name}`, () =>
      client!.requestWithInput({
        method: 'tools/call',
        params: { name, arguments: args, _meta: meta },
      }),
    ),
  // Generic JSON-RPC passthrough for methods without a dedicated helper (ping, tasks/cancel,
  // subscriptions/listen, …) — surfaced transparently just like the typed calls.
  raw: (method: string, params: Record<string, unknown> = {}) =>
    withTrace(method, () => client!.request({ method, params })),
  // Tasks extension (Ch 25): createTask sends an augmented tools/call (→ CreateTaskResult);
  // poll via getTask, whose DetailedTask carries the inline result once terminal (§25.7).
  createTask: (name: string, args: Record<string, unknown>, ttl = 300000) =>
    withTrace(`tasks/create:${name}`, () => client!.createTask(name, args, { ttlMs: ttl })),
  getTask: (taskId: string) => withTrace('tasks/get', () => client!.getTask(taskId)),
  // Subscriptions (Ch 25–26): drive the SDK client's subscribe() so the listen ack
  // returns promptly (a raw subscriptions/listen request would hang, never resolving).
  subscribe: (filter: Parameters<Client['subscribe']>[0]) =>
    withTrace('subscriptions/listen', () => doSubscribe(filter)),
  listResources: () => withTrace('resources/list', () => client!.listResources()),
  listResourceTemplates: () =>
    withTrace('resources/templates/list', () => client!.listResourceTemplates()),
  readResource: (uri: string) => withTrace('resources/read', () => client!.readResource(uri)),
  listPrompts: () => withTrace('prompts/list', () => client!.listPrompts()),
  getPrompt: (name: string, args: Record<string, string>) =>
    withTrace(`prompts/get:${name}`, () => client!.getPrompt(name, args)),
  complete: (ref: unknown, argument: unknown, context?: unknown) =>
    withTrace('completion/complete', () => client!.complete(ref, argument, context)),
};

export function getRoots() {
  return roots;
}
export function setRoots(r: { uri: string; name?: string }[]) {
  roots = r;
}
