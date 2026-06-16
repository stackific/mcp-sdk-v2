using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S36 — Authorization II (spec §23.4–§23.10): PKCE <c>S256</c> generation/derivation/
/// verification and verifier validation, <c>state</c> generation, the per-request flow record, CIMD
/// schema/validation, DCR request/response and retryable-failure handling, scope resolution and
/// <c>offline_access</c>, the §28.5 PKCE-support gate, the authorization request/URL, redirect parsing
/// and the <c>iss</c> decision table, token requests/encoding/response, audience validation (string OR
/// array), the bearer header, and the server-side access-token validation state machine. Mirrors the
/// TypeScript <c>authorization-flow.test.ts</c> and <c>pkce-support.test.ts</c>.
/// </summary>
public sealed class AuthorizationFlowTests
{
  // Deterministic byte source for reproducible PKCE/state in tests.
  private static Func<int, byte[]> FixedBytes(byte fill) => n => Enumerable.Repeat(fill, n).ToArray();

  // ───────────────────────── PKCE (§23.5, R-23.5-a, R-23.5-b) ─────────────────────────

  [Fact]
  public void Generate_code_verifier_is_43_chars_unreserved()
  {
    var verifier = Pkce.GenerateCodeVerifier();
    Assert.Equal(43, verifier.Length);
    Assert.True(Pkce.IsValidCodeVerifier(verifier));
  }

  [Fact]
  public void Code_verifier_is_deterministic_under_fixed_source()
  {
    var a = Pkce.GenerateCodeVerifier(FixedBytes(0xAB));
    var b = Pkce.GenerateCodeVerifier(FixedBytes(0xAB));
    Assert.Equal(a, b);
  }

  [Theory]
  [InlineData("short")]
  [InlineData("has spaces and invalid!")]
  public void Invalid_code_verifier_rejected(string verifier) =>
    Assert.False(Pkce.IsValidCodeVerifier(verifier));

  [Fact]
  public void Code_verifier_too_long_rejected() =>
    Assert.False(Pkce.IsValidCodeVerifier(new string('a', 129)));

  [Fact]
  public void Code_verifier_min_max_boundaries()
  {
    Assert.True(Pkce.IsValidCodeVerifier(new string('a', 43)));
    Assert.True(Pkce.IsValidCodeVerifier(new string('a', 128)));
    Assert.False(Pkce.IsValidCodeVerifier(new string('a', 42)));
  }

  [Fact]
  public void Derive_challenge_is_base64url_sha256()
  {
    const string verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    var expected = Convert.ToBase64String(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)))
      .Replace('+', '-').Replace('/', '_').TrimEnd('=');
    Assert.Equal(expected, Pkce.DeriveCodeChallenge(verifier));
  }

  [Fact]
  public void Derive_challenge_matches_rfc_7636_test_vector()
  {
    // RFC 7636 Appendix B test vector.
    const string verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.DeriveCodeChallenge(verifier));
  }

  [Fact]
  public void Derive_challenge_rejects_invalid_verifier() =>
    Assert.Throws<ArgumentException>(() => Pkce.DeriveCodeChallenge("short"));

  [Fact]
  public void Create_challenge_method_is_s256()
  {
    var challenge = Pkce.CreateChallenge();
    Assert.Equal("S256", challenge.CodeChallengeMethod);
    Assert.Equal(Pkce.DeriveCodeChallenge(challenge.CodeVerifier), challenge.CodeChallenge);
  }

  [Fact]
  public void Verify_pkce_accepts_matching_pair()
  {
    var challenge = Pkce.CreateChallenge();
    Assert.True(Pkce.Verify(challenge.CodeVerifier, challenge.CodeChallenge));
  }

  [Fact]
  public void Verify_pkce_rejects_wrong_verifier()
  {
    var challenge = Pkce.CreateChallenge();
    var other = Pkce.CreateChallenge();
    Assert.False(Pkce.Verify(other.CodeVerifier, challenge.CodeChallenge));
  }

  [Fact]
  public void Generate_state_is_deterministic_under_fixed_source()
  {
    Assert.Equal(Pkce.GenerateState(FixedBytes(1)), Pkce.GenerateState(FixedBytes(1)));
  }

  [Fact]
  public void Generate_state_is_random_per_call() =>
    Assert.NotEqual(Pkce.GenerateState(), Pkce.GenerateState());

  // ───────────────────────── client_id mechanism (§23.4, R-23.4-a – R-23.4-c) ─────────────────────────

  [Fact]
  public void Select_client_id_mechanism_priority()
  {
    Assert.Equal(ClientIdMechanism.PreRegistration,
      ClientIdAcquisition.Select([ClientIdMechanism.Dcr, ClientIdMechanism.PreRegistration, ClientIdMechanism.Cimd]));
    Assert.Equal(ClientIdMechanism.Cimd,
      ClientIdAcquisition.Select([ClientIdMechanism.Dcr, ClientIdMechanism.Cimd]));
    Assert.Equal(ClientIdMechanism.Dcr,
      ClientIdAcquisition.Select([ClientIdMechanism.Dcr]));
  }

  [Fact]
  public void Select_client_id_mechanism_falls_back_to_prompt() =>
    Assert.Equal(ClientIdMechanism.Prompt, ClientIdAcquisition.Select([]));

  [Fact]
  public void Pre_registered_credentials_match_check()
  {
    Assert.True(ClientIdAcquisition.CheckPreRegisteredCredentials("https://as", "https://as").Ok);
    Assert.False(ClientIdAcquisition.CheckPreRegisteredCredentials("https://as1", "https://as2").Ok);
  }

  [Theory]
  [InlineData(true, ApplicationType.Native)]
  [InlineData(false, ApplicationType.Web)]
  public void Application_type_for(bool isNative, ApplicationType expected) =>
    Assert.Equal(expected, ClientIdAcquisition.ApplicationTypeFor(isNative));

  // ───────────────────────── CIMD (§23.4, R-23.4-d – R-23.4-l) ─────────────────────────

  [Theory]
  [InlineData("https://app.example.com/oauth/client.json", true)]
  [InlineData("https://app.example.com", false)] // bare origin, no path
  [InlineData("https://app.example.com/", false)] // root path
  [InlineData("http://app.example.com/client.json", false)] // not https
  [InlineData("not-a-url", false)]
  public void Cimd_client_id_url_validation(string url, bool valid) =>
    Assert.Equal(valid, Cimd.IsValidClientIdUrl(url));

  private static JsonObject CimdDoc(string clientId = "https://app.example.com/oauth/client.json") => new()
  {
    ["client_id"] = clientId,
    ["client_name"] = "Example MCP Client",
    ["redirect_uris"] = new JsonArray("http://127.0.0.1:3000/callback"),
  };

  [Fact]
  public void Cimd_validate_succeeds_on_identity_match()
  {
    var result = Cimd.Validate("https://app.example.com/oauth/client.json", CimdDoc(), out var doc);
    Assert.True(result.Ok);
    Assert.NotNull(doc);
  }

  [Fact]
  public void Cimd_validate_rejects_client_id_not_equal_to_url()
  {
    var result = Cimd.Validate("https://app.example.com/oauth/client.json", CimdDoc("https://evil.example.com/x.json"), out _);
    Assert.False(result.Ok);
  }

  [Fact]
  public void Cimd_validate_rejects_invalid_url() =>
    Assert.False(Cimd.Validate("https://app.example.com", CimdDoc("https://app.example.com"), out _).Ok);

  [Fact]
  public void Cimd_validate_checks_redirect_uri_membership()
  {
    var ok = Cimd.Validate("https://app.example.com/oauth/client.json", CimdDoc(), out _, "http://127.0.0.1:3000/callback");
    Assert.True(ok.Ok);
    var bad = Cimd.Validate("https://app.example.com/oauth/client.json", CimdDoc(), out _, "http://evil/callback");
    Assert.False(bad.Ok);
  }

  [Fact]
  public void Cimd_rejects_missing_required_fields()
  {
    var doc = CimdDoc();
    doc.Remove("client_name");
    Assert.Null(Cimd.Parse(doc));
  }

  // ───────────────────────── DCR (§23.4, R-23.4-m – R-23.4-t) ─────────────────────────

  [Fact]
  public void Dcr_request_renders_required_application_type()
  {
    var json = new DynamicClientRegistrationRequest(["http://127.0.0.1/cb"], ApplicationType.Native, "App").ToJson();
    Assert.Equal("native", json["application_type"]!.GetValue<string>());
    Assert.Equal("App", json["client_name"]!.GetValue<string>());
  }

  [Fact]
  public void Dcr_handle_response_success()
  {
    var result = Dcr.HandleResponse(201, new JsonObject { ["client_id"] = "abc" });
    Assert.True(result.Ok);
    Assert.Equal("abc", result.Response!.ClientId);
  }

  [Fact]
  public void Dcr_handle_response_400_is_retryable()
  {
    var result = Dcr.HandleResponse(400, new JsonObject { ["error_description"] = "redirect_uri not allowed" });
    Assert.False(result.Ok);
    Assert.True(result.Retryable);
    Assert.Contains("redirect_uri not allowed", result.Reason);
  }

  [Fact]
  public void Dcr_handle_response_does_not_crash_on_500()
  {
    var result = Dcr.HandleResponse(500, null);
    Assert.False(result.Ok);
    Assert.False(result.Retryable);
  }

  [Fact]
  public void Dcr_handle_response_success_without_client_id_fails()
  {
    var result = Dcr.HandleResponse(200, new JsonObject { ["foo"] = "bar" });
    Assert.False(result.Ok);
    Assert.False(result.Retryable);
  }

  [Fact]
  public void Dcr_store_keys_by_issuer_and_needs_registration()
  {
    var store = new DynamicClientRegistrationStore();
    Assert.True(store.NeedsRegistration("https://as.example.com"));
    store.Save(new DynamicClientRegistrationCredential("https://as.example.com", "client-1"));
    Assert.False(store.NeedsRegistration("https://as.example.com"));
    Assert.True(store.NeedsRegistration("https://as2.example.com"));
    Assert.Equal("client-1", store.CredentialFor("https://as.example.com")!.ClientId);
  }

  // ───────────────────────── Flow record (§23.5, R-23.5-c) ─────────────────────────

  [Fact]
  public void Flow_record_captures_issuer_pkce_state()
  {
    var record = AuthorizationFlowRecord.Create("https://as.example.com", randomSource: FixedBytes(0x10));
    Assert.Equal("https://as.example.com", record.RecordedIssuer);
    Assert.Equal("S256", record.CodeChallengeMethod);
    Assert.True(Pkce.IsValidCodeVerifier(record.CodeVerifier));
    Assert.NotNull(record.State);
    Assert.Equal(Pkce.DeriveCodeChallenge(record.CodeVerifier), record.CodeChallenge);
  }

  [Fact]
  public void Flow_record_uses_supplied_pkce_and_state()
  {
    var pkce = Pkce.CreateChallenge(FixedBytes(0x22));
    var record = AuthorizationFlowRecord.Create("https://as", pkce, "my-state");
    Assert.Equal(pkce.CodeVerifier, record.CodeVerifier);
    Assert.Equal("my-state", record.State);
  }

  // ───────────────────────── Scope priority & offline_access (§23.5, §23.9) ─────────────────────────

  [Fact]
  public void Scope_resolution_prefers_challenge()
  {
    var scope = AuthorizationScopes.Resolve(new WwwAuthenticateChallenge(Scope: "files:write"), ["files:read"]);
    Assert.Equal("files:write", scope);
  }

  [Fact]
  public void Scope_resolution_falls_back_to_scopes_supported()
  {
    var scope = AuthorizationScopes.Resolve(null, ["a", "b"]);
    Assert.Equal("a b", scope);
  }

  [Fact]
  public void Scope_resolution_omits_when_none()
  {
    Assert.Null(AuthorizationScopes.Resolve(null, null));
    Assert.Null(AuthorizationScopes.Resolve(new WwwAuthenticateChallenge(), null));
  }

  [Fact]
  public void With_offline_access_only_when_advertised()
  {
    Assert.Equal("a offline_access", AuthorizationScopes.WithOfflineAccess("a", ["a", "offline_access"]));
    Assert.Equal("a", AuthorizationScopes.WithOfflineAccess("a", ["a"]));
    Assert.Equal("offline_access", AuthorizationScopes.WithOfflineAccess(null, ["offline_access"]));
  }

  [Fact]
  public void Advertised_scopes_exclude_offline_access()
  {
    Assert.True(AuthorizationScopes.AdvertisedScopesExcludeOfflineAccess("a b", ["a"]));
    Assert.False(AuthorizationScopes.AdvertisedScopesExcludeOfflineAccess("offline_access", null));
    Assert.False(AuthorizationScopes.AdvertisedScopesExcludeOfflineAccess(null, ["offline_access"]));
  }

  // ───────────────────────── PKCE support gate (§28.5, R-28.5-k) ─────────────────────────

  [Fact]
  public void Pkce_support_confirmed_when_s256_advertised() =>
    Assert.True(PkceSupport.IsConfirmed(["S256"]));

  [Fact]
  public void Pkce_support_unconfirmed_when_field_absent() =>
    Assert.False(PkceSupport.IsConfirmed(null));

  [Fact]
  public void Pkce_support_unconfirmed_when_only_plain() =>
    Assert.False(PkceSupport.IsConfirmed(["plain"]));

  [Fact]
  public void Assert_pkce_support_throws_when_unconfirmed() =>
    Assert.Throws<PkceSupportException>(() => PkceSupport.AssertConfirmed(null));

  [Fact]
  public void Assert_pkce_support_passes_when_confirmed() =>
    PkceSupport.AssertConfirmed(["S256"]);

  // ───────────────────────── Authorization request (§23.5, R-23.5-d – R-23.5-j) ─────────────────────────

  private static AuthorizationFlowRecord Record() => AuthorizationFlowRecord.Create("https://as.example.com", state: "st", pkce: Pkce.CreateChallenge(FixedBytes(0x33)));

  [Fact]
  public void Authorization_request_fixes_code_and_s256()
  {
    var parameters = AuthorizationRequest.Build("cid", "https://app/cb", "https://m/mcp", Record(), "files:read");
    Assert.Equal("code", parameters.ResponseType);
    Assert.Equal("S256", parameters.CodeChallengeMethod);
    Assert.Equal("https://m/mcp", parameters.Resource);
    Assert.Equal("files:read", parameters.Scope);
    Assert.Equal("st", parameters.State);
  }

  [Fact]
  public void Authorization_request_refuses_unconfirmed_pkce()
  {
    Assert.Throws<PkceSupportException>(() =>
      AuthorizationRequest.Build("cid", "https://app/cb", "https://m/mcp", Record(), confirmPkceFrom: ["plain"]));
  }

  [Fact]
  public void Authorization_request_proceeds_when_pkce_confirmed()
  {
    var parameters = AuthorizationRequest.Build("cid", "https://app/cb", "https://m/mcp", Record(), confirmPkceFrom: ["S256"]);
    Assert.Equal("code", parameters.ResponseType);
  }

  [Fact]
  public void Authorization_url_emits_all_params_with_resource()
  {
    var parameters = AuthorizationRequest.Build("cid", "https://app/cb", "https://m/mcp", Record(), "files:read");
    var url = AuthorizationRequest.BuildUrl("https://as.example.com/authorize", parameters);
    var query = System.Web.HttpUtility.ParseQueryString(new Uri(url).Query);
    Assert.Equal("code", query["response_type"]);
    Assert.Equal("cid", query["client_id"]);
    Assert.Equal("https://app/cb", query["redirect_uri"]);
    Assert.Equal("files:read", query["scope"]);
    Assert.Equal("st", query["state"]);
    Assert.Equal("S256", query["code_challenge_method"]);
    Assert.Equal("https://m/mcp", query["resource"]);
  }

  [Fact]
  public void Authorization_url_omits_scope_when_absent()
  {
    var parameters = AuthorizationRequest.Build("cid", "https://app/cb", "https://m/mcp", Record());
    var url = AuthorizationRequest.BuildUrl("https://as.example.com/authorize", parameters);
    Assert.DoesNotContain("scope=", url);
  }

  // ───────────────────────── Redirect parse & iss decision table (§23.5, §23.7) ─────────────────────────

  [Fact]
  public void Parse_authorization_response_decodes_params()
  {
    var parameters = AuthorizationResponseParams.Parse("http://localhost:3000/cb?code=SplxlOBeZQQYbYS6WxSbIA&state=af0&iss=https%3A%2F%2Fauth.example.com");
    Assert.Equal("SplxlOBeZQQYbYS6WxSbIA", parameters.Code);
    Assert.Equal("af0", parameters.State);
    Assert.Equal("https://auth.example.com", parameters.Iss);
  }

  [Fact]
  public void Parse_authorization_response_from_bare_query()
  {
    var parameters = AuthorizationResponseParams.Parse("code=abc&error=access_denied");
    Assert.Equal("abc", parameters.Code);
    Assert.Equal("access_denied", parameters.Error);
  }

  [Theory]
  // supported, issPresent → decision
  [InlineData(true, true, IssuerValidationDecision.Compare)]
  [InlineData(true, false, IssuerValidationDecision.Reject)]
  [InlineData(false, true, IssuerValidationDecision.Compare)]
  [InlineData(false, false, IssuerValidationDecision.Proceed)]
  public void Issuer_decision_table(bool supported, bool issPresent, IssuerValidationDecision expected) =>
    Assert.Equal(expected, AuthorizationRedirect.Decision(supported, issPresent));

  [Fact]
  public void Issuer_decision_present_but_unadvertised_compares()
  {
    // R-23.7-f: a present iss is compared even when not advertised (null flag).
    Assert.Equal(IssuerValidationDecision.Compare, AuthorizationRedirect.Decision(null, issPresent: true));
  }

  [Fact]
  public void Validate_issuer_compares_present_iss_when_unadvertised()
  {
    var bad = AuthorizationRedirect.ValidateIssuer("https://evil", "https://as.example.com", issParameterSupported: null);
    Assert.False(bad.Ok);
    var good = AuthorizationRedirect.ValidateIssuer("https://as.example.com", "https://as.example.com", issParameterSupported: null);
    Assert.True(good.Ok);
  }

  [Fact]
  public void Validate_issuer_rejects_absent_when_advertised()
  {
    var result = AuthorizationRedirect.ValidateIssuer(null, "https://as.example.com", issParameterSupported: true);
    Assert.False(result.Ok);
  }

  [Fact]
  public void Validate_issuer_proceeds_when_absent_and_unadvertised()
  {
    var result = AuthorizationRedirect.ValidateIssuer(null, "https://as.example.com", issParameterSupported: false);
    Assert.True(result.Ok);
  }

  [Fact]
  public void Validate_issuer_is_exact_no_trailing_slash()
  {
    var result = AuthorizationRedirect.ValidateIssuer("https://as.example.com/", "https://as.example.com", issParameterSupported: true);
    Assert.False(result.Ok);
  }

  [Fact]
  public void Verify_state_requires_match_when_sent()
  {
    Assert.True(AuthorizationRedirect.VerifyState("s", "s").Ok);
    Assert.False(AuthorizationRedirect.VerifyState("s", "x").Ok);
    Assert.False(AuthorizationRedirect.VerifyState("s", null).Ok);
  }

  [Fact]
  public void Verify_state_skips_when_not_sent() =>
    Assert.True(AuthorizationRedirect.VerifyState(null, "anything").Ok);

  // ───────────────────────── Process redirect end-to-end (§23.5, §23.7) ─────────────────────────

  [Fact]
  public void Process_redirect_returns_code_on_success()
  {
    var result = AuthorizationRedirect.Process(
      "http://localhost/cb?code=THE_CODE&state=st&iss=https%3A%2F%2Fas.example.com",
      "https://as.example.com", "st", issParameterSupported: true);
    Assert.True(result.Ok);
    Assert.Equal("THE_CODE", result.Code);
  }

  [Fact]
  public void Process_redirect_rejects_state_mismatch()
  {
    var result = AuthorizationRedirect.Process("http://localhost/cb?code=x&state=wrong", "https://as.example.com", "st");
    Assert.False(result.Ok);
  }

  [Fact]
  public void Process_redirect_withholds_error_on_iss_mismatch()
  {
    // An error response whose iss does not match: error details MUST NOT be surfaced (R-23.7-h).
    var result = AuthorizationRedirect.Process(
      "http://localhost/cb?error=access_denied&error_description=nope&iss=https%3A%2F%2Fevil.example",
      "https://as.example.com", sentState: null, issParameterSupported: true);
    Assert.False(result.Ok);
    Assert.Null(result.Error);
  }

  [Fact]
  public void Process_redirect_surfaces_error_when_iss_valid()
  {
    var result = AuthorizationRedirect.Process(
      "http://localhost/cb?error=access_denied&error_description=nope&iss=https%3A%2F%2Fas.example.com",
      "https://as.example.com", sentState: null, issParameterSupported: true);
    Assert.False(result.Ok);
    Assert.NotNull(result.Error);
    Assert.Equal("access_denied", result.Error!.Error);
    Assert.Equal("nope", result.Error.ErrorDescription);
  }

  [Fact]
  public void Process_redirect_missing_code()
  {
    var result = AuthorizationRedirect.Process("http://localhost/cb?state=st", "https://as.example.com", "st", issParameterSupported: false);
    Assert.False(result.Ok);
    Assert.Contains("missing the code", result.Reason);
  }

  // ───────────────────────── Token requests & encoding (§23.5, §23.9) ─────────────────────────

  [Fact]
  public void Authorization_code_token_request_carries_six_fields()
  {
    var request = TokenRequests.BuildAuthorizationCode("CODE", "https://app/cb", "verifier1234567890123456789012345678901234567890", "cid", "https://m/mcp");
    var body = TokenRequests.EncodeBody(request);
    Assert.Contains("grant_type=authorization_code", body);
    Assert.Contains("code=CODE", body);
    Assert.Contains("code_verifier=verifier", body);
    Assert.Contains("client_id=cid", body);
    Assert.Contains("resource=https%3A%2F%2Fm%2Fmcp", body);
  }

  [Fact]
  public void Refresh_token_request_carries_resource_for_audience_binding()
  {
    var request = TokenRequests.BuildRefresh("rt", "cid", "https://m/mcp", "files:read");
    var body = TokenRequests.EncodeBody(request);
    Assert.Contains("grant_type=refresh_token", body);
    Assert.Contains("refresh_token=rt", body);
    Assert.Contains("resource=https%3A%2F%2Fm%2Fmcp", body);
    Assert.Contains("scope=files%3Aread", body);
  }

  [Fact]
  public void Refresh_token_request_omits_scope_when_absent()
  {
    var body = TokenRequests.EncodeBody(TokenRequests.BuildRefresh("rt", "cid", "https://m/mcp"));
    Assert.DoesNotContain("scope=", body);
  }

  [Fact]
  public void Assert_resource_matches_step2()
  {
    var request = TokenRequests.BuildAuthorizationCode("c", "https://app/cb", new string('a', 43), "cid", "https://m/mcp");
    Assert.True(TokenRequests.AssertResourceMatchesStep2(request, "https://m/mcp").Ok);
    Assert.False(TokenRequests.AssertResourceMatchesStep2(request, "https://other/mcp").Ok);
  }

  // ───────────────────────── Token response (§23.5, §23.9) ─────────────────────────

  [Fact]
  public void Token_response_validates_bearer_case_insensitive()
  {
    var ok = TokenResponse.Validate(new JsonObject { ["access_token"] = "t", ["token_type"] = "bearer" }, out var token);
    Assert.True(ok.Ok);
    Assert.NotNull(token);
  }

  [Fact]
  public void Token_response_rejects_non_bearer()
  {
    var result = TokenResponse.Validate(new JsonObject { ["access_token"] = "t", ["token_type"] = "mac" }, out var token);
    Assert.False(result.Ok);
    Assert.Null(token);
  }

  [Fact]
  public void Token_response_rejects_missing_access_token() =>
    Assert.False(TokenResponse.Validate(new JsonObject { ["token_type"] = "Bearer" }, out _).Ok);

  [Fact]
  public void Token_response_has_no_refresh_token()
  {
    var withRefresh = TokenResponse.Parse(new JsonObject { ["access_token"] = "t", ["token_type"] = "Bearer", ["refresh_token"] = "rt" })!;
    Assert.False(withRefresh.HasNoRefreshToken);
    var without = TokenResponse.Parse(new JsonObject { ["access_token"] = "t", ["token_type"] = "Bearer" })!;
    Assert.True(without.HasNoRefreshToken);
  }

  // ───────────────────────── Audience validation: string OR array (§23.6) ─────────────────────────

  [Fact]
  public void Validate_audience_string_match() =>
    Assert.True(AccessTokenUsage.ValidateTokenAudience(["https://mcp.example.com/mcp"], "https://mcp.example.com/mcp").Ok);

  [Fact]
  public void Validate_audience_array_match()
  {
    var result = AccessTokenUsage.ValidateTokenAudience(["https://other/mcp", "https://mcp.example.com/mcp"], "https://mcp.example.com/mcp");
    Assert.True(result.Ok);
  }

  [Fact]
  public void Validate_audience_rejects_no_match() =>
    Assert.False(AccessTokenUsage.ValidateTokenAudience(["https://other/mcp"], "https://mcp.example.com/mcp").Ok);

  [Fact]
  public void Validate_audience_tolerates_uppercase_and_trailing_slash()
  {
    Assert.True(AccessTokenUsage.ValidateTokenAudience(["HTTPS://MCP.EXAMPLE.COM/mcp"], "https://mcp.example.com/mcp").Ok);
    Assert.True(AccessTokenUsage.ValidateTokenAudience(["https://mcp.example.com"], "https://mcp.example.com/").Ok);
  }

  [Fact]
  public void Select_token_for_server_requires_matching_issuer()
  {
    var result = AccessTokenUsage.SelectTokenForServer(
      "https://as.example.com", "https://m/mcp", "https://as.example.com", ["https://m/mcp"], "tok", out var token);
    Assert.True(result.Ok);
    Assert.Equal("tok", token);
  }

  [Fact]
  public void Select_token_for_server_rejects_wrong_issuer()
  {
    var result = AccessTokenUsage.SelectTokenForServer(
      "https://as.example.com", "https://m/mcp", "https://evil", ["https://m/mcp"], "tok", out var token);
    Assert.False(result.Ok);
    Assert.Null(token);
  }

  // ───────────────────────── Bearer header & query token (§23.8) ─────────────────────────

  [Fact]
  public void Build_bearer_header()
  {
    Assert.Equal("Bearer tok", AccessTokenUsage.BuildBearerHeader("tok"));
    Assert.Throws<ArgumentException>(() => AccessTokenUsage.BuildBearerHeader(""));
  }

  [Theory]
  [InlineData("Bearer tok", "tok")]
  [InlineData("bearer tok", "tok")]
  [InlineData("BEARER   tok  ", "tok")]
  public void Extract_bearer_token_case_insensitive(string header, string expected) =>
    Assert.Equal(expected, AccessTokenUsage.ExtractBearerToken(header));

  [Theory]
  [InlineData("Basic abc")]
  [InlineData("Bearer")]
  [InlineData("Bearer ")]
  [InlineData(null)]
  public void Extract_bearer_token_returns_null_for_non_bearer(string? header) =>
    Assert.Null(AccessTokenUsage.ExtractBearerToken(header));

  [Fact]
  public void Url_contains_access_token_in_query()
  {
    Assert.True(AccessTokenUsage.UrlContainsAccessTokenInQuery("https://m/mcp?access_token=leak"));
    Assert.False(AccessTokenUsage.UrlContainsAccessTokenInQuery("https://m/mcp?other=1"));
  }

  // ───────────────────────── Access-token request validation state machine (§23.8) ─────────────────────────

  private const string Resource = "https://mcp.example.com/mcp";
  private const string Meta = "https://mcp.example.com/.well-known/oauth-protected-resource";

  private static PresentedToken ValidToken(IReadOnlyList<string>? scopes = null) =>
    new(Active: true, Expired: false, Audience: Resource, Scopes: scopes ?? ["files:read"]);

  [Fact]
  public void Validate_request_authorized_for_valid_token()
  {
    var result = AccessTokenUsage.ValidateRequest(ValidToken(), Resource, Meta);
    Assert.True(result.Ok);
  }

  [Fact]
  public void Validate_request_missing_token_is_401()
  {
    var result = AccessTokenUsage.ValidateRequest(null, Resource, Meta);
    Assert.False(result.Ok);
    Assert.Equal(401, result.Challenge!.Status);
  }

  [Fact]
  public void Validate_request_inactive_token_is_401()
  {
    var result = AccessTokenUsage.ValidateRequest(ValidToken() with { Active = false }, Resource, Meta);
    Assert.Equal(401, result.Challenge!.Status);
  }

  [Fact]
  public void Validate_request_expired_token_is_401()
  {
    var result = AccessTokenUsage.ValidateRequest(ValidToken() with { Expired = true }, Resource, Meta);
    Assert.Equal(401, result.Challenge!.Status);
  }

  [Fact]
  public void Validate_request_wrong_audience_is_401()
  {
    var token = new PresentedToken(true, false, "https://other/mcp", ["files:read"]);
    var result = AccessTokenUsage.ValidateRequest(token, Resource, Meta);
    Assert.Equal(401, result.Challenge!.Status);
  }

  [Fact]
  public void Validate_request_missing_scope_is_403()
  {
    var result = AccessTokenUsage.ValidateRequest(ValidToken(["files:read"]), Resource, Meta, ["files:write"]);
    Assert.Equal(403, result.Challenge!.Status);
    Assert.Contains("error=\"insufficient_scope\"", result.Challenge.WwwAuthenticate);
    Assert.Contains("scope=\"files:write\"", result.Challenge.WwwAuthenticate);
  }

  [Fact]
  public void Validate_request_with_all_scopes_authorized()
  {
    var result = AccessTokenUsage.ValidateRequest(ValidToken(["files:read", "files:write"]), Resource, Meta, ["files:write"]);
    Assert.True(result.Ok);
  }

  [Fact]
  public void Validate_request_array_audience_authorized()
  {
    var token = new PresentedToken(true, false, null, ["files:read"], Audiences: ["https://other/mcp", Resource]);
    var result = AccessTokenUsage.ValidateRequest(token, Resource, Meta);
    Assert.True(result.Ok);
  }
}
