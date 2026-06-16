using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Client;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport;

namespace CSharpMcpClient;

/// <summary>A configured filesystem root the client exposes to the server (deprecated capability, §21).</summary>
/// <param name="Uri">The root URI.</param>
/// <param name="Name">An optional display name.</param>
public sealed record RootEntry(string Uri, string? Name = null);

/// <summary>
/// Hosts the MCP <em>client</em> for the companion backend, built on the Stackific.Mcp SDK client
/// runtime. It connects to the configured server over Streamable HTTP, taps every wire frame to the
/// <see cref="DebugBus"/> for the SPA's "under the hood" view, bridges server-initiated input requests
/// (elicitation → the browser; sampling → a model; roots → configuration), and exposes typed actions
/// the REST layer calls. The C# counterpart of ts-mcp-client's mcp-client.ts.
/// </summary>
public sealed class ClientHost
{
  private static readonly Implementation ClientInfo = new() { Name = "companion-mcp-client", Title = "Companion MCP Client (C#)", Version = "0.1.0" };

  // The capabilities this client declares on every request (single source of truth).
  private static readonly ClientCapabilities Capabilities = new()
  {
    Elicitation = new ElicitationCapability { Form = new JsonObject(), Url = new JsonObject() },
    Sampling = new SamplingCapability(),
    Roots = new JsonObject(),
    Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject() },
  };

  private readonly string _serverUrl;
  private readonly SamplingProvider _sampling;
  private readonly AsyncLocal<string?> _trace = new();
  private readonly ConcurrentDictionary<string, CancellationTokenSource> _inflight = new();
  private readonly ConcurrentDictionary<string, PendingElicitation> _pending = new();

  private McpClient? _client;
  private SubscriptionHandle? _subscription;
  private List<RootEntry> _roots =
  [
    new("file:///workspace/companion-project", "companion-project"),
    new("file:///workspace/shared-lib", "shared-lib"),
  ];

  /// <summary>Creates a client host targeting <paramref name="serverUrl"/>.</summary>
  /// <param name="serverUrl">The MCP server endpoint (for example <c>http://localhost:8201/mcp</c>).</param>
  /// <param name="sampling">The sampling provider backing the <c>sampling/createMessage</c> handler (DeepSeek or mock).</param>
  public ClientHost(string serverUrl, SamplingProvider sampling)
  {
    _serverUrl = serverUrl;
    _sampling = sampling;
  }

  /// <summary>The shared wire-frame bus relayed to <c>/debug/stream</c>.</summary>
  public DebugBus Bus { get; } = new();

  /// <summary>The MCP server endpoint URL.</summary>
  public string ServerUrl => _serverUrl;

  /// <summary>The sampling info surfaced on <c>/health</c> and <c>/info</c> (provider, model, base URL, key presence).</summary>
  public object SamplingInfo => new
  {
    provider = _sampling.Provider,
    model = _sampling.ModelLabel,
    baseUrl = _sampling.BaseUrl,
    keyPresent = _sampling.HasKey,
  };

  /// <summary>A short provider label (<c>deepseek</c> or <c>mock</c>) for the <c>/health</c> probe.</summary>
  public string SamplingProvider => _sampling.HasKey ? "deepseek" : "mock";

  /// <summary>Establishes (or no-ops on) a connection and runs discovery.</summary>
  /// <returns>A task that completes once connected.</returns>
  public async Task EnsureConnectedAsync()
  {
    if (_client is not null) return;

    var transport = new StreamableHttpClientTransport(new Uri(_serverUrl))
    {
      OnSend = node => Tap("send", node),
      OnReceive = node => Tap("recv", node),
    };
    var client = new McpClient(transport, ClientInfo, Capabilities);
    client.RegisterInputHandler(McpMethods.ElicitationCreate, HandleElicitationAsync);
    client.RegisterInputHandler(McpMethods.SamplingCreateMessage, HandleSamplingAsync);
    client.RegisterInputHandler(McpMethods.RootsList, HandleRootsAsync);

    Bus.Emit(new Frame(0, 0, "local", "lifecycle", Summary: $"connecting to {_serverUrl}"));
    _client = client;
    try
    {
      await client.DiscoverAsync();
    }
    catch (Exception error)
    {
      Bus.Emit(new Frame(0, 0, "local", "error", Summary: $"discover failed: {error.Message}"));
    }
    Bus.Emit(new Frame(0, 0, "local", "lifecycle", Summary: $"connected — protocol {_client.NegotiatedVersion ?? "unknown"}"));
  }

  /// <summary>Tears down and reconnects, forcing a fresh discovery round-trip on the wire.</summary>
  /// <returns>A task that completes once reconnected.</returns>
  public async Task ReconnectAsync()
  {
    if (_client is not null)
    {
      await _client.DisposeAsync();
      _client = null;
    }
    await WithTraceAsync("reconnect", () => Task.CompletedTask);
  }

  /// <summary>The connection/status snapshot the frontend renders.</summary>
  /// <returns>A <c>BackendStatus</c>-shaped object.</returns>
  public object Status() => new
  {
    connected = _client is { IsConnected: true },
    negotiatedVersion = _client?.NegotiatedVersion,
    serverInfo = _client?.ServerInfo,
    serverCapabilities = _client?.ServerCapabilities,
    serverExtensions = _client?.ServerCapabilities?.Extensions,
    clientCapabilities = Capabilities,
    roots = _roots,
    serverUrl = _serverUrl,
  };

  /// <summary>The configured roots.</summary>
  /// <returns>The roots list.</returns>
  public IReadOnlyList<RootEntry> GetRoots() => _roots;

  /// <summary>Replaces the configured roots.</summary>
  /// <param name="roots">The new roots.</param>
  public void SetRoots(IReadOnlyList<RootEntry> roots) => _roots = [.. roots];

  /// <summary>
  /// Opens (or re-opens) the single active subscription stream (spec §10) from a frontend filter body,
  /// returning the server's honored filter. Subsequent change notifications ride the tapped wire stream.
  /// </summary>
  /// <param name="filterBody">The frontend filter (<c>toolsListChanged</c>, <c>resourceSubscriptions</c>, …).</param>
  /// <returns>An object carrying the acknowledged (honored) filter.</returns>
  public async Task<object> SubscribeAsync(JsonObject filterBody)
  {
    await EnsureConnectedAsync();
    if (_subscription is not null)
    {
      await _subscription.Unsubscribe();
      _subscription = null;
    }
    var filter = new SubscriptionFilter
    {
      ToolsListChanged = filterBody["toolsListChanged"]?.GetValue<bool>() == true ? true : null,
      PromptsListChanged = filterBody["promptsListChanged"]?.GetValue<bool>() == true ? true : null,
      ResourcesListChanged = filterBody["resourcesListChanged"]?.GetValue<bool>() == true ? true : null,
      ResourceSubscriptions = (filterBody["resourceSubscriptions"] as JsonArray)?.Select(n => n!.GetValue<string>()).ToList(),
    };
    _trace.Value = "subscriptions/listen";
    try
    {
      var handle = await _client!.SubscribeAsync(filter);
      _subscription = handle;
      return new { acknowledgedFilter = handle.HonoredFilter };
    }
    finally { _trace.Value = null; }
  }

  // ───────────────────────── Actions used by the REST layer ─────────────────────────

  /// <summary>Runs <paramref name="action"/> within a connected client and a named trace group.</summary>
  /// <typeparam name="T">The action result type.</typeparam>
  /// <param name="trace">The trace tag grouping the emitted frames.</param>
  /// <param name="action">The action over the live client.</param>
  /// <returns>The action result.</returns>
  public async Task<T> WithTraceAsync<T>(string trace, Func<McpClient, Task<T>> action)
  {
    await EnsureConnectedAsync();
    _trace.Value = trace;
    try { return await action(_client!); }
    finally { _trace.Value = null; }
  }

  private Task WithTraceAsync(string trace, Func<Task> action) =>
    WithTraceAsync(trace, async _ => { await action(); return 0; });

  /// <summary>Registers a cancellable call so the UI can abort it by id (→ notifications/cancelled).</summary>
  /// <param name="cancelId">The UI-supplied cancellation id.</param>
  /// <returns>A cancellation token source registered under <paramref name="cancelId"/>.</returns>
  public CancellationTokenSource RegisterCancellable(string cancelId)
  {
    var cts = new CancellationTokenSource();
    _inflight[cancelId] = cts;
    return cts;
  }

  /// <summary>Removes a finished cancellable call.</summary>
  /// <param name="cancelId">The cancellation id.</param>
  public void ReleaseCancellable(string cancelId) => _inflight.TryRemove(cancelId, out _);

  /// <summary>Cancels an in-flight call by id.</summary>
  /// <param name="cancelId">The cancellation id.</param>
  /// <returns><c>true</c> if a matching call was found and cancelled.</returns>
  public bool Cancel(string cancelId)
  {
    if (_inflight.TryGetValue(cancelId, out var cts)) { cts.Cancel(); return true; }
    return false;
  }

  /// <summary>Resolves a pending browser elicitation with the user's answer.</summary>
  /// <param name="id">The pending elicitation id.</param>
  /// <param name="result">The user's elicitation result.</param>
  /// <returns><c>true</c> if a matching pending elicitation was found.</returns>
  public bool ResolveElicitation(string id, ElicitResult result)
  {
    if (_pending.TryRemove(id, out var pending)) { pending.Completion.TrySetResult(result); return true; }
    return false;
  }

  /// <summary>Lists pending elicitations awaiting a browser answer.</summary>
  /// <returns>The pending entries (id + mode).</returns>
  public IEnumerable<object> ListPending() => _pending.Select(kv => new { id = kv.Key, mode = kv.Value.Mode });

  // ───────────────────────── Server→client input handlers ─────────────────────────

  private Task<JsonNode> HandleElicitationAsync(JsonObject? parameters)
  {
    var id = Guid.NewGuid().ToString("N");
    var mode = parameters?["mode"]?.GetValue<string>() ?? "form";
    var completion = new TaskCompletionSource<ElicitResult>(TaskCreationOptions.RunContinuationsAsynchronously);
    _pending[id] = new PendingElicitation(completion, mode);
    Bus.Emit(new Frame(0, 0, "recv", "elicitation", McpMethods.ElicitationCreate,
      Summary: $"server requests {mode} input → asking the user",
      Payload: new { pendingId = id, @params = parameters },
      Trace: _trace.Value));
    return completion.Task.ContinueWith(t => Serialize(t.Result), TaskScheduler.Default);
  }

  private async Task<JsonNode> HandleSamplingAsync(JsonObject? parameters)
  {
    Bus.Emit(new Frame(0, 0, "local", "note", McpMethods.SamplingCreateMessage,
      Summary: $"client handling sampling → {(_sampling.HasKey ? "DeepSeek" : "mock model")}",
      Payload: parameters, Trace: _trace.Value));
    var result = await _sampling.SampleAsync(parameters).ConfigureAwait(false);
    return Serialize(result);
  }

  private Task<JsonNode> HandleRootsAsync(JsonObject? _)
  {
    Bus.Emit(new Frame(0, 0, "local", "note", McpMethods.RootsList,
      Summary: "client returning configured roots", Payload: new { roots = _roots }, Trace: _trace.Value));
    var result = new ListRootsResult { Roots = [.. _roots.Select(r => new Root { Uri = r.Uri, Name = r.Name })] };
    return Task.FromResult(Serialize(result));
  }

  // ───────────────────────── Wire tap ─────────────────────────

  private void Tap(string dir, JsonNode? message)
  {
    var (kind, method, id, summary) = Classify(message);
    Bus.Emit(new Frame(0, 0, dir, kind, method, id, summary, message?.DeepClone(), _trace.Value));
  }

  private static (string Kind, string? Method, object? Id, string Summary) Classify(JsonNode? message)
  {
    if (message is JsonObject obj)
    {
      var method = obj["method"]?.GetValue<string>();
      var hasId = obj.TryGetPropertyValue("id", out var idNode) && idNode is not null;
      if (method is not null && hasId) return ("request", method, AsId(idNode), $"request → {method}");
      if (method is not null) return ("notification", method, null, $"notification {method}");
      if (obj.ContainsKey("result")) return ("response", null, AsId(obj["id"]), $"result for #{AsId(obj["id"])}");
      if (obj["error"] is JsonObject error) return ("error", null, AsId(obj["id"]), $"error {error["code"]}: {error["message"]}");
    }
    return ("note", null, null, "message");
  }

  private static object? AsId(JsonNode? node) => node is JsonValue value ? value.GetValue<object>() : null;

  private static JsonNode Serialize<T>(T value) => JsonSerializer.SerializeToNode(value, McpJson.Options)!;

  private sealed record PendingElicitation(TaskCompletionSource<ElicitResult> Completion, string Mode);
}
