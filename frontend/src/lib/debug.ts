/**
 * Subscribes once to the backend's /debug/stream SSE endpoint and exposes the live
 * wire frames, connection status, and any pending elicitations to React via
 * useSyncExternalStore. This is what every page renders to show "what is happening
 * on the wire".
 */
import { useSyncExternalStore } from 'react';

import { backend, type BackendStatus } from './api';

export interface Frame {
  seq: number;
  ts: number;
  dir: 'send' | 'recv' | 'local';
  kind: 'request' | 'response' | 'error' | 'notification' | 'lifecycle' | 'elicitation' | 'note';
  method?: string;
  id?: string | number | null;
  summary?: string;
  payload?: unknown;
  trace?: string;
}

export interface PendingElicitation {
  pendingId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any;
}

let frames: Frame[] = [];
let status: BackendStatus = { connected: false };
let pending: PendingElicitation[] = [];
const listeners = new Set<() => void>();
let source: EventSource | null = null;

function emit() {
  for (const l of listeners) l();
}

async function refreshStatus() {
  try {
    const next = await backend.status();
    status = next;
    emit();
  } catch {
    // ignore
  }
}

export function startDebugStream() {
  if (source) return;
  source = new EventSource(backend.base + '/debug/stream');

  source.addEventListener('frame', (e) => {
    const f = JSON.parse((e as MessageEvent).data) as Frame;
    frames = [...frames.slice(-799), f];
    if (f.kind === 'elicitation' && f.method === 'elicitation/create') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = f.payload as any;
      if (p?.pendingId) pending = [...pending, { pendingId: p.pendingId, params: p.params }];
    }
    if (f.method === 'initialize' || (f.kind === 'lifecycle' && f.summary?.includes('connected'))) {
      void refreshStatus();
    }
    emit();
  });

  source.addEventListener('status', (e) => {
    status = JSON.parse((e as MessageEvent).data) as BackendStatus;
    emit();
  });

  source.onerror = () => {
    // EventSource auto-reconnects.
  };
}

export function clearFrames() {
  frames = [];
  emit();
}

export function removePending(id: string) {
  pending = pending.filter((p) => p.pendingId !== id);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const useFrames = () => useSyncExternalStore(subscribe, () => frames);
export const useStatus = () => useSyncExternalStore(subscribe, () => status);
export const usePending = () => useSyncExternalStore(subscribe, () => pending);
export { refreshStatus };
