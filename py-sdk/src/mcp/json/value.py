"""JSONValue — the single wire value model for MCP (§2.3).

Every value that crosses the wire is exactly one of six JSON forms. The model is
recursive: objects and arrays nest :data:`JSONValue`\\ s, forming the foundation all
later protocol shapes build on.

Numeric bounds (§2.5): identifiers and counters (request ids, error codes, progress
counters, pagination counters) MUST stay within the IEEE 754 safe-integer range
``-9007199254740991`` to ``9007199254740991``. Python integers are arbitrary
precision, so the helpers here make that JSON constraint explicit and testable.

Python note: ``bool`` is a subclass of ``int`` in Python, but a JSON boolean and a
JSON number are *distinct* wire forms. Every helper below treats them as distinct —
a ``bool`` is never accepted where a number is required.
"""

from __future__ import annotations

import math
from typing import Union

# The universal wire value — exactly one of the six JSON primitive forms (§2.3).
# (Python cannot enforce a recursive alias at runtime; this documents the shape.)
JSONValue = Union[str, int, float, bool, None, "JSONObject", "JSONArray"]
#: An unordered, string-keyed map of JSONValues (§2.3.1).
JSONObject = dict[str, "JSONValue"]
#: An ordered sequence of JSONValues; position is significant (§2.3.1).
JSONArray = list["JSONValue"]

#: Inclusive lower bound for safe identifiers and counters (§2.5, R-2.5-c).
SAFE_INTEGER_MIN = -9007199254740991
#: Inclusive upper bound for safe identifiers and counters (§2.5, R-2.5-c).
SAFE_INTEGER_MAX = 9007199254740991


def _is_number(value: object) -> bool:
  """Return ``True`` for a JSON number (``int`` or ``float``), excluding ``bool``.

  A JSON boolean is a different wire form than a JSON number; because ``bool`` is a
  subclass of ``int`` in Python, this guard is needed everywhere a number is meant.
  """
  return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_integer(n: object) -> bool:
  """Return ``True`` when ``n`` is a number with no fractional part.

  May be outside the safe range. A ``bool`` is not a number. (R-2.5-a, R-2.5-b, AC-02.13)
  """
  if not _is_number(n):
    return False
  if isinstance(n, float):
    return math.isfinite(n) and math.floor(n) == n
  return True


def is_safe_integer(n: object) -> bool:
  """Return ``True`` when ``n`` is an integer within the safe-integer range.

  No fractional part and within ``[SAFE_INTEGER_MIN, SAFE_INTEGER_MAX]``.
  (R-2.5-c, R-2.5-e, AC-02.14)
  """
  return is_integer(n) and SAFE_INTEGER_MIN <= n <= SAFE_INTEGER_MAX


def assert_integer(n: object) -> None:
  """Assert that ``n`` has no fractional part.

  :raises TypeError: when a fractional (or non-numeric) value is supplied where an
    integer field is required. (R-2.5-b, AC-02.13)
  """
  if not is_integer(n):
    raise TypeError(f"Expected integer, got {n!r}")


def assert_safe_integer(n: object) -> None:
  """Assert that ``n`` is within the safe-integer range.

  Senders MUST NOT emit identifier/counter values outside this range.

  :raises ValueError: when ``n`` is outside ``[SAFE_INTEGER_MIN, SAFE_INTEGER_MAX]``
    (the Python analogue of JavaScript's ``RangeError``). (R-2.5-d)
  """
  if not is_safe_integer(n):
    raise ValueError(
      f"Value {n!r} is outside the safe-integer range "
      f"[{SAFE_INTEGER_MIN}, {SAFE_INTEGER_MAX}]"
    )


def numeric_equal(a: object, b: object) -> bool:
  """Return ``True`` when ``a`` and ``b`` are numerically equal JSON numbers.

  Regardless of textual representation (``100 == 1e2``, ``1 == 1.0``). Non-numbers
  (including ``bool``) are never numerically equal here. Two numerically equal JSON
  numbers MUST be treated as equal. (R-2.5-g, AC-02.15)
  """
  return _is_number(a) and _is_number(b) and a == b


def last_duplicate_wins(
  entries: list[tuple[str, "JSONValue"]] | tuple[tuple[str, "JSONValue"], ...],
) -> "JSONObject":
  """Build an object from ``[name, value]`` pairs, applying last-duplicate-wins.

  When a receiver does not reject an object with duplicate member names as
  malformed, it MUST behave as though only the last occurrence is present. ``dict``
  construction has exactly this semantics, made explicit and testable here.
  (§2.3.1, R-2.3.1-c, AC-02.3)
  """
  result: "JSONObject" = {}
  for key, value in entries:
    result[key] = value
  return result


def is_json_value(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid :data:`JSONValue` (one of six forms).

  Useful as a runtime guard at system boundaries. Objects must have ``str`` keys.
  (R-2.3-a, AC-02.1)
  """
  if value is None:
    return True
  if isinstance(value, bool):
    return True
  if isinstance(value, (int, float, str)):
    return True
  if isinstance(value, list):
    return all(is_json_value(v) for v in value)
  if isinstance(value, dict):
    return all(isinstance(k, str) and is_json_value(v) for k, v in value.items())
  return False
