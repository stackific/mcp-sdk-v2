using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// The Tasks extension end-to-end (spec §25): a task-augmented tool returns a handle immediately, the
/// client polls <c>tasks/get</c> to a terminal state, and capability gating (§25.2) + unknown-id
/// handling (§25.7) behave per spec.
/// </summary>
public sealed class TasksTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static readonly Dictionary<string, JsonObject> TasksExtension = new() { [MetaKeys.TasksExtension] = new JsonObject() };

  private static McpServer BuildServer()
  {
    var server = new McpServer(
      new Implementation { Name = "tasks-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability(), Extensions = TasksExtension });

    server.RegisterTaskTool(
      new Tool { Name = "long_job", InputSchema = Obj("""{"type":"object","properties":{"steps":{"type":"integer"}}}""") },
      ctx =>
      {
        var steps = (int)ctx.GetInt("steps", 3);
        var store = ctx.Tasks!;
        var task = store.Create(ctx.TaskTtlMs);
        _ = Task.Run(async () =>
        {
          for (var i = 1; i <= steps; i++)
          {
            await Task.Delay(10);
            if (store.StatusOf(task.TaskId) != McpTaskStatus.Working) return;
            store.UpdateStatus(task.TaskId, McpTaskStatus.Working, $"step {i}/{steps}");
          }
          store.StoreResult(task.TaskId, CallToolResult.FromText($"Completed {steps} steps."));
        });
        return Task.FromResult(task);
      });

    return server;
  }

  [Fact]
  public async Task Task_augmented_call_returns_a_handle_then_completes()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: new ClientCapabilities { Extensions = TasksExtension });
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":2}"""));
    Assert.Equal(ResultTypes.Task, created["resultType"]!.GetValue<string>());
    Assert.Equal("working", created["status"]!.GetValue<string>());
    var taskId = created["taskId"]!.GetValue<string>();

    JsonObject task;
    string status;
    var polls = 0;
    do
    {
      await Task.Delay(20);
      task = await client.GetTaskAsync(taskId);
      status = task["status"]!.GetValue<string>();
    }
    while (status == "working" && ++polls < 100);

    Assert.Equal("completed", status);
    Assert.Equal("Completed 2 steps.", task["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Tasks_require_the_client_extension_capability()
  {
    // The client did NOT declare the Tasks extension, so a task-augmented call is rejected (§25.2).
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CreateTaskAsync("long_job"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
  }

  [Fact]
  public async Task Unknown_task_id_is_invalid_params()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: new ClientCapabilities { Extensions = TasksExtension });
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.GetTaskAsync("does-not-exist"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Cancel_transitions_a_task_to_cancelled()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: new ClientCapabilities { Extensions = TasksExtension });
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":50}"""));
    var taskId = created["taskId"]!.GetValue<string>();
    await client.CancelTaskAsync(taskId);

    var task = await client.GetTaskAsync(taskId);
    Assert.Equal("cancelled", task["status"]!.GetValue<string>());
  }
}
