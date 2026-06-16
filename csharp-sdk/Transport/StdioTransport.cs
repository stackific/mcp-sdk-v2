using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Transport;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S13 — The stdio transport (§8).
//
// A concrete byte-channel transport binding that carries the MCP JsonRpcMessage union over the
// standard streams of a client-launched subprocess: client→server on the child's stdin, server→client
// on the child's stdout, with free-form diagnostics on stderr that are NEVER parsed as protocol
// (R-8.1-a, R-8.4-*).
//
// The binding adds only framing and process-lifecycle rules; the protocol semantics are unchanged and
// ride on the reused mechanisms:
//   • NewlineFramer / IFrameDecoder — newline-delimited JSON, one message per UTF-8 line, no embedded
//     newlines (R-8.2-a – R-8.2-h).
//   • MessageUnit.TryDecode — UTF-8 + single-JSON-value + JSON-RPC validation; a malformed line is
//     discarded, never fatal, and reading resynchronizes at the next newline (R-8.5-d – R-8.5-h).
//   • RequestCorrelator — id-correlation/multiplexing and the fail-in-flight-on-disconnect behavior
//     reused for restart/retry (R-8.6.4-b).
//   • TransportContract.IsDirectionPermitted — enforces that the client writes only
//     requests/notifications to stdin and the server writes only responses/notifications to stdout
//     (R-8.3-a, R-8.3-b, R-8.5-a, R-8.5-c).
//
// Testability: the subprocess I/O is injected through <see cref="IChildProcess"/>; tests drive both
// ends with in-memory <see cref="PushByteSource"/> pipes rather than spawning a real OS process. A real
// <see cref="System.Diagnostics.Process"/> adapter (<see cref="ProcessChild"/>) is provided separately
// so the core logic never depends on a particular launch mechanism.
//
// The C# counterpart of the TypeScript <c>transport/stdio.ts</c> module.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/// <summary>
/// A push-based source of inbound bytes — the C# analogue of a Node <c>Readable</c> stream's
/// <c>'data'</c>/<c>'end'</c> events (spec §8 topology). A real process adapter raises
/// <see cref="DataReceived"/> for each chunk read from a child stream and <see cref="Ended"/> when the
/// stream reaches EOF; an in-memory test pipe raises the same events synchronously.
/// </summary>
public interface IByteSource
{
  /// <summary>Raised for each chunk of bytes that arrives on this source.</summary>
  event Action<ReadOnlyMemory<byte>>? DataReceived;

  /// <summary>Raised once when the source reaches end-of-stream (EOF / closed).</summary>
  event Action? Ended;
}

/// <summary>
/// A sink for outbound bytes — the C# analogue of a Node <c>Writable</c> stream (spec §8 topology). The
/// client writes framed requests/notifications to the child's stdin sink; the server writes framed
/// responses/notifications to its stdout sink. <see cref="End"/> closes the sink (EOF), the portable
/// graceful-shutdown signal (R-8.6.2-a step 1).
/// </summary>
public interface IByteSink
{
  /// <summary>Writes a framed byte unit to the sink.</summary>
  /// <param name="bytes">The framed bytes to write.</param>
  void Write(ReadOnlySpan<byte> bytes);

  /// <summary>Closes the sink, signalling EOF to the peer.</summary>
  void End();
}

/// <summary>
/// The minimal view of a child process the stdio transport needs (spec §8 topology). Modeled so the
/// three streams can be in-memory pipes in tests (no real OS process), while a real
/// <see cref="System.Diagnostics.Process"/> is adapted to the same shape by <see cref="ProcessChild"/>.
/// The C# counterpart of the TypeScript <c>ChildProcessLike</c>.
/// </summary>
public interface IChildProcess
{
  /// <summary>Client→server byte sink. Closing it (<see cref="IByteSink.End"/>) signals graceful shutdown (EOF).</summary>
  IByteSink? Stdin { get; }

  /// <summary>Server→client byte source carrying newline-framed JSON-RPC messages.</summary>
  IByteSource? Stdout { get; }

  /// <summary>Optional free-form UTF-8 diagnostics; NEVER parsed as protocol (R-8.1-a).</summary>
  IByteSource? Stderr { get; }

  /// <summary>The process exit code once exited, else <c>null</c>.</summary>
  int? ExitCode { get; }

  /// <summary>
  /// Forcibly signals the process (R-8.6.3-a). On a real child this maps to a graceful
  /// terminate (<see cref="KillSignal.Terminate"/>, POSIX SIGTERM) or a forced kill
  /// (<see cref="KillSignal.Force"/>, POSIX SIGKILL); in tests it is observed to assert escalation.
  /// </summary>
  /// <param name="signal">The signal to deliver.</param>
  void Kill(KillSignal signal);

  /// <summary>Raised once when the process exits, carrying its exit code (or <c>null</c> if killed by a signal).</summary>
  event Action<int?>? Exited;
}

/// <summary>The two OS-appropriate termination escalation levels (spec §8.6.3; R-8.6.3-a).</summary>
public enum KillSignal
{
  /// <summary>A graceful terminate request — POSIX <c>SIGTERM</c>; the process may clean up and exit.</summary>
  Terminate,

  /// <summary>A forced, immediate kill — POSIX <c>SIGKILL</c>; the process cannot intercept it.</summary>
  Force,
}

/// <summary>A factory that (re)launches a fresh child process — used for restart (spec §8.6.4; R-8.6.4-a).</summary>
/// <returns>A freshly launched child process.</returns>
public delegate IChildProcess ChildProcessLauncher();

/// <summary>
/// An in-memory, push-based <see cref="IByteSource"/> + <see cref="IByteSink"/> pipe used to drive the
/// stdio transport in tests without spawning a real OS process. Writing bytes synchronously raises
/// <see cref="DataReceived"/>; <see cref="End"/> raises <see cref="Ended"/> exactly once.
/// </summary>
public sealed class PushByteSource : IByteSource, IByteSink
{
  private bool _ended;

  /// <inheritdoc/>
  public event Action<ReadOnlyMemory<byte>>? DataReceived;

  /// <inheritdoc/>
  public event Action? Ended;

  /// <summary>Pushes a chunk of bytes, raising <see cref="DataReceived"/> for any subscriber.</summary>
  /// <param name="bytes">The bytes to deliver.</param>
  public void Write(ReadOnlySpan<byte> bytes)
  {
    if (_ended) return;
    // Copy out of the span so the chunk survives beyond the synchronous call.
    DataReceived?.Invoke(bytes.ToArray());
  }

  /// <inheritdoc/>
  public void End()
  {
    if (_ended) return;
    _ended = true;
    Ended?.Invoke();
  }
}

/// <summary>
/// Common stdio plumbing for both endpoints: newline framing over a byte sink, a stateful decoder over a
/// byte source, malformed-line tolerance, and the observable message/error/close surface of
/// <see cref="IByteChannelTransport"/>. Subclasses supply the concrete subprocess lifecycle. The C#
/// counterpart of the TypeScript <c>StdioEndpoint</c> abstract base.
/// </summary>
public abstract class StdioEndpoint : IByteChannelTransport
{
  private readonly NewlineFramer _framer = new();
  private IFrameDecoder _decoder;
  private readonly List<Action<JsonRpcMessage>> _messageHandlers = new();
  private readonly List<Action<TransportError>> _errorHandlers = new();
  private readonly List<Action<TransportCloseInfo>> _closeHandlers = new();
  private readonly List<JsonRpcMessage> _inbox = new();
  private readonly List<TransportError> _errorInbox = new();
  private readonly object _gate = new();
  private bool _closed;
  private TransportCloseInfo? _closeInfo;

  private readonly MessageDirection _sendDirection;

  /// <summary>The byte sink this endpoint writes framed messages to (may be reassigned on restart).</summary>
  protected IByteSink? Outbound;

  /// <summary>The byte source this endpoint reads framed messages from (may be reassigned on restart).</summary>
  protected IByteSource? Inbound;

  /// <summary>The carriage-return byte (<c>\r</c>, U+000D).</summary>
  private const byte CarriageReturnByte = 0x0d;

  /// <summary>Initializes the shared plumbing and wires the initial inbound source.</summary>
  /// <param name="sendDirection">The direction messages this endpoint sends may travel (for role checks).</param>
  /// <param name="outbound">The byte sink this endpoint writes framed messages to.</param>
  /// <param name="inbound">The byte source this endpoint reads framed messages from.</param>
  protected StdioEndpoint(MessageDirection sendDirection, IByteSink? outbound, IByteSource? inbound)
  {
    _sendDirection = sendDirection;
    _decoder = _framer.CreateDecoder();
    Outbound = outbound;
    Inbound = inbound;
    WireInbound(inbound);
  }

  /// <summary>Attaches the framing decoder to a byte source.</summary>
  /// <param name="source">The source to subscribe to, or <c>null</c> to do nothing.</param>
  protected void WireInbound(IByteSource? source)
  {
    if (source is null) return;
    source.DataReceived += OnInboundData;
  }

  /// <summary>Detaches the framing decoder from a byte source (used on restart).</summary>
  /// <param name="source">The source to unsubscribe from, or <c>null</c> to do nothing.</param>
  protected void UnwireInbound(IByteSource? source)
  {
    if (source is null) return;
    source.DataReceived -= OnInboundData;
  }

  /// <summary>Replaces the framing decoder with a fresh one (no carry-over of partial bytes), used on restart.</summary>
  protected void ResetDecoder() => _decoder = _framer.CreateDecoder();

  private void OnInboundData(ReadOnlyMemory<byte> chunk) => AcceptBytes(chunk.Span);

  /// <inheritdoc/>
  public void Send(JsonRpcMessage message)
  {
    ArgumentNullException.ThrowIfNull(message);
    if (Closed)
    {
      // Never silently drop: a send on a closed channel is an observable failure (R-7.2-q, R-7.2-s).
      throw new TransportError("cannot send on a closed stdio transport");
    }
    // Enforce the stream-role direction before anything touches the wire (R-8.3-a, R-8.3-b, R-8.5-a,
    // R-8.5-c).
    AssertWritableDirection(message, _sendDirection);
    if (Outbound is null)
    {
      throw new TransportError("stdio transport has no writable channel");
    }
    // One compact UTF-8 JSON line terminated by a single \n, no embedded newlines (the serializer
    // escapes any in-string \n). (R-8.2-a – R-8.2-d)
    Outbound.Write(_framer.Encode(message));
  }

  /// <summary>
  /// Asserts that <paramref name="message"/> may be written in <paramref name="direction"/> on this
  /// header-less wire, throwing a <see cref="TransportError"/> otherwise (spec §8.3, §8.5; R-8.3-a,
  /// R-8.3-b, R-8.5-a, R-8.5-c).
  /// </summary>
  /// <param name="message">The classified message about to be written.</param>
  /// <param name="direction">The direction this endpoint sends in.</param>
  private static void AssertWritableDirection(JsonRpcMessage message, MessageDirection direction)
  {
    var kind = TransportContract.KindOf(message);
    if (!TransportContract.IsDirectionPermitted(kind, direction))
    {
      var channel = direction == MessageDirection.ClientToServer ? "stdin" : "stdout";
      throw new TransportError(
        $"a {kind} may not be written to {channel} ({direction}); only valid MCP messages of a permitted kind may be sent on this channel");
    }
  }

  /// <summary>
  /// Feeds received bytes into the framing decoder and dispatches each recovered line (spec §8.5). A
  /// malformed line is discarded as a transport-level error (surfaced via <see cref="OnError"/>) and
  /// reading continues at the next newline — the connection is never torn down (R-8.5-d, R-8.5-e,
  /// R-8.5-h).
  /// </summary>
  /// <param name="chunk">The newly received bytes.</param>
  protected void AcceptBytes(ReadOnlySpan<byte> chunk)
  {
    foreach (var unit in _decoder.Push(chunk))
    {
      // An empty or whitespace-only line is not a message: ignore it rather than treating it as
      // malformed (R-8.2-h).
      if (IsBlankLine(unit)) continue;
      // A receiver SHOULD tolerate a preceding \r (a \r\n terminator) and strip it before parsing
      // (R-8.2-f, R-8.2-g).
      var line = StripTrailingCarriageReturn(unit);
      if (MessageUnit.TryDecode(line, out var message, out var error))
      {
        Dispatch(message!);
      }
      else
      {
        // Malformed line: discard, surface a diagnostic, keep reading (R-8.5-d, R-8.5-e, R-8.5-f,
        // R-8.5-h).
        DispatchError(error!);
      }
    }
  }

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
        _errorInbox.Add(error);
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
    // Flush anything that arrived before a handler existed — no silent loss.
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
    // Flush any decode errors that arrived before a handler existed — no silent loss.
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
    // A late subscriber to an already-closed channel still observes the close exactly once.
    if (observeNow is { } closeInfo) handler(closeInfo);
    return new Unsubscriber(() => { lock (_gate) _closeHandlers.Remove(handler); });
  }

  /// <inheritdoc/>
  public bool Closed
  {
    get { lock (_gate) return _closed; }
  }

  /// <summary>Marks the endpoint closed and notifies <see cref="OnClose"/> subscribers exactly once.</summary>
  /// <param name="info">The close information to record and broadcast.</param>
  protected void MarkClosed(TransportCloseInfo info)
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

  /// <inheritdoc/>
  public abstract Task CloseAsync(string? reason = null);

  /// <summary>
  /// Returns <c>true</c> when a framed line is empty or only ASCII whitespace — such a line is not a
  /// JSON-RPC message and is ignored, not treated as malformed (spec §8.2; R-8.2-h).
  /// </summary>
  /// <param name="line">The framed line bytes (delimiter already removed).</param>
  /// <returns><c>true</c> when the line carries no content.</returns>
  private static bool IsBlankLine(ReadOnlySpan<byte> line)
  {
    foreach (var b in line)
    {
      // Space, tab, CR, vertical tab, form-feed — any other byte means the line carries content.
      if (b != 0x20 && b != 0x09 && b != 0x0d && b != 0x0b && b != 0x0c)
      {
        return false;
      }
    }
    return true;
  }

  /// <summary>
  /// Strips a single trailing carriage return so a <c>\r\n</c> terminator decodes the same as <c>\n</c>
  /// (spec §8.2; R-8.2-f, R-8.2-g).
  /// </summary>
  /// <param name="line">The framed line bytes.</param>
  /// <returns>The line with one trailing <c>\r</c> removed, if present.</returns>
  private static byte[] StripTrailingCarriageReturn(byte[] line) =>
    line.Length > 0 && line[^1] == CarriageReturnByte ? line[..^1] : line;

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

/// <summary>Options for <see cref="StdioServerTransport"/>.</summary>
public sealed class StdioServerTransportOptions
{
  /// <summary>Byte source for client→server messages (the server's stdin).</summary>
  public IByteSource? Stdin { get; init; }

  /// <summary>Byte sink for server→client messages (the server's stdout).</summary>
  public IByteSink? Stdout { get; init; }
}

/// <summary>
/// The server side of a stdio connection: reads client requests/notifications from stdin and writes
/// responses/notifications to stdout (spec §8 server role). The C# counterpart of the TypeScript
/// <c>StdioServerTransport</c>.
/// </summary>
/// <remarks>
/// Enforces the server stream-role rule — it MUST NOT write a JSON-RPC request to stdout and MUST NOT
/// write non-MCP content there; diagnostics belong on stderr (R-8.3-b, R-8.5-a, R-8.5-b). Graceful
/// shutdown is observed when stdin reaches EOF, at which point the server SHOULD exit promptly
/// (R-8.6.2-b); the server MAY also initiate shutdown by closing stdout (R-8.6.2-c) via
/// <see cref="CloseAsync"/>.
/// </remarks>
public sealed class StdioServerTransport : StdioEndpoint
{
  /// <summary>Creates a server-side stdio endpoint over the supplied (or default in-process) streams.</summary>
  /// <param name="options">The stdin source and stdout sink; either may be <c>null</c>.</param>
  public StdioServerTransport(StdioServerTransportOptions? options = null)
    : base(MessageDirection.ServerToClient, options?.Stdout, options?.Stdin)
  {
    // The server SHOULD exit promptly when stdin closes / returns EOF. Surface that as an observable
    // clean close so the host can exit (R-8.6.2-b).
    if (Inbound is not null)
    {
      Inbound.Ended += () => MarkClosed(new TransportCloseInfo(true, "stdin EOF"));
    }
  }

  /// <summary>
  /// Server-initiated shutdown: closes stdout to the client and marks the endpoint closed, after which
  /// the host process exits (spec §8.6.2-c).
  /// </summary>
  /// <param name="reason">An optional reason recorded on the close info.</param>
  /// <returns>A completed task.</returns>
  public override Task CloseAsync(string? reason = null)
  {
    if (Closed) return Task.CompletedTask;
    Outbound?.End();
    MarkClosed(new TransportCloseInfo(true, reason ?? "server closed stdout"));
    return Task.CompletedTask;
  }
}

/// <summary>Options for <see cref="StdioClientTransport"/>.</summary>
public sealed class StdioClientTransportOptions
{
  /// <summary>The already-launched child process, or use <see cref="Launcher"/> for restart support.</summary>
  public IChildProcess? Child { get; init; }

  /// <summary>
  /// A factory that launches a fresh child. REQUIRED to enable restart-on-unexpected-exit (R-8.6.4-a);
  /// when provided and <see cref="Child"/> is omitted, the first child is launched immediately.
  /// </summary>
  public ChildProcessLauncher? Launcher { get; init; }

  /// <summary>
  /// Milliseconds to wait for the child to exit after stdin is closed before forcibly terminating it
  /// (spec §8.6.2-a step 3, §8.6.3-a). Defaults to 5000.
  /// </summary>
  public int ShutdownGraceMs { get; init; } = 5000;

  /// <summary>
  /// When <c>true</c>, an unexpected child exit triggers an automatic restart via <see cref="Launcher"/>
  /// (spec §8.6.4-a SHOULD). When <c>null</c> (the default), restart is enabled iff a
  /// <see cref="Launcher"/> is supplied.
  /// </summary>
  public bool? RestartOnUnexpectedExit { get; init; }

  /// <summary>
  /// A callback invoked with the ids of in-flight requests lost on an unexpected exit, so the caller MAY
  /// retry them against the fresh process (spec §8.6.4-b).
  /// </summary>
  public Action<IReadOnlyList<RequestId>>? OnInflightLost { get; init; }
}

/// <summary>
/// The client side of a stdio connection: launches/holds a server subprocess, writes
/// requests/notifications to its stdin, and reads responses/notifications from its stdout (spec §8
/// client role). The C# counterpart of the TypeScript <c>StdioClientTransport</c>.
/// </summary>
/// <remarks>
/// Responsibilities beyond framing:
/// <list type="bullet">
/// <item><description>Stream-role enforcement: only requests/notifications, and only valid MCP messages,
/// may go to stdin (R-8.3-a, R-8.5-c).</description></item>
/// <item><description>stderr handling: captured/forwarded/ignored, never parsed as protocol, never
/// assumed to mean an error (R-8.4-c, R-8.4-d, R-8.4-e, R-8.1-a).</description></item>
/// <item><description>Graceful shutdown: close stdin (EOF), await exit, force-terminate on timeout
/// (R-8.6.2-a, R-8.6.3-a).</description></item>
/// <item><description>Unexpected-exit restart (SHOULD) and lost in-flight retry (MAY) (R-8.6.4-a,
/// R-8.6.4-b).</description></item>
/// </list>
/// </remarks>
public sealed class StdioClientTransport : StdioEndpoint
{
  private IChildProcess _child;
  private readonly ChildProcessLauncher? _launcher;
  private readonly int _shutdownGraceMs;
  private readonly bool _restartOnUnexpectedExit;
  private readonly Action<IReadOnlyList<RequestId>>? _onInflightLost;

  /// <summary>Sender-side correlator; reused across a restart so ids may be retried (spec §8.6.4-b).</summary>
  public RequestCorrelator Correlator { get; } = new();

  /// <summary>Per-endpoint protocol-support cache for the §5.7 probe (spec §5.7-e).</summary>
  public Protocol.ProtocolSupportCache SupportCache { get; } = new();

  private readonly List<byte> _stderrChunks = new();
  private readonly object _stderrGate = new();
  private readonly List<Action<IChildProcess>> _restartHandlers = new();
  private readonly object _lifecycleGate = new();

  /// <summary><c>true</c> while a client-initiated graceful close is in progress (so exit is "expected").</summary>
  private bool _closing;
  private Action<int?>? _exitListener;
  private TaskCompletionSource? _closeCompletion;
  private CancellationTokenSource? _graceCts;

  /// <summary>The method a <c>server/discover</c> probe carries (for building the probe request).</summary>
  public static string ProbeMethod => Protocol.RevisionNegotiation.ServerDiscoverMethod;

  /// <summary>Launches/holds the subprocess and wires its streams and exit handling.</summary>
  /// <param name="options">The child or launcher, grace period, restart policy, and lost-in-flight callback.</param>
  /// <exception cref="TransportError">When neither a child nor a launcher is supplied.</exception>
  /// <remarks>
  /// When only a <see cref="StdioClientTransportOptions.Launcher"/> is supplied (no
  /// <see cref="StdioClientTransportOptions.Child"/>), the launcher is invoked exactly once to launch the
  /// initial child; the same launcher is then reused for any restart. The base endpoint is constructed
  /// with no streams and they are wired here once the child is resolved, so the launcher is never
  /// double-invoked.
  /// </remarks>
  public StdioClientTransport(StdioClientTransportOptions options)
    : base(MessageDirection.ClientToServer, outbound: null, inbound: null)
  {
    ArgumentNullException.ThrowIfNull(options);

    // Resolve the child exactly once: prefer an explicit pre-launched child; otherwise launch one via
    // the launcher. The launcher (when present) is invoked at most once here.
    var child = options.Child ?? options.Launcher?.Invoke()
      ?? throw new TransportError("StdioClientTransport requires a `Child` or a `Launcher`");

    _child = child;
    _launcher = options.Launcher;
    _shutdownGraceMs = options.ShutdownGraceMs;
    _restartOnUnexpectedExit = options.RestartOnUnexpectedExit ?? options.Launcher is not null;
    _onInflightLost = options.OnInflightLost;

    // Wire the inbound (stdout) source, the outbound (stdin) sink, and the child's stderr + exit now that
    // we hold the child.
    Inbound = _child.Stdout;
    Outbound = _child.Stdin;
    WireInbound(Inbound);
    WireChild(_child);
  }

  /// <summary>Subscribes to stderr capture and the child's exit event.</summary>
  /// <param name="child">The child to wire.</param>
  private void WireChild(IChildProcess child)
  {
    // stderr is free-form diagnostics — captured but NEVER decoded as protocol (R-8.1-a, R-8.4-b,
    // R-8.4-d).
    if (child.Stderr is not null)
    {
      child.Stderr.DataReceived += OnStderrData;
    }
    _exitListener = code => HandleExit(code);
    child.Exited += _exitListener;
  }

  private void OnStderrData(ReadOnlyMemory<byte> chunk)
  {
    lock (_stderrGate)
    {
      _stderrChunks.AddRange(chunk.ToArray());
    }
  }

  /// <summary>A copy of the captured stderr bytes (the client MAY forward/ignore them) (spec §8.4-c).</summary>
  /// <returns>The captured stderr bytes.</returns>
  public byte[] CapturedStderr()
  {
    lock (_stderrGate)
    {
      return _stderrChunks.ToArray();
    }
  }

  /// <summary>The captured stderr decoded as UTF-8 text, for convenient inspection (spec §8.4-a/c).</summary>
  /// <returns>The captured stderr as a string (replacement chars for any non-UTF-8 bytes — stderr is free-form).</returns>
  public string CapturedStderrText() => Encoding.UTF8.GetString(CapturedStderr());

  /// <summary>Registers a handler invoked with the fresh child after a restart.</summary>
  /// <param name="handler">Invoked with the new child on each restart.</param>
  /// <returns>An <see cref="IDisposable"/> that unsubscribes the handler.</returns>
  public IDisposable OnRestart(Action<IChildProcess> handler)
  {
    ArgumentNullException.ThrowIfNull(handler);
    lock (_lifecycleGate) _restartHandlers.Add(handler);
    return new ActionDisposable(() => { lock (_lifecycleGate) _restartHandlers.Remove(handler); });
  }

  /// <summary>
  /// Sends a <c>server/discover</c> probe response through the §5.7 classifier and caches the
  /// per-endpoint determination (spec §5.7; R-8.7-d, R-8.7-h). Mirrors the TypeScript
  /// <c>StdioClientTransport.probeProtocol</c>.
  /// </summary>
  /// <param name="endpointKey">Opaque per-endpoint key for the support cache.</param>
  /// <param name="response">The probe response node, or <c>null</c> for a timeout / no response.</param>
  /// <returns>The classified probe outcome.</returns>
  public Protocol.ProbeOutcome ProbeProtocol(string endpointKey, System.Text.Json.Nodes.JsonNode? response)
  {
    ArgumentNullException.ThrowIfNull(endpointKey);
    var outcome = Protocol.RevisionNegotiation.InterpretProbeResponse(response);
    SupportCache.Set(endpointKey, Protocol.RevisionNegotiation.DeterminationFromProbe(outcome));
    return outcome;
  }

  /// <summary>
  /// Delivers an inbound response to the correlator and returns whether it matched an outstanding request
  /// — a convenience for callers wiring <see cref="StdioEndpoint.OnMessage"/> to the reused
  /// <see cref="Correlator"/>.
  /// </summary>
  /// <param name="response">The inbound response message.</param>
  /// <returns><c>true</c> when a matching outstanding request was resolved.</returns>
  public bool DeliverResponse(JsonRpcMessage response) => Correlator.Deliver(response);

  /// <summary>
  /// Graceful shutdown (spec §8.6.2-a): (1) close the child's stdin (EOF — the only portable graceful
  /// signal), (2) wait for the process to exit, (3) forcibly terminate it if it does not exit within
  /// <c>ShutdownGraceMs</c> (R-8.6.3-a). Resolves once the process has exited (or been force-terminated).
  /// The close is observable via <see cref="StdioEndpoint.OnClose"/> with <c>Clean: true</c>.
  /// </summary>
  /// <param name="reason">An optional reason recorded on the close info.</param>
  /// <returns>A task that completes once the process has exited or been force-terminated.</returns>
  public override Task CloseAsync(string? reason = null)
  {
    lock (_lifecycleGate)
    {
      if (_closing || Closed) return Task.CompletedTask;
      _closing = true;
      _closeCompletion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    // Step 1: close stdin → EOF (R-8.6.2-a step 1).
    _child.Stdin?.End();

    if (AlreadyExited())
    {
      FinishClose(reason);
      return _closeCompletion!.Task;
    }

    // Step 3: escalate to a forced termination if it overstays (R-8.6.3-a). The exit listener (already
    // wired) resolves the close when the process exits; here we only arm the escalation timer.
    _graceCts = new CancellationTokenSource();
    _ = ScheduleForceTerminateAsync(reason, _graceCts.Token);
    return _closeCompletion!.Task;
  }

  private async Task ScheduleForceTerminateAsync(string? reason, CancellationToken token)
  {
    try
    {
      await Task.Delay(_shutdownGraceMs, token).ConfigureAwait(false);
    }
    catch (OperationCanceledException)
    {
      // The process exited within the grace period; nothing to force.
      return;
    }
    if (AlreadyExited()) return;
    ForceTerminate(reason, token);
  }

  /// <summary>Whether the child has already reported an exit code.</summary>
  /// <returns><c>true</c> when the child has exited.</returns>
  private bool AlreadyExited() => _child.ExitCode is not null;

  private void FinishClose(string? reason)
  {
    MarkClosed(new TransportCloseInfo(true, reason ?? "client closed stdin (EOF)"));
    TaskCompletionSource? completion;
    lock (_lifecycleGate)
    {
      completion = _closeCompletion;
      _closeCompletion = null;
    }
    completion?.TrySetResult();
  }

  /// <summary>
  /// Forcibly terminates the child using the OS-appropriate mechanism — on POSIX escalating SIGTERM then
  /// SIGKILL (spec §8.6.3-a; R-8.6.3-a).
  /// </summary>
  /// <param name="reason">The close reason.</param>
  /// <param name="token">A token cancelled when the process exits, halting escalation.</param>
  private void ForceTerminate(string? reason, CancellationToken token)
  {
    _child.Kill(KillSignal.Terminate);
    // Escalate to a forced kill shortly after if still alive (POSIX SIGTERM → SIGKILL).
    _ = EscalateToForceKillAsync(token);

    // When neither signal yields an exit event in a degenerate environment, still resolve the close so
    // the caller never hangs; the exit listener resolves it normally when the process does exit.
    _ = ResolveCloseEventuallyAsync(reason, token);
  }

  private async Task EscalateToForceKillAsync(CancellationToken token)
  {
    var escalationDelay = Math.Max(0, _shutdownGraceMs / 2);
    try
    {
      await Task.Delay(escalationDelay, token).ConfigureAwait(false);
    }
    catch (OperationCanceledException)
    {
      return;
    }
    if (!AlreadyExited())
    {
      _child.Kill(KillSignal.Force);
    }
  }

  private async Task ResolveCloseEventuallyAsync(string? reason, CancellationToken token)
  {
    // A safety net bounded by the full grace period: if the process never raises Exited after the kill
    // escalation, mark the close so the awaited CloseAsync task does not hang forever.
    try
    {
      await Task.Delay(_shutdownGraceMs, token).ConfigureAwait(false);
    }
    catch (OperationCanceledException)
    {
      return;
    }
    if (!Closed)
    {
      FinishClose(reason);
    }
  }

  /// <summary>
  /// Handles a child exit event (spec §8.6.4). A planned exit (during <see cref="CloseAsync"/>) is a
  /// clean close. An <em>unexpected</em> exit fails every in-flight request (so no caller hangs) and,
  /// when a launcher is configured and restart is enabled, launches a fresh process and re-wires the
  /// streams (R-8.6.4-a, R-8.6.4-b).
  /// </summary>
  /// <param name="code">The child's exit code, or <c>null</c> if killed by a signal.</param>
  private void HandleExit(int? code)
  {
    bool expected;
    lock (_lifecycleGate)
    {
      expected = _closing || Closed;
    }

    if (expected)
    {
      // Expected exit as part of a graceful close. Cancel any escalation timer and resolve the close.
      _graceCts?.Cancel();
      if (!Closed)
      {
        FinishClose("process exited after stdin close");
      }
      return;
    }

    // Unexpected exit: fail in-flight so callers observe the loss, then capture the lost ids for an
    // optional retry against the fresh process.
    var lost = Correlator.FailAll(
      new TransportError($"stdio server exited unexpectedly (code {code?.ToString() ?? "null"})"));
    _onInflightLost?.Invoke(lost);

    if (_restartOnUnexpectedExit && _launcher is not null)
    {
      Restart(_launcher);
      return;
    }

    // No restart configured: surface an abrupt disconnection (R-7.5-a).
    MarkClosed(new TransportCloseInfo(false, $"process exited unexpectedly (code {code?.ToString() ?? "null"})"));
  }

  /// <summary>
  /// Restarts the subprocess (spec §8.6.4-a): detaches the old streams, launches a fresh child via the
  /// launcher, and re-wires framing/stderr/exit so the same transport keeps serving. The protocol is
  /// stateless, so the fresh process needs no replay — each subsequent request carries its full
  /// <c>_meta</c>.
  /// </summary>
  /// <param name="launcher">The factory that launches the replacement child.</param>
  private void Restart(ChildProcessLauncher launcher)
  {
    // Detach old wiring.
    UnwireInbound(Inbound);
    if (_child.Stderr is not null) _child.Stderr.DataReceived -= OnStderrData;
    if (_exitListener is not null) _child.Exited -= _exitListener;

    // Fresh child + fresh framing decoder (no carry-over of partial bytes).
    var next = launcher();
    _child = next;
    Outbound = next.Stdin;
    Inbound = next.Stdout;
    ResetDecoder();
    WireInbound(Inbound);
    WireChild(next);

    Action<IChildProcess>[] handlers;
    lock (_lifecycleGate) handlers = _restartHandlers.ToArray();
    foreach (var handler in handlers) handler(next);
  }

  /// <summary>An <see cref="IDisposable"/> that runs an action once on disposal.</summary>
  private sealed class ActionDisposable(Action action) : IDisposable
  {
    private Action? _action = action;

    public void Dispose()
    {
      var action = Interlocked.Exchange(ref _action, null);
      action?.Invoke();
    }
  }
}

/// <summary>
/// Adapts a real <see cref="System.Diagnostics.Process"/> into an <see cref="IChildProcess"/> (spec §8
/// launch). The C# counterpart of the TypeScript real-<c>node:child_process</c> convenience.
/// </summary>
/// <remarks>
/// <para>
/// The process MUST be started with redirected stdin/stdout/stderr. This adapter bridges the process's
/// redirected streams to the push-based <see cref="IByteSource"/>/<see cref="IByteSink"/> contract: it
/// pumps stdout and stderr on background reader loops and writes stdin synchronously. On POSIX,
/// <see cref="KillSignal.Terminate"/> maps to a graceful kill (entire process tree is not killed) and
/// <see cref="KillSignal.Force"/> to <c>Process.Kill(entireProcessTree: true)</c>; on Windows both map
/// to a forced kill, which is the only available mechanism.
/// </para>
/// <para>
/// Use <see cref="Launch"/> to start a redirected process and wrap it, mirroring the typical stdio
/// client launch. This type is deliberately thin so the deterministic tests can exercise the transport
/// via in-memory pipes instead.
/// </para>
/// </remarks>
public sealed class ProcessChild : IChildProcess, IDisposable
{
  private readonly Process _process;
  private readonly StreamSink _stdin;
  private readonly StreamPump _stdout;
  private readonly StreamPump? _stderr;
  private int? _exitCode;

  /// <inheritdoc/>
  public event Action<int?>? Exited;

  private ProcessChild(Process process)
  {
    _process = process;
    _stdin = new StreamSink(process.StandardInput.BaseStream);
    _stdout = new StreamPump(process.StandardOutput.BaseStream);
    _stderr = process.StartInfo.RedirectStandardError ? new StreamPump(process.StandardError.BaseStream) : null;

    _process.EnableRaisingEvents = true;
    _process.Exited += (_, _) =>
    {
      _exitCode = SafeExitCode();
      Exited?.Invoke(_exitCode);
    };

    _stdout.Start();
    _stderr?.Start();
  }

  /// <summary>
  /// Launches <paramref name="fileName"/> with <paramref name="arguments"/> as a redirected subprocess
  /// and wraps it for the stdio client transport (spec §8 launch).
  /// </summary>
  /// <param name="fileName">The executable to run (for example <c>dotnet</c> or a server binary).</param>
  /// <param name="arguments">The command-line arguments.</param>
  /// <param name="workingDirectory">An optional working directory.</param>
  /// <returns>A started, wired <see cref="ProcessChild"/>.</returns>
  public static ProcessChild Launch(string fileName, IEnumerable<string>? arguments = null, string? workingDirectory = null)
  {
    ArgumentNullException.ThrowIfNull(fileName);
    var startInfo = new ProcessStartInfo
    {
      FileName = fileName,
      RedirectStandardInput = true,
      RedirectStandardOutput = true,
      RedirectStandardError = true,
      UseShellExecute = false,
      CreateNoWindow = true,
    };
    if (workingDirectory is not null) startInfo.WorkingDirectory = workingDirectory;
    if (arguments is not null)
    {
      foreach (var arg in arguments) startInfo.ArgumentList.Add(arg);
    }

    var process = new Process { StartInfo = startInfo };
    if (!process.Start())
    {
      throw new TransportError($"failed to launch stdio server process '{fileName}'");
    }
    return new ProcessChild(process);
  }

  /// <inheritdoc/>
  public IByteSink? Stdin => _stdin;

  /// <inheritdoc/>
  public IByteSource? Stdout => _stdout;

  /// <inheritdoc/>
  public IByteSource? Stderr => _stderr;

  /// <inheritdoc/>
  public int? ExitCode => _exitCode ?? (_process.HasExited ? SafeExitCode() : null);

  /// <inheritdoc/>
  public void Kill(KillSignal signal)
  {
    if (_process.HasExited) return;
    // The portable graceful step (stdin EOF) is already performed by StdioClientTransport.CloseAsync
    // before any Kill; by the time this runs the process has overstayed its grace period and must be
    // terminated. .NET's Process.Kill sends SIGKILL on Unix (there is no managed SIGTERM API), so the
    // two escalation levels differ only in scope: Terminate kills just the child, Force kills the whole
    // process tree to reap any grandchildren the overstaying child spawned.
    try
    {
      _process.Kill(entireProcessTree: signal == KillSignal.Force);
    }
    catch (InvalidOperationException)
    {
      // The process exited between the HasExited check and the Kill call — nothing to do.
    }
  }

  private int? SafeExitCode()
  {
    try
    {
      return _process.HasExited ? _process.ExitCode : null;
    }
    catch (InvalidOperationException)
    {
      return null;
    }
  }

  /// <summary>Disposes the underlying process and its reader pumps.</summary>
  public void Dispose()
  {
    _stdout.Dispose();
    _stderr?.Dispose();
    _process.Dispose();
  }

  /// <summary>Bridges a writable <see cref="Stream"/> to the <see cref="IByteSink"/> contract.</summary>
  private sealed class StreamSink(Stream stream) : IByteSink
  {
    public void Write(ReadOnlySpan<byte> bytes)
    {
      stream.Write(bytes);
      stream.Flush();
    }

    public void End()
    {
      try
      {
        stream.Close();
      }
      catch (ObjectDisposedException)
      {
        // Already closed.
      }
    }
  }

  /// <summary>Pumps a readable <see cref="Stream"/> onto the push-based <see cref="IByteSource"/> contract.</summary>
  private sealed class StreamPump(Stream stream) : IByteSource, IDisposable
  {
    private readonly CancellationTokenSource _cts = new();

    public event Action<ReadOnlyMemory<byte>>? DataReceived;
    public event Action? Ended;

    public void Start() => _ = PumpAsync(_cts.Token);

    private async Task PumpAsync(CancellationToken token)
    {
      var buffer = new byte[8192];
      try
      {
        while (!token.IsCancellationRequested)
        {
          var read = await stream.ReadAsync(buffer.AsMemory(), token).ConfigureAwait(false);
          if (read == 0) break; // EOF
          var chunk = new byte[read];
          Array.Copy(buffer, chunk, read);
          DataReceived?.Invoke(chunk);
        }
      }
      catch (OperationCanceledException)
      {
        // Shutting down.
      }
      catch (IOException)
      {
        // The underlying stream closed abruptly; treated as end-of-stream below.
      }
      Ended?.Invoke();
    }

    public void Dispose()
    {
      _cts.Cancel();
      _cts.Dispose();
    }
  }
}
