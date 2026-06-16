"""Tests for S8 — the MCP Apps / Interactive UI server helpers (§26), in
:mod:`mcp.server.ui`.

These are the *server shaping* helpers (distinct from the protocol-level validation in
:mod:`mcp.protocol.ui`, covered by ``tests/protocol/test_ui.py``): build a ``ui://``
resource block (:func:`ui_resource`) and a launcher tool result that embeds it and
declares the UI under ``_meta.ui`` (:func:`ui_tool_result`). Pure shaping, no rendering.

Mirrors the TypeScript ``server/ui.ts`` surface and the ``__tests__/server/
wire-conformance.test.ts`` "MCP Apps UI helper" case (C7), PLUS additional edge cases:
the verbatim MIME type, the ``ui://`` scheme guard, the leading text block, the
``visibility`` declaration handling, and the ``_meta.ui`` shape.
"""

from __future__ import annotations

import pytest

from mcp.server.ui import (
  DEFAULT_UI_VISIBILITY,
  TOOL_UI_META_KEY,
  UI_MIME_TYPE,
  UI_URI_SCHEME,
  is_ui_resource_uri,
  ui_resource,
  ui_tool_result,
)


# ─── constants ─────────────────────────────────────────────────────────────────────


class TestConstants:
  def test_ui_mime_type_is_the_verbatim_apps_profile(self):
    # Byte-exact: no surrounding whitespace, exact case, the `;profile=mcp-app` param.
    assert UI_MIME_TYPE == "text/html;profile=mcp-app"

  def test_ui_uri_scheme_is_ui_colon_slash_slash(self):
    assert UI_URI_SCHEME == "ui://"

  def test_tool_ui_meta_key_is_ui(self):
    assert TOOL_UI_META_KEY == "ui"

  def test_default_visibility_is_model_and_app(self):
    assert DEFAULT_UI_VISIBILITY == ("model", "app")


# ─── is_ui_resource_uri ──────────────────────────────────────────────────────────


class TestIsUiResourceUri:
  def test_accepts_a_ui_scheme_uri(self):
    assert is_ui_resource_uri("ui://counter") is True

  def test_rejects_a_non_ui_scheme_uri(self):
    assert is_ui_resource_uri("https://evil.test") is False
    assert is_ui_resource_uri("file:///etc/passwd") is False

  def test_rejects_a_non_string(self):
    assert is_ui_resource_uri(None) is False
    assert is_ui_resource_uri(123) is False
    assert is_ui_resource_uri({"uri": "ui://x"}) is False

  def test_rejects_uri_where_ui_is_only_a_substring(self):
    # The scheme must be a prefix, not appear mid-string.
    assert is_ui_resource_uri("https://host/ui://nested") is False


# ─── ui_resource ─────────────────────────────────────────────────────────────────


class TestUiResource:
  def test_builds_an_embedded_resource_block_with_the_verbatim_mime(self):
    res = ui_resource("ui://counter", "<h1>hi</h1>")
    assert res == {
      "uri": "ui://counter",
      "mimeType": UI_MIME_TYPE,
      "text": "<h1>hi</h1>",
    }

  def test_mime_type_is_always_the_apps_profile(self):
    assert ui_resource("ui://x", "<p/>")["mimeType"] == UI_MIME_TYPE

  def test_preserves_the_html_text_verbatim(self):
    html = '<div class="x">&amp; ünïçödé ☃</div>'
    assert ui_resource("ui://x", html)["text"] == html

  def test_rejects_a_non_ui_scheme_uri(self):
    with pytest.raises(ValueError) as excinfo:
      ui_resource("https://evil.test", "<p/>")
    assert UI_URI_SCHEME in str(excinfo.value)

  def test_rejects_a_non_ui_scheme_uri_with_empty_html(self):
    with pytest.raises(ValueError):
      ui_resource("http://x", "")


# ─── ui_tool_result ──────────────────────────────────────────────────────────────


class TestUiToolResult:
  def test_declares_meta_ui_resource_uri_and_embeds_the_ui_mime(self):
    # The C7 wire-conformance case: _meta.ui.resourceUri + text/html;profile=mcp-app.
    r = ui_tool_result("ui://counter", "<h1>hi</h1>", text="Launch")
    ui = r["_meta"][TOOL_UI_META_KEY]
    assert ui["resourceUri"] == "ui://counter"
    # The wrong legacy key is gone.
    assert "mcp.io/ui" not in r["_meta"]
    res = r["content"][-1]["resource"]
    assert res["mimeType"] == UI_MIME_TYPE

  def test_leading_text_block_precedes_the_resource_block_when_supplied(self):
    r = ui_tool_result("ui://counter", "<h1>hi</h1>", text="Launch")
    assert r["content"][0] == {"type": "text", "text": "Launch"}
    assert r["content"][1]["type"] == "resource"
    assert r["content"][1]["resource"]["uri"] == "ui://counter"

  def test_omits_the_text_block_when_no_text_given(self):
    r = ui_tool_result("ui://counter", "<h1>hi</h1>")
    assert len(r["content"]) == 1
    assert r["content"][0]["type"] == "resource"

  def test_empty_text_is_treated_as_no_text_block(self):
    # An empty/falsy text string adds no leading note (mirrors the TS `options.text` truthiness).
    r = ui_tool_result("ui://counter", "<h1>hi</h1>", text="")
    assert len(r["content"]) == 1
    assert r["content"][0]["type"] == "resource"

  def test_embedded_resource_is_the_full_ui_resource_block(self):
    r = ui_tool_result("ui://counter", "<b>x</b>")
    assert r["content"][0]["resource"] == {
      "uri": "ui://counter",
      "mimeType": UI_MIME_TYPE,
      "text": "<b>x</b>",
    }

  def test_omits_visibility_when_not_supplied(self):
    # Omitted ⇒ host applies the default ["model","app"]; the key is left out of _meta.ui.
    r = ui_tool_result("ui://counter", "<h1>hi</h1>")
    assert "visibility" not in r["_meta"][TOOL_UI_META_KEY]

  def test_declares_visibility_when_supplied(self):
    r = ui_tool_result("ui://counter", "<h1>hi</h1>", visibility=["app"])
    assert r["_meta"][TOOL_UI_META_KEY]["visibility"] == ["app"]

  def test_declares_explicit_full_visibility(self):
    r = ui_tool_result("ui://counter", "<h1>hi</h1>", visibility=["model", "app"])
    assert r["_meta"][TOOL_UI_META_KEY]["visibility"] == ["model", "app"]

  def test_empty_visibility_list_is_still_declared(self):
    # A supplied (non-None) empty list is included verbatim — only None omits the key.
    r = ui_tool_result("ui://counter", "<h1>hi</h1>", visibility=[])
    assert r["_meta"][TOOL_UI_META_KEY]["visibility"] == []

  def test_resource_uri_in_meta_matches_the_embedded_resource_uri(self):
    r = ui_tool_result("ui://dash/main", "<x/>", text="open")
    assert r["_meta"][TOOL_UI_META_KEY]["resourceUri"] == "ui://dash/main"
    assert r["content"][-1]["resource"]["uri"] == "ui://dash/main"

  def test_rejects_a_non_ui_scheme_uri(self):
    with pytest.raises(ValueError):
      ui_tool_result("https://evil.test", "<p/>", text="Launch")

  def test_top_level_shape_is_content_plus_meta_only(self):
    r = ui_tool_result("ui://counter", "<h1>hi</h1>", text="Launch")
    assert set(r.keys()) == {"content", "_meta"}
