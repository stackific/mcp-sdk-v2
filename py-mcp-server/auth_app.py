"""OAuth 2.1 Authorization Server + a protected MCP resource (FastAPI).

Two roles on one port (the Python counterpart to ``ts-mcp-server``'s ``auth.ts``):

* **Authorization Server** (issuer): metadata, dynamic client registration, token.
* **Protected Resource**: a real MCP server (served via the SDK's ASGI handler) that
  rejects unauthenticated requests with ``401`` + ``WWW-Authenticate``, and on a valid
  Bearer token threads the identity into the tool ``ctx.auth_info``.

Built on ``stackific-mcp``: this file declares no protocol abstractions, only the OAuth
endpoints + feature wiring.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time

from fastapi import FastAPI, Request, Response

from mcp.server import (
  McpServer,
  bearer_auth_gate,
  build_protected_resource_metadata,
  create_asgi_mcp_handler,
)

SCOPE = "mcp:tools"


def _b64url(data: bytes) -> str:
  return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _sha256_b64url(value: str) -> str:
  return _b64url(hashlib.sha256(value.encode("ascii")).digest())


def create_auth_app(*, issuer: str, resource: str) -> FastAPI:
  """Build the Authorization Server + protected MCP resource as a FastAPI app."""
  clients: dict[str, dict] = {}
  tokens: dict[str, dict] = {}
  auth_codes: dict[str, dict] = {}
  prm_url = f"{issuer}/.well-known/oauth-protected-resource"

  # A seeded confidential client so a demo can skip DCR if it wants to.
  clients["companion-demo-client"] = {
    "clientId": "companion-demo-client",
    "clientSecret": "companion-demo-secret",
    "name": "Companion Demo Client",
    "grantTypes": ["client_credentials", "authorization_code"],
  }

  # ── Protected MCP server (identity-aware tools), built on the SDK runtime ──
  protected = McpServer(
    {"name": "protected-mcp-server", "title": "Protected MCP Server", "version": "0.1.0"},
    {"tools": {}},
  )

  def whoami(args: dict, ctx) -> dict:
    info = ctx.auth_info or {}
    client_id = info.get("clientId", "unknown")
    scopes = info.get("scopes", [])
    return {
      "content": [{"type": "text", "text": f"Authenticated as {client_id} with scopes [{', '.join(scopes)}]."}],
      "structuredContent": {"clientId": info.get("clientId"), "scopes": scopes, "expiresAt": info.get("expiresAt")},
    }

  protected.register_tool(
    "whoami", whoami, title="Who am I", description="Returns the validated OAuth identity the server sees (ctx.auth_info)."
  )
  protected.register_tool(
    "get_secret",
    lambda args, ctx: {"content": [{"type": "text", "text": "🔐 The launch codes are 0000 (do not tell anyone)."}]},
    title="Get Secret",
    description="Returns protected data that only an authorized caller may read.",
  )

  def issue(client_id: str) -> dict:
    token = _b64url(secrets.token_bytes(32))
    record = {"token": token, "clientId": client_id, "scope": SCOPE, "audience": resource, "expiresAt": time.time() + 3600}
    tokens[token] = record
    return record

  def validate(token: str) -> dict | None:
    record = tokens.get(token)
    if record is None or record["expiresAt"] < time.time():
      return None
    return {
      "token": record["token"],
      "clientId": record["clientId"],
      "scopes": record["scope"].split(" "),
      "aud": record["audience"],
      "expiresAt": int(record["expiresAt"]),
    }

  gate = bearer_auth_gate(resource_metadata_url=prm_url, expected_audience=resource, validate=validate)
  mcp_handler = create_asgi_mcp_handler(protected, auth_gate=gate)

  app = FastAPI(title="py-mcp-server-auth")

  @app.get("/health")
  def health() -> dict:
    return {"status": "ok", "role": "auth+protected-resource"}

  @app.get("/.well-known/oauth-authorization-server")
  def as_metadata() -> dict:
    return {
      "issuer": issuer,
      "authorization_endpoint": f"{issuer}/authorize",
      "token_endpoint": f"{issuer}/token",
      "registration_endpoint": f"{issuer}/register",
      "scopes_supported": [SCOPE],
      "response_types_supported": ["code"],
      "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
      "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic", "none"],
      "code_challenge_methods_supported": ["S256"],
    }

  @app.get("/.well-known/oauth-protected-resource")
  def prm() -> dict:
    return build_protected_resource_metadata(resource=resource, authorization_servers=[issuer], scopes=[SCOPE])

  @app.post("/register")
  async def register(request: Request) -> Response:
    body = await request.json()
    client_id = f"dcr-{secrets.token_hex(8)}"
    client_secret = secrets.token_hex(24)
    grant_types = body.get("grant_types") or ["authorization_code"]
    clients[client_id] = {"clientId": client_id, "clientSecret": client_secret, "name": body.get("client_name"), "grantTypes": grant_types}
    return _json(
      201,
      {
        "client_id": client_id,
        "client_secret": client_secret,
        "client_id_issued_at": int(time.time()),
        "grant_types": grant_types,
        "token_endpoint_auth_method": "none",
        "client_name": body.get("client_name", "Dynamically Registered Client"),
        "redirect_uris": body.get("redirect_uris") or [],
      },
    )

  @app.post("/token")
  async def token(request: Request) -> Response:
    # Parse the application/x-www-form-urlencoded body directly (no python-multipart dep).
    from urllib.parse import parse_qs

    raw = (await request.body()).decode("utf-8")
    form = {k: v[0] for k, v in parse_qs(raw).items()}
    grant = form.get("grant_type", "")
    client_id = form.get("client_id", "")

    if grant == "authorization_code":
      code = form.get("code", "")
      verifier = form.get("code_verifier", "")
      redirect_uri = form.get("redirect_uri", "")
      record = auth_codes.pop(code, None)  # single-use
      if record is None:
        return _json(400, {"error": "invalid_grant", "error_description": "Unknown or expired authorization code"})
      if record["redirectUri"] and record["redirectUri"] != redirect_uri:
        return _json(400, {"error": "invalid_grant", "error_description": "redirect_uri mismatch"})
      ok = (
        _sha256_b64url(verifier) == record["codeChallenge"]
        if record["codeChallengeMethod"] == "S256"
        else verifier == record["codeChallenge"]
      )
      if not ok:
        return _json(400, {"error": "invalid_grant", "error_description": "PKCE verification failed"})
      issued = issue(record["clientId"] or client_id)
      return _json(200, {"access_token": issued["token"], "token_type": "Bearer", "expires_in": 3600, "scope": SCOPE})

    if grant == "client_credentials":
      client_secret = form.get("client_secret", "")
      client = clients.get(client_id)
      if client is None or client["clientSecret"] != client_secret:
        return _json(401, {"error": "invalid_client", "error_description": "Unknown client or bad secret"})
      issued = issue(client_id)
      return _json(200, {"access_token": issued["token"], "token_type": "Bearer", "expires_in": 3600, "scope": SCOPE})

    return _json(400, {"error": "unsupported_grant_type", "error_description": f"grant_type {grant} not supported"})

  @app.get("/authorize")
  def authorize(request: Request) -> Response:
    q = request.query_params
    code = _b64url(secrets.token_bytes(16))
    auth_codes[code] = {
      "clientId": q.get("client_id", ""),
      "redirectUri": q.get("redirect_uri", ""),
      "codeChallenge": q.get("code_challenge", ""),
      "codeChallengeMethod": q.get("code_challenge_method", "plain"),
    }
    redirect_uri = q.get("redirect_uri", "")
    state = q.get("state", "")
    if redirect_uri:
      sep = "&" if "?" in redirect_uri else "?"
      location = f"{redirect_uri}{sep}code={code}"
      if state:
        location += f"&state={state}"
      return Response(status_code=302, headers={"Location": location})
    return _json(200, {"code": code, "state": state})

  @app.api_route("/mcp", methods=["GET", "POST", "OPTIONS"])
  async def mcp(request: Request) -> Response:
    return await mcp_handler(request)

  return app


def _json(status: int, payload: dict) -> Response:
  import json

  return Response(content=json.dumps(payload), status_code=status, media_type="application/json")
