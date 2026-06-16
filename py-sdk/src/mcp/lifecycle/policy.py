"""Deprecation policy enforcement (§27.2).

Enforces the §27.2 state-machine transitions and the minimum deprecation windows:

  - ``Active → Removed`` is FORBIDDEN; deprecation MUST precede removal. (R-27.2-b)
  - Standard minimum window: 12 calendar months. (R-27.2-c, §27.2 item 2)
  - Security-expedited minimum window: 90 days, and a window shorter than 90 days is
    NOT permitted. (R-27.2-l, §27.2 item 6)
  - A Deprecated feature MAY be restored to Active. (R-27.2-n, §27.2 item 7)
  - On re-deprecation the window is measured afresh; time already spent Deprecated is
    NOT counted toward the new window. (R-27.2-p, §27.2 item 7)

Eligibility is a NECESSARY condition for removal, never a mandate: the earliest-removal
point marks only when a feature *becomes eligible*, and a feature MAY remain Deprecated
for substantially longer than the minimum. (R-27.2-d, §27.2 item 2)

Date arithmetic mirrors the TS SDK's UTC ``Date`` handling. Inputs are
:class:`datetime.datetime` instances interpreted in UTC; comparisons are by absolute
instant (POSIX timestamp), exactly as the TS code compares ``Date.getTime()`` values.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timezone

from mcp.lifecycle.state import LifecycleState

# ─── §27.2 Window constants ───────────────────────────────────────────────────

#: Minimum deprecation window for a standard (non-expedited) removal. (R-27.2-c)
STANDARD_DEPRECATION_MONTHS = 12

#: Minimum days for a security-expedited deprecation window. (R-27.2-l)
EXPEDITED_MINIMUM_DAYS = 90


# ─── §27.2 item 1 — state-machine transitions ─────────────────────────────────


def can_transition(from_state: str, to_state: str) -> bool:
  """Return ``True`` when the transition ``from_state → to_state`` is permitted. (§27.2)

  Permitted:  ``Active → Deprecated``, ``Deprecated → Active``, ``Deprecated → Removed``.
  Forbidden:  ``Active → Removed`` (R-27.2-b), any transition out of ``Removed``
  (Removed is terminal), and any same-state "transition" (not a transition at all).
  """
  if from_state == to_state:
    return False
  if from_state == LifecycleState.Active and to_state == LifecycleState.Removed:
    return False
  if from_state == LifecycleState.Removed:
    return False
  return True


def assert_valid_transition(from_state: str, to_state: str) -> None:
  """Assert the transition ``from_state → to_state`` is permitted. (§27.2 items 1, 7)

  :raises ValueError: when the transition is forbidden.
  """
  if not can_transition(from_state, to_state):
    raise ValueError(
      f"Forbidden lifecycle transition: {from_state} → {to_state}. "
      "A feature MUST pass through Deprecated before it can be Removed (R-27.2-a, R-27.2-b)."
    )


# ─── §27.2 item 2 — calendar-month arithmetic & removal eligibility ────────────


def add_calendar_months(date: datetime, months: int) -> datetime:
  """Add ``months`` calendar months to ``date`` using UTC arithmetic. (§27.2 item 2)

  Avoids local-timezone distortion by computing on the UTC components. The day is clamped
  to the last valid day of the target month when the original day overflows
  (e.g. ``Jan 31 + 1 month → Feb 28``), matching the TS SDK's ``setUTCDate(0)`` rollback.
  The result is a timezone-aware UTC datetime that preserves the time-of-day components.
  """
  total_months = (date.month - 1) + months
  new_year = date.year + total_months // 12
  new_month = total_months % 12 + 1
  # Clamp the day to the last valid day of the target month (e.g. Jan 31 → Feb 28/29).
  last_day = calendar.monthrange(new_year, new_month)[1]
  new_day = min(date.day, last_day)
  return datetime(
    new_year,
    new_month,
    new_day,
    date.hour,
    date.minute,
    date.second,
    date.microsecond,
    tzinfo=timezone.utc,
  )


def _utc_timestamp(date: datetime) -> float:
  """Return ``date`` as a POSIX timestamp interpreted in UTC.

  A naive datetime is treated as UTC (mirroring the TS code, where all dates are UTC),
  rather than coerced through the local timezone.
  """
  if date.tzinfo is None:
    date = date.replace(tzinfo=timezone.utc)
  return date.timestamp()


def is_eligible_for_removal(
  deprecated_since: datetime,
  now: datetime,
  expedited: bool = False,
) -> bool:
  """Return ``True`` when a Deprecated feature is eligible for removal. (§27.2 item 2/6)

  Eligibility means the minimum window has elapsed: 12 calendar months by default
  (R-27.2-c), or the 90-day floor when ``expedited`` is set (R-27.2-l). Eligibility is a
  NECESSARY condition for removal, not a mandate — a feature MAY remain Deprecated
  indefinitely. (R-27.2-d)

  :param deprecated_since: the date the feature first became Deprecated.
  :param now: the date to test against (usually the current date).
  :param expedited: when ``True``, applies the 90-day minimum instead of 12 months.
  """
  if expedited:
    min_seconds = EXPEDITED_MINIMUM_DAYS * 24 * 60 * 60
    return _utc_timestamp(now) - _utc_timestamp(deprecated_since) >= min_seconds
  earliest = add_calendar_months(deprecated_since, STANDARD_DEPRECATION_MONTHS)
  return _utc_timestamp(now) >= _utc_timestamp(earliest)
