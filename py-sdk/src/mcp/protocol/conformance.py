"""Feature lifecycle status (§27, R-1.3-b, R-2.2-f – R-2.2-h).

A feature with status ``deprecated`` remains defined and MUST still be accepted by
receivers, but SHOULD NOT be relied upon by new implementations. This module owns
only the lifecycle-status vocabulary; the conformance requirements registry that
references it lives in :mod:`mcp.protocol.conformance_requirements`.
"""

from __future__ import annotations

from typing import Final

# ─── §27 Feature lifecycle status ─────────────────────────────────────────────

#: A feature that is current and may be relied upon by new implementations.
FEATURE_STATUS_ACTIVE: Final = "active"

#: A feature that remains defined and MUST still be accepted by receivers, but
#: SHOULD NOT be relied upon by new implementations. (§27, R-2.2-f – R-2.2-h)
FEATURE_STATUS_DEPRECATED: Final = "deprecated"


class FeatureStatus:
  """The feature lifecycle statuses, as a namespace of string constants.

  Mirrors the TS ``FeatureStatus`` const object: ``FeatureStatus.Active`` /
  ``FeatureStatus.Deprecated`` map to the wire values ``"active"`` / ``"deprecated"``.
  Exposed as class attributes so callers can write ``FeatureStatus.Active`` exactly
  as the TS SDK does, while the module-level ``FEATURE_STATUS_*`` constants serve
  idiomatic Python use. (§27)
  """

  Active: Final = FEATURE_STATUS_ACTIVE
  Deprecated: Final = FEATURE_STATUS_DEPRECATED


#: The full set of recognized feature lifecycle statuses, in spec order. (§27)
FEATURE_STATUSES: Final[tuple[str, ...]] = (FEATURE_STATUS_ACTIVE, FEATURE_STATUS_DEPRECATED)


def is_feature_status(value: object) -> bool:
  """Return ``True`` when ``value`` is a recognized :class:`FeatureStatus`. (§27)"""
  return value in FEATURE_STATUSES
