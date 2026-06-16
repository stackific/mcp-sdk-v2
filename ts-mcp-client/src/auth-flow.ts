/**
 * Drives the full MCP authorization handshake (book Ch 40–41) against the demo
 * Authorization Server + protected resource, emitting a debug frame for every hop so
 * the SPA can show the OAuth 2.1 dance under the hood:
 *
 *   1. unauthenticated call → 401 + WWW-Authenticate
 *   2. fetch protected-resource metadata (RFC 9728)
 *   3. fetch authorization-server metadata (RFC 8414)
 *   4. dynamic client registration (RFC 7591)
 *   5. authorization request with PKCE (S256) → authorization code
 *   6. token via authorization_code + code_verifier (OAuth 2.1 / PKCE)
 *   7. authorized MCP tools/call (whoami) — the server sees ctx.http.authInfo
 */
import { Client, StreamableHTTPClientTransport } from '@stackific/mcp-sdk-ts';
import {
  createPkcePair,
  discoverOAuthMetadata,
  registerClient,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  verifyAuthorizationRedirect,
} from '@stackific/mcp-sdk-ts/client';

import { AUTH_SERVER_URL, FRONTEND_URL } from './config.js';
import { bus } from './debug-bus.js';
import { httpFetch } from './http.js';

const PROTECTED_MCP = `${AUTH_SERVER_URL}/mcp`;
const REDIRECT_URI = `${FRONTEND_URL}/oauth/callback`;

export interface AuthStep {
  n: number;
  title: string;
  method: string;
  url: string;
  status: number | string;
  detail?: unknown;
}

const mask = (t?: string) => (t ? `${t.slice(0, 6)}…${t.slice(-4)} (${t.length} chars)` : '—');

function note(dir: 'send' | 'recv' | 'local', summary: string, payload?: unknown) {
  bus.emitFrame({ dir, kind: 'note', method: 'oauth', summary, payload, trace: 'authorization' });
}

export async function runAuthFlow(): Promise<{
  steps: AuthStep[];
  grant: string;
  token: string;
  tokenMasked: string;
  scope?: string;
  authInfo?: unknown;
  whoami?: unknown;
}> {
  const steps: AuthStep[] = [];
  const add = (s: AuthStep) => {
    steps.push(s);
    note('recv', `${s.n}. ${s.title} → ${s.status}`, s.detail);
  };

  // 1. Unauthenticated probe → expect 401 with a WWW-Authenticate challenge.
  note('send', '1. unauthenticated initialize → protected resource', { url: PROTECTED_MCP });
  const probe = await httpFetch(PROTECTED_MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2026-07-28',
        capabilities: {},
        clientInfo: { name: 'probe', version: '0' },
      },
    }),
  });
  const wwwAuth = probe.headers.get('www-authenticate') ?? '';
  add({
    n: 1,
    title: 'Unauthenticated call (expect 401)',
    method: 'POST',
    url: PROTECTED_MCP,
    status: probe.status,
    detail: { wwwAuthenticate: wwwAuth },
  });

  // 2–3. Discover protected-resource + authorization-server metadata via the SDK
  // (RFC 9728 → RFC 8414), which also verifies the AS issuer (mix-up defense, §23.3).
  const prmUrl =
    /resource_metadata="([^"]+)"/.exec(wwwAuth)?.[1] ??
    `${AUTH_SERVER_URL}/.well-known/oauth-protected-resource`;
  note('send', '2. discover protected-resource → authorization-server metadata (SDK)', {
    resourceMetadataUrl: prmUrl,
  });
  const discovered = await discoverOAuthMetadata({
    resource: PROTECTED_MCP,
    resourceMetadataUrl: prmUrl,
  });
  const issuer = discovered.issuer;
  const asMeta = discovered.authorizationServer;
  add({
    n: 2,
    title: 'Protected-resource metadata (RFC 9728)',
    method: 'GET',
    url: prmUrl,
    status: 200,
    detail: discovered.protectedResource,
  });
  add({
    n: 3,
    title: 'Authorization-server metadata (RFC 8414, issuer verified)',
    method: 'GET',
    url: `${issuer}/.well-known/oauth-authorization-server`,
    status: 200,
    detail: {
      issuer,
      authorization_endpoint: asMeta.authorization_endpoint,
      token_endpoint: asMeta.token_endpoint,
      registration_endpoint: asMeta.registration_endpoint,
      code_challenge_methods_supported: asMeta.code_challenge_methods_supported,
    },
  });

  // 4. Dynamic client registration via the SDK (sends the required application_type).
  note('send', '4. dynamic client registration (SDK)', { url: asMeta.registration_endpoint });
  const reg = await registerClient(asMeta, {
    clientName: 'Companion SPA',
    redirectUris: [REDIRECT_URI],
  });
  add({
    n: 4,
    title: 'Dynamic client registration (RFC 7591)',
    method: 'POST',
    url: asMeta.registration_endpoint ?? `${issuer}/register`,
    status: 201,
    detail: { client_id: reg.clientId, redirect_uris: [REDIRECT_URI] },
  });

  // 5. PKCE (SDK Web Crypto) + the SDK-built authorize URL → auth code (manual
  // redirect capture, since the consent/redirect step is the caller's).
  const pkce = await createPkcePair();
  const state = crypto.randomUUID();
  const authUrl = buildAuthorizeUrl(asMeta, {
    clientId: reg.clientId,
    redirectUri: REDIRECT_URI,
    resource: PROTECTED_MCP,
    scope: 'mcp:tools',
    state,
    codeChallenge: pkce.codeChallenge,
  });
  note('send', '5. GET authorize (PKCE S256, SDK URL)', {
    url: authUrl,
    code_challenge: pkce.codeChallenge,
  });
  const authRes = await httpFetch(authUrl, { redirect: 'manual' });
  const location = authRes.headers.get('location') ?? '';
  const redirectUrl = location ? new URL(location) : null;
  const code = redirectUrl?.searchParams.get('code') ?? '';
  // §23.5/§23.7: verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up)
  // before redeeming the code.
  verifyAuthorizationRedirect({
    sentState: state,
    returnedState: redirectUrl?.searchParams.get('state'),
    issuer,
    returnedIss: redirectUrl?.searchParams.get('iss'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    issParameterSupported: (asMeta as any).authorization_response_iss_parameter_supported === true,
  });
  add({
    n: 5,
    title: 'Authorization request + PKCE → code (state/iss verified)',
    method: 'GET',
    url: `${issuer}/authorize`,
    status: authRes.status,
    detail: { redirected_to: location, code: mask(code), state },
  });

  // 6. Token exchange via the SDK (audience-bound by the RFC 8707 resource param).
  note('send', '6. token exchange (authorization_code + PKCE, SDK)', {
    url: asMeta.token_endpoint,
  });
  const tokenJson = await exchangeAuthorizationCode(asMeta, {
    clientId: reg.clientId,
    code,
    codeVerifier: pkce.codeVerifier,
    redirectUri: REDIRECT_URI,
    resource: PROTECTED_MCP,
  });
  add({
    n: 6,
    title: 'Token endpoint (authorization_code + PKCE, resource-bound)',
    method: 'POST',
    url: asMeta.token_endpoint ?? `${issuer}/token`,
    status: 200,
    detail: {
      access_token: mask(tokenJson.access_token),
      token_type: tokenJson.token_type,
      scope: tokenJson.scope,
      expires_in: tokenJson.expires_in,
    },
  });

  // 7. Authorized MCP call — connect with the bearer token and call whoami.
  note('send', '7. authorized MCP connect + tools/call whoami', { url: PROTECTED_MCP });
  const client = new Client(
    { name: 'companion-authorized-client', version: '0.1.0' },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(PROTECTED_MCP), {
    authProvider: { token: async () => tokenJson.access_token },
  });
  await client.connect(transport);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whoami = await client.callTool({ name: 'whoami', arguments: {} } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authInfo = (whoami as any)?.structuredContent ?? null;
  add({
    n: 7,
    title: 'Authorized tools/call whoami',
    method: 'POST',
    url: PROTECTED_MCP,
    status: 200,
    detail: authInfo,
  });
  await client.close();

  return {
    steps,
    grant: 'authorization_code + PKCE (S256)',
    token: tokenJson.access_token,
    tokenMasked: mask(tokenJson.access_token),
    scope: tokenJson.scope,
    authInfo,
    whoami,
  };
}
