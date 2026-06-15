[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isReservedExtensionPrefix

# Function: isReservedExtensionPrefix()

> **isReservedExtensionPrefix**(`prefix`): `boolean`

Defined in: [protocol/extensions.ts:124](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L124)

Returns `true` when `prefix` is reserved for official MCP use — i.e. its
SECOND label is `modelcontextprotocol` or `mcp`. (R-6.5-g)

A prefix is NOT reserved merely because those tokens appear as some other
label: `com.example.mcp` is not reserved (its second label is `example`),
whereas `io.modelcontextprotocol`, `dev.mcp`, `org.modelcontextprotocol.api`,
and `com.mcp` are all reserved.

## Parameters

### prefix

`string`

## Returns

`boolean`
