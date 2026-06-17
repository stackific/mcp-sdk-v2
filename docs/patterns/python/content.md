# Content Blocks

**Part IV · Common types** · Book Ch 14 · Stories S20–S21 · sidebar `/content`

`ContentBlock` is the shared content vocabulary of MCP — a discriminated union dispatched on a
case-sensitive `type` string. A single tool result can mix `text`, `image`, `audio`, an
embedded `resource`, and a `resource_link`. This pattern calls a tool that returns one of each
and renders it by its discriminator.

## Round-trip

```
demo (ContentPage) ──REST POST /api/tools/call──▶  client host (FastAPI)
      ▲                                                │ api.call_tool('content_gallery')
      │                                                ▼
  dispatch each block                        client.call_tool(...) (SDK MRTR driver)
  on b.type                                            │ tools/call ──▶ MCP server (content_gallery)
      │                                                │ ◀── { content: [text, image, audio, resource, resource_link] }
      └──────── content[] ◀──── Streamable HTTP ───────┘
```

## 1 · Frontend — `demo/src/routes/content.tsx` + `demo/src/lib/api.ts`

The frontend is the shared TypeScript SPA; selecting **Python** on the home page repoints
`backend.*` at the Python client host, so this layer is byte-for-byte identical to the
TypeScript pattern.

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

## 2 · MCP client host — `py-mcp-client/main.py` + `py-mcp-client/mcp_client.py`

The FastAPI route unwraps the REST body and delegates to `api.call_tool`, which carries the
`content` array back verbatim:

```python
# py-mcp-client/main.py
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))
```

`call_tool` routes through `client.call_tool`, wrapped in `_with_trace` so the exchange is
grouped under one wire trace:

```python
# py-mcp-client/mcp_client.py
def call_tool(self, name: str, args: dict) -> dict:
  return _with_trace(f"tools/call:{name}", lambda: _state["client"].call_tool(name, args))
```

```python
# py-mcp-client/mcp_client.py
def _with_trace(trace: str, fn):
  ensure_connected()
  with _trace_scope(trace):
    return fn()
```

## 3 · MCP server — `py-mcp-server/features.py`

The `content_gallery` tool returns one block of each kind in a single `content` array. The
embedded `resource` carries inline `text` (a `TextResourceContents`); the `resource_link`
points at a `uri` instead of embedding it:

```python
# py-mcp-server/features.py
def content_gallery(args: dict, ctx: ToolContext) -> dict:
  return {
    "content": [
      {"type": "text", "text": "A tool result can mix block kinds: an image, audio, an embedded resource, and a resource link."},
      {"type": "image", "data": TINY_PNG_B64, "mimeType": "image/png"},
      {"type": "audio", "data": TINY_WAV_B64, "mimeType": "audio/wav"},
      {"type": "resource", "resource": {"uri": "docs://readme", "mimeType": "text/markdown", "text": "# Embedded resource\nAn inline resource block carried directly in the result."}},
      {"type": "resource_link", "uri": "weather://oslo/current", "name": "Oslo weather", "mimeType": "application/json"},
    ]
  }

server.register_tool(
  "content_gallery",
  content_gallery,
  title="Content Gallery",
  description="Returns text, image, audio, an embedded resource, and a resource_link.",
)
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

See [Tools](./tools.md) for the underlying `tools/call`, [Resources](./resources.md) for the
embedded `resource` block, and [Pagination](./pagination.md) and [Caching](./caching.md) for
siblings that ride the same route.
