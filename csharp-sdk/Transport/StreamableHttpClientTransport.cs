using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Transport.Http;

namespace Stackific.Mcp.Transport;

/// <summary>
/// The client-side Streamable HTTP transport (spec §9): each request or notification is its own HTTP
/// POST to the MCP endpoint, carrying the required headers (§9.3) and routing headers (§9.4). A request
/// response is read as either a single JSON object (§9.6.1) or a server-sent event stream that delivers
/// request-scoped notifications before the final response (§9.6.2). An optional token provider supplies
/// the bearer credential for authorized resources (§23).
/// </summary>
public sealed class StreamableHttpClientTransport : ClientTransport
{
  private readonly Uri _endpoint;
  private readonly HttpClient _httpClient;
  private readonly bool _ownsHttpClient;
  private readonly Func<CancellationToken, Task<string?>>? _tokenProvider;
  private readonly Func<string, JsonNode?>? _learnedToolSchema;

  /// <summary>Creates a transport targeting <paramref name="endpoint"/>.</summary>
  /// <param name="endpoint">The MCP endpoint URL (for example <c>http://localhost:8201/mcp</c>).</param>
  /// <param name="httpClient">An optional shared <see cref="HttpClient"/>; one is created and owned if omitted.</param>
  /// <param name="tokenProvider">An optional async provider of the bearer token to attach (§23).</param>
  /// <param name="learnedToolSchema">
  /// An optional resolver from a tool name to its learned <c>inputSchema</c> (typically populated from a
  /// prior <c>tools/list</c>). When supplied, the transport emits the <c>Mcp-Param-*</c> headers a
  /// <c>tools/call</c>'s <c>x-mcp-header</c> annotations require (§9.5.2), encoded per §9.5.3. When
  /// <c>null</c> (the default), no custom <c>Mcp-Param-*</c> headers are emitted (the stale/absent-schema
  /// strategy, R-9.5.2-l). The per-call learning that feeds this resolver is a client-runtime concern
  /// (Phase 5) and is intentionally left as a seam.
  /// </param>
  public StreamableHttpClientTransport(
    Uri endpoint,
    HttpClient? httpClient = null,
    Func<CancellationToken, Task<string?>>? tokenProvider = null,
    Func<string, JsonNode?>? learnedToolSchema = null)
  {
    _endpoint = endpoint;
    _httpClient = httpClient ?? new HttpClient();
    _ownsHttpClient = httpClient is null;
    _tokenProvider = tokenProvider;
    _learnedToolSchema = learnedToolSchema;
  }

  /// <inheritdoc/>
  public override async Task<JsonRpcMessage> SendRequestAsync(JsonRpcRequest request, RequestOptions options)
  {
    TapSend(request);
    using var httpRequest = BuildHttpRequest(request);
    await AttachAuthorizationAsync(httpRequest, options.CancellationToken).ConfigureAwait(false);

    using var response = await _httpClient
      .SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, options.CancellationToken)
      .ConfigureAwait(false);

    var mediaType = response.Content.Headers.ContentType?.MediaType;
    if (string.Equals(mediaType, "text/event-stream", StringComparison.OrdinalIgnoreCase))
    {
      return await ReadEventStreamAsync(response, options).ConfigureAwait(false);
    }

    var text = await response.Content.ReadAsStringAsync(options.CancellationToken).ConfigureAwait(false);
    var message = JsonRpcMessageSerializer.Parse(text);
    TapReceive(message);
    return message;
  }

  /// <inheritdoc/>
  public override async Task SendNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken = default)
  {
    TapSend(notification);
    using var httpRequest = BuildHttpRequest(notification, notification.Method, notification.Params);
    await AttachAuthorizationAsync(httpRequest, cancellationToken).ConfigureAwait(false);
    using var response = await _httpClient.SendAsync(httpRequest, cancellationToken).ConfigureAwait(false);
    // §9.2: a server accepts a notification with 202 and no body; other statuses are tolerated silently.
  }

  /// <inheritdoc/>
  public override async Task<SubscriptionHandle> OpenSubscriptionAsync(
    JsonRpcRequest listenRequest,
    Action<JsonRpcNotification> onNotification,
    CancellationToken cancellationToken = default)
  {
    TapSend(listenRequest);
    var httpRequest = BuildHttpRequest(listenRequest);
    await AttachAuthorizationAsync(httpRequest, cancellationToken).ConfigureAwait(false);

    var response = await _httpClient
      .SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
      .ConfigureAwait(false);
    var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
    var reader = new StreamReader(stream, Encoding.UTF8);
    var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

    // §10.3: the first event MUST be the acknowledgement, carrying the honored filter.
    if (await ReadEventAsync(reader, cancellationToken).ConfigureAwait(false) is not JsonRpcNotification ack)
    {
      cts.Dispose();
      reader.Dispose();
      response.Dispose();
      throw McpError.InternalError("Subscription stream did not begin with an acknowledgement (§10.3).");
    }
    TapReceive(ack);
    var honored = ack.Params?["notifications"]?.Deserialize<SubscriptionFilter>(McpJson.Options) ?? new SubscriptionFilter();

    // Background-read subsequent change notifications until unsubscribed or disconnected (§10.7).
    _ = Task.Run(async () =>
    {
      try
      {
        while (!cts.IsCancellationRequested)
        {
          if (await ReadEventAsync(reader, cts.Token).ConfigureAwait(false) is not { } message) break;
          if (message is JsonRpcNotification notification)
          {
            TapReceive(notification);
            onNotification(notification);
          }
        }
      }
      catch (OperationCanceledException) { /* unsubscribed/disconnected */ }
      catch (Exception error) { OnReceive?.Invoke(new System.Text.Json.Nodes.JsonObject { ["error"] = error.Message }); }
      finally { reader.Dispose(); response.Dispose(); cts.Dispose(); }
    }, cts.Token);

    return new SubscriptionHandle
    {
      HonoredFilter = honored,
      Unsubscribe = () => { cts.Cancel(); return ValueTask.CompletedTask; },
    };
  }

  /// <inheritdoc/>
  public override ValueTask DisposeAsync()
  {
    if (_ownsHttpClient) _httpClient.Dispose();
    return ValueTask.CompletedTask;
  }

  /// <summary>Reads one SSE event (its <c>data:</c> payload) and parses it as a JSON-RPC message; returns <c>null</c> at end of stream.</summary>
  private static async Task<JsonRpcMessage?> ReadEventAsync(StreamReader reader, CancellationToken cancellationToken)
  {
    var dataBuilder = new StringBuilder();
    while (true)
    {
      var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
      if (line is null)
      {
        if (dataBuilder.Length == 0) return null;
        break;
      }
      if (line.Length == 0)
      {
        if (dataBuilder.Length == 0) continue;
        break;
      }
      if (line.StartsWith("data:", StringComparison.Ordinal))
      {
        var value = line.Length > 5 && line[5] == ' ' ? line[6..] : line[5..];
        if (dataBuilder.Length > 0) dataBuilder.Append('\n');
        dataBuilder.Append(value);
      }
    }
    return JsonRpcMessageSerializer.Parse(dataBuilder.ToString());
  }

  private HttpRequestMessage BuildHttpRequest(JsonRpcRequest request) =>
    BuildHttpRequest(request, request.Method, request.Params);

  private HttpRequestMessage BuildHttpRequest(JsonRpcMessage message, string method, JsonObject? prms)
  {
    var httpRequest = new HttpRequestMessage(HttpMethod.Post, _endpoint)
    {
      Content = new StringContent(JsonRpcMessageSerializer.Serialize(message), Encoding.UTF8, "application/json"),
    };
    httpRequest.Headers.Accept.ParseAdd("application/json");
    httpRequest.Headers.Accept.ParseAdd("text/event-stream");

    var version = prms?["_meta"]?[MetaKeys.ProtocolVersion]?.GetValue<string>() ?? ProtocolRevision.Current;
    httpRequest.Headers.TryAddWithoutValidation("MCP-Protocol-Version", version);
    httpRequest.Headers.TryAddWithoutValidation("Mcp-Method", method);

    // §9.4.2: mirror the primary target name into Mcp-Name for the methods that define one.
    var name = method switch
    {
      McpMethods.ToolsCall or McpMethods.PromptsGet => prms?["name"]?.GetValue<string>(),
      McpMethods.ResourcesRead => prms?["uri"]?.GetValue<string>(),
      _ => null,
    };
    if (name is not null) httpRequest.Headers.TryAddWithoutValidation("Mcp-Name", name);

    // §9.5.2: for a tools/call against a tool whose schema carries x-mcp-header annotations, emit one
    // encoded Mcp-Param-* header per present, non-null annotated parameter. Absent a learned schema, no
    // custom param headers are emitted (R-9.5.2-l).
    AttachParamHeaders(httpRequest, method, prms);

    return httpRequest;
  }

  /// <summary>
  /// Attaches the <c>Mcp-Param-*</c> headers a <c>tools/call</c> requires from its tool's learned
  /// <c>inputSchema</c> and the call <c>arguments</c> (§9.5.2). This is the client EMISSION primitive;
  /// it is a no-op when no learned-schema resolver was supplied or the tool is unknown.
  /// </summary>
  private void AttachParamHeaders(HttpRequestMessage httpRequest, string method, JsonObject? prms)
  {
    if (method != McpMethods.ToolsCall || _learnedToolSchema is null)
    {
      return;
    }
    var toolName = prms?["name"]?.GetValue<string>();
    if (toolName is null || _learnedToolSchema(toolName) is not { } inputSchema)
    {
      return;
    }
    var arguments = prms?["arguments"] as JsonObject;
    foreach (var (headerName, headerValue) in ParamHeaders.BuildParamHeaders(inputSchema, arguments))
    {
      httpRequest.Headers.TryAddWithoutValidation(headerName, headerValue);
    }
  }

  private async Task AttachAuthorizationAsync(HttpRequestMessage httpRequest, CancellationToken cancellationToken)
  {
    if (_tokenProvider is null) return;
    var token = await _tokenProvider(cancellationToken).ConfigureAwait(false);
    if (!string.IsNullOrEmpty(token))
    {
      httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }
  }

  private async Task<JsonRpcMessage> ReadEventStreamAsync(HttpResponseMessage response, RequestOptions options)
  {
    await using var stream = await response.Content.ReadAsStreamAsync(options.CancellationToken).ConfigureAwait(false);
    using var reader = new StreamReader(stream, Encoding.UTF8);

    var dataBuilder = new StringBuilder();
    while (true)
    {
      var line = await reader.ReadLineAsync(options.CancellationToken).ConfigureAwait(false);
      if (line is null)
      {
        // Stream ended without a final response.
        throw McpError.InternalError("The event stream closed before delivering a final response.");
      }

      if (line.Length == 0)
      {
        // End of one SSE event: parse the accumulated data payload, if any.
        if (dataBuilder.Length == 0) continue;
        var payload = dataBuilder.ToString();
        dataBuilder.Clear();

        var message = JsonRpcMessageSerializer.Parse(payload);
        TapReceive(message);
        switch (message)
        {
          case JsonRpcNotification notification:
            options.OnNotification?.Invoke(notification);
            break;
          case JsonRpcSuccessResponse:
          case JsonRpcErrorResponse:
            return message; // §9.6.2: the final response terminates the stream.
        }
        continue;
      }

      if (line.StartsWith("data:", StringComparison.Ordinal))
      {
        // An SSE "data:" field; trim a single leading space per the SSE format.
        var value = line.Length > 5 && line[5] == ' ' ? line[6..] : line[5..];
        if (dataBuilder.Length > 0) dataBuilder.Append('\n');
        dataBuilder.Append(value);
      }
      // Other SSE fields (event:, id:, :comment) are ignored for this transport.
    }
  }
}
