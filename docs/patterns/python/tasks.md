# Tasks

**Part VII · Extensions** · Book Ch 42 · Stories S39–S40 · sidebar `/tasks`

The Tasks extension turns a slow tool into an async job. A **task-augmented** `tools/call`
returns a handle immediately (a `CreateTaskResult`, `resultType:"task"`); the client polls
`tasks/get` until the status is terminal, and the `DetailedTask` carries the outcome
*inline* — `result` when completed, `error` when failed. This pattern traces the augmented
call → poll → inline-result flow across the three layers.

## Round-trip

```
demo (TasksPage)                               client host (FastAPI)
  createTask('long_job') ──POST /api/tasks/create──▶  api.create_task → client.create_task
      │                          ◀── { taskId, status:'working' } (CreateTaskResult)         │
      │  poll                                                                                 ▼
  getTask(taskId) ──POST /api/tasks/get──▶ api.get_task → client.get_task ──▶ MCP server
      ▲                          ◀── DetailedTask (status + inline result/error)    long_job
      └── render terminal DetailedTask ◀──── Streamable HTTP ────────────  task_store steps
```

## 1 · Frontend — `demo/src/routes/tasks.tsx` + `demo/src/lib/api.ts`

The frontend is the shared SPA (TypeScript); selecting **Python** only repoints `backend.*`
at the Python client host, so this layer is identical to the TypeScript pattern.

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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

Two host routes mirror the two phases — create, then poll:

```python
# py-mcp-client/main.py
# Tasks extension: create (augmented tools/call), then poll status.
@app.post("/api/tasks/create")
def api_tasks_create(body: dict = Body(default={})) -> dict:
  return run(lambda: api.create_task(body.get("name"), body.get("arguments") or {}, body.get("ttl")))

@app.post("/api/tasks/get")
def api_tasks_get(body: dict = Body(default={})) -> dict:
  return run(lambda: api.get_task(body.get("taskId")))
```

`create_task` sends the augmented `tools/call` (with a `ttl_ms`) that returns the
`CreateTaskResult`; `get_task` polls the handle:

```python
# py-mcp-client/mcp_client.py
def create_task(self, name: str, args: dict, ttl: int | None = 300000) -> dict:
  return _with_trace(f"tasks/create:{name}", lambda: _state["client"].create_task(name, args, ttl_ms=ttl))

def get_task(self, task_id: str) -> dict:
  return _with_trace("tasks/get", lambda: _state["client"].get_task(task_id))
```

The client declares `tasks: {}` in its capabilities, which is what lets the augmented call
be negotiated in the first place:

```python
# py-mcp-client/mcp_client.py
# The capabilities this client declares in every request's _meta. (Single source of truth.)
CLIENT_CAPABILITIES = {"elicitation": {"form": {}, "url": {}}, "sampling": {}, "roots": {}, "tasks": {}}
```

## 3 · MCP server — `py-mcp-server/features.py`

`long_job` opts in with `execution={"taskSupport": "required"}`. Its handler creates a task
via the `task_store`, spawns a background thread for the work, and **returns the handle
immediately** — the request completes before the job does:

```python
# py-mcp-server/features.py
def long_job(args: dict, ctx: ToolContext) -> dict:
  steps = int(args.get("steps", 4))
  label = str(args.get("label", "report"))
  task = task_store.create_task(ttl_ms=ctx.task_ttl_ms or 300000)
  task_id = task["taskId"]

  def status_of() -> str | None:
    try:
      return task_store.get(task_id)["status"]
    except Exception:  # noqa: BLE001 — expired/gone task reads defensively
      return None

  def work() -> None:
    try:
      for i in range(1, steps + 1):
        time.sleep(0.5)
        # The client may have cancelled (tasks/cancel) while we worked; stop quietly (§25.5).
        if status_of() != "working":
          return
        task_store.update_status(task_id, "working", f"step {i}/{steps}")
      if status_of() != "working":
        return
      task_store.store_result(
        task_id,
        {"content": [{"type": "text", "text": f'Job "{label}" completed {steps} steps.'}], "structuredContent": {"label": label, "steps": steps, "finishedAt": _now_iso()}},
      )
    except Exception as exc:  # noqa: BLE001 — record a failure only if still live
      if status_of() == "working":
        task_store.update_status(task_id, "failed", f"job failed: {exc}")

  threading.Thread(target=work, daemon=True).start()
  return {"task": task}
```

```python
# py-mcp-server/features.py
server.register_tool(
  "long_job",
  long_job,
  title="Long Job (task)",
  description="Runs as a task: returns a handle immediately, works through N steps, then exposes the result via tasks/get.",
  input_schema={
    "type": "object",
    "properties": {
      "steps": {"type": "integer", "minimum": 1, "maximum": 8, "default": 4, "description": "How many background steps"},
      "label": {"type": "string", "default": "report", "description": "A label for the job"},
    },
  },
  execution={"taskSupport": "required"},
)
```

The store is wired up once, and the server declares the `tasks` capability so clients know
it supports the extension:

```python
# py-mcp-server/features.py
"tasks": {"list": {}, "cancel": {}, "requests": {"tools": {"call": {}}}},
# ...
task_store = InMemoryTaskStore()
server.set_task_store(task_store)
```

Each background step calls `task_store.update_status`; the final `task_store.store_result`
makes the task terminal, and the inline result is what the next `tasks/get` returns. The
handler guards every transition with `status_of() != "working"` so a `tasks/cancel` (which
makes the task terminal) never triggers an illegal status transition. Unlike the TypeScript
handler, the Python version also wraps the work in a `try/except` that flips the task to
`failed` (with the error in `statusMessage`) if it is still live — so an unexpected
exception surfaces as a terminal task rather than a thread that dies silently.

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
[Progress](./progress.md) for streaming a long call that *does* block instead.
