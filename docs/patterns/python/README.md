# Python MCP Patterns

One pattern per **frontend sidebar item**. Each shows the same capability across all three
layers of the companion — **frontend (demo SPA)**, **MCP client host**, and **MCP server** —
with the Python stack on `stackific-mcp` (`stackific.mcp`), tracing the round-trip _from the
demo to the MCP server and back_.

The frontend is the shared SPA (TypeScript); selecting **Python** on the home page repoints it
at the Python client host. Only the client and server layers differ from the
[TypeScript patterns](../typescript/README.md).

## The three layers

| Layer          | Project / dir              | Role                                                              |
| -------------- | -------------------------- | ---------------------------------------------------------------- |
| **Frontend**   | `demo/` (`@stackific/mcp-demo`) | The SPA. Pages call `backend.*` (`demo/src/lib/api.ts`) over REST. |
| **MCP client** | `py-mcp-client/`           | FastAPI host of the `stackific.mcp` `Client`; REST → JSON-RPC over Streamable HTTP. |
| **MCP server** | `py-mcp-server/`           | Built on `stackific.mcp`; registers tools/resources/prompts/… |

```
demo route ──▶ demo/src/lib/api.ts ──REST──▶ py-mcp-client (main.py → mcp_client.py)
                                                     │ stackific.mcp Client
                                                     ▼ JSON-RPC over Streamable HTTP
                                              py-mcp-server (features.py)
```

## Patterns

### I · Foundations

- [Overview & Discovery](./overview.md) — S07–S09
- [Protocol Foundations](./foundations.md) — S01
- [JSON Value Model](./json-model.md) — S02
- [JSON-RPC Framing](./jsonrpc.md) — S03–S04
- [The \_meta Envelope](./meta.md) — S05
- [Stateless Model](./stateless.md) — S06
- [Capabilities](./capabilities.md) — S10
- [Extensions Map](./extensions.md) — S11·S38

### II · Transports

- [Transport & HTTP](./transport.md) — S12–S15

### III · Interaction & utilities

- [Multi-Round-Trip](./mrtr.md) — S17
- [Pagination](./pagination.md) — S18
- [Caching](./caching.md) — S19
- [Content Blocks](./content.md) — S20–S21
- [Progress & Cancel](./progress.md) — S22
- [Logging](./logging.md) — S23
- [Tracing](./tracing.md) — S23
- [Notifications](./notifications.md) — S16
- [Subscriptions](./subscriptions.md) — S16

### IV · Server features

- [Tools](./tools.md) — S24–S25
- [Resources](./resources.md) — S26–S27
- [Resource Templates](./templates.md) — S26
- [Prompts](./prompts.md) — S28
- [Completion](./completion.md) — S29

### V · Client features (MRTR)

- [Elicitation](./elicitation.md) — S30–S31
- [Sampling](./sampling.md) — S33
- [Roots](./roots.md) — S32

### VI · Errors & authorization

- [Errors](./errors.md) — S34
- [Authorization](./authorization.md) — S35–S37

### VII · Extensions

- [Tasks](./tasks.md) — S39–S40
- [MCP Apps (UI)](./apps.md) — S41–S42

### VIII · Governance

- [Feature Lifecycle](./lifecycle.md) — S43
- [Security](./security.md) — S44
- [Conformance](./conformance.md) — S45
- [Registries](./registries.md) — S46
