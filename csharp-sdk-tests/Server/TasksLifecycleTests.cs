using System.Text.Json.Nodes;

using Stackific.Mcp.Client;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Testing;

namespace Stackific.Mcp.Tests.Server;

/// <summary>
/// Exhaustive lifecycle tests for the Tasks extension (spec §25). The first half drives
/// <see cref="InMemoryTaskStore"/> directly to pin every state transition and the terminal-state
/// immutability rule (§25.5); the second half drives the same behavior end-to-end through the
/// in-memory harness, covering the <c>resultType: "task"</c> handle (§25.3), polling to a terminal
/// state with the inline result (§25.7), and capability gating with <c>-32003</c> for both a server
/// that never advertised the extension and a client that did not declare it (§25.2). Error CODES are
/// asserted, never messages.
/// </summary>
public sealed class TasksLifecycleTests
{
  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();

  private static readonly Dictionary<string, JsonObject> TasksExtension = new() { [MetaKeys.TasksExtension] = new JsonObject() };

  // ───────────────────────── InMemoryTaskStore: direct unit tests ─────────────────────────

  [Fact]
  public void Create_yields_a_working_task_with_an_id()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(ttlMs: null);

    Assert.False(string.IsNullOrEmpty(task.TaskId));
    Assert.Equal(McpTaskStatus.Working, task.Status);
    Assert.Null(task.TtlMs);
  }

  [Fact]
  public void Create_records_the_supplied_ttl()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(ttlMs: 60000);
    Assert.Equal(60000L, task.TtlMs);
  }

  [Fact]
  public void Create_mints_distinct_ids()
  {
    var store = new InMemoryTaskStore();
    var a = store.Create(null);
    var b = store.Create(null);
    Assert.NotEqual(a.TaskId, b.TaskId);
  }

  [Fact]
  public void Create_stamps_created_and_updated_timestamps()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    Assert.False(string.IsNullOrEmpty(task.CreatedAt));
    Assert.Equal(task.CreatedAt, task.LastUpdatedAt);
  }

  [Fact]
  public void StatusOf_reflects_a_working_task()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    Assert.Equal(McpTaskStatus.Working, store.StatusOf(task.TaskId));
  }

  [Fact]
  public void StatusOf_is_null_for_an_unknown_id()
  {
    var store = new InMemoryTaskStore();
    Assert.Null(store.StatusOf("nope"));
  }

  [Fact]
  public void UpdateStatus_transitions_a_working_task()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.UpdateStatus(task.TaskId, McpTaskStatus.Working, "halfway");

    var detailed = store.Get(task.TaskId);
    Assert.Equal(McpTaskStatus.Working, detailed.Status);
    Assert.Equal("halfway", detailed.StatusMessage);
  }

  [Fact]
  public void UpdateStatus_can_move_to_input_required()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.UpdateStatus(task.TaskId, McpTaskStatus.InputRequired);
    Assert.Equal(McpTaskStatus.InputRequired, store.StatusOf(task.TaskId));
  }

  [Fact]
  public void UpdateStatus_on_an_unknown_id_is_a_no_op()
  {
    var store = new InMemoryTaskStore();
    store.UpdateStatus("nope", McpTaskStatus.Working); // must not throw
    Assert.Null(store.StatusOf("nope"));
  }

  [Fact]
  public void StoreResult_completes_the_task_with_an_inline_result()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.StoreResult(task.TaskId, CallToolResult.FromText("done"));

    var detailed = store.Get(task.TaskId);
    Assert.Equal(McpTaskStatus.Completed, detailed.Status);
    Assert.NotNull(detailed.Result);
    Assert.Equal("done", detailed.Result!["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public void StoreResult_tags_the_inline_result_as_complete()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.StoreResult(task.TaskId, CallToolResult.FromText("done"));

    var detailed = store.Get(task.TaskId);
    Assert.Equal(ResultTypes.Complete, detailed.Result!["resultType"]!.GetValue<string>());
  }

  [Fact]
  public void Completed_task_is_immutable_to_further_update_status()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.StoreResult(task.TaskId, CallToolResult.FromText("done"));

    store.UpdateStatus(task.TaskId, McpTaskStatus.Working, "should be ignored");

    var detailed = store.Get(task.TaskId);
    Assert.Equal(McpTaskStatus.Completed, detailed.Status);
    Assert.Null(detailed.StatusMessage);
  }

  [Fact]
  public void Completed_task_is_immutable_to_a_second_store_result()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.StoreResult(task.TaskId, CallToolResult.FromText("first"));
    store.StoreResult(task.TaskId, CallToolResult.FromText("second"));

    var detailed = store.Get(task.TaskId);
    Assert.Equal("first", detailed.Result!["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public void Fail_moves_the_task_to_failed_with_an_inline_error()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.Fail(task.TaskId, new JsonRpcError(ErrorCodes.InternalError, "broke", new JsonObject { ["why"] = "x" }));

    var detailed = store.Get(task.TaskId);
    Assert.Equal(McpTaskStatus.Failed, detailed.Status);
    Assert.NotNull(detailed.Error);
    Assert.Equal(ErrorCodes.InternalError, detailed.Error!["code"]!.GetValue<int>());
    Assert.Equal("x", detailed.Error!["data"]!["why"]!.GetValue<string>());
  }

  [Fact]
  public void Failed_task_is_immutable_to_further_transitions()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.Fail(task.TaskId, new JsonRpcError(ErrorCodes.InvalidParams, "bad"));

    store.StoreResult(task.TaskId, CallToolResult.FromText("late"));
    store.UpdateStatus(task.TaskId, McpTaskStatus.Working);

    var detailed = store.Get(task.TaskId);
    Assert.Equal(McpTaskStatus.Failed, detailed.Status);
    Assert.Null(detailed.Result);
  }

  [Fact]
  public void Cancel_moves_a_working_task_to_cancelled()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    var existed = store.Cancel(task.TaskId);

    Assert.True(existed);
    Assert.Equal(McpTaskStatus.Cancelled, store.StatusOf(task.TaskId));
  }

  [Fact]
  public void Cancel_of_an_unknown_id_returns_false()
  {
    var store = new InMemoryTaskStore();
    Assert.False(store.Cancel("nope"));
  }

  [Fact]
  public void Cancel_of_an_already_completed_task_does_not_change_it()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.StoreResult(task.TaskId, CallToolResult.FromText("done"));

    var existed = store.Cancel(task.TaskId);

    Assert.True(existed); // the task exists ...
    Assert.Equal(McpTaskStatus.Completed, store.StatusOf(task.TaskId)); // ... but stays completed.
  }

  [Fact]
  public void Cancel_of_an_already_cancelled_task_is_idempotent()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.Cancel(task.TaskId);
    store.Cancel(task.TaskId);
    Assert.Equal(McpTaskStatus.Cancelled, store.StatusOf(task.TaskId));
  }

  [Fact]
  public void Cancelled_task_is_immutable_to_a_later_result()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    store.Cancel(task.TaskId);

    store.StoreResult(task.TaskId, CallToolResult.FromText("too late"));

    Assert.Equal(McpTaskStatus.Cancelled, store.StatusOf(task.TaskId));
  }

  [Fact]
  public void Get_of_an_unknown_id_throws_invalid_params()
  {
    var store = new InMemoryTaskStore();
    var error = Assert.Throws<McpError>(() => store.Get("nope"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Get_of_an_unknown_id_echoes_the_task_id_in_data()
  {
    var store = new InMemoryTaskStore();
    var error = Assert.Throws<McpError>(() => store.Get("ghost"));
    Assert.Equal("ghost", error.ErrorData!["taskId"]!.GetValue<string>());
  }

  [Fact]
  public void Get_surfaces_the_poll_interval()
  {
    var store = new InMemoryTaskStore { PollIntervalMs = 750 };
    var task = store.Create(null);
    var detailed = store.Get(task.TaskId);
    Assert.Equal(750L, detailed.PollIntervalMs);
  }

  [Fact]
  public void Create_surfaces_the_default_poll_interval()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    Assert.Equal(500L, task.PollIntervalMs);
  }

  [Fact]
  public void Working_task_has_no_inline_result_or_error()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(null);
    var detailed = store.Get(task.TaskId);
    Assert.Null(detailed.Result);
    Assert.Null(detailed.Error);
  }

  [Fact]
  public void Get_reflects_the_ttl_on_a_detailed_task()
  {
    var store = new InMemoryTaskStore();
    var task = store.Create(ttlMs: 12345);
    var detailed = store.Get(task.TaskId);
    Assert.Equal(12345L, detailed.TtlMs);
  }

  // ───────────────────────── TTL expiry → not-found (§25.6/§25.11) ─────────────────────────

  /// <summary>A controllable clock for driving ttl expiry deterministically.</summary>
  private sealed class FakeClock
  {
    private DateTimeOffset _now = DateTimeOffset.UnixEpoch;
    public DateTimeOffset Now() => _now;
    public void Advance(long ms) => _now = _now.AddMilliseconds(ms);
  }

  [Fact]
  public void Get_before_ttl_elapses_still_returns_the_task()
  {
    var clock = new FakeClock();
    var store = new InMemoryTaskStore(clock.Now);
    var task = store.Create(ttlMs: 1000);

    clock.Advance(999); // not yet expired
    var detailed = store.Get(task.TaskId);
    Assert.Equal(McpTaskStatus.Working, detailed.Status);
  }

  [Fact]
  public void Get_at_exactly_ttl_treats_the_task_as_expired()
  {
    // The shared Tasks.IsTaskExpired uses elapsed-or-equal (now - created >= ttl), so the boundary tick
    // is already expired. (Documented deviation from the TS strict-`>` sweep.)
    var clock = new FakeClock();
    var store = new InMemoryTaskStore(clock.Now);
    var task = store.Create(ttlMs: 1000);

    clock.Advance(1000);
    var error = Assert.Throws<McpError>(() => store.Get(task.TaskId));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Get_after_ttl_elapses_is_not_found_with_invalid_params()
  {
    var clock = new FakeClock();
    var store = new InMemoryTaskStore(clock.Now);
    var task = store.Create(ttlMs: 1000);

    clock.Advance(5000);
    var error = Assert.Throws<McpError>(() => store.Get(task.TaskId));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Equal(task.TaskId, error.ErrorData!["taskId"]!.GetValue<string>());
  }

  [Fact]
  public void StatusOf_after_ttl_elapses_is_null()
  {
    var clock = new FakeClock();
    var store = new InMemoryTaskStore(clock.Now);
    var task = store.Create(ttlMs: 1000);

    clock.Advance(2000);
    Assert.Null(store.StatusOf(task.TaskId));
  }

  [Fact]
  public void An_unbounded_task_never_expires()
  {
    var clock = new FakeClock();
    var store = new InMemoryTaskStore(clock.Now);
    var task = store.Create(ttlMs: null);

    clock.Advance(1000L * 60 * 60 * 24 * 365 * 100); // a century
    var detailed = store.Get(task.TaskId);
    Assert.Equal(McpTaskStatus.Working, detailed.Status);
  }

  [Fact]
  public void Expiry_only_discards_the_expired_task()
  {
    var clock = new FakeClock();
    var store = new InMemoryTaskStore(clock.Now);
    var shortLived = store.Create(ttlMs: 1000);
    var longLived = store.Create(ttlMs: 100000);

    clock.Advance(2000);
    Assert.Throws<McpError>(() => store.Get(shortLived.TaskId));
    Assert.Equal(McpTaskStatus.Working, store.Get(longLived.TaskId).Status); // unaffected
  }

  [Fact]
  public async Task End_to_end_get_of_an_expired_task_is_invalid_params()
  {
    // A server whose store uses a fake clock; advancing the clock past the ttl makes tasks/get answer
    // -32602 (expired → discarded → not-found), exactly as for an id that never existed (§25.6/§25.11).
    var clock = new FakeClock();
    var server = new McpServer(
      new Implementation { Name = "ttl-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability(), Extensions = TasksExtension });
    server.SetTaskStore(new InMemoryTaskStore(clock.Now) { PollIntervalMs = 1 });
    server.RegisterTaskTool(
      new Tool { Name = "slow", InputSchema = Obj("""{"type":"object"}""") },
      ctx =>
      {
        var t = ctx.Tasks!.Create(ttlMs: 1000); // 1s lifetime
        return Task.FromResult(t);
      });

    await using var client = InMemory.Connect(server, capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("slow", Obj("""{}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    // Before expiry: tasks/get succeeds.
    var live = await client.GetTaskAsync(taskId);
    Assert.Equal("working", live["status"]!.GetValue<string>());

    // After expiry: tasks/get is -32602.
    clock.Advance(2000);
    var error = await Assert.ThrowsAsync<McpError>(() => client.GetTaskAsync(taskId));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ───────────────────────── End-to-end via the harness ─────────────────────────

  /// <summary>
  /// A server whose <c>long_job</c> tool is task-augmented: it creates the task, runs background steps,
  /// and stores the result. The poll interval is kept tiny so the polling tests stay fast.
  /// </summary>
  private static McpServer BuildServer()
  {
    var server = new McpServer(
      new Implementation { Name = "tasks-lifecycle-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability(), Extensions = TasksExtension });
    server.SetTaskStore(new InMemoryTaskStore { PollIntervalMs = 1 });

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
            await Task.Delay(5);
            if (store.StatusOf(task.TaskId) != McpTaskStatus.Working) return;
            store.UpdateStatus(task.TaskId, McpTaskStatus.Working, $"step {i}/{steps}");
          }
          store.StoreResult(task.TaskId, CallToolResult.FromText($"Completed {steps} steps."));
        });
        return Task.FromResult(task);
      });

    return server;
  }

  /// <summary>A server that advertises tools but NOT the Tasks extension capability (§25.2).</summary>
  private static McpServer BuildServerWithoutTasksExtension()
  {
    var server = new McpServer(
      new Implementation { Name = "plain-server", Version = "1.0.0" },
      new ServerCapabilities { Tools = new ToolsCapability() });
    server.RegisterTool(
      new Tool { Name = "ordinary", InputSchema = Obj("""{"type":"object"}""") },
      _ => Task.FromResult(CallToolResult.FromText("ok")));
    return server;
  }

  private static ClientCapabilities WithTasks() => new() { Extensions = TasksExtension };

  [Fact]
  public async Task Create_task_returns_a_task_handle_in_the_working_state()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":2}"""));
    Assert.Equal(ResultTypes.Task, created["resultType"]!.GetValue<string>());
    Assert.Equal("working", created["status"]!.GetValue<string>());
    Assert.False(string.IsNullOrEmpty(created["taskId"]!.GetValue<string>()));
  }

  [Fact]
  public async Task Create_task_handle_advertises_a_poll_interval()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":1}"""));
    Assert.Equal(1L, created["pollIntervalMs"]!.GetValue<long>());
  }

  [Fact]
  public async Task Polling_a_task_reaches_completed_with_an_inline_result()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":2}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var task = await PollToTerminal(client, taskId);
    Assert.Equal("completed", task["status"]!.GetValue<string>());
    Assert.Equal("Completed 2 steps.", task["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  // ───────────────────────── S39: client poll driver + cross-connection resume ─────────────────────────

  [Fact]
  public async Task Poll_task_until_terminal_drives_a_task_to_completed()
  {
    // §25.5/§25.7: the SDK's PollTaskUntilTerminalAsync polls tasks/get until a terminal status, honoring
    // the advertised pollIntervalMs, and returns only the terminal task.
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();
    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":3}"""));
    var taskId = created["taskId"]!.GetValue<string>();

    var terminal = await client.PollTaskUntilTerminalAsync(taskId, timeout: TimeSpan.FromSeconds(10));

    Assert.Equal("completed", terminal["status"]!.GetValue<string>());
    Assert.Equal("Completed 3 steps.", terminal["result"]!["content"]![0]!["text"]!.GetValue<string>());
  }

  [Fact]
  public void May_poll_now_honors_the_advertised_poll_interval()
  {
    // §25.7 (R-25.7-o): a first poll is always allowed; a later poll only after the interval has elapsed.
    Assert.True(Tasks.MayPollNow(lastPolledAtMs: null, nowMs: 1_000, pollIntervalMs: 500));  // first poll
    Assert.False(Tasks.MayPollNow(lastPolledAtMs: 1_000, nowMs: 1_200, pollIntervalMs: 500)); // too soon
    Assert.True(Tasks.MayPollNow(lastPolledAtMs: 1_000, nowMs: 1_500, pollIntervalMs: 500));  // interval elapsed
  }

  [Fact]
  public void Should_continue_polling_stops_on_terminal_or_cancel()
  {
    // §25.7 (R-25.7-p): keep polling while non-terminal and not cancelled; stop otherwise (R-25.9-k).
    Assert.True(Tasks.ShouldContinuePolling(McpTaskStatus.Working));
    Assert.True(Tasks.ShouldContinuePolling(McpTaskStatus.InputRequired));
    Assert.False(Tasks.ShouldContinuePolling(McpTaskStatus.Completed));
    Assert.False(Tasks.ShouldContinuePolling(McpTaskStatus.Failed));
    Assert.False(Tasks.ShouldContinuePolling(McpTaskStatus.Cancelled));
    Assert.False(Tasks.ShouldContinuePolling(McpTaskStatus.Working, cancelRequested: true));
  }

  [Fact]
  public async Task A_task_resolves_and_completes_over_a_fresh_connection_to_the_same_server()
  {
    // §25.6 (R-25.6-h): a task id is opaque and connection-agnostic. A task created over one connection
    // resolves — and polls to completion — over a SEPARATE connection to the same server (no affinity).
    var server = BuildServer();
    string taskId;
    await using (var a = InMemory.Connect(server, capabilities: WithTasks()))
    {
      await a.DiscoverAsync();
      var created = await a.CreateTaskAsync("long_job", Obj("""{"steps":2}"""));
      taskId = created["taskId"]!.GetValue<string>();
    }

    await using var b = InMemory.Connect(server, capabilities: WithTasks());
    await b.DiscoverAsync();
    var terminal = await b.PollTaskUntilTerminalAsync(taskId, timeout: TimeSpan.FromSeconds(10));

    Assert.Equal("completed", terminal["status"]!.GetValue<string>());
  }

  [Fact]
  public async Task Get_task_result_object_is_tagged_complete()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":1}"""));
    var task = await client.GetTaskAsync(created["taskId"]!.GetValue<string>());
    Assert.Equal(ResultTypes.Complete, task["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task Create_task_requires_the_client_tasks_extension_capability()
  {
    // No tasks extension on the client → -32003 (§25.2).
    await using var client = InMemory.Connect(BuildServer());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CreateTaskAsync("long_job"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
  }

  [Fact]
  public async Task Get_task_requires_the_client_tasks_extension_capability()
  {
    var server = BuildServer();
    // Create the task with a capable client, then query with one that lacks the capability.
    await using (var capable = InMemory.Connect(server, capabilities: WithTasks()))
    {
      await capable.DiscoverAsync();
      var created = await capable.CreateTaskAsync("long_job", Obj("""{"steps":50}"""));
      var taskId = created["taskId"]!.GetValue<string>();

      await using var incapable = InMemory.Connect(server);
      await incapable.DiscoverAsync();
      var error = await Assert.ThrowsAsync<McpError>(() => incapable.GetTaskAsync(taskId));
      Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
    }
  }

  [Fact]
  public async Task Cancel_task_requires_the_client_tasks_extension_capability()
  {
    var server = BuildServer();
    await using (var capable = InMemory.Connect(server, capabilities: WithTasks()))
    {
      await capable.DiscoverAsync();
      var created = await capable.CreateTaskAsync("long_job", Obj("""{"steps":50}"""));
      var taskId = created["taskId"]!.GetValue<string>();

      await using var incapable = InMemory.Connect(server);
      await incapable.DiscoverAsync();
      var error = await Assert.ThrowsAsync<McpError>(() => incapable.CancelTaskAsync(taskId));
      Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
    }
  }

  [Fact]
  public async Task Get_of_an_unknown_task_id_is_invalid_params()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.GetTaskAsync("does-not-exist"));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public async Task Cancel_transitions_a_long_task_to_cancelled()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":200}"""));
    var taskId = created["taskId"]!.GetValue<string>();
    await client.CancelTaskAsync(taskId);

    var task = await client.GetTaskAsync(taskId);
    Assert.Equal("cancelled", task["status"]!.GetValue<string>());
  }

  [Fact]
  public async Task Cancel_acknowledgement_is_an_empty_complete_result()
  {
    await using var client = InMemory.Connect(BuildServer(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var created = await client.CreateTaskAsync("long_job", Obj("""{"steps":200}"""));
    var ack = await client.CancelTaskAsync(created["taskId"]!.GetValue<string>());
    Assert.Equal(ResultTypes.Complete, ack["resultType"]!.GetValue<string>());
  }

  [Fact]
  public async Task A_server_without_the_tasks_extension_rejects_tasks_get_with_missing_capability()
  {
    // R-25.7-d: a Tasks method invoked when the SERVER has not advertised the extension is -32003
    // (missing required capability), NOT -32601 — matching the TypeScript taskOp gate.
    await using var client = InMemory.Connect(BuildServerWithoutTasksExtension(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.GetTaskAsync("anything"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
  }

  [Fact]
  public async Task A_server_without_the_tasks_extension_rejects_tasks_cancel_with_missing_capability()
  {
    // R-25.9-d: same gate as tasks/get — server-not-advertised is -32003, not -32601.
    await using var client = InMemory.Connect(BuildServerWithoutTasksExtension(), capabilities: WithTasks());
    await client.DiscoverAsync();

    var error = await Assert.ThrowsAsync<McpError>(() => client.CancelTaskAsync("anything"));
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, error.Code);
  }

  /// <summary>Polls <c>tasks/get</c> until the task leaves the <c>working</c> state or the budget elapses.</summary>
  private static async Task<JsonObject> PollToTerminal(McpClient client, string taskId)
  {
    JsonObject task;
    string status;
    var polls = 0;
    do
    {
      await Task.Delay(10);
      task = await client.GetTaskAsync(taskId);
      status = task["status"]!.GetValue<string>();
    }
    while (status == "working" && ++polls < 200);
    return task;
  }
}
