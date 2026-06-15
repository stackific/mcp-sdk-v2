[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assembleListRootsResult

# Function: assembleListRootsResult()

> **assembleListRootsResult**(`candidates`): [`RootsAssembly`](../interfaces/RootsAssembly.md)

Defined in: [protocol/roots.ts:487](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L487)

Assembles a `ListRootsResult` a client supplies on retry, enforcing the
client-side consent, scope, and validation obligations. (§21.1.5; AC-32.10,
AC-32.15, AC-32.16)

⚠️ DEPRECATED. From the candidates, a root is INCLUDED only when it is:
  - in-scope — the client intends the server to treat it as in-scope
    (R-21.1.5-g · MUST; AC-32.15), AND
  - consented — the user has consented to exposing it (R-21.1.5-h · SHOULD;
    AC-32.15), AND
  - URI-valid — its `uri` is a valid `file://` URI (R-21.1.5-b, -d), AND
  - traversal-safe — its `uri` shows no path-traversal artifacts
    (R-21.1.5-i · SHOULD; AC-32.16).

Every excluded candidate is reported with its reason. When NO candidate
qualifies, the result is the conformant empty listing `{ roots: [] }`.
(R-21.1.5-a; AC-32.10)

## Parameters

### candidates

readonly [`RootCandidate`](../interfaces/RootCandidate.md)[]

The roots the client is considering exposing.

## Returns

[`RootsAssembly`](../interfaces/RootsAssembly.md)
