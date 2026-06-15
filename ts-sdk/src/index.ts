/**
 * @stackific/mcp-sdk-ts — Model Context Protocol SDK for Node.js.
 *
 * Wave 1 (S01): Protocol Foundations — roles, message kinds, conformance model,
 *   capability negotiation.
 * Wave 2 (S02): JSON value model, numeric handling, `_meta` key validation.
 * Wave 2 (S20): Common data types — BaseMetadata, Icon/Icons, Implementation.
 * Wave 2 (S43): Feature lifecycle and deprecation governance.
 * Wave 3 (S03): JSON-RPC 2.0 message framing — classification, RequestId,
 *   in-flight tracking.
 * Wave 3 (S21): ContentBlock union, ResourceContents, Annotations, Role.
 * Wave 4 (S04): Result base, RequestParams, NotificationParams, ProgressToken,
 *   Cursor, McpError, EmptyResult — the payload shapes that ride inside S03 envelopes.
 * Wave 5 (S05): MetaObject, RequestMetaObject, LoggingLevel, per-request key
 *   validation, error codes INVALID_PARAMS_CODE / MISSING_CLIENT_CAPABILITY_CODE.
 * Wave 5 (S18): Cursor-based pagination — PaginatedRequestParams, PaginatedResult,
 *   cursor helpers, per-page cache-key isolation.
 * Wave 5 (S19): Response caching hints — CacheableResult, freshness computation,
 *   cache-scope resolution, page-scope consistency.
 * Wave 6 (S06): Stateless Per-Request Model — ContinuationId, STATELESS_MODEL rules.
 * Wave 6 (S07): Protocol Revision — format validation, HTTP header mirror check.
 * Wave 6 (S17): Multi-Round-Trip Requests — InputRequiredResult, InputRequest,
 *   discriminateResultType, isLoadSheddingResult, MRTR_PARTICIPATING_METHODS.
 * Wave 6 (S22): Progress & Cancellation — ProgressNotification, CancelledNotification,
 *   ProgressTracker, validateCancellationTarget.
 * Wave 6 (S23): Logging & Trace Context — LoggingMessageNotification, validateLogLevelOptIn,
 *   relayTraceContext, extractTraceContext.
 * Wave 7 (S08): Discovery via server/discover — DiscoverRequest/DiscoverResult schemas,
 *   processDiscoverRequest reference handler, UnsupportedProtocolVersion (-32004),
 *   order-independent selectRevision, resolveInstructions.
 * Wave 7 (S12): Transport Model & guarantees — Transport contract, TransportError,
 *   NewlineFramer + decodeMessageUnit, RequestCorrelator, InMemoryTransport reference.
 * Wave 8 (S09): Revision Selection & Negotiation Errors — negotiateRevision,
 *   reselect/augment reactions, -32004/-32003 + HTTP 400, §5.7 probe + support cache.
 * Wave 8 (S10): Client & Server Capabilities — ClientCapabilities/ServerCapabilities
 *   schemas, presence/sub-flag gating, method/notification maps, -32003 + degradation.
 * Wave 8 (S14): Streamable HTTP request & headers — POST headers, MCP-Protocol-Version /
 *   routing validation, x-mcp-header annotations + Mcp-Param encoding/validation (-32001).
 */

export * from './protocol/index.js';
export * from './json/index.js';
export * from './types/index.js';
export * from './lifecycle/index.js';
export * from './jsonrpc/index.js';
export * from './transport/index.js';

// Client runtime (host + Streamable HTTP client transport). Edge-friendly; also
// available node-free via the `./client` subpath export for Cloudflare Workers.
export * from './client/index.js';
