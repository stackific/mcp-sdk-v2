using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Stackific.Mcp.Protocol;

// ─── OAuth fixed token values (§23.5) ────────────────────────────────────────────

/// <summary>
/// The fixed OAuth token values and PKCE constants for the authorization-code-with-PKCE flow
/// (spec §23.4–§23.10).
/// </summary>
public static class OAuthValues
{
  /// <summary>The only permitted authorization-request <c>response_type</c> (R-23.5-d).</summary>
  public const string ResponseTypeCode = "code";

  /// <summary>The only permitted PKCE <c>code_challenge_method</c> (R-23.5-a, R-23.5-i).</summary>
  public const string CodeChallengeMethodS256 = "S256";

  /// <summary>The token-request <c>grant_type</c> for the initial authorization-code exchange (R-23.5-n).</summary>
  public const string GrantTypeAuthorizationCode = "authorization_code";

  /// <summary>The token-request <c>grant_type</c> for a refresh exchange (R-23.9-e).</summary>
  public const string GrantTypeRefreshToken = "refresh_token";

  /// <summary>The <c>token_type</c> every MCP access token carries (R-23.8-b).</summary>
  public const string TokenTypeBearer = "Bearer";

  /// <summary>
  /// The reserved scope a client adds to request a refresh token, when (and only when) the
  /// authorization-server metadata advertises it (R-23.9-b). An MCP server SHOULD NOT advertise it
  /// (R-23.9-g).
  /// </summary>
  public const string OfflineAccessScope = "offline_access";
}

// ─── PKCE: code_verifier & code_challenge (§23.5, R-23.5-a, R-23.5-b) ────────────

/// <summary>A generated PKCE pair: the secret verifier and its derived public challenge (spec §23.5).</summary>
/// <param name="CodeVerifier">The high-entropy secret; 43–128 unreserved chars (R-23.5-b).</param>
/// <param name="CodeChallenge"><c>BASE64URL(SHA-256(CodeVerifier))</c> (R-23.5-b).</param>
/// <param name="CodeChallengeMethod">Always <c>S256</c> for MCP (R-23.5-a, R-23.5-i).</param>
public sealed record PkceChallenge(string CodeVerifier, string CodeChallenge, string CodeChallengeMethod);

/// <summary>
/// PKCE <c>S256</c> generation, derivation, and verification (spec §23.5, R-23.5-a, R-23.5-b), backed by
/// <see cref="RandomNumberGenerator"/> and <see cref="SHA256"/>. Randomness is injectable so callers can
/// produce a deterministic verifier in tests.
/// </summary>
public static class Pkce
{
  /// <summary>The minimum <c>code_verifier</c> length mandated by RFC 7636 (R-23.5-b).</summary>
  public const int CodeVerifierMinLength = 43;

  /// <summary>The maximum <c>code_verifier</c> length mandated by RFC 7636 (R-23.5-b).</summary>
  public const int CodeVerifierMaxLength = 128;

  // The RFC 7636 "unreserved" alphabet: ALPHA / DIGIT / "-" / "." / "_" / "~".
  private static readonly Regex UnreservedRegex = new("^[A-Za-z0-9\\-._~]+$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="verifier"/> is a valid PKCE <c>code_verifier</c>: 43–128
  /// characters drawn solely from the unreserved alphabet (R-23.5-b).
  /// </summary>
  /// <param name="verifier">The candidate <c>code_verifier</c>.</param>
  /// <returns><c>true</c> when valid.</returns>
  public static bool IsValidCodeVerifier(string verifier) =>
    verifier.Length >= CodeVerifierMinLength &&
    verifier.Length <= CodeVerifierMaxLength &&
    UnreservedRegex.IsMatch(verifier);

  /// <summary>Base64url-encodes <paramref name="bytes"/> without padding (RFC 4648 §5).</summary>
  internal static string Base64Url(ReadOnlySpan<byte> bytes) =>
    Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');

  /// <summary>
  /// Generates a high-entropy PKCE <c>code_verifier</c> (R-23.5-b): 32 random bytes base64url-encode to
  /// a 43-character unreserved string. Randomness is injectable via <paramref name="randomSource"/> for
  /// deterministic tests; the default draws from <see cref="RandomNumberGenerator"/>.
  /// </summary>
  /// <param name="randomSource">OPTIONAL byte source <c>(n) =&gt; n random bytes</c>; defaults to the CSPRNG.</param>
  /// <returns>The generated verifier.</returns>
  /// <exception cref="ArgumentException">When an injected source yields a verifier outside the 43–128 unreserved range.</exception>
  public static string GenerateCodeVerifier(Func<int, byte[]>? randomSource = null)
  {
    var bytes = randomSource?.Invoke(32) ?? RandomNumberGenerator.GetBytes(32);
    var verifier = Base64Url(bytes);
    if (!IsValidCodeVerifier(verifier))
    {
      throw new ArgumentException("generated code_verifier MUST be 43–128 unreserved characters (R-23.5-b)", nameof(randomSource));
    }
    return verifier;
  }

  /// <summary>
  /// Derives the <c>S256</c> <c>code_challenge</c> from a <c>code_verifier</c>:
  /// <c>BASE64URL(SHA-256(code_verifier))</c> (R-23.5-b).
  /// </summary>
  /// <param name="codeVerifier">A valid PKCE <c>code_verifier</c>.</param>
  /// <returns>The derived challenge.</returns>
  /// <exception cref="ArgumentException">When <paramref name="codeVerifier"/> is not a valid PKCE verifier.</exception>
  public static string DeriveCodeChallenge(string codeVerifier)
  {
    if (!IsValidCodeVerifier(codeVerifier))
    {
      throw new ArgumentException("code_verifier MUST be 43–128 unreserved characters (R-23.5-b)", nameof(codeVerifier));
    }
    var digest = SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier));
    return Base64Url(digest);
  }

  /// <summary>
  /// Creates a complete PKCE pair (verifier + <c>S256</c> challenge + method) (R-23.5-a, R-23.5-b).
  /// Randomness is injectable for deterministic tests.
  /// </summary>
  /// <param name="randomSource">OPTIONAL byte source; defaults to the CSPRNG.</param>
  /// <returns>The PKCE pair.</returns>
  public static PkceChallenge CreateChallenge(Func<int, byte[]>? randomSource = null)
  {
    var codeVerifier = GenerateCodeVerifier(randomSource);
    return new PkceChallenge(codeVerifier, DeriveCodeChallenge(codeVerifier), OAuthValues.CodeChallengeMethodS256);
  }

  /// <summary>
  /// Verifies that a presented <c>code_verifier</c> matches a previously issued <c>code_challenge</c>
  /// under the <c>S256</c> method — the check an authorization server's token endpoint performs
  /// (R-23.5-b).
  /// </summary>
  /// <param name="codeVerifier">The verifier presented in the token request.</param>
  /// <param name="codeChallenge">The challenge sent in the authorization request.</param>
  /// <returns><c>true</c> when the verifier matches the challenge.</returns>
  public static bool Verify(string codeVerifier, string codeChallenge) =>
    IsValidCodeVerifier(codeVerifier) &&
    string.Equals(DeriveCodeChallenge(codeVerifier), codeChallenge, StringComparison.Ordinal);

  /// <summary>
  /// Generates an opaque, unguessable <c>state</c> value binding an authorization request to the
  /// user-agent session (R-23.5-g): 32 random bytes, base64url-encoded. Randomness is injectable.
  /// </summary>
  /// <param name="randomSource">OPTIONAL byte source; defaults to the CSPRNG.</param>
  /// <returns>The generated state.</returns>
  public static string GenerateState(Func<int, byte[]>? randomSource = null)
  {
    var bytes = randomSource?.Invoke(32) ?? RandomNumberGenerator.GetBytes(32);
    return Base64Url(bytes);
  }
}

// ─── client_id acquisition mechanisms (§23.4, R-23.4-a – R-23.4-c) ──────────────

/// <summary>
/// The ways a client obtains a <c>client_id</c>, plus the user-prompt fallback (spec §23.4, R-23.4-a).
/// </summary>
public enum ClientIdMechanism
{
  /// <summary>Credentials provisioned out of band ahead of time.</summary>
  PreRegistration,

  /// <summary>A Client ID Metadata Document HTTPS URL used directly as <c>client_id</c>.</summary>
  Cimd,

  /// <summary>Dynamic Client Registration (Deprecated) at a <c>registration_endpoint</c>.</summary>
  Dcr,

  /// <summary>Fall back to prompting the user.</summary>
  Prompt,
}

/// <summary>
/// The DCR <c>application_type</c> (spec §23.4, R-23.4-m – R-23.4-o).
/// </summary>
public enum ApplicationType
{
  /// <summary>Desktop/mobile/CLI/localhost-hosted apps (R-23.4-n).</summary>
  Native,

  /// <summary>Remote browser-based apps from a non-local host (R-23.4-o).</summary>
  Web,
}

/// <summary>
/// <c>client_id</c> mechanism selection (the static priority order) and pre-registration credential
/// checking (spec §23.4, R-23.4-a – R-23.4-c).
/// </summary>
public static class ClientIdAcquisition
{
  /// <summary>
  /// The SHOULD priority order for selecting a <c>client_id</c> mechanism: pre-registration → CIMD →
  /// DCR → user prompt (R-23.4-b).
  /// </summary>
  public static IReadOnlyList<ClientIdMechanism> Priority { get; } =
    [ClientIdMechanism.PreRegistration, ClientIdMechanism.Cimd, ClientIdMechanism.Dcr, ClientIdMechanism.Prompt];

  /// <summary>
  /// Selects the <c>client_id</c> mechanism to use from those a client supports, applying the priority
  /// order (R-23.4-a, R-23.4-b). Returns the highest-priority supported mechanism, or
  /// <see cref="ClientIdMechanism.Prompt"/> when <paramref name="supported"/> is empty.
  /// </summary>
  /// <param name="supported">The mechanisms this client supports (order irrelevant).</param>
  /// <returns>The selected mechanism.</returns>
  public static ClientIdMechanism Select(IEnumerable<ClientIdMechanism> supported)
  {
    var set = new HashSet<ClientIdMechanism>(supported);
    foreach (var mechanism in Priority)
    {
      if (set.Contains(mechanism))
      {
        return mechanism;
      }
    }
    return ClientIdMechanism.Prompt;
  }

  /// <summary>
  /// Verifies that pre-registered credentials' authorization server matches the one indicated by
  /// protected-resource metadata, by exact string match, surfacing an error on mismatch rather than
  /// silently using mismatched credentials (R-23.4-c).
  /// </summary>
  /// <param name="credentialIssuer">The <c>issuer</c> the pre-registered credentials belong to.</param>
  /// <param name="metadataIssuer">The <c>issuer</c> selected from protected-resource metadata.</param>
  /// <returns>The check outcome.</returns>
  public static AuthorizationResult CheckPreRegisteredCredentials(string credentialIssuer, string metadataIssuer)
  {
    if (!string.Equals(credentialIssuer, metadataIssuer, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail(
        $"pre-registered credentials belong to authorization server \"{credentialIssuer}\", but protected-resource metadata indicates \"{metadataIssuer}\"; surface an error rather than using mismatched credentials (R-23.4-c)");
    }
    return AuthorizationResult.Success;
  }

  /// <summary>
  /// Returns the <c>application_type</c> a client SHOULD register based on whether it runs as a native
  /// (desktop/mobile/CLI/localhost) or a remote browser-based app (R-23.4-n, R-23.4-o).
  /// </summary>
  /// <param name="isNative"><c>true</c> for desktop/mobile/CLI/localhost-hosted clients.</param>
  /// <returns>The application type.</returns>
  public static ApplicationType ApplicationTypeFor(bool isNative) =>
    isNative ? ApplicationType.Native : ApplicationType.Web;
}

// ─── Client ID Metadata Documents (§23.4, R-23.4-d – R-23.4-l) ──────────────────

/// <summary>
/// A Client ID Metadata Document (CIMD): a JSON document hosted at an HTTPS URL that <em>is</em> the
/// client's <c>client_id</c> (spec §23.4, R-23.4-f, R-23.4-g).
/// </summary>
/// <remarks>
/// <see cref="ClientId"/>, <see cref="ClientName"/>, and <see cref="RedirectUris"/> are REQUIRED
/// (R-23.4-f); <see cref="ClientId"/> MUST exactly equal the document's own URL (R-23.4-g, checked by
/// <see cref="Cimd.Validate"/>). Additional client-metadata fields are preserved via <see cref="Extra"/>.
/// </remarks>
public sealed record ClientIdMetadataDocument
{
  /// <summary>REQUIRED; MUST equal the document URL and use https with a path (R-23.4-f, R-23.4-g).</summary>
  [JsonPropertyName("client_id")]
  public required string ClientId { get; init; }

  /// <summary>REQUIRED human-readable client name (R-23.4-f).</summary>
  [JsonPropertyName("client_name")]
  public required string ClientName { get; init; }

  /// <summary>REQUIRED allowed redirection URIs (R-23.4-f).</summary>
  [JsonPropertyName("redirect_uris")]
  public required IReadOnlyList<string> RedirectUris { get; init; }

  /// <summary>OPTIONAL client homepage.</summary>
  [JsonPropertyName("client_uri")]
  public string? ClientUri { get; init; }

  /// <summary>OPTIONAL logo for consent screens.</summary>
  [JsonPropertyName("logo_uri")]
  public string? LogoUri { get; init; }

  /// <summary>OPTIONAL OAuth grant types (e.g. <c>authorization_code</c>, <c>refresh_token</c>).</summary>
  [JsonPropertyName("grant_types")]
  public IReadOnlyList<string>? GrantTypes { get; init; }

  /// <summary>OPTIONAL OAuth response types (e.g. <c>code</c>).</summary>
  [JsonPropertyName("response_types")]
  public IReadOnlyList<string>? ResponseTypes { get; init; }

  /// <summary>OPTIONAL token-endpoint auth method (e.g. <c>none</c>, <c>private_key_jwt</c>).</summary>
  [JsonPropertyName("token_endpoint_auth_method")]
  public string? TokenEndpointAuthMethod { get; init; }

  /// <summary>Additional client-metadata fields preserved verbatim (the <c>passthrough</c> equivalent),
  /// for example <c>jwks</c>/<c>jwks_uri</c> used by <c>private_key_jwt</c> clients.</summary>
  [JsonExtensionData]
  public JsonObject? Extra { get; init; }
}

/// <summary>
/// Client ID Metadata Document validation — the <c>https</c>-with-path <c>client_id</c> URL rule, the
/// schema, the <c>client_id == URL</c> identity rule, and the redirect-URI membership check
/// (spec §23.4, R-23.4-d – R-23.4-l).
/// </summary>
public static class Cimd
{
  /// <summary>
  /// Returns <c>true</c> when <paramref name="clientId"/> is a syntactically valid CIMD
  /// <c>client_id</c> URL: an absolute <c>https</c> URL with a (non-root) path component (R-23.4-e).
  /// A bare-origin URL (path <c>/</c>) is rejected.
  /// </summary>
  /// <param name="clientId">The candidate <c>client_id</c> URL.</param>
  /// <returns><c>true</c> when valid.</returns>
  public static bool IsValidClientIdUrl(string clientId)
  {
    if (!Uri.TryCreate(clientId, UriKind.Absolute, out var url))
    {
      return false;
    }
    return string.Equals(url.Scheme, "https", StringComparison.Ordinal) &&
      url.AbsolutePath is not ("" or "/");
  }

  /// <summary>
  /// Parses a CIMD document, returning <c>null</c> when it is not a JSON object with the REQUIRED
  /// <c>client_id</c>, <c>client_name</c>, and non-empty <c>redirect_uris</c> (R-23.4-f).
  /// </summary>
  /// <param name="value">The raw fetched document, or <c>null</c>.</param>
  /// <returns>The parsed document, or <c>null</c> when invalid.</returns>
  public static ClientIdMetadataDocument? Parse(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return null;
    }
    var clientId = (obj["client_id"] as JsonValue)?.GetValue<string>();
    var clientName = (obj["client_name"] as JsonValue)?.GetValue<string>();
    if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientName))
    {
      return null;
    }
    var redirectUris = AuthorizationJson.StringArray(obj["redirect_uris"]);
    if (redirectUris is null || redirectUris.Count == 0)
    {
      return null;
    }
    // Preserve every member that is not a recognised field verbatim (the .passthrough() equivalent),
    // so consumers can read client-metadata extensions such as jwks/jwks_uri (R-23.12-f).
    JsonObject? extra = null;
    foreach (var (name, child) in obj)
    {
      if (KnownFields.Contains(name))
      {
        continue;
      }
      extra ??= new JsonObject();
      extra[name] = child?.DeepClone();
    }

    return new ClientIdMetadataDocument
    {
      ClientId = clientId,
      ClientName = clientName,
      RedirectUris = redirectUris,
      ClientUri = (obj["client_uri"] as JsonValue)?.GetValue<string>(),
      LogoUri = (obj["logo_uri"] as JsonValue)?.GetValue<string>(),
      GrantTypes = AuthorizationJson.StringArray(obj["grant_types"]),
      ResponseTypes = AuthorizationJson.StringArray(obj["response_types"]),
      TokenEndpointAuthMethod = (obj["token_endpoint_auth_method"] as JsonValue)?.GetValue<string>(),
      Extra = extra,
    };
  }

  /// <summary>The recognised top-level CIMD members; every other member is preserved in <see cref="ClientIdMetadataDocument.Extra"/>.</summary>
  private static readonly HashSet<string> KnownFields = new(StringComparer.Ordinal)
  {
    "client_id", "client_name", "redirect_uris", "client_uri", "logo_uri",
    "grant_types", "response_types", "token_endpoint_auth_method",
  };

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a structurally valid CIMD document (R-23.4-f).</summary>
  /// <param name="value">The candidate document.</param>
  /// <returns><c>true</c> when valid.</returns>
  public static bool IsValid(JsonNode? value) => Parse(value) is not null;

  /// <summary>
  /// Validates a fetched CIMD document against the URL it was fetched from — the fetch/validate duties
  /// an authorization server performs on encountering a URL-formatted <c>client_id</c> (R-23.4-i,
  /// R-23.4-j, R-23.4-k). On success <paramref name="document"/> is populated.
  /// </summary>
  /// <remarks>
  /// Checks, in order: the <c>client_id</c> URL is a valid HTTPS URL with a path (R-23.4-e); the body is
  /// valid JSON with the REQUIRED fields (R-23.4-k); the document's <c>client_id</c> exactly equals the
  /// fetch URL (R-23.4-i); and, when a <paramref name="presentedRedirectUri"/> is supplied, it appears in
  /// the document's <c>redirect_uris</c> (R-23.4-j).
  /// </remarks>
  /// <param name="documentUrl">The URL the document was fetched from (== <c>client_id</c>).</param>
  /// <param name="value">The raw fetched document body.</param>
  /// <param name="document">On success, the validated document; otherwise <c>null</c>.</param>
  /// <param name="presentedRedirectUri">OPTIONAL redirect URI to validate against <c>redirect_uris</c> (R-23.4-j).</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult Validate(
    string documentUrl,
    JsonNode? value,
    out ClientIdMetadataDocument? document,
    string? presentedRedirectUri = null)
  {
    document = null;
    if (!IsValidClientIdUrl(documentUrl))
    {
      return AuthorizationResult.Fail($"CIMD client_id \"{documentUrl}\" MUST be an https URL with a path component (R-23.4-e)");
    }
    var parsed = Parse(value);
    if (parsed is null)
    {
      return AuthorizationResult.Fail("CIMD document MUST be valid JSON with client_id, client_name, redirect_uris (R-23.4-k)");
    }
    if (!string.Equals(parsed.ClientId, documentUrl, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail($"CIMD client_id \"{parsed.ClientId}\" MUST exactly equal the document URL \"{documentUrl}\" (R-23.4-g, R-23.4-i)");
    }
    if (presentedRedirectUri is not null && !parsed.RedirectUris.Contains(presentedRedirectUri))
    {
      return AuthorizationResult.Fail($"presented redirect_uri \"{presentedRedirectUri}\" is not listed in the CIMD document's redirect_uris (R-23.4-j)");
    }
    document = parsed;
    return AuthorizationResult.Success;
  }
}

// ─── Dynamic Client Registration (Deprecated) (§23.4, R-23.4-m – R-23.4-t) ──────

/// <summary>
/// A Dynamic Client Registration request body (Deprecated) (spec §23.4, R-23.4-m). <c>redirect_uris</c>
/// and <c>application_type</c> are REQUIRED per MCP. <see cref="ToJson"/> renders the on-the-wire body.
/// </summary>
/// <param name="RedirectUris">REQUIRED allowed redirection URIs (R-23.4-m, R-23.4-p).</param>
/// <param name="ApplicationType">REQUIRED per MCP; native or web (R-23.4-m).</param>
/// <param name="ClientName">OPTIONAL human-readable name.</param>
/// <param name="GrantTypes">OPTIONAL requested grant types (include <c>refresh_token</c> for refresh; R-23.9-a).</param>
/// <param name="ResponseTypes">OPTIONAL requested response types.</param>
/// <param name="TokenEndpointAuthMethod">OPTIONAL token-endpoint auth method.</param>
/// <param name="Scope">OPTIONAL space-delimited scopes.</param>
[Obsolete("Dynamic Client Registration (RFC 7591) is Deprecated for MCP (spec §23.11): prefer Client ID Metadata Documents. Still supported for backward compatibility.")]
public sealed record DynamicClientRegistrationRequest(
  IReadOnlyList<string> RedirectUris,
  ApplicationType ApplicationType,
  string? ClientName = null,
  IReadOnlyList<string>? GrantTypes = null,
  IReadOnlyList<string>? ResponseTypes = null,
  string? TokenEndpointAuthMethod = null,
  string? Scope = null)
{
  /// <summary>Renders this request as the on-the-wire RFC 7591 JSON body, always including the REQUIRED <c>application_type</c>.</summary>
  /// <returns>The JSON body.</returns>
  public JsonObject ToJson()
  {
    var uris = new JsonArray();
    foreach (var uri in RedirectUris)
    {
      uris.Add(uri);
    }
    var body = new JsonObject
    {
      ["redirect_uris"] = uris,
      ["application_type"] = ApplicationType == ApplicationType.Native ? "native" : "web",
    };
    if (ClientName is not null)
    {
      body["client_name"] = ClientName;
    }
    if (GrantTypes is not null)
    {
      var grants = new JsonArray();
      foreach (var g in GrantTypes)
      {
        grants.Add(g);
      }
      body["grant_types"] = grants;
    }
    if (ResponseTypes is not null)
    {
      var responses = new JsonArray();
      foreach (var r in ResponseTypes)
      {
        responses.Add(r);
      }
      body["response_types"] = responses;
    }
    if (TokenEndpointAuthMethod is not null)
    {
      body["token_endpoint_auth_method"] = TokenEndpointAuthMethod;
    }
    if (Scope is not null)
    {
      body["scope"] = Scope;
    }
    return body;
  }
}

/// <summary>
/// A Dynamic Client Registration response body (Deprecated) (spec §23.4). <see cref="ClientId"/> is
/// REQUIRED; <see cref="ClientSecret"/> is issued only for confidential clients.
/// </summary>
/// <param name="ClientId">REQUIRED issued client identifier.</param>
/// <param name="ClientSecret">OPTIONAL secret for confidential clients only.</param>
public sealed record DynamicClientRegistrationResponse(string ClientId, string? ClientSecret = null)
{
  /// <summary>
  /// Parses a DCR response body, returning <c>null</c> when it is not a JSON object with a non-empty
  /// <c>client_id</c>.
  /// </summary>
  /// <param name="value">The raw response body, or <c>null</c>.</param>
  /// <returns>The parsed response, or <c>null</c> when invalid.</returns>
  public static DynamicClientRegistrationResponse? Parse(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return null;
    }
    var clientId = (obj["client_id"] as JsonValue)?.GetValue<string>();
    if (string.IsNullOrEmpty(clientId))
    {
      return null;
    }
    return new DynamicClientRegistrationResponse(clientId, (obj["client_secret"] as JsonValue)?.GetValue<string>());
  }
}

/// <summary>
/// The outcome of a DCR registration attempt, modelling the failure cases a client MUST be prepared to
/// handle (spec §23.4, R-23.4-p, R-23.4-q, R-23.4-r). On failure the client surfaces
/// <see cref="Reason"/> rather than crashing; <see cref="Retryable"/> flags redirect-URI/application-type
/// rejections the client MAY retry.
/// </summary>
public sealed record DynamicClientRegistrationResult
{
  private DynamicClientRegistrationResult(bool ok, DynamicClientRegistrationResponse? response, string? reason, bool retryable)
  {
    Ok = ok;
    Response = response;
    Reason = reason;
    Retryable = retryable;
  }

  /// <summary>Whether registration succeeded.</summary>
  [MemberNotNullWhen(true, nameof(Response))]
  [MemberNotNullWhen(false, nameof(Reason))]
  public bool Ok { get; }

  /// <summary>The issued client information on success; otherwise <c>null</c>.</summary>
  public DynamicClientRegistrationResponse? Response { get; }

  /// <summary>The human-readable failure reason on failure; otherwise <c>null</c>.</summary>
  public string? Reason { get; }

  /// <summary>Whether a retry (with adjusted <c>application_type</c> / redirect URIs) may help (R-23.4-r).</summary>
  public bool Retryable { get; }

  /// <summary>A successful registration outcome.</summary>
  /// <param name="response">The issued client information.</param>
  /// <returns>The success result.</returns>
  public static DynamicClientRegistrationResult Success(DynamicClientRegistrationResponse response) =>
    new(true, response, null, false);

  /// <summary>A failed registration outcome.</summary>
  /// <param name="reason">The human-readable failure reason.</param>
  /// <param name="retryable">Whether a retry may help.</param>
  /// <returns>The failure result.</returns>
  public static DynamicClientRegistrationResult Fail(string reason, bool retryable) =>
    new(false, null, reason, retryable);
}

/// <summary>
/// Dynamic Client Registration response handling and per-issuer credential persistence
/// (spec §23.4, R-23.4-m – R-23.4-t).
/// </summary>
public static class Dcr
{
  /// <summary>
  /// Handles a DCR registration response, surfacing a meaningful error on failure and flagging whether a
  /// retry may help, rather than crashing (R-23.4-p, R-23.4-q, R-23.4-r). A success body (valid JSON with
  /// a <c>client_id</c>) yields success; an HTTP failure status, or a body lacking <c>client_id</c>,
  /// yields a failure with a human-readable reason. <c>Retryable</c> is <c>true</c> for a <c>400</c>
  /// (typically a redirect-URI / application-type constraint).
  /// </summary>
  /// <param name="status">The registration endpoint's HTTP status.</param>
  /// <param name="body">The raw response body.</param>
  /// <returns>The structured registration result.</returns>
  public static DynamicClientRegistrationResult HandleResponse(int status, JsonNode? body)
  {
    if (status is >= 200 and < 300)
    {
      var parsed = DynamicClientRegistrationResponse.Parse(body);
      if (parsed is not null)
      {
        return DynamicClientRegistrationResult.Success(parsed);
      }
      return DynamicClientRegistrationResult.Fail($"DCR succeeded with HTTP {status} but the body lacks a valid client_id (R-23.4-q)", retryable: false);
    }
    var description = (body as JsonObject)?["error_description"] is JsonValue v && v.GetValue<string>() is { } d
      ? d
      : $"registration failed with HTTP {status}";
    return DynamicClientRegistrationResult.Fail($"DCR registration rejected: {description} (R-23.4-q)", retryable: status == 400);
  }
}

/// <summary>Persisted DCR credentials, bound to the issuing authorization server's <c>issuer</c> (spec §23.4, R-23.4-s).</summary>
/// <param name="Issuer">The issuing authorization server's <c>issuer</c>; the binding key (R-23.4-s).</param>
/// <param name="ClientId">The issued <c>client_id</c>.</param>
/// <param name="ClientSecret">OPTIONAL issued secret for confidential clients.</param>
public sealed record DynamicClientRegistrationCredential(string Issuer, string ClientId, string? ClientSecret = null);

/// <summary>
/// A store for persisted DCR credentials, each keyed by the issuing authorization server's <c>issuer</c>,
/// that re-registers when the authorization server changes (spec §23.4, R-23.4-s, R-23.4-t).
/// </summary>
public sealed class DynamicClientRegistrationStore
{
  private readonly Dictionary<string, DynamicClientRegistrationCredential> _byIssuer = new(StringComparer.Ordinal);

  /// <summary>Persists <paramref name="credential"/>, keyed by its <c>issuer</c> (R-23.4-s).</summary>
  /// <param name="credential">The credential to persist.</param>
  public void Save(DynamicClientRegistrationCredential credential) =>
    _byIssuer[credential.Issuer] = credential;

  /// <summary>Returns the persisted credential for <paramref name="issuer"/>, or <c>null</c> (R-23.4-s).</summary>
  /// <param name="issuer">The authorization-server issuer.</param>
  /// <returns>The stored credential, or <c>null</c>.</returns>
  public DynamicClientRegistrationCredential? CredentialFor(string issuer) =>
    _byIssuer.TryGetValue(issuer, out var found) ? found : null;

  /// <summary>
  /// Returns <c>true</c> when the client must (re-)register against <paramref name="issuer"/> — i.e. no
  /// credential is yet persisted for that authorization server. A client MUST re-register when the
  /// authorization server changes, which manifests as the new <c>issuer</c> having no persisted
  /// credential (R-23.4-t).
  /// </summary>
  /// <param name="issuer">The <c>issuer</c> now indicated by protected-resource metadata.</param>
  /// <returns><c>true</c> when registration is needed.</returns>
  public bool NeedsRegistration(string issuer) => !_byIssuer.ContainsKey(issuer);
}

// ─── Per-request authorization record — Step 1 (§23.5, R-23.5-c) ────────────────

/// <summary>
/// Client-side bookkeeping captured in Step 1, associated with the <c>code_verifier</c> (and
/// <c>state</c>, if used), to validate the redirect later (spec §23.5, R-23.5-c).
/// </summary>
/// <param name="CodeVerifier">The high-entropy PKCE verifier this record is keyed to (R-23.5-c).</param>
/// <param name="RecordedIssuer">The <c>issuer</c> from the selected AS's validated metadata, recorded BEFORE redirecting for later <c>iss</c> comparison (R-23.5-c).</param>
/// <param name="CodeChallenge">The <c>code_challenge</c> derived from <paramref name="CodeVerifier"/> (R-23.5-b).</param>
/// <param name="CodeChallengeMethod">The PKCE method; always <c>S256</c> (R-23.5-a).</param>
/// <param name="State">The opaque <c>state</c> sent, if any (R-23.5-c, R-23.5-g).</param>
public sealed record AuthorizationFlowRecord(
  string CodeVerifier,
  string RecordedIssuer,
  string CodeChallenge,
  string CodeChallengeMethod,
  string? State = null)
{
  /// <summary>
  /// Builds the Step-1 per-request record: a fresh PKCE pair (unless supplied), an opaque <c>state</c>
  /// (unless supplied), and the recorded <c>issuer</c> (R-23.5-a, R-23.5-b, R-23.5-c, R-23.5-g). The
  /// record MUST be created and the <c>issuer</c> recorded BEFORE the user agent is redirected.
  /// </summary>
  /// <param name="recordedIssuer">The <c>issuer</c> of the selected AS's validated metadata (R-23.5-c).</param>
  /// <param name="pkce">OPTIONAL pre-generated PKCE pair; one is generated when omitted.</param>
  /// <param name="state">OPTIONAL <c>state</c>; one is generated when omitted.</param>
  /// <param name="randomSource">OPTIONAL byte source for PKCE/state generation; defaults to the CSPRNG.</param>
  /// <returns>The per-request record.</returns>
  public static AuthorizationFlowRecord Create(
    string recordedIssuer,
    PkceChallenge? pkce = null,
    string? state = null,
    Func<int, byte[]>? randomSource = null)
  {
    var resolvedPkce = pkce ?? Pkce.CreateChallenge(randomSource);
    var resolvedState = state ?? Pkce.GenerateState(randomSource);
    return new AuthorizationFlowRecord(
      resolvedPkce.CodeVerifier,
      recordedIssuer,
      resolvedPkce.CodeChallenge,
      resolvedPkce.CodeChallengeMethod,
      resolvedState);
  }
}

// ─── Scope priority (§23.5, R-23.5-f) & offline_access (§23.9) ──────────────────

/// <summary>
/// Authorization-request scope resolution (the scope-priority rule) and <c>offline_access</c> handling
/// (spec §23.5 R-23.5-f, §23.9 R-23.9-b, R-23.9-g).
/// </summary>
public static class AuthorizationScopes
{
  /// <summary>
  /// Resolves the <c>scope</c> parameter to send in the authorization request, applying the scope
  /// priority (R-23.5-f): (1) the <c>WWW-Authenticate</c> challenge's <c>scope</c>; (2) all of
  /// protected-resource <c>scopes_supported</c>; (3) otherwise <c>null</c> (omit <c>scope</c>).
  /// </summary>
  /// <param name="challenge">The parsed <c>WWW-Authenticate</c> challenge, if any.</param>
  /// <param name="scopesSupported">Protected-resource <c>scopes_supported</c>, if any.</param>
  /// <returns>The resolved scope string, or <c>null</c> to omit <c>scope</c>.</returns>
  public static string? Resolve(WwwAuthenticateChallenge? challenge, IReadOnlyList<string>? scopesSupported)
  {
    if (challenge is not null)
    {
      var fromChallenge = WwwAuthenticate.ChallengedScopes(challenge);
      if (fromChallenge.Count > 0)
      {
        return string.Join(' ', fromChallenge);
      }
    }
    if (scopesSupported is not null && scopesSupported.Count > 0)
    {
      return string.Join(' ', scopesSupported);
    }
    return null;
  }

  /// <summary>
  /// Adds <c>offline_access</c> to a <c>scope</c> string when, and only when, the authorization-server
  /// metadata advertises it in <c>scopes_supported</c> (R-23.9-b). Returns the scope unchanged when
  /// <c>offline_access</c> is not advertised or already present.
  /// </summary>
  /// <param name="scope">The current <c>scope</c> string, or <c>null</c>.</param>
  /// <param name="asScopesSupported">The selected authorization server's <c>scopes_supported</c>.</param>
  /// <returns>The scope, possibly with <c>offline_access</c> appended.</returns>
  public static string? WithOfflineAccess(string? scope, IReadOnlyList<string>? asScopesSupported)
  {
    var advertised = asScopesSupported?.Contains(OAuthValues.OfflineAccessScope) ?? false;
    if (!advertised)
    {
      return scope;
    }
    var parts = scope is null
      ? new List<string>()
      : scope.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).ToList();
    if (parts.Contains(OAuthValues.OfflineAccessScope))
    {
      return scope;
    }
    parts.Add(OAuthValues.OfflineAccessScope);
    return string.Join(' ', parts);
  }

  /// <summary>
  /// Returns <c>true</c> when neither the <c>WWW-Authenticate</c> <c>scope</c> nor protected-resource
  /// <c>scopes_supported</c> includes <c>offline_access</c>, as an MCP server SHOULD ensure (R-23.9-g).
  /// </summary>
  /// <param name="challengeScope">The <c>WWW-Authenticate</c> <c>scope</c> value, if any.</param>
  /// <param name="scopesSupported">Protected-resource <c>scopes_supported</c>, if any.</param>
  /// <returns><c>true</c> when neither advertises <c>offline_access</c>.</returns>
  public static bool AdvertisedScopesExcludeOfflineAccess(string? challengeScope, IReadOnlyList<string>? scopesSupported)
  {
    var challengeHas = challengeScope is not null &&
      challengeScope.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Contains(OAuthValues.OfflineAccessScope);
    var metadataHas = scopesSupported?.Contains(OAuthValues.OfflineAccessScope) ?? false;
    return !challengeHas && !metadataHas;
  }
}

// ─── PKCE support confirmation — §28.5 (R-28.5-k) ───────────────────────────────

/// <summary>
/// Thrown when a client refuses to proceed because PKCE <c>S256</c> support cannot be confirmed from
/// authorization-server metadata (spec §28.5, R-28.5-k).
/// </summary>
public sealed class PkceSupportException : Exception
{
  /// <summary>A stable code identifying this failure for callers.</summary>
  public const string Code = "PKCE_SUPPORT_UNCONFIRMED";

  /// <summary>Creates the exception with the human-readable <paramref name="message"/>.</summary>
  /// <param name="message">Why PKCE support could not be confirmed.</param>
  public PkceSupportException(string message) : base(message)
  {
  }
}

/// <summary>
/// The §28.5 PKCE-support gate: a client MUST confirm, from authorization-server metadata, that the AS
/// advertises PKCE <c>S256</c> before proceeding, refusing otherwise (spec §28.5, R-28.5-k).
/// </summary>
public static class PkceSupport
{
  /// <summary>
  /// Confirms, from <paramref name="codeChallengeMethodsSupported"/>, that the AS supports PKCE with the
  /// <c>S256</c> method (R-28.5-k). Support is confirmable ONLY when the field is present AND includes
  /// <c>S256</c>; an absent field means support is unconfirmable (the client MUST refuse).
  /// </summary>
  /// <param name="codeChallengeMethodsSupported">The AS metadata field, or <c>null</c> when absent.</param>
  /// <returns>The confirmation outcome.</returns>
  public static AuthorizationResult Confirm(IReadOnlyList<string>? codeChallengeMethodsSupported)
  {
    if (codeChallengeMethodsSupported is null)
    {
      return AuthorizationResult.Fail("authorization-server metadata omits code_challenge_methods_supported; PKCE support cannot be confirmed (R-28.5-k)");
    }
    if (!codeChallengeMethodsSupported.Contains(OAuthValues.CodeChallengeMethodS256))
    {
      return AuthorizationResult.Fail($"authorization-server metadata does not advertise PKCE \"{OAuthValues.CodeChallengeMethodS256}\" support (R-28.5-k)");
    }
    return AuthorizationResult.Success;
  }

  /// <summary>Returns <c>true</c> when AS metadata confirms PKCE <c>S256</c> support (R-28.5-k).</summary>
  /// <param name="codeChallengeMethodsSupported">The AS metadata field, or <c>null</c>.</param>
  /// <returns><c>true</c> when confirmed.</returns>
  public static bool IsConfirmed(IReadOnlyList<string>? codeChallengeMethodsSupported) =>
    Confirm(codeChallengeMethodsSupported).Ok;

  /// <summary>
  /// Asserts PKCE <c>S256</c> support is confirmable from AS metadata, throwing
  /// <see cref="PkceSupportException"/> when it is not — so the client refuses to proceed rather than
  /// starting a flow against an AS that may not support PKCE (R-28.5-k).
  /// </summary>
  /// <param name="codeChallengeMethodsSupported">The AS metadata field, or <c>null</c>.</param>
  /// <exception cref="PkceSupportException">When support cannot be confirmed.</exception>
  public static void AssertConfirmed(IReadOnlyList<string>? codeChallengeMethodsSupported)
  {
    var result = Confirm(codeChallengeMethodsSupported);
    if (!result.Ok)
    {
      throw new PkceSupportException(result.Reason);
    }
  }
}

// ─── Authorization request — Step 2 (§23.5, R-23.5-d – R-23.5-j) ────────────────

/// <summary>
/// The authorization-request query parameters directing the user agent to the
/// <c>authorization_endpoint</c> (spec §23.5, R-23.5-d – R-23.5-j).
/// </summary>
/// <param name="ClientId">The client identifier from registration.</param>
/// <param name="RedirectUri">MUST match one registered for the client (R-23.5-e).</param>
/// <param name="CodeChallenge"><c>BASE64URL(SHA-256(code_verifier))</c> (R-23.5-b).</param>
/// <param name="Resource">Canonical resource identifier of the target MCP server (R-23.5-j, R-23.6-b).</param>
/// <param name="Scope">Requested scopes; omitted when none determinable (R-23.5-f).</param>
/// <param name="State">Opaque, unguessable session-binding value (R-23.5-g).</param>
public sealed record AuthorizationRequestParams(
  string ClientId,
  string RedirectUri,
  string CodeChallenge,
  string Resource,
  string? Scope = null,
  string? State = null)
{
  /// <summary>MUST be <c>code</c> (R-23.5-d).</summary>
  public string ResponseType => OAuthValues.ResponseTypeCode;

  /// <summary>MUST be <c>S256</c> (R-23.5-i).</summary>
  public string CodeChallengeMethod => OAuthValues.CodeChallengeMethodS256;
}

/// <summary>
/// The authorization-request and authorization-URL builders for Step 2 (spec §23.5).
/// </summary>
public static class AuthorizationRequest
{
  /// <summary>
  /// Builds the authorization-request query parameters for Step 2, fixing <c>response_type=code</c>,
  /// <c>code_challenge_method=S256</c>, the <c>code_challenge</c> and <c>state</c> from the Step-1 record,
  /// and the REQUIRED <c>resource</c> parameter (R-23.5-d, R-23.5-e, R-23.5-g, R-23.5-i, R-23.5-j,
  /// R-23.6-b).
  /// </summary>
  /// <remarks>
  /// When <paramref name="confirmPkceFrom"/> is supplied, the builder verifies PKCE <c>S256</c> support
  /// and refuses (throws <see cref="PkceSupportException"/>) if it cannot be confirmed — enforcing §28.5
  /// (R-28.5-k). Callers that omit it MUST call <see cref="PkceSupport.AssertConfirmed"/> themselves.
  /// </remarks>
  /// <param name="clientId">The client identifier.</param>
  /// <param name="redirectUri">MUST match one registered for the client (R-23.5-e).</param>
  /// <param name="resource">The canonical resource identifier of the target MCP server (R-23.5-j).</param>
  /// <param name="record">The Step-1 record carrying the PKCE challenge and <c>state</c>.</param>
  /// <param name="scope">OPTIONAL pre-resolved <c>scope</c>.</param>
  /// <param name="confirmPkceFrom">OPTIONAL AS <c>code_challenge_methods_supported</c> to gate on PKCE support (R-28.5-k).</param>
  /// <returns>The authorization-request parameters.</returns>
  /// <exception cref="PkceSupportException">When <paramref name="confirmPkceFrom"/> is supplied and PKCE support cannot be confirmed.</exception>
  public static AuthorizationRequestParams Build(
    string clientId,
    string redirectUri,
    string resource,
    AuthorizationFlowRecord record,
    string? scope = null,
    IReadOnlyList<string>? confirmPkceFrom = null)
  {
    if (confirmPkceFrom is not null)
    {
      PkceSupport.AssertConfirmed(confirmPkceFrom);
    }
    return new AuthorizationRequestParams(clientId, redirectUri, record.CodeChallenge, resource, scope, record.State);
  }

  /// <summary>
  /// Serializes authorization-request parameters into a full authorization-endpoint URL with a
  /// percent-encoded query string, in the spec's example parameter order. Existing query parameters on
  /// <paramref name="authorizationEndpoint"/> are preserved.
  /// </summary>
  /// <param name="authorizationEndpoint">The authorization server's <c>authorization_endpoint</c>.</param>
  /// <param name="parameters">The authorization-request parameters.</param>
  /// <returns>The fully-formed authorization URL.</returns>
  public static string BuildUrl(string authorizationEndpoint, AuthorizationRequestParams parameters)
  {
    var ordered = new (string Key, string? Value)[]
    {
      ("response_type", parameters.ResponseType),
      ("client_id", parameters.ClientId),
      ("redirect_uri", parameters.RedirectUri),
      ("scope", parameters.Scope),
      ("state", parameters.State),
      ("code_challenge", parameters.CodeChallenge),
      ("code_challenge_method", parameters.CodeChallengeMethod),
      ("resource", parameters.Resource),
    };

    var separator = authorizationEndpoint.Contains('?', StringComparison.Ordinal) ? '&' : '?';
    var encoded = string.Join('&', ordered
      .Where(p => p.Value is not null)
      .Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value!)}"));
    return $"{authorizationEndpoint}{separator}{encoded}";
  }
}

// ─── Authorization response & redirect handling — Step 3 (§23.5, §23.7) ─────────

/// <summary>
/// The redirect query parameters the authorization server returns (spec §23.5, §23.7). On success
/// <see cref="Code"/> is present; <see cref="State"/> echoes the request <c>state</c>; <see cref="Iss"/>
/// identifies the authorization server (SHOULD). On error, the <see cref="Error"/> fields are present
/// and MUST NOT be acted on when <c>iss</c> validation fails (R-23.7-h).
/// </summary>
/// <param name="Code">The authorization code to redeem (success).</param>
/// <param name="State">Echo of the request <c>state</c> (present if sent) (R-23.5-h).</param>
/// <param name="Iss">The authorization server's issuer identifier (SHOULD) (R-23.5-k, R-23.7-b).</param>
/// <param name="Error">Error code (error responses).</param>
/// <param name="ErrorDescription">OPTIONAL human-readable error description.</param>
/// <param name="ErrorUri">OPTIONAL URI with error information.</param>
public sealed record AuthorizationResponseParams(
  string? Code = null,
  string? State = null,
  string? Iss = null,
  string? Error = null,
  string? ErrorDescription = null,
  string? ErrorUri = null)
{
  /// <summary>
  /// Parses an authorization-redirect URL (or raw query string) into its decoded parameters
  /// (spec §23.5, Step 3). Percent-decoding is applied; the decoded <c>iss</c> is later compared by EXACT
  /// string match with no further normalization (R-23.7-g) — this parser performs no normalization
  /// beyond the form-decoding the wire requires.
  /// </summary>
  /// <param name="redirect">A full redirect URL (<c>http://…/callback?code=…</c>) or a bare query string (<c>code=…&amp;state=…</c>).</param>
  /// <returns>The parsed parameters.</returns>
  public static AuthorizationResponseParams Parse(string redirect)
  {
    var query = Uri.TryCreate(redirect, UriKind.Absolute, out var url)
      ? url.Query
      : redirect.StartsWith('?') ? redirect : "?" + redirect;

    var values = System.Web.HttpUtility.ParseQueryString(query);
    return new AuthorizationResponseParams(
      values["code"],
      values["state"],
      values["iss"],
      values["error"],
      values["error_description"],
      values["error_uri"]);
  }
}

/// <summary>
/// The decision the §23.7 issuer-validation table yields for the <c>iss</c> parameter (spec §23.7,
/// R-23.7-d).
/// </summary>
public enum IssuerValidationDecision
{
  /// <summary><c>iss</c> is present; compare it to the recorded issuer.</summary>
  Compare,

  /// <summary><c>iss</c> is absent though advertised as supported; reject.</summary>
  Reject,

  /// <summary><c>iss</c> is absent and not advertised; proceed without comparison.</summary>
  Proceed,
}

/// <summary>The displayable error details from an authorization error response (spec §23.7).</summary>
/// <param name="Error">The error code.</param>
/// <param name="ErrorDescription">OPTIONAL human-readable description.</param>
/// <param name="ErrorUri">OPTIONAL URI with error information.</param>
public sealed record AuthorizationErrorDetails(string Error, string? ErrorDescription = null, string? ErrorUri = null);

/// <summary>The outcome of <see cref="AuthorizationRedirect.Process"/>: whether the code may be redeemed.</summary>
public sealed record AuthorizationRedirectResult
{
  private AuthorizationRedirectResult(bool ok, string? code, string? reason, AuthorizationErrorDetails? error)
  {
    Ok = ok;
    Code = code;
    Reason = reason;
    Error = error;
  }

  /// <summary>Whether the redirect validated and a code is available to redeem.</summary>
  [MemberNotNullWhen(true, nameof(Code))]
  [MemberNotNullWhen(false, nameof(Reason))]
  public bool Ok { get; }

  /// <summary>The authorization code to redeem on success; otherwise <c>null</c>.</summary>
  public string? Code { get; }

  /// <summary>The failure reason on failure; otherwise <c>null</c>.</summary>
  public string? Reason { get; }

  /// <summary>
  /// The displayable error details from an error response, present ONLY when <c>iss</c> validation
  /// succeeded; withheld on <c>iss</c> mismatch (R-23.7-h).
  /// </summary>
  public AuthorizationErrorDetails? Error { get; }

  /// <summary>A successful outcome carrying the redeemable <paramref name="code"/>.</summary>
  /// <param name="code">The authorization code.</param>
  /// <returns>The success result.</returns>
  public static AuthorizationRedirectResult Success(string code) => new(true, code, null, null);

  /// <summary>A failed outcome with a <paramref name="reason"/> and OPTIONAL surfaced <paramref name="error"/>.</summary>
  /// <param name="reason">Why the redirect failed.</param>
  /// <param name="error">The surfaced error details, when <c>iss</c> validated.</param>
  /// <returns>The failure result.</returns>
  public static AuthorizationRedirectResult Fail(string reason, AuthorizationErrorDetails? error = null) =>
    new(false, null, reason, error);
}

/// <summary>
/// The §23.7 issuer-validation decision table, state verification, and the end-to-end redirect handler
/// (spec §23.5 Step 3, §23.7).
/// </summary>
public static class AuthorizationRedirect
{
  /// <summary>
  /// Applies the §23.7 four-row decision table to determine how to treat the <c>iss</c> parameter
  /// (R-23.7-d, R-23.7-e, R-23.7-f). A present <c>iss</c> is ALWAYS compared, regardless of
  /// advertisement (R-23.7-f).
  /// </summary>
  /// <param name="issParameterSupported">The AS metadata flag (<c>null</c> ⇒ not advertised).</param>
  /// <param name="issPresent">Whether the response carried an <c>iss</c>.</param>
  /// <returns>The decision to apply.</returns>
  public static IssuerValidationDecision Decision(bool? issParameterSupported, bool issPresent)
  {
    if (issPresent)
    {
      return IssuerValidationDecision.Compare;
    }
    return issParameterSupported == true ? IssuerValidationDecision.Reject : IssuerValidationDecision.Proceed;
  }

  /// <summary>
  /// Validates the authorization response's <c>iss</c> against the recorded issuer per §23.7 — the check
  /// a client MUST perform BEFORE transmitting the authorization code to any token endpoint (R-23.7-a,
  /// R-23.7-d – R-23.7-g). When the decision is <see cref="IssuerValidationDecision.Compare"/>, the
  /// present <c>iss</c> is compared by EXACT string match (no normalization; R-23.7-g).
  /// </summary>
  /// <param name="iss">The decoded <c>iss</c> from the response, if any.</param>
  /// <param name="recordedIssuer">The <c>issuer</c> recorded in Step 1 (R-23.5-c).</param>
  /// <param name="issParameterSupported">The AS metadata flag, if advertised (R-23.7-c).</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult ValidateIssuer(string? iss, string recordedIssuer, bool? issParameterSupported)
  {
    var decision = Decision(issParameterSupported, iss is not null);
    switch (decision)
    {
      case IssuerValidationDecision.Reject:
        return AuthorizationResult.Fail("authorization_response_iss_parameter_supported is true but the response carried no iss; reject (R-23.7-e)");
      case IssuerValidationDecision.Proceed:
        return AuthorizationResult.Success;
      default:
        if (!string.Equals(iss, recordedIssuer, StringComparison.Ordinal))
        {
          return AuthorizationResult.Fail(
            $"iss \"{iss}\" does not exactly match the recorded issuer \"{recordedIssuer}\" (possible mix-up attack); MUST NOT redeem the code (R-23.7-a, R-23.7-g)");
        }
        return AuthorizationResult.Success;
    }
  }

  /// <summary>
  /// Verifies the redirect <c>state</c> against the value sent in Step 1 — the check a client MUST pass
  /// before redeeming the code (R-23.5-h, R-23.5-l). When a <c>state</c> was sent, the returned
  /// <c>state</c> MUST be present and equal it (exact match). When none was sent, a returned <c>state</c>
  /// is ignored.
  /// </summary>
  /// <param name="sentState">The <c>state</c> sent in the authorization request, or <c>null</c>.</param>
  /// <param name="returnedState">The <c>state</c> echoed on the redirect, or <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult VerifyState(string? sentState, string? returnedState)
  {
    if (sentState is null)
    {
      return AuthorizationResult.Success;
    }
    if (!string.Equals(returnedState, sentState, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail(
        $"redirect state \"{returnedState}\" does not match the value sent \"{sentState}\"; MUST NOT redeem the code (R-23.5-l)");
    }
    return AuthorizationResult.Success;
  }

  /// <summary>
  /// Processes a Step-3 authorization redirect end to end: parses the response, verifies <c>state</c>,
  /// validates <c>iss</c> per §23.7, and only then yields the code for redemption (spec §23.5 Step 3,
  /// R-23.5-h, R-23.5-l, R-23.5-m, R-23.7-a, R-23.7-h).
  /// </summary>
  /// <remarks>
  /// On an error response, the <c>error</c>/<c>error_description</c>/<c>error_uri</c> are surfaced ONLY
  /// when <c>iss</c> validation succeeds; on <c>iss</c> mismatch they are withheld and MUST NOT be acted
  /// on or displayed (R-23.7-h).
  /// </remarks>
  /// <param name="redirect">The raw redirect URL or query string.</param>
  /// <param name="recordedIssuer">The Step-1 recorded issuer.</param>
  /// <param name="sentState">The Step-1 sent <c>state</c>, if any.</param>
  /// <param name="issParameterSupported">The AS metadata flag, if advertised.</param>
  /// <returns>The redirect-processing result.</returns>
  public static AuthorizationRedirectResult Process(
    string redirect,
    string recordedIssuer,
    string? sentState = null,
    bool? issParameterSupported = null)
  {
    var parameters = AuthorizationResponseParams.Parse(redirect);

    var stateResult = VerifyState(sentState, parameters.State);
    if (!stateResult.Ok)
    {
      return AuthorizationRedirectResult.Fail(stateResult.Reason);
    }

    var issResult = ValidateIssuer(parameters.Iss, recordedIssuer, issParameterSupported);
    if (!issResult.Ok)
    {
      // iss mismatch in an error response: do NOT surface error details (R-23.7-h).
      return AuthorizationRedirectResult.Fail(issResult.Reason);
    }

    if (parameters.Error is not null)
    {
      // iss validated → it is now safe to surface the error details (R-23.7-h).
      return AuthorizationRedirectResult.Fail(
        $"authorization server returned error \"{parameters.Error}\"",
        new AuthorizationErrorDetails(parameters.Error, parameters.ErrorDescription, parameters.ErrorUri));
    }

    if (parameters.Code is null)
    {
      return AuthorizationRedirectResult.Fail("authorization response is missing the code parameter");
    }
    return AuthorizationRedirectResult.Success(parameters.Code);
  }

  /// <summary>
  /// Returns the displayable error details from an authorization redirect ONLY when <c>iss</c> validation
  /// succeeds, withholding them on mismatch (R-23.7-h). Returns <c>null</c> when there is no error, or
  /// when the details must be withheld.
  /// </summary>
  /// <param name="parameters">The parsed authorization response.</param>
  /// <param name="issResult">The result of <see cref="ValidateIssuer"/> for this response.</param>
  /// <returns>The safe-to-surface error details, or <c>null</c>.</returns>
  public static AuthorizationErrorDetails? SafeError(AuthorizationResponseParams parameters, AuthorizationResult issResult)
  {
    if (parameters.Error is null || !issResult.Ok)
    {
      return null;
    }
    return new AuthorizationErrorDetails(parameters.Error, parameters.ErrorDescription, parameters.ErrorUri);
  }
}

// ─── Token request — Step 4 & refresh (§23.5, §23.6, §23.9) ─────────────────────

/// <summary>
/// The form-encoded token-request body for the authorization-code grant (spec §23.5 Step 4, R-23.5-n –
/// R-23.5-p, R-23.6-b).
/// </summary>
/// <param name="Code">The authorization code from the redirect.</param>
/// <param name="RedirectUri">MUST be identical to the Step-2 <c>redirect_uri</c> (R-23.5-o).</param>
/// <param name="CodeVerifier">The PKCE verifier matching the Step-2 <c>code_challenge</c> (R-23.5-b).</param>
/// <param name="ClientId">The client identifier.</param>
/// <param name="Resource">MUST be identical to the Step-2 <c>resource</c> (R-23.5-p, R-23.6-b).</param>
public sealed record AuthorizationCodeTokenRequest(
  string Code,
  string RedirectUri,
  string CodeVerifier,
  string ClientId,
  string Resource) : ITokenRequest
{
  /// <summary>MUST be <c>authorization_code</c> (R-23.5-n).</summary>
  public string GrantType => OAuthValues.GrantTypeAuthorizationCode;

  /// <inheritdoc/>
  public IReadOnlyList<KeyValuePair<string, string>> ToFormFields() =>
  [
    new("grant_type", GrantType),
    new("code", Code),
    new("redirect_uri", RedirectUri),
    new("code_verifier", CodeVerifier),
    new("client_id", ClientId),
    new("resource", Resource),
  ];
}

/// <summary>
/// The form-encoded token-request body for the refresh-token grant (spec §23.9, R-23.9-e, R-23.9-f).
/// </summary>
/// <param name="RefreshToken">The refresh token being exchanged (R-23.9-e).</param>
/// <param name="ClientId">The client identifier.</param>
/// <param name="Resource">The SAME canonical resource identifier, keeping the token audience-bound (R-23.9-e).</param>
/// <param name="Scope">OPTIONAL narrowed scopes (R-23.9-f).</param>
public sealed record RefreshTokenRequest(
  string RefreshToken,
  string ClientId,
  string Resource,
  string? Scope = null) : ITokenRequest
{
  /// <summary>MUST be <c>refresh_token</c> (R-23.9-e).</summary>
  public string GrantType => OAuthValues.GrantTypeRefreshToken;

  /// <inheritdoc/>
  public IReadOnlyList<KeyValuePair<string, string>> ToFormFields()
  {
    var fields = new List<KeyValuePair<string, string>>
    {
      new("grant_type", GrantType),
      new("refresh_token", RefreshToken),
      new("client_id", ClientId),
      new("resource", Resource),
    };
    if (Scope is not null)
    {
      fields.Add(new KeyValuePair<string, string>("scope", Scope));
    }
    return fields;
  }
}

/// <summary>A token request of either grant; renders its <c>application/x-www-form-urlencoded</c> body (spec §23.5/§23.9).</summary>
public interface ITokenRequest
{
  /// <summary>The OAuth <c>grant_type</c> for this request.</summary>
  string GrantType { get; }

  /// <summary>The canonical resource identifier (audience binding); MUST match the Step-2 value (R-23.5-p, R-23.9-e).</summary>
  string Resource { get; }

  /// <summary>Returns the ordered form fields for the <c>application/x-www-form-urlencoded</c> token-request body.</summary>
  /// <returns>The ordered key/value form fields.</returns>
  IReadOnlyList<KeyValuePair<string, string>> ToFormFields();
}

/// <summary>Token-request body builders, the encoder, and the Step-2/Step-4 audience invariant (spec §23.5, §23.6, §23.9).</summary>
public static class TokenRequests
{
  /// <summary>
  /// Builds the authorization-code token-request body (Step 4), fixing <c>grant_type=authorization_code</c>
  /// and carrying the PKCE <c>code_verifier</c> plus the REQUIRED <c>resource</c> parameter (R-23.5-n –
  /// R-23.5-p, R-23.6-b).
  /// </summary>
  /// <param name="code">The authorization code from the redirect.</param>
  /// <param name="redirectUri">MUST be identical to the Step-2 <c>redirect_uri</c> (R-23.5-o).</param>
  /// <param name="codeVerifier">The PKCE verifier from the Step-1 record (R-23.5-b).</param>
  /// <param name="clientId">The client identifier.</param>
  /// <param name="resource">MUST be identical to the Step-2 <c>resource</c> (R-23.5-p).</param>
  /// <returns>The authorization-code token request.</returns>
  public static AuthorizationCodeTokenRequest BuildAuthorizationCode(
    string code, string redirectUri, string codeVerifier, string clientId, string resource) =>
    new(code, redirectUri, codeVerifier, clientId, resource);

  /// <summary>
  /// Builds the refresh-token token-request body, fixing <c>grant_type=refresh_token</c> and carrying the
  /// same <c>resource</c> parameter so the refreshed token stays audience-bound (R-23.9-e, R-23.9-f).
  /// </summary>
  /// <param name="refreshToken">The refresh token being exchanged (R-23.9-e).</param>
  /// <param name="clientId">The client identifier.</param>
  /// <param name="resource">The SAME canonical resource identifier as Step 2 (R-23.9-e).</param>
  /// <param name="scope">OPTIONAL narrowed scopes (R-23.9-f).</param>
  /// <returns>The refresh token request.</returns>
  public static RefreshTokenRequest BuildRefresh(string refreshToken, string clientId, string resource, string? scope = null) =>
    new(refreshToken, clientId, resource, scope);

  /// <summary>Serializes a token request into an <c>application/x-www-form-urlencoded</c> body (spec §23.5/§23.9).</summary>
  /// <param name="request">The token request of either grant.</param>
  /// <returns>The form-encoded body string.</returns>
  public static string EncodeBody(ITokenRequest request) =>
    string.Join('&', request.ToFormFields()
      .Select(f => $"{Uri.EscapeDataString(f.Key)}={Uri.EscapeDataString(f.Value)}"));

  /// <summary>
  /// Asserts that a token request's <c>resource</c> is byte-identical to the value sent in Step 2 — the
  /// audience-binding invariant (R-23.5-p, R-23.9-e).
  /// </summary>
  /// <param name="request">The token request (either grant).</param>
  /// <param name="step2Resource">The <c>resource</c> sent in the Step-2 authorization request.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult AssertResourceMatchesStep2(ITokenRequest request, string step2Resource)
  {
    if (!string.Equals(request.Resource, step2Resource, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail(
        $"token request resource \"{request.Resource}\" MUST be identical to the Step-2 resource \"{step2Resource}\" (R-23.5-p)");
    }
    return AuthorizationResult.Success;
  }
}

// ─── Token response (§23.5, §23.9) ──────────────────────────────────────────────

/// <summary>
/// The token-endpoint JSON response (spec §23.5 Step 4, §23.9). <see cref="AccessToken"/> and
/// <see cref="TokenType"/> (<c>Bearer</c>) are REQUIRED; the rest are OPTIONAL — a client MUST NOT assume
/// a refresh token will be issued (R-23.9-d).
/// </summary>
public sealed record TokenResponse
{
  /// <summary>REQUIRED bearer token (R-23.8-b).</summary>
  [JsonPropertyName("access_token")]
  public required string AccessToken { get; init; }

  /// <summary>REQUIRED token type; MCP uses <c>Bearer</c> (R-23.8-b).</summary>
  [JsonPropertyName("token_type")]
  public required string TokenType { get; init; }

  /// <summary>OPTIONAL lifetime in seconds.</summary>
  [JsonPropertyName("expires_in")]
  public int? ExpiresIn { get; init; }

  /// <summary>OPTIONAL refresh token, at the AS's discretion (R-23.9-d).</summary>
  [JsonPropertyName("refresh_token")]
  public string? RefreshToken { get; init; }

  /// <summary>OPTIONAL granted scopes.</summary>
  [JsonPropertyName("scope")]
  public string? Scope { get; init; }

  /// <summary>Returns <c>true</c> when this response did NOT issue a refresh token, so callers never assume one (R-23.9-d).</summary>
  public bool HasNoRefreshToken => RefreshToken is null;

  /// <summary>
  /// Parses a token-endpoint response body, returning <c>null</c> when it lacks the REQUIRED
  /// <c>access_token</c>/<c>token_type</c>.
  /// </summary>
  /// <param name="value">The raw response body, or <c>null</c>.</param>
  /// <returns>The parsed response, or <c>null</c> when invalid.</returns>
  public static TokenResponse? Parse(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return null;
    }
    var accessToken = (obj["access_token"] as JsonValue)?.GetValue<string>();
    var tokenType = (obj["token_type"] as JsonValue)?.GetValue<string>();
    if (string.IsNullOrEmpty(accessToken) || string.IsNullOrEmpty(tokenType))
    {
      return null;
    }
    return new TokenResponse
    {
      AccessToken = accessToken,
      TokenType = tokenType,
      ExpiresIn = (obj["expires_in"] as JsonValue)?.GetValue<int>(),
      RefreshToken = (obj["refresh_token"] as JsonValue)?.GetValue<string>(),
      Scope = (obj["scope"] as JsonValue)?.GetValue<string>(),
    };
  }

  /// <summary>
  /// Parses and validates a token-endpoint response body, confirming <c>token_type</c> is <c>Bearer</c>
  /// (case-insensitive, per RFC 6749) since MCP presents the token via the <c>Bearer</c> scheme
  /// (R-23.8-b). On success <paramref name="token"/> is populated.
  /// </summary>
  /// <param name="value">The raw token-endpoint response body.</param>
  /// <param name="token">On success, the validated token response; otherwise <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult Validate(JsonNode? value, out TokenResponse? token)
  {
    token = Parse(value);
    if (token is null)
    {
      return AuthorizationResult.Fail("invalid token response: missing access_token or token_type");
    }
    if (!string.Equals(token.TokenType, OAuthValues.TokenTypeBearer, StringComparison.OrdinalIgnoreCase))
    {
      var bad = token;
      token = null;
      return AuthorizationResult.Fail($"token_type \"{bad.TokenType}\" MUST be \"Bearer\" for MCP (R-23.8-b)");
    }
    return AuthorizationResult.Success;
  }
}

// ─── Resource Indicators & audience binding (§23.6) ─────────────────────────────

/// <summary>
/// The validated facts about a presented token, supplied by signature/introspection (spec §23.8).
/// </summary>
/// <param name="Active">Whether the signature or introspection result is valid (R-23.8-d).</param>
/// <param name="Expired">Whether the token is expired (R-23.8-d).</param>
/// <param name="Audience">The token's audience claim — a single value (R-23.8-d).</param>
/// <param name="Scopes">The scopes the token grants (R-23.8-d).</param>
/// <param name="Audiences">The token's audience claim when it is an array; takes precedence over <paramref name="Audience"/> when set.</param>
public sealed record PresentedToken(
  bool Active,
  bool Expired,
  string? Audience,
  IReadOnlyList<string> Scopes,
  IReadOnlyList<string>? Audiences = null)
{
  /// <summary>The token's audience as a list, whether supplied as a single value or an array.</summary>
  public IReadOnlyList<string> AudienceList =>
    Audiences ?? (Audience is null ? [] : [Audience]);
}

/// <summary>
/// The built <c>401</c>/<c>403</c> challenge a failed access-token validation yields (spec §23.8).
/// </summary>
/// <param name="Status">The HTTP status (<c>401</c> or <c>403</c>).</param>
/// <param name="WwwAuthenticate">The <c>WWW-Authenticate</c> header value.</param>
public sealed record AuthorizationChallenge(int Status, string WwwAuthenticate);

/// <summary>The outcome of <see cref="AccessTokenUsage.ValidateRequest"/>: authorized, or a challenge to return.</summary>
public sealed record AccessTokenValidationResult
{
  private AccessTokenValidationResult(bool ok, AuthorizationChallenge? challenge)
  {
    Ok = ok;
    Challenge = challenge;
  }

  /// <summary>Whether the presented token authorizes the request.</summary>
  [MemberNotNullWhen(false, nameof(Challenge))]
  public bool Ok { get; }

  /// <summary>The <c>401</c>/<c>403</c> challenge to return when not authorized; otherwise <c>null</c>.</summary>
  public AuthorizationChallenge? Challenge { get; }

  /// <summary>An authorized outcome.</summary>
  public static AccessTokenValidationResult Authorized { get; } = new(true, null);

  /// <summary>A rejected outcome carrying the <paramref name="challenge"/> to return.</summary>
  /// <param name="challenge">The challenge to return.</param>
  /// <returns>The rejected result.</returns>
  public static AccessTokenValidationResult Challenged(AuthorizationChallenge challenge) => new(false, challenge);
}

/// <summary>
/// Resource Indicators / audience binding (§23.6) and access-token usage / server-side per-request
/// validation (§23.8): the <c>resource</c> parameter, audience validation (string OR array), token
/// selection, the bearer header, and the <c>401</c>/<c>403</c> validation state machine.
/// </summary>
public static class AccessTokenUsage
{
  /// <summary>
  /// Returns the <c>resource</c> parameter value for the MCP server — its canonical resource identifier
  /// — that MUST be sent in BOTH the authorization and token requests, regardless of whether the AS
  /// advertises <c>resource</c> support (R-23.6-b – R-23.6-e). Surfaced as a named helper so the
  /// "always send it" rule is explicit.
  /// </summary>
  /// <param name="canonicalResourceIdentifier">The MCP server's canonical resource id.</param>
  /// <returns>The <c>resource</c> parameter value.</returns>
  public static string ResourceParameterFor(string canonicalResourceIdentifier) => canonicalResourceIdentifier;

  /// <summary>
  /// Validates, on the MCP server side, that a presented token was issued for THIS server as the intended
  /// audience, rejecting any token whose audience is some other resource (R-23.6-f, R-23.6-g, R-23.6-h).
  /// Accepts a single audience OR an array, comparing each by canonical resource identity (uppercase
  /// scheme/host tolerant, trailing-slash tolerant; R-23.1-p).
  /// </summary>
  /// <param name="tokenAudiences">The audience claim(s) the token carries.</param>
  /// <param name="ownCanonicalResource">This server's canonical resource identifier.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult ValidateTokenAudience(IReadOnlyList<string> tokenAudiences, string ownCanonicalResource)
  {
    foreach (var aud in tokenAudiences)
    {
      if (CanonicalResourceIdentifier.Equal(aud, ownCanonicalResource))
      {
        return AuthorizationResult.Success;
      }
    }
    return AuthorizationResult.Fail(
      $"token audience [{string.Join(", ", tokenAudiences)}] was not issued for this server \"{ownCanonicalResource}\"; reject and never forward (R-23.6-g, R-23.6-h)");
  }

  /// <summary>
  /// Selects the access token a client may send to a given MCP server — strictly the one issued by that
  /// server's authorization server for that server, and no other (R-23.6-i). Returns a failed outcome
  /// (and <paramref name="accessToken"/> <c>null</c>) when no matching token exists, so the client sends
  /// nothing rather than a wrong-audience token.
  /// </summary>
  /// <param name="serverIssuer">The issuer of the server's authorization server.</param>
  /// <param name="serverCanonicalResource">The server's canonical resource id.</param>
  /// <param name="tokenIssuer">The issuer that minted the candidate token.</param>
  /// <param name="tokenAudiences">The candidate token's audience(s).</param>
  /// <param name="candidateAccessToken">The candidate access token.</param>
  /// <param name="accessToken">On success, the access token to send; otherwise <c>null</c>.</param>
  /// <returns>The selection outcome.</returns>
  public static AuthorizationResult SelectTokenForServer(
    string serverIssuer,
    string serverCanonicalResource,
    string tokenIssuer,
    IReadOnlyList<string> tokenAudiences,
    string candidateAccessToken,
    out string? accessToken)
  {
    accessToken = null;
    if (!string.Equals(tokenIssuer, serverIssuer, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail(
        $"token was issued by \"{tokenIssuer}\", not by this server's authorization server \"{serverIssuer}\"; MUST NOT send it (R-23.6-i)");
    }
    var audience = ValidateTokenAudience(tokenAudiences, serverCanonicalResource);
    if (!audience.Ok)
    {
      return AuthorizationResult.Fail(audience.Reason);
    }
    accessToken = candidateAccessToken;
    return AuthorizationResult.Success;
  }

  /// <summary>
  /// Builds the <c>Authorization: Bearer &lt;access-token&gt;</c> request header value a client MUST send
  /// on every request to the MCP server (R-23.8-a, R-23.8-b).
  /// </summary>
  /// <param name="accessToken">The bearer access token.</param>
  /// <returns>The header value.</returns>
  /// <exception cref="ArgumentException">When <paramref name="accessToken"/> is empty.</exception>
  public static string BuildBearerHeader(string accessToken)
  {
    if (string.IsNullOrEmpty(accessToken))
    {
      throw new ArgumentException("access token MUST NOT be empty (R-23.8-b)", nameof(accessToken));
    }
    return $"{AuthorizationConstants.BearerScheme} {accessToken}";
  }

  /// <summary>
  /// Extracts the bearer token from an <c>Authorization</c> header value, or <c>null</c> when the header
  /// is absent or does not use the <c>Bearer</c> scheme (R-23.8-b). The scheme match is case-insensitive
  /// per RFC 7235.
  /// </summary>
  /// <param name="headerValue">The raw <c>Authorization</c> header value, if any.</param>
  /// <returns>The extracted token, or <c>null</c>.</returns>
  public static string? ExtractBearerToken(string? headerValue)
  {
    if (headerValue is null)
    {
      return null;
    }
    var trimmed = headerValue.Trim();
    var spaceIndex = trimmed.IndexOf(' ', StringComparison.Ordinal);
    if (spaceIndex <= 0)
    {
      return null;
    }
    var scheme = trimmed[..spaceIndex];
    if (!string.Equals(scheme, AuthorizationConstants.BearerScheme, StringComparison.OrdinalIgnoreCase))
    {
      return null;
    }
    var token = trimmed[(spaceIndex + 1)..].Trim();
    return token.Length == 0 ? null : token;
  }

  /// <summary>
  /// Returns <c>true</c> when a URL carries an <c>access_token</c> in its query string, which a client
  /// MUST NOT do (R-23.8-c).
  /// </summary>
  /// <param name="requestUrl">The request URL to inspect.</param>
  /// <returns><c>true</c> when an <c>access_token</c> query parameter is present.</returns>
  public static bool UrlContainsAccessTokenInQuery(string requestUrl)
  {
    if (Uri.TryCreate(requestUrl, UriKind.Absolute, out var url))
    {
      return System.Web.HttpUtility.ParseQueryString(url.Query)["access_token"] is not null;
    }
    return Regex.IsMatch(requestUrl, "[?&]access_token=", RegexOptions.CultureInvariant);
  }

  /// <summary>
  /// Validates a presented access token on the MCP server side, on EVERY request, yielding a
  /// <c>401</c>/<c>403</c> challenge on failure (R-23.8-a, R-23.8-d, R-23.8-e, R-23.8-f).
  /// </summary>
  /// <remarks>
  /// The checks, in order: missing / inactive / expired token → <c>401</c> (R-23.8-e); wrong audience →
  /// <c>401</c> (R-23.6-f/g, R-23.8-d/e); valid token lacking a required scope → <c>403</c> with an
  /// <c>insufficient_scope</c> challenge (R-23.8-f).
  /// </remarks>
  /// <param name="token">The presented token's validated facts, or <c>null</c> when absent.</param>
  /// <param name="ownCanonicalResource">This server's canonical resource identifier (the expected audience).</param>
  /// <param name="resourceMetadata">The protected-resource metadata URI for the challenge.</param>
  /// <param name="requiredScopes">The scopes this operation requires; empty/<c>null</c> when none.</param>
  /// <returns>The authorization outcome (authorized, or a challenge).</returns>
  public static AccessTokenValidationResult ValidateRequest(
    PresentedToken? token,
    string ownCanonicalResource,
    string resourceMetadata,
    IReadOnlyList<string>? requiredScopes = null)
  {
    var scopes = requiredScopes ?? [];
    var scopeParam = scopes.Count > 0 ? string.Join(' ', scopes) : null;

    // Missing / invalid / expired → 401 (R-23.8-e).
    if (token is null || !token.Active || token.Expired)
    {
      return AccessTokenValidationResult.Challenged(new AuthorizationChallenge(
        AuthorizationConstants.UnauthorizedStatus,
        WwwAuthenticate.BuildUnauthorizedValue(resourceMetadata, scopeParam)));
    }

    // Wrong audience → 401 (R-23.6-f/g, R-23.8-d/e).
    if (!ValidateTokenAudience(token.AudienceList, ownCanonicalResource).Ok)
    {
      return AccessTokenValidationResult.Challenged(new AuthorizationChallenge(
        AuthorizationConstants.UnauthorizedStatus,
        WwwAuthenticate.BuildUnauthorizedValue(resourceMetadata, scopeParam)));
    }

    // Valid token lacking required scope → 403 insufficient_scope (R-23.8-f).
    var missing = scopes.Where(s => !token.Scopes.Contains(s)).ToList();
    if (missing.Count > 0)
    {
      return AccessTokenValidationResult.Challenged(new AuthorizationChallenge(
        AuthorizationConstants.ForbiddenStatus,
        WwwAuthenticate.BuildInsufficientScopeValue(
          string.Join(' ', scopes),
          resourceMetadata,
          $"missing required scope(s): {string.Join(' ', missing)}")));
    }

    return AccessTokenValidationResult.Authorized;
  }
}
