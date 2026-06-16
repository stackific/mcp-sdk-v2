using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Transport;

/// <summary>
/// The validated authorization identity a transport threads into request processing when a request
/// carried a bearer token (spec §23). It is per-request input (never connection state, §4.4) and is
/// surfaced to tool handlers via the request context.
/// </summary>
/// <param name="Token">The raw bearer token presented on the request.</param>
/// <param name="ClientId">The authenticated client identifier, if known.</param>
/// <param name="Scopes">The granted OAuth scopes.</param>
/// <param name="Audience">The token's bound audience (the protected resource), if known (§23.6).</param>
/// <param name="ExpiresAt">The token expiry as a Unix timestamp in seconds, if known.</param>
public sealed record AuthInfo(
  string Token,
  string? ClientId = null,
  IReadOnlyList<string>? Scopes = null,
  string? Audience = null,
  long? ExpiresAt = null);

/// <summary>
/// The sink a request handler uses to emit request-scoped notifications (progress, logging) on the
/// originating request's response stream (spec §9.6.2, §10.6). The transport decides how to deliver
/// them: on Streamable HTTP they ride the request's SSE stream; in memory they are handed straight to
/// the client. A notification emitted here MUST relate to the request being processed.
/// </summary>
public interface IServerNotifier
{
  /// <summary>Emits a request-scoped notification on the originating request's stream.</summary>
  /// <param name="notification">The notification to deliver.</param>
  /// <returns>A task that completes when the notification has been handed to the transport.</returns>
  Task NotifyAsync(JsonRpcNotification notification);

  // §9.6.2 (R-9.6.2-d): there is deliberately NO server-to-client REQUEST channel here. A server MUST NOT
  // send independent JSON-RPC requests on a response stream; it reaches back to the client only by
  // embedding an `input_required` result resolved by client retry (§11 Multi-Round-Trip Requests),
  // surfaced through ToolContext.ElicitInputAsync / CreateMessageAsync / ListRootsAsync.
}

/// <summary>
/// The transport-facing surface of an MCP server: it accepts a parsed request and produces the final
/// JSON-RPC response, emitting any request-scoped notifications through the supplied
/// <see cref="IServerNotifier"/>. Implemented by <c>McpServer</c>; consumed by every server transport
/// (the in-memory bridge and the Streamable HTTP adapter), which handle framing, headers, and routing.
/// </summary>
public interface IMcpRequestHandler
{
  /// <summary>
  /// Processes one JSON-RPC request and returns the final response (a success or an error response).
  /// Protocol failures are returned as error responses, not thrown (spec §22).
  /// </summary>
  /// <param name="request">The parsed request.</param>
  /// <param name="notifier">The sink for request-scoped notifications.</param>
  /// <param name="authInfo">The validated bearer identity, if the request was authenticated.</param>
  /// <param name="cancellationToken">Cancels processing (for example when the client closes the stream, §9.6.2).</param>
  /// <returns>The JSON-RPC response to deliver.</returns>
  Task<JsonRpcMessage> HandleRequestAsync(
    JsonRpcRequest request,
    IServerNotifier notifier,
    AuthInfo? authInfo,
    CancellationToken cancellationToken);

  /// <summary>
  /// Processes one JSON-RPC notification from the client. Notifications never receive a response
  /// (spec §3.4); an unrecognized notification is silently discarded.
  /// </summary>
  /// <param name="notification">The parsed notification.</param>
  /// <param name="cancellationToken">Cancels processing.</param>
  /// <returns>A task that completes when the notification has been handled.</returns>
  Task HandleNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken);
}

/// <summary>
/// A handler that can open long-lived <c>subscriptions/listen</c> streams (spec §10). A transport that
/// supports server-to-client streaming registers a subscription and pumps the delivered notifications
/// onto the stream until the client disconnects.
/// </summary>
public interface IMcpSubscriptionHandler
{
  /// <summary>Whether this handler can serve subscription streams.</summary>
  bool SupportsSubscriptions { get; }

  /// <summary>
  /// Registers a subscription stream (spec §10.3) and returns the filter the server agreed to honor
  /// plus a teardown handle that unregisters the subscription when the stream closes.
  /// </summary>
  /// <param name="requested">The notification kinds the client requested.</param>
  /// <param name="subscriptionId">The subscription id (the listen request id, as a string, §10.4).</param>
  /// <param name="deliver">The sink that writes a notification onto this subscription's stream.</param>
  /// <returns>The honored filter and a disposable that ends the subscription.</returns>
  (SubscriptionFilter Honored, IDisposable Teardown) OpenSubscription(
    SubscriptionFilter requested,
    string subscriptionId,
    Func<JsonRpcNotification, Task> deliver);
}
