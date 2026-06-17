# Resource Templates

**Part IV · Server features** · Book Ch 15 · Stories S26 · sidebar `/templates`

A resource template is a URI *pattern* (RFC 6570) rather than a fixed URI. The server
advertises it via `resources/templates/list`; the client fills the template's variables and
reads the resulting concrete URI with the ordinary `resources/read`. This pattern lists the
`weather://{city}/current` template and reads `weather://oslo/current`.

## Round-trip

```
demo (TemplatesPage) ──REST GET /api/resource-templates─▶  client host (Hono)
      ▲              ──REST POST /api/resources/read──────▶        │ api.listResourceTemplates()
      │                expand {city} → weather://oslo/current       │ api.readResource(uri)
      │                                                            ▼
  ApiResultView                                  @stackific/mcp-sdk  Client
      │                                                            │ resources/templates/list · resources/read
      └──── { resourceTemplates } / { contents } ◀── Streamable HTTP ──┴──▶ MCP server (registerResourceTemplate)
```

## 1 · Frontend — `demo/src/routes/templates.tsx` + `demo/src/lib/api.ts`

The page lists templates on mount, then expands `{city}` client-side and reads the concrete
URI — note there is no special "read template" call; it is the same `readResource` as a plain
[Resource](./resources.md):

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

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The list route has its own endpoint; the read route is shared with plain resources:

```ts
// ts-mcp-client/src/index.ts
app.get('/api/resource-templates', (c) => run(c, () => api.listResourceTemplates()));
```

```ts
// ts-mcp-client/src/mcp-client.ts
listResourceTemplates: () =>
  withTrace('resources/templates/list', () => client!.listResourceTemplates()),
```

## 3 · MCP server — `ts-mcp-server/src/features.ts`

`registerResourceTemplate` takes the `uriTemplate` plus a per-variable `complete` callback;
the handler receives the resolved `variables`:

```ts
// ts-mcp-server/src/features.ts
const cities = ['oslo', 'tokyo', 'cairo', 'lima', 'quito', 'osaka'];
server.registerResourceTemplate(
  'city-weather',
  {
    uriTemplate: 'weather://{city}/current',
    title: 'City Weather (template)',
    description: 'A templated resource with argument completion.',
    mimeType: 'application/json',
    complete: { city: (value) => cities.filter((c) => c.startsWith(value.toLowerCase())) },
  },
  async (uri, variables) => ({
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ city: variables.city, tempC: 21, conditions: 'sunny' }, null, 2),
      },
    ],
  }),
);
```

## On the wire

1. `resources/templates/list` → `{ resourceTemplates: [{ uriTemplate, name, mimeType, ... }] }`
2. `resources/read` (with the expanded URI) → `{ contents: [{ uri, mimeType, text }] }`

The `complete: { city }` callback above is what powers [Completion](./completion.md) for the
template's variable — type into the variable and the server suggests matching city names.
