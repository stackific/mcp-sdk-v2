[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CursorValidation

# Type Alias: CursorValidation

> **CursorValidation** = \{ `ok`: `true`; `cursor`: `string`; \} \| \{ `ok`: `false`; `error`: `ReturnType`\<*typeof* [`buildInvalidCursorError`](../functions/buildInvalidCursorError.md)\>; \}

Defined in: [protocol/security.ts:1435](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1435)

Outcome of [validatePaginationCursor](../functions/validatePaginationCursor.md).
