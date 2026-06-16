using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Integration coverage for <see cref="ProcessChild"/> against a REAL operating-system subprocess (spec
/// §8 launch / §8.6.3 forced shutdown). Every other stdio test drives an in-memory <c>FakeChild</c> for
/// determinism, leaving the real <c>Process</c> wiring — launch, exit-code propagation, and the
/// <see cref="KillSignal.Force"/> → <c>Process.Kill(entireProcessTree: true)</c> (SIGKILL on Unix) path —
/// uncovered. These tests close that gap.
/// </summary>
/// <remarks>
/// Guarded to POSIX: the escalation under test maps to Unix signals (SIGKILL), whereas Windows uses
/// <c>TerminateProcess</c>. On Windows the tests no-op rather than asserting a different mechanism.
/// </remarks>
public sealed class ProcessChildIntegrationTests
{
  [Fact]
  public async Task Launches_a_real_subprocess_and_propagates_its_exit_code()
  {
    if (OperatingSystem.IsWindows()) return; // POSIX-only (/bin/sh).

    var child = ProcessChild.Launch("/bin/sh", ["-c", "exit 7"]);
    var exited = new TaskCompletionSource<int?>();
    child.Exited += code => exited.TrySetResult(code);
    try
    {
      var code = await exited.Task.WaitAsync(TimeSpan.FromSeconds(10));
      Assert.Equal(7, code);
      Assert.Equal(7, child.ExitCode);
    }
    finally
    {
      child.Dispose();
    }
  }

  [Fact]
  public async Task Force_kills_a_long_running_real_subprocess()
  {
    if (OperatingSystem.IsWindows()) return; // POSIX-only signal escalation (SIGKILL).

    // A child that would otherwise live for 30s, so the forced kill is what actually terminates it.
    var child = ProcessChild.Launch("/bin/sh", ["-c", "sleep 30"]);
    var exited = new TaskCompletionSource<int?>();
    child.Exited += code => exited.TrySetResult(code);
    try
    {
      Assert.Null(child.ExitCode); // the child is alive before the kill.

      // §8.6.3-a: forced kill — Process.Kill(entireProcessTree: true), which is SIGKILL on Unix.
      child.Kill(KillSignal.Force);

      await exited.Task.WaitAsync(TimeSpan.FromSeconds(10));
      Assert.NotNull(child.ExitCode); // observed as terminated (no longer running).
    }
    finally
    {
      child.Dispose();
    }
  }
}
