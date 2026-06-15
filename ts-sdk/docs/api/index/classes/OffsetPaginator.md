[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / OffsetPaginator

# Class: OffsetPaginator\<T\>

Defined in: [protocol/pagination.ts:172](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L172)

Reference implementation of a cursor-based paginator over an in-memory array.

Cursors are deterministic decimal offset strings — the same position always
yields the same cursor token (RC-2: stability). An unrecognized or malformed
cursor is returned as a structured error rather than thrown (RC-3, RC-4).

## Type Parameters

### T

`T`

## Constructors

### Constructor

> **new OffsetPaginator**\<`T`\>(`items`, `pageSize?`): `OffsetPaginator`\<`T`\>

Defined in: [protocol/pagination.ts:176](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L176)

#### Parameters

##### items

readonly `T`[]

##### pageSize?

`number` = `20`

#### Returns

`OffsetPaginator`\<`T`\>

## Properties

### pageSize

> `readonly` **pageSize**: `number`

Defined in: [protocol/pagination.ts:174](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L174)

Items returned per page.

## Methods

### getPage()

> **getPage**(`cursor`): [`PaginatorPageResult`](../type-aliases/PaginatorPageResult.md)\<`T`\>

Defined in: [protocol/pagination.ts:193](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L193)

Returns a page of items for the given cursor.

- Absent cursor (`undefined`) → first page. (R-12.2-b)
- Present cursor → page starting at the encoded offset. (R-12.2-a)
- Unrecognized cursor → `{ ok: false, error }` — never throws. (RC-3, RC-4)

#### Parameters

##### cursor

`string` \| `undefined`

#### Returns

[`PaginatorPageResult`](../type-aliases/PaginatorPageResult.md)\<`T`\>
