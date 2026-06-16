using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Server;

/// <summary>
/// An in-memory, thread-safe store for the Tasks extension (spec §25). It mints opaque task ids,
/// tracks lifecycle state with terminal-state immutability (§25.5), holds the inline result/error of
/// terminal tasks, and answers <c>tasks/get</c> with a <see cref="DetailedTask"/>. A <c>now</c> clock
/// is injectable for deterministic tests. Durability beyond the process lifetime is out of scope for
/// this in-memory implementation; a server needing it supplies its own store.
/// </summary>
public sealed class InMemoryTaskStore
{
  private readonly ConcurrentDictionary<string, Entry> _tasks = new(StringComparer.Ordinal);
  private readonly Func<DateTimeOffset> _now;

  /// <summary>Creates a store, optionally with an injected clock.</summary>
  /// <param name="now">A clock used for created/updated timestamps AND ttl expiry; defaults to <see cref="DateTimeOffset.UtcNow"/>. Inject a controllable clock to drive expiry deterministically in tests.</param>
  public InMemoryTaskStore(Func<DateTimeOffset>? now = null) => _now = now ?? (() => DateTimeOffset.UtcNow);

  /// <summary>The recommended minimum polling interval advertised to clients, in milliseconds (§25.4).</summary>
  public long PollIntervalMs { get; init; } = 500;

  /// <summary>
  /// An optional listener invoked with a task's id on every observable status change (§25.10). The
  /// server wires this to fan a <c>notifications/tasks</c> push so background work driven by a
  /// task-augmented tool (status advances, completion, failure) reaches subscribed clients without an
  /// extra poll. Mirrors the TypeScript <c>setUpdateListener</c>. Set to <c>null</c> to disable.
  /// </summary>
  public Action<string>? OnUpdate { get; set; }

  /// <summary>Fires <see cref="OnUpdate"/> for <paramref name="taskId"/>, swallowing any listener fault so a status mutation never throws because of a push.</summary>
  private void NotifyUpdate(string taskId)
  {
    try
    {
      OnUpdate?.Invoke(taskId);
    }
    catch
    {
      // A failing listener must not corrupt the task's stored state; the push is best-effort (§25.10).
    }
  }

  /// <summary>Creates a new <see cref="McpTaskStatus.Working"/> task and returns its handle (§25.3).</summary>
  /// <param name="ttlMs">The task lifetime in milliseconds from creation, or <c>null</c> for unbounded.</param>
  /// <returns>The created task handle.</returns>
  public McpTask Create(long? ttlMs)
  {
    var id = Guid.NewGuid().ToString("N");
    var nowOffset = _now();
    var timestamp = nowOffset.ToString("O");
    _tasks[id] = new Entry
    {
      Status = McpTaskStatus.Working,
      CreatedAt = timestamp,
      LastUpdatedAt = timestamp,
      TtlMs = ttlMs,
      CreatedAtMs = nowOffset.ToUnixTimeMilliseconds(),
    };
    return Snapshot(id);
  }

  /// <summary>The current status of a task, or <c>null</c> if it is unknown/expired (read defensively).</summary>
  /// <remarks>
  /// Like <see cref="Get"/> this is expiry-aware (§25.6): a task whose non-null <c>ttlMs</c> has elapsed
  /// is swept and reported as unknown (<c>null</c>), so a poller observing status sees an expired task
  /// as gone rather than frozen in its last non-terminal state.
  /// </remarks>
  /// <param name="taskId">The task id.</param>
  /// <returns>The status, or <c>null</c>.</returns>
  public McpTaskStatus? StatusOf(string taskId)
  {
    SweepExpired();
    return _tasks.TryGetValue(taskId, out var entry) ? entry.Status : null;
  }

  /// <summary>Updates a non-terminal task's status and message (§25.5). Transitions out of a terminal state are ignored.</summary>
  /// <param name="taskId">The task id.</param>
  /// <param name="status">The new status.</param>
  /// <param name="message">An optional display-only status message.</param>
  public void UpdateStatus(string taskId, McpTaskStatus status, string? message = null)
  {
    if (!_tasks.TryGetValue(taskId, out var entry) || IsTerminal(entry.Status)) return;
    entry.Status = status;
    entry.StatusMessage = message;
    entry.LastUpdatedAt = _now().ToString("O");
    NotifyUpdate(taskId);
  }

  /// <summary>Stores the successful terminal result of a task (§25.4/§25.5).</summary>
  /// <param name="taskId">The task id.</param>
  /// <param name="result">The underlying tool result; serialized with <c>resultType: complete</c> and stored inline.</param>
  public void StoreResult(string taskId, CallToolResult result)
  {
    if (!_tasks.TryGetValue(taskId, out var entry) || IsTerminal(entry.Status)) return;
    var resultObject = JsonSerializer.SerializeToNode(result, McpJson.Options)!.AsObject();
    resultObject["resultType"] = ResultTypes.Complete;
    entry.Result = resultObject;
    entry.Status = McpTaskStatus.Completed;
    entry.LastUpdatedAt = _now().ToString("O");
    NotifyUpdate(taskId);
  }

  /// <summary>Marks a task as failed, storing the JSON-RPC error inline (§25.4/§25.5).</summary>
  /// <param name="taskId">The task id.</param>
  /// <param name="error">The error object.</param>
  public void Fail(string taskId, JsonRpcError error)
  {
    if (!_tasks.TryGetValue(taskId, out var entry) || IsTerminal(entry.Status)) return;
    entry.Error = new JsonObject { ["code"] = error.Code, ["message"] = error.Message };
    if (error.Data is not null) entry.Error["data"] = error.Data.DeepClone();
    entry.Status = McpTaskStatus.Failed;
    entry.LastUpdatedAt = _now().ToString("O");
    NotifyUpdate(taskId);
  }

  /// <summary>Requests cancellation of a task (§25.9). A non-terminal task transitions to <see cref="McpTaskStatus.Cancelled"/>.</summary>
  /// <param name="taskId">The task id.</param>
  /// <returns><c>true</c> if the task existed.</returns>
  public bool Cancel(string taskId)
  {
    if (!_tasks.TryGetValue(taskId, out var entry)) return false;
    if (!IsTerminal(entry.Status))
    {
      entry.Status = McpTaskStatus.Cancelled;
      entry.LastUpdatedAt = _now().ToString("O");
      NotifyUpdate(taskId);
    }
    return true;
  }

  /// <summary>
  /// Returns the detailed state of a task for <c>tasks/get</c> (§25.7). The returned
  /// <see cref="DetailedTask"/> carries the status-specific inline payload (§25.5, R-25.5-d):
  /// <see cref="DetailedTask.Result"/> when <c>completed</c>, <see cref="DetailedTask.Error"/> when
  /// <c>failed</c>, and <see cref="DetailedTask.InputRequests"/> when <c>input_required</c>.
  /// </summary>
  /// <remarks>
  /// Expiry (§25.6, R-25.6-f/g, R-25.11-d): before the lookup the store sweeps any task whose non-null
  /// <c>ttlMs</c> has elapsed (per <see cref="Tasks.IsTaskExpired"/>). A query for an expired (and thus
  /// discarded) task is therefore indistinguishable from a query for one that never existed — both
  /// answer with the <c>-32602</c> not-found error. The expiry boundary uses the helper's
  /// elapsed-or-equal (<c>now - created &gt;= ttl</c>) rule.
  /// </remarks>
  /// <param name="taskId">The task id.</param>
  /// <returns>The detailed task with its status-specific payload.</returns>
  /// <exception cref="McpError">-32602 when the task is unknown or expired (§25.7, §25.11).</exception>
  public DetailedTask Get(string taskId)
  {
    SweepExpired();
    if (!_tasks.TryGetValue(taskId, out var entry))
    {
      throw Tasks.BuildTaskUnknownError(taskId);
    }
    return new DetailedTask
    {
      TaskId = taskId,
      Status = entry.Status,
      StatusMessage = entry.StatusMessage,
      CreatedAt = entry.CreatedAt,
      LastUpdatedAt = entry.LastUpdatedAt,
      TtlMs = entry.TtlMs,
      PollIntervalMs = PollIntervalMs,
      InputRequests = entry.Status == McpTaskStatus.InputRequired ? entry.InputRequests : null,
      Result = entry.Status == McpTaskStatus.Completed ? entry.Result : null,
      Error = entry.Status == McpTaskStatus.Failed ? entry.Error : null,
    };
  }

  /// <summary>
  /// Moves a non-terminal task into <see cref="McpTaskStatus.InputRequired"/>, recording the outstanding
  /// input solicitations the client must satisfy via <c>tasks/update</c> (§25.5, §25.8). The
  /// <paramref name="inputRequests"/> are surfaced inline on the task's <c>inputRequests</c> and cleared
  /// once the task leaves the input-required state. A terminal task is immutable and ignored.
  /// </summary>
  /// <param name="taskId">The task id.</param>
  /// <param name="inputRequests">The outstanding input requests, keyed by opaque server-chosen identifier.</param>
  public void RequestInput(string taskId, IDictionary<string, InputRequest> inputRequests)
  {
    ArgumentNullException.ThrowIfNull(inputRequests);
    if (!_tasks.TryGetValue(taskId, out var entry) || IsTerminal(entry.Status)) return;
    entry.InputRequests = new Dictionary<string, InputRequest>(inputRequests, StringComparer.Ordinal);
    entry.Status = McpTaskStatus.InputRequired;
    entry.LastUpdatedAt = _now().ToString("O");
    NotifyUpdate(taskId);
  }

  /// <summary>
  /// Binds the responses supplied via <c>tasks/update</c> to a task's outstanding input requests and
  /// moves the task back to <see cref="McpTaskStatus.Working"/> (§25.8). Mirrors the TypeScript
  /// <c>applyInput</c>: it accepts ONLY responses keyed by a currently-outstanding request — stale keys
  /// (no longer outstanding) are dropped per R-25.8-h — and tolerates a partial set (R-25.8-g), so a
  /// caller MAY answer some requests now and the rest later. The bound responses are accumulated so a
  /// re-entrant tool run (which re-solicits from scratch each round) can replay them.
  /// </summary>
  /// <remarks>
  /// The caller (the server dispatcher) is responsible for the protocol-level validation of the
  /// responses — outstanding-key check (<see cref="MultiRoundTrip.ValidateInputResponseKeys"/>),
  /// kind-correlation (<see cref="MultiRoundTrip.ValidateInputResponseKinds"/>), and partial-response
  /// detection (<see cref="MultiRoundTrip.ComputeMissingInputResponseKeys"/>). This method performs the
  /// state mutation only; it discards any response whose key is not currently outstanding.
  /// </remarks>
  /// <param name="taskId">The task id.</param>
  /// <param name="inputResponses">The responses keyed by outstanding input-request key.</param>
  /// <returns>The keys that were actually bound (the subset that was outstanding).</returns>
  /// <exception cref="McpError">-32602 when the task is unknown/expired (§25.8, R-25.8-m).</exception>
  public IReadOnlyList<string> ApplyInput(string taskId, IReadOnlyDictionary<string, JsonNode> inputResponses)
  {
    ArgumentNullException.ThrowIfNull(inputResponses);
    SweepExpired();
    if (!_tasks.TryGetValue(taskId, out var entry))
    {
      throw Tasks.BuildTaskUnknownError(taskId, "update");
    }
    if (entry.Status != McpTaskStatus.InputRequired)
    {
      // §25.8 (R-25.8-b): tasks/update targets an input_required task; an out-of-state update is invalid.
      throw McpError.InvalidParams(
        "Task is not awaiting input.", new JsonObject { ["taskId"] = taskId, ["status"] = entry.Status.ToString() });
    }

    var outstanding = entry.InputRequests ?? new Dictionary<string, InputRequest>(StringComparer.Ordinal);
    var bound = new List<string>();
    entry.InputResponses ??= new Dictionary<string, JsonNode>(StringComparer.Ordinal);
    foreach (var (key, value) in inputResponses)
    {
      if (!outstanding.ContainsKey(key)) continue; // stale key — drop (R-25.8-h)
      entry.InputResponses[key] = value.DeepClone();
      bound.Add(key);
    }

    // §25.8: the task advances back to working once input is supplied; the inline inputRequests clear.
    entry.InputRequests = null;
    entry.Status = McpTaskStatus.Working;
    entry.LastUpdatedAt = _now().ToString("O");
    NotifyUpdate(taskId);
    return bound;
  }

  /// <summary>The responses bound to a task via <see cref="ApplyInput"/>, or <c>null</c> if none (§25.8).</summary>
  /// <param name="taskId">The task id.</param>
  /// <returns>The accumulated input responses keyed by request key, or <c>null</c>.</returns>
  public IReadOnlyDictionary<string, JsonNode>? InputResponsesOf(string taskId) =>
    _tasks.TryGetValue(taskId, out var entry) ? entry.InputResponses : null;

  private McpTask Snapshot(string taskId)
  {
    var entry = _tasks[taskId];
    return new McpTask
    {
      TaskId = taskId,
      Status = entry.Status,
      StatusMessage = entry.StatusMessage,
      CreatedAt = entry.CreatedAt,
      LastUpdatedAt = entry.LastUpdatedAt,
      TtlMs = entry.TtlMs,
      PollIntervalMs = PollIntervalMs,
    };
  }

  /// <summary>
  /// Discards every task whose non-null <c>ttlMs</c> has elapsed since creation (§25.6, R-25.6-f/g). Run
  /// before every read so an expired task is gone before it can be observed — the durable-but-bounded
  /// lifetime guarantee. Uses <see cref="Tasks.IsTaskExpired"/> so the boundary semantics match the
  /// shared protocol helper exactly. Unbounded (<c>ttlMs == null</c>) tasks are never swept.
  /// </summary>
  private void SweepExpired()
  {
    var nowMs = _now().ToUnixTimeMilliseconds();
    foreach (var (id, entry) in _tasks)
    {
      if (Tasks.IsTaskExpired(entry.CreatedAtMs, entry.TtlMs, nowMs))
      {
        _tasks.TryRemove(id, out _);
      }
    }
  }

  private static bool IsTerminal(McpTaskStatus status) =>
    status is McpTaskStatus.Completed or McpTaskStatus.Failed or McpTaskStatus.Cancelled;

  private sealed class Entry
  {
    public McpTaskStatus Status;
    public string? StatusMessage;
    public required string CreatedAt;
    public required string LastUpdatedAt;
    public long? TtlMs;
    public required long CreatedAtMs;
    public JsonObject? Result;
    public JsonObject? Error;
    public IDictionary<string, InputRequest>? InputRequests;
    public Dictionary<string, JsonNode>? InputResponses;
  }
}
