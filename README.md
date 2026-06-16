# MCP V2 — Live Companion (multi-language, story-mapped)

A runnable companion to the **MCP V2 RC specification**. The shared frontend can be backed by any of
several **language stacks** — pick one on the home page and it repoints at that stack's MCP **client
host** (a different backend + server configuration on its own ports):

| Stack          | Status        | MCP server         | Client host        | OAuth AS |
| -------------- | ------------- | ------------------ | ------------------ | -------- |
| **TypeScript** | ✅ full       | `ts-mcp-server` :8001 | `ts-mcp-client` :8002 | :8003    |
| **Python**     | ✅ full       | `py-mcp-server` :8101 | `py-mcp-client` :8102 | :8103    |
| **C#**         | 🧩 placeholder | `csharp-mcp-server` :8201 | `csharp-mcp-client` :8202 | —    |

The shared **frontend** runs on **:8000**. The **TypeScript** and **Python** stacks are both full
implementations, each on its own home-grown SDK (`ts-sdk` / `py-sdk`): they demonstrate **every** server
and client capability — discovery, tools, resources, resource templates, prompts, completion, logging,
list-changed + resource-updated subscriptions, progress + cooperative cancellation, the multi-round-trip
loop (elicitation form+url, sampling, roots), caching, content blocks, tracing, pagination — plus the
V2 RC extensions (**Tasks**, **Interactive UI / MCP Apps**) and **OAuth 2.1 authorization** (PKCE), all
over **Streamable HTTP only** (single-JSON + lazy-commit SSE), with a live "under the hood" JSON-RPC wire
view on every page. **C#** remains a runnable placeholder. Selecting a language swaps the entire backend
+ server configuration.

> Built on the home-grown `@stackific/mcp-sdk-ts` SDK (in `ts-sdk/`), whose client and server runtimes
> speak the V2 RC revision `2026-07-28` — **stateless and handshake-less** (`server/discover` replaces
> `initialize`; no `Mcp-Session-Id`). The active stack + negotiated version are shown live in the sidebar.

## Repository layout

```
frontend/            Shared Vite + TanStack Router + shadcn-style SPA (:8000) — the language switcher
ts-sdk/              @stackific/mcp-sdk-ts — the MCP SDK (client + server runtimes)
ts-mcp-client/       TypeScript MCP client host (Hono, :8002) — full implementation
ts-mcp-server/       TypeScript reference MCP server + OAuth AS (Hono, :8001 / :8003)
py-sdk/              stackific-mcp — the Python MCP SDK (client + server runtimes), parity port of ts-sdk
py-mcp-client/       Python MCP client host on py-sdk (FastAPI, :8102)
py-mcp-server/       Python reference MCP server on py-sdk (FastAPI, :8101)
csharp-mcp-client/   C# MCP client host placeholder (.NET 10 Minimal API, :8202)
csharp-mcp-server/   C# reference MCP server placeholder (.NET 10 Minimal API, :8201)
Taskfile.yml         The single entrypoint that drives the whole monorepo
```

Inside the TypeScript stack, only `ts-mcp-client/` and `frontend/` are pnpm workspace members; `ts-sdk/`
and `ts-mcp-server/` install standalone (so the SDK link stays explicit and the reference server is
deletable). Nothing in the workspace imports `ts-mcp-server/`.

## Architecture (per language)

```
frontend (shared SPA, :8000)
   │  REST + SSE (the live wire stream) — base URL chosen by the language switch
   ▼
<lang>-mcp-client  ── hosts the MCP *client*, taps every JSON-RPC frame to /debug/stream
   │                  (TypeScript also routes sampling → DeepSeek, Anthropic-compatible)
   ▼ Streamable HTTP
<lang>-mcp-server  +  OAuth AS / protected resource (TypeScript only)
```

## Prerequisites

- [Task](https://taskfile.dev) (`task`) — the monorepo runner
- [pnpm](https://pnpm.io) + Node ≥ 22 — TypeScript stack
- [uv](https://docs.astral.sh/uv/) — Python stack
- [.NET 10 SDK](https://dotnet.microsoft.com/) — C# stack

## Setup & run

```bash
task setup        # install dependencies for every stack (pnpm + uv + dotnet)
task dev          # run the frontend + all stacks; switch languages live in the UI
task stop         # free every dev port
```

Run a single stack instead of everything:

```bash
task dev:ts       # frontend + TypeScript stack
task dev:py       # frontend + Python stack
task dev:csharp   # frontend + C# stack
```

`task` (no args) lists every task. Ports are declared once at the top of `Taskfile.yml` (the single
source of truth) and passed to each process; `task stop` frees exactly that set.

### Sampling (DeepSeek, TypeScript stack)

Sampling routes to **DeepSeek via the Anthropic-compatible endpoint**; without a key it falls back to a
deterministic mock so everything still runs. Set `DEEPSEEK_API_KEY` in `ts-mcp-client/.env`
(`cp ts-mcp-client/.env.example ts-mcp-client/.env`) to use the model.

### Point the TypeScript stack at your own server

The companion is MCP-server-agnostic: any server meeting **`MCP_SERVER_REQUIREMENTS.md`** drives the
whole demo. Set `MCP_SERVER_URL` / `AUTH_SERVER_URL` in `ts-mcp-client/.env`, then `rm -rf ts-mcp-server`
— the workspace install and app are unaffected. Step-by-step wiring + troubleshooting:
**`CONNECT_YOUR_SERVER.md`**.

## What's demonstrated (TypeScript stack)

Every page carries a **Live wire** panel showing the colour-coded JSON-RPC frames as they cross the
transport. The sidebar groups pages by the spec's build-story Parts (I–VIII) and tags each with its
chapter + story id. Coverage spans all 46 stories:

- **I · Foundations** — Overview & Discovery (S07–S09), Protocol Foundations (S01), JSON Value Model (S02),
  JSON-RPC Framing (S03–S04), the \_meta Envelope (S05), Stateless Model (S06), Capabilities (S10),
  Extensions Map (S11·S38)
- **II · Transports** — Transport & HTTP / Streamable HTTP headers & status (S12–S15)
- **III · Interaction & utilities** — Multi-Round-Trip (S17), Pagination (S18), Caching (S19),
  Common Types & Content Blocks (S20–S21), Progress & Cancel (S22), Logging (S23), Tracing (S23),
  Notifications (S16), Subscriptions (S16)
- **IV · Server features** — Tools (S24–S25), Resources (S26–S27), Resource Templates (S26),
  Prompts (S28), Completion (S29)
- **V · Client features (MRTR)** — Elicitation (S30–S31), Sampling (S33), Roots (S32)
- **VI · Errors & authorization** — Errors (S34), Authorization OAuth 2.1 + PKCE (S35–S37)
- **VII · Extensions** — Tasks (S39–S40), MCP Apps / Interactive UI (S41–S42)
- **VIII · Governance** — Feature Lifecycle (S43), Security (S44), Conformance (S45), Registries (S46)

## Build & verify

```bash
task typecheck    # typecheck/compile every stack without emitting
task build        # build/compile every stack
task format       # Prettier across JS/TS/JSON/Markdown
```
