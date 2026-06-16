/**
 * S12 — In-memory reference transport (§7.1–§7.6).
 *
 * A minimal, fully in-process `Transport` used to demonstrate and test that the
 * §7.2 guarantees can be met by a conforming transport. It is itself a *custom*
 * transport in the §7.3 sense: it preserves the JSON-RPC message format, the
 * exchange patterns, and the per-request metadata model, and upholds every §7.2
 * guarantee — but it is NOT one of the two transports the specification defines
 * (stdio is S13; Streamable HTTP is S14/S15).
 *
 * To make the framing, UTF-8, and integrity guarantees real rather than assumed,
 * the pair carries **bytes**: each `send` frames the message with `NewlineFramer`
 * and the peer recovers it with the same framing plus `decodeMessageUnit`
 * (UTF-8 + single-JSON-value validation). Delivery is synchronous for test
 * determinism; correlation/ordering across concurrent requests is exercised via
 * `RequestCorrelator`, which is order-independent by construction.
 */

import type { JSONRPCMessage } from '../jsonrpc/framing.js';
import {
  TransportError,
  type Transport,
  type TransportCloseInfo,
  type Unsubscribe,
} from './contract.js';
import { NewlineFramer, tryDecodeMessageUnit, type FrameDecoder } from './framing.js';

/**
 * One endpoint of an in-memory transport pair. Construct pairs via
 * {@link createInMemoryTransportPair} rather than directly.
 */
export class InMemoryTransport implements Transport {
  private peer?: InMemoryTransport;
  private readonly framer = new NewlineFramer();
  private readonly decoder: FrameDecoder = this.framer.createDecoder();
  private readonly messageHandlers = new Set<(message: JSONRPCMessage) => void>();
  private readonly errorHandlers = new Set<(error: TransportError) => void>();
  private readonly closeHandlers = new Set<(info: TransportCloseInfo) => void>();
  /** Messages received before any handler was attached — buffered, never dropped. */
  private inbox: JSONRPCMessage[] = [];
  /** Receiver-side decode errors received before any handler — buffered, never dropped. */
  private errorInbox: TransportError[] = [];
  private _closed = false;
  private closeInfo?: TransportCloseInfo;

  /** Links this endpoint to its peer. Internal — used by the factory. */
  link(peer: InMemoryTransport): void {
    this.peer = peer;
  }

  send(message: JSONRPCMessage): void {
    if (this._closed) {
      // Never silently drop: a send on a closed channel is an observable failure.
      // (R-7.2-q, R-7.2-s, R-7.5-i, R-7.5-j)
      throw new TransportError('cannot send on a closed transport');
    }
    if (this.peer === undefined) {
      throw new TransportError('transport endpoint is not linked to a peer');
    }
    // Frame + UTF-8 encode, then hand the raw bytes to the peer. The peer finds
    // message boundaries from framing alone and re-parses each as one JSON value
    // (R-7.1-b, R-7.1-c, R-7.2-b – R-7.2-d, R-7.6-a, R-7.6-b).
    const bytes = this.framer.encode(message);
    this.peer.acceptBytes(bytes);
  }

  /** Receives raw bytes from the peer's `send`. */
  private acceptBytes(bytes: Uint8Array): void {
    if (this._closed) {
      // The receiver is closed; surface the failure to the sending peer rather
      // than discarding the bytes. (R-7.2-r, R-7.5-j)
      throw new TransportError('peer transport is closed; message not delivered');
    }
    for (const unit of this.decoder.push(bytes)) {
      // A malformed inbound unit is the *receiver's* error: route it to this
      // endpoint's error channel as an observable failure (R-7.6-b, R-7.6-c),
      // never back into the unrelated sender's `send` and never silently
      // dropped. A well-formed unit is dispatched as a message.
      const decoded = tryDecodeMessageUnit(unit);
      if (decoded.ok) {
        this.dispatch(decoded.message);
      } else {
        this.dispatchError(decoded.error);
      }
    }
  }

  /**
   * Feeds arbitrary raw bytes into this endpoint's receive path, as if they had
   * arrived on the wire. Used to exercise receiver-side decode-error handling
   * (e.g. a corrupt or non-UTF-8 unit). Not part of the `Transport` contract —
   * a test/simulation affordance.
   */
  injectRawBytes(bytes: Uint8Array): void {
    this.acceptBytes(bytes);
  }

  private dispatch(message: JSONRPCMessage): void {
    if (this.messageHandlers.size === 0) {
      this.inbox.push(message);
      return;
    }
    for (const handler of [...this.messageHandlers]) {
      handler(message);
    }
  }

  private dispatchError(error: TransportError): void {
    if (this.errorHandlers.size === 0) {
      this.errorInbox.push(error); // buffered until a handler attaches — never dropped
      return;
    }
    for (const handler of [...this.errorHandlers]) {
      handler(error);
    }
  }

  onMessage(handler: (message: JSONRPCMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    // Flush anything that arrived before a handler existed — no silent loss.
    if (this.inbox.length > 0) {
      const buffered = this.inbox;
      this.inbox = [];
      for (const message of buffered) {
        handler(message);
      }
    }
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onError(handler: (error: TransportError) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    // Flush any decode errors that arrived before a handler existed — no loss.
    if (this.errorInbox.length > 0) {
      const buffered = this.errorInbox;
      this.errorInbox = [];
      for (const error of buffered) {
        handler(error);
      }
    }
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  onClose(handler: (info: TransportCloseInfo) => void): Unsubscribe {
    // A late subscriber to an already-closed channel still observes the close.
    if (this._closed && this.closeInfo !== undefined) {
      handler(this.closeInfo);
    } else {
      this.closeHandlers.add(handler);
    }
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  /** Initiates an orderly close observable by both endpoints. (R-7.2-t) */
  close(reason?: string): void {
    this.shutdown(true, reason);
  }

  /**
   * Simulates an abrupt disconnection (channel dropped without an orderly
   * close). Both endpoints observe it via `onClose` with `clean: false`, so
   * neither side blocks as though the channel were still live. (R-7.5-a, R-7.5-b)
   *
   * Not part of the `Transport` contract — a test/simulation affordance.
   */
  disconnect(reason?: string): void {
    this.shutdown(false, reason);
  }

  get closed(): boolean {
    return this._closed;
  }

  private shutdown(clean: boolean, reason?: string): void {
    const info: TransportCloseInfo = reason === undefined ? { clean } : { clean, reason };
    // Close both ends so each side can observe the channel is unusable.
    this.markClosed(info);
    this.peer?.markClosed(info);
  }

  private markClosed(info: TransportCloseInfo): void {
    if (this._closed) return;
    this._closed = true;
    this.closeInfo = info;
    for (const handler of [...this.closeHandlers]) {
      handler(info);
    }
    this.closeHandlers.clear();
  }
}

/**
 * Creates a linked pair of in-memory transports. Anything one endpoint sends is
 * delivered to the other; closing or disconnecting either endpoint makes both
 * observe the close. (§7.1, §7.4, §7.2 clean close, §7.5)
 */
export function createInMemoryTransportPair(): [InMemoryTransport, InMemoryTransport] {
  const a = new InMemoryTransport();
  const b = new InMemoryTransport();
  a.link(b);
  b.link(a);
  return [a, b];
}
