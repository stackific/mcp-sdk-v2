using System.Diagnostics.CodeAnalysis;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Stackific.Mcp.Protocol;

// ─── Shared validation outcome (used across S35/S36/S37) ────────────────────────

/// <summary>
/// The result of a validation that either succeeds or fails with a human-readable reason —
/// the idiomatic C# rendering of the TypeScript SDK's <c>{ ok: true } | { ok: false; reason }</c>
/// discriminated bag, used pervasively across the authorization layer (spec §23).
/// </summary>
/// <remarks>
/// Prefer this lightweight outcome over throwing for <em>expected</em> validation failures (a
/// mismatched issuer, an under-scoped token), because the spec frequently requires the caller to
/// branch on the failure (withhold error details, re-register, surface a message) rather than abort.
/// Genuine programmer errors (an empty REQUIRED parameter) still throw.
/// </remarks>
public readonly record struct AuthorizationResult
{
  private AuthorizationResult(bool ok, string? reason)
  {
    Ok = ok;
    Reason = reason;
  }

  /// <summary>Whether the validation succeeded.</summary>
  [MemberNotNullWhen(false, nameof(Reason))]
  public bool Ok { get; }

  /// <summary>The human-readable failure reason when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public string? Reason { get; }

  /// <summary>A successful outcome.</summary>
  public static AuthorizationResult Success { get; } = new(true, null);

  /// <summary>A failed outcome carrying the human-readable <paramref name="reason"/>.</summary>
  /// <param name="reason">Why the validation failed.</param>
  /// <returns>The failed outcome.</returns>
  public static AuthorizationResult Fail(string reason) => new(false, reason);
}

// ─── Applicability and transports (§23.1, R-23.1-a – R-23.1-c) ──────────────────

/// <summary>
/// The transport families relevant to authorization applicability (spec §23.1, R-23.1-a – R-23.1-c).
/// </summary>
/// <remarks>
/// <see cref="Http"/> is the Streamable HTTP transport of §9 — the only family §23 governs.
/// <see cref="Stdio"/> is the §8 stdio transport, which MUST NOT use this flow. <see cref="Other"/>
/// stands for any transport that is neither: it follows its own established security best practices
/// and is outside §23's scope.
/// </remarks>
public enum TransportFamily
{
  /// <summary>The Streamable HTTP transport of §9 — the only family §23 authorization governs.</summary>
  Http,

  /// <summary>The §8 stdio transport, which MUST NOT use the §23 authorization flow (R-23.1-b).</summary>
  Stdio,

  /// <summary>Any other transport; follows its own best practices, outside §23 (R-23.1-c).</summary>
  Other,
}

/// <summary>
/// How a client conveys credentials for a given <see cref="TransportFamily"/> (spec §23.1).
/// </summary>
public enum CredentialConveyance
{
  /// <summary>The OAuth 2.1 bearer-token flow of §23 (HTTP).</summary>
  Bearer,

  /// <summary>Out-of-band via the child-process environment (stdio, R-23.1-b).</summary>
  Environment,

  /// <summary>That transport's own best-practice mechanism (other, R-23.1-c).</summary>
  BestPractice,
}

/// <summary>
/// Applicability predicates for the §23 authorization flow: which transports it governs, which are
/// forbidden from using it, and how each conveys credentials (spec §23.1, R-23.1-a – R-23.1-c).
/// </summary>
public static class AuthorizationApplicability
{
  /// <summary>
  /// Returns <c>true</c> when the §23 authorization flow applies to <paramref name="transport"/>.
  /// Authorization applies ONLY to HTTP-based transports (R-23.1-a).
  /// </summary>
  /// <param name="transport">The transport family the request rides on.</param>
  /// <returns><c>true</c> for <see cref="TransportFamily.Http"/>; otherwise <c>false</c>.</returns>
  public static bool AppliesTo(TransportFamily transport) => transport == TransportFamily.Http;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="transport"/> MUST NOT use the §23 flow. Only stdio is
  /// explicitly forbidden (R-23.1-b); <see cref="TransportFamily.Other"/> is merely outside §23's
  /// scope (R-23.1-c), not forbidden.
  /// </summary>
  /// <param name="transport">The transport family the request rides on.</param>
  /// <returns><c>true</c> only for <see cref="TransportFamily.Stdio"/>.</returns>
  public static bool ForbiddenFor(TransportFamily transport) => transport == TransportFamily.Stdio;

  /// <summary>Returns how credentials are conveyed for <paramref name="transport"/> (R-23.1-a – R-23.1-c).</summary>
  /// <param name="transport">The transport family the request rides on.</param>
  /// <returns>The credential-conveyance mechanism.</returns>
  public static CredentialConveyance ConveyanceFor(TransportFamily transport) => transport switch
  {
    TransportFamily.Http => CredentialConveyance.Bearer,
    TransportFamily.Stdio => CredentialConveyance.Environment,
    _ => CredentialConveyance.BestPractice,
  };
}

// ─── HTTP status codes & constants for authorization errors (§23.1) ─────────────

/// <summary>
/// The HTTP status codes and header/scheme constants for the §23 authorization layer (spec §23.1).
/// </summary>
public static class AuthorizationConstants
{
  /// <summary>HTTP <c>401</c>: authorization required, or token missing/invalid/expired (R-23.1-t).</summary>
  public const int UnauthorizedStatus = 401;

  /// <summary>HTTP <c>403</c>: invalid scope or insufficient permissions (R-23.1-aa).</summary>
  public const int ForbiddenStatus = 403;

  /// <summary>HTTP <c>400</c>: malformed authorization request (§23.1 status table).</summary>
  public const int BadRequestStatus = 400;

  /// <summary>The HTTP <c>WWW-Authenticate</c> response-header name (R-23.1-u).</summary>
  public const string WwwAuthenticateHeader = "WWW-Authenticate";

  /// <summary>The HTTP <c>Authorization</c> request-header name (R-23.8-b).</summary>
  public const string AuthorizationHeader = "Authorization";

  /// <summary>The authentication scheme every MCP challenge uses (R-23.1-u).</summary>
  public const string BearerScheme = "Bearer";

  /// <summary>The <c>error</c> code carried by an insufficient-scope <c>403</c> challenge (R-23.1-ab).</summary>
  public const string InsufficientScopeError = "insufficient_scope";
}

// ─── Per-authorization-server credential isolation (§23.1, R-23.1-i – R-23.1-l) ──

/// <summary>
/// Registration state held for a single authorization server, keyed by its <c>issuer</c> (spec §23.1).
/// </summary>
/// <remarks>
/// A client MUST store this separately per authorization server (R-23.1-i); credentials registered
/// with one server MUST NOT be assumed valid at another (R-23.1-j). The concrete
/// <see cref="ClientId"/>/token fields are populated by S36/S37 — this story owns only the
/// per-<c>issuer</c> isolation contract.
/// </remarks>
/// <param name="Issuer">The authorization server's <c>issuer</c> identifier URL; the isolation key.</param>
/// <param name="ClientId">OPTIONAL registered client identifier (populated by S36/S37).</param>
/// <param name="AccessToken">OPTIONAL issued access token (populated by S36).</param>
/// <param name="RefreshToken">OPTIONAL issued refresh token (populated by S36).</param>
public sealed record AuthorizationServerRegistration(
  string Issuer,
  string? ClientId = null,
  string? AccessToken = null,
  string? RefreshToken = null);

/// <summary>
/// A per-authorization-server credential store keyed by <c>issuer</c>, enforcing the §23.1 isolation
/// rules (R-23.1-i – R-23.1-l): registration state is kept separate per <c>issuer</c>, a lookup never
/// returns another server's credentials, and <see cref="NeedsReregistration"/> reports when the
/// indicated authorization server changes so the client re-registers/re-discovers against the new one.
/// </summary>
public sealed class CredentialStore
{
  private readonly Dictionary<string, AuthorizationServerRegistration> _byIssuer = new(StringComparer.Ordinal);

  /// <summary>
  /// Records (or replaces) the registration state for <paramref name="registration"/>'s issuer; each
  /// <c>issuer</c> keeps an isolated entry (R-23.1-i).
  /// </summary>
  /// <param name="registration">The registration state to store.</param>
  public void Register(AuthorizationServerRegistration registration) =>
    _byIssuer[registration.Issuer] = registration;

  /// <summary>
  /// Returns the registration state for <paramref name="issuer"/>, or <c>null</c> when none is stored.
  /// Never returns another <c>issuer</c>'s credentials (R-23.1-i, R-23.1-j).
  /// </summary>
  /// <param name="issuer">The authorization-server issuer to look up.</param>
  /// <returns>The stored registration, or <c>null</c>.</returns>
  public AuthorizationServerRegistration? CredentialsFor(string issuer) =>
    _byIssuer.TryGetValue(issuer, out var found) ? found : null;

  /// <summary>Returns <c>true</c> when registration state exists for <paramref name="issuer"/>.</summary>
  /// <param name="issuer">The authorization-server issuer to test.</param>
  /// <returns><c>true</c> when an entry is stored.</returns>
  public bool HasCredentialsFor(string issuer) => _byIssuer.ContainsKey(issuer);

  /// <summary>
  /// Returns <c>true</c> when moving from <paramref name="previousIssuer"/> to
  /// <paramref name="currentIssuer"/> requires the client to re-register / re-discover rather than
  /// reuse credentials: whenever the indicated authorization server changed, or no credentials are yet
  /// stored for <paramref name="currentIssuer"/>. A client MUST NOT reuse a different server's
  /// credentials (R-23.1-k) and MUST re-register/re-discover against the new one (R-23.1-l).
  /// </summary>
  /// <param name="previousIssuer">The previously indicated <c>issuer</c>, or <c>null</c> when none was.</param>
  /// <param name="currentIssuer">The <c>issuer</c> now indicated by protected-resource metadata.</param>
  /// <returns><c>true</c> when re-registration/re-discovery is required.</returns>
  public bool NeedsReregistration(string? previousIssuer, string currentIssuer)
  {
    if (previousIssuer is not null && !string.Equals(previousIssuer, currentIssuer, StringComparison.Ordinal))
    {
      return true;
    }
    return !HasCredentialsFor(currentIssuer);
  }
}

// ─── Canonical resource identifier (§23.1, R-23.1-m – R-23.1-s) ─────────────────

/// <summary>
/// Canonical-resource-identifier construction, validation, and comparison helpers (spec §23.1,
/// R-23.1-m – R-23.1-s): the absolute <c>https</c> (or loopback <c>http</c>) URI, with no fragment,
/// in lowercase canonical form, that identifies an MCP server as a token audience.
/// </summary>
public static class CanonicalResourceIdentifier
{
  /// <summary>
  /// Returns <c>true</c> when <paramref name="host"/> denotes loopback / local development, for which
  /// the <c>http</c> scheme is permitted on a canonical resource identifier (R-23.1-n).
  /// </summary>
  /// <param name="host">The host component to test.</param>
  /// <returns><c>true</c> for <c>localhost</c>, <c>127.0.0.1</c>, or the IPv6 loopback.</returns>
  public static bool IsLoopbackHost(string host)
  {
    var h = host.ToLowerInvariant();
    return h is "localhost" or "127.0.0.1" or "[::1]" or "::1";
  }

  /// <summary>
  /// Validates and canonicalizes an MCP server endpoint URL into its canonical resource identifier
  /// (spec §23.1, R-23.1-m – R-23.1-s), writing the lowercase-scheme/host, fragment-free form to
  /// <paramref name="canonical"/> on success.
  /// </summary>
  /// <remarks>
  /// Enforced constraints: MUST be an absolute URI (R-23.1-m); MUST use <c>https</c>, or <c>http</c>
  /// only for a loopback host (R-23.1-n); MUST NOT contain a fragment (R-23.1-o). For robustness the
  /// scheme and host are lowercased (R-23.1-p). A host-root URL is emitted in bare-origin form (no
  /// trailing slash) per R-23.1-s; a path-level trailing slash is preserved (this function cannot know
  /// whether it is semantically significant — see <see cref="StripDefaultTrailingSlash"/>).
  /// </remarks>
  /// <param name="endpointUrl">The MCP server's endpoint URL.</param>
  /// <param name="canonical">On success, the canonicalized identifier; otherwise <c>null</c>.</param>
  /// <param name="reason">On failure, why the candidate is invalid; otherwise <c>null</c>.</param>
  /// <returns><c>true</c> when <paramref name="endpointUrl"/> is a valid canonical resource identifier.</returns>
  public static bool TryCanonicalize(
    string endpointUrl,
    [NotNullWhen(true)] out string? canonical,
    [NotNullWhen(false)] out string? reason)
  {
    canonical = null;
    reason = null;

    if (!Uri.TryCreate(endpointUrl, UriKind.Absolute, out var url))
    {
      reason = "canonical resource identifier MUST be an absolute URI (R-23.1-m)";
      return false;
    }

    var scheme = url.Scheme.ToLowerInvariant();
    if (scheme is not "https" and not "http")
    {
      reason = $"unsupported scheme \"{scheme}\"; MUST be https (or http for loopback) (R-23.1-n)";
      return false;
    }
    if (scheme == "http" && !IsLoopbackHost(url.Host))
    {
      reason = "the http scheme is permitted only for loopback/local development (R-23.1-n)";
      return false;
    }
    if (!string.IsNullOrEmpty(url.Fragment))
    {
      reason = "canonical resource identifier MUST NOT contain a fragment (R-23.1-o)";
      return false;
    }

    // Canonical form: lowercase scheme + host. Emit the bare-origin form for a host-root input so
    // `https://h` and `https://h/` are canonically identical (R-23.1-p, R-23.1-s).
    var host = url.Host.ToLowerInvariant();
    var authority = url.IsDefaultPort ? host : $"{host}:{url.Port}";
    var pathAndQuery = url.PathAndQuery;
    canonical = pathAndQuery is "/" or ""
      ? $"{scheme}://{authority}"
      : $"{scheme}://{authority}{pathAndQuery}";
    return true;
  }

  /// <summary>Returns <c>true</c> when <paramref name="endpointUrl"/> is a valid canonical resource identifier (R-23.1-m – R-23.1-o).</summary>
  /// <param name="endpointUrl">The candidate endpoint URL.</param>
  /// <returns><c>true</c> when valid.</returns>
  public static bool IsValid(string endpointUrl) => TryCanonicalize(endpointUrl, out _, out _);

  /// <summary>
  /// Compares <paramref name="a"/> and <paramref name="b"/> as canonical resource identifiers,
  /// accepting an uppercase scheme/host on either side (R-23.1-p). Path, query, and port are compared
  /// case-sensitively; only scheme and host are case-insensitive. Returns <c>false</c> when either side
  /// is not a valid identifier.
  /// </summary>
  /// <param name="a">One resource identifier.</param>
  /// <param name="b">The other resource identifier.</param>
  /// <returns><c>true</c> when the two canonicalize to the same value.</returns>
  public static bool Equal(string a, string b) =>
    TryCanonicalize(a, out var ca, out _) &&
    TryCanonicalize(b, out var cb, out _) &&
    string.Equals(ca, cb, StringComparison.Ordinal);

  /// <summary>
  /// Returns <paramref name="uri"/> with a single trailing slash removed when the slash is not
  /// semantically significant (R-23.1-s). A path of just <c>"/"</c> (the bare-host root) is left intact.
  /// </summary>
  /// <param name="uri">The candidate URI.</param>
  /// <param name="slashIsSignificant">When <c>true</c>, the trailing slash is preserved.</param>
  /// <returns>The URI with a non-significant trailing slash stripped.</returns>
  public static string StripDefaultTrailingSlash(string uri, bool slashIsSignificant = false)
  {
    if (slashIsSignificant)
    {
      return uri;
    }
    if (Uri.TryCreate(uri, UriKind.Absolute, out var url))
    {
      var path = url.AbsolutePath;
      if (path != "/" && path.EndsWith('/'))
      {
        var trimmedPath = path.TrimEnd('/');
        var host = url.Host;
        var authority = url.IsDefaultPort ? host : $"{host}:{url.Port}";
        var query = url.Query;
        return $"{url.Scheme}://{authority}{trimmedPath}{query}";
      }
      return uri;
    }
    // Non-URL input: conservatively strip but never empty.
    return uri.Length > 1 && uri.EndsWith('/') ? uri.TrimEnd('/') : uri;
  }
}

// ─── WWW-Authenticate challenge (§23.1, R-23.1-t – R-23.1-ad) ───────────────────

/// <summary>
/// The structured fields of a <c>Bearer</c> <c>WWW-Authenticate</c> challenge (spec §23.1) — the
/// parameter set carried in the HTTP response header, not a JSON object.
/// </summary>
/// <remarks>
/// On a <c>401</c> (§7.4) <see cref="ResourceMetadata"/> is REQUIRED and <see cref="Scope"/> SHOULD be
/// present; on a <c>403</c> insufficient-scope challenge (§7.5) <see cref="Error"/> is
/// <c>insufficient_scope</c> and <see cref="Scope"/>, <see cref="ResourceMetadata"/>, and an OPTIONAL
/// <see cref="ErrorDescription"/> accompany it.
/// </remarks>
/// <param name="ResourceMetadata">Absolute URI of the protected-resource metadata document (R-23.1-v).</param>
/// <param name="Scope">Space-delimited scopes required for the operation (R-23.1-w, R-23.1-ab).</param>
/// <param name="Error">The failure code; <c>insufficient_scope</c> on a <c>403</c> (R-23.1-ab).</param>
/// <param name="ErrorDescription">OPTIONAL human-readable description of the failure (R-23.1-ad).</param>
public sealed record WwwAuthenticateChallenge(
  string? ResourceMetadata = null,
  string? Scope = null,
  string? Error = null,
  string? ErrorDescription = null);

/// <summary>
/// Builders, the parser, and scope helpers for the <c>Bearer</c> <c>WWW-Authenticate</c> challenge
/// (spec §23.1, R-23.1-t – R-23.1-ad).
/// </summary>
public static partial class WwwAuthenticate
{
  // Matches a backslash escape (`\` followed by any character) inside an RFC 7235 quoted-string, so the
  // escape can be removed and the escaped character kept (`\"` → `"`, `\\` → `\`).
  [GeneratedRegex(@"\\(.)")]
  private static partial Regex QuotedEscapeRegex();
  /// <summary>Serializes one challenge parameter as <c>key="value"</c>, quoting the value per RFC 7235.</summary>
  private static string QuotedParam(string key, string value)
  {
    // RFC 7235 quoted-string: backslash-escape backslash and double-quote so a value containing a
    // double-quote (for example a URL with a query) cannot break out of the header value.
    var escaped = value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal);
    return $"{key}=\"{escaped}\"";
  }

  /// <summary>
  /// Builds the <c>WWW-Authenticate</c> header value for a <c>Bearer</c> challenge from its structured
  /// fields (R-23.1-u – R-23.1-w, R-23.1-ab – R-23.1-ad). Parameters are emitted in a stable order —
  /// <c>error</c>, <c>scope</c>, <c>resource_metadata</c>, <c>error_description</c> — each only when
  /// present; the <c>Bearer</c> scheme always leads.
  /// </summary>
  /// <param name="challenge">The structured challenge fields.</param>
  /// <returns>The header value, escaped per RFC 7235.</returns>
  public static string BuildValue(WwwAuthenticateChallenge challenge)
  {
    var parts = new List<string>(4);
    if (challenge.Error is not null)
    {
      parts.Add(QuotedParam("error", challenge.Error));
    }
    if (challenge.Scope is not null)
    {
      parts.Add(QuotedParam("scope", challenge.Scope));
    }
    if (challenge.ResourceMetadata is not null)
    {
      parts.Add(QuotedParam("resource_metadata", challenge.ResourceMetadata));
    }
    if (challenge.ErrorDescription is not null)
    {
      parts.Add(QuotedParam("error_description", challenge.ErrorDescription));
    }
    return parts.Count > 0
      ? $"{AuthorizationConstants.BearerScheme} {string.Join(", ", parts)}"
      : AuthorizationConstants.BearerScheme;
  }

  /// <summary>
  /// Builds an MCP server's <c>401 Unauthorized</c> <c>WWW-Authenticate</c> header value with the
  /// REQUIRED <c>resource_metadata</c> parameter (R-23.1-v) and the SHOULD-present <c>scope</c>
  /// (R-23.1-w) (spec §23.1, R-23.1-t – R-23.1-w).
  /// </summary>
  /// <param name="resourceMetadata">REQUIRED absolute URI of the protected-resource metadata document.</param>
  /// <param name="scope">SHOULD-present scopes required to access the resource.</param>
  /// <returns>The header value.</returns>
  /// <exception cref="ArgumentException">When <paramref name="resourceMetadata"/> is empty — it is REQUIRED.</exception>
  public static string BuildUnauthorizedValue(string resourceMetadata, string? scope = null)
  {
    if (string.IsNullOrEmpty(resourceMetadata))
    {
      throw new ArgumentException("401 WWW-Authenticate MUST include resource_metadata (R-23.1-v)", nameof(resourceMetadata));
    }
    return BuildValue(new WwwAuthenticateChallenge(ResourceMetadata: resourceMetadata, Scope: scope));
  }

  /// <summary>
  /// Builds an MCP server's <c>403 Forbidden</c> insufficient-scope <c>WWW-Authenticate</c> header
  /// value carrying <c>error="insufficient_scope"</c>, the <c>scope</c>, and <c>resource_metadata</c>
  /// (R-23.1-ab), with an OPTIONAL <c>error_description</c> (R-23.1-ad) (spec §23.1, R-23.1-aa – R-23.1-ad).
  /// The caller SHOULD pass the union of all scopes the operation needs so this is a single, complete
  /// challenge (R-23.1-ac).
  /// </summary>
  /// <param name="scope">REQUIRED space-delimited required scopes.</param>
  /// <param name="resourceMetadata">REQUIRED absolute URI of the protected-resource metadata document.</param>
  /// <param name="errorDescription">OPTIONAL human-readable description of the failure.</param>
  /// <returns>The header value.</returns>
  /// <exception cref="ArgumentException">When <paramref name="scope"/> or <paramref name="resourceMetadata"/> is empty.</exception>
  public static string BuildInsufficientScopeValue(string scope, string resourceMetadata, string? errorDescription = null)
  {
    if (string.IsNullOrEmpty(scope))
    {
      throw new ArgumentException("403 insufficient_scope WWW-Authenticate MUST include scope (R-23.1-ab)", nameof(scope));
    }
    if (string.IsNullOrEmpty(resourceMetadata))
    {
      throw new ArgumentException("403 insufficient_scope WWW-Authenticate MUST include resource_metadata (R-23.1-ab)", nameof(resourceMetadata));
    }
    return BuildValue(new WwwAuthenticateChallenge(
      Error: AuthorizationConstants.InsufficientScopeError,
      Scope: scope,
      ResourceMetadata: resourceMetadata,
      ErrorDescription: errorDescription));
  }

  // `key=value` where value is either a quoted string (with `\"`/`\\` escapes) or a bare token.
  private static readonly Regex ParamRegex = new(
    "([A-Za-z0-9._-]+)\\s*=\\s*(?:\"((?:[^\"\\\\]|\\\\.)*)\"|([^\\s,]+))",
    RegexOptions.Compiled | RegexOptions.CultureInvariant);

  private static readonly Regex SchemeRegex = new(
    "^(\\S+)\\s*(.*)$",
    RegexOptions.Compiled | RegexOptions.Singleline | RegexOptions.CultureInvariant);

  /// <summary>
  /// Parses a <c>WWW-Authenticate</c> header value carrying a <c>Bearer</c> challenge into its
  /// structured fields (R-23.1-z). A client MUST be able to parse <c>WWW-Authenticate</c> headers and
  /// react to a <c>401</c>; this is that parser.
  /// </summary>
  /// <remarks>
  /// Accepts the auth-param forms RFC 7235 permits — quoted (<c>key="value"</c>) and bare
  /// (<c>key=value</c>) — comma-separated, with arbitrary surrounding whitespace, unescaping
  /// <c>\"</c>/<c>\\</c> inside quoted values. The scheme match is case-insensitive. Returns
  /// <c>null</c> when the value does not use the <c>Bearer</c> scheme.
  /// </remarks>
  /// <param name="headerValue">The raw <c>WWW-Authenticate</c> header value.</param>
  /// <returns>The parsed challenge, or <c>null</c> when not a Bearer challenge.</returns>
  public static WwwAuthenticateChallenge? Parse(string headerValue)
  {
    var schemeMatch = SchemeRegex.Match(headerValue.Trim());
    if (!schemeMatch.Success ||
        !string.Equals(schemeMatch.Groups[1].Value, AuthorizationConstants.BearerScheme, StringComparison.OrdinalIgnoreCase))
    {
      return null;
    }

    var paramsPart = schemeMatch.Groups[2].Value;
    string? resourceMetadata = null, scope = null, error = null, errorDescription = null;
    foreach (Match m in ParamRegex.Matches(paramsPart))
    {
      var key = m.Groups[1].Value.ToLowerInvariant();
      var raw = m.Groups[2].Success
        ? QuotedEscapeRegex().Replace(m.Groups[2].Value, "$1")
        : m.Groups[3].Value;
      switch (key)
      {
        case "resource_metadata":
          resourceMetadata = raw;
          break;
        case "scope":
          scope = raw;
          break;
        case "error":
          error = raw;
          break;
        case "error_description":
          errorDescription = raw;
          break;
      }
    }
    return new WwwAuthenticateChallenge(resourceMetadata, scope, error, errorDescription);
  }

  /// <summary>
  /// Extracts the parsed <c>Bearer</c> challenge from a case-insensitive header lookup, or <c>null</c>
  /// when there is no parseable <c>WWW-Authenticate</c> <c>Bearer</c> challenge (R-23.1-z).
  /// </summary>
  /// <param name="lookupHeader">A case-insensitive header accessor (returns the raw value, or <c>null</c>).</param>
  /// <returns>The parsed challenge, or <c>null</c>.</returns>
  public static WwwAuthenticateChallenge? FromHeaders(Func<string, string?> lookupHeader)
  {
    var value = lookupHeader(AuthorizationConstants.WwwAuthenticateHeader);
    return value is null ? null : Parse(value);
  }

  /// <summary>
  /// Resolves the scopes a client MUST treat as required for the request from a challenge (R-23.1-x,
  /// R-23.1-y). The challenged scope set is authoritative; this derives the required scopes SOLELY from
  /// the challenge's <c>scope</c>, never from <c>scopes_supported</c>. Returns an empty list when the
  /// challenge carried no <c>scope</c>.
  /// </summary>
  /// <param name="challenge">A parsed <c>WWW-Authenticate</c> challenge.</param>
  /// <returns>The challenged scopes, possibly empty.</returns>
  public static IReadOnlyList<string> ChallengedScopes(WwwAuthenticateChallenge challenge)
  {
    if (challenge.Scope is null)
    {
      return [];
    }
    return challenge.Scope.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
  }

  /// <summary>Returns <c>true</c> when <paramref name="challenge"/> is an insufficient-scope (<c>403</c>) challenge (R-23.1-ab).</summary>
  /// <param name="challenge">The parsed challenge.</param>
  /// <returns><c>true</c> when its <c>error</c> is <c>insufficient_scope</c>.</returns>
  public static bool IsInsufficientScopeChallenge(WwwAuthenticateChallenge challenge) =>
    string.Equals(challenge.Error, AuthorizationConstants.InsufficientScopeError, StringComparison.Ordinal);
}

// ─── Protected Resource Metadata (§23.2, R-23.2-a – R-23.2-j) ───────────────────

/// <summary>
/// The OAuth 2.0 Protected Resource Metadata document the MCP server publishes (spec §23.2, RFC 9728).
/// </summary>
/// <remarks>
/// <see cref="Resource"/> is REQUIRED and MUST equal the server's canonical resource identifier
/// (R-23.2-h). <see cref="AuthorizationServers"/> is REQUIRED for MCP, MUST be present, and MUST
/// contain at least one entry (R-23.2-i). <see cref="ScopesSupported"/> and
/// <see cref="BearerMethodsSupported"/> are OPTIONAL. Additional RFC 9728 fields are preserved on
/// round-trip via <see cref="Extra"/>.
/// </remarks>
public sealed record ProtectedResourceMetadata
{
  /// <summary>REQUIRED canonical resource identifier; MUST equal the server's (R-23.2-h).</summary>
  [JsonPropertyName("resource")]
  public required string Resource { get; init; }

  /// <summary>REQUIRED non-empty list of trusted authorization-server issuer URLs (R-23.2-i).</summary>
  [JsonPropertyName("authorization_servers")]
  public required IReadOnlyList<string> AuthorizationServers { get; init; }

  /// <summary>OPTIONAL scopes the resource recognizes.</summary>
  [JsonPropertyName("scopes_supported")]
  public IReadOnlyList<string>? ScopesSupported { get; init; }

  /// <summary>OPTIONAL token-presentation methods; for MCP, the bearer header method.</summary>
  [JsonPropertyName("bearer_methods_supported")]
  public IReadOnlyList<string>? BearerMethodsSupported { get; init; }

  /// <summary>Additional RFC 9728 fields preserved verbatim (the <c>passthrough</c> equivalent).</summary>
  [JsonExtensionData]
  public IDictionary<string, JsonNode?>? Extra { get; init; }

  /// <summary>
  /// Parses and structurally validates a fetched protected-resource metadata document: <c>resource</c>
  /// present and non-empty <c>authorization_servers</c> (R-23.2-h, R-23.2-i). Returns <c>null</c> on a
  /// structurally invalid document.
  /// </summary>
  /// <param name="value">The raw fetched document, or <c>null</c>.</param>
  /// <returns>The parsed metadata, or <c>null</c> when invalid.</returns>
  public static ProtectedResourceMetadata? Parse(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return null;
    }
    var resource = (obj["resource"] as JsonValue)?.GetValue<string>();
    if (string.IsNullOrEmpty(resource))
    {
      return null;
    }
    if (obj["authorization_servers"] is not JsonArray servers || servers.Count == 0)
    {
      return null;
    }
    var serverList = new List<string>(servers.Count);
    foreach (var node in servers)
    {
      if ((node as JsonValue)?.GetValue<string>() is not { } s)
      {
        return null;
      }
      serverList.Add(s);
    }
    return new ProtectedResourceMetadata
    {
      Resource = resource,
      AuthorizationServers = serverList,
      ScopesSupported = AuthorizationJson.StringArray(obj["scopes_supported"]),
      BearerMethodsSupported = AuthorizationJson.StringArray(obj["bearer_methods_supported"]),
    };
  }

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a structurally valid protected-resource metadata document (R-23.2-h, R-23.2-i).</summary>
  /// <param name="value">The candidate document.</param>
  /// <returns><c>true</c> when valid.</returns>
  public static bool IsValid(JsonNode? value) => Parse(value) is not null;

  /// <summary>
  /// Validates a fetched protected-resource metadata document against the MCP server it is contacting
  /// (spec §23.2, R-23.2-h, R-23.2-i, R-23.2-j): structurally valid, and <c>resource</c> equals the
  /// server's canonical resource identifier (accepting uppercase scheme/host per R-23.1-p). On success
  /// <paramref name="metadata"/> is populated.
  /// </summary>
  /// <param name="value">The raw fetched document.</param>
  /// <param name="expectedCanonicalResource">The canonical resource identifier of the MCP server being contacted.</param>
  /// <param name="metadata">On success, the validated metadata; otherwise <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult Validate(
    JsonNode? value,
    string expectedCanonicalResource,
    out ProtectedResourceMetadata? metadata)
  {
    metadata = Parse(value);
    if (metadata is null)
    {
      return AuthorizationResult.Fail("invalid ProtectedResourceMetadata: missing resource or non-empty authorization_servers (R-23.2-h, R-23.2-i)");
    }
    if (!CanonicalResourceIdentifier.Equal(metadata.Resource, expectedCanonicalResource))
    {
      var bad = metadata;
      metadata = null;
      return AuthorizationResult.Fail(
        $"resource \"{bad.Resource}\" does not match the MCP server's canonical resource identifier \"{expectedCanonicalResource}\" (R-23.2-h, R-23.2-j)");
    }
    return AuthorizationResult.Success;
  }

  /// <summary>
  /// Selects one authorization-server <c>issuer</c> from this document (R-23.2-j). By default the first
  /// listed issuer is chosen; an optional <paramref name="prefer"/> predicate lets a caller impose its
  /// own selection policy (the first issuer for which <paramref name="prefer"/> returns <c>true</c>
  /// wins, falling back to the first listed). Returns <c>null</c> only for an empty list (which a valid
  /// document never has).
  /// </summary>
  /// <param name="prefer">OPTIONAL predicate selecting a preferred issuer.</param>
  /// <returns>The selected issuer, or <c>null</c> when none is listed.</returns>
  public string? SelectAuthorizationServer(Func<string, bool>? prefer = null)
  {
    if (AuthorizationServers.Count == 0)
    {
      return null;
    }
    if (prefer is not null)
    {
      foreach (var issuer in AuthorizationServers)
      {
        if (prefer(issuer))
        {
          return issuer;
        }
      }
    }
    return AuthorizationServers[0];
  }
}

// ─── Authorization Server Metadata (§23.3, R-23.3-a – R-23.3-j) ─────────────────

/// <summary>
/// The metadata document an authorization server publishes (spec §23.3, RFC 8414 / OIDC Discovery).
/// </summary>
/// <remarks>
/// <see cref="Issuer"/>, <see cref="AuthorizationEndpoint"/>, and <see cref="TokenEndpoint"/> are
/// REQUIRED (R-23.3-f – R-23.3-h). When present, <see cref="ResponseTypesSupported"/> MUST include
/// <c>code</c> (R-23.3-i) and <see cref="CodeChallengeMethodsSupported"/> (OPTIONAL but RECOMMENDED)
/// MUST include <c>S256</c> (R-23.3-j) — both enforced by <see cref="Parse"/>. The issuer-match check
/// (R-23.3-d, R-23.3-e) is applied at validation time (it depends on the fetch URL).
/// </remarks>
public sealed record AuthorizationServerMetadata
{
  /// <summary>REQUIRED issuer identifier URL; MUST match the construction value (R-23.3-f).</summary>
  [JsonPropertyName("issuer")]
  public required string Issuer { get; init; }

  /// <summary>REQUIRED authorization endpoint URL (R-23.3-g).</summary>
  [JsonPropertyName("authorization_endpoint")]
  public required string AuthorizationEndpoint { get; init; }

  /// <summary>REQUIRED token endpoint URL (R-23.3-h).</summary>
  [JsonPropertyName("token_endpoint")]
  public required string TokenEndpoint { get; init; }

  /// <summary>OPTIONAL Dynamic Client Registration endpoint URL.</summary>
  [JsonPropertyName("registration_endpoint")]
  public string? RegistrationEndpoint { get; init; }

  /// <summary>OPTIONAL scopes the authorization server recognizes.</summary>
  [JsonPropertyName("scopes_supported")]
  public IReadOnlyList<string>? ScopesSupported { get; init; }

  /// <summary>OPTIONAL <c>response_type</c> values; if present MUST include <c>code</c> (R-23.3-i).</summary>
  [JsonPropertyName("response_types_supported")]
  public IReadOnlyList<string>? ResponseTypesSupported { get; init; }

  /// <summary>OPTIONAL <c>grant_type</c> values supported.</summary>
  [JsonPropertyName("grant_types_supported")]
  public IReadOnlyList<string>? GrantTypesSupported { get; init; }

  /// <summary>OPTIONAL but RECOMMENDED PKCE methods; if present MUST include <c>S256</c> (R-23.3-j).</summary>
  [JsonPropertyName("code_challenge_methods_supported")]
  public IReadOnlyList<string>? CodeChallengeMethodsSupported { get; init; }

  /// <summary>OPTIONAL token-endpoint client-authentication methods.</summary>
  [JsonPropertyName("token_endpoint_auth_methods_supported")]
  public IReadOnlyList<string>? TokenEndpointAuthMethodsSupported { get; init; }

  /// <summary>OPTIONAL <c>true</c> when the AS sets the <c>iss</c> parameter in responses.</summary>
  [JsonPropertyName("authorization_response_iss_parameter_supported")]
  public bool? AuthorizationResponseIssParameterSupported { get; init; }

  /// <summary>OPTIONAL <c>true</c> when the AS accepts Client ID Metadata Documents.</summary>
  [JsonPropertyName("client_id_metadata_document_supported")]
  public bool? ClientIdMetadataDocumentSupported { get; init; }

  /// <summary>
  /// Parses and structurally validates a fetched authorization-server metadata document: the REQUIRED
  /// fields, the <c>response_types_supported</c> ⊇ <c>code</c> constraint (R-23.3-i), and the
  /// <c>code_challenge_methods_supported</c> ⊇ <c>S256</c> constraint (R-23.3-j). Returns <c>null</c> on
  /// a structurally invalid document. The issuer-match check is applied separately by
  /// <see cref="Validate"/>.
  /// </summary>
  /// <param name="value">The raw fetched document, or <c>null</c>.</param>
  /// <returns>The parsed metadata, or <c>null</c> when invalid.</returns>
  public static AuthorizationServerMetadata? Parse(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return null;
    }
    var issuer = (obj["issuer"] as JsonValue)?.GetValue<string>();
    var authorizationEndpoint = (obj["authorization_endpoint"] as JsonValue)?.GetValue<string>();
    var tokenEndpoint = (obj["token_endpoint"] as JsonValue)?.GetValue<string>();
    if (string.IsNullOrEmpty(issuer) || string.IsNullOrEmpty(authorizationEndpoint) || string.IsNullOrEmpty(tokenEndpoint))
    {
      return null;
    }

    var responseTypes = AuthorizationJson.StringArray(obj["response_types_supported"]);
    if (responseTypes is not null && !responseTypes.Contains("code"))
    {
      return null; // R-23.3-i
    }
    var codeChallengeMethods = AuthorizationJson.StringArray(obj["code_challenge_methods_supported"]);
    if (codeChallengeMethods is not null && !codeChallengeMethods.Contains("S256"))
    {
      return null; // R-23.3-j
    }

    return new AuthorizationServerMetadata
    {
      Issuer = issuer,
      AuthorizationEndpoint = authorizationEndpoint,
      TokenEndpoint = tokenEndpoint,
      RegistrationEndpoint = (obj["registration_endpoint"] as JsonValue)?.GetValue<string>(),
      ScopesSupported = AuthorizationJson.StringArray(obj["scopes_supported"]),
      ResponseTypesSupported = responseTypes,
      GrantTypesSupported = AuthorizationJson.StringArray(obj["grant_types_supported"]),
      CodeChallengeMethodsSupported = codeChallengeMethods,
      TokenEndpointAuthMethodsSupported = AuthorizationJson.StringArray(obj["token_endpoint_auth_methods_supported"]),
      AuthorizationResponseIssParameterSupported = (obj["authorization_response_iss_parameter_supported"] as JsonValue)?.GetValue<bool>(),
      ClientIdMetadataDocumentSupported = (obj["client_id_metadata_document_supported"] as JsonValue)?.GetValue<bool>(),
    };
  }

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a structurally valid authorization-server metadata document (R-23.3-f – R-23.3-j).</summary>
  /// <param name="value">The candidate document.</param>
  /// <returns><c>true</c> when valid.</returns>
  public static bool IsValid(JsonNode? value) => Parse(value) is not null;

  /// <summary>
  /// Validates a fetched authorization-server metadata document, including the mandatory issuer-match
  /// check (spec §23.3, R-23.3-d, R-23.3-e, R-23.3-f – R-23.3-j). After confirming structural validity,
  /// it verifies that the document's <c>issuer</c> is IDENTICAL to the issuer used to construct the
  /// discovery URL (exact string match; R-23.3-d). If they differ, the document MUST NOT be used
  /// (R-23.3-e) and validation fails. On success <paramref name="metadata"/> is populated.
  /// </summary>
  /// <param name="value">The raw fetched document.</param>
  /// <param name="expectedIssuer">The issuer identifier used to construct the discovery URL (R-23.3-d).</param>
  /// <param name="metadata">On success, the validated metadata; otherwise <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult Validate(
    JsonNode? value,
    string expectedIssuer,
    out AuthorizationServerMetadata? metadata)
  {
    metadata = Parse(value);
    if (metadata is null)
    {
      return AuthorizationResult.Fail("invalid AuthorizationServerMetadata: missing required field or unsupported response_types/code_challenge_methods (R-23.3-f – R-23.3-j)");
    }
    if (!string.Equals(metadata.Issuer, expectedIssuer, StringComparison.Ordinal))
    {
      var bad = metadata;
      metadata = null;
      return AuthorizationResult.Fail(
        $"issuer \"{bad.Issuer}\" does not match the issuer used to construct the discovery URL \"{expectedIssuer}\"; MUST NOT use the document (R-23.3-d, R-23.3-e)");
    }
    return AuthorizationResult.Success;
  }
}

// ─── Well-known discovery URI ordering (§23.2 / §23.3) ──────────────────────────

/// <summary>
/// The well-known <c>.well-known</c> URI construction orders for protected-resource and
/// authorization-server metadata discovery (spec §23.2 R-23.2-c – R-23.2-g; §23.3 R-23.3-b, R-23.3-c).
/// </summary>
public static class WellKnownDiscovery
{
  /// <summary>The protected-resource metadata well-known path suffix (§23.2).</summary>
  public const string ProtectedResourceWellKnown = "/.well-known/oauth-protected-resource";

  /// <summary>OAuth 2.0 Authorization Server Metadata well-known suffix (§23.3).</summary>
  public const string OAuthAsWellKnown = "/.well-known/oauth-authorization-server";

  /// <summary>OpenID Connect Discovery well-known suffix (§23.3).</summary>
  public const string OpenIdConfigurationWellKnown = "/.well-known/openid-configuration";

  private static string TrimPath(string path) => path.Trim('/');

  /// <summary>
  /// Builds the ordered list of protected-resource-metadata well-known URIs to try for an MCP server
  /// endpoint, when no <c>resource_metadata</c> header URI is available (R-23.2-e, R-23.2-f): (1)
  /// path-aware insertion <c>/.well-known/oauth-protected-resource/&lt;path&gt;</c>; then (2) the host
  /// root. When the endpoint has no path beyond <c>/</c>, only the root URI is returned.
  /// </summary>
  /// <param name="endpointUrl">The MCP server's endpoint URL.</param>
  /// <returns>The ordered well-known URIs.</returns>
  /// <exception cref="ArgumentException">When <paramref name="endpointUrl"/> is not an absolute URI.</exception>
  public static IReadOnlyList<string> ProtectedResourceUris(string endpointUrl)
  {
    if (!Uri.TryCreate(endpointUrl, UriKind.Absolute, out var url))
    {
      throw new ArgumentException("endpoint URL MUST be an absolute URI", nameof(endpointUrl));
    }
    var origin = OriginOf(url);
    var path = TrimPath(url.AbsolutePath);
    var root = $"{origin}{ProtectedResourceWellKnown}";
    if (path.Length == 0)
    {
      return [root];
    }
    return [$"{origin}{ProtectedResourceWellKnown}/{path}", root];
  }

  /// <summary>
  /// Resolves where to fetch protected-resource metadata from, honoring discovery precedence (R-23.2-c,
  /// R-23.2-d, R-23.2-e, R-23.2-g): the <c>resource_metadata</c> header URI takes precedence (returned
  /// as the single entry); otherwise the ordered well-known URIs are returned. When neither is available
  /// the result is empty — the caller MUST then abort or fall back to pre-configured values (R-23.2-g).
  /// </summary>
  /// <param name="headerResourceMetadata">The <c>resource_metadata</c> URI from a <c>WWW-Authenticate</c> header, if any.</param>
  /// <param name="endpointUrl">The MCP server endpoint, used to build the well-known URIs when no header URI is present.</param>
  /// <returns>The ordered candidate URIs (possibly empty).</returns>
  public static IReadOnlyList<string> ResolveProtectedResourceUris(string? headerResourceMetadata, string? endpointUrl)
  {
    if (!string.IsNullOrEmpty(headerResourceMetadata))
    {
      return [headerResourceMetadata];
    }
    if (string.IsNullOrEmpty(endpointUrl) || !Uri.IsWellFormedUriString(endpointUrl, UriKind.Absolute))
    {
      return [];
    }
    try
    {
      return ProtectedResourceUris(endpointUrl);
    }
    catch (ArgumentException)
    {
      return [];
    }
  }

  /// <summary>
  /// Builds the ordered list of authorization-server metadata well-known URIs to try for an
  /// <paramref name="issuer"/>, in the exact specified priority order (R-23.3-b, R-23.3-c).
  /// </summary>
  /// <remarks>
  /// For an issuer WITH a path (e.g. <c>https://auth.example.com/tenant1</c>): (1) OAuth AS Metadata,
  /// path insertion <c>/.well-known/oauth-authorization-server/tenant1</c>; (2) OIDC Discovery, path
  /// insertion <c>/.well-known/openid-configuration/tenant1</c>; (3) OIDC Discovery, path appending
  /// <c>/tenant1/.well-known/openid-configuration</c>. For an issuer WITHOUT a path: (1)
  /// <c>/.well-known/oauth-authorization-server</c>; (2) <c>/.well-known/openid-configuration</c>.
  /// </remarks>
  /// <param name="issuer">The authorization server's issuer identifier URL.</param>
  /// <returns>The ordered well-known URIs.</returns>
  /// <exception cref="ArgumentException">When <paramref name="issuer"/> is not an absolute URI.</exception>
  public static IReadOnlyList<string> AuthorizationServerUris(string issuer)
  {
    if (!Uri.TryCreate(issuer, UriKind.Absolute, out var url))
    {
      throw new ArgumentException("issuer MUST be an absolute URI", nameof(issuer));
    }
    var origin = OriginOf(url);
    var path = TrimPath(url.AbsolutePath);
    if (path.Length == 0)
    {
      return [$"{origin}{OAuthAsWellKnown}", $"{origin}{OpenIdConfigurationWellKnown}"];
    }
    return
    [
      $"{origin}{OAuthAsWellKnown}/{path}",
      $"{origin}{OpenIdConfigurationWellKnown}/{path}",
      $"{origin}/{path}{OpenIdConfigurationWellKnown}",
    ];
  }

  /// <summary>Returns the scheme://authority origin of <paramref name="url"/> (no default port).</summary>
  private static string OriginOf(Uri url)
  {
    var host = url.Host;
    var authority = url.IsDefaultPort ? host : $"{host}:{url.Port}";
    return $"{url.Scheme}://{authority}";
  }
}

// ─── Internal JSON helpers ──────────────────────────────────────────────────────

/// <summary>Internal helpers for reading authorization metadata out of <see cref="JsonNode"/> trees.</summary>
internal static class AuthorizationJson
{
  /// <summary>
  /// Reads <paramref name="node"/> as a string array, or <c>null</c> when it is absent or not an array
  /// of strings. A non-string element makes the whole array <c>null</c> (a malformed field is treated
  /// as absent).
  /// </summary>
  internal static IReadOnlyList<string>? StringArray(JsonNode? node)
  {
    if (node is not JsonArray array)
    {
      return null;
    }
    var list = new List<string>(array.Count);
    foreach (var item in array)
    {
      if ((item as JsonValue)?.GetValue<string>() is not { } s)
      {
        return null;
      }
      list.Add(s);
    }
    return list;
  }
}
