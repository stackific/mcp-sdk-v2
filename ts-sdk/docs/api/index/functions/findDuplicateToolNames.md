[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / findDuplicateToolNames

# Function: findDuplicateToolNames()

> **findDuplicateToolNames**(`tools`): `string`[]

Defined in: [protocol/tools.ts:616](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L616)

Returns the names that occur more than once across `tools`. Tool names SHOULD
be unique within a single server; a client/proxy aggregating tools from
multiple servers MAY encounter collisions. (R-16.3-f, R-16.3-g)

## Parameters

### tools

readonly `object`[]

## Returns

`string`[]
