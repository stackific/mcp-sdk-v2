using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// The stateless foundation: the per-request <c>_meta</c> envelope (§4), capability presence
/// semantics (§6), discovery (§5), and revision handling (§5.1).
/// </summary>
public sealed class FoundationTests
{
  private static readonly Implementation SampleClient = new() { Name = "example-client", Version = "1.0.0" };

  [Fact]
  public void RequestMeta_emits_the_three_required_keys_verbatim()
  {
    var meta = new RequestMeta
    {
      ProtocolVersion = ProtocolRevision.Current,
      ClientInfo = SampleClient,
      ClientCapabilities = ClientCapabilities.None,
    }.ToJsonObject();

    Assert.Equal(ProtocolRevision.Current, meta[MetaKeys.ProtocolVersion]!.GetValue<string>());
    Assert.Equal("example-client", meta[MetaKeys.ClientInfo]!["name"]!.GetValue<string>());
    Assert.IsType<JsonObject>(meta[MetaKeys.ClientCapabilities]); // {} for no optional caps
  }

  [Fact]
  public void RequestMeta_carries_additional_keys_like_progress_and_trace()
  {
    var meta = new RequestMeta
    {
      ProtocolVersion = ProtocolRevision.Current,
      ClientInfo = SampleClient,
      ClientCapabilities = ClientCapabilities.None,
      Additional = new JsonObject { [MetaKeys.ProgressToken] = "p-1", [MetaKeys.TraceParent] = "00-abc-def-01" },
    }.ToJsonObject();

    Assert.Equal("p-1", meta[MetaKeys.ProgressToken]!.GetValue<string>());
    Assert.Equal("00-abc-def-01", meta[MetaKeys.TraceParent]!.GetValue<string>());
  }

  [Fact]
  public void RequestMeta_round_trips_through_parse()
  {
    var paramsObject = new JsonObject
    {
      ["_meta"] = new RequestMeta
      {
        ProtocolVersion = ProtocolRevision.Current,
        ClientInfo = new Implementation { Name = "c", Version = "2", Title = "C" },
        ClientCapabilities = new ClientCapabilities { Elicitation = new ElicitationCapability { Form = new JsonObject(), Url = new JsonObject() } },
        LogLevel = "info",
      }.ToJsonObject(),
    };

    var parsed = RequestMeta.Parse(paramsObject);

    Assert.Equal(ProtocolRevision.Current, parsed.ProtocolVersion);
    Assert.Equal("c", parsed.ClientInfo.Name);
    Assert.Equal("info", parsed.LogLevel);
    Assert.True(parsed.ClientCapabilities.SupportsElicitation);
    Assert.True(parsed.ClientCapabilities.SupportsElicitationUrl);
  }

  [Theory]
  [InlineData("""{}""")] // no _meta at all
  [InlineData("""{"_meta":{}}""")] // empty _meta: missing protocolVersion/clientInfo/clientCapabilities
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}""")] // missing clientInfo/caps
  public void RequestMeta_rejects_missing_required_keys_with_invalid_params(string paramsJson)
  {
    var paramsObject = JsonNode.Parse(paramsJson)!.AsObject();
    var error = Assert.Throws<McpError>(() => RequestMeta.Parse(paramsObject));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void ClientCapabilities_presence_semantics()
  {
    var none = JsonSerializer.Deserialize<ClientCapabilities>("{}", McpJson.Options)!;
    Assert.False(none.SupportsElicitation);
    Assert.False(none.SupportsSampling);
    Assert.False(none.HasExtension(MetaKeys.TasksExtension));

    var rich = JsonSerializer.Deserialize<ClientCapabilities>(
      """{"elicitation":{"form":{}},"extensions":{"io.modelcontextprotocol/tasks":{}}}""", McpJson.Options)!;
    Assert.True(rich.SupportsElicitation);
    Assert.False(rich.SupportsElicitationUrl); // form only
    Assert.True(rich.HasExtension(MetaKeys.TasksExtension));
  }

  [Fact]
  public void ServerCapabilities_serialize_with_presence_semantics()
  {
    var caps = new ServerCapabilities
    {
      Tools = new ToolsCapability { ListChanged = true },
      Completions = new JsonObject(),
    };
    var json = McpJson.Serialize(caps);

    Assert.Contains("\"tools\":{\"listChanged\":true}", json);
    Assert.Contains("\"completions\":{}", json);
    Assert.DoesNotContain("logging", json); // absent => not advertised
    Assert.DoesNotContain("resources", json);
  }

  [Fact]
  public void DiscoverResult_serializes_required_fields()
  {
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = new ServerCapabilities { Tools = new ToolsCapability() },
      ServerInfo = new Implementation { Name = "srv", Version = "0.1.0" },
      Instructions = "Use search first.",
    };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"supportedVersions\":[\"2026-07-28\"]", json);
    Assert.Contains("\"serverInfo\":{\"name\":\"srv\",\"version\":\"0.1.0\"}", json);
    Assert.Contains("\"instructions\":\"Use search first.\"", json);
  }

  [Theory]
  [InlineData("2026-07-28", true)]
  [InlineData("2025-11-25", false)]
  [InlineData("not-a-date", false)]
  public void ProtocolRevision_is_matched_exactly(string revision, bool supported)
  {
    Assert.Equal(supported, ProtocolRevision.IsSupported(revision));
  }
}
