"""Authorization helpers for a protected MCP resource (§23, OAuth 2.1).

A protected MCP server validates a bearer token on every request and rejects an
unauthenticated/invalid one with ``401`` + a ``WWW-Authenticate`` challenge that
points at its Protected Resource Metadata (RFC 9728). The validated identity is
threaded into the tool context as ``ctx.auth_info``.

These helpers are transport-shaped to the :func:`mcp.server.asgi.create_asgi_mcp_handler`
``auth_gate`` contract — ``gate(request) -> verdict`` — so a server only supplies a
``validate(token) -> auth_info | None`` callback plus its resource/audience identity.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from starlette.requests import Request


def build_protected_resource_metadata(
  *,
  resource: str,
  authorization_servers: list[str],
  scopes: list[str],
) -> dict:
  """Build RFC 9728 Protected Resource Metadata for a protected MCP resource. (§23.4)"""
  return {
    "resource": resource,
    "authorization_servers": list(authorization_servers),
    "scopes_supported": list(scopes),
    "bearer_methods_supported": ["header"],
  }


def _challenge(resource_metadata_url: str, description: str) -> dict:
  """Build a ``401`` verdict carrying the ``WWW-Authenticate`` bearer challenge. (§23.3)"""
  www = (
    f'Bearer resource_metadata="{resource_metadata_url}", '
    f'error="invalid_token", error_description="{description}"'
  )
  return {
    "ok": False,
    "status": 401,
    "wwwAuthenticate": www,
    "body": {"error": "invalid_token", "error_description": description},
  }


def bearer_auth_gate(
  *,
  resource_metadata_url: str,
  expected_audience: str | None,
  validate: Callable[[str], dict | None],
) -> Callable[[Request], dict]:
  """Build an ``auth_gate`` that enforces a valid, audience-bound bearer token.

  * ``validate(token)`` returns the caller's ``auth_info`` (e.g.
    ``{"clientId", "scopes", "aud", "expiresAt"}``) or ``None`` for an invalid token.
  * ``expected_audience`` binds the token's audience to this resource (§23.6); a
    mismatch is rejected as ``invalid_token``.

  The returned verdict is consumed by the ASGI handler: ``{"ok": True, "authInfo"}``
  on success, or a ``401`` challenge otherwise.
  """

  def gate(request: Request) -> dict:
    header = request.headers.get("authorization") or ""
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not token:
      return _challenge(resource_metadata_url, "missing bearer token")
    info = validate(token)
    if info is None:
      return _challenge(resource_metadata_url, "invalid or expired token")
    aud: Any = info.get("aud") if isinstance(info, dict) else None
    if expected_audience is not None and aud is not None and aud != expected_audience:
      return _challenge(resource_metadata_url, "token audience does not bind to this resource")
    return {"ok": True, "authInfo": info}

  return gate
