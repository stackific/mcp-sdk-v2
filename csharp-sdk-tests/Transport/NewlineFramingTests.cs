using System.Text;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Exercises S12 newline framing and message-unit decoding (spec §7.1/§7.2/§7.6): unambiguous
/// body-independent framing (R-7.2-b/c/d), partial-frame retention across reads (R-7.2-q), fatal UTF-8
/// rejection with no substitution (R-7.6-c), single-JSON-value enforcement (R-7.1-b), and the
/// encode→decode byte-identity round-trip (R-7.1-c). Mirrors the framing scenarios in the TypeScript
/// <c>transport.test.ts</c>.
/// </summary>
public sealed class NewlineFramingTests
{
  private static JsonRpcRequest Request(RequestId id, string method = "tools/call", JsonObject? extraParams = null)
  {
    var prms = extraParams is null ? new JsonObject() : (JsonObject)extraParams.DeepClone();
    prms["_meta"] = new JsonObject
    {
      ["io.modelcontextprotocol/protocolVersion"] = "2026-07-28",
      ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "example-client", ["version"] = "1.0.0" },
      ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
    };
    return new JsonRpcRequest(id, method, prms);
  }

  private static JsonRpcNotification Notification(string method = "notifications/progress") => new(method, new JsonObject());

  // ─── AC-12.2 — byte-for-byte integrity (R-7.1-c) ─────────────────────────────────────────────────

  [Fact]
  public void Framer_round_trips_to_byte_identical_bodies()
  {
    var framer = new NewlineFramer();
    var message = Request("x", "tools/call", new JsonObject { ["unicode"] = "héllo 世界 — \n escaped newline" });

    var framed = framer.Encode(message);
    var decoder = framer.CreateDecoder();
    var units = decoder.Push(framed);

    Assert.Single(units);
    // Framing removed → identical to the framing-less encoding (byte-for-byte).
    Assert.Equal(MessageUnit.Encode(message), units[0]);
    // And it decodes back to an equal message.
    var decoded = (JsonRpcRequest)MessageUnit.Decode(units[0]);
    Assert.Equal(new RequestId("x"), decoded.Id);
    Assert.Equal("tools/call", decoded.Method);
  }

  [Fact]
  public void Encoded_message_never_contains_a_raw_newline_byte()
  {
    // An embedded newline inside a string value must be JSON-escaped, so the delimiter stays unambiguous.
    var body = MessageUnit.Encode(Request(1, "tools/call", new JsonObject { ["text"] = "line1\nline2" }));
    Assert.DoesNotContain(MessageUnit.NewlineByte, body);
  }

  [Fact]
  public void Framer_appends_exactly_one_trailing_newline()
  {
    var framed = new NewlineFramer().Encode(Notification());
    Assert.Equal(MessageUnit.NewlineByte, framed[^1]);
    // Only the single trailing delimiter — the body carries none.
    Assert.Equal(1, framed.Count(b => b == MessageUnit.NewlineByte));
  }

  // ─── AC-12.3 — framing delimits without parsing the body (R-7.2-b/c/d) ───────────────────────────

  [Fact]
  public void Splits_two_concatenated_framed_messages_by_delimiter_alone()
  {
    var framer = new NewlineFramer();
    var a = framer.Encode(Request(1));
    var b = framer.Encode(Notification());
    var combined = a.Concat(b).ToArray();

    var decoder = framer.CreateDecoder();
    var units = decoder.Push(combined);

    Assert.Equal(2, units.Count);
    Assert.IsType<JsonRpcRequest>(MessageUnit.Decode(units[0]));
    Assert.IsType<JsonRpcNotification>(MessageUnit.Decode(units[1]));
  }

  [Fact]
  public void Retains_a_partial_frame_split_across_two_chunks_without_dropping()
  {
    var framer = new NewlineFramer();
    var full = framer.Encode(Request(7));
    var cut = full.Length / 2;
    var decoder = framer.CreateDecoder();

    // No delimiter yet — nothing emitted, but the bytes are buffered, not dropped.
    Assert.Empty(decoder.Push(full.AsSpan(0, cut)));
    Assert.Equal(cut, decoder.Pending);

    var units = decoder.Push(full.AsSpan(cut));
    Assert.Single(units);
    var decoded = (JsonRpcRequest)MessageUnit.Decode(units[0]);
    Assert.Equal(new RequestId(7), decoded.Id);
    Assert.Equal(0, decoder.Pending);
  }

  [Fact]
  public void Remainder_exposes_buffered_partial_bytes()
  {
    var decoder = new NewlineFramer().CreateDecoder();
    var bytes = Encoding.UTF8.GetBytes("{\"partial\":");
    decoder.Push(bytes);
    Assert.Equal(bytes, decoder.Remainder());
  }

  [Fact]
  public void Multibyte_utf8_split_across_chunk_boundary_decodes_intact()
  {
    // A multi-byte character (世) straddling a chunk boundary must not be corrupted: the decoder buffers
    // bytes, not characters, so the line reassembles before UTF-8 decoding ever runs.
    var framer = new NewlineFramer();
    var full = framer.Encode(Request(1, "tools/call", new JsonObject { ["text"] = "世界" }));
    var decoder = framer.CreateDecoder();

    for (var i = 0; i < full.Length; i++)
    {
      decoder.Push(full.AsSpan(i, 1));
    }
    // The final push including the delimiter yields exactly one unit; collect by pushing nothing more.
    // Re-run as a single split to assert the unit decodes intact.
    var fresh = framer.CreateDecoder();
    var mid = full.Length / 2;
    fresh.Push(full.AsSpan(0, mid));
    var units = fresh.Push(full.AsSpan(mid));
    Assert.Single(units);
    var decoded = (JsonRpcRequest)MessageUnit.Decode(units[0]);
    Assert.Equal("世界", decoded.Params!["text"]!.GetValue<string>());
  }

  // ─── AC-12.20 — UTF-8 + single JSON value; reject malformed (R-7.6-a/b/c) ─────────────────────────

  [Fact]
  public void Decodes_a_well_formed_utf8_json_unit()
  {
    var message = (JsonRpcRequest)MessageUnit.Decode(MessageUnit.Encode(Request(1)));
    Assert.Equal(new RequestId(1), message.Id);
  }

  [Fact]
  public void Rejects_ill_formed_utf8_with_a_transport_error_and_no_substitution()
  {
    // 0xff 0xfe 0xfd is not valid UTF-8. A fatal decoder MUST reject it, never substitute U+FFFD.
    var badUtf8 = new byte[] { 0xff, 0xfe, 0xfd };
    var error = Assert.Throws<TransportError>(() => MessageUnit.Decode(badUtf8));
    Assert.Equal(TransportError.TransportErrorCode, error.Code);
    Assert.Contains("UTF-8", error.Message);

    Assert.False(MessageUnit.TryDecode(badUtf8, out var message, out var tryError));
    Assert.Null(message);
    Assert.NotNull(tryError);
  }

  [Fact]
  public void Rejects_a_lone_continuation_byte_as_invalid_utf8()
  {
    // A bare UTF-8 continuation byte (0x80) with no lead byte is ill-formed.
    Assert.Throws<TransportError>(() => MessageUnit.Decode(new byte[] { 0x80 }));
  }

  [Fact]
  public void Rejects_an_overlong_encoding_as_invalid_utf8()
  {
    // 0xc0 0x80 is an overlong (and thus illegal) encoding of U+0000.
    Assert.Throws<TransportError>(() => MessageUnit.Decode(new byte[] { 0xc0, 0x80 }));
  }

  [Fact]
  public void Rejects_a_unit_that_is_not_a_single_json_value()
  {
    var two = Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\"} {\"x\":1}");
    var error = Assert.Throws<TransportError>(() => MessageUnit.Decode(two));
    Assert.Contains("single JSON value", error.Message);
  }

  [Fact]
  public void Rejects_trailing_garbage_after_a_valid_value()
  {
    var trailing = Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"method\":\"x\"} garbage");
    Assert.Throws<TransportError>(() => MessageUnit.Decode(trailing));
  }

  [Fact]
  public void Rejects_a_unit_that_is_not_a_valid_jsonrpc_message()
  {
    var notRpc = Encoding.UTF8.GetBytes("{\"hello\":\"world\"}");
    var error = Assert.Throws<TransportError>(() => MessageUnit.Decode(notRpc));
    Assert.Contains("JSON-RPC", error.Message);
  }

  [Fact]
  public void Rejects_a_batch_array_as_an_invalid_message()
  {
    var batch = Encoding.UTF8.GetBytes("[{\"jsonrpc\":\"2.0\",\"method\":\"x\"}]");
    Assert.Throws<TransportError>(() => MessageUnit.Decode(batch));
  }

  [Fact]
  public void TryDecode_returns_the_message_on_success()
  {
    Assert.True(MessageUnit.TryDecode(MessageUnit.Encode(Notification()), out var message, out var error));
    Assert.IsType<JsonRpcNotification>(message);
    Assert.Null(error);
  }

  [Fact]
  public void Framer_name_is_newline()
  {
    Assert.Equal("newline", new NewlineFramer().Name);
  }
}
