[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListToolsResultConfig

# Interface: ListToolsResultConfig

Defined in: [protocol/tools.ts:721](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L721)

The server-supplied inputs to a `ListToolsResult`.

## Properties

### tools

> **tools**: readonly `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[]

Defined in: [protocol/tools.ts:723](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L723)

The page of tools to return (REQUIRED; MAY be empty). (R-16.2-b, R-16.1-g)

***

### ttlMs

> **ttlMs**: `number`

Defined in: [protocol/tools.ts:725](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L725)

Non-negative cache-freshness hint in ms. (R-16.2-g)

***

### cacheScope

> **cacheScope**: `"public"` \| `"private"`

Defined in: [protocol/tools.ts:727](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L727)

Cache-sharing scope. (R-16.2-j)

***

### nextCursor?

> `optional` **nextCursor?**: `string`

Defined in: [protocol/tools.ts:729](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L729)

OPTIONAL opaque next-page cursor; omit on the final page. (R-16.2-c)

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/tools.ts:731](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L731)

OPTIONAL reserved metadata map. (R-16.2-n)
