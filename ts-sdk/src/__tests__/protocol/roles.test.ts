/**
 * Tests for the protocol roles model — S01 §1.1, §2.2.
 *
 * The roles model is enforced primarily at the TypeScript type level. These
 * runtime tests verify the exported constant values are what callers can
 * depend on (e.g., when comparing against a received role string). (AC-01.1)
 */

import { describe, it, expect } from 'vitest';
import { McpRole } from '../../protocol/roles.js';

describe('McpRole (§1.1, §2.2 — AC-01.1)', () => {
  it('Client has the wire value "client"', () => {
    expect(McpRole.Client).toBe('client');
  });

  it('Server has the wire value "server"', () => {
    expect(McpRole.Server).toBe('server');
  });

  it('Client and Server are distinct values', () => {
    expect(McpRole.Client).not.toBe(McpRole.Server);
  });

  it('covers exactly the two wire roles (host is not a wire role)', () => {
    const roles = Object.values(McpRole);
    expect(roles).toHaveLength(2);
    expect(roles).not.toContain('host');
  });
});
