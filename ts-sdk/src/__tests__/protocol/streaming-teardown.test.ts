/**
 * S16-RQ-17 (R-10.7-b) — a server tearing down a subscription MUST signal it:
 * on stdio via `notifications/cancelled` referencing the `subscriptions/listen`
 * request id; on Streamable HTTP by closing the SSE response. (TV-16.14)
 */
import { describe, it, expect } from 'vitest';
import { Subscription } from '../../protocol/streaming.js';

describe('Subscription.teardownNotification (R-10.7-b, TV-16.14)', () => {
  it('builds notifications/cancelled referencing the listen id (numeric)', () => {
    const sub = new Subscription(1, {});
    sub.acknowledge();
    sub.close('server-teardown');

    const signal = sub.teardownNotification();
    expect(signal.method).toBe('notifications/cancelled');
    expect(signal.params.requestId).toBe(1);
    expect(typeof signal.params.reason).toBe('string');
  });

  it('preserves a string listen id verbatim and a custom reason', () => {
    const sub = new Subscription('listen-42', {});
    const signal = sub.teardownNotification('server shutting down');
    expect(signal.params.requestId).toBe('listen-42');
    expect(signal.params.reason).toBe('server shutting down');
  });
});
