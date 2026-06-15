/**
 * `Role` — the two-value conversation-participant enumeration (§14.7).
 *
 * Used by `Annotations.audience` and by prompt messages (S28).
 * The set is closed: only `"user"` and `"assistant"` are valid. (R-14.7-a)
 */

import { z } from 'zod';

/** Names a sender or recipient in a conversation. (§14.7, R-14.7-a) */
export const RoleSchema = z.enum(['user', 'assistant']);

export type Role = z.infer<typeof RoleSchema>;
