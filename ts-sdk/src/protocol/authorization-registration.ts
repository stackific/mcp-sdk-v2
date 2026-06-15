/**
 * S37 — Authorization III: registration mechanisms, scopes & security
 * (§23.11–§23.19).
 *
 * S35 (`authorization.ts`) established the authorization model and the
 * protected-resource / authorization-server metadata discovery; S36
 * (`authorization-flow.ts`) built the authorization-code-with-PKCE flow, token
 * exchange, audience binding, and the registration *data types* (CIMD / DCR
 * schemas, the `ClientIdMechanism` enum, scope resolution helpers, the PKCE and
 * `iss` validators). This module completes the authorization surface by adding
 * the parts S37 owns on top of that foundation, WITHOUT re-implementing the
 * PKCE/token flow:
 *
 *   - **metadata-driven mechanism selection** — choosing the first applicable
 *     `client_id` mechanism after inspecting the *validated authorization-server
 *     metadata*, gating CIMD on `client_id_metadata_document_supported` and DCR
 *     on `registration_endpoint` (R-23.11-a – R-23.11-e). S36's
 *     `selectClientIdMechanism` ranks a *static* capability set; this consults
 *     the live metadata flags and the pre-registration credential state;
 *   - **CIMD client-side hosting predicates** — the `https`-with-path `client_id`
 *     URL rule and the document-identity rule, reusing S36's
 *     `isValidCimdClientIdUrl` / `validateClientIdMetadataDocument` and adding
 *     an AS-side cache (HTTP-cache-header aware) and host-domain trust policy
 *     (R-23.12-a – R-23.12-l);
 *   - **`application_type` selection & DCR retry** — reusing S36's
 *     `applicationTypeFor` / `handleDynamicClientRegistrationResponse`, adding a
 *     loopback-aware native/web classifier and a bounded retry that adjusts the
 *     `application_type` (R-23.15-a – R-23.15-f);
 *   - **credential binding to the issuer** — the issuer-keyed re-registration
 *     decision with the CIMD exemption and the SHOULD-surface-error behaviour,
 *     by exact string comparison (R-23.16-a – R-23.16-g);
 *   - **discovery robustness** — predicate wrappers over S35's
 *     `protectedResourceWellKnownUris` / `authorizationServerWellKnownUris`, the
 *     `authorization_servers` requirement, and per-AS registration-state
 *     separation (R-23.17-a – R-23.17-i);
 *   - **scope selection & the step-up authorization flow** — the least-privilege
 *     selection (reusing S36's `resolveAuthorizationScope`), the scope *union*
 *     that never drops already-granted scopes, the bounded retry, and the
 *     per-resource-and-operation upgrade tracker (R-23.18-a – R-23.18-r,
 *     R-23.1-ae – R-23.1-ag);
 *   - **authorization security requirements** — consolidated predicates for
 *     audience binding, exact issuer validation, PKCE-mandatory, `state`, token
 *     confidentiality, and refresh-token handling, delegating the mechanics to
 *     S36 (R-23.19-a – R-23.19-u).
 *
 * Out of scope (owned elsewhere, per the story): the static `insufficient_scope`
 * `403` response shape and the `401`/`403`/`400` status mapping — S35
 * (`buildInsufficientScopeResponse`, reused as the runtime trigger here, not
 * redefined); the PKCE/token mechanics, the `resource` parameter, `iss`
 * validation, and bearer-header usage — S36 (reused, not redefined); the
 * Streamable HTTP transport — S14/S15; the consolidated security treatment — S44.
 *
 * Mirrors the style of `authorization.ts` and `authorization-flow.ts` — schemas +
 * validators + builders, `{ ok: true } | { ok: false; reason }` results, and
 * named predicates. Builds on their `ClientIdMechanism`, `ClientIdMetadataDocument*`,
 * `isValidCimdClientIdUrl`, `validateClientIdMetadataDocument`, `applicationTypeFor`,
 * `handleDynamicClientRegistrationResponse`, `resolveAuthorizationScope`,
 * `withOfflineAccessScope`, `advertisedScopesExcludeOfflineAccess`,
 * `validateIssuer`, `urlContainsAccessTokenInQuery`, `protectedResourceWellKnownUris`,
 * `authorizationServerWellKnownUris`, and `validateAuthorizationServerMetadata`
 * symbols, none of which are redefined here.
 */

import {
  type ClientIdMechanism,
  type ApplicationType,
  type ClientIdMetadataDocument,
  isValidCimdClientIdUrl,
  applicationTypeFor,
  handleDynamicClientRegistrationResponse,
  type DynamicClientRegistrationResult,
  resolveAuthorizationScope,
  urlContainsAccessTokenInQuery,
  validateIssuer,
  OFFLINE_ACCESS_SCOPE,
  GRANT_TYPE_REFRESH_TOKEN,
} from './authorization-flow.js';
import {
  type AuthorizationServerMetadata,
  type ProtectedResourceMetadata,
  type WwwAuthenticateChallenge,
  protectedResourceWellKnownUris,
  authorizationServerWellKnownUris,
} from './authorization.js';

// ─── §23.11 Obtaining a client_id & selecting a mechanism (R-23.11-a – R-23.11-e) ─

/**
 * The authorization-server-metadata flag that gates the CIMD mechanism. When
 * `true`, the AS supports Client ID Metadata Documents. (R-23.11-d)
 */
export const CLIENT_ID_METADATA_DOCUMENT_SUPPORTED_FIELD = 'client_id_metadata_document_supported' as const;

/**
 * The inputs a client inspects to pick a `client_id` mechanism: the validated
 * authorization-server metadata and whether it already holds pre-registered
 * credentials for that authorization server. (§23.11, R-23.11-c)
 */
export interface RegistrationMechanismContext {
  /**
   * The VALIDATED authorization-server metadata for the discovered AS. A client
   * MUST inspect this before choosing a mechanism (R-23.11-c). The `cimd` flag and
   * `registration_endpoint` here gate CIMD and DCR respectively.
   */
  authorizationServerMetadata: Pick<
    AuthorizationServerMetadata,
    'client_id_metadata_document_supported' | 'registration_endpoint'
  >;
  /**
   * `true` when the client already holds pre-registered client information for the
   * discovered authorization server (the highest-priority mechanism). (R-23.11-b)
   */
  hasPreRegisteredCredentials?: boolean;
  /**
   * The mechanisms this client is capable of, used to skip a mechanism the client
   * cannot perform even when the AS would allow it. Defaults to all of
   * pre-registration, CIMD, and DCR (the user prompt is always available as the
   * final fallback). (R-23.11-b)
   */
  supportedMechanisms?: Iterable<ClientIdMechanism>;
}

/** The mechanism chosen by {@link selectRegistrationMechanism}, with the reason it applied. */
export interface RegistrationMechanismSelection {
  /** The selected mechanism, or `'prompt'` when none applies. (R-23.11-b) */
  mechanism: ClientIdMechanism;
  /** Human-readable explanation of why this mechanism was selected. */
  reason: string;
}

/**
 * Selects the `client_id` mechanism from the VALIDATED authorization-server
 * metadata and the client's credential state, applying the §23.11 priority order
 * and the metadata gates. (R-23.11-a, R-23.11-b, R-23.11-c, R-23.11-d, R-23.11-e)
 *
 * The order, using the first that applies:
 *   1. pre-registration — when the client already holds credentials for this AS;
 *   2. CIMD — only when the AS metadata sets
 *      `client_id_metadata_document_supported: true` (R-23.11-d) AND the client
 *      supports it;
 *   3. DCR — only when the AS metadata advertises a `registration_endpoint`
 *      (R-23.11-e) AND the client supports it;
 *   4. `prompt` — otherwise prompt the user for client information.
 *
 * The function inspects the metadata before deciding (R-23.11-c) and never
 * returns `cimd`/`dcr` when the corresponding gate is closed (R-23.11-d,
 * R-23.11-e), so a caller acting on the result will not attempt a mechanism the
 * AS does not support. This complements S36's `selectClientIdMechanism`, which
 * ranks a static capability set; here the live metadata flags are the deciding
 * input.
 *
 * @param context - The validated AS metadata, credential state, and capabilities.
 */
export function selectRegistrationMechanism(
  context: RegistrationMechanismContext,
): RegistrationMechanismSelection {
  const supported = new Set<ClientIdMechanism>(
    context.supportedMechanisms ?? ['pre-registration', 'cimd', 'dcr'],
  );
  const metadata = context.authorizationServerMetadata;

  if (context.hasPreRegisteredCredentials === true && supported.has('pre-registration')) {
    return {
      mechanism: 'pre-registration',
      reason: 'pre-registered client information is already held for this authorization server (R-23.11-b)',
    };
  }
  if (metadata.client_id_metadata_document_supported === true && supported.has('cimd')) {
    return {
      mechanism: 'cimd',
      reason: 'authorization-server metadata sets client_id_metadata_document_supported: true (R-23.11-b, R-23.11-d)',
    };
  }
  if (metadata.registration_endpoint !== undefined && supported.has('dcr')) {
    return {
      mechanism: 'dcr',
      reason: 'authorization-server metadata advertises a registration_endpoint (R-23.11-b, R-23.11-e)',
    };
  }
  return {
    mechanism: 'prompt',
    reason: 'no automated mechanism applies; prompt the user for client information (R-23.11-b)',
  };
}

/**
 * Returns `true` when a client MAY attempt CIMD against this authorization
 * server — i.e. the metadata sets `client_id_metadata_document_supported: true`.
 * A client MUST NOT attempt CIMD otherwise. (R-23.11-d)
 *
 * @param metadata - The validated authorization-server metadata.
 */
export function mayAttemptCimd(
  metadata: Pick<AuthorizationServerMetadata, 'client_id_metadata_document_supported'>,
): boolean {
  return metadata.client_id_metadata_document_supported === true;
}

/**
 * Returns `true` when a client MAY attempt Dynamic Client Registration against
 * this authorization server — i.e. the metadata advertises a
 * `registration_endpoint`. A client MUST NOT attempt DCR otherwise. (R-23.11-e)
 *
 * @param metadata - The validated authorization-server metadata.
 */
export function mayAttemptDcr(
  metadata: Pick<AuthorizationServerMetadata, 'registration_endpoint'>,
): boolean {
  return metadata.registration_endpoint !== undefined && metadata.registration_endpoint !== '';
}

// ─── §23.12 Client ID Metadata Documents — client & AS side (R-23.12-a – R-23.12-l)

/** The `private_key_jwt` token-endpoint authentication method a CIMD client MAY use. (R-23.12-f) */
export const PRIVATE_KEY_JWT_AUTH_METHOD = 'private_key_jwt' as const;

/**
 * Returns `true` when both a client and an authorization server should prefer CIMD
 * as the registration path — both SHOULD support the mechanism. (R-23.12-a)
 *
 * @param clientSupportsCimd - Whether the client implements CIMD.
 * @param serverSupportsCimd - Whether the AS advertises
 *   `client_id_metadata_document_supported: true`.
 */
export function cimdIsPreferredPath(clientSupportsCimd: boolean, serverSupportsCimd: boolean): boolean {
  return clientSupportsCimd && serverSupportsCimd;
}

/**
 * Returns `true` when `clientIdUrl` satisfies the CIMD client-side hosting rules:
 * it is hosted at an `https` URL and the URL contains a path component. (R-23.12-b,
 * R-23.12-c)
 *
 * Delegates the `https`+path check to S36's `isValidCimdClientIdUrl`; surfaced
 * here under the §23.12 atom so call sites read against this story's rule.
 *
 * @param clientIdUrl - The CIMD `client_id` URL.
 */
export function isCimdClientIdHostingValid(clientIdUrl: string): boolean {
  return isValidCimdClientIdUrl(clientIdUrl);
}

/**
 * Returns `true` when a CIMD client MAY authenticate to the token endpoint with
 * `private_key_jwt`: the document declares that method and conveys an appropriate
 * `jwks`/`jwks_uri`. (R-23.12-f)
 *
 * @param document - The client's CIMD document.
 */
export function cimdSupportsPrivateKeyJwt(
  document: Pick<ClientIdMetadataDocument, 'token_endpoint_auth_method'> & Record<string, unknown>,
): boolean {
  if (document.token_endpoint_auth_method !== PRIVATE_KEY_JWT_AUTH_METHOD) return false;
  return document['jwks'] !== undefined || document['jwks_uri'] !== undefined;
}

/** A cached CIMD document with its HTTP-cache freshness bookkeeping. (R-23.12-k) */
interface CachedCimdEntry {
  /** The fetched document body. */
  document: ClientIdMetadataDocument;
  /** Epoch milliseconds after which the cache entry is stale; `undefined` ⇒ never cache. */
  expiresAtMs?: number;
}

/**
 * The HTTP caching directives an authorization server honours when caching a
 * fetched CIMD document. (R-23.12-k)
 */
export interface CimdCacheControl {
  /** `max-age` in seconds from `Cache-Control`, if any. */
  maxAgeSeconds?: number;
  /** `true` when `Cache-Control: no-store` (or `no-cache`) forbids caching. */
  noStore?: boolean;
}

/**
 * An authorization-server-side cache for fetched CIMD documents that respects HTTP
 * cache headers and applies a host-domain trust policy. (R-23.12-k, R-23.12-l)
 *
 * The AS SHOULD cache documents (R-23.12-k) and SHOULD apply CIMD security
 * considerations such as a trust policy over allowed client-hosting domains
 * (R-23.12-l). This cache enforces both: an optional `trustHost` predicate
 * rejects documents hosted on disallowed domains before they are stored, and a
 * `Cache-Control: no-store`/`no-cache` directive (or a non-positive `max-age`)
 * keeps a document out of the cache.
 */
export class CimdDocumentCache {
  readonly #byUrl = new Map<string, CachedCimdEntry>();
  readonly #trustHost: (host: string) => boolean;
  readonly #now: () => number;

  /**
   * @param options.trustHost - OPTIONAL host-domain trust policy; a document whose
   *   `client_id` host fails this predicate is never cached or returned (R-23.12-l).
   *   Defaults to trusting all hosts.
   * @param options.now       - OPTIONAL clock (epoch ms) for testing; defaults to
   *   `Date.now`.
   */
  constructor(options: { trustHost?: (host: string) => boolean; now?: () => number } = {}) {
    this.#trustHost = options.trustHost ?? (() => true);
    this.#now = options.now ?? (() => Date.now());
  }

  /**
   * Returns `true` when the host of `clientIdUrl` is permitted by the trust policy.
   * (R-23.12-l)
   *
   * @param clientIdUrl - The CIMD `client_id` URL.
   */
  isHostTrusted(clientIdUrl: string): boolean {
    let host: string;
    try {
      host = new URL(clientIdUrl).host;
    } catch {
      return false;
    }
    return this.#trustHost(host);
  }

  /**
   * Caches a fetched CIMD document keyed by its `client_id` URL, honouring HTTP
   * cache directives and the trust policy. Returns `true` when the document was
   * stored, `false` when caching was declined (untrusted host, `no-store`, or a
   * non-positive `max-age`). (R-23.12-k, R-23.12-l)
   *
   * @param clientIdUrl  - The `client_id` URL the document was fetched from.
   * @param document     - The fetched document.
   * @param cacheControl - The response's HTTP cache directives, if any.
   */
  store(clientIdUrl: string, document: ClientIdMetadataDocument, cacheControl: CimdCacheControl = {}): boolean {
    if (!this.isHostTrusted(clientIdUrl)) return false;
    if (cacheControl.noStore === true) return false;
    if (cacheControl.maxAgeSeconds !== undefined && cacheControl.maxAgeSeconds <= 0) return false;
    const expiresAtMs =
      cacheControl.maxAgeSeconds !== undefined
        ? this.#now() + cacheControl.maxAgeSeconds * 1000
        : undefined;
    this.#byUrl.set(clientIdUrl, { document, expiresAtMs });
    return true;
  }

  /**
   * Returns the cached document for `clientIdUrl` when present, trusted, and still
   * fresh; otherwise `undefined`. A stale entry is evicted on access. (R-23.12-k)
   *
   * @param clientIdUrl - The `client_id` URL.
   */
  get(clientIdUrl: string): ClientIdMetadataDocument | undefined {
    const entry = this.#byUrl.get(clientIdUrl);
    if (entry === undefined) return undefined;
    if (!this.isHostTrusted(clientIdUrl)) return undefined;
    if (entry.expiresAtMs !== undefined && this.#now() >= entry.expiresAtMs) {
      this.#byUrl.delete(clientIdUrl);
      return undefined;
    }
    return entry.document;
  }
}

// ─── §23.15 application_type selection & DCR retry (R-23.15-a – R-23.15-f) ────────

/**
 * Returns `true` when `host` is a loopback / localhost host, the marker of a
 * native (loopback-redirect) client for `application_type` selection. (R-23.15-b)
 *
 * @param host - The host component of a redirect URI.
 */
function isLoopbackRedirectHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

/**
 * Classifies a set of redirect URIs as native or web and returns the
 * `application_type` a client SHOULD register, consistent with those URIs.
 * (R-23.15-a, R-23.15-b, R-23.15-c)
 *
 * Redirect URIs that all resolve to a loopback/localhost host indicate a native
 * application (desktop/mobile/CLI/locally hosted web app) → `"native"`; otherwise
 * a remote browser-based application → `"web"`. The classification follows S36's
 * `applicationTypeFor` with the loopback test that makes it consistent with the
 * redirect URIs (R-23.15-a).
 *
 * @param redirectUris - The client's redirect URIs.
 */
export function applicationTypeForRedirectUris(redirectUris: readonly string[]): ApplicationType {
  const allLoopback =
    redirectUris.length > 0 &&
    redirectUris.every((uri) => {
      try {
        return isLoopbackRedirectHost(new URL(uri).host);
      } catch {
        return false;
      }
    });
  return applicationTypeFor(allLoopback);
}

/** Outcome of {@link registerWithRetry}: the final result and the attempts made. */
export interface DcrRetryResult {
  /** The final DCR result — success or the last failure. */
  result: DynamicClientRegistrationResult;
  /** The `application_type` of each attempt, in order, for diagnostics. */
  attempts: ApplicationType[];
}

/** Inputs to {@link registerWithRetry}. */
export interface RegisterWithRetryOptions {
  /** The `application_type` for the first attempt; see {@link applicationTypeForRedirectUris}. */
  initialApplicationType: ApplicationType;
  /**
   * Performs one registration POST for the given `application_type`, returning the
   * AS's HTTP status and parsed body. Injected so this is transport-agnostic.
   */
  attempt: (applicationType: ApplicationType) => Promise<{ status: number; body: unknown }>;
  /**
   * The maximum number of attempts (the initial attempt plus retries). MUST be a
   * few at most; defaults to `2` (one retry with the alternate `application_type`).
   * (R-23.15-f)
   */
  maxAttempts?: number;
}

/**
 * Performs Dynamic Client Registration with bounded retry, surfacing a meaningful
 * error and retrying with an adjusted `application_type` when the AS rejects on a
 * redirect-URI / application-type constraint. (R-23.15-d, R-23.15-e, R-23.15-f)
 *
 * A client MUST be prepared for OIDC redirect-URI rejection (R-23.15-d). Each
 * attempt's response is interpreted by S36's
 * `handleDynamicClientRegistrationResponse`; on a retryable failure (e.g. a `400`
 * redirect-URI/application-type constraint), the `application_type` is flipped
 * (`native` ↔ `web`) for the next attempt (R-23.15-f), up to `maxAttempts`. The
 * returned `result` carries a human-readable `reason` on failure for the client to
 * surface (R-23.15-e). This never throws on an AS rejection — it returns the
 * structured failure.
 *
 * @param options - The initial application type, the attempt callback, and limits.
 */
export async function registerWithRetry(options: RegisterWithRetryOptions): Promise<DcrRetryResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const attempts: ApplicationType[] = [];
  let applicationType = options.initialApplicationType;
  let last: DynamicClientRegistrationResult = {
    ok: false,
    reason: 'no registration attempt was made',
    retryable: false,
  };

  for (let i = 0; i < maxAttempts; i++) {
    attempts.push(applicationType);
    const { status, body } = await options.attempt(applicationType);
    last = handleDynamicClientRegistrationResponse(status, body);
    if (last.ok) {
      return { result: last, attempts };
    }
    if (!last.retryable) {
      return { result: last, attempts };
    }
    // Retryable rejection (e.g. an OIDC redirect-URI / application-type constraint):
    // flip the application_type and try again. (R-23.15-f)
    applicationType = applicationType === 'native' ? 'web' : 'native';
  }
  return { result: last, attempts };
}

// ─── §23.16 Credential binding to the issuer (R-23.16-a – R-23.16-g) ─────────────

/** Persisted client credentials bound to the issuing authorization server. (R-23.16-a) */
export interface IssuerBoundCredentials {
  /** The issuing authorization server's `issuer` identifier; the storage key. (R-23.16-b) */
  issuer: string;
  /** The `client_id` issued by (or pre-registered with) that authorization server. */
  clientId: string;
  /** OPTIONAL `client_secret` for confidential clients. */
  clientSecret?: string;
  /**
   * `true` when these credentials are a Client ID Metadata Document: a portable,
   * self-hosted HTTPS-URL `client_id` with no per-issuer registration state, hence
   * exempt from issuer re-binding/re-registration. (R-23.16, CIMD exemption)
   */
  cimd?: boolean;
}

/** The action a client takes for a discovered issuer, per the credential-binding rules. */
export type CredentialBindingAction = 'reuse' | 're-register' | 'surface-error';

/** Outcome of {@link decideCredentialBinding}. */
export interface CredentialBindingDecision {
  /** Whether to reuse the stored credentials, re-register, or surface an error. */
  action: CredentialBindingAction;
  /** Human-readable explanation, suitable for surfacing to a user/developer. */
  reason: string;
}

/**
 * Compares two `issuer` identifiers by EXACT string match, the comparison
 * mandated for credential binding. No scheme/host case folding, default-port
 * elision, trailing-slash, or percent-encoding normalization is applied.
 * (R-23.16-f)
 *
 * @param a - One `issuer` identifier.
 * @param b - The other `issuer` identifier.
 */
export function issuersMatchExactly(a: string, b: string): boolean {
  return a === b;
}

/**
 * Decides whether a client may reuse stored credentials for the
 * protected-resource-indicated authorization server, must re-register, or should
 * surface an error. (R-23.16-c, R-23.16-d, R-23.16-e, R-23.16-f, R-23.16-g, CIMD
 * exemption)
 *
 * Decision logic, all issuer comparisons by exact string match (R-23.16-f):
 *   - CIMD credentials are exempt: a portable HTTPS-URL `client_id` has no
 *     per-issuer state, so `reuse` regardless of issuer (CIMD exemption);
 *   - no stored credentials, or the stored `issuer` matches the discovered
 *     `issuer` → `reuse`;
 *   - stored `issuer` differs from the discovered `issuer`:
 *       - DCR-obtained (no `cimd`, not flagged pre-registered) → `re-register`
 *         with the new authorization server (R-23.16-d, R-23.16-e);
 *       - pre-registered (`isPreRegistered: true`) → `surface-error`, because
 *         pre-registered credentials cannot be re-registered automatically and the
 *         client SHOULD surface an error rather than silently using mismatched
 *         credentials (R-23.16-c, R-23.16-g).
 *
 * @param options.stored          - The stored credentials, or `undefined` when none.
 * @param options.discoveredIssuer- The `issuer` indicated by the target server's
 *   validated protected-resource/authorization-server metadata. (R-23.16-d)
 * @param options.isPreRegistered - `true` when the stored credentials were supplied
 *   out of band rather than obtained via DCR (governs the mismatch action). (R-23.16-g)
 */
export function decideCredentialBinding(options: {
  stored: IssuerBoundCredentials | undefined;
  discoveredIssuer: string;
  isPreRegistered?: boolean;
}): CredentialBindingDecision {
  const { stored, discoveredIssuer } = options;

  if (stored === undefined) {
    return { action: 're-register', reason: 'no credentials are stored for any issuer; register with the discovered authorization server (R-23.16-e)' };
  }
  if (stored.cimd === true) {
    return {
      action: 'reuse',
      reason: 'CIMD credentials are a portable self-hosted HTTPS-URL client_id with no per-issuer state; reuse without re-registration (CIMD exemption)',
    };
  }
  if (issuersMatchExactly(stored.issuer, discoveredIssuer)) {
    return { action: 'reuse', reason: `stored issuer "${stored.issuer}" matches the discovered issuer; reuse credentials (R-23.16-a, R-23.16-f)` };
  }
  // Issuer mismatch — MUST NOT reuse (R-23.16-c, R-23.16-d).
  if (options.isPreRegistered === true) {
    return {
      action: 'surface-error',
      reason: `pre-registered credentials are bound to "${stored.issuer}" but protected-resource metadata indicates "${discoveredIssuer}"; surface an error rather than silently using mismatched credentials (R-23.16-c, R-23.16-d, R-23.16-g)`,
    };
  }
  return {
    action: 're-register',
    reason: `credentials are bound to "${stored.issuer}" but the discovered issuer is "${discoveredIssuer}"; MUST NOT reuse, re-register with the new authorization server (R-23.16-c, R-23.16-d, R-23.16-e)`,
  };
}

/**
 * An issuer-keyed store for persisted, issuer-bound client credentials, keeping
 * separate registration state per authorization server. (R-23.16-a, R-23.16-b,
 * R-23.17-d)
 *
 * The storage key is the authorization server's `issuer` identifier (R-23.16-b);
 * {@link credentialsFor} never returns another issuer's credentials, so a caller
 * cannot reuse credentials across authorization servers (R-23.16-c). Distinct from
 * S36's `DynamicClientRegistrationStore` (DCR-specific) and S35's `CredentialStore`
 * (runtime tokens): this holds the persisted registration identity for ALL
 * mechanisms (pre-registration and DCR), flagged with the CIMD exemption.
 */
export class IssuerBoundCredentialStore {
  readonly #byIssuer = new Map<string, IssuerBoundCredentials>();

  /**
   * Persists `credentials`, keyed by their `issuer`. (R-23.16-a, R-23.16-b)
   *
   * @throws {RangeError} When `credentials.issuer` is empty — the key is REQUIRED.
   */
  save(credentials: IssuerBoundCredentials): void {
    if (!credentials.issuer) {
      throw new RangeError('credential storage key MUST be the authorization server issuer (R-23.16-b)');
    }
    this.#byIssuer.set(credentials.issuer, { ...credentials });
  }

  /** Returns the credentials stored for `issuer`, or `undefined`. Never another issuer's. (R-23.16-b, R-23.16-c) */
  credentialsFor(issuer: string): IssuerBoundCredentials | undefined {
    const found = this.#byIssuer.get(issuer);
    return found ? { ...found } : undefined;
  }

  /** Returns `true` when credentials are stored for `issuer`. */
  has(issuer: string): boolean {
    return this.#byIssuer.has(issuer);
  }

  /**
   * Returns the {@link CredentialBindingDecision} for the credentials stored under
   * `discoveredIssuer`, the convenience entry point combining lookup and
   * {@link decideCredentialBinding}. (R-23.16-c – R-23.16-g)
   *
   * @param discoveredIssuer  - The `issuer` indicated by the target server's metadata.
   * @param isPreRegistered   - `true` when the stored credentials were pre-registered.
   */
  decideFor(discoveredIssuer: string, isPreRegistered = false): CredentialBindingDecision {
    return decideCredentialBinding({
      stored: this.credentialsFor(discoveredIssuer),
      discoveredIssuer,
      isPreRegistered,
    });
  }
}

// ─── §23.17 Discovery robustness (R-23.17-a – R-23.17-i) ─────────────────────────

/**
 * Resolves the ordered protected-resource-metadata URIs to try, honouring the
 * `WWW-Authenticate` `resource_metadata` precedence. (R-23.17-a, R-23.17-b)
 *
 *   - When the `401` carried a `resource_metadata` URL, that single URL MUST be
 *     used (R-23.17-a);
 *   - otherwise the well-known URIs are returned in order — path-prefixed first,
 *     then host root — via S35's {@link protectedResourceWellKnownUris} (R-23.17-b).
 *
 * @param options.resourceMetadataUrl - The `resource_metadata` URL from the
 *   `401`'s `WWW-Authenticate` header, if any (R-23.17-a).
 * @param options.mcpEndpointUrl      - The MCP endpoint URL, used to build the
 *   well-known fallbacks (R-23.17-b).
 */
export function protectedResourceMetadataUris(options: {
  resourceMetadataUrl?: string;
  mcpEndpointUrl?: string;
}): string[] {
  if (options.resourceMetadataUrl !== undefined && options.resourceMetadataUrl !== '') {
    return [options.resourceMetadataUrl];
  }
  if (options.mcpEndpointUrl === undefined || options.mcpEndpointUrl === '') {
    return [];
  }
  try {
    return protectedResourceWellKnownUris(options.mcpEndpointUrl);
  } catch {
    return [];
  }
}

/** Outcome of {@link requireAuthorizationServers}. */
export type AuthorizationServersValidation =
  | { ok: true; authorizationServers: string[] }
  | { ok: false; reason: string };

/**
 * Validates that protected-resource metadata carries the REQUIRED
 * `authorization_servers` array of one or more issuer identifiers. (R-23.17-c)
 *
 * A valid document MUST contain `authorization_servers` with at least one entry;
 * when more than one is listed, each is an independent authorization server the
 * client selects among, maintaining separate registration state per AS (R-23.17-d,
 * enforced by {@link IssuerBoundCredentialStore}).
 *
 * @param metadata - The protected-resource metadata.
 */
export function requireAuthorizationServers(
  metadata: Pick<ProtectedResourceMetadata, 'authorization_servers'>,
): AuthorizationServersValidation {
  const servers = metadata.authorization_servers;
  if (!Array.isArray(servers) || servers.length === 0) {
    return {
      ok: false,
      reason: 'protected-resource metadata MUST contain authorization_servers with one or more issuer identifiers (R-23.17-c)',
    };
  }
  return { ok: true, authorizationServers: [...servers] };
}

/**
 * Returns the ordered authorization-server-metadata well-known URIs to try for
 * `issuer`, covering both OAuth 2.0 AS Metadata and OpenID Connect Discovery, for
 * issuers with and without a path component. (R-23.17-e, R-23.17-f, R-23.17-g)
 *
 * A thin pass-through over S35's {@link authorizationServerWellKnownUris}, surfaced
 * under the §23.17 atoms; returns the three path-component URIs (OAuth insertion,
 * OIDC insertion, OIDC appending) for a path issuer and the two for a non-path
 * issuer, in the mandated priority order.
 *
 * @param issuer - The authorization server's `issuer` identifier URL.
 */
export function authorizationServerMetadataUris(issuer: string): string[] {
  return authorizationServerWellKnownUris(issuer);
}

/** Outcome of {@link validateDiscoveredIssuer}. */
export type DiscoveredIssuerValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validates that a fetched authorization-server metadata document's `issuer` is
 * IDENTICAL to the issuer used to construct the well-known URL; if it differs the
 * document MUST NOT be used. (R-23.17-h, R-23.17-i)
 *
 * Exact string comparison — the same mix-up defence S35's
 * `validateAuthorizationServerMetadata` performs; this surfaces just the
 * issuer-identity check under the §23.17 atoms for callers that have already
 * structurally validated the document.
 *
 * @param documentIssuer - The `issuer` in the fetched document.
 * @param expectedIssuer - The issuer used to construct the well-known URL.
 */
export function validateDiscoveredIssuer(documentIssuer: string, expectedIssuer: string): DiscoveredIssuerValidation {
  if (documentIssuer !== expectedIssuer) {
    return {
      ok: false,
      reason: `fetched metadata issuer "${documentIssuer}" does not match the expected issuer "${expectedIssuer}"; MUST NOT use the metadata (R-23.17-h, R-23.17-i)`,
    };
  }
  return { ok: true };
}

// ─── §23.18 Scope selection & step-up authorization (R-23.18-a – R-23.18-r) ──────

/**
 * Splits a space-delimited scope string into a deduplicated, order-preserving list.
 * Empty/whitespace-only input yields `[]`.
 *
 * @param scope - A space-delimited scope string, or `undefined`.
 */
export function parseScopeSet(scope: string | undefined): string[] {
  if (scope === undefined) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scope.split(/\s+/)) {
    if (s.length > 0 && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** Serializes a scope list back into a space-delimited string. */
export function formatScopeSet(scopes: readonly string[]): string {
  return scopes.join(' ');
}

/**
 * Selects the least-privilege scopes for the initial authorization handshake,
 * applying the §23.18 priority: the `WWW-Authenticate` challenge `scope` (treated
 * as authoritative, with no assumed relationship to `scopes_supported`), else all
 * of `scopes_supported`, else omit the `scope` parameter entirely. (R-23.18-a,
 * R-23.18-b, R-23.18-c, R-23.18-d)
 *
 * Delegates to S36's {@link resolveAuthorizationScope}, whose priority order is
 * identical; surfaced here under the §23.18 atoms. Returns `undefined` to signal
 * the `scope` parameter is omitted (R-23.18-d).
 *
 * @param options.challenge         - The parsed `WWW-Authenticate` challenge, if any.
 * @param options.protectedResource - Protected-resource metadata, if any.
 */
export function selectInitialScopes(options: {
  challenge?: WwwAuthenticateChallenge;
  protectedResource?: Pick<ProtectedResourceMetadata, 'scopes_supported'>;
}): string | undefined {
  return resolveAuthorizationScope(options);
}

/**
 * Computes the UNION of already-granted/already-requested scopes with the
 * newly-challenged scopes, the scope set a step-up re-authorization requests.
 * (R-23.18-o, R-23.18-p, R-23.1-ae)
 *
 * Order-preserving and deduplicating: every already-granted scope is retained
 * (R-23.18-p — never dropped) and the challenged scopes are appended. The result
 * is the authoritative requested-scope set for the re-authorization. Hierarchically
 * redundant scopes are NOT deduplicated semantically — the AS normalizes that
 * during issuance (R-23.18-r).
 *
 * @param alreadyGranted    - The scopes the client already holds/requested.
 * @param challengedScopes  - The scopes from the current challenge.
 */
export function unionStepUpScopes(
  alreadyGranted: readonly string[],
  challengedScopes: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...alreadyGranted, ...challengedScopes]) {
    if (s.length > 0 && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Who the client is acting for, governing whether a step-up flow is attempted.
 * (R-23.18-m, R-23.18-n)
 *
 *   - `user` — acting on behalf of a user; SHOULD attempt step-up (R-23.18-m).
 *   - `client_credentials` — acting on its own behalf; MAY attempt or abort (R-23.18-n).
 */
export type StepUpActor = 'user' | 'client_credentials';

/**
 * Returns `true` when a client SHOULD attempt the step-up flow for a scope-related
 * error: always for a user-acting client (R-23.18-m); for a `client_credentials`
 * client it MAY attempt or abort, so this returns `false` (the conservative
 * default — the caller MAY override). (R-23.18-l, R-23.18-m, R-23.18-n)
 *
 * @param actor - Who the client is acting for.
 */
export function shouldAttemptStepUp(actor: StepUpActor): boolean {
  return actor === 'user';
}

/** A scope-upgrade attempt key: the resource-and-operation combination being upgraded. (R-23.18-r) */
export interface ScopeUpgradeKey {
  /** The MCP server's canonical resource identifier. */
  resource: string;
  /** The operation (e.g. the MCP method) being attempted. */
  operation: string;
}

/** The next action a step-up driver should take, from {@link ScopeUpgradeTracker.nextAction}. */
export type StepUpAction = 'retry' | 'permanent-failure';

/**
 * Tracks bounded step-up retry attempts per resource-and-operation combination, so
 * a client retries no more than a few times and treats persistent failure as a
 * permanent authorization failure. (R-23.18-q, R-23.18-r, R-23.1-af, R-23.1-ag)
 *
 * Each {@link ScopeUpgradeKey} accumulates an attempt count; once the bound is
 * reached, {@link nextAction} returns `'permanent-failure'` rather than `'retry'`,
 * implementing the retry limit (R-23.18-q) and the per-resource-and-operation
 * attempt tracking that avoids repeated failures for the same combination
 * (R-23.18-r, R-23.1-ag).
 */
export class ScopeUpgradeTracker {
  readonly #attempts = new Map<string, number>();
  readonly #maxAttempts: number;

  /**
   * @param maxAttempts - The maximum number of step-up attempts per
   *   resource-and-operation; MUST be a few at most. Defaults to `3`. (R-23.18-q)
   * @throws {RangeError} When `maxAttempts` is not a positive integer.
   */
  constructor(maxAttempts = 3) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('maxAttempts MUST be a positive integer (a few at most) (R-23.18-q)');
    }
    this.#maxAttempts = maxAttempts;
  }

  /** The configured retry bound. */
  get maxAttempts(): number {
    return this.#maxAttempts;
  }

  #keyOf(key: ScopeUpgradeKey): string {
    return `${key.resource} ${key.operation}`;
  }

  /** Returns the number of step-up attempts recorded so far for `key`. (R-23.1-ag) */
  attemptsFor(key: ScopeUpgradeKey): number {
    return this.#attempts.get(this.#keyOf(key)) ?? 0;
  }

  /**
   * Returns `true` when another step-up attempt is permitted for `key` (the bound
   * has not been reached). (R-23.18-q)
   *
   * @param key - The resource-and-operation combination.
   */
  canRetry(key: ScopeUpgradeKey): boolean {
    return this.attemptsFor(key) < this.#maxAttempts;
  }

  /**
   * Records one step-up attempt for `key` and returns the new attempt count. (R-23.1-ag)
   *
   * @param key - The resource-and-operation combination.
   */
  recordAttempt(key: ScopeUpgradeKey): number {
    const next = this.attemptsFor(key) + 1;
    this.#attempts.set(this.#keyOf(key), next);
    return next;
  }

  /**
   * Records an attempt for `key` and returns whether to `'retry'` or treat the
   * failure as a `'permanent-failure'`, implementing the bounded retry. After the
   * bound is reached, persistent failure MUST be treated as a permanent
   * authorization failure. (R-23.18-q, R-23.1-af)
   *
   * @param key - The resource-and-operation combination.
   */
  nextAction(key: ScopeUpgradeKey): StepUpAction {
    const attempts = this.recordAttempt(key);
    return attempts <= this.#maxAttempts ? 'retry' : 'permanent-failure';
  }

  /** Clears the attempt count for `key` (e.g. after a successful retry). */
  reset(key: ScopeUpgradeKey): void {
    this.#attempts.delete(this.#keyOf(key));
  }
}

/** A plan for one step-up re-authorization, from {@link planStepUpAuthorization}. */
export interface StepUpPlan {
  /** Whether a step-up should be attempted at all (per the actor and retry bound). */
  proceed: boolean;
  /** The UNION scope set to request on re-authorization, when `proceed`. (R-23.18-o) */
  scopes: string[];
  /** The space-delimited `scope` parameter for the re-authorization request. */
  scope: string;
  /** When `proceed` is `false`, why the step-up is not attempted. */
  reason?: string;
}

/** Inputs to {@link planStepUpAuthorization}. */
export interface PlanStepUpOptions {
  /** Who the client is acting for. (R-23.18-m, R-23.18-n) */
  actor: StepUpActor;
  /** The scopes the client already holds/requested. (R-23.18-o) */
  alreadyGranted: readonly string[];
  /** The challenge driving the step-up (its `scope` is parsed for the union). (R-23.18-l) */
  challenge: WwwAuthenticateChallenge;
  /** The resource-and-operation being upgraded, for retry tracking. (R-23.18-r) */
  key: ScopeUpgradeKey;
  /** The shared upgrade tracker enforcing the retry bound. (R-23.18-q) */
  tracker: ScopeUpgradeTracker;
  /**
   * `true` to attempt step-up even for a `client_credentials` client, exercising
   * the MAY of R-23.18-n. Defaults to `false`.
   */
  forceForClientCredentials?: boolean;
}

/**
 * Plans one step-up re-authorization end to end: decides whether to proceed (by
 * actor and remaining retries), computes the UNION scope set that never drops
 * already-granted scopes, and records the attempt against the bound. (R-23.18-l,
 * R-23.18-m, R-23.18-n, R-23.18-o, R-23.18-p, R-23.18-q, R-23.18-r, R-23.1-ae,
 * R-23.1-af, R-23.1-ag)
 *
 * Proceeds when (a) the actor SHOULD/elects to step up — a user-acting client, or
 * a `client_credentials` client with `forceForClientCredentials` — AND (b) the
 * tracker still permits a retry for the `key`. When it proceeds it records the
 * attempt (R-23.1-ag) and returns the unioned `scopes`/`scope` for a fresh
 * authorization-code+PKCE flow (built with S36's `buildAuthorizationRequest`).
 * When the retry bound is exhausted it returns `proceed: false` so the caller
 * treats the failure as permanent (R-23.18-q).
 *
 * @param options - The actor, already-granted scopes, challenge, key, and tracker.
 */
export function planStepUpAuthorization(options: PlanStepUpOptions): StepUpPlan {
  const wantsStepUp =
    shouldAttemptStepUp(options.actor) || options.forceForClientCredentials === true;
  if (!wantsStepUp) {
    return {
      proceed: false,
      scopes: [],
      scope: '',
      reason: 'a client_credentials client MAY abort rather than step up; not attempting (R-23.18-n)',
    };
  }
  if (!options.tracker.canRetry(options.key)) {
    return {
      proceed: false,
      scopes: [],
      scope: '',
      reason: `step-up retry bound (${options.tracker.maxAttempts}) reached for this resource-and-operation; treat as a permanent authorization failure (R-23.18-q, R-23.1-af)`,
    };
  }
  const challenged = parseScopeSet(options.challenge.scope);
  const scopes = unionStepUpScopes(options.alreadyGranted, challenged);
  options.tracker.recordAttempt(options.key);
  return { proceed: true, scopes, scope: formatScopeSet(scopes) };
}

// ─── §23.19 Authorization security considerations (R-23.19-a – R-23.19-u) ────────

/** Outcome of {@link checkResourceParameterBinding}. */
export type ResourceBindingValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validates the audience-binding requirement: the SAME `resource` parameter,
 * identifying the MCP server by its canonical URI, MUST be present in BOTH the
 * authorization request and the token request, regardless of advertised AS
 * support. (R-23.19-a)
 *
 * A client MUST implement Resource Indicators by always sending `resource` in both
 * legs (R-23.19-a). This confirms both are present and byte-identical to
 * `canonicalResource`; S36's `assertResourceMatchesStep2` performs the equivalent
 * Step-2/Step-4 invariant, and is reused by callers that already hold the request
 * objects.
 *
 * @param options.authorizationRequestResource - The `resource` sent in the
 *   authorization request. (R-23.19-a)
 * @param options.tokenRequestResource         - The `resource` sent in the token
 *   request. (R-23.19-a)
 * @param options.canonicalResource            - The MCP server's canonical resource
 *   identifier both MUST equal.
 */
export function checkResourceParameterBinding(options: {
  authorizationRequestResource?: string;
  tokenRequestResource?: string;
  canonicalResource: string;
}): ResourceBindingValidation {
  if (options.authorizationRequestResource !== options.canonicalResource) {
    return {
      ok: false,
      reason: 'the authorization request MUST send a resource parameter equal to the MCP server canonical URI, regardless of AS support (R-23.19-a)',
    };
  }
  if (options.tokenRequestResource !== options.canonicalResource) {
    return {
      ok: false,
      reason: 'the token request MUST send the same resource parameter as the authorization request (R-23.19-a)',
    };
  }
  return { ok: true };
}

/**
 * Returns `true` when a client MAY send the access token it holds for
 * `tokenIssuer` to the MCP server whose authorization server is `serverIssuer` —
 * strictly only when the issuers match exactly. A client MUST NOT send a token to
 * an MCP server other than one issued by that server's authorization server.
 * (R-23.19-c)
 *
 * @param tokenIssuer  - The issuer that minted the token the client holds.
 * @param serverIssuer - The issuer of the target server's authorization server.
 */
export function mayForwardTokenToServer(tokenIssuer: string, serverIssuer: string): boolean {
  return issuersMatchExactly(tokenIssuer, serverIssuer);
}

/** Outcome of {@link validateExactIssuer}, the §23.19 mix-up-defence check. */
export type ExactIssuerValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validates the authorization response's `iss` against the recorded issuer by
 * exact string comparison — the mix-up defence a client MUST perform BEFORE
 * transmitting the authorization code, including the
 * `authorization_response_iss_parameter_supported` reject rule. (R-23.19-e,
 * R-23.19-f, R-23.19-g, R-23.19-h)
 *
 * Delegates to S36's {@link validateIssuer} (the §23.7 decision table); surfaced
 * here under the §23.19 security atoms. The recorded issuer MUST have been captured
 * before redirect (R-23.19-e) and stored with the PKCE verifier and `state` in the
 * same per-request record (R-23.19-j, see {@link sameRequestRecord}). On failure
 * the caller MUST NOT redeem the code or display the response's `error`/details
 * (R-23.19-i, S36's `safeAuthorizationError`).
 *
 * @param options.iss                   - The decoded `iss` from the response, if any.
 * @param options.recordedIssuer        - The issuer recorded before redirect. (R-23.19-e)
 * @param options.issParameterSupported - The AS flag, if advertised. (R-23.19-g)
 */
export function validateExactIssuer(options: {
  iss?: string;
  recordedIssuer: string;
  issParameterSupported?: boolean;
}): ExactIssuerValidation {
  const result = validateIssuer(options);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * The per-request record that MUST hold the recorded issuer, PKCE code verifier,
 * and `state` together. (R-23.19-e, R-23.19-j, R-23.19-k, R-23.19-l)
 *
 * Storing all three in one record is what lets the redirect handler validate `iss`
 * (against `recordedIssuer`), `state`, and PKCE coherently. This mirrors S36's
 * `AuthorizationFlowRecord`; it is restated here as the §23.19 security invariant
 * the consolidated check {@link sameRequestRecord} asserts.
 */
export interface SecureAuthorizationRequestRecord {
  /** The validated `issuer`, recorded BEFORE redirect. (R-23.19-e) */
  recordedIssuer: string;
  /** The PKCE `code_verifier`. (R-23.19-k) */
  codeVerifier: string;
  /** The unpredictable anti-CSRF `state`. (R-23.19-l) */
  state: string;
}

/** Outcome of {@link sameRequestRecord}. */
export type RequestRecordValidation = { ok: true } | { ok: false; reason: string };

/**
 * Asserts that the recorded issuer, PKCE code verifier, and `state` are all present
 * in the same per-request record, the §23.19 storage invariant. (R-23.19-j)
 *
 * All three MUST be co-located so the redirect can be validated coherently; an
 * empty field means the record is incomplete and the flow MUST NOT proceed.
 *
 * @param record - The per-request record under construction.
 */
export function sameRequestRecord(
  record: Partial<SecureAuthorizationRequestRecord>,
): RequestRecordValidation {
  if (!record.recordedIssuer) {
    return { ok: false, reason: 'the recorded issuer MUST be stored in the per-request record (R-23.19-e, R-23.19-j)' };
  }
  if (!record.codeVerifier) {
    return { ok: false, reason: 'the PKCE code_verifier MUST be stored in the same per-request record (R-23.19-j, R-23.19-k)' };
  }
  if (!record.state) {
    return { ok: false, reason: 'the state value MUST be stored in the same per-request record (R-23.19-j, R-23.19-l)' };
  }
  return { ok: true };
}

/**
 * Returns `true` when a value MUST NOT be logged or forwarded because it is an
 * access or refresh token — the token-confidentiality guard. Always `true`: access
 * and refresh tokens MUST NOT be logged and MUST NOT be forwarded to third
 * parties. (R-23.19-m, R-23.19-n)
 *
 * Use to gate logging/forwarding sinks: `if (isConfidentialToken()) skipLogging()`.
 * It takes no token argument by design — the rule is unconditional, so it never
 * incentivizes passing a token where it might be captured.
 */
export function isConfidentialToken(): boolean {
  return true;
}

/**
 * Returns a redacted placeholder for a token so diagnostics never carry the secret
 * itself, enforcing token confidentiality at log/forward sinks. (R-23.19-m,
 * R-23.19-n, R-23.19-o)
 *
 * Access and refresh tokens MUST NOT be logged or forwarded; when a diagnostic must
 * reference "the token", use this redaction instead of the value. Returns a fixed
 * marker regardless of input, so the secret is never embedded.
 */
export function redactToken(): string {
  return '[REDACTED]';
}

/** Outcome of {@link checkBearerHeaderOnly}. */
export type BearerHeaderValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validates that the access token is presented ONLY in the `Authorization: Bearer`
 * request header and NEVER in the URI query string. (R-23.19-p)
 *
 * Reuses S36's {@link urlContainsAccessTokenInQuery} to reject a request URL that
 * smuggles `access_token` in the query, and requires an `Authorization` header to
 * be present (the token's only permitted location).
 *
 * @param options.requestUrl          - The request URL to inspect for a query-string token.
 * @param options.hasAuthorizationHeader - Whether the request carries an
 *   `Authorization` header.
 */
export function checkBearerHeaderOnly(options: {
  requestUrl: string;
  hasAuthorizationHeader: boolean;
}): BearerHeaderValidation {
  if (urlContainsAccessTokenInQuery(options.requestUrl)) {
    return {
      ok: false,
      reason: 'the access token MUST NOT be placed in the URI query string; send it only in the Authorization: Bearer header (R-23.19-p)',
    };
  }
  if (!options.hasAuthorizationHeader) {
    return {
      ok: false,
      reason: 'the access token MUST be sent in the Authorization: Bearer header on every request to the MCP server (R-23.19-p)',
    };
  }
  return { ok: true };
}

// ─── §23.19 Refresh tokens (R-23.19-q – R-23.19-u) ──────────────────────────────

/**
 * Returns the `grant_types` a client wanting refresh tokens SHOULD register: the
 * given grant types plus `refresh_token` (deduplicated). (R-23.19-r)
 *
 * A client that wants refresh tokens SHOULD include `refresh_token` in its
 * `grant_types` client metadata; this ensures it is present without duplicating it.
 *
 * @param grantTypes - The grant types the client already declares.
 */
export function grantTypesWithRefresh(grantTypes: readonly string[]): string[] {
  const out = [...grantTypes];
  if (!out.includes(GRANT_TYPE_REFRESH_TOKEN)) {
    out.push(GRANT_TYPE_REFRESH_TOKEN);
  }
  return out;
}

/**
 * Adds `offline_access` to a `scope` string when, and only when, the
 * authorization-server metadata advertises it in `scopes_supported`, for a client
 * that wants a refresh token. (R-23.19-s)
 *
 * A client MAY add `offline_access` only when the AS lists it; when it is not
 * advertised the scope is returned unchanged. The result is deduplicated. Mirrors
 * S36's `withOfflineAccessScope` behaviour under the §23.19 refresh atom; provided
 * as a list-shaped helper for the scope-list call sites in this story.
 *
 * @param scopes                  - The current scope list.
 * @param authorizationServerMeta - The selected authorization server's metadata.
 */
export function withOfflineAccessIfAdvertised(
  scopes: readonly string[],
  authorizationServerMeta: Pick<AuthorizationServerMetadata, 'scopes_supported'>,
): string[] {
  const advertised = authorizationServerMeta.scopes_supported?.includes(OFFLINE_ACCESS_SCOPE) ?? false;
  const out = [...scopes];
  if (advertised && !out.includes(OFFLINE_ACCESS_SCOPE)) {
    out.push(OFFLINE_ACCESS_SCOPE);
  }
  return out;
}

/**
 * Returns `true` — a client MUST NOT assume a refresh token will be issued; the
 * authorization server retains discretion. (R-23.19-t)
 *
 * A guard for control flow: treat the refresh token as optional and handle its
 * absence. Pair with S36's `hasNoRefreshToken` to detect a token response that did
 * not issue one.
 */
export function refreshTokenIsNeverAssumed(): boolean {
  return true;
}

/** Outcome of {@link serverScopesOmitOfflineAccess}. */
export type OfflineAccessOmissionValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validates that a server (protected resource) does NOT include `offline_access`
 * in its `WWW-Authenticate` `scope` or in its `scopes_supported`, as a server
 * SHOULD ensure — refresh tokens are not a resource requirement. (R-23.19-u)
 *
 * @param options.challengeScope  - The `WWW-Authenticate` `scope` the server emits, if any.
 * @param options.scopesSupported - The server's protected-resource `scopes_supported`, if any.
 */
export function serverScopesOmitOfflineAccess(options: {
  challengeScope?: string;
  scopesSupported?: readonly string[];
}): OfflineAccessOmissionValidation {
  if (options.challengeScope !== undefined && parseScopeSet(options.challengeScope).includes(OFFLINE_ACCESS_SCOPE)) {
    return {
      ok: false,
      reason: 'a server SHOULD NOT include offline_access in its WWW-Authenticate scope (R-23.19-u)',
    };
  }
  if (options.scopesSupported !== undefined && options.scopesSupported.includes(OFFLINE_ACCESS_SCOPE)) {
    return {
      ok: false,
      reason: 'a server SHOULD NOT include offline_access in its scopes_supported (R-23.19-u)',
    };
  }
  return { ok: true };
}
