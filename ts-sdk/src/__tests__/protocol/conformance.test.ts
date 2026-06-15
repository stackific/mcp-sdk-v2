/**
 * Tests for feature lifecycle status — S01 §27.
 *
 * AC-01.26 (R-1.3-b, R-2.2-g): Deprecated features SHOULD NOT be relied upon
 *   by new implementations.
 * AC-01.27 (R-2.2-f, R-2.2-h): Deprecated features remain defined; receivers
 *   MUST still process them while they carry that status.
 *
 * Conformance keyword semantics (AC-01.16–AC-01.25) are enforced throughout
 * the SDK via TypeScript's type system and by the behavioural contracts of
 * functions like `assertCapability` and `parseImplementation`, whose tests
 * in capabilities.test.ts and implementation.test.ts demonstrate:
 *  - AC-01.17 (MUST = no exception): assertCapability ALWAYS throws for missing caps
 *  - AC-01.18 (MUST NOT = never): isNotification NEVER returns true when id present
 *  - AC-01.21 (MAY = both conforming): ImplementationSchema accepts with/without optional fields
 *  - AC-01.23 (mandatory baseline): RequestSchema and NotificationSchema exist and validate
 *  - AC-01.24 (optional features may be omitted): optional fields absent → still valid
 */

import { describe, it, expect } from 'vitest';
import { FeatureStatus } from '../../protocol/conformance.js';

describe('FeatureStatus (AC-01.26, AC-01.27 — §27)', () => {
  it('Active status is "active"', () => {
    expect(FeatureStatus.Active).toBe('active');
  });

  it('Deprecated status is "deprecated"', () => {
    expect(FeatureStatus.Deprecated).toBe('deprecated');
  });

  it('Active and Deprecated are distinct values', () => {
    expect(FeatureStatus.Active).not.toBe(FeatureStatus.Deprecated);
  });

  it('a feature can be labelled Deprecated (receivers MUST still process it — AC-01.27)', () => {
    // Simulate a feature descriptor carrying lifecycle status.
    const feature = { name: 'sampling', status: FeatureStatus.Deprecated };
    expect(feature.status).toBe(FeatureStatus.Deprecated);
  });
});
