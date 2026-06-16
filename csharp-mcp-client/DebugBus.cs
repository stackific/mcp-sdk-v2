using System.Threading.Channels;

namespace CSharpMcpClient;

/// <summary>
/// One JSON-RPC frame (or lifecycle/note event) crossing the wire, relayed to the SPA's "under the
/// hood" view. Mirrors the shape the frontend's debug panel renders (seq, ts, dir, kind, …).
/// </summary>
public sealed record Frame(
  int Seq,
  long Ts,
  string Dir,
  string Kind,
  string? Method = null,
  object? Id = null,
  string? Summary = null,
  object? Payload = null,
  string? Trace = null);

/// <summary>
/// A tiny broadcast bus: every wire frame fans out to all connected <c>/debug/stream</c> SSE clients.
/// Subscribers receive frames through a bounded channel so a slow client cannot stall the producer.
/// </summary>
public sealed class DebugBus
{
  private readonly List<Channel<Frame>> _subscribers = [];
  private readonly Lock _gate = new();
  private int _seq;

  /// <summary>Emits a frame to all subscribers, stamping it with a sequence number and timestamp.</summary>
  /// <param name="frame">A frame whose <c>Seq</c>/<c>Ts</c> are ignored and overwritten.</param>
  /// <returns>The stamped frame.</returns>
  public Frame Emit(Frame frame)
  {
    Frame stamped;
    Channel<Frame>[] targets;
    lock (_gate)
    {
      stamped = frame with { Seq = ++_seq, Ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };
      targets = [.. _subscribers];
    }
    foreach (var channel in targets) channel.Writer.TryWrite(stamped);
    return stamped;
  }

  /// <summary>Subscribes a new SSE client; the returned reader yields frames until <paramref name="unsubscribe"/> runs.</summary>
  /// <param name="unsubscribe">Receives a disposer to call when the client disconnects.</param>
  /// <returns>The channel reader to await frames from.</returns>
  public ChannelReader<Frame> Subscribe(out IDisposable unsubscribe)
  {
    var channel = Channel.CreateBounded<Frame>(new BoundedChannelOptions(1024) { FullMode = BoundedChannelFullMode.DropOldest });
    lock (_gate) _subscribers.Add(channel);
    unsubscribe = new Unsubscriber(this, channel);
    return channel.Reader;
  }

  private void Remove(Channel<Frame> channel)
  {
    lock (_gate) _subscribers.Remove(channel);
    channel.Writer.TryComplete();
  }

  private sealed class Unsubscriber(DebugBus bus, Channel<Frame> channel) : IDisposable
  {
    public void Dispose() => bus.Remove(channel);
  }
}
