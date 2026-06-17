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
demo (SecurityPage)  ──GET /api/status──▶  client host (FastAPI + CORS)
      ▲                                          │ auth_flow.py: PKCE S256, state, issuer checks
      │                                          ▼
  JsonBlock(status)                      stackific.mcp  Client
      │                                          │ Streamable HTTP (Origin validated)
      └──── connection context ◀──── 401 / 403 gates ──┴──▶ MCP server (bearer_auth_gate, audience bound)
```

## 1 · Frontend — `demo/src/routes/security.tsx`

The frontend is the shared SPA (TypeScript); selecting **Python** only repoints `backend.*`
at the Python client host, so this layer is identical to the TypeScript pattern.

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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/auth_flow.py`

The host applies CORS at its REST edge (the SPA's only entry point):

```python
# py-mcp-client/main.py
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_methods=["GET", "POST", "OPTIONS"],
  allow_headers=["Content-Type"],
)
```

The substantive client-side security is in the OAuth handshake: a per-request `state` (CSRF / mix-up
defense) and an exact-issuer check on the redirect *before* the code is redeemed:

```python
# py-mcp-client/auth_flow.py
pkce = create_pkce_pair()
state = str(uuid.uuid4())
# ...
# §23.5/§23.7: verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up)
# before redeeming the code.
verify_authorization_redirect(
  sent_state=state,
  returned_state=qs.get("state", [None])[0],
  issuer=issuer,
  returned_iss=qs.get("iss", [None])[0],
  iss_parameter_supported=as_meta.get("authorization_response_iss_parameter_supported") is True,
)
```

## 3 · MCP server — `py-sdk/src/stackific/mcp/server/asgi.py` + `py-mcp-server/auth_app.py`

The ASGI handler validates the `Origin` header on **every** request — the DNS-rebinding
defense of §9.11 — rejecting a disallowed cross-origin browser with `403`:

```python
# py-sdk/src/stackific/mcp/server/asgi.py
# DNS-rebinding defense (§9.11): reject a cross-origin browser Origin not allow-listed.
origin = request.headers.get("origin")
if origin is not None:
  same_origin = origin == f"{request.url.scheme}://{request.url.netloc}"
  if not same_origin and not (allowed_origins and ("*" in allowed_origins or origin in allowed_origins)):
    return json_response(
      403, {"jsonrpc": "2.0", "id": None, "error": build_error_object(INVALID_REQUEST_CODE, f"Origin not permitted: {origin}")}
    )
```

The protected MCP resource wires the SDK's `bearer_auth_gate`, which binds the token's **audience**
to this resource (a server MUST reject a token not issued for it — no confused-deputy) and threads
the validated identity into `ctx.auth_info`:

```python
# py-mcp-server/auth_app.py
gate = bearer_auth_gate(resource_metadata_url=prm_url, expected_audience=resource, validate=validate)
mcp_handler = create_asgi_mcp_handler(protected, auth_gate=gate)
```

```python
# py-sdk/src/stackific/mcp/server/auth.py
# Audience binding (§23.6/§23.8/§23.19): reject a token not issued for this resource.
if expected_audience is not None:
  aud = _audience_of(auth_info)
  if aud is None or not _audience_covers(aud, expected_audience):
    return _challenge_401(resource_metadata_url, "Access token was not issued for this resource")
```

Behind these gates, the SDK models the whole §28 baseline as an enumerable **requirement registry**
a conformance review can assert coverage against:

```python
# py-sdk/src/stackific/mcp/protocol/security.py
SECURITY_REQUIREMENTS: tuple[SecurityRequirement, ...] = (
  SecurityRequirement("R-28.1-e", "MUST", "§28.1", "data-privacy",
    "Obtain explicit user consent before exposing user data to a server."),
  SecurityRequirement("R-28.1-f", "MUST NOT", "§28.1", "data-privacy",
    "Never transmit resource data elsewhere without user consent."),
  # ... every numbered §28.x atom, in spec order
)
```

Because §28 is consolidating, its checkable predicates **delegate** to the per-feature module that
owns each mechanic (token-audience to `authorization_flow.py`, consent to `sampling.py`, the
Origin/DNS-rebinding rule restated from §9.11) rather than re-implementing them — `security.py` is
the enumerable index, not a second copy.

## On the wire

1. An unauthenticated request to the protected resource → `401` + `WWW-Authenticate: Bearer …`
   carrying `resource_metadata`.
2. A token whose audience does not name the server → `401 invalid_token` (rejected **before**
   processing).
3. A disallowed cross-origin browser request → `403` with `-32600 Origin not permitted`.

Most §28 obligations (consent, human-in-the-loop, isolation) cannot surface as wire errors — they
are host responsibilities. See [Authorization](./authorization.md) for the full OAuth 2.1 + PKCE
flow and [Conformance](./conformance.md) for how these MUSTs fold into the conformance contract.
