[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveHasMore

# Function: resolveHasMore()

> **resolveHasMore**(`completion`): `boolean`

Defined in: [protocol/completion.ts:444](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L444)

Resolves the `hasMore` truncation hint of a received `completion` object,
treating an absent (or non-boolean) value as `false`. (R-19.4-i, AC-29.17)

## Parameters

### completion

The raw `completion` object received on the wire.

#### hasMore?

`unknown`

## Returns

`boolean`
