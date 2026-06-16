using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Server;

/// <summary>
/// Serves an <see cref="McpServer"/> over a byte-channel transport — the stdio transport in practice
/// (spec §8). It reads inbound client requests/notifications from the transport, dispatches each through
/// <see cref="McpServer.HandleRequestAsync"/>, and writes the responses and request-scoped notifications
/// back over the same channel. Interim notifications and LIVE server→client requests
/// (<c>elicitation/create</c> / <c>sampling/createMessage</c> / <c>roots/list</c>) ride the same channel,
/// correlated to the client's reply purely by JSON-RPC id via a <see cref="RequestCorrelator"/>. The C#
/// counterpart of the TypeScript <c>serveStdio</c>.
/// </summary>
/// <remarks>
/// <para>
/// Statelessness (§7.6): there is no session. Each request is self-contained and dispatched on its own;
/// the only cross-message state is the id-correlation of a server→client request to its reply (§7.2).
/// </para>
/// <para>
/// <b>Live server→client requests over stdio.</b> The host writes a server→client request as a JSON-RPC
/// <em>request</em> frame through <see cref="IByteChannelTransport.Send"/>. A strict stdio
/// <c>StdioServerTransport</c> enforces the §8.3 stream-role rule (a server MUST NOT write a request to
/// stdout, R-8.3-b) and so REJECTS that frame with a <see cref="TransportError"/>; the awaiting handler
/// then observes the failure. This matches the TypeScript <c>serveStdio</c>, where the equivalent
/// <c>transport.send</c> is likewise role-checked. Over such a transport the supported mechanism for
/// soliciting client input is the §11 <c>input_required</c> retry loop (via
/// <see cref="ToolContext.ElicitInputAsync"/> etc.), NOT the live request. A transport whose send-role
/// permits server→client requests (for example a bidirectional in-memory byte channel) carries the live
/// request end to end.
/// </para>
/// </remarks>
public sealed class StdioServerHost : IDisposable
{
  private readonly IByteChannelTransport _transport;
  private readonly IMcpRequestHandler _server;
  private readonly AuthInfo? _authInfo;
  private readonly RequestCorrelator _correlator = new();
  private readonly IDisposable _messageSubscription;
  private readonly IDisposable _closeSubscription;
  private long _serverRequestSeq;
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
        // A client reply to a live server→client request — correlate it by id. An uncorrelated response
        // (no matching outstanding request) is silently ignored, never answered (§7.4: a server does not
        // respond to a response).
        _correlator.Deliver(message);
        return;

      case JsonRpcNotification:
        // Notifications carry no response in the stateless model; cancellation is threaded by the
        // dispatcher via the per-request token. Forward for completeness, ignoring the result.
        _ = _server.HandleNotificationAsync((JsonRpcNotification)message, CancellationToken.None);
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
    JsonRpcMessage response;
    try
    {
      response = await _server.HandleRequestAsync(request, notifier, _authInfo, CancellationToken.None).ConfigureAwait(false);
    }
    catch (McpError error)
    {
      response = new JsonRpcErrorResponse(request.Id, error.ToJsonRpcError());
    }
    catch (Exception error)
    {
      response = new JsonRpcErrorResponse(request.Id, McpError.InternalError(error.Message).ToJsonRpcError());
    }
    TrySend(response);
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

  /// <summary>
  /// Issues a live server→client request: mints a unique id (the <c>srv-N</c> scheme), writes the request
  /// frame, and returns the task that resolves with the client's correlated reply. A send failure (a
  /// role-enforcing stdio server transport, or a closed channel) fails the awaiting task immediately so
  /// the handler does not hang.
  /// </summary>
  private Task<JsonRpcMessage> IssueServerRequestAsync(string method, JsonObject? parameters)
  {
    var id = new RequestId($"srv-{Interlocked.Increment(ref _serverRequestSeq)}");
    var reply = _correlator.Issue(id);
    if (!TrySend(new JsonRpcRequest(id, method, parameters)))
    {
      _correlator.Fail(id, new TransportError(
        "The transport rejected a server→client request frame; over a strict stdio server transport use the §11 input_required loop instead."));
    }
    return reply;
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
  /// The notifier handed to each dispatched request: notifications and live server→client requests both
  /// ride the host's transport, the latter correlated to the client's reply by id.
  /// </summary>
  private sealed class StdioNotifier(StdioServerHost host) : IServerNotifier
  {
    public Task NotifyAsync(JsonRpcNotification notification)
    {
      host.TrySend(notification);
      return Task.CompletedTask;
    }

    public Task<JsonRpcMessage> RequestAsync(string method, JsonObject? parameters, CancellationToken cancellationToken) =>
      host.IssueServerRequestAsync(method, parameters).WaitAsync(cancellationToken);
  }
}
