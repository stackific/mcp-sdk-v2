/**
 * Method dispatch for JSON-RPC request handling (§3.3, R-3.3-i, R-3.3-j, R-3.3-k).
 *
 * Provides the minimal dispatch surface required by S03: given a classified
 * request and a registry of known methods, produce the correct error response
 * when the method is unrecognised or the params are invalid.
 *
 * Standard JSON-RPC error codes -32601 (method not found) and -32602
 * (invalid params) are used here because they originate from the JSON-RPC 2.0
 * specification. The full MCP-specific error-code registry is defined in S04.
 */

import { z } from 'zod';
import type { JSONRPCRequest, JSONRPCErrorResponse, RequestId } from './framing.js';

// Standard JSON-RPC 2.0 error codes referenced by R-3.3-j and R-3.3-k.
// Symbolic constants for the full registry are defined in S04.
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;

// ─── MethodDescriptor ─────────────────────────────────────────────────────────

/**
 * Describes a method that a receiver recognises.
 *
 * A method is registered by name in a `MethodRegistry`; absent entries cause
 * `dispatchRequest` to produce a method-not-found error response. (R-3.3-j)
 */
export interface MethodDescriptor {
  /**
   * When `true`, the `params` object MUST be present on every request to this
   * method. This covers the case where a method's per-request `_meta` is
   * REQUIRED — `params` must be provided to carry it. (R-3.3-i)
   *
   * Requests that omit `params` for such a method are rejected with an
   * invalid-params error response.
   */
  requiresParams?: boolean;

  /**
   * Optional Zod schema used to validate the incoming `params` object.
   *
   * When provided and `params` fails parsing, `dispatchRequest` returns an
   * invalid-params error response. (R-3.3-k)
   *
   * Leave `undefined` to skip schema validation (method accepts any params
   * or no params beyond the `requiresParams` check).
   */
  paramsSchema?: z.ZodType<unknown>;
}

/** Maps method name → descriptor for every method the receiver handles. */
export type MethodRegistry = ReadonlyMap<string, MethodDescriptor>;

// ─── DispatchOutcome ──────────────────────────────────────────────────────────

/** The result of attempting to dispatch a request. */
export type DispatchOutcome =
  | { ok: true }
  | { ok: false; response: JSONRPCErrorResponse };

// ─── dispatchRequest ──────────────────────────────────────────────────────────

/**
 * Validates a classified request against a method registry and returns the
 * dispatch outcome.
 *
 * Returns `{ ok: true }` when the method is registered and params are valid.
 *
 * Returns `{ ok: false, response }` — with the appropriate error response
 * whose `id` echoes the request id with the same JSON type and value
 * (R-3.2-e, R-3.2-f, R-3.2-g) — when any of the following hold:
 *
 *  - The method name is not in `registry` → **method-not-found** (R-3.3-j).
 *  - `descriptor.requiresParams` is `true` and `request.params` is absent
 *    (e.g. method carries per-request `_meta` REQUIRED) → **invalid-params**. (R-3.3-i)
 *  - `descriptor.paramsSchema` is provided and `request.params` fails
 *    parsing → **invalid-params**. (R-3.3-k)
 *
 * @param request  A `JSONRPCRequest` produced by `classifyMessage`.
 * @param registry The set of methods the receiver handles.
 */
export function dispatchRequest(
  request: JSONRPCRequest,
  registry: MethodRegistry,
): DispatchOutcome {
  const descriptor = registry.get(request.method);

  if (!descriptor) {
    return {
      ok: false,
      response: errorResponse(request.id, JSONRPC_METHOD_NOT_FOUND, 'Method not found'),
    };
  }

  // Enforce params presence when the method requires it. (R-3.3-i)
  if (descriptor.requiresParams && request.params === undefined) {
    return {
      ok: false,
      response: errorResponse(
        request.id,
        JSONRPC_INVALID_PARAMS,
        'params must be present for this method (required to carry per-request _meta)',
      ),
    };
  }

  // Validate params shape when a schema is registered. (R-3.3-k)
  if (descriptor.paramsSchema !== undefined && request.params !== undefined) {
    const result = descriptor.paramsSchema.safeParse(request.params);
    if (!result.success) {
      const detail = result.error.issues.map((i) => i.message).join('; ');
      return {
        ok: false,
        response: errorResponse(
          request.id,
          JSONRPC_INVALID_PARAMS,
          `Invalid params: ${detail}`,
        ),
      };
    }
  }

  return { ok: true };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Builds a `JSONRPCErrorResponse` echoing `id` without type coercion. */
function errorResponse(id: RequestId, code: number, message: string): JSONRPCErrorResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
