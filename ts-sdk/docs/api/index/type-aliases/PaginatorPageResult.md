[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PaginatorPageResult

# Type Alias: PaginatorPageResult\<T\>

> **PaginatorPageResult**\<`T`\> = \{ `ok`: `true`; `items`: `ReadonlyArray`\<`T`\>; `nextCursor`: `string` \| `undefined`; \} \| \{ `ok`: `false`; `error`: `ReturnType`\<*typeof* [`buildInvalidCursorError`](../functions/buildInvalidCursorError.md)\>; \}

Defined in: [protocol/pagination.ts:161](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L161)

Discriminated result from `OffsetPaginator.getPage`.

On success (`ok: true`): the page items and an optional next cursor.
On failure (`ok: false`): a structured error from `buildInvalidCursorError` —
  the paginator never throws on unrecognized cursors. (RC-3, RC-4)

## Type Parameters

### T

`T`
