# Implementation Patterns

For every **frontend sidebar item** (34 capabilities across the spec's 8 Parts), a pattern
that shows the same capability across all three layers of the companion — **frontend (the
shared demo SPA)**, **MCP client host**, and **MCP server** — with real code snippets and the
demo → server → back round-trip.

The frontend layer is identical in all three sets (the demo SPA is shared; picking a language
on the home page just repoints it at that stack's client host). Only the client and server
layers differ.

| Language       | Stack                                                        | Patterns                          |
| -------------- | ------------------------------------------------------------ | --------------------------------- |
| **TypeScript** | `ts-mcp-client` + `ts-mcp-server` on `@stackific/mcp-sdk`    | [typescript/](./typescript/README.md) |
| **Python**     | `py-mcp-client` + `py-mcp-server` on `stackific.mcp`         | [python/](./python/README.md)     |
| **C#**         | `csharp-mcp-client` + `csharp-mcp-server` on `Stackific.Mcp` | [csharp/](./csharp/README.md)     |

Each capability page in the running demo links to the pattern for the **currently selected
language** (see `demo/src/lib/patterns.ts`). Regenerate the SDK API references — a different
set of docs — with `task docs` (see [../README.md](../README.md)).
