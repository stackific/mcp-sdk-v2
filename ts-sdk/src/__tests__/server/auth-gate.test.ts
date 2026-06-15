/**
 * S5 — bearerAuthGate audience binding (§23.6/§23.8/§23.19) and the
 * `403 insufficient_scope` step-up challenge (§23.18). FINAL_REVIEW C10.
 */
import { describe, it, expect } from 'vitest';
import { bearerAuthGate } from '../../server/auth.js';

const req = (token?: string): Request =>
  new Request('http://srv.test/mcp', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const gate = bearerAuthGate({
  resourceMetadataUrl: 'https://srv.test/.well-known/oauth-protected-resource',
  expectedAudience: 'https://srv.test/mcp',
  requiredScopes: ['mcp:read'],
  validate: (token) => {
    if (token === 'good') return { sub: 'u1', aud: 'https://srv.test/mcp', scope: 'mcp:read mcp:write' };
    if (token === 'wrong-aud') return { sub: 'u1', aud: 'https://other.test/mcp', scope: 'mcp:read' };
    if (token === 'no-scope') return { sub: 'u1', aud: 'https://srv.test/mcp', scope: 'mcp:write' };
    return null;
  },
});

describe('bearerAuthGate — audience + scope (§23)', () => {
  it('accepts a token with the right audience and scope', async () => {
    const v = await gate(req('good'));
    expect(v.ok).toBe(true);
  });

  it('401 invalid_token when no token is presented', async () => {
    const v = (await gate(req())) as any;
    expect(v.ok).toBe(false);
    expect(v.status).toBe(401);
    expect(v.wwwAuthenticate).toMatch(/invalid_token/);
  });

  it('401 invalid_token when the audience does not match (§23.6)', async () => {
    const v = (await gate(req('wrong-aud'))) as any;
    expect(v.status).toBe(401);
    expect(v.body.error).toBe('invalid_token');
  });

  it('403 insufficient_scope step-up when a required scope is missing (§23.18)', async () => {
    const v = (await gate(req('no-scope'))) as any;
    expect(v.status).toBe(403);
    expect(v.body.error).toBe('insufficient_scope');
    expect(v.wwwAuthenticate).toMatch(/insufficient_scope/);
    expect(v.wwwAuthenticate).toMatch(/resource_metadata/);
    expect(v.wwwAuthenticate).toMatch(/scope=/);
  });
});
