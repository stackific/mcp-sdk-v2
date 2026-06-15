[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildErrorObject

# Function: buildErrorObject()

> **buildErrorObject**(`code`, `message?`, `data?`): [`JsonRpcErrorObject`](../interfaces/JsonRpcErrorObject.md)

Defined in: [protocol/errors.ts:450](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L450)

Builds a canonical error object with the authoritative `code`, a
human-readable `message`, and optional `data`. (R-22.1-c, R-22.1-i, R-22.1-k)
When `message` is omitted, the registry's condition name is used (the
registry default), so the resulting object always has a non-empty message.

## Parameters

### code

`number`

### message?

`string`

### data?

`unknown`

## Returns

[`JsonRpcErrorObject`](../interfaces/JsonRpcErrorObject.md)
