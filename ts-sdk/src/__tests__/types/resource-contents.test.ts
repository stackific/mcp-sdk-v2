/**
 * Tests for ResourceContents family — S21 §14.5.
 *
 * AC coverage:
 *  AC-21.12 (R-14.5-a,b,c)   — uri required; mimeType and _meta optional
 *  AC-21.13 (R-14.5-d,e)     — TextResourceContents: text required
 *  AC-21.14 (R-14.5-f)       — BlobResourceContents: blob is valid Base64
 *  AC-21.15 (R-14.5-g,h)     — variant selected by text/blob presence; both rejects
 */

import { describe, it, expect } from 'vitest';
import {
  TextResourceContentsSchema,
  BlobResourceContentsSchema,
  ResourceContentsSchema,
  isValidBase64,
} from '../../types/resource-contents.js';

describe('isValidBase64', () => {
  it('accepts standard base64 with padding', () => {
    expect(isValidBase64('aGVsbG8=')).toBe(true);
  });

  it('accepts unpadded base64', () => {
    expect(isValidBase64('aGVsbG8')).toBe(true);
  });

  it('accepts an empty string', () => {
    expect(isValidBase64('')).toBe(true);
  });

  it('rejects characters outside the base64 alphabet', () => {
    expect(isValidBase64('hello world!')).toBe(false);
  });
});

describe('TextResourceContentsSchema (AC-21.12, AC-21.13)', () => {
  it('accepts a minimal text resource', () => {
    expect(
      TextResourceContentsSchema.safeParse({
        uri: 'file:///README.md',
        text: '# Hello',
      }).success,
    ).toBe(true);
  });

  it('requires uri (AC-21.12 — R-14.5-a)', () => {
    expect(TextResourceContentsSchema.safeParse({ text: 'hello' }).success).toBe(false);
  });

  it('requires text (AC-21.13 — R-14.5-d)', () => {
    expect(TextResourceContentsSchema.safeParse({ uri: 'file:///f.txt' }).success).toBe(false);
  });

  it('accepts optional mimeType (AC-21.12 — R-14.5-b)', () => {
    expect(
      TextResourceContentsSchema.safeParse({
        uri: 'file:///f.md',
        text: '# hi',
        mimeType: 'text/markdown',
      }).success,
    ).toBe(true);
  });

  it('accepts optional _meta (AC-21.12 — R-14.5-c)', () => {
    expect(
      TextResourceContentsSchema.safeParse({
        uri: 'file:///f.txt',
        text: 'content',
        _meta: { source: 'fs' },
      }).success,
    ).toBe(true);
  });
});

describe('BlobResourceContentsSchema (AC-21.14 — R-14.5-f)', () => {
  it('accepts a valid Base64 blob', () => {
    expect(
      BlobResourceContentsSchema.safeParse({
        uri: 'file:///logo.png',
        blob: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC',
      }).success,
    ).toBe(true);
  });

  it('requires uri', () => {
    expect(BlobResourceContentsSchema.safeParse({ blob: 'aGVsbG8=' }).success).toBe(false);
  });

  it('requires blob', () => {
    expect(BlobResourceContentsSchema.safeParse({ uri: 'file:///f.bin' }).success).toBe(false);
  });

  it('rejects blob with non-base64 characters', () => {
    expect(
      BlobResourceContentsSchema.safeParse({ uri: 'file:///f.bin', blob: 'not valid!!' }).success,
    ).toBe(false);
  });
});

describe('ResourceContentsSchema — variant selection (AC-21.15 — R-14.5-g)', () => {
  it('selects TextResourceContents when text is present', () => {
    const result = ResourceContentsSchema.safeParse({
      uri: 'file:///f.txt',
      text: 'hello',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('text' in result.data).toBe(true);
    }
  });

  it('selects BlobResourceContents when blob is present', () => {
    const result = ResourceContentsSchema.safeParse({
      uri: 'file:///f.bin',
      blob: 'aGVsbG8=',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('blob' in result.data).toBe(true);
    }
  });

  it('rejects when both text and blob are present (AC-21.15 — R-14.5-h)', () => {
    expect(
      ResourceContentsSchema.safeParse({
        uri: 'file:///ambiguous',
        text: 'hello',
        blob: 'aGVsbG8=',
      }).success,
    ).toBe(false);
  });
});
