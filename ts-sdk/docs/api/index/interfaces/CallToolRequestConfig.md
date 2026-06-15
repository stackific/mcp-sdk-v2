[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CallToolRequestConfig

# Interface: CallToolRequestConfig

Defined in: [protocol/tools-call.ts:132](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L132)

The caller-supplied inputs to a first-issue `tools/call` request.

## Properties

### name

> **name**: `string`

Defined in: [protocol/tools-call.ts:134](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L134)

REQUIRED tool name to invoke. (R-16.5-a)

***

### arguments?

> `optional` **arguments?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/tools-call.ts:136](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L136)

OPTIONAL arguments object; omit for a no-argument call (server treats as `{}`). (R-16.5-c)

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/tools-call.ts:138](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L138)

OPTIONAL additional `_meta` members (e.g. a `progressToken`). (R-16.5-k)
