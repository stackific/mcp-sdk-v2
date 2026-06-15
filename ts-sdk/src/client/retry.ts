/**
 * C9 — an opt-in reconnecting {@link Transport} wrapper. It builds an inner
 * transport from a factory and, when that inner transport drops uncleanly,
 * recreates it with exponential backoff so future sends keep flowing. Transient
 * drops surface via `onError`; the wrapper's own `onClose` fires only on an
 * explicit {@link Transport.close} or after `maxRetries` is exhausted.
 *
 * Note: in-flight requests outstanding at the moment of a drop are NOT replayed
 * (that needs request-level idempotency); pair this with per-request `timeoutMs`
 * so a caller never waits forever across a reconnect. Edge-safe (Web `setTimeout`).
 */
import type { JSONRPCMessage } from '../jsonrpc/framing.js';
import {
  TransportError,
  type Transport,
  type TransportCloseInfo,
  type Unsubscribe,
} from '../transport/contract.js';

/** Options for {@link createRetryingTransport}. */
export interface RetryOptions {
  /** Max consecutive reconnect attempts before giving up (default `Infinity`). */
  maxRetries?: number;
  /** Base backoff delay in ms (default 250). */
  baseDelayMs?: number;
  /** Max backoff delay in ms (default 10000). */
  maxDelayMs?: number;
}

/**
 * Wraps `factory` (which builds a fresh inner transport) in a reconnecting
 * transport. The returned transport presents stable handler registration to a
 * {@link Client} across inner reconnects.
 */
export function createRetryingTransport(factory: () => Transport, options: RetryOptions = {}): Transport {
  const maxRetries = options.maxRetries ?? Infinity;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 10_000;

  const messageHandlers = new Set<(m: JSONRPCMessage) => void>();
  const errorHandlers = new Set<(e: TransportError) => void>();
  const closeHandlers = new Set<(i: TransportCloseInfo) => void>();

  let inner: Transport | null = null;
  let innerSubs: Unsubscribe[] = [];
  let closed = false;
  let attempts = 0;

  const fanMessage = (m: JSONRPCMessage): void => {
    for (const h of [...messageHandlers]) {
      try {
        h(m);
      } catch {
        /* observer must not break fan-out */
      }
    }
  };
  const fanError = (e: TransportError): void => {
    for (const h of [...errorHandlers]) {
      try {
        h(e);
      } catch {
        /* ignore */
      }
    }
  };
  const fanClose = (i: TransportCloseInfo): void => {
    for (const h of [...closeHandlers]) {
      try {
        h(i);
      } catch {
        /* ignore */
      }
    }
  };

  const detach = (): void => {
    for (const u of innerSubs) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
    innerSubs = [];
  };

  function connectInner(): void {
    const t = factory();
    innerSubs = [
      t.onMessage(fanMessage),
      t.onError(fanError),
      t.onClose((info) => {
        detach();
        inner = null;
        if (closed) return;
        fanError(new TransportError(`transport disconnected${info.reason ? `: ${info.reason}` : ''}; reconnecting`));
        scheduleReconnect();
      }),
    ];
    inner = t;
    attempts = 0; // a successful (re)connect resets the backoff
  }

  function scheduleReconnect(): void {
    if (closed || inner) return;
    if (attempts >= maxRetries) {
      closed = true;
      fanClose({ clean: false, reason: 'max reconnect attempts exceeded' });
      return;
    }
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempts);
    attempts += 1;
    setTimeout(() => {
      if (closed || inner) return;
      try {
        connectInner();
      } catch {
        scheduleReconnect();
      }
    }, delay);
  }

  connectInner(); // initial connection

  return {
    get closed() {
      return closed;
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },
    onClose(handler) {
      closeHandlers.add(handler);
      return () => {
        closeHandlers.delete(handler);
      };
    },
    async send(message) {
      if (closed) throw new TransportError('transport is closed');
      if (!inner) throw new TransportError('transport is reconnecting; retry shortly');
      return inner.send(message);
    },
    async close(reason) {
      if (closed) return;
      closed = true;
      detach();
      const t = inner;
      inner = null;
      if (t) await t.close(reason);
      fanClose({ clean: true, ...(reason !== undefined ? { reason } : {}) });
    },
  };
}
