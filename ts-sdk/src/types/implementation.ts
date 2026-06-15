/**
 * Full `Implementation` descriptor (§14.3).
 *
 * Supersedes the minimal S01 stub in `src/protocol/implementation.ts`,
 * which now re-exports from here.
 *
 * `Implementation` composes `BaseMetadata` (name/title) and `Icons` (icons),
 * and adds `version` (REQUIRED), `description`, and `websiteUrl` (both OPTIONAL).
 *
 * Wire examples:
 *
 * Minimal (required fields only):
 *   { "name": "example-client", "version": "0.1.0" }
 *
 * Fully populated:
 *   {
 *     "name": "example-server",
 *     "title": "Example MCP Server",
 *     "version": "2.4.1",
 *     "description": "Provides filesystem and search tools.",
 *     "websiteUrl": "https://example.com/mcp",
 *     "icons": [{ "src": "https://example.com/icon.png", "mimeType": "image/png" }]
 *   }
 */

import { z } from 'zod';
import { IconSchema } from './icon.js';

export { IconSchema } from './icon.js';
export type { Icon, IconTheme, Icons } from './icon.js';

/**
 * Full `Implementation` schema (§14.3, R-14.3-a – R-14.3-f).
 *
 * Required: `name`, `version`.
 * Optional: `title`, `icons`, `description`, `websiteUrl`.
 * Unknown properties are passed through (§2.3.4 forward-compatibility rule).
 */
export const ImplementationSchema = z.object({
  /** REQUIRED. Programmatic identifier of the implementation. (R-14.3-a) */
  name: z.string(),
  /** OPTIONAL. Human display name. (R-14.3-b) */
  title: z.string().optional(),
  /** OPTIONAL. Icons representing the implementation. (R-14.3-c) */
  icons: z.array(IconSchema).optional(),
  /** REQUIRED. Version string; format is implementation-defined. (R-14.3-d) */
  version: z.string(),
  /** OPTIONAL. Human-readable description of what this implementation does. (R-14.3-e) */
  description: z.string().optional(),
  /** OPTIONAL. URL of the implementation's website. (R-14.3-f) */
  websiteUrl: z.string().optional(),
}).passthrough();

export type Implementation = z.infer<typeof ImplementationSchema>;

/**
 * Parses and validates an `Implementation` descriptor.
 * Throws `ZodError` when `name` or `version` is absent or not a string.
 * Unknown properties are passed through without error. (§2.3.4)
 */
export function parseImplementation(value: unknown): Implementation {
  return ImplementationSchema.parse(value);
}
