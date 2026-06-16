namespace Stackific.Mcp.Lifecycle;

/// <summary>
/// Deprecation-policy enforcement for the feature lifecycle state machine (spec §27.2): the legal
/// state transitions and the minimum deprecation windows. This is the C# counterpart of the
/// TypeScript <c>lifecycle/policy.ts</c> module.
/// </summary>
/// <remarks>
/// The rules enforced here are:
/// <list type="bullet">
///   <item><description>Active → Removed is FORBIDDEN; a feature MUST pass through Deprecated first (R-27.2-b).</description></item>
///   <item><description>Removed is terminal — no transition out of it is permitted (R-27.2).</description></item>
///   <item><description>A same-state "transition" is not a transition and is rejected (R-27.1-e).</description></item>
///   <item><description>The standard minimum window is 12 calendar months (R-27.2-c).</description></item>
///   <item><description>The security-expedited minimum window is 90 days (R-27.2-l).</description></item>
///   <item><description>A Deprecated feature MAY be restored to Active; on re-deprecation the window is measured afresh (R-27.2-n, R-27.2-p).</description></item>
/// </list>
/// Date arithmetic uses the calendar-only <see cref="DateOnly"/> type so it is deterministic and free
/// of host-timezone distortion. Callers supply the "now" date explicitly — the policy never reads the
/// wall clock — mirroring the TypeScript functions that take dates as parameters.
/// </remarks>
public static class LifecyclePolicy
{
  /// <summary>The minimum deprecation window for a standard (non-expedited) removal: 12 calendar months (R-27.2-c).</summary>
  public const int StandardDeprecationMonths = 12;

  /// <summary>The minimum number of days for a security-expedited deprecation window: 90 days (R-27.2-l).</summary>
  public const int ExpeditedMinimumDays = 90;

  /// <summary>
  /// Returns <c>true</c> when the transition from <paramref name="from"/> to <paramref name="to"/> is
  /// permitted by the §27.2 state machine.
  /// </summary>
  /// <remarks>
  /// Permitted: Active → Deprecated, Deprecated → Active, Deprecated → Removed. Forbidden: any
  /// same-state "transition" (R-27.1-e), Active → Removed (R-27.2-b), and any transition out of
  /// Removed (Removed is terminal).
  /// </remarks>
  /// <param name="from">The current lifecycle state.</param>
  /// <param name="to">The proposed next lifecycle state.</param>
  /// <returns><c>true</c> when the transition is legal; otherwise <c>false</c>.</returns>
  public static bool CanTransition(LifecycleState from, LifecycleState to)
  {
    if (from == to) return false;
    if (from == LifecycleState.Active && to == LifecycleState.Removed) return false;
    if (from == LifecycleState.Removed) return false;
    return true;
  }

  /// <summary>
  /// Asserts that the transition from <paramref name="from"/> to <paramref name="to"/> is permitted,
  /// throwing when it is forbidden (R-27.2-a, R-27.2-b).
  /// </summary>
  /// <param name="from">The current lifecycle state.</param>
  /// <param name="to">The proposed next lifecycle state.</param>
  /// <exception cref="InvalidOperationException">When the transition is forbidden by §27.2.</exception>
  public static void AssertValidTransition(LifecycleState from, LifecycleState to)
  {
    if (!CanTransition(from, to))
    {
      throw new InvalidOperationException(
        $"Forbidden lifecycle transition: {Wire(from)} → {Wire(to)}. " +
        "A feature MUST pass through Deprecated before it can be Removed (R-27.2-a, R-27.2-b).");
    }
  }

  /// <summary>
  /// Adds <paramref name="months"/> calendar months to <paramref name="date"/>, clamping the day to
  /// the last valid day of the target month when the original day overflows (for example
  /// Jan 31 + 1 month → Feb 28).
  /// </summary>
  /// <remarks>
  /// This mirrors the TypeScript <c>addCalendarMonths</c>, which performs the same end-of-month
  /// clamping. <see cref="DateOnly.AddMonths(int)"/> already clamps to the last day of the target
  /// month, so this is a thin, intent-revealing wrapper.
  /// </remarks>
  /// <param name="date">The base date.</param>
  /// <param name="months">The number of calendar months to add (may be zero or negative).</param>
  /// <returns>The resulting date with end-of-month clamping applied.</returns>
  public static DateOnly AddCalendarMonths(DateOnly date, int months) => date.AddMonths(months);

  /// <summary>
  /// Returns <c>true</c> when a Deprecated feature is eligible for removal — i.e. its minimum window
  /// has elapsed as of <paramref name="now"/> (R-27.2-c, R-27.2-l).
  /// </summary>
  /// <remarks>
  /// Eligibility is a necessary condition for removal, not a mandate: a feature MAY remain Deprecated
  /// indefinitely (R-27.2-d). For the standard window the earliest-removal date is
  /// <paramref name="deprecatedSince"/> plus 12 calendar months (with end-of-month clamping); for the
  /// expedited window it is <paramref name="deprecatedSince"/> plus exactly 90 days. The comparison is
  /// inclusive — a feature is eligible on the boundary date itself.
  /// </remarks>
  /// <param name="deprecatedSince">The date the feature first became Deprecated.</param>
  /// <param name="now">The date to test eligibility against (usually today).</param>
  /// <param name="expedited">When <c>true</c>, applies the 90-day minimum instead of 12 months.</param>
  /// <returns><c>true</c> when <paramref name="now"/> is on or after the earliest-removal date.</returns>
  public static bool IsEligibleForRemoval(DateOnly deprecatedSince, DateOnly now, bool expedited = false)
  {
    if (expedited)
    {
      var earliest = deprecatedSince.AddDays(ExpeditedMinimumDays);
      return now >= earliest;
    }

    var earliestStandard = AddCalendarMonths(deprecatedSince, StandardDeprecationMonths);
    return now >= earliestStandard;
  }

  /// <summary>Returns the lowercase wire token for a <see cref="LifecycleState"/> (used in messages).</summary>
  private static string Wire(LifecycleState state) => state switch
  {
    LifecycleState.Active => "active",
    LifecycleState.Deprecated => "deprecated",
    LifecycleState.Removed => "removed",
    _ => state.ToString(),
  };
}
