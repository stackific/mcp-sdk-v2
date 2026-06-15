/**
 * Tests for the Implementation schema — S20 §14.3 (full shape, supersedes S01 stub).
 *
 * AC coverage:
 *  AC-20.29 (R-14.3-a..e)  — all fields, required and optional
 *  AC-20.30 (R-14.3-f)     — unknown fields pass through (forward-compatibility)
 */

import { describe, it, expect } from 'vitest';
import { ImplementationSchema, parseImplementation } from '../../types/implementation.js';

const MINIMAL: Record<string, unknown> = {
  name: 'my-client',
  version: '1.0.0',
};

describe('ImplementationSchema — required fields (AC-20.29 — R-14.3-a, R-14.3-e)', () => {
  it('parses a minimal implementation with name and version', () => {
    const result = ImplementationSchema.safeParse(MINIMAL);
    expect(result.success).toBe(true);
  });

  it('rejects when name is absent', () => {
    expect(ImplementationSchema.safeParse({ version: '1.0.0' }).success).toBe(false);
  });

  it('rejects when version is absent', () => {
    expect(ImplementationSchema.safeParse({ name: 'my-client' }).success).toBe(false);
  });
});

describe('ImplementationSchema — optional fields (AC-20.29 — R-14.3-b,c,d)', () => {
  it('accepts the optional title field (R-14.3-b)', () => {
    const result = ImplementationSchema.safeParse({ ...MINIMAL, title: 'My Client' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('My Client');
  });

  it('accepts the optional description field (R-14.3-c)', () => {
    const result = ImplementationSchema.safeParse({
      ...MINIMAL,
      description: 'A sample MCP client.',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe('A sample MCP client.');
  });

  it('accepts the optional websiteUrl field (R-14.3-d)', () => {
    const result = ImplementationSchema.safeParse({
      ...MINIMAL,
      websiteUrl: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.websiteUrl).toBe('https://example.com');
  });

  it('accepts the optional icons array', () => {
    const result = ImplementationSchema.safeParse({
      ...MINIMAL,
      icons: [{ src: 'https://example.com/icon.png' }],
    });
    expect(result.success).toBe(true);
  });

  it('all optional fields are absent by default', () => {
    const result = ImplementationSchema.safeParse(MINIMAL);
    if (!result.success) return;
    expect(result.data.title).toBeUndefined();
    expect(result.data.description).toBeUndefined();
    expect(result.data.websiteUrl).toBeUndefined();
    expect(result.data.icons).toBeUndefined();
  });
});

describe('ImplementationSchema — forward-compatibility (AC-20.30 — R-14.3-f)', () => {
  it('passes through unknown fields without rejecting', () => {
    const result = ImplementationSchema.safeParse({
      ...MINIMAL,
      unknownFutureField: 'value',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['unknownFutureField']).toBe('value');
    }
  });
});

describe('parseImplementation helper', () => {
  it('returns a parsed Implementation on valid input', () => {
    const impl = parseImplementation({ name: 'sdk', version: '0.1.0' });
    expect(impl.name).toBe('sdk');
    expect(impl.version).toBe('0.1.0');
  });

  it('throws ZodError on invalid input', () => {
    expect(() => parseImplementation({ name: 'sdk' })).toThrow();
  });
});
