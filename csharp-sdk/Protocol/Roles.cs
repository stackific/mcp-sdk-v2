namespace Stackific.Mcp.Protocol;

/// <summary>
/// The two wire-level JSON-RPC endpoint roles (§1.1, §2.2).
/// </summary>
/// <remarks>
/// <para>
/// The host creates and coordinates many clients; each client is bound one-to-one to exactly one
/// server, and servers are isolated from one another. The host is NOT a JSON-RPC role on the wire,
/// so it does not appear here.
/// </para>
/// <para>
/// This endpoint role is deliberately distinct from <see cref="Role"/> (the content-author /
/// audience role of §14.7, whose values are <c>user</c> and <c>assistant</c>). The values exposed
/// here are the literal wire strings a caller compares a received role against, mirroring the
/// TypeScript <c>McpRole</c> constant object. (AC-01.1)
/// </para>
/// </remarks>
public static class McpRole
{
  /// <summary>The wire value for the client endpoint role: the literal <c>"client"</c>.</summary>
  public const string Client = "client";

  /// <summary>The wire value for the server endpoint role: the literal <c>"server"</c>.</summary>
  public const string Server = "server";

  /// <summary>
  /// The two endpoint roles exactly as they appear on the wire, in declaration order. The host is
  /// not a wire role and is intentionally absent.
  /// </summary>
  public static IReadOnlyList<string> Values { get; } = [Client, Server];
}
