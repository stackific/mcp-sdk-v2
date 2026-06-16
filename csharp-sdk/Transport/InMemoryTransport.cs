using System.Text.Json;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Transport;

/// <summary>
/// A client transport that bridges directly to an in-process <see cref="IMcpRequestHandler"/> (an
/// <c>McpServer</c>) with no HTTP or serialization round-trip. It mirrors the Streamable HTTP request
/// shape — each request gets its own logical response stream over which interim notifications are
/// delivered before the final response (spec §9.6) — which makes it ideal for tests and for embedding
/// a server in the same process. Frames are still offered to the wire taps.
/// </summary>
public sealed class InMemoryClientTransport : ClientTransport
{
  private readonly IMcpRequestHandler _server;
  private readonly AuthInfo? _authInfo;

  /// <summary>Creates an in-memory transport bound to <paramref name="server"/>.</summary>
  /// <param name="server">The request handler to bridge to.</param>
  /// <param name="authInfo">An optional pre-validated identity to attach to every request (§23).</param>
  public InMemoryClientTransport(IMcpRequestHandler server, AuthInfo? authInfo = null)
  {
    _server = server;
    _authInfo = authInfo;
  }

  /// <inheritdoc/>
  public override async Task<JsonRpcMessage> SendRequestAsync(JsonRpcRequest request, RequestOptions options)
  {
    TapSend(request);
    var notifier = new CallbackNotifier(notification =>
    {
      TapReceive(notification);
      options.OnNotification?.Invoke(notification);
    });

    var response = await _server
      .HandleRequestAsync(request, notifier, _authInfo, options.CancellationToken)
      .ConfigureAwait(false);

    TapReceive(response);
    return response;
  }

  /// <inheritdoc/>
  public override async Task SendNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken = default)
  {
    TapSend(notification);
    await _server.HandleNotificationAsync(notification, cancellationToken).ConfigureAwait(false);
  }

  /// <inheritdoc/>
  public override Task<SubscriptionHandle> OpenSubscriptionAsync(
    JsonRpcRequest listenRequest,
    Action<JsonRpcNotification> onNotification,
    CancellationToken cancellationToken = default)
  {
    TapSend(listenRequest);
    if (_server is not IMcpSubscriptionHandler subscriptionHandler || !subscriptionHandler.SupportsSubscriptions)
    {
      throw McpError.MethodNotFound(Protocol.McpMethods.SubscriptionsListen);
    }
    var requested = listenRequest.Params?["notifications"].Deserialize<SubscriptionFilter>(McpJson.Options) ?? new SubscriptionFilter();
    var (honored, teardown) = subscriptionHandler.OpenSubscription(requested, listenRequest.Id.ToString(), notification =>
    {
      TapReceive(notification);
      onNotification(notification);
      return Task.CompletedTask;
    });
    return Task.FromResult(new SubscriptionHandle
    {
      HonoredFilter = honored,
      Unsubscribe = () => { teardown.Dispose(); return ValueTask.CompletedTask; },
    });
  }

  /// <summary>An <see cref="IServerNotifier"/> that forwards each notification to a callback.</summary>
  private sealed class CallbackNotifier : IServerNotifier
  {
    private readonly Action<JsonRpcNotification> _onNotification;

    public CallbackNotifier(Action<JsonRpcNotification> onNotification) => _onNotification = onNotification;

    public Task NotifyAsync(JsonRpcNotification notification)
    {
      _onNotification(notification);
      return Task.CompletedTask;
    }
  }
}

/// <summary>
/// The S12 in-memory reference byte-channel transport (spec §7.1–§7.6) — a fully in-process
/// <see cref="IByteChannelTransport"/> used to demonstrate and test that the §7.2 guarantees can be met
/// by a conforming transport. The C# counterpart of the TypeScript <c>InMemoryTransport</c> in
/// <c>transport/in-memory.ts</c>.
/// </summary>
/// <remarks>
/// <para>
/// This is itself a <em>custom</em> transport in the §7.3 sense: it preserves the JSON-RPC message
/// format, the exchange patterns, and the per-request metadata model, and upholds every §7.2 guarantee —
/// but it is NOT one of the two transports the specification defines (stdio is S13; Streamable HTTP is
/// S14/S15). It is distinct from <see cref="InMemoryClientTransport"/>, which is a convenience RPC bridge
/// to an in-process handler rather than an observable byte channel.
/// </para>
/// <para>
/// To make the framing, UTF-8, and integrity guarantees real rather than assumed, the pair carries
/// <em>bytes</em>: each <see cref="Send"/> frames the message with <see cref="NewlineFramer"/> and the
/// peer recovers it with the same framing plus <see cref="MessageUnit.TryDecode"/> (UTF-8 +
/// single-JSON-value validation). Delivery is synchronous for test determinism.
/// </para>
/// <para>
/// <b>Cancellation (§7.3).</b> A custom byte-channel transport carries NO per-request cancellation token
/// at the channel layer — the channel frames opaque messages and is unaware of request/response
/// correlation. Cancellation is therefore <em>connection-scoped</em>: closing the channel
/// (<see cref="Disconnect"/>) aborts all outstanding work in one shot, and each side observes the
/// teardown through its <see cref="OnClose"/> subscription (after which <see cref="Send"/> throws a
/// <see cref="TransportError"/>). Per-request cancellation of a single in-flight request — without
/// tearing down the connection — is expressed at the protocol layer instead, via a
/// <c>notifications/cancelled</c> message referencing the request id (§15.2), which a server host
/// (for example <see cref="Stackific.Mcp.Server.StdioServerHost"/>) honors by aborting that request and
/// suppressing its response (§8.3 R-8.3-g).
/// </para>
/// </remarks>
public sealed class InMemoryByteChannelTransport : IByteChannelTransport
{
  private InMemoryByteChannelTransport? _peer;
  private readonly NewlineFramer _framer = new();
  private readonly IFrameDecoder _decoder;
  private readonly List<Action<JsonRpcMessage>> _messageHandlers = new();
  private readonly List<Action<TransportError>> _errorHandlers = new();
  private readonly List<Action<TransportCloseInfo>> _closeHandlers = new();
  private readonly List<JsonRpcMessage> _inbox = new();
  private readonly List<TransportError> _errorInbox = new();
  private readonly object _gate = new();
  private bool _closed;
  private TransportCloseInfo? _closeInfo;

  private InMemoryByteChannelTransport() => _decoder = _framer.CreateDecoder();

  /// <summary>
  /// Creates a linked pair of in-memory byte-channel transports. Anything one endpoint sends is delivered
  /// to the other; closing or disconnecting either endpoint makes both observe the close (spec §7.1,
  /// §7.4, §7.2 clean close, §7.5). Mirrors TypeScript <c>createInMemoryTransportPair</c>.
  /// </summary>
  /// <returns>The two linked endpoints.</returns>
  public static (InMemoryByteChannelTransport A, InMemoryByteChannelTransport B) CreatePair()
  {
    var a = new InMemoryByteChannelTransport();
    var b = new InMemoryByteChannelTransport();
    a._peer = b;
    b._peer = a;
    return (a, b);
  }

  /// <inheritdoc/>
  public void Send(JsonRpcMessage message)
  {
    ArgumentNullException.ThrowIfNull(message);
    if (Closed)
    {
      // Never silently drop: a send on a closed channel is an observable failure (R-7.2-q, R-7.2-s,
      // R-7.5-i, R-7.5-j).
      throw new TransportError("cannot send on a closed transport");
    }
    if (_peer is null)
    {
      throw new TransportError("transport endpoint is not linked to a peer");
    }
    // Frame + UTF-8 encode, then hand the raw bytes to the peer. The peer finds message boundaries from
    // framing alone and re-parses each as one JSON value (R-7.1-b, R-7.1-c, R-7.2-b – R-7.2-d, R-7.6-a,
    // R-7.6-b).
    _peer.AcceptBytes(_framer.Encode(message));
  }

  /// <summary>Receives raw bytes from the peer's <see cref="Send"/>.</summary>
  /// <param name="bytes">The framed bytes delivered by the peer.</param>
  private void AcceptBytes(ReadOnlySpan<byte> bytes)
  {
    if (Closed)
    {
      // The receiver is closed; surface the failure to the sending peer rather than discarding the bytes
      // (R-7.2-r, R-7.5-j).
      throw new TransportError("peer transport is closed; message not delivered");
    }
    foreach (var unit in _decoder.Push(bytes))
    {
      // A malformed inbound unit is the receiver's error: route it to this endpoint's error channel as an
      // observable failure (R-7.6-b, R-7.6-c), never back into the sender's Send and never silently
      // dropped. A well-formed unit is dispatched as a message.
      if (MessageUnit.TryDecode(unit, out var message, out var error))
      {
        Dispatch(message!);
      }
      else
      {
        DispatchError(error!);
      }
    }
  }

  /// <summary>
  /// Feeds arbitrary raw bytes into this endpoint's receive path, as if they had arrived on the wire.
  /// Used to exercise receiver-side decode-error handling (for example a corrupt or non-UTF-8 unit). Not
  /// part of the <see cref="IByteChannelTransport"/> contract — a test/simulation affordance. Mirrors
  /// TypeScript <c>InMemoryTransport.injectRawBytes</c>.
  /// </summary>
  /// <param name="bytes">The raw bytes to inject.</param>
  public void InjectRawBytes(ReadOnlySpan<byte> bytes) => AcceptBytes(bytes);

  private void Dispatch(JsonRpcMessage message)
  {
    Action<JsonRpcMessage>[] handlers;
    lock (_gate)
    {
      if (_messageHandlers.Count == 0)
      {
        _inbox.Add(message);
        return;
      }
      handlers = _messageHandlers.ToArray();
    }
    foreach (var handler in handlers) handler(message);
  }

  private void DispatchError(TransportError error)
  {
    Action<TransportError>[] handlers;
    lock (_gate)
    {
      if (_errorHandlers.Count == 0)
      {
        _errorInbox.Add(error); // buffered until a handler attaches — never dropped
        return;
      }
      handlers = _errorHandlers.ToArray();
    }
    foreach (var handler in handlers) handler(error);
  }

  /// <inheritdoc/>
  public IDisposable OnMessage(Action<JsonRpcMessage> handler)
  {
    ArgumentNullException.ThrowIfNull(handler);
    JsonRpcMessage[] buffered;
    lock (_gate)
    {
      _messageHandlers.Add(handler);
      buffered = _inbox.ToArray();
      _inbox.Clear();
    }
    foreach (var message in buffered) handler(message);
    return new Unsubscriber(() => { lock (_gate) _messageHandlers.Remove(handler); });
  }

  /// <inheritdoc/>
  public IDisposable OnError(Action<TransportError> handler)
  {
    ArgumentNullException.ThrowIfNull(handler);
    TransportError[] buffered;
    lock (_gate)
    {
      _errorHandlers.Add(handler);
      buffered = _errorInbox.ToArray();
      _errorInbox.Clear();
    }
    foreach (var error in buffered) handler(error);
    return new Unsubscriber(() => { lock (_gate) _errorHandlers.Remove(handler); });
  }

  /// <inheritdoc/>
  public IDisposable OnClose(Action<TransportCloseInfo> handler)
  {
    ArgumentNullException.ThrowIfNull(handler);
    TransportCloseInfo? observeNow = null;
    lock (_gate)
    {
      if (_closed && _closeInfo is { } info)
      {
        observeNow = info;
      }
      else
      {
        _closeHandlers.Add(handler);
      }
    }
    if (observeNow is { } closeInfo) handler(closeInfo);
    return new Unsubscriber(() => { lock (_gate) _closeHandlers.Remove(handler); });
  }

  /// <inheritdoc/>
  public Task CloseAsync(string? reason = null)
  {
    Shutdown(clean: true, reason);
    return Task.CompletedTask;
  }

  /// <summary>
  /// Simulates an abrupt disconnection (channel dropped without an orderly close). Both endpoints observe
  /// it via <see cref="OnClose"/> with <c>Clean: false</c>, so neither side blocks as though the channel
  /// were still live (spec §7.5; R-7.5-a, R-7.5-b). Not part of the contract — a test/simulation
  /// affordance. Mirrors TypeScript <c>InMemoryTransport.disconnect</c>.
  /// </summary>
  /// <param name="reason">An optional reason recorded on the close info.</param>
  public void Disconnect(string? reason = null) => Shutdown(clean: false, reason);

  /// <inheritdoc/>
  public bool Closed
  {
    get { lock (_gate) return _closed; }
  }

  private void Shutdown(bool clean, string? reason)
  {
    var info = new TransportCloseInfo(clean, reason);
    // Close both ends so each side can observe the channel is unusable.
    MarkClosed(info);
    _peer?.MarkClosed(info);
  }

  private void MarkClosed(TransportCloseInfo info)
  {
    Action<TransportCloseInfo>[] handlers;
    lock (_gate)
    {
      if (_closed) return;
      _closed = true;
      _closeInfo = info;
      handlers = _closeHandlers.ToArray();
      _closeHandlers.Clear();
    }
    foreach (var handler in handlers) handler(info);
  }

  /// <summary>An <see cref="IDisposable"/> that runs an unsubscribe action exactly once on disposal.</summary>
  private sealed class Unsubscriber(Action unsubscribe) : IDisposable
  {
    private Action? _unsubscribe = unsubscribe;

    public void Dispose()
    {
      var action = Interlocked.Exchange(ref _unsubscribe, null);
      action?.Invoke();
    }
  }
}
