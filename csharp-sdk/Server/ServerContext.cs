using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Server;

// The server runtime deliberately emits the Deprecated-but-supported logging notification (§15.3)
// and roots result (§21.1) for backward compatibility, so it references those [Obsolete] types.
#pragma warning disable CS0618

/// <summary>Handles a <c>tools/call</c>: receives the call context and returns the tool result (spec §16.5).</summary>
/// <param name="context">The invocation context (arguments, metadata, notification sinks, cancellation).</param>
/// <returns>The tool result.</returns>
public delegate Task<CallToolResult> ToolHandler(ToolContext context);

/// <summary>Reads a concrete resource by URI (spec §17.5).</summary>
/// <param name="uri">The requested resource URI.</param>
/// <returns>The resource contents.</returns>
public delegate Task<ReadResourceResult> ResourceReadHandler(string uri);

/// <summary>Reads a resource produced by expanding a template (spec §17.5).</summary>
/// <param name="uri">The concrete URI that matched the template.</param>
/// <param name="variables">The template variables extracted from <paramref name="uri"/>.</param>
/// <returns>The resource contents.</returns>
public delegate Task<ReadResourceResult> ResourceTemplateReadHandler(string uri, IReadOnlyDictionary<string, string> variables);

/// <summary>Resolves a prompt with supplied arguments into messages (spec §18.4).</summary>
/// <param name="arguments">The argument values keyed by argument name.</param>
/// <returns>The resolved prompt.</returns>
public delegate Task<GetPromptResult> PromptGetHandler(IReadOnlyDictionary<string, string> arguments);

/// <summary>Computes ranked completion candidates for a partial argument value (spec §19).</summary>
/// <param name="value">The current partial value (the match seed).</param>
/// <returns>The candidate values, most relevant first.</returns>
public delegate IReadOnlyList<string> ArgumentCompleter(string value);

/// <summary>
/// The context handed to a <see cref="ToolHandler"/> for a single <c>tools/call</c> (spec §16.5). It
/// exposes the call arguments, the inbound request metadata (including trace context, §15.4), the
/// authenticated identity (§23), a cooperative cancellation signal (§9.6.2/§15.2), and sinks for
/// request-scoped notifications (progress §15.1, logging §15.3) and subscription fan-out (§10).
/// </summary>
public sealed class ToolContext
{
  private readonly IServerNotifier _notifier;
  private readonly Func<JsonRpcNotification, Task> _notifySubscribers;
  private readonly IReadOnlyDictionary<string, JsonNode>? _inputResponses;
  private readonly LoggingLevel _minLogLevel;
  private readonly int _requestLogLevelIndex;
  private readonly ProgressTracker _progressTracker = new();
  private int _inputCounter;

  internal ToolContext(
    JsonObject arguments,
    RequestMeta requestMeta,
    AuthInfo? authInfo,
    ProgressToken? progressToken,
    IServerNotifier notifier,
    Func<JsonRpcNotification, Task> notifySubscribers,
    IReadOnlyDictionary<string, JsonNode>? inputResponses,
    CancellationToken signal,
    InMemoryTaskStore? tasks = null,
    long? taskTtlMs = null,
    LoggingLevel minLogLevel = LoggingLevel.Info,
    int requestLogLevelIndex = -1)
  {
    Arguments = arguments;
    RequestMeta = requestMeta;
    AuthInfo = authInfo;
    ProgressToken = progressToken;
    _notifier = notifier;
    _notifySubscribers = notifySubscribers;
    _inputResponses = inputResponses;
    _minLogLevel = minLogLevel;
    _requestLogLevelIndex = requestLogLevelIndex;
    Signal = signal;
    Tasks = tasks;
    TaskTtlMs = taskTtlMs;
    // §15.1.1: register the caller's progress token so the tracker enforces strict monotonicity across
    // this call's progress updates (R-15.1.3-e). No token ⇒ no progress is emitted at all.
    if (progressToken is { } token) _progressTracker.Register(token);
  }

  /// <summary>The task store for a task-augmented call (spec §25), or <c>null</c> for an ordinary call.</summary>
  public InMemoryTaskStore? Tasks { get; }

  /// <summary>The requested task lifetime in milliseconds, when the caller supplied one (§25.4); otherwise <c>null</c>.</summary>
  public long? TaskTtlMs { get; }

  /// <summary>The tool arguments object (an empty object when the call omitted <c>arguments</c>, §16.5).</summary>
  public JsonObject Arguments { get; }

  /// <summary>The validated per-request <c>_meta</c> envelope (protocol version, client info/capabilities, §4.3).</summary>
  public RequestMeta RequestMeta { get; }

  /// <summary>The inbound request <c>_meta</c> beyond the protocol-defined keys (trace context, progress token, third-party), or <c>null</c>.</summary>
  public JsonObject? Meta => RequestMeta.Additional;

  /// <summary>The validated bearer identity, when the request was authenticated (§23); otherwise <c>null</c>.</summary>
  public AuthInfo? AuthInfo { get; }

  /// <summary>The progress token the caller supplied in request <c>_meta</c>, or <c>null</c> if none (§15.1.2).</summary>
  public ProgressToken? ProgressToken { get; }

  /// <summary>A cooperative cancellation signal: set when the client cancels or closes the request stream (§9.6.2/§15.2).</summary>
  public CancellationToken Signal { get; }

  /// <summary>Emits an arbitrary request-scoped notification on this request's stream (§9.6.2).</summary>
  /// <param name="notification">The notification to emit.</param>
  /// <returns>A task that completes when the notification is handed to the transport.</returns>
  public Task NotifyAsync(JsonRpcNotification notification) => _notifier.NotifyAsync(notification);

  /// <summary>
  /// Emits a <c>notifications/message</c> log entry on this request's stream, gated by the PER-REQUEST
  /// opt-in (spec §15.3.3). The originating request opts in by carrying the reserved
  /// <c>io.modelcontextprotocol/logLevel</c> key in its <c>_meta</c> (§4.3): when that key is ABSENT the
  /// server MUST NOT emit ANY log notification for the request (R-15.3.3 first bullet), and when present
  /// the server MUST NOT emit messages below the opted-in severity (R-15.3.3 second bullet). The legacy
  /// server-wide minimum (<c>logging/setLevel</c>; default <c>info</c>) is applied as an ADDITIONAL floor
  /// — the server MAY emit only a subset of the opted-in levels — so a message must clear BOTH the
  /// per-request level and the server-wide level to be sent. A dropped message is a silent no-op.
  /// Deprecated mechanism (§15.3), retained for interoperability.
  /// </summary>
  /// <param name="level">The log severity.</param>
  /// <param name="message">The message text (sent as the <c>data</c> payload).</param>
  /// <param name="logger">An optional logger name.</param>
  /// <returns>A task that completes when the notification is emitted, or immediately when it is filtered out.</returns>
  public Task LogAsync(LoggingLevel level, string message, string? logger = null)
  {
    // §15.3.3 first bullet (MUST NOT): no opt-in on the originating request ⇒ emit nothing at all.
    if (_requestLogLevelIndex < 0) return Task.CompletedTask;
    // §15.3.3 second bullet (MUST NOT below the requested level): drop a message below the opt-in floor.
    if (level.Index() < _requestLogLevelIndex) return Task.CompletedTask;
    // Legacy server-wide floor (logging/setLevel): the server MAY further restrict to a subset.
    if (!LoggingFilter.IsAtOrAboveLogLevel(level, _minLogLevel)) return Task.CompletedTask;
    var prms = JsonSerializer.SerializeToNode(
      new LoggingMessageNotificationParams { Level = level, Logger = logger, Data = JsonValue.Create(message) },
      McpJson.Options)!.AsObject();
    return _notifier.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsMessage, prms));
  }

  /// <summary>
  /// Emits a <c>notifications/progress</c> update for this request (spec §15.1), enforcing strict
  /// monotonicity through a per-call <see cref="ProgressTracker"/>. No-op when the caller did not supply a
  /// <see cref="ProgressToken"/> (progress is correlated by that token), or when <paramref name="progress"/>
  /// does not strictly exceed the last emitted value — a non-increasing update MUST NOT be sent
  /// (R-15.1.3-e), so it is dropped rather than corrupting the progress sequence.
  /// </summary>
  /// <param name="progress">The cumulative progress (MUST strictly increase across updates, §15.1.3).</param>
  /// <param name="total">The total expected, when known.</param>
  /// <param name="message">An optional human-readable description.</param>
  /// <returns>A task that completes when the notification is emitted, or immediately when there is no token / the value is not monotonic.</returns>
  public Task ReportProgressAsync(double progress, double? total = null, string? message = null)
  {
    if (ProgressToken is not { } token) return Task.CompletedTask;
    // §15.1.3 (R-15.1.3-e): drop a non-strictly-increasing value rather than emit it.
    if (!_progressTracker.IsMonotonic(token, progress)) return Task.CompletedTask;
    _progressTracker.RecordProgress(token, progress);
    var prms = JsonSerializer.SerializeToNode(
      new ProgressNotificationParams { ProgressToken = token, Progress = progress, Total = total, Message = message },
      McpJson.Options)!.AsObject();
    return _notifier.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsProgress, prms));
  }

  /// <summary>
  /// Fans a change notification out to every active subscription stream whose filter opted into its
  /// kind (spec §10.5). Used by tools that mutate server state (for example to drive the Subscriptions
  /// view). Delivery to request-scoped streams is via <see cref="NotifyAsync"/> instead (§10.6).
  /// </summary>
  /// <param name="notification">The change notification (a list-changed or resource-updated kind).</param>
  /// <returns>A task that completes when the fan-out is enqueued.</returns>
  public Task NotifySubscribersAsync(JsonRpcNotification notification) => _notifySubscribers(notification);

  /// <summary>
  /// Optional cache hints (§13) the runtime applies to this tool's result top-level (<c>ttlMs</c> +
  /// <c>cacheScope</c>). Set via <see cref="SetCacheHints"/>; <c>null</c> means the result is not cacheable.
  /// </summary>
  internal CacheHints? CacheHints { get; private set; }

  /// <summary>Marks this tool's result as cacheable with the given hints (spec §13).</summary>
  /// <param name="ttlMs">The client-cache TTL in milliseconds (minimum 0).</param>
  /// <param name="scope">The cache sharing scope.</param>
  public void SetCacheHints(long ttlMs, CacheScope scope) => CacheHints = new CacheHints(ttlMs, scope);

  /// <summary>
  /// Requests structured or out-of-band user input via elicitation (spec §20), using the multi-round-trip
  /// mechanism (§11): on the first round this signals <c>input_required</c> and the runtime suspends the
  /// call; when the client retries with the answer, this returns it. Requires the client to have declared
  /// the <c>elicitation</c> capability, else <c>-32003</c> (§11.5).
  /// </summary>
  /// <param name="parameters">The elicitation request (form or URL mode).</param>
  /// <returns>The user's elicitation result.</returns>
  public Task<ElicitResult> ElicitInputAsync(ElicitRequestParams parameters)
  {
    if (!RequestMeta.ClientCapabilities.SupportsElicitation)
    {
      throw McpError.MissingRequiredClientCapability(new JsonObject { ["elicitation"] = new JsonObject() });
    }
    if (parameters is ElicitRequestURLParams && !RequestMeta.ClientCapabilities.SupportsElicitationUrl)
    {
      throw McpError.MissingRequiredClientCapability(new JsonObject { ["elicitation"] = new JsonObject { ["url"] = new JsonObject() } });
    }
    return RequestInputAsync<ElicitResult>(McpMethods.ElicitationCreate, Serialize(parameters));
  }

  /// <summary>
  /// Asks the client to run a model completion via sampling (spec §21), through the multi-round-trip
  /// mechanism (§11). Requires the client to have declared the (deprecated) <c>sampling</c> capability,
  /// else <c>-32003</c> (§11.5).
  /// </summary>
  /// <param name="parameters">The sampling request.</param>
  /// <returns>The produced message.</returns>
  public Task<CreateMessageResult> CreateMessageAsync(CreateMessageRequestParams parameters)
  {
    if (!RequestMeta.ClientCapabilities.SupportsSampling)
    {
      throw McpError.MissingRequiredClientCapability(new JsonObject { ["sampling"] = new JsonObject() });
    }
    return RequestInputAsync<CreateMessageResult>(McpMethods.SamplingCreateMessage, Serialize(parameters));
  }

  /// <summary>
  /// Asks the client for its filesystem roots (spec §21), through the multi-round-trip mechanism (§11).
  /// Requires the client to have declared the (deprecated) <c>roots</c> capability, else <c>-32003</c> (§11.5).
  /// </summary>
  /// <returns>The client's roots.</returns>
  public async Task<IReadOnlyList<Root>> ListRootsAsync()
  {
    if (!RequestMeta.ClientCapabilities.SupportsRoots)
    {
      throw McpError.MissingRequiredClientCapability(new JsonObject { ["roots"] = new JsonObject() });
    }
    var result = await RequestInputAsync<ListRootsResult>(McpMethods.RootsList, null).ConfigureAwait(false);
    return result.Roots;
  }

  private Task<TResult> RequestInputAsync<TResult>(string method, JsonObject? parameters)
  {
    var key = $"mrtr-{_inputCounter++}";
    if (_inputResponses is not null && _inputResponses.TryGetValue(key, out var answer))
    {
      var result = answer.Deserialize<TResult>(McpJson.Options)
        ?? throw McpError.InvalidParams($"The input response under \"{key}\" could not be read.");
      return Task.FromResult(result);
    }
    throw new InputRequiredSignal(key, new InputRequest { Method = method, Params = parameters });
  }

  private static JsonObject Serialize<T>(T value) => JsonSerializer.SerializeToNode(value, McpJson.Options)!.AsObject();

  /// <summary>Reads a required string argument, throwing <c>-32602</c> if absent or not a string.</summary>
  /// <param name="name">The argument name.</param>
  /// <returns>The string value.</returns>
  public string GetString(string name) =>
    Arguments[name] is JsonValue v && v.GetValueKind() == JsonValueKind.String
      ? v.GetValue<string>()
      : throw McpError.InvalidParams($"Argument \"{name}\" is required and must be a string.");

  /// <summary>Reads an optional string argument, returning <paramref name="fallback"/> when absent.</summary>
  /// <param name="name">The argument name.</param>
  /// <param name="fallback">The value to use when the argument is absent or null.</param>
  /// <returns>The string value or the fallback.</returns>
  public string GetString(string name, string fallback) =>
    Arguments[name] is JsonValue v && v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : fallback;

  /// <summary>Reads a required numeric argument, throwing <c>-32602</c> if absent or not a number.</summary>
  /// <param name="name">The argument name.</param>
  /// <returns>The numeric value.</returns>
  public double GetDouble(string name) =>
    Arguments[name] is JsonValue v && v.GetValueKind() == JsonValueKind.Number
      ? v.GetValue<double>()
      : throw McpError.InvalidParams($"Argument \"{name}\" is required and must be a number.");

  /// <summary>Reads an optional integer argument, returning <paramref name="fallback"/> when absent.</summary>
  /// <param name="name">The argument name.</param>
  /// <param name="fallback">The value to use when the argument is absent or null.</param>
  /// <returns>The integer value or the fallback.</returns>
  public long GetInt(string name, long fallback) =>
    Arguments[name] is JsonValue v && v.GetValueKind() == JsonValueKind.Number && v.TryGetValue(out long n) ? n : fallback;

  /// <summary>Reads an optional boolean argument, returning <paramref name="fallback"/> when absent.</summary>
  /// <param name="name">The argument name.</param>
  /// <param name="fallback">The value to use when the argument is absent or null.</param>
  /// <returns>The boolean value or the fallback.</returns>
  public bool GetBool(string name, bool fallback) =>
    Arguments[name] is JsonValue v && v.GetValueKind() is JsonValueKind.True or JsonValueKind.False ? v.GetValue<bool>() : fallback;
}

/// <summary>
/// Internal control-flow signal raised when a tool handler requests client input it does not yet have
/// (spec §11). The dispatcher catches it and turns it into an <c>input_required</c> result; on the
/// client's retry the same handler re-runs and the now-available response is returned instead.
/// </summary>
internal sealed class InputRequiredSignal(string key, InputRequest request) : Exception
{
  public string Key { get; } = key;

  public InputRequest Request { get; } = request;
}
