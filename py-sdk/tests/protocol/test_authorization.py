"""Tests for OAuth 2.1 authorization (§23.1–§23.19).

Mirrors the TS SDK's ``authorization.test.ts`` (S35), ``authorization-flow.test.ts`` (S36),
and ``authorization-registration.test.ts`` (S37), plus additional Python-specific edge cases.

  - S35 — model, applicability & metadata discovery (§23.1–§23.3).
  - S36 — the auth-code+PKCE flow, tokens, audience binding & worked examples (§23.4–§23.10).
  - S37 — registration mechanisms, scopes & security (§23.11–§23.19).
"""

import hashlib

import pytest

from mcp.protocol.authorization import (
  AUTHORIZATION_BAD_REQUEST_STATUS,
  AUTHORIZATION_FORBIDDEN_STATUS,
  BEARER_AUTH_SCHEME,
  INSUFFICIENT_SCOPE_ERROR,
  OAUTH_AS_WELL_KNOWN,
  OPENID_CONFIGURATION_WELL_KNOWN,
  PROTECTED_RESOURCE_WELL_KNOWN,
  UNAUTHORIZED_STATUS,
  WWW_AUTHENTICATE_HEADER,
  AuthorizationServerRegistration,
  CredentialStore,
  WwwAuthenticateChallenge,
  authorization_applies_to,
  authorization_forbidden_for,
  authorization_server_well_known_uris,
  build_insufficient_scope_response,
  build_unauthorized_response,
  build_www_authenticate_value,
  canonicalize_resource_identifier,
  challenge_from_headers,
  challenged_scopes,
  credential_conveyance_for,
  is_authorization_server_metadata,
  is_insufficient_scope_challenge,
  is_protected_resource_metadata,
  is_valid_canonical_resource_identifier,
  parse_www_authenticate,
  protected_resource_well_known_uris,
  resolve_protected_resource_metadata_uris,
  resource_identifiers_equal,
  select_authorization_server,
  strip_default_trailing_slash,
  validate_authorization_server_metadata,
  validate_protected_resource_metadata,
)
from mcp.protocol.authorization_flow import (
  CLIENT_ID_MECHANISM_PRIORITY,
  CODE_CHALLENGE_METHOD_S256,
  CODE_VERIFIER_MAX_LENGTH,
  CODE_VERIFIER_MIN_LENGTH,
  GRANT_TYPE_AUTHORIZATION_CODE,
  GRANT_TYPE_REFRESH_TOKEN,
  OFFLINE_ACCESS_SCOPE,
  PKCE_UNRESERVED_RE,
  RESPONSE_TYPE_CODE,
  TOKEN_TYPE_BEARER,
  DynamicClientRegistrationCredential,
  DynamicClientRegistrationStore,
  PkceSupportError,
  PresentedToken,
  TokenValidationContext,
  advertised_scopes_exclude_offline_access,
  application_type_for,
  assert_pkce_support_confirmed,
  assert_resource_matches_step2,
  build_authorization_code_token_request,
  build_authorization_request,
  build_authorization_url,
  build_bearer_authorization_header,
  build_dynamic_client_registration_request,
  build_refresh_token_request,
  check_pre_registered_credentials,
  confirm_pkce_support,
  create_authorization_flow_record,
  create_pkce_challenge,
  derive_code_challenge,
  encode_token_request_body,
  extract_bearer_token,
  generate_code_verifier,
  generate_state,
  handle_dynamic_client_registration_response,
  has_no_refresh_token,
  is_client_id_metadata_document,
  is_dynamic_client_registration_request,
  is_dynamic_client_registration_response,
  is_pkce_support_confirmed,
  is_token_response,
  is_valid_cimd_client_id_url,
  is_valid_code_verifier,
  issuer_validation_decision,
  parse_authorization_response,
  parse_token_response,
  process_authorization_redirect,
  resolve_authorization_scope,
  resource_parameter_for,
  safe_authorization_error,
  select_client_id_mechanism,
  select_token_for_server,
  url_contains_access_token_in_query,
  validate_access_token_request,
  validate_client_id_metadata_document,
  validate_issuer,
  validate_token_audience,
  verify_pkce,
  verify_redirect_state,
  with_offline_access_scope,
)
from mcp.protocol.authorization_registration import (
  CLIENT_ID_METADATA_DOCUMENT_SUPPORTED_FIELD,
  PRIVATE_KEY_JWT_AUTH_METHOD,
  CimdCacheControl,
  CimdDocumentCache,
  IssuerBoundCredentials,
  IssuerBoundCredentialStore,
  ScopeUpgradeKey,
  ScopeUpgradeTracker,
  application_type_for_redirect_uris,
  authorization_server_metadata_uris,
  check_bearer_header_only,
  check_resource_parameter_binding,
  cimd_is_preferred_path,
  cimd_supports_private_key_jwt,
  decide_credential_binding,
  format_scope_set,
  grant_types_with_refresh,
  is_cimd_client_id_hosting_valid,
  is_confidential_token,
  issuers_match_exactly,
  may_attempt_cimd,
  may_attempt_dcr,
  may_forward_token_to_server,
  parse_scope_set,
  plan_step_up_authorization,
  protected_resource_metadata_uris,
  redact_token,
  refresh_token_is_never_assumed,
  register_with_retry,
  require_authorization_servers,
  same_request_record,
  select_initial_scopes,
  select_registration_mechanism,
  server_scopes_omit_offline_access,
  should_attempt_step_up,
  union_step_up_scopes,
  validate_discovered_issuer,
  validate_exact_issuer,
  with_offline_access_if_advertised,
)

PRM_URI = "https://mcp.example.com/.well-known/oauth-protected-resource"
RESOURCE = "https://mcp.example.com"
ISSUER = "https://auth.example.com"
REDIRECT_URI = "http://localhost:3000/callback"
CLIENT_ID = "https://app.example.com/oauth/client-metadata.json"

AS_BASE = {
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/authorize",
  "token_endpoint": "https://auth.example.com/token",
}


def fixed_bytes(fill: int):
  """A deterministic byte source for reproducible PKCE/state in tests."""
  return lambda size: bytes([fill]) * size


# ══════════════════════════════════════════════════════════════════════════════════
# S35 — Authorization I (§23.1–§23.3)
# ══════════════════════════════════════════════════════════════════════════════════


class TestApplicability:
  """AC-35.1 – AC-35.7 — applicability & credential conveyance (R-23.1-a – R-23.1-g)."""

  def test_applies_to_http_only(self):
    assert authorization_applies_to("http") is True
    assert authorization_applies_to("stdio") is False
    assert authorization_applies_to("other") is False

  def test_stdio_forbidden_env_credentials(self):
    assert authorization_forbidden_for("stdio") is True
    assert authorization_applies_to("stdio") is False
    assert credential_conveyance_for("stdio") == "environment"

  def test_other_transport_best_practice(self):
    assert authorization_applies_to("other") is False
    assert authorization_forbidden_for("other") is False
    assert credential_conveyance_for("other") == "best-practice"

  def test_http_uses_bearer(self):
    assert credential_conveyance_for("http") == "bearer"

  def test_http_not_forbidden(self):
    assert authorization_forbidden_for("http") is False


class TestCredentialIsolation:
  """AC-35.9 — per-issuer credential isolation (R-23.1-i/j/k/l)."""

  def test_stores_separate_state_per_issuer(self):
    store = CredentialStore()
    store.register(AuthorizationServerRegistration(issuer="https://auth1.example.com", client_id="c1", access_token="t1"))
    store.register(AuthorizationServerRegistration(issuer="https://auth2.example.com", client_id="c2", access_token="t2"))
    assert store.credentials_for("https://auth1.example.com").client_id == "c1"
    assert store.credentials_for("https://auth2.example.com").client_id == "c2"

  def test_does_not_return_another_issuers_credentials(self):
    store = CredentialStore()
    store.register(AuthorizationServerRegistration(issuer="https://auth1.example.com", access_token="t1"))
    assert store.credentials_for("https://auth2.example.com") is None
    assert store.has_credentials_for("https://auth2.example.com") is False

  def test_requires_reregistration_on_as_change(self):
    store = CredentialStore()
    store.register(AuthorizationServerRegistration(issuer="https://auth1.example.com", client_id="c1"))
    assert store.needs_reregistration("https://auth1.example.com", "https://auth2.example.com") is True
    assert store.needs_reregistration("https://auth1.example.com", "https://auth1.example.com") is False
    assert store.needs_reregistration(None, "https://auth2.example.com") is True

  def test_register_copies_so_mutation_does_not_leak(self):
    store = CredentialStore()
    reg = AuthorizationServerRegistration(issuer=ISSUER, client_id="c1")
    store.register(reg)
    reg.client_id = "mutated"
    assert store.credentials_for(ISSUER).client_id == "c1"
    # The returned copy is also detached from the store's internal entry.
    got = store.credentials_for(ISSUER)
    got.client_id = "also-mutated"
    assert store.credentials_for(ISSUER).client_id == "c1"


class TestCanonicalResourceIdentifier:
  """AC-35.10 – AC-35.12 — canonical resource id (R-23.1-m/n/o/p/q/r/s)."""

  def test_accepts_https_endpoint(self):
    r = canonicalize_resource_identifier("https://mcp.example.com/mcp")
    assert r.ok is True
    assert r.canonical == "https://mcp.example.com/mcp"

  def test_http_only_for_loopback(self):
    assert canonicalize_resource_identifier("http://localhost:3000/mcp").ok is True
    assert canonicalize_resource_identifier("http://127.0.0.1:3000/mcp").ok is True
    assert canonicalize_resource_identifier("http://mcp.example.com/mcp").ok is False

  def test_rejects_missing_scheme(self):
    assert is_valid_canonical_resource_identifier("mcp.example.com") is False

  def test_rejects_fragment(self):
    assert canonicalize_resource_identifier("https://mcp.example.com#fragment").ok is False

  def test_accepts_spec_examples(self):
    for uri in (
      "https://mcp.example.com/mcp",
      "https://mcp.example.com",
      "https://mcp.example.com:8443",
      "https://mcp.example.com/server/mcp",
    ):
      assert is_valid_canonical_resource_identifier(uri) is True

  def test_uppercase_scheme_host_canonicalized(self):
    r = canonicalize_resource_identifier("HTTPS://MCP.EXAMPLE.COM/mcp")
    assert r.ok is True
    assert r.canonical == "https://mcp.example.com/mcp"

  def test_uppercase_equality(self):
    assert resource_identifiers_equal("HTTPS://MCP.EXAMPLE.COM/mcp", "https://mcp.example.com/mcp") is True

  def test_path_case_sensitive(self):
    assert resource_identifiers_equal("https://mcp.example.com/MCP", "https://mcp.example.com/mcp") is False

  def test_keeps_path_component(self):
    r = canonicalize_resource_identifier("https://example.com/server/mcp")
    assert r.ok is True
    assert r.canonical == "https://example.com/server/mcp"

  def test_strips_non_significant_trailing_slash(self):
    assert strip_default_trailing_slash("https://mcp.example.com/mcp/") == "https://mcp.example.com/mcp"

  def test_preserves_significant_trailing_slash(self):
    assert strip_default_trailing_slash("https://mcp.example.com/mcp/", True) == "https://mcp.example.com/mcp/"

  def test_leaves_bare_host_root_slash(self):
    assert strip_default_trailing_slash("https://mcp.example.com/") == "https://mcp.example.com/"

  def test_strip_non_url_input(self):
    # A non-URL string falls back to a conservative strip that never empties.
    assert strip_default_trailing_slash("abc/") == "abc"
    assert strip_default_trailing_slash("/") == "/"

  def test_bare_host_and_trailing_slash_canonically_equal(self):
    assert resource_identifiers_equal("https://mcp.example.com", "https://mcp.example.com/") is True

  def test_equality_false_when_either_invalid(self):
    assert resource_identifiers_equal("not-a-uri", "https://mcp.example.com") is False


class TestUnauthorizedChallenge:
  """AC-35.13 – AC-35.14 — 401 challenge (R-23.1-t/u/v/w)."""

  def test_401_carries_bearer_and_resource_metadata(self):
    r = build_unauthorized_response(resource_metadata=PRM_URI)
    assert r.status == UNAUTHORIZED_STATUS == 401
    value = r.headers[WWW_AUTHENTICATE_HEADER]
    assert value.startswith(BEARER_AUTH_SCHEME)
    assert f'resource_metadata="{PRM_URI}"' in value

  def test_401_requires_resource_metadata(self):
    with pytest.raises(ValueError, match="resource_metadata"):
      build_unauthorized_response(resource_metadata="")

  def test_401_includes_scope_when_supplied(self):
    r = build_unauthorized_response(resource_metadata=PRM_URI, scope="files:read files:write")
    assert 'scope="files:read files:write"' in r.headers[WWW_AUTHENTICATE_HEADER]

  def test_401_omits_scope_when_absent(self):
    r = build_unauthorized_response(resource_metadata=PRM_URI)
    assert "scope=" not in r.headers[WWW_AUTHENTICATE_HEADER]


class TestChallengedScopes:
  """AC-35.15 — challenged scopes authoritative (R-23.1-x/y)."""

  def test_treats_challenged_scope_set_as_required(self):
    challenge = parse_www_authenticate('Bearer resource_metadata="x", scope="a b c"')
    assert challenged_scopes(challenge) == ["a", "b", "c"]

  def test_derives_scopes_solely_from_challenge(self):
    prm = {
      "resource": "https://mcp.example.com/mcp",
      "authorization_servers": ["https://a"],
      "scopes_supported": ["x", "y", "z"],
    }
    assert is_protected_resource_metadata(prm) is True
    challenge = parse_www_authenticate('Bearer scope="files:write"')
    assert challenged_scopes(challenge) == ["files:write"]
    assert "files:write" not in prm["scopes_supported"]

  def test_empty_when_no_scope(self):
    assert challenged_scopes(WwwAuthenticateChallenge(scheme="Bearer")) == []


class TestParseWwwAuthenticate:
  """AC-35.16 — client parses WWW-Authenticate (R-23.1-z)."""

  def test_parses_quoted_bearer_challenge(self):
    value = f'Bearer resource_metadata="{PRM_URI}", scope="files:read"'
    c = parse_www_authenticate(value)
    assert c is not None
    assert c.scheme == "Bearer"
    assert c.resource_metadata == PRM_URI
    assert c.scope == "files:read"

  def test_parses_bare_values(self):
    c = parse_www_authenticate("Bearer error=insufficient_scope, scope=files:write")
    assert c.error == "insufficient_scope"
    assert c.scope == "files:write"

  def test_unescapes_quotes(self):
    c = parse_www_authenticate('Bearer error_description="a \\"quoted\\" word"')
    assert c.error_description == 'a "quoted" word'

  def test_returns_none_for_non_bearer(self):
    assert parse_www_authenticate('Basic realm="x"') is None

  def test_extracts_from_case_insensitive_headers(self):
    c = challenge_from_headers({"www-authenticate": f'Bearer resource_metadata="{PRM_URI}"'})
    assert c.resource_metadata == PRM_URI
    assert challenge_from_headers({}) is None

  def test_scheme_match_case_insensitive(self):
    c = parse_www_authenticate('bearer scope="x"')
    assert c is not None
    assert c.scope == "x"

  def test_bare_scheme_no_params(self):
    c = parse_www_authenticate("Bearer")
    assert c is not None
    assert c.scope is None and c.error is None and c.resource_metadata is None


class TestInsufficientScope:
  """AC-35.17 — insufficient-scope 403 (R-23.1-aa/ab/ac/ad)."""

  def test_403_with_error_scope_metadata(self):
    r = build_insufficient_scope_response(
      scope="files:write",
      resource_metadata=PRM_URI,
      error_description="File write permission required for this operation",
    )
    assert r.status == AUTHORIZATION_FORBIDDEN_STATUS == 403
    value = r.headers[WWW_AUTHENTICATE_HEADER]
    assert f'error="{INSUFFICIENT_SCOPE_ERROR}"' in value
    assert 'scope="files:write"' in value
    assert f'resource_metadata="{PRM_URI}"' in value
    assert 'error_description="File write permission required for this operation"' in value

  def test_all_scopes_in_single_challenge(self):
    r = build_insufficient_scope_response(scope="files:read files:write", resource_metadata=PRM_URI)
    c = parse_www_authenticate(r.headers[WWW_AUTHENTICATE_HEADER])
    assert challenged_scopes(c) == ["files:read", "files:write"]
    assert is_insufficient_scope_challenge(c) is True

  def test_omits_error_description_when_absent(self):
    r = build_insufficient_scope_response(scope="files:write", resource_metadata=PRM_URI)
    assert "error_description=" not in r.headers[WWW_AUTHENTICATE_HEADER]

  def test_requires_scope_and_metadata(self):
    with pytest.raises(ValueError, match="scope"):
      build_insufficient_scope_response(scope="", resource_metadata=PRM_URI)
    with pytest.raises(ValueError, match="resource_metadata"):
      build_insufficient_scope_response(scope="x", resource_metadata="")

  def test_400_status_constant(self):
    assert AUTHORIZATION_BAD_REQUEST_STATUS == 400

  def test_not_insufficient_scope_when_no_error(self):
    assert is_insufficient_scope_challenge(WwwAuthenticateChallenge(scheme="Bearer")) is False


class TestProtectedResourceMetadata:
  """AC-35.8, AC-35.18 – AC-35.22 — PRM (R-23.1-h, R-23.2-a – R-23.2-j)."""

  def test_accepts_single_and_multiple_as(self):
    assert is_protected_resource_metadata(
      {"resource": "https://mcp.example.com/mcp", "authorization_servers": ["https://auth.example.com"]}
    ) is True
    assert is_protected_resource_metadata(
      {
        "resource": "https://mcp.example.com/mcp",
        "authorization_servers": ["https://auth1.example.com", "https://auth2.example.com"],
      }
    ) is True

  def test_header_and_well_known_mechanisms(self):
    assert resolve_protected_resource_metadata_uris(header_resource_metadata=PRM_URI) == [PRM_URI]
    from_wk = resolve_protected_resource_metadata_uris(endpoint_url="https://mcp.example.com/mcp")
    assert len(from_wk) > 0

  def test_header_uri_takes_precedence(self):
    uris = resolve_protected_resource_metadata_uris(
      header_resource_metadata="https://header.example.com/prm", endpoint_url="https://mcp.example.com/mcp"
    )
    assert uris == ["https://header.example.com/prm"]

  def test_well_known_order(self):
    assert protected_resource_well_known_uris("https://example.com/public/mcp") == [
      "https://example.com/.well-known/oauth-protected-resource/public/mcp",
      "https://example.com/.well-known/oauth-protected-resource",
    ]

  def test_well_known_root_only_when_no_path(self):
    assert protected_resource_well_known_uris("https://example.com") == [
      "https://example.com/.well-known/oauth-protected-resource"
    ]

  def test_well_known_suffix_constant(self):
    assert PROTECTED_RESOURCE_WELL_KNOWN == "/.well-known/oauth-protected-resource"

  def test_abort_fallback_empty(self):
    assert resolve_protected_resource_metadata_uris() == []
    assert resolve_protected_resource_metadata_uris(endpoint_url="not-a-uri") == []

  def test_validate_and_select(self):
    resource = "https://mcp.example.com/mcp"
    doc = {"resource": resource, "authorization_servers": ["https://auth1.example.com", "https://auth2.example.com"]}
    v = validate_protected_resource_metadata(doc, resource)
    assert v.ok is True
    assert select_authorization_server(v.metadata) == "https://auth1.example.com"
    assert (
      select_authorization_server(v.metadata, lambda i: i.endswith("auth2.example.com"))
      == "https://auth2.example.com"
    )

  def test_validate_accepts_uppercase_resource(self):
    resource = "https://mcp.example.com/mcp"
    doc = {"resource": "HTTPS://MCP.EXAMPLE.COM/mcp", "authorization_servers": ["https://a"]}
    assert validate_protected_resource_metadata(doc, resource).ok is True

  def test_validate_rejects_resource_mismatch(self):
    resource = "https://mcp.example.com/mcp"
    doc = {"resource": "https://other.example.com/mcp", "authorization_servers": ["https://a"]}
    assert validate_protected_resource_metadata(doc, resource).ok is False

  def test_rejects_missing_or_empty_as(self):
    resource = "https://mcp.example.com/mcp"
    assert is_protected_resource_metadata({"resource": resource}) is False
    assert is_protected_resource_metadata({"resource": resource, "authorization_servers": []}) is False

  def test_select_returns_first_when_no_prefer_match(self):
    meta = {"authorization_servers": ["https://a", "https://b"]}
    assert select_authorization_server(meta, lambda i: i == "https://zzz") == "https://a"

  def test_select_none_for_empty(self):
    assert select_authorization_server({"authorization_servers": []}) is None


class TestAuthorizationServerMetadata:
  """AC-35.23 – AC-35.27 — AS metadata (R-23.3-a – R-23.3-j)."""

  def test_well_known_covers_both_mechanisms(self):
    uris = authorization_server_well_known_uris("https://auth.example.com")
    assert any(OAUTH_AS_WELL_KNOWN in u for u in uris)
    assert any(OPENID_CONFIGURATION_WELL_KNOWN in u for u in uris)

  def test_well_known_path_order(self):
    assert authorization_server_well_known_uris("https://auth.example.com/tenant1") == [
      "https://auth.example.com/.well-known/oauth-authorization-server/tenant1",
      "https://auth.example.com/.well-known/openid-configuration/tenant1",
      "https://auth.example.com/tenant1/.well-known/openid-configuration",
    ]

  def test_well_known_no_path_order(self):
    assert authorization_server_well_known_uris("https://auth.example.com") == [
      "https://auth.example.com/.well-known/oauth-authorization-server",
      "https://auth.example.com/.well-known/openid-configuration",
    ]

  def test_issuer_match_accept_and_reject(self):
    base = {
      "authorization_endpoint": "https://honest.example/authorize",
      "token_endpoint": "https://honest.example/token",
    }
    assert validate_authorization_server_metadata({"issuer": "https://honest.example", **base}, "https://honest.example").ok is True
    assert (
      validate_authorization_server_metadata({"issuer": "https://honest.example", **base}, "https://attacker.example").ok
      is False
    )

  def test_requires_core_fields(self):
    assert is_authorization_server_metadata(AS_BASE) is True
    assert is_authorization_server_metadata({"issuer": "https://a", "token_endpoint": "https://a/t"}) is False
    assert is_authorization_server_metadata({"issuer": "https://a", "authorization_endpoint": "https://a/z"}) is False
    assert (
      is_authorization_server_metadata({"authorization_endpoint": "https://a/z", "token_endpoint": "https://a/t"})
      is False
    )

  def test_accepts_public_and_confidential_auth_methods(self):
    assert is_authorization_server_metadata({**AS_BASE, "token_endpoint_auth_methods_supported": ["none", "private_key_jwt"]}) is True

  def test_response_types_must_include_code(self):
    assert is_authorization_server_metadata({**AS_BASE, "response_types_supported": ["token"]}) is False
    assert is_authorization_server_metadata({**AS_BASE, "response_types_supported": ["code"]}) is True

  def test_code_challenge_methods_must_include_s256(self):
    assert is_authorization_server_metadata({**AS_BASE, "code_challenge_methods_supported": ["plain"]}) is False
    assert is_authorization_server_metadata({**AS_BASE, "code_challenge_methods_supported": ["S256"]}) is True

  def test_optional_fields_absent_ok(self):
    assert is_authorization_server_metadata(AS_BASE) is True

  def test_validate_rejects_refinement_failure(self):
    bad = {**AS_BASE, "response_types_supported": ["token"]}
    v = validate_authorization_server_metadata(bad, AS_BASE["issuer"])
    assert v.ok is False
    assert "code" in v.reason


class TestBuildWwwAuthenticateValue:
  def test_stable_order(self):
    value = build_www_authenticate_value(
      error="insufficient_scope", scope="a b", resource_metadata="https://m/prm", error_description="why"
    )
    assert value == 'Bearer error="insufficient_scope", scope="a b", resource_metadata="https://m/prm", error_description="why"'

  def test_bare_scheme(self):
    assert build_www_authenticate_value() == "Bearer"


# ══════════════════════════════════════════════════════════════════════════════════
# S36 — Authorization II (§23.4–§23.10)
# ══════════════════════════════════════════════════════════════════════════════════


class TestPkce:
  """AC-36.21, AC-36.22 — PKCE code_verifier & code_challenge (R-23.5-a/b)."""

  def test_generates_valid_verifier(self):
    verifier = generate_code_verifier()
    assert CODE_VERIFIER_MIN_LENGTH <= len(verifier) <= CODE_VERIFIER_MAX_LENGTH
    assert PKCE_UNRESERVED_RE.match(verifier) is not None
    assert is_valid_code_verifier(verifier) is True

  def test_high_entropy_distinct(self):
    seen = {generate_code_verifier() for _ in range(50)}
    assert len(seen) == 50

  def test_rejects_bad_verifiers(self):
    assert is_valid_code_verifier("a" * (CODE_VERIFIER_MIN_LENGTH - 1)) is False
    assert is_valid_code_verifier("a" * (CODE_VERIFIER_MAX_LENGTH + 1)) is False
    assert is_valid_code_verifier("a" * 50 + " space") is False
    assert is_valid_code_verifier("a" * 50 + "/slash") is False

  def test_derives_challenge(self):
    verifier = "a" * 43
    expected = (
      __import__("base64").urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode()
    )
    assert derive_code_challenge(verifier) == expected
    rfc_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    assert derive_code_challenge(rfc_verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

  def test_create_pkce_s256_roundtrip(self):
    pkce = create_pkce_challenge(fixed_bytes(7))
    assert pkce.code_challenge_method == CODE_CHALLENGE_METHOD_S256
    assert pkce.code_challenge == derive_code_challenge(pkce.code_verifier)
    assert verify_pkce(pkce.code_verifier, pkce.code_challenge) is True
    assert verify_pkce(pkce.code_verifier, "wrong-challenge") is False

  def test_derive_raises_on_invalid(self):
    with pytest.raises(ValueError):
      derive_code_challenge("too-short")

  def test_generate_raises_on_short_random(self):
    with pytest.raises(ValueError):
      generate_code_verifier(lambda size: b"")


class TestClientIdAcquisition:
  """AC-36.1 – AC-36.3 — client_id acquisition (R-23.4-a/b/c)."""

  def test_selects_one_mechanism_else_prompt(self):
    assert select_client_id_mechanism(["dcr"]) == "dcr"
    assert select_client_id_mechanism([]) == "prompt"

  def test_priority_order(self):
    assert CLIENT_ID_MECHANISM_PRIORITY == ("pre-registration", "cimd", "dcr", "prompt")
    assert select_client_id_mechanism(["dcr", "cimd", "pre-registration"]) == "pre-registration"
    assert select_client_id_mechanism(["dcr", "cimd"]) == "cimd"
    assert select_client_id_mechanism(["dcr", "prompt"]) == "dcr"

  def test_pre_registered_mismatch_surfaces_error(self):
    assert check_pre_registered_credentials(ISSUER, ISSUER).ok is True
    mismatch = check_pre_registered_credentials("https://other.example.com", ISSUER)
    assert mismatch.ok is False
    assert "mismatched" in mismatch.reason


class TestClientIdMetadataDocuments:
  """AC-36.4 – AC-36.12 — CIMD (R-23.4-d – R-23.4-l)."""

  DOC = {
    "client_id": CLIENT_ID,
    "client_name": "Example MCP Client",
    "redirect_uris": [REDIRECT_URI, "http://127.0.0.1:3000/callback"],
  }

  def test_https_url_with_path(self):
    assert is_valid_cimd_client_id_url(CLIENT_ID) is True
    assert is_valid_cimd_client_id_url("http://app.example.com/meta.json") is False
    assert is_valid_cimd_client_id_url("https://app.example.com") is False
    assert is_valid_cimd_client_id_url("https://app.example.com/") is False

  def test_requires_core_fields(self):
    assert is_client_id_metadata_document(self.DOC) is True
    assert is_client_id_metadata_document({"client_id": CLIENT_ID, "client_name": "x"}) is False
    assert is_client_id_metadata_document({**self.DOC, "redirect_uris": []}) is False

  def test_client_id_must_equal_url(self):
    assert validate_client_id_metadata_document(CLIENT_ID, self.DOC).ok is True
    mismatched = validate_client_id_metadata_document(
      CLIENT_ID, {**self.DOC, "client_id": "https://app.example.com/oauth/other.json"}
    )
    assert mismatched.ok is False

  def test_validates_presented_redirect_uri(self):
    assert validate_client_id_metadata_document(CLIENT_ID, self.DOC, REDIRECT_URI).ok is True
    assert validate_client_id_metadata_document(CLIENT_ID, self.DOC, "http://evil.example.com/cb").ok is False

  def test_rejects_non_json_or_missing_fields(self):
    assert validate_client_id_metadata_document(CLIENT_ID, "not json").ok is False
    assert validate_client_id_metadata_document(CLIENT_ID, {"client_id": CLIENT_ID}).ok is False

  def test_rejects_invalid_client_id_url(self):
    assert validate_client_id_metadata_document("https://app.example.com", self.DOC).ok is False

  def test_passthrough_preserves_extra_fields(self):
    extra = {**self.DOC, "x-cache-max-age": 600}
    assert is_client_id_metadata_document(extra) is True
    v = validate_client_id_metadata_document(CLIENT_ID, extra)
    assert v.ok is True
    assert v.document["x-cache-max-age"] == 600


class TestDynamicClientRegistration:
  """AC-36.13 – AC-36.20 — DCR (R-23.4-m – R-23.4-t)."""

  def test_includes_application_type(self):
    body = build_dynamic_client_registration_request(redirect_uris=[REDIRECT_URI], application_type="native")
    assert body["application_type"] == "native"
    assert is_dynamic_client_registration_request({"redirect_uris": [REDIRECT_URI]}) is False

  def test_native_vs_web(self):
    assert application_type_for(True) == "native"
    assert application_type_for(False) == "web"

  def test_redirect_uri_failure_not_crash(self):
    result = handle_dynamic_client_registration_response(
      400, {"error": "invalid_redirect_uri", "error_description": "redirect_uri not permitted"}
    )
    assert result.ok is False

  def test_meaningful_error_on_rejection(self):
    result = handle_dynamic_client_registration_response(400, {"error_description": "bad redirect"})
    assert result.ok is False
    assert "bad redirect" in result.reason

  def test_retryable_flag(self):
    retryable = handle_dynamic_client_registration_response(400, {"error": "invalid_redirect_uri"})
    assert retryable.ok is False
    assert retryable.retryable is True
    non_retryable = handle_dynamic_client_registration_response(500, {})
    assert non_retryable.retryable is False

  def test_parses_success_response(self):
    ok = handle_dynamic_client_registration_response(201, {"client_id": "abc123"})
    assert ok.ok is True
    assert ok.response["client_id"] == "abc123"
    assert is_dynamic_client_registration_response({"client_id": "x", "client_secret": "y"}) is True

  def test_success_status_but_missing_client_id(self):
    result = handle_dynamic_client_registration_response(200, {"no_client_id": True})
    assert result.ok is False
    assert result.retryable is False

  def test_store_keyed_by_issuer_and_reregisters(self):
    store = DynamicClientRegistrationStore()
    assert store.needs_registration(ISSUER) is True
    store.save(DynamicClientRegistrationCredential(issuer=ISSUER, client_id="client-a"))
    assert store.needs_registration(ISSUER) is False
    assert store.credential_for(ISSUER).client_id == "client-a"
    assert store.needs_registration("https://auth2.example.com") is True
    assert store.credential_for("https://auth2.example.com") is None


class TestStep1Record:
  """AC-36.23, AC-36.27 — Step 1 PKCE + recorded issuer (R-23.5-c/g)."""

  def test_records_issuer_state_verifier(self):
    record = create_authorization_flow_record(recorded_issuer=ISSUER, random_source=fixed_bytes(1))
    assert record.recorded_issuer == ISSUER
    assert is_valid_code_verifier(record.code_verifier) is True
    assert record.code_challenge == derive_code_challenge(record.code_verifier)
    assert record.code_challenge_method == "S256"
    assert isinstance(record.state, str)
    assert len(record.state) > 0

  def test_accepts_injected_pkce_state(self):
    pkce = create_pkce_challenge(fixed_bytes(2))
    record = create_authorization_flow_record(recorded_issuer=ISSUER, pkce=pkce, state="af0ifjsldkj")
    assert record.code_verifier == pkce.code_verifier
    assert record.state == "af0ifjsldkj"
    assert generate_state() != generate_state()

  def test_explicit_none_state_suppresses_generation(self):
    record = create_authorization_flow_record(recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(4)), state=None)
    assert record.state is None


class TestScopePriority:
  """AC-36.26, AC-36.61, AC-36.66 — scope priority & offline_access."""

  def test_scope_priority(self):
    assert (
      resolve_authorization_scope(challenge=WwwAuthenticateChallenge(scheme="Bearer", scope="files:read files:write"))
      == "files:read files:write"
    )
    assert resolve_authorization_scope(protected_resource={"scopes_supported": ["a", "b"]}) == "a b"
    assert resolve_authorization_scope() is None
    assert (
      resolve_authorization_scope(
        challenge=WwwAuthenticateChallenge(scheme="Bearer"), protected_resource={"scopes_supported": ["x"]}
      )
      == "x"
    )

  def test_offline_access_when_advertised(self):
    assert (
      with_offline_access_scope("files:read", {"scopes_supported": ["files:read", "offline_access"]})
      == "files:read offline_access"
    )
    assert with_offline_access_scope("files:read", {"scopes_supported": ["files:read"]}) == "files:read"
    assert with_offline_access_scope(None, {"scopes_supported": ["offline_access"]}) == "offline_access"
    assert with_offline_access_scope("offline_access", {"scopes_supported": ["offline_access"]}) == "offline_access"

  def test_advertised_scopes_exclude_offline_access(self):
    assert advertised_scopes_exclude_offline_access(challenge_scope="files:read", scopes_supported=["files:read"]) is True
    assert advertised_scopes_exclude_offline_access(scopes_supported=["offline_access"]) is False
    assert advertised_scopes_exclude_offline_access(challenge_scope="a offline_access") is False


class TestAuthorizationRequest:
  """AC-36.24 – AC-36.29, AC-36.38 — authorization request (R-23.5-d – R-23.5-j)."""

  def _record(self):
    return create_authorization_flow_record(
      recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(3)), state="af0ifjsldkj"
    )

  def _params(self):
    return build_authorization_request(
      client_id=CLIENT_ID, redirect_uri=REDIRECT_URI, resource=RESOURCE, record=self._record(), scope="files:read"
    )

  def test_fixes_response_type_and_method(self):
    params = self._params()
    assert params.response_type == RESPONSE_TYPE_CODE == "code"
    assert params.code_challenge_method == CODE_CHALLENGE_METHOD_S256 == "S256"

  def test_carries_redirect_state_challenge(self):
    record = self._record()
    params = build_authorization_request(client_id=CLIENT_ID, redirect_uri=REDIRECT_URI, resource=RESOURCE, record=record, scope="files:read")
    assert params.redirect_uri == REDIRECT_URI
    assert params.state == "af0ifjsldkj"
    assert params.code_challenge == record.code_challenge

  def test_resource_is_canonical(self):
    assert self._params().resource == RESOURCE

  def test_serializes_percent_encoded_url(self):
    from urllib.parse import parse_qs, urlsplit

    url = build_authorization_url("https://auth.example.com/authorize", self._params())
    q = parse_qs(urlsplit(url).query)
    assert q["response_type"][0] == "code"
    assert q["client_id"][0] == CLIENT_ID
    assert q["redirect_uri"][0] == REDIRECT_URI
    assert q["code_challenge_method"][0] == "S256"
    assert q["resource"][0] == RESOURCE
    assert q["scope"][0] == "files:read"
    assert "resource=https%3A%2F%2Fmcp.example.com" in url

  def test_omits_scope_and_state_when_absent(self):
    no_scope = build_authorization_request(
      client_id=CLIENT_ID,
      redirect_uri=REDIRECT_URI,
      resource=RESOURCE,
      record=create_authorization_flow_record(recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(4)), state=None),
    )
    assert no_scope.scope is None
    assert no_scope.state is None

  def test_preserves_existing_query_params(self):
    from urllib.parse import parse_qs, urlsplit

    url = build_authorization_url("https://auth.example.com/authorize?foo=bar", self._params())
    q = parse_qs(urlsplit(url).query)
    assert q["foo"][0] == "bar"
    assert q["response_type"][0] == "code"


class TestPkceSupportConfirmation:
  """§28.5 — PKCE S256 support confirmation (R-28.5-k)."""

  def test_confirms_when_s256_present(self):
    assert confirm_pkce_support({"code_challenge_methods_supported": ["S256"]}).ok is True
    assert is_pkce_support_confirmed({"code_challenge_methods_supported": ["S256"]}) is True

  def test_refuses_when_absent_or_no_s256(self):
    assert confirm_pkce_support({}).ok is False
    assert confirm_pkce_support({"code_challenge_methods_supported": ["plain"]}).ok is False
    assert is_pkce_support_confirmed({}) is False

  def test_assert_raises_when_unconfirmed(self):
    with pytest.raises(PkceSupportError):
      assert_pkce_support_confirmed({})
    assert_pkce_support_confirmed({"code_challenge_methods_supported": ["S256"]})

  def test_build_request_refuses_unconfirmed_metadata(self):
    record = create_authorization_flow_record(recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(3)))
    with pytest.raises(PkceSupportError):
      build_authorization_request(
        client_id=CLIENT_ID, redirect_uri=REDIRECT_URI, resource=RESOURCE, record=record, server_metadata={}
      )

  def test_build_request_proceeds_when_confirmed(self):
    record = create_authorization_flow_record(recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(3)))
    params = build_authorization_request(
      client_id=CLIENT_ID,
      redirect_uri=REDIRECT_URI,
      resource=RESOURCE,
      record=record,
      server_metadata={"code_challenge_methods_supported": ["S256"]},
    )
    assert params.code_challenge_method == "S256"


class TestRedirectHandling:
  """AC-36.30 – AC-36.33, AC-36.46 – AC-36.53 — redirect handling (R-23.5/23.7)."""

  def test_parses_code_state_iss(self):
    redirect = "http://localhost:3000/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=af0ifjsldkj&iss=https%3A%2F%2Fauth.example.com"
    params = parse_authorization_response(redirect)
    assert params.code == "SplxlOBeZQQYbYS6WxSbIA"
    assert params.state == "af0ifjsldkj"
    assert params.iss == ISSUER

  def test_parses_bare_query_string(self):
    params = parse_authorization_response("code=abc&state=xyz")
    assert params.code == "abc"
    assert params.state == "xyz"

  def test_verifies_returned_state(self):
    assert verify_redirect_state("af0ifjsldkj", "af0ifjsldkj").ok is True
    assert verify_redirect_state("af0ifjsldkj", "tampered").ok is False
    assert verify_redirect_state(None, "anything").ok is True

  def test_four_row_decision_table(self):
    assert issuer_validation_decision(True, True) == "compare"
    assert issuer_validation_decision(True, False) == "reject"
    assert issuer_validation_decision(False, True) == "compare"
    assert issuer_validation_decision(False, False) == "proceed"
    assert issuer_validation_decision(None, False) == "proceed"

  def test_rejects_when_advertised_but_absent(self):
    assert validate_issuer(iss=None, recorded_issuer=ISSUER, iss_parameter_supported=True).ok is False

  def test_always_compares_present_iss(self):
    assert validate_issuer(iss=ISSUER, recorded_issuer=ISSUER, iss_parameter_supported=False).ok is True
    assert validate_issuer(iss="https://evil.example.com", recorded_issuer=ISSUER, iss_parameter_supported=None).ok is False

  def test_exact_string_match_no_normalization(self):
    assert validate_issuer(iss="https://AUTH.example.com", recorded_issuer=ISSUER).ok is False
    assert validate_issuer(iss="https://auth.example.com/", recorded_issuer=ISSUER).ok is False
    assert validate_issuer(iss="https://auth.example.com:443", recorded_issuer=ISSUER).ok is False
    assert validate_issuer(iss=ISSUER, recorded_issuer=ISSUER).ok is True

  def test_validates_iss_before_yielding_code(self):
    from urllib.parse import quote

    record = {"state": "af0ifjsldkj", "recorded_issuer": ISSUER}
    good = process_authorization_redirect(
      f"http://localhost:3000/callback?code=CODE&state=af0ifjsldkj&iss={quote(ISSUER, safe='')}",
      record,
      iss_parameter_supported=True,
    )
    assert good.ok is True
    assert good.code == "CODE"
    bad_iss = process_authorization_redirect(
      f"http://localhost:3000/callback?code=CODE&state=af0ifjsldkj&iss={quote('https://evil.example.com', safe='')}",
      record,
    )
    assert bad_iss.ok is False
    bad_state = process_authorization_redirect(
      f"http://localhost:3000/callback?code=CODE&state=WRONG&iss={quote(ISSUER, safe='')}", record
    )
    assert bad_state.ok is False

  def test_withholds_error_details_on_iss_mismatch(self):
    from urllib.parse import quote

    record = {"state": "af0ifjsldkj", "recorded_issuer": ISSUER}
    error_redirect = (
      f"http://localhost:3000/callback?error=access_denied&error_description=nope&state=af0ifjsldkj"
      f"&iss={quote('https://evil.example.com', safe='')}"
    )
    result = process_authorization_redirect(error_redirect, record)
    assert result.ok is False
    assert result.error is None
    params = parse_authorization_response(error_redirect)
    mismatch = validate_issuer(iss=params.iss, recorded_issuer=ISSUER)
    assert safe_authorization_error(params, mismatch) is None
    matching = parse_authorization_response(
      f"http://localhost:3000/callback?error=access_denied&iss={quote(ISSUER, safe='')}"
    )
    ok_iss = validate_issuer(iss=matching.iss, recorded_issuer=ISSUER)
    assert safe_authorization_error(matching, ok_iss) == {
      "error": "access_denied",
      "error_description": None,
      "error_uri": None,
    }

  def test_surfaces_error_once_iss_validates(self):
    from urllib.parse import quote

    record = {"state": None, "recorded_issuer": ISSUER}
    result = process_authorization_redirect(
      f"http://localhost:3000/callback?error=access_denied&error_description=denied&iss={quote(ISSUER, safe='')}",
      record,
    )
    assert result.ok is False
    assert result.error == {"error": "access_denied", "error_description": "denied", "error_uri": None}

  def test_missing_code_with_no_error(self):
    result = process_authorization_redirect("http://localhost:3000/callback?state=af0ifjsldkj", {"state": "af0ifjsldkj", "recorded_issuer": ISSUER})
    assert result.ok is False
    assert "missing the code" in result.reason

  def test_process_accepts_flow_record_object(self):
    from urllib.parse import quote

    record = create_authorization_flow_record(recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(3)), state="st8")
    good = process_authorization_redirect(
      f"http://localhost:3000/callback?code=C&state=st8&iss={quote(ISSUER, safe='')}", record
    )
    assert good.ok is True and good.code == "C"

  def test_safe_authorization_error_none_when_no_error(self):
    params = parse_authorization_response("code=abc")
    assert safe_authorization_error(params, validate_issuer(iss=None, recorded_issuer=ISSUER)) is None


class TestTokenRequestResponse:
  """AC-36.34 – AC-36.36, AC-36.55, AC-36.63 — token request/response."""

  def _token_req(self):
    return build_authorization_code_token_request(
      code="SplxlOBeZQQYbYS6WxSbIA",
      redirect_uri=REDIRECT_URI,
      code_verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      client_id=CLIENT_ID,
      resource=RESOURCE,
    )

  def test_grant_type_and_verifier(self):
    tr = self._token_req()
    assert tr["grant_type"] == GRANT_TYPE_AUTHORIZATION_CODE == "authorization_code"
    assert tr["code_verifier"] == "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

  def test_redirect_and_resource_identical_step2(self):
    tr = self._token_req()
    assert tr["redirect_uri"] == REDIRECT_URI
    assert tr["resource"] == RESOURCE
    assert assert_resource_matches_step2(tr, RESOURCE).ok is True
    assert assert_resource_matches_step2(tr, "https://other.example.com").ok is False

  def test_form_encodes_body(self):
    from urllib.parse import parse_qs

    body = encode_token_request_body(self._token_req())
    decoded = parse_qs(body)
    assert decoded["grant_type"][0] == "authorization_code"
    assert decoded["code"][0] == "SplxlOBeZQQYbYS6WxSbIA"
    assert decoded["redirect_uri"][0] == REDIRECT_URI
    assert decoded["resource"][0] == RESOURCE
    assert "resource=https%3A%2F%2Fmcp.example.com" in body

  def test_parses_bearer_response(self):
    result = parse_token_response(
      {
        "access_token": "eyJ...",
        "token_type": "Bearer",
        "expires_in": 3600,
        "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
        "scope": "files:read",
      }
    )
    assert result.ok is True
    assert result.token["token_type"] == TOKEN_TYPE_BEARER
    assert is_token_response({"access_token": "x", "token_type": "Bearer"}) is True
    assert is_token_response({"token_type": "Bearer"}) is False
    assert parse_token_response({"access_token": "x", "token_type": "mac"}).ok is False

  def test_does_not_assume_refresh_token(self):
    result = parse_token_response({"access_token": "x", "token_type": "Bearer"})
    assert result.ok is True
    assert result.token.get("refresh_token") is None
    assert has_no_refresh_token(result.token) is True

  def test_token_type_case_insensitive(self):
    assert parse_token_response({"access_token": "x", "token_type": "bearer"}).ok is True


class TestResourceIndicatorsAudience:
  """AC-36.37 – AC-36.45 — Resource Indicators & audience binding (R-23.6)."""

  def test_resource_param_sent_in_both_legs(self):
    assert resource_parameter_for(RESOURCE) == RESOURCE
    auth_req = build_authorization_request(
      client_id=CLIENT_ID,
      redirect_uri=REDIRECT_URI,
      resource=resource_parameter_for(RESOURCE),
      record=create_authorization_flow_record(recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(5))),
    )
    token_req = build_authorization_code_token_request(
      code="c",
      redirect_uri=REDIRECT_URI,
      code_verifier="a" * 43,
      client_id=CLIENT_ID,
      resource=resource_parameter_for(RESOURCE),
    )
    assert auth_req.resource == RESOURCE
    assert token_req["resource"] == RESOURCE

  def test_server_validates_token_audience(self):
    assert validate_token_audience(RESOURCE, RESOURCE).ok is True
    assert validate_token_audience("HTTPS://MCP.EXAMPLE.COM", RESOURCE).ok is True
    assert validate_token_audience("https://other.example.com", RESOURCE).ok is False
    assert validate_token_audience([RESOURCE, "https://x.example.com"], RESOURCE).ok is True
    assert validate_token_audience(["https://a.example.com"], RESOURCE).ok is False

  def test_client_sends_only_right_token(self):
    good = select_token_for_server(
      server_issuer=ISSUER, server_canonical_resource=RESOURCE, token_issuer=ISSUER, token_audience=RESOURCE, access_token="tok"
    )
    assert good.ok is True
    assert good.access_token == "tok"
    assert (
      select_token_for_server(
        server_issuer=ISSUER,
        server_canonical_resource=RESOURCE,
        token_issuer="https://other-as.example.com",
        token_audience=RESOURCE,
        access_token="tok",
      ).ok
      is False
    )
    assert (
      select_token_for_server(
        server_issuer=ISSUER,
        server_canonical_resource=RESOURCE,
        token_issuer=ISSUER,
        token_audience="https://other.example.com",
        access_token="tok",
      ).ok
      is False
    )


class TestAccessTokenUsage:
  """AC-36.54 – AC-36.59 — access-token usage (R-23.8)."""

  CONTEXT = TokenValidationContext(
    own_canonical_resource=RESOURCE,
    required_scopes=["files:read"],
    resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
  )

  def test_build_and_parse_bearer_header(self):
    assert build_bearer_authorization_header("eyJ...") == "Bearer eyJ..."
    assert extract_bearer_token("Bearer eyJ...") == "eyJ..."
    assert extract_bearer_token("bearer eyJ...") == "eyJ..."
    assert extract_bearer_token("Basic abc") is None
    assert extract_bearer_token(None) is None
    with pytest.raises(ValueError):
      build_bearer_authorization_header("")

  def test_detects_token_in_query(self):
    assert url_contains_access_token_in_query("https://mcp.example.com/mcp") is False
    assert url_contains_access_token_in_query("https://mcp.example.com/mcp?access_token=x") is True

  def test_accepts_valid_in_audience_in_scope(self):
    result = validate_access_token_request(
      PresentedToken(active=True, expired=False, audience=RESOURCE, scopes=["files:read", "files:write"]), self.CONTEXT
    )
    assert result.ok is True

  def test_401_for_missing_invalid_expired(self):
    missing = validate_access_token_request(None, self.CONTEXT)
    assert missing.ok is False
    assert missing.challenge.status == UNAUTHORIZED_STATUS == 401
    assert "Bearer" in missing.challenge.headers[WWW_AUTHENTICATE_HEADER]
    expired = validate_access_token_request(
      PresentedToken(active=True, expired=True, audience=RESOURCE, scopes=["files:read"]), self.CONTEXT
    )
    assert expired.challenge.status == 401
    inactive = validate_access_token_request(
      PresentedToken(active=False, expired=False, audience=RESOURCE, scopes=["files:read"]), self.CONTEXT
    )
    assert inactive.challenge.status == 401

  def test_401_for_wrong_audience(self):
    wrong = validate_access_token_request(
      PresentedToken(active=True, expired=False, audience="https://other.example.com", scopes=["files:read"]), self.CONTEXT
    )
    assert wrong.ok is False
    assert wrong.challenge.status == 401

  def test_403_for_under_scoped(self):
    under = validate_access_token_request(
      PresentedToken(active=True, expired=False, audience=RESOURCE, scopes=["files:write"]), self.CONTEXT
    )
    assert under.ok is False
    assert under.challenge.status == AUTHORIZATION_FORBIDDEN_STATUS == 403
    header = under.challenge.headers[WWW_AUTHENTICATE_HEADER]
    assert INSUFFICIENT_SCOPE_ERROR in header
    assert "files:read" in header

  def test_no_required_scopes_passes(self):
    ctx = TokenValidationContext(own_canonical_resource=RESOURCE, resource_metadata=PRM_URI)
    result = validate_access_token_request(
      PresentedToken(active=True, expired=False, audience=RESOURCE, scopes=[]), ctx
    )
    assert result.ok is True


class TestRefreshTokens:
  """AC-36.60, AC-36.62, AC-36.64, AC-36.65 — refresh tokens (R-23.9)."""

  def test_grant_types_includes_refresh(self):
    body = build_dynamic_client_registration_request(
      redirect_uris=[REDIRECT_URI], application_type="native", grant_types=["authorization_code", "refresh_token"]
    )
    assert "refresh_token" in body["grant_types"]

  def test_refresh_keeps_resource(self):
    refresh = build_refresh_token_request(refresh_token="tGzv3JOkF0XG5Qx2TlKWIA", client_id=CLIENT_ID, resource=RESOURCE)
    assert refresh["grant_type"] == GRANT_TYPE_REFRESH_TOKEN == "refresh_token"
    assert refresh["resource"] == RESOURCE
    assert assert_resource_matches_step2(refresh, RESOURCE).ok is True
    from urllib.parse import parse_qs

    body = encode_token_request_body(refresh)
    assert parse_qs(body)["refresh_token"][0] == "tGzv3JOkF0XG5Qx2TlKWIA"
    assert "scope=" not in body

  def test_refresh_may_narrow_scope(self):
    refresh = build_refresh_token_request(refresh_token="r", client_id=CLIENT_ID, resource=RESOURCE, scope="files:read")
    assert refresh["scope"] == "files:read"

  def test_refresh_token_only_in_body(self):
    refresh = build_refresh_token_request(refresh_token="secret-rt", client_id=CLIENT_ID, resource=RESOURCE)
    body = encode_token_request_body(refresh)
    assert "refresh_token=secret-rt" in body
    assert url_contains_access_token_in_query("https://auth.example.com/token") is False
    assert OFFLINE_ACCESS_SCOPE == "offline_access"


class TestEndToEndWorkedExample:
  """End-to-end worked example (§23.10)."""

  def test_step1_to_step4(self):
    from urllib.parse import quote, urlsplit, parse_qs

    record = create_authorization_flow_record(
      recorded_issuer=ISSUER, pkce=create_pkce_challenge(fixed_bytes(9)), state="af0ifjsldkj"
    )
    auth_params = build_authorization_request(
      client_id=CLIENT_ID,
      redirect_uri=REDIRECT_URI,
      resource=resource_parameter_for(RESOURCE),
      record=record,
      scope=resolve_authorization_scope(challenge=WwwAuthenticateChallenge(scheme="Bearer", scope="files:read")),
    )
    auth_url = build_authorization_url("https://auth.example.com/authorize", auth_params)
    assert parse_qs(urlsplit(auth_url).query)["code_challenge"][0] == record.code_challenge

    redirect = f"{REDIRECT_URI}?code=SplxlOBeZQQYbYS6WxSbIA&state=af0ifjsldkj&iss={quote(ISSUER, safe='')}"
    redeemed = process_authorization_redirect(redirect, record, iss_parameter_supported=True)
    assert redeemed.ok is True

    token_req = build_authorization_code_token_request(
      code=redeemed.code,
      redirect_uri=auth_params.redirect_uri,
      code_verifier=record.code_verifier,
      client_id=CLIENT_ID,
      resource=auth_params.resource,
    )
    assert assert_resource_matches_step2(token_req, auth_params.resource).ok is True
    assert verify_pkce(token_req["code_verifier"], auth_params.code_challenge) is True

    token = parse_token_response(
      {
        "access_token": "eyJhbGciOiJIUzI1NiIs",
        "token_type": "Bearer",
        "expires_in": 3600,
        "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
        "scope": "files:read",
      }
    )
    assert token.ok is True
    header = build_bearer_authorization_header(token.token["access_token"])
    assert header == "Bearer eyJhbGciOiJIUzI1NiIs"

    validation = validate_access_token_request(
      PresentedToken(active=True, expired=False, audience=RESOURCE, scopes=["files:read"]),
      TokenValidationContext(
        own_canonical_resource=RESOURCE,
        required_scopes=["files:read"],
        resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
      ),
    )
    assert validation.ok is True


# ══════════════════════════════════════════════════════════════════════════════════
# S37 — Authorization III (§23.11–§23.19)
# ══════════════════════════════════════════════════════════════════════════════════


class TestRegistrationMechanismSelection:
  """AC-37.1 – AC-37.5, AC-37.12, AC-37.13 — mechanism selection (R-23.11)."""

  def test_concrete_mechanism_chosen_pre_flow(self):
    sel = select_registration_mechanism(authorization_server_metadata={**AS_BASE, "client_id_metadata_document_supported": True})
    assert sel.mechanism == "cimd"

  def test_pre_registration_wins(self):
    sel = select_registration_mechanism(
      authorization_server_metadata={
        **AS_BASE,
        "client_id_metadata_document_supported": True,
        "registration_endpoint": "https://auth.example.com/register",
      },
      has_pre_registered_credentials=True,
    )
    assert sel.mechanism == "pre-registration"

  def test_cimd_wins_over_dcr(self):
    sel = select_registration_mechanism(
      authorization_server_metadata={
        **AS_BASE,
        "client_id_metadata_document_supported": True,
        "registration_endpoint": "https://auth.example.com/register",
      }
    )
    assert sel.mechanism == "cimd"

  def test_dcr_when_only_registration_endpoint(self):
    sel = select_registration_mechanism(
      authorization_server_metadata={**AS_BASE, "registration_endpoint": "https://auth.example.com/register"}
    )
    assert sel.mechanism == "dcr"

  def test_prompt_when_nothing_applies(self):
    assert select_registration_mechanism(authorization_server_metadata={**AS_BASE}).mechanism == "prompt"

  def test_skips_unsupported_mechanism(self):
    sel = select_registration_mechanism(
      authorization_server_metadata={
        **AS_BASE,
        "client_id_metadata_document_supported": True,
        "registration_endpoint": "https://auth.example.com/register",
      },
      supported_mechanisms=["dcr"],
    )
    assert sel.mechanism == "dcr"

  def test_metadata_flags_drive_decision(self):
    assert CLIENT_ID_METADATA_DOCUMENT_SUPPORTED_FIELD == "client_id_metadata_document_supported"
    assert select_registration_mechanism(authorization_server_metadata={**AS_BASE, "client_id_metadata_document_supported": True}).mechanism == "cimd"
    assert select_registration_mechanism(authorization_server_metadata={**AS_BASE}).mechanism == "prompt"

  def test_never_selects_cimd_without_flag(self):
    assert may_attempt_cimd({"client_id_metadata_document_supported": False}) is False
    assert may_attempt_cimd({}) is False
    assert may_attempt_cimd({"client_id_metadata_document_supported": True}) is True
    assert select_registration_mechanism(authorization_server_metadata={**AS_BASE, "client_id_metadata_document_supported": False}).mechanism != "cimd"

  def test_never_selects_dcr_without_endpoint(self):
    assert may_attempt_dcr({}) is False
    assert may_attempt_dcr({"registration_endpoint": ""}) is False
    assert may_attempt_dcr({"registration_endpoint": "https://auth.example.com/register"}) is True
    assert select_registration_mechanism(authorization_server_metadata={**AS_BASE}).mechanism != "dcr"

  def test_pre_registration_used_without_cimd_dcr(self):
    sel = select_registration_mechanism(authorization_server_metadata={**AS_BASE}, has_pre_registered_credentials=True)
    assert sel.mechanism == "pre-registration"


class TestCimdHostingAndCache:
  """AC-37.6 – AC-37.11 — CIMD hosting & AS cache (R-23.12)."""

  DOC = {"client_id": CLIENT_ID, "client_name": "App", "redirect_uris": ["http://127.0.0.1/cb"]}

  def test_cimd_preferred_path(self):
    assert cimd_is_preferred_path(True, True) is True
    assert cimd_is_preferred_path(True, False) is False
    assert cimd_is_preferred_path(False, True) is False

  def test_client_id_url_https_with_path(self):
    assert is_cimd_client_id_hosting_valid("https://app.example.com/oauth/client-metadata.json") is True
    assert is_cimd_client_id_hosting_valid("http://app.example.com/oauth/client-metadata.json") is False
    assert is_cimd_client_id_hosting_valid("https://app.example.com") is False
    assert is_cimd_client_id_hosting_valid("https://app.example.com/") is False

  def test_private_key_jwt(self):
    assert PRIVATE_KEY_JWT_AUTH_METHOD == "private_key_jwt"
    assert cimd_supports_private_key_jwt({"token_endpoint_auth_method": "private_key_jwt", "jwks_uri": "https://app.example.com/jwks.json"}) is True
    assert cimd_supports_private_key_jwt({"token_endpoint_auth_method": "private_key_jwt", "jwks": {"keys": []}}) is True
    assert cimd_supports_private_key_jwt({"token_endpoint_auth_method": "private_key_jwt"}) is False
    assert cimd_supports_private_key_jwt({"token_endpoint_auth_method": "none"}) is False

  def test_cache_respects_max_age(self):
    now = [1_000_000]
    cache = CimdDocumentCache(now=lambda: now[0])
    url = "https://app.example.com/oauth/client-metadata.json"
    assert cache.store(url, self.DOC, CimdCacheControl(max_age_seconds=60)) is True
    assert cache.get(url) == self.DOC
    now[0] += 61_000
    assert cache.get(url) is None

  def test_cache_honours_no_store_and_non_positive_max_age(self):
    cache = CimdDocumentCache()
    url = "https://app.example.com/oauth/client-metadata.json"
    assert cache.store(url, self.DOC, CimdCacheControl(no_store=True)) is False
    assert cache.store(url, self.DOC, CimdCacheControl(max_age_seconds=0)) is False
    assert cache.get(url) is None

  def test_cache_trust_policy(self):
    cache = CimdDocumentCache(trust_host=lambda host: host == "app.example.com")
    trusted = "https://app.example.com/oauth/client-metadata.json"
    untrusted = "https://evil.example/oauth/client-metadata.json"
    assert cache.is_host_trusted(trusted) is True
    assert cache.is_host_trusted(untrusted) is False
    assert cache.store(untrusted, {**self.DOC, "client_id": untrusted}, CimdCacheControl()) is False
    assert cache.store(trusted, self.DOC, CimdCacheControl()) is True
    assert cache.get(trusted) == self.DOC

  def test_cache_no_directive_never_expires(self):
    cache = CimdDocumentCache()
    url = "https://app.example.com/oauth/client-metadata.json"
    assert cache.store(url, self.DOC) is True
    assert cache.get(url) == self.DOC

  def test_cache_trust_policy_blocks_get_after_store(self):
    trusted_flag = [True]
    cache = CimdDocumentCache(trust_host=lambda host: trusted_flag[0])
    url = "https://app.example.com/oauth/client-metadata.json"
    assert cache.store(url, self.DOC) is True
    trusted_flag[0] = False
    assert cache.get(url) is None


class TestApplicationTypeAndRetry:
  """AC-37.15, AC-37.16 — application_type & DCR retry (R-23.15)."""

  def test_loopback_native_remote_web(self):
    assert application_type_for_redirect_uris(["http://127.0.0.1:3000/callback", "http://localhost:3000/callback"]) == "native"
    assert application_type_for_redirect_uris(["http://[::1]:3000/callback"]) == "native"
    assert application_type_for_redirect_uris(["https://app.example.com/callback"]) == "web"
    assert application_type_for_redirect_uris(["http://localhost/cb", "https://app.example.com/cb"]) == "web"
    assert application_type_for_redirect_uris([]) == "web"

  def test_invalid_redirect_uri_is_web(self):
    assert application_type_for_redirect_uris(["not a uri"]) == "web"

  def test_retryable_oidc_rejection_retries_adjusted_type(self):
    seen = []

    def attempt(application_type):
      seen.append(application_type)
      if application_type == "native":
        return {"status": 400, "body": {"error": "invalid_redirect_uri", "error_description": "redirect not allowed"}}
      return {"status": 201, "body": {"client_id": "s6BhdRkqt3"}}

    out = register_with_retry(initial_application_type="native", attempt=attempt)
    assert seen == ["native", "web"]
    assert out.result.ok is True
    assert out.attempts == ["native", "web"]

  def test_non_retryable_rejection_no_retry(self):
    calls = [0]

    def attempt(application_type):
      calls[0] += 1
      return {"status": 401, "body": {"error_description": "unauthorized"}}

    out = register_with_retry(initial_application_type="web", attempt=attempt)
    assert calls[0] == 1
    assert out.result.ok is False
    assert "unauthorized" in out.result.reason

  def test_retries_bounded_by_max_attempts(self):
    calls = [0]

    def attempt(application_type):
      calls[0] += 1
      return {"status": 400, "body": {"error_description": "still bad"}}

    out = register_with_retry(initial_application_type="native", max_attempts=2, attempt=attempt)
    assert calls[0] == 2
    assert out.result.ok is False
    assert out.attempts == ["native", "web"]

  def test_attempt_accepts_tuple(self):
    out = register_with_retry(initial_application_type="web", attempt=lambda at: (201, {"client_id": "x"}))
    assert out.result.ok is True
    assert out.attempts == ["web"]


class TestCredentialBinding:
  """AC-37.17 – AC-37.19 — credential binding to the issuer (R-23.16)."""

  STORED = IssuerBoundCredentials(issuer="https://auth-a.example.com", client_id="client-a")

  def test_store_and_retrieve_by_issuer(self):
    store = IssuerBoundCredentialStore()
    store.save(self.STORED)
    assert store.credentials_for("https://auth-a.example.com") == self.STORED
    assert store.credentials_for("https://auth-b.example.com") is None

  def test_empty_issuer_rejected(self):
    store = IssuerBoundCredentialStore()
    with pytest.raises(ValueError):
      store.save(IssuerBoundCredentials(issuer="", client_id="x"))

  def test_different_issuer_re_register(self):
    decision = decide_credential_binding(stored=self.STORED, discovered_issuer="https://auth-b.example.com")
    assert decision.action == "re-register"

  def test_matching_issuer_reuse(self):
    decision = decide_credential_binding(stored=self.STORED, discovered_issuer="https://auth-a.example.com")
    assert decision.action == "reuse"

  def test_cimd_exempt_reused(self):
    cimd = IssuerBoundCredentials(
      issuer="https://auth-a.example.com", client_id="https://app.example.com/oauth/client-metadata.json", cimd=True
    )
    decision = decide_credential_binding(stored=cimd, discovered_issuer="https://auth-b.example.com")
    assert decision.action == "reuse"

  def test_no_stored_register(self):
    decision = decide_credential_binding(stored=None, discovered_issuer="https://auth-b.example.com")
    assert decision.action == "re-register"

  def test_exact_issuer_comparison(self):
    assert issuers_match_exactly("https://auth.example.com", "https://auth.example.com") is True
    assert issuers_match_exactly("https://AUTH.example.com", "https://auth.example.com") is False
    assert issuers_match_exactly("https://auth.example.com/", "https://auth.example.com") is False
    assert issuers_match_exactly("https://auth.example.com:443", "https://auth.example.com") is False
    assert issuers_match_exactly("https://auth.example.com/%61", "https://auth.example.com/a") is False

  def test_pre_registered_mismatch_surfaces_error(self):
    decision = decide_credential_binding(stored=self.STORED, discovered_issuer="https://auth-b.example.com", is_pre_registered=True)
    assert decision.action == "surface-error"
    assert "mismatched" in decision.reason

  def test_store_decide_for(self):
    store = IssuerBoundCredentialStore()
    store.save(IssuerBoundCredentials(issuer="https://auth-a.example.com", client_id="a"))
    assert store.decide_for("https://auth-b.example.com").action == "re-register"
    assert store.decide_for("https://auth-a.example.com").action == "reuse"
    assert store.has("https://auth-a.example.com") is True

  def test_store_isolates_per_issuer(self):
    store = IssuerBoundCredentialStore()
    store.save(IssuerBoundCredentials(issuer="https://auth-a.example.com", client_id="a"))
    store.save(IssuerBoundCredentials(issuer="https://auth-b.example.com", client_id="b"))
    assert store.credentials_for("https://auth-a.example.com").client_id == "a"
    assert store.credentials_for("https://auth-b.example.com").client_id == "b"


class TestDiscoveryRobustness:
  """AC-37.20 – AC-37.23 — discovery robustness (R-23.17)."""

  def test_resource_metadata_precedence(self):
    uris = protected_resource_metadata_uris(
      resource_metadata_url="https://mcp.example.com/.well-known/oauth-protected-resource",
      mcp_endpoint_url="https://mcp.example.com/public/mcp",
    )
    assert uris == ["https://mcp.example.com/.well-known/oauth-protected-resource"]

  def test_well_known_order(self):
    uris = protected_resource_metadata_uris(mcp_endpoint_url="https://example.com/public/mcp")
    assert uris == [
      "https://example.com/.well-known/oauth-protected-resource/public/mcp",
      "https://example.com/.well-known/oauth-protected-resource",
    ]

  def test_no_input_empty(self):
    assert protected_resource_metadata_uris() == []
    assert protected_resource_metadata_uris(mcp_endpoint_url="not a url") == []

  def test_authorization_servers_required(self):
    ok = require_authorization_servers({"authorization_servers": ["https://auth.example.com"]})
    assert ok.ok is True
    assert ok.authorization_servers == ["https://auth.example.com"]
    assert require_authorization_servers({"authorization_servers": []}).ok is False
    assert require_authorization_servers({}).ok is False

  def test_path_issuer_metadata_uris(self):
    assert authorization_server_metadata_uris("https://auth.example.com/tenant1") == [
      "https://auth.example.com/.well-known/oauth-authorization-server/tenant1",
      "https://auth.example.com/.well-known/openid-configuration/tenant1",
      "https://auth.example.com/tenant1/.well-known/openid-configuration",
    ]

  def test_non_path_issuer_metadata_uris(self):
    assert authorization_server_metadata_uris("https://auth.example.com") == [
      "https://auth.example.com/.well-known/oauth-authorization-server",
      "https://auth.example.com/.well-known/openid-configuration",
    ]

  def test_fetched_issuer_must_match(self):
    assert validate_discovered_issuer("https://honest.example", "https://honest.example").ok is True
    bad = validate_discovered_issuer("https://attacker.example", "https://honest.example")
    assert bad.ok is False
    assert "MUST NOT use" in bad.reason


class TestScopeSelectionAndStepUp:
  """AC-37.24 – AC-37.29 — scope selection & step-up (R-23.18)."""

  def test_challenge_scope_authoritative(self):
    challenge = parse_www_authenticate('Bearer error="insufficient_scope", scope="files:write"')
    assert select_initial_scopes(challenge=challenge, protected_resource={"scopes_supported": ["a", "b"]}) == "files:write"

  def test_falls_back_to_scopes_supported(self):
    assert select_initial_scopes(protected_resource={"scopes_supported": ["files:read", "files:write"]}) == "files:read files:write"

  def test_omits_scope_when_none(self):
    assert select_initial_scopes() is None
    assert select_initial_scopes(protected_resource={}) is None

  def test_403_is_step_up_trigger(self):
    built = build_insufficient_scope_response(
      scope="files:write",
      resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
      error_description="File write permission required",
    )
    assert built.status == 403
    parsed = parse_www_authenticate(built.headers["WWW-Authenticate"])
    assert parsed.error == "insufficient_scope"
    assert parsed.scope == "files:write"
    assert parsed.resource_metadata == "https://mcp.example.com/.well-known/oauth-protected-resource"
    assert parsed.error_description == "File write permission required"

  def test_all_scopes_in_single_challenge(self):
    built = build_insufficient_scope_response(
      scope="files:read files:write admin", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
    )
    parsed = parse_www_authenticate(built.headers["WWW-Authenticate"])
    assert parse_scope_set(parsed.scope) == ["files:read", "files:write", "admin"]

  def test_should_attempt_step_up(self):
    assert should_attempt_step_up("user") is True
    assert should_attempt_step_up("client_credentials") is False

  def test_client_credentials_may_force(self):
    tracker = ScopeUpgradeTracker()
    challenge = parse_www_authenticate('Bearer error="insufficient_scope", scope="files:write"')
    key = ScopeUpgradeKey(resource="https://mcp.example.com/mcp", operation="tools/call")
    aborted = plan_step_up_authorization(actor="client_credentials", already_granted=["files:read"], challenge=challenge, key=key, tracker=tracker)
    assert aborted.proceed is False
    forced = plan_step_up_authorization(
      actor="client_credentials",
      already_granted=["files:read"],
      challenge=challenge,
      key=key,
      tracker=tracker,
      force_for_client_credentials=True,
    )
    assert forced.proceed is True

  def test_union_never_drops_granted(self):
    assert union_step_up_scopes(["files:read"], ["files:write"]) == ["files:read", "files:write"]
    assert union_step_up_scopes(["files:read", "files:write"], ["files:write", "admin"]) == ["files:read", "files:write", "admin"]

  def test_plan_yields_union_scope_string(self):
    tracker = ScopeUpgradeTracker()
    challenge = parse_www_authenticate('Bearer error="insufficient_scope", scope="files:write"')
    key = ScopeUpgradeKey(resource="https://mcp.example.com/mcp", operation="tools/call")
    plan = plan_step_up_authorization(actor="user", already_granted=["files:read"], challenge=challenge, key=key, tracker=tracker)
    assert plan.proceed is True
    assert plan.scope == "files:read files:write"
    assert plan.scopes == ["files:read", "files:write"]

  def test_bounded_retry_permanent_failure(self):
    tracker = ScopeUpgradeTracker(2)
    key = ScopeUpgradeKey(resource="https://mcp.example.com/mcp", operation="tools/call")
    assert tracker.next_action(key) == "retry"
    assert tracker.next_action(key) == "retry"
    assert tracker.next_action(key) == "permanent-failure"
    assert tracker.attempts_for(key) == 3

  def test_tracks_per_resource_and_operation(self):
    tracker = ScopeUpgradeTracker(2)
    a = ScopeUpgradeKey(resource="https://mcp.example.com/mcp", operation="tools/call")
    b = ScopeUpgradeKey(resource="https://mcp.example.com/mcp", operation="resources/read")
    tracker.record_attempt(a)
    assert tracker.attempts_for(a) == 1
    assert tracker.attempts_for(b) == 0
    tracker.reset(a)
    assert tracker.attempts_for(a) == 0

  def test_plan_stops_once_bound_exhausted(self):
    tracker = ScopeUpgradeTracker(1)
    key = ScopeUpgradeKey(resource="https://mcp.example.com/mcp", operation="tools/call")
    challenge = parse_www_authenticate('Bearer error="insufficient_scope", scope="files:write"')
    first = plan_step_up_authorization(actor="user", already_granted=["files:read"], challenge=challenge, key=key, tracker=tracker)
    assert first.proceed is True
    second = plan_step_up_authorization(actor="user", already_granted=["files:read"], challenge=challenge, key=key, tracker=tracker)
    assert second.proceed is False
    assert "permanent" in second.reason

  def test_max_attempts_positive_integer(self):
    with pytest.raises(ValueError):
      ScopeUpgradeTracker(0)
    with pytest.raises(ValueError):
      ScopeUpgradeTracker(1.5)
    with pytest.raises(ValueError):
      ScopeUpgradeTracker(True)

  def test_can_retry(self):
    tracker = ScopeUpgradeTracker(2)
    key = ScopeUpgradeKey(resource="r", operation="op")
    assert tracker.can_retry(key) is True
    tracker.record_attempt(key)
    tracker.record_attempt(key)
    assert tracker.can_retry(key) is False
    assert tracker.max_attempts == 2

  def test_parse_format_scope_set(self):
    assert parse_scope_set("a  b a") == ["a", "b"]
    assert parse_scope_set(None) == []
    assert format_scope_set(["a", "b"]) == "a b"


class TestSecurityConsiderations:
  """AC-37.30 – AC-37.38 — authorization security considerations (R-23.19)."""

  def test_resource_param_in_both_requests(self):
    canonical = "https://mcp.example.com/mcp"
    assert check_resource_parameter_binding(
      authorization_request_resource=canonical, token_request_resource=canonical, canonical_resource=canonical
    ).ok is True
    assert check_resource_parameter_binding(
      authorization_request_resource=None, token_request_resource=canonical, canonical_resource=canonical
    ).ok is False
    assert check_resource_parameter_binding(
      authorization_request_resource=canonical, token_request_resource="https://other.example/mcp", canonical_resource=canonical
    ).ok is False

  def test_forward_token_only_to_issuing_server(self):
    assert may_forward_token_to_server("https://auth.example.com", "https://auth.example.com") is True
    assert may_forward_token_to_server("https://auth.example.com", "https://other.example") is False

  def test_co_located_record(self):
    assert same_request_record({"recorded_issuer": "https://auth.example.com", "code_verifier": "v" * 43, "state": "s"}).ok is True
    assert same_request_record({"code_verifier": "v" * 43, "state": "s"}).ok is False
    assert same_request_record({"recorded_issuer": "i", "state": "s"}).ok is False
    assert same_request_record({"recorded_issuer": "i", "code_verifier": "v"}).ok is False

  def test_present_iss_compared_exactly(self):
    assert validate_exact_issuer(iss="https://auth.example.com", recorded_issuer="https://auth.example.com").ok is True
    assert validate_exact_issuer(iss="https://attacker.example", recorded_issuer="https://auth.example.com").ok is False

  def test_supported_absent_rejected_not_advertised_proceeds(self):
    assert validate_exact_issuer(recorded_issuer="https://auth.example.com", iss_parameter_supported=True).ok is False
    assert validate_exact_issuer(recorded_issuer="https://auth.example.com").ok is True

  def test_tokens_confidential_and_redacted(self):
    assert is_confidential_token() is True
    assert redact_token() == "[REDACTED]"
    assert "secret" not in redact_token()

  def test_access_token_only_in_header(self):
    assert check_bearer_header_only(request_url="https://mcp.example.com/mcp", has_authorization_header=True).ok is True
    assert check_bearer_header_only(request_url="https://mcp.example.com/mcp?access_token=abc", has_authorization_header=True).ok is False
    assert check_bearer_header_only(request_url="https://mcp.example.com/mcp", has_authorization_header=False).ok is False

  def test_grant_types_includes_refresh_no_dup(self):
    assert grant_types_with_refresh(["authorization_code"]) == ["authorization_code", "refresh_token"]
    assert grant_types_with_refresh(["authorization_code", "refresh_token"]) == ["authorization_code", "refresh_token"]

  def test_offline_access_added_only_when_advertised(self):
    assert with_offline_access_if_advertised(["files:read"], {"scopes_supported": ["files:read", "offline_access"]}) == ["files:read", "offline_access"]
    assert with_offline_access_if_advertised(["files:read"], {"scopes_supported": ["files:read"]}) == ["files:read"]
    assert with_offline_access_if_advertised(["files:read"], {}) == ["files:read"]
    assert with_offline_access_if_advertised(["offline_access"], {"scopes_supported": ["offline_access"]}) == ["offline_access"]

  def test_refresh_token_never_assumed(self):
    assert refresh_token_is_never_assumed() is True

  def test_server_omits_offline_access(self):
    assert server_scopes_omit_offline_access(scopes_supported=["files:read", "files:write"]).ok is True
    assert server_scopes_omit_offline_access(scopes_supported=["files:read", "offline_access"]).ok is False
    assert server_scopes_omit_offline_access(challenge_scope="files:read offline_access").ok is False
    assert server_scopes_omit_offline_access(challenge_scope="files:read").ok is True

  def test_same_request_record_accepts_object(self):
    from mcp.protocol.authorization_registration import SecureAuthorizationRequestRecord

    rec = SecureAuthorizationRequestRecord(recorded_issuer="i", code_verifier="v", state="s")
    assert same_request_record(rec).ok is True
    assert same_request_record(SecureAuthorizationRequestRecord(recorded_issuer="i")).ok is False
