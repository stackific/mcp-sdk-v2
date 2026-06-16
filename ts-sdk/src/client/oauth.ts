/**
 * C3 — an edge-friendly OAuth 2.1 client flow (§23) that produces an
 * {@link AuthProvider} for {@link StreamableHTTPClientTransport}.
 *
 * Covers protected-resource → authorization-server metadata discovery, dynamic
 * client registration, PKCE (`S256`) with a support gate, the authorization-code
 * token exchange, and refresh. PKCE/randomness use **Web Crypto**
 * (`crypto.subtle` / `crypto.getRandomValues`), so the whole module is edge-safe
 * (no `node:crypto`); it reuses only the pure metadata schemas from the
 * authorization layer.
 *
 * The interactive consent step is the caller's: build the authorize URL with
 * {@link buildAuthorizeUrl}, redirect the user, capture the returned `code`, then
 * call {@link exchangeAuthorizationCode}.
 */
import type { AuthProvider } from './streamable-http.js';
import {
  AuthorizationServerMetadataSchema,
  authorizationServerWellKnownUris,
  type AuthorizationServerMetadata,
} from '../protocol/authorization.js';
import { validateIssuer, verifyRedirectState } from '../protocol/authorization-flow.js';

const PKCE_METHOD = 'S256' as const;

/** Base64url-encodes bytes without padding (PKCE / token encoding). */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A PKCE verifier/challenge pair. */
export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: typeof PKCE_METHOD;
}

/** Generates a PKCE `S256` pair using Web Crypto. (§23.5) */
export async function createPkcePair(): Promise<PkcePair> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64url(verifierBytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)));
  return { codeVerifier, codeChallenge: base64url(digest), codeChallengeMethod: PKCE_METHOD };
}

/** Confirms the AS advertises PKCE `S256`; throws otherwise (the client MUST refuse). (§28.5, R-28.5-k) */
export function assertPkceSupported(metadata: Pick<AuthorizationServerMetadata, 'code_challenge_methods_supported'>): void {
  const methods = metadata.code_challenge_methods_supported;
  if (!methods || !methods.includes(PKCE_METHOD)) {
    throw new Error('Authorization server does not confirm PKCE S256 support; refusing to proceed (R-28.5-k)');
  }
}

/** Discovered OAuth metadata for a protected MCP resource. */
export interface DiscoveredOAuthMetadata {
  protectedResource: Record<string, unknown>;
  authorizationServer: AuthorizationServerMetadata;
  issuer: string;
}

/**
 * Discovers protected-resource metadata (RFC 9728) then authorization-server
 * metadata (RFC 8414). (§23.2–§23.3)
 */
export async function discoverOAuthMetadata(options: {
  resource: string;
  resourceMetadataUrl?: string;
  fetch?: typeof fetch;
}): Promise<DiscoveredOAuthMetadata> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  // Protected-resource metadata, path-aware per RFC 9728 §3.1 (well-known inserted between
  // host and the resource path), with a root fallback. An explicit URL overrides discovery.
  const prm = (options.resourceMetadataUrl
    ? await (await fetchImpl(options.resourceMetadataUrl)).json()
    : await fetchFirstJson(fetchImpl, protectedResourceMetadataUrls(options.resource))) as {
    authorization_servers?: string[];
  };
  const issuer = prm.authorization_servers?.[0];
  if (!issuer) throw new Error('protected-resource metadata lists no authorization_servers');

  // RFC 8414 + OIDC discovery in the exact §23.3 priority order (R-23.3-b/c): OAuth
  // AS Metadata path-insertion, OIDC path-insertion, OIDC path-appending, with the
  // root fallbacks for a path-less issuer. Reuses the reference URI builder so the
  // wired client and the protocol model agree on discovery ordering (S35-RQ-18).
  const asJson = await fetchFirstJson(fetchImpl, authorizationServerWellKnownUris(issuer));
  const authorizationServer = AuthorizationServerMetadataSchema.parse(asJson);

  // Mix-up defense (§23.3, RFC 8414 §3.3): the metadata `issuer` MUST identify the
  // same authorization server the discovery URL was built from.
  if (!issuersEqual(authorizationServer.issuer, issuer)) {
    throw new Error(
      `authorization server metadata issuer "${authorizationServer.issuer}" does not match "${issuer}" (possible mix-up attack; §23.3)`,
    );
  }
  return { protectedResource: prm, authorizationServer, issuer };
}

/** Protected-resource metadata URLs for `resource`, path-aware (RFC 9728 §3.1) + root fallback. */
function protectedResourceMetadataUrls(resource: string): string[] {
  const u = new URL(resource);
  const host = `${u.protocol}//${u.host}`;
  const path = u.pathname.replace(/\/+$/, '');
  const urls = [`${host}/.well-known/oauth-protected-resource${path}`];
  if (path) urls.push(`${host}/.well-known/oauth-protected-resource`);
  return urls;
}

/**
 * Verifies the authorization redirect before redeeming the code (§23.5 / §23.7):
 * the returned `state` MUST equal the value sent in step 1 (CSRF defense), and the
 * returned `iss` MUST be validated against the recorded issuer per the §23.7
 * decision table. Crucially, a PRESENT `iss` is compared by EXACT string match
 * EVEN WHEN the AS does not advertise `authorization_response_iss_parameter_supported`
 * (R-23.7-f) — the mix-up defense the wired client previously skipped when the flag
 * was false/absent. Throws on any mismatch. Edge-safe (pure string comparison).
 *
 * Delegates to the reference `verifyRedirectState` / `validateIssuer` so the wired
 * OAuth client and the protocol model enforce identical rules.
 */
export function verifyAuthorizationRedirect(options: {
  sentState: string;
  returnedState?: string | null;
  issuer: string;
  returnedIss?: string | null;
  issParameterSupported?: boolean;
}): void {
  const stateCheck = verifyRedirectState(options.sentState, options.returnedState ?? undefined);
  if (!stateCheck.ok) {
    throw new Error(`OAuth redirect \`state\` mismatch — possible CSRF; refusing to redeem the code (§23.5): ${stateCheck.reason}`);
  }
  // §23.7 (R-23.7-d/e/f): a present `iss` is ALWAYS compared (exact match), regardless
  // of the advertised flag; an advertised-but-absent `iss` is rejected.
  const issCheck = validateIssuer({
    iss: options.returnedIss ?? undefined,
    recordedIssuer: options.issuer,
    issParameterSupported: options.issParameterSupported,
  });
  if (!issCheck.ok) {
    throw new Error(`OAuth redirect \`iss\` validation failed — possible mix-up (§23.7): ${issCheck.reason}`);
  }
}

/** Fetches the first URL that returns a 2xx JSON body; throws if none do. */
async function fetchFirstJson(fetchImpl: typeof fetch, urls: string[]): Promise<unknown> {
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status} from ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `authorization server metadata discovery failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/** Compares two issuer identifiers, tolerating only a trailing-slash difference. */
function issuersEqual(a: string, b: string): boolean {
  const norm = (u: string): string => u.replace(/\/+$/, '');
  return norm(a) === norm(b);
}

/** Dynamic client registration (RFC 7591). (§23.4) */
export async function registerClient(
  metadata: AuthorizationServerMetadata,
  options: {
    clientName: string;
    redirectUris?: string[];
    grantTypes?: string[];
    /** OAuth `application_type` — REQUIRED by §23.15; defaults to `'web'`. */
    applicationType?: 'web' | 'native';
    fetch?: typeof fetch;
  },
): Promise<{ clientId: string; clientSecret?: string }> {
  if (!metadata.registration_endpoint) throw new Error('authorization server has no registration_endpoint');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const res = await fetchImpl(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: options.clientName,
      application_type: options.applicationType ?? 'web', // REQUIRED (§23.15)
      grant_types: options.grantTypes ?? ['authorization_code'],
      ...(options.redirectUris ? { redirect_uris: options.redirectUris } : {}),
    }),
  });
  const json = (await res.json()) as { client_id: string; client_secret?: string };
  return { clientId: json.client_id, clientSecret: json.client_secret };
}

/** Builds the authorization-request URL (response_type=code + PKCE). (§23.5) */
export function buildAuthorizeUrl(
  metadata: AuthorizationServerMetadata,
  options: { clientId: string; redirectUri: string; resource: string; scope?: string; state: string; codeChallenge: string },
): string {
  const url = new URL(metadata.authorization_endpoint);
  const set = (k: string, v: string | undefined) => {
    if (v !== undefined) url.searchParams.set(k, v);
  };
  set('response_type', 'code');
  set('client_id', options.clientId);
  set('redirect_uri', options.redirectUri);
  set('scope', options.scope);
  set('state', options.state);
  set('code_challenge', options.codeChallenge);
  set('code_challenge_method', PKCE_METHOD);
  set('resource', options.resource); // audience binding (§23.6)
  return url.toString();
}

/** A token-endpoint response. */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

async function postToken(
  metadata: AuthorizationServerMetadata,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<OAuthTokenResponse> {
  const res = await fetchImpl(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`token endpoint returned HTTP ${res.status}`);
  }
  return (await res.json()) as OAuthTokenResponse;
}

/**
 * Exchanges an authorization code (+ PKCE verifier) for tokens. (§23.5) The RFC 8707
 * `resource` parameter is REQUIRED so the issued token is audience-bound to this MCP
 * server (§23.6); a token minted without it is not safely scoped to one resource.
 */
export async function exchangeAuthorizationCode(
  metadata: AuthorizationServerMetadata,
  options: { clientId: string; clientSecret?: string; code: string; codeVerifier: string; redirectUri: string; resource: string; fetch?: typeof fetch },
): Promise<OAuthTokenResponse> {
  return postToken(
    metadata,
    {
      grant_type: 'authorization_code',
      code: options.code,
      code_verifier: options.codeVerifier,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
      resource: options.resource, // RFC 8707 audience binding — REQUIRED (§23.6)
      ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
    },
    options.fetch ?? globalThis.fetch,
  );
}

/**
 * Redeems a refresh token for a fresh access token. (§23.9) The `resource`
 * parameter is REQUIRED on refresh too, so the new token keeps the same
 * audience binding as the original (§23.9).
 */
export async function refreshAccessToken(
  metadata: AuthorizationServerMetadata,
  options: { clientId: string; clientSecret?: string; refreshToken: string; resource: string; fetch?: typeof fetch },
): Promise<OAuthTokenResponse> {
  return postToken(
    metadata,
    {
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
      client_id: options.clientId,
      resource: options.resource, // keep the audience binding on refresh (§23.9)
      ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
    },
    options.fetch ?? globalThis.fetch,
  );
}

/**
 * Wraps a token response as an {@link AuthProvider}, transparently refreshing
 * shortly before expiry when a `refresh` callback is supplied. The returned
 * provider is what {@link StreamableHTTPClientTransport} calls per request.
 */
export function createAuthProvider(
  initial: OAuthTokenResponse,
  refresh?: (refreshToken: string) => Promise<OAuthTokenResponse>,
  options: { now?: () => number; skewMs?: number } = {},
): AuthProvider {
  const now = options.now ?? (() => Date.now());
  const skewMs = options.skewMs ?? 30_000;
  let current = initial;
  let expiresAtMs = initial.expires_in ? now() + initial.expires_in * 1000 : Infinity;

  return {
    async token(): Promise<string | undefined> {
      if (refresh && current.refresh_token && now() + skewMs >= expiresAtMs) {
        current = await refresh(current.refresh_token);
        expiresAtMs = current.expires_in ? now() + current.expires_in * 1000 : Infinity;
      }
      return current.access_token;
    },
  };
}
