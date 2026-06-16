using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// The wire-level endpoint roles model (§1.1, §2.2). <see cref="McpRole"/> is an enum whose members
/// round-trip to the literal lowercase wire strings a caller compares a received role against.
/// Mirrors the TypeScript <c>roles.test.ts</c> suite (AC-01.1).
/// </summary>
public sealed class RolesTests
{
  [Theory]
  [InlineData(McpRole.Client, "\"client\"")]
  [InlineData(McpRole.Server, "\"server\"")]
  public void Roles_serialize_to_their_lowercase_wire_value(McpRole role, string expectedJson) =>
    Assert.Equal(expectedJson, McpJson.Serialize(role));

  [Theory]
  [InlineData("\"client\"", McpRole.Client)]
  [InlineData("\"server\"", McpRole.Server)]
  public void Roles_deserialize_from_their_wire_value(string json, McpRole expected) =>
    Assert.Equal(expected, McpJson.Deserialize<McpRole>(json));

  [Fact]
  public void Client_and_server_are_distinct() => Assert.NotEqual(McpRole.Client, McpRole.Server);

  [Fact]
  public void There_are_exactly_two_endpoint_roles_excluding_the_host()
  {
    var roles = Enum.GetValues<McpRole>();
    Assert.Equal(2, roles.Length);
    // The host is not a wire role and is intentionally absent.
    Assert.Equal([McpRole.Client, McpRole.Server], roles);
  }

  [Fact]
  public void Endpoint_role_is_distinct_from_the_content_author_role()
  {
    // McpRole (endpoint) and Role (content author / audience, §14.7) are different concepts: the
    // endpoint roles never serialize to "user"/"assistant".
    var wire = Enum.GetValues<McpRole>().Select(McpJson.Serialize).ToArray();
    Assert.DoesNotContain("\"user\"", wire);
    Assert.DoesNotContain("\"assistant\"", wire);
  }
}
