/**
 * S12 — Transport contract, directionality, and statelessness (§7.1–§7.6).
 *
 * The core protocol rides unchanged on whichever transport carries it: a
 * transport frames, delivers, and tears down bytes but never interprets a
 * method, `params`, or `result`. This module defines:
 *
 *   - `Transport` — the abstract bidirectional-channel contract (§7.1) plus the
 *     observable clean-close / disconnection surface (§7.2 clean close, §7.5).
 *   - `TransportError` — a channel-level failure, kept distinct from a JSON-RPC
 *     error response (which is a normal, fully delivered protocol message; §7.5).
 *   - Directionality helpers (§7.4): which JSON-RPC kinds may travel which way.
 *   - Statelessness helpers (§7.6 / §7.4): every request carries its `_meta`
 *     envelope regardless of transport, and a server derives context from that
 *     envelope — never from the connection.
 *   - Documentation constants enumerating the §7.2 guarantees, the §7.3 custom
 *     transport obligations, and the stdio-specific disconnection policy
 *     (R-7.5-g/h, owned by S13).
 *
 * No new wire types are introduced; the message union is S03's `JSONRPCMessage`.
 */

import type { JSONRPCMessage } from '../jsonrpc/framing.js';
import {
  validateRequestMeta,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from './../protocol/meta.js';

// ─── TransportError ────────────────────────────────────────────────────────────

/**
 * A failure of the transport channel itself — distinct from a JSON-RPC error
 * response. (§7.5)
 *
 * A JSON-RPC error response (an `error` object inside a delivered message) is a
 * normal, fully delivered protocol message reporting that a request failed at
 * the protocol/application layer. A `TransportError` instead signals that the
 * channel could not carry a message, that a received unit was malformed at the
 * encoding/framing level, or that the connection was lost — i.e. an observable
 * transport-level failure (R-7.2-q, R-7.2-r, R-7.5-i, R-7.5-j, R-7.6-b).
 */
export class TransportError extends Error {
  /** Stable machine-readable code for programmatic handling. */
  readonly code = 'TRANSPORT_ERROR' as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransportError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Close / disconnection ──────────────────────────────────────────────────────

/**
 * Why a transport channel became unusable, surfaced to `onClose` handlers.
 *
 * `clean: true` is an orderly shutdown each side had the opportunity to observe
 * (R-7.2-t). `clean: false` is an abrupt disconnection — the channel dropped
 * without an orderly close — which a transport MUST still make observable
 * (R-7.5-a, R-7.5-b).
 */
export interface TransportCloseInfo {
  /** `true` for an orderly close; `false` for an abrupt disconnection. */
  clean: boolean;
  /** Optional human-readable explanation. */
  reason?: string;
}

/** Cancels a previously registered handler. */
export type Unsubscribe = () => void;

/**
 * The abstract transport contract every defined or custom transport satisfies.
 * (§7.1, §7.2)
 *
 * A `Transport` is a bidirectional channel that carries the `JSONRPCMessage`
 * union as complete UTF-8 JSON values, preserves integrity, delivers in both
 * directions, never silently drops a message, and defines an observable clean
 * close and an observable abrupt disconnection.
 *
 * A transport does NOT interpret method/params/result or perform capability or
 * version negotiation; those are core-protocol concerns carried unchanged.
 */
export interface Transport {
  /**
   * Sends one message over the channel. MUST NOT silently drop it: on a closed
   * or failed channel this MUST surface an observable failure (e.g. throw or
   * reject with a `TransportError`) rather than discarding the message.
   * (R-7.2-q, R-7.2-s, R-7.5-i, R-7.5-j)
   */
  send(message: JSONRPCMessage): void | Promise<void>;
  /** Registers a handler for each inbound message. Returns an unsubscribe fn. */
  onMessage(handler: (message: JSONRPCMessage) => void): Unsubscribe;
  /**
   * Registers a handler for **receiver-side** transport/parse-level errors —
   * e.g. an inbound unit that is not well-formed UTF-8 or not a single JSON
   * value (R-7.6-b, R-7.6-c). These surface on the side that *received* the bad
   * unit, as an observable failure, rather than being silently dropped or
   * thrown back into the unrelated sender's `send`. (R-7.5-j) Returns an
   * unsubscribe fn.
   *
   * This is distinct from a JSON-RPC error response (a normal, fully delivered
   * message) and from a send failure (surfaced synchronously by `send`).
   */
  onError(handler: (error: TransportError) => void): Unsubscribe;
  /**
   * Registers a handler invoked once when the channel becomes unusable — by a
   * clean close or an abrupt disconnection (R-7.2-t, R-7.5-a). Returns an
   * unsubscribe fn.
   */
  onClose(handler: (info: TransportCloseInfo) => void): Unsubscribe;
  /** Initiates an orderly (clean) close that each side can observe. (R-7.2-t) */
  close(reason?: string): void | Promise<void>;
  /** `true` once the channel has been closed or disconnected. */
  readonly closed: boolean;
}

// ─── Directionality (§7.4) ──────────────────────────────────────────────────────

/** The two directions a message may travel at the JSON-RPC layer. (§7.4) */
export type MessageDirection = 'client-to-server' | 'server-to-client';

/**
 * The structural kind of a message, as classified by S03's `classifyMessage`.
 * Both response forms share the same directionality, so they collapse here.
 */
export type DirectionalKind = 'request' | 'notification' | 'response';

/**
 * Returns `true` when a message of `kind` may travel in `direction`. (§7.4)
 *
 * Permitted directions (R-7.4-b, R-7.4-c, and the informative rule that servers
 * never initiate requests and clients never send responses):
 *   - `request`      → client→server only
 *   - `response`     → server→client only
 *   - `notification` → either direction
 */
export function isDirectionPermitted(kind: DirectionalKind, direction: MessageDirection): boolean {
  switch (kind) {
    case 'request':
      return direction === 'client-to-server';
    case 'response':
      return direction === 'server-to-client';
    case 'notification':
      return true;
  }
}

// ─── Per-request envelope & statelessness (§7.4, §7.6) ──────────────────────────

/** The per-request context a server derives solely from a request's `_meta`. */
export interface RequestContext {
  /** `io.modelcontextprotocol/protocolVersion` for this request. */
  protocolVersion: string;
  /** `io.modelcontextprotocol/clientInfo` for this request. */
  clientInfo: unknown;
  /** `io.modelcontextprotocol/clientCapabilities` for this request. */
  clientCapabilities: unknown;
}

/** Reads `params._meta` from a request-shaped value, or `undefined`. */
function readMeta(request: unknown): Record<string, unknown> | undefined {
  if (typeof request !== 'object' || request === null) return undefined;
  const params = (request as Record<string, unknown>)['params'];
  if (typeof params !== 'object' || params === null) return undefined;
  const meta = (params as Record<string, unknown>)['_meta'];
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined;
  return meta as Record<string, unknown>;
}

/**
 * Returns `true` when a request carries the inline `_meta` envelope with the
 * three reserved `io.modelcontextprotocol/*` keys. (R-7.4-d, R-7.4-f)
 *
 * The inline envelope is REQUIRED regardless of transport; the message body is
 * the source of truth. A transport MAY additionally mirror these fields into
 * transport-level metadata (see {@link extractEnvelopeForMirroring}), but that
 * mirror is never a substitute for the inline envelope.
 */
export function requestCarriesMetaEnvelope(request: unknown): boolean {
  const meta = readMeta(request);
  if (meta === undefined) return false;
  return validateRequestMeta(meta).ok;
}

/**
 * Derives the per-request context (protocol version, client identity, client
 * capabilities) **solely from the request's own `_meta`**, never from the
 * connection or any prior request. (R-7.6-e, R-7.6-f)
 *
 * Returns `undefined` when the request does not carry a valid envelope; the
 * server then has no basis to process it (and MUST NOT infer one from earlier
 * requests). Two requests on the same connection with different envelopes yield
 * two independent contexts — the connection contributes nothing.
 */
export function deriveRequestContext(request: unknown): RequestContext | undefined {
  const meta = readMeta(request);
  if (meta === undefined || !validateRequestMeta(meta).ok) return undefined;
  return {
    protocolVersion: meta[PROTOCOL_VERSION_META_KEY] as string,
    clientInfo: meta[CLIENT_INFO_META_KEY],
    clientCapabilities: meta[CLIENT_CAPABILITIES_META_KEY],
  };
}

/**
 * Extracts the envelope fields a transport MAY mirror into transport-level
 * metadata for routing/inspection (e.g. HTTP headers; see S14/S15). (R-7.4-e)
 *
 * The returned values are read **from the message body**, which remains the
 * authoritative source of truth — the mirror is a derived copy, never an
 * alternative input. Returns `undefined` when the body carries no valid
 * envelope, so a transport never mirrors fabricated values.
 */
export function extractEnvelopeForMirroring(request: unknown): RequestContext | undefined {
  return deriveRequestContext(request);
}

// ─── Documentation constants ─────────────────────────────────────────────────

/**
 * The transport-agnostic guarantees every transport MUST uphold. (§7.2)
 *
 * These are documentation anchors mapping each guarantee to its normative atom;
 * the runtime enforcement lives in `framing.ts` (framing, UTF-8, integrity),
 * `correlation.ts` (id-correlation, multiplexing, ordering, disconnection), and
 * a conforming `Transport` (no silent loss, clean close).
 */
export const TRANSPORT_GUARANTEES = {
  /** Unambiguous, body-independent message framing. (R-7.2-b, R-7.2-c, R-7.2-d) */
  FRAMING: ['R-7.2-b', 'R-7.2-c', 'R-7.2-d'],
  /** Response↔request association by `id` only. (R-7.2-e, R-7.2-f, R-7.2-g, R-7.2-o) */
  ASSOCIATION_BY_ID: ['R-7.2-e', 'R-7.2-f', 'R-7.2-g', 'R-7.2-o'],
  /** Multiplexing of concurrent outstanding requests. (R-7.2-i – R-7.2-l) */
  MULTIPLEXING: ['R-7.2-i', 'R-7.2-j', 'R-7.2-k', 'R-7.2-l'],
  /** Response-ordering independence. (R-7.2-m, R-7.2-n, R-7.2-p) */
  ORDERING: ['R-7.2-m', 'R-7.2-n', 'R-7.2-p'],
  /** No silent loss. (R-7.2-q, R-7.2-r, R-7.2-s) */
  NO_SILENT_LOSS: ['R-7.2-q', 'R-7.2-r', 'R-7.2-s'],
  /** Clean, observable shutdown/close. (R-7.2-t) */
  CLEAN_CLOSE: ['R-7.2-t'],
} as const;

/**
 * The obligations on a custom transport. (§7.3)
 *
 * A custom transport MAY exist (R-7.3-a) but MUST preserve the JSON-RPC message
 * format, the exchange patterns, and the per-request metadata model (R-7.3-b),
 * MUST uphold every §7.2 guarantee (R-7.3-c), SHOULD document its connection
 * establishment / framing / cancellation (R-7.3-d), and SHOULD reuse the stdio
 * newline framing when running over a reliable byte stream (R-7.3-e).
 */
export const CUSTOM_TRANSPORT_OBLIGATIONS = {
  MAY_IMPLEMENT: 'R-7.3-a',
  PRESERVE_FORMAT_PATTERNS_METADATA: 'R-7.3-b',
  UPHOLD_ALL_GUARANTEES: 'R-7.3-c',
  SHOULD_DOCUMENT: 'R-7.3-d',
  SHOULD_REUSE_STDIO_FRAMING: 'R-7.3-e',
} as const;

/**
 * Stdio-specific disconnection policy, owned by S13 (§8) and referenced by §7.5.
 *
 * These are RECOMMENDED/OPTIONAL behaviors that require the stdio process
 * lifecycle and so are realized by the stdio transport, not by this contract
 * module: if the server subprocess exits unexpectedly the client SHOULD restart
 * it (R-7.5-g), and in-flight requests lost on that exit MAY be retried against
 * the fresh process (R-7.5-h).
 */
export const STDIO_DISCONNECT_POLICY = {
  SHOULD_RESTART_ON_UNEXPECTED_EXIT: 'R-7.5-g',
  MAY_RETRY_INFLIGHT_ON_FRESH_PROCESS: 'R-7.5-h',
} as const;

/**
 * The statelessness rules a transport and the server above it MUST honor. (§7.6)
 *
 * A single connection MUST NOT be required to carry conversational state
 * (R-7.6-d); a server MUST NOT infer state from prior requests (R-7.6-e) or rely
 * on the connection for capabilities/version/identity (R-7.6-f); it SHOULD NOT
 * require connection reuse (R-7.6-g); a client MAY interleave unrelated requests
 * (R-7.6-h); connection identity MUST NOT proxy for conversation (R-7.6-i); and
 * cross-request state MUST be referenced by an explicit client-supplied
 * identifier, not by connection (R-7.6-j; see S06 `ContinuationId`).
 */
export const STATELESS_TRANSPORT_RULES = {
  NO_CONNECTION_SCOPED_STATE: 'R-7.6-d',
  NO_PRIOR_REQUEST_INFERENCE: 'R-7.6-e',
  CONTEXT_FROM_META_ONLY: 'R-7.6-f',
  SHOULD_NOT_REQUIRE_CONNECTION_REUSE: 'R-7.6-g',
  MAY_INTERLEAVE_UNRELATED: 'R-7.6-h',
  CONNECTION_NOT_CONVERSATION: 'R-7.6-i',
  EXPLICIT_CONTINUATION_IDENTIFIER: 'R-7.6-j',
} as const;
