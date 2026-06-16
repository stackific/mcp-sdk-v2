"""Tests for per-request capability negotiation (§1.5, §2.2.2)."""

import pytest

from mcp.protocol.capabilities import (
  MissingCapabilityError,
  assert_capability,
  has_capability,
)


class TestHasCapability:
  def test_declared_and_undeclared(self):
    declared = {"tools", "resources"}
    assert has_capability(declared, "tools")
    assert not has_capability(declared, "sampling")


class TestAssertCapability:
  def test_passes_when_declared(self):
    assert_capability({"tools"}, "tools")  # no raise

  def test_raises_when_undeclared(self):
    with pytest.raises(MissingCapabilityError) as exc:
      assert_capability({"tools"}, "resources")
    assert exc.value.capability == "resources"
    assert exc.value.code == "MISSING_CAPABILITY"

  def test_stateless_per_request(self):
    # Only the supplied set matters — no accumulated state.
    with pytest.raises(MissingCapabilityError):
      assert_capability(set(), "tools")
