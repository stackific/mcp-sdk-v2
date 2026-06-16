using System.Collections.Concurrent;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Server;

/// <summary>
/// Serves an <see cref="McpServer"/> over a byte-channel transport — the stdio transport in practice
/// (spec §8). It reads inbound client requests/notifications from the transport, dispatches each through
/// <see cref="McpServer.HandleRequestAsync"/>, and writes the responses and request-scoped notifications
/// back over the same channel.
/// </summary>
/// <remarks>
/// <para>
/// Statelessness (§7.6): there is no session. Each request is self-contained and dispatched on its own.
/// </para>
/// <para>
/// <b>No server→client request channel (§8.3 / §9.6.2 R-9.6.2-d).</b> A server MUST NOT write a JSON-RPC
/// <em>request</em> to its output stream. The host therefore never issues server-initiated requests; the
/// supported mechanism for soliciting client input is the §11 <c>input_required</c> retry loop (via
/// <see cref="ToolContext.ElicitInputAsync"/> / <see cref="ToolContext.CreateMessageAsync"/> /
/// <see cref="ToolContext.ListRootsAsync"/>). An inbound JSON-RPC response is therefore unsolicited and
/// ignored (§7.4). A <c>notifications/cancelled</c> aborts the matching in-flight request and suppresses
/// its response (§8.3 R-8.3-g).
/// </para>
/// </remarks>
public sealed class StdioServerHost : IDisposable
{
  private readonly IByteChannelTransport _transport;
  private readonly IMcpRequestHandler _server;
  private readonly AuthInfo? _authInfo;
  private readonly RequestCorrelator _correlator = new();
  // §8.3 (R-8.3-g) / §15.2: each in-flight request's cancellation source, keyed by its JSON-RPC id, so an
  // inbound notifications/cancelled can abort the running handler AND suppress its (now-cancelled) response.
  private readonly ConcurrentDictionary<RequestId, CancellationTokenSource> _inflight = new();
  private readonly IDisposable _messageSubscription;
  private readonly IDisposable _closeSubscription;
  private bool _disposed;

  private StdioServerHost(IByteChannelTransport transport, IMcpRequestHandler server, AuthInfo? authInfo)
  {
    _transport = transport;
    _server = server;
    _authInfo = authInfo;
    _messageSubscription = transport.OnMessage(OnInboundMessage);
    // On disconnection, fail every outstanding server→client request so no handler awaits forever (§7.5).
    _closeSubscription = transport.OnClose(_ =>
      _correlator.FailAll(new TransportError("The stdio channel closed before a server→client request was answered.")));
  }

  /// <summary>
  /// Begins serving <paramref name="server"/> over <paramref name="transport"/>: subscribes to inbound
  /// messages and dispatches them until the host is disposed or the transport closes. Returns a running
  /// host whose disposal stops handling further inbound messages (the idiomatic C# analogue of the
  /// TypeScript <c>serveStdio</c> unsubscribe function).
  /// </summary>
  /// <param name="server">The server runtime to serve.</param>
  /// <param name="transport">The byte-channel transport (typically a <see cref="StdioServerTransport"/>).</param>
  /// <param name="authInfo">An optional pre-validated identity attached to every dispatched request (§23).</param>
  /// <returns>The running host.</returns>
  public static StdioServerHost Serve(IMcpRequestHandler server, IByteChannelTransport transport, AuthInfo? authInfo = null)
  {
    ArgumentNullException.ThrowIfNull(server);
    ArgumentNullException.ThrowIfNull(transport);
    return new StdioServerHost(transport, server, authInfo);
  }

  private void OnInboundMessage(JsonRpcMessage message)
  {
    switch (message)
    {
      case JsonRpcSuccessResponse or JsonRpcErrorResponse:
        // §7.4 / §9.6.2 (R-9.6.2-d): the server issues no server→client requests, so any inbound response
        // is unsolicited. Deliver() finds no outstanding request and silently ignores it (a server never
        // responds to a response).
        _correlator.Deliver(message);
        return;

      case JsonRpcNotification notification:
        // §8.3 (R-8.3-g) / §15.2.2: a notifications/cancelled aborts the matching in-flight request — the
        // handler observes its token and the host suppresses any further frame for that id (see DispatchAsync).
        if (notification.Method == McpMethods.NotificationsCancelled
          && Cancellation.ReadCancelledRequestId(notification.Params) is { } cancelId
          && _inflight.TryGetValue(cancelId, out var cancelSource))
        {
          // The handler may complete and dispose its source concurrently on another thread; tolerate it.
          try { cancelSource.Cancel(); }
          catch (ObjectDisposedException) { }
        }
        // Notifications carry no response in the stateless model; forward for completeness, ignoring the result.
        _ = _server.HandleNotificationAsync(notification, CancellationToken.None);
        return;

      case JsonRpcRequest request:
        // Dispatch on the thread pool so a slow handler (especially one awaiting a live server→client
        // reply) never blocks the transport's inbound pump.
        _ = DispatchAsync(request);
        return;
    }
  }

  private async Task DispatchAsync(JsonRpcRequest request)
  {
    var notifier = new StdioNotifier(this);
    using var cts = new CancellationTokenSource();
    _inflight[request.Id] = cts;
    JsonRpcMessage response;
    try
    {
      response = await _server.HandleRequestAsync(request, notifier, _authInfo, cts.Token).ConfigureAwait(false);
    }
    catch (McpError error)
    {
      response = new JsonRpcErrorResponse(request.Id, error.ToJsonRpcError());
    }
    catch (Exception error)
    {
      response = new JsonRpcErrorResponse(request.Id, McpError.InternalError(error.Message).ToJsonRpcError());
    }
    finally
    {
      _inflight.TryRemove(request.Id, out _);
    }

    // §8.3 (R-8.3-g, MUST NOT): once this request has been cancelled, the server emits NO further message
    // for its id — neither the result nor a cancellation error response. A request that completed before
    // any cancellation sends its response normally.
    if (!cts.IsCancellationRequested)
    {
      TrySend(response);
    }
  }

  /// <summary>Writes a message to the transport, swallowing a transport-level failure (a closed channel).</summary>
  /// <param name="message">The message to send.</param>
  /// <returns><c>true</c> when the send succeeded.</returns>
  private bool TrySend(JsonRpcMessage message)
  {
    try
    {
      _transport.Send(message);
      return true;
    }
    catch (TransportError)
    {
      // The channel is closed or rejects this frame's role; nothing further can be written.
      return false;
    }
  }

  /// <inheritdoc/>
  public void Dispose()
  {
    if (_disposed) return;
    _disposed = true;
    _messageSubscription.Dispose();
    _closeSubscription.Dispose();
    _correlator.FailAll(new TransportError("The stdio server host was disposed."));
  }

  /// <summary>
  /// The notifier handed to each dispatched request: request-scoped notifications ride the host's
  /// transport. There is no server→client request channel (§9.6.2 R-9.6.2-d / §8.3); a server reaches
  /// the client only via the §11 <c>input_required</c> retry loop.
  /// </summary>
  private sealed class StdioNotifier(StdioServerHost host) : IServerNotifier
  {
    public Task NotifyAsync(JsonRpcNotification notification)
    {
      host.TrySend(notification);
      return Task.CompletedTask;
    }
  }
}
