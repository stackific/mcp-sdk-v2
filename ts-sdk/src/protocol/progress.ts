/**
 * S22 — Utilities: Progress & Cancellation (§15.1–§15.2).
 *
 * Delivers two cross-cutting utility mechanisms for any request:
 *   - Out-of-band progress reporting via `notifications/progress`
 *   - Request cancellation via `notifications/cancelled`
 *
 * Both are optional, opt-in, fire-and-forget mechanisms. A peer that does not
 * implement either continues to operate correctly. (R-15-a)
 *
 * Progress is request-scoped: notifications travel on the response stream of
 * the request whose `_meta.progressToken` opted in, before the final response.
 * Cancellation is same-direction-only: a party may cancel only requests it
 * issued, never requests it received.
 */

import { z } from 'zod';
import { ProgressTokenSchema } from '../jsonrpc/payload.js';
import type { ProgressToken } from '../jsonrpc/payload.js';

export { ProgressTokenSchema, type ProgressToken } from '../jsonrpc/payload.js';

// ─── Method names ─────────────────────────────────────────────────────────────

/** Method name for the progress notification. (§15.1) */
export const PROGRESS_NOTIFICATION_METHOD = 'notifications/progress' as const;

/** Method name for the cancellation notification. (§15.2) */
export const CANCELLED_NOTIFICATION_METHOD = 'notifications/cancelled' as const;

// ─── ProgressNotification ─────────────────────────────────────────────────────

/**
 * The params object carried by a `notifications/progress` notification. (§15.1.3)
 *
 * `progressToken` (REQUIRED): correlates this notification to the in-flight
 * request that opted in via `_meta.progressToken`. (R-15.1.3-a, R-15.1.3-b)
 *
 * `progress` (REQUIRED): progress made so far; MUST strictly increase with each
 * successive notification for the same token. (R-15.1.3-d, R-15.1.3-e)
 *
 * `total` (OPTIONAL): total expected; omitted when unknown. (R-15.1.3-g)
 *
 * `message` (OPTIONAL): human-readable description for display. (R-15.1.3-j)
 */
export const ProgressNotificationParamsSchema = z
  .object({
    /** REQUIRED. Correlates this notification to the opted-in request. (R-15.1.3-a) */
    progressToken: ProgressTokenSchema,
    /** REQUIRED. Monotonically increasing progress value. (R-15.1.3-d, R-15.1.3-e) */
    progress: z.number(),
    /** OPTIONAL. Total expected progress; absent when unknown. (R-15.1.3-g) */
    total: z.number().optional(),
    /** OPTIONAL. Human-readable progress description. (R-15.1.3-j) */
    message: z.string().optional(),
    /** OPTIONAL. Notification metadata. */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ProgressNotificationParams = z.infer<typeof ProgressNotificationParamsSchema>;

/** Full `notifications/progress` notification envelope. (§15.1) */
export const ProgressNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.literal(PROGRESS_NOTIFICATION_METHOD),
    params: ProgressNotificationParamsSchema,
  })
  .passthrough();

export type ProgressNotification = z.infer<typeof ProgressNotificationSchema>;

// ─── CancelledNotification ────────────────────────────────────────────────────

/**
 * The params object carried by a `notifications/cancelled` notification. (§15.2.1)
 *
 * `requestId` (MUST reference an in-flight request the sender issued):
 * optional in the schema shape because a receiver must tolerate malformed
 * cancellations gracefully (R-15.2.2-f), but semantically it MUST correspond
 * to a real in-flight request the sender issued in the same direction.
 * (R-15.2.1-a, R-15.2.1-b)
 *
 * `reason` (OPTIONAL): human-readable explanation; MAY be logged. (R-15.2.1-c)
 */
export const CancelledNotificationParamsSchema = z
  .object({
    /** The `id` of the in-flight request being cancelled. (R-15.2.1-a) */
    requestId: z.union([z.string(), z.number()]).optional(),
    /** OPTIONAL human-readable cancellation reason. (R-15.2.1-c) */
    reason: z.string().optional(),
    /** OPTIONAL. Notification metadata. */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type CancelledNotificationParams = z.infer<typeof CancelledNotificationParamsSchema>;

/** Full `notifications/cancelled` notification envelope. (§15.2) */
export const CancelledNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.literal(CANCELLED_NOTIFICATION_METHOD),
    params: CancelledNotificationParamsSchema,
  })
  .passthrough();

export type CancelledNotification = z.infer<typeof CancelledNotificationSchema>;

// ─── ProgressToken uniqueness key ────────────────────────────────────────────

/**
 * Derives a typed string key that distinguishes `string` and `number` tokens
 * with the same textual representation — mirroring the InFlightTracker approach
 * for request ids. (R-15.1.1-c)
 */
function tokenKey(token: ProgressToken): string {
  return typeof token === 'string' ? `s:${token}` : `n:${token}`;
}

// ─── ProgressTracker ─────────────────────────────────────────────────────────

interface TrackedToken {
  readonly token: ProgressToken;
  lastProgress: number;
}

/**
 * Tracks active progress tokens for a single sender, enforcing uniqueness and
 * monotonicity rules from §15.1.
 *
 * Rules enforced:
 *   R-15.1.1-c  Tokens MUST be unique across the sender's currently active requests.
 *   R-15.1.1-d  Receivers MUST treat the token as opaque (no content inspection).
 *   R-15.1.3-e  `progress` MUST strictly increase across successive notifications.
 *   R-15.1.4-g  MUST stop emitting progress once the operation reaches terminal state.
 */
export class ProgressTracker {
  private readonly active = new Map<string, TrackedToken>();

  /**
   * Registers `token` as active when a request carrying it is about to be sent.
   * @throws {Error} when `token` is already active — enforces R-15.1.1-c.
   */
  register(token: ProgressToken): void {
    const key = tokenKey(token);
    if (this.active.has(key)) {
      throw new Error(
        `Progress token ${JSON.stringify(token)} is already active; tokens must be unique across the sender's active requests (R-15.1.1-c)`,
      );
    }
    this.active.set(key, { token, lastProgress: -Infinity });
  }

  /**
   * Removes `token` from the active set once the operation has reached a
   * terminal state (final response sent or received). (R-15.1.4-g)
   *
   * Safe to call for a token that is not currently tracked.
   */
  complete(token: ProgressToken): void {
    this.active.delete(tokenKey(token));
  }

  /** Returns `true` when `token` is currently registered as active. */
  has(token: ProgressToken): boolean {
    return this.active.has(tokenKey(token));
  }

  /**
   * Returns `true` when `progress` is strictly greater than the last recorded
   * value for `token`, satisfying the monotonic-increase invariant. (R-15.1.3-e)
   *
   * Returns `false` for an unknown (not-yet-registered or already-completed) token.
   */
  isMonotonic(token: ProgressToken, progress: number): boolean {
    const entry = this.active.get(tokenKey(token));
    if (!entry) return false;
    return progress > entry.lastProgress;
  }

  /**
   * Records `progress` as the latest value for `token` after a monotonicity
   * check has passed.
   *
   * @throws {Error} when `token` is not currently active.
   */
  recordProgress(token: ProgressToken, progress: number): void {
    const key = tokenKey(token);
    const entry = this.active.get(key);
    if (!entry) {
      throw new Error(
        `Progress token ${JSON.stringify(token)} is not active; cannot record progress`,
      );
    }
    entry.lastProgress = progress;
  }

  /** Number of currently active progress tokens. */
  get size(): number {
    return this.active.size;
  }

  /** Snapshot of all currently active tokens. */
  get activeTokens(): ReadonlyArray<ProgressToken> {
    return Array.from(this.active.values()).map((e) => e.token);
  }
}

// ─── ProgressRateLimiter ──────────────────────────────────────────────────────

/**
 * Per-token rate-limiter for `notifications/progress` emissions. (RC-3 / SHOULD)
 *
 * Implementations SHOULD throttle progress notifications to avoid flooding the
 * transport. A sender may call `shouldEmit()` before dispatching each notification;
 * the limiter suppresses emissions that arrive within the quiet window for that
 * token.
 *
 * Each token has an independent time-of-last-emission so that a slow-moving
 * token is not penalized by a fast-moving one.
 *
 * @example
 * ```ts
 * const limiter = new ProgressRateLimiter(100); // 100 ms minimum interval
 * if (limiter.shouldEmit(token, Date.now())) {
 *   sendProgressNotification(token, progress);
 * }
 * ```
 */
export class ProgressRateLimiter {
  private readonly intervalMs: number;
  private readonly lastEmit = new Map<string, number>();

  /**
   * @param intervalMs - Minimum milliseconds between successive progress
   *   notifications for the same token. Defaults to 100 ms. (RC-3)
   */
  constructor(intervalMs = 100) {
    this.intervalMs = intervalMs;
  }

  /**
   * Returns `true` when a notification for `token` may be emitted at `nowMs`.
   *
   * Calling this method records `nowMs` as the last-emit time for the token
   * when emission is permitted, so the next call is automatically constrained.
   *
   * @param token - The progress token being checked.
   * @param nowMs - Current time in milliseconds (pass `Date.now()` at the call site).
   */
  shouldEmit(token: ProgressToken, nowMs: number): boolean {
    const key = tokenKey(token);
    const last = this.lastEmit.get(key);
    if (last !== undefined && nowMs - last < this.intervalMs) return false;
    this.lastEmit.set(key, nowMs);
    return true;
  }

  /**
   * Clears the rate-limit state for `token` when the operation is terminal.
   * Safe to call for an unknown token.
   */
  complete(token: ProgressToken): void {
    this.lastEmit.delete(tokenKey(token));
  }
}

// ─── Cancellation utilities ───────────────────────────────────────────────────

// ─── CancellationHandler ──────────────────────────────────────────────────────

/**
 * Receiver-side registry that maps in-flight request IDs to abort callbacks.
 * (R-15.2.2-d / RC-4)
 *
 * When a valid `notifications/cancelled` arrives, the receiver SHOULD stop
 * processing the matching request, free associated resources, and suppress
 * sending the response. `CancellationHandler` wires that behaviour:
 *
 * 1. **Register** — before dispatching a long-running request, the handler
 *    registers an abort callback (`AbortController.abort`, queue removal, etc.).
 * 2. **Trigger** — when a valid cancellation notification arrives (after
 *    `validateCancellationTarget` confirms eligibility), call `trigger()` to
 *    fire the callback and deregister the entry.
 * 3. **Deregister** — on normal completion, call `deregister()` to remove the
 *    entry without firing the callback.
 *
 * @example
 * ```ts
 * const handler = new CancellationHandler();
 * const ac = new AbortController();
 * handler.register(requestId, () => ac.abort());
 * // … on valid cancellation notification:
 * handler.trigger(requestId); // stops work, frees resources
 * ```
 */
export class CancellationHandler {
  private readonly handlers = new Map<string | number, () => void>();

  /**
   * Registers `onCancel` as the abort callback for `requestId`.
   *
   * A previously registered handler for the same id is silently replaced —
   * callers should `deregister()` before re-using an id.
   */
  register(requestId: string | number, onCancel: () => void): void {
    this.handlers.set(requestId, onCancel);
  }

  /**
   * Fires the abort callback for `requestId` and removes it from the registry.
   *
   * Returns `true` when a handler was found and called (the request was stopped).
   * Returns `false` when no handler is registered for `requestId` — the
   * cancellation may have arrived after the work already completed.
   */
  trigger(requestId: string | number): boolean {
    const fn = this.handlers.get(requestId);
    if (!fn) return false;
    this.handlers.delete(requestId);
    fn();
    return true;
  }

  /**
   * Removes the handler for `requestId` without calling it.
   *
   * Call this on normal completion so the registry does not hold stale entries.
   * Safe to call for an unknown `requestId`.
   */
  deregister(requestId: string | number): void {
    this.handlers.delete(requestId);
  }

  /** Returns `true` when an abort callback is registered for `requestId`. */
  has(requestId: string | number): boolean {
    return this.handlers.has(requestId);
  }

  /** Number of currently registered abort callbacks. */
  get size(): number {
    return this.handlers.size;
  }
}

// ─── CancelledRequestSet ──────────────────────────────────────────────────────

/**
 * Sender-side set of request IDs for which a `notifications/cancelled` has been
 * sent but whose response has not yet arrived. (R-15.2.3-e / RC-6)
 *
 * A sender SHOULD distinctly ignore (not just tolerate) late responses to
 * cancelled requests — so callers can detect the race rather than silently
 * processing a stale result.
 *
 * Usage:
 * 1. **`add(requestId)`** — call immediately after sending the cancellation
 *    notification.
 * 2. **`isIgnorable(requestId)`** — call when a response arrives; if `true`,
 *    discard the response without processing it.
 * 3. **`acknowledge(requestId)`** — call after discarding the late response to
 *    prevent unbounded set growth.
 *
 * @example
 * ```ts
 * const cancelled = new CancelledRequestSet();
 * sendCancellationNotification(requestId);
 * cancelled.add(requestId);
 * // … later, when a response arrives:
 * if (cancelled.isIgnorable(response.id)) {
 *   cancelled.acknowledge(response.id);
 *   return; // silently discard
 * }
 * ```
 */
export class CancelledRequestSet {
  private readonly ids = new Set<string | number>();

  /**
   * Marks `requestId` as cancelled.
   *
   * Call this after sending `notifications/cancelled` for the request.
   */
  add(requestId: string | number): void {
    this.ids.add(requestId);
  }

  /**
   * Returns `true` when a response for `requestId` SHOULD be ignored because
   * a cancellation notification was previously sent for it. (R-15.2.3-e)
   */
  isIgnorable(requestId: string | number): boolean {
    return this.ids.has(requestId);
  }

  /**
   * Removes `requestId` from the set after the late response has been received
   * and discarded. Safe to call for an unknown `requestId`.
   */
  acknowledge(requestId: string | number): void {
    this.ids.delete(requestId);
  }

  /** Number of IDs awaiting a late response to discard. */
  get size(): number {
    return this.ids.size;
  }
}

// ─── Cancellation utilities ──────────────────────────────────────────────────

/**
 * The method name for the `server/discover` handshake exchange. Clients MUST
 * NOT cancel this exchange. (R-15.2.2-b)
 */
export const SERVER_DISCOVER_METHOD = 'server/discover' as const;

/**
 * Returns `true` when `method` names the `server/discover` handshake, which
 * MUST NOT be cancelled by a client. (R-15.2.2-b)
 */
export function isDiscoverMethod(method: string): boolean {
  return method === SERVER_DISCOVER_METHOD;
}

/**
 * Outcome of `validateCancellationTarget`.
 */
export type CancellationValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validates that a cancellation target (`requestId` from a
 * `notifications/cancelled`) is eligible given the sender's in-flight set.
 *
 * A valid target must:
 *   - be present (requestId is known)
 *   - appear in `inFlightIds` (in-flight from the sender's perspective)
 *   - not be the `server/discover` id (if `discoverRequestId` is provided)
 *
 * (R-15.2.1-a, R-15.2.1-b, R-15.2.2-b)
 *
 * @param requestId        - The target id from the cancellation notification.
 * @param inFlightIds      - Ids of requests the sender has issued and not yet received
 *                           a response to.
 * @param discoverRequestId - If provided, the id of the `server/discover` request
 *                           that must not be cancelled.
 */
export function validateCancellationTarget(
  requestId: string | number | undefined,
  inFlightIds: ReadonlySet<string | number>,
  discoverRequestId?: string | number,
): CancellationValidationResult {
  if (requestId === undefined) {
    return { ok: false, reason: 'requestId is required' };
  }
  if (discoverRequestId !== undefined && requestId === discoverRequestId) {
    return {
      ok: false,
      reason: `Cannot cancel the server/discover handshake (id ${JSON.stringify(requestId)}) (R-15.2.2-b)`,
    };
  }
  if (!inFlightIds.has(requestId)) {
    return {
      ok: false,
      reason: `requestId ${JSON.stringify(requestId)} is not in-flight from the sender; may only cancel own in-flight requests (R-15.2.1-a)`,
    };
  }
  return { ok: true };
}
