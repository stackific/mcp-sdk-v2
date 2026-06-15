/**
 * Tests for per-request capability negotiation — S01 §2.2.2.
 *
 * AC-01.12 (R-1.5-e, R-2.2.2-b) — both parties respect declared capabilities.
 * AC-01.13 (R-1.5-f)             — a party MUST NOT exercise an undeclared feature.
 * AC-01.14 (R-2.2.2-a)           — server determines capability from the current
 *                                   request only (never from prior state).
 * AC-01.15 (R-2.2.2-c)           — server rejects with missing-capability error.
 */

import { describe, it, expect } from 'vitest';
import {
  MissingCapabilityError,
  assertCapability,
  hasCapability,
} from '../../protocol/capabilities.js';

describe('MissingCapabilityError (AC-01.15)', () => {
  it('is an instance of Error', () => {
    expect(new MissingCapabilityError('tools')).toBeInstanceOf(Error);
  });

  it('is an instance of MissingCapabilityError', () => {
    expect(new MissingCapabilityError('tools')).toBeInstanceOf(MissingCapabilityError);
  });

  it('carries the name of the missing capability', () => {
    expect(new MissingCapabilityError('resources').capability).toBe('resources');
  });

  it('includes the capability name in the message', () => {
    expect(new MissingCapabilityError('prompts').message).toContain('prompts');
  });

  it('has name "MissingCapabilityError"', () => {
    expect(new MissingCapabilityError('tools').name).toBe('MissingCapabilityError');
  });

  it('carries the symbolic code MISSING_CAPABILITY (numeric code assigned in S09)', () => {
    expect(new MissingCapabilityError('tools').code).toBe('MISSING_CAPABILITY');
  });
});

describe('assertCapability (AC-01.12–AC-01.15)', () => {
  /**
   * AC-01.12: Both parties respect declared capabilities — assertCapability
   * passes without throwing when the capability has been declared.
   */
  it('does not throw when the required capability is declared', () => {
    expect(() => assertCapability(new Set(['tools', 'resources']), 'tools')).not.toThrow();
  });

  it('passes for each capability that is individually declared', () => {
    const declared = new Set(['tools', 'resources', 'prompts']);
    expect(() => assertCapability(declared, 'resources')).not.toThrow();
    expect(() => assertCapability(declared, 'prompts')).not.toThrow();
  });

  /**
   * AC-01.13: A party MUST NOT exercise an undeclared feature. assertCapability
   * enforces this by throwing whenever the feature is absent from the declared set.
   */
  it('throws MissingCapabilityError when the capability is not declared', () => {
    expect(() => assertCapability(new Set(['tools']), 'resources')).toThrow(
      MissingCapabilityError,
    );
  });

  it('throws for any capability absent from the declared set', () => {
    const empty = new Set<string>();
    expect(() => assertCapability(empty, 'tools')).toThrow(MissingCapabilityError);
    expect(() => assertCapability(empty, 'resources')).toThrow(MissingCapabilityError);
  });

  it('thrown error names the undeclared capability', () => {
    try {
      assertCapability(new Set(['tools']), 'resources');
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingCapabilityError);
      expect((e as MissingCapabilityError).capability).toBe('resources');
    }
  });

  /**
   * AC-01.14: A server MUST derive capability solely from the current request,
   * never from any prior request, connection, or stream.
   *
   * assertCapability enforces this by design — it is a pure function with no
   * internal state. Callers must supply the declared capabilities freshly for
   * every request. Two successive calls with different sets produce independent
   * results, proving no state leaks between invocations.
   */
  it('is stateless — declared capabilities from one call do not affect the next (AC-01.14)', () => {
    // First call: capability is declared → no throw
    assertCapability(new Set(['tools']), 'tools');

    // Second call: same capability NOT declared → must still throw
    expect(() => assertCapability(new Set(), 'tools')).toThrow(MissingCapabilityError);
  });

  it('capability declared in one call does not bleed into the next', () => {
    assertCapability(new Set(['resources']), 'resources');
    expect(() => assertCapability(new Set(['tools']), 'resources')).toThrow(
      MissingCapabilityError,
    );
  });
});

describe('hasCapability (AC-01.12, AC-01.13)', () => {
  it('returns true when the capability is declared', () => {
    expect(hasCapability(new Set(['tools']), 'tools')).toBe(true);
  });

  it('returns false when the capability is not declared', () => {
    expect(hasCapability(new Set(['tools']), 'resources')).toBe(false);
  });

  it('returns false for an empty declared set', () => {
    expect(hasCapability(new Set(), 'tools')).toBe(false);
  });

  it('is stateless — result depends only on arguments', () => {
    expect(hasCapability(new Set(['a']), 'a')).toBe(true);
    expect(hasCapability(new Set(['b']), 'a')).toBe(false);
  });
});
