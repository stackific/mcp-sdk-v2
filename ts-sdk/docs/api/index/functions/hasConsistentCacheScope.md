[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasConsistentCacheScope

# Function: hasConsistentCacheScope()

> **hasConsistentCacheScope**(`scopes`): `boolean`

Defined in: [protocol/caching.ts:167](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L167)

Returns `true` when all `cacheScope` values across the pages of one logical
list are identical (no mixing of `"public"` and `"private"`). (R-13.5-f, R-13.5-g)

A server MUST NOT mix `"public"` and `"private"` across pages. When a client
observes inconsistency it MUST treat the entire list as `"private"`. (R-13.5-h)

## Parameters

### scopes

readonly `string`[]

## Returns

`boolean`
