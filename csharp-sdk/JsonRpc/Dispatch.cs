using System.Text.Json.Nodes;

namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// Describes a method that a receiver recognizes, for use by <see cref="Dispatch.DispatchRequest"/>.
/// </summary>
/// <remarks>
/// A method is registered by name in a <see cref="MethodRegistry"/>; an absent entry causes
/// <see cref="Dispatch.DispatchRequest"/> to produce a method-not-found error response (R-3.3-j).
/// </remarks>
public sealed class MethodDescriptor
{
  /// <summary>
  /// When <c>true</c>, the <c>params</c> object MUST be present on every request to this method.
  /// This covers the case where a method's per-request <c>_meta</c> is REQUIRED — <c>params</c>
  /// must be provided to carry it. A request that omits <c>params</c> for such a method is rejected
  /// with an invalid-params error response. (R-3.3-i)
  /// </summary>
  public bool RequiresParams { get; init; }

  /// <summary>
  /// Optional validator for the incoming <c>params</c> object. When provided and the request's
  /// <c>params</c> fails validation (the delegate returns <c>false</c>),
  /// <see cref="Dispatch.DispatchRequest"/> returns an invalid-params error response. (R-3.3-k)
  /// </summary>
  /// <remarks>
  /// This is the C# analogue of the TypeScript <c>paramsSchema</c> (a Zod schema). It is invoked
  /// only when <c>params</c> is present; leave it <c>null</c> to skip schema validation (the method
  /// accepts any params, subject only to the <see cref="RequiresParams"/> presence check).
  /// </remarks>
  public Func<JsonObject, bool>? ParamsValidator { get; init; }
}

/// <summary>
/// Maps a method name to its <see cref="MethodDescriptor"/> for every method the receiver handles.
/// </summary>
/// <remarks>
/// A read-only dictionary keyed with ordinal string comparison so that method names are matched
/// case-sensitively, as required by R-3.3-d (<c>"Ping"</c> is not <c>"ping"</c>).
/// </remarks>
public sealed class MethodRegistry
{
  private readonly IReadOnlyDictionary<string, MethodDescriptor> _methods;

  /// <summary>Creates a registry from a set of method-name/descriptor pairs.</summary>
  /// <param name="methods">The methods the receiver handles; names are matched case-sensitively.</param>
  public MethodRegistry(IEnumerable<KeyValuePair<string, MethodDescriptor>> methods)
  {
    ArgumentNullException.ThrowIfNull(methods);
    var map = new Dictionary<string, MethodDescriptor>(StringComparer.Ordinal);
    foreach (var (name, descriptor) in methods)
    {
      map[name] = descriptor;
    }
    _methods = map;
  }

  /// <summary>An empty registry that recognizes no methods.</summary>
  public static MethodRegistry Empty { get; } =
    new(Array.Empty<KeyValuePair<string, MethodDescriptor>>());

  /// <summary>Looks up a descriptor by method name (case-sensitive).</summary>
  /// <param name="method">The method name from the request.</param>
  /// <param name="descriptor">The matched descriptor, or <c>null</c> when the method is unknown.</param>
  /// <returns><c>true</c> when the method is registered.</returns>
  public bool TryGet(string method, out MethodDescriptor? descriptor) =>
    _methods.TryGetValue(method, out descriptor);
}

/// <summary>
/// The result of attempting to dispatch a request: either success, or a failure carrying the
/// error response that should be sent back to the requester.
/// </summary>
/// <param name="Ok"><c>true</c> when the request can be dispatched; <c>false</c> when it must be rejected.</param>
/// <param name="Response">The error response to return when <see cref="Ok"/> is <c>false</c>; otherwise <c>null</c>.</param>
public readonly record struct DispatchOutcome(bool Ok, JsonRpcErrorResponse? Response)
{
  /// <summary>The successful outcome — the request is dispatchable.</summary>
  public static DispatchOutcome Success { get; } = new(true, null);

  /// <summary>Builds a failed outcome carrying the rejection <paramref name="response"/>.</summary>
  /// <param name="response">The error response to return to the requester.</param>
  /// <returns>A failed <see cref="DispatchOutcome"/>.</returns>
  public static DispatchOutcome Failure(JsonRpcErrorResponse response) => new(false, response);
}

/// <summary>
/// Method dispatch for JSON-RPC request handling (§3.3, R-3.3-i, R-3.3-j, R-3.3-k).
/// </summary>
/// <remarks>
/// Provides the minimal, pure, unit-testable dispatch surface: given a classified request and a
/// registry of known methods, it produces the correct error response when the method is
/// unrecognized or the params are invalid. The standard JSON-RPC error codes −32601 (method not
/// found) and −32602 (invalid params) are used because they originate from the JSON-RPC 2.0
/// specification (see <see cref="ErrorCodes"/> for the full MCP registry).
/// </remarks>
public static class Dispatch
{
  /// <summary>
  /// Validates <paramref name="request"/> against <paramref name="registry"/> and returns the
  /// dispatch outcome.
  /// </summary>
  /// <param name="request">A request produced by message classification.</param>
  /// <param name="registry">The set of methods the receiver handles.</param>
  /// <returns>
  /// <see cref="DispatchOutcome.Success"/> when the method is registered and its params are valid;
  /// otherwise a failure carrying an error response whose <c>id</c> echoes the request id with the
  /// same JSON type and value (R-3.2-e, R-3.2-f, R-3.2-g).
  /// </returns>
  /// <remarks>
  /// A failure is produced when any of the following hold:
  /// <list type="bullet">
  ///   <item><description>The method name is not in <paramref name="registry"/> →
  ///   <b>method-not-found</b> (−32601, R-3.3-j).</description></item>
  ///   <item><description><see cref="MethodDescriptor.RequiresParams"/> is <c>true</c> and
  ///   <c>params</c> is absent (for example a method whose per-request <c>_meta</c> is REQUIRED) →
  ///   <b>invalid-params</b> (−32602, R-3.3-i).</description></item>
  ///   <item><description><see cref="MethodDescriptor.ParamsValidator"/> is provided and the
  ///   present <c>params</c> fails validation → <b>invalid-params</b> (−32602, R-3.3-k).</description></item>
  /// </list>
  /// </remarks>
  public static DispatchOutcome DispatchRequest(JsonRpcRequest request, MethodRegistry registry)
  {
    ArgumentNullException.ThrowIfNull(request);
    ArgumentNullException.ThrowIfNull(registry);

    if (!registry.TryGet(request.Method, out var descriptor) || descriptor is null)
    {
      return DispatchOutcome.Failure(
        ErrorResponse(request.Id, ErrorCodes.MethodNotFound, "Method not found"));
    }

    // Enforce params presence when the method requires it (R-3.3-i).
    if (descriptor.RequiresParams && request.Params is null)
    {
      return DispatchOutcome.Failure(ErrorResponse(
        request.Id,
        ErrorCodes.InvalidParams,
        "params must be present for this method (required to carry per-request _meta)"));
    }

    // Validate the params shape when a validator is registered and params is present (R-3.3-k).
    if (descriptor.ParamsValidator is not null && request.Params is not null)
    {
      if (!descriptor.ParamsValidator(request.Params))
      {
        return DispatchOutcome.Failure(
          ErrorResponse(request.Id, ErrorCodes.InvalidParams, "Invalid params"));
      }
    }

    return DispatchOutcome.Success;
  }

  /// <summary>Builds a <see cref="JsonRpcErrorResponse"/> echoing <paramref name="id"/> without type coercion.</summary>
  /// <param name="id">The id to echo into the response.</param>
  /// <param name="code">The JSON-RPC error code.</param>
  /// <param name="message">The human-readable error message.</param>
  /// <returns>The error response.</returns>
  private static JsonRpcErrorResponse ErrorResponse(RequestId id, int code, string message) =>
    new(id, new JsonRpcError(code, message));
}
