/**
 * Node.js (`node:http`) adapter for the MCP server runtime. Wraps the Web-standard
 * {@link createMcpRequestHandler} so an `McpServer` can be served by `http.createServer`.
 *
 * This file uses a TYPE-ONLY import of `node:http`, so the compiled `.js` contains
 * no `node:` import — but it is meant for Node (it relies on Node's `Buffer` global
 * and the `IncomingMessage`/`ServerResponse` shapes). Edge runtimes should use
 * {@link createMcpRequestHandler} (or the Hono adapter) directly.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from './server.js';
import { createMcpRequestHandler, type McpRequestHandlerOptions } from './streamable-http.js';

/**
 * Builds a `node:http` request listener that serves `server` over Streamable HTTP.
 *
 * @example
 * ```ts
 * import { createServer } from 'node:http';
 * createServer(createNodeHttpHandler(server)).listen(7001);
 * ```
 */
export function createNodeHttpHandler(
  server: McpServer,
  options: McpRequestHandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => void {
  const handle = createMcpRequestHandler(server, options);

  return (req, res) => {
    void run(req, res, handle).catch((err: unknown) => {
      try {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
            }),
          );
        } else {
          res.end();
        }
      } catch {
        // already closed
      }
    });
  };
}

async function run(
  req: IncomingMessage,
  res: ServerResponse,
  handle: (request: Request) => Promise<Response>,
): Promise<void> {
  const request = await toWebRequest(req);
  const response = await handle(request);

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  // If the client disconnects, stop reading so the stream's `cancel` aborts the handler.
  res.on('close', () => {
    void reader.cancel().catch(() => {});
  });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

/** Converts a `node:http` IncomingMessage into a Web `Request`. */
async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost';
  const url = `http://${host}${req.url ?? '/'}`;
  const method = req.method ?? 'GET';

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  let body: Uint8Array | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) chunks.push(chunk as Uint8Array);
    body = chunks.length > 0 ? concatBytes(chunks) : new Uint8Array(0);
  }

  return new Request(url, { method, headers, body });
}

/** Concatenates byte chunks without depending on `node:buffer`. */
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
