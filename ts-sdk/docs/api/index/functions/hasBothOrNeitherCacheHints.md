[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasBothOrNeitherCacheHints

# Function: hasBothOrNeitherCacheHints()

> **hasBothOrNeitherCacheHints**(`result`): `boolean`

Defined in: [protocol/caching.ts:106](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L106)

Returns `true` when a result object carries BOTH caching-hint fields (or
neither). A server MUST NOT emit exactly one without the other. (R-13.1-g)

Pass a raw result object; this is a conformance check on server output.

## Parameters

### result

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
