using System.Text;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Exercises the S13 stdio transport (spec §8): newline framing over a subprocess's standard streams,
/// stream-role enforcement (R-8.3-*, R-8.5-*), terminator/blank-line tolerance (R-8.2-*), malformed-line
/// resync (R-8.5-d/e/h), stderr capture that is never protocol (R-8.1-a/R-8.4-*), graceful-then-forced
/// shutdown (R-8.6.2/R-8.6.3), restart-on-unexpected-exit with lost-in-flight reporting (R-8.6.4), and
/// the §5.7 probe. Mirrors the scenarios in the TypeScript <c>stdio.test.ts</c>, driven by an in-memory
/// fake child so no real OS process is spawned (deterministic and portable on every platform).
/// </summary>
public sealed class StdioTransportTests
{
  // ─── Test doubles ───────────────────────────────────────────────────────────────────────────────

  /// <summary>
  /// An in-memory <see cref="IChildProcess"/> driven by <see cref="PushByteSource"/> pipes — no real OS
  /// process is ever spawned. <c>Stdin</c> is what the client writes (and tests read back); <c>Stdout</c>
  /// is what the server writes (tests push into it); <c>Stderr</c> carries diagnostics. <see cref="Exit"/>
  /// simulates process termination.
  /// </summary>
  private sealed class FakeChild : IChildProcess
  {
    public PushByteSource StdinPipe { get; } = new();
    public PushByteSource StdoutPipe { get; } = new();
    public PushByteSource StderrPipe { get; } = new();

    public List<KillSignal> KillSignals { get; } = new();
    private int? _exitCode;

    public IByteSink? Stdin => StdinPipe;
    public IByteSource? Stdout => StdoutPipe;
    public IByteSource? Stderr => StderrPipe;
    public int? ExitCode => _exitCode;

    public event Action<int?>? Exited;

    public void Kill(KillSignal signal)
    {
      KillSignals.Add(signal);
      // A real kill leads to an exit; emulate a prompt exit on a forced kill.
      if (signal == KillSignal.Force) Exit(null);
    }

    /// <summary>Simulates the process exiting (used for graceful, unexpected, and forced exit).</summary>
    /// <param name="code">The exit code, or <c>null</c> for a signal-kill.</param>
    public void Exit(int? code)
    {
      if (_exitCode is not null) return;
      _exitCode = code ?? 0;
      Exited?.Invoke(code);
    }
  }

  private static JsonObject Envelope(string version = "2026-07-28") => new()
  {
    ["io.modelcontextprotocol/protocolVersion"] = version,
    ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "ExampleClient", ["version"] = "1.0.0" },
    ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
  };

  private static JsonRpcRequest MakeRequest(RequestId id, string method = "tools/list")
  {
    return new JsonRpcRequest(id, method, new JsonObject { ["_meta"] = Envelope() });
  }

  private static StdioClientTransport ClientWith(FakeChild child, ChildProcessLauncher? launcher = null) =>
    new(new StdioClientTransportOptions { Child = child, Launcher = launcher, ShutdownGraceMs = 50 });

  /// <summary>Captures everything written to a sink-source pipe (for example the fake's stdin) and decodes the framed messages.</summary>
  private sealed class PipeSink
  {
    private readonly List<byte> _bytes = new();

    public PipeSink(PushByteSource pipe) => pipe.DataReceived += chunk => _bytes.AddRange(chunk.ToArray());

    public IReadOnlyList<JsonRpcMessage> Messages()
    {
      var decoder = new NewlineFramer().CreateDecoder();
      var units = decoder.Push(_bytes.ToArray());
      var messages = new List<JsonRpcMessage>();
      foreach (var unit in units)
      {
        if (MessageUnit.TryDecode(unit, out var message, out _))
        {
          messages.Add(message!);
        }
      }
      return messages;
    }

    public byte[] Raw => _bytes.ToArray();
  }

  // ─── AC-13.1 — framing: UTF-8, one line, no embedded newline, single \n ──────────────────────────

  [Fact]
  public void Serializes_a_request_as_one_utf8_line_with_a_single_trailing_newline()
  {
    var child = new FakeChild();
    var sink = new PipeSink(child.StdinPipe);
    var client = ClientWith(child);

    // A payload deliberately containing a literal newline inside a string.
    var request = new JsonRpcRequest(1, "tools/call", new JsonObject
    {
      ["text"] = "line1\nline2",
      ["_meta"] = Envelope(),
    });
    client.Send(request);

    var raw = sink.Raw;
    Assert.Equal(MessageUnit.NewlineByte, raw[^1]);
    // The only newline is the trailing delimiter — the in-string one is JSON-escaped.
    Assert.Equal(1, raw.Count(b => b == MessageUnit.NewlineByte));

    var messages = sink.Messages();
    var decoded = Assert.IsType<JsonRpcRequest>(messages[0]);
    Assert.Equal(new RequestId(1), decoded.Id);
    Assert.Equal("tools/call", decoded.Method);
  }

  // ─── AC-13.2 — \n and \r\n both accepted; trailing \r stripped ───────────────────────────────────

  [Fact]
  public void Accepts_both_newline_and_crlf_terminators_stripping_the_trailing_cr()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    var received = new List<JsonRpcMessage>();
    client.OnMessage(received.Add);

    child.StdoutPipe.Write(Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n"));
    child.StdoutPipe.Write(Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{}}\r\n"));

    Assert.Equal(2, received.Count);
    Assert.Equal(new RequestId(1), ((JsonRpcSuccessResponse)received[0]).Id);
    Assert.Equal(new RequestId(2), ((JsonRpcSuccessResponse)received[1]).Id);
  }

  // ─── AC-13.3 — blank / whitespace-only lines ignored ─────────────────────────────────────────────

  [Fact]
  public void Ignores_blank_and_whitespace_only_lines_without_treating_them_as_malformed()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    var messages = new List<JsonRpcMessage>();
    var errors = new List<TransportError>();
    client.OnMessage(messages.Add);
    client.OnError(errors.Add);

    child.StdoutPipe.Write(Encoding.UTF8.GetBytes("\n   \n\t\n"));
    child.StdoutPipe.Write(Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n"));

    Assert.Single(messages);
    Assert.Empty(errors); // blank lines are NOT errors
  }

  // ─── AC-13.4 — client may not write a response / non-MCP to stdin ────────────────────────────────

  [Fact]
  public void Rejects_writing_a_response_to_stdin()
  {
    var child = new FakeChild();
    var sink = new PipeSink(child.StdinPipe);
    var client = ClientWith(child);

    Assert.Throws<TransportError>(() => client.Send(new JsonRpcSuccessResponse(1, new JsonObject())));
    Assert.Empty(sink.Raw); // nothing written
  }

  [Fact]
  public void Permits_writing_requests_and_notifications_to_stdin()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    Assert.Null(Record.Exception(() => client.Send(MakeRequest(1))));
    Assert.Null(Record.Exception(() => client.Send(new JsonRpcNotification("notifications/cancelled",
      new JsonObject { ["requestId"] = 1 }))));
  }

  // ─── AC-13.5 — server may not write a request / non-MCP to stdout ────────────────────────────────

  [Fact]
  public void Server_rejects_writing_a_request_to_stdout()
  {
    var stdin = new PushByteSource();
    var stdout = new PushByteSource();
    var sink = new PipeSink(stdout);
    var server = new StdioServerTransport(new StdioServerTransportOptions { Stdin = stdin, Stdout = stdout });

    Assert.Throws<TransportError>(() => server.Send(MakeRequest(1)));
    Assert.Empty(sink.Raw);
  }

  [Fact]
  public void Server_permits_writing_responses_and_notifications_to_stdout()
  {
    var stdin = new PushByteSource();
    var stdout = new PushByteSource();
    var server = new StdioServerTransport(new StdioServerTransportOptions { Stdin = stdin, Stdout = stdout });
    Assert.Null(Record.Exception(() => server.Send(new JsonRpcSuccessResponse(1, new JsonObject()))));
    Assert.Null(Record.Exception(() => server.Send(new JsonRpcNotification("notifications/message", new JsonObject()))));
  }

  // ─── AC-13.7 — a response asking for input is fine; a stdout request is not ───────────────────────

  [Fact]
  public void Server_carries_a_reply_requiring_interaction_inside_its_response_not_as_a_stdout_request()
  {
    var stdin = new PushByteSource();
    var stdout = new PushByteSource();
    var server = new StdioServerTransport(new StdioServerTransportOptions { Stdin = stdin, Stdout = stdout });

    var responseRequiringInput = new JsonRpcSuccessResponse(1, new JsonObject
    {
      ["needsInput"] = true,
      ["prompt"] = "Confirm?",
    });
    Assert.Null(Record.Exception(() => server.Send(responseRequiringInput)));
    // But emitting an actual request on stdout is prohibited.
    Assert.Throws<TransportError>(() => server.Send(MakeRequest(2)));
  }

  // ─── AC-13.8 — cancellation then silence ──────────────────────────────────────────────────────────

  [Fact]
  public void Cancels_via_notifications_cancelled_referencing_the_id()
  {
    var child = new FakeChild();
    var sink = new PipeSink(child.StdinPipe);
    var client = ClientWith(child);

    client.Send(MakeRequest(1));
    client.Send(new JsonRpcNotification("notifications/cancelled", new JsonObject { ["requestId"] = 1 }));

    var sent = sink.Messages();
    var cancel = (JsonRpcNotification)sent.First(m => m is JsonRpcNotification { Method: "notifications/cancelled" });
    Assert.Equal(1, cancel.Params!["requestId"]!.GetValue<int>());
  }

  // ─── AC-13.9 / AC-13.22 — stderr is diagnostics, never protocol ──────────────────────────────────

  [Fact]
  public void Does_not_parse_stderr_text_as_protocol_even_when_it_looks_like_jsonrpc()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    var messages = new List<JsonRpcMessage>();
    var errors = new List<TransportError>();
    client.OnMessage(messages.Add);
    client.OnError(errors.Add);

    // A line on stderr that is valid JSON-RPC must NOT become a message.
    child.StderrPipe.Write(Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":99,\"result\":{}}\n"));
    child.StderrPipe.Write(Encoding.UTF8.GetBytes("[server] handling tools/call\n"));

    Assert.Empty(messages);
    Assert.Empty(errors);
  }

  // ─── AC-13.10 — client stderr handling (capture/forward/ignore; not an error) ────────────────────

  [Fact]
  public void Captures_stderr_never_interprets_it_as_jsonrpc_and_does_not_treat_it_as_an_error()
  {
    var child = new FakeChild();
    var client = ClientWith(child);

    child.StderrPipe.Write(Encoding.UTF8.GetBytes("debug: warming caches\n"));

    Assert.Contains("warming caches", client.CapturedStderrText());
    Assert.False(client.Closed); // stderr output is not an error and not a close
  }

  // ─── AC-13.11 — malformed line: no crash, discard, diagnostic, resync ────────────────────────────

  [Fact]
  public void Discards_a_malformed_line_surfaces_a_diagnostic_and_resyncs_at_the_next_newline()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    var messages = new List<JsonRpcMessage>();
    var errors = new List<TransportError>();
    client.OnMessage(messages.Add);
    client.OnError(errors.Add);

    // Malformed line followed by a valid one — both delivered in a single chunk.
    var malformed = "{ not json at all \n";
    var good = "{\"jsonrpc\":\"2.0\",\"id\":5,\"result\":{}}\n";
    child.StdoutPipe.Write(Encoding.UTF8.GetBytes(malformed + good));

    Assert.False(client.Closed);          // not crashed / torn down (R-8.5-d)
    Assert.Single(errors);                // optional diagnostic recorded (R-8.5-f)
    Assert.Single(messages);              // resynchronized to the next message (R-8.5-h)
    Assert.Equal(new RequestId(5), ((JsonRpcSuccessResponse)messages[0]).Id);
  }

  // ─── AC-13.12 — malformed-with-id surfaces a diagnostic; the host MAY answer ─────────────────────

  [Fact]
  public void Surfaces_a_malformed_line_diagnostic_so_the_host_may_answer_with_a_parse_error()
  {
    var child = new FakeChild();
    var server = new StdioServerTransport(new StdioServerTransportOptions { Stdin = child.StdinPipe, Stdout = child.StdoutPipe });
    var errors = new List<TransportError>();
    server.OnError(errors.Add);

    // Malformed but a request id 7 is textually present — the host could recover it.
    child.StdinPipe.Write(Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":,}\n"));
    Assert.Single(errors);

    // The host chooses to respond with a parse error keyed to the recovered id.
    var errorResponse = new JsonRpcErrorResponse(7, new JsonRpcError(-32700, "Parse error"));
    Assert.Null(Record.Exception(() => server.Send(errorResponse)));

    // A malformed line with NO recoverable id is still surfaced as a diagnostic, no response forced.
    errors.Clear();
    child.StdinPipe.Write(Encoding.UTF8.GetBytes("@@@ garbage @@@\n"));
    Assert.Single(errors);
  }

  // ─── AC-13.13 — no handshake; first message any enveloped request ────────────────────────────────

  [Fact]
  public void Requires_no_handshake_the_first_message_carries_full_meta()
  {
    var child = new FakeChild();
    var sink = new PipeSink(child.StdinPipe);
    var client = ClientWith(child);

    client.Send(MakeRequest(1, "tools/list"));

    var first = (JsonRpcRequest)sink.Messages()[0];
    var meta = first.Params!["_meta"]!.AsObject();
    Assert.Equal("2026-07-28", meta["io.modelcontextprotocol/protocolVersion"]!.GetValue<string>());
    Assert.True(meta.ContainsKey("io.modelcontextprotocol/clientInfo"));
    Assert.True(meta.ContainsKey("io.modelcontextprotocol/clientCapabilities"));
  }

  [Fact]
  public void The_first_message_may_instead_be_a_server_discover_request()
  {
    var child = new FakeChild();
    var sink = new PipeSink(child.StdinPipe);
    var client = ClientWith(child);

    client.Send(new JsonRpcRequest(0, StdioClientTransport.ProbeMethod, new JsonObject { ["_meta"] = Envelope() }));

    var first = (JsonRpcRequest)sink.Messages()[0];
    Assert.Equal("server/discover", first.Method);
  }

  // ─── AC-13.14 — graceful shutdown: stdin first, await exit, clean resolve ─────────────────────────

  [Fact]
  public async Task Closes_stdin_first_waits_for_exit_and_resolves_cleanly_when_the_process_exits_in_time()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    var stdinEnded = false;
    child.StdinPipe.Ended += () => stdinEnded = true;

    var closeTask = client.CloseAsync();
    Assert.True(stdinEnded); // stdin was ended (EOF) as the first step

    // The process then exits promptly — close resolves cleanly.
    child.Exit(0);
    await closeTask;
    Assert.True(client.Closed);
    Assert.Empty(child.KillSignals); // never had to force-terminate
  }

  [Fact]
  public async Task A_graceful_close_fires_on_close_with_clean_true()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    TransportCloseInfo? closeInfo = null;
    client.OnClose(i => closeInfo = i);

    var closeTask = client.CloseAsync();
    child.Exit(0);
    await closeTask;

    Assert.NotNull(closeInfo);
    Assert.True(closeInfo!.Value.Clean);
  }

  // ─── AC-13.16 — forced termination on overstay ───────────────────────────────────────────────────

  [Fact]
  public async Task Force_terminates_sigterm_then_sigkill_when_the_child_does_not_exit_within_grace()
  {
    var child = new FakeChild();
    var client = ClientWith(child); // ShutdownGraceMs: 50

    var closeTask = client.CloseAsync();
    // The child never exits on its own; after the grace period it is terminated, then force-killed.
    await closeTask;

    Assert.Equal(KillSignal.Terminate, child.KillSignals[0]); // graceful terminate first
    Assert.Contains(KillSignal.Force, child.KillSignals);     // then forced kill escalation
    Assert.True(client.Closed);
  }

  // ─── AC-13.15 — server-initiated shutdown ────────────────────────────────────────────────────────

  [Fact]
  public async Task Server_can_close_its_stdout_and_exit()
  {
    var stdin = new PushByteSource();
    var stdout = new PushByteSource();
    var server = new StdioServerTransport(new StdioServerTransportOptions { Stdin = stdin, Stdout = stdout });
    var stdoutEnded = false;
    stdout.Ended += () => stdoutEnded = true;
    TransportCloseInfo? closeInfo = null;
    server.OnClose(i => closeInfo = i);

    await server.CloseAsync("shutting down");

    Assert.True(server.Closed);
    Assert.True(stdoutEnded);
    Assert.True(closeInfo!.Value.Clean);
  }

  [Fact]
  public void Server_observes_a_clean_close_when_stdin_reaches_eof()
  {
    var stdin = new PushByteSource();
    var stdout = new PushByteSource();
    var server = new StdioServerTransport(new StdioServerTransportOptions { Stdin = stdin, Stdout = stdout });
    TransportCloseInfo? closeInfo = null;
    server.OnClose(i => closeInfo = i);

    stdin.End(); // client closed its side → EOF

    Assert.True(server.Closed);
    Assert.True(closeInfo!.Value.Clean);
  }

  // ─── AC-13.17 — restart on unexpected exit; report lost in-flight ────────────────────────────────

  [Fact]
  public async Task Restarts_on_unexpected_exit_and_reports_lost_in_flight_ids_for_optional_retry()
  {
    var first = new FakeChild();
    var second = new FakeChild();
    var replacements = new Queue<IChildProcess>(new[] { (IChildProcess)second });
    ChildProcessLauncher launcher = () => replacements.Count > 0 ? replacements.Dequeue() : new FakeChild();

    var lost = new List<IReadOnlyList<RequestId>>();
    var client = new StdioClientTransport(new StdioClientTransportOptions
    {
      Child = first,
      Launcher = launcher,
      ShutdownGraceMs = 50,
      OnInflightLost = ids => lost.Add(ids),
    });

    // An in-flight request, then an UNEXPECTED exit.
    var inflight = client.Correlator.Issue(1);
    client.Send(MakeRequest(1));

    IChildProcess? restartedChild = null;
    client.OnRestart(c => restartedChild = c);

    first.Exit(1); // unexpected

    // In-flight id 1 was reported as lost (MAY retry) and a fresh process launched.
    await Assert.ThrowsAsync<TransportError>(() => inflight);
    Assert.Single(lost);
    Assert.Equal(new RequestId[] { 1 }, lost[0]);
    Assert.Same(second, restartedChild);
    Assert.False(client.Closed); // restart keeps the transport alive

    // The fresh process serves: a request now goes to the second child's stdin.
    var secondSink = new PipeSink(second.StdinPipe);
    client.Send(MakeRequest(2));
    Assert.Contains(secondSink.Messages(), m => m is JsonRpcRequest { Id: var id } && id == new RequestId(2));
  }

  [Fact]
  public void Surfaces_an_abrupt_disconnection_when_no_launcher_is_configured()
  {
    var child = new FakeChild();
    var client = new StdioClientTransport(new StdioClientTransportOptions { Child = child, ShutdownGraceMs = 50 });
    TransportCloseInfo? closeInfo = null;
    client.OnClose(i => closeInfo = i);

    child.Exit(1);

    Assert.NotNull(closeInfo);
    Assert.False(closeInfo!.Value.Clean);
  }

  // ─── AC-13.18 — request carries _meta; a -32004 error routes to the waiting request ──────────────

  [Fact]
  public async Task Routes_a_minus32004_error_response_back_to_the_waiting_request()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    var pending = client.Correlator.Issue(1);
    client.OnMessage(m =>
    {
      if (m is JsonRpcSuccessResponse or JsonRpcErrorResponse)
      {
        client.DeliverResponse(m);
      }
    });
    client.Send(MakeRequest(1));

    // Server rejects the requested revision with -32004.
    var errorLine = "{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32004,\"message\":\"Unsupported protocol version\",\"data\":{\"supported\":[\"2026-07-28\"]}}}\n";
    child.StdoutPipe.Write(Encoding.UTF8.GetBytes(errorLine));

    var response = (JsonRpcErrorResponse)await pending;
    Assert.Equal(ErrorCodes.UnsupportedProtocolVersion, response.Error.Code);
  }

  // ─── AC-13.19 / AC-13.20 — probe outcomes ────────────────────────────────────────────────────────

  [Fact]
  public void Classifies_a_successful_discover_probe_as_supported_and_caches_the_determination()
  {
    var child = new FakeChild();
    var client = ClientWith(child);

    var outcome = client.ProbeProtocol("cmd:server", JsonNode.Parse("""
      {
        "jsonrpc": "2.0",
        "id": 0,
        "result": {
          "resultType": "complete",
          "supportedVersions": ["2026-07-28"],
          "capabilities": {},
          "serverInfo": { "name": "ExampleServer", "version": "1.0.0" }
        }
      }
      """));

    Assert.Equal(ProbeOutcomeKind.Supported, outcome.Kind);
    var determination = client.SupportCache.Get("cmd:server");
    Assert.NotNull(determination);
    Assert.True(determination!.SpeaksProtocol);
    Assert.Equal(new[] { "2026-07-28" }, determination.SupportedVersions);
  }

  [Fact]
  public void On_a_minus32004_probe_outcome_selects_from_the_advertised_set_without_a_handshake()
  {
    var child = new FakeChild();
    var client = ClientWith(child);

    var outcome = client.ProbeProtocol("cmd:server", JsonNode.Parse("""
      {
        "jsonrpc": "2.0",
        "id": 0,
        "error": {
          "code": -32004,
          "message": "Unsupported protocol version",
          "data": { "supported": ["2026-07-28"], "requested": "2099-01-01" }
        }
      }
      """));

    var unsupported = Assert.IsType<ProbeOutcome.UnsupportedVersion>(outcome);
    Assert.Equal(ProbeOutcomeKind.UnsupportedVersion, unsupported.Kind);
    Assert.Contains("2026-07-28", unsupported.SupportedVersions);
    Assert.True(client.SupportCache.Get("cmd:server")!.SpeaksProtocol);
  }

  [Fact]
  public void On_any_other_error_or_no_response_classifies_not_this_protocol()
  {
    var child = new FakeChild();
    var client = ClientWith(child);

    var other = client.ProbeProtocol("a", JsonNode.Parse("""{"jsonrpc":"2.0","id":0,"error":{"code":-32601,"message":"Method not found"}}"""));
    var timeout = client.ProbeProtocol("b", null);

    Assert.Equal(ProbeOutcomeKind.NotThisProtocol, other.Kind);
    Assert.Equal(ProbeOutcomeKind.NotThisProtocol, timeout.Kind);
    Assert.False(client.SupportCache.Get("a")!.SpeaksProtocol);
    Assert.False(client.SupportCache.Get("b")!.SpeaksProtocol);
  }

  // ─── AC-13.21 — framing reusable over a plain (non-subprocess) byte stream ───────────────────────

  [Fact]
  public void The_same_newline_framing_carries_a_message_over_an_arbitrary_byte_stream()
  {
    // A non-subprocess duplex pair (for example a socket) reuses the exact framing.
    var a = new PushByteSource();
    var b = new PushByteSource();
    var sink = new PipeSink(b);
    var endpoint = new StdioServerTransport(new StdioServerTransportOptions { Stdin = a, Stdout = b });

    endpoint.Send(new JsonRpcSuccessResponse(1, new JsonObject { ["ok"] = true }));

    var raw = sink.Raw;
    Assert.Equal(MessageUnit.NewlineByte, raw[^1]);
    Assert.True(MessageUnit.TryDecode(raw[..^1], out var message, out _));
    Assert.Equal(new RequestId(1), ((JsonRpcSuccessResponse)message!).Id);
  }

  // ─── send-after-close is observable, never silently dropped ──────────────────────────────────────

  [Fact]
  public async Task Send_after_close_throws_a_transport_error()
  {
    var child = new FakeChild();
    var client = ClientWith(child);
    var closeTask = client.CloseAsync();
    child.Exit(0);
    await closeTask;

    Assert.Throws<TransportError>(() => client.Send(MakeRequest(1)));
  }

  // ─── restart re-wires inbound so the fresh stdout is read ────────────────────────────────────────

  [Fact]
  public void After_restart_messages_from_the_new_child_stdout_are_delivered()
  {
    var first = new FakeChild();
    var second = new FakeChild();
    var replacements = new Queue<IChildProcess>(new[] { (IChildProcess)second });
    ChildProcessLauncher launcher = () => replacements.Count > 0 ? replacements.Dequeue() : new FakeChild();

    var client = new StdioClientTransport(new StdioClientTransportOptions
    {
      Child = first,
      Launcher = launcher,
      ShutdownGraceMs = 50,
    });
    var messages = new List<JsonRpcMessage>();
    client.OnMessage(messages.Add);

    first.Exit(1); // unexpected → restart to `second`

    // A message on the OLD child's stdout must NOT be delivered (it was unwired).
    first.StdoutPipe.Write(Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n"));
    Assert.Empty(messages);

    // A message on the NEW child's stdout IS delivered.
    second.StdoutPipe.Write(Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{}}\n"));
    Assert.Single(messages);
    Assert.Equal(new RequestId(2), ((JsonRpcSuccessResponse)messages[0]).Id);
  }
}
