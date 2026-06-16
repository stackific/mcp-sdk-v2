"""Tests for BaseMetadata + display-name precedence (§14.1).

Mirrors ts-sdk/src/__tests__/types/base-metadata.test.ts.
"""

from mcp.types.base_metadata import is_valid_base_metadata, resolve_display_name


class TestIsValid:
  # AC-20.3 (R-14.1-a, R-14.1-b) — name required; title optional
  def test_minimal(self):
    assert is_valid_base_metadata({"name": "x"})

  def test_with_title(self):
    assert is_valid_base_metadata({"name": "x", "title": "X"})

  def test_title_optional_absent_valid(self):
    assert is_valid_base_metadata({"name": "tool"})

  def test_name_required(self):
    assert not is_valid_base_metadata({"title": "Title Only"})

  def test_invalid(self):
    assert not is_valid_base_metadata({})
    assert not is_valid_base_metadata({"name": 1})
    assert not is_valid_base_metadata({"name": "x", "title": 2})
    assert not is_valid_base_metadata("nope")

  # AC-20.1 (R-14-a) — field names are case-sensitive: "Name" != "name"
  def test_field_name_case_sensitive(self):
    assert not is_valid_base_metadata({"Name": "tool"})

  # AC-20.7 (R-14.1-f) — non-uniqueness of name is not an error
  def test_non_uniqueness_allowed(self):
    assert is_valid_base_metadata({"name": "shared-name"})
    assert is_valid_base_metadata({"name": "shared-name"})

  # AC-20.2 (R-14-b) — a reserved `_meta` member is accepted (tolerated extra key)
  def test_meta_is_accepted(self):
    assert is_valid_base_metadata({"name": "x", "_meta": {"example.com/category": "analytics"}})


class TestResolveDisplayName:
  # AC-20.4 (R-14.1-c) — title wins when present
  def test_title_wins(self):
    assert resolve_display_name("my-tool", "My Tool") == "My Tool"

  def test_title_wins_over_annotations_title(self):
    assert resolve_display_name("n", "T", "AT") == "T"
    assert resolve_display_name("my-tool", "My Tool", "Annotated Title") == "My Tool"

  # AC-20.6 (R-14.1-e) — annotations.title is between title and name
  def test_annotations_title_second(self):
    assert resolve_display_name("n", None, "AT") == "AT"
    assert resolve_display_name("my-tool", None, "Annotated Title") == "Annotated Title"

  # AC-20.5 (R-14.1-d) — name used when title absent
  def test_name_fallback(self):
    assert resolve_display_name("my-tool") == "my-tool"
    assert resolve_display_name("my-tool", None) == "my-tool"
    assert resolve_display_name("my-tool", None, None) == "my-tool"

  def test_empty_title_falls_through(self):
    assert resolve_display_name("n", "", "AT") == "AT"
    assert resolve_display_name("n", "", "") == "n"
