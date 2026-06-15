[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCursorPresent

# Function: isCursorPresent()

> **isCursorPresent**(`cursor`): `boolean`

Defined in: [protocol/pagination.ts:106](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L106)

Returns `true` when `cursor` is a present value (including the empty string).

A client MUST treat a present `nextCursor` — even `""` — as a cursor to
echo back on the next request. Only `undefined` signals "no cursor". (R-12.1-a)

## Parameters

### cursor

`string` \| `undefined`

## Returns

`boolean`
