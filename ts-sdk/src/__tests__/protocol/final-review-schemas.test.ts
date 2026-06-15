/**
 * FINAL_REVIEW protocol-schema fixes: M5 (sampling content union excludes
 * resource_link/resource, §21.2.6) and M6 (numeric request id MUST be a safe
 * integer, §2.5).
 */
import { describe, it, expect } from 'vitest';
import { SamplingMessageContentBlockSchema } from '../../protocol/sampling.js';
import { RequestIdSchema } from '../../jsonrpc/framing.js';

describe('FINAL_REVIEW — protocol schema fixes', () => {
  it('M5 — sampling content excludes resource_link / embedded resource (§21.2.6)', () => {
    expect(SamplingMessageContentBlockSchema.safeParse({ type: 'text', text: 'hi' }).success).toBe(true);
    expect(SamplingMessageContentBlockSchema.safeParse({ type: 'resource_link', uri: 'file:///x', name: 'x' }).success).toBe(false);
    expect(
      SamplingMessageContentBlockSchema.safeParse({ type: 'resource', resource: { uri: 'file:///x', text: 'y' } }).success,
    ).toBe(false);
  });

  it('M6 — a numeric request id MUST be an IEEE-754 safe integer (§2.5)', () => {
    expect(RequestIdSchema.safeParse(1).success).toBe(true);
    expect(RequestIdSchema.safeParse('srv-1').success).toBe(true);
    expect(RequestIdSchema.safeParse(1.5).success).toBe(false);
    expect(RequestIdSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });
});
