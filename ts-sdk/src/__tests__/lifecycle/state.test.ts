/**
 * Tests for lifecycle state enumeration — S43.
 *
 * AC coverage:
 *  AC-43.1 (R-43.1-a)    — three states: Active, Deprecated, Removed
 *  AC-43.2 (R-43.1-b)    — transitions: Active→Deprecated, Deprecated→Removed
 *  AC-43.3 (R-43.1-c)    — Active→Removed is forbidden
 *  AC-43.4 (R-43.1-d)    — Removed is terminal; no outgoing transitions
 *  AC-43.5 (R-43.1-e)    — same-state transition is not a valid transition
 *  AC-43.6 (R-43.1-f)    — LifecycleRecord captures metadata
 */

import { describe, it, expect } from 'vitest';
import { LifecycleState } from '../../lifecycle/state.js';
import { canTransition, assertValidTransition } from '../../lifecycle/policy.js';

describe('LifecycleState values (AC-43.1 — R-43.1-a)', () => {
  it('has an Active state', () => {
    expect(LifecycleState.Active).toBe('active');
  });

  it('has a Deprecated state', () => {
    expect(LifecycleState.Deprecated).toBe('deprecated');
  });

  it('has a Removed state', () => {
    expect(LifecycleState.Removed).toBe('removed');
  });

  it('has exactly three states', () => {
    const values = Object.values(LifecycleState);
    expect(values).toHaveLength(3);
  });
});

describe('Valid transitions (AC-43.2 — R-43.1-b)', () => {
  it('Active → Deprecated is valid', () => {
    expect(canTransition(LifecycleState.Active, LifecycleState.Deprecated)).toBe(true);
  });

  it('Deprecated → Removed is valid', () => {
    expect(canTransition(LifecycleState.Deprecated, LifecycleState.Removed)).toBe(true);
  });
});

describe('Forbidden transition: Active → Removed (AC-43.3 — R-43.1-c)', () => {
  it('canTransition returns false for Active → Removed', () => {
    expect(canTransition(LifecycleState.Active, LifecycleState.Removed)).toBe(false);
  });

  it('assertValidTransition throws for Active → Removed', () => {
    expect(() =>
      assertValidTransition(LifecycleState.Active, LifecycleState.Removed),
    ).toThrow();
  });
});

describe('Removed is terminal (AC-43.4 — R-43.1-d)', () => {
  it('Removed → Active is forbidden', () => {
    expect(canTransition(LifecycleState.Removed, LifecycleState.Active)).toBe(false);
  });

  it('Removed → Deprecated is forbidden', () => {
    expect(canTransition(LifecycleState.Removed, LifecycleState.Deprecated)).toBe(false);
  });

  it('Removed → Removed is forbidden', () => {
    expect(canTransition(LifecycleState.Removed, LifecycleState.Removed)).toBe(false);
  });
});

describe('Same-state transition is invalid (AC-43.5 — R-43.1-e)', () => {
  it('Active → Active is not a valid transition', () => {
    expect(canTransition(LifecycleState.Active, LifecycleState.Active)).toBe(false);
  });

  it('Deprecated → Deprecated is not a valid transition', () => {
    expect(canTransition(LifecycleState.Deprecated, LifecycleState.Deprecated)).toBe(false);
  });
});
