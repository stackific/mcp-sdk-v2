# Content Blocks

**Part IV · Common types** · Book Ch 14 · Stories S20–S21 · sidebar `/content`

`ContentBlock` is the shared content vocabulary of MCP — a discriminated union dispatched on a
case-sensitive `type` string. A single tool result can mix `text`, `image`, `audio`, an
embedded `resource`, and a `resource_link`. This pattern calls a tool that returns one of each
and renders it by its discriminator.

## Round-trip

```
demo (ContentPage) ──REST POST /api/tools/call──▶  client host (Hono)
      ▲                                                │ api.callTool('content_gallery')
      │                                                ▼
  dispatch each block                        client!.requestWithInput(...)
  on b.type                                            │ tools/call ──▶ MCP server (content_gallery)
      │                                                │ ◀── { content: [text, image, audio, resource, resource_link] }
      └──────── content[] ◀──── Streamable HTTP ───────┘
```

## 1 · Frontend — `demo/src/routes/content.tsx` + `demo/src/lib/api.ts`

The page calls `backend.callTool('content_gallery', {})` and renders each block by switching on
its `type`. Inline `image`/`audio` carry Base64 `data` + `mimeType`; `resource` nests
`ResourceContents`; `resource_link` references a `uri`:

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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The Hono route delegates to `api.callTool`, which carries the `content` array back verbatim:

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json<{
    name: string;
    arguments?: Record<string, unknown>;
  }>();
  return run(c, () => api.callTool(name, args ?? {}));
});
```

```ts
// ts-mcp-client/src/mcp-client.ts
callTool: (name: string, args: Record<string, unknown>) =>
  withTrace(`tools/call:${name}`, () =>
    client!.requestWithInput({ method: 'tools/call', params: { name, arguments: args } }),
  ),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The `content_gallery` tool returns one block of each kind in a single `content` array. The
embedded `resource` carries inline `text` (a `TextResourceContents`); the `resource_link`
points at a `uri` instead of embedding it:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'content_gallery',
  {
    title: 'Content Gallery',
    description: 'Returns text, image, audio, an embedded resource, and a resource_link.',
  },
  async () => ({
    content: [
      {
        type: 'text',
        text: 'A tool result can mix block kinds: an image, audio, an embedded resource, and a resource link.',
      },
      { type: 'image', data: TINY_PNG_B64, mimeType: 'image/png' },
      { type: 'audio', data: TINY_WAV_B64, mimeType: 'audio/wav' },
      {
        type: 'resource',
        resource: {
          uri: 'docs://readme',
          mimeType: 'text/markdown',
          text: '# Embedded resource\nAn inline resource block carried directly in the result.',
        },
      },
      {
        type: 'resource_link',
        uri: 'weather://oslo/current',
        name: 'Oslo weather',
        mimeType: 'application/json',
      },
    ],
  }),
);
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
