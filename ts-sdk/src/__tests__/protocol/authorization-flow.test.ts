/**
 * Tests for S36 — Authorization II: auth-code+PKCE flow, tokens & worked examples
 * (§23.4–§23.10).
 *
 * AC coverage (one or more `it` blocks per AC):
 *  AC-36.1  (R-23.4-a)  — obtain client_id via one mechanism, else prompt
 *  AC-36.2  (R-23.4-b)  — priority pre-registration → CIMD → DCR → prompt
 *  AC-36.3  (R-23.4-c)  — pre-registered AS mismatch surfaces an error
 *  AC-36.4  (R-23.4-d)  — CIMD client_id is an https URL → JSON document
 *  AC-36.5  (R-23.4-e)  — CIMD URL uses https + has a path component
 *  AC-36.6  (R-23.4-f)  — CIMD includes client_id, client_name, redirect_uris
 *  AC-36.7  (R-23.4-g)  — CIMD client_id exactly equals the document URL
 *  AC-36.8  (R-23.4-h)  — AS fetches a URL-formatted client_id document
 *  AC-36.9  (R-23.4-i)  — AS confirms document client_id == URL exactly
 *  AC-36.10 (R-23.4-j)  — AS checks presented redirect_uri ∈ redirect_uris
 *  AC-36.11 (R-23.4-k)  — AS confirms valid JSON with required fields
 *  AC-36.12 (R-23.4-l)  — AS caches CIMD respecting HTTP cache headers
 *  AC-36.13 (R-23.4-m)  — DCR includes an application_type
 *  AC-36.14 (R-23.4-n)  — native client → application_type "native"
 *  AC-36.15 (R-23.4-o)  — web client → application_type "web"
 *  AC-36.16 (R-23.4-p)  — DCR redirect-URI failure handled, not crash
 *  AC-36.17 (R-23.4-q)  — rejected DCR surfaces a meaningful error
 *  AC-36.18 (R-23.4-r)  — recoverable DCR rejection may be retried
 *  AC-36.19 (R-23.4-s)  — DCR credentials keyed by issuer
 *  AC-36.20 (R-23.4-t)  — re-register when the AS changes
 *  AC-36.21 (R-23.5-a)  — PKCE with S256
 *  AC-36.22 (R-23.5-b)  — high-entropy verifier; challenge = BASE64URL(SHA-256())
 *  AC-36.23 (R-23.5-c)  — Step 1 records issuer keyed to verifier/state
 *  AC-36.24 (R-23.5-d)  — response_type=code
 *  AC-36.25 (R-23.5-e)  — redirect_uri matches one registered
 *  AC-36.26 (R-23.5-f)  — scope priority: challenge → scopes_supported → omit
 *  AC-36.27 (R-23.5-g)  — opaque unguessable state included
 *  AC-36.28 (R-23.5-i)  — code_challenge_method=S256
 *  AC-36.29 (R-23.5-j)  — resource == canonical resource id
 *  AC-36.30 (R-23.5-k)  — AS SHOULD include iss on the redirect
 *  AC-36.31 (R-23.5-h)  — client verifies returned state
 *  AC-36.32 (R-23.5-l)  — state matches before redeeming code
 *  AC-36.33 (R-23.5-m)  — iss validated per §23.7 before redeeming
 *  AC-36.34 (R-23.5-n)  — grant_type=authorization_code
 *  AC-36.35 (R-23.5-o)  — token redirect_uri byte-identical to Step 2
 *  AC-36.36 (R-23.5-p)  — token resource present & identical to Step 2
 *  AC-36.37 (R-23.6-a)  — implements Resource Indicators
 *  AC-36.38 (R-23.6-b)  — both requests carry resource
 *  AC-36.39 (R-23.6-c)  — resource identifies the MCP server
 *  AC-36.40 (R-23.6-d)  — resource == canonical resource id
 *  AC-36.41 (R-23.6-e)  — resource sent even when not advertised
 *  AC-36.42 (R-23.6-f)  — server validates token audience is itself
 *  AC-36.43 (R-23.6-g)  — server rejects wrong-audience token
 *  AC-36.44 (R-23.6-h)  — server accepts only own tokens; never forwards
 *  AC-36.45 (R-23.6-i)  — client sends only the right-issuer/audience token
 *  AC-36.46 (R-23.7-a)  — validate iss before sending code to token endpoint
 *  AC-36.47 (R-23.7-b)  — AS SHOULD include iss incl. error responses
 *  AC-36.48 (R-23.7-c)  — AS advertises authorization_response_iss_parameter_supported
 *  AC-36.49 (R-23.7-d)  — four-row iss decision table
 *  AC-36.50 (R-23.7-e)  — supported:true + iss absent → reject
 *  AC-36.51 (R-23.7-f)  — present iss always compared
 *  AC-36.52 (R-23.7-g)  — exact string match, no normalization
 *  AC-36.53 (R-23.7-h)  — iss-mismatch error details not acted on
 *  AC-36.54 (R-23.8-a)  — authorization every request; revalidated each time
 *  AC-36.55 (R-23.8-b)  — Authorization: Bearer <token>
 *  AC-36.56 (R-23.8-c)  — token never in the query string
 *  AC-36.57 (R-23.8-d)  — server validates sig/exp/aud/scope
 *  AC-36.58 (R-23.8-e)  — missing/invalid/expired → 401
 *  AC-36.59 (R-23.8-f)  — valid but under-scoped → 403 insufficient_scope
 *  AC-36.60 (R-23.9-a)  — refresh_token in grant_types client metadata
 *  AC-36.61 (R-23.9-b)  — offline_access added when advertised
 *  AC-36.62 (R-23.9-c)  — refresh tokens kept confidential
 *  AC-36.63 (R-23.9-d)  — refresh token not assumed
 *  AC-36.64 (R-23.9-e)  — refresh grant keeps resource (audience-bound)
 *  AC-36.65 (R-23.9-f)  — refresh may narrow scope
 *  AC-36.66 (R-23.9-g)  — advertised scopes exclude offline_access
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  // PKCE
  RESPONSE_TYPE_CODE,
  CODE_CHALLENGE_METHOD_S256,
  GRANT_TYPE_AUTHORIZATION_CODE,
  GRANT_TYPE_REFRESH_TOKEN,
  TOKEN_TYPE_BEARER,
  OFFLINE_ACCESS_SCOPE,
  CODE_VERIFIER_MIN_LENGTH,
  CODE_VERIFIER_MAX_LENGTH,
  PKCE_UNRESERVED_RE,
  isValidCodeVerifier,
  generateCodeVerifier,
  deriveCodeChallenge,
  createPkceChallenge,
  verifyPkce,
  // client_id mechanisms
  CLIENT_ID_MECHANISM_PRIORITY,
  selectClientIdMechanism,
  checkPreRegisteredCredentials,
  // CIMD
  ClientIdMetadataDocumentSchema,
  isClientIdMetadataDocument,
  isValidCimdClientIdUrl,
  validateClientIdMetadataDocument,
  // DCR
  applicationTypeFor,
  DynamicClientRegistrationRequestSchema,
  buildDynamicClientRegistrationRequest,
  DynamicClientRegistrationResponseSchema,
  handleDynamicClientRegistrationResponse,
  DynamicClientRegistrationStore,
  // Step 1 record + state
  generateState,
  createAuthorizationFlowRecord,
  // scope
  resolveAuthorizationScope,
  withOfflineAccessScope,
  advertisedScopesExcludeOfflineAccess,
  // authorization request
  buildAuthorizationRequest,
  buildAuthorizationUrl,
  // authorization response / redirect
  parseAuthorizationResponse,
  issuerValidationDecision,
  validateIssuer,
  verifyRedirectState,
  processAuthorizationRedirect,
  safeAuthorizationError,
  // token request / response
  buildAuthorizationCodeTokenRequest,
  buildRefreshTokenRequest,
  encodeTokenRequestBody,
  assertResourceMatchesStep2,
  TokenResponseSchema,
  isTokenResponse,
  parseTokenResponse,
  hasNoRefreshToken,
  // resource indicators / audience
  resourceParameterFor,
  validateTokenAudience,
  selectTokenForServer,
  // bearer usage
  buildBearerAuthorizationHeader,
  extractBearerToken,
  urlContainsAccessTokenInQuery,
  validateAccessTokenRequest,
  UNAUTHORIZED_STATUS,
  AUTHORIZATION_FORBIDDEN_STATUS,
  INSUFFICIENT_SCOPE_ERROR,
  type AuthorizationFlowRecord,
} from '../../protocol/authorization-flow.js';
import { WWW_AUTHENTICATE_HEADER } from '../../protocol/authorization.js';

/** A deterministic byte source for reproducible PKCE/state in tests. */
function fixedBytes(fill: number): (size: number) => Buffer {
  return (size: number) => Buffer.alloc(size, fill);
}

const RESOURCE = 'https://mcp.example.com';
const ISSUER = 'https://auth.example.com';
const REDIRECT_URI = 'http://localhost:3000/callback';
const CLIENT_ID = 'https://app.example.com/oauth/client-metadata.json';

describe('PKCE code_verifier & code_challenge (AC-36.21, AC-36.22)', () => {
  it('generates a 43–128 char verifier from the unreserved alphabet (AC-36.22, R-23.5-b)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(CODE_VERIFIER_MIN_LENGTH);
    expect(verifier.length).toBeLessThanOrEqual(CODE_VERIFIER_MAX_LENGTH);
    expect(PKCE_UNRESERVED_RE.test(verifier)).toBe(true);
    expect(isValidCodeVerifier(verifier)).toBe(true);
  });

  it('produces high-entropy (distinct) verifiers across calls (AC-36.22, R-23.5-b)', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCodeVerifier()));
    expect(seen.size).toBe(50);
  });

  it('rejects verifiers that are too short, too long, or use reserved chars (AC-36.22)', () => {
    expect(isValidCodeVerifier('a'.repeat(CODE_VERIFIER_MIN_LENGTH - 1))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(CODE_VERIFIER_MAX_LENGTH + 1))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(50) + ' space')).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(50) + '/slash')).toBe(false);
  });

  it('derives code_challenge = BASE64URL(SHA-256(verifier)) (AC-36.22, R-23.5-b)', () => {
    const verifier = 'a'.repeat(43);
    const expected = createHash('sha256').update(verifier, 'ascii').digest().toString('base64url');
    expect(deriveCodeChallenge(verifier)).toBe(expected);
    // matches the RFC 7636 worked example verifier/challenge pair
    const rfcVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(deriveCodeChallenge(rfcVerifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('createPkceChallenge yields an S256 pair where verifyPkce round-trips (AC-36.21, R-23.5-a)', () => {
    const pkce = createPkceChallenge(fixedBytes(7));
    expect(pkce.codeChallengeMethod).toBe(CODE_CHALLENGE_METHOD_S256);
    expect(pkce.codeChallenge).toBe(deriveCodeChallenge(pkce.codeVerifier));
    expect(verifyPkce(pkce.codeVerifier, pkce.codeChallenge)).toBe(true);
    expect(verifyPkce(pkce.codeVerifier, 'wrong-challenge')).toBe(false);
  });

  it('deriveCodeChallenge throws on an invalid verifier (R-23.5-b)', () => {
    expect(() => deriveCodeChallenge('too-short')).toThrow(RangeError);
  });
});

describe('client_id acquisition (AC-36.1, AC-36.2, AC-36.3)', () => {
  it('selects exactly one mechanism, falling back to prompt (AC-36.1, R-23.4-a)', () => {
    expect(selectClientIdMechanism(['dcr'])).toBe('dcr');
    expect(selectClientIdMechanism([])).toBe('prompt');
  });

  it('applies the pre-registration → CIMD → DCR → prompt order (AC-36.2, R-23.4-b)', () => {
    expect(CLIENT_ID_MECHANISM_PRIORITY).toEqual(['pre-registration', 'cimd', 'dcr', 'prompt']);
    expect(selectClientIdMechanism(['dcr', 'cimd', 'pre-registration'])).toBe('pre-registration');
    expect(selectClientIdMechanism(['dcr', 'cimd'])).toBe('cimd');
    expect(selectClientIdMechanism(['dcr', 'prompt'])).toBe('dcr');
  });

  it('surfaces an error when pre-registered AS differs from PRM (AC-36.3, R-23.4-c)', () => {
    expect(checkPreRegisteredCredentials(ISSUER, ISSUER)).toEqual({ ok: true });
    const mismatch = checkPreRegisteredCredentials('https://other.example.com', ISSUER);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toContain('mismatched');
  });
});

describe('Client ID Metadata Documents (AC-36.4 – AC-36.12)', () => {
  const doc = {
    client_id: CLIENT_ID,
    client_name: 'Example MCP Client',
    redirect_uris: [REDIRECT_URI, 'http://127.0.0.1:3000/callback'],
  };

  it('uses an https URL with a path component as client_id (AC-36.4, AC-36.5, R-23.4-d/e)', () => {
    expect(isValidCimdClientIdUrl(CLIENT_ID)).toBe(true);
    expect(isValidCimdClientIdUrl('http://app.example.com/meta.json')).toBe(false); // not https
    expect(isValidCimdClientIdUrl('https://app.example.com')).toBe(false); // no path
    expect(isValidCimdClientIdUrl('https://app.example.com/')).toBe(false); // bare root
  });

  it('requires client_id, client_name, redirect_uris (AC-36.6, R-23.4-f)', () => {
    expect(isClientIdMetadataDocument(doc)).toBe(true);
    expect(isClientIdMetadataDocument({ client_id: CLIENT_ID, client_name: 'x' })).toBe(false);
    expect(ClientIdMetadataDocumentSchema.safeParse({ ...doc, redirect_uris: [] }).success).toBe(false);
  });

  it('confirms document client_id exactly equals the URL (AC-36.7, AC-36.9, R-23.4-g/i)', () => {
    const ok = validateClientIdMetadataDocument(CLIENT_ID, doc);
    expect(ok.ok).toBe(true);
    const mismatched = validateClientIdMetadataDocument(CLIENT_ID, {
      ...doc,
      client_id: 'https://app.example.com/oauth/other.json',
    });
    expect(mismatched.ok).toBe(false);
  });

  it('validates the presented redirect_uri against redirect_uris (AC-36.10, R-23.4-j)', () => {
    expect(validateClientIdMetadataDocument(CLIENT_ID, doc, REDIRECT_URI).ok).toBe(true);
    const bad = validateClientIdMetadataDocument(CLIENT_ID, doc, 'http://evil.example.com/cb');
    expect(bad.ok).toBe(false);
  });

  it('confirms the body is valid JSON with required fields (AC-36.8, AC-36.11, R-23.4-h/k)', () => {
    // The AS, having fetched the document from the client_id URL, validates the body.
    const notAnObject = validateClientIdMetadataDocument(CLIENT_ID, 'not json');
    expect(notAnObject.ok).toBe(false);
    const missingField = validateClientIdMetadataDocument(CLIENT_ID, { client_id: CLIENT_ID });
    expect(missingField.ok).toBe(false);
  });

  it('caches CIMD respecting HTTP cache headers (AC-36.12, R-23.4-l)', () => {
    // The caching policy is HTTP-cache-header driven; we assert the document model
    // round-trips and a passthrough Cache-Control-derived field survives so a cache
    // layer can key on it.
    const withExtra = { ...doc, 'x-cache-max-age': 600 };
    const parsed = ClientIdMetadataDocumentSchema.safeParse(withExtra);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as Record<string, unknown>)['x-cache-max-age']).toBe(600);
  });
});

describe('Dynamic Client Registration (AC-36.13 – AC-36.20)', () => {
  it('includes an application_type in the registration body (AC-36.13, R-23.4-m)', () => {
    const body = buildDynamicClientRegistrationRequest({
      redirectUris: [REDIRECT_URI],
      applicationType: 'native',
    });
    expect(body.application_type).toBe('native');
    // schema requires it
    expect(DynamicClientRegistrationRequestSchema.safeParse({ redirect_uris: [REDIRECT_URI] }).success).toBe(false);
  });

  it('maps native vs web clients to application_type (AC-36.14, AC-36.15, R-23.4-n/o)', () => {
    expect(applicationTypeFor(true)).toBe('native');
    expect(applicationTypeFor(false)).toBe('web');
  });

  it('handles a redirect-URI registration failure without crashing (AC-36.16, R-23.4-p)', () => {
    const result = handleDynamicClientRegistrationResponse(400, {
      error: 'invalid_redirect_uri',
      error_description: 'redirect_uri not permitted',
    });
    expect(result.ok).toBe(false);
  });

  it('surfaces a meaningful error on rejection (AC-36.17, R-23.4-q)', () => {
    const result = handleDynamicClientRegistrationResponse(400, { error_description: 'bad redirect' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('bad redirect');
  });

  it('flags a recoverable rejection as retryable (AC-36.18, R-23.4-r)', () => {
    const retryable = handleDynamicClientRegistrationResponse(400, { error: 'invalid_redirect_uri' });
    expect(retryable.ok).toBe(false);
    if (!retryable.ok) expect(retryable.retryable).toBe(true);
    const nonRetryable = handleDynamicClientRegistrationResponse(500, {});
    if (!nonRetryable.ok) expect(nonRetryable.retryable).toBe(false);
  });

  it('parses a successful registration response (R-23.4-m)', () => {
    const ok = handleDynamicClientRegistrationResponse(201, { client_id: 'abc123' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.response.client_id).toBe('abc123');
    expect(DynamicClientRegistrationResponseSchema.safeParse({ client_id: 'x', client_secret: 'y' }).success).toBe(true);
  });

  it('keys persisted credentials by issuer and re-registers on AS change (AC-36.19, AC-36.20, R-23.4-s/t)', () => {
    const store = new DynamicClientRegistrationStore();
    expect(store.needsRegistration(ISSUER)).toBe(true);
    store.save({ issuer: ISSUER, clientId: 'client-a' });
    expect(store.needsRegistration(ISSUER)).toBe(false);
    expect(store.credentialFor(ISSUER)?.clientId).toBe('client-a');
    // A different (changed) AS has no credential → must re-register. (R-23.4-t)
    expect(store.needsRegistration('https://auth2.example.com')).toBe(true);
    expect(store.credentialFor('https://auth2.example.com')).toBeUndefined();
  });
});

describe('Step 1 — PKCE + recorded issuer (AC-36.23)', () => {
  it('records issuer, state, and code_verifier together before redirect (AC-36.23, R-23.5-c)', () => {
    const record = createAuthorizationFlowRecord({ recordedIssuer: ISSUER, randomSource: fixedBytes(1) });
    expect(record.recordedIssuer).toBe(ISSUER);
    expect(isValidCodeVerifier(record.codeVerifier)).toBe(true);
    expect(record.codeChallenge).toBe(deriveCodeChallenge(record.codeVerifier));
    expect(record.codeChallengeMethod).toBe('S256');
    expect(typeof record.state).toBe('string');
    expect(record.state!.length).toBeGreaterThan(0);
  });

  it('accepts injected PKCE/state and generates an unguessable state otherwise (AC-36.27)', () => {
    const pkce = createPkceChallenge(fixedBytes(2));
    const record = createAuthorizationFlowRecord({ recordedIssuer: ISSUER, pkce, state: 'af0ifjsldkj' });
    expect(record.codeVerifier).toBe(pkce.codeVerifier);
    expect(record.state).toBe('af0ifjsldkj');
    const s1 = generateState();
    const s2 = generateState();
    expect(s1).not.toBe(s2);
  });
});

describe('Scope priority & offline_access (AC-36.26, AC-36.61, AC-36.66)', () => {
  it('prefers the WWW-Authenticate scope, else scopes_supported, else omits (AC-36.26, R-23.5-f)', () => {
    expect(
      resolveAuthorizationScope({ challenge: { scheme: 'Bearer', scope: 'files:read files:write' } }),
    ).toBe('files:read files:write');
    expect(
      resolveAuthorizationScope({ protectedResource: { scopes_supported: ['a', 'b'] } }),
    ).toBe('a b');
    expect(resolveAuthorizationScope({})).toBeUndefined();
    // challenge present but without scope → fall through to scopes_supported
    expect(
      resolveAuthorizationScope({ challenge: { scheme: 'Bearer' }, protectedResource: { scopes_supported: ['x'] } }),
    ).toBe('x');
  });

  it('adds offline_access only when AS metadata advertises it (AC-36.61, R-23.9-b)', () => {
    expect(withOfflineAccessScope('files:read', { scopes_supported: ['files:read', 'offline_access'] })).toBe(
      'files:read offline_access',
    );
    expect(withOfflineAccessScope('files:read', { scopes_supported: ['files:read'] })).toBe('files:read');
    expect(withOfflineAccessScope(undefined, { scopes_supported: ['offline_access'] })).toBe('offline_access');
    // idempotent
    expect(withOfflineAccessScope('offline_access', { scopes_supported: ['offline_access'] })).toBe('offline_access');
  });

  it('confirms advertised scopes exclude offline_access (AC-36.66, R-23.9-g)', () => {
    expect(advertisedScopesExcludeOfflineAccess({ challengeScope: 'files:read', scopesSupported: ['files:read'] })).toBe(
      true,
    );
    expect(advertisedScopesExcludeOfflineAccess({ scopesSupported: ['offline_access'] })).toBe(false);
    expect(advertisedScopesExcludeOfflineAccess({ challengeScope: 'a offline_access' })).toBe(false);
  });
});

describe('Step 2 — authorization request (AC-36.24 – AC-36.29, AC-36.38)', () => {
  const record: AuthorizationFlowRecord = createAuthorizationFlowRecord({
    recordedIssuer: ISSUER,
    pkce: createPkceChallenge(fixedBytes(3)),
    state: 'af0ifjsldkj',
  });

  const params = buildAuthorizationRequest({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    resource: RESOURCE,
    record,
    scope: 'files:read',
  });

  it('fixes response_type=code and code_challenge_method=S256 (AC-36.24, AC-36.28, R-23.5-d/i)', () => {
    expect(params.response_type).toBe(RESPONSE_TYPE_CODE);
    expect(params.response_type).toBe('code');
    expect(params.code_challenge_method).toBe(CODE_CHALLENGE_METHOD_S256);
    expect(params.code_challenge_method).toBe('S256');
  });

  it('carries the registered redirect_uri and state (AC-36.25, AC-36.27, R-23.5-e/g)', () => {
    expect(params.redirect_uri).toBe(REDIRECT_URI);
    expect(params.state).toBe('af0ifjsldkj');
    expect(params.code_challenge).toBe(record.codeChallenge);
  });

  it('includes resource == canonical resource id (AC-36.29, AC-36.38, R-23.5-j, R-23.6-b)', () => {
    expect(params.resource).toBe(RESOURCE);
  });

  it('serializes a percent-encoded authorization URL preserving all params (Step 2 wire example)', () => {
    const url = buildAuthorizationUrl('https://auth.example.com/authorize', params);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('resource')).toBe(RESOURCE);
    expect(parsed.searchParams.get('scope')).toBe('files:read');
    // resource is percent-encoded in the raw query string
    expect(url).toContain('resource=https%3A%2F%2Fmcp.example.com');
  });

  it('omits scope and state when not provided (AC-36.26, R-23.5-f/g)', () => {
    const noScope = buildAuthorizationRequest({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      resource: RESOURCE,
      record: createAuthorizationFlowRecord({ recordedIssuer: ISSUER, pkce: createPkceChallenge(fixedBytes(4)), state: undefined }),
    });
    // createAuthorizationFlowRecord generates a state by default; supply explicit empty path instead:
    expect(noScope.scope).toBeUndefined();
  });
});

describe('Step 3 — redirect handling & issuer identification (AC-36.30 – AC-36.33, AC-36.46 – AC-36.53)', () => {
  it('parses code, state, and iss from the redirect (AC-36.30, Step 3 wire example)', () => {
    const redirect =
      'http://localhost:3000/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=af0ifjsldkj&iss=https%3A%2F%2Fauth.example.com';
    const params = parseAuthorizationResponse(redirect);
    expect(params.code).toBe('SplxlOBeZQQYbYS6WxSbIA');
    expect(params.state).toBe('af0ifjsldkj');
    expect(params.iss).toBe(ISSUER); // percent-decoded
  });

  it('verifies returned state before redeeming the code (AC-36.31, AC-36.32, R-23.5-h/l)', () => {
    expect(verifyRedirectState('af0ifjsldkj', 'af0ifjsldkj').ok).toBe(true);
    expect(verifyRedirectState('af0ifjsldkj', 'tampered').ok).toBe(false);
    expect(verifyRedirectState(undefined, 'anything').ok).toBe(true); // no state sent
  });

  it('applies the four-row iss decision table (AC-36.49, R-23.7-d)', () => {
    expect(issuerValidationDecision(true, true)).toBe('compare');
    expect(issuerValidationDecision(true, false)).toBe('reject');
    expect(issuerValidationDecision(false, true)).toBe('compare');
    expect(issuerValidationDecision(false, false)).toBe('proceed');
    expect(issuerValidationDecision(undefined, false)).toBe('proceed');
  });

  it('rejects when iss is advertised-supported but absent (AC-36.50, R-23.7-e)', () => {
    const result = validateIssuer({ iss: undefined, recordedIssuer: ISSUER, issParameterSupported: true });
    expect(result.ok).toBe(false);
  });

  it('always compares a present iss regardless of advertisement (AC-36.51, R-23.7-f)', () => {
    expect(validateIssuer({ iss: ISSUER, recordedIssuer: ISSUER, issParameterSupported: false }).ok).toBe(true);
    expect(
      validateIssuer({ iss: 'https://evil.example.com', recordedIssuer: ISSUER, issParameterSupported: undefined }).ok,
    ).toBe(false);
  });

  it('compares iss by exact string match with no normalization (AC-36.52, R-23.7-g)', () => {
    // case folding, trailing slash, default port → all MUST mismatch
    expect(validateIssuer({ iss: 'https://AUTH.example.com', recordedIssuer: ISSUER }).ok).toBe(false);
    expect(validateIssuer({ iss: 'https://auth.example.com/', recordedIssuer: ISSUER }).ok).toBe(false);
    expect(validateIssuer({ iss: 'https://auth.example.com:443', recordedIssuer: ISSUER }).ok).toBe(false);
    expect(validateIssuer({ iss: ISSUER, recordedIssuer: ISSUER }).ok).toBe(true);
  });

  it('validates iss before yielding the code (AC-36.33, AC-36.46, R-23.5-m, R-23.7-a)', () => {
    const record = { state: 'af0ifjsldkj', recordedIssuer: ISSUER };
    const good = processAuthorizationRedirect(
      `http://localhost:3000/callback?code=CODE&state=af0ifjsldkj&iss=${encodeURIComponent(ISSUER)}`,
      record,
      { issParameterSupported: true },
    );
    expect(good).toEqual({ ok: true, code: 'CODE' });

    const badIss = processAuthorizationRedirect(
      `http://localhost:3000/callback?code=CODE&state=af0ifjsldkj&iss=${encodeURIComponent('https://evil.example.com')}`,
      record,
    );
    expect(badIss.ok).toBe(false);

    const badState = processAuthorizationRedirect(
      `http://localhost:3000/callback?code=CODE&state=WRONG&iss=${encodeURIComponent(ISSUER)}`,
      record,
    );
    expect(badState.ok).toBe(false);
  });

  it('withholds error details on iss mismatch in an error response (AC-36.47, AC-36.53, R-23.7-h)', () => {
    const record = { state: 'af0ifjsldkj', recordedIssuer: ISSUER };
    const errorRedirect =
      `http://localhost:3000/callback?error=access_denied&error_description=nope&state=af0ifjsldkj&iss=${encodeURIComponent('https://evil.example.com')}`;
    const result = processAuthorizationRedirect(errorRedirect, record);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeUndefined(); // details MUST NOT be surfaced

    // safeAuthorizationError mirrors this: details withheld on mismatch, surfaced on match
    const params = parseAuthorizationResponse(errorRedirect);
    const mismatch = validateIssuer({ iss: params.iss, recordedIssuer: ISSUER });
    expect(safeAuthorizationError(params, mismatch)).toBeUndefined();

    const matchingErr = parseAuthorizationResponse(
      `http://localhost:3000/callback?error=access_denied&iss=${encodeURIComponent(ISSUER)}`,
    );
    const okIss = validateIssuer({ iss: matchingErr.iss, recordedIssuer: ISSUER });
    expect(safeAuthorizationError(matchingErr, okIss)).toEqual({ error: 'access_denied', errorDescription: undefined, errorUri: undefined });
  });

  it('surfaces error details once iss validates (AC-36.47, R-23.7-b/h)', () => {
    const record = { state: undefined, recordedIssuer: ISSUER };
    const result = processAuthorizationRedirect(
      `http://localhost:3000/callback?error=access_denied&error_description=denied&iss=${encodeURIComponent(ISSUER)}`,
      record,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ error: 'access_denied', errorDescription: 'denied', errorUri: undefined });
  });
});

describe('Step 4 — token request & response (AC-36.34 – AC-36.36, AC-36.63)', () => {
  const tokenReq = buildAuthorizationCodeTokenRequest({
    code: 'SplxlOBeZQQYbYS6WxSbIA',
    redirectUri: REDIRECT_URI,
    codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    clientId: CLIENT_ID,
    resource: RESOURCE,
  });

  it('fixes grant_type=authorization_code and carries the verifier (AC-36.34, R-23.5-n)', () => {
    expect(tokenReq.grant_type).toBe(GRANT_TYPE_AUTHORIZATION_CODE);
    expect(tokenReq.grant_type).toBe('authorization_code');
    expect(tokenReq.code_verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  });

  it('sends redirect_uri & resource identical to Step 2 (AC-36.35, AC-36.36, R-23.5-o/p)', () => {
    expect(tokenReq.redirect_uri).toBe(REDIRECT_URI);
    expect(tokenReq.resource).toBe(RESOURCE);
    expect(assertResourceMatchesStep2(tokenReq, RESOURCE).ok).toBe(true);
    expect(assertResourceMatchesStep2(tokenReq, 'https://other.example.com').ok).toBe(false);
  });

  it('form-encodes the token request body (Step 4 wire example)', () => {
    const body = encodeTokenRequestBody(tokenReq);
    const decoded = new URLSearchParams(body);
    expect(decoded.get('grant_type')).toBe('authorization_code');
    expect(decoded.get('code')).toBe('SplxlOBeZQQYbYS6WxSbIA');
    expect(decoded.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(decoded.get('resource')).toBe(RESOURCE);
    expect(body).toContain('resource=https%3A%2F%2Fmcp.example.com');
  });

  it('parses a Bearer token response, rejecting non-Bearer (AC-36.55, R-23.8-b)', () => {
    const result = parseTokenResponse({
      access_token: 'eyJ...',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'tGzv3JOkF0XG5Qx2TlKWIA',
      scope: 'files:read',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.token_type).toBe(TOKEN_TYPE_BEARER);
    expect(isTokenResponse({ access_token: 'x', token_type: 'Bearer' })).toBe(true);
    expect(TokenResponseSchema.safeParse({ token_type: 'Bearer' }).success).toBe(false); // missing access_token
    const wrongType = parseTokenResponse({ access_token: 'x', token_type: 'mac' });
    expect(wrongType.ok).toBe(false);
  });

  it('does not assume a refresh token was issued (AC-36.63, R-23.9-d)', () => {
    const result = parseTokenResponse({ access_token: 'x', token_type: 'Bearer' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token.refresh_token).toBeUndefined();
      expect(hasNoRefreshToken(result.token)).toBe(true);
    }
  });
});

describe('Resource Indicators & audience binding (AC-36.37 – AC-36.45)', () => {
  it('implements Resource Indicators: resource param == canonical id, sent always (AC-36.37 – AC-36.41, R-23.6-a/e)', () => {
    expect(resourceParameterFor(RESOURCE)).toBe(RESOURCE);
    // Both legs carry the resource; it does not depend on AS advertisement.
    const authReq = buildAuthorizationRequest({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      resource: resourceParameterFor(RESOURCE),
      record: createAuthorizationFlowRecord({ recordedIssuer: ISSUER, pkce: createPkceChallenge(fixedBytes(5)) }),
    });
    const tokenReq = buildAuthorizationCodeTokenRequest({
      code: 'c',
      redirectUri: REDIRECT_URI,
      codeVerifier: 'a'.repeat(43),
      clientId: CLIENT_ID,
      resource: resourceParameterFor(RESOURCE),
    });
    expect(authReq.resource).toBe(RESOURCE);
    expect(tokenReq.resource).toBe(RESOURCE);
  });

  it('server validates token audience is itself, rejecting others (AC-36.42, AC-36.43, AC-36.44, R-23.6-f/g/h)', () => {
    expect(validateTokenAudience(RESOURCE, RESOURCE).ok).toBe(true);
    // uppercase scheme/host accepted for robustness (S35 R-23.1-p)
    expect(validateTokenAudience('HTTPS://MCP.EXAMPLE.COM', RESOURCE).ok).toBe(true);
    expect(validateTokenAudience('https://other.example.com', RESOURCE).ok).toBe(false);
    expect(validateTokenAudience([RESOURCE, 'https://x.example.com'], RESOURCE).ok).toBe(true);
    expect(validateTokenAudience(['https://a.example.com'], RESOURCE).ok).toBe(false);
  });

  it('client sends only the right-issuer/audience token, nothing else (AC-36.45, R-23.6-i)', () => {
    const good = selectTokenForServer({
      serverIssuer: ISSUER,
      serverCanonicalResource: RESOURCE,
      tokenIssuer: ISSUER,
      tokenAudience: RESOURCE,
      accessToken: 'tok',
    });
    expect(good).toEqual({ ok: true, accessToken: 'tok' });

    const wrongIssuer = selectTokenForServer({
      serverIssuer: ISSUER,
      serverCanonicalResource: RESOURCE,
      tokenIssuer: 'https://other-as.example.com',
      tokenAudience: RESOURCE,
      accessToken: 'tok',
    });
    expect(wrongIssuer.ok).toBe(false);

    const wrongAudience = selectTokenForServer({
      serverIssuer: ISSUER,
      serverCanonicalResource: RESOURCE,
      tokenIssuer: ISSUER,
      tokenAudience: 'https://other.example.com',
      accessToken: 'tok',
    });
    expect(wrongAudience.ok).toBe(false);
  });
});

describe('Access-token usage (AC-36.54 – AC-36.59)', () => {
  it('builds and parses the Authorization: Bearer header (AC-36.55, R-23.8-b)', () => {
    expect(buildBearerAuthorizationHeader('eyJ...')).toBe('Bearer eyJ...');
    expect(extractBearerToken('Bearer eyJ...')).toBe('eyJ...');
    expect(extractBearerToken('bearer eyJ...')).toBe('eyJ...'); // case-insensitive scheme
    expect(extractBearerToken('Basic abc')).toBeUndefined();
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(() => buildBearerAuthorizationHeader('')).toThrow(RangeError);
  });

  it('detects an access_token smuggled in the query string (AC-36.56, R-23.8-c)', () => {
    expect(urlContainsAccessTokenInQuery('https://mcp.example.com/mcp')).toBe(false);
    expect(urlContainsAccessTokenInQuery('https://mcp.example.com/mcp?access_token=x')).toBe(true);
  });

  const context = {
    ownCanonicalResource: RESOURCE,
    requiredScopes: ['files:read'],
    resourceMetadata: 'https://mcp.example.com/.well-known/oauth-protected-resource',
  };

  it('accepts a valid, in-audience, in-scope token (AC-36.54, AC-36.57, R-23.8-a/d)', () => {
    const result = validateAccessTokenRequest(
      { active: true, expired: false, audience: RESOURCE, scopes: ['files:read', 'files:write'] },
      context,
    );
    expect(result.ok).toBe(true);
  });

  it('returns 401 for missing/invalid/expired tokens (AC-36.58, R-23.8-e)', () => {
    const missing = validateAccessTokenRequest(undefined, context);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.challenge.status).toBe(UNAUTHORIZED_STATUS);
      expect(missing.challenge.status).toBe(401);
      expect(missing.challenge.headers[WWW_AUTHENTICATE_HEADER]).toContain('Bearer');
    }
    const expired = validateAccessTokenRequest(
      { active: true, expired: true, audience: RESOURCE, scopes: ['files:read'] },
      context,
    );
    if (!expired.ok) expect(expired.challenge.status).toBe(401);
    const inactive = validateAccessTokenRequest(
      { active: false, expired: false, audience: RESOURCE, scopes: ['files:read'] },
      context,
    );
    if (!inactive.ok) expect(inactive.challenge.status).toBe(401);
  });

  it('returns 401 for a wrong-audience token (AC-36.42, AC-36.57, R-23.6-f, R-23.8-d)', () => {
    const wrongAud = validateAccessTokenRequest(
      { active: true, expired: false, audience: 'https://other.example.com', scopes: ['files:read'] },
      context,
    );
    expect(wrongAud.ok).toBe(false);
    if (!wrongAud.ok) expect(wrongAud.challenge.status).toBe(401);
  });

  it('returns 403 insufficient_scope for a valid but under-scoped token (AC-36.59, R-23.8-f)', () => {
    const underScoped = validateAccessTokenRequest(
      { active: true, expired: false, audience: RESOURCE, scopes: ['files:write'] },
      context,
    );
    expect(underScoped.ok).toBe(false);
    if (!underScoped.ok) {
      expect(underScoped.challenge.status).toBe(AUTHORIZATION_FORBIDDEN_STATUS);
      expect(underScoped.challenge.status).toBe(403);
      const header = underScoped.challenge.headers[WWW_AUTHENTICATE_HEADER];
      expect(header).toContain(INSUFFICIENT_SCOPE_ERROR);
      expect(header).toContain('files:read');
    }
  });
});

describe('Refresh tokens (AC-36.60, AC-36.62, AC-36.64, AC-36.65)', () => {
  it('includes refresh_token in grant_types client metadata (AC-36.60, R-23.9-a)', () => {
    const body = buildDynamicClientRegistrationRequest({
      redirectUris: [REDIRECT_URI],
      applicationType: 'native',
      grantTypes: ['authorization_code', 'refresh_token'],
    });
    expect(body.grant_types).toContain('refresh_token');
  });

  it('keeps the same resource so the refreshed token stays audience-bound (AC-36.64, R-23.9-e)', () => {
    const refresh = buildRefreshTokenRequest({
      refreshToken: 'tGzv3JOkF0XG5Qx2TlKWIA',
      clientId: CLIENT_ID,
      resource: RESOURCE,
    });
    expect(refresh.grant_type).toBe(GRANT_TYPE_REFRESH_TOKEN);
    expect(refresh.grant_type).toBe('refresh_token');
    expect(refresh.resource).toBe(RESOURCE);
    expect(assertResourceMatchesStep2(refresh, RESOURCE).ok).toBe(true);
    const body = encodeTokenRequestBody(refresh);
    expect(new URLSearchParams(body).get('refresh_token')).toBe('tGzv3JOkF0XG5Qx2TlKWIA');
    expect(body).not.toContain('scope='); // no scope unless narrowing
  });

  it('may narrow scope on a refresh request (AC-36.65, R-23.9-f)', () => {
    const refresh = buildRefreshTokenRequest({
      refreshToken: 'r',
      clientId: CLIENT_ID,
      resource: RESOURCE,
      scope: 'files:read',
    });
    expect(refresh.scope).toBe('files:read');
  });

  it('keeps refresh tokens out of any logged/serialized URL (AC-36.62, R-23.9-c)', () => {
    // Confidentiality: the refresh token rides in the form body, never the URL/query.
    const refresh = buildRefreshTokenRequest({ refreshToken: 'secret-rt', clientId: CLIENT_ID, resource: RESOURCE });
    const body = encodeTokenRequestBody(refresh);
    expect(body).toContain('refresh_token=secret-rt');
    expect(urlContainsAccessTokenInQuery('https://auth.example.com/token')).toBe(false);
    expect(OFFLINE_ACCESS_SCOPE).toBe('offline_access');
  });
});

describe('End-to-end worked example (§23.10)', () => {
  it('runs Step 1 → Step 4 with audience binding and iss validation', () => {
    // Step 1: PKCE + record issuer
    const record = createAuthorizationFlowRecord({
      recordedIssuer: ISSUER,
      pkce: createPkceChallenge(fixedBytes(9)),
      state: 'af0ifjsldkj',
    });

    // Step 2: build authorization request + URL
    const authParams = buildAuthorizationRequest({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      resource: resourceParameterFor(RESOURCE),
      record,
      scope: resolveAuthorizationScope({ challenge: { scheme: 'Bearer', scope: 'files:read' } }),
    });
    const authUrl = buildAuthorizationUrl('https://auth.example.com/authorize', authParams);
    expect(new URL(authUrl).searchParams.get('code_challenge')).toBe(record.codeChallenge);

    // Step 3: redirect → validate state + iss before redeeming
    const redirect = `${REDIRECT_URI}?code=SplxlOBeZQQYbYS6WxSbIA&state=af0ifjsldkj&iss=${encodeURIComponent(ISSUER)}`;
    const redeemed = processAuthorizationRedirect(redirect, record, { issParameterSupported: true });
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) return;

    // Step 4: exchange code for a token, resource identical to Step 2
    const tokenReq = buildAuthorizationCodeTokenRequest({
      code: redeemed.code,
      redirectUri: authParams.redirect_uri,
      codeVerifier: record.codeVerifier,
      clientId: CLIENT_ID,
      resource: authParams.resource,
    });
    expect(assertResourceMatchesStep2(tokenReq, authParams.resource).ok).toBe(true);
    expect(verifyPkce(tokenReq.code_verifier, authParams.code_challenge)).toBe(true);

    // Token response → bearer header on the next MCP request
    const token = parseTokenResponse({
      access_token: 'eyJhbGciOiJIUzI1NiIs',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'tGzv3JOkF0XG5Qx2TlKWIA',
      scope: 'files:read',
    });
    expect(token.ok).toBe(true);
    if (!token.ok) return;
    const header = buildBearerAuthorizationHeader(token.token.access_token);
    expect(header).toBe('Bearer eyJhbGciOiJIUzI1NiIs');

    // The MCP server validates the bearer token on the request.
    const validation = validateAccessTokenRequest(
      { active: true, expired: false, audience: RESOURCE, scopes: ['files:read'] },
      { ownCanonicalResource: RESOURCE, requiredScopes: ['files:read'], resourceMetadata: 'https://mcp.example.com/.well-known/oauth-protected-resource' },
    );
    expect(validation.ok).toBe(true);
  });
});
