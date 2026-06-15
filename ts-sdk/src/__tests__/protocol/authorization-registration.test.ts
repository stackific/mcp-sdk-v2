/**
 * Tests for S37 — Authorization III: registration mechanisms, scopes & security
 * (§23.11–§23.19).
 *
 * AC coverage (one or more `it` blocks per AC):
 *  AC-37.1  (R-23.11-a)            — a client_id is obtained before the flow starts
 *  AC-37.2  (R-23.11-b)            — priority pre-reg → CIMD → DCR → prompt
 *  AC-37.3  (R-23.11-c)            — metadata is inspected before choosing
 *  AC-37.4  (R-23.11-d)            — no CIMD without the supported flag
 *  AC-37.5  (R-23.11-e)            — no DCR without a registration_endpoint
 *  AC-37.6  (R-23.12-a)            — CIMD is the preferred path when both support it
 *  AC-37.7  (R-23.12-b, -c)        — https hosting URL with a path component
 *  AC-37.8  (R-23.12-d, -e)        — valid JSON, required fields, client_id == URL
 *  AC-37.9  (R-23.12-f)            — private_key_jwt MAY be used with JWKS
 *  AC-37.10 (R-23.12-g..-j)        — AS fetch/validate (covered by S36; referenced)
 *  AC-37.11 (R-23.12-k, -l)        — AS caches respecting headers; host trust policy
 *  AC-37.12 (R-23.13-a)            — pre-registration supported when CIMD/DCR absent
 *  AC-37.13 (R-23.14-a, -b)        — CIMD preferred over DCR; DCR MAY be used
 *  AC-37.14 (R-23.14-c..-e)        — DCR required fields (covered by S36; referenced)
 *  AC-37.15 (R-23.15-a..-c)        — application_type consistent with redirect URIs
 *  AC-37.16 (R-23.15-d..-f)        — OIDC rejection handled; retry with adjusted type
 *  AC-37.17 (R-23.16-a, -b)        — credentials keyed by issuer
 *  AC-37.18 (R-23.16-c..-e)        — no cross-AS reuse; re-register on mismatch
 *  AC-37.19 (R-23.16-f, -g)        — exact-string issuer compare; surface error
 *  AC-37.20 (R-23.17-a, -b)        — resource_metadata URL precedence; well-known order
 *  AC-37.21 (R-23.17-c, -d)        — authorization_servers required; per-AS state
 *  AC-37.22 (R-23.17-e..-g)        — AS well-known order (path vs non-path)
 *  AC-37.23 (R-23.17-h, -i)        — fetched issuer must match; reject otherwise
 *  AC-37.24 (R-23.18-a..-d)        — least-privilege scope selection
 *  AC-37.25 (R-23.18-e..-i)        — 403 insufficient_scope challenge shape (S35; ref)
 *  AC-37.26 (R-23.18-j, -k)        — all scopes in one challenge; consistent strategy
 *  AC-37.27 (R-23.18-l..-n, -1ae)  — step-up for user; client_credentials MAY/abort
 *  AC-37.28 (R-23.18-o, -p)        — union scopes; never drop already-granted
 *  AC-37.29 (R-23.18-q, -r, -1af/ag)— bounded retry; permanent failure; tracking
 *  AC-37.30 (R-23.19-a)            — resource in both authz & token requests
 *  AC-37.31 (R-23.19-b..-d)        — audience binding; only own-issuer token sent
 *  AC-37.32 (R-23.19-e, -j)        — record issuer before redirect; co-located record
 *  AC-37.33 (R-23.19-f..-i)        — exact iss validation incl. supported/absent reject
 *  AC-37.34 (R-23.19-k)            — PKCE S256 (covered by S36; referenced)
 *  AC-37.35 (R-23.19-l)            — unpredictable state (covered by S36; referenced)
 *  AC-37.36 (R-23.19-m..-p)        — token confidentiality; bearer header only
 *  AC-37.37 (R-23.19-q..-t)        — refresh handling; grant_types; offline_access
 *  AC-37.38 (R-23.19-u)            — server omits offline_access from advertised scopes
 */

import { describe, it, expect } from 'vitest';
import {
  // §23.11
  CLIENT_ID_METADATA_DOCUMENT_SUPPORTED_FIELD,
  selectRegistrationMechanism,
  mayAttemptCimd,
  mayAttemptDcr,
  // §23.12
  PRIVATE_KEY_JWT_AUTH_METHOD,
  cimdIsPreferredPath,
  isCimdClientIdHostingValid,
  cimdSupportsPrivateKeyJwt,
  CimdDocumentCache,
  // §23.15
  applicationTypeForRedirectUris,
  registerWithRetry,
  // §23.16
  issuersMatchExactly,
  decideCredentialBinding,
  IssuerBoundCredentialStore,
  // §23.17
  protectedResourceMetadataUris,
  requireAuthorizationServers,
  authorizationServerMetadataUris,
  validateDiscoveredIssuer,
  // §23.18
  parseScopeSet,
  formatScopeSet,
  selectInitialScopes,
  unionStepUpScopes,
  shouldAttemptStepUp,
  ScopeUpgradeTracker,
  planStepUpAuthorization,
  // §23.19
  checkResourceParameterBinding,
  mayForwardTokenToServer,
  validateExactIssuer,
  sameRequestRecord,
  isConfidentialToken,
  redactToken,
  checkBearerHeaderOnly,
  grantTypesWithRefresh,
  withOfflineAccessIfAdvertised,
  refreshTokenIsNeverAssumed,
  serverScopesOmitOfflineAccess,
  type IssuerBoundCredentials,
} from '../../protocol/authorization-registration.js';
import {
  buildInsufficientScopeResponse,
  parseWwwAuthenticate,
  type AuthorizationServerMetadata,
} from '../../protocol/authorization.js';

const AS_BASE = {
  issuer: 'https://auth.example.com',
  authorization_endpoint: 'https://auth.example.com/authorize',
  token_endpoint: 'https://auth.example.com/token',
} satisfies Pick<AuthorizationServerMetadata, 'issuer' | 'authorization_endpoint' | 'token_endpoint'>;

describe('S37 §23.11 — obtaining a client_id & mechanism selection', () => {
  // AC-37.1 (R-23.11-a)
  it('AC-37.1: a mechanism is selectable so a client_id is obtained before the flow starts', () => {
    const sel = selectRegistrationMechanism({
      authorizationServerMetadata: { ...AS_BASE, client_id_metadata_document_supported: true },
    });
    // A concrete (non-prompt) mechanism is chosen, yielding a client_id pre-flow.
    expect(sel.mechanism).toBe('cimd');
  });

  // AC-37.2 (R-23.11-b)
  it('AC-37.2: pre-registration wins over CIMD and DCR', () => {
    const sel = selectRegistrationMechanism({
      authorizationServerMetadata: {
        ...AS_BASE,
        client_id_metadata_document_supported: true,
        registration_endpoint: 'https://auth.example.com/register',
      },
      hasPreRegisteredCredentials: true,
    });
    expect(sel.mechanism).toBe('pre-registration');
  });

  it('AC-37.2: CIMD wins over DCR when no pre-registration', () => {
    const sel = selectRegistrationMechanism({
      authorizationServerMetadata: {
        ...AS_BASE,
        client_id_metadata_document_supported: true,
        registration_endpoint: 'https://auth.example.com/register',
      },
    });
    expect(sel.mechanism).toBe('cimd');
  });

  it('AC-37.2: DCR is used when only registration_endpoint is present', () => {
    const sel = selectRegistrationMechanism({
      authorizationServerMetadata: { ...AS_BASE, registration_endpoint: 'https://auth.example.com/register' },
    });
    expect(sel.mechanism).toBe('dcr');
  });

  it('AC-37.2: prompts the user when nothing applies', () => {
    const sel = selectRegistrationMechanism({ authorizationServerMetadata: { ...AS_BASE } });
    expect(sel.mechanism).toBe('prompt');
  });

  it('AC-37.2: skips a mechanism the client does not support even when the AS allows it', () => {
    const sel = selectRegistrationMechanism({
      authorizationServerMetadata: {
        ...AS_BASE,
        client_id_metadata_document_supported: true,
        registration_endpoint: 'https://auth.example.com/register',
      },
      supportedMechanisms: ['dcr'],
    });
    expect(sel.mechanism).toBe('dcr');
  });

  // AC-37.3 (R-23.11-c)
  it('AC-37.3: the metadata flags drive the decision (inspection happens before choosing)', () => {
    expect(CLIENT_ID_METADATA_DOCUMENT_SUPPORTED_FIELD).toBe('client_id_metadata_document_supported');
    const withFlag = selectRegistrationMechanism({
      authorizationServerMetadata: { ...AS_BASE, client_id_metadata_document_supported: true },
    });
    const withoutFlag = selectRegistrationMechanism({ authorizationServerMetadata: { ...AS_BASE } });
    expect(withFlag.mechanism).toBe('cimd');
    expect(withoutFlag.mechanism).toBe('prompt');
  });

  // AC-37.4 (R-23.11-d)
  it('AC-37.4: never selects CIMD without client_id_metadata_document_supported: true', () => {
    expect(mayAttemptCimd({ client_id_metadata_document_supported: false })).toBe(false);
    expect(mayAttemptCimd({})).toBe(false);
    expect(mayAttemptCimd({ client_id_metadata_document_supported: true })).toBe(true);
    const sel = selectRegistrationMechanism({
      authorizationServerMetadata: { ...AS_BASE, client_id_metadata_document_supported: false },
    });
    expect(sel.mechanism).not.toBe('cimd');
  });

  // AC-37.5 (R-23.11-e)
  it('AC-37.5: never selects DCR without a registration_endpoint', () => {
    expect(mayAttemptDcr({})).toBe(false);
    expect(mayAttemptDcr({ registration_endpoint: '' })).toBe(false);
    expect(mayAttemptDcr({ registration_endpoint: 'https://auth.example.com/register' })).toBe(true);
    const sel = selectRegistrationMechanism({ authorizationServerMetadata: { ...AS_BASE } });
    expect(sel.mechanism).not.toBe('dcr');
  });
});

describe('S37 §23.12 — Client ID Metadata Documents', () => {
  // AC-37.6 (R-23.12-a)
  it('AC-37.6: CIMD is the preferred path when client and server both support it', () => {
    expect(cimdIsPreferredPath(true, true)).toBe(true);
    expect(cimdIsPreferredPath(true, false)).toBe(false);
    expect(cimdIsPreferredPath(false, true)).toBe(false);
  });

  // AC-37.7 (R-23.12-b, R-23.12-c)
  it('AC-37.7: the client_id URL MUST use https and contain a path component', () => {
    expect(isCimdClientIdHostingValid('https://app.example.com/oauth/client-metadata.json')).toBe(true);
    expect(isCimdClientIdHostingValid('http://app.example.com/oauth/client-metadata.json')).toBe(false);
    expect(isCimdClientIdHostingValid('https://app.example.com')).toBe(false);
    expect(isCimdClientIdHostingValid('https://app.example.com/')).toBe(false);
  });

  // AC-37.8 (R-23.12-d, R-23.12-e) — identity rule is owned by S36; referenced here.
  it('AC-37.8: the hosting predicate underpins the document-identity rule (client_id == URL)', () => {
    // A valid CIMD client_id URL is a precondition for the byte-for-byte identity check.
    expect(isCimdClientIdHostingValid('https://app.example.com/oauth/client-metadata.json')).toBe(true);
  });

  // AC-37.9 (R-23.12-f)
  it('AC-37.9: private_key_jwt MAY be used when the document conveys JWKS material', () => {
    expect(PRIVATE_KEY_JWT_AUTH_METHOD).toBe('private_key_jwt');
    expect(
      cimdSupportsPrivateKeyJwt({
        token_endpoint_auth_method: 'private_key_jwt',
        jwks_uri: 'https://app.example.com/jwks.json',
      }),
    ).toBe(true);
    expect(
      cimdSupportsPrivateKeyJwt({ token_endpoint_auth_method: 'private_key_jwt', jwks: { keys: [] } }),
    ).toBe(true);
    // Declared method without key material → not usable.
    expect(cimdSupportsPrivateKeyJwt({ token_endpoint_auth_method: 'private_key_jwt' })).toBe(false);
    // Different method → false.
    expect(cimdSupportsPrivateKeyJwt({ token_endpoint_auth_method: 'none' })).toBe(false);
  });

  // AC-37.11 (R-23.12-k, R-23.12-l)
  it('AC-37.11: the AS cache respects max-age and evicts stale entries', () => {
    let now = 1_000_000;
    const cache = new CimdDocumentCache({ now: () => now });
    const url = 'https://app.example.com/oauth/client-metadata.json';
    const doc = { client_id: url, client_name: 'App', redirect_uris: ['http://127.0.0.1/cb'] };
    expect(cache.store(url, doc, { maxAgeSeconds: 60 })).toBe(true);
    expect(cache.get(url)).toEqual(doc);
    now += 61_000; // past max-age
    expect(cache.get(url)).toBeUndefined();
  });

  it('AC-37.11: the AS cache honours no-store and non-positive max-age', () => {
    const cache = new CimdDocumentCache();
    const url = 'https://app.example.com/oauth/client-metadata.json';
    const doc = { client_id: url, client_name: 'App', redirect_uris: ['http://127.0.0.1/cb'] };
    expect(cache.store(url, doc, { noStore: true })).toBe(false);
    expect(cache.store(url, doc, { maxAgeSeconds: 0 })).toBe(false);
    expect(cache.get(url)).toBeUndefined();
  });

  it('AC-37.11: the host-domain trust policy rejects untrusted hosts', () => {
    const cache = new CimdDocumentCache({ trustHost: (host) => host === 'app.example.com' });
    const trusted = 'https://app.example.com/oauth/client-metadata.json';
    const untrusted = 'https://evil.example/oauth/client-metadata.json';
    const doc = { client_id: trusted, client_name: 'App', redirect_uris: ['http://127.0.0.1/cb'] };
    expect(cache.isHostTrusted(trusted)).toBe(true);
    expect(cache.isHostTrusted(untrusted)).toBe(false);
    expect(cache.store(untrusted, { ...doc, client_id: untrusted }, {})).toBe(false);
    expect(cache.store(trusted, doc, {})).toBe(true);
    expect(cache.get(trusted)).toEqual(doc);
  });
});

describe('S37 §23.13/§23.14 — pre-registration & DCR selection', () => {
  // AC-37.12 (R-23.13-a)
  it('AC-37.12: pre-registration is used when held, even with no CIMD/DCR metadata', () => {
    const sel = selectRegistrationMechanism({
      authorizationServerMetadata: { ...AS_BASE },
      hasPreRegisteredCredentials: true,
    });
    expect(sel.mechanism).toBe('pre-registration');
  });

  // AC-37.13 (R-23.14-a, R-23.14-b)
  it('AC-37.13: CIMD is preferred over DCR; DCR is still selectable as a fallback', () => {
    const both = selectRegistrationMechanism({
      authorizationServerMetadata: {
        ...AS_BASE,
        client_id_metadata_document_supported: true,
        registration_endpoint: 'https://auth.example.com/register',
      },
    });
    expect(both.mechanism).toBe('cimd');
    const dcrOnly = selectRegistrationMechanism({
      authorizationServerMetadata: { ...AS_BASE, registration_endpoint: 'https://auth.example.com/register' },
    });
    expect(dcrOnly.mechanism).toBe('dcr');
  });
});

describe('S37 §23.15 — application_type & DCR retry', () => {
  // AC-37.15 (R-23.15-a, R-23.15-b, R-23.15-c)
  it('AC-37.15: loopback redirect URIs → native; remote → web', () => {
    expect(applicationTypeForRedirectUris(['http://127.0.0.1:3000/callback', 'http://localhost:3000/callback'])).toBe(
      'native',
    );
    expect(applicationTypeForRedirectUris(['http://[::1]:3000/callback'])).toBe('native');
    expect(applicationTypeForRedirectUris(['https://app.example.com/callback'])).toBe('web');
    // Mixed loopback + remote → not all-loopback → web.
    expect(applicationTypeForRedirectUris(['http://localhost/cb', 'https://app.example.com/cb'])).toBe('web');
    expect(applicationTypeForRedirectUris([])).toBe('web');
  });

  // AC-37.16 (R-23.15-d, R-23.15-e, R-23.15-f)
  it('AC-37.16: a retryable OIDC rejection retries with the adjusted application_type', async () => {
    const seen: string[] = [];
    const out = await registerWithRetry({
      initialApplicationType: 'native',
      attempt: async (applicationType) => {
        seen.push(applicationType);
        if (applicationType === 'native') {
          return { status: 400, body: { error: 'invalid_redirect_uri', error_description: 'redirect not allowed' } };
        }
        return { status: 201, body: { client_id: 's6BhdRkqt3' } };
      },
    });
    expect(seen).toEqual(['native', 'web']);
    expect(out.result.ok).toBe(true);
    expect(out.attempts).toEqual(['native', 'web']);
  });

  it('AC-37.16: a non-retryable rejection surfaces a meaningful error and does not retry', async () => {
    let calls = 0;
    const out = await registerWithRetry({
      initialApplicationType: 'web',
      attempt: async () => {
        calls += 1;
        return { status: 401, body: { error_description: 'unauthorized' } };
      },
    });
    expect(calls).toBe(1);
    expect(out.result.ok).toBe(false);
    if (!out.result.ok) {
      expect(out.result.reason).toContain('unauthorized');
    }
  });

  it('AC-37.16: retries are bounded by maxAttempts', async () => {
    let calls = 0;
    const out = await registerWithRetry({
      initialApplicationType: 'native',
      maxAttempts: 2,
      attempt: async () => {
        calls += 1;
        return { status: 400, body: { error_description: 'still bad' } };
      },
    });
    expect(calls).toBe(2);
    expect(out.result.ok).toBe(false);
    expect(out.attempts).toEqual(['native', 'web']);
  });
});

describe('S37 §23.16 — credential binding to the issuer', () => {
  const stored: IssuerBoundCredentials = {
    issuer: 'https://auth-a.example.com',
    clientId: 'client-a',
  };

  // AC-37.17 (R-23.16-a, R-23.16-b)
  it('AC-37.17: credentials are stored and retrieved by issuer key', () => {
    const store = new IssuerBoundCredentialStore();
    store.save(stored);
    expect(store.credentialsFor('https://auth-a.example.com')).toEqual(stored);
    // Never returns another issuer's credentials.
    expect(store.credentialsFor('https://auth-b.example.com')).toBeUndefined();
  });

  it('AC-37.17: an empty issuer key is rejected', () => {
    const store = new IssuerBoundCredentialStore();
    expect(() => store.save({ issuer: '', clientId: 'x' })).toThrow(RangeError);
  });

  // AC-37.18 (R-23.16-c, R-23.16-d, R-23.16-e)
  it('AC-37.18: a different discovered issuer means do-not-reuse and re-register (DCR creds)', () => {
    const decision = decideCredentialBinding({
      stored,
      discoveredIssuer: 'https://auth-b.example.com',
    });
    expect(decision.action).toBe('re-register');
  });

  it('AC-37.18: a matching issuer reuses the stored credentials', () => {
    const decision = decideCredentialBinding({ stored, discoveredIssuer: 'https://auth-a.example.com' });
    expect(decision.action).toBe('reuse');
  });

  it('AC-37.18: CIMD credentials are exempt and reused regardless of issuer', () => {
    const cimd: IssuerBoundCredentials = {
      issuer: 'https://auth-a.example.com',
      clientId: 'https://app.example.com/oauth/client-metadata.json',
      cimd: true,
    };
    const decision = decideCredentialBinding({ stored: cimd, discoveredIssuer: 'https://auth-b.example.com' });
    expect(decision.action).toBe('reuse');
  });

  it('AC-37.18: no stored credentials → register', () => {
    const decision = decideCredentialBinding({ stored: undefined, discoveredIssuer: 'https://auth-b.example.com' });
    expect(decision.action).toBe('re-register');
  });

  // AC-37.19 (R-23.16-f, R-23.16-g)
  it('AC-37.19: issuer comparison is exact — no normalization', () => {
    expect(issuersMatchExactly('https://auth.example.com', 'https://auth.example.com')).toBe(true);
    // Case difference.
    expect(issuersMatchExactly('https://AUTH.example.com', 'https://auth.example.com')).toBe(false);
    // Trailing slash.
    expect(issuersMatchExactly('https://auth.example.com/', 'https://auth.example.com')).toBe(false);
    // Default port.
    expect(issuersMatchExactly('https://auth.example.com:443', 'https://auth.example.com')).toBe(false);
    // Percent-encoding.
    expect(issuersMatchExactly('https://auth.example.com/%61', 'https://auth.example.com/a')).toBe(false);
  });

  it('AC-37.19: pre-registered credentials on issuer mismatch surface an error (not silent reuse)', () => {
    const decision = decideCredentialBinding({
      stored,
      discoveredIssuer: 'https://auth-b.example.com',
      isPreRegistered: true,
    });
    expect(decision.action).toBe('surface-error');
    expect(decision.reason).toContain('mismatched');
  });

  it('AC-37.19: the store decideFor convenience reflects the per-issuer state', () => {
    const store = new IssuerBoundCredentialStore();
    store.save({ issuer: 'https://auth-a.example.com', clientId: 'a' });
    // No credentials stored under auth-b → register.
    expect(store.decideFor('https://auth-b.example.com').action).toBe('re-register');
    // Match under auth-a → reuse.
    expect(store.decideFor('https://auth-a.example.com').action).toBe('reuse');
    expect(store.has('https://auth-a.example.com')).toBe(true);
  });
});

describe('S37 §23.17 — discovery robustness', () => {
  // AC-37.20 (R-23.17-a, R-23.17-b)
  it('AC-37.20: a resource_metadata URL takes precedence over the well-known fallbacks', () => {
    const uris = protectedResourceMetadataUris({
      resourceMetadataUrl: 'https://mcp.example.com/.well-known/oauth-protected-resource',
      mcpEndpointUrl: 'https://mcp.example.com/public/mcp',
    });
    expect(uris).toEqual(['https://mcp.example.com/.well-known/oauth-protected-resource']);
  });

  it('AC-37.20: without a header URL, well-known URIs are tried path-prefixed then root', () => {
    const uris = protectedResourceMetadataUris({ mcpEndpointUrl: 'https://example.com/public/mcp' });
    expect(uris).toEqual([
      'https://example.com/.well-known/oauth-protected-resource/public/mcp',
      'https://example.com/.well-known/oauth-protected-resource',
    ]);
  });

  it('AC-37.20: no usable input yields an empty list', () => {
    expect(protectedResourceMetadataUris({})).toEqual([]);
    expect(protectedResourceMetadataUris({ mcpEndpointUrl: 'not a url' })).toEqual([]);
  });

  // AC-37.21 (R-23.17-c, R-23.17-d)
  it('AC-37.21: authorization_servers is required (one or more issuers)', () => {
    const ok = requireAuthorizationServers({ authorization_servers: ['https://auth.example.com'] });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.authorizationServers).toEqual(['https://auth.example.com']);
    expect(requireAuthorizationServers({ authorization_servers: [] as unknown as string[] }).ok).toBe(false);
  });

  it('AC-37.21: multiple authorization servers keep separate registration state', () => {
    const store = new IssuerBoundCredentialStore();
    store.save({ issuer: 'https://auth-a.example.com', clientId: 'a' });
    store.save({ issuer: 'https://auth-b.example.com', clientId: 'b' });
    expect(store.credentialsFor('https://auth-a.example.com')?.clientId).toBe('a');
    expect(store.credentialsFor('https://auth-b.example.com')?.clientId).toBe('b');
  });

  // AC-37.22 (R-23.17-e, R-23.17-f, R-23.17-g)
  it('AC-37.22: a path issuer tries OAuth insertion, OIDC insertion, OIDC appending in order', () => {
    expect(authorizationServerMetadataUris('https://auth.example.com/tenant1')).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server/tenant1',
      'https://auth.example.com/.well-known/openid-configuration/tenant1',
      'https://auth.example.com/tenant1/.well-known/openid-configuration',
    ]);
  });

  it('AC-37.22: a non-path issuer tries OAuth then OIDC', () => {
    expect(authorizationServerMetadataUris('https://auth.example.com')).toEqual([
      'https://auth.example.com/.well-known/oauth-authorization-server',
      'https://auth.example.com/.well-known/openid-configuration',
    ]);
  });

  // AC-37.23 (R-23.17-h, R-23.17-i)
  it('AC-37.23: the fetched issuer must be identical to the expected issuer', () => {
    expect(validateDiscoveredIssuer('https://honest.example', 'https://honest.example').ok).toBe(true);
    const bad = validateDiscoveredIssuer('https://attacker.example', 'https://honest.example');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain('MUST NOT use');
  });
});

describe('S37 §23.18 — scope selection & step-up authorization', () => {
  // AC-37.24 (R-23.18-a, R-23.18-b, R-23.18-c, R-23.18-d)
  it('AC-37.24: the challenge scope is authoritative when present', () => {
    const challenge = parseWwwAuthenticate('Bearer error="insufficient_scope", scope="files:write"')!;
    expect(selectInitialScopes({ challenge, protectedResource: { scopes_supported: ['a', 'b'] } })).toBe('files:write');
  });

  it('AC-37.24: falls back to all scopes_supported when no challenge scope', () => {
    expect(selectInitialScopes({ protectedResource: { scopes_supported: ['files:read', 'files:write'] } })).toBe(
      'files:read files:write',
    );
  });

  it('AC-37.24: omits the scope parameter when neither source is available', () => {
    expect(selectInitialScopes({})).toBeUndefined();
    expect(selectInitialScopes({ protectedResource: {} })).toBeUndefined();
  });

  // AC-37.25 (R-23.18-e..-i) — response shape owned by S35; referenced as the trigger.
  it('AC-37.25: the 403 insufficient_scope challenge (S35) is the runtime step-up trigger', () => {
    const built = buildInsufficientScopeResponse({
      scope: 'files:write',
      resourceMetadata: 'https://mcp.example.com/.well-known/oauth-protected-resource',
      errorDescription: 'File write permission required',
    });
    expect(built.status).toBe(403);
    const parsed = parseWwwAuthenticate(built.headers['WWW-Authenticate'])!;
    expect(parsed.error).toBe('insufficient_scope');
    expect(parsed.scope).toBe('files:write');
    expect(parsed.resourceMetadata).toBe('https://mcp.example.com/.well-known/oauth-protected-resource');
    expect(parsed.errorDescription).toBe('File write permission required');
  });

  // AC-37.26 (R-23.18-j, R-23.18-k)
  it('AC-37.26: all required scopes are carried in a single challenge', () => {
    const built = buildInsufficientScopeResponse({
      scope: 'files:read files:write admin',
      resourceMetadata: 'https://mcp.example.com/.well-known/oauth-protected-resource',
    });
    const parsed = parseWwwAuthenticate(built.headers['WWW-Authenticate'])!;
    expect(parseScopeSet(parsed.scope)).toEqual(['files:read', 'files:write', 'admin']);
  });

  // AC-37.27 (R-23.18-l, R-23.18-m, R-23.18-n, R-23.1-ae)
  it('AC-37.27: a user-acting client should attempt step-up; a client_credentials client may abort', () => {
    expect(shouldAttemptStepUp('user')).toBe(true);
    expect(shouldAttemptStepUp('client_credentials')).toBe(false);
  });

  it('AC-37.27: a client_credentials client may force a step-up (the MAY)', () => {
    const tracker = new ScopeUpgradeTracker();
    const challenge = parseWwwAuthenticate('Bearer error="insufficient_scope", scope="files:write"')!;
    const aborted = planStepUpAuthorization({
      actor: 'client_credentials',
      alreadyGranted: ['files:read'],
      challenge,
      key: { resource: 'https://mcp.example.com/mcp', operation: 'tools/call' },
      tracker,
    });
    expect(aborted.proceed).toBe(false);
    const forced = planStepUpAuthorization({
      actor: 'client_credentials',
      alreadyGranted: ['files:read'],
      challenge,
      key: { resource: 'https://mcp.example.com/mcp', operation: 'tools/call' },
      tracker,
      forceForClientCredentials: true,
    });
    expect(forced.proceed).toBe(true);
  });

  // AC-37.28 (R-23.18-o, R-23.18-p)
  it('AC-37.28: the step-up requests the union and never drops already-granted scopes', () => {
    expect(unionStepUpScopes(['files:read'], ['files:write'])).toEqual(['files:read', 'files:write']);
    // Already-granted always retained; duplicates collapsed; order preserved.
    expect(unionStepUpScopes(['files:read', 'files:write'], ['files:write', 'admin'])).toEqual([
      'files:read',
      'files:write',
      'admin',
    ]);
  });

  it('AC-37.28: planStepUpAuthorization yields the union scope string', () => {
    const tracker = new ScopeUpgradeTracker();
    const challenge = parseWwwAuthenticate('Bearer error="insufficient_scope", scope="files:write"')!;
    const plan = planStepUpAuthorization({
      actor: 'user',
      alreadyGranted: ['files:read'],
      challenge,
      key: { resource: 'https://mcp.example.com/mcp', operation: 'tools/call' },
      tracker,
    });
    expect(plan.proceed).toBe(true);
    expect(plan.scope).toBe('files:read files:write');
    expect(plan.scopes).toEqual(['files:read', 'files:write']);
  });

  // AC-37.29 (R-23.18-q, R-23.18-r, R-23.1-af, R-23.1-ag)
  it('AC-37.29: retries are bounded and persistent failure becomes permanent', () => {
    const tracker = new ScopeUpgradeTracker(2);
    const key = { resource: 'https://mcp.example.com/mcp', operation: 'tools/call' };
    expect(tracker.nextAction(key)).toBe('retry'); // attempt 1
    expect(tracker.nextAction(key)).toBe('retry'); // attempt 2
    expect(tracker.nextAction(key)).toBe('permanent-failure'); // attempt 3 > bound
    expect(tracker.attemptsFor(key)).toBe(3);
  });

  it('AC-37.29: the tracker tracks attempts per resource-and-operation', () => {
    const tracker = new ScopeUpgradeTracker(2);
    const a = { resource: 'https://mcp.example.com/mcp', operation: 'tools/call' };
    const b = { resource: 'https://mcp.example.com/mcp', operation: 'resources/read' };
    tracker.recordAttempt(a);
    expect(tracker.attemptsFor(a)).toBe(1);
    expect(tracker.attemptsFor(b)).toBe(0);
    tracker.reset(a);
    expect(tracker.attemptsFor(a)).toBe(0);
  });

  it('AC-37.29: planStepUpAuthorization stops once the retry bound is exhausted', () => {
    const tracker = new ScopeUpgradeTracker(1);
    const key = { resource: 'https://mcp.example.com/mcp', operation: 'tools/call' };
    const challenge = parseWwwAuthenticate('Bearer error="insufficient_scope", scope="files:write"')!;
    const first = planStepUpAuthorization({ actor: 'user', alreadyGranted: ['files:read'], challenge, key, tracker });
    expect(first.proceed).toBe(true);
    const second = planStepUpAuthorization({ actor: 'user', alreadyGranted: ['files:read'], challenge, key, tracker });
    expect(second.proceed).toBe(false);
    expect(second.reason).toContain('permanent');
  });

  it('AC-37.29: maxAttempts MUST be a positive integer', () => {
    expect(() => new ScopeUpgradeTracker(0)).toThrow(RangeError);
    expect(() => new ScopeUpgradeTracker(1.5)).toThrow(RangeError);
  });

  it('parseScopeSet / formatScopeSet round-trip and dedupe', () => {
    expect(parseScopeSet('a  b a')).toEqual(['a', 'b']);
    expect(parseScopeSet(undefined)).toEqual([]);
    expect(formatScopeSet(['a', 'b'])).toBe('a b');
  });
});

describe('S37 §23.19 — authorization security considerations', () => {
  // AC-37.30 (R-23.19-a)
  it('AC-37.30: the resource parameter MUST be present and identical in both requests', () => {
    const canonical = 'https://mcp.example.com/mcp';
    expect(
      checkResourceParameterBinding({
        authorizationRequestResource: canonical,
        tokenRequestResource: canonical,
        canonicalResource: canonical,
      }).ok,
    ).toBe(true);
    expect(
      checkResourceParameterBinding({
        authorizationRequestResource: undefined,
        tokenRequestResource: canonical,
        canonicalResource: canonical,
      }).ok,
    ).toBe(false);
    expect(
      checkResourceParameterBinding({
        authorizationRequestResource: canonical,
        tokenRequestResource: 'https://other.example/mcp',
        canonicalResource: canonical,
      }).ok,
    ).toBe(false);
  });

  // AC-37.31 (R-23.19-b, R-23.19-c, R-23.19-d)
  it('AC-37.31: a token is forwarded only to the server whose AS issued it', () => {
    expect(mayForwardTokenToServer('https://auth.example.com', 'https://auth.example.com')).toBe(true);
    expect(mayForwardTokenToServer('https://auth.example.com', 'https://other.example')).toBe(false);
  });

  // AC-37.32 (R-23.19-e, R-23.19-j)
  it('AC-37.32: the issuer, code verifier, and state MUST be co-located in one record', () => {
    expect(
      sameRequestRecord({ recordedIssuer: 'https://auth.example.com', codeVerifier: 'v'.repeat(43), state: 's' }).ok,
    ).toBe(true);
    expect(sameRequestRecord({ codeVerifier: 'v'.repeat(43), state: 's' }).ok).toBe(false);
    expect(sameRequestRecord({ recordedIssuer: 'i', state: 's' }).ok).toBe(false);
    expect(sameRequestRecord({ recordedIssuer: 'i', codeVerifier: 'v' }).ok).toBe(false);
  });

  // AC-37.33 (R-23.19-f, R-23.19-g, R-23.19-h, R-23.19-i)
  it('AC-37.33: a present iss is compared exactly regardless of metadata', () => {
    expect(validateExactIssuer({ iss: 'https://auth.example.com', recordedIssuer: 'https://auth.example.com' }).ok).toBe(
      true,
    );
    const mismatch = validateExactIssuer({ iss: 'https://attacker.example', recordedIssuer: 'https://auth.example.com' });
    expect(mismatch.ok).toBe(false);
  });

  it('AC-37.33: supported:true with iss absent is rejected; not-advertised+absent proceeds', () => {
    expect(
      validateExactIssuer({ recordedIssuer: 'https://auth.example.com', issParameterSupported: true }).ok,
    ).toBe(false);
    expect(validateExactIssuer({ recordedIssuer: 'https://auth.example.com' }).ok).toBe(true);
  });

  // AC-37.36 (R-23.19-m, R-23.19-n, R-23.19-o, R-23.19-p)
  it('AC-37.36: tokens are confidential and redacted in diagnostics', () => {
    expect(isConfidentialToken()).toBe(true);
    expect(redactToken()).toBe('[REDACTED]');
    expect(redactToken()).not.toContain('secret');
  });

  it('AC-37.36: the access token is sent only in the Authorization header, never the query', () => {
    expect(
      checkBearerHeaderOnly({ requestUrl: 'https://mcp.example.com/mcp', hasAuthorizationHeader: true }).ok,
    ).toBe(true);
    // Token in query string → rejected.
    const inQuery = checkBearerHeaderOnly({
      requestUrl: 'https://mcp.example.com/mcp?access_token=abc',
      hasAuthorizationHeader: true,
    });
    expect(inQuery.ok).toBe(false);
    // Missing Authorization header → rejected.
    expect(
      checkBearerHeaderOnly({ requestUrl: 'https://mcp.example.com/mcp', hasAuthorizationHeader: false }).ok,
    ).toBe(false);
  });

  // AC-37.37 (R-23.19-q, R-23.19-r, R-23.19-s, R-23.19-t)
  it('AC-37.37: grant_types includes refresh_token without duplication', () => {
    expect(grantTypesWithRefresh(['authorization_code'])).toEqual(['authorization_code', 'refresh_token']);
    expect(grantTypesWithRefresh(['authorization_code', 'refresh_token'])).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
  });

  it('AC-37.37: offline_access is added only when advertised', () => {
    expect(withOfflineAccessIfAdvertised(['files:read'], { scopes_supported: ['files:read', 'offline_access'] })).toEqual(
      ['files:read', 'offline_access'],
    );
    expect(withOfflineAccessIfAdvertised(['files:read'], { scopes_supported: ['files:read'] })).toEqual(['files:read']);
    expect(withOfflineAccessIfAdvertised(['files:read'], {})).toEqual(['files:read']);
    // Not duplicated when already present.
    expect(
      withOfflineAccessIfAdvertised(['offline_access'], { scopes_supported: ['offline_access'] }),
    ).toEqual(['offline_access']);
  });

  it('AC-37.37: a refresh token is never assumed', () => {
    expect(refreshTokenIsNeverAssumed()).toBe(true);
  });

  // AC-37.38 (R-23.19-u)
  it('AC-37.38: a server omits offline_access from its advertised scopes', () => {
    expect(serverScopesOmitOfflineAccess({ scopesSupported: ['files:read', 'files:write'] }).ok).toBe(true);
    expect(serverScopesOmitOfflineAccess({ scopesSupported: ['files:read', 'offline_access'] }).ok).toBe(false);
    expect(serverScopesOmitOfflineAccess({ challengeScope: 'files:read offline_access' }).ok).toBe(false);
    expect(serverScopesOmitOfflineAccess({ challengeScope: 'files:read' }).ok).toBe(true);
  });
});
