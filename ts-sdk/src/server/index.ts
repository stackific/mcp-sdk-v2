/**
 * Server runtime — an embeddable, edge-friendly MCP server: the `McpServer`
 * dispatcher + registration API, a Web-standard Streamable HTTP request handler,
 * and a Hono adapter.
 *
 * This barrel imports no `node:*` and uses only Web-platform APIs, so it can be
 * imported on Cloudflare Workers / Deno / Bun as well as Node. Import it via the
 * package's `./server` subpath. The Node (`node:http`) adapter is kept separate
 * under `./server/node` so it never enters an edge bundle.
 */
export {
  McpServer,
  ServerError,
  METHOD_NOT_FOUND_CODE,
  INTERNAL_ERROR_CODE,
} from './server.js';
export type {
  McpServerOptions,
  RequestContext,
  ToolResult,
  ToolContext,
  ToolDef,
  ToolHandler,
  ResourceDef,
  ResourceReader,
  TemplateReader,
  ResourceTemplateDef,
  PromptArg,
  PromptDef,
  PromptHandler,
  TaskStore,
} from './server.js';

export { createMcpRequestHandler } from './streamable-http.js';
export type { AuthGate, McpRequestHandlerOptions } from './streamable-http.js';

export { toHonoMcpHandler } from './hono.js';
export type { HonoLikeContext } from './hono.js';

// S4 — Tasks runtime (§25).
export { InMemoryTaskStore } from './tasks.js';
export type { InMemoryTaskStoreOptions } from './tasks.js';

// S5 — authorization glue (§23).
export { bearerAuthGate, buildProtectedResourceMetadata } from './auth.js';
export type { BearerAuthGateOptions, ProtectedResourceMetadataInit } from './auth.js';

// S6 — response caching hints (§13).
export { withCacheHints } from './caching.js';
export type { CacheHints } from './caching.js';

// S7 — serve an McpServer over a (stdio) Transport.
export { serveStdio } from './stdio.js';

// S8 — MCP Apps / UI extension helpers (§26).
export { uiResource, uiToolResult } from './ui.js';
export type { UiToolResultOptions } from './ui.js';
export { UI_MIME_TYPE, UI_URI_SCHEME, isUiResourceUri } from '../protocol/ui.js';
export type { UiVisibility } from '../protocol/ui.js';

// S2 — multi-round-trip (input-required) server helpers (§11), re-exported from the protocol layer.
export {
  buildInputRequiredResult,
  buildReRequestInputRequiredResult,
  computeMissingInputResponseKeys,
  mayEmitInputRequestKind,
  requiredClientCapabilityForInputRequest,
} from '../protocol/multi-round-trip.js';
