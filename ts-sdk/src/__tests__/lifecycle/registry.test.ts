/**
 * Tests for the deprecated-feature registry and warning emission — S43.
 *
 * AC coverage:
 *  AC-43.21 (R-43.4-a,b) — registry contains all known deprecated features
 *  AC-43.22 (R-43.4-c)   — each entry has feature, definedIn, migrationNote, earliestRemoval
 *  AC-43.23 (R-43.4-d)   — each earliestRemoval is an ISO 8601 date string
 *  AC-43.24 (R-43.4-e)   — Roots capability is in the registry
 *  AC-43.25 (R-43.4-f)   — Sampling capability is in the registry
 *  AC-43.26 (R-43.4-g)   — includeContext values are in the registry
 *  AC-43.27 (R-43.4-h)   — Logging capability is in the registry
 *  AC-43.28 (R-43.4-i)   — io.modelcontextprotocol/logLevel is in the registry
 *  AC-43.29 (R-43.4-j)   — Dynamic Client Registration is in the registry
 *  AC-43.30 (R-43.5-a)   — emitDeprecationWarning writes to stderr/console
 *  AC-43.31 (R-43.5-b)   — message includes feature name
 *  AC-43.32 (R-43.5-c)   — message includes migration note
 *  AC-43.33 (R-43.5-d)   — emitDeprecationWarning returns void
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEPRECATED_REGISTRY,
  emitDeprecationWarning,
  findDeprecatedEntry,
} from '../../lifecycle/registry.js';
import { isEligibleForRemoval } from '../../lifecycle/policy.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe('DEPRECATED_REGISTRY structure (AC-43.21, AC-43.22, AC-43.23)', () => {
  it('is a non-empty array (AC-43.21)', () => {
    expect(Array.isArray(DEPRECATED_REGISTRY)).toBe(true);
    expect(DEPRECATED_REGISTRY.length).toBeGreaterThan(0);
  });

  it('every entry has required fields (AC-43.22)', () => {
    for (const entry of DEPRECATED_REGISTRY) {
      expect(typeof entry.feature).toBe('string');
      expect(entry.feature.length).toBeGreaterThan(0);
      expect(typeof entry.definedIn).toBe('string');
      expect(typeof entry.migrationNote).toBe('string');
      expect(typeof entry.earliestRemoval).toBe('string');
    }
  });

  it('every earliestRemoval is an ISO 8601 date (YYYY-MM-DD) (AC-43.23)', () => {
    for (const entry of DEPRECATED_REGISTRY) {
      expect(entry.earliestRemoval).toMatch(ISO_DATE_RE);
    }
  });

  it('every entry carries a deprecatedSince and a §27.2-valid removal window', () => {
    for (const entry of DEPRECATED_REGISTRY) {
      expect(entry.deprecatedSince).toMatch(ISO_DATE_RE);
      // §27.2: earliestRemoval MUST be ≥ deprecatedSince + 12 months — so the window
      // rule is evaluable against the row. A date exactly 12 months out is eligible;
      // the day before is not.
      const since = new Date(`${entry.deprecatedSince}T00:00:00Z`);
      const removal = new Date(`${entry.earliestRemoval}T00:00:00Z`);
      expect(isEligibleForRemoval(since, removal)).toBe(true);
      const dayBefore = new Date(removal.getTime() - 24 * 60 * 60 * 1000);
      expect(isEligibleForRemoval(since, dayBefore)).toBe(false);
    }
  });
});

describe('Known deprecated features (AC-43.24 to AC-43.29)', () => {
  it('contains the Roots capability (AC-43.24)', () => {
    const entry = findDeprecatedEntry('Roots capability');
    expect(entry).toBeDefined();
  });

  it('contains the Sampling capability (AC-43.25)', () => {
    const entry = findDeprecatedEntry('Sampling capability');
    expect(entry).toBeDefined();
  });

  it('contains includeContext values (AC-43.26)', () => {
    const entry = DEPRECATED_REGISTRY.find((e) =>
      e.feature.toLowerCase().includes('includecontext'),
    );
    expect(entry).toBeDefined();
  });

  it('contains the Logging capability (AC-43.27)', () => {
    const entry = DEPRECATED_REGISTRY.find((e) =>
      e.feature.toLowerCase().includes('logging capability'),
    );
    expect(entry).toBeDefined();
  });

  it('contains the io.modelcontextprotocol/logLevel meta key (AC-43.28)', () => {
    const entry = DEPRECATED_REGISTRY.find((e) => e.feature.includes('logLevel'));
    expect(entry).toBeDefined();
  });

  it('contains Dynamic Client Registration (AC-43.29)', () => {
    const entry = DEPRECATED_REGISTRY.find((e) =>
      e.feature.toLowerCase().includes('dynamic client registration'),
    );
    expect(entry).toBeDefined();
  });
});

describe('findDeprecatedEntry', () => {
  it('returns the matching entry when found', () => {
    const entry = findDeprecatedEntry('Roots capability');
    expect(entry).toBeDefined();
    expect(entry?.feature).toBe('Roots capability');
  });

  it('returns undefined for an unknown feature', () => {
    expect(findDeprecatedEntry('nonexistent-feature-xyz')).toBeUndefined();
  });
});

describe('emitDeprecationWarning (AC-43.30 to AC-43.33)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to console.warn (AC-43.30)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    emitDeprecationWarning('TestFeature', 'Use newFeature instead.');
    expect(spy).toHaveBeenCalled();
  });

  it('message includes the feature name (AC-43.31)', () => {
    let captured = '';
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      captured = args.join(' ');
    });
    emitDeprecationWarning('TestFeature', 'Use newFeature instead.');
    expect(captured).toContain('TestFeature');
  });

  it('message includes the migration note (AC-43.32)', () => {
    let captured = '';
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      captured = args.join(' ');
    });
    emitDeprecationWarning('TestFeature', 'Use newFeature instead.');
    expect(captured).toContain('Use newFeature instead.');
  });

  it('returns void (AC-43.33)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = emitDeprecationWarning('TestFeature', 'Use newFeature instead.');
    expect(result).toBeUndefined();
  });
});
