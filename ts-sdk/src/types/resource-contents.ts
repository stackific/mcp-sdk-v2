/**
 * `ResourceContents` — the concrete contents of a resource. (§14.5)
 *
 * Two mutually exclusive variants: `TextResourceContents` (carries `text`) and
 * `BlobResourceContents` (carries `blob`). A value MUST NOT carry both. (R-14.5-h)
 *
 * A receiver selects the variant by which payload field is present. (R-14.5-g)
 */

import { z } from 'zod';

// ─── Base64 validation ────────────────────────────────────────────────────────

/**
 * Returns `true` when `s` contains only valid Base64 characters (including
 * optional `=` padding). Accepts both standard (`+/`) and URL-safe (`-_`)
 * variants so the SDK remains interoperable. (R-14.5-f, R-14.4.2-b, R-14.4.3-b)
 */
export function isValidBase64(s: string): boolean {
  return /^[A-Za-z0-9+/\-_]*(={0,2})?$/.test(s);
}

// ─── TextResourceContents ─────────────────────────────────────────────────────

/**
 * Text variant of resource contents. Use ONLY when the resource can actually
 * be represented as text rather than binary data. (R-14.5-d, R-14.5-e)
 */
export const TextResourceContentsSchema = z.object({
  /** REQUIRED. URI identifying the resource. (R-14.5-a) */
  uri: z.string(),
  /** OPTIONAL. MIME type of the resource, if known. (R-14.5-b) */
  mimeType: z.string().optional(),
  /**
   * REQUIRED. Textual content. Use this variant only when the resource is
   * representable as text rather than binary data. (R-14.5-d, R-14.5-e)
   */
  text: z.string(),
  /** OPTIONAL. Implementation-specific metadata. (R-14.5-c) */
  _meta: z.record(z.unknown()).optional(),
}).passthrough();

export type TextResourceContents = z.infer<typeof TextResourceContentsSchema>;

// ─── BlobResourceContents ─────────────────────────────────────────────────────

/**
 * Binary variant of resource contents. `blob` is Base64-encoded raw bytes.
 * (R-14.5-f)
 */
export const BlobResourceContentsSchema = z.object({
  /** REQUIRED. URI identifying the resource. (R-14.5-a) */
  uri: z.string(),
  /** OPTIONAL. MIME type of the resource, if known. (R-14.5-b) */
  mimeType: z.string().optional(),
  /**
   * REQUIRED. Binary content encoded as Base64. MUST contain only valid
   * Base64 characters and decode to the raw resource bytes. (R-14.5-f)
   */
  blob: z.string().refine(isValidBase64, {
    message: 'blob MUST contain only valid Base64 characters (R-14.5-f)',
  }),
  /** OPTIONAL. Implementation-specific metadata. (R-14.5-c) */
  _meta: z.record(z.unknown()).optional(),
}).passthrough();

export type BlobResourceContents = z.infer<typeof BlobResourceContentsSchema>;

// ─── ResourceContents (discriminated union) ───────────────────────────────────

/**
 * The concrete contents of a resource: either text or binary (Base64).
 *
 * A receiver selects the variant by which of `text` or `blob` is present.
 * A value carrying BOTH is invalid and rejected. (R-14.5-g, R-14.5-h)
 *
 * `TextResourceContents` is tried first; if `text` is absent, Zod falls
 * through to `BlobResourceContentsSchema`. A `superRefine` on the union
 * catches the both-present case.
 */
export const ResourceContentsSchema = z
  .union([TextResourceContentsSchema, BlobResourceContentsSchema])
  .superRefine((val, ctx) => {
    const v = val as Record<string, unknown>;
    if ('text' in v && 'blob' in v) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ResourceContents MUST NOT carry both `text` and `blob` (R-14.5-h)',
      });
    }
  });

export type ResourceContents = TextResourceContents | BlobResourceContents;
