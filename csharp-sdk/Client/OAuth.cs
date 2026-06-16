using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Client;

// Deliberately supports Deprecated Dynamic Client Registration (§23.11) for backward compatibility,
// so it references the [Obsolete] DynamicClientRegistrationRequest type.
#pragma warning disable CS0618

/// <summary>
/// An OAuth 2.1 client flow (spec §23) for an MCP <see cref="Transport.StreamableHttpClientTransport"/>:
/// PKCE (<c>S256</c>) generation and the §28.5 support gate, two-stage protected-resource →
/// authorization-server metadata discovery with the RFC 8414/OIDC fallback ordering and the RFC 9207
/// issuer mix-up check, parsing of the <c>WWW-Authenticate</c> challenge on a <c>401</c>, dynamic client
/// registration (RFC 7591) with retryable-failure surfacing, the authorize-URL builder, the
/// authorization-code token exchange and the refresh-token exchange (RFC 8707 audience binding), and
/// redirect verification (CSRF/mix-up defenses). The C# counterpart of ts-sdk's <c>client/oauth.ts</c>.
/// </summary>
/// <remarks>
/// The flow primitives (PKCE, discovery URI ordering, metadata schemas/validators, the <c>iss</c>
/// decision table) live in <see cref="Stackific.Mcp.Protocol.Pkce"/>,
/// <see cref="Stackific.Mcp.Protocol.WellKnownDiscovery"/>,
/// <see cref="Stackific.Mcp.Protocol.ProtectedResourceMetadata"/>,
/// <see cref="Stackific.Mcp.Protocol.AuthorizationServerMetadata"/>, and
/// <see cref="Stackific.Mcp.Protocol.AuthorizationRedirect"/>; this class is the HTTP wiring that drives
/// them with an injectable <see cref="HttpClient"/> (so the discovery/registration/token calls are
/// offline-testable through a stub <see cref="HttpMessageHandler"/>).
/// </remarks>
public static class OAuth
{
  /// <summary>A PKCE verifier/challenge pair (spec §23.5).</summary>
  /// <param name="CodeVerifier">The high-entropy verifier kept by the client.</param>
  /// <param name="CodeChallenge">The <c>S256</c> challenge derived from the verifier and sent to the AS.</param>
  public sealed record PkcePair(string CodeVerifier, string CodeChallenge);

  /// <summary>The discovered OAuth metadata for a protected MCP resource (spec §23.2–§23.3).</summary>
  /// <param name="Issuer">The authorization-server issuer URL.</param>
  /// <param name="ProtectedResource">The RFC 9728 protected-resource metadata document.</param>
  /// <param name="AuthorizationServer">The RFC 8414 authorization-server metadata document.</param>
  public sealed record OAuthMetadata(string Issuer, JsonObject ProtectedResource, JsonObject AuthorizationServer);

  /// <summary>A dynamically registered client (spec §23.4 / RFC 7591).</summary>
  /// <param name="ClientId">The issued client identifier.</param>
  /// <param name="ClientSecret">The issued client secret, when the AS returned one.</param>
  public sealed record RegisteredClient(string ClientId, string? ClientSecret);

  /// <summary>A token-endpoint response (spec §23.5).</summary>
  public sealed record TokenResponse
  {
    /// <summary>REQUIRED. The issued access token (the bearer credential).</summary>
    [JsonPropertyName("access_token")]
    public required string AccessToken { get; init; }

    /// <summary>REQUIRED. The token type (for example <c>Bearer</c>).</summary>
    [JsonPropertyName("token_type")]
    public required string TokenType { get; init; }

    /// <summary>OPTIONAL. The granted scope (space-delimited).</summary>
    [JsonPropertyName("scope")]
    public string? Scope { get; init; }

    /// <summary>OPTIONAL. The access token's lifetime in seconds.</summary>
    [JsonPropertyName("expires_in")]
    public int? ExpiresIn { get; init; }

    /// <summary>
    /// OPTIONAL. The issued refresh token, at the authorization server's discretion (§23.9, R-23.9-d).
    /// A client MUST NOT assume one is issued; <c>null</c> when none was.
    /// </summary>
    [JsonPropertyName("refresh_token")]
    public string? RefreshToken { get; init; }
  }

  /// <summary>
  /// Generates a PKCE <c>S256</c> pair (spec §23.5): a random 32-byte verifier (base64url) and the
  /// challenge <c>base64url(SHA256(verifier))</c>. Backed by <c>System.Security.Cryptography</c> via
  /// <see cref="Stackific.Mcp.Protocol.Pkce"/>.
  /// </summary>
  /// <returns>The PKCE pair.</returns>
  public static PkcePair CreatePkcePair()
  {
    var challenge = Pkce.CreateChallenge();
    return new PkcePair(challenge.CodeVerifier, challenge.CodeChallenge);
  }

  /// <summary>
  /// Parses a <c>401</c> response's <c>WWW-Authenticate</c> header into the structured <c>Bearer</c>
  /// challenge a client reacts to (spec §23.1, R-23.1-z): the <c>resource_metadata</c> URI to fetch and
  /// the required <c>scope</c>. Returns <c>null</c> when the response carried no parseable <c>Bearer</c>
  /// challenge.
  /// </summary>
  /// <param name="response">The HTTP response (typically a <c>401</c>) to inspect.</param>
  /// <returns>The parsed challenge, or <c>null</c>.</returns>
  public static WwwAuthenticateChallenge? ParseChallenge(HttpResponseMessage response)
  {
    if (!response.Headers.TryGetValues(AuthorizationConstants.WwwAuthenticateHeader, out var values))
    {
      return null;
    }
    return WwwAuthenticate.Parse(string.Join(", ", values));
  }

  /// <summary>
  /// Discovers protected-resource metadata (RFC 9728) then authorization-server metadata (RFC 8414/OIDC)
  /// for an MCP endpoint, walking the full well-known fallback ordering and validating both documents
  /// (spec §23.2–§23.3).
  /// </summary>
  /// <remarks>
  /// <para>
  /// Protected-resource discovery honours the <c>resource_metadata</c> precedence: when
  /// <paramref name="resourceMetadataUrl"/> is supplied (typically from the <c>401</c>'s
  /// <c>WWW-Authenticate</c> header, R-23.2-d) it is used directly; otherwise the path-aware then
  /// host-root well-known URIs are tried in order, using the first that yields a valid document
  /// (R-23.2-e, R-23.2-f). The returned <c>resource</c> MUST equal <paramref name="resource"/> (R-23.2-h).
  /// </para>
  /// <para>
  /// The selected issuer's metadata is then discovered by trying the OAuth-AS-Metadata and
  /// OpenID-Connect-Discovery well-known URIs in the mandated priority order (R-23.3-c) and validating
  /// the document's <c>issuer</c> EXACTLY matches the issuer used to fetch it — the RFC 9207 mix-up
  /// defence (R-23.3-d, R-23.3-e). A document whose <c>issuer</c> differs is rejected.
  /// </para>
  /// </remarks>
  /// <param name="http">The HTTP client to use (injectable for offline tests).</param>
  /// <param name="resource">The canonical resource identifier (the protected MCP endpoint URL).</param>
  /// <param name="resourceMetadataUrl">The protected-resource metadata URL from the <c>401</c> challenge, or <c>null</c> to use the well-known fallback ordering.</param>
  /// <returns>The discovered, validated metadata (issuer, protected-resource, authorization-server).</returns>
  /// <exception cref="McpError">When no valid, issuer-matching metadata can be discovered.</exception>
  public static async Task<OAuthMetadata> DiscoverOAuthMetadataAsync(HttpClient http, string resource, string? resourceMetadataUrl)
  {
    var prmUris = WellKnownDiscovery.ResolveProtectedResourceUris(resourceMetadataUrl, resource);
    if (prmUris.Count == 0)
    {
      throw McpError.InvalidParams("no protected-resource metadata URL or well-known fallback could be resolved (§23.2, R-23.2-g).");
    }

    ProtectedResourceMetadata? prm = null;
    JsonObject? prmJson = null;
    foreach (var uri in prmUris)
    {
      var fetched = await TryGetJsonObjectAsync(http, uri).ConfigureAwait(false);
      if (fetched is null)
      {
        continue;
      }
      var prmResult = ProtectedResourceMetadata.Validate(fetched, resource, out var parsed);
      if (prmResult.Ok)
      {
        prm = parsed;
        prmJson = fetched;
        break;
      }
    }
    if (prm is null || prmJson is null)
    {
      throw McpError.InvalidParams($"no valid protected-resource metadata found for \"{resource}\" (§23.2, R-23.2-h).");
    }

    var issuer = prm.SelectAuthorizationServer()
      ?? throw McpError.InvalidParams("protected-resource metadata lists no authorization_servers (§23.2, R-23.2-i).");

    foreach (var asUri in WellKnownDiscovery.AuthorizationServerUris(issuer))
    {
      var fetched = await TryGetJsonObjectAsync(http, asUri).ConfigureAwait(false);
      if (fetched is null)
      {
        continue;
      }
      // Validate including the mix-up issuer-match check (R-23.3-d, R-23.3-e). A document whose issuer
      // differs from the one we fetched it for is rejected outright — we do NOT fall through to it.
      if (AuthorizationServerMetadata.Validate(fetched, issuer, out _).Ok)
      {
        return new OAuthMetadata(issuer, prmJson, fetched);
      }
    }

    throw McpError.InvalidParams($"no valid, issuer-matching authorization-server metadata found for issuer \"{issuer}\" (§23.3, R-23.3-d, R-23.3-e).");
  }

  /// <summary>
  /// Confirms, from already-discovered authorization-server metadata, that the AS advertises PKCE
  /// <c>S256</c> support, throwing when it cannot be confirmed so the client refuses to proceed
  /// (spec §28.5, R-28.5-k). Call before building an authorization request.
  /// </summary>
  /// <param name="asMeta">The authorization-server metadata.</param>
  /// <exception cref="PkceSupportException">When PKCE <c>S256</c> support cannot be confirmed.</exception>
  public static void AssertPkceSupported(JsonObject asMeta)
  {
    var methods = AuthorizationJson.StringArray(asMeta["code_challenge_methods_supported"]);
    PkceSupport.AssertConfirmed(methods);
  }

  /// <summary>
  /// Performs dynamic client registration (spec §23.4 / RFC 7591): POSTs to the AS metadata's
  /// <c>registration_endpoint</c> with the client name, redirect URIs, the <c>authorization_code</c>
  /// grant, and an <c>application_type</c> classified from the redirect URIs (loopback ⇒ <c>native</c>).
  /// Throws on a hard failure; for retryable-aware handling use <see cref="TryRegisterClientAsync"/>.
  /// </summary>
  /// <param name="http">The HTTP client to use.</param>
  /// <param name="asMeta">The authorization-server metadata.</param>
  /// <param name="clientName">The human-readable client name.</param>
  /// <param name="redirectUris">The client's redirect URIs.</param>
  /// <returns>The registered client (id and optional secret).</returns>
  /// <exception cref="McpError">When the AS has no <c>registration_endpoint</c>, or registration fails.</exception>
  public static async Task<RegisteredClient> RegisterClientAsync(
    HttpClient http,
    JsonObject asMeta,
    string clientName,
    IReadOnlyList<string> redirectUris)
  {
    var result = await TryRegisterClientAsync(http, asMeta, clientName, redirectUris).ConfigureAwait(false);
    if (!result.Ok)
    {
      throw McpError.InternalError($"dynamic client registration failed: {result.Reason}");
    }
    return new RegisteredClient(result.Response.ClientId, result.Response.ClientSecret);
  }

  /// <summary>
  /// Performs dynamic client registration (spec §23.4 / RFC 7591), surfacing a structured result rather
  /// than throwing so the client can handle a registration failure and decide whether to retry with an
  /// adjusted <c>application_type</c> (R-23.4-p, R-23.4-q, R-23.4-r). The body always carries the REQUIRED
  /// <c>application_type</c>, classified from the redirect URIs.
  /// </summary>
  /// <param name="http">The HTTP client to use.</param>
  /// <param name="asMeta">The authorization-server metadata.</param>
  /// <param name="clientName">The human-readable client name.</param>
  /// <param name="redirectUris">The client's redirect URIs.</param>
  /// <param name="grantTypes">OPTIONAL requested grant types (e.g. include <c>refresh_token</c> for refresh; R-23.9-a).</param>
  /// <returns>The structured registration result (success or a meaningful, possibly-retryable failure).</returns>
  /// <exception cref="McpError">When the AS metadata has no <c>registration_endpoint</c>.</exception>
  public static async Task<DynamicClientRegistrationResult> TryRegisterClientAsync(
    HttpClient http,
    JsonObject asMeta,
    string clientName,
    IReadOnlyList<string> redirectUris,
    IReadOnlyList<string>? grantTypes = null)
  {
    var endpoint = asMeta["registration_endpoint"]?.GetValue<string>()
      ?? throw McpError.InvalidParams("authorization server has no registration_endpoint.");

    var request = new DynamicClientRegistrationRequest(
      redirectUris,
      DcrRetry.ApplicationTypeForRedirectUris(redirectUris),
      clientName,
      grantTypes ?? [OAuthValues.GrantTypeAuthorizationCode]);

    using var content = new StringContent(request.ToJson().ToJsonString(), Encoding.UTF8, "application/json");
    using var response = await http.PostAsync(endpoint, content).ConfigureAwait(false);
    var body = await ReadJsonNodeAsync(response).ConfigureAwait(false);
    return Dcr.HandleResponse((int)response.StatusCode, body);
  }

  /// <summary>
  /// Builds the authorization-request URL (spec §23.5): the AS metadata's <c>authorization_endpoint</c>
  /// with <c>response_type=code</c>, the client id, redirect URI, scope, state, PKCE challenge
  /// (<c>code_challenge_method=S256</c>), and the RFC 8707 <c>resource</c> parameter for audience binding
  /// (§23.6). Existing query parameters on the endpoint are preserved.
  /// </summary>
  /// <param name="asMeta">The authorization-server metadata.</param>
  /// <param name="clientId">The client identifier.</param>
  /// <param name="redirectUri">The redirect URI the code is returned to.</param>
  /// <param name="resource">The protected resource (audience binding, §23.6).</param>
  /// <param name="scope">The requested scope.</param>
  /// <param name="state">The CSRF state to round-trip and verify (§23.5).</param>
  /// <param name="codeChallenge">The PKCE <c>S256</c> challenge.</param>
  /// <returns>The fully-formed authorization URL.</returns>
  /// <exception cref="McpError">When the AS metadata has no <c>authorization_endpoint</c>.</exception>
  public static string BuildAuthorizeUrl(
    JsonObject asMeta,
    string clientId,
    string redirectUri,
    string resource,
    string scope,
    string state,
    string codeChallenge)
  {
    var endpoint = asMeta["authorization_endpoint"]?.GetValue<string>()
      ?? throw McpError.InvalidParams("authorization server has no authorization_endpoint.");

    var parameters = new AuthorizationRequestParams(clientId, redirectUri, codeChallenge, resource, scope, state);
    return AuthorizationRequest.BuildUrl(endpoint, parameters);
  }

  /// <summary>
  /// Exchanges an authorization code (+ PKCE verifier) for tokens (spec §23.5): POSTs a form-urlencoded
  /// body to the AS metadata's <c>token_endpoint</c> with <c>grant_type=authorization_code</c>, the code,
  /// the verifier, the redirect URI, the client id, and the RFC 8707 <c>resource</c> parameter so the
  /// token is audience-bound to this server (§23.6). Validates the response and that <c>token_type</c> is
  /// <c>Bearer</c> (case-insensitive; R-23.8-b).
  /// </summary>
  /// <param name="http">The HTTP client to use.</param>
  /// <param name="asMeta">The authorization-server metadata.</param>
  /// <param name="clientId">The client identifier.</param>
  /// <param name="code">The authorization code returned to the redirect URI.</param>
  /// <param name="codeVerifier">The PKCE verifier that derived the challenge.</param>
  /// <param name="redirectUri">The redirect URI the code was returned to.</param>
  /// <param name="resource">The protected resource (audience binding, §23.6).</param>
  /// <returns>The token-endpoint response.</returns>
  /// <exception cref="McpError">When the AS has no <c>token_endpoint</c>, or the response is invalid.</exception>
  public static async Task<TokenResponse> ExchangeAuthorizationCodeAsync(
    HttpClient http,
    JsonObject asMeta,
    string clientId,
    string code,
    string codeVerifier,
    string redirectUri,
    string resource)
  {
    var request = TokenRequests.BuildAuthorizationCode(code, redirectUri, codeVerifier, clientId, resource);
    return await PostTokenRequestAsync(http, asMeta, request).ConfigureAwait(false);
  }

  /// <summary>
  /// Refreshes an access token (spec §23.9): POSTs a form-urlencoded body to the AS metadata's
  /// <c>token_endpoint</c> with <c>grant_type=refresh_token</c>, the refresh token, the client id, and the
  /// SAME RFC 8707 <c>resource</c> parameter so the refreshed token stays audience-bound (R-23.9-e). An
  /// OPTIONAL narrowed <paramref name="scope"/> MAY be supplied (R-23.9-f). The new refresh token (when
  /// issued) is returned on <see cref="TokenResponse.RefreshToken"/>.
  /// </summary>
  /// <param name="http">The HTTP client to use.</param>
  /// <param name="asMeta">The authorization-server metadata.</param>
  /// <param name="clientId">The client identifier.</param>
  /// <param name="refreshToken">The refresh token being exchanged.</param>
  /// <param name="resource">The same canonical resource identifier as the original request (audience binding).</param>
  /// <param name="scope">OPTIONAL narrowed scopes (R-23.9-f).</param>
  /// <returns>The token-endpoint response (a fresh access token, still audience-bound).</returns>
  /// <exception cref="McpError">When the AS has no <c>token_endpoint</c>, or the response is invalid.</exception>
  public static async Task<TokenResponse> RefreshTokenAsync(
    HttpClient http,
    JsonObject asMeta,
    string clientId,
    string refreshToken,
    string resource,
    string? scope = null)
  {
    var request = TokenRequests.BuildRefresh(refreshToken, clientId, resource, scope);
    return await PostTokenRequestAsync(http, asMeta, request).ConfigureAwait(false);
  }

  /// <summary>
  /// Verifies the authorization redirect before redeeming the code (spec §23.5/§23.7): the returned
  /// <paramref name="returnedState"/> MUST equal <paramref name="sentState"/> (CSRF defense, R-23.5-l), and
  /// the <c>iss</c> is validated per the §23.7 decision table — a PRESENT <paramref name="returnedIss"/> is
  /// ALWAYS compared to <paramref name="issuer"/> by exact string match regardless of advertisement
  /// (R-23.7-f), and an ABSENT <c>iss</c> is rejected when the AS advertises support (R-23.7-e). Throws
  /// <see cref="McpError"/> (<c>-32602</c>) on any mismatch.
  /// </summary>
  /// <param name="sentState">The state value sent in the authorization request.</param>
  /// <param name="returnedState">The state value returned on the redirect.</param>
  /// <param name="issuer">The authorization-server issuer (the recorded issuer).</param>
  /// <param name="returnedIss">The <c>iss</c> value returned on the redirect, if any.</param>
  /// <param name="issParameterSupported">Whether the AS advertises the <c>iss</c> parameter.</param>
  /// <exception cref="McpError">On a state or <c>iss</c> validation failure.</exception>
  public static void VerifyAuthorizationRedirect(
    string sentState,
    string? returnedState,
    string issuer,
    string? returnedIss,
    bool issParameterSupported)
  {
    var stateResult = AuthorizationRedirect.VerifyState(sentState, returnedState);
    if (!stateResult.Ok)
    {
      throw McpError.InvalidParams($"OAuth redirect `state` mismatch — possible CSRF; refusing to redeem the code (§23.5). {stateResult.Reason}");
    }

    var issResult = AuthorizationRedirect.ValidateIssuer(returnedIss, issuer, issParameterSupported);
    if (!issResult.Ok)
    {
      throw McpError.InvalidParams($"OAuth redirect `iss` validation failed — possible mix-up (§23.7). {issResult.Reason}");
    }
  }

  /// <summary>POSTs a token request to the AS token endpoint and validates the response.</summary>
  private static async Task<TokenResponse> PostTokenRequestAsync(HttpClient http, JsonObject asMeta, ITokenRequest request)
  {
    var endpoint = asMeta["token_endpoint"]?.GetValue<string>()
      ?? throw McpError.InvalidParams("authorization server has no token_endpoint.");

    using var content = new StringContent(TokenRequests.EncodeBody(request), Encoding.UTF8, "application/x-www-form-urlencoded");
    using var response = await http.PostAsync(endpoint, content).ConfigureAwait(false);
    if (!response.IsSuccessStatusCode)
    {
      throw McpError.InternalError($"token endpoint returned HTTP {(int)response.StatusCode}.");
    }

    var body = await ReadJsonNodeAsync(response).ConfigureAwait(false);
    var validation = Protocol.TokenResponse.Validate(body, out var token);
    if (token is null)
    {
      throw McpError.InternalError($"token endpoint returned an invalid response: {validation.Reason ?? "missing token"}");
    }
    return new TokenResponse
    {
      AccessToken = token.AccessToken,
      TokenType = token.TokenType,
      Scope = token.Scope,
      ExpiresIn = token.ExpiresIn,
      RefreshToken = token.RefreshToken,
    };
  }

  /// <summary>GETs a JSON object, returning <c>null</c> on a non-success status or unreadable body (so discovery can fall through).</summary>
  private static async Task<JsonObject?> TryGetJsonObjectAsync(HttpClient http, string url)
  {
    try
    {
      using var response = await http.GetAsync(url).ConfigureAwait(false);
      if (!response.IsSuccessStatusCode)
      {
        return null;
      }
      return await ReadJsonObjectAsync(response).ConfigureAwait(false);
    }
    catch (HttpRequestException)
    {
      return null;
    }
  }

  private static async Task<JsonObject?> ReadJsonObjectAsync(HttpResponseMessage response) =>
    await ReadJsonNodeAsync(response).ConfigureAwait(false) as JsonObject;

  private static async Task<JsonNode?> ReadJsonNodeAsync(HttpResponseMessage response)
  {
    try
    {
      return await response.Content.ReadFromJsonAsync<JsonNode>().ConfigureAwait(false);
    }
    catch (System.Text.Json.JsonException)
    {
      return null;
    }
  }
}
