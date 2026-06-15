[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompleteResultConfig

# Interface: CompleteResultConfig

Defined in: [protocol/completion.ts:449](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L449)

The server-supplied inputs to a [CompleteResult](../type-aliases/CompleteResult.md).

## Properties

### values

> **values**: readonly `string`[]

Defined in: [protocol/completion.ts:451](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L451)

REQUIRED ranked candidate values, most relevant first; capped at 100. (R-19.4-b)

***

### total?

> `optional` **total?**: `number`

Defined in: [protocol/completion.ts:453](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L453)

OPTIONAL total matching options; MAY exceed `values.length`. (R-19.4-h)

***

### hasMore?

> `optional` **hasMore?**: `boolean`

Defined in: [protocol/completion.ts:455](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L455)

OPTIONAL truncation hint; included only when supplied. (R-19.4-e)

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/completion.ts:457](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L457)

OPTIONAL reserved result metadata map.
