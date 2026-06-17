# Tasks

**Part VII · Extensions** · Book Ch 42 · Stories S39–S40 · sidebar `/tasks`

The Tasks extension turns a slow tool into an async job. A **task-augmented** `tools/call`
returns a handle immediately (a `CreateTaskResult`, `resultType:"task"`); the client polls
`tasks/get` until the status is terminal, and the `DetailedTask` carries the outcome
*inline* — `result` when completed, `error` when failed. This pattern traces the augmented
call → poll → inline-result flow across the three layers.

## Round-trip

```
demo (TasksPage)                               client host (ASP.NET Core)
  createTask('long_job') ──POST /api/tasks/create──▶  CreateTaskAsync (augmented tools/call)
      │                          ◀── { taskId, status:'working' } (CreateTaskResult)         │
      │  poll                                                                                 ▼
  getTask(taskId) ──POST /api/tasks/get──▶ GetTaskAsync ──▶ MCP server
      ▲                          ◀── DetailedTask (status + inline result/error)    long_job
      └── render terminal DetailedTask ◀──── Streamable HTTP ────────────  SDK task store steps
```

## 1 · Frontend — `demo/src/routes/tasks.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected
language switch routes the call to the C# client host. The page creates the task (with a
TTL), reads the `taskId` from the `CreateTaskResult`, then polls `getTask` until the status
is terminal — the terminal `DetailedTask` carries the result inline:

```tsx
// demo/src/routes/tasks.tsx
const created = await backend.createTask('long_job', { steps: 4, label: 'report' }, 300000);
// CreateTaskResult: the Task fields are flattened with resultType:"task".
const id = (created.result as any)?.taskId as string;
let status = (created.result as any)?.status ?? 'working';
// Poll tasks/get until terminal. Its DetailedTask carries the outcome INLINE
// (result when completed, error when failed) — there is no separate tasks/result.
for (let i = 0; i < 30 && !TERMINAL.has(status) && !cancelled.current; i++) {
  await sleep(600);
  const g = await backend.getTask(id);
  if (!g.ok) break;
  const t = g.result as any; // GetTaskResult = DetailedTask + resultType:"complete"
  status = t?.status ?? status;
}
```

```ts
// demo/src/lib/api.ts
createTask: (name: string, args: Record<string, unknown>, ttl?: number) =>
  postJson<ApiResult<Any>>('/api/tasks/create', { name, arguments: args, ttl }),
getTask: (taskId: string) => postJson<ApiResult<Any>>('/api/tasks/get', { taskId }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

Two host routes mirror the two phases — create, then poll. Both are **literal** routes (they
win over the catch-all), so tasks are fully wired in the C# stack:

```csharp
// csharp-mcp-client/Program.cs
// Tasks extension (augmented tools/call → poll status → fetch result).
app.MapPost("/api/tasks/create", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tasks/create:{name}", c => Box(c.CreateTaskAsync(name, args)));
}));
app.MapPost("/api/tasks/get", (JsonObject body) => Run(async () =>
  await host.WithTraceAsync<object?>("tasks/get", c => Box(c.GetTaskAsync(body["taskId"]!.GetValue<string>())))));
```

`CreateTaskAsync` sends the augmented `tools/call` that returns the `CreateTaskResult`;
`GetTaskAsync` polls the handle. Both are SDK `McpClient` methods — the augmented call is
negotiated because the SDK client declares the tasks extension in its capabilities:

```csharp
// csharp-sdk/Client/McpClient.cs
public Task<JsonObject> CreateTaskAsync(string name, JsonObject? arguments = null, long? ttlMs = DefaultTaskTtlMs)
// ...
public Task<JsonObject> GetTaskAsync(string taskId) =>
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`long_job` opts in by registering through `RegisterTaskTool` — the SDK's task-aware
overload. Its handler creates a task via `ctx.Tasks` (the SDK-managed task store), kicks off
the background work with `Task.Run`, and **returns the handle immediately** — the request
completes before the job does:

```csharp
// csharp-mcp-server/Features.cs
server.RegisterTaskTool(
  new Tool
  {
    Name = "long_job",
    Title = "Long Job (task)",
    Description = "Runs as a task: returns a handle immediately, works through N steps, then exposes the result via tasks/get.",
    InputSchema = Schema("""{"type":"object","properties":{"steps":{"type":"integer","minimum":1,"maximum":8,"default":4},"label":{"type":"string","default":"report"}}}"""),
  },
  ctx =>
  {
    var steps = (int)ctx.GetInt("steps", 4);
    var label = ctx.GetString("label", "report");
    var store = ctx.Tasks!;
    var task = store.Create(ctx.TaskTtlMs);

    _ = Task.Run(async () =>
    {
      try
      {
        for (var i = 1; i <= steps; i++)
        {
          await Task.Delay(500);
          if (store.StatusOf(task.TaskId) != McpTaskStatus.Working) return; // cancelled/expired
          store.UpdateStatus(task.TaskId, McpTaskStatus.Working, $"step {i}/{steps}");
        }
        if (store.StatusOf(task.TaskId) != McpTaskStatus.Working) return;
        store.StoreResult(task.TaskId, new CallToolResult
        {
          Content = [ContentBlocks.Text($"Job \"{label}\" completed {steps} steps.")],
          StructuredContent = new JsonObject { ["label"] = label, ["steps"] = steps, ["finishedAt"] = DateTimeOffset.UtcNow.ToString("O") },
        });
      }
      catch (Exception error)
      {
        if (store.StatusOf(task.TaskId) == McpTaskStatus.Working)
        {
          store.Fail(task.TaskId, McpError.InternalError($"job failed: {error.Message}").ToJsonRpcError());
        }
      }
    });

    return Task.FromResult(task);
  });
```

Unlike the TypeScript reference (which constructs an `InMemoryTaskStore` and calls
`setTaskStore`), the C# `RegisterTaskTool` overload wires the store for you and surfaces it
as `ctx.Tasks`. The server just declares the tasks extension capability so clients know it
supports it:

```csharp
// csharp-mcp-server/Features.cs
Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject(), [MetaKeys.UiExtension] = new JsonObject() },
```

Each background step calls `store.UpdateStatus`; the final `store.StoreResult` makes the task
terminal, and the inline result is what the next `tasks/get` returns. The handler guards
every transition with `store.StatusOf(...) != McpTaskStatus.Working` so a `tasks/cancel`
(which makes the task terminal) never triggers an illegal status transition, and the
`catch` reports a job failure via `store.Fail` with a JSON-RPC error.

## On the wire

```
→ tools/call { name: "long_job", arguments: { steps: 4 }, _meta: { "io.modelcontextprotocol/task": { ttlMs: 300000 } } }
← { result: { resultType: "task", taskId: "…", status: "working" } }     // CreateTaskResult — immediate

→ tasks/get { taskId: "…" }
← { result: { resultType: "complete", taskId: "…", status: "working", statusMessage: "step 2/4" } }
   …poll…
→ tasks/get { taskId: "…" }
← { result: { resultType: "complete", status: "completed",
              result: { content: [{ type: "text", text: "Job \"report\" completed 4 steps." }], structuredContent: { … } } } }
```

The key shift from a plain [tool](./tools.md): the augmented `tools/call` returns a
`CreateTaskResult` *immediately* rather than blocking, and the terminal `DetailedTask`
carries the result inline — there is no separate `tasks/result` in this revision. See
[MCP Apps](./apps.md) for the sibling extension and [Errors](./errors.md) for how a failed
poll (`-32602` on an unknown/expired task) is shaped by the host.
