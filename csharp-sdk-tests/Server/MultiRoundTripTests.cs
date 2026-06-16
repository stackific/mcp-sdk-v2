using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// The multi-round-trip mechanism end-to-end (spec §11): a tool requests elicitation, the server
/// returns <c>input_required</c>, the client fulfills it via a registered handler and retries, and the
/// tool completes. Also verifies capability gating with <c>-32003</c> (§11.5).
/// </summary>
public sealed class MultiRoundTripTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static McpServer BuildServer()
  {
    var server = new McpServer(
      new Implementation { Name = "mrtr-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });

    server.RegisterTool(
      new Tool { Name = "register_user", InputSchema = Obj("""{"type":"object"}""") },
      async ctx =>
      {
        var result = await ctx.ElicitInputAsync(new ElicitRequestFormParams
        {
          Message = "Please register.",
          RequestedSchema = Obj("""{"type":"object","properties":{"username":{"type":"string"}},"required":["username"]}"""),
        });
        return result is { Action: ElicitationAction.Accept, Content: { } content }
          ? CallToolResult.FromText($"Registered {content["username"]!.GetValue<string>()}.")
          : CallToolResult.FromText($"User chose {result.Action}.");
      });

    return server;
  }

  [Fact]
  public async Task Elicitation_round_trip_completes_the_tool()
  {
    var capabilities = new ClientCapabilities { Elicitation = new ElicitationCapability { Form = new JsonObject() } };
    await using var client = InMemory.Connect(BuildServer(), capabilities: capabilities);
    await client.DiscoverAsync();

    var prompted = false;
    client.RegisterInputHandler(McpMethods.ElicitationCreate, parameters =>
    {
      prompted = true;
      Assert.Equal("form", parameters!["mode"]!.GetValue<string>());
      var response = new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["username"] = "neo" } };
      return Task.FromResult<JsonNode>(JsonSerializer.SerializeToNode(response, McpJson.Options)!);
    });

    var result = await client.CallToolWithInputAsync("register_user");

    Assert.True(prompted);
    Assert.Equal("complete", result["resultType"]!.GetValue<string>());
    Assert.Equal("Registered neo.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Decline_is_surfaced_to_the_tool()
  {
    var capabilities = new ClientCapabilities { Elicitation = new ElicitationCapability { Form = new JsonObject() } };
    await using var client = InMemory.Connect(BuildServer(), capabilities: capabilities);
    await client.DiscoverAsync();

    client.RegisterInputHandler(McpMethods.ElicitationCreate, _ =>
      Task.FromResult<JsonNode>(JsonSerializer.SerializeToNode(new ElicitResult { Action = ElicitationAction.Decline }, McpJson.Options)!));

    var result = await client.CallToolWithInputAsync("register_user");
    Assert.Equal("User chose Decline.", result["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Missing_client_capability_is_rejected_with_minus_32003()
  {
    // The client did NOT declare elicitation, so the server cannot emit the input request (§11.5).
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CallToolWithInputAsync("register_user"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
    Assert.True(error.ErrorData!["requiredCapabilities"]!["elicitation"] is not null);
  }
}
