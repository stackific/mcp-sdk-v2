using System.Text.Json;
using System.Text.Json.Nodes;

namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// The exact string an MCP message's <c>jsonrpc</c> member must carry (spec §3.1).
/// </summary>
public static class JsonRpcConstants
{
  /// <summary>The JSON-RPC protocol version literal: <c>"2.0"</c>.</summary>
  public const string Version = "2.0";
}

/// <summary>
/// Base type for the three kinds of framed JSON-RPC message — request, notification, and
/// response (success or error) — defined in §3. A message's kind is determined structurally
/// (§3.1); see <see cref="JsonRpcMessageSerializer"/> for classification and (de)serialization.
/// </summary>
public abstract record JsonRpcMessage
{
  private protected JsonRpcMessage() { }
}

/// <summary>A JSON-RPC request (§3.3): carries an <see cref="Id"/> and a <see cref="Method"/>, and expects exactly one response.</summary>
/// <param name="Id">The request identifier (§3.2).</param>
/// <param name="Method">The case-sensitive method name.</param>
/// <param name="Params">The method arguments as a JSON object, or <c>null</c> when the method takes none.</param>
public sealed record JsonRpcRequest(RequestId Id, string Method, JsonObject? Params = null) : JsonRpcMessage;

/// <summary>A JSON-RPC notification (§3.4): a one-way message with a <see cref="Method"/> but no id, and no response.</summary>
/// <param name="Method">The case-sensitive notification name.</param>
/// <param name="Params">The notification data as a JSON object, or <c>null</c>.</param>
public sealed record JsonRpcNotification(string Method, JsonObject? Params = null) : JsonRpcMessage;

/// <summary>A JSON-RPC success response (§3.5.1): carries the answered <see cref="Id"/> and a <see cref="Result"/> object.</summary>
/// <param name="Id">The identifier of the request being answered.</param>
/// <param name="Result">The method's <c>Result</c> object (which carries <c>resultType</c>; see §3.6).</param>
public sealed record JsonRpcSuccessResponse(RequestId Id, JsonObject Result) : JsonRpcMessage;

/// <summary>
/// A JSON-RPC error response (§3.5.2/§22.1): carries an <see cref="Error"/> and, normally, the
/// answered <see cref="Id"/>. The id MAY be absent only when the originating request's id could
/// not be determined (§22.6).
/// </summary>
/// <param name="Id">The identifier of the request being answered, or <c>null</c> when undeterminable.</param>
/// <param name="Error">The error object (§3.8).</param>
public sealed record JsonRpcErrorResponse(RequestId? Id, JsonRpcError Error) : JsonRpcMessage;

/// <summary>
/// Classifies raw JSON into a <see cref="JsonRpcMessage"/> per the structural rules of §3.1,
/// and renders messages back to wire text. Malformed input is rejected with the correct
/// JSON-RPC error (parse → -32700, structurally invalid → -32600).
/// </summary>
public static class JsonRpcMessageSerializer
{
  /// <summary>Parses a single JSON-RPC message from UTF-8 JSON <paramref name="text"/>.</summary>
  /// <param name="text">The message text.</param>
  /// <returns>The classified message.</returns>
  /// <exception cref="McpError">-32700 if the text is not valid JSON; -32600 if it is not a valid JSON-RPC message.</exception>
  public static JsonRpcMessage Parse(string text)
  {
    JsonNode? node;
    try
    {
      node = JsonNode.Parse(text);
    }
    catch (JsonException error)
    {
      throw McpError.ParseError($"Parse error: {error.Message}");
    }
    return FromNode(node);
  }

  /// <summary>Classifies an already-parsed JSON <paramref name="node"/> into a message (§3.1).</summary>
  /// <param name="node">The parsed JSON node.</param>
  /// <returns>The classified message.</returns>
  /// <exception cref="McpError">-32600 when the node is not a structurally valid JSON-RPC message.</exception>
  public static JsonRpcMessage FromNode(JsonNode? node)
  {
    if (node is not JsonObject obj)
    {
      // §3.1: a top-level array (a batch) or any scalar is a malformed message.
      throw McpError.InvalidRequest("A JSON-RPC message MUST be a single JSON object; arrays (batches) and scalars are rejected.");
    }

    if (!obj.TryGetPropertyValue("jsonrpc", out var jsonrpc) ||
        jsonrpc is not JsonValue jsonrpcValue ||
        jsonrpcValue.GetValueKind() != JsonValueKind.String ||
        jsonrpcValue.GetValue<string>() != JsonRpcConstants.Version)
    {
      throw McpError.InvalidRequest("Missing or invalid \"jsonrpc\": it MUST be exactly \"2.0\".");
    }

    var hasId = obj.TryGetPropertyValue("id", out var idNode) && idNode is not null;
    var hasMethod = obj.TryGetPropertyValue("method", out var methodNode);
    var hasResult = obj.ContainsKey("result");
    var hasError = obj.TryGetPropertyValue("error", out var errorNode) && errorNode is not null;

    // §3.1: method together with result/error, or both result and error, is malformed.
    if (hasMethod && (hasResult || hasError))
    {
      throw McpError.InvalidRequest("A message MUST NOT carry both \"method\" and \"result\"/\"error\".");
    }
    if (hasResult && hasError)
    {
      throw McpError.InvalidRequest("A response MUST contain exactly one of \"result\" or \"error\".");
    }

    if (hasError)
    {
      var id = idNode is not null ? RequestId.FromJsonNode(idNode) : (RequestId?)null;
      return new JsonRpcErrorResponse(id, ReadError(errorNode!));
    }

    if (hasMethod)
    {
      if (methodNode is not JsonValue methodValue || methodValue.GetValueKind() != JsonValueKind.String)
      {
        throw McpError.InvalidRequest("\"method\" MUST be a string.");
      }
      var method = methodValue.GetValue<string>();
      var prms = ReadParams(obj);
      return hasId
        ? new JsonRpcRequest(RequestId.FromJsonNode(idNode!), method, prms)
        : new JsonRpcNotification(method, prms);
    }

    if (hasResult)
    {
      if (!hasId) throw McpError.InvalidRequest("A success response MUST carry an \"id\".");
      if (obj["result"] is not JsonObject result)
      {
        throw McpError.InvalidRequest("\"result\" MUST be a JSON object (a Result; see §3.6).");
      }
      return new JsonRpcSuccessResponse(RequestId.FromJsonNode(idNode!), (JsonObject)result.DeepClone());
    }

    throw McpError.InvalidRequest("A JSON-RPC message MUST be a request, notification, or response.");
  }

  /// <summary>Renders <paramref name="message"/> to compact JSON-RPC wire text.</summary>
  /// <param name="message">The message to serialize.</param>
  /// <returns>The JSON text.</returns>
  public static string Serialize(JsonRpcMessage message) => ToNode(message).ToJsonString(McpJson.Options);

  /// <summary>Builds the JSON object representation of <paramref name="message"/>.</summary>
  /// <param name="message">The message to render.</param>
  /// <returns>A fresh <see cref="JsonObject"/> safe to mutate or re-parent.</returns>
  public static JsonObject ToNode(JsonRpcMessage message)
  {
    var obj = new JsonObject { ["jsonrpc"] = JsonRpcConstants.Version };
    switch (message)
    {
      case JsonRpcRequest request:
        obj["id"] = request.Id.ToJsonNode();
        obj["method"] = request.Method;
        if (request.Params is not null) obj["params"] = request.Params.DeepClone();
        break;
      case JsonRpcNotification notification:
        obj["method"] = notification.Method;
        if (notification.Params is not null) obj["params"] = notification.Params.DeepClone();
        break;
      case JsonRpcSuccessResponse success:
        obj["id"] = success.Id.ToJsonNode();
        obj["result"] = success.Result.DeepClone();
        break;
      case JsonRpcErrorResponse failure:
        if (failure.Id is { } id) obj["id"] = id.ToJsonNode();
        obj["error"] = ErrorToNode(failure.Error);
        break;
      default:
        throw new ArgumentOutOfRangeException(nameof(message), "Unknown JSON-RPC message kind.");
    }
    return obj;
  }

  private static JsonObject? ReadParams(JsonObject obj)
  {
    if (!obj.TryGetPropertyValue("params", out var prms) || prms is null) return null;
    if (prms is not JsonObject paramsObj)
    {
      // §3.3/§3.4: params, when present, MUST be a JSON object (no positional arrays).
      throw McpError.InvalidRequest("\"params\" MUST be a JSON object when present.");
    }
    return (JsonObject)paramsObj.DeepClone();
  }

  private static JsonRpcError ReadError(JsonNode errorNode)
  {
    if (errorNode is not JsonObject errorObj ||
        errorObj["code"] is not JsonValue codeValue ||
        codeValue.GetValueKind() != JsonValueKind.Number ||
        !codeValue.TryGetValue(out int code))
    {
      throw McpError.InvalidRequest("\"error.code\" MUST be an integer.");
    }
    var message = errorObj["message"] is JsonValue messageValue && messageValue.GetValueKind() == JsonValueKind.String
      ? messageValue.GetValue<string>()
      : throw McpError.InvalidRequest("\"error.message\" MUST be a string.");
    var data = errorObj["data"]?.DeepClone();
    return new JsonRpcError(code, message, data);
  }

  private static JsonObject ErrorToNode(JsonRpcError error)
  {
    var obj = new JsonObject { ["code"] = error.Code, ["message"] = error.Message };
    if (error.Data is not null) obj["data"] = error.Data.DeepClone();
    return obj;
  }
}
