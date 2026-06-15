/**
 * Tests for Icon/Icons schemas and security validation — S20 §14.2.
 *
 * AC coverage:
 *  AC-20.1  (R-14-a)   — case-sensitive field names and enum values
 *  AC-20.9  (R-14.2-b,v) — icons array is optional; absent is valid
 *  AC-20.10 (R-14.2-c) — src is required
 *  AC-20.11 (R-14.2-d) — src must be http/https/data (field desc.)
 *  AC-20.14 (R-14.2-g) — mimeType is optional
 *  AC-20.15 (R-14.2-h) — sizes is optional; WxH or "any"
 *  AC-20.17 (R-14.2-j) — theme is optional; "light" or "dark" only
 *  AC-20.21 (R-14.2-n) — unsafe schemes rejected
 *  AC-20.22 (R-14.2-o) — only https: and data: accepted
 *  AC-20.25 (R-14.2-r) — content validated before rendering
 *  AC-20.26 (R-14.2-s) — declared MIME is advisory; magic bytes govern
 *  AC-20.27 (R-14.2-t) — MIME mismatch or unknown type rejects icon
 *  AC-20.28 (R-14.2-u) — type outside allowlist rejects icon
 */

import { describe, it, expect } from 'vitest';
import {
  IconSchema,
  IconsSchema,
  validateIconSrc,
  isValidIconSrc,
  IconValidationError,
  detectMimeTypeFromMagicBytes,
  validateIconBytes,
  REQUIRED_IMAGE_TYPES,
  RECOMMENDED_IMAGE_TYPES,
  DEFAULT_IMAGE_ALLOWLIST,
} from '../../types/icon.js';

describe('IconSchema — field validation (AC-20.10, AC-20.14, AC-20.15, AC-20.17)', () => {
  it('parses a minimal icon with only src (AC-20.10)', () => {
    const result = IconSchema.safeParse({ src: 'https://example.com/icon.png' });
    expect(result.success).toBe(true);
  });

  it('rejects when src is absent (AC-20.10 — R-14.2-c)', () => {
    expect(IconSchema.safeParse({ mimeType: 'image/png' }).success).toBe(false);
  });

  it('accepts optional mimeType (AC-20.14 — R-14.2-g)', () => {
    const result = IconSchema.safeParse({
      src: 'https://example.com/icon.png',
      mimeType: 'image/png',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional sizes with WxH entries (AC-20.15 — R-14.2-h)', () => {
    const result = IconSchema.safeParse({
      src: 'https://example.com/icon.png',
      sizes: ['48x48', '96x96'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts "any" as a size entry (AC-20.15 — R-14.2-h)', () => {
    const result = IconSchema.safeParse({
      src: 'https://example.com/icon.svg',
      sizes: ['any'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid size entry format', () => {
    expect(
      IconSchema.safeParse({ src: 'https://x.com/i.png', sizes: ['bad'] }).success,
    ).toBe(false);
  });

  it('accepts theme "light" (AC-20.17 — R-14.2-j)', () => {
    expect(
      IconSchema.safeParse({ src: 'https://x.com/i.png', theme: 'light' }).success,
    ).toBe(true);
  });

  it('accepts theme "dark" (AC-20.17)', () => {
    expect(
      IconSchema.safeParse({ src: 'https://x.com/i.png', theme: 'dark' }).success,
    ).toBe(true);
  });

  it('rejects "Light" — theme enum is case-sensitive (AC-20.1 — R-14-a)', () => {
    expect(
      IconSchema.safeParse({ src: 'https://x.com/i.png', theme: 'Light' }).success,
    ).toBe(false);
  });

  it('rejects an unknown theme value', () => {
    expect(
      IconSchema.safeParse({ src: 'https://x.com/i.png', theme: 'auto' }).success,
    ).toBe(false);
  });
});

describe('IconsSchema — optional icons array (AC-20.9 — R-14.2-b, R-14.2-v)', () => {
  it('accepts absent icons array', () => {
    expect(IconsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts an empty icons array', () => {
    expect(IconsSchema.safeParse({ icons: [] }).success).toBe(true);
  });

  it('accepts an array with valid icon entries', () => {
    expect(
      IconsSchema.safeParse({
        icons: [{ src: 'https://example.com/icon.png' }],
      }).success,
    ).toBe(true);
  });
});

describe('validateIconSrc — scheme security (AC-20.21, AC-20.22)', () => {
  it('accepts https: URL (AC-20.22 — R-14.2-o)', () => {
    expect(() => validateIconSrc('https://example.com/icon.png')).not.toThrow();
  });

  it('accepts data: URI (AC-20.22 — R-14.2-o)', () => {
    expect(() =>
      validateIconSrc('data:image/png;base64,iVBORw0KGgo='),
    ).not.toThrow();
  });

  it('rejects javascript: scheme (AC-20.21 — R-14.2-n)', () => {
    expect(() => validateIconSrc('javascript:alert(1)')).toThrow(IconValidationError);
  });

  it('rejects file: scheme (AC-20.21 — R-14.2-n)', () => {
    expect(() => validateIconSrc('file:///etc/passwd')).toThrow(IconValidationError);
  });

  it('rejects ftp: scheme (AC-20.21 — R-14.2-n)', () => {
    expect(() => validateIconSrc('ftp://example.com/icon.png')).toThrow(IconValidationError);
  });

  it('rejects ws: scheme (AC-20.21 — R-14.2-n)', () => {
    expect(() => validateIconSrc('ws://example.com/socket')).toThrow(IconValidationError);
  });

  it('rejects http: scheme (stricter rule R-14.2-o overrides R-14.2-d)', () => {
    expect(() => validateIconSrc('http://example.com/icon.png')).toThrow(IconValidationError);
  });

  it('rejects a URI with no scheme', () => {
    expect(() => validateIconSrc('/relative/path.png')).toThrow(IconValidationError);
  });

  it('isValidIconSrc returns false for unsafe schemes', () => {
    expect(isValidIconSrc('javascript:void(0)')).toBe(false);
    expect(isValidIconSrc('file:///etc/passwd')).toBe(false);
  });

  it('isValidIconSrc returns true for safe schemes', () => {
    expect(isValidIconSrc('https://example.com/icon.png')).toBe(true);
    expect(isValidIconSrc('data:image/png;base64,abc')).toBe(true);
  });
});

describe('detectMimeTypeFromMagicBytes (AC-20.26 — R-14.2-s)', () => {
  it('detects PNG from magic bytes', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(detectMimeTypeFromMagicBytes(png)).toBe('image/png');
  });

  it('detects JPEG from magic bytes', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(detectMimeTypeFromMagicBytes(jpeg)).toBe('image/jpeg');
  });

  it('detects SVG from leading text', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectMimeTypeFromMagicBytes(svg)).toBe('image/svg+xml');
  });

  it('detects SVG with XML declaration', () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg></svg>');
    expect(detectMimeTypeFromMagicBytes(svg)).toBe('image/svg+xml');
  });

  it('returns null for unknown bytes', () => {
    const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(detectMimeTypeFromMagicBytes(unknown)).toBeNull();
  });
});

describe('validateIconBytes (AC-20.25–AC-20.28)', () => {
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  it('returns detected MIME type for valid PNG bytes (AC-20.25)', () => {
    const mimeType = validateIconBytes(pngBytes);
    expect(mimeType).toBe('image/png');
  });

  it('accepts PNG with matching declared mimeType', () => {
    expect(() => validateIconBytes(pngBytes, 'image/png')).not.toThrow();
  });

  it('rejects when declared mimeType mismatches detected type (AC-20.27 — R-14.2-t)', () => {
    expect(() => validateIconBytes(pngBytes, 'image/jpeg')).toThrow(IconValidationError);
  });

  it('rejects unknown byte content (AC-20.27)', () => {
    const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(() => validateIconBytes(unknown)).toThrow(IconValidationError);
  });

  it('rejects a type outside the allowlist (AC-20.28 — R-14.2-u)', () => {
    // PNG is detected but not on a custom restricted allowlist
    const restrictedList = new Set(['image/jpeg']);
    expect(() => validateIconBytes(pngBytes, undefined, restrictedList)).toThrow(
      IconValidationError,
    );
  });
});

describe('MIME type support constants (AC-20.19, AC-20.20)', () => {
  it('required types include image/png and image/jpeg (AC-20.19 — R-14.2-l)', () => {
    expect(REQUIRED_IMAGE_TYPES.has('image/png')).toBe(true);
    expect(REQUIRED_IMAGE_TYPES.has('image/jpeg')).toBe(true);
  });

  it('recommended types include image/svg+xml and image/webp (AC-20.20 — R-14.2-m)', () => {
    expect(RECOMMENDED_IMAGE_TYPES.has('image/svg+xml')).toBe(true);
    expect(RECOMMENDED_IMAGE_TYPES.has('image/webp')).toBe(true);
  });

  it('default allowlist includes all required and recommended types', () => {
    for (const t of REQUIRED_IMAGE_TYPES) {
      expect(DEFAULT_IMAGE_ALLOWLIST.has(t)).toBe(true);
    }
    for (const t of RECOMMENDED_IMAGE_TYPES) {
      expect(DEFAULT_IMAGE_ALLOWLIST.has(t)).toBe(true);
    }
  });
});
