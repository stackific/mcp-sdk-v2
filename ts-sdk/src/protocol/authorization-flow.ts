/**
 * S36 — Authorization II: the OAuth 2.1 authorization-code-with-PKCE flow, token
 * exchange, refresh, audience binding & worked examples (§23.4–§23.10).
 *
 * S35 (`authorization.ts`) established *where* the protected-resource and
 * authorization-server metadata live; this module turns that discovered metadata
 * into an actual access token and uses it. It provides the executable heart of
 * MCP authorization:
 *
 *   - `client_id` acquisition — the three mechanisms (pre-registration, Client ID
 *     Metadata Documents, Dynamic Client Registration) plus the user-prompt
 *     fallback and the SHOULD priority order (R-23.4-a – R-23.4-c);
 *   - Client ID Metadata Documents — schema, the `client_id == URL` identity rule,
 *     the HTTPS/path-component constraints, and the authorization-server-side
 *     fetch/validate/cache duties (R-23.4-d – R-23.4-l);
 *   - Dynamic Client Registration (Deprecated) — the `application_type` requirement,
 *     registration-failure handling, retry, and per-`issuer` credential binding
 *     with re-registration (R-23.4-m – R-23.4-t);
 *   - PKCE — high-entropy `code_verifier` generation (43–128 unreserved chars) and
 *     the `S256` `code_challenge = BASE64URL(SHA-256(verifier))` derivation, with
 *     injectable randomness for deterministic tests (R-23.5-a, R-23.5-b);
 *   - the per-request record that captures the recorded `issuer`, `state`, and
 *     `code_verifier` for later redirect validation (R-23.5-c);
 *   - the authorization request (`response_type=code`, `client_id`, `redirect_uri`,
 *     `scope`, `state`, `code_challenge`, `code_challenge_method=S256`, `resource`)
 *     and its URL builder, with the scope-priority rule (R-23.5-d – R-23.5-j);
 *   - the redirect handler — `state` verification and `iss` validation per the §23.7
 *     decision table, by exact string match with no normalization (R-23.5-h,
 *     R-23.5-k – R-23.5-m, R-23.7-a – R-23.7-h);
 *   - the token request (authorization_code & refresh_token grants) and the token
 *     response schema/validator, with `resource` audience binding in both legs
 *     (R-23.5-n – R-23.5-p, R-23.6-a – R-23.6-i, R-23.9-a – R-23.9-g);
 *   - bearer-token usage — the `Authorization: Bearer …` header on every request,
 *     no token in the query string, and the server-side per-request validation that
 *     yields `401`/`403` (R-23.8-a – R-23.8-f).
 *
 * Out of scope (owned elsewhere, per the story): the authorization model and
 * metadata discovery — S35 (`authorization.ts`, reused here); the full elaboration
 * of registration mechanisms, scopes & step-up authorization — S37; the
 * `WWW-Authenticate` challenge shape and error registry — S34/S35; the Streamable
 * HTTP transport carrying the header — S14/S15; consolidated security
 * considerations — S44.
 *
 * Mirrors the style of `authorization.ts` (S35) — schemas + validators + builders,
 * `{ ok: true } | { ok: false; reason }` validation results, and HTTP-layer
 * constants. Builds on its `ProtectedResourceMetadata*`, `AuthorizationServerMetadata*`,
 * `WwwAuthenticate*`, `challengedScopes`, `resourceIdentifiersEqual`, and
 * `CredentialStore` symbols, none of which are redefined here.
 */

import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import {
  BEARER_AUTH_SCHEME,
  UNAUTHORIZED_STATUS,
  AUTHORIZATION_FORBIDDEN_STATUS,
  INSUFFICIENT_SCOPE_ERROR,
  buildInsufficientScopeResponse,
  buildUnauthorizedResponse,
  challengedScopes,
  resourceIdentifiersEqual,
  type AuthorizationServerMetadata,
  type ProtectedResourceMetadata,
  type WwwAuthenticateChallenge,
  type UnauthorizedChallenge,
  type InsufficientScopeChallenge,
} from './authorization.js';

// ─── OAuth fixed token values (§23.5) ────────────────────────────────────────────

/** The only permitted authorization-request `response_type`. (R-23.5-d) */
export const RESPONSE_TYPE_CODE = 'code' as const;
/** The only permitted PKCE `code_challenge_method`. (R-23.5-a, R-23.5-i) */
export const CODE_CHALLENGE_METHOD_S256 = 'S256' as const;
/** The token-request `grant_type` for the initial authorization-code exchange. (R-23.5-n) */
export const GRANT_TYPE_AUTHORIZATION_CODE = 'authorization_code' as const;
/** The token-request `grant_type` for a refresh exchange. (R-23.9-e) */
export const GRANT_TYPE_REFRESH_TOKEN = 'refresh_token' as const;
/** The `token_type` every MCP access token carries. (R-23.8-b) */
export const TOKEN_TYPE_BEARER = 'Bearer' as const;
/** The HTTP `Authorization` request-header name. (R-23.8-b) */
export const AUTHORIZATION_HEADER = 'Authorization' as const;
/**
 * The reserved scope a client adds to request a refresh token, when (and only
 * when) the authorization-server metadata advertises it. (R-23.9-b)
 *
 * An MCP server SHOULD NOT advertise this in its `WWW-Authenticate` `scope` or in
 * protected-resource-metadata `scopes_supported` — see
 * {@link advertisedScopesExcludeOfflineAccess}. (R-23.9-g)
 */
export const OFFLINE_ACCESS_SCOPE = 'offline_access' as const;

// ─── PKCE: code_verifier & code_challenge (§23.5, R-23.5-a, R-23.5-b) ────────────

/** The minimum `code_verifier` length mandated by RFC 7636. (R-23.5-b) */
export const CODE_VERIFIER_MIN_LENGTH = 43 as const;
/** The maximum `code_verifier` length mandated by RFC 7636. (R-23.5-b) */
export const CODE_VERIFIER_MAX_LENGTH = 128 as const;

/**
 * The RFC 7636 `code_verifier` "unreserved" alphabet:
 * `ALPHA / DIGIT / "-" / "." / "_" / "~"`. A verifier MUST consist solely of
 * these characters. (R-23.5-b)
 */
export const PKCE_UNRESERVED_RE = /^[A-Za-z0-9\-._~]+$/;

/** A generated PKCE pair: the secret verifier and its derived public challenge. */
export interface PkceChallenge {
  /** The high-entropy secret; 43–128 unreserved chars. (R-23.5-b) */
  codeVerifier: string;
  /** `BASE64URL(SHA-256(codeVerifier))`. (R-23.5-b) */
  codeChallenge: string;
  /** Always `S256` for MCP. (R-23.5-a, R-23.5-i) */
  codeChallengeMethod: typeof CODE_CHALLENGE_METHOD_S256;
}

/** Encodes a buffer as unpadded BASE64URL, per RFC 4648 §5 (RFC 7636 uses this). */
function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/**
 * Returns `true` when `verifier` is a valid PKCE `code_verifier`: 43–128
 * characters drawn solely from the unreserved alphabet. (R-23.5-b)
 *
 * @param verifier - The candidate `code_verifier`.
 */
export function isValidCodeVerifier(verifier: string): boolean {
  return (
    verifier.length >= CODE_VERIFIER_MIN_LENGTH &&
    verifier.length <= CODE_VERIFIER_MAX_LENGTH &&
    PKCE_UNRESERVED_RE.test(verifier)
  );
}

/**
 * Generates a high-entropy PKCE `code_verifier`. (R-23.5-b)
 *
 * 32 random bytes BASE64URL-encode to a 43-character string drawn entirely from
 * the unreserved alphabet — the RFC 7636 minimum length and recommended entropy.
 * Randomness is injectable (`randomSource`) so callers can produce a deterministic
 * verifier in tests; the default draws from `node:crypto`'s CSPRNG.
 *
 * @param randomSource - OPTIONAL byte source `(n) => Buffer of length n`; defaults
 *   to `node:crypto` `randomBytes`.
 * @throws {RangeError} When an injected `randomSource` yields a verifier outside
 *   the 43–128 unreserved-char range.
 */
export function generateCodeVerifier(randomSource: (size: number) => Buffer = randomBytes): string {
  const verifier = base64UrlEncode(randomSource(32));
  if (!isValidCodeVerifier(verifier)) {
    throw new RangeError(
      'generated code_verifier MUST be 43–128 unreserved characters (R-23.5-b)',
    );
  }
  return verifier;
}

/**
 * Derives the `S256` `code_challenge` from a `code_verifier`:
 * `BASE64URL(SHA-256(code_verifier))`. (R-23.5-b)
 *
 * @param codeVerifier - A valid PKCE `code_verifier`.
 * @throws {RangeError} When `codeVerifier` is not a valid PKCE verifier.
 */
export function deriveCodeChallenge(codeVerifier: string): string {
  if (!isValidCodeVerifier(codeVerifier)) {
    throw new RangeError('code_verifier MUST be 43–128 unreserved characters (R-23.5-b)');
  }
  return base64UrlEncode(createHash('sha256').update(codeVerifier, 'ascii').digest());
}

/**
 * Creates a complete PKCE pair (verifier + `S256` challenge + method). (R-23.5-a,
 * R-23.5-b)
 *
 * PKCE is REQUIRED for this flow and the method MUST be `S256`; this is the single
 * entry point that yields a ready-to-use pair. Randomness is injectable for
 * deterministic tests.
 *
 * @param randomSource - OPTIONAL byte source; defaults to `node:crypto`.
 */
export function createPkceChallenge(randomSource: (size: number) => Buffer = randomBytes): PkceChallenge {
  const codeVerifier = generateCodeVerifier(randomSource);
  return {
    codeVerifier,
    codeChallenge: deriveCodeChallenge(codeVerifier),
    codeChallengeMethod: CODE_CHALLENGE_METHOD_S256,
  };
}

/**
 * Verifies that a presented `code_verifier` matches a previously issued
 * `code_challenge` under the `S256` method — the check an authorization server's
 * token endpoint performs. (R-23.5-b)
 *
 * @param codeVerifier  - The verifier presented in the token request.
 * @param codeChallenge - The challenge sent in the authorization request.
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  return isValidCodeVerifier(codeVerifier) && deriveCodeChallenge(codeVerifier) === codeChallenge;
}

// ─── client_id acquisition mechanisms (§23.4, R-23.4-a – R-23.4-c) ──────────────

/**
 * The ways a client obtains a `client_id`, plus the user-prompt fallback. (R-23.4-a)
 *
 *   - `pre-registration` — credentials provisioned out of band ahead of time.
 *   - `cimd` — a Client ID Metadata Document HTTPS URL used directly as `client_id`.
 *   - `dcr` — Dynamic Client Registration (Deprecated) at a `registration_endpoint`.
 *   - `prompt` — fall back to prompting the user.
 */
export type ClientIdMechanism = 'pre-registration' | 'cimd' | 'dcr' | 'prompt';

/**
 * The SHOULD priority order for selecting a `client_id` mechanism:
 * pre-registration → CIMD → DCR → user prompt. (R-23.4-b)
 */
export const CLIENT_ID_MECHANISM_PRIORITY: readonly ClientIdMechanism[] = [
  'pre-registration',
  'cimd',
  'dcr',
  'prompt',
] as const;

/**
 * Selects the `client_id` mechanism to use from those a client supports, applying
 * the priority order pre-registration → CIMD → DCR → user prompt. (R-23.4-a,
 * R-23.4-b)
 *
 * Returns the highest-priority supported mechanism. When `supported` is empty the
 * client falls back to prompting the user, so `'prompt'` is returned.
 *
 * @param supported - The mechanisms this client supports (order irrelevant).
 */
export function selectClientIdMechanism(supported: Iterable<ClientIdMechanism>): ClientIdMechanism {
  const set = new Set(supported);
  for (const mechanism of CLIENT_ID_MECHANISM_PRIORITY) {
    if (set.has(mechanism)) return mechanism;
  }
  return 'prompt';
}

/** Outcome of {@link checkPreRegisteredCredentials}. */
export type PreRegistrationCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verifies that pre-registered credentials' authorization server matches the one
 * indicated by protected-resource metadata, surfacing an error on mismatch rather
 * than silently using mismatched credentials. (R-23.4-c)
 *
 * Compares the two `issuer` values by exact string match. On mismatch the caller
 * SHOULD surface the returned reason and MUST NOT use the credentials.
 *
 * @param credentialIssuer - The `issuer` the pre-registered credentials belong to.
 * @param metadataIssuer   - The `issuer` selected from protected-resource metadata.
 */
export function checkPreRegisteredCredentials(
  credentialIssuer: string,
  metadataIssuer: string,
): PreRegistrationCheck {
  if (credentialIssuer !== metadataIssuer) {
    return {
      ok: false,
      reason: `pre-registered credentials belong to authorization server "${credentialIssuer}", but protected-resource metadata indicates "${metadataIssuer}"; surface an error rather than using mismatched credentials (R-23.4-c)`,
    };
  }
  return { ok: true };
}

// ─── Client ID Metadata Documents (§23.4, R-23.4-d – R-23.4-l) ──────────────────

/**
 * A Client ID Metadata Document (CIMD): a JSON document hosted at an HTTPS URL
 * that *is* the client's `client_id`. (§23.4, R-23.4-f, R-23.4-g)
 *
 * `client_id`, `client_name`, and `redirect_uris` are REQUIRED (R-23.4-f);
 * `client_id` MUST exactly equal the document's own URL (R-23.4-g, enforced at
 * validation time by {@link validateClientIdMetadataDocument}). `.passthrough()`
 * preserves any additional client-metadata fields.
 */
export const ClientIdMetadataDocumentSchema = z
  .object({
    /** REQUIRED; MUST equal the document URL and use https with a path. (R-23.4-f, R-23.4-g) */
    client_id: z.string().min(1),
    /** REQUIRED human-readable client name. (R-23.4-f) */
    client_name: z.string().min(1),
    /** REQUIRED allowed redirection URIs. (R-23.4-f) */
    redirect_uris: z.array(z.string()).min(1),
    /** OPTIONAL client homepage. */
    client_uri: z.string().optional(),
    /** OPTIONAL logo for consent screens. */
    logo_uri: z.string().optional(),
    /** OPTIONAL OAuth grant types (e.g. `authorization_code`, `refresh_token`). */
    grant_types: z.array(z.string()).optional(),
    /** OPTIONAL OAuth response types (e.g. `code`). */
    response_types: z.array(z.string()).optional(),
    /** OPTIONAL token-endpoint auth method (e.g. `none`). */
    token_endpoint_auth_method: z.string().optional(),
  })
  .passthrough();

export type ClientIdMetadataDocument = z.infer<typeof ClientIdMetadataDocumentSchema>;

/** Returns `true` when `value` is a structurally valid CIMD document. (R-23.4-f) */
export function isClientIdMetadataDocument(value: unknown): value is ClientIdMetadataDocument {
  return ClientIdMetadataDocumentSchema.safeParse(value).success;
}

/**
 * Returns `true` when `clientId` is a syntactically valid CIMD `client_id` URL:
 * an absolute `https` URL that contains a (non-root) path component. (R-23.4-e)
 *
 * A bare-origin URL like `https://app.example.com` (path `/`) is rejected — the
 * spec requires a path component identifying the metadata document.
 *
 * @param clientId - The candidate `client_id` URL.
 */
export function isValidCimdClientIdUrl(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.pathname !== '' && url.pathname !== '/';
}

/** Outcome of {@link validateClientIdMetadataDocument}. */
export type ClientIdMetadataDocumentValidation =
  | { ok: true; document: ClientIdMetadataDocument }
  | { ok: false; reason: string };

/**
 * Validates a fetched CIMD document against the URL it was fetched from — the
 * fetch/validate duties an authorization server performs on encountering a
 * URL-formatted `client_id`. (R-23.4-i, R-23.4-j, R-23.4-k)
 *
 * Checks, in order:
 *   - the `client_id` URL is a valid HTTPS URL with a path component (R-23.4-e);
 *   - the body is valid JSON containing the REQUIRED fields (R-23.4-k);
 *   - the document's `client_id` exactly equals the fetch URL (R-23.4-i);
 *   - when a `presentedRedirectUri` is supplied, it appears in the document's
 *     `redirect_uris` (R-23.4-j).
 *
 * @param documentUrl          - The URL the document was fetched from (== `client_id`).
 * @param value                - The raw fetched document body.
 * @param presentedRedirectUri - OPTIONAL redirect URI from the authorization
 *   request to validate against `redirect_uris` (R-23.4-j).
 */
export function validateClientIdMetadataDocument(
  documentUrl: string,
  value: unknown,
  presentedRedirectUri?: string,
): ClientIdMetadataDocumentValidation {
  if (!isValidCimdClientIdUrl(documentUrl)) {
    return {
      ok: false,
      reason: `CIMD client_id "${documentUrl}" MUST be an https URL with a path component (R-23.4-e)`,
    };
  }
  const parsed = ClientIdMetadataDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `CIMD document MUST be valid JSON with client_id, client_name, redirect_uris (R-23.4-k): ${parsed.error.message}`,
    };
  }
  if (parsed.data.client_id !== documentUrl) {
    return {
      ok: false,
      reason: `CIMD client_id "${parsed.data.client_id}" MUST exactly equal the document URL "${documentUrl}" (R-23.4-g, R-23.4-i)`,
    };
  }
  if (presentedRedirectUri !== undefined && !parsed.data.redirect_uris.includes(presentedRedirectUri)) {
    return {
      ok: false,
      reason: `presented redirect_uri "${presentedRedirectUri}" is not listed in the CIMD document's redirect_uris (R-23.4-j)`,
    };
  }
  return { ok: true, document: parsed.data };
}

// ─── Dynamic Client Registration (Deprecated) (§23.4, R-23.4-m – R-23.4-t) ──────

/**
 * The DCR `application_type`. (R-23.4-m – R-23.4-o)
 *
 *   - `native` — desktop/mobile/CLI/localhost-hosted apps (R-23.4-n).
 *   - `web` — remote browser-based apps from a non-local host (R-23.4-o).
 */
export type ApplicationType = 'native' | 'web';

/**
 * Returns the `application_type` a client SHOULD register based on whether it runs
 * as a native (desktop/mobile/CLI/localhost) or a remote browser-based app.
 * (R-23.4-n, R-23.4-o)
 *
 * @param isNative - `true` for desktop/mobile/CLI/localhost-hosted clients.
 */
export function applicationTypeFor(isNative: boolean): ApplicationType {
  return isNative ? 'native' : 'web';
}

/**
 * A Dynamic Client Registration request body (Deprecated). (§23.4, R-23.4-m)
 *
 * `redirect_uris` and `application_type` are REQUIRED per MCP (R-23.4-m); omitting
 * `application_type` would default to `web` under OIDC, which MCP does not permit,
 * so the schema requires it explicitly. `.passthrough()` preserves additional
 * RFC 7591 fields.
 */
export const DynamicClientRegistrationRequestSchema = z
  .object({
    /** REQUIRED allowed redirection URIs. (R-23.4-m, R-23.4-p) */
    redirect_uris: z.array(z.string()).min(1),
    /** REQUIRED per MCP; `native` or `web`. (R-23.4-m) */
    application_type: z.enum(['native', 'web']),
    /** OPTIONAL human-readable name. */
    client_name: z.string().optional(),
    /** OPTIONAL requested grant types. */
    grant_types: z.array(z.string()).optional(),
    /** OPTIONAL requested response types. */
    response_types: z.array(z.string()).optional(),
    /** OPTIONAL token-endpoint auth method. */
    token_endpoint_auth_method: z.string().optional(),
    /** OPTIONAL space-delimited scopes. */
    scope: z.string().optional(),
  })
  .passthrough();

export type DynamicClientRegistrationRequest = z.infer<typeof DynamicClientRegistrationRequestSchema>;

/** Inputs to {@link buildDynamicClientRegistrationRequest}. */
export interface DynamicClientRegistrationRequestOptions {
  /** REQUIRED allowed redirection URIs. (R-23.4-m) */
  redirectUris: string[];
  /** REQUIRED `application_type`; see {@link applicationTypeFor}. (R-23.4-m) */
  applicationType: ApplicationType;
  /** OPTIONAL human-readable client name. */
  clientName?: string;
  /**
   * OPTIONAL requested grant types. A client desiring refresh capability SHOULD
   * include `refresh_token` here. (R-23.9-a)
   */
  grantTypes?: string[];
  /** OPTIONAL requested response types. */
  responseTypes?: string[];
  /** OPTIONAL token-endpoint auth method. */
  tokenEndpointAuthMethod?: string;
  /** OPTIONAL space-delimited scopes. */
  scope?: string;
}

/**
 * Builds a Dynamic Client Registration request body, always including the REQUIRED
 * `application_type`. (R-23.4-m)
 *
 * @deprecated Dynamic Client Registration is Deprecated (§27.3). Use static
 * OAuth 2.0 client registration instead. Earliest removal: 2026-07-28
 * (§27.2/§27.3, R-27.4-a/-b).
 * @param options - Registration inputs.
 */
export function buildDynamicClientRegistrationRequest(
  options: DynamicClientRegistrationRequestOptions,
): DynamicClientRegistrationRequest {
  const body: DynamicClientRegistrationRequest = {
    redirect_uris: options.redirectUris,
    application_type: options.applicationType,
  };
  if (options.clientName !== undefined) body.client_name = options.clientName;
  if (options.grantTypes !== undefined) body.grant_types = options.grantTypes;
  if (options.responseTypes !== undefined) body.response_types = options.responseTypes;
  if (options.tokenEndpointAuthMethod !== undefined) {
    body.token_endpoint_auth_method = options.tokenEndpointAuthMethod;
  }
  if (options.scope !== undefined) body.scope = options.scope;
  return body;
}

/**
 * A Dynamic Client Registration response body (Deprecated). (§23.4)
 *
 * `client_id` is REQUIRED; `client_secret` is issued only for confidential
 * clients. `.passthrough()` preserves additional RFC 7591 fields.
 */
export const DynamicClientRegistrationResponseSchema = z
  .object({
    /** REQUIRED issued client identifier. */
    client_id: z.string().min(1),
    /** OPTIONAL secret for confidential clients only. */
    client_secret: z.string().optional(),
  })
  .passthrough();

export type DynamicClientRegistrationResponse = z.infer<typeof DynamicClientRegistrationResponseSchema>;

/**
 * The outcome of a DCR registration attempt, modelling the failure cases a client
 * MUST be prepared to handle. (R-23.4-p, R-23.4-q, R-23.4-r)
 */
export type DynamicClientRegistrationResult =
  | { ok: true; response: DynamicClientRegistrationResponse }
  | { ok: false; reason: string; retryable: boolean };

/**
 * Handles a DCR registration response, surfacing a meaningful error on failure and
 * flagging whether a retry (with adjusted `application_type` or conforming
 * redirect URIs) may help. (R-23.4-p, R-23.4-q, R-23.4-r)
 *
 *   - A success body (valid JSON with a `client_id`) → `{ ok: true }`.
 *   - An HTTP failure status, or a body lacking `client_id`, → `{ ok: false }`
 *     with a human-readable `reason`; the client surfaces it (R-23.4-q) rather
 *     than crashing (R-23.4-p). `retryable` is `true` for redirect-URI/application
 *     -type rejections the client MAY retry (R-23.4-r).
 *
 * @param status - The registration endpoint's HTTP status.
 * @param body   - The raw response body.
 */
export function handleDynamicClientRegistrationResponse(
  status: number,
  body: unknown,
): DynamicClientRegistrationResult {
  if (status >= 200 && status < 300) {
    const parsed = DynamicClientRegistrationResponseSchema.safeParse(body);
    if (parsed.success) {
      return { ok: true, response: parsed.data };
    }
    return {
      ok: false,
      reason: `DCR succeeded with HTTP ${status} but the body lacks a valid client_id (R-23.4-q)`,
      retryable: false,
    };
  }
  // Surface an error meaningfully rather than crashing (R-23.4-p, R-23.4-q). A 400
  // typically signals a redirect-URI / application-type constraint the client MAY
  // retry after adjusting (R-23.4-r).
  const description =
    body && typeof body === 'object' && 'error_description' in body
      ? String((body as Record<string, unknown>).error_description)
      : `registration failed with HTTP ${status}`;
  return { ok: false, reason: `DCR registration rejected: ${description} (R-23.4-q)`, retryable: status === 400 };
}

/**
 * Persisted DCR credentials, bound to the issuing authorization server's `issuer`.
 * (R-23.4-s)
 */
export interface DynamicClientRegistrationCredential {
  /** The issuing authorization server's `issuer`; the binding key. (R-23.4-s) */
  issuer: string;
  /** The issued `client_id`. */
  clientId: string;
  /** OPTIONAL issued secret for confidential clients. */
  clientSecret?: string;
}

/**
 * A store for persisted DCR credentials, each keyed by the issuing authorization
 * server's `issuer`, that re-registers when the authorization server changes.
 * (R-23.4-s, R-23.4-t)
 *
 * Separate from S35's {@link import('./authorization.js').CredentialStore}, which
 * holds runtime per-issuer access/refresh tokens; this store holds the persisted
 * registration identity (`client_id`/`client_secret`) the DCR rules govern.
 */
export class DynamicClientRegistrationStore {
  readonly #byIssuer = new Map<string, DynamicClientRegistrationCredential>();

  /**
   * Persists `credential`, keyed by its `issuer`. Each authorization server keeps
   * an isolated entry. (R-23.4-s)
   */
  save(credential: DynamicClientRegistrationCredential): void {
    this.#byIssuer.set(credential.issuer, { ...credential });
  }

  /** Returns the persisted credential for `issuer`, or `undefined`. (R-23.4-s) */
  credentialFor(issuer: string): DynamicClientRegistrationCredential | undefined {
    const found = this.#byIssuer.get(issuer);
    return found ? { ...found } : undefined;
  }

  /**
   * Returns `true` when the client must (re-)register against `issuer` — i.e. no
   * credential is yet persisted for that authorization server. A client MUST
   * re-register when the authorization server changes, which manifests as the new
   * `issuer` having no persisted credential. (R-23.4-t)
   *
   * @param issuer - The `issuer` now indicated by protected-resource metadata.
   */
  needsRegistration(issuer: string): boolean {
    return !this.#byIssuer.has(issuer);
  }
}

// ─── Per-request authorization record — Step 1 (§23.5, R-23.5-c) ────────────────

/**
 * Client-side bookkeeping captured in Step 1, associated with the `code_verifier`
 * (and `state`, if used), to validate the redirect later. (§23.5, R-23.5-c)
 */
export interface AuthorizationFlowRecord {
  /** The high-entropy PKCE verifier this record is keyed to. (R-23.5-c) */
  codeVerifier: string;
  /** The opaque `state` sent, if any. (R-23.5-c, R-23.5-g) */
  state?: string;
  /**
   * The `issuer` from the selected authorization server's validated metadata,
   * recorded BEFORE redirecting for later `iss` comparison. (R-23.5-c)
   */
  recordedIssuer: string;
  /** The `code_challenge` derived from `codeVerifier`. (R-23.5-b) */
  codeChallenge: string;
  /** The PKCE method; always `S256`. (R-23.5-a) */
  codeChallengeMethod: typeof CODE_CHALLENGE_METHOD_S256;
}

/** Inputs to {@link createAuthorizationFlowRecord}. */
export interface CreateAuthorizationFlowRecordOptions {
  /**
   * The `issuer` of the selected authorization server's validated metadata, to be
   * recorded for later `iss` validation. (R-23.5-c)
   */
  recordedIssuer: string;
  /** OPTIONAL pre-generated PKCE pair; one is generated when omitted. */
  pkce?: PkceChallenge;
  /** OPTIONAL `state`; one is generated when omitted (see {@link generateState}). */
  state?: string;
  /** OPTIONAL byte source for PKCE generation; defaults to `node:crypto`. */
  randomSource?: (size: number) => Buffer;
}

/**
 * Generates an opaque, unguessable `state` value binding an authorization request
 * to the user-agent session. (R-23.5-g)
 *
 * 32 random bytes BASE64URL-encoded. Randomness is injectable for tests.
 *
 * @param randomSource - OPTIONAL byte source; defaults to `node:crypto`.
 */
export function generateState(randomSource: (size: number) => Buffer = randomBytes): string {
  return base64UrlEncode(randomSource(32));
}

/**
 * Builds the Step-1 per-request record: a fresh PKCE pair (unless supplied), an
 * opaque `state` (unless supplied), and the recorded `issuer`. (R-23.5-a,
 * R-23.5-b, R-23.5-c, R-23.5-g)
 *
 * The record MUST be created and the `issuer` recorded BEFORE the user agent is
 * redirected, so the redirect's `iss` and `state` can be validated against it.
 *
 * @param options - The recorded issuer and OPTIONAL pre-built PKCE/state.
 */
export function createAuthorizationFlowRecord(
  options: CreateAuthorizationFlowRecordOptions,
): AuthorizationFlowRecord {
  const random = options.randomSource ?? randomBytes;
  const pkce = options.pkce ?? createPkceChallenge(random);
  const state = options.state ?? generateState(random);
  return {
    codeVerifier: pkce.codeVerifier,
    state,
    recordedIssuer: options.recordedIssuer,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
  };
}

// ─── Scope priority (§23.5, R-23.5-f) ────────────────────────────────────────────

/**
 * Resolves the `scope` parameter to send in the authorization request, applying
 * the scope-priority rule. (R-23.5-f)
 *
 *   1. If the `WWW-Authenticate` challenge carried a `scope`, use that.
 *   2. Otherwise use all scopes in `scopes_supported` from protected-resource
 *      metadata.
 *   3. When neither is available, omit `scope` (returns `undefined`).
 *
 * Callers MAY then add `offline_access` to request refresh capability when the
 * authorization-server metadata advertises it (see {@link withOfflineAccessScope}).
 * (R-23.9-b)
 *
 * @param options.challenge          - The parsed `WWW-Authenticate` challenge, if any.
 * @param options.protectedResource  - Protected-resource metadata, if any.
 */
export function resolveAuthorizationScope(options: {
  challenge?: WwwAuthenticateChallenge;
  protectedResource?: Pick<ProtectedResourceMetadata, 'scopes_supported'>;
}): string | undefined {
  if (options.challenge !== undefined) {
    const fromChallenge = challengedScopes(options.challenge);
    if (fromChallenge.length > 0) {
      return fromChallenge.join(' ');
    }
  }
  const supported = options.protectedResource?.scopes_supported;
  if (supported !== undefined && supported.length > 0) {
    return supported.join(' ');
  }
  return undefined;
}

/**
 * Adds `offline_access` to a `scope` string when, and only when, the
 * authorization-server metadata advertises it in `scopes_supported`. (R-23.9-b)
 *
 * Returns the scope unchanged (possibly `undefined`) when `offline_access` is not
 * advertised, or already present. When `scope` is `undefined` but `offline_access`
 * is advertised, returns just `offline_access`.
 *
 * @param scope                    - The current `scope` string, or `undefined`.
 * @param authorizationServerMeta  - The selected authorization server's metadata.
 */
export function withOfflineAccessScope(
  scope: string | undefined,
  authorizationServerMeta: Pick<AuthorizationServerMetadata, 'scopes_supported'>,
): string | undefined {
  const advertised = authorizationServerMeta.scopes_supported?.includes(OFFLINE_ACCESS_SCOPE) ?? false;
  if (!advertised) return scope;
  const parts = scope === undefined ? [] : scope.split(/\s+/).filter((s) => s.length > 0);
  if (parts.includes(OFFLINE_ACCESS_SCOPE)) return scope;
  parts.push(OFFLINE_ACCESS_SCOPE);
  return parts.join(' ');
}

/**
 * Returns `true` when neither the `WWW-Authenticate` `scope` nor protected-resource
 * `scopes_supported` includes `offline_access`, as an MCP server SHOULD ensure.
 * (R-23.9-g)
 *
 * @param options.challengeScope    - The `WWW-Authenticate` `scope` value, if any.
 * @param options.scopesSupported   - Protected-resource `scopes_supported`, if any.
 */
export function advertisedScopesExcludeOfflineAccess(options: {
  challengeScope?: string;
  scopesSupported?: string[];
}): boolean {
  const challengeHas =
    options.challengeScope !== undefined &&
    options.challengeScope.split(/\s+/).includes(OFFLINE_ACCESS_SCOPE);
  const metadataHas = options.scopesSupported?.includes(OFFLINE_ACCESS_SCOPE) ?? false;
  return !challengeHas && !metadataHas;
}

// ─── Authorization request — Step 2 (§23.5, R-23.5-d – R-23.5-j) ────────────────

/**
 * The authorization-request query parameters directing the user agent to the
 * `authorization_endpoint`. (§23.5, R-23.5-d – R-23.5-j)
 *
 * Field names mirror the on-the-wire OAuth parameters. `response_type`,
 * `code_challenge_method`, `client_id`, `redirect_uri`, `code_challenge`, and
 * `resource` are always present; `scope` and `state` are present when available.
 */
export interface AuthorizationRequestParams {
  /** MUST be `code`. (R-23.5-d) */
  response_type: typeof RESPONSE_TYPE_CODE;
  /** The client identifier from registration. */
  client_id: string;
  /** MUST match one registered for the client. (R-23.5-e) */
  redirect_uri: string;
  /** Requested scopes; omitted when none determinable. (R-23.5-f) */
  scope?: string;
  /** Opaque, unguessable session-binding value. (R-23.5-g) */
  state?: string;
  /** `BASE64URL(SHA-256(code_verifier))`. (R-23.5-b) */
  code_challenge: string;
  /** MUST be `S256`. (R-23.5-i) */
  code_challenge_method: typeof CODE_CHALLENGE_METHOD_S256;
  /** Canonical resource identifier of the target MCP server. (R-23.5-j, R-23.6-b) */
  resource: string;
}

// ─── PKCE support confirmation — §28.5 (R-28.5-k) ───────────────────────────────

/**
 * Thrown when a client refuses to proceed because PKCE `S256` support cannot be
 * confirmed from authorization-server metadata. (§28.5, R-28.5-k)
 */
export class PkceSupportError extends Error {
  readonly code = 'PKCE_SUPPORT_UNCONFIRMED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PkceSupportError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Confirms, from authorization-server metadata, that the AS supports PKCE with
 * the `S256` challenge method. (§28.5, R-28.5-k)
 *
 * §28.5 requires a client to use PKCE `S256` where capable AND to verify via AS
 * metadata that the server supports it before proceeding — refusing to proceed if
 * support cannot be confirmed. Support is confirmable ONLY when
 * `code_challenge_methods_supported` is present AND includes `"S256"`; an absent
 * field means support is unconfirmable (the client MUST refuse).
 */
export function confirmPkceSupport(
  metadata: Pick<AuthorizationServerMetadata, 'code_challenge_methods_supported'>,
): { ok: true } | { ok: false; reason: string } {
  const methods = metadata.code_challenge_methods_supported;
  if (methods === undefined) {
    return {
      ok: false,
      reason:
        'authorization-server metadata omits code_challenge_methods_supported; PKCE support cannot be confirmed (R-28.5-k)',
    };
  }
  if (!methods.includes(CODE_CHALLENGE_METHOD_S256)) {
    return {
      ok: false,
      reason: `authorization-server metadata does not advertise PKCE "${CODE_CHALLENGE_METHOD_S256}" support (R-28.5-k)`,
    };
  }
  return { ok: true };
}

/** Returns `true` when AS metadata confirms PKCE `S256` support. (R-28.5-k) */
export function isPkceSupportConfirmed(
  metadata: Pick<AuthorizationServerMetadata, 'code_challenge_methods_supported'>,
): boolean {
  return confirmPkceSupport(metadata).ok;
}

/**
 * Asserts PKCE `S256` support is confirmable from AS metadata, throwing
 * {@link PkceSupportError} when it is not — so the client refuses to proceed
 * rather than starting an authorization flow against an AS that may not support
 * PKCE. (§28.5, R-28.5-k)
 */
export function assertPkceSupportConfirmed(
  metadata: Pick<AuthorizationServerMetadata, 'code_challenge_methods_supported'>,
): void {
  const result = confirmPkceSupport(metadata);
  if (!result.ok) throw new PkceSupportError(result.reason);
}

/** Inputs to {@link buildAuthorizationRequest}. */
export interface BuildAuthorizationRequestOptions {
  /** The client identifier from registration. */
  clientId: string;
  /** MUST match one registered for the client. (R-23.5-e) */
  redirectUri: string;
  /** The canonical resource identifier of the target MCP server. (R-23.5-j, R-23.6-d) */
  resource: string;
  /** The Step-1 record carrying the PKCE challenge and `state`. */
  record: AuthorizationFlowRecord;
  /** OPTIONAL pre-resolved `scope` (see {@link resolveAuthorizationScope}). */
  scope?: string;
  /**
   * OPTIONAL authorization-server metadata. When provided, the builder verifies
   * PKCE `S256` support and refuses (throws {@link PkceSupportError}) if it cannot
   * be confirmed — enforcing §28.5 (R-28.5-k). Callers that do not pass it here
   * MUST call {@link assertPkceSupportConfirmed} themselves before proceeding.
   */
  serverMetadata?: Pick<AuthorizationServerMetadata, 'code_challenge_methods_supported'>;
}

/**
 * Builds the authorization-request query parameters for Step 2, fixing
 * `response_type=code`, `code_challenge_method=S256`, the `code_challenge` and
 * `state` from the Step-1 record, and the REQUIRED `resource` parameter. (R-23.5-d,
 * R-23.5-e, R-23.5-g, R-23.5-i, R-23.5-j, R-23.6-b)
 *
 * @param options - The client/redirect/resource and the Step-1 record.
 */
export function buildAuthorizationRequest(
  options: BuildAuthorizationRequestOptions,
): AuthorizationRequestParams {
  // §28.5 (R-28.5-k): when AS metadata is supplied, refuse to build the request
  // unless PKCE S256 support is confirmable — the client MUST NOT proceed otherwise.
  if (options.serverMetadata !== undefined) {
    assertPkceSupportConfirmed(options.serverMetadata);
  }
  const params: AuthorizationRequestParams = {
    response_type: RESPONSE_TYPE_CODE,
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    code_challenge: options.record.codeChallenge,
    code_challenge_method: CODE_CHALLENGE_METHOD_S256,
    resource: options.resource,
  };
  if (options.scope !== undefined) params.scope = options.scope;
  if (options.record.state !== undefined) params.state = options.record.state;
  return params;
}

/**
 * Serializes authorization-request parameters into a full authorization-endpoint
 * URL with a percent-encoded query string. (§23.5, Step 2 wire example)
 *
 * Parameters are emitted in the spec's example order. Existing query parameters on
 * `authorizationEndpoint` are preserved.
 *
 * @param authorizationEndpoint - The authorization server's `authorization_endpoint`.
 * @param params                - The authorization-request parameters.
 */
export function buildAuthorizationUrl(
  authorizationEndpoint: string,
  params: AuthorizationRequestParams,
): string {
  const url = new URL(authorizationEndpoint);
  const ordered: Array<[string, string | undefined]> = [
    ['response_type', params.response_type],
    ['client_id', params.client_id],
    ['redirect_uri', params.redirect_uri],
    ['scope', params.scope],
    ['state', params.state],
    ['code_challenge', params.code_challenge],
    ['code_challenge_method', params.code_challenge_method],
    ['resource', params.resource],
  ];
  for (const [key, value] of ordered) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.href;
}

// ─── Authorization response & redirect handling — Step 3 (§23.5, §23.7) ─────────

/**
 * The redirect query parameters the authorization server returns. (§23.5, §23.7)
 *
 * On success `code` is present; `state` echoes the request `state`; `iss`
 * identifies the authorization server (SHOULD; R-23.5-k). On error, `error` and
 * the optional `error_description`/`error_uri` are present and MUST NOT be acted
 * on when `iss` validation fails (R-23.7-h).
 */
export interface AuthorizationResponseParams {
  /** The authorization code to redeem (success). */
  code?: string;
  /** Echo of the request `state` (present if sent). (R-23.5-h) */
  state?: string;
  /** The authorization server's issuer identifier (SHOULD). (R-23.5-k, R-23.7-b) */
  iss?: string;
  /** Error code (error responses). */
  error?: string;
  /** OPTIONAL human-readable error description. */
  error_description?: string;
  /** OPTIONAL URI with error information. */
  error_uri?: string;
}

/**
 * Parses an authorization-redirect URL (or raw query string) into its decoded
 * parameters. (§23.5, Step 3 wire example)
 *
 * Percent-decoding is applied by `URLSearchParams`; the decoded `iss` is then
 * compared by EXACT string match with no further normalization (R-23.7-g) — this
 * function performs no normalization beyond the form-decoding the wire requires.
 *
 * @param redirect - A full redirect URL (`http://…/callback?code=…`) or a bare
 *   query string (`code=…&state=…`).
 */
export function parseAuthorizationResponse(redirect: string): AuthorizationResponseParams {
  let search: URLSearchParams;
  try {
    search = new URL(redirect).searchParams;
  } catch {
    const q = redirect.startsWith('?') ? redirect.slice(1) : redirect;
    search = new URLSearchParams(q);
  }
  const params: AuthorizationResponseParams = {};
  const code = search.get('code');
  const state = search.get('state');
  const iss = search.get('iss');
  const error = search.get('error');
  const errorDescription = search.get('error_description');
  const errorUri = search.get('error_uri');
  if (code !== null) params.code = code;
  if (state !== null) params.state = state;
  if (iss !== null) params.iss = iss;
  if (error !== null) params.error = error;
  if (errorDescription !== null) params.error_description = errorDescription;
  if (errorUri !== null) params.error_uri = errorUri;
  return params;
}

/**
 * The four rows of the §23.7 issuer-validation decision table. (R-23.7-d)
 *
 *   - `compare` — `iss` is present; compare it to the recorded issuer.
 *   - `reject` — `iss` is absent though advertised as supported; reject.
 *   - `proceed` — `iss` is absent and not advertised; proceed without comparison.
 */
export type IssuerValidationDecision = 'compare' | 'reject' | 'proceed';

/**
 * Applies the §23.7 four-row decision table to determine how to treat the `iss`
 * parameter, given whether the authorization server advertises
 * `authorization_response_iss_parameter_supported` and whether `iss` is present.
 * (R-23.7-d, R-23.7-e, R-23.7-f)
 *
 * | supported | iss present | decision |
 * | --------- | ----------- | -------- |
 * | true      | yes         | compare  |
 * | true      | no          | reject   |
 * | false     | yes         | compare  |
 * | false     | no          | proceed  |
 *
 * A present `iss` is ALWAYS compared, regardless of advertisement (R-23.7-f).
 *
 * @param issParameterSupported - The AS metadata flag (`undefined` ⇒ not advertised).
 * @param issPresent            - Whether the response carried an `iss`.
 */
export function issuerValidationDecision(
  issParameterSupported: boolean | undefined,
  issPresent: boolean,
): IssuerValidationDecision {
  if (issPresent) return 'compare';
  // iss absent:
  if (issParameterSupported === true) return 'reject';
  return 'proceed';
}

/** Outcome of {@link validateIssuer}: whether the code may be redeemed. */
export type IssuerValidationResult =
  | { ok: true; decision: 'compare' | 'proceed' }
  | { ok: false; reason: string };

/** Inputs to {@link validateIssuer}. */
export interface ValidateIssuerOptions {
  /** The decoded `iss` from the authorization response, if any. (R-23.7-g) */
  iss?: string;
  /** The `issuer` recorded in Step 1. (R-23.5-c) */
  recordedIssuer: string;
  /**
   * The AS metadata `authorization_response_iss_parameter_supported` flag, if
   * advertised. (R-23.7-c)
   */
  issParameterSupported?: boolean;
}

/**
 * Validates the authorization response's `iss` against the recorded issuer per
 * §23.7, the check a client MUST perform BEFORE transmitting the authorization
 * code to any token endpoint. (R-23.7-a, R-23.7-d, R-23.7-e, R-23.7-f, R-23.7-g)
 *
 * Applies {@link issuerValidationDecision}; when the decision is `compare`, the
 * present `iss` is compared to `recordedIssuer` by EXACT string match — no
 * scheme/host case folding, default-port elision, trailing-slash, or
 * percent-encoding normalization is applied (R-23.7-g). A `reject` decision (the
 * AS advertises `iss` support but the response omits it) fails (R-23.7-e). On any
 * failure the caller MUST NOT redeem the code, and for error responses MUST NOT
 * act on `error`/`error_description`/`error_uri` (R-23.7-h, see
 * {@link safeAuthorizationError}).
 *
 * @param options - The decoded `iss`, the recorded issuer, and the AS flag.
 */
export function validateIssuer(options: ValidateIssuerOptions): IssuerValidationResult {
  const decision = issuerValidationDecision(options.issParameterSupported, options.iss !== undefined);
  if (decision === 'reject') {
    return {
      ok: false,
      reason:
        'authorization_response_iss_parameter_supported is true but the response carried no iss; reject (R-23.7-e)',
    };
  }
  if (decision === 'proceed') {
    return { ok: true, decision: 'proceed' };
  }
  // decision === 'compare' — exact string match, no normalization (R-23.7-g).
  if (options.iss !== options.recordedIssuer) {
    return {
      ok: false,
      reason: `iss "${options.iss}" does not exactly match the recorded issuer "${options.recordedIssuer}" (possible mix-up attack); MUST NOT redeem the code (R-23.7-a, R-23.7-g)`,
    };
  }
  return { ok: true, decision: 'compare' };
}

/** Outcome of {@link verifyRedirectState}. */
export type StateValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Verifies the redirect `state` against the value sent in Step 1, the check a
 * client MUST pass before redeeming the code. (R-23.5-h, R-23.5-l)
 *
 * When a `state` was sent, the returned `state` MUST be present and equal it
 * (exact string match). When no `state` was sent, a returned `state` is ignored.
 *
 * @param sentState     - The `state` sent in the authorization request, or `undefined`.
 * @param returnedState - The `state` echoed on the redirect, or `undefined`.
 */
export function verifyRedirectState(
  sentState: string | undefined,
  returnedState: string | undefined,
): StateValidationResult {
  if (sentState === undefined) return { ok: true };
  if (returnedState !== sentState) {
    return {
      ok: false,
      reason: `redirect state "${returnedState}" does not match the value sent "${sentState}"; MUST NOT redeem the code (R-23.5-l)`,
    };
  }
  return { ok: true };
}

/** Outcome of {@link processAuthorizationRedirect}. */
export type AuthorizationRedirectResult =
  | { ok: true; code: string }
  | { ok: false; reason: string; error?: { error: string; errorDescription?: string; errorUri?: string } };

/**
 * Processes a Step-3 authorization redirect end to end: parses the response,
 * verifies `state`, validates `iss` per §23.7, and only then yields the code for
 * redemption. (§23.5 Step 3, R-23.5-h, R-23.5-l, R-23.5-m, R-23.7-a, R-23.7-h)
 *
 * Order of checks (all MUST pass before the code is redeemed):
 *   1. `state` matches the value sent (R-23.5-l);
 *   2. `iss` validates against the recorded issuer per §23.7 (R-23.5-m, R-23.7-a).
 *
 * On an error response, `error`/`error_description`/`error_uri` are returned in
 * `error` ONLY when `iss` validation succeeds; on `iss` mismatch they are
 * withheld and MUST NOT be acted on or displayed (R-23.7-h).
 *
 * @param redirect - The raw redirect URL or query string.
 * @param record   - The Step-1 record (recorded issuer + sent `state`).
 * @param options.issParameterSupported - The AS metadata flag, if advertised.
 */
export function processAuthorizationRedirect(
  redirect: string,
  record: Pick<AuthorizationFlowRecord, 'state' | 'recordedIssuer'>,
  options: { issParameterSupported?: boolean } = {},
): AuthorizationRedirectResult {
  const params = parseAuthorizationResponse(redirect);

  const stateResult = verifyRedirectState(record.state, params.state);
  if (!stateResult.ok) {
    return { ok: false, reason: stateResult.reason };
  }

  const issResult = validateIssuer({
    iss: params.iss,
    recordedIssuer: record.recordedIssuer,
    issParameterSupported: options.issParameterSupported,
  });
  if (!issResult.ok) {
    // iss mismatch in an error response: do NOT surface error details. (R-23.7-h)
    return { ok: false, reason: issResult.reason };
  }

  if (params.error !== undefined) {
    // iss validated → it is now safe to surface the error details. (R-23.7-h)
    return {
      ok: false,
      reason: `authorization server returned error "${params.error}"`,
      error: {
        error: params.error,
        errorDescription: params.error_description,
        errorUri: params.error_uri,
      },
    };
  }

  if (params.code === undefined) {
    return { ok: false, reason: 'authorization response is missing the code parameter' };
  }
  return { ok: true, code: params.code };
}

/**
 * Returns the displayable error details from an authorization redirect ONLY when
 * `iss` validation succeeds, withholding them on mismatch. (R-23.7-h)
 *
 * A thin convenience over {@link validateIssuer}: a client MUST NOT act on or
 * display `error`/`error_description`/`error_uri` when the `iss` of an error
 * response does not match the recorded issuer. Returns `undefined` when there is
 * no error, or when the details must be withheld.
 *
 * @param params       - The parsed authorization response.
 * @param issResult    - The result of {@link validateIssuer} for this response.
 */
export function safeAuthorizationError(
  params: AuthorizationResponseParams,
  issResult: IssuerValidationResult,
): { error: string; errorDescription?: string; errorUri?: string } | undefined {
  if (params.error === undefined) return undefined;
  if (!issResult.ok) return undefined;
  return {
    error: params.error,
    errorDescription: params.error_description,
    errorUri: params.error_uri,
  };
}

// ─── Token request — Step 4 & refresh (§23.5, §23.6, §23.9) ─────────────────────

/**
 * The form-encoded token-request body for the authorization-code grant. (§23.5
 * Step 4, R-23.5-n – R-23.5-p, R-23.6-b)
 */
export interface AuthorizationCodeTokenRequest {
  /** MUST be `authorization_code`. (R-23.5-n) */
  grant_type: typeof GRANT_TYPE_AUTHORIZATION_CODE;
  /** The authorization code from the redirect. */
  code: string;
  /** MUST be identical to the Step-2 `redirect_uri`. (R-23.5-o) */
  redirect_uri: string;
  /** The PKCE verifier matching the Step-2 `code_challenge`. (R-23.5-b) */
  code_verifier: string;
  /** The client identifier. */
  client_id: string;
  /** MUST be identical to the Step-2 `resource`. (R-23.5-p, R-23.6-b) */
  resource: string;
}

/**
 * The form-encoded token-request body for the refresh-token grant. (§23.9,
 * R-23.9-e, R-23.9-f)
 */
export interface RefreshTokenRequest {
  /** MUST be `refresh_token`. (R-23.9-e) */
  grant_type: typeof GRANT_TYPE_REFRESH_TOKEN;
  /** The refresh token being exchanged. (R-23.9-e) */
  refresh_token: string;
  /** The client identifier. */
  client_id: string;
  /** The SAME canonical resource identifier, keeping the token audience-bound. (R-23.9-e) */
  resource: string;
  /** OPTIONAL narrowed scopes. (R-23.9-f) */
  scope?: string;
}

/** A token request of either grant. */
export type TokenRequest = AuthorizationCodeTokenRequest | RefreshTokenRequest;

/** Inputs to {@link buildAuthorizationCodeTokenRequest}. */
export interface BuildAuthorizationCodeTokenRequestOptions {
  /** The authorization code from the redirect. */
  code: string;
  /** MUST be identical to the Step-2 `redirect_uri`. (R-23.5-o) */
  redirectUri: string;
  /** The PKCE verifier from the Step-1 record. (R-23.5-b) */
  codeVerifier: string;
  /** The client identifier. */
  clientId: string;
  /** MUST be identical to the Step-2 `resource`. (R-23.5-p) */
  resource: string;
}

/**
 * Builds the authorization-code token-request body (Step 4), fixing
 * `grant_type=authorization_code` and carrying the PKCE `code_verifier` plus the
 * REQUIRED `resource` parameter. (R-23.5-n, R-23.5-o, R-23.5-p, R-23.6-b)
 *
 * The `redirect_uri` and `resource` MUST be byte-identical to those sent in Step 2;
 * callers SHOULD pass the same values — {@link assertResourceMatchesStep2} can
 * verify the `resource` invariant. (R-23.5-o, R-23.5-p)
 *
 * @param options - The code, PKCE verifier, redirect URI, client, and resource.
 */
export function buildAuthorizationCodeTokenRequest(
  options: BuildAuthorizationCodeTokenRequestOptions,
): AuthorizationCodeTokenRequest {
  return {
    grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
    client_id: options.clientId,
    resource: options.resource,
  };
}

/** Inputs to {@link buildRefreshTokenRequest}. */
export interface BuildRefreshTokenRequestOptions {
  /** The refresh token being exchanged. (R-23.9-e) */
  refreshToken: string;
  /** The client identifier. */
  clientId: string;
  /** The SAME canonical resource identifier as Step 2. (R-23.9-e) */
  resource: string;
  /** OPTIONAL narrowed scopes. (R-23.9-f) */
  scope?: string;
}

/**
 * Builds the refresh-token token-request body, fixing `grant_type=refresh_token`
 * and carrying the same `resource` parameter so the refreshed token stays
 * audience-bound. (R-23.9-e, R-23.9-f)
 *
 * @param options - The refresh token, client, resource, and OPTIONAL narrowed scope.
 */
export function buildRefreshTokenRequest(
  options: BuildRefreshTokenRequestOptions,
): RefreshTokenRequest {
  const body: RefreshTokenRequest = {
    grant_type: GRANT_TYPE_REFRESH_TOKEN,
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    resource: options.resource,
  };
  if (options.scope !== undefined) body.scope = options.scope;
  return body;
}

/**
 * Serializes a token request into an `application/x-www-form-urlencoded` body.
 * (§23.5/§23.9 wire examples)
 *
 * @param request - The token request of either grant.
 */
export function encodeTokenRequestBody(request: TokenRequest): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) body.set(key, String(value));
  }
  return body.toString();
}

/**
 * Asserts that a token request's `resource` is byte-identical to the value sent in
 * Step 2, the audience-binding invariant. (R-23.5-p, R-23.9-e)
 *
 * @param request          - The token request (either grant).
 * @param step2Resource    - The `resource` sent in the Step-2 authorization request.
 */
export function assertResourceMatchesStep2(
  request: Pick<TokenRequest, 'resource'>,
  step2Resource: string,
): { ok: true } | { ok: false; reason: string } {
  if (request.resource !== step2Resource) {
    return {
      ok: false,
      reason: `token request resource "${request.resource}" MUST be identical to the Step-2 resource "${step2Resource}" (R-23.5-p)`,
    };
  }
  return { ok: true };
}

// ─── Token response (§23.5, §23.9) ──────────────────────────────────────────────

/**
 * The token-endpoint JSON response. (§23.5 Step 4, §23.9)
 *
 * `access_token` and `token_type` (`Bearer`) are REQUIRED; `expires_in`,
 * `refresh_token`, and `scope` are OPTIONAL — a client MUST NOT assume a refresh
 * token will be issued (R-23.9-d). `.passthrough()` preserves additional RFC 6749
 * fields.
 */
export const TokenResponseSchema = z
  .object({
    /** REQUIRED bearer token. (R-23.8-b) */
    access_token: z.string().min(1),
    /** REQUIRED token type; MCP uses `Bearer`. (R-23.8-b) */
    token_type: z.string().min(1),
    /** OPTIONAL lifetime in seconds. */
    expires_in: z.number().int().optional(),
    /** OPTIONAL refresh token, at the AS's discretion. (R-23.9-d) */
    refresh_token: z.string().optional(),
    /** OPTIONAL granted scopes. */
    scope: z.string().optional(),
  })
  .passthrough();

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

/** Returns `true` when `value` is a structurally valid token response. */
export function isTokenResponse(value: unknown): value is TokenResponse {
  return TokenResponseSchema.safeParse(value).success;
}

/** Outcome of {@link parseTokenResponse}. */
export type TokenResponseValidation =
  | { ok: true; token: TokenResponse }
  | { ok: false; reason: string };

/**
 * Parses and validates a token-endpoint response body. (§23.5, R-23.8-b)
 *
 * Confirms the REQUIRED `access_token`/`token_type` are present and that
 * `token_type` is `Bearer` (case-insensitive, per RFC 6749) since MCP presents the
 * token via the `Bearer` scheme (R-23.8-b). The presence of a `refresh_token` is
 * left to the caller's discretion-aware handling — never assumed (R-23.9-d).
 *
 * @param value - The raw token-endpoint response body.
 */
export function parseTokenResponse(value: unknown): TokenResponseValidation {
  const parsed = TokenResponseSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, reason: `invalid token response: ${parsed.error.message}` };
  }
  if (parsed.data.token_type.toLowerCase() !== TOKEN_TYPE_BEARER.toLowerCase()) {
    return {
      ok: false,
      reason: `token_type "${parsed.data.token_type}" MUST be "Bearer" for MCP (R-23.8-b)`,
    };
  }
  return { ok: true, token: parsed.data };
}

/**
 * Returns `true` when a token response did NOT issue a refresh token, so callers
 * never assume one was issued. (R-23.9-d)
 *
 * @param token - A parsed token response.
 */
export function hasNoRefreshToken(token: Pick<TokenResponse, 'refresh_token'>): boolean {
  return token.refresh_token === undefined;
}

// ─── Resource Indicators & audience binding (§23.6) ─────────────────────────────

/**
 * Returns the `resource` parameter value for the MCP server — its canonical
 * resource identifier — that MUST be sent in BOTH the authorization and token
 * requests, regardless of whether the authorization server advertises `resource`
 * support. (R-23.6-b, R-23.6-c, R-23.6-d, R-23.6-e)
 *
 * This is the identity of the canonical resource identifier; it is surfaced as a
 * named helper so call sites read intentionally and the "always send it" rule
 * (R-23.6-e) is explicit. The value SHOULD already be a canonical resource
 * identifier (validate with S35's `isValidCanonicalResourceIdentifier`).
 *
 * @param canonicalResourceIdentifier - The MCP server's canonical resource id.
 */
export function resourceParameterFor(canonicalResourceIdentifier: string): string {
  return canonicalResourceIdentifier;
}

/** Outcome of {@link validateTokenAudience}. */
export type TokenAudienceValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validates, on the MCP server side, that a presented token was issued for THIS
 * server as the intended audience, rejecting any token whose audience is some
 * other resource. (R-23.6-f, R-23.6-g, R-23.6-h)
 *
 * Compares the token's audience to this server's canonical resource identifier
 * using S35's `resourceIdentifiersEqual` (accepting uppercase scheme/host for
 * robustness, R-23.1-p). A server MUST only accept tokens valid for its own
 * resources and MUST NOT accept (or forward) any other token (R-23.6-h).
 *
 * @param tokenAudience              - The audience claim (`aud`) the token carries.
 * @param ownCanonicalResource       - This server's canonical resource identifier.
 */
export function validateTokenAudience(
  tokenAudience: string | string[],
  ownCanonicalResource: string,
): TokenAudienceValidation {
  const audiences = Array.isArray(tokenAudience) ? tokenAudience : [tokenAudience];
  const matches = audiences.some((aud) => resourceIdentifiersEqual(aud, ownCanonicalResource));
  if (!matches) {
    return {
      ok: false,
      reason: `token audience ${JSON.stringify(tokenAudience)} was not issued for this server "${ownCanonicalResource}"; reject and never forward (R-23.6-g, R-23.6-h)`,
    };
  }
  return { ok: true };
}

/** Outcome of {@link selectTokenForServer}. */
export type TokenSelectionResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string };

/**
 * Selects the access token a client may send to a given MCP server — strictly the
 * one issued by that server's authorization server for that server, and no other.
 * (R-23.6-i)
 *
 * Looks up the token recorded for `serverIssuer` and confirms its audience is the
 * server's `serverCanonicalResource`. When no matching token exists, returns an
 * error so the client sends NOTHING rather than a wrong-audience token — a client
 * MUST NOT send any token other than one issued for that server (R-23.6-i).
 *
 * @param options.serverIssuer            - The issuer of the server's authorization server.
 * @param options.serverCanonicalResource - The server's canonical resource id.
 * @param options.tokenIssuer             - The issuer that minted the candidate token.
 * @param options.tokenAudience           - The candidate token's audience.
 * @param options.accessToken             - The candidate access token.
 */
export function selectTokenForServer(options: {
  serverIssuer: string;
  serverCanonicalResource: string;
  tokenIssuer: string;
  tokenAudience: string | string[];
  accessToken: string;
}): TokenSelectionResult {
  if (options.tokenIssuer !== options.serverIssuer) {
    return {
      ok: false,
      reason: `token was issued by "${options.tokenIssuer}", not by this server's authorization server "${options.serverIssuer}"; MUST NOT send it (R-23.6-i)`,
    };
  }
  const audience = validateTokenAudience(options.tokenAudience, options.serverCanonicalResource);
  if (!audience.ok) {
    return { ok: false, reason: audience.reason };
  }
  return { ok: true, accessToken: options.accessToken };
}

// ─── Access-token usage (§23.8, R-23.8-a – R-23.8-f) ────────────────────────────

/**
 * Builds the `Authorization: Bearer <access-token>` request header value a client
 * MUST send on every request to the MCP server. (R-23.8-a, R-23.8-b)
 *
 * @param accessToken - The bearer access token.
 * @throws {RangeError} When `accessToken` is empty.
 */
export function buildBearerAuthorizationHeader(accessToken: string): string {
  if (!accessToken) {
    throw new RangeError('access token MUST NOT be empty (R-23.8-b)');
  }
  return `${BEARER_AUTH_SCHEME} ${accessToken}`;
}

/**
 * Extracts the bearer token from an `Authorization` header value, or `undefined`
 * when the header is absent or does not use the `Bearer` scheme. (R-23.8-b)
 *
 * The scheme match is case-insensitive per RFC 7235.
 *
 * @param headerValue - The raw `Authorization` header value, if any.
 */
export function extractBearerToken(headerValue: string | undefined): string | undefined {
  if (headerValue === undefined) return undefined;
  // Split scheme + credentials at the first whitespace run via linear scanning,
  // avoiding a `/^(\S+)\s+(.+)$/` regex whose overlapping `\s`/`.` repeats can
  // backtrack polynomially on crafted input (CodeQL js/polynomial-redos).
  const trimmed = headerValue.trim();
  const ws = trimmed.search(/\s/);
  if (ws < 0) return undefined;
  if (trimmed.slice(0, ws).toLowerCase() !== BEARER_AUTH_SCHEME.toLowerCase()) return undefined;
  const token = trimmed.slice(ws + 1).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Returns `true` when a URL carries an `access_token` in its query string, which a
 * client MUST NOT do. (R-23.8-c)
 *
 * Use to assert that a request URL does not smuggle the token in the query string;
 * the token belongs only in the `Authorization` header (R-23.8-b).
 *
 * @param requestUrl - The request URL to inspect.
 */
export function urlContainsAccessTokenInQuery(requestUrl: string): boolean {
  try {
    return new URL(requestUrl).searchParams.has('access_token');
  } catch {
    return /[?&]access_token=/.test(requestUrl);
  }
}

/**
 * A description of what an operation requires, against which the MCP server
 * validates a presented token on every request. (R-23.8-d)
 */
export interface TokenValidationContext {
  /** This server's canonical resource identifier (the expected audience). (R-23.8-d) */
  ownCanonicalResource: string;
  /** The scopes this specific operation requires; empty when none. (R-23.8-d, R-23.8-f) */
  requiredScopes?: string[];
  /** The protected-resource metadata URI for the `WWW-Authenticate` challenge. */
  resourceMetadata: string;
}

/** The validated facts about a presented token, supplied by signature/introspection. */
export interface PresentedToken {
  /** Whether the signature or introspection result is valid. (R-23.8-d) */
  active: boolean;
  /** Whether the token is unexpired. (R-23.8-d) */
  expired: boolean;
  /** The token's audience claim. (R-23.8-d) */
  audience: string | string[];
  /** The scopes the token grants. (R-23.8-d) */
  scopes: string[];
}

/** Outcome of {@link validateAccessTokenRequest}. */
export type AccessTokenValidation =
  | { ok: true }
  | { ok: false; challenge: UnauthorizedChallenge | InsufficientScopeChallenge };

/**
 * Validates a presented access token on the MCP server side, on EVERY request,
 * yielding a `401`/`403` challenge on failure. (R-23.8-a, R-23.8-d, R-23.8-e,
 * R-23.8-f)
 *
 * The server treats each request independently and revalidates the token each time
 * (R-23.8-a). The checks, in order:
 *   - missing / inactive / expired token → `401 Unauthorized` (R-23.8-e);
 *   - wrong audience → `401 Unauthorized` (the token was not issued for this
 *     server; R-23.6-f/g, R-23.8-d/e);
 *   - valid token lacking a required scope → `403 Forbidden` with an
 *     `insufficient_scope` challenge (R-23.8-f).
 *
 * The `401`/`403` challenges are built with S35's `buildUnauthorizedResponse` /
 * `buildInsufficientScopeResponse`.
 *
 * @param token   - The presented token's validated facts, or `undefined` when absent.
 * @param context - What this operation requires.
 */
export function validateAccessTokenRequest(
  token: PresentedToken | undefined,
  context: TokenValidationContext,
): AccessTokenValidation {
  const requiredScopes = context.requiredScopes ?? [];

  // Missing / invalid / expired → 401. (R-23.8-e)
  if (token === undefined || !token.active || token.expired) {
    return {
      ok: false,
      challenge: buildUnauthorizedResponse({
        resourceMetadata: context.resourceMetadata,
        scope: requiredScopes.length > 0 ? requiredScopes.join(' ') : undefined,
      }),
    };
  }

  // Wrong audience → 401: the token was not issued for this server. (R-23.6-f/g, R-23.8-d/e)
  const audience = validateTokenAudience(token.audience, context.ownCanonicalResource);
  if (!audience.ok) {
    return {
      ok: false,
      challenge: buildUnauthorizedResponse({
        resourceMetadata: context.resourceMetadata,
        scope: requiredScopes.length > 0 ? requiredScopes.join(' ') : undefined,
      }),
    };
  }

  // Valid token lacking required scope → 403 insufficient_scope. (R-23.8-f)
  const missing = requiredScopes.filter((s) => !token.scopes.includes(s));
  if (missing.length > 0) {
    return {
      ok: false,
      challenge: buildInsufficientScopeResponse({
        scope: requiredScopes.join(' '),
        resourceMetadata: context.resourceMetadata,
        errorDescription: `missing required scope(s): ${missing.join(' ')}`,
      }),
    };
  }

  return { ok: true };
}

// Re-export the status/error constants the validation outcomes carry, so callers
// of S36 need not also import them from S35 (no redefinition — these are the same
// S35 bindings). (R-23.8-e, R-23.8-f)
export { UNAUTHORIZED_STATUS, AUTHORIZATION_FORBIDDEN_STATUS, INSUFFICIENT_SCOPE_ERROR };
