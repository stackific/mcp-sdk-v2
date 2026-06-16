"""C3 — OAuth 2.1 client flow (§23): PKCE, discovery, DCR, the authorize URL, the token
exchange, refresh, and the ``AuthProvider``.

Mirrors the TS SDK's ``__tests__/client/oauth.test.ts`` case-for-case and adds edge cases
the TS suite implies (path-aware fallbacks, audience binding on every leg, the iss table
of §23.7, registration without a ``registration_endpoint``, token-endpoint error mapping,
and the provider with no refresh / no expiry).

The HTTP client is injected via the ``fetch`` parameter; a :class:`_FakeResponse` stands
in for ``httpx.Response`` (the :class:`mcp.client.oauth.FetchJsonResponse` surface:
``ok``, ``status``, ``json()``). No real network is used.
"""

import json
from urllib.parse import parse_qs, urlsplit

import pytest

from mcp.client.oauth import (
  PKCE_METHOD,
  AuthProvider,
  assert_pkce_supported,
  build_authorize_url,
  create_auth_provider,
  create_pkce_pair,
  discover_oauth_metadata,
  discovery_urls,
  exchange_authorization_code,
  protected_resource_metadata_urls,
  refresh_access_token,
  register_client,
  verify_authorization_redirect,
)

AS_META = {
  "issuer": "https://as.test",
  "authorization_endpoint": "https://as.test/authorize",
  "token_endpoint": "https://as.test/token",
  "registration_endpoint": "https://as.test/register",
  "code_challenge_methods_supported": ["S256"],
}


class _FakeResponse:
  """A minimal stand-in for ``httpx.Response`` satisfying the ``FetchJsonResponse``
  protocol (``ok``, ``status``, ``json()``)."""

  def __init__(self, body, status: int = 200):
    self._body = body
    self._status = status

  @property
  def ok(self) -> bool:
    return 200 <= self._status < 300

  @property
  def status(self) -> int:
    return self._status

  def json(self):
    return self._body


def _unreachable_fetch(url, init=None):  # pragma: no cover - asserts no network is touched
  raise AssertionError(f"fetch must not be called (got {url})")


# ─── PKCE (§23.5) ──────────────────────────────────────────────────────────────────


class TestCreatePkcePair:
  def test_produces_s256_verifier_and_challenge(self):
    p = create_pkce_pair()
    assert p["code_challenge_method"] == PKCE_METHOD == "S256"
    assert len(p["code_verifier"]) > 20
    assert p["code_challenge"] != p["code_verifier"]

  def test_pairs_are_unique_per_call(self):
    a, b = create_pkce_pair(), create_pkce_pair()
    assert a["code_verifier"] != b["code_verifier"]
    assert a["code_challenge"] != b["code_challenge"]

  def test_verifier_and_challenge_are_base64url_unpadded(self):
    p = create_pkce_pair()
    for value in (p["code_verifier"], p["code_challenge"]):
      assert "=" not in value and "+" not in value and "/" not in value


class TestAssertPkceSupported:
  def test_passes_when_s256_advertised(self):
    assert_pkce_supported({"code_challenge_methods_supported": ["S256"]})  # no raise

  def test_passes_when_s256_among_others(self):
    assert_pkce_supported({"code_challenge_methods_supported": ["plain", "S256"]})

  def test_raises_when_only_plain(self):
    with pytest.raises(ValueError):
      assert_pkce_supported({"code_challenge_methods_supported": ["plain"]})

  def test_raises_when_absent(self):
    with pytest.raises(ValueError):
      assert_pkce_supported({})


# ─── Discovery URL construction (§23.17) ───────────────────────────────────────────


class TestProtectedResourceMetadataUrls:
  def test_path_aware_with_root_fallback(self):
    assert protected_resource_metadata_urls("https://mcp.test/mcp") == [
      "https://mcp.test/.well-known/oauth-protected-resource/mcp",
      "https://mcp.test/.well-known/oauth-protected-resource",
    ]

  def test_root_resource_has_no_duplicate(self):
    assert protected_resource_metadata_urls("https://mcp.test") == [
      "https://mcp.test/.well-known/oauth-protected-resource",
    ]

  def test_trailing_slash_is_stripped(self):
    assert protected_resource_metadata_urls("https://mcp.test/") == [
      "https://mcp.test/.well-known/oauth-protected-resource",
    ]


class TestDiscoveryUrls:
  def test_root_issuer_tries_oauth_then_oidc(self):
    assert discovery_urls("https://as.test") == [
      "https://as.test/.well-known/oauth-authorization-server",
      "https://as.test/.well-known/openid-configuration",
    ]

  def test_path_issuer_is_path_aware_with_root_fallbacks(self):
    # §23.17: OAuth AS path-insertion, OIDC path-append, then OAuth+OIDC roots.
    assert discovery_urls("https://as.test/tenant1") == [
      "https://as.test/.well-known/oauth-authorization-server/tenant1",
      "https://as.test/tenant1/.well-known/openid-configuration",
      "https://as.test/.well-known/oauth-authorization-server",
      "https://as.test/.well-known/openid-configuration",
    ]


# ─── Metadata discovery (§23.2–§23.3, §23.17) ──────────────────────────────────────


class TestDiscoverOAuthMetadata:
  def test_discovers_prm_then_as_metadata(self):
    def fetch(url, init=None):
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test"]}
        )
      return _FakeResponse(AS_META)

    m = discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)
    assert m["issuer"] == "https://as.test"
    assert m["authorization_server"]["token_endpoint"] == "https://as.test/token"
    assert m["protected_resource"]["resource"] == "https://mcp.test/mcp"

  def test_path_aware_for_path_component_issuer(self):
    tried: list[str] = []

    def fetch(url, init=None):
      tried.append(url)
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test/tenant1"]}
        )
      if url == "https://as.test/.well-known/oauth-authorization-server/tenant1":
        return _FakeResponse({**AS_META, "issuer": "https://as.test/tenant1"})
      return _FakeResponse("not found", 404)

    m = discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)
    assert m["issuer"] == "https://as.test/tenant1"
    # RFC 8414 path-aware URL was tried.
    assert "https://as.test/.well-known/oauth-authorization-server/tenant1" in tried

  def test_explicit_resource_metadata_url_overrides_discovery(self):
    seen: list[str] = []

    def fetch(url, init=None):
      seen.append(url)
      if url == "https://override.test/prm.json":
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test"]}
        )
      if "oauth-protected-resource" in url:  # pragma: no cover - should not be reached
        raise AssertionError("well-known PRM discovery must be skipped when an explicit URL is given")
      return _FakeResponse(AS_META)

    discover_oauth_metadata(
      resource="https://mcp.test/mcp",
      resource_metadata_url="https://override.test/prm.json",
      fetch=fetch,
    )
    # The explicit URL was used; no well-known PRM URL was constructed.
    assert "https://override.test/prm.json" in seen
    assert not any("oauth-protected-resource" in u for u in seen)

  def test_rejects_mismatched_as_issuer(self):
    def fetch(url, init=None):
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test"]}
        )
      return _FakeResponse({**AS_META, "issuer": "https://evil.test"})

    with pytest.raises(ValueError, match="mix-up|does not match"):
      discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)

  def test_accepts_trailing_slash_only_issuer_difference(self):
    def fetch(url, init=None):
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test"]}
        )
      return _FakeResponse({**AS_META, "issuer": "https://as.test/"})

    m = discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)
    assert m["issuer"] == "https://as.test"

  def test_raises_when_no_authorization_servers(self):
    def fetch(url, init=None):
      return _FakeResponse({"resource": "https://mcp.test/mcp", "authorization_servers": []})

    with pytest.raises(ValueError, match="no authorization_servers|lists no"):
      discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)

  def test_raises_when_as_metadata_structurally_invalid(self):
    def fetch(url, init=None):
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test"]}
        )
      # Missing the REQUIRED token_endpoint.
      return _FakeResponse({"issuer": "https://as.test", "authorization_endpoint": "https://as.test/a"})

    with pytest.raises(ValueError):
      discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)

  def test_first_failing_discovery_url_falls_through_to_next(self):
    # The path-insertion OAuth URL 404s; discovery falls through to the OIDC append URL.
    def fetch(url, init=None):
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test/tenant1"]}
        )
      if url == "https://as.test/tenant1/.well-known/openid-configuration":
        return _FakeResponse({**AS_META, "issuer": "https://as.test/tenant1"})
      return _FakeResponse("nope", 404)

    m = discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)
    assert m["issuer"] == "https://as.test/tenant1"

  def test_discovery_failure_when_all_urls_fail(self):
    def fetch(url, init=None):
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test"]}
        )
      return _FakeResponse("nope", 500)

    with pytest.raises(ValueError, match="discovery failed"):
      discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)

  def test_one_argument_fetcher_is_supported(self):
    # A fetcher that accepts only the URL (no init) must work for the GET legs.
    def fetch(url):
      if "oauth-protected-resource" in url:
        return _FakeResponse(
          {"resource": "https://mcp.test/mcp", "authorization_servers": ["https://as.test"]}
        )
      return _FakeResponse(AS_META)

    m = discover_oauth_metadata(resource="https://mcp.test/mcp", fetch=fetch)
    assert m["issuer"] == "https://as.test"


# ─── Redirect verification (§23.5, §23.7) ──────────────────────────────────────────


class TestVerifyAuthorizationRedirect:
  def test_passes_when_state_matches(self):
    verify_authorization_redirect(sent_state="s", returned_state="s", issuer="https://as.test")

  def test_raises_on_state_mismatch(self):
    with pytest.raises(ValueError, match="state"):
      verify_authorization_redirect(sent_state="s", returned_state="x", issuer="https://as.test")

  def test_raises_when_state_absent(self):
    with pytest.raises(ValueError, match="state"):
      verify_authorization_redirect(sent_state="s", returned_state=None, issuer="https://as.test")

  def test_raises_when_iss_advertised_but_missing(self):
    with pytest.raises(ValueError, match="iss"):
      verify_authorization_redirect(
        sent_state="s", returned_state="s", issuer="https://as.test", iss_parameter_supported=True
      )

  def test_raises_on_iss_mismatch(self):
    with pytest.raises(ValueError, match="iss|mix-up"):
      verify_authorization_redirect(
        sent_state="s",
        returned_state="s",
        issuer="https://as.test",
        returned_iss="https://evil.test",
        iss_parameter_supported=True,
      )

  def test_passes_when_iss_matches(self):
    verify_authorization_redirect(
      sent_state="s",
      returned_state="s",
      issuer="https://as.test",
      returned_iss="https://as.test",
      iss_parameter_supported=True,
    )

  def test_iss_comparison_is_exact_no_trailing_slash_tolerance(self):
    # §23.7: exact string match — a trailing-slash difference on iss MUST be rejected.
    with pytest.raises(ValueError, match="iss|mix-up"):
      verify_authorization_redirect(
        sent_state="s",
        returned_state="s",
        issuer="https://as.test",
        returned_iss="https://as.test/",
        iss_parameter_supported=True,
      )


# ─── Registration + authorize + exchange + refresh + provider (§23.4–§23.9) ─────────


class TestEndToEndAudienceBound:
  def test_register_authorize_exchange_refresh_all_audience_bound(self):
    token_bodies: list[dict] = []
    reg_body: dict = {}

    def fetch(url, init=None):
      if url.endswith("/register"):
        reg_body.update(json.loads(init["body"]))
        return _FakeResponse({"client_id": "c1", "client_secret": "s1"}, 201)
      if url.endswith("/token"):
        body = parse_qs(init["body"])
        token_bodies.append(body)
        if body["grant_type"][0] == "authorization_code":
          return _FakeResponse(
            {"access_token": "AT", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "RT"}
          )
        return _FakeResponse({"access_token": "AT2", "token_type": "Bearer", "expires_in": 3600})
      return _FakeResponse({})

    reg = register_client(
      AS_META, client_name="app", redirect_uris=["https://app/cb"], fetch=fetch
    )
    assert reg["clientId"] == "c1"
    assert reg["client_secret"] == "s1"
    assert reg_body["application_type"] == "web"  # REQUIRED (§23.15)
    assert reg_body["grant_types"] == ["authorization_code"]
    assert reg_body["redirect_uris"] == ["https://app/cb"]

    url = build_authorize_url(
      AS_META,
      client_id="c1",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      state="st",
      code_challenge="cc",
    )
    assert "code_challenge_method=S256" in url
    assert "resource=https" in url

    tok = exchange_authorization_code(
      AS_META,
      client_id="c1",
      code="CODE",
      code_verifier="V",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      fetch=fetch,
    )
    assert tok["access_token"] == "AT"
    assert token_bodies[0]["resource"][0] == "https://mcp.test/mcp"  # audience binding (§23.6)

    # The AuthProvider refreshes transparently once the token is near expiry.
    t = [0]
    provider = create_auth_provider(
      tok,
      lambda rt: refresh_access_token(
        AS_META, client_id="c1", refresh_token=rt, resource="https://mcp.test/mcp", fetch=fetch
      ),
      now=lambda: t[0],
    )
    assert provider.token() == "AT"
    t[0] = 3600 * 1000  # past expiry
    assert provider.token() == "AT2"
    assert token_bodies[1]["resource"][0] == "https://mcp.test/mcp"  # refresh keeps binding (§23.9)


# ─── Registration edge cases (§23.4/§23.14/§23.15) ─────────────────────────────────


class TestRegisterClient:
  def test_raises_without_registration_endpoint(self):
    meta = {k: v for k, v in AS_META.items() if k != "registration_endpoint"}
    with pytest.raises(ValueError, match="registration_endpoint"):
      register_client(meta, client_name="app", fetch=_unreachable_fetch)

  def test_application_type_native_is_honored(self):
    captured: dict = {}

    def fetch(url, init=None):
      captured.update(json.loads(init["body"]))
      return _FakeResponse({"client_id": "c1"})

    register_client(AS_META, client_name="cli", application_type="native", fetch=fetch)
    assert captured["application_type"] == "native"

  def test_custom_grant_types_are_sent(self):
    captured: dict = {}

    def fetch(url, init=None):
      captured.update(json.loads(init["body"]))
      return _FakeResponse({"client_id": "c1"})

    register_client(
      AS_META,
      client_name="app",
      grant_types=["authorization_code", "refresh_token"],
      fetch=fetch,
    )
    assert captured["grant_types"] == ["authorization_code", "refresh_token"]

  def test_redirect_uris_omitted_when_not_supplied(self):
    captured: dict = {}

    def fetch(url, init=None):
      captured.update(json.loads(init["body"]))
      return _FakeResponse({"client_id": "c1"})

    register_client(AS_META, client_name="app", fetch=fetch)
    assert "redirect_uris" not in captured

  def test_posts_json_content_type(self):
    seen: dict = {}

    def fetch(url, init=None):
      seen.update(init)
      return _FakeResponse({"client_id": "c1"})

    register_client(AS_META, client_name="app", fetch=fetch)
    assert seen["method"] == "POST"
    assert seen["headers"]["content-type"] == "application/json"

  def test_client_secret_optional_in_result(self):
    def fetch(url, init=None):
      return _FakeResponse({"client_id": "public-1"})

    reg = register_client(AS_META, client_name="app", fetch=fetch)
    assert reg["clientId"] == "public-1"
    assert reg.get("client_secret") is None


# ─── Authorize URL (§23.5, §23.6) ──────────────────────────────────────────────────


class TestBuildAuthorizeUrl:
  def _params(self, url: str) -> dict:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}

  def test_contains_all_required_parameters(self):
    url = build_authorize_url(
      AS_META,
      client_id="c1",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      state="st",
      code_challenge="cc",
      scope="files:read",
    )
    p = self._params(url)
    assert p["response_type"] == "code"
    assert p["client_id"] == "c1"
    assert p["redirect_uri"] == "https://app/cb"
    assert p["scope"] == "files:read"
    assert p["state"] == "st"
    assert p["code_challenge"] == "cc"
    assert p["code_challenge_method"] == "S256"
    assert p["resource"] == "https://mcp.test/mcp"

  def test_scope_omitted_when_not_supplied(self):
    url = build_authorize_url(
      AS_META,
      client_id="c1",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      state="st",
      code_challenge="cc",
    )
    assert "scope" not in self._params(url)

  def test_merges_with_preexisting_query(self):
    meta = {**AS_META, "authorization_endpoint": "https://as.test/authorize?audience=x"}
    url = build_authorize_url(
      meta,
      client_id="c1",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      state="st",
      code_challenge="cc",
    )
    p = self._params(url)
    assert p["audience"] == "x"
    assert p["response_type"] == "code"

  def test_raises_without_authorization_endpoint(self):
    meta = {k: v for k, v in AS_META.items() if k != "authorization_endpoint"}
    with pytest.raises(ValueError, match="authorization_endpoint"):
      build_authorize_url(
        meta,
        client_id="c1",
        redirect_uri="https://app/cb",
        resource="https://mcp.test/mcp",
        state="st",
        code_challenge="cc",
      )


# ─── Token exchange + refresh (§23.5, §23.6, §23.9) ────────────────────────────────


class TestExchangeAuthorizationCode:
  def test_sends_authorization_code_grant_with_resource(self):
    captured: dict = {}

    def fetch(url, init=None):
      captured.update(parse_qs(init["body"]))
      return _FakeResponse({"access_token": "AT", "token_type": "Bearer"})

    tok = exchange_authorization_code(
      AS_META,
      client_id="c1",
      code="CODE",
      code_verifier="V",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      fetch=fetch,
    )
    assert tok["access_token"] == "AT"
    assert captured["grant_type"][0] == "authorization_code"
    assert captured["code"][0] == "CODE"
    assert captured["code_verifier"][0] == "V"
    assert captured["redirect_uri"][0] == "https://app/cb"
    assert captured["client_id"][0] == "c1"
    assert captured["resource"][0] == "https://mcp.test/mcp"  # REQUIRED (§23.6)
    assert "client_secret" not in captured

  def test_includes_client_secret_when_supplied(self):
    captured: dict = {}

    def fetch(url, init=None):
      captured.update(parse_qs(init["body"]))
      return _FakeResponse({"access_token": "AT", "token_type": "Bearer"})

    exchange_authorization_code(
      AS_META,
      client_id="c1",
      client_secret="sec",
      code="CODE",
      code_verifier="V",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      fetch=fetch,
    )
    assert captured["client_secret"][0] == "sec"

  def test_form_urlencoded_content_type(self):
    seen: dict = {}

    def fetch(url, init=None):
      seen.update(init)
      return _FakeResponse({"access_token": "AT", "token_type": "Bearer"})

    exchange_authorization_code(
      AS_META,
      client_id="c1",
      code="CODE",
      code_verifier="V",
      redirect_uri="https://app/cb",
      resource="https://mcp.test/mcp",
      fetch=fetch,
    )
    assert seen["method"] == "POST"
    assert seen["headers"]["content-type"] == "application/x-www-form-urlencoded"

  def test_raises_on_non_2xx_token_response(self):
    def fetch(url, init=None):
      return _FakeResponse({"error": "invalid_grant"}, 400)

    with pytest.raises(ValueError, match="HTTP 400"):
      exchange_authorization_code(
        AS_META,
        client_id="c1",
        code="CODE",
        code_verifier="V",
        redirect_uri="https://app/cb",
        resource="https://mcp.test/mcp",
        fetch=fetch,
      )

  def test_raises_without_token_endpoint(self):
    meta = {k: v for k, v in AS_META.items() if k != "token_endpoint"}
    with pytest.raises(ValueError, match="token_endpoint"):
      exchange_authorization_code(
        meta,
        client_id="c1",
        code="CODE",
        code_verifier="V",
        redirect_uri="https://app/cb",
        resource="https://mcp.test/mcp",
        fetch=_unreachable_fetch,
      )


class TestRefreshAccessToken:
  def test_sends_refresh_grant_with_resource(self):
    captured: dict = {}

    def fetch(url, init=None):
      captured.update(parse_qs(init["body"]))
      return _FakeResponse({"access_token": "AT2", "token_type": "Bearer"})

    tok = refresh_access_token(
      AS_META, client_id="c1", refresh_token="RT", resource="https://mcp.test/mcp", fetch=fetch
    )
    assert tok["access_token"] == "AT2"
    assert captured["grant_type"][0] == "refresh_token"
    assert captured["refresh_token"][0] == "RT"
    assert captured["client_id"][0] == "c1"
    assert captured["resource"][0] == "https://mcp.test/mcp"  # keeps binding (§23.9)

  def test_includes_client_secret_when_supplied(self):
    captured: dict = {}

    def fetch(url, init=None):
      captured.update(parse_qs(init["body"]))
      return _FakeResponse({"access_token": "AT2", "token_type": "Bearer"})

    refresh_access_token(
      AS_META,
      client_id="c1",
      client_secret="sec",
      refresh_token="RT",
      resource="https://mcp.test/mcp",
      fetch=fetch,
    )
    assert captured["client_secret"][0] == "sec"

  def test_raises_on_non_2xx(self):
    def fetch(url, init=None):
      return _FakeResponse({"error": "invalid_grant"}, 401)

    with pytest.raises(ValueError, match="HTTP 401"):
      refresh_access_token(
        AS_META, client_id="c1", refresh_token="RT", resource="https://mcp.test/mcp", fetch=fetch
      )


# ─── AuthProvider (§23.8) ──────────────────────────────────────────────────────────


class TestCreateAuthProvider:
  def test_returns_initial_token_before_expiry(self):
    provider = create_auth_provider(
      {"access_token": "AT", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "RT"},
      lambda rt: {"access_token": "AT2", "token_type": "Bearer", "expires_in": 3600},
      now=lambda: 0,
    )
    assert provider.token() == "AT"

  def test_refreshes_when_within_skew_of_expiry(self):
    t = [0]
    provider = create_auth_provider(
      {"access_token": "AT", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "RT"},
      lambda rt: {"access_token": "AT2", "token_type": "Bearer", "expires_in": 3600},
      now=lambda: t[0],
      skew_ms=30_000,
    )
    assert provider.token() == "AT"
    t[0] = 3600 * 1000  # past expiry
    assert provider.token() == "AT2"

  def test_skew_triggers_refresh_just_before_expiry(self):
    t = [0]
    refreshed = []

    def refresh(rt):
      refreshed.append(rt)
      return {"access_token": "AT2", "token_type": "Bearer", "expires_in": 3600}

    provider = create_auth_provider(
      {"access_token": "AT", "token_type": "Bearer", "expires_in": 100, "refresh_token": "RT"},
      refresh,
      now=lambda: t[0],
      skew_ms=30_000,
    )
    # 100s lifetime → expiry at 100_000ms; with 30_000ms skew, refresh fires at >= 70_000ms.
    t[0] = 69_999
    assert provider.token() == "AT"
    assert refreshed == []
    t[0] = 70_000
    assert provider.token() == "AT2"
    assert refreshed == ["RT"]

  def test_no_refresh_callback_keeps_initial_token(self):
    t = [0]
    provider = create_auth_provider(
      {"access_token": "AT", "token_type": "Bearer", "expires_in": 1, "refresh_token": "RT"},
      now=lambda: t[0],
    )
    t[0] = 10_000  # well past expiry, but no refresh callback supplied
    assert provider.token() == "AT"

  def test_no_refresh_token_keeps_initial_token(self):
    t = [0]
    provider = create_auth_provider(
      {"access_token": "AT", "token_type": "Bearer", "expires_in": 1},
      lambda rt: {"access_token": "AT2", "token_type": "Bearer"},
      now=lambda: t[0],
    )
    t[0] = 10_000
    assert provider.token() == "AT"

  def test_no_expiry_never_refreshes(self):
    t = [0]
    provider = create_auth_provider(
      {"access_token": "AT", "token_type": "Bearer", "refresh_token": "RT"},
      lambda rt: {"access_token": "AT2", "token_type": "Bearer"},
      now=lambda: t[0],
    )
    t[0] = 10**12  # huge time jump; without expires_in the token never expires
    assert provider.token() == "AT"

  def test_async_refresh_callback_is_awaited(self):
    async def refresh(rt):
      return {"access_token": "AT2", "token_type": "Bearer", "expires_in": 3600}

    t = [0]
    provider = create_auth_provider(
      {"access_token": "AT", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "RT"},
      refresh,
      now=lambda: t[0],
    )
    assert provider.token() == "AT"
    t[0] = 3600 * 1000
    assert provider.token() == "AT2"

  def test_is_an_auth_provider_instance(self):
    provider = create_auth_provider({"access_token": "AT", "token_type": "Bearer"})
    assert isinstance(provider, AuthProvider)
