"""Drives the full MCP authorization handshake against the demo Authorization Server +
protected resource, emitting a debug frame for every hop so the SPA can show the OAuth
2.1 dance under the hood:

  1. unauthenticated call → 401 + WWW-Authenticate
  2. fetch protected-resource metadata (RFC 9728)
  3. fetch authorization-server metadata (RFC 8414, issuer verified)
  4. dynamic client registration (RFC 7591)
  5. authorization request with PKCE (S256) → authorization code
  6. token via authorization_code + code_verifier (OAuth 2.1 / PKCE)
  7. authorized MCP tools/call (whoami) — the server sees ctx.auth_info
"""

from __future__ import annotations

import re
import uuid

import httpx

from mcp.client import (
  Client,
  StreamableHttpClientTransport,
  build_authorize_url,
  create_pkce_pair,
  discover_oauth_metadata,
  exchange_authorization_code,
  register_client,
  verify_authorization_redirect,
)

from config import AUTH_SERVER_URL, FRONTEND_URL
from debug_bus import bus

PROTECTED_MCP = f"{AUTH_SERVER_URL}/mcp"
REDIRECT_URI = f"{FRONTEND_URL}/oauth/callback"


def _mask(token: str | None) -> str:
  return f"{token[:6]}…{token[-4:]} ({len(token)} chars)" if token else "—"


def _note(direction: str, summary: str, payload: object = None) -> None:
  bus.emit_frame({"dir": direction, "kind": "note", "method": "oauth", "summary": summary, "payload": payload, "trace": "authorization"})


def run_auth_flow() -> dict:
  """Run the seven-step OAuth 2.1 + PKCE flow and return the step trace + identity."""
  steps: list[dict] = []

  def add(step: dict) -> None:
    steps.append(step)
    _note("recv", f"{step['n']}. {step['title']} → {step['status']}", step.get("detail"))

  # 1. Unauthenticated probe → expect 401 with a WWW-Authenticate challenge.
  _note("send", "1. unauthenticated initialize → protected resource", {"url": PROTECTED_MCP})
  probe = httpx.post(
    PROTECTED_MCP,
    headers={"content-type": "application/json", "accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2026-07-28"},
    json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2026-07-28", "capabilities": {}, "clientInfo": {"name": "probe", "version": "0"}}},
    timeout=10.0,
  )
  www_auth = probe.headers.get("www-authenticate", "")
  add({"n": 1, "title": "Unauthenticated call (expect 401)", "method": "POST", "url": PROTECTED_MCP, "status": probe.status_code, "detail": {"wwwAuthenticate": www_auth}})

  # 2–3. Discover protected-resource + authorization-server metadata (RFC 9728 → RFC 8414).
  match = re.search(r'resource_metadata="([^"]+)"', www_auth)
  prm_url = match.group(1) if match else f"{AUTH_SERVER_URL}/.well-known/oauth-protected-resource"
  _note("send", "2. discover protected-resource → authorization-server metadata (SDK)", {"resourceMetadataUrl": prm_url})
  discovered = discover_oauth_metadata(resource=PROTECTED_MCP, resource_metadata_url=prm_url)
  issuer = discovered["issuer"]
  as_meta = discovered["authorization_server"]
  add({"n": 2, "title": "Protected-resource metadata (RFC 9728)", "method": "GET", "url": prm_url, "status": 200, "detail": discovered["protected_resource"]})
  add(
    {
      "n": 3,
      "title": "Authorization-server metadata (RFC 8414, issuer verified)",
      "method": "GET",
      "url": f"{issuer}/.well-known/oauth-authorization-server",
      "status": 200,
      "detail": {
        "issuer": issuer,
        "authorization_endpoint": as_meta.get("authorization_endpoint"),
        "token_endpoint": as_meta.get("token_endpoint"),
        "registration_endpoint": as_meta.get("registration_endpoint"),
        "code_challenge_methods_supported": as_meta.get("code_challenge_methods_supported"),
      },
    }
  )

  # 4. Dynamic client registration (SDK).
  _note("send", "4. dynamic client registration (SDK)", {"url": as_meta.get("registration_endpoint")})
  reg = register_client(as_meta, client_name="Companion SPA", redirect_uris=[REDIRECT_URI])
  add({"n": 4, "title": "Dynamic client registration (RFC 7591)", "method": "POST", "url": as_meta.get("registration_endpoint"), "status": 201, "detail": {"client_id": reg["clientId"], "redirect_uris": [REDIRECT_URI]}})

  # 5. PKCE + the SDK-built authorize URL → auth code (manual redirect capture).
  pkce = create_pkce_pair()
  state = str(uuid.uuid4())
  authorize_url = build_authorize_url(
    as_meta, client_id=reg["clientId"], redirect_uri=REDIRECT_URI, resource=PROTECTED_MCP, scope="mcp:tools", state=state, code_challenge=pkce["code_challenge"]
  )
  _note("send", "5. GET authorize (PKCE S256, SDK URL)", {"url": authorize_url, "code_challenge": pkce["code_challenge"]})
  auth_res = httpx.get(authorize_url, follow_redirects=False, timeout=10.0)
  location = auth_res.headers.get("location", "")
  from urllib.parse import parse_qs, urlparse

  qs = parse_qs(urlparse(location).query) if location else {}
  code = qs.get("code", [""])[0]
  verify_authorization_redirect(
    sent_state=state,
    returned_state=qs.get("state", [None])[0],
    issuer=issuer,
    returned_iss=qs.get("iss", [None])[0],
    iss_parameter_supported=as_meta.get("authorization_response_iss_parameter_supported") is True,
  )
  add({"n": 5, "title": "Authorization request + PKCE → code (state/iss verified)", "method": "GET", "url": f"{issuer}/authorize", "status": auth_res.status_code, "detail": {"redirected_to": location, "code": _mask(code), "state": state}})

  # 6. Token exchange (SDK; audience-bound by the RFC 8707 resource param).
  _note("send", "6. token exchange (authorization_code + PKCE, SDK)", {"url": as_meta.get("token_endpoint")})
  token_json = exchange_authorization_code(as_meta, client_id=reg["clientId"], code=code, code_verifier=pkce["code_verifier"], redirect_uri=REDIRECT_URI, resource=PROTECTED_MCP)
  add({"n": 6, "title": "Token endpoint (authorization_code + PKCE, resource-bound)", "method": "POST", "url": as_meta.get("token_endpoint"), "status": 200, "detail": {"access_token": _mask(token_json.get("access_token")), "token_type": token_json.get("token_type"), "scope": token_json.get("scope"), "expires_in": token_json.get("expires_in")}})

  # 7. Authorized MCP call — connect with the bearer token and call whoami.
  _note("send", "7. authorized MCP connect + tools/call whoami", {"url": PROTECTED_MCP})
  access_token = token_json.get("access_token")
  transport = StreamableHttpClientTransport(PROTECTED_MCP, auth_provider=lambda: access_token)
  client = Client(transport, {"name": "companion-authorized-client", "version": "0.1.0"}, capabilities={})
  client.discover()
  whoami = client.call_tool("whoami", {})
  transport.close()
  auth_info = whoami.get("structuredContent")
  add({"n": 7, "title": "Authorized tools/call whoami", "method": "POST", "url": PROTECTED_MCP, "status": 200, "detail": auth_info})

  return {
    "steps": steps,
    "grant": "authorization_code + PKCE (S256)",
    "token": access_token,
    "tokenMasked": _mask(access_token),
    "scope": token_json.get("scope"),
    "authInfo": auth_info,
    "whoami": whoami,
  }
