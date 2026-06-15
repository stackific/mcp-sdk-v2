/**
 * Abstract message-kind schemas for MCP (§1.2, §2.2, §3).
 *
 * Three kinds are used over JSON-RPC 2.0:
 *  - Request  — carries `id` and `method`; expects exactly one matching response.
 *  - Notification — carries `method` only; receiver MUST NOT reply.
 *  - Response — correlates to a request by `id`; is a result XOR an error.
 *
 * The concrete JSON-RPC 2.0 envelope (the `jsonrpc` field, full `id` rules,
 * and complete error shape) is defined in S03. These schemas fix the structural
 * invariants stated in §2.2 and form the basis for that concrete layer.
 */

import { z } from 'zod';

/**
 * Abstract request schema (§2.2, AC-01.6).
 *
 * `id` and `method` are REQUIRED. `params` is OPTIONAL.
 * `.passthrough()` allows the S03 concrete envelope (e.g. `jsonrpc`) to extend
 * this shape without breaking validation.
 */
export const RequestSchema = z.object({
  // The ABSTRACT base models raw JSON-RPC 2.0, which permits a null id (AC-01.6 /
  // R-2.2-d). MCP's stricter "id MUST NOT be null" rule (R-3.2-b) is enforced on
  // the CONCRETE wire request by JSONRPCRequestSchema (S03), not here. (m1: the
  // FINAL_REVIEW flagged this as a contradiction, but it is an intentional
  // abstract-vs-concrete split — the wire schema is correct.)
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
}).passthrough();

export type Request = z.infer<typeof RequestSchema>;

/**
 * Abstract notification schema (§2.2, AC-01.7).
 *
 * `method` is REQUIRED; `params` is OPTIONAL; there is NO `id`.
 * The absence of `id` is what distinguishes a notification from a request.
 * Receivers MUST NOT send any response to a notification (R-2.2-e).
 */
export const NotificationSchema = z.object({
  method: z.string(),
  params: z.record(z.unknown()).optional(),
}).passthrough();

export type Notification = z.infer<typeof NotificationSchema>;

/**
 * Abstract error payload schema (§2.2).
 *
 * Carries a numeric `code`, a human-readable `message`, and optional `data`.
 * Standard JSON-RPC codes and MCP-specific codes are defined in S04 and S09.
 */
export const ErrorPayloadSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

/**
 * Returns `true` when the value has an `id` field, indicating it is a request
 * rather than a notification. (AC-01.6)
 */
export function isRequest(msg: Record<string, unknown>): boolean {
  return 'id' in msg;
}

/**
 * Returns `true` when the value has a `method` and NO `id`, indicating it is a
 * notification. Receivers MUST NOT reply to notifications. (R-2.2-e, AC-01.7)
 */
export function isNotification(msg: Record<string, unknown>): boolean {
  return 'method' in msg && !('id' in msg);
}
