/**
 * Client runtime — the high-level, edge-friendly client host and the Streamable
 * HTTP client transport, built on the SDK's protocol primitives.
 *
 * This module imports no `node:*` and uses only Web-platform APIs, so it can be
 * imported on Cloudflare Workers / Deno / browsers as well as Node. Import it via
 * the package's `./client` subpath to keep the Node-only stdio transport (which
 * the package root re-exports) out of an edge bundle.
 */
export { Client, RequestError } from './client.js';
export type {
  ClientOptions,
  RequestOptions,
  RequestHandler,
  NotificationHandler,
  ProgressHandler,
  ListResult,
  SubscriptionHandle,
} from './client.js';
export type { SubscriptionFilter } from '../protocol/streaming.js';

// SH1 — typed result schemas surfaced by the C1 convenience methods (the return
// types of listTools/callTool/readResource/…); re-exported here for ergonomic naming.
export type { ListToolsResult } from '../protocol/tools.js';
export type { CallToolResult } from '../protocol/tools-call.js';
export type { ListResourcesResult, ListResourceTemplatesResult } from '../protocol/resources.js';
export type { ReadResourceResult } from '../protocol/resources-read.js';
export type { ListPromptsResult, GetPromptResult } from '../protocol/prompts.js';
export type { CompleteResult } from '../protocol/completion.js';

export { StreamableHTTPClientTransport } from './streamable-http.js';
export type {
  StreamableHTTPClientTransportOptions,
  AuthProvider,
} from './streamable-http.js';

// C3 — edge-friendly OAuth 2.1 client flow (§23) → AuthProvider.
export {
  createPkcePair,
  assertPkceSupported,
  discoverOAuthMetadata,
  registerClient,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  createAuthProvider,
  verifyAuthorizationRedirect,
} from './oauth.js';
export type { PkcePair, DiscoveredOAuthMetadata, OAuthTokenResponse } from './oauth.js';

// C9 — opt-in reconnecting transport wrapper.
export { createRetryingTransport } from './retry.js';
export type { RetryOptions } from './retry.js';
