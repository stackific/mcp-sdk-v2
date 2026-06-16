using System.Net;
using System.Net.Http.Headers;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Icon security validation and the credential-free secure fetch (spec §14.2): scheme allowlisting,
/// magic-byte MIME detection, content validation, and redirect/credential protection. Mirrors the
/// TypeScript <c>icon.test.ts</c> and <c>icon-fetch.test.ts</c> suites.
/// </summary>
public sealed class IconTests
{
  /// <summary>A valid PNG header — the magic bytes are sufficient for <see cref="IconSecurity.ValidateIconBytes"/>.</summary>
  private static readonly byte[] PngBytes =
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];

  // ----- validateIconSrc — scheme security (AC-20.21, AC-20.22) -----

  [Theory]
  [InlineData("https://example.com/icon.png")]
  [InlineData("data:image/png;base64,iVBORw0KGgo=")]
  public void Validate_icon_src_accepts_https_and_data(string src)
  {
    var exception = Record.Exception(() => IconSecurity.ValidateIconSrc(src));
    Assert.Null(exception);
  }

  [Theory]
  [InlineData("javascript:alert(1)")]
  [InlineData("file:///etc/passwd")]
  [InlineData("ftp://example.com/icon.png")]
  [InlineData("ws://example.com/socket")]
  [InlineData("http://example.com/icon.png")] // stricter R-14.2-o overrides R-14.2-d
  [InlineData("/relative/path.png")]          // no scheme
  public void Validate_icon_src_rejects_unsafe_or_missing_schemes(string src)
  {
    Assert.Throws<IconValidationError>(() => IconSecurity.ValidateIconSrc(src));
  }

  [Theory]
  [InlineData("https://example.com/icon.png", true)]
  [InlineData("data:image/png;base64,abc", true)]
  [InlineData("javascript:void(0)", false)]
  [InlineData("file:///etc/passwd", false)]
  public void Is_valid_icon_src_reports_scheme_safety(string src, bool expected) =>
    Assert.Equal(expected, IconSecurity.IsValidIconSrc(src));

  // ----- detectMimeTypeFromMagicBytes (AC-20.26 — R-14.2-s) -----

  [Fact]
  public void Detect_mime_type_detects_png()
  {
    byte[] png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
    Assert.Equal("image/png", IconSecurity.DetectMimeTypeFromMagicBytes(png));
  }

  [Fact]
  public void Detect_mime_type_detects_jpeg()
  {
    byte[] jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
    Assert.Equal("image/jpeg", IconSecurity.DetectMimeTypeFromMagicBytes(jpeg));
  }

  [Fact]
  public void Detect_mime_type_detects_webp_only_with_the_webp_tag()
  {
    // RIFF header + 'WEBP' tag at offset 8.
    byte[] webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    Assert.Equal("image/webp", IconSecurity.DetectMimeTypeFromMagicBytes(webp));

    // RIFF header WITHOUT the WEBP tag (e.g. a WAV) is not a WebP image.
    byte[] riffNotWebp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
    Assert.Null(IconSecurity.DetectMimeTypeFromMagicBytes(riffNotWebp));
  }

  [Theory]
  [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")]
  [InlineData("<?xml version=\"1.0\"?><svg></svg>")]
  [InlineData("   \n  <svg></svg>")] // leading whitespace is trimmed
  public void Detect_mime_type_detects_svg_from_leading_text(string svg)
  {
    var bytes = System.Text.Encoding.UTF8.GetBytes(svg);
    Assert.Equal("image/svg+xml", IconSecurity.DetectMimeTypeFromMagicBytes(bytes));
  }

  [Fact]
  public void Detect_mime_type_returns_null_for_unknown_bytes()
  {
    byte[] unknown = [0x00, 0x01, 0x02, 0x03];
    Assert.Null(IconSecurity.DetectMimeTypeFromMagicBytes(unknown));
  }

  // ----- validateIconBytes (AC-20.25–AC-20.28) -----

  [Fact]
  public void Validate_icon_bytes_returns_detected_type_for_valid_png()
  {
    Assert.Equal("image/png", IconSecurity.ValidateIconBytes(PngBytes));
  }

  [Fact]
  public void Validate_icon_bytes_accepts_matching_declared_type()
  {
    var exception = Record.Exception(() => IconSecurity.ValidateIconBytes(PngBytes, "image/png"));
    Assert.Null(exception);
  }

  [Fact]
  public void Validate_icon_bytes_rejects_a_declared_detected_mismatch()
  {
    Assert.Throws<IconValidationError>(() => IconSecurity.ValidateIconBytes(PngBytes, "image/jpeg"));
  }

  [Fact]
  public void Validate_icon_bytes_rejects_unknown_content()
  {
    byte[] unknown = [0x00, 0x01, 0x02, 0x03];
    Assert.Throws<IconValidationError>(() => IconSecurity.ValidateIconBytes(unknown));
  }

  [Fact]
  public void Validate_icon_bytes_rejects_a_type_outside_the_allowlist()
  {
    // PNG is detected but not on the restricted allowlist.
    var restricted = new HashSet<string>(StringComparer.Ordinal) { "image/jpeg" };
    Assert.Throws<IconValidationError>(() => IconSecurity.ValidateIconBytes(PngBytes, null, restricted));
  }

  [Fact]
  public void Validate_icon_bytes_normalises_jpg_to_jpeg()
  {
    byte[] jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
    // Declared as image/jpg, detected as image/jpeg — normalisation makes them equal.
    var exception = Record.Exception(() => IconSecurity.ValidateIconBytes(jpeg, "image/jpg"));
    Assert.Null(exception);
  }

  // ----- MIME type support constants (AC-20.19, AC-20.20) -----

  [Fact]
  public void Required_types_include_png_and_jpeg()
  {
    Assert.Contains("image/png", IconSecurity.RequiredImageTypes);
    Assert.Contains("image/jpeg", IconSecurity.RequiredImageTypes);
  }

  [Fact]
  public void Recommended_types_include_svg_and_webp()
  {
    Assert.Contains("image/svg+xml", IconSecurity.RecommendedImageTypes);
    Assert.Contains("image/webp", IconSecurity.RecommendedImageTypes);
  }

  [Fact]
  public void Default_allowlist_contains_all_required_and_recommended_types()
  {
    foreach (var t in IconSecurity.RequiredImageTypes)
    {
      Assert.Contains(t, IconSecurity.DefaultImageAllowlist);
    }

    foreach (var t in IconSecurity.RecommendedImageTypes)
    {
      Assert.Contains(t, IconSecurity.DefaultImageAllowlist);
    }
  }

  // ----- fetchIcon — data: URIs (no network) -----

  [Fact]
  public async Task Fetch_icon_decodes_and_validates_a_data_uri_without_a_request()
  {
    var base64 = Convert.ToBase64String(PngBytes);
    var handler = new ScriptedHandler(_ => throw new InvalidOperationException("must not perform a request"));

    var result = await IconSecurity.FetchIconAsync(
      $"data:image/png;base64,{base64}",
      new FetchIconOptions { HttpMessageHandler = handler });

    Assert.Equal("image/png", result.MimeType);
    Assert.Equal(PngBytes, result.Bytes);
  }

  // ----- fetchIcon — scheme gating (R-14.2-o) -----

  [Fact]
  public async Task Fetch_icon_rejects_a_non_https_data_scheme_without_fetching()
  {
    var handler = new ScriptedHandler(_ => throw new InvalidOperationException("must not perform a request"));

    await Assert.ThrowsAsync<IconValidationError>(() =>
      IconSecurity.FetchIconAsync(
        "http://example.com/icon.png",
        new FetchIconOptions { HttpMessageHandler = handler }));
  }

  // ----- fetchIcon — redirect protection (R-14.2-p, TV-20.12) -----

  [Fact]
  public async Task Fetch_icon_refuses_a_cross_origin_redirect()
  {
    var seen = new List<string>();
    var handler = new ScriptedHandler(request =>
    {
      var url = request.RequestUri!.ToString();
      seen.Add(url);
      return url == "https://example.com/icon.png"
        ? RedirectResponse("https://evil.example/icon.png")
        : PngResponse();
    });

    await Assert.ThrowsAsync<IconValidationError>(() =>
      IconSecurity.FetchIconAsync(
        "https://example.com/icon.png",
        new FetchIconOptions { HttpMessageHandler = handler }));

    Assert.DoesNotContain("https://evil.example/icon.png", seen);
  }

  [Fact]
  public async Task Fetch_icon_refuses_a_scheme_change_redirect()
  {
    var handler = new ScriptedHandler(_ => RedirectResponse("http://example.com/icon.png"));

    var error = await Assert.ThrowsAsync<IconValidationError>(() =>
      IconSecurity.FetchIconAsync(
        "https://example.com/icon.png",
        new FetchIconOptions { HttpMessageHandler = handler }));

    Assert.Contains("scheme change", error.Message, StringComparison.OrdinalIgnoreCase);
  }

  [Fact]
  public async Task Fetch_icon_follows_a_same_origin_redirect_and_returns_validated_bytes()
  {
    var handler = new ScriptedHandler(request =>
      request.RequestUri!.ToString() == "https://example.com/icon.png"
        ? RedirectResponse("https://example.com/real.png")
        : PngResponse());

    var result = await IconSecurity.FetchIconAsync(
      "https://example.com/icon.png",
      new FetchIconOptions { HttpMessageHandler = handler });

    Assert.Equal("image/png", result.MimeType);
    Assert.Equal("https://example.com/real.png", result.FinalUrl);
  }

  [Fact]
  public async Task Fetch_icon_gives_up_after_too_many_redirects()
  {
    // Always redirect (same origin) so the redirect bound is the only stop condition.
    var handler = new ScriptedHandler(_ => RedirectResponse("https://example.com/again.png"));

    await Assert.ThrowsAsync<IconValidationError>(() =>
      IconSecurity.FetchIconAsync(
        "https://example.com/icon.png",
        new FetchIconOptions { HttpMessageHandler = handler, MaxRedirects = 2 }));
  }

  // ----- fetchIcon — credential-free request (R-14.2-q, TV-20.13) -----

  [Fact]
  public async Task Fetch_icon_sends_no_authorization_or_cookie_header()
  {
    HttpRequestMessage? seen = null;
    var handler = new ScriptedHandler(request =>
    {
      seen = request;
      return PngResponse();
    });

    await IconSecurity.FetchIconAsync(
      "https://example.com/icon.png",
      new FetchIconOptions { HttpMessageHandler = handler });

    Assert.NotNull(seen);
    Assert.Null(seen!.Headers.Authorization);
    Assert.False(seen.Headers.Contains("Cookie"));
  }

  // ----- fetchIcon — invalid content is rejected after fetch (R-14.2-r..u) -----

  [Fact]
  public async Task Fetch_icon_rejects_unknown_bytes_after_a_successful_response()
  {
    var handler = new ScriptedHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
    {
      Content = new ByteArrayContent([0x00, 0x01, 0x02, 0x03]),
    });

    await Assert.ThrowsAsync<IconValidationError>(() =>
      IconSecurity.FetchIconAsync(
        "https://example.com/icon.png",
        new FetchIconOptions { HttpMessageHandler = handler }));
  }

  [Fact]
  public async Task Fetch_icon_rejects_a_non_2xx_status()
  {
    var handler = new ScriptedHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

    await Assert.ThrowsAsync<IconValidationError>(() =>
      IconSecurity.FetchIconAsync(
        "https://example.com/icon.png",
        new FetchIconOptions { HttpMessageHandler = handler }));
  }

  // ----- Test helpers -----

  private static HttpResponseMessage PngResponse()
  {
    var response = new HttpResponseMessage(HttpStatusCode.OK)
    {
      Content = new ByteArrayContent(PngBytes),
    };
    response.Content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
    return response;
  }

  private static HttpResponseMessage RedirectResponse(string location, HttpStatusCode status = HttpStatusCode.Found)
  {
    var response = new HttpResponseMessage(status);
    response.Headers.Location = new Uri(location);
    return response;
  }

  /// <summary>A test <see cref="HttpMessageHandler"/> that answers each request from a script, never the network.</summary>
  private sealed class ScriptedHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
  {
    protected override Task<HttpResponseMessage> SendAsync(
      HttpRequestMessage request,
      CancellationToken cancellationToken) =>
      Task.FromResult(respond(request));
  }

  // ----- §14.2 hardening: active-SVG refusal -----

  [Theory]
  [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>")]
  [InlineData("<svg onload=\"steal()\"></svg>")]
  [InlineData("<svg><a href=\"javascript:evil()\">x</a></svg>")]
  public void Validate_icon_bytes_refuses_an_svg_with_active_content(string svg)
  {
    var bytes = System.Text.Encoding.UTF8.GetBytes(svg);
    Assert.Throws<IconValidationError>(() => IconSecurity.ValidateIconBytes(bytes));
  }

  [Fact]
  public void Validate_icon_bytes_accepts_a_benign_svg()
  {
    var bytes = System.Text.Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"4\" height=\"4\"/></svg>");
    Assert.Equal("image/svg+xml", IconSecurity.ValidateIconBytes(bytes));
  }

  // ----- §14.2 hardening: trusted-host allowlist -----

  [Fact]
  public async Task Fetch_icon_refuses_a_host_outside_the_trusted_allowlist()
  {
    // The trusted-host gate runs before any request, so this never touches the network.
    var options = new FetchIconOptions { TrustedHosts = new HashSet<string>(StringComparer.Ordinal) { "cdn.good.example" } };
    await Assert.ThrowsAsync<IconValidationError>(() => IconSecurity.FetchIconAsync("https://evil.example/icon.png", options));
  }

  // ----- §14.2: icon selection by size + theme -----

  [Fact]
  public void Select_icon_prefers_the_smallest_size_at_or_above_the_target()
  {
    var icons = new[]
    {
      new Icon { Src = "https://e/16.png", Sizes = ["16x16"] },
      new Icon { Src = "https://e/48.png", Sizes = ["48x48"] },
      new Icon { Src = "https://e/256.png", Sizes = ["256x256"] },
    };
    var chosen = IconSecurity.SelectIcon(icons, desiredSizePx: 32);
    Assert.Equal("https://e/48.png", chosen!.Src); // 48 is the smallest that meets/exceeds 32.
  }

  [Fact]
  public void Select_icon_prefers_an_exact_theme_match()
  {
    var icons = new[]
    {
      new Icon { Src = "https://e/light.png", Sizes = ["48x48"], Theme = IconTheme.Light },
      new Icon { Src = "https://e/dark.png", Sizes = ["48x48"], Theme = IconTheme.Dark },
    };
    var chosen = IconSecurity.SelectIcon(icons, desiredSizePx: 48, theme: IconTheme.Dark);
    Assert.Equal("https://e/dark.png", chosen!.Src);
  }

  [Fact]
  public void Select_icon_skips_unsafe_sources_and_returns_null_when_none_usable()
  {
    var icons = new[] { new Icon { Src = "javascript:alert(1)", Sizes = ["48x48"] } };
    Assert.Null(IconSecurity.SelectIcon(icons, desiredSizePx: 48));
  }
}
