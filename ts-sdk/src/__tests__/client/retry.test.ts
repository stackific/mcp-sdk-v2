/**
 * C9 — reconnecting transport wrapper: reconnects after an unclean drop, routes
 * future sends to the new inner, surfaces drops via onError, and fires onClose
 * (clean) only on explicit close.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRetryingTransport } from '../../client/retry.js';
import type { JSONRPCMessage } from '../../jsonrpc/framing.js';
import type { Transport, TransportCloseInfo, TransportError, Unsubscribe } from '../../transport/contract.js';

class FakeInner implements Transport {
  closed = false;
  readonly sent: JSONRPCMessage[] = [];
  readonly msg = new Set<(m: JSONRPCMessage) => void>();
  readonly cl = new Set<(i: TransportCloseInfo) => void>();
  send(m: JSONRPCMessage): void {
    this.sent.push(m);
  }
  onMessage(h: (m: JSONRPCMessage) => void): Unsubscribe {
    this.msg.add(h);
    return () => this.msg.delete(h);
  }
  onError(): Unsubscribe {
    return () => {};
  }
  onClose(h: (i: TransportCloseInfo) => void): Unsubscribe {
    this.cl.add(h);
    return () => this.cl.delete(h);
  }
  close(): void {
    this.closed = true;
    for (const h of [...this.cl]) h({ clean: true });
  }
  drop(): void {
    this.closed = true;
    for (const h of [...this.cl]) h({ clean: false, reason: 'dropped' });
  }
}

const frame = { jsonrpc: '2.0', method: 'notifications/x' } as unknown as JSONRPCMessage;

describe('C9 — createRetryingTransport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reconnects after an unclean drop and routes future sends to the new inner', async () => {
    const inners: FakeInner[] = [];
    const t = createRetryingTransport(() => {
      const i = new FakeInner();
      inners.push(i);
      return i;
    }, { baseDelayMs: 100 });

    const errors: TransportError[] = [];
    t.onError((e) => errors.push(e));
    expect(inners).toHaveLength(1);

    inners[0]!.drop();
    expect(errors).toHaveLength(1); // surfaced "reconnecting"
    await vi.advanceTimersByTimeAsync(100);
    expect(inners).toHaveLength(2); // reconnected

    await t.send(frame);
    expect(inners[1]!.sent).toHaveLength(1); // routed to the new inner
  });

  it('fires onClose(clean) once on explicit close and then refuses sends', async () => {
    const t = createRetryingTransport(() => new FakeInner());
    const closes: TransportCloseInfo[] = [];
    t.onClose((i) => closes.push(i));
    await t.close('done');
    expect(closes).toEqual([{ clean: true, reason: 'done' }]);
    await expect(t.send(frame)).rejects.toBeTruthy();
  });

  it('delivers inbound messages from the current inner to onMessage', () => {
    const inners: FakeInner[] = [];
    const t = createRetryingTransport(() => {
      const i = new FakeInner();
      inners.push(i);
      return i;
    });
    const got: JSONRPCMessage[] = [];
    t.onMessage((m) => got.push(m));
    for (const h of inners[0]!.msg) h({ jsonrpc: '2.0', id: 1, result: {} } as JSONRPCMessage);
    expect(got).toHaveLength(1);
  });
});
