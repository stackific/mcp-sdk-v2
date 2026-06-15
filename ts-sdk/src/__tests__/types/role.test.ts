/**
 * Tests for Role enumeration — S21 §14.7.
 *
 * AC coverage:
 *  AC-21.19 (R-14.7-a) — only "user" and "assistant" are valid; others rejected
 */

import { describe, it, expect } from 'vitest';
import { RoleSchema } from '../../types/role.js';

describe('RoleSchema (AC-21.19 — R-14.7-a)', () => {
  it('accepts "user"', () => {
    expect(RoleSchema.safeParse('user').success).toBe(true);
  });

  it('accepts "assistant"', () => {
    expect(RoleSchema.safeParse('assistant').success).toBe(true);
  });

  it('rejects "system" — not a valid Role', () => {
    expect(RoleSchema.safeParse('system').success).toBe(false);
  });

  it('rejects "User" — case-sensitive', () => {
    expect(RoleSchema.safeParse('User').success).toBe(false);
  });

  it('rejects "ASSISTANT" — case-sensitive', () => {
    expect(RoleSchema.safeParse('ASSISTANT').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(RoleSchema.safeParse('').success).toBe(false);
  });

  it('rejects a number', () => {
    expect(RoleSchema.safeParse(1).success).toBe(false);
  });

  it('rejects null', () => {
    expect(RoleSchema.safeParse(null).success).toBe(false);
  });
});
