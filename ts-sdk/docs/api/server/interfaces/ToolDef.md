[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / ToolDef

# Interface: ToolDef

Defined in: server/server.ts:119

## Properties

### title?

> `optional` **title?**: `string`

Defined in: server/server.ts:120

***

### description?

> `optional` **description?**: `string`

Defined in: server/server.ts:121

***

### inputSchema?

> `optional` **inputSchema?**: `Record`\<`string`, `unknown`\>

Defined in: server/server.ts:123

JSON Schema (2020-12) for `arguments`; validated by the SDK value validator.

***

### outputSchema?

> `optional` **outputSchema?**: `Record`\<`string`, `unknown`\>

Defined in: server/server.ts:124

***

### annotations?

> `optional` **annotations?**: `Record`\<`string`, `unknown`\>

Defined in: server/server.ts:125

***

### execution?

> `optional` **execution?**: `object`

Defined in: server/server.ts:127

Task-augmented tool: `{ taskSupport: 'required' | 'optional' }`.

#### taskSupport

> **taskSupport**: `"required"` \| `"optional"`
