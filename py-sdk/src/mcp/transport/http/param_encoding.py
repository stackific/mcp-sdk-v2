"""S14 — ``Mcp-Param-*`` value encoding (§9.5.3).

A client MUST encode each parameter value before placing it in a header, to ensure
safe transmission and prevent injection. The per-type string form is:

* ``string``  → as-is
* ``integer`` → its decimal string (``42``, ``-7``)
* ``boolean`` → lowercase ``true`` / ``false``

When that string cannot be carried safely as a plain ASCII header value — it has
non-ASCII or control characters, leading/trailing whitespace, or it itself looks like
the sentinel — the client Base64-encodes the UTF-8 bytes and wraps the result as
``=?base64?{payload}?=`` (lowercase, exact). A receiver detects the sentinel and
decodes it before use.

Requirement coverage:

* R-9.5.3-a  per-type plain string form (:func:`plain_string_form`).
* R-9.5.3-b  Base64-sentinel-wrap values that are not safe ASCII (:func:`encode_header_value`).
* R-9.5.3-c  the exact lowercase sentinel ``=?base64?…?=`` (:func:`sentinel_encode`).
* R-9.5.3-d  receiver decodes the sentinel before use (:func:`decode_header_value`).
* R-9.5.3-e  a value that itself looks like a sentinel MUST be re-encoded to avoid ambiguity.
* R-9.5.1-g  annotated integers are bounded to the IEEE-754 safe range.

Python note: ``bool`` is a subclass of ``int``. Each predicate that branches on the
value type therefore tests ``bool`` *before* ``int`` so that ``True``/``False`` never
fall through to the integer path. (Mirrors the TypeScript ``typeof`` discrimination.)
"""

from __future__ import annotations

import base64
from typing import Union

#: The values an annotated parameter may carry — JSON ``string``/``integer``/``boolean``.
#: (``bool`` is listed before ``int`` only for documentation; runtime checks order the
#: ``isinstance`` tests explicitly because ``bool`` is a subclass of ``int``.)
ParamValue = Union[str, int, bool]

__all__ = [
  "BASE64_SENTINEL_PREFIX",
  "BASE64_SENTINEL_SUFFIX",
  "MAX_SAFE_ANNOTATED_INTEGER",
  "MIN_SAFE_ANNOTATED_INTEGER",
  "ParamValue",
  "is_annotated_integer_in_range",
  "plain_string_form",
  "is_sentinel_encoded",
  "needs_sentinel",
  "sentinel_encode",
  "encode_header_value",
  "decode_header_value",
]

#: The exact (lowercase) sentinel prefix. (R-9.5.3-c)
BASE64_SENTINEL_PREFIX = "=?base64?"
#: The exact (lowercase) sentinel suffix. (R-9.5.3-c)
BASE64_SENTINEL_SUFFIX = "?="

#: The widest integer that may safely carry the ``x-mcp-header`` annotation, i.e.
#: ``2 ** 53 - 1`` (the IEEE-754 safe-integer ceiling). (R-9.5.1-g)
MAX_SAFE_ANNOTATED_INTEGER = 2 ** 53 - 1
#: The smallest integer that may safely carry the ``x-mcp-header`` annotation, i.e.
#: ``-(2 ** 53) + 1`` (the IEEE-754 safe-integer floor). (R-9.5.1-g)
MIN_SAFE_ANNOTATED_INTEGER = -(2 ** 53) + 1


def is_annotated_integer_in_range(value: object) -> bool:
  """Return ``True`` when ``value`` is an integer within the safe annotated range.

  ``bool`` is rejected — it is a JSON boolean, not an integer — even though it is a
  Python ``int`` subclass. The accepted range is
  ``[MIN_SAFE_ANNOTATED_INTEGER, MAX_SAFE_ANNOTATED_INTEGER]`` inclusive. (R-9.5.1-g)
  """
  if isinstance(value, bool):
    return False
  if not isinstance(value, int):
    return False
  return MIN_SAFE_ANNOTATED_INTEGER <= value <= MAX_SAFE_ANNOTATED_INTEGER


def plain_string_form(value: ParamValue) -> str:
  """Return the per-type plain string form of a parameter value. (R-9.5.3-a)

  * ``bool`` → lowercase ``"true"`` / ``"false"``.
  * ``int``  → its decimal string (e.g. ``"42"``, ``"-7"``).
  * ``str``  → returned unchanged.

  ``bool`` is handled before ``int`` because it is an ``int`` subclass in Python.

  :raises ValueError: when ``value`` is an integer outside the safe range. (R-9.5.1-g)
    (TypeScript raises ``RangeError``; Python's nearest idiomatic equivalent is
    :class:`ValueError`.)
  """
  if isinstance(value, bool):
    return "true" if value else "false"
  if isinstance(value, int):
    if not is_annotated_integer_in_range(value):
      raise ValueError(f"annotated integer {value} is outside the safe range")
    return str(value)
  return value


def is_sentinel_encoded(header_value: str) -> bool:
  """Return ``True`` when ``header_value`` is wrapped in the Base64 sentinel.

  Requires the exact prefix and suffix and enough length to contain both at once (so
  that the bare string ``"=?base64??="`` with an empty payload still qualifies but a
  partial fragment does not).
  """
  return (
    header_value.startswith(BASE64_SENTINEL_PREFIX)
    and header_value.endswith(BASE64_SENTINEL_SUFFIX)
    and len(header_value) >= len(BASE64_SENTINEL_PREFIX) + len(BASE64_SENTINEL_SUFFIX)
  )


def needs_sentinel(plain: str) -> bool:
  """Return ``True`` when ``plain`` cannot be safely carried as a plain ASCII header
  value and so MUST be sentinel-encoded. (R-9.5.3-b, R-9.5.3-e)

  Unsafe when it contains non-ASCII or control characters, has leading or trailing
  whitespace, or already matches the sentinel shape (to avoid ambiguity). Safe ASCII
  is visible ASCII ``0x21``–``0x7E``, space ``0x20``, and horizontal tab ``0x09``,
  with no leading/trailing whitespace.
  """
  if is_sentinel_encoded(plain):
    return True  # a value that itself looks like a sentinel (R-9.5.3-e)
  if plain and (plain[0].isspace() or plain[-1].isspace()):
    return True  # leading/trailing whitespace
  for ch in plain:
    code = ord(ch)
    safe = code == 0x09 or 0x20 <= code <= 0x7E
    if not safe:
      return True  # non-ASCII or control character
  return False


def sentinel_encode(text: str) -> str:
  """Wrap the UTF-8 Base64 of ``text`` in the sentinel form. (R-9.5.3-b, R-9.5.3-c)"""
  payload = base64.b64encode(text.encode("utf-8")).decode("ascii")
  return f"{BASE64_SENTINEL_PREFIX}{payload}{BASE64_SENTINEL_SUFFIX}"


def encode_header_value(value: ParamValue) -> str:
  """Encode a parameter value into its header-value form. (§9.5.3)

  Returns the plain per-type string when it is safe ASCII; otherwise the
  ``=?base64?{payload}?=`` sentinel form. (R-9.5.3-a, R-9.5.3-b, R-9.5.3-e)

  :raises ValueError: when ``value`` is an out-of-range annotated integer.
  """
  plain = plain_string_form(value)
  return sentinel_encode(plain) if needs_sentinel(plain) else plain


def decode_header_value(header_value: str) -> str:
  """Decode a header value back to its string form, decoding the Base64 payload first
  when the sentinel is present. (R-9.5.3-d)

  A value not wrapped in the sentinel is returned unchanged.
  """
  if not is_sentinel_encoded(header_value):
    return header_value
  payload = header_value[len(BASE64_SENTINEL_PREFIX): len(header_value) - len(BASE64_SENTINEL_SUFFIX)]
  return base64.b64decode(payload).decode("utf-8")
