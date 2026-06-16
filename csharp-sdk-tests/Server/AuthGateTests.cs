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
  public void Metadata_handles_empty_servers_and_scopes()
  {
    var meta = AuthGates.BuildProtectedResourceMetadata(Resource, [], []);
    Assert.Empty((JsonArray)meta["authorization_servers"]!);
    Assert.Empty((JsonArray)meta["scopes_supported"]!);
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
    // The prefix match is case-sensitive "Bearer " (with trailing space); anything else is rejected.
    var result = await AcceptingGate().AuthorizeAsync(Context(header));
    Assert.False(result.Authorized);
    Assert.Equal(401, result.ChallengeStatus);
  }

  [Fact]
  public async Task Lowercase_bearer_scheme_is_rejected()
  {
    // Ordinal prefix check: "bearer " (lowercase) does not match "Bearer ".
    var result = await AcceptingGate().AuthorizeAsync(Context("bearer good-token"));
    Assert.False(result.Authorized);
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
  public void Redirect_ignores_iss_when_not_supported()
  {
    // When the AS does not advertise the iss parameter, a returned iss is not checked.
    OAuth.VerifyAuthorizationRedirect("state-1", "state-1", "https://as.example.com", "https://whatever.example.com", issParameterSupported: false);
  }

  [Fact]
  public void Redirect_state_comparison_is_case_sensitive()
  {
    var error = Assert.Throws<McpError>(() =>
      OAuth.VerifyAuthorizationRedirect("State", "state", "https://as.example.com", null, false));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }
}
