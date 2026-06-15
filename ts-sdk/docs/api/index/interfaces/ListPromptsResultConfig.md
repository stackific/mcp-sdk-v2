[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ListPromptsResultConfig

# Interface: ListPromptsResultConfig

Defined in: [protocol/prompts.ts:342](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L342)

The server-supplied inputs to a `ListPromptsResult`.

## Properties

### prompts

> **prompts**: readonly `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[]

Defined in: [protocol/prompts.ts:344](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L344)

The prompts on this page; MAY be empty. (R-18.2-d)

***

### nextCursor?

> `optional` **nextCursor?**: `string`

Defined in: [protocol/prompts.ts:346](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L346)

OPTIONAL opaque next-page token. (R-18.2-e)

***

### ttlMs

> **ttlMs**: `number`

Defined in: [protocol/prompts.ts:348](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L348)

REQUIRED cache freshness hint in ms, minimum 0. (R-18.2-h)

***

### cacheScope

> **cacheScope**: `"public"` \| `"private"`

Defined in: [protocol/prompts.ts:350](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L350)

REQUIRED cache-sharing scope. (R-18.2-l)

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/prompts.ts:352](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L352)

OPTIONAL reserved metadata map. (R-18.2-q)
