"""``_meta`` key naming validation (§2.6.2).

A valid ``_meta`` key consists of an OPTIONAL prefix followed by a name.

Prefix (when present):
  * One or more dot-separated labels terminated by a single slash.
  * Each label MUST start with a letter and end with a letter or digit.
  * Interior characters MAY be letters, digits, or hyphens.
  * SHOULD use reverse-DNS notation (e.g. ``com.example/``).
  * A prefix whose SECOND label is ``modelcontextprotocol`` or ``mcp`` is reserved.

Name (portion after the prefix, or the whole key when no prefix):
  * Unless empty, MUST begin and end with ``[a-zA-Z0-9]``.
  * Interior characters MAY be alphanumeric, hyphens, underscores, or dots.

Reserved bare keys: ``traceparent``, ``tracestate``, ``baggage`` (W3C trace context).
"""

from __future__ import annotations

import re

#: Labels that make a prefix reserved when they appear as the second label. (R-2.6.2-f)
RESERVED_SECOND_LABELS = frozenset({"modelcontextprotocol", "mcp"})

#: Bare keys reserved for W3C trace-context propagation. (R-2.6.2-i)
TRACE_CONTEXT_KEYS = frozenset({"traceparent", "tracestate", "baggage"})

_LABEL_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z]$")
_NAME_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$")


def _is_valid_label(label: str) -> bool:
  """Return ``True`` when a single prefix label is valid."""
  return bool(_LABEL_RE.match(label))


def is_valid_meta_key_prefix(prefix: str) -> bool:
  """Return ``True`` when ``prefix`` is a syntactically valid ``_meta`` key prefix.

  A prefix is one or more dot-separated labels terminated by a single ``/``.
  (R-2.6.2-b, R-2.6.2-c, R-2.6.2-d, AC-02.17)
  """
  if not prefix.endswith("/"):
    return False
  body = prefix[:-1]
  if body == "":
    return False
  return all(_is_valid_label(label) for label in body.split("."))


def is_reserved_meta_key_prefix(prefix: str) -> bool:
  """Return ``True`` when ``prefix`` is reserved (second label is reserved).

  Implementations MUST NOT define ``_meta`` keys under a reserved prefix except as
  specified by the spec or an MCP-published extension. (R-2.6.2-f, AC-02.17)
  """
  body = prefix[:-1] if prefix.endswith("/") else prefix
  labels = body.split(".")
  return len(labels) >= 2 and labels[1] in RESERVED_SECOND_LABELS


def is_valid_meta_key_name(name: str) -> bool:
  """Return ``True`` when ``name`` is a valid ``_meta`` key name.

  An empty name is valid (when a prefix is present). Non-empty names MUST begin and
  end with ``[a-zA-Z0-9]``; interior characters MAY be alphanumeric, hyphens,
  underscores, or dots. (R-2.6.2-g, R-2.6.2-h, AC-02.18)
  """
  if name == "":
    return True
  return bool(_NAME_RE.match(name))


def parse_meta_key(key: str) -> tuple[str | None, str]:
  """Split a ``_meta`` key into ``(prefix, name)``.

  The prefix includes the trailing slash; the name is everything after it. When the
  key has no ``/``, the prefix is ``None`` and the name is the whole key.
  """
  prefix, sep, name = key.partition("/")
  if not sep:
    return None, key
  return prefix + sep, name


def is_valid_meta_key(key: str) -> bool:
  """Return ``True`` when ``key`` is syntactically valid and not under a reserved prefix.

  Reserved bare keys (``traceparent``, ``tracestate``, ``baggage``) are always valid —
  the spec permits them. (R-2.6.2-i, R-2.6.2-j)
  """
  if key in TRACE_CONTEXT_KEYS:
    return True
  prefix, name = parse_meta_key(key)
  if prefix is not None:
    if not is_valid_meta_key_prefix(prefix):
      return False
    if is_reserved_meta_key_prefix(prefix):
      return False
  return is_valid_meta_key_name(name)


# ─── W3C traceparent (Trace Context Level 2, §3.2) ────────────────────────────

#: ``{version}-{traceId}-{parentId}-{flags}`` → ``00-32hex-16hex-2hex``. (R-2.6.2-i, AC-02.19)
_TRACEPARENT_RE = re.compile(r"^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$")


def is_valid_traceparent(value: str) -> bool:
  """Return ``True`` when ``value`` conforms to the W3C ``traceparent`` format."""
  return bool(_TRACEPARENT_RE.match(value))


# ─── W3C tracestate grammar (Trace Context Level 2, §3.3) ─────────────────────

# Simple key: one lowercase letter followed by 0-255 lowercase/digit/_-*/ chars.
_TRACESTATE_SIMPLE_KEY_RE = re.compile(r"^[a-z][a-z0-9_\-*/]{0,255}$")
# Multi-tenant key: tenant-id (1-241 chars) + "@" + system-id (1-14 chars).
_TRACESTATE_MULTI_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_\-*/]{0,240}@[a-z][a-z0-9_\-*/]{0,13}$")
# chr = %x20 / nblkchar; printable ASCII except comma (0x2C) and "?" (0x3F).
_TRACESTATE_CHR_RE = re.compile(r"^[\x20-\x2b\x2d-\x3e\x40-\x7e]+$")
# nblkchar (chr minus space): used to require the last char is non-blank.
_TRACESTATE_NBLKCHAR_LAST_RE = re.compile(r"[\x21-\x2b\x2d-\x3e\x40-\x7e]$")
_LIST_SPLIT_RE = re.compile(r"[ \t]*,[ \t]*")


def _is_valid_tracestate_key(key: str) -> bool:
  return bool(_TRACESTATE_SIMPLE_KEY_RE.match(key) or _TRACESTATE_MULTI_KEY_RE.match(key))


def _is_valid_tracestate_value(v: str) -> bool:
  # value = 0*255(chr) nblkchar → 1-256 chars, last must be nblkchar.
  return (
    1 <= len(v) <= 256
    and bool(_TRACESTATE_CHR_RE.match(v))
    and bool(_TRACESTATE_NBLKCHAR_LAST_RE.search(v))
  )


def _is_valid_tracestate_entry(entry: str) -> bool:
  eq = entry.find("=")
  if eq <= 0:
    return False
  return _is_valid_tracestate_key(entry[:eq]) and _is_valid_tracestate_value(entry[eq + 1 :])


def is_valid_tracestate(value: str) -> bool:
  """Return ``True`` when ``value`` conforms to the W3C ``tracestate`` grammar.

  Each list member must be ``simple-key=value`` or ``tenant-id@system-id=value``; up
  to 32 members separated by commas. (R-4.2-l, AC-05.15)
  """
  if len(value) == 0 or len(value) > 512:
    return False
  members = _LIST_SPLIT_RE.split(value)
  return len(members) <= 32 and all(_is_valid_tracestate_entry(m) for m in members)


# ─── W3C Baggage grammar (W3C Baggage spec, §3.3.1) ───────────────────────────

# RFC 7230 token: one or more tchar.
_BAGGAGE_TOKEN_RE = re.compile(r"^[!#$%&'*+\-.^_`|~a-zA-Z0-9]+$")
# baggage-octet: printable ASCII excluding DQUOTE, comma, semicolon, backslash.
_BAGGAGE_OCTET_RE = re.compile(r"^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$")


def _is_valid_baggage_member(member: str) -> bool:
  semi = member.find(";")
  key_val = member if semi == -1 else member[:semi]
  prop_str = "" if semi == -1 else member[semi + 1 :]

  eq = key_val.find("=")
  if eq <= 0:
    return False
  if not _BAGGAGE_TOKEN_RE.match(key_val[:eq]):
    return False
  if not _BAGGAGE_OCTET_RE.match(key_val[eq + 1 :]):
    return False

  if prop_str:
    for prop in prop_str.split(";"):
      t = prop.strip()
      if not t:
        return False
      p_eq = t.find("=")
      if p_eq == -1:
        if not _BAGGAGE_TOKEN_RE.match(t):
          return False
      else:
        if not _BAGGAGE_TOKEN_RE.match(t[:p_eq]):
          return False
        if not _BAGGAGE_OCTET_RE.match(t[p_eq + 1 :]):
          return False
  return True


def is_valid_baggage(value: str) -> bool:
  """Return ``True`` when ``value`` conforms to the W3C Baggage grammar.

  Each list member must be ``token "=" *baggage-octet`` with optional properties.
  (R-4.2-m, AC-05.15)
  """
  if len(value) == 0:
    return False
  return all(_is_valid_baggage_member(m) for m in _LIST_SPLIT_RE.split(value))


def is_valid_trace_context_value(value: str) -> bool:
  """Return ``True`` when ``value`` is a valid W3C ``tracestate`` or ``baggage`` value.

  Accepts if either grammar passes. (R-2.6.2-i)
  """
  return is_valid_tracestate(value) or is_valid_baggage(value)
