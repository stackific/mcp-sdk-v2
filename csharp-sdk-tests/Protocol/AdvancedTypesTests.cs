using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Wire-shape validation for the advanced protocol types — utilities (§15), elicitation (§20),
/// sampling (§21), tasks (§25), subscriptions (§10), and the multi-round-trip result (§11).
/// </summary>
public sealed class AdvancedTypesTests
{
  [Fact]
  public void Progress_token_preserves_string_vs_number()
  {
    var asNumber = McpJson.Serialize(new ProgressNotificationParams { ProgressToken = 7L, Progress = 0.5, Total = 1 });
    Assert.Contains("\"progressToken\":7", asNumber);
    Assert.Contains("\"progress\":0.5", asNumber);

    var asString = McpJson.Serialize(new ProgressNotificationParams { ProgressToken = "abc-123", Progress = 1 });
    Assert.Contains("\"progressToken\":\"abc-123\"", asString);
  }

  [Fact]
  public void Logging_levels_use_lowercase_syslog_names()
  {
    var json = McpJson.Serialize(new LoggingMessageNotificationParams { Level = LoggingLevel.Warning, Data = JsonValue.Create("disk full") });
    Assert.Contains("\"level\":\"warning\"", json);
  }

  [Fact]
  public void Elicitation_form_and_url_modes_carry_the_mode_discriminator()
  {
    ElicitRequestParams form = new ElicitRequestFormParams
    {
      Message = "Register",
      RequestedSchema = new JsonObject { ["type"] = "object" },
    };
    var formJson = McpJson.Serialize(form);
    Assert.Contains("\"mode\":\"form\"", formJson);
    Assert.Contains("\"requestedSchema\":", formJson);

    ElicitRequestParams url = new ElicitRequestURLParams { Message = "Confirm", ElicitationId = "p-1", Url = "http://x/elicit/p-1" };
    var urlJson = McpJson.Serialize(url);
    Assert.Contains("\"mode\":\"url\"", urlJson);

    var back = Assert.IsType<ElicitRequestURLParams>(McpJson.Deserialize<ElicitRequestParams>(urlJson));
    Assert.Equal("p-1", back.ElicitationId);
  }

  [Fact]
  public void Elicit_result_action_round_trips()
  {
    var result = new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["username"] = "neo" } };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"action\":\"accept\"", json);

    var back = McpJson.Deserialize<ElicitResult>(json)!;
    Assert.Equal(ElicitationAction.Accept, back.Action);
    Assert.Equal("neo", back.Content!["username"]!.GetValue<string>());
  }

  [Fact]
  public void Sampling_content_union_carries_tool_use_discriminator()
  {
    SamplingMessageContentBlock toolUse = new ToolUseContent { Id = "t1", Name = "add", Input = new JsonObject { ["a"] = 1 } };
    var json = McpJson.Serialize(toolUse);
    Assert.Contains("\"type\":\"tool_use\"", json);

    var request = new CreateMessageRequestParams
    {
      Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text("hi")] }],
      MaxTokens = 200,
    };
    Assert.Contains("\"maxTokens\":200", McpJson.Serialize(request));
  }

  [Fact]
  public void Create_message_result_round_trips()
  {
    var result = new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text("Summary.")],
      Model = "deepseek-chat",
      StopReason = "endTurn",
    };
    var back = McpJson.Deserialize<CreateMessageResult>(McpJson.Serialize(result))!;
    Assert.Equal("deepseek-chat", back.Model);
    Assert.Equal(Role.Assistant, back.Role);
  }

  [Fact]
  public void Task_status_input_required_uses_snake_case_wire_value()
  {
    var detailed = new DetailedTask
    {
      TaskId = "task-1",
      Status = McpTaskStatus.InputRequired,
      CreatedAt = "2026-06-15T00:00:00Z",
      LastUpdatedAt = "2026-06-15T00:00:01Z",
      TtlMs = 300000,
      InputRequests = new Dictionary<string, InputRequest>
      {
        ["q"] = new InputRequest { Method = McpMethods.ElicitationCreate, Params = new JsonObject { ["mode"] = "form" } },
      },
    };
    var json = McpJson.Serialize(detailed);
    Assert.Contains("\"status\":\"input_required\"", json);
    Assert.Contains("\"inputRequests\":", json);

    var back = McpJson.Deserialize<DetailedTask>(json)!;
    Assert.Equal(McpTaskStatus.InputRequired, back.Status);
    Assert.Equal(McpMethods.ElicitationCreate, back.InputRequests!["q"].Method);
  }

  [Fact]
  public void Create_task_result_omits_runtime_supplied_result_type()
  {
    var json = McpJson.Serialize(new CreateTaskResult
    {
      TaskId = "t",
      Status = McpTaskStatus.Working,
      CreatedAt = "2026-06-15T00:00:00Z",
      LastUpdatedAt = "2026-06-15T00:00:00Z",
      TtlMs = null,
    });
    Assert.Contains("\"taskId\":\"t\"", json);
    Assert.DoesNotContain("resultType", json); // injected by the runtime, not the record
    Assert.Contains("\"ttlMs\":null", json); // REQUIRED (number | null) — emitted as null, never omitted (§25.4)
  }

  [Fact]
  public void Subscription_filter_only_emits_requested_kinds()
  {
    var json = McpJson.Serialize(new SubscriptionFilter
    {
      ToolsListChanged = true,
      ResourceSubscriptions = ["docs://readme"],
    });
    Assert.Contains("\"toolsListChanged\":true", json);
    Assert.Contains("\"resourceSubscriptions\":[\"docs://readme\"]", json);
    Assert.DoesNotContain("promptsListChanged", json);
  }

  [Fact]
  public void Input_required_result_holds_keyed_input_requests()
  {
    var result = new InputRequiredResult
    {
      InputRequests = new Dictionary<string, InputRequest>
      {
        ["github-username"] = new InputRequest
        {
          Method = McpMethods.ElicitationCreate,
          Params = new JsonObject { ["mode"] = "form", ["message"] = "Username?" },
        },
      },
      RequestState = "opaque-blob",
    };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"requestState\":\"opaque-blob\"", json);
    Assert.Contains("\"github-username\":", json);
    Assert.Contains("\"method\":\"elicitation/create\"", json);
  }
}
