using System.Globalization;

namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// Thrown when a received message is structurally malformed and must be rejected (spec §3.1).
/// </summary>
/// <remarks>
/// <para>
/// This is the foundation-layer analogue of the TypeScript <c>MalformedMessageError</c>. It
/// carries a stable, machine-readable <see cref="Code"/> (<c>"MALFORMED_MESSAGE"</c>) so callers
/// can branch on the rejection programmatically without depending on a numeric JSON-RPC code.
/// </para>
/// <para>
/// Per R-3.4-f, malformed notifications are silently discarded — callers MUST decide, based on
/// the message kind, whether to surface this error toward the sender or to drop it. The runtime
/// transport layer maps wire-level framing failures to <see cref="McpError"/> (with codes
/// −32600 / −32700); this type exists for the portable, kind-agnostic classification surface.
/// </para>
/// </remarks>
public sealed class MalformedMessageError : Exception
{
  /// <summary>The stable, machine-readable code for a malformed-message rejection.</summary>
  public const string MalformedMessageCode = "MALFORMED_MESSAGE";

  /// <summary>The stable code for programmatic handling; always <see cref="MalformedMessageCode"/>.</summary>
  public string Code => MalformedMessageCode;

  /// <summary>Creates a malformed-message error describing why the message was rejected.</summary>
  /// <param name="reason">A human-readable explanation of the structural defect.</param>
  public MalformedMessageError(string reason)
    : base($"Malformed JSON-RPC message: {reason}")
  {
  }
}

/// <summary>
/// Identifier-echo validation and in-flight request-id tracking for JSON-RPC framing (spec §3.2).
/// </summary>
public static class Framing
{
  /// <summary>
  /// Returns <c>true</c> when <paramref name="responseId"/> is a correct echo of
  /// <paramref name="requestId"/> — the same JSON type (string ↔ string, number ↔ number) and
  /// the same value, with NO type coercion. (R-3.2-e, R-3.2-f, R-3.2-g)
  /// </summary>
  /// <param name="requestId">The id of the originating request.</param>
  /// <param name="responseId">The id carried by the response.</param>
  /// <returns><c>true</c> when the two ids match exactly in type and value.</returns>
  /// <remarks>
  /// <see cref="RequestId"/> equality is already type-fidelity-correct — a number <c>7</c> and a
  /// string <c>"7"</c> never compare equal — so this is a thin, intention-revealing wrapper that
  /// names the echo-validation rule and mirrors the TypeScript <c>idEchoMatches</c> helper.
  /// </remarks>
  public static bool IdEchoMatches(RequestId requestId, RequestId responseId) =>
    requestId == responseId;
}

/// <summary>
/// Tracks in-flight request identifiers for a single sender on a single connection, enforcing
/// the uniqueness rules of §3.2.
/// </summary>
/// <remarks>
/// <para>
/// Per R-3.2-c a sender MUST NOT reuse an identifier while the original request is still awaiting
/// a response; per R-3.2-d all outstanding ids from a single sender on a single connection MUST be
/// unique.
/// </para>
/// <para>
/// A string id and a number id with the same textual representation are kept distinct because they
/// are different JSON types (R-3.2-f, R-3.2-g): <c>"1"</c> and <c>1</c> are different ids. This is
/// enforced by <see cref="RequestId"/>'s own equality and hashing, so the tracker can key directly
/// on the <see cref="RequestId"/> value.
/// </para>
/// </remarks>
public sealed class InFlightTracker
{
  private readonly Dictionary<RequestId, RequestId> _inflight = new();

  /// <summary>
  /// Registers <paramref name="id"/> as in-flight for an outgoing request.
  /// </summary>
  /// <param name="id">The identifier of the request being sent.</param>
  /// <exception cref="InvalidOperationException">
  /// Thrown when <paramref name="id"/> is already in-flight, indicating a reuse violation
  /// (R-3.2-c, R-3.2-d).
  /// </exception>
  public void Register(RequestId id)
  {
    if (!_inflight.TryAdd(id, id))
    {
      throw new InvalidOperationException(
        string.Format(
          CultureInfo.InvariantCulture,
          "Request id {0} is already in-flight; ids MUST be unique (R-3.2-c, R-3.2-d).",
          Describe(id)));
    }
  }

  /// <summary>
  /// Removes <paramref name="id"/> from the in-flight set once a response has been received. It is
  /// safe to call this for an id that is not currently tracked.
  /// </summary>
  /// <param name="id">The identifier of the completed request.</param>
  public void Complete(RequestId id) => _inflight.Remove(id);

  /// <summary>Returns <c>true</c> when <paramref name="id"/> is currently registered as in-flight.</summary>
  /// <param name="id">The identifier to test.</param>
  /// <returns><c>true</c> when the id is outstanding.</returns>
  public bool Has(RequestId id) => _inflight.ContainsKey(id);

  /// <summary>The number of currently in-flight requests.</summary>
  public int Size => _inflight.Count;

  /// <summary>A snapshot of all currently outstanding identifiers.</summary>
  /// <remarks>The returned list is a copy; mutating the tracker afterwards does not affect it.</remarks>
  public IReadOnlyList<RequestId> Outstanding => _inflight.Values.ToList();

  /// <summary>Renders an id for a diagnostic message, distinguishing a string from a same-text number.</summary>
  /// <param name="id">The id to describe.</param>
  /// <returns>A quoted form for strings, a bare form for numbers.</returns>
  private static string Describe(RequestId id) =>
    id.IsString ? $"\"{id}\"" : id.ToString();
}
