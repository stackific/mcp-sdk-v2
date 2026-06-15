/**
 * Hono adapter for the MCP server runtime. Hono routes already expose the raw Web
 * `Request` (`c.req.raw`) and accept a `Response`, so the adapter is a thin bridge
 * over {@link createMcpRequestHandler} — no `hono` dependency is needed (the
 * context is matched structurally), which keeps this edge-friendly.
 */
import { McpServer } from './server.js';
import { createMcpRequestHandler, type McpRequestHandlerOptions } from './streamable-http.js';

/** The minimal Hono context shape this adapter needs. */
export interface HonoLikeContext {
  req: { raw: Request };
}

/**
 * Builds a Hono route handler that serves `server` over Streamable HTTP.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * const app = new Hono();
 * app.all('/mcp', toHonoMcpHandler(server));
 * export default app; // Workers/Deno/Bun; or serve() it on Node
 * ```
 */
export function toHonoMcpHandler(
  server: McpServer,
  options: McpRequestHandlerOptions = {},
): (c: HonoLikeContext) => Promise<Response> {
  const handle = createMcpRequestHandler(server, options);
  return (c) => handle(c.req.raw);
}
