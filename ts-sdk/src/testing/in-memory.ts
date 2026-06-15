/**
 * SH2 — an in-memory conformance test-kit. Connects a {@link Client} to an
 * {@link McpServer} over a linked {@link createInMemoryTransportPair} (no network,
 * no process), driving the full request/response + server→client path in one
 * isolate. Ideal for exercising any Client↔server pair against spec test vectors.
 *
 * Edge-safe: composes the edge-safe client + server runtimes + the in-memory
 * transport.
 */
import { Client, type ClientOptions } from '../client/client.js';
import { McpServer } from '../server/server.js';
import { serveStdio } from '../server/stdio.js';
import { createInMemoryTransportPair } from '../transport/in-memory.js';
import type { Implementation } from '../types/implementation.js';

/** A connected in-memory Client + a teardown. */
export interface InMemoryHarness {
  /** A {@link Client} already connected to the server over the in-memory pair. */
  client: Client;
  /** Stops the server loop and closes the client. */
  close(): Promise<void>;
}

/**
 * Builds a {@link Client} connected to `server` over an in-memory transport pair.
 * The server is served with {@link serveStdio} on its side of the pair, so the
 * full stateless 2026-07-28 exchange (discover, calls, server→client requests)
 * runs end-to-end in memory.
 */
export function connectInMemory(
  server: McpServer,
  clientInfo: Implementation,
  options?: ClientOptions,
): InMemoryHarness {
  const [clientSide, serverSide] = createInMemoryTransportPair();
  const stop = serveStdio(server, serverSide);
  const client = new Client(clientInfo, options);
  client.connect(clientSide);
  return {
    client,
    async close() {
      stop();
      await client.close();
    },
  };
}
