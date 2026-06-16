using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.JsonRpc;

/// <summary>
/// The JSON-RPC <c>error</c> object carried by an error response (spec §3.8/§22.1):
/// an integer <see cref="Code"/>, a human-readable <see cref="Message"/>, and OPTIONAL
/// structured <see cref="Data"/>.
/// </summary>
/// <param name="Code">The integer error code (§22.2/§22.3, Appendix B). Authoritative.</param>
/// <param name="Message">A short, human-readable description. Informational only — receivers MUST NOT parse it.</param>
/// <param name="Data">Optional structured detail, whose shape is defined by the sender or the specific code.</param>
public sealed record JsonRpcError(
  [property: JsonPropertyName("code")] int Code,
  [property: JsonPropertyName("message")] string Message,
  [property: JsonPropertyName("data")] JsonNode? Data = null);
