/**
 * MCP client host (2026-07-28) — the high-level counterpart to the SDK's server
 * harness. It owns the client-side runtime the specification deliberately leaves
 * to an embedder:
 *
 *   - stamps every outgoing request with the REQUIRED per-request `_meta`
 *     envelope — protocol version, client identity, client capabilities (§4.3);
 *   - correlates responses to requests by JSON-RPC id, over any {@link Transport}
 *     (S12 {@link RequestCorrelator});
 *   - routes inbound server→client requests (sampling/elicitation/roots, §20–§21)
 *     and notifications (progress/logging/list-changed) to registered handlers,
 *     and posts each handler's result back as the JSON-RPC response;
 *   - performs discovery + revision negotiation (`server/discover`, §5.3–§5.4);
 *   - supports cancellation (`notifications/cancelled`, §15.2), per-request
 *     timeouts, and progress correlation (§15.1).
 *
 * Statelessness (§4.4, §7.6): the client holds no session. Discovery results are
 * cached only to populate status and to drive the negotiated revision placed in
 * each request's `_meta`; the connection itself carries no conversational state.
 *
 * Edge-friendly: pure Web-platform APIs and no `node:*`. Pair it with
 * {@link StreamableHTTPClientTransport} for HTTP, or any conforming transport.
 */
import { classifyMessage, type JSONRPCMessage, type RequestId } from '../jsonrpc/framing.js';
import { RequestCorrelator } from '../transport/correlation.js';
import { TransportError, type Transport, type Unsubscribe } from '../transport/contract.js';
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '../protocol/meta.js';
import {
  buildDiscoverRequest,
  CURRENT_PROTOCOL_VERSION,
  DiscoverResultSchema,
  type DiscoverResult,
} from '../protocol/discovery.js';
import { negotiateRevision, IncompatibleProtocolError } from '../protocol/negotiation.js';
import { adoptLatestPollIntervalMs, isPollingTerminalResponse } from '../protocol/tasks-lifecycle.js';
import {
  discriminateResultType,
  MrtrRoundGuard,
  isLoadSheddingResult,
  computeRetryBackoffMs,
} from '../protocol/multi-round-trip.js';
import {
  SUBSCRIPTIONS_LISTEN_METHOD,
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  subscriptionIdFromRequestId,
  readSubscriptionId,
  type SubscriptionFilter,
} from '../protocol/streaming.js';
import type { Implementation } from '../types/implementation.js';
// SH1 — Zod-inferred result types, surfaced as the return types of the C1
// convenience methods so callers get typed `result` access without re-parsing.
import type { ListToolsResult } from '../protocol/tools.js';
import { filterValidTools, buildParamHeaders } from '../transport/http/param-headers.js';
import type { CallToolResult } from '../protocol/tools-call.js';
import type { ListResourcesResult, ListResourceTemplatesResult } from '../protocol/resources.js';
import type { ReadResourceResult } from '../protocol/resources-read.js';
import type { ListPromptsResult, GetPromptResult } from '../protocol/prompts.js';
import type { CompleteResult } from '../protocol/completion.js';

/** JSON-RPC "Method not found" — sent when no handler is registered for a server→client request. */
const METHOD_NOT_FOUND_CODE = -32601;
/** JSON-RPC "Internal error" — the fallback code for a throwing request handler. */
const INTERNAL_ERROR_CODE = -32603;
/** MCP "Unsupported protocol version" (§5.5) — triggers a one-shot revision reselect + retry. */
const UNSUPPORTED_PROTOCOL_VERSION_CODE = -32004;
/** HTTP "HeaderMismatch" (§9.8) — a missing/required custom `Mcp-Param-*` header triggers a schema refresh + retry. */
const HEADER_MISMATCH_CODE = -32001;

/**
 * Handles an inbound server→client request (e.g. `sampling/createMessage`,
 * `elicitation/create`, `roots/list`). The returned object becomes the JSON-RPC
 * `result`; throwing a {@link RequestError} maps to a JSON-RPC error response.
 */
export type RequestHandler = (
  params: Record<string, unknown>,
  extra: { id: RequestId; method: string },
) => unknown | Promise<unknown>;

/** Handles an inbound notification (one-way; never answered). */
export type NotificationHandler = (params: Record<string, unknown>) => void;

/** Receives a `notifications/progress` payload correlated to a request's progress token. */
export type ProgressHandler = (progress: Record<string, unknown>) => void;

/** Per-call options for {@link Client.request} / {@link Client.callTool}. */
export interface RequestOptions {
  /** Abort the request; sends `notifications/cancelled` and rejects locally. (§15.2) */
  signal?: AbortSignal;
  /** Reject (and cancel) the request if no response arrives within this many ms. */
  timeoutMs?: number;
  /** Receive correlated `notifications/progress` for this request. (§15.1) */
  onProgress?: ProgressHandler;
  /** Explicit progress token; one is derived from the request id when omitted. */
  progressToken?: string | number;
}

/** Construction options for {@link Client}. */
export interface ClientOptions {
  /** Capabilities declared in every request's `_meta`. (§6.2) Defaults to `{}`. */
  capabilities?: Record<string, unknown>;
  /** Acceptable protocol revisions, most-preferred first. Defaults to `[CURRENT_PROTOCOL_VERSION]`. */
  protocolVersions?: string[];
  /**
   * Optional sink for advisory client warnings — e.g. a `tools/list` tool dropped
   * because its `x-mcp-header` annotation is invalid (§9.5.1, R-9.5.1-k). Injected
   * rather than a hard `console` dependency so the SDK stays edge-safe/testable.
   */
  logger?: { warn(message: string): void };
}

/**
 * A delivered JSON-RPC error response surfaced as a thrown error. Distinct from
 * {@link TransportError} (a channel failure): this means the request was fully
 * delivered and the peer answered with an `error`. (§7.5)
 */
export class RequestError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A paginated list result: a method-specific item array plus an optional `nextCursor`. (§12.2) */
export interface ListResult {
  /** The page array lives under a method-specific key (`tools`, `resources`, `prompts`, …). */
  [key: string]: unknown;
  /** Opaque cursor for the next page; absent at the end. */
  nextCursor?: string;
}

/** A handle to an active subscription opened via {@link Client.subscribe}. (§10) */
export interface SubscriptionHandle {
  /** The server-assigned subscription id (`io.modelcontextprotocol/subscriptionId`). */
  subscriptionId: string;
  /** The honored subset of the requested filter, from the acknowledgement. */
  acknowledgedFilter: Record<string, unknown>;
  /** Resolves when the subscription stream ends (teardown / unsubscribe / disconnect). */
  closed: Promise<void>;
  /** Tears the subscription down (sends `notifications/cancelled` for the listen request). */
  unsubscribe(): Promise<void>;
}

export class Client {
  private transport: Transport | null = null;
  private readonly correlator = new RequestCorrelator();
  private readonly requestHandlers = new Map<string, RequestHandler>();
  private readonly notificationHandlers = new Map<string, NotificationHandler>();
  private readonly progressHandlers = new Map<string, ProgressHandler>();
  private readonly subscriptions: Unsubscribe[] = [];
  /** Active subscriptions: subscriptionId → change-notification callback. (§10) */
  private readonly subscriptionRouters = new Map<string, (method: string, params: Record<string, unknown>) => void>();
  /** Pending subscribe() calls awaiting their acknowledgement, keyed by subscriptionId. */
  private readonly subscriptionAcks = new Map<string, (params: Record<string, unknown>) => void>();
  /** Tool inputSchemas learned from tools/list, used to derive Mcp-Param-* headers. (§9.5.2) */
  private readonly toolSchemas = new Map<string, unknown>();
  private idSeq = 0;

  private readonly preferredVersions: string[];
  private negotiatedVersion: string | null = null;
  private serverInfo: Implementation | null = null;
  private serverCapabilities: Record<string, unknown> | null = null;
  private instructions: string | null = null;

  constructor(
    /** This client's `Implementation` identity, stamped into every request's `_meta` (§4.3). */
    readonly clientInfo: Implementation,
    /** Declared capabilities and acceptable protocol revisions. */
    readonly options: ClientOptions = {},
  ) {
    this.preferredVersions =
      options.protocolVersions && options.protocolVersions.length > 0
        ? [...options.protocolVersions]
        : [CURRENT_PROTOCOL_VERSION];
  }

  /** The capabilities declared in every request envelope. */
  get capabilities(): Record<string, unknown> {
    return this.options.capabilities ?? {};
  }

  /**
   * Binds a transport and starts routing inbound frames. Lightweight and
   * synchronous — it performs no handshake (the 2026-07-28 model has none); call
   * {@link discover} to learn server identity/capabilities and the negotiated
   * revision.
   */
  connect(transport: Transport): void {
    if (this.transport) throw new TransportError('client is already connected to a transport');
    this.transport = transport;
    this.subscriptions.push(
      transport.onMessage((message) => {
        void this.handleInbound(message);
      }),
      transport.onClose(() => {
        this.correlator.failAll(new TransportError('transport closed'));
      }),
    );
    // §9.5.2: if the transport supports param-header routing, derive Mcp-Param-* headers
    // for a tools/call from the tool's x-mcp-header annotations (learned via tools/list).
    const paramAware = transport as Partial<{
      setParamHeaderResolver: (fn: (method: string, params: Record<string, unknown> | undefined) => Record<string, string>) => void;
    }>;
    paramAware.setParamHeaderResolver?.((method, params) => {
      if (method !== 'tools/call' || !params) return {};
      const schema = typeof params['name'] === 'string' ? this.toolSchemas.get(params['name']) : undefined;
      if (schema === undefined) return {};
      return buildParamHeaders(schema, (params['arguments'] ?? {}) as Record<string, unknown>);
    });
  }

  /** Tears down handlers, fails any outstanding requests, and closes the transport. */
  async close(): Promise<void> {
    for (const unsubscribe of this.subscriptions.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // unsubscribe must not block close
      }
    }
    this.correlator.failAll(new TransportError('client closed'));
    const transport = this.transport;
    this.transport = null;
    if (transport) await transport.close();
  }

  // ── Handler registration ─────────────────────────────────────────────────────

  /** Registers the handler for an inbound server→client request `method`. */
  setRequestHandler(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  removeRequestHandler(method: string): void {
    this.requestHandlers.delete(method);
  }

  /** Registers the handler for an inbound notification `method`. */
  setNotificationHandler(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  removeNotificationHandler(method: string): void {
    this.notificationHandlers.delete(method);
  }

  // ── Negotiated status (populated by discover) ────────────────────────────────

  /** The server's `Implementation` identity from the last {@link discover}, or `null`. */
  getServerVersion(): Implementation | null {
    return this.serverInfo;
  }

  /** The server's advertised capabilities from the last {@link discover}, or `null`. */
  getServerCapabilities(): Record<string, unknown> | null {
    return this.serverCapabilities;
  }

  /** The negotiated protocol revision, or `null` before a successful {@link discover}. */
  getNegotiatedVersion(): string | null {
    return this.negotiatedVersion;
  }

  /** The server's free-text usage instructions from the last {@link discover}, or `null`. */
  getInstructions(): string | null {
    return this.instructions;
  }

  /** The protocol revision placed in outgoing `_meta`: negotiated, else most-preferred. */
  protocolVersion(): string {
    return this.negotiatedVersion ?? this.preferredVersions[0] ?? CURRENT_PROTOCOL_VERSION;
  }

  // ── Discovery (§5.3–§5.4) ────────────────────────────────────────────────────

  /**
   * Calls `server/discover`, caches the server identity/capabilities/instructions,
   * and selects the highest mutually supported revision via {@link negotiateRevision}.
   * Returns the raw `DiscoverResult`. Throws {@link RequestError} if the server
   * rejects discovery (e.g. an older server that lacks the method).
   */
  async discover(): Promise<DiscoverResult> {
    let result: Record<string, unknown>;
    try {
      result = await this.sendDiscover();
    } catch (e) {
      // §5.5: discovery itself may be answered with -32004 — reselect + retry once.
      if (e instanceof RequestError && e.code === UNSUPPORTED_PROTOCOL_VERSION_CODE) {
        this.reselectRevisionOrThrow(e);
        result = await this.sendDiscover();
      } else {
        throw e;
      }
    }

    const parsed = DiscoverResultSchema.safeParse(result);
    if (parsed.success) {
      this.serverInfo = parsed.data.serverInfo;
      this.serverCapabilities = parsed.data.capabilities;
      this.instructions = parsed.data.instructions ?? null;
      const negotiation = negotiateRevision(this.preferredVersions, parsed.data.supportedVersions);
      this.negotiatedVersion = negotiation.ok ? negotiation.selected : null;
    }
    return result as DiscoverResult;
  }

  /** Sends one `server/discover` with the currently selected revision (no retry). */
  private async sendDiscover(): Promise<Record<string, unknown>> {
    const id = this.nextId();
    const request = buildDiscoverRequest(id, this.protocolVersion(), this.clientInfo, this.capabilities);
    return this.roundTrip(id, request as unknown as Record<string, unknown>);
  }

  /**
   * Reacts to a `-32004` (UnsupportedProtocolVersion) error: reselects a mutually
   * supported revision from the error's authoritative `data.supported` set and records
   * it as the negotiated revision (so the caller's one-shot retry uses it). Throws
   * {@link IncompatibleProtocolError} when no revision overlaps — the client MUST NOT
   * retry indefinitely. (§5.5, R-5.5-h, R-5.5-i, R-5.5-j)
   */
  private reselectRevisionOrThrow(error: RequestError): void {
    const data = error.data as { supported?: unknown } | undefined;
    const supported = Array.isArray(data?.supported) ? (data.supported as string[]) : [];
    const negotiation = negotiateRevision(this.preferredVersions, supported);
    if (!negotiation.ok) {
      throw new IncompatibleProtocolError(this.preferredVersions, supported);
    }
    this.negotiatedVersion = negotiation.selected;
  }

  // ── Requests / notifications ─────────────────────────────────────────────────

  /**
   * Sends a JSON-RPC request, attaching the required `_meta` envelope, and
   * resolves with the `result`. Rejects with {@link RequestError} for a delivered
   * error response, or {@link TransportError} for a channel failure / cancellation.
   */
  async request(
    req: { method: string; params?: Record<string, unknown> },
    options?: RequestOptions,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.sendOnce(req, options);
    } catch (e) {
      // §5.5 (R-5.5-h/i/j / R-29.3-c): on an UnsupportedProtocolVersion (-32004),
      // reselect a mutually-supported revision from the server's authoritative
      // `data.supported` set and retry ONCE; surface IncompatibleProtocolError when
      // nothing overlaps. Never retry indefinitely.
      if (e instanceof RequestError && e.code === UNSUPPORTED_PROTOCOL_VERSION_CODE) {
        this.reselectRevisionOrThrow(e);
        return this.sendOnce(req, options);
      }
      throw e;
    }
  }

  /** Builds and sends one request with the currently selected revision (no retry). */
  private async sendOnce(
    req: { method: string; params?: Record<string, unknown> },
    options?: RequestOptions,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId();
    const { _meta: callerMeta, ...rest } = (req.params ?? {}) as Record<string, unknown>;

    const envelope: Record<string, unknown> = {
      ...(isObject(callerMeta) ? callerMeta : {}),
      [PROTOCOL_VERSION_META_KEY]: this.protocolVersion(),
      [CLIENT_INFO_META_KEY]: this.clientInfo,
      [CLIENT_CAPABILITIES_META_KEY]: this.capabilities,
    };

    let progressToken: string | number | undefined;
    if (options?.onProgress || options?.progressToken !== undefined) {
      progressToken = options.progressToken ?? id;
      envelope['progressToken'] = progressToken;
      if (options.onProgress) this.progressHandlers.set(progressKey(progressToken), options.onProgress);
    }

    const message = {
      jsonrpc: '2.0' as const,
      id,
      method: req.method,
      params: { ...rest, _meta: envelope },
    };
    return this.roundTrip(id, message, options, progressToken);
  }

  /** Convenience wrapper for `tools/call`; returns the typed {@link CallToolResult}. (§16.5) */
  async callTool(
    params: { name: string; arguments?: Record<string, unknown>; _meta?: Record<string, unknown> },
    options?: RequestOptions,
  ): Promise<CallToolResult> {
    const toolParams: Record<string, unknown> = {
      name: params.name,
      arguments: params.arguments ?? {},
    };
    if (params._meta) toolParams['_meta'] = params._meta;
    try {
      return (await this.request({ method: 'tools/call', params: toolParams }, options)) as CallToolResult;
    } catch (e) {
      // §9.5.2 (R-9.5.2-m): a -32001 (HeaderMismatch) may mean the server requires a
      // custom Mcp-Param-* header the client didn't send because its cached tool schema
      // is stale/absent. Refresh the schema via tools/list and retry the call ONCE with
      // corrected headers; a second failure (or any other error) propagates. Single-shot.
      if (e instanceof RequestError && e.code === HEADER_MISMATCH_CODE) {
        await this.listTools();
        return (await this.request({ method: 'tools/call', params: toolParams }, options)) as CallToolResult;
      }
      throw e;
    }
  }

  /** Sends a one-way notification. */
  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.transport) throw new TransportError('client is not connected');
    const message = { jsonrpc: '2.0' as const, method, ...(params ? { params } : {}) };
    await this.transport.send(message as unknown as JSONRPCMessage);
  }

  // ── C1: typed convenience methods (§16–§19) ──────────────────────────────────

  /** `ping` — a no-op round-trip to check liveness. */
  ping(options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request({ method: 'ping' }, options);
  }

  /** `tools/list` — one page of tools (pass a cursor, or use {@link listAllTools}). (§16.2) */
  async listTools(cursor?: string, options?: RequestOptions): Promise<ListToolsResult> {
    // §12.3 (R-12.3-e): an explicit cursor is echoed verbatim, including the empty
    // string `""` (a present cursor). Gate on presence (`!== undefined`), never on
    // truthiness — `cursor ? … : …` would silently drop a `""` the caller passed.
    const result = (await this.request({ method: 'tools/list', params: cursor !== undefined ? { cursor } : {} }, options)) as ListToolsResult;
    // M1 (§9.5.1): exclude tools whose `x-mcp-header` parameter annotations are invalid,
    // keeping every valid tool usable. (R-9.5.1-i/j) Tools without annotations are unaffected.
    if (Array.isArray(result.tools)) {
      const { tools: validTools, warnings } = filterValidTools(result.tools as never);
      result.tools = validTools as never;
      // §9.5.1 (R-9.5.1-k): surface each dropped tool — naming the tool and the reason —
      // through the injected logger so the host can see WHY a tool became unusable.
      for (const warning of warnings) {
        this.options.logger?.warn(`tools/list: dropped tool "${warning.tool}" — ${warning.reason}`);
      }
      // §9.5.2: remember each tool's inputSchema so a later tools/call can emit Mcp-Param-*.
      for (const t of result.tools as Array<{ name?: unknown; inputSchema?: unknown }>) {
        if (typeof t.name === 'string') this.toolSchemas.set(t.name, t.inputSchema);
      }
    }
    return result;
  }

  /** `resources/list` — one page of resources. (§17.2) */
  async listResources(cursor?: string, options?: RequestOptions): Promise<ListResourcesResult> {
    // Echo an explicit cursor verbatim, including `""`. (§12.3, R-12.3-e)
    return (await this.request({ method: 'resources/list', params: cursor !== undefined ? { cursor } : {} }, options)) as ListResourcesResult;
  }

  /** `resources/templates/list` — one page of resource templates. (§17.3) */
  async listResourceTemplates(cursor?: string, options?: RequestOptions): Promise<ListResourceTemplatesResult> {
    // Echo an explicit cursor verbatim, including `""`. (§12.3, R-12.3-e)
    return (await this.request({ method: 'resources/templates/list', params: cursor !== undefined ? { cursor } : {} }, options)) as ListResourceTemplatesResult;
  }

  /** `resources/read` — read a resource by URI. (§17.5) */
  async readResource(uri: string, options?: RequestOptions): Promise<ReadResourceResult> {
    return (await this.request({ method: 'resources/read', params: { uri } }, options)) as ReadResourceResult;
  }

  /** `prompts/list` — one page of prompts. (§18.2) */
  async listPrompts(cursor?: string, options?: RequestOptions): Promise<ListPromptsResult> {
    // §18.1-b: a client MUST NOT issue a prompts/* request unless the server advertised
    // the `prompts` capability. Fail fast on the gate rather than send an unsupported call.
    this.assertServerCapability('prompts');
    // Echo an explicit cursor verbatim, including `""`. (§12.3, R-12.3-e)
    return (await this.request({ method: 'prompts/list', params: cursor !== undefined ? { cursor } : {} }, options)) as ListPromptsResult;
  }

  /** `prompts/get` — resolve a prompt with arguments. (§18.4) */
  async getPrompt(name: string, args?: Record<string, string>, options?: RequestOptions): Promise<GetPromptResult> {
    // §18.1-b: gate on the advertised `prompts` capability before sending.
    this.assertServerCapability('prompts');
    return (await this.request({ method: 'prompts/get', params: { name, arguments: args ?? {} } }, options)) as GetPromptResult;
  }

  /** `completion/complete` — argument autocompletion. (§19.2) */
  async complete(ref: unknown, argument: unknown, context?: unknown, options?: RequestOptions): Promise<CompleteResult> {
    // §19.1-c: a client MUST NOT issue completion/complete unless the server advertised
    // the `completions` capability. Fail fast on the gate.
    this.assertServerCapability('completions');
    return (await this.request({ method: 'completion/complete', params: { ref, argument, ...(context !== undefined ? { context } : {}) } }, options)) as CompleteResult;
  }

  // ── C4: pagination auto-iteration (§12) ──────────────────────────────────────

  /**
   * Lazily iterates every item of a paginated list method, following `nextCursor`
   * until the server stops returning one. (§12.3)
   *
   * @param method   - The paginated list method (e.g. `'tools/list'`).
   * @param itemsKey - The result key holding the page array (e.g. `'tools'`).
   */
  async *paginate<T = Record<string, unknown>>(
    method: string,
    itemsKey: string,
    options?: RequestOptions,
  ): AsyncGenerator<T> {
    // §12.3: drive the loop on a PRESENCE sentinel, not truthiness. A server may
    // return `nextCursor: ""`; per R-12.3-d the empty string is a *present* cursor
    // that means "more pages follow", and per R-12.3-e it MUST be echoed verbatim on
    // the next request. The previous `while (cursor)` / `cursor ? { cursor } : {}`
    // treated `""` as end-of-list and dropped it, truncating the iteration.
    let cursor: string | undefined = undefined;
    do {
      const result = await this.request({ method, params: cursor !== undefined ? { cursor } : {} }, options);
      for (const item of (result[itemsKey] as T[] | undefined) ?? []) yield item;
      cursor = typeof result['nextCursor'] === 'string' ? (result['nextCursor'] as string) : undefined;
    } while (cursor !== undefined);
  }

  /** Iterates all tools across pages. (§16.2) */
  listAllTools(options?: RequestOptions): AsyncGenerator<Record<string, unknown>> {
    return this.paginate('tools/list', 'tools', options);
  }
  /** Iterates all resources across pages. (§17.2) */
  listAllResources(options?: RequestOptions): AsyncGenerator<Record<string, unknown>> {
    return this.paginate('resources/list', 'resources', options);
  }
  /** Iterates all prompts across pages. (§18.2) */
  listAllPrompts(options?: RequestOptions): AsyncGenerator<Record<string, unknown>> {
    // §18.1-b: gate on the advertised `prompts` capability before paginating.
    this.assertServerCapability('prompts');
    return this.paginate('prompts/list', 'prompts', options);
  }

  // ── C7: capability guards (§6) ───────────────────────────────────────────────

  /** Returns `true` when the last {@link discover} advertised the named server capability. */
  serverSupports(capability: string): boolean {
    const caps = this.serverCapabilities;
    return !!caps && caps[capability] !== undefined;
  }

  /** Throws unless the server advertised `capability` — fail fast before a round-trip. (§6.4) */
  assertServerCapability(capability: string): void {
    if (!this.serverSupports(capability)) {
      throw new RequestError(-32003, `Server does not advertise the "${capability}" capability`);
    }
  }

  // ── C5: Tasks extension client helpers (§25) ─────────────────────────────────

  /** Augmented `tools/call` that runs as a task and returns a task handle. (§25.3) */
  async createTask(
    name: string,
    args?: Record<string, unknown>,
    options?: RequestOptions & { ttlMs?: number | null },
  ): Promise<Record<string, unknown>> {
    const ttl = options?.ttlMs === undefined ? 300000 : options.ttlMs;
    return this.request({ method: 'tools/call', params: { name, arguments: args ?? {}, task: { ttl } } }, options);
  }

  /**
   * `tasks/get` — the task's current `DetailedTask` (status plus the inline outcome
   * once terminal: `result` when completed, `error` when failed). There is no
   * separate `tasks/result` in this revision — the payload is carried here. (§25.7)
   */
  getTask(taskId: string, options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request({ method: 'tasks/get', params: { taskId } }, options);
  }
  /** `tasks/update` — supply input to an `input_required` task. (§25.8) */
  updateTask(
    taskId: string,
    inputResponses: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Record<string, unknown>> {
    return this.request({ method: 'tasks/update', params: { taskId, inputResponses } }, options);
  }
  /** `tasks/cancel` — request cancellation of a task. (§25.9) */
  cancelTask(taskId: string, options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request({ method: 'tasks/cancel', params: { taskId } }, options);
  }

  /**
   * Polls `tasks/get` until the task reaches a terminal status
   * (`completed`/`failed`/`cancelled`), then returns the final task object.
   * (§25.5) Honors `signal` and an overall `timeoutMs`.
   *
   * Resume after restart (§25.6): the `taskId` is opaque and server-durable, so a
   * host that needs to survive a process restart simply persists the `taskId` it
   * received from {@link createTask} (or any task-augmented call) and, on a fresh
   * {@link Client}, calls this method with that id to resume polling — no in-SDK
   * durable store is required (the persistence backend is the host's to choose).
   */
  async pollTaskUntilTerminal(
    taskId: string,
    options?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
  ): Promise<Record<string, unknown>> {
    // §25.4 (R-25.4-d/e): pace polling by the task's advertised `pollIntervalMs`,
    // ADOPTING the most-recent value each round (so a server can re-pace mid-flight)
    // and falling back to the caller's `intervalMs` (else 1000ms) when none is
    // advertised. Stop as soon as the response is terminal — a terminal DetailedTask —
    // via the shared {@link isPollingTerminalResponse} classifier.
    const fallbackMs = options?.intervalMs ?? 1000;
    const deadline = options?.timeoutMs ? Date.now() + options.timeoutMs : undefined;
    let intervalMs: number | undefined;
    for (;;) {
      const task = await this.getTask(taskId);
      if (isPollingTerminalResponse(task)) return task;
      // Adopt the latest advertised cadence for the NEXT wait.
      const advertised = typeof task['pollIntervalMs'] === 'number' ? (task['pollIntervalMs'] as number) : undefined;
      intervalMs = adoptLatestPollIntervalMs(advertised, intervalMs, fallbackMs);
      if (options?.signal?.aborted) throw new TransportError('poll aborted');
      if (deadline && Date.now() > deadline) throw new TransportError(`task ${taskId} did not finish within ${options!.timeoutMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  // ── C2: multi-round-trip (input-required) driver (§11) ───────────────────────

  /**
   * Runs a participating request (`tools/call`/`prompts/get`/`resources/read`) to
   * completion, fulfilling any `input_required` results in a loop: each requested
   * input kind is satisfied by the matching handler registered via
   * {@link setRequestHandler}, then the request is retried with `inputResponses` +
   * the echoed `requestState`, bounded by a round guard. (§11.5)
   */
  async requestWithInput(
    req: { method: string; params?: Record<string, unknown> },
    options?: RequestOptions & { maxRounds?: number },
  ): Promise<Record<string, unknown>> {
    const guard = new MrtrRoundGuard(options?.maxRounds ?? 16);
    const baseParams = req.params ?? {};
    let params: Record<string, unknown> = baseParams;
    // Consecutive load-shedding rounds (no progress) → exponential backoff. (§11.5)
    let loadShedAttempts = 0;
    for (;;) {
      const result = await this.request({ method: req.method, params }, options);
      // §11.5 (R-11.5-m–p): a load-shedding result — `input_required` with NO inputRequests
      // but a `requestState` — is NOT an error. The client MUST NOT treat it as one; it backs
      // off (growing the delay on repeated non-progress), then retries echoing `requestState`.
      if (isLoadSheddingResult(result)) {
        const round = guard.recordRound();
        if (!round.ok) throw new RequestError(-32603, `Multi-round-trip exceeded ${guard.maxRounds} rounds`);
        const delayMs = computeRetryBackoffMs(++loadShedAttempts);
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const requestState = result['requestState'];
        params = {
          ...baseParams,
          ...(typeof requestState === 'string' ? { requestState } : {}),
        };
        continue;
      }
      // Progress (a real input request or a terminal result) resets the backoff window.
      loadShedAttempts = 0;
      const decision = discriminateResultType(result, this.capabilities);
      if (decision.action === 'complete') return result;
      if (decision.action === 'error') {
        throw new RequestError(-32603, `Multi-round-trip error: ${decision.reason}`);
      }
      const round = guard.recordRound();
      if (!round.ok) throw new RequestError(-32603, `Multi-round-trip exceeded ${guard.maxRounds} rounds`);

      const inputResponses: Record<string, unknown> = {};
      for (const [key, inputReq] of Object.entries(decision.result.inputRequests ?? {})) {
        const handler = this.requestHandlers.get(inputReq.method);
        if (!handler) {
          throw new RequestError(-32601, `No handler registered for input-request kind "${inputReq.method}"`);
        }
        inputResponses[key] = await handler((inputReq.params ?? {}) as Record<string, unknown>, {
          id: 0,
          method: inputReq.method,
        });
      }
      params = {
        ...baseParams,
        inputResponses,
        ...(decision.result.requestState !== undefined ? { requestState: decision.result.requestState } : {}),
      };
    }
  }

  // ── C6: subscriptions (§10) ──────────────────────────────────────────────────

  /**
   * Opens a subscription via `subscriptions/listen`, routing the honored change
   * notifications to `onNotification`. Resolves once the server acknowledges the
   * honored subset; the returned handle's `closed` resolves at teardown. (§10)
   */
  async subscribe(
    filter: SubscriptionFilter,
    onNotification: (method: string, params: Record<string, unknown>) => void,
    _options?: RequestOptions,
  ): Promise<SubscriptionHandle> {
    if (!this.transport) throw new TransportError('client is not connected');
    const listenId = this.nextId();
    const subscriptionId = subscriptionIdFromRequestId(listenId);
    const envelope: Record<string, unknown> = {
      [PROTOCOL_VERSION_META_KEY]: this.protocolVersion(),
      [CLIENT_INFO_META_KEY]: this.clientInfo,
      [CLIENT_CAPABILITIES_META_KEY]: this.capabilities,
    };
    const message = {
      jsonrpc: '2.0' as const,
      id: listenId,
      method: SUBSCRIPTIONS_LISTEN_METHOD,
      params: { notifications: filter, _meta: envelope },
    };

    // The listen stream stays open until teardown; its final response/close settles `closed`.
    const settled = this.correlator.issue(listenId);
    const closed = settled.then(
      () => undefined,
      () => undefined,
    );
    void closed.then(() => this.subscriptionRouters.delete(subscriptionId));

    this.subscriptionRouters.set(subscriptionId, onNotification);
    const ack = new Promise<Record<string, unknown>>((resolve) =>
      this.subscriptionAcks.set(subscriptionId, resolve),
    );
    // The server MAY reject the listen request outright with a single response
    // instead of opening the acknowledgement stream — e.g. -32003 when `taskIds`
    // is supplied without the negotiated tasks capability (§25.10, R-25.10-f).
    // Race that rejection against the ack so subscribe() surfaces it rather than
    // hanging forever. In the normal path `ack` wins and `settled` stays pending
    // until teardown (whereupon it rejects and the .catch() below absorbs it).
    const rejected = settled.then((response) => {
      const error = (response as { error?: { code: number; message: string; data?: unknown } }).error;
      throw error
        ? new RequestError(error.code, error.message, error.data)
        : new TransportError('subscriptions/listen ended before acknowledgement');
    });
    rejected.catch(() => {});

    try {
      await this.transport.send(message as unknown as JSONRPCMessage);
    } catch (e) {
      this.subscriptionRouters.delete(subscriptionId);
      this.subscriptionAcks.delete(subscriptionId);
      this.correlator.fail(listenId, e instanceof TransportError ? e : new TransportError(String(e)));
      throw e;
    }

    let ackParams: Record<string, unknown>;
    try {
      ackParams = await Promise.race([ack, rejected]);
    } catch (e) {
      this.subscriptionRouters.delete(subscriptionId);
      this.subscriptionAcks.delete(subscriptionId);
      throw e;
    }
    this.subscriptionAcks.delete(subscriptionId);

    return {
      subscriptionId,
      acknowledgedFilter: (ackParams['notifications'] as Record<string, unknown>) ?? {},
      closed,
      unsubscribe: async () => {
        this.subscriptionRouters.delete(subscriptionId);
        await this.safeNotify('notifications/cancelled', { requestId: listenId, reason: 'unsubscribe' });
        this.correlator.fail(listenId, new TransportError('unsubscribed'));
      },
    };
  }

  /** Routes an inbound notification to a subscription's callback (or resolves a pending ack). */
  private dispatchSubscription(method: string, params: Record<string, unknown>): void {
    if (method === SUBSCRIPTIONS_ACKNOWLEDGED_METHOD) {
      const subId = readSubscriptionId(params);
      if (subId) this.subscriptionAcks.get(subId)?.(params);
      return;
    }
    const subId = readSubscriptionId(params);
    if (subId === undefined) return;
    const router = this.subscriptionRouters.get(subId);
    if (router) {
      try {
        router(method, params);
      } catch {
        // subscription callbacks are observational
      }
    }
  }

  private nextId(): number {
    return ++this.idSeq;
  }

  /** Issues correlation, sends the message, wires cancellation/timeout, and awaits the response. */
  private async roundTrip(
    id: RequestId,
    message: Record<string, unknown>,
    options?: RequestOptions,
    progressToken?: string | number,
  ): Promise<Record<string, unknown>> {
    if (!this.transport) throw new TransportError('client is not connected');
    const transport = this.transport;

    const settled = this.correlator.issue(id);
    // Safety net: keep a rejection handler attached for the whole lifetime of the
    // pending promise. If this method throws before reaching `await settled` (e.g.
    // transport.send rejects), the issued entry would otherwise be left dangling and
    // a later failAll()/fail() — e.g. from close() on reconnect — would surface as an
    // unhandled rejection and crash the host process. The real awaiter below still
    // observes the settlement; this handler only swallows the orphaned case.
    settled.catch(() => {});

    const cancel = (reason: string, error: TransportError): void => {
      void this.safeNotify('notifications/cancelled', { requestId: id, reason });
      this.correlator.fail(id, error);
    };

    let onAbort: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (options?.signal?.aborted) {
        // Already cancelled before we sent anything: fail without POSTing.
        this.correlator.fail(id, new TransportError('request aborted before send'));
      } else {
        if (options?.signal) {
          onAbort = () => cancel('client cancelled', new TransportError('request aborted'));
          options.signal.addEventListener('abort', onAbort, { once: true });
        }
        if (options?.timeoutMs && options.timeoutMs > 0) {
          timer = setTimeout(
            () => cancel('timeout', new TransportError(`request timed out after ${options.timeoutMs}ms`)),
            options.timeoutMs,
          );
        }
        try {
          await transport.send(message as unknown as JSONRPCMessage);
        } catch (e) {
          // The request never went out — settle its correlator entry now so it
          // isn't left outstanding (which would hang close()/failAll() bookkeeping).
          this.correlator.fail(id, e instanceof TransportError ? e : new TransportError(`send failed: ${String(e)}`));
          throw e;
        }
      }

      const response = await settled;
      const error = (response as { error?: { code: number; message: string; data?: unknown } }).error;
      if (error) throw new RequestError(error.code, error.message, error.data);
      return (response as { result?: Record<string, unknown> }).result ?? {};
    } finally {
      if (onAbort && options?.signal) options.signal.removeEventListener('abort', onAbort);
      if (timer !== undefined) clearTimeout(timer);
      if (progressToken !== undefined) this.progressHandlers.delete(progressKey(progressToken));
    }
  }

  private async safeNotify(method: string, params: Record<string, unknown>): Promise<void> {
    try {
      await this.notify(method, params);
    } catch {
      // cancellation/notification is best-effort; the local fail() still settles the caller
    }
  }

  // ── Inbound routing ──────────────────────────────────────────────────────────

  private async handleInbound(message: JSONRPCMessage): Promise<void> {
    let classified;
    try {
      classified = classifyMessage(message);
    } catch {
      return; // malformed inbound is ignored; a receiver never answers garbage (R-3.4-f)
    }

    switch (classified.kind) {
      case 'result-response':
      case 'error-response':
        this.correlator.deliver(classified.message);
        return;
      case 'notification': {
        const { method } = classified.message;
        const params = (classified.message.params ?? {}) as Record<string, unknown>;
        if (method === 'notifications/progress') this.dispatchProgress(params);
        this.dispatchSubscription(method, params);
        const handler = this.notificationHandlers.get(method);
        if (handler) {
          try {
            handler(params);
          } catch {
            // a notification handler's failure is local and never answered
          }
        }
        return;
      }
      case 'request':
        await this.handleServerRequest(classified.message);
        return;
    }
  }

  private dispatchProgress(params: Record<string, unknown>): void {
    const token = params['progressToken'];
    if (typeof token !== 'string' && typeof token !== 'number') return;
    const handler = this.progressHandlers.get(progressKey(token));
    if (handler) {
      try {
        handler(params);
      } catch {
        // progress callbacks are observational
      }
    }
  }

  private async handleServerRequest(message: {
    id: RequestId;
    method: string;
    params?: Record<string, unknown>;
  }): Promise<void> {
    const handler = this.requestHandlers.get(message.method);
    if (!handler) {
      await this.safeSend({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: METHOD_NOT_FOUND_CODE, message: `Method not found: ${message.method}` },
      });
      return;
    }

    try {
      const result = await handler((message.params ?? {}) as Record<string, unknown>, {
        id: message.id,
        method: message.method,
      });
      await this.safeSend({
        jsonrpc: '2.0',
        id: message.id,
        result: isObject(result) ? result : {},
      });
    } catch (e) {
      const code = e instanceof RequestError ? e.code : INTERNAL_ERROR_CODE;
      const data = e instanceof RequestError ? e.data : undefined;
      await this.safeSend({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code,
          message: e instanceof Error ? e.message : String(e),
          ...(data !== undefined ? { data } : {}),
        },
      });
    }
  }

  private async safeSend(message: Record<string, unknown>): Promise<void> {
    try {
      await this.transport?.send(message as unknown as JSONRPCMessage);
    } catch {
      // the transport is already failing; nothing more to do here
    }
  }
}

// ─── Module-private helpers ────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type-tags a progress token so string `"1"` and number `1` never collide. */
function progressKey(token: string | number): string {
  return typeof token === 'string' ? `s:${token}` : `n:${token}`;
}
