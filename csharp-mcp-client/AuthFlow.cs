using System.Text.Json.Nodes;

using Microsoft.AspNetCore.WebUtilities;

using Stackific.Mcp.Client;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace CSharpMcpClient;

/// <summary>
/// Drives the full MCP authorization handshake (spec §23) against the demo Authorization Server +
/// protected resource, emitting a debug frame for every hop so the SPA can show the OAuth 2.1 dance
/// under the hood. The C# counterpart of ts-mcp-client's <c>auth-flow.ts</c>:
/// <list type="number">
///   <item>unauthenticated call → 401 + <c>WWW-Authenticate</c></item>
///   <item>protected-resource metadata (RFC 9728)</item>
///   <item>authorization-server metadata (RFC 8414, issuer verified)</item>
///   <item>dynamic client registration (RFC 7591)</item>
///   <item>authorization request with PKCE (S256) → authorization code</item>
///   <item>token via <c>authorization_code</c> + verifier (OAuth 2.1 / PKCE, resource-bound)</item>
///   <item>authorized MCP <c>tools/call</c> (whoami) — the server sees <c>ctx.AuthInfo</c></item>
/// </list>
/// </summary>
public static class AuthFlow
{
  /// <summary>
  /// Runs the seven-step authorization flow against <paramref name="authServerUrl"/>, using
  /// <paramref name="frontendUrl"/> to form the redirect URI, and returns a result the REST layer
  /// serializes for the SPA.
  /// </summary>
  /// <param name="host">The client host (used for the debug <see cref="DebugBus"/>).</param>
  /// <param name="authServerUrl">The Authorization Server + protected-resource origin (no trailing slash needed).</param>
  /// <param name="frontendUrl">The frontend origin used to build the redirect URI.</param>
  /// <returns>A result object: steps, grant, token (+ masked), scope, authInfo, whoami.</returns>
  public static async Task<object> RunAsync(ClientHost host, string authServerUrl, string frontendUrl)
  {
    authServerUrl = authServerUrl.TrimEnd('/');
    frontendUrl = frontendUrl.TrimEnd('/');
    var protectedMcp = $"{authServerUrl}/mcp";
    var redirectUri = $"{frontendUrl}/oauth/callback";

    var steps = new List<object>();

    void Note(string dir, string summary) =>
      host.Bus.Emit(new Frame(0, 0, dir, "note", "oauth", Summary: summary, Trace: "authorization"));

    void Add(int n, string title, string method, string url, object status, object? detail = null)
    {
      steps.Add(new { n, title, method, url, status, detail });
      Note("recv", $"{n}. {title} → {status}");
    }

    // A non-redirecting HTTP client so step 5 can capture the redirect Location manually.
    using var handler = new HttpClientHandler { AllowAutoRedirect = false };
    using var http = new HttpClient(handler);

    // ── 1. Unauthenticated probe → expect 401 with a WWW-Authenticate challenge ──
    // The TS reference POSTs `initialize`; against the Stackific.Mcp server the modern handshake is
    // `server/discover` carrying the required `_meta` envelope (§4.3) and the `Mcp-Method` /
    // `MCP-Protocol-Version` headers (§9.3.3/§9.4.1). Without them the request is rejected at the
    // transport layer with a 400 *before* the bearer gate runs — so a faithful probe that actually
    // reaches the gate (and elicits the 401 challenge) uses the server's conventions.
    Note("send", "1. unauthenticated discover → protected resource");
    var probeBody = new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["id"] = 1,
      ["method"] = McpMethods.Discover,
      ["params"] = new JsonObject
      {
        ["_meta"] = new JsonObject
        {
          ["io.modelcontextprotocol/protocolVersion"] = ProtocolRevision.Current,
          ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "probe", ["version"] = "0" },
          ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
        },
      },
    };
    using var probeRequest = new HttpRequestMessage(HttpMethod.Post, protectedMcp)
    {
      Content = new StringContent(probeBody.ToJsonString(), System.Text.Encoding.UTF8, "application/json"),
    };
    probeRequest.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
    probeRequest.Headers.TryAddWithoutValidation("MCP-Protocol-Version", ProtocolRevision.Current);
    probeRequest.Headers.TryAddWithoutValidation("Mcp-Method", McpMethods.Discover);
    using var probe = await http.SendAsync(probeRequest).ConfigureAwait(false);
    var wwwAuth = probe.Headers.TryGetValues("WWW-Authenticate", out var challengeValues)
      ? string.Join(", ", challengeValues)
      : string.Empty;
    Add(1, "Unauthenticated call (expect 401)", "POST", protectedMcp, (int)probe.StatusCode,
      new { wwwAuthenticate = wwwAuth });

    // ── 2–3. Discover protected-resource → authorization-server metadata (RFC 9728 → RFC 8414) ──
    var prmUrl = ExtractResourceMetadata(wwwAuth) ?? $"{authServerUrl}/.well-known/oauth-protected-resource";
    Note("send", "2. discover protected-resource → authorization-server metadata (SDK)");
    var discovered = await OAuth.DiscoverOAuthMetadataAsync(http, protectedMcp, prmUrl).ConfigureAwait(false);
    var issuer = discovered.Issuer;
    var asMeta = discovered.AuthorizationServer;
    Add(2, "Protected-resource metadata (RFC 9728)", "GET", prmUrl, 200, discovered.ProtectedResource);
    Add(3, "Authorization-server metadata (RFC 8414, issuer verified)", "GET",
      $"{issuer}/.well-known/oauth-authorization-server", 200,
      new
      {
        issuer,
        authorization_endpoint = asMeta["authorization_endpoint"]?.GetValue<string>(),
        token_endpoint = asMeta["token_endpoint"]?.GetValue<string>(),
        registration_endpoint = asMeta["registration_endpoint"]?.GetValue<string>(),
        code_challenge_methods_supported = asMeta["code_challenge_methods_supported"]?.DeepClone(),
      });

    // ── 4. Dynamic client registration (RFC 7591) ──
    Note("send", "4. dynamic client registration (SDK)");
    var registered = await OAuth.RegisterClientAsync(http, asMeta, "Companion SPA", [redirectUri]).ConfigureAwait(false);
    Add(4, "Dynamic client registration (RFC 7591)", "POST",
      asMeta["registration_endpoint"]?.GetValue<string>() ?? $"{issuer}/register", 201,
      new { client_id = registered.ClientId, redirect_uris = new[] { redirectUri } });

    // ── 5. PKCE + authorize URL → auth code (manual redirect capture) ──
    var pkce = OAuth.CreatePkcePair();
    var state = Guid.NewGuid().ToString();
    var authUrl = OAuth.BuildAuthorizeUrl(asMeta, registered.ClientId, redirectUri, protectedMcp, "mcp:tools", state, pkce.CodeChallenge);
    Note("send", "5. GET authorize (PKCE S256, SDK URL)");
    using var authRequest = new HttpRequestMessage(HttpMethod.Get, authUrl);
    using var authResponse = await http.SendAsync(authRequest).ConfigureAwait(false);
    var location = authResponse.Headers.Location?.ToString() ?? string.Empty;
    var redirectQuery = ParseRedirectQuery(location);
    var code = QueryValue(redirectQuery, "code") ?? string.Empty;

    // §23.5/§23.7: verify the redirect `state` (CSRF) and, if advertised, `iss` (mix-up).
    OAuth.VerifyAuthorizationRedirect(
      sentState: state,
      returnedState: QueryValue(redirectQuery, "state"),
      issuer: issuer,
      returnedIss: QueryValue(redirectQuery, "iss"),
      issParameterSupported: asMeta["authorization_response_iss_parameter_supported"]?.GetValue<bool>() == true);
    Add(5, "Authorization request + PKCE → code (state/iss verified)", "GET", $"{issuer}/authorize",
      (int)authResponse.StatusCode, new { redirected_to = location, code = Mask(code), state });

    // ── 6. Token exchange (authorization_code + PKCE, resource-bound) ──
    Note("send", "6. token exchange (authorization_code + PKCE, SDK)");
    var tokenResponse = await OAuth.ExchangeAuthorizationCodeAsync(http, asMeta, registered.ClientId, code, pkce.CodeVerifier, redirectUri, protectedMcp).ConfigureAwait(false);
    Add(6, "Token endpoint (authorization_code + PKCE, resource-bound)", "POST",
      asMeta["token_endpoint"]?.GetValue<string>() ?? $"{issuer}/token", 200,
      new
      {
        access_token = Mask(tokenResponse.AccessToken),
        token_type = tokenResponse.TokenType,
        scope = tokenResponse.Scope,
        expires_in = tokenResponse.ExpiresIn,
      });

    // ── 7. Authorized MCP connect + tools/call whoami ──
    Note("send", "7. authorized MCP connect + tools/call whoami");
    var transport = new StreamableHttpClientTransport(
      new Uri(protectedMcp),
      tokenProvider: _ => Task.FromResult<string?>(tokenResponse.AccessToken));
    await using var client = new McpClient(transport,
      new Implementation { Name = "companion-authorized-client", Version = "0.1.0" });
    await client.DiscoverAsync().ConfigureAwait(false);
    var whoami = await client.CallToolAsync("whoami").ConfigureAwait(false);
    var authInfo = whoami["structuredContent"]?.DeepClone();
    Add(7, "Authorized tools/call whoami", "POST", protectedMcp, 200, authInfo);

    return new
    {
      steps,
      grant = "authorization_code + PKCE (S256)",
      token = tokenResponse.AccessToken,
      tokenMasked = Mask(tokenResponse.AccessToken),
      scope = tokenResponse.Scope,
      authInfo,
      whoami = (JsonNode?)whoami.DeepClone(),
    };
  }

  /// <summary>Parses the query of a (possibly empty) redirect Location into a name→value map.</summary>
  private static IReadOnlyDictionary<string, Microsoft.Extensions.Primitives.StringValues>? ParseRedirectQuery(string location)
  {
    if (string.IsNullOrEmpty(location)) return null;
    var query = Uri.TryCreate(location, UriKind.Absolute, out var uri) ? uri.Query : location;
    return QueryHelpers.ParseQuery(query);
  }

  /// <summary>Reads a single query value, or <c>null</c> if absent.</summary>
  private static string? QueryValue(IReadOnlyDictionary<string, Microsoft.Extensions.Primitives.StringValues>? query, string key) =>
    query is not null && query.TryGetValue(key, out var value) ? value.ToString() : null;

  /// <summary>Masks a token like the TS reference does: first 6 + last 4 chars and length.</summary>
  private static string Mask(string? token) =>
    string.IsNullOrEmpty(token) ? "—" : $"{token[..Math.Min(6, token.Length)]}…{token[^Math.Min(4, token.Length)..]} ({token.Length} chars)";

  /// <summary>Reads the <c>resource_metadata="…"</c> value from a <c>WWW-Authenticate</c> challenge.</summary>
  private static string? ExtractResourceMetadata(string wwwAuthenticate)
  {
    var match = System.Text.RegularExpressions.Regex.Match(wwwAuthenticate, "resource_metadata=\"([^\"]+)\"");
    return match.Success ? match.Groups[1].Value : null;
  }
}
