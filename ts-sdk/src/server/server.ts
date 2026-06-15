/**
 * MCP server runtime (2026-07-28, stateless) — the embeddable counterpart to the
 * {@link Client} host. It supplies the method dispatcher and a registration API
 * for tools, resources, resource templates, prompts, and completion that the
 * specification intentionally leaves to an embedder, built on the SDK's protocol
 * primitives (discovery, JSON-Schema validation, error codes).
 *
 * Edge-friendly: pure logic with no `node:*` and no transport coupling. Pair it
 * with {@link createMcpRequestHandler} (a Web `fetch` handler) for Cloudflare
 * Workers / Deno / Bun, the Hono adapter, or the Node `node:http` adapter.
 *
 * Statelessness (§4.4, §7.6): there is no session. Each request is self-contained;
 * a server→client request issued mid-tool (elicitation / sampling / roots) is held
 * open on that request's own response stream and correlated by JSON-RPC id by the
 * transport, never by connection.
 */
import { INVALID_PARAMS_CODE } from '../protocol/meta.js';
import { validateValueAgainstSchema } from '../protocol/tools.js';
import { buildDiscoverResult, CURRENT_PROTOCOL_VERSION, type DiscoverConfig } from '../protocol/discovery.js';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import { TASK_RESULT_TYPE, TASK_MISSING_CAPABILITY_CODE } from '../protocol/tasks.js';
import { buildInputRequiredResult, type InputRequest } from '../protocol/multi-round-trip.js';
import type { CacheScope } from '../protocol/caching.js';
import type { Implementation } from '../types/implementation.js';

/** JSON-RPC "Method not found". (§22) */
export const METHOD_NOT_FOUND_CODE = -32601;
/** JSON-RPC "Internal error". (§22) */
export const INTERNAL_ERROR_CODE = -32603;

/**
 * A JSON-RPC protocol error a handler may throw; it becomes a wire `error`
 * object. Distinct from a tool error (a successful result with `isError: true`).
 */
export class ServerError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ServerError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Per-request context the transport hands the dispatcher (one per request, stateless). */
export interface RequestContext {
  /** The negotiated protocol revision for this exchange. */
  protocolVersion: string;
  /** The JSON-RPC id of the originating request. */
  requestId: string | number;
  /** The request's `params._meta` (carries `progressToken`, trace context, …). */
  meta: Record<string, unknown>;
  /** Aborts when the client cancels this request (`notifications/cancelled`). */
  signal: AbortSignal;
  /** Transport-resolved caller identity (e.g. a validated bearer token), if any. */
  authInfo?: unknown;
  /** Emits a notification on this request's stream. */
  notify(notification: { method: string; params?: Record<string, unknown> }): void;
  /** Issues a server→client request on this stream; resolves with the client's result. */
  serverRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  /**
   * Broadcasts a change notification to active subscription streams, filtered by
   * each subscription's honored set (§10.5/§10.6). Optional — present only on
   * transports that support subscriptions (Streamable HTTP).
   */
  notifySubscribers?(notification: { method: string; params?: Record<string, unknown> }): void;
}

/** A tool result (standard MCP shape). `isError: true` reports a TOOL failure, not a protocol error. */
export interface ToolResult {
  content?: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  /** Present when a task-augmented call returns a handle instead of a result. */
  task?: unknown;
}

/** The minimal task store the dispatcher needs for the Tasks extension (§25). */
export interface TaskStore {
  get(taskId: string): { status: string };
  /** The status-appropriate DetailedTask (status + inline result/error/inputRequests). (§25.7) */
  getDetailed(taskId: string): Record<string, unknown>;
  cancel(taskId: string): { status: string };
  /** Supplies input to an input_required task. (§25.8) */
  applyInput(taskId: string, inputResponses: Record<string, unknown>): unknown;
  /** Registers a listener invoked with the new DetailedTask on every status change. (§25.10) */
  setUpdateListener?(listener: (task: Record<string, unknown>) => void): void;
}

/** The ergonomic context passed to every tool handler. */
export interface ToolContext {
  meta: Record<string, unknown>;
  signal: AbortSignal;
  authInfo?: unknown;
  progressToken?: string | number;
  /** Whether the caller's params requested this call run as a task. */
  taskRequested: boolean;
  taskTtlMs?: number;
  /** Emits a `notifications/message` at or above the server's current log level. */
  log(level: string, message: string): void;
  notify(notification: { method: string; params?: Record<string, unknown> }): void;
  /** Solicits structured input from the user (server→client `elicitation/create`). */
  elicitInput(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Borrows the client's model (server→client `sampling/createMessage`, Deprecated). */
  createMessage(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Requests the client's workspace roots (server→client `roots/list`, Deprecated). */
  listRoots(): Promise<Record<string, unknown>>;
  sendToolListChanged(): void;
  sendPromptListChanged(): void;
  sendResourceListChanged(): void;
  sendResourceUpdated(params: { uri: string }): void;
  /** Broadcasts a change notification to all matching subscription streams (§10.5/§10.6). */
  notifySubscribers(notification: { method: string; params?: Record<string, unknown> }): void;
}

// ─── Registration shapes ────────────────────────────────────────────────────────

export interface ToolDef {
  title?: string;
  description?: string;
  /** JSON Schema (2020-12) for `arguments`; validated by the SDK value validator. */
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  /** Task-augmented tool: `{ taskSupport: 'required' | 'optional' }`. */
  execution?: { taskSupport: 'required' | 'optional' };
}
export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

export interface ResourceDef {
  title?: string;
  description?: string;
  mimeType?: string;
}
export type ResourceReader = (uri: string) => Promise<{ contents: unknown[] }>;
export type TemplateReader = (
  uri: string,
  variables: Record<string, string>,
) => Promise<{ contents: unknown[] }>;

export interface ResourceTemplateDef extends ResourceDef {
  uriTemplate: string;
  /** Completion callbacks per template variable. */
  complete?: Record<string, (value: string) => string[]>;
}

export interface PromptArg {
  name: string;
  description?: string;
  required?: boolean;
  /** Completion callback for this argument. */
  complete?: (value: string) => string[];
}
export interface PromptDef {
  title?: string;
  description?: string;
  arguments?: PromptArg[];
}
export type PromptHandler = (args: Record<string, string>) => Promise<{ messages: unknown[] }>;

interface RegisteredTool {
  name: string;
  def: ToolDef;
  handler: ToolHandler;
}
interface RegisteredResource {
  name: string;
  uri: string;
  def: ResourceDef;
  read: ResourceReader;
}
interface RegisteredTemplate {
  name: string;
  def: ResourceTemplateDef;
  read: TemplateReader;
}
interface RegisteredPrompt {
  name: string;
  def: PromptDef;
  handler: PromptHandler;
}

// ─── Server ─────────────────────────────────────────────────────────────────────

/** Log severities in ascending order (mirrors §15.3 / S23). */
const LOG_LEVELS = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];

/** Options for {@link McpServer}. */
export interface McpServerOptions {
  /** Max items per page for the list methods (tools/resources/prompts). Default 50. (§12) */
  pageSize?: number;
  /**
   * Default freshness hint (ms) stamped as the top-level `ttlMs` on the five
   * cacheable-method results (§13.4); default `0` (a non-caching server still
   * MUST emit the field). (R-13.4-b)
   */
  cacheTtlMs?: number;
  /** Default top-level `cacheScope` for cacheable results; default `'private'`. (§13.3) */
  cacheScope?: CacheScope;
}

export class McpServer {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly resources = new Map<string, RegisteredResource>();
  private readonly templates: RegisteredTemplate[] = [];
  private readonly prompts = new Map<string, RegisteredPrompt>();
  private logLevel = 'info';
  private taskStore?: TaskStore;
  private readonly pageSize: number;
  private readonly cacheTtlMs: number;
  private readonly cacheScope: CacheScope;

  constructor(
    readonly info: Implementation,
    readonly capabilities: Record<string, unknown> = {},
    options: McpServerOptions = {},
  ) {
    this.pageSize = options.pageSize ?? 50;
    this.cacheTtlMs = options.cacheTtlMs ?? 0;
    this.cacheScope = options.cacheScope ?? 'private';
  }

  /**
   * Stamps the REQUIRED `resultType` discriminator (§3.6) on a complete result,
   * preserving any value a handler already set (e.g. a task/input-required shape).
   */
  private asComplete(result: Record<string, unknown>): Record<string, unknown> {
    return { resultType: RESULT_TYPE.COMPLETE, ...result };
  }

  /**
   * Adds `resultType` plus the REQUIRED top-level caching hints (`ttlMs`,
   * `cacheScope`, §13.4) to one of the five cacheable-method results, without
   * overriding hints a handler set explicitly (e.g. via {@link withCacheHints}).
   */
  private withCacheableHints(result: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { resultType: RESULT_TYPE.COMPLETE, ...result };
    if (out['ttlMs'] === undefined) out['ttlMs'] = this.cacheTtlMs;
    if (out['cacheScope'] === undefined) out['cacheScope'] = this.cacheScope;
    return out;
  }

  /**
   * Capability gating (§6.4): a server MUST NOT answer a tools/resources/prompts/
   * completion request for a capability it did not advertise. Throws `-32601`
   * (method not found) — mirrors `mayServerAnswerToolsList` /
   * `mayAcceptResourceRequest` / `buildCompletionNotSupportedError`. (C11)
   */
  private requireCapability(capability: string, method: string): void {
    if (this.capabilities[capability] === undefined) {
      throw new ServerError(
        METHOD_NOT_FOUND_CODE,
        `Method not found: ${method} (the "${capability}" capability is not advertised)`,
      );
    }
  }

  setTaskStore(store: TaskStore): void {
    this.taskStore = store;
    // §25.10: forward each task status change as a notifications/tasks push.
    store.setUpdateListener?.((task) => this.onTaskUpdate(task));
  }

  /**
   * Wires the subscription fan-out used to deliver `notifications/tasks` pushes
   * (§25.10). The Streamable HTTP handler calls this with its subscriber notifier;
   * a transport without subscriptions leaves it unset (push is then a no-op).
   */
  setTaskNotifier(notify: (notification: { method: string; params?: Record<string, unknown> }) => void): void {
    this.taskNotifier = notify;
  }

  private taskNotifier?: (notification: { method: string; params?: Record<string, unknown> }) => void;
  private onTaskUpdate(task: Record<string, unknown>): void {
    this.taskNotifier?.({ method: 'notifications/tasks', params: task });
  }

  registerTool(name: string, def: ToolDef, handler: ToolHandler): void {
    this.tools.set(name, { name, def, handler });
  }
  registerResource(name: string, uri: string, def: ResourceDef, read: ResourceReader): void {
    this.resources.set(uri, { name, uri, def, read });
  }
  registerResourceTemplate(name: string, def: ResourceTemplateDef, read: TemplateReader): void {
    this.templates.push({ name, def, read });
  }
  registerPrompt(name: string, def: PromptDef, handler: PromptHandler): void {
    this.prompts.set(name, { name, def, handler });
  }
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
  get minLogLevel(): string {
    return this.logLevel;
  }

  /** Routes one JSON-RPC request to its handler, returning the `result` payload. */
  async dispatch(
    method: string,
    params: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<Record<string, unknown>> {
    switch (method) {
      case 'initialize':
        return this.initialize(params);
      case 'ping':
        return {};
      case 'logging/setLevel': {
        const level = params['level'];
        if (typeof level === 'string') this.logLevel = level;
        return {};
      }
      case 'server/discover':
        return this.discover();
      case 'tools/list':
        this.requireCapability('tools', method);
        return this.listTools(params);
      case 'tools/call':
        this.requireCapability('tools', method);
        return await this.callTool(params, ctx);
      case 'resources/list':
        this.requireCapability('resources', method);
        return this.listResources(params);
      case 'resources/templates/list':
        this.requireCapability('resources', method);
        return this.listResourceTemplates(params);
      case 'resources/read':
        this.requireCapability('resources', method);
        return await this.readResource(params);
      case 'prompts/list':
        this.requireCapability('prompts', method);
        return this.listPrompts(params);
      case 'prompts/get':
        this.requireCapability('prompts', method);
        return await this.getPrompt(params);
      case 'completion/complete':
        this.requireCapability('completions', method);
        return this.complete(params);
      case 'tasks/get':
        // §25.7: a GetTaskResult is the DetailedTask (with inline outcome) + resultType.
        return this.taskOp('tasks/get', params, (store, id) => this.asComplete(store.getDetailed(id)));
      case 'tasks/cancel':
        return this.taskOp('tasks/cancel', params, (store, id) => {
          store.cancel(id);
          return this.asComplete(store.getDetailed(id));
        });
      case 'tasks/update':
        // §25.8: supply input to an input_required task, then return its DetailedTask.
        return this.taskOp('tasks/update', params, (store, id) => {
          store.applyInput(id, (params['inputResponses'] ?? {}) as Record<string, unknown>);
          return this.asComplete(store.getDetailed(id));
        });
      default:
        throw new ServerError(METHOD_NOT_FOUND_CODE, `Method not found: ${method}`);
    }
  }

  private taskOp(
    method: string,
    params: Record<string, unknown>,
    op: (store: TaskStore, taskId: string) => Record<string, unknown>,
  ): Record<string, unknown> {
    // C8 (§25.7): missing the Tasks capability is -32003, not -32601.
    if (!this.taskStore) {
      throw new ServerError(TASK_MISSING_CAPABILITY_CODE, `Tasks extension not supported (required for ${method})`);
    }
    const taskId = params['taskId'];
    if (typeof taskId !== 'string') throw new ServerError(INVALID_PARAMS_CODE, 'taskId (string) is required');
    return op(this.taskStore, taskId);
  }

  // ── initialize / discover ──
  private initialize(params: Record<string, unknown>): Record<string, unknown> {
    // Echo the client's requested revision so any client accepts the handshake;
    // the server itself targets CURRENT_PROTOCOL_VERSION.
    const requested =
      typeof params['protocolVersion'] === 'string'
        ? (params['protocolVersion'] as string)
        : CURRENT_PROTOCOL_VERSION;
    return {
      protocolVersion: requested,
      capabilities: this.capabilities,
      serverInfo: this.info,
    };
  }

  private discover(): Record<string, unknown> {
    const config: DiscoverConfig = {
      supportedVersions: [CURRENT_PROTOCOL_VERSION],
      capabilities: this.capabilities,
      serverInfo: { ...this.info } as DiscoverConfig['serverInfo'],
    };
    return buildDiscoverResult(config) as unknown as Record<string, unknown>;
  }

  // ── tools ──
  /** Slices a full item list into an opaque-cursor page (§12); emits `nextCursor` when more remain. */
  private paginate<T>(items: T[], key: string, params: Record<string, unknown>): Record<string, unknown> {
    let offset = 0;
    const cursor = params['cursor'];
    if (typeof cursor === 'string' && cursor.length > 0) {
      offset = decodeCursorOffset(cursor);
      // m3 (§12.4): reject an undecodable, negative, OR out-of-bounds cursor with -32602.
      if (!Number.isInteger(offset) || offset < 0 || offset > items.length) {
        throw new ServerError(INVALID_PARAMS_CODE, 'Invalid pagination cursor');
      }
    }
    const page = items.slice(offset, offset + this.pageSize);
    const out: Record<string, unknown> = { [key]: page };
    const nextOffset = offset + this.pageSize;
    if (nextOffset < items.length) out['nextCursor'] = encodeCursorOffset(nextOffset);
    return out;
  }

  private listTools(params: Record<string, unknown>): Record<string, unknown> {
    const tools = [...this.tools.values()].map((t) => ({
      name: t.name,
      ...(t.def.title ? { title: t.def.title } : {}),
      ...(t.def.description ? { description: t.def.description } : {}),
      inputSchema: t.def.inputSchema ?? { type: 'object' },
      ...(t.def.outputSchema ? { outputSchema: t.def.outputSchema } : {}),
      ...(t.def.annotations ? { annotations: t.def.annotations } : {}),
      ...(t.def.execution ? { execution: t.def.execution } : {}),
    }));
    return this.withCacheableHints(this.paginate(tools, 'tools', params));
  }

  private async callTool(params: Record<string, unknown>, ctx: RequestContext): Promise<Record<string, unknown>> {
    const name = params['name'];
    if (typeof name !== 'string' || !this.tools.has(name)) {
      throw new ServerError(INVALID_PARAMS_CODE, `Unknown tool: ${String(name)}`);
    }
    const tool = this.tools.get(name)!;
    const args = (params['arguments'] ?? {}) as Record<string, unknown>;

    // A schema violation is a PROTOCOL error (-32602), not a tool error.
    if (tool.def.inputSchema) {
      const verdict = validateValueAgainstSchema(tool.def.inputSchema, args);
      if (!verdict.valid) {
        throw new ServerError(INVALID_PARAMS_CODE, `Invalid arguments for ${name}: ${verdict.errors.join('; ')}`);
      }
    }

    const taskParam = params['task'] as { ttl?: number } | undefined;

    // C6 (§11): a tool solicits client input (elicitation/sampling/roots) by returning an
    // input_required result resolved by client RETRY — not a server-initiated request. The
    // collector replays responses the client already supplied (echoed `requestState` plus this
    // round's `inputResponses`); the first unanswered solicitation throws InputRequired, which
    // we convert into the input_required result the client's MRTR driver retries against.
    const inputResponses = (params['inputResponses'] ?? {}) as Record<string, unknown>;
    const prior = typeof params['requestState'] === 'string' ? decodeRequestState(params['requestState'] as string) : {};
    const accumulated = { ...prior, ...inputResponses };
    const collector = new InputCollector(accumulated);

    let result: ToolResult;
    try {
      result = await tool.handler(applyDefaults(args, tool.def.inputSchema), this.toolContext(ctx, taskParam, collector));
    } catch (e) {
      if (e instanceof InputRequired) {
        return buildInputRequiredResult(
          { [e.key]: e.request },
          encodeRequestState(accumulated),
        ) as unknown as Record<string, unknown>;
      }
      throw e;
    }
    // C12 (§16.5/§16.6): when a tool declares an outputSchema and returns
    // structuredContent (and is not reporting a tool error), it MUST conform.
    if (tool.def.outputSchema && result.structuredContent !== undefined && result.isError !== true) {
      const verdict = validateValueAgainstSchema(tool.def.outputSchema, result.structuredContent);
      if (!verdict.valid) {
        throw new ServerError(
          INTERNAL_ERROR_CODE,
          `Tool "${name}" produced structuredContent that violates its outputSchema: ${verdict.errors.join('; ')}`,
        );
      }
    }
    // A task-augmented call returns a handle: a CreateTaskResult is the Task fields
    // flattened with `resultType: "task"` (§25.3), NOT a nested `{ task }`. Otherwise
    // stamp the REQUIRED `resultType: "complete"` (§16.5).
    if (result && result.task !== undefined) {
      return { resultType: TASK_RESULT_TYPE, ...(result.task as Record<string, unknown>) };
    }
    return this.asComplete(result as Record<string, unknown>);
  }

  /** Builds the ergonomic tool context from the transport's RequestContext. */
  private toolContext(ctx: RequestContext, taskParam: { ttl?: number } | undefined, collector: InputCollector): ToolContext {
    const progressToken = ctx.meta['progressToken'] as string | number | undefined;
    const self = this;
    return {
      meta: ctx.meta,
      signal: ctx.signal,
      authInfo: ctx.authInfo,
      progressToken,
      taskRequested: taskParam !== undefined,
      taskTtlMs: taskParam?.ttl,
      log(level, message) {
        if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(self.logLevel)) return;
        ctx.notify({ method: 'notifications/message', params: { level, logger: self.info.name, data: message } });
      },
      notify: (n) => ctx.notify(n),
      // §11: solicit client input via the input_required + retry mechanism, NOT a
      // server-initiated request. Each returns the already-supplied response or throws
      // InputRequired (caught in callTool).
      elicitInput: async (p) => collector.solicit('elicitation/create', p),
      createMessage: async (p) => collector.solicit('sampling/createMessage', p),
      listRoots: async () => collector.solicit('roots/list', {}),
      sendToolListChanged: () => ctx.notify({ method: 'notifications/tools/list_changed' }),
      sendPromptListChanged: () => ctx.notify({ method: 'notifications/prompts/list_changed' }),
      sendResourceListChanged: () => ctx.notify({ method: 'notifications/resources/list_changed' }),
      sendResourceUpdated: (p) => ctx.notify({ method: 'notifications/resources/updated', params: p }),
      notifySubscribers: (n) => ctx.notifySubscribers?.(n),
    };
  }

  // ── resources ──
  private listResources(params: Record<string, unknown>): Record<string, unknown> {
    const resources = [...this.resources.values()].map((r) => ({
      uri: r.uri,
      name: r.name,
      ...(r.def.title ? { title: r.def.title } : {}),
      ...(r.def.description ? { description: r.def.description } : {}),
      ...(r.def.mimeType ? { mimeType: r.def.mimeType } : {}),
    }));
    return this.withCacheableHints(this.paginate(resources, 'resources', params));
  }

  private listResourceTemplates(params: Record<string, unknown>): Record<string, unknown> {
    const resourceTemplates = this.templates.map((t) => ({
      uriTemplate: t.def.uriTemplate,
      name: t.name,
      ...(t.def.title ? { title: t.def.title } : {}),
      ...(t.def.description ? { description: t.def.description } : {}),
      ...(t.def.mimeType ? { mimeType: t.def.mimeType } : {}),
    }));
    return this.withCacheableHints(this.paginate(resourceTemplates, 'resourceTemplates', params));
  }

  private async readResource(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const uri = params['uri'];
    if (typeof uri !== 'string') throw new ServerError(INVALID_PARAMS_CODE, 'resources/read requires a string uri');
    const direct = this.resources.get(uri);
    if (direct) return this.readResult(uri, await direct.read(uri));
    for (const tpl of this.templates) {
      const variables = matchTemplate(tpl.def.uriTemplate, uri);
      if (variables) return this.readResult(uri, await tpl.read(uri, variables));
    }
    throw new ServerError(INVALID_PARAMS_CODE, `Resource not found: ${uri}`, { uri });
  }

  /** Validates a reader's output and stamps cache hints. §17.5: a read of an existing
   * resource MUST return ≥1 content entry — empty `contents` MUST NOT signal non-existence. */
  private readResult(uri: string, read: { contents: unknown[] }): Record<string, unknown> {
    if (!Array.isArray(read.contents) || read.contents.length === 0) {
      throw new ServerError(INTERNAL_ERROR_CODE, `resources/read of "${uri}" returned no contents (§17.5)`);
    }
    return this.withCacheableHints(read);
  }

  // ── prompts ──
  private listPrompts(params: Record<string, unknown>): Record<string, unknown> {
    const prompts = [...this.prompts.values()].map((p) => ({
      name: p.name,
      ...(p.def.title ? { title: p.def.title } : {}),
      ...(p.def.description ? { description: p.def.description } : {}),
      ...(p.def.arguments
        ? {
            arguments: p.def.arguments.map(({ name, description, required }) => ({
              name,
              ...(description ? { description } : {}),
              ...(required ? { required } : {}),
            })),
          }
        : {}),
    }));
    return this.withCacheableHints(this.paginate(prompts, 'prompts', params));
  }

  private async getPrompt(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const name = params['name'];
    if (typeof name !== 'string' || !this.prompts.has(name)) {
      throw new ServerError(INVALID_PARAMS_CODE, `Unknown prompt: ${String(name)}`);
    }
    const prompt = this.prompts.get(name)!;
    const args = (params['arguments'] ?? {}) as Record<string, string>;
    // M3 (§18.4): a missing REQUIRED argument is a protocol error, not a render.
    for (const arg of prompt.def.arguments ?? []) {
      if (arg.required && (args[arg.name] === undefined || args[arg.name] === '')) {
        throw new ServerError(INVALID_PARAMS_CODE, `Missing required argument "${arg.name}" for prompt "${name}"`);
      }
    }
    const { messages } = await prompt.handler(args);
    return this.asComplete({ ...(prompt.def.description ? { description: prompt.def.description } : {}), messages });
  }

  // ── completion ──
  private complete(params: Record<string, unknown>): Record<string, unknown> {
    const ref = params['ref'] as { type?: string; name?: string; uri?: string } | undefined;
    const argument = params['argument'] as { name?: string; value?: string } | undefined;
    const value = argument?.value ?? '';
    const argName = argument?.name;
    let values: string[] = [];

    // M3 (§19.5): an unknown prompt/template/argument or an out-of-union ref.type
    // is rejected with -32602, not answered with an empty completion list.
    if (ref?.type === 'ref/prompt') {
      const prompt = ref.name ? this.prompts.get(ref.name) : undefined;
      if (!prompt) throw new ServerError(INVALID_PARAMS_CODE, `Unknown prompt for completion: ${String(ref?.name)}`);
      const arg = prompt.def.arguments?.find((a) => a.name === argName);
      if (!arg) throw new ServerError(INVALID_PARAMS_CODE, `Unknown argument "${String(argName)}" for prompt "${ref.name}"`);
      if (arg.complete) values = arg.complete(value);
    } else if (ref?.type === 'ref/resource') {
      const tpl = ref.uri ? this.templates.find((t) => t.def.uriTemplate === ref.uri) : undefined;
      if (!tpl) throw new ServerError(INVALID_PARAMS_CODE, `Unknown resource template for completion: ${String(ref?.uri)}`);
      const fn = argName ? tpl.def.complete?.[argName] : undefined;
      if (!fn) throw new ServerError(INVALID_PARAMS_CODE, `Unknown argument "${String(argName)}" for template "${ref.uri}"`);
      values = fn(value);
    } else {
      throw new ServerError(INVALID_PARAMS_CODE, `Invalid completion ref.type: ${String(ref?.type)}`);
    }

    const capped = values.slice(0, 100);
    return this.asComplete({
      completion: { values: capped, total: values.length, hasMore: values.length > capped.length },
    });
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────────

/** Encodes a numeric offset as an opaque base64 pagination cursor. (§12.1) */
function encodeCursorOffset(offset: number): string {
  return btoa(String(offset));
}

/** Decodes an opaque cursor back to an offset; returns `NaN` for an undecodable cursor. */
function decodeCursorOffset(cursor: string): number {
  try {
    return Number(atob(cursor));
  } catch {
    return NaN;
  }
}

/**
 * Thrown by a tool's `elicitInput`/`createMessage`/`listRoots` when the matching
 * client input is not yet available — caught by {@link McpServer} which converts
 * it into an `input_required` result for the §11 multi-round-trip retry loop.
 */
class InputRequired {
  constructor(
    readonly key: string,
    readonly request: InputRequest,
  ) {}
}

/**
 * Maps a tool's input solicitations (elicitation/sampling/roots) to responses
 * already supplied by the client (via `requestState` + `inputResponses`), or
 * throws {@link InputRequired} for the first one not yet answered. Keys are a
 * stable per-call-site counter so they line up across deterministic re-runs. (§11)
 */
class InputCollector {
  private index = 0;
  constructor(private readonly accumulated: Record<string, unknown>) {}
  solicit(method: InputRequest['method'], params: Record<string, unknown>): Record<string, unknown> {
    const key = `in-${++this.index}`;
    if (key in this.accumulated) return this.accumulated[key] as Record<string, unknown>;
    throw new InputRequired(key, { method, params } as InputRequest);
  }
}

/** UTF-8-safe base64 encode/decode for the opaque `requestState` continuation token. (§11.3) */
function encodeRequestState(accumulated: Record<string, unknown>): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(accumulated))));
}
function decodeRequestState(state: string): Record<string, unknown> {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(state)))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Applies top-level JSON-Schema `default`s to absent arguments (used for optional inputs). */
function applyDefaults(args: Record<string, unknown>, schema?: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema['properties'] !== 'object') return args;
  const props = schema['properties'] as Record<string, { default?: unknown }>;
  const out = { ...args };
  for (const [key, prop] of Object.entries(props)) {
    if (out[key] === undefined && prop && 'default' in prop) out[key] = prop.default;
  }
  return out;
}

/** Matches a concrete URI against an RFC 6570 `{var}` template; returns captured vars or null. */
function matchTemplate(template: string, uri: string): Record<string, string> | null {
  const names: string[] = [];
  const pattern = template.replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === '{' || ch === '}' ? ch : `\\${ch}`));
  const re = new RegExp(
    '^' +
      pattern.replace(/\{([^}]+)\}/g, (_m, n) => {
        names.push(n);
        return '([^/]+)';
      }) +
      '$',
  );
  const m = re.exec(uri);
  if (!m) return null;
  const vars: Record<string, string> = {};
  names.forEach((n, i) => (vars[n] = decodeURIComponent(m[i + 1]!)));
  return vars;
}
