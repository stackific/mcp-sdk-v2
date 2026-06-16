"""OAuth 2.1 client helpers for the MCP authorization flow (§23, RFC 8414/7591/9728).

The pieces a client host needs to authenticate against a protected MCP resource:
PKCE generation, metadata discovery (protected-resource → authorization-server, with
issuer verification), dynamic client registration, the authorize-URL builder, the
authorization-code token exchange (audience-bound via the RFC 8707 ``resource``
parameter), and redirect verification (CSRF ``state`` + mix-up ``iss``).
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import httpx


def _b64url(data: bytes) -> str:
  """Base64url-encode without padding."""
  return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_pkce_pair() -> dict:
  """Generate a PKCE ``{code_verifier, code_challenge}`` pair using S256. (§23.5)"""
  verifier = _b64url(secrets.token_bytes(32))
  challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
  return {"code_verifier": verifier, "code_challenge": challenge}


def discover_oauth_metadata(*, resource: str, resource_metadata_url: str, timeout: float = 10.0) -> dict:
  """Discover protected-resource → authorization-server metadata (RFC 9728 → RFC 8414).

  Returns ``{issuer, authorization_server, protected_resource}``. The AS issuer is
  taken from the protected-resource metadata (mix-up defense, §23.3).
  """
  with httpx.Client(timeout=timeout) as client:
    prm = client.get(resource_metadata_url).raise_for_status().json()
    servers = prm.get("authorization_servers") or []
    if not servers:
      raise ValueError("protected-resource metadata advertises no authorization_servers")
    issuer = servers[0]
    as_meta = client.get(f"{issuer.rstrip('/')}/.well-known/oauth-authorization-server").raise_for_status().json()
  return {"issuer": issuer, "authorization_server": as_meta, "protected_resource": prm}


def register_client(as_meta: dict, *, client_name: str, redirect_uris: list[str], timeout: float = 10.0) -> dict:
  """Dynamically register a client (RFC 7591). Returns ``{clientId, ...}``. (§23.7)"""
  endpoint = as_meta.get("registration_endpoint")
  if not endpoint:
    raise ValueError("authorization-server metadata has no registration_endpoint")
  body = {
    "client_name": client_name,
    "redirect_uris": redirect_uris,
    "grant_types": ["authorization_code"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
    "application_type": "web",
  }
  with httpx.Client(timeout=timeout) as client:
    resp = client.post(endpoint, json=body).raise_for_status().json()
  return {"clientId": resp.get("client_id"), **resp}


def build_authorize_url(
  as_meta: dict,
  *,
  client_id: str,
  redirect_uri: str,
  resource: str,
  scope: str,
  state: str,
  code_challenge: str,
) -> str:
  """Build the authorization-request URL with PKCE (S256) and the RFC 8707 ``resource``. (§23.5)"""
  endpoint = as_meta.get("authorization_endpoint")
  if not endpoint:
    raise ValueError("authorization-server metadata has no authorization_endpoint")
  query = urlencode(
    {
      "response_type": "code",
      "client_id": client_id,
      "redirect_uri": redirect_uri,
      "scope": scope,
      "state": state,
      "code_challenge": code_challenge,
      "code_challenge_method": "S256",
      "resource": resource,
    }
  )
  sep = "&" if "?" in endpoint else "?"
  return f"{endpoint}{sep}{query}"


def exchange_authorization_code(
  as_meta: dict,
  *,
  client_id: str,
  code: str,
  code_verifier: str,
  redirect_uri: str,
  resource: str,
  timeout: float = 10.0,
) -> dict:
  """Exchange an authorization code for an access token (authorization_code + PKCE). (§23.5)"""
  endpoint = as_meta.get("token_endpoint")
  if not endpoint:
    raise ValueError("authorization-server metadata has no token_endpoint")
  form = {
    "grant_type": "authorization_code",
    "code": code,
    "redirect_uri": redirect_uri,
    "client_id": client_id,
    "code_verifier": code_verifier,
    "resource": resource,
  }
  with httpx.Client(timeout=timeout) as client:
    resp = client.post(endpoint, data=form).raise_for_status().json()
  return resp


def verify_authorization_redirect(
  *,
  sent_state: str,
  returned_state: str | None,
  issuer: str,
  returned_iss: str | None,
  iss_parameter_supported: bool,
) -> None:
  """Verify the redirect ``state`` (CSRF) and, when advertised, ``iss`` (mix-up). (§23.5/§23.7)

  Raises ``ValueError`` on a mismatch.
  """
  if returned_state != sent_state:
    raise ValueError("authorization redirect state mismatch (possible CSRF)")
  if iss_parameter_supported and returned_iss is not None and returned_iss != issuer:
    raise ValueError("authorization redirect iss mismatch (possible mix-up)")
