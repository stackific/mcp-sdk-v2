using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for §15.3–§15.4 — log-level filtering (<see cref="LoggingFilter.IsAtOrAboveLogLevel"/>,
/// <see cref="LoggingFilter.ResolvedMinLogLevelIndex"/>), the <c>logLevel</c> opt-in validation
/// (<c>-32602</c> on a bad value), the global <see cref="LogRateLimiter"/>, and the W3C trace-context
/// relay (<see cref="TraceContext.RelayTraceContext"/> / <see cref="TraceContext.ExtractTraceContext"/>).
/// Mirrors the TypeScript <c>logging.test.ts</c> scenarios.
/// </summary>
public sealed class LoggingFilterTests
{
  // ── Level ordering / filtering (AC-23.3 · R-15.3.1-a, R-15.3.3-c/d) ──

  [Fact]
  public void Levels_are_ordered_debug_lowest_emergency_highest()
  {
    Assert.Equal(0, LoggingLevel.Debug.Index());
    Assert.Equal(7, LoggingLevel.Emergency.Index());
    Assert.Equal(8, LoggingFilter.LoggingLevels.Count);
    Assert.Equal(LoggingLevel.Debug, LoggingFilter.LoggingLevels[0]);
    Assert.Equal(LoggingLevel.Emergency, LoggingFilter.LoggingLevels[7]);
  }

  [Theory]
  [InlineData(LoggingLevel.Debug, false)]
  [InlineData(LoggingLevel.Info, false)]
  [InlineData(LoggingLevel.Notice, false)]
  [InlineData(LoggingLevel.Warning, true)]
  [InlineData(LoggingLevel.Error, true)]
  [InlineData(LoggingLevel.Emergency, true)]
  public void Is_at_or_above_filters_for_minimum_warning(LoggingLevel candidate, bool emit)
  {
    Assert.Equal(emit, LoggingFilter.IsAtOrAboveLogLevel(candidate, LoggingLevel.Warning));
  }

  // ── resolvedMinLogLevelIndex (AC-23.9, AC-23.10 · R-15.3.3-a/b/c/d) ──

  [Theory]
  [InlineData(null, -1)]      // absent → emit nothing
  [InlineData("verbose", -1)] // invalid → emit nothing
  [InlineData("debug", 0)]
  [InlineData("warning", 3)]
  [InlineData("emergency", 7)]
  public void Resolved_min_log_level_index(string? optIn, int expected)
  {
    Assert.Equal(expected, LoggingFilter.ResolvedMinLogLevelIndex(optIn));
  }

  [Fact]
  public void Min_index_combined_with_filter_keeps_only_at_or_above_messages()
  {
    var min = LoggingFilter.ResolvedMinLogLevelIndex("warning"); // 3
    var levels = new[] { LoggingLevel.Debug, LoggingLevel.Info, LoggingLevel.Notice, LoggingLevel.Warning, LoggingLevel.Error, LoggingLevel.Emergency };
    var emitted = levels.Where(l => l.Index() >= min).ToList();
    Assert.Equal([LoggingLevel.Warning, LoggingLevel.Error, LoggingLevel.Emergency], emitted);
  }

  // ── validateLogLevelOptIn (AC-23.12 · R-15.3.3-g) ──

  [Fact]
  public void Validate_log_level_opt_in_accepts_a_recognized_level()
  {
    var result = LoggingFilter.ValidateLogLevelOptIn("warning");
    Assert.True(result.Ok);
    Assert.Null(result.Error);
  }

  [Theory]
  [InlineData("verbose")]
  [InlineData("WARNING")] // wrong case
  [InlineData(null)]
  public void Validate_log_level_opt_in_rejects_bad_values_with_minus_32602(string? bad)
  {
    var result = LoggingFilter.ValidateLogLevelOptIn(bad);
    Assert.False(result.Ok);
    Assert.Equal(ErrorCodes.InvalidParams, result.Error!.Code);
  }

  [Fact]
  public void Parse_log_level_round_trips_the_eight_wire_strings()
  {
    Assert.Equal(LoggingLevel.Debug, LoggingFilter.ParseLogLevel("debug"));
    Assert.Equal(LoggingLevel.Critical, LoggingFilter.ParseLogLevel("critical"));
    Assert.Equal(LoggingLevel.Emergency, LoggingFilter.ParseLogLevel("emergency"));
    Assert.Null(LoggingFilter.ParseLogLevel("nope"));
  }

  // ── LogRateLimiter (AC-23.13 · RC-3, global, default 50 ms) ──

  [Fact]
  public void Log_rate_limiter_permits_first_and_suppresses_within_the_interval()
  {
    var limiter = new LogRateLimiter(50);
    Assert.True(limiter.ShouldEmit(1000));
    Assert.False(limiter.ShouldEmit(1030)); // 30 ms < 50 ms
  }

  [Fact]
  public void Log_rate_limiter_permits_at_or_after_the_boundary_and_advances_the_baseline()
  {
    var limiter = new LogRateLimiter(50);
    limiter.ShouldEmit(1000);             // baseline 1000
    Assert.True(limiter.ShouldEmit(1050)); // baseline 1050
    Assert.False(limiter.ShouldEmit(1080)); // 30 ms < 50 ms from 1050
    Assert.True(limiter.ShouldEmit(1100));
  }

  [Fact]
  public void Log_rate_limiter_default_interval_is_50ms()
  {
    var limiter = new LogRateLimiter();
    limiter.ShouldEmit(1000);
    Assert.False(limiter.ShouldEmit(1049));
    Assert.True(limiter.ShouldEmit(1050));
  }

  // ── Trace context presence (AC-23.14 · R-15.4.1-a/b/c) ──

  private const string ValidTraceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  private const string ValidTracestate = "vendora=t61rcwkgmze,vendorb=00f067aa0ba902b7";
  private const string ValidBaggage = "userTier=gold,region=us-east-1";

  [Fact]
  public void Has_trace_keys_detects_valid_w3c_values_and_absence()
  {
    Assert.True(TraceContext.HasTraceparent(new JsonObject { ["traceparent"] = ValidTraceparent }));
    Assert.False(TraceContext.HasTraceparent(new JsonObject()));
    Assert.True(TraceContext.HasTracestate(new JsonObject { ["tracestate"] = ValidTracestate }));
    Assert.False(TraceContext.HasTracestate(new JsonObject()));
    Assert.True(TraceContext.HasBaggage(new JsonObject { ["baggage"] = ValidBaggage }));
    Assert.False(TraceContext.HasBaggage(new JsonObject()));
  }

  [Fact]
  public void Bare_keys_are_the_three_expected_keys()
  {
    Assert.Contains("traceparent", TraceContext.BareKeys);
    Assert.Contains("tracestate", TraceContext.BareKeys);
    Assert.Contains("baggage", TraceContext.BareKeys);
  }

  // ── extractTraceContext (AC-23.16, AC-23.17 · R-15.4.2-c/g) ──

  [Fact]
  public void Extract_trace_context_copies_only_trace_keys_verbatim()
  {
    var meta = new JsonObject
    {
      ["traceparent"] = ValidTraceparent,
      ["tracestate"] = "vendorX=abc",
      ["baggage"] = "k=v",
      ["other-key"] = "ignored",
    };
    var ctx = TraceContext.ExtractTraceContext(meta);
    Assert.Equal(ValidTraceparent, ctx["traceparent"]!.GetValue<string>());
    Assert.Equal("vendorX=abc", ctx["tracestate"]!.GetValue<string>());
    Assert.Equal("k=v", ctx["baggage"]!.GetValue<string>());
    Assert.False(ctx.ContainsKey("other-key"));
  }

  [Fact]
  public void Extract_trace_context_on_a_non_trace_meta_returns_empty()
  {
    Assert.Empty(TraceContext.ExtractTraceContext(new JsonObject { ["foo"] = "bar" }));
    Assert.Empty(TraceContext.ExtractTraceContext(new JsonObject()));
  }

  // ── relayTraceContext (AC-23.19 · R-15.4.2-h) ──

  [Fact]
  public void Relay_copies_all_three_keys_unchanged_and_preserves_outbound_keys()
  {
    var inbound = new JsonObject { ["traceparent"] = ValidTraceparent, ["tracestate"] = "v=1", ["baggage"] = "k=v" };
    var outbound = new JsonObject { ["someKey"] = "preserved" };
    var result = TraceContext.RelayTraceContext(inbound, outbound);
    Assert.Equal(ValidTraceparent, result["traceparent"]!.GetValue<string>());
    Assert.Equal("v=1", result["tracestate"]!.GetValue<string>());
    Assert.Equal("k=v", result["baggage"]!.GetValue<string>());
    Assert.Equal("preserved", result["someKey"]!.GetValue<string>());
  }

  [Fact]
  public void Relay_copies_only_present_keys_and_does_not_mutate_outbound()
  {
    var inbound = new JsonObject { ["traceparent"] = ValidTraceparent }; // tracestate / baggage absent
    var outbound = new JsonObject { ["original"] = true };
    var result = TraceContext.RelayTraceContext(inbound, outbound);
    Assert.True(result.ContainsKey("traceparent"));
    Assert.False(result.ContainsKey("tracestate"));
    Assert.False(result.ContainsKey("baggage"));
    // outbound is not mutated.
    Assert.False(outbound.ContainsKey("traceparent"));
  }

  [Fact]
  public void Relay_with_empty_inbound_copies_no_trace_keys()
  {
    var result = TraceContext.RelayTraceContext(new JsonObject(), new JsonObject { ["existing"] = "value" });
    Assert.False(result.ContainsKey("traceparent"));
    Assert.Equal("value", result["existing"]!.GetValue<string>());
  }
}
