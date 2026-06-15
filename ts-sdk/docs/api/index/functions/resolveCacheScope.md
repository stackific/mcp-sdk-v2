[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveCacheScope

# Function: resolveCacheScope()

> **resolveCacheScope**(`scope`): `"public"` \| `"private"`

Defined in: [protocol/caching.ts:121](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L121)

Returns `"public"` or `"private"`, applying the privacy fallback for any
unrecognized or absent value. (R-13.1-e, R-13.3-h)

A receiver that cannot reliably distinguish authorization contexts MUST treat
every cached result as `"private"`.

## Parameters

### scope

`unknown`

## Returns

`"public"` \| `"private"`
