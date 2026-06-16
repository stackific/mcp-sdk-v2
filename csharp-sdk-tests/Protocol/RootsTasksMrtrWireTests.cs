using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape tests for the Deprecated Roots capability (spec §21.1), the
/// multi-round-trip result types (spec §11), and the Tasks extension (spec §25): the
/// <see cref="Root"/> / <see cref="ListRootsResult"/> shapes, the <see cref="InputRequest"/> /
/// <see cref="InputRequiredResult"/> shapes, the <see cref="ResultTypes"/> constants, the five
/// <see cref="McpTaskStatus"/> wire values, the status-discriminated <see cref="DetailedTask"/>
/// payload, the <see cref="CreateTaskResult"/> shape, the task request-params, and the task status
/// notification. All assertions cover REAL serialization behavior of <see cref="McpJson"/>.
/// </summary>
public sealed class RootsTasksMrtrWireTests
{
  private const string Created = "2026-06-15T00:00:00Z";
  private const string Updated = "2026-06-15T00:00:01Z";

  // ── Root ──

  [Fact]
  public void Root_emits_uri_only_when_name_and_meta_absent()
  {
    var json = McpJson.Serialize(new Root { Uri = "file:///work" });
    Assert.Contains("\"uri\":\"file:///work\"", json);
    Assert.DoesNotContain("\"name\"", json);
    Assert.DoesNotContain("\"_meta\"", json);
  }

  [Fact]
  public void Root_emits_name_and_meta_when_present()
  {
    var json = McpJson.Serialize(new Root
    {
      Uri = "file:///work",
      Name = "Workspace",
      Meta = new JsonObject { ["k"] = "v" },
    });
    Assert.Contains("\"name\":\"Workspace\"", json);
    Assert.Contains("\"_meta\":{\"k\":\"v\"}", json);
  }

  [Theory]
  [InlineData("file:///a")]
  [InlineData("file:///a/b/c")]
  [InlineData("file://host/share")]
  public void Root_round_trips_its_uri(string uri)
  {
    var back = McpJson.Deserialize<Root>(McpJson.Serialize(new Root { Uri = uri }))!;
    Assert.Equal(uri, back.Uri);
    Assert.Null(back.Name);
  }

  // ── ListRootsResult ──

  [Fact]
  public void List_roots_result_method_constant_is_correct()
  {
    Assert.Equal("roots/list", ListRootsResult.Method);
    Assert.Equal(ListRootsResult.Method, McpMethods.RootsList);
  }

  [Fact]
  public void List_roots_result_serializes_empty_array()
  {
    var json = McpJson.Serialize(new ListRootsResult { Roots = [] });
    Assert.Contains("\"roots\":[]", json);
  }

  [Fact]
  public void List_roots_result_round_trips_roots()
  {
    var json = McpJson.Serialize(new ListRootsResult
    {
      Roots = [new Root { Uri = "file:///a", Name = "A" }, new Root { Uri = "file:///b" }],
    });
    var back = McpJson.Deserialize<ListRootsResult>(json)!;
    Assert.Equal(2, back.Roots.Count);
    Assert.Equal("A", back.Roots[0].Name);
    Assert.Null(back.Roots[1].Name);
  }

  // ── InputRequest ──

  [Theory]
  [InlineData("elicitation/create")]
  [InlineData("sampling/createMessage")]
  [InlineData("roots/list")]
  public void Input_request_serializes_its_method(string method)
  {
    var json = McpJson.Serialize(new InputRequest { Method = method });
    Assert.Contains($"\"method\":\"{method}\"", json);
  }

  [Fact]
  public void Input_request_omits_absent_params()
  {
    var json = McpJson.Serialize(new InputRequest { Method = McpMethods.RootsList });
    Assert.DoesNotContain("\"params\"", json);
  }

  [Fact]
  public void Input_request_emits_params_when_present()
  {
    var json = McpJson.Serialize(new InputRequest
    {
      Method = McpMethods.ElicitationCreate,
      Params = new JsonObject { ["mode"] = "form", ["message"] = "Name?" },
    });
    Assert.Contains("\"params\":{\"mode\":\"form\",\"message\":\"Name?\"}", json);
  }

  [Fact]
  public void Input_request_round_trips_method_and_params()
  {
    var json = McpJson.Serialize(new InputRequest
    {
      Method = McpMethods.ElicitationCreate,
      Params = new JsonObject { ["mode"] = "url" },
    });
    var back = McpJson.Deserialize<InputRequest>(json)!;
    Assert.Equal(McpMethods.ElicitationCreate, back.Method);
    Assert.Equal("url", back.Params!["mode"]!.GetValue<string>());
  }

  // ── InputRequiredResult ──

  [Fact]
  public void Input_required_result_holds_keyed_input_requests_and_state()
  {
    var json = McpJson.Serialize(new InputRequiredResult
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
    });
    Assert.Contains("\"requestState\":\"opaque-blob\"", json);
    Assert.Contains("\"github-username\":", json);
    Assert.Contains("\"method\":\"elicitation/create\"", json);
  }

  [Fact]
  public void Input_required_result_state_only_is_the_load_shedding_signal()
  {
    // §11.5: a result with only requestState is the retry-later signal.
    var json = McpJson.Serialize(new InputRequiredResult { RequestState = "later" });
    Assert.Contains("\"requestState\":\"later\"", json);
    Assert.DoesNotContain("\"inputRequests\"", json);
  }

  [Fact]
  public void Input_required_result_round_trips_input_requests()
  {
    var json = McpJson.Serialize(new InputRequiredResult
    {
      InputRequests = new Dictionary<string, InputRequest>
      {
        ["q"] = new InputRequest { Method = McpMethods.RootsList },
      },
    });
    var back = McpJson.Deserialize<InputRequiredResult>(json)!;
    Assert.Equal(McpMethods.RootsList, back.InputRequests!["q"].Method);
  }

  // ── ResultTypes constants ──

  [Theory]
  [InlineData("complete")]
  [InlineData("input_required")]
  [InlineData("task")]
  public void Result_types_constants_are_the_spec_strings(string expected)
  {
    var actual = expected switch
    {
      "complete" => ResultTypes.Complete,
      "input_required" => ResultTypes.InputRequired,
      _ => ResultTypes.Task,
    };
    Assert.Equal(expected, actual);
  }

  // ── McpTaskStatus wire values ──

  [Theory]
  [InlineData(McpTaskStatus.Working, "working")]
  [InlineData(McpTaskStatus.InputRequired, "input_required")]
  [InlineData(McpTaskStatus.Completed, "completed")]
  [InlineData(McpTaskStatus.Failed, "failed")]
  [InlineData(McpTaskStatus.Cancelled, "cancelled")]
  public void Task_status_uses_its_wire_value(McpTaskStatus status, string wire)
  {
    Assert.Equal($"\"{wire}\"", McpJson.Serialize(status));
  }

  [Theory]
  [InlineData("\"working\"", McpTaskStatus.Working)]
  [InlineData("\"input_required\"", McpTaskStatus.InputRequired)]
  [InlineData("\"completed\"", McpTaskStatus.Completed)]
  [InlineData("\"failed\"", McpTaskStatus.Failed)]
  [InlineData("\"cancelled\"", McpTaskStatus.Cancelled)]
  public void Task_status_deserializes_from_its_wire_value(string raw, McpTaskStatus expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<McpTaskStatus>(raw));
  }

  // ── McpTask ──

  [Fact]
  public void Mcp_task_emits_required_fields()
  {
    var json = McpJson.Serialize(new McpTask
    {
      TaskId = "task-1",
      Status = McpTaskStatus.Working,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 300000,
    });
    Assert.Contains("\"taskId\":\"task-1\"", json);
    Assert.Contains("\"status\":\"working\"", json);
    Assert.Contains("\"createdAt\":\"2026-06-15T00:00:00Z\"", json);
    Assert.Contains("\"lastUpdatedAt\":\"2026-06-15T00:00:01Z\"", json);
    Assert.Contains("\"ttlMs\":300000", json);
  }

  [Fact]
  public void Mcp_task_emits_null_ttl_and_omits_absent_optionals()
  {
    var json = McpJson.Serialize(new McpTask
    {
      TaskId = "t",
      Status = McpTaskStatus.Working,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = null,
    });
    Assert.Contains("\"ttlMs\":null", json); // REQUIRED (number | null) — emitted as null (§25.4)
    Assert.DoesNotContain("\"statusMessage\"", json);
    Assert.DoesNotContain("\"pollIntervalMs\"", json);
  }

  [Fact]
  public void Mcp_task_emits_status_message_and_poll_interval()
  {
    var json = McpJson.Serialize(new McpTask
    {
      TaskId = "t",
      Status = McpTaskStatus.Working,
      StatusMessage = "uploading",
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
      PollIntervalMs = 250,
    });
    Assert.Contains("\"statusMessage\":\"uploading\"", json);
    Assert.Contains("\"pollIntervalMs\":250", json);
  }

  // ── DetailedTask: status-discriminated payload ──

  [Fact]
  public void Detailed_task_working_carries_no_payload_members()
  {
    var json = McpJson.Serialize(new DetailedTask
    {
      TaskId = "t",
      Status = McpTaskStatus.Working,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
    });
    Assert.Contains("\"status\":\"working\"", json);
    Assert.DoesNotContain("\"inputRequests\"", json);
    Assert.DoesNotContain("\"result\"", json);
    Assert.DoesNotContain("\"error\"", json);
  }

  [Fact]
  public void Detailed_task_input_required_carries_input_requests_only()
  {
    var json = McpJson.Serialize(new DetailedTask
    {
      TaskId = "t",
      Status = McpTaskStatus.InputRequired,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
      InputRequests = new Dictionary<string, InputRequest>
      {
        ["q"] = new InputRequest { Method = McpMethods.ElicitationCreate, Params = new JsonObject { ["mode"] = "form" } },
      },
    });
    Assert.Contains("\"status\":\"input_required\"", json);
    Assert.Contains("\"inputRequests\":", json);
    Assert.DoesNotContain("\"result\"", json);
    Assert.DoesNotContain("\"error\"", json);
  }

  [Fact]
  public void Detailed_task_completed_carries_result_only()
  {
    var json = McpJson.Serialize(new DetailedTask
    {
      TaskId = "t",
      Status = McpTaskStatus.Completed,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
      Result = new JsonObject { ["resultType"] = "complete", ["content"] = new JsonArray() },
    });
    Assert.Contains("\"status\":\"completed\"", json);
    Assert.Contains("\"result\":{", json);
    Assert.DoesNotContain("\"inputRequests\"", json);
    Assert.DoesNotContain("\"error\"", json);
  }

  [Fact]
  public void Detailed_task_failed_carries_error_only()
  {
    var json = McpJson.Serialize(new DetailedTask
    {
      TaskId = "t",
      Status = McpTaskStatus.Failed,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
      Error = new JsonObject { ["code"] = -32000, ["message"] = "boom" },
    });
    Assert.Contains("\"status\":\"failed\"", json);
    Assert.Contains("\"error\":{", json);
    Assert.DoesNotContain("\"result\"", json);
    Assert.DoesNotContain("\"inputRequests\"", json);
  }

  [Fact]
  public void Detailed_task_cancelled_carries_no_payload_members()
  {
    var json = McpJson.Serialize(new DetailedTask
    {
      TaskId = "t",
      Status = McpTaskStatus.Cancelled,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = null,
    });
    Assert.Contains("\"status\":\"cancelled\"", json);
    Assert.DoesNotContain("\"result\"", json);
    Assert.DoesNotContain("\"error\"", json);
    Assert.DoesNotContain("\"inputRequests\"", json);
  }

  [Fact]
  public void Detailed_task_completed_round_trips_result()
  {
    var json = McpJson.Serialize(new DetailedTask
    {
      TaskId = "t",
      Status = McpTaskStatus.Completed,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
      Result = new JsonObject { ["resultType"] = "complete" },
    });
    var back = McpJson.Deserialize<DetailedTask>(json)!;
    Assert.Equal(McpTaskStatus.Completed, back.Status);
    Assert.Equal("complete", back.Result!["resultType"]!.GetValue<string>());
    Assert.Null(back.Error);
    Assert.Null(back.InputRequests);
  }

  // ── CreateTaskResult ──

  [Fact]
  public void Create_task_result_emits_task_fields_without_result_type()
  {
    var json = McpJson.Serialize(new CreateTaskResult
    {
      TaskId = "t",
      Status = McpTaskStatus.Working,
      CreatedAt = Created,
      LastUpdatedAt = Created,
      TtlMs = null,
    });
    Assert.Contains("\"taskId\":\"t\"", json);
    Assert.Contains("\"status\":\"working\"", json);
    Assert.DoesNotContain("resultType", json); // injected by the runtime, not the record
    Assert.Contains("\"ttlMs\":null", json); // REQUIRED (number | null) — emitted as null (§25.4)
  }

  [Fact]
  public void Create_task_result_emits_meta_when_present()
  {
    var json = McpJson.Serialize(new CreateTaskResult
    {
      TaskId = "t",
      Status = McpTaskStatus.Working,
      CreatedAt = Created,
      LastUpdatedAt = Created,
      TtlMs = 5000,
      Meta = new JsonObject { ["x"] = 1 },
    });
    Assert.Contains("\"_meta\":{\"x\":1}", json);
    Assert.Contains("\"ttlMs\":5000", json);
  }

  [Fact]
  public void Create_task_result_round_trips_fields()
  {
    var json = McpJson.Serialize(new CreateTaskResult
    {
      TaskId = "abc",
      Status = McpTaskStatus.Working,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 60000,
      PollIntervalMs = 500,
    });
    var back = McpJson.Deserialize<CreateTaskResult>(json)!;
    Assert.Equal("abc", back.TaskId);
    Assert.Equal(60000L, back.TtlMs);
    Assert.Equal(500L, back.PollIntervalMs);
  }

  // ── Task request params ──

  [Fact]
  public void Get_task_request_params_carry_task_id()
  {
    var json = McpJson.Serialize(new GetTaskRequestParams { TaskId = "g-1" });
    Assert.Contains("\"taskId\":\"g-1\"", json);
  }

  [Fact]
  public void Cancel_task_request_params_carry_task_id()
  {
    var json = McpJson.Serialize(new CancelTaskRequestParams { TaskId = "c-1" });
    Assert.Contains("\"taskId\":\"c-1\"", json);
  }

  [Fact]
  public void Update_task_request_params_carry_id_and_keyed_responses()
  {
    var json = McpJson.Serialize(new UpdateTaskRequestParams
    {
      TaskId = "u-1",
      InputResponses = new Dictionary<string, JsonNode>
      {
        ["q"] = new JsonObject { ["action"] = "accept", ["content"] = new JsonObject { ["name"] = "neo" } },
      },
    });
    Assert.Contains("\"taskId\":\"u-1\"", json);
    Assert.Contains("\"inputResponses\":{", json);
    Assert.Contains("\"action\":\"accept\"", json);
  }

  [Fact]
  public void Update_task_request_params_round_trip_responses()
  {
    var json = McpJson.Serialize(new UpdateTaskRequestParams
    {
      TaskId = "u-2",
      InputResponses = new Dictionary<string, JsonNode> { ["k"] = JsonValue.Create(1) },
    });
    var back = McpJson.Deserialize<UpdateTaskRequestParams>(json)!;
    Assert.Equal("u-2", back.TaskId);
    Assert.Equal(1, back.InputResponses["k"]!.GetValue<int>());
  }

  // ── TaskStatusNotificationParams ──

  [Fact]
  public void Task_status_notification_method_constant_is_correct()
  {
    Assert.Equal("notifications/tasks", TaskStatusNotificationParams.Method);
    Assert.Equal(TaskStatusNotificationParams.Method, McpMethods.NotificationsTasks);
  }

  [Fact]
  public void Task_status_notification_completed_carries_result_only()
  {
    var json = McpJson.Serialize(new TaskStatusNotificationParams
    {
      TaskId = "t",
      Status = McpTaskStatus.Completed,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
      Result = new JsonObject { ["resultType"] = "complete" },
    });
    Assert.Contains("\"status\":\"completed\"", json);
    Assert.Contains("\"result\":{", json);
    Assert.DoesNotContain("\"error\"", json);
    Assert.DoesNotContain("\"inputRequests\"", json);
  }

  [Fact]
  public void Task_status_notification_failed_carries_error_only()
  {
    var json = McpJson.Serialize(new TaskStatusNotificationParams
    {
      TaskId = "t",
      Status = McpTaskStatus.Failed,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = 1000,
      Error = new JsonObject { ["code"] = -32001, ["message"] = "nope" },
    });
    Assert.Contains("\"status\":\"failed\"", json);
    Assert.Contains("\"error\":{", json);
    Assert.DoesNotContain("\"result\"", json);
  }

  [Fact]
  public void Task_status_notification_round_trips_task_id_and_status()
  {
    var json = McpJson.Serialize(new TaskStatusNotificationParams
    {
      TaskId = "n-1",
      Status = McpTaskStatus.Working,
      CreatedAt = Created,
      LastUpdatedAt = Updated,
      TtlMs = null,
      StatusMessage = "still going",
    });
    var back = McpJson.Deserialize<TaskStatusNotificationParams>(json)!;
    Assert.Equal("n-1", back.TaskId);
    Assert.Equal(McpTaskStatus.Working, back.Status);
    Assert.Equal("still going", back.StatusMessage);
    Assert.Null(back.TtlMs);
  }
}
