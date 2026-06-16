using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace CSharpMcpServer;

/// <summary>
/// An OAuth 2.1 Authorization Server (issuer) plus a protected MCP resource, on one
/// <see cref="WebApplication"/>. The C# counterpart of ts-mcp-server's <c>auth.ts</c>: two roles on one
/// port — the AS (metadata, dynamic client registration, token, authorize) and a real MCP server
/// (served via the SDK's Streamable HTTP adapter) that rejects unauthenticated requests with
/// <c>401 + WWW-Authenticate</c> and, on a valid bearer token, threads the identity into
/// <c>ctx.AuthInfo</c>. All state is in memory; this is a demo issuer, not a production AS.
/// </summary>
public static class Auth
{
  private const string Scope = "mcp:tools";
  private const long TokenLifetimeMs = 3_600_000;

  /// <summary>
  /// Builds (but does not start) the OAuth Authorization Server + protected MCP resource at
  /// <paramref name="issuer"/>. The protected resource is exposed at <c>{issuer}/mcp</c>.
  /// </summary>
  /// <param name="issuer">The issuer origin (for example <c>http://localhost:8202</c>), without a trailing slash.</param>
  /// <returns>The configured application, ready for <c>app.Run()</c>.</returns>
  public static WebApplication BuildAuthServer(string issuer)
  {
    issuer = issuer.TrimEnd('/');
    var resource = $"{issuer}/mcp";
    var prmUrl = $"{issuer}/.well-known/oauth-protected-resource";

    // ── In-memory stores (a demo issuer; nothing here survives a restart) ──
    var clients = new ConcurrentDictionary<string, RegisteredClient>(StringComparer.Ordinal);
    var tokens = new ConcurrentDictionary<string, IssuedToken>(StringComparer.Ordinal);
    var authCodes = new ConcurrentDictionary<string, AuthCode>(StringComparer.Ordinal);

    // A seeded confidential client so a demo can skip DCR if it wants to.
    clients["companion-demo-client"] = new RegisteredClient(
      "companion-demo-client",
      "companion-demo-secret",
      "Companion Demo Client",
      ["client_credentials", "authorization_code"]);

    IssuedToken Issue(string clientId)
    {
      var token = RandomBase64Url(32);
      var issued = new IssuedToken(token, clientId, Scope, resource, NowMs() + TokenLifetimeMs);
      tokens[token] = issued;
      return issued;
    }

    var builder = WebApplication.CreateBuilder();
    var app = builder.Build();

    app.MapGet("/health", () => Results.Json(new { status = "ok", role = "auth+protected-resource" }));

    // ── Authorization Server metadata (RFC 8414) ──
    app.MapGet("/.well-known/oauth-authorization-server", () => Results.Json(new
    {
      issuer,
      authorization_endpoint = $"{issuer}/authorize",
      token_endpoint = $"{issuer}/token",
      registration_endpoint = $"{issuer}/register",
      scopes_supported = new[] { Scope },
      response_types_supported = new[] { "code" },
      grant_types_supported = new[] { "authorization_code", "client_credentials", "refresh_token" },
      token_endpoint_auth_methods_supported = new[] { "client_secret_post", "client_secret_basic" },
      code_challenge_methods_supported = new[] { "S256" },
    }));

    // ── Protected Resource metadata (RFC 9728), built with the SDK helper ──
    app.MapGet("/.well-known/oauth-protected-resource", () =>
      Results.Text(
        AuthGates.BuildProtectedResourceMetadata(resource, [issuer], [Scope]).ToJsonString(),
        "application/json"));

    // ── Dynamic Client Registration (RFC 7591) ──
    app.MapPost("/register", async (HttpRequest request) =>
    {
      var body = await ReadJsonObjectAsync(request).ConfigureAwait(false);
      var clientId = $"dcr-{Guid.NewGuid():N}";
      var clientSecret = RandomHex(24);
      var grantTypes = (body?["grant_types"] as JsonArray)?.Select(n => n!.GetValue<string>()).ToArray();
      grantTypes = grantTypes is { Length: > 0 } ? grantTypes : ["authorization_code"];
      var clientName = body?["client_name"]?.GetValue<string>();
      var redirectUris = (body?["redirect_uris"] as JsonArray)?.Select(n => n!.GetValue<string>()).ToArray() ?? [];

      clients[clientId] = new RegisteredClient(clientId, clientSecret, clientName, grantTypes);

      return Results.Json(new
      {
        client_id = clientId,
        client_secret = clientSecret,
        client_id_issued_at = NowMs() / 1000,
        grant_types = grantTypes,
        token_endpoint_auth_method = "client_secret_post",
        client_name = clientName ?? "Dynamically Registered Client",
        redirect_uris = redirectUris,
      }, statusCode: 201);
    });

    // ── Token endpoint (authorization_code + PKCE, and client_credentials) ──
    app.MapPost("/token", async (HttpRequest request) =>
    {
      var form = await request.ReadFormAsync().ConfigureAwait(false);
      var grant = form["grant_type"].ToString();
      var clientId = form["client_id"].ToString();

      if (grant == "authorization_code")
      {
        var code = form["code"].ToString();
        var verifier = form["code_verifier"].ToString();
        var redirectUri = form["redirect_uri"].ToString();

        if (!authCodes.TryRemove(code, out var record)) // single-use
        {
          return Results.Json(new { error = "invalid_grant", error_description = "Unknown or expired authorization code" }, statusCode: 400);
        }
        if (!string.IsNullOrEmpty(record.RedirectUri) && record.RedirectUri != redirectUri)
        {
          return Results.Json(new { error = "invalid_grant", error_description = "redirect_uri mismatch" }, statusCode: 400);
        }

        var ok = record.CodeChallengeMethod == "S256"
          ? Sha256Base64Url(verifier) == record.CodeChallenge
          : verifier == record.CodeChallenge;
        if (!ok)
        {
          return Results.Json(new { error = "invalid_grant", error_description = "PKCE verification failed" }, statusCode: 400);
        }

        var issued = Issue(string.IsNullOrEmpty(record.ClientId) ? clientId : record.ClientId);
        return Results.Json(new { access_token = issued.Token, token_type = "Bearer", expires_in = 3600, scope = issued.Scope });
      }

      if (grant == "client_credentials")
      {
        var clientSecret = form["client_secret"].ToString();
        if (!clients.TryGetValue(clientId, out var client) || client.ClientSecret != clientSecret)
        {
          return Results.Json(new { error = "invalid_client", error_description = "Unknown client or bad secret" }, statusCode: 401);
        }
        var issued = Issue(clientId);
        return Results.Json(new { access_token = issued.Token, token_type = "Bearer", expires_in = 3600, scope = issued.Scope });
      }

      return Results.Json(new { error = "unsupported_grant_type", error_description = $"grant_type {grant} not supported" }, statusCode: 400);
    });

    // ── Authorization endpoint (auto-approving — no interactive login in this demo) ──
    app.MapGet("/authorize", (HttpRequest request) =>
    {
      var query = request.Query;
      var clientId = query["client_id"].ToString();
      var redirectUri = query["redirect_uri"].ToString();
      var state = query["state"].ToString();
      var codeChallenge = query["code_challenge"].ToString();
      var codeChallengeMethod = query["code_challenge_method"].ToString();
      if (string.IsNullOrEmpty(codeChallengeMethod)) codeChallengeMethod = "plain";

      var code = RandomBase64Url(16);
      authCodes[code] = new AuthCode(clientId, redirectUri, codeChallenge, codeChallengeMethod);

      if (!string.IsNullOrEmpty(redirectUri))
      {
        var builderUri = new UriBuilder(redirectUri);
        var queryString = builderUri.Query.TrimStart('?');
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(queryString)) parts.Add(queryString);
        parts.Add($"code={Uri.EscapeDataString(code)}");
        if (!string.IsNullOrEmpty(state)) parts.Add($"state={Uri.EscapeDataString(state)}");
        builderUri.Query = string.Join('&', parts);
        return Results.Redirect(builderUri.Uri.ToString());
      }

      return Results.Json(new { code, state });
    });

    // ── Protected MCP resource (Streamable HTTP) with the SDK bearer gate ──
    var protectedServer = BuildProtectedServer();
    app.MapMcp("/mcp", protectedServer, AuthGates.Bearer(prmUrl, resource, token =>
    {
      if (!tokens.TryGetValue(token, out var issued) || issued.ExpiresAt < NowMs()) return null;
      return new AuthInfo(
        issued.Token,
        ClientId: issued.ClientId,
        Scopes: issued.Scope.Split(' ', StringSplitOptions.RemoveEmptyEntries),
        Audience: issued.Audience,
        ExpiresAt: issued.ExpiresAt / 1000);
    }));

    return app;
  }

  /// <summary>Builds the identity-aware protected MCP server (whoami + get_secret), built on the SDK runtime.</summary>
  private static McpServer BuildProtectedServer()
  {
    var server = new McpServer(
      new Implementation { Name = "protected-mcp-server", Title = "Protected MCP Server", Version = "0.1.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });

    server.RegisterTool(
      new Tool
      {
        Name = "whoami",
        Title = "Who am I",
        Description = "Returns the validated OAuth identity the server sees (ctx.AuthInfo).",
        InputSchema = new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() },
      },
      ctx =>
      {
        var info = ctx.AuthInfo;
        var clientId = info?.ClientId ?? "unknown";
        var scopes = info?.Scopes ?? [];
        var scopesArray = new JsonArray();
        foreach (var scope in scopes) scopesArray.Add(scope);
        var structured = new JsonObject
        {
          ["clientId"] = info?.ClientId,
          ["scopes"] = scopesArray,
          ["expiresAt"] = info?.ExpiresAt,
        };
        return Task.FromResult(new CallToolResult
        {
          Content = [ContentBlocks.Text($"Authenticated as {clientId} with scopes [{string.Join(", ", scopes)}].")],
          StructuredContent = structured,
        });
      });

    server.RegisterTool(
      new Tool
      {
        Name = "get_secret",
        Title = "Get Secret",
        Description = "Returns protected data that only an authorized caller may read.",
        InputSchema = new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() },
      },
      _ => Task.FromResult(CallToolResult.FromText("🔐 The launch codes are 0000 (do not tell anyone).")));

    return server;
  }

  // ───────────────────────── Helpers ─────────────────────────

  private static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

  private static string Base64Url(byte[] bytes) =>
    Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');

  /// <summary>A random base64url string from <paramref name="n"/> random bytes (for opaque tokens/codes).</summary>
  private static string RandomBase64Url(int n) => Base64Url(RandomNumberGenerator.GetBytes(n));

  /// <summary>A random lowercase-hex string from <paramref name="n"/> random bytes (for client secrets).</summary>
  private static string RandomHex(int n) => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(n));

  /// <summary>SHA-256 of <paramref name="s"/>, base64url-encoded (PKCE S256 challenge derivation).</summary>
  private static string Sha256Base64Url(string s) => Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(s)));

  private static async Task<JsonObject?> ReadJsonObjectAsync(HttpRequest request)
  {
    try
    {
      using var reader = new StreamReader(request.Body, Encoding.UTF8);
      var text = await reader.ReadToEndAsync().ConfigureAwait(false);
      return string.IsNullOrWhiteSpace(text) ? new JsonObject() : JsonNode.Parse(text) as JsonObject ?? new JsonObject();
    }
    catch
    {
      return new JsonObject();
    }
  }

  private sealed record RegisteredClient(string ClientId, string ClientSecret, string? Name, string[] GrantTypes);

  private sealed record IssuedToken(string Token, string ClientId, string Scope, string Audience, long ExpiresAt);

  private sealed record AuthCode(string ClientId, string RedirectUri, string CodeChallenge, string CodeChallengeMethod);
}
