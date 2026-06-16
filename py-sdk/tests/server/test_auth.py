"""Tests for the server-side authorization gate (§23, OAuth 2.1).

Mirrors the TS SDK's ``__tests__/server/auth-gate.test.ts`` (S5) — ``bearer_auth_gate``
audience binding (§23.6/§23.8/§23.19) and the ``403 insufficient_scope`` step-up challenge
(§23.18) — plus Python-specific edge cases and coverage of
:func:`build_protected_resource_metadata` (§23.2).
"""

import pytest
from starlette.requests import Request

from mcp.server.auth import bearer_auth_gate, build_protected_resource_metadata

RESOURCE_METADATA_URL = "https://srv.test/.well-known/oauth-protected-resource"
EXPECTED_AUDIENCE = "https://srv.test/mcp"


def req(token=None):
  """Build a Starlette ``Request`` carrying an optional ``Bearer`` token, mirroring the TS
  test's ``req`` helper.
  """
  headers = [] if token is None else [(b"authorization", f"Bearer {token}".encode())]
  return Request({"type": "http", "method": "POST", "path": "/mcp", "headers": headers})


def _validate(token):
  """The TS test's ``validate`` callback, ported exactly."""
  if token == "good":
    return {"sub": "u1", "aud": EXPECTED_AUDIENCE, "scope": "mcp:read mcp:write"}
  if token == "wrong-aud":
    return {"sub": "u1", "aud": "https://other.test/mcp", "scope": "mcp:read"}
  if token == "no-scope":
    return {"sub": "u1", "aud": EXPECTED_AUDIENCE, "scope": "mcp:write"}
  return None


def make_gate():
  return bearer_auth_gate(
    resource_metadata_url=RESOURCE_METADATA_URL,
    expected_audience=EXPECTED_AUDIENCE,
    required_scopes=["mcp:read"],
    validate=_validate,
  )


# ─── S5 — bearerAuthGate: audience + scope (§23) — TS parity ──────────────────

class TestBearerAuthGateAudienceAndScope:
  def test_accepts_token_with_right_audience_and_scope(self):
    v = make_gate()(req("good"))
    assert v["ok"] is True
    assert v["authInfo"]["sub"] == "u1"

  def test_401_invalid_token_when_no_token_is_presented(self):
    v = make_gate()(req())
    assert v["ok"] is False
    assert v["status"] == 401
    assert "invalid_token" in v["wwwAuthenticate"]

  def test_401_invalid_token_when_audience_does_not_match(self):
    v = make_gate()(req("wrong-aud"))
    assert v["status"] == 401
    assert v["body"]["error"] == "invalid_token"

  def test_403_insufficient_scope_step_up_when_required_scope_missing(self):
    v = make_gate()(req("no-scope"))
    assert v["status"] == 403
    assert v["body"]["error"] == "insufficient_scope"
    assert "insufficient_scope" in v["wwwAuthenticate"]
    assert "resource_metadata" in v["wwwAuthenticate"]
    assert "scope=" in v["wwwAuthenticate"]


# ─── Edge cases — token parsing & rejection ───────────────────────────────────

class TestTokenParsing:
  def test_unknown_token_is_401(self):
    v = make_gate()(req("bogus"))
    assert v["status"] == 401
    assert v["body"]["error"] == "invalid_token"

  def test_empty_bearer_token_is_401(self):
    # `Authorization: Bearer ` with no token must not be treated as authenticated.
    v = make_gate()(req(""))
    assert v["status"] == 401
    assert v["body"]["error"] == "invalid_token"

  def test_non_bearer_scheme_is_rejected(self):
    headers = [(b"authorization", b"Basic Zm9vOmJhcg==")]
    request = Request({"type": "http", "method": "POST", "path": "/mcp", "headers": headers})
    v = make_gate()(request)
    assert v["status"] == 401

  def test_bearer_scheme_is_case_sensitive_prefix(self):
    # The gate matches the exact `Bearer ` prefix (TS `header.startsWith('Bearer ')`).
    headers = [(b"authorization", b"bearer good")]
    request = Request({"type": "http", "method": "POST", "path": "/mcp", "headers": headers})
    v = make_gate()(request)
    assert v["status"] == 401

  def test_falsey_validate_result_is_rejected(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      expected_audience=None,
      validate=lambda token: False,
    )
    v = gate(req("anything"))
    assert v["status"] == 401
    assert v["body"]["error"] == "invalid_token"

  def test_challenge_body_carries_description(self):
    v = make_gate()(req())
    assert v["body"]["error_description"] == "Missing or invalid access token"
    assert 'error_description="Missing or invalid access token"' in v["wwwAuthenticate"]


# ─── Edge cases — audience binding (§23.6/§23.8/§23.19) ───────────────────────

class TestAudienceBinding:
  def test_missing_audience_is_rejected_when_expected(self):
    # §23.19: a server MUST reject a token whose audience does not match; a token with no
    # audience at all cannot be proven to bind to this resource and is rejected.
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      expected_audience=EXPECTED_AUDIENCE,
      validate=lambda token: {"sub": "u1"},
    )
    v = gate(req("t"))
    assert v["status"] == 401
    assert v["body"]["error"] == "invalid_token"
    assert "not issued for this resource" in v["body"]["error_description"]

  def test_array_audience_covering_is_accepted(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      expected_audience=EXPECTED_AUDIENCE,
      validate=lambda token: {"aud": ["https://other.test/mcp", EXPECTED_AUDIENCE]},
    )
    v = gate(req("t"))
    assert v["ok"] is True

  def test_array_audience_without_match_is_rejected(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      expected_audience=EXPECTED_AUDIENCE,
      validate=lambda token: {"aud": ["https://a.test", "https://b.test"]},
    )
    v = gate(req("t"))
    assert v["status"] == 401

  def test_trailing_slash_difference_is_tolerated(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      expected_audience=EXPECTED_AUDIENCE + "/",
      validate=lambda token: {"aud": EXPECTED_AUDIENCE},
    )
    v = gate(req("t"))
    assert v["ok"] is True

  def test_audience_field_variant_is_read(self):
    # The token may expose its audience under `audience` rather than `aud`.
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      expected_audience=EXPECTED_AUDIENCE,
      validate=lambda token: {"audience": EXPECTED_AUDIENCE},
    )
    v = gate(req("t"))
    assert v["ok"] is True

  def test_audience_not_enforced_when_unset(self):
    # With no expected_audience the gate accepts any validated token regardless of `aud`.
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      expected_audience=None,
      validate=lambda token: {"aud": "https://anything.test"},
    )
    v = gate(req("t"))
    assert v["ok"] is True


# ─── Edge cases — step-up / insufficient_scope (§23.18) ───────────────────────

class TestRequiredScopes:
  def test_scopes_array_variant_is_read(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      required_scopes=["mcp:read"],
      validate=lambda token: {"scopes": ["mcp:read", "mcp:write"]},
    )
    v = gate(req("t"))
    assert v["ok"] is True

  def test_missing_one_of_multiple_required_scopes_is_403(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      required_scopes=["mcp:read", "mcp:admin"],
      validate=lambda token: {"scope": "mcp:read"},
    )
    v = gate(req("t"))
    assert v["status"] == 403
    assert v["body"]["error"] == "insufficient_scope"
    assert "mcp:admin" in v["body"]["error_description"]

  def test_step_up_challenge_carries_full_required_scope_set(self):
    # The 403 WWW-Authenticate `scope` MUST be the union of required scopes (R-23.1-ac).
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      required_scopes=["mcp:read", "mcp:admin"],
      validate=lambda token: {"scope": "mcp:read"},
    )
    v = gate(req("t"))
    assert 'scope="mcp:read mcp:admin"' in v["wwwAuthenticate"]
    assert f'resource_metadata="{RESOURCE_METADATA_URL}"' in v["wwwAuthenticate"]

  def test_empty_required_scopes_does_not_step_up(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      required_scopes=[],
      validate=lambda token: {"aud": EXPECTED_AUDIENCE},
    )
    v = gate(req("t"))
    assert v["ok"] is True

  def test_no_required_scopes_does_not_step_up(self):
    gate = bearer_auth_gate(
      resource_metadata_url=RESOURCE_METADATA_URL,
      validate=lambda token: {"aud": EXPECTED_AUDIENCE},
    )
    v = gate(req("t"))
    assert v["ok"] is True


# ─── Edge cases — 401 challenge without a resource_metadata URL ───────────────

class TestChallengeWithoutMetadataUrl:
  def test_401_omits_resource_metadata_when_url_absent(self):
    gate = bearer_auth_gate(validate=lambda token: None)
    v = gate(req())
    assert v["status"] == 401
    assert "resource_metadata" not in v["wwwAuthenticate"]
    assert v["wwwAuthenticate"].startswith("Bearer ")
    assert "invalid_token" in v["wwwAuthenticate"]


# ─── §23.2 Protected Resource Metadata (RFC 9728) ─────────────────────────────

class TestBuildProtectedResourceMetadata:
  def test_minimal_document_defaults_bearer_methods(self):
    md = build_protected_resource_metadata(
      resource=EXPECTED_AUDIENCE,
      authorization_servers=["https://issuer.test"],
    )
    assert md["resource"] == EXPECTED_AUDIENCE
    assert md["authorization_servers"] == ["https://issuer.test"]
    assert md["bearer_methods_supported"] == ["header"]
    assert "scopes_supported" not in md

  def test_scopes_supported_emitted_when_provided(self):
    md = build_protected_resource_metadata(
      resource=EXPECTED_AUDIENCE,
      authorization_servers=["https://issuer.test"],
      scopes=["mcp:read", "mcp:write"],
    )
    assert md["scopes_supported"] == ["mcp:read", "mcp:write"]

  def test_bearer_methods_overridable(self):
    md = build_protected_resource_metadata(
      resource=EXPECTED_AUDIENCE,
      authorization_servers=["https://issuer.test"],
      bearer_methods=["header", "body"],
    )
    assert md["bearer_methods_supported"] == ["header", "body"]

  def test_inputs_are_copied_not_aliased(self):
    servers = ["https://issuer.test"]
    scopes = ["mcp:read"]
    md = build_protected_resource_metadata(
      resource=EXPECTED_AUDIENCE,
      authorization_servers=servers,
      scopes=scopes,
    )
    servers.append("https://evil.test")
    scopes.append("mcp:admin")
    assert md["authorization_servers"] == ["https://issuer.test"]
    assert md["scopes_supported"] == ["mcp:read"]


if __name__ == "__main__":
  raise SystemExit(pytest.main([__file__, "-v"]))
