/**
 * S44-RQ-14 (§28.5, R-28.5-k) — a client MUST verify via authorization-server
 * metadata that the server supports PKCE before proceeding, and MUST refuse to
 * proceed if support cannot be confirmed. (TV-44.14)
 */
import { describe, it, expect } from 'vitest';
import {
  confirmPkceSupport,
  isPkceSupportConfirmed,
  assertPkceSupportConfirmed,
  PkceSupportError,
  buildAuthorizationRequest,
} from '../../protocol/authorization-flow.js';

describe('confirmPkceSupport (R-28.5-k)', () => {
  it('confirms when metadata advertises S256', () => {
    expect(confirmPkceSupport({ code_challenge_methods_supported: ['S256'] })).toEqual({ ok: true });
    expect(isPkceSupportConfirmed({ code_challenge_methods_supported: ['plain', 'S256'] })).toBe(true);
  });

  it('refuses when the field is absent (support unconfirmable)', () => {
    const result = confirmPkceSupport({});
    expect(result.ok).toBe(false);
    expect(isPkceSupportConfirmed({})).toBe(false);
  });

  it('refuses when the field is present but lacks S256', () => {
    expect(confirmPkceSupport({ code_challenge_methods_supported: ['plain'] }).ok).toBe(false);
  });

  it('assertPkceSupportConfirmed throws PkceSupportError when unconfirmable', () => {
    expect(() => assertPkceSupportConfirmed({ code_challenge_methods_supported: ['S256'] })).not.toThrow();
    expect(() => assertPkceSupportConfirmed({})).toThrow(PkceSupportError);
  });
});

describe('buildAuthorizationRequest refuses when PKCE support is unconfirmable (TV-44.14)', () => {
  const record = {
    codeVerifier: 'v'.repeat(64),
    codeChallenge: 'challenge-value',
    codeChallengeMethod: 'S256' as const,
    state: 'state-123',
  };
  const base = {
    clientId: 'client-1',
    redirectUri: 'https://app.example/callback',
    resource: 'https://mcp.example.com',
    record: record as never,
  };

  it('throws when serverMetadata omits code_challenge_methods_supported', () => {
    expect(() => buildAuthorizationRequest({ ...base, serverMetadata: {} })).toThrow(PkceSupportError);
  });

  it('proceeds when serverMetadata confirms S256', () => {
    const params = buildAuthorizationRequest({
      ...base,
      serverMetadata: { code_challenge_methods_supported: ['S256'] },
    });
    expect(params.code_challenge_method).toBe('S256');
    expect(params.code_challenge).toBe('challenge-value');
  });

  it('still builds (back-compat) when no serverMetadata is supplied', () => {
    const params = buildAuthorizationRequest(base);
    expect(params.response_type).toBe('code');
  });
});
