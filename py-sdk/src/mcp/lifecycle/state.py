"""Feature lifecycle state model (§27.1).

Every feature governed by this document — any protocol message, capability, transport,
schema type, metadata key, or normative behavioral requirement — is, at any moment, in
exactly one of three lifecycle states. The allowed transitions enforce the policy in
§27.2 (see :mod:`mcp.lifecycle.policy`):

  - ``Active → Deprecated``   always permitted.
  - ``Deprecated → Active``   restoration permitted (R-27.2-n, §27.2 item 7).
  - ``Deprecated → Removed``  permitted only after the minimum window elapses (R-27.2-a).
  - ``Active → Removed``      FORBIDDEN; deprecation MUST precede removal (R-27.2-b).

This module is governance bookkeeping — these are conceptual records, NOT wire types.
The :class:`LifecycleState` constant set mirrors the TS ``const LifecycleState`` object
(a closed set of three string literals), exposed here as plain string constants on a
namespace class so callers can write ``LifecycleState.Active`` exactly as in TS.
"""

from __future__ import annotations

from dataclasses import dataclass

# ─── §27.1 The three lifecycle states ─────────────────────────────────────────


class LifecycleState:
  """The three possible lifecycle states of a protocol feature. (§27.1)

  Mirrors the TS ``const LifecycleState = {...} as const``: a closed set of three
  string-literal values. The members are the wire/string values themselves, so equality
  comparison against a raw string (``state == LifecycleState.Active``) works directly.
  """

  #: Fully supported and recommended; implemented exactly as specified. (R-27.1-a)
  Active = "active"
  #: Still defined and functional; discouraged for new use; scheduled for eventual
  #: removal; carries a migration note. (R-27.1-b)
  Deprecated = "deprecated"
  #: Not defined by the document; carries no meaning; imposes no obligation. A Removed
  #: feature is simply absent from the spec text and registries.
  Removed = "removed"


#: All lifecycle state values, in declaration order. (§27.1)
LIFECYCLE_STATES: tuple[str, ...] = (
  LifecycleState.Active,
  LifecycleState.Deprecated,
  LifecycleState.Removed,
)


# ─── §27.1 / §27.2 Per-feature governance record ──────────────────────────────


@dataclass
class LifecycleRecord:
  """Per-feature lifecycle bookkeeping (§27.1, §27.2).

  A conceptual governance record, NOT a wire type. ``deprecated_since`` /
  ``earliest_removal`` / ``migration`` are present only while the feature is Deprecated;
  a Deprecated feature MUST carry a migration note or an explicit "none required"
  statement (R-27.2-g, §27.2 item 4). ``expedited`` marks a security-shortened window
  whose floor is 90 days (R-27.2-k, R-27.2-l, §27.2 item 6).
  """

  #: Identifier of the governed feature (method, capability, type, etc.).
  feature: str
  #: Current lifecycle state.
  state: str
  #: ISO-8601 date when the feature first became Deprecated. Present only when Deprecated.
  deprecated_since: str | None = None
  #: Protocol revision on/after which the feature becomes eligible for removal. (R-27.2-c)
  earliest_removal: str | None = None
  #: Documented migration path, or ``"none required"``. REQUIRED when Deprecated. (R-27.2-g)
  migration: str | None = None
  #: Whether a security-driven shortened window applies (minimum 90 days). (R-27.2-k/-l)
  expedited: bool | None = None


# ─── §27.3 Derived registry row ───────────────────────────────────────────────


@dataclass
class DeprecatedRegistryEntry:
  """One row of the derived registry of deprecated features (§27.3).

  The registry is a consolidated, derived view; the per-feature notices at the
  authoritative defining sections resolve any conflict.
  """

  #: Name of the deprecated feature.
  feature: str
  #: Section reference where the feature is authoritatively defined.
  defined_in: str
  #: One-line migration guidance. (R-27.2-g)
  migration_note: str
  #: Protocol revision on/after which removal is eligible.
  earliest_removal: str
