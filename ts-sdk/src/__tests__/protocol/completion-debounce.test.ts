/**
 * S29-RC-12 (§19.5, R-19.5-n) — a client SHOULD debounce rapid successive
 * completion requests rather than sending one per keystroke. (TV-29.22)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCompletionDebouncer } from '../../protocol/completion.js';

describe('createCompletionDebouncer (R-19.5-n)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of keystrokes into a single request with the final value', async () => {
    const run = vi.fn(async (value: string) => `results:${value}`);
    const complete = createCompletionDebouncer(run, 100);

    // Three rapid keystrokes within the quiet window.
    const p1 = complete('a');
    const p2 = complete('ab');
    const p3 = complete('abc');

    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('abc');
    // All awaiting callers resolve with the single coalesced result.
    await expect(p1).resolves.toBe('results:abc');
    await expect(p2).resolves.toBe('results:abc');
    await expect(p3).resolves.toBe('results:abc');
  });

  it('issues separate requests when calls are spaced beyond the window', async () => {
    const run = vi.fn(async (value: string) => value);
    const complete = createCompletionDebouncer(run, 50);

    const first = complete('x');
    await vi.advanceTimersByTimeAsync(50);
    await first;

    const second = complete('y');
    await vi.advanceTimersByTimeAsync(50);
    await second;

    expect(run).toHaveBeenCalledTimes(2);
  });
});
