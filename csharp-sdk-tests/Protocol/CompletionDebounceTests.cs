using System.Threading;
using System.Threading.Tasks;

using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for the client-side completion debouncer (spec §19.5, R-19.5-n): a client SHOULD coalesce
/// rapid successive completion requests rather than sending one per keystroke. Mirrors the TypeScript
/// SDK's <c>completion-debounce.test.ts</c>.
/// </summary>
public sealed class CompletionDebounceTests
{
  [Fact]
  public async Task Coalesces_a_burst_into_a_single_request_with_the_final_value()
  {
    var callCount = 0;
    string? sentValue = null;
    var complete = Completion.CreateCompletionDebouncer<string>(
      value =>
      {
        Interlocked.Increment(ref callCount);
        sentValue = value;
        return Task.FromResult($"results:{value}");
      },
      waitMs: 60);

    // Three rapid keystrokes within the quiet window.
    var p1 = complete("a");
    var p2 = complete("ab");
    var p3 = complete("abc");

    var results = await Task.WhenAll(p1, p2, p3);

    Assert.Equal(1, callCount);
    Assert.Equal("abc", sentValue);
    // All awaiting callers resolve with the single coalesced result.
    Assert.Equal("results:abc", results[0]);
    Assert.Equal("results:abc", results[1]);
    Assert.Equal("results:abc", results[2]);
  }

  [Fact]
  public async Task Issues_separate_requests_when_calls_are_spaced_beyond_the_window()
  {
    var callCount = 0;
    var complete = Completion.CreateCompletionDebouncer<string>(
      value =>
      {
        Interlocked.Increment(ref callCount);
        return Task.FromResult(value);
      },
      waitMs: 30);

    var first = await complete("x");
    var second = await complete("y");

    Assert.Equal("x", first);
    Assert.Equal("y", second);
    Assert.Equal(2, callCount);
  }

  [Fact]
  public async Task Propagates_an_exception_to_every_awaiting_caller()
  {
    var complete = Completion.CreateCompletionDebouncer<string>(
      _ => Task.FromException<string>(new InvalidOperationException("boom")),
      waitMs: 40);

    var p1 = complete("a");
    var p2 = complete("ab");

    await Assert.ThrowsAsync<InvalidOperationException>(() => p1);
    await Assert.ThrowsAsync<InvalidOperationException>(() => p2);
  }

  [Fact]
  public async Task Latest_value_in_a_burst_wins()
  {
    string? sentValue = null;
    var complete = Completion.CreateCompletionDebouncer<int>(
      value =>
      {
        sentValue = value;
        return Task.FromResult(value.Length);
      },
      waitMs: 50);

    _ = complete("one");
    _ = complete("twoo");
    var last = complete("threee");

    var length = await last;
    Assert.Equal("threee", sentValue);
    Assert.Equal(6, length);
  }
}
