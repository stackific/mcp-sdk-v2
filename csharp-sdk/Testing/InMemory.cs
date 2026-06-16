using Stackific.Mcp.Client;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Testing;

/// <summary>
/// A test-kit that wires an <see cref="McpClient"/> directly to an <see cref="McpServer"/> over the
/// in-memory transport (spec-faithful request/response shape, no HTTP). Useful for end-to-end SDK
/// tests and for embedding a server in the same process as its client.
/// </summary>
public static class InMemory
{
  private static readonly Implementation DefaultClientInfo = new() { Name = "in-memory-client", Version = "0.0.0" };

  /// <summary>
  /// Connects a fresh client to <paramref name="server"/> over the in-memory transport. The returned
  /// client has not yet discovered; call <see cref="McpClient.DiscoverAsync"/> to negotiate.
  /// </summary>
  /// <param name="server">The server to bridge to.</param>
  /// <param name="clientInfo">The client identity (defaults to a generic test identity).</param>
  /// <param name="capabilities">The client capabilities (defaults to none).</param>
  /// <param name="authInfo">An optional pre-validated identity attached to every request (§23).</param>
  /// <returns>A client connected to the server.</returns>
  public static McpClient Connect(
    McpServer server,
    Implementation? clientInfo = null,
    ClientCapabilities? capabilities = null,
    AuthInfo? authInfo = null)
  {
    var transport = new InMemoryClientTransport(server, authInfo);
    return new McpClient(transport, clientInfo ?? DefaultClientInfo, capabilities);
  }
}
