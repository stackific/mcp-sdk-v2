using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S37 — Authorization III (spec §23.11–§23.19): metadata-driven mechanism selection, CIMD
/// hosting/private_key_jwt/cache, loopback-aware <c>application_type</c> + bounded DCR retry, issuer-keyed
/// credential binding with the CIMD exemption, discovery-robustness wrappers, least-privilege scope
/// selection + the scope-union step-up flow with bounded retry, and the consolidated §23.19 security
/// predicates. Mirrors the TypeScript <c>authorization-registration.test.ts</c>.
/// </summary>
public sealed class AuthorizationRegistrationTests
{
  private static AuthorizationServerMetadata Asm(bool cimd = false, string? registrationEndpoint = null) =>
    new()
    {
      Issuer = "https://as.example.com",
      AuthorizationEndpoint = "https://as.example.com/authorize",
      TokenEndpoint = "https://as.example.com/token",
      ClientIdMetadataDocumentSupported = cimd ? true : null,
      RegistrationEndpoint = registrationEndpoint,
    };

  // ───────────────────────── Mechanism selection (§23.11) ─────────────────────────

  [Fact]
  public void Mechanism_pre_registration_wins_when_held()
  {
    var selection = RegistrationMechanism.Select(Asm(cimd: true, registrationEndpoint: "https://as/register"), hasPreRegisteredCredentials: true);
    Assert.Equal(ClientIdMechanism.PreRegistration, selection.Mechanism);
  }

  [Fact]
  public void Mechanism_cimd_when_advertised()
  {
    var selection = RegistrationMechanism.Select(Asm(cimd: true, registrationEndpoint: "https://as/register"));
    Assert.Equal(ClientIdMechanism.Cimd, selection.Mechanism);
  }

  [Fact]
  public void Mechanism_dcr_when_only_registration_endpoint()
  {
    var selection = RegistrationMechanism.Select(Asm(registrationEndpoint: "https://as/register"));
    Assert.Equal(ClientIdMechanism.Dcr, selection.Mechanism);
  }

  [Fact]
  public void Mechanism_prompt_when_nothing_applies()
  {
    var selection = RegistrationMechanism.Select(Asm());
    Assert.Equal(ClientIdMechanism.Prompt, selection.Mechanism);
  }

  [Fact]
  public void Mechanism_does_not_pick_cimd_when_unsupported_by_client()
  {
    var selection = RegistrationMechanism.Select(Asm(cimd: true), supportedMechanisms: [ClientIdMechanism.Dcr]);
    Assert.NotEqual(ClientIdMechanism.Cimd, selection.Mechanism);
  }

  [Fact]
  public void May_attempt_cimd_only_when_flag_true()
  {
    Assert.True(RegistrationMechanism.MayAttemptCimd(Asm(cimd: true)));
    Assert.False(RegistrationMechanism.MayAttemptCimd(Asm()));
  }

  [Fact]
  public void May_attempt_dcr_only_when_registration_endpoint()
  {
    Assert.True(RegistrationMechanism.MayAttemptDcr(Asm(registrationEndpoint: "https://as/register")));
    Assert.False(RegistrationMechanism.MayAttemptDcr(Asm()));
  }

  // ───────────────────────── CIMD hosting & cache (§23.12) ─────────────────────────

  [Fact]
  public void Cimd_preferred_path_requires_both()
  {
    Assert.True(CimdHosting.IsPreferredPath(true, true));
    Assert.False(CimdHosting.IsPreferredPath(true, false));
  }

  [Fact]
  public void Cimd_hosting_valid_delegates_to_url_check()
  {
    Assert.True(CimdHosting.IsHostingValid("https://app.example.com/client.json"));
    Assert.False(CimdHosting.IsHostingValid("https://app.example.com"));
  }

  [Fact]
  public void Cimd_private_key_jwt_requires_method_and_jwks()
  {
    var doc = Cimd.Parse(new JsonObject
    {
      ["client_id"] = "https://app/client.json",
      ["client_name"] = "App",
      ["redirect_uris"] = new JsonArray("http://127.0.0.1/cb"),
      ["token_endpoint_auth_method"] = "private_key_jwt",
      ["jwks_uri"] = "https://app/jwks.json",
    })!;
    Assert.True(CimdHosting.SupportsPrivateKeyJwt(doc));
  }

  [Fact]
  public void Cimd_private_key_jwt_false_without_jwks()
  {
    var doc = Cimd.Parse(new JsonObject
    {
      ["client_id"] = "https://app/client.json",
      ["client_name"] = "App",
      ["redirect_uris"] = new JsonArray("http://127.0.0.1/cb"),
      ["token_endpoint_auth_method"] = "private_key_jwt",
    })!;
    Assert.False(CimdHosting.SupportsPrivateKeyJwt(doc));
  }

  private static ClientIdMetadataDocument SimpleDoc(string clientId = "https://app.example.com/client.json") =>
    Cimd.Parse(new JsonObject
    {
      ["client_id"] = clientId,
      ["client_name"] = "App",
      ["redirect_uris"] = new JsonArray("http://127.0.0.1/cb"),
    })!;

  [Fact]
  public void Cimd_cache_stores_and_returns_fresh()
  {
    var cache = new CimdDocumentCache();
    Assert.True(cache.Store("https://app.example.com/client.json", SimpleDoc()));
    Assert.NotNull(cache.Get("https://app.example.com/client.json"));
  }

  [Fact]
  public void Cimd_cache_rejects_no_store()
  {
    var cache = new CimdDocumentCache();
    Assert.False(cache.Store("https://app.example.com/client.json", SimpleDoc(), new CimdCacheControl(NoStore: true)));
    Assert.Null(cache.Get("https://app.example.com/client.json"));
  }

  [Fact]
  public void Cimd_cache_rejects_untrusted_host()
  {
    var cache = new CimdDocumentCache(trustHost: host => host.StartsWith("app.example.com"));
    Assert.False(cache.Store("https://evil.example.com/client.json", SimpleDoc("https://evil.example.com/client.json")));
  }

  [Fact]
  public void Cimd_cache_evicts_stale_entry()
  {
    long now = 1000;
    var cache = new CimdDocumentCache(now: () => now);
    cache.Store("https://app.example.com/client.json", SimpleDoc(), new CimdCacheControl(MaxAgeSeconds: 10));
    now = 1000 + (11 * 1000);
    Assert.Null(cache.Get("https://app.example.com/client.json"));
  }

  // ───────────────────────── application_type & DCR retry (§23.15) ─────────────────────────

  [Fact]
  public void Application_type_for_loopback_redirects_is_native()
  {
    Assert.Equal(ApplicationType.Native, DcrRetry.ApplicationTypeForRedirectUris(["http://127.0.0.1:3000/cb", "http://localhost:3000/cb"]));
  }

  [Fact]
  public void Application_type_for_remote_redirect_is_web()
  {
    Assert.Equal(ApplicationType.Web, DcrRetry.ApplicationTypeForRedirectUris(["https://app.example.com/cb"]));
  }

  [Fact]
  public void Application_type_for_empty_is_web() =>
    Assert.Equal(ApplicationType.Web, DcrRetry.ApplicationTypeForRedirectUris([]));

  [Fact]
  public async Task Register_with_retry_succeeds_first_attempt()
  {
    var result = await DcrRetry.RegisterWithRetryAsync(ApplicationType.Native,
      _ => Task.FromResult<(int, JsonNode?)>((201, new JsonObject { ["client_id"] = "abc" })));
    Assert.True(result.Result.Ok);
    Assert.Single(result.Attempts);
  }

  [Fact]
  public async Task Register_with_retry_flips_application_type_on_retryable_400()
  {
    var seen = new List<ApplicationType>();
    var result = await DcrRetry.RegisterWithRetryAsync(ApplicationType.Native, appType =>
    {
      seen.Add(appType);
      // First attempt (native) fails with a retryable 400; second (web) succeeds.
      return Task.FromResult<(int, JsonNode?)>(appType == ApplicationType.Native
        ? (400, new JsonObject { ["error_description"] = "redirect_uri requires web" })
        : (201, new JsonObject { ["client_id"] = "abc" }));
    });
    Assert.True(result.Result.Ok);
    Assert.Equal([ApplicationType.Native, ApplicationType.Web], seen);
  }

  [Fact]
  public async Task Register_with_retry_stops_on_non_retryable()
  {
    var attempts = 0;
    var result = await DcrRetry.RegisterWithRetryAsync(ApplicationType.Native, _ =>
    {
      attempts++;
      return Task.FromResult<(int, JsonNode?)>((500, null));
    });
    Assert.False(result.Result.Ok);
    Assert.Equal(1, attempts);
  }

  // ───────────────────────── Credential binding (§23.16) ─────────────────────────

  [Theory]
  // Byte-identical issuers match.
  [InlineData("https://as", "https://as", true)]
  // §23.16 (R-23.16-f): the comparison is byte-for-byte — no URL normalization is applied.
  [InlineData("https://as/", "https://as", false)]               // trailing-slash difference
  [InlineData("https://AS", "https://as", false)]                // case difference
  [InlineData("https://auth.example.com:443", "https://auth.example.com", false)] // explicit default port (TV-37.9)
  [InlineData("https://auth.example.com/%2F", "https://auth.example.com/", false)] // percent-encoding (TV-37.9)
  public void Issuers_match_is_byte_for_byte_with_no_normalization(string a, string b, bool expected)
  {
    Assert.Equal(expected, CredentialBinding.IssuersMatchExactly(a, b));
  }

  [Fact]
  public void Binding_reuse_when_issuer_matches()
  {
    var stored = new IssuerBoundCredentials("https://as", "c1");
    Assert.Equal(CredentialBindingAction.Reuse, CredentialBinding.Decide(stored, "https://as").Action);
  }

  [Fact]
  public void Binding_reregister_for_dcr_on_mismatch()
  {
    var stored = new IssuerBoundCredentials("https://as1", "c1");
    Assert.Equal(CredentialBindingAction.ReRegister, CredentialBinding.Decide(stored, "https://as2").Action);
  }

  [Fact]
  public void Binding_surface_error_for_pre_registered_mismatch()
  {
    var stored = new IssuerBoundCredentials("https://as1", "c1");
    Assert.Equal(CredentialBindingAction.SurfaceError, CredentialBinding.Decide(stored, "https://as2", isPreRegistered: true).Action);
  }

  [Fact]
  public void Binding_cimd_is_exempt()
  {
    var stored = new IssuerBoundCredentials("https://as1", "https://app/client.json", Cimd: true);
    Assert.Equal(CredentialBindingAction.Reuse, CredentialBinding.Decide(stored, "https://as2").Action);
  }

  [Fact]
  public void Binding_reregister_when_none_stored() =>
    Assert.Equal(CredentialBindingAction.ReRegister, CredentialBinding.Decide(null, "https://as").Action);

  [Fact]
  public void Issuer_bound_store_isolates_and_decides()
  {
    var store = new IssuerBoundCredentialStore();
    store.Save(new IssuerBoundCredentials("https://as1", "c1"));
    Assert.Equal("c1", store.CredentialsFor("https://as1")!.ClientId);
    Assert.Null(store.CredentialsFor("https://as2"));
    Assert.Equal(CredentialBindingAction.Reuse, store.DecideFor("https://as1").Action);
  }

  [Fact]
  public void Issuer_bound_store_rejects_empty_issuer() =>
    Assert.Throws<ArgumentException>(() => new IssuerBoundCredentialStore().Save(new IssuerBoundCredentials("", "c")));

  // ───────────────────────── Discovery robustness (§23.17) ─────────────────────────

  [Fact]
  public void Protected_resource_metadata_uris_prefers_header()
  {
    var uris = DiscoveryRobustness.ProtectedResourceMetadataUris("https://m/.well-known/prm", "https://example.com/public/mcp");
    Assert.Equal(["https://m/.well-known/prm"], uris);
  }

  [Fact]
  public void Require_authorization_servers_non_empty()
  {
    Assert.True(DiscoveryRobustness.RequireAuthorizationServers(["https://as"], out var servers).Ok);
    Assert.Equal(["https://as"], servers);
  }

  [Fact]
  public void Require_authorization_servers_rejects_empty()
  {
    Assert.False(DiscoveryRobustness.RequireAuthorizationServers([], out var servers).Ok);
    Assert.Null(servers);
  }

  [Fact]
  public void Authorization_server_metadata_uris_pass_through()
  {
    var uris = DiscoveryRobustness.AuthorizationServerMetadataUris("https://auth.example.com/tenant1");
    Assert.Equal(3, uris.Count);
  }

  [Fact]
  public void Validate_discovered_issuer_exact()
  {
    Assert.True(DiscoveryRobustness.ValidateDiscoveredIssuer("https://honest", "https://honest").Ok);
    Assert.False(DiscoveryRobustness.ValidateDiscoveredIssuer("https://attacker", "https://honest").Ok);
  }

  // ───────────────────────── Scope selection & step-up (§23.18) ─────────────────────────

  [Fact]
  public void Parse_scope_set_dedupes_and_preserves_order()
  {
    Assert.Equal(["a", "b", "c"], ScopeStepUp.ParseScopeSet("a b a c b"));
    Assert.Empty(ScopeStepUp.ParseScopeSet(null));
  }

  [Fact]
  public void Union_scopes_never_drops_already_granted()
  {
    Assert.Equal(["files:read", "files:write"], ScopeStepUp.UnionScopes(["files:read"], ["files:write"]));
  }

  [Fact]
  public void Union_scopes_dedupes()
  {
    Assert.Equal(["a", "b"], ScopeStepUp.UnionScopes(["a", "b"], ["a"]));
  }

  [Fact]
  public void Select_initial_scope_delegates()
  {
    Assert.Equal("files:write", ScopeStepUp.SelectInitial(new WwwAuthenticateChallenge(Scope: "files:write"), ["files:read"]));
  }

  [Theory]
  [InlineData(StepUpActor.User, true)]
  [InlineData(StepUpActor.ClientCredentials, false)]
  public void Should_attempt_step_up(StepUpActor actor, bool expected) =>
    Assert.Equal(expected, ScopeStepUp.ShouldAttempt(actor));

  [Fact]
  public void Plan_step_up_unions_scopes_and_records()
  {
    var tracker = new ScopeUpgradeTracker();
    var plan = ScopeStepUp.Plan(
      StepUpActor.User,
      ["files:read"],
      new WwwAuthenticateChallenge(Scope: "files:write"),
      new ScopeUpgradeKey("https://m/mcp", "tools/call"),
      tracker);
    Assert.True(plan.Proceed);
    Assert.Equal(["files:read", "files:write"], plan.Scopes);
    Assert.Equal("files:read files:write", plan.Scope);
  }

  [Fact]
  public void Plan_step_up_aborts_for_client_credentials_by_default()
  {
    var plan = ScopeStepUp.Plan(
      StepUpActor.ClientCredentials,
      [],
      new WwwAuthenticateChallenge(Scope: "x"),
      new ScopeUpgradeKey("https://m", "op"),
      new ScopeUpgradeTracker());
    Assert.False(plan.Proceed);
  }

  [Fact]
  public void Plan_step_up_forces_for_client_credentials_when_opted_in()
  {
    var plan = ScopeStepUp.Plan(
      StepUpActor.ClientCredentials,
      ["a"],
      new WwwAuthenticateChallenge(Scope: "b"),
      new ScopeUpgradeKey("https://m", "op"),
      new ScopeUpgradeTracker(),
      forceForClientCredentials: true);
    Assert.True(plan.Proceed);
    Assert.Equal(["a", "b"], plan.Scopes);
  }

  [Fact]
  public void Step_up_tracker_enforces_bound()
  {
    var tracker = new ScopeUpgradeTracker(maxAttempts: 2);
    var key = new ScopeUpgradeKey("https://m", "op");
    Assert.Equal(StepUpAction.Retry, tracker.NextAction(key)); // attempt 1
    Assert.Equal(StepUpAction.Retry, tracker.NextAction(key)); // attempt 2
    Assert.Equal(StepUpAction.PermanentFailure, tracker.NextAction(key)); // attempt 3 > bound
  }

  [Fact]
  public void Step_up_tracker_tracks_per_key()
  {
    var tracker = new ScopeUpgradeTracker();
    var a = new ScopeUpgradeKey("https://m", "op1");
    var b = new ScopeUpgradeKey("https://m", "op2");
    tracker.RecordAttempt(a);
    Assert.Equal(1, tracker.AttemptsFor(a));
    Assert.Equal(0, tracker.AttemptsFor(b));
  }

  [Fact]
  public void Step_up_plan_returns_permanent_failure_when_bound_reached()
  {
    var tracker = new ScopeUpgradeTracker(maxAttempts: 1);
    var key = new ScopeUpgradeKey("https://m", "op");
    var challenge = new WwwAuthenticateChallenge(Scope: "x");
    var first = ScopeStepUp.Plan(StepUpActor.User, [], challenge, key, tracker);
    Assert.True(first.Proceed);
    var second = ScopeStepUp.Plan(StepUpActor.User, [], challenge, key, tracker);
    Assert.False(second.Proceed); // bound reached
  }

  [Fact]
  public void Tracker_rejects_invalid_max_attempts() =>
    Assert.Throws<ArgumentOutOfRangeException>(() => new ScopeUpgradeTracker(0));

  // ───────────────────────── Security predicates (§23.19) ─────────────────────────

  [Fact]
  public void Check_resource_parameter_binding_requires_both_match()
  {
    Assert.True(AuthorizationSecurity.CheckResourceParameterBinding("https://m", "https://m", "https://m").Ok);
    Assert.False(AuthorizationSecurity.CheckResourceParameterBinding("https://m", "https://other", "https://m").Ok);
    Assert.False(AuthorizationSecurity.CheckResourceParameterBinding("https://other", "https://m", "https://m").Ok);
  }

  [Fact]
  public void May_forward_token_only_when_issuers_match()
  {
    Assert.True(AuthorizationSecurity.MayForwardTokenToServer("https://as", "https://as"));
    Assert.False(AuthorizationSecurity.MayForwardTokenToServer("https://as1", "https://as2"));
  }

  [Fact]
  public void Validate_exact_issuer_delegates_to_decision_table()
  {
    Assert.False(AuthorizationSecurity.ValidateExactIssuer("https://evil", "https://as", issParameterSupported: null).Ok);
    Assert.True(AuthorizationSecurity.ValidateExactIssuer("https://as", "https://as", issParameterSupported: null).Ok);
  }

  [Fact]
  public void Same_request_record_requires_all_three()
  {
    Assert.True(AuthorizationSecurity.SameRequestRecord(new SecureAuthorizationRequestRecord("https://as", "verifier", "state")).Ok);
    Assert.False(AuthorizationSecurity.SameRequestRecord(new SecureAuthorizationRequestRecord(null, "verifier", "state")).Ok);
    Assert.False(AuthorizationSecurity.SameRequestRecord(new SecureAuthorizationRequestRecord("https://as", null, "state")).Ok);
    Assert.False(AuthorizationSecurity.SameRequestRecord(new SecureAuthorizationRequestRecord("https://as", "verifier", null)).Ok);
  }

  [Fact]
  public void Redact_token_never_embeds_secret() =>
    Assert.Equal("[REDACTED]", AuthorizationSecurity.RedactToken());

  [Fact]
  public void Is_confidential_token_is_unconditional() =>
    Assert.True(AuthorizationSecurity.TokensAreConfidential);

  [Fact]
  public void Check_bearer_header_only_rejects_query_token()
  {
    Assert.False(AuthorizationSecurity.CheckBearerHeaderOnly("https://m/mcp?access_token=leak", hasAuthorizationHeader: true).Ok);
  }

  [Fact]
  public void Check_bearer_header_only_requires_header()
  {
    Assert.False(AuthorizationSecurity.CheckBearerHeaderOnly("https://m/mcp", hasAuthorizationHeader: false).Ok);
    Assert.True(AuthorizationSecurity.CheckBearerHeaderOnly("https://m/mcp", hasAuthorizationHeader: true).Ok);
  }

  [Fact]
  public void Grant_types_with_refresh_dedupes()
  {
    Assert.Equal(["authorization_code", "refresh_token"], AuthorizationSecurity.GrantTypesWithRefresh(["authorization_code"]));
    Assert.Equal(["refresh_token"], AuthorizationSecurity.GrantTypesWithRefresh(["refresh_token"]));
  }

  [Fact]
  public void With_offline_access_if_advertised()
  {
    Assert.Equal(["a", "offline_access"], AuthorizationSecurity.WithOfflineAccessIfAdvertised(["a"], ["offline_access"]));
    Assert.Equal(["a"], AuthorizationSecurity.WithOfflineAccessIfAdvertised(["a"], ["b"]));
  }

  [Fact]
  public void Refresh_token_is_never_assumed() =>
    Assert.True(AuthorizationSecurity.RefreshTokenAlwaysOptional);

  [Fact]
  public void Server_scopes_omit_offline_access()
  {
    Assert.True(AuthorizationSecurity.ServerScopesOmitOfflineAccess("files:read", ["files:read"]).Ok);
    Assert.False(AuthorizationSecurity.ServerScopesOmitOfflineAccess("offline_access", null).Ok);
    Assert.False(AuthorizationSecurity.ServerScopesOmitOfflineAccess(null, ["offline_access"]).Ok);
  }
}
