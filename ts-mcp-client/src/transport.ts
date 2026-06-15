/**
 * A raw Streamable HTTP `initialize` probe used by the Transport & HTTP page to show the
 * actual HTTP request/response headers and status mapping (S12, S14, S15). Kept out of
 * index.ts so it uses Node's global fetch/Response types (importing @hono/node-server there
 * augments the global Response with a narrower shape).
 */
import { MCP_SERVER_URL } from './config.js';
import { httpFetch } from './http.js';

export async function transportProbe() {
  const requestHeaders: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
  };
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2026-07-28',
      capabilities: {},
      clientInfo: { name: 'transport-probe', version: '0' },
    },
  };
  const res = await httpFetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });
  // Drain the body so the socket frees; we only need headers/status here.
  await res.text().catch(() => '');
  return {
    url: MCP_SERVER_URL,
    method: 'POST',
    requestHeaders,
    status: res.status,
    statusText: res.statusText,
    contentType: res.headers.get('content-type'),
    sessionId: res.headers.get('mcp-session-id'),
    negotiatedVersion: res.headers.get('mcp-protocol-version'),
    responseHeaders,
  };
}
