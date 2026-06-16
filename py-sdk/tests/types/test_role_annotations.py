"""Tests for Role (§14.7) and Annotations (§14.6).

Mirrors ts-sdk/src/__tests__/types/role.test.ts and annotations.test.ts.
"""

from mcp.types.annotations import is_valid_annotations
from mcp.types.role import is_role


class TestRole:
  # AC-21.19 (R-14.7-a) — only "user" and "assistant" are valid
  def test_accepts_user(self):
    assert is_role("user")

  def test_accepts_assistant(self):
    assert is_role("assistant")

  def test_rejects_system(self):
    assert not is_role("system")

  def test_case_sensitive(self):
    assert not is_role("User")
    assert not is_role("ASSISTANT")

  def test_rejects_empty_string(self):
    assert not is_role("")

  def test_rejects_non_string(self):
    assert not is_role(1)
    assert not is_role(None)
    assert not is_role(["user"])


class TestAnnotations:
  # AC-21.16 (R-14.6-a) — all fields optional; empty object valid
  def test_empty_is_valid(self):
    assert is_valid_annotations({})

  def test_full(self):
    assert is_valid_annotations({"audience": ["user", "assistant"], "priority": 0.5, "lastModified": "2025-01-12T15:00:58Z"})

  # R-14.6-b — audience is a Role[]
  def test_audience_multiple(self):
    assert is_valid_annotations({"audience": ["user", "assistant"]})

  def test_audience_single(self):
    assert is_valid_annotations({"audience": ["user"]})

  def test_audience_empty_array(self):
    assert is_valid_annotations({"audience": []})

  def test_bad_audience(self):
    assert not is_valid_annotations({"audience": ["system"]})
    assert not is_valid_annotations({"audience": ["user", "root"]})
    assert not is_valid_annotations({"audience": "user"})

  # R-14.6-e — lastModified ISO 8601 string
  def test_last_modified_string(self):
    assert is_valid_annotations({"lastModified": "2026-07-28T09:15:00Z"})

  def test_bad_last_modified(self):
    assert not is_valid_annotations({"lastModified": 123})

  # AC-21.17 (R-14.6-c, R-14.6-d) — priority range 0..1 inclusive
  def test_priority_bounds(self):
    assert is_valid_annotations({"priority": 0})
    assert is_valid_annotations({"priority": 1})
    assert is_valid_annotations({"priority": 0.5})

  def test_priority_out_of_range(self):
    assert not is_valid_annotations({"priority": 1.5})
    assert not is_valid_annotations({"priority": -0.1})
    assert not is_valid_annotations({"priority": -10})

  def test_priority_bool_rejected(self):
    assert not is_valid_annotations({"priority": True})

  # AC-21.18 (R-14.6-f, R-14.6-g) — annotations are untrusted hints; parse cleanly
  def test_untrusted_source_parses(self):
    assert is_valid_annotations({"audience": ["user"], "priority": 0.3, "lastModified": "2025-01-12T15:00:58Z"})

  def test_extra_keys_allowed(self):
    assert is_valid_annotations({"com.example/x": 1})

  def test_non_object(self):
    assert not is_valid_annotations("nope")
