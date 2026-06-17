# Registries

**Part VIII · Governance** · Book Ch 29 / App. A–E · Stories S46 · sidebar `/registries`

The capstone appendices (A–E) consolidate the entire wire surface into five authoritative tables:
the Method & Notification Index, the Error Code Registry, the Reserved `_meta` Key Registry, the
Capability Registry, and the Consolidated Type Index. They define **no new types** — each row points
to the section that normatively owns it. This pattern shows how the server registers and advertises
its live catalog, how the client lists it, and where the SDK's static registry data lives.

## Round-trip

```
demo (RegistriesPage)  ──GET /api/tools──▶  client host (Hono)
      ▲                                          │ api.listTools()
      │                                          ▼
  Badge per tool name                    @stackific/mcp-sdk  Client
      │                                          │ tools/list (JSON-RPC)
      └──── live method surface ◀──── tools Map ──┴──▶ MCP server (registerTool → listTools)
```

## 1 · Frontend — `demo/src/routes/registries.tsx`

The page enumerates the standard registry contents statically, then queries the live server's
`tools/list` so the *actual* method surface can be compared against the Method & Notification Index
(Appendix A). The live half is one call:

```tsx
// demo/src/routes/registries.tsx
const tools = call.data?.ok ? ((call.data.result.tools as any[]) ?? []) : [];
// ...
<Button data-testid="run-registries" disabled={call.loading}
  onClick={() => call.run(() => backend.listTools())}>
  Load live registry
</Button>
<div data-testid="registry-methods" className="flex flex-wrap gap-1.5">
  {tools.map((t) => (
    <Badge key={t.name} variant="blue">{t.name}</Badge>
  ))}
</div>
```

## 2 · MCP client host — `ts-mcp-client/src/index.ts` + `ts-mcp-client/src/mcp-client.ts`

The REST route delegates to the SDK `Client`'s typed `listTools()`:

```ts
// ts-mcp-client/src/index.ts
app.get('/api/tools', (c) => run(c, () => api.listTools()));
```

```ts
// ts-mcp-client/src/mcp-client.ts
listTools: () => withTrace('tools/list', () => client!.listTools()),
```

## 3 · MCP server — `ts-sdk/src/server/server.ts` + `ts-sdk/src/protocol/registries.ts`

The server *is* a registry: `registerTool` populates a `Map`, and `listTools` projects that map onto
the `tools/list` result — the live catalog the demo renders:

```ts
// ts-sdk/src/server/server.ts
private readonly tools = new Map<string, RegisteredTool>();
// ...
registerTool(name: string, def: ToolDef, handler: ToolHandler): void {
  this.tools.set(name, { name, def, handler });
}
```

```ts
// ts-sdk/src/server/server.ts
private listTools(params: Record<string, unknown>): Record<string, unknown> {
  const tools = [...this.tools.values()].map((t) => ({
    name: t.name,
    ...(t.def.title ? { title: t.def.title } : {}),
    ...(t.def.description ? { description: t.def.description } : {}),
    inputSchema: t.def.inputSchema ?? { type: 'object' },
    ...(t.def.annotations ? { annotations: t.def.annotations } : {}),
    // ...
  }));
  return this.withCacheableHints(this.paginate(tools, 'tools', params));
}
```

The companion server seeds that map at build time — each `registerTool` is one row in the live
registry the demo enumerates:

```ts
// ts-mcp-server/src/features.ts
server.registerTool(
  'echo',
  { title: 'Echo', description: 'The simplest possible tool: echoes text back.', /* ... */ },
  async (args) => ({ content: [{ type: 'text', text: String(args.text) }] }),
);
```

The five **static** appendix tables (A–E) are SDK data — App. A's Method & Notification Index and
App. D's Capability Registry are the ones the demo mirrors:

```ts
// ts-sdk/src/protocol/registries.ts
export const METHOD_REGISTRY: readonly MethodNotificationIndexEntry[] = [
  { name: 'tools/list', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§16 Tools' },
  { name: 'tools/call', kind: RegistryMethodKind.REQUEST, direction: 'client→server', definedIn: '§16 Tools' },
  { name: 'roots/list', kind: RegistryMethodKind.INPUT_REQUEST, direction: 'server→client (via input-required result, §11)', definedIn: '§21 Deprecated Client-Provided Capabilities' },
  // ... every method and notification, each citing its owning section
];
```

```ts
// ts-sdk/src/protocol/registries.ts
export const CAPABILITY_REGISTRY: readonly CapabilityRegistryEntry[] = [
  { capability: 'tools', side: 'server', subFlags: [
      { name: 'listChanged', requirement: 'optional', boolean: true, gates: 'enables notifications/tools/list_changed' },
    ], definedIn: '§6 Capabilities and Extensions' },
  { capability: 'roots', side: 'client', subFlags: [], definedIn: '§6 Capabilities and Extensions', deprecated: true },
  // ... io.modelcontextprotocol/tasks, io.modelcontextprotocol/ui (extension-scoped)
];
```

Appendix B (Error Codes) is **never rebuilt** — `registries.ts` re-exports the authoritative §22
table so the whole error surface is reachable through one module:

```ts
// ts-sdk/src/protocol/registries.ts
export {
  ERROR_CODE_REGISTRY,
  RESERVED_ERROR_CODES,
  validateExtensionErrorCode,
} from './errors.js';
```

## On the wire

1. `tools/list` → `{ tools: [{ name, inputSchema, annotations, ... }] }` — the live method surface,
   one badge per name in the demo.
2. Every name returned is a row in Appendix A; every advertised capability is a row in Appendix D —
   the appendices restate, never redefine, what the wire already carries.

The registries are governance artifacts: a consolidation that points back to its defining section,
plus a few cross-cutting rules (custom error codes must avoid the reserved table; the three client
`_meta` keys are required on every request). See [Capabilities](./capabilities.md),
[Errors](./errors.md), and [The \_meta Envelope](./meta.md) for the sections each appendix indexes,
and [Conformance](./conformance.md) for the rule that a profile MUST use these exact codes, keys, and
identifiers.
