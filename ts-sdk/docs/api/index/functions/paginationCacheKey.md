[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / paginationCacheKey

# Function: paginationCacheKey()

> **paginationCacheKey**(`method`, `cursor`): `string`

Defined in: [protocol/pagination.ts:146](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/pagination.ts#L146)

Produces a cache entry key for a paginated request.

Each page of a paginated result is an independent cacheable response keyed
by the request that produced it (including the `cursor` value). A cached page
for one `cursor` value MUST NOT be served as the response for a request bearing
a different `cursor` value (including the first-page request, which omits
`cursor`). (R-12.5-a, R-13.5-i)

Callers may use this to implement per-page cache entries or to verify that
two requests do NOT share a cache entry.

## Parameters

### method

`string`

### cursor

`string` \| `undefined`

## Returns

`string`
