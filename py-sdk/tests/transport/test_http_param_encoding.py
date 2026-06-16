"""Tests for ``Mcp-Param-*`` value encoding/decoding (§9.5.3).

Covers every export of :mod:`mcp.transport.http.param_encoding`: the sentinel
constants, the safe-integer range predicate, the per-type plain string form, sentinel
detection, the ``needs_sentinel`` safety classifier, encode/decode round-trips
(including special characters and the integer/boolean per-type forms), and edge cases
around the ``bool``/``int`` distinction and out-of-range integers.
"""

import base64

import pytest

from mcp.transport.http.param_encoding import (
  BASE64_SENTINEL_PREFIX,
  BASE64_SENTINEL_SUFFIX,
  MAX_SAFE_ANNOTATED_INTEGER,
  MIN_SAFE_ANNOTATED_INTEGER,
  decode_header_value,
  encode_header_value,
  is_annotated_integer_in_range,
  is_sentinel_encoded,
  needs_sentinel,
  plain_string_form,
  sentinel_encode,
)


class TestConstants:
  def test_sentinel_affixes_are_exact_lowercase(self):
    # R-9.5.3-c: the sentinel is the exact lowercase form.
    assert BASE64_SENTINEL_PREFIX == "=?base64?"
    assert BASE64_SENTINEL_SUFFIX == "?="

  def test_safe_integer_bounds(self):
    # R-9.5.1-g: bounds are the IEEE-754 safe-integer ceiling/floor.
    assert MAX_SAFE_ANNOTATED_INTEGER == 2 ** 53 - 1
    assert MIN_SAFE_ANNOTATED_INTEGER == -(2 ** 53) + 1
    assert MAX_SAFE_ANNOTATED_INTEGER == 9007199254740991
    assert MIN_SAFE_ANNOTATED_INTEGER == -9007199254740991


class TestIsAnnotatedIntegerInRange:
  def test_in_range_values(self):
    assert is_annotated_integer_in_range(0)
    assert is_annotated_integer_in_range(42)
    assert is_annotated_integer_in_range(-7)
    assert is_annotated_integer_in_range(MAX_SAFE_ANNOTATED_INTEGER)
    assert is_annotated_integer_in_range(MIN_SAFE_ANNOTATED_INTEGER)

  def test_out_of_range_values(self):
    assert not is_annotated_integer_in_range(MAX_SAFE_ANNOTATED_INTEGER + 1)
    assert not is_annotated_integer_in_range(MIN_SAFE_ANNOTATED_INTEGER - 1)

  def test_bool_is_rejected(self):
    # bool is an int subclass in Python but is a JSON boolean, not an integer.
    assert not is_annotated_integer_in_range(True)
    assert not is_annotated_integer_in_range(False)

  def test_non_integers_rejected(self):
    assert not is_annotated_integer_in_range(1.5)
    assert not is_annotated_integer_in_range("5")
    assert not is_annotated_integer_in_range(None)


class TestPlainStringForm:
  def test_boolean_lowercase(self):
    assert plain_string_form(True) == "true"
    assert plain_string_form(False) == "false"

  def test_integer_decimal_string(self):
    assert plain_string_form(42) == "42"
    assert plain_string_form(-7) == "-7"
    assert plain_string_form(0) == "0"

  def test_string_as_is(self):
    assert plain_string_form("hello") == "hello"
    assert plain_string_form("") == ""

  def test_boundary_integers(self):
    assert plain_string_form(MAX_SAFE_ANNOTATED_INTEGER) == str(MAX_SAFE_ANNOTATED_INTEGER)
    assert plain_string_form(MIN_SAFE_ANNOTATED_INTEGER) == str(MIN_SAFE_ANNOTATED_INTEGER)

  def test_out_of_range_integer_raises(self):
    with pytest.raises(ValueError):
      plain_string_form(MAX_SAFE_ANNOTATED_INTEGER + 1)
    with pytest.raises(ValueError):
      plain_string_form(MIN_SAFE_ANNOTATED_INTEGER - 1)

  def test_string_that_looks_like_a_number_is_unchanged(self):
    # A string is returned as-is even if it is out of integer range.
    assert plain_string_form("99999999999999999999") == "99999999999999999999"


class TestIsSentinelEncoded:
  def test_well_formed_sentinel(self):
    assert is_sentinel_encoded("=?base64?aGk=?=")

  def test_empty_payload_sentinel(self):
    # Prefix + suffix with an empty payload still qualifies (length boundary).
    assert is_sentinel_encoded("=?base64??=")

  def test_missing_prefix(self):
    assert not is_sentinel_encoded("base64?aGk=?=")

  def test_missing_suffix(self):
    assert not is_sentinel_encoded("=?base64?aGk=")

  def test_plain_value(self):
    assert not is_sentinel_encoded("hello")

  def test_too_short_fragment(self):
    assert not is_sentinel_encoded("=?base64?")

  def test_case_sensitive(self):
    # The sentinel is exact lowercase; an upper-case variant is not a sentinel.
    assert not is_sentinel_encoded("=?BASE64?aGk=?=")


class TestNeedsSentinel:
  def test_plain_ascii_is_safe(self):
    assert not needs_sentinel("hello")
    assert not needs_sentinel("Region-42")
    assert not needs_sentinel("a b c")  # interior spaces are fine

  def test_visible_ascii_bounds_are_safe(self):
    assert not needs_sentinel("!")  # 0x21
    assert not needs_sentinel("~")  # 0x7E
    assert not needs_sentinel("a\tb")  # interior horizontal tab is allowed

  def test_empty_string_is_safe(self):
    assert not needs_sentinel("")

  def test_leading_whitespace(self):
    assert needs_sentinel(" hello")

  def test_trailing_whitespace(self):
    assert needs_sentinel("hello ")
    assert needs_sentinel("hello\t")

  def test_non_ascii(self):
    assert needs_sentinel("héllo")
    assert needs_sentinel("日本")

  def test_control_character(self):
    assert needs_sentinel("a\nb")  # 0x0A control char
    assert needs_sentinel("a\x00b")
    assert needs_sentinel("a\rb")

  def test_value_that_looks_like_a_sentinel(self):
    # R-9.5.3-e: a value that itself looks like a sentinel must be re-encoded.
    assert needs_sentinel("=?base64?aGk=?=")


class TestSentinelEncode:
  def test_wraps_base64_payload(self):
    encoded = sentinel_encode("hi")
    assert encoded.startswith(BASE64_SENTINEL_PREFIX)
    assert encoded.endswith(BASE64_SENTINEL_SUFFIX)
    payload = encoded[len(BASE64_SENTINEL_PREFIX): -len(BASE64_SENTINEL_SUFFIX)]
    assert base64.b64decode(payload).decode("utf-8") == "hi"

  def test_utf8_bytes(self):
    encoded = sentinel_encode("héllo")
    payload = encoded[len(BASE64_SENTINEL_PREFIX): -len(BASE64_SENTINEL_SUFFIX)]
    assert payload == base64.b64encode("héllo".encode("utf-8")).decode("ascii")


class TestEncodeHeaderValue:
  def test_safe_ascii_string_is_plain(self):
    assert encode_header_value("Region-42") == "Region-42"

  def test_integer_plain(self):
    assert encode_header_value(42) == "42"
    assert encode_header_value(-7) == "-7"

  def test_boolean_plain(self):
    assert encode_header_value(True) == "true"
    assert encode_header_value(False) == "false"

  def test_non_ascii_string_is_sentinel(self):
    encoded = encode_header_value("héllo")
    assert is_sentinel_encoded(encoded)
    assert decode_header_value(encoded) == "héllo"

  def test_leading_whitespace_is_sentinel(self):
    encoded = encode_header_value(" trimmed?")
    assert is_sentinel_encoded(encoded)

  def test_sentinel_lookalike_is_re_encoded(self):
    raw = "=?base64?aGk=?="
    encoded = encode_header_value(raw)
    assert is_sentinel_encoded(encoded)
    # Decoding recovers the original literal, not its inner payload.
    assert decode_header_value(encoded) == raw

  def test_out_of_range_integer_raises(self):
    with pytest.raises(ValueError):
      encode_header_value(MAX_SAFE_ANNOTATED_INTEGER + 1)


class TestDecodeHeaderValue:
  def test_plain_value_returned_unchanged(self):
    assert decode_header_value("Region-42") == "Region-42"

  def test_sentinel_is_decoded(self):
    assert decode_header_value(sentinel_encode("héllo")) == "héllo"

  def test_empty_payload_decodes_to_empty(self):
    assert decode_header_value("=?base64??=") == ""


class TestRoundTrip:
  @pytest.mark.parametrize(
    "value",
    [
      "hello",
      "Region-42",
      "héllo",
      "日本語",
      "emoji 🎉",
      " leading",
      "trailing ",
      "tab\tinside",
      "newline\nin",
      "null\x00byte",
      "=?base64?aGk=?=",
      "",
    ],
  )
  def test_string_round_trip(self, value):
    # encode → decode recovers the exact string for every special case.
    assert decode_header_value(encode_header_value(value)) == value

  @pytest.mark.parametrize("value", [0, 1, -1, 42, -7, MAX_SAFE_ANNOTATED_INTEGER, MIN_SAFE_ANNOTATED_INTEGER])
  def test_integer_round_trip(self, value):
    assert decode_header_value(encode_header_value(value)) == str(value)

  @pytest.mark.parametrize("value,expected", [(True, "true"), (False, "false")])
  def test_boolean_round_trip(self, value, expected):
    assert decode_header_value(encode_header_value(value)) == expected
