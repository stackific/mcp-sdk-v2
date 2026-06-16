"""Tests for per-request capability negotiation (§1.5, §2.2.2).

Mirrors ``ts-sdk/src/__tests__/protocol/capabilities.test.ts`` and covers:
  AC-01.12 (R-1.5-e, R-2.2.2-b) — both parties respect declared capabilities.
  AC-01.13 (R-1.5-f)             — a party MUST NOT exercise an undeclared feature.
  AC-01.14 (R-2.2.2-a)           — capability derived from the CURRENT request only.
  AC-01.15 (R-2.2.2-c)           — server rejects with the missing-capability error.
"""

import pytest

from mcp.protocol.capabilities import (
  MissingCapabilityError,
  assert_capability,
  has_capability,
)


class TestMissingCapabilityError:
  """The dedicated missing-capability exception (AC-01.15)."""

  def test_is_an_exception(self):
    # The TS class extends Error; the Python analogue subclasses Exception.
    assert isinstance(MissingCapabilityError("tools"), Exception)

  def test_is_a_missing_capability_error(self):
    assert isinstance(MissingCapabilityError("tools"), MissingCapabilityError)

  def test_carries_the_missing_capability_name(self):
    assert MissingCapabilityError("resources").capability == "resources"

  def test_includes_the_capability_name_in_the_message(self):
    assert "prompts" in str(MissingCapabilityError("prompts"))

  def test_carries_symbolic_code(self):
    # Numeric wire value (-32003) is assigned in the meta/errors layer; this stable
    # symbolic identifier is what the per-request assertion carries.
    assert MissingCapabilityError("tools").code == "MISSING_CAPABILITY"

  def test_class_name_is_missing_capability_error(self):
    # TS sets `.name = 'MissingCapabilityError'`; the Python analogue is the class name.
    assert type(MissingCapabilityError("tools")).__name__ == "MissingCapabilityError"

  def test_code_is_a_class_and_instance_constant(self):
    # The symbolic code is the same stable identifier read off the class or any instance.
    assert MissingCapabilityError.code == "MISSING_CAPABILITY"
    assert MissingCapabilityError("a").code == MissingCapabilityError("b").code

  def test_message_format_matches_ts(self):
    # TS: `Missing required capability: ${capability}`.
    assert str(MissingCapabilityError("resources")) == "Missing required capability: resources"

  def test_can_be_raised_and_caught_as_exception(self):
    with pytest.raises(MissingCapabilityError) as exc:
      raise MissingCapabilityError("sampling")
    assert exc.value.capability == "sampling"


class TestHasCapability:
  def test_declared_and_undeclared(self):
    declared = {"tools", "resources"}
    assert has_capability(declared, "tools")
    assert not has_capability(declared, "sampling")

  def test_returns_true_when_declared(self):
    assert has_capability({"tools"}, "tools") is True

  def test_returns_false_when_not_declared(self):
    assert has_capability({"tools"}, "resources") is False

  def test_returns_false_for_empty_declared_set(self):
    assert has_capability(set(), "tools") is False

  def test_is_stateless_result_depends_only_on_arguments(self):
    assert has_capability({"a"}, "a") is True
    assert has_capability({"b"}, "a") is False

  def test_accepts_a_frozenset_readonly_set_analogue(self):
    # TS takes a ReadonlySet; a frozenset is the closest Python analogue.
    assert has_capability(frozenset({"tools"}), "tools") is True
    assert has_capability(frozenset({"tools"}), "resources") is False


class TestAssertCapability:
  def test_passes_when_declared(self):
    assert_capability({"tools"}, "tools")  # no raise

  def test_does_not_raise_when_required_capability_is_declared(self):
    # Mirrors the TS `.not.toThrow()` case with a multi-member declared set.
    assert_capability({"tools", "resources"}, "tools")  # no raise

  def test_passes_for_each_individually_declared_capability(self):
    declared = {"tools", "resources", "prompts"}
    assert_capability(declared, "resources")  # no raise
    assert_capability(declared, "prompts")  # no raise

  def test_raises_when_undeclared(self):
    with pytest.raises(MissingCapabilityError) as exc:
      assert_capability({"tools"}, "resources")
    assert exc.value.capability == "resources"
    assert exc.value.code == "MISSING_CAPABILITY"

  def test_raises_for_any_capability_absent_from_declared_set(self):
    with pytest.raises(MissingCapabilityError):
      assert_capability(set(), "tools")
    with pytest.raises(MissingCapabilityError):
      assert_capability(set(), "resources")

  def test_thrown_error_names_the_undeclared_capability(self):
    with pytest.raises(MissingCapabilityError) as exc:
      assert_capability({"tools"}, "resources")
    assert isinstance(exc.value, MissingCapabilityError)
    assert exc.value.capability == "resources"

  def test_stateless_per_request(self):
    # Only the supplied set matters — no accumulated state.
    with pytest.raises(MissingCapabilityError):
      assert_capability(set(), "tools")

  def test_is_stateless_one_call_does_not_affect_the_next(self):
    # First call: capability is declared → no throw.
    assert_capability({"tools"}, "tools")
    # Second call: same capability NOT declared → must still throw (AC-01.14).
    with pytest.raises(MissingCapabilityError):
      assert_capability(set(), "tools")

  def test_capability_declared_in_one_call_does_not_bleed_into_the_next(self):
    assert_capability({"resources"}, "resources")
    with pytest.raises(MissingCapabilityError):
      assert_capability({"tools"}, "resources")

  def test_accepts_a_frozenset_readonly_set_analogue(self):
    # ReadonlySet analogue: passes for a member, raises for a non-member.
    assert_capability(frozenset({"tools", "resources"}), "tools")  # no raise
    with pytest.raises(MissingCapabilityError):
      assert_capability(frozenset({"tools"}), "resources")

  def test_returns_none_on_success(self):
    # TS returns void; the Python analogue returns None.
    assert assert_capability({"tools"}, "tools") is None
