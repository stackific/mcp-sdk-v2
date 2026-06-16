using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for §15.1 progress tracking — the <see cref="ProgressTracker"/> (token
/// uniqueness R-15.1.1-c, strict monotonic increase R-15.1.3-e, active-set, terminal-state stop
/// R-15.1.4-g) and the per-token <see cref="ProgressRateLimiter"/> (RC-3, default 100 ms, injected
/// clock). Mirrors the TypeScript <c>progress.test.ts</c> scenarios.
/// </summary>
public sealed class ProgressTrackerTests
{
  // ── Uniqueness (AC-22.3 · R-15.1.1-c) ──

  [Fact]
  public void Two_distinct_tokens_register_simultaneously()
  {
    var tracker = new ProgressTracker();
    tracker.Register("tok-A");
    tracker.Register("tok-B");
    Assert.True(tracker.Has("tok-A"));
    Assert.True(tracker.Has("tok-B"));
    Assert.Equal(2, tracker.Count);
  }

  [Fact]
  public void Registering_the_same_string_token_twice_throws()
  {
    var tracker = new ProgressTracker();
    tracker.Register("dup");
    Assert.Throws<InvalidOperationException>(() => tracker.Register("dup"));
  }

  [Fact]
  public void Registering_the_same_number_token_twice_throws()
  {
    var tracker = new ProgressTracker();
    tracker.Register(99L);
    Assert.Throws<InvalidOperationException>(() => tracker.Register(99L));
  }

  [Fact]
  public void String_and_number_tokens_with_the_same_text_are_distinct()
  {
    var tracker = new ProgressTracker();
    tracker.Register("1");
    tracker.Register(1L); // does not throw — different JSON type
    Assert.Equal(2, tracker.Count);
  }

  [Fact]
  public void A_token_may_be_reused_after_completion()
  {
    var tracker = new ProgressTracker();
    tracker.Register("reuse");
    tracker.Complete("reuse");
    tracker.Register("reuse"); // no throw
    Assert.True(tracker.Has("reuse"));
  }

  // ── Opaqueness / unregistered (AC-22.4, AC-22.5) ──

  [Fact]
  public void Unregistered_token_is_not_present_and_is_not_monotonic()
  {
    var tracker = new ProgressTracker();
    Assert.False(tracker.Has("unregistered"));
    Assert.False(tracker.IsMonotonic("unregistered", 10));
  }

  // ── Strict monotonic increase (AC-22.8 · R-15.1.3-e) ──

  [Fact]
  public void First_progress_value_is_monotonic()
  {
    var tracker = new ProgressTracker();
    tracker.Register("tok");
    Assert.True(tracker.IsMonotonic("tok", 0));    // anything > -infinity
    Assert.True(tracker.IsMonotonic("tok", 0.1));
  }

  [Fact]
  public void A_higher_value_is_monotonic_an_equal_or_lower_value_is_not()
  {
    var tracker = new ProgressTracker();
    tracker.Register("tok");
    tracker.RecordProgress("tok", 50);
    Assert.True(tracker.IsMonotonic("tok", 51));
    Assert.False(tracker.IsMonotonic("tok", 50)); // strictly greater required
    Assert.False(tracker.IsMonotonic("tok", 49));
  }

  [Fact]
  public void Record_progress_updates_the_baseline_for_subsequent_checks()
  {
    var tracker = new ProgressTracker();
    tracker.Register("tok");
    tracker.RecordProgress("tok", 25);
    tracker.RecordProgress("tok", 75);
    Assert.True(tracker.IsMonotonic("tok", 76));
    Assert.False(tracker.IsMonotonic("tok", 75));
  }

  [Fact]
  public void Record_progress_on_an_inactive_token_throws()
  {
    var tracker = new ProgressTracker();
    Assert.Throws<InvalidOperationException>(() => tracker.RecordProgress("ghost", 1));
  }

  // ── Active token set (AC-22.15 · R-15.1.4-e) ──

  [Fact]
  public void Count_and_active_tokens_track_registration_and_completion()
  {
    var tracker = new ProgressTracker();
    Assert.Equal(0, tracker.Count);
    tracker.Register("x");
    tracker.Register(42L);
    Assert.Equal(2, tracker.Count);
    Assert.Contains(tracker.ActiveTokens, t => t.ToString() == "x");
    Assert.Contains(tracker.ActiveTokens, t => t.ToString() == "42" && t.IsNumber);
    tracker.Complete("x");
    Assert.Equal(1, tracker.Count);
  }

  // ── Terminal state: no progress after completion (AC-22.17 · R-15.1.4-g) ──

  [Fact]
  public void After_completion_the_token_is_gone_and_cannot_emit_more_progress()
  {
    var tracker = new ProgressTracker();
    tracker.Register("done");
    tracker.Complete("done");
    Assert.False(tracker.Has("done"));
    Assert.False(tracker.IsMonotonic("done", 999));
  }

  // ── Race-tolerance (AC-22.25) ──

  [Fact]
  public void Completing_an_already_completed_or_unknown_token_does_not_throw()
  {
    var tracker = new ProgressTracker();
    tracker.Register("race");
    tracker.Complete("race");
    tracker.Complete("race");   // tolerated
    tracker.Complete("unknown"); // tolerated
  }

  // ── ProgressRateLimiter (AC-22.16 · RC-3) ──

  [Fact]
  public void Rate_limiter_permits_first_emission_and_suppresses_within_the_interval()
  {
    var limiter = new ProgressRateLimiter(100);
    Assert.True(limiter.ShouldEmit("tok", 1000));
    Assert.False(limiter.ShouldEmit("tok", 1050)); // 50 ms < 100 ms
  }

  [Fact]
  public void Rate_limiter_permits_emission_at_or_after_the_interval_boundary()
  {
    var limiter = new ProgressRateLimiter(100);
    limiter.ShouldEmit("tok", 1000);
    Assert.True(limiter.ShouldEmit("tok", 1100)); // exactly the boundary
    Assert.True(limiter.ShouldEmit("tok", 1500));
  }

  [Fact]
  public void Rate_limiter_tracks_tokens_independently_including_by_json_type()
  {
    var limiter = new ProgressRateLimiter(100);
    limiter.ShouldEmit("tok-A", 1000);
    Assert.True(limiter.ShouldEmit("tok-B", 1050)); // a different token is not throttled

    limiter.ShouldEmit("1", 1000);
    Assert.True(limiter.ShouldEmit(1L, 1050)); // number 1 is a different token from string "1"
  }

  [Fact]
  public void Rate_limiter_complete_clears_state_and_tolerates_unknown_tokens()
  {
    var limiter = new ProgressRateLimiter(100);
    limiter.ShouldEmit("tok", 1000);
    limiter.Complete("tok");
    Assert.True(limiter.ShouldEmit("tok", 1050)); // cleared → permitted immediately
    limiter.Complete("never-seen"); // no throw
  }

  [Fact]
  public void Rate_limiter_default_interval_is_100ms()
  {
    var limiter = new ProgressRateLimiter();
    limiter.ShouldEmit("tok", 1000);
    Assert.False(limiter.ShouldEmit("tok", 1099));
    Assert.True(limiter.ShouldEmit("tok", 1100));
  }
}
