"""Tests for ResourceContents text/blob variants (§14.5).

Mirrors ts-sdk/src/__tests__/types/resource-contents.test.ts.
"""

from mcp.types.resource_contents import (
  is_valid_base64,
  is_valid_blob_resource_contents,
  is_valid_resource_contents,
  is_valid_text_resource_contents,
)

VALID_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC"


class TestBase64:
  def test_standard_with_padding(self):
    assert is_valid_base64("aGVsbG8=")

  def test_unpadded(self):
    assert is_valid_base64("aGVsbG8")

  def test_empty(self):
    assert is_valid_base64("")  # empty is permitted by the pattern

  def test_url_safe_variant(self):
    assert is_valid_base64("a-_b")

  def test_invalid(self):
    assert not is_valid_base64("hello world!")
    assert not is_valid_base64("not base64!")
    assert not is_valid_base64("***")


class TestText:
  # AC-21.12 / AC-21.13
  def test_minimal(self):
    assert is_valid_text_resource_contents({"uri": "file:///README.md", "text": "# Hello"})

  def test_full(self):
    assert is_valid_text_resource_contents(
      {"uri": "file:///a", "text": "hi", "mimeType": "text/plain", "_meta": {}}
    )

  def test_requires_uri(self):
    assert not is_valid_text_resource_contents({"text": "hello"})

  def test_requires_text(self):
    assert not is_valid_text_resource_contents({"uri": "file:///f.txt"})

  def test_optional_mime_type(self):
    assert is_valid_text_resource_contents({"uri": "file:///f.md", "text": "# hi", "mimeType": "text/markdown"})

  def test_optional_meta(self):
    assert is_valid_text_resource_contents({"uri": "file:///f.txt", "text": "content", "_meta": {"source": "fs"}})

  def test_bad_uri_type(self):
    assert not is_valid_text_resource_contents({"uri": 1, "text": "hi"})


class TestBlob:
  # AC-21.14 (R-14.5-f)
  def test_valid(self):
    assert is_valid_blob_resource_contents({"uri": "file:///logo.png", "blob": VALID_PNG_B64})
    assert is_valid_blob_resource_contents({"uri": "file:///a", "blob": "aGVsbG8="})

  def test_requires_uri(self):
    assert not is_valid_blob_resource_contents({"blob": "aGVsbG8="})

  def test_requires_blob(self):
    assert not is_valid_blob_resource_contents({"uri": "file:///f.bin"})

  def test_invalid_base64(self):
    assert not is_valid_blob_resource_contents({"uri": "file:///a", "blob": "not!base64"})
    assert not is_valid_blob_resource_contents({"uri": "file:///f.bin", "blob": "not valid!!"})


class TestUnion:
  # AC-21.15 (R-14.5-g) — variant selected by which payload field is present
  def test_text_variant(self):
    assert is_valid_resource_contents({"uri": "file:///f.txt", "text": "hello"})

  def test_blob_variant(self):
    assert is_valid_resource_contents({"uri": "file:///f.bin", "blob": "aGVsbG8="})

  # AC-21.15 (R-14.5-h) — both rejected
  def test_both_rejected(self):
    assert not is_valid_resource_contents({"uri": "file:///ambiguous", "text": "hello", "blob": "aGVsbG8="})

  def test_neither_rejected(self):
    assert not is_valid_resource_contents({"uri": "u"})

  def test_non_object(self):
    assert not is_valid_resource_contents("nope")
