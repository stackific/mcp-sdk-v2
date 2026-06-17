# Authorization

**Part VI · Errors & authorization** · Book Ch 40–41 · Stories S35–S37 · sidebar `/authorization`

An MCP server is an OAuth 2.1 **protected resource**. An unauthenticated call gets a `401`
with a `WWW-Authenticate` challenge; the client then discovers the protected-resource
metadata, finds its authorization server, registers dynamically, runs an authorization-code
+ PKCE handshake, exchanges the code for a resource-bound token, and retries — and the
server now sees a validated identity as `ctx.authInfo`. This pattern traces the full dance.

## Round-trip

```
demo (AuthorizationPage)                     client host (Hono)
  Run OAuth flow ──POST /api/authorize/run──▶  run(c, () => runAuthFlow())
      ▲                                              │
      │ steps[] + tokenMasked + authInfo             ▼  auth-flow.ts
      │                                    1. 401 + WWW-Authenticate ◀──┐
      │                                    2. PRM (RFC 9728)            │
      │                                    3. AS metadata (RFC 8414)    │ Authorization
      │                                    4. dynamic registration      │ Server + protected
      │                                    5. authorize + PKCE → code    │ MCP resource
      │                                    6. token (code + verifier)   │ (auth.ts)
      └────────── JSON ◀── 7. authorized tools/call whoami ─────────────┘
```

## 1 · Frontend — `demo/src/routes/authorization.tsx` + `demo/src/lib/api.ts`

The page runs the whole handshake with one button and renders each returned step plus the
masked token and the server-validated identity:

```tsx
// demo/src/routes/authorization.tsx
const flow = useAsync<ApiResult<any>>();
const steps: AuthStep[] = (flow.data?.ok ? (flow.data.result as any) : null)?.steps ?? [];
// ...
<Button onClick={() => flow.run(() => backend.runAuthFlow())} disabled={flow.loading}>
  {flow.loading ? 'Running OAuth flow…' : 'Run OAuth 2.1 flow'}
</Button>
// ... renders steps[], data.tokenMasked, and data.authInfo (ctx.http.authInfo)
```

```ts
// demo/src/lib/api.ts
runAuthFlow: () => postJson<ApiResult<Any>>('/api/authorize/run', {}),
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/auth-flow.ts`

The host route is a one-liner; all the work is in `runAuthFlow()`:

```ts
// ts-mcp-client/src/index.ts
// Authorization: run the full OAuth 2.1 handshake against the protected MCP resource.
app.post('/api/authorize/run', (c) => run(c, () => runAuthFlow()));
```

`runAuthFlow()` is the real OAuth 2.1 + PKCE client, built on the SDK's auth helpers. It
records every hop as a step. First, the unauthenticated probe that triggers the challenge:

```ts
// ts-mcp-client/src/auth-flow.ts
// 1. Unauthenticated probe → expect 401 with a WWW-Authenticate challenge.
const probe = await httpFetch(PROTECTED_MCP, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { ... } }),
});
const wwwAuth = probe.headers.get('www-authenticate') ?? '';
```

Then metadata discovery (protected-resource → authorization-server, with issuer
verification) and dynamic client registration:

```ts
// ts-mcp-client/src/auth-flow.ts
// 2–3. Discover protected-resource + authorization-server metadata via the SDK
// (RFC 9728 → RFC 8414), which also verifies the AS issuer (mix-up defense).
const prmUrl =
  /resource_metadata="([^"]+)"/.exec(wwwAuth)?.[1] ??
  `${AUTH_SERVER_URL}/.well-known/oauth-protected-resource`;
const discovered = await discoverOAuthMetadata({ resource: PROTECTED_MCP, resourceMetadataUrl: prmUrl });
const asMeta = discovered.authorizationServer;
// ...
// 4. Dynamic client registration via the SDK (RFC 7591).
const reg = await registerClient(asMeta, { clientName: 'Companion SPA', redirectUris: [REDIRECT_URI] });
```

PKCE (S256) + the SDK-built authorize URL → an authorization code, then `state`/`iss`
verification before redeeming it:

```ts
// ts-mcp-client/src/auth-flow.ts
// 5. PKCE (SDK Web Crypto) + the SDK-built authorize URL → auth code.
const pkce = await createPkcePair();
const state = crypto.randomUUID();
const authUrl = buildAuthorizeUrl(asMeta, {
  clientId: reg.clientId, redirectUri: REDIRECT_URI, resource: PROTECTED_MCP,
  scope: 'mcp:tools', state, codeChallenge: pkce.codeChallenge,
});
const authRes = await httpFetch(authUrl, { redirect: 'manual' });
const redirectUrl = new URL(authRes.headers.get('location') ?? '');
const code = redirectUrl.searchParams.get('code') ?? '';
// verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up) before redeeming.
verifyAuthorizationRedirect({ sentState: state, returnedState: redirectUrl.searchParams.get('state'), issuer, ... });
```

Token exchange (audience-bound by the RFC 8707 `resource` param), then an authorized
`tools/call` carrying the bearer token:

```ts
// ts-mcp-client/src/auth-flow.ts
// 6. Token exchange via the SDK (audience-bound by the RFC 8707 resource param).
const tokenJson = await exchangeAuthorizationCode(asMeta, {
  clientId: reg.clientId, code, codeVerifier: pkce.codeVerifier,
  redirectUri: REDIRECT_URI, resource: PROTECTED_MCP,
});
// 7. Authorized MCP call — connect with the bearer token and call whoami.
const transport = new StreamableHTTPClientTransport(new URL(PROTECTED_MCP), {
  authProvider: { token: async () => tokenJson.access_token },
});
await client.connect(transport);
const whoami = await client.callTool({ name: 'whoami', arguments: {} } as any);
```

## 3 · MCP server — `ts-mcp-server/src/auth.ts`

One Hono app plays two roles: the **Authorization Server** (metadata, DCR, token) and the
**protected MCP resource**. The protected-resource metadata is built with an SDK helper:

```ts
// ts-mcp-server/src/auth.ts
// Protected Resource metadata (RFC 9728), built with the SDK helper.
app.get('/.well-known/oauth-protected-resource', (c) =>
  c.json(buildProtectedResourceMetadata({ resource, authorizationServers: [issuer], scopes: [SCOPE] })),
);
// Authorization Server metadata (RFC 8414).
app.get('/.well-known/oauth-authorization-server', (c) =>
  c.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    code_challenge_methods_supported: ['S256'],
    // ...
  }),
);
```

The token endpoint verifies the PKCE challenge (`S256`) against the stored code before
issuing a resource-bound bearer token:

```ts
// ts-mcp-server/src/auth.ts
const ok =
  rec.codeChallengeMethod === 'S256'
    ? (await sha256Base64Url(verifier)) === rec.codeChallenge
    : verifier === rec.codeChallenge;
if (!ok) return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
const t = issue(rec.clientId || clientId);
return c.json({ access_token: t.token, token_type: 'Bearer', expires_in: 3600, scope: t.scope });
```

The SDK's `bearerAuthGate` is the gate on `/mcp`: it emits the `401` challenge for the
unauthenticated probe, binds the token's audience to this resource, and threads the
validated identity into `ctx.authInfo` (what `whoami` reads back):

```ts
// ts-mcp-server/src/auth.ts
const authGate = bearerAuthGate({
  resourceMetadataUrl: prmUrl,
  expectedAudience: resource,
  validate: (token) => {
    const tok = tokens.get(token);
    if (!tok || tok.expiresAt < Date.now()) return null;
    return { token: tok.token, clientId: tok.clientId, scopes: tok.scope.split(' '), aud: tok.audience, expiresAt: Math.floor(tok.expiresAt / 1000) };
  },
});
// ...
app.all('/mcp', toHonoMcpHandler(protectedMcp, { path: '/mcp', authGate }));
```

## On the wire

```
1. POST /mcp (no token)          → 401  WWW-Authenticate: Bearer resource_metadata="…/oauth-protected-resource"
2. GET  /.well-known/oauth-protected-resource   → { resource, authorization_servers: [issuer], scopes_supported }
3. GET  /.well-known/oauth-authorization-server → { authorization_endpoint, token_endpoint, registration_endpoint, code_challenge_methods_supported: ["S256"] }
4. POST /register                → 201  { client_id, client_secret, ... }
5. GET  /authorize?...&code_challenge=…&code_challenge_method=S256 → 302 Location: …/callback?code=…&state=…
6. POST /token (grant_type=authorization_code, code_verifier, resource) → { access_token, token_type: "Bearer", scope, expires_in }
7. POST /mcp  Authorization: Bearer …  tools/call whoami → { structuredContent: { clientId, scopes, expiresAt } }
```

The `resource` parameter (steps 5–6) audience-binds the token to *this* server, and the
gate rejects a token whose audience does not match — so a token minted for one resource
cannot be replayed against another. See [Errors](./errors.md) for how the `401` and other
failures are shaped by the host.
