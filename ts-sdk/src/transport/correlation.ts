/**
 * S12 — Response↔request correlation, multiplexing, and disconnection (§7.2, §7.5).
 *
 * This module realizes the §7.2 association/multiplexing/ordering guarantees and
 * the §7.5 in-flight-failure-on-disconnect rule, transport-agnostically:
 *
 *   - `RequestCorrelator` — a sender-side registry that issues a promise per
 *     outstanding request `id`, resolves it when a response with the matching
 *     `id` is delivered (in ANY order; R-7.2-m – R-7.2-p), forbids reuse of an
 *     unanswered `id` (R-7.2-j), permits arbitrarily many concurrent outstanding
 *     requests (R-7.2-i, R-7.2-k, R-7.2-l), and on disconnection fails every
 *     unanswered request so the caller never waits forever (R-7.5-c – R-7.5-e).
 *   - `buildParseErrorResponse` / `MalformedIdErrorResponseSchema` — the single
 *     permitted id exception: an error reply to a request whose `id` could not
 *     be read MAY carry a `null` id or omit it (R-7.2-h).
 *
 * A delivered JSON-RPC error response is a normal, fully delivered message and
 * RESOLVES its promise (the caller inspects `result` vs `error`); only a
 * transport-level failure REJECTS with a `TransportError`. This keeps the §7.5
 * distinction between the two error kinds explicit at the API.
 */

import {
  InFlightTracker,
  idEchoMatches,
  type RequestId,
  type JSONRPCResponse,
} from '../jsonrpc/framing.js';
import { TransportError } from './contract.js';
import { z } from 'zod';
import { RequestIdSchema } from '../jsonrpc/framing.js';

export { idEchoMatches } from '../jsonrpc/framing.js';

// ─── RequestCorrelator ──────────────────────────────────────────────────────────

interface PendingEntry {
  id: RequestId;
  resolve: (response: JSONRPCResponse) => void;
  reject: (error: TransportError) => void;
}

/**
 * Correlates inbound responses to outstanding requests **by `id` only** — never
 * by delivery order, connection, stream, or position. (R-7.2-e – R-7.2-g, R-7.2-o)
 *
 * Typical use by a sender:
 * ```ts
 * const correlator = new RequestCorrelator();
 * const p1 = correlator.issue(1);   // does not block
 * const p2 = correlator.issue(2);   // multiplexed — no await between them
 * transport.onMessage((m) => { if (isResponse(m)) correlator.deliver(m); });
 * transport.onClose(() => correlator.failAll(new TransportError('disconnected')));
 * const r2 = await p2;              // resolves whenever id=2 arrives, even first
 * ```
 *
 * `"1"` (string) and `1` (number) are kept distinct because they are different
 * JSON types — matching S03's id rules (R-3.2-f, R-3.2-g).
 */
export class RequestCorrelator {
  private readonly tracker = new InFlightTracker();
  private readonly pending = new Map<string, PendingEntry>();

  /** Type-tags the key so string `"1"` and number `1` never collide. */
  private key(id: RequestId): string {
    return typeof id === 'string' ? `s:${id}` : `n:${id}`;
  }

  /**
   * Registers `id` as outstanding and returns a promise that settles when a
   * matching response is delivered or the request is failed.
   *
   * Concurrency: calling `issue` again before the first settles is allowed and
   * expected — the transport need not await one response before issuing another
   * (R-7.2-i, R-7.2-k, R-7.2-l).
   *
   * @throws {Error} Synchronously when `id` is already outstanding — a sender
   *   MUST NOT reuse the `id` of an unanswered request. (R-7.2-j)
   */
  issue(id: RequestId): Promise<JSONRPCResponse> {
    this.tracker.register(id); // throws on reuse of an unanswered id (R-7.2-j)
    return new Promise<JSONRPCResponse>((resolve, reject) => {
      this.pending.set(this.key(id), { id, resolve, reject });
    });
  }

  /**
   * Delivers an inbound response, resolving the matching outstanding request's
   * promise. Matching is purely by `id`; the order in which responses are
   * delivered is irrelevant (R-7.2-m, R-7.2-n, R-7.2-p).
   *
   * A delivered error response (carrying `error`) still RESOLVES the promise —
   * it is a normal, fully delivered protocol message (§7.5). Only
   * {@link fail}/{@link failAll} reject (transport-level failure).
   *
   * @returns `true` if a matching outstanding request was found and resolved;
   *   `false` for an unknown/late `id` (e.g. a response to an already-failed
   *   request) — the correlator does not throw on an unmatched delivery.
   */
  deliver(response: JSONRPCResponse): boolean {
    const id = (response as { id?: RequestId }).id;
    if (id === undefined || id === null) {
      return false; // a response without a readable id cannot be correlated
    }
    const k = this.key(id);
    const entry = this.pending.get(k);
    if (entry === undefined) {
      return false;
    }
    // Defensive: the matched id must echo the issued id with no type coercion.
    if (!idEchoMatches(entry.id, id)) {
      return false;
    }
    this.pending.delete(k);
    this.tracker.complete(id);
    entry.resolve(response);
    return true;
  }

  /**
   * Fails a single outstanding request with a transport-level error, rejecting
   * its promise so the caller can observe the failure rather than waiting
   * forever. (R-7.5-d, R-7.5-e)
   *
   * @returns `true` if the request was outstanding and is now failed.
   */
  fail(id: RequestId, error: TransportError): boolean {
    const k = this.key(id);
    const entry = this.pending.get(k);
    if (entry === undefined) return false;
    this.pending.delete(k);
    this.tracker.complete(id);
    entry.reject(error);
    return true;
  }

  /**
   * Fails **every** outstanding request — the action a transport takes on
   * abrupt or clean disconnection so no in-flight request can hang. (R-7.5-c,
   * R-7.5-d, R-7.5-e)
   *
   * After this returns the correlator holds no outstanding requests, so the
   * same ids MAY be reissued against a fresh connection (R-7.5-f, R-7.7-b) —
   * no state is bound to the lost connection.
   *
   * @returns the ids that were failed.
   */
  failAll(error: TransportError): RequestId[] {
    const failed: RequestId[] = [];
    for (const entry of this.pending.values()) {
      this.tracker.complete(entry.id);
      failed.push(entry.id);
      entry.reject(error);
    }
    this.pending.clear();
    return failed;
  }

  /** `true` when `id` is currently outstanding. */
  has(id: RequestId): boolean {
    return this.pending.has(this.key(id));
  }

  /** Number of currently outstanding requests. */
  get size(): number {
    return this.pending.size;
  }

  /** Snapshot of the currently outstanding ids. */
  get outstanding(): ReadonlyArray<RequestId> {
    return Array.from(this.pending.values(), (e) => e.id);
  }
}

// ─── Malformed-id error response (the single id exception) ───────────────────────

/** The standard JSON-RPC "Parse error" code. (§22 / S34) */
export const PARSE_ERROR_CODE = -32700;

/**
 * An error response whose `id` could not be read because the originating
 * request was malformed. Per R-7.2-h this MAY carry a `null` id or omit it —
 * the one exception to the strict id-echo rule of S03.
 */
export interface MalformedIdErrorResponse {
  jsonrpc: '2.0';
  /** `null` or omitted — the unreadable-id exception (R-7.2-h). */
  id?: RequestId | null;
  error: { code: number; message: string; data?: unknown };
}

/**
 * Schema accepting an error response to an unreadable-id request: `id` may be a
 * string, a number, `null`, or omitted entirely. (R-7.2-h)
 *
 * This deliberately relaxes S03's `JSONRPCErrorResponseSchema` (which permits
 * only string/number/omitted) to also allow the `null` form the transport layer
 * explicitly sanctions for this case.
 */
export const MalformedIdErrorResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([RequestIdSchema, z.null()]).optional(),
    error: z
      .object({ code: z.number().int(), message: z.string(), data: z.unknown().optional() })
      .passthrough(),
  })
  .passthrough();

/**
 * Builds a parse-error response for a request whose `id` could not be read.
 * (R-7.2-h)
 *
 * @param options.nullId - When `true`, the response carries `"id": null`; when
 *   `false`/omitted, the `id` member is omitted entirely. Both forms are valid.
 */
export function buildParseErrorResponse(options?: { nullId?: boolean }): MalformedIdErrorResponse {
  const base = {
    jsonrpc: '2.0' as const,
    error: { code: PARSE_ERROR_CODE, message: 'Parse error' },
  };
  return options?.nullId ? { ...base, id: null } : base;
}

/** Returns `true` when `value` is an acceptable malformed-id error response. (R-7.2-h) */
export function isAcceptableMalformedIdErrorResponse(value: unknown): boolean {
  return MalformedIdErrorResponseSchema.safeParse(value).success;
}
