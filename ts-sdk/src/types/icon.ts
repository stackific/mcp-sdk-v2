/**
 * `Icon` and `Icons` types with security validation (§14.2).
 *
 * `Icon` describes a single renderable icon image. `Icons` is the mixin that
 * contributes an OPTIONAL `icons` array to identity and descriptor objects.
 *
 * Security model (§14.2):
 *  - Only `https:` URLs and `data:` URIs are accepted (R-14.2-o).
 *  - `javascript:`, `file:`, `ftp:`, `ws:` and other unsafe schemes are rejected (R-14.2-n).
 *  - MIME type is detected from magic bytes, not from the declared type (R-14.2-s).
 *  - Only image types on the allowlist are rendered (R-14.2-u).
 *  - Minimum required formats: image/png and image/jpeg (R-14.2-l).
 *  - Recommended additional formats: image/svg+xml and image/webp (R-14.2-m).
 */

import { z } from 'zod';

/** Background theme the icon is designed for (§14.2). */
export type IconTheme = 'light' | 'dark';

/**
 * `Icon` schema (§14.2, R-14.2-c – R-14.2-j).
 *
 * `src` is REQUIRED; all other fields are OPTIONAL.
 * The `theme` field is a closed enum: only `"light"` and `"dark"` are valid. (R-14-a)
 * Additional unknown fields are ignored via `.passthrough()` (§2.3.4).
 */
export const IconSchema = z.object({
  /** REQUIRED. URI pointing to the icon resource (https: URL or data: URI). (R-14.2-c) */
  src: z.string(),
  /** OPTIONAL. MIME-type override when the source type is missing or generic. (R-14.2-g) */
  mimeType: z.string().optional(),
  /**
   * OPTIONAL. Intended-use sizes; each entry is `"WxH"` or `"any"` for scalable. (R-14.2-h)
   * Omitted ⇒ usable at any size. (R-14.2-i)
   */
  sizes: z.array(z.string().regex(/^\d+x\d+$|^any$/)).optional(),
  /**
   * OPTIONAL. Background theme the icon is designed for. (R-14.2-j)
   * Omitted ⇒ usable with any theme. (R-14.2-k)
   */
  theme: z.enum(['light', 'dark']).optional(),
}).passthrough();

export type Icon = z.infer<typeof IconSchema>;

/** `Icons` mixin schema — contributes the OPTIONAL `icons` array. (R-14.2-b, R-14.2-v) */
export const IconsSchema = z.object({
  /** OPTIONAL. A set of sized icons a consumer MAY display. Absent ⇒ no icons advertised. */
  icons: z.array(IconSchema).optional(),
});

export type Icons = z.infer<typeof IconsSchema>;

/** MIME types a consumer MUST support when rendering icons. (R-14.2-l, AC-20.19) */
export const REQUIRED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

/** MIME types a consumer SHOULD additionally support. (R-14.2-m, AC-20.20) */
export const RECOMMENDED_IMAGE_TYPES = new Set(['image/svg+xml', 'image/webp']);

/** Default allowlist: REQUIRED + RECOMMENDED types. (R-14.2-u) */
export const DEFAULT_IMAGE_ALLOWLIST = new Set([
  ...REQUIRED_IMAGE_TYPES,
  ...RECOMMENDED_IMAGE_TYPES,
]);

/** Error thrown when an icon URI or its content is rejected for security reasons. */
export class IconValidationError extends Error {
  constructor(
    public readonly src: string,
    reason: string,
  ) {
    super(`Icon rejected (${reason}): ${src}`);
    this.name = 'IconValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validates an icon `src` URI against the security rules (§14.2).
 *
 * A consumer MUST accept only `https:` URLs or `data:` URIs. (R-14.2-o, AC-20.22)
 * A consumer MUST reject `javascript:`, `file:`, `ftp:`, `ws:`, and other
 * unsafe schemes. (R-14.2-n, AC-20.21)
 *
 * Note: `http:` is also rejected because R-14.2-o's stricter rule governs
 * consumer acceptance and supersedes the field description in R-14.2-d.
 *
 * @throws {IconValidationError} When the scheme is not `https:` or `data:`.
 */
export function validateIconSrc(src: string): void {
  const colon = src.indexOf(':');
  if (colon === -1) {
    throw new IconValidationError(src, 'no URI scheme present');
  }
  const scheme = src.slice(0, colon + 1).toLowerCase();
  if (scheme !== 'https:' && scheme !== 'data:') {
    throw new IconValidationError(
      src,
      `scheme '${scheme}' is not permitted; only https: and data: are accepted`,
    );
  }
}

/** Returns `true` when `src` passes `validateIconSrc` without throwing. (AC-20.21, AC-20.22) */
export function isValidIconSrc(src: string): boolean {
  try {
    validateIconSrc(src);
    return true;
  } catch {
    return false;
  }
}

/** Magic byte signatures for supported image types. (R-14.2-s, AC-20.26) */
const MAGIC_BYTES: ReadonlyArray<{ mimeType: string; signature: readonly number[] }> = [
  { mimeType: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/gif', signature: [0x47, 0x49, 0x46] },
  { mimeType: 'image/webp', signature: [0x52, 0x49, 0x46, 0x46] }, // RIFF; verify WEBP at offset 8
];

/**
 * Detects the MIME type of an image from its magic bytes, treating the
 * declared MIME type as advisory only. (R-14.2-s, AC-20.26)
 *
 * Returns `null` when no known signature matches.
 */
export function detectMimeTypeFromMagicBytes(bytes: Uint8Array): string | null {
  for (const { mimeType, signature } of MAGIC_BYTES) {
    if (signature.every((b, i) => bytes[i] === b)) {
      if (mimeType === 'image/webp') {
        // RIFF container: bytes 8–11 must be 'WEBP' (0x57 0x45 0x42 0x50)
        const webpTag = [0x57, 0x45, 0x42, 0x50];
        if (!webpTag.every((b, i) => bytes[8 + i] === b)) continue;
      }
      return mimeType;
    }
  }
  // SVG: XML-based, no magic bytes — detect by leading text
  if (bytes.length >= 4) {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 100));
    const trimmed = head.trimStart().toLowerCase();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<svg')) {
      return 'image/svg+xml';
    }
  }
  return null;
}

/**
 * Validates an icon's byte content before rendering. (R-14.2-r – R-14.2-u, AC-20.25–28)
 *
 * 1. Detects the actual MIME type from magic bytes (ignores declared type).
 * 2. Rejects when the detected type is unknown.
 * 3. When `declaredMimeType` is provided, rejects on mismatch.
 * 4. Rejects types outside the `allowedTypes` set.
 *
 * @returns The detected MIME type on success.
 * @throws {IconValidationError} On any validation failure.
 */
export function validateIconBytes(
  bytes: Uint8Array,
  declaredMimeType?: string,
  allowedTypes: ReadonlySet<string> = DEFAULT_IMAGE_ALLOWLIST,
): string {
  const detected = detectMimeTypeFromMagicBytes(bytes);

  if (!detected) {
    throw new IconValidationError('(bytes)', 'unknown image type; cannot render');
  }

  if (!allowedTypes.has(detected)) {
    throw new IconValidationError('(bytes)', `image type ${detected} is not on the allowlist`);
  }

  if (declaredMimeType) {
    // Normalise image/jpg → image/jpeg before comparison
    const norm = (t: string) => (t === 'image/jpg' ? 'image/jpeg' : t);
    if (norm(detected) !== norm(declaredMimeType)) {
      throw new IconValidationError(
        '(bytes)',
        `MIME type mismatch: declared '${declaredMimeType}', detected '${detected}'`,
      );
    }
  }

  return detected;
}

// ─── Secure icon fetch (§14.2) ──────────────────────────────────────────────────

/** Result of {@link fetchIcon}: the validated image bytes, detected type, and final URL. */
export interface FetchIconResult {
  /** The fetched image bytes. */
  bytes: Uint8Array;
  /** The MIME type detected from magic bytes (R-14.2-s). */
  mimeType: string;
  /** The URL the bytes were ultimately read from (same origin as `src`). */
  finalUrl: string;
}

/** Options for {@link fetchIcon}. */
export interface FetchIconOptions {
  /** Override the `fetch` implementation (injection point for tests / non-global runtimes). */
  fetch?: typeof fetch;
  /** Allowed rendered MIME types; defaults to {@link DEFAULT_IMAGE_ALLOWLIST}. */
  allowedTypes?: ReadonlySet<string>;
  /** Maximum number of same-origin redirects to follow before giving up. Default 5. */
  maxRedirects?: number;
}

/** The HTTP status codes that denote a redirect. */
function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Decodes a `data:` URI's payload to bytes (base64 or percent-encoded). */
function decodeDataUri(uri: string): Uint8Array {
  const comma = uri.indexOf(',');
  if (comma === -1) throw new IconValidationError(uri, 'malformed data: URI (missing comma)');
  const meta = uri.slice('data:'.length, comma);
  const payload = uri.slice(comma + 1);
  if (/;base64$/i.test(meta)) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

/**
 * Securely fetches and validates an icon. Edge-friendly: built on Web-platform
 * `fetch` only (no `node:*`), so it runs on Node, Cloudflare Workers, Deno, and
 * browsers.
 *
 * Security rules enforced (§14.2):
 *  - `src` MUST be `https:` or `data:` (R-14.2-o, via {@link validateIconSrc}).
 *  - Redirects are followed manually; a redirect that changes the scheme or
 *    moves to a different origin MUST NOT be followed and is rejected
 *    (R-14.2-p, TV-20.12).
 *  - The request is credential-free: `credentials: 'omit'` and no `Authorization`
 *    or `Cookie` header is ever sent (R-14.2-q, TV-20.13).
 *  - The returned bytes are validated against the allowlist by magic bytes,
 *    ignoring the declared type (R-14.2-r – R-14.2-u, via {@link validateIconBytes}).
 *
 * @throws {IconValidationError} On a disallowed scheme, a cross-origin/scheme-change
 *   redirect, a non-2xx status, too many redirects, or invalid image bytes.
 */
export async function fetchIcon(src: string, options: FetchIconOptions = {}): Promise<FetchIconResult> {
  validateIconSrc(src); // R-14.2-o: only https: or data:
  const allowed = options.allowedTypes ?? DEFAULT_IMAGE_ALLOWLIST;

  // `data:` icons carry their bytes inline — no network request, nothing to redirect.
  if (src.toLowerCase().startsWith('data:')) {
    const bytes = decodeDataUri(src);
    return { bytes, mimeType: validateIconBytes(bytes, undefined, allowed), finalUrl: src };
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new IconValidationError(src, 'no global `fetch` available; pass options.fetch');
  }

  const origin = new URL(src);
  let current = origin;
  const maxRedirects = options.maxRedirects ?? 5;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // Credential-free request, manual redirect handling. (R-14.2-q, R-14.2-p)
    const response = await fetchImpl(current.toString(), {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: {},
    });

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new IconValidationError(src, `redirect ${response.status} without a Location header`);
      }
      const next = new URL(location, current);
      if (next.protocol !== origin.protocol) {
        throw new IconValidationError(
          src,
          `refusing redirect with scheme change '${origin.protocol}' → '${next.protocol}'`,
        );
      }
      if (next.origin !== origin.origin) {
        throw new IconValidationError(
          src,
          `refusing cross-origin redirect '${origin.origin}' → '${next.origin}'`,
        );
      }
      current = next;
      continue;
    }

    if (response.status >= 200 && response.status < 300) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes, mimeType: validateIconBytes(bytes, undefined, allowed), finalUrl: current.toString() };
    }

    throw new IconValidationError(src, `icon fetch failed with HTTP ${response.status}`);
  }

  throw new IconValidationError(src, `too many redirects (more than ${maxRedirects})`);
}
