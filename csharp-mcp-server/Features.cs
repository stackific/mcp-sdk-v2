using System.Text;
using System.Text.Json.Nodes;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;

namespace CSharpMcpServer;

/// <summary>
/// The companion server's features — every server capability built on the Stackific.Mcp SDK server
/// runtime, mirroring the TypeScript reference server (ts-mcp-server). Tools demonstrate structured
/// output, tool-vs-protocol errors, streamed log/progress notifications, the multi-round-trip client
/// features (elicitation form + URL, sampling, roots), pagination, caching hints, tracing, and the
/// content-block gallery, plus resources, a resource template with completion, and a prompt.
/// </summary>
public static class Features
{
  // Tiny placeholder media for the content-blocks demo (1×1 PNG, empty WAV).
  private const string TinyPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  private const string TinyWavBase64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

  // A self-contained MCP App (text/html;profile=mcp-app), served as the ui://counter resource and
  // rendered sandboxed by the host (§26). Ported verbatim from the TypeScript reference server's
  // counter-app.html so the C# and TS demos are identical: the same UI and the same postMessage
  // bridge protocol (app ready/state/submit out; host set/note in).
  private const string CounterAppHtml = """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Counter App</title>
        <style>
          :root {
            color-scheme: dark;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family:
              ui-sans-serif,
              system-ui,
              -apple-system,
              Segoe UI,
              Roboto,
              sans-serif;
            background: #0b1120;
            color: #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            width: 100%;
            max-width: 360px;
            padding: 24px;
            border: 1px solid #1e293b;
            border-radius: 12px;
            background: #0f172a;
            text-align: center;
          }
          h1 {
            font-size: 14px;
            font-weight: 600;
            color: #93c5fd;
            margin: 0 0 4px;
          }
          p.sub {
            font-size: 12px;
            color: #64748b;
            margin: 0 0 20px;
          }
          .count {
            font-size: 48px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            margin: 8px 0 20px;
          }
          .row {
            display: flex;
            gap: 8px;
            justify-content: center;
          }
          button {
            font: inherit;
            font-size: 14px;
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid #334155;
            background: #1e293b;
            color: #e2e8f0;
            cursor: pointer;
          }
          button:hover {
            background: #334155;
          }
          button.primary {
            background: #2563eb;
            border-color: #2563eb;
            color: #fff;
          }
          button.primary:hover {
            background: #1d4ed8;
          }
          .from-host {
            margin-top: 16px;
            font-size: 12px;
            color: #94a3b8;
            min-height: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Counter — an MCP App</h1>
          <p class="sub">Served as <code>ui://counter</code>, sandboxed, host-bridged.</p>
          <div class="count" id="count" data-testid="app-count">0</div>
          <div class="row">
            <button id="dec" aria-label="decrement">−</button>
            <button id="inc" aria-label="increment">+</button>
            <button class="primary" id="send" data-testid="app-send">Send to host</button>
          </div>
          <div class="from-host" id="fromHost"></div>
        </div>
        <script>
          let count = 0;
          const el = document.getElementById('count');
          const fromHost = document.getElementById('fromHost');
          const render = () => {
            el.textContent = String(count);
          };
    
          // Announce readiness to the host (MCP Apps lifecycle).
          const post = (type, payload) =>
            parent.postMessage({ source: 'mcp-app', app: 'counter', type, payload }, '*');
          post('ready', {});
    
          document.getElementById('inc').addEventListener('click', () => {
            count++;
            render();
            post('state', { count });
          });
          document.getElementById('dec').addEventListener('click', () => {
            count--;
            render();
            post('state', { count });
          });
          document.getElementById('send').addEventListener('click', () => post('submit', { count }));
    
          // Receive messages from the host.
          window.addEventListener('message', (e) => {
            const msg = e.data;
            if (!msg || msg.target !== 'mcp-app') return;
            if (msg.type === 'set') {
              count = Number(msg.payload?.count) || 0;
              render();
            }
            if (msg.type === 'note') {
              fromHost.textContent = 'host: ' + String(msg.payload?.text ?? '');
            }
          });
        </script>
      </body>
    </html>
    """;

  private static JsonObject Schema(string json) => JsonNode.Parse(json)!.AsObject();

  /// <summary>Builds the configured companion MCP server.</summary>
  /// <returns>The server, ready to be mapped onto an HTTP endpoint.</returns>
  public static McpServer Build()
  {
    var server = new McpServer(
      new Implementation { Name = "companion-mcp-server", Title = "Companion MCP Server (C#)", Version = "0.1.0" },
      new ServerCapabilities
      {
        Logging = new JsonObject(),
        Completions = new JsonObject(),
        Tools = new ToolsCapability { ListChanged = true },
        Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
        Prompts = new PromptsCapability { ListChanged = true },
        Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject(), [MetaKeys.UiExtension] = new JsonObject() },
      },
      instructions: "A reference MCP server demonstrating every server and client capability over Streamable HTTP.");

    RegisterTools(server);
    RegisterResourcesAndPrompts(server);
    return server;
  }

  private static void RegisterTools(McpServer server)
  {
    server.RegisterTool(
      new Tool
      {
        Name = "echo",
        Title = "Echo",
        Description = "The simplest possible tool: echoes text back.",
        InputSchema = Schema("""{"type":"object","properties":{"text":{"type":"string","description":"Text to echo back"}},"required":["text"]}"""),
        Annotations = new ToolAnnotations { ReadOnlyHint = true, IdempotentHint = true, OpenWorldHint = false },
      },
      ctx => Task.FromResult(CallToolResult.FromText(ctx.GetString("text"))));

    server.RegisterTool(
      new Tool
      {
        Name = "add",
        Title = "Add",
        Description = "Adds two numbers.",
        InputSchema = Schema("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}"""),
      },
      ctx => Task.FromResult(CallToolResult.FromText(Num(ctx.GetDouble("a") + ctx.GetDouble("b")))));

    server.RegisterTool(
      new Tool
      {
        Name = "get_weather",
        Title = "Get Weather",
        Description = "Structured-output demo: returns structuredContent matching outputSchema.",
        InputSchema = Schema("""{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}"""),
        OutputSchema = Schema("""{"type":"object","properties":{"city":{"type":"string"},"tempC":{"type":"number"},"conditions":{"type":"string","enum":["sunny","cloudy","rainy","stormy"]}},"required":["city","tempC","conditions"]}"""),
      },
      ctx =>
      {
        var conditions = new[] { "sunny", "cloudy", "rainy", "stormy" }[Random.Shared.Next(4)];
        var structured = new JsonObject { ["city"] = ctx.GetString("city"), ["tempC"] = Math.Round(Random.Shared.NextDouble() * 30 - 5, 1), ["conditions"] = conditions };
        return Task.FromResult(new CallToolResult { Content = [ContentBlocks.Text(structured.ToJsonString())], StructuredContent = structured });
      });

    server.RegisterTool(
      new Tool
      {
        Name = "divide",
        Title = "Divide (may error)",
        Description = "Demonstrates a TOOL error (isError:true) vs a protocol error.",
        InputSchema = Schema("""{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}"""),
        Annotations = new ToolAnnotations { ReadOnlyHint = true, IdempotentHint = true },
      },
      ctx => Task.FromResult(ctx.GetDouble("b") == 0
        ? CallToolResult.FromError("Cannot divide by zero. Reported as isError:true so the model can recover.")
        : CallToolResult.FromText(Num(ctx.GetDouble("a") / ctx.GetDouble("b")))));

    server.RegisterTool(
      new Tool
      {
        Name = "count_with_logs",
        Title = "Count (streams log notifications)",
        Description = "Streams notifications/message while it runs — out-of-band notifications on the wire.",
        InputSchema = Schema("""{"type":"object","properties":{"count":{"type":"integer","minimum":1,"maximum":20,"default":5},"intervalMs":{"type":"integer","minimum":50,"maximum":2000,"default":500}}}"""),
      },
      async ctx =>
      {
        var count = ctx.GetInt("count", 5);
        var intervalMs = ctx.GetInt("intervalMs", 500);
        for (var i = 1; i <= count; i++)
        {
          await ctx.LogAsync(LoggingLevel.Info, $"tick {i}/{count} at {DateTimeOffset.UtcNow:O}");
          await Task.Delay((int)intervalMs, ctx.Signal);
        }
        return CallToolResult.FromText($"Done. Sent {count} log notifications.");
      });

    server.RegisterTool(
      new Tool { Name = "register_user", Title = "Register User (form elicitation)", Description = "Server requests user input via FORM elicitation.", InputSchema = Schema("""{"type":"object"}""") },
      async ctx =>
      {
        var result = await ctx.ElicitInputAsync(new ElicitRequestFormParams
        {
          Message = "Please provide your registration details:",
          RequestedSchema = Schema("""{"type":"object","properties":{"username":{"type":"string","title":"Username","minLength":3,"maxLength":20},"email":{"type":"string","title":"Email","format":"email"},"newsletter":{"type":"boolean","title":"Subscribe to newsletter?","default":false}},"required":["username","email"]}"""),
        });
        return result is { Action: ElicitationAction.Accept, Content: { } content }
          ? CallToolResult.FromText($"Registered:\n{content.ToJsonString()}")
          : CallToolResult.FromText($"User chose to {result.Action} the form.");
      });

    server.RegisterTool(
      new Tool { Name = "confirm_purchase", Title = "Confirm Purchase (URL elicitation)", Description = "Server requests confirmation via URL elicitation.", InputSchema = Schema("""{"type":"object"}""") },
      async ctx =>
      {
        var frontend = Environment.GetEnvironmentVariable("FRONTEND_URL") ?? "http://localhost:8000";
        var elicitationId = $"purchase-{Guid.NewGuid():N}";
        var result = await ctx.ElicitInputAsync(new ElicitRequestURLParams
        {
          Message = "Please confirm your purchase in the opened page.",
          ElicitationId = elicitationId,
          Url = $"{frontend}/elicit/{elicitationId}",
        });
        return CallToolResult.FromText($"URL elicitation result: {result.Action} (id={elicitationId}).");
      });

    server.RegisterTool(
      new Tool
      {
        Name = "summarize",
        Title = "Summarize (sampling)",
        Description = "Server asks the CLIENT to run its model (sampling/createMessage).",
        InputSchema = Schema("""{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}"""),
      },
      async ctx =>
      {
        var message = await ctx.CreateMessageAsync(new CreateMessageRequestParams
        {
          Messages = [new SamplingMessage { Role = Role.User, Content = [SamplingContentBlocks.Text($"Summarize in one sentence:\n{ctx.GetString("text")}")] }],
          MaxTokens = 200,
        });
        var text = message.Content.OfType<SamplingTextContent>().FirstOrDefault()?.Text ?? "(no text)";
        return CallToolResult.FromText($"Model \"{message.Model}\" replied:\n{text}");
      });

    server.RegisterTool(
      new Tool { Name = "show_roots", Title = "Show Roots", Description = "Server requests the client roots list (roots/list).", InputSchema = Schema("""{"type":"object"}""") },
      async ctx =>
      {
        var roots = await ctx.ListRootsAsync();
        var rendered = new JsonArray();
        foreach (var root in roots) rendered.Add(new JsonObject { ["uri"] = root.Uri, ["name"] = root.Name });
        return CallToolResult.FromText($"Client roots:\n{rendered.ToJsonString()}");
      });

    server.RegisterTool(
      new Tool
      {
        Name = "slow_count",
        Title = "Slow Count (cancellable)",
        Description = "Counts slowly, streams a log + progress per tick, stops early when cancelled.",
        InputSchema = Schema("""{"type":"object","properties":{"to":{"type":"integer","minimum":1,"maximum":50,"default":12},"intervalMs":{"type":"integer","minimum":50,"maximum":2000,"default":600}}}"""),
      },
      async ctx =>
      {
        var to = ctx.GetInt("to", 12);
        var intervalMs = ctx.GetInt("intervalMs", 600);
        var i = 0;
        for (; i < to; i++)
        {
          if (ctx.Signal.IsCancellationRequested) break;
          await ctx.LogAsync(LoggingLevel.Info, $"count {i + 1}/{to}");
          await ctx.ReportProgressAsync(i + 1, to, $"count {i + 1}/{to}");
          try { await Task.Delay((int)intervalMs, ctx.Signal); }
          catch (TaskCanceledException) { break; }
        }
        return CallToolResult.FromText(ctx.Signal.IsCancellationRequested ? $"Cancelled at {i}/{to}." : $"Counted to {to}.");
      });

    server.RegisterTool(
      new Tool
      {
        Name = "mutate_catalog",
        Title = "Mutate Catalog",
        Description = "Fires tools/prompts/resources list_changed and resources/updated so a subscriber re-fetches.",
        InputSchema = Schema("""{"type":"object"}"""),
        Annotations = new ToolAnnotations { ReadOnlyHint = false, DestructiveHint = false, IdempotentHint = true },
      },
      async ctx =>
      {
        // Fan out to active subscription streams (no-op until a subscriber is listening)…
        foreach (var method in new[] { McpMethods.NotificationsToolsListChanged, McpMethods.NotificationsPromptsListChanged, McpMethods.NotificationsResourcesListChanged })
        {
          await ctx.NotifySubscribersAsync(new JsonRpcNotification(method));
        }
        await ctx.NotifySubscribersAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
        // …and emit the same four on this request's own stream so the Notifications view (no
        // subscription) sees them, mirroring ts-mcp-server's send{Tool,Prompt,Resource}ListChanged +
        // sendResourceUpdated.
        await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsToolsListChanged));
        await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsPromptsListChanged));
        await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesListChanged));
        await ctx.NotifyAsync(new JsonRpcNotification(McpMethods.NotificationsResourcesUpdated, new JsonObject { ["uri"] = "docs://readme" }));
        return CallToolResult.FromText("Emitted list_changed + resources/updated to subscribers and on this stream.");
      });

    server.RegisterTool(
      new Tool
      {
        Name = "list_catalog",
        Title = "List Catalog (paginated)",
        Description = "Returns one opaque-cursor page at a time; pass nextCursor to continue.",
        InputSchema = Schema("""{"type":"object","properties":{"cursor":{"type":"string"}}}"""),
      },
      ctx =>
      {
        const int pageSize = 5;
        var catalog = Enumerable.Range(1, 23).Select(i => new JsonObject { ["id"] = i, ["name"] = $"item-{i:D2}" }).ToList();
        var offset = 0;
        var cursor = ctx.GetString("cursor", "");
        if (cursor.Length > 0)
        {
          try { offset = int.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(cursor))); } catch { offset = 0; }
        }
        var items = new JsonArray(catalog.Skip(offset).Take(pageSize).Cast<JsonNode>().Select(n => n.DeepClone()).ToArray());
        var nextOffset = offset + pageSize;
        var structured = new JsonObject { ["items"] = items, ["total"] = catalog.Count };
        if (nextOffset < catalog.Count) structured["nextCursor"] = Convert.ToBase64String(Encoding.UTF8.GetBytes(nextOffset.ToString()));
        return Task.FromResult(new CallToolResult { Content = [ContentBlocks.Text(structured.ToJsonString())], StructuredContent = structured });
      });

    var quoteCounter = 0;
    server.RegisterTool(
      new Tool { Name = "cached_quote", Title = "Cached Quote", Description = "Returns a result carrying top-level cache hints (ttlMs + cacheScope).", InputSchema = Schema("""{"type":"object"}""") },
      ctx =>
      {
        quoteCounter++;
        var quotes = new[] { "Make it work, then make it right.", "Cache invalidation is hard.", "Premature optimization is the root of all evil." };
        ctx.SetCacheHints(60000, CacheScope.Private);
        return Task.FromResult(new CallToolResult
        {
          Content = [ContentBlocks.Text($"#{quoteCounter}: {quotes[quoteCounter % quotes.Length]}")],
          Meta = new JsonObject { ["generatedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["invocation"] = quoteCounter },
        });
      });

    server.RegisterTool(
      new Tool { Name = "echo_trace", Title = "Echo Trace Context", Description = "Echoes back the _meta the server received (incl. traceparent/tracestate).", InputSchema = Schema("""{"type":"object"}""") },
      ctx => Task.FromResult(new CallToolResult
      {
        Content = [ContentBlocks.Text($"Server received _meta:\n{(ctx.Meta ?? new JsonObject()).ToJsonString()}")],
        Meta = new JsonObject { ["echoed"] = (ctx.Meta ?? new JsonObject()).DeepClone() },
      }));

    server.RegisterTool(
      new Tool { Name = "content_gallery", Title = "Content Gallery", Description = "Returns text, image, audio, an embedded resource, and a resource_link.", InputSchema = Schema("""{"type":"object"}""") },
      ctx => Task.FromResult(new CallToolResult
      {
        Content =
        [
          ContentBlocks.Text("A tool result can mix block kinds: an image, audio, an embedded resource, and a resource link."),
          ContentBlocks.Image(TinyPngBase64, "image/png"),
          ContentBlocks.Audio(TinyWavBase64, "audio/wav"),
          ContentBlocks.Resource(ResourceContents.OfText("docs://readme", "# Embedded resource\nAn inline resource block carried directly in the result.", "text/markdown")),
          ContentBlocks.LinkTo("weather://oslo/current", "Oslo weather", "application/json"),
        ],
      }));

    server.RegisterTaskTool(
      new Tool
      {
        Name = "long_job",
        Title = "Long Job (task)",
        Description = "Runs as a task: returns a handle immediately, works through N steps, then exposes the result via tasks/get.",
        InputSchema = Schema("""{"type":"object","properties":{"steps":{"type":"integer","minimum":1,"maximum":8,"default":4},"label":{"type":"string","default":"report"}}}"""),
      },
      ctx =>
      {
        var steps = (int)ctx.GetInt("steps", 4);
        var label = ctx.GetString("label", "report");
        var store = ctx.Tasks!;
        var task = store.Create(ctx.TaskTtlMs);

        _ = Task.Run(async () =>
        {
          try
          {
            for (var i = 1; i <= steps; i++)
            {
              await Task.Delay(500);
              if (store.StatusOf(task.TaskId) != McpTaskStatus.Working) return; // cancelled/expired
              store.UpdateStatus(task.TaskId, McpTaskStatus.Working, $"step {i}/{steps}");
            }
            if (store.StatusOf(task.TaskId) != McpTaskStatus.Working) return;
            store.StoreResult(task.TaskId, new CallToolResult
            {
              Content = [ContentBlocks.Text($"Job \"{label}\" completed {steps} steps.")],
              StructuredContent = new JsonObject { ["label"] = label, ["steps"] = steps, ["finishedAt"] = DateTimeOffset.UtcNow.ToString("O") },
            });
          }
          catch (Exception error)
          {
            if (store.StatusOf(task.TaskId) == McpTaskStatus.Working)
            {
              store.Fail(task.TaskId, McpError.InternalError($"job failed: {error.Message}").ToJsonRpcError());
            }
          }
        });

        return Task.FromResult(task);
      });

    server.RegisterTool(
      new Tool
      {
        Name = "open_counter_app",
        Title = "Open Counter App (MCP Apps)",
        Description = "Launches an MCP App: returns an embedded ui:// resource the host renders sandboxed.",
        InputSchema = Schema("""{"type":"object"}"""),
        Meta = new JsonObject { ["ui"] = new JsonObject { ["resourceUri"] = "ui://counter" } },
      },
      ctx => Task.FromResult(UiHelpers.UiToolResult("ui://counter", CounterAppHtml, "Launching the Counter app (ui://counter). The host renders it sandboxed.")));
  }

  private static void RegisterResourcesAndPrompts(McpServer server)
  {
    server.RegisterResource(
      new Resource { Uri = "docs://readme", Name = "readme", Title = "Readme", Description = "A static text resource.", MimeType = "text/markdown" },
      uri => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, "# Companion Server\n\nThis is a static MCP resource served over Streamable HTTP.", "text/markdown")] }));

    server.RegisterResource(
      new Resource { Uri = "ui://counter", Name = "counter-app", Title = "Counter App (MCP Apps UI)", Description = "An interactive UI resource, rendered sandboxed by the host.", MimeType = UiResource.MimeType },
      uri => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, CounterAppHtml, UiResource.MimeType)] }));

    var cities = new[] { "oslo", "tokyo", "cairo", "lima", "quito", "osaka" };
    server.RegisterResourceTemplate(
      new ResourceTemplate { UriTemplate = "weather://{city}/current", Name = "city-weather", Title = "City Weather (template)", Description = "A templated resource with argument completion.", MimeType = "application/json" },
      (uri, vars) => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, new JsonObject { ["city"] = vars["city"], ["tempC"] = 21, ["conditions"] = "sunny" }.ToJsonString(), "application/json")] }),
      new Dictionary<string, ArgumentCompleter> { ["city"] = value => cities.Where(c => c.StartsWith(value, StringComparison.OrdinalIgnoreCase)).ToList() });

    server.RegisterPrompt(
      new Prompt
      {
        Name = "greeting",
        Title = "Greeting",
        Description = "A reusable, user-invoked prompt with a completable argument.",
        Arguments = [new PromptArgument { Name = "name", Required = true, Description = "Who to greet" }, new PromptArgument { Name = "language", Description = "Language" }],
      },
      args => Task.FromResult(new GetPromptResult
      {
        Messages = [new PromptMessage { Role = Role.User, Content = ContentBlocks.Text($"Greet {args.GetValueOrDefault("name", "friend")} warmly in {args.GetValueOrDefault("language", "english")}.") }],
      }),
      new Dictionary<string, ArgumentCompleter> { ["language"] = value => new[] { "english", "spanish", "norwegian", "japanese" }.Where(l => l.StartsWith(value, StringComparison.OrdinalIgnoreCase)).ToList() });
  }

  private static string Num(double value) => value.ToString(System.Globalization.CultureInfo.InvariantCulture);
}
