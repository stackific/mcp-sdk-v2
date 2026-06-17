# Authorization

**Part VI · Errors & authorization** · Book Ch 40–41 · Stories S35–S37 · sidebar `/authorization`

An MCP server is an OAuth 2.1 **protected resource**. An unauthenticated call gets a `401`
with a `WWW-Authenticate` challenge; the client then discovers the protected-resource
metadata, finds its authorization server, registers dynamically, runs an authorization-code
+ PKCE handshake, exchanges the code for a resource-bound token, and retries — and the
server now sees a validated identity as `ctx.AuthInfo`. This pattern traces the full dance.

## Round-trip

```
demo (AuthorizationPage)                     client host (ASP.NET Core)
  Run OAuth flow ──POST /api/authorize/run──▶  Run(() => AuthFlow.RunAsync(...))
      ▲                                              │
      │ steps[] + tokenMasked + authInfo             ▼  AuthFlow.cs
      │                                    1. 401 + WWW-Authenticate ◀──┐
      │                                    2. PRM (RFC 9728)            │
      │                                    3. AS metadata (RFC 8414)    │ Authorization
      │                                    4. dynamic registration      │ Server + protected
      │                                    5. authorize + PKCE → code    │ MCP resource
      │                                    6. token (code + verifier)   │ (Auth.cs)
      └────────── JSON ◀── 7. authorized tools/call whoami ─────────────┘
```

## 1 · Frontend — `demo/src/routes/authorization.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected
language switch routes the call to the C# client host. The page runs the whole handshake with
one button and renders each returned step plus the masked token and the server-validated
identity:

```tsx
// demo/src/routes/authorization.tsx
const flow = useAsync<ApiResult<any>>();
const steps: AuthStep[] = (flow.data?.ok ? (flow.data.result as any) : null)?.steps ?? [];
// ...
<Button onClick={() => flow.run(() => backend.runAuthFlow())} disabled={flow.loading}>
  {flow.loading ? 'Running OAuth flow…' : 'Run OAuth 2.1 flow'}
</Button>
// ... renders steps[], data.tokenMasked, and data.authInfo (ctx.AuthInfo)
```

```ts
// demo/src/lib/api.ts
runAuthFlow: () => postJson<ApiResult<Any>>('/api/authorize/run', {}),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/AuthFlow.cs`

The host route is a one-liner; all the work is in `AuthFlow.RunAsync`. It is a **literal**
route (it wins over the catch-all), so authorization is fully wired in the C# stack:

```csharp
// csharp-mcp-client/Program.cs
// Authorization: run the full OAuth 2.1 + PKCE handshake against the protected MCP resource.
app.MapPost("/api/authorize/run", () => Run(async () => (object?)await AuthFlow.RunAsync(host, authServerUrl, frontendUrl)));
```

`AuthFlow.RunAsync` is the real OAuth 2.1 + PKCE client, built on the SDK's `OAuth` helpers.
It records every hop as a step. First, the unauthenticated probe that triggers the
challenge — against this server it speaks `server/discover` with the required `_meta` and
routing headers so the request reaches the bearer gate (rather than being rejected at the
transport layer) and elicits the `401`:

```csharp
// csharp-mcp-client/AuthFlow.cs
// 1. Unauthenticated probe → expect 401 with a WWW-Authenticate challenge.
using var probeRequest = new HttpRequestMessage(HttpMethod.Post, protectedMcp)
{
  Content = new StringContent(probeBody.ToJsonString(), System.Text.Encoding.UTF8, "application/json"),
};
probeRequest.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
probeRequest.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
probeRequest.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.Discover);
using var probe = await http.SendAsync(probeRequest).ConfigureAwait(false);
var wwwAuth = probe.Headers.TryGetValues("WWW-Authenticate", out var challengeValues)
  ? string.Join(", ", challengeValues)
  : string.Empty;
```

Then metadata discovery (protected-resource → authorization-server, with issuer
verification) and dynamic client registration, both via the SDK's `OAuth` helpers:

```csharp
// csharp-mcp-client/AuthFlow.cs
// 2–3. Discover protected-resource + authorization-server metadata via the SDK
// (RFC 9728 → RFC 8414), which also verifies the AS issuer (mix-up defense).
var prmUrl = ExtractResourceMetadata(wwwAuth) ?? $"{authServerUrl}/.well-known/oauth-protected-resource";
var discovered = await OAuth.DiscoverOAuthMetadataAsync(http, protectedMcp, prmUrl).ConfigureAwait(false);
var issuer = discovered.Issuer;
var asMeta = discovered.AuthorizationServer;
// ...
// 4. Dynamic client registration via the SDK (RFC 7591).
var registered = await OAuth.RegisterClientAsync(http, asMeta, "Companion SPA", [redirectUri]).ConfigureAwait(false);
```

PKCE (S256) + the SDK-built authorize URL → an authorization code, then `state`/`iss`
verification before redeeming it:

```csharp
// csharp-mcp-client/AuthFlow.cs
// 5. PKCE (SDK) + the SDK-built authorize URL → auth code (manual redirect capture).
var pkce = OAuth.CreatePkcePair();
var state = Guid.NewGuid().ToString();
var authUrl = OAuth.BuildAuthorizeUrl(asMeta, registered.ClientId, redirectUri, protectedMcp, "mcp:tools", state, pkce.CodeChallenge);
using var authResponse = await http.SendAsync(authRequest).ConfigureAwait(false);
var location = authResponse.Headers.Location?.ToString() ?? string.Empty;
var code = QueryValue(redirectQuery, "code") ?? string.Empty;
// verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up) before redeeming.
OAuth.VerifyAuthorizationRedirect(
  sentState: state,
  returnedState: QueryValue(redirectQuery, "state"),
  issuer: issuer,
  returnedIss: QueryValue(redirectQuery, "iss"),
  issParameterSupported: asMeta["authorization_response_iss_parameter_supported"]?.GetValue<bool>() == true);
```

Token exchange (audience-bound by the RFC 8707 `resource` param), then an authorized
`tools/call` carrying the bearer token:

```csharp
// csharp-mcp-client/AuthFlow.cs
// 6. Token exchange via the SDK (audience-bound by the RFC 8707 resource param).
var tokenResponse = await OAuth.ExchangeAuthorizationCodeAsync(http, asMeta, registered.ClientId, code, pkce.CodeVerifier, redirectUri, protectedMcp).ConfigureAwait(false);
// 7. Authorized MCP call — connect with the bearer token and call whoami.
var transport = new StreamableHttpClientTransport(
  new Uri(protectedMcp),
  tokenProvider: _ => Task.FromResult<string?>(tokenResponse.AccessToken));
await using var client = new McpClient(transport,
  new Implementation { Name = "companion-authorized-client", Version = "0.1.0" });
await client.DiscoverAsync().ConfigureAwait(false);
var whoami = await client.CallToolAsync("whoami").ConfigureAwait(false);
```

## 3 · MCP server — `csharp-mcp-server/Auth.cs`

One `WebApplication` plays two roles: the **Authorization Server** (metadata, DCR, token,
authorize) and the **protected MCP resource**. It is a *separate* app from the main
companion server (`csharp-mcp-server/Program.cs`, which maps the unauthenticated tools at
`/mcp`); `Auth.BuildAuthServer(issuer)` runs on its own origin (the `AUTH_SERVER_URL`). The
protected-resource metadata is built with an SDK helper:

```csharp
// csharp-mcp-server/Auth.cs
// Authorization Server metadata (RFC 8414).
app.MapGet("/.well-known/oauth-authorization-server", () => Results.Json(new
{
  issuer,
  authorization_endpoint = $"{issuer}/authorize",
  token_endpoint = $"{issuer}/token",
  registration_endpoint = $"{issuer}/register",
  // ...
  code_challenge_methods_supported = new[] { "S256" },
}));

// Protected Resource metadata (RFC 9728), built with the SDK helper.
app.MapGet("/.well-known/oauth-protected-resource", () =>
  Results.Text(
    AuthGates.BuildProtectedResourceMetadata(resource, [issuer], [Scope]).ToJsonString(),
    "application/json"));
```

The token endpoint verifies the PKCE challenge (`S256`) against the stored code before
issuing a resource-bound bearer token:

```csharp
// csharp-mcp-server/Auth.cs
var ok = record.CodeChallengeMethod == "S256"
  ? Sha256Base64Url(verifier) == record.CodeChallenge
  : verifier == record.CodeChallenge;
if (!ok)
{
  return Results.Json(new { error = "invalid_grant", error_description = "PKCE verification failed" }, statusCode: 400);
}

var issued = Issue(string.IsNullOrEmpty(record.ClientId) ? clientId : record.ClientId);
return Results.Json(new { access_token = issued.Token, token_type = "Bearer", expires_in = 3600, scope = issued.Scope });
```

The SDK's `AuthGates.Bearer` is the gate on `/mcp`: it emits the `401` challenge for the
unauthenticated probe, binds the token's audience to this resource, and threads the
validated identity into `ctx.AuthInfo` (what `whoami` reads back):

```csharp
// csharp-mcp-server/Auth.cs
app.MapMcp("/mcp", protectedServer, AuthGates.Bearer(prmUrl, resource, token =>
{
  if (!tokens.TryGetValue(token, out var issued) || issued.ExpiresAt < NowMs()) return null;
  return new AuthInfo(
    issued.Token,
    ClientId: issued.ClientId,
    Scopes: issued.Scope.Split(' ', StringSplitOptions.RemoveEmptyEntries),
    Audience: issued.Audience,
    ExpiresAt: issued.ExpiresAt / 1000);
}));
```

`whoami` simply reads `ctx.AuthInfo` and echoes the identity the gate validated — `clientId`,
`scopes`, and `expiresAt` — back as structured content:

```csharp
// csharp-mcp-server/Auth.cs
ctx =>
{
  var info = ctx.AuthInfo;
  // ...
  var structured = new JsonObject
  {
    ["clientId"] = info?.ClientId,
    ["scopes"] = scopesArray,
    ["expiresAt"] = info?.ExpiresAt,
  };
  // ...
}
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
failures are shaped by the host's `Run` helper.
