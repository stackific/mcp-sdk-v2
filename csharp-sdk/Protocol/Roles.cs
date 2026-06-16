using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The two wire-level JSON-RPC endpoint roles (§1.1, §2.2): the two ends of a one-to-one
/// client&#8596;server pairing.
/// </summary>
/// <remarks>
/// <para>
/// The host creates and coordinates many clients; each client is bound one-to-one to exactly one
/// server, and servers are isolated from one another. The host is NOT a JSON-RPC role on the wire,
/// so it does not appear here.
/// </para>
/// <para>
/// This endpoint role is deliberately distinct from <see cref="Role"/> (the content-author /
/// audience role of §14.7, whose values are <c>user</c> and <c>assistant</c>). Modeled as an enum —
/// the idiomatic C# form of a closed set of wire strings — with the same
/// <see cref="JsonStringEnumConverter{TEnum}"/> pattern used by <see cref="Role"/> and
/// <see cref="IconTheme"/>, so it round-trips to the literal lowercase wire values. (AC-01.1)
/// </para>
/// </remarks>
[JsonConverter(typeof(JsonStringEnumConverter<McpRole>))]
public enum McpRole
{
  /// <summary>The client endpoint role; serializes to the literal <c>"client"</c>.</summary>
  [JsonStringEnumMemberName("client")]
  Client,

  /// <summary>The server endpoint role; serializes to the literal <c>"server"</c>.</summary>
  [JsonStringEnumMemberName("server")]
  Server,
}
