/**
 * Tests for ContentBlock union — S21 §14.4.
 *
 * AC coverage:
 *  AC-21.1  (R-14.4-a)         — case-sensitive type dispatch
 *  AC-21.2  (R-14.4-b)         — unknown type treated as unsupported, not an error
 *  AC-21.3  (R-14.4.1-a,b,c,d) — TextContent
 *  AC-21.4  (R-14.4.2-a,b,c,e,f) — ImageContent
 *  AC-21.5  (R-14.4.2-d)       — different image mimeTypes both valid
 *  AC-21.6  (R-14.4.3-a,b,c,e,f) — AudioContent
 *  AC-21.7  (R-14.4.3-d)       — different audio mimeTypes both valid
 *  AC-21.8  (R-14.4.4-a,b,c,d,e,f,g,h,i,k) — ResourceLink
 *  AC-21.9  (R-14.4.4-j)       — size may be used for file-size display
 *  AC-21.10 (R-14.4.4-l)       — ResourceLink need not appear in resources/list
 *  AC-21.11 (R-14.4.5-a,b,c,d) — EmbeddedResource
 *  AC-21.20 (R-14.8-a,R-14.8-b) — tool_use and tool_result are forbidden
 */

import { describe, it, expect } from 'vitest';
import {
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ResourceLinkSchema,
  EmbeddedResourceSchema,
  ContentBlockSchema,
  FORBIDDEN_CONTENT_BLOCK_TYPES,
  isKnownContentBlockType,
  isForbiddenContentBlockType,
} from '../../types/content.js';

// ─── TextContent (AC-21.3) ───────────────────────────────────────────────────

describe('TextContent (AC-21.3 — R-14.4.1-a, R-14.4.1-b)', () => {
  it('accepts minimal TextContent', () => {
    expect(
      TextContentSchema.safeParse({ type: 'text', text: 'hello' }).success,
    ).toBe(true);
  });

  it('requires type "text"', () => {
    expect(TextContentSchema.safeParse({ type: 'TEXT', text: 'hello' }).success).toBe(false);
  });

  it('requires text field', () => {
    expect(TextContentSchema.safeParse({ type: 'text' }).success).toBe(false);
  });

  it('accepts optional annotations (R-14.4.1-c)', () => {
    expect(
      TextContentSchema.safeParse({
        type: 'text',
        text: 'hello',
        annotations: { audience: ['user'] },
      }).success,
    ).toBe(true);
  });

  it('accepts optional _meta (R-14.4.1-d)', () => {
    expect(
      TextContentSchema.safeParse({
        type: 'text',
        text: 'hi',
        _meta: { trace: '123' },
      }).success,
    ).toBe(true);
  });

  it('absent annotations is valid', () => {
    expect(TextContentSchema.safeParse({ type: 'text', text: 'hi' }).success).toBe(true);
  });
});

// ─── ImageContent (AC-21.4, AC-21.5) ─────────────────────────────────────────

const VALID_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC';

describe('ImageContent (AC-21.4 — R-14.4.2-a, b, c)', () => {
  it('accepts a valid ImageContent', () => {
    expect(
      ImageContentSchema.safeParse({
        type: 'image',
        data: VALID_PNG_B64,
        mimeType: 'image/png',
      }).success,
    ).toBe(true);
  });

  it('requires type "image"', () => {
    expect(
      ImageContentSchema.safeParse({ type: 'Image', data: VALID_PNG_B64, mimeType: 'image/png' })
        .success,
    ).toBe(false);
  });

  it('requires data (R-14.4.2-b)', () => {
    expect(
      ImageContentSchema.safeParse({ type: 'image', mimeType: 'image/png' }).success,
    ).toBe(false);
  });

  it('rejects non-base64 data (R-14.4.2-b)', () => {
    expect(
      ImageContentSchema.safeParse({ type: 'image', data: 'not!base64', mimeType: 'image/png' })
        .success,
    ).toBe(false);
  });

  it('requires mimeType (R-14.4.2-c)', () => {
    expect(
      ImageContentSchema.safeParse({ type: 'image', data: VALID_PNG_B64 }).success,
    ).toBe(false);
  });

  it('accepts optional annotations (R-14.4.2-e)', () => {
    expect(
      ImageContentSchema.safeParse({
        type: 'image',
        data: VALID_PNG_B64,
        mimeType: 'image/png',
        annotations: { audience: ['user'], priority: 0.3 },
      }).success,
    ).toBe(true);
  });
});

describe('ImageContent — multiple MIME types valid (AC-21.5 — R-14.4.2-d)', () => {
  it('image/png is valid', () => {
    expect(
      ImageContentSchema.safeParse({ type: 'image', data: VALID_PNG_B64, mimeType: 'image/png' })
        .success,
    ).toBe(true);
  });

  it('image/jpeg is valid', () => {
    expect(
      ImageContentSchema.safeParse({ type: 'image', data: VALID_PNG_B64, mimeType: 'image/jpeg' })
        .success,
    ).toBe(true);
  });

  it('image/webp is valid', () => {
    expect(
      ImageContentSchema.safeParse({ type: 'image', data: VALID_PNG_B64, mimeType: 'image/webp' })
        .success,
    ).toBe(true);
  });
});

// ─── AudioContent (AC-21.6, AC-21.7) ─────────────────────────────────────────

const VALID_WAV_B64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

describe('AudioContent (AC-21.6 — R-14.4.3-a, b, c)', () => {
  it('accepts a valid AudioContent', () => {
    expect(
      AudioContentSchema.safeParse({
        type: 'audio',
        data: VALID_WAV_B64,
        mimeType: 'audio/wav',
      }).success,
    ).toBe(true);
  });

  it('requires type "audio"', () => {
    expect(
      AudioContentSchema.safeParse({ type: 'Audio', data: VALID_WAV_B64, mimeType: 'audio/wav' })
        .success,
    ).toBe(false);
  });

  it('requires data (R-14.4.3-b)', () => {
    expect(AudioContentSchema.safeParse({ type: 'audio', mimeType: 'audio/wav' }).success).toBe(
      false,
    );
  });

  it('rejects non-base64 data (R-14.4.3-b)', () => {
    expect(
      AudioContentSchema.safeParse({ type: 'audio', data: 'not!valid', mimeType: 'audio/wav' })
        .success,
    ).toBe(false);
  });

  it('requires mimeType (R-14.4.3-c)', () => {
    expect(AudioContentSchema.safeParse({ type: 'audio', data: VALID_WAV_B64 }).success).toBe(
      false,
    );
  });
});

describe('AudioContent — multiple MIME types valid (AC-21.7 — R-14.4.3-d)', () => {
  it('audio/wav is valid', () => {
    expect(
      AudioContentSchema.safeParse({ type: 'audio', data: VALID_WAV_B64, mimeType: 'audio/wav' })
        .success,
    ).toBe(true);
  });

  it('audio/mpeg is valid', () => {
    expect(
      AudioContentSchema.safeParse({ type: 'audio', data: VALID_WAV_B64, mimeType: 'audio/mpeg' })
        .success,
    ).toBe(true);
  });
});

// ─── ResourceLink (AC-21.8, AC-21.9, AC-21.10) ───────────────────────────────

describe('ResourceLink (AC-21.8 — R-14.4.4-a, b, c)', () => {
  it('accepts minimal ResourceLink with uri and name', () => {
    expect(
      ResourceLinkSchema.safeParse({
        type: 'resource_link',
        uri: 'file:///src/main.rs',
        name: 'main.rs',
      }).success,
    ).toBe(true);
  });

  it('requires type "resource_link"', () => {
    expect(
      ResourceLinkSchema.safeParse({ type: 'resource-link', uri: 'x', name: 'x' }).success,
    ).toBe(false);
  });

  it('requires uri (R-14.4.4-b)', () => {
    expect(ResourceLinkSchema.safeParse({ type: 'resource_link', name: 'x' }).success).toBe(false);
  });

  it('requires name (R-14.4.4-c)', () => {
    expect(
      ResourceLinkSchema.safeParse({ type: 'resource_link', uri: 'file:///x' }).success,
    ).toBe(false);
  });

  it('accepts optional title (R-14.4.4-d)', () => {
    expect(
      ResourceLinkSchema.safeParse({
        type: 'resource_link',
        uri: 'file:///x',
        name: 'x',
        title: 'X file',
      }).success,
    ).toBe(true);
  });

  it('accepts optional description (R-14.4.4-f)', () => {
    expect(
      ResourceLinkSchema.safeParse({
        type: 'resource_link',
        uri: 'file:///x',
        name: 'x',
        description: 'Describes what X is.',
      }).success,
    ).toBe(true);
  });

  it('accepts optional mimeType (R-14.4.4-g)', () => {
    expect(
      ResourceLinkSchema.safeParse({
        type: 'resource_link',
        uri: 'file:///x.rs',
        name: 'x.rs',
        mimeType: 'text/x-rust',
      }).success,
    ).toBe(true);
  });

  it('accepts optional size in bytes (AC-21.9 — R-14.4.4-i, j)', () => {
    expect(
      ResourceLinkSchema.safeParse({
        type: 'resource_link',
        uri: 'file:///x',
        name: 'x',
        size: 4096,
      }).success,
    ).toBe(true);
  });

  it('accepts optional annotations (R-14.4.4-h)', () => {
    expect(
      ResourceLinkSchema.safeParse({
        type: 'resource_link',
        uri: 'file:///x',
        name: 'x',
        annotations: { priority: 0.5 },
      }).success,
    ).toBe(true);
  });
});

// ─── EmbeddedResource (AC-21.11) ─────────────────────────────────────────────

describe('EmbeddedResource (AC-21.11 — R-14.4.5-a, b)', () => {
  it('accepts EmbeddedResource with TextResourceContents', () => {
    expect(
      EmbeddedResourceSchema.safeParse({
        type: 'resource',
        resource: { uri: 'file:///README.md', text: '# Hello' },
      }).success,
    ).toBe(true);
  });

  it('accepts EmbeddedResource with BlobResourceContents', () => {
    expect(
      EmbeddedResourceSchema.safeParse({
        type: 'resource',
        resource: { uri: 'file:///logo.png', blob: VALID_PNG_B64 },
      }).success,
    ).toBe(true);
  });

  it('requires type "resource"', () => {
    expect(
      EmbeddedResourceSchema.safeParse({
        type: 'Resource',
        resource: { uri: 'file:///x', text: 'hi' },
      }).success,
    ).toBe(false);
  });

  it('requires resource field (R-14.4.5-b)', () => {
    expect(EmbeddedResourceSchema.safeParse({ type: 'resource' }).success).toBe(false);
  });

  it('rejects resource carrying both text and blob', () => {
    expect(
      EmbeddedResourceSchema.safeParse({
        type: 'resource',
        resource: { uri: 'file:///x', text: 'hello', blob: 'aGVsbG8=' },
      }).success,
    ).toBe(false);
  });

  it('accepts optional annotations (R-14.4.5-c)', () => {
    expect(
      EmbeddedResourceSchema.safeParse({
        type: 'resource',
        resource: { uri: 'file:///x', text: 'hi' },
        annotations: { audience: ['assistant'], priority: 0.8 },
      }).success,
    ).toBe(true);
  });
});

// ─── ContentBlockSchema — dispatch and unknown types (AC-21.1, AC-21.2) ──────

describe('ContentBlockSchema — case-sensitive dispatch (AC-21.1 — R-14.4-a)', () => {
  it('"text" matches TextContent', () => {
    const result = ContentBlockSchema.safeParse({ type: 'text', text: 'hi' });
    expect(result.success).toBe(true);
  });

  it('"Text" does NOT match TextContent — case-sensitive', () => {
    // Falls through to the unknown-block fallback, but is accepted as unknown content.
    const result = ContentBlockSchema.safeParse({ type: 'Text', text: 'hi' });
    expect(result.success).toBe(true); // accepted as unknown type
    if (result.success) {
      expect((result.data as { type: string }).type).toBe('Text');
    }
  });

  it('"TEXT" does NOT match TextContent — case-sensitive', () => {
    const result = ContentBlockSchema.safeParse({ type: 'TEXT', text: 'hi' });
    expect(result.success).toBe(true); // accepted as unknown type
  });
});

describe('ContentBlockSchema — unknown type handling (AC-21.2 — R-14.4-b)', () => {
  it('accepts a block with an unrecognized type', () => {
    const result = ContentBlockSchema.safeParse({
      type: 'future_content_type',
      customField: 42,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a MALFORMED known-type block instead of passing it as unknown (R-14.4-b tightening)', () => {
    // `{type:"text"}` is a known type missing its REQUIRED `text` — it must be
    // rejected as malformed content, not accepted via the unknown-type fallback.
    expect(ContentBlockSchema.safeParse({ type: 'text' }).success).toBe(false);
    expect(ContentBlockSchema.safeParse({ type: 'image' }).success).toBe(false);
    // A genuinely unknown type with no known schema is still accepted.
    expect(ContentBlockSchema.safeParse({ type: 'future_thing' }).success).toBe(true);
  });

  it('isKnownContentBlockType returns false for unknown types', () => {
    expect(isKnownContentBlockType('future_type')).toBe(false);
  });

  it('isKnownContentBlockType returns true for all five known types', () => {
    expect(isKnownContentBlockType('text')).toBe(true);
    expect(isKnownContentBlockType('image')).toBe(true);
    expect(isKnownContentBlockType('audio')).toBe(true);
    expect(isKnownContentBlockType('resource_link')).toBe(true);
    expect(isKnownContentBlockType('resource')).toBe(true);
  });
});

// ─── Forbidden sampling content types (AC-21.20) ─────────────────────────────

describe('Forbidden content block types — ContentBlockSchema rejects them (AC-21.20 — R-14.8-a, R-14.8-b)', () => {
  it('ContentBlockSchema rejects type "tool_use" (R-14.8-a)', () => {
    expect(
      ContentBlockSchema.safeParse({ type: 'tool_use', input: {} }).success,
    ).toBe(false);
  });

  it('ContentBlockSchema rejects type "tool_result" (R-14.8-b)', () => {
    expect(
      ContentBlockSchema.safeParse({ type: 'tool_result', content: [] }).success,
    ).toBe(false);
  });

  it('ContentBlockSchema still accepts a genuinely unknown future type (R-14.4-b)', () => {
    expect(
      ContentBlockSchema.safeParse({ type: 'future_diagram_type', data: {} }).success,
    ).toBe(true);
  });

  it('FORBIDDEN_CONTENT_BLOCK_TYPES includes "tool_use" and "tool_result"', () => {
    expect(FORBIDDEN_CONTENT_BLOCK_TYPES.has('tool_use')).toBe(true);
    expect(FORBIDDEN_CONTENT_BLOCK_TYPES.has('tool_result')).toBe(true);
  });

  it('isForbiddenContentBlockType returns true for both forbidden types', () => {
    expect(isForbiddenContentBlockType('tool_use')).toBe(true);
    expect(isForbiddenContentBlockType('tool_result')).toBe(true);
  });

  it('isForbiddenContentBlockType returns false for valid content types', () => {
    expect(isForbiddenContentBlockType('text')).toBe(false);
    expect(isForbiddenContentBlockType('image')).toBe(false);
    expect(isForbiddenContentBlockType('resource')).toBe(false);
    expect(isForbiddenContentBlockType('future_type')).toBe(false);
  });
});
