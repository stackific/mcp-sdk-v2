using System.Net.Http.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

namespace CSharpMcpClient;

/// <summary>
/// Backs the client's <c>sampling/createMessage</c> handler. When a DeepSeek API key is configured it
/// runs the request against DeepSeek's Anthropic-compatible <c>/v1/messages</c> endpoint (the real
/// path); otherwise it returns a deterministic mock so the Sampling page still works before a key is
/// set. The C# counterpart of ts-mcp-client's <c>sampling.ts</c> (which uses the <c>@anthropic-ai/sdk</c>
/// pointed at <c>DEEPSEEK_BASE_URL</c>): same provider, same endpoint contract, same result shape.
/// </summary>
public sealed class SamplingProvider
{
  // The Anthropic Messages API version header the @anthropic-ai/sdk sends by default; DeepSeek's
  // Anthropic-compatible endpoint accepts the same value.
  private const string AnthropicVersion = "2023-06-01";

  private readonly IHttpClientFactory _httpClientFactory;
  private readonly string _apiKey;
  private readonly string _baseUrl;
  private readonly string _model;

  /// <summary>Creates a sampling provider from configuration (typically read from the environment).</summary>
  /// <param name="httpClientFactory">Factory for the outbound HTTP client used to call DeepSeek.</param>
  /// <param name="apiKey">The DeepSeek API key; empty selects the deterministic mock.</param>
  /// <param name="baseUrl">The Anthropic-compatible base URL (for example <c>https://api.deepseek.com/anthropic</c>).</param>
  /// <param name="model">The model id to request (for example <c>deepseek-chat</c>).</param>
  public SamplingProvider(IHttpClientFactory httpClientFactory, string apiKey, string baseUrl, string model)
  {
    _httpClientFactory = httpClientFactory;
    _apiKey = apiKey;
    _baseUrl = baseUrl.TrimEnd('/');
    _model = model;
  }

  /// <summary>Whether a real model is configured (a non-empty API key), versus the mock fallback.</summary>
  public bool HasKey => _apiKey.Length > 0;

  /// <summary>The provider label surfaced on <c>/health</c> and <c>/info</c>.</summary>
  public string Provider => HasKey ? "deepseek (anthropic-compatible)" : "mock";

  /// <summary>The model label surfaced on <c>/info</c> (the mock reports <c>mock-deepseek</c>).</summary>
  public string ModelLabel => HasKey ? _model : "mock-deepseek";

  /// <summary>The configured base URL surfaced on <c>/info</c>.</summary>
  public string BaseUrl => _baseUrl;

  /// <summary>
  /// Produces a sampling result for the given <c>sampling/createMessage</c> parameters. Routes to
  /// DeepSeek when a key is configured, otherwise to the deterministic mock.
  /// </summary>
  /// <param name="parameters">The raw request params (<c>messages</c>, <c>maxTokens</c>, <c>systemPrompt</c>).</param>
  /// <returns>An assistant <see cref="CreateMessageResult"/> the SDK serializes back onto the wire.</returns>
  public Task<CreateMessageResult> SampleAsync(JsonObject? parameters) =>
    HasKey ? SampleWithDeepSeekAsync(parameters) : Task.FromResult(SampleMock(parameters));

  /// <summary>DeepSeek via its Anthropic-compatible endpoint — the real path when a key is set.</summary>
  private async Task<CreateMessageResult> SampleWithDeepSeekAsync(JsonObject? parameters)
  {
    var maxTokens = (int?)(parameters?["maxTokens"]?.GetValue<double>()) ?? 512;
    var systemPrompt = parameters?["systemPrompt"]?.GetValue<string>();

    // Flatten each MCP sampling message's content blocks to plain text, as the TS reference does
    // (DeepSeek's Anthropic-compatible chat endpoint takes a string content per message here).
    var messages = new JsonArray();
    foreach (var message in EnumerateMessages(parameters))
    {
      var role = message["role"]?.GetValue<string>() ?? "user";
      messages.Add(new JsonObject { ["role"] = role, ["content"] = ContentToText(message["content"]) });
    }

    var body = new JsonObject
    {
      ["model"] = _model,
      ["max_tokens"] = maxTokens,
      ["messages"] = messages,
    };
    if (!string.IsNullOrEmpty(systemPrompt)) body["system"] = systemPrompt;

    // The @anthropic-ai/sdk targets `{baseURL}/v1/messages` with x-api-key + anthropic-version.
    using var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/v1/messages")
    {
      Content = JsonContent.Create(body),
    };
    request.Headers.TryAddWithoutValidation("x-api-key", _apiKey);
    request.Headers.TryAddWithoutValidation("anthropic-version", AnthropicVersion);

    var http = _httpClientFactory.CreateClient();
    using var response = await http.SendAsync(request).ConfigureAwait(false);
    response.EnsureSuccessStatusCode();
    var payload = await response.Content.ReadFromJsonAsync<JsonObject>().ConfigureAwait(false)
      ?? throw new InvalidOperationException("DeepSeek returned an empty response.");

    // Concatenate the text blocks of the Anthropic-shaped response.
    var text = string.Concat((payload["content"] as JsonArray ?? [])
      .OfType<JsonObject>()
      .Where(block => block["type"]?.GetValue<string>() == "text")
      .Select(block => block["text"]?.GetValue<string>() ?? string.Empty));

    return new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text(text)],
      Model = payload["model"]?.GetValue<string>() ?? _model,
      StopReason = payload["stop_reason"]?.GetValue<string>() ?? "endTurn",
    };
  }

  /// <summary>A deterministic stand-in so Sampling works before a key is configured.</summary>
  private CreateMessageResult SampleMock(JsonObject? parameters)
  {
    // Echo a clipped gist of the last user message — the same shape as the TS mock.
    var lastUser = EnumerateMessages(parameters)
      .LastOrDefault(message => message["role"]?.GetValue<string>() == "user");
    var said = string.Join(' ', ContentToText(lastUser?["content"]).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    var words = said.Split(' ', StringSplitOptions.RemoveEmptyEntries);
    var gist = string.Join(' ', words.Take(16));
    var ellipsis = words.Length > 16 ? "…" : string.Empty;
    return new CreateMessageResult
    {
      Role = Role.Assistant,
      Content = [SamplingContentBlocks.Text(
        $"(mock model — set DEEPSEEK_API_KEY for a real DeepSeek answer)\nIn short: {gist}{ellipsis}")],
      Model = "mock-deepseek",
      StopReason = "endTurn",
    };
  }

  /// <summary>Yields each message object from the request params (an empty sequence when absent).</summary>
  private static IEnumerable<JsonObject> EnumerateMessages(JsonObject? parameters) =>
    (parameters?["messages"] as JsonArray ?? []).OfType<JsonObject>();

  /// <summary>
  /// Flattens a message's <c>content</c> — either a single content block or an array of them — to text,
  /// mirroring the TS <c>contentToText</c> (text blocks pass through; others render as a typed placeholder).
  /// </summary>
  private static string ContentToText(JsonNode? content)
  {
    var blocks = content switch
    {
      JsonArray array => array.OfType<JsonObject>(),
      JsonObject single => [single],
      _ => Enumerable.Empty<JsonObject>(),
    };
    return string.Join('\n', blocks.Select(block =>
      block["type"]?.GetValue<string>() == "text" && block["text"] is { } text
        ? text.GetValue<string>()
        : $"[{block["type"]?.GetValue<string>() ?? "unknown"} content]"));
  }
}
