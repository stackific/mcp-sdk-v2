using System.Text;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Exercises the S12 transport contract (spec §7): the byte-channel <see cref="IByteChannelTransport"/>
/// observable surface, directionality (§7.4), the per-request statelessness model (§7.6), the
/// documentation-constant anchors, and the in-memory reference byte-channel pair upholding every §7.2
/// guarantee. Mirrors the contract/in-memory scenarios in the TypeScript <c>transport.test.ts</c>.
/// </summary>
public sealed class TransportContractTests
{
  private static JsonObject Envelope(string clientName = "example-client") => new()
  {
    ["io.modelcontextprotocol/protocolVersion"] = "2026-07-28",
    ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = clientName, ["version"] = "1.0.0" },
    ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
  };

  private static JsonRpcRequest Request(RequestId id, string method = "tools/call", JsonObject? extraParams = null, string clientName = "example-client")
  {
    var prms = extraParams is null ? new JsonObject() : (JsonObject)extraParams.DeepClone();
    prms["_meta"] = Envelope(clientName);
    return new JsonRpcRequest(id, method, prms);
  }

  private static JsonRpcNotification Notification(string method = "notifications/progress") => new(method, new JsonObject());

  private static JsonRpcSuccessResponse Response(RequestId id) => new(id, new JsonObject { ["resultType"] = "complete" });

  // ─── AC-12.12 — directionality (R-7.4-a/b/c) ─────────────────────────────────────────────────────

  [Fact]
  public void Directionality_requests_are_client_to_server_only_responses_server_to_client_only()
  {
    Assert.True(TransportContract.IsDirectionPermitted(DirectionalKind.Request, MessageDirection.ClientToServer));
    Assert.False(TransportContract.IsDirectionPermitted(DirectionalKind.Request, MessageDirection.ServerToClient));
    Assert.True(TransportContract.IsDirectionPermitted(DirectionalKind.Response, MessageDirection.ServerToClient));
    Assert.False(TransportContract.IsDirectionPermitted(DirectionalKind.Response, MessageDirection.ClientToServer));
    Assert.True(TransportContract.IsDirectionPermitted(DirectionalKind.Notification, MessageDirection.ClientToServer));
    Assert.True(TransportContract.IsDirectionPermitted(DirectionalKind.Notification, MessageDirection.ServerToClient));
  }

  [Fact]
  public void KindOf_classifies_every_message_subtype()
  {
    Assert.Equal(DirectionalKind.Request, TransportContract.KindOf(Request(1)));
    Assert.Equal(DirectionalKind.Notification, TransportContract.KindOf(Notification()));
    Assert.Equal(DirectionalKind.Response, TransportContract.KindOf(Response(1)));
    Assert.Equal(DirectionalKind.Response, TransportContract.KindOf(new JsonRpcErrorResponse(1, new JsonRpcError(-32603, "x"))));
  }

  // ─── AC-12.13 — request carries _meta envelope (R-7.4-d/f) ────────────────────────────────────────

  [Fact]
  public void Accepts_a_request_carrying_the_three_reserved_keys()
  {
    Assert.True(TransportContract.RequestCarriesMetaEnvelope(Request(1)));
    var context = TransportContract.DeriveRequestContext(Request(1));
    Assert.NotNull(context);
    Assert.Equal("2026-07-28", context!.ProtocolVersion);
    Assert.Equal("example-client", context.ClientInfo["name"]!.GetValue<string>());
  }

  [Fact]
  public void Rejects_a_request_whose_meta_is_missing_a_reserved_key()
  {
    var bad = new JsonRpcRequest(1, "tools/call", new JsonObject
    {
      ["_meta"] = new JsonObject { ["io.modelcontextprotocol/protocolVersion"] = "2026-07-28" },
    });
    Assert.False(TransportContract.RequestCarriesMetaEnvelope(bad));
    Assert.Null(TransportContract.DeriveRequestContext(bad));
  }

  [Fact]
  public void Rejects_a_request_with_no_meta_at_all()
  {
    Assert.False(TransportContract.RequestCarriesMetaEnvelope(new JsonRpcRequest(1, "tools/call", new JsonObject())));
  }

  [Fact]
  public void A_non_request_message_has_no_derived_context()
  {
    Assert.Null(TransportContract.DeriveRequestContext(Notification()));
    Assert.Null(TransportContract.DeriveRequestContext(Response(1)));
    Assert.False(TransportContract.RequestCarriesMetaEnvelope(Response(1)));
  }

  // ─── AC-12.14 — mirroring permitted; body authoritative (R-7.4-e) ─────────────────────────────────

  [Fact]
  public void Extracts_envelope_fields_for_mirroring_from_the_body()
  {
    var request = Request(1);
    var mirror = TransportContract.ExtractEnvelopeForMirroring(request);
    Assert.NotNull(mirror);
    Assert.Equal("2026-07-28", mirror!.ProtocolVersion);
    // The mirror equals the body-derived context — the body remains the source of truth.
    var derived = TransportContract.DeriveRequestContext(request);
    Assert.Equal(derived!.ProtocolVersion, mirror.ProtocolVersion);
  }

  [Fact]
  public void Returns_null_mirror_when_the_body_carries_no_valid_envelope()
  {
    Assert.Null(TransportContract.ExtractEnvelopeForMirroring(new JsonRpcRequest(1, "x", new JsonObject())));
  }

  // ─── AC-12.21 — statelessness: independent contexts per request (R-7.6-d/e/f) ─────────────────────

  [Fact]
  public void Two_requests_yield_independent_contexts_from_their_own_meta()
  {
    var contextA = TransportContract.DeriveRequestContext(Request(1, clientName: "example-client"));
    var contextB = TransportContract.DeriveRequestContext(Request(2, clientName: "other-client"));
    Assert.Equal("example-client", contextA!.ClientInfo["name"]!.GetValue<string>());
    Assert.Equal("other-client", contextB!.ClientInfo["name"]!.GetValue<string>());
  }

  // ─── AC-12.10 / AC-12.18 — documentation anchors (R-7.3, R-7.5-g/h, R-7.6) ────────────────────────

  [Fact]
  public void Documentation_anchors_record_the_normative_atoms()
  {
    Assert.Equal("R-7.3-c", CustomTransportObligations.UpholdAllGuarantees);
    Assert.Equal("R-7.3-e", CustomTransportObligations.ShouldReuseStdioFraming);
    Assert.Equal("R-7.3-b", CustomTransportObligations.PreserveFormatPatternsMetadata);
    Assert.Contains("R-7.2-q", TransportGuarantees.NoSilentLoss);
    Assert.Equal("R-7.5-g", StdioDisconnectPolicy.ShouldRestartOnUnexpectedExit);
    Assert.Equal("R-7.5-h", StdioDisconnectPolicy.MayRetryInflightOnFreshProcess);
    Assert.Equal("R-7.6-f", StatelessTransportRules.ContextFromMetaOnly);
    Assert.Equal("R-7.6-e", StatelessTransportRules.NoPriorRequestInference);
    Assert.Equal("R-7.6-i", StatelessTransportRules.ConnectionNotConversation);
  }

  // ─── AC-12.1 — carries 3 kinds both ways, no interpretation (R-7.1-a/b/d) ─────────────────────────

  [Fact]
  public void Delivers_request_notification_and_response_with_no_semantic_interpretation()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    var atServer = new List<JsonRpcMessage>();
    var atClient = new List<JsonRpcMessage>();
    server.OnMessage(atServer.Add);
    client.OnMessage(atClient.Add);

    client.Send(Request(1, "totally/made-up-method", new JsonObject { ["anything"] = new JsonArray(1, 2, 3) }));
    client.Send(Notification());
    server.Send(Response(1));

    Assert.Equal(2, atServer.Count);
    Assert.Equal("totally/made-up-method", ((JsonRpcRequest)atServer[0]).Method);
    Assert.Equal("notifications/progress", ((JsonRpcNotification)atServer[1]).Method);
    Assert.Single(atClient);
    Assert.Equal(new RequestId(1), ((JsonRpcSuccessResponse)atClient[0]).Id);
  }

  // ─── AC-12.2 — byte-for-byte integrity through the in-memory transport (R-7.1-c) ──────────────────

  [Fact]
  public void The_received_value_equals_the_emitted_value_through_the_in_memory_transport()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    JsonRpcMessage? received = null;
    server.OnMessage(m => received = m);

    var sent = Request(42, "tools/call", new JsonObject
    {
      ["name"] = "get_weather",
      ["arguments"] = new JsonObject { ["location"] = "New York" },
    });
    client.Send(sent);

    var typed = Assert.IsType<JsonRpcRequest>(received);
    Assert.Equal(new RequestId(42), typed.Id);
    Assert.Equal("get_weather", typed.Params!["name"]!.GetValue<string>());
    Assert.Equal("New York", typed.Params!["arguments"]!["location"]!.GetValue<string>());
  }

  // ─── AC-12.8 / AC-12.19 — no silent loss; observable failure (R-7.2-q/r/s, R-7.5-i/j) ─────────────

  [Fact]
  public async Task Throws_a_transport_error_on_send_after_the_channel_is_closed()
  {
    var (client, _) = InMemoryByteChannelTransport.CreatePair();
    await client.CloseAsync();
    Assert.Throws<TransportError>(() => client.Send(Request(1)));
  }

  [Fact]
  public async Task Surfaces_a_failure_when_the_receiving_peer_is_closed()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    await server.CloseAsync(); // closing one closes both, so client.Send observes it
    Assert.Throws<TransportError>(() => client.Send(Request(1)));
  }

  // ─── AC-12.9 — clean close observable by each side (R-7.2-t) ──────────────────────────────────────

  [Fact]
  public async Task Fires_on_close_with_clean_true_on_both_endpoints()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    TransportCloseInfo? clientClose = null;
    TransportCloseInfo? serverClose = null;
    client.OnClose(i => clientClose = i);
    server.OnClose(i => serverClose = i);

    await client.CloseAsync("done");

    Assert.Equal(new TransportCloseInfo(true, "done"), clientClose);
    Assert.Equal(new TransportCloseInfo(true, "done"), serverClose);
    Assert.True(client.Closed);
    Assert.True(server.Closed);
  }

  [Fact]
  public async Task A_handler_registered_after_close_still_observes_it()
  {
    var (client, _) = InMemoryByteChannelTransport.CreatePair();
    await client.CloseAsync();
    TransportCloseInfo? late = null;
    client.OnClose(i => late = i);
    Assert.NotNull(late);
    Assert.True(late!.Value.Clean);
  }

  // ─── AC-12.15 — abrupt disconnection observable (R-7.5-a/b) ───────────────────────────────────────

  [Fact]
  public void Fires_on_close_with_clean_false_on_an_abrupt_disconnect()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    TransportCloseInfo? observed = null;
    server.OnClose(i => observed = i);

    client.Disconnect("socket reset");

    Assert.Equal(new TransportCloseInfo(false, "socket reset"), observed);
    Assert.True(server.Closed);
    // Not blocking as if live: a send now observes the failure.
    Assert.Throws<TransportError>(() => server.Send(Response(1)));
  }

  // ─── AC-12.16 — in-flight failed on disconnect, wired via the correlator (R-7.5-c/d/e) ────────────

  [Fact]
  public async Task In_flight_requests_fail_when_the_channel_disconnects()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    var correlator = new RequestCorrelator();
    // Wire disconnection to fail all in-flight requests.
    client.OnClose(info => correlator.FailAll(new TransportError($"connection lost (clean={info.Clean})")));

    var task2 = correlator.Issue(2);
    var task3 = correlator.Issue(3);
    client.Send(Request(2, "tools/list"));
    client.Send(Request(3, "resources/list"));
    Assert.Equal(2, correlator.Size);

    server.Disconnect(); // lost before responses arrive

    await Assert.ThrowsAsync<TransportError>(() => task2);
    await Assert.ThrowsAsync<TransportError>(() => task3);
    Assert.Equal(0, correlator.Size);
  }

  // ─── QA — receiver-side decode errors surface on the receiver, not the sender ─────────────────────

  [Fact]
  public void Routes_a_corrupt_inbound_unit_to_the_receiver_on_error_leaving_send_unaffected()
  {
    var (_, server) = InMemoryByteChannelTransport.CreatePair();
    var errors = new List<TransportError>();
    var messages = new List<JsonRpcMessage>();
    server.OnError(errors.Add);
    server.OnMessage(messages.Add);

    // A corrupt (non-UTF-8) framed unit arrives on the wire at the server.
    server.InjectRawBytes(new byte[] { 0xff, 0xfe, 0x0a });

    Assert.Single(errors);
    Assert.Empty(messages);
    Assert.False(server.Closed); // a parse error is not a disconnection
  }

  [Fact]
  public void Does_not_throw_back_into_an_unrelated_sender()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    server.OnError(_ => { });
    // Injecting bad bytes at the server must not affect the client's send path.
    server.InjectRawBytes(Encoding.UTF8.GetBytes("{\"not\":\"rpc\"}\n"));
    var exception = Record.Exception(() => client.Send(Request(1)));
    Assert.Null(exception);
  }

  [Fact]
  public void Buffers_decode_errors_until_an_on_error_handler_attaches()
  {
    var (_, server) = InMemoryByteChannelTransport.CreatePair();
    server.InjectRawBytes(new byte[] { 0xff, 0x0a }); // error before any handler
    var errors = new List<TransportError>();
    server.OnError(errors.Add); // late subscriber still observes it
    Assert.Single(errors);
  }

  [Fact]
  public void Buffers_messages_until_an_on_message_handler_attaches()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    client.Send(Request(1)); // arrives at the server before any handler
    var messages = new List<JsonRpcMessage>();
    server.OnMessage(messages.Add); // late subscriber flushes the buffered message
    Assert.Single(messages);
  }

  // ─── AC-12.22 — interleaving unrelated requests on one connection (R-7.6-h) ───────────────────────

  [Fact]
  public void Interleaves_unrelated_requests_on_one_connection()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    var seen = new List<string>();
    server.OnMessage(m => seen.Add(((JsonRpcRequest)m).Method));

    client.Send(Request(1, "tools/call"));
    client.Send(Request(2, "resources/list"));
    client.Send(Request(3, "prompts/get"));

    Assert.Equal(new[] { "tools/call", "resources/list", "prompts/get" }, seen);
  }

  // ─── Unsubscribe — a disposed handler stops receiving ─────────────────────────────────────────────

  [Fact]
  public void Disposing_a_message_subscription_stops_delivery()
  {
    var (client, server) = InMemoryByteChannelTransport.CreatePair();
    var messages = new List<JsonRpcMessage>();
    var subscription = server.OnMessage(messages.Add);

    client.Send(Request(1));
    subscription.Dispose();
    client.Send(Request(2));

    Assert.Single(messages);
  }
}
