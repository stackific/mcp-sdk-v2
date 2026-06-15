/**
 * Testing utilities — an edge-safe, in-memory Client↔McpServer harness for
 * conformance and integration tests. Import via the package's `./testing` subpath.
 */
export { connectInMemory } from './in-memory.js';
export type { InMemoryHarness } from './in-memory.js';
