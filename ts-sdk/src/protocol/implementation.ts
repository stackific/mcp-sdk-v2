/**
 * Re-exports the canonical `Implementation` descriptor from the types module.
 *
 * The full shape (including `description`, `websiteUrl`, and the complete `Icon`
 * structure) is defined in §14.3 and lives in `src/types/implementation.ts` (S20).
 * This module is kept for import-path stability; prefer importing from
 * `@stackific/mcp-sdk-ts` or `./types` directly.
 */

export {
  ImplementationSchema,
  parseImplementation,
  IconSchema,
  type Implementation,
  type Icon,
  type IconTheme,
  type Icons,
} from '../types/implementation.js';
