[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCacheHintValid

# Function: isCacheHintValid()

> **isCacheHintValid**(`ttlMs`, `cacheScope`): `boolean`

Defined in: [protocol/caching.ts:89](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/caching.ts#L89)

Returns `true` when BOTH caching hint fields are present and valid.
(R-13.1-a, R-13.1-b, R-13.1-d)

A receiver MUST NOT treat a result as cacheable when `ttlMs` is negative,
non-integer, or missing, and MUST treat `cacheScope` as `"private"` when
the value is unrecognized or missing. (R-13.1-b, R-13.1-e)

## Parameters

### ttlMs

`unknown`

The raw value of the `ttlMs` field from the result.

### cacheScope

`unknown`

The raw value of the `cacheScope` field from the result.

## Returns

`boolean`
