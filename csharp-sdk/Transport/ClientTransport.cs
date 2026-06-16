using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Transport;

/// <summary>
/// Per-request options for a client transport send: the sink for request-scoped notifications
/// (progress/logging) that arrive on this request's stream (spec §9.6.2), an optional progress token
/// to opt into progress, extra <c>_meta</c> to carry (for example W3C trace context, §15.4), a
/// timeout, and a cancellation signal that closes the request's stream (§9.6.2/§15.2).
/// </summary>
public sealed class RequestOptions
{
  /// <summary>Invoked for each request-scoped notification received before the final response.</summary>
  public Action<JsonRpcNotification>? OnNotification { get; init; }

  /// <summary>An optional progress token; when set, the client opts into <c>notifications/progress</c> for this request (§15.1.2).</summary>
  public ProgressToken? ProgressToken { get; init; }

  /// <summary>Additional <c>_meta</c> keys to merge onto the request (for example <c>traceparent</c>).</summary>
  public JsonObject? Meta { get; init; }

  /// <summary>An optional client-side timeout for the request.</summary>
  public TimeSpan? Timeout { get; init; }

  /// <summary>A cancellation signal; cancelling closes the request's stream, which the server treats as cancellation (§9.6.2).</summary>
  public CancellationToken CancellationToken { get; init; }
}

/// <summary>
/// A handle to an open subscription stream (spec §10): the filter the server agreed to honor (§10.3),
/// and an action to close the stream and stop delivery (§10.7).
/// </summary>
public sealed class SubscriptionHandle
{
  /// <summary>The subset of the requested filter the server agreed to honor (§10.3).</summary>
  public required SubscriptionFilter HonoredFilter { get; init; }

  /// <summary>
  /// The boolean filter kinds the client requested but the server did NOT honor — the declined
  /// <c>*ListChanged</c> field names (§10.3). Empty when every requested kind was honored. A caller can
  /// inspect this to learn it will not receive a kind it asked for.
  /// </summary>
  public IReadOnlyList<string> DeclinedFields { get; init; } = [];

  /// <summary>
  /// The resource-subscription URIs the client requested but the server did NOT honor (§10.3). Empty
  /// when every requested URI was honored.
  /// </summary>
  public IReadOnlyList<string> DeclinedUris { get; init; } = [];

  /// <summary>Closes the subscription stream and stops further delivery.</summary>
  public required Func<ValueTask> Unsubscribe { get; init; }
}

/// <summary>
/// The client-side transport abstraction: it sends a single JSON-RPC request or notification and, for
/// a request, returns the final response — delivering any interim request-scoped notifications through
/// <see cref="RequestOptions.OnNotification"/>. Concrete transports are the in-memory bridge
/// (<see cref="InMemoryClientTransport"/>) and Streamable HTTP. Every outbound and inbound frame is
/// offered to <see cref="OnSend"/>/<see cref="OnReceive"/> so a host can tap the wire (§9).
/// </summary>
public abstract class ClientTransport : IAsyncDisposable
{
  /// <summary>Invoked with every outbound frame as raw JSON, for wire inspection.</summary>
  public Action<JsonNode>? OnSend { get; set; }

  /// <summary>Invoked with every inbound frame as raw JSON, for wire inspection.</summary>
  public Action<JsonNode>? OnReceive { get; set; }

  /// <summary>Sends a request and awaits its final response (a success or error response, §9.6).</summary>
  /// <param name="request">The request to send.</param>
  /// <param name="options">Per-request options.</param>
  /// <returns>The final JSON-RPC response.</returns>
  public abstract Task<JsonRpcMessage> SendRequestAsync(JsonRpcRequest request, RequestOptions options);

  /// <summary>Sends a one-way notification (acknowledged transport-side; no response, §3.4/§9.2).</summary>
  /// <param name="notification">The notification to send.</param>
  /// <param name="cancellationToken">Cancels the send.</param>
  /// <returns>A task that completes when the notification has been sent.</returns>
  public abstract Task SendNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken = default);

  /// <summary>
  /// Opens a long-lived <c>subscriptions/listen</c> stream (spec §10): awaits the server's
  /// acknowledgement (the honored filter, §10.3) and then delivers each change notification to
  /// <paramref name="onNotification"/> until the returned handle is unsubscribed.
  /// </summary>
  /// <param name="listenRequest">The <c>subscriptions/listen</c> request (with its <c>_meta</c> envelope applied).</param>
  /// <param name="onNotification">Invoked for each change notification on the stream.</param>
  /// <param name="cancellationToken">Cancels opening the stream.</param>
  /// <returns>A handle carrying the honored filter and an unsubscribe action.</returns>
  public abstract Task<SubscriptionHandle> OpenSubscriptionAsync(
    JsonRpcRequest listenRequest,
    Action<JsonRpcNotification> onNotification,
    CancellationToken cancellationToken = default);

  /// <summary>Releases any resources held by the transport.</summary>
  /// <returns>A task that completes when disposal is done.</returns>
  public virtual ValueTask DisposeAsync() => ValueTask.CompletedTask;

  /// <summary>Offers an outbound frame to the <see cref="OnSend"/> tap.</summary>
  /// <param name="message">The message being sent.</param>
  protected void TapSend(JsonRpcMessage message) => OnSend?.Invoke(JsonRpcMessageSerializer.ToNode(message));

  /// <summary>Offers an inbound frame to the <see cref="OnReceive"/> tap.</summary>
  /// <param name="message">The message received.</param>
  protected void TapReceive(JsonRpcMessage message) => OnReceive?.Invoke(JsonRpcMessageSerializer.ToNode(message));
}
