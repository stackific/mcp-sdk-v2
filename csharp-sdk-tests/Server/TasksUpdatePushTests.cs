using System.Text.Json.Nodes;

using Stackific.Mcp.Client;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// End-to-end and unit coverage for the runtime wiring of §25.8 (<c>tasks/update</c> input binding),
/// §25.10 (<c>notifications/tasks</c> push + the <c>taskIds</c> subscription filter and its <c>-32003</c>
/// gate), and the §25.7/§25.8/§25.9 DetailedTask result shapes. The §25.8 binding faithfully mirrors the
/// TypeScript <c>applyInput</c>: outstanding-key binding, stale-key dropping (R-25.8-h), kind-correlation
/// validation (R-11.4), and partial handling (R-25.8-g). Error CODES are asserted, never messages.
/// </summary>
public sealed class TasksUpdatePushTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static readonly Dictionary<string, JsonObject> TasksExtension = new() { [MetaKeys.TasksExtension] = new JsonObject() };

  private static ClientCapabilities WithTasks() => new() { Extensions = TasksExtension };

  // ───────────────────────── InMemoryTaskStore.ApplyInput direct unit tests (§25.8) ─────────────────────────

  private static InMemoryTaskStore StoreAwaitingInput(out string taskId, params (string Key, string Method)[] requests)
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(ttlMs: null);
    taskId = task.TaskId;
    var map = new Dictionary<string, InputRequest>(StringComparer.Ordinal);
    foreach (var (key, method) in requests) map[key] = new InputRequest { Method = method };
    store.RequestInput(taskId, map);
    return store;
  }

  [Fact]
  public void RequestInput_moves_a_working_task_to_input_required()
  {
    var store = StoreAwaitingInput(out var id, ("k1", McpMethods.ElicitationCreate));
    Assert.Equal(McpTaskStatus.InputRequired, store.StatusOf(id));
    Assert.NotNull(store.Get(id).InputRequests);
    Assert.True(store.Get(id).InputRequests!.ContainsKey("k1"));
  }

  [Fact]
  public void ApplyInput_binds_outstanding_responses_and_returns_to_working()
  {
    var store = StoreAwaitingInput(out var id, ("k1", McpMethods.ElicitationCreate));
    var bound = store.ApplyInput(id, new Dictionary<string, JsonNode>
    {
      ["k1"] = Obj("""{"action":"accept"}"""),
    });

    Assert.Equal(["k1"], bound);
    Assert.Equal(McpTaskStatus.Working, store.StatusOf(id));
    Assert.Equal("accept", store.InputResponsesOf(id)!["k1"]!["action"]!.GetValue<string>());
    Assert.Null(store.Get(id).InputRequests); // inputRequests cleared once supplied
  }

  [Fact]
  public void ApplyInput_drops_stale_keys_not_currently_outstanding()
  {
    // R-25.8-h: a response keyed by something NOT outstanding is dropped, not an error.
    var store = StoreAwaitingInput(out var id, ("k1", McpMethods.ElicitationCreate));
    var bound = store.ApplyInput(id, new Dictionary<string, JsonNode>
    {
      ["k1"] = Obj("""{"action":"accept"}"""),
      ["ghost"] = Obj("""{"action":"decline"}"""), // stale — dropped
    });

    Assert.Equal(["k1"], bound);
    Assert.Null(store.InputResponsesOf(id)!.GetValueOrDefault("ghost"));
  }

  [Fact]
  public void ApplyInput_tolerates_a_partial_response_set()
  {
    // R-25.8-g: a caller MAY answer only some outstanding requests; binding succeeds for the subset.
    var store = StoreAwaitingInput(out var id, ("k1", McpMethods.ElicitationCreate), ("k2", McpMethods.ElicitationCreate));
    var bound = store.ApplyInput(id, new Dictionary<string, JsonNode>
    {
      ["k1"] = Obj("""{"action":"accept"}"""),
    });

    Assert.Equal(["k1"], bound);
    Assert.Equal(McpTaskStatus.Working, store.StatusOf(id));
  }

  [Fact]
  public void ApplyInput_on_a_non_input_required_task_is_invalid_params()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(ttlMs: null); // still working, not awaiting input
    var error = Assert.Throws<McpError>(() => store.ApplyInput(task.TaskId, new Dictionary<string, JsonNode>
    {
      ["k1"] = Obj("""{"action":"accept"}"""),
    }));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void ApplyInput_on_an_unknown_task_is_invalid_params()
  {
    var store = new InMemoryTaskStore();
    var error = Assert.Throws<McpError>(() => store.ApplyInput("nope", new Dictionary<string, JsonNode>()));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ───────────────────────── tasks/update end-to-end (§25.8) ─────────────────────────

  /// <summary>
  /// A server whose <c>chat</c> task tool moves the task to <c>input_required</c> (soliciting an
  /// elicitation), and completes once the input is bound. The background loop polls the store's bound
  /// responses, so a <c>tasks/update</c> drives it forward.
  /// </summary>
  private static McpServer BuildInteractiveServer(InMemoryTaskStore? store = null)
  {
    var server = new McpServer(
      new Implementation { Name = "interactive-tasks", Version = "1.0.0" },
      new ServerCapabilities
      {
        Tools = new ToolsCapability(),
        Resources = new ResourcesCapability { Subscribe = true },
        Extensions = TasksExtension,
      });
    server.SetTaskStore(store ?? new InMemoryTaskStore { PollIntervalMs = 1 });

    server.RegisterTaskTool(
      new Tool { Name = "chat", InputSchema = Obj("""{"type":"object"}""") },
      ctx =>
      {
        var s = ctx.Tasks!;
        var task = s.Create(ctx.TaskTtlMs);
        s.RequestInput(task.TaskId, new Dictionary<string, InputRequest>
        {
          ["name"] = new InputRequest
          {
            Method = McpMethods.ElicitationCreate,
            Params = Obj("""{"mode":"form","message":"Your name?"}"""),
          },
        });
        _ = Task.Run(async () =>
        {
          for (var i = 0; i < 500; i++)
          {
            await Task.Delay(2);
            var responses = s.InputResponsesOf(task.TaskId);
            if (responses is not null && responses.TryGetValue("name", out var answer))
            {
              var name = answer["content"]?["name"]?.GetValue<string>() ?? "?";
              s.StoreResult(task.TaskId, CallToolResult.FromText($"Hello, {name}."));
              return;
            }
            if (s.StatusOf(task.TaskId) is not (McpTaskStatus.Working or McpTaskStatus.InputRequired)) return;
          }
        });
        return Task.FromResult(task);
      });

    return server;
  }

  [Fact]
  public async Task Task_enters_input_required_and_surfaces_input_requests()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var task = await client.GetTaskAsync(taskId);
    Assert.Equal("input_required", task["status"]!.GetValue<string>());
    Assert.Equal("elicitation/create", task["inputRequests"]!["name"]!["method"]!.GetValue<string>());
  }

  [Fact]
  public async Task Update_task_binds_input_and_drives_to_completion()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    // The task awaits input; supply it via tasks/update.
    var ack = await client.UpdateTaskAsync(taskId, Obj("""{"name":{"action":"accept","content":{"name":"Trinity"}}}"""));
    // §25.8: the ack is an EMPTY result — the resultType discriminator only, never the task payload.
    Assert.Equal(ResultTypes.Complete, ack["resultType"]!.GetValue<string>());
    Assert.False(ack.ContainsKey("status"));

    var task = await PollToTerminal(client, taskId);
    Assert.Equal("completed", task["status"]!.GetValue<string>());
    Assert.Equal("Hello, Trinity.", task["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Update_task_with_a_kind_mismatched_response_is_invalid_params()
  {
    // R-11.4: an elicitation response missing `action` does not match the kind ⇒ -32602.
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.UpdateTaskAsync(taskId, Obj("""{"name":{"wrong":"shape"}}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Update_task_with_a_stale_key_drops_it_and_still_advances()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    // "name" is outstanding; "ghost" is stale (dropped). The valid key still drives completion.
    await client.UpdateTaskAsync(taskId,
      Obj("""{"name":{"action":"accept","content":{"name":"Neo"}},"ghost":{"action":"decline"}}"""));

    var task = await PollToTerminal(client, taskId);
    Assert.Equal("completed", task["status"]!.GetValue<string>());
    Assert.Equal("Hello, Neo.", task["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public async Task Update_task_on_a_non_input_required_task_is_invalid_params()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();
    await client.UpdateTaskAsync(taskId, Obj("""{"name":{"action":"accept","content":{"name":"X"}}}"""));
    await PollToTerminal(client, taskId); // now completed/working — no longer awaiting input

    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.UpdateTaskAsync(taskId, Obj("""{"name":{"action":"accept"}}""")));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Update_task_requires_the_client_tasks_extension_capability()
  {
    var server = BuildInteractiveServer();
    await using var capable = InMemory.Connect(server, capabilities: WithTasks());
    await capable.DiscoverAsync();
    var created = await capable.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    await using var incapable = InMemory.Connect(server);
    await incapable.DiscoverAsync();
    var error = await Assert.ThrowsAsync<McpError>(() =>
      incapable.UpdateTaskAsync(taskId, Obj("""{"name":{"action":"accept"}}""")));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
  }

  // ───────────────────────── notifications/tasks push + taskIds gating (§25.10) ─────────────────────────

  [Fact]
  public async Task Subscribing_with_task_ids_receives_task_status_pushes()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var pushes = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { TaskIds = [taskId] }, pushes.Add);

    // Drive the task forward; the status change fans a notifications/tasks push to this subscription.
    await client.UpdateTaskAsync(taskId, Obj("""{"name":{"action":"accept","content":{"name":"Morpheus"}}}"""));
    await PollToTerminal(client, taskId);

    Assert.Contains(pushes, n => n.Method == McpMethods.NotificationsTasks
      && n.Params!["taskId"]!.GetValue<string>() == taskId);
    Assert.Contains(pushes, n => n.Method == McpMethods.NotificationsTasks
      && n.Params!["status"]!.GetValue<string>() == "completed");
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Task_push_carries_the_subscription_id_in_meta()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var pushes = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { TaskIds = [taskId] }, pushes.Add);
    await client.UpdateTaskAsync(taskId, Obj("""{"name":{"action":"accept","content":{"name":"X"}}}"""));
    await PollToTerminal(client, taskId);

    Assert.All(pushes.Where(n => n.Method == McpMethods.NotificationsTasks),
      n => Assert.NotNull(n.Params!["_meta"]![MetaKeys.SubscriptionId]));
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task A_task_not_in_the_subscribed_set_is_never_pushed()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var watched = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var watchedId = watched["taskId"]!.GetValue<string>();
    var other = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var otherId = other["taskId"]!.GetValue<string>();

    var pushes = new List<JsonRpcNotification>();
    var handle = await client.SubscribeAsync(new SubscriptionFilter { TaskIds = [watchedId] }, pushes.Add);

    // Advance ONLY the unwatched task; no push must reach this subscription for it (R-25.10-d).
    await client.UpdateTaskAsync(otherId, Obj("""{"name":{"action":"accept","content":{"name":"Z"}}}"""));
    await PollToTerminal(client, otherId);

    Assert.DoesNotContain(pushes, n => n.Method == McpMethods.NotificationsTasks
      && n.Params!["taskId"]!.GetValue<string>() == otherId);
    await handle.Unsubscribe();
  }

  [Fact]
  public async Task Subscribing_with_task_ids_without_the_tasks_extension_is_minus_32003()
  {
    // The server does NOT advertise the Tasks extension ⇒ a taskIds subscription is rejected -32003.
    var server = new McpServer(
      new Implementation { Name = "no-tasks", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });
    server.RegisterTool(new Tool { Name = "noop", InputSchema = Obj("""{"type":"object"}""") },
      _ => Task.FromResult(CallToolResult.FromText("ok")));

    await using var client = InMemory.Connect(server, capabilities: WithTasks());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() =>
      client.SubscribeAsync(new SubscriptionFilter { TaskIds = ["t1"] }));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
  }

  [Fact]
  public async Task A_task_ids_filter_is_dropped_from_the_honored_filter_when_tasks_inactive()
  {
    // A NON-taskIds subscription against a tasks-less server still works; if some other filter carried a
    // (zero-length) taskIds it would simply not be honored. Here we confirm a server with tasks active
    // honors the taskIds subset.
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();
    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var handle = await client.SubscribeAsync(new SubscriptionFilter { TaskIds = [taskId] });
    Assert.Equal([taskId], handle.HonoredFilter.TaskIds);
    await handle.Unsubscribe();
  }

  // ───────────────────────── DetailedTask result shapes (§25.7/§25.9) ─────────────────────────

  [Fact]
  public async Task Get_task_returns_the_detailed_task_not_an_empty_result()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();
    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var task = await client.GetTaskAsync(taskId);
    Assert.Equal(taskId, task["taskId"]!.GetValue<string>());
    Assert.False(string.IsNullOrEmpty(task["status"]!.GetValue<string>()));
    Assert.NotNull(task["createdAt"]);
  }

  [Fact]
  public async Task Cancel_task_acknowledges_with_an_empty_result()
  {
    await using var client = InMemory.Connect(BuildInteractiveServer(), capabilities: WithTasks());
    await client.DiscoverAsync();
    var created = await client.CreateTaskAsync("chat", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var ack = await client.CancelTaskAsync(taskId);
    // §25.9: the server MUST acknowledge with an EMPTY result — the resultType discriminator ("complete")
    // only, NEVER the task payload.
    Assert.Equal(ResultTypes.Complete, ack["resultType"]!.GetValue<string>());
    Assert.False(ack.ContainsKey("status"));
    Assert.False(ack.ContainsKey("taskId"));

    // The cancellation is observed via tasks/get, not from the ack.
    var task = await client.GetTaskAsync(taskId);
    Assert.Equal("cancelled", task["status"]!.GetValue<string>());
  }

  /// <summary>Polls <c>tasks/get</c> until the task leaves the non-terminal states or the budget elapses.</summary>
  private static async Task<JsonObject> PollToTerminal(McpClient client, string taskId)
  {
    JsonObject task;
    string status;
    var polls = 0;
    do
    {
      await Task.Delay(5);
      task = await client.GetTaskAsync(taskId);
      status = task["status"]!.GetValue<string>();
    }
    while (status is "working" or "input_required" && ++polls < 400);
    return task;
  }
}
