[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / HttpRevisionCheckResult

# Type Alias: HttpRevisionCheckResult

> **HttpRevisionCheckResult** = \{ `ok`: `true`; \} \| \{ `ok`: `false`; `status`: *typeof* [`HTTP_REVISION_MISMATCH_STATUS`](../variables/HTTP_REVISION_MISMATCH_STATUS.md); `message`: `string`; \}

Defined in: [protocol/revision.ts:55](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/revision.ts#L55)

Outcome of `checkHttpRevisionHeader`.
