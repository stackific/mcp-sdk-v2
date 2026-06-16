"""Tests for the Implementation descriptor (§14.3).

Mirrors ts-sdk/src/__tests__/types/implementation.test.ts.
"""

import pytest

from mcp.types.icon import Icon
from mcp.types.implementation import (
  Implementation,
  is_valid_implementation,
  parse_implementation,
)

MINIMAL = {"name": "my-client", "version": "1.0.0"}


class TestIsValid:
  # AC-20.29 (R-14.3-a, R-14.3-d) — name and version required
  def test_minimal(self):
    assert is_valid_implementation(MINIMAL)

  def test_missing_name_or_version(self):
    assert not is_valid_implementation({"name": "c"})
    assert not is_valid_implementation({"version": "1.0"})

  def test_wrong_types(self):
    assert not is_valid_implementation({"name": 1, "version": "1.0"})
    assert not is_valid_implementation({"name": "c", "version": 2})
    assert not is_valid_implementation("nope")

  # AC-20.2 (R-14-b) — a structure carrying a reserved `_meta` member is accepted; the
  # extra key is tolerated and never causes rejection.
  def test_meta_is_accepted(self):
    assert is_valid_implementation(
      {**MINIMAL, "_meta": {"example.com/category": "analytics"}}
    )

  def test_meta_preserved_in_extra(self):
    impl = parse_implementation({**MINIMAL, "_meta": {"example.com/category": "analytics"}})
    assert impl.extra["_meta"] == {"example.com/category": "analytics"}


class TestParse:
  def test_minimal(self):
    impl = parse_implementation({"name": "c", "version": "1.0"})
    assert impl == Implementation(name="c", version="1.0")

  # AC-20.29 (R-14.3-b) — optional title
  def test_optional_title(self):
    impl = parse_implementation({**MINIMAL, "title": "My Client"})
    assert impl.title == "My Client"

  # AC-20.29 (R-14.3-c) — optional description
  def test_optional_description(self):
    impl = parse_implementation({**MINIMAL, "description": "A sample MCP client."})
    assert impl.description == "A sample MCP client."

  # AC-20.29 (R-14.3-d) — optional websiteUrl
  def test_optional_website_url(self):
    impl = parse_implementation({**MINIMAL, "websiteUrl": "https://example.com"})
    assert impl.website_url == "https://example.com"

  def test_optional_icons(self):
    impl = parse_implementation({**MINIMAL, "icons": [{"src": "https://example.com/icon.png"}]})
    assert impl.icons == [Icon(src="https://example.com/icon.png")]

  def test_all_optionals_absent_by_default(self):
    impl = parse_implementation(MINIMAL)
    assert impl.title is None
    assert impl.description is None
    assert impl.website_url is None
    assert impl.icons is None
    assert impl.extra == {}

  def test_full_and_extras_preserved(self):
    impl = parse_implementation(
      {
        "name": "s",
        "title": "Server",
        "version": "2.4.1",
        "description": "d",
        "websiteUrl": "https://example.com",
        "vendor": "acme",  # forward-compatible extra (§2.3.4)
      }
    )
    assert impl.title == "Server"
    assert impl.website_url == "https://example.com"
    assert impl.extra == {"vendor": "acme"}

  # AC-20.30 (R-14.3-f) — unknown fields pass through (forward-compatibility)
  def test_unknown_field_preserved(self):
    impl = parse_implementation({**MINIMAL, "unknownFutureField": "value"})
    assert impl.extra["unknownFutureField"] == "value"

  # AC-20.30 (R-14.3-d) — an arbitrary implementation-defined version carries NO protocol
  # semantics: any non-semver string is accepted unchanged, never parsed or normalized.
  @pytest.mark.parametrize("version", ["git-2025abc", "2024-W3", "nightly", "v3-rc.7+build"])
  def test_arbitrary_version_accepted_unchanged(self, version):
    raw = {"name": "c", "version": version}
    assert is_valid_implementation(raw)  # any string version is structurally valid
    impl = parse_implementation(raw)
    assert impl.version == version  # round-tripped verbatim, no version semantics applied

  def test_invalid_raises(self):
    with pytest.raises(ValueError):
      parse_implementation({"name": "c"})
    with pytest.raises(ValueError):
      parse_implementation({"version": "1.0"})
