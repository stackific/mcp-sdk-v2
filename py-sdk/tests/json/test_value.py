"""Tests for the JSON value model (§2.3, §2.5)."""

import math

import pytest

from mcp.json.value import (
  SAFE_INTEGER_MAX,
  SAFE_INTEGER_MIN,
  assert_integer,
  assert_safe_integer,
  is_integer,
  is_json_value,
  is_safe_integer,
  last_duplicate_wins,
  numeric_equal,
)


class TestIsInteger:
  def test_accepts_int_and_integral_float(self):
    assert is_integer(0)
    assert is_integer(-5)
    assert is_integer(2.0)

  def test_rejects_fractional_float(self):
    assert not is_integer(2.5)

  def test_rejects_non_finite(self):
    assert not is_integer(math.nan)
    assert not is_integer(math.inf)
    assert not is_integer(-math.inf)

  def test_rejects_bool_and_non_numbers(self):
    # bool is a subclass of int but is a JSON boolean, not a number.
    assert not is_integer(True)
    assert not is_integer(False)
    assert not is_integer("3")
    assert not is_integer(None)


class TestIsSafeInteger:
  def test_boundaries_inclusive(self):
    assert is_safe_integer(SAFE_INTEGER_MIN)
    assert is_safe_integer(SAFE_INTEGER_MAX)
    assert is_safe_integer(0)

  def test_just_outside_range(self):
    assert not is_safe_integer(SAFE_INTEGER_MAX + 1)
    assert not is_safe_integer(SAFE_INTEGER_MIN - 1)

  def test_fractional_is_not_safe(self):
    assert not is_safe_integer(1.5)


class TestAsserts:
  def test_assert_integer_passes_and_raises(self):
    assert_integer(7)  # no raise
    with pytest.raises(TypeError):
      assert_integer(7.5)

  def test_assert_safe_integer_passes_and_raises(self):
    assert_safe_integer(SAFE_INTEGER_MAX)  # no raise
    with pytest.raises(ValueError):
      assert_safe_integer(SAFE_INTEGER_MAX + 1)


class TestNumericEqual:
  def test_equal_regardless_of_representation(self):
    assert numeric_equal(1, 1.0)
    assert numeric_equal(100, 1e2)

  def test_unequal_numbers(self):
    assert not numeric_equal(1, 2)

  def test_non_numbers_and_bool_excluded(self):
    assert not numeric_equal(True, 1)
    assert not numeric_equal("1", 1)


class TestLastDuplicateWins:
  def test_last_value_wins(self):
    result = last_duplicate_wins([("a", 1), ("b", 2), ("a", 3)])
    assert result == {"a": 3, "b": 2}

  def test_empty(self):
    assert last_duplicate_wins([]) == {}


class TestIsJsonValue:
  def test_six_primitive_forms(self):
    assert is_json_value(None)
    assert is_json_value(True)
    assert is_json_value(3)
    assert is_json_value(3.14)
    assert is_json_value("s")
    assert is_json_value([])
    assert is_json_value({})

  def test_nested(self):
    assert is_json_value({"a": [1, "x", {"b": None}], "c": True})

  def test_rejects_non_json(self):
    assert not is_json_value({1, 2, 3})  # set
    assert not is_json_value(object())

  def test_rejects_non_string_keys(self):
    assert not is_json_value({1: "x"})

  def test_rejects_nested_invalid(self):
    assert not is_json_value([1, {2, 3}])
