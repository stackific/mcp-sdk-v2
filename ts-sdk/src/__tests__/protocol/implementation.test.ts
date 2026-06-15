/**
 * Tests for the `Implementation` descriptor — S01 §2.2.1.
 *
 * AC-01.28 (R-2.2.1-a, R-2.2.1-b, R-2.2.1-c) — name and version are REQUIRED.
 * AC-01.29 (R-2.2.1-d, R-2.2.1-e)             — title and icons are OPTIONAL.
 * AC-01.30 (R-2.2.1-f, R-2.2.1-g)             — unknown properties MUST be ignored.
 */

import { describe, it, expect } from 'vitest';
import { ImplementationSchema, parseImplementation } from '../../protocol/implementation.js';

describe('Required fields (AC-01.28)', () => {
  it('parses when name and version are present', () => {
    const result = ImplementationSchema.safeParse({ name: 'example-mcp-server', version: '1.4.2' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('example-mcp-server');
      expect(result.data.version).toBe('1.4.2');
    }
  });

  it('rejects when name is absent', () => {
    expect(ImplementationSchema.safeParse({ version: '1.0.0' }).success).toBe(false);
  });

  it('rejects when version is absent', () => {
    expect(ImplementationSchema.safeParse({ name: 'srv' }).success).toBe(false);
  });

  it('rejects when both required fields are absent', () => {
    expect(ImplementationSchema.safeParse({}).success).toBe(false);
  });

  it('rejects when name is not a string', () => {
    expect(ImplementationSchema.safeParse({ name: 42, version: '1.0' }).success).toBe(false);
  });

  it('rejects when version is not a string', () => {
    expect(ImplementationSchema.safeParse({ name: 'srv', version: 2 }).success).toBe(false);
  });
});

describe('Optional fields (AC-01.29)', () => {
  it('parses with title present', () => {
    const result = ImplementationSchema.safeParse({
      name: 'srv',
      version: '1.0',
      title: 'My Server',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('My Server');
  });

  it('parses with icons array present', () => {
    const result = ImplementationSchema.safeParse({
      name: 'srv',
      version: '1.0',
      icons: [{ src: 'https://example.com/icon.png' }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.icons).toHaveLength(1);
  });

  it('parses without title (title is optional)', () => {
    const result = ImplementationSchema.safeParse({ name: 'srv', version: '1.0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBeUndefined();
  });

  it('parses without icons (icons is optional)', () => {
    const result = ImplementationSchema.safeParse({ name: 'srv', version: '1.0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.icons).toBeUndefined();
  });

  it('accepts an empty icons array', () => {
    expect(
      ImplementationSchema.safeParse({ name: 'srv', version: '1.0', icons: [] }).success,
    ).toBe(true);
  });
});

describe('Unknown properties must be ignored (AC-01.30)', () => {
  it('parses when an unrecognised property is present', () => {
    expect(
      ImplementationSchema.safeParse({
        name: 'example-mcp-server',
        version: '1.4.2',
        'x-vendor-buildId': '2026-06-13-abc123',
      }).success,
    ).toBe(true);
  });

  it('does not treat nested unrecognised properties as errors', () => {
    expect(
      ImplementationSchema.safeParse({
        name: 'srv',
        version: '1.0',
        unknownProp: { nested: true },
      }).success,
    ).toBe(true);
  });

  it('recognised fields are intact when unknown fields are present', () => {
    const result = ImplementationSchema.safeParse({
      name: 'my-server',
      version: '2.0.0',
      'x-custom': 99,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('my-server');
      expect(result.data.version).toBe('2.0.0');
    }
  });
});

describe('parseImplementation helper', () => {
  it('returns the parsed descriptor for valid input', () => {
    const impl = parseImplementation({ name: 'test-client', version: '0.1.0', 'x-extra': 1 });
    expect(impl.name).toBe('test-client');
    expect(impl.version).toBe('0.1.0');
  });

  it('throws for missing required fields', () => {
    expect(() => parseImplementation({ version: '1.0' })).toThrow();
    expect(() => parseImplementation({ name: 'srv' })).toThrow();
  });
});
