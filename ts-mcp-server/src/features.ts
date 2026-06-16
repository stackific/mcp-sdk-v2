/**
 * The companion server's features — every server capability (tools, resources,
 * resource templates, prompts, completion, logging, list-changed notifications)
 * plus the server→client capabilities exercised via the response stream
 * (elicitation form+url, sampling, roots) and the Tasks extension.
 *
 * Replicated faithfully from the original reference server, but rebuilt on the
 * SDK's promoted runtime (`@stackific/mcp-sdk-ts/server`): this file declares NO
 * protocol abstractions — it imports `McpServer`/`TaskStore`/`ServerError` and
 * only registers features. Tool input schemas are plain JSON Schema (validated by
 * the SDK), and server→client calls go through the SDK's tool `ctx`.
 */
import {
  McpServer,
  InMemoryTaskStore,
  withCacheHints,
  uiToolResult,
  UI_MIME_TYPE,
} from '@stackific/mcp-sdk-ts/server';

import { COUNTER_APP_HTML } from './apps/counter-app.generated.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Tiny placeholder media for the content-blocks demo (1×1 PNG, empty WAV). */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_WAV_B64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function buildCompanionServer(): McpServer {
  const server = new McpServer(
    { name: 'companion-mcp-server', title: 'Companion MCP Server', version: '0.1.0' },
    {
      logging: {},
      completions: {},
      // listChanged is declared because `mutate_catalog` emits the matching
      // notifications/{tools,prompts,resources}/list_changed (§16.8/§17.7/§18.6).
      tools: { listChanged: true },
      resources: { listChanged: true },
      prompts: { listChanged: true },
      tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
    },
  );

  const taskStore = new InMemoryTaskStore();
  server.setTaskStore(taskStore);

  // ───────────────────────── Tools ─────────────────────────
  server.registerTool(
    'echo',
    {
      title: 'Echo',
      description: 'The simplest possible tool: echoes text back.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to echo back' } },
        required: ['text'],
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => ({ content: [{ type: 'text', text: String(args.text) }] }),
  );

  server.registerTool(
    'add',
    {
      title: 'Add',
      description: 'Adds two numbers.',
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

  server.registerTool(
    'get_weather',
    {
      title: 'Get Weather',
      description: 'Structured-output demo: returns structuredContent matching outputSchema.',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string', description: 'City name' } },
        required: ['city'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          tempC: { type: 'number' },
          conditions: { type: 'string', enum: ['sunny', 'cloudy', 'rainy', 'stormy'] },
        },
        required: ['city', 'tempC', 'conditions'],
      },
    },
    async (args) => {
      const conditions = (['sunny', 'cloudy', 'rainy', 'stormy'] as const)[
        Math.floor(Math.random() * 4)
      ]!;
      const structuredContent = {
        city: args.city as string,
        tempC: Math.round((Math.random() * 30 - 5) * 10) / 10,
        conditions,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    },
  );

  server.registerTool(
    'divide',
    {
      title: 'Divide (may error)',
      description: 'Demonstrates a TOOL error (isError:true) vs a protocol error.',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      if ((args.b as number) === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Cannot divide by zero. Reported as isError:true so the model can recover.',
            },
          ],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: String((args.a as number) / (args.b as number)) }] };
    },
  );

  server.registerTool(
    'count_with_logs',
    {
      title: 'Count (streams log notifications)',
      description:
        'Streams notifications/message while it runs — out-of-band notifications on the wire.',
      inputSchema: {
        type: 'object',
        properties: {
          count: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 5,
            description: 'How many ticks',
          },
          intervalMs: {
            type: 'integer',
            minimum: 50,
            maximum: 2000,
            default: 500,
            description: 'Delay between ticks',
          },
        },
      },
    },
    async (args, ctx) => {
      const count = Number(args.count ?? 5);
      const intervalMs = Number(args.intervalMs ?? 500);
      for (let i = 1; i <= count; i++) {
        ctx.log('info', `tick ${i}/${count} at ${new Date().toISOString()}`);
        await delay(intervalMs);
      }
      return { content: [{ type: 'text', text: `Done. Sent ${count} log notifications.` }] };
    },
  );

  // Elicitation (server→client via the response stream).
  server.registerTool(
    'register_user',
    {
      title: 'Register User (form elicitation)',
      description: 'Server requests user input via FORM elicitation.',
    },
    async (_args, ctx) => {
      const result = await ctx.elicitInput({
        mode: 'form',
        message: 'Please provide your registration details:',
        requestedSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', title: 'Username', minLength: 3, maxLength: 20 },
            email: { type: 'string', title: 'Email', format: 'email' },
            newsletter: { type: 'boolean', title: 'Subscribe to newsletter?', default: false },
          },
          required: ['username', 'email'],
        },
      });
      if (result.action === 'accept' && result.content) {
        return {
          content: [
            { type: 'text', text: `Registered:\n${JSON.stringify(result.content, null, 2)}` },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: `User chose to ${String(result.action)} the form.` }],
      };
    },
  );

  server.registerTool(
    'confirm_purchase',
    {
      title: 'Confirm Purchase (URL elicitation)',
      description: 'Server requests confirmation via URL elicitation.',
    },
    async (_args, ctx) => {
      const elicitationId = `purchase-${Date.now()}`;
      const result = await ctx.elicitInput({
        mode: 'url',
        message: 'Please confirm your purchase in the opened page.',
        elicitationId,
        url: `${(typeof process !== 'undefined' ? process.env.FRONTEND_URL : undefined) ?? 'http://localhost:8000'}/elicit/${elicitationId}`,
      });
      return {
        content: [
          {
            type: 'text',
            text: `URL elicitation result: ${String(result.action)} (id=${elicitationId}).`,
          },
        ],
      };
    },
  );

  // Sampling (server borrows the client's model via the response stream).
  server.registerTool(
    'summarize',
    {
      title: 'Summarize (sampling)',
      description: 'Server asks the CLIENT to run its model (sampling/createMessage).',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to summarize' } },
        required: ['text'],
      },
    },
    async (args, ctx) => {
      const message = await ctx.createMessage({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: `Summarize in one sentence:\n${args.text as string}` },
          },
        ],
        maxTokens: 200,
      });
      const content = (message as { content?: { type?: string; text?: string } }).content;
      const out = content?.type === 'text' ? content.text : JSON.stringify(content);
      return {
        content: [
          {
            type: 'text',
            text: `Model "${String((message as { model?: string }).model)}" replied:\n${out}`,
          },
        ],
      };
    },
  );

  // Roots (server asks the client for its workspace).
  server.registerTool(
    'show_roots',
    { title: 'Show Roots', description: 'Server requests the client roots list (roots/list).' },
    async (_args, ctx) => {
      const result = (await ctx.listRoots()) as { roots?: unknown };
      return {
        content: [
          { type: 'text', text: `Client roots:\n${JSON.stringify(result.roots, null, 2)}` },
        ],
      };
    },
  );

  // Streaming + cooperative cancellation.
  server.registerTool(
    'slow_count',
    {
      title: 'Slow Count (cancellable)',
      description: 'Counts slowly, streams a log + progress per tick, stops early when cancelled.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
          intervalMs: { type: 'integer', minimum: 50, maximum: 2000, default: 600 },
        },
      },
    },
    async (args, ctx) => {
      const to = Number(args.to ?? 12);
      const intervalMs = Number(args.intervalMs ?? 600);
      let i = 0;
      for (; i < to; i++) {
        if (ctx.signal.aborted) break;
        ctx.log('info', `count ${i + 1}/${to}`);
        if (ctx.progressToken !== undefined) {
          ctx.notify({
            method: 'notifications/progress',
            params: {
              progressToken: ctx.progressToken,
              progress: i + 1,
              total: to,
              message: `count ${i + 1}/${to}`,
            },
          });
        }
        await delay(intervalMs);
      }
      const cancelled = ctx.signal.aborted;
      return {
        content: [
          { type: 'text', text: cancelled ? `Cancelled at ${i}/${to}.` : `Counted to ${to}.` },
        ],
      };
    },
  );

  // Subscriptions: list-changed & resource-updated notifications.
  server.registerTool(
    'mutate_catalog',
    {
      title: 'Mutate Catalog',
      description:
        'Fires tools/prompts/resources list_changed and resources/updated so a subscriber re-fetches.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (_args, ctx) => {
      // Fan the change notifications out to active subscription streams (§10.5/§10.6)
      // so the Subscriptions page receives exactly its honored kinds.
      ctx.notifySubscribers({ method: 'notifications/tools/list_changed' });
      ctx.notifySubscribers({ method: 'notifications/prompts/list_changed' });
      ctx.notifySubscribers({ method: 'notifications/resources/list_changed' });
      ctx.notifySubscribers({
        method: 'notifications/resources/updated',
        params: { uri: 'docs://readme' },
      });
      // Also emit on this request's own stream so the Notifications page (no subscription) sees them.
      ctx.sendToolListChanged();
      ctx.sendPromptListChanged();
      ctx.sendResourceListChanged();
      ctx.sendResourceUpdated({ uri: 'docs://readme' });
      return {
        content: [
          {
            type: 'text',
            text: 'Emitted list_changed + resources/updated to subscribers and on this stream.',
          },
        ],
      };
    },
  );

  // Pagination: opaque cursor / nextCursor.
  const CATALOG = Array.from({ length: 23 }, (_, i) => ({
    id: i + 1,
    name: `item-${String(i + 1).padStart(2, '0')}`,
  }));
  const PAGE_SIZE = 5;
  server.registerTool(
    'list_catalog',
    {
      title: 'List Catalog (paginated)',
      description: 'Returns one opaque-cursor page at a time; pass nextCursor to continue.',
      inputSchema: {
        type: 'object',
        properties: {
          cursor: { type: 'string', description: 'Opaque cursor from a previous page' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'number' }, name: { type: 'string' } },
            },
          },
          nextCursor: { type: 'string' },
          total: { type: 'number' },
        },
        required: ['items', 'total'],
      },
    },
    async (args) => {
      const cursor = args.cursor as string | undefined;
      const offset = cursor ? Number(Buffer.from(cursor, 'base64').toString('utf8')) || 0 : 0;
      const items = CATALOG.slice(offset, offset + PAGE_SIZE);
      const nextOffset = offset + PAGE_SIZE;
      const nextCursor =
        nextOffset < CATALOG.length
          ? Buffer.from(String(nextOffset)).toString('base64')
          : undefined;
      const structuredContent = { items, nextCursor, total: CATALOG.length };
      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    },
  );

  // Caching: top-level result cache hints (ttlMs + cacheScope, §13.4).
  let quoteCounter = 0;
  server.registerTool(
    'cached_quote',
    {
      title: 'Cached Quote',
      description: 'Returns a result carrying top-level cache hints (ttlMs + cacheScope).',
    },
    async () => {
      quoteCounter += 1;
      const quotes = [
        'Make it work, then make it right.',
        'Cache invalidation is hard.',
        'Premature optimization is the root of all evil.',
      ];
      return withCacheHints(
        {
          content: [
            { type: 'text', text: `#${quoteCounter}: ${quotes[quoteCounter % quotes.length]}` },
          ],
          _meta: { generatedAt: new Date().toISOString(), invocation: quoteCounter },
        },
        { ttlMs: 60000, cacheScope: 'private' },
      );
    },
  );

  // Tracing: echo the W3C trace context from request _meta.
  server.registerTool(
    'echo_trace',
    {
      title: 'Echo Trace Context',
      description: 'Echoes back the _meta the server received (incl. traceparent/tracestate).',
    },
    async (_args, ctx) => ({
      content: [
        {
          type: 'text',
          text: `Server received _meta:\n${JSON.stringify(ctx.meta ?? {}, null, 2)}`,
        },
      ],
      _meta: { echoed: ctx.meta ?? {} },
    }),
  );

  // Content blocks: every ContentBlock kind in one result.
  server.registerTool(
    'content_gallery',
    {
      title: 'Content Gallery',
      description: 'Returns text, image, audio, an embedded resource, and a resource_link.',
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: 'A tool result can mix block kinds: an image, audio, an embedded resource, and a resource link.',
        },
        { type: 'image', data: TINY_PNG_B64, mimeType: 'image/png' },
        { type: 'audio', data: TINY_WAV_B64, mimeType: 'audio/wav' },
        {
          type: 'resource',
          resource: {
            uri: 'docs://readme',
            mimeType: 'text/markdown',
            text: '# Embedded resource\nAn inline resource block carried directly in the result.',
          },
        },
        {
          type: 'resource_link',
          uri: 'weather://oslo/current',
          name: 'Oslo weather',
          mimeType: 'application/json',
        },
      ],
    }),
  );

  // MCP Apps (UI extension): a ui:// resource (text/html;profile=mcp-app) + a launcher tool.
  server.registerResource(
    'counter-app',
    'ui://counter',
    {
      title: 'Counter App (MCP Apps UI)',
      description: 'An interactive UI resource, rendered sandboxed by the host.',
      mimeType: UI_MIME_TYPE,
    },
    async (uri) => ({
      contents: [{ uri, mimeType: UI_MIME_TYPE, text: COUNTER_APP_HTML }],
    }),
  );
  server.registerTool(
    'open_counter_app',
    {
      title: 'Open Counter App (MCP Apps)',
      description:
        'Launches an MCP App: returns an embedded ui:// resource the host renders sandboxed.',
    },
    async () =>
      uiToolResult('ui://counter', COUNTER_APP_HTML, {
        text: 'Launching the Counter app (ui://counter). The host renders it sandboxed.',
      }),
  );

  // Tasks extension: augmented call → handle immediately, work in background, fetch via tasks/result.
  server.registerTool(
    'long_job',
    {
      title: 'Long Job (task)',
      description:
        'Runs as a task: returns a handle immediately, works through N steps, then exposes the result via tasks/result.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: {
            type: 'integer',
            minimum: 1,
            maximum: 8,
            default: 4,
            description: 'How many background steps',
          },
          label: { type: 'string', default: 'report', description: 'A label for the job' },
        },
      },
      execution: { taskSupport: 'required' },
    },
    async (args, ctx) => {
      const steps = Number(args.steps ?? 4);
      const label = String(args.label ?? 'report');
      const task = taskStore.createTask({ ttlMs: ctx.taskTtlMs ?? 300000 });
      // The live status of the task, or undefined if it has expired (ttl swept) /
      // is gone — read defensively so a background tick never throws.
      const statusOf = (): string | undefined => {
        try {
          return taskStore.get(task.taskId).status;
        } catch {
          return undefined;
        }
      };
      void (async () => {
        try {
          for (let i = 1; i <= steps; i++) {
            await delay(500);
            // The client may have cancelled (tasks/cancel) while we worked: the task
            // is then terminal, and updating it would be an illegal transition (§25.5).
            // Stop quietly — there is nothing left to report.
            if (statusOf() !== 'working') return;
            taskStore.updateStatus(task.taskId, 'working', `step ${i}/${steps}`);
          }
          if (statusOf() !== 'working') return;
          taskStore.storeResult(task.taskId, {
            content: [{ type: 'text', text: `Job "${label}" completed ${steps} steps.` }],
            structuredContent: { label, steps, finishedAt: new Date().toISOString() },
          });
        } catch (e) {
          // Only record a failure if the task is still live and non-terminal;
          // marking an already-cancelled/expired task failed would itself throw.
          if (statusOf() === 'working') {
            taskStore.updateStatus(task.taskId, 'failed', `job failed: ${String(e)}`);
          }
        }
      })();
      return { task };
    },
  );

  // ───────────── Resources, templates, prompts (completion via registered completers) ─────────────
  server.registerResource(
    'readme',
    'docs://readme',
    { title: 'Readme', description: 'A static text resource.', mimeType: 'text/markdown' },
    async (uri) => ({
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: '# Companion Server\n\nThis is a static MCP resource served over Streamable HTTP.',
        },
      ],
    }),
  );

  const cities = ['oslo', 'tokyo', 'cairo', 'lima', 'quito', 'osaka'];
  server.registerResourceTemplate(
    'city-weather',
    {
      uriTemplate: 'weather://{city}/current',
      title: 'City Weather (template)',
      description: 'A templated resource with argument completion.',
      mimeType: 'application/json',
      complete: { city: (value) => cities.filter((c) => c.startsWith(value.toLowerCase())) },
    },
    async (uri, variables) => ({
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ city: variables.city, tempC: 21, conditions: 'sunny' }, null, 2),
        },
      ],
    }),
  );

  server.registerPrompt(
    'greeting',
    {
      title: 'Greeting',
      description: 'A reusable, user-invoked prompt with a completable argument.',
      arguments: [
        { name: 'name', required: true, description: 'Who to greet' },
        {
          name: 'language',
          description: 'Language',
          complete: (value) =>
            ['english', 'spanish', 'norwegian', 'japanese'].filter((l) =>
              l.startsWith(value.toLowerCase()),
            ),
        },
      ],
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Greet ${args.name} warmly in ${args.language ?? 'english'}.`,
          },
        },
      ],
    }),
  );

  return server;
}
