using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for discovery (§5.3) and the protocol revision identifier (§5.1): the
/// <see cref="DiscoverResult"/> wire shape, the current revision constant, and the
/// byte-for-byte exact-match semantics of <see cref="ProtocolRevision.IsSupported"/>.
/// </summary>
public sealed class DiscoveryRevisionTests
{
  // ----- DiscoverResult required + optional fields (§5.3.2) -----

  [Fact]
  public void DiscoverResult_serializes_all_required_fields()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = new ServerCapabilities { Tools = new ToolsCapability() },
      ServerInfo = new Implementation { Name = "srv", Version = "2.3.1" },
    };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"supportedVersions\":[\"2026-07-28\"]", json);
    Assert.Contains("\"capabilities\":{", json);
    Assert.Contains("\"serverInfo\":{\"name\":\"srv\",\"version\":\"2.3.1\"}", json);
  }

  [Fact]
  public void DiscoverResult_serializes_optional_instructions_when_present()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
      Instructions = "Prefer search before analysis.",
    };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"instructions\":\"Prefer search before analysis.\"", json);
  }

  [Fact]
  public void DiscoverResult_omits_instructions_when_absent()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
    };
    Assert.DoesNotContain("instructions", McpJson.Serialize(result));
  }

  [Fact]
  public void DiscoverResult_does_not_emit_result_type_from_the_record()
  {
    // resultType is injected by the runtime, not by the DiscoverResult record itself.
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
    };
    Assert.DoesNotContain("resultType", McpJson.Serialize(result));
  }

  [Fact]
  public void DiscoverResult_round_trips_with_capabilities_and_server_info()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ["2026-07-28"],
      Capabilities = new ServerCapabilities
      {
        Tools = new ToolsCapability { ListChanged = true },
        Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
        Extensions = new Dictionary<string, JsonObject> { ["io.modelcontextprotocol/tasks"] = new JsonObject() },
      },
      ServerInfo = new Implementation { Name = "ExampleServer", Version = "1.0.0", Title = "Example" },
      Instructions = "guidance",
    };

    var back = McpJson.Deserialize<DiscoverResult>(McpJson.Serialize(result))!;

    Assert.Equal(["2026-07-28"], back.SupportedVersions);
    Assert.True(back.Capabilities.Tools!.ListChanged);
    Assert.True(back.Capabilities.Resources!.Subscribe);
    Assert.True(back.Capabilities.HasExtension("io.modelcontextprotocol/tasks"));
    Assert.Equal("ExampleServer", back.ServerInfo.Name);
    Assert.Equal("Example", back.ServerInfo.Title);
    Assert.Equal("guidance", back.Instructions);
  }

  [Fact]
  public void DiscoverResult_supports_multiple_supported_versions()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ["2026-07-28", "2025-11-25"],
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "s", Version = "1" },
    };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"supportedVersions\":[\"2026-07-28\",\"2025-11-25\"]", json);
  }

  // ----- Result-level _meta (§5.3.2, R-5.3.2-k) -----

  [Fact]
  public void DiscoverResult_serializes_result_level_meta_when_present()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
      Meta = new JsonObject { ["io.modelcontextprotocol/foo"] = "bar" },
    };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"_meta\":{\"io.modelcontextprotocol/foo\":\"bar\"}", json);
  }

  [Fact]
  public void DiscoverResult_omits_meta_when_absent()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
    };
    Assert.DoesNotContain("_meta", McpJson.Serialize(result));
  }

  [Fact]
  public void DiscoverResult_round_trips_result_level_meta()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ["2026-07-28"],
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
      Meta = new JsonObject { ["x.y/z"] = 1 },
    };
    var back = McpJson.Deserialize<DiscoverResult>(McpJson.Serialize(result))!;
    Assert.NotNull(back.Meta);
    Assert.Equal(1, back.Meta!["x.y/z"]!.GetValue<int>());
  }

  // ----- Validated(): non-empty supportedVersions (§5.3.2, R-5.3.2-b) -----

  [Fact]
  public void Validated_returns_the_result_for_a_non_empty_supported_versions_list()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ["2026-07-28"],
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
    };
    Assert.Same(result, result.Validated());
  }

  [Fact]
  public void Validated_rejects_an_empty_supported_versions_list()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = [],
      Capabilities = new ServerCapabilities(),
      ServerInfo = new Implementation { Name = "srv", Version = "1" },
    };
    Assert.Throws<ArgumentException>(() => result.Validated());
  }

  // ----- ProtocolRevision constants (§5.1) -----

  [Fact]
  public void ProtocolRevision_current_is_the_expected_wire_value()
  {
    Assert.Equal("2026-07-28", ProtocolRevision.Current);
  }

  [Fact]
  public void ProtocolRevision_supported_contains_current()
  {
    Assert.Contains(ProtocolRevision.Current, ProtocolRevision.Supported);
  }

  [Fact]
  public void ProtocolRevision_supported_is_non_empty()
  {
    Assert.NotEmpty(ProtocolRevision.Supported);
  }

  // ----- IsSupported: exact-match only (§5.1) -----

  [Theory]
  [InlineData("2026-07-28", true)]
  public void ProtocolRevision_is_supported_for_the_current_revision(string revision, bool expected)
  {
    Assert.Equal(expected, ProtocolRevision.IsSupported(revision));
  }

  [Theory]
  // Other date-shaped revisions are not supported.
  [InlineData("2025-11-25")]
  [InlineData("2025-03-26")]
  [InlineData("2024-11-05")]
  [InlineData("2027-01-01")]
  [InlineData("2026-07-29")]
  [InlineData("2026-07-27")]
  // Non-date strings are not supported.
  [InlineData("not-a-date")]
  [InlineData("latest")]
  [InlineData("v1")]
  [InlineData("")]
  // Lexical / chronological comparison MUST NOT be performed (§5.1).
  [InlineData("9999-99-99")]
  public void ProtocolRevision_is_not_supported_for_any_other_revision(string revision)
  {
    Assert.False(ProtocolRevision.IsSupported(revision));
  }

  [Theory]
  // Case and whitespace variants of the current revision are NOT exact matches.
  [InlineData(" 2026-07-28")]
  [InlineData("2026-07-28 ")]
  [InlineData("\t2026-07-28")]
  [InlineData("2026-07-28\n")]
  [InlineData("2026-7-28")]
  [InlineData("2026_07_28")]
  [InlineData("2026/07/28")]
  public void ProtocolRevision_rejects_whitespace_and_format_variants(string revision)
  {
    Assert.False(ProtocolRevision.IsSupported(revision));
  }
}
