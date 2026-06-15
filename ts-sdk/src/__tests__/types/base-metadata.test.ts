/**
 * Tests for BaseMetadata and display-name resolution — S20 §14.1.
 *
 * AC coverage:
 *  AC-20.1 (R-14-a)    — field names are case-sensitive
 *  AC-20.3 (R-14.1-a,b) — name is required; title is optional
 *  AC-20.4 (R-14.1-c)  — title wins when present
 *  AC-20.5 (R-14.1-d)  — name used when title absent
 *  AC-20.6 (R-14.1-e)  — annotations.title is between title and name for tools
 *  AC-20.7 (R-14.1-f)  — non-uniqueness of name is not an error
 */

import { describe, it, expect } from 'vitest';
import { BaseMetadataSchema, resolveDisplayName } from '../../types/base-metadata.js';

describe('BaseMetadataSchema (AC-20.3 — R-14.1-a, R-14.1-b)', () => {
  it('parses when name is present', () => {
    const result = BaseMetadataSchema.safeParse({ name: 'my-tool' });
    expect(result.success).toBe(true);
  });

  it('parses when both name and title are present', () => {
    const result = BaseMetadataSchema.safeParse({ name: 'my-tool', title: 'My Tool' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My Tool');
    }
  });

  it('rejects when name is absent', () => {
    expect(BaseMetadataSchema.safeParse({ title: 'Title Only' }).success).toBe(false);
  });

  it('title is optional — absent is valid', () => {
    const result = BaseMetadataSchema.safeParse({ name: 'tool' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBeUndefined();
  });
});

describe('Case sensitivity (AC-20.1 — R-14-a)', () => {
  it('field name "name" is matched case-sensitively', () => {
    // Zod schema matches field names exactly; "Name" ≠ "name"
    const result = BaseMetadataSchema.safeParse({ Name: 'tool' });
    expect(result.success).toBe(false); // name is required but "Name" ≠ "name"
  });
});

describe('resolveDisplayName (AC-20.4, AC-20.5, AC-20.6)', () => {
  it('returns title when present (AC-20.4 — R-14.1-c)', () => {
    expect(resolveDisplayName('my-tool', 'My Tool')).toBe('My Tool');
  });

  it('returns name when title is absent (AC-20.5 — R-14.1-d)', () => {
    expect(resolveDisplayName('my-tool')).toBe('my-tool');
    expect(resolveDisplayName('my-tool', undefined)).toBe('my-tool');
  });

  it('returns annotationsTitle when title absent and annotationsTitle present (AC-20.6 — R-14.1-e)', () => {
    expect(resolveDisplayName('my-tool', undefined, 'Annotated Title')).toBe('Annotated Title');
  });

  it('title wins over annotationsTitle when both are present (AC-20.6 — R-14.1-e)', () => {
    expect(resolveDisplayName('my-tool', 'My Tool', 'Annotated Title')).toBe('My Tool');
  });

  it('falls back to name when both title and annotationsTitle are absent (AC-20.5)', () => {
    expect(resolveDisplayName('my-tool', undefined, undefined)).toBe('my-tool');
  });
});

describe('Non-uniqueness of name (AC-20.7 — R-14.1-f)', () => {
  it('two objects with the same name are both valid', () => {
    const a = BaseMetadataSchema.safeParse({ name: 'shared-name' });
    const b = BaseMetadataSchema.safeParse({ name: 'shared-name' });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
  });
});
