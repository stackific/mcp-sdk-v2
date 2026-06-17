# MCP Apps (UI)

**Part VII · Extensions** · Book Ch 43 · Stories S41–S42 · sidebar `/apps`

The Apps extension lets a server ship an interactive UI as a `ui://` resource with mime
type `text/html;profile=mcp-app`. A launcher tool returns that resource embedded in its
result; the host renders it in a **sandboxed** iframe (`allow-scripts`, no same-origin) and
the app talks back over a `postMessage` bridge — so a server can present rich UI without the
host trusting its code. This pattern traces the launch and the bridge.

## Round-trip

```
demo (AppsPage)                                client host (Hono)
  callTool('open_counter_app') ──POST /api/tools/call──▶  api.callTool ──▶ MCP server
      ▲                          ◀── result.content[resource] + _meta.ui.resourceUri      │
      │  render ui:// html in sandboxed <iframe sandbox="allow-scripts">         uiToolResult
      │                                                                          ('ui://counter')
   postMessage bridge ◀────────────────────────────────────────────────────────────────┘
   ← app: ready/state/submit   → host: set/note
```

## 1 · Frontend — `demo/src/routes/apps.tsx` + `demo/src/lib/api.ts`

The page calls the launcher tool, reads the UI association from `_meta.ui.resourceUri`,
finds the embedded `ui://` resource in the result content, and renders its HTML in a
sandboxed iframe:

```tsx
// demo/src/routes/apps.tsx
const res = await call.run(() => backend.callTool('open_counter_app', {}));
const result = res.result as any;
const content: any[] = result?.content ?? [];
// The host reads the UI association from `_meta.ui.resourceUri`, then renders the
// embedded ui:// resource (mimeType `text/html;profile=mcp-app`).
const resourceUri = result?._meta?.ui?.resourceUri as string | undefined;
const ui = content.find(
  (c) => c.type === 'resource' &&
    (c.resource?.uri === resourceUri ||
      (typeof c.resource?.mimeType === 'string' && c.resource.mimeType.startsWith('text/html'))),
);
if (ui?.resource?.text) setHtml(ui.resource.text);
```

```tsx
// demo/src/routes/apps.tsx
<iframe ref={frameRef} title="MCP App: counter" srcDoc={html} sandbox="allow-scripts" />
```

The bridge is plain `postMessage`, namespaced so host and app never cross wires — the host
listens for `source:'mcp-app'` messages and sends `target:'mcp-app'` ones:

```tsx
// demo/src/routes/apps.tsx
// Receive messages from the sandboxed MCP App (the postMessage bridge).
const onMessage = (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.source !== 'mcp-app') return;
  setLog((l) => [...l, { dir: 'in', type: msg.type, payload: msg.payload }]);
};
// ...
function sendToApp(type: string, payload: unknown) {
  frameRef.current?.contentWindow?.postMessage({ target: 'mcp-app', type, payload }, '*');
}
```

```ts
// demo/src/lib/api.ts
callTool: (name: string, args: Record<string, unknown>) =>
  postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
readResource: (uri: string) => postJson<ApiResult<Any>>('/api/resources/read', { uri }),
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts`

The launcher is an ordinary `tools/call`; the host adds nothing app-specific — the UI rides
back inside the result content. (Reading the `ui://` resource directly is the same
`resources/read` path used for any [resource](./content.md).)

```ts
// ts-mcp-client/src/index.ts
app.post('/api/tools/call', async (c) => {
  const { name, arguments: args } = await c.req.json<{ ... }>();
  return run(c, () => api.callTool(name, args ?? {}));
});
// ...
app.post('/api/resources/read', async (c) => {
  const { uri } = await c.req.json<{ uri: string }>();
  return run(c, () => api.readResource(uri));
});
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

The server registers the UI as a `ui://` resource with the Apps mime type `UI_MIME_TYPE`
(`text/html;profile=mcp-app`), serving the bundled HTML string:

```ts
// ts-mcp-server/src/features.ts
// MCP Apps (UI extension): a ui:// resource (text/html;profile=mcp-app) + a launcher tool.
server.registerResource(
  'counter-app',
  'ui://counter',
  {
    title: 'Counter App (MCP Apps UI)',
    description: 'An interactive UI resource, rendered sandboxed by the host.',
    mimeType: UI_MIME_TYPE,
  },
  async (uri) => ({ contents: [{ uri, mimeType: UI_MIME_TYPE, text: COUNTER_APP_HTML }] }),
);
```

The launcher tool returns the resource embedded in a tool result via the SDK's
`uiToolResult` helper — which stamps `_meta.ui.resourceUri` and includes the `ui://`
resource block (plus a text fallback) so the host knows what to render:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'open_counter_app',
  {
    title: 'Open Counter App (MCP Apps)',
    description: 'Launches an MCP App: returns an embedded ui:// resource the host renders sandboxed.',
  },
  async () =>
    uiToolResult('ui://counter', COUNTER_APP_HTML, {
      text: 'Launching the Counter app (ui://counter). The host renders it sandboxed.',
    }),
);
```

The HTML is self-contained and speaks the same `postMessage` bridge — it announces `ready`,
emits `state`/`submit`, and accepts `set`/`note` from the host:

```ts
// ts-mcp-server/src/apps/counter-app.generated.ts
// Announce readiness to the host (MCP Apps lifecycle).
const post = (type, payload) =>
  parent.postMessage({ source: 'mcp-app', app: 'counter', type, payload }, '*');
post('ready', {});
// ...
// Receive messages from the host.
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || msg.target !== 'mcp-app') return;
  if (msg.type === 'set') { count = Number(msg.payload?.count) || 0; render(); }
});
```

## On the wire

```
→ tools/call { name: "open_counter_app", arguments: {} }
← { result: {
      content: [{ type: "resource", resource: { uri: "ui://counter", mimeType: "text/html;profile=mcp-app", text: "<!doctype html>…" } }],
      _meta: { ui: { resourceUri: "ui://counter" } } } }

// or read the resource directly:
→ resources/read { uri: "ui://counter" }
← { result: { contents: [{ uri: "ui://counter", mimeType: "text/html;profile=mcp-app", text: "<!doctype html>…" }] } }
```

The host renders that HTML *sandboxed* — `allow-scripts` without `allow-same-origin`, so the
app's scripts run but cannot touch the host's origin — and the only channel between them is
the namespaced `postMessage` bridge. See [Content](./content.md) for the embedded-resource
block this result reuses.
