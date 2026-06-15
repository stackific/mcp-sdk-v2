/**
 * Feature lifecycle status (§27, R-1.3-b, R-2.2-f – R-2.2-h).
 *
 * A feature with status `deprecated` remains defined and MUST still be accepted
 * by receivers, but SHOULD NOT be relied upon by new implementations.
 */
export type FeatureStatus = typeof FeatureStatus[keyof typeof FeatureStatus];
export const FeatureStatus = {
  Active: 'active',
  Deprecated: 'deprecated',
} as const;
