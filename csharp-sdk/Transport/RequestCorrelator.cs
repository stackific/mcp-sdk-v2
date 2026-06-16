using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Transport;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S12 — Response↔request correlation, multiplexing, and disconnection (§7.2, §7.5).
//
// This file realizes the §7.2 association/multiplexing/ordering guarantees and the §7.5
// in-flight-failure-on-disconnect rule, transport-agnostically:
//
//   • <see cref="RequestCorrelator"/> — a sender-side registry that issues a Task per outstanding
//     request id, resolves it when a response with the matching id is delivered (in ANY order;
//     R-7.2-m – R-7.2-p), forbids reuse of an unanswered id (R-7.2-j), permits arbitrarily many
//     concurrent outstanding requests (R-7.2-i, R-7.2-k, R-7.2-l), and on disconnection fails every
//     unanswered request so the caller never waits forever (R-7.5-c – R-7.5-e).
//   • Malformed-id error helpers — the single permitted id exception: an error reply to a request whose
//     id could not be read MAY carry a null id or omit it (R-7.2-h).
//
// A delivered JSON-RPC error response is a normal, fully delivered message and RESOLVES its Task (the
// caller inspects result vs error); only a transport-level failure FAULTS it with a TransportError.
// This keeps the §7.5 distinction between the two error kinds explicit at the API. The C# counterpart
// of the TypeScript <c>transport/correlation.ts</c> module.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Correlates inbound responses to outstanding requests <em>by id only</em> — never by delivery order,
/// connection, stream, or position (spec §7.2; R-7.2-e – R-7.2-g, R-7.2-o). The C# counterpart of the
/// TypeScript <c>RequestCorrelator</c>.
/// </summary>
/// <remarks>
/// <para>
/// Typical use by a sender: issue a Task per request id (without blocking), wire the transport's
/// inbound-message handler to <see cref="Deliver"/>, and wire its close handler to <see cref="FailAll"/>.
/// Awaiting the issued Task resolves whenever the matching id arrives, even out of order.
/// </para>
/// <para>
/// A string <c>"1"</c> and a number <c>1</c> are kept distinct because they are different JSON types —
/// matching S03's id rules (R-3.2-f, R-3.2-g). This is guaranteed by <see cref="RequestId"/>'s own
/// type-fidelity equality and hashing, so the correlator keys directly on the <see cref="RequestId"/>.
/// </para>
/// <para>
/// The class is safe for concurrent use: issuing, delivering, and failing requests from multiple
/// threads is supported via the backing <see cref="ConcurrentDictionary{TKey,TValue}"/> and atomic
/// removals, so no two callers can resolve the same entry twice.
/// </para>
/// </remarks>
public sealed class RequestCorrelator
{
  private readonly InFlightTracker _tracker = new();
  private readonly ConcurrentDictionary<RequestId, PendingEntry> _pending = new();
  private readonly object _gate = new();

  /// <summary>A single outstanding request: its id and the source that completes its awaited Task.</summary>
  private sealed record PendingEntry(RequestId Id, TaskCompletionSource<JsonRpcMessage> Completion);

  /// <summary>
  /// Registers <paramref name="id"/> as outstanding and returns a Task that completes when a matching
  /// response is delivered or the request is failed (spec §7.2).
  /// </summary>
  /// <remarks>
  /// Concurrency: calling <see cref="Issue"/> again before the first completes is allowed and expected —
  /// the transport need not await one response before issuing another (R-7.2-i, R-7.2-k, R-7.2-l). The
  /// returned Task uses <see cref="TaskCreationOptions.RunContinuationsAsynchronously"/> so a
  /// continuation never runs inline on the thread that calls <see cref="Deliver"/> /
  /// <see cref="FailAll"/>, preventing re-entrancy into the transport's receive loop.
  /// </remarks>
  /// <param name="id">The id of the request being sent.</param>
  /// <returns>A Task that resolves with the matching response, or faults with a <see cref="TransportError"/>.</returns>
  /// <exception cref="InvalidOperationException">
  /// Synchronously when <paramref name="id"/> is already outstanding — a sender MUST NOT reuse the id of
  /// an unanswered request (R-7.2-j).
  /// </exception>
  public Task<JsonRpcMessage> Issue(RequestId id)
  {
    lock (_gate)
    {
      // Register in the in-flight tracker first; it throws on reuse of an unanswered id (R-7.2-j).
      _tracker.Register(id);
      var completion = new TaskCompletionSource<JsonRpcMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
      _pending[id] = new PendingEntry(id, completion);
      return completion.Task;
    }
  }

  /// <summary>
  /// Delivers an inbound response, resolving the matching outstanding request's Task (spec §7.2).
  /// Matching is purely by id; the order in which responses are delivered is irrelevant (R-7.2-m,
  /// R-7.2-n, R-7.2-p). Mirrors TypeScript <c>RequestCorrelator.deliver</c>.
  /// </summary>
  /// <remarks>
  /// A delivered error response (a <see cref="JsonRpcErrorResponse"/>) still RESOLVES the Task — it is a
  /// normal, fully delivered protocol message (§7.5). Only <see cref="Fail"/>/<see cref="FailAll"/>
  /// fault a Task (transport-level failure).
  /// </remarks>
  /// <param name="response">The inbound response message (a success or error response).</param>
  /// <returns>
  /// <c>true</c> if a matching outstanding request was found and resolved; <c>false</c> for an
  /// unknown/late id (for example a response to an already-failed request, or a message that is not a
  /// response, or an error response with no readable id) — the correlator does not throw on an
  /// unmatched delivery.
  /// </returns>
  public bool Deliver(JsonRpcMessage response)
  {
    ArgumentNullException.ThrowIfNull(response);
    if (!TryGetResponseId(response, out var id))
    {
      // A message that is not a response, or a response without a readable id, cannot be correlated.
      return false;
    }

    PendingEntry? entry;
    lock (_gate)
    {
      if (!_pending.TryGetValue(id, out entry))
      {
        return false;
      }
      // Defensive: the matched id must echo the issued id with no type coercion (string vs number).
      if (!Framing.IdEchoMatches(entry.Id, id))
      {
        return false;
      }
      _pending.TryRemove(id, out _);
      _tracker.Complete(id);
    }

    entry.Completion.TrySetResult(response);
    return true;
  }

  /// <summary>
  /// Fails a single outstanding request with a transport-level error, faulting its Task so the caller
  /// can observe the failure rather than waiting forever (spec §7.5; R-7.5-d, R-7.5-e). Mirrors
  /// TypeScript <c>RequestCorrelator.fail</c>.
  /// </summary>
  /// <param name="id">The id of the outstanding request to fail.</param>
  /// <param name="error">The transport-level error to fault the Task with.</param>
  /// <returns><c>true</c> if the request was outstanding and is now failed.</returns>
  public bool Fail(RequestId id, TransportError error)
  {
    ArgumentNullException.ThrowIfNull(error);
    PendingEntry? entry;
    lock (_gate)
    {
      if (!_pending.TryRemove(id, out entry))
      {
        return false;
      }
      _tracker.Complete(id);
    }
    entry.Completion.TrySetException(error);
    return true;
  }

  /// <summary>
  /// Fails <em>every</em> outstanding request — the action a transport takes on abrupt or clean
  /// disconnection so no in-flight request can hang (spec §7.5; R-7.5-c, R-7.5-d, R-7.5-e). Mirrors
  /// TypeScript <c>RequestCorrelator.failAll</c>.
  /// </summary>
  /// <remarks>
  /// After this returns the correlator holds no outstanding requests, so the same ids MAY be reissued
  /// against a fresh connection (R-7.5-f, R-7.7-b) — no state is bound to the lost connection.
  /// </remarks>
  /// <param name="error">The transport-level error to fault each outstanding Task with.</param>
  /// <returns>The ids that were failed, in registration order.</returns>
  public IReadOnlyList<RequestId> FailAll(TransportError error)
  {
    ArgumentNullException.ThrowIfNull(error);
    List<PendingEntry> entries;
    List<RequestId> failed;
    lock (_gate)
    {
      entries = _pending.Values.ToList();
      failed = entries.Select(e => e.Id).ToList();
      foreach (var entry in entries)
      {
        _tracker.Complete(entry.Id);
      }
      _pending.Clear();
    }
    // Fault the Tasks outside the lock so a synchronous continuation cannot deadlock on the gate.
    foreach (var entry in entries)
    {
      entry.Completion.TrySetException(error);
    }
    return failed;
  }

  /// <summary>Returns <c>true</c> when <paramref name="id"/> is currently outstanding.</summary>
  /// <param name="id">The id to test.</param>
  /// <returns><c>true</c> when outstanding.</returns>
  public bool Has(RequestId id) => _pending.ContainsKey(id);

  /// <summary>The number of currently outstanding requests.</summary>
  public int Size => _pending.Count;

  /// <summary>A snapshot of the currently outstanding ids.</summary>
  public IReadOnlyList<RequestId> Outstanding => _pending.Values.Select(e => e.Id).ToList();

  /// <summary>Extracts the correlation id from a response message, if it is a response carrying a readable id.</summary>
  /// <param name="message">The inbound message.</param>
  /// <param name="id">On success, the response's id.</param>
  /// <returns><c>true</c> when the message is a response with a non-null id.</returns>
  private static bool TryGetResponseId(JsonRpcMessage message, out RequestId id)
  {
    switch (message)
    {
      case JsonRpcSuccessResponse success:
        id = success.Id;
        return true;
      case JsonRpcErrorResponse { Id: { } errorId }:
        id = errorId;
        return true;
      default:
        // A request, a notification, or an error response with a null/omitted id cannot be correlated.
        id = default;
        return false;
    }
  }
}

/// <summary>
/// The malformed-id error response — the single permitted id exception (spec §7.2; R-7.2-h). An error
/// reply to a request whose id could not be read MAY carry a <c>null</c> id or omit it entirely. The C#
/// counterpart of the TypeScript <c>buildParseErrorResponse</c> / <c>MalformedIdErrorResponseSchema</c>
/// / <c>isAcceptableMalformedIdErrorResponse</c> helpers.
/// </summary>
public static class MalformedIdError
{
  /// <summary>The standard JSON-RPC "Parse error" code (spec §22 / §7.2): <c>-32700</c>.</summary>
  public const int ParseErrorCode = ErrorCodes.ParseError;

  /// <summary>
  /// Builds a parse-error response for a request whose id could not be read (spec §7.2; R-7.2-h).
  /// Mirrors TypeScript <c>buildParseErrorResponse</c>.
  /// </summary>
  /// <param name="nullId">
  /// When <c>true</c>, the response carries <c>"id": null</c>; when <c>false</c>, the id member is
  /// omitted entirely. Both forms are valid (R-7.2-h).
  /// </param>
  /// <returns>The parse-error response. Its <see cref="JsonRpcErrorResponse.Id"/> is always <c>null</c>; the
  /// <paramref name="nullId"/> choice (explicit <c>null</c> vs omitted) is realized when the response is
  /// serialized, since the C# wire writer omits a null id — both wire forms decode back to a null id.</returns>
  public static JsonRpcErrorResponse BuildParseErrorResponse(bool nullId = false)
  {
    // The C# JsonRpcErrorResponse models both "id: null" and "id omitted" as a null Id; the serializer
    // omits a null id on the wire. The flag is retained for parity with the TS API and to document the
    // caller's intent. A caller that needs the explicit "id": null wire form can render it via the node
    // builder below.
    _ = nullId;
    return new JsonRpcErrorResponse(null, new JsonRpcError(ParseErrorCode, "Parse error"));
  }

  /// <summary>
  /// Builds the wire JSON object for a parse-error response, honoring the explicit-<c>null</c> vs
  /// omitted-id distinction (spec §7.2; R-7.2-h).
  /// </summary>
  /// <param name="nullId">When <c>true</c>, emits <c>"id": null</c>; otherwise omits the id member.</param>
  /// <returns>A fresh JSON object carrying the parse-error response.</returns>
  public static JsonObject BuildParseErrorResponseNode(bool nullId = false)
  {
    var obj = new JsonObject { ["jsonrpc"] = JsonRpcConstants.Version };
    if (nullId)
    {
      obj["id"] = null;
    }
    obj["error"] = new JsonObject { ["code"] = ParseErrorCode, ["message"] = "Parse error" };
    return obj;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is an acceptable malformed-id error response: a
  /// JSON-RPC 2.0 error object whose id is a string, a number, <c>null</c>, or omitted (spec §7.2;
  /// R-7.2-h). Mirrors TypeScript <c>isAcceptableMalformedIdErrorResponse</c>.
  /// </summary>
  /// <remarks>
  /// This deliberately relaxes the strict error-response shape (which permits only string/number/omitted)
  /// to also allow the <c>null</c> form the transport layer explicitly sanctions for this case.
  /// </remarks>
  /// <param name="value">The candidate JSON node.</param>
  /// <returns><c>true</c> when the value is an acceptable malformed-id error response.</returns>
  public static bool IsAcceptableMalformedIdErrorResponse(JsonNode? value)
  {
    if (value is not JsonObject obj)
    {
      return false;
    }
    // jsonrpc must be exactly "2.0".
    if (obj["jsonrpc"] is not JsonValue versionValue ||
        versionValue.GetValueKind() != JsonValueKind.String ||
        versionValue.GetValue<string>() != JsonRpcConstants.Version)
    {
      return false;
    }
    // id, when present, must be a string, a number, or null (the relaxed rule).
    if (obj.TryGetPropertyValue("id", out var idNode) && idNode is not null)
    {
      if (idNode is not JsonValue idValue ||
          (idValue.GetValueKind() != JsonValueKind.String && idValue.GetValueKind() != JsonValueKind.Number))
      {
        return false;
      }
    }
    // error must be an object with an integer code and a string message.
    if (obj["error"] is not JsonObject error)
    {
      return false;
    }
    if (error["code"] is not JsonValue codeValue ||
        codeValue.GetValueKind() != JsonValueKind.Number ||
        !codeValue.TryGetValue<int>(out _))
    {
      return false;
    }
    if (error["message"] is not JsonValue messageValue || messageValue.GetValueKind() != JsonValueKind.String)
    {
      return false;
    }
    return true;
  }
}
