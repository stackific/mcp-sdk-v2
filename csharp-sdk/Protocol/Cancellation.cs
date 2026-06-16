using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The §15.2 request-cancellation machinery — the C# counterpart of the cancellation utilities in the
/// TypeScript <c>protocol/progress.ts</c> module. Cancellation is a best-effort, same-direction-only
/// mechanism: a party MAY cancel only requests IT issued, never requests it received, and races are
/// tolerated. The pieces here are:
/// <list type="bullet">
///   <item><see cref="CancellationHandler"/> — receiver-side registry of abort callbacks (R-15.2.2-d).</item>
///   <item><see cref="CancelledRequestSet"/> — sender-side set of cancelled ids whose late responses are ignored (R-15.2.3-e).</item>
///   <item><see cref="ValidateCancellationTarget"/> — own-in-flight + <c>server/discover</c> exclusion (R-15.2.1-a/b, R-15.2.2-b).</item>
///   <item><see cref="IsDiscoverMethod"/> — the discover-not-cancellable guard.</item>
/// </list>
/// </summary>
/// <remarks>
/// The wire shape (<see cref="CancelledNotificationParams"/>) lives in <c>Utilities.cs</c>; its
/// <c>requestId</c> is nullable so a malformed cancellation that omits the id still round-trips and is
/// simply ignored (R-15.2.2-f).
/// </remarks>
public static class Cancellation
{
  /// <summary>The <c>server/discover</c> handshake method name. A client MUST NOT cancel this exchange (R-15.2.2-b).</summary>
  public const string ServerDiscoverMethod = McpMethods.Discover;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="method"/> names the <c>server/discover</c> handshake,
  /// which MUST NOT be cancelled by a client. Mirrors TS <c>isDiscoverMethod</c>. (R-15.2.2-b)
  /// </summary>
  /// <param name="method">The method name.</param>
  /// <returns><c>true</c> when it is the discover method.</returns>
  public static bool IsDiscoverMethod(string method) => string.Equals(method, ServerDiscoverMethod, StringComparison.Ordinal);

  /// <summary>
  /// Reads the <c>requestId</c> a <c>notifications/cancelled</c> targets from its raw <c>params</c>
  /// (§15.2.2), returning <c>null</c> when the params are absent, malformed, or omit the id — a
  /// cancellation that omits the target is simply ignored (R-15.2.2-f), never an error. This is the
  /// parse a server transport uses to find the in-flight request to abort.
  /// </summary>
  /// <param name="parameters">The notification's <c>params</c> object, or <c>null</c>.</param>
  /// <returns>The targeted request id, or <c>null</c> when absent/malformed.</returns>
  public static RequestId? ReadCancelledRequestId(JsonObject? parameters)
  {
    if (parameters is null) return null;
    try
    {
      return parameters.Deserialize<CancelledNotificationParams>(McpJson.Options)?.RequestId;
    }
    catch (JsonException)
    {
      return null;
    }
  }

  /// <summary>
  /// Validates that a cancellation target (the <c>requestId</c> from a <c>notifications/cancelled</c>)
  /// is eligible given the sender's in-flight set. A valid target MUST be present, appear in
  /// <paramref name="inFlightIds"/> (in-flight from the sender's perspective), and not be the
  /// <c>server/discover</c> id when <paramref name="discoverRequestId"/> is supplied. Mirrors TS
  /// <c>validateCancellationTarget</c>. (R-15.2.1-a/b, R-15.2.2-b)
  /// </summary>
  /// <param name="requestId">The cancellation target, or <c>null</c> when the notification omitted it.</param>
  /// <param name="inFlightIds">The ids the sender has issued and not yet received a response to.</param>
  /// <param name="discoverRequestId">The <c>server/discover</c> id that must not be cancelled, or <c>null</c>.</param>
  /// <returns>The validation result; on failure carrying a reason.</returns>
  public static CancellationValidationResult ValidateCancellationTarget(
    RequestId? requestId,
    IReadOnlySet<RequestId> inFlightIds,
    RequestId? discoverRequestId = null)
  {
    ArgumentNullException.ThrowIfNull(inFlightIds);
    if (requestId is not { } target)
    {
      return CancellationValidationResult.Fail("requestId is required");
    }
    if (discoverRequestId is { } discover && target.Equals(discover))
    {
      return CancellationValidationResult.Fail(
        $"Cannot cancel the server/discover handshake (id {target}) (R-15.2.2-b)");
    }
    if (!inFlightIds.Contains(target))
    {
      return CancellationValidationResult.Fail(
        $"requestId {target} is not in-flight from the sender; may only cancel own in-flight requests (R-15.2.1-a)");
    }
    return CancellationValidationResult.Pass;
  }
}

/// <summary>The outcome of <see cref="Cancellation.ValidateCancellationTarget"/> (§15.2.1). Mirrors TS <c>CancellationValidationResult</c>.</summary>
public sealed record CancellationValidationResult
{
  private CancellationValidationResult() { }

  /// <summary><c>true</c> when the cancellation target is eligible.</summary>
  public bool Ok { get; private init; }

  /// <summary>The reason when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</summary>
  public string? Reason { get; private init; }

  /// <summary>A shared success result.</summary>
  public static CancellationValidationResult Pass { get; } = new() { Ok = true };

  /// <summary>Builds a failure carrying the <paramref name="reason"/>.</summary>
  /// <param name="reason">Why the target is ineligible.</param>
  /// <returns>A failure result.</returns>
  public static CancellationValidationResult Fail(string reason) => new() { Ok = false, Reason = reason };
}

/// <summary>
/// A receiver-side registry mapping in-flight request ids to abort callbacks — the C# counterpart of
/// the TypeScript <c>CancellationHandler</c>. When a valid <c>notifications/cancelled</c> arrives, the
/// receiver SHOULD stop processing the matching request, free resources, and suppress the response;
/// this type wires that behavior (R-15.2.2-d / RC-4).
/// </summary>
/// <remarks>
/// Lifecycle: <see cref="Register"/> before dispatching a long-running request; <see cref="Trigger"/>
/// when a valid cancellation arrives (fires the callback and removes the entry); <see cref="Deregister"/>
/// on normal completion (removes the entry WITHOUT firing). String and number ids are tracked
/// independently (the <see cref="RequestId"/> identity preserves the JSON type). Not thread-safe.
/// </remarks>
public sealed class CancellationHandler
{
  private readonly Dictionary<RequestId, Action> _handlers = new();

  /// <summary>
  /// Registers <paramref name="onCancel"/> as the abort callback for <paramref name="requestId"/>. A
  /// previously registered handler for the same id is silently replaced. Mirrors TS <c>register</c>.
  /// </summary>
  /// <param name="requestId">The in-flight request id.</param>
  /// <param name="onCancel">The abort callback (for example cancelling a <see cref="System.Threading.CancellationTokenSource"/>).</param>
  public void Register(RequestId requestId, Action onCancel)
  {
    ArgumentNullException.ThrowIfNull(onCancel);
    _handlers[requestId] = onCancel;
  }

  /// <summary>
  /// Fires the abort callback for <paramref name="requestId"/> and removes it. Returns <c>true</c>
  /// when a handler was found and called (the request was stopped); <c>false</c> when none is
  /// registered (the work may have already completed). Mirrors TS <c>trigger</c>.
  /// </summary>
  /// <param name="requestId">The request id to cancel.</param>
  /// <returns><c>true</c> when a callback was fired.</returns>
  public bool Trigger(RequestId requestId)
  {
    if (!_handlers.TryGetValue(requestId, out var callback)) return false;
    _handlers.Remove(requestId);
    callback();
    return true;
  }

  /// <summary>
  /// Removes the handler for <paramref name="requestId"/> WITHOUT calling it (call on normal
  /// completion). Safe for an unknown id. Mirrors TS <c>deregister</c>.
  /// </summary>
  /// <param name="requestId">The request id.</param>
  public void Deregister(RequestId requestId) => _handlers.Remove(requestId);

  /// <summary>Returns <c>true</c> when an abort callback is registered for <paramref name="requestId"/>. Mirrors TS <c>has</c>.</summary>
  /// <param name="requestId">The request id.</param>
  /// <returns><c>true</c> when registered.</returns>
  public bool Has(RequestId requestId) => _handlers.ContainsKey(requestId);

  /// <summary>The number of currently registered abort callbacks. Mirrors TS <c>size</c>.</summary>
  public int Count => _handlers.Count;
}

/// <summary>
/// A sender-side set of request ids for which a <c>notifications/cancelled</c> was sent but whose
/// response has not yet arrived — the C# counterpart of the TypeScript <c>CancelledRequestSet</c>. A
/// sender SHOULD distinctly ignore (not merely tolerate) late responses to cancelled requests so the
/// race is detectable rather than silently processed (R-15.2.3-e / RC-6).
/// </summary>
/// <remarks>
/// Lifecycle: <see cref="Add"/> immediately after sending the cancellation; <see cref="IsIgnorable"/>
/// when a response arrives (discard it if <c>true</c>); <see cref="Acknowledge"/> after discarding the
/// late response to bound the set's growth. String and number ids are tracked independently. Not
/// thread-safe.
/// </remarks>
public sealed class CancelledRequestSet
{
  private readonly HashSet<RequestId> _ids = [];

  /// <summary>Marks <paramref name="requestId"/> as cancelled (call after sending <c>notifications/cancelled</c>). Mirrors TS <c>add</c>.</summary>
  /// <param name="requestId">The cancelled request id.</param>
  public void Add(RequestId requestId) => _ids.Add(requestId);

  /// <summary>Returns <c>true</c> when a response for <paramref name="requestId"/> SHOULD be ignored. Mirrors TS <c>isIgnorable</c>. (R-15.2.3-e)</summary>
  /// <param name="requestId">The responding request id.</param>
  /// <returns><c>true</c> when the response should be discarded.</returns>
  public bool IsIgnorable(RequestId requestId) => _ids.Contains(requestId);

  /// <summary>Removes <paramref name="requestId"/> after its late response has been discarded. Safe for an unknown id. Mirrors TS <c>acknowledge</c>.</summary>
  /// <param name="requestId">The request id.</param>
  public void Acknowledge(RequestId requestId) => _ids.Remove(requestId);

  /// <summary>The number of ids awaiting a late response to discard. Mirrors TS <c>size</c>.</summary>
  public int Count => _ids.Count;
}
