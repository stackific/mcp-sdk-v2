namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// The complete registry of JSON-RPC error codes used by MCP (spec §22.2/§22.3 and
/// Appendix B). The numeric values are part of the wire contract and are matched exactly.
/// </summary>
public static class ErrorCodes
{
  /// <summary>-32700: invalid JSON was received; the byte stream could not be parsed (§22.2).</summary>
  public const int ParseError = -32700;

  /// <summary>-32600: valid JSON, but not a valid JSON-RPC request object (§22.2).</summary>
  public const int InvalidRequest = -32600;

  /// <summary>-32601: the method does not exist, or is gated behind an unadvertised server capability (§22.2).</summary>
  public const int MethodNotFound = -32601;

  /// <summary>-32602: the method's parameters are invalid or malformed (§22.2/§22.4).</summary>
  public const int InvalidParams = -32602;

  /// <summary>-32603: an unexpected internal error prevented fulfilling an otherwise valid request (§22.2).</summary>
  public const int InternalError = -32603;

  /// <summary>
  /// -32003: fulfilling the request would require a client capability the request did not
  /// declare in <c>io.modelcontextprotocol/clientCapabilities</c> (§22.3.1). On HTTP, status 400.
  /// </summary>
  public const int MissingRequiredClientCapability = -32003;

  /// <summary>
  /// -32004: the request declared a protocol revision the server does not implement
  /// (§22.3.2). On HTTP, status 400.
  /// </summary>
  public const int UnsupportedProtocolVersion = -32004;

  /// <summary>
  /// -32001: a Streamable HTTP request was rejected because a routing-header value does not
  /// match the request body, or a required routing header is missing/malformed (§9). On HTTP, status 400.
  /// </summary>
  public const int HeaderMismatch = -32001;
}
