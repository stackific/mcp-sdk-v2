/**
 * `BaseMetadata` — the shared name/title identity mixin (§14.1).
 *
 * `BaseMetadata` is not sent as a standalone wire message. It contributes
 * `name` (REQUIRED) and `title` (OPTIONAL) to composing types such as
 * `Implementation`, `Tool`, `Resource`, and `Prompt`.
 *
 * Display-name precedence (R-14.1-c, R-14.1-d, R-14.1-e):
 *   1. `title`                         — when present
 *   2. `annotations.title` (tool-only) — when present and title absent
 *   3. `name`                          — fallback
 */

import { z } from 'zod';

/**
 * `BaseMetadata` schema — the minimal name/title identity pair (§14.1).
 * All §14 field names are case-sensitive and MUST be reproduced exactly. (R-14-a)
 */
export const BaseMetadataSchema = z.object({
  /** REQUIRED. Programmatic/logical identifier; stable key for code and protocol references. (R-14.1-a) */
  name: z.string(),
  /** OPTIONAL. Human display name for end users, including non-experts. (R-14.1-b) */
  title: z.string().optional(),
});

export type BaseMetadata = z.infer<typeof BaseMetadataSchema>;

/**
 * Resolves the display name to show a human user, applying the spec precedence
 * rule (§14.1, R-14.1-c, R-14.1-d, R-14.1-e, AC-20.4, AC-20.5, AC-20.6).
 *
 *  1. Returns `title` when it is a non-empty string.
 *  2. Returns `annotationsTitle` when provided and non-empty (tool descriptors only).
 *  3. Falls back to `name`.
 *
 * @param name - The programmatic identifier (always present).
 * @param title - The human display name (optional).
 * @param annotationsTitle - Tool-only `annotations.title` (optional; defined in §16 / S24).
 */
export function resolveDisplayName(
  name: string,
  title?: string,
  annotationsTitle?: string,
): string {
  if (title) return title;
  if (annotationsTitle) return annotationsTitle;
  return name;
}
