using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The reference identifying what a <c>completion/complete</c> request is completing (spec §19.3):
/// either a prompt (<c>ref/prompt</c>) or a resource template (<c>ref/resource</c>). The closed
/// union is discriminated by the <c>type</c> field.
/// </summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(PromptReference), "ref/prompt")]
[JsonDerivedType(typeof(ResourceTemplateReference), "ref/resource")]
public abstract record CompletionReference
{
  private protected CompletionReference() { }
}

/// <summary>A completion reference identifying a prompt by name (spec §19.3, <c>type: "ref/prompt"</c>).</summary>
public sealed record PromptReference : CompletionReference
{
  /// <summary>REQUIRED. The programmatic name of the prompt being completed.</summary>
  public required string Name { get; init; }

  /// <summary>OPTIONAL. A human display name (not load-bearing for matching).</summary>
  public string? Title { get; init; }
}

/// <summary>A completion reference identifying a resource template by URI (spec §19.3, <c>type: "ref/resource"</c>).</summary>
public sealed record ResourceTemplateReference : CompletionReference
{
  /// <summary>REQUIRED. The URI or URI template whose variable is being completed.</summary>
  public required string Uri { get; init; }
}

/// <summary>The single argument being completed in a <c>completion/complete</c> request (spec §19.2).</summary>
public sealed record CompletionArgument
{
  /// <summary>REQUIRED. The name of the argument being completed.</summary>
  public required string Name { get; init; }

  /// <summary>REQUIRED. The current partial value (the match seed); MAY be empty.</summary>
  public required string Value { get; init; }
}

/// <summary>Additional disambiguating context for completion (spec §19.2).</summary>
public sealed record CompletionContext
{
  /// <summary>OPTIONAL. Already-resolved sibling arguments, keyed by name (excluding the completed argument).</summary>
  public IDictionary<string, string>? Arguments { get; init; }
}

/// <summary>The parameters of a <c>completion/complete</c> request (spec §19.2).</summary>
public sealed record CompleteRequestParams
{
  /// <summary>REQUIRED. What is being completed (a prompt or resource-template reference).</summary>
  public required CompletionReference Ref { get; init; }

  /// <summary>REQUIRED. The argument being completed.</summary>
  public required CompletionArgument Argument { get; init; }

  /// <summary>OPTIONAL. Additional context to refine suggestions.</summary>
  public CompletionContext? Context { get; init; }

  /// <summary>OPTIONAL. Reserved request metadata map (§4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>The ranked candidate values returned by a completion (spec §19.4).</summary>
public sealed record CompletionValues
{
  /// <summary>REQUIRED. Candidate values, ranked by descending relevance; MUST NOT exceed 100 items.</summary>
  public required IReadOnlyList<string> Values { get; init; }

  /// <summary>OPTIONAL. The total number of matches available (MAY exceed <see cref="Values"/>).</summary>
  public int? Total { get; init; }

  /// <summary>OPTIONAL (default <c>false</c>). Whether more matches exist beyond <see cref="Values"/>.</summary>
  public bool? HasMore { get; init; }
}

/// <summary>The result of a <c>completion/complete</c> request (spec §19.4).</summary>
public sealed record CompleteResult
{
  /// <summary>REQUIRED. The completion suggestions.</summary>
  public required CompletionValues Completion { get; init; }
}

/// <summary>The set of valid argument names a completion <c>ref</c> may complete (spec §19.5, R-19.5-r).</summary>
/// <remarks>
/// Resolved from the server's catalog so <see cref="Completion.ResolveCompletionTarget"/> can detect an
/// unknown ref or an argument that is not part of the referenced target. A <see cref="PromptReference"/>
/// resolves against the server's offered prompts (by name); a <see cref="ResourceTemplateReference"/>
/// against the offered resource templates (by uri/uriTemplate). A target found but carrying an empty
/// argument-name set is still "known" — only an absent target is unknown.
/// </remarks>
public interface ICompletionCatalog
{
  /// <summary>Resolves the declared argument names of a prompt, or <c>null</c> when the prompt is unknown.</summary>
  /// <param name="name">The prompt name.</param>
  /// <returns>The declared argument names, or <c>null</c> when unknown.</returns>
  IReadOnlyList<string>? PromptArgumentNames(string name);

  /// <summary>Resolves the declared variable names of a resource template, or <c>null</c> when unknown.</summary>
  /// <param name="uri">The template's URI / URI template.</param>
  /// <returns>The declared variable names, or <c>null</c> when unknown.</returns>
  IReadOnlyList<string>? ResourceTemplateVariableNames(string uri);
}

/// <summary>The discriminated outcome of <see cref="Completion.ResolveCompletionTarget"/> (spec §19.5, R-19.5-r).</summary>
/// <param name="Ok">Whether the ref and argument resolve against the catalog.</param>
/// <param name="Error">The <c>-32602</c> error when resolution fails.</param>
public readonly record struct CompletionTargetResolution(bool Ok, McpError? Error)
{
  /// <summary>A successful resolution.</summary>
  public static CompletionTargetResolution Valid { get; } = new(true, null);

  /// <summary>Builds a failed resolution carrying the <c>-32602</c> <paramref name="error"/>.</summary>
  /// <param name="error">The invalid-params error.</param>
  /// <returns>A failed resolution.</returns>
  public static CompletionTargetResolution Invalid(McpError error) => new(false, error);
}

/// <summary>
/// The §19.4–§19.5 normative completion helpers ported from the TypeScript SDK's <c>completion.ts</c>:
/// the 100-item cap with truncation signalling (<see cref="ComputeCompletion"/>, only emitting
/// <c>total</c>/<c>hasMore</c> when matches are dropped), the prefix matcher, the context
/// key-exclusion guard (R-19.2-k), and the unknown-ref / unknown-argument resolution that maps to
/// <c>-32602</c> rather than a not-found result (R-19.5-r).
/// </summary>
public static class Completion
{
  /// <summary>The maximum number of items <c>completion.values</c> may carry (§19.4, R-19.4-c).</summary>
  public const int MaxCompletionValues = 100;

  /// <summary>
  /// Caps an already-ranked candidate list at 100 and signals truncation, producing the <c>completion</c>
  /// object a server returns. Critically — matching the TS <c>computeCompletion</c> — <c>total</c> and
  /// <c>hasMore</c> are set ONLY when matches were dropped (<c>total &gt; values.Count</c>); an
  /// under-cap result leaves them ABSENT (unknown), rather than always emitting an exact <c>total</c>.
  /// (§19.4, R-19.4-c – R-19.4-h, R-19.5-g, R-19.5-h)
  /// </summary>
  /// <param name="ranked">Candidate values already ordered by descending relevance.</param>
  /// <param name="totalOverride">The true match count when <paramref name="ranked"/> is itself a pre-truncated subset; takes precedence over its length.</param>
  /// <returns>The <see cref="CompletionValues"/> with the cap applied and truncation signalled only when dropped.</returns>
  public static CompletionValues ComputeCompletion(IReadOnlyList<string> ranked, int? totalOverride = null)
  {
    ArgumentNullException.ThrowIfNull(ranked);
    var values = ranked.Count > MaxCompletionValues
      ? ranked.Take(MaxCompletionValues).ToList()
      : ranked.ToList();

    // The true match total: an explicit override (caller knows of more than it materialized) takes
    // precedence over the length of the supplied list.
    var trueTotal = totalOverride ?? ranked.Count;
    if (trueTotal > values.Count)
    {
      return new CompletionValues { Values = values, Total = trueTotal, HasMore = true };
    }

    return new CompletionValues { Values = values };
  }

  /// <summary>
  /// A reference prefix matcher: returns the <paramref name="candidates"/> whose value starts with the
  /// <paramref name="seed"/>, in input order. When the seed is empty, every candidate matches (the
  /// empty-input suggestions). Matching is case-sensitive by default. (§19.5, R-19.5-d, R-19.2-i)
  /// </summary>
  /// <param name="seed">The current partial value (<c>argument.value</c>).</param>
  /// <param name="candidates">The full candidate pool.</param>
  /// <param name="caseInsensitive">When <c>true</c>, folds case before matching.</param>
  /// <returns>The matching candidates, in input order.</returns>
  public static IReadOnlyList<string> PrefixMatch(string seed, IReadOnlyList<string> candidates, bool caseInsensitive = false)
  {
    ArgumentNullException.ThrowIfNull(seed);
    ArgumentNullException.ThrowIfNull(candidates);
    if (seed.Length == 0) return candidates.ToList();
    var comparison = caseInsensitive ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
    return candidates.Where(c => c.StartsWith(seed, comparison)).ToList();
  }

  /// <summary>
  /// Resolves the <c>resultType</c> of a received <c>completion/complete</c> result, treating an absent
  /// (or non-string) value as <c>"complete"</c>. (§19.4, R-19.4-l)
  /// </summary>
  /// <param name="result">The raw result object received on the wire.</param>
  /// <returns>The resolved result type.</returns>
  public static string ResolveResultType(JsonObject result)
  {
    ArgumentNullException.ThrowIfNull(result);
    return result["resultType"] is JsonValue v && v.GetValueKind() == System.Text.Json.JsonValueKind.String
      ? v.GetValue<string>()
      : ResultTypes.Complete;
  }

  /// <summary>
  /// Resolves the <c>hasMore</c> truncation hint, treating an absent (or non-<c>true</c>) value as
  /// <c>false</c>. (§19.4, R-19.4-i)
  /// </summary>
  /// <param name="hasMore">The wire <c>hasMore</c> value (nullable).</param>
  /// <returns><c>true</c> only when <paramref name="hasMore"/> is explicitly <c>true</c>.</returns>
  public static bool ResolveHasMore(bool? hasMore) => hasMore == true;

  /// <summary>
  /// Enforces the R-19.2-k guard: a <c>context.arguments</c> key MUST NOT name the argument being
  /// completed. Throws <c>-32602</c> (Invalid params) when it does. A server MAY otherwise ignore
  /// <c>context</c> entirely. (§19.2, R-19.2-j, R-19.2-k)
  /// </summary>
  /// <param name="argument">The argument being completed.</param>
  /// <param name="context">The optional completion context.</param>
  /// <exception cref="McpError">A <c>-32602</c> error when the context names the completed argument.</exception>
  public static void GuardContextExcludesArgument(CompletionArgument argument, CompletionContext? context)
  {
    ArgumentNullException.ThrowIfNull(argument);
    if (context?.Arguments is { } siblings && siblings.ContainsKey(argument.Name))
    {
      throw McpError.InvalidParams(
        $"context.arguments MUST NOT include the argument being completed (\"{argument.Name}\") (R-19.2-k)");
    }
  }

  /// <summary>
  /// Resolves a validated <c>ref</c> + <c>argument.name</c> against the server's catalog, enforcing
  /// R-19.5-r: an unknown prompt / resource template, OR an <c>argument.name</c> that is not a declared
  /// argument/variable of the referenced target, MUST be rejected with <c>-32602</c> (Invalid params)
  /// — NOT a not-found result. A KNOWN argument with no registered completer is NOT an error; it simply
  /// yields empty values. (§19.5, R-19.5-r)
  /// </summary>
  /// <param name="reference">The completion reference (selected by <c>type</c>).</param>
  /// <param name="argumentName">The argument/variable name being completed.</param>
  /// <param name="catalog">The server's prompt / resource-template catalog.</param>
  /// <returns>A <see cref="CompletionTargetResolution"/>; on failure it carries the <c>-32602</c> error.</returns>
  public static CompletionTargetResolution ResolveCompletionTarget(
    CompletionReference reference,
    string argumentName,
    ICompletionCatalog catalog)
  {
    ArgumentNullException.ThrowIfNull(reference);
    ArgumentNullException.ThrowIfNull(argumentName);
    ArgumentNullException.ThrowIfNull(catalog);

    switch (reference)
    {
      case PromptReference prompt:
        {
          var names = catalog.PromptArgumentNames(prompt.Name);
          if (names is null)
          {
            return CompletionTargetResolution.Invalid(
              McpError.InvalidParams($"unknown prompt \"{prompt.Name}\"", new JsonObject { ["promptName"] = prompt.Name }));
          }

          if (!names.Contains(argumentName))
          {
            return CompletionTargetResolution.Invalid(
              McpError.InvalidParams($"prompt \"{prompt.Name}\" has no argument \"{argumentName}\""));
          }

          return CompletionTargetResolution.Valid;
        }

      case ResourceTemplateReference template:
        {
          var variables = catalog.ResourceTemplateVariableNames(template.Uri);
          if (variables is null)
          {
            return CompletionTargetResolution.Invalid(
              McpError.InvalidParams($"unknown resource template \"{template.Uri}\"", new JsonObject { ["uri"] = template.Uri }));
          }

          if (!variables.Contains(argumentName))
          {
            return CompletionTargetResolution.Invalid(
              McpError.InvalidParams($"resource template \"{template.Uri}\" has no variable \"{argumentName}\""));
          }

          return CompletionTargetResolution.Valid;
        }

      default:
        return CompletionTargetResolution.Invalid(McpError.InvalidParams("Unknown completion reference type."));
    }
  }

  /// <summary>
  /// Creates a client-side debouncer that coalesces rapid successive completion calls (for example one
  /// per keystroke) into a single in-flight <c>completion/complete</c> request: each call resets a
  /// <paramref name="waitMs"/> timer, and only the final value after a quiet period is sent. All callers
  /// awaiting during a burst resolve with that single result. (§19.5, R-19.5-n — SHOULD)
  /// </summary>
  /// <remarks>
  /// The C# counterpart of the TS <c>createCompletionDebouncer</c>. Returns a delegate that maps an
  /// argument value to a <see cref="Task{TResult}"/>; the returned debouncer is itself thread-safe and
  /// may be reused across bursts. Cancellation/disposal is the caller's concern (no timer leaks: the
  /// internal timer is one-shot and re-armed per call).
  /// </remarks>
  /// <typeparam name="T">The completion result type.</typeparam>
  /// <param name="run">Issues the actual completion request for an argument value.</param>
  /// <param name="waitMs">The quiet period (ms) before the coalesced call fires. Default 150.</param>
  /// <returns>A debounced runner mapping a value to a task that resolves with the coalesced result.</returns>
  public static Func<string, Task<T>> CreateCompletionDebouncer<T>(Func<string, Task<T>> run, int waitMs = 150)
  {
    ArgumentNullException.ThrowIfNull(run);
    return new CompletionDebouncer<T>(run, waitMs).Invoke;
  }
}

/// <summary>
/// The stateful machinery behind <see cref="Completion.CreateCompletionDebouncer{T}"/> (spec §19.5,
/// R-19.5-n): coalesces a burst of calls into one invocation of the wrapped runner with the final
/// value, resolving every awaiting caller with the single coalesced result.
/// </summary>
internal sealed class CompletionDebouncer<T>
{
  private readonly Func<string, Task<T>> _run;
  private readonly int _waitMs;
  private readonly object _gate = new();
  private readonly List<TaskCompletionSource<T>> _waiters = [];
  private CancellationTokenSource? _timer;

  public CompletionDebouncer(Func<string, Task<T>> run, int waitMs)
  {
    _run = run;
    _waitMs = waitMs;
  }

  /// <summary>
  /// Records a keystroke value, (re)arming the quiet-period timer; the returned task resolves with the
  /// coalesced result when the burst settles.
  /// </summary>
  /// <param name="value">The latest partial argument value.</param>
  /// <returns>A task resolving with the single coalesced completion result.</returns>
  public Task<T> Invoke(string value)
  {
    var waiter = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
    CancellationTokenSource cts;
    lock (_gate)
    {
      _waiters.Add(waiter);
      _timer?.Cancel();
      _timer?.Dispose();
      cts = new CancellationTokenSource();
      _timer = cts;
    }

    // Fire after the quiet window unless a later call cancels this timer first.
    _ = Task.Delay(_waitMs, cts.Token).ContinueWith(
      delayTask =>
      {
        if (delayTask.IsCanceled) return; // superseded by a later keystroke
        Fire(value);
      },
      CancellationToken.None,
      TaskContinuationOptions.ExecuteSynchronously,
      TaskScheduler.Default);

    return waiter.Task;
  }

  private void Fire(string value)
  {
    List<TaskCompletionSource<T>> batch;
    lock (_gate)
    {
      batch = [.. _waiters];
      _waiters.Clear();
      _timer?.Dispose();
      _timer = null;
    }

    if (batch.Count == 0) return;

    _run(value).ContinueWith(
      task =>
      {
        if (task.IsFaulted)
        {
          var error = task.Exception?.GetBaseException() ?? new InvalidOperationException("completion runner faulted");
          foreach (var w in batch) w.TrySetException(error);
        }
        else if (task.IsCanceled)
        {
          foreach (var w in batch) w.TrySetCanceled();
        }
        else
        {
          foreach (var w in batch) w.TrySetResult(task.Result);
        }
      },
      CancellationToken.None,
      TaskContinuationOptions.ExecuteSynchronously,
      TaskScheduler.Default);
  }
}
