[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / schemaDialect

# Function: schemaDialect()

> **schemaDialect**(`schema`): `string`

Defined in: [protocol/tools.ts:177](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L177)

Returns the dialect that governs a schema document: the explicit `$schema`
keyword when present, otherwise the default 2020-12 dialect. A document MAY
declare a different dialect; when present, that dialect governs interpretation.
(§16.4(1), R-16.4-a, R-16.4-b)

## Parameters

### schema

`Record`\<`string`, `unknown`\>

## Returns

`string`
