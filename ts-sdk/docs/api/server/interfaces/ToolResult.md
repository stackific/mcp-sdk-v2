[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / ToolResult

# Interface: ToolResult

Defined in: server/server.ts:72

A tool result (standard MCP shape). `isError: true` reports a TOOL failure, not a protocol error.

## Properties

### content?

> `optional` **content?**: `unknown`[]

Defined in: server/server.ts:73

***

### structuredContent?

> `optional` **structuredContent?**: `unknown`

Defined in: server/server.ts:74

***

### isError?

> `optional` **isError?**: `boolean`

Defined in: server/server.ts:75

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: server/server.ts:76

***

### task?

> `optional` **task?**: `unknown`

Defined in: server/server.ts:78

Present when a task-augmented call returns a handle instead of a result.
