using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Client;

/// <summary>
/// The MCP client host (spec §4, §5): it stamps every request with the required per-request
/// <c>_meta</c> envelope (protocol revision, client identity, client capabilities), correlates each
/// response to its request, performs discovery and revision selection, and exposes typed convenience
/// methods for the server features. It is transport-agnostic — give it any <see cref="ClientTransport"/>.
/// </summary>
public sealed class McpClient : IAsyncDisposable
{
  private readonly ClientTransport _transport;
  private readonly Implementation _clientInfo;
  private readonly ClientCapabilities _capabilities;

  private readonly Dictionary<string, Func<JsonObject?, Task<JsonNode>>> _inputHandlers = new(StringComparer.Ordinal);

  private long _nextId;
  private string _protocolVersion = ProtocolRevision.Current;
  private DiscoverResult? _discovered;

  /// <summary>Creates a client over <paramref name="transport"/> with the given identity and capabilities.</summary>
  /// <param name="transport">The transport carrying messages to the server.</param>
  /// <param name="clientInfo">The client identity advertised on every request (§4.3).</param>
  /// <param name="capabilities">The capabilities advertised on every request (§6.2); defaults to none.</param>
  public McpClient(ClientTransport transport, Implementation clientInfo, ClientCapabilities? capabilities = null)
  {
    _transport = transport;
    _clientInfo = clientInfo;
    _capabilities = capabilities ?? ClientCapabilities.None;
  }

  /// <summary>The underlying transport (exposed so a host can tap the wire).</summary>
  public ClientTransport Transport => _transport;

  /// <summary>The capabilities this client advertises on every request.</summary>
  public ClientCapabilities ClientCapabilities => _capabilities;

  /// <summary>The protocol revision negotiated with the server, or <c>null</c> before discovery (§5.4).</summary>
  public string? NegotiatedVersion => _discovered is null ? null : _protocolVersion;

  /// <summary>The server's advertised capabilities from the last discovery, or <c>null</c> (§6.3).</summary>
  public ServerCapabilities? ServerCapabilities => _discovered?.Capabilities;

  /// <summary>The server's identity from the last discovery, or <c>null</c> (§5.3.2).</summary>
  public Implementation? ServerInfo => _discovered?.ServerInfo;

  /// <summary>Whether discovery has completed against the server.</summary>
  public bool IsConnected => _discovered is not null;

  /// <summary>
  /// Performs <c>server/discover</c> (spec §5.3), caches the server's identity and capabilities, and
  /// selects the highest mutually supported revision for subsequent requests (§5.4).
  /// </summary>
  /// <returns>The discovery result.</returns>
  public async Task<DiscoverResult> DiscoverAsync()
  {
    var result = await RequestAsync(McpMethods.Discover).ConfigureAwait(false);
    var discovered = result.Deserialize<DiscoverResult>(McpJson.Options)
      ?? throw McpError.InternalError("server/discover returned an unreadable result.");

    // §5.4 selection rule: choose the first of our preferred revisions the server also supports.
    foreach (var preferred in ProtocolRevision.Supported)
    {
      if (discovered.SupportedVersions.Contains(preferred, StringComparer.Ordinal))
      {
        _protocolVersion = preferred;
        _discovered = discovered;
        return discovered;
      }
    }

    throw McpError.InternalError(
      $"No mutually supported protocol revision. Client supports [{string.Join(", ", ProtocolRevision.Supported)}], " +
      $"server supports [{string.Join(", ", discovered.SupportedVersions)}].");
  }

  /// <summary>Returns <c>true</c> if the server advertised the capability gating <paramref name="check"/>.</summary>
  /// <param name="check">A predicate over the discovered server capabilities.</param>
  /// <returns><c>true</c> when discovery has run and the predicate holds.</returns>
  public bool ServerSupports(Func<ServerCapabilities, bool> check) =>
    _discovered is not null && check(_discovered.Capabilities);

  // ───────────────────────── Typed convenience methods ─────────────────────────

  /// <summary>Lists the server's tools (spec §16.2).</summary>
  /// <param name="cursor">An optional pagination cursor.</param>
  /// <returns>The tools page.</returns>
  public async Task<ListToolsResult> ListToolsAsync(string? cursor = null) =>
    Deserialize<ListToolsResult>(await RequestAsync(McpMethods.ToolsList, Cursor(cursor)).ConfigureAwait(false));

  /// <summary>Invokes a tool and returns the raw result object (which may be a <c>CallToolResult</c> or an input-required result, §11/§16.5).</summary>
  /// <param name="name">The tool name.</param>
  /// <param name="arguments">The arguments object.</param>
  /// <param name="options">Per-request options (progress, cancellation, trace metadata).</param>
  /// <returns>The result object.</returns>
  public Task<JsonObject> CallToolAsync(string name, JsonObject? arguments = null, RequestOptions? options = null) =>
    RequestAsync(McpMethods.ToolsCall, new JsonObject { ["name"] = name, ["arguments"] = arguments?.DeepClone() ?? new JsonObject() }, options);

  /// <summary>Lists the server's resources (spec §17.2).</summary>
  /// <param name="cursor">An optional pagination cursor.</param>
  /// <returns>The resources page.</returns>
  public async Task<ListResourcesResult> ListResourcesAsync(string? cursor = null) =>
    Deserialize<ListResourcesResult>(await RequestAsync(McpMethods.ResourcesList, Cursor(cursor)).ConfigureAwait(false));

  /// <summary>Lists the server's resource templates (spec §17.3).</summary>
  /// <param name="cursor">An optional pagination cursor.</param>
  /// <returns>The templates page.</returns>
  public async Task<ListResourceTemplatesResult> ListResourceTemplatesAsync(string? cursor = null) =>
    Deserialize<ListResourceTemplatesResult>(await RequestAsync(McpMethods.ResourceTemplatesList, Cursor(cursor)).ConfigureAwait(false));

  /// <summary>Reads a resource by URI (spec §17.5).</summary>
  /// <param name="uri">The resource URI.</param>
  /// <returns>The read result.</returns>
  public async Task<ReadResourceResult> ReadResourceAsync(string uri) =>
    Deserialize<ReadResourceResult>(await RequestAsync(McpMethods.ResourcesRead, new JsonObject { ["uri"] = uri }).ConfigureAwait(false));

  /// <summary>Lists the server's prompts (spec §18.2).</summary>
  /// <param name="cursor">An optional pagination cursor.</param>
  /// <returns>The prompts page.</returns>
  public async Task<ListPromptsResult> ListPromptsAsync(string? cursor = null) =>
    Deserialize<ListPromptsResult>(await RequestAsync(McpMethods.PromptsList, Cursor(cursor)).ConfigureAwait(false));

  /// <summary>Resolves a prompt with arguments (spec §18.4).</summary>
  /// <param name="name">The prompt name.</param>
  /// <param name="arguments">The argument values.</param>
  /// <returns>The resolved prompt.</returns>
  public async Task<GetPromptResult> GetPromptAsync(string name, IReadOnlyDictionary<string, string>? arguments = null)
  {
    var argsObject = new JsonObject();
    if (arguments is not null)
    {
      foreach (var (key, value) in arguments) argsObject[key] = value;
    }
    var result = await RequestAsync(McpMethods.PromptsGet, new JsonObject { ["name"] = name, ["arguments"] = argsObject }).ConfigureAwait(false);
    return Deserialize<GetPromptResult>(result);
  }

  /// <summary>Requests argument completions (spec §19.2).</summary>
  /// <param name="reference">The prompt or resource-template reference.</param>
  /// <param name="argument">The argument name and partial value.</param>
  /// <param name="context">Optional sibling-argument context.</param>
  /// <returns>The completion result.</returns>
  public async Task<CompleteResult> CompleteAsync(CompletionReference reference, CompletionArgument argument, CompletionContext? context = null)
  {
    var prms = Serialize(new CompleteRequestParams { Ref = reference, Argument = argument, Context = context });
    return Deserialize<CompleteResult>(await RequestAsync(McpMethods.CompletionComplete, prms).ConfigureAwait(false));
  }

  /// <summary>Sends a liveness <c>ping</c>.</summary>
  /// <returns>A task that completes when the server responds.</returns>
  public Task PingAsync() => RequestAsync(McpMethods.Ping);

  /// <summary>
  /// Invokes a tool as a task (spec §25.3): the client must have declared the Tasks extension, and the
  /// server returns a task handle (<c>resultType: "task"</c>) for an eligible tool. Poll with
  /// <see cref="GetTaskAsync"/> or drive to completion with <see cref="PollTaskUntilTerminalAsync"/>.
  /// </summary>
  /// <param name="name">The tool name.</param>
  /// <param name="arguments">The arguments object.</param>
  /// <param name="ttlMs">
  /// The requested task lifetime in milliseconds, sent as <c>task.ttl</c> (§25.4). The default 5-minute
  /// lifetime (300000) is used when this is the sentinel <see cref="DefaultTaskTtlMs"/>; pass <c>null</c>
  /// for an explicitly unbounded lifetime; pass a non-negative number to override.
  /// </param>
  /// <returns>The raw result object (a <c>CreateTaskResult</c> when the server made it a task).</returns>
  public Task<JsonObject> CreateTaskAsync(string name, JsonObject? arguments = null, long? ttlMs = DefaultTaskTtlMs)
  {
    // Mirror the TS createTask: a default ttl of 300000 unless the caller opted into a different lifetime.
    var task = new JsonObject();
    task["ttl"] = ttlMs == DefaultTaskTtlMs ? 300000 : (ttlMs is { } v ? JsonValue.Create(v) : null);
    return RequestAsync(McpMethods.ToolsCall, new JsonObject
    {
      ["name"] = name,
      ["arguments"] = arguments?.DeepClone() ?? new JsonObject(),
      ["task"] = task,
    });
  }

  /// <summary>The sentinel default for <see cref="CreateTaskAsync"/>'s <c>ttlMs</c> meaning "use the protocol default lifetime" (§25.4).</summary>
  public const long DefaultTaskTtlMs = long.MinValue;

  /// <summary>Retrieves a task's current detailed state (spec §25.7).</summary>
  /// <param name="taskId">The task id.</param>
  /// <returns>The detailed task result object.</returns>
  public Task<JsonObject> GetTaskAsync(string taskId) =>
    RequestAsync(McpMethods.TasksGet, new JsonObject { ["taskId"] = taskId });

  /// <summary>
  /// Supplies input to a task awaiting it via <c>tasks/update</c> (spec §25.8): the responses are keyed
  /// by a currently-outstanding <c>inputRequests</c> key from the task's <c>input_required</c> state. The
  /// server binds the outstanding subset, drops stale keys (R-25.8-h), and advances the task.
  /// </summary>
  /// <param name="taskId">The task id.</param>
  /// <param name="inputResponses">The responses keyed by outstanding input-request key.</param>
  /// <returns>The acknowledgement result object (the task's resulting <c>DetailedTask</c>).</returns>
  public Task<JsonObject> UpdateTaskAsync(string taskId, JsonObject inputResponses)
  {
    ArgumentNullException.ThrowIfNull(inputResponses);
    return RequestAsync(McpMethods.TasksUpdate, new JsonObject
    {
      ["taskId"] = taskId,
      ["inputResponses"] = inputResponses.DeepClone(),
    });
  }

  /// <summary>Requests cancellation of a task (spec §25.9).</summary>
  /// <param name="taskId">The task id.</param>
  /// <returns>The acknowledgement result object (the task's resulting <c>DetailedTask</c>).</returns>
  public Task<JsonObject> CancelTaskAsync(string taskId) =>
    RequestAsync(McpMethods.TasksCancel, new JsonObject { ["taskId"] = taskId });

  /// <summary>
  /// Polls <c>tasks/get</c> until the task reaches a terminal status — <c>completed</c>, <c>failed</c>,
  /// or <c>cancelled</c> (spec §25.5, §25.7) — then returns the final detailed task object. Honors the
  /// task's recommended <c>pollIntervalMs</c> (adopting the latest observed value, §25.7) and supports an
  /// overall timeout and a cancellation signal.
  /// </summary>
  /// <param name="taskId">The task id.</param>
  /// <param name="timeout">An optional overall timeout; on expiry an <see cref="McpError"/> is thrown.</param>
  /// <param name="fallbackIntervalMs">The poll interval used when the task advertises no <c>pollIntervalMs</c>.</param>
  /// <param name="cancellationToken">Cancels the poll loop.</param>
  /// <returns>The terminal detailed task object.</returns>
  /// <exception cref="McpError">-32602 propagated for an unknown/expired task; -32603 on timeout.</exception>
  public async Task<JsonObject> PollTaskUntilTerminalAsync(
    string taskId,
    TimeSpan? timeout = null,
    long fallbackIntervalMs = 500,
    CancellationToken cancellationToken = default)
  {
    var deadline = timeout is { } t ? DateTimeOffset.UtcNow + t : (DateTimeOffset?)null;
    long? adoptedInterval = null;
    while (true)
    {
      cancellationToken.ThrowIfCancellationRequested();
      var task = await GetTaskAsync(taskId).ConfigureAwait(false); // propagates -32602 for unknown/expired

      // §25.7: stop on a terminal status.
      if (task["status"] is JsonValue sv && sv.GetValueKind() == JsonValueKind.String
        && Tasks.TryParseStatus(sv.GetValue<string>(), out var status) && Tasks.IsTerminalTaskStatus(status))
      {
        return task;
      }

      // §25.7: adopt the latest advertised pollIntervalMs for the cadence.
      var latest = task["pollIntervalMs"] is JsonValue pv && pv.GetValueKind() == JsonValueKind.Number && pv.TryGetValue(out long p)
        ? (long?)p : null;
      var interval = Tasks.AdoptLatestPollIntervalMs(latest, adoptedInterval, fallbackIntervalMs);
      adoptedInterval = interval;

      if (deadline is { } d && DateTimeOffset.UtcNow >= d)
      {
        throw McpError.InternalError($"Task \"{taskId}\" did not reach a terminal status within the timeout.");
      }
      await Task.Delay(TimeSpan.FromMilliseconds(interval), cancellationToken).ConfigureAwait(false);
    }
  }

  /// <summary>
  /// Opens a subscription stream for server-initiated change notifications (spec §10): sends
  /// <c>subscriptions/listen</c>, awaits the acknowledgement, and delivers each matching change
  /// notification to <paramref name="onNotification"/> until the returned handle is unsubscribed.
  /// </summary>
  /// <param name="filter">The notification kinds to subscribe to.</param>
  /// <param name="onNotification">Invoked for each change notification on the stream.</param>
  /// <param name="cancellationToken">Cancels opening the stream.</param>
  /// <returns>A handle carrying the honored filter and an unsubscribe action.</returns>
  /// <remarks>
  /// The subscription's request-scoped lifecycle (spec §10.7) is tracked through a client-side
  /// <see cref="SubscriptionRegistry"/>: a <see cref="Subscription"/> is created and acknowledged
  /// (<c>opening</c> → <c>active</c>) on open, routed by <c>io.modelcontextprotocol/subscriptionId</c>,
  /// and closed (with the <see cref="SubscriptionCloseReason.ClientCancel"/> reason) and removed on
  /// unsubscribe. The id is the <c>subscriptions/listen</c> request id (R-10.4-c). Inspect the registry
  /// via <see cref="ActiveSubscriptionIds"/> / <see cref="GetSubscription"/>.
  /// </remarks>
  public async Task<SubscriptionHandle> SubscribeAsync(
    SubscriptionFilter filter,
    Action<JsonRpcNotification>? onNotification = null,
    CancellationToken cancellationToken = default)
  {
    var listenId = new RequestId(Interlocked.Increment(ref _nextId));
    var prms = new JsonObject
    {
      ["notifications"] = JsonSerializer.SerializeToNode(filter, McpJson.Options),
      ["_meta"] = new RequestMeta
      {
        ProtocolVersion = _protocolVersion,
        ClientInfo = _clientInfo,
        ClientCapabilities = _capabilities,
      }.ToJsonObject(),
    };
    var request = new JsonRpcRequest(listenId, McpMethods.SubscriptionsListen, prms);

    // §10.7: track the subscription's lifecycle. The acknowledged filter is computed against the
    // server's discovered capabilities; the Tasks extension being active (for taskIds) requires both
    // peers to advertise it. The subscription transitions opening → active on Acknowledge().
    var serverCaps = _discovered?.Capabilities;
    var tasksActive = (serverCaps?.HasExtension(MetaKeys.TasksExtension) ?? false)
      && _capabilities.HasExtension(MetaKeys.TasksExtension);
    var subscription = new Subscription(listenId, filter, serverCaps, tasksActive);
    subscription.Acknowledge();
    _subscriptionRegistry.Add(subscription);
    var subscriptionId = subscription.SubscriptionId;

    var handle = await _transport.OpenSubscriptionAsync(
      request,
      // §10.4: route each notification by its subscription id; ignore one that does not target us.
      notification =>
      {
        if (subscription.IsClosed) return;
        var routedId = SubscriptionRegistry.ReadSubscriptionId(notification.Params);
        if (routedId is not null && !string.Equals(routedId, subscriptionId, StringComparison.Ordinal)) return;
        onNotification?.Invoke(notification);
      },
      cancellationToken).ConfigureAwait(false);

    return new SubscriptionHandle
    {
      HonoredFilter = handle.HonoredFilter,
      Unsubscribe = async () =>
      {
        // §10.7: closing the subscription is a client cancel; remove it (no retained state) and tear down
        // the transport stream. Idempotent — a second unsubscribe is a no-op once already removed.
        _subscriptionRegistry.Remove(subscriptionId, SubscriptionCloseReason.ClientCancel);
        await handle.Unsubscribe().ConfigureAwait(false);
      },
    };
  }

  private readonly SubscriptionRegistry _subscriptionRegistry = new();

  /// <summary>The ids of the client's currently-active subscriptions (spec §10.7).</summary>
  public IReadOnlyList<string> ActiveSubscriptionIds => _subscriptionRegistry.ActiveIds;

  /// <summary>Returns the active <see cref="Subscription"/> with <paramref name="subscriptionId"/>, or <c>null</c> (spec §10.7).</summary>
  /// <param name="subscriptionId">The subscription id.</param>
  /// <returns>The subscription, or <c>null</c> when not active.</returns>
  public Subscription? GetSubscription(string subscriptionId) => _subscriptionRegistry.Get(subscriptionId);

  /// <summary>
  /// Registers a handler for a server-initiated input request kind (spec §11): <c>elicitation/create</c>
  /// (§20), <c>sampling/createMessage</c> (§21), or <c>roots/list</c> (§21). The handler receives the
  /// input request's <c>params</c> and returns the corresponding response object (an <c>ElicitResult</c>,
  /// <c>CreateMessageResult</c>, or <c>ListRootsResult</c>).
  /// </summary>
  /// <param name="method">The input-request method name.</param>
  /// <param name="handler">The async handler producing the response JSON.</param>
  public void RegisterInputHandler(string method, Func<JsonObject?, Task<JsonNode>> handler) => _inputHandlers[method] = handler;

  /// <summary>
  /// Invokes a tool, fulfilling any <c>input_required</c> rounds via the registered input handlers and
  /// retrying until the call completes (spec §11/§16.5). This is the driver behind the elicitation,
  /// sampling, and roots flows.
  /// </summary>
  /// <param name="name">The tool name.</param>
  /// <param name="arguments">The arguments object.</param>
  /// <param name="options">Per-request options.</param>
  /// <returns>The final tool result object.</returns>
  public Task<JsonObject> CallToolWithInputAsync(string name, JsonObject? arguments = null, RequestOptions? options = null) =>
    RequestWithInputAsync(McpMethods.ToolsCall, new JsonObject { ["name"] = name, ["arguments"] = arguments?.DeepClone() ?? new JsonObject() }, options);

  /// <summary>
  /// Sends a request and drives the multi-round-trip loop (spec §11): on an <c>input_required</c> result
  /// it fulfills each input request via the registered handlers, accumulates the responses, echoes
  /// <c>requestState</c>, and resends the original method with the original arguments until a final result.
  /// </summary>
  /// <param name="method">The request method (a method that supports MRTR, §11.6).</param>
  /// <param name="paramsBody">The original parameters.</param>
  /// <param name="options">Per-request options.</param>
  /// <returns>The final result object.</returns>
  public async Task<JsonObject> RequestWithInputAsync(string method, JsonObject? paramsBody = null, RequestOptions? options = null)
  {
    var baseParams = paramsBody is null ? new JsonObject() : (JsonObject)paramsBody.DeepClone();
    var capabilities = JsonSerializer.SerializeToNode(_capabilities, McpJson.Options)!.AsObject();

    // The server is stateless per round and reconstructs the conversation from the FULL accumulated set
    // of inputResponses the client re-sends each round (keyed by the server's per-call-site keys), plus
    // the echoed opaque requestState continuation token (§11.3). We therefore accumulate responses across
    // rounds rather than sending only the latest.
    var inputResponses = new JsonObject();
    string? requestState = null;

    for (var round = 0; round < MaxInputRounds; round++)
    {
      var prms = (JsonObject)baseParams.DeepClone();
      if (inputResponses.Count > 0) prms["inputResponses"] = (JsonObject)inputResponses.DeepClone();
      if (requestState is not null) prms["requestState"] = requestState;

      var result = await RequestAsync(method, prms, options).ConfigureAwait(false);

      // §11.5: discriminate the result against our own declared capabilities. An undeclared requested
      // input-request kind (R-11.5-k), an unrecognized resultType (R-11.5-d), or a malformed
      // input_required result all make the whole result an error — we MUST NOT fulfill it (S17-RQ-18).
      var decision = MultiRoundTrip.DiscriminateResultType(result, capabilities);
      switch (decision.Action)
      {
        case ResultDiscriminationAction.Complete:
          return result;
        case ResultDiscriminationAction.Error:
          throw McpError.InvalidParams($"Multi-round-trip result error: {decision.Reason}");
      }

      var inputRequired = decision.Result!;
      requestState = inputRequired.RequestState; // echo the latest continuation token verbatim (§11.3).

      // §11.5 load-shedding: an input_required result with only requestState (no inputRequests) means
      // "retry later" — echo requestState with no new responses, applying a bounded backoff (R-11.5-n).
      if (inputRequired.InputRequests is null || inputRequired.InputRequests.Count == 0)
      {
        var delay = MultiRoundTrip.ComputeRetryBackoffMs(round + 1);
        if (delay > 0) await Task.Delay(TimeSpan.FromMilliseconds(delay)).ConfigureAwait(false);
        continue;
      }

      // Fulfill each newly-requested kind via its registered handler and accumulate the response.
      foreach (var (key, inputRequest) in inputRequired.InputRequests)
      {
        if (!_inputHandlers.TryGetValue(inputRequest.Method, out var handler))
        {
          throw McpError.InvalidParams($"No client handler is registered for input request kind '{inputRequest.Method}'.");
        }
        var response = await handler(inputRequest.Params).ConfigureAwait(false);
        inputResponses[key] = response.DeepClone();
      }
    }

    throw McpError.InternalError($"Multi-round-trip exceeded {MaxInputRounds} rounds without completing.");
  }

  private const int MaxInputRounds = 50;

  // ───────────────────────── Core request plumbing ─────────────────────────

  /// <summary>
  /// Sends an arbitrary request with the per-request <c>_meta</c> envelope applied, returning the
  /// result object on success and throwing <see cref="McpError"/> on a JSON-RPC error (spec §22).
  /// </summary>
  /// <param name="method">The JSON-RPC method.</param>
  /// <param name="paramsBody">The method parameters (excluding <c>_meta</c>), or <c>null</c>.</param>
  /// <param name="options">Per-request options.</param>
  /// <returns>The result object.</returns>
  public async Task<JsonObject> RequestAsync(string method, JsonObject? paramsBody = null, RequestOptions? options = null)
  {
    options ??= new RequestOptions();
    var prms = paramsBody is null ? new JsonObject() : (JsonObject)paramsBody.DeepClone();

    var additional = options.Meta is not null ? (JsonObject)options.Meta.DeepClone() : null;
    if (options.ProgressToken is { } token)
    {
      additional ??= new JsonObject();
      additional[MetaKeys.ProgressToken] = token.ToJsonNode();
    }
    prms["_meta"] = new RequestMeta
    {
      ProtocolVersion = _protocolVersion,
      ClientInfo = _clientInfo,
      ClientCapabilities = _capabilities,
      Additional = additional,
    }.ToJsonObject();

    var request = new JsonRpcRequest(new RequestId(Interlocked.Increment(ref _nextId)), method, prms);
    var response = await _transport.SendRequestAsync(request, options).ConfigureAwait(false);

    return response switch
    {
      JsonRpcSuccessResponse success => success.Result,
      JsonRpcErrorResponse failure => throw new McpError(failure.Error.Code, failure.Error.Message, failure.Error.Data),
      _ => throw McpError.InternalError("Transport returned a non-response message."),
    };
  }

  /// <inheritdoc/>
  public ValueTask DisposeAsync() => _transport.DisposeAsync();

  private static JsonObject? Cursor(string? cursor) =>
    cursor is null ? null : new JsonObject { ["cursor"] = cursor };

  private static JsonObject Serialize<T>(T value) => JsonSerializer.SerializeToNode(value, McpJson.Options)!.AsObject();

  private static T Deserialize<T>(JsonObject result) =>
    result.Deserialize<T>(McpJson.Options) ?? throw McpError.InternalError($"Could not read a {typeof(T).Name} result.");
}
