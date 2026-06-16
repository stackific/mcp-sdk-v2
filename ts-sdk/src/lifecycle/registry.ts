/**
 * Registry of currently deprecated features (§27.3) and deprecation signaling.
 *
 * The registry is a derived, consolidated view. Per-feature notices at the
 * cross-referenced defining sections are authoritative and resolve conflicts.
 *
 * New implementations SHOULD NOT adopt the registered deprecated features.
 * Existing implementations SHOULD migrate before each feature's earliest removal.
 * (R-27.3-a, R-27.3-b, AC-43.21, AC-43.22)
 */

import type { DeprecatedRegistryEntry } from './state.js';

/**
 * Consolidated registry of deprecated MCP features (§27.3).
 *
 * Features: Roots (§21), Sampling (§21), includeContext values (§21),
 * Logging (§15), io.modelcontextprotocol/logLevel key (§15),
 * Dynamic Client Registration (§23).
 *
 * Authoritative definitions are at the cross-referenced sections; the
 * full detail for each will be added as those stories (S32/S33/S23/S37)
 * are implemented.
 */
export const DEPRECATED_REGISTRY: ReadonlyArray<DeprecatedRegistryEntry> = [
  {
    feature: 'Roots capability',
    definedIn: '§21',
    migrationNote: 'No direct replacement; roots integration is now host-managed.',
    deprecatedSince: '2026-07-28',
    // §27.2: earliest removal is ≥ deprecatedSince + 12 months.
    earliestRemoval: '2027-07-28',
  },
  {
    feature: 'Sampling capability',
    definedIn: '§21',
    migrationNote: 'No direct replacement; use Elicitation (§20) for structured user input.',
    deprecatedSince: '2026-07-28',
    // §27.2: earliest removal is ≥ deprecatedSince + 12 months.
    earliestRemoval: '2027-07-28',
  },
  {
    feature: 'includeContext values "thisServer" and "allServers"',
    definedIn: '§21',
    migrationNote: 'No replacement; context management is now host-managed.',
    deprecatedSince: '2026-07-28',
    // §27.2: earliest removal is ≥ deprecatedSince + 12 months.
    earliestRemoval: '2027-07-28',
  },
  {
    feature: 'Logging capability',
    definedIn: '§15',
    migrationNote:
      'For stdio (§8), write diagnostics to stderr; for general observability, ' +
      'emit telemetry via an external observability framework.',
    deprecatedSince: '2026-07-28',
    // §27.2: earliest removal is ≥ deprecatedSince + 12 months.
    earliestRemoval: '2027-07-28',
  },
  {
    feature: 'io.modelcontextprotocol/logLevel _meta key',
    definedIn: '§15',
    migrationNote: 'See Logging capability migration note.',
    deprecatedSince: '2026-07-28',
    // §27.2: earliest removal is ≥ deprecatedSince + 12 months.
    earliestRemoval: '2027-07-28',
  },
  {
    feature: 'Dynamic Client Registration',
    definedIn: '§23',
    migrationNote: 'Use static OAuth 2.0 client registration instead.',
    deprecatedSince: '2026-07-28',
    // §27.2: earliest removal is ≥ deprecatedSince + 12 months.
    earliestRemoval: '2027-07-28',
  },
];

/**
 * Emits a runtime deprecation warning through an environment-idiomatic
 * out-of-band mechanism (stderr or console.warn). (R-27.4-d, AC-43.26)
 *
 * IMPORTANT: This function MUST NOT be called in a way that injects the
 * warning into the protocol wire format. It is advisory only and does not
 * alter message semantics. (R-27.4-e, AC-43.27)
 *
 * @param feature - The name of the deprecated feature being exercised.
 * @param migration - The documented migration guidance.
 */
export function emitDeprecationWarning(feature: string, migration: string): void {
  // console.warn routes to stderr in Node and is the standard out-of-band
  // warning channel across runtimes (Node, browser, workers).
  console.warn(`[MCP] Deprecated feature used: "${feature}". Migration: ${migration}`);
}

/**
 * Looks up a feature in the deprecated registry by name.
 * Returns the entry or `undefined` when not found. (§27.3)
 */
export function findDeprecatedEntry(
  feature: string,
): DeprecatedRegistryEntry | undefined {
  return DEPRECATED_REGISTRY.find((e) => e.feature === feature);
}
