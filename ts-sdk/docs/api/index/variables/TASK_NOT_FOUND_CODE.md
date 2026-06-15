[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TASK\_NOT\_FOUND\_CODE

# Variable: TASK\_NOT\_FOUND\_CODE

> `const` **TASK\_NOT\_FOUND\_CODE**: `-32602` = `INVALID_PARAMS_CODE`

Defined in: [protocol/tasks.ts:674](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L674)

The §22 error code a server uses to answer a query (`tasks/get`/`update`/
`cancel`) for a `taskId` that is unknown — including one whose non-null `ttlMs`
elapsed and was discarded. (§25.4, §25.6, R-25.4-c, R-25.6-g)

Per §25.7 (R-25.7, line 7430) a `tasks/get` for a `taskId` not known to the
server — including one that never existed and one that expired and was
removed — MUST carry JSON-RPC `code: -32602` (Invalid params), the canonical
§22.4 not-found condition. (The legacy `-32002` resource literal is NOT in the
§22 registry and is not used here.)
