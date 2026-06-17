/**
 * Tests for S35 — Authorization I: model, applicability & metadata discovery (§23.1–§23.3).
 *
 * AC coverage:
 *  AC-35.1  (R-23.1-a)                          — authorization OPTIONAL; when supported, §23 applies
 *  AC-35.2  (R-23.1-b)                          — stdio MUST NOT use §23; env-based credentials
 *  AC-35.3  (R-23.1-c)                          — non-HTTP/non-stdio → best practices, outside §23
 *  AC-35.4  (R-23.1-d)                          — AS implements OAuth 2.1 for confidential + public
 *  AC-35.5  (R-23.1-e)                          — access-token handling conforms to OAuth 2.1 (HTTP bearer)
 *  AC-35.6  (R-23.1-f)                          — custom auth is outside §23; other rules still apply
 *  AC-35.7  (R-23.1-g)                          — the three roles each behave as specified
 *  AC-35.8  (R-23.1-h)                          — PRM may list ≥1 AS (co-hosted or separate)
 *  AC-35.9  (R-23.1-i/j/k/l)                    — per-issuer credential isolation + re-register
 *  AC-35.10 (R-23.1-m/n/o)                      — canonical resource id: endpoint, https/loopback, no fragment
 *  AC-35.11 (R-23.1-p)                          — uppercase scheme/host accepted (canonical = lowercase)
 *  AC-35.12 (R-23.1-q/r/s)                      — most specific URI; path when needed; no trailing slash
 *  AC-35.13 (R-23.1-t/u/v)                      — 401 + Bearer WWW-Authenticate + resource_metadata
 *  AC-35.14 (R-23.1-w)                          — 401 includes scope when determinable
 *  AC-35.15 (R-23.1-x/y)                        — challenged scope authoritative; no subset/superset
 *  AC-35.16 (R-23.1-z)                          — client parses WWW-Authenticate + reacts to 401
 *  AC-35.17 (R-23.1-aa/ab/ac/ad)                — 403 insufficient_scope challenge shape
 *  AC-35.18 (R-23.2-a/b/c)                      — server publishes PRM; both discovery mechanisms
 *  AC-35.19 (R-23.2-d)                          — header resource_metadata URI is used
 *  AC-35.20 (R-23.2-e/f)                        — well-known order: path-aware then root; first valid
 *  AC-35.21 (R-23.2-g)                          — neither + no header → abort / fallback (empty)
 *  AC-35.22 (R-23.2-h/i/j)                      — PRM resource match; ≥1 AS; select an AS
 *  AC-35.23 (R-23.3-a/b)                        — AS provides ≥1 mechanism; client supports both
 *  AC-35.24 (R-23.3-c)                          — AS well-known priority order, with/without path
 *  AC-35.25 (R-23.3-d/e)                        — issuer-match accept; mismatch MUST NOT use
 *  AC-35.26 (R-23.3-f/g/h)                      — issuer/authorization_endpoint/token_endpoint required
 *  AC-35.27 (R-23.3-i/j)                        — response_types includes "code"; PKCE includes "S256"
 */

import { describe, it, expect } from 'vitest';
import {
  // applicability
  authorizationAppliesTo,
  authorizationForbiddenFor,
  credentialConveyanceFor,
  type TransportFamily,
  // status / header constants
  UNAUTHORIZED_STATUS,
  AUTHORIZATION_FORBIDDEN_STATUS,
  AUTHORIZATION_BAD_REQUEST_STATUS,
  WWW_AUTHENTICATE_HEADER,
  BEARER_AUTH_SCHEME,
  INSUFFICIENT_SCOPE_ERROR,
  // credential isolation
  CredentialStore,
  // canonical resource id
  canonicalizeResourceIdentifier,
  isValidCanonicalResourceIdentifier,
  resourceIdentifiersEqual,
  stripDefaultTrailingSlash,
  // challenge
  buildWwwAuthenticateValue,
  buildUnauthorizedResponse,
  buildInsufficientScopeResponse,
  parseWwwAuthenticate,
  challengeFromHeaders,
  challengedScopes,
  isInsufficientScopeChallenge,
  // protected resource metadata
  ProtectedResourceMetadataSchema,
  isProtectedResourceMetadata,
  validateProtectedResourceMetadata,
  selectAuthorizationServer,
  PROTECTED_RESOURCE_WELL_KNOWN,
  protectedResourceWellKnownUris,
  resolveProtectedResourceMetadataUris,
  // authorization server metadata
  AuthorizationServerMetadataSchema,
  isAuthorizationServerMetadata,
  validateAuthorizationServerMetadata,
  OAUTH_AS_WELL_KNOWN,
  OPENID_CONFIGURATION_WELL_KNOWN,
  authorizationServerWellKnownUris,
} from '../../protocol/authorization.js';

const PRM_URI = 'https://mcp.example.com/.well-known/oauth-protected-resource';

// ─── AC-35.1 — authorization OPTIONAL; HTTP-governed ───────────────────────────

describe('AC-35.1 applicability (R-23.1-a)', () => {
  it('applies to HTTP-based transports', () => {
    expect(authorizationAppliesTo('http')).toBe(true);
  });

  it('does not govern non-HTTP transports (authorization is OPTIONAL there)', () => {
    expect(authorizationAppliesTo('stdio')).toBe(false);
    expect(authorizationAppliesTo('other')).toBe(false);
  });
});

// ─── AC-35.2 — stdio MUST NOT use §23 ──────────────────────────────────────────

describe('AC-35.2 stdio forbidden, env credentials (R-23.1-b)', () => {
  it('marks stdio as forbidden from the §23 flow', () => {
    expect(authorizationForbiddenFor('stdio')).toBe(true);
    expect(authorizationAppliesTo('stdio')).toBe(false);
  });

  it('conveys stdio credentials via the child-process environment', () => {
    expect(credentialConveyanceFor('stdio')).toBe('environment');
  });
});

// ─── AC-35.3 — other transports: best practices, outside §23 ───────────────────

describe('AC-35.3 other transports (R-23.1-c)', () => {
  it('does not govern an other transport and is not the forbidden case', () => {
    const t: TransportFamily = 'other';
    expect(authorizationAppliesTo(t)).toBe(false);
    expect(authorizationForbiddenFor(t)).toBe(false);
  });

  it('uses that transport\'s own best-practice credential mechanism', () => {
    expect(credentialConveyanceFor('other')).toBe('best-practice');
  });
});

// ─── AC-35.4 — AS implements OAuth 2.1 for both client types ────────────────────

describe('AC-35.4 authorization-server OAuth 2.1 (R-23.1-d)', () => {
  // The AS role is external; here we assert the metadata it must publish supports
  // both confidential and public clients via token_endpoint_auth_methods_supported
  // (e.g. "none" for public, "private_key_jwt" for confidential), which the schema accepts.
  it('accepts AS metadata advertising public and confidential client auth methods', () => {
    const meta = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
    };
    expect(isAuthorizationServerMetadata(meta)).toBe(true);
  });
});

// ─── AC-35.5 — access-token handling conforms to OAuth 2.1 (HTTP bearer) ───────

describe('AC-35.5 access-token handling (R-23.1-e)', () => {
  it('uses the bearer mechanism on HTTP requests', () => {
    expect(credentialConveyanceFor('http')).toBe('bearer');
  });
});

// ─── AC-35.6 — custom auth outside §23 ─────────────────────────────────────────

describe('AC-35.6 custom auth strategy (R-23.1-f)', () => {
  it('a custom strategy does not change which transport §23 governs', () => {
    // Using a custom strategy does not relieve other requirements; the predicate
    // still reports HTTP as the only §23-governed family.
    expect(authorizationAppliesTo('http')).toBe(true);
    expect(authorizationAppliesTo('other')).toBe(false);
  });
});

// ─── AC-35.7 — the three roles each behave as specified ────────────────────────

describe('AC-35.7 roles (R-23.1-g)', () => {
  it('server publishes PRM (resource server), AS publishes its metadata, client parses challenges', () => {
    // Resource server role: emits a valid 401 challenge pointing at its PRM.
    const challenge = buildUnauthorizedResponse({ resourceMetadata: PRM_URI });
    expect(challenge.status).toBe(401);
    // AS role: publishes valid AS metadata.
    expect(
      isAuthorizationServerMetadata({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      }),
    ).toBe(true);
    // Client role: parses the server's challenge.
    const parsed = parseWwwAuthenticate(challenge.headers[WWW_AUTHENTICATE_HEADER]);
    expect(parsed?.resourceMetadata).toBe(PRM_URI);
  });
});

// ─── AC-35.8 — PRM may list one or more AS (co-hosted or separate) ─────────────

describe('AC-35.8 PRM lists ≥1 AS (R-23.1-h)', () => {
  it('accepts a single authorization server', () => {
    expect(
      isProtectedResourceMetadata({
        resource: 'https://mcp.example.com/mcp',
        authorization_servers: ['https://auth.example.com'],
      }),
    ).toBe(true);
  });

  it('accepts multiple authorization servers (separate entities)', () => {
    expect(
      isProtectedResourceMetadata({
        resource: 'https://mcp.example.com/mcp',
        authorization_servers: ['https://auth1.example.com', 'https://auth2.example.com'],
      }),
    ).toBe(true);
  });
});

// ─── AC-35.9 — per-issuer credential isolation ─────────────────────────────────

describe('AC-35.9 per-issuer credential isolation (R-23.1-i/j/k/l)', () => {
  it('stores separate registration state keyed by issuer (R-23.1-i)', () => {
    const store = new CredentialStore();
    store.register({ issuer: 'https://auth1.example.com', clientId: 'c1', accessToken: 't1' });
    store.register({ issuer: 'https://auth2.example.com', clientId: 'c2', accessToken: 't2' });
    expect(store.credentialsFor('https://auth1.example.com')?.clientId).toBe('c1');
    expect(store.credentialsFor('https://auth2.example.com')?.clientId).toBe('c2');
  });

  it('does not return one server\'s credentials for another issuer (R-23.1-j)', () => {
    const store = new CredentialStore();
    store.register({ issuer: 'https://auth1.example.com', accessToken: 't1' });
    expect(store.credentialsFor('https://auth2.example.com')).toBeUndefined();
    expect(store.hasCredentialsFor('https://auth2.example.com')).toBe(false);
  });

  it('requires re-registration when the indicated AS changes (R-23.1-k/l)', () => {
    const store = new CredentialStore();
    store.register({ issuer: 'https://auth1.example.com', clientId: 'c1' });
    // Indicated AS changed from auth1 → auth2: MUST NOT reuse; MUST re-register.
    expect(store.needsReregistration('https://auth1.example.com', 'https://auth2.example.com')).toBe(true);
    // Same indicated AS, with credentials present: no re-registration needed.
    expect(store.needsReregistration('https://auth1.example.com', 'https://auth1.example.com')).toBe(false);
    // No credentials yet for the (unchanged) issuer → must register.
    expect(store.needsReregistration(undefined, 'https://auth2.example.com')).toBe(true);
  });
});

// ─── AC-35.10 — canonical resource identifier ──────────────────────────────────

describe('AC-35.10 canonical resource identifier (R-23.1-m/n/o)', () => {
  it('accepts an absolute https endpoint URL and returns it as the canonical id', () => {
    const r = canonicalizeResourceIdentifier('https://mcp.example.com/mcp');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonical).toBe('https://mcp.example.com/mcp');
  });

  it('accepts http only for loopback/local development (R-23.1-n)', () => {
    expect(canonicalizeResourceIdentifier('http://localhost:3000/mcp').ok).toBe(true);
    expect(canonicalizeResourceIdentifier('http://127.0.0.1:3000/mcp').ok).toBe(true);
    const nonLoopback = canonicalizeResourceIdentifier('http://mcp.example.com/mcp');
    expect(nonLoopback.ok).toBe(false);
  });

  it('rejects a missing scheme (not absolute) (R-23.1-m)', () => {
    expect(isValidCanonicalResourceIdentifier('mcp.example.com')).toBe(false);
  });

  it('rejects a fragment component (R-23.1-o)', () => {
    const r = canonicalizeResourceIdentifier('https://mcp.example.com#fragment');
    expect(r.ok).toBe(false);
  });

  it('accepts the spec\'s example valid identifiers', () => {
    for (const uri of [
      'https://mcp.example.com/mcp',
      'https://mcp.example.com',
      'https://mcp.example.com:8443',
      'https://mcp.example.com/server/mcp',
    ]) {
      expect(isValidCanonicalResourceIdentifier(uri)).toBe(true);
    }
  });
});

// ─── AC-35.11 — uppercase scheme/host accepted ─────────────────────────────────

describe('AC-35.11 uppercase scheme/host accepted (R-23.1-p)', () => {
  it('canonicalizes an uppercase scheme/host to lowercase', () => {
    const r = canonicalizeResourceIdentifier('HTTPS://MCP.EXAMPLE.COM/mcp');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonical).toBe('https://mcp.example.com/mcp');
  });

  it('treats uppercase and lowercase scheme/host as equal', () => {
    expect(resourceIdentifiersEqual('HTTPS://MCP.EXAMPLE.COM/mcp', 'https://mcp.example.com/mcp')).toBe(true);
  });

  it('keeps the path case-sensitive', () => {
    expect(resourceIdentifiersEqual('https://mcp.example.com/MCP', 'https://mcp.example.com/mcp')).toBe(false);
  });
});

// ─── AC-35.12 — most specific URI, path when needed, trailing slash ────────────

describe('AC-35.12 specificity / path / trailing slash (R-23.1-q/r/s)', () => {
  it('keeps a path component that identifies an individual server (R-23.1-r)', () => {
    const r = canonicalizeResourceIdentifier('https://example.com/server/mcp');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonical).toBe('https://example.com/server/mcp');
  });

  it('strips a non-significant trailing slash by default (R-23.1-s)', () => {
    expect(stripDefaultTrailingSlash('https://mcp.example.com/mcp/')).toBe('https://mcp.example.com/mcp');
  });

  it('preserves the trailing slash when it is semantically significant (R-23.1-s)', () => {
    expect(stripDefaultTrailingSlash('https://mcp.example.com/mcp/', true)).toBe('https://mcp.example.com/mcp/');
  });

  it('leaves the bare-host root slash intact', () => {
    expect(stripDefaultTrailingSlash('https://mcp.example.com/')).toBe('https://mcp.example.com/');
  });
});

// ─── AC-35.13 — 401 + Bearer challenge + resource_metadata ─────────────────────

describe('AC-35.13 unauthorized 401 challenge (R-23.1-t/u/v)', () => {
  it('returns 401 with a Bearer WWW-Authenticate carrying resource_metadata', () => {
    const r = buildUnauthorizedResponse({ resourceMetadata: PRM_URI });
    expect(r.status).toBe(UNAUTHORIZED_STATUS);
    expect(UNAUTHORIZED_STATUS).toBe(401);
    const value = r.headers[WWW_AUTHENTICATE_HEADER];
    expect(value.startsWith(BEARER_AUTH_SCHEME)).toBe(true);
    expect(value).toContain(`resource_metadata="${PRM_URI}"`);
  });

  it('throws when resource_metadata is missing (it is REQUIRED) (R-23.1-v)', () => {
    expect(() => buildUnauthorizedResponse({ resourceMetadata: '' })).toThrow(/resource_metadata/);
  });
});

// ─── AC-35.14 — 401 includes scope when determinable ───────────────────────────

describe('AC-35.14 401 scope parameter (R-23.1-w)', () => {
  it('includes a scope parameter when scopes are supplied', () => {
    const r = buildUnauthorizedResponse({ resourceMetadata: PRM_URI, scope: 'files:read files:write' });
    expect(r.headers[WWW_AUTHENTICATE_HEADER]).toContain('scope="files:read files:write"');
  });

  it('omits scope when not determinable', () => {
    const r = buildUnauthorizedResponse({ resourceMetadata: PRM_URI });
    expect(r.headers[WWW_AUTHENTICATE_HEADER]).not.toContain('scope=');
  });
});

// ─── AC-35.15 — challenged scopes authoritative; no subset/superset ────────────

describe('AC-35.15 challenged scopes authoritative (R-23.1-x/y)', () => {
  it('treats the challenged scope set as the required scopes (R-23.1-x)', () => {
    const challenge = parseWwwAuthenticate('Bearer resource_metadata="x", scope="a b c"')!;
    expect(challengedScopes(challenge)).toEqual(['a', 'b', 'c']);
  });

  it('derives required scopes solely from the challenge, never from scopes_supported (R-23.1-y)', () => {
    // The PRM lists a different set; required scopes must still come from the challenge.
    const prm = { resource: 'https://mcp.example.com/mcp', authorization_servers: ['https://a'], scopes_supported: ['x', 'y', 'z'] };
    expect(isProtectedResourceMetadata(prm)).toBe(true);
    const challenge = parseWwwAuthenticate('Bearer scope="files:write"')!;
    expect(challengedScopes(challenge)).toEqual(['files:write']);
    // No assumption of subset/superset: challenged scope not present in scopes_supported.
    expect(prm.scopes_supported.includes('files:write')).toBe(false);
  });
});

// ─── AC-35.16 — client parses WWW-Authenticate + reacts to 401 ─────────────────

describe('AC-35.16 client parses WWW-Authenticate (R-23.1-z)', () => {
  it('parses a quoted Bearer challenge from a header value', () => {
    const value =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource", scope="files:read"';
    const c = parseWwwAuthenticate(value);
    expect(c).toBeDefined();
    expect(c?.scheme).toBe('Bearer');
    expect(c?.resourceMetadata).toBe('https://mcp.example.com/.well-known/oauth-protected-resource');
    expect(c?.scope).toBe('files:read');
  });

  it('parses bare (unquoted) auth-param values', () => {
    const c = parseWwwAuthenticate('Bearer error=insufficient_scope, scope=files:write');
    expect(c?.error).toBe('insufficient_scope');
    expect(c?.scope).toBe('files:write');
  });

  it('unescapes escaped quotes inside quoted values', () => {
    const c = parseWwwAuthenticate('Bearer error_description="a \\"quoted\\" word"');
    expect(c?.errorDescription).toBe('a "quoted" word');
  });

  it('returns undefined for a non-Bearer scheme', () => {
    expect(parseWwwAuthenticate('Basic realm="x"')).toBeUndefined();
  });

  it('extracts a challenge from a case-insensitive header bag (reacting to a 401)', () => {
    const c = challengeFromHeaders({ 'www-authenticate': `Bearer resource_metadata="${PRM_URI}"` });
    expect(c?.resourceMetadata).toBe(PRM_URI);
    expect(challengeFromHeaders({})).toBeUndefined();
  });
});

// ─── AC-35.17 — 403 insufficient_scope challenge shape ─────────────────────────

describe('AC-35.17 insufficient-scope 403 (R-23.1-aa/ab/ac/ad)', () => {
  it('returns 403 with error=insufficient_scope, scope, and resource_metadata', () => {
    const r = buildInsufficientScopeResponse({
      scope: 'files:write',
      resourceMetadata: PRM_URI,
      errorDescription: 'File write permission required for this operation',
    });
    expect(r.status).toBe(AUTHORIZATION_FORBIDDEN_STATUS);
    expect(AUTHORIZATION_FORBIDDEN_STATUS).toBe(403);
    const value = r.headers[WWW_AUTHENTICATE_HEADER];
    expect(value).toContain(`error="${INSUFFICIENT_SCOPE_ERROR}"`);
    expect(value).toContain('scope="files:write"');
    expect(value).toContain(`resource_metadata="${PRM_URI}"`);
    expect(value).toContain('error_description="File write permission required for this operation"');
  });

  it('puts all required scopes in a single challenge rather than incrementally (R-23.1-ac)', () => {
    const r = buildInsufficientScopeResponse({ scope: 'files:read files:write', resourceMetadata: PRM_URI });
    const c = parseWwwAuthenticate(r.headers[WWW_AUTHENTICATE_HEADER])!;
    expect(challengedScopes(c)).toEqual(['files:read', 'files:write']);
    expect(isInsufficientScopeChallenge(c)).toBe(true);
  });

  it('omits error_description when not supplied (it is OPTIONAL) (R-23.1-ad)', () => {
    const r = buildInsufficientScopeResponse({ scope: 'files:write', resourceMetadata: PRM_URI });
    expect(r.headers[WWW_AUTHENTICATE_HEADER]).not.toContain('error_description=');
  });

  it('requires scope and resource_metadata', () => {
    expect(() => buildInsufficientScopeResponse({ scope: '', resourceMetadata: PRM_URI })).toThrow(/scope/);
    expect(() => buildInsufficientScopeResponse({ scope: 'x', resourceMetadata: '' })).toThrow(/resource_metadata/);
  });

  it('exposes the 400 malformed-request status from the table', () => {
    expect(AUTHORIZATION_BAD_REQUEST_STATUS).toBe(400);
  });
});

// ─── AC-35.18 — server publishes PRM; both discovery mechanisms ────────────────

describe('AC-35.18 PRM publication + both mechanisms (R-23.2-a/b/c)', () => {
  it('parses a published PRM document used to discover authorization servers', () => {
    const doc = {
      resource: 'https://mcp.example.com/mcp',
      authorization_servers: ['https://auth.example.com'],
      scopes_supported: ['files:read', 'files:write'],
      bearer_methods_supported: ['header'],
    };
    const parsed = ProtectedResourceMetadataSchema.parse(doc);
    expect(parsed.authorization_servers).toEqual(['https://auth.example.com']);
  });

  it('supports the header mechanism (URI from challenge) and the well-known mechanism', () => {
    // Header mechanism:
    const fromHeader = resolveProtectedResourceMetadataUris({ headerResourceMetadata: PRM_URI });
    expect(fromHeader).toEqual([PRM_URI]);
    // Well-known mechanism:
    const fromWellKnown = resolveProtectedResourceMetadataUris({ endpointUrl: 'https://mcp.example.com/mcp' });
    expect(fromWellKnown.length).toBeGreaterThan(0);
  });
});

// ─── AC-35.19 — header resource_metadata URI is used ───────────────────────────

describe('AC-35.19 header resource_metadata URI used (R-23.2-d)', () => {
  it('uses the header URI exclusively when present, ignoring the endpoint', () => {
    const uris = resolveProtectedResourceMetadataUris({
      headerResourceMetadata: 'https://header.example.com/prm',
      endpointUrl: 'https://mcp.example.com/mcp',
    });
    expect(uris).toEqual(['https://header.example.com/prm']);
  });
});

// ─── AC-35.20 — well-known order: path-aware then root ─────────────────────────

describe('AC-35.20 PRM well-known order (R-23.2-e/f)', () => {
  it('builds path-aware then root, in that exact order', () => {
    expect(protectedResourceWellKnownUris('https://example.com/public/mcp')).toEqual([
      'https://example.com/.well-known/oauth-protected-resource/public/mcp',
      'https://example.com/.well-known/oauth-protected-resource',
    ]);
  });

  it('returns only the root URI when the endpoint has no path', () => {
    expect(protectedResourceWellKnownUris('https://example.com')).toEqual([
      'https://example.com/.well-known/oauth-protected-resource',
    ]);
  });

  it('exposes the well-known suffix constant', () => {
    expect(PROTECTED_RESOURCE_WELL_KNOWN).toBe('/.well-known/oauth-protected-resource');
  });
});

// ─── AC-35.21 — neither + no header → abort / fallback (empty) ──────────────────

describe('AC-35.21 abort / fallback (R-23.2-g)', () => {
  it('yields no URIs when no header URI and no endpoint are available', () => {
    expect(resolveProtectedResourceMetadataUris({})).toEqual([]);
  });

  it('yields no URIs when the endpoint is not a valid absolute URI', () => {
    expect(resolveProtectedResourceMetadataUris({ endpointUrl: 'not-a-uri' })).toEqual([]);
  });
});

// ─── AC-35.22 — PRM resource match; ≥1 AS; select an AS ────────────────────────

describe('AC-35.22 PRM validation + AS selection (R-23.2-h/i/j)', () => {
  const resource = 'https://mcp.example.com/mcp';

  it('accepts a PRM whose resource matches the canonical id and selects an AS', () => {
    const doc = { resource, authorization_servers: ['https://auth1.example.com', 'https://auth2.example.com'] };
    const v = validateProtectedResourceMetadata(doc, resource);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(selectAuthorizationServer(v.metadata)).toBe('https://auth1.example.com');
      expect(selectAuthorizationServer(v.metadata, (i) => i === 'https://auth2.example.com')).toBe(
        'https://auth2.example.com',
      );
    }
  });

  it('accepts an uppercase scheme/host resource against the lowercase canonical id (R-23.1-p)', () => {
    const doc = { resource: 'HTTPS://MCP.EXAMPLE.COM/mcp', authorization_servers: ['https://a'] };
    expect(validateProtectedResourceMetadata(doc, resource).ok).toBe(true);
  });

  it('rejects a PRM whose resource does not match the server being contacted (R-23.2-h)', () => {
    const doc = { resource: 'https://other.example.com/mcp', authorization_servers: ['https://a'] };
    expect(validateProtectedResourceMetadata(doc, resource).ok).toBe(false);
  });

  it('rejects a PRM with no authorization_servers / an empty list (R-23.2-i)', () => {
    expect(isProtectedResourceMetadata({ resource })).toBe(false);
    expect(isProtectedResourceMetadata({ resource, authorization_servers: [] })).toBe(false);
  });
});

// ─── AC-35.23 — AS provides ≥1 mechanism; client supports both ─────────────────

describe('AC-35.23 AS metadata + both mechanisms (R-23.3-a/b)', () => {
  it('builds URIs that cover both OAuth AS Metadata and OIDC Discovery', () => {
    const uris = authorizationServerWellKnownUris('https://auth.example.com');
    expect(uris.some((u) => u.includes(OAUTH_AS_WELL_KNOWN))).toBe(true);
    expect(uris.some((u) => u.includes(OPENID_CONFIGURATION_WELL_KNOWN))).toBe(true);
  });
});

// ─── AC-35.24 — AS well-known priority order, with/without path ─────────────────

describe('AC-35.24 AS well-known priority order (R-23.3-c)', () => {
  it('orders endpoints for an issuer with a path component', () => {
    expect(authorizationServerWellKnownUris('https://auth.example.com/tenant1')).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server/tenant1',
      'https://auth.example.com/.well-known/openid-configuration/tenant1',
      'https://auth.example.com/tenant1/.well-known/openid-configuration',
    ]);
  });

  it('orders endpoints for an issuer without a path component', () => {
    expect(authorizationServerWellKnownUris('https://auth.example.com')).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server',
      'https://auth.example.com/.well-known/openid-configuration',
    ]);
  });
});

// ─── AC-35.25 — issuer-match accept; mismatch MUST NOT use ─────────────────────

describe('AC-35.25 issuer-match validation (R-23.3-d/e)', () => {
  const base = {
    authorization_endpoint: 'https://honest.example/authorize',
    token_endpoint: 'https://honest.example/token',
  };

  it('accepts a document whose issuer matches the construction value (R-23.3-d)', () => {
    const v = validateAuthorizationServerMetadata({ issuer: 'https://honest.example', ...base }, 'https://honest.example');
    expect(v.ok).toBe(true);
  });

  it('MUST NOT use a document whose issuer differs from the construction value (R-23.3-e)', () => {
    // Spec attacker example: fetched with issuer attacker.example, document claims honest.example.
    const v = validateAuthorizationServerMetadata(
      { issuer: 'https://honest.example', ...base },
      'https://attacker.example',
    );
    expect(v.ok).toBe(false);
  });
});

// ─── AC-35.26 — required AS fields present ─────────────────────────────────────

describe('AC-35.26 required AS fields (R-23.3-f/g/h)', () => {
  it('requires issuer, authorization_endpoint, and token_endpoint', () => {
    expect(
      isAuthorizationServerMetadata({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      }),
    ).toBe(true);
    expect(isAuthorizationServerMetadata({ issuer: 'https://a', token_endpoint: 'https://a/t' })).toBe(false);
    expect(isAuthorizationServerMetadata({ issuer: 'https://a', authorization_endpoint: 'https://a/z' })).toBe(false);
    expect(isAuthorizationServerMetadata({ authorization_endpoint: 'https://a/z', token_endpoint: 'https://a/t' })).toBe(
      false,
    );
  });

  it('parses the spec example document and round-trips its endpoints', () => {
    const parsed = AuthorizationServerMetadataSchema.parse({
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      registration_endpoint: 'https://auth.example.com/register',
      scopes_supported: ['files:read', 'files:write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: false,
    });
    expect(parsed.issuer).toBe('https://auth.example.com');
    expect(parsed.authorization_endpoint).toBe('https://auth.example.com/authorize');
    expect(parsed.token_endpoint).toBe('https://auth.example.com/token');
  });
});

// ─── AC-35.27 — response_types includes "code"; PKCE includes "S256" ────────────

describe('AC-35.27 response_types / PKCE constraints (R-23.3-i/j)', () => {
  const base = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token',
  };

  it('rejects response_types_supported that omits "code" (R-23.3-i)', () => {
    expect(isAuthorizationServerMetadata({ ...base, response_types_supported: ['token'] })).toBe(false);
    expect(isAuthorizationServerMetadata({ ...base, response_types_supported: ['code'] })).toBe(true);
  });

  it('rejects code_challenge_methods_supported that omits "S256" (R-23.3-j)', () => {
    expect(isAuthorizationServerMetadata({ ...base, code_challenge_methods_supported: ['plain'] })).toBe(false);
    expect(isAuthorizationServerMetadata({ ...base, code_challenge_methods_supported: ['S256'] })).toBe(true);
  });

  it('allows both fields to be absent (they are OPTIONAL)', () => {
    expect(isAuthorizationServerMetadata(base)).toBe(true);
  });
});

// ─── buildWwwAuthenticateValue ordering ────────────────────────────────────────

describe('buildWwwAuthenticateValue', () => {
  it('emits parameters in the stable error/scope/resource_metadata/error_description order', () => {
    const value = buildWwwAuthenticateValue({
      error: 'insufficient_scope',
      scope: 'a b',
      resourceMetadata: 'https://m/prm',
      errorDescription: 'why',
    });
    expect(value).toBe(
      'Bearer error="insufficient_scope", scope="a b", resource_metadata="https://m/prm", error_description="why"',
    );
  });

  it('emits the bare scheme when no parameters are present', () => {
    expect(buildWwwAuthenticateValue({})).toBe('Bearer');
  });
});
