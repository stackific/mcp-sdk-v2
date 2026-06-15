/**
 * Streamable HTTP client transport (MCP 2026-07-28, §9) — the client half of the
 * transport whose server half the SDK already implements (S14/S15).
 *
 * Edge-friendly by construction: it builds on Web-platform APIs only — `fetch`,
 * `ReadableStream`, `TextDecoder`, `AbortController`, `setTimeout` — and imports
 * no `node:*` module, so the same file runs unchanged on Node ≥18, Cloudflare
 * Workers, Deno, and browsers. (Pull it in via the package's `./client` subpath
 * to avoid the Node-only stdio transport re-exported from the package root.)
 *
 * Wire model (§9.2, §9.6): every client→server message is exactly one HTTP `POST`
 * to the single MCP endpoint. The server answers a *request* with either
 *   - a single `application/json` body carrying one JSON-RPC response, or
 *   - a `text/event-stream` carrying request-scoped notifications and/or
 *     server→client requests, then the final response, then end.
 * A *notification* or a *response* (the client's reply to a server→client
 * request) is answered with `202 Accepted` and no body.
 *
 * This transport normalizes every inbound frame — interim notification,
 * server→client request, or final response — onto the SDK {@link Transport}
 * contract's `onMessage`; the embedding {@link Client} correlates and routes
 * them. It interprets no method or result (§7.1).
 *
 * Statelessness (§9.9): there is no `Mcp-Session-Id`. Each POST is self-contained;
 * the per-request envelope in `params._meta` (protocol version, client identity,
 * capabilities) is the sole carrier of context, mirrored into the required
 * request headers by {@link buildPostHeaders}.
 */
import { classifyMessage, type JSONRPCMessage, type RequestId } from '../jsonrpc/framing.js';
import {
  TransportError,
  type Transport,
  type TransportCloseInfo,
  type Unsubscribe,
} from '../transport/contract.js';
import {
  buildPostHeaders,
  ACCEPT_HEADER,
  ACCEPT_MEDIA_TYPES,
  CONTENT_TYPE_HEADER,
  CONTENT_TYPE_JSON,
} from '../transport/http/headers.js';
import { MCP_PROTOCOL_VERSION_HEADER } from '../protocol/revision.js';
import { PROTOCOL_VERSION_META_KEY } from '../protocol/meta.js';
import { CURRENT_PROTOCOL_VERSION } from '../protocol/discovery.js';

/** Standard JSON-RPC "Internal error" code, used for transport-synthesized failures. */
const INTERNAL_ERROR_CODE = -32603;

/** Supplies a bearer token for the protected-resource flow (§23.8). */
export interface AuthProvider {
  /**
   * Returns the access token to attach as `Authorization: Bearer <token>`, or
   * `undefined`/empty to send the request unauthenticated. Resolved fresh on
   * every POST so a rotating token is always current.
   */
  token(): string | undefined | Promise<string | undefined>;
}

/** Options for {@link StreamableHTTPClientTransport}. */
export interface StreamableHTTPClientTransportOptions {
  /**
   * Protocol revision used for the `MCP-Protocol-Version` header when a message
   * body carries no `_meta` protocol version (e.g. notifications and responses).
   * Requests always take their header version from the body so header and body
   * agree (§9.3.3). Defaults to {@link CURRENT_PROTOCOL_VERSION}.
   */
  protocolVersion?: string;
  /** Optional bearer-token provider for a protected MCP endpoint. */
  authProvider?: AuthProvider;
  /** Extra static headers merged into every POST (e.g. a tracing header). */
  headers?: Record<string, string>;
  /** Override the `fetch` implementation (injection point for tests/non-global runtimes). */
  fetch?: typeof fetch;
}

/** A JSON-RPC value being POSTed; mirrors the structural fields the transport reads. */
type OutgoingMessage = {
  jsonrpc: '2.0';
  id?: RequestId;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

export class StreamableHTTPClientTransport implements Transport {
  /** Header protocol revision for bodies without their own `_meta` version. */
  protocolVersion: string;

  private readonly endpoint: string;
  private readonly authProvider?: AuthProvider;
  private readonly extraHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  /** Aborts every in-flight POST/stream when the transport is closed. */
  private readonly lifecycle = new AbortController();
  private readonly messageHandlers = new Set<(message: JSONRPCMessage) => void>();
  private readonly errorHandlers = new Set<(error: TransportError) => void>();
  private readonly closeHandlers = new Set<(info: TransportCloseInfo) => void>();
  private _closed = false;
  /** Resolves `Mcp-Param-*` headers for an outgoing request (set by the Client). (§9.5.2) */
  private paramHeaderResolver?: (
    method: string,
    params: Record<string, unknown> | undefined,
  ) => Record<string, string>;

  constructor(url: URL | string, options: StreamableHTTPClientTransportOptions = {}) {
    this.endpoint = typeof url === 'string' ? url : url.toString();
    this.protocolVersion = options.protocolVersion ?? CURRENT_PROTOCOL_VERSION;
    this.authProvider = options.authProvider;
    this.extraHeaders = { ...options.headers };
    const resolvedFetch = options.fetch ?? globalThis.fetch;
    if (typeof resolvedFetch !== 'function') {
      throw new TransportError('no global `fetch` available; pass options.fetch');
    }
    // Bind so a global `fetch` is not invoked with the wrong receiver on some runtimes.
    this.fetchImpl = resolvedFetch.bind(globalThis);
  }

  get closed(): boolean {
    return this._closed;
  }

  /**
   * Installs a resolver that derives the `Mcp-Param-*` routing headers for an
   * outgoing request from its method + params (§9.5.2). The {@link Client} sets
   * this using the `x-mcp-header` annotations it learns from `tools/list`.
   */
  setParamHeaderResolver(
    resolver: (method: string, params: Record<string, unknown> | undefined) => Record<string, string>,
  ): void {
    this.paramHeaderResolver = resolver;
  }

  onMessage(handler: (message: JSONRPCMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onError(handler: (error: TransportError) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  onClose(handler: (info: TransportCloseInfo) => void): Unsubscribe {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  async close(reason?: string): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    this.lifecycle.abort();
    const info: TransportCloseInfo = { clean: true, ...(reason !== undefined ? { reason } : {}) };
    for (const handler of [...this.closeHandlers]) {
      try {
        handler(info);
      } catch {
        // a close observer must not break the close path
      }
    }
  }

  /**
   * POSTs one message. For a request the response (single JSON or SSE) is read
   * and every frame surfaced via `onMessage`; for a notification or a response we
   * require a 2xx and read nothing. (R-7.2-q: never silently drop — failures are
   * thrown to the caller or delivered as a synthetic error response for the id.)
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this._closed) throw new TransportError('transport is closed');

    let kind: string;
    try {
      kind = classifyMessage(message).kind;
    } catch (e) {
      throw new TransportError(`refusing to send a malformed message: ${errText(e)}`, { cause: e });
    }

    const out = message as OutgoingMessage;
    const headers = await this.buildHeaders(kind, out);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: this.lifecycle.signal,
      });
    } catch (e) {
      if (this.lifecycle.signal.aborted) return; // closed mid-flight: not an error
      throw new TransportError(`POST to ${this.endpoint} failed: ${errText(e)}`, { cause: e });
    }

    if (kind === 'request') {
      await this.receiveRequestResponse(response, out.id as RequestId);
      return;
    }

    // Notification or client→server response: 2xx with an empty/ignored body.
    if (!response.ok) {
      throw new TransportError(`POST ${kind} rejected with HTTP ${response.status}`);
    }
    await drain(response);
  }

  // ── Header construction ──────────────────────────────────────────────────────

  private async buildHeaders(kind: string, message: OutgoingMessage): Promise<Record<string, string>> {
    const bodyVersion = readMetaProtocolVersion(message.params);
    const protocolVersion = bodyVersion ?? this.protocolVersion;

    let headers: Record<string, string>;
    if ((kind === 'request' || kind === 'notification') && typeof message.method === 'string') {
      // Mirrors method/name routing fields into headers and sets the three required
      // request headers (Content-Type, Accept, MCP-Protocol-Version). (§9.3–§9.4) For a
      // request, derive the Mcp-Param-* headers from the tool's x-mcp-header annotations. (§9.5.2)
      const paramHeaders = kind === 'request' ? this.paramHeaderResolver?.(message.method, message.params) : undefined;
      headers = buildPostHeaders({ protocolVersion, method: message.method, params: message.params, paramHeaders });
    } else {
      // A response carries no method/name to route on; send the minimal required set.
      headers = {
        [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
        [ACCEPT_HEADER]: ACCEPT_MEDIA_TYPES.join(', '),
        [MCP_PROTOCOL_VERSION_HEADER]: protocolVersion,
      };
    }

    Object.assign(headers, this.extraHeaders);

    if (this.authProvider) {
      const token = await this.authProvider.token();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // ── Inbound for a request: single JSON or SSE ────────────────────────────────

  private async receiveRequestResponse(response: Response, id: RequestId): Promise<void> {
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const isEventStream = contentType.includes('text/event-stream');

    if (!response.ok && !isEventStream) {
      await this.deliverHttpError(response, id);
      return;
    }

    if (isEventStream) {
      // Read in the background so concurrent requests (and the client's replies to
      // server→client requests) are not blocked by one open stream.
      void this.pumpEventStream(response, id).catch((e) => {
        this.reportError(`event stream pump crashed: ${errText(e)}`);
        this.emit(syntheticErrorResponse(id, `event stream pump crashed: ${errText(e)}`));
      });
      return;
    }

    // Single JSON response.
    let body: unknown;
    try {
      body = await response.json();
    } catch (e) {
      this.emit(syntheticErrorResponse(id, `response body was not valid JSON: ${errText(e)}`));
      return;
    }
    this.emit(coerceInbound(body, id));
  }

  /** Turns an HTTP error status into a delivered JSON-RPC error response for `id`. */
  private async deliverHttpError(response: Response, id: RequestId): Promise<void> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (isObject(body) && ('error' in body || 'result' in body)) {
      // The server returned a JSON-RPC message; ensure it can be correlated.
      if (body['id'] === undefined) body['id'] = id;
      this.emit(body as unknown as JSONRPCMessage);
      return;
    }
    this.emit(syntheticErrorResponse(id, `HTTP ${response.status}`, body));
  }

  /** Reads an SSE stream, surfacing each `data:` JSON frame; synthesizes a failure if it ends early. */
  private async pumpEventStream(response: Response, id: RequestId): Promise<void> {
    const stream = response.body;
    if (!stream) {
      this.emit(syntheticErrorResponse(id, 'event stream had no body'));
      return;
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let settled = false;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = parseSseData(rawEvent);
          if (data === undefined) continue; // comment / keep-alive
          let frame: unknown;
          try {
            frame = JSON.parse(data);
          } catch (e) {
            this.reportError(`malformed SSE data frame: ${errText(e)}`);
            continue;
          }
          if (isFinalResponseFor(frame, id)) settled = true;
          this.emit(frame as JSONRPCMessage);
        }
      }
    } catch (e) {
      if (this.lifecycle.signal.aborted) return; // closed: expected
      this.reportError(`event stream read failed: ${errText(e)}`);
      if (!settled) this.emit(syntheticErrorResponse(id, `event stream interrupted: ${errText(e)}`));
      return;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
    }

    if (!settled && !this.lifecycle.signal.aborted) {
      this.emit(syntheticErrorResponse(id, 'event stream closed before the final response'));
    }
  }

  // ── Fan-out helpers ──────────────────────────────────────────────────────────

  private emit(message: JSONRPCMessage): void {
    for (const handler of [...this.messageHandlers]) {
      try {
        handler(message);
      } catch (e) {
        this.reportError(`onMessage handler threw: ${errText(e)}`);
      }
    }
  }

  private reportError(message: string): void {
    const error = new TransportError(message);
    for (const handler of [...this.errorHandlers]) {
      try {
        handler(error);
      } catch {
        // an error observer must not itself break error fan-out
      }
    }
  }
}

// ─── Module-private helpers ────────────────────────────────────────────────────

/** Reads `params._meta["io.modelcontextprotocol/protocolVersion"]`, or `undefined`. */
function readMetaProtocolVersion(params: Record<string, unknown> | undefined): string | undefined {
  if (!isObject(params)) return undefined;
  const meta = params['_meta'];
  if (!isObject(meta)) return undefined;
  const version = meta[PROTOCOL_VERSION_META_KEY];
  return typeof version === 'string' ? version : undefined;
}

/** Extracts the joined `data:` payload of one SSE event block, or `undefined` for comment-only blocks. */
function parseSseData(rawEvent: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of rawEvent.split('\n')) {
    if (line === '' || line.startsWith(':')) continue; // blank or comment
    if (line.startsWith('data:')) {
      // A single optional leading space after the colon is stripped per the SSE grammar.
      dataLines.push(line.slice(5).replace(/^ /, ''));
    } else if (line === 'data') {
      dataLines.push('');
    }
    // Other SSE fields (event:, id:, retry:) are irrelevant to JSON-RPC framing.
  }
  return dataLines.length > 0 ? dataLines.join('\n') : undefined;
}

/** `true` when `frame` is the final response (result|error) echoing request `id`. */
function isFinalResponseFor(frame: unknown, id: RequestId): boolean {
  if (!isObject(frame)) return false;
  const fid = frame['id'];
  const sameId = typeof fid === typeof id && fid === id;
  return sameId && ('result' in frame || 'error' in frame);
}

/** Ensures a single-JSON response body carries the request id so it can be correlated. */
function coerceInbound(body: unknown, id: RequestId): JSONRPCMessage {
  if (isObject(body)) {
    if (body['id'] === undefined && ('result' in body || 'error' in body)) body['id'] = id;
    return body as unknown as JSONRPCMessage;
  }
  return syntheticErrorResponse(id, 'response body was not a JSON object');
}

/** Builds a transport-synthesized error response so an awaiting request never hangs. */
function syntheticErrorResponse(id: RequestId, message: string, data?: unknown): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: { code: INTERNAL_ERROR_CODE, message, ...(data !== undefined ? { data } : {}) },
  } as unknown as JSONRPCMessage;
}

/** Reads and discards a response body, ignoring read errors (best-effort connection reuse). */
async function drain(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    // nothing to drain / already consumed
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
