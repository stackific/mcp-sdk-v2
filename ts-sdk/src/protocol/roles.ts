/**
 * Wire-level protocol endpoint roles (§1.1, §2.2).
 *
 * The host creates and coordinates many clients; each client is bound
 * one-to-one to exactly one server; servers are isolated from one another.
 * The host is NOT a JSON-RPC role on the wire and does not appear here.
 */

/** The two JSON-RPC roles an endpoint may act in. */
export type McpRole = typeof McpRole[keyof typeof McpRole];
export const McpRole = {
  Client: 'client',
  Server: 'server',
} as const;
