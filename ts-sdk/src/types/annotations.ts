/**
 * `Annotations` — optional, untrusted hints attached to content blocks and
 * resource descriptors (§14.6).
 *
 * Trust model (R-14.6-f): consumers MUST NOT use annotation values for
 * security or correctness decisions. They are advisory only and MAY influence
 * presentation, ordering, or context-inclusion. (R-14.6-g)
 */

import { z } from 'zod';
import { RoleSchema } from './role.js';

/**
 * Optional hints about a piece of content or a resource. (§14.6, R-14.6-a)
 *
 * All fields are OPTIONAL; an absent or empty `Annotations` object is valid.
 * `.passthrough()` allows forward-compatible protocol extensions.
 */
export const AnnotationsSchema = z.object({
  /**
   * OPTIONAL. The intended audience for the annotated object, as an array of
   * `Role` values. MAY contain multiple entries (e.g. `["user", "assistant"]`).
   * (R-14.6-b)
   */
  audience: z.array(RoleSchema).optional(),

  /**
   * OPTIONAL. How important the annotated data is for operating the server.
   * MUST be in the inclusive range 0..1, where 1 means most important and
   * 0 means least important. (R-14.6-c, R-14.6-d)
   */
  priority: z.number().min(0).max(1).optional(),

  /**
   * OPTIONAL. The moment the resource was last modified, as an ISO 8601
   * timestamp string (e.g. `"2025-01-12T15:00:58Z"`). (R-14.6-e)
   */
  lastModified: z.string().optional(),
}).passthrough();

export type Annotations = z.infer<typeof AnnotationsSchema>;
