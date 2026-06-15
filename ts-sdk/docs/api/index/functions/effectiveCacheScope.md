[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / effectiveCacheScope

# Function: effectiveCacheScope()

> **effectiveCacheScope**(`scopes`): `"public"` \| `"private"`

Defined in: [protocol/caching.ts:177](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L177)

Given the `cacheScope` values observed across a multi-page list, returns the
effective scope to apply. If inconsistent, returns `"private"`. (R-13.5-h)

## Parameters

### scopes

readonly `string`[]

## Returns

`"public"` \| `"private"`
