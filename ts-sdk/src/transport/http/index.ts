/**
 * S14 — Streamable HTTP: Request, Headers & Routing (§9.1–§9.5).
 *
 * The request half of the Streamable HTTP transport, built on the S12 transport
 * contract and the S05 `_meta` model:
 *
 *   headers.ts        — POST framing, required + routing headers, the
 *                       `MCP-Protocol-Version` rules, and notification responses.
 *   param-encoding.ts — `Mcp-Param-*` value encoding incl. the `=?base64?…?=`
 *                       sentinel.
 *   param-headers.ts  — `x-mcp-header` annotation validity, tool filtering,
 *                       `Mcp-Param-*` emission, and receiver validation.
 *
 * The response half (single JSON vs. SSE), the full `HeaderMismatch` (`-32001`)
 * error object, and HTTP status mapping are owned by S15.
 */

export * from './headers.js';
export * from './param-encoding.js';
export * from './param-headers.js';
export * from './responses.js';
