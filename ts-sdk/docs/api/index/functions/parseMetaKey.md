[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseMetaKey

# Function: parseMetaKey()

> **parseMetaKey**(`key`): [`ParsedMetaKey`](../interfaces/ParsedMetaKey.md)

Defined in: [json/meta-key.ts:82](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/meta-key.ts#L82)

Splits a `_meta` key into its prefix (if any) and name.
The prefix includes the trailing slash; the name is everything after it.

## Parameters

### key

`string`

## Returns

[`ParsedMetaKey`](../interfaces/ParsedMetaKey.md)
