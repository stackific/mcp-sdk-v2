"""S11 — The Extensions Map & Forward Compatibility (§6.5–§6.7).

The structured ``extensions`` map that lives inside both ``ClientCapabilities`` and
``ServerCapabilities`` (the generic ``extensions`` field already exists on those
schemas from S10), plus the forward-compatibility rules that govern how peers treat
capability fields, extension keys, and settings they do not recognize. It defines:

* the extension-identifier grammar (``prefix/name``) and a parser/validator;
* the reserved-prefix rule (second label is ``modelcontextprotocol``/``mcp``);
* the settings-value semantics (``{}`` = enabled-no-settings; ``None`` =
  malformed-and-ignored; unknown settings keys are ignored);
* normalization of a raw ``extensions`` map (drop ``None`` / malformed entries);
* activation-by-intersection and the one-sided-support fallback decision;
* forward-compatibility helpers (ignore unknown extension keys / settings keys; never
  treat unknown things as errors).

This module deliberately defines its own identifier grammar rather than reusing
:mod:`mcp.json.meta_key`: the ``_meta`` prefix is OPTIONAL whereas an extension
identifier's prefix is REQUIRED (R-6.5-a). The name grammar and the reserved-second-label
rule are identical to the ``_meta`` rules and are re-implemented here so the two surfaces
evolve independently.

Out of scope (owned elsewhere, per the story):

* the core (non-extension) capability fields and per-request gating — S10;
* the full extension mechanism (methods/notifications/versioning) — S38;
* the concrete ``io.modelcontextprotocol/tasks`` and ``/ui`` extensions — S39–S42.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Literal

__all__ = [
  "RESERVED_SECOND_LABELS",
  "is_valid_extension_prefix",
  "is_valid_extension_name",
  "ParsedExtensionId",
  "parse_extension_id",
  "is_valid_extension_id",
  "is_reserved_extension_prefix",
  "is_third_party_usable",
  "is_extension_settings",
  "is_valid_extension_settings",
  "is_valid_extensions_map",
  "normalize_extensions_map",
  "is_extension_advertised",
  "get_extension_settings",
  "pick_known_settings",
  "intersect_extensions",
  "is_extension_active",
  "ExtensionFallbackDecision",
  "decide_extension_fallback",
  "KNOWN_CLIENT_CAPABILITY_FIELDS",
  "KNOWN_SERVER_CAPABILITY_FIELDS",
  "unknown_capability_fields",
  "ignore_unknown_capability_fields",
]

# ─── Identifier grammar (§6.5, R-6.5-a – R-6.5-f) ──────────────────────────────

#: Labels that make a prefix reserved when they appear as the SECOND label. (R-6.5-g)
RESERVED_SECOND_LABELS = frozenset({"modelcontextprotocol", "mcp"})

# A label MUST start with a letter and end with a letter or digit; interior characters
# MAY be letters, digits, or hyphens. A single-letter label is valid. (R-6.5-b, R-6.5-c)
_LABEL_RE = re.compile(r"^[a-zA-Z]([a-zA-Z0-9-]*[a-zA-Z0-9])?$")
# A non-empty name MUST begin and end with an alphanumeric; interior characters MAY be
# hyphens, underscores, dots, or alphanumerics. (R-6.5-e, R-6.5-f)
_NAME_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$")


def _is_valid_prefix_label(label: str) -> bool:
  """Return ``True`` when a single prefix label is well-formed. (R-6.5-b, R-6.5-c)

  Uses ``fullmatch`` so the whole string must match — Python's ``$`` also matches just
  before a trailing newline (JS ``$`` does not), so ``re.match(... "$")`` would wrongly
  accept a label ending in ``\\n``.
  """
  return bool(_LABEL_RE.fullmatch(label))


def is_valid_extension_prefix(prefix: str) -> bool:
  """Return ``True`` when ``prefix`` is a syntactically valid extension-identifier prefix.

  A prefix is one or more dot-separated labels (no trailing slash). (R-6.5-a – R-6.5-c)
  Reverse-DNS notation (e.g. ``com.example``) is RECOMMENDED but not enforced; any
  dot-separated sequence of valid labels is accepted. (R-6.5-d)
  """
  if len(prefix) == 0:
    return False
  return all(_is_valid_prefix_label(label) for label in prefix.split("."))


def is_valid_extension_name(name: str) -> bool:
  """Return ``True`` when ``name`` is a valid extension name (the part after the slash).

  An empty name is permitted. (R-6.5-e, R-6.5-f) A non-empty name MUST begin and end with
  an alphanumeric character; interior characters MAY be hyphens, underscores, dots, or
  alphanumerics.
  """
  if name == "":
    return True
  return bool(_NAME_RE.fullmatch(name))


@dataclass(frozen=True)
class ParsedExtensionId:
  """The parsed parts of an extension identifier.

  ``prefix`` is everything before the FIRST slash (without the slash); ``name`` is
  everything after it (MAY be empty).
  """

  prefix: str
  name: str


def parse_extension_id(identifier: str) -> ParsedExtensionId | None:
  """Split an extension identifier at its FIRST slash into ``prefix`` and ``name``.

  Returns ``None`` when the string contains no slash at all — an identifier without a
  separating slash has no prefix and is therefore malformed. (R-6.5-a)

  Because the split is on the first slash, any later slashes (which would make the name
  invalid) are retained in ``name`` so :func:`is_valid_extension_name` rejects them.
  """
  slash = identifier.find("/")
  if slash == -1:
    return None
  return ParsedExtensionId(identifier[:slash], identifier[slash + 1 :])


def is_valid_extension_id(identifier: str) -> bool:
  """Return ``True`` when ``identifier`` is a well-formed extension identifier.

  A REQUIRED prefix, a single separating slash, and a (possibly empty) name, each
  conforming to the §6.5 grammar. (R-6.5-a, R-6.5-b, R-6.5-e, R-6.5-f)

  Well-formedness is independent of whether the prefix is reserved — a reserved
  identifier such as ``io.modelcontextprotocol/tasks`` is well-formed; use
  :func:`is_reserved_extension_prefix` / :func:`is_third_party_usable` for the
  reserved-prefix policy.
  """
  parsed = parse_extension_id(identifier)
  if parsed is None:
    return False
  return is_valid_extension_prefix(parsed.prefix) and is_valid_extension_name(parsed.name)


# ─── Reserved prefixes (§6.5, R-6.5-g) ─────────────────────────────────────────

def is_reserved_extension_prefix(prefix: str) -> bool:
  """Return ``True`` when ``prefix`` is reserved for official MCP use. (R-6.5-g)

  A prefix is reserved iff its SECOND label is ``modelcontextprotocol`` or ``mcp``. It is
  NOT reserved merely because those tokens appear as some other label: ``com.example.mcp``
  is not reserved (its second label is ``example``), whereas ``io.modelcontextprotocol``,
  ``dev.mcp``, ``org.modelcontextprotocol.api``, and ``com.mcp`` are all reserved.
  """
  labels = prefix.split(".")
  return len(labels) >= 2 and labels[1] in RESERVED_SECOND_LABELS


def is_third_party_usable(identifier: str) -> bool:
  """Return ``True`` when a THIRD PARTY may define an extension under ``identifier``.

  The identifier must be well-formed and its prefix must not be reserved. (R-6.5-g)
  A malformed identifier is not third-party usable either.
  """
  parsed = parse_extension_id(identifier)
  if parsed is None:
    return False
  if not is_valid_extension_prefix(parsed.prefix) or not is_valid_extension_name(parsed.name):
    return False
  return not is_reserved_extension_prefix(parsed.prefix)


# ─── Settings values & the extensions map shape (§6.5) ─────────────────────────

def is_extension_settings(value: object) -> bool:
  """Return ``True`` when ``value`` is a legal extension settings value. (R-6.5-h)

  The only legal shape is a non-``None`` mapping. An empty object ``{}`` qualifies (it is a
  valid enabling declaration, not absence). Lists and scalars are rejected. ``bool`` is
  not a mapping, so it is rejected too.
  """
  return isinstance(value, dict)


def is_valid_extension_settings(value: object) -> bool:
  """Return ``True`` for a valid single extension settings object: any object, incl. ``{}``.

  A ``None`` value is intentionally NOT accepted here (R-6.5-i); receivers normalize a raw
  map with :func:`normalize_extensions_map`, which drops ``None``/malformed entries rather
  than rejecting the whole map. (R-6.5-h)
  """
  return is_extension_settings(value)


def is_valid_extensions_map(map_: object) -> bool:
  """Return ``True`` when ``map_`` is a valid producer-built ``extensions`` map.

  Every value MUST be a settings object and no value may be ``None``. (R-6.5-i) This is the
  check a PRODUCER validates its own map against. A RECEIVER processing an untrusted map
  should instead call :func:`normalize_extensions_map`, which tolerates and discards
  malformed entries per the forward-compatibility rules (R-6.5-j, R-6.6-d).
  """
  if not is_extension_settings(map_):
    return False
  return all(is_extension_settings(value) for value in map_.values())


# ─── Normalization / forward compatibility (§6.5, §6.6) ────────────────────────

def normalize_extensions_map(raw: object) -> dict:
  """Normalize a raw, possibly-untrusted ``extensions`` map into the advertised set.

  Applies the receiver rules together:

  * a ``None`` value is malformed → the entry is ignored (the extension is treated as not
    advertised by that peer). (R-6.5-j)
  * a non-object value (list, scalar) is likewise malformed → ignored.
  * a well-formed ``{}`` is retained — it is an enabling declaration, not absence. (R-6.5-h)
  * keys whose identifiers are unknown to the receiver are RETAINED (forward compatibility
    is about not erroring); whether such a key becomes active is decided by
    :func:`intersect_extensions` against the receiver's own advertised set. (R-6.6-d)

  Returns a NEW dict; the input is not mutated. The result is a clean map (no
  ``None``/malformed values).

  :param raw: The peer's advertised ``extensions`` map (or ``None`` when the peer
    advertised none — equivalent to an empty map).
  """
  out: dict = {}
  if not is_extension_settings(raw):
    return out
  for key, value in raw.items():
    # None / list / scalar values are malformed and ignored. (R-6.5-i, R-6.5-j)
    if not is_extension_settings(value):
      continue
    out[key] = value
  return out


def is_extension_advertised(raw: object, identifier: str) -> bool:
  """Return ``True`` when a receiver should treat ``identifier`` as ADVERTISED by a peer.

  The key must be present in ``raw`` and map to a valid (non-``None``, object) settings
  value. A ``None``-valued or otherwise-malformed entry is treated as not advertised.
  (R-6.5-h, R-6.5-j)
  """
  if not is_extension_settings(raw):
    return False
  return is_extension_settings(raw.get(identifier))


def get_extension_settings(raw: object, identifier: str) -> dict | None:
  """Return the settings object a peer advertised for ``identifier``, or ``None``.

  ``None`` is returned when the extension is not validly advertised (absent, ``None``, or
  malformed). (R-6.5-h, R-6.5-j)

  The returned object MAY contain settings keys the receiving extension does not define;
  those MUST be ignored by the extension, not rejected. (R-6.5-k, R-6.6-e) Use
  :func:`pick_known_settings` to project to the keys an extension understands.
  """
  if not is_extension_settings(raw):
    return None
  value = raw.get(identifier)
  return value if is_extension_settings(value) else None


def pick_known_settings(settings: dict, known_keys: Iterable[str]) -> dict:
  """Project a settings object down to only the keys an extension defines.

  Any keys the extension does not recognize are silently dropped, never treated as an
  error, so an extension can add settings over time without breaking older receivers.
  (R-6.5-k, R-6.6-e)

  :param settings: The raw settings object (may carry unknown keys).
  :param known_keys: The settings keys this extension version defines.
  """
  known = known_keys if isinstance(known_keys, (set, frozenset)) else set(known_keys)
  return {key: value for key, value in settings.items() if key in known}


# ─── Activation by intersection (§6.5, R-6.5-l/m) ──────────────────────────────

def intersect_extensions(client_extensions: object, server_extensions: object) -> list[str]:
  """Return the extension identifiers ACTIVE for an interaction: the intersection. (R-6.5-l)

  An identifier is active iff it is advertised (validly) by BOTH peers. Each raw map is
  normalized first, so ``None``/malformed entries on either side (R-6.5-j) and unknown keys
  the other side does not advertise (R-6.6-d) naturally fall outside the intersection. The
  result is a sorted list for deterministic output.

  :param client_extensions: The client's advertised ``extensions`` map (raw).
  :param server_extensions: The server's advertised ``extensions`` map (raw).
  """
  client = normalize_extensions_map(client_extensions)
  server = normalize_extensions_map(server_extensions)
  return sorted(id_ for id_ in client if id_ in server)


def is_extension_active(
  identifier: str,
  client_extensions: object,
  server_extensions: object,
) -> bool:
  """Return ``True`` when extension ``identifier`` is ACTIVE between two peers. (R-6.5-l)

  Active iff both peers validly advertise it. A peer MUST NOT exercise an extension's
  behavior unless this returns ``True``.
  """
  return is_extension_advertised(client_extensions, identifier) and is_extension_advertised(
    server_extensions, identifier
  )


# ─── One-sided-support fallback (§6.5, R-6.5-n) ────────────────────────────────

#: What a peer should do for an operation that COULD use an extension that is not active.
#:
#: * ``"use-extension"`` — the extension is active; exercise its behavior.
#: * ``"fallback"``      — not active, but the operation has a core fallback.
#: * ``"reject"``        — not active and the extension is MANDATORY; reject with an error.
ExtensionFallbackDecision = Literal["use-extension", "fallback", "reject"]


def decide_extension_fallback(*, active: bool, mandatory: bool) -> ExtensionFallbackDecision:
  """Decide how to handle an operation given activeness and mandatoriness. (R-6.5-l, R-6.5-n)

  * active                    → ``"use-extension"``
  * not active, not mandatory → ``"fallback"`` (use core protocol behavior)
  * not active, mandatory     → ``"reject"``

  A peer MUST NOT ``"reject"`` merely because the extension is one-sided; rejection happens
  only when the extension is mandatory for the operation. (R-6.5-n)
  """
  if active:
    return "use-extension"
  return "reject" if mandatory else "fallback"


# ─── Forward compatibility for capability objects (§6.6) ───────────────────────

#: The core (recognized) client capability field names a receiver understands. Any field
#: NOT in this set is "unknown" and MUST be tolerated and ignored — never rejected, never
#: treated as an error. (R-6.6-a – R-6.6-c, R-6.6-f) These mirror the fields on
#: ``ClientCapabilities`` (S10).
KNOWN_CLIENT_CAPABILITY_FIELDS: frozenset[str] = frozenset(
  {"experimental", "elicitation", "roots", "sampling", "extensions"}
)

#: The core (recognized) server capability field names. (See
#: :data:`KNOWN_CLIENT_CAPABILITY_FIELDS`.)
KNOWN_SERVER_CAPABILITY_FIELDS: frozenset[str] = frozenset(
  {"experimental", "completions", "prompts", "resources", "tools", "logging", "extensions"}
)


def unknown_capability_fields(caps: dict, known: frozenset[str] | set[str]) -> list[str]:
  """Return the capability fields in ``caps`` that ``known`` does not recognize.

  A receiver MUST ignore exactly these fields and MUST NOT reject the capability object (or
  the message carrying it) because they are present. (R-6.6-b, R-6.6-c, R-6.6-f) Insertion
  order is preserved.

  :param caps: A raw ``ClientCapabilities`` / ``ServerCapabilities`` object.
  :param known: The recognized field names (e.g. :data:`KNOWN_CLIENT_CAPABILITY_FIELDS`).
  """
  return [field for field in caps if field not in known]


def ignore_unknown_capability_fields(caps: dict, known: frozenset[str] | set[str]) -> dict:
  """Produce the view of a capability object a receiver acts on: recognized fields only.

  Unrecognized fields are dropped (ignored). The presence of an unknown field never causes
  rejection — this function simply omits it. (R-6.6-b, R-6.6-c, R-6.6-f, R-6.6-g)

  Dropping an unknown field MUST NOT be read as the peer not supporting anything the
  receiver DOES understand; the recognized fields are passed through unchanged so no such
  inference can be drawn. (R-6.6-g)

  :param caps: A raw capability object (possibly carrying unknown fields).
  :param known: The recognized field names for this object kind.
  """
  return {field: value for field, value in caps.items() if field in known}
