/**
 * Feature lifecycle state model (§27.1).
 *
 * Every governed protocol feature is in exactly one of three states.
 * The allowed transitions enforce the policy in §27.2:
 *   Active → Deprecated (always permitted)
 *   Deprecated → Active  (restoration permitted, R-27.2-n)
 *   Deprecated → Removed (permitted after window elapses, R-27.2-a)
 *   Active → Removed     FORBIDDEN (R-27.2-b)
 */

/** The three possible lifecycle states of a protocol feature (§27.1). */
export type LifecycleState = typeof LifecycleState[keyof typeof LifecycleState];
export const LifecycleState = {
  /** Fully supported and recommended; implemented exactly as specified. (R-27.1-a) */
  Active: 'active',
  /**
   * Still defined and functional; discouraged for new use; scheduled for
   * eventual removal; carries a migration note. (R-27.1-b)
   */
  Deprecated: 'deprecated',
  /**
   * Not defined by the document; carries no meaning; imposes no obligation.
   * A Removed feature is simply absent from the spec text and registries.
   */
  Removed: 'removed',
} as const;

/**
 * Per-feature lifecycle bookkeeping (§27.1, §27.2).
 * This is a conceptual governance record, not a wire type.
 */
export interface LifecycleRecord {
  /** Identifier of the governed feature (method, capability, type, etc.). */
  feature: string;
  /** Current lifecycle state. */
  state: LifecycleState;
  /** ISO-8601 date when the feature first became Deprecated. Present only when Deprecated. */
  deprecatedSince?: string;
  /** Protocol revision on or after which the feature becomes eligible for removal. (R-27.2-c) */
  earliestRemoval?: string;
  /** Documented migration path, or `"none required"`. REQUIRED when Deprecated. (R-27.2-g) */
  migration?: string | 'none required';
  /** Whether a security-driven shortened window applies (minimum 90 days). (R-27.2-k, R-27.2-l) */
  expedited?: boolean;
}

/**
 * One row of the derived registry of deprecated features (§27.3).
 * The per-feature notices at the authoritative defining sections resolve conflicts.
 */
export interface DeprecatedRegistryEntry {
  /** Name of the deprecated feature. */
  feature: string;
  /** Section reference where the feature is authoritatively defined. */
  definedIn: string;
  /** One-line migration guidance. (R-27.2-g) */
  migrationNote: string;
  /** The revision in which the feature first became Deprecated. (R-27.2) */
  deprecatedSince: string;
  /**
   * Protocol revision on or after which removal is eligible. Per §27.2 this MUST
   * be at least 12 months after {@link deprecatedSince}, so the removal-window
   * rule can be evaluated against this row (see `lifecycle/policy.ts`). (R-27.2)
   */
  earliestRemoval: string;
}
