/**
 * Tests for deprecation window policy — S43.
 *
 * AC coverage:
 *  AC-43.7  (R-43.2-a)   — standard window is 12 calendar months
 *  AC-43.8  (R-43.2-b)   — expedited window minimum is 90 days
 *  AC-43.9  (R-43.2-c)   — not eligible for removal before window closes
 *  AC-43.10 (R-43.2-d)   — eligible on or after window closes
 *  AC-43.11 (R-43.2-e)   — standard: not yet eligible at 11 months
 *  AC-43.12 (R-43.2-f)   — standard: eligible at exactly 12 months
 *  AC-43.13 (R-43.2-g)   — expedited: not yet eligible at 89 days
 *  AC-43.14 (R-43.2-h)   — expedited: eligible at exactly 90 days
 *  AC-43.15 (R-43.2-i)   — addCalendarMonths: month arithmetic
 *  AC-43.16 (R-43.2-j)   — addCalendarMonths: end-of-month clamping
 *  AC-43.17 (R-43.3-a)   — assertValidTransition semantics
 *  AC-43.18 (R-43.3-b)   — allowed transitions pass without throwing
 *  AC-43.19 (R-43.3-c)   — forbidden transitions throw
 *  AC-43.20 (R-43.3-d)   — Removed→any transitions throw
 */

import { describe, it, expect } from 'vitest';
import {
  assertValidTransition,
  addCalendarMonths,
  isEligibleForRemoval,
  STANDARD_DEPRECATION_MONTHS,
  EXPEDITED_MINIMUM_DAYS,
} from '../../lifecycle/policy.js';
import { LifecycleState } from '../../lifecycle/state.js';

describe('Policy constants (AC-43.7, AC-43.8)', () => {
  it('STANDARD_DEPRECATION_MONTHS is 12 (AC-43.7 — R-43.2-a)', () => {
    expect(STANDARD_DEPRECATION_MONTHS).toBe(12);
  });

  it('EXPEDITED_MINIMUM_DAYS is 90 (AC-43.8 — R-43.2-b)', () => {
    expect(EXPEDITED_MINIMUM_DAYS).toBe(90);
  });
});

describe('addCalendarMonths (AC-43.15, AC-43.16)', () => {
  it('adds months correctly within the same year', () => {
    const base = new Date('2025-01-15T00:00:00.000Z');
    const result = addCalendarMonths(base, 3);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(3); // April = index 3
    expect(result.getUTCDate()).toBe(15);
  });

  it('crosses a year boundary', () => {
    const base = new Date('2025-11-10T00:00:00.000Z');
    const result = addCalendarMonths(base, 3);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(1); // February = index 1
  });

  it('adds 12 months (AC-43.15 — R-43.2-i)', () => {
    const base = new Date('2025-04-01T00:00:00.000Z');
    const result = addCalendarMonths(base, 12);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(3); // April
  });

  it('clamps to end of month when target month has fewer days (AC-43.16 — R-43.2-j)', () => {
    // January 31 + 1 month = Feb 28 (non-leap)
    const base = new Date('2025-01-31T00:00:00.000Z');
    const result = addCalendarMonths(base, 1);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(28);
  });
});

describe('isEligibleForRemoval — standard window (AC-43.9 to AC-43.12)', () => {
  const deprecated = new Date('2025-01-01T00:00:00.000Z');

  it('not eligible at 11 months (AC-43.11 — R-43.2-e)', () => {
    const elevenMonths = new Date('2025-12-01T00:00:00.000Z');
    expect(isEligibleForRemoval(deprecated, elevenMonths)).toBe(false);
  });

  it('eligible at exactly 12 months (AC-43.12 — R-43.2-f)', () => {
    const twelveMonths = new Date('2026-01-01T00:00:00.000Z');
    expect(isEligibleForRemoval(deprecated, twelveMonths)).toBe(true);
  });

  it('eligible after more than 12 months', () => {
    const thirteenMonths = new Date('2026-02-01T00:00:00.000Z');
    expect(isEligibleForRemoval(deprecated, thirteenMonths)).toBe(true);
  });
});

describe('isEligibleForRemoval — expedited window (AC-43.13, AC-43.14)', () => {
  const deprecated = new Date('2025-01-01T00:00:00.000Z');

  it('not eligible at 89 days expedited (AC-43.13 — R-43.2-g)', () => {
    const eightyNineDays = new Date(deprecated.getTime() + 89 * 24 * 60 * 60 * 1000);
    expect(isEligibleForRemoval(deprecated, eightyNineDays, true)).toBe(false);
  });

  it('eligible at exactly 90 days expedited (AC-43.14 — R-43.2-h)', () => {
    const ninetyDays = new Date(deprecated.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(isEligibleForRemoval(deprecated, ninetyDays, true)).toBe(true);
  });

  it('eligible after more than 90 days expedited', () => {
    const ninetyOneDays = new Date(deprecated.getTime() + 91 * 24 * 60 * 60 * 1000);
    expect(isEligibleForRemoval(deprecated, ninetyOneDays, true)).toBe(true);
  });
});

describe('assertValidTransition (AC-43.17 to AC-43.20)', () => {
  it('does not throw for Active → Deprecated (AC-43.18 — R-43.3-b)', () => {
    expect(() =>
      assertValidTransition(LifecycleState.Active, LifecycleState.Deprecated),
    ).not.toThrow();
  });

  it('does not throw for Deprecated → Removed (AC-43.18)', () => {
    expect(() =>
      assertValidTransition(LifecycleState.Deprecated, LifecycleState.Removed),
    ).not.toThrow();
  });

  it('throws for Active → Removed (AC-43.19 — R-43.3-c)', () => {
    expect(() =>
      assertValidTransition(LifecycleState.Active, LifecycleState.Removed),
    ).toThrow();
  });

  it('throws for Removed → Active (AC-43.20 — R-43.3-d)', () => {
    expect(() =>
      assertValidTransition(LifecycleState.Removed, LifecycleState.Active),
    ).toThrow();
  });

  it('throws for Removed → Deprecated (AC-43.20)', () => {
    expect(() =>
      assertValidTransition(LifecycleState.Removed, LifecycleState.Deprecated),
    ).toThrow();
  });
});
