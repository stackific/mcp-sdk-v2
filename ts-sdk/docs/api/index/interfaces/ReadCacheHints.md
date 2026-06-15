[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ReadCacheHints

# Interface: ReadCacheHints

Defined in: [protocol/resources-read.ts:358](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L358)

The REQUIRED caching hints every read result carries together. (§13, R-17.5-r)

## Properties

### ttlMs

> **ttlMs**: `number`

Defined in: [protocol/resources-read.ts:360](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L360)

REQUIRED non-negative cache time-to-live in milliseconds. (R-17.5-r)

***

### cacheScope

> **cacheScope**: `"public"` \| `"private"`

Defined in: [protocol/resources-read.ts:362](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L362)

REQUIRED cache-sharing scope. (R-17.5-r)
