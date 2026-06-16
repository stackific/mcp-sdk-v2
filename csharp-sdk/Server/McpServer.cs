using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Server;

/// <summary>
/// A spec-conformant MCP server runtime (spec §5, §16–§19): a dispatcher onto which features are
/// registered (tools, resources, resource templates, prompts, completion) and which turns a parsed
/// JSON-RPC request into the correct response. It owns no transport — the in-memory bridge and the
/// Streamable HTTP adapter call <see cref="HandleRequestAsync"/> — so the same server runs unchanged
/// over any binding. Processing is stateless: every request is validated and served on its own (§4.4).
/// </summary>
public sealed class McpServer : IMcpRequestHandler, IMcpSubscriptionHandler
{
  private readonly Implementation _serverInfo;
  private readonly ServerCapabilities _capabilities;
  private readonly string? _instructions;

  private readonly List<Tool> _toolList = [];
  private readonly Dictionary<string, ToolHandler> _toolHandlers = new(StringComparer.Ordinal);
  private readonly List<Resource> _resourceList = [];
  private readonly Dictionary<string, ResourceReadHandler> _resourceReaders = new(StringComparer.Ordinal);
  private readonly List<RegisteredTemplate> _templates = [];
  private readonly List<Prompt> _promptList = [];
  private readonly Dictionary<string, RegisteredPrompt> _prompts = new(StringComparer.Ordinal);

  private readonly Dictionary<string, Func<ToolContext, Task<McpTask>>> _taskTools = new(StringComparer.Ordinal);
  private readonly ServerCompletionCatalog _completionCatalog;
  private readonly SubscriptionManager _subscriptions = new();
  private Func<JsonRpcNotification, Task> _subscriberSink;
  private InMemoryTaskStore _taskStore = new();

  /// <summary>
  /// The minimum severity of <c>notifications/message</c> the server emits, settable via
  /// <c>logging/setLevel</c> (§15.3). Defaults to <see cref="LoggingLevel.Info"/>, mirroring the TS
  /// server's <c>logLevel = 'info'</c> default. A tool's <see cref="ToolContext.LogAsync"/> is gated at
  /// or above this level through <see cref="LoggingFilter.IsAtOrAboveLogLevel"/>.
  /// </summary>
  private LoggingLevel _minLogLevel = LoggingLevel.Info;

  /// <summary>Creates a server with the given identity, advertised capabilities, and optional instructions.</summary>
  /// <param name="serverInfo">The server identity returned in discovery (§5.3.2).</param>
  /// <param name="capabilities">The capabilities the server advertises (§6.3). Gating is enforced against these.</param>
  /// <param name="instructions">Optional natural-language guidance returned in discovery (§5.3.2).</param>
  public McpServer(Implementation serverInfo, ServerCapabilities capabilities, string? instructions = null)
  {
    _serverInfo = serverInfo;
    _capabilities = capabilities;
    _instructions = instructions;
    _subscriberSink = _subscriptions.FanOutAsync;
    _completionCatalog = new ServerCompletionCatalog(_prompts, _templates);
    // Push notifications/tasks for every status change on the default store too (§25.10), so a
    // task-augmented tool driving the default store reaches subscribers without an explicit SetTaskStore.
    _taskStore.OnUpdate = PushTaskStatus;
  }

  /// <summary>The number of items returned per page from a list operation (§12). Defaults to 50.</summary>
  public int PageSize { get; init; } = 50;

  /// <summary>
  /// The default freshness hint (ms) stamped as the top-level <c>ttlMs</c> on the five cacheable-method
  /// results (§13.4, R-13.4-b). Defaults to <c>0</c> — a non-caching server still MUST emit the field.
  /// A per-call <see cref="ToolContext.SetCacheHints"/> override (the analog of TS <c>withCacheHints</c>)
  /// takes precedence on a <c>tools/call</c> result.
  /// </summary>
  public long CacheTtlMs { get; init; }

  /// <summary>
  /// The default top-level <c>cacheScope</c> for cacheable-method results (§13.3). Defaults to
  /// <see cref="Protocol.CacheScope.Private"/> — the privacy-default a server MUST apply when it cannot
  /// reliably distinguish authorization contexts (R-13.1-e, R-13.3-h). Emission is routed through
  /// <see cref="Caching.ResolveCacheScope(string)"/> so the resolved scope always lands on the privacy
  /// default for any unrecognized value.
  /// </summary>
  public CacheScope CacheScope { get; init; } = CacheScope.Private;

  /// <summary>
  /// Optional result-level <c>_meta</c> attached to the <c>server/discover</c> result (§5.3.2, R-5.3.2-k):
  /// arbitrary protocol-defined or vendor metadata. <c>null</c> (the default) attaches none.
  /// </summary>
  public JsonObject? DiscoverMeta
  {
    get => _discoverMeta;
    init => _discoverMeta = value;
  }

  private readonly JsonObject? _discoverMeta;

  /// <summary>The advertised server capabilities (§6.3).</summary>
  public ServerCapabilities Capabilities => _capabilities;

  /// <summary>
  /// Resolves a registered tool's <c>inputSchema</c> by name, or <c>null</c> for an unknown tool (§16.4).
  /// The Streamable HTTP adapter consumes this so a <c>tools/call</c> can have its <c>Mcp-Param-*</c>
  /// headers validated/decoded against the tool's schema (§9.5.4) — see <see cref="StreamableHttpServer.MapMcp"/>.
  /// </summary>
  /// <param name="toolName">The tool name.</param>
  /// <returns>The tool's input schema node (a clone), or <c>null</c> when the tool is not registered.</returns>
  public JsonNode? GetToolInputSchema(string toolName)
  {
    var tool = _toolList.FirstOrDefault(t => t.Name == toolName);
    return tool?.InputSchema.DeepClone();
  }

  /// <summary>
  /// Installs the sink used by <see cref="ToolContext.NotifySubscribersAsync"/> to fan change
  /// notifications out to active subscription streams (§10). Wired by the subscription transport.
  /// </summary>
  /// <param name="sink">The fan-out delegate.</param>
  public void SetSubscriberSink(Func<JsonRpcNotification, Task> sink) => _subscriberSink = sink;

  /// <inheritdoc/>
  public bool SupportsSubscriptions => true;

  /// <inheritdoc/>
  /// <remarks>
  /// §25.10 gating: a <c>subscriptions/listen</c> carrying a <c>taskIds</c> filter requires the Tasks
  /// extension to be active. The transport does not thread the request's client-capability <c>_meta</c>
  /// into this call, so activeness is determined from the server's advertised Tasks extension — a server
  /// that does not advertise Tasks cannot serve task pushes. When <c>taskIds</c> is supplied but Tasks is
  /// not active, the listen is rejected with <c>-32003</c> (R-25.10-e). Threading the client's negotiated
  /// tasks capability through the subscription handler is a Phase-5 transport seam.
  /// </remarks>
  public (SubscriptionFilter Honored, IDisposable Teardown) OpenSubscription(
    SubscriptionFilter requested,
    string subscriptionId,
    Func<JsonRpcNotification, Task> deliver)
  {
    var tasksActive = _capabilities.HasExtension(MetaKeys.TasksExtension);
    if (requested.TaskIds is { Count: > 0 } && !tasksActive)
    {
      // R-25.10-e: taskIds without the active Tasks extension is -32003 (on HTTP, a 400 single response).
      throw Tasks.BuildTasksMissingCapabilityError(McpMethods.SubscriptionsListen);
    }
    return _subscriptions.Register(requested, _capabilities, subscriptionId, deliver, tasksActive);
  }

  /// <summary>The durable task store backing the Tasks extension (spec §25).</summary>
  public InMemoryTaskStore TaskStore => _taskStore;

  /// <summary>
  /// Replaces the task store (for example to inject a deterministic clock in tests) and wires its
  /// status-change listener to fan a <c>notifications/tasks</c> push to subscribers (§25.10). Every
  /// observable status change — including background work driven by a task-augmented tool — is forwarded
  /// to the <see cref="SubscriptionManager"/>, which delivers it only to streams that opted into the
  /// task id via a <c>taskIds</c> subscription filter.
  /// </summary>
  /// <param name="store">The store to use.</param>
  public void SetTaskStore(InMemoryTaskStore store)
  {
    _taskStore = store;
    store.OnUpdate = PushTaskStatus;
  }

  /// <summary>
  /// Registers a task-augmented tool (spec §25.3): when a caller that declared the Tasks extension
  /// invokes it, the server returns a task handle immediately and the handler drives the work to the
  /// <see cref="TaskStore"/> in the background. The handler creates the task (via
  /// <see cref="ToolContext.Tasks"/>), starts its background work, and returns the handle.
  /// </summary>
  /// <param name="tool">The tool definition.</param>
  /// <param name="handler">The handler that creates and returns the task handle.</param>
  public void RegisterTaskTool(Tool tool, Func<ToolContext, Task<McpTask>> handler)
  {
    AssertRegistrableToolSchemas(tool);
    if (!_taskTools.TryAdd(tool.Name, handler))
    {
      throw new InvalidOperationException($"A tool named \"{tool.Name}\" is already registered.");
    }
    _toolList.Add(tool);
  }

  // ───────────────────────── Registration ─────────────────────────

  /// <summary>Registers a tool and its handler (spec §16). Names must be unique within the server.</summary>
  /// <param name="tool">The tool definition (name, schemas, annotations).</param>
  /// <param name="handler">The invocation handler.</param>
  public void RegisterTool(Tool tool, ToolHandler handler)
  {
    AssertRegistrableToolSchemas(tool);
    if (!_toolHandlers.TryAdd(tool.Name, handler))
    {
      throw new InvalidOperationException($"A tool named \"{tool.Name}\" is already registered.");
    }
    _toolList.Add(tool);
  }

  /// <summary>
  /// Applies the §16.4 schema-hardening gate to a tool's input and (optional) output schemas before
  /// registration: rejects a non-object / unbounded / external-<c>$ref</c> / unsupported-dialect
  /// schema, and enforces the input-schema root-<c>type:"object"</c> rule. A server MUST refuse to
  /// register a schema it cannot safely validate. (§16.4, R-16.4-d/f/k/l/m/n/t)
  /// </summary>
  /// <param name="tool">The tool whose schemas to validate.</param>
  /// <exception cref="ArgumentException">When a schema is unsafe to register.</exception>
  /// <exception cref="UnsupportedDialectException">When a schema declares an unsupported dialect.</exception>
  private static void AssertRegistrableToolSchemas(Tool tool)
  {
    ToolSchemas.AssertRegistrableToolSchema(tool.InputSchema, ToolSchemaRole.Input);
    if (tool.OutputSchema is not null)
    {
      ToolSchemas.AssertRegistrableToolSchema(tool.OutputSchema, ToolSchemaRole.Output);
    }
  }

  /// <summary>Registers a concrete resource and its reader (spec §17).</summary>
  /// <param name="resource">The resource descriptor.</param>
  /// <param name="reader">The reader invoked for <c>resources/read</c> of this URI.</param>
  public void RegisterResource(Resource resource, ResourceReadHandler reader)
  {
    if (!_resourceReaders.TryAdd(resource.Uri, reader))
    {
      throw new InvalidOperationException($"A resource with URI \"{resource.Uri}\" is already registered.");
    }
    _resourceList.Add(resource);
  }

  /// <summary>Registers a resource template, its reader, and optional per-variable completers (spec §17/§19).</summary>
  /// <param name="template">The resource template descriptor.</param>
  /// <param name="reader">The reader invoked when a read URI matches this template.</param>
  /// <param name="completers">Optional completion providers keyed by template-variable name.</param>
  public void RegisterResourceTemplate(
    ResourceTemplate template,
    ResourceTemplateReadHandler reader,
    IReadOnlyDictionary<string, ArgumentCompleter>? completers = null)
  {
    // §17.4 (R-17.4-m): the URI template MUST conform to RFC 6570; reject a malformed one at
    // registration rather than silently mis-handling it at read time.
    if (!UriTemplate.IsUriTemplate(template.UriTemplate))
    {
      throw new ArgumentException(
        $"ResourceTemplate.uriTemplate MUST conform to the URI Template grammar [RFC 6570]: {template.UriTemplate}",
        nameof(template));
    }

    _templates.Add(new RegisteredTemplate(template, reader, UriTemplate.CompileMatcher(template.UriTemplate), completers));
  }

  /// <summary>Registers a prompt, its handler, and optional per-argument completers (spec §18/§19).</summary>
  /// <param name="prompt">The prompt descriptor (name, arguments).</param>
  /// <param name="handler">The handler that resolves the prompt into messages.</param>
  /// <param name="completers">Optional completion providers keyed by argument name.</param>
  public void RegisterPrompt(
    Prompt prompt,
    PromptGetHandler handler,
    IReadOnlyDictionary<string, ArgumentCompleter>? completers = null)
  {
    if (!_prompts.TryAdd(prompt.Name, new RegisteredPrompt(prompt, handler, completers)))
    {
      throw new InvalidOperationException($"A prompt named \"{prompt.Name}\" is already registered.");
    }
    _promptList.Add(prompt);
  }

  // ───────────────────────── Dispatch ─────────────────────────

  /// <inheritdoc/>
  public async Task<JsonRpcMessage> HandleRequestAsync(
    JsonRpcRequest request,
    IServerNotifier notifier,
    AuthInfo? authInfo,
    CancellationToken cancellationToken)
  {
    try
    {
      var meta = RequestMeta.Parse(request.Params);
      if (!ProtocolRevision.IsSupported(meta.ProtocolVersion))
      {
        throw McpError.UnsupportedProtocolVersion(ProtocolRevision.Supported, meta.ProtocolVersion);
      }

      // §15.3.3 (R-15.3.3-g): a PRESENT-but-unrecognized io.modelcontextprotocol/logLevel opt-in is
      // rejected with -32602. An ABSENT key is valid (it simply means the request opted out of logs).
      if (meta.LogLevel is not null)
      {
        var optIn = LoggingFilter.ValidateLogLevelOptIn(meta.LogLevel);
        if (!optIn.Ok) throw optIn.Error!;
      }

      var result = await DispatchAsync(request, meta, notifier, authInfo, cancellationToken).ConfigureAwait(false);
      return new JsonRpcSuccessResponse(request.Id, result);
    }
    catch (McpError error)
    {
      return new JsonRpcErrorResponse(request.Id, error.ToJsonRpcError());
    }
    catch (OperationCanceledException)
    {
      // The client closed the stream / cancelled (§9.6.2). Surface a benign error response.
      return new JsonRpcErrorResponse(request.Id, McpError.InternalError("Request cancelled.").ToJsonRpcError());
    }
    catch (Exception error)
    {
      return new JsonRpcErrorResponse(request.Id, McpError.InternalError(error.Message).ToJsonRpcError());
    }
  }

  /// <inheritdoc/>
  public Task HandleNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken)
  {
    // The client may send notifications/cancelled; cancellation is wired by the transport via the
    // CancellationToken on the originating request, so unrecognized notifications are simply ignored (§3.4).
    return Task.CompletedTask;
  }

  private Task<JsonObject> DispatchAsync(
    JsonRpcRequest request,
    RequestMeta meta,
    IServerNotifier notifier,
    AuthInfo? authInfo,
    CancellationToken cancellationToken) => request.Method switch
    {
      McpMethods.Initialize => Task.FromResult(Initialize(request.Params)),
      McpMethods.Discover => Task.FromResult(Discover()),
      McpMethods.Ping => Task.FromResult(Complete(new JsonObject())),
      McpMethods.LoggingSetLevel => Task.FromResult(SetLogLevel(request.Params)),
      McpMethods.ToolsList => Task.FromResult(ListTools(request.Params)),
      McpMethods.ToolsCall => CallToolAsync(request, meta, notifier, authInfo, cancellationToken),
      McpMethods.ResourcesList => Task.FromResult(ListResources(request.Params)),
      McpMethods.ResourceTemplatesList => Task.FromResult(ListResourceTemplates(request.Params)),
      McpMethods.ResourcesRead => ReadResourceAsync(request.Params),
      McpMethods.PromptsList => Task.FromResult(ListPrompts(request.Params)),
      McpMethods.PromptsGet => GetPromptAsync(request.Params),
      McpMethods.CompletionComplete => Task.FromResult(RunCompletion(request.Params)),
      McpMethods.TasksGet => Task.FromResult(GetTask(request.Params, meta)),
      McpMethods.TasksCancel => Task.FromResult(CancelTask(request.Params, meta)),
      McpMethods.TasksUpdate => Task.FromResult(UpdateTask(request.Params, meta)),
      _ => throw McpError.MethodNotFound(request.Method),
    };

  /// <summary>
  /// Answers the legacy <c>initialize</c> handshake (spec §9.2). Echoes the client's requested
  /// <c>protocolVersion</c> so any client accepts the handshake (the server itself targets
  /// <see cref="ProtocolRevision.Current"/> when the request omits one), and returns the advertised
  /// <c>capabilities</c> and <c>serverInfo</c>. This is distinct from <c>server/discover</c>: a spec
  /// client that still uses <c>initialize</c> must succeed rather than receive <c>-32601</c>. Mirrors
  /// the TypeScript <c>McpServer.initialize</c>.
  /// </summary>
  /// <param name="prms">The <c>initialize</c> params (its <c>protocolVersion</c> is echoed when present).</param>
  /// <returns>The initialize result carrying <c>protocolVersion</c>, <c>capabilities</c>, and <c>serverInfo</c>.</returns>
  private JsonObject Initialize(JsonObject? prms)
  {
    var requested = prms?["protocolVersion"] is JsonValue v && v.GetValueKind() == JsonValueKind.String
      ? v.GetValue<string>()
      : ProtocolRevision.Current;
    var result = new JsonObject
    {
      ["protocolVersion"] = requested,
      ["capabilities"] = Serialize(_capabilities),
      ["serverInfo"] = Serialize(_serverInfo),
    };
    return Complete(result);
  }

  /// <summary>
  /// Handles <c>logging/setLevel</c> (spec §15.3): records the requested minimum severity so subsequent
  /// <c>notifications/message</c> emissions are gated at or above it, and returns an empty complete
  /// result. An invalid or absent <c>level</c> is rejected with <c>-32602</c> (R-15.3.3-g), mirroring the
  /// TS validateLogLevelOptIn gate. Mirrors the TS <c>logging/setLevel</c> dispatch case.
  /// </summary>
  /// <param name="prms">The request params carrying the <c>level</c> string.</param>
  /// <returns>An empty complete result.</returns>
  private JsonObject SetLogLevel(JsonObject? prms)
  {
    var level = prms?["level"] is JsonValue v && v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : null;
    var validation = LoggingFilter.ValidateLogLevelOptIn(level);
    if (!validation.Ok) throw validation.Error!;
    _minLogLevel = LoggingFilter.ParseLogLevel(level)!.Value;
    return Complete(new JsonObject());
  }

  /// <summary>The server's current minimum log-emit severity (§15.3), settable via <c>logging/setLevel</c>.</summary>
  public LoggingLevel MinLogLevel => _minLogLevel;

  private JsonObject Discover()
  {
    // §5.3.2 (R-5.3.2-b): the result MUST advertise at least one supported revision. Validated() enforces
    // the non-empty-list invariant before the result reaches the wire, mirroring the TS buildDiscoverResult
    // guard / DiscoverResultSchema superRefine.
    var result = new DiscoverResult
    {
      SupportedVersions = ProtocolRevision.Supported,
      Capabilities = _capabilities,
      ServerInfo = _serverInfo,
      Instructions = _instructions,
      Meta = _discoverMeta,
    }.Validated();
    return Complete(Serialize(result));
  }

  private JsonObject ListTools(JsonObject? prms)
  {
    RequireCapability(_capabilities.Tools is not null, McpMethods.ToolsList);
    var (page, nextCursor) = Paginate(_toolList, prms);
    var result = Serialize(new ListToolsResult { Tools = page, NextCursor = nextCursor, TtlMs = CacheTtlMs, CacheScope = DefaultCacheScope });
    return Complete(result);
  }

  private JsonObject ListResources(JsonObject? prms)
  {
    RequireCapability(_capabilities.Resources is not null, McpMethods.ResourcesList);
    var (page, nextCursor) = Paginate(_resourceList, prms);
    var result = Serialize(new ListResourcesResult { Resources = page, NextCursor = nextCursor, TtlMs = CacheTtlMs, CacheScope = DefaultCacheScope }.Validated());
    return Complete(result);
  }

  private JsonObject ListResourceTemplates(JsonObject? prms)
  {
    RequireCapability(_capabilities.Resources is not null, McpMethods.ResourceTemplatesList);
    var all = _templates.Select(t => t.Template).ToList();
    var (page, nextCursor) = Paginate(all, prms);
    var result = Serialize(new ListResourceTemplatesResult { ResourceTemplates = page, NextCursor = nextCursor, TtlMs = CacheTtlMs, CacheScope = DefaultCacheScope }.Validated());
    return Complete(result);
  }

  private JsonObject ListPrompts(JsonObject? prms)
  {
    RequireCapability(_capabilities.Prompts is not null, McpMethods.PromptsList);
    var (page, nextCursor) = Paginate(_promptList, prms);
    var result = Serialize(new ListPromptsResult { Prompts = page, NextCursor = nextCursor, TtlMs = CacheTtlMs, CacheScope = DefaultCacheScope });
    return Complete(result);
  }

  private async Task<JsonObject> CallToolAsync(
    JsonRpcRequest request,
    RequestMeta meta,
    IServerNotifier notifier,
    AuthInfo? authInfo,
    CancellationToken cancellationToken)
  {
    RequireCapability(_capabilities.Tools is not null, McpMethods.ToolsCall);
    var prms = request.Params ?? throw McpError.InvalidParams("tools/call requires params.");
    var name = RequireStringParam(prms, "name");
    var tool = _toolList.FirstOrDefault(t => t.Name == name)
      ?? throw McpError.InvalidParams($"Unknown tool: {name}", new JsonObject { ["toolName"] = name });
    var arguments = prms["arguments"] as JsonObject ?? new JsonObject();
    SchemaValidation.ValidateArguments(tool.InputSchema, arguments, name);

    var progressToken = ReadProgressToken(meta);
    var inputResponses = ReadInputResponses(prms);

    // §25.3: a task-augmented tool returns a task handle when the caller declared the Tasks extension.
    if (_taskTools.TryGetValue(name, out var taskHandler))
    {
      RequireTasksCapability(meta);
      // §25.4: honor the caller's requested lifetime (params.task.ttl, the TS shape) when present;
      // otherwise apply the 5-minute default. A null ttl means an unbounded lifetime.
      var taskTtlMs = ReadRequestedTaskTtlMs(prms);
      var taskContext = new ToolContext(arguments, meta, authInfo, progressToken, notifier, _subscriberSink, inputResponses, cancellationToken, _taskStore, taskTtlMs, _minLogLevel, LoggingFilter.ResolvedMinLogLevelIndex(meta.LogLevel));
      var task = await taskHandler(taskContext).ConfigureAwait(false);
      var createResult = Serialize(new CreateTaskResult
      {
        TaskId = task.TaskId,
        Status = task.Status,
        StatusMessage = task.StatusMessage,
        CreatedAt = task.CreatedAt,
        LastUpdatedAt = task.LastUpdatedAt,
        TtlMs = task.TtlMs,
        PollIntervalMs = task.PollIntervalMs,
      });
      createResult["resultType"] = ResultTypes.Task;
      return createResult;
    }

    var handler = _toolHandlers[name];
    var context = new ToolContext(arguments, meta, authInfo, progressToken, notifier, _subscriberSink, inputResponses, cancellationToken, minLogLevel: _minLogLevel, requestLogLevelIndex: LoggingFilter.ResolvedMinLogLevelIndex(meta.LogLevel));

    try
    {
      var result = await handler(context).ConfigureAwait(false);

      // §16.5/§16.6 (R-16.5-o, R-16.4-p): when the tool declares an outputSchema, its result's
      // structuredContent MUST conform. A non-conforming structured result is a server-side fault
      // (the server emitted data that violates its own declared schema) → -32603 Internal error.
      SchemaValidation.ValidateStructuredContent(tool.OutputSchema, result.StructuredContent, name);

      var resultObject = Serialize(result);
      if (context.CacheHints is { } hints)
      {
        resultObject["ttlMs"] = hints.TtlMs;
        resultObject["cacheScope"] = hints.CacheScope == CacheScope.Public ? "public" : "private";
      }
      return Complete(resultObject);
    }
    catch (InputRequiredSignal signal)
    {
      // §11.2: the tool needs client input. Suspend the call by returning an input_required result, and
      // §11.3: mint an opaque `requestState` continuation token so a stateless server can resume. The
      // token captures the accumulated round count: decode the (untrusted) incoming token via
      // RequestStateCodec.TryDecode — never trust it raw — increment, and re-encode. A malformed or
      // absent token decodes to round 0 (R-11.3-h, R-11.3-i).
      _ = MultiRoundTrip.RequestStateCodec.TryDecode(ReadRequestState(prms), out var priorRound);
      var inputRequired = Serialize(new InputRequiredResult
      {
        InputRequests = new Dictionary<string, InputRequest> { [signal.Key] = signal.Request },
        RequestState = MultiRoundTrip.RequestStateCodec.Encode(priorRound + 1),
      });
      inputRequired["resultType"] = ResultTypes.InputRequired;
      return inputRequired;
    }
  }

  /// <summary>Reads the opaque <c>requestState</c> continuation token from the request params, or <c>null</c> when absent (§11.3).</summary>
  private static string? ReadRequestState(JsonObject prms) =>
    prms["requestState"] is JsonValue v && v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : null;

  /// <summary>
  /// Reads the caller's requested task lifetime from <c>params.task.ttl</c> (the §25.4 augmentation
  /// shape mirrored from the TS client). When the <c>task</c> object is absent the default 5-minute
  /// lifetime applies; when <c>ttl</c> is present and <c>null</c> the lifetime is unbounded; otherwise the
  /// supplied non-negative number is used.
  /// </summary>
  /// <param name="prms">The <c>tools/call</c> params.</param>
  /// <returns>The lifetime in milliseconds, or <c>null</c> for an unbounded lifetime.</returns>
  private static long? ReadRequestedTaskTtlMs(JsonObject prms)
  {
    const long defaultTtlMs = 300000;
    if (prms["task"] is not JsonObject task) return defaultTtlMs;
    if (!task.ContainsKey("ttl")) return defaultTtlMs;
    return task["ttl"] is JsonValue v && v.GetValueKind() == JsonValueKind.Number && v.TryGetValue(out long ttl)
      ? ttl
      : null; // present-and-null (or non-numeric) ⇒ unbounded lifetime.
  }

  private static IReadOnlyDictionary<string, JsonNode>? ReadInputResponses(JsonObject prms)
  {
    if (prms["inputResponses"] is not JsonObject responses) return null;
    var map = new Dictionary<string, JsonNode>(StringComparer.Ordinal);
    foreach (var (key, value) in responses)
    {
      if (value is not null) map[key] = value;
    }
    return map.Count > 0 ? map : null;
  }

  private async Task<JsonObject> ReadResourceAsync(JsonObject? prms)
  {
    RequireCapability(_capabilities.Resources is not null, McpMethods.ResourcesRead);
    if (prms is null) throw McpError.InvalidParams("resources/read requires params.");
    var uri = RequireStringParam(prms, "uri");

    if (_resourceReaders.TryGetValue(uri, out var reader))
    {
      var result = await reader(uri).ConfigureAwait(false);
      // §17.5 (R-17.5-z): a read MUST NOT signal non-existence with empty contents — that case is
      // the -32602 not-found error. Empty contents from a handler that claims this URI is a fault.
      Resources.GuardNonEmptyContents(result, uri);
      return Complete(Serialize(WithReadDefaults(result).Validated()));
    }

    foreach (var template in _templates)
    {
      if (!template.Matcher.TryMatch(uri, out var variables)) continue;
      var result = await template.Reader(uri, variables).ConfigureAwait(false);
      Resources.GuardNonEmptyContents(result, uri);
      return Complete(Serialize(WithReadDefaults(result).Validated()));
    }

    // §17.6 (R-17.6-a/b): a non-existent URI is -32602 (Invalid params) carrying data.uri.
    throw Resources.BuildResourceNotFoundError(uri);
  }

  private async Task<JsonObject> GetPromptAsync(JsonObject? prms)
  {
    RequireCapability(_capabilities.Prompts is not null, McpMethods.PromptsGet);
    if (prms is null) throw McpError.InvalidParams("prompts/get requires params.");
    var name = RequireStringParam(prms, "name");
    if (!_prompts.TryGetValue(name, out var registered))
    {
      throw McpError.InvalidParams($"Unknown prompt: {name}");
    }

    var arguments = new Dictionary<string, string>(StringComparer.Ordinal);
    if (prms["arguments"] is JsonObject argsObject)
    {
      foreach (var (key, value) in argsObject)
      {
        if (value is JsonValue v && v.GetValueKind() == JsonValueKind.String) arguments[key] = v.GetValue<string>();
      }
    }

    foreach (var argument in registered.Prompt.Arguments ?? [])
    {
      if (argument.Required == true && !arguments.ContainsKey(argument.Name))
      {
        throw McpError.InvalidParams($"Missing required prompt argument: {argument.Name}");
      }
    }

    var result = await registered.Handler(arguments).ConfigureAwait(false);
    return Complete(Serialize(result));
  }

  private JsonObject RunCompletion(JsonObject? prms)
  {
    RequireCapability(_capabilities.Completions is not null, McpMethods.CompletionComplete);
    if (prms is null) throw McpError.InvalidParams("completion/complete requires params.");

    // §19.2/§19.3 (R-19.2-e / R-19.3-f): the `ref` is a CLOSED discriminated union over `type`
    // (`ref/prompt` / `ref/resource`). An unknown/invalid discriminator — or any other shape the
    // params schema rejects — is INVALID PARAMS (-32602), NOT an internal error. System.Text.Json
    // surfaces an unrecognized polymorphic discriminator (and other binding failures) as a
    // JsonException, which would otherwise fall through to the generic -32603 catch in
    // HandleRequestAsync; trap it here and re-raise as -32602 so the closed-union violation maps to the
    // spec-mandated code rather than masquerading as an internal server fault.
    CompleteRequestParams request;
    try
    {
      request = prms.Deserialize<CompleteRequestParams>(McpJson.Options)
        ?? throw McpError.InvalidParams("Invalid completion/complete params.");
    }
    catch (JsonException error)
    {
      throw McpError.InvalidParams($"Invalid completion/complete params: {error.Message}");
    }
    var argumentName = request.Argument.Name;
    var value = request.Argument.Value;

    // §19.2 (R-19.2-k): a context.arguments key MUST NOT name the argument being completed.
    Completion.GuardContextExcludesArgument(request.Argument, request.Context);

    // §19.5 (R-19.5-r): an unknown ref OR an argument that is not a declared argument/variable of the
    // referenced target is rejected with -32602 (Invalid params) — NOT a not-found result. A KNOWN
    // argument with no registered completer is not an error; it simply yields empty values.
    var resolution = Completion.ResolveCompletionTarget(request.Ref, argumentName, _completionCatalog);
    if (!resolution.Ok)
    {
      throw resolution.Error!;
    }

    var candidates = request.Ref switch
    {
      PromptReference promptRef => CompletePrompt(promptRef.Name, argumentName, value),
      ResourceTemplateReference templateRef => CompleteTemplate(templateRef.Uri, argumentName, value),
      _ => throw McpError.InvalidParams("Unknown completion reference type."),
    };

    // §19.4 (R-19.4-c – R-19.4-h): cap at 100 and signal truncation ONLY when matches were dropped;
    // an under-cap result omits total/hasMore (unknown) rather than emitting an exact total.
    var result = new CompleteResult { Completion = Completion.ComputeCompletion(candidates) };
    return Complete(Serialize(result));
  }

  private IReadOnlyList<string> CompletePrompt(string promptName, string argument, string value)
  {
    // The ref + argument are already resolved against the catalog by RunCompletion (R-19.5-r), so a
    // known argument with no registered completer simply returns no suggestions.
    if (_prompts.TryGetValue(promptName, out var registered)
        && registered.Completers is not null
        && registered.Completers.TryGetValue(argument, out var completer))
    {
      return completer(value);
    }

    return [];
  }

  private IReadOnlyList<string> CompleteTemplate(string uri, string variable, string value)
  {
    foreach (var template in _templates)
    {
      if (template.Template.UriTemplate != uri) continue;
      if (template.Completers is not null && template.Completers.TryGetValue(variable, out var completer))
      {
        return completer(value);
      }

      return [];
    }

    return [];
  }

  private JsonObject GetTask(JsonObject? prms, RequestMeta meta)
  {
    RequireTasksActive(McpMethods.TasksGet, meta);
    var taskId = RequireStringParam(prms ?? throw McpError.InvalidParams("tasks/get requires params."), "taskId");
    // §25.7: the GetTaskResult IS the DetailedTask (with its inline outcome), flattened with
    // resultType:"complete" — NOT a nested { task }. Get throws -32602 for unknown/expired ids.
    return Complete(Serialize(_taskStore.Get(taskId)));
  }

  private JsonObject CancelTask(JsonObject? prms, RequestMeta meta)
  {
    RequireTasksActive(McpMethods.TasksCancel, meta);
    var taskId = RequireStringParam(prms ?? throw McpError.InvalidParams("tasks/cancel requires params."), "taskId");
    // §25.9: cooperative cancel. Unknown id → -32602 (Get throws). Cancelling a non-terminal task fires
    // the store's update listener, which pushes notifications/tasks to subscribers. The result is an EMPTY
    // acknowledgement whose resultType MUST be "complete" (R-25.9): the server MUST acknowledge with this
    // empty result, and the client observes the new state via tasks/get or notifications/tasks — never
    // from this ack.
    var detailed = _taskStore.Get(taskId); // -32602 for unknown/expired
    if (!Tasks.IsTerminalTaskStatus(detailed.Status))
    {
      _taskStore.Cancel(taskId);
    }
    return Complete(new JsonObject());
  }

  private JsonObject UpdateTask(JsonObject? prms, RequestMeta meta)
  {
    RequireTasksActive(McpMethods.TasksUpdate, meta);
    var body = prms ?? throw McpError.InvalidParams("tasks/update requires params.");
    var taskId = RequireStringParam(body, "taskId");

    // §25.8: bind the supplied responses to the task's outstanding input requests. Read the current
    // DetailedTask first so we know which keys are outstanding (-32602 for unknown/expired ids).
    var current = _taskStore.Get(taskId);
    var inputResponses = ReadInputResponses(body) ?? new Dictionary<string, JsonNode>(StringComparer.Ordinal);
    var outstanding = (IReadOnlyDictionary<string, InputRequest>)(current.InputRequests is { } req
      ? new Dictionary<string, InputRequest>(req, StringComparer.Ordinal)
      : new Dictionary<string, InputRequest>(StringComparer.Ordinal));

    // R-25.8-b/m: tasks/update only applies to an input_required task with outstanding requests.
    if (current.Status != McpTaskStatus.InputRequired)
    {
      throw McpError.InvalidParams(
        "Task is not awaiting input.", new JsonObject { ["taskId"] = taskId, ["status"] = current.Status.ToString() });
    }

    // R-25.8-h (stale-key dropping) + R-11.4 kind-correlation: an unknown key is ignored (dropped), but
    // a key whose RESPONSE shape does not match the outstanding request's kind is a protocol error.
    var kindError = MultiRoundTrip.ValidateRetryParams(outstanding, inputResponses);
    if (kindError is not null) throw kindError;

    // §25.8 (R-25.8-g, partial handling): bind only the outstanding subset; the still-missing keys MAY be
    // supplied by a later tasks/update. ApplyInput advances the task back to working and fires the store's
    // update listener, which pushes notifications/tasks to subscribers.
    _taskStore.ApplyInput(taskId, inputResponses);

    // §25.8: the acknowledgement is an EMPTY result whose resultType MUST be "complete" (R-25.8). The
    // server MUST acknowledge with this empty result; the binding is eventually consistent, so the client
    // observes the task's new state via tasks/get or notifications/tasks — never from this ack.
    return Complete(new JsonObject());
  }

  /// <summary>
  /// Pushes the task's current <see cref="DetailedTask"/> to subscribers as a <c>notifications/tasks</c>
  /// (§25.10, R-25.10-a). The <see cref="SubscriptionManager"/> fans it only to streams that opted into
  /// this task id via a <c>taskIds</c> subscription filter (R-25.10-d); for any other stream — and for a
  /// transport with no subscriptions wired — it is a no-op. A swept/expired task is silently skipped.
  /// </summary>
  /// <param name="taskId">The task whose new state to push.</param>
  private void PushTaskStatus(string taskId)
  {
    DetailedTask detailed;
    try
    {
      detailed = _taskStore.Get(taskId);
    }
    catch (McpError)
    {
      return; // task expired/removed between mutation and push — nothing to send.
    }
    _ = _subscriberSink(Tasks.BuildTaskStatusNotification(detailed));
  }

  private static void RequireTasksCapability(RequestMeta meta)
  {
    if (!meta.ClientCapabilities.HasExtension(MetaKeys.TasksExtension))
    {
      throw Tasks.BuildTasksMissingCapabilityError(McpMethods.TasksGet);
    }
  }

  /// <summary>
  /// Gates a Tasks request method (<c>tasks/get</c>/<c>tasks/cancel</c>/<c>tasks/update</c>): when the
  /// Tasks extension is not active — whether because the SERVER never advertised it or the CLIENT did
  /// not declare it in the request <c>_meta</c> — the method is rejected with <c>-32003</c> (missing
  /// required capability), <em>not</em> <c>-32601</c> (method not found). This mirrors the TypeScript
  /// <c>taskOp</c> gate. (§25.2/§25.7-§25.9, R-25.2-f, R-25.7-d, R-25.8-d, R-25.9-d)
  /// </summary>
  /// <param name="method">The Tasks method being gated (named in the error).</param>
  /// <param name="meta">The request envelope carrying the client's declared capabilities.</param>
  private void RequireTasksActive(string method, RequestMeta meta)
  {
    if (!_capabilities.HasExtension(MetaKeys.TasksExtension) ||
        !meta.ClientCapabilities.HasExtension(MetaKeys.TasksExtension))
    {
      throw Tasks.BuildTasksMissingCapabilityError(method);
    }
  }

  // ───────────────────────── Helpers ─────────────────────────

  /// <summary>
  /// The server-wide default <c>cacheScope</c> for cacheable results, resolved through the §13 privacy
  /// fallback so any value that is not exactly <c>public</c>/<c>private</c> collapses to
  /// <see cref="CacheScope.Private"/> (R-13.1-e, R-13.3-h). Mirrors the TS default of <c>private</c>.
  /// </summary>
  private CacheScope DefaultCacheScope => Caching.ResolveCacheScope(WireScope(CacheScope));

  /// <summary>The wire string (<c>"public"</c>/<c>"private"</c>) for a <see cref="CacheScope"/>.</summary>
  private static string WireScope(CacheScope scope) => scope == CacheScope.Public ? "public" : "private";

  private static JsonObject Complete(JsonObject result)
  {
    result["resultType"] = ResultTypes.Complete;
    return result;
  }

  /// <summary>
  /// Fills the REQUIRED §13.4 caching hints a <c>resources/read</c> result MUST carry, defaulting any
  /// hint the reader left unset: the configured <c>ttlMs</c> and the privacy-default <c>cacheScope</c>
  /// (<c>private</c>, never <c>public</c>, when unset — R-13.1-e). A hint the reader already supplied is
  /// preserved. Returns a defaulted copy ready for <see cref="ReadResourceResult.Validated"/>. (R-13.4-b)
  /// </summary>
  /// <param name="result">The reader's read result.</param>
  /// <returns>A copy with both caching hints populated.</returns>
  private ReadResourceResult WithReadDefaults(ReadResourceResult result) =>
    result with { TtlMs = result.TtlMs ?? CacheTtlMs, CacheScope = result.CacheScope ?? DefaultCacheScope };

  private static JsonObject Serialize<T>(T value) => JsonSerializer.SerializeToNode(value, McpJson.Options)!.AsObject();

  private static void RequireCapability(bool declared, string method)
  {
    if (!declared) throw McpError.MethodNotFound(method);
  }

  private static string RequireStringParam(JsonObject prms, string field) =>
    prms[field] is JsonValue v && v.GetValueKind() == JsonValueKind.String
      ? v.GetValue<string>()
      : throw McpError.InvalidParams($"Required parameter \"{field}\" is missing or not a string.");

  private static ProgressToken? ReadProgressToken(RequestMeta meta)
  {
    if (meta.Additional?[MetaKeys.ProgressToken] is JsonNode node)
    {
      return ProgressToken.FromJsonNode(node);
    }
    return null;
  }

  private (IReadOnlyList<T> Page, string? NextCursor) Paginate<T>(IReadOnlyList<T> all, JsonObject? prms)
  {
    var offset = 0;
    if (prms?["cursor"] is JsonValue cursorValue && cursorValue.GetValueKind() == JsonValueKind.String)
    {
      var raw = cursorValue.GetValue<string>();
      try
      {
        offset = int.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(raw)), System.Globalization.CultureInfo.InvariantCulture);
      }
      catch
      {
        throw McpError.InvalidParams("Invalid or expired pagination cursor.");
      }
      if (offset < 0 || offset > all.Count) throw McpError.InvalidParams("Invalid or expired pagination cursor.");
    }

    var page = all.Skip(offset).Take(PageSize).ToList();
    var nextOffset = offset + page.Count;
    var nextCursor = nextOffset < all.Count
      ? Convert.ToBase64String(Encoding.UTF8.GetBytes(nextOffset.ToString(System.Globalization.CultureInfo.InvariantCulture)))
      : null;
    return (page, nextCursor);
  }

  private sealed record RegisteredTemplate(
    ResourceTemplate Template,
    ResourceTemplateReadHandler Reader,
    UriTemplateMatcher Matcher,
    IReadOnlyDictionary<string, ArgumentCompleter>? Completers);

  private sealed record RegisteredPrompt(
    Prompt Prompt,
    PromptGetHandler Handler,
    IReadOnlyDictionary<string, ArgumentCompleter>? Completers);

  /// <summary>
  /// Resolves a completion <c>ref</c> + argument name against this server's live prompt and
  /// resource-template registries, so <see cref="Completion.ResolveCompletionTarget"/> can enforce
  /// R-19.5-r: an unknown prompt/template is unknown; a declared argument/variable (even one with no
  /// registered completer) is known. Prompt argument names come from the prompt's declared arguments;
  /// template variable names come from the RFC 6570 <c>uriTemplate</c>.
  /// </summary>
  private sealed class ServerCompletionCatalog(
    IReadOnlyDictionary<string, RegisteredPrompt> prompts,
    IReadOnlyList<RegisteredTemplate> templates) : ICompletionCatalog
  {
    public IReadOnlyList<string>? PromptArgumentNames(string name) =>
      prompts.TryGetValue(name, out var registered)
        ? (registered.Prompt.Arguments ?? []).Select(arg => arg.Name).ToList()
        : null;

    public IReadOnlyList<string>? ResourceTemplateVariableNames(string uri)
    {
      foreach (var template in templates)
      {
        if (template.Template.UriTemplate == uri)
        {
          return template.Matcher.VariableNames;
        }
      }

      return null;
    }
  }
}
