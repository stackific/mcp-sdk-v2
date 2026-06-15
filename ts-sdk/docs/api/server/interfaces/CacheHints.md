[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / CacheHints

# Interface: CacheHints

Defined in: server/caching.ts:15

Top-level caching hints on a cacheable result. (§13.1–§13.4)

## Properties

### ttlMs?

> `optional` **ttlMs?**: `number`

Defined in: server/caching.ts:17

Freshness lifetime in ms; a client MAY reuse the cached result within it. (§13.2)

***

### cacheScope?

> `optional` **cacheScope?**: `"public"` \| `"private"`

Defined in: server/caching.ts:19

Cache-sharing scope — exactly `"public"` or `"private"`. (§13.3)
