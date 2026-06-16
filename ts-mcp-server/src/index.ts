/**
 * Reference companion MCP server, served with Hono via the SDK's Hono adapter.
 *
 * A thin entry point: it owns NO protocol abstractions — the `McpServer`
 * dispatcher, request context, tool/result types, task store, and the Streamable
 * HTTP handler all live in `@stackific/mcp-sdk-ts`. This package only registers
 * features (`./features.ts`) and binds the SDK's `toHonoMcpHandler` into a Hono
 * app, run on Node via `@hono/node-server`. (On Workers/Deno/Bun the same Hono
 * app — or `createMcpRequestHandler` directly — runs unchanged; the SDK server
 * core is edge-safe.)
 *
 * Stateless Streamable HTTP, protocol 2026-07-28. Optional & deletable — the
 * companion is server-agnostic (see MCP_SERVER_REQUIREMENTS.md).
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { toHonoMcpHandler } from '@stackific/mcp-sdk-ts/server';

import { buildCompanionServer } from './features.js';
import { createAuthApp } from './auth.js';

const MCP_PORT = Number(process.env.MCP_PORT ?? 8001);
const AUTH_PORT = Number(process.env.AUTH_PORT ?? 8003);

// ── Main companion MCP server (Hono) ──
const app = new Hono();
app.get('/health', (c) => c.json({ status: 'ok', name: 'companion-mcp-server' }));
app.all('/mcp', toHonoMcpHandler(buildCompanionServer(), { path: '/mcp' }));

serve({ fetch: app.fetch, port: MCP_PORT }, () => {
  console.log(
    `Companion MCP server (Hono + @stackific/mcp-sdk-ts, stateless Streamable HTTP 2026-07-28) on http://localhost:${MCP_PORT}/mcp`,
  );
});

// ── OAuth 2.1 Authorization Server + protected MCP resource (Hono) ──
const authIssuer = process.env.AUTH_ISSUER ?? `http://localhost:${AUTH_PORT}`;
serve(
  {
    fetch: createAuthApp({ issuer: authIssuer, resource: `${authIssuer}/mcp` }).fetch,
    port: AUTH_PORT,
  },
  () => {
    console.log(
      `OAuth AS + protected MCP resource (Hono) on http://localhost:${AUTH_PORT}  (issuer ${authIssuer})`,
    );
  },
);
