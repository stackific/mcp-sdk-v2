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
import {
  INVALID_PARAMS_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
} from '../protocol/meta.js';
import {
  resolveElicitationMode,
  gateElicitationRequest,
  validateRequestedSchema,
  isValidElicitationUrl,
  ELICITATION_MODE,
} from '../protocol/elicitation.js';
import { gateSamplingToolUse } from '../protocol/sampling.js';
import { validateValueAgainstSchema } from '../protocol/tools.js';
import { buildDiscoverResult, CURRENT_PROTOCOL_VERSION, type DiscoverConfig } from '../protocol/discovery.js';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import {
  TASK_RESULT_TYPE,
  TASK_MISSING_CAPABILITY_CODE,
  mayReturnTaskHandle,
  isTasksActiveForRequest,
  buildTasksMissingCapabilityError,
} from '../protocol/tasks.js';
import {
  buildInputRequiredResult,
  mayEmitInputRequestKind,
  buildMissingCapabilityForMrtrError,
  requiredClientCapabilityForInputRequest,
  isDeprecatedInputRequestKind,
  type InputRequest,
} from '../protocol/multi-round-trip.js';
import { resolvedMinLogLevelIndex } from '../protocol/logging.js';
import { emitDeprecationWarning, findDeprecatedEntry } from '../lifecycle/registry.js';
import {
  sanitizeToolOutputText,
  enforceInputBounds,
  ToolCallRateLimiter,
  buildRateLimitRejection,
  validateResourceUriAccess,
  sanitizeFilePath,
} from '../protocol/security.js';
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
  /**
   * Reserved metadata published on this tool's `tools/list` entry — e.g.
   * `_meta.ui` to advertise an Interactive UI surface (S41/S42, §26). Emitted
   * verbatim so `McpServer` can advertise `_meta.ui` on a `tools/list` entry.
   */
  _meta?: Record<string, unknown>;
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

/**
 * The reserved per-request `_meta` key carrying a request's logging opt-in. The
 * 2026-07-28 spec removed `logging/setLevel`; logging is now a strictly
 * per-request opt-in via this key (§15.3.3, §4.3 R-4.3-d). A request that does
 * not set it receives NO `notifications/message`.
 */
const LOG_LEVEL_META_KEY = 'io.modelcontextprotocol/logLevel';

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
  /**
   * Opt-in §28.3 rate limit for `tools/call`. When set, the server rejects a call
   * that exceeds `maxInWindow` invocations per `windowMs` (per caller identity)
   * with a `-32600` error rather than executing it. (R-28.3-g, R-28.3-h) Omitted
   * ⇒ no rate limiting (back-compatible default; the embedder owns the policy).
   */
  toolCallRateLimit?: { maxInWindow: number; windowMs: number };
  /**
   * Opt-in §28.10 resource-access policy. When set, a `resources/read` URI is
   * validated BEFORE it is dereferenced: it MUST parse as an absolute URI
   * (R-28.10-f), resolve to a location `isAuthorizedLocation` permits (R-28.10-g),
   * and — with `guardSsrf` — not target a private/loopback host (R-28.10-h).
   */
  resourceAccess?: { isAuthorizedLocation: (url: URL) => boolean; guardSsrf?: boolean };
  /**
   * Opt-in §28.10 authorized `file://` root. When set, the path of a `file://`
   * `resources/read` URI is sanitized against this root and directory traversal
   * (`..`, NUL bytes, absolute escapes) is rejected BEFORE any reader runs.
   * (R-28.10-o, R-28.10-p)
   */
  fileResourceRoot?: string;
}

/**
 * The Web Crypto symmetric-key type, derived structurally from the global
 * `crypto.subtle` so the SDK needs no DOM lib (it targets `lib: ES2022` only).
 */
type ContinuationKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export class McpServer {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly resources = new Map<string, RegisteredResource>();
  private readonly templates: RegisteredTemplate[] = [];
  private readonly prompts = new Map<string, RegisteredPrompt>();
  private taskStore?: TaskStore;
  private readonly pageSize: number;
  private readonly cacheTtlMs: number;
  private readonly cacheScope: CacheScope;
  /** §28.3 tools/call rate limiter — present only when {@link McpServerOptions.toolCallRateLimit} is set. */
  private readonly rateLimiter?: ToolCallRateLimiter;
  /** §28.10 resource-access policy — present only when configured. */
  private readonly resourceAccess?: McpServerOptions['resourceAccess'];
  /** §28.10 authorized `file://` root — present only when configured. */
  private readonly fileResourceRoot?: string;
  /** Lazily-minted per-instance AES-GCM key protecting `requestState` tokens (§28.6). */
  private stateKeyPromise?: Promise<ContinuationKey>;

  constructor(
    readonly info: Implementation,
    readonly capabilities: Record<string, unknown> = {},
    options: McpServerOptions = {},
  ) {
    this.pageSize = options.pageSize ?? 50;
    this.cacheTtlMs = options.cacheTtlMs ?? 0;
    this.cacheScope = options.cacheScope ?? 'private';
    if (options.toolCallRateLimit) this.rateLimiter = new ToolCallRateLimiter(options.toolCallRateLimit);
    this.resourceAccess = options.resourceAccess;
    this.fileResourceRoot = options.fileResourceRoot;
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

  /**
   * Returns the registered `inputSchema` for tool `name`, or `undefined`. The
   * Streamable HTTP handler uses it to validate a `tools/call`'s `Mcp-Param-*`
   * headers against the body before dispatch (§9.5.4, S14/S15).
   */
  toolInputSchema(name: string): Record<string, unknown> | undefined {
    return this.tools.get(name)?.def.inputSchema;
  }

  /** Reads this request's declared client `extensions` map from `_meta.clientCapabilities`. */
  private requestClientExtensions(ctx: RequestContext): unknown {
    const caps = ctx.meta[CLIENT_CAPABILITIES_META_KEY];
    return caps && typeof caps === 'object' ? (caps as Record<string, unknown>)['extensions'] : undefined;
  }

  /** Reads this request's full declared client capabilities map from `_meta` (§4.3). */
  private requestClientCapabilities(ctx: RequestContext): Record<string, unknown> {
    const caps = ctx.meta[CLIENT_CAPABILITIES_META_KEY];
    return caps && typeof caps === 'object' && !Array.isArray(caps) ? (caps as Record<string, unknown>) : {};
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
        return this.taskOp('tasks/get', params, ctx, (store, id) => this.asComplete(store.getDetailed(id)));
      case 'tasks/cancel':
        return this.taskOp('tasks/cancel', params, ctx, (store, id) => {
          store.cancel(id);
          return this.asComplete(store.getDetailed(id));
        });
      case 'tasks/update':
        // §25.8: supply input to an input_required task, then return its DetailedTask.
        return this.taskOp('tasks/update', params, ctx, (store, id) => {
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
    ctx: RequestContext,
    op: (store: TaskStore, taskId: string) => Record<string, unknown>,
  ): Record<string, unknown> {
    // C8 (§25.7): missing the Tasks capability is -32003, not -32601.
    if (!this.taskStore) {
      throw new ServerError(TASK_MISSING_CAPABILITY_CODE, `Tasks extension not supported (required for ${method})`);
    }
    // S40 (§25.7-c / §25.8-c / §25.9-c): a `tasks/*` method from a client that did
    // NOT negotiate the Tasks extension for THIS request MUST be rejected with
    // -32003 — the extension is active only when the client declared
    // `io.modelcontextprotocol/tasks` AND the server advertises it. Without this
    // gate an un-negotiated client could drive task state it never opted into.
    if (!isTasksActiveForRequest(this.requestClientExtensions(ctx), this.capabilities['extensions'])) {
      const e = buildTasksMissingCapabilityError(method);
      throw new ServerError(e.code, e.message, e.data);
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
    // §12.3 (S18-RQ-1, server role): a cursor is gated on PRESENCE, not truthiness —
    // an empty-string `cursor:""` is a present cursor and MUST be decoded, not ignored
    // as "first page". (This server's own cursors are non-empty base64 offsets, so `""`
    // decodes to offset 0, but the gate must still treat it as supplied.)
    if (typeof cursor === 'string') {
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
      // S41/S42 (§26): publish a tool's reserved `_meta` (e.g. `_meta.ui`) on its entry.
      ...(t.def._meta ? { _meta: t.def._meta } : {}),
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

    // §28.3 (R-28.3-g, R-28.3-h): when a rate limit is configured, a tools/call that
    // exceeds it MUST be rejected (-32600), not executed.
    if (this.rateLimiter) {
      const verdict = this.rateLimiter.check(this.rateLimitKey(ctx));
      if (!verdict.allowed) {
        const e = buildRateLimitRejection(verdict.retryAfterMs);
        throw new ServerError(e.code, e.message, e.data);
      }
    }

    if (tool.def.inputSchema) {
      // §28.10 (R-28.10-k, R-28.10-l): bound the resources consumed while validating —
      // reject a pathologically deep schema OR an oversized argument payload before the
      // (recursive) value validator runs on it.
      const bounds = enforceInputBounds({ schema: tool.def.inputSchema, serializedPayload: JSON.stringify(args) });
      if (!bounds.ok) throw new ServerError(INVALID_PARAMS_CODE, `Tool input rejected: ${bounds.reason}`);
      // A schema violation is a PROTOCOL error (-32602), not a tool error.
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
    // §28.6 (R-28.6-a, R-28.6-b): the `requestState` continuation token is integrity-
    // protected (authenticated encryption). Verify it on the way in; a tampered or
    // forged token is REJECTED (-32602), never silently treated as empty state.
    let prior: Record<string, unknown> = {};
    if (typeof params['requestState'] === 'string') {
      const decoded = await this.decodeRequestState(params['requestState'] as string);
      if (!decoded.ok) {
        throw new ServerError(
          INVALID_PARAMS_CODE,
          'Invalid or tampered requestState continuation token (R-28.6-b)',
          { reason: 'integrity-validation-failed' },
        );
      }
      prior = decoded.state;
    }
    const accumulated = { ...prior, ...inputResponses };
    // The collector gates every solicitation against the client's per-request
    // capabilities, so the server cannot emit an input-request kind the client
    // never declared (§11.2-j / §11.5-g; S30–S33 server MUST NOTs).
    const collector = new InputCollector(accumulated, this.requestClientCapabilities(ctx));

    let result: ToolResult;
    try {
      result = await tool.handler(applyDefaults(args, tool.def.inputSchema), this.toolContext(ctx, taskParam, collector));
    } catch (e) {
      if (e instanceof InputRequired) {
        return buildInputRequiredResult(
          { [e.key]: e.request },
          await this.encodeRequestState(accumulated),
        ) as unknown as Record<string, unknown>;
      }
      throw e;
    }

    // §28.3 (R-28.3-i): sanitize tool-output text — strip control sequences a tool
    // could smuggle into a result — before it is returned to the client.
    result = sanitizeToolResult(result);

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
      // S39 (§25.2, R-25.2-d): a server MUST NOT substitute a task handle unless the
      // Tasks extension is active for THIS request (client declared it AND server
      // advertises it). When it is not negotiated, return the ordinary result instead
      // of leaking a task handle the client cannot consume.
      if (mayReturnTaskHandle(this.requestClientExtensions(ctx), this.capabilities['extensions'])) {
        return { resultType: TASK_RESULT_TYPE, ...(result.task as Record<string, unknown>) };
      }
      const { task: _ungated, ...ordinary } = result;
      return this.asComplete(ordinary as Record<string, unknown>);
    }
    return this.asComplete(result as Record<string, unknown>);
  }

  /** A stable per-caller key for the §28.3 tools/call rate limiter (auth identity, else client id). */
  private rateLimitKey(ctx: RequestContext): string {
    const id = ctx.authInfo ?? ctx.meta[CLIENT_INFO_META_KEY] ?? 'anonymous';
    return typeof id === 'string' ? id : JSON.stringify(id);
  }

  // ── §28.6 — requestState continuation-token integrity ──
  //
  // The 2026-07-28 model is stateless (§4.4, §9.9), so the continuation state is
  // carried in the opaque `requestState` token itself rather than a server-side
  // session. To honor R-28.6-a/b without reintroducing session state, the token is
  // protected with authenticated encryption (AES-GCM) under a per-instance key:
  // this gives BOTH integrity (tamper/forgery is detected) and confidentiality (the
  // client cannot read the state), and authenticated decryption fails closed so a
  // tampered token is rejected rather than acted upon. (A stateful single-use
  // `ContinuationTokenStore` would protect integrity too, but would break the
  // stateless guarantee across instances — statelessness wins per the spec.)

  /** Lazily mints the per-instance AES-GCM key protecting `requestState` tokens. */
  private getStateKey(): Promise<ContinuationKey> {
    if (!this.stateKeyPromise) {
      this.stateKeyPromise = crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      ) as Promise<ContinuationKey>;
    }
    return this.stateKeyPromise;
  }

  /**
   * Encodes accumulated multi-round-trip state into an integrity-protected,
   * confidential `requestState` token the client echoes verbatim. (§28.6, R-28.6-a)
   */
  private async encodeRequestState(accumulated: Record<string, unknown>): Promise<string> {
    const key = await this.getStateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(accumulated));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    return `${base64UrlFromBytes(iv)}.${base64UrlFromBytes(ciphertext)}`;
  }

  /**
   * Verifies and decodes a `requestState` token. Authenticated decryption fails
   * closed, so a tampered/forged/foreign token yields `{ ok: false }` and the caller
   * MUST reject it rather than act on its contents. (§28.6, R-28.6-b)
   */
  private async decodeRequestState(
    token: string,
  ): Promise<{ ok: true; state: Record<string, unknown> } | { ok: false }> {
    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) return { ok: false };
    let iv: Uint8Array;
    let ciphertext: Uint8Array;
    try {
      iv = base64UrlToBytes(token.slice(0, dot));
      ciphertext = base64UrlToBytes(token.slice(dot + 1));
    } catch {
      return { ok: false };
    }
    try {
      const key = await this.getStateKey();
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      const state = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
      if (typeof state !== 'object' || state === null || Array.isArray(state)) return { ok: false };
      return { ok: true, state: state as Record<string, unknown> };
    } catch {
      return { ok: false };
    }
  }

  /** Builds the ergonomic tool context from the transport's RequestContext. */
  private toolContext(ctx: RequestContext, taskParam: { ttl?: number } | undefined, collector: InputCollector): ToolContext {
    const progressToken = ctx.meta['progressToken'] as string | number | undefined;
    const serverName = this.info.name;
    return {
      meta: ctx.meta,
      signal: ctx.signal,
      authInfo: ctx.authInfo,
      progressToken,
      taskRequested: taskParam !== undefined,
      taskTtlMs: taskParam?.ttl,
      log(level, message) {
        // §15.3.3 (R-15.3.3-a/b/d): emit a `notifications/message` ONLY when THIS
        // request opted in via `_meta.io.modelcontextprotocol/logLevel`, and only at
        // or above that requested severity. With no opt-in nothing is emitted; there
        // is no global/server log level (the 2026-07-28 spec removed `logging/setLevel`).
        const minIndex = resolvedMinLogLevelIndex(ctx.meta[LOG_LEVEL_META_KEY]);
        if (minIndex < 0) return;
        const levelIndex = LOG_LEVELS.indexOf(level);
        if (levelIndex < 0 || levelIndex < minIndex) return;
        ctx.notify({ method: 'notifications/message', params: { level, logger: serverName, data: message } });
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
    // §28.10 (R-28.10-f/g/h): when a resource-access policy is configured, validate
    // the URI BEFORE dereferencing it — a malformed, unauthorized, or SSRF-target URI
    // is rejected rather than fetched.
    if (this.resourceAccess) {
      const verdict = validateResourceUriAccess(uri, this.resourceAccess);
      if (!verdict.ok) throw new ServerError(INVALID_PARAMS_CODE, `Resource access denied: ${verdict.reason}`, { uri });
    }
    // §28.10 (R-28.10-o/p): when a `file://` root is configured, sanitize the path and
    // reject directory traversal (`..`, NUL bytes, absolute escapes) before any reader.
    if (this.fileResourceRoot !== undefined && uri.startsWith('file://')) {
      const verdict = sanitizeFilePath(filePathFromUri(uri), this.fileResourceRoot);
      if (!verdict.ok) throw new ServerError(INVALID_PARAMS_CODE, `Resource access denied: ${verdict.reason}`, { uri });
    }
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

/** Maps a Deprecated input-request kind to its deprecated-registry feature name (RC-7). */
const DEPRECATED_INPUT_KIND_FEATURE: Readonly<Record<string, string>> = {
  'sampling/createMessage': 'Sampling capability',
  'roots/list': 'Roots capability',
};

/**
 * Maps a tool's input solicitations (elicitation/sampling/roots) to responses
 * already supplied by the client (via `requestState` + `inputResponses`), or
 * throws {@link InputRequired} for the first one not yet answered. Keys are a
 * stable per-call-site counter so they line up across deterministic re-runs. (§11)
 */
class InputCollector {
  private index = 0;
  constructor(
    private readonly accumulated: Record<string, unknown>,
    /** The client's per-request declared capabilities (§4.3), gating each kind. */
    private readonly clientCapabilities: Record<string, unknown>,
  ) {}
  solicit(method: InputRequest['method'], params: Record<string, unknown>): Record<string, unknown> {
    const key = `in-${++this.index}`;
    if (key in this.accumulated) return this.accumulated[key] as Record<string, unknown>;
    // S17 / S30–S33 (§11.2-j, §11.5-g): a server MUST NOT emit an input-request kind
    // the client did not declare. Withhold it and reject with -32003 rather than
    // soliciting an `elicitation/create` / `sampling/createMessage` / `roots/list`
    // the client never opted into. (The gate runs only when the response is not
    // already supplied — a previously-answered key implies the client supports it.)
    if (!mayEmitInputRequestKind(method, this.clientCapabilities)) {
      const cap = requiredClientCapabilityForInputRequest(method) ?? method;
      const e = buildMissingCapabilityForMrtrError({ [cap]: {} });
      throw new ServerError(e.code, e.message, e.data);
    }
    // S30 (§20.1, R-20.1-d MUST NOT): beyond the kind, an `elicitation/create`'s MODE
    // must be one the client declared (form is implicit; url needs `elicitation.url`),
    // and the outgoing params must be well-formed for that mode.
    if (method === 'elicitation/create') {
      const mode = resolveElicitationMode(params);
      if (mode === undefined) {
        throw new ServerError(
          INVALID_PARAMS_CODE,
          `Cannot solicit elicitation/create: unknown mode "${String(params['mode'])}" (§20.3)`,
        );
      }
      const gate = gateElicitationRequest(this.clientCapabilities, mode);
      if (!gate.ok) {
        throw new ServerError(
          MISSING_CLIENT_CAPABILITY_CODE,
          gate.rejection.reason === 'mode-not-supported'
            ? `Cannot solicit elicitation/create: the client does not support "${gate.rejection.mode}" mode (R-20.1-d)`
            : 'Cannot solicit elicitation/create: the client did not declare the elicitation capability (R-20.1-e)',
          { requiredCapabilities: { elicitation: mode === ELICITATION_MODE.URL ? { url: {} } : {} } },
        );
      }
      if (mode === ELICITATION_MODE.FORM && params['requestedSchema'] !== undefined) {
        const verdict = validateRequestedSchema(params['requestedSchema']);
        if (!verdict.valid) {
          throw new ServerError(INVALID_PARAMS_CODE, 'Cannot solicit elicitation/create: malformed requestedSchema (§20.4)');
        }
      }
      if (mode === ELICITATION_MODE.URL && !isValidElicitationUrl(params['url'])) {
        throw new ServerError(INVALID_PARAMS_CODE, 'Cannot solicit elicitation/create: url-mode request has no valid url (R-20.1-d)');
      }
    }
    // S33 (§21.2.3, R-21.2.3-a MUST NOT): a `sampling/createMessage` carrying
    // `tools`/`toolChoice` may only go to a client that declared `sampling.tools`.
    if (method === 'sampling/createMessage') {
      const gate = gateSamplingToolUse(this.clientCapabilities, params as { tools?: unknown; toolChoice?: unknown });
      if (!gate.ok) {
        throw new ServerError(gate.error.code, gate.error.message);
      }
    }
    // RC-7 (§27.4): soliciting a Deprecated capability (sampling/roots) emits an
    // advisory, OUT-OF-BAND deprecation warning — never on the wire — so an embedder
    // notices it is exercising a feature scheduled for removal. (R-27.4-d/-e)
    if (isDeprecatedInputRequestKind(method)) {
      const entry = findDeprecatedEntry(DEPRECATED_INPUT_KIND_FEATURE[method] ?? '');
      if (entry) emitDeprecationWarning(entry.feature, entry.migrationNote);
    }
    throw new InputRequired(key, { method, params } as InputRequest);
  }
}

/**
 * §28.3 (R-28.3-i): returns a copy of a tool result with control sequences stripped
 * from every text content block, so a tool cannot smuggle ANSI/escape sequences
 * into a result. Non-text blocks and `structuredContent` are left untouched; the
 * input is never mutated and is returned as-is when nothing changed.
 */
function sanitizeToolResult(result: ToolResult): ToolResult {
  if (!Array.isArray(result.content)) return result;
  let changed = false;
  const content = result.content.map((block) => {
    if (block && typeof block === 'object' && (block as Record<string, unknown>)['type'] === 'text') {
      const text = (block as Record<string, unknown>)['text'];
      if (typeof text === 'string') {
        const clean = sanitizeToolOutputText(text);
        if (clean !== text) {
          changed = true;
          return { ...(block as Record<string, unknown>), text: clean };
        }
      }
    }
    return block;
  });
  return changed ? { ...result, content } : result;
}

/** Extracts the (percent-decoded) path from a `file://` URI for traversal sanitization. */
function filePathFromUri(uri: string): string {
  try {
    return decodeURIComponent(new URL(uri).pathname);
  } catch {
    return uri;
  }
}

/** URL-safe base64 (no padding) encode of raw bytes — used for the `requestState` token. */
function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes URL-safe base64 (no padding) back to raw bytes; throws on malformed input. */
function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
