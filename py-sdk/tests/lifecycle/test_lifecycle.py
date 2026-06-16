"""Tests for the Feature Lifecycle and Deprecation module (§27).

Mirrors the TS coverage across three files (state.test.ts, policy.test.ts,
registry.test.ts) and adds Python-specific and normative edge cases:

  - §27.1 three-state model + LifecycleRecord / DeprecatedRegistryEntry shapes.
  - §27.2 transition machine (Active→Removed forbidden, Removed terminal, same-state
    invalid, Deprecated↔Active restoration) and calendar-month / window arithmetic
    (standard 12 months, expedited 90 days, end-of-month clamping, leap-year clamping,
    naive-vs-aware datetimes, re-deprecation measured afresh).
  - §27.3 registry completeness + lookup.
  - §27.4 out-of-band runtime warning emission (stderr, advisory, returns None).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest

from mcp.lifecycle.policy import (
  EXPEDITED_MINIMUM_DAYS,
  STANDARD_DEPRECATION_MONTHS,
  add_calendar_months,
  assert_valid_transition,
  can_transition,
  is_eligible_for_removal,
)
from mcp.lifecycle.registry import (
  DEPRECATED_REGISTRY,
  emit_deprecation_warning,
  find_deprecated_entry,
)
from mcp.lifecycle.state import (
  LIFECYCLE_STATES,
  DeprecatedRegistryEntry,
  LifecycleRecord,
  LifecycleState,
)

UTC = timezone.utc


def _utc(year, month, day, hour=0, minute=0, second=0, micro=0):
  return datetime(year, month, day, hour, minute, second, micro, tzinfo=UTC)


# ─── §27.1 LifecycleState values (AC-43.1 — R-27.1-a) ──────────────────────────


class TestLifecycleStateValues:
  def test_has_active_state(self):
    assert LifecycleState.Active == "active"

  def test_has_deprecated_state(self):
    assert LifecycleState.Deprecated == "deprecated"

  def test_has_removed_state(self):
    assert LifecycleState.Removed == "removed"

  def test_has_exactly_three_states(self):
    assert len(LIFECYCLE_STATES) == 3
    assert set(LIFECYCLE_STATES) == {"active", "deprecated", "removed"}

  def test_states_in_declaration_order(self):
    assert LIFECYCLE_STATES == (
      LifecycleState.Active,
      LifecycleState.Deprecated,
      LifecycleState.Removed,
    )

  def test_states_are_distinct(self):
    assert len(set(LIFECYCLE_STATES)) == 3


# ─── §27.1 / §27.2 governance record shapes (AC-43.6) ──────────────────────────


class TestLifecycleRecord:
  def test_minimal_active_record(self):
    rec = LifecycleRecord(feature="tools/list", state=LifecycleState.Active)
    assert rec.feature == "tools/list"
    assert rec.state == "active"
    assert rec.deprecated_since is None
    assert rec.earliest_removal is None
    assert rec.migration is None
    assert rec.expedited is None

  def test_full_deprecated_record(self):
    rec = LifecycleRecord(
      feature="Roots capability",
      state=LifecycleState.Deprecated,
      deprecated_since="2025-07-28",
      earliest_removal="2026-07-28",
      migration="none required",
      expedited=False,
    )
    assert rec.state == "deprecated"
    assert rec.deprecated_since == "2025-07-28"
    assert rec.earliest_removal == "2026-07-28"
    assert rec.migration == "none required"
    assert rec.expedited is False

  def test_expedited_record(self):
    rec = LifecycleRecord(
      feature="vuln-feature",
      state=LifecycleState.Deprecated,
      deprecated_since="2025-01-01",
      migration="patch now",
      expedited=True,
    )
    assert rec.expedited is True


class TestDeprecatedRegistryEntryShape:
  def test_constructs_with_all_fields(self):
    entry = DeprecatedRegistryEntry(
      feature="X",
      defined_in="§21",
      migration_note="use Y",
      earliest_removal="2026-07-28",
    )
    assert entry.feature == "X"
    assert entry.defined_in == "§21"
    assert entry.migration_note == "use Y"
    assert entry.earliest_removal == "2026-07-28"


# ─── §27.2 valid transitions (AC-43.2 — R-27.2 item 1) ─────────────────────────


class TestValidTransitions:
  def test_active_to_deprecated_is_valid(self):
    assert can_transition(LifecycleState.Active, LifecycleState.Deprecated) is True

  def test_deprecated_to_removed_is_valid(self):
    assert can_transition(LifecycleState.Deprecated, LifecycleState.Removed) is True

  def test_deprecated_to_active_restoration_is_valid(self):
    # §27.2 item 7 (R-27.2-n): a Deprecated feature MAY be restored to Active.
    assert can_transition(LifecycleState.Deprecated, LifecycleState.Active) is True


# ─── §27.2 forbidden: Active → Removed (AC-43.3 — R-27.2-b) ────────────────────


class TestForbiddenActiveToRemoved:
  def test_can_transition_false_for_active_to_removed(self):
    assert can_transition(LifecycleState.Active, LifecycleState.Removed) is False

  def test_assert_valid_transition_raises_for_active_to_removed(self):
    with pytest.raises(ValueError):
      assert_valid_transition(LifecycleState.Active, LifecycleState.Removed)

  def test_error_message_cites_rules(self):
    with pytest.raises(ValueError, match="R-27.2-a, R-27.2-b"):
      assert_valid_transition(LifecycleState.Active, LifecycleState.Removed)


# ─── §27.2 Removed is terminal (AC-43.4) ───────────────────────────────────────


class TestRemovedIsTerminal:
  def test_removed_to_active_forbidden(self):
    assert can_transition(LifecycleState.Removed, LifecycleState.Active) is False

  def test_removed_to_deprecated_forbidden(self):
    assert can_transition(LifecycleState.Removed, LifecycleState.Deprecated) is False

  def test_removed_to_removed_forbidden(self):
    assert can_transition(LifecycleState.Removed, LifecycleState.Removed) is False

  def test_assert_removed_to_active_raises(self):
    with pytest.raises(ValueError):
      assert_valid_transition(LifecycleState.Removed, LifecycleState.Active)

  def test_assert_removed_to_deprecated_raises(self):
    with pytest.raises(ValueError):
      assert_valid_transition(LifecycleState.Removed, LifecycleState.Deprecated)


# ─── §27.2 same-state is not a transition (AC-43.5) ────────────────────────────


class TestSameStateInvalid:
  def test_active_to_active_invalid(self):
    assert can_transition(LifecycleState.Active, LifecycleState.Active) is False

  def test_deprecated_to_deprecated_invalid(self):
    assert can_transition(LifecycleState.Deprecated, LifecycleState.Deprecated) is False

  def test_removed_to_removed_invalid(self):
    assert can_transition(LifecycleState.Removed, LifecycleState.Removed) is False

  def test_assert_same_state_raises(self):
    with pytest.raises(ValueError):
      assert_valid_transition(LifecycleState.Active, LifecycleState.Active)


# ─── §27.2 assert_valid_transition allowed paths do not raise (AC-43.18) ────────


class TestAssertValidTransitionAllowed:
  def test_active_to_deprecated_does_not_raise(self):
    assert assert_valid_transition(LifecycleState.Active, LifecycleState.Deprecated) is None

  def test_deprecated_to_removed_does_not_raise(self):
    assert assert_valid_transition(LifecycleState.Deprecated, LifecycleState.Removed) is None

  def test_deprecated_to_active_does_not_raise(self):
    assert assert_valid_transition(LifecycleState.Deprecated, LifecycleState.Active) is None


# ─── §27.2 window constants (AC-43.7, AC-43.8) ─────────────────────────────────


class TestPolicyConstants:
  def test_standard_deprecation_months_is_12(self):
    assert STANDARD_DEPRECATION_MONTHS == 12

  def test_expedited_minimum_days_is_90(self):
    assert EXPEDITED_MINIMUM_DAYS == 90


# ─── §27.2 add_calendar_months (AC-43.15, AC-43.16) ────────────────────────────


class TestAddCalendarMonths:
  def test_adds_months_within_same_year(self):
    result = add_calendar_months(_utc(2025, 1, 15), 3)
    assert result.year == 2025
    assert result.month == 4  # April
    assert result.day == 15

  def test_crosses_year_boundary(self):
    result = add_calendar_months(_utc(2025, 11, 10), 3)
    assert result.year == 2026
    assert result.month == 2  # February

  def test_adds_twelve_months(self):
    result = add_calendar_months(_utc(2025, 4, 1), 12)
    assert result.year == 2026
    assert result.month == 4  # April

  def test_clamps_to_end_of_month_non_leap(self):
    # Jan 31 + 1 month = Feb 28 (2025 is not a leap year).
    result = add_calendar_months(_utc(2025, 1, 31), 1)
    assert result.year == 2025
    assert result.month == 2
    assert result.day == 28

  def test_clamps_to_end_of_month_leap_year(self):
    # Jan 31 2024 + 1 month = Feb 29 (2024 is a leap year).
    result = add_calendar_months(_utc(2024, 1, 31), 1)
    assert result.year == 2024
    assert result.month == 2
    assert result.day == 29

  def test_clamps_31_day_to_30_day_month(self):
    # May 31 + 1 month = June 30.
    result = add_calendar_months(_utc(2025, 5, 31), 1)
    assert result.month == 6
    assert result.day == 30

  def test_preserves_time_of_day(self):
    result = add_calendar_months(_utc(2025, 3, 10, 13, 45, 9, 500), 1)
    assert (result.hour, result.minute, result.second, result.microsecond) == (13, 45, 9, 500)

  def test_result_is_utc_aware(self):
    result = add_calendar_months(_utc(2025, 1, 1), 1)
    assert result.tzinfo == UTC

  def test_zero_months_returns_same_calendar_point(self):
    result = add_calendar_months(_utc(2025, 6, 15), 0)
    assert (result.year, result.month, result.day) == (2025, 6, 15)

  def test_december_plus_one_rolls_to_january(self):
    result = add_calendar_months(_utc(2025, 12, 15), 1)
    assert result.year == 2026
    assert result.month == 1
    assert result.day == 15

  def test_more_than_twelve_months(self):
    result = add_calendar_months(_utc(2025, 1, 1), 25)
    assert result.year == 2027
    assert result.month == 2


# ─── §27.2 is_eligible_for_removal — standard window (AC-43.9 to AC-43.12) ──────


class TestEligibilityStandardWindow:
  DEPRECATED = _utc(2025, 1, 1)

  def test_not_eligible_at_11_months(self):
    eleven_months = _utc(2025, 12, 1)
    assert is_eligible_for_removal(self.DEPRECATED, eleven_months) is False

  def test_eligible_at_exactly_12_months(self):
    twelve_months = _utc(2026, 1, 1)
    assert is_eligible_for_removal(self.DEPRECATED, twelve_months) is True

  def test_eligible_after_more_than_12_months(self):
    thirteen_months = _utc(2026, 2, 1)
    assert is_eligible_for_removal(self.DEPRECATED, thirteen_months) is True

  def test_not_eligible_one_second_before_window_closes(self):
    just_before = _utc(2025, 12, 31, 23, 59, 59)
    assert is_eligible_for_removal(self.DEPRECATED, just_before) is False

  def test_eligible_one_second_after_window_closes(self):
    just_after = _utc(2026, 1, 1, 0, 0, 1)
    assert is_eligible_for_removal(self.DEPRECATED, just_after) is True

  def test_not_eligible_at_deprecation_instant(self):
    assert is_eligible_for_removal(self.DEPRECATED, self.DEPRECATED) is False

  def test_clamped_end_of_month_window(self):
    # Deprecated Feb 29 2024; +12 months clamps to Feb 28 2025.
    deprecated = _utc(2024, 2, 29)
    assert is_eligible_for_removal(deprecated, _utc(2025, 2, 27)) is False
    assert is_eligible_for_removal(deprecated, _utc(2025, 2, 28)) is True


# ─── §27.2 is_eligible_for_removal — expedited window (AC-43.13, AC-43.14) ──────


class TestEligibilityExpeditedWindow:
  DEPRECATED = _utc(2025, 1, 1)

  def test_not_eligible_at_89_days(self):
    eighty_nine = self.DEPRECATED + timedelta(days=89)
    assert is_eligible_for_removal(self.DEPRECATED, eighty_nine, expedited=True) is False

  def test_eligible_at_exactly_90_days(self):
    ninety = self.DEPRECATED + timedelta(days=90)
    assert is_eligible_for_removal(self.DEPRECATED, ninety, expedited=True) is True

  def test_eligible_after_more_than_90_days(self):
    ninety_one = self.DEPRECATED + timedelta(days=91)
    assert is_eligible_for_removal(self.DEPRECATED, ninety_one, expedited=True) is True

  def test_not_eligible_one_second_before_90_days(self):
    almost = self.DEPRECATED + timedelta(days=90) - timedelta(seconds=1)
    assert is_eligible_for_removal(self.DEPRECATED, almost, expedited=True) is False

  def test_expedited_window_shorter_than_standard(self):
    # At 90 days, expedited is eligible but standard (12 months) is not.
    ninety = self.DEPRECATED + timedelta(days=90)
    assert is_eligible_for_removal(self.DEPRECATED, ninety, expedited=True) is True
    assert is_eligible_for_removal(self.DEPRECATED, ninety, expedited=False) is False


# ─── §27.2 item 7 — re-deprecation window measured afresh (R-27.2-p) ────────────


class TestReDeprecationMeasuredAfresh:
  def test_window_resets_on_re_deprecation(self):
    # A feature first deprecated 2024-01-01, restored, then re-deprecated 2025-06-01.
    # The new window is measured ONLY from the new deprecation point — time already
    # spent Deprecated is NOT counted (§27.2 item 7).
    re_deprecated = _utc(2025, 6, 1)
    # 12 months after the *original* deprecation would be 2025-01-01; not yet eligible
    # under the fresh window, because the fresh window closes 2026-06-01.
    assert is_eligible_for_removal(re_deprecated, _utc(2026, 5, 1)) is False
    assert is_eligible_for_removal(re_deprecated, _utc(2026, 6, 1)) is True


# ─── datetime handling: naive datetimes treated as UTC ─────────────────────────


class TestNaiveDatetimeHandling:
  def test_naive_deprecated_and_now_treated_as_utc(self):
    deprecated = datetime(2025, 1, 1)  # naive
    not_yet = datetime(2025, 12, 1)
    eligible = datetime(2026, 1, 1)
    assert is_eligible_for_removal(deprecated, not_yet) is False
    assert is_eligible_for_removal(deprecated, eligible) is True

  def test_mixed_naive_and_aware(self):
    deprecated = datetime(2025, 1, 1)  # naive → treated UTC
    eligible = _utc(2026, 1, 1)  # aware UTC
    assert is_eligible_for_removal(deprecated, eligible) is True

  def test_naive_add_calendar_months_returns_utc(self):
    result = add_calendar_months(datetime(2025, 1, 31), 1)
    assert result.tzinfo == UTC
    assert (result.month, result.day) == (2, 28)


# ─── §27.3 registry structure (AC-43.21, AC-43.22, AC-43.23) ───────────────────

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class TestRegistryStructure:
  def test_is_non_empty_sequence(self):
    assert isinstance(DEPRECATED_REGISTRY, tuple)
    assert len(DEPRECATED_REGISTRY) > 0

  def test_every_entry_has_required_fields(self):
    for entry in DEPRECATED_REGISTRY:
      assert isinstance(entry.feature, str) and len(entry.feature) > 0
      assert isinstance(entry.defined_in, str) and len(entry.defined_in) > 0
      assert isinstance(entry.migration_note, str) and len(entry.migration_note) > 0
      assert isinstance(entry.earliest_removal, str)

  def test_every_earliest_removal_is_iso_date(self):
    for entry in DEPRECATED_REGISTRY:
      assert ISO_DATE.match(entry.earliest_removal)

  def test_feature_names_are_unique(self):
    names = [e.feature for e in DEPRECATED_REGISTRY]
    assert len(names) == len(set(names))


# ─── §27.3 known deprecated features (AC-43.24 to AC-43.29) ────────────────────


class TestKnownDeprecatedFeatures:
  def test_contains_roots_capability(self):
    assert find_deprecated_entry("Roots capability") is not None

  def test_contains_sampling_capability(self):
    assert find_deprecated_entry("Sampling capability") is not None

  def test_contains_include_context_values(self):
    matches = [e for e in DEPRECATED_REGISTRY if "includecontext" in e.feature.lower()]
    assert len(matches) >= 1

  def test_contains_logging_capability(self):
    matches = [e for e in DEPRECATED_REGISTRY if "logging capability" in e.feature.lower()]
    assert len(matches) >= 1

  def test_contains_log_level_meta_key(self):
    matches = [e for e in DEPRECATED_REGISTRY if "logLevel" in e.feature]
    assert len(matches) >= 1

  def test_contains_dynamic_client_registration(self):
    matches = [
      e for e in DEPRECATED_REGISTRY if "dynamic client registration" in e.feature.lower()
    ]
    assert len(matches) >= 1

  def test_has_six_registered_features(self):
    assert len(DEPRECATED_REGISTRY) == 6

  def test_all_defined_in_known_sections(self):
    for entry in DEPRECATED_REGISTRY:
      assert entry.defined_in in {"§21", "§15", "§23"}


# ─── §27.3 find_deprecated_entry ───────────────────────────────────────────────


class TestFindDeprecatedEntry:
  def test_returns_matching_entry(self):
    entry = find_deprecated_entry("Roots capability")
    assert entry is not None
    assert entry.feature == "Roots capability"
    assert entry.defined_in == "§21"

  def test_returns_none_for_unknown_feature(self):
    assert find_deprecated_entry("nonexistent-feature-xyz") is None

  def test_lookup_is_case_sensitive(self):
    # Exact-match lookup; a differently-cased name does not resolve.
    assert find_deprecated_entry("roots capability") is None

  def test_empty_string_not_found(self):
    assert find_deprecated_entry("") is None


# ─── §27.4 emit_deprecation_warning (AC-43.30 to AC-43.33) ─────────────────────


class TestEmitDeprecationWarning:
  def test_writes_to_stderr(self, capsys):
    emit_deprecation_warning("TestFeature", "Use newFeature instead.")
    captured = capsys.readouterr()
    assert captured.err != ""
    # Out-of-band: nothing written to stdout (the protocol wire). (R-27.4-e)
    assert captured.out == ""

  def test_message_includes_feature_name(self, capsys):
    emit_deprecation_warning("TestFeature", "Use newFeature instead.")
    captured = capsys.readouterr()
    assert "TestFeature" in captured.err

  def test_message_includes_migration_note(self, capsys):
    emit_deprecation_warning("TestFeature", "Use newFeature instead.")
    captured = capsys.readouterr()
    assert "Use newFeature instead." in captured.err

  def test_message_marks_deprecation(self, capsys):
    emit_deprecation_warning("TestFeature", "Use newFeature instead.")
    captured = capsys.readouterr()
    assert "Deprecated feature used" in captured.err

  def test_returns_none(self, capsys):
    result = emit_deprecation_warning("TestFeature", "Use newFeature instead.")
    capsys.readouterr()
    assert result is None

  def test_can_emit_for_registry_entry(self, capsys):
    entry = find_deprecated_entry("Roots capability")
    assert entry is not None
    emit_deprecation_warning(entry.feature, entry.migration_note)
    captured = capsys.readouterr()
    assert "Roots capability" in captured.err
    assert entry.migration_note in captured.err


# ─── §27.4 native-language deprecation markers (R-27.4-a — AC required) ─────────

# R-27.4-a (S43-RQ-12, MUST): a Deprecated feature exposed through an API surface that
# has a native-language deprecation mechanism MUST be marked using that mechanism. In
# Python the idiomatic, tooling-recognised marker is a Sphinx ``.. deprecated::`` directive
# in the public symbol's ``__doc__``. The TS reference marks six surfaces with
# ``@deprecated``; these assertions pin the Python parity surfaces so a future edit that
# drops a marker fails loudly (TS has no equivalent test — this closes that blind spot).


class TestNativeDeprecationMarkers:
  """Every Deprecated public surface carries a native ``.. deprecated::`` marker, and that
  marker references the §27.3 migration path plus the earliest-removal window (which also
  satisfies the Recommended S43-RC-5/RC-6). (R-27.4-a)
  """

  def _doc(self, obj) -> str:
    doc = obj.__doc__
    assert doc is not None, f"{getattr(obj, '__name__', obj)!r} has no docstring"
    return doc

  def test_roots_capability_value_marked(self):
    from mcp.protocol.roots import (
      Root,
      RootsCapabilityValue,
      is_valid_roots_capability_value,
    )

    for obj in (RootsCapabilityValue, is_valid_roots_capability_value, Root):
      assert ".. deprecated::" in self._doc(obj)

  def test_sampling_surfaces_marked(self):
    from mcp.protocol.sampling import (
      SamplingMessage,
      is_deprecated_include_context,
      is_valid_sampling_message,
    )

    for obj in (SamplingMessage, is_valid_sampling_message, is_deprecated_include_context):
      assert ".. deprecated::" in self._doc(obj)

  def test_logging_log_level_meta_key_marked(self):
    from mcp.protocol.meta import is_valid_logging_level

    assert ".. deprecated::" in self._doc(is_valid_logging_level)

  def test_logging_notification_surface_marked(self):
    from mcp.protocol.logging import is_valid_logging_message_notification

    assert ".. deprecated::" in self._doc(is_valid_logging_message_notification)

  def test_dynamic_client_registration_marked(self):
    from mcp.protocol.authorization_flow import build_dynamic_client_registration_request

    assert ".. deprecated::" in self._doc(build_dynamic_client_registration_request)

  def test_legacy_titled_enum_marked(self):
    from mcp.protocol.elicitation_form import (
      LegacyTitledEnum,
      is_legacy_titled_enum_schema,
    )

    for obj in (LegacyTitledEnum, is_legacy_titled_enum_schema):
      assert ".. deprecated::" in self._doc(obj)

  def test_markers_reference_migration_and_removal_window(self):
    # The four S43-P0 surfaces must cite the §27.3 migration path and the 2026-07-28
    # earliest-removal window (S43-RC-5 / RC-6), not merely the bare directive.
    from mcp.protocol.roots import RootsCapabilityValue
    from mcp.protocol.sampling import SamplingMessage, is_deprecated_include_context
    from mcp.protocol.meta import is_valid_logging_level

    for obj in (
      RootsCapabilityValue,
      SamplingMessage,
      is_deprecated_include_context,
      is_valid_logging_level,
    ):
      doc = self._doc(obj)
      assert "§27.3" in doc
      assert "2026-07-28" in doc

  def test_exactly_six_source_files_carry_markers(self):
    # The S43 worklist fixes four surfaces on top of the two already marked
    # (logging, authorization_flow), for six source modules total. Lock that count so a
    # dropped or stray marker is caught. (R-27.4-a; P0-verify)
    from pathlib import Path

    import mcp

    mcp_root = Path(mcp.__file__).parent
    marked = sorted(
      p.relative_to(mcp_root).as_posix()
      for p in mcp_root.rglob("*.py")
      if ".. deprecated::" in p.read_text(encoding="utf-8")
    )
    assert marked == [
      "protocol/authorization_flow.py",
      "protocol/elicitation_form.py",
      "protocol/logging.py",
      "protocol/meta.py",
      "protocol/roots.py",
      "protocol/sampling.py",
    ], marked
