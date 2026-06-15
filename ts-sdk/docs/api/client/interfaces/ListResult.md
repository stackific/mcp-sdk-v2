[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / ListResult

# Interface: ListResult

Defined in: client/client.ts:118

A paginated list result: a method-specific item array plus an optional `nextCursor`. (§12.2)

## Indexable

> \[`key`: `string`\]: `unknown`

The page array lives under a method-specific key (`tools`, `resources`, `prompts`, …).

## Properties

### nextCursor?

> `optional` **nextCursor?**: `string`

Defined in: client/client.ts:122

Opaque cursor for the next page; absent at the end.
