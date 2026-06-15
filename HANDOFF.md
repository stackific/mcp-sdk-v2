# Handoff — MCP TS SDK + companion app

This is a self-contained handoff so a fresh agent can continue **without prior chat
context**. It describes the project, everything completed, and the precise
outstanding work with file pointers.

> **Hard rules (must follow):** 2-space indentation everywhere. Idiomatic, modern
> TypeScript. The SDK is built **from the spec** at
> `/Users/t/work/projects/mcp-sdk/model-context-protocol-specification.md` (revision
> **2026-07-28**, stateless) — never mirror sibling SDKs. `pnpm` is the package
> manager. Inline JSDoc on public surfaces. **No AI authorship attribution** in any
> artifact (commits, comments, docs).

## Layout (`/Users/t/work/projects/mcp-sdk/story_mapped/ts`)

- `mcp-sdk-ts/` — the SDK (`@stackific/mcp-sdk-ts`). Spec-conformant, edge-friendly.
- `backend/` — `@hono-mcp/backend`, the companion's MCP **client host** (Hono, :8002). Uses the SDK client.
- `frontend/` — `@hono-mcp/frontend`, the SPA (Vite/React, :8000). Talks only to the backend.
- `mcp-server/` — `@hono-mcp/mcp-server`, the reference MCP **server** (Hono, :8001 + OAuth AS :8003), built on the SDK's server runtime. Optional/deletable; NOT a workspace member.
- Reference (read-only, original alpha-based companion): `/Users/t/work/projects/mcp-sdk/mcp-client_story_mapped/mcp-server` — `index.ts` + `auth.ts` + `apps/counter-app.html`. The current `mcp-server` was reconstructed from it onto the SDK.
- Graded conformance reports: `/Users/t/work/projects/mcp-sdk/graded_reports/node` (the 9 that flagged issues; all fixed — see below).

### Ports (8000-series — avoids macOS AirPlay on :5000/:7000)
frontend **8000**, mcp-server **8001**, backend **8002**, OAuth AS **8003**. Config: `backend/.env`, `frontend/.env` (`VITE_BACKEND_URL=http://localhost:8002`), `mcp-server/src/index.ts` (`MCP_PORT`/`AUTH_PORT`), `scripts/stop-ports.mjs`, `frontend/vite.config.ts` (`host: true`, `port: 8000`).

### Build / test / run
```bash
cd /Users/t/work/projects/mcp-sdk/story_mapped/ts
pnpm install                 # links the SDK (file:) into backend; postinstall installs mcp-sdk-ts + mcp-server standalone
pnpm dev                     # backend :8002 + frontend :8000 + mcp-server :8001/:8003 (dev.mjs; skips mcp-server if absent)
# SDK:
cd mcp-sdk-ts && npx tsc --noEmit && npx vitest run && npx tsc && npx typedoc
# Backend tests: cd backend && npx vitest run
```
The `~/.dotnet` note from the C# sibling is irrelevant here (pure Node/TS).

## SDK architecture (what exists)

Entry points (`mcp-sdk-ts/package.json` `exports`), each verified **edge-safe** (no `node:*`) except the root and `./server/node`:
- `.` — all protocol primitives + client + (NOT server; avoids name collisions). Root re-exports stdio + authorization-flow which use `node:*`, so it is **not** edge-safe — that's why the subpaths exist.
- `./client` — `Client`, `StreamableHTTPClientTransport`, OAuth helpers, retry transport. **Edge-safe** (16-file graph, dep `zod`).
- `./server` — `McpServer`, `createMcpRequestHandler` (Web `fetch` handler), `toHonoMcpHandler`, `InMemoryTaskStore`, `bearerAuthGate`, `withCacheHints`, `uiResource/uiToolResult`, `serveStdio`, MRTR builders. **Edge-safe** (28-file graph, deps `zod`+`ajv`).
- `./server/node` — `createNodeHttpHandler` (Node `node:http` adapter; type-only `node:` import).
- `./testing` — `connectInMemory` in-memory Client↔McpServer harness. **Edge-safe.**

Edge-safety is a HARD invariant for `./client`, `./server`, `./testing`. Verify after changes with this graph scan (no `node:` allowed):
```bash
cd mcp-sdk-ts && node -e 'const fs=require("fs"),path=require("path");const root=path.join(process.cwd(),"src");const seen=new Set(),n=[];const re=/(?:from|import)\s*["\x27]([^"\x27]+)["\x27]/g;function r(s,f){if(s.startsWith("node:")){n.push(s);return null}if(!s.startsWith("."))return null;let p=path.resolve(path.dirname(f),s);if(p.endsWith(".js"))p=p.slice(0,-3)+".ts";if(!p.endsWith(".ts"))p+=".ts";return p}function w(f){if(seen.has(f))return;seen.add(f);let s;try{s=fs.readFileSync(f,"utf8")}catch{return}let m;while(m=re.exec(s)){const x=r(m[1],f);if(x)w(x)}}for(const e of ["client","server","testing"]){seen.clear();n.length=0;w(path.join(root,e,"index.ts"));console.log(e,seen.size,"files; node:",n.length)}'
```

Status: SDK `tsc` clean; **vitest 2938 passing (73 files)**; `pnpm docs` (TypeDoc + markdown plugin) emits GitHub-viewable docs to `mcp-sdk-ts/docs/api/` (entry points: client, server, server/node, index — `typedoc.json`).

## Done this session (high level)

- **Client runtime** (`src/client/`): `Client` host (`_meta` envelope, id correlation, server→client request/notification routing, progress, cancellation, timeouts, `discover()`+negotiation) + `StreamableHTTPClientTransport` (POST + single-JSON/SSE, bearer auth).
- **Server runtime** (`src/server/`): `McpServer` dispatcher + registration API, Web-standard `createMcpRequestHandler`, Node + Hono adapters.
- **Conformance fixes** — the 9 flagged graded reports are fixed in the SDK (S16 subscription teardown signal, S17 MRTR dup-key/gating/undeclared-kind, S20 secure `fetchIcon`, S23 trace-context opacity, S29 completion debounce, S35 canonical-id slash, S39 task `-32602`, S43 `@deprecated` tags, S44 PKCE confirmation). All have tests.
- **Renames**: `mcp-sdk-node→mcp-sdk-ts`, `story_mapped/node→story_mapped/ts`, ports → 8000-series.
- **Companion**: backend rewired off the alpha `@modelcontextprotocol/client` onto the SDK; `mcp-server` rebuilt on the SDK server runtime (Hono) with full 17-tool parity + OAuth AS (`whoami`/`get_secret`); reconnect + `/foundations` live-wire fixes; `listChanged` capabilities; deprecated-feature badges (Roots/Sampling/Logging); sidebar dark/light theme toggle.
- **Proposal** (`mcp-sdk-ts/docs/PROPOSAL-higher-level-layer.md`) — implemented: **C1, C2, C3, C4, C5, C7, C8, C9** (client); **S1, S2, S4, S5, S6, S7, S8** (server); **SH2** (in-memory test-kit); **S3 server-side subscriptions**.

## OUTSTANDING WORK (pick up here)

Task IDs map to the in-app task list. Do them roughly in this order.

### 1. C6 — client `subscribe()` (the only unfinished proposal feature)  [task #20]
Server side (S3) is **done** in `src/server/streamable-http.ts`: `subscriptions/listen` opens an SSE stream, writes the `notifications/subscriptions/acknowledged` ack, keeps the stream open, fans change notifications out via `ctx.notifySubscribers(...)` (filtered by each `Subscription.mayEmit`, tagged with `io.modelcontextprotocol/subscriptionId`), and tears down on `notifications/cancelled` referencing the listen id (closing the SSE). `ToolContext.notifySubscribers` is wired (`src/server/server.ts`).

**TODO — client `subscribe()` in `src/client/client.ts`:**
- Add `subscribe(filter, onNotification, options?)`: send a `subscriptions/listen` request (use `nextId()`; build the `_meta` envelope like `request()`), but **do not await the final response** (the stream stays open). Compute the expected `subscriptionId` via `subscriptionIdFromRequestId(listenId)` from `../protocol/streaming.js`.
- In `handleInbound`'s notification branch: route `notifications/subscriptions/acknowledged` (resolve the pending subscribe; read `subscriptionId` from `params._meta`) and route any notification carrying `_meta.subscriptionId` (use `readSubscriptionId`) to the matching subscription's `onNotification`. Keep existing progress/notification-handler routing.
- Return a handle `{ subscriptionId, acknowledgedFilter, closed: Promise<void>, unsubscribe(): Promise<void> }`. `closed` resolves when the correlator's final response/close for the listen id arrives. `unsubscribe()` sends `notifications/cancelled {requestId: listenId}` and `correlator.fail(listenId, …)`.
- Export any new types from `src/client/index.ts`.
- **Tests** (`src/__tests__/client/subscriptions.test.ts`): e2e via a fake `fetch` bridged to `createMcpRequestHandler` (see `src/__tests__/server/server-runtime.test.ts` for the bridge pattern) OR via the in-memory test-kit — note `serveStdio` does NOT implement subscriptions (HTTP-handler only), so the fake-fetch→`createMcpRequestHandler` bridge is the right harness. Verify: subscribe→ack→a tool that calls `ctx.notifySubscribers` delivers a filtered notification→`unsubscribe`.
- Mark task #20 complete when client + tests are in.

### 2. SH1 — typed result schemas  [task #25, SH2 already done]
Light item. Surface Zod-inferred result types as the return types of the C1 convenience methods (`listTools`→`{tools: Tool[]}`, etc.) by importing the result schemas/types from the protocol layer (e.g. `protocol/tools.ts`, `resources-read.ts`, `prompts.ts`, `completion.ts`). Currently they return `ListResult`/`Record<string,unknown>`. Keep it ergonomic; don't break existing callers. Mark #25 done.

### 3. Wire the proposal into the companion  [task #26]
Make the companion **use** the SDK higher-level layer (not hand-rolled code):
- `mcp-server/src/features.ts`: replace the local `CompanionTaskStore` with the SDK `InMemoryTaskStore` (from `@stackific/mcp-sdk-ts/server`); use `withCacheHints` for `cached_quote`; use `uiToolResult` for `open_counter_app`; for `mutate_catalog` emit change notifications via `ctx.notifySubscribers(...)` (so the Subscriptions page works end-to-end). Pagination (S1) is already in `McpServer` — optionally set a `pageSize`.
- `mcp-server/src/auth.ts`: optionally replace the bespoke gate with `bearerAuthGate` + `buildProtectedResourceMetadata` (from `@stackific/mcp-sdk-ts/server`).
- `backend/src/mcp-client.ts`: the `api` object can use the SDK client's typed methods (`client.listTools()`, `client.callTool(...)`, `client.createTask/getTask/...`, `client.serverSupports(...)`) instead of raw `client.request({method})`. Optional: an `api`/route for `client.subscribe(...)` to drive the Subscriptions page.
- `backend/src/auth-flow.ts`: optionally use the SDK OAuth client (`discoverOAuthMetadata`/`registerClient`/`buildAuthorizeUrl`/`exchangeAuthorizationCode`/`createAuthProvider` from `@stackific/mcp-sdk-ts/client`) instead of hand-rolling the flow.
- After SDK source changes, rebuild dist: `cd mcp-sdk-ts && npx tsc`; then `pnpm --dir mcp-server install --ignore-workspace` is not needed (file: link), but the running `tsx watch` reloads. Verify end-to-end (see "Verify live" below).

### 4. Correctness sweep — stale alpha / 2025-11-25 / session text  [task #27]
The companion still has UI/docs text describing the **alpha SDK negotiating 2025-11-25 / session-based**, which is now false (it runs the stateless 2026-07-28 SDK; `server/discover` works; no `Mcp-Session-Id`). Fix the factual claims in: `frontend/src/routes/{overview,subscriptions,errors,transport}.tsx`, `README.md`, `MCP_SERVER_REQUIREMENTS.md`, `CONNECT_YOUR_SERVER.md`. Example: `overview.tsx` says "the alpha client … negotiates 2025-11-25" and `errors.tsx`/`subscriptions.tsx` say "-32601 on the alpha" — re-word to reflect the SDK's actual behavior. Find them: `grep -rniE "alpha|2025-11-25|@modelcontextprotocol|session-based|mcp-session-id" frontend/src *.md` (excluding `mcp-sdk-ts`).

### 5. Finalize  [task #28]
- Run the SDK conformance suite + all tests green; re-run the edge-safety graph scan; rebuild dist; `pnpm docs` to regenerate `docs/api/`.
- Backend + frontend + mcp-server `tsc --noEmit` clean.
- **Then delete the proposal**: `rm mcp-sdk-ts/docs/PROPOSAL-higher-level-layer.md` (the user asked for this once everything is implemented — do it as the LAST step). The README "API reference" section + this handoff capture the layer.

### Optional / noted
- **Full light theme**: the toggle (`frontend/src/components/app-layout.tsx`) flips the `dark` class + persists, but components use fixed `slate` colors (not `dark:` variants), so light mode changes little visually. A real light theme = a styling pass across components (out of scope unless asked).
- **S43-RC-7** (runtime deprecation warning when a deprecated feature is *accepted*) was the one Recommended conformance item left as a deliberate partial; the `@deprecated` tags + `emitDeprecationWarning` helper exist but call sites weren't wired.

## Verify live (companion)
```bash
cd /Users/t/work/projects/mcp-sdk/story_mapped/ts
node scripts/stop-ports.mjs && (pnpm --dir mcp-server start &) && (pnpm --filter @hono-mcp/backend start &) ; sleep 5
curl -s -X POST http://localhost:8002/api/connect      # → connected, negotiated 2026-07-28
curl -s http://localhost:8002/api/tools                # → 17 tools
curl -s -X POST http://localhost:8002/api/tools/call -H 'content-type: application/json' -d '{"name":"add","arguments":{"a":2,"b":3}}'
node scripts/stop-ports.mjs
```
Browser: `http://localhost:8000` (disable macOS AirPlay Receiver if :8000-adjacent conflicts arise; AirPlay squats :5000/:7000, which is why we moved to 8000-series).

## Gotchas
- `tsconfig` has `noUncheckedIndexedAccess` (handle `arr[i]` possibly-undefined) but NOT `noUnusedLocals`.
- `Date.now()`/`new Date()`/`Math.random()` are fine in SDK runtime code (Node + Workers) — only banned inside Workflow scripts (N/A here). `InMemoryTaskStore` accepts an injected `now` for deterministic tests.
- The SDK root export collides on common names if you `export *` server from it — keep server out of the root barrel (only `./server`). Watch for duplicate type names across `protocol/index` and new modules (we hit `TokenResponse` → renamed to `OAuthTokenResponse`).
- `mcp-server` is NOT a workspace member (installed standalone by `scripts/install-extras.mjs`, guarded for absence); deleting it must not break `pnpm install`.
