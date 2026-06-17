# Authorization

**Part VI · Errors & authorization** · Book Ch 40–41 · Stories S35–S37 · sidebar `/authorization`

An MCP server is an OAuth 2.1 **protected resource**. An unauthenticated call gets a `401`
with a `WWW-Authenticate` challenge; the client then discovers the protected-resource
metadata, finds its authorization server, registers dynamically, runs an authorization-code
+ PKCE handshake, exchanges the code for a resource-bound token, and retries — and the
server now sees a validated identity as `ctx.auth_info`. This pattern traces the full dance.

## Round-trip

```
demo (AuthorizationPage)                     client host (FastAPI)
  Run OAuth flow ──POST /api/authorize/run──▶  run(lambda: run_auth_flow())
      ▲                                              │
      │ steps[] + tokenMasked + authInfo             ▼  auth_flow.py
      │                                    1. 401 + WWW-Authenticate ◀──┐
      │                                    2. PRM (RFC 9728)            │
      │                                    3. AS metadata (RFC 8414)    │ Authorization
      │                                    4. dynamic registration      │ Server + protected
      │                                    5. authorize + PKCE → code    │ MCP resource
      │                                    6. token (code + verifier)   │ (auth_app.py)
      └────────── JSON ◀── 7. authorized tools/call whoami ─────────────┘
```

## 1 · Frontend — `demo/src/routes/authorization.tsx` + `demo/src/lib/api.ts`

The frontend is the shared SPA (TypeScript); selecting **Python** only repoints `backend.*`
at the Python client host, so this layer is identical to the TypeScript pattern.

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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/auth_flow.py`

The host route is a one-liner; all the work is in `run_auth_flow()`. It is a plain `def`,
so FastAPI runs the blocking handshake in a worker thread rather than on the event loop:

```python
# py-mcp-client/main.py
# Authorization: run the full OAuth 2.1 handshake against the protected MCP resource.
@app.post("/api/authorize/run")
def api_authorize_run() -> dict:
  return run(run_auth_flow)
```

`run_auth_flow()` is the real OAuth 2.1 + PKCE client, built on the SDK's auth helpers. It
records every hop as a step (and emits a debug frame, so the SPA's wire view shows the
dance). First, the unauthenticated probe that triggers the challenge:

```python
# py-mcp-client/auth_flow.py
# 1. Unauthenticated probe → expect 401 with a WWW-Authenticate challenge.
probe = httpx.post(
  PROTECTED_MCP,
  headers={"content-type": "application/json", "accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2026-07-28"},
  json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2026-07-28", "capabilities": {}, "clientInfo": {"name": "probe", "version": "0"}}},
  timeout=10.0,
)
www_auth = probe.headers.get("www-authenticate", "")
```

Then metadata discovery (protected-resource → authorization-server, with issuer
verification) and dynamic client registration:

```python
# py-mcp-client/auth_flow.py
# 2–3. Discover protected-resource + authorization-server metadata (RFC 9728 → RFC 8414).
match = re.search(r'resource_metadata="([^"]+)"', www_auth)
prm_url = match.group(1) if match else f"{AUTH_SERVER_URL}/.well-known/oauth-protected-resource"
discovered = discover_oauth_metadata(resource=PROTECTED_MCP, resource_metadata_url=prm_url)
issuer = discovered["issuer"]
as_meta = discovered["authorization_server"]
# ...
# 4. Dynamic client registration (SDK).
reg = register_client(as_meta, client_name="Companion SPA", redirect_uris=[REDIRECT_URI])
```

PKCE (S256) + the SDK-built authorize URL → an authorization code, then `state`/`iss`
verification before redeeming it:

```python
# py-mcp-client/auth_flow.py
# 5. PKCE + the SDK-built authorize URL → auth code (manual redirect capture).
pkce = create_pkce_pair()
state = str(uuid.uuid4())
authorize_url = build_authorize_url(
  as_meta, client_id=reg["clientId"], redirect_uri=REDIRECT_URI, resource=PROTECTED_MCP, scope="mcp:tools", state=state, code_challenge=pkce["code_challenge"]
)
auth_res = httpx.get(authorize_url, follow_redirects=False, timeout=10.0)
location = auth_res.headers.get("location", "")
# ...
qs = parse_qs(urlparse(location).query) if location else {}
code = qs.get("code", [""])[0]
# verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up) before redeeming.
verify_authorization_redirect(
  sent_state=state, returned_state=qs.get("state", [None])[0], issuer=issuer,
  returned_iss=qs.get("iss", [None])[0],
  iss_parameter_supported=as_meta.get("authorization_response_iss_parameter_supported") is True,
)
```

Token exchange (audience-bound by the RFC 8707 `resource` param), then an authorized
`tools/call` carrying the bearer token. The SDK's `auth_provider` is a callable returning
the token, threaded into every request the transport sends:

```python
# py-mcp-client/auth_flow.py
# 6. Token exchange (SDK; audience-bound by the RFC 8707 resource param).
token_json = exchange_authorization_code(as_meta, client_id=reg["clientId"], code=code, code_verifier=pkce["code_verifier"], redirect_uri=REDIRECT_URI, resource=PROTECTED_MCP)
# 7. Authorized MCP call — connect with the bearer token and call whoami.
access_token = token_json.get("access_token")
transport = StreamableHttpClientTransport(PROTECTED_MCP, auth_provider=lambda: access_token)
client = Client(transport, {"name": "companion-authorized-client", "version": "0.1.0"}, capabilities={})
client.discover()
whoami = client.call_tool("whoami", {})
```

## 3 · MCP server — `py-mcp-server/auth_app.py`

One FastAPI app plays two roles: the **Authorization Server** (metadata, DCR, token) and
the **protected MCP resource**. The authorization-server and protected-resource metadata
are served from `.well-known` endpoints (the latter via an SDK helper):

```python
# py-mcp-server/auth_app.py
# Authorization Server metadata (RFC 8414).
@app.get("/.well-known/oauth-authorization-server")
def as_metadata() -> dict:
  return {
    "issuer": issuer,
    "authorization_endpoint": f"{issuer}/authorize",
    "token_endpoint": f"{issuer}/token",
    "registration_endpoint": f"{issuer}/register",
    "code_challenge_methods_supported": ["S256"],
    # ...
  }

# Protected Resource metadata (RFC 9728), built with the SDK helper.
@app.get("/.well-known/oauth-protected-resource")
def prm() -> dict:
  return build_protected_resource_metadata(resource=resource, authorization_servers=[issuer], scopes=[SCOPE])
```

The token endpoint verifies the PKCE challenge (`S256`) against the stored, single-use code
before issuing a resource-bound bearer token:

```python
# py-mcp-server/auth_app.py
record = auth_codes.pop(code, None)  # single-use
# ...
ok = (
  _sha256_b64url(verifier) == record["codeChallenge"]
  if record["codeChallengeMethod"] == "S256"
  else verifier == record["codeChallenge"]
)
if not ok:
  return _json(400, {"error": "invalid_grant", "error_description": "PKCE verification failed"})
issued = issue(record["clientId"] or client_id)
return _json(200, {"access_token": issued["token"], "token_type": "Bearer", "expires_in": 3600, "scope": SCOPE})
```

The SDK's `bearer_auth_gate` is the gate on `/mcp`: it emits the `401` challenge for the
unauthenticated probe, binds the token's audience to this resource, and threads the
validated identity into `ctx.auth_info` (what `whoami` reads back). The gate is wired into
the SDK's ASGI handler, which the `/mcp` route delegates to:

```python
# py-mcp-server/auth_app.py
def validate(token: str) -> dict | None:
  record = tokens.get(token)
  if record is None or record["expiresAt"] < time.time():
    return None
  return {"token": record["token"], "clientId": record["clientId"], "scopes": record["scope"].split(" "), "aud": record["audience"], "expiresAt": int(record["expiresAt"])}

gate = bearer_auth_gate(resource_metadata_url=prm_url, expected_audience=resource, validate=validate)
mcp_handler = create_asgi_mcp_handler(protected, auth_gate=gate)
# ...
@app.api_route("/mcp", methods=["GET", "POST", "OPTIONS"])
async def mcp(request: Request) -> Response:
  return await mcp_handler(request)
```

`whoami` is the identity-aware tool registered on the protected server; it reads back
exactly what the gate validated:

```python
# py-mcp-server/auth_app.py
def whoami(args: dict, ctx) -> dict:
  info = ctx.auth_info or {}
  client_id = info.get("clientId", "unknown")
  scopes = info.get("scopes", [])
  return {
    "content": [{"type": "text", "text": f"Authenticated as {client_id} with scopes [{', '.join(scopes)}]."}],
    "structuredContent": {"clientId": info.get("clientId"), "scopes": scopes, "expiresAt": info.get("expiresAt")},
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
failures are shaped by the host.
