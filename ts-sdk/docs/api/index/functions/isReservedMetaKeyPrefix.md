[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isReservedMetaKeyPrefix

# Function: isReservedMetaKeyPrefix()

> **isReservedMetaKeyPrefix**(`prefix`): `boolean`

Defined in: [json/meta-key.ts:54](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/meta-key.ts#L54)

Returns `true` when `prefix` is reserved (its second label is
`modelcontextprotocol` or `mcp`). (R-2.6.2-f, AC-02.17)

Implementations MUST NOT define `_meta` keys under a reserved prefix
except as specified by this document or an MCP-published extension.

## Parameters

### prefix

`string`

## Returns

`boolean`
