using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// Security validation and credential-free fetching for <see cref="Icon"/> sources (spec §14.2).
/// </summary>
/// <remarks>
/// <para>
/// The wire <see cref="Icon"/> record (carried on <see cref="Implementation"/>,
/// <see cref="ResourceLink"/>, and other descriptors) models the happy-path shape; the security
/// model lives here so it can be applied deliberately by a consumer that is about to render an
/// advertised icon.
/// </para>
/// <para>Security model (§14.2):</para>
/// <list type="bullet">
///   <item><description>Only <c>https:</c> URLs and <c>data:</c> URIs are accepted (R-14.2-o).</description></item>
///   <item><description><c>javascript:</c>, <c>file:</c>, <c>ftp:</c>, <c>ws:</c>, <c>http:</c> and other schemes are rejected (R-14.2-n).</description></item>
///   <item><description>The MIME type is detected from magic bytes, never trusted from the declared type (R-14.2-s).</description></item>
///   <item><description>Only image types on the allowlist are rendered (R-14.2-u).</description></item>
///   <item><description>A fetch is credential-free and refuses cross-origin / scheme-change redirects (R-14.2-p, R-14.2-q).</description></item>
/// </list>
/// </remarks>
public static partial class IconSecurity
{
  /// <summary>
  /// The MIME types a consumer MUST support when rendering icons (R-14.2-l, AC-20.19). Includes
  /// the <c>image/jpg</c> spelling alongside the canonical <c>image/jpeg</c> for interoperability.
  /// </summary>
  public static IReadOnlySet<string> RequiredImageTypes { get; } =
    new HashSet<string>(StringComparer.Ordinal) { "image/png", "image/jpeg", "image/jpg" };

  /// <summary>The MIME types a consumer SHOULD additionally support (R-14.2-m, AC-20.20).</summary>
  public static IReadOnlySet<string> RecommendedImageTypes { get; } =
    new HashSet<string>(StringComparer.Ordinal) { "image/svg+xml", "image/webp" };

  /// <summary>The default allowlist: the union of the required and recommended types (R-14.2-u).</summary>
  public static IReadOnlySet<string> DefaultImageAllowlist { get; } =
    new HashSet<string>(RequiredImageTypes.Concat(RecommendedImageTypes), StringComparer.Ordinal);

  /// <summary>
  /// Validates an icon <paramref name="src"/> URI against the §14.2 scheme rules.
  /// </summary>
  /// <remarks>
  /// A consumer MUST accept only <c>https:</c> URLs or <c>data:</c> URIs (R-14.2-o, AC-20.22) and
  /// MUST reject <c>javascript:</c>, <c>file:</c>, <c>ftp:</c>, <c>ws:</c>, and other unsafe schemes
  /// (R-14.2-n, AC-20.21). Note that <c>http:</c> is also rejected: R-14.2-o's stricter consumer
  /// rule supersedes the field description in R-14.2-d.
  /// </remarks>
  /// <param name="src">The icon source URI to validate.</param>
  /// <exception cref="IconValidationError">When the scheme is not <c>https:</c> or <c>data:</c>.</exception>
  public static void ValidateIconSrc(string src)
  {
    ArgumentNullException.ThrowIfNull(src);

    var colon = src.IndexOf(':');
    if (colon == -1)
    {
      throw new IconValidationError(src, "no URI scheme present");
    }

    // Include the trailing colon and lower-case to compare against the scheme literals, matching
    // the TypeScript reference (`src.slice(0, colon + 1).toLowerCase()`).
    var scheme = src[..(colon + 1)].ToLowerInvariant();
    if (scheme is not ("https:" or "data:"))
    {
      throw new IconValidationError(
        src,
        $"scheme '{scheme}' is not permitted; only https: and data: are accepted");
    }
  }

  /// <summary>Returns <c>true</c> when <paramref name="src"/> passes <see cref="ValidateIconSrc"/> without throwing (AC-20.21, AC-20.22).</summary>
  /// <param name="src">The icon source URI to test.</param>
  /// <returns><c>true</c> when the scheme is <c>https:</c> or <c>data:</c>; otherwise <c>false</c>.</returns>
  public static bool IsValidIconSrc(string src)
  {
    try
    {
      ValidateIconSrc(src);
      return true;
    }
    catch (IconValidationError)
    {
      return false;
    }
  }

  /// <summary>The magic-byte signatures for the supported raster image types (R-14.2-s, AC-20.26).</summary>
  private static readonly (string MimeType, byte[] Signature)[] MagicBytes =
  [
    ("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ("image/jpeg", [0xff, 0xd8, 0xff]),
    ("image/gif", [0x47, 0x49, 0x46]),
    ("image/webp", [0x52, 0x49, 0x46, 0x46]), // RIFF; the 'WEBP' tag at offset 8 is verified separately.
  ];

  /// <summary>The 'WEBP' tag (<c>0x57 0x45 0x42 0x50</c>) that follows the RIFF header at byte offset 8.</summary>
  private static readonly byte[] WebpTag = [0x57, 0x45, 0x42, 0x50];

  /// <summary>
  /// Detects the MIME type of an image from its magic bytes, treating the declared type as
  /// advisory only (R-14.2-s, AC-20.26).
  /// </summary>
  /// <param name="bytes">The candidate image bytes.</param>
  /// <returns>The detected MIME type, or <c>null</c> when no known signature matches.</returns>
  public static string? DetectMimeTypeFromMagicBytes(ReadOnlySpan<byte> bytes)
  {
    foreach (var (mimeType, signature) in MagicBytes)
    {
      if (!StartsWith(bytes, signature))
      {
        continue;
      }

      if (mimeType == "image/webp")
      {
        // The RIFF container header is shared by several formats; only a WEBP tag at offset 8
        // confirms a WebP image.
        if (bytes.Length < 8 + WebpTag.Length || !bytes.Slice(8, WebpTag.Length).SequenceEqual(WebpTag))
        {
          continue;
        }
      }

      return mimeType;
    }

    // SVG is XML-based and has no magic bytes — detect it from the leading text instead.
    if (bytes.Length >= 4)
    {
      var headLength = Math.Min(bytes.Length, 100);
      // Decode leniently: invalid UTF-8 sequences become replacement characters rather than throwing,
      // matching `new TextDecoder('utf-8', { fatal: false })`.
      var head = Encoding.UTF8.GetString(bytes[..headLength]);
      var trimmed = head.TrimStart().ToLowerInvariant();
      if (trimmed.StartsWith("<?xml", StringComparison.Ordinal) ||
          trimmed.StartsWith("<svg", StringComparison.Ordinal))
      {
        return "image/svg+xml";
      }
    }

    return null;
  }

  /// <summary>Returns <c>true</c> when <paramref name="bytes"/> begins with the byte sequence <paramref name="prefix"/>.</summary>
  private static bool StartsWith(ReadOnlySpan<byte> bytes, ReadOnlySpan<byte> prefix) =>
    bytes.Length >= prefix.Length && bytes[..prefix.Length].SequenceEqual(prefix);

  /// <summary>Normalises <c>image/jpg</c> to the canonical <c>image/jpeg</c> before comparison.</summary>
  private static string NormaliseMime(string type) => type == "image/jpg" ? "image/jpeg" : type;

  /// <summary>
  /// Validates an icon's byte content before rendering (R-14.2-r – R-14.2-u, AC-20.25–28).
  /// </summary>
  /// <remarks>
  /// <list type="number">
  ///   <item><description>Detects the actual MIME type from magic bytes, ignoring the declared type.</description></item>
  ///   <item><description>Rejects when the detected type is unknown.</description></item>
  ///   <item><description>When <paramref name="declaredMimeType"/> is provided, rejects on a mismatch.</description></item>
  ///   <item><description>Rejects a type outside the <paramref name="allowedTypes"/> set.</description></item>
  /// </list>
  /// </remarks>
  /// <param name="bytes">The candidate image bytes.</param>
  /// <param name="declaredMimeType">The advisory declared MIME type, if any.</param>
  /// <param name="allowedTypes">The permitted rendered types; defaults to <see cref="DefaultImageAllowlist"/>.</param>
  /// <returns>The MIME type detected from the magic bytes.</returns>
  /// <exception cref="IconValidationError">On an unknown type, a disallowed type, or a declared/detected mismatch.</exception>
  public static string ValidateIconBytes(
    ReadOnlySpan<byte> bytes,
    string? declaredMimeType = null,
    IReadOnlySet<string>? allowedTypes = null)
  {
    var allowed = allowedTypes ?? DefaultImageAllowlist;
    var detected = DetectMimeTypeFromMagicBytes(bytes);

    if (detected is null)
    {
      throw new IconValidationError("(bytes)", "unknown image type; cannot render");
    }

    if (!allowed.Contains(detected))
    {
      throw new IconValidationError("(bytes)", $"image type {detected} is not on the allowlist");
    }

    if (declaredMimeType is not null && NormaliseMime(detected) != NormaliseMime(declaredMimeType))
    {
      throw new IconValidationError(
        "(bytes)",
        $"MIME type mismatch: declared '{declaredMimeType}', detected '{detected}'");
    }

    // §14.2 hardening: SVG is XML and MAY embed active content (a <script> element, an inline event
    // handler, or a javascript: URI) that executes when rendered. An untrusted SVG carrying active
    // content cannot be rendered safely, so it is REFUSED rather than sanitized (stripping is error-prone
    // and a missed vector is a script-injection bug). Raster formats cannot carry script and pass through.
    if (detected == "image/svg+xml" && SvgHasActiveContent(Encoding.UTF8.GetString(bytes)))
    {
      throw new IconValidationError(
        "(bytes)", "SVG contains active content (a <script> element, an inline event handler, or a javascript: URI) and is refused");
    }

    return detected;
  }

  /// <summary>
  /// Returns <c>true</c> when an SVG document carries ACTIVE content that would execute on render — a
  /// <c>&lt;script&gt;</c> element, an inline <c>on…=</c> event-handler attribute, or a
  /// <c>javascript:</c> URI (§14.2 hardening). Such an SVG is refused by <see cref="ValidateIconBytes"/>.
  /// </summary>
  /// <param name="svg">The decoded SVG document text.</param>
  /// <returns><c>true</c> when active content is present.</returns>
  public static bool SvgHasActiveContent(string svg)
  {
    ArgumentNullException.ThrowIfNull(svg);
    return SvgActiveContentRegex().IsMatch(svg);
  }

  // Matches a <script> element, an inline event-handler attribute (on…=, e.g. onload=), or a
  // javascript: URI — case-insensitively. Deliberately conservative: any match refuses the SVG.
  [GeneratedRegex(@"<\s*script\b|javascript:|\son[a-z]+\s*=", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
  private static partial Regex SvgActiveContentRegex();

  /// <summary>
  /// Selects the most suitable icon from <paramref name="icons"/> for a target render size and optional
  /// theme (§14.2 icon selection). Icons whose <c>src</c> fails <see cref="IsValidIconSrc"/> are skipped.
  /// Preference order: an exact theme match outranks a theme-agnostic icon, which outranks a theme
  /// mismatch; then, among equal theme ranks, an icon declaring <c>any</c> (or no sizes — treated as
  /// scalable) or whose nearest declared dimension is the smallest that still meets or exceeds
  /// <paramref name="desiredSizePx"/> is preferred, falling back to the closest smaller size.
  /// </summary>
  /// <param name="icons">The advertised icons (for example <see cref="Implementation.Icons"/>).</param>
  /// <param name="desiredSizePx">The desired rendered size in pixels (the larger of width/height).</param>
  /// <param name="theme">The preferred background theme, or <c>null</c> when the caller has no preference.</param>
  /// <returns>The best-matching icon, or <c>null</c> when none has a usable <c>src</c>.</returns>
  public static Icon? SelectIcon(IReadOnlyList<Icon> icons, int desiredSizePx, IconTheme? theme = null)
  {
    ArgumentNullException.ThrowIfNull(icons);
    ArgumentOutOfRangeException.ThrowIfNegativeOrZero(desiredSizePx);

    Icon? best = null;
    (int ThemeRank, int FitScore) bestKey = default;
    foreach (var icon in icons)
    {
      if (!IsValidIconSrc(icon.Src)) continue;
      var key = (ThemeRank: ThemeRank(icon.Theme, theme), FitScore: BestFitScore(icon.Sizes, desiredSizePx));
      if (best is null || key.CompareTo(bestKey) > 0)
      {
        best = icon;
        bestKey = key;
      }
    }
    return best;
  }

  /// <summary>Ranks an icon's theme against the desired theme: exact match (2) &gt; theme-agnostic (1) &gt; mismatch (0).</summary>
  private static int ThemeRank(IconTheme? iconTheme, IconTheme? desired)
  {
    if (desired is null || iconTheme is null) return 1; // no preference, or a theme-agnostic icon.
    return iconTheme == desired ? 2 : 0;
  }

  /// <summary>
  /// Scores how well an icon's declared <c>sizes</c> fit <paramref name="desired"/> (higher is better):
  /// <c>any</c>/absent sizes are scalable (perfect fit, 0); a dimension at or above the desired size scores
  /// by how little it overshoots; a too-small dimension is heavily penalized but still ordered by closeness.
  /// </summary>
  private static int BestFitScore(IReadOnlyList<string>? sizes, int desired)
  {
    if (sizes is null || sizes.Count == 0) return 0; // no declared sizes ⇒ treat as scalable.
    var best = int.MinValue;
    foreach (var size in sizes)
    {
      var dimension = ParseLargestDimension(size);
      var score = dimension switch
      {
        null => 0,                                   // "any" ⇒ scalable, perfect fit.
        >= 0 when dimension >= desired => -(dimension.Value - desired),
        _ => -(desired - dimension.Value) - 1_000_000, // too small ⇒ heavy penalty, ordered by closeness.
      };
      if (score > best) best = score;
    }
    return best == int.MinValue ? 0 : best;
  }

  /// <summary>Parses an icon size specifier — <c>"WxH"</c> ⇒ <c>max(W, H)</c>, the literal <c>"any"</c> ⇒ <c>null</c> (scalable).</summary>
  private static int? ParseLargestDimension(string size)
  {
    if (string.Equals(size, "any", StringComparison.OrdinalIgnoreCase)) return null;
    var x = size.IndexOf('x', StringComparison.OrdinalIgnoreCase);
    if (x <= 0 || x >= size.Length - 1) return 0; // malformed ⇒ treated as a 0-dimension (worst sized).
    return int.TryParse(size[..x], out var w) && int.TryParse(size[(x + 1)..], out var h) ? Math.Max(w, h) : 0;
  }

  /// <summary>
  /// Securely fetches and validates an icon, enforcing the §14.2 transport rules.
  /// </summary>
  /// <remarks>
  /// <para>Security rules enforced:</para>
  /// <list type="bullet">
  ///   <item><description><paramref name="src"/> MUST be <c>https:</c> or <c>data:</c> (R-14.2-o, via <see cref="ValidateIconSrc"/>).</description></item>
  ///   <item><description>Redirects are followed manually; a redirect that changes the scheme or moves to a different origin is rejected (R-14.2-p, TV-20.12).</description></item>
  ///   <item><description>The request is credential-free: no cookies and no <c>Authorization</c> header are ever sent (R-14.2-q, TV-20.13).</description></item>
  ///   <item><description>The returned bytes are validated against the allowlist by magic bytes, ignoring the declared type (R-14.2-r – R-14.2-u, via <see cref="ValidateIconBytes"/>).</description></item>
  /// </list>
  /// <para>
  /// Tests inject a custom <see cref="HttpMessageHandler"/> (or a pre-built <see cref="HttpClient"/>)
  /// so they never hit the network. A <c>data:</c> source carries its bytes inline and performs no
  /// request at all.
  /// </para>
  /// </remarks>
  /// <param name="src">The icon source — an <c>https:</c> URL or a <c>data:</c> URI.</param>
  /// <param name="options">Fetch options (HTTP client/handler injection, allowlist, redirect bound).</param>
  /// <param name="cancellationToken">A token to cancel the asynchronous fetch.</param>
  /// <returns>The validated bytes, detected MIME type, and final URL.</returns>
  /// <exception cref="IconValidationError">On a disallowed scheme, a cross-origin/scheme-change redirect, a non-2xx status, too many redirects, or invalid image bytes.</exception>
  public static async Task<FetchIconResult> FetchIconAsync(
    string src,
    FetchIconOptions? options = null,
    CancellationToken cancellationToken = default)
  {
    ValidateIconSrc(src); // R-14.2-o: only https: or data:
    options ??= new FetchIconOptions();
    var allowed = options.AllowedTypes ?? DefaultImageAllowlist;

    // `data:` icons carry their bytes inline — no network request, nothing to redirect.
    if (src.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
    {
      var inline = DecodeDataUri(src);
      return new FetchIconResult(inline, ValidateIconBytes(inline, null, allowed), src);
    }

    var origin = new Uri(src, UriKind.Absolute);

    // §14.2 hardening (opt-in): when a trusted-host allowlist is configured, the icon's host MUST be on it.
    // This lets a consumer restrict icons to first-party / known-CDN hosts and reject arbitrary origins.
    if (options.TrustedHosts is { } trusted && !trusted.Contains(origin.Host))
    {
      throw new IconValidationError(src, $"host '{origin.Host}' is not in the trusted-host allowlist");
    }

    var current = origin;
    var maxRedirects = options.MaxRedirects ?? 5;

    // A handler with automatic redirects disabled is required so we can inspect each hop's
    // Location and refuse cross-origin / scheme-change moves ourselves (R-14.2-p). The caller may
    // inject one for tests; otherwise build a non-redirecting default.
    var (client, ownsClient) = ResolveClient(options);
    try
    {
      for (var hop = 0; hop <= maxRedirects; hop++)
      {
        using var request = new HttpRequestMessage(HttpMethod.Get, current);
        // Credential-free request (R-14.2-q): never attach default credentials, cookies, or auth.
        request.Headers.Authorization = null;
        using var response = await client
          .SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken)
          .ConfigureAwait(false);

        if (IsRedirectStatus(response.StatusCode))
        {
          var location = response.Headers.Location;
          if (location is null)
          {
            throw new IconValidationError(src, $"redirect {(int)response.StatusCode} without a Location header");
          }

          var next = new Uri(current, location); // Resolve relative redirects against the current URL.
          if (!string.Equals(next.Scheme, origin.Scheme, StringComparison.OrdinalIgnoreCase))
          {
            throw new IconValidationError(
              src,
              $"refusing redirect with scheme change '{origin.Scheme}' → '{next.Scheme}'");
          }

          if (!OriginEquals(next, origin))
          {
            throw new IconValidationError(
              src,
              $"refusing cross-origin redirect '{OriginOf(origin)}' → '{OriginOf(next)}'");
          }

          current = next;
          continue;
        }

        if ((int)response.StatusCode is >= 200 and < 300)
        {
          var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
          return new FetchIconResult(bytes, ValidateIconBytes(bytes, null, allowed), current.ToString());
        }

        throw new IconValidationError(src, $"icon fetch failed with HTTP {(int)response.StatusCode}");
      }
    }
    finally
    {
      if (ownsClient)
      {
        client.Dispose();
      }
    }

    throw new IconValidationError(src, $"too many redirects (more than {maxRedirects})");
  }

  /// <summary>Resolves the <see cref="HttpClient"/> to fetch with, reporting whether the caller owns its lifetime.</summary>
  private static (HttpClient Client, bool OwnsClient) ResolveClient(FetchIconOptions options)
  {
    if (options.HttpClient is { } injected)
    {
      return (injected, false);
    }

    // Disable automatic redirect following so each hop is inspected and gated by our own rules.
    var handler = options.HttpMessageHandler ?? new HttpClientHandler
    {
      AllowAutoRedirect = false,
      UseCookies = false,
      UseDefaultCredentials = false,
      Credentials = null,
    };
    return (new HttpClient(handler, disposeHandler: options.HttpMessageHandler is null), OwnsClient: true);
  }

  /// <summary>Returns <c>true</c> for the HTTP status codes that denote a redirect.</summary>
  private static bool IsRedirectStatus(HttpStatusCode status) =>
    status is HttpStatusCode.MovedPermanently       // 301
      or HttpStatusCode.Found                        // 302
      or HttpStatusCode.SeeOther                     // 303
      or HttpStatusCode.TemporaryRedirect            // 307
      or HttpStatusCode.PermanentRedirect;           // 308

  /// <summary>Renders an absolute URI's scheme+authority origin (for example <c>https://example.com</c>).</summary>
  private static string OriginOf(Uri uri) => uri.GetLeftPart(UriPartial.Authority);

  /// <summary>Returns <c>true</c> when two absolute URIs share the same scheme, host, and port (same origin).</summary>
  private static bool OriginEquals(Uri a, Uri b) =>
    string.Equals(a.Scheme, b.Scheme, StringComparison.OrdinalIgnoreCase) &&
    string.Equals(a.Host, b.Host, StringComparison.OrdinalIgnoreCase) &&
    a.Port == b.Port;

  /// <summary>Decodes a <c>data:</c> URI's payload to bytes (Base64 or percent-encoded).</summary>
  private static byte[] DecodeDataUri(string uri)
  {
    var comma = uri.IndexOf(',');
    if (comma == -1)
    {
      throw new IconValidationError(uri, "malformed data: URI (missing comma)");
    }

    var meta = uri["data:".Length..comma];
    var payload = uri[(comma + 1)..];
    if (meta.EndsWith(";base64", StringComparison.OrdinalIgnoreCase))
    {
      try
      {
        return Convert.FromBase64String(payload);
      }
      catch (FormatException)
      {
        throw new IconValidationError(uri, "malformed data: URI (invalid base64 payload)");
      }
    }

    return Encoding.UTF8.GetBytes(Uri.UnescapeDataString(payload));
  }
}

/// <summary>An error raised when an icon URI or its content is rejected for security reasons (§14.2).</summary>
public sealed class IconValidationError : Exception
{
  /// <summary>The rejected icon source (a URI, or the placeholder <c>(bytes)</c> for content validation).</summary>
  public string Src { get; }

  /// <summary>Creates an <see cref="IconValidationError"/> with a human-readable rejection reason.</summary>
  /// <param name="src">The rejected source or the <c>(bytes)</c> placeholder.</param>
  /// <param name="reason">A short description of why the icon was rejected.</param>
  public IconValidationError(string src, string reason)
    : base($"Icon rejected ({reason}): {src}")
  {
    Src = src;
  }
}

/// <summary>The result of <see cref="IconSecurity.FetchIconAsync"/>: the validated bytes, detected type, and final URL.</summary>
/// <param name="Bytes">The fetched image bytes.</param>
/// <param name="MimeType">The MIME type detected from the magic bytes (R-14.2-s).</param>
/// <param name="FinalUrl">The URL the bytes were ultimately read from (same origin as the source).</param>
public sealed record FetchIconResult(byte[] Bytes, string MimeType, string FinalUrl);

/// <summary>Options for <see cref="IconSecurity.FetchIconAsync"/>.</summary>
public sealed record FetchIconOptions
{
  /// <summary>
  /// An explicit <see cref="HttpClient"/> to fetch with. When set, it is used as-is and never
  /// disposed by the SDK; the caller is responsible for configuring it to <em>not</em> follow
  /// redirects automatically (so the cross-origin / scheme-change gate can run on each hop).
  /// </summary>
  public HttpClient? HttpClient { get; init; }

  /// <summary>
  /// An <see cref="HttpMessageHandler"/> to build a one-shot <see cref="System.Net.Http.HttpClient"/>
  /// around (an injection point for tests). Ignored when <see cref="HttpClient"/> is set; it is not
  /// disposed by the SDK so a test handler can be reused across calls.
  /// </summary>
  public HttpMessageHandler? HttpMessageHandler { get; init; }

  /// <summary>The allowed rendered MIME types; defaults to <see cref="IconSecurity.DefaultImageAllowlist"/>.</summary>
  public IReadOnlySet<string>? AllowedTypes { get; init; }

  /// <summary>The maximum number of same-origin redirects to follow before giving up; defaults to 5.</summary>
  public int? MaxRedirects { get; init; }

  /// <summary>
  /// An OPTIONAL allowlist of trusted hosts (§14.2 hardening). When set, an <c>https:</c> icon whose host
  /// is not on the list is refused before any request is made; <c>null</c> (the default) permits any host
  /// that passes the scheme and same-origin-redirect rules. Hosts are matched case-sensitively on
  /// <see cref="Uri.Host"/>.
  /// </summary>
  public IReadOnlySet<string>? TrustedHosts { get; init; }
}
