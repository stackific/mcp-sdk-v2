using System.Text.Json.Nodes;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// S06 — Stateless Per-Request Model &amp; Cross-Call Continuity (spec §4.4–§4.7).
/// </summary>
/// <remarks>
/// <para>
/// Every request is self-describing via its own <c>_meta</c>; servers MUST NOT infer identity,
/// capabilities, or protocol version from any earlier request or from the underlying connection.
/// Cross-request continuity rides on explicit, server-minted, opaque identifiers that the client
/// echoes back verbatim.
/// </para>
/// <para>
/// This module introduces no new wire types. It exposes utilities for validating opaque
/// continuation identifiers (<see cref="ContinuationId"/>) plus documentation constants for the
/// stateless-model rules (<see cref="StatelessModel"/>) and the SHOULD-level behaviors deferred to
/// the transport layer (<see cref="DeferredToTransport"/>). Runtime enforcement of the
/// self-describing <c>_meta</c> envelope lives in <see cref="RequestMeta"/> (S05).
/// </para>
/// </remarks>
public static class ContinuationId
{
  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a JSON-serializable value that may serve
  /// as a continuation identifier (spec §4.5 / R-4.5-b). A continuation id must round-trip through
  /// JSON without loss.
  /// </summary>
  /// <remarks>
  /// In the TypeScript SDK the excluded forms are <c>undefined</c>, <c>function</c>, <c>symbol</c>,
  /// and <c>bigint</c>. In the .NET model the JSON value space is represented by
  /// <see cref="JsonNode"/> (objects, arrays, and <see cref="JsonValue"/> scalars) and the .NET
  /// <c>null</c> literal — which stands for the JSON <c>null</c> a server is permitted to mint.
  /// A non-JSON CLR object (anything that is neither a <see cref="JsonNode"/> nor a primitive the
  /// JSON value model admits) is rejected, mirroring the TypeScript exclusions.
  /// </remarks>
  /// <param name="value">The candidate continuation identifier.</param>
  /// <returns><c>true</c> when the value can serve as an opaque continuation id.</returns>
  public static bool IsValid(object? value)
  {
    // The JSON `null` literal is an admissible continuation id (R-4.5-b).
    if (value is null) return true;

    return value switch
    {
      // Any node from the JSON value model (objects, arrays, string/number/boolean scalars).
      JsonNode => true,
      // CLR primitives the JSON value model admits directly.
      string => true,
      bool => true,
      sbyte or byte or short or ushort or int or uint or long or ulong => true,
      float or double or decimal => true,
      // Everything else (delegates, arbitrary CLR objects) is not JSON-round-trippable here.
      _ => false,
    };
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a <em>string</em> continuation
  /// identifier — the most common form, e.g. pagination cursors and <c>requestState</c> tokens
  /// (spec §4.5 / R-4.5-c). Clients MUST NOT parse, decode, or alter a string continuation id.
  /// </summary>
  /// <param name="value">The candidate continuation identifier.</param>
  /// <returns><c>true</c> when the value is a CLR string (or a string-valued JSON node).</returns>
  public static bool IsString(object? value) => value switch
  {
    string => true,
    JsonValue v => v.TryGetValue<string>(out _),
    _ => false,
  };
}

/// <summary>
/// Documentation constants for the normative stateless-processing rules every S06-conformant
/// server must satisfy (spec §4.4–§4.6). Runtime enforcement lives in <see cref="RequestMeta"/>,
/// which ensures each request carries a self-describing <c>_meta</c>.
/// </summary>
public static class StatelessModel
{
  /// <summary>Server MUST NOT infer state from earlier requests, even on the same connection (R-4.4-a).</summary>
  public const string NoPriorRequestInference = "R-4.4-a";

  /// <summary>Server MUST NOT require any prior request before processing a given request (R-4.4-b).</summary>
  public const string NoHandshakeRequired = "R-4.4-b";

  /// <summary>Server MUST derive identity, capabilities, and version solely from the current <c>_meta</c> (R-4.4-c).</summary>
  public const string IdentityFromMetaOnly = "R-4.4-c";

  /// <summary>Server MUST NOT depend on persisted per-connection conversational state (R-4.4-d).</summary>
  public const string NoPerConnectionState = "R-4.4-d";

  /// <summary>Server MUST NOT treat connection/process identity as a proxy for conversation (R-4.4-f).</summary>
  public const string ConnectionNotConversation = "R-4.4-f";

  /// <summary>Cross-request state MUST be referenced by an explicit identifier, not connection identity (R-4.5-a).</summary>
  public const string ExplicitContinuationOnly = "R-4.5-a";

  /// <summary>List results MUST NOT vary based on connection identity (R-4.6-a).</summary>
  public const string ListResultsConnectionIndependent = "R-4.6-a";
}

/// <summary>
/// Documentation constants for stateless-model behaviors that are RECOMMENDED (SHOULD) at the
/// transport layer and cannot be enforced by this library (spec §4.4). These identifiers track
/// which spec references have been consciously deferred; the HTTP/SSE transports SHOULD satisfy
/// them using transport-specific mechanisms.
/// </summary>
public static class DeferredToTransport
{
  /// <summary>
  /// Transports SHOULD support interleaved task streams so unrelated requests on the same
  /// connection do not head-of-line block (R-4.4-h). Deferred to the HTTP / SSE transports.
  /// </summary>
  public const string InterleavedTaskStreams = "R-4.4-h";

  /// <summary>
  /// Transports SHOULD NOT require connection reuse between requests in the same logical
  /// conversation (R-4.4-i). Deferred to the HTTP / SSE transports.
  /// </summary>
  public const string NoConnectionReuseRequirement = "R-4.4-i";

  /// <summary>
  /// Transports SHOULD support mid-task resume on a new connection by accepting a continuation
  /// identifier from a prior connection's response (R-4.4-j). Deferred to the HTTP / SSE transports.
  /// </summary>
  public const string MidTaskResumeOnNewConnection = "R-4.4-j";

  /// <summary>The three deferred-to-transport rule ids, in spec order.</summary>
  public static IReadOnlyList<string> All { get; } =
    [InterleavedTaskStreams, NoConnectionReuseRequirement, MidTaskResumeOnNewConnection];
}

/// <summary>
/// Feature lifecycle status (spec §27, R-1.3-b, R-2.2-f – R-2.2-h). A feature whose status is
/// <see cref="Deprecated"/> remains defined and MUST still be accepted by receivers, but SHOULD
/// NOT be relied upon by new implementations.
/// </summary>
public enum FeatureStatus
{
  /// <summary>The feature is current and may be relied upon.</summary>
  Active,

  /// <summary>The feature is deprecated: still accepted by receivers, but discouraged for new use.</summary>
  Deprecated,
}
