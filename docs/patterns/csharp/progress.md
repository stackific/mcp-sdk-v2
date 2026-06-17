# Progress & Cancel

**Part III · Interaction & utilities** · Book Ch 27–28 · Stories S22 · sidebar `/progress`

A long-running tool attaches a `progressToken` and streams `notifications/progress` correlated
to it; the caller can abort mid-flight, which surfaces as `notifications/cancelled` on the wire and
trips `ctx.Signal.IsCancellationRequested` inside the tool so it stops cooperatively. This pattern
traces both the progress stream and the cancellation from the demo SPA to the server and back.

## Round-trip

```
demo (ProgressPage)  ──POST /api/tools/call-cancellable──▶  client host (Minimal API)
      │  backend.cancel(id) ─▶ POST /api/cancel               │ c.CallToolWithInputAsync(name, args, opts)
      ▼                                                       ▼  (CancellationTokenSource in `_inflight`)
  progress bar ◀── notifications/progress ──┐    Stackific.Mcp.Client  McpClient (attaches progressToken)
                                            │                 │ tools/call (JSON-RPC)
      └──── abort ──▶ notifications/cancelled ┴── Streamable HTTP ─┴──▶ MCP server (slow_count)
                                                              ctx.ReportProgressAsync(...) per tick;
                                                              if (ctx.Signal.IsCancellationRequested) break
```

## 1 · Frontend — `demo/src/routes/progress.tsx` + `demo/src/lib/api.ts`

The demo SPA is shared; selecting "C#" only repoints the REST base URL at the C# client host. The
page mints a `cancelId`, starts the call, and renders a progress bar from the latest
`notifications/progress` frame on the wire. The Cancel button POSTs that same id:

```tsx
// demo/src/routes/progress.tsx
function start(to: number, intervalMs: number) {
  cancelId.current = crypto.randomUUID();
  runStartSeq.current = frames.at(-1)?.seq ?? 0;
  setRunning(true);
  void call
    .run(() => backend.callToolCancellable('slow_count', { to, intervalMs }, cancelId.current))
    .finally(() => setRunning(false));
}
// ...
<Button variant="destructive" onClick={() => backend.cancel(cancelId.current)} disabled={!running}>
  Cancel
</Button>
```

The bar reads only progress frames emitted *after* this run started (no stale bar):

```tsx
// demo/src/routes/progress.tsx
const lastProgress = [...frames]
  .reverse()
  .find((f) => f.method === 'notifications/progress' && f.seq > runStartSeq.current);
const p = lastProgress?.payload as any;
const pct = p?.params?.total ? Math.round((p.params.progress / p.params.total) * 100) : null;
```

The two `backend.*` calls are thin REST wrappers — the call (with its `cancelId`) and the abort:

```ts
// demo/src/lib/api.ts
callToolCancellable: (name: string, args: Record<string, unknown>, cancelId: string) =>
  postJson<ApiResult<Any>>('/api/tools/call-cancellable', { name, arguments: args, cancelId }),
cancel: (cancelId: string) => postJson<{ ok: boolean }>('/api/cancel', { cancelId }),
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

Two routes: one starts the cancellable call, the other aborts it by id. The start route registers a
`CancellationTokenSource` under `cancelId`, then hands the SDK a `RequestOptions` carrying both a
`ProgressToken` (so the server's progress notifications are correlated and delivered) and the
`CancellationToken`:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call-cancellable", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  var cancelId = body["cancelId"]!.GetValue<string>();
  var cts = host.RegisterCancellable(cancelId);
  try
  {
    return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args, new RequestOptions
    {
      ProgressToken = cancelId,
      CancellationToken = cts.Token,
    })));
  }
  finally { host.ReleaseCancellable(cancelId); }
}));
app.MapPost("/api/cancel", (JsonObject body) => Results.Json(new { ok = host.Cancel(body["cancelId"]!.GetValue<string>()) }));
```

`RegisterCancellable` stashes a fresh `CancellationTokenSource` in the `_inflight` map; `Cancel`
looks it up by id and cancels it — the SDK then emits `notifications/cancelled` on the wire and the
token trips in the running tool. `ReleaseCancellable` drops the finished entry:

```csharp
// csharp-mcp-client/ClientHost.cs
private readonly ConcurrentDictionary<string, CancellationTokenSource> _inflight = new();
// ...
public CancellationTokenSource RegisterCancellable(string cancelId)
{
  var cts = new CancellationTokenSource();
  _inflight[cancelId] = cts;
  return cts;
}

public void ReleaseCancellable(string cancelId) => _inflight.TryRemove(cancelId, out _);

public bool Cancel(string cancelId)
{
  if (_inflight.TryGetValue(cancelId, out var cts)) { cts.Cancel(); return true; }
  return false;
}
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`slow_count` counts to `to`, calling `ctx.ReportProgressAsync(...)` per tick (the SDK correlates it
to the caller's `ProgressToken` and enforces strict monotonicity), and checks
`ctx.Signal.IsCancellationRequested` each iteration to stop cooperatively. The cancellable
`Task.Delay(..., ctx.Signal)` also throws `TaskCanceledException` to break out promptly:

```csharp
// csharp-mcp-server/Features.cs
async ctx =>
{
  var to = ctx.GetInt("to", 12);
  var intervalMs = ctx.GetInt("intervalMs", 600);
  var i = 0;
  for (; i < to; i++)
  {
    if (ctx.Signal.IsCancellationRequested) break;
    await ctx.LogAsync(LoggingLevel.Info, $"count {i + 1}/{to}");
    await ctx.ReportProgressAsync(i + 1, to, $"count {i + 1}/{to}");
    try { await Task.Delay((int)intervalMs, ctx.Signal); }
    catch (TaskCanceledException) { break; }
  }
  return CallToolResult.FromText(ctx.Signal.IsCancellationRequested ? $"Cancelled at {i}/{to}." : $"Counted to {to}.");
}
```

Unlike the TypeScript server — which hand-builds the `notifications/progress` frame inside
`ctx.notify({ method: 'notifications/progress', params: { progressToken, progress, total, message } })`
— the C# SDK exposes the typed `ctx.ReportProgressAsync(progress, total, message)` helper, which reads
`ctx.ProgressToken` itself (no-op when none was supplied) and drops any non-increasing value.

## On the wire

1. `tools/call` (params `_meta.progressToken` set by the SDK from `RequestOptions.ProgressToken`) → starts the tool.
2. `notifications/progress` × N → `{ progressToken, progress, total, message }`, one per tick.
3. On cancel: `notifications/cancelled` → the server's `ctx.Signal` trips; the loop breaks and the
   tool returns `Cancelled at i/to.` as a normal (non-error) result.

The `progressToken` rides the `_meta` envelope — see [The _meta Envelope](./meta.md). The per-tick
`ctx.LogAsync(...)` calls are [Logging](./logging.md) notifications on the same stream.
