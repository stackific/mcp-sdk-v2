using System.Text.Json.Nodes;

using Microsoft.AspNetCore.Http;

using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Server;

/// <summary>
/// Configures the server bearer-auth gate (spec §23): the protected-resource metadata URI advertised on
/// the <c>401</c> challenge, this resource's canonical identifier (the expected token audience), the
/// scopes a request must carry, and the token-validation callback.
/// </summary>
/// <param name="ResourceMetadataUrl">The protected-resource metadata URL advertised via <c>resource_metadata</c> (R-23.1-v).</param>
/// <param name="ExpectedAudience">This resource's canonical identifier; the token's audience MUST equal it (§23.6).</param>
/// <param name="Validate">Validates a bearer token, returning the caller's identity, or <c>null</c> to reject.</param>
/// <param name="RequiredScopes">The scopes a valid token MUST grant; a token lacking one yields a <c>403</c> insufficient_scope challenge (§23.8, R-23.8-f). Empty/absent means no scope is enforced.</param>
public sealed record BearerAuthGateOptions(
  string ResourceMetadataUrl,
  string ExpectedAudience,
  Func<string, AuthInfo?> Validate,
  IReadOnlyList<string>? RequiredScopes = null);

/// <summary>
/// Server-side authorization glue (spec §23): turns a token-validation callback into an
/// <see cref="IMcpAuthGate"/> for the Streamable HTTP adapter — emitting the <c>401</c> +
/// <c>WWW-Authenticate</c> challenge (carrying <c>resource_metadata</c> and, when known, <c>scope</c>)
/// and the <c>403</c> <c>insufficient_scope</c> challenge the spec requires — and builds the RFC 9728
/// protected-resource metadata document. The C# counterpart of ts-sdk's <c>server/auth.ts</c>.
/// </summary>
/// <remarks>
/// The gate's per-request state machine (missing/invalid/expired → <c>401</c>; wrong audience →
/// <c>401</c>; under-scoped → <c>403</c>) and the challenge construction are delegated to the §23.8
/// protocol primitives (<see cref="AccessTokenUsage"/>, <see cref="WwwAuthenticate"/>): the Bearer scheme
/// is matched case-insensitively (RFC 7235), the audience is compared by canonical resource identity
/// (string OR array, uppercase scheme/host and trailing-slash tolerant), and the challenge values are
/// escaped per RFC 7235.
/// </remarks>
public static class AuthGates
{
  /// <summary>
  /// Builds an RFC 9728 protected-resource metadata document (spec §23.2): the canonical <c>resource</c>
  /// identifier, the <c>authorization_servers</c> that protect it, the <c>scopes_supported</c> it
  /// recognizes, and the bearer delivery methods it accepts (header only). <c>scopes_supported</c> is
  /// emitted only when scopes are provided, matching the TypeScript builder.
  /// </summary>
  /// <param name="resource">The canonical resource identifier (the MCP endpoint URL).</param>
  /// <param name="authorizationServers">The authorization-server issuer URLs that protect this resource.</param>
  /// <param name="scopes">The scopes the resource recognizes.</param>
  /// <returns>The protected-resource metadata as a <see cref="JsonObject"/>.</returns>
  public static JsonObject BuildProtectedResourceMetadata(
    string resource,
    IReadOnlyList<string> authorizationServers,
    IReadOnlyList<string> scopes)
  {
    var servers = new JsonArray();
    foreach (var server in authorizationServers)
    {
      servers.Add(server);
    }

    var document = new JsonObject
    {
      ["resource"] = resource,
      ["authorization_servers"] = servers,
      ["bearer_methods_supported"] = new JsonArray("header"),
    };

    if (scopes.Count > 0)
    {
      var scopesSupported = new JsonArray();
      foreach (var scope in scopes)
      {
        scopesSupported.Add(scope);
      }
      document["scopes_supported"] = scopesSupported;
    }

    return document;
  }

  /// <summary>
  /// Builds an <see cref="IMcpAuthGate"/> that requires a valid <c>Bearer</c> token (spec §23.1). On a
  /// missing, malformed, invalid, or expired token it answers <c>401</c> with a <c>WWW-Authenticate:
  /// Bearer …</c> challenge carrying <paramref name="resourceMetadataUrl"/>; on a token whose audience
  /// does not match <paramref name="expectedAudience"/> it answers <c>401</c> (§23.6 — a server MUST reject
  /// a token not issued for it and never forward it). On success it threads the validated
  /// <see cref="AuthInfo"/> into request processing.
  /// </summary>
  /// <param name="resourceMetadataUrl">The protected-resource metadata URL advertised via <c>resource_metadata</c>.</param>
  /// <param name="expectedAudience">This resource's canonical identifier; the token's audience MUST equal it (§23.6).</param>
  /// <param name="validate">Validates a bearer token, returning the caller's identity, or <c>null</c> to reject.</param>
  /// <returns>The configured authorization gate.</returns>
  public static IMcpAuthGate Bearer(string resourceMetadataUrl, string expectedAudience, Func<string, AuthInfo?> validate) =>
    new BearerAuthGate(new BearerAuthGateOptions(resourceMetadataUrl, expectedAudience, validate));

  /// <summary>
  /// Builds an <see cref="IMcpAuthGate"/> from full <see cref="BearerAuthGateOptions"/>, including
  /// <see cref="BearerAuthGateOptions.RequiredScopes"/> so that a valid token lacking a required scope is
  /// answered with a <c>403 Forbidden</c> <c>insufficient_scope</c> challenge (§23.8, R-23.8-f), listing
  /// all required scopes in a single challenge (R-23.1-ac).
  /// </summary>
  /// <param name="options">The gate configuration (metadata URI, expected audience, validator, required scopes).</param>
  /// <returns>The configured authorization gate.</returns>
  public static IMcpAuthGate Bearer(BearerAuthGateOptions options) => new BearerAuthGate(options);

  /// <summary>
  /// The bearer-token authorization gate (spec §23): reads the <c>Authorization: Bearer &lt;token&gt;</c>
  /// header (case-insensitive scheme, RFC 7235), validates the token, binds its audience to this resource
  /// (string OR array, §23.6), enforces token expiry and required scopes, and surfaces the identity.
  /// </summary>
  private sealed class BearerAuthGate(BearerAuthGateOptions options) : IMcpAuthGate
  {
    /// <inheritdoc/>
    public Task<AuthGateResult> AuthorizeAsync(HttpContext context)
    {
      var header = context.Request.Headers.Authorization.ToString();
      var token = AccessTokenUsage.ExtractBearerToken(string.IsNullOrEmpty(header) ? null : header);

      if (token is null)
      {
        return Task.FromResult(Unauthorized());
      }

      var authInfo = options.Validate(token);
      if (authInfo is null)
      {
        return Task.FromResult(Unauthorized());
      }

      // Build the validated facts and run the §23.8 per-request validation state machine: this yields the
      // correct 401 (missing/invalid/expired/wrong-audience) or 403 (under-scoped) challenge.
      var expired = authInfo.ExpiresAt is { } exp && exp <= DateTimeOffset.UtcNow.ToUnixTimeSeconds();
      var audiences = authInfo.Audience is null ? Array.Empty<string>() : new[] { authInfo.Audience };
      var presented = new PresentedToken(
        Active: true,
        Expired: expired,
        Audience: authInfo.Audience,
        Scopes: authInfo.Scopes ?? [],
        Audiences: authInfo.Audience is null ? [] : audiences);

      var validation = AccessTokenUsage.ValidateRequest(
        presented,
        options.ExpectedAudience,
        options.ResourceMetadataUrl,
        options.RequiredScopes);

      if (!validation.Ok)
      {
        return Task.FromResult(new AuthGateResult(false, null, validation.Challenge.Status, validation.Challenge.WwwAuthenticate));
      }

      return Task.FromResult(new AuthGateResult(true, authInfo));
    }

    /// <summary>Builds the <c>401</c> challenge carrying <c>resource_metadata</c> and, when known, the required <c>scope</c> (R-23.1-v, R-23.1-w).</summary>
    private AuthGateResult Unauthorized()
    {
      var scope = options.RequiredScopes is { Count: > 0 } scopes ? string.Join(' ', scopes) : null;
      var value = WwwAuthenticate.BuildUnauthorizedValue(options.ResourceMetadataUrl, scope);
      return new AuthGateResult(false, null, AuthorizationConstants.UnauthorizedStatus, value);
    }
  }
}
