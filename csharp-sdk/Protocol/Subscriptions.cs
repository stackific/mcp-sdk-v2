using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The notification kinds a client opts in to on a <c>subscriptions/listen</c> stream (spec §10.2).
/// All fields are OPTIONAL; an omitted/false field means "not subscribed". The server echoes the
/// subset it will honor in the acknowledgement (§10.3).
/// </summary>
public sealed record SubscriptionFilter
{
  /// <summary>When <c>true</c>, deliver <c>notifications/tools/list_changed</c> on this stream (§16.8).</summary>
  public bool? ToolsListChanged { get; init; }

  /// <summary>When <c>true</c>, deliver <c>notifications/prompts/list_changed</c> on this stream (§18.6).</summary>
  public bool? PromptsListChanged { get; init; }

  /// <summary>When <c>true</c>, deliver <c>notifications/resources/list_changed</c> on this stream (§17.7).</summary>
  public bool? ResourcesListChanged { get; init; }

  /// <summary>The absolute resource URIs to watch for <c>notifications/resources/updated</c> (§17.7); absent/empty ⇒ none.</summary>
  public IReadOnlyList<string>? ResourceSubscriptions { get; init; }

  /// <summary>
  /// The task ids to receive <c>notifications/tasks</c> status pushes for (§25.10, R-25.10-b). Each
  /// element MUST be a <c>taskId</c> the client holds (R-25.10-c). Honored ONLY when the Tasks extension
  /// is active for the <c>subscriptions/listen</c> request; supplying it without the negotiated tasks
  /// capability MUST yield <c>-32003</c> (R-25.10-e). Absent/empty ⇒ no task pushes.
  /// </summary>
  public IReadOnlyList<string>? TaskIds { get; init; }
}

/// <summary>Parameters of the <c>subscriptions/listen</c> request (spec §10.2).</summary>
public sealed record SubscriptionsListenRequestParams
{
  /// <summary>REQUIRED. The notification kinds the client opts in to on this stream.</summary>
  public required SubscriptionFilter Notifications { get; init; }
}

/// <summary>
/// Parameters of the <c>notifications/subscriptions/acknowledged</c> notification (spec §10.3) — the
/// first message on every subscription stream. The subscription identifier is carried in the
/// notification's <c>_meta</c> under <c>io.modelcontextprotocol/subscriptionId</c> (§10.4).
/// </summary>
public sealed record SubscriptionsAcknowledgedNotificationParams
{
  /// <summary>REQUIRED. The subset of the requested filter the server agreed to honor (§10.3).</summary>
  public required SubscriptionFilter Notifications { get; init; }
}

/// <summary>
/// Pure, side-effect-free helpers for server-to-client subscriptions (spec §10): the four
/// change-notification kinds and the request-scoped kinds (§10.5, §10.6), absolute-URI validation,
/// sub-resource (container) URI coverage with boundary safety (§10.5, R-10.5-j), the honored-subset
/// computation including the <c>taskIds</c> gate (§10.3, §25.10), stream-boundary violation detection
/// (§10.6), and the declined-kinds report (§10.3). The C# counterpart of the exported functions in the
/// TypeScript <c>protocol/streaming.ts</c> (S16). The client-facing <see cref="Subscription"/> /
/// <see cref="SubscriptionRegistry"/> lifecycle objects live alongside this class.
/// </summary>
public static class Subscriptions
{
  // ─── §10.5 / §10.6 — Change & request-scoped notification kinds ──────────────

  /// <summary>The exactly-four change-notification kinds that flow on a subscription stream (§10.5, R-10.5-a).</summary>
  public static readonly IReadOnlyList<string> ChangeNotificationMethods =
  [
    McpMethods.NotificationsToolsListChanged,
    McpMethods.NotificationsPromptsListChanged,
    McpMethods.NotificationsResourcesListChanged,
    McpMethods.NotificationsResourcesUpdated,
  ];

  private static readonly HashSet<string> ChangeMethodSet = new(ChangeNotificationMethods, StringComparer.Ordinal);

  /// <summary>The two request-scoped kinds that travel on a request's own stream, never a subscription stream (§10.6, R-10.6-a).</summary>
  public static readonly IReadOnlyList<string> RequestScopedNotificationMethods =
  [
    McpMethods.NotificationsProgress,
    McpMethods.NotificationsMessage,
  ];

  private static readonly HashSet<string> RequestScopedSet = new(RequestScopedNotificationMethods, StringComparer.Ordinal);

  /// <summary>Returns <c>true</c> when <paramref name="method"/> is one of the four subscription change kinds (R-10.5-a).</summary>
  /// <param name="method">The notification method name.</param>
  /// <returns><c>true</c> when it is a change kind.</returns>
  public static bool IsChangeNotificationMethod(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return ChangeMethodSet.Contains(method);
  }

  /// <summary>Returns <c>true</c> when <paramref name="method"/> is a request-scoped (progress/logging) kind (R-10.6-a).</summary>
  /// <param name="method">The notification method name.</param>
  /// <returns><c>true</c> when it is request-scoped.</returns>
  public static bool IsRequestScopedNotificationMethod(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return RequestScopedSet.Contains(method);
  }

  // ─── §10.2 — Absolute-URI validation & empty filter ──────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is an absolute URI string [RFC3986] — a scheme
  /// followed by <c>:</c> and at least one further character (§10.2, R-10.2-i). A relative reference (no
  /// scheme) is rejected.
  /// </summary>
  /// <param name="value">The candidate URI.</param>
  /// <returns><c>true</c> when it is an absolute URI.</returns>
  public static bool IsAbsoluteUri(string? value)
  {
    if (string.IsNullOrEmpty(value)) return false;
    // RFC3986 scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
    var colon = value.IndexOf(':');
    if (colon <= 0) return false;
    if (!char.IsAsciiLetter(value[0])) return false;
    for (var i = 1; i < colon; i++)
    {
      var c = value[i];
      if (!char.IsAsciiLetterOrDigit(c) && c is not ('+' or '-' or '.')) return false;
    }
    return Uri.TryCreate(value, UriKind.Absolute, out _);
  }

  /// <summary>
  /// Returns <c>true</c> when the filter requests no kinds at all — every boolean is absent/<c>false</c>
  /// and both <c>resourceSubscriptions</c> and <c>taskIds</c> are absent/empty (§10.2, R-10.2-k). Such a
  /// filter yields an acknowledgement-only stream.
  /// </summary>
  /// <param name="filter">The subscription filter.</param>
  /// <returns><c>true</c> when nothing is requested.</returns>
  public static bool IsEmptySubscriptionFilter(SubscriptionFilter filter)
  {
    ArgumentNullException.ThrowIfNull(filter);
    return filter.ToolsListChanged != true
      && filter.PromptsListChanged != true
      && filter.ResourcesListChanged != true
      && (filter.ResourceSubscriptions is null || filter.ResourceSubscriptions.Count == 0)
      && (filter.TaskIds is null || filter.TaskIds.Count == 0);
  }

  // ─── §10.5 — Resource-update URI matching (container coverage) ────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="updatedUri"/> is covered by <paramref name="subscribedUri"/> —
  /// either an exact match or a sub-resource of a subscribed CONTAINER URI (the updated URI MAY be a
  /// descendant) (§10.5, R-10.5-j). Container matching is path-prefix based after a normalized
  /// scheme+host compare: <c>file:///dir</c> covers <c>file:///dir/file.txt</c>. A bare prefix that is
  /// not a path boundary (<c>file:///dir</c> vs <c>file:///directory</c>) does NOT match.
  /// </summary>
  /// <param name="updatedUri">The URI of the updated resource.</param>
  /// <param name="subscribedUri">A subscribed container or exact URI.</param>
  /// <returns><c>true</c> when covered.</returns>
  public static bool UriCoveredBySubscription(string updatedUri, string subscribedUri)
  {
    ArgumentNullException.ThrowIfNull(updatedUri);
    ArgumentNullException.ThrowIfNull(subscribedUri);
    if (string.Equals(updatedUri, subscribedUri, StringComparison.Ordinal)) return true;
    if (!IsAbsoluteUri(updatedUri) || !IsAbsoluteUri(subscribedUri)) return false;
    if (!Uri.TryCreate(subscribedUri, UriKind.Absolute, out var sub)
      || !Uri.TryCreate(updatedUri, UriKind.Absolute, out var upd))
    {
      return false;
    }
    if (!string.Equals(sub.Scheme, upd.Scheme, StringComparison.Ordinal)
      || !string.Equals(sub.Authority, upd.Authority, StringComparison.Ordinal))
    {
      return false;
    }
    var basePath = sub.AbsolutePath.EndsWith('/') ? sub.AbsolutePath : $"{sub.AbsolutePath}/";
    return upd.AbsolutePath.StartsWith(basePath, StringComparison.Ordinal);
  }

  /// <summary>
  /// Returns <c>true</c> when a <c>notifications/resources/updated</c> for <paramref name="updatedUri"/>
  /// is permitted on a subscription whose acknowledged <c>resourceSubscriptions</c> are
  /// <paramref name="subscribedUris"/> — i.e. the URI (or a parent container) was listed (§10.2, §10.5,
  /// R-10.2-l, R-10.5-h). A server MUST NOT send an update for an unlisted resource.
  /// </summary>
  /// <param name="updatedUri">The URI of the updated resource.</param>
  /// <param name="subscribedUris">The acknowledged subscribed URIs.</param>
  /// <returns><c>true</c> when delivery is permitted.</returns>
  public static bool MayDeliverResourceUpdate(string updatedUri, IReadOnlyCollection<string>? subscribedUris)
  {
    ArgumentNullException.ThrowIfNull(updatedUri);
    return subscribedUris is not null && subscribedUris.Any(sub => UriCoveredBySubscription(updatedUri, sub));
  }

  // ─── §10.3 — Honored-subset computation ──────────────────────────────────────

  /// <summary>
  /// Computes the honored-subset filter for the acknowledgement: a kind is honored only when the client
  /// requested it AND the gating server capability/sub-flag is declared; unsupported kinds are OMITTED
  /// (§10.3, R-10.3-c, R-10.3-d). For <c>resourceSubscriptions</c>, the honored list is the requested URIs
  /// when <c>resources.subscribe</c> is declared. For <c>taskIds</c>, the honored list is the requested
  /// ids ONLY when <paramref name="tasksActive"/> (the Tasks extension is active for this request, §25.10).
  /// </summary>
  /// <param name="requested">The client's requested filter.</param>
  /// <param name="serverCaps">The server's declared capabilities.</param>
  /// <param name="tasksActive">Whether the Tasks extension is active for this <c>subscriptions/listen</c> request (default <c>false</c>).</param>
  /// <returns>The honored-subset filter.</returns>
  public static SubscriptionFilter ComputeAcknowledgedFilter(
    SubscriptionFilter requested,
    ServerCapabilities serverCaps,
    bool tasksActive = false)
  {
    ArgumentNullException.ThrowIfNull(requested);
    ArgumentNullException.ThrowIfNull(serverCaps);

    IReadOnlyList<string>? honoredTaskIds = null;
    if (requested.TaskIds is { Count: > 0 } && tasksActive)
    {
      honoredTaskIds = [.. requested.TaskIds];
    }

    return new SubscriptionFilter
    {
      ToolsListChanged = requested.ToolsListChanged == true && serverCaps.DeclaresToolsListChanged ? true : null,
      PromptsListChanged = requested.PromptsListChanged == true && serverCaps.DeclaresPromptsListChanged ? true : null,
      ResourcesListChanged = requested.ResourcesListChanged == true && serverCaps.DeclaresResourcesListChanged ? true : null,
      ResourceSubscriptions = requested.ResourceSubscriptions is { Count: > 0 } && serverCaps.DeclaresResourcesSubscribe
        ? [.. requested.ResourceSubscriptions]
        : null,
      TaskIds = honoredTaskIds,
    };
  }

  /// <summary>
  /// Returns the kinds the client requested but the server did NOT honor (declined), so a client can
  /// handle them gracefully and not block on a declined kind (§10.3, R-10.3-f).
  /// </summary>
  /// <param name="requested">The client's requested filter.</param>
  /// <param name="acknowledged">The server's acknowledged filter.</param>
  /// <returns>The declined boolean fields and declined URIs.</returns>
  public static (IReadOnlyList<string> Fields, IReadOnlyList<string> Uris) DeclinedFilterKinds(
    SubscriptionFilter requested,
    SubscriptionFilter acknowledged)
  {
    ArgumentNullException.ThrowIfNull(requested);
    ArgumentNullException.ThrowIfNull(acknowledged);
    var fields = new List<string>();
    if (requested.ToolsListChanged == true && acknowledged.ToolsListChanged != true) fields.Add(nameof(SubscriptionFilter.ToolsListChanged));
    if (requested.PromptsListChanged == true && acknowledged.PromptsListChanged != true) fields.Add(nameof(SubscriptionFilter.PromptsListChanged));
    if (requested.ResourcesListChanged == true && acknowledged.ResourcesListChanged != true) fields.Add(nameof(SubscriptionFilter.ResourcesListChanged));
    var ack = new HashSet<string>(acknowledged.ResourceSubscriptions ?? [], StringComparer.Ordinal);
    var uris = (requested.ResourceSubscriptions ?? []).Where(u => !ack.Contains(u)).ToList();
    return (fields, uris);
  }

  // ─── §10.5 / §25.10 — Stream-emission gating ─────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when the server MAY emit the change notification <paramref name="method"/> on a
  /// subscription stream whose acknowledged filter is <paramref name="acknowledged"/> (§10.5, R-10.5-l).
  /// For <c>notifications/resources/updated</c>, pass the updated URI as <paramref name="subjectKey"/>;
  /// for <c>notifications/tasks</c>, pass the task id (§25.10). A kind is emittable only when its filter
  /// field is reflected in the acknowledged filter.
  /// </summary>
  /// <param name="method">The notification method.</param>
  /// <param name="acknowledged">The acknowledged honored filter.</param>
  /// <param name="subjectKey">The per-resource URI or per-task id, when the kind is keyed.</param>
  /// <returns><c>true</c> when emission is permitted.</returns>
  public static bool MayEmitChangeNotification(string method, SubscriptionFilter acknowledged, string? subjectKey = null)
  {
    ArgumentNullException.ThrowIfNull(method);
    ArgumentNullException.ThrowIfNull(acknowledged);
    if (string.Equals(method, McpMethods.NotificationsToolsListChanged, StringComparison.Ordinal))
    {
      return acknowledged.ToolsListChanged == true;
    }
    if (string.Equals(method, McpMethods.NotificationsPromptsListChanged, StringComparison.Ordinal))
    {
      return acknowledged.PromptsListChanged == true;
    }
    if (string.Equals(method, McpMethods.NotificationsResourcesListChanged, StringComparison.Ordinal))
    {
      return acknowledged.ResourcesListChanged == true;
    }
    if (string.Equals(method, McpMethods.NotificationsResourcesUpdated, StringComparison.Ordinal))
    {
      if (acknowledged.ResourceSubscriptions is not { Count: > 0 } uris || subjectKey is null) return false;
      return MayDeliverResourceUpdate(subjectKey, uris);
    }
    if (string.Equals(method, McpMethods.NotificationsTasks, StringComparison.Ordinal))
    {
      // §25.10: emit only for a task the client opted into via `taskIds`.
      return subjectKey is not null && acknowledged.TaskIds is { } ids && ids.Contains(subjectKey);
    }
    return false;
  }

  // ─── §10.6 — Stream-boundary classification & violation detection ────────────

  /// <summary>
  /// Classifies a notification <paramref name="method"/> against the §10.6 boundary: a change kind →
  /// <see cref="NotificationStreamPlacement.Subscription"/>; <c>notifications/progress</c> /
  /// <c>notifications/message</c> → <see cref="NotificationStreamPlacement.RequestScoped"/>; anything else
  /// → <see cref="NotificationStreamPlacement.Neither"/> (R-10.6-c, R-10.6-a).
  /// </summary>
  /// <param name="method">The notification method.</param>
  /// <returns>Which stream the notification belongs on.</returns>
  public static NotificationStreamPlacement ClassifyNotificationStream(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    if (IsChangeNotificationMethod(method)) return NotificationStreamPlacement.Subscription;
    if (IsRequestScopedNotificationMethod(method)) return NotificationStreamPlacement.RequestScoped;
    return NotificationStreamPlacement.Neither;
  }

  /// <summary>
  /// Returns <c>true</c> when receiving notification <paramref name="method"/> on a SUBSCRIPTION stream is
  /// a protocol violation — i.e. it is a request-scoped (progress/logging) kind, which MUST NOT appear
  /// there (§10.6, R-10.6-b, R-10.6-e, R-10.6-g).
  /// </summary>
  /// <param name="method">The notification method.</param>
  /// <returns><c>true</c> when it is a violation on a subscription stream.</returns>
  public static bool IsViolationOnSubscriptionStream(string method) => IsRequestScopedNotificationMethod(method);

  /// <summary>
  /// Returns <c>true</c> when receiving notification <paramref name="method"/> on an unrelated request's
  /// response stream is a protocol violation — i.e. it is one of the four change kinds, which MUST NOT
  /// appear on a non-<c>subscriptions/listen</c> response stream (§10.6, R-10.6-d, R-10.6-f, R-10.6-g).
  /// </summary>
  /// <param name="method">The notification method.</param>
  /// <returns><c>true</c> when it is a violation on a request stream.</returns>
  public static bool IsViolationOnRequestStream(string method) => IsChangeNotificationMethod(method);
}

/// <summary>Which stream a notification kind belongs on (spec §10.6).</summary>
public enum NotificationStreamPlacement
{
  /// <summary>One of the four change kinds — belongs on a subscription stream.</summary>
  Subscription,

  /// <summary>A progress/logging kind — belongs on a request's own response stream.</summary>
  RequestScoped,

  /// <summary>Neither a change kind nor a request-scoped kind.</summary>
  Neither,
}

/// <summary>The lifecycle states of a subscription (spec §10.7).</summary>
public enum SubscriptionState
{
  /// <summary>Created but not yet acknowledged; no change notification may precede the acknowledgement.</summary>
  Opening,

  /// <summary>Acknowledged; change notifications matching the honored filter may flow.</summary>
  Active,

  /// <summary>Closed; retains no resumable state.</summary>
  Closed,
}

/// <summary>How a subscription stream ended (spec §10.7).</summary>
public enum SubscriptionCloseReason
{
  /// <summary>The client cancelled the subscription (closed the stream).</summary>
  ClientCancel,

  /// <summary>The server tore the subscription down (e.g. during shutdown).</summary>
  ServerTeardown,

  /// <summary>The underlying transport closed.</summary>
  TransportClose,
}

/// <summary>
/// Tracks the request-scoped lifecycle of a single client-side subscription (spec §10.7). The state is
/// scoped to the <c>subscriptions/listen</c> request, NOT to the connection: once closed the
/// subscription is gone and retains NO resumable state — re-establishment is a NEW
/// <c>subscriptions/listen</c> request yielding a NEW id (R-10.7-d, R-10.7-f). The C# counterpart of
/// the TypeScript <c>Subscription</c> class.
/// </summary>
public sealed class Subscription
{
  private SubscriptionState _state = SubscriptionState.Opening;
  private SubscriptionCloseReason? _closeReason;

  /// <summary>Creates a subscription and computes its honored-subset filter at construction.</summary>
  /// <param name="requestId">The <c>subscriptions/listen</c> request id (the subscription identifier source).</param>
  /// <param name="requested">The client's requested filter.</param>
  /// <param name="serverCaps">The server's declared capabilities (gates the honored subset); defaults to none.</param>
  /// <param name="tasksActive">Whether the Tasks extension is active for this request (§25.10); default <c>false</c>.</param>
  public Subscription(RequestId requestId, SubscriptionFilter requested, ServerCapabilities? serverCaps = null, bool tasksActive = false)
  {
    ArgumentNullException.ThrowIfNull(requested);
    RequestId = requestId;
    Requested = requested;
    SubscriptionId = requestId.ToString();
    AcknowledgedFilter = Subscriptions.ComputeAcknowledgedFilter(requested, serverCaps ?? new ServerCapabilities(), tasksActive);
  }

  /// <summary>The <c>subscriptions/listen</c> request id.</summary>
  public RequestId RequestId { get; }

  /// <summary>The subscription identifier: the request id serialized as a JSON string.</summary>
  public string SubscriptionId { get; }

  /// <summary>The client's requested filter.</summary>
  public SubscriptionFilter Requested { get; }

  /// <summary>The honored-subset filter the server agreed to (computed at construction).</summary>
  public SubscriptionFilter AcknowledgedFilter { get; }

  /// <summary>The current lifecycle state.</summary>
  public SubscriptionState State => _state;

  /// <summary>How the subscription closed, or <c>null</c> while still open.</summary>
  public SubscriptionCloseReason? CloseReason => _closeReason;

  /// <summary><c>true</c> once the subscription has closed.</summary>
  public bool IsClosed => _state == SubscriptionState.Closed;

  /// <summary>
  /// Builds the mandatory first message — the <c>notifications/subscriptions/acknowledged</c> params —
  /// and transitions <c>opening</c> → <c>active</c> (§10.3, R-10.3-a). The acknowledgement carries the
  /// honored subset and the subscription id in <c>_meta</c>.
  /// </summary>
  /// <returns>The acknowledgement params.</returns>
  /// <exception cref="InvalidOperationException">When called after the subscription has already acknowledged or closed.</exception>
  public SubscriptionsAcknowledgedNotificationParams Acknowledge()
  {
    if (_state != SubscriptionState.Opening)
    {
      throw new InvalidOperationException(
        $"Subscription \"{SubscriptionId}\" already acknowledged or closed; the acknowledgement is the single first message (R-10.3-a).");
    }
    _state = SubscriptionState.Active;
    return new SubscriptionsAcknowledgedNotificationParams { Notifications = AcknowledgedFilter };
  }

  /// <summary>Returns the <c>_meta</c> fragment to attach to a change notification on this stream — carrying the subscription id (§10.4, §10.5).</summary>
  /// <returns>A <c>_meta</c> object with the subscription id.</returns>
  public JsonObject MetaFragment() => new() { [MetaKeys.SubscriptionId] = SubscriptionId };

  /// <summary>
  /// Returns <c>true</c> when the server MAY emit change notification <paramref name="method"/> on this
  /// stream (state <c>active</c> and the acknowledged filter permits it) (§10.5, R-10.5-l). For
  /// <c>notifications/resources/updated</c> pass the URI; for <c>notifications/tasks</c> pass the task id.
  /// </summary>
  /// <param name="method">The notification method.</param>
  /// <param name="subjectKey">The per-resource URI or per-task id, when the kind is keyed.</param>
  /// <returns><c>true</c> when emission is permitted.</returns>
  public bool MayEmit(string method, string? subjectKey = null)
  {
    if (_state != SubscriptionState.Active) return false;
    return Subscriptions.MayEmitChangeNotification(method, AcknowledgedFilter, subjectKey);
  }

  /// <summary>
  /// Transitions to <c>closed</c> for the given reason. Idempotent: a second close is a no-op (the first
  /// reason wins). After close the subscription retains no state and is NOT resumable (§10.7, R-10.7-a..d, R-10.7-f).
  /// </summary>
  /// <param name="reason">Why the subscription closed.</param>
  public void Close(SubscriptionCloseReason reason)
  {
    if (_state == SubscriptionState.Closed) return;
    _state = SubscriptionState.Closed;
    _closeReason = reason;
  }

  /// <summary>
  /// Builds the server-teardown signal for this subscription: a <c>notifications/cancelled</c>
  /// referencing the <c>subscriptions/listen</c> request id (§10.7, R-10.7-b). On stdio the transport
  /// sends this after <c>Close(ServerTeardown)</c>; on Streamable HTTP it instead ends the SSE response.
  /// The <c>params.requestId</c> equals this subscription's listen id so the client can correlate.
  /// </summary>
  /// <param name="reason">An optional human-readable explanation.</param>
  /// <returns>The teardown notification.</returns>
  public JsonRpcNotification TeardownNotification(string reason = "subscription torn down by server")
  {
    var prms = new JsonObject
    {
      ["requestId"] = RequestId.ToJsonNode(),
      ["reason"] = reason,
    };
    return new JsonRpcNotification(McpMethods.NotificationsCancelled, prms);
  }
}

/// <summary>
/// Routes incoming subscription notifications to the correct active <see cref="Subscription"/> by
/// <c>io.modelcontextprotocol/subscriptionId</c> — essential on stdio where all subscriptions share one
/// channel, and supported on HTTP where the key is still present (§10.4, R-10.4-c, R-10.4-d). Holds NO
/// state across connections; closing a subscription removes it. The C# counterpart of the TypeScript
/// <c>SubscriptionRegistry</c>.
/// </summary>
public sealed class SubscriptionRegistry
{
  private readonly Dictionary<string, Subscription> _byId = new(StringComparer.Ordinal);

  /// <summary>Registers <paramref name="subscription"/>, keyed by its subscription id.</summary>
  /// <param name="subscription">The subscription to register.</param>
  /// <exception cref="InvalidOperationException">When a subscription with the same id is already active (ids MUST be unique while in-flight).</exception>
  public void Add(Subscription subscription)
  {
    ArgumentNullException.ThrowIfNull(subscription);
    if (!_byId.TryAdd(subscription.SubscriptionId, subscription))
    {
      throw new InvalidOperationException(
        $"Subscription id \"{subscription.SubscriptionId}\" is already active; each subscription is identified by its own request id (R-10.1-i).");
    }
  }

  /// <summary>Returns the active subscription with <paramref name="subscriptionId"/>, or <c>null</c>.</summary>
  /// <param name="subscriptionId">The subscription id.</param>
  /// <returns>The subscription, or <c>null</c>.</returns>
  public Subscription? Get(string subscriptionId) =>
    _byId.TryGetValue(subscriptionId, out var sub) ? sub : null;

  /// <summary>
  /// Routes a notification's <paramref name="prms"/> to its owning subscription using the
  /// <c>io.modelcontextprotocol/subscriptionId</c> key (§10.4, R-10.4-c). Returns <c>null</c> when the
  /// key is absent or no matching subscription is active.
  /// </summary>
  /// <param name="prms">The notification's <c>params</c> object.</param>
  /// <returns>The owning subscription, or <c>null</c>.</returns>
  public Subscription? Route(JsonObject? prms)
  {
    var id = ReadSubscriptionId(prms);
    return id is null ? null : Get(id);
  }

  /// <summary>
  /// Closes and removes the subscription with <paramref name="subscriptionId"/> (no retained state)
  /// (§10.7, R-10.7-d). Returns <c>true</c> when one was removed.
  /// </summary>
  /// <param name="subscriptionId">The subscription id.</param>
  /// <param name="reason">Why the subscription closed.</param>
  /// <returns><c>true</c> when a subscription was removed.</returns>
  public bool Remove(string subscriptionId, SubscriptionCloseReason reason)
  {
    if (!_byId.TryGetValue(subscriptionId, out var sub)) return false;
    sub.Close(reason);
    _byId.Remove(subscriptionId);
    return true;
  }

  /// <summary>The number of currently active subscriptions.</summary>
  public int Count => _byId.Count;

  /// <summary>A snapshot of all active subscription ids.</summary>
  public IReadOnlyList<string> ActiveIds => [.. _byId.Keys];

  /// <summary>
  /// Returns the <c>io.modelcontextprotocol/subscriptionId</c> value from a notification's
  /// <c>params._meta</c>, or <c>null</c> when absent or not a string (§10.4, R-10.4-a, R-10.4-f). The
  /// lookup is case-sensitive and verbatim.
  /// </summary>
  /// <param name="prms">The notification's <c>params</c> object.</param>
  /// <returns>The subscription id, or <c>null</c>.</returns>
  public static string? ReadSubscriptionId(JsonObject? prms)
  {
    if (prms?["_meta"] is not JsonObject meta) return null;
    return meta[MetaKeys.SubscriptionId] is JsonValue value && value.GetValueKind() == JsonValueKind.String
      ? value.GetValue<string>()
      : null;
  }
}
