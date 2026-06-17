# Security

**Part VIII · Governance** · Book Ch 28 · Stories S44 · sidebar `/security`

§28 is a consolidating chapter: it defines no new wire types but binds the consent, isolation,
validation, and confidentiality obligations from across the spec into one enforceable baseline. The
**host is the sole trust boundary** — most obligations cannot be enforced at the wire level, so they
depend on the implementation. This pattern grounds each layer in a real, security-bearing mechanism:
an origin gate, a bearer/audience gate, a redirect (state/CSRF + issuer) check, and the SDK's §28
requirement registry.

## Round-trip

```
demo (SecurityPage)  ──GET /api/status──▶  client host (Hono + CORS)
      ▲                                          │ auth-flow.ts: PKCE S256, state, issuer checks
      │                                          ▼
  JsonBlock(status)                      @stackific/mcp-sdk  Client
      │                                          │ Streamable HTTP (Origin validated)
      └──── connection context ◀──── 401 / 403 gates ──┴──▶ MCP server (bearerAuthGate, audience bound)
```

## 1 · Frontend — `demo/src/routes/security.tsx`

The page itself enforces nothing — it loads the live connection context so the §28 baseline can be
read against the negotiated server. The trust boundary is the host, not the browser:

```tsx
// demo/src/routes/security.tsx
<Button
  data-testid="run-security"
  disabled={status.loading}
  onClick={() => status.run(() => backend.status())}
>
  Load status
</Button>
{s ? <JsonBlock value={s} /> : null}
```

The page's checklist is static documentation of the MUST-level baseline (audience binding, PKCE
S256, explicit consent, human-in-the-loop, sandbox isolation, input validation, no-secret-leak, TLS)
— the enforceable parts of which live one and two layers down.

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/auth-flow.ts`

The host applies CORS at its REST edge (the SPA's only entry point):

```ts
// ts-mcp-client/src/index.ts
app.use(
  '*',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'] }),
);
```

The substantive client-side security is in the OAuth handshake: a per-request `state` (CSRF / mix-up
defense) and an exact-issuer check on the redirect *before* the code is redeemed:

```ts
// ts-mcp-client/src/auth-flow.ts
const pkce = await createPkcePair();
const state = crypto.randomUUID();
// ...
// §23.5/§23.7: verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up)
// before redeeming the code.
verifyAuthorizationRedirect({
  sentState: state,
  returnedState: redirectUrl?.searchParams.get('state'),
  issuer,
  returnedIss: redirectUrl?.searchParams.get('iss'),
  issParameterSupported: (asMeta as any).authorization_response_iss_parameter_supported === true,
});
```

## 3 · MCP server — `ts-sdk/src/server/streamable-http.ts` + `ts-mcp-server/src/auth.ts`

The Streamable HTTP handler validates the `Origin` header on **every** request — the DNS-rebinding
defense of §9.11 — rejecting a disallowed cross-origin browser with `403`:

```ts
// ts-sdk/src/server/streamable-http.ts
// DNS-rebinding defense (§9.11): validate Origin on every request (default-on). A
// same-origin request and a non-browser request (no Origin) always pass ...
const origin = getHeader(reqHeaders, ORIGIN_HEADER);
if (origin !== undefined && origin !== url.origin && !originAllowed(origin, acceptedOrigins)) {
  return json(403, {
    jsonrpc: '2.0',
    id: null,
    error: { code: INVALID_REQUEST_CODE, message: `Origin not permitted: ${origin}` },
  });
}
```

The protected MCP resource wires the SDK's `bearerAuthGate`, which binds the token's **audience** to
this resource (a server MUST reject a token not issued for it — no confused-deputy) and threads the
validated identity into `ctx.authInfo`:

```ts
// ts-mcp-server/src/auth.ts
const authGate = bearerAuthGate({
  resourceMetadataUrl: prmUrl,
  expectedAudience: resource,
  validate: (token) => {
    const tok = tokens.get(token);
    if (!tok || tok.expiresAt < Date.now()) return null;
    return { token: tok.token, clientId: tok.clientId, scopes: tok.scope.split(' '),
             aud: tok.audience, expiresAt: Math.floor(tok.expiresAt / 1000) };
  },
});
```

```ts
// ts-sdk/src/server/auth.ts
// Audience binding (§23.6/§23.8/§23.19): reject a token not issued for this resource.
if (options.expectedAudience) {
  const aud = audienceOf(authInfo);
  if (aud === undefined || !audienceCovers(aud, options.expectedAudience)) {
    return challenge401('Access token was not issued for this resource');
  }
}
```

Behind these gates, the SDK models the whole §28 baseline as an enumerable **requirement registry**
a conformance review can assert coverage against:

```ts
// ts-sdk/src/protocol/security.ts
export const SECURITY_REQUIREMENTS: readonly SecurityRequirement[] = Object.freeze([
  { id: 'R-28.5-b', level: 'MUST', section: '§28.5', principle: 'host-mediated-trust',
    statement: 'A server validates that every token was issued for it as the intended audience.' },
  { id: 'R-28.10-i', level: 'MUST', section: '§28.10', principle: 'host-mediated-trust',
    statement: 'A server with an HTTP endpoint validates the Origin header on every connection ...' },
  // ... every numbered §28.x atom, in spec order
]);
```

## On the wire

1. An unauthenticated request to the protected resource → `401` + `WWW-Authenticate: Bearer …`
   carrying `resource_metadata`.
2. A token whose audience does not name the server → `401 invalid_token` (rejected **before**
   processing).
3. A disallowed cross-origin browser request → `403` with `-32600 Origin not permitted`.

Most §28 obligations (consent, human-in-the-loop, isolation) cannot surface as wire errors — they
are host responsibilities. See [Authorization](./authorization.md) for the full OAuth 2.1 + PKCE
flow and [Conformance](./conformance.md) for how these MUSTs fold into the conformance contract.
