# Resource Templates

**Part IV · Server features** · Book Ch 15 · Stories S26 · sidebar `/templates`

A resource template is a URI *pattern* (RFC 6570) rather than a fixed URI. The server
advertises it via `resources/templates/list`; the client fills the template's variables and
reads the resulting concrete URI with the ordinary `resources/read`. This pattern lists the
`weather://{city}/current` template and reads `weather://oslo/current`.

## Round-trip

```
demo (TemplatesPage) ──REST GET /api/resource-templates─▶  client host (ASP.NET Core)
      ▲              ──REST POST /api/resources/read──────▶        │ ListResourceTemplatesAsync()
      │                expand {city} → weather://oslo/current       │ ReadResourceAsync(uri)
      │                                                            ▼
  ApiResultView                                  Stackific.Mcp  McpClient
      │                                                            │ resources/templates/list · resources/read
      └──── { resourceTemplates } / { contents } ◀── Streamable HTTP ──┴──▶ MCP server (RegisterResourceTemplate)
```

## 1 · Frontend — `demo/src/routes/templates.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page lists templates on mount, then expands
`{city}` client-side and reads the concrete URI — note there is no special "read template" call;
it is the same `readResource` as a plain [Resource](./resources.md):

```ts
// demo/src/lib/api.ts
listResourceTemplates: () => getJson<ApiResult<Any>>('/api/resource-templates'),
readResource: (uri: string) => postJson<ApiResult<Any>>('/api/resources/read', { uri }),
```

```tsx
// demo/src/routes/templates.tsx
const templates = list.data?.ok ? (list.data.result.resourceTemplates as any[]) : [];
const uri = `weather://${city}/current`;
// ...
<Button onClick={() => read.run(() => backend.readResource(uri))} data-testid="run-template-read">
  Read templated resource
</Button>
```

## 2 · MCP client host — `csharp-mcp-client/Program.cs` + `csharp-mcp-client/ClientHost.cs`

The list route has its own endpoint; the read route is shared with plain resources:

```csharp
// csharp-mcp-client/Program.cs
app.MapGet("/api/resource-templates", () => Run(() => host.WithTraceAsync<object?>("resources/templates/list", c => Box(c.ListResourceTemplatesAsync()))));
```

`WithTraceAsync` (in `ClientHost.cs`) connects on first use and tags the emitted frames with
`resources/templates/list` for the "under the hood" view.

## 3 · MCP server — `csharp-mcp-server/Features.cs`

`RegisterResourceTemplate` takes the `ResourceTemplate` (with the `UriTemplate`), a handler that
receives the resolved `vars`, and a per-variable `ArgumentCompleter` dictionary:

```csharp
// csharp-mcp-server/Features.cs
var cities = new[] { "oslo", "tokyo", "cairo", "lima", "quito", "osaka" };
server.RegisterResourceTemplate(
  new ResourceTemplate { UriTemplate = "weather://{city}/current", Name = "city-weather", Title = "City Weather (template)", Description = "A templated resource with argument completion.", MimeType = "application/json" },
  (uri, vars) => Task.FromResult(new ReadResourceResult { Contents = [ResourceContents.OfText(uri, new JsonObject { ["city"] = vars["city"], ["tempC"] = 21, ["conditions"] = "sunny" }.ToJsonString(), "application/json")] }),
  new Dictionary<string, ArgumentCompleter> { ["city"] = value => cities.Where(c => c.StartsWith(value, StringComparison.OrdinalIgnoreCase)).ToList() });
```

## On the wire

1. `resources/templates/list` → `{ resourceTemplates: [{ uriTemplate, name, mimeType, ... }] }`
2. `resources/read` (with the expanded URI) → `{ contents: [{ uri, mimeType, text }] }`

The `["city"]` `ArgumentCompleter` above is what powers [Completion](./completion.md) for the
template's variable — type into the variable and the server suggests matching city names.
