/**
 * OAuth 2.1 Authorization Server + a protected MCP resource, as a Hono app.
 *
 * Two roles on one port:
 *   - Authorization Server (issuer): metadata, dynamic client registration, token.
 *   - Protected Resource: a real MCP server (served via the SDK's Hono adapter)
 *     that rejects unauthenticated requests with 401 + WWW-Authenticate, and on a
 *     valid Bearer token threads the identity into the tool `ctx.authInfo`.
 *
 * The protected MCP server is built on `@stackific/mcp-sdk-ts/server`; this file
 * declares no protocol abstractions, only the OAuth endpoints + feature wiring.
 */
import { Hono } from 'hono';

import {
  McpServer,
  toHonoMcpHandler,
  bearerAuthGate,
  buildProtectedResourceMetadata,
} from '@stackific/mcp-sdk-ts/server';

// ── Web-Crypto helpers (edge-safe; no node:crypto) ──
const textEncoder = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** Random base64url string from `n` random bytes (for opaque tokens/codes). */
function randomBase64Url(n: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(n)));
}
/** Random lowercase-hex string from `n` random bytes (for client secrets). */
function randomHex(n: number): string {
  return [...crypto.getRandomValues(new Uint8Array(n))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
/** SHA-256 of `s`, base64url-encoded (PKCE S256 challenge derivation). */
async function sha256Base64Url(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(s));
  return base64url(new Uint8Array(digest));
}

interface RegisteredClient {
  clientId: string;
  clientSecret: string;
  name?: string;
  grantTypes: string[];
}
interface IssuedToken {
  token: string;
  clientId: string;
  scope: string;
  audience: string;
  expiresAt: number;
}

export function createAuthApp(opts: { issuer: string; resource: string }) {
  const { issuer, resource } = opts;
  const clients = new Map<string, RegisteredClient>();
  const tokens = new Map<string, IssuedToken>();
  const authCodes = new Map<
    string,
    { clientId: string; redirectUri: string; codeChallenge: string; codeChallengeMethod: string }
  >();
  const SCOPE = 'mcp:tools';
  const prmUrl = `${issuer}/.well-known/oauth-protected-resource`;

  // A seeded confidential client so a demo can skip DCR if it wants to.
  clients.set('companion-demo-client', {
    clientId: 'companion-demo-client',
    clientSecret: 'companion-demo-secret',
    name: 'Companion Demo Client',
    grantTypes: ['client_credentials', 'authorization_code'],
  });

  // ── Protected MCP server (identity-aware tools), built on the SDK runtime ──
  const protectedMcp = new McpServer(
    { name: 'protected-mcp-server', title: 'Protected MCP Server', version: '0.1.0' },
    { tools: {} },
  );
  protectedMcp.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Returns the validated OAuth identity the server sees (ctx.authInfo).',
    },
    async (_args, ctx) => {
      const info = ctx.authInfo as
        | { clientId?: string; scopes?: string[]; expiresAt?: number }
        | undefined;
      return {
        content: [
          {
            type: 'text',
            text: `Authenticated as ${info?.clientId ?? 'unknown'} with scopes [${(info?.scopes ?? []).join(', ')}].`,
          },
        ],
        structuredContent: {
          clientId: info?.clientId,
          scopes: info?.scopes,
          expiresAt: info?.expiresAt,
        },
      };
    },
  );
  protectedMcp.registerTool(
    'get_secret',
    {
      title: 'Get Secret',
      description: 'Returns protected data that only an authorized caller may read.',
    },
    async () => ({
      content: [{ type: 'text', text: '🔐 The launch codes are 0000 (do not tell anyone).' }],
    }),
  );

  // The bearer gate (SDK bearerAuthGate): emits the 401 challenge for the
  // unauthenticated probe, binds the token's audience to this resource (§23.6),
  // and threads the validated identity into ctx.authInfo.
  const authGate = bearerAuthGate({
    resourceMetadataUrl: prmUrl,
    expectedAudience: resource,
    validate: (token) => {
      const tok = tokens.get(token);
      if (!tok || tok.expiresAt < Date.now()) return null;
      return {
        token: tok.token,
        clientId: tok.clientId,
        scopes: tok.scope.split(' '),
        aud: tok.audience,
        expiresAt: Math.floor(tok.expiresAt / 1000),
      };
    },
  });

  const issue = (clientId: string): IssuedToken => {
    const token = randomBase64Url(32);
    const t: IssuedToken = {
      token,
      clientId,
      scope: SCOPE,
      audience: resource,
      expiresAt: Date.now() + 3600_000,
    };
    tokens.set(token, t);
    return t;
  };

  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', role: 'auth+protected-resource' }));

  // Authorization Server metadata (RFC 8414).
  app.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      scopes_supported: [SCOPE],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
    }),
  );

  // Protected Resource metadata (RFC 9728), built with the SDK helper.
  app.get('/.well-known/oauth-protected-resource', (c) =>
    c.json(
      buildProtectedResourceMetadata({ resource, authorizationServers: [issuer], scopes: [SCOPE] }),
    ),
  );

  // Dynamic Client Registration (RFC 7591).
  app.post('/register', async (c) => {
    const body = await c.req
      .json<{ client_name?: string; grant_types?: string[]; redirect_uris?: string[] }>()
      .catch(
        () => ({}) as { client_name?: string; grant_types?: string[]; redirect_uris?: string[] },
      );
    const clientId = `dcr-${crypto.randomUUID()}`;
    const clientSecret = randomHex(24);
    const grantTypes = body.grant_types?.length ? body.grant_types : ['authorization_code'];
    clients.set(clientId, { clientId, clientSecret, name: body.client_name, grantTypes });
    return c.json(
      {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        grant_types: grantTypes,
        token_endpoint_auth_method: 'client_secret_post',
        client_name: body.client_name ?? 'Dynamically Registered Client',
        redirect_uris: body.redirect_uris ?? [],
      },
      201,
    );
  });

  // Token endpoint (authorization_code + PKCE, and client_credentials).
  app.post('/token', async (c) => {
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, string>;
    const grant = String(form.grant_type ?? '');
    const clientId = String(form.client_id ?? '');

    if (grant === 'authorization_code') {
      const code = String(form.code ?? '');
      const verifier = String(form.code_verifier ?? '');
      const redirectUri = String(form.redirect_uri ?? '');
      const rec = authCodes.get(code);
      if (!rec)
        return c.json(
          { error: 'invalid_grant', error_description: 'Unknown or expired authorization code' },
          400,
        );
      authCodes.delete(code); // single-use
      if (rec.redirectUri && rec.redirectUri !== redirectUri) {
        return c.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, 400);
      }
      const ok =
        rec.codeChallengeMethod === 'S256'
          ? (await sha256Base64Url(verifier)) === rec.codeChallenge
          : verifier === rec.codeChallenge;
      if (!ok)
        return c.json(
          { error: 'invalid_grant', error_description: 'PKCE verification failed' },
          400,
        );
      const t = issue(rec.clientId || clientId);
      return c.json({
        access_token: t.token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: t.scope,
      });
    }

    if (grant === 'client_credentials') {
      const clientSecret = String(form.client_secret ?? '');
      const client = clients.get(clientId);
      if (!client || client.clientSecret !== clientSecret) {
        return c.json(
          { error: 'invalid_client', error_description: 'Unknown client or bad secret' },
          401,
        );
      }
      const t = issue(clientId);
      return c.json({
        access_token: t.token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: t.scope,
      });
    }

    return c.json(
      { error: 'unsupported_grant_type', error_description: `grant_type ${grant} not supported` },
      400,
    );
  });

  // Authorization endpoint: binds the code to the client + PKCE challenge, then
  // (auto-approving — no interactive login in this demo) redirects with the code.
  app.get('/authorize', (c) => {
    const clientId = c.req.query('client_id') ?? '';
    const redirectUri = c.req.query('redirect_uri') ?? '';
    const state = c.req.query('state') ?? '';
    const codeChallenge = c.req.query('code_challenge') ?? '';
    const codeChallengeMethod = c.req.query('code_challenge_method') ?? 'plain';
    const code = randomBase64Url(16);
    authCodes.set(code, { clientId, redirectUri, codeChallenge, codeChallengeMethod });
    if (redirectUri) {
      const u = new URL(redirectUri);
      u.searchParams.set('code', code);
      if (state) u.searchParams.set('state', state);
      return c.redirect(u.toString());
    }
    return c.json({ code, state });
  });

  // Protected MCP resource (Streamable HTTP) — the SDK handler runs the authGate.
  app.all('/mcp', toHonoMcpHandler(protectedMcp, { path: '/mcp', authGate }));

  return app;
}
