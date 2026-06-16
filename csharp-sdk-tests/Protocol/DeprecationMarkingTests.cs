using System.Reflection;

using Stackific.Mcp;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// §27.4 (R-27.4-a): every Deprecated wire surface MUST be marked with C#'s native deprecation
/// mechanism — <see cref="ObsoleteAttribute"/> — so consumers receive a compile-time deprecation
/// signal (the parity of the TypeScript SDK's <c>@deprecated</c>). The SDK still accepts and
/// round-trips these surfaces; the marking is informational. Surfaces are looked up by name through
/// reflection so this test does not itself reference the obsolete symbols.
/// </summary>
public sealed class DeprecationMarkingTests
{
  private static readonly Assembly Sdk = typeof(McpJson).Assembly;

  [Theory]
  [InlineData("Stackific.Mcp.Protocol.Root")]                              // Roots (§21.1)
  [InlineData("Stackific.Mcp.Protocol.ListRootsResult")]                   // Roots (§21.1)
  [InlineData("Stackific.Mcp.Protocol.CreateMessageRequestParams")]        // Sampling (§21.2)
  [InlineData("Stackific.Mcp.Protocol.IncludeContext")]                    // includeContext (§21.2.4)
  [InlineData("Stackific.Mcp.Protocol.LoggingMessageNotificationParams")]  // Logging (§15.3)
  [InlineData("Stackific.Mcp.Protocol.DynamicClientRegistrationRequest")]  // DCR (§23.11)
  public void Deprecated_types_carry_the_obsolete_attribute(string fullName)
  {
    var type = Sdk.GetType(fullName);
    Assert.NotNull(type);
    Assert.NotNull(type!.GetCustomAttribute<ObsoleteAttribute>());
  }

  [Fact]
  public void The_deprecated_log_level_meta_key_carries_the_obsolete_attribute()
  {
    var field = Sdk.GetType("Stackific.Mcp.Json.MetaKeys")!
      .GetField("LogLevel", BindingFlags.Public | BindingFlags.Static);
    Assert.NotNull(field);
    Assert.NotNull(field!.GetCustomAttribute<ObsoleteAttribute>());
  }
}
