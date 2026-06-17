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
demo (SecurityPage)  ──GET /api/status──▶  client host (Minimal API + CORS)
      ▲                                          │ AuthFlow.cs: PKCE S256, state, issuer checks
      │                                          ▼
  JsonBlock(status)                      Stackific.Mcp.Client  McpClient
      │                                          │ Streamable HTTP (Origin validated)
      └──── connection context ◀──── 401 / 403 gates ──┴──▶ MCP server (AuthGates.Bearer, audience bound)
```

## 1 · Frontend — `demo/src/routes/security.tsx`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page itself enforces nothing — it loads the live connection context so the §28 baseline can be read
against the negotiated server. The trust boundary is the host, not the browser:

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

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/AuthFlow.cs`

The host applies CORS at its REST edge (the SPA's only entry point):

```csharp
// csharp-mcp-client/Program.cs
builder.Services.AddCors(options =>
  options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));
// ...
app.UseCors();
```

The substantive client-side security is in the OAuth handshake: a per-request `state` (CSRF / mix-up
defense) and an exact-issuer check on the redirect *before* the code is redeemed:

```csharp
// csharp-mcp-client/AuthFlow.cs
var pkce = OAuth.CreatePkcePair();
var state = Guid.NewGuid().ToString();
// ...
// §23.5/§23.7: verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up).
OAuth.VerifyAuthorizationRedirect(
  sentState: state,
  returnedState: QueryValue(redirectQuery, "state"),
  issuer: issuer,
  returnedIss: QueryValue(redirectQuery, "iss"),
  issParameterSupported: asMeta["authorization_response_iss_parameter_supported"]?.GetValue<bool>() == true);
```

## 3 · MCP server — `csharp-sdk/Transport/StreamableHttpServer.cs` + `csharp-mcp-server/Auth.cs`

The Streamable HTTP handler validates the `Origin` header on **every** request — the DNS-rebinding
defense of §9.11 — rejecting a disallowed cross-origin browser with `403` *before doing any work*. A
same-origin request and a non-browser request (no `Origin`) always pass:

```csharp
// csharp-sdk/Transport/StreamableHttpServer.cs
// §9.11: validate Origin BEFORE doing any work, defending against DNS rebinding. A rejected Origin
// is answered with 403 and an id-less body (or no body) — the request id is never echoed.
var origin = request.Headers.Origin.ToString();
if (!string.IsNullOrEmpty(origin) && !OriginAccepted(origin, options.AllowedOrigins))
{
  await WriteForbiddenOriginAsync(context, options).ConfigureAwait(false);
  return;
}
```

The protected MCP resource wires the SDK's `AuthGates.Bearer`, which binds the token's **audience**
to this resource (a server MUST reject a token not issued for it — no confused-deputy) and threads
the validated identity into `ctx.AuthInfo`:

```csharp
// csharp-mcp-server/Auth.cs
app.MapMcp("/mcp", protectedServer, AuthGates.Bearer(prmUrl, resource, token =>
{
  if (!tokens.TryGetValue(token, out var issued) || issued.ExpiresAt < NowMs()) return null;
  return new AuthInfo(
    issued.Token, ClientId: issued.ClientId,
    Scopes: issued.Scope.Split(' ', StringSplitOptions.RemoveEmptyEntries),
    Audience: issued.Audience, ExpiresAt: issued.ExpiresAt / 1000);
}));
```

The gate runs the §23.8 per-request state machine, whose middle step is the audience binding —
reject a token not issued for this resource (§23.6):

```csharp
// csharp-sdk/Protocol/AuthorizationFlow.cs (AccessTokenUsage.ValidateRequest)
// Wrong audience → 401 (R-23.6-f/g, R-23.8-d/e).
if (!ValidateTokenAudience(token.AudienceList, ownCanonicalResource).Ok)
{
  return AccessTokenValidationResult.Challenged(new AuthorizationChallenge(
    AuthorizationConstants.UnauthorizedStatus,
    WwwAuthenticate.BuildUnauthorizedValue(resourceMetadata, scopeParam)));
}
```

Behind these gates, the SDK models the whole §28 baseline as an enumerable **requirement registry**
a conformance review can assert coverage against:

```csharp
// csharp-sdk/Protocol/Security.cs
public static IReadOnlyList<SecurityRequirement> Requirements { get; } =
[
  new("R-28.1-b", "MUST", "§28.1", "user-consent-and-control",
    "Users explicitly consent to, and understand, all data access and operations."),
  new("R-28.3-d", "MUST", "§28.3", "tool-safety",
    "Keep a human in the loop: the user can review, understand, and deny a proposed invocation before it runs."),
  // ... every numbered §28.x atom, in spec order
];
```

## On the wire

1. An unauthenticated request to the protected resource → `401` + `WWW-Authenticate: Bearer …`
   carrying `resource_metadata`.
2. A token whose audience does not name the server → `401` (rejected **before** processing).
3. A disallowed cross-origin browser request → `403` (id-less body; the request id is never echoed).

Most §28 obligations (consent, human-in-the-loop, isolation) cannot surface as wire errors — they
are host responsibilities. See [Authorization](./authorization.md) for the full OAuth 2.1 + PKCE
flow and [Conformance](./conformance.md) for how these MUSTs fold into the conformance contract.
