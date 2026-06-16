using System.Buffers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Transport;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S12 — Transport framing, UTF-8 decoding, and integrity (§7.1, §7.2, §7.6).
//
// A transport carries each <see cref="JsonRpcMessage"/> as a single complete UTF-8 JSON value
// (R-7.1-b) and MUST define an unambiguous, body-independent way to find the byte boundaries of one
// message (R-7.2-b – R-7.2-d). This file provides:
//
//   • <see cref="IMessageFramer"/> / <see cref="IFrameDecoder"/> — the abstract framing contract:
//     encode a message to a delimited byte unit, and split a byte stream back into units using the
//     framing alone, without parsing the JSON body (R-7.2-c).
//   • <see cref="NewlineFramer"/> — newline-delimited JSON over a byte stream. This is the framing a
//     custom transport over a reliable byte stream SHOULD reuse rather than inventing its own
//     (R-7.3-e); the stdio transport (S13) layers process lifecycle on top of exactly this framing.
//   • <see cref="MessageUnit.Decode"/> / <see cref="MessageUnit.TryDecode"/> — turn one framed unit's
//     bytes back into a <see cref="JsonRpcMessage"/>, rejecting (never silently substituting/dropping)
//     any unit that is not well-formed UTF-8 or does not parse as a single JSON value (R-7.1-b,
//     R-7.6-a – R-7.6-c). The fatal UTF-8 enforcement is the C# counterpart of the TypeScript
//     <c>new TextDecoder('utf-8', { fatal: true })</c>: invalid bytes throw, never substitute U+FFFD.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Splits a byte stream back into the byte boundaries of individual messages, using framing alone —
/// the decoder MUST NOT parse the JSON body to find where one message ends and the next begins (spec
/// §7.2; R-7.2-b, R-7.2-c, R-7.2-d).
/// </summary>
/// <remarks>
/// A decoder is stateful: it buffers bytes that do not yet form a complete unit and emits each complete
/// unit as soon as its delimiter arrives. The C# counterpart of the TypeScript <c>FrameDecoder</c>.
/// </remarks>
public interface IFrameDecoder
{
  /// <summary>
  /// Feeds a chunk of received bytes and returns every complete message unit now available (framing
  /// removed). Incomplete trailing bytes are retained, never dropped (R-7.2-q).
  /// </summary>
  /// <param name="chunk">The newly received bytes.</param>
  /// <returns>The complete units recovered from this and any buffered bytes, in order.</returns>
  IReadOnlyList<byte[]> Push(ReadOnlySpan<byte> chunk);

  /// <summary>The number of buffered bytes not yet forming a complete unit (never dropped).</summary>
  int Pending { get; }

  /// <summary>A copy of the buffered, not-yet-complete bytes.</summary>
  /// <returns>A fresh array of the retained partial-frame bytes.</returns>
  byte[] Remainder();
}

/// <summary>
/// Encodes messages to delimited byte units and produces decoders that recover them. An
/// <see cref="IMessageFramer"/> is the §7.2 framing guarantee made concrete. The C# counterpart of the
/// TypeScript <c>MessageFramer</c>.
/// </summary>
public interface IMessageFramer
{
  /// <summary>A short identifier for the framing (useful when documenting a transport).</summary>
  string Name { get; }

  /// <summary>Encodes a message to one self-delimited byte unit.</summary>
  /// <param name="message">The message to encode.</param>
  /// <returns>The framed bytes.</returns>
  byte[] Encode(JsonRpcMessage message);

  /// <summary>Creates a fresh stateful decoder for one inbound byte stream.</summary>
  /// <returns>A new decoder with no buffered bytes.</returns>
  IFrameDecoder CreateDecoder();
}

/// <summary>
/// Decoding one framed unit's bytes back into a <see cref="JsonRpcMessage"/>, with fatal UTF-8 and
/// single-JSON-value enforcement (spec §7.1, §7.6). The C# counterpart of the TypeScript
/// <c>decodeMessageUnit</c> / <c>tryDecodeMessageUnit</c> / <c>encodeMessageUnit</c> functions.
/// </summary>
public static class MessageUnit
{
  /// <summary>The newline byte (<c>\n</c>, U+000A) used by <see cref="NewlineFramer"/> as the delimiter.</summary>
  public const byte NewlineByte = 0x0a;

  /// <summary>
  /// A strict UTF-8 decoder that THROWS a <see cref="DecoderFallbackException"/> on any ill-formed byte
  /// sequence instead of inserting the U+FFFD replacement character (R-7.6-c). This is the C# analogue
  /// of <c>new TextDecoder('utf-8', { fatal: true })</c>.
  /// </summary>
  /// <remarks>
  /// <see cref="UTF8Encoding"/> constructed with <c>throwOnInvalidBytes: true</c> installs the
  /// exception-throwing decoder fallback; a shared, read-only instance is safe to reuse across threads
  /// because decoding does not mutate the encoding.
  /// </remarks>
  private static readonly UTF8Encoding StrictUtf8 = new(false, throwOnInvalidBytes: true);

  /// <summary>
  /// Encodes a <see cref="JsonRpcMessage"/> to its UTF-8 JSON bytes, <em>without</em> any framing (spec
  /// §7.2). Mirrors TypeScript <c>encodeMessageUnit</c>.
  /// </summary>
  /// <remarks>
  /// The serializer escapes any embedded newline inside a string as the two-character sequence
  /// <c>\n</c>, so the produced bytes never contain a raw <c>0x0a</c> — which is what makes newline
  /// framing unambiguous (R-7.2-d).
  /// </remarks>
  /// <param name="message">The message to encode.</param>
  /// <returns>The framing-less UTF-8 JSON bytes.</returns>
  public static byte[] Encode(JsonRpcMessage message)
  {
    ArgumentNullException.ThrowIfNull(message);
    var json = JsonRpcMessageSerializer.Serialize(message);
    return Encoding.UTF8.GetBytes(json);
  }

  /// <summary>
  /// Decodes one framed unit's bytes (framing already removed) into a <see cref="JsonRpcMessage"/> (spec
  /// §7.1, §7.6). Mirrors TypeScript <c>decodeMessageUnit</c>.
  /// </summary>
  /// <remarks>
  /// Enforces, in order:
  /// <list type="number">
  /// <item><description><b>UTF-8.</b> The bytes MUST be well-formed UTF-8; an invalid unit is rejected
  /// with a <see cref="TransportError"/>, never silently substituted (R-7.6-a, R-7.6-b, R-7.6-c).</description></item>
  /// <item><description><b>Single JSON value.</b> The text MUST parse as exactly one JSON value; trailing
  /// or multiple values are rejected (R-7.1-b, R-7.6-b).</description></item>
  /// <item><description><b>Well-formed message.</b> The value MUST classify as one of the three
  /// <see cref="JsonRpcMessage"/> kinds; otherwise rejected.</description></item>
  /// </list>
  /// The method never returns a substituted or partial message — every failure is an observable throw
  /// (R-7.2-q, R-7.6-c).
  /// </remarks>
  /// <param name="bytes">The framed unit's bytes (delimiter already stripped).</param>
  /// <returns>The classified message.</returns>
  /// <exception cref="TransportError">When the unit is not well-formed UTF-8, not a single JSON value, or not a valid JSON-RPC message.</exception>
  public static JsonRpcMessage Decode(ReadOnlySpan<byte> bytes)
  {
    // 1) UTF-8 (fatal). The strict decoder throws on any ill-formed sequence, so a non-UTF-8 unit is
    //    rejected here rather than silently corrupted with replacement characters.
    string text;
    try
    {
      text = StrictUtf8.GetString(bytes);
    }
    catch (DecoderFallbackException cause)
    {
      throw new TransportError("received unit is not well-formed UTF-8", cause);
    }

    // 2) Single JSON value. A Utf8JsonReader over the decoded text accepts exactly one top-level value
    //    and rejects trailing content (for example "{...} {...}"), matching JSON.parse's single-value
    //    contract. JsonNode.Parse alone tolerates trailing whitespace but not trailing values; we still
    //    validate explicitly so two concatenated objects are an error, not a silently truncated read.
    JsonNode? node;
    try
    {
      node = ParseSingleJsonValue(text);
    }
    catch (JsonException cause)
    {
      throw new TransportError("received unit does not parse as a single JSON value", cause);
    }

    // 3) Well-formed JSON-RPC message. The serializer's classifier throws McpError for a structurally
    //    invalid message; surface it as a transport-level decode failure.
    try
    {
      return JsonRpcMessageSerializer.FromNode(node);
    }
    catch (McpError cause)
    {
      throw new TransportError($"received unit is not a valid JSON-RPC message: {cause.Message}", cause);
    }
  }

  /// <summary>
  /// Non-throwing variant of <see cref="Decode"/>: returns <c>false</c> with the
  /// <see cref="TransportError"/> in <paramref name="error"/> instead of throwing (spec §7.6). Mirrors
  /// TypeScript <c>tryDecodeMessageUnit</c>.
  /// </summary>
  /// <remarks>
  /// The failure is still observable (it is returned, not swallowed) so the no-silent-drop rule
  /// (R-7.6-c) holds.
  /// </remarks>
  /// <param name="bytes">The framed unit's bytes.</param>
  /// <param name="message">On success, the decoded message; otherwise <c>null</c>.</param>
  /// <param name="error">On failure, the decode error; otherwise <c>null</c>.</param>
  /// <returns><c>true</c> when the unit decoded successfully.</returns>
  public static bool TryDecode(ReadOnlySpan<byte> bytes, out JsonRpcMessage? message, out TransportError? error)
  {
    try
    {
      message = Decode(bytes);
      error = null;
      return true;
    }
    catch (TransportError failure)
    {
      message = null;
      error = failure;
      return false;
    }
  }

  /// <summary>
  /// Parses <paramref name="text"/> as exactly one JSON value, rejecting any trailing content beyond
  /// optional whitespace. Distinguishes "two values" from "one value" without parsing semantics.
  /// </summary>
  /// <param name="text">The decoded UTF-8 text.</param>
  /// <returns>The single parsed JSON node.</returns>
  /// <exception cref="JsonException">When the text is not valid JSON or carries more than one value.</exception>
  private static JsonNode? ParseSingleJsonValue(string text)
  {
    // First, structurally validate that the text contains exactly one JSON value. Utf8JsonReader reads
    // tokens lazily; after consuming a single top-level value, any remaining non-whitespace token means
    // the unit carried more than one value, which we must reject (R-7.1-b).
    var bytes = Encoding.UTF8.GetBytes(text);
    var reader = new Utf8JsonReader(bytes, new JsonReaderOptions
    {
      CommentHandling = JsonCommentHandling.Disallow,
      AllowTrailingCommas = false,
    });

    if (!reader.Read())
    {
      throw new JsonException("Empty input is not a JSON value.");
    }
    reader.Skip(); // consume the entire first value (object/array subtree or scalar)
    if (reader.Read())
    {
      throw new JsonException("Input carried more than one top-level JSON value.");
    }

    // The text is a single JSON value; materialize it as a node for classification.
    return JsonNode.Parse(text, nodeOptions: null, documentOptions: new JsonDocumentOptions
    {
      CommentHandling = JsonCommentHandling.Disallow,
      AllowTrailingCommas = false,
    });
  }
}

/// <summary>
/// A stateful newline-delimited frame decoder: buffers partial frames across <see cref="Push"/> calls
/// and emits each complete unit as soon as its <c>\n</c> delimiter arrives (spec §7.2). The C#
/// counterpart of the TypeScript <c>NewlineFrameDecoder</c>.
/// </summary>
/// <remarks>This type is not thread-safe; a single inbound byte stream feeds a single decoder.</remarks>
public sealed class NewlineFrameDecoder : IFrameDecoder
{
  private readonly ArrayBufferWriter<byte> _buffer = new();

  /// <inheritdoc/>
  public IReadOnlyList<byte[]> Push(ReadOnlySpan<byte> chunk)
  {
    _buffer.Write(chunk);
    var units = new List<byte[]>();

    var buffered = _buffer.WrittenSpan;
    var start = 0;
    for (var i = 0; i < buffered.Length; i++)
    {
      // Boundaries are found by scanning for the delimiter byte only — the JSON body is never parsed to
      // locate them (R-7.2-c). UTF-8 multi-byte sequences never contain a 0x0a byte, so this scan is
      // unambiguous (a continuation byte is always >= 0x80).
      if (buffered[i] == MessageUnit.NewlineByte)
      {
        units.Add(buffered[start..i].ToArray());
        start = i + 1;
      }
    }

    // Retain any bytes after the last delimiter — never dropped (R-7.2-q). Rebuild the buffer with just
    // the unconsumed tail.
    var remainder = buffered[start..].ToArray();
    _buffer.Clear();
    _buffer.Write(remainder);
    return units;
  }

  /// <inheritdoc/>
  public int Pending => _buffer.WrittenCount;

  /// <inheritdoc/>
  public byte[] Remainder() => _buffer.WrittenSpan.ToArray();
}

/// <summary>
/// Newline-delimited JSON-RPC framing over a byte stream (spec §7.2, §7.3, §8 framing). The C#
/// counterpart of the TypeScript <c>NewlineFramer</c>.
/// </summary>
/// <remarks>
/// Each message is its UTF-8 JSON serialization followed by a single <c>\n</c>. A receiver recovers
/// messages by splitting on <c>\n</c> without parsing the body (R-7.2-c, R-7.2-d). This is the framing
/// a custom transport over a reliable bidirectional byte stream (Unix socket, TCP) SHOULD reuse rather
/// than defining a new one (R-7.3-e); the stdio transport (S13) is this framing plus process-lifecycle
/// rules.
/// </remarks>
public sealed class NewlineFramer : IMessageFramer
{
  /// <inheritdoc/>
  public string Name => "newline";

  /// <inheritdoc/>
  public byte[] Encode(JsonRpcMessage message)
  {
    var body = MessageUnit.Encode(message);
    var framed = new byte[body.Length + 1];
    Array.Copy(body, framed, body.Length);
    framed[body.Length] = MessageUnit.NewlineByte;
    return framed;
  }

  /// <inheritdoc/>
  public IFrameDecoder CreateDecoder() => new NewlineFrameDecoder();
}
