/**
 * S23 — Utilities: Logging & Trace Context (§15.3–§15.4).
 *
 * Two diagnostic utilities layered on the message envelope:
 *
 * 1. **Logging** (Deprecated per [SEP-2577], §15.3):
 *    A per-request opt-in mechanism via the reserved `_meta` key
 *    `io.modelcontextprotocol/logLevel`. When set, the server MAY emit
 *    `notifications/message` log notifications at or above that severity,
 *    on the request's response stream, before the final response.
 *    Implementations SHOULD prefer stderr or out-of-band tracing. (R-15.3-a)
 *
 * 2. **Trace context** (active, §15.4):
 *    Three W3C bare keys (`traceparent`, `tracestate`, `baggage`) may appear
 *    in the `_meta` of any request or notification. Receivers MUST treat them
 *    as opaque; intermediaries SHOULD propagate them unchanged. (R-15.4.2-h)
 *
 * `LoggingLevel`, `LOGGING_LEVELS`, `LoggingLevelSchema`, `loggingLevelIndex`,
 * and `isAtOrAboveLogLevel` are defined in S05 (`src/protocol/meta.ts`) because
 * `io.modelcontextprotocol/logLevel` is a reserved per-request `_meta` key
 * introduced there. This module re-exports them and adds the notification
 * schemas, level validator, and trace-context utilities.
 */

import { z } from 'zod';
import {
  LoggingLevelSchema,
  loggingLevelIndex,
  INVALID_PARAMS_CODE,
} from './meta.js';
import { isValidTraceparent, isValidTracestate, isValidBaggage } from '../json/meta-key.js';

export {
  LoggingLevelSchema,
  type LoggingLevel,
  LOGGING_LEVELS,
  loggingLevelIndex,
  isAtOrAboveLogLevel,
} from './meta.js';

// ─── LoggingMessageNotification ───────────────────────────────────────────────

/** Method name for the (Deprecated) per-request log notification. (§15.3.2) */
export const LOGGING_MESSAGE_METHOD = 'notifications/message' as const;

/**
 * The params object of a `notifications/message` log notification. (§15.3.2)
 *
 * `level` (REQUIRED): exactly one of the eight `LoggingLevel` strings.
 * `logger` (OPTIONAL): identifies the emitting logger.
 * `data` (REQUIRED): the log payload — any JSON-serializable value.
 *   MUST NOT contain credentials, secrets, PII, or attacker-aiding internals.
 *   (R-15.3.2-e)
 */
export const LoggingMessageNotificationParamsSchema = z
  .object({
    /** REQUIRED. Severity of this message. (R-15.3.2-a) */
    level: LoggingLevelSchema,
    /** OPTIONAL. Name of the emitting logger. (R-15.3.2-b) */
    logger: z.string().optional(),
    /** REQUIRED. The log payload; any JSON-serializable value. (R-15.3.2-c) */
    data: z.unknown(),
    /** OPTIONAL. Notification metadata. */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if (!('data' in val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`data` is REQUIRED on a log notification (R-15.3.2-c)',
      });
    }
  });

export type LoggingMessageNotificationParams = z.infer<
  typeof LoggingMessageNotificationParamsSchema
>;

/**
 * Full `notifications/message` notification envelope. (§15.3)
 *
 * @deprecated Logging is a Deprecated capability (§27.3). For stdio (§8) write
 * diagnostics to stderr; for general observability emit telemetry via an
 * external observability framework. Earliest removal: 2026-07-28 (§27.2/§27.3,
 * R-27.4-a/-b).
 */
export const LoggingMessageNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.literal(LOGGING_MESSAGE_METHOD),
    params: LoggingMessageNotificationParamsSchema,
  })
  .passthrough();

export type LoggingMessageNotification = z.infer<typeof LoggingMessageNotificationSchema>;

// ─── Per-request opt-in validation ───────────────────────────────────────────

/** Outcome of `validateLogLevelOptIn`. */
export type LogLevelValidationResult =
  | { ok: true }
  | { ok: false; code: typeof INVALID_PARAMS_CODE; message: string };

/**
 * Validates the `io.modelcontextprotocol/logLevel` opt-in value from a request's
 * `_meta`. Returns `{ ok: true }` when the value is a recognized `LoggingLevel`
 * string, and an `-32602` error when it is not. (R-15.3.3-g)
 *
 * A server SHOULD reject a request whose `logLevel` value is not one of the
 * recognized strings with JSON-RPC error code `-32602` (Invalid params).
 *
 * @param logLevel - The raw value of `io.modelcontextprotocol/logLevel` from `_meta`.
 */
export function validateLogLevelOptIn(logLevel: unknown): LogLevelValidationResult {
  const result = LoggingLevelSchema.safeParse(logLevel);
  if (result.success) return { ok: true };
  return {
    ok: false,
    code: INVALID_PARAMS_CODE,
    message: `Invalid params: io.modelcontextprotocol/logLevel must be one of the recognized LoggingLevel strings (${result.error.issues.map((i) => i.message).join('; ')})`,
  };
}

/**
 * Returns the minimum numeric severity index that should be emitted for a
 * request bearing `logLevelOptIn`. Used by server implementations to filter
 * log notifications.
 *
 * Returns `-1` when no `logLevel` opt-in is present, indicating that no log
 * notifications MUST be emitted. (R-15.3.3-a)
 *
 * @param logLevelOptIn - The raw value of `io.modelcontextprotocol/logLevel`, or
 *   `undefined` / `null` when the key is absent from `_meta`.
 */
export function resolvedMinLogLevelIndex(logLevelOptIn: unknown): number {
  const result = LoggingLevelSchema.safeParse(logLevelOptIn);
  if (!result.success) return -1; // absent or invalid → emit nothing
  return loggingLevelIndex(result.data);
}

// ─── LogRateLimiter ───────────────────────────────────────────────────────────

/**
 * Global rate-limiter for `notifications/message` log emissions. (RC-3 / SHOULD)
 *
 * Implementations SHOULD throttle log notifications to avoid flooding the
 * transport. A sender may call `shouldEmit()` before dispatching each log
 * notification; the limiter suppresses emissions that arrive within the quiet
 * window.
 *
 * Unlike `ProgressRateLimiter`, log notifications are NOT per-token — a single
 * shared throttle window applies to the entire notification stream, because all
 * log messages share the same `notifications/message` channel.
 *
 * @example
 * ```ts
 * const limiter = new LogRateLimiter(50); // 50 ms minimum interval
 * if (limiter.shouldEmit(Date.now())) {
 *   sendLogNotification(level, data);
 * }
 * ```
 */
export class LogRateLimiter {
  private readonly intervalMs: number;
  private lastEmitMs: number | undefined;

  /**
   * @param intervalMs - Minimum milliseconds between successive log notifications.
   *   Defaults to 50 ms. (RC-3)
   */
  constructor(intervalMs = 50) {
    this.intervalMs = intervalMs;
  }

  /**
   * Returns `true` when a log notification may be emitted at `nowMs`.
   *
   * Calling this method records `nowMs` as the last-emit time when emission is
   * permitted, so the next call is automatically constrained.
   *
   * @param nowMs - Current time in milliseconds (pass `Date.now()` at the call site).
   */
  shouldEmit(nowMs: number): boolean {
    if (
      this.lastEmitMs !== undefined &&
      nowMs - this.lastEmitMs < this.intervalMs
    ) {
      return false;
    }
    this.lastEmitMs = nowMs;
    return true;
  }
}

// ─── Trace context ────────────────────────────────────────────────────────────

/** The three W3C trace-context bare keys carried in `_meta`. (§15.4.1) */
export const TRACE_CONTEXT_BARE_KEYS = ['traceparent', 'tracestate', 'baggage'] as const;
export type TraceContextKey = (typeof TRACE_CONTEXT_BARE_KEYS)[number];

/**
 * Returns `true` when `meta` carries a `traceparent` key conforming to the
 * W3C Trace Context format. (R-15.4.1-a)
 */
export function hasTraceparent(meta: Record<string, unknown>): boolean {
  const v = meta['traceparent'];
  return typeof v === 'string' && isValidTraceparent(v);
}

/**
 * Returns `true` when `meta` carries a `tracestate` key conforming to the
 * W3C Trace Context format. (R-15.4.1-b)
 */
export function hasTracestate(meta: Record<string, unknown>): boolean {
  const v = meta['tracestate'];
  return typeof v === 'string' && isValidTracestate(v);
}

/**
 * Returns `true` when `meta` carries a `baggage` key conforming to the
 * W3C Baggage format. (R-15.4.1-c)
 */
export function hasBaggage(meta: Record<string, unknown>): boolean {
  const v = meta['baggage'];
  return typeof v === 'string' && isValidBaggage(v);
}

/**
 * Copies the three W3C trace-context keys (`traceparent`, `tracestate`, `baggage`)
 * from `inbound` onto `outbound` unchanged, for intermediary relay. (R-15.4.2-h)
 *
 * Only keys that are present in `inbound` are copied; absent keys are not added
 * to `outbound`. Existing values in `outbound` are overwritten to ensure the
 * inbound values propagate unchanged.
 *
 * @returns A new object merging `outbound` with the relayed trace-context keys.
 */
export function relayTraceContext(
  inbound: Record<string, unknown>,
  outbound: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...outbound };
  for (const key of TRACE_CONTEXT_BARE_KEYS) {
    if (key in inbound) {
      result[key] = inbound[key];
    }
  }
  return result;
}

/**
 * Extracts only the trace-context keys from `meta`, returning an object that
 * contains at most `traceparent`, `tracestate`, and `baggage`.
 *
 * Receivers that do not participate in tracing can safely ignore the returned
 * object. (R-15.4.2-g)
 */
export function extractTraceContext(
  meta: Record<string, unknown>,
): Partial<Record<TraceContextKey, string>> {
  const ctx: Partial<Record<TraceContextKey, string>> = {};
  for (const key of TRACE_CONTEXT_BARE_KEYS) {
    const val = meta[key];
    if (typeof val === 'string') ctx[key] = val;
  }
  return ctx;
}
