/**
 * `ContentBlock` — the discriminated union payload of tool-call results and
 * prompt messages. (§14.4)
 *
 * Five known member types, dispatched by the case-sensitive `type` field.
 * An unknown `type` SHOULD be treated as unsupported content rather than
 * failing the whole message. (R-14.4-a, R-14.4-b)
 *
 * The `"tool_use"` and `"tool_result"` types from the deprecated sampling
 * capability MUST NOT appear in tool-call results or prompt messages.
 * (R-14.8-a, R-14.8-b)
 */

import { z } from 'zod';
import { AnnotationsSchema } from './annotations.js';
import { IconSchema } from './icon.js';
import { ResourceContentsSchema } from './resource-contents.js';
import { isValidBase64 } from './resource-contents.js';

// Shared optional tail fields that appear on every block.
const _blockTail = {
  annotations: AnnotationsSchema.optional(),
  _meta: z.record(z.unknown()).optional(),
};

// ─── TextContent ──────────────────────────────────────────────────────────────

/** Inline text content provided to or from a language model. (§14.4.1) */
export const TextContentSchema = z.object({
  /** MUST be the literal `"text"`. (R-14.4.1-a) */
  type: z.literal('text'),
  /** REQUIRED. The text content. (R-14.4.1-b) */
  text: z.string(),
  ..._blockTail,
}).passthrough();

export type TextContent = z.infer<typeof TextContentSchema>;

// ─── ImageContent ─────────────────────────────────────────────────────────────

/** Inline image content provided to or from a language model. (§14.4.2) */
export const ImageContentSchema = z.object({
  /** MUST be the literal `"image"`. (R-14.4.2-a) */
  type: z.literal('image'),
  /**
   * REQUIRED. Image bytes as Base64. MUST contain only valid Base64 characters
   * and decode to the raw image bytes. (R-14.4.2-b)
   */
  data: z.string().refine(isValidBase64, {
    message: 'data MUST contain only valid Base64 characters (R-14.4.2-b)',
  }),
  /** REQUIRED. MIME type of the image. (R-14.4.2-c) */
  mimeType: z.string(),
  ..._blockTail,
}).passthrough();

export type ImageContent = z.infer<typeof ImageContentSchema>;

// ─── AudioContent ─────────────────────────────────────────────────────────────

/** Inline audio content provided to or from a language model. (§14.4.3) */
export const AudioContentSchema = z.object({
  /** MUST be the literal `"audio"`. (R-14.4.3-a) */
  type: z.literal('audio'),
  /**
   * REQUIRED. Audio bytes as Base64. MUST contain only valid Base64 characters
   * and decode to the raw audio bytes. (R-14.4.3-b)
   */
  data: z.string().refine(isValidBase64, {
    message: 'data MUST contain only valid Base64 characters (R-14.4.3-b)',
  }),
  /** REQUIRED. MIME type of the audio. (R-14.4.3-c) */
  mimeType: z.string(),
  ..._blockTail,
}).passthrough();

export type AudioContent = z.infer<typeof AudioContentSchema>;

// ─── ResourceLink ─────────────────────────────────────────────────────────────

/**
 * A content block that references a resource by URI instead of embedding it.
 * Carries the resource-descriptor field set. (§14.4.4)
 *
 * A resource link returned by a tool is not guaranteed to appear in
 * `resources/list` results. (R-14.4.4-l)
 */
export const ResourceLinkSchema = z.object({
  /** MUST be the literal `"resource_link"`. (R-14.4.4-a) */
  type: z.literal('resource_link'),
  /** REQUIRED. URI of the referenced resource [RFC3986]. (R-14.4.4-b) */
  uri: z.string(),
  /** REQUIRED. Programmatic identifier (from BaseMetadata). (R-14.4.4-c) */
  name: z.string(),
  /** OPTIONAL. Human display name. (R-14.4.4-d) */
  title: z.string().optional(),
  /** OPTIONAL. Icons representing the resource. (R-14.4.4-e) */
  icons: z.array(IconSchema).optional(),
  /** OPTIONAL. Description usable as a hint to a language model. (R-14.4.4-f) */
  description: z.string().optional(),
  /** OPTIONAL. MIME type of the resource, if known. (R-14.4.4-g) */
  mimeType: z.string().optional(),
  /**
   * OPTIONAL. Size of the raw resource content in bytes, measured before
   * Base64 encoding or tokenization, if known. (R-14.4.4-i)
   * Hosts MAY use this to display file sizes or estimate context-window usage.
   * (R-14.4.4-j)
   */
  size: z.number().optional(),
  ..._blockTail,
}).passthrough();

export type ResourceLink = z.infer<typeof ResourceLinkSchema>;

// ─── EmbeddedResource ─────────────────────────────────────────────────────────

/**
 * A content block that embeds a resource's contents directly into a tool
 * result or prompt message. (§14.4.5)
 *
 * The variant of the embedded `resource` is determined by which of `text` or
 * `blob` is present. (R-14.4.5-b)
 */
export const EmbeddedResourceSchema = z.object({
  /** MUST be the literal `"resource"`. (R-14.4.5-a) */
  type: z.literal('resource'),
  /**
   * REQUIRED. The embedded contents: either `TextResourceContents` or
   * `BlobResourceContents`. (R-14.4.5-b)
   */
  resource: ResourceContentsSchema,
  ..._blockTail,
}).passthrough();

export type EmbeddedResource = z.infer<typeof EmbeddedResourceSchema>;

// ─── ContentBlock (discriminated union) ───────────────────────────────────────

/**
 * `type` values from the deprecated sampling capability that MUST NOT appear
 * in tool-call results or prompt messages. (R-14.8-a, R-14.8-b)
 */
export const FORBIDDEN_CONTENT_BLOCK_TYPES = new Set(['tool_use', 'tool_result']);

/**
 * Returns `true` when `type` is a known, supported `ContentBlock` discriminator.
 * A receiver SHOULD treat unknown types as unsupported content, not as errors.
 * (R-14.4-b)
 */
export function isKnownContentBlockType(
  type: string,
): type is 'text' | 'image' | 'audio' | 'resource_link' | 'resource' {
  return ['text', 'image', 'audio', 'resource_link', 'resource'].includes(type);
}

/**
 * Returns `true` when `type` belongs to the forbidden sampling content set.
 * (R-14.8-a, R-14.8-b)
 */
export function isForbiddenContentBlockType(type: string): boolean {
  return FORBIDDEN_CONTENT_BLOCK_TYPES.has(type);
}

/**
 * A `ContentBlock` with an unrecognized `type`; treated as unsupported content.
 *
 * TypeScript does not support negated literal types, so `Exclude<string, 'tool_use' |
 * 'tool_result'>` evaluates to `string` — the static type cannot statically exclude the
 * forbidden sampling discriminators. The runtime enforcement is in `ContentBlockSchema`
 * via `.refine()`; `isForbiddenContentBlockType` guards producer code. (R-14.8-a, R-14.8-b)
 */
export type UnknownContentBlock = { type: string } & Record<string, unknown>;

/**
 * `ContentBlock` union — the payload element of tool-call results and prompt
 * messages. Dispatch on the case-sensitive `type` field. (§14.4, R-14.4-a)
 *
 * An unrecognized `type` falls through to the `UnknownContentBlock` fallback
 * rather than failing the enclosing message (R-14.4-b), UNLESS the type is a
 * forbidden sampling type (`tool_use`, `tool_result`) which MUST be rejected
 * even in the fallback path. (R-14.8-a, R-14.8-b)
 */
export const ContentBlockSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ResourceLinkSchema,
  EmbeddedResourceSchema,
  // Forward-compat fallback: accept GENUINELY unknown types only. A block whose
  // `type` is a forbidden sampling discriminator is rejected (R-14.8-a/b); and a
  // block whose `type` is a KNOWN type but which reached this fallback failed its
  // own strict schema (e.g. `{type:"text"}` with no `text`), so it is malformed
  // content — NOT "unknown" content — and is likewise rejected rather than passed
  // through. (Tightens the §14.4-b forward-compatible fallback.)
  z.object({ type: z.string() }).passthrough().refine(
    (b) => {
      const type = (b as { type: string }).type;
      return !isForbiddenContentBlockType(type) && !isKnownContentBlockType(type);
    },
    { message: 'invalid ContentBlock: a forbidden (tool_use/tool_result) or malformed known-type block (R-14.4-b, R-14.8-a, R-14.8-b)' },
  ),
]);

export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource
  | UnknownContentBlock;
