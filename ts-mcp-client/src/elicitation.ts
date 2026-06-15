/**
 * Bridges a server-initiated elicitation (which the MCP client receives) to the user
 * sitting in the browser. The client's `elicitation/create` handler parks a promise
 * here; the frontend renders the form / opens the URL, then POSTs the user's answer to
 * /api/elicitation/:id/resolve, which fulfills the promise.
 */
export interface ElicitResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

interface Pending {
  resolve: (r: ElicitResult) => void;
  mode: string;
}

const pending = new Map<string, Pending>();

export function createPending(id: string, mode: string): Promise<ElicitResult> {
  return new Promise<ElicitResult>((resolve) => {
    pending.set(id, { resolve, mode });
  });
}

export function resolvePending(id: string, result: ElicitResult): boolean {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);
  p.resolve(result);
  return true;
}

export function listPending(): { id: string; mode: string }[] {
  return [...pending.entries()].map(([id, p]) => ({ id, mode: p.mode }));
}
