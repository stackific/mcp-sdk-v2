"""Server-side authorization glue for a protected MCP resource (§23, OAuth 2.1).

A protected MCP server validates a bearer token on every request and rejects an
unauthenticated/invalid one with ``401`` + a ``WWW-Authenticate`` challenge that points
at its Protected Resource Metadata (RFC 9728); a valid token that lacks a required scope
yields the ``403 insufficient_scope`` step-up challenge instead. The validated identity is
threaded into the tool context as ``ctx.auth_info``.

This module is the Python counterpart of ``ts-sdk/src/server/auth.ts``: it turns a
``validate(token) -> auth_info`` callback into an ``auth_gate`` for
:func:`mcp.server.asgi.create_asgi_mcp_handler` — ``gate(request) -> verdict`` — emitting
the spec-required challenges, and it builds the protected-resource metadata document. It
deliberately reuses :func:`mcp.protocol.authorization.build_insufficient_scope_response`
for the ``403`` so the wire shape matches the client-facing parser exactly.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from starlette.requests import Request

from mcp.protocol.authorization import (
  build_insufficient_scope_response,
  resource_identifiers_equal,
  strip_default_trailing_slash,
)

# ─── §23.6 Audience binding helpers ───────────────────────────────────────────


def _audience_covers(token_audience: str | list[str], resource: str) -> bool:
  """Return ``True`` when a token's audience covers ``resource``. (§23.6, R-23.6-g)

  Delegates to the S35 canonical comparator :func:`resource_identifiers_equal` so the
  server gate binds audiences exactly as the §23/S37 protocol layer does, from one source
  of truth: scheme and host are compared case-insensitively for robustness (R-23.1-p) —
  which a naive string compare would miss — while path/query/port stay exact. Both sides
  are first reduced to their trailing-slash-free form, since the slash is not significant
  here (R-23.1-s), so ``…/mcp`` and ``…/mcp/`` denote the same resource. The audience may be
  a single string or an array — covering holds if ANY entry matches.
  """
  target = strip_default_trailing_slash(resource)
  candidates = token_audience if isinstance(token_audience, list) else [token_audience]
  return any(
    isinstance(a, str) and resource_identifiers_equal(strip_default_trailing_slash(a), target)
    for a in candidates
  )


def _audience_of(auth_info: Any) -> str | list[str] | None:
  """Read the token audience (``aud`` or ``audience``) from a validated authInfo object."""
  if not isinstance(auth_info, dict):
    return None
  aud = auth_info.get("aud", auth_info.get("audience"))
  return aud if isinstance(aud, (str, list)) else None


def _scopes_of(auth_info: Any) -> list[str]:
  """Read the granted scopes (``scopes`` array or space-delimited ``scope``) from authInfo."""
  if not isinstance(auth_info, dict):
    return []
  scopes = auth_info.get("scopes")
  if isinstance(scopes, list):
    return [s for s in scopes if isinstance(s, str)]
  scope = auth_info.get("scope")
  if isinstance(scope, str):
    return [s for s in re.split(r"\s+", scope) if s]
  return []


# ─── §23.2 Protected Resource Metadata (RFC 9728) ─────────────────────────────

def build_protected_resource_metadata(
  *,
  resource: str,
  authorization_servers: list[str],
  scopes: list[str] | None = None,
  bearer_methods: list[str] | None = None,
) -> dict:
  """Build an RFC 9728 Protected Resource Metadata document. (§23.2)

  * ``resource`` is the canonical resource identifier (the MCP endpoint URL); it MUST
    equal the server's canonical resource identifier.
  * ``authorization_servers`` MUST contain at least one issuer URL protecting the resource.
  * ``scopes`` (OPTIONAL) — the scopes the resource recognizes; ``scopes_supported`` is
    emitted only when supplied.
  * ``bearer_methods`` (OPTIONAL) — supported bearer-token delivery methods, defaulting to
    ``["header"]``.
  """
  metadata: dict = {
    "resource": resource,
    "authorization_servers": list(authorization_servers),
    "bearer_methods_supported": list(bearer_methods) if bearer_methods is not None else ["header"],
  }
  if scopes is not None:
    metadata["scopes_supported"] = list(scopes)
  return metadata


# ─── §23.1 401 invalid_token challenge ────────────────────────────────────────

def _challenge_401(resource_metadata_url: str | None, description: str) -> dict:
  """Build a ``401 invalid_token`` verdict carrying the ``WWW-Authenticate`` challenge.

  The ``resource_metadata`` parameter leads when a metadata URL is configured, followed by
  ``error="invalid_token"`` and ``error_description``. (§23.1, R-23.1-t – R-23.1-v)
  """
  parts = [
    f'resource_metadata="{resource_metadata_url}"' if resource_metadata_url else "",
    'error="invalid_token"',
    f'error_description="{description}"',
  ]
  www = "Bearer " + ", ".join(p for p in parts if p)
  return {
    "ok": False,
    "status": 401,
    "wwwAuthenticate": www,
    "body": {"error": "invalid_token", "error_description": description},
  }


# ─── §23.8 Bearer auth gate ───────────────────────────────────────────────────

def bearer_auth_gate(
  *,
  resource_metadata_url: str | None = None,
  expected_audience: str | None = None,
  required_scopes: list[str] | None = None,
  validate: Callable[[str], Any],
) -> Callable[[Request], dict]:
  """Build an ``auth_gate`` that requires a valid, audience-bound ``Bearer`` token. (§23.8)

  * ``validate(token)`` returns the caller's ``auth_info`` (threaded into ``ctx.auth_info``)
    or a falsey value (``None``/``False``) to reject. When audience/scope enforcement is
    enabled it should expose the token's ``aud``/``audience`` and ``scope`` (space-delimited
    string) / ``scopes`` (array) so they can be checked.
  * ``resource_metadata_url`` (OPTIONAL) — advertised via ``resource_metadata`` in the
    challenge. REQUIRED in practice when ``required_scopes`` is set (the ``403`` step-up
    challenge MUST carry ``resource_metadata``). (§23.18, R-23.1-ab)
  * ``expected_audience`` (OPTIONAL) — when set, the validated token's audience MUST include
    it or the request is rejected ``401 invalid_token``; a server MUST reject a token not
    issued for it and never forward it. (§23.6/§23.8/§23.19)
  * ``required_scopes`` (OPTIONAL) — scopes this resource requires; a token missing any is
    rejected with a ``403 insufficient_scope`` step-up challenge. (§23.18)

  On a missing / invalid / wrong-audience token the verdict is the ``401`` challenge; on a
  missing required scope it is the ``403 insufficient_scope`` step-up challenge; otherwise
  ``{"ok": True, "authInfo": <auth_info>}``. Consumed by the ASGI handler. (§23.1, §23.6,
  §23.18)
  """

  def gate(request: Request) -> dict:
    header = request.headers.get("authorization") or ""
    token = header[len("Bearer "):].strip() if header.startswith("Bearer ") else ""
    auth_info = validate(token) if token else None
    if not auth_info:
      return _challenge_401(resource_metadata_url, "Missing or invalid access token")

    # Audience binding (§23.6/§23.8/§23.19): reject a token not issued for this resource.
    if expected_audience is not None:
      aud = _audience_of(auth_info)
      if aud is None or not _audience_covers(aud, expected_audience):
        return _challenge_401(resource_metadata_url, "Access token was not issued for this resource")

    # Step-up (§23.18): a missing required scope yields a 403 insufficient_scope challenge.
    if required_scopes:
      granted = _scopes_of(auth_info)
      missing = [s for s in required_scopes if s not in granted]
      if missing:
        step_up = build_insufficient_scope_response(
          scope=" ".join(required_scopes),
          resource_metadata=resource_metadata_url or "",
          error_description=f"Missing required scope(s): {' '.join(missing)}",
        )
        return {
          "ok": False,
          "status": step_up.status,
          "wwwAuthenticate": step_up.headers["WWW-Authenticate"],
          "body": {
            "error": "insufficient_scope",
            "error_description": f"Missing scope(s): {' '.join(missing)}",
          },
        }

    return {"ok": True, "authInfo": auth_info}

  return gate
