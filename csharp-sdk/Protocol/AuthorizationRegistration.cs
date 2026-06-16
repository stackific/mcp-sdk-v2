namespace Stackific.Mcp.Protocol;

// ─── §23.11 Obtaining a client_id & selecting a mechanism (R-23.11-a – R-23.11-e) ─

/// <summary>
/// The result of <see cref="RegistrationMechanism.Select"/>: the chosen mechanism and why it applied
/// (spec §23.11).
/// </summary>
/// <param name="Mechanism">The selected mechanism, or <see cref="ClientIdMechanism.Prompt"/> when none applies (R-23.11-b).</param>
/// <param name="Reason">A human-readable explanation of why this mechanism was selected.</param>
public sealed record RegistrationMechanismSelection(ClientIdMechanism Mechanism, string Reason);

/// <summary>
/// Metadata-driven <c>client_id</c> mechanism selection: choosing the first applicable mechanism after
/// inspecting the validated authorization-server metadata, gating CIMD on
/// <c>client_id_metadata_document_supported</c> and DCR on <c>registration_endpoint</c>
/// (spec §23.11, R-23.11-a – R-23.11-e).
/// </summary>
/// <remarks>
/// This complements S36's <see cref="ClientIdAcquisition.Select"/>, which ranks a static capability set;
/// here the live metadata flags and the pre-registration credential state are the deciding inputs.
/// </remarks>
public static class RegistrationMechanism
{
  /// <summary>
  /// The authorization-server-metadata flag that gates the CIMD mechanism. When <c>true</c>, the AS
  /// supports Client ID Metadata Documents (R-23.11-d).
  /// </summary>
  public const string ClientIdMetadataDocumentSupportedField = "client_id_metadata_document_supported";

  /// <summary>
  /// Selects the <c>client_id</c> mechanism from the validated authorization-server metadata and the
  /// client's credential state, applying the §23.11 priority order and the metadata gates (R-23.11-a –
  /// R-23.11-e).
  /// </summary>
  /// <remarks>
  /// The order, using the first that applies: (1) pre-registration when credentials are already held;
  /// (2) CIMD only when the metadata sets <c>client_id_metadata_document_supported: true</c> (R-23.11-d)
  /// AND the client supports it; (3) DCR only when the metadata advertises a <c>registration_endpoint</c>
  /// (R-23.11-e) AND the client supports it; (4) otherwise prompt the user. The metadata is inspected
  /// before deciding (R-23.11-c), and CIMD/DCR are never returned when their gate is closed.
  /// </remarks>
  /// <param name="metadata">The validated authorization-server metadata (its CIMD flag and <c>registration_endpoint</c> gate the mechanisms).</param>
  /// <param name="hasPreRegisteredCredentials"><c>true</c> when the client already holds pre-registered credentials for this AS (R-23.11-b).</param>
  /// <param name="supportedMechanisms">The mechanisms this client is capable of; defaults to pre-registration, CIMD, and DCR (the prompt is always the final fallback).</param>
  /// <returns>The selected mechanism and the reason it applied.</returns>
  public static RegistrationMechanismSelection Select(
    AuthorizationServerMetadata metadata,
    bool hasPreRegisteredCredentials = false,
    IEnumerable<ClientIdMechanism>? supportedMechanisms = null)
  {
    var supported = new HashSet<ClientIdMechanism>(
      supportedMechanisms ?? [ClientIdMechanism.PreRegistration, ClientIdMechanism.Cimd, ClientIdMechanism.Dcr]);

    if (hasPreRegisteredCredentials && supported.Contains(ClientIdMechanism.PreRegistration))
    {
      return new RegistrationMechanismSelection(
        ClientIdMechanism.PreRegistration,
        "pre-registered client information is already held for this authorization server (R-23.11-b)");
    }
    if (metadata.ClientIdMetadataDocumentSupported == true && supported.Contains(ClientIdMechanism.Cimd))
    {
      return new RegistrationMechanismSelection(
        ClientIdMechanism.Cimd,
        "authorization-server metadata sets client_id_metadata_document_supported: true (R-23.11-b, R-23.11-d)");
    }
    if (!string.IsNullOrEmpty(metadata.RegistrationEndpoint) && supported.Contains(ClientIdMechanism.Dcr))
    {
      return new RegistrationMechanismSelection(
        ClientIdMechanism.Dcr,
        "authorization-server metadata advertises a registration_endpoint (R-23.11-b, R-23.11-e)");
    }
    return new RegistrationMechanismSelection(
      ClientIdMechanism.Prompt,
      "no automated mechanism applies; prompt the user for client information (R-23.11-b)");
  }

  /// <summary>
  /// Returns <c>true</c> when a client MAY attempt CIMD against this authorization server — i.e. the
  /// metadata sets <c>client_id_metadata_document_supported: true</c>. A client MUST NOT attempt CIMD
  /// otherwise (R-23.11-d).
  /// </summary>
  /// <param name="metadata">The validated authorization-server metadata.</param>
  /// <returns><c>true</c> when CIMD may be attempted.</returns>
  public static bool MayAttemptCimd(AuthorizationServerMetadata metadata) =>
    metadata.ClientIdMetadataDocumentSupported == true;

  /// <summary>
  /// Returns <c>true</c> when a client MAY attempt Dynamic Client Registration against this authorization
  /// server — i.e. the metadata advertises a <c>registration_endpoint</c>. A client MUST NOT attempt DCR
  /// otherwise (R-23.11-e).
  /// </summary>
  /// <param name="metadata">The validated authorization-server metadata.</param>
  /// <returns><c>true</c> when DCR may be attempted.</returns>
  public static bool MayAttemptDcr(AuthorizationServerMetadata metadata) =>
    !string.IsNullOrEmpty(metadata.RegistrationEndpoint);
}

// ─── §23.12 Client ID Metadata Documents — client & AS side (R-23.12-a – R-23.12-l)

/// <summary>The HTTP caching directives an authorization server honours when caching a fetched CIMD document (spec §23.12, R-23.12-k).</summary>
/// <param name="MaxAgeSeconds"><c>max-age</c> in seconds from <c>Cache-Control</c>, if any.</param>
/// <param name="NoStore"><c>true</c> when <c>Cache-Control: no-store</c> (or <c>no-cache</c>) forbids caching.</param>
public sealed record CimdCacheControl(int? MaxAgeSeconds = null, bool NoStore = false);

/// <summary>
/// An authorization-server-side cache for fetched CIMD documents that respects HTTP cache headers and
/// applies a host-domain trust policy (spec §23.12, R-23.12-k, R-23.12-l).
/// </summary>
/// <remarks>
/// The AS SHOULD cache documents (R-23.12-k) and SHOULD apply CIMD security considerations such as a
/// trust policy over allowed client-hosting domains (R-23.12-l). An optional <c>trustHost</c> predicate
/// rejects documents on disallowed domains before they are stored, and a <c>no-store</c>/<c>no-cache</c>
/// directive (or a non-positive <c>max-age</c>) keeps a document out of the cache.
/// </remarks>
public sealed class CimdDocumentCache
{
  private readonly Dictionary<string, (ClientIdMetadataDocument Document, long? ExpiresAtMs)> _byUrl = new(StringComparer.Ordinal);
  private readonly Func<string, bool> _trustHost;
  private readonly Func<long> _now;

  /// <summary>
  /// Creates the cache.
  /// </summary>
  /// <param name="trustHost">OPTIONAL host-domain trust policy; a document whose <c>client_id</c> host fails this predicate is never cached or returned (R-23.12-l). Defaults to trusting all hosts.</param>
  /// <param name="now">OPTIONAL clock (epoch ms) for testing; defaults to <see cref="DateTimeOffset.UtcNow"/>.</param>
  public CimdDocumentCache(Func<string, bool>? trustHost = null, Func<long>? now = null)
  {
    _trustHost = trustHost ?? (_ => true);
    _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
  }

  /// <summary>Returns <c>true</c> when the host of <paramref name="clientIdUrl"/> is permitted by the trust policy (R-23.12-l).</summary>
  /// <param name="clientIdUrl">The CIMD <c>client_id</c> URL.</param>
  /// <returns><c>true</c> when the host is trusted.</returns>
  public bool IsHostTrusted(string clientIdUrl)
  {
    if (!Uri.TryCreate(clientIdUrl, UriKind.Absolute, out var url))
    {
      return false;
    }
    return _trustHost(url.Authority);
  }

  /// <summary>
  /// Caches a fetched CIMD document keyed by its <c>client_id</c> URL, honouring HTTP cache directives and
  /// the trust policy (R-23.12-k, R-23.12-l). Returns <c>true</c> when the document was stored,
  /// <c>false</c> when caching was declined (untrusted host, <c>no-store</c>, or a non-positive
  /// <c>max-age</c>).
  /// </summary>
  /// <param name="clientIdUrl">The <c>client_id</c> URL the document was fetched from.</param>
  /// <param name="document">The fetched document.</param>
  /// <param name="cacheControl">The response's HTTP cache directives, if any.</param>
  /// <returns><c>true</c> when stored.</returns>
  public bool Store(string clientIdUrl, ClientIdMetadataDocument document, CimdCacheControl? cacheControl = null)
  {
    cacheControl ??= new CimdCacheControl();
    if (!IsHostTrusted(clientIdUrl) || cacheControl.NoStore || (cacheControl.MaxAgeSeconds is <= 0))
    {
      return false;
    }
    var expiresAtMs = cacheControl.MaxAgeSeconds is { } maxAge ? _now() + (maxAge * 1000L) : (long?)null;
    _byUrl[clientIdUrl] = (document, expiresAtMs);
    return true;
  }

  /// <summary>
  /// Returns the cached document for <paramref name="clientIdUrl"/> when present, trusted, and still
  /// fresh; otherwise <c>null</c>. A stale entry is evicted on access (R-23.12-k).
  /// </summary>
  /// <param name="clientIdUrl">The <c>client_id</c> URL.</param>
  /// <returns>The cached document, or <c>null</c>.</returns>
  public ClientIdMetadataDocument? Get(string clientIdUrl)
  {
    if (!_byUrl.TryGetValue(clientIdUrl, out var entry) || !IsHostTrusted(clientIdUrl))
    {
      return null;
    }
    if (entry.ExpiresAtMs is { } expiry && _now() >= expiry)
    {
      _byUrl.Remove(clientIdUrl);
      return null;
    }
    return entry.Document;
  }
}

/// <summary>
/// Client ID Metadata Document client/AS-side hosting predicates: the <c>https</c>-with-path
/// <c>client_id</c> URL rule, the preference path, and <c>private_key_jwt</c> support
/// (spec §23.12, R-23.12-a – R-23.12-f).
/// </summary>
public static class CimdHosting
{
  /// <summary>The <c>private_key_jwt</c> token-endpoint authentication method a CIMD client MAY use (R-23.12-f).</summary>
  public const string PrivateKeyJwtAuthMethod = "private_key_jwt";

  /// <summary>
  /// Returns <c>true</c> when both a client and an authorization server should prefer CIMD as the
  /// registration path — both SHOULD support the mechanism (R-23.12-a).
  /// </summary>
  /// <param name="clientSupportsCimd">Whether the client implements CIMD.</param>
  /// <param name="serverSupportsCimd">Whether the AS advertises <c>client_id_metadata_document_supported: true</c>.</param>
  /// <returns><c>true</c> when CIMD is the preferred path.</returns>
  public static bool IsPreferredPath(bool clientSupportsCimd, bool serverSupportsCimd) =>
    clientSupportsCimd && serverSupportsCimd;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="clientIdUrl"/> satisfies the CIMD client-side hosting rules:
  /// hosted at an <c>https</c> URL with a path component (R-23.12-b, R-23.12-c). Delegates to S36's
  /// <see cref="Cimd.IsValidClientIdUrl"/>; surfaced here under the §23.12 atom.
  /// </summary>
  /// <param name="clientIdUrl">The CIMD <c>client_id</c> URL.</param>
  /// <returns><c>true</c> when the hosting is valid.</returns>
  public static bool IsHostingValid(string clientIdUrl) => Cimd.IsValidClientIdUrl(clientIdUrl);

  /// <summary>
  /// Returns <c>true</c> when a CIMD client MAY authenticate to the token endpoint with
  /// <c>private_key_jwt</c>: the document declares that method and conveys an appropriate
  /// <c>jwks</c>/<c>jwks_uri</c> (R-23.12-f).
  /// </summary>
  /// <param name="document">The client's CIMD document.</param>
  /// <returns><c>true</c> when <c>private_key_jwt</c> is supported.</returns>
  public static bool SupportsPrivateKeyJwt(ClientIdMetadataDocument document)
  {
    if (!string.Equals(document.TokenEndpointAuthMethod, PrivateKeyJwtAuthMethod, StringComparison.Ordinal))
    {
      return false;
    }
    return document.Extra is not null &&
      (document.Extra.ContainsKey("jwks") || document.Extra.ContainsKey("jwks_uri"));
  }
}

// ─── §23.15 application_type selection & DCR retry (R-23.15-a – R-23.15-f) ────────

/// <summary>The outcome of <see cref="DcrRetry.RegisterWithRetryAsync"/>: the final result and the attempts made (spec §23.15).</summary>
/// <param name="Result">The final DCR result — success or the last failure.</param>
/// <param name="Attempts">The <see cref="ApplicationType"/> of each attempt, in order, for diagnostics.</param>
public sealed record DcrRetryResult(DynamicClientRegistrationResult Result, IReadOnlyList<ApplicationType> Attempts);

/// <summary>
/// Loopback-aware <c>application_type</c> classification and bounded DCR retry that flips the
/// <c>application_type</c> on a retryable rejection (spec §23.15, R-23.15-a – R-23.15-f).
/// </summary>
public static class DcrRetry
{
  /// <summary>
  /// Classifies a set of redirect URIs as native or web and returns the <c>application_type</c> a client
  /// SHOULD register, consistent with those URIs (R-23.15-a, R-23.15-b, R-23.15-c). Redirect URIs that all
  /// resolve to a loopback host (<c>localhost</c>, <c>127.0.0.0/8</c>, or IPv6 <c>::1</c>, as decided by
  /// <see cref="Uri.IsLoopback"/>) indicate a native application → <see cref="ApplicationType.Native"/>;
  /// otherwise <see cref="ApplicationType.Web"/>.
  /// </summary>
  /// <param name="redirectUris">The client's redirect URIs.</param>
  /// <returns>The <c>application_type</c> consistent with the redirect URIs.</returns>
  public static ApplicationType ApplicationTypeForRedirectUris(IReadOnlyList<string> redirectUris)
  {
    var allLoopback = redirectUris.Count > 0 && redirectUris.All(uri =>
      Uri.TryCreate(uri, UriKind.Absolute, out var url) && url.IsLoopback);
    return ClientIdAcquisition.ApplicationTypeFor(allLoopback);
  }

  /// <summary>
  /// Performs Dynamic Client Registration with bounded retry, surfacing a meaningful error and retrying
  /// with an adjusted <c>application_type</c> when the AS rejects on a redirect-URI / application-type
  /// constraint (R-23.15-d, R-23.15-e, R-23.15-f).
  /// </summary>
  /// <remarks>
  /// Each attempt's response is interpreted by S36's <see cref="Dcr.HandleResponse"/>; on a retryable
  /// failure the <c>application_type</c> is flipped (<see cref="ApplicationType.Native"/> ↔
  /// <see cref="ApplicationType.Web"/>) for the next attempt, up to <paramref name="maxAttempts"/>. This
  /// never throws on an AS rejection — it returns the structured failure for the client to surface
  /// (R-23.15-e).
  /// </remarks>
  /// <param name="initialApplicationType">The <c>application_type</c> for the first attempt.</param>
  /// <param name="attempt">Performs one registration POST for the given <c>application_type</c>, returning the AS's HTTP status and parsed body. Injected so this is transport-agnostic.</param>
  /// <param name="maxAttempts">The maximum number of attempts (initial plus retries); MUST be a few at most. Defaults to <c>2</c> (R-23.15-f).</param>
  /// <returns>The final result and the attempts made.</returns>
  public static async Task<DcrRetryResult> RegisterWithRetryAsync(
    ApplicationType initialApplicationType,
    Func<ApplicationType, Task<(int Status, System.Text.Json.Nodes.JsonNode? Body)>> attempt,
    int maxAttempts = 2)
  {
    var bounded = Math.Max(1, maxAttempts);
    var attempts = new List<ApplicationType>();
    var applicationType = initialApplicationType;
    var last = DynamicClientRegistrationResult.Fail("no registration attempt was made", retryable: false);

    for (var i = 0; i < bounded; i++)
    {
      attempts.Add(applicationType);
      var (status, body) = await attempt(applicationType).ConfigureAwait(false);
      last = Dcr.HandleResponse(status, body);
      if (last.Ok || !last.Retryable)
      {
        return new DcrRetryResult(last, attempts);
      }
      // Retryable rejection: flip the application_type and try again (R-23.15-f).
      applicationType = applicationType == ApplicationType.Native ? ApplicationType.Web : ApplicationType.Native;
    }
    return new DcrRetryResult(last, attempts);
  }
}

// ─── §23.16 Credential binding to the issuer (R-23.16-a – R-23.16-g) ─────────────

/// <summary>The action a client takes for a discovered issuer, per the credential-binding rules (spec §23.16).</summary>
public enum CredentialBindingAction
{
  /// <summary>Reuse the stored credentials.</summary>
  Reuse,

  /// <summary>Re-register with the discovered authorization server.</summary>
  ReRegister,

  /// <summary>Surface an error rather than silently using mismatched credentials.</summary>
  SurfaceError,
}

/// <summary>Persisted client credentials bound to the issuing authorization server (spec §23.16, R-23.16-a).</summary>
/// <param name="Issuer">The issuing authorization server's <c>issuer</c> identifier; the storage key (R-23.16-b).</param>
/// <param name="ClientId">The <c>client_id</c> issued by (or pre-registered with) that authorization server.</param>
/// <param name="ClientSecret">OPTIONAL <c>client_secret</c> for confidential clients.</param>
/// <param name="Cimd"><c>true</c> when these credentials are a CIMD: a portable self-hosted HTTPS-URL <c>client_id</c> with no per-issuer state, hence exempt from re-binding (R-23.16, CIMD exemption).</param>
public sealed record IssuerBoundCredentials(string Issuer, string ClientId, string? ClientSecret = null, bool Cimd = false);

/// <summary>The outcome of <see cref="CredentialBinding.Decide"/>: the action and a human-readable reason (spec §23.16).</summary>
/// <param name="Action">Whether to reuse the stored credentials, re-register, or surface an error.</param>
/// <param name="Reason">A human-readable explanation, suitable for surfacing to a user/developer.</param>
public sealed record CredentialBindingDecision(CredentialBindingAction Action, string Reason);

/// <summary>
/// Issuer-keyed credential binding with the CIMD exemption and surface-error behaviour, by exact string
/// comparison (spec §23.16, R-23.16-a – R-23.16-g).
/// </summary>
public static class CredentialBinding
{
  /// <summary>
  /// Compares two <c>issuer</c> identifiers by EXACT string match — the comparison mandated for credential
  /// binding (R-23.16-f). No scheme/host case folding, default-port elision, trailing-slash, or
  /// percent-encoding normalization is applied.
  /// </summary>
  /// <param name="a">One <c>issuer</c> identifier.</param>
  /// <param name="b">The other <c>issuer</c> identifier.</param>
  /// <returns><c>true</c> when the two are byte-identical.</returns>
  public static bool IssuersMatchExactly(string a, string b) => string.Equals(a, b, StringComparison.Ordinal);

  /// <summary>
  /// Decides whether a client may reuse stored credentials for the protected-resource-indicated
  /// authorization server, must re-register, or should surface an error (R-23.16-c – R-23.16-g, CIMD
  /// exemption). All issuer comparisons are exact (R-23.16-f).
  /// </summary>
  /// <remarks>
  /// CIMD credentials are exempt (portable HTTPS-URL <c>client_id</c>) → reuse regardless of issuer. No
  /// stored credentials, or matching issuers → reuse. On issuer mismatch: DCR-obtained credentials →
  /// re-register (R-23.16-d, R-23.16-e); pre-registered credentials → surface-error (R-23.16-c, R-23.16-g).
  /// </remarks>
  /// <param name="stored">The stored credentials, or <c>null</c> when none.</param>
  /// <param name="discoveredIssuer">The <c>issuer</c> indicated by the target server's validated metadata (R-23.16-d).</param>
  /// <param name="isPreRegistered"><c>true</c> when the stored credentials were supplied out of band rather than obtained via DCR (governs the mismatch action) (R-23.16-g).</param>
  /// <returns>The binding decision.</returns>
  public static CredentialBindingDecision Decide(
    IssuerBoundCredentials? stored,
    string discoveredIssuer,
    bool isPreRegistered = false)
  {
    if (stored is null)
    {
      return new CredentialBindingDecision(
        CredentialBindingAction.ReRegister,
        "no credentials are stored for any issuer; register with the discovered authorization server (R-23.16-e)");
    }
    if (stored.Cimd)
    {
      return new CredentialBindingDecision(
        CredentialBindingAction.Reuse,
        "CIMD credentials are a portable self-hosted HTTPS-URL client_id with no per-issuer state; reuse without re-registration (CIMD exemption)");
    }
    if (IssuersMatchExactly(stored.Issuer, discoveredIssuer))
    {
      return new CredentialBindingDecision(
        CredentialBindingAction.Reuse,
        $"stored issuer \"{stored.Issuer}\" matches the discovered issuer; reuse credentials (R-23.16-a, R-23.16-f)");
    }
    // Issuer mismatch — MUST NOT reuse (R-23.16-c, R-23.16-d).
    if (isPreRegistered)
    {
      return new CredentialBindingDecision(
        CredentialBindingAction.SurfaceError,
        $"pre-registered credentials are bound to \"{stored.Issuer}\" but protected-resource metadata indicates \"{discoveredIssuer}\"; surface an error rather than silently using mismatched credentials (R-23.16-c, R-23.16-d, R-23.16-g)");
    }
    return new CredentialBindingDecision(
      CredentialBindingAction.ReRegister,
      $"credentials are bound to \"{stored.Issuer}\" but the discovered issuer is \"{discoveredIssuer}\"; MUST NOT reuse, re-register with the new authorization server (R-23.16-c, R-23.16-d, R-23.16-e)");
  }
}

/// <summary>
/// An issuer-keyed store for persisted, issuer-bound client credentials, keeping separate registration
/// state per authorization server (spec §23.16, R-23.16-a, R-23.16-b; §23.17, R-23.17-d).
/// </summary>
/// <remarks>
/// The storage key is the authorization server's <c>issuer</c> identifier (R-23.16-b); a lookup never
/// returns another issuer's credentials, so a caller cannot reuse credentials across authorization
/// servers (R-23.16-c). Distinct from S36's <see cref="DynamicClientRegistrationStore"/> (DCR-specific)
/// and S35's <see cref="CredentialStore"/> (runtime tokens): this holds the persisted registration
/// identity for ALL mechanisms, flagged with the CIMD exemption.
/// </remarks>
public sealed class IssuerBoundCredentialStore
{
  private readonly Dictionary<string, IssuerBoundCredentials> _byIssuer = new(StringComparer.Ordinal);

  /// <summary>Persists <paramref name="credentials"/>, keyed by their <c>issuer</c> (R-23.16-a, R-23.16-b).</summary>
  /// <param name="credentials">The credentials to persist.</param>
  /// <exception cref="ArgumentException">When <paramref name="credentials"/>' issuer is empty — the key is REQUIRED.</exception>
  public void Save(IssuerBoundCredentials credentials)
  {
    if (string.IsNullOrEmpty(credentials.Issuer))
    {
      throw new ArgumentException("credential storage key MUST be the authorization server issuer (R-23.16-b)", nameof(credentials));
    }
    _byIssuer[credentials.Issuer] = credentials;
  }

  /// <summary>Returns the credentials stored for <paramref name="issuer"/>, or <c>null</c>. Never another issuer's (R-23.16-b, R-23.16-c).</summary>
  /// <param name="issuer">The authorization-server issuer.</param>
  /// <returns>The stored credentials, or <c>null</c>.</returns>
  public IssuerBoundCredentials? CredentialsFor(string issuer) =>
    _byIssuer.TryGetValue(issuer, out var found) ? found : null;

  /// <summary>Returns <c>true</c> when credentials are stored for <paramref name="issuer"/>.</summary>
  /// <param name="issuer">The authorization-server issuer.</param>
  /// <returns><c>true</c> when stored.</returns>
  public bool Has(string issuer) => _byIssuer.ContainsKey(issuer);

  /// <summary>
  /// Returns the <see cref="CredentialBindingDecision"/> for the credentials stored under
  /// <paramref name="discoveredIssuer"/> — the convenience entry point combining lookup and
  /// <see cref="CredentialBinding.Decide"/> (R-23.16-c – R-23.16-g).
  /// </summary>
  /// <param name="discoveredIssuer">The <c>issuer</c> indicated by the target server's metadata.</param>
  /// <param name="isPreRegistered"><c>true</c> when the stored credentials were pre-registered.</param>
  /// <returns>The binding decision.</returns>
  public CredentialBindingDecision DecideFor(string discoveredIssuer, bool isPreRegistered = false) =>
    CredentialBinding.Decide(CredentialsFor(discoveredIssuer), discoveredIssuer, isPreRegistered);
}

// ─── §23.17 Discovery robustness (R-23.17-a – R-23.17-i) ─────────────────────────

/// <summary>
/// Discovery-robustness wrappers over S35's well-known ordering, plus the <c>authorization_servers</c>
/// requirement and per-AS issuer-identity validation (spec §23.17, R-23.17-a – R-23.17-i).
/// </summary>
public static class DiscoveryRobustness
{
  /// <summary>
  /// Resolves the ordered protected-resource-metadata URIs to try, honouring the <c>WWW-Authenticate</c>
  /// <c>resource_metadata</c> precedence (R-23.17-a, R-23.17-b): the <c>401</c>'s <c>resource_metadata</c>
  /// URL MUST be used when present; otherwise the well-known URIs (path-prefixed first, then host root).
  /// </summary>
  /// <param name="resourceMetadataUrl">The <c>resource_metadata</c> URL from the <c>401</c>'s header, if any.</param>
  /// <param name="mcpEndpointUrl">The MCP endpoint URL, used to build the well-known fallbacks.</param>
  /// <returns>The ordered candidate URIs (possibly empty).</returns>
  public static IReadOnlyList<string> ProtectedResourceMetadataUris(string? resourceMetadataUrl, string? mcpEndpointUrl) =>
    WellKnownDiscovery.ResolveProtectedResourceUris(resourceMetadataUrl, mcpEndpointUrl);

  /// <summary>
  /// Validates that protected-resource metadata carries the REQUIRED <c>authorization_servers</c> array of
  /// one or more issuer identifiers (R-23.17-c). On success <paramref name="authorizationServers"/> is
  /// populated. When more than one is listed, each is independent and the client maintains separate
  /// registration state per AS (R-23.17-d, via <see cref="IssuerBoundCredentialStore"/>).
  /// </summary>
  /// <param name="authorizationServersField">The <c>authorization_servers</c> array from the metadata, if any.</param>
  /// <param name="authorizationServers">On success, the (copied) authorization servers; otherwise <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult RequireAuthorizationServers(
    IReadOnlyList<string>? authorizationServersField,
    out IReadOnlyList<string>? authorizationServers)
  {
    if (authorizationServersField is null || authorizationServersField.Count == 0)
    {
      authorizationServers = null;
      return AuthorizationResult.Fail(
        "protected-resource metadata MUST contain authorization_servers with one or more issuer identifiers (R-23.17-c)");
    }
    authorizationServers = [.. authorizationServersField];
    return AuthorizationResult.Success;
  }

  /// <summary>
  /// Returns the ordered authorization-server-metadata well-known URIs to try for <paramref name="issuer"/>,
  /// covering both OAuth 2.0 AS Metadata and OpenID Connect Discovery, for issuers with and without a path
  /// component, in the mandated priority order (R-23.17-e, R-23.17-f, R-23.17-g). A pass-through over S35's
  /// <see cref="WellKnownDiscovery.AuthorizationServerUris"/>.
  /// </summary>
  /// <param name="issuer">The authorization server's <c>issuer</c> identifier URL.</param>
  /// <returns>The ordered well-known URIs.</returns>
  public static IReadOnlyList<string> AuthorizationServerMetadataUris(string issuer) =>
    WellKnownDiscovery.AuthorizationServerUris(issuer);

  /// <summary>
  /// Validates that a fetched authorization-server metadata document's <c>issuer</c> is IDENTICAL to the
  /// issuer used to construct the well-known URL; if it differs the document MUST NOT be used (R-23.17-h,
  /// R-23.17-i). Exact string comparison — the same mix-up defence as
  /// <see cref="AuthorizationServerMetadata.Validate"/>, surfaced for callers that have already
  /// structurally validated the document.
  /// </summary>
  /// <param name="documentIssuer">The <c>issuer</c> in the fetched document.</param>
  /// <param name="expectedIssuer">The issuer used to construct the well-known URL.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult ValidateDiscoveredIssuer(string documentIssuer, string expectedIssuer)
  {
    if (!string.Equals(documentIssuer, expectedIssuer, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail(
        $"fetched metadata issuer \"{documentIssuer}\" does not match the expected issuer \"{expectedIssuer}\"; MUST NOT use the metadata (R-23.17-h, R-23.17-i)");
    }
    return AuthorizationResult.Success;
  }
}

// ─── §23.18 Scope selection & step-up authorization (R-23.18-a – R-23.18-r) ──────

/// <summary>Who the client is acting for, governing whether a step-up flow is attempted (spec §23.18, R-23.18-m, R-23.18-n).</summary>
public enum StepUpActor
{
  /// <summary>Acting on behalf of a user; SHOULD attempt step-up (R-23.18-m).</summary>
  User,

  /// <summary>Acting on its own behalf; MAY attempt or abort (R-23.18-n).</summary>
  ClientCredentials,
}

/// <summary>The next action a step-up driver should take, from <see cref="ScopeUpgradeTracker.NextAction"/> (spec §23.18).</summary>
public enum StepUpAction
{
  /// <summary>Retry the original request after re-authorizing with the unioned scopes.</summary>
  Retry,

  /// <summary>Treat persistent failure as a permanent authorization failure.</summary>
  PermanentFailure,
}

/// <summary>A scope-upgrade attempt key: the resource-and-operation combination being upgraded (spec §23.18, R-23.18-r).</summary>
/// <param name="Resource">The MCP server's canonical resource identifier.</param>
/// <param name="Operation">The operation (e.g. the MCP method) being attempted.</param>
public sealed record ScopeUpgradeKey(string Resource, string Operation);

/// <summary>
/// Tracks bounded step-up retry attempts per resource-and-operation combination, so a client retries no
/// more than a few times and treats persistent failure as a permanent authorization failure
/// (spec §23.18, R-23.18-q, R-23.18-r, R-23.1-af, R-23.1-ag).
/// </summary>
public sealed class ScopeUpgradeTracker
{
  // Keyed directly on the ScopeUpgradeKey record, whose value (structural) equality distinguishes the
  // (resource, operation) pair unambiguously — unlike a `$"{Resource} {Operation}"` string, which could
  // collide (e.g. ("a b", "c") and ("a", "b c") would flatten to the same key).
  private readonly Dictionary<ScopeUpgradeKey, int> _attempts = [];
  private readonly int _maxAttempts;

  /// <summary>Creates the tracker.</summary>
  /// <param name="maxAttempts">The maximum number of step-up attempts per resource-and-operation; MUST be a few at most. Defaults to <c>3</c> (R-23.18-q).</param>
  /// <exception cref="ArgumentOutOfRangeException">When <paramref name="maxAttempts"/> is not a positive integer.</exception>
  public ScopeUpgradeTracker(int maxAttempts = 3)
  {
    if (maxAttempts < 1)
    {
      throw new ArgumentOutOfRangeException(nameof(maxAttempts), "maxAttempts MUST be a positive integer (a few at most) (R-23.18-q)");
    }
    _maxAttempts = maxAttempts;
  }

  /// <summary>The configured retry bound.</summary>
  public int MaxAttempts => _maxAttempts;

  /// <summary>Returns the number of step-up attempts recorded so far for <paramref name="key"/> (R-23.1-ag).</summary>
  /// <param name="key">The resource-and-operation combination.</param>
  /// <returns>The attempt count.</returns>
  public int AttemptsFor(ScopeUpgradeKey key) => _attempts.GetValueOrDefault(key, 0);

  /// <summary>Returns <c>true</c> when another step-up attempt is permitted for <paramref name="key"/> (the bound has not been reached) (R-23.18-q).</summary>
  /// <param name="key">The resource-and-operation combination.</param>
  /// <returns><c>true</c> when a retry is permitted.</returns>
  public bool CanRetry(ScopeUpgradeKey key) => AttemptsFor(key) < _maxAttempts;

  /// <summary>Records one step-up attempt for <paramref name="key"/> and returns the new attempt count (R-23.1-ag).</summary>
  /// <param name="key">The resource-and-operation combination.</param>
  /// <returns>The new attempt count.</returns>
  public int RecordAttempt(ScopeUpgradeKey key)
  {
    var next = AttemptsFor(key) + 1;
    _attempts[key] = next;
    return next;
  }

  /// <summary>
  /// Records an attempt for <paramref name="key"/> and returns whether to <see cref="StepUpAction.Retry"/>
  /// or treat the failure as a <see cref="StepUpAction.PermanentFailure"/>, implementing the bounded retry
  /// (R-23.18-q, R-23.1-af). The single bound is <see cref="CanRetry"/>: the attempt just recorded is a
  /// retry exactly when a retry was permitted before it was recorded.
  /// </summary>
  /// <param name="key">The resource-and-operation combination.</param>
  /// <returns>The action to take.</returns>
  public StepUpAction NextAction(ScopeUpgradeKey key)
  {
    // Evaluate the bound on the pre-record count so NextAction and CanRetry share one comparison.
    var permitted = CanRetry(key);
    RecordAttempt(key);
    return permitted ? StepUpAction.Retry : StepUpAction.PermanentFailure;
  }

  /// <summary>Clears the attempt count for <paramref name="key"/> (e.g. after a successful retry).</summary>
  /// <param name="key">The resource-and-operation combination.</param>
  public void Reset(ScopeUpgradeKey key) => _attempts.Remove(key);
}

/// <summary>A plan for one step-up re-authorization, from <see cref="ScopeStepUp.Plan"/> (spec §23.18).</summary>
/// <param name="Proceed">Whether a step-up should be attempted at all (per the actor and retry bound).</param>
/// <param name="Scopes">The UNION scope set to request on re-authorization, when <paramref name="Proceed"/> (R-23.18-o).</param>
/// <param name="Scope">The space-delimited <c>scope</c> parameter for the re-authorization request.</param>
/// <param name="Reason">When <paramref name="Proceed"/> is <c>false</c>, why the step-up is not attempted.</param>
public sealed record StepUpPlan(bool Proceed, IReadOnlyList<string> Scopes, string Scope, string? Reason = null);

/// <summary>
/// Least-privilege scope selection, the scope union that never drops already-granted scopes, and the
/// bounded step-up re-authorization plan (spec §23.18, R-23.18-a – R-23.18-r, R-23.1-ae – R-23.1-ag).
/// </summary>
public static class ScopeStepUp
{
  /// <summary>
  /// Splits a space-delimited scope string into a deduplicated, order-preserving list. Empty/whitespace
  /// input yields an empty list.
  /// </summary>
  /// <param name="scope">A space-delimited scope string, or <c>null</c>.</param>
  /// <returns>The deduplicated scopes.</returns>
  public static IReadOnlyList<string> ParseScopeSet(string? scope)
  {
    if (scope is null)
    {
      return [];
    }
    var seen = new HashSet<string>(StringComparer.Ordinal);
    var output = new List<string>();
    foreach (var s in scope.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
    {
      if (seen.Add(s))
      {
        output.Add(s);
      }
    }
    return output;
  }

  /// <summary>Serializes a scope list back into a space-delimited string.</summary>
  /// <param name="scopes">The scopes to format.</param>
  /// <returns>The space-delimited string.</returns>
  public static string FormatScopeSet(IReadOnlyList<string> scopes) => string.Join(' ', scopes);

  /// <summary>
  /// Selects the least-privilege scopes for the initial authorization handshake, applying the §23.18
  /// priority (R-23.18-a – R-23.18-d): the challenge <c>scope</c> (authoritative), else all of
  /// <c>scopes_supported</c>, else omit (<c>null</c>). Delegates to S36's
  /// <see cref="AuthorizationScopes.Resolve"/>.
  /// </summary>
  /// <param name="challenge">The parsed <c>WWW-Authenticate</c> challenge, if any.</param>
  /// <param name="scopesSupported">Protected-resource <c>scopes_supported</c>, if any.</param>
  /// <returns>The resolved scope string, or <c>null</c> to omit <c>scope</c>.</returns>
  public static string? SelectInitial(WwwAuthenticateChallenge? challenge, IReadOnlyList<string>? scopesSupported) =>
    AuthorizationScopes.Resolve(challenge, scopesSupported);

  /// <summary>
  /// Computes the UNION of already-granted/already-requested scopes with the newly-challenged scopes — the
  /// scope set a step-up re-authorization requests (R-23.18-o, R-23.18-p, R-23.1-ae). Order-preserving and
  /// deduplicating: every already-granted scope is retained (R-23.18-p — never dropped) and the challenged
  /// scopes are appended.
  /// </summary>
  /// <param name="alreadyGranted">The scopes the client already holds/requested.</param>
  /// <param name="challengedScopes">The scopes from the current challenge.</param>
  /// <returns>The unioned scope set.</returns>
  public static IReadOnlyList<string> UnionScopes(IReadOnlyList<string> alreadyGranted, IReadOnlyList<string> challengedScopes)
  {
    var seen = new HashSet<string>(StringComparer.Ordinal);
    var output = new List<string>();
    foreach (var s in alreadyGranted.Concat(challengedScopes))
    {
      if (s.Length > 0 && seen.Add(s))
      {
        output.Add(s);
      }
    }
    return output;
  }

  /// <summary>
  /// Returns <c>true</c> when a client SHOULD attempt the step-up flow for a scope-related error: always
  /// for a user-acting client (R-23.18-m); for a <see cref="StepUpActor.ClientCredentials"/> client it MAY
  /// attempt or abort, so this returns <c>false</c> (the conservative default) (R-23.18-l – R-23.18-n).
  /// </summary>
  /// <param name="actor">Who the client is acting for.</param>
  /// <returns><c>true</c> when step-up should be attempted.</returns>
  public static bool ShouldAttempt(StepUpActor actor) => actor == StepUpActor.User;

  /// <summary>
  /// Plans one step-up re-authorization end to end: decides whether to proceed (by actor and remaining
  /// retries), computes the UNION scope set that never drops already-granted scopes, and records the
  /// attempt against the bound (R-23.18-l – R-23.18-r, R-23.1-ae – R-23.1-ag).
  /// </summary>
  /// <remarks>
  /// Proceeds when (a) the actor SHOULD/elects to step up — a user-acting client, or a
  /// <see cref="StepUpActor.ClientCredentials"/> client with <paramref name="forceForClientCredentials"/> —
  /// AND (b) the tracker still permits a retry for the <paramref name="key"/>. When it proceeds it records
  /// the attempt (R-23.1-ag) and returns the unioned scopes for a fresh authorization-code+PKCE flow. When
  /// the retry bound is exhausted it returns <c>Proceed: false</c> so the caller treats the failure as
  /// permanent (R-23.18-q).
  /// </remarks>
  /// <param name="actor">Who the client is acting for (R-23.18-m, R-23.18-n).</param>
  /// <param name="alreadyGranted">The scopes the client already holds/requested (R-23.18-o).</param>
  /// <param name="challenge">The challenge driving the step-up (its <c>scope</c> is parsed for the union) (R-23.18-l).</param>
  /// <param name="key">The resource-and-operation being upgraded, for retry tracking (R-23.18-r).</param>
  /// <param name="tracker">The shared upgrade tracker enforcing the retry bound (R-23.18-q).</param>
  /// <param name="forceForClientCredentials"><c>true</c> to attempt step-up even for a <see cref="StepUpActor.ClientCredentials"/> client, exercising the MAY of R-23.18-n. Defaults to <c>false</c>.</param>
  /// <returns>The step-up plan.</returns>
  public static StepUpPlan Plan(
    StepUpActor actor,
    IReadOnlyList<string> alreadyGranted,
    WwwAuthenticateChallenge challenge,
    ScopeUpgradeKey key,
    ScopeUpgradeTracker tracker,
    bool forceForClientCredentials = false)
  {
    var wantsStepUp = ShouldAttempt(actor) || forceForClientCredentials;
    if (!wantsStepUp)
    {
      return new StepUpPlan(false, [], string.Empty,
        "a client_credentials client MAY abort rather than step up; not attempting (R-23.18-n)");
    }
    if (!tracker.CanRetry(key))
    {
      return new StepUpPlan(false, [], string.Empty,
        $"step-up retry bound ({tracker.MaxAttempts}) reached for this resource-and-operation; treat as a permanent authorization failure (R-23.18-q, R-23.1-af)");
    }
    var challenged = ParseScopeSet(challenge.Scope);
    var scopes = UnionScopes(alreadyGranted, challenged);
    tracker.RecordAttempt(key);
    return new StepUpPlan(true, scopes, FormatScopeSet(scopes));
  }
}

// ─── §23.19 Authorization security considerations (R-23.19-a – R-23.19-u) ────────

/// <summary>
/// The per-request record that MUST hold the recorded issuer, PKCE code verifier, and <c>state</c>
/// together (spec §23.19, R-23.19-e, R-23.19-j, R-23.19-k, R-23.19-l).
/// </summary>
/// <param name="RecordedIssuer">The validated <c>issuer</c>, recorded BEFORE redirect (R-23.19-e).</param>
/// <param name="CodeVerifier">The PKCE <c>code_verifier</c> (R-23.19-k).</param>
/// <param name="State">The unpredictable anti-CSRF <c>state</c> (R-23.19-l).</param>
public sealed record SecureAuthorizationRequestRecord(string? RecordedIssuer, string? CodeVerifier, string? State);

/// <summary>
/// Consolidated §23.19 authorization-security predicates: audience binding, exact issuer validation, the
/// per-request record invariant, token confidentiality/redaction, header-only token presentation, and
/// refresh-token handling (spec §23.19, R-23.19-a – R-23.19-u).
/// </summary>
public static class AuthorizationSecurity
{
  /// <summary>The fixed redaction marker used in place of a token at any log/forward sink (R-23.19-m, R-23.19-n, R-23.19-o).</summary>
  public const string RedactedTokenMarker = "[REDACTED]";

  /// <summary>
  /// Validates the audience-binding requirement: the SAME <c>resource</c> parameter, identifying the MCP
  /// server by its canonical URI, MUST be present in BOTH the authorization request and the token request,
  /// regardless of advertised AS support (R-23.19-a).
  /// </summary>
  /// <param name="authorizationRequestResource">The <c>resource</c> sent in the authorization request.</param>
  /// <param name="tokenRequestResource">The <c>resource</c> sent in the token request.</param>
  /// <param name="canonicalResource">The MCP server's canonical resource identifier both MUST equal.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult CheckResourceParameterBinding(
    string? authorizationRequestResource,
    string? tokenRequestResource,
    string canonicalResource)
  {
    if (!string.Equals(authorizationRequestResource, canonicalResource, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail(
        "the authorization request MUST send a resource parameter equal to the MCP server canonical URI, regardless of AS support (R-23.19-a)");
    }
    if (!string.Equals(tokenRequestResource, canonicalResource, StringComparison.Ordinal))
    {
      return AuthorizationResult.Fail(
        "the token request MUST send the same resource parameter as the authorization request (R-23.19-a)");
    }
    return AuthorizationResult.Success;
  }

  /// <summary>
  /// Returns <c>true</c> when a client MAY send the access token it holds for <paramref name="tokenIssuer"/>
  /// to the MCP server whose authorization server is <paramref name="serverIssuer"/> — strictly only when
  /// the issuers match exactly. A client MUST NOT send a token to an MCP server other than one issued by
  /// that server's authorization server (R-23.19-c).
  /// </summary>
  /// <param name="tokenIssuer">The issuer that minted the token the client holds.</param>
  /// <param name="serverIssuer">The issuer of the target server's authorization server.</param>
  /// <returns><c>true</c> when the token may be forwarded.</returns>
  public static bool MayForwardTokenToServer(string tokenIssuer, string serverIssuer) =>
    CredentialBinding.IssuersMatchExactly(tokenIssuer, serverIssuer);

  /// <summary>
  /// Validates the authorization response's <c>iss</c> against the recorded issuer by exact string
  /// comparison — the mix-up defence a client MUST perform BEFORE transmitting the authorization code,
  /// including the <c>authorization_response_iss_parameter_supported</c> reject rule (R-23.19-e – R-23.19-h).
  /// Delegates to S36's <see cref="AuthorizationRedirect.ValidateIssuer"/> (the §23.7 decision table).
  /// </summary>
  /// <param name="iss">The decoded <c>iss</c> from the response, if any.</param>
  /// <param name="recordedIssuer">The issuer recorded before redirect (R-23.19-e).</param>
  /// <param name="issParameterSupported">The AS flag, if advertised (R-23.19-g).</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult ValidateExactIssuer(string? iss, string recordedIssuer, bool? issParameterSupported) =>
    AuthorizationRedirect.ValidateIssuer(iss, recordedIssuer, issParameterSupported);

  /// <summary>
  /// Asserts that the recorded issuer, PKCE code verifier, and <c>state</c> are all present in the same
  /// per-request record — the §23.19 storage invariant (R-23.19-j). An empty field means the record is
  /// incomplete and the flow MUST NOT proceed.
  /// </summary>
  /// <param name="record">The per-request record under construction.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult SameRequestRecord(SecureAuthorizationRequestRecord record)
  {
    if (string.IsNullOrEmpty(record.RecordedIssuer))
    {
      return AuthorizationResult.Fail("the recorded issuer MUST be stored in the per-request record (R-23.19-e, R-23.19-j)");
    }
    if (string.IsNullOrEmpty(record.CodeVerifier))
    {
      return AuthorizationResult.Fail("the PKCE code_verifier MUST be stored in the same per-request record (R-23.19-j, R-23.19-k)");
    }
    if (string.IsNullOrEmpty(record.State))
    {
      return AuthorizationResult.Fail("the state value MUST be stored in the same per-request record (R-23.19-j, R-23.19-l)");
    }
    return AuthorizationResult.Success;
  }

  /// <summary>
  /// <c>true</c> — access and refresh tokens are confidential: they MUST NOT be logged and MUST NOT be
  /// forwarded to third parties (R-23.19-m, R-23.19-n). The rule is unconditional, so it is a named
  /// constant rather than a predicate over a token (which would only invite passing the secret somewhere
  /// it could be captured).
  /// </summary>
  public const bool TokensAreConfidential = true;

  /// <summary>
  /// Returns a redacted placeholder for a token so diagnostics never carry the secret itself, enforcing
  /// token confidentiality at log/forward sinks (R-23.19-m, R-23.19-n, R-23.19-o). Returns a fixed marker
  /// regardless of input, so the secret is never embedded.
  /// </summary>
  /// <returns>The redaction marker.</returns>
  public static string RedactToken() => RedactedTokenMarker;

  /// <summary>
  /// Validates that the access token is presented ONLY in the <c>Authorization: Bearer</c> request header
  /// and NEVER in the URI query string (R-23.19-p). Reuses S36's
  /// <see cref="AccessTokenUsage.UrlContainsAccessTokenInQuery"/> and requires an <c>Authorization</c>
  /// header to be present.
  /// </summary>
  /// <param name="requestUrl">The request URL to inspect for a query-string token.</param>
  /// <param name="hasAuthorizationHeader">Whether the request carries an <c>Authorization</c> header.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult CheckBearerHeaderOnly(string requestUrl, bool hasAuthorizationHeader)
  {
    if (AccessTokenUsage.UrlContainsAccessTokenInQuery(requestUrl))
    {
      return AuthorizationResult.Fail(
        "the access token MUST NOT be placed in the URI query string; send it only in the Authorization: Bearer header (R-23.19-p)");
    }
    if (!hasAuthorizationHeader)
    {
      return AuthorizationResult.Fail(
        "the access token MUST be sent in the Authorization: Bearer header on every request to the MCP server (R-23.19-p)");
    }
    return AuthorizationResult.Success;
  }

  // ─── §23.19 Refresh tokens (R-23.19-q – R-23.19-u) ────────────────────────────

  /// <summary>
  /// Returns the <c>grant_types</c> a client wanting refresh tokens SHOULD register: the given grant types
  /// plus <c>refresh_token</c> (deduplicated) (R-23.19-r).
  /// </summary>
  /// <param name="grantTypes">The grant types the client already declares.</param>
  /// <returns>The grant types including <c>refresh_token</c>.</returns>
  public static IReadOnlyList<string> GrantTypesWithRefresh(IReadOnlyList<string> grantTypes)
  {
    var output = new List<string>(grantTypes);
    if (!output.Contains(OAuthValues.GrantTypeRefreshToken))
    {
      output.Add(OAuthValues.GrantTypeRefreshToken);
    }
    return output;
  }

  /// <summary>
  /// Adds <c>offline_access</c> to a scope list when, and only when, the authorization-server metadata
  /// advertises it in <c>scopes_supported</c>, for a client that wants a refresh token (R-23.19-s). The
  /// result is deduplicated.
  /// </summary>
  /// <param name="scopes">The current scope list.</param>
  /// <param name="asScopesSupported">The selected authorization server's <c>scopes_supported</c>.</param>
  /// <returns>The scopes, possibly with <c>offline_access</c> appended.</returns>
  public static IReadOnlyList<string> WithOfflineAccessIfAdvertised(
    IReadOnlyList<string> scopes,
    IReadOnlyList<string>? asScopesSupported)
  {
    var advertised = asScopesSupported?.Contains(OAuthValues.OfflineAccessScope) ?? false;
    var output = new List<string>(scopes);
    if (advertised && !output.Contains(OAuthValues.OfflineAccessScope))
    {
      output.Add(OAuthValues.OfflineAccessScope);
    }
    return output;
  }

  /// <summary>
  /// <c>true</c> — a client MUST NOT assume a refresh token will be issued; the authorization server
  /// retains discretion (R-23.19-t). This is an unconditional control-flow invariant (treat the refresh
  /// token as optional and handle its absence, pairing with <see cref="TokenResponse.HasNoRefreshToken"/>),
  /// so it is a named constant rather than a no-argument predicate.
  /// </summary>
  public const bool RefreshTokenAlwaysOptional = true;

  /// <summary>
  /// Validates that a server (protected resource) does NOT include <c>offline_access</c> in its
  /// <c>WWW-Authenticate</c> <c>scope</c> or in its <c>scopes_supported</c>, as a server SHOULD ensure —
  /// refresh tokens are not a resource requirement (R-23.19-u).
  /// </summary>
  /// <param name="challengeScope">The <c>WWW-Authenticate</c> <c>scope</c> the server emits, if any.</param>
  /// <param name="scopesSupported">The server's protected-resource <c>scopes_supported</c>, if any.</param>
  /// <returns>The validation outcome.</returns>
  public static AuthorizationResult ServerScopesOmitOfflineAccess(string? challengeScope, IReadOnlyList<string>? scopesSupported)
  {
    if (challengeScope is not null && ScopeStepUp.ParseScopeSet(challengeScope).Contains(OAuthValues.OfflineAccessScope))
    {
      return AuthorizationResult.Fail("a server SHOULD NOT include offline_access in its WWW-Authenticate scope (R-23.19-u)");
    }
    if (scopesSupported is not null && scopesSupported.Contains(OAuthValues.OfflineAccessScope))
    {
      return AuthorizationResult.Fail("a server SHOULD NOT include offline_access in its scopes_supported (R-23.19-u)");
    }
    return AuthorizationResult.Success;
  }
}
