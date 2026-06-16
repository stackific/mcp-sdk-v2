"""Tests for the ContentBlock union (§14.4, §14.8).

Mirrors ts-sdk/src/__tests__/types/content.test.ts.
"""

from mcp.types.content import (
  FORBIDDEN_CONTENT_BLOCK_TYPES,
  is_forbidden_content_block_type,
  is_known_content_block_type,
  is_valid_audio_content,
  is_valid_content_block,
  is_valid_embedded_resource,
  is_valid_image_content,
  is_valid_resource_link,
  is_valid_text_content,
)

VALID_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC"
VALID_WAV_B64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="


class TestTypePredicates:
  # AC-21.2 (R-14.4-b)
  def test_known(self):
    for t in ("text", "image", "audio", "resource_link", "resource"):
      assert is_known_content_block_type(t)

  def test_unknown_not_known(self):
    assert not is_known_content_block_type("widget")
    assert not is_known_content_block_type("future_type")

  # AC-21.20 (R-14.8-a, R-14.8-b)
  def test_forbidden(self):
    assert is_forbidden_content_block_type("tool_use")
    assert is_forbidden_content_block_type("tool_result")

  def test_not_forbidden(self):
    for t in ("text", "image", "resource", "future_type"):
      assert not is_forbidden_content_block_type(t)

  def test_forbidden_set_membership(self):
    assert "tool_use" in FORBIDDEN_CONTENT_BLOCK_TYPES
    assert "tool_result" in FORBIDDEN_CONTENT_BLOCK_TYPES


class TestText:
  # AC-21.3 (R-14.4.1-a, R-14.4.1-b)
  def test_minimal(self):
    assert is_valid_text_content({"type": "text", "text": "hello"})

  def test_requires_type_text(self):
    assert not is_valid_text_content({"type": "TEXT", "text": "hello"})
    assert not is_valid_text_content({"type": "image", "text": "hi"})

  def test_requires_text(self):
    assert not is_valid_text_content({"type": "text"})

  # R-14.4.1-c — optional annotations
  def test_optional_annotations(self):
    assert is_valid_text_content({"type": "text", "text": "hello", "annotations": {"audience": ["user"]}})
    assert is_valid_text_content({"type": "text", "text": "hi", "annotations": {"priority": 1}, "_meta": {}})

  # R-14.4.1-d — optional _meta
  def test_optional_meta(self):
    assert is_valid_text_content({"type": "text", "text": "hi", "_meta": {"trace": "123"}})

  def test_absent_annotations_valid(self):
    assert is_valid_text_content({"type": "text", "text": "hi"})

  def test_bad_annotations_rejected(self):
    assert not is_valid_text_content({"type": "text", "text": "hi", "annotations": {"priority": 2}})


class TestImage:
  # AC-21.4 (R-14.4.2-a, b, c)
  def test_valid(self):
    assert is_valid_image_content({"type": "image", "data": VALID_PNG_B64, "mimeType": "image/png"})

  def test_requires_type_image(self):
    assert not is_valid_image_content({"type": "Image", "data": VALID_PNG_B64, "mimeType": "image/png"})

  def test_requires_data(self):
    assert not is_valid_image_content({"type": "image", "mimeType": "image/png"})

  def test_rejects_non_base64_data(self):
    assert not is_valid_image_content({"type": "image", "data": "not!base64", "mimeType": "image/png"})

  def test_requires_mime_type(self):
    assert not is_valid_image_content({"type": "image", "data": VALID_PNG_B64})

  def test_optional_annotations(self):
    assert is_valid_image_content(
      {"type": "image", "data": VALID_PNG_B64, "mimeType": "image/png", "annotations": {"audience": ["user"], "priority": 0.3}}
    )

  # AC-21.5 (R-14.4.2-d) — multiple MIME types valid
  def test_multiple_mime_types(self):
    for mt in ("image/png", "image/jpeg", "image/webp"):
      assert is_valid_image_content({"type": "image", "data": VALID_PNG_B64, "mimeType": mt})


class TestAudio:
  # AC-21.6 (R-14.4.3-a, b, c)
  def test_valid(self):
    assert is_valid_audio_content({"type": "audio", "data": VALID_WAV_B64, "mimeType": "audio/wav"})

  def test_requires_type_audio(self):
    assert not is_valid_audio_content({"type": "Audio", "data": VALID_WAV_B64, "mimeType": "audio/wav"})

  def test_requires_data(self):
    assert not is_valid_audio_content({"type": "audio", "mimeType": "audio/wav"})

  def test_rejects_non_base64_data(self):
    assert not is_valid_audio_content({"type": "audio", "data": "not!valid", "mimeType": "audio/wav"})

  def test_requires_mime_type(self):
    assert not is_valid_audio_content({"type": "audio", "data": VALID_WAV_B64})

  # AC-21.7 (R-14.4.3-d) — multiple MIME types valid
  def test_multiple_mime_types(self):
    for mt in ("audio/wav", "audio/mpeg"):
      assert is_valid_audio_content({"type": "audio", "data": VALID_WAV_B64, "mimeType": mt})


class TestResourceLink:
  # AC-21.8 (R-14.4.4-a, b, c)
  def test_minimal(self):
    assert is_valid_resource_link({"type": "resource_link", "uri": "file:///src/main.rs", "name": "main.rs"})

  def test_requires_type(self):
    assert not is_valid_resource_link({"type": "resource-link", "uri": "x", "name": "x"})

  def test_requires_uri(self):
    assert not is_valid_resource_link({"type": "resource_link", "name": "x"})

  def test_requires_name(self):
    assert not is_valid_resource_link({"type": "resource_link", "uri": "file:///x"})

  def test_optional_title(self):
    assert is_valid_resource_link({"type": "resource_link", "uri": "file:///x", "name": "x", "title": "X file"})

  def test_optional_description(self):
    assert is_valid_resource_link({"type": "resource_link", "uri": "file:///x", "name": "x", "description": "Describes X."})

  def test_optional_mime_type(self):
    assert is_valid_resource_link({"type": "resource_link", "uri": "file:///x.rs", "name": "x.rs", "mimeType": "text/x-rust"})

  # AC-21.9 (R-14.4.4-i, j) — size in bytes
  def test_optional_size(self):
    assert is_valid_resource_link({"type": "resource_link", "uri": "file:///x", "name": "x", "size": 4096})

  # R-14.4.4-h — optional annotations
  def test_optional_annotations(self):
    assert is_valid_resource_link({"type": "resource_link", "uri": "file:///x", "name": "x", "annotations": {"priority": 0.5}})

  def test_full(self):
    assert is_valid_resource_link(
      {"type": "resource_link", "uri": "u", "name": "n", "title": "T", "mimeType": "text/plain", "size": 12, "icons": []}
    )

  def test_bad_size_rejected(self):
    assert not is_valid_resource_link({"type": "resource_link", "uri": "u", "name": "n", "size": "big"})


class TestEmbeddedResource:
  # AC-21.11 (R-14.4.5-a, b)
  def test_text_resource_contents(self):
    assert is_valid_embedded_resource({"type": "resource", "resource": {"uri": "file:///README.md", "text": "# Hello"}})

  def test_blob_resource_contents(self):
    assert is_valid_embedded_resource({"type": "resource", "resource": {"uri": "file:///logo.png", "blob": VALID_PNG_B64}})

  def test_requires_type_resource(self):
    assert not is_valid_embedded_resource({"type": "Resource", "resource": {"uri": "file:///x", "text": "hi"}})

  def test_requires_resource_field(self):
    assert not is_valid_embedded_resource({"type": "resource"})

  def test_rejects_both_text_and_blob(self):
    assert not is_valid_embedded_resource(
      {"type": "resource", "resource": {"uri": "file:///x", "text": "hello", "blob": "aGVsbG8="}}
    )

  def test_optional_annotations(self):
    assert is_valid_embedded_resource(
      {"type": "resource", "resource": {"uri": "file:///x", "text": "hi"}, "annotations": {"audience": ["assistant"], "priority": 0.8}}
    )


class TestUnion:
  # AC-21.1 (R-14.4-a) — case-sensitive dispatch
  def test_known_dispatch(self):
    assert is_valid_content_block({"type": "text", "text": "hi"})
    assert is_valid_content_block({"type": "resource", "resource": {"uri": "u", "blob": "aGk="}})

  def test_case_sensitive_text_accepted_as_unknown(self):
    # "Text"/"TEXT" don't match TextContent but are accepted as forward-compatible unknown.
    assert is_valid_content_block({"type": "Text", "text": "hi"})
    assert is_valid_content_block({"type": "TEXT", "text": "hi"})

  def test_malformed_known_rejected(self):
    assert not is_valid_content_block({"type": "image", "data": "aGk="})  # missing mimeType

  # AC-21.2 (R-14.4-b) — unknown type forward-compatible
  def test_unknown_type_is_forward_compatible(self):
    assert is_valid_content_block({"type": "future_widget", "payload": 1})
    assert is_valid_content_block({"type": "future_content_type", "customField": 42})
    assert is_valid_content_block({"type": "future_diagram_type", "data": {}})

  # AC-21.20 (R-14.8-a, R-14.8-b) — forbidden sampling types rejected
  def test_forbidden_sampling_types_rejected(self):
    assert not is_valid_content_block({"type": "tool_use", "id": "x", "input": {}})
    assert not is_valid_content_block({"type": "tool_result", "content": []})

  def test_non_object(self):
    assert not is_valid_content_block("nope")
    assert not is_valid_content_block({"text": "no type"})
