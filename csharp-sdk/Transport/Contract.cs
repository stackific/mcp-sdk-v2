using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Transport;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S12 — Transport contract, directionality, and statelessness (§7.1–§7.6).
//
// The core protocol rides unchanged on whichever transport carries it: a transport frames, delivers,
// and tears down bytes but never interprets a method, params, or result. This file defines the
// low-level byte-channel contract (distinct from the higher-level request/response
// <see cref="ClientTransport"/> RPC abstraction in this same namespace):
//
//   • <see cref="IByteChannelTransport"/> — the abstract bidirectional-channel contract (§7.1) plus the
//     observable clean-close / disconnection surface (§7.2 clean close, §7.5).
//   • <see cref="TransportError"/> — a channel-level failure, kept distinct from a JSON-RPC error
//     response (which is a normal, fully delivered protocol message; §7.5).
//   • Directionality helpers (§7.4): which JSON-RPC kinds may travel which way.
//   • Statelessness helpers (§7.6 / §7.4): every request carries its _meta envelope regardless of
//     transport, and a server derives context from that envelope — never from the connection.
//   • Documentation constants enumerating the §7.2 guarantees, §7.3 custom-transport obligations, the
//     stdio disconnection policy, and the §7.6 statelessness rules.
//
// No new wire types are introduced; the message union is S03's <see cref="JsonRpcMessage"/>.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/// <summary>
/// A failure of the transport channel itself — distinct from a JSON-RPC error response (spec §7.5).
/// </summary>
/// <remarks>
/// <para>
/// A JSON-RPC error response (an <c>error</c> object inside a delivered message) is a normal, fully
/// delivered protocol message reporting that a request failed at the protocol/application layer. A
/// <see cref="TransportError"/> instead signals that the <em>channel</em> could not carry a message,
/// that a received unit was malformed at the encoding/framing level, or that the connection was lost —
/// i.e. an observable transport-level failure (R-7.2-q, R-7.2-r, R-7.5-i, R-7.5-j, R-7.6-b).
/// </para>
/// <para>
/// This is the C# counterpart of the TypeScript <c>TransportError</c>; it carries the same stable,
/// machine-readable <see cref="Code"/> (<c>"TRANSPORT_ERROR"</c>) so callers can branch on a channel
/// failure programmatically without inspecting the message text.
/// </para>
/// </remarks>
public sealed class TransportError : Exception
{
  /// <summary>The stable, machine-readable code for a transport-level failure.</summary>
  public const string TransportErrorCode = "TRANSPORT_ERROR";

  /// <summary>The stable code for programmatic handling; always <see cref="TransportErrorCode"/>.</summary>
  public string Code => TransportErrorCode;

  /// <summary>Creates a transport-level failure with a human-readable description.</summary>
  /// <param name="message">A short explanation of the channel failure.</param>
  public TransportError(string message) : base(message) { }

  /// <summary>Creates a transport-level failure wrapping an underlying cause.</summary>
  /// <param name="message">A short explanation of the channel failure.</param>
  /// <param name="innerException">The underlying cause (for example a UTF-8 or JSON decode exception).</param>
  public TransportError(string message, Exception? innerException) : base(message, innerException) { }
}

/// <summary>
/// Why a transport channel became unusable, surfaced to <c>OnClose</c> handlers (spec §7.2/§7.5).
/// </summary>
/// <remarks>
/// <see cref="Clean"/> <c>true</c> is an orderly shutdown each side had the opportunity to observe
/// (R-7.2-t). <see cref="Clean"/> <c>false</c> is an abrupt disconnection — the channel dropped without
/// an orderly close — which a transport MUST still make observable (R-7.5-a, R-7.5-b).
/// </remarks>
/// <param name="Clean"><c>true</c> for an orderly close; <c>false</c> for an abrupt disconnection.</param>
/// <param name="Reason">An optional human-readable explanation, or <c>null</c>.</param>
public readonly record struct TransportCloseInfo(bool Clean, string? Reason = null);

/// <summary>
/// The abstract byte-channel transport contract every defined or custom transport satisfies (spec
/// §7.1, §7.2).
/// </summary>
/// <remarks>
/// <para>
/// An <see cref="IByteChannelTransport"/> is a bidirectional channel that carries the
/// <see cref="JsonRpcMessage"/> union as complete UTF-8 JSON values, preserves integrity, delivers in
/// both directions, never silently drops a message, and defines an observable clean close and an
/// observable abrupt disconnection.
/// </para>
/// <para>
/// A transport does NOT interpret method/params/result or perform capability or version negotiation;
/// those are core-protocol concerns carried unchanged. This is the C# counterpart of the TypeScript
/// <c>Transport</c> interface. It is deliberately named distinctly from the higher-level
/// request/response <see cref="ClientTransport"/> so the two coexist: <see cref="ClientTransport"/> is
/// an RPC abstraction (send a request, await its response); this is the lower-level observable byte
/// channel the stdio and in-memory reference transports implement.
/// </para>
/// <para>
/// Handler registration methods return an <see cref="IDisposable"/> whose disposal unsubscribes the
/// handler — the idiomatic C# analogue of the TypeScript <c>Unsubscribe</c> function.
/// </para>
/// </remarks>
public interface IByteChannelTransport
{
  /// <summary>
  /// Sends one message over the channel. MUST NOT silently drop it: on a closed or failed channel this
  /// MUST surface an observable failure (throw a <see cref="TransportError"/>) rather than discarding
  /// the message (R-7.2-q, R-7.2-s, R-7.5-i, R-7.5-j).
  /// </summary>
  /// <param name="message">The message to send.</param>
  /// <exception cref="TransportError">When the channel is closed, has no writable side, or rejects the message's direction.</exception>
  void Send(JsonRpcMessage message);

  /// <summary>Registers a handler for each inbound message. Returns a token whose disposal unsubscribes it.</summary>
  /// <param name="handler">Invoked once per inbound message.</param>
  /// <returns>An <see cref="IDisposable"/> that unsubscribes <paramref name="handler"/> when disposed.</returns>
  IDisposable OnMessage(Action<JsonRpcMessage> handler);

  /// <summary>
  /// Registers a handler for <em>receiver-side</em> transport/parse-level errors — for example an
  /// inbound unit that is not well-formed UTF-8 or not a single JSON value (R-7.6-b, R-7.6-c). These
  /// surface on the side that <em>received</em> the bad unit, as an observable failure, rather than
  /// being silently dropped or thrown back into an unrelated sender's <see cref="Send"/> (R-7.5-j).
  /// </summary>
  /// <param name="handler">Invoked once per receiver-side decode error.</param>
  /// <returns>An <see cref="IDisposable"/> that unsubscribes <paramref name="handler"/> when disposed.</returns>
  /// <remarks>
  /// This is distinct from a JSON-RPC error response (a normal, fully delivered message) and from a send
  /// failure (surfaced synchronously by <see cref="Send"/>).
  /// </remarks>
  IDisposable OnError(Action<TransportError> handler);

  /// <summary>
  /// Registers a handler invoked once when the channel becomes unusable — by a clean close or an abrupt
  /// disconnection (R-7.2-t, R-7.5-a). A handler registered after the channel already closed still
  /// observes the close exactly once.
  /// </summary>
  /// <param name="handler">Invoked once with the close information.</param>
  /// <returns>An <see cref="IDisposable"/> that unsubscribes <paramref name="handler"/> when disposed.</returns>
  IDisposable OnClose(Action<TransportCloseInfo> handler);

  /// <summary>Initiates an orderly (clean) close that each side can observe (R-7.2-t).</summary>
  /// <param name="reason">An optional human-readable reason recorded on the close info.</param>
  /// <returns>A task that completes once the close has been initiated and observed.</returns>
  Task CloseAsync(string? reason = null);

  /// <summary><c>true</c> once the channel has been closed or disconnected.</summary>
  bool Closed { get; }
}

/// <summary>The two directions a message may travel at the JSON-RPC layer (spec §7.4).</summary>
public enum MessageDirection
{
  /// <summary>A client sending to a server.</summary>
  ClientToServer,

  /// <summary>A server sending to a client.</summary>
  ServerToClient,
}

/// <summary>
/// The structural kind of a message, as used by directionality enforcement (spec §7.4). Both response
/// forms (success and error) share the same directionality, so they collapse to a single value.
/// </summary>
public enum DirectionalKind
{
  /// <summary>A request — travels client→server only.</summary>
  Request,

  /// <summary>A notification — travels either direction.</summary>
  Notification,

  /// <summary>A response (success or error) — travels server→client only.</summary>
  Response,
}

/// <summary>
/// Transport-contract helpers: directionality (§7.4) and the per-request statelessness model (§7.4,
/// §7.6). The C# counterpart of the free functions in the TypeScript <c>transport/contract.ts</c>.
/// </summary>
public static class TransportContract
{
  /// <summary>
  /// Maps a <see cref="JsonRpcMessage"/> to its <see cref="DirectionalKind"/> for directionality
  /// enforcement. Because the message is already a classified record, this is a pure pattern match —
  /// the C# analogue of running TypeScript's <c>classifyMessage</c> then collapsing the two response
  /// kinds.
  /// </summary>
  /// <param name="message">The classified message.</param>
  /// <returns>The directionality kind.</returns>
  /// <exception cref="ArgumentOutOfRangeException">For an unrecognized message subtype.</exception>
  public static DirectionalKind KindOf(JsonRpcMessage message)
  {
    ArgumentNullException.ThrowIfNull(message);
    return message switch
    {
      JsonRpcRequest => DirectionalKind.Request,
      JsonRpcNotification => DirectionalKind.Notification,
      JsonRpcSuccessResponse => DirectionalKind.Response,
      JsonRpcErrorResponse => DirectionalKind.Response,
      _ => throw new ArgumentOutOfRangeException(nameof(message), "Unknown JSON-RPC message kind."),
    };
  }

  /// <summary>
  /// Returns <c>true</c> when a message of <paramref name="kind"/> may travel in
  /// <paramref name="direction"/> (spec §7.4). Mirrors TypeScript <c>isDirectionPermitted</c>.
  /// </summary>
  /// <remarks>
  /// Permitted directions (R-7.4-b, R-7.4-c, and the informative rule that servers never initiate
  /// requests and clients never send responses):
  /// <list type="bullet">
  /// <item><description><see cref="DirectionalKind.Request"/> → client→server only.</description></item>
  /// <item><description><see cref="DirectionalKind.Response"/> → server→client only.</description></item>
  /// <item><description><see cref="DirectionalKind.Notification"/> → either direction.</description></item>
  /// </list>
  /// </remarks>
  /// <param name="kind">The message kind.</param>
  /// <param name="direction">The direction of travel.</param>
  /// <returns><c>true</c> when the combination is permitted.</returns>
  public static bool IsDirectionPermitted(DirectionalKind kind, MessageDirection direction) => kind switch
  {
    DirectionalKind.Request => direction == MessageDirection.ClientToServer,
    DirectionalKind.Response => direction == MessageDirection.ServerToClient,
    DirectionalKind.Notification => true,
    _ => false,
  };

  /// <summary>
  /// Returns <c>true</c> when a request carries the inline <c>_meta</c> envelope with the three reserved
  /// <c>io.modelcontextprotocol/*</c> keys (spec §7.4; R-7.4-d, R-7.4-f). Mirrors TypeScript
  /// <c>requestCarriesMetaEnvelope</c>.
  /// </summary>
  /// <remarks>
  /// The inline envelope is REQUIRED regardless of transport; the message body is the source of truth. A
  /// transport MAY additionally mirror these fields into transport-level metadata (see
  /// <see cref="ExtractEnvelopeForMirroring"/>), but that mirror is never a substitute for the inline
  /// envelope.
  /// </remarks>
  /// <param name="request">The candidate request message.</param>
  /// <returns><c>true</c> when a valid three-key envelope is present on <c>params._meta</c>.</returns>
  public static bool RequestCarriesMetaEnvelope(JsonRpcMessage? request) =>
    DeriveRequestContext(request) is not null;

  /// <summary>
  /// Derives the per-request context (protocol version, client identity, client capabilities)
  /// <em>solely from the request's own <c>_meta</c></em>, never from the connection or any prior request
  /// (spec §7.6; R-7.6-e, R-7.6-f). Mirrors TypeScript <c>deriveRequestContext</c>.
  /// </summary>
  /// <remarks>
  /// Returns <c>null</c> when the message is not a request, or does not carry a valid envelope; the
  /// server then has no basis to process it (and MUST NOT infer one from earlier requests). Two requests
  /// on the same connection with different envelopes yield two independent contexts — the connection
  /// contributes nothing.
  /// </remarks>
  /// <param name="request">The candidate request message.</param>
  /// <returns>The derived context, or <c>null</c> when no valid envelope is present.</returns>
  public static RequestContext? DeriveRequestContext(JsonRpcMessage? request)
  {
    if (request is not JsonRpcRequest typed) return null;
    return DeriveRequestContext(typed.Params);
  }

  /// <summary>
  /// Derives the per-request context from a request's raw <c>params</c> object (spec §7.6). A convenience
  /// overload for callers that hold the params directly rather than a classified message.
  /// </summary>
  /// <param name="paramsObject">The request's <c>params</c> object, or <c>null</c>.</param>
  /// <returns>The derived context, or <c>null</c> when no valid envelope is present.</returns>
  public static RequestContext? DeriveRequestContext(JsonObject? paramsObject)
  {
    if (paramsObject is null || paramsObject["_meta"] is not JsonObject meta) return null;

    // The same three-key, body-is-truth check the TS validateRequestMeta performs: a well-formed
    // protocol-revision string plus client identity + client capabilities objects. We re-derive it here
    // (rather than reaching into Protocol/*) so the transport-contract layer is self-contained.
    if (meta[MetaKeys.ProtocolVersion] is not JsonValue versionValue ||
        versionValue.GetValueKind() != JsonValueKind.String)
    {
      return null;
    }
    if (meta[MetaKeys.ClientInfo] is not JsonObject) return null;
    if (meta[MetaKeys.ClientCapabilities] is not JsonObject) return null;

    return new RequestContext(
      versionValue.GetValue<string>(),
      meta[MetaKeys.ClientInfo]!.DeepClone(),
      meta[MetaKeys.ClientCapabilities]!.DeepClone());
  }

  /// <summary>
  /// Extracts the envelope fields a transport MAY mirror into transport-level metadata for
  /// routing/inspection (for example HTTP headers; see S14/S15) (spec §7.4; R-7.4-e). Mirrors
  /// TypeScript <c>extractEnvelopeForMirroring</c>.
  /// </summary>
  /// <remarks>
  /// The returned values are read <em>from the message body</em>, which remains the authoritative source
  /// of truth — the mirror is a derived copy, never an alternative input. Returns <c>null</c> when the
  /// body carries no valid envelope, so a transport never mirrors fabricated values.
  /// </remarks>
  /// <param name="request">The candidate request message.</param>
  /// <returns>The mirrorable context, or <c>null</c>.</returns>
  public static RequestContext? ExtractEnvelopeForMirroring(JsonRpcMessage? request) =>
    DeriveRequestContext(request);
}

/// <summary>
/// The per-request context a server derives <em>solely</em> from a request's <c>_meta</c> (spec §7.6).
/// </summary>
/// <param name="ProtocolVersion">The <c>io.modelcontextprotocol/protocolVersion</c> for this request.</param>
/// <param name="ClientInfo">The <c>io.modelcontextprotocol/clientInfo</c> for this request (a JSON node clone).</param>
/// <param name="ClientCapabilities">The <c>io.modelcontextprotocol/clientCapabilities</c> for this request (a JSON node clone).</param>
public sealed record RequestContext(string ProtocolVersion, JsonNode ClientInfo, JsonNode ClientCapabilities);

/// <summary>
/// Documentation-constant anchors mapping the §7 transport guarantees, custom-transport obligations,
/// stdio disconnection policy, and statelessness rules to their normative atoms. The C# counterpart of
/// the TypeScript <c>TRANSPORT_GUARANTEES</c> / <c>CUSTOM_TRANSPORT_OBLIGATIONS</c> /
/// <c>STDIO_DISCONNECT_POLICY</c> / <c>STATELESS_TRANSPORT_RULES</c> maps.
/// </summary>
/// <remarks>
/// These are part of the public surface for traceability; the runtime enforcement lives in
/// <see cref="MessageUnit"/> (framing, UTF-8, integrity), <see cref="RequestCorrelator"/>
/// (id-correlation, multiplexing, ordering, disconnection), and a conforming
/// <see cref="IByteChannelTransport"/> (no silent loss, clean close).
/// </remarks>
public static class TransportGuarantees
{
  /// <summary>Unambiguous, body-independent message framing (R-7.2-b, R-7.2-c, R-7.2-d).</summary>
  public static IReadOnlyList<string> Framing { get; } = ["R-7.2-b", "R-7.2-c", "R-7.2-d"];

  /// <summary>Response↔request association by <c>id</c> only (R-7.2-e, R-7.2-f, R-7.2-g, R-7.2-o).</summary>
  public static IReadOnlyList<string> AssociationById { get; } = ["R-7.2-e", "R-7.2-f", "R-7.2-g", "R-7.2-o"];

  /// <summary>Multiplexing of concurrent outstanding requests (R-7.2-i – R-7.2-l).</summary>
  public static IReadOnlyList<string> Multiplexing { get; } = ["R-7.2-i", "R-7.2-j", "R-7.2-k", "R-7.2-l"];

  /// <summary>Response-ordering independence (R-7.2-m, R-7.2-n, R-7.2-p).</summary>
  public static IReadOnlyList<string> Ordering { get; } = ["R-7.2-m", "R-7.2-n", "R-7.2-p"];

  /// <summary>No silent loss (R-7.2-q, R-7.2-r, R-7.2-s).</summary>
  public static IReadOnlyList<string> NoSilentLoss { get; } = ["R-7.2-q", "R-7.2-r", "R-7.2-s"];

  /// <summary>Clean, observable shutdown/close (R-7.2-t).</summary>
  public static IReadOnlyList<string> CleanClose { get; } = ["R-7.2-t"];
}

/// <summary>
/// The obligations on a custom transport (spec §7.3). Mirrors TypeScript
/// <c>CUSTOM_TRANSPORT_OBLIGATIONS</c>.
/// </summary>
public static class CustomTransportObligations
{
  /// <summary>A custom transport MAY exist (R-7.3-a).</summary>
  public const string MayImplement = "R-7.3-a";

  /// <summary>It MUST preserve the JSON-RPC format, exchange patterns, and per-request metadata model (R-7.3-b).</summary>
  public const string PreserveFormatPatternsMetadata = "R-7.3-b";

  /// <summary>It MUST uphold every §7.2 guarantee (R-7.3-c).</summary>
  public const string UpholdAllGuarantees = "R-7.3-c";

  /// <summary>It SHOULD document its connection establishment / framing / cancellation (R-7.3-d).</summary>
  public const string ShouldDocument = "R-7.3-d";

  /// <summary>It SHOULD reuse the stdio newline framing over a reliable byte stream (R-7.3-e).</summary>
  public const string ShouldReuseStdioFraming = "R-7.3-e";
}

/// <summary>
/// Stdio-specific disconnection policy referenced by §7.5 and realized by S13 (spec §8). Mirrors
/// TypeScript <c>STDIO_DISCONNECT_POLICY</c>.
/// </summary>
public static class StdioDisconnectPolicy
{
  /// <summary>If the server subprocess exits unexpectedly the client SHOULD restart it (R-7.5-g).</summary>
  public const string ShouldRestartOnUnexpectedExit = "R-7.5-g";

  /// <summary>In-flight requests lost on that exit MAY be retried against the fresh process (R-7.5-h).</summary>
  public const string MayRetryInflightOnFreshProcess = "R-7.5-h";
}

/// <summary>
/// The statelessness rules a transport and the server above it MUST honor (spec §7.6). Mirrors
/// TypeScript <c>STATELESS_TRANSPORT_RULES</c>.
/// </summary>
public static class StatelessTransportRules
{
  /// <summary>A single connection MUST NOT be required to carry conversational state (R-7.6-d).</summary>
  public const string NoConnectionScopedState = "R-7.6-d";

  /// <summary>A server MUST NOT infer state from prior requests (R-7.6-e).</summary>
  public const string NoPriorRequestInference = "R-7.6-e";

  /// <summary>Context derives from the current request's <c>_meta</c> only (R-7.6-f).</summary>
  public const string ContextFromMetaOnly = "R-7.6-f";

  /// <summary>A server SHOULD NOT require connection reuse (R-7.6-g).</summary>
  public const string ShouldNotRequireConnectionReuse = "R-7.6-g";

  /// <summary>A client MAY interleave unrelated requests (R-7.6-h).</summary>
  public const string MayInterleaveUnrelated = "R-7.6-h";

  /// <summary>Connection identity MUST NOT proxy for conversation (R-7.6-i).</summary>
  public const string ConnectionNotConversation = "R-7.6-i";

  /// <summary>Cross-request state MUST be referenced by an explicit client-supplied identifier (R-7.6-j).</summary>
  public const string ExplicitContinuationIdentifier = "R-7.6-j";
}
