[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListCacheHints

# Interface: ListCacheHints

Defined in: [protocol/resources.ts:522](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L522)

The caching hints every list result must carry (REQUIRED together). (§13, R-17.2-g, R-17.2-h)

## Properties

### ttlMs

> **ttlMs**: `number`

Defined in: [protocol/resources.ts:524](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L524)

REQUIRED non-negative cache time-to-live in milliseconds. (R-17.2-g)

***

### cacheScope

> **cacheScope**: `"public"` \| `"private"`

Defined in: [protocol/resources.ts:526](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L526)

REQUIRED cache-sharing scope. (R-17.2-h)
