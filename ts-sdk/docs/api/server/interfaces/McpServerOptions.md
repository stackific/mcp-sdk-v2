[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / McpServerOptions

# Interface: McpServerOptions

Defined in: server/server.ts:190

Options for [McpServer](../classes/McpServer.md).

## Properties

### pageSize?

> `optional` **pageSize?**: `number`

Defined in: server/server.ts:192

Max items per page for the list methods (tools/resources/prompts). Default 50. (§12)

***

### cacheTtlMs?

> `optional` **cacheTtlMs?**: `number`

Defined in: server/server.ts:198

Default freshness hint (ms) stamped as the top-level `ttlMs` on the five
cacheable-method results (§13.4); default `0` (a non-caching server still
MUST emit the field). (R-13.4-b)

***

### cacheScope?

> `optional` **cacheScope?**: `"public"` \| `"private"`

Defined in: server/server.ts:200

Default top-level `cacheScope` for cacheable results; default `'private'`. (§13.3)
