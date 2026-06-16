using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S35 — Authorization I (spec §23.1–§23.3): transport applicability, per-issuer credential
/// isolation, canonical-resource-identifier construction/validation/equality, the <c>WWW-Authenticate</c>
/// build/parse (with RFC 7235 escaping), the <c>401</c>/<c>403</c> challenge builders, the PRM/ASM schemas
/// and validators (including the issuer mix-up check), and the path-aware well-known discovery ordering.
/// Mirrors the TypeScript <c>authorization.test.ts</c>.
/// </summary>
public sealed class AuthorizationTests
{
  // ───────────────────────── Applicability (§23.1, R-23.1-a – R-23.1-c) ─────────────────────────

  [Theory]
  [InlineData(TransportFamily.Http, true)]
  [InlineData(TransportFamily.Stdio, false)]
  [InlineData(TransportFamily.Other, false)]
  public void Authorization_applies_only_to_http(TransportFamily transport, bool applies) =>
    Assert.Equal(applies, AuthorizationApplicability.AppliesTo(transport));

  [Theory]
  [InlineData(TransportFamily.Stdio, true)]
  [InlineData(TransportFamily.Http, false)]
  [InlineData(TransportFamily.Other, false)]
  public void Only_stdio_is_forbidden(TransportFamily transport, bool forbidden) =>
    Assert.Equal(forbidden, AuthorizationApplicability.ForbiddenFor(transport));

  [Theory]
  [InlineData(TransportFamily.Http, CredentialConveyance.Bearer)]
  [InlineData(TransportFamily.Stdio, CredentialConveyance.Environment)]
  [InlineData(TransportFamily.Other, CredentialConveyance.BestPractice)]
  public void Credential_conveyance_per_transport(TransportFamily transport, CredentialConveyance conveyance) =>
    Assert.Equal(conveyance, AuthorizationApplicability.ConveyanceFor(transport));

  // ───────────────────────── CredentialStore (§23.1, R-23.1-i – R-23.1-l) ─────────────────────────

  [Fact]
  public void Credential_store_isolates_per_issuer()
  {
    var store = new CredentialStore();
    store.Register(new AuthorizationServerRegistration("https://as1.example.com", ClientId: "c1"));
    store.Register(new AuthorizationServerRegistration("https://as2.example.com", ClientId: "c2"));
    Assert.Equal("c1", store.CredentialsFor("https://as1.example.com")!.ClientId);
    Assert.Equal("c2", store.CredentialsFor("https://as2.example.com")!.ClientId);
  }

  [Fact]
  public void Credential_store_returns_null_for_unknown_issuer() =>
    Assert.Null(new CredentialStore().CredentialsFor("https://unknown.example.com"));

  [Fact]
  public void Needs_reregistration_when_issuer_changes()
  {
    var store = new CredentialStore();
    store.Register(new AuthorizationServerRegistration("https://as1.example.com", ClientId: "c1"));
    Assert.True(store.NeedsReregistration("https://as1.example.com", "https://as2.example.com"));
  }

  [Fact]
  public void Needs_reregistration_when_no_credentials_stored() =>
    Assert.True(new CredentialStore().NeedsReregistration(null, "https://as.example.com"));

  [Fact]
  public void No_reregistration_when_issuer_unchanged_and_stored()
  {
    var store = new CredentialStore();
    store.Register(new AuthorizationServerRegistration("https://as.example.com", ClientId: "c"));
    Assert.False(store.NeedsReregistration("https://as.example.com", "https://as.example.com"));
  }

  // ───────────────────────── Canonical resource identifier (§23.1, R-23.1-m – R-23.1-s) ─────────────────────────

  [Fact]
  public void Canonicalizes_https_endpoint()
  {
    Assert.True(CanonicalResourceIdentifier.TryCanonicalize("https://mcp.example.com/mcp", out var canonical, out _));
    Assert.Equal("https://mcp.example.com/mcp", canonical);
  }

  [Fact]
  public void Canonicalizes_host_root_to_bare_origin()
  {
    Assert.True(CanonicalResourceIdentifier.TryCanonicalize("https://mcp.example.com/", out var canonical, out _));
    Assert.Equal("https://mcp.example.com", canonical);
  }

  [Fact]
  public void Canonicalization_lowercases_scheme_and_host()
  {
    Assert.True(CanonicalResourceIdentifier.TryCanonicalize("HTTPS://MCP.EXAMPLE.COM/MCP", out var canonical, out _));
    Assert.Equal("https://mcp.example.com/MCP", canonical); // path stays case-sensitive
  }

  [Fact]
  public void Rejects_relative_uri()
  {
    Assert.False(CanonicalResourceIdentifier.TryCanonicalize("mcp.example.com", out _, out var reason));
    Assert.Contains("absolute URI", reason);
  }

  [Fact]
  public void Rejects_non_loopback_http()
  {
    Assert.False(CanonicalResourceIdentifier.TryCanonicalize("http://mcp.example.com", out _, out var reason));
    Assert.Contains("loopback", reason);
  }

  [Theory]
  [InlineData("http://localhost:3000/mcp")]
  [InlineData("http://127.0.0.1/mcp")]
  public void Allows_loopback_http(string url) =>
    Assert.True(CanonicalResourceIdentifier.IsValid(url));

  [Fact]
  public void Rejects_fragment()
  {
    Assert.False(CanonicalResourceIdentifier.TryCanonicalize("https://mcp.example.com/mcp#frag", out _, out var reason));
    Assert.Contains("fragment", reason);
  }

  [Fact]
  public void Resource_equality_accepts_uppercase_scheme_host() =>
    Assert.True(CanonicalResourceIdentifier.Equal("HTTPS://MCP.EXAMPLE.COM/mcp", "https://mcp.example.com/mcp"));

  [Fact]
  public void Resource_equality_is_case_sensitive_on_path() =>
    Assert.False(CanonicalResourceIdentifier.Equal("https://mcp.example.com/MCP", "https://mcp.example.com/mcp"));

  [Fact]
  public void Host_root_equality_tolerates_trailing_slash() =>
    Assert.True(CanonicalResourceIdentifier.Equal("https://mcp.example.com", "https://mcp.example.com/"));

  [Fact]
  public void Strip_default_trailing_slash_on_path()
  {
    Assert.Equal("https://mcp.example.com/mcp", CanonicalResourceIdentifier.StripDefaultTrailingSlash("https://mcp.example.com/mcp/"));
  }

  [Fact]
  public void Strip_default_trailing_slash_preserves_significant()
  {
    Assert.Equal("https://mcp.example.com/mcp/", CanonicalResourceIdentifier.StripDefaultTrailingSlash("https://mcp.example.com/mcp/", slashIsSignificant: true));
  }

  [Fact]
  public void Strip_default_trailing_slash_leaves_host_root()
  {
    Assert.Equal("https://mcp.example.com/", CanonicalResourceIdentifier.StripDefaultTrailingSlash("https://mcp.example.com/"));
  }

  // ───────────────────────── WWW-Authenticate build (§23.1, R-23.1-t – R-23.1-ad) ─────────────────────────

  [Fact]
  public void Unauthorized_value_carries_resource_metadata()
  {
    var value = WwwAuthenticate.BuildUnauthorizedValue("https://mcp.example.com/.well-known/oauth-protected-resource");
    Assert.StartsWith("Bearer ", value);
    Assert.Contains("resource_metadata=\"https://mcp.example.com/.well-known/oauth-protected-resource\"", value);
  }

  [Fact]
  public void Unauthorized_value_includes_scope_when_present()
  {
    var value = WwwAuthenticate.BuildUnauthorizedValue("https://mcp.example.com/meta", "files:read");
    Assert.Contains("scope=\"files:read\"", value);
  }

  [Fact]
  public void Unauthorized_value_requires_resource_metadata() =>
    Assert.Throws<ArgumentException>(() => WwwAuthenticate.BuildUnauthorizedValue(""));

  [Fact]
  public void Insufficient_scope_value_carries_error_scope_metadata()
  {
    var value = WwwAuthenticate.BuildInsufficientScopeValue("files:write", "https://mcp.example.com/meta", "needs write");
    Assert.Contains("error=\"insufficient_scope\"", value);
    Assert.Contains("scope=\"files:write\"", value);
    Assert.Contains("resource_metadata=\"https://mcp.example.com/meta\"", value);
    Assert.Contains("error_description=\"needs write\"", value);
  }

  [Fact]
  public void Insufficient_scope_value_requires_scope() =>
    Assert.Throws<ArgumentException>(() => WwwAuthenticate.BuildInsufficientScopeValue("", "https://m"));

  [Fact]
  public void Challenge_value_escapes_quotes_and_backslashes()
  {
    var value = WwwAuthenticate.BuildValue(new WwwAuthenticateChallenge(ResourceMetadata: "a\"b\\c"));
    Assert.Contains("resource_metadata=\"a\\\"b\\\\c\"", value);
  }

  // ───────────────────────── WWW-Authenticate parse (§23.1, R-23.1-z) ─────────────────────────

  [Fact]
  public void Parses_quoted_params()
  {
    var challenge = WwwAuthenticate.Parse("Bearer resource_metadata=\"https://m/meta\", scope=\"a b\"");
    Assert.NotNull(challenge);
    Assert.Equal("https://m/meta", challenge!.ResourceMetadata);
    Assert.Equal("a b", challenge.Scope);
  }

  [Fact]
  public void Parses_bare_token_params()
  {
    var challenge = WwwAuthenticate.Parse("Bearer error=insufficient_scope");
    Assert.Equal("insufficient_scope", challenge!.Error);
  }

  [Fact]
  public void Parse_scheme_is_case_insensitive()
  {
    Assert.NotNull(WwwAuthenticate.Parse("bearer resource_metadata=\"https://m\""));
    Assert.NotNull(WwwAuthenticate.Parse("BEARER resource_metadata=\"https://m\""));
  }

  [Fact]
  public void Parse_returns_null_for_non_bearer() =>
    Assert.Null(WwwAuthenticate.Parse("Basic realm=\"x\""));

  [Fact]
  public void Parse_unescapes_quoted_values()
  {
    var challenge = WwwAuthenticate.Parse("Bearer error_description=\"a \\\"quote\\\" here\"");
    Assert.Equal("a \"quote\" here", challenge!.ErrorDescription);
  }

  [Fact]
  public void Parse_round_trips_build()
  {
    var built = WwwAuthenticate.BuildInsufficientScopeValue("files:write", "https://m/meta\"x", "desc");
    var parsed = WwwAuthenticate.Parse(built);
    Assert.Equal("insufficient_scope", parsed!.Error);
    Assert.Equal("files:write", parsed.Scope);
    Assert.Equal("https://m/meta\"x", parsed.ResourceMetadata);
    Assert.Equal("desc", parsed.ErrorDescription);
  }

  [Fact]
  public void Challenged_scopes_split_on_whitespace()
  {
    var scopes = WwwAuthenticate.ChallengedScopes(new WwwAuthenticateChallenge(Scope: "a  b c"));
    Assert.Equal(["a", "b", "c"], scopes);
  }

  [Fact]
  public void Challenged_scopes_empty_when_no_scope() =>
    Assert.Empty(WwwAuthenticate.ChallengedScopes(new WwwAuthenticateChallenge()));

  [Fact]
  public void Is_insufficient_scope_challenge() =>
    Assert.True(WwwAuthenticate.IsInsufficientScopeChallenge(new WwwAuthenticateChallenge(Error: "insufficient_scope")));

  // ───────────────────────── Protected Resource Metadata (§23.2) ─────────────────────────

  private static JsonObject Prm(string resource = "https://mcp.example.com/mcp") => new()
  {
    ["resource"] = resource,
    ["authorization_servers"] = new JsonArray("https://as.example.com"),
    ["scopes_supported"] = new JsonArray("files:read", "files:write"),
  };

  [Fact]
  public void Prm_parses_valid_document()
  {
    var prm = ProtectedResourceMetadata.Parse(Prm());
    Assert.NotNull(prm);
    Assert.Equal("https://mcp.example.com/mcp", prm!.Resource);
    Assert.Equal(["https://as.example.com"], prm.AuthorizationServers);
  }

  [Fact]
  public void Prm_rejects_missing_resource()
  {
    var doc = Prm();
    doc.Remove("resource");
    Assert.Null(ProtectedResourceMetadata.Parse(doc));
  }

  [Fact]
  public void Prm_rejects_empty_authorization_servers()
  {
    var doc = Prm();
    doc["authorization_servers"] = new JsonArray();
    Assert.Null(ProtectedResourceMetadata.Parse(doc));
  }

  [Fact]
  public void Prm_validate_matches_canonical_resource()
  {
    var result = ProtectedResourceMetadata.Validate(Prm(), "https://mcp.example.com/mcp", out var metadata);
    Assert.True(result.Ok);
    Assert.NotNull(metadata);
  }

  [Fact]
  public void Prm_validate_rejects_resource_mismatch()
  {
    var result = ProtectedResourceMetadata.Validate(Prm(), "https://other.example.com/mcp", out var metadata);
    Assert.False(result.Ok);
    Assert.Null(metadata);
  }

  [Fact]
  public void Prm_validate_accepts_uppercase_resource()
  {
    var result = ProtectedResourceMetadata.Validate(Prm("HTTPS://MCP.EXAMPLE.COM/mcp"), "https://mcp.example.com/mcp", out _);
    Assert.True(result.Ok);
  }

  [Fact]
  public void Select_authorization_server_defaults_to_first()
  {
    var prm = ProtectedResourceMetadata.Parse(new JsonObject
    {
      ["resource"] = "https://m/mcp",
      ["authorization_servers"] = new JsonArray("https://as1", "https://as2"),
    })!;
    Assert.Equal("https://as1", prm.SelectAuthorizationServer());
  }

  [Fact]
  public void Select_authorization_server_honours_prefer()
  {
    var prm = ProtectedResourceMetadata.Parse(new JsonObject
    {
      ["resource"] = "https://m/mcp",
      ["authorization_servers"] = new JsonArray("https://as1", "https://as2"),
    })!;
    Assert.Equal("https://as2", prm.SelectAuthorizationServer(i => i == "https://as2"));
  }

  // ───────────────────────── Authorization Server Metadata (§23.3) ─────────────────────────

  private static JsonObject Asm(string issuer = "https://as.example.com") => new()
  {
    ["issuer"] = issuer,
    ["authorization_endpoint"] = $"{issuer}/authorize",
    ["token_endpoint"] = $"{issuer}/token",
    ["response_types_supported"] = new JsonArray("code"),
    ["code_challenge_methods_supported"] = new JsonArray("S256"),
  };

  [Fact]
  public void Asm_parses_valid_document()
  {
    var asm = AuthorizationServerMetadata.Parse(Asm());
    Assert.NotNull(asm);
    Assert.Equal("https://as.example.com/authorize", asm!.AuthorizationEndpoint);
    Assert.Equal("https://as.example.com/token", asm.TokenEndpoint);
  }

  [Theory]
  [InlineData("issuer")]
  [InlineData("authorization_endpoint")]
  [InlineData("token_endpoint")]
  public void Asm_rejects_missing_required_field(string field)
  {
    var doc = Asm();
    doc.Remove(field);
    Assert.Null(AuthorizationServerMetadata.Parse(doc));
  }

  [Fact]
  public void Asm_rejects_response_types_without_code()
  {
    var doc = Asm();
    doc["response_types_supported"] = new JsonArray("token");
    Assert.Null(AuthorizationServerMetadata.Parse(doc));
  }

  [Fact]
  public void Asm_rejects_code_challenge_methods_without_s256()
  {
    var doc = Asm();
    doc["code_challenge_methods_supported"] = new JsonArray("plain");
    Assert.Null(AuthorizationServerMetadata.Parse(doc));
  }

  [Fact]
  public void Asm_validate_requires_exact_issuer_match()
  {
    var result = AuthorizationServerMetadata.Validate(Asm("https://as.example.com"), "https://as.example.com", out var metadata);
    Assert.True(result.Ok);
    Assert.NotNull(metadata);
  }

  [Fact]
  public void Asm_validate_rejects_issuer_mixup()
  {
    // The document claims to be the attacker's issuer; we fetched it expecting the honest one → reject.
    var result = AuthorizationServerMetadata.Validate(Asm("https://attacker.example"), "https://honest.example", out var metadata);
    Assert.False(result.Ok);
    Assert.Null(metadata);
    Assert.Contains("MUST NOT use the document", result.Reason);
  }

  [Fact]
  public void Asm_validate_issuer_match_is_exact_no_trailing_slash_tolerance()
  {
    var result = AuthorizationServerMetadata.Validate(Asm("https://as.example.com/"), "https://as.example.com", out _);
    Assert.False(result.Ok);
  }

  // ───────────────────────── Well-known discovery ordering (§23.2, §23.3) ─────────────────────────

  [Fact]
  public void Protected_resource_uris_path_aware_then_root()
  {
    var uris = WellKnownDiscovery.ProtectedResourceUris("https://example.com/public/mcp");
    Assert.Equal(
    [
      "https://example.com/.well-known/oauth-protected-resource/public/mcp",
      "https://example.com/.well-known/oauth-protected-resource",
    ], uris);
  }

  [Fact]
  public void Protected_resource_uris_root_only_for_host_endpoint()
  {
    var uris = WellKnownDiscovery.ProtectedResourceUris("https://example.com");
    Assert.Equal(["https://example.com/.well-known/oauth-protected-resource"], uris);
  }

  [Fact]
  public void Resolve_protected_resource_uris_prefers_header()
  {
    var uris = WellKnownDiscovery.ResolveProtectedResourceUris("https://m/.well-known/prm", "https://example.com/public/mcp");
    Assert.Equal(["https://m/.well-known/prm"], uris);
  }

  [Fact]
  public void Resolve_protected_resource_uris_empty_when_neither()
  {
    Assert.Empty(WellKnownDiscovery.ResolveProtectedResourceUris(null, null));
  }

  [Fact]
  public void As_uris_with_path_three_in_order()
  {
    var uris = WellKnownDiscovery.AuthorizationServerUris("https://auth.example.com/tenant1");
    Assert.Equal(
    [
      "https://auth.example.com/.well-known/oauth-authorization-server/tenant1",
      "https://auth.example.com/.well-known/openid-configuration/tenant1",
      "https://auth.example.com/tenant1/.well-known/openid-configuration",
    ], uris);
  }

  [Fact]
  public void As_uris_without_path_two_in_order()
  {
    var uris = WellKnownDiscovery.AuthorizationServerUris("https://auth.example.com");
    Assert.Equal(
    [
      "https://auth.example.com/.well-known/oauth-authorization-server",
      "https://auth.example.com/.well-known/openid-configuration",
    ], uris);
  }
}
