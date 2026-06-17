/**
 * S35 — Authorization I: model, applicability & metadata discovery (§23.1–§23.3).
 *
 * The foundation of MCP authorization for HTTP-based transports: the OAuth 2.1
 * security model (the MCP server is an OAuth 2.1 resource server fronted by one
 * or more independent authorization servers), how an unauthorized or
 * under-scoped request is signaled at the HTTP layer (`401` / `403` with a
 * `Bearer` `WWW-Authenticate` challenge), and the two-stage `.well-known`
 * metadata-discovery chain a client walks — first the server's protected-resource
 * metadata, then the selected authorization server's metadata.
 *
 * This module provides:
 *   - applicability predicates — which transports §23 governs (HTTP only; stdio
 *     MUST NOT use it; other transports follow their own best practices)
 *     (R-23.1-a – R-23.1-c);
 *   - per-authorization-server credential isolation, keyed by `issuer`
 *     (R-23.1-i – R-23.1-l);
 *   - canonical-resource-identifier construction/validation (R-23.1-m – R-23.1-s);
 *   - the `401` and `403` `WWW-Authenticate` challenge builders and a parser
 *     (R-23.1-t – R-23.1-ad);
 *   - `ProtectedResourceMetadata` schema + validator and the protected-resource
 *     well-known discovery order (R-23.2-a – R-23.2-j);
 *   - `AuthorizationServerMetadata` schema + validator and the authorization-server
 *     well-known discovery order with issuer-match validation
 *     (R-23.3-a – R-23.3-j).
 *
 * Out of scope (owned elsewhere, per the story):
 *   - the authorization-code-with-PKCE flow, token/audience binding, bearer-header
 *     usage details, and refresh — S36 (§23.4–§23.10);
 *   - client registration, the client-side step-up authorization flow (scope
 *     union, bounded retry, attempt tracking), and consolidated security
 *     considerations — S37 (§23.11–§23.19);
 *   - the Streamable HTTP request/response/header machinery these challenges
 *     ride on — S14/S15 (§9);
 *   - the JSON-RPC error-code registry and the protocol-error-vs-HTTP distinction
 *     — S34 (§22).
 *
 * Mirrors the style of `protocol/discovery.ts` (schemas + validators + builders)
 * and `transport/http/headers.ts` (HTTP-layer constants, case-insensitive header
 * access, `HttpHeaders`). Authorization is an HTTP-transport-only concern.
 */

import { z } from 'zod';
import { type HttpHeaders, getHeader } from '../transport/http/headers.js';

// ─── Applicability and transports (§23.1, R-23.1-a – R-23.1-c) ──────────────────

/**
 * The transport families relevant to authorization applicability.
 *
 * `http` is the Streamable HTTP transport of §9 — the only family §23 governs.
 * `stdio` is the §8 stdio transport, which MUST NOT use this flow. `other`
 * stands for any transport that is neither — it follows its own established
 * security best practices and is outside §23's scope. (R-23.1-a – R-23.1-c)
 */
export type TransportFamily = 'http' | 'stdio' | 'other';

/**
 * Returns `true` when the §23 authorization flow applies to `transport`.
 *
 * Authorization as defined in §23 applies ONLY to HTTP-based transports
 * (R-23.1-a). The stdio transport MUST NOT use it — for stdio, credentials are
 * conveyed out of band through the child-process environment (R-23.1-b). Any
 * other transport MUST follow its own established security best practices and is
 * outside §23 (R-23.1-c).
 *
 * @param transport - The transport family the request rides on.
 */
export function authorizationAppliesTo(transport: TransportFamily): boolean {
  return transport === 'http';
}

/**
 * Returns `true` when `transport` MUST NOT use the §23 authorization flow.
 *
 * Only stdio is explicitly forbidden from using it (R-23.1-b); `other`
 * transports are merely outside §23's scope (R-23.1-c), not forbidden, so this
 * is `true` only for `stdio`.
 *
 * @param transport - The transport family the request rides on.
 */
export function authorizationForbiddenFor(transport: TransportFamily): boolean {
  return transport === 'stdio';
}

/**
 * How a client conveys credentials for a given transport.
 *
 *   - `http` → the OAuth 2.1 bearer-token flow of §23 (`bearer`).
 *   - `stdio` → out-of-band via the child-process `environment` (R-23.1-b).
 *   - `other` → that transport's own `best-practice` mechanism (R-23.1-c).
 */
export type CredentialConveyance = 'bearer' | 'environment' | 'best-practice';

/**
 * Returns how credentials are conveyed for `transport`. (R-23.1-a – R-23.1-c)
 *
 * @param transport - The transport family the request rides on.
 */
export function credentialConveyanceFor(transport: TransportFamily): CredentialConveyance {
  switch (transport) {
    case 'http':
      return 'bearer';
    case 'stdio':
      return 'environment';
    default:
      return 'best-practice';
  }
}

// ─── HTTP status codes for authorization errors (§23.1) ─────────────────────────

/** HTTP `401`: authorization required, or token missing/invalid/expired. (R-23.1-t) */
export const UNAUTHORIZED_STATUS = 401 as const;
/** HTTP `403`: invalid scope or insufficient permissions. (R-23.1-aa) */
export const AUTHORIZATION_FORBIDDEN_STATUS = 403 as const;
/** HTTP `400`: malformed authorization request. (§23.1 status table) */
export const AUTHORIZATION_BAD_REQUEST_STATUS = 400 as const;

/** The HTTP `WWW-Authenticate` response header name. (R-23.1-u) */
export const WWW_AUTHENTICATE_HEADER = 'WWW-Authenticate';
/** The authentication scheme every MCP challenge uses. (R-23.1-u) */
export const BEARER_AUTH_SCHEME = 'Bearer';
/** The `error` code carried by an insufficient-scope `403` challenge. (R-23.1-ab) */
export const INSUFFICIENT_SCOPE_ERROR = 'insufficient_scope';

// ─── Per-authorization-server credential isolation (§23.1, R-23.1-i – R-23.1-l) ──

/**
 * Registration state held for a single authorization server, keyed by its
 * `issuer`. A client MUST store this separately per authorization server
 * (R-23.1-i); credentials registered with one server MUST NOT be assumed valid
 * at another (R-23.1-j). The concrete `client_id`/token fields are filled in by
 * S36/S37 — this story only owns the per-`issuer` isolation contract.
 */
export interface AuthorizationServerRegistration {
  /** The authorization server's `issuer` identifier URL; the isolation key. */
  issuer: string;
  /** OPTIONAL registered client identifier (populated by S36/S37). */
  clientId?: string;
  /** OPTIONAL issued access token (populated by S36). */
  accessToken?: string;
  /** OPTIONAL issued refresh token (populated by S36). */
  refreshToken?: string;
}

/**
 * A per-authorization-server credential store keyed by `issuer`. (R-23.1-i)
 *
 * Enforces the four isolation rules of §23.1:
 *   - registration state is kept separate per `issuer` (R-23.1-i);
 *   - {@link credentialsFor} never returns another server's credentials, so a
 *     caller cannot assume one server's credentials work at another (R-23.1-j);
 *   - {@link needsReregistration} reports `true` when the indicated authorization
 *     server changes, so the client does not reuse the previous server's
 *     credentials (R-23.1-k) and re-registers/re-discovers against the new one
 *     (R-23.1-l).
 */
export class CredentialStore {
  readonly #byIssuer = new Map<string, AuthorizationServerRegistration>();

  /**
   * Records (or replaces) the registration state for `registration.issuer`.
   * Each `issuer` keeps an isolated entry. (R-23.1-i)
   */
  register(registration: AuthorizationServerRegistration): void {
    this.#byIssuer.set(registration.issuer, { ...registration });
  }

  /**
   * Returns the registration state for `issuer`, or `undefined` when none is
   * stored. Never returns another `issuer`'s credentials. (R-23.1-i, R-23.1-j)
   */
  credentialsFor(issuer: string): AuthorizationServerRegistration | undefined {
    const found = this.#byIssuer.get(issuer);
    return found ? { ...found } : undefined;
  }

  /** Returns `true` when registration state exists for `issuer`. */
  hasCredentialsFor(issuer: string): boolean {
    return this.#byIssuer.has(issuer);
  }

  /**
   * Returns `true` when moving from `previousIssuer` to `currentIssuer` requires
   * the client to re-register / re-discover rather than reuse credentials.
   *
   * `true` whenever the indicated authorization server changed (the issuers
   * differ) or no credentials are yet stored for `currentIssuer`. A client MUST
   * NOT reuse a different server's credentials (R-23.1-k) and MUST re-register or
   * re-discover against the new one (R-23.1-l).
   *
   * @param previousIssuer - The previously indicated `issuer`, or `undefined`
   *   when none was indicated before.
   * @param currentIssuer  - The `issuer` now indicated by protected-resource
   *   metadata.
   */
  needsReregistration(previousIssuer: string | undefined, currentIssuer: string): boolean {
    if (previousIssuer !== undefined && previousIssuer !== currentIssuer) {
      return true;
    }
    return !this.hasCredentialsFor(currentIssuer);
  }
}

// ─── Canonical resource identifier (§23.1, R-23.1-m – R-23.1-s) ─────────────────

/** A successfully validated canonical resource identifier. */
export interface CanonicalResourceResult {
  ok: true;
  /** The canonicalized identifier (lowercase scheme + host, no fragment). */
  canonical: string;
}

/** A rejected canonical-resource-identifier candidate. */
export interface CanonicalResourceError {
  ok: false;
  /** Human-readable reason the candidate is not a valid identifier. */
  reason: string;
}

/** Outcome of {@link canonicalizeResourceIdentifier}. */
export type CanonicalResourceValidation = CanonicalResourceResult | CanonicalResourceError;

/**
 * Returns `true` when `host` denotes loopback / local development, for which the
 * `http` scheme is permitted on a canonical resource identifier. (R-23.1-n)
 */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

/**
 * Validates and canonicalizes an MCP server endpoint URL into its canonical
 * resource identifier. (§23.1, R-23.1-m – R-23.1-s)
 *
 * Enforced constraints:
 *   - MUST be an absolute URI (R-23.1-m); a bare host like `mcp.example.com`
 *     (no scheme) is rejected.
 *   - MUST use `https`, or `http` only for a loopback/local host (R-23.1-n).
 *   - MUST NOT contain a fragment component (R-23.1-o).
 *
 * Canonicalization applied for robustness (R-23.1-p): the scheme and host are
 * lowercased. A trailing slash present on the input is preserved — callers
 * SHOULD omit it unless semantically significant (R-23.1-s, see
 * {@link stripDefaultTrailingSlash}); this function does not strip it because it
 * cannot know whether the slash is significant.
 *
 * @param endpointUrl - The MCP server's endpoint URL.
 */
export function canonicalizeResourceIdentifier(endpointUrl: string): CanonicalResourceValidation {
  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    return { ok: false, reason: 'canonical resource identifier MUST be an absolute URI (R-23.1-m)' };
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'https' && scheme !== 'http') {
    return { ok: false, reason: `unsupported scheme "${scheme}"; MUST be https (or http for loopback) (R-23.1-n)` };
  }
  if (scheme === 'http' && !isLoopbackHost(url.hostname)) {
    return {
      ok: false,
      reason: 'the http scheme is permitted only for loopback/local development (R-23.1-n)',
    };
  }

  // `URL` parses the fragment into `hash`; any non-empty hash is a fragment.
  if (url.hash !== '') {
    return { ok: false, reason: 'canonical resource identifier MUST NOT contain a fragment (R-23.1-o)' };
  }

  // Canonical form: lowercase scheme + host. `URL` already lowercases the host.
  url.hash = '';
  // §23.1 (R-23.1-s): SHOULD use the form WITHOUT a trailing slash unless the
  // slash is semantically significant. WHATWG `URL` serialization appends "/" to a
  // host-only URL; the host root "/" is never significant, so emit the bare-origin
  // form (`https://mcp.example.com`, the spec's own example). Emitting the origin
  // form for any host-root input also keeps `https://h` and `https://h/`
  // canonically identical, so `resourceIdentifiersEqual` still matches them.
  const canonical =
    url.pathname === '/' && url.search === '' ? url.origin : url.href.replace(/#$/, '');
  return { ok: true, canonical };
}

/** Returns `true` when `endpointUrl` is a valid canonical resource identifier. (R-23.1-m – R-23.1-o) */
export function isValidCanonicalResourceIdentifier(endpointUrl: string): boolean {
  return canonicalizeResourceIdentifier(endpointUrl).ok;
}

/**
 * Returns `a` and `b` compared as canonical resource identifiers, accepting
 * uppercase scheme/host on either side. (R-23.1-p)
 *
 * The canonical form is lowercase scheme + host, but a receiver SHOULD accept
 * uppercase scheme and host components for robustness; this canonicalizes both
 * sides before comparing so `HTTPS://MCP.EXAMPLE.COM/mcp` matches
 * `https://mcp.example.com/mcp`. Returns `false` when either side is not a valid
 * identifier. Path, query, and port are compared case-sensitively (only scheme
 * and host are case-insensitive).
 *
 * @param a - One resource identifier.
 * @param b - The other resource identifier.
 */
export function resourceIdentifiersEqual(a: string, b: string): boolean {
  const ca = canonicalizeResourceIdentifier(a);
  const cb = canonicalizeResourceIdentifier(b);
  return ca.ok && cb.ok && ca.canonical === cb.canonical;
}

/**
 * Returns `uri` with a single trailing slash removed when the slash is not
 * semantically significant. (R-23.1-s)
 *
 * An implementation SHOULD use the trailing-slash-free form unless the slash is
 * significant for the resource; the caller asserts significance via
 * `slashIsSignificant`. A path of just `"/"` (the bare-host root) is left
 * untouched — removing it would change the host's root into a schemeless string.
 *
 * @param uri                - The candidate URI.
 * @param slashIsSignificant - When `true`, the trailing slash is preserved.
 */
/**
 * Removes a run of trailing `/` characters in linear time — used instead of a
 * `/\/+$/` regex, which backtracks polynomially on inputs like `"////…x"`
 * (CodeQL js/polynomial-redos).
 */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f /* '/' */) end--;
  return value.slice(0, end);
}

export function stripDefaultTrailingSlash(uri: string, slashIsSignificant = false): string {
  if (slashIsSignificant) return uri;
  try {
    const url = new URL(uri);
    // Only strip a path-level trailing slash; leave the bare-host root ("/") intact.
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = stripTrailingSlashes(url.pathname);
      return url.href.replace(/#$/, '');
    }
    return uri;
  } catch {
    // Non-URL input: fall back to a conservative string strip that never empties.
    return uri.length > 1 && uri.endsWith('/') ? stripTrailingSlashes(uri) : uri;
  }
}

// ─── WWW-Authenticate challenge (§23.1, R-23.1-t – R-23.1-ad) ───────────────────

/**
 * The structured fields of a `Bearer` `WWW-Authenticate` challenge.
 *
 * Not a JSON object — the parameter set carried in the HTTP response header. On
 * a `401` (§7.4) `resourceMetadata` is REQUIRED and `scope` SHOULD be present;
 * on a `403` insufficient-scope challenge (§7.5) `error` is `"insufficient_scope"`
 * and `scope`, `resourceMetadata`, and an OPTIONAL `errorDescription` accompany
 * it. (R-23.1-v, R-23.1-w, R-23.1-ab, R-23.1-ad)
 */
export interface WwwAuthenticateChallenge {
  /** The authentication scheme; always `Bearer` for MCP. (R-23.1-u) */
  scheme: typeof BEARER_AUTH_SCHEME;
  /** Absolute URI of the protected-resource metadata document. (R-23.1-v) */
  resourceMetadata?: string;
  /** Space-delimited scopes required for the operation. (R-23.1-w, R-23.1-ab) */
  scope?: string;
  /** The failure code; `"insufficient_scope"` on a `403`. (R-23.1-ab) */
  error?: string;
  /** OPTIONAL human-readable description of the failure. (R-23.1-ad) */
  errorDescription?: string;
}

/** A built `401` Unauthorized challenge response (status + header value). */
export interface UnauthorizedChallenge {
  /** HTTP status `401`. (R-23.1-t) */
  status: typeof UNAUTHORIZED_STATUS;
  /** The `WWW-Authenticate` header name + value pair. (R-23.1-u) */
  headers: { [WWW_AUTHENTICATE_HEADER]: string };
}

/** A built `403` insufficient-scope challenge response (status + header value). */
export interface InsufficientScopeChallenge {
  /** HTTP status `403`. (R-23.1-aa) */
  status: typeof AUTHORIZATION_FORBIDDEN_STATUS;
  /** The `WWW-Authenticate` header name + value pair. (R-23.1-aa) */
  headers: { [WWW_AUTHENTICATE_HEADER]: string };
}

/** Serializes one challenge parameter as `key="value"`, quoting the value per RFC 7235. */
function quotedParam(key: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${key}="${escaped}"`;
}

/**
 * Builds the `WWW-Authenticate` header value for a `Bearer` challenge from its
 * structured fields. (R-23.1-u – R-23.1-w, R-23.1-ab – R-23.1-ad)
 *
 * Parameters are emitted in a stable order — `error`, `scope`,
 * `resource_metadata`, `error_description` — each only when present. The scheme
 * (`Bearer`) always leads.
 *
 * @param challenge - The structured challenge fields.
 */
export function buildWwwAuthenticateValue(
  challenge: Omit<WwwAuthenticateChallenge, 'scheme'> & { scheme?: typeof BEARER_AUTH_SCHEME },
): string {
  const params: string[] = [];
  if (challenge.error !== undefined) params.push(quotedParam('error', challenge.error));
  if (challenge.scope !== undefined) params.push(quotedParam('scope', challenge.scope));
  if (challenge.resourceMetadata !== undefined) {
    params.push(quotedParam('resource_metadata', challenge.resourceMetadata));
  }
  if (challenge.errorDescription !== undefined) {
    params.push(quotedParam('error_description', challenge.errorDescription));
  }
  return params.length > 0 ? `${BEARER_AUTH_SCHEME} ${params.join(', ')}` : BEARER_AUTH_SCHEME;
}

/** Inputs to {@link buildUnauthorizedResponse}. */
export interface UnauthorizedResponseOptions {
  /** REQUIRED absolute URI of the protected-resource metadata document. (R-23.1-v) */
  resourceMetadata: string;
  /** SHOULD-present scopes required to access the resource. (R-23.1-w) */
  scope?: string;
}

/**
 * Builds an MCP server's `401 Unauthorized` response with a `Bearer`
 * `WWW-Authenticate` header. (R-23.1-t, R-23.1-u, R-23.1-v, R-23.1-w)
 *
 * The header always carries the REQUIRED `resource_metadata` parameter
 * (R-23.1-v) and SHOULD carry `scope` when the server can determine the required
 * scopes (R-23.1-w). This `401` is an HTTP-layer response distinct from §22's
 * JSON-RPC error codes and carries no JSON-RPC error body.
 *
 * @param options - The required metadata URI and OPTIONAL required scopes.
 * @throws {RangeError} When `resourceMetadata` is empty — it is REQUIRED.
 */
export function buildUnauthorizedResponse(options: UnauthorizedResponseOptions): UnauthorizedChallenge {
  if (!options.resourceMetadata) {
    throw new RangeError('401 WWW-Authenticate MUST include resource_metadata (R-23.1-v)');
  }
  const value = buildWwwAuthenticateValue({
    scheme: BEARER_AUTH_SCHEME,
    resourceMetadata: options.resourceMetadata,
    scope: options.scope,
  });
  return { status: UNAUTHORIZED_STATUS, headers: { [WWW_AUTHENTICATE_HEADER]: value } };
}

/** Inputs to {@link buildInsufficientScopeResponse}. */
export interface InsufficientScopeResponseOptions {
  /**
   * Space-delimited required scopes. SHOULD include ALL scopes required for the
   * current operation in this single challenge rather than challenging
   * incrementally. (R-23.1-ab, R-23.1-ac)
   */
  scope: string;
  /** Absolute URI of the protected-resource metadata document. (R-23.1-ab) */
  resourceMetadata: string;
  /** OPTIONAL human-readable description of the failure. (R-23.1-ad) */
  errorDescription?: string;
}

/**
 * Builds an MCP server's `403 Forbidden` insufficient-scope response with a
 * `Bearer` `WWW-Authenticate` header. (R-23.1-aa – R-23.1-ad)
 *
 * The header carries `error="insufficient_scope"`, the `scope` parameter, and a
 * `resource_metadata` parameter (R-23.1-ab); the caller SHOULD pass the union of
 * all scopes the operation needs so this is a single, complete challenge rather
 * than an incremental one (R-23.1-ac). `error_description` is emitted only when
 * supplied (R-23.1-ad).
 *
 * @param options - The required scopes, metadata URI, and OPTIONAL description.
 * @throws {RangeError} When `scope` or `resourceMetadata` is empty.
 */
export function buildInsufficientScopeResponse(
  options: InsufficientScopeResponseOptions,
): InsufficientScopeChallenge {
  if (!options.scope) {
    throw new RangeError('403 insufficient_scope WWW-Authenticate MUST include scope (R-23.1-ab)');
  }
  if (!options.resourceMetadata) {
    throw new RangeError('403 insufficient_scope WWW-Authenticate MUST include resource_metadata (R-23.1-ab)');
  }
  const value = buildWwwAuthenticateValue({
    scheme: BEARER_AUTH_SCHEME,
    error: INSUFFICIENT_SCOPE_ERROR,
    scope: options.scope,
    resourceMetadata: options.resourceMetadata,
    errorDescription: options.errorDescription,
  });
  return { status: AUTHORIZATION_FORBIDDEN_STATUS, headers: { [WWW_AUTHENTICATE_HEADER]: value } };
}

/**
 * Parses a `WWW-Authenticate` header value carrying a `Bearer` challenge into
 * its structured fields. (R-23.1-z)
 *
 * A client MUST be able to parse `WWW-Authenticate` headers and react to a `401`
 * (R-23.1-z); this is that parser. It accepts the auth-param forms RFC 7235
 * permits — quoted (`key="value"`) and bare (`key=value`) — comma-separated,
 * with arbitrary surrounding whitespace, and unescapes `\"`/`\\` inside quoted
 * values. The scheme match is case-insensitive. Returns `undefined` when the
 * value does not use the `Bearer` scheme.
 *
 * @param headerValue - The raw `WWW-Authenticate` header value.
 */
export function parseWwwAuthenticate(headerValue: string): WwwAuthenticateChallenge | undefined {
  const trimmed = headerValue.trim();
  const schemeMatch = /^(\S+)\s*(.*)$/s.exec(trimmed);
  if (!schemeMatch || schemeMatch[1]!.toLowerCase() !== BEARER_AUTH_SCHEME.toLowerCase()) {
    return undefined;
  }

  const params: Record<string, string> = {};
  const paramsPart = schemeMatch[2] ?? '';
  // Matches `key=value` where value is a quoted string or a bare token. Every repeat
  // is length-bounded so a long unmatched run can't drive polynomial backtracking
  // (CodeQL js/polynomial-redos); the bounds sit far above any real challenge param.
  const paramRe =
    /([A-Za-z0-9._-]{1,128})\s{0,64}=\s{0,64}(?:"((?:[^"\\]|\\.){0,4096})"|([^\s,]{1,4096}))/g;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(paramsPart)) !== null) {
    const key = m[1]!.toLowerCase();
    const raw = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : (m[3] ?? '');
    params[key] = raw;
  }

  const challenge: WwwAuthenticateChallenge = { scheme: BEARER_AUTH_SCHEME };
  if (params['resource_metadata'] !== undefined) challenge.resourceMetadata = params['resource_metadata'];
  if (params['scope'] !== undefined) challenge.scope = params['scope'];
  if (params['error'] !== undefined) challenge.error = params['error'];
  if (params['error_description'] !== undefined) challenge.errorDescription = params['error_description'];
  return challenge;
}

/**
 * Extracts the parsed `Bearer` challenge from a bag of HTTP response headers, or
 * `undefined` when there is no parseable `WWW-Authenticate` `Bearer` challenge.
 * Header lookup is case-insensitive (reuses `getHeader`). (R-23.1-z)
 *
 * @param headers - The HTTP response headers.
 */
export function challengeFromHeaders(headers: HttpHeaders): WwwAuthenticateChallenge | undefined {
  const value = getHeader(headers, WWW_AUTHENTICATE_HEADER);
  return value === undefined ? undefined : parseWwwAuthenticate(value);
}

/**
 * Resolves the scopes a client MUST treat as required for the request from a
 * challenge. (R-23.1-x, R-23.1-y)
 *
 * The challenged scope set is authoritative: a client MUST treat it as the
 * scopes required to satisfy the request (R-23.1-x) and MUST NOT assume any
 * subset/superset relationship between it and `scopes_supported` from
 * protected-resource metadata (R-23.1-y). This therefore derives the required
 * scopes solely from the challenge's `scope` parameter, never from
 * `scopes_supported`. Returns `[]` when the challenge carried no `scope`.
 *
 * @param challenge - A parsed `WWW-Authenticate` challenge.
 */
export function challengedScopes(challenge: WwwAuthenticateChallenge): string[] {
  if (challenge.scope === undefined) return [];
  return challenge.scope.split(/\s+/).filter((s) => s.length > 0);
}

/** Returns `true` when `challenge` is an insufficient-scope (`403`) challenge. (R-23.1-ab) */
export function isInsufficientScopeChallenge(challenge: WwwAuthenticateChallenge): boolean {
  return challenge.error === INSUFFICIENT_SCOPE_ERROR;
}

// ─── Protected Resource Metadata (§23.2, R-23.2-a – R-23.2-j) ───────────────────

/**
 * The OAuth 2.0 Protected Resource Metadata document the MCP server publishes.
 * (§23.2, R-23.2-h, R-23.2-i)
 *
 * `resource` is REQUIRED and MUST equal the server's canonical resource
 * identifier (R-23.2-h). `authorization_servers` is REQUIRED for MCP, MUST be
 * present, and MUST contain at least one entry (R-23.2-i); `.min(1)` enforces
 * non-emptiness. `scopes_supported` and `bearer_methods_supported` are OPTIONAL.
 * `.passthrough()` preserves any additional RFC 9728 fields.
 */
export const ProtectedResourceMetadataSchema = z
  .object({
    /** REQUIRED canonical resource identifier; MUST equal the server's. (R-23.2-h) */
    resource: z.string().min(1),
    /** REQUIRED non-empty list of trusted authorization-server issuer URLs. (R-23.2-i) */
    authorization_servers: z.array(z.string()).min(1),
    /** OPTIONAL scopes the resource recognizes. */
    scopes_supported: z.array(z.string()).optional(),
    /** OPTIONAL token-presentation methods; for MCP, the bearer header method. */
    bearer_methods_supported: z.array(z.string()).optional(),
  })
  .passthrough();

export type ProtectedResourceMetadata = z.infer<typeof ProtectedResourceMetadataSchema>;

/** Returns `true` when `value` is a structurally valid `ProtectedResourceMetadata`. (R-23.2-h, R-23.2-i) */
export function isProtectedResourceMetadata(value: unknown): value is ProtectedResourceMetadata {
  return ProtectedResourceMetadataSchema.safeParse(value).success;
}

/** Outcome of {@link validateProtectedResourceMetadata}. */
export type ProtectedResourceMetadataValidation =
  | { ok: true; metadata: ProtectedResourceMetadata }
  | { ok: false; reason: string };

/**
 * Validates a fetched protected-resource metadata document against the MCP
 * server it is contacting. (§23.2, R-23.2-h, R-23.2-i, R-23.2-j)
 *
 * Checks:
 *   - the document is structurally valid (`resource` present, non-empty
 *     `authorization_servers`) (R-23.2-h, R-23.2-i);
 *   - `resource` equals the server's canonical resource identifier, accepting an
 *     uppercase scheme/host on either side (R-23.2-h via R-23.1-p, R-23.2-j).
 *
 * On success the client then selects an authorization server from
 * `authorization_servers` (see {@link selectAuthorizationServer}).
 *
 * @param value                       - The raw fetched document.
 * @param expectedCanonicalResource   - The canonical resource identifier of the
 *   MCP server the client is contacting.
 */
export function validateProtectedResourceMetadata(
  value: unknown,
  expectedCanonicalResource: string,
): ProtectedResourceMetadataValidation {
  const parsed = ProtectedResourceMetadataSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, reason: `invalid ProtectedResourceMetadata: ${parsed.error.message}` };
  }
  if (!resourceIdentifiersEqual(parsed.data.resource, expectedCanonicalResource)) {
    return {
      ok: false,
      reason: `resource "${parsed.data.resource}" does not match the MCP server's canonical resource identifier "${expectedCanonicalResource}" (R-23.2-h, R-23.2-j)`,
    };
  }
  return { ok: true, metadata: parsed.data };
}

/**
 * Selects one authorization-server `issuer` from a protected-resource metadata
 * document. (R-23.2-j)
 *
 * Each listed authorization server is independent and selecting which to use is
 * the client's responsibility. By default this picks the first listed issuer; a
 * `prefer` callback lets a caller impose its own selection policy (the first
 * issuer for which `prefer` returns `true` wins, falling back to the first
 * listed issuer when none matches). Returns `undefined` only for an empty list
 * (which a valid document never has — R-23.2-i).
 *
 * @param metadata - A validated protected-resource metadata document.
 * @param prefer   - OPTIONAL predicate selecting a preferred issuer.
 */
export function selectAuthorizationServer(
  metadata: Pick<ProtectedResourceMetadata, 'authorization_servers'>,
  prefer?: (issuer: string) => boolean,
): string | undefined {
  const servers = metadata.authorization_servers;
  if (servers.length === 0) return undefined;
  if (prefer) {
    const chosen = servers.find(prefer);
    if (chosen !== undefined) return chosen;
  }
  return servers[0];
}

// ─── Protected-resource well-known discovery (§23.2, R-23.2-c – R-23.2-g) ───────

/** The protected-resource metadata well-known path suffix. (§23.2) */
export const PROTECTED_RESOURCE_WELL_KNOWN = '/.well-known/oauth-protected-resource';

/**
 * Builds the ordered list of protected-resource-metadata well-known URIs to try
 * for an MCP server endpoint, when no `resource_metadata` header URI is
 * available. (R-23.2-e, R-23.2-f)
 *
 * The order MUST be:
 *   1. path-aware insertion — `https://<host>/.well-known/oauth-protected-resource/<path>`;
 *   2. root — `https://<host>/.well-known/oauth-protected-resource`.
 * When the endpoint has no path beyond `/`, the path-aware form coincides with
 * the root form and only the root URI is returned (no duplicate).
 *
 * @param endpointUrl - The MCP server's endpoint URL.
 * @throws {TypeError} When `endpointUrl` is not an absolute URI.
 */
export function protectedResourceWellKnownUris(endpointUrl: string): string[] {
  const url = new URL(endpointUrl);
  const origin = url.origin;
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  const root = `${origin}${PROTECTED_RESOURCE_WELL_KNOWN}`;
  if (path === '') {
    return [root];
  }
  return [`${origin}${PROTECTED_RESOURCE_WELL_KNOWN}/${path}`, root];
}

/**
 * Resolves where to fetch protected-resource metadata from, honoring discovery
 * precedence. (R-23.2-c, R-23.2-d, R-23.2-e, R-23.2-g)
 *
 *   - When the `401`'s `WWW-Authenticate` header carried `resource_metadata`, the
 *     client MUST use that URI — it is returned as the single entry (R-23.2-d).
 *   - Otherwise the ordered well-known URIs are returned for the client to try in
 *     order, using the first that yields a valid document (R-23.2-e, R-23.2-f).
 *   - When no header URI is available and `endpointUrl` is absent/unusable, the
 *     result is empty — the caller MUST then abort or fall back to pre-configured
 *     values (R-23.2-g).
 *
 * @param options.headerResourceMetadata - The `resource_metadata` URI from a
 *   `WWW-Authenticate` header, if any (R-23.2-d).
 * @param options.endpointUrl            - The MCP server endpoint, used to build
 *   the well-known URIs when no header URI is present.
 */
export function resolveProtectedResourceMetadataUris(options: {
  headerResourceMetadata?: string;
  endpointUrl?: string;
}): string[] {
  if (options.headerResourceMetadata) {
    return [options.headerResourceMetadata];
  }
  if (!options.endpointUrl) {
    return [];
  }
  try {
    return protectedResourceWellKnownUris(options.endpointUrl);
  } catch {
    return [];
  }
}

// ─── Authorization Server Metadata (§23.3, R-23.3-a – R-23.3-j) ─────────────────

/**
 * The metadata document an authorization server publishes. (§23.3, R-23.3-f – R-23.3-j)
 *
 * `issuer`, `authorization_endpoint`, and `token_endpoint` are REQUIRED
 * (R-23.3-f, R-23.3-g, R-23.3-h). When present, `response_types_supported` MUST
 * include `"code"` (R-23.3-i) and `code_challenge_methods_supported` (OPTIONAL
 * but RECOMMENDED) MUST include `"S256"` (R-23.3-j) — both enforced by the
 * `superRefine` below so the inferred type stays plain arrays. The issuer-match
 * check (R-23.3-d, R-23.3-e) is applied at validation time, not in the schema,
 * because it depends on the URL the document was fetched with.
 * `.passthrough()` preserves additional RFC 8414 / OIDC fields.
 */
export const AuthorizationServerMetadataSchema = z
  .object({
    /** REQUIRED issuer identifier URL; MUST match the construction value. (R-23.3-f) */
    issuer: z.string().min(1),
    /** REQUIRED authorization endpoint URL. (R-23.3-g) */
    authorization_endpoint: z.string().min(1),
    /** REQUIRED token endpoint URL. (R-23.3-h) */
    token_endpoint: z.string().min(1),
    /** OPTIONAL Dynamic Client Registration endpoint URL. */
    registration_endpoint: z.string().optional(),
    /** OPTIONAL scopes the authorization server recognizes. */
    scopes_supported: z.array(z.string()).optional(),
    /** OPTIONAL response_type values; if present MUST include "code". (R-23.3-i) */
    response_types_supported: z.array(z.string()).optional(),
    /** OPTIONAL grant_type values supported. */
    grant_types_supported: z.array(z.string()).optional(),
    /** OPTIONAL but RECOMMENDED PKCE methods; if present MUST include "S256". (R-23.3-j) */
    code_challenge_methods_supported: z.array(z.string()).optional(),
    /** OPTIONAL token-endpoint client-authentication methods. */
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
    /** OPTIONAL `true` when the AS sets the `iss` parameter in responses. */
    authorization_response_iss_parameter_supported: z.boolean().optional(),
    /** OPTIONAL `true` when the AS accepts Client ID Metadata Documents. */
    client_id_metadata_document_supported: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if (val.response_types_supported !== undefined && !val.response_types_supported.includes('code')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['response_types_supported'],
        message: 'response_types_supported, when present, MUST include "code" (R-23.3-i)',
      });
    }
    if (
      val.code_challenge_methods_supported !== undefined &&
      !val.code_challenge_methods_supported.includes('S256')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['code_challenge_methods_supported'],
        message: 'code_challenge_methods_supported, when present, MUST include "S256" (R-23.3-j)',
      });
    }
  });

export type AuthorizationServerMetadata = z.infer<typeof AuthorizationServerMetadataSchema>;

/** Returns `true` when `value` is a structurally valid `AuthorizationServerMetadata`. (R-23.3-f – R-23.3-j) */
export function isAuthorizationServerMetadata(value: unknown): value is AuthorizationServerMetadata {
  return AuthorizationServerMetadataSchema.safeParse(value).success;
}

/** Outcome of {@link validateAuthorizationServerMetadata}. */
export type AuthorizationServerMetadataValidation =
  | { ok: true; metadata: AuthorizationServerMetadata }
  | { ok: false; reason: string };

/**
 * Validates a fetched authorization-server metadata document, including the
 * mandatory issuer-match check. (§23.3, R-23.3-d, R-23.3-e, R-23.3-f – R-23.3-j)
 *
 * After confirming the document is structurally valid (REQUIRED fields present;
 * `response_types_supported`/`code_challenge_methods_supported` constraints), it
 * verifies that the document's `issuer` is identical to the issuer identifier
 * used to construct the discovery URL (R-23.3-d). If they differ, the document
 * MUST NOT be used (R-23.3-e) and this returns an error. The comparison is exact
 * string identity, as the spec's attacker example requires.
 *
 * @param value             - The raw fetched document.
 * @param expectedIssuer    - The issuer identifier used to construct the
 *   discovery URL (R-23.3-d).
 */
export function validateAuthorizationServerMetadata(
  value: unknown,
  expectedIssuer: string,
): AuthorizationServerMetadataValidation {
  const parsed = AuthorizationServerMetadataSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, reason: `invalid AuthorizationServerMetadata: ${parsed.error.message}` };
  }
  if (parsed.data.issuer !== expectedIssuer) {
    return {
      ok: false,
      reason: `issuer "${parsed.data.issuer}" does not match the issuer used to construct the discovery URL "${expectedIssuer}"; MUST NOT use the document (R-23.3-d, R-23.3-e)`,
    };
  }
  return { ok: true, metadata: parsed.data };
}

// ─── Authorization-server well-known discovery (§23.3, R-23.3-b, R-23.3-c) ──────

/** OAuth 2.0 Authorization Server Metadata well-known suffix. (§23.3) */
export const OAUTH_AS_WELL_KNOWN = '/.well-known/oauth-authorization-server';
/** OpenID Connect Discovery well-known suffix. (§23.3) */
export const OPENID_CONFIGURATION_WELL_KNOWN = '/.well-known/openid-configuration';

/**
 * Builds the ordered list of authorization-server metadata well-known URIs to
 * try for an `issuer`, in the exact specified priority order. (R-23.3-b, R-23.3-c)
 *
 * For an issuer **with a path** (e.g. `https://auth.example.com/tenant1`):
 *   1. OAuth AS Metadata, path insertion — `…/.well-known/oauth-authorization-server/tenant1`;
 *   2. OIDC Discovery, path insertion — `…/.well-known/openid-configuration/tenant1`;
 *   3. OIDC Discovery, path appending — `…/tenant1/.well-known/openid-configuration`.
 *
 * For an issuer **without a path** (e.g. `https://auth.example.com`):
 *   1. `…/.well-known/oauth-authorization-server`;
 *   2. `…/.well-known/openid-configuration`.
 *
 * Both discovery mechanisms (OAuth AS Metadata and OIDC Discovery) are covered,
 * so a client building from this list supports both (R-23.3-b). The client uses
 * the first that returns a valid, issuer-matching document.
 *
 * @param issuer - The authorization server's issuer identifier URL.
 * @throws {TypeError} When `issuer` is not an absolute URI.
 */
export function authorizationServerWellKnownUris(issuer: string): string[] {
  const url = new URL(issuer);
  const origin = url.origin;
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  if (path === '') {
    return [`${origin}${OAUTH_AS_WELL_KNOWN}`, `${origin}${OPENID_CONFIGURATION_WELL_KNOWN}`];
  }
  return [
    `${origin}${OAUTH_AS_WELL_KNOWN}/${path}`,
    `${origin}${OPENID_CONFIGURATION_WELL_KNOWN}/${path}`,
    `${origin}/${path}${OPENID_CONFIGURATION_WELL_KNOWN}`,
  ];
}
