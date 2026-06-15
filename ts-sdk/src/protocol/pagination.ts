/**
 * S18 — Cursor-based pagination (§12).
 *
 * Defines the shapes and utilities for the uniform page-by-page exchange:
 *   - `PaginatedRequestParams`: base request params carrying an optional `cursor`
 *   - `PaginatedResult`: base result shape carrying an optional `nextCursor`
 *   - Cursor-presence and end-of-results predicates
 *   - Cache-key helper enforcing per-cursor cache isolation
 *   - Invalid-cursor error builder (`-32602`)
 *
 * The `Cursor` type itself is the canonical opaque-string type defined in S04
 * (§3.7, Appendix E). S18 governs how it is threaded through list exchanges.
 *
 * Paginated methods: `tools/list`, `resources/list`, `resources/templates/list`,
 * `prompts/list` — each extends these base shapes with its list-specific payload.
 */

import { z } from 'zod';
import { CursorSchema } from '../jsonrpc/payload.js';
import { ResultTypeSchema } from '../jsonrpc/payload.js';

export { CursorSchema, type Cursor } from '../jsonrpc/payload.js';

// ─── PaginatedRequestParams ───────────────────────────────────────────────────

/**
 * Base parameter shape for any paginated list request. (§12, §6 / S18)
 *
 * `cursor` (OPTIONAL): when present the server returns results positioned after
 * this cursor (R-12.2-a). When absent the server returns the first page
 * (R-12.2-b). The empty string `""` is a valid present cursor (R-12.1-a).
 *
 * `_meta` (OPTIONAL): metadata; the per-request `_meta` requirement (§4.3 / S05)
 * applies when this shape is used in a client request — see `RequestParamsSchema`
 * in S04.
 *
 * `.passthrough()` allows method-specific params to survive parse.
 */
export const PaginatedRequestParamsSchema = z
  .object({
    /** OPTIONAL per-request metadata (see §4 / S05 for required keys on client requests). */
    _meta: z.record(z.unknown()).optional(),
    /** OPTIONAL opaque pagination token; absent means first page. (R-12.2-a, R-12.2-b) */
    cursor: CursorSchema.optional(),
  })
  .passthrough();

export type PaginatedRequestParams = z.infer<typeof PaginatedRequestParamsSchema>;

// ─── PaginatedResult ──────────────────────────────────────────────────────────

/**
 * Base result shape for any paginated list result. (§12 / S18)
 *
 * `nextCursor` (OPTIONAL): when present, more results MAY follow (R-12.2-c)
 * and the client uses this exact value as `cursor` on the next request.
 * When absent, this is the final page (R-12.2-d, R-12.3-c).
 *
 * The empty string `""` is a valid `nextCursor` (R-12.3-d) and MUST be sent
 * back as `cursor` to continue — it is NOT an end-of-results signal.
 *
 * Method-specific list members (e.g. `tools`, `resources`) are preserved via
 * `.passthrough()`.
 */
export const PaginatedResultSchema = z
  .object({
    /** REQUIRED discriminator inherited from the base Result shape. (§3.6 / S04) */
    resultType: ResultTypeSchema,
    /** OPTIONAL metadata. */
    _meta: z.record(z.unknown()).optional(),
    /** OPTIONAL: opaque token for the next page; absent means last page. (R-12.2-c, R-12.2-d) */
    nextCursor: CursorSchema.optional(),
  })
  .passthrough();

export type PaginatedResult = z.infer<typeof PaginatedResultSchema>;

// ─── Cursor predicates ────────────────────────────────────────────────────────

/**
 * Returns `true` when `nextCursor` is present in the result, indicating that
 * more results MAY be available and the client should request the next page.
 * (R-12.2-c, R-12.3-b)
 *
 * Note: the empty string `""` is a PRESENT cursor — it is NOT treated as
 * absence. (R-12.1-a, R-12.3-d)
 */
export function hasNextCursor(result: { nextCursor?: string }): boolean {
  return result.nextCursor !== undefined;
}

/**
 * Returns `true` when this is the final page — `nextCursor` is absent.
 * (R-12.2-d, R-12.3-c)
 */
export function isLastPage(result: { nextCursor?: string }): boolean {
  return !hasNextCursor(result);
}

/**
 * Returns `true` when `cursor` is a present value (including the empty string).
 *
 * A client MUST treat a present `nextCursor` — even `""` — as a cursor to
 * echo back on the next request. Only `undefined` signals "no cursor". (R-12.1-a)
 */
export function isCursorPresent(cursor: string | undefined): boolean {
  return cursor !== undefined;
}

// ─── Invalid-cursor error ─────────────────────────────────────────────────────

/** Error code for an invalid / unrecognized cursor. (R-12.4-c) */
export const INVALID_CURSOR_CODE = -32602 as const;

/**
 * Builds the JSON-RPC error payload for an invalid-cursor rejection.
 * (R-12.4-c, R-12.4-d)
 *
 * Servers SHOULD return this code when a client supplies a cursor that was
 * not issued by this server, is not recognized, or is otherwise malformed.
 */
export function buildInvalidCursorError(message?: string): {
  code: typeof INVALID_CURSOR_CODE;
  message: string;
} {
  return {
    code: INVALID_CURSOR_CODE,
    message: message ?? 'Invalid params: unrecognized cursor',
  };
}

// ─── Cache-key helper ─────────────────────────────────────────────────────────

/**
 * Produces a cache entry key for a paginated request.
 *
 * Each page of a paginated result is an independent cacheable response keyed
 * by the request that produced it (including the `cursor` value). A cached page
 * for one `cursor` value MUST NOT be served as the response for a request bearing
 * a different `cursor` value (including the first-page request, which omits
 * `cursor`). (R-12.5-a, R-13.5-i)
 *
 * Callers may use this to implement per-page cache entries or to verify that
 * two requests do NOT share a cache entry.
 */
export function paginationCacheKey(method: string, cursor: string | undefined): string {
  return cursor === undefined
    ? `${method}::page:first`
    : `${method}::page:cursor:${cursor}`;
}

// ─── Reference paginator ─────────────────────────────────────────────────────

/**
 * Discriminated result from `OffsetPaginator.getPage`.
 *
 * On success (`ok: true`): the page items and an optional next cursor.
 * On failure (`ok: false`): a structured error from `buildInvalidCursorError` —
 *   the paginator never throws on unrecognized cursors. (RC-3, RC-4)
 */
export type PaginatorPageResult<T> =
  | { ok: true; items: ReadonlyArray<T>; nextCursor: string | undefined }
  | { ok: false; error: ReturnType<typeof buildInvalidCursorError> };

/**
 * Reference implementation of a cursor-based paginator over an in-memory array.
 *
 * Cursors are deterministic decimal offset strings — the same position always
 * yields the same cursor token (RC-2: stability). An unrecognized or malformed
 * cursor is returned as a structured error rather than thrown (RC-3, RC-4).
 */
export class OffsetPaginator<T> {
  /** Items returned per page. */
  readonly pageSize: number;

  constructor(
    private readonly items: ReadonlyArray<T>,
    pageSize = 20,
  ) {
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw new RangeError('pageSize must be a positive integer');
    }
    this.pageSize = pageSize;
  }

  /**
   * Returns a page of items for the given cursor.
   *
   * - Absent cursor (`undefined`) → first page. (R-12.2-b)
   * - Present cursor → page starting at the encoded offset. (R-12.2-a)
   * - Unrecognized cursor → `{ ok: false, error }` — never throws. (RC-3, RC-4)
   */
  getPage(cursor: string | undefined): PaginatorPageResult<T> {
    const offset = cursor === undefined ? 0 : this.decodeCursor(cursor);
    if (offset === null) {
      return { ok: false, error: buildInvalidCursorError() };
    }

    const page = this.items.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;
    const nextCursor =
      nextOffset < this.items.length ? this.encodeCursor(nextOffset) : undefined;

    return { ok: true, items: page, nextCursor };
  }

  /** Encodes an offset as a deterministic decimal cursor string. (RC-2) */
  private encodeCursor(offset: number): string {
    return String(offset);
  }

  /** Decodes a cursor string; returns `null` for any unrecognized token. */
  private decodeCursor(cursor: string): number | null {
    if (!/^\d+$/.test(cursor)) return null;
    const n = Number(cursor);
    if (n < 0 || n > this.items.length || !Number.isInteger(n)) return null;
    return n;
  }
}

// ─── Paginated methods registry ───────────────────────────────────────────────

/**
 * The set of method names whose results carry `PaginatedResult` shapes. (§12)
 *
 * All four methods support optional `cursor` on the request and optional
 * `nextCursor` on the result. Their list-specific payloads are defined in the
 * respective feature stories (S24, S26, S28).
 */
export const PAGINATED_METHODS = new Set([
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
] as const);

/** Returns `true` when `method` is one of the paginated list methods. */
export function isPaginatedMethod(method: string): boolean {
  return PAGINATED_METHODS.has(method as never);
}
