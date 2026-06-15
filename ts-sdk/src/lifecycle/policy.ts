/**
 * Deprecation policy enforcement (§27.2).
 *
 * Enforces the state-machine transitions and minimum deprecation windows:
 *   - Active → Removed is FORBIDDEN (R-27.2-b, AC-43.6).
 *   - Standard minimum window: 12 calendar months (R-27.2-c, AC-43.7).
 *   - Security-expedited minimum window: 90 days (R-27.2-l, AC-43.16).
 *   - A Deprecated feature MAY be restored to Active (R-27.2-n, AC-43.18).
 *   - On re-deprecation the window is measured afresh (R-27.2-p, AC-43.20).
 */

import { LifecycleState } from './state.js';

/** Minimum deprecation window for a standard (non-expedited) removal. (R-27.2-c) */
export const STANDARD_DEPRECATION_MONTHS = 12;

/** Minimum days for a security-expedited deprecation window. (R-27.2-l) */
export const EXPEDITED_MINIMUM_DAYS = 90;

/**
 * Returns `true` when the transition from `from` to `to` is permitted.
 *
 * Permitted:  Active → Deprecated, Deprecated → Active, Deprecated → Removed.
 * Forbidden:  Active → Removed (R-27.2-b), any transition out of Removed.
 */
export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  if (from === to) return false;
  if (from === LifecycleState.Active && to === LifecycleState.Removed) return false;
  if (from === LifecycleState.Removed) return false;
  return true;
}

/**
 * Asserts that the transition from `from` to `to` is permitted.
 * @throws {Error} When the transition is forbidden.
 */
export function assertValidTransition(from: LifecycleState, to: LifecycleState): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Forbidden lifecycle transition: ${from} → ${to}. ` +
      'A feature MUST pass through Deprecated before it can be Removed (R-27.2-a, R-27.2-b).',
    );
  }
}

/**
 * Adds `months` calendar months to `date` using UTC arithmetic to avoid
 * local-timezone distortion. Day is clamped to the last valid day of the
 * target month when the original day overflows (e.g. Jan 31 + 1 → Feb 28).
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const totalMonths = date.getUTCMonth() + months;
  const newYear = date.getUTCFullYear() + Math.floor(totalMonths / 12);
  const newMonth = totalMonths % 12;
  const result = new Date(Date.UTC(newYear, newMonth, date.getUTCDate()));
  // When the day overflowed into the next month, roll back to last day of target month.
  if (result.getUTCMonth() !== newMonth) {
    result.setUTCDate(0);
  }
  return result;
}

/**
 * Returns `true` when a Deprecated feature is eligible for removal, meaning
 * the minimum window has elapsed. (R-27.2-c, R-27.2-l, AC-43.7, AC-43.16)
 *
 * Eligibility is a necessary condition for removal, not a mandate — a feature
 * MAY remain Deprecated indefinitely. (R-27.2-d, AC-43.8)
 *
 * @param deprecatedSince - The date the feature first became Deprecated.
 * @param now - The date to test against (usually the current date).
 * @param expedited - When `true`, applies the 90-day minimum instead of 12 months.
 */
export function isEligibleForRemoval(
  deprecatedSince: Date,
  now: Date,
  expedited = false,
): boolean {
  if (expedited) {
    const minMs = EXPEDITED_MINIMUM_DAYS * 24 * 60 * 60 * 1000;
    return now.getTime() - deprecatedSince.getTime() >= minMs;
  }
  const earliest = addCalendarMonths(deprecatedSince, STANDARD_DEPRECATION_MONTHS);
  return now.getTime() >= earliest.getTime();
}
