# Content Blocks

**Part IV · Common types** · Book Ch 14 · Stories S20–S21 · sidebar `/content`

`ContentBlock` is the shared content vocabulary of MCP — a discriminated union dispatched on a
case-sensitive `type` string. A single tool result can mix `text`, `image`, `audio`, an
embedded `resource`, and a `resource_link`. This pattern calls a tool that returns one of each
and renders it by its discriminator.

## Round-trip

```
demo (ContentPage) ──REST POST /api/tools/call──▶  client host (ASP.NET Core)
      ▲                                                │ CallToolWithInputAsync('content_gallery')
      │                                                ▼
  dispatch each block                        client.CallToolWithInputAsync(...)
  on b.type                                            │ tools/call ──▶ MCP server (content_gallery)
      │                                                │ ◀── { content: [text, image, audio, resource, resource_link] }
      └──────── content[] ◀──── Streamable HTTP ───────┘
```

## 1 · Frontend — `demo/src/routes/content.tsx` + `demo/src/lib/api.ts`

The frontend is the shared companion SPA — identical across stacks; only the selected language
switch routes the call to the C# client host. The page calls `backend.callTool('content_gallery', {})`
and renders each block by switching on its `type`. Inline `image`/`audio` carry Base64 `data` +
`mimeType`; `resource` nests `ResourceContents`; `resource_link` references a `uri`:

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
```

```tsx
// demo/src/routes/content.tsx
const blocks: any[] = call.data?.ok ? ((call.data.result as any).content ?? []) : [];
// ...
{blocks.map((b, i) => {
  if (b.type === 'text') return /* ... */ <p>{b.text}</p>;
  if (b.type === 'image')
    return <img src={`data:${b.mimeType};base64,${b.data}`} />;
  if (b.type === 'audio')
    return <audio controls src={`data:${b.mimeType};base64,${b.data}`} />;
  if (b.type === 'resource')
    return <JsonBlock value={b.resource?.text ?? b.resource} />;
  if (b.type === 'resource_link')
    return <a href={b.uri}>{b.name ?? b.uri}</a>;
  // Unrecognized type — treated as unsupported content, the message is not failed.
})}
```

An unrecognized `type` is treated as unsupported content rather than failing the whole message.

## 2 · MCP client host — `csharp-mcp-client/Program.cs`

The minimal-API route delegates to the SDK's `CallToolWithInputAsync` driver, which carries the
`content` array back verbatim:

```csharp
// csharp-mcp-client/Program.cs
app.MapPost("/api/tools/call", (JsonObject body) => Run(async () =>
{
  var name = body["name"]!.GetValue<string>();
  var args = body["arguments"] as JsonObject ?? new JsonObject();
  return await host.WithTraceAsync<object?>($"tools/call:{name}", c => Box(c.CallToolWithInputAsync(name, args)));
}));
```

## 3 · MCP server — `csharp-mcp-server/Features.cs`

The `content_gallery` tool returns one block of each kind in a single `Content` array, built
with the SDK's `ContentBlocks` factories. The embedded `resource` carries inline `text` (a
`TextResourceContents`); the `resource_link` (`ContentBlocks.LinkTo`) points at a `uri` instead
of embedding it:

```csharp
// csharp-mcp-server/Features.cs
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
```

## On the wire

`tools/call` `content_gallery` → a `content` array of five blocks:

```
text          → { type: "text", text }
image         → { type: "image", data, mimeType }          (Base64 + required mimeType)
audio         → { type: "audio", data, mimeType }          (Base64 + required mimeType)
resource      → { type: "resource", resource: { uri, mimeType, text } }   (embedded)
resource_link → { type: "resource_link", uri, name, mimeType }            (by reference)
```

An `EmbeddedResource` nests exactly one of `text` (`TextResourceContents`) XOR `blob`
(`BlobResourceContents`) — never both. `Role` is the closed set `"user" | "assistant"`, and
`Annotations` (audience, a 0..1 `priority`, an ISO 8601 `lastModified`) are optional, untrusted
presentation hints — never used for security or correctness.
