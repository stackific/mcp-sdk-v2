using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for §15.2 cancellation — the <see cref="CancellationHandler"/> (register / trigger
/// / deregister abort callbacks), the <see cref="CancelledRequestSet"/> (sender ignores late
/// responses), <see cref="Cancellation.ValidateCancellationTarget"/> (own-in-flight only, with the
/// <c>server/discover</c> exclusion and missing-id tolerance), and <see cref="Cancellation.IsDiscoverMethod"/>.
/// Mirrors the cancellation half of the TypeScript <c>progress.test.ts</c> scenarios.
/// </summary>
public sealed class CancellationTests
{
  // ── isDiscoverMethod (AC-22.21 · R-15.2.2-b) ──

  [Fact]
  public void Is_discover_method()
  {
    Assert.True(Cancellation.IsDiscoverMethod("server/discover"));
    Assert.Equal("server/discover", Cancellation.ServerDiscoverMethod);
    Assert.False(Cancellation.IsDiscoverMethod("tools/call"));
    Assert.False(Cancellation.IsDiscoverMethod("notifications/cancelled"));
  }

  // ── validateCancellationTarget (AC-22.18 · R-15.2.1-a/b, R-15.2.2-b) ──

  [Fact]
  public void Validate_target_is_ok_for_an_in_flight_id()
  {
    var inFlight = new HashSet<RequestId> { new(1L), new("2") };
    Assert.True(Cancellation.ValidateCancellationTarget(new RequestId(1L), inFlight).Ok);
  }

  [Fact]
  public void Validate_target_rejects_a_not_in_flight_id()
  {
    var inFlight = new HashSet<RequestId> { new(1L) };
    Assert.False(Cancellation.ValidateCancellationTarget(new RequestId(99L), inFlight).Ok);
  }

  [Fact]
  public void Validate_target_rejects_a_missing_request_id_with_a_reason()
  {
    // R-15.2.2-f: a malformed cancellation with no id is tolerated — it simply fails validation
    // (and is ignored) rather than throwing.
    var inFlight = new HashSet<RequestId> { new(1L) };
    var result = Cancellation.ValidateCancellationTarget(null, inFlight);
    Assert.False(result.Ok);
    Assert.Contains("required", result.Reason!);
  }

  [Fact]
  public void Validate_target_rejects_the_server_discover_id()
  {
    var inFlight = new HashSet<RequestId> { new(0L) };
    var result = Cancellation.ValidateCancellationTarget(new RequestId(0L), inFlight, discoverRequestId: new RequestId(0L));
    Assert.False(result.Ok);
    Assert.Contains("server/discover", result.Reason!);
  }

  [Fact]
  public void Validate_target_tolerates_a_no_longer_in_flight_id()
  {
    // After a response arrived the id was removed from in-flight; a late cancel is simply ignored.
    var inFlight = new HashSet<RequestId>();
    Assert.False(Cancellation.ValidateCancellationTarget(new RequestId(5L), inFlight).Ok);
  }

  // ── CancellationHandler (AC-22.23 · R-15.2.2-d) ──

  [Fact]
  public void Trigger_calls_the_callback_once_and_removes_it()
  {
    var callCount = 0;
    var handler = new CancellationHandler();
    handler.Register(new RequestId(1L), () => callCount++);
    Assert.True(handler.Trigger(new RequestId(1L)));
    Assert.Equal(1, callCount);
    Assert.False(handler.Trigger(new RequestId(1L))); // already removed
    Assert.Equal(1, callCount);
  }

  [Fact]
  public void Trigger_returns_false_when_no_handler_is_registered()
  {
    Assert.False(new CancellationHandler().Trigger(new RequestId(99L)));
  }

  [Fact]
  public void Has_reflects_register_and_trigger()
  {
    var handler = new CancellationHandler();
    handler.Register(new RequestId("req-A"), () => { });
    Assert.True(handler.Has(new RequestId("req-A")));
    handler.Trigger(new RequestId("req-A"));
    Assert.False(handler.Has(new RequestId("req-A")));
  }

  [Fact]
  public void Deregister_removes_the_handler_without_calling_it_and_tolerates_unknown_ids()
  {
    var called = false;
    var handler = new CancellationHandler();
    handler.Register(new RequestId("req-B"), () => called = true);
    handler.Deregister(new RequestId("req-B"));
    Assert.False(handler.Has(new RequestId("req-B")));
    Assert.False(called);
    handler.Deregister(new RequestId("unknown")); // no throw
  }

  [Fact]
  public void Count_reflects_registration_trigger_and_deregister()
  {
    var handler = new CancellationHandler();
    Assert.Equal(0, handler.Count);
    handler.Register(new RequestId(1L), () => { });
    handler.Register(new RequestId(2L), () => { });
    Assert.Equal(2, handler.Count);
    handler.Trigger(new RequestId(1L));
    Assert.Equal(1, handler.Count);
    handler.Deregister(new RequestId(2L));
    Assert.Equal(0, handler.Count);
  }

  [Fact]
  public void Handler_tracks_string_and_number_ids_independently()
  {
    var stringCalled = false;
    var numberCalled = false;
    var handler = new CancellationHandler();
    handler.Register(new RequestId("1"), () => stringCalled = true);
    handler.Register(new RequestId(1L), () => numberCalled = true);
    handler.Trigger(new RequestId("1"));
    Assert.True(stringCalled);
    Assert.False(numberCalled);
  }

  [Fact]
  public void Handler_can_drive_a_cancellation_token_source()
  {
    var handler = new CancellationHandler();
    using var cts = new CancellationTokenSource();
    handler.Register(new RequestId("async-req"), cts.Cancel);
    Assert.False(cts.IsCancellationRequested);
    handler.Trigger(new RequestId("async-req"));
    Assert.True(cts.IsCancellationRequested);
  }

  // ── CancelledRequestSet (AC-22.26 · R-15.2.3-e) ──

  [Fact]
  public void Cancelled_set_marks_ids_ignorable_until_acknowledged()
  {
    var set = new CancelledRequestSet();
    set.Add(new RequestId(42L));
    Assert.True(set.IsIgnorable(new RequestId(42L)));
    Assert.False(set.IsIgnorable(new RequestId(99L)));
    set.Acknowledge(new RequestId(42L));
    Assert.False(set.IsIgnorable(new RequestId(42L)));
    set.Acknowledge(new RequestId("never-added")); // no throw
  }

  [Fact]
  public void Cancelled_set_count_reflects_outstanding_ids()
  {
    var set = new CancelledRequestSet();
    Assert.Equal(0, set.Count);
    set.Add(new RequestId(1L));
    set.Add(new RequestId(2L));
    Assert.Equal(2, set.Count);
    set.Acknowledge(new RequestId(1L));
    Assert.Equal(1, set.Count);
  }

  [Fact]
  public void Cancelled_set_tracks_string_and_number_ids_independently()
  {
    var set = new CancelledRequestSet();
    set.Add(new RequestId("5"));
    Assert.True(set.IsIgnorable(new RequestId("5")));
    Assert.False(set.IsIgnorable(new RequestId(5L)));
  }

  [Fact]
  public void Cancelled_set_models_the_full_cancel_then_ignore_lifecycle()
  {
    var set = new CancelledRequestSet();
    set.Add(new RequestId(7L));                       // 1. sender sends notifications/cancelled
    Assert.True(set.IsIgnorable(new RequestId(7L)));   // 2. late response arrives → discard
    set.Acknowledge(new RequestId(7L));                // 3. sender discards
    Assert.Equal(0, set.Count);                        // 4. set is clean
    Assert.False(set.IsIgnorable(new RequestId(7L)));
  }
}
