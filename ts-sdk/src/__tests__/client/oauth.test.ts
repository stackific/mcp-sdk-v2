/**
 * C3 — OAuth 2.1 client flow (§23): PKCE, discovery, DCR, authorize URL, token
 * exchange, refresh, and the AuthProvider.
 */
import { describe, it, expect } from 'vitest';
import {
  createPkcePair,
  assertPkceSupported,
  discoverOAuthMetadata,
  registerClient,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  createAuthProvider,
  verifyAuthorizationRedirect,
} from '../../client/oauth.js';

const asMeta = {
  issuer: 'https://as.test',
  authorization_endpoint: 'https://as.test/authorize',
  token_endpoint: 'https://as.test/token',
  registration_endpoint: 'https://as.test/register',
  code_challenge_methods_supported: ['S256'],
};

describe('C3 — OAuth client', () => {
  it('createPkcePair produces an S256 verifier/challenge via Web Crypto', async () => {
    const p = await createPkcePair();
    expect(p.codeChallengeMethod).toBe('S256');
    expect(p.codeVerifier.length).toBeGreaterThan(20);
    expect(p.codeChallenge).not.toBe(p.codeVerifier);
  });

  it('assertPkceSupported gates on S256 (R-28.5-k)', () => {
    expect(() => assertPkceSupported({ code_challenge_methods_supported: ['S256'] } as never)).not.toThrow();
    expect(() => assertPkceSupported({ code_challenge_methods_supported: ['plain'] } as never)).toThrow();
    expect(() => assertPkceSupported({} as never)).toThrow();
  });

  it('discovers PRM → AS metadata', async () => {
    const fetchImpl = (async (url: string) =>
      url.includes('oauth-protected-resource')
        ? new Response(JSON.stringify({ resource: 'https://mcp.test/mcp', authorization_servers: ['https://as.test'] }))
        : new Response(JSON.stringify(asMeta))) as unknown as typeof fetch;
    const m = await discoverOAuthMetadata({ resource: 'https://mcp.test/mcp', fetch: fetchImpl });
    expect(m.issuer).toBe('https://as.test');
    expect(m.authorizationServer.token_endpoint).toBe('https://as.test/token');
  });

  it('discovers AS metadata path-aware for a path-component issuer (§23.17)', async () => {
    const tried: string[] = [];
    const fetchImpl = (async (url: string) => {
      tried.push(url);
      if (url.includes('oauth-protected-resource'))
        return new Response(JSON.stringify({ resource: 'https://mcp.test/mcp', authorization_servers: ['https://as.test/tenant1'] }));
      if (url === 'https://as.test/.well-known/oauth-authorization-server/tenant1')
        return new Response(JSON.stringify({ ...asMeta, issuer: 'https://as.test/tenant1' }));
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    const m = await discoverOAuthMetadata({ resource: 'https://mcp.test/mcp', fetch: fetchImpl });
    expect(m.issuer).toBe('https://as.test/tenant1');
    expect(tried).toContain('https://as.test/.well-known/oauth-authorization-server/tenant1'); // RFC 8414 path-aware
  });

  it('verifyAuthorizationRedirect enforces state, and iss when advertised (§23.5/§23.7)', () => {
    expect(() => verifyAuthorizationRedirect({ sentState: 's', returnedState: 's', issuer: 'https://as.test' })).not.toThrow();
    expect(() => verifyAuthorizationRedirect({ sentState: 's', returnedState: 'x', issuer: 'https://as.test' })).toThrow(/state/i);
    expect(() => verifyAuthorizationRedirect({ sentState: 's', returnedState: 's', issuer: 'https://as.test', issParameterSupported: true })).toThrow(/iss/i);
    expect(() =>
      verifyAuthorizationRedirect({ sentState: 's', returnedState: 's', issuer: 'https://as.test', returnedIss: 'https://evil.test', issParameterSupported: true }),
    ).toThrow(/iss|mix-up/i);
    expect(() =>
      verifyAuthorizationRedirect({ sentState: 's', returnedState: 's', issuer: 'https://as.test', returnedIss: 'https://as.test', issParameterSupported: true }),
    ).not.toThrow();
  });

  it('compares a PRESENT iss even when the flag is false/absent (mix-up defense, R-23.7-f)', () => {
    // A mismatched iss MUST be rejected regardless of authorization_response_iss_parameter_supported.
    expect(() =>
      verifyAuthorizationRedirect({ sentState: 's', returnedState: 's', issuer: 'https://as.test', returnedIss: 'https://evil.test' }),
    ).toThrow(/iss|mix-up/i);
    // A matching iss with no advertised flag passes.
    expect(() =>
      verifyAuthorizationRedirect({ sentState: 's', returnedState: 's', issuer: 'https://as.test', returnedIss: 'https://as.test' }),
    ).not.toThrow();
    // No iss + flag false/absent → proceed (nothing to compare).
    expect(() =>
      verifyAuthorizationRedirect({ sentState: 's', returnedState: 's', issuer: 'https://as.test' }),
    ).not.toThrow();
  });

  it('rejects an AS metadata issuer that does not match (mix-up defense, §23.3)', async () => {
    const fetchImpl = (async (url: string) =>
      url.includes('oauth-protected-resource')
        ? new Response(JSON.stringify({ resource: 'https://mcp.test/mcp', authorization_servers: ['https://as.test'] }))
        : new Response(JSON.stringify({ ...asMeta, issuer: 'https://evil.test' }))) as unknown as typeof fetch;
    await expect(discoverOAuthMetadata({ resource: 'https://mcp.test/mcp', fetch: fetchImpl })).rejects.toThrow(/mix-up|does not match/i);
  });

  it('registers (application_type), builds the authorize URL, exchanges, and refreshes — all audience-bound', async () => {
    const tokenBodies: URLSearchParams[] = [];
    let regBody: any;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      if (url.endsWith('/register')) {
        regBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ client_id: 'c1', client_secret: 's1' }), { status: 201 });
      }
      if (url.endsWith('/token')) {
        const body = new URLSearchParams(init.body as string);
        tokenBodies.push(body);
        return body.get('grant_type') === 'authorization_code'
          ? new Response(JSON.stringify({ access_token: 'AT', token_type: 'Bearer', expires_in: 3600, refresh_token: 'RT' }))
          : new Response(JSON.stringify({ access_token: 'AT2', token_type: 'Bearer', expires_in: 3600 }));
      }
      return new Response('{}');
    }) as unknown as typeof fetch;

    const reg = await registerClient(asMeta as never, { clientName: 'app', redirectUris: ['https://app/cb'], fetch: fetchImpl });
    expect(reg.clientId).toBe('c1');
    expect(regBody.application_type).toBe('web'); // REQUIRED (§23.15)

    const url = buildAuthorizeUrl(asMeta as never, {
      clientId: 'c1',
      redirectUri: 'https://app/cb',
      resource: 'https://mcp.test/mcp',
      state: 'st',
      codeChallenge: 'cc',
    });
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('resource=https');

    const tok = await exchangeAuthorizationCode(asMeta as never, {
      clientId: 'c1',
      code: 'CODE',
      codeVerifier: 'V',
      redirectUri: 'https://app/cb',
      resource: 'https://mcp.test/mcp',
      fetch: fetchImpl,
    });
    expect(tok.access_token).toBe('AT');
    expect(tokenBodies[0]!.get('resource')).toBe('https://mcp.test/mcp'); // audience binding (§23.6)

    // The AuthProvider refreshes transparently once the token is near expiry.
    let t = 0;
    const provider = createAuthProvider(
      tok,
      (rt) => refreshAccessToken(asMeta as never, { clientId: 'c1', refreshToken: rt, resource: 'https://mcp.test/mcp', fetch: fetchImpl }),
      { now: () => t },
    );
    expect(await provider.token()).toBe('AT');
    t = 3600 * 1000; // past expiry
    expect(await provider.token()).toBe('AT2');
    expect(tokenBodies[1]!.get('resource')).toBe('https://mcp.test/mcp'); // refresh keeps the binding (§23.9)
  });
});
