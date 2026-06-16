"""Tests for Icon validation: schema, src security, magic-byte detection, and the secure
fetch (§14.2). Mirrors ts-sdk/src/__tests__/types/icon.test.ts and icon-fetch.test.ts."""

import pytest

from mcp.types.icon import (
  DEFAULT_IMAGE_ALLOWLIST,
  RECOMMENDED_IMAGE_TYPES,
  REQUIRED_IMAGE_TYPES,
  FetchIconResult,
  IconValidationError,
  detect_mime_type_from_magic_bytes,
  fetch_icon,
  is_redirect_status,
  is_valid_icon,
  is_valid_icon_src,
  is_valid_icons,
  validate_icon_bytes,
  validate_icon_src,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
JPEG = b"\xff\xd8\xff" + b"\x00" * 8
GIF = b"GIF89a" + b"\x00" * 8
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8
SVG = b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"

# A valid PNG header is enough for validate_icon_bytes (magic bytes only).
PNG_HEADER = b"\x89PNG\r\n\x1a\n\x00\x00"


class TestIconSchema:
  def test_minimal(self):
    assert is_valid_icon({"src": "https://example.com/i.png"})

  def test_full(self):
    assert is_valid_icon({"src": "data:image/png;base64,aGk=", "mimeType": "image/png", "sizes": ["48x48", "any"], "theme": "dark"})

  # AC-20.10 (R-14.2-c) — src required
  def test_src_required(self):
    assert not is_valid_icon({"mimeType": "image/png"})
    assert not is_valid_icon({"src": 1})

  # AC-20.14 (R-14.2-g) — mimeType optional
  def test_optional_mime_type(self):
    assert is_valid_icon({"src": "https://example.com/i.png", "mimeType": "image/png"})

  # AC-20.15 (R-14.2-h) — sizes optional; WxH or "any"
  def test_sizes_wxh(self):
    assert is_valid_icon({"src": "https://example.com/i.png", "sizes": ["48x48", "96x96"]})

  def test_sizes_any(self):
    assert is_valid_icon({"src": "https://example.com/i.svg", "sizes": ["any"]})

  def test_bad_size_rejected(self):
    assert not is_valid_icon({"src": "https://x.com/i.png", "sizes": ["bad"]})

  # AC-20.17 (R-14.2-j) — theme optional; only light/dark
  def test_theme_light(self):
    assert is_valid_icon({"src": "https://x.com/i.png", "theme": "light"})

  def test_theme_dark(self):
    assert is_valid_icon({"src": "https://x.com/i.png", "theme": "dark"})

  # AC-20.1 (R-14-a) — theme enum is case-sensitive
  def test_theme_case_sensitive(self):
    assert not is_valid_icon({"src": "https://x.com/i.png", "theme": "Light"})

  def test_theme_unknown_rejected(self):
    assert not is_valid_icon({"src": "https://x.com/i.png", "theme": "auto"})
    assert not is_valid_icon({"src": "x", "theme": "blue"})

  def test_non_object(self):
    assert not is_valid_icon({})
    assert not is_valid_icon("nope")

  # AC-20.2 (R-14-b) — a reserved `_meta` member is accepted (tolerated extra key)
  def test_meta_is_accepted(self):
    assert is_valid_icon(
      {"src": "https://x.com/i.png", "_meta": {"example.com/category": "analytics"}}
    )


class TestIconsMixin:
  """IconsSchema — optional icons array (AC-20.9 — R-14.2-b, R-14.2-v)."""

  def test_absent_icons_array(self):
    assert is_valid_icons({})

  def test_empty_icons_array(self):
    assert is_valid_icons({"icons": []})

  def test_valid_icon_entries(self):
    assert is_valid_icons({"icons": [{"src": "https://example.com/icon.png"}]})

  def test_invalid_icon_entry_rejected(self):
    assert not is_valid_icons({"icons": [{"mimeType": "image/png"}]})  # missing src

  def test_icons_not_a_list(self):
    assert not is_valid_icons({"icons": "https://x/y"})

  def test_non_object(self):
    assert not is_valid_icons("nope")


class TestSrcSecurity:
  # AC-20.22 (R-14.2-o) — only https: and data: accepted
  def test_https_and_data_allowed(self):
    validate_icon_src("https://example.com/i.png")
    validate_icon_src("data:image/png;base64,aGk=")
    assert is_valid_icon_src("https://x/y") and is_valid_icon_src("data:,abc")

  # AC-20.21 (R-14.2-n) — unsafe schemes rejected; http: also rejected (R-14.2-o stricter)
  def test_unsafe_schemes_rejected(self):
    for src in ("http://x/y", "javascript:alert(1)", "file:///etc/passwd", "ftp://x/y", "ws://x"):
      assert not is_valid_icon_src(src)
      with pytest.raises(IconValidationError):
        validate_icon_src(src)

  def test_no_scheme_rejected(self):
    assert not is_valid_icon_src("/relative/path.png")
    with pytest.raises(IconValidationError):
      validate_icon_src("/relative/path.png")


class TestMagicBytes:
  # AC-20.26 (R-14.2-s) — magic bytes govern, not declared type
  def test_detects_known_types(self):
    assert detect_mime_type_from_magic_bytes(PNG) == "image/png"
    assert detect_mime_type_from_magic_bytes(JPEG) == "image/jpeg"
    assert detect_mime_type_from_magic_bytes(GIF) == "image/gif"
    assert detect_mime_type_from_magic_bytes(WEBP) == "image/webp"
    assert detect_mime_type_from_magic_bytes(SVG) == "image/svg+xml"

  def test_detects_svg_with_xml_declaration(self):
    assert detect_mime_type_from_magic_bytes(b"<?xml version='1.0'?><svg></svg>") == "image/svg+xml"

  def test_webp_requires_webp_tag(self):
    riff_not_webp = b"RIFF\x00\x00\x00\x00AVI " + b"\x00" * 8
    assert detect_mime_type_from_magic_bytes(riff_not_webp) is None

  def test_unknown(self):
    assert detect_mime_type_from_magic_bytes(b"\x00\x01\x02\x03") is None


class TestValidateBytes:
  # AC-20.25 (R-14.2-r) — returns detected type for valid bytes
  def test_allowlisted_ok(self):
    assert validate_icon_bytes(PNG) == "image/png"

  def test_matching_declared_ok(self):
    assert validate_icon_bytes(PNG, "image/png") == "image/png"

  # AC-20.28 (R-14.2-u) — type outside allowlist rejected
  def test_detected_not_on_allowlist(self):
    with pytest.raises(IconValidationError):
      validate_icon_bytes(GIF)  # gif detected but not in DEFAULT_IMAGE_ALLOWLIST

  def test_custom_restricted_allowlist(self):
    with pytest.raises(IconValidationError):
      validate_icon_bytes(PNG, None, {"image/jpeg"})  # png detected, not on the restricted list

  # AC-20.27 (R-14.2-t) — unknown / mismatched type rejected
  def test_unknown_rejected(self):
    with pytest.raises(IconValidationError):
      validate_icon_bytes(b"\x00\x01\x02\x03")

  def test_declared_mismatch_rejected(self):
    with pytest.raises(IconValidationError):
      validate_icon_bytes(PNG, declared_mime_type="image/webp")
    with pytest.raises(IconValidationError):
      validate_icon_bytes(PNG, declared_mime_type="image/jpeg")

  def test_jpg_normalises_to_jpeg(self):
    assert validate_icon_bytes(JPEG, declared_mime_type="image/jpg") == "image/jpeg"


class TestMimeConstants:
  # AC-20.19 (R-14.2-l) — required types
  def test_required_types(self):
    assert "image/png" in REQUIRED_IMAGE_TYPES
    assert "image/jpeg" in REQUIRED_IMAGE_TYPES

  # AC-20.20 (R-14.2-m) — recommended types
  def test_recommended_types(self):
    assert "image/svg+xml" in RECOMMENDED_IMAGE_TYPES
    assert "image/webp" in RECOMMENDED_IMAGE_TYPES

  def test_default_allowlist_membership(self):
    for t in REQUIRED_IMAGE_TYPES:
      assert t in DEFAULT_IMAGE_ALLOWLIST
    for t in RECOMMENDED_IMAGE_TYPES:
      assert t in DEFAULT_IMAGE_ALLOWLIST
    assert "image/gif" not in DEFAULT_IMAGE_ALLOWLIST


# ─── Secure icon fetch (mirrors icon-fetch.test.ts) ───────────────────────────


class _FakeResponse:
  """A minimal stand-in for httpx.Response satisfying the FetchResponse protocol."""

  def __init__(self, status_code: int, *, content: bytes = b"", headers: dict | None = None):
    self.status_code = status_code
    self.content = content
    self.headers = headers or {}


def _png_response() -> _FakeResponse:
  return _FakeResponse(200, content=PNG_HEADER, headers={"content-type": "image/png"})


def _redirect_to(location: str, status: int = 302) -> _FakeResponse:
  return _FakeResponse(status, headers={"location": location})


class TestRedirectStatus:
  def test_redirect_statuses(self):
    for s in (301, 302, 303, 307, 308):
      assert is_redirect_status(s)

  def test_non_redirect_statuses(self):
    for s in (200, 204, 400, 404, 500):
      assert not is_redirect_status(s)


class TestFetchIconDataUri:
  def test_base64_data_uri_decoded_without_network(self):
    import base64 as _b64

    uri = "data:image/png;base64," + _b64.b64encode(PNG_HEADER).decode()
    result = fetch_icon(uri, fetch=_unreachable_fetch)
    assert isinstance(result, FetchIconResult)
    assert result.mime_type == "image/png"
    assert result.final_url == uri
    assert result.bytes == PNG_HEADER

  def test_malformed_data_uri_rejected(self):
    with pytest.raises(IconValidationError):
      fetch_icon("data:image/png;base64", fetch=_unreachable_fetch)  # no comma


def _unreachable_fetch(url: str):  # pragma: no cover - asserts no network for data: URIs
  raise AssertionError(f"fetch must not be called for data: URIs (got {url})")


class TestFetchIconRedirectProtection:
  # R-14.2-p / TV-20.12 — refuse cross-origin redirect
  def test_refuses_cross_origin_redirect(self):
    calls: list[str] = []

    def fake_fetch(url: str):
      calls.append(url)
      if url == "https://example.com/icon.png":
        return _redirect_to("https://evil.example/icon.png")
      return _png_response()

    with pytest.raises(IconValidationError):
      fetch_icon("https://example.com/icon.png", fetch=fake_fetch)
    assert "https://evil.example/icon.png" not in calls

  # R-14.2-p — refuse scheme-change redirect (https → http)
  def test_refuses_scheme_change_redirect(self):
    def fake_fetch(url: str):
      return _redirect_to("http://example.com/icon.png")

    with pytest.raises(IconValidationError, match="scheme change"):
      fetch_icon("https://example.com/icon.png", fetch=fake_fetch)

  def test_follows_same_origin_redirect(self):
    def fake_fetch(url: str):
      if url == "https://example.com/icon.png":
        return _redirect_to("https://example.com/real.png")
      return _png_response()

    result = fetch_icon("https://example.com/icon.png", fetch=fake_fetch)
    assert result.mime_type == "image/png"
    assert result.final_url == "https://example.com/real.png"

  def test_relative_redirect_location_resolved_same_origin(self):
    def fake_fetch(url: str):
      if url == "https://example.com/a/icon.png":
        return _redirect_to("/b/real.png")
      return _png_response()

    result = fetch_icon("https://example.com/a/icon.png", fetch=fake_fetch)
    assert result.final_url == "https://example.com/b/real.png"

  def test_redirect_without_location_rejected(self):
    def fake_fetch(url: str):
      return _FakeResponse(302, headers={})

    with pytest.raises(IconValidationError, match="Location"):
      fetch_icon("https://example.com/icon.png", fetch=fake_fetch)

  def test_too_many_redirects_rejected(self):
    def fake_fetch(url: str):
      # An endless same-origin redirect loop.
      return _redirect_to("https://example.com/next.png")

    with pytest.raises(IconValidationError, match="too many redirects"):
      fetch_icon("https://example.com/icon.png", fetch=fake_fetch, max_redirects=3)


class TestFetchIconStatus:
  def test_non_2xx_rejected(self):
    def fake_fetch(url: str):
      return _FakeResponse(404)

    with pytest.raises(IconValidationError, match="HTTP 404"):
      fetch_icon("https://example.com/icon.png", fetch=fake_fetch)

  def test_success_returns_validated_bytes(self):
    result = fetch_icon("https://example.com/icon.png", fetch=lambda url: _png_response())
    assert result.bytes == PNG_HEADER
    assert result.mime_type == "image/png"
    assert result.final_url == "https://example.com/icon.png"

  def test_unknown_image_bytes_rejected(self):
    def fake_fetch(url: str):
      return _FakeResponse(200, content=b"\x00\x01\x02\x03")

    with pytest.raises(IconValidationError):
      fetch_icon("https://example.com/icon.png", fetch=fake_fetch)


class TestFetchIconCredentialFree:
  # R-14.2-q / TV-20.13 — the default fetcher sends no credentials or auth/cookie headers.
  def test_default_fetcher_is_credential_free(self, monkeypatch):
    import httpx

    seen: dict = {}

    def fake_get(url, **kwargs):
      seen["url"] = url
      seen["kwargs"] = kwargs
      return _png_response()

    monkeypatch.setattr(httpx, "get", fake_get)
    result = fetch_icon("https://example.com/icon.png")  # default fetcher
    assert result.mime_type == "image/png"
    # No auto-redirect following (we vet redirects ourselves — R-14.2-p).
    assert seen["kwargs"].get("follow_redirects") is False
    # No Authorization / Cookie header is ever supplied (R-14.2-q).
    headers = seen["kwargs"].get("headers", {})
    lowered = {k.lower() for k in headers}
    assert "authorization" not in lowered
    assert "cookie" not in lowered


class TestFetchIconSchemeGating:
  # R-14.2-o — non-https/data scheme rejected without fetching
  def test_rejects_non_https_data_scheme_without_fetch(self):
    def fake_fetch(url: str):  # pragma: no cover - must not be reached
      raise AssertionError("fetch must not run for a disallowed scheme")

    with pytest.raises(IconValidationError):
      fetch_icon("http://example.com/icon.png", fetch=fake_fetch)

  def test_rejects_javascript_scheme_without_fetch(self):
    def fake_fetch(url: str):  # pragma: no cover - must not be reached
      raise AssertionError("fetch must not run for a disallowed scheme")

    with pytest.raises(IconValidationError):
      fetch_icon("javascript:alert(1)", fetch=fake_fetch)
