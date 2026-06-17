# Tasks

**Part VII · Extensions** · Book Ch 42 · Stories S39–S40 · sidebar `/tasks`

The Tasks extension turns a slow tool into an async job. A **task-augmented** `tools/call`
returns a handle immediately (a `CreateTaskResult`, `resultType:"task"`); the client polls
`tasks/get` until the status is terminal, and the `DetailedTask` carries the outcome
*inline* — `result` when completed, `error` when failed. This pattern traces the augmented
call → poll → inline-result flow across the three layers.

## Round-trip

```
demo (TasksPage)                               client host (Hono)
  createTask('long_job') ──POST /api/tasks/create──▶  api.createTask → client.createTask
      │                          ◀── { taskId, status:'working' } (CreateTaskResult)         │
      │  poll                                                                                 ▼
  getTask(taskId) ──POST /api/tasks/get──▶ api.getTask → client.getTask ──▶ MCP server
      ▲                          ◀── DetailedTask (status + inline result/error)    long_job
      └── render terminal DetailedTask ◀──── Streamable HTTP ────────────  taskStore steps
```

## 1 · Frontend — `demo/src/routes/tasks.tsx` + `demo/src/lib/api.ts`

The page creates the task (with a TTL), reads the `taskId` from the `CreateTaskResult`, then
polls `getTask` until the status is terminal — the terminal `DetailedTask` carries the
result inline:

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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

Two host routes mirror the two phases — create, then poll:

```ts
// ts-mcp-client/src/index.ts
// Tasks extension: create (augmented tools/call), poll status, fetch result, list.
app.post('/api/tasks/create', async (c) => {
  const { name, arguments: args, ttl } = await c.req.json<{ ... }>();
  return run(c, () => api.createTask(name, args ?? {}, ttl));
});
app.post('/api/tasks/get', async (c) => {
  const { taskId } = await c.req.json<{ taskId: string }>();
  return run(c, () => api.getTask(taskId));
});
```

`createTask` sends the augmented `tools/call` (with a `ttlMs`) that returns the
`CreateTaskResult`; `getTask` polls the handle:

```ts
// ts-mcp-client/src/mcp-client.ts
// Tasks extension: createTask sends an augmented tools/call (→ CreateTaskResult);
// poll via getTask, whose DetailedTask carries the inline result once terminal.
createTask: (name: string, args: Record<string, unknown>, ttl = 300000) =>
  withTrace(`tasks/create:${name}`, () => client!.createTask(name, args, { ttlMs: ttl })),
getTask: (taskId: string) => withTrace('tasks/get', () => client!.getTask(taskId)),
```

The client declares `tasks: {}` in its capabilities, which is what lets the augmented call
be negotiated in the first place:

```ts
// ts-mcp-client/src/mcp-client.ts
const CLIENT_CAPABILITIES = {
  elicitation: { form: {}, url: {} },
  sampling: {},
  roots: {},
  tasks: {},
} as const;
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`long_job` opts in with `execution: { taskSupport: 'required' }`. Its handler creates a
task via the `taskStore`, kicks off the background work, and **returns the handle
immediately** — the request completes before the job does:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'long_job',
  {
    title: 'Long Job (task)',
    description: 'Runs as a task: returns a handle immediately, works through N steps, then exposes the result.',
    inputSchema: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, maximum: 8, default: 4 }, label: { type: 'string', default: 'report' } } },
    execution: { taskSupport: 'required' },
  },
  async (args, ctx) => {
    const steps = Number(args.steps ?? 4);
    const label = String(args.label ?? 'report');
    const task = taskStore.createTask({ ttlMs: ctx.taskTtlMs ?? 300000 });
    // ...
    void (async () => {
      for (let i = 1; i <= steps; i++) {
        await delay(500);
        if (statusOf() !== 'working') return; // cancelled while we worked
        taskStore.updateStatus(task.taskId, 'working', `step ${i}/${steps}`);
      }
      if (statusOf() !== 'working') return;
      taskStore.storeResult(task.taskId, {
        content: [{ type: 'text', text: `Job "${label}" completed ${steps} steps.` }],
        structuredContent: { label, steps, finishedAt: new Date().toISOString() },
      });
    })();
    return { task };
  },
);
```

The store is wired up once, and the server declares the `tasks` capability so clients know
it supports the extension:

```ts
// ts-mcp-server/src/features.ts
tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
// ...
const taskStore = new InMemoryTaskStore();
server.setTaskStore(taskStore);
```

Each background step calls `taskStore.updateStatus`; the final `taskStore.storeResult`
makes the task terminal, and the inline result is what the next `tasks/get` returns. The
handler guards every transition with `statusOf() !== 'working'` so a `tasks/cancel` (which
makes the task terminal) never triggers an illegal status transition.

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
carries the result inline — there is no separate `tasks/result` in this revision.
