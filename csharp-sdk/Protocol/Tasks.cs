using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The lifecycle state of a task (spec §25.5). A task is created non-terminal (typically
/// <see cref="Working"/>) and moves among <see cref="Working"/> and <see cref="InputRequired"/>
/// until it reaches one of the terminal states <see cref="Completed"/>, <see cref="Failed"/>, or
/// <see cref="Cancelled"/>, after which its status and inline payload are immutable.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<McpTaskStatus>))]
public enum McpTaskStatus
{
  /// <summary>The operation is in progress (non-terminal) (§25.5).</summary>
  [JsonStringEnumMemberName("working")]
  Working,

  /// <summary>The server requires client input before it can continue (non-terminal); the outstanding requests are surfaced in <c>inputRequests</c> and resolved via <c>tasks/update</c> (§25.5, §25.8).</summary>
  [JsonStringEnumMemberName("input_required")]
  InputRequired,

  /// <summary>The operation finished successfully; the underlying result is carried inline in <c>result</c> (terminal) (§25.5).</summary>
  [JsonStringEnumMemberName("completed")]
  Completed,

  /// <summary>A JSON-RPC error occurred during execution; the error is carried inline in <c>error</c> (terminal) (§25.5).</summary>
  [JsonStringEnumMemberName("failed")]
  Failed,

  /// <summary>The operation ended in response to a cancellation request (terminal) (§25.5).</summary>
  [JsonStringEnumMemberName("cancelled")]
  Cancelled,
}

/// <summary>
/// The handle and status record for a long-running operation (spec §25.4). A <see cref="McpTask"/> is
/// returned immediately in place of a blocking result; the client polls <c>tasks/get</c> to observe
/// progress until the task reaches a terminal status. Identifiers are server-minted and opaque, and
/// the durable record survives client disconnects and restarts (§25.6). Named <c>McpTask</c> to avoid
/// clashing with <see cref="System.Threading.Tasks.Task"/>; the wire object is unaffected.
/// </summary>
public sealed record McpTask
{
  /// <summary>REQUIRED. Opaque, server-minted identifier for this task; the client MUST treat it verbatim and MUST NOT parse it (§25.4).</summary>
  public required string TaskId { get; init; }

  /// <summary>REQUIRED. The current lifecycle state (§25.4, §25.5).</summary>
  public required McpTaskStatus Status { get; init; }

  /// <summary>OPTIONAL. A human-readable, display-only description of the current state or progress; carries no protocol semantics (§25.4).</summary>
  public string? StatusMessage { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task was created (§25.4).</summary>
  public required string CreatedAt { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task state was last modified (§25.4).</summary>
  public required string LastUpdatedAt { get; init; }

  /// <summary>
  /// REQUIRED. Task lifetime in milliseconds measured from creation: a non-negative number, or
  /// <c>null</c> for an unbounded lifetime. After a non-null value has elapsed the server MAY
  /// discard the task and answer subsequent queries with the not-found error (§25.4, §25.11).
  /// </summary>
  [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
  public required long? TtlMs { get; init; }

  /// <summary>OPTIONAL. The recommended MINIMUM interval, in milliseconds, a client SHOULD wait between successive <c>tasks/get</c> polls; clients SHOULD NOT poll more frequently (§25.4, §25.7).</summary>
  public long? PollIntervalMs { get; init; }
}

/// <summary>
/// A <see cref="McpTask"/> that additionally conveys the terminal payload (or pending input requests)
/// inline (spec §25.4). It is the shape returned by <c>tasks/get</c> and carried on
/// <c>notifications/tasks</c>, modelled here as a single record whose status-specific members are
/// populated according to <c>status</c>: <see cref="InputRequests"/> for <c>input_required</c>,
/// <see cref="Result"/> for <c>completed</c>, and <see cref="Error"/> for <c>failed</c>. A
/// non-terminal task carries neither <see cref="Result"/> nor <see cref="Error"/> (§25.5).
/// </summary>
public sealed record DetailedTask
{
  /// <summary>REQUIRED. Opaque, server-minted identifier for this task (§25.4).</summary>
  public required string TaskId { get; init; }

  /// <summary>REQUIRED. The current lifecycle state that discriminates which status-specific member (if any) is present (§25.4, §25.5).</summary>
  public required McpTaskStatus Status { get; init; }

  /// <summary>OPTIONAL. A human-readable, display-only description of the current state or progress (§25.4).</summary>
  public string? StatusMessage { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task was created (§25.4).</summary>
  public required string CreatedAt { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task state was last modified (§25.4).</summary>
  public required string LastUpdatedAt { get; init; }

  /// <summary>REQUIRED. Task lifetime in milliseconds from creation, or <c>null</c> for unbounded (§25.4, §25.11).</summary>
  [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
  public required long? TtlMs { get; init; }

  /// <summary>OPTIONAL. The recommended MINIMUM polling interval in milliseconds (§25.4, §25.7).</summary>
  public long? PollIntervalMs { get; init; }

  /// <summary>
  /// Present ONLY when <see cref="Status"/> is <see cref="McpTaskStatus.InputRequired"/>: the
  /// outstanding server-to-client requests the client must fulfill before the task can continue,
  /// keyed by opaque server-chosen identifier (§25.4). The map uses the same <c>InputRequest</c>
  /// shape as the in-line multi-round-trip flow (§11.2) and is resolved via <c>tasks/update</c>.
  /// </summary>
  public IDictionary<string, InputRequest>? InputRequests { get; init; }

  /// <summary>
  /// Present ONLY when <see cref="Status"/> is <see cref="McpTaskStatus.Completed"/>: the verbatim
  /// ordinary result object the augmented request would have produced had it not been turned into
  /// a task — including that result's own <c>resultType</c> and any <c>_meta</c> (§25.4). For a
  /// tool call this is a <see cref="CallToolResult"/>; it is kept as raw JSON because the result
  /// shape depends on the underlying request.
  /// </summary>
  public JsonObject? Result { get; init; }

  /// <summary>Present ONLY when <see cref="Status"/> is <see cref="McpTaskStatus.Failed"/>: the JSON-RPC error object that occurred during execution (§25.4, §22).</summary>
  public JsonObject? Error { get; init; }
}

/// <summary>
/// The augmented result a server returns in place of a request's ordinary result to signal that a
/// task handle was created (spec §25.3). On the wire it is a <c>Result</c> whose <c>resultType</c>
/// is the literal string <c>"task"</c> (supplied by the runtime; see <see cref="ResultTypes.Task"/>)
/// and which carries all <see cref="McpTask"/> fields directly. A client that declared the Tasks
/// capability MUST inspect <c>resultType</c> on each eligible response and handle the task case.
/// </summary>
public sealed record CreateTaskResult
{
  /// <summary>REQUIRED. Opaque, server-minted identifier for the newly created task (§25.3, §25.4).</summary>
  public required string TaskId { get; init; }

  /// <summary>REQUIRED. The initial lifecycle state of the task (typically <see cref="McpTaskStatus.Working"/>) (§25.3, §25.4).</summary>
  public required McpTaskStatus Status { get; init; }

  /// <summary>OPTIONAL. A human-readable, display-only description of the initial state (§25.4).</summary>
  public string? StatusMessage { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task was created (§25.4).</summary>
  public required string CreatedAt { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task state was last modified (§25.4).</summary>
  public required string LastUpdatedAt { get; init; }

  /// <summary>REQUIRED. Task lifetime in milliseconds from creation, or <c>null</c> for unbounded (§25.4, §25.11).</summary>
  [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
  public required long? TtlMs { get; init; }

  /// <summary>OPTIONAL. The recommended MINIMUM polling interval in milliseconds (§25.4, §25.7).</summary>
  public long? PollIntervalMs { get; init; }

  /// <summary>OPTIONAL. Implementation- and extension-specific metadata permitted on any result (§3, §14).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>The parameters of a <c>tasks/get</c> request (spec §25.7): the polling primitive that retrieves a task's current state.</summary>
public sealed record GetTaskRequestParams
{
  /// <summary>REQUIRED. The server-generated identifier of the task to query, sent verbatim as obtained from the originating <see cref="CreateTaskResult"/> (§25.7).</summary>
  public required string TaskId { get; init; }
}

/// <summary>
/// The result of a <c>tasks/get</c> request (spec §25.7): a <see cref="DetailedTask"/> whose
/// status-specific payload fields are inlined for the task's current status. The runtime supplies
/// the base <c>resultType</c> as <c>"complete"</c> (see <see cref="ResultTypes.Complete"/>).
/// </summary>
public sealed record GetTaskResult
{
  /// <summary>REQUIRED. The detailed task for the queried <c>taskId</c>, carrying the status-specific payload for its current status (§25.7).</summary>
  public required DetailedTask Task { get; init; }
}

/// <summary>
/// The parameters of a <c>tasks/update</c> request (spec §25.8): supplies the responses to the
/// outstanding input requests of a task in the <see cref="McpTaskStatus.InputRequired"/> status.
/// </summary>
public sealed record UpdateTaskRequestParams
{
  /// <summary>REQUIRED. The identifier of the task whose outstanding input is being supplied (§25.8).</summary>
  public required string TaskId { get; init; }

  /// <summary>
  /// REQUIRED. Responses keyed by a currently-outstanding <c>inputRequests</c> key (§25.8). Each
  /// value is shaped as the response to the corresponding server-to-client request would be when
  /// surfaced inline (for example an elicitation result, §20); it is kept as raw JSON because the
  /// shape depends on the input-request kind. A server SHOULD ignore entries whose key is not
  /// currently outstanding.
  /// </summary>
  public required IDictionary<string, JsonNode> InputResponses { get; init; }
}

/// <summary>
/// The result of a <c>tasks/update</c> request (spec §25.8): an empty acknowledgement. The runtime
/// supplies the base <c>resultType</c> as <c>"complete"</c> (see <see cref="ResultTypes.Complete"/>).
/// The acknowledgement is eventually consistent: it MAY be returned before the task's observable
/// status reflects the responses.
/// </summary>
public sealed record UpdateTaskResult;

/// <summary>The parameters of a <c>tasks/cancel</c> request (spec §25.9): requests cooperative cancellation of an in-progress task.</summary>
public sealed record CancelTaskRequestParams
{
  /// <summary>REQUIRED. The identifier of the task to cancel (§25.9).</summary>
  public required string TaskId { get; init; }
}

/// <summary>
/// The result of a <c>tasks/cancel</c> request (spec §25.9): an empty acknowledgement. The runtime
/// supplies the base <c>resultType</c> as <c>"complete"</c> (see <see cref="ResultTypes.Complete"/>).
/// Cancellation is cooperative and eventually consistent: acknowledgement does not guarantee the
/// task will reach the <see cref="McpTaskStatus.Cancelled"/> terminal status.
/// </summary>
public sealed record CancelTaskResult;

/// <summary>
/// The parameters of the <c>notifications/tasks</c> notification (spec §25.10), by which a server
/// pushes a task state change. The params are a complete <see cref="DetailedTask"/> for the task's
/// current status — identical to what <c>tasks/get</c> would have returned at that moment — so a
/// subscribed client need not issue an extra <c>tasks/get</c>. Delivery is opt-in via a
/// <c>taskIds</c> subscription filter on <c>subscriptions/listen</c> (§10, §25.10).
/// </summary>
public sealed record TaskStatusNotificationParams
{
  /// <summary>The method name of the notification these parameters belong to (§25.10).</summary>
  public const string Method = "notifications/tasks";

  /// <summary>REQUIRED. Opaque, server-minted identifier of the task whose status changed (§25.4, §25.10).</summary>
  public required string TaskId { get; init; }

  /// <summary>REQUIRED. The current lifecycle state that discriminates which status-specific member (if any) is present (§25.4, §25.10).</summary>
  public required McpTaskStatus Status { get; init; }

  /// <summary>OPTIONAL. A human-readable, display-only description of the current state or progress (§25.4).</summary>
  public string? StatusMessage { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task was created (§25.4).</summary>
  public required string CreatedAt { get; init; }

  /// <summary>REQUIRED. ISO 8601 / RFC 3339 date-time string for when the task state was last modified (§25.4).</summary>
  public required string LastUpdatedAt { get; init; }

  /// <summary>REQUIRED. Task lifetime in milliseconds from creation, or <c>null</c> for unbounded (§25.4, §25.11).</summary>
  [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
  public required long? TtlMs { get; init; }

  /// <summary>OPTIONAL. The recommended MINIMUM polling interval in milliseconds (§25.4, §25.7).</summary>
  public long? PollIntervalMs { get; init; }

  /// <summary>Present ONLY when <see cref="Status"/> is <see cref="McpTaskStatus.InputRequired"/>: the outstanding input requests, keyed by opaque identifier (§25.4, §25.10).</summary>
  public IDictionary<string, InputRequest>? InputRequests { get; init; }

  /// <summary>Present ONLY when <see cref="Status"/> is <see cref="McpTaskStatus.Completed"/>: the verbatim underlying success result (§25.4, §25.10).</summary>
  public JsonObject? Result { get; init; }

  /// <summary>Present ONLY when <see cref="Status"/> is <see cref="McpTaskStatus.Failed"/>: the underlying JSON-RPC error (§25.4, §25.10, §22).</summary>
  public JsonObject? Error { get; init; }

  /// <summary>OPTIONAL. Notification metadata (§3, §14).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// Pure, side-effect-free helpers for the Tasks extension (spec §25): the case-sensitive extension
/// identifier and its matching rule (§25.1), the five-state lifecycle and its legal transitions
/// (§25.5), inline-outcome consistency (§25.5), <c>ttlMs</c> expiry / backstop eligibility (§25.4,
/// §25.6, §25.11), polling-cadence decisions (§25.7), the protocol-vs-application error
/// classification (§25.11), the <c>notifications/tasks</c> push gating and builder (§25.10), and the
/// task-error builders/codes (§22). The C# counterpart of the exported functions in the TypeScript
/// <c>protocol/tasks.ts</c> (S39) and the lifecycle helpers of <c>protocol/tasks-lifecycle.ts</c>
/// (S40) that operate on the task model. The model records (<see cref="McpTask"/>,
/// <see cref="DetailedTask"/>, …) live alongside this class.
/// </summary>
public static class Tasks
{
  // ─── §25.1 — Extension identifier ────────────────────────────────────────────

  /// <summary>The exact, case-sensitive identifier of the Tasks extension, <c>io.modelcontextprotocol/tasks</c> (§25.1, R-25.1-a).</summary>
  public const string ExtensionId = MetaKeys.TasksExtension;

  /// <summary>
  /// Returns <c>true</c> only when <paramref name="identifier"/> is byte-identical to
  /// <see cref="ExtensionId"/> (§25.1, R-25.1-a). The comparison is exact and case-sensitive:
  /// identifiers differing only in case or by a prefix/suffix are NON-matching.
  /// </summary>
  /// <param name="identifier">The candidate extension identifier.</param>
  /// <returns><c>true</c> when it equals <see cref="ExtensionId"/> octet-for-octet.</returns>
  public static bool IsTasksExtensionId(string identifier)
  {
    ArgumentNullException.ThrowIfNull(identifier);
    return string.Equals(identifier, ExtensionId, StringComparison.Ordinal);
  }

  // ─── §25.3 — The "task" result discriminator ─────────────────────────────────

  /// <summary>The literal <c>resultType</c> value marking a result as a task handle, <c>"task"</c> (§25.3, R-25.3-c).</summary>
  public const string TaskResultType = ResultTypes.Task;

  /// <summary>Returns <c>true</c> when <paramref name="resultType"/> is the <c>"task"</c> discriminator (R-25.3-c).</summary>
  /// <param name="resultType">The candidate <c>resultType</c> value.</param>
  /// <returns><c>true</c> when it equals <see cref="TaskResultType"/>.</returns>
  public static bool IsTaskResultType(string? resultType) =>
    string.Equals(resultType, TaskResultType, StringComparison.Ordinal);

  // ─── §25.5 — TaskStatus lifecycle ────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="status"/> is a terminal state — <see cref="McpTaskStatus.Completed"/>,
  /// <see cref="McpTaskStatus.Failed"/>, or <see cref="McpTaskStatus.Cancelled"/> (§25.5, R-25.5-b). A terminal
  /// task's status and inline payload are immutable.
  /// </summary>
  /// <param name="status">The status to test.</param>
  /// <returns><c>true</c> when the status is terminal.</returns>
  public static bool IsTerminalTaskStatus(McpTaskStatus status) =>
    status is McpTaskStatus.Completed or McpTaskStatus.Failed or McpTaskStatus.Cancelled;

  /// <summary>
  /// Returns <c>true</c> when a task MAY transition from <paramref name="from"/> to <paramref name="to"/>,
  /// per the §25.5 lifecycle (R-25.5-b, R-25.5-c). A transition out of a terminal state is never legal
  /// (terminal is immutable). A self-transition between identical non-terminal states (for example
  /// <c>working</c>→<c>working</c>) is not a state change and returns <c>false</c>.
  /// </summary>
  /// <param name="from">The current status.</param>
  /// <param name="to">The proposed next status.</param>
  /// <returns><c>true</c> when the transition is legal.</returns>
  public static bool IsLegalTaskTransition(McpTaskStatus from, McpTaskStatus to)
  {
    if (IsTerminalTaskStatus(from)) return false; // terminal states are immutable (R-25.5-b)
    if (from == to) return false; // not a transition
    return from switch
    {
      // working → input_required | any terminal state (R-25.5-c)
      McpTaskStatus.Working => to == McpTaskStatus.InputRequired || IsTerminalTaskStatus(to),
      // input_required → working | any terminal state (R-25.5-c)
      McpTaskStatus.InputRequired => to == McpTaskStatus.Working || IsTerminalTaskStatus(to),
      _ => false,
    };
  }

  /// <summary>
  /// Asserts that a proposed status transition is legal, throwing when it is not (R-25.5-b, R-25.5-c).
  /// Refuses any transition out of a terminal state (the immutability guarantee) and any illegal
  /// non-terminal move.
  /// </summary>
  /// <param name="from">The current status.</param>
  /// <param name="to">The proposed next status.</param>
  /// <exception cref="ArgumentOutOfRangeException">When <paramref name="from"/> → <paramref name="to"/> is illegal.</exception>
  public static void AssertLegalTaskTransition(McpTaskStatus from, McpTaskStatus to)
  {
    if (IsLegalTaskTransition(from, to)) return;
    if (IsTerminalTaskStatus(from))
    {
      throw new ArgumentOutOfRangeException(
        nameof(to), to,
        $"Task in terminal state \"{from}\" is immutable and MUST NOT transition to \"{to}\" (R-25.5-b).");
    }
    throw new ArgumentOutOfRangeException(nameof(to), to, $"Illegal task transition \"{from}\" → \"{to}\" (R-25.5-c).");
  }

  /// <summary>
  /// Returns <c>true</c> when a <see cref="DetailedTask"/> observes the §25.5 inline-outcome rule
  /// (R-25.5-d): a non-terminal or <c>cancelled</c> task carries neither <c>result</c> nor <c>error</c>;
  /// a <c>completed</c> task carries <c>result</c> (and no <c>error</c>); a <c>failed</c> task carries
  /// <c>error</c> (and no <c>result</c>).
  /// </summary>
  /// <param name="task">The detailed task to check.</param>
  /// <returns><c>true</c> when the inline outcome is consistent with the status.</returns>
  public static bool HasConsistentInlineOutcome(DetailedTask task)
  {
    ArgumentNullException.ThrowIfNull(task);
    var hasResult = task.Result is not null;
    var hasError = task.Error is not null;
    return task.Status switch
    {
      McpTaskStatus.Completed => hasResult && !hasError,
      McpTaskStatus.Failed => hasError && !hasResult,
      // working / input_required / cancelled carry neither result nor error (R-25.5-d)
      _ => !hasResult && !hasError,
    };
  }

  // ─── §25.4 / §25.6 / §25.11 — ttlMs expiry & backstop ────────────────────────

  /// <summary>
  /// Returns <c>true</c> when a task with a non-null <paramref name="ttlMs"/> has expired by
  /// <paramref name="nowMs"/> — its lifetime has elapsed since <paramref name="createdAtMs"/>, so a
  /// server MAY discard it (§25.4, §25.6, R-25.4-c, R-25.6-f). A <c>null</c> <paramref name="ttlMs"/> is
  /// an unbounded lifetime and never expires.
  /// </summary>
  /// <param name="createdAtMs">The task's creation time in epoch milliseconds.</param>
  /// <param name="ttlMs">The task's <c>ttlMs</c> (a non-negative number, or <c>null</c>).</param>
  /// <param name="nowMs">The current time in epoch milliseconds.</param>
  /// <returns><c>true</c> when the lifetime has elapsed.</returns>
  public static bool IsTaskExpired(long createdAtMs, long? ttlMs, long nowMs)
  {
    if (ttlMs is null) return false; // unbounded lifetime never expires (R-25.4-c)
    return nowMs - createdAtMs >= ttlMs.Value;
  }

  /// <summary>
  /// Returns <c>true</c> when a client MAY treat a task as no longer usable because its non-null
  /// <paramref name="ttlMs"/> backstop has elapsed without the observable status advancing past a
  /// non-terminal state (§25.11, R-25.11-c). A <c>null</c> <paramref name="ttlMs"/> is never a backstop,
  /// and an already-terminal task is never backstopped.
  /// </summary>
  /// <param name="createdAtMs">The task's creation time in epoch milliseconds.</param>
  /// <param name="ttlMs">The task's <c>ttlMs</c> (a non-negative number, or <c>null</c>).</param>
  /// <param name="nowMs">The current time in epoch milliseconds.</param>
  /// <param name="status">The task's last observed status.</param>
  /// <returns><c>true</c> when the backstop has elapsed and the task is still non-terminal.</returns>
  public static bool IsTaskBackstopElapsed(long createdAtMs, long? ttlMs, long nowMs, McpTaskStatus status)
  {
    if (ttlMs is null) return false; // unbounded lifetime is never a backstop (R-25.11-c)
    if (IsTerminalTaskStatus(status)) return false; // already advanced to terminal
    return nowMs - createdAtMs >= ttlMs.Value;
  }

  // ─── §25.7 — Polling cadence ─────────────────────────────────────────────────

  /// <summary>The default polling interval, in milliseconds, when a task advertises no <c>pollIntervalMs</c> (§25.4).</summary>
  public const long DefaultPollIntervalMs = 1000;

  /// <summary>
  /// Returns the interval, in milliseconds, a client SHOULD wait before its next <c>tasks/get</c> poll
  /// (§25.4, R-25.4-d). When the task's <paramref name="pollIntervalMs"/> is present, that value (the
  /// recommended minimum) is returned; otherwise <paramref name="fallbackMs"/>.
  /// </summary>
  /// <param name="pollIntervalMs">The task's <c>pollIntervalMs</c>, or <c>null</c> when absent.</param>
  /// <param name="fallbackMs">The interval used when none is recommended (default 1000 ms).</param>
  /// <returns>The interval in milliseconds.</returns>
  public static long ResolvePollIntervalMs(long? pollIntervalMs, long fallbackMs = DefaultPollIntervalMs) =>
    pollIntervalMs ?? fallbackMs;

  /// <summary>
  /// Returns <c>true</c> when polling at <paramref name="nowMs"/>, given the last poll at
  /// <paramref name="lastPolledAtMs"/>, respects the recommended minimum interval (§25.4, R-25.4-d). A
  /// first poll (no prior poll) is always allowed.
  /// </summary>
  /// <param name="lastPolledAtMs">Epoch ms of the previous poll, or <c>null</c> for the first poll.</param>
  /// <param name="nowMs">The current time in epoch ms.</param>
  /// <param name="pollIntervalMs">The task's <c>pollIntervalMs</c>, or <c>null</c> when absent.</param>
  /// <param name="fallbackMs">The interval used when <paramref name="pollIntervalMs"/> is absent.</param>
  /// <returns><c>true</c> when enough time has elapsed to poll again.</returns>
  public static bool MayPollNow(long? lastPolledAtMs, long nowMs, long? pollIntervalMs, long fallbackMs = DefaultPollIntervalMs)
  {
    if (lastPolledAtMs is null) return true;
    return nowMs - lastPolledAtMs.Value >= ResolvePollIntervalMs(pollIntervalMs, fallbackMs);
  }

  /// <summary>
  /// Resolves the <c>pollIntervalMs</c> a client should honor, ADOPTING THE LATEST observed value
  /// (§25.7, R-25.7-m, R-25.7-n): the value from the most recent <c>tasks/get</c> result is preferred;
  /// failing that, the previously adopted value; failing that, <paramref name="fallbackMs"/>.
  /// </summary>
  /// <param name="latestObserved"><c>pollIntervalMs</c> from the most recent <c>tasks/get</c>, or <c>null</c>.</param>
  /// <param name="previousObserved">The previously adopted <c>pollIntervalMs</c>, or <c>null</c>.</param>
  /// <param name="fallbackMs">The interval used when neither has supplied a value.</param>
  /// <returns>The interval in milliseconds.</returns>
  public static long AdoptLatestPollIntervalMs(long? latestObserved, long? previousObserved, long fallbackMs = DefaultPollIntervalMs) =>
    ResolvePollIntervalMs(latestObserved ?? previousObserved, fallbackMs);

  /// <summary>
  /// Returns <c>true</c> when a server MAY rate-limit a <c>tasks/get</c> poll that arrived sooner than
  /// the most recently advertised <paramref name="pollIntervalMs"/> (§25.7, R-25.7-o). A first poll (no
  /// prior poll) or a task with no advertised interval is never rate-limitable.
  /// </summary>
  /// <param name="lastPolledAtMs">Epoch ms of the previous poll, or <c>null</c> for the first poll.</param>
  /// <param name="nowMs">The current time in epoch ms.</param>
  /// <param name="pollIntervalMs">The most recently advertised <c>pollIntervalMs</c>, or <c>null</c>.</param>
  /// <returns><c>true</c> when the poll is eligible for rate-limiting.</returns>
  public static bool MayRateLimitPoll(long? lastPolledAtMs, long nowMs, long? pollIntervalMs)
  {
    if (lastPolledAtMs is null || pollIntervalMs is null) return false;
    return nowMs - lastPolledAtMs.Value < pollIntervalMs.Value;
  }

  /// <summary>
  /// Returns <c>true</c> when a client SHOULD continue polling a task: it is non-terminal AND the client
  /// has not issued <c>tasks/cancel</c> (§25.7, §25.8, R-25.7-p). After <c>tasks/cancel</c> the client
  /// MAY stop immediately — pass <paramref name="cancelRequested"/> as <c>true</c> (R-25.9-k).
  /// </summary>
  /// <param name="status">The task's last observed status.</param>
  /// <param name="cancelRequested">Whether the client has already issued <c>tasks/cancel</c>.</param>
  /// <returns><c>true</c> when the client should keep polling.</returns>
  public static bool ShouldContinuePolling(McpTaskStatus status, bool cancelRequested = false)
  {
    if (cancelRequested) return false;
    return !IsTerminalTaskStatus(status);
  }

  /// <summary>
  /// Returns <c>true</c> when a client should STOP polling after a <c>tasks/get</c> response: either a
  /// <c>-32602</c> error (the task is unknown/expired — terminal and unavailable) or a terminal
  /// <see cref="DetailedTask"/> (§25.7, §25.11, R-25.7-s, R-25.11-e). The response may be a raw error
  /// object (carrying <c>code</c>) or a detailed-task result object (carrying <c>status</c>).
  /// </summary>
  /// <param name="response">The raw <c>tasks/get</c> response object (error or result).</param>
  /// <returns><c>true</c> when the client should stop polling.</returns>
  public static bool IsPollingTerminalResponse(JsonObject? response)
  {
    if (response is null) return false;
    // A -32602 error response → the task is terminal and unavailable (R-25.7-s, R-25.11-e).
    if (response["code"] is JsonValue codeValue && codeValue.TryGetValue(out int code) && code == ErrorCodes.InvalidParams)
    {
      return true;
    }
    // A terminal DetailedTask result → stop polling (R-25.7-p).
    if (response["status"] is JsonValue statusValue && statusValue.GetValueKind() == System.Text.Json.JsonValueKind.String
      && TryParseStatus(statusValue.GetValue<string>(), out var status))
    {
      return IsTerminalTaskStatus(status);
    }
    return false;
  }

  /// <summary>Parses a wire status string (e.g. <c>"working"</c>) into <see cref="McpTaskStatus"/>; returns <c>false</c> for an unknown value.</summary>
  /// <param name="wire">The wire status string.</param>
  /// <param name="status">The parsed status when <c>true</c>.</param>
  /// <returns><c>true</c> when the string is one of the five recognized statuses.</returns>
  public static bool TryParseStatus(string? wire, out McpTaskStatus status)
  {
    switch (wire)
    {
      case "working": status = McpTaskStatus.Working; return true;
      case "input_required": status = McpTaskStatus.InputRequired; return true;
      case "completed": status = McpTaskStatus.Completed; return true;
      case "failed": status = McpTaskStatus.Failed; return true;
      case "cancelled": status = McpTaskStatus.Cancelled; return true;
      default: status = default; return false;
    }
  }

  // ─── §25.9 — Cancellation semantics ──────────────────────────────────────────

  /// <summary>
  /// Classifies what a server's stored task does on <c>tasks/cancel</c> (§25.9, R-25.9-h, R-25.9-i,
  /// R-25.9-j): a terminal task is <see cref="CancelEffect.AcknowledgedTerminal"/> (acknowledge only, no
  /// state change), a non-terminal task is <see cref="CancelEffect.AcknowledgedPending"/> (acknowledge,
  /// and the server MAY move it toward <c>cancelled</c> when feasible).
  /// </summary>
  /// <param name="currentStatus">The task's current status.</param>
  /// <returns>The cancel effect classification.</returns>
  public static CancelEffect ClassifyCancelEffect(McpTaskStatus currentStatus) =>
    IsTerminalTaskStatus(currentStatus) ? CancelEffect.AcknowledgedTerminal : CancelEffect.AcknowledgedPending;

  // ─── §25.11 — Protocol-vs-application error classification ───────────────────

  /// <summary>
  /// Classifies how a finished augmented request maps onto a terminal task status, enforcing the strict
  /// §25.11 separation (R-25.11-f, R-25.11-h, R-25.11-i): a JSON-RPC PROTOCOL error → <c>failed</c>; a
  /// request that completed at the protocol level (even one whose <c>result</c> conveys an application
  /// error such as <c>isError: true</c>) → <c>completed</c>.
  /// </summary>
  /// <param name="kind">Which kind of outcome the request finished with.</param>
  /// <returns><see cref="McpTaskStatus.Failed"/> for a protocol error; otherwise <see cref="McpTaskStatus.Completed"/>.</returns>
  public static McpTaskStatus ClassifyTaskExecutionOutcome(TaskExecutionOutcomeKind kind) =>
    kind == TaskExecutionOutcomeKind.ProtocolError ? McpTaskStatus.Failed : McpTaskStatus.Completed;

  // ─── §25.10 — notifications/tasks push gating & builder ──────────────────────

  /// <summary>
  /// Returns <c>true</c> when a server MAY push <c>notifications/tasks</c> for <paramref name="taskId"/> —
  /// i.e. the client subscribed to it via a <c>taskIds</c> filter on <c>subscriptions/listen</c> (§25.10,
  /// R-25.10-d). A server MUST NOT push for any task NOT in the subscribed set.
  /// </summary>
  /// <param name="taskId">The task a notification would be about.</param>
  /// <param name="subscribedTaskIds">The <c>taskIds</c> the server accepted for this client.</param>
  /// <returns><c>true</c> when a push is permitted.</returns>
  public static bool MayPushTaskNotification(string taskId, IReadOnlyCollection<string>? subscribedTaskIds)
  {
    ArgumentNullException.ThrowIfNull(taskId);
    return subscribedTaskIds is not null && subscribedTaskIds.Contains(taskId);
  }

  /// <summary>
  /// Builds a <c>notifications/tasks</c> notification carrying a complete <see cref="DetailedTask"/> for
  /// the task's current status — identical to what <c>tasks/get</c> would return at that moment, so a
  /// subscribed client need not issue an extra <c>tasks/get</c> (§25.10, R-25.10-a). The notification
  /// params are the detailed task; a server MUST NOT push for a task the client did not subscribe to
  /// (see <see cref="MayPushTaskNotification"/>).
  /// </summary>
  /// <param name="task">The task's current detailed state.</param>
  /// <returns>The <c>notifications/tasks</c> notification.</returns>
  public static JsonRpcNotification BuildTaskStatusNotification(DetailedTask task)
  {
    ArgumentNullException.ThrowIfNull(task);
    var prms = System.Text.Json.JsonSerializer.SerializeToNode(task, McpJson.Options)!.AsObject();
    return new JsonRpcNotification(McpMethods.NotificationsTasks, prms);
  }

  // ─── §25.9 / §25.10 — Forbidden-for-tasks notifications ──────────────────────

  /// <summary>
  /// The notification methods that MUST NOT be used to convey task state (§25.9, §25.10, R-25.9-a,
  /// R-25.10-g): <c>notifications/progress</c>, <c>notifications/message</c>, and
  /// <c>notifications/cancelled</c>. Task state is conveyed ONLY via <c>tasks/get</c> and
  /// <c>notifications/tasks</c>, and <c>tasks/cancel</c> is the ONLY task-cancellation mechanism.
  /// </summary>
  public static readonly IReadOnlySet<string> ForbiddenNotificationMethods =
    new HashSet<string>(StringComparer.Ordinal)
    {
      McpMethods.NotificationsProgress,
      McpMethods.NotificationsMessage,
      McpMethods.NotificationsCancelled,
    };

  /// <summary>
  /// Returns <c>true</c> when <paramref name="method"/> is a notification kind that MUST NOT be sent for
  /// a task (§25.9, §25.10, R-25.9-a, R-25.10-g). Sending it for a task is a protocol violation.
  /// </summary>
  /// <param name="method">The notification method name.</param>
  /// <returns><c>true</c> when the method is forbidden for tasks.</returns>
  public static bool IsForbiddenTaskNotification(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return ForbiddenNotificationMethods.Contains(method);
  }

  // ─── §22 / §25.7 — Error codes & builders ────────────────────────────────────

  /// <summary>
  /// The §22 error code a server uses when a Tasks method is invoked but the extension is unavailable
  /// (not advertised, or the method cannot be serviced): <c>-32003</c> MissingRequiredClientCapability
  /// (§25.2, R-25.2-f). The TS server returns this — NOT <c>-32601</c> — for an un-negotiated Tasks
  /// method.
  /// </summary>
  public const int MissingCapabilityCode = ErrorCodes.MissingRequiredClientCapability;

  /// <summary>
  /// The §22 error code a server returns to <c>tasks/get</c> / <c>tasks/update</c> / <c>tasks/cancel</c>
  /// for a <c>taskId</c> that is unknown — never existed, or expired and removed: <c>-32602</c> Invalid
  /// params (§25.7, §25.11, R-25.7-r, R-25.8-m, R-25.9-g, R-25.11-d).
  /// </summary>
  public const int InvalidParamsCode = ErrorCodes.InvalidParams;

  /// <summary>
  /// Builds the <c>-32602</c> not-found error a server returns when queried for a <c>taskId</c> it no
  /// longer holds (unknown, or expired-and-discarded) (§25.7, §25.11, R-25.7-r, R-25.11-d).
  /// </summary>
  /// <param name="taskId">The opaque task identifier that was not found.</param>
  /// <param name="operation">The operation phrasing for the human-readable message (default <c>"retrieve"</c>).</param>
  /// <returns>The protocol error.</returns>
  public static McpError BuildTaskUnknownError(string taskId, string operation = "retrieve")
  {
    ArgumentNullException.ThrowIfNull(taskId);
    return McpError.InvalidParams($"Failed to {operation} task: Task not found.", new JsonObject { ["taskId"] = taskId });
  }

  /// <summary>
  /// Builds the <c>-32003</c> error a server returns when a Tasks method is invoked but the extension is
  /// unavailable (§25.2, R-25.2-f). The <c>data.requiredCapabilities</c> names the Tasks extension so the
  /// client can re-declare it, and <c>data.method</c> records which Tasks method triggered the rejection
  /// so the client can correlate it with the originating request.
  /// </summary>
  /// <param name="method">The Tasks method that was invoked (e.g. <c>"tasks/get"</c>).</param>
  /// <returns>The protocol error.</returns>
  public static McpError BuildTasksMissingCapabilityError(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    var error = McpError.MissingRequiredClientCapability(
      new JsonObject { ["extensions"] = new JsonObject { [ExtensionId] = new JsonObject() } });
    // Surface the rejected method on both the message and the data so it is not silently discarded.
    var data = error.ErrorData!.AsObject();
    data["method"] = method;
    return new McpError(
      error.Code,
      $"The Tasks extension ({ExtensionId}) is required for {method} but was not declared by the client.",
      data);
  }
}

/// <summary>The effect a <c>tasks/cancel</c> has on a stored task's state (spec §25.9).</summary>
public enum CancelEffect
{
  /// <summary>The task is already terminal; the server acknowledges but MUST NOT change its status (R-25.9-j).</summary>
  AcknowledgedTerminal,

  /// <summary>The task is non-terminal; the server acknowledges and MAY move it toward <c>cancelled</c> when feasible (R-25.9-h, R-25.9-i).</summary>
  AcknowledgedPending,
}

/// <summary>How a finished augmented request maps onto a terminal task status (spec §25.11).</summary>
public enum TaskExecutionOutcomeKind
{
  /// <summary>A JSON-RPC PROTOCOL error occurred during execution → the task is <c>failed</c> (R-25.11-f).</summary>
  ProtocolError,

  /// <summary>The request completed at the protocol level (any application error stays inside <c>result</c>) → the task is <c>completed</c> (R-25.11-h, R-25.11-i).</summary>
  Result,
}
