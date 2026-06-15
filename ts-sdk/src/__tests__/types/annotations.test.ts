/**
 * Tests for Annotations — S21 §14.6.
 *
 * AC coverage:
 *  AC-21.16 (R-14.6-a,b,c,e) — all fields optional; audience is Role[]; lastModified ISO 8601
 *  AC-21.17 (R-14.6-d)       — priority range 0..1 inclusive
 *  AC-21.18 (R-14.6-f,g)     — annotations are untrusted hints
 */

import { describe, it, expect } from 'vitest';
import { AnnotationsSchema } from '../../types/annotations.js';

describe('AnnotationsSchema — all fields optional (AC-21.16 — R-14.6-a)', () => {
  it('accepts an empty object', () => {
    expect(AnnotationsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts audience as an array of Role values (R-14.6-b)', () => {
    expect(
      AnnotationsSchema.safeParse({ audience: ['user', 'assistant'] }).success,
    ).toBe(true);
  });

  it('accepts audience with a single entry', () => {
    expect(AnnotationsSchema.safeParse({ audience: ['user'] }).success).toBe(true);
  });

  it('accepts an empty audience array', () => {
    expect(AnnotationsSchema.safeParse({ audience: [] }).success).toBe(true);
  });

  it('rejects an invalid Role value inside audience', () => {
    expect(AnnotationsSchema.safeParse({ audience: ['system'] }).success).toBe(false);
  });

  it('accepts a lastModified ISO 8601 string (R-14.6-e)', () => {
    expect(
      AnnotationsSchema.safeParse({ lastModified: '2026-07-28T09:15:00Z' }).success,
    ).toBe(true);
  });

  it('accepts priority 0 (R-14.6-c)', () => {
    expect(AnnotationsSchema.safeParse({ priority: 0 }).success).toBe(true);
  });

  it('accepts priority 1 (R-14.6-c)', () => {
    expect(AnnotationsSchema.safeParse({ priority: 1 }).success).toBe(true);
  });

  it('accepts priority 0.5', () => {
    expect(AnnotationsSchema.safeParse({ priority: 0.5 }).success).toBe(true);
  });
});

describe('AnnotationsSchema — priority range (AC-21.17 — R-14.6-d)', () => {
  it('rejects priority > 1', () => {
    expect(AnnotationsSchema.safeParse({ priority: 1.5 }).success).toBe(false);
  });

  it('rejects priority < 0', () => {
    expect(AnnotationsSchema.safeParse({ priority: -0.1 }).success).toBe(false);
  });

  it('rejects a large negative priority', () => {
    expect(AnnotationsSchema.safeParse({ priority: -10 }).success).toBe(false);
  });
});

describe('Annotations trust model (AC-21.18 — R-14.6-f, R-14.6-g)', () => {
  it('Annotations parses successfully from an untrusted source without errors', () => {
    // The annotation is advisory only. The SDK parses it; trust decisions
    // belong to the consumer. This test confirms schema-level acceptance.
    const result = AnnotationsSchema.safeParse({
      audience: ['user'],
      priority: 0.3,
      lastModified: '2025-01-12T15:00:58Z',
    });
    expect(result.success).toBe(true);
  });
});
