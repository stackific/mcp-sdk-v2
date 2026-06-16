using System.Text.Json.Nodes;

namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// A protocol-level failure that maps to a JSON-RPC error response (spec §22). Throwing an
/// <see cref="McpError"/> anywhere in request processing lets the transport translate it
/// into the correct <c>error</c> object — and, on HTTP, the correct status code.
/// </summary>
/// <remarks>
/// This is distinct from a <em>feature-level</em> error (for example a tool that runs but
/// fails, reported with <c>isError: true</c> inside a successful result, §22.5). Use
/// <see cref="McpError"/> only when the request itself cannot be dispatched or processed.
/// </remarks>
public class McpError : Exception
{
  /// <summary>The JSON-RPC error code (see <see cref="ErrorCodes"/>).</summary>
  public int Code { get; }

  /// <summary>Optional structured error detail placed in <c>error.data</c> (named to avoid clashing with <see cref="Exception.Data"/>).</summary>
  public JsonNode? ErrorData { get; }

  /// <summary>Creates a protocol error with the given code, message, and optional data.</summary>
  /// <param name="code">The JSON-RPC error code.</param>
  /// <param name="message">A short, human-readable description.</param>
  /// <param name="data">Optional structured detail.</param>
  public McpError(int code, string message, JsonNode? data = null) : base(message)
  {
    Code = code;
    ErrorData = data;
  }

  /// <summary>Projects this exception into the wire <see cref="JsonRpcError"/> object.</summary>
  /// <returns>The error object carrying <see cref="Code"/>, <see cref="Exception.Message"/>, and <see cref="ErrorData"/>.</returns>
  public JsonRpcError ToJsonRpcError() => new(Code, Message, ErrorData?.DeepClone());

  /// <summary>-32700 Parse error: the byte stream could not be parsed as JSON (§22.2).</summary>
  /// <param name="message">An optional override for the human-readable message.</param>
  /// <returns>The constructed error.</returns>
  public static McpError ParseError(string? message = null) =>
    new(ErrorCodes.ParseError, message ?? "Parse error: invalid JSON.");

  /// <summary>-32600 Invalid Request: valid JSON but not a valid JSON-RPC request object (§22.2).</summary>
  /// <param name="message">The human-readable message.</param>
  /// <returns>The constructed error.</returns>
  public static McpError InvalidRequest(string message) => new(ErrorCodes.InvalidRequest, message);

  /// <summary>-32601 Method not found, including methods gated behind an unadvertised capability (§22.2).</summary>
  /// <param name="method">The unrecognized method name, echoed into <c>data.method</c>.</param>
  /// <returns>The constructed error.</returns>
  public static McpError MethodNotFound(string method) =>
    new(ErrorCodes.MethodNotFound, $"Method not found: {method}", new JsonObject { ["method"] = method });

  /// <summary>-32602 Invalid params: a well-formed request whose parameters fail validation (§22.4).</summary>
  /// <param name="message">The human-readable message.</param>
  /// <param name="data">Optional structured detail (for example the offending <c>uri</c> or <c>toolName</c>).</param>
  /// <returns>The constructed error.</returns>
  public static McpError InvalidParams(string message, JsonNode? data = null) =>
    new(ErrorCodes.InvalidParams, message, data);

  /// <summary>-32603 Internal error: an unexpected server-side condition (§22.2).</summary>
  /// <param name="message">The human-readable message.</param>
  /// <returns>The constructed error.</returns>
  public static McpError InternalError(string message) => new(ErrorCodes.InternalError, message);

  /// <summary>
  /// -32004 UnsupportedProtocolVersion (§5.5/§22.3.2). The <c>data</c> carries the server's
  /// <c>supported</c> revisions and the <c>requested</c> revision so the client can re-select.
  /// </summary>
  /// <param name="supported">The protocol revisions the server supports (non-empty).</param>
  /// <param name="requested">The revision the rejected request declared.</param>
  /// <returns>The constructed error.</returns>
  public static McpError UnsupportedProtocolVersion(IEnumerable<string> supported, string requested)
  {
    var supportedArray = new JsonArray();
    foreach (var revision in supported) supportedArray.Add(revision);
    var data = new JsonObject { ["supported"] = supportedArray, ["requested"] = requested };
    return new McpError(ErrorCodes.UnsupportedProtocolVersion, "Unsupported protocol version", data);
  }

  /// <summary>
  /// -32003 MissingRequiredClientCapability (§5.6/§22.3.1). The <c>data.requiredCapabilities</c>
  /// lists the capabilities the server needs the client to declare.
  /// </summary>
  /// <param name="requiredCapabilities">A <c>ClientCapabilities</c>-shaped object naming the missing capabilities.</param>
  /// <returns>The constructed error.</returns>
  public static McpError MissingRequiredClientCapability(JsonNode requiredCapabilities) =>
    new(ErrorCodes.MissingRequiredClientCapability, "Required client capability not declared",
      new JsonObject { ["requiredCapabilities"] = requiredCapabilities.DeepClone() });

  /// <summary>-32001 HeaderMismatch: a Streamable HTTP routing header is missing/malformed/mismatched (§9).</summary>
  /// <param name="message">The human-readable message.</param>
  /// <returns>The constructed error.</returns>
  public static McpError HeaderMismatch(string message) => new(ErrorCodes.HeaderMismatch, message);
}
