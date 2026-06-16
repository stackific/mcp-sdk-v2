using System.Collections.Concurrent;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Server;

/// <summary>
/// Tracks active <c>subscriptions/listen</c> streams and fans server-initiated change notifications out
/// to the ones that opted into each kind (spec §10.5). Each delivered notification is tagged with the
/// subscription identifier in <c>_meta</c> (§10.4), and the server only honors the filter kinds it
/// actually supports (§10.3).
/// </summary>
public sealed class SubscriptionManager
{
  private readonly ConcurrentDictionary<string, Entry> _subscriptions = new(StringComparer.Ordinal);

  /// <summary>
  /// Registers a subscription stream and returns the filter the server agreed to honor plus a teardown
  /// handle (spec §10.3). The honored filter is the intersection of the requested kinds and the kinds
  /// the server's capabilities support; the <c>taskIds</c> filter is honored only when the Tasks
  /// extension is active for this request (§25.10) — see the <paramref name="tasksActive"/> parameter.
  /// </summary>
  /// <param name="requested">The filter the client requested.</param>
  /// <param name="capabilities">The server's advertised capabilities.</param>
  /// <param name="subscriptionId">The subscription id (the <c>subscriptions/listen</c> request id, as a string).</param>
  /// <param name="deliver">The sink that writes a notification onto this subscription's stream.</param>
  /// <param name="tasksActive">Whether the Tasks extension is active for this <c>subscriptions/listen</c> request (§25.10); when <c>false</c>, a requested <c>taskIds</c> filter is dropped.</param>
  /// <returns>The honored filter and a disposable that unregisters the subscription.</returns>
  public (SubscriptionFilter Honored, IDisposable Teardown) Register(
    SubscriptionFilter requested,
    ServerCapabilities capabilities,
    string subscriptionId,
    Func<JsonRpcNotification, Task> deliver,
    bool tasksActive = false)
  {
    // §10.3: the honored subset is computed by the shared protocol helper, which also gates taskIds on
    // whether the Tasks extension is active (R-25.10-b/c, §25.10).
    var honored = Subscriptions.ComputeAcknowledgedFilter(requested, capabilities, tasksActive);
    _subscriptions[subscriptionId] = new Entry(honored, deliver);
    return (honored, new Teardown(this, subscriptionId));
  }

  /// <summary>
  /// Fans a change notification out to every subscription whose honored filter selects it (spec §10.5,
  /// §25.10). Supports the four change kinds (list-changed × 3 + resources/updated) plus the
  /// <c>notifications/tasks</c> push, with sub-resource container coverage for resource URIs (§10.5,
  /// R-10.5-j) and per-task <c>taskIds</c> gating for task pushes (§25.10, R-25.10-d).
  /// </summary>
  /// <param name="notification">The change or task notification.</param>
  /// <returns>A task that completes when delivery to all matching subscriptions is done.</returns>
  public async Task FanOutAsync(JsonRpcNotification notification)
  {
    foreach (var (id, entry) in _subscriptions)
    {
      if (!Matches(entry.Filter, notification)) continue;
      await entry.Deliver(Tag(notification, id)).ConfigureAwait(false);
    }
  }

  private static bool Matches(SubscriptionFilter filter, JsonRpcNotification notification)
  {
    var method = notification.Method;
    // For the keyed kinds, the subject key is the updated resource URI / the task id; the shared helper
    // (Subscriptions.MayEmitChangeNotification) applies container coverage for URIs and the taskIds gate.
    if (string.Equals(method, McpMethods.NotificationsResourcesUpdated, StringComparison.Ordinal))
    {
      var uri = notification.Params?["uri"]?.GetValue<string>();
      return Subscriptions.MayEmitChangeNotification(method, filter, uri);
    }
    if (string.Equals(method, McpMethods.NotificationsTasks, StringComparison.Ordinal))
    {
      // §25.10: a task push carries the DetailedTask; gate on its taskId against the taskIds filter.
      var taskId = notification.Params?["taskId"]?.GetValue<string>();
      return Subscriptions.MayEmitChangeNotification(method, filter, taskId);
    }
    return Subscriptions.MayEmitChangeNotification(method, filter);
  }

  private static JsonRpcNotification Tag(JsonRpcNotification notification, string subscriptionId)
  {
    var prms = notification.Params is null ? new JsonObject() : (JsonObject)notification.Params.DeepClone();
    var meta = prms["_meta"] as JsonObject ?? new JsonObject();
    meta[MetaKeys.SubscriptionId] = subscriptionId;
    prms["_meta"] = meta;
    return notification with { Params = prms };
  }

  private sealed record Entry(SubscriptionFilter Filter, Func<JsonRpcNotification, Task> Deliver);

  private sealed class Teardown(SubscriptionManager manager, string subscriptionId) : IDisposable
  {
    public void Dispose() => manager._subscriptions.TryRemove(subscriptionId, out _);
  }
}
