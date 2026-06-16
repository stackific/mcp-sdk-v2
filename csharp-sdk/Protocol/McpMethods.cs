namespace Stackific.Mcp.Protocol;

/// <summary>
/// The complete registry of JSON-RPC method and notification names defined by the protocol and its
/// in-scope extensions (spec Appendix A). Names are case-sensitive and reproduced verbatim.
/// </summary>
public static class McpMethods
{
  // ── Core requests (client → server) ──

  /// <summary>
  /// <c>initialize</c> — the legacy handshake request (§9.2). A spec client that has not switched to
  /// the modern <c>server/discover</c> flow issues <c>initialize</c>; the server echoes the client's
  /// requested protocol version, its advertised capabilities, and its identity. On Streamable HTTP this
  /// is the one method answered as a single non-streaming JSON response with no session (§9.2).
  /// </summary>
  public const string Initialize = "initialize";

  /// <summary><c>server/discover</c> — discovery + revision negotiation (§5).</summary>
  public const string Discover = "server/discover";

  /// <summary><c>tools/list</c> — list available tools (§16.2).</summary>
  public const string ToolsList = "tools/list";

  /// <summary><c>tools/call</c> — invoke a tool (§16.5).</summary>
  public const string ToolsCall = "tools/call";

  /// <summary><c>resources/list</c> — list resources (§17.2).</summary>
  public const string ResourcesList = "resources/list";

  /// <summary><c>resources/templates/list</c> — list resource templates (§17.3).</summary>
  public const string ResourceTemplatesList = "resources/templates/list";

  /// <summary><c>resources/read</c> — read a resource (§17.5).</summary>
  public const string ResourcesRead = "resources/read";

  /// <summary><c>prompts/list</c> — list prompts (§18.2).</summary>
  public const string PromptsList = "prompts/list";

  /// <summary><c>prompts/get</c> — resolve a prompt (§18.4).</summary>
  public const string PromptsGet = "prompts/get";

  /// <summary><c>completion/complete</c> — argument completion (§19.2).</summary>
  public const string CompletionComplete = "completion/complete";

  /// <summary><c>subscriptions/listen</c> — open a server-to-client notification stream (§10.2).</summary>
  public const string SubscriptionsListen = "subscriptions/listen";

  /// <summary><c>ping</c> — liveness check.</summary>
  public const string Ping = "ping";

  /// <summary>
  /// <c>logging/setLevel</c> — sets the minimum severity of <c>notifications/message</c> the server emits
  /// for subsequent requests; Deprecated (§15.3). The server holds the level and gates log emission at or
  /// above it.
  /// </summary>
  public const string LoggingSetLevel = "logging/setLevel";

  // ── Tasks extension requests (§25) ──

  /// <summary><c>tasks/get</c> — retrieve a task's current state (§25.7).</summary>
  public const string TasksGet = "tasks/get";

  /// <summary><c>tasks/update</c> — supply input to a task (§25.8).</summary>
  public const string TasksUpdate = "tasks/update";

  /// <summary><c>tasks/cancel</c> — cancel a task (§25.9).</summary>
  public const string TasksCancel = "tasks/cancel";

  // ── UI extension handshake (UI ↔ host, §26) ──

  /// <summary>
  /// <c>ui/initialize</c> — the UI-to-host initialization request that begins the §26 handshake
  /// (Appendix A). In scope only while the Interactive User-Interface extension is active.
  /// </summary>
  public const string UiInitialize = "ui/initialize";

  /// <summary>
  /// <c>ui/notifications/initialized</c> — the UI-to-host notification completing the §26 handshake
  /// (Appendix A). In scope only while the Interactive User-Interface extension is active.
  /// </summary>
  public const string UiNotificationsInitialized = "ui/notifications/initialized";

  // ── Input-request kinds (server → client, via input_required result, §11) ──

  /// <summary><c>elicitation/create</c> — request user input (§20).</summary>
  public const string ElicitationCreate = "elicitation/create";

  /// <summary><c>sampling/createMessage</c> — request a model completion; Deprecated (§21).</summary>
  public const string SamplingCreateMessage = "sampling/createMessage";

  /// <summary><c>roots/list</c> — request the client's filesystem roots; Deprecated (§21).</summary>
  public const string RootsList = "roots/list";

  // ── Notifications ──

  /// <summary><c>notifications/progress</c> — progress on a long-running request (§15.1).</summary>
  public const string NotificationsProgress = "notifications/progress";

  /// <summary><c>notifications/cancelled</c> — cancellation of a previously issued request (§15.2).</summary>
  public const string NotificationsCancelled = "notifications/cancelled";

  /// <summary><c>notifications/message</c> — a log message; Deprecated (§15.3).</summary>
  public const string NotificationsMessage = "notifications/message";

  /// <summary><c>notifications/tools/list_changed</c> — the tool list changed (§16.8).</summary>
  public const string NotificationsToolsListChanged = "notifications/tools/list_changed";

  /// <summary><c>notifications/prompts/list_changed</c> — the prompt list changed (§18.6).</summary>
  public const string NotificationsPromptsListChanged = "notifications/prompts/list_changed";

  /// <summary><c>notifications/resources/list_changed</c> — the resource list changed (§17.7).</summary>
  public const string NotificationsResourcesListChanged = "notifications/resources/list_changed";

  /// <summary><c>notifications/resources/updated</c> — a subscribed resource was updated (§17.7).</summary>
  public const string NotificationsResourcesUpdated = "notifications/resources/updated";

  /// <summary><c>notifications/subscriptions/acknowledged</c> — a subscription was established (§10.3).</summary>
  public const string NotificationsSubscriptionsAcknowledged = "notifications/subscriptions/acknowledged";

  /// <summary><c>notifications/elicitation/complete</c> — an out-of-band elicitation finished (§20).</summary>
  public const string NotificationsElicitationComplete = "notifications/elicitation/complete";

  /// <summary><c>notifications/tasks</c> — a task's status changed (§25.10).</summary>
  public const string NotificationsTasks = "notifications/tasks";
}
