/**
 * S07 — Protocol Revision & Carrying the Revision (§5.1–§5.2).
 *
 * Provides the revision-format validator, the HTTP-transport mirror check, and
 * re-exports the current revision and support predicate from S05. Together these
 * cover every normative rule in §5 that S05 did not already implement:
 *
 *   R-5.1-a  MUST treat identifiers as opaque, exactly-matched strings.
 *   R-5.1-b  MUST NOT perform lexical, chronological, or range comparison.
 *   R-5.1-c  MUST NOT infer revision from earlier requests (no handshake).
 *   R-5.2-a  Every request MUST carry `io.modelcontextprotocol/protocolVersion`.
 *   R-5.2-b  Value's JSON type MUST be string; value MUST be a revision identifier.
 *   R-5.2-c  HTTP transport MUST mirror revision in `MCP-Protocol-Version` header.
 *   R-5.2-d  Header value MUST match the `_meta` value for the same request.
 *   R-5.2-e  Mismatch MUST yield HTTP 400 Bad Request.
 *
 * `CURRENT_PROTOCOL_VERSION` and `isSupportedProtocolVersion` live in meta.ts
 * (S05) because S05 defines the `io.modelcontextprotocol/protocolVersion`
 * reserved key and its validation. This module adds format-checking and the
 * HTTP header cross-check that are S07-specific.
 */

export {
  CURRENT_PROTOCOL_VERSION,
  isSupportedProtocolVersion,
} from './meta.js';

// ─── Revision-format validation ───────────────────────────────────────────────

/**
 * The `YYYY-MM-DD` revision-format regex and its predicate. (§5.1, R-5.2-b)
 *
 * These primitives are defined in meta.ts (S05) — the lower layer — so that the
 * request gate `validateRequestMeta` can reject a malformed-but-string
 * `protocolVersion` without an import cycle. They are re-exported here because
 * the revision-format rule is owned by S07; callers may import either path.
 * Format validity is a shape check only — it implies no ordering or support
 * (use `isSupportedProtocolVersion` for that), honoring R-5.1-a / R-5.1-b.
 */
export { PROTOCOL_REVISION_FORMAT_RE, isValidRevisionFormat } from './meta.js';

// ─── HTTP transport mirror check ──────────────────────────────────────────────

/**
 * The HTTP status code that MUST be returned when the `MCP-Protocol-Version`
 * header and the `io.modelcontextprotocol/protocolVersion` `_meta` value do
 * not match. (R-5.2-e)
 */
export const HTTP_REVISION_MISMATCH_STATUS = 400 as const;

/** Name of the HTTP header that mirrors the protocol revision. (§5.2) */
export const MCP_PROTOCOL_VERSION_HEADER = 'MCP-Protocol-Version' as const;

/** Outcome of `checkHttpRevisionHeader`. */
export type HttpRevisionCheckResult =
  | { ok: true }
  | { ok: false; status: typeof HTTP_REVISION_MISMATCH_STATUS; message: string };

/**
 * Validates that the `MCP-Protocol-Version` HTTP header byte-for-byte matches
 * the `io.modelcontextprotocol/protocolVersion` value in the request's `_meta`.
 *
 * Returns `{ ok: true }` when the values match or when `header` is `undefined`
 * (non-HTTP transport — no header to check).
 *
 * Returns `{ ok: false, status: 400, message }` when the header is present but
 * does not equal `metaVersion`, indicating the server MUST respond with
 * HTTP 400 Bad Request. (R-5.2-d, R-5.2-e)
 *
 * @param header      - The value of the `MCP-Protocol-Version` HTTP header, or
 *                      `undefined` when operating on a non-HTTP transport.
 * @param metaVersion - The `io.modelcontextprotocol/protocolVersion` string from
 *                      the request's `params._meta`.
 */
export function checkHttpRevisionHeader(
  header: string | undefined,
  metaVersion: string,
): HttpRevisionCheckResult {
  if (header === undefined) {
    return { ok: true }; // non-HTTP transport; no header to validate
  }
  if (header === metaVersion) {
    return { ok: true };
  }
  return {
    ok: false,
    status: HTTP_REVISION_MISMATCH_STATUS,
    message: `${MCP_PROTOCOL_VERSION_HEADER} header "${header}" does not match _meta protocolVersion "${metaVersion}" (R-5.2-e)`,
  };
}
