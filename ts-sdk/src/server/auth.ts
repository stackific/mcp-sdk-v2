/**
 * S5 — server-side authorization glue (§23). Turns a token-validation callback into
 * an {@link AuthGate} for {@link createMcpRequestHandler}, emitting the 401 +
 * `WWW-Authenticate` challenge (with `resource_metadata`) the spec requires, and
 * builds the protected-resource metadata document. Edge-safe (no `node:*`).
 */
import type { AuthGate } from './streamable-http.js';
import { buildInsufficientScopeResponse, stripTrailingSlashes } from '../protocol/authorization.js';

/**
 * Returns `true` when a token's audience covers `resource` (§23.6). Inlined (rather
 * than importing the protocol-layer validator) to keep this server module edge-safe
 * — the authorization-flow module pulls `node:crypto`. Only a trailing-slash
 * difference is tolerated; the comparison is otherwise exact (R-23.6-g).
 */
function audienceCovers(tokenAudience: string | string[], resource: string): boolean {
  const norm = (u: string): string => stripTrailingSlashes(u);
  const target = norm(resource);
  return (Array.isArray(tokenAudience) ? tokenAudience : [tokenAudience]).some((a) => norm(a) === target);
}

/** Inputs to {@link buildProtectedResourceMetadata}. */
export interface ProtectedResourceMetadataInit {
  /** The canonical resource identifier (the MCP endpoint URL). */
  resource: string;
  /** The authorization server issuer URLs that protect this resource. */
  authorizationServers: string[];
  /** OPTIONAL scopes the resource recognizes. */
  scopes?: string[];
  /** OPTIONAL supported bearer-token delivery methods (default `['header']`). */
  bearerMethods?: string[];
}

/** Builds an RFC 9728 protected-resource metadata document. (§23.2) */
export function buildProtectedResourceMetadata(init: ProtectedResourceMetadataInit): Record<string, unknown> {
  return {
    resource: init.resource,
    authorization_servers: init.authorizationServers,
    bearer_methods_supported: init.bearerMethods ?? ['header'],
    ...(init.scopes ? { scopes_supported: init.scopes } : {}),
  };
}

/** Options for {@link bearerAuthGate}. */
export interface BearerAuthGateOptions {
  /**
   * Validates a bearer token, returning the caller's identity (threaded into
   * `ctx.authInfo`) or `null`/`undefined`/`false` to reject. When audience/scope
   * enforcement is enabled, return an object exposing the token's `aud`/`audience`
   * and `scope`(space-delimited string)/`scopes`(array) so they can be checked.
   */
  validate: (token: string) => unknown | Promise<unknown>;
  /** URL of the protected-resource metadata, advertised via `resource_metadata` in the challenge. */
  resourceMetadataUrl?: string;
  /**
   * This resource's canonical identifier. When set, the validated token's audience
   * MUST include it, or the request is rejected `401 invalid_token` — a server MUST
   * reject a token not issued for it and never forward it. (§23.6/§23.8/§23.19)
   */
  expectedAudience?: string;
  /**
   * Scopes this resource requires. When the token is missing any, the request is
   * rejected with a `403 insufficient_scope` step-up challenge. (§23.18)
   * Requires `resourceMetadataUrl` (the 403 challenge MUST carry `resource_metadata`).
   */
  requiredScopes?: string[];
}

/** Reads the token audience (`aud` or `audience`) from a validated authInfo object. */
function audienceOf(authInfo: unknown): string | string[] | undefined {
  if (authInfo === null || typeof authInfo !== 'object') return undefined;
  const o = authInfo as Record<string, unknown>;
  const aud = o['aud'] ?? o['audience'];
  return typeof aud === 'string' || Array.isArray(aud) ? (aud as string | string[]) : undefined;
}

/** Reads the granted scopes (`scopes` array or space-delimited `scope`) from authInfo. */
function scopesOf(authInfo: unknown): string[] {
  if (authInfo === null || typeof authInfo !== 'object') return [];
  const o = authInfo as Record<string, unknown>;
  if (Array.isArray(o['scopes'])) return (o['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string');
  if (typeof o['scope'] === 'string') return o['scope'].split(/\s+/).filter(Boolean);
  return [];
}

/**
 * Builds an {@link AuthGate} that requires a valid `Bearer` token. On a missing /
 * invalid / wrong-audience token it returns `401` with a `WWW-Authenticate: Bearer …`
 * challenge (carrying `resource_metadata` when provided); on a missing required scope
 * it returns the `403 insufficient_scope` step-up challenge. (§23.1, §23.6, §23.18)
 */
export function bearerAuthGate(options: BearerAuthGateOptions): AuthGate {
  const challenge401 = (description: string) => {
    const parts = [
      options.resourceMetadataUrl ? `resource_metadata="${options.resourceMetadataUrl}"` : '',
      'error="invalid_token"',
      `error_description="${description}"`,
    ].filter(Boolean);
    return {
      ok: false as const,
      status: 401,
      wwwAuthenticate: `Bearer ${parts.join(', ')}`,
      body: { error: 'invalid_token', error_description: description },
    };
  };

  return async (request) => {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const authInfo = token ? await options.validate(token) : null;
    if (!authInfo) {
      return challenge401('Missing or invalid access token');
    }

    // Audience binding (§23.6/§23.8/§23.19): reject a token not issued for this resource.
    if (options.expectedAudience) {
      const aud = audienceOf(authInfo);
      if (aud === undefined || !audienceCovers(aud, options.expectedAudience)) {
        return challenge401('Access token was not issued for this resource');
      }
    }

    // Step-up (§23.18): a missing required scope yields a 403 insufficient_scope challenge.
    if (options.requiredScopes && options.requiredScopes.length > 0) {
      const granted = scopesOf(authInfo);
      const missing = options.requiredScopes.filter((s) => !granted.includes(s));
      if (missing.length > 0) {
        const stepUp = buildInsufficientScopeResponse({
          scope: options.requiredScopes.join(' '),
          resourceMetadata: options.resourceMetadataUrl ?? '',
          errorDescription: `Missing required scope(s): ${missing.join(' ')}`,
        });
        return {
          ok: false,
          status: stepUp.status,
          wwwAuthenticate: stepUp.headers['WWW-Authenticate'],
          body: { error: 'insufficient_scope', error_description: `Missing scope(s): ${missing.join(' ')}` },
        };
      }
    }

    return { ok: true, authInfo };
  };
}
