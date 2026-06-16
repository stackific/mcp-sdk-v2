using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// The wire-level endpoint roles model (§1.1, §2.2). These tests verify the exported constant
/// values callers depend on when comparing against a received role string. Mirrors the TypeScript
/// <c>roles.test.ts</c> suite (AC-01.1).
/// </summary>
public sealed class RolesTests
{
  [Fact]
  public void Client_has_the_wire_value_client() => Assert.Equal("client", McpRole.Client);

  [Fact]
  public void Server_has_the_wire_value_server() => Assert.Equal("server", McpRole.Server);

  [Fact]
  public void Client_and_server_are_distinct() => Assert.NotEqual(McpRole.Client, McpRole.Server);

  [Fact]
  public void Values_covers_exactly_the_two_wire_roles_and_excludes_the_host()
  {
    Assert.Equal(2, McpRole.Values.Count);
    Assert.DoesNotContain("host", McpRole.Values);
    Assert.Equal(["client", "server"], McpRole.Values);
  }

  [Fact]
  public void Endpoint_role_is_distinct_from_the_content_author_role()
  {
    // McpRole (endpoint) and Role (content author / audience, §14.7) are different concepts: the
    // endpoint roles are never "user"/"assistant".
    Assert.DoesNotContain("user", McpRole.Values);
    Assert.DoesNotContain("assistant", McpRole.Values);
  }
}
