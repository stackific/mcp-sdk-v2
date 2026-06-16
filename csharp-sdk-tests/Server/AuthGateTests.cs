using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;

using Stackific.Mcp.Client;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Behavior coverage for the server bearer-auth gate and the client OAuth helpers (spec §23):
/// RFC 9728 protected-resource metadata (§23.2); the <c>Bearer</c> gate's 401 challenge, malformed and
/// missing headers, <c>validate</c> rejection, audience binding (§23.6), and success path (§23.1); and
/// the client's PKCE <c>S256</c> derivation (§23.5), authorize-URL composition, and redirect
/// verification (CSRF/mix-up defenses, §23.5/§23.7).
/// </summary>
public sealed class AuthGateTests
{
  private const string Resource = "https://mcp.example.com/sse";
  private const string MetadataUrl = "https://mcp.example.com/.well-known/oauth-protected-resource";

  private static HttpContext Context(string? authorization = null)
  {
    var context = new DefaultHttpContext();
    if (authorization is not null) context.Request.Headers.Authorization = authorization;
    return context;
  }

  // ───────────────────────── BuildProtectedResourceMetadata (RFC 9728, §23.2) ─────────────────────────

  [Fact]
  public void Metadata_carries_resource_identifier()
  {
    var meta = AuthGates.BuildProtectedResourceMetadata(Resource, ["https://as.example.com"], ["mcp:read"]);
    Assert.Equal(Resource, meta["resource"]!.GetValue<string>());
  }

  [Fact]
  public void Metadata_carries_authorization_servers()
  {
    var meta = AuthGates.BuildProtectedResourceMetadata(Resource, ["https://as.example.com", "https://as2.example.com"], ["mcp:read"]);
    var servers = (JsonArray)meta["authorization_servers"]!;
    Assert.Equal(2, servers.Count);
    Assert.Equal("https://as.example.com", servers[0]!.GetValue<string>());
    Assert.Equal("https://as2.example.com", servers[1]!.GetValue<string>());
  }

  [Fact]
  public void Metadata_carries_scopes_supported()
  {
    var meta = AuthGates.BuildProtectedResourceMetadata(Resource, ["https://as.example.com"], ["mcp:read", "mcp:write"]);
    var scopes = (JsonArray)meta["scopes_supported"]!;
    Assert.Equal(["mcp:read", "mcp:write"], scopes.Select(s => s!.GetValue<string>()));
  }

  [Fact]
  public void Metadata_bearer_methods_supported_is_header_only()
  {
    var meta = AuthGates.BuildProtectedResourceMetadata(Resource, ["https://as.example.com"], []);
    var methods = (JsonArray)meta["bearer_methods_supported"]!;
    Assert.Equal(["header"], methods.Select(m => m!.GetValue<string>()));
  }

  [Fact]
  public void Metadata_handles_empty_servers_and_omits_empty_scopes()
  {
    // Per the TypeScript builder (server/auth.ts), `scopes_supported` is emitted ONLY when scopes are
    // provided; an empty scope set omits the field entirely rather than serializing an empty array.
    var meta = AuthGates.BuildProtectedResourceMetadata(Resource, [], []);
    Assert.Empty((JsonArray)meta["authorization_servers"]!);
    Assert.False(meta.ContainsKey("scopes_supported"));
  }

  [Fact]
  public void Metadata_omits_scopes_supported_when_no_scopes()
  {
    var meta = AuthGates.BuildProtectedResourceMetadata(Resource, ["https://as.example.com"], []);
    Assert.False(meta.ContainsKey("scopes_supported"));
  }

  // ───────────────────────── Bearer gate challenges (§23.1) ─────────────────────────

  private static IMcpAuthGate Gate(Func<string, AuthInfo?> validate) =>
    AuthGates.Bearer(MetadataUrl, Resource, validate);

  private static IMcpAuthGate AcceptingGate(string clientId = "client-1", IReadOnlyList<string>? scopes = null) =>
    Gate(token => new AuthInfo(token, ClientId: clientId, Scopes: scopes ?? ["mcp:read"], Audience: Resource));

  [Fact]
  public async Task No_authorization_header_is_unauthorized()
  {
    var result = await Gate(_ => null).AuthorizeAsync(Context());
    Assert.False(result.Authorized);
    Assert.Null(result.Identity);
  }

  [Fact]
  public async Task No_authorization_header_challenges_401()
  {
    var result = await Gate(_ => null).AuthorizeAsync(Context());
    Assert.Equal(401, result.ChallengeStatus);
  }

  [Fact]
  public async Task No_authorization_header_challenge_carries_resource_metadata()
  {
    var result = await Gate(_ => null).AuthorizeAsync(Context());
    Assert.NotNull(result.WwwAuthenticate);
    Assert.Contains($"resource_metadata=\"{MetadataUrl}\"", result.WwwAuthenticate);
  }

  [Fact]
  public async Task Challenge_uses_bearer_scheme()
  {
    var result = await Gate(_ => null).AuthorizeAsync(Context());
    Assert.StartsWith("Bearer ", result.WwwAuthenticate);
  }

  [Fact]
  public async Task Empty_authorization_header_is_unauthorized()
  {
    var result = await AcceptingGate().AuthorizeAsync(Context(""));
    Assert.False(result.Authorized);
    Assert.Equal(401, result.ChallengeStatus);
  }

  [Theory]
  [InlineData("Basic abc123")]
  [InlineData("token abc123")]
  [InlineData("bearerabc")]
  [InlineData("Bearerabc")]
  [InlineData("xBearer abc")]
  public async Task Malformed_authorization_header_is_unauthorized(string header)
  {
    // A non-Bearer scheme, or a single token with no scheme/space, carries no extractable Bearer token.
    var result = await AcceptingGate().AuthorizeAsync(Context(header));
    Assert.False(result.Authorized);
    Assert.Equal(401, result.ChallengeStatus);
  }

  [Theory]
  [InlineData("bearer good-token")]
  [InlineData("BEARER good-token")]
  [InlineData("BeArEr good-token")]
  public async Task Bearer_scheme_is_case_insensitive(string header)
  {
    // RFC 7235 auth-scheme names are case-insensitive; the TS `extractBearerToken` matches accordingly,
    // so "bearer"/"BEARER" are accepted (the previous Ordinal prefix check was stricter than the spec).
    var result = await AcceptingGate().AuthorizeAsync(Context(header));
    Assert.True(result.Authorized);
    Assert.Equal("good-token", result.Identity!.Token);
  }

  [Fact]
  public async Task Bearer_with_blank_token_is_unauthorized()
  {
    var result = await AcceptingGate().AuthorizeAsync(Context("Bearer    "));
    Assert.False(result.Authorized);
    Assert.Equal(401, result.ChallengeStatus);
  }

  [Fact]
  public async Task Validate_returning_null_is_unauthorized()
  {
    var result = await Gate(_ => null).AuthorizeAsync(Context("Bearer some-token"));
    Assert.False(result.Authorized);
    Assert.Equal(401, result.ChallengeStatus);
    Assert.Contains("resource_metadata", result.WwwAuthenticate!);
  }

  // ───────────────────────── Audience binding (§23.6) ─────────────────────────

  [Fact]
  public async Task Token_with_wrong_audience_is_rejected()
  {
    var gate = Gate(token => new AuthInfo(token, ClientId: "c", Audience: "https://other.example.com"));
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.False(result.Authorized);
    Assert.Equal(401, result.ChallengeStatus);
  }

  [Fact]
  public async Task Token_with_null_audience_is_rejected()
  {
    var gate = Gate(token => new AuthInfo(token, ClientId: "c", Audience: null));
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.False(result.Authorized);
  }

  [Fact]
  public async Task Token_with_correct_audience_is_authorized()
  {
    var result = await AcceptingGate().AuthorizeAsync(Context("Bearer good-token"));
    Assert.True(result.Authorized);
    Assert.NotNull(result.Identity);
  }

  [Fact]
  public async Task Authorized_identity_carries_client_id_and_scopes()
  {
    var gate = AcceptingGate(clientId: "client-42", scopes: ["mcp:read", "mcp:write"]);
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.True(result.Authorized);
    Assert.Equal("client-42", result.Identity!.ClientId);
    Assert.Equal(["mcp:read", "mcp:write"], result.Identity.Scopes!);
  }

  [Fact]
  public async Task Authorized_identity_carries_audience()
  {
    var result = await AcceptingGate().AuthorizeAsync(Context("Bearer good-token"));
    Assert.Equal(Resource, result.Identity!.Audience);
  }

  [Fact]
  public async Task Validate_receives_the_exact_token_string()
  {
    string? seen = null;
    var gate = Gate(token => { seen = token; return new AuthInfo(token, Audience: Resource); });
    await gate.AuthorizeAsync(Context("Bearer my-precise-token-123"));
    Assert.Equal("my-precise-token-123", seen);
  }

  [Fact]
  public async Task Validate_receives_token_without_surrounding_whitespace()
  {
    string? seen = null;
    var gate = Gate(token => { seen = token; return new AuthInfo(token, Audience: Resource); });
    await gate.AuthorizeAsync(Context("Bearer   spaced-token   "));
    Assert.Equal("spaced-token", seen);
  }

  [Fact]
  public async Task Authorized_token_is_threaded_into_identity()
  {
    var result = await AcceptingGate().AuthorizeAsync(Context("Bearer the-token"));
    Assert.Equal("the-token", result.Identity!.Token);
  }

  // ───────────────────────── Client OAuth: PKCE (§23.5) ─────────────────────────

  private static byte[] FromBase64Url(string value)
  {
    var padded = value.Replace('-', '+').Replace('_', '/');
    padded = (padded.Length % 4) switch { 2 => padded + "==", 3 => padded + "=", _ => padded };
    return Convert.FromBase64String(padded);
  }

  [Fact]
  public void Pkce_challenge_equals_base64url_sha256_of_verifier()
  {
    var pair = OAuth.CreatePkcePair();
    var expected = Convert.ToBase64String(SHA256.HashData(Encoding.ASCII.GetBytes(pair.CodeVerifier)))
      .Replace('+', '-').Replace('/', '_').TrimEnd('=');
    Assert.Equal(expected, pair.CodeChallenge);
  }

  [Fact]
  public void Pkce_verifier_decodes_to_32_bytes()
  {
    var pair = OAuth.CreatePkcePair();
    Assert.Equal(32, FromBase64Url(pair.CodeVerifier).Length);
  }

  [Fact]
  public void Pkce_challenge_is_unpadded_base64url()
  {
    var pair = OAuth.CreatePkcePair();
    Assert.DoesNotContain('=', pair.CodeChallenge);
    Assert.DoesNotContain('+', pair.CodeChallenge);
    Assert.DoesNotContain('/', pair.CodeChallenge);
  }

  [Fact]
  public void Pkce_verifier_is_unpadded_base64url()
  {
    var pair = OAuth.CreatePkcePair();
    Assert.DoesNotContain('=', pair.CodeVerifier);
    Assert.DoesNotContain('+', pair.CodeVerifier);
    Assert.DoesNotContain('/', pair.CodeVerifier);
  }

  [Fact]
  public void Pkce_pairs_are_random_per_call()
  {
    var a = OAuth.CreatePkcePair();
    var b = OAuth.CreatePkcePair();
    Assert.NotEqual(a.CodeVerifier, b.CodeVerifier);
    Assert.NotEqual(a.CodeChallenge, b.CodeChallenge);
  }

  // ───────────────────────── Client OAuth: BuildAuthorizeUrl (§23.5) ─────────────────────────

  private static JsonObject AsMeta(string endpoint = "https://as.example.com/authorize") =>
    new() { ["authorization_endpoint"] = endpoint };

  private static IReadOnlyDictionary<string, string?> QueryOf(string url) =>
    QueryHelpers.ParseQuery(new Uri(url).Query).ToDictionary(p => p.Key, p => (string?)p.Value);

  [Fact]
  public void Authorize_url_uses_the_authorization_endpoint()
  {
    var url = OAuth.BuildAuthorizeUrl(AsMeta(), "cid", "https://app/cb", Resource, "mcp:read", "st", "chal");
    Assert.StartsWith("https://as.example.com/authorize?", url);
  }

  [Fact]
  public void Authorize_url_has_response_type_code()
  {
    var q = QueryOf(OAuth.BuildAuthorizeUrl(AsMeta(), "cid", "https://app/cb", Resource, "mcp:read", "st", "chal"));
    Assert.Equal("code", q["response_type"]);
  }

  [Fact]
  public void Authorize_url_has_code_challenge_method_s256()
  {
    var q = QueryOf(OAuth.BuildAuthorizeUrl(AsMeta(), "cid", "https://app/cb", Resource, "mcp:read", "st", "the-challenge"));
    Assert.Equal("S256", q["code_challenge_method"]);
    Assert.Equal("the-challenge", q["code_challenge"]);
  }

  [Fact]
  public void Authorize_url_carries_client_id()
  {
    var q = QueryOf(OAuth.BuildAuthorizeUrl(AsMeta(), "my-client", "https://app/cb", Resource, "mcp:read", "st", "chal"));
    Assert.Equal("my-client", q["client_id"]);
  }

  [Fact]
  public void Authorize_url_carries_redirect_uri()
  {
    var q = QueryOf(OAuth.BuildAuthorizeUrl(AsMeta(), "cid", "https://app/callback", Resource, "mcp:read", "st", "chal"));
    Assert.Equal("https://app/callback", q["redirect_uri"]);
  }

  [Fact]
  public void Authorize_url_carries_scope()
  {
    var q = QueryOf(OAuth.BuildAuthorizeUrl(AsMeta(), "cid", "https://app/cb", Resource, "mcp:read mcp:write", "st", "chal"));
    Assert.Equal("mcp:read mcp:write", q["scope"]);
  }

  [Fact]
  public void Authorize_url_carries_state()
  {
    var q = QueryOf(OAuth.BuildAuthorizeUrl(AsMeta(), "cid", "https://app/cb", Resource, "mcp:read", "csrf-state-xyz", "chal"));
    Assert.Equal("csrf-state-xyz", q["state"]);
  }

  [Fact]
  public void Authorize_url_carries_resource_for_audience_binding()
  {
    var q = QueryOf(OAuth.BuildAuthorizeUrl(AsMeta(), "cid", "https://app/cb", Resource, "mcp:read", "st", "chal"));
    Assert.Equal(Resource, q["resource"]);
  }

  [Fact]
  public void Authorize_url_appends_with_ampersand_when_endpoint_has_query()
  {
    var url = OAuth.BuildAuthorizeUrl(AsMeta("https://as.example.com/authorize?tenant=acme"), "cid", "https://app/cb", Resource, "mcp:read", "st", "chal");
    var q = QueryOf(url);
    Assert.Equal("acme", q["tenant"]);
    Assert.Equal("code", q["response_type"]);
  }

  [Fact]
  public void Authorize_url_throws_when_endpoint_missing()
  {
    var error = Assert.Throws<McpError>(() =>
      OAuth.BuildAuthorizeUrl(new JsonObject(), "cid", "https://app/cb", Resource, "mcp:read", "st", "chal"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ───────────────────────── Client OAuth: VerifyAuthorizationRedirect (§23.5/§23.7) ─────────────────────────

  [Fact]
  public void Redirect_passes_when_state_matches_and_iss_unsupported()
  {
    OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", returnedIss: null, issParameterSupported: false);
  }

  [Fact]
  public void Redirect_throws_on_state_mismatch()
  {
    var error = Assert.Throws<McpError>(() =>
      OAuth.VerifyAuthorizationRedirect("state-1", "state-2", "https://as.example.com", null, false));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Redirect_throws_when_returned_state_is_null()
  {
    var error = Assert.Throws<McpError>(() =>
      OAuth.VerifyAuthorizationRedirect("state-1", null, "https://as.example.com", null, false));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Redirect_passes_when_state_and_iss_both_match()
  {
    OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", "https://as.example.com", issParameterSupported: true);
  }

  [Fact]
  public void Redirect_throws_on_iss_mismatch_when_supported()
  {
    var error = Assert.Throws<McpError>(() =>
      OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", "https://evil.example.com", issParameterSupported: true));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Redirect_throws_when_iss_missing_but_supported()
  {
    var error = Assert.Throws<McpError>(() =>
      OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", returnedIss: null, issParameterSupported: true));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Redirect_compares_present_iss_even_when_not_advertised()
  {
    // R-23.7-f: a PRESENT iss MUST be compared regardless of advertisement; a mismatch is rejected even
    // when `authorization_response_iss_parameter_supported` is false (mix-up defence).
    var error = Assert.Throws<McpError>(() =>
      OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", "https://whatever.example.com", issParameterSupported: false));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Redirect_passes_with_matching_present_iss_when_not_advertised()
  {
    // A present iss that matches the recorded issuer passes even when not advertised.
    OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", "https://as.example.com", issParameterSupported: false);
  }

  [Fact]
  public void Redirect_proceeds_when_iss_absent_and_not_advertised()
  {
    // R-23.7-d row 4: iss absent + not advertised → proceed without comparison.
    OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", returnedIss: null, issParameterSupported: false);
  }

  [Fact]
  public void Redirect_state_comparison_is_case_sensitive()
  {
    var error = Assert.Throws<McpError>(() =>
      OAuth.VerifyAuthorizationRedirect("State", "state", "https://as.example.com", null, false));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ───────────────────────── Required scopes → 403 insufficient_scope (§23.8, R-23.8-f) ─────────────────────────

  private static IMcpAuthGate ScopedGate(IReadOnlyList<string> requiredScopes, IReadOnlyList<string>? tokenScopes = null) =>
    AuthGates.Bearer(new BearerAuthGateOptions(
      MetadataUrl,
      Resource,
      token => new AuthInfo(token, ClientId: "c", Scopes: tokenScopes ?? ["mcp:read"], Audience: Resource),
      RequiredScopes: requiredScopes));

  [Fact]
  public async Task Token_missing_required_scope_is_forbidden_403()
  {
    var gate = ScopedGate(["mcp:write"], tokenScopes: ["mcp:read"]);
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.False(result.Authorized);
    Assert.Equal(403, result.ChallengeStatus);
  }

  [Fact]
  public async Task Insufficient_scope_challenge_carries_error_and_scope_and_metadata()
  {
    var gate = ScopedGate(["mcp:write"], tokenScopes: ["mcp:read"]);
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.Contains("error=\"insufficient_scope\"", result.WwwAuthenticate!);
    Assert.Contains("scope=\"mcp:write\"", result.WwwAuthenticate);
    Assert.Contains($"resource_metadata=\"{MetadataUrl}\"", result.WwwAuthenticate);
  }

  [Fact]
  public async Task Insufficient_scope_challenge_lists_all_required_scopes_in_one_challenge()
  {
    // R-23.1-ac: include ALL required scopes in a single challenge, not incrementally.
    var gate = ScopedGate(["mcp:read", "mcp:write"], tokenScopes: ["mcp:read"]);
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.Equal(403, result.ChallengeStatus);
    Assert.Contains("scope=\"mcp:read mcp:write\"", result.WwwAuthenticate!);
  }

  [Fact]
  public async Task Token_with_all_required_scopes_is_authorized()
  {
    var gate = ScopedGate(["mcp:read", "mcp:write"], tokenScopes: ["mcp:read", "mcp:write", "mcp:admin"]);
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.True(result.Authorized);
  }

  [Fact]
  public async Task Unauthenticated_request_to_scoped_gate_challenges_401_with_scope()
  {
    // A missing token yields 401 (not 403); the challenge advertises the required scopes (R-23.1-w).
    var gate = ScopedGate(["mcp:write"]);
    var result = await gate.AuthorizeAsync(Context());
    Assert.Equal(401, result.ChallengeStatus);
    Assert.Contains("scope=\"mcp:write\"", result.WwwAuthenticate!);
  }

  // ───────────────────────── Audience: string OR array, trailing-slash tolerance (§23.6) ─────────────────────────

  [Fact]
  public async Task Audience_matches_with_uppercase_scheme_and_host()
  {
    // R-23.1-p: canonical comparison accepts uppercase scheme/host for robustness.
    var gate = Gate(token => new AuthInfo(token, Audience: "HTTPS://MCP.EXAMPLE.COM/sse"));
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.True(result.Authorized);
  }

  [Fact]
  public async Task Host_root_audience_tolerates_trailing_slash()
  {
    // `https://h` and `https://h/` are canonically identical (R-23.1-s).
    var gate = AuthGates.Bearer(MetadataUrl, "https://mcp.example.com", _ =>
      new AuthInfo("t", Audience: "https://mcp.example.com/"));
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.True(result.Authorized);
  }

  // ───────────────────────── Token expiry → 401 (§23.8, R-23.8-e) ─────────────────────────

  [Fact]
  public async Task Expired_token_is_unauthorized_401()
  {
    var pastSeconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - 60;
    var gate = Gate(token => new AuthInfo(token, Audience: Resource, ExpiresAt: pastSeconds));
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.False(result.Authorized);
    Assert.Equal(401, result.ChallengeStatus);
  }

  [Fact]
  public async Task Unexpired_token_is_authorized()
  {
    var futureSeconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 3600;
    var gate = Gate(token => new AuthInfo(token, Scopes: ["mcp:read"], Audience: Resource, ExpiresAt: futureSeconds));
    var result = await gate.AuthorizeAsync(Context("Bearer good-token"));
    Assert.True(result.Authorized);
  }

  // ───────────────────────── WWW-Authenticate escaping (RFC 7235) ─────────────────────────

  [Fact]
  public async Task Challenge_escapes_quotes_in_resource_metadata()
  {
    // A metadata URL containing a double-quote must be backslash-escaped so it cannot break the header.
    var gate = AuthGates.Bearer("https://mcp.example.com/meta\"x", Resource, _ => null);
    var result = await gate.AuthorizeAsync(Context());
    Assert.Contains("resource_metadata=\"https://mcp.example.com/meta\\\"x\"", result.WwwAuthenticate!);
  }
}
