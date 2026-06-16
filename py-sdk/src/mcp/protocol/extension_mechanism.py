"""S38 — The Extension Mechanism (§24).

The framework by which functionality beyond the core protocol is added, negotiated, and
used. S11 (:mod:`mcp.protocol.extensions`) owns the lexical layer — the extension-identifier
grammar, the ``extensions`` map / settings-object shapes, normalization, the
activation-by-intersection primitive, and the forward-compatibility helpers. This module
builds the *mechanism* on top of those primitives:

* the third-party reservation policy applied to whole identifiers
  (:func:`is_valid_third_party_extension_id` / :func:`validate_third_party_extension_id`),
  including the bare-token (``modelcontextprotocol`` / ``mcp``) prohibition;
* the per-request active set (:func:`compute_active_set`) and the stateless "recompute from
  this request only, never infer from a prior one" rule (:func:`active_set_for_request`);
* the four — and only four — ways an active extension may extend the surface
  (:data:`EXTENSION_SURFACE_CHANNELS`, :class:`ExtensionDefinition`), with a
  no-redefinition guard against core surface;
* method/notification namespacing derived from the identifier
  (:func:`derive_extension_namespace`, :func:`is_method_in_extension_namespace`) and an
  active-set-gated dispatcher (:class:`ExtensionMethodRouter`);
* extension-controlled reserved ``_meta`` keys (:func:`is_extension_controlled_meta_key`);
* the open ``resultType`` set: core values plus active-extension contributions
  (:func:`accepted_result_types` / :func:`is_result_type_accepted`);
* extension versioning discoverable through the settings object
  (:func:`get_extension_version`) and the new-identifier rule for incompatible change
  (:func:`suggest_successor_identifier`);
* graceful degradation: the fallback decision and an actionable required-but-absent error
  (:func:`build_required_extension_error`).

REUSE (never redefined here):

* identifier grammar & reserved-prefix policy, the extensions map, settings,
  ``normalize_extensions_map``, ``intersect_extensions``, ``is_extension_active``,
  ``decide_extension_fallback`` — :mod:`mcp.protocol.extensions` (S11);
* ``RESULT_TYPE_*`` / ``is_known_result_type`` — :mod:`mcp.jsonrpc.payload` (S04);
* ``_meta`` prefix grammar / reserved-prefix rule — :mod:`mcp.json.meta_key` (S02);
* ``INVALID_PARAMS_CODE``, ``MISSING_CLIENT_CAPABILITY_CODE`` — :mod:`mcp.protocol.errors`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Mapping

from mcp.json.meta_key import (
  is_valid_meta_key_name,
  is_valid_meta_key_prefix,
  parse_meta_key,
)
from mcp.jsonrpc.payload import (
  RESULT_TYPE_COMPLETE,
  RESULT_TYPE_INPUT_REQUIRED,
  is_known_result_type,
)
from mcp.protocol.errors import INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE
from mcp.protocol.extensions import (
  ExtensionFallbackDecision,
  decide_extension_fallback,
  get_extension_settings,
  intersect_extensions,
  is_extension_active,
  is_extension_advertised,
  is_reserved_extension_prefix,
  is_valid_extension_id,
  is_valid_extension_name,
  is_valid_extension_prefix,
  parse_extension_id,
)

# Re-export the S11 lexical / negotiation primitives this mechanism builds on, so a
# consumer of the mechanism can reach them through one module without importing
# ``extensions`` directly. These are NOT redefined. (§24.2, §24.3)
__all__ = [
  "parse_extension_id",
  "is_valid_extension_id",
  "is_extension_active",
  "intersect_extensions",
  "decide_extension_fallback",
  "ExtensionFallbackDecision",
  # identifier policy
  "is_reserved_bare_vendor_prefix",
  "ThirdPartyIdValidation",
  "validate_third_party_extension_id",
  "is_valid_third_party_extension_id",
  "extension_ids_match",
  # classification
  "ExtensionClassification",
  "EXTENSION_CLASSIFICATIONS",
  "is_extension_classification",
  # surface channels
  "ExtensionSurfaceChannel",
  "EXTENSION_SURFACE_CHANNELS",
  "is_sanctioned_surface_channel",
  # method namespacing
  "derive_extension_namespace",
  "is_method_in_extension_namespace",
  "extension_method",
  # meta keys
  "is_extension_controlled_meta_key",
  "extension_meta_key",
  # result types
  "CORE_RESULT_TYPE_VALUES",
  "accepted_result_types",
  "is_result_type_accepted",
  # active set
  "compute_active_set",
  "active_set_for_request",
  "may_emit_extension_surface",
  # versioning
  "get_extension_version",
  "ExtensionChangeKind",
  "is_incompatible_change",
  "suggest_successor_identifier",
  # degradation
  "REQUIRED_EXTENSION_ABSENT_CODE",
  "RequiredExtensionError",
  "build_required_extension_error",
  "decide_extension_use",
  # definitions
  "ExtensionDefinition",
  "ExtensionDefinitionViolation",
  "ExtensionDefinitionValidation",
  "validate_extension_definition",
  # dispatch
  "ExtensionMethodRouter",
  "ExtensionDispatchOutcome",
  # reconciliation
  "reconcile_extension_settings",
]

# ─── §24.2 — Third-party identifier policy (whole-identifier rules) ─────────────

#: The bare tokens reserved to the core protocol; a third party MUST NOT use either as a
#: vendor prefix. (R-24.2-f)
RESERVED_BARE_VENDOR_TOKENS = frozenset({"modelcontextprotocol", "mcp"})


def is_reserved_bare_vendor_prefix(prefix: str) -> bool:
  """Return ``True`` when a vendor prefix is a bare reserved token. (R-24.2-f)

  A bare reserved token is ``modelcontextprotocol`` or ``mcp`` used as a single-label
  prefix with no dot. This is distinct from
  :func:`mcp.protocol.extensions.is_reserved_extension_prefix`, which reserves a prefix
  whose *second* label is reserved (e.g. ``io.modelcontextprotocol``); a bare single-label
  prefix has no second label, so that check alone would miss ``modelcontextprotocol/x`` and
  ``mcp/x``.
  """
  return prefix in RESERVED_BARE_VENDOR_TOKENS


@dataclass(frozen=True)
class ThirdPartyIdValidation:
  """Outcome of :func:`validate_third_party_extension_id`.

  ``ok`` is ``True`` for a usable third-party identifier; otherwise ``reason`` carries the
  specific rejection:

  * ``"missing-prefix"``      — no ``/``-terminated vendor prefix (a bare name). (R-24.2-a)
  * ``"malformed"``           — a prefix label or the name breaks the grammar. (R-24.2-b/-d)
  * ``"reserved-prefix"``     — the prefix's second label is ``modelcontextprotocol``/``mcp``.
    (R-24.2-e)
  * ``"reserved-bare-token"`` — the bare token used as the prefix. (R-24.2-f)
  """

  ok: bool
  reason: str | None = None


def validate_third_party_extension_id(identifier: str) -> ThirdPartyIdValidation:
  """Validate ``identifier`` *as a third-party identifier*, returning the reason on failure.

  A third-party identifier MUST: include a ``/``-terminated vendor prefix; have every prefix
  label and the name conform to the §24.2 grammar; and NOT use a reserved prefix — neither
  one whose second label is ``modelcontextprotocol``/``mcp`` (e.g. ``io.modelcontextprotocol/x``,
  ``com.mcp.tools/x``) nor the bare tokens ``modelcontextprotocol``/``mcp`` as a single-label
  prefix. ``com.example.mcp/x`` is allowed (its second label is ``example``).
  (R-24.2-a, R-24.2-b, R-24.2-d, R-24.2-e, R-24.2-f)

  Identifiers are compared octet-for-octet; case folding is never applied, so
  ``Com.Example/Ext`` and ``com.example/ext`` are distinct. (R-24.2-g)
  """
  parsed = parse_extension_id(identifier)
  if parsed is None:
    return ThirdPartyIdValidation(False, "missing-prefix")
  if len(parsed.prefix) == 0:
    return ThirdPartyIdValidation(False, "missing-prefix")
  if not is_valid_extension_prefix(parsed.prefix) or not is_valid_extension_name(parsed.name):
    return ThirdPartyIdValidation(False, "malformed")
  if is_reserved_bare_vendor_prefix(parsed.prefix):
    return ThirdPartyIdValidation(False, "reserved-bare-token")
  if is_reserved_extension_prefix(parsed.prefix):
    return ThirdPartyIdValidation(False, "reserved-prefix")
  return ThirdPartyIdValidation(True)


def is_valid_third_party_extension_id(identifier: str) -> bool:
  """Return ``True`` when a THIRD PARTY may define an extension under ``identifier``.

  Well-formed, not under a reserved second-label prefix, and not using a bare reserved
  vendor token. (R-24.2-a, R-24.2-b, R-24.2-d, R-24.2-e, R-24.2-f) Unlike S11's
  ``is_third_party_usable``, this additionally rejects the bare tokens
  ``modelcontextprotocol``/``mcp`` as single-label prefixes (R-24.2-f).
  """
  return validate_third_party_extension_id(identifier).ok


def extension_ids_match(a: str, b: str) -> bool:
  """Compare two extension identifiers octet-for-octet, applying NO case folding. (R-24.2-g)

  Returns ``True`` only when the strings are byte-identical.
  """
  return a == b


# ─── §24.1 — Classification ────────────────────────────────────────────────────

#: The three (non-exclusive) ways an extension may be characterized. (§24.1, R-24.1-a)
#:
#: * ``"modular"``      — a discrete capability;
#: * ``"specialized"``  — domain- or industry-specific behavior;
#: * ``"experimental"`` — incubated for possible future inclusion in the core.
ExtensionClassification = str

#: The full set of valid :data:`ExtensionClassification` values, in spec order.
EXTENSION_CLASSIFICATIONS: tuple[str, ...] = ("modular", "specialized", "experimental")


def is_extension_classification(value: object) -> bool:
  """Return ``True`` when ``value`` is a recognized :data:`ExtensionClassification`."""
  return value in ("modular", "specialized", "experimental")


# ─── §24.5 — The four surface channels ─────────────────────────────────────────

#: The four — and ONLY four — channels through which an active extension may extend the
#: protocol surface. (§24.5, R-24.5-a) Adding surface through any other channel is
#: non-conformant.
#:
#: * ``"method"``      — additional request methods and notifications (R-24.5-b);
#: * ``"meta-key"``    — additional reserved ``_meta`` keys under a controlled vendor prefix
#:   (R-24.5-d);
#: * ``"result-type"`` — additional ``resultType`` discriminator values (R-24.5-e);
#: * ``"field"``       — additional fields on existing objects (R-24.5-g).
ExtensionSurfaceChannel = str

#: The four sanctioned surface channels, in spec order. (R-24.5-a)
EXTENSION_SURFACE_CHANNELS: tuple[str, ...] = ("method", "meta-key", "result-type", "field")


def is_sanctioned_surface_channel(channel: object) -> bool:
  """Return ``True`` when ``channel`` is one of the four sanctioned surface channels. (R-24.5-a)"""
  return channel in ("method", "meta-key", "result-type", "field")


# ─── §24.5(1) — Method / notification namespacing ──────────────────────────────

def derive_extension_namespace(identifier: str) -> str | None:
  """Derive the method namespace prefix an extension owns from its identifier's NAME. (R-24.5-b)

  The §24.5 examples show the Tasks extension (``io.modelcontextprotocol/tasks``) defining
  methods such as ``tasks/get`` — i.e. the namespace is the identifier's extension-name
  followed by ``/``. This derives ``"tasks/"`` from ``"io.modelcontextprotocol/tasks"`` so a
  definition can both *mint* and *recognize* its own method strings consistently.

  Returns ``None`` when ``identifier`` is not a well-formed extension identifier or its name
  is empty (an empty name yields no usable namespace).
  """
  parsed = parse_extension_id(identifier)
  if parsed is None:
    return None
  if not is_valid_extension_prefix(parsed.prefix) or not is_valid_extension_name(parsed.name):
    return None
  if parsed.name == "":
    return None
  return f"{parsed.name}/"


def is_method_in_extension_namespace(method: str, identifier: str) -> bool:
  """Return ``True`` when ``method`` belongs to the namespace derived from ``identifier``. (R-24.5-b)

  It must begin with ``<extension-name>/`` and carry a non-empty member segment after the
  slash. The member segment MUST be non-empty (``tasks/`` alone is not a method) but is
  otherwise unconstrained here.
  """
  namespace = derive_extension_namespace(identifier)
  if namespace is None:
    return False
  return len(method) > len(namespace) and method.startswith(namespace)


def extension_method(identifier: str, member: str) -> str:
  """Build a namespaced method string for an extension. (R-24.5-b)

  e.g. ``extension_method("io.modelcontextprotocol/tasks", "get") == "tasks/get"``.

  :raises ValueError: when ``identifier`` yields no namespace (malformed or empty-named) or
    ``member`` is empty.
  """
  namespace = derive_extension_namespace(identifier)
  if namespace is None:
    raise ValueError(f'Cannot derive a method namespace from "{identifier}" (R-24.5-b)')
  if len(member) == 0:
    raise ValueError("Extension method member name MUST be non-empty (R-24.5-b)")
  return f"{namespace}{member}"


# ─── §24.5(2) — Extension-controlled reserved `_meta` keys ─────────────────────

def is_extension_controlled_meta_key(meta_key: str, identifier: str) -> bool:
  """Return ``True`` when ``meta_key`` is a reserved ``_meta`` key the extension controls. (R-24.5-d)

  "Controls" means the key's prefix labels are the same dot-separated labels as the
  extension identifier's vendor prefix (the part before the identifier's ``/``). For
  ``io.modelcontextprotocol/ui`` the controlled keys are those under
  ``io.modelcontextprotocol/…``; for ``com.example/x``, under ``com.example/…``.

  A core-protocol extension legitimately controls a reserved prefix (its second label is
  ``modelcontextprotocol``/``mcp``); a third-party extension's own prefix is non-reserved.
  Either way the key is valid for THAT extension iff the labels match.
  """
  parsed_id = parse_extension_id(identifier)
  if parsed_id is None or not is_valid_extension_prefix(parsed_id.prefix):
    return False

  prefix, name = parse_meta_key(meta_key)
  if prefix is None:  # a bare `_meta` key controls no namespace
    return False
  if not is_valid_meta_key_prefix(prefix):
    return False
  if not is_valid_meta_key_name(name):
    return False

  # The `_meta` prefix includes the trailing slash; the identifier prefix does not. Compare
  # the label bodies octet-for-octet. (R-24.2-g / §4)
  meta_prefix_body = prefix[:-1]
  return meta_prefix_body == parsed_id.prefix


def extension_meta_key(identifier: str, name: str) -> str:
  """Build a reserved ``_meta`` key under the extension's controlled vendor prefix. (R-24.5-d)

  e.g. ``extension_meta_key("com.example/x", "trace") == "com.example/trace"``.

  :raises ValueError: when ``identifier`` is malformed or ``name`` is not a valid ``_meta``
    key name.
  """
  parsed_id = parse_extension_id(identifier)
  if parsed_id is None or not is_valid_extension_prefix(parsed_id.prefix):
    raise ValueError(f'Cannot derive a _meta prefix from "{identifier}" (R-24.5-d)')
  if name == "" or not is_valid_meta_key_name(name):
    raise ValueError(f'"{name}" is not a valid _meta key name (R-24.5-d)')
  return f"{parsed_id.prefix}/{name}"


# ─── §24.5(3) — The open `resultType` set ──────────────────────────────────────

#: The core-protocol ``resultType`` discriminator values, frozen. (§3.6 / S04) The accepted
#: set for any interaction is these PLUS the values contributed by active extensions.
#: (R-24.5-e)
CORE_RESULT_TYPE_VALUES: tuple[str, ...] = (RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED)


def accepted_result_types(
  active_set: Iterable[str],
  active_contributions: Mapping[str, Iterable[str]] | None = None,
) -> set[str]:
  """Return the ``resultType`` values a receiver will accept for an interaction. (R-24.5-e)

  The core values together with every value contributed by an extension in
  ``active_contributions`` that is also in ``active_set``. Contributions from a NON-active
  extension are excluded — a ``resultType`` defined by an inactive extension is never
  accepted. (R-24.5-f)

  :param active_set: Identifiers active for this interaction (e.g. from
    :func:`compute_active_set`).
  :param active_contributions: Mapping of extension identifier → the ``resultType`` values
    that extension contributes. Entries whose key is not in ``active_set`` are ignored.
  """
  active = active_set if isinstance(active_set, (set, frozenset)) else set(active_set)
  accepted: set[str] = set(CORE_RESULT_TYPE_VALUES)
  if active_contributions is None:
    return accepted
  for identifier, values in active_contributions.items():
    if identifier not in active:  # non-active contributions excluded (R-24.5-f)
      continue
    accepted.update(values)
  return accepted


def is_result_type_accepted(
  result_type: str,
  active_set: Iterable[str],
  active_contributions: Mapping[str, Iterable[str]] | None = None,
) -> bool:
  """Return ``True`` when ``result_type`` is accepted. (R-24.5-e, R-24.5-f)

  Accepted iff it is a core value, or it is contributed by an extension in the active set.
  A value that is neither core nor contributed by an active extension is INVALID — this
  returns ``False``, and the receiver MUST treat the response as an error.
  """
  if is_known_result_type(result_type):
    return True
  return result_type in accepted_result_types(active_set, active_contributions)


# ─── §24.3 / §24.4 — Active set ────────────────────────────────────────────────

def compute_active_set(client_extensions: object, server_extensions: object) -> list[str]:
  """Compute the active set: the intersection of the two advertised maps. (R-24.3-d)

  A thin, intention-revealing wrapper over S11's :func:`intersect_extensions`: each side's
  raw map is normalized (so ``None`` / malformed entries (R-24.3-c) and unrecognized
  one-sided identifiers (R-24.7-g) fall outside the intersection), and the result is a
  deterministic, sorted list. An empty or absent map on either side yields an empty active
  set (R-24.3-a).

  :param client_extensions: The client's advertised ``extensions`` map (raw).
  :param server_extensions: The server's advertised ``extensions`` map (raw).
  """
  return intersect_extensions(client_extensions, server_extensions)


def active_set_for_request(
  request_client_extensions: object,
  server_extensions: object,
) -> list[str]:
  """Compute the active set for ONE request under the stateless model. (R-24.4-a/-b/-c)

  Reads the client's capabilities from the request being processed and intersects them with
  the server's advertised capabilities. The result depends solely on
  ``request_client_extensions`` (this request's advertised client capabilities) and
  ``server_extensions``; nothing from a prior request is consulted. A request that does not
  advertise an extension therefore yields an active set without it — it is served as if that
  extension were inactive. (R-24.4-c)

  :param request_client_extensions: The ``extensions`` map carried in THIS request's
    ``io.modelcontextprotocol/clientCapabilities`` (raw; ``None`` ⇒ none).
  :param server_extensions: The server's advertised ``extensions`` map (raw).
  """
  return intersect_extensions(request_client_extensions, server_extensions)


def may_emit_extension_surface(identifier: str, active_set: Iterable[str]) -> bool:
  """Return ``True`` when an extension MAY emit its surface in the current interaction.

  It MAY iff it is present in ``active_set``. (R-24.1-c, R-24.3-e, R-24.5-c) Extensions are
  disabled by default — a peer MUST NOT emit a method, notification, reserved ``_meta`` key,
  ``resultType`` value, or field defined by an extension this predicate reports as not
  active.
  """
  active = active_set if isinstance(active_set, (set, frozenset)) else set(active_set)
  return identifier in active


# ─── §24.6 — Versioning, stability, deprecation ────────────────────────────────

def get_extension_version(
  extensions_map: object,
  identifier: str,
  version_key: str = "version",
) -> str | None:
  """Read an extension's version from the settings object it advertised. (R-24.6-a, R-24.6-b)

  The version is taken from the settings' ``version`` field when it is a string or a number
  (numbers are normalized to their string form). It is NEVER inferred from out-of-band
  information — when the extension is not advertised, or carries no ``version``, this returns
  ``None``. (R-24.6-b) ``bool`` is not a version (it is not a meaningful number here).

  :param extensions_map: A peer's advertised ``extensions`` map (raw).
  :param identifier: The extension whose version to read.
  :param version_key: The settings key carrying the version (default ``"version"``); an
    extension MAY use a different key per its own rules.
  """
  settings = get_extension_settings(extensions_map, identifier)
  if settings is None:
    return None
  raw = settings.get(version_key)
  if isinstance(raw, str):
    return raw
  if isinstance(raw, (int, float)) and not isinstance(raw, bool):
    # Reject non-finite floats (NaN/inf), which are not meaningful version markers.
    if isinstance(raw, float) and raw != raw:  # NaN
      return None
    if raw in (float("inf"), float("-inf")):
      return None
    if isinstance(raw, float) and raw.is_integer():
      return str(int(raw))
    return str(raw)
  return None


#: The kinds of change that are INCOMPATIBLE and therefore SHOULD be published under a new
#: identifier rather than evolved within one. (R-24.6-d)
ExtensionChangeKind = str

_INCOMPATIBLE_CHANGE_KINDS = frozenset(
  {"remove-field", "rename-field", "change-type", "change-semantics", "add-required-field"}
)
_COMPATIBLE_CHANGE_KINDS = frozenset({"add-optional-field", "add-capability-flag"})


def is_incompatible_change(kind: str) -> bool:
  """Return ``True`` when a change of ``kind`` is INCOMPATIBLE. (R-24.6-d)

  An incompatible change would cause an existing implementation to fail or behave
  incorrectly and therefore SHOULD be published under a new extension identifier.
  Backward-compatible changes (``add-optional-field``, ``add-capability-flag``) return
  ``False``; they SHOULD instead be expressed via capability flags / a version marker inside
  the existing identifier's settings object. (R-24.6-c)

  :raises ValueError: when ``kind`` is not a recognized change kind.
  """
  if kind in _INCOMPATIBLE_CHANGE_KINDS:
    return True
  if kind in _COMPATIBLE_CHANGE_KINDS:
    return False
  raise ValueError(f'Unknown extension change kind: "{kind}"')


def suggest_successor_identifier(identifier: str, suffix: str = "2") -> str:
  """Suggest a successor extension identifier for an incompatible change. (R-24.6-d)

  Keeps the two distinct in the negotiation map (e.g.
  ``com.example/my-extension → com.example/my-extension-2``). The suffix is appended to the
  identifier's NAME segment so the result is itself a well-formed identifier under the same
  vendor prefix.

  :raises ValueError: when ``identifier`` is malformed.
  """
  parsed = parse_extension_id(identifier)
  if parsed is None or not is_valid_extension_id(identifier):
    raise ValueError(
      f'Cannot derive a successor for malformed identifier "{identifier}" (R-24.6-d)'
    )
  return f"{parsed.prefix}/{parsed.name}-{suffix}"


# ─── §24.7 — Graceful degradation & required-extension errors ──────────────────

#: The JSON-RPC error code an implementation that MANDATES an extension uses when the other
#: side does not advertise it and it refuses the interaction. (R-24.7-f) The framework
#: defines no error code of its own; a mandated-but-absent extension is a "missing required
#: capability" condition, so this reuses the core ``-32003`` code rather than minting a new
#: one.
REQUIRED_EXTENSION_ABSENT_CODE = MISSING_CLIENT_CAPABILITY_CODE


@dataclass(frozen=True)
class RequiredExtensionError:
  """An actionable error for a mandated extension the other peer did not advertise.

  ``data["requiredExtension"]`` names the blocking extension so the failure is not opaque
  and an operator/developer can act on it. (R-24.7-e)
  """

  code: int
  message: str
  data: dict


def build_required_extension_error(identifier: str) -> RequiredExtensionError:
  """Build an actionable error for a required-but-absent extension. (R-24.7-d, R-24.7-e)

  The error identifies the required extension (in both the message and
  ``data["requiredExtension"]``) so the failure is not opaque.

  :param identifier: The required-but-absent extension identifier.
  """
  return RequiredExtensionError(
    code=REQUIRED_EXTENSION_ABSENT_CODE,
    message=f'Required extension not active: "{identifier}"',
    data={"requiredExtension": identifier},
  )


def decide_extension_use(
  *,
  identifier: str,
  active_set: Iterable[str],
  mandatory: bool,
) -> str:
  """Decide how a peer should handle an operation that could use ``identifier``. (R-24.7-a/-b/-d/-f)

  * active                    → ``"use-extension"``;
  * not active, not mandatory → ``"fallback"`` (use core behavior, R-24.7-a/-b);
  * not active, mandatory     → ``"reject"`` (surface an actionable error).

  Thin wrapper over S11's :func:`decide_extension_fallback` that derives ``active`` from
  membership in ``active_set``, so callers reason in terms of the active set rather than two
  raw maps.
  """
  return decide_extension_fallback(
    active=may_emit_extension_surface(identifier, active_set),
    mandatory=mandatory,
  )


# ─── Extension definition & no-redefinition guard ──────────────────────────────

@dataclass(frozen=True)
class ExtensionDefinition:
  """A declarative description of the surface a single extension contributes.

  The machine-checkable form of "an active extension MAY extend the surface ONLY in the four
  enumerated ways" (§24.5). A conformance suite can validate an extension's claimed surface
  against the framework using :func:`validate_extension_definition`.

  * ``identifier``     — the extension's globally unique identifier (§24.2).
  * ``classification`` — how the extension is characterized (§24.1).
  * ``methods``        — channel 1: request methods/notifications the extension defines
    (R-24.5-b).
  * ``meta_keys``      — channel 2: reserved ``_meta`` keys the extension defines (R-24.5-d).
  * ``result_types``   — channel 3: additional ``resultType`` discriminator values (R-24.5-e).
  * ``fields``         — channel 4: additional fields, as ``"<ObjectName>.<fieldName>"``
    (R-24.5-g).
  """

  identifier: str
  classification: str | None = None
  methods: tuple[str, ...] = ()
  meta_keys: tuple[str, ...] = ()
  result_types: tuple[str, ...] = ()
  fields: tuple[str, ...] = ()


@dataclass(frozen=True)
class ExtensionDefinitionViolation:
  """A single reason an :class:`ExtensionDefinition` fails framework conformance.

  * ``channel`` — which surface channel (or ``"identifier"``) the violation concerns.
  * ``value``   — the offending value (a method, key, resultType, field, or the identifier).
  * ``message`` — human-readable description of why it violates the framework.
  """

  channel: str
  value: str
  message: str


@dataclass(frozen=True)
class ExtensionDefinitionValidation:
  """Outcome of :func:`validate_extension_definition`.

  ``ok`` is ``True`` for a conforming definition; otherwise ``violations`` lists every
  problem found.
  """

  ok: bool
  violations: tuple[ExtensionDefinitionViolation, ...] = ()


def validate_extension_definition(definition: ExtensionDefinition) -> ExtensionDefinitionValidation:
  """Validate that an :class:`ExtensionDefinition` conforms to the §24 framework.

  A valid identifier, namespaced methods, controlled ``_meta`` keys, and no redefinition of
  core surface. (R-24-a, R-24.5-b, R-24.5-d, R-24.5-e, R-24.5-i) Checks, accumulating ALL
  violations:

  * the identifier is well-formed (R-24.2-a..d via :func:`is_valid_extension_id`);
  * every method is in the identifier-derived namespace (R-24.5-b);
  * every ``_meta`` key is under a prefix the extension controls (R-24.5-d);
  * no ``resultType`` collides with a core value — that would redefine core surface
    (R-24.5-i; a new value MUST be additional, R-24.5-e);
  * the extension classification, when present, is recognized (R-24.1-a).

  This realizes "a non-conforming extension is rejected by the conformance suite" (AC-38.1)
  and "surface added outside the mechanism is flagged non-conformant" (AC-38.5) for a
  declared surface.
  """
  violations: list[ExtensionDefinitionViolation] = []

  if not is_valid_extension_id(definition.identifier):
    violations.append(
      ExtensionDefinitionViolation(
        "identifier",
        definition.identifier,
        "Extension identifier is not well-formed (R-24.2-a..d)",
      )
    )
    # Without a valid identifier we cannot derive namespaces; report and stop.
    return ExtensionDefinitionValidation(False, tuple(violations))

  if definition.classification is not None and not is_extension_classification(
    definition.classification
  ):
    violations.append(
      ExtensionDefinitionViolation(
        "identifier",
        str(definition.classification),
        "Unknown extension classification (R-24.1-a)",
      )
    )

  for method in definition.methods:
    if not is_method_in_extension_namespace(method, definition.identifier):
      violations.append(
        ExtensionDefinitionViolation(
          "method",
          method,
          f'Method "{method}" is not namespaced under the extension (R-24.5-b)',
        )
      )

  for key in definition.meta_keys:
    if not is_extension_controlled_meta_key(key, definition.identifier):
      violations.append(
        ExtensionDefinitionViolation(
          "meta-key",
          key,
          f'_meta key "{key}" is not under a prefix the extension controls (R-24.5-d)',
        )
      )

  for result_type in definition.result_types:
    if is_known_result_type(result_type):
      violations.append(
        ExtensionDefinitionViolation(
          "result-type",
          result_type,
          f'resultType "{result_type}" redefines a core value; extensions may only add new '
          "values (R-24.5-e, R-24.5-i)",
        )
      )

  if violations:
    return ExtensionDefinitionValidation(False, tuple(violations))
  return ExtensionDefinitionValidation(True)


# ─── §24.5(1) — Active-set-gated method dispatch ───────────────────────────────

#: A handler for one extension-defined method: ``params -> result``.
ExtensionMethodHandler = Callable[[object], object]


@dataclass(frozen=True)
class _RegisteredExtensionMethod:
  """A registered method: its owning extension and its handler."""

  identifier: str
  handler: ExtensionMethodHandler


@dataclass(frozen=True)
class ExtensionDispatchOutcome:
  """Outcome of :meth:`ExtensionMethodRouter.dispatch`.

  On success ``ok`` is ``True`` and ``result`` carries the handler's return value. On
  rejection ``ok`` is ``False``, ``reason`` is one of:

  * ``"unknown-method"``     — no extension registered this method string;
  * ``"extension-inactive"`` — the owning extension is not in the active set (R-24.5-c);

  and ``code`` carries ``INVALID_PARAMS_CODE`` so a caller may convert the outcome into a
  core error response when it chooses to reject rather than ignore (R-24.3-f).
  """

  ok: bool
  result: object = None
  reason: str | None = None
  code: int | None = None


class ExtensionMethodRouter:
  """Routes extension-defined methods to their handlers, enforcing the framework rules.

  The two rules that govern dispatch:

  * method strings are namespaced under the registering extension (R-24.5-b);
  * a handler is invoked ONLY when its extension is in the active set for the interaction
    (R-24.5-c) — a non-active extension's method is never run.

  Registration validates the namespace eagerly so a misnamed method is rejected at wiring
  time, not silently at dispatch. The router holds no per-connection state; the active set
  is supplied per dispatch, honoring the stateless model (§24.4).
  """

  def __init__(self) -> None:
    self._methods: dict[str, _RegisteredExtensionMethod] = {}

  def register(
    self,
    identifier: str,
    method: str,
    handler: ExtensionMethodHandler,
  ) -> ExtensionMethodRouter:
    """Register ``handler`` for an extension-defined ``method``.

    The method MUST be in ``identifier``'s derived namespace (R-24.5-b) and MUST NOT already
    be registered (no redefinition, R-24.5-i). Returns ``self`` for chaining.

    :raises ValueError: when the method is not namespaced under ``identifier`` or the method
      string is already registered.
    """
    if not is_method_in_extension_namespace(method, identifier):
      raise ValueError(f'Method "{method}" is not namespaced under "{identifier}" (R-24.5-b)')
    if method in self._methods:
      raise ValueError(f'Method "{method}" is already registered (R-24.5-i)')
    self._methods[method] = _RegisteredExtensionMethod(identifier, handler)
    return self

  def has(self, method: str) -> bool:
    """Return ``True`` when ``method`` has a registered handler."""
    return method in self._methods

  def owner_of(self, method: str) -> str | None:
    """Return the extension identifier that owns ``method``, or ``None``."""
    registered = self._methods.get(method)
    return registered.identifier if registered is not None else None

  def dispatch(
    self,
    method: str,
    params: object,
    active_set: Iterable[str],
  ) -> ExtensionDispatchOutcome:
    """Dispatch ``method`` with ``params``, but only when the owning extension is active. (R-24.5-c)

    * unknown method            → ``ok=False, reason="unknown-method"``;
    * owning extension inactive → ``ok=False, reason="extension-inactive"`` (the method is
      NOT invoked — a non-active extension's surface is ignored);
    * otherwise                 → ``ok=True, result`` from the handler.

    Both rejections carry ``INVALID_PARAMS_CODE`` so a caller can convert the outcome into a
    core error response when it chooses to reject rather than ignore (R-24.3-f).
    """
    registered = self._methods.get(method)
    if registered is None:
      return ExtensionDispatchOutcome(False, reason="unknown-method", code=INVALID_PARAMS_CODE)
    if not may_emit_extension_surface(registered.identifier, active_set):
      return ExtensionDispatchOutcome(
        False, reason="extension-inactive", code=INVALID_PARAMS_CODE
      )
    return ExtensionDispatchOutcome(True, result=registered.handler(params))


# ─── Settings reconciliation (§24.3-g) ─────────────────────────────────────────

@dataclass(frozen=True)
class ReconciledExtensionSettings:
  """Both peers' advertised settings for an active extension. (R-24.3-g)

  ``client`` and ``server`` are each the settings object that side advertised (already
  cleaned of ``None``/malformed entries by S11). The extension itself decides how to combine
  them.
  """

  client: dict
  server: dict


def reconcile_extension_settings(
  client_extensions: object,
  server_extensions: object,
  identifier: str,
) -> ReconciledExtensionSettings | None:
  """Reconcile the settings a peer advertised for ``identifier`` on each side. (R-24.3-g)

  Returns ``None`` when the extension is not advertised by BOTH peers (it is not active, so
  there is nothing to reconcile). Each side's settings are returned as-is; the extension
  itself decides how to combine them (e.g. intersect MIME types, pick the lower version).

  :param client_extensions: The client's advertised ``extensions`` map (raw).
  :param server_extensions: The server's advertised ``extensions`` map (raw).
  :param identifier: The extension whose settings to reconcile.
  """
  if not is_extension_advertised(client_extensions, identifier):
    return None
  if not is_extension_advertised(server_extensions, identifier):
    return None
  client = get_extension_settings(client_extensions, identifier)
  server = get_extension_settings(server_extensions, identifier)
  if client is None or server is None:
    return None
  return ReconciledExtensionSettings(client, server)
