using Stackific.Mcp.Lifecycle;

namespace Stackific.Mcp.Tests.Lifecycle;

/// <summary>
/// Coverage for the deprecation-window policy and transition legality (spec §27.2), mirroring the
/// TypeScript <c>lifecycle/policy.test.ts</c> scenarios (AC-43.7–AC-43.20): the 12-calendar-month
/// standard window, the 90-day expedited window, calendar-month arithmetic with end-of-month
/// clamping, removal eligibility, and the forbidden state transitions.
/// </summary>
public sealed class PolicyTests
{
  // ----- Policy constants (AC-43.7, AC-43.8) -----

  [Fact]
  public void StandardDeprecationMonths_is_12()
  {
    Assert.Equal(12, LifecyclePolicy.StandardDeprecationMonths);
  }

  [Fact]
  public void ExpeditedMinimumDays_is_90()
  {
    Assert.Equal(90, LifecyclePolicy.ExpeditedMinimumDays);
  }

  // ----- AddCalendarMonths (AC-43.15, AC-43.16) -----

  [Fact]
  public void AddCalendarMonths_adds_within_the_same_year()
  {
    var result = LifecyclePolicy.AddCalendarMonths(new DateOnly(2025, 1, 15), 3);
    Assert.Equal(new DateOnly(2025, 4, 15), result);
  }

  [Fact]
  public void AddCalendarMonths_crosses_a_year_boundary()
  {
    var result = LifecyclePolicy.AddCalendarMonths(new DateOnly(2025, 11, 10), 3);
    Assert.Equal(new DateOnly(2026, 2, 10), result);
  }

  [Fact]
  public void AddCalendarMonths_adds_twelve_months()
  {
    var result = LifecyclePolicy.AddCalendarMonths(new DateOnly(2025, 4, 1), 12);
    Assert.Equal(new DateOnly(2026, 4, 1), result);
  }

  [Fact]
  public void AddCalendarMonths_clamps_to_end_of_a_shorter_target_month()
  {
    // January 31 + 1 month = Feb 28 (2025 is not a leap year).
    var result = LifecyclePolicy.AddCalendarMonths(new DateOnly(2025, 1, 31), 1);
    Assert.Equal(new DateOnly(2025, 2, 28), result);
  }

  [Fact]
  public void AddCalendarMonths_clamps_to_end_of_february_in_a_leap_year()
  {
    var result = LifecyclePolicy.AddCalendarMonths(new DateOnly(2024, 1, 31), 1);
    Assert.Equal(new DateOnly(2024, 2, 29), result);
  }

  // ----- isEligibleForRemoval: standard window (AC-43.9 to AC-43.12) -----

  [Fact]
  public void IsEligibleForRemoval_standard_not_eligible_at_eleven_months()
  {
    var deprecated = new DateOnly(2025, 1, 1);
    Assert.False(LifecyclePolicy.IsEligibleForRemoval(deprecated, new DateOnly(2025, 12, 1)));
  }

  [Fact]
  public void IsEligibleForRemoval_standard_eligible_at_exactly_twelve_months()
  {
    var deprecated = new DateOnly(2025, 1, 1);
    Assert.True(LifecyclePolicy.IsEligibleForRemoval(deprecated, new DateOnly(2026, 1, 1)));
  }

  [Fact]
  public void IsEligibleForRemoval_standard_eligible_after_twelve_months()
  {
    var deprecated = new DateOnly(2025, 1, 1);
    Assert.True(LifecyclePolicy.IsEligibleForRemoval(deprecated, new DateOnly(2026, 2, 1)));
  }

  [Fact]
  public void IsEligibleForRemoval_standard_not_eligible_one_day_before_window_closes()
  {
    var deprecated = new DateOnly(2025, 1, 1);
    Assert.False(LifecyclePolicy.IsEligibleForRemoval(deprecated, new DateOnly(2025, 12, 31)));
  }

  // ----- isEligibleForRemoval: expedited window (AC-43.13, AC-43.14) -----

  [Fact]
  public void IsEligibleForRemoval_expedited_not_eligible_at_eighty_nine_days()
  {
    var deprecated = new DateOnly(2025, 1, 1);
    Assert.False(LifecyclePolicy.IsEligibleForRemoval(deprecated, deprecated.AddDays(89), expedited: true));
  }

  [Fact]
  public void IsEligibleForRemoval_expedited_eligible_at_exactly_ninety_days()
  {
    var deprecated = new DateOnly(2025, 1, 1);
    Assert.True(LifecyclePolicy.IsEligibleForRemoval(deprecated, deprecated.AddDays(90), expedited: true));
  }

  [Fact]
  public void IsEligibleForRemoval_expedited_eligible_after_ninety_days()
  {
    var deprecated = new DateOnly(2025, 1, 1);
    Assert.True(LifecyclePolicy.IsEligibleForRemoval(deprecated, deprecated.AddDays(91), expedited: true));
  }

  [Fact]
  public void IsEligibleForRemoval_expedited_is_shorter_than_standard()
  {
    // At 100 days the expedited window has elapsed but the 12-month standard window has not.
    var deprecated = new DateOnly(2025, 1, 1);
    var now = deprecated.AddDays(100);
    Assert.True(LifecyclePolicy.IsEligibleForRemoval(deprecated, now, expedited: true));
    Assert.False(LifecyclePolicy.IsEligibleForRemoval(deprecated, now, expedited: false));
  }

  // ----- CanTransition / AssertValidTransition (AC-43.17 to AC-43.20) -----

  [Theory]
  [InlineData(LifecycleState.Active, LifecycleState.Deprecated)]
  [InlineData(LifecycleState.Deprecated, LifecycleState.Removed)]
  [InlineData(LifecycleState.Deprecated, LifecycleState.Active)]
  public void AssertValidTransition_does_not_throw_for_a_legal_transition(LifecycleState from, LifecycleState to)
  {
    LifecyclePolicy.AssertValidTransition(from, to); // must not throw
    Assert.True(LifecyclePolicy.CanTransition(from, to));
  }

  [Theory]
  [InlineData(LifecycleState.Active, LifecycleState.Removed)]
  [InlineData(LifecycleState.Removed, LifecycleState.Active)]
  [InlineData(LifecycleState.Removed, LifecycleState.Deprecated)]
  [InlineData(LifecycleState.Active, LifecycleState.Active)]
  [InlineData(LifecycleState.Deprecated, LifecycleState.Deprecated)]
  public void AssertValidTransition_throws_for_a_forbidden_transition(LifecycleState from, LifecycleState to)
  {
    Assert.False(LifecyclePolicy.CanTransition(from, to));
    Assert.Throws<InvalidOperationException>(() => LifecyclePolicy.AssertValidTransition(from, to));
  }

  [Fact]
  public void AssertValidTransition_message_names_both_states()
  {
    var error = Assert.Throws<InvalidOperationException>(() =>
      LifecyclePolicy.AssertValidTransition(LifecycleState.Active, LifecycleState.Removed));
    Assert.Contains("active", error.Message);
    Assert.Contains("removed", error.Message);
  }
}
