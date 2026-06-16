using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport.Http;

namespace Stackific.Mcp.Transport;

/// <summary>
/// The result of an authorization gate (spec §23): either an authorized identity, or a challenge to
/// return to the client (an HTTP status and a <c>WWW-Authenticate</c> header).
/// </summary>
/// <param name="Authorized">Whether the request is authorized.</param>
/// <param name="Identity">The validated identity when <paramref name="Authorized"/> is true.</param>
/// <param name="ChallengeStatus">The HTTP status to return when not authorized (for example 401).</param>
/// <param name="WwwAuthenticate">The <c>WWW-Authenticate</c> header value to return when not authorized.</param>
public sealed record AuthGateResult(bool Authorized, AuthInfo? Identity, int ChallengeStatus = 401, string? WwwAuthenticate = null);

/// <summary>
/// A pluggable authorization gate the Streamable HTTP adapter consults before dispatching a request
/// (spec §23). An unauthenticated request is answered with a 401 challenge carrying
/// <c>WWW-Authenticate</c>; an authenticated request yields the validated <see cref="AuthInfo"/>.
/// </summary>
public interface IMcpAuthGate
{
  /// <summary>Authorizes an incoming HTTP request.</summary>
  /// <param name="context">The HTTP context.</param>
  /// <returns>The gate result (authorized identity or a challenge).</returns>
  Task<AuthGateResult> AuthorizeAsync(HttpContext context);
}

/// <summary>
/// Configures the Streamable HTTP adapter's transport hardening (spec §9.3, §9.5, §9.9, §9.11). All
/// members are optional; the defaults preserve the adapter's pre-hardening behaviour except for the
/// security checks the spec mandates (Origin validation, Content-Type/Accept validation), which are
/// loopback-safe by default.
/// </summary>
public sealed record StreamableHttpServerOptions
{
  /// <summary>
  /// The exact <c>Origin</c> values the server accepts (DNS-rebinding defense, §9.11). When <c>null</c>
  /// (the default), the server accepts any request whose <c>Origin</c> is loopback-origin-shaped (a
  /// <c>http(s)://localhost</c> / <c>127.0.0.1</c> / <c>[::1]</c> origin, any port) and rejects every
  /// other present <c>Origin</c> with a <c>403</c>. An empty set rejects every present <c>Origin</c>.
  /// A request with no <c>Origin</c> header always passes (non-browser clients). (R-9.11-a, R-9.11-b)
  /// </summary>
  public IReadOnlySet<string>? AllowedOrigins { get; init; }

  /// <summary>
  /// When <c>true</c>, the <c>403</c> for a rejected <c>Origin</c> carries an id-less JSON-RPC error body;
  /// when <c>false</c> the body is omitted entirely (a bare <c>403</c>). Defaults to <c>true</c>.
  /// The body, when present, MUST carry no <c>id</c>. (R-9.11-c, R-9.7-a)
  /// </summary>
  public bool IncludeForbiddenOriginBody { get; init; } = true;

  /// <summary>
  /// When <c>true</c>, a POST that omits the <c>MCP-Protocol-Version</c> header is treated as
  /// <see cref="EarliestRevision"/> rather than rejected, supporting clients that predate the header
  /// (R-9.3.3-c). Defaults to <c>false</c> (an absent header is a <c>-32001</c> mismatch).
  /// </summary>
  public bool SupportsPreHeaderClients { get; init; }

  /// <summary>The revision assumed for a header-less request when <see cref="SupportsPreHeaderClients"/> is set.</summary>
  public string? EarliestRevision { get; init; }

  /// <summary>
  /// Resolves a tool's <c>inputSchema</c> by tool name so the adapter can validate the request's
  /// <c>Mcp-Param-*</c> headers against the body (§9.5.4). When <c>null</c> (the default), no
  /// <c>Mcp-Param-*</c> receiver validation is performed — an unrecognized <c>Mcp-Param-*</c> header is
  /// then simply ignored, exactly as before. Returns <c>null</c> for an unknown tool.
  /// </summary>
  public Func<string, JsonNode?>? ToolInputSchema { get; init; }
}

/// <summary>
/// The server-side Streamable HTTP adapter (spec §9): it parses an HTTP POST into a JSON-RPC message,
/// validates the required request and routing headers (§9.3/§9.4), runs an optional authorization gate
/// (§23), dispatches to an <see cref="IMcpRequestHandler"/>, and writes back either a single JSON
/// response (§9.6.1) or a server-sent event stream that carries request-scoped notifications before the
/// final response (§9.6.2). It is stateless and never mints a session id (§9.9).
/// </summary>
public static class StreamableHttpServer
{
  /// <summary>Required <c>Content-Type</c> media type for a POST body. (R-9.3.1-a)</summary>
  private const string ContentTypeJson = "application/json";

  /// <summary>The two media types a client's <c>Accept</c> MUST list. (R-9.3.2-b)</summary>
  private static readonly string[] AcceptMediaTypes = ["application/json", "text/event-stream"];

  /// <summary>Header names that carry a session identifier this stateless transport MUST ignore. (R-9.9-b/c/d)</summary>
  private static readonly string[] SessionIdHeaderNames = ["mcp-session-id", "x-session-id", "session-id"];

  /// <summary>The (ignored) SSE resumption header; streams are never resumable. (R-9.6.2-h, R-9.9-g)</summary>
  private const string LastEventIdHeader = "Last-Event-ID";

  /// <summary>The SSE event name that, as the first event of a legacy <c>GET</c> stream, marks the deprecated HTTP+SSE transport. (R-9.12-h)</summary>
  public const string LegacyEndpointEvent = "endpoint";

  /// <summary>The loopback interface a locally-run server SHOULD bind to. (R-9.11-d)</summary>
  public const string LoopbackBindAddress = "127.0.0.1";
  /// <summary>Maps the MCP endpoint at <paramref name="pattern"/> onto <paramref name="handler"/>.</summary>
  /// <param name="endpoints">The endpoint route builder.</param>
  /// <param name="pattern">The route pattern (for example <c>/mcp</c>).</param>
  /// <param name="handler">The request handler (an <c>McpServer</c>).</param>
  /// <param name="authGate">An optional authorization gate (§23).</param>
  /// <param name="options">Optional transport-hardening configuration (§9.3, §9.5, §9.11).</param>
  /// <returns>The endpoint convention builder for further configuration.</returns>
  public static IEndpointConventionBuilder MapMcp(
    this IEndpointRouteBuilder endpoints,
    string pattern,
    IMcpRequestHandler handler,
    IMcpAuthGate? authGate = null,
    StreamableHttpServerOptions? options = null)
  {
    // One correlator per mapped endpoint, captured in the closure: server→client requests issued by any
    // request's handler are matched to the client's later reply POST purely by JSON-RPC id, with no
    // session (§9.9). Mirrors the TS handler's module-scoped RequestCorrelator.
    var liveRequests = new LiveServerRequestRouter();

    // §9.5.4: auto-wire the Mcp-Param-* receiver. When the caller did not supply a tool-schema resolver
    // and the handler is an McpServer, default it to the server's own registry so a tools/call's
    // Mcp-Param-* headers are validated/decoded against the tool's inputSchema (mismatch → -32001).
    if (options?.ToolInputSchema is null && handler is Stackific.Mcp.Server.McpServer server)
    {
      options = (options ?? new StreamableHttpServerOptions()) with { ToolInputSchema = server.GetToolInputSchema };
    }

    // Accept every method so the adapter itself can answer GET/DELETE with 405 (§9.9).
    return endpoints.MapMethods(pattern, ["GET", "POST", "DELETE", "PUT", "PATCH"],
      (HttpContext context) => HandleAsync(context, handler, authGate, options, liveRequests));
  }

  /// <summary>Handles a single HTTP request against <paramref name="handler"/> (spec §9).</summary>
  /// <param name="context">The HTTP context.</param>
  /// <param name="handler">The request handler.</param>
  /// <param name="authGate">An optional authorization gate.</param>
  /// <param name="options">Optional transport-hardening configuration.</param>
  /// <returns>A task that completes when the response has been written.</returns>
  public static Task HandleAsync(
    HttpContext context,
    IMcpRequestHandler handler,
    IMcpAuthGate? authGate = null,
    StreamableHttpServerOptions? options = null) =>
    HandleAsync(context, handler, authGate, options, new LiveServerRequestRouter());

  /// <summary>
  /// Handles a single HTTP request against <paramref name="handler"/>, routing live server-to-client
  /// request replies through the supplied <paramref name="liveRequests"/> router (spec §9). The router
  /// is shared across all requests to one mapped endpoint so a client's reply POST correlates to the
  /// awaiting server-to-client request by id (§9.9).
  /// </summary>
  /// <param name="context">The HTTP context.</param>
  /// <param name="handler">The request handler.</param>
  /// <param name="authGate">An optional authorization gate.</param>
  /// <param name="options">Optional transport-hardening configuration.</param>
  /// <param name="liveRequests">The per-endpoint live-request correlation router.</param>
  /// <returns>A task that completes when the response has been written.</returns>
  private static async Task HandleAsync(
    HttpContext context,
    IMcpRequestHandler handler,
    IMcpAuthGate? authGate,
    StreamableHttpServerOptions? options,
    LiveServerRequestRouter liveRequests)
  {
    options ??= new StreamableHttpServerOptions();
    var request = context.Request;
    if (!HttpMethods.IsPost(request.Method))
    {
      // §9.9: a Streamable-HTTP-only server answers GET/DELETE at the endpoint with 405.
      context.Response.StatusCode = StatusCodes.Status405MethodNotAllowed;
      return;
    }

    // §9.11: validate Origin BEFORE doing any work, defending against DNS rebinding. A rejected Origin
    // is answered with 403 and an id-less body (or no body) — the request id is never echoed.
    var origin = request.Headers.Origin.ToString();
    if (!string.IsNullOrEmpty(origin) && !OriginAccepted(origin, options.AllowedOrigins))
    {
      await WriteForbiddenOriginAsync(context, options).ConfigureAwait(false);
      return;
    }

    string body;
    using (var reader = new StreamReader(request.Body, Encoding.UTF8))
    {
      body = await reader.ReadToEndAsync(context.RequestAborted).ConfigureAwait(false);
    }

    JsonRpcMessage message;
    try
    {
      message = JsonRpcMessageSerializer.Parse(body);
    }
    catch (McpError error)
    {
      await WriteSingleErrorAsync(context, null, error).ConfigureAwait(false);
      return;
    }

    switch (message)
    {
      case JsonRpcNotification notification:
        await handler.HandleNotificationAsync(notification, context.RequestAborted).ConfigureAwait(false);
        context.Response.StatusCode = StatusCodes.Status202Accepted;
        return;

      case JsonRpcRequest jsonRpcRequest:
        await HandleRequestAsync(context, handler, authGate, jsonRpcRequest, options, liveRequests).ConfigureAwait(false);
        return;

      // §9.9: a client reply (result/error) to a LIVE server→client request — deliver it to the awaiting
      // correlator and acknowledge with 202. Only when there is an outstanding request with that id; an
      // uncorrelated response is the forbidden case (a client MUST NOT send unsolicited responses).
      case JsonRpcSuccessResponse or JsonRpcErrorResponse when liveRequests.Deliver(message):
        context.Response.StatusCode = StatusCodes.Status202Accepted;
        return;

      default:
        await WriteSingleErrorAsync(context, null, McpError.InvalidRequest("A client MUST NOT send a JSON-RPC response to the server.")).ConfigureAwait(false);
        return;
    }
  }

  private static async Task HandleRequestAsync(
    HttpContext context, IMcpRequestHandler handler, IMcpAuthGate? authGate, JsonRpcRequest request,
    StreamableHttpServerOptions options, LiveServerRequestRouter liveRequests)
  {
    if (ValidateHeaders(context, request, options) is { } headerError)
    {
      await WriteSingleErrorAsync(context, request.Id, headerError).ConfigureAwait(false);
      return;
    }

    AuthInfo? authInfo = null;
    if (authGate is not null)
    {
      var gate = await authGate.AuthorizeAsync(context).ConfigureAwait(false);
      if (!gate.Authorized)
      {
        context.Response.StatusCode = gate.ChallengeStatus;
        if (gate.WwwAuthenticate is not null) context.Response.Headers.WWWAuthenticate = gate.WwwAuthenticate;
        return;
      }
      authInfo = gate.Identity;
    }

    // §10: a subscriptions/listen request opens a long-lived stream rather than producing one response.
    if (request.Method == McpMethods.SubscriptionsListen
      && handler is IMcpSubscriptionHandler subscriptionHandler
      && subscriptionHandler.SupportsSubscriptions)
    {
      await HandleSubscriptionAsync(context, subscriptionHandler, request).ConfigureAwait(false);
      return;
    }

    // §9.2: initialize is special-cased — the handshake NEVER streams and carries no session. It is
    // answered as a single application/json response (a server→client request or notification mid-
    // initialize is not available, mirroring the TS bareContext path).
    if (request.Method == McpMethods.Initialize)
    {
      var initResponse = await handler
        .HandleRequestAsync(request, NonStreamingNotifier.Instance, authInfo, context.RequestAborted)
        .ConfigureAwait(false);
      await WriteSingleResponseAsync(context, initResponse).ConfigureAwait(false);
      return;
    }

    // §9.6: a caller-supplied progress token commits to an event stream up front, so progress is
    // delivered live even when the handler emits nothing else (the C# wire contract, slightly stricter
    // than the TS race; documented on WriteEventStreamAsync). The token also enables live server→client
    // requests on that pre-committed stream.
    if (request.Params?["_meta"]?[MetaKeys.ProgressToken] is not null)
    {
      await WriteEventStreamAsync(context, handler, request, authInfo, liveRequests).ConfigureAwait(false);
      return;
    }

    // §9.6/§9.7 lazy-commit RACE (the TS Promise.race over a commit channel): run the handler with a
    // notifier that funnels every emit (notification OR live server→client request) into a Channel. Race
    // the FIRST emit against handler completion — whoever wins decides the shape:
    //   • handler finishes with NO emit   → a single JSON response with the §9.7-mapped status.
    //   • an emit arrives first           → commit to SSE (status fixed at 200), flush the queued frame(s),
    //                                        then drain the channel until the handler's final response.
    await RunLazyCommitAsync(context, handler, request, authInfo, liveRequests).ConfigureAwait(false);
  }

  /// <summary>
  /// Runs the handler under the §9.6/§9.7 lazy-commit race: the response shape (single JSON vs SSE) is
  /// decided by whether the handler emits anything (a notification or a live server→client request)
  /// before it completes, NOT by pre-inspecting the request. Mirrors the TS <c>Promise.race</c> over a
  /// commit channel. A live server→client request blocks the handler until the client's reply POST is
  /// correlated through <paramref name="liveRequests"/>, so the SSE stream stays open across the round trip.
  /// </summary>
  /// <param name="context">The HTTP context.</param>
  /// <param name="handler">The request handler.</param>
  /// <param name="request">The client request.</param>
  /// <param name="authInfo">The validated identity, if any.</param>
  /// <param name="liveRequests">The per-endpoint live-request correlation router.</param>
  /// <returns>A task that completes when the response (single or streamed) has been written.</returns>
  private static async Task RunLazyCommitAsync(
    HttpContext context, IMcpRequestHandler handler, JsonRpcRequest request, AuthInfo? authInfo, LiveServerRequestRouter liveRequests)
  {
    var emits = Channel.CreateUnbounded<JsonRpcMessage>(new UnboundedChannelOptions { SingleReader = true });
    var firstEmit = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var notifier = new LazyCommitNotifier(emits.Writer, firstEmit, liveRequests, request.Id);

    var dispatch = handler.HandleRequestAsync(request, notifier, authInfo, context.RequestAborted);

    // Whoever signals first wins the race: the first emitted frame, or handler completion.
    var committedFirst = await Task.WhenAny(firstEmit.Task, dispatch).ConfigureAwait(false) == firstEmit.Task;

    if (!committedFirst && dispatch.IsCompleted)
    {
      // The handler finished without ever emitting: single JSON response with the §9.7-mapped status.
      // (If it both completed AND emitted in the same tick, firstEmit also fired; committedFirst above
      // resolves the ambiguity toward whichever Task WhenAny observed — re-check the emit signal.)
      if (!firstEmit.Task.IsCompleted)
      {
        notifier.Seal();
        var single = await dispatch.ConfigureAwait(false);
        await WriteSingleResponseAsync(context, single).ConfigureAwait(false);
        return;
      }
    }

    // Committed to streaming: open the SSE response, flush queued frames, then drain emits until the
    // handler's final response, which terminates the stream (§9.6.2).
    PrepareEventStream(context);

    // Drain any frames already queued (the one that won the race, plus any racing close-behind).
    while (emits.Reader.TryRead(out var queued))
    {
      await WriteEventAsync(context, queued).ConfigureAwait(false);
    }

    JsonRpcMessage finalResponse;
    try
    {
      // Keep flushing emits the handler produces while it runs, until it completes. WaitToReadAsync is
      // NOT bound to RequestAborted: the loop is bounded by dispatch completion (and Seal(), which
      // completes the channel) so it cannot wait forever, and an unbound wait never faults — leaving no
      // dangling/unobserved cancellation task when dispatch wins the race. Client-abort is surfaced
      // instead by the awaited dispatch / WriteEventAsync throwing OperationCanceledException below.
      while (!dispatch.IsCompleted)
      {
        var ready = await Task.WhenAny(dispatch, emits.Reader.WaitToReadAsync().AsTask()).ConfigureAwait(false);
        while (emits.Reader.TryRead(out var frame))
        {
          await WriteEventAsync(context, frame).ConfigureAwait(false);
        }
        if (ready == dispatch) break;
      }
      finalResponse = await dispatch.ConfigureAwait(false);
      // Flush any trailing frames emitted between the last drain and completion.
      while (emits.Reader.TryRead(out var frame))
      {
        await WriteEventAsync(context, frame).ConfigureAwait(false);
      }
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
      // The client closed the stream — cancel any awaiting live request and stop (§9.6.2). Nothing more
      // may be written to the aborted response.
      notifier.Seal();
      liveRequests.FailInflightFor(request.Id);
      return;
    }

    notifier.Seal();
    await WriteEventAsync(context, finalResponse).ConfigureAwait(false);
  }

  private static McpError? ValidateHeaders(HttpContext context, JsonRpcRequest request, StreamableHttpServerOptions options)
  {
    var headers = context.Request.Headers;

    // §9.3.1: Content-Type MUST be application/json (a "; charset=…" parameter is tolerated).
    var contentType = headers.ContentType.ToString();
    var mediaType = contentType.Split(';', 2)[0].Trim();
    if (!string.Equals(mediaType, ContentTypeJson, StringComparison.OrdinalIgnoreCase))
    {
      return McpError.HeaderMismatch($"Content-Type must be {ContentTypeJson} (§9.3.1).");
    }

    // §9.3.2: Accept MUST list both application/json and text/event-stream.
    var accept = headers.Accept.ToString().ToLowerInvariant();
    var listed = accept.Split(',').Select(part => part.Split(';', 2)[0].Trim()).ToHashSet(StringComparer.Ordinal);
    if (!AcceptMediaTypes.All(listed.Contains))
    {
      return McpError.HeaderMismatch("Accept must list application/json and text/event-stream (§9.3.2).");
    }

    // §9.3.3: the MCP-Protocol-Version header gate.
    var declaredVersion = request.Params?["_meta"]?[MetaKeys.ProtocolVersion]?.GetValue<string>();
    var headerVersion = headers["MCP-Protocol-Version"].ToString();
    if (string.IsNullOrEmpty(headerVersion))
    {
      // R-9.3.3-c: a header-less request MAY be treated as the earliest pre-header revision.
      if (!(options.SupportsPreHeaderClients && options.EarliestRevision is not null))
      {
        return McpError.HeaderMismatch("Missing required MCP-Protocol-Version header (§9.3.3).");
      }
    }
    else
    {
      if (declaredVersion is not null && headerVersion != declaredVersion)
      {
        return McpError.HeaderMismatch($"MCP-Protocol-Version header '{headerVersion}' does not match the body protocol version '{declaredVersion}' (§9.3.3).");
      }
      // R-9.3.3-e: a header naming a revision the server does not implement is -32004, not -32001.
      if (!ProtocolRevision.IsSupported(headerVersion))
      {
        return McpError.UnsupportedProtocolVersion(ProtocolRevision.Supported, headerVersion);
      }
    }

    var headerMethod = headers["Mcp-Method"].ToString();
    if (string.IsNullOrEmpty(headerMethod))
    {
      return McpError.HeaderMismatch("Missing required Mcp-Method header (§9.4.1).");
    }
    if (headerMethod != request.Method)
    {
      return McpError.HeaderMismatch($"Mcp-Method header '{headerMethod}' does not match the body method '{request.Method}' (§9.4.1).");
    }

    // §9.4.2: Mcp-Name is REQUIRED on tools/call, prompts/get, and resources/read.
    var expectedName = request.Method switch
    {
      McpMethods.ToolsCall or McpMethods.PromptsGet => request.Params?["name"]?.GetValue<string>(),
      McpMethods.ResourcesRead => request.Params?["uri"]?.GetValue<string>(),
      _ => null,
    };
    var hasName = headers.TryGetValue("Mcp-Name", out var nameValues);
    var headerName = nameValues.ToString();
    if (expectedName is not null)
    {
      if (string.IsNullOrEmpty(headerName))
      {
        return McpError.HeaderMismatch($"Missing required Mcp-Name header for {request.Method} (§9.4.2).");
      }
      if (headerName != expectedName)
      {
        return McpError.HeaderMismatch($"Mcp-Name header '{headerName}' does not match the body value '{expectedName}' (§9.4.2).");
      }
    }
    else if (hasName && !string.IsNullOrEmpty(headerName))
    {
      // R-9.4.2-e: Mcp-Name MUST NOT be sent for a method that defines no targeted name/URI.
      return McpError.HeaderMismatch($"Mcp-Name MUST NOT be sent for {request.Method} (§9.4.2).");
    }

    // §9.5.4: validate any Mcp-Param-* headers of a tools/call against the body, when a schema resolver
    // is configured. A recognized header that disagrees with the body (numerically, for integers) or
    // carries impermissible characters is a -32001 mismatch.
    if (request.Method == McpMethods.ToolsCall && options.ToolInputSchema is { } resolveSchema)
    {
      var toolName = request.Params?["name"]?.GetValue<string>();
      if (toolName is not null && resolveSchema(toolName) is { } inputSchema)
      {
        var arguments = request.Params?["arguments"] as JsonObject;
        if (ParamHeaders.ValidateParamHeaders(inputSchema, arguments, name => HeaderOrNull(headers, name)) is { } paramError)
        {
          return paramError;
        }
      }
    }

    return null;
  }

  /// <summary>Returns the value of header <paramref name="name"/> (case-insensitive), or <c>null</c> when absent.</summary>
  private static string? HeaderOrNull(IHeaderDictionary headers, string name) =>
    headers.TryGetValue(name, out var value) ? value.ToString() : null;

  private static async Task WriteSingleResponseAsync(HttpContext context, JsonRpcMessage response)
  {
    context.Response.StatusCode = StatusForResponse(response);
    context.Response.ContentType = "application/json";
    await context.Response.WriteAsync(JsonRpcMessageSerializer.Serialize(response), context.RequestAborted).ConfigureAwait(false);
  }

  private static async Task WriteSingleErrorAsync(HttpContext context, RequestId? id, McpError error)
  {
    var response = new JsonRpcErrorResponse(id, error.ToJsonRpcError());
    await WriteSingleResponseAsync(context, response).ConfigureAwait(false);
  }

  /// <summary>
  /// Serves a request on a PRE-COMMITTED event stream (the progress-token path, §9.6.2). Unlike the
  /// lazy-commit race, the stream is opened before the handler runs, so progress is delivered live even
  /// when the handler emits nothing else. The notifier funnels notifications AND live server→client
  /// requests onto the stream; a live request blocks the handler on the client's correlated reply.
  /// </summary>
  private static async Task WriteEventStreamAsync(
    HttpContext context, IMcpRequestHandler handler, JsonRpcRequest request, AuthInfo? authInfo, LiveServerRequestRouter liveRequests)
  {
    PrepareEventStream(context);
    var notifier = new StreamingNotifier(context, liveRequests, request.Id);
    notifier.MarkCommitted();
    try
    {
      var response = await handler.HandleRequestAsync(request, notifier, authInfo, context.RequestAborted).ConfigureAwait(false);
      // §9.6.2 (R-9.6.2-e/f): the final response terminates the stream; once written, the notifier is
      // sealed so a handler that retained it cannot push anything after the final response.
      await WriteEventAsync(context, response).ConfigureAwait(false);
      notifier.Seal();
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
      // §9.6.2 (R-9.6.2-i/k): the client closed the stream — treat as cancellation. The notifier is
      // sealed so no further request-scoped notification is emitted for the cancelled request, and any
      // awaiting live server→client request is failed so the handler does not hang.
      notifier.Seal();
      liveRequests.FailInflightFor(request.Id);
    }
  }

  private static async Task HandleSubscriptionAsync(HttpContext context, IMcpSubscriptionHandler handler, JsonRpcRequest request)
  {
    var requested = request.Params?["notifications"]?.Deserialize<SubscriptionFilter>(McpJson.Options) ?? new SubscriptionFilter();
    var subscriptionId = request.Id.ToString();
    var channel = Channel.CreateUnbounded<JsonRpcNotification>();

    var (honored, teardown) = handler.OpenSubscription(requested, subscriptionId, notification =>
    {
      channel.Writer.TryWrite(notification);
      return Task.CompletedTask;
    });

    PrepareEventStream(context);

    // §10.3: the first message on the stream MUST be the acknowledgement, carrying the honored filter
    // and the subscription id in _meta (§10.4).
    var ackParams = new JsonObject
    {
      ["_meta"] = new JsonObject { [MetaKeys.SubscriptionId] = subscriptionId },
      ["notifications"] = JsonSerializer.SerializeToNode(honored, McpJson.Options),
    };
    await WriteEventAsync(context, new JsonRpcNotification(McpMethods.NotificationsSubscriptionsAcknowledged, ackParams)).ConfigureAwait(false);

    try
    {
      await foreach (var notification in channel.Reader.ReadAllAsync(context.RequestAborted).ConfigureAwait(false))
      {
        await WriteEventAsync(context, notification).ConfigureAwait(false);
      }
    }
    catch (OperationCanceledException)
    {
      // The client closed the stream (§10.7); fall through to teardown.
    }
    finally
    {
      teardown.Dispose();
    }
  }

  private static void PrepareEventStream(HttpContext context)
  {
    context.Response.StatusCode = StatusCodes.Status200OK;
    context.Response.ContentType = "text/event-stream";
    context.Response.Headers.CacheControl = "no-cache";
    // §9.6.2: ask reverse proxies not to buffer the stream.
    context.Response.Headers["X-Accel-Buffering"] = "no";
  }

  private static async Task WriteEventAsync(HttpContext context, JsonRpcMessage message)
  {
    var data = JsonRpcMessageSerializer.Serialize(message);
    await context.Response.WriteAsync($"data: {data}\n\n", context.RequestAborted).ConfigureAwait(false);
    await context.Response.Body.FlushAsync(context.RequestAborted).ConfigureAwait(false);
  }

  private static int StatusForResponse(JsonRpcMessage response) => response switch
  {
    JsonRpcErrorResponse error => error.Error.Code switch
    {
      ErrorCodes.MethodNotFound => StatusCodes.Status404NotFound,
      ErrorCodes.HeaderMismatch or ErrorCodes.MissingRequiredClientCapability or ErrorCodes.UnsupportedProtocolVersion
        or ErrorCodes.InvalidParams or ErrorCodes.ParseError or ErrorCodes.InvalidRequest => StatusCodes.Status400BadRequest,
      // §9.6.1 permits an error response in the single-JSON 200 shape; used for internal errors.
      _ => StatusCodes.Status200OK,
    },
    _ => StatusCodes.Status200OK,
  };

  /// <summary>
  /// A notifier that funnels every emit (a request-scoped notification OR a live server→client request)
  /// into the lazy-commit <see cref="Channel{T}"/> and signals the first emit so the race in
  /// <see cref="RunLazyCommitAsync"/> can commit to SSE. A live server→client request is issued through
  /// the per-endpoint <see cref="LiveServerRequestRouter"/>: the request frame is enqueued for the stream
  /// and the handler blocks on the correlated client reply (delivered by a separate POST, §9.9).
  /// </summary>
  /// <remarks>
  /// Until the race commits, emits sit in the channel buffer; once committed the reader drains them.
  /// After <see cref="Seal"/> — the final response has been written or the client closed the stream — a
  /// further notification is silently dropped and a further live request fails fast, so the server never
  /// writes after the terminator (R-9.6.2-e/f/i/k).
  /// </remarks>
  private sealed class LazyCommitNotifier(
    ChannelWriter<JsonRpcMessage> writer, TaskCompletionSource firstEmit, LiveServerRequestRouter liveRequests, RequestId originatingId)
    : IServerNotifier
  {
    private volatile bool _sealed;

    public Task NotifyAsync(JsonRpcNotification notification)
    {
      if (_sealed) return Task.CompletedTask;
      writer.TryWrite(notification);
      firstEmit.TrySetResult();
      return Task.CompletedTask;
    }

    public Task<JsonRpcMessage> RequestAsync(string method, JsonObject? parameters, CancellationToken cancellationToken)
    {
      if (_sealed)
      {
        throw new NotSupportedException("The response stream is closed; a live server→client request can no longer be issued.");
      }
      // Issue an id, enqueue the request frame, signal commit, and return the awaiting reply task. The
      // reply arrives on a separate POST and is delivered to the router by id (§9.9).
      var (id, reply) = liveRequests.Issue(originatingId);
      var frame = new JsonRpcRequest(id, method, parameters);
      writer.TryWrite(frame);
      firstEmit.TrySetResult();
      return reply.WaitAsync(cancellationToken);
    }

    /// <summary>Seals the notifier after the final response / client close (R-9.6.2-e/f/i/k).</summary>
    public void Seal()
    {
      _sealed = true;
      writer.TryComplete();
    }
  }

  /// <summary>
  /// Writes each emit straight to a PRE-COMMITTED live event stream (the progress-token path). Like
  /// <see cref="LazyCommitNotifier"/> it supports both notifications and live server→client requests, but
  /// without the commit race — frames go directly to the response. After <see cref="Seal"/> a further
  /// emit is dropped / fails so the server never writes past the terminator (R-9.6.2-e/f/i/k).
  /// </summary>
  private sealed class StreamingNotifier(HttpContext context, LiveServerRequestRouter liveRequests, RequestId originatingId) : IServerNotifier
  {
    private volatile bool _sealed;

    public Task NotifyAsync(JsonRpcNotification notification)
    {
      if (_sealed) return Task.CompletedTask;
      return WriteEventAsync(context, notification);
    }

    public async Task<JsonRpcMessage> RequestAsync(string method, JsonObject? parameters, CancellationToken cancellationToken)
    {
      if (_sealed)
      {
        throw new NotSupportedException("The response stream is closed; a live server→client request can no longer be issued.");
      }
      var (id, reply) = liveRequests.Issue(originatingId);
      await WriteEventAsync(context, new JsonRpcRequest(id, method, parameters)).ConfigureAwait(false);
      return await reply.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>No-op: this stream is committed from the start. Present for symmetry with the lazy notifier.</summary>
    public void MarkCommitted() { }

    /// <summary>Seals the stream after the final response / client close (R-9.6.2-e/f/i/k).</summary>
    public void Seal() => _sealed = true;
  }

  /// <summary>
  /// The notifier used on the §9.2 single-response <c>initialize</c> path: neither a notification nor a
  /// live server→client request is available, because the handshake never streams. Both throw an internal
  /// error, mirroring the TS <c>bareContext</c> behaviour.
  /// </summary>
  private sealed class NonStreamingNotifier : IServerNotifier
  {
    public static NonStreamingNotifier Instance { get; } = new();

    public Task NotifyAsync(JsonRpcNotification notification) =>
      throw McpError.InternalError("Notifications are not available on the single-response initialize path.");

    public Task<JsonRpcMessage> RequestAsync(string method, JsonObject? parameters, CancellationToken cancellationToken) =>
      throw McpError.InternalError("Server→client requests are not available on the single-response initialize path.");
  }

  /// <summary>
  /// Per-endpoint router that correlates a LIVE server→client request to the client's later reply POST by
  /// JSON-RPC id, with NO session (spec §9.9, §7.2). It mints unique server-request ids (the TS
  /// <c>srv-N</c> scheme), tracks which originating request each belongs to (so a client close can fail
  /// the right awaiting requests), and wraps the SDK's <see cref="RequestCorrelator"/>. Safe for
  /// concurrent use across simultaneous requests to the same endpoint.
  /// </summary>
  private sealed class LiveServerRequestRouter
  {
    private readonly RequestCorrelator _correlator = new();
    private readonly System.Collections.Concurrent.ConcurrentDictionary<RequestId, RequestId> _origin = new();
    private long _seq;

    /// <summary>
    /// Issues a fresh server→client request id bound to <paramref name="originatingId"/> and returns the
    /// task that resolves with the client's correlated reply.
    /// </summary>
    /// <param name="originatingId">The client→server request whose handler is issuing this live request.</param>
    /// <returns>The minted request id and the awaiting reply task.</returns>
    public (RequestId Id, Task<JsonRpcMessage> Reply) Issue(RequestId originatingId)
    {
      var id = new RequestId($"srv-{Interlocked.Increment(ref _seq)}");
      var reply = _correlator.Issue(id);
      _origin[id] = originatingId;
      return (id, reply);
    }

    /// <summary>
    /// Delivers a client reply (result/error) to its awaiting server→client request, returning <c>true</c>
    /// when it correlated to an outstanding id (so the transport answers 202) and <c>false</c> for an
    /// uncorrelated response (the forbidden unsolicited-response case).
    /// </summary>
    /// <param name="message">The client's reply message.</param>
    /// <returns><c>true</c> when delivered to an awaiting request.</returns>
    public bool Deliver(JsonRpcMessage message)
    {
      var delivered = _correlator.Deliver(message);
      if (delivered && TryReplyId(message, out var id)) _origin.TryRemove(id, out _);
      return delivered;
    }

    /// <summary>
    /// Fails every outstanding server→client request that belongs to <paramref name="originatingId"/> —
    /// invoked when that request's stream is closed by the client so the handler's await does not hang
    /// forever (§7.5).
    /// </summary>
    /// <param name="originatingId">The originating client→server request id.</param>
    public void FailInflightFor(RequestId originatingId)
    {
      foreach (var (srvId, origin) in _origin)
      {
        if (origin.Equals(originatingId) && _origin.TryRemove(srvId, out _))
        {
          _correlator.Fail(srvId, new TransportError("The client closed the response stream before replying to a live server→client request."));
        }
      }
    }

    private static bool TryReplyId(JsonRpcMessage message, out RequestId id)
    {
      switch (message)
      {
        case JsonRpcSuccessResponse success:
          id = success.Id;
          return true;
        case JsonRpcErrorResponse { Id: { } errorId }:
          id = errorId;
          return true;
        default:
          id = default;
          return false;
      }
    }
  }

  // ─── §9.9 — statelessness helpers ──────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="name"/> is a header this stateless transport MUST ignore:
  /// a session-identifier header (<c>Mcp-Session-Id</c>/<c>X-Session-Id</c>/<c>Session-Id</c>) or the
  /// <c>Last-Event-ID</c> resumption header. (R-9.9-b/c/d/g, R-9.6.2-h) Comparison is case-insensitive.
  /// </summary>
  /// <remarks>
  /// The adapter never reads these headers when processing a request (no session affinity, no
  /// resumption), so an incoming value is effectively ignored. This predicate makes the rule explicit
  /// and testable, and is the basis for any explicit stripping a host wishes to apply.
  /// </remarks>
  /// <param name="name">The header name.</param>
  /// <returns><c>true</c> when the header MUST be ignored.</returns>
  public static bool IsIgnoredStatelessHeader(string name)
  {
    ArgumentNullException.ThrowIfNull(name);
    return SessionIdHeaderNames.Contains(name.ToLowerInvariant())
      || string.Equals(name, LastEventIdHeader, StringComparison.OrdinalIgnoreCase);
  }

  // ─── §9.11 — Origin / DNS-rebinding defense ────────────────────────────────────

  /// <summary>
  /// Decides whether a present <c>Origin</c> is accepted (DNS-rebinding defense, §9.11). When
  /// <paramref name="allowedOrigins"/> is <c>null</c>, only loopback-shaped origins are accepted (the
  /// loopback-safe default for a local server); when it is a set, the match is exact. (R-9.11-a/b)
  /// </summary>
  /// <param name="origin">The request's non-empty <c>Origin</c> header value.</param>
  /// <param name="allowedOrigins">The configured accepted origins, or <c>null</c> for the loopback default.</param>
  /// <returns><c>true</c> when the origin is accepted.</returns>
  public static bool OriginAccepted(string origin, IReadOnlySet<string>? allowedOrigins)
  {
    ArgumentNullException.ThrowIfNull(origin);
    if (allowedOrigins is null)
    {
      return IsLoopbackOrigin(origin);
    }
    return allowedOrigins.Contains(origin);
  }

  /// <summary>Returns <c>true</c> for an <c>http(s)://</c> origin whose host is a loopback address (any port).</summary>
  private static bool IsLoopbackOrigin(string origin)
  {
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
    {
      return false;
    }
    if (uri.Scheme is not ("http" or "https"))
    {
      return false;
    }
    var host = uri.Host;
    return string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)
      || host == "127.0.0.1"
      || host == "::1"
      || host == "[::1]";
  }

  private static async Task WriteForbiddenOriginAsync(HttpContext context, StreamableHttpServerOptions options)
  {
    context.Response.StatusCode = StatusCodes.Status403Forbidden;
    if (!options.IncludeForbiddenOriginBody)
    {
      return; // a bare 403 with no body (R-9.7-a, R-9.11-c)
    }
    // The body, when present, MUST carry no id — the request id is never determined for a rejected
    // Origin. (R-9.11-c)
    var body = new JsonObject
    {
      ["jsonrpc"] = JsonRpcConstants.Version,
      ["error"] = new JsonObject { ["code"] = ErrorCodes.InvalidRequest, ["message"] = "Origin not permitted" },
    };
    context.Response.ContentType = "application/json";
    await context.Response.WriteAsync(body.ToJsonString(McpJson.Options), context.RequestAborted).ConfigureAwait(false);
  }

  // ─── §9.12 — backward-compatibility fallback (client decision aid) ─────────────

  /// <summary>The decision a dual-revision client makes after a modern POST. (§9.12)</summary>
  public enum PostFallbackAction
  {
    /// <summary>The body is a recognized error of this revision; retry, never fall back. (R-9.12-c/d)</summary>
    Retry,

    /// <summary>A non-failing status with nothing to fall back from. (R-9.12-b)</summary>
    Proceed,

    /// <summary>A failing status with an unrecognized body; probe the legacy HTTP+SSE transport. (R-9.12-e/g)</summary>
    LegacyProbe,
  }

  /// <summary>The outcome of <see cref="InterpretPostForFallback"/>.</summary>
  /// <param name="Action">What the client should do next.</param>
  /// <param name="Supported">The server's supported revisions from <c>error.data.supported</c>, when present (only with <see cref="PostFallbackAction.Retry"/>).</param>
  public sealed record PostFallbackDecision(PostFallbackAction Action, IReadOnlyList<string>? Supported = null);

  /// <summary>
  /// The JSON-RPC error codes a modern server of this revision returns with a <c>400</c> at the transport
  /// boundary — the codes a dual-revision client MUST recognize before deciding to fall back. (§9.12)
  /// </summary>
  private static readonly IReadOnlySet<int> RevisionErrorCodes = new HashSet<int>
  {
    ErrorCodes.HeaderMismatch,
    ErrorCodes.MissingRequiredClientCapability,
    ErrorCodes.UnsupportedProtocolVersion,
    ErrorCodes.ParseError,
    ErrorCodes.InvalidRequest,
    ErrorCodes.MethodNotFound,
    ErrorCodes.InvalidParams,
  };

  /// <summary>
  /// Interprets the outcome of a modern POST for a client that also supports an earlier
  /// <c>initialize</c>-handshake revision. (§9.12)
  /// </summary>
  /// <remarks>
  /// On a <c>400</c>, the client SHOULD inspect the body before falling back, because a modern server
  /// returns <c>400</c> for <c>-32004</c>/<c>-32003</c>/<c>-32001</c>. A recognized revision error means
  /// retry (using <c>error.data.supported</c> when present), never fall back. An empty/unrecognized body
  /// on a <c>400</c>/<c>404</c>/<c>405</c> means the client SHOULD probe for the legacy transport.
  /// </remarks>
  /// <param name="status">The HTTP status the POST returned.</param>
  /// <param name="body">The parsed response body (or <c>null</c> when empty).</param>
  /// <returns>The fallback decision.</returns>
  public static PostFallbackDecision InterpretPostForFallback(int status, JsonNode? body)
  {
    if (body is JsonObject obj
      && obj["error"] is JsonObject error
      && error["code"] is JsonValue codeValue
      && codeValue.GetValueKind() == JsonValueKind.Number
      && codeValue.TryGetValue<int>(out var code)
      && RevisionErrorCodes.Contains(code))
    {
      var supported = error["data"] is JsonObject data && data["supported"] is JsonArray array
        ? array.Select(node => node?.GetValue<string>()).Where(value => value is not null).Select(value => value!).ToArray()
        : null;
      return new PostFallbackDecision(PostFallbackAction.Retry, supported);
    }

    if (status is StatusCodes.Status400BadRequest or StatusCodes.Status404NotFound or StatusCodes.Status405MethodNotAllowed)
    {
      return new PostFallbackDecision(PostFallbackAction.LegacyProbe);
    }
    return new PostFallbackDecision(PostFallbackAction.Proceed);
  }

  /// <summary>
  /// Returns <c>true</c> when the first event of a fallback <c>GET</c> stream is the legacy
  /// <c>endpoint</c> event, marking the deprecated HTTP+SSE transport. (R-9.12-h)
  /// </summary>
  /// <param name="firstEventName">The <c>event:</c> field of the first SSE event, if any.</param>
  /// <returns><c>true</c> when it is the legacy endpoint event.</returns>
  public static bool IsLegacyHttpSseServer(string? firstEventName) => firstEventName == LegacyEndpointEvent;
}
